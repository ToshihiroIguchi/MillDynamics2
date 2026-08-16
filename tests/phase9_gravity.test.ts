import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';
import { MODE_CAVITY, MODE_SLUMP } from '../src/modes';

// V11 — hydrostatic equilibrium.
//
// Gravity is an *acceleration* (NUMERICS.md step 4, KERNEL_REFERENCE.md §10),
// not a force density. The solver used to add it to `bodyF` — which IS a force
// density, fixed by the Poiseuille and Darcy exact solutions — and divide the
// sum by rho, so the applied acceleration was g/rho. At the default slurry
// density that is 9.81/1800 = 5.4e-3 m/s^2 and the pressure field carried no
// hydrostatic gradient at all.
//
// Nothing in the suite exercised gravity before this file: every other test
// calls setGravity(0, 0).
//
// In a closed box of quiescent constant-density fluid the momentum equation
// reduces to dp/dy = -rho*g exactly, and the fluid must not move. Both
// assertions below scale with rho, which is what pins the convention: under the
// old behaviour the recovered gradient was -rho*(g/rho) = -g, i.e. independent
// of density and 1800x too small.

async function hydrostatic(rho: number, g: number, N: number = 32) {
  const { e, view } = await loadSolver(true);
  const L = 1.0;
  const dx = L / N;
  const dt = 2e-3;
  const mu = 0.1;

  e.setBoundaryMode(MODE_CAVITY);
  e.setLidVelocity(0.0); // closed box, nothing driving the flow but gravity
  e.createSolver(N, L);
  e.setFluid(rho, mu);
  e.setRheology(mu, 1.0, 0.0, 1000.0, 1e-6, 1e6);
  e.setViscousIterations(32);
  e.setFixedTimeStep(dt);
  e.setGravity(0.0, -g);

  for (let s = 0; s < 2000; s++) e.step(dt);

  const p = view(e.ptrP(), N * N);
  const u = view(e.ptrU(), (N + 1) * N);
  const v = view(e.ptrV(), N * (N + 1));

  // Least-squares slope of p against y over the horizontal centre column,
  // excluding the two cells nearest each wall.
  const col = N >> 1;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let j = 2; j < N - 2; j++) {
    const y = (j + 0.5) * dx;
    const pv = p[col + j * N];
    sx += y; sy += pv; sxx += y * y; sxy += y * pv; n++;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);

  let maxVel = 0.0;
  for (let k = 0; k < u.length; k++) maxVel = Math.max(maxVel, Math.abs(u[k]));
  for (let k = 0; k < v.length; k++) maxVel = Math.max(maxVel, Math.abs(v[k]));

  return { slope, maxVel };
}

describe('Phase 9 Gravity - V11 hydrostatic equilibrium', () => {
  it('V11a: closed box recovers dp/dy = -rho*g within 2% (rho = 1800)', async () => {
    const rho = 1800.0;
    const g = 9.81;
    const { slope, maxVel } = await hydrostatic(rho, g);
    const exact = -rho * g;
    const relErr = Math.abs(slope - exact) / Math.abs(exact);
    console.log(
      `V11a rho=${rho}: dp/dy measured = ${slope.toFixed(1)} Pa/m, ` +
      `exact = ${exact.toFixed(1)} Pa/m, err = ${(relErr * 100).toFixed(3)}%`
    );
    expect(relErr).toBeLessThan(0.02);

    // Quiescent fluid should stay exactly quiescent: a uniform body force is a
    // pure gradient and the projection ought to absorb all of it. It does not —
    // a creeping circulation appears along the side walls. Measured at N = 32,
    // rho = 1800, mu = 0.1 it is 0.38 g*dt at t = 4 s, rising to 0.80 g*dt at
    // t = 48 s, and it grows with both nu and N. See VALIDATION.md §4 (open).
    //
    // It is bounded by one step's worth of un-projected gravity, so assert that
    // bound rather than the ideal zero: this catches a regression that lets the
    // residual accumulate without pretending the defect is fixed.
    const dt = 2e-3;
    console.log(`V11a spurious max|u| = ${maxVel.toExponential(3)} m/s = ${(maxVel / (g * dt)).toFixed(3)} g*dt (ideal 0)`);
    expect(maxVel).toBeLessThan(g * dt);
  }, 60000);

  it('V11b: the recovered gradient scales with density, not with g alone', async () => {
    const g = 9.81;
    const a = await hydrostatic(1000.0, g);
    const b = await hydrostatic(2000.0, g);
    const ratio = b.slope / a.slope;
    console.log(
      `V11b dp/dy: rho=1000 -> ${a.slope.toFixed(1)}, rho=2000 -> ${b.slope.toFixed(1)}, ` +
      `ratio = ${ratio.toFixed(4)} (expect 2)`
    );
    // Under the old force-density/acceleration confusion this ratio was 1.
    expect(ratio).toBeGreaterThan(1.96);
    expect(ratio).toBeLessThan(2.04);
  }, 90000);

  it('V11c: gravity reaches the mill solver and is not silently dropped', async () => {
    // Guards the wiring, not the value: main.ts and run_experiments.ts both call
    // setGravity on the mill path, which V11a/b do not touch.
    const N = 64;
    const L = 1.0;
    const R = 0.4;

    async function millPressureSpan(g: number) {
      const { e, view } = await loadSolver(true);
      e.setBoundaryMode(MODE_SLUMP);
      e.createSolver(N, L);
      e.setFluid(1800.0, 0.1);
      e.setRheology(0.1, 1.0, 0.0, 1000.0, 1e-4, 1e3);
      e.setMillGeometry(R, 0.0, 0, 0.0, 0.0, 0.0); // omega = 0: gravity is the only forcing
      e.setViscousIterations(12);
      e.setFixedTimeStep(2e-3);
      e.setGravity(0.0, -g);
      for (let s = 0; s < 500; s++) e.step(2e-3);

      const p = view(e.ptrP(), N * N);
      const chi = view(e.ptrChi(), N * N);
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < N * N; k++) {
        if (chi[k] > 0.5) continue;
        if (p[k] < lo) lo = p[k];
        if (p[k] > hi) hi = p[k];
      }
      return hi - lo;
    }

    const span0 = await millPressureSpan(0.0);
    const span1 = await millPressureSpan(9.81);
    // rho*g*2R = 1800 * 9.81 * 0.8 = 14.1 kPa across the charge; the exact value
    // depends on the penalization layer, so only the order of magnitude is
    // asserted. The pre-fix build produced span1/span0 = 1.0.
    console.log(
      `V11c mill pressure span: g=0 -> ${span0.toFixed(1)} Pa, ` +
      `g=9.81 -> ${span1.toFixed(1)} Pa, rho*g*2R = ${(1800 * 9.81 * 2 * R).toFixed(1)} Pa`
    );
    expect(span1).toBeGreaterThan(0.5 * 1800 * 9.81 * 2 * R);
    expect(span1).toBeLessThan(2.0 * 1800 * 9.81 * 2 * R);
  }, 60000);
});
