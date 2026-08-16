// scripts/run_rve_e6.ts
//
// E6 — micro-scale RVE permeability measurement (docs/EXPERIMENT_PLAN.md §E6),
// and the V8 verification against Gebart (1992).
//
// This writes MEASURED numbers to results/E6_rve.csv. scripts/fit_closure.py
// consumes that file and refuses to run without it. Nothing here invents a
// constant: the previous fit_closure.py contained hard-coded algebraic
// expressions for A_2D, B_2D and C_gamma with no simulation input at all.
//
// Correctness requirement, established by the convergence study in
// VALIDATION.md §4.6: the RVE is only a measurement when
//   (a) the diffusion number D = dt*nu/dx^2 is O(1) — the solver now enforces
//       this internally by subdividing dt, and
//   (b) the inter-disc gap is resolved by enough cells. This is the binding
//       constraint and is reported per run.
import fs from 'fs';
import path from 'path';
import { loadSolver } from '../tests/helpers/loadWasm';

const dp = 0.002;          // 2 mm discs, matching the macro media diameter
const mu = 0.001;          // Pa.s
const rho = 1000.0;        // kg/m^3 — a physical density keeps nu = mu/rho small
const fx = 0.01;           // Pa/m driving pressure gradient
const N_RELAX = 6;         // viscous relaxation times to run for

export interface RvePoint {
  phi: number;
  epsilon: number;
  N: number;
  gapCells: number;
  K_measured: number;
  K_gebart: number;
  ratio: number;
  A_2D: number;
}

export async function measure(N: number, phi: number): Promise<RvePoint> {
  const { e } = await loadSolver(false);
  const L = 0.5 * dp * Math.sqrt(Math.PI / phi);   // square cell, one disc
  const dx = L / N;
  const nu = mu / rho;

  e.createRve(N, L, dp, phi, mu, fx);
  e.setRveDensity(rho);
  e.setRvePenalization(1e-8);
  e.setRveViscousIterations(24);

  // The solver subdivides internally to hold D <= 0.5; ask it what dt it can
  // take and march in those units so the step count is predictable.
  const dtMax = e.getRveMaxStableDt();
  const tEnd = (N_RELAX * L * L) / nu;
  const steps = Math.ceil(tEnd / dtMax);
  for (let s = 0; s < steps; s++) e.stepRve(dtMax);

  const K = e.getRvePermeability();
  const Kg = e.testGebartSquare(dp, phi);
  const eps = 1.0 - phi;
  // K = eps^3 dp^2 / (A_2D (1-eps)^2)  =>  A_2D = eps^3 dp^2 / (K (1-eps)^2)
  const A_2D = (Math.pow(eps, 3) * dp * dp) / (K * Math.pow(1.0 - eps, 2));

  return {
    phi, epsilon: eps, N,
    gapCells: (L - dp) / dx,
    K_measured: K,
    K_gebart: Kg,
    ratio: K / Kg,
    A_2D
  };
}

async function main() {
  const N = Number(process.env.RVE_N || 64);
  const outDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`=== E6 / V8: RVE permeability, N=${N}, square array, dp=${dp * 1000} mm ===`);
  console.log('phi    eps    gapCells   K_measured    K_Gebart      K/K_G     A_2D');

  const rows: RvePoint[] = [];
  for (const phi of [0.36, 0.40, 0.45, 0.50, 0.60, 0.65]) {
    const t0 = Date.now();
    const r = await measure(N, phi);
    rows.push(r);
    console.log(
      `${r.phi.toFixed(2)}   ${r.epsilon.toFixed(2)}   ${r.gapCells.toFixed(1).padStart(6)}   ` +
      `${r.K_measured.toExponential(3)}   ${r.K_gebart.toExponential(3)}   ` +
      `${r.ratio.toFixed(3).padStart(7)}   ${r.A_2D.toFixed(1).padStart(8)}   [${((Date.now() - t0) / 1000).toFixed(0)}s]`
    );
  }

  const lines = [
    '# MillDynamics2 E6 - micro-scale RVE permeability (measured)',
    `# generated: ${new Date().toISOString()}`,
    `# dp_m=${dp} mu_Pa_s=${mu} rho_kg_m3=${rho} fx_Pa_m=${fx} N=${N} relaxation_times=${N_RELAX}`,
    '# packing=square, one disc per periodic cell',
    '# K_gebart is Gebart (1992) transverse permeability for a square array.',
    'phi,epsilon,N,gap_cells,K_measured_m2,K_gebart_m2,K_ratio,A_2D',
    ...rows.map(r => [
      r.phi, r.epsilon, r.N, r.gapCells.toFixed(2),
      r.K_measured.toExponential(6), r.K_gebart.toExponential(6),
      r.ratio.toFixed(5), r.A_2D.toFixed(3)
    ].join(','))
  ];
  fs.writeFileSync(path.join(outDir, 'E6_rve.csv'), lines.join('\n'), 'utf-8');
  console.log(`\nWrote results/E6_rve.csv (${rows.length} points)`);
}

main().catch(err => { console.error(err); process.exit(1); });
