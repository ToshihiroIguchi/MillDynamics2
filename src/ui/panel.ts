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

export function renderControlPanel(container: HTMLElement, cfg: ConfigValues, callbacks: PanelCallbacks): void {
  const groups: ParamGroup[] = ['geometry', 'operating', 'charge', 'rheology', 'closure', 'numerics', 'rve'];

  let html = `
    <div class="panel-header">
      <div class="preset-row">
        <label for="presetSelect"><strong>Preset:</strong></label>
        <select id="presetSelect" class="select-preset">
          ${PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
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
    html += `
      <details class="param-group" ${g === 'geometry' || g === 'operating' || g === 'rheology' ? 'open' : ''}>
        <summary class="group-title">${GROUP_TITLES[g]}</summary>
        <div class="group-content">
    `;

    for (const p of paramsInGroup) {
      const curVal = cfg[p.key];
      html += `<div class="param-item">`;
      html += `<label for="inp_${p.key}" title="${p.notes || ''}">${p.label}${p.unit !== '-' ? ` [${p.unit}]` : ''}:</label>`;

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
      rng.addEventListener('input', () => {
        const val = parseFloat(rng.value);
        if (inp) (inp as HTMLInputElement).value = String(val);
        callbacks.onParamChange(p.key, val, p.rebuildsSolver);
      });
    }
  }
}

export function updateDerivedReadouts(container: HTMLElement, cfg: ConfigValues, diag: Record<string, number>): void {
  const grid = container.querySelector('#derivedGrid');
  if (!grid) return;

  const derived = computeDerived(cfg);

  const entries: [string, string][] = [
    ['Mill Radius (R)', `${derived.R.toFixed(3)} m`],
    ['Domain Size (L)', `${derived.L.toFixed(3)} m`],
    ['Cell Size (Δx)', `${derived.dx_mm.toFixed(2)} mm`],
    ['Critical Speed (Nc)', `${derived.Nc_rpm.toFixed(1)} rpm (${derived.Nc_rev_s.toFixed(2)} rev/s)`],
    ['Tip Speed (ωR)', `${derived.tipSpeed.toFixed(2)} m/s`],
    ['Permeability (K)', `${derived.K_perm.toExponential(2)} m²`],
    ['Pore Shear Rate', `${derived.gammaPore.toFixed(0)} s⁻¹`],
    ['Shell Torque (T)', `${(diag.torque || 0).toFixed(1)} N·m/m`],
    ['Power Draw (P)', `${((diag.torque || 0) * Math.abs(derived.omega) / 1000.0).toFixed(2)} kW/m`],
    ['Max Velocity', `${(diag.maxVel || 0).toFixed(2)} m/s`],
    ['Bed Mean γ̇', `${(diag.meanShearBed || 0).toFixed(1)} s⁻¹`],
    ['Free Zone Mean γ̇', `${(diag.meanShearFree || 0).toFixed(1)} s⁻¹`],
    ['Yielded Fraction', `${((diag.yieldedFraction || 0) * 100).toFixed(1)}%`],
    ['Max |∇·u|', `${(diag.maxDiv || 0).toExponential(2)} s⁻¹`]
  ];

  grid.innerHTML = entries.map(([lbl, val]) => `
    <div class="readout-card">
      <span class="readout-label">${lbl}</span>
      <span class="readout-val">${val}</span>
    </div>
  `).join('');

  // Update warnings banner
  const banner = container.querySelector('#warningsBanner') as HTMLElement;
  if (banner) {
    const warnings = getValidityWarnings(cfg, derived);
    if (warnings.length > 0) {
      banner.style.display = 'block';
      banner.innerHTML = warnings.map(w => `<div class="warning-item">⚠️ ${w}</div>`).join('');
    } else {
      banner.style.display = 'none';
    }
  }
}
