# PARAMETERS — Single Source of Truth

**Every quantity in this document is user-adjustable at runtime.** Nothing here
may be hard-coded in `assembly/` or `src/`. The "default" column is a starting
value, not a fixed value; the mill diameter, the media diameter, the lifter
dimensions and the domain size are all inputs like any other.

Rules for the implementation:

1. **No magic numbers.** Every value below is a field of a config struct, set
   through an exported WASM setter and bound to a UI control.
2. **Presets set parameters; they do not lock them.** After loading any preset,
   every control remains editable.
3. **Derived quantities are computed, never entered.** They are displayed
   read-only so the user can see the consequences of their inputs.
4. **Changing a parameter must not require a page reload.** Geometry and
   resolution changes rebuild the solver; everything else applies on the next
   step.
5. **Every parameter appears in the CSV metadata block and in the permalink**
   (§7). A result without its full parameter set is not reproducible.
6. **Everyday parameters and special parameters are not interleaved.** Every
   entry below is flagged either as an operating input or as *advanced*
   (`ParamDef.advanced` in `src/config.ts`). Advanced entries are model closures
   and numerical settings — gravity, the Papanastasiou regularization, the
   viscosity clamps, the Ergun constants, the penalization time, the RVE
   calibration problem — and the UI collects them into one collapsed "Advanced /
   Special Parameters" section instead of mixing them into the panels a normal
   run touches. Changing one of them alters the model, not the mill.

The **start-up state** (schema defaults, and preset "0. Default") is deliberately
the simplest physical case: a smooth drum — no lifters — turning at 30 rpm with a
100 cP Newtonian slurry. It is *not* the E1–E7 reference case; that is preset
"1. Baseline Industrial Ball Mill", which the experiment runner pins explicitly.

---

## 1. Geometry

| Parameter | Symbol | Unit | Default | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| Mill diameter | `D` | m | 1.0 | 0.05 – 10.0 | The 1 m default is the reference case, not a constraint. Lab mills (0.3 m) and industrial mills (5 m) must both work. |
| Mill radius | `R` | m | *derived* `= D/2` | | |
| Domain margin | `margin` | – | 0.012 | 0.005 – 0.2 | *Advanced.* Fraction of `D` of solid padding outside the shell |
| Domain size | `L` | m | *derived* `= D·(1 + 2·margin)` | | At `D = 1.0, margin = 0.012` ⇒ `L = 1.024 m`, so `N = 512` gives `Δx = 2.0 mm` exactly |
| Mill centre | `c` | m | *derived* `= (L/2, L/2)` | | |
| Lifter count | `n_L` | – | **0** | 0 – 32 | 0 = smooth shell — the default, and the case V7 uses. Raise it to fit `n_L` radial bars |
| Lifter height | `h_L` | m | 0.025 | 0 – 0.2·R | No effect while `n_L = 0` |
| Lifter width | `w_L` | m | 0.020 | 0 – 0.2·R | No effect while `n_L = 0` |
| Lifter face angle | `α_L` | deg | 0 | −45 – 45 | 0 = radial rectangular bar; non-zero tilts the leading face. No effect while `n_L = 0` |

## 2. Operating conditions

| Parameter | Symbol | Unit | Default | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| **Mill speed** | `N` | **rpm** | 30 | 0 – 300 | Primary speed control. rpm is what a mill is specified and operated in, so it is the *input*; `%N_c` cannot be, because `N_c` itself depends on `D`, `d_p` and `g` |
| Angular velocity | `ω` | rad/s | *derived* | | `ω = 2π·N/60`, sign from direction |
| Speed fraction | `%N_c` | % | *derived* | | `= 100·N/N_c`; 30 rpm is 70.9 %N_c for the `D = 1 m`, `d_p = 2 mm` reference mill |
| Rotation direction | – | – | CCW | CCW / CW | |
| Gravity | `g` | m/s² | 9.81 | 0 – 30 | *Advanced.* 0 enables the periodic verification cases (V4) |

Derived and displayed read-only: critical speed
`N_c = (1/2π)·sqrt(g/(R − d_p/2))` [rev/s] and [rpm], speed fraction `%N_c`, tip
speed `ωR` [m/s].

Configs saved before the speed control became rpm carry `speedFraction` [%N_c];
`migrateConfig()` converts them on load, so an old permalink still reproduces its
own run rather than inheriting the default speed.

## 3. Charge and media

