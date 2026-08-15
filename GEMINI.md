# MillDynamics2 — Instructions for Gemini

You are the implementer for this project. Claude has already produced the
specification; your job is to build it, test it, and prove it works.

## Repository Information

- **Repository URL**: https://github.com/ToshihiroIguchi/MillDynamics2
- **Deployment target**: GitHub Pages of the above repository, serving `dist/`
  built with `base: './'`

## Language Policy

- **Conversations / interactions with the user**: Japanese (`日本語`)
- **Everything else** (code, comments, documentation, commit messages,
  configuration, UI strings): English

## Execution Rules

- Do not stop or prompt the user for intermediate questions, clarifications, or
  approvals.
- Assume the most standard, robust and optimal implementation strategy
  autonomously.
- Complete all code generation, file creation, automated tests, builds and
  verifications end-to-end in a single continuous workflow.
- Work **phase by phase** through `docs/IMPLEMENTATION_PLAN.md`. A phase is
  finished only when its "Definition of Done" checks all pass. Commit at the end
  of each phase with the message prefix `phase-N:`.
- When implementation and verification are complete, commit and push to GitHub.
- Report only the final summary of changes and execution results.

## Where to start

1. Read `docs/PHYSICS.md` (what is being solved and why).
2. Read `docs/NUMERICS.md` (how it is discretised).
3. Read `docs/PARAMETERS.md` (every runtime-adjustable parameter, with ranges).
4. Read `docs/IMPLEMENTATION_PLAN.md` (what to build, in what order).
5. Read `docs/EXPERIMENT_PLAN.md` (how correctness is demonstrated).

Then start at Phase 0.

## Hard constraints

- **Static site only.** No server, no API calls, no build-time network fetches at
  runtime. `dist/` must work when served by any static file host.
- **AssemblyScript for the numerical core.** Do not introduce Rust, C++,
  Emscripten, or a WASM toolchain that needs a non-npm installer.
- **No allocation in the hot loop.** Allocate every field once in the solver
  constructor. `new`, array literals, closures and string concatenation are
  forbidden inside `step()` and everything it calls.
- **f64 by default**, but define `type Real = f64` in one place so the precision
  can be switched in a single edit.
- **No hard-coded dimensions or physical constants.** Mill diameter, lifter
  geometry, media diameter, domain size, resolution, rheology and every numerical
  setting come from the config schema (`src/config.ts`) whose contents are
  specified by `docs/PARAMETERS.md`. The panel UI, the CSV metadata block, the
  URL permalink and the headless CLI are all generated from that one schema —
  do not maintain parallel lists.
- **Do not weaken a test to make it pass.** If a tolerance in
  `docs/EXPERIMENT_PLAN.md` cannot be met, fix the solver. If after genuine
  effort it still cannot be met, record the measured value, the tolerance, and
  your diagnosis in `docs/VALIDATION.md` under "Deviations from spec", and keep
  the failing test marked `.fails` rather than deleting it.
- **Report failures honestly.** A summary that says "all tests pass" when they do
  not is worse than no summary.

## Verification you must run before declaring a phase done

```bash
npm run asbuild:debug   # AssemblyScript debug build (assertions on)
npm run test            # Vitest: analytical verification suite
npm run asbuild         # release build (-O3, --noAssert)
npm run build           # tsc + vite production build into dist/
npm run smoke           # Playwright smoke test against the built static bundle
```

`npm run smoke` must assert, on the **built** bundle served over HTTP:
- the page loads with zero console errors,
- the WASM module instantiates,
- after 5 s of simulated time every diagnostic is finite (no `NaN`, no `Infinity`),
- `max |∇·u|·Δx / U_ref < 1e-4`,
- a screenshot is written to `docs/screenshots/`.

## Notes specific to AssemblyScript

- Initialise with `npx asinit .`, then adjust `asconfig.json` to the flags given
  in `docs/IMPLEMENTATION_PLAN.md` Phase 0.
- The JS↔WASM boundary carries **numbers only**. Fields stay in linear memory;
  JS reads them through `new Float64Array(memory.buffer, ptr, len)` views.
- Re-derive those views after any call that can grow memory (solver
  construction / resolution change). Never cache a view across a resize.
- Use `--runtime minimal`, not `stub`: the resolution selector reallocates.
- Build release with `--noAssert`; keep a debug build with bounds checks for the
  test suite so out-of-range indexing is caught.
- Avoid `Array<T>`; use `Float64Array` / `Int32Array` / `StaticArray<T>`.
- Hoist all index arithmetic; write plain `for` loops, no iterators or closures.

## Git

- Commit at the end of every phase, plus whenever a verification case first
  passes.
- Commit message style: `phase-3: brinkman penalization + cylinder drag V6`.
- Do not commit `node_modules/`, `dist/`, `assembly/build/*.wasm` (built
  artefacts are produced by CI), or `results/*.csv` larger than 1 MB.
