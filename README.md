# MillDynamics2 🌊⚙️

**Browser-based 2D single-phase CFD of non-Newtonian slurry flow in a tumbling
ball mill.** Incompressible Navier–Stokes with a Herschel–Bulkley shear-rate
dependent viscosity, solved in WebAssembly, deployed as a fully static site.

🔗 https://github.com/ToshihiroIguchi/MillDynamics2

> **Status: specification complete, implementation pending.** The documents in
> `docs/` are the authoritative specification. This README is filled in during
> Phase 8 of `docs/IMPLEMENTATION_PLAN.md`.

---

## Relationship to MillDynamics (v1)

| | [MillDynamics](https://github.com/ToshihiroIguchi/MillDynamics) | MillDynamics2 |
| --- | --- | --- |
| Method | DEM — discrete grinding media | CFD — continuum slurry |
| Resolves | individual ball trajectories, collisions, power from impacts | velocity, pressure, apparent viscosity and yield-state fields |
| Slurry | drag/buoyancy field acting on particles | the solved phase |
| Media | the solved phase | porous drag closure (macro) + resolved beads (micro RVE) |

They solve complementary halves of the same machine. v2 is not a replacement.

## What it models

- Mill cross-section, rotating shell with lifters. `D = 1.0 m` is the reference
  case; diameter, lifter count and lifter dimensions are all adjustable, so lab
  mills (0.3 m) and industrial mills (5 m) work too.
- Slurry as a Herschel–Bulkley fluid with Papanastasiou regularization —
  Newtonian, power-law and Bingham are parameter special cases.
- Grinding media (`d_p = 2 mm` by default, adjustable 0.1–50 mm) at two scales: a
  Darcy–Forchheimer porous zone at mill scale, and geometrically resolved beads
  in an RVE used to calibrate that closure.

Every quantity above is a runtime parameter — see
[`docs/PARAMETERS.md`](docs/PARAMETERS.md). Parameter sets travel in the URL, so
a configuration can be bookmarked or shared as a link.

## What it does not model

Read `docs/PHYSICS.md` §1 before drawing conclusions from any output.
In short: **no free surface** (single phase ⇒ flooded mill), **2D only**, and
**charge motion is prescribed, not computed** — that is v1's job.

## Documentation

| File | Contents |
| --- | --- |
| [`docs/CHECKLIST.md`](docs/CHECKLIST.md) | Ordered worklist — the entry point for implementation |
| [`docs/PHYSICS.md`](docs/PHYSICS.md) | Equations, closures, assumptions |
| [`docs/NUMERICS.md`](docs/NUMERICS.md) | Discretisation and solver algorithms |
| [`docs/PARAMETERS.md`](docs/PARAMETERS.md) | Every adjustable parameter, with defaults and ranges |
| [`docs/KERNEL_REFERENCE.md`](docs/KERNEL_REFERENCE.md) | Reference code for the error-prone kernels |
| [`docs/TESTING.md`](docs/TESTING.md) | How to run each verification case |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Phased build plan |
| [`docs/EXPERIMENT_PLAN.md`](docs/EXPERIMENT_PLAN.md) | Verification cases and studies |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Measured results |

## Getting started

```bash
npm install
npm run dev       # build WASM + Vite dev server on :3000
npm run test      # analytical verification suite
npm run build     # static bundle into dist/
npm run preview   # serve the built bundle on :4173
```

Python is used only for the offline closure fitting (experiment E6) and
analysis, and always inside a project-local virtual environment:

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # .venv/bin/pip on POSIX
.venv/Scripts/python scripts/fit_closure.py
```

> The simulator fetches a `.wasm` module, so `dist/index.html` must be served
> over HTTP. Opening it directly via `file://` fails on CORS. `npm run preview`,
> `python -m http.server`, or GitHub Pages all work.

## Licence

MIT.
