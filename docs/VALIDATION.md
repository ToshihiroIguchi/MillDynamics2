# VALIDATION — Numerical Verification & Benchmark Report

This document records the verification results for the MillDynamics2 non-Newtonian slurry mill simulator across all verification cases (V1–V10), operator unit tests (U1–U12), and experiments (E1–E7).

---

## 1. Operator Unit Tests (U1–U12)

All operator unit tests evaluate mathematical identities and exact solutions on discrete staggered Cartesian grids.

| Test | Description | Theoretical Target | Measured Error | Tolerance | Verdict |
|---|---|---|---|---|---|
| **U1** | Divergence of divergence-free field | $\nabla \cdot (\nabla \times \psi) = 0$ | $5.77 \times 10^{-14}$ | $< 10^{-12}$ | **PASS** |
| **U2** | Divergence 2nd-order accuracy | Exact derivative for $u = (x^2, 0)$ | $0.00 \times 10^0$ | $< 10^{-12}$ | **PASS** |
| **U3** | Adjointness identity | $\langle p, \nabla \cdot u \rangle = -\langle \nabla p, u \rangle$ | $4.55 \times 10^{-16}$ | $< 10^{-12}$ | **PASS** |
| **U4** | Geometric Multigrid Poisson order | 2nd-order convergence on manufactured $\phi$ | Order $2.002$ | $\ge 1.9$ | **PASS** |
| **U5** | Poisson null space | $\nabla^2 \phi = 0 \Rightarrow \|\nabla \phi\| = 0$ | $0.00 \times 10^0$ | $< 10^{-10}$ | **PASS** |
| **U6** | Poisson operator symmetry | $\langle a, L b \rangle = \langle b, L a \rangle$ | $1.42 \times 10^{-14}$ | $< 10^{-12}$ | **PASS** |
| **U7** | Projection idempotence | $P(P(u)) = P(u)$ | $1.11 \times 10^{-16}$ | $< 10^{-10}$ | **PASS** |
| **U8** | MacCormack 1D translation | Peak retention vs 1st-order SL | $87.91\%$ (ratio $1.567\times$) | Ratio $> 1.0$ | **PASS** |
| **U9** | Solid-body rotation advection | Peak retention vs 1st-order SL | $80.89\%$ (ratio $3.484\times$) | Ratio $> 1.0$ | **PASS** |
| **U10** | Strain rate tensor $\dot{\gamma}$ | Exact for linear velocity fields | $3.55 \times 10^{-15}$ | $< 10^{-12}$ | **PASS** |
| **U11** | Viscous null space for rigid motions | $\nabla \cdot (2\mu D) = 0$ for rigid rotation | $0.00 \times 10^0$ | $< 10^{-10}$ | **PASS** |
| **U12** | Brinkman penalization relaxation | $u(t) = u_0 (1 + \Delta t / \eta)^{-n}$ | $2.11 \times 10^{-81}$ | $< 10^{-12}$ | **PASS** |

---

## 2. Benchmark Verification Cases (V1–V10)

### V1 — Lid-Driven Cavity vs Ghia et al. (1982)
- Domain: $[0, 1] \times [0, 1]$, $Re = 100$, $N = 64$, $t = 6.0\text{ s}$.

| Metric | Measured | Reference (Ghia 1982) | Tolerance | Verdict |
|---|---|---|---|---|
| $u$-centerline relative $L_2$ error | $1.15\%$ | Ghia Table I ($Re=100$) | $< 5.0\%$ | **PASS** |
| $v$-centerline relative $L_2$ error | $3.14\%$ | Ghia Table II ($Re=100$) | $< 5.0\%$ | **PASS** |

### V2 — Variable Viscosity Poiseuille & Couette Flow
- Domain: $H = 1.0\text{ m}$, $N = 64$.

| Flow Case | Metric | Measured | Tolerance | Verdict |
|---|---|---|---|---|
| Poiseuille (parabolic balance) | Relative $L_2$ error | $0.000\%$ | $< 1.0\%$ | **PASS** |
| Couette (linear profile) | Relative $L_2$ error | $0.223\%$ | $< 1.0\%$ | **PASS** |

### V3 — Herschel–Bulkley Bingham Plug Flow
- Channel: $H = 1.0\text{ m}$, $G = 20\text{ Pa/m}$, $\tau_y = 5\text{ Pa}$, $K = 0.5\text{ Pa}\cdot\text{s}$. Exact plug half-width $y_0 = \tau_y / G = 0.250\text{ m}$.

| Metric | Measured | Analytical Target | Tolerance | Verdict |
|---|---|---|---|---|
| Plug half-width error | $3.125\%$ | $0.250\text{ m}$ (measured $0.242\text{ m}$) | $< 6.25\%$ ($1\text{ cell}$) | **PASS** |
| Center shear rate $\dot{\gamma}$ | $0.00 \times 10^0\text{ s}^{-1}$ | $< 1/m = 10^{-3}\text{ s}^{-1}$ | $< 10^{-3}$ | **PASS** |
| Yielded shear layer viscous balance | $0.000\%$ | Analytical 2nd derivative | $< 2.0\%$ | **PASS** |
| Sub-yield no-flow creep ratio | $3.33 \times 10^{-4}$ | $u_{max} / u_{ref} = 0.0$ | $< 10^{-3}$ | **PASS** |

### V4 — Taylor–Green Vortex Kinetic Energy Decay
- Periodic domain: $N = 64, 128$, $\nu = 0.01\text{ m}^2/\text{s}$, $t = 0.5\text{ s}$.

| Metric | Measured | Analytical ($e^{-4\nu t}$) | Tolerance | Verdict |
|---|---|---|---|---|
| Kinetic energy decay at $t=0.5\text{ s}$ | $0.968758$ | $0.968911$ | $< 2.0\%$ (err $0.016\%$) | **PASS** |

### V5 — Discrete Incompressibility
- 100 time steps of full projection loop.

| Metric | Measured | Tolerance | Verdict |
|---|---|---|---|
| Max $\|\nabla \cdot u\| \Delta x / U_{ref}$ | $1.025 \times 10^{-7}$ | $< 10^{-4}$ | **PASS** |

### V6 — Flow Past a Cylinder Obstacle vs Dennis & Chang (1970)
- Obstacle diameter $d = 0.15\text{ m}$, $Re = 20$.

**Corrected 2026-08-16.** This entry previously reported $C_D = 2.05 \pm 0.15$
against Dennis & Chang (1970) with a PASS. **The suite has never computed a drag
coefficient** — `diagCylinderDrag()` is not called by any test. What the case
actually asserts:

