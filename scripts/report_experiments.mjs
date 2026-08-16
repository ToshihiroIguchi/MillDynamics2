// scripts/report_experiments.mjs
// Turn results/summary.json into the markdown tables used by docs/VALIDATION.md.
// Keeping this mechanical means the numbers in the document are the numbers the
// runner produced, rather than being retyped by hand.
import fs from 'node:fs';
import path from 'path';

const summary = JSON.parse(fs.readFileSync(path.join('results', 'summary.json'), 'utf-8'));
const by = (prefix) => summary.filter(s => s.label.startsWith(prefix));

const f = (x, d = 1) => Number(x).toFixed(d);
const kw = (p) => (p / 1000).toFixed(2);

function table(head, rows) {
  return [`| ${head.join(' | ')} |`,
          `| ${head.map(() => '---').join(' | ')} |`,
          ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

const out = [];

// E1: n x tau_y grid of power draw and yielded fraction
{
  const ns = [...new Set(by('E1').map(s => s.cfg.n))].sort((a, b) => a - b);
  const tys = [...new Set(by('E1').map(s => s.cfg.tauY))].sort((a, b) => a - b);
  const get = (n, ty) => by('E1').find(s => s.cfg.n === n && s.cfg.tauY === ty);
  out.push('**E1 — power draw [kW/m]** (rows: flow index `n`, cols: `tau_y` [Pa])\n');
  out.push(table(['n \\ tau_y', ...tys.map(String)],
    ns.map(n => [String(n), ...tys.map(ty => { const s = get(n, ty); return s ? kw(s.power) : '—'; })])));
  out.push('\n**E1 — yielded area fraction [%]**\n');
  out.push(table(['n \\ tau_y', ...tys.map(String)],
    ns.map(n => [String(n), ...tys.map(ty => { const s = get(n, ty); return s ? f(s.yieldedFraction * 100, 1) : '—'; })])));
}

// E2, E3, E4: one-dimensional sweeps
// Critical speed [rpm] for a summary's own config, so the rpm the solver ran at
// can be reported alongside the %Nc the sweep was designed in.
const ncRpm = (cfg) => {
  const effR = Math.max(0.5 * cfg.D - 0.5 * cfg.dp, 0.01);
  return (60 / (2 * Math.PI)) * Math.sqrt(cfg.gravity / effR);
};

const sweep = (prefix, key, keyLabel, fmtKey = String) => {
  const rows = by(prefix).map(s => [
    fmtKey(s.cfg[key], s),
    f(s.torque, 1), f(s.torqueSd, 1), kw(s.power),
    f(s.yieldedFraction * 100, 1), f(s.meanShearBed, 2), f(s.meanShearFree, 2),
    f(s.maxVel, 2)
  ]);
  return table([keyLabel, 'T [N·m/m]', '±sd', 'P [kW/m]', 'yielded [%]', 'bed γ̇ [1/s]', 'free γ̇ [1/s]', 'max|u| [m/s]'], rows);
};

out.push('\n**E2 — mill speed sweep**\n');
out.push(sweep('E2', 'millRpm', 'speed [rpm] (%Nc)',
  (v, s) => `${f(v, 2)} (${f((100 * v) / ncRpm(s.cfg), 0)}%)`));
out.push('\n**E3 — fill level sweep**\n');
out.push(sweep('E3', 'fillJ', 'J'));
out.push('\n**E4 — media size sweep**\n');
out.push(sweep('E4', 'dp', 'd_p [mm]', v => String(v * 1000)));

// E5: grid convergence
{
  const rows = by('E5').sort((a, b) => a.cfg.N - b.cfg.N).map(s => [
    String(s.cfg.N),
    f((s.cfg.D * (1 + 2 * s.cfg.margin)) / s.cfg.N * 1000, 2),
    f(s.torque, 1),
    kw(s.power),
    f(s.yieldedFraction * 100, 1),
    s.maxDivNorm.toExponential(1)
  ]);
  out.push('\n**E5 — grid convergence** (identical Δt = 2e-3 s)\n');
  out.push(table(['N', 'Δx [mm]', 'T [N·m/m]', 'P [kW/m]', 'yielded [%]', 'max|∇·u|Δx/U'], rows));

  const sorted = by('E5').sort((a, b) => a.cfg.N - b.cfg.N);
  for (let i = 1; i < sorted.length; i++) {
    const rel = Math.abs(sorted[i].torque - sorted[i - 1].torque) / Math.abs(sorted[i - 1].torque);
    out.push(`\n- torque change ${sorted[i - 1].cfg.N} → ${sorted[i].cfg.N}: **${(rel * 100).toFixed(1)} %**`);
  }
}

// E7: numerical sensitivity
const e7 = (prefix, key, label) => {
  const rows = by(prefix).map(s => [
    String(s.cfg[key]), f(s.torque, 1), kw(s.power), f(s.yieldedFraction * 100, 2)
  ]);
  return table([label, 'T [N·m/m]', 'P [kW/m]', 'yielded [%]'], rows);
};
out.push('\n**E7a — Papanastasiou regularization `m`** (τ_y = 20 Pa)\n');
out.push(e7('E7a', 'm', 'm [s]'));
out.push('\n**E7b — viscosity clamp `mu_max`**\n');
out.push(e7('E7b', 'muMax', 'mu_max [Pa·s]'));
out.push('\n**E7c — viscous iterations `n_visc`**\n');
out.push(e7('E7c', 'nVisc', 'n_visc'));

const unsettled = summary.filter(s => !s.settled);
out.push(`\n_${summary.length} runs; ${unsettled.length} flagged as not settled._`);
if (unsettled.length) out.push(unsettled.map(s => `  - ${s.label} (drift ${(s.torqueDrift * 100).toFixed(1)}%)`).join('\n'));

const text = out.join('\n');
fs.writeFileSync(path.join('results', 'SUMMARY.md'), text, 'utf-8');
console.log(text);
