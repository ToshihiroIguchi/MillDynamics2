# EXPERIMENT PLAN

Three parts:

- **U1–U12 — Operator tests.** Is each individual kernel correct, *in
  isolation*? These run in milliseconds, need no physics, and most compare
  against machine precision. **They exist so that a failure tells you which
  module is broken.** Write the U test for a kernel in the same commit as the
  kernel — never after.
- **V1–V10 — Verification.** Does the solver solve the equations correctly?
  Every case has an analytical solution or published benchmark data, and a
  numeric tolerance. These are automated Vitest tests and they gate the CI build.
- **E1–E7 — Numerical experiments.** Given a correct solver, what does it say
  about slurry flow in a ball mill? These are batch runs producing CSV and are
  the scientific content of the project.

Results go in `docs/VALIDATION.md` as **measured value / tolerance / verdict**.
An experiment reported without a number is not reported.

---

# Part 0 — Operator tests (fast, isolating)

Every V case exercises six modules at once, so a V failure tells you almost
nothing about *where* the bug is. These tests exercise one kernel each. If a V
case fails while all U tests pass, the bug is in the coupling; if a U test fails,
you know the file.

Most of these are exact to machine precision because they exploit an algebraic
property rather than a numerical solution. **Exact tests are worth far more than
approximate ones** — there is no tolerance to argue with.

| # | What | Setup | Expected | Tolerance |
| --- | --- | --- | --- | --- |
| **U1** | Divergence operator | `u = (sin kx·cos ky, −cos kx·sin ky)` (divergence-free) | `∇·u = 0` | < 1e-12 |
| **U2** | Divergence, 2nd order | `u = (x², 0)` ⇒ `∇·u = 2x` | order ≥ 1.9 over 64/128/256 | — |
| **U3** | Gradient / divergence adjointness | random `p`, random `u` | `⟨∇p, u⟩ = −⟨p, ∇·u⟩` | < 1e-12 |
| **U4** | Poisson, manufactured solution | `φ = cos(mπx/L)·cos(mπy/L)`, `b = ∇²φ = −2(mπ/L)²φ` | recovers `φ` after mean removal; order ≥ 1.9 | 1 % at 128² |
| **U5** | Poisson null space | `b = 0`, random initial `φ` | converges to a constant; `‖∇φ‖ → 0` | < 1e-10 |
| **U6** | Poisson operator symmetry | random `a`, `b` | `⟨a, Lb⟩ = ⟨b, La⟩` | < 1e-12 |
| **U7** | Projection idempotence | random `u`; project twice | `‖∇·u‖ → 0` after the first; the second changes nothing | < 1e-10 |
| **U8** | Advection, uniform translation | Gaussian blob, uniform `U`, periodic, one full traverse | position error < 0.5 Δx; **report peak retention** | see below |
| **U9** | Advection, solid-body rotation | blob rotated one full revolution about the centre | shape recovered; **report peak retention** | see below |
| **U10** | Strain rate, exact | `u = (y, 0)` ⇒ `γ̇ = 1`; `u = (x, −y)` ⇒ `γ̇ = 2` | exact | < 1e-12 |
| **U11** | Viscous operator null space | uniform translation `u = (c₁, c₂)`; and rigid rotation `u = ω(−y, x)` | `∇·(2μD) = 0` in both cases, for **variable** `μ` | < 1e-10 |
| **U12** | Penalization, exact relaxation | fully solid cell, `u_wall = 0`, no other force, `n` steps | `u = u₀·(1 + Δt/η)^(−n)` | < 1e-12 |

Notes on the two that have no absolute threshold:

- **U8/U9 peak retention**: there is no universally correct value, so do not
  invent one. Instead run *both* schemes on the same problem and report the
  ratio: MacCormack must retain substantially more peak amplitude than
  first-order semi-Lagrangian. If the two are within a few percent of each other,
  the MacCormack correction is not actually being applied — which is precisely
  the bug that later makes V1 fail at Re = 1000 while passing at Re = 100.
  This is why the first-order scheme is kept as a selectable option.

- **U11 is the highest-value test in this table.** A rigid-body motion produces
  zero rate of strain, so the variable-viscosity stress divergence must vanish
  identically — regardless of how `μ` varies. Almost every stencil error in
  `diffuse.ts` (wrong node/centre placement, a missing cross term, a sign slip)
  breaks it, and it costs nothing to check.

