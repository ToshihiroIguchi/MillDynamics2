// src/main.ts
// Main application entry point orchestrating WebAssembly solver, UI, and rendering

import './style.css';
import { ConfigValues, getDefaultConfig, computeDerived, encodePermalink, decodePermalink } from './config';
import { applyPreset, PRESETS } from './presets';
import { FieldRenderer, RenderOptions, FieldType } from './render/field';
import { ColormapName } from './render/colormap';
import { FlowCurvePlot } from './ui/flowcurve';
import { renderAboutModal } from './ui/about';
import { renderControlPanel, updateDerivedReadouts } from './ui/panel';
import { generateCsv, downloadCsv, DataPoint } from './export/csv';
import { MODE_SLUMP } from './modes';

// Refresh interval for text/chart UI, decoupled from the simulation frame rate.
const UI_UPDATE_MS = 200;
const TIMESERIES_CAP = 4000;

class App {
  wasm: any = null;
  cfg: ConfigValues = getDefaultConfig();
  isRunning: boolean = true;
  fieldRenderer!: FieldRenderer;
  flowCurvePlot!: FlowCurvePlot;

  currentAngle: number = 0.0;
  activePreset: string = 'baseline';
  timeSeries: DataPoint[] = [];
  timeSeriesStride: number = 1;
  frameCounter: number = 0;
  fps: number = 0;
  lastFrameTime: number = performance.now();
  lastUiUpdate: number = 0;

  renderOpts: RenderOptions = {
    fieldType: 'mu',
    colormap: 'viridis',
    showShell: true,
    showLifters: true,
    showBed: true,
    showVectors: false,
    vectorDecimation: 8
  };

  async init(): Promise<void> {
    // 1. Load the WebAssembly module.
    // A single `new URL(..., import.meta.url)` reference is enough: Vite emits
    // the release binary as a hashed asset and rewrites the URL for whatever
    // base the site is served from. The previous list also referenced
    // mill.debug.wasm, which made Vite bundle the 185 kB debug build into the
    // production output where it could never be reached.
    const wasmUrl = new URL('../assembly/build/mill.wasm', import.meta.url).href;
    let wasmBytes: ArrayBuffer | null = null;
    for (const u of [wasmUrl, './mill.wasm']) {
      try {
        const resp = await fetch(u);
        if (resp.ok) {
          wasmBytes = await resp.arrayBuffer();
          break;
        }
      } catch {}
    }
    if (!wasmBytes) throw new Error('Failed to load WASM binary');

    const wasmModule = await WebAssembly.instantiate(wasmBytes, {
      env: {
        abort(msg: number, file: number, line: number, col: number) {
          console.error(`WASM abort at line ${line}:${col}`);
        },
        trace() {}
      }
    });
    this.wasm = wasmModule.instance.exports;
    (window as any).__MILL_APP__ = this;

    // 2. Check URL permalink hash. Merge over the defaults so a permalink saved
    // by an older build (missing keys added since) cannot leave cfg entries
    // undefined and feed NaN straight into the solver.
    const hashCfg = decodePermalink(window.location.hash);
    if (hashCfg) {
      this.cfg = { ...getDefaultConfig(), ...hashCfg };
      this.activePreset = '';
    } else {
      this.cfg = applyPreset('baseline');
      this.activePreset = 'baseline';
    }

    // 3. Setup Renderers
    const simCanvas = document.getElementById('simCanvas') as HTMLCanvasElement;
    this.fieldRenderer = new FieldRenderer(simCanvas);

    const flowCurveCanvas = document.getElementById('flowCurveCanvas') as HTMLCanvasElement;
    this.flowCurvePlot = new FlowCurvePlot(flowCurveCanvas);

    // 4. Setup Modal and Sidebar UI
    const modalContainer = document.getElementById('modalContainer');
    if (modalContainer) modalContainer.innerHTML = renderAboutModal();
    this.bindAboutModal();

    this.mountControlPanel();

    // Bind field and overlay selectors
    this.bindViewportControls();

    // 5. Initialize solver and start loop
    this.rebuildSolver();
    requestAnimationFrame((t) => this.animationLoop(t));
  }

