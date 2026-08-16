// src/render/field.ts
import { ColormapName, mapScalarToRgb } from './colormap';
import { ConfigValues, computeDerived } from '../config';

export type FieldType = 'speed' | 'mu' | 'gammaDot' | 'p' | 'yieldState' | 'vorticity' | 'chiBed';

const FIELD_UNITS: Record<FieldType, string> = {
  speed: '|u| [m/s]',
  mu: 'μ_app [Pa·s]',
  gammaDot: 'γ̇ [s⁻¹]',
  p: 'p [Pa]',
  yieldState: 'yielded',
  vorticity: 'ω_z [s⁻¹]',
  chiBed: 'χ_bed [-]'
};

export interface RenderOptions {
  fieldType: FieldType;
  colormap: ColormapName;
  showShell: boolean;
  showLifters: boolean;
  showBed: boolean;
  showVectors: boolean;
  vectorDecimation: number;
  minVal?: number;
  maxVal?: number;
  logScale?: boolean;
}

// Fraction of the canvas width reserved on the right for the colour bar.
const COLORBAR_GUTTER = 0.17;

// Percentile-clipped range over the first `n` entries of `buf`.
// Sorts `buf` in place (it is scratch storage owned by the renderer).
function percentileRange(
  buf: Float64Array, n: number, pLo: number, pHi: number
): { min: number; max: number } {
  if (n <= 0) return { min: 0, max: 1 };
  const view = buf.subarray(0, n);
  view.sort();
  const lo = view[Math.min(n - 1, Math.max(0, Math.floor(pLo * (n - 1))))];
  const hi = view[Math.min(n - 1, Math.max(0, Math.ceil(pHi * (n - 1))))];
  return { min: lo, max: hi };
}

