// src/ui/about.ts
// About modal displaying verbatim physics assumptions and governing equations

export function renderAboutModal(): string {
  return `
<div class="modal-overlay" id="aboutModal" style="display:none;">
  <div class="modal-card">
    <div class="modal-header">
      <h2>About MillDynamics2 — Physics & Numerical Foundations</h2>
      <button class="btn-close" id="btnCloseAbout">&times;</button>
    </div>
    <div class="modal-body">
      <h3>1. Primary Objective</h3>
      <p>
        MillDynamics2 simulates the non-Newtonian slurry hydrodynamics inside a rotating tumbling/ball mill.
        It resolves the coupling between the fluid, rotating lifter geometry, and the circulating porous media charge.
      </p>

      <h3>2. Scope & Physical Assumptions (PHYSICS.md §1)</h3>
      <table class="assumptions-table">
        <thead>
          <tr><th>ID</th><th>Assumption</th><th>Consequence / Validity</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>A1</strong></td>
            <td>2D cross-section of a long cylinder</td>
            <td>Axial end-wall effects neglected. Unit depth (1 m).</td>
          </tr>
          <tr>
            <td><strong>A2</strong></td>
            <td>Incompressible single-phase slurry</td>
            <td>Uniform density &rho;, constant-coefficient Poisson equation. Charge modeled as a porous continuum zone.</td>
          </tr>
          <tr>
            <td><strong>A3</strong></td>
            <td>Herschel–Bulkley rheology</td>
            <td>Yield stress &tau;<sub>y</sub>, consistency K, flow index n with Papanastasiou exponential regularization.</td>
          </tr>
          <tr>
            <td><strong>A4</strong></td>
            <td>Prescribed steady charge geometry</td>
            <td>Bed occupies fraction J with inclined chord at dynamic repose angle &theta;<sub>r</sub>. Media velocity u<sub>media</sub> = k<sub>slip</sub> &omega; &times; (x - x<sub>c</sub>).</td>
          </tr>
          <tr>
            <td><strong>A5</strong></td>
            <td>Darcy–Forchheimer / Ergun porous drag</td>
            <td>Porous resistance evaluated with sub-grid pore shear rate &gamma;&#775;<sub>pore</sub> = C<sub>&gamma;</sub> |u<sub>rel</sub>| / (&epsilon; &radic;K<sub>perm</sub>).</td>
          </tr>
          <tr>
            <td><strong>A6</strong></td>
            <td>Laminar flow regime (Re &lt; 2000)</td>
            <td>No sub-grid turbulence model. Warning raised if Re exceeds 2000.</td>
          </tr>
          <tr>
            <td><strong>A7</strong></td>
            <td>Brinkman volume penalization</td>
            <td>Exact moving wall boundary conditions imposed via smoothed signed distance functions (SDF).</td>
          </tr>
        </tbody>
      </table>

      <h3>3. Numerical Core</h3>
      <ul>
        <li><strong>AssemblyScript / WebAssembly Core:</strong> Zero-allocation simulation hot loop running in native WebAssembly.</li>
        <li><strong>Geometric Multigrid (MG):</strong> V-cycle Poisson solver with red-black Gauss-Seidel smoothing.</li>
        <li><strong>Unconditionally Stable:</strong> Implicit backward Euler variable-viscosity diffusion and implicit Brinkman penalization.</li>
        <li><strong>MacCormack Advection:</strong> 2nd-order semi-Lagrangian trace with stencil clamping.</li>
      </ul>
    </div>
  </div>
</div>
  `;
}