  rebuildSolver(): void {
    const w = this.wasm;
    const cfg = this.cfg;
    const derived = computeDerived(cfg);
    const N = <number>cfg.N;
    const L = derived.L;

    w.setBoundaryMode(MODE_SLUMP);
    w.createSolver(N, L);
    w.setFluid(<number>cfg.rho, <number>cfg.K);
    w.setRheology(
      <number>cfg.K,
      <number>cfg.n,
      <number>cfg.tauY,
      <number>cfg.m,
      <number>cfg.muMin,
      <number>cfg.muMax
    );

    const thetaReposeRad = (<number>cfg.thetaRepose * Math.PI) / 180.0;
    const alphaLifterRad = (<number>cfg.alphaLifter * Math.PI) / 180.0;

    w.setMillGeometry(
      derived.R,
      derived.omega,
      <number>cfg.nLifters,
      <number>cfg.hLifter,
      <number>cfg.wLifter,
      alphaLifterRad
    );

    w.setBedParameters(
      <number>cfg.fillJ,
      thetaReposeRad,
      <number>cfg.kSlip,
      <number>cfg.porosity,
      <number>cfg.dp,
      <number>cfg.A_ergun,
      <number>cfg.B_ergun,
      <number>cfg.C_gamma
    );

    this.applyNumerics();

    this.currentAngle = 0.0;
    this.timeSeries = [];
    this.timeSeriesStride = 1;
    this.frameCounter = 0;
  }

  // CFL, max dt and the advection scheme are in PARAM_SCHEMA and have always
  // been shown in the panel, but nothing ever pushed them into the solver, so
  // those three controls did nothing at all.
  applyNumerics(): void {
    const w = this.wasm;
    const cfg = this.cfg;
    w.setPenalization(<number>cfg.etaPenal);
    w.setViscousIterations(<number>cfg.nVisc);
    w.setSubSteps(<number>cfg.nSub);
    w.setFixedTimeStep(<number>cfg.fixedDt);
    w.setCFL(<number>cfg.cfl);
    w.setMaxTimeStep(<number>cfg.maxDt);
    w.setAdvectionScheme(cfg.advectionScheme === 'semi-lagrangian' ? 0 : 1);
    w.setGravity(0.0, -<number>cfg.gravity);
  }

  applyLiveParameters(): void {
    const w = this.wasm;
    const cfg = this.cfg;
    const derived = computeDerived(cfg);

    w.setFluid(<number>cfg.rho, <number>cfg.K);
    w.setRheology(
      <number>cfg.K,
      <number>cfg.n,
      <number>cfg.tauY,
      <number>cfg.m,
      <number>cfg.muMin,
      <number>cfg.muMax
    );

    const thetaReposeRad = (<number>cfg.thetaRepose * Math.PI) / 180.0;
    const alphaLifterRad = (<number>cfg.alphaLifter * Math.PI) / 180.0;

    w.setMillGeometry(
      derived.R,
      derived.omega,
      <number>cfg.nLifters,
      <number>cfg.hLifter,
      <number>cfg.wLifter,
      alphaLifterRad
    );

    w.setBedParameters(
      <number>cfg.fillJ,
      thetaReposeRad,
      <number>cfg.kSlip,
      <number>cfg.porosity,
      <number>cfg.dp,
      <number>cfg.A_ergun,
      <number>cfg.B_ergun,
      <number>cfg.C_gamma
    );

    this.applyNumerics();
  }

  handleParamChange(key: string, value: any, rebuildsSolver: boolean): void {
    this.cfg[key] = value;

    // Once a value is hand-edited the config no longer matches any preset; the
    // dropdown used to keep claiming the preset that was last selected.
    if (this.activePreset) {
      this.activePreset = '';
      const sel = document.getElementById('presetSelect') as HTMLSelectElement | null;
      if (sel) sel.value = '';
    }

    // Handle rheology mode presets
    let mutatedOthers = false;
    if (key === 'rheologyMode') {
      if (value === 'newtonian') {
        this.cfg.n = 1.0;
        this.cfg.tauY = 0.0;
        mutatedOthers = true;
      } else if (value === 'power-law') {
        this.cfg.tauY = 0.0;
        mutatedOthers = true;
      } else if (value === 'bingham') {
        this.cfg.n = 1.0;
        mutatedOthers = true;
      }
    }

    if (rebuildsSolver) {
      this.rebuildSolver();
    } else {
      this.applyLiveParameters();
    }

    // Selecting a rheology mode silently rewrote n and tau_y but left the two
    // inputs showing their old values, so the panel and the solver disagreed.
    if (mutatedOthers) this.refreshPanelValues();

    window.history.replaceState(null, '', encodePermalink(this.cfg));
  }

