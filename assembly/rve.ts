// assembly/rve.ts
import { Real, MODE_PERIODIC } from './types';
import { idxC, idxU, idxV, calcDivergence, applyGradient } from './grid';
import { Multigrid } from './multigrid';
import { advectVelocity } from './advect';
import { diffuseVelocity } from './diffuse';
import { penalizeVelocity } from './penalize';

// Deterministic xorshift32 PRNG (KERNEL_REFERENCE.md §9)
export class Rng {
  private s: u32;
  constructor(seed: i32) {
    this.s = seed != 0 ? <u32>seed : 0x9E3779B9;
  }
  next(): Real {
    let x = this.s;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.s = x;
    return <Real>x * (1.0 / 4294967296.0);
  }
}

// Target diffusion number dt*nu/dx^2 for the RVE viscous solve. Measured
// K/K_Gebart at N=64, phi=0.65: D=424 -> 105, D=42 -> 14.3, D=4.2 -> 2.08,
// D=0.85 -> 0.65. Bounded below ~1 the answer is a genuine measurement.
const D_TARGET: Real = 0.5;

// Disc representation in 2D
export class Disc {
  x: Real;
  y: Real;
  r: Real;
  constructor(x: Real, y: Real, r: Real) {
    this.x = x;
    this.y = y;
    this.r = r;
  }
}

// Analytical Gebart (1992) permeability for regular hexagonal disc array
export function gebartPermeability(dp: Real, phi: Real): Real {
  const phiMax: Real = Math.PI / (2.0 * Math.sqrt(3.0)); // ~ 0.90689968
  if (phi <= 0.0 || phi >= phiMax) return 0.0;

  const Rb = 0.5 * dp;
  const ratio = Math.sqrt(phiMax / phi) - 1.0;
  if (ratio <= 0.0) return 0.0;

  const factor = 4.0 / (9.0 * Math.PI * Math.sqrt(6.0));
  const pwr = Math.pow(ratio, 2.5);
  return Rb * Rb * factor * pwr;
}

// Analytical Gebart (1992) permeability for regular square (quadratic) disc array
export function gebartSquarePermeability(dp: Real, phi: Real): Real {
  const phiMax: Real = Math.PI / 4.0; // ~ 0.785398
  if (phi <= 0.0 || phi >= phiMax) return 0.0;

  const Rb = 0.5 * dp;
  const ratio = Math.sqrt(phiMax / phi) - 1.0;
  if (ratio <= 0.0) return 0.0;

  const factor = 16.0 / (9.0 * Math.PI * Math.sqrt(2.0));
  const pwr = Math.pow(ratio, 2.5);
  return Rb * Rb * factor * pwr;
}

// Generate regular square disc packing in periodic domain L x L with target solid fraction phi
export function createSquareDiscs(L: Real, dp: Real, phi: Real): Array<Disc> {
  const discs = new Array<Disc>(0);
  const Rb = 0.5 * dp;
  const sIdeal = 0.5 * dp * Math.sqrt(Math.PI / phi);
  let n = <i32>Math.round(L / sIdeal);
  if (n < 1) n = 1;
  const s = L / <Real>n;

  for (let j = 0; j < n; j++) {
    const y = (j + 0.5) * s;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * s;
      discs.push(new Disc(x, y, Rb));
    }
  }
  return discs;
}

// Compute periodic distance between point (x, y) and disc centre (cx, cy)
// @ts-ignore
@inline
function periodicDistSq(x: Real, y: Real, cx: Real, cy: Real, L: Real): Real {
  let dx = Math.abs(x - cx);
  if (dx > 0.5 * L) dx = L - dx;
  let dy = Math.abs(y - cy);
  if (dy > 0.5 * L) dy = L - dy;
  return dx * dx + dy * dy;
}

// Compute solid fraction chi for RVE disc packing
export function updateRveMask(chi: Float64Array, N: i32, dx: Real, L: Real, discs: Array<Disc>): void {
  const nDiscs = discs.length;
  const invDx = 1.0 / dx;

  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx;

      let minSdf: Real = 1e9;
      for (let k = 0; k < nDiscs; k++) {
        const dsq = periodicDistSq(x, y, discs[k].x, discs[k].y, L);
        const sdf = Math.sqrt(dsq) - discs[k].r;
        if (sdf < minSdf) {
          minSdf = sdf;
        }
      }

      // Inside disc: minSdf < 0 -> tanh < 0 -> chi -> 1
      chi[idxC(N, i, j)] = 0.5 * (1.0 - Math.tanh(minSdf * invDx));
    }
  }
}

