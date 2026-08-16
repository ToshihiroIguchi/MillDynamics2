// src/ui/panel.ts
// Dynamic Control Panel generated from PARAM_SCHEMA (config.ts)

import { PARAM_SCHEMA, ParamGroup, ConfigValues, computeDerived, getValidityWarnings } from '../config';
import { PRESETS } from '../presets';

export interface PanelCallbacks {
  onParamChange: (key: string, value: any, rebuildsSolver: boolean) => void;
  onPresetSelect: (presetId: string) => void;
  onPlayPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onExportCsv: () => void;
  onPermalink: () => void;
  onOpenAbout: () => void;
}

const GROUP_TITLES: Record<ParamGroup, string> = {
  geometry: '1. Geometry',
  operating: '2. Operating Conditions',
  charge: '3. Charge & Media',
  rheology: '4. Slurry Rheology',
  closure: '5. Porous Closure',
  numerics: '6. Numerics & Solver',
  rve: '7. Micro Scale (RVE)'
};

export function renderControlPanel(
  container: HTMLElement,
  cfg: ConfigValues,
  callbacks: PanelCallbacks,
  activePreset: string = ''
): void {
  const groups: ParamGroup[] = ['geometry', 'operating', 'charge', 'rheology', 'closure', 'numerics', 'rve'];

  // Remember which accordions the user had open so re-mounting the panel (on a
  // preset change) does not collapse everything back to the defaults.
  const openGroups = new Set<string>();
  container.querySelectorAll('details.param-group[open]').forEach(d => {
    const g = (d as HTMLElement).dataset.group;
    if (g) openGroups.add(g);
  });
  const hadPanel = container.querySelector('details.param-group') !== null;

  const presetOpts = PRESETS.map(
    p => `<option value="${p.id}" ${p.id === activePreset ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  let html = `
    <div class="panel-header">
      <div class="preset-row">
        <label for="presetSelect"><strong>Preset:</strong></label>
        <select id="presetSelect" class="select-preset">
          <option value="" ${activePreset ? '' : 'selected'}>— Custom —</option>
          ${presetOpts}
        </select>
      </div>
      <div class="btn-toolbar">
        <button id="btnPlayPause" class="btn btn-primary">Play</button>
        <button id="btnStep" class="btn btn-secondary">Step</button>
        <button id="btnReset" class="btn btn-secondary">Reset</button>
        <button id="btnExportCsv" class="btn btn-secondary">CSV</button>
        <button id="btnShare" class="btn btn-secondary">Link</button>
        <button id="btnAbout" class="btn btn-secondary">About</button>
      </div>
    </div>

    <div id="warningsBanner" class="warnings-banner" style="display:none;"></div>

    <div class="accordion-container">
  `;

  for (const g of groups) {
    const paramsInGroup = PARAM_SCHEMA.filter(p => p.group === g);
    const defaultOpen = g === 'geometry' || g === 'operating' || g === 'rheology';
    const isOpen = hadPanel ? openGroups.has(g) : defaultOpen;
    html += `
      <details class="param-group" data-group="${g}" ${isOpen ? 'open' : ''}>
        <summary class="group-title">${GROUP_TITLES[g]}</summary>
        <div class="group-content">
    `;

    for (const p of paramsInGroup) {
      const curVal = cfg[p.key];
      const rebuildHint = p.rebuildsSolver ? ' (restarts the run)' : '';
      const title = `${p.notes || p.label}${rebuildHint}`;
      html += `<div class="param-item">`;
      html += `<label for="inp_${p.key}" title="${title}">${p.label}${p.unit !== '-' ? ` [${p.unit}]` : ''}${p.rebuildsSolver ? ' ↻' : ''}:</label>`;

      if (p.options) {
        html += `<select id="inp_${p.key}" data-key="${p.key}" class="param-select">`;
        for (const opt of p.options) {
          const selected = String(curVal) === String(opt.value) ? 'selected' : '';
          html += `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
        }
        html += `</select>`;
      } else if (typeof p.default === 'number') {
        html += `
          <div class="range-input-pair">
            <input type="range" id="rng_${p.key}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${curVal}" class="param-range" />
            <input type="number" id="inp_${p.key}" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${curVal}" class="param-number" />
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div></details>`;
  }

  html += `</div>`;

  // Readouts section
  html += `
    <div class="readouts-section">
      <h3>Derived Parameters & Diagnostics</h3>
      <div id="derivedGrid" class="readouts-grid"></div>
    </div>
  `;

  container.innerHTML = html;

  // Bind Event Listeners
  const presetSelect = container.querySelector('#presetSelect') as HTMLSelectElement;
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      if (!presetSelect.value) return; // "— Custom —" is a state, not an action
      callbacks.onPresetSelect(presetSelect.value);
    });
  }

  container.querySelector('#btnPlayPause')?.addEventListener('click', callbacks.onPlayPause);
  container.querySelector('#btnStep')?.addEventListener('click', callbacks.onStep);
  container.querySelector('#btnReset')?.addEventListener('click', callbacks.onReset);
  container.querySelector('#btnExportCsv')?.addEventListener('click', callbacks.onExportCsv);
  container.querySelector('#btnShare')?.addEventListener('click', callbacks.onPermalink);
  container.querySelector('#btnAbout')?.addEventListener('click', callbacks.onOpenAbout);

  // Bind parameter input changes
  for (const p of PARAM_SCHEMA) {
    const inp = container.querySelector(`#inp_${p.key}`) as HTMLInputElement | HTMLSelectElement;
    const rng = container.querySelector(`#rng_${p.key}`) as HTMLInputElement;

    if (inp) {
      inp.addEventListener('change', () => {
        let val: any = inp.value;
        if (typeof p.default === 'number') {
          val = parseFloat(inp.value);
          if (rng) rng.value = String(val);
        }
        callbacks.onParamChange(p.key, val, p.rebuildsSolver);
      });
    }

    if (rng) {
      // Parameters that rebuild the solver reallocate every field and restart
      // the run. Firing that on every 'input' event made dragging the mill
      // diameter or the grid resolution slider lock the page up, so those
      // commit on release ('change') and only mirror the number live.
      if (p.rebuildsSolver) {
        rng.addEventListener('input', () => {
          if (inp) (inp as HTMLInputElement).value = rng.value;
        });
        rng.addEventListener('change', () => {
          callbacks.onParamChange(p.key, parseFloat(rng.value), true);
        });
      } else {
        rng.addEventListener('input', () => {
          const val = parseFloat(rng.value);
          if (inp) (inp as HTMLInputElement).value = String(val);
          callbacks.onParamChange(p.key, val, false);
        });
      }
    }
  }
}

