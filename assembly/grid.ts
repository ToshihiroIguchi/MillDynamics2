// assembly/grid.ts
import { Real, MODE_PERIODIC, MODE_CHANNEL } from './types';

export class Grid {
  N: i32 = 0;
  L: Real = 0;
  dx: Real = 0;
  inv: Real = 0;
  periodic: bool = false;

  nc: i32 = 0; // centres: N*N
  nu: i32 = 0; // u faces: (N+1)*N
  nv: i32 = 0; // v faces: N*(N+1)
  nn: i32 = 0; // nodes: (N+1)*(N+1)

  init(N: i32, L: Real, periodic: bool): void {
    this.N = N;
    this.L = L;
    this.dx = L / <Real>N;
    this.inv = 1.0 / this.dx;
    this.periodic = periodic;
    this.nc = N * N;
    this.nu = (N + 1) * N;
    this.nv = N * (N + 1);
    this.nn = (N + 1) * (N + 1);
  }
}

// @ts-ignore
@inline export function idxC(N: i32, i: i32, j: i32): i32 {
  return i + j * N;
}

// @ts-ignore
@inline export function idxU(N: i32, i: i32, j: i32): i32 {
  return i + j * (N + 1);
}

// @ts-ignore
@inline export function idxV(N: i32, i: i32, j: i32): i32 {
  return i + j * N;
}

// @ts-ignore
@inline export function idxN(N: i32, i: i32, j: i32): i32 {
  return i + j * (N + 1);
}

// Cross-sampling velocity on staggered grid
// @ts-ignore
@inline export function uAtV(u: Float64Array, N: i32, i: i32, j: i32): Real {
  const jm = j - 1 < 0 ? 0 : j - 1;
  const jc = j > N - 1 ? N - 1 : j;
  return 0.25 * (
    u[idxU(N, i,     jm)] + u[idxU(N, i + 1, jm)] +
    u[idxU(N, i,     jc)] + u[idxU(N, i + 1, jc)]
  );
}

// @ts-ignore
@inline export function vAtU(v: Float64Array, N: i32, i: i32, j: i32): Real {
  const im = i - 1 < 0 ? 0 : i - 1;
  const ic = i > N - 1 ? N - 1 : i;
  return 0.25 * (
    v[idxV(N, im, j)]     + v[idxV(N, ic, j)] +
    v[idxV(N, im, j + 1)] + v[idxV(N, ic, j + 1)]
  );
}

