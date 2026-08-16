// src/ui/flowcurve.ts
// Live log-log plot of rheology flow curve mu_app(gamma_dot) and tau(gamma_dot)

import { ConfigValues } from '../config';

// Superscript rendering for decade tick labels (10^-2 ... 10^5).
const SUPER_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function supers(exp: number): string {
  const neg = exp < 0;
  const digits = String(Math.abs(Math.round(exp)))
    .split('')
    .map(d => SUPER_DIGITS[Number(d)])
    .join('');
  return (neg ? '⁻' : '') + digits;
}

// Herschel-Bulkley with Papanastasiou regularization, matching assembly/rheology.ts.
export function muAppJs(
  gd: number, K: number, n: number, tauY: number,
  mReg: number, muMin: number, muMax: number
): number {
  const g = Math.max(gd, 1e-12);
  let mu = K * Math.pow(g, n - 1.0);
  if (tauY > 0.0) mu += (tauY * (1.0 - Math.exp(-mReg * g))) / g;
  if (mu < muMin) mu = muMin;
  if (mu > muMax) mu = muMax;
  return mu;
}

export class FlowCurvePlot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private lastKey: string = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get flow curve canvas context');
    this.ctx = ctx;
  }

  // The curve depends only on the six rheology parameters and the marker
  // position, so redrawing it on every animation frame was pure waste.
  renderIfChanged(cfg: ConfigValues, currentMeanGammaDot: number): void {
    const key = [
      cfg.K, cfg.n, cfg.tauY, cfg.m, cfg.muMin, cfg.muMax,
      currentMeanGammaDot > 0 ? Math.log10(currentMeanGammaDot).toFixed(2) : 'x',
      this.canvas.width, this.canvas.height
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.render(cfg, currentMeanGammaDot);
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
      ctx.fillText(`10${supers(g)}`, x, padTop + plotH + 14);
    }

    ctx.textAlign = 'right';
    for (let m = logMinMu; m <= logMaxMu; m += 2) {
      const y = padTop + plotH - ((m - logMinMu) / rangeMu) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
      ctx.fillText(`10${supers(m)}`, padLeft - 6, y + 3);
    }

    // Right-hand axis for the shear stress curve: tau from 1e-2 to 1e5.
    const logMinTau = -2.0;
    const logMaxTau = 5.0;
    const rangeTau = logMaxTau - logMinTau;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a3e635';
    for (let s = logMinTau; s <= logMaxTau; s += 2) {
      const y = padTop + plotH - ((s - logMinTau) / rangeTau) * plotH;
      ctx.fillText(`10${supers(s)}`, padLeft + plotW + 5, y + 3);
    }

    // Axis labels
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText('γ̇ [s⁻¹]', padLeft + plotW / 2, padTop + plotH + 26);
    ctx.save();
    ctx.translate(12, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('μ_app [Pa·s]', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(w - 10, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a3e635';
    ctx.fillText('τ [Pa]', 0, 0);
    ctx.restore();

    // Compute curve points
    const K = <number>cfg.K;
    const n = <number>cfg.n;
    const tauY = <number>cfg.tauY;
    const mReg = <number>cfg.m;
    const muMin = <number>cfg.muMin;
    const muMax = <number>cfg.muMax;

    const nPoints = 160;
    const muPts: { x: number; y: number }[] = [];
    const tauPts: { x: number; y: number }[] = [];

    for (let i = 0; i <= nPoints; i++) {
      const logG = logMinG + (i / nPoints) * rangeG;
      const gd = Math.pow(10, logG);
      const muVal = muAppJs(gd, K, n, tauY, mReg, muMin, muMax);
      const px = padLeft + ((logG - logMinG) / rangeG) * plotW;

      const logMu = Math.log10(Math.max(muVal, 1e-6));
      muPts.push({ x: px, y: padTop + plotH - ((logMu - logMinMu) / rangeMu) * plotH });

      // tau = mu_app * gammaDot — the curve the chart title has always promised
      // but which was never drawn.
      const logTau = Math.log10(Math.max(muVal * gd, 1e-6));
      tauPts.push({ x: px, y: padTop + plotH - ((logTau - logMinTau) / rangeTau) * plotH });
    }

    const drawSeries = (pts: { x: number; y: number }[], colour: string, dash: number[]) => {
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2.0;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip();
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      ctx.restore();
    };

    drawSeries(muPts, '#38bdf8', []);
    drawSeries(tauPts, '#a3e635', [5, 3]);

    // Legend, top-right: mu_app has decayed and tau has not yet risen that far,
    // so this corner stays clear for any physically sensible parameter set.
    ctx.save();
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const lx = padLeft + plotW - 74;
    const ly = padTop + 9;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 14, ly);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('μ_app', lx + 18, ly + 3);
    ctx.strokeStyle = '#a3e635';
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, ly + 13);
    ctx.lineTo(lx + 14, ly + 13);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a3e635';
    ctx.fillText('τ', lx + 18, ly + 16);
    ctx.restore();

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
