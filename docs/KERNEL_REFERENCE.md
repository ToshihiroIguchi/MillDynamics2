# KERNEL REFERENCE — Code for the Parts That Are Easy to Get Wrong

`NUMERICS.md` says *what* the algorithms are. This file gives **working
reference code** for the pieces where a plausible-looking implementation is
silently wrong. Copy the structure; adapt names if you like, but do not
"simplify" the index arithmetic — every offset here is deliberate.

Everything is AssemblyScript.

---

## 0. AssemblyScript gotchas that cost hours

| Gotcha | Consequence | Fix |
| --- | --- | --- |
| `Math.random()` needs an `env.seed` import | Link error, or a trap at runtime | Never use it. Use the xorshift in §9. |
| `Math.floor()` returns `f64` | `i32` index arithmetic silently truncates wrongly | Cast explicitly: `<i32>Math.floor(x)` |
| Integer division `a / b` on `i32` | Yields `i32`, not a float | Write `<f64>a / <f64>b` |
| `Array<T>` | Heap-allocating, bounds-checked, slow | Use `Float64Array` / `Int32Array` / `StaticArray<T>` |
| Closures in hot loops | Allocation per call | Plain `for` loops only |
| `--runtime stub` never frees | Memory grows on every solver rebuild | Use `--runtime minimal` |
| `bool` is `i32`-sized | Fine, but do not pack into `Float64Array` | Keep masks as `Float64Array` (they are smoothed anyway) |

Required JS import object:

```js
const imports = {
  env: {
    abort(msgPtr, filePtr, line, col) { throw new Error(`wasm abort at ${line}:${col}`); },
    trace(msgPtr, n, a0, a1, a2, a3, a4) { /* debug builds only */ },
  }
};
```

---

## 1. Grid and indexing

```ts
// assembly/types.ts
export type Real = f64;

// assembly/grid.ts
export class Grid {
  N:  i32 = 0;      // cells per side
  L:  Real = 0;     // domain size [m]
  dx: Real = 0;     // cell size
  inv: Real = 0;    // 1/dx
  periodic: bool = false;

  nc: i32 = 0;      // centres: N*N
  nu: i32 = 0;      // u faces:  (N+1)*N
  nv: i32 = 0;      // v faces:  N*(N+1)
  nn: i32 = 0;      // nodes:   (N+1)*(N+1)

  init(N: i32, L: Real, periodic: bool): void {
    this.N = N; this.L = L; this.dx = L / <Real>N; this.inv = 1.0 / this.dx;
    this.periodic = periodic;
    this.nc = N * N;
    this.nu = (N + 1) * N;
    this.nv = N * (N + 1);
    this.nn = (N + 1) * (N + 1);
  }
}
```

**The trap**: `idxC` and `idxV` have the *same formula* (`i + j*N`) but different
valid ranges — `j ∈ [0, N)` for centres, `j ∈ [0, N]` for `v`. Mixing them up
compiles, runs, and produces a subtly wrong answer. Keep them as separate named
functions so the intent is visible at every call site.

```ts
// @ts-ignore: decorator
@inline export function idxC(N: i32, i: i32, j: i32): i32 { return i + j * N; }
// @ts-ignore
@inline export function idxU(N: i32, i: i32, j: i32): i32 { return i + j * (N + 1); }
// @ts-ignore
@inline export function idxV(N: i32, i: i32, j: i32): i32 { return i + j * N; }
// @ts-ignore
@inline export function idxN(N: i32, i: i32, j: i32): i32 { return i + j * (N + 1); }
```

Physical positions — write these down and never guess:

| Field | Index range | Position of `(i, j)` |
| --- | --- | --- |
| `p`, `μ_c`, `γ̇`, `χ`, `bed` | `i ∈ [0,N)`, `j ∈ [0,N)` | `((i+0.5)Δx, (j+0.5)Δx)` |
| `u` | `i ∈ [0,N]`, `j ∈ [0,N)` | `(iΔx, (j+0.5)Δx)` |
| `v` | `i ∈ [0,N)`, `j ∈ [0,N]` | `((i+0.5)Δx, jΔx)` |
| `μ_n` | `i ∈ [0,N]`, `j ∈ [0,N]` | `(iΔx, jΔx)` |

---

