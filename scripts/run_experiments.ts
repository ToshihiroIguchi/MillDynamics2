// scripts/run_experiments.ts
//
// Batch runner for the numerical experiments E1-E7 of docs/EXPERIMENT_PLAN.md.
//
// Reporting rules (see CLAUDE.md, "never report a simulation as validated
// without a number and a tolerance"):
//   * every reported quantity is a MEAN over a steady-state averaging window,
//     never a single instantaneous sample. Tumbling-mill torque fluctuates as
//     lifters pass the charge, so one sample is not a measurement.
//   * every mean is accompanied by its standard deviation over that window, and
//     by a drift check comparing the first and second halves of the window. A
//     run that has not settled is flagged rather than quietly averaged.
import fs from 'fs';
import path from 'path';
import { loadSolver } from '../tests/helpers/loadWasm';
import { getDefaultConfig, ConfigValues, computeDerived } from '../src/config';
import { generateCsv, DataPoint } from '../src/export/csv';
import { MODE_SLUMP } from '../src/modes';

// Steady state is reached by t ~ 1 s for the reference case (measured: the
// torque mean over 0.5-1.0 s and over 2.5-3.0 s agree to 0.6 %). Run to 3 s and
// average over the last 1.5 s.
const T_END = 3.0;
const T_AVG_START = 1.5;

export interface Summary {
  label: string;
  torque: number;
  torqueSd: number;
  torqueDrift: number;
  power: number;
  meanShearBed: number;
  meanShearFree: number;
  maxVel: number;
  yieldedFraction: number;
  kineticEnergy: number;
  maxDiv: number;
  maxDivNorm: number;
  settled: boolean;
  cfg: ConfigValues;
}

function stats(xs: number[]) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const h = Math.floor(n / 2);
  const m1 = xs.slice(0, h).reduce((a, b) => a + b, 0) / h;
  const m2 = xs.slice(h).reduce((a, b) => a + b, 0) / (n - h);
  const drift = mean !== 0 ? Math.abs(m2 - m1) / Math.abs(mean) : 0;
  return { mean, sd, drift };
}

async function runSimulation(
  cfg: ConfigValues,
  label: string,
  tEnd: number = T_END,
  tAvgStart: number = T_AVG_START
): Promise<{ timeSeries: DataPoint[]; summary: Summary }> {
  const { e } = await loadSolver(false);
  const derived = computeDerived(cfg);
  const N = <number>cfg.N;
  const dt = <number>cfg.maxDt;

  e.setBoundaryMode(MODE_SLUMP);
  e.createSolver(N, derived.L);
  e.setFluid(<number>cfg.rho, <number>cfg.K);
  e.setRheology(
    <number>cfg.K, <number>cfg.n, <number>cfg.tauY,
    <number>cfg.m, <number>cfg.muMin, <number>cfg.muMax
  );

  const thetaReposeRad = (<number>cfg.thetaRepose * Math.PI) / 180.0;
  const alphaLifterRad = (<number>cfg.alphaLifter * Math.PI) / 180.0;

  e.setMillGeometry(
    derived.R, derived.omega, <number>cfg.nLifters,
    <number>cfg.hLifter, <number>cfg.wLifter, alphaLifterRad
  );
  e.setBedParameters(
    <number>cfg.fillJ, thetaReposeRad, <number>cfg.kSlip,
    <number>cfg.porosity, <number>cfg.dp,
    <number>cfg.A_ergun, <number>cfg.B_ergun, <number>cfg.C_gamma
  );

  e.setPenalization(<number>cfg.etaPenal);
  e.setViscousIterations(<number>cfg.nVisc);
  e.setSubSteps(1);            // the runner controls dt directly
  e.setFixedTimeStep(dt);
  e.setCFL(<number>cfg.cfl);
  e.setMaxTimeStep(<number>cfg.maxDt);
  e.setAdvectionScheme(cfg.advectionScheme === 'semi-lagrangian' ? 0 : 1);
  e.setGravity(0.0, -<number>cfg.gravity);

  const steps = Math.ceil(tEnd / dt);
  const timeSeries: DataPoint[] = [];
  const win: DataPoint[] = [];

  for (let s = 0; s < steps; s++) {
    e.step(dt);
    const simTime = e.getTime();
    const sample: DataPoint = {
      time: simTime,
      dt,
      torque: e.diagTorque(),
      power: e.diagTorque() * Math.abs(derived.omega),
      meanShearBed: e.diagBedMeanShearRate(),
      meanShearFree: e.diagFreeMeanShearRate(),
      maxVel: e.diagMaxVel(),
      yieldedFraction: e.diagYieldedFraction(),
      kineticEnergy: e.diagKineticEnergy(),
      maxDiv: e.diagMaxDiv()
    };
    if (simTime >= tAvgStart) win.push(sample);
    if (s % 10 === 0 || s === steps - 1) timeSeries.push(sample);
  }

  const pick = (f: (d: DataPoint) => number) => stats(win.map(f));
  const tq = pick(d => d.torque);
  const uRef = Math.max(derived.tipSpeed, 1e-9);

  const summary: Summary = {
    label,
    torque: tq.mean,
    torqueSd: tq.sd,
    torqueDrift: tq.drift,
    power: tq.mean * Math.abs(derived.omega),
    meanShearBed: pick(d => d.meanShearBed).mean,
    meanShearFree: pick(d => d.meanShearFree).mean,
    maxVel: pick(d => d.maxVel).mean,
    yieldedFraction: pick(d => d.yieldedFraction).mean,
    kineticEnergy: pick(d => d.kineticEnergy).mean,
    maxDiv: pick(d => d.maxDiv).mean,
    maxDivNorm: (pick(d => d.maxDiv).mean * derived.dx) / uRef,
    settled: tq.drift < 0.05,
    cfg: { ...cfg }
  };

  return { timeSeries, summary };
}

