// src/main.ts
// Main application entry point orchestrating WebAssembly solver, UI, and rendering

import { ConfigValues, getDefaultConfig, computeDerived, encodePermalink, decodePermalink } from './config';
import { applyPreset, PRESETS } from './presets';
import { FieldRenderer, RenderOptions, FieldType } from './render/field';
import { ColormapName } from './render/colormap';
import { FlowCurvePlot } from './ui/flowcurve';
import { renderAboutModal } from './ui/about';
import { renderControlPanel, updateDerivedReadouts } from './ui/panel';
import { generateCsv, downloadCsv, DataPoint } from './export/csv';

const MODE_SLUMP = 4;

class App {
  wasm: any = null;
  cfg: ConfigValues = getDefaultConfig();
  isRunning: boolean = true;
  fieldRenderer!: FieldRenderer;
  flowCurvePlot!: FlowCurvePlot;

  currentAngle: number = 0.0;
  timeSeries: DataPoint[] = [];
  fps: number = 0;
  lastFrameTime: number = performance.now();

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
    // 1. Load WebAssembly module
    const wasmUrls = [
      './mill.wasm',
      './build/mill.wasm',
      './build/release.wasm',
      new URL('../assembly/build/mill.wasm', import.meta.url).href,
      new URL('../assembly/build/mill.debug.wasm', import.meta.url).href
    ];
    let wasmBytes: ArrayBuffer | null = null;
    for (const u of wasmUrls) {
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

    // 2. Check URL permalink hash
    const hashCfg = decodePermalink(window.location.hash);
    if (hashCfg) {
      this.cfg = hashCfg;
    } else {
      this.cfg = applyPreset('baseline');
    }

    // 3. Setup Renderers
    const simCanvas = document.getElementById('simCanvas') as HTMLCanvasElement;
    this.fieldRenderer = new FieldRenderer(simCanvas);

    const flowCurveCanvas = document.getElementById('flowCurveCanvas') as HTMLCanvasElement;
    this.flowCurvePlot = new FlowCurvePlot(flowCurveCanvas);

    // 4. Setup Modal and Sidebar UI
    const modalContainer = document.getElementById('modalContainer');
    if (modalContainer) modalContainer.innerHTML = renderAboutModal();

    const sidebar = document.getElementById('sidebarPanel');
    if (sidebar) {
      renderControlPanel(sidebar, this.cfg, {
        onParamChange: (k, v, rebuild) => this.handleParamChange(k, v, rebuild),
        onPresetSelect: (id) => this.handlePresetSelect(id),
        onPlayPause: () => this.togglePlayPause(),
        onStep: () => this.stepOnce(),
        onReset: () => this.resetSimulation(),
        onExportCsv: () => this.exportCsv(),
        onPermalink: () => this.copyPermalink(),
        onOpenAbout: () => this.openAboutModal()
      });
    }

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

    w.setPenalization(<number>cfg.etaPenal);
    w.setViscousIterations(<number>cfg.nVisc);
    w.setSubSteps(<number>cfg.nSub);
    w.setFixedTimeStep(<number>cfg.fixedDt);
    w.setGravity(0.0, -<number>cfg.gravity);

    this.currentAngle = 0.0;
    this.timeSeries = [];
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

    w.setPenalization(<number>cfg.etaPenal);
    w.setViscousIterations(<number>cfg.nVisc);
    w.setSubSteps(<number>cfg.nSub);
    w.setFixedTimeStep(<number>cfg.fixedDt);
    w.setGravity(0.0, -<number>cfg.gravity);
  }

  handleParamChange(key: string, value: any, rebuildsSolver: boolean): void {
    this.cfg[key] = value;

    // Handle rheology mode presets
    if (key === 'rheologyMode') {
      if (value === 'newtonian') {
        this.cfg.n = 1.0;
        this.cfg.tauY = 0.0;
      } else if (value === 'power-law') {
        this.cfg.tauY = 0.0;
      } else if (value === 'bingham') {
        this.cfg.n = 1.0;
      }
    }

    if (rebuildsSolver) {
      this.rebuildSolver();
    } else {
      this.applyLiveParameters();
    }

    window.history.replaceState(null, '', encodePermalink(this.cfg));
  }