## 2. Cross-sampling velocity on a staggered grid

The single most common staggered-grid bug. To advect `v` you need `u` **at the
`v` location**, which is the average of four `u` values — and the index offsets
are not symmetric.

```ts
// u interpolated to the location of v(i,j)
// @ts-ignore
@inline export function uAtV(u: Float64Array, N: i32, i: i32, j: i32): Real {
  const jm = j - 1 < 0 ? 0 : j - 1;
  const jc = j > N - 1 ? N - 1 : j;
  return 0.25 * ( u[idxU(N, i,     jm)] + u[idxU(N, i + 1, jm)]
                + u[idxU(N, i,     jc)] + u[idxU(N, i + 1, jc)] );
}

// v interpolated to the location of u(i,j)
// @ts-ignore
@inline export function vAtU(v: Float64Array, N: i32, i: i32, j: i32): Real {
  const im = i - 1 < 0 ? 0 : i - 1;
  const ic = i > N - 1 ? N - 1 : i;
  return 0.25 * ( v[idxV(N, im, j)] + v[idxV(N, ic, j    )]
                + v[idxV(N, im, j + 1)] + v[idxV(N, ic, j + 1)] );
}
```

Verify the arithmetic yourself once: `v(i,j)` sits at `x=(i+0.5)Δx, y=jΔx`. The
four surrounding `u` samples are `(i,j−1), (i+1,j−1), (i,j), (i+1,j)`, whose mean
position is exactly `((i+0.5)Δx, jΔx)`. If your average lands anywhere else, the
advection is first-order-biased and V1 at Re = 1000 will fail while Re = 100
passes — a maddening symptom if you have not checked this.

**Bilinear sample of the `u` field at an arbitrary world point** (needed by the
semi-Lagrangian trace):

```ts
export function sampleU(u: Float64Array, N: i32, inv: Real, x: Real, y: Real): Real {
  // u(i,j) lives at (i*dx, (j+0.5)*dx)  =>  grid coords:
  let gx = x * inv;
  let gy = y * inv - 0.5;
  let i0 = <i32>Math.floor(gx); let j0 = <i32>Math.floor(gy);
  const fx = gx - <Real>i0;     const fy = gy - <Real>j0;
  if (i0 < 0) i0 = 0; if (i0 > N - 1) i0 = N - 1;      // u has N+1 columns
  if (j0 < 0) j0 = 0; if (j0 > N - 2) j0 = N - 2;      // u has N   rows
  const a = u[idxU(N, i0, j0    )], b = u[idxU(N, i0 + 1, j0    )];
  const c = u[idxU(N, i0, j0 + 1)], d = u[idxU(N, i0 + 1, j0 + 1)];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
```

`sampleV` is the mirror image: `gx = x*inv − 0.5`, `gy = y*inv`, clamp
`i0 ≤ N−2`, `j0 ≤ N−1`.

### 2b. Ghost values at walls — do not just write zero

`u(i,j)` sits at `y = (j+0.5)Δx`, so the wall at `y = 0` lies **half a cell
below** the first `u` row. A no-slip wall therefore needs a *mirrored* ghost, not
a zero:

```ts
// tangential velocity below a stationary no-slip wall
uGhost = -u[idxU(N, i, 0)];              // gives u = 0 exactly at y = 0
// moving wall (cavity lid, Couette surface) at tangential speed Uw
uGhost = 2.0 * Uw - u[idxU(N, i, N - 1)];
// free-slip / symmetry
uGhost = +u[idxU(N, i, 0)];
// periodic
uGhost = u[idxU(N, i, N - 1)];
```

Writing `0.0` instead of `−u[...]` places the effective wall at `y = −0.5Δx`:
the channel is silently half a cell too wide, the scheme drops to first order at
the boundary, and V2 fails its 1 % tolerance for a reason that looks like a
solver bug rather than a boundary bug. The **normal** component (`v` at `y = 0`)
is genuinely zero and is simply set, not mirrored — the asymmetry between the two
components is deliberate.

Every stencil that reaches outside the array — the diffusion sweep (§5), the node
strain rate (§4), and the advection clamp — must use these ghosts. Put them in
one helper per field and call it everywhere; hand-inlining the branch in three
places is how two of them end up different.

---

## 3. Rheology, with the small-γ̇ guard

