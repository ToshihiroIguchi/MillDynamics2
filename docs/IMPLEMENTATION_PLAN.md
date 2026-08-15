# IMPLEMENTATION PLAN — for Gemini

Nine phases. Each phase lists what to build, the exact commands to run, and a
**Definition of Done (DoD)** that must fully pass before moving on. Commit at the
end of each phase with the prefix `phase-N:`.

Read `PHYSICS.md`, `NUMERICS.md` and `PARAMETERS.md` first — they are the
specification; this document is the schedule.

**Standing constraint across all phases**: every quantity listed in
`PARAMETERS.md` is a runtime parameter. Mill diameter, lifter geometry, media
diameter, domain size and resolution are inputs, not constants. No numeric
literal from that document may appear anywhere except as a `default` in the
config schema.

---

## Target repository layout

```
MillDynamics2/
├── CLAUDE.md  GEMINI.md  README.md  LICENSE
├── package.json  tsconfig.json  vite.config.ts  asconfig.json  .gitignore
├── index.html
├── .github/workflows/pages.yml
├── assembly/                      # AssemblyScript → WASM (the solver)
│   ├── tsconfig.json
│   ├── types.ts                   # type Real = f64; shared constants
│   ├── grid.ts                    # MAC indexing, bilinear sampling, periodic flag
│   ├── rheology.ts                # Herschel–Bulkley + Papanastasiou
│   ├── strain.ts                  # γ̇ at centres/nodes, μ_c/μ_n
│   ├── advect.ts                  # MacCormack semi-Lagrangian + clamping
│   ├── diffuse.ts                 # implicit variable-viscosity damped Jacobi
│   ├── porous.ts                  # Ergun / Darcy–Forchheimer, implicit
│   ├── penalize.ts                # Brinkman mask + implicit penalization
│   ├── multigrid.ts               # V-cycle Poisson solver
│   ├── geometry.ts                # shell, lifters, bed region, SDFs
│   ├── diagnostics.ts             # torque, power, histograms, divergence
│   ├── solver.ts                  # Solver class: fields, step(), config
│   ├── rve.ts                     # micro-scale bead packing + periodic setup
│   └── index.ts                   # exported flat numeric API
├── src/                           # TypeScript UI (no physics here, ever)
│   ├── main.ts
│   ├── wasm.ts                    # instantiate + typed-array views
│   ├── config.ts                  # parameter schema — drives panel, CSV, permalink, CLI
│   ├── presets.ts
│   ├── ui/panel.ts                # parameter controls
│   ├── ui/about.ts                # assumption disclosure (PHYSICS.md §1)
│   ├── render/field.ts            # canvas field renderer
│   ├── render/colormap.ts
│   ├── render/overlay.ts          # mill outline, lifters, bed boundary, vectors
│   ├── render/charts.ts           # time series + shear-rate histogram
│   └── export/csv.ts
├── tests/                         # Vitest, runs WASM under Node
│   ├── helpers/loadWasm.ts
│   ├── data/ghia1982.json
│   ├── v1_cavity.test.ts     v2_powerlaw_poiseuille.test.ts
│   ├── v3_bingham_plug.test.ts    v4_taylor_green.test.ts
│   ├── v5_divergence.test.ts      v6_cylinder_drag.test.ts
│   ├── v7_couette_torque.test.ts  v8_gebart_permeability.test.ts
│   └── v9_robustness.test.ts
├── scripts/
│   ├── headless_run.mjs           # batch runner: preset → CSV, no browser
│   ├── run_experiments.mjs        # drives E1–E5, E7
│   ├── smoke.mjs                  # Playwright smoke test on built dist/
│   └── fit_closure.py             # E6: fit A_2D, B_2D, C_γ → closure_table.json
├── results/                       # experiment CSVs (git-ignored above 1 MB)
└── docs/
    ├── PHYSICS.md  NUMERICS.md  PARAMETERS.md
    ├── IMPLEMENTATION_PLAN.md  EXPERIMENT_PLAN.md
    ├── VALIDATION.md              # you write this
    ├── closure_table.json         # produced by E6
    └── screenshots/
```

