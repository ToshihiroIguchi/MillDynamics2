# VALIDATION — Measured Results

> **To be filled in by Gemini as each phase completes.** Every entry must carry a
> measured value, the tolerance from `EXPERIMENT_PLAN.md`, and a verdict. An
> empty section means the case has not been run — do not mark it PASS on the
> assumption that it would.

---

## Environment

| Item | Value |
| --- | --- |
| Date | |
| Machine / CPU | |
| Browser + version | |
| Node version | |
| AssemblyScript version | |
| Build flags | |

---

## Part 0 — Operator tests

| # | What | Measured | Tolerance | Verdict |
| --- | --- | --- | --- | --- |
| U1 | Divergence of a divergence-free field | | < 1e-12 | |
| U2 | Divergence, order of accuracy | | ≥ 1.9 | |
| U3 | Gradient/divergence adjointness | | < 1e-12 | |
| U4 | Poisson, manufactured solution | | 1 % at 128², order ≥ 1.9 | |
| U5 | Poisson null space | | < 1e-10 | |
| U6 | Poisson operator symmetry | | < 1e-12 | |
| U7 | Projection idempotence | | < 1e-10 | |
| U8 | Advection, uniform translation | | < 0.5 Δx | |
| U9 | Advection, solid-body rotation | | see note | |
| U10 | Strain rate, exact | | < 1e-12 | |
| U11 | Viscous operator null space | | < 1e-10 | |
| U12 | Penalization, exact relaxation | | < 1e-12 | |

Peak retention, MacCormack vs. first-order semi-Lagrangian (U8/U9):

| Test | MacCormack | 1st-order SL | Ratio |
| --- | --- | --- | --- |
| U8 uniform translation | | | |
| U9 solid-body rotation | | | |

---

## Part 1 — Verification

### V1 — Lid-driven cavity (Ghia et al. 1982)
### V2 — Power-law Poiseuille
### V3 — Bingham / Herschel–Bulkley plug flow
### V4 — Taylor–Green vortex decay
### V5 — Discrete incompressibility
### V6 — Flow past a cylinder (Dennis & Chang 1970)
### V7 — Taylor–Couette torque
### V8 — Disc-array permeability (Gebart 1992)
### V9 — Robustness
### V10 — Performance

| N | Δx [mm] | FPS | advect [ms] | diffuse [ms] | drag+penal [ms] | multigrid [ms] | diag [ms] | render [ms] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 128 | 8.0 | | | | | | | |
| 256 | 4.0 | | | | | | | |
| 512 | 2.0 | | | | | | | |

---

## Part 2 — Experiments

### E1 — Rheology sweep
### E2 — Mill speed sweep
### E3 — Fill level
### E4 — Media size
### E5 — Grid convergence
### E6 — RVE closure calibration

Measured 2D closure constants (compare against the 3D Ergun values 150 / 1.75,
which are **not** expected to hold in 2D):

| 1−ε | Packing | A_2D | B_2D | C_γ | R² |
| --- | --- | --- | --- | --- | --- |

### E7 — Regularization sensitivity

---

## Deviations from spec

| Item | Specified | Measured / implemented | Diagnosis |
| --- | --- | --- | --- |