```ts
// assembly/rheology.ts
export function muApp(gd: Real, K: Real, n: Real, tauY: Real, m: Real,
                      muMin: Real, muMax: Real): Real {
  // Power-law part
  let mu = (n == 1.0) ? K : K * Math.pow(gd > 1e-12 ? gd : 1e-12, n - 1.0);

  // Yield part: tauY * (1 - exp(-m*gd)) / gd, which tends to tauY*m as gd -> 0
  if (tauY > 0.0) {
    const mg = m * gd;
    mu += (mg < 1e-6)
        ? tauY * m * (1.0 - 0.5 * mg)          // series, avoids 0/0
        : tauY * (1.0 - Math.exp(-mg)) / gd;
  }

  if (mu < muMin) return muMin;
  if (mu > muMax) return muMax;
  return mu;
}
```

Unit-test `muApp(0, K, n, tauY, m, ...) == tauY*m` to 1e-9 (with `muMax` raised
above `tauY*m` so the clamp does not mask the check). Also test that the series
branch and the exact branch agree to 1e-10 at `m*gd = 1e-6`.

---

## 4. Strain rate

```ts
// nodes first (corner quantities), then centres
export function strainRate(/* ... */): void {
  const N = g.N, inv = g.inv;

  // dudy + dvdx at nodes (i,j) in [0,N] x [0,N]
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      // ghostU / ghostV apply the rules of §2b; never inline `0.0` here
      const uUp = (j < N) ? u[idxU(N, i, j)]     : ghostU(u, N, i, N - 1, +1);
      const uDn = (j > 0) ? u[idxU(N, i, j - 1)] : ghostU(u, N, i, 0,     -1);
      const vRt = (i < N) ? v[idxV(N, i, j)]     : ghostV(v, N, N - 1, j, +1);
      const vLf = (i > 0) ? v[idxV(N, i - 1, j)] : ghostV(v, N, 0,     j, -1);
      sNode[idxN(N, i, j)] = (uUp - uDn) * inv + (vRt - vLf) * inv;
    }
  }

  // gamma-dot at centres
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = idxC(N, i, j);
      const dudx = (u[idxU(N, i + 1, j)] - u[idxU(N, i, j)]) * inv;
      const dvdy = (v[idxV(N, i, j + 1)] - v[idxV(N, i, j)]) * inv;
      const s = 0.25 * ( sNode[idxN(N, i,     j    )] + sNode[idxN(N, i + 1, j    )]
                       + sNode[idxN(N, i,     j + 1)] + sNode[idxN(N, i + 1, j + 1)] );
      gd[c] = Math.sqrt(2.0 * dudx * dudx + 2.0 * dvdy * dvdy + s * s);
      muC[c] = muApp(gd[c], K, n, tauY, m, muMin, muMax);
    }
  }

  // node viscosity = arithmetic mean of the 4 surrounding centres (clamp first!)
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < N ? i : N - 1;
      const j0 = j > 0 ? j - 1 : 0, j1 = j < N ? j : N - 1;
      muN[idxN(N, i, j)] = 0.25 * ( muC[idxC(N, i0, j0)] + muC[idxC(N, i1, j0)]
                                  + muC[idxC(N, i0, j1)] + muC[idxC(N, i1, j1)] );
    }
  }
}
```

If `γ̇` comes out zero everywhere while the fluid is visibly moving, you have
omitted the node term `s` — the normal derivatives alone vanish for pure shear.

---

## 5. Implicit variable-viscosity diffusion (damped Jacobi)

Backward Euler. The `v`-coupling in the shear term goes to the **right-hand
side**; only the `u`-neighbour couplings are in the matrix. That is why the
diagonal below contains four viscosity terms and no `v`.

