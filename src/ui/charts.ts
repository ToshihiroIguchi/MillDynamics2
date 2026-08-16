// src/ui/charts.ts
// The two scientific charts under the viewport, built on Chart.js.
//
// Deliberate deviation from the `dataviz` guidance: both charts carry two
// y-scales. The flow curve plots mu_app [Pa.s] and tau [Pa] against the same
// gamma_dot, which is the standard rheogram and what PARAMETERS.md specifies;
// the time history plots torque [N.m/m] against kinetic energy [J/m]. The two
// measures cannot share a scale (different units, different magnitudes) and the
// drawer is too short to stack two panels without reintroducing exactly the
// squashing this rewrite removes. Each y-axis title is drawn in its own series
// colour, so the axis-to-series mapping is stated, not guessed.
//
// These were previously drawn by hand into canvases carrying fixed width/height
// attributes while CSS stretched them to the drawer, so the bitmap was scaled
// non-uniformly: every glyph and curve came out vertically squashed. Chart.js
// owns the backing-store size here (responsive + maintainAspectRatio:false, and
// it applies devicePixelRatio itself), so the drawing surface always matches the
// CSS box and nothing is scaled after the fact.

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  Legend,
  Tooltip,
  Decimation,
  ChartConfiguration
} from 'chart.js';

import { ConfigValues } from '../config';
import { muAppJs } from './flowcurve';
import { DataPoint } from '../export/csv';

Chart.register(
  LineController, LineElement, PointElement,
  LinearScale, LogarithmicScale, Legend, Tooltip, Decimation
);

// Palette shared with the field renderer and the CSS custom properties.
const C_MU = '#38bdf8';
const C_TAU = '#a3e635';
const C_MARK = '#f59e0b';
const C_GRID = '#334155';
const C_TEXT = '#94a3b8';
const C_SURFACE = '#1e293b'; // --bg-card, the surface both charts sit on

Chart.defaults.color = C_TEXT;
Chart.defaults.borderColor = C_GRID;
Chart.defaults.font.family = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
Chart.defaults.font.size = 10;
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;

const axisTitle = (text: string, color: string) => ({
  display: true,
  text,
  color,
  font: { size: 10 }
});

// --- tick formatting -------------------------------------------------------

const SUPER_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function supers(exp: number): string {
  const neg = exp < 0;
  const digits = String(Math.abs(Math.round(exp)))
    .split('')
    .map(d => SUPER_DIGITS[Number(d)])
    .join('');
  return (neg ? '⁻' : '') + digits;
}

// Label the decades of a log axis as 10^k and leave the 2/3/5 minor ticks
// unlabelled. Chart.js's default would print "1,000,000.00" across a seven-decade
// axis, which is unreadable and also just wrong for a log scale.
//
// maxLabels thins the decades further where there is no room for all of them:
// tau spans eight decades against a plot area barely 120 px tall, and every
// decade labelled there is a solid column of touching glyphs.
function decadeOf(v: number): number | null {
  if (!(v > 0)) return null;
  const e = Math.log10(v);
  const r = Math.round(e);
  return Math.abs(e - r) > 1e-6 ? null : r;
}

function makeLogTick(maxLabels: number) {
  return function (value: number | string, _i: number, ticks: { value: number }[]): string | undefined {
    const r = decadeOf(Number(value));
    if (r === null) return undefined;
    const decades = ticks.map(t => decadeOf(t.value)).filter((d): d is number => d !== null);
    if (decades.length === 0) return undefined;
    const stride = Math.max(1, Math.ceil(decades.length / maxLabels));
    // Anchor the stride to the lowest decade so the labelled set is stable as
    // the axis range changes.
    return (r - Math.min(...decades)) % stride === 0 ? `10${supers(r)}` : undefined;
  };
}

const logTickX = makeLogTick(8);
const logTickY = makeLogTick(5);