---

## Phase 0 — Scaffold and toolchain

**Build**

```bash
cd C:/Users/toshi/python/MillDynamics2
git init
npm init -y
npm i -D typescript vite vitest assemblyscript @playwright/test
npx asinit .            # accept; it creates assembly/, build/, asconfig.json
```

Then replace the generated config with:

`asconfig.json`
```json
{
  "targets": {
    "debug":   { "outFile": "assembly/build/mill.debug.wasm", "textFile": "assembly/build/mill.debug.wat", "sourceMap": true, "debug": true },
    "release": { "outFile": "assembly/build/mill.wasm", "optimizeLevel": 3, "shrinkLevel": 0, "converge": true, "noAssert": true }
  },
  "options": { "runtime": "minimal", "exportRuntime": true, "bindings": "raw" }
}
```

`package.json` scripts
```json
{
  "scripts": {
    "asbuild:debug": "asc assembly/index.ts --target debug",
    "asbuild": "asc assembly/index.ts --target release",
    "dev": "npm run asbuild && vite",
    "build": "npm run asbuild && tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "test": "npm run asbuild:debug && vitest run",
    "smoke": "node scripts/smoke.mjs",
    "experiments": "node scripts/run_experiments.mjs"
  }
}
```

`vite.config.ts`: `base: './'`, `server.port: 3000`, `build.outDir: 'dist'`,
`build.sourcemap: true`, and `assetsInlineLimit: 0` so the `.wasm` is emitted as a
real file rather than inlined unpredictably.

**WASM loading** (`src/wasm.ts`): import the artefact as a URL and instantiate it
with the plain WebAssembly API — the API is numbers-only, so
`@assemblyscript/loader` is not needed.

```ts
import wasmUrl from '../assembly/build/mill.wasm?url';
const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {
  env: { abort: () => { throw new Error('wasm abort'); } }
});
```

Note for the README: because the module is fetched, `dist/index.html` **must be
served over HTTP** — opening it via `file://` fails on CORS. `npm run preview`,
`python -m http.server`, or GitHub Pages all work.

**DoD**
- [ ] `npm run asbuild` and `npm run build` both succeed.
- [ ] A trivial exported `add(a: f64, b: f64): f64` is callable from both a Vitest
      test (Node, `fs.readFileSync` + `WebAssembly.instantiate`) and the browser.
- [ ] `npm run preview` serves a page that logs the WASM result to the console.
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `assembly/build/`, `.venv/`.

---

## Phase 1 — MAC grid + Newtonian projection solver

Build `types.ts`, `grid.ts`, `advect.ts`, `multigrid.ts`, and a first `solver.ts`
with **constant viscosity** and no geometry. Periodicity must already be a flag
in `grid.ts` (Taylor–Green needs it in this phase).

Key points from `NUMERICS.md`: staggered layout §1, projection ordering §2,
MacCormack with clamping §3, V-cycle §8 including the **mean-zero
right-hand side** for the pure-Neumann case.

**Exports added**

```
createSolver(n: i32, L: f64, periodic: bool): void
setFluid(rho: f64, mu: f64): void
step(dt: f64): void
ptrU(): usize   ptrV(): usize   ptrP(): usize
diagMaxDiv(): f64   diagKineticEnergy(): f64   diagMaxVel(): f64
```

**Verification** (see `EXPERIMENT_PLAN.md` for tolerances): V1 lid-driven cavity
vs. Ghia et al., V4 Taylor–Green decay, V5 divergence.

**DoD**
- [ ] V1 passes at Re = 100 and Re = 400 on 128².
- [ ] V4 shows ≥ 1.8th order spatial convergence and matches the analytical decay
      rate within 2 % over 1 s.
- [ ] V5: `max|∇·u|·Δx/U_ref < 1e-4` at every step of a 1000-step run.
- [ ] Multigrid converges in ≤ 6 V-cycles; log the residual history once and
      paste it into `VALIDATION.md`.

---

## Phase 2 — Non-Newtonian rheology + implicit variable-viscosity diffusion