| Parameter | Symbol | Unit | Default | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| Fill fraction | `J` | – | 0.30 | 0 – 0.60 | `J = 0` disables the bed entirely (pure slurry case) |
| Dynamic angle of repose | `θ_r` | deg | 40 | 0 – 70 | Sets the inclination of the charge free boundary |
| Bed porosity | `ε` | – | 0.40 | 0.26 – 0.95 | 0.26 is the dense-packing limit |
| **Media diameter** | `d_p` | m | 0.002 | 1e-4 – 0.05 | The 2 mm reference. Permeability scales as `d_p²`, so this is the most consequential media parameter — see experiment E4 |
| Charge slip factor | `k_slip` | – | 0.85 | 0 – 1.0 | *Advanced.* Bed angular velocity as a fraction of `ω` — a closure of the prescribed-charge model (PHYSICS.md A4), not an operating setting |

Derived and displayed: permeability `K_perm = ε³d_p²/(A(1−ε)²)` [m²], pore shear
rate `γ̇_pore` [s⁻¹], bed area [m²] and its ratio to `J·πR²` (a self-check).

## 4. Slurry rheology

| Parameter | Symbol | Unit | Default | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| Density | `ρ` | kg/m³ | 1800 | 500 – 6000 | |
| Viscosity / consistency index | `K` | Pa·sⁿ | **0.1** | 1e-4 – 100 | In Newtonian mode (`n = 1`) this *is* the slurry viscosity `μ`; the default `0.1 Pa·s = 100 cP`. For `n ≠ 1` it is the consistency index of the power-law term |
| Flow behaviour index | `n` | – | **1.0** | 0.2 – 2.0 | `n = 1` ⇒ Newtonian/Bingham; `n < 1` shear-thinning; `n > 1` shear-thickening |
| Yield stress | `τ_y` | Pa | **0** | 0 – 500 | `0` ⇒ no yield surface |
| Regularization parameter | `m` | s | 1000 | 10 – 1e5 | *Advanced.* **Numerical**, not physical — see E7 |
| Minimum viscosity clamp | `μ_min` | Pa·s | 1e-4 | 1e-6 – 1 | *Advanced.* **Numerical** |
| Maximum viscosity clamp | `μ_max` | Pa·s | 1e3 | 1 – 1e6 | *Advanced.* **Numerical** — governs the stiffness of unyielded regions |

The default is therefore the **Newtonian** mode at `μ = 100 cP`, the plainest
slurry the model can represent. The apparent viscosity at the current bed shear
rate is displayed read-only in cP alongside Pa·s, since slurries are quoted in cP.

A **rheology mode selector** in the UI sets these in one action, while leaving
each field editable:

| Mode | Effect |
| --- | --- |
| Newtonian | `n = 1`, `τ_y = 0`; only `K` (= `μ`) remains meaningful (**default**) |
| Power-law | `τ_y = 0` |
| Bingham | `n = 1` |
| Herschel–Bulkley | all four free |

The UI must plot the resulting flow curve `μ_app(γ̇)` and `τ(γ̇)` on log axes,
live, as the parameters change. Load the `dataviz` skill before building it.

Both bottom charts — the flow curve and the torque/kinetic-energy time history —
are drawn with **Chart.js** (`src/ui/charts.ts`), not by hand. A hand-drawn canvas
carrying fixed `width`/`height` attributes inside a CSS-stretched box is scaled
non-uniformly after the fact, which is what made these plots vertically squashed;
the library owns the backing-store size, the device-pixel ratio and the log-axis
ticks instead.

## 5. Porous closure constants

All four are *advanced*: they parameterise the closure, not the mill.

| Parameter | Symbol | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| Viscous (Ergun) constant | `A` | 150 | 1 – 1000 | 3D placeholder; overwritten from `docs/closure_table.json` once E6 has run |
| Inertial (Forchheimer) constant | `B` | 1.75 | 0 – 50 | idem |
| Pore shear-rate constant | `C_γ` | 1.0 | 0.01 – 10 | Calibrated by E6 |
| Closure source | – | `table` | `table` / `manual` | `table` interpolates `A_2D(ε)`, `B_2D(ε)` from the measured file; `manual` uses the fields above |

## 6. Numerics

