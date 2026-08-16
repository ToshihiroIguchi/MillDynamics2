// src/main.ts
// Main application entry point orchestrating WebAssembly solver, UI, and rendering

import './style.css';
import { ConfigValues, getDefaultConfig, computeDerived, encodePermalink, decodePermalink, migrateConfig } from './config';
import { applyPreset, PRESETS } from './presets';
import { FieldRenderer, RenderOptions, FieldType } from './render/field';
import { ColormapName } from './render/colormap';
import { FlowCurveChart, TimeSeriesChart } from './ui/charts';
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
  flowCurveChart!: FlowCurveChart;
  timeSeriesChart!: TimeSeriesChart;

  currentAngle: number = 0.0;
  activePreset: string = 'default';
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
      // migrateConfig first: a link saved when the speed control was %Nc must
      // reproduce its own run, not inherit the default rpm.
      this.cfg = { ...getDefaultConfig(), ...migrateConfig(hashCfg) };
      this.activePreset = '';
    } else {
      this.cfg = applyPreset('default');
      this.activePreset = 'default';
    }

    // 3. Setup Renderers
    const simCanvas = document.getElementById('simCanvas') as HTMLCanvasElement;
    this.fieldRenderer = new FieldRenderer(simCanvas);

    const flowCurveCanvas = document.getElementById('flowCurveCanvas') as HTMLCanvasElement;
    this.flowCurveChart = new FlowCurveChart(flowCurveCanvas);
    const timeSeriesCanvas = document.getElementById('timeSeriesCanvas') as HTMLCanvasElement;
    this.timeSeriesChart = new TimeSeriesChart(timeSeriesCanvas);

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
    // Drop the trace from the previous configuration rather than letting it hang
    // on the chart until the next UI tick.
    this.timeSeriesChart?.reset();
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
    // Presets 0 and 1 are complete configurations and rebase on the schema
    // defaults instead.
    const base =
      presetId === 'baseline' || presetId === 'default'
        ? getDefaultConfig()
        : applyPreset('baseline');
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
        this.flowCurveChart.updateIfChanged(this.cfg, meanShearBed);
        this.timeSeriesChart.update(this.timeSeries);
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

}

// Bootstrap on DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch((err) => console.error('App initialization error:', err));
});