Build `rheology.ts`, `strain.ts`, `diffuse.ts`. Wire `μ_c`/`μ_n` into the
diffusion operator and replace the Phase 1 constant-viscosity term.

Watch for: the small-`γ̇` series expansion in `rheology.ts`; clamping **before**
node averaging; and the fact that the cross-derivative terms go to the explicit
right-hand side (`NUMERICS.md` §5) — the Jacobi diagonal must not include them.

**Exports added**

```
setRheology(K: f64, n: f64, tauY: f64, m: f64, muMin: f64, muMax: f64): void
setViscousIterations(k: i32): void
ptrMu(): usize   ptrGammaDot(): usize
diagYieldedFraction(): f64
```

**Verification**: V2 power-law Poiseuille (analytical), V3 Bingham/HB plug flow.

**DoD**
- [ ] V2: L2 velocity error < 1 % for `n ∈ {0.5, 1.0, 1.5}` on 128², and spatial
      order ≥ 1.8 across 64/128/256.
- [ ] V3: plug half-width matches `τ_y/G` within 2 %; `γ̇` inside the plug is
      below `1/m`.
- [ ] `μ_app(γ̇→0) = τ_y·m` reproduced to 1e-9 in a direct unit test of
      `rheology.ts`.
- [ ] Increasing `setViscousIterations` from 8 to 64 changes V2's error by
      < 0.1 % — i.e. 24 is genuinely converged. Record the numbers.

---

## Phase 3 — Brinkman penalization and mill geometry

Build `penalize.ts` and `geometry.ts`. Signed distance functions for: mill
interior (`sdf = r − R`), lifter bars (rotated boxes), and the RVE discs.
Smoothed `χ` per `NUMERICS.md` §7. Rebuild only the lifter mask per step.

Implement the shell torque diagnostic here (`diagnostics.ts`) — it is how V7 is
checked, and it is the headline engineering output.

**Exports added**

```
setGeometry(cx: f64, cy: f64, R: f64, nLifters: i32,
            lifterH: f64, lifterW: f64, lifterAngleRad: f64): void
setRotation(omega: f64): void
setGravity(gx: f64, gy: f64): void
setPenalization(eta: f64): void
ptrChi(): usize
diagTorque(): f64   diagPower(): f64
```

**Verification**: V6 flow past a cylinder (Re = 20, 40) vs. Dennis & Chang;
V7 Taylor–Couette torque vs. the analytical `T = 4πμω R_i²R_o²/(R_o²−R_i²)`;
V7c the power-law concentric-cylinder viscometry relation.

**DoD**
- [ ] V6: `C_D` within 10 % and recirculation length within 15 % at both Re.
- [ ] V7: Newtonian Couette torque within 5 % of analytical on 256².
- [ ] V7b: fluid in a rotating closed cylinder reaches solid-body rotation with
      relative velocity error < 2 % after 20 revolutions.
- [ ] Penalization error scales as `sqrt(η)`: halving `η` from 1e-3 → 1e-4 → 1e-5
      reduces the V7 torque error monotonically. Tabulate it.
- [ ] Lifter mask rebuild costs < 5 % of step time (profile it).

---

## Phase 4 — Media bed, porous drag, mill diagnostics

Build `porous.ts` and the bed geometry in `geometry.ts`: chord at the dynamic
angle of repose, offset solved by bisection so the enclosed area is `J·πR²`,
smoothed over `2Δx`. Prescribed bed velocity with slip factor. Pore shear rate
and `μ_eff` per `PHYSICS.md` §5.4.

Complete `diagnostics.ts`: shear-rate histogram (32 log bins), bed/free-region
statistics, bed pressure drop, Reynolds number, steady-state detector.

**Exports added**

```
setBed(fillJ: f64, reposeDeg: f64, eps: f64, dp: f64, slip: f64): void
setClosure(A: f64, B: f64, Cgamma: f64): void
ptrBed(): usize   ptrUmediaX(): usize   ptrUmediaY(): usize
diagMeanShearBed(): f64   diagMeanShearFree(): f64
diagBedPressureDrop(): f64   diagReynolds(): f64   diagSteady(): i32
ptrShearHistogram(): usize        // 32 f64 bins
```

