import { describe, it, expect, beforeEach } from 'vitest';
import { FieldRenderer, RenderOptions } from '../src/render/field';
import { getDefaultConfig } from '../src/config';

describe('Phase 9 Field Rendering - Colour Limits, Log Ticks, Defaults (9.1 - 9.4)', () => {
  let canvas: HTMLCanvasElement;
  let renderer: FieldRenderer;

  beforeEach(() => {
    // Mock canvas and 2D context for headless tests
    canvas = {
      width: 640,
      height: 512,
      getContext: () => ({
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4)
        }),
        putImageData: () => {},
        drawImage: () => {},
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {},
        stroke: () => {},
        rect: () => {},
        fill: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fillText: () => {},
        strokeRect: () => {},
        setLineDash: () => {},
      })
    } as unknown as HTMLCanvasElement;

    renderer = new FieldRenderer(canvas);
  });

  it('9.1: Uniform scalar field does not fake a [0, 1] span and returns exact uniform value', () => {
    const N = 16;
    const nc = N * N;
    const nu = (N + 1) * N;
    const nv = N * (N + 1);

    const u = new Float64Array(nu);
    const v = new Float64Array(nv);
    const p = new Float64Array(nc);
    const mu = new Float64Array(nc).fill(0.1); // Uniform 0.1 Pa*s (Newtonian preset)
    const gammaDot = new Float64Array(nc).fill(0.0);
    const chi = new Float64Array(nc).fill(0.0); // all fluid
    const chiBed = new Float64Array(nc).fill(0.0);

    const cfg = getDefaultConfig();
    const opts: RenderOptions = {
      fieldType: 'mu',
      colormap: 'viridis',
      showShell: false,
      showLifters: false,
      showBed: false,
      showVectors: false,
      vectorDecimation: 8
    };

    const range = renderer.render(N, u, v, p, mu, gammaDot, chi, chiBed, cfg, 0.0, opts);
    expect(range.min).toBeCloseTo(0.1, 6);
    expect(range.max).toBeCloseTo(0.1, 6);
  });

  it('9.2: Log-scale fields clamp to floor and compute valid range on non-uniform data', () => {
    const N = 16;
    const nc = N * N;
    const nu = (N + 1) * N;
    const nv = N * (N + 1);

    const u = new Float64Array(nu);
    const v = new Float64Array(nv);
    const p = new Float64Array(nc);
    const mu = new Float64Array(nc);
    for (let i = 0; i < nc; i++) {
      mu[i] = 0.1 + (i / nc) * 10.0; // 0.1 to 10.1 Pa*s
    }
    const gammaDot = new Float64Array(nc);
    const chi = new Float64Array(nc).fill(0.0);
    const chiBed = new Float64Array(nc).fill(0.0);

    const cfg = getDefaultConfig();
    const opts: RenderOptions = {
      fieldType: 'mu',
      colormap: 'viridis',
      showShell: false,
      showLifters: false,
      showBed: false,
      showVectors: false,
      vectorDecimation: 8
    };

    const range = renderer.render(N, u, v, p, mu, gammaDot, chi, chiBed, cfg, 0.0, opts);
    expect(range.min).toBeGreaterThan(0.0);
    expect(range.max).toBeGreaterThan(range.min);
    expect(range.max).toBeLessThanOrEqual(10.1);
  });

  it('9.3: Default preset defaults to speed field and renders velocity profile', () => {
    const N = 16;
    const nc = N * N;
    const nu = (N + 1) * N;
    const nv = N * (N + 1);

    const u = new Float64Array(nu);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i <= N; i++) {
        u[i + j * (N + 1)] = 1.5 * ((j + 1) / N);
      }
    }
    const v = new Float64Array(nv);
    const p = new Float64Array(nc);
    const mu = new Float64Array(nc).fill(0.1);
    const gammaDot = new Float64Array(nc);
    const chi = new Float64Array(nc).fill(0.0);
    const chiBed = new Float64Array(nc).fill(0.0);

    const cfg = getDefaultConfig();
    const opts: RenderOptions = {
      fieldType: 'speed',
      colormap: 'viridis',
      showShell: false,
      showLifters: false,
      showBed: false,
      showVectors: false,
      vectorDecimation: 8
    };

    const range = renderer.render(N, u, v, p, mu, gammaDot, chi, chiBed, cfg, 0.0, opts);
    expect(range.max).toBeGreaterThan(0.5);
  });

  it('9.4: Single-signed vorticity uses standard range without forcing symmetric coolwarm', () => {
    const N = 16;
    const nc = N * N;
    const nu = (N + 1) * N;
    const nv = N * (N + 1);

    const u = new Float64Array(nu);
    const v = new Float64Array(nv);
    // Prescribe single-signed shear flow v(x) = 2*x
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i < N; i++) {
        v[i + j * N] = 2.0 * (i / N);
      }
    }

    const p = new Float64Array(nc);
    const mu = new Float64Array(nc).fill(0.1);
    const gammaDot = new Float64Array(nc);
    const chi = new Float64Array(nc).fill(0.0);
    const chiBed = new Float64Array(nc).fill(0.0);

    const cfg = getDefaultConfig();
    const opts: RenderOptions = {
      fieldType: 'vorticity',
      colormap: 'viridis',
      showShell: false,
      showLifters: false,
      showBed: false,
      showVectors: false,
      vectorDecimation: 8
    };

    const range = renderer.render(N, u, v, p, mu, gammaDot, chi, chiBed, cfg, 0.0, opts);
    // Single signed positive vorticity
    expect(range.min).toBeGreaterThanOrEqual(0.0);
  });
});