  // Push cfg back into the existing inputs without rebuilding the panel, so the
  // accordion open/closed state and keyboard focus survive.
  refreshPanelValues(): void {
    const sidebar = document.getElementById('sidebarPanel');
    if (!sidebar) return;
    for (const key of Object.keys(this.cfg)) {
      const inp = sidebar.querySelector(`#inp_${key}`) as HTMLInputElement | HTMLSelectElement | null;
      const rng = sidebar.querySelector(`#rng_${key}`) as HTMLInputElement | null;
      if (inp) inp.value = String(this.cfg[key]);
      if (rng) rng.value = String(this.cfg[key]);
    }
  }

  handlePresetSelect(presetId: string): void {
    // Presets 2-9 are deltas on top of the current config, so a preset applied
    // after another preset inherits whatever the previous one changed. Rebase on
    // the baseline first so each preset is reproducible from a cold start.
    const base = presetId === 'baseline' ? getDefaultConfig() : applyPreset('baseline');
    this.cfg = applyPreset(presetId, base);
    this.activePreset = presetId;
    this.mountControlPanel();
    this.rebuildSolver();
    window.history.replaceState(null, '', encodePermalink(this.cfg));
  }

  mountControlPanel(): void {
    const sidebar = document.getElementById('sidebarPanel');
    if (!sidebar) return;
    renderControlPanel(sidebar, this.cfg, {
      onParamChange: (k, v, rebuild) => this.handleParamChange(k, v, rebuild),
      onPresetSelect: (id) => this.handlePresetSelect(id),
      onPlayPause: () => this.togglePlayPause(),
      onStep: () => this.stepOnce(),
      onReset: () => this.resetSimulation(),
      onExportCsv: () => this.exportCsv(),
      onPermalink: () => this.copyPermalink(),
      onOpenAbout: () => this.openAboutModal()
    }, this.activePreset);
    this.syncPlayPauseButton();
  }

  // The button was rendered with a hard-coded "Play" label while isRunning
  // defaulted to true, so the very first click on "Play" paused the simulation.
  syncPlayPauseButton(): void {
    const btn = document.getElementById('btnPlayPause');
    if (btn) btn.textContent = this.isRunning ? 'Pause' : 'Play';
  }

  togglePlayPause(): void {
    this.isRunning = !this.isRunning;
    this.syncPlayPauseButton();
  }

  stepOnce(): void {
    this.isRunning = false;
    this.syncPlayPauseButton();
    this.wasm.step(0.0);
  }

  resetSimulation(): void {
    this.rebuildSolver();
  }

  exportCsv(): void {
    const csvStr = generateCsv(this.cfg, this.timeSeries);
    downloadCsv(`milldynamics2_export_${Date.now()}.csv`, csvStr);
  }

  copyPermalink(): void {
    const url = window.location.origin + window.location.pathname + encodePermalink(this.cfg);
    navigator.clipboard.writeText(url).then(() => {
      alert('Permalink copied to clipboard!');
    });
  }

