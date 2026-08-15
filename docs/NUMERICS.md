# NUMERICS — Discretisation and Solver Algorithms

Companion to `PHYSICS.md`. Everything here is a specification for
`assembly/`; the tolerances that prove it works are in `EXPERIMENT_PLAN.md`.

---

## 1. Grid

**Staggered MAC (Marker-and-Cell) grid**, uniform, Cartesian, square cells.

```
N   = cells per side (128 / 256 / 512; powers of two only, required by multigrid)
L   = domain size [m]        Δx = L / N
p, μ, γ̇, χ, bed  : cell centres,   N × N          index c(i,j) = i + j*N
u  (x-velocity)  : vertical faces, (N+1) × N      index u(i,j) = i + j*(N+1)
v  (y-velocity)  : horizontal faces, N × (N+1)    index v(i,j) = i + j*N
μ_node           : cell corners,   (N+1) × (N+1)  index n(i,j) = i + j*(N+1)
```

Cell centre position: `x = (i + 0.5)Δx`, `y = (j + 0.5)Δx`.
`u(i,j)` sits at `x = iΔx`, `y = (j+0.5)Δx`. `v(i,j)` sits at `x = (i+0.5)Δx`,
`y = jΔx`.

Why staggered: it kills the checkerboard pressure mode without any
pressure-stabilisation hack, and it puts `∂u/∂y` and `∂v/∂x` naturally at the
same corner point, which is exactly what the variable-viscosity shear stress
needs.

**Boundary conditions on the box**: the mill is strictly inside the box and the
exterior is solid, so the outer boundary never matters physically. Use
`Neumann (∂p/∂n = 0)` for pressure and no-slip for velocity. The RVE solver
overrides both with **periodic** wrapping — implement the index helpers so that
periodicity is a flag, not a duplicated kernel.

---

## 2. Time integration — fractional step (Chorin projection)

Per step, given `uⁿ`:

```
1.  γ̇ ← strainRate(uⁿ)                     # cell centres and corners
2.  μ ← rheology(γ̇)                        # clamped Herschel–Bulkley
3.  u* ← advect(uⁿ)                        # MacCormack semi-Lagrangian
4.  u* ← u* + Δt · g                       # gravity
5.  u* ← porousDrag(u*)                    # implicit, pointwise
6.  u** ← diffuse(u*, μ)                   # implicit variable-viscosity Helmholtz
7.  u*** ← penalize(u**)                   # implicit Brinkman
8.  solve ∇²φ = (ρ/Δt) ∇·u***              # geometric multigrid
9.  uⁿ⁺¹ ← u*** − (Δt/ρ) ∇φ ;  p ← φ
10. diagnostics(uⁿ⁺¹, μ, γ̇)
```

Order matters: penalization is applied **after** diffusion and **before**
projection, so the projection removes the divergence that penalization
introduces. This is the standard, stable ordering for volume-penalized
projection methods. A small residual slip at the wall (`O(sqrt(ην))`) remains and
is expected; V7 quantifies it.

### 2.1 Time step

```
Δt_cfl  = CFL · Δx / max(|u|, |v|, |u_wall|_max)      CFL = 2.0 (semi-Lagrangian tolerates >1)
Δt_grav = sqrt(Δx / |g|)
Δt      = min(Δt_cfl, Δt_grav, Δt_max)                Δt_max = 2e-3 s
```

No viscous restriction, because diffusion is implicit (§5). `max` over the
*fluid* region only (`χ < 0.5`); the wall velocity enters through
`|u_wall|_max = ω R`.

Fixed-`Δt` mode must also exist for the verification tests (temporal order
studies need it).

Per rendered frame, take `n_sub` steps (default 2, UI-selectable 1–8) and
render once.

---

## 3. Advection — MacCormack / BFECC semi-Lagrangian

Unconditionally stable, which is what makes an interactive browser solver
possible, but first-order semi-Lagrangian is far too diffusive for a mill
(it would smear exactly the shear layers we want to see). Use MacCormack:

```
φ̂     = SL_backward(φⁿ, Δt)
φ̃     = SL_forward(φ̂, Δt)
φⁿ⁺¹  = φ̂ + (φⁿ − φ̃) / 2
```

then **clamp** `φⁿ⁺¹` to the min/max of the 4 (2D: 4) source cells used by the
backward trace. Without the clamp MacCormack is not monotone and will produce
overshoots at the lifter edges that look like — and become — instabilities.