// Cached value spans per readout grid, so the DOM is built once.
const readoutValueCache = new WeakMap<Element, HTMLElement[]>();

export function updateDerivedReadouts(container: HTMLElement, cfg: ConfigValues, diag: Record<string, number>): void {
  const grid = container.querySelector('#derivedGrid');
  if (!grid) return;

  const derived = computeDerived(cfg);

  // Non-dimensional incompressibility monitor: NUMERICS.md / KERNEL_REFERENCE.md
  // §11 quote the bound as max|div u| * dx / U_ref, not the raw divergence.
  const uRef = Math.max(derived.tipSpeed, 1e-6);
  const divNorm = ((diag.maxDiv || 0) * derived.dx) / uRef;

  const entries: [string, string][] = [
    ['Mill Radius (R)', `${derived.R.toFixed(3)} m`],
    ['Domain Size (L)', `${derived.L.toFixed(3)} m`],
    ['Cell Size (Δx)', `${derived.dx_mm.toFixed(2)} mm`],
    ['Critical Speed (Nc)', `${derived.Nc_rpm.toFixed(1)} rpm (${derived.Nc_rev_s.toFixed(2)} rev/s)`],
    ['Mill Speed', `${(Math.abs(derived.omega) * 30.0 / Math.PI).toFixed(1)} rpm`],
    ['Tip Speed (ωR)', `${derived.tipSpeed.toFixed(2)} m/s`],
    ['Permeability (K)', `${derived.K_perm.toExponential(2)} m²`],
    ['Pore Shear Rate', `${derived.gammaPore.toFixed(0)} s⁻¹`],
    ['Sim Time (t)', `${(diag.simTime || 0).toFixed(3)} s`],
    ['Shell Torque (T)', `${(diag.torque || 0).toFixed(1)} N·m/m`],
    ['Power Draw (P)', `${((diag.torque || 0) * Math.abs(derived.omega) / 1000.0).toFixed(2)} kW/m`],
    ['Max Velocity', `${(diag.maxVel || 0).toFixed(2)} m/s`],
    ['Kinetic Energy', `${(diag.kineticEnergy || 0).toFixed(0)} J/m`],
    ['Bed Mean γ̇', `${(diag.meanShearBed || 0).toFixed(1)} s⁻¹`],
    ['Free Zone Mean γ̇', `${(diag.meanShearFree || 0).toFixed(1)} s⁻¹`],
    ['Yielded Fraction', `${((diag.yieldedFraction || 0) * 100).toFixed(1)}%`],
    ['max|∇·u|Δx/U', divNorm.toExponential(2)],
    ['Frame Rate', `${(diag.fps || 0).toFixed(1)} fps`]
  ];

  // Build the cards once, then only write the value text. The previous version
  // regenerated this whole subtree from innerHTML on every animation frame.
  let vals = readoutValueCache.get(grid);
  if (!vals || vals.length !== entries.length) {
    grid.innerHTML = entries.map(([lbl]) => `
      <div class="readout-card">
        <span class="readout-label">${lbl}</span>
        <span class="readout-val"></span>
      </div>
    `).join('');
    vals = Array.from(grid.querySelectorAll('.readout-val')) as HTMLElement[];
    readoutValueCache.set(grid, vals);
  }
  for (let i = 0; i < entries.length; i++) {
    const next = entries[i][1];
    if (vals[i].textContent !== next) vals[i].textContent = next;
  }

  // Update warnings banner
  const banner = container.querySelector('#warningsBanner') as HTMLElement;
  if (banner) {
    const warnings = getValidityWarnings(cfg, derived);
    const key = warnings.join('|');
    if (banner.dataset.key !== key) {
      banner.dataset.key = key;
      if (warnings.length > 0) {
        banner.style.display = 'block';
        banner.innerHTML = warnings.map(w => `<div class="warning-item">⚠️ ${w}</div>`).join('');
      } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
    }
  }
}
