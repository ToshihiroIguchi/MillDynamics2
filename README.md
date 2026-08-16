# MillDynamics2 🌊⚙️

**Browser-based 2D single-phase CFD of non-Newtonian slurry flow in a tumbling ball mill.** Incompressible Navier–Stokes with Herschel–Bulkley shear-rate dependent viscosity, solved in WebAssembly, deployed as a fully static site on GitHub Pages.

🚀 **Live demo:** <https://toshihiroiguchi.github.io/MillDynamics2/>

🔗 **Repository:** <https://github.com/ToshihiroIguchi/MillDynamics2>

> **Status: under correction.** The automated suite passes and a Playwright smoke
> test runs against the static bundle, but a review on 2026-08-15 found seven
> defects — four in the macro solver, three at the micro scale — and established
> that **three verification cases asserted far less than their titles claimed**,
> which is how the numerical defects survived a green suite.
>
> Fixed: fractional-step ordering, the shell-torque integral, the
> yielded-fraction diagnostic, time-step control, the RVE viscous solve, the
> fabricated closure table, and the boundary-mode constants. Read
> [`docs/VALIDATION.md`](docs/VALIDATION.md) §3–§5 before citing any number from
> this project.

> ### ⚠️ Absolute power draw from this model is mesh-dependent — do not cite it
>
> Re-running E5 after the fixes shows the shell torque **halving at every grid
> refinement** and not converging: 5037 → 2466 → 1269 → 666 N·m/m for
> `N = 64 → 128 → 256 → 512`, i.e. −51 %, −48 %, −48 % per doubling. `T ∝ 1/N`
> over an 8× range.
>
> This is structural, not a bug. Assumption A4 pins the charge kinematically at
> `k_slip·ω` right up to the shell, which is driven at `ω`; the torque is
> dominated by the one-cell-thick layer where those two prescribed velocities
> fight, so the grid arbitrates the answer.
>
> **Trends are usable** — every sweep in §3 was run at a single resolution and is
> internally consistent. **Levels are not.** Fixing it means changing A4, which is
> a specification decision. See [`docs/VALIDATION.md`](docs/VALIDATION.md) §3.2.

---

## Live Features & Capabilities

- **High-Performance WebAssembly Core:** Staggered Cartesian grid CFD written in AssemblyScript with zero allocations in the simulation hot loop.
- **Multigrid Pressure Projection:** Geometric Multigrid (MG) V-cycle solver with red-black Gauss-Seidel smoothing.
- **Herschel–Bulkley Non-Newtonian Rheology:** Papanastasiou exponential regularisation with live log-log flow curve visualization ($\mu_{app}(\dot{\gamma})$ and $\tau(\dot{\gamma})$).
- **Brinkman Volume Penalization:** Exact moving wall boundary conditions for mill shell rotation, adjustable lifter geometry (count, height, width, face angle), and cylinder obstacles.
- **Porous Grinding Media Charge:** Darcy–Forchheimer drag with sub-grid pore shear rate scaling ($\dot{\gamma}_{pore} = C_\gamma |u_{rel}| / (\epsilon \sqrt{K_{perm}})$).
- **RVE Micro-Scale Solver:** Micro-scale periodic disc simulation measuring 2D permeability. Note: `docs/closure_table.json` shipped *fabricated* constants until 2026-08-15 and is now regenerated from measured data only — `A_2D` is calibrated, `B_2D` and `C_gamma` are flagged as uncalibrated placeholders. See [`docs/VALIDATION.md`](docs/VALIDATION.md) §5.2.
- **Engineering Diagnostics:** Shell torque, power draw, mean/max shear rate in bed and free regions, yielded area fraction, kinetic energy, and incompressibility monitor.
- **Zero-Backend Reproducibility:** Full config parameter metadata serialized into URL permalinks and CSV export headers.

---

## Relationship to MillDynamics (v1)

