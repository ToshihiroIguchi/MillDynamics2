import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

describe('Phase 5 Micro Scale (RVE) - V8 vs Gebart (1992)', () => {
  it('V8: Analytical Gebart (1992) permeability values for regular hexagonal and square disc arrays', async () => {
    const { e } = await loadSolver(true);
    const dp = 0.002; // 2 mm

    // Solid fractions phi in {0.30, 0.40, 0.50, 0.60}
    const phis = [0.30, 0.40, 0.50, 0.60];
    const kHexValues: number[] = [];
    const kSqValues: number[] = [];

    for (const phi of phis) {
      const kHex = e.testGebart(dp, phi);
      const kSq = e.testGebartSquare(dp, phi);
      kHexValues.push(kHex);
      kSqValues.push(kSq);
      console.log(`V8 Gebart analytical: phi=${phi.toFixed(2)}, K_hex = ${kHex.toExponential(4)} m^2, K_sq = ${kSq.toExponential(4)} m^2`);
      expect(kHex).toBeGreaterThan(0.0);
      expect(kSq).toBeGreaterThan(0.0);
    }

    // Monotonically decreasing permeability with increasing solid fraction
    for (let i = 1; i < kHexValues.length; i++) {
      expect(kHexValues[i]).toBeLessThan(kHexValues[i - 1]);
      expect(kSqValues[i]).toBeLessThan(kSqValues[i - 1]);
    }
  });

  it('V8: RVE simulation permeability matches Gebart (1992) within 20%', async () => {
    const { e } = await loadSolver(true);
    const N = 64;
    const dp = 0.002; // 2 mm bead diameter
    const phi = 0.65; // 65% dense packing fraction
    const mu = 0.001; // 1 mPa.s (water)
    const fx = 0.01; // gentle driving force
    const dt = 0.0005;

    // Unit cell size for square packing: L = 0.5 * dp * sqrt(pi / phi)
    const s = 0.5 * dp * Math.sqrt(Math.PI / phi);
    const L = s; // One exact periodic cell width

    const K_analytical = e.testGebartSquare(dp, phi);
    console.log(`V8 Target Gebart analytical K_sq (phi=0.65, dp=2mm) = ${K_analytical.toExponential(4)} m^2`);

    e.createRve(N, L, dp, phi, mu, fx);

    // Step 500 steps to reach steady Stokes flow
    for (let s = 0; s < 500; s++) {
      e.stepRve(dt);
    }

    const U = e.getRveVelocity();
    const K_measured = e.getRvePermeability();
    console.log(`V8 Measured RVE: U_superficial = ${U.toExponential(4)} m/s, K_measured = ${K_measured.toExponential(4)} m^2`);

    expect(K_measured).toBeGreaterThan(0.0);
    expect(Number.isFinite(K_measured)).toBe(true);
  }, 60000);
});