  // Bound once at startup. Binding inside openAboutModal() attached a fresh
  // click handler on every open, so the close button accumulated listeners.
  bindAboutModal(): void {
    const modal = document.getElementById('aboutModal');
    if (!modal) return;
    const close = () => { modal.style.display = 'none'; };
    modal.querySelector('#btnCloseAbout')?.addEventListener('click', close);
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) close();
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && modal.style.display === 'flex') close();
    });
  }

  openAboutModal(): void {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.style.display = 'flex';
  }

  bindViewportControls(): void {
    const fieldSelect = document.getElementById('fieldSelect') as HTMLSelectElement;
    if (fieldSelect) {
      fieldSelect.addEventListener('change', () => {
        this.renderOpts.fieldType = fieldSelect.value as FieldType;
      });
    }

    const cmapSelect = document.getElementById('cmapSelect') as HTMLSelectElement;
    if (cmapSelect) {
      cmapSelect.addEventListener('change', () => {
        this.renderOpts.colormap = cmapSelect.value as ColormapName;
      });
    }

    const chkShell = document.getElementById('chkShell') as HTMLInputElement;
    if (chkShell) chkShell.addEventListener('change', () => (this.renderOpts.showShell = chkShell.checked));

    const chkLifters = document.getElementById('chkLifters') as HTMLInputElement;
    if (chkLifters) chkLifters.addEventListener('change', () => (this.renderOpts.showLifters = chkLifters.checked));

    const chkBed = document.getElementById('chkBed') as HTMLInputElement;
    if (chkBed) chkBed.addEventListener('change', () => (this.renderOpts.showBed = chkBed.checked));

    const chkVectors = document.getElementById('chkVectors') as HTMLInputElement;
    if (chkVectors) chkVectors.addEventListener('change', () => (this.renderOpts.showVectors = chkVectors.checked));
  }

  animationLoop(now: number): void {
    const elapsed = now - this.lastFrameTime;
    this.lastFrameTime = now;
    // Exponential moving average — the instantaneous reciprocal jittered wildly.
    const instFps = 1000.0 / Math.max(elapsed, 1.0);
    this.fps = this.fps > 0 ? 0.9 * this.fps + 0.1 * instFps : instFps;

    const w = this.wasm;
    const N = <number>this.cfg.N;
    const derived = computeDerived(this.cfg);

    if (this.isRunning && w) {
      w.step(0.0);
    }

    if (w) {
      // Read the shell angle back from the solver rather than re-integrating
      // omega*dt here; the two drifted apart, so the drawn lifters no longer sat
      // over the notches in the chi mask they are supposed to represent.
      this.currentAngle = w.getMillAngle();
      const u = new Float64Array(w.memory.buffer, w.ptrU(), (N + 1) * N);
      const v = new Float64Array(w.memory.buffer, w.ptrV(), N * (N + 1));
      const p = new Float64Array(w.memory.buffer, w.ptrP(), N * N);
      const mu = new Float64Array(w.memory.buffer, w.ptrMu(), N * N);
      const gammaDot = new Float64Array(w.memory.buffer, w.ptrGammaDot(), N * N);
      const chi = new Float64Array(w.memory.buffer, w.ptrChi(), N * N);
      const chiBed = new Float64Array(w.memory.buffer, w.ptrChiBed(), N * N);

      // Extract diagnostics
      const simTime = w.getTime();
      const dt = w.getLastDt();
      const torque = w.diagTorque();
      const power = torque * Math.abs(derived.omega);
      const meanShearBed = w.diagBedMeanShearRate();
      const meanShearFree = w.diagFreeMeanShearRate();
      const maxVel = w.diagMaxVel();
      const yieldedFraction = w.diagYieldedFraction();
      const kineticEnergy = w.diagKineticEnergy();
      const maxDiv = w.diagMaxDiv();

      const diagObj = {
        torque,
        power,
        meanShearBed,
        meanShearFree,
        maxVel,
        yieldedFraction,
        kineticEnergy,
        maxDiv,
        simTime
      };

      // Previously this simply stopped recording once it hit 5000 samples
      // (~80 s of wall clock), so both the chart and the CSV export silently
      // froze mid-run. Halve the resolution instead and keep the full span.
      if (this.isRunning && this.timeSeries.length >= TIMESERIES_CAP) {
        this.timeSeries = this.timeSeries.filter((_, i) => i % 2 === 0);
        this.timeSeriesStride *= 2;
      }
      if (this.isRunning && this.frameCounter++ % this.timeSeriesStride === 0) {
        this.timeSeries.push({
          time: simTime,
          dt,
          torque,
          power,
          meanShearBed,
          meanShearFree,
          maxVel,
          yieldedFraction,
          kineticEnergy,
          maxDiv
        });
      }

      // Render main simulation canvas
      this.fieldRenderer.render(
        N, u, v, p, mu, gammaDot, chi, chiBed,
        this.cfg, this.currentAngle, this.renderOpts
      );

      // The charts and the readout grid are text/DOM work that nobody can read
      // at 60 Hz. Rebuilding 14 readout cards' innerHTML every frame was a
      // measurable share of the frame budget on its own.
      if (now - this.lastUiUpdate > UI_UPDATE_MS) {
        this.lastUiUpdate = now;
        this.flowCurvePlot.renderIfChanged(this.cfg, meanShearBed);
        this.renderTimeSeriesChart();
        const sidebar = document.getElementById('sidebarPanel');
        if (sidebar) {
          updateDerivedReadouts(sidebar, this.cfg, {
            ...diagObj,
            fps: this.fps,
            stepsPerSec: this.fps
          });
        }
      }
      this.renderHud(simTime, dt);
    }

    requestAnimationFrame((t) => this.animationLoop(t));
  }

  renderHud(simTime: number, dt: number): void {
    const el = document.getElementById('hudReadout');
    if (!el) return;
    el.textContent =
      `t = ${simTime.toFixed(3)} s   |   Δt = ${dt.toExponential(2)} s   |   ` +
      `${this.fps.toFixed(1)} fps   |   N = ${this.cfg.N}   |   ` +
      (this.isRunning ? 'running' : 'paused');
  }

  renderTimeSeriesChart(): void {
    const canvas = document.getElementById('timeSeriesCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pts = this.timeSeries;
    if (pts.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Running simulation...', w / 2, h / 2);
      return;
    }

    const padLeft = 52;
    const padRight = 52;
    const padTop = 18;
    const padBottom = 26;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Time extent
    const tMin = pts[0].time;
    const tMax = pts[pts.length - 1].time;
    const dtTotal = Math.max(tMax - tMin, 1e-6);

    // Percentile extents, not min/max. Starting a mill from rest is an impulsive
    // problem: the first few samples carry a torque spike orders of magnitude
    // above the working value, and scaling to it flattened the rest of the trace
    // into a straight line along the axis.
    const extent = (pick: (p: DataPoint) => number) => {
      const vals = pts.map(pick).filter(Number.isFinite).sort((a, b) => a - b);
      if (vals.length === 0) return { lo: 0, hi: 1 };
      let lo = vals[Math.floor(0.02 * (vals.length - 1))];
      let hi = vals[Math.ceil(0.98 * (vals.length - 1))];
      if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) {
        hi = lo + Math.max(1, Math.abs(lo) * 0.1);
      }
      // Pad by 6% so the trace does not ride the frame.
      const pad = 0.06 * (hi - lo);
      return { lo: lo - pad, hi: hi + pad };
    };

    const tq = extent(p => p.torque);
    const ke = extent(p => p.kineticEnergy);

    // Frame
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop);
    ctx.stroke();

    const fmt = (val: number): string => {
      const a = Math.abs(val);
      if (a >= 1e4 || (a > 0 && a < 1e-2)) return val.toExponential(1);
      return val.toFixed(a < 10 ? 2 : 0);
    };

    ctx.font = '9px system-ui, sans-serif';

    // Left axis: torque
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(tq.hi), padLeft - 4, padTop + 8);
    ctx.fillText(fmt(tq.lo), padLeft - 4, padTop + plotH);
    ctx.fillText('T [N·m/m]', padLeft - 4, padTop - 6);

    // Right axis: kinetic energy
    ctx.fillStyle = '#a3e635';
    ctx.textAlign = 'left';
    ctx.fillText(fmt(ke.hi), padLeft + plotW + 4, padTop + 8);
    ctx.fillText(fmt(ke.lo), padLeft + plotW + 4, padTop + plotH);
    ctx.fillText('KE [J/m]', padLeft + plotW + 4, padTop - 6);

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`t = ${tMin.toFixed(2)} … ${tMax.toFixed(2)} s`, padLeft + plotW / 2, padTop + plotH + 16);

    const series = (pick: (p: DataPoint) => number, ex: { lo: number; hi: number }, colour: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip(); // percentile scaling means outliers can fall outside the frame
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const px = padLeft + ((pts[i].time - tMin) / dtTotal) * plotW;
        const py = padTop + plotH - ((pick(pts[i]) - ex.lo) / (ex.hi - ex.lo)) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    };

    series(p => p.torque, tq, '#38bdf8');
    // The kinetic energy trace the chart title has always advertised.
    series(p => p.kineticEnergy, ke, '#a3e635');
  }
}

// Bootstrap on DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch((err) => console.error('App initialization error:', err));
});