// Bilinear sample of u field at world coords (x, y)
export function sampleU(u: Float64Array, N: i32, inv: Real, x: Real, y: Real, periodic: bool = false): Real {
  let gx = x * inv;
  let gy = y * inv - 0.5;

  if (periodic) {
    gx = gx - Math.floor(gx / <Real>N) * <Real>N;
    if (gx < 0.0) gx += <Real>N;
    gy = gy - Math.floor(gy / <Real>N) * <Real>N;
    if (gy < 0.0) gy += <Real>N;
  }

  let i0 = <i32>Math.floor(gx);
  let j0 = <i32>Math.floor(gy);
  const fx = gx - <Real>i0;
  const fy = gy - <Real>j0;

  if (periodic) {
    const i1 = (i0 + 1) % N;
    const j1 = (j0 + 1) % N;
    const i0w = (i0 % N + N) % N;
    const j0w = (j0 % N + N) % N;
    const a = u[idxU(N, i0w, j0w)], b = u[idxU(N, i1, j0w)];
    const c = u[idxU(N, i0w, j1)],  d = u[idxU(N, i1, j1)];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  if (i0 < 0) i0 = 0;
  if (i0 > N - 1) i0 = N - 1;
  if (j0 < 0) j0 = 0;
  if (j0 > N - 2) j0 = N - 2;

  const a = u[idxU(N, i0,     j0)];
  const b = u[idxU(N, i0 + 1, j0)];
  const c = u[idxU(N, i0,     j0 + 1)];
  const d = u[idxU(N, i0 + 1, j0 + 1)];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// Bilinear sample of v field at world coords (x, y)
export function sampleV(v: Float64Array, N: i32, inv: Real, x: Real, y: Real, periodic: bool = false): Real {
  let gx = x * inv - 0.5;
  let gy = y * inv;

  if (periodic) {
    gx = gx - Math.floor(gx / <Real>N) * <Real>N;
    if (gx < 0.0) gx += <Real>N;
    gy = gy - Math.floor(gy / <Real>N) * <Real>N;
    if (gy < 0.0) gy += <Real>N;
  }

  let i0 = <i32>Math.floor(gx);
  let j0 = <i32>Math.floor(gy);
  const fx = gx - <Real>i0;
  const fy = gy - <Real>j0;

  if (periodic) {
    const i1 = (i0 + 1) % N;
    const j1 = (j0 + 1) % N;
    const i0w = (i0 % N + N) % N;
    const j0w = (j0 % N + N) % N;
    const a = v[idxV(N, i0w, j0w)], b = v[idxV(N, i1, j0w)];
    const c = v[idxV(N, i0w, j1)],  d = v[idxV(N, i1, j1)];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  if (i0 < 0) i0 = 0;
  if (i0 > N - 2) i0 = N - 2;
  if (j0 < 0) j0 = 0;
  if (j0 > N - 1) j0 = N - 1;

  const a = v[idxV(N, i0,     j0)];
  const b = v[idxV(N, i0 + 1, j0)];
  const c = v[idxV(N, i0,     j0 + 1)];
  const d = v[idxV(N, i0 + 1, j0 + 1)];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// Ghost values for u (tangential above/below, or normal/periodic)
// dir: +1 = above (j = N), -1 = below (j = -1)
// @ts-ignore
@inline export function ghostU(u: Float64Array, N: i32, i: i32, jRef: i32, dir: i32, mode: i32 = 0, uWallTop: Real = 0.0, uWallBot: Real = 0.0): Real {
  if (mode == MODE_PERIODIC) {
    if (dir > 0) return u[idxU(N, i, 0)];
    return u[idxU(N, i, N - 1)];
  }
  if (dir > 0) {
    return 2.0 * uWallTop - u[idxU(N, i, jRef)];
  } else {
    return 2.0 * uWallBot - u[idxU(N, i, jRef)];
  }
}

// Ghost values for v (tangential left/right, or normal/periodic)
// dir: +1 = right (i = N), -1 = left (i = -1)
// @ts-ignore
@inline export function ghostV(v: Float64Array, N: i32, iRef: i32, j: i32, dir: i32, mode: i32 = 0, vWallRight: Real = 0.0, vWallLeft: Real = 0.0): Real {
  if (mode == MODE_PERIODIC || mode == MODE_CHANNEL) {
    if (dir > 0) return v[idxV(N, 0, j)];
    return v[idxV(N, N - 1, j)];
  }
  if (dir > 0) {
    return 2.0 * vWallRight - v[idxV(N, iRef, j)];
  } else {
    return 2.0 * vWallLeft - v[idxV(N, iRef, j)];
  }
}

// Divergence of velocity field at cell centres
export function calcDivergence(div: Float64Array, u: Float64Array, v: Float64Array, N: i32, inv: Real): void {
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dudx = (u[idxU(N, i + 1, j)] - u[idxU(N, i, j)]) * inv;
      const dvdy = (v[idxV(N, i, j + 1)] - v[idxV(N, i, j)]) * inv;
      div[idxC(N, i, j)] = dudx + dvdy;
    }
  }
}

// Compute gradient of scalar phi (at cell centres) and subtract factor * grad(phi) from velocity
export function applyGradient(u: Float64Array, v: Float64Array, phi: Float64Array, N: i32, inv: Real, factor: Real, mode: i32 = 0): void {
  // u faces: i in [1, N-1], j in [0, N-1]
  for (let j = 0; j < N; j++) {
    for (let i = 1; i < N; i++) {
      const gradPx = (phi[idxC(N, i, j)] - phi[idxC(N, i - 1, j)]) * inv;
      u[idxU(N, i, j)] -= factor * gradPx;
    }
    // Periodic / Channel boundary for u
    if (mode == MODE_PERIODIC || mode == MODE_CHANNEL) {
      const gradPx = (phi[idxC(N, 0, j)] - phi[idxC(N, N - 1, j)]) * inv;
      u[idxU(N, 0, j)] -= factor * gradPx;
      u[idxU(N, N, j)] = u[idxU(N, 0, j)];
    }
  }

  // v faces: i in [0, N-1], j in [1, N-1]
  for (let j = 1; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const gradPy = (phi[idxC(N, i, j)] - phi[idxC(N, i, j - 1)]) * inv;
      v[idxV(N, i, j)] -= factor * gradPy;
    }
  }
  if (mode == MODE_PERIODIC) {
    for (let i = 0; i < N; i++) {
      const gradPy = (phi[idxC(N, i, 0)] - phi[idxC(N, i, N - 1)]) * inv;
      v[idxV(N, i, 0)] -= factor * gradPy;
      v[idxV(N, i, N)] = v[idxV(N, i, 0)];
    }
  }
}
