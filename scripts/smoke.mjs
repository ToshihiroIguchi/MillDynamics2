// scripts/smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

const distDir = path.resolve('dist');
// 4173 is vite's default preview port, so any other project previewing on this
// machine already owns it. Bind and browse 127.0.0.1 explicitly (not "localhost",
// which Chromium resolves to ::1 first — a foreign server listening on [::1]:4173
// silently served its own page here and the wait for __MILL_APP__ timed out), and
// let SMOKE_PORT move the test out of the way entirely.
const host = '127.0.0.1';
const port = Number(process.env.SMOKE_PORT) || 4173;

// Simple static file server for dist/
function startServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0].split('#')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = path.join(distDir, reqPath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`Smoke server listening on http://${host}:${port}`);
      resolve(server);
    });
  });
}

async function runSmokeTest() {
  // Ensure public/build and dist/ have mill.wasm
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  if (fs.existsSync('assembly/build/mill.wasm')) {
    fs.copyFileSync('assembly/build/mill.wasm', path.join(distDir, 'mill.wasm'));
  }
  if (fs.existsSync('assembly/build/mill.debug.wasm')) {
    fs.copyFileSync('assembly/build/mill.debug.wasm', path.join(distDir, 'mill.debug.wasm'));
  }

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  try {
    console.log(`Navigating to http://${host}:${port}`);
    await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' });

    // Wait for WASM instantiation
    await page.waitForFunction(() => window.__MILL_APP__ && window.__MILL_APP__.wasm !== null, { timeout: 10000 });
    console.log('✓ WebAssembly module instantiated successfully');

    // Step simulation to at least 5 simulated seconds using adaptive/physical time-step
    console.log('Stepping simulation to 5s simulated time...');
    const diagnostics = await page.evaluate(() => {
      const app = window.__MILL_APP__;
      app.isRunning = false;
      const w = app.wasm;
      while (w.getTime() < 5.0) {
        w.step(0.0);
      }
      return {
        time: w.getTime(),
        torque: w.diagTorque(),
        ke: w.diagKineticEnergy(),
        maxVel: w.diagMaxVel(),
        maxDiv: w.diagMaxDiv(),
        yielded: w.diagYieldedFraction(),
        bedArea: w.diagBedArea(),
        lastDt: w.getLastDt()
      };
    });

    console.log('✓ Diagnostics after 5 s simulated time:');
    console.log(`    Time: ${diagnostics.time.toFixed(2)} s (last Δt = ${diagnostics.lastDt.toExponential(2)} s)`);
    console.log(`    Torque: ${diagnostics.torque.toFixed(1)} N*m/m (mesh/dt dependent)`);
    console.log(`    Kinetic Energy: ${diagnostics.ke.toFixed(1)} J/m`);
    console.log(`    Max Velocity: ${diagnostics.maxVel.toFixed(2)} m/s`);
    console.log(`    Max |div(u)|: ${diagnostics.maxDiv.toExponential(2)}`);
    console.log(`    Yielded Fraction: ${(diagnostics.yielded * 100).toFixed(1)}%`);
    console.log(`    Bed Area: ${diagnostics.bedArea.toFixed(4)} m^2`);

    // Assert zero console errors
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected during smoke test: ${consoleErrors.join('; ')}`);
    }
    console.log('✓ Zero console errors verified');

    // Assert finite numbers
    for (const [k, v] of Object.entries(diagnostics)) {
      if (!Number.isFinite(v)) {
        throw new Error(`Diagnostic ${k} is non-finite: ${v}`);
      }
    }
    console.log('✓ All diagnostics are finite (no NaN, no Infinity)');

    // Save screenshot
    const screenshotDir = path.resolve('docs/screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, 'smoke.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`✓ Screenshot saved to ${screenshotPath}`);

    console.log('\n=== SMOKE TEST PASSED ===\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runSmokeTest().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