  handlePresetSelect(presetId: string): void {
    this.cfg = applyPreset(presetId, this.cfg);
    const sidebar = document.getElementById('sidebarPanel');
    if (sidebar) {
      renderControlPanel(sidebar, this.cfg, {
        onParamChange: (k, v, rebuild) => this.handleParamChange(k, v, rebuild),
        onPresetSelect: (id) => this.handlePresetSelect(id),
        onPlayPause: () => this.togglePlayPause(),
        onStep: () => this.stepOnce(),
        onReset: () => this.resetSimulation(),
        onExportCsv: () => this.exportCsv(),
        onPermalink: () => this.copyPermalink(),
        onOpenAbout: () => this.openAboutModal()
      });
    }
    this.rebuildSolver();
    window.history.replaceState(null, '', encodePermalink(this.cfg));
  }

  togglePlayPause(): void {
    this.isRunning = !this.isRunning;
    const btn = document.getElementById('btnPlayPause');
    if (btn) btn.textContent = this.isRunning ? 'Pause' : 'Play';
  }

  stepOnce(): void {
    this.isRunning = false;
    const btn = document.getElementById('btnPlayPause');
    if (btn) btn.textContent = 'Play';
    this.wasm.step(0.0);
    const dt = this.wasm.getLastDt();
    const derived = computeDerived(this.cfg);
    this.currentAngle += dt * derived.omega;
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

  openAboutModal(): void {
    const modal = document.getElementById('aboutModal');
    if (modal) {
      modal.style.display = 'flex';
      modal.querySelector('#btnCloseAbout')?.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
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
    this.fps = 1000.0 / Math.max(elapsed, 1.0);

    const w = this.wasm;
    const N = <number>this.cfg.N;
    const derived = computeDerived(this.cfg);

    if (this.isRunning && w) {
      w.step(0.0);
      const dt = w.getLastDt();
      this.currentAngle += dt * derived.omega;
    }

    if (w) {
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

      if (this.isRunning && this.timeSeries.length < 5000) {
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

      // Render flow curve
      this.flowCurvePlot.render(this.cfg, meanShearBed);

      // Render time series chart
      this.renderTimeSeriesChart();

      // Update sidebar readouts
      const sidebar = document.getElementById('sidebarPanel');
      if (sidebar) updateDerivedReadouts(sidebar, this.cfg, diagObj);
    }

    requestAnimationFrame((t) => this.animationLoop(t));
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

    const padLeft = 45;
    const padRight = 15;
    const padTop = 15;
    const padBottom = 25;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Time extent
    const tMin = pts[0].time;
    const tMax = pts[pts.length - 1].time;
    const dtTotal = Math.max(tMax - tMin, 0.01);

    // Torque min/max
    let tqMin = Infinity;
    let tqMax = -Infinity;
    for (const pt of pts) {
      if (pt.torque < tqMin) tqMin = pt.torque;
      if (pt.torque > tqMax) tqMax = pt.torque;
    }
    if (tqMin >= tqMax) { tqMin = 0; tqMax = 100; }
    const tqRange = tqMax - tqMin;

    // Grid & axes
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`${tqMax.toFixed(0)}`, padLeft - 4, padTop + 10);
    ctx.fillText(`${tqMin.toFixed(0)}`, padLeft - 4, padTop + plotH);
    ctx.textAlign = 'center';
    ctx.fillText(`t = ${tMax.toFixed(1)}s`, padLeft + plotW / 2, padTop + plotH + 18);

    // Plot Torque (cyan line)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = padLeft + ((pts[i].time - tMin) / dtTotal) * plotW;
      const py = padTop + plotH - ((pts[i].torque - tqMin) / tqRange) * plotH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

// Bootstrap on DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init().catch((err) => console.error('App initialization error:', err));
});