// RVE Micro Solver class
export class RveSolver {
  N: i32;
  L: Real;
  dx: Real;
  inv: Real;
  rho: Real = 1.0;
  mu: Real = 0.001;
  fx: Real = 1.0;
  etaPenal: Real = 1e-5;
  // Damped-Jacobi sweeps for the implicit viscous solve.
  //
  // Kept at 24, which is ample *provided* the diffusion number D = dt*nu/dx^2 is
  // O(1) — which step() now enforces. Do not try to compensate for a large D by
  // raising this instead: Jacobi is a smoother, and 848 sweeps at D = 424 still
  // left the measured permeability 36x above Gebart (1992). See
  // VALIDATION.md §5.1 and KERNEL_REFERENCE.md §12.
  nVisc: i32 = 24;
  // Cap on the internal subdivision in step(), so a pathological dt cannot hang
  // the solver outright; exceeding it means D is no longer bounded, and the
  // caller should lower dt or raise rho instead.
  nSubMax: i32 = 4000;

  u: Float64Array = new Float64Array(0);
  v: Float64Array = new Float64Array(0);
  p: Float64Array = new Float64Array(0);
  div: Float64Array = new Float64Array(0);
  chi: Float64Array = new Float64Array(0);
  uSolid: Float64Array = new Float64Array(0);
  vSolid: Float64Array = new Float64Array(0);

  uStar: Float64Array = new Float64Array(0);
  vStar: Float64Array = new Float64Array(0);
  uHat: Float64Array = new Float64Array(0);
  vHat: Float64Array = new Float64Array(0);
  rhsU: Float64Array = new Float64Array(0);
  rhsV: Float64Array = new Float64Array(0);
  tmpU: Float64Array = new Float64Array(0);
  tmpV: Float64Array = new Float64Array(0);
  muC: Float64Array = new Float64Array(0);
  muN: Float64Array = new Float64Array(0);

  mg: Multigrid = new Multigrid();

  constructor() {
    this.N = 0;
    this.L = 0.0;
    this.dx = 0.0;
    this.inv = 0.0;
  }

  init(N: i32, L: Real, dp: Real, phi: Real, mu: Real, fx: Real): void {
    this.N = N;
    this.L = L;
    this.dx = L / <Real>N;
    this.inv = <Real>N / L;
    this.mu = mu;
    this.fx = fx;

    const nc = N * N;
    const nu = (N + 1) * N;
    const nv = N * (N + 1);
    const nn = (N + 1) * (N + 1);

    this.u = new Float64Array(nu);
    this.v = new Float64Array(nv);
    this.p = new Float64Array(nc);
    this.div = new Float64Array(nc);
    this.chi = new Float64Array(nc);
    this.uSolid = new Float64Array(nu);
    this.vSolid = new Float64Array(nv);

    this.uStar = new Float64Array(nu);
    this.vStar = new Float64Array(nv);
    this.uHat = new Float64Array(nu);
    this.vHat = new Float64Array(nv);
    this.rhsU = new Float64Array(nu);
    this.rhsV = new Float64Array(nv);
    this.tmpU = new Float64Array(nu);
    this.tmpV = new Float64Array(nv);
    this.muC = new Float64Array(nc);
    this.muN = new Float64Array(nn);

    for (let k = 0; k < nc; k++) this.muC[k] = mu;
    for (let k = 0; k < nn; k++) this.muN[k] = mu;

    const discs = createSquareDiscs(L, dp, phi);
    updateRveMask(this.chi, N, this.dx, L, discs);

    this.mg.init(N, L, 8, 1e-6, MODE_PERIODIC);
  }

  // Diffusion number of the implicit viscous solve at this dt.
  diffusionNumber(dt: Real): Real {
    const nu = this.mu / this.rho;
    return (dt * nu) / (this.dx * this.dx);
  }

