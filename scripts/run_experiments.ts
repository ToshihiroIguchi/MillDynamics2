// scripts/run_experiments.ts
import fs from 'fs';
import path from 'path';
import { loadSolver } from '../tests/helpers/loadWasm';
import { getDefaultConfig, ConfigValues, computeDerived } from '../src/config';
import { generateCsv, DataPoint } from '../src/export/csv';

const MODE_SLUMP = 4;

async function runSimulation(cfg: ConfigValues, tMax: number = 2.0): Promise<DataPoint[]> {
  const { e } = await loadSolver(false);
  const derived = computeDerived(cfg);
  const N = <number>cfg.N;
  const L = derived.L;
  const dt = <number>cfg.maxDt;

  e.setBoundaryMode(MODE_SLUMP);
  e.createSolver(N, L);
  e.setFluid(<number>cfg.rho, <number>cfg.K);
  e.setRheology(
    <number>cfg.K,
    <number>cfg.n,
    <number>cfg.tauY,
    <number>cfg.m,
    <number>cfg.muMin,
    <number>cfg.muMax
  );

  const thetaReposeRad = (<number>cfg.thetaRepose * Math.PI) / 180.0;
  const alphaLifterRad = (<number>cfg.alphaLifter * Math.PI) / 180.0;

  e.setMillGeometry(
    derived.R,
    derived.omega,
    <number>cfg.nLifters,
    <number>cfg.hLifter,
    <number>cfg.wLifter,
    alphaLifterRad
  );

  e.setBedParameters(
    <number>cfg.fillJ,
    thetaReposeRad,
    <number>cfg.kSlip,
    <number>cfg.porosity,
    <number>cfg.dp,
    <number>cfg.A_ergun,
    <number>cfg.B_ergun,
    <number>cfg.C_gamma
  );

  e.setPenalization(<number>cfg.etaPenal);
  e.setViscousIterations(<number>cfg.nVisc);
  e.setSubSteps(<number>cfg.nSub);
  e.setFixedTimeStep(dt);
  e.setGravity(0.0, -<number>cfg.gravity);

  const steps = Math.ceil(tMax / dt);
  const timeSeries: DataPoint[] = [];

  for (let s = 0; s < steps; s++) {
    e.step(dt);
    if (s % 10 === 0 || s === steps - 1) {
      const simTime = e.getTime();
      const torque = e.diagTorque();
      const power = torque * Math.abs(derived.omega);
      const meanShearBed = e.diagBedMeanShearRate();
      const meanShearFree = e.diagFreeMeanShearRate();
      const maxVel = e.diagMaxVel();
      const yieldedFraction = e.diagYieldedFraction();
      const kineticEnergy = e.diagKineticEnergy();
      const maxDiv = e.diagMaxDiv();

      timeSeries.push({
        time: simTime,
        dt,
        torque,
        power,
        meanShearBed,
        meanShearFree,
        maxVel,
        yieldedFraction,
        kineticEnergy,
        maxDiv
      });
    }
  }

  return timeSeries;
}

