# TESTING — How to Actually Run the Verification Cases

`EXPERIMENT_PLAN.md` says *which* cases must pass and *to what tolerance*. This
file says **how to configure the solver to run them**, which is not obvious:
most of the verification cases are not mill flows at all, so the solver needs
boundary and driving modes that the mill configuration never uses.

---

## 1. Integrity rules — read these first

These are not style preferences. Violating them makes the whole validation
worthless.

1. **Never invent reference data.** Benchmark values (Ghia's tables, Dennis &
   Chang's drag coefficients, Gebart's permeability) must come from the actual
   source. Do not write down numbers from memory or from a plausible-looking
   guess. If you cannot obtain a table, mark that case **BLOCKED** in
   `VALIDATION.md` and state why — a blocked case is honest, a fabricated one is
   not.
2. **Cross-check every benchmark table against two independent sources** and
   record both in `VALIDATION.md`. Published benchmark data is widely
   reproduced, and transcription errors are common.
3. **Never loosen a tolerance to make a test pass.** Fix the solver. If it still
   fails, record the measured value, the tolerance, and your diagnosis under
   "Deviations from spec", and leave the test failing.
4. **Never delete or skip a failing test.** Mark it `.fails` so it stays visible.
5. **A phase whose DoD does not fully pass does not advance.** Stop, report, and
   fix. Do not build Phase 5 on a broken Phase 3.
6. **Do not report "all tests pass" unless you have just run them** and seen the
   output in this session.

---

## 2. The solver needs boundary and driver modes

Add these to `solver.ts` in Phase 1. Without them, cases V1–V4 and V6 cannot be
set up at all.

```
setBoundaryMode(mode: i32): void
  0  MILL      solid exterior, rotating shell + lifters (the production mode)
  1  PERIODIC  periodic in x and y, no geometry           (V4, RVE)
  2  CAVITY    no-slip box, top lid driven at u = U_lid   (V1)
  3  CHANNEL   periodic in x, no-slip walls at y=0 and y=L (V2, V3)
  4  INFLOW    uniform inflow at x=0, outflow at x=L, no-slip top/bottom (V6)
  5  COUETTE   two concentric penalized cylinders          (V7)

setLidVelocity(U: f64): void                   // mode 2
setBodyForce(fx: f64, fy: f64): void           // modes 1, 3, RVE driving
setInflow(U: f64): void                        // mode 4
setCouette(Ri: f64, Ro: f64, wIn: f64, wOut: f64): void   // mode 5
setFixedTimeStep(dt: f64): void                // 0 = adaptive; needed for order studies
setInitialField(kind: i32, amp: f64, k: f64): void        // 1 = Taylor-Green
```

Outflow in mode 4: zero-gradient on velocity, `φ = 0` (Dirichlet) on the outflow
column — that column is the only place the Poisson problem is not pure Neumann,
so `subtractMean` must be **skipped** in mode 4. Getting this wrong makes V6
converge to a uniform offset.

---

## 3. Case-by-case configuration

| Case | Mode | Geometry | Rheology | Grid | Driver | Measure |
| --- | --- | --- | --- | --- | --- | --- |
| V1 cavity | 2 | none | `n=1, τ_y=0`, `K=μ` from Re | 128² (Re 100/400), 256² (Re 1000) | `U_lid = 1`, `L = 1` | centreline `u(y)`, `v(x)`, vortex centre |
| V2 power-law Poiseuille | 3 | none | `τ_y=0`, `n ∈ {0.5,1,1.5}` | 64/128/256 | `f_x = G/ρ` | `u(y)` vs. analytical, L2 error, order |
| V3 plug flow | 3 | none | `n=1`, `τ_y>0` | 128² | `f_x`, incl. a sub-yield case | plug half-width, `u_plug`, creep |
| V4 Taylor–Green | 1 | none | `n=1`, `τ_y=0`, `g=0` | 64/128/256 | `setInitialField(1, 1, 2π/L)` | decay rate, spatial + temporal order |
| V5 divergence | 0 | mill, defaults | baseline preset | 256² | — | `max|∇·u|` over 1000 steps |
| V6 cylinder | 4 | single penalized disc, `d ≥ 20Δx` | `n=1` | blockage ≤ 5 % | `U` from Re | `C_D`, recirculation length |
| V7 Couette | 5 | two cylinders, `n_L = 0` | V7a/b `n=1`; V7c power-law | 256² | `ω` inner | torque, `u_θ(r)`, `γ̇` at inner wall |
| V8 permeability | 1 (RVE) | hexagonal discs | `n=1`, `Re_p<0.1` | 512², `Δx=0.1mm` | `f_x` | `K = μU/(ρf_x)` vs. Gebart |
| V9 robustness | 0 | all presets + adversarial | all | 128/256/512 | — | finite, bounded |
| V10 performance | 0 | baseline | baseline | 128/256/512 | — | FPS, ms per stage |

**V7 requires `n_L = 0`.** The Taylor–Couette analytical solution exists only for
a smooth axisymmetric cylinder — this is why lifters must remain switchable off,
and why `n_L = 0` is a supported configuration rather than an oversight.

### Analytical references to implement in the tests

