// src/config.ts
// Single Source of Truth for all simulation parameters (docs/PARAMETERS.md)

export type ParamGroup =
  | 'geometry'
  | 'operating'
  | 'charge'
  | 'rheology'
  | 'closure'
  | 'numerics'
  | 'rve';

export interface ParamDef {
  key: string;
  group: ParamGroup;
  label: string;
  unit: string;
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
  rebuildsSolver: boolean;
  notes?: string;
  // Model-internal or numerical knobs that a normal run never touches (gravity,
  // the Papanastasiou regularization, the Ergun constants, the penalization
  // time...). The panel collects these into one "Advanced" section instead of
  // interleaving them with the operating parameters, where they read as if they
  // were part of the everyday input set.
  advanced?: boolean;
}

export const PARAM_SCHEMA: ParamDef[] = [
  // 1. Geometry
  { key: 'D', group: 'geometry', label: 'Mill Diameter', unit: 'm', default: 1.0, min: 0.05, max: 10.0, step: 0.05, rebuildsSolver: true, notes: 'Mill inner diameter' },
  { key: 'margin', group: 'geometry', label: 'Domain Margin', unit: '-', default: 0.012, min: 0.005, max: 0.2, step: 0.001, rebuildsSolver: true, advanced: true, notes: 'Solid padding outside the shell, as a fraction of D. Only affects how much dead space surrounds the mill.' },
  { key: 'nLifters', group: 'geometry', label: 'Lifter Count', unit: '-', default: 0, min: 0, max: 32, step: 1, rebuildsSolver: false, notes: '0 = smooth drum (default). Raise it to fit n_L radial lifter bars to the shell.' },
  { key: 'hLifter', group: 'geometry', label: 'Lifter Height', unit: 'm', default: 0.025, min: 0.0, max: 0.5, step: 0.005, rebuildsSolver: false, notes: 'Has no effect while Lifter Count = 0.' },
  { key: 'wLifter', group: 'geometry', label: 'Lifter Width', unit: 'm', default: 0.020, min: 0.0, max: 0.5, step: 0.005, rebuildsSolver: false, notes: 'Has no effect while Lifter Count = 0.' },
  { key: 'alphaLifter', group: 'geometry', label: 'Lifter Face Angle', unit: 'deg', default: 0.0, min: -45.0, max: 45.0, step: 1.0, rebuildsSolver: false, notes: 'Has no effect while Lifter Count = 0.' },

  // 2. Operating Conditions
  {
    // step 0.05 so a preset stated in %Nc (31.75 rpm = 75 % for the reference
    // mill) lands on the slider grid instead of snapping away from the number box.
    key: 'millRpm', group: 'operating', label: 'Mill Speed', unit: 'rpm', default: 30.0, min: 0.0, max: 300.0, step: 0.05, rebuildsSolver: false,
    notes: 'Shell rotation rate in revolutions per minute — the primary speed control. The equivalent fraction of the critical speed (%Nc) depends on D, d_p and g and is shown read-only in the diagnostics.'
  },
  {
    key: 'rotDirection', group: 'operating', label: 'Rotation Direction', unit: '-', default: 'CCW', rebuildsSolver: false,
    options: [{ value: 'CCW', label: 'Counter-Clockwise (CCW)' }, { value: 'CW', label: 'Clockwise (CW)' }]
  },
  { key: 'gravity', group: 'operating', label: 'Gravity', unit: 'm/s²', default: 9.81, min: 0.0, max: 30.0, step: 0.1, rebuildsSolver: false, advanced: true, notes: 'Terrestrial gravity unless you are deliberately running a verification case; g = 0 makes the flow purely rotation-driven.' },

  // 3. Charge and Media
  { key: 'fillJ', group: 'charge', label: 'Fill Fraction (J)', unit: '-', default: 0.30, min: 0.0, max: 0.60, step: 0.01, rebuildsSolver: false },
  { key: 'thetaRepose', group: 'charge', label: 'Dynamic Angle of Repose', unit: 'deg', default: 40.0, min: 0.0, max: 70.0, step: 1.0, rebuildsSolver: false },
  { key: 'porosity', group: 'charge', label: 'Bed Porosity (ε)', unit: '-', default: 0.40, min: 0.26, max: 0.95, step: 0.01, rebuildsSolver: false },
  { key: 'dp', group: 'charge', label: 'Media Diameter (dp)', unit: 'm', default: 0.002, min: 0.0001, max: 0.05, step: 0.0005, rebuildsSolver: false },
  { key: 'kSlip', group: 'charge', label: 'Charge Slip Factor', unit: '-', default: 0.85, min: 0.0, max: 1.0, step: 0.05, rebuildsSolver: false, advanced: true, notes: 'Bed angular velocity as a fraction of the shell ω. A closure of the prescribed-charge model (PHYSICS.md A4), not an operating setting.' },

  // 4. Slurry Rheology
  { key: 'rho', group: 'rheology', label: 'Slurry Density', unit: 'kg/m³', default: 1800.0, min: 500.0, max: 6000.0, step: 50.0, rebuildsSolver: false },
  {
    key: 'rheologyMode', group: 'rheology', label: 'Rheology Mode', unit: '-', default: 'newtonian', rebuildsSolver: false,
    options: [
      { value: 'newtonian', label: 'Newtonian (n=1, τy=0)' },
      { value: 'power-law', label: 'Power-Law (τy=0)' },
      { value: 'bingham', label: 'Bingham Plastic (n=1)' },
      { value: 'herschel-bulkley', label: 'Herschel–Bulkley (General)' }
    ]
  },
  {
    key: 'K', group: 'rheology', label: 'Viscosity / Consistency (K)', unit: 'Pa·sⁿ', default: 0.1, min: 0.0001, max: 100.0, step: 0.01, rebuildsSolver: false,
    notes: 'In Newtonian mode (n = 1) this is simply the slurry viscosity μ. The default 0.1 Pa·s = 100 cP. For n ≠ 1 it is the consistency index of the power-law term.'
  },
  { key: 'n', group: 'rheology', label: 'Flow Index (n)', unit: '-', default: 1.0, min: 0.2, max: 2.0, step: 0.05, rebuildsSolver: false, notes: 'n = 1 Newtonian, n < 1 shear-thinning, n > 1 shear-thickening.' },
  { key: 'tauY', group: 'rheology', label: 'Yield Stress (τy)', unit: 'Pa', default: 0.0, min: 0.0, max: 500.0, step: 0.5, rebuildsSolver: false },
  { key: 'm', group: 'rheology', label: 'Regularization (m)', unit: 's', default: 1000.0, min: 10.0, max: 100000.0, step: 100.0, rebuildsSolver: false, advanced: true, notes: 'Papanastasiou regularization of the yield term. Numerical, not physical — see experiment E7a.' },
  { key: 'muMin', group: 'rheology', label: 'Min Viscosity Clamp', unit: 'Pa·s', default: 1e-4, min: 1e-6, max: 1.0, step: 1e-4, rebuildsSolver: false, advanced: true, notes: 'Numerical floor on μ_app.' },
  { key: 'muMax', group: 'rheology', label: 'Max Viscosity Clamp', unit: 'Pa·s', default: 1e3, min: 1.0, max: 1e6, step: 100.0, rebuildsSolver: false, advanced: true, notes: 'Numerical ceiling on μ_app; governs the stiffness of unyielded regions — see experiment E7b.' },

  // 5. Porous Closure Constants
  { key: 'A_ergun', group: 'closure', label: 'Ergun Viscous Const (A)', unit: '-', default: 150.0, min: 1.0, max: 1000.0, step: 10.0, rebuildsSolver: false, advanced: true },
  { key: 'B_ergun', group: 'closure', label: 'Forchheimer Inertial Const (B)', unit: '-', default: 1.75, min: 0.0, max: 50.0, step: 0.1, rebuildsSolver: false, advanced: true },
  { key: 'C_gamma', group: 'closure', label: 'Pore Shear Constant (Cγ)', unit: '-', default: 1.0, min: 0.01, max: 10.0, step: 0.1, rebuildsSolver: false, advanced: true },
  {
    key: 'closureSource', group: 'closure', label: 'Closure Source', unit: '-', default: 'manual', rebuildsSolver: false, advanced: true,
    options: [{ value: 'manual', label: 'Manual Parameters' }, { value: 'table', label: 'RVE 2D Table' }]
  },

  // 6. Numerics
  {
    key: 'N', group: 'numerics', label: 'Grid Resolution (N)', unit: '-', default: 128, rebuildsSolver: true,
    notes: 'Interactive default is 128 (Δx = 8 mm at D = 1 m). 256 is roughly 4× the cost per frame; use it for a converged run rather than for browsing.',
    options: [
      { value: 64, label: '64 × 64 (Draft)' },
      { value: 128, label: '128 × 128 (Interactive — default)' },
      { value: 256, label: '256 × 256 (Standard)' },
      { value: 512, label: '512 × 512 (High)' }
    ]
  },
  { key: 'nSub', group: 'numerics', label: 'Sub-steps per frame', unit: '-', default: 1, min: 1, max: 8, step: 1, rebuildsSolver: false, notes: 'Solver steps taken per rendered frame. Higher advances more simulated time per frame at proportionally more cost.' },
  { key: 'cfl', group: 'numerics', label: 'CFL Number', unit: '-', default: 2.0, min: 0.2, max: 5.0, step: 0.2, rebuildsSolver: false, advanced: true, notes: 'Semi-Lagrangian advection tolerates CFL > 1.' },
  { key: 'maxDt', group: 'numerics', label: 'Max Time Step (Δt)', unit: 's', default: 0.002, min: 1e-5, max: 0.01, step: 0.0005, rebuildsSolver: false, advanced: true },
  { key: 'fixedDt', group: 'numerics', label: 'Fixed Time Step (0=adaptive)', unit: 's', default: 0.0, min: 0.0, max: 0.01, step: 0.0005, rebuildsSolver: false, advanced: true, notes: 'Non-zero pins Δt, which the temporal-order verification cases require.' },
  { key: 'nVisc', group: 'numerics', label: 'Viscous Iterations', unit: '-', default: 12, min: 4, max: 128, step: 4, rebuildsSolver: false, advanced: true, notes: 'Damped-Jacobi sweeps for the implicit variable-viscosity Helmholtz solve. At mill viscosities the solution is unchanged to 4 significant figures between 12 and 48 sweeps.' },
  { key: 'etaPenal', group: 'numerics', label: 'Penalization Time (η)', unit: 's', default: 1e-4, min: 1e-7, max: 1e-2, step: 1e-5, rebuildsSolver: false, advanced: true, notes: 'Brinkman penalization time. Smaller = stiffer wall; the boundary-layer error scales as sqrt(ην).' },
  {
    key: 'advectionScheme', group: 'numerics', label: 'Advection Scheme', unit: '-', default: 'maccormack', rebuildsSolver: false, advanced: true,
    options: [{ value: 'maccormack', label: 'MacCormack (2nd order)' }, { value: 'semi-lagrangian', label: '1st-order Semi-Lagrangian' }]
  },

  // 7. RVE (Micro Scale) — the micro-scale calibration problem, not the mill.
  {
    key: 'N_rve', group: 'rve', label: 'RVE Resolution', unit: '-', default: 256, rebuildsSolver: false, advanced: true,
    options: [{ value: 128, label: '128' }, { value: 256, label: '256' }, { value: 512, label: '512' }]
  },
  { key: 'rvePhi', group: 'rve', label: 'RVE Solid Fraction (1-ε)', unit: '-', default: 0.60, min: 0.05, max: 0.80, step: 0.02, rebuildsSolver: false, advanced: true },
  {
    key: 'rvePacking', group: 'rve', label: 'RVE Packing', unit: '-', default: 'hexagonal', rebuildsSolver: false, advanced: true,
    options: [{ value: 'hexagonal', label: 'Regular Hexagonal' }, { value: 'random', label: 'Poisson Random' }]
  },
  { key: 'rveSeed', group: 'rve', label: 'RVE PRNG Seed', unit: '-', default: 12345, min: 1, max: 999999, step: 1, rebuildsSolver: false, advanced: true },
  { key: 'rveFx', group: 'rve', label: 'RVE Body Force (fx)', unit: 'm/s²', default: 1.0, min: 0.0001, max: 1000.0, step: 0.1, rebuildsSolver: false, advanced: true }
];