async function main() {
  const outDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('=== Running Experiments E1–E7 Headless Batch ===\n');

  // E1: Rheology Sweep
  console.log('--- Running Experiment E1: Rheology Sweep ---');
  const nList = [0.4, 0.7, 1.0, 1.2];
  const tauYList = [0.0, 5.0, 20.0];
  for (const n of nList) {
    for (const tauY of tauYList) {
      const cfg = getDefaultConfig();
      cfg.N = 64; // Fast resolution for automated test
      cfg.n = n;
      cfg.tauY = tauY;
      const ts = await runSimulation(cfg, 0.5);
      const csv = generateCsv(cfg, ts);
      const fname = path.join(outDir, `E1_n${n}_tauY${tauY}.csv`);
      fs.writeFileSync(fname, csv, 'utf-8');
      const last = ts[ts.length - 1];
      console.log(`E1 (n=${n}, tauY=${tauY}Pa): Power=${last.power.toFixed(1)} W/m, Yielded=${(last.yieldedFraction * 100).toFixed(1)}% -> ${path.basename(fname)}`);
    }
  }

  // E2: Speed Sweep
  console.log('\n--- Running Experiment E2: Mill Speed Sweep ---');
  const speeds = [40, 55, 75, 95, 110];
  for (const spd of speeds) {
    const cfg = getDefaultConfig();
    cfg.N = 64;
    cfg.speedFraction = spd;
    const ts = await runSimulation(cfg, 0.5);
    const csv = generateCsv(cfg, ts);
    const fname = path.join(outDir, `E2_speed_${spd}pct.csv`);
    fs.writeFileSync(fname, csv, 'utf-8');
    const last = ts[ts.length - 1];
    console.log(`E2 (Speed=${spd}% Nc): Power=${last.power.toFixed(1)} W/m, Torque=${last.torque.toFixed(1)} N*m/m`);
  }

  // E3: Fill Level Sweep
  console.log('\n--- Running Experiment E3: Fill Level Sweep ---');
  const fills = [0.15, 0.30, 0.45];
  for (const J of fills) {
    const cfg = getDefaultConfig();
    cfg.N = 64;
    cfg.fillJ = J;
    const ts = await runSimulation(cfg, 0.5);
    const csv = generateCsv(cfg, ts);
    const fname = path.join(outDir, `E3_fill_J${J}.csv`);
    fs.writeFileSync(fname, csv, 'utf-8');
    const last = ts[ts.length - 1];
    console.log(`E3 (J=${J}): Power=${last.power.toFixed(1)} W/m, Bed Mean Shear=${last.meanShearBed.toFixed(1)} s^-1`);
  }

  // E4: Media Size Sweep
  console.log('\n--- Running Experiment E4: Media Size Sweep ---');
  const dps = [0.0005, 0.002, 0.005];
  for (const dp of dps) {
    const cfg = getDefaultConfig();
    cfg.N = 64;
    cfg.dp = dp;
    const ts = await runSimulation(cfg, 0.5);
    const csv = generateCsv(cfg, ts);
    const fname = path.join(outDir, `E4_dp_${dp * 1000}mm.csv`);
    fs.writeFileSync(fname, csv, 'utf-8');
    const last = ts[ts.length - 1];
    console.log(`E4 (dp=${dp * 1000}mm): Power=${last.power.toFixed(1)} W/m, Bed Mean Shear=${last.meanShearBed.toFixed(1)} s^-1`);
  }

  // E5: Grid Convergence
  console.log('\n--- Running Experiment E5: Grid Convergence ---');
  const grids = [64, 128];
  for (const N of grids) {
    const cfg = getDefaultConfig();
    cfg.N = N;
    const ts = await runSimulation(cfg, 0.3);
    const csv = generateCsv(cfg, ts);
    const fname = path.join(outDir, `E5_grid_N${N}.csv`);
    fs.writeFileSync(fname, csv, 'utf-8');
    const last = ts[ts.length - 1];
    console.log(`E5 (N=${N}): Torque=${last.torque.toFixed(1)} N*m/m, maxDiv=${last.maxDiv.toExponential(2)}`);
  }

  // E7: Regularization Sensitivity
  console.log('\n--- Running Experiment E7: Regularization Sensitivity ---');
  const mList = [100.0, 1000.0, 10000.0];
  for (const m of mList) {
    const cfg = getDefaultConfig();
    cfg.N = 64;
    cfg.tauY = 10.0;
    cfg.m = m;
    const ts = await runSimulation(cfg, 0.3);
    const csv = generateCsv(cfg, ts);
    const fname = path.join(outDir, `E7_m_${m}.csv`);
    fs.writeFileSync(fname, csv, 'utf-8');
    const last = ts[ts.length - 1];
    console.log(`E7 (m=${m}s): Yielded=${(last.yieldedFraction * 100).toFixed(1)}%, Power=${last.power.toFixed(1)} W/m`);
  }

  console.log('\n=== All Experiments Completed Successfully ===');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
