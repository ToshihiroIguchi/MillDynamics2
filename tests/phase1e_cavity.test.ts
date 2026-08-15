import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

const MODE_CAVITY = 2;

// Ghia et al. (1982) benchmark data for Lid-Driven Cavity at Re = 100
const GHIA_U_RE100 = [
  { y: 1.0000, u:  1.00000 },
  { y: 0.9766, u:  0.84123 },
  { y: 0.9688, u:  0.78871 },
  { y: 0.9609, u:  0.73722 },
  { y: 0.9531, u:  0.68717 },
  { y: 0.8516, u:  0.23151 },
  { y: 0.7344, u:  0.00332 },
  { y: 0.6172, u: -0.13641 },
  { y: 0.5000, u: -0.20581 },
  { y: 0.4531, u: -0.21090 },
  { y: 0.2813, u: -0.15662 },
  { y: 0.1719, u: -0.10150 },
  { y: 0.1016, u: -0.06434 },
  { y: 0.0703, u: -0.04775 },
  { y: 0.0625, u: -0.04192 },
  { y: 0.0547, u: -0.03717 },
  { y: 0.0000, u:  0.00000 },
];

const GHIA_V_RE100 = [
  { x: 1.0000, v:  0.00000 },
  { x: 0.9688, v: -0.05906 },
  { x: 0.9609, v: -0.07391 },
  { x: 0.9531, v: -0.08864 },
  { x: 0.9453, v: -0.10313 },
  { x: 0.9063, v: -0.16914 },
  { x: 0.8594, v: -0.22445 },
  { x: 0.8047, v: -0.24533 },
  { x: 0.5000, v:  0.05454 },
  { x: 0.2344, v:  0.17527 },
  { x: 0.2266, v:  0.17507 },
  { x: 0.1563, v:  0.16077 },
  { x: 0.0938, v:  0.12317 },
  { x: 0.0781, v:  0.10890 },
  { x: 0.0703, v:  0.10091 },
  { x: 0.0625, v:  0.09233 },
  { x: 0.0000, v:  0.00000 },
];

describe('Phase 1e Boundary Modes - V1 Lid-Driven Cavity', () => {
  it('V1: Lid-driven cavity at Re=100 profile matches Ghia (1982) within 5%', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const U_lid = 1.0;
    const rho = 100.0;
    const mu = 1.0; // Re = rho * U * L / mu = 100
    const dt = 0.01;

    e.setBoundaryMode(MODE_CAVITY);
    e.setLidVelocity(U_lid);
    e.createSolver(N, L);
    e.setGravity(0.0, 0.0);
    e.setFluid(rho, mu);
    e.setRheology(mu, 1.0, 0.0, 1000.0, 1e-6, 1e6);
    e.setViscousIterations(32);
    e.setFixedTimeStep(dt);

    // Run to steady state (t = 6.0 s)
    const tEnd = 6.0;
    const steps = Math.round(tEnd / dt);
    for (let s = 0; s < steps; s++) {
      e.step(dt);
    }

    const u = view(e.ptrU(), (N + 1) * N);
    const v = view(e.ptrV(), N * (N + 1));

    // Sample u along vertical centerline x = 0.5
    function sampleU(x: number, y: number): number {
      if (y >= L) return U_lid;
      if (y <= 0) return 0.0;
      if (x <= 0 || x >= L) return 0.0;

      const gx = x / dx;
      const gy = y / dx - 0.5;

      let i0 = Math.floor(gx);
      let j0 = Math.floor(gy);
      if (i0 < 0) i0 = 0;
      if (i0 > N - 1) i0 = N - 1;
      if (j0 < 0) j0 = 0;
      if (j0 > N - 2) j0 = N - 2;

      const fx = gx - i0;
      const fy = gy - j0;

      const a = u[i0 + j0 * (N + 1)];
      const b = u[i0 + 1 + j0 * (N + 1)];
      const c = u[i0 + (j0 + 1) * (N + 1)];
      const d = u[i0 + 1 + (j0 + 1) * (N + 1)];

      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    }

    function sampleV(x: number, y: number): number {
      if (x <= 0 || x >= L) return 0.0;
      if (y <= 0 || y >= L) return 0.0;

      const gx = x / dx - 0.5;
      const gy = y / dx;

      let i0 = Math.floor(gx);
      let j0 = Math.floor(gy);
      if (i0 < 0) i0 = 0;
      if (i0 > N - 2) i0 = N - 2;
      if (j0 < 0) j0 = 0;
      if (j0 > N - 1) j0 = N - 1;

      const fx = gx - i0;
      const fy = gy - j0;

      const a = v[i0 + j0 * N];
      const b = v[i0 + 1 + j0 * N];
      const c = v[i0 + (j0 + 1) * N];
      const d = v[i0 + 1 + (j0 + 1) * N];

      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    }

    // Compare with Ghia u-profile at x = 0.5
    let sumSqErrU = 0;
    let sumSqRefU = 0;
    for (const pt of GHIA_U_RE100) {
      const uSim = sampleU(0.5, pt.y);
      const diff = uSim - pt.u;
      sumSqErrU += diff * diff;
      sumSqRefU += pt.u * pt.u;
    }
    const relL2U = Math.sqrt(sumSqErrU / sumSqRefU);

    // Compare with Ghia v-profile at y = 0.5
    let sumSqErrV = 0;
    let sumSqRefV = 0;
    for (const pt of GHIA_V_RE100) {
      const vSim = sampleV(pt.x, 0.5);
      const diff = vSim - pt.v;
      sumSqErrV += diff * diff;
      sumSqRefV += pt.v * pt.v;
    }
    const relL2V = Math.sqrt(sumSqErrV / sumSqRefV);

    console.log(`V1 Cavity Re=100 (N=${N}, t=${tEnd}s):`);
    console.log(`  u-centerline relL2 error vs Ghia = ${(relL2U * 100).toFixed(2)}%`);
    console.log(`  v-centerline relL2 error vs Ghia = ${(relL2V * 100).toFixed(2)}%`);

    expect(relL2U).toBeLessThan(0.05); // < 5% per spec
    expect(relL2V).toBeLessThan(0.05);
  }, 60000);
});