```ts
export function diffuseU(nIter: i32, omegaDamp: Real, dt: Real, rho: Real): void {
  const N = g.N;
  const a = dt / rho * (g.inv * g.inv);      // = dt / (rho * dx^2)

  // rhs = u* + explicit cross terms
  for (let j = 0; j < N; j++) {
    for (let i = 1; i < N; i++) {
      const k = idxU(N, i, j);
      const nT = idxN(N, i, j + 1), nB = idxN(N, i, j);
      const cross = ( muN[nT] * (v[idxV(N, i, j + 1)] - v[idxV(N, i - 1, j + 1)])
                    - muN[nB] * (v[idxV(N, i, j    )] - v[idxV(N, i - 1, j    )]) );
      rhsU[k] = u[k] + a * cross;
    }
  }

  for (let it = 0; it < nIter; it++) {
    for (let j = 0; j < N; j++) {
      for (let i = 1; i < N; i++) {
        const k  = idxU(N, i, j);
        const mR = muC[idxC(N, i,     j)];              // centre right of face
        const mL = muC[idxC(N, i - 1, j)];              // centre left  of face
        const mT = muN[idxN(N, i, j + 1)];
        const mB = muN[idxN(N, i, j)];

        const uR = u[idxU(N, i + 1, j)];
        const uL = u[idxU(N, i - 1, j)];
        // Mirrored ghosts at walls -- see §2b. NOT 0.0.
        const uT = (j < N - 1) ? u[idxU(N, i, j + 1)] : (2.0 * uWallTop - u[k]);
        const uB = (j > 0)     ? u[idxU(N, i, j - 1)] : (2.0 * uWallBot - u[k]);

        const off  = a * (2.0 * mR * uR + 2.0 * mL * uL + mT * uT + mB * uB);
        const diag = 1.0 + a * (2.0 * mR + 2.0 * mL + mT + mB);
        const uNew = (rhsU[k] + off) / diag;
        tmpU[k] = u[k] + omegaDamp * (uNew - u[k]);
      }
    }
    // swap u <-> tmpU (ping-pong; do not copy)
  }
}
```

`diag ≥ 1` always, so this converges for any viscosity field and any iteration
count. **An under-converged solve is less accurate, never unstable** — that is
what makes `n_visc` safe to expose as a quality slider.

`diffuseV` is the transpose: swap the roles of `i`/`j`, use `2·μ_c` above/below
and `μ_n` left/right, and put the `u` cross-derivative on the right-hand side.

---

## 6. Multigrid V-cycle

```ts
export function vcycle(lvl: i32): void {
  if (lvl == nLevels - 1) { smooth(lvl, 50); return; }
  smooth(lvl, 2);                 // pre-smooth, red-black Gauss-Seidel
  residual(lvl);                  // r = b - A*phi
  restrict(lvl, lvl + 1);         // full weighting  r -> b_{lvl+1}
  zero(phi[lvl + 1]);
  vcycle(lvl + 1);
  prolongAdd(lvl + 1, lvl);       // bilinear  phi_lvl += P * phi_{lvl+1}
  smooth(lvl, 2);                 // post-smooth
}

export function project(dt: Real, rho: Real): void {
  divergence(b[0], dt, rho);      // b = (rho/dt) * div(u)
  subtractMean(b[0]);             // ---- MANDATORY for pure Neumann ----
  zero(phi[0]);
  const bnorm = l2(b[0]);
  for (let c = 0; c < maxCycles; c++) {
    vcycle(0);
    subtractMean(phi[0]);         // ---- MANDATORY: re-centre every cycle ----
    residual(0);
    if (l2(r[0]) < tol * (bnorm > 0 ? bnorm : 1.0)) break;
  }
  applyGradient(dt, rho);         // u -= (dt/rho) * grad(phi)
}
```

The two lines marked MANDATORY are the whole reason V5 runs for 1000 steps
rather than 10. Without `subtractMean`, the pure-Neumann system is singular, the
solve picks up an arbitrary constant that drifts, and the divergence grows
slowly enough that a 10-step test passes.

Red–black Gauss–Seidel for `∇²φ = b` (`Δx` folded into `b`):

```ts
function smooth(l: i32, sweeps: i32): void {
  const n = size[l], h2 = dx[l] * dx[l];
  for (let s = 0; s < sweeps; s++) {
    for (let colour = 0; colour < 2; colour++) {
      for (let j = 0; j < n; j++) {
        for (let i = ((j + colour) & 1); i < n; i += 2) {
          const k = i + j * n;
          // Neumann: a missing neighbour mirrors the centre value, which is
          // equivalent to dropping it from BOTH the sum and the diagonal count.
          let sum = 0.0; let cnt = 0.0;
          if (i > 0)     { sum += phi[l][k - 1]; cnt += 1.0; }
          if (i < n - 1) { sum += phi[l][k + 1]; cnt += 1.0; }
          if (j > 0)     { sum += phi[l][k - n]; cnt += 1.0; }
          if (j < n - 1) { sum += phi[l][k + n]; cnt += 1.0; }
          phi[l][k] = (sum - h2 * b[l][k]) / cnt;
        }
      }
    }
  }
}
```

