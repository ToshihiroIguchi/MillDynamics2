# MillDynamics2 — Project Guidelines

## What this project is

A **static, browser-based 2D single-phase CFD simulator** for the slurry inside a
tumbling ball mill. The slurry is a **shear-rate-dependent non-Newtonian fluid**
(Herschel–Bulkley with Papanastasiou regularization). The numerical core is
compiled to **WebAssembly**; the whole application deploys as static files
(GitHub Pages) with no backend.

Sister project: `../MillDynamics` (v1) — a **DEM** (Discrete Element Method)
simulator of the same mill. v2 is *not* a rewrite of v1: it solves the
complementary problem (continuum slurry flow rather than discrete media motion).

## Language Policy

- **Conversations / interactions with the user**: Japanese (`日本語`)
- **Everything else** (code, comments, identifiers, documentation, commit
  messages, UI strings, configuration, CSV headers, log output): English

## Division of Labour

| Role | Owner |
| --- | --- |
| Requirements analysis, physics/numerics specification, architecture, phase plan, experiment design, acceptance criteria | **Claude** |
| Implementation, refactoring, build configuration, test authoring, running experiments, filling in `docs/VALIDATION.md`, deployment | **Gemini** |

Claude writes and maintains the documents under `docs/`. Gemini writes the code.
If Gemini finds that a specification in `docs/` is wrong or infeasible, it must
record the deviation in `docs/VALIDATION.md` under "Deviations from spec" rather
than silently changing behaviour.

## Repository Information

- **Repository URL**: https://github.com/ToshihiroIguchi/MillDynamics2
- **Deployment target**: GitHub Pages of the above repository, serving `dist/`
  built with `base: './'`

## Key Design Decisions (locked)

These were decided with the user and must not be changed without asking:

1. **WASM toolchain: AssemblyScript.** Chosen because it needs only `npm
   install` — no rustup, no emsdk — so the whole build/verify loop runs
   unattended on this machine. Numeric kernels over `Float64Array` in linear
   memory compile to essentially native-speed WASM.
2. **Two-scale architecture.** The 500× scale gap between the 1 m mill and the
   2 mm media is bridged by two solvers sharing one kernel library:
   - **Macro**: full mill cross-section, Δx ≈ 2–4 mm, media bed modelled as a
     Darcy–Forchheimer (Ergun-type) porous zone parameterised by `d_p = 2 mm`.
   - **Micro (RVE)**: a ~50 mm patch at Δx = 0.1 mm where individual 2 mm beads
     are geometrically resolved by Brinkman penalization, used to *calibrate*
     the macro porous closure.
3. **Rheology: Herschel–Bulkley, generalised form.**
   `μ_app = K·γ̇^(n−1) + τ_y·(1 − exp(−m·γ̇))/γ̇`, which degenerates to
   Newtonian, power-law and Bingham by parameter choice.
4. **Single phase means no free surface.** The mill is modelled as a *flooded*
   wet mill (as in a wet overflow / stirred media mill). Introducing a headspace
   would require VOF, i.e. two phases, which the brief excludes.

## Documents

| File | Contents |
| --- | --- |
| `docs/PHYSICS.md` | Governing equations, closures, modelling assumptions and their justification |
| `docs/NUMERICS.md` | Discretisation, time integration, solver algorithms, stability limits |
| `docs/PARAMETERS.md` | **Every runtime-adjustable parameter** with unit, default, range and validity warnings — the single source of truth |
| `docs/KERNEL_REFERENCE.md` | Working code for the error-prone kernels: staggered indexing, cross-sampling, the Jacobi diagonal, the V-cycle, SDFs, the torque sign, sanity magnitudes |
| `docs/TESTING.md` | Solver configuration for each verification case, integrity rules, the Python venv policy, and a bug/symptom table |
| `docs/IMPLEMENTATION_PLAN.md` | Phase-by-phase build plan for Gemini, with file-level specs, exact commands and definitions of done |
| `docs/EXPERIMENT_PLAN.md` | Verification cases (V1–V10) and parametric studies (E1–E7) |
| `docs/VALIDATION.md` | Results, written by Gemini as phases complete |

## Conventions

- SI units throughout the core (m, s, kg, Pa, Pa·s). Convert to rpm / % of
  critical speed only at the UI boundary.
- **Everything is a parameter.** Mill diameter, lifter dimensions, media
  diameter, domain size, resolution and every rheological and numerical setting
  are runtime-adjustable. The values in `PHYSICS.md` and `NUMERICS.md` are
  defaults for the reference case; `PARAMETERS.md` governs. No numeric literal
  from that document may be hard-coded outside the config schema.
- No allocation inside the time-stepping loop. All fields are allocated once at
  solver construction.
- Every physical model gets a unit-tested analytical counterpart where one
  exists; see `docs/EXPERIMENT_PLAN.md`.
- Never report a simulation as validated without a number and a tolerance, and
  never write down a benchmark reference value that was not obtained from its
  source.
- Python runs only inside the project venv, invoked by explicit path
  (`.venv/Scripts/python`). Never install into the system interpreter.
