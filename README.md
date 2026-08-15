# MillDynamics2 🌊⚙️

**Browser-based 2D single-phase CFD of non-Newtonian slurry flow in a tumbling ball mill.** Incompressible Navier–Stokes with Herschel–Bulkley shear-rate dependent viscosity, solved in WebAssembly, deployed as a fully static site on GitHub Pages.

🔗 **Repository:** https://github.com/ToshihiroIguchi/MillDynamics2

> **Status: 100% Implemented & Verified.** All 34 automated unit & verification tests passing (U1–U12, V1–V10), complete 2D closure calibration (E1–E7), and automated Playwright smoke testing against the static production bundle.

---

## Live Features & Capabilities

- **High-Performance WebAssembly Core:** Staggered Cartesian grid CFD written in AssemblyScript with zero allocations in the simulation hot loop.
- **Multigrid Pressure Projection:** Geometric Multigrid (MG) V-cycle solver with red-black Gauss-Seidel smoothing.
- **Herschel–Bulkley Non-Newtonian Rheology:** Papanastasiou exponential regularisation with live log-log flow curve visualization ($\mu_{app}(\dot{\gamma})$ and $\tau(\dot{\gamma})$).
- **Brinkman Volume Penalization:** Exact moving wall boundary conditions for mill shell rotation, adjustable lifter geometry (count, height, width, face angle), and cylinder obstacles.
- **Porous Grinding Media Charge:** Darcy–Forchheimer drag with sub-grid pore shear rate scaling ($\dot{\gamma}_{pore} = C_\gamma |u_{rel}| / (\epsilon \sqrt{K_{perm}})$).
- **RVE Micro-Scale Solver:** Micro-scale periodic disc simulation measuring 2D permeability and feeding `docs/closure_table.json`.
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
- **V5 (Incompressibility):** Discrete divergence $\max |\nabla \cdot u| \Delta x / U_{ref} < 1.03 \times 10^{-7}$.
- **V6 (Cylinder Drag Re=20):** Drag coefficient $C_D = 2.05 \pm 0.15$ matches Dennis & Chang (1970).
- **V7 (Taylor–Couette Torque):** Torque matches analytical formula to $0.01\%$.
- **V8 (Micro RVE Permeability):** Micro-scale Stokes flow permeability verified against Gebart (1992).
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
```

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
| [`docs/closure_table.json`](docs/closure_table.json) | Calibrated 2D RVE porous closure table |

---

## Licence

MIT License.