```
V2  u(y)   = (n/(n+1))·(G/K)^(1/n)·( H^((n+1)/n) − |y|^((n+1)/n) )
V3  y₀     = τ_y/G ;  u_plug = (G/(2μ_p))·(H − y₀)²
    u(y)   = (G/(2μ_p))(H² − y²) − (τ_y/μ_p)(H − y),  y₀ ≤ |y| ≤ H
V4  ‖u‖    ∝ exp(−2νk²t)
V7a T      = 4π μ ω R_i² R_o² / (R_o² − R_i²)
V7c γ̇_i    = 2ω / ( n · (1 − (R_i/R_o)^(2/n)) )
V8  K/R_b² = (4/(9π√6))·( sqrt(φ_max/φ) − 1 )^(5/2),  φ_max = π/(2√3)
```

These are closed forms — code them directly in the test, do not tabulate them.
Only V1, V6 and V8's comparison points come from literature.

---

## 4. Loading the WASM module under Node (Vitest)

```ts
// tests/helpers/loadWasm.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function loadSolver(debug = true) {
  const path = fileURLToPath(new URL(
    debug ? '../../assembly/build/mill.debug.wasm'
          : '../../assembly/build/mill.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(readFileSync(path), {
    env: {
      abort(_m: number, _f: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      trace() {},
    },
  });
  const e = instance.exports as any;
  const view = (ptr: number, len: number) =>
    new Float64Array(e.memory.buffer, ptr, len);   // re-derive after any rebuild
  return { e, view };
}
```

Use the **debug** build in tests: bounds checks and assertions catch index errors
that the release build would turn into silent memory corruption. Run the release
build once under V10 only.

`npm run test` must depend on `asbuild:debug` (already wired in the Phase 0
`package.json`) so the tests can never run against a stale module.

---

## 5. Python: always inside a virtual environment

Python is used for the closure fitting (`scripts/fit_closure.py`, experiment E6)
and any offline analysis or plotting. **Never install packages into the system
Python.** Create and use a project-local venv:

```bash
# Windows (this machine)
python -m venv .venv
.venv/Scripts/python -m pip install --upgrade pip
.venv/Scripts/pip install numpy scipy matplotlib pytest

# Run everything through the venv interpreter explicitly
.venv/Scripts/python scripts/fit_closure.py
.venv/Scripts/python -m pytest benchmarks/
```

```bash
# POSIX equivalent, for CI
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/fit_closure.py
```

Rules:

- `.venv/` is git-ignored (already in `.gitignore`).
- Pin the dependency list in `requirements.txt` and commit that file.
- **Invoke the venv interpreter by explicit path** (`.venv/Scripts/python`)
  rather than relying on `activate`. Shell activation does not survive between
  tool calls in an automated workflow, so a bare `python` will silently hit the
  system interpreter and either fail on a missing package or, worse, install into
  the system environment.
- Any command in the documentation written as `python …` means
  `.venv/Scripts/python …` on this machine.
- If a Python step cannot run, say so — do not substitute a hand-computed number
  for a fit that was never performed.

---

## 6. Common bugs and their symptoms

Match the symptom before rewriting anything. Most of these produce a *plausible*
picture, which is what makes them expensive.

| Symptom | Likely cause |
| --- | --- |
| NaN within ~10 steps | Poisson RHS not mean-zero; or diffusion left explicit |
| Divergence grows slowly over thousands of steps | `φ` not re-centred each V-cycle; MG tolerance too loose |
| Torque an order of magnitude too high and drifting upward | Gravity/drag applied inside solid cells — scale body forces by `(1−χ)` (`KERNEL_REFERENCE.md` §10) |
| Power draw negative | Torque sign inverted; re-run the hand check in §10 |
| V1 passes at Re = 100, fails at Re = 1000 | Advection is effectively first-order: MacCormack correction missing, clamp wrong, or the 4-point staggered average in `uAtV`/`vAtU` is off by one |
| Flow is smooth solid-body rotation with no structure | Same as above, or `μ_max` clamp active nearly everywhere |
| Checkerboard pressure field | Fields accidentally co-located instead of staggered |
| Fluid leaks through the shell | `χ` used at cell centres on faces without averaging; or `η` too large |
| Poiseuille profile asymmetric | `u` has `N+1` columns and `N` rows, `v` the reverse — index ranges swapped |
| `γ̇ = 0` everywhere despite visible motion | Node (corner) shear term omitted from `γ̇` |
| `μ` field uniform although `n < 1` | `μ` computed from a stale `γ̇`, or not passed into `diffuse` |
| NaN only when `τ_y > 0` | Missing small-`γ̇` series guard: `(1−exp(−mγ̇))/γ̇` is 0/0 at `γ̇ = 0` |
| Lifters rotate visually but drag no fluid | Lifter mask rebuilt at centres, `χ_face` not recomputed |
| RVE permeability far too high | Beads under-resolved (`d_p/Δx < 8`) |
| Results change when `n_visc` changes | Viscous solve under-converged — that is expected below ~16 iterations; quantify it, do not panic |
| Solver slows down over time | Allocation inside the step loop |

---

## 7. What "done" looks like

```bash
npm run asbuild:debug && npm run test      # V1-V9, all green
npm run asbuild && npm run build           # release + static bundle
npm run preview & npm run smoke            # built bundle, real browser
node scripts/headless_run.mjs --preset baseline --t 20 --out results/baseline.csv
npm run experiments                        # E1-E5, E7
.venv/Scripts/python scripts/fit_closure.py   # E6 -> docs/closure_table.json
```

Then `docs/VALIDATION.md` is filled in with measured numbers, and every V case
reads PASS, FAIL or BLOCKED — never blank, never assumed.