**DoD**
- [ ] Bed area matches `J·πR²` within 1 % for `J ∈ {0.15 … 0.45}` at all three
      resolutions (this is a pure geometry unit test).
- [ ] With `τ_y = 0, n = 1` and the bed filling the whole domain in a periodic
      box, the steady velocity reproduces the analytical Darcy–Forchheimer
      balance within 2 % — a direct unit test of `porous.ts` independent of the
      rest of the solver.
- [ ] Torque increases monotonically with `ω` over 40–110 % `N_c` for the
      baseline preset (a physical sanity check, not a precision claim).
- [ ] A 60 s run of every preset in `presets.ts` produces no `NaN` and
      `max|∇·u|` stays under tolerance.

---

## Phase 5 — Micro-scale RVE solver

Build `rve.ts`: periodic domain, Poisson-disc rejection sampling of
non-overlapping discs at a target solid fraction with a fixed seed (reproducible
— use a small xorshift PRNG in AssemblyScript, do not rely on `Math.random`), plus
a regular hexagonal packing mode for the Gebart comparison. Uniform body-force
driving. Reuse every kernel from Phases 1–3 unchanged; the RVE is a
*configuration*, not a second solver.

**Exports added**

```
createRVE(n: i32, L: f64, dp: f64, solidFraction: f64, hexagonal: bool, seed: i32): i32
rveSetBodyForce(fx: f64): void
rveMeanVelocity(): f64          // superficial, volume-averaged
rveActualSolidFraction(): f64
rveBeadCount(): i32
```

**Verification**: V8 permeability of a hexagonal disc array vs. Gebart (1992).

**DoD**
- [ ] V8: measured `K/R_b²` within 20 % of Gebart across `φ ∈ {0.3, 0.4, 0.5, 0.6}`
      at Δx = 0.1 mm, and the error shrinks under grid refinement.
- [ ] Random packing at `1−ε = 0.60` succeeds within 10⁵ rejection attempts and
      reports an actual solid fraction within 0.005 of the target.
- [ ] Same seed ⇒ bit-identical bead positions across runs.

---

## Phase 6 — UI, rendering, presets, export

Nothing in `src/` may contain physics. The UI reads WASM memory and draws.

**Renderer** (`render/field.ts`): a single `<canvas>`, `ImageData` written from a
`Uint8ClampedArray`, upscaled by `ctx.imageSmoothingEnabled = false` when
`N < canvas` — writing per-pixel and letting the canvas scale is far faster than
`fillRect` per cell. High-DPI aware.

Field selector: **velocity magnitude, apparent viscosity μ_app, shear rate γ̇
(log scale), pressure, yield state (yielded / dead zone), vorticity**. The
`μ_app` and yield-state views are the ones that justify a non-Newtonian solver
existing — make them first-class, not an afterthought.

Overlays: mill circle, lifters at the current angle, bed boundary, velocity
vectors (decimated), streamlines (optional).

**Colormaps** (`render/colormap.ts`): viridis, and a diverging map for vorticity.
If you build any chart, load the `dataviz` skill first for palette and axis
conventions.

**Controls** (`ui/panel.ts`): **every parameter in `docs/PARAMETERS.md` §§1–7
must be exposed and live-editable** — including the dimensional ones (mill
diameter `D`, lifter count/height/width/face angle, domain margin, media
diameter `d_p`), not only the rheological ones. Group them as: Geometry /
Operating / Charge & Media / Rheology / Closure / Numerics / RVE.

Implementation requirement: define the parameter set **once** as a schema
(`src/config.ts`: name, group, unit, default, min, max, step, whether a change
requires a solver rebuild) and generate the UI panel, the CSV metadata block,
the permalink codec and the headless CLI argument parser from it. Three
consumers, one definition — hand-maintaining four parallel lists is how
parameters silently stop being adjustable.

Also required: derived read-only readouts (`N_c` in rev/s and rpm, `ω`, tip
speed, `Δx` in mm, `d_p/Δx`, `K_perm`, `γ̇_pore`, `Re`, bed area check), the
validity warnings of `PARAMETERS.md` §8, a live log-log plot of the flow curve
`μ_app(γ̇)` and `τ(γ̇)`, and the persistence features of §9 (URL-hash permalink,
JSON save/load with a schema `version`).