Note `cnt`, not a hard-coded `4.0`. Hard-coding 4 imposes a Dirichlet-like
condition at the boundary and quietly changes the physics.

---

## 7. Signed distance functions

```ts
// Mill interior: fluid where r < R, solid outside.  Positive = solid side.
// @ts-ignore
@inline export function sdfShell(x: Real, y: Real, cx: Real, cy: Real, R: Real): Real {
  const dx = x - cx, dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - R;
}

// One lifter bar: a box in the (radial, tangential) frame of angle theta.
export function sdfLifter(x: Real, y: Real, cx: Real, cy: Real, R: Real,
                          theta: Real, h: Real, w: Real, alpha: Real): Real {
  const dx = x - cx, dy = y - cy;
  const ct = Math.cos(theta), st = Math.sin(theta);
  let a =  dx * ct + dy * st;        // radial coordinate
  let b = -dx * st + dy * ct;        // tangential coordinate

  // box centre at radius R - h/2, half-extents (h/2, w/2), tilted by alpha
  const ca = R - 0.5 * h;
  let pa = a - ca, pb = b;
  if (alpha != 0.0) {
    const cA = Math.cos(alpha), sA = Math.sin(alpha);
    const ra =  pa * cA + pb * sA;
    const rb = -pa * sA + pb * cA;
    pa = ra; pb = rb;
  }
  const qa = Math.abs(pa) - 0.5 * h;
  const qb = Math.abs(pb) - 0.5 * w;
  const ox = qa > 0.0 ? qa : 0.0, oy = qb > 0.0 ? qb : 0.0;
  const outside = Math.sqrt(ox * ox + oy * oy);
  const inside  = Math.min(Math.max(qa, qb), 0.0);
  return outside + inside;          // negative inside the bar
}
```

Combine: a point is solid if it is outside the shell **or** inside any lifter.

```
sdfSolid = min( sdfShell(x,y), min over k of sdfLifter(..., theta + 2*PI*k/nL, ...) )
chi      = 0.5 * (1 - tanh( sdfSolid / dx ))
```

`chi` at a **face** is the average of the two adjacent cell-centre values —
computing `chi` only at centres and using it on faces lets fluid leak through the
shell.

---

## 8. Bed chord placement — closed form, then bisection

The bed is `{ |x−c| ≤ R }  ∩  { (x−c)·n ≤ −d }` where `n` is the unit normal of
the free surface, inclined at the repose angle. The area of that circular segment
has a closed form:

```
A(d) = R² · acos(d/R) − d · sqrt(R² − d²),   d ∈ [−R, R]
```

Check it: `A(−R) = πR²` (full circle), `A(0) = πR²/2` (half), `A(R) = 0`.
`A` is monotonically decreasing, so bisect on `d` to hit `A(d) = J·πR²`:

```ts
export function solveChordOffset(R: Real, J: Real): Real {
  const target = J * Math.PI * R * R;
  let lo = -R, hi = R;
  for (let it = 0; it < 60; it++) {          // 60 iterations ~ machine precision
    const mid = 0.5 * (lo + hi);
    const s = Math.sqrt(Math.max(R * R - mid * mid, 0.0));
    const area = R * R * Math.acos(mid / R) - mid * s;
    if (area > target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}
```

The normal for repose angle `θ_r` with counter-clockwise rotation is
`n = (−sin θ_r, cos θ_r)`; mirror the `x` component for clockwise. Smooth the bed
indicator over `2Δx` with the same `tanh` used for `χ`.

Unit-test this against `J ∈ {0.15 … 0.45}` by summing the smoothed indicator
over the grid: it must match `J·πR²` within 1 %.

---

## 9. Deterministic PRNG (for RVE bead packing)

`Math.random()` will not link cleanly. Use xorshift32 so the same seed gives
bit-identical packings, which V8 and E6 both require.