// Decimals implied by the spacing of the generated ticks, so a 0.01 s window and
// a 100 s window are both labelled with the resolution they actually have.
function linearTick(value: number | string, index: number, ticks: { value: number }[]): string {
  const v = Number(value);
  const step = ticks.length > 1 ? Math.abs(ticks[1].value - ticks[0].value) : Math.abs(v);
  const a = Math.abs(v);
  if (a >= 1e5 || (a > 0 && a < 1e-3)) return v.toExponential(1);
  const decimals = step > 0 ? Math.min(Math.max(Math.ceil(-Math.log10(step)) + 1, 0), 6) : 2;
  return v.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Flow curve: mu_app(gamma_dot) and tau(gamma_dot) on log-log axes.
// ---------------------------------------------------------------------------

const GD_MIN_LOG = -2;
const GD_MAX_LOG = 5;
const GD_POINTS = 141;

export class FlowCurveChart {
  private chart: Chart;
  private lastKey = '';

  constructor(canvas: HTMLCanvasElement) {
    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'μ_app [Pa·s]',
            data: [],
            yAxisID: 'yMu',
            borderColor: C_MU,
            backgroundColor: C_MU,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0
          },
          {
            label: 'τ [Pa]',
            data: [],
            yAxisID: 'yTau',
            borderColor: C_TAU,
            backgroundColor: C_TAU,
            borderWidth: 2,
            borderDash: [5, 3],
            pointRadius: 0,
            tension: 0
          },
          {
            // Where the mill is actually operating on that curve.
            label: 'Bed γ̇',
            data: [],
            yAxisID: 'yMu',
            borderColor: C_MARK,
            backgroundColor: C_MARK,
            showLine: false,
            pointRadius: 5,
            pointHoverRadius: 6,
            // Ring in the card colour: the marker sits on top of the mu curve,
            // and amber against lime is the one pair in this palette that a
            // deuteranope cannot separate by hue alone (measured DeltaE 7.4), so
            // it separates by shape and by this gap instead.
            pointBorderColor: C_SURFACE,
            pointBorderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        interaction: { mode: 'nearest', intersect: false },
        layout: { padding: { top: 2, right: 2 } },
        scales: {
          x: {
            type: 'logarithmic',
            min: Math.pow(10, GD_MIN_LOG),
            max: Math.pow(10, GD_MAX_LOG),
            title: axisTitle('γ̇ [s⁻¹]', C_TEXT),
            grid: { color: C_GRID },
            ticks: { callback: logTickX, autoSkip: false, maxRotation: 0 }
          },
          yMu: {
            type: 'logarithmic',
            position: 'left',
            title: axisTitle('μ_app [Pa·s]', C_MU),
            grid: { color: C_GRID },
            ticks: { color: C_MU, callback: logTickY, autoSkip: false }
          },
          yTau: {
            type: 'logarithmic',
            position: 'right',
            title: axisTitle('τ [Pa]', C_TAU),
            // One grid on the plot area is enough; two log grids overlap into mush.
            grid: { drawOnChartArea: false },
            ticks: { color: C_TAU, callback: logTickY, autoSkip: false }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { boxWidth: 14, boxHeight: 2, padding: 8, usePointStyle: false }
          },
          tooltip: {
            callbacks: {
              title: (items) => `γ̇ = ${Number(items[0].parsed.x).toPrecision(3)} s⁻¹`,
              label: (item) => `${item.dataset.label}: ${Number(item.parsed.y).toPrecision(4)}`
            }
          }
        }
      }
    };
    this.chart = new Chart(canvas, config);
  }

  // The curve depends only on the six rheology parameters and the marker
  // position, so redrawing it on every UI tick would be pure waste.
  updateIfChanged(cfg: ConfigValues, meanGammaDot: number): void {
    const key = [
      cfg.K, cfg.n, cfg.tauY, cfg.m, cfg.muMin, cfg.muMax,
      meanGammaDot > 0 ? Math.log10(meanGammaDot).toFixed(2) : 'x'
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.update(cfg, meanGammaDot);
  }

  update(cfg: ConfigValues, meanGammaDot: number = 0): void {
    const K = <number>cfg.K;
    const n = <number>cfg.n;
    const tauY = <number>cfg.tauY;
    const mReg = <number>cfg.m;
    const muMin = <number>cfg.muMin;
    const muMax = <number>cfg.muMax;

    const mu: { x: number; y: number }[] = [];
    const tau: { x: number; y: number }[] = [];
    for (let i = 0; i < GD_POINTS; i++) {
      const logG = GD_MIN_LOG + (i / (GD_POINTS - 1)) * (GD_MAX_LOG - GD_MIN_LOG);
      const gd = Math.pow(10, logG);
      const m = muAppJs(gd, K, n, tauY, mReg, muMin, muMax);
      mu.push({ x: gd, y: m });
      tau.push({ x: gd, y: m * gd });
    }

    const marker: { x: number; y: number }[] = [];
    if (meanGammaDot > 0) {
      marker.push({
        x: meanGammaDot,
        y: muAppJs(meanGammaDot, K, n, tauY, mReg, muMin, muMax)
      });
    }

    this.chart.data.datasets[0].data = mu as any;
    this.chart.data.datasets[1].data = tau as any;
    this.chart.data.datasets[2].data = marker as any;
    this.chart.update('none');
  }

  resize(): void {
    this.chart.resize();
  }
}