export type ConfigValues = Record<string, any>;

export function getDefaultConfig(): ConfigValues {
  const cfg: ConfigValues = { version: 1 };
  for (const p of PARAM_SCHEMA) {
    cfg[p.key] = p.default;
  }
  return cfg;
}

// Chord offset d such that the circular segment below the chord has area J*pi*R^2.
// Mirrors assembly/bed.ts::solveChordOffset so that the overlay drawn on the
// canvas lands on the same line the solver uses for chi_bed.
export function solveChordOffset(R: number, J: number): number {
  if (J <= 0.0) return R;
  if (J >= 1.0) return -R;
  const target = J * Math.PI * R * R;
  let lo = -R;
  let hi = R;
  for (let it = 0; it < 60; it++) {
    const mid = 0.5 * (lo + hi);
    const s = Math.sqrt(Math.max(R * R - mid * mid, 0.0));
    const area = R * R * Math.acos(mid / R) - mid * s;
    if (area > target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export function computeDerived(cfg: ConfigValues) {
  const D = <number>cfg.D;
  const R = 0.5 * D;
  const margin = <number>cfg.margin;
  const L = D * (1.0 + 2.0 * margin);
  const cx = 0.5 * L;
  const cy = 0.5 * L;
  const dp = <number>cfg.dp;
  const g = <number>cfg.gravity;
  const rpm = <number>cfg.millRpm;

  // Critical speed Nc = (1/2pi) * sqrt(g / (R - dp/2))
  const effR = Math.max(R - 0.5 * dp, 0.01);
  const Nc_rev_s = g > 0.0 ? (1.0 / (2.0 * Math.PI)) * Math.sqrt(g / effR) : 0.0;
  const Nc_rpm = Nc_rev_s * 60.0;

  // The shell speed is entered in rpm; %Nc is the derived quantity, since Nc
  // itself depends on D, d_p and g and therefore cannot be an input.
  const rotDir = cfg.rotDirection === 'CW' ? -1.0 : 1.0;
  const omega = (rotDir * 2.0 * Math.PI * rpm) / 60.0;
  const speedFraction = Nc_rpm > 0.0 ? (rpm / Nc_rpm) * 100.0 : 0.0;
  const tipSpeed = Math.abs(omega * R);

  const N = <number>cfg.N;
  const dx = L / N;
  const dx_mm = dx * 1000.0;
  const dp_dx = dp / dx;

  const eps = <number>cfg.porosity;
  const A = <number>cfg.A_ergun;
  const K_perm = (Math.pow(eps, 3) * dp * dp) / (A * Math.pow(1.0 - eps, 2));
  const sqrtK = Math.sqrt(K_perm);
  const C_gamma = <number>cfg.C_gamma;
  const kSlip = <number>cfg.kSlip;
  const uRelEst = (1.0 - kSlip) * tipSpeed;
  const gammaPore = (C_gamma * uRelEst) / (eps * Math.max(sqrtK, 1e-12));

  // Bed free surface, in the same convention as assembly/bed.ts:
  // the bed is { r <= R } intersect { (x,y).n + d <= 0 }, with the unit normal n
  // tilted away from the direction of rotation by the dynamic angle of repose.
  const thetaR = (<number>cfg.thetaRepose * Math.PI) / 180.0;
  const signOmega = omega >= 0.0 ? 1.0 : -1.0;
  const bedNx = -signOmega * Math.sin(thetaR);
  const bedNy = Math.cos(thetaR);
  const bedD = solveChordOffset(R, <number>cfg.fillJ);
  // Half-length of the chord where it cuts the shell circle.
  const bedHalfChord = Math.sqrt(Math.max(R * R - bedD * bedD, 0.0));

  return {
    R,
    L,
    cx,
    cy,
    bedNx,
    bedNy,
    bedD,
    bedHalfChord,
    Nc_rev_s,
    Nc_rpm,
    rpm,
    speedFraction,
    omega,
    tipSpeed,
    dx,
    dx_mm,
    dp_dx,
    K_perm,
    sqrtK,
    gammaPore
  };
}

export function getValidityWarnings(cfg: ConfigValues, derived: ReturnType<typeof computeDerived>): string[] {
  const warnings: string[] = [];
  if (cfg.dp > derived.dx) {
    warnings.push('Media are larger than a cell (dp > Δx); the sub-grid porous closure is not valid at this resolution. Increase N or reduce dp.');
  }
  if (cfg.nLifters > 0 && cfg.hLifter < 2.0 * derived.dx) {
    warnings.push('Lifters are thinner than 2 cells (h_L < 2Δx) and are effectively unresolved.');
  }
  if (cfg.fillJ > 0.5) {
    warnings.push('Charge geometry model is not calibrated above 50% fill (J > 0.5).');
  }
  if (derived.speedFraction > 100.0) {
    warnings.push(
      `Supercritical speed (${derived.speedFraction.toFixed(0)}% Nc > 100%): centrifuging regime. ` +
      'Prescribed charge geometry assumes cascading flow.'
    );
  }
  return warnings;
}

// Shell speed in rpm corresponding to a given fraction of the critical speed for
// this config. The experiment runner sweeps %Nc, which is the quantity the
// literature reports, while the solver and the UI both take rpm.
export function rpmFromSpeedFraction(cfg: ConfigValues, percentNc: number): number {
  return (percentNc / 100.0) * computeDerived(cfg).Nc_rpm;
}

// Configs saved before the speed control became rpm carry `speedFraction`
// [%Nc]. Convert rather than silently falling back to the default speed, which
// would make an old permalink reproduce a different run under the same URL.
export function migrateConfig(raw: ConfigValues): ConfigValues {
  const cfg = { ...raw };
  if (cfg.millRpm === undefined && typeof cfg.speedFraction === 'number') {
    const probe = { ...getDefaultConfig(), ...cfg };
    cfg.millRpm = rpmFromSpeedFraction(probe, <number>cfg.speedFraction);
  }
  delete cfg.speedFraction;
  return cfg;
}

// Permalink Base64 URL codec (PARAMETERS.md §9)
export function encodePermalink(cfg: ConfigValues): string {
  try {
    const json = JSON.stringify(cfg);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return '#cfg=' + b64;
  } catch (err) {
    console.error('Permalink encode error:', err);
    return '';
  }
}

export function decodePermalink(hash: string): ConfigValues | null {
  try {
    if (!hash || !hash.startsWith('#cfg=')) return null;
    const b64 = hash.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json);
    return parsed;
  } catch (err) {
    console.warn('Permalink decode error:', err);
    return null;
  }
}