| Parameter | Symbol | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| Grid resolution | `N` | **128** | 64 / 128 / 256 / 512 | Powers of two only (multigrid). Rebuilds the solver. 128 is the *interactive* default; 256 costs ~4x per frame (~6 fps on a typical laptop) and is meant for a converged run, not for browsing. `d_p/Δx = 0.25` at `N = 128`, so the sub-grid porous closure stays valid. |
| Cell size | `Δx` | *derived* `= L/N` | | Displayed in mm, alongside `d_p/Δx` |
| Sub-steps per frame | `n_sub` | **1** | 1 – 8 | Full solver steps per rendered frame, so `n_sub` advances `n_sub·Δt` of simulated time at proportional cost. It is *not* a subdivision of one `Δt`. |
| CFL number | `CFL` | 2.0 | 0.2 – 5.0 | *Advanced.* Semi-Lagrangian tolerates > 1 |
| Maximum time step | `Δt_max` | 2e-3 s | 1e-5 – 1e-2 | *Advanced.* |
| Fixed time step | – | off | on / off | *Advanced.* Required by the temporal-order verification cases |
| Viscous solver iterations | `n_visc` | **12** | 4 – 128 | *Advanced.* Quality/FPS trade; never a stability risk (§NUMERICS 5). Measured: at mill viscosities the reference case is unchanged to 4 significant figures between 12 and 48 sweeps. |
| Multigrid cycles (max) | `n_mg` | 6 | 1 – 20 | *Advanced.* |
| Multigrid tolerance | `tol_mg` | 1e-5 | 1e-8 – 1e-3 | *Advanced.* |
| Penalization time | `η` | 1e-4 s | 1e-7 – 1e-2 | *Advanced.* Smaller = stiffer wall; error `~sqrt(ην)` |
| Advection scheme | – | MacCormack | MacCormack / semi-Lagrangian | *Advanced.* The first-order option exists to *demonstrate* the diffusion difference, not as a default |

`N` and `n_sub` are everyday controls — they are the resolution/frame-rate trade
the user makes constantly. Everything else in this section is advanced.

## 7. RVE (micro scale)

The whole section is *advanced*: it is the micro-scale calibration problem, not
the mill.

| Parameter | Symbol | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| Resolution | `N_rve` | 512 | 128 / 256 / 512 | |
| Cells per bead diameter | `d_p/Δx` | 20 | ≥ 8 | Sets `L_rve = N_rve · d_p / (d_p/Δx)`; at defaults `L_rve = 51.2 mm` |
| Media diameter | `d_p` | shared with §3 | | Same parameter, one value |
| Target solid fraction | `1−ε` | 0.60 | 0.05 – 0.80 | |
| Packing | – | random | random / hexagonal | Hexagonal is required by V8 |
| PRNG seed | `seed` | 12345 | any i32 | Same seed ⇒ identical packing |
| Driving body force | `f_x` | 1.0 m/s² | 1e-4 – 1e4 | Swept by E6 |

## 8. Validity warnings the UI must raise

These are warnings, not blocks — the user may run whatever they like, but must
be told when a result is outside the model's assumptions.

| Condition | Warning |
| --- | --- |
| `d_p > Δx` (macro) | "Media are larger than a cell; the sub-grid porous closure is not valid at this resolution. Increase `N` or reduce `d_p`." |
| `h_L < 2Δx` | "Lifters are thinner than 2 cells and are effectively unresolved." |
| `Re > 2000` | "Flow is beyond the laminar range; no turbulence model is active (PHYSICS.md A6)." |
| `d_p/Δx < 8` (RVE) | "Beads are under-resolved; permeability will be over-predicted." |
| Fraction of cells clamped at `μ_max` > 5 % | "The viscosity clamp is influencing the solution; raise `μ_max` or check E7." |
| `J > 0.5` | "Charge geometry model is not calibrated above 50 % fill." |
| `%N_c > 100` (derived from the entered rpm) | "Supercritical: centrifuging. The prescribed charge model assumes cascading (PHYSICS.md A4)." |

## 9. Persistence and sharing

Because this is a static site with no backend, the parameter set must travel
with the link:

- **Permalink**: the full config is serialised into the URL hash
  (`#cfg=<base64url of compact JSON>`), restored on load. Changing a parameter
  updates the hash so a browser bookmark captures the exact case.
- **Save / load JSON**: download the config and re-import it. Include a schema
  `version` field so old files can be migrated rather than silently
  misinterpreted.
- **CSV metadata block**: every parameter in §§1–7, emitted as `# key,value`
  lines above the time-series header.
- **Headless CLI**: `scripts/headless_run.mjs` accepts `--<param> <value>` for
  every parameter, plus `--config <file.json>`. Generate the argument parser from
  the same config schema the UI uses — one definition, three consumers.
