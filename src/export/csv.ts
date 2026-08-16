// src/export/csv.ts
// Export simulation data with comprehensive parameter metadata block (PARAMETERS.md §9)

import { ConfigValues, computeDerived, PARAM_SCHEMA } from '../config';

export interface DataPoint {
  time: number;
  dt: number;
  torque: number;
  power: number;
  meanShearBed: number;
  meanShearFree: number;
  maxVel: number;
  yieldedFraction: number;
  kineticEnergy: number;
  maxDiv: number;
}

export function generateCsv(cfg: ConfigValues, timeSeries: DataPoint[]): string {
  const derived = computeDerived(cfg);
  const lines: string[] = [];

  // 1. Metadata Block
  lines.push('# MillDynamics2 Simulation Export');
  lines.push(`# ExportedAt: ${new Date().toISOString()}`);
  lines.push('# Parameter Metadata Block:');

  for (const p of PARAM_SCHEMA) {
    const val = cfg[p.key];
    lines.push(`#   ${p.key} (${p.label}): ${val} ${p.unit}`);
  }

  lines.push('# Derived Parameters:');
  lines.push(`#   Mill Radius R: ${derived.R.toFixed(4)} m`);
  lines.push(`#   Domain Size L: ${derived.L.toFixed(4)} m`);
  lines.push(`#   Cell Size dx: ${derived.dx_mm.toFixed(3)} mm`);
  lines.push(`#   Critical Speed Nc: ${derived.Nc_rpm.toFixed(2)} rpm (${derived.Nc_rev_s.toFixed(3)} rev/s)`);
  lines.push(`#   Speed Fraction: ${derived.speedFraction.toFixed(2)} %Nc`);
  lines.push(`#   Angular Velocity omega: ${derived.omega.toFixed(4)} rad/s`);
  lines.push(`#   Tip Speed: ${derived.tipSpeed.toFixed(3)} m/s`);
  lines.push(`#   Permeability K_perm: ${derived.K_perm.toExponential(4)} m^2`);
  lines.push(`#   Pore Shear Rate: ${derived.gammaPore.toFixed(1)} s^-1`);
  lines.push('#');

  // 2. Data Header
  lines.push('time_s,dt_s,torque_Nm_m,power_W_m,mean_shear_bed_s1,mean_shear_free_s1,max_vel_m_s,yielded_fraction,kinetic_energy_J_m,max_div_s1');

  // 3. Data Rows
  for (const pt of timeSeries) {
    lines.push([
      pt.time.toFixed(4),
      pt.dt.toExponential(4),
      pt.torque.toFixed(3),
      pt.power.toFixed(3),
      pt.meanShearBed.toFixed(2),
      pt.meanShearFree.toFixed(2),
      pt.maxVel.toFixed(4),
      pt.yieldedFraction.toFixed(4),
      pt.kineticEnergy.toFixed(4),
      pt.maxDiv.toExponential(4)
    ].join(','));
  }

  return lines.join('\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
