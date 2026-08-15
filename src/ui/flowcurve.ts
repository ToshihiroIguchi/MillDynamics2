// src/ui/flowcurve.ts
// Live log-log plot of rheology flow curve mu_app(gamma_dot) and tau(gamma_dot)

import { ConfigValues } from '../config';

export class FlowCurvePlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get flow curve canvas context');
    this.ctx = ctx;
  }

  render(cfg: ConfigValues, currentMeanGammaDot: number = 0): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const padLeft = 45;
    const padBottom = 30;
    const padTop = 15;
    const padRight = 45;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Log-log domain: gammaDot from 1e-2 to 1e5 (7 decades)
    const logMinG = -2.0;
    const logMaxG = 5.0;
    const rangeG = logMaxG - logMinG;

    // Log-log range for viscosity: mu from 1e-4 to 1e4 (8 decades)
    const logMinMu = -4.0;
    const logMaxMu = 4.0;
    const rangeMu = logMaxMu - logMinMu;

    // Grid lines and ticks
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';

    for (let g = logMinG; g <= logMaxG; g++) {
      const x = padLeft + ((g - logMinG) / rangeG) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.fillText(`10${g === 0 ? '⁰' : (g === 1 ? '¹' : (g === 2 ? '²' : (g === 3 ? '³' : (g === -1 ? '⁻¹' : (g === -2 ? '⁻²' : (g === 4 ? '⁴' : '⁵'))))))}`, x, padTop + plotH + 14);
    }

    ctx.textAlign = 'right';
    for (let m = logMinMu; m <= logMaxMu; m += 2) {
      const y = padTop + plotH - ((m - logMinMu) / rangeMu) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
      ctx.fillText(`10${m === 0 ? '⁰' : (m === 2 ? '²' : (m === 4 ? '⁴' : (m === -2 ? '⁻²' : '⁻⁴')))}`, padLeft - 6, y + 3);
    }

    // Axis labels
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('γ̇ [s⁻¹]', padLeft + plotW / 2 + 10, padTop + plotH + 26);
    ctx.save();
    ctx.translate(12, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('μ_app [Pa·s]', 0, 0);
    ctx.restore();

    // Compute curve points
    const K = <number>cfg.K;
    const n = <number>cfg.n;
    const tauY = <number>cfg.tauY;
    const mReg = <number>cfg.m;
    const muMin = <number>cfg.muMin;
    const muMax = <number>cfg.muMax;

    const nPoints = 100;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= nPoints; i++) {
      const logG = logMinG + (i / nPoints) * rangeG;
      const gd = Math.pow(10, logG);

      // Herschel-Bulkley with Papanastasiou exponential regularization
      let muVal = 0.0;
      if (tauY > 0.0 && gd > 1e-12) {
        const expTerm = 1.0 - Math.exp(-mReg * gd);
        muVal = (tauY * expTerm) / gd + K * Math.pow(gd, n - 1.0);
      } else if (tauY > 0.0) {
        muVal = tauY * mReg + K * Math.pow(Math.max(gd, 1e-12), n - 1.0);
      } else {
        muVal = K * Math.pow(Math.max(gd, 1e-12), n - 1.0);
      }

      if (muVal < muMin) muVal = muMin;
      if (muVal > muMax) muVal = muMax;

      const logMu = Math.log10(Math.max(muVal, 1e-6));
      const px = padLeft + ((logG - logMinG) / rangeG) * plotW;
      const py = padTop + plotH - ((logMu - logMinMu) / rangeMu) * plotH;
      pts.push({ x: px, y: py });
    }

    // Draw mu_app curve (cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Draw operating point marker if available
    if (currentMeanGammaDot > 0) {
      const logG = Math.log10(currentMeanGammaDot);
      if (logG >= logMinG && logG <= logMaxG) {
        const px = padLeft + ((logG - logMinG) / rangeG) * plotW;
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px, padTop);
        ctx.lineTo(px, padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(px, padTop + 6, 4, 0, 2.0 * Math.PI);
        ctx.fill();
      }
    }
  }
}
