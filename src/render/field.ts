// src/render/field.ts
import { ColormapName, mapScalarToRgb } from './colormap';
import { ConfigValues, computeDerived } from '../config';

export type FieldType = 'speed' | 'mu' | 'gammaDot' | 'p' | 'yieldState' | 'vorticity' | 'chiBed';

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

export class FieldRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  offscreenCanvas: HTMLCanvasElement;
  offscreenCtx: CanvasRenderingContext2D;
  imgData: ImageData | null = null;
  imgBuffer: Uint8ClampedArray | null = null;
  currentN: number = 0;

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

    // 1. Compute scalar field values and min/max bounds
    const scalar = new Float64Array(nc);
    let minVal = Infinity;
    let maxVal = -Infinity;

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
          const tauY = <number>cfg.tauY;
          const m = <number>cfg.m;
          val = (tauY <= 0.0 || gammaDot[c] > 1.0 / m) ? 1.0 : 0.0;
        } else if (field === 'vorticity') {
          // dv/dx - du/dy at cell centre
          const dv_dx = (v[i + 1 < N ? i + 1 + j * N : i + j * N] - v[i > 0 ? i - 1 + j * N : i + j * N]) * 0.5 * invDx;
          const du_dy = (u[j + 1 < N ? i + (j + 1) * (N + 1) : i + j * (N + 1)] - u[j > 0 ? i + (j - 1) * (N + 1) : i + j * (N + 1)]) * 0.5 * invDx;
          val = dv_dx - du_dy;
        } else if (field === 'chiBed') {
          val = chiBed[c];
        }

        scalar[c] = val;
        if (chi[c] < 0.9) { // compute min/max over fluid domain
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
      }
    }

    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal >= maxVal) {
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

        if (chi[c] > 0.95) {
          // Solid shell exterior: dark charcoal
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

    // 3. Draw scaled offscreen canvas to main canvas
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(this.offscreenCanvas, 0, 0, cw, ch);

    // 4. Overlays: Mill shell, Lifters, Bed boundary, Velocity vectors
    const derived = computeDerived(cfg);
    const scale = cw / derived.L;
    const cxScreen = derived.cx * scale;
    const cyScreen = (derived.L - derived.cy) * scale;
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

    // C. Bed free surface chord overlay
    if (opts.showBed && <number>cfg.fillJ > 0.0 && derived.R > 0.0) {
      const thetaR = (<number>cfg.thetaRepose * Math.PI) / 180.0;
      const rotDir = cfg.rotDirection === 'CW' ? -1.0 : 1.0;
      const angle = rotDir > 0 ? -thetaR : thetaR;

      this.ctx.save();
      this.ctx.translate(cxScreen, cyScreen);
      this.ctx.rotate(angle);

      this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)'; // amber
      this.ctx.setLineDash([4, 4]);
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(-rScreen, 0);
      this.ctx.lineTo(rScreen, 0);
      this.ctx.stroke();

      this.ctx.restore();
    }

    // D. Velocity vectors overlay
    if (opts.showVectors) {
      const step = Math.max(opts.vectorDecimation || 8, 4);
      const vecScale = (derived.L / N) * scale * 2.0;

      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.lineWidth = 1.0;

      for (let j = step / 2; j < N; j += step) {
        const yPx = (N - 1 - j + 0.5) * (ch / N);
        for (let i = step / 2; i < N; i += step) {
          const c = i + j * N;
          if (chi[c] > 0.8) continue;

          const xPx = (i + 0.5) * (cw / N);
          const uAvg = 0.5 * (u[i + j * (N + 1)] + u[i + 1 + j * (N + 1)]);
          const vAvg = 0.5 * (v[i + j * N] + v[i + (j + 1) * N]);
          const spd = Math.sqrt(uAvg * uAvg + vAvg * vAvg);
          if (spd < 1e-4) continue;

          const dxPx = uAvg * vecScale;
          const dyPx = -vAvg * vecScale; // Screen Y inverted

          this.ctx.beginPath();
          this.ctx.moveTo(xPx, yPx);
          this.ctx.lineTo(xPx + dxPx, yPx + dyPx);
          this.ctx.stroke();
        }
      }
      this.ctx.restore();
    }

    return { min: minVal, max: maxVal };
  }
}