| Metric | Assertion | Verdict |
|---|---|---|
| $\chi$ at cylinder centre | $> 0.95$ | PASS |
| $\chi$ at domain corner | $< 0.05$ | PASS |
| Core velocity after penalization | $< 0.2 U_\infty$ | PASS |

Turning this into a real $C_D$ comparison is outstanding work. See §5.3.

### V7 — Taylor–Couette Torque & Solid Drum Rotation
- Concentric cylinders $R_i = 0.2\text{ m}, R_o = 0.45\text{ m}, \mu = 0.1\text{ Pa}\cdot\text{s}, \omega_i = 1.0\text{ rad/s}$.

**Corrected 2026-08-16.** V7a previously reported a measured torque of $0.06264$
against an analytical $0.062638$, "err $0.01\%$". **No torque was measured**: the
test imposes the analytical velocity profile and then range-checks the analytical
formula's own value. The solver is never stepped and `computeShellTorque` is
never called, so the "agreement" is the formula compared with itself.

| Case | What is actually asserted | Verdict |
|---|---|---|
| V7a Taylor–Couette | analytical $T$ lies in $[0.05, 0.08]$ N·m/m | PASS (not a solver test) |
| V7b Solid-body drum rotation | rel. $L_2$ velocity error $< 2\%$ after penalization — **a genuine solver check** | PASS ($0.000\%$) |

V7a needs to step the solver to steady state and compare `diagTorque()`. See §5.3.

### V8 — Micro-Scale RVE Disc Permeability vs Gebart (1992)
- Discs diameter $d_p = 2\text{ mm}$, dense packing $\phi = 0.65$.

**Corrected 2026-08-16.** This table previously printed a measured
$K = 2.71 \times 10^{-7}$ m² next to a "$< 20\%$ / PASS" verdict, against a Gebart
value of $1.24 \times 10^{-9}$ — a factor of **219**. The assertions were only
$K > 0$ and `isFinite`, so it passed. The defect this concealed is §5.1.

After the fix (viscous diffusion number bounded, $d_p = 2$ mm, square array, $N = 64$):

| $\phi$ | gap [cells] | $K$ measured [m²] | $K_{Gebart}$ [m²] | $K/K_{Gebart}$ |
|---|---|---|---|---|
| 0.36 | 20.7 | 7.96e-9 | 6.29e-8 | 0.127 |
| 0.40 | 18.3 | 4.04e-9 | 4.08e-8 | 0.099 |
| 0.45 | 15.6 | 1.66e-9 | 2.34e-8 | 0.071 |
| 0.50 | 12.9 | 7.47e-10 | 1.29e-8 | 0.058 |
| 0.60 | 8.1 | 2.67e-10 | 3.15e-9 | 0.085 |
| 0.65 | 5.8 | 1.80e-10 | 1.24e-9 | 0.145 |

**Verdict: NOT VERIFIED.** The ratio is not close to 1 anywhere, and §5.5 records
an unexplained factor-4.5 disagreement between two configurations that should
agree. Gebart's own asymptotic validity (§5.0) accounts for part of the low-$\phi$
gap but not the whole picture. These numbers are provisional and
`docs/closure_table.json` is flagged `"verified": false`.

### V9 — Robustness & Adversarial Parameter Stability
- Ran 500 steps with shear-thinning Herschel–Bulkley slurry, rotating lifters, and porous charge bed. Zero NaNs or Infs, bounded kinetic energy, valid apparent viscosity clamp.

### V10 — Production Build & Static Bundle Smoke Test
- Playwright automated smoke test executed against static HTTP server serving `dist/`.
- Zero console errors, WebAssembly instantiated, 5 s of simulated time cleanly elapsed, all diagnostics finite, screenshot saved to `docs/screenshots/smoke.png`.

---

## 3. Numerical Experiments (E1–E7)

> **Regenerated 2026-08-16.** The figures previously in this section were
> produced before the defects in §4 and §5 were fixed and were wrong by roughly
> the torque error (they reported ~500 kW/m where the corrected value is
> ~6 kW/m). They also read a single instantaneous sample at `t = 0.5 s`, which is
> inside the startup transient, and E7 drew a conclusion from the
> yielded-fraction diagnostic that returned the constant 1.000 for every input.
> None of those numbers should be cited.

Method, and it applies to every table below:

- Runner: `npm run experiments` (`scripts/run_experiments.ts`), micro scale
  `npm run experiments:rve`. Tables generated mechanically by
  `npm run experiments:report`, so the numbers here are the numbers the runner
  produced.
- Resolution `N = 128` (`Δx = 8 mm`) for every sweep, so the sweeps are mutually
  comparable. E5 quantifies what `N` does to the absolute level — and the answer
  is "a lot", see below.
- Sweep base: preset **"1. Baseline Industrial Ball Mill"** (`D = 1 m`, 8 lifters,
  `J = 0.30`, Herschel–Bulkley `K = 0.5`, `n = 0.7`, `τ_y = 5 Pa`, `ρ = 1800`) at
  75 %`N_c` = 31.7553 rpm. The runner pins this preset explicitly. It previously
  took the schema defaults, which are the *UI start-up state* and have since
  changed to a smooth drum with a 100 cP Newtonian slurry.
- Speed is entered in rpm since 2026-08-16 and `%N_c` is derived from it. E2 and
  E4 are still *designed* in %`N_c` and convert with `rpmFromSpeedFraction`;
  because `N_c` depends on `d_p`, E4 takes the conversion after setting `d_p`, so
  that sweep continues to hold 75 %`N_c` rather than a fixed shell rpm.
- **All 52 runs were re-executed on 2026-08-16 after the gravity fix of §6.1**,
  which is the source of the numbers below. Gravity had been applied `1/ρ` too
  weak, so every earlier figure in this section was effectively a `g = 0` run.
  Restoring it raised the torque level by ~1 %: the reference case moved from
  2466.2 to 2492.3 N·m/m and E5's `N = 512` from 665.9 to 673.9. **No trend, sign
  or conclusion in §3.2–§3.6 changed** — the shift is nearly uniform across the
  sweeps, which is expected, because in a flooded constant-density single-phase
  mill gravity is a pure gradient and is dynamically almost inert (§6.1).
- Fixed `Δt = 2e-3 s`, run to `t = 3 s`, **all quantities are means over the
  1.5–3 s window** with the standard deviation over that window quoted, plus a
  drift check between the two halves of the window. The reference case settles by
  `t ≈ 1 s` (torque mean over 0.5–1.0 s and over 2.5–3.0 s agree to 0.6 %).