export class FieldRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  offscreenCanvas: HTMLCanvasElement;
  offscreenCtx: CanvasRenderingContext2D;
  imgData: ImageData | null = null;
  imgBuffer: Uint8ClampedArray | null = null;
  currentN: number = 0;
  // Reused across frames — allocating N^2 arrays every animation frame was a
  // steady source of GC pressure at N = 256.
  scalar: Float64Array | null = null;
  sortScratch: Float64Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;

    this.offscreenCanvas = document.createElement('canvas');
    const offCtx = this.offscreenCanvas.getContext('2d');
    if (!offCtx) throw new Error('Could not get offscreen canvas context');
    this.offscreenCtx = offCtx;
  }

  resize(N: number): void {
    if (this.currentN !== N) {
      this.currentN = N;
      this.offscreenCanvas.width = N;
      this.offscreenCanvas.height = N;
      this.imgData = this.offscreenCtx.createImageData(N, N);
      this.imgBuffer = this.imgData.data;
    }
  }

  render(
    N: number,
    u: Float64Array,
    v: Float64Array,
    p: Float64Array,
    mu: Float64Array,
    gammaDot: Float64Array,
    chi: Float64Array,
    chiBed: Float64Array,
    cfg: ConfigValues,
    currentAngle: number,
    opts: RenderOptions
  ): { min: number; max: number } {
    this.resize(N);
    if (!this.imgData || !this.imgBuffer) return { min: 0, max: 1 };

    const nc = N * N;
    const buf = this.imgBuffer;

    // 1. Compute scalar field values over the fluid domain
    if (!this.scalar || this.scalar.length !== nc) {
      this.scalar = new Float64Array(nc);
      this.sortScratch = new Float64Array(nc);
    }
    const scalar = this.scalar;
    let nFluid = 0;

    const field = opts.fieldType;
    const invDx = N / (<number>cfg.D * (1.0 + 2.0 * <number>cfg.margin));

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = i + j * N;
        let val = 0.0;

        if (field === 'speed') {
          const uAvg = 0.5 * (u[i + j * (N + 1)] + u[i + 1 + j * (N + 1)]);
          const vAvg = 0.5 * (v[i + j * N] + v[i + (j + 1) * N]);
          val = Math.sqrt(uAvg * uAvg + vAvg * vAvg);
        } else if (field === 'mu') {
          val = mu[c];
        } else if (field === 'gammaDot') {
          val = gammaDot[c];
        } else if (field === 'p') {
          val = p[c];
        } else if (field === 'yieldState') {
          // Yielded where the local shear stress exceeds the yield stress.
          // The old test (gammaDot > 1/m) marked essentially the whole domain
          // as yielded for any m >= 10.
          const tauY = <number>cfg.tauY;
          val = (tauY <= 0.0 || mu[c] * gammaDot[c] > tauY) ? 1.0 : 0.0;
        } else if (field === 'vorticity') {
          // dv/dx - du/dy at cell centre
          const dv_dx = (v[i + 1 < N ? i + 1 + j * N : i + j * N] - v[i > 0 ? i - 1 + j * N : i + j * N]) * 0.5 * invDx;
          const du_dy = (u[j + 1 < N ? i + (j + 1) * (N + 1) : i + j * (N + 1)] - u[j > 0 ? i + (j - 1) * (N + 1) : i + j * (N + 1)]) * 0.5 * invDx;
          val = dv_dx - du_dy;
        } else if (field === 'chiBed') {
          val = chiBed[c];
        }

        scalar[c] = val;
        if (chi[c] < 0.5 && Number.isFinite(val)) {
          this.sortScratch![nFluid++] = val;
        }
      }
    }

    // Robust colour limits. Scaling to the raw min/max let a handful of cells
    // at a stagnation point (mu -> muMax) or a single grid-scale spike consume
    // the whole colour range, which is why the field read as one flat colour
    // with a few bright dots. Percentiles keep the bulk of the field readable.
    let { min: minVal, max: maxVal } = percentileRange(this.sortScratch!, nFluid, 0.02, 0.98);

    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal >= maxVal) {
      minVal = 0.0;
      maxVal = 1.0;
    }
    if (field === 'yieldState' || field === 'chiBed') {
      minVal = 0.0;
      maxVal = 1.0;
    }

    const logScale = (field === 'mu' || field === 'gammaDot');
    const logMin = logScale ? Math.log10(Math.max(minVal, 1e-4)) : minVal;
    const logMax = logScale ? Math.log10(Math.max(maxVal, 1e-3)) : maxVal;
    const range = (logMax > logMin) ? (logMax - logMin) : 1.0;

    // 2. Map scalars to pixel colors in offscreen buffer (Y inverted for screen coordinates)
    for (let j = 0; j < N; j++) {
      const screenY = (N - 1 - j);
      for (let i = 0; i < N; i++) {
        const c = i + j * N;
        const pxIdx = (i + screenY * N) * 4;

        // Mask anything that is more solid than fluid. The old 0.95 threshold
        // left the penalization transition band coloured, and because the fluid
        // there is pinned to the rigid-body wall velocity its shear rate is ~0,
        // so mu -> mu_max and the shell was ringed by a bright halo that looked
        // like a physical high-viscosity layer.
        if (chi[c] > 0.5) {
          buf[pxIdx + 0] = 30;
          buf[pxIdx + 1] = 34;
          buf[pxIdx + 2] = 42;
          buf[pxIdx + 3] = 255;
          continue;
        }

        const val = scalar[c];
        let normVal = 0.0;
        if (logScale) {
          const lVal = Math.log10(Math.max(val, 1e-4));
          normVal = (lVal - logMin) / range;
        } else if (field === 'vorticity') {
          // Diverging: zero in center
          const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal), 1e-4);
          normVal = 0.5 + 0.5 * (val / maxAbs);
        } else {
          normVal = (val - minVal) / range;
        }

        const [r, g, b] = mapScalarToRgb(normVal, (field === 'vorticity' ? 'coolwarm' : (field === 'yieldState' ? 'yieldState' : opts.colormap)));
        buf[pxIdx + 0] = r;
        buf[pxIdx + 1] = g;
        buf[pxIdx + 2] = b;
        buf[pxIdx + 3] = 255;
      }
    }

    this.offscreenCtx.putImageData(this.imgData, 0, 0);

    // 3. Draw scaled offscreen canvas to main canvas.
    // Reserve a gutter on the right for the colour bar. Drawing the field across
    // the full canvas put the bar and its tick labels on top of the mill.
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const gutter = Math.round(cw * COLORBAR_GUTTER);
    const fieldSize = Math.min(cw - gutter, ch);
    const offX = Math.max(0, Math.round((cw - gutter - fieldSize) * 0.5));
    const offY = Math.max(0, Math.round((ch - fieldSize) * 0.5));

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.fillStyle = '#0b0f19';
    this.ctx.fillRect(0, 0, cw, ch);
    this.ctx.drawImage(this.offscreenCanvas, offX, offY, fieldSize, fieldSize);

    // 4. Overlays: Mill shell, Lifters, Bed boundary, Velocity vectors
    const derived = computeDerived(cfg);
    const scale = fieldSize / derived.L;
    const cxScreen = offX + derived.cx * scale;
    const cyScreen = offY + (derived.L - derived.cy) * scale;
    const rScreen = derived.R * scale;

    // A. Shell circle overlay
    if (opts.showShell && derived.R > 0.0) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(cxScreen, cyScreen, rScreen, 0, 2.0 * Math.PI);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.lineWidth = 2.0;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // B. Lifter bars overlay
    const nL = <number>cfg.nLifters;
    if (opts.showLifters && nL > 0 && derived.R > 0.0) {
      const hL = <number>cfg.hLifter * scale;
      const wL = <number>cfg.wLifter * scale;
      const alphaL = (<number>cfg.alphaLifter * Math.PI) / 180.0;

      this.ctx.save();
      this.ctx.translate(cxScreen, cyScreen);

      for (let k = 0; k < nL; k++) {
        const theta = currentAngle + (2.0 * Math.PI * k) / nL;
        this.ctx.save();
        this.ctx.rotate(-theta); // screen Y is inverted

        // Translate to lifter box center at R - hL/2
        this.ctx.translate(rScreen - 0.5 * hL, 0);
        if (alphaL !== 0) this.ctx.rotate(-alphaL);

        this.ctx.fillStyle = '#64748b';
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        this.ctx.rect(-0.5 * hL, -0.5 * wL, hL, wL);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.restore();
      }
      this.ctx.restore();
    }

    // C. Bed free surface chord overlay.
    // The chord sits at signed distance -d along the surface normal n, where d
    // solves segment_area(d) = J*pi*R^2 — it is NOT a diameter. Drawing it
    // through the mill axis (the previous behaviour) put the line in the wrong
    // place for every fill fraction except J = 0.5, and made the amber line
    // visibly disagree with the bed edge in the field itself.
    if (opts.showBed && <number>cfg.fillJ > 0.0 && derived.R > 0.0) {
      const nx = derived.bedNx;
      const ny = derived.bedNy;
      const d = derived.bedD;
      const half = derived.bedHalfChord;
      // Tangent to the chord (unit), and the chord midpoint in world offsets.
      const tx = -ny;
      const ty = nx;
      const mx = -d * nx;
      const my = -d * ny;

      const toScreenX = (wx: number) => cxScreen + wx * scale;
      const toScreenY = (wy: number) => cyScreen - wy * scale; // screen Y inverted

      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)'; // amber
      this.ctx.setLineDash([5, 4]);
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(toScreenX(mx - half * tx), toScreenY(my - half * ty));
      this.ctx.lineTo(toScreenX(mx + half * tx), toScreenY(my + half * ty));
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Tint the charge region so the bed reads as a body, not just a line.
      // Measuring phi from -n (into the bed) makes acos(d/R) the correct half
      // arc for both J < 0.5 (d > 0, minor arc) and J > 0.5 (d < 0, major arc).
      const phiMid = Math.atan2(-ny, -nx);
      const dPhi = Math.acos(Math.max(-1, Math.min(1, d / derived.R)));
      this.ctx.beginPath();
      // Screen arc angles run opposite to world angles because Y is inverted.
      this.ctx.arc(cxScreen, cyScreen, rScreen, -(phiMid - dPhi), -(phiMid + dPhi), true);
      this.ctx.closePath(); // the closing segment is the chord itself
      this.ctx.fillStyle = 'rgba(251, 191, 36, 0.10)';
      this.ctx.fill();
      this.ctx.restore();
    }

    // D. Velocity vectors overlay
    if (opts.showVectors) {
      const step = Math.max(Math.round(opts.vectorDecimation || 8), 4);
      const half = step >> 1;
      const cellPx = fieldSize / N;

      // Reference speed = the mill tip speed, so a full-length arrow spans one
      // decimation stride. The old scaling (2 px per m/s) drew ~3 px stubs.
      const uRef = Math.max(derived.tipSpeed, 1e-3);
      const vecScale = (step * cellPx) / uRef;
      const headLen = Math.max(2.0, 0.3 * step * cellPx);

      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(248, 250, 252, 0.75)';
      this.ctx.lineWidth = 1.0;
      this.ctx.beginPath();

      for (let j = half; j < N; j += step) {
        const yPx = offY + (N - 1 - j + 0.5) * cellPx;
        for (let i = half; i < N; i += step) {
          const c = i + j * N;
          if (chi[c] > 0.5) continue;

          const xPx = offX + (i + 0.5) * cellPx;
          const uAvg = 0.5 * (u[i + j * (N + 1)] + u[i + 1 + j * (N + 1)]);
          const vAvg = 0.5 * (v[i + j * N] + v[i + (j + 1) * N]);
          const spd = Math.sqrt(uAvg * uAvg + vAvg * vAvg);
          if (spd < 1e-4) continue;

          // Clamp length so a local spike cannot draw across the whole mill.
          const len = Math.min(spd * vecScale, step * cellPx * 1.5);
          const ux = uAvg / spd;
          const uy = -vAvg / spd; // screen Y inverted
          const exX = xPx + ux * len;
          const exY = yPx + uy * len;

          this.ctx.moveTo(xPx, yPx);
          this.ctx.lineTo(exX, exY);
          // Arrow head
          const hl = Math.min(headLen, len * 0.5);
          this.ctx.moveTo(exX, exY);
          this.ctx.lineTo(exX - hl * (ux * 0.866 - uy * 0.5), exY - hl * (uy * 0.866 + ux * 0.5));
          this.ctx.moveTo(exX, exY);
          this.ctx.lineTo(exX - hl * (ux * 0.866 + uy * 0.5), exY - hl * (uy * 0.866 - ux * 0.5));
        }
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // E. Colour bar — without it none of the field views carry a scale.
    this.drawColorbar(minVal, maxVal, logScale, field, opts);

    return { min: minVal, max: maxVal };
  }

  private drawColorbar(
    minVal: number, maxVal: number, logScale: boolean,
    field: FieldType, opts: RenderOptions
  ): void {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const chh = this.canvas.height;

    // Sits inside the gutter reserved by render(), clear of the mill.
    const gutter = Math.round(cw * COLORBAR_GUTTER);
    const barW = Math.max(9, Math.round(gutter * 0.20));
    const barH = Math.round(chh * 0.52);
    const x0 = cw - gutter + Math.round(gutter * 0.10);
    const y0 = Math.round((chh - barH) * 0.5);

    const cmap = field === 'vorticity' ? 'coolwarm'
      : field === 'yieldState' ? 'yieldState'
      : opts.colormap;

    ctx.save();
    for (let k = 0; k < barH; k++) {
      const t = 1.0 - k / (barH - 1);
      const [r, g, b] = mapScalarToRgb(t, cmap);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x0, y0 + k, barW, 1);
    }
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, barW - 1, barH - 1);

    const fmt = (val: number): string => {
      if (!Number.isFinite(val)) return '—';
      const a = Math.abs(val);
      if (a !== 0 && (a < 1e-2 || a >= 1e4)) return val.toExponential(1);
      return val.toFixed(a < 1 ? 3 : 2);
    };

    let lo = minVal;
    let hi = maxVal;
    if (field === 'vorticity') {
      const m = Math.max(Math.abs(minVal), Math.abs(maxVal));
      lo = -m;
      hi = m;
    }

    ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.font = `${Math.max(9, Math.round(cw * 0.021))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(hi), x0 + barW + 5, y0 + 4);
    ctx.fillText(fmt(0.5 * (lo + hi)), x0 + barW + 5, y0 + barH * 0.5);
    ctx.fillText(fmt(lo), x0 + barW + 5, y0 + barH - 4);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
    ctx.fillText(FIELD_UNITS[field], x0, y0 - 22);
    if (logScale) ctx.fillText('(log scale)', x0, y0 - 10);
    ctx.restore();
  }
}
