// src/presets.ts
import { ConfigValues, getDefaultConfig } from './config';

export interface PresetDef {
  id: string;
  name: string;
  description: string;
  overrides: Partial<ConfigValues>;
}

// Nc for the D = 1 m reference mill (d_p = 2 mm, g = 9.81 m/s²) is 42.34 rpm.
// Presets stated in %Nc store the corresponding rpm rounded to the control's
// 0.05 rpm step; the E1-E7 runner recomputes the exact value with
// config.ts::rpmFromSpeedFraction rather than reading it back from here.
export const PRESETS: PresetDef[] = [
  {
    id: 'default',
    name: '0. Default — Smooth Drum, 100 cP Slurry',
    description:
      'The start-up state: D=1 m, 30 rpm (≈ 71% Nc), no lifters, J=0.30, Newtonian slurry of 100 cP (K=0.1 Pa·s, n=1, τy=0) at N=128',
    overrides: {
      N: 128,
      nSub: 1,
      nVisc: 12,
      D: 1.0,
      nLifters: 0,
      millRpm: 30.0,
      rotDirection: 'CCW',
      fillJ: 0.30,
      porosity: 0.40,
      dp: 0.002,
      rho: 1800.0,
      rheologyMode: 'newtonian',
      K: 0.1,
      n: 1.0,
      tauY: 0.0
    }
  },
  {
    id: 'baseline',
    name: '1. Baseline Industrial Ball Mill (E1–E7 reference)',
    description: 'D=1m, 75% Nc (31.75 rpm), 8 lifters, J=0.30, Herschel–Bulkley slurry (K=0.5, n=0.7, τy=5 Pa, ρ=1800 kg/m³) at the interactive resolution N=128',
    overrides: {
      N: 128,
      nSub: 1,
      nVisc: 12,
      D: 1.0,
      nLifters: 8,
      hLifter: 0.025,
      wLifter: 0.020,
      alphaLifter: 0.0,
      millRpm: 31.75, // 75.0% of Nc = 42.34 rpm
      rotDirection: 'CCW',
      fillJ: 0.30,
      porosity: 0.40,
      dp: 0.002,
      rho: 1800.0,
      rheologyMode: 'herschel-bulkley',
      K: 0.5,
      n: 0.7,
      tauY: 5.0
    }
  },
  {
    id: 'newtonian',
    name: '2. Newtonian Reference (Water-like)',
    description: 'Water-like slurry (K=1 mPa·s, n=1.0, τy=0 Pa, ρ=1000 kg/m³)',
    overrides: {
      rho: 1000.0,
      rheologyMode: 'newtonian',
      K: 0.001,
      n: 1.0,
      tauY: 0.0
    }
  },
  {
    id: 'high-yield',
    name: '3. High-Yield-Stress Paste',
    description: 'Highly structured concentrated mineral paste with prominent yield stress (τy=50 Pa, K=1.0, n=0.8)',
    overrides: {
      rheologyMode: 'herschel-bulkley',
      K: 1.0,
      n: 0.8,
      tauY: 50.0
    }
  },
  {
    id: 'shear-thinning',
    name: '4. Strongly Shear-Thinning',
    description: 'Strongly pseudoplastic slurry exhibiting severe viscosity drop in high-shear bed zones (n=0.4, K=2.0, τy=2 Pa)',
    overrides: {
      rheologyMode: 'herschel-bulkley',
      K: 2.0,
      n: 0.4,
      tauY: 2.0
    }
  },
  {
    id: 'shear-thickening',
    name: '5. Shear-Thickening (Dilatant)',
    description: 'Dilatant slurry that hardens under high shear rates (n=1.3, K=0.2, τy=0 Pa)',
    overrides: {
      rheologyMode: 'power-law',
      K: 0.2,
      n: 1.3,
      tauY: 0.0
    }
  },
  {
    id: 'low-speed',
    name: '6. Low-Speed Cascading',
    description: 'Sub-critical tumbling regime at 55% Nc (23.30 rpm) with higher charge fill J=0.35',
    overrides: {
      millRpm: 23.30, // 55.0% of Nc = 42.34 rpm
      fillJ: 0.35
    }
  },
  {
    id: 'supercritical',
    name: '7. Supercritical Centrifuging',
    description: 'Over-speed at 110% Nc (46.55 rpm) exceeding critical centrifuging speed',
    overrides: {
      millRpm: 46.55, // 109.9% of Nc = 42.34 rpm
      fillJ: 0.30
    }
  },
  {
    id: 'fine-media',
    name: '8. Fine Media (dp = 0.5 mm)',
    description: 'Ultra-fine grinding beads (dp=0.5 mm) with high flow resistance',
    overrides: {
      dp: 0.0005
    }
  },
  {
    id: 'coarse-media',
    name: '9. Coarse Media (dp = 5.0 mm)',
    description: 'Large grinding balls (dp=5.0 mm) with high permeability',
    overrides: {
      dp: 0.005
    }
  },
  {
    id: 'rve-closure',
    name: '10. RVE Micro Scale Closure',
    description: 'Representative Volume Element micro-scale simulation (N=256, 1-ε=0.60, hexagonal packing)',
    overrides: {
      N_rve: 256,
      rvePhi: 0.60,
      rvePacking: 'hexagonal',
      rveFx: 1.0
    }
  }
];

export function applyPreset(presetId: string, currentCfg?: ConfigValues): ConfigValues {
  const base = currentCfg ? { ...currentCfg } : getDefaultConfig();
  const found = PRESETS.find(p => p.id === presetId);
  if (found) {
    Object.assign(base, found.overrides);
  }
  return base;
}