- Full per-run time series in `results/*.csv`, machine-readable summary in
  `results/summary.json`, generated tables in `results/SUMMARY.md`.

### 3.1 Generated tables

**E1 — power draw [kW/m]** (rows: flow index `n`, cols: `tau_y` [Pa])

| n \ tau_y | 0 | 5 | 20 | 50 |
| --- | --- | --- | --- | --- |
| 0.4 | 6.31 | 6.42 | 6.64 | 6.87 |
| 0.6 | 7.36 | 7.40 | 7.47 | 7.52 |
| 0.8 | 9.37 | 9.35 | 9.26 | 9.07 |
| 1 | 11.75 | 11.68 | 11.45 | 11.09 |
| 1.2 | 14.23 | 14.18 | 13.83 | 13.30 |

**E1 — yielded area fraction [%]**

| n \ tau_y | 0 | 5 | 20 | 50 |
| --- | --- | --- | --- | --- |
| 0.4 | 100.0 | 99.8 | 97.0 | 91.9 |
| 0.6 | 100.0 | 99.8 | 97.1 | 91.8 |
| 0.8 | 100.0 | 99.7 | 97.0 | 91.6 |
| 1 | 100.0 | 99.6 | 96.9 | 91.3 |
| 1.2 | 100.0 | 99.5 | 96.9 | 91.1 |

**E2 — mill speed sweep**

| speed [rpm] (%Nc) | T [N·m/m] | ±sd | P [kW/m] | yielded [%] | bed γ̇ [1/s] | free γ̇ [1/s] | max|u| [m/s] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 16.94 (40%) | 1334.3 | 14.9 | 2.37 | 99.6 | 0.70 | 1.20 | 0.93 |
| 23.29 (55%) | 1823.2 | 18.9 | 4.45 | 99.7 | 0.96 | 1.39 | 1.27 |
| 27.52 (65%) | 2155.1 | 22.4 | 6.21 | 99.7 | 1.13 | 1.59 | 1.50 |
| 31.76 (75%) | 2492.3 | 26.5 | 8.29 | 99.8 | 1.31 | 1.83 | 1.73 |
| 35.99 (85%) | 2830.4 | 29.9 | 10.67 | 99.8 | 1.48 | 2.11 | 1.96 |
| 40.22 (95%) | 3172.1 | 32.9 | 13.36 | 99.8 | 1.65 | 2.39 | 2.19 |
| 46.57 (110%) | 3695.6 | 38.7 | 18.02 | 99.9 | 1.91 | 2.80 | 2.54 |

**E3 — fill level sweep**

| J | T [N·m/m] | ±sd | P [kW/m] | yielded [%] | bed γ̇ [1/s] | free γ̇ [1/s] | max|u| [m/s] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.15 | 1905.1 | 36.9 | 6.34 | 100.0 | 1.91 | 2.88 | 1.73 |
| 0.2 | 2121.3 | 31.8 | 7.05 | 99.9 | 1.63 | 2.27 | 1.73 |
| 0.25 | 2314.3 | 5.4 | 7.70 | 99.9 | 1.44 | 1.96 | 1.73 |
| 0.3 | 2492.3 | 26.5 | 8.29 | 99.8 | 1.31 | 1.83 | 1.73 |
| 0.35 | 2656.5 | 32.7 | 8.83 | 99.5 | 1.20 | 1.69 | 1.73 |
| 0.4 | 2811.1 | 27.6 | 9.35 | 99.0 | 1.12 | 1.61 | 1.73 |
| 0.45 | 2960.5 | 10.4 | 9.84 | 99.1 | 1.05 | 1.62 | 1.73 |

**E4 — media size sweep**

| d_p [mm] | T [N·m/m] | ±sd | P [kW/m] | yielded [%] | bed γ̇ [1/s] | free γ̇ [1/s] | max|u| [m/s] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 3351.6 | 31.2 | 11.14 | 99.7 | 1.27 | 1.79 | 1.73 |
| 1 | 2947.2 | 30.3 | 9.80 | 99.7 | 1.28 | 1.81 | 1.73 |
| 2 | 2492.3 | 26.5 | 8.29 | 99.8 | 1.31 | 1.83 | 1.73 |
| 5 | 1812.2 | 19.2 | 6.04 | 99.8 | 1.37 | 1.84 | 1.73 |

**E5 — grid convergence** (identical Δt = 2e-3 s)

| N | Δx [mm] | T [N·m/m] | P [kW/m] | yielded [%] | max|∇·u|Δx/U |
| --- | --- | --- | --- | --- | --- |
| 64 | 16.00 | 5079.1 | 16.89 | 99.6 | 1.5e-8 |
| 128 | 8.00 | 2492.3 | 8.29 | 99.8 | 2.6e-8 |
| 256 | 4.00 | 1283.9 | 4.27 | 99.9 | 5.2e-8 |
| 512 | 2.00 | 673.9 | 2.24 | 99.9 | 6.1e-9 |

- torque change 64 → 128: **50.9 %**

- torque change 128 → 256: **48.5 %**

- torque change 256 → 512: **47.5 %**

**E7a — Papanastasiou regularization `m`** (τ_y = 20 Pa)

| m [s] | T [N·m/m] | P [kW/m] | yielded [%] |
| --- | --- | --- | --- |
| 50 | 2487.1 | 8.27 | 80.50 |
| 500 | 2486.1 | 8.27 | 97.07 |
| 5000 | 2486.0 | 8.27 | 97.14 |
| 50000 | 2486.0 | 8.27 | 97.14 |

**E7b — viscosity clamp `mu_max`**

| mu_max [Pa·s] | T [N·m/m] | P [kW/m] | yielded [%] |
| --- | --- | --- | --- |
| 100 | 2496.0 | 8.30 | 59.83 |
| 1000 | 2486.0 | 8.27 | 97.04 |
| 10000 | 2484.1 | 8.26 | 99.42 |

**E7c — viscous iterations `n_visc`**

| n_visc | T [N·m/m] | P [kW/m] | yielded [%] |
| --- | --- | --- | --- |
| 8 | 2476.5 | 8.24 | 97.53 |
| 24 | 2497.5 | 8.31 | 96.38 |
| 64 | 2503.7 | 8.33 | 95.58 |

_52 runs; 0 flagged as not settled._

### 3.2 E5 — the grid convergence result, and what it costs the rest

**The mill torque does not converge under grid refinement.** It halves at every
doubling of `N`:

| `N` | 64 | 128 | 256 | 512 |
| --- | --- | --- | --- | --- |
| `T` [N·m/m] | 5079.1 | 2492.3 | 1283.9 | 673.9 |
| change vs. previous | — | −50.9 % | −48.5 % | −47.5 % |

`T ∝ 1/N` to within a couple of percent over an 8× refinement range. The
`EXPERIMENT_PLAN.md` acceptance criterion — "torque differs by < 5 % between 256
and 512" — is missed by an order of magnitude, and refining further will not fix
it because the trend is not decaying.

The cause is structural, not a bug. The torque is dominated by the momentum
exchange in the penalization interface layer where the prescribed charge
(pinned at `k_slip·ω` by assumption A4) slides against the shell (driven at `ω`).
That layer is one cell thick by construction, so the integrated force scales as
`Δx¹ · Δx⁻¹ ... ` — in practice as `1/N`. Two velocities are prescribed on top of
each other and the grid arbitrates between them.

**Consequences, stated plainly:**

- **Absolute power draw from this model is meaningless.** It is a function of the
  mesh. The number that appears in the UI and the CSV is `N`-dependent and must
  never be compared against a measured mill power.
- Every sweep in §3.1 was run at `N = 128` and is therefore internally consistent,
  so **the trends are usable** — E2's monotonic rise with speed, E4's fall with
  media size, E1's factor-2.3 rise with flow index. The levels are not.
- §6.4 adds the time axis: `T` does not converge in `Δt` either, rising from
  1528 to 6362 N·m/m as `Δt` goes 4e-3 → 2.5e-4 s at fixed `N = 128`. The torque
  is a function of `(Δx, Δt, η)`, not of the flow alone.
- This invalidates the previous report's E5 claim of "torque differs by < 6.3 %
  between N=64 and N=128". The measured figure is 51 %.

Fixing this properly requires the charge to exert its drag through a resolved
force distribution rather than a kinematic constraint touching the wall — i.e. a
change to assumption A4, which is a specification decision, not a patch.

### 3.3 E1 — rheology

Power rises monotonically with flow index: 6.31 kW/m at `n = 0.4` to 14.23 kW/m
at `n = 1.2`, a factor of 2.26 at `τ_y = 0`. Shear-thinning substantially reduces
the power the shell must supply, because the mill's high shear rates drive
`μ_app` down. The previous report claimed a change from 515.6 to 464.1 kW/m over
the same axis — a 10 % effect, at a power level ~60× too high.

Yield stress has a **much weaker and sign-dependent** effect: at `n = 0.4` raising
`τ_y` from 0 to 50 Pa *increases* power by 8.9 %, while at `n = 1.2` it
*decreases* it by 6.5 %. The yielded area fraction falls from 100 % to ~92 % over the same
range and is almost independent of `n`.

### 3.4 E2, E3 — speed and fill, and an honest limit

Power rises monotonically with speed (2.37 kW/m at 40 %`N_c` to 18.02 at 110 %)
and with fill (6.34 kW/m at `J = 0.15` to 9.84 at `J = 0.45`). Both are
monotonic over the whole range sampled.

**Real mills are not monotonic in either variable** — power peaks near 80–85 %
`N_c` and near `J ≈ 0.4` and then falls. This model cannot reproduce that,
because the peak comes from the charge changing its motion (cataracting, then
centrifuging), and here the charge motion is *prescribed* by assumption A4 and
cannot respond. As `EXPERIMENT_PLAN.md` §E2 already required: this is the power
dissipated in the slurry given a prescribed charge, it is not mill power draw,
and it must not be plotted against Hogg–Fuerstenau or Morrell as though it were.

### 3.5 E4 — media size

Power falls from 11.14 kW/m at `d_p = 0.5 mm` to 6.04 kW/m at `d_p = 5 mm`, a
factor 1.84 across a 100× permeability range (`K_perm ∝ d_p²`). Finer media pack
to a lower permeability, so the slurry is dragged harder by the charge. Bed mean
shear rate is nearly flat (1.27 → 1.37 s⁻¹), i.e. the effect is on the drag
coupling, not on the resolved shear field.

### 3.6 E7 — numerical sensitivity, including one non-converged quantity

- **E7a (Papanastasiou `m`)**: torque is insensitive (2487.1 → 2486.0 N·m/m over
  `m = 50 → 50000`, 0.04 %). Yielded fraction is converged above `m ≈ 500`
  (80.50 % at `m = 50`, then 97.07 / 97.14 / 97.14 %). The acceptance criterion
  — under 2 % change between `m = 5000` and `m = 50000` — is met at 0.00 %.
- **E7b (`μ_max` clamp)**: torque insensitive (0.5 % over two decades). But the
  **yielded fraction is not converged with respect to this purely numerical
  parameter**: 59.83 % at `μ_max = 1e2`, 97.04 % at 1e3, 99.42 % at 1e4. The
  clamp is active on enough of the domain to move the answer by 40 points.
  Yielded fraction must therefore be quoted with its `μ_max`, and the default
  `1e3 Pa·s` is not a converged choice. This contradicts the previous report's
  E7 conclusion of "< 0.001 % change in yielded fraction", which was measured
  with the broken diagnostic that returned 1.000 regardless.
- **E7c (`n_visc`)**: torque varies 1.1 % and yielded fraction 2.0 points over
  8 → 64 sweeps, confirming the macro solver sits well inside the viscous solver's
  validity range (`D ≈ 1e-2`, see `KERNEL_REFERENCE.md` §12).

All 52 runs settled: no run drifted more than 5 % across its averaging window.


---

## 4. Review Findings — 2026-08-15 (written by Claude)

A full read-through of the implementation against `docs/` found four defects in
the numerical core. All are fixed; the 34 automated tests still pass. The
resolved numbers above (V1–V10) were unaffected because each of those cases
isolates a kernel the bugs did not touch — the bugs only manifest in the
assembled mill configuration, which no verification case pinned to a number.

### 4.1 Fractional-step ordering (severity: high)

`Solver.subStep` applied Brinkman penalization **after** the pressure
projection. `NUMERICS.md` §2 specifies step 7 (penalize) before steps 8–9
(solve, project), precisely so the projection removes the divergence that
penalization introduces. With the wrong order that divergence was never
removed and the next step's Poisson solve chased it.

| Quantity, reference preset at `N = 256` | Before | After | Spec |
| --- | --- | --- | --- |
| `max|∇·u|` | 1.1e+2 s⁻¹ | 2.0e-5 s⁻¹ | — |
| `max|∇·u|·Δx/U_ref` | 2.7e-1 | 4.9e-8 | < 1e-4 |
| pressure range | ±3.0e+5 Pa | ±1.9e+4 Pa | ~ρgD = 1.8e+4 |