const outDir = path.join(process.cwd(), 'results');
const allSummaries: Summary[] = [];

async function doRun(cfg: ConfigValues, label: string, fname: string, tEnd = T_END) {
  const t0 = Date.now();
  const { timeSeries, summary } = await runSimulation(cfg, label, tEnd);
  fs.writeFileSync(path.join(outDir, fname), generateCsv(cfg, timeSeries), 'utf-8');
  allSummaries.push(summary);
  const flag = summary.settled ? '  ' : ' !';
  console.log(
    `${flag}${label.padEnd(26)} T=${summary.torque.toFixed(1).padStart(8)}` +
    ` ±${summary.torqueSd.toFixed(1).padStart(6)}` +
    `  P=${(summary.power / 1000).toFixed(2).padStart(7)} kW/m` +
    `  yielded=${(summary.yieldedFraction * 100).toFixed(1).padStart(5)}%` +
    `  bedGd=${summary.meanShearBed.toFixed(2).padStart(6)}` +
    `  divN=${summary.maxDivNorm.toExponential(1)}` +
    `  drift=${(summary.torqueDrift * 100).toFixed(1)}%` +
    `  [${((Date.now() - t0) / 1000).toFixed(0)}s]`
  );
  return summary;
}

// Baseline for the sweeps. N=128 (Delta x = 8 mm) is the interactive default and
// the resolution every sweep below uses, so the sweeps are internally
// comparable. E5 quantifies what changing N does to the absolute level.
function sweepBase(): ConfigValues {
  const cfg = getDefaultConfig();
  cfg.N = 128;
  cfg.nVisc = 12;
  return cfg;
}

async function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Clear stale CSVs from earlier (pre-fix) runs so results/ cannot mix vintages.
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.csv') || f.endsWith('.json') || f.endsWith('.md')) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }

  console.log('=== MillDynamics2 experiments E1-E7 ===');
  console.log(`Averaging window ${T_AVG_START}-${T_END} s; "!" marks a run whose`);
  console.log('torque drifted more than 5% across that window.\n');

  // ---- E1: rheology sweep -------------------------------------------------
  console.log('--- E1: rheology sweep (n x tau_y) ---');
  for (const n of [0.4, 0.6, 0.8, 1.0, 1.2]) {
    for (const tauY of [0.0, 5.0, 20.0, 50.0]) {
      const cfg = sweepBase();
      cfg.n = n;
      cfg.tauY = tauY;
      await doRun(cfg, `E1 n=${n} tauY=${tauY}`, `E1_n${n}_tauY${tauY}.csv`);
    }
  }

  // ---- E2: mill speed sweep ----------------------------------------------
  console.log('\n--- E2: mill speed sweep ---');
  for (const spd of [40, 55, 65, 75, 85, 95, 110]) {
    const cfg = sweepBase();
    cfg.speedFraction = spd;
    await doRun(cfg, `E2 speed=${spd}%Nc`, `E2_speed_${spd}pct.csv`);
  }

  // ---- E3: fill level -----------------------------------------------------
  console.log('\n--- E3: fill level sweep ---');
  for (const J of [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45]) {
    const cfg = sweepBase();
    cfg.fillJ = J;
    await doRun(cfg, `E3 J=${J}`, `E3_fill_J${J}.csv`);
  }

  // ---- E4: media size -----------------------------------------------------
  console.log('\n--- E4: media size sweep ---');
  for (const dp of [0.0005, 0.001, 0.002, 0.005]) {
    const cfg = sweepBase();
    cfg.dp = dp;
    await doRun(cfg, `E4 dp=${dp * 1000}mm`, `E4_dp_${dp * 1000}mm.csv`);
  }

  // ---- E5: grid convergence ----------------------------------------------
  console.log('\n--- E5: grid convergence (identical dt) ---');
  for (const N of [64, 128, 256, 512]) {
    const cfg = sweepBase();
    cfg.N = N;
    await doRun(cfg, `E5 N=${N}`, `E5_grid_N${N}.csv`);
  }

  // ---- E7: regularization / numerical sensitivity ------------------------
  console.log('\n--- E7a: Papanastasiou m ---');
  for (const m of [50, 500, 5000, 50000]) {
    const cfg = sweepBase();
    cfg.tauY = 20.0;
    cfg.m = m;
    await doRun(cfg, `E7a m=${m}`, `E7a_m_${m}.csv`);
  }
  console.log('\n--- E7b: mu_max clamp ---');
  for (const muMax of [1e2, 1e3, 1e4]) {
    const cfg = sweepBase();
    cfg.tauY = 20.0;
    cfg.muMax = muMax;
    await doRun(cfg, `E7b muMax=${muMax}`, `E7b_muMax_${muMax}.csv`);
  }
  console.log('\n--- E7c: viscous iterations ---');
  for (const nVisc of [8, 24, 64]) {
    const cfg = sweepBase();
    cfg.tauY = 20.0;
    cfg.nVisc = nVisc;
    await doRun(cfg, `E7c nVisc=${nVisc}`, `E7c_nVisc_${nVisc}.csv`);
  }

  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify(allSummaries, null, 2),
    'utf-8'
  );
  console.log(`\n=== ${allSummaries.length} runs complete -> results/summary.json ===`);

  const unsettled = allSummaries.filter(s => !s.settled);
  if (unsettled.length > 0) {
    console.log(`WARNING: ${unsettled.length} run(s) had >5% torque drift across the averaging window:`);
    for (const s of unsettled) console.log(`  ${s.label} (drift ${(s.torqueDrift * 100).toFixed(1)}%)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