- **U3 and U6** catch boundary-stencil errors that interior-point tests miss,
  including the `cnt` vs. hard-coded `4.0` mistake flagged in
  `KERNEL_REFERENCE.md` §6.

---

# Part 1 — Verification (automated, gates CI)

## V1 — Lid-driven cavity vs. Ghia, Ghia & Shin (1982)

Newtonian, square cavity, top lid at `U = 1`, `Re = ρUL/μ ∈ {100, 400, 1000}`.

- Grid: 128² for Re = 100, 400; 256² for Re = 1000.
- Run to steady state (KE change < 0.01 %/s), fixed `Δt`.
- Compare `u(y)` on the vertical centreline and `v(x)` on the horizontal
  centreline against the published tables.
- **Embed the actual table from the paper** in `tests/data/ghia1982.json` at the
  17 tabulated `y` locations. Do not use remembered values.

| Tolerance | Re = 100 | Re = 400 | Re = 1000 |
| --- | --- | --- | --- |
| max abs. deviation in `u`, `v` | 0.030 | 0.040 | 0.060 |

Also check the primary vortex centre is within `0.02L` of the published position.

*Why it matters*: this is the single test that catches an over-diffusive
advection scheme. If MacCormack degenerates to first-order semi-Lagrangian, Re =
1000 fails loudly while Re = 100 still passes — which is exactly why all three Re
are in the suite.

## V2 — Power-law Poiseuille flow (analytical)

Steady flow between parallel plates at half-height `H`, driven by a constant
pressure gradient `G = −dp/dx`. Periodic in `x`, no-slip walls via penalization.

```
u(y) = (n/(n+1)) · (G/K)^(1/n) · ( H^((n+1)/n) − |y|^((n+1)/n) )
u_mean = (n/(2n+1)) · (G/K)^(1/n) · H^((n+1)/n)
```

- `n ∈ {0.5, 1.0, 1.5}`, `τ_y = 0`.
- Grids 64 / 128 / 256 for the convergence study.

| Metric | Tolerance |
| --- | --- |
| L2 error in `u` at 128² | < 1 % of `u_max` |
| Spatial order of convergence | ≥ 1.8 |
| `u_mean` error | < 1 % |

## V3 — Bingham / Herschel–Bulkley plug flow (analytical)

Same geometry, `n = 1`, `K = μ_p`, `τ_y > 0`. Flow exists only when `G·H > τ_y`.
Plug half-width `y₀ = τ_y/G`.

```
u(y)   = (G/(2μ_p))(H² − y²) − (τ_y/μ_p)(H − y),   y₀ ≤ |y| ≤ H
u_plug = (G/(2μ_p))(H − y₀)²
```

| Metric | Tolerance |
| --- | --- |
| Plug half-width (first cell where `γ̇ > 1/m`) | < 2 % of `y₀` |
| `u_plug` | < 2 % |
| `γ̇` inside the plug | < `1/m` |
| No-flow case (`G·H < 0.9 τ_y`): `u_max` | < 1e-3 · reference |

The last row is the important one: a regularized yield-stress model that creeps
when it should be rigid is a common and quiet failure.

## V4 — Taylor–Green vortex decay (analytical, periodic)

```
u = −cos(kx) sin(ky) e^(−2νk²t)
v =  sin(kx) cos(ky) e^(−2νk²t)
p = −(ρ/4)(cos 2kx + cos 2ky) e^(−4νk²t)
```

- Periodic box, Newtonian, no gravity, no geometry.
- Fixed `Δt`; measure the decay of `‖u‖₂` over 1 s.

| Metric | Tolerance |
| --- | --- |
| Decay-rate error | < 2 % |
| Spatial order (64/128/256) | ≥ 1.8 |
| Temporal order (`Δt`, `Δt/2`, `Δt/4`) | ≥ 0.9 (first-order projection is expected) |

## V5 — Discrete incompressibility

Run the baseline mill preset for 1000 steps at `N = 256`.

| Metric | Tolerance |
| --- | --- |
| `max |∇·u| · Δx / U_ref` at every step | < 1e-4 |
| Drift in that quantity over 1000 steps | none (no monotone growth) |

## V6 — Flow past a stationary cylinder vs. Dennis & Chang (1970)

Validates Brinkman penalization against a curved boundary.

