import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';
import { MODE_SLUMP } from '../src/modes';

const MODE_PERIODIC = 2;


describe('Phase 4 Bed Geometry, Porous Media & Robustness - Row 4a, 4b, 4c', () => {
  it('Row 4a: Chord bisection & Bed area = J * pi * R^2 within 1% for all J in {0.15, 0.30, 0.45}', async () => {
    const { e, view } = await loadSolver(true);
    const R = 0.45;

    // 1. Check chord offset edge cases
    const d0 = e.testSolveChordOffset(R, 0.5); // half-filled -> chord at center d = 0
    expect(Math.abs(d0)).toBeLessThan(1e-12);

    const dFull = e.testSolveChordOffset(R, 1.0);
    expect(Math.abs(dFull - (-R))).toBeLessThan(1e-12);

    const dEmpty = e.testSolveChordOffset(R, 0.0);
    expect(Math.abs(dEmpty - R)).toBeLessThan(1e-12);

    // 2. Test discretized bed area across J in {0.15, 0.30, 0.45} at N = 128
    const N = 128;
    const L = 1.0;
    const dx = L / N;
    const thetaRepose = (40.0 * Math.PI) / 180.0;
    const omega = 1.0;
    const kSlip = 0.85;

    e.initTestGrid(N, L, 0);
    const chiBed = view(e.ptrTestChiBed(), N * N);

    const fillValues = [0.15, 0.30, 0.45];
    for (const J of fillValues) {
      e.opUpdateBedMask(R, J, thetaRepose, omega, kSlip);

      let measuredArea = 0.0;
      const dA = dx * dx;
      for (let k = 0; k < N * N; k++) {
        measuredArea += chiBed[k] * dA;
      }

      const targetArea = J * Math.PI * R * R;
      const relErr = Math.abs(measuredArea - targetArea) / targetArea;
      console.log(`Row 4a: J=${J.toFixed(2)}, targetArea=${targetArea.toFixed(5)}, measuredArea=${measuredArea.toFixed(5)}, err=${(relErr * 100).toFixed(3)}%`);

      expect(relErr).toBeLessThan(0.01); // < 1% per spec
    }
  });

  it('Row 4b: Darcy-Forchheimer drag balance in a periodic box within 2%', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const rho = 1.0;
    const mu = 0.05;
    const epsilon = 0.40;
    const dp = 0.002;
    const A = 150.0;
    const B = 1.75;
    const C_gamma = 1.0;
    const fx = 10.0;
    const dt = 0.001;

    // Check analytical permeability
    const K_perm = e.testPermeability(epsilon, dp, A);
    const expectedK = (Math.pow(epsilon, 3) * dp * dp) / (A * Math.pow(1.0 - epsilon, 2));
    expect(Math.abs(K_perm - expectedK) / expectedK).toBeLessThan(1e-10);
    console.log(`Row 4b: K_perm = ${K_perm.toExponential(3)} m^2`);

    // Solve analytical quadratic Darcy-Forchheimer velocity: fx = (mu/K_perm)*u + (B*rho*(1-eps)/(eps^3*dp))*u^2
    const cDarcy = mu / K_perm;
    const cForch = (B * rho * (1.0 - epsilon)) / (Math.pow(epsilon, 3) * dp);
    // cForch * u^2 + cDarcy * u - fx = 0
    const uExact = (-cDarcy + Math.sqrt(cDarcy * cDarcy + 4.0 * cForch * fx)) / (2.0 * cForch);
    console.log(`Row 4b: Darcy coeff = ${cDarcy.toExponential(3)}, Forch coeff = ${cForch.toExponential(3)}, uExact = ${uExact.toExponential(4)} m/s`);

    e.initTestGrid(N, L, 1);
    const u = view(e.ptrTestU(), (N + 1) * N);
    const chiBed = view(e.ptrTestChiBed(), N * N);

    // Uniform porous bed across domain (chiBed = 1.0)
    for (let k = 0; k < N * N; k++) chiBed[k] = 1.0;
    for (let k = 0; k < (N + 1) * N; k++) u[k] = 0.0;

    // Step porous drag + body force to steady state
    for (let s = 0; s < 500; s++) {
      for (let k = 0; k < (N + 1) * N; k++) {
        u[k] += dt * fx / rho;
      }
      e.opApplyPorousDrag(dt, rho, epsilon, dp, A, B, C_gamma, mu, 1.0, 0.0, 1000.0, 1e-4, 1e4);
    }

    const uMeasured = u[32 + 32 * (N + 1)];
    const relErr = Math.abs(uMeasured - uExact) / uExact;
    console.log(`Row 4b: uMeasured = ${uMeasured.toExponential(4)}, uExact = ${uExact.toExponential(4)}, relErr = ${(relErr * 100).toFixed(3)}%`);

    expect(relErr).toBeLessThan(0.02); // < 2% per spec
  });

  it('Row 4c / V9: Robustness - Mill simulation runs 500 steps with finite diagnostics and no NaN/Inf', async () => {
    const { e } = await loadSolver(true);
    const N = 64;
    const L = 1.024;
    const rho = 1200.0;
    const mu = 0.25;
    const R = 0.45;
    const omega = 3.325; // 75% critical speed
    const dt = 0.002;

    e.setBoundaryMode(MODE_SLUMP);
    e.createSolver(N, L);
    e.setFluid(rho, mu);
    e.setRheology(mu, 0.7, 5.0, 1000.0, 1e-4, 1e4); // Shear-thinning Herschel-Bulkley
    e.setMillGeometry(R, omega, 12, 0.04, 0.02, 0.0);
    e.setBedParameters(0.30, (40.0 * Math.PI) / 180.0, 0.85, 0.40, 0.002, 150.0, 1.75, 1.0);
    e.setPenalization(1e-4);
    e.setViscousIterations(24);
    e.setFixedTimeStep(dt);

    // Run 500 steps
    for (let s = 0; s < 500; s++) {
      e.step(dt);
    }

    const maxDiv = e.diagMaxDiv();
    const ke = e.diagKineticEnergy();
    const maxVel = e.diagMaxVel();
    const torque = e.diagTorque();
    const bedArea = e.diagBedArea();
    const yielded = e.diagYieldedFraction();

    console.log(`Row 4c / V9 Diagnostics at t=${e.getTime().toFixed(2)}s:`);
    console.log(`  maxDiv = ${maxDiv.toExponential(3)}`);
    console.log(`  KE = ${ke.toFixed(4)} J/m`);
    console.log(`  maxVel = ${maxVel.toFixed(4)} m/s (tip speed ~ ${(omega * R).toFixed(2)} m/s)`);
    console.log(`  torque = ${torque.toFixed(2)} N*m/m`);
    console.log(`  bedArea = ${bedArea.toFixed(4)} m^2`);
    console.log(`  yielded = ${(yielded * 100).toFixed(1)}%`);

    expect(Number.isFinite(maxDiv)).toBe(true);
    expect(Number.isFinite(ke)).toBe(true);
    expect(Number.isFinite(maxVel)).toBe(true);
    expect(Number.isFinite(torque)).toBe(true);
    expect(Number.isFinite(bedArea)).toBe(true);

    expect(maxVel).toBeLessThan(3.5); // Sanity magnitude table KERNEL_REFERENCE.md §11
    expect(maxVel).toBeGreaterThan(0.1);
    expect(ke).toBeGreaterThan(0.0);
    expect(bedArea).toBeGreaterThan(0.0);
  }, 60000);
});