Plus play / pause / step / reset, and an FPS + ms-per-stage readout.

**Presets** (`src/presets.ts`) — at minimum:

| Preset | ω | J | Rheology |
| --- | --- | --- | --- |
| Baseline industrial ball mill | 75 % N_c | 0.30 | K=0.5, n=0.7, τ_y=5, ρ=1800 |
| Newtonian reference (water-like) | 75 % N_c | 0.30 | K=1e-3, n=1.0, τ_y=0, ρ=1000 |
| High-yield-stress paste | 75 % N_c | 0.30 | K=1.0, n=0.8, τ_y=50 |
| Strongly shear-thinning | 75 % N_c | 0.30 | K=2.0, n=0.4, τ_y=2 |
| Shear-thickening | 75 % N_c | 0.30 | K=0.2, n=1.3, τ_y=0 |
| Low-speed cascading | 55 % N_c | 0.35 | baseline rheology |
| Supercritical centrifuging | 110 % N_c | 0.30 | baseline rheology |
| Fine media (d_p = 0.5 mm) | 75 % N_c | 0.30 | baseline, d_p=5e-4 |
| Coarse media (d_p = 5 mm) | 75 % N_c | 0.30 | baseline, d_p=5e-3 |
| RVE closure study | – | – | micro scale, ε=0.40 |

**CSV export** (`export/csv.ts`): a metadata header block with every parameter
including `n_sub`, viscous iterations, `μ_max`, `η` and the closure constants —
a result is not reproducible without its numerical settings — then the time
series of torque, power, mean/max `γ̇`, yielded fraction, KE, `max|∇·u|`.

**About panel** (`ui/about.ts`): render the assumption table from `PHYSICS.md` §1
verbatim. Users must be able to see that there is no free surface and that
charge motion is prescribed.

**DoD**
- [ ] All presets load and run without console errors, and **every control
      remains editable after a preset is loaded** (presets set values, they do
      not lock them).
- [ ] Every parameter in `PARAMETERS.md` §§1–7 has a working control. Assert
      this with a test that walks the config schema and fails if any entry has no
      bound control — do not verify it by eye.
- [ ] Non-default **dimensions** run correctly end-to-end: `D = 0.3 m` (lab
      mill), `D = 5.0 m` (industrial), `n_L = 0`, `n_L = 24`, `h_L = 0.1 m`,
      `d_p = 0.5 mm` and `d_p = 10 mm`. No NaN, and `Δx` updates consistently.
- [ ] Changing `N` or `D` rebuilds the solver and the typed-array views without a
      leak (check `memory.buffer.byteLength` stabilises after 20 rebuilds).
- [ ] Permalink round-trip: change 10 parameters, copy the URL, reload in a fresh
      tab, and every value matches.
- [ ] CSV export opens in Excel with correct headers and a metadata block
      containing **all** parameters, including numerical settings.
- [ ] All validity warnings of `PARAMETERS.md` §8 fire under their stated
      conditions.
- [ ] `npm run build` output in `dist/` runs correctly from `npm run preview`.

---

## Phase 7 — Headless runner and experiments

`scripts/headless_run.mjs`: loads the release WASM under Node, applies a preset
plus CLI overrides, runs to a fixed simulated time or to steady state, writes
`results/<name>.csv`. No browser, no rendering — this is what makes the
parametric studies scriptable.

```bash
node scripts/headless_run.mjs --preset baseline --t 20 --n 256 --out results/baseline.csv
node scripts/run_experiments.mjs            # runs E1–E5, E7
python scripts/fit_closure.py               # E6 → docs/closure_table.json
```

Run experiments **E1–E7** as specified in `EXPERIMENT_PLAN.md`, then have the
macro solver load `docs/closure_table.json` so the 2D closure constants replace
the 3D Ergun placeholders.

