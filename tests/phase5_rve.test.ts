import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

const fx0 = () => 0.01; // Pa/m driving pressure gradient

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

  // This case previously carried the title "matches Gebart (1992) within 20%"
  // while asserting only K > 0 and isFinite. The measured value was in fact ~219x
  // Gebart, and it passed. See VALIDATION.md §5.1.
  //
  // It is now a REGRESSION GUARD, not a verification. The RVE permeability is
  // still not a trustworthy measurement — §5.5 documents a factor-3.2 dependence
  // on density in a steady Stokes problem, where density cannot matter. So the
  // band asserted below is deliberately wide: it is tight enough to have caught
  // the 219x defect, and honest about not being a benchmark.
  //
  // Note the dt: the solver bounds its own diffusion number by subdividing, so
  // passing an arbitrary dt is correct but can cost hundreds of substeps per
  // call. Ask for maxStableDt() and march in those units.
  it('V8: RVE permeability stays within a wide band of Gebart (regression guard, NOT a verification)', async () => {
    const { e } = await loadSolver(true);
    const N = 32;
    const dp = 0.002;   // 2 mm discs
    const phi = 0.65;   // near maximum packing, where Gebart is asymptotically valid
    const mu = 0.001;   // Pa.s
    const rho = 1000.0; // physical density: nu = mu/rho keeps the solve well conditioned
    const fx = 0.01;    // Pa/m

    const L = 0.5 * dp * Math.sqrt(Math.PI / phi); // one disc per periodic cell
    const K_gebart = e.testGebartSquare(dp, phi);

    e.createRve(N, L, dp, phi, mu, fx);
    e.setRveDensity(rho);
    e.setRvePenalization(1e-8);

    const dt = e.getRveMaxStableDt();
    const nu = mu / rho;
    const tEnd = (3.0 * L * L) / nu;  // 3 viscous relaxation times over the cell
    const steps = Math.ceil(tEnd / dt);
    for (let k = 0; k < steps; k++) e.stepRve(dt);

    const K = e.getRvePermeability();
    const ratio = K / K_gebart;
    console.log(
      `V8 (N=${N}, phi=${phi}): K = ${K.toExponential(4)} m^2, ` +
      `Gebart = ${K_gebart.toExponential(4)} m^2, K/K_G = ${ratio.toFixed(4)} ` +
      `(${steps} steps at dt = ${dt.toExponential(2)} s)`
    );

    expect(Number.isFinite(K)).toBe(true);
    expect(K).toBeGreaterThan(0.0);
    // The pre-fix defect sat at 219x and grew with refinement; anything above 10x
    // means the viscous solve is under-converged again.
    expect(ratio).toBeLessThan(10.0);
    expect(ratio).toBeGreaterThan(0.005);
  }, 120000);

  it('V8: the RVE bounds its own viscous diffusion number', async () => {
    const { e } = await loadSolver(true);
    const dp = 0.002, phi = 0.65, mu = 0.001, rho = 1000.0;
    const L = 0.5 * dp * Math.sqrt(Math.PI / phi);
    e.createRve(32, L, dp, phi, mu, fx0());
    e.setRveDensity(rho);

    const dtMax = e.getRveMaxStableDt();
    // At the reported bound the diffusion number must be O(1), not O(1e3).
    expect(e.getRveDiffusionNumber(dtMax)).toBeLessThanOrEqual(0.5 + 1e-9);
    // And a wildly oversized dt must still be handled, by subdivision.
    expect(e.getRveDiffusionNumber(dtMax * 1000)).toBeGreaterThan(1.0);
  });
});