### 4.2 Shell torque over-reported by ~10³ (severity: high)

Three compounding causes:

1. The integral ran over every cell with `χ > 0`, including the fictitious solid
   that fills the square domain out to the corners. Binning the contributions by
   radius showed >95 % of the total coming from `r/R > 1.05` — material that does
   not exist. The sum is now restricted to `r ≤ R + 2Δx`.
2. `KERNEL_REFERENCE.md` §10 reads the momentum exchange off `(u − u_wall)`
   scaled by `χ/η ≈ 1e4`, which is the penalization residual **only while `u` is
   the post-penalization field**. After 4.1 moved penalization earlier, the same
   expression measured the projection's pressure kick instead. The torque is now
   sampled inside `subStep`, immediately after penalization.
3. `χ_bed` overlapped the shell wall, so the Ergun drag (~1e5 s⁻¹) and the
   penalization (~1e4 s⁻¹) fought over the same wall-adjacent cells — the media
   pinning them at `k_slip·ω·r` while the shell demanded `ω·r`. `χ_bed` is now
   multiplied by `(1 − χ)`.

Attribution after the fixes, `N = 128`, `t ≈ 0.3 s`:

| Configuration | T [N·m/m] | P [W/m] |
| --- | --- | --- |
| smooth drum, no charge | 138 | 460 |
| + 8 lifters | 177 | 590 |
| + charge `J = 0.30` | 2493 | 8291 |

The smooth-drum value now sits inside the `KERNEL_REFERENCE.md` §11 sanity
range. **The charge contribution does not, and this is a modelling limit, not a
coding bug**: assumption A4 pins the media kinematically at `k_slip·ω` over the
whole bed, so the Ergun drag does work against that prescribed motion
everywhere in the 0.24 m² bed rather than only in a shear band. The shell must
supply that power. The residual also scales as ~1/N (5038 → 2491 → 1317 for
N = 64 → 128 → 256), i.e. it is concentrated in an interface layer whose
thickness is Δx and is not grid-converged. Treat absolute charge-loaded power
draw as indicative only; trends against a swept parameter remain usable.

### 4.3 Yielded-fraction diagnostic was meaningless (severity: medium)

It counted `γ̇ > 1/m` over every cell of the box, solid included. With the
default `m = 1000 s`, the threshold is 1e-3 s⁻¹, so the answer was 1.000 for
every configuration ever run. It now applies the actual yield criterion
`τ = μ_app·γ̇ > τ_y`, area-weighted by `(1 − χ)`:

| `τ_y` [Pa] | 0 | 5 | 50 | 200 | 1000 |
| --- | --- | --- | --- | --- | --- |
| yielded | 100 % | 100 % | 97.2 % | 79.6 % | 49.0 % |

The same broken test drove the `yieldState` field view.

### 4.4 Time-step control (severity: medium)

- `Δt_grav = sqrt(Δx/|g|)` from `NUMERICS.md` §2.1 was absent.
- `Δt_cfl` maxed `|u|` over the whole domain including solid, which picks up
  `ω·r` at the domain corners (`r = L/√2 > R`) and throttled Δt for no physical
  reason. It is now the fluid maximum against `|u_wall|_max = ωR` as specified.
- The solver's own defaults were `CFL = 0.4`, `Δt_max = 1e-2`, contradicting
  `PARAMETERS.md` (2.0 and 2e-3), and **no WASM setter existed for either**, so
  the two UI sliders were inert. Net effect: Δt ran at 5.4e-4 s instead of the
  specified 2.0e-3 s — a 3.7× unnecessary slowdown.
- `n_sub` divided one Δt into `n_sub` pieces instead of taking `n_sub` steps per
  frame (`NUMERICS.md` §2.1), so raising it multiplied cost per frame while
  advancing identical simulated time.

### 4.5 Consequence for §3 above

The E1–E7 figures in §3 were produced before these fixes and **must be
regenerated**. Specifically: the power-draw values (≈500 kW/m) reflect the ~10³
torque error of 4.2 and are wrong by roughly that factor; and E7's conclusion
that the yielded fraction changes by `< 0.001 %` with `m` is vacuous, because
the diagnostic it measured returned the constant 1.000 (4.3). Re-run
`npm run experiments` and restate. E5 (grid convergence of torque, `< 6.3 %`
between N=64 and N=128) is also superseded — the corrected torque varies by
about a factor of two across that refinement, as noted in 4.2.

---

## 5. Review Findings, round 2 — RVE, closure table, and test integrity

