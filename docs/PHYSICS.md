# PHYSICS — Governing Equations, Closures and Assumptions

MillDynamics2 solves the **incompressible flow of a single non-Newtonian fluid
phase** (the slurry) inside a rotating ball mill cross-section, in two
dimensions.

---

## 1. Scope and modelling assumptions

These assumptions define what the simulator does and does not represent. State
them in the UI "About" panel; do not let the visualisation imply more than this.

| # | Assumption | Justification / consequence |
| --- | --- | --- |
| A1 | **Single phase.** Only the slurry is a solved continuum. | Required by the brief. No gas phase, therefore **no free surface**: the mill is modelled as *flooded*, i.e. a wet overflow / stirred-media mill running full. A slurry pool with a headspace would require VOF, i.e. two phases. |
| A2 | **2D plane flow** in the mill cross-section, per unit axial length. | Standard for mill cross-section studies. Axial transport and end-wall effects are absent. Note that 2D packings have different permeability constants than 3D ones (see §5.3). |
| A3 | **Grinding media are not resolved at macro scale.** The charge is a *porous zone* with prescribed solid fraction and prescribed velocity. | The 500× scale gap makes resolving 2 mm beads over a 1 m mill (≥4096² cells) impossible in a browser. The media size `d_p` enters explicitly through the permeability, so the 2 mm scale is a real parameter, not decoration. |
| A4 | **Charge motion is kinematic, not dynamic.** The bed region shape is prescribed (fill fraction + dynamic angle of repose) and its velocity is a prescribed rigid rotation with slip. | Media dynamics is exactly what the sister project `MillDynamics` (DEM) computes. v2 deliberately takes charge motion as an *input* so it can spend its budget on the rheology of the fluid. Coupling the two is future work. |
| A5 | **Isothermal, constant density.** | Viscous heating and temperature-dependent rheology are out of scope. |
| A6 | **Laminar / no turbulence model.** | With `μ_app` of order 0.1–100 Pa·s, `Re = ρUD/μ` is typically 10⁰–10³. Shear-thinning slurries in mills are in the laminar-to-transitional range. If a case exceeds `Re ≈ 2000` the UI must warn that the result is under-resolved rather than silently pretending it is a DNS. |
| A7 | **Rigid, impermeable mill shell and lifters**, imposed by volume penalization. | |

---

## 2. Governing equations

Incompressible Navier–Stokes with variable viscosity, plus two body-force
closures:

```
ρ (∂u/∂t + (u·∇)u) = −∇p + ∇·(2 μ_app(γ̇) D) + ρ g + f_porous + f_wall
∇·u = 0
```

with the rate-of-strain tensor and the second invariant

```
D   = ½ (∇u + ∇uᵀ)
γ̇   = sqrt(2 D:D)
```

In 2D, written out for the code:

```
γ̇ = sqrt( 2(∂u/∂x)² + 2(∂v/∂y)² + (∂u/∂y + ∂v/∂x)² )
```

Because `μ_app` varies in space, the viscous term **must not** be simplified to
`μ ∇²u`. The full divergence form is:

```
x: ∂/∂x( 2 μ ∂u/∂x ) + ∂/∂y( μ (∂u/∂y + ∂v/∂x) )
y: ∂/∂x( μ (∂u/∂y + ∂v/∂x) ) + ∂/∂y( 2 μ ∂v/∂y )
```

Gravity `g = (0, −9.81) m/s²`.

---

## 3. Rheology: Herschel–Bulkley with Papanastasiou regularization

```
μ_app(γ̇) = K · γ̇^(n−1) + τ_y · (1 − exp(−m·γ̇)) / γ̇
μ_app ← clamp(μ_app, μ_min, μ_max)
```

| Symbol | Meaning | Unit | Typical range |
| --- | --- | --- | --- |
| `K` | consistency index | Pa·sⁿ | 1e-3 – 10 |
| `n` | flow behaviour index | – | 0.3 – 1.4 |
| `τ_y` | yield stress | Pa | 0 – 100 |
| `m` | Papanastasiou regularization parameter | s | 100 – 10000 |
| `μ_min`, `μ_max` | numerical clamps | Pa·s | 1e-4, 1e3 |

Limits — the code must reproduce these, and the unit tests must check them:

- `γ̇ → 0`: the yield term tends to `τ_y·m` (finite, by L'Hôpital). The power-law
  term diverges for `n < 1`; `μ_max` is what makes the scheme well-posed there.
  **`μ_max` is a numerical parameter, not a physical one** — the experiment plan
  includes a sensitivity study (E7) so its influence is quantified, not assumed
  away.
- `τ_y = 0, n = 1` ⇒ Newtonian with `μ = K`.
- `τ_y = 0` ⇒ power-law (Ostwald–de Waele).
- `n = 1` ⇒ Bingham plastic with plastic viscosity `K`.

Guard the evaluation for small `γ̇`: for `m·γ̇ < 1e-6` use the series
`(1 − exp(−mγ̇))/γ̇ ≈ m (1 − mγ̇/2)` to avoid 0/0.

Also expose the **local stress and yield state**, which are the engineering
outputs that a Newtonian solver cannot give:

```
τ = μ_app · γ̇                      (second invariant of the deviatoric stress)
yielded(x) = 1 if τ > τ_y else 0    ("dead zones" are where this is 0)
```

---

## 4. Geometry and operating conditions

> **All values quoted in this section and the next are defaults, not fixed
> constants.** Mill diameter, lifter dimensions, media diameter, domain size and
> every rheological and numerical parameter are user-adjustable at runtime.
> `PARAMETERS.md` is the authoritative list with ranges; nothing may be
> hard-coded.

### 4.1 Mill

- Mill diameter `D` (default 1.0 m), radius `R = D/2`, centre `x_c = (L/2, L/2)`.
- Computational box `L × L` with `L = D·(1 + 2·margin)`, `margin` default 0.012.
  At the default `D = 1.0 m` this gives `L = 1.024 m`, so that
  `N = 512 ⇒ Δx = 2.0 mm` exactly matches the nominal media diameter — a
  convenient alignment, not a requirement. Everything outside the mill circle is
  solid.
- Shell angular velocity `ω` [rad/s], counter-clockwise positive.

### 4.2 Critical speed

```
N_c = (1/2π) · sqrt( g / (R − r_media) )   [rev/s]
```

For `R = 0.5 m`, `r_media = 1 mm`: `N_c = 0.7056 rev/s = 42.34 rpm`.
The UI takes speed as **% of critical**; typical operation is 65–80 %.

### 4.3 Lifters

`n_L` radial bars on the shell (default 8), height `h_L` (default 25 mm), width
`w_L` (default 20 mm), face angle `α_L` (default 0°), rotating rigidly with the
shell. They are part of the solid mask `χ`. `n_L = 0` is a valid configuration
(smooth shell) and is used by verification case V7.

### 4.4 Wall motion

Every solid cell (shell, lifters, exterior) moves with

```
u_wall(x) = ω × (x − x_c)   ⇒   (u, v) = ω · (−(y−y_c), (x−x_c))
```

except the exterior region beyond the shell, where `u_wall = 0` is equally
valid (it is never in contact with fluid). Use the rotating value everywhere
inside `r ≤ R + 2Δx` for a clean no-slip surface.

---

## 5. Media bed closure (macro scale)

### 5.1 Bed region

The charge occupies a region `Ω_bed` defined geometrically:

- fill fraction `J` (fraction of mill cross-sectional area occupied by the
  charge, default 0.30),
- the free boundary of the charge is a **chord inclined at the dynamic angle of
  repose `θ_r`** (default 40°) from horizontal, tilted in the direction of
  rotation,
- the chord offset is solved (1D bisection at setup) so that the enclosed area
  equals `J · πR²`.

`Ω_bed` is fixed in the laboratory frame; the material inside it circulates.
That is a steady-state charge model, consistent with A4.

Bed solid fraction `1 − ε`, default `ε = 0.40` (random close packing of spheres).
A smooth transition of width `2Δx` at the bed boundary avoids a discontinuous
source term.

### 5.2 Bed velocity

```
u_media(x) = k_slip · ω × (x − x_c),   k_slip ∈ [0.6, 1.0], default 0.85
```

The relative velocity that drives the drag is `u_rel = u − u_media`.

### 5.3 Darcy–Forchheimer / Ergun drag

Force per unit volume on the fluid inside `Ω_bed`:

```
f_porous = − [ A · μ_eff (1−ε)² / (ε³ d_p²)  +  B · ρ (1−ε) |u_rel| / (ε³ d_p) ] · u_rel
```

with the equivalent permeability

```
K_perm = ε³ d_p² / ( A (1−ε)² )
```

**The constants `A` and `B` are NOT 150 and 1.75 in two dimensions.** Those are
the 3D packed-bed Ergun values. A 2D array of discs has a different tortuosity
and a different permeability–porosity relation. Therefore:

- default `A = 150`, `B = 1.75` as a placeholder,
- the true 2D values `A_2D(ε)`, `B_2D(ε)` are **measured** by the micro-scale RVE
  study (experiment E6) and written to `docs/closure_table.json`, which the
  macro solver loads,
- for regular hexagonal packing of discs the analytical permeability of
  Gebart (1992) provides an independent check:

  ```
  K / R_b² = (4 / (9π√6)) · ( sqrt(φ_max/φ) − 1 )^(5/2),
  φ_max = π / (2√3) ≈ 0.9069,  R_b = d_p/2,  φ = solid fraction
  ```

This is the single most important scientific reason the project has a micro
scale at all: it turns a borrowed 3D correlation into a measured 2D closure.

### 5.4 Non-Newtonian effective viscosity in the porous zone

`μ_app` is a function of the *resolved* shear rate, but inside a porous zone the
real shear happens in pores that the macro grid cannot see. Evaluate the drag
viscosity at a **pore shear rate**:

```
γ̇_pore = C_γ · |u_rel| / ( ε · sqrt(K_perm) )
μ_eff   = μ_app( max(γ̇_resolved, γ̇_pore) )
```

`C_γ` is an O(1) constant, default 1.0, **calibrated by E6**. Compare the
resulting law against the Christopher–Middleman power-law porous-media
correlation as a sanity check (reference, not a hard requirement).

Sanity figures for the default case (`ε = 0.4`, `d_p = 2 mm`, `A = 150`):
`K_perm = 4.74e-9 m²`, `sqrt(K_perm) = 6.9e-5 m`. At `|u_rel| = 0.1 m/s`,
`γ̇_pore ≈ 3.6e3 s⁻¹` — i.e. the slurry in the bed is strongly sheared and a
shear-thinning slurry will be far less viscous there than in the free region.
Reproducing that contrast is a headline result of the simulator.

---

## 6. Solid boundaries: Brinkman volume penalization

Rather than body-fitted meshing of a rotating, lifter-bearing circle, solids are
imposed on the Cartesian grid by a penalization force:

```
f_wall = − (χ / η) · (u − u_wall)
```

`χ ∈ [0,1]` is the solid mask (smoothed over `2Δx` to reduce staircasing) and
`η` is the penalization time, default `1e-4 s`. The error of the method is
`O(sqrt(η ν))`, so `η` must be small — but it is applied **implicitly**
(§NUMERICS) so small `η` costs nothing in stability.

---

## 7. Micro scale (RVE)

A separate solver instance on a periodic square patch:

- domain `51.2 mm × 51.2 mm`, `N = 512`, `Δx = 0.1 mm` ⇒ a 2 mm bead is 20 cells
  across (well resolved),
- `≈ 300–500` non-overlapping discs of diameter `d_p`, either random (Poisson
  disc sampling, rejection) or regular hexagonal, at target solid fraction
  `1 − ε ∈ [0.35, 0.62]`,
- discs are stationary rigid solids via the same Brinkman penalization,
- periodic in both directions, flow driven by a uniform body force `f_x`,
- same Herschel–Bulkley rheology.

Measured quantities:

```
U_superficial = (1/Area) ∫ u dA          (volume average over the whole patch)
Δp/L equivalent = ρ f_x                  (driving force balances drag at steady state)
```

Sweeping `f_x` gives the pressure-drop/velocity curve, which is fitted to the
Darcy–Forchheimer form to extract `A_2D`, `B_2D` and `C_γ`. For a
yield-stress fluid the curve additionally has a **threshold**: no flow until the
driving force exceeds a critical value set by `τ_y`. Measuring that threshold is
a genuine result, and is why this project models yield stress at all.

---

## 8. Engineering diagnostics

| Quantity | Definition |
| --- | --- |
| Shell torque `T` [N·m/m] | `Σ_cells (r × F_pen) Δx²`, where `F_pen = −ρ f_wall` is the reaction on the wall, summed over shell + lifter cells |
| Power draw `P` [W/m] | `T · ω` |
| Mean/max shear rate | area-weighted statistics of `γ̇`, separately for bed and free regions |
| Shear-rate histogram | 32 log-spaced bins, `γ̇ ∈ [1e-2, 1e5] s⁻¹` — grinding intensity distribution |
| Yielded fraction | area fraction where `μ_app·γ̇ > τ_y` |
| Apparent viscosity field | `μ_app`, rendered directly — the shear-thinning structure is the point of the whole simulation |
| Bed pressure drop | `p` difference across `Ω_bed` along the flow direction |
| Kinetic energy | `½ρ ∫ |u|² dA` — used as a steady-state detector |
| `max |∇·u|` | correctness monitor, must stay `< 1e-4 · U_ref/Δx` |
| Reynolds number | `ρ U_tip D / μ_app_mean` — displayed with the A6 warning above 2000 |

Steady state is declared when the 1-second relative change of kinetic energy and
of torque are both below 1 %.

---

## 9. References

1. Ghia, Ghia & Shin (1982), *J. Comput. Phys.* 48, 387 — lid-driven cavity benchmark data.
2. Papanastasiou (1987), *J. Rheol.* 31, 385 — exponential regularization of yield stress.
3. Ergun (1952), *Chem. Eng. Prog.* 48, 89 — packed-bed pressure drop.
4. Gebart (1992), *J. Composite Materials* 26, 1100 — permeability of regular fibre arrays (2D).
5. Christopher & Middleman (1965), *I&EC Fundamentals* 4, 422 — power-law flow in porous media.
6. Dennis & Chang (1970), *J. Fluid Mech.* 42, 471 — steady flow past a cylinder, Re = 5–100.
7. Angot, Bruneau & Fabrie (1999), *Numer. Math.* 81, 497 — analysis of volume penalization.
8. Morrell (1996), *Trans. IMM* 105, C43 — mill power draw model (context for §8, not a target).
