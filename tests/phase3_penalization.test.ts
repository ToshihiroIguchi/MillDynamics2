import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

// The six boundary-mode literals that used to live here all disagreed with
// assembly/types.ts. They are unused in this file, so they are simply gone;
// tests/modes.test.ts now pins src/modes.ts against the WASM exports.

describe('Phase 3 Penalization, SDF & Torque - U12, V6, V7', () => {
  it('U12: Penalization relaxation and spatial SDF masking', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const R = 0.4;
    const omega = 2.0;

    e.initTestGrid(N, L, 0);
    const chi = view(e.ptrTestChi(), N * N);
    const uSolid = view(e.ptrTestUSolid(), (N + 1) * N);
    const vSolid = view(e.ptrTestVSolid(), N * (N + 1));

    e.opUpdateMillSolidMask(R, omega, 8, 0.05, 0.02, 0.0, 0.0);

    // Check that center (0.5, 0.5) is fluid (chi close to 0)
    const cCenter = 32 + 32 * N;
    expect(chi[cCenter]).toBeLessThan(0.01);

    // Check that outer corner (0, 0) is solid shell (chi close to 1)
    const cCorner = 0;
    expect(chi[cCorner]).toBeGreaterThan(0.99);

    // Check solid velocity matches rigid body rotation v = omega * (x - cx), u = -omega * (y - cy)
    const uFace = uSolid[32 + 48 * (N + 1)]; // y = (48 + 0.5)*dx = 48.5/64 = 0.7578, dy = 0.2578
    const expectedU = -omega * ((48 + 0.5) * dx - 0.5 * L);
    expect(Math.abs(uFace - expectedU)).toBeLessThan(1e-10);
  });

  // NOTE: this case does NOT measure a torque. It imposes the analytical
  // Taylor-Couette profile and then range-checks the analytical formula itself;
  // the solver is never run and computeShellTorque is never called. Renamed to
  // say so. A genuine V7a would step the solver to steady state and compare
  // diagTorque() against T_analytical. See VALIDATION.md §4.7.
  it('V7a: Taylor-Couette analytical torque formula is in the expected range (does NOT measure solver torque)', async () => {
    const { e, view } = await loadSolver(true);
    const N = 128;
    const L = 1.0;
    const dx = L / N;
    const rho = 1.0;
    const mu = 0.1;
    const R_i = 0.2;
    const R_o = 0.45;
    const omega_i = 1.0;
    const omega_o = 0.0;

    e.initTestGrid(N, L, 0);
    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));

    // Analytical Taylor-Couette profile
    // u_theta(r) = A*r + B/r
    const A = -omega_i * R_i * R_i / (R_o * R_o - R_i * R_i);
    const B = omega_i * R_i * R_i * R_o * R_o / (R_o * R_o - R_i * R_i);
    const T_analytical = (4.0 * Math.PI * mu * omega_i * R_i * R_i * R_o * R_o) / (R_o * R_o - R_i * R_i);

    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) * dx - 0.5 * L;
      for (let i = 0; i <= N; i++) {
        const x = i * dx - 0.5 * L;
        const r = Math.sqrt(x * x + y * y);
        if (r >= R_i && r <= R_o) {
          const uTheta = A * r + B / r;
          u[i + j * (N + 1)] = -uTheta * (y / r);
        }
      }
    }
    for (let j = 0; j <= N; j++) {
      const y = j * dx - 0.5 * L;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * dx - 0.5 * L;
        const r = Math.sqrt(x * x + y * y);
        if (r >= R_i && r <= R_o) {
          const uTheta = A * r + B / r;
          v[i + j * N] = uTheta * (x / r);
        }
      }
    }

    e.opUpdateTaylorCouetteSolidMask(R_i, R_o, omega_i, omega_o);

    console.log(`V7a Taylor-Couette analytical torque = ${T_analytical.toFixed(5)} N*m/m`);
    expect(T_analytical).toBeGreaterThan(0.05);
    expect(T_analytical).toBeLessThan(0.08);
  });

  it('V7b: Solid-body rotation in a closed rotating cylinder (velocity invariance < 2%)', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const R = 0.45;
    const omega = 2.0 * Math.PI; // 1 rev/s
    const dt = 0.002;
    const eta = 1e-4;

    e.initTestGrid(N, L, 0);
    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));

    // Initialize with analytical solid-body rotation (u = -omega*(y-cy), v = omega*(x-cx))
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) * dx - 0.5 * L;
      for (let i = 0; i <= N; i++) {
        const x = i * dx - 0.5 * L;
        u[i + j * (N + 1)] = -omega * y;
      }
    }
    for (let j = 0; j <= N; j++) {
      const y = j * dx - 0.5 * L;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * dx - 0.5 * L;
        v[i + j * N] = omega * x;
      }
    }

    // Apply rotating solid drum mask and penalization
    e.opUpdateMillSolidMask(R, omega, 0, 0.0, 0.0, 0.0, 0.0);
    e.opPenalize(eta, dt);

    // Check that fluid interior retains solid-body rotation exactly
    let sumSqErr = 0;
    let sumSqRef = 0;
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5) * dx - 0.5 * L;
      for (let i = 0; i <= N; i++) {
        const x = i * dx - 0.5 * L;
        const r = Math.sqrt(x * x + y * y);
        if (r < 0.9 * R) { // inside cylinder
          const uExact = -omega * y;
          const uSim = u[i + j * (N + 1)];
          const diff = uSim - uExact;
          sumSqErr += diff * diff;
          sumSqRef += uExact * uExact;
        }
      }
    }

    const relL2 = Math.sqrt(sumSqErr / sumSqRef);
    console.log(`V7b Solid-body rotation in rotating drum: relL2 error = ${(relL2 * 100).toFixed(3)}%`);
    expect(relL2).toBeLessThan(0.02); // < 2% per spec
  });

  // NOTE: this case does NOT measure a drag coefficient. It checks the cylinder
  // mask and that penalization slows the core; diagCylinderDrag() is never
  // called and C_D is never compared to Dennis & Chang. Renamed to say so.
  // See VALIDATION.md §4.7.
  it('V6: Cylinder mask and penalization behave correctly (does NOT measure C_D)', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const rho = 1.0;
    const U_inf = 1.0;
    const d_cyl = 0.15;
    const R_cyl = 0.5 * d_cyl;
    const Re = 20.0;
    const mu = (rho * U_inf * d_cyl) / Re;

    e.initTestGrid(N, L, 0);
    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));
    const chi = view(e.ptrTestChi(), N * N);

    // Set uniform inflow field
    for (let k = 0; k < (N + 1) * N; k++) u[k] = U_inf;
    for (let k = 0; k < N * (N + 1); k++) v[k] = 0.0;

    e.opUpdateCylinderSolidMask(R_cyl);

    // Verify cylinder mask: center is solid (chi=1), corners are fluid (chi=0)
    const cCenter = 32 + 32 * N;
    expect(chi[cCenter]).toBeGreaterThan(0.95);
    expect(chi[0]).toBeLessThan(0.05);

    // Apply penalization and check drag force scaling
    const dt = 0.001;
    const eta = 1e-4;
    e.opPenalize(eta, dt);

    // In cylinder core, velocity is reduced towards 0
    const uCenter = u[32 + 32 * (N + 1)];
    expect(uCenter).toBeLessThan(U_inf * 0.2);
  });
});
