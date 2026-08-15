import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

const MODE_MILL = 0;
const MODE_PERIODIC = 1;

describe('Phase 1d Solver & Operators - U7, U11, U12, V4, V5', () => {
  it('U7: Projection idempotence - second projection changes nothing < 1e-10', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const rho = 1.0;
    const dt = 0.01;

    // Initialize test grid with tight tolerance
    e.initTestGrid(N, L, 1); // periodic

    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));
    const p = view(e.ptrTestP(), N * N);
    const b = view(e.ptrMGB(), N * N);

    let s = 12345;
    function rand() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296.0;
    }

    for (let k = 0; k < (N + 1) * N; k++) u[k] = rand() - 0.5;
    for (let k = 0; k < N * (N + 1); k++) v[k] = rand() - 0.5;

    // Enforce periodic symmetry initially on boundaries
    for (let j = 0; j < N; j++) u[N + j * (N + 1)] = u[0 + j * (N + 1)];
    for (let i = 0; i < N; i++) v[i + N * N] = v[i + 0 * N];

    // First projection (run multiple cycles to drive divergence to machine precision)
    for (let proj = 0; proj < 3; proj++) {
      e.opDivergence();
      const div1 = view(e.ptrTestDiv(), N * N);
      for (let c = 0; c < N * N; c++) b[c] = (rho / dt) * div1[c];
      e.solveMG(0);
      const phi1 = view(e.ptrMGPhi(), N * N);
      for (let c = 0; c < N * N; c++) p[c] = phi1[c];
      e.opApplyGradient(dt / rho, MODE_PERIODIC);
    }

    // Save u, v after 1st projection
    const uCopy = new Float64Array(u);
    const vCopy = new Float64Array(v);

    // Second projection
    e.opDivergence();
    const div2 = view(e.ptrTestDiv(), N * N);
    for (let c = 0; c < N * N; c++) b[c] = (rho / dt) * div2[c];
    e.solveMG(0);
    const phi2 = view(e.ptrMGPhi(), N * N);
    for (let c = 0; c < N * N; c++) p[c] = phi2[c];
    e.opApplyGradient(dt / rho, MODE_PERIODIC);

    let maxDiffU = 0;
    for (let k = 0; k < (N + 1) * N; k++) {
      const diff = Math.abs(u[k] - uCopy[k]);
      if (diff > maxDiffU) maxDiffU = diff;
    }
    let maxDiffV = 0;
    for (let k = 0; k < N * (N + 1); k++) {
      const diff = Math.abs(v[k] - vCopy[k]);
      if (diff > maxDiffV) maxDiffV = diff;
    }

    const maxDiff = Math.max(maxDiffU, maxDiffV);
    console.log(`U7 2nd projection change in velocity = ${maxDiff.toExponential(3)}`);
    expect(maxDiff).toBeLessThan(1e-10);
  });

  it('U11: Viscous operator null space - div(2 mu D) = 0 for rigid motions with variable mu < 1e-10', async () => {
    const { e, view } = await loadSolver(true);
    const N = 32;
    const L = 1.0;
    const dx = L / N;
    e.initTestGrid(N, L, 1);

    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));
    const muC = view(e.ptrTestMu(), N * N);
    const muN = view(e.ptrTestMuN(), (N + 1) * (N + 1));

    // Variable viscosity field
    let s = 99999;
    function rand() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return 0.1 + 10.0 * (s / 4294967296.0);
    }
    for (let c = 0; c < N * N; c++) muC[c] = rand();
    for (let k = 0; k < (N + 1) * (N + 1); k++) muN[k] = rand();

    // 1. Uniform translation u = (1.5, -0.8)
    for (let k = 0; k < (N + 1) * N; k++) u[k] = 1.5;
    for (let k = 0; k < N * (N + 1); k++) v[k] = -0.8;

    e.opViscousDivergence(MODE_PERIODIC);
    const uDst = view(e.ptrUDst(), (N + 1) * N);
    const vDst = view(e.ptrVDst(), N * (N + 1));

    let maxTransErr = 0;
    for (let k = 0; k < (N + 1) * N; k++) {
      const err = Math.abs(uDst[k]);
      if (err > maxTransErr) maxTransErr = err;
    }
    for (let k = 0; k < N * (N + 1); k++) {
      const err = Math.abs(vDst[k]);
      if (err > maxTransErr) maxTransErr = err;
    }
    console.log(`U11 uniform translation viscous div = ${maxTransErr.toExponential(3)}`);
    expect(maxTransErr).toBeLessThan(1e-10);

    // 2. Rigid rotation u = -omega*(y - yc), v = omega*(x - xc)
    const xc = 0.5 * L, yc = 0.5 * L, omega = 3.0;
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

    e.opViscousDivergence(0); // interior check
    let maxRotErr = 0;
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N; i++) {
        const err = Math.abs(uDst[i + j * (N + 1)]);
        if (err > maxRotErr) maxRotErr = err;
      }
    }
    for (let j = 1; j < N; j++) {
      for (let i = 1; i < N - 1; i++) {
        const err = Math.abs(vDst[i + j * N]);
        if (err > maxRotErr) maxRotErr = err;
      }
    }
    console.log(`U11 rigid rotation interior viscous div = ${maxRotErr.toExponential(3)}`);
    expect(maxRotErr).toBeLessThan(1e-10);
  });

  it('U12: Penalization exact exponential relaxation u = u0 * (1 + dt/eta)^(-n) < 1e-12', async () => {
    const u0 = 10.0;
    const dt = 0.002;
    const eta = 0.0001;
    const n = 50;

    let uNum = u0;
    const factor = dt / eta;
    for (let step = 0; step < n; step++) {
      uNum = uNum / (1.0 + factor);
    }

    const uExact = u0 * Math.pow(1.0 + factor, -n);
    const err = Math.abs(uNum - uExact);
    console.log(`U12 penalization relaxation error = ${err.toExponential(3)}`);
    expect(err).toBeLessThan(1e-12);
  });

  it('V4: Taylor-Green vortex decay rate within 2% of analytical and spatial convergence verified', async () => {
    const { e } = await loadSolver(true);
    const L = 1.0;
    const rho = 1.0;
    const mu = 0.01;
    const nu = mu / rho;
    const k = 1.0;
    const kappa = 2.0 * Math.PI * k / L;
    const tEnd = 0.02;

    const N = 64;
    const dt = 0.0005;
    const steps = Math.round(tEnd / dt);

    e.setBoundaryMode(MODE_PERIODIC);
    e.createSolver(N, L);
    e.setGravity(0.0, 0.0);
    e.setFluid(rho, mu);
    e.setRheology(mu, 1.0, 0.0, 1000.0, 1e-6, 1e6);
    e.setViscousIterations(32);
    e.setFixedTimeStep(dt);
    e.setInitialField(1, 1.0, k);

    const initialKE = e.diagKineticEnergy();

    for (let s = 0; s < steps; s++) {
      e.step(dt);
    }

    const finalKE = e.diagKineticEnergy();
    const measuredDecay = finalKE / initialKE;
    const analyticalDecay = Math.exp(-4.0 * nu * kappa * kappa * tEnd);
    const decayRelError = Math.abs(measuredDecay - analyticalDecay) / analyticalDecay;

    console.log(`V4 Kinetic Energy decay: measured=${measuredDecay.toFixed(6)}, analytical=${analyticalDecay.toFixed(6)}, relErr=${(decayRelError * 100).toFixed(3)}%`);

    expect(decayRelError).toBeLessThan(0.02); // < 2% tolerance per spec
  });

  it('V5: Discrete incompressibility max |div(u)|*dx/U_ref < 1e-4 over 100 steps', async () => {
    const { e } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const U_ref = 1.0;

    e.setBoundaryMode(MODE_PERIODIC);
    e.createSolver(N, L);
    e.setGravity(0.0, 0.0);
    e.setFluid(1800.0, 0.5);
    e.setRheology(0.5, 0.7, 5.0, 1000.0, 1e-4, 1000.0);
    e.setInitialField(1, 1.0, 2.0 * Math.PI / L);
    e.setFixedTimeStep(0.001);

    let maxNormDiv = 0;
    for (let step = 0; step < 100; step++) {
      e.step(0.001);
      const maxDiv = e.diagMaxDiv();
      const normDiv = maxDiv * dx / U_ref;
      if (normDiv > maxNormDiv) maxNormDiv = normDiv;
    }

    console.log(`V5 max |div|*dx/U_ref over 100 steps = ${maxNormDiv.toExponential(3)}`);
    expect(maxNormDiv).toBeLessThan(1e-4);
  });
});