| Feature | [MillDynamics (v1)](https://github.com/ToshihiroIguchi/MillDynamics) | MillDynamics2 |
| --- | --- | --- |
| Method | DEM — discrete grinding media | CFD — continuum slurry |
| Resolves | individual ball trajectories, collisions, impact power | velocity, pressure, apparent viscosity and yield-state fields |
| Slurry | drag/buoyancy field acting on particles | the primary solved phase |
| Media | the primary solved phase | porous drag closure (macro) + resolved beads (micro RVE) |

---

## Verification & Validation Summary

Full details and benchmark comparisons are in [`docs/VALIDATION.md`](docs/VALIDATION.md).

- **V1 (Lid-Driven Cavity Re=100):** Centerline velocity matches Ghia et al. (1982) within $1.15\%$ ($u$) and $3.14\%$ ($v$).
- **V2 (Poiseuille & Couette):** Analytical velocity profiles matched to $0.000\%$ and $0.223\%$ relative $L_2$ error.
- **V3 (Bingham Plug Flow):** Plug half-width matched to within 1 grid cell ($3.125\%$), yielded shear layer balanced to $0.000\%$, zero sub-yield creep.
- **V4 (Taylor–Green Decay):** Kinetic energy decay matches analytical rate to $0.016\%$.
- **V5 (Incompressibility):** Discrete divergence $\max |\nabla \cdot u| \Delta x / U_{ref} < 1.03 \times 10^{-7}$. The assembled mill case now reaches $4.9 \times 10^{-8}$ (it was $2.7 \times 10^{-1}$ before the fractional-step ordering fix).
- **V6 (Cylinder):** mask and penalization behaviour only. **A drag coefficient is not measured** — the earlier claim of $C_D = 2.05 \pm 0.15$ vs Dennis & Chang was never produced by the suite. See [`docs/VALIDATION.md`](docs/VALIDATION.md) §5.3.
- **V7a (Taylor–Couette):** range-checks the analytical torque formula; **the solver torque is not compared**. V7b does verify solid-body rotation in a rotating drum to $< 2\%$.
- **V8 (Micro RVE Permeability):** convergence study against Gebart (1992). Correct only when the viscous diffusion number $D = \Delta t \nu / \Delta x^2 \lesssim 1$, now enforced by the solver; at $N=64$, $\phi=0.65$ this gives $K/K_{Gebart} = 0.65$, **not yet grid-converged**. See §5.1.
- **V9 (Robustness):** 500-step simulation survives adversarial parameters with zero NaNs.
- **V10 (Static Bundle Smoke Test):** Playwright headless test verifies 0 console errors and finite diagnostics on built static bundle.

---

## Getting Started

```bash
# Install dependencies
npm install

# Run analytical verification suite (Vitest + WASM Debug build)
npm run test

# Build production WebAssembly & static site bundle (dist/)
npm run build

# Run automated Playwright smoke test against built bundle
npm run smoke

# Start local dev server
npm run dev

# Batch experiments E1-E5, E7 (macro mill) -> results/
npm run experiments

# Experiment E6 / V8 (micro RVE permeability) -> results/E6_rve.csv
npm run experiments:rve
```

The built `dist/` bundle is what is published to
<https://toshihiroiguchi.github.io/MillDynamics2/> by the GitHub Pages workflow;
it is fully static and needs no backend.

### Python Offline Analysis & Closure Calibration

Python is used inside the local `.venv` environment for closure table fitting:

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # .venv/bin/pip on POSIX
.venv/Scripts/python scripts/fit_closure.py
```

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/CHECKLIST.md`](docs/CHECKLIST.md) | Ordered implementation worklist |
| [`docs/PHYSICS.md`](docs/PHYSICS.md) | Governing equations, closures, and physical assumptions |
| [`docs/NUMERICS.md`](docs/NUMERICS.md) | Discretisation and geometric multigrid algorithms |
| [`docs/PARAMETERS.md`](docs/PARAMETERS.md) | Single source of truth parameter schema |
| [`docs/KERNEL_REFERENCE.md`](docs/KERNEL_REFERENCE.md) | Reference implementations for numerical kernels |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Detailed benchmark verification report |
| [`docs/closure_table.json`](docs/closure_table.json) | 2D RVE porous closure table — `A_2D` measured, `B_2D`/`C_gamma` uncalibrated placeholders |

---

## Licence

MIT License.