- Uniform inflow, `Re = ρU d/μ ∈ {20, 40}`, blockage ratio ≤ 5 %,
  `d ≥ 20 Δx`.
- Reference: `Re = 20` → `C_D ≈ 2.05`, wake length `L/d ≈ 0.94`;
  `Re = 40` → `C_D ≈ 1.52`, `L/d ≈ 2.35`. **Confirm these against the paper
  before hard-coding them.**

| Metric | Tolerance |
| --- | --- |
| `C_D` | 10 % |
| Recirculation length | 15 % |

## V7 — Taylor–Couette torque (analytical)

Validates the rotating penalized wall **and** the torque diagnostic together —
torque is the project's headline output, so it needs its own analytical check.

- Concentric cylinders `R_i`, `R_o`, inner (or outer) rotating at `ω`, Newtonian,
  laminar. `u_θ(r) = Ar + B/r`.
- Torque per unit length: `T = 4π μ ω R_i² R_o² / (R_o² − R_i²)`.

| Sub-case | Metric | Tolerance |
| --- | --- | --- |
| V7a Newtonian torque at 256² | `T` | 5 % |
| V7b Solid-body rotation in a closed rotating cylinder after 20 revolutions | rel. velocity error | 2 % |
| V7c Power-law fluid, `γ̇` at the inner cylinder `= 2ω / (n(1 − (R_i/R_o)^(2/n)))` | `γ̇_i` | 5 % |
| V7d Penalization convergence, `η ∈ {1e-3, 1e-4, 1e-5}` | V7a error decreases monotonically | — |

## V8 — Permeability of a regular disc array vs. Gebart (1992)

Validates the RVE and, with it, the whole basis of the macro porous closure.

```
K / R_b² = (4/(9π√6)) · ( sqrt(φ_max/φ) − 1 )^(5/2),   φ_max = π/(2√3) ≈ 0.9069
```

- Hexagonal packing, `d_p = 2 mm`, `Δx = 0.1 mm`, Newtonian, low Reynolds
  (`Re_p < 0.1`), periodic, body-force driven, measure `K = μ U / (ρ f_x)`.
- Solid fractions `φ ∈ {0.30, 0.40, 0.50, 0.60}`.

| Metric | Tolerance |
| --- | --- |
| `K` vs. Gebart | 20 % |
| Error under refinement (Δx = 0.2 → 0.1 → 0.05 mm) | monotonically decreasing |

## V9 — Robustness

- All presets, 60 s simulated, `N ∈ {128, 256, 512}`: no `NaN`/`Inf` in any
  field or diagnostic; `μ_app` stays within `[μ_min, μ_max]`; KE bounded.
- Adversarial parameters: `n = 0.3`, `τ_y = 200 Pa`, `ω = 0`, `ω = 3ω_c`,
  `J = 0`, `J = 0.6`, `d_p = 0.1 mm`, `ρ = 500` and `ρ = 4000` — the solver must
  survive all of them, degrading rather than exploding.
- `Δt → 0` and `n_sub = 8`: results converge, do not change qualitatively.

## V10 — Performance

Release build, dev machine, single thread. Report **measured** FPS and a
per-stage millisecond breakdown (advect / diffuse / porous+penalize / multigrid /
diagnostics / render) at `N ∈ {128, 256, 512}`. Targets are in
`NUMERICS.md` §10 — record what is actually achieved.

---

# Part 2 — Numerical experiments (batch, scientific output)

All runs: baseline geometry `D = 1 m`, `d_p = 2 mm`, `N = 256` unless stated,
run to steady state or 20 s simulated, whichever first. Every run writes a CSV
with the full parameter metadata block.

## E1 — Rheology sweep (the core experiment)

| Parameter | Values |
| --- | --- |
| `n` | 0.4, 0.6, 0.8, 1.0, 1.2 |
| `τ_y` [Pa] | 0, 5, 20, 50 |

20 runs. Outputs: power draw, mean/max `γ̇` in the bed and the free region,
**yielded area fraction**, `μ_app` distribution, bed pressure drop.

Questions this answers:
- How much does shear-thinning reduce power draw at fixed speed?
- At what yield stress do dead zones appear, and where — core, corners, or
  behind lifters?
- Is the shear-rate distribution (the grinding-intensity proxy) narrowed or
  broadened by shear-thinning?

Deliverable: a `τ_y` × `n` heatmap of yielded fraction and of power draw.