  // Largest dt for which nVisc damped-Jacobi sweeps actually solve the implicit
  // Helmholtz system. Raising the sweep count instead does not work: Jacobi
  // cannot resolve a D >> 1 operator at any practical iteration count (measured:
  // 848 sweeps at D = 424 still left K 36x above Gebart). Bounding D is the fix.
  maxStableDt(): Real {
    const nu = this.mu / this.rho;
    if (nu <= 0.0) return 1e30;
    return (D_TARGET * this.dx * this.dx) / nu;
  }

  // Advance by dt, subdividing as needed to keep the diffusion number bounded.
  // The caller therefore gets a correct answer for any dt, paying in substeps.
  step(dt: Real): void {
    const dtMax = this.maxStableDt();
    let nSub = <i32>Math.ceil(dt / dtMax);
    if (nSub < 1) nSub = 1;
    if (nSub > this.nSubMax) nSub = this.nSubMax;
    const sub = dt / <Real>nSub;
    for (let s = 0; s < nSub; s++) this.subStep(sub);
  }

  subStep(dt: Real): void {
    const N = this.N;
    const dx = this.dx;
    const inv = this.inv;

    // 1. Advection
    advectVelocity(
      this.uStar, this.vStar,
      this.u, this.v,
      this.uHat, this.vHat,
      N, dx, inv, dt,
      true, true
    );
    for (let k = 0; k < (N + 1) * N; k++) this.u[k] = this.uStar[k];
    for (let k = 0; k < N * (N + 1); k++) this.v[k] = this.vStar[k];

    // 2. Body force fx scaled by (1 - chiFace)
    const invRho = 1.0 / this.rho;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i <= N; i++) {
        const k = idxU(N, i, j);
        const cL = i > 0 ? idxC(N, i - 1, j) : idxC(N, 0, j);
        const cR = i < N ? idxC(N, i,     j) : idxC(N, N - 1, j);
        const chiFace = 0.5 * (this.chi[cL] + this.chi[cR]);
        this.u[k] += dt * this.fx * invRho * (1.0 - chiFace);
      }
    }

    // 3. Viscous diffusion
    diffuseVelocity(
      this.u, this.v, this.rhsU, this.rhsV, this.tmpU, this.tmpV,
      this.muC, this.muN,
      N, dx, inv, dt, this.rho,
      this.nVisc, 0.8,
      MODE_PERIODIC, 0.0, 0.0, 0.0, 0.0
    );

    // 4. Brinkman penalization of stationary discs (uSolid = 0, vSolid = 0).
    // Before the projection, per NUMERICS.md §2, so the projection removes the
    // divergence penalization introduces rather than leaving the disc interiors
    // non-solenoidal. Measured on its own this changed the permeability by under
    // 5% (2.44e-6 -> 2.56e-6 at N=256): it is the correct ordering, but it was
    // *not* the cause of the ~10^3 permeability error — the diffusion number
    // was. See VALIDATION.md §5.1.
    penalizeVelocity(this.u, this.v, this.uSolid, this.vSolid, this.chi, N, dt, this.etaPenal);

    // 5. Pressure projection
    calcDivergence(this.div, this.u, this.v, N, inv);
    const b0 = this.mg.b[0];
    const rhoInvDt = this.rho / dt;
    const nc = N * N;
    for (let k = 0; k < nc; k++) b0[k] = this.div[k] * rhoInvDt;
    this.mg.solve(false);

    const phi0 = this.mg.phi[0];
    for (let k = 0; k < nc; k++) this.p[k] = phi0[k];
    applyGradient(this.u, this.v, this.p, N, inv, dt / this.rho, MODE_PERIODIC);
  }

  getSuperficialVelocity(): Real {
    let sumU: Real = 0.0;
    const N = this.N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const uAvg = 0.5 * (this.u[idxU(N, i, j)] + this.u[idxU(N, i + 1, j)]);
        sumU += uAvg;
      }
    }
    return sumU / <Real>(N * N);
  }

  getPermeability(): Real {
    const U = this.getSuperficialVelocity();
    // Darcy law: fx = (mu / K) * U => K = (mu * U) / fx
    return (this.mu * U) / this.fx;
  }
}