// ---------------------------------------------------------------------------
// Time history: shell torque and kinetic energy against simulated time.
// ---------------------------------------------------------------------------

// Percentile extent, not min/max. Starting a mill from rest is an impulsive
// problem: the first samples carry a torque spike orders of magnitude above the
// working value, and an axis scaled to it flattens the rest of the trace onto
// the frame.
function percentileExtent(values: number[]): { min: number; max: number } {
  const vals = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (vals.length === 0) return { min: 0, max: 1 };
  let lo = vals[Math.floor(0.02 * (vals.length - 1))];
  let hi = vals[Math.ceil(0.98 * (vals.length - 1))];
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) {
    hi = lo + Math.max(1, Math.abs(lo) * 0.1);
  }
  const pad = 0.06 * (hi - lo);
  return { min: lo - pad, max: hi + pad };
}

export class TimeSeriesChart {
  private chart: Chart;

  constructor(canvas: HTMLCanvasElement) {
    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Torque T [N·m/m]',
            data: [],
            yAxisID: 'yT',
            borderColor: C_MU,
            backgroundColor: C_MU,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0
          },
          {
            label: 'Kinetic Energy [J/m]',
            data: [],
            yAxisID: 'yKe',
            borderColor: C_TAU,
            backgroundColor: C_TAU,
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 2, right: 2 } },
        scales: {
          x: {
            type: 'linear',
            title: axisTitle('t [s]', C_TEXT),
            grid: { color: C_GRID },
            ticks: { maxTicksLimit: 7, maxRotation: 0, callback: linearTick }
          },
          yT: {
            type: 'linear',
            position: 'left',
            title: axisTitle('T [N·m/m]', C_MU),
            grid: { color: C_GRID },
            ticks: { color: C_MU, maxTicksLimit: 6, callback: linearTick }
          },
          yKe: {
            type: 'linear',
            position: 'right',
            title: axisTitle('KE [J/m]', C_TAU),
            grid: { drawOnChartArea: false },
            ticks: { color: C_TAU, maxTicksLimit: 6, callback: linearTick }
          }
        },
        plugins: {
          // The series can reach the 4000-sample cap; drawing every sample into a
          // ~300 px wide plot is invisible work.
          decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { boxWidth: 14, boxHeight: 2, padding: 8 }
          },
          tooltip: {
            callbacks: {
              title: (items) => `t = ${Number(items[0].parsed.x).toFixed(3)} s`,
              label: (item) => `${item.dataset.label}: ${Number(item.parsed.y).toPrecision(4)}`
            }
          }
        }
      }
    };
    this.chart = new Chart(canvas, config);
  }

  update(points: DataPoint[]): void {
    const torque = points.map(p => ({ x: p.time, y: p.torque }));
    const ke = points.map(p => ({ x: p.time, y: p.kineticEnergy }));

    this.chart.data.datasets[0].data = torque as any;
    this.chart.data.datasets[1].data = ke as any;

    const scales = this.chart.options.scales as any;
    if (points.length >= 2) {
      const tq = percentileExtent(points.map(p => p.torque));
      const keEx = percentileExtent(points.map(p => p.kineticEnergy));
      scales.yT.min = tq.min;
      scales.yT.max = tq.max;
      scales.yKe.min = keEx.min;
      scales.yKe.max = keEx.max;
    } else {
      scales.yT.min = undefined;
      scales.yT.max = undefined;
      scales.yKe.min = undefined;
      scales.yKe.max = undefined;
    }

    this.chart.update('none');
  }

  reset(): void {
    this.update([]);
  }

  resize(): void {
    this.chart.resize();
  }
}
