# CHECKLIST — Start Here

The specification is ~3000 lines across eight documents. This is the ordered
worklist. Each row names the increment, what to read **immediately before**
writing it, and the test that must pass **immediately after**.

**Rules of the road**

- Do the rows in order. Never start a row until the previous row's test passes.
- Read only the sections named for the row you are on. Do not try to hold the
  whole specification in your head.
- If a test fails, the bug is in the code you just wrote — the previous rows are
  already verified. Do not go back and rewrite working modules.
- Commit after every row. Message: `phase-Nx: <what>` (e.g. `phase-1b: multigrid`).

---

## The worklist

| # | Build | Read first | Passes when |
| --- | --- | --- | --- |
| 0 | npm + Vite + AssemblyScript scaffold, `add()` callable from Node and browser, Python venv + `requirements.txt` | `IMPLEMENTATION_PLAN.md` Phase 0; `TESTING.md` §5 | `npm run build`, `npm run preview`, `.venv/Scripts/python -c "import numpy,scipy"` |
| 1a | `types.ts`, `grid.ts`, divergence + gradient operators | `KERNEL_REFERENCE.md` §0–2b; `NUMERICS.md` §1 | **U1, U2, U3, U10** |
| 1b | `multigrid.ts`, standalone Poisson | `KERNEL_REFERENCE.md` §6; `NUMERICS.md` §8 | **U4, U5, U6** |
| 1c | `advect.ts`, passive scalar only | `KERNEL_REFERENCE.md` §2; `NUMERICS.md` §3 | **U8, U9** + peak-retention ratio reported |
| 1d | `solver.ts`, constant viscosity, projection loop | `NUMERICS.md` §2 | **U7, U11, U12, V4, V5** |
| 1e | Six boundary modes | `TESTING.md` §2–3 | **V1** (Re 100, 400) |
| 2a | `rheology.ts` | `KERNEL_REFERENCE.md` §3 | `μ(0) = τ_y·m` to 1e-9; series/exact branches agree |
| 2b | `strain.ts` | `KERNEL_REFERENCE.md` §4 | **U10** still exact with variable `μ` |
| 2c | `diffuse.ts`, implicit variable viscosity | `KERNEL_REFERENCE.md` §5; `NUMERICS.md` §5 | **U11** (the key test), then **V2, V3** |
| 3a | `penalize.ts` + shell SDF | `KERNEL_REFERENCE.md` §7; `NUMERICS.md` §7 | **U12**, **V6** (cylinder drag) |
| 3b | Lifters, rotation, `diagnostics.ts` torque | `KERNEL_REFERENCE.md` §7, §10 | **V7a–d** — *run the torque sign check by hand* |
| 4a | Bed geometry, chord bisection | `KERNEL_REFERENCE.md` §8; `PHYSICS.md` §5.1 | bed area = `J·πR²` within 1 %, all `J`, all `N` |
| 4b | `porous.ts` Ergun drag | `NUMERICS.md` §6; `PHYSICS.md` §5.3–5.4 | Darcy–Forchheimer balance within 2 % in a periodic box |
| 4c | Full diagnostics, presets | `PHYSICS.md` §8 | **V9** robustness; every preset 60 s, no NaN |
| 5 | `rve.ts` micro scale | `PHYSICS.md` §7; `KERNEL_REFERENCE.md` §9 | **V8** vs. Gebart within 20 % |
| 6a | `config.ts` parameter schema | `PARAMETERS.md` (all) | schema-walk test: every parameter has a control |
| 6b | Renderer, colormaps, overlays | `IMPLEMENTATION_PLAN.md` Phase 6 | presets render; non-default `D`, `n_L`, `d_p` all run |
| 6c | Charts, CSV, permalink, About panel | `PARAMETERS.md` §9; `PHYSICS.md` §1 | permalink round-trip; CSV metadata complete |
| 7 | Headless runner, experiments E1–E7 | `EXPERIMENT_PLAN.md` Part 2 | all CSVs finite; `closure_table.json` loaded by the macro solver |
| 8 | README, VALIDATION.md, smoke test, Pages workflow | `IMPLEMENTATION_PLAN.md` Phase 8 | **V10** measured; `npm run test && npm run build && npm run smoke` |

---

## The five mistakes that will cost you the most

Each of these produces output that looks completely reasonable. They are ordered
by how much time they waste before you notice.

1. **Body forces applied inside solid cells.** The implicit penalization residual
   is only `(u*−u_wall)/(1+Δt/η) ≈ 1/21` at default settings, so gravity inside a
   solid refreshes it every step. Torque comes out an order of magnitude high and
   drifts upward while the velocity field looks perfect. **Scale every body force
   by `(1−χ)`.** — `KERNEL_REFERENCE.md` §10
2. **Zero instead of a mirrored ghost at no-slip walls.** Puts the effective wall
   half a cell outside the domain and drops the scheme to first order there.
   V2 misses its 1 % tolerance and it looks like a solver bug.
   — `KERNEL_REFERENCE.md` §2b
3. **Missing `subtractMean` on the Poisson right-hand side or on `φ`.** The
   pure-Neumann system is singular; the solve picks up a drifting constant.
   Divergence grows so slowly that a short test passes. — `KERNEL_REFERENCE.md` §6
4. **Wrong offsets in the four-point staggered average (`uAtV` / `vAtU`).**
   Advection becomes first-order-biased. V1 passes at Re = 100 and fails at
   Re = 1000 — the most misleading symptom in the whole project.
   — `KERNEL_REFERENCE.md` §2
5. **Hard-coded `4.0` as the Gauss–Seidel diagonal** instead of counting actual
   neighbours. Imposes a Dirichlet-like boundary and quietly changes the physics.
   — `KERNEL_REFERENCE.md` §6

`TESTING.md` §6 has the full symptom-to-cause table. Consult it before rewriting
anything.

---

## When you are stuck

In this order:

1. Check `TESTING.md` §6 — the symptom is probably listed with its cause.
2. Check the order-of-magnitude table, `KERNEL_REFERENCE.md` §11. If a number is
   wrong by a factor of 2, suspect a Δx or a ½; by a factor of ρ, suspect a
   force-vs-acceleration confusion; by 10× and growing, suspect mistake #1 above.
3. Re-run the U tests. They isolate to a single module.
4. Reduce the problem: drop to `N = 32`, one sub-step, fixed `Δt`, Newtonian,
   no geometry, no gravity. Add one thing back at a time.
5. If it still fails, **stop and report it** with the measured numbers and what
   you have ruled out. Record it in `VALIDATION.md` under "Deviations from spec".
   Do not loosen the tolerance, do not delete the test, and do not proceed to the
   next row.

## What honest completion looks like

```bash
npm run asbuild:debug && npm run test    # U1-U12, V1-V9
npm run asbuild && npm run build
npm run preview & npm run smoke
npm run experiments
.venv/Scripts/python scripts/fit_closure.py
```

Then `docs/VALIDATION.md` contains a measured number, a tolerance and a verdict
for every case — PASS, FAIL or BLOCKED, never blank. A summary claiming all tests
pass is only acceptable if you ran them in this session and saw the output.
