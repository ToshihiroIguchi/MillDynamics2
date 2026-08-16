import { describe, it, expect } from 'vitest';
import { PARAM_SCHEMA, getDefaultConfig, computeDerived, encodePermalink, decodePermalink } from '../src/config';
import { PRESETS, applyPreset } from '../src/presets';
import { generateCsv } from '../src/export/csv';

describe('Phase 6 Schema, UI, Presets & Persistence - Row 6a, 6b, 6c', () => {
  it('Row 6a: Schema-walk test - all parameters defined with valid bounds and groups', () => {
    const requiredKeys = [
      'D', 'margin', 'nLifters', 'hLifter', 'wLifter', 'alphaLifter',
      'speedFraction', 'rotDirection', 'gravity',
      'fillJ', 'thetaRepose', 'porosity', 'dp', 'kSlip',
      'rho', 'rheologyMode', 'K', 'n', 'tauY', 'm', 'muMin', 'muMax',
      'A_ergun', 'B_ergun', 'C_gamma', 'closureSource',
      'N', 'nSub', 'cfl', 'maxDt', 'fixedDt', 'nVisc', 'etaPenal', 'advectionScheme',
      'N_rve', 'rvePhi', 'rvePacking', 'rveSeed', 'rveFx'
    ];

    const definedKeys = PARAM_SCHEMA.map(p => p.key);
    for (const key of requiredKeys) {
      expect(definedKeys).toContain(key);
    }

    // Check defaults
    const cfg = getDefaultConfig();
    expect(cfg.D).toBe(1.0);
    expect(cfg.rho).toBe(1800.0);
    expect(cfg.dp).toBe(0.002);
    // Interactive default resolution (PARAMETERS.md §6). Assert it is one of the
    // offered options rather than a literal, so tuning the default for frame
    // rate does not break the schema test.
    const nDef = PARAM_SCHEMA.find(p => p.key === 'N')!;
    expect(nDef.options!.map(o => o.value)).toContain(cfg.N);
    expect(cfg.N).toBe(128);
  });

  it('Row 6a: Derived parameter calculations match analytical formulas', () => {
    const cfg = getDefaultConfig();
    const derived = computeDerived(cfg);

    expect(derived.R).toBe(0.5);
    expect(derived.L).toBeCloseTo(1.024, 4);
    // dx = L / N, derived from the schema default rather than a fixed 4.0 mm.
    expect(derived.dx_mm).toBeCloseTo((1.024 / <number>cfg.N) * 1000.0, 2);

    // Critical speed Nc for D=1m (R=0.5m, dp=0.002m, g=9.81m/s^2)
    // effR = 0.5 - 0.001 = 0.499m
    // Nc = (1/2pi) * sqrt(9.81 / 0.499) = 0.7055 rev/s = 42.33 rpm
    expect(derived.Nc_rpm).toBeCloseTo(42.33, 1);

    // Tip speed at 75% Nc
    expect(derived.tipSpeed).toBeGreaterThan(1.0);
    expect(derived.tipSpeed).toBeLessThan(3.0);
  });

  it('Row 6b: All presets load valid configs with all fields editable', () => {
    for (const preset of PRESETS) {
      const cfg = applyPreset(preset.id);
      expect(cfg).toBeDefined();
      expect(cfg.D).toBeGreaterThan(0);
      expect(cfg.rho).toBeGreaterThan(0);
      expect(cfg.N).toBeGreaterThanOrEqual(128);

      // Verify that loaded preset can be freely edited
      cfg.D = 2.5;
      expect(cfg.D).toBe(2.5);
    }
  });

  it('Row 6c: Permalink codec round-trip preserves full configuration', () => {
    const orig = getDefaultConfig();
    orig.D = 3.5;
    orig.n = 0.42;
    orig.tauY = 17.5;
    orig.fillJ = 0.38;

    const hash = encodePermalink(orig);
    expect(hash.startsWith('#cfg=')).toBe(true);

    const restored = decodePermalink(hash);
    expect(restored).not.toBeNull();
    expect(restored!.D).toBe(3.5);
    expect(restored!.n).toBe(0.42);
    expect(restored!.tauY).toBe(17.5);
    expect(restored!.fillJ).toBe(0.38);
  });

  it('Row 6c: CSV export includes metadata block and time series columns', () => {
    const cfg = getDefaultConfig();
    const timeSeries = [
      { time: 0.1, dt: 0.002, torque: 50.5, power: 120.0, meanShearBed: 45.0, meanShearFree: 12.0, maxVel: 1.5, yieldedFraction: 0.85, kineticEnergy: 250.0, maxDiv: 1e-6 },
      { time: 0.2, dt: 0.002, torque: 52.1, power: 125.0, meanShearBed: 46.2, meanShearFree: 12.5, maxVel: 1.52, yieldedFraction: 0.86, kineticEnergy: 255.0, maxDiv: 1e-6 }
    ];

    const csv = generateCsv(cfg, timeSeries);
    expect(csv).toContain('# Parameter Metadata Block:');
    expect(csv).toContain('#   D (Mill Diameter): 1 m');
    expect(csv).toContain('#   K (Consistency Index (K)): 0.5 Pa·sⁿ');
    expect(csv).toContain('time_s,dt_s,torque_Nm_m,power_W_m,mean_shear_bed_s1');
    expect(csv).toContain('0.1000,2.0000e-3,50.500,120.000');
  });
});