## E2 — Mill speed sweep

`% N_c ∈ {40, 55, 65, 75, 85, 95, 110}`, baseline rheology, `J = 0.30`.
Outputs: power vs. speed curve, flow regime description, mean `γ̇`.

**Honest framing required**: this is the power dissipated in the *slurry* with a
*prescribed* charge motion. It is not the total mill power draw, and it must not
be plotted against Hogg–Fuerstenau or Morrell as though it were the same
quantity. Compare the *shape* of the trend, and say so explicitly.

## E3 — Fill level

`J ∈ {0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45}`, baseline. Outputs: power,
yielded fraction, bed pressure drop, recirculation pattern.

## E4 — Media size (the 2 mm-scale question)

`d_p ∈ {0.5, 1, 2, 5} mm` at fixed `ε = 0.40`. Since `K_perm ∝ d_p²`, this spans
a 100× permeability range.

Outputs: slurry penetration depth into the bed, bed pressure drop, `γ̇_pore`,
power split between bed and free region. This is the experiment that gives the
"2 mm media" requirement physical meaning at the macro scale.

## E5 — Grid convergence

`N ∈ {128, 256, 512}` (Δx = 8, 4, 2 mm), baseline preset, identical `Δt`.

Acceptance: torque differs by < 5 % between 256 and 512. If not, the default
resolution moves to 512 and the reason is recorded. Report Richardson
extrapolation of torque and of yielded fraction.

## E6 — RVE closure calibration (feeds the macro model)

The micro scale exists for this.

| Parameter | Values |
| --- | --- |
| Solid fraction `1−ε` | 0.36, 0.40, 0.45, 0.50, 0.60 |
| Packing | random (3 seeds), hexagonal |
| `Re_p = ρ U d_p / μ` | 0.01 → 100, 8 log-spaced points |
| `n` | 0.6, 1.0 |
| `τ_y` [Pa] | 0, 10 |

Procedure per configuration: sweep the driving body force, record superficial
velocity at steady state, fit

```
ρ f_x = A_2D · μ_eff (1−ε)²/(ε³ d_p²) · U + B_2D · ρ (1−ε)/(ε³ d_p) · U²
```

by least squares in `scripts/fit_closure.py`, extracting `A_2D(ε)`, `B_2D(ε)` and
the pore-shear-rate constant `C_γ` (fitted from the non-Newtonian cases).

Outputs → `docs/closure_table.json`, loaded by the macro solver at startup.

Additional result, for yield-stress cases: the **critical pressure gradient**
below which there is no flow through the bed. This has no counterpart in a
Newtonian model and is a genuine finding of the study.

Expected outcome to state plainly: `A_2D ≠ 150` and `B_2D ≠ 1.75`. The 3D Ergun
constants are placeholders, and reporting the measured 2D values is a result, not
a discrepancy to be explained away.

## E7 — Regularization sensitivity (numerical honesty)

| Parameter | Values |
| --- | --- |
| Papanastasiou `m` [s] | 50, 500, 5000, 50000 |
| `μ_max` [Pa·s] | 1e2, 1e3, 1e4 |
| Viscous iterations | 8, 24, 64 |

Report how yielded fraction, plug width (V3 geometry) and power draw depend on
these purely numerical parameters, and the fraction of cells sitting on the
`μ_max` clamp in the baseline mill case.

Acceptance: between `m = 5000` and `m = 50000` the yielded fraction changes by
< 2 %, i.e. the reported physics is converged with respect to the
regularization. If it is not, the default `m` increases and the finding is
recorded.

---

## Reporting format for `docs/VALIDATION.md`

```markdown
### V2 — Power-law Poiseuille
| Case | Metric | Measured | Tolerance | Verdict |
|---|---|---|---|---|
| n=0.5, 128² | L2 error | 0.42 % | < 1 % | PASS |
| n=1.0, 128² | L2 error | 0.11 % | < 1 % | PASS |
| n=1.5, 128² | L2 error | 0.67 % | < 1 % | PASS |
| convergence  | order    | 1.94   | ≥ 1.8 | PASS |
Notes: ...
```

Every V case gets a table like this. Every E case gets a table or a chart plus
two or three sentences of interpretation. Deviations from the specification go in
a final "Deviations from spec" section with the measured value, the tolerance
that was missed, and the diagnosis.