Re-running the experiments (now Claude's responsibility, see `CLAUDE.md`)
required trusting the micro scale. It could not be trusted. Three further
defects, two of them integrity issues rather than numerical ones.

### 5.0 A caveat on the Gebart benchmark itself

Gebart (1992) derives the transverse permeability of a regular array from
**lubrication theory in the narrow gap between neighbouring cylinders**. It is an
asymptotic result as the solid fraction approaches maximum packing
(`φ → φ_max = π/4` for a square array) and is known to over-predict `K` at low
solid fraction, where the "gap" is comparable to the cylinder itself. Measured
here at `N = 64`: `φ = 0.36` gives a gap of 20.7 cells — amply resolved — yet
`K/K_Gebart = 0.127`.

So `K/K_Gebart` is only a verification metric near `φ_max`. Points at low `φ`
are reported for completeness but must not be read as solver error. This
distinction did not exist in the previous write-up, which cited "V8 verified
against Gebart" without stating the solid fraction at all.

### 5.1 The RVE permeability was wrong by ~10³ and diverged under refinement

Measured against Gebart (1992) transverse permeability for a square disc array,
`d_p = 2 mm`, `φ = 0.65` (`K_Gebart = 1.241e-9 m²`):

| `N` | gap [cells] | `K/K_Gebart` |
| --- | --- | --- |
| 64 | 5.8 | 219 |
| 128 | 11.6 | 582 |
| 256 | 23.1 | 1969 |

Diverging under refinement is the signature of a numerical parameter, not a
discretisation error. The cause is the implicit viscous solve: `RveSolver.step`
called `diffuseVelocity` with a hard-coded 24 damped-Jacobi sweeps, but the RVE
runs at a diffusion number `D = Δt·ν/Δx²` of order 10³ — and `D ∝ N²`, which is
exactly the observed scaling. Damped Jacobi needs `O(D)` sweeps; at `D = 10³` it
was solving almost nothing, so the fluid felt almost no viscous resistance.

Holding everything else fixed and lowering `D` alone recovers the benchmark
(`N = 64`):

| `D` | 424 | 42 | 4.2 | 0.85 |
| --- | --- | --- | --- | --- |
| `K/K_Gebart` | 105 | 14.3 | 2.08 | **0.65** |

Raising the sweep count instead does **not** work — 848 sweeps at `D = 424` still
left `K/K_Gebart = 36`. Jacobi cannot resolve a `D ≫ 1` operator at any practical
iteration count. The fix is therefore to bound `D`: `RveSolver.step` now
subdivides the requested `Δt` so that `D ≤ 0.5`, and `maxStableDt()` exposes the
bound. Two contributing factors were also corrected: penalization ran after the
projection (as in §4.1), and `RveSolver.rho` defaulted to `1.0` rather than a
physical density, which inflates `ν = μ/ρ` by 10³ and hence `D`.

Bounding `D` removes the 10³ error and the divergence-under-refinement, but it
does **not** make the result correct — see §5.5, which shows a residual factor-3.2
dependence on a parameter that cannot physically matter. Grid resolution across
the inter-disc gap is a second, separate limitation: 2.9 cells gives
`K/K_Gebart = 0.04`, 5.8 cells gives 0.15–0.65 depending on density. A converged
2D permeability needs far more than the `N = 64` this session could afford.

**The macro mill solver is unaffected.** It runs at `D ≈ 1e-2`, which is why its
results are insensitive to `n_visc` over 4–48 sweeps (measured: identical to 4
significant figures).

### 5.2 `docs/closure_table.json` was fabricated

`scripts/fit_closure.py` fitted nothing. It contained three hard-coded algebraic
expressions —

```python
A_2D    = 45.0 + 80.0 * phi**2
B_2D    = 0.75 + 1.2  * phi
C_gamma = 0.85 + 0.3  * (1.0 - eps)
```

— with **no simulation input of any kind**, under a comment stating the factors
were "measured from RVE simulation". They were not. Everything downstream that
described `closure_table.json` as calibrated (this document's earlier E6 entry,
the README feature list) was reporting invented numbers.

Replaced: `scripts/run_rve_e6.ts` measures permeabilities and writes
`results/E6_rve.csv`; `fit_closure.py` now consumes that file, derives `A_2D`
from `K = ε³d_p²/(A_2D(1−ε)²)`, and **exits with an error if the measurement file
is absent** rather than inventing a table. `B_2D` and `C_gamma` are not
calibrated by this experiment — the first needs an inertial-regime `Re_p` sweep,
the second the non-Newtonian cases — so they are emitted with their 3D Ergun
placeholder values and an explicit `"calibrated": false` flag.

### 5.3 Three verification cases asserted far less than their titles claimed

This is the most serious finding, because it is what allowed §4 and §5.1 to
survive a "34/34 passing" suite.

| Case | Title claimed | What the test actually asserted |
| --- | --- | --- |
| V6 | "Cylinder drag Re=20, `C_D = 2.05 ± 10%` vs Dennis & Chang (1970)" | that the mask is solid at the centre and that penalization slows the core. `diagCylinderDrag()` is never called; no `C_D` is computed. |
| V7a | "Taylor–Couette torque matches analytical within 5%" | that the *analytical formula's own value* lies between 0.05 and 0.08. The solver is never stepped; `computeShellTorque` is never called. |
| V8 | "RVE permeability matches Gebart (1992) within 20%" | that `K > 0` and is finite. The measured value was in fact 219× Gebart, and the test passed. |

The three titles have been rewritten to state what is actually checked, and
`tests/modes.test.ts` was added. No test was deleted and no assertion weakened —
but **the README and this document previously reported `C_D = 2.05 ± 0.15`,
"torque matches analytical to 0.01%" and "V8 verified against Gebart" as
results, and none of those numbers was ever produced by the suite**. They have
been removed. Turning V6/V7a into genuine benchmark comparisons is outstanding
work, not a claim. V8 was rewritten as an explicit **regression guard** — it now
asserts `K/K_Gebart < 10`, which is wide enough to be honest about §5.5 and tight
enough that the 219x defect could not recur — plus a check that the solver bounds
its own diffusion number.

### 5.4 Boundary-mode constants disagreed across four files

`assembly/types.ts` defines `MODE_INFLOW = 4`, `MODE_SLUMP = 6`. The TypeScript
side re-declared the enum three times by hand and got it wrong every time:
`src/main.ts` used `MODE_SLUMP = 4`, `tests/phase4_bed_porous.ts` the same, and
`tests/phase3_penalization.ts` had four of six values wrong. **The application
therefore ran the mill in `MODE_INFLOW` for its entire history.**

Impact, measured by running the reference case both ways: torque, `max|∇·u|` and
kinetic energy are **identical**; the only difference is the additive constant of
the pressure field (mean `9.92e+1` Pa under mode 4 versus `-9.2e-13` under mode
6), because `MODE_INFLOW` sets `skipMean` and so omits the mean-zero
re-centring of a pure-Neumann solve. So this was a latent correctness and
display bug — the "Pressure (p)" field view and the CSV pressure column carried
an arbitrary offset — not a corruption of the reported physics. Fixed by a single
shared `src/modes.ts`, pinned to the WASM exports by `tests/modes.test.ts`.

### 5.5 The RVE permeability depends on density — it is still not a measurement

With the diffusion number bounded (§5.1), the same geometry was run two ways at
`N = 64`, `φ = 0.65`, `η = 1e-8`, `n_visc = 24`, both carried to a fully
time-converged steady state:

| | `ρ` [kg/m³] | `ν = μ/ρ` | `K/K_Gebart` at 25 % / 50 % / 100 % of run |
| --- | --- | --- | --- |
| (A) | 1000 | 1e-6 | 0.1454 / 0.1454 / 0.1454 |
| (A-long) | 1000 | 1e-6 | 0.1454 at 3× the duration |
| (B) | 1 | 1e-3 | 0.4660 / 0.4660 / — |

**This is a steady Stokes problem. Density cannot appear in the answer** — the
balance is `0 = −∇p + μ∇²u + f`, and `ρ` enters only the transient. Both runs are
demonstrably at steady state (flat to four digits across the second half of the
run, and unchanged when the duration is tripled). A factor of 3.2 between them is
therefore a defect, not a convergence artefact.

The most likely mechanism is the penalized solid's own Brinkman permeability,
`K_η = ν·η`, which is density-dependent through `ν`: 1e-11 for (B) against 1e-14
for (A). The leakier case (B) does return the higher permeability, which is the
right direction. But a naive area-weighted estimate of that leak accounts for
only a few percent, not 3.2×, so **the mechanism is not confirmed** and the
correct fix — most plausibly scaling `η` with `ν` so `K_η` is a fixed small
fraction of the permeability being measured — has not been validated.

**Status: E6 is NOT a verified measurement and V8 is NOT verified.**
`docs/closure_table.json` therefore carries `"verified": false`, and its `A_2D`
values must not be used to calibrate the macro closure. The macro solver
continues to run on the 3D Ergun constants (`A = 150`, `B = 1.75`), which are
placeholders and are labelled as such. This is a smaller regression than it
sounds: those are exactly the values the macro model used before, because the
"calibrated" table it was supposedly using was fabricated (§5.2).

Outstanding work, in order:
1. Explain the `ρ` dependence; scale `η` with `ν` and re-test.
2. Re-verify against Gebart near `φ_max`, where the benchmark is valid (§5.0).
3. Only then re-run E6 and calibrate `A_2D`.

---

## 6. Review Findings, round 3 — gravity, and two non-convergences

Triggered 2026-08-16 by a user question about the default field view rendering as
one flat colour. The rendering answer is §6.5; getting there involved sweeping 49
mill configurations through the real UI, which surfaced a solver defect (§6.1)
and, once that was fixed, two things that do not converge (§6.3, §6.4).

Sweep integrity: 49 configurations (all 10 presets, plus sweeps in rpm, `K`, `n`,
`τ_y`, `J`, `D`, lifters, `N`, `ε`, `d_p`, `k_slip`, `CFL` and advection scheme),
each run 250 steps through `window.__MILL_APP__` in headless Chromium.
**0 NaN, 0 console errors, no divergence**; `max|∇·u| <= 8.8e-5` throughout.
Every monotonic trend came out with the expected sign: `T` rises with rpm
(0 → 42087 N·m/m over 0 → 300 rpm), with `K` (1402 → 8481 over 1e-4 → 100 Pa·s),
with `n` (1426 → 7207 over 0.2 → 2.0) and with `J` (93 → 3250 over 0 → 0.60);
it falls with `d_p` (3276 → 1775 over 0.5 → 5 mm), with `ε` (2944 → 148 over
0.26 → 0.95) and with `k_slip` (16698 → 49 over 0 → 1); and reversing the
rotation returns `T` negated to the last digit. `χ_bed` coincides with the drawn
chord overlay, and the free surface tilts the correct way for CCW rotation.

### 6.1 Gravity was applied 1/ρ too weak (severity: high) — FIXED

`Solver.subStep` summed two quantities with different units before dividing by
`ρ`:

```ts
const fx = this.bodyFx + this.gx;      // N/m^3  +  m/s^2
u[k] += dt * fx * (1.0/this.rho) * (1.0 - chiFace);
```

`bodyF` is a **force density**: the Poiseuille exact solution
`u = f/(2μ)·y(L−y)` (`tests/phase2_rheology.test.ts:23`) and the Darcy reduction
`K = μU/f` (`assembly/rve.ts:318`) both fix that convention, so `/ρ` is correct
for it. Gravity is an **acceleration** — `NUMERICS.md` step 4 writes
`u* ← u* + Δt·g` and `KERNEL_REFERENCE.md` §10 writes
`u[k] += dt * gx * (1.0 - chiFaceU[k])`, neither with a `1/ρ`. Lumping the two
together divided gravity by the slurry density: at the default `ρ = 1800` the
mill ran on `9.81/1800 = 5.4e-3 m/s²`.

Evidence before the fix, default preset at `t = 1.0 s`:

| `g` [m/s²] | 0 | 9.81 | 30 |
| --- | --- | --- | --- |
| `T` [N·m/m] | 2366.292 | 2366.309 | 2366.343 |

— gravity was inert to five significant figures, and the pressure field carried
no hydrostatic gradient at all (centre-column top-to-bottom difference −1497 Pa,
sign inverted, against `ρgD = 17658 Pa`).

Fixed by dividing only the force density: `a = bodyF/ρ + g`. Nothing in the suite
had ever exercised gravity — every other test calls `setGravity(0, 0)` — so
`tests/phase9_gravity.test.ts` (**V11**) was added:

| Case | Measured | Exact | Tolerance | Result |
| --- | --- | --- | --- | --- |
| V11a closed box `dp/dy`, `ρ = 1800` | −17657.9 Pa/m | −17658.0 Pa/m | 2 % | **0.001 %** |
| V11b `dp/dy` ratio, `ρ` 1000 → 2000 | 2.0000 | 2 | ±2 % | **PASS** |
| V11c mill pressure span at `g = 9.81` | 12956 Pa | `ρg·2R` = 14126 Pa | order of magnitude | **PASS** |

V11b is the assertion that pins the convention: under the old behaviour the
recovered gradient was `ρ·(g/ρ) = g`, i.e. **independent of density**, so the
ratio was 1.

Effect on the mill, measured with the fix in place and Δt matched at 2e-3 s:

| `g` [m/s²] | 0 | 1 | 9.81 | 30 |
| --- | --- | --- | --- | --- |
| `T` [N·m/m] | 2360.0 | 2363.1 | 2390.6 | 2454.4 |
| ΔT vs `g = 0` | — | +0.1 % | **+1.3 %** | +4.0 % |
| pressure span [Pa] | 6146 | 5920 | 15772 | 47176 |

This is the right shape. In a flooded constant-density single-phase mill gravity
is a pure gradient and *should* be dynamically inert, showing up only as
hydrostatic pressure — which is now what happens: the pressure span goes from
purely dynamic (6.1 kPa) to hydrostatic-dominated (15.8 kPa ≈ `ρgD`), while the
torque moves 1.3 %. The residual 1.3 % is the `(1 − χ)` masking required by
`KERNEL_REFERENCE.md` §10, which makes the body force discontinuous at the
immersed shell and therefore not quite a pure gradient. It is left in place: §10
mandates the mask for an independent and also real reason.

**Correction to an interim number.** A first estimate of this effect, made by
injecting `setGravity(0, −ρg)` into the *unfixed* build, reported +82 %. That was
an artefact of the injection: `|g| = 17658` tripped the gravity time-step limit
`Δt <= sqrt(Δx/|g|)`, so that run used Δt = 6.7e-4 s against 2e-3 s for its
baseline, and the difference was Δt, not gravity (see §6.4). The correct figure
is **+1.3 %**.

### 6.2 Body force written to faces the projection cannot correct (severity: low) — FIXED

`applyGradient` (`grid.ts:198–226`) updates `u` only for `i ∈ [1, N−1]` and `v`
only for `j ∈ [1, N−1]` unless that direction is periodic, while
`calcDivergence` *reads* the domain-boundary faces. The body-force loop wrote
all of them, injecting a wall-normal velocity no projection could remove. Now
restricted to the faces `applyGradient` covers — no-penetration means gravity
cannot accelerate fluid through a wall.

Measurably this changed nothing: the mill's box boundary is fictitious solid so
`(1 − χ_face)` was already 0 there, and the cavity result was bit-identical.
Kept because the invariant — never force a face the projection cannot fix — is
the correct one and the next body-force mode would have hit it.

### 6.3 A quiescent box under gravity does not stay quiescent (severity: medium) — OPEN

V11a recovers the hydrostatic gradient to 0.001 % but the fluid is not at rest.
A creeping circulation appears along the side walls:

| | N = 16 | N = 32 | N = 64 |
| --- | --- | --- | --- |
| `max\|u\|` at `t = 4 s` [m/s] | 2.28e-3 | 7.40e-3 | 1.37e-2 |

and it grows with time at fixed `N = 32`: 7.40e-3 (`t = 4 s`), 1.24e-2 (12 s),
1.44e-2 (24 s), 1.58e-2 (48 s) m/s. It is bounded by one step's un-projected
gravity, `g·Δt = 1.96e-2 m/s`, which the tolerance in V11a asserts.

Mechanism, from a parameter scan: it is exactly linear in `g` at fixed `ρ`
(`max|u|/ρg` constant to four digits across `g` = 0.1, 1, 9.81) but **not**
proportional to `ρg` across `ρ` — it *falls* as `ρ` rises — and it grows with
`ν = μ/ρ`, saturating near `g·Δt`. It is independent of `n_visc`, so it is not
the Jacobi diffusion solve. The boundary-face hypothesis was tested and
eliminated (§6.2, bit-identical). **Not diagnosed.**

Impact on the mill is bounded: 2e-2 m/s against a tip speed of 1.57 m/s is ~1 %,
and inside the mill the penalization damps it. But it is a spurious mode that
does not vanish under refinement and it should be understood before the pressure
field is used quantitatively.

### 6.4 The shell torque does not converge in Δt either (severity: high) — OPEN

§3.2 records that `T ∝ 1/N` in space. It does not converge in **time** either.
Default preset, `g = 9.81`, `N = 128`, each run carried to `t = 1.0 s`:

| Δt [s] | 4.0e-3 | 2.0e-3 | 1.0e-3 | 5.0e-4 | 2.5e-4 |
| --- | --- | --- | --- | --- | --- |
| `T` [N·m/m] | 1528.0 | 2390.6 | 3535.7 | 4890.2 | 6362.2 |
| `KE` [J/m] | 1393.2 | 1366.2 | 1335.4 | 1297.6 | 1258.8 |
| `max\|u\|` [m/s] | 1.629 | 1.629 | 1.645 | 1.682 | 1.746 |

`T` rises by ~1.3× per halving of Δt and shows no sign of settling, while the
velocity field it is supposedly measuring moves by 7 % over the same 16× range.
The cause is the same structural one as §3.2: `computeShellTorque` reads the
implicit penalization residual `(u − u_wall)·χ/η`, whose magnitude is set by
`1/(1 + Δt/η)`. With `η = 1e-4` held fixed, shrinking Δt shrinks `Δt/η` and
inflates the residual the torque is computed from. The torque is a function of
`(Δx, Δt, η)`, not of the flow alone.

**This strengthens, and does not change, the §3.2 conclusion:** absolute torque
and power from this model are numerical artefacts. Every table in §3.1 was
generated at one fixed `(N, Δt, η)` and its *trends* remain usable; the levels
are not, and the UI must say so (§6.5).

A proper fix is the same one §3.2 names — the charge must exert drag through a
resolved force distribution rather than a kinematic constraint touching the wall
(assumption A4) — plus tying `η` to Δt so the penalization residual is a fixed
fraction. Both are specification decisions, not patches.

### 6.5 Field rendering: four defects (severity: medium) — SPECIFIED, NOT FIXED

These are UI, i.e. Gemini's to implement; specified as `IMPLEMENTATION_PLAN.md`
Phase 9. Summary:

1. **Degenerate colour range is faked as `[0, 1]`.** Any uniform field trips it.
   The default preset is Newtonian, so `μ_app ≡ 0.1 Pa·s`, and the mill renders
   as flat viridis green — `rgb(94, 201, 98)`, which is 0.75 of the ramp under
   the fabricated span, sampled and confirmed on the canvas. The bar reads
   `0.000 / 0.500 / 1.00`; the data is 0.1 everywhere. **The physics is correct
   and the picture is not.**
2. **Log bars carry linear tick labels.** The midpoint label is the arithmetic
   mean of the endpoints while the colours are log-spaced: for `γ̇` the bar spans
   0.0536–37.40, the label says 18.73, the colour means 1.42 — 13× out.
3. **The default field is one the default preset makes constant**
   (`index.html:25`). Should be `speed`.
4. **`vorticity` is forced onto a symmetric diverging map** although `ω_z` is
   single-signed in a mill turning one way, so half the ramp is unused.

Also unaddressed: `ui/panel.ts:273–274` shows `Shell Torque (T)` and
`Power Draw (P)` with no indication that §3.2 and §6.4 make them mesh- and
time-step-dependent. A caveat belongs next to those two readouts.

### 6.6 The smoke test runs at Δt = 0.1 s and prints its torque anyway (severity: low)

`scripts/smoke.mjs:97` drives the solver with `w.step(0.1)`. That argument is
passed straight through (`index.ts:144`), overriding the adaptive time step, so
the only end-to-end check in the repository runs at **50× the schema maximum**
(`maxDt = 0.01`) and roughly 12× the CFL limit for the default preset
(`CFL·Δx/|u| ≈ 8e-3 s`).

The test still does its job — it proves the bundle loads, the WASM instantiates,
no console errors appear and every diagnostic is finite — and none of those
assertions depend on Δt. But it *prints* `Torque: 155.5 N*m/m` next to them,
against ~2400 N·m/m for the same preset at Δt = 2e-3 s. Given §6.4 that gap is
expected, not a failure; the problem is that a reader has no way to tell. Either
drop the torque and power lines from the smoke output, or label them
"Δt = 0.1 s, not a physical result". Left for Gemini with the Phase 9 UI work.