**DoD**
- [ ] Every experiment CSV exists in `results/` and contains finite values only.
- [ ] `docs/closure_table.json` exists, and the macro solver's `setClosure` is
      called with values from it at startup.
- [ ] E5 grid convergence: torque differs by < 5 % between `N = 256` and
      `N = 512` for the baseline preset — or, if it does not, the default
      resolution is raised and the reason recorded.

---

## Phase 8 — Documentation, smoke test, deployment

- `README.md`: what it is, the physics in five lines, the assumption list,
  screenshots, install/run/test/build commands, the `file://` caveat, licence
  (MIT), and a link to `MillDynamics` v1 explaining the DEM/CFD split.
- `docs/VALIDATION.md`: every verification case V1–V10 with **measured value,
  tolerance, pass/fail**; the E1–E7 result plots or tables; measured FPS per
  resolution; and a "Deviations from spec" section.
- `scripts/smoke.mjs`: Playwright against `npm run preview` — assertions listed in
  `GEMINI.md`, plus screenshots to `docs/screenshots/`.
- `.github/workflows/pages.yml`: on push to `main`, `npm ci`, `npm run build`,
  `npm run test`, deploy `dist/` to GitHub Pages. The build must fail the workflow
  if any verification test fails.

**DoD**
- [ ] `npm run test && npm run build && npm run smoke` all green from a clean
      `node_modules`.
- [ ] GitHub Pages serves the live simulation from
      https://github.com/ToshihiroIguchi/MillDynamics2.
- [ ] `docs/VALIDATION.md` contains numbers, not adjectives.

---

## 動作確認 — the operational check-list

Run this whole sequence before reporting completion. It is the definition of
"it works".

```bash
# 1. numerical core, with assertions and bounds checks
npm run asbuild:debug && npm run test

# 2. optimised core
npm run asbuild

# 3. static bundle
npm run build

# 4. the built bundle, served over HTTP, driven by a real browser
npm run preview &
npm run smoke

# 5. headless physics batch
node scripts/headless_run.mjs --preset baseline --t 20 --out results/baseline.csv
node scripts/headless_run.mjs --preset newtonian --t 20 --out results/newtonian.csv

# 6. full experiment suite (long; run once at the end)
npm run experiments && python scripts/fit_closure.py
```

Manual checks in the browser that no automated test replaces:

1. The lifters visibly rotate and drag fluid with them.
2. Switching to the **μ_app** field shows low viscosity in the high-shear region
   near the lifters and high viscosity in the quiescent core — for a
   shear-thinning preset. If it looks uniform, the rheology is not coupled.
3. Switching to the **yield state** field with `τ_y = 50 Pa` shows unyielded dead
   zones. With `τ_y = 0` the whole domain is yielded.
4. Raising `d_p` from 0.5 mm to 5 mm visibly increases slurry penetration into the
   bed (permeability `∝ d_p²`).
5. Torque and power rise with mill speed, and the FPS readout matches the targets
   in `NUMERICS.md` §10.
6. Pause / step / reset behave; changing `N` mid-run does not corrupt the display.

---

## Risk register

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Pure-Neumann Poisson drifts, divergence grows slowly | High | Mean-zero RHS + re-centre `φ`; V5 runs 1000 steps, not 10 |
| Semi-Lagrangian over-diffusion smears shear layers | High | MacCormack + clamp (§3); compare V1 against Ghia at Re = 1000 where diffusion shows up worst |
| `μ_max` clamp dominates the yield-stress result | Medium | E7 sensitivity study; report the clamped-cell fraction as a diagnostic |
| 512² too slow to be interactive | Medium | 256² default; optimisation ladder in `NUMERICS.md` §10; f32 switch is one line |
| 2D Ergun constants far from 150/1.75 | **Expected** | This is the reason E6 exists; report the measured values as a result |
| Prescribed charge motion looks convincing but is an input | Certain | About panel + README state it; never present power draw as a validated absolute |
| AssemblyScript hot-loop allocation kills FPS | Medium | Allocate in constructor only; profile with `--trace` in the debug build |
| WASM fetch blocked on `file://` | Certain if opened wrongly | README caveat; smoke test runs over HTTP |
