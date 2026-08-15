import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

describe('Phase 1c Advection - U8, U9', () => {
  it('U8: Uniform translation - position error < 0.5 dx, MacCormack peak retention > 1st-order SL', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const U0 = 1.0;
    const dt = 0.5 * dx / U0;
    const totalTime = L / U0;
    const steps = Math.round(totalTime / dt);
    const actualDt = totalTime / steps;

    const i0 = 20;
    const j0 = 32;
    const x0 = (i0 + 0.5) * dx;
    const y0 = (j0 + 0.5) * dx;
    const sigma = 0.06 * L;

    function runScheme(useMacCormack: boolean) {
      e.initTestGrid(N, L, 1); // periodic

      const u = view(e.ptrU(), (N + 1) * N);
      const v = view(e.ptrV(), N * (N + 1));
      for (let k = 0; k < (N + 1) * N; k++) u[k] = U0;
      for (let k = 0; k < N * (N + 1); k++) v[k] = 0.0;

      const src = view(e.ptrScalarSrc(), N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * dx;
          const y = (j + 0.5) * dx;
          const d2 = (x - x0) ** 2 + (y - y0) ** 2;
          src[i + j * N] = Math.exp(-d2 / (2 * sigma * sigma));
        }
      }

      for (let step = 0; step < steps; step++) {
        e.opAdvectScalar(actualDt, useMacCormack ? 1 : 0, 1);
        const dst = view(e.ptrScalarDst(), N * N);
        for (let k = 0; k < N * N; k++) {
          src[k] = dst[k];
        }
      }

      let maxVal = 0, maxI = 0, maxJ = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const val = src[i + j * N];
          if (val > maxVal) {
            maxVal = val;
            maxI = i;
            maxJ = j;
          }
        }
      }

      // Center of mass in window around peak
      let sumW = 0, sumWX = 0, sumWY = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const val = src[i + j * N];
          if (val > 0.1 * maxVal) {
            const x = (i + 0.5) * dx;
            const y = (j + 0.5) * dx;
            sumW += val;
            sumWX += val * x;
            sumWY += val * y;
          }
        }
      }
      const peakX = sumWX / sumW;
      const peakY = sumWY / sumW;

      const posErr = Math.sqrt((peakX - x0) ** 2 + (peakY - y0) ** 2);
      return { maxVal, posErr, maxI, maxJ };
    }

    const mc = runScheme(true);
    const sl = runScheme(false);

    console.log(`U8 Translation (N=${N}, steps=${steps}):`);
    console.log(`  MacCormack: peak retention = ${(mc.maxVal * 100).toFixed(2)}%, posErr = ${(mc.posErr / dx).toFixed(4)} dx, peak at (${mc.maxI}, ${mc.maxJ})`);
    console.log(`  1st-order SL: peak retention = ${(sl.maxVal * 100).toFixed(2)}%, posErr = ${(sl.posErr / dx).toFixed(4)} dx, peak at (${sl.maxI}, ${sl.maxJ})`);
    console.log(`  Ratio (MC / SL) = ${(mc.maxVal / sl.maxVal).toFixed(3)}`);

    expect(mc.posErr).toBeLessThan(0.5 * dx);
    expect(mc.maxVal).toBeGreaterThan(sl.maxVal);
    expect(mc.maxVal).toBeGreaterThan(0.70);
  });

  it('U9: Solid-body rotation - shape recovered, MacCormack peak retention reported', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const xc = 0.5 * L;
    const yc = 0.5 * L;
    const omega = 2 * Math.PI;
    const totalTime = 1.0;
    const maxSpeed = omega * 0.25 * L;
    const dt = 0.5 * dx / maxSpeed;
    const steps = Math.round(totalTime / dt);
    const actualDt = totalTime / steps;

    // Initial position at (xc + 0.2L, yc)
    const x0 = xc + 0.2 * L;
    const y0 = yc;
    const sigma = 0.05 * L;

    function runRotation(useMacCormack: boolean) {
      e.initTestGrid(N, L, 0);

      const u = view(e.ptrU(), (N + 1) * N);
      const v = view(e.ptrV(), N * (N + 1));

      for (let j = 0; j < N; j++) {
        for (let i = 0; i <= N; i++) {
          const x = i * dx;
          const y = (j + 0.5) * dx;
          u[i + j * (N + 1)] = -omega * (y - yc);
        }
      }
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * dx;
          const y = j * dx;
          v[i + j * N] = omega * (x - xc);
        }
      }

      const src = view(e.ptrScalarSrc(), N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * dx;
          const y = (j + 0.5) * dx;
          const d2 = (x - x0) ** 2 + (y - y0) ** 2;
          src[i + j * N] = Math.exp(-d2 / (2 * sigma * sigma));
        }
      }

      for (let step = 0; step < steps; step++) {
        e.opAdvectScalar(actualDt, useMacCormack ? 1 : 0, 0);
        const dst = view(e.ptrScalarDst(), N * N);
        for (let k = 0; k < N * N; k++) {
          src[k] = dst[k];
        }
      }

      let maxVal = 0, maxI = 0, maxJ = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const val = src[i + j * N];
          if (val > maxVal) {
            maxVal = val;
            maxI = i;
            maxJ = j;
          }
        }
      }

      let sumW = 0, sumWX = 0, sumWY = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const val = src[i + j * N];
          if (val > 0.1 * maxVal) {
            const x = (i + 0.5) * dx;
            const y = (j + 0.5) * dx;
            sumW += val;
            sumWX += val * x;
            sumWY += val * y;
          }
        }
      }
      const peakX = sumWX / sumW;
      const peakY = sumWY / sumW;

      const posErr = Math.sqrt((peakX - x0) ** 2 + (peakY - y0) ** 2);
      return { maxVal, posErr, maxI, maxJ };
    }

    const mc = runRotation(true);
    const sl = runRotation(false);

    console.log(`U9 Rotation (N=${N}, steps=${steps}):`);
    console.log(`  MacCormack: peak retention = ${(mc.maxVal * 100).toFixed(2)}%, posErr = ${(mc.posErr / dx).toFixed(4)} dx, peak at (${mc.maxI}, ${mc.maxJ})`);
    console.log(`  1st-order SL: peak retention = ${(sl.maxVal * 100).toFixed(2)}%, posErr = ${(sl.posErr / dx).toFixed(4)} dx, peak at (${sl.maxI}, ${sl.maxJ})`);
    console.log(`  Ratio (MC / SL) = ${(mc.maxVal / sl.maxVal).toFixed(3)}`);

    expect(mc.posErr).toBeLessThan(0.5 * dx);
    expect(mc.maxVal).toBeGreaterThan(sl.maxVal);
    expect(mc.maxVal).toBeGreaterThan(0.60);
  });
});