```ts
export class Rng {
  private s: u32;
  constructor(seed: i32) { this.s = seed != 0 ? <u32>seed : 0x9E3779B9; }
  next(): Real {
    let x = this.s;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    this.s = x;
    return <Real>x * (1.0 / 4294967296.0);
  }
}
```

---

## 10. Torque — and the bug that will otherwise ruin it

The penalization term is an **acceleration**, `f = −(χ/η)(u − u_wall)` [m/s²].
The force per unit depth that the fluid exerts on the wall in a cell is
`+ρ(χ/η)(u − u_wall)·Δx²`. The torque that must be **applied** to drive the shell
is the negative of the torque the fluid exerts:

```ts
export function shellTorque(rho: Real, eta: Real): Real {
  const N = g.N, dA = g.dx * g.dx;
  let T: Real = 0.0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = idxC(N, i, j);
      if (chi[c] <= 0.0) continue;
      const x = (<Real>i + 0.5) * g.dx - cx;
      const y = (<Real>j + 0.5) * g.dx - cy;
      const uc = 0.5 * (u[idxU(N, i, j)] + u[idxU(N, i + 1, j)]);
      const vc = 0.5 * (v[idxV(N, i, j)] + v[idxV(N, i, j + 1)]);
      const uw = -omega * y, vw = omega * x;
      const Fx = rho * (chi[c] / eta) * (uc - uw) * dA;
      const Fy = rho * (chi[c] / eta) * (vc - vw) * dA;
      T -= (x * Fy - y * Fx);           // r x F, negated: driving torque
    }
  }
  return T;                              // [N·m per metre of mill length]
}
```

Sign check to run once by hand: with `ω > 0` (CCW) and the fluid lagging, the
tangential component of `(u − u_wall)` is clockwise, so `r × F` is negative and
the returned driving torque is **positive**. Power `P = T·ω > 0`. If your power
comes out negative, the sign is inverted, not the physics.

### The bug

With implicit penalization, a solid cell retains a residual
`(u* − u_wall)/(1 + Δt/η)`. At `Δt = 2e-3`, `η = 1e-4` the denominator is only
21 — the residual is **not** negligible. If gravity (or porous drag) is applied
inside solid cells, that residual is refreshed every single step and the torque
sum accumulates a large spurious contribution that grows with time.

**Fix, and it is mandatory**: scale every body force by `(1 − χ)`.

```ts
u[k] += dt * gx * (1.0 - chiFaceU[k]);   // NOT  u[k] += dt * gx;
```

Symptom if you skip it: torque an order of magnitude too high and drifting
upward over a run that should be reaching steady state, while the velocity field
looks perfectly reasonable.

---

## 11. Order-of-magnitude sanity table (default preset, `N = 256`)

If your numbers are far outside these, stop and debug rather than tuning.

| Quantity | Expected |
| --- | --- |
| Critical speed `N_c` | 0.7056 rev/s = 42.3 rpm |
| `ω` at 75 % `N_c` | 3.325 rad/s (31.7 rpm) |
| Tip speed `ωR` | 1.66 m/s |
| `Δx` | 4.0 mm (`L = 1.024 m`, `N = 256`) |
| `Δt` | ≈ 2.0e-3 s (capped by `Δt_max`, not CFL) |
| `max |u|` | ≲ 1.7 m/s; **above ~3.5 m/s something is wrong** |
| `μ_app` in the free region | 0.2 – 0.6 Pa·s |
| `K_perm` (`ε=0.4, d_p=2mm, A=150`) | 4.74e-9 m² |
| `γ̇_pore` at `|u_rel| = 0.1 m/s` | ≈ 3.6e3 s⁻¹ |
| Shell torque | O(10 – 100) N·m per metre |
| Power draw | O(50 – 500) W per metre |
| `max |∇·u|·Δx/U_ref` | < 1e-4 |

### Expected, and not a bug

The default preset gives `Re = ρ·U_tip·D/μ_app ≈ 6000`. That is **above** the
laminar range, so the A6 warning will fire on the reference case. This is
correct behaviour: report it, do not silence it and do not raise `K` to make the
warning go away. A 2D laminar Navier–Stokes solution at that Reynolds number is
a legitimate solution of the equations as written — it will show unsteady vortex
shedding off the lifters — but it is **not** a validated turbulence prediction,
and `VALIDATION.md` must say so.