Trace with RK2 (midpoint) in the velocity field, sampling velocity bilinearly at
the staggered locations. Advect `u` and `v` in separate passes, each sampling the
full velocity field, into temporary buffers allocated once.

**Do not advect inside solid cells**; overwrite them with `u_wall` afterwards
(step 7 does this anyway, but skipping the work saves ~10 %).

---

## 4. Strain rate and viscosity

At cell centres:

```
dudx(i,j) = ( u(i+1,j) − u(i,j) ) / Δx
dvdy(i,j) = ( v(i,j+1) − v(i,j) ) / Δx
```

At cell corners (nodes):

```
dudy(i,j) = ( u(i,j) − u(i,j−1) ) / Δx
dvdx(i,j) = ( v(i,j) − v(i−1,j) ) / Δx
```

Shear rate at cell centres needs the corner terms averaged in:

```
s_node(i,j) = dudy(i,j) + dvdx(i,j)
s_c(i,j)    = ¼ ( s_node(i,j) + s_node(i+1,j) + s_node(i,j+1) + s_node(i+1,j+1) )
γ̇_c(i,j)    = sqrt( 2 dudx² + 2 dvdy² + s_c² )
```

Evaluate `μ_c = μ_app(γ̇_c)` at centres, then get corner viscosity by
**arithmetic average of the 4 surrounding centres** (harmonic averaging is
better for sharp jumps but is unnecessary here and costs a division per node).
Clamp before averaging, not after.

---

## 5. Diffusion — implicit, variable viscosity

Explicit diffusion is not an option. With `Δx = 2 mm`, `ρ = 1800`, and
`μ_max = 1000 Pa·s`, `Δt_visc = ρΔx²/(4μ_max) ≈ 1.8e-6 s` — a thousand
sub-steps per frame. Use **backward Euler with frozen coefficients**:

```
( I − (Δt/ρ) L_μ ) u** = u*
```

where `L_μ` is the discrete variable-viscosity operator from `PHYSICS.md` §2.
For the `u` component at face `(i,j)`:

```
L_μ u |(i,j) = [ 2μ_c(i,j) (u(i+1,j)−u(i,j)) − 2μ_c(i−1,j) (u(i,j)−u(i−1,j)) ] / Δx²
             + [ μ_n(i,j+1) ( (u(i,j+1)−u(i,j))/Δx + (v(i,j+1)−v(i−1,j+1))/Δx )
               − μ_n(i,j)   ( (u(i,j)−u(i,j−1))/Δx + (v(i,j)−v(i−1,j))/Δx ) ] / Δx
```

(and the mirror image for `v`). Solve with **damped Jacobi**, `ω_damp = 0.8`,
`n_iter = 24` by default, treating the cross-derivative `v` terms as an explicit
right-hand side (they change slowly and this keeps the system diagonal). The
diagonal is

```
diag_u(i,j) = 1 + (Δt/(ρΔx²)) · ( 2μ_c(i,j) + 2μ_c(i−1,j) + μ_n(i,j+1) + μ_n(i,j) )
```

which is `≥ 1` and diagonally dominant, so damped Jacobi always converges.
Backward Euler is unconditionally stable regardless of iteration count — an
under-converged solve is merely *less accurate*, never unstable. That is the
property that lets the UI trade `n_iter` for FPS safely; expose it as a
"viscous solver iterations" quality slider and record it in exported CSV.

Jacobi needs a second buffer per component; allocate both at construction and
ping-pong.

---

## 6. Porous drag — implicit pointwise

Treating Ergun drag explicitly is a stiffness trap: `μ/K_perm` with
`K_perm ~ 5e-9 m²` gives a relaxation time of nanoseconds. It is pointwise and
linear in `u_rel` if `|u_rel|` is lagged, so make it implicit exactly:

```
a  = [ A μ_eff (1−ε)²/(ε³ d_p²) + B ρ (1−ε)|u_rel|ⁿ/(ε³ d_p) ] / ρ      [1/s]
u* = ( u + Δt·a·u_media ) / ( 1 + Δt·a )
```

Interpolate `ε`, `A`, `B` and the bed indicator to the faces. Outside the bed
`a = 0` and the expression is the identity, so no branching is needed in the
inner loop.

---

## 7. Brinkman penalization — implicit pointwise

Same treatment, same reason:

```
u*** = ( u** + (Δt/η)·χ·u_wall ) / ( 1 + (Δt/η)·χ )
```

Unconditionally stable for any `η > 0`, so `η = 1e-4 s` is free. `χ` is
evaluated at faces by averaging the two adjacent cell-centre values, and is
**smoothed**:

```
χ(x) = ½ ( 1 − tanh( sdf(x) / (Δx) ) )
```

where `sdf` is the signed distance to the solid surface (positive outside).
Precompute `χ` for the shell (static in the rotating sense — the circle is
axisymmetric so it never changes) and recompute only the **lifter** mask each
step, from the current shell angle `θ = ω t`. Lifters are the only moving part
of the geometry; rebuilding just their mask keeps the per-step geometry cost to
a few thousand cells instead of `N²`.

---

## 8. Pressure projection — geometric multigrid

Constant density ⇒ constant-coefficient Poisson:

```
∇²φ = (ρ/Δt) ∇·u***
u ← u − (Δt/ρ) ∇φ
```

**Do not mask the Poisson operator.** Solve over the entire box including solid
cells: with volume penalization the interior of a solid is a fictitious region
whose flow is irrelevant, and a uniform-coefficient Poisson problem is what makes
plain geometric multigrid fast and trivially correct. Masking would buy a small
accuracy gain at the cost of variable coefficients and a much harder coarse-grid
operator.

**V-cycle**:

| Setting | Value |
| --- | --- |
| Smoother | red–black Gauss–Seidel |
| Pre / post smoothing | 2 / 2 sweeps |
| Restriction | full weighting |
| Prolongation | bilinear |
| Coarsest level | 4×4, 50 GS sweeps |
| Cycles per step | up to 6, exit early when `‖r‖₂ / ‖b‖₂ < 1e-5` |

Pure-Neumann compatibility: the right-hand side must be made mean-zero
(`b ← b − mean(b)`) and `φ` re-centred after each cycle, otherwise the solve
drifts. This is the single most common bug in this kind of solver — the V5
divergence test exists to catch it.

Pre-allocate the full level hierarchy (`φ`, `b`, `r` per level) at construction.
Total extra memory is `4/3 · N²` per array.

---

## 9. Memory budget

At `N = 512` each `N²` `f64` field is 2.1 MB.

| Group | Arrays | Approx. |
| --- | --- | --- |
| Velocity (`u`, `v` + 3 temporaries each) | 8 | 17 MB |
| Scalars (`p`, `μ_c`, `μ_n`, `γ̇`, `χ`, `bed`, `ε`, `u_media_x/y`, `div`) | 10 | 21 MB |
| Multigrid hierarchy (3 arrays × 4/3) | ~4 | 8 MB |
| **Total** | | **≈ 46 MB** |

Comfortable inside the default 4 GB WASM memory limit, and small enough that the
whole working set is close to L3-resident at `N = 256` — which is why 256 will be
several times faster per cell than 512, not merely 4× cheaper.

Allocate everything once in the constructor. Changing `N` destroys and rebuilds
the solver (hence `--runtime minimal`, not `stub`).

---

## 10. Performance targets and expectations

Measured on the dev machine, release build, single-threaded:

| N | Δx | Target | Notes |
| --- | --- | --- | --- |
| 128 | 8.0 mm | ≥ 120 FPS | interactive parameter exploration |
| 256 | 4.0 mm | ≥ 30 FPS | **default** |
| 512 | 2.0 mm | ≥ 8 FPS | "high resolution", media-scale Δx |
| 512 (RVE) | 0.1 mm | ≥ 8 FPS | micro scale, beads resolved |

Report the actual numbers in `docs/VALIDATION.md`; do not restate these targets
as if they were results. If `N = 512` cannot reach 8 FPS, reduce `n_sub` to 1 and
say so, rather than silently reducing solver quality.

Optimisation order, if needed, in order of payoff:
1. Switch `type Real` to `f32` (halves bandwidth; verify V2 error is unaffected —
   it will not be, at these tolerances, but check).
2. Enable WASM SIMD (`--enable simd`) and vectorise the Jacobi and GS sweeps.
3. Fuse the advect/gravity/drag/penalize passes into one loop.
4. Only then consider Web Workers + `SharedArrayBuffer` — note this needs COOP/COEP
   headers, which **GitHub Pages cannot set**, so it would break the static
   deployment. Treat multithreading as out of scope.
