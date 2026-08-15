// assembly/strain.ts
import { Real } from './types';
import { idxC, idxU, idxV, idxN, ghostU, ghostV } from './grid';
import { muApp } from './rheology';

export function computeStrainRate(
  gd: Float64Array,
  muC: Float64Array,
  muN: Float64Array,
  sNode: Float64Array,
  u: Float64Array,
  v: Float64Array,
  N: i32,
  inv: Real,
  K: Real,
  n: Real,
  tauY: Real,
  m: Real,
  muMin: Real,
  muMax: Real,
  mode: i32 = 0,
  uWallTop: Real = 0.0,
  uWallBot: Real = 0.0,
  vWallRight: Real = 0.0,
  vWallLeft: Real = 0.0
): void {
  // dudy + dvdx at nodes (i,j) in [0,N] x [0,N]
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const uUp = (j < N) ? u[idxU(N, i, j)]     : ghostU(u, N, i, N - 1, +1, mode, uWallTop, uWallBot);
      const uDn = (j > 0) ? u[idxU(N, i, j - 1)] : ghostU(u, N, i, 0,     -1, mode, uWallTop, uWallBot);
      const vRt = (i < N) ? v[idxV(N, i, j)]     : ghostV(v, N, N - 1, j, +1, mode, vWallRight, vWallLeft);
      const vLf = (i > 0) ? v[idxV(N, i - 1, j)] : ghostV(v, N, 0,     j, -1, mode, vWallRight, vWallLeft);
      sNode[idxN(N, i, j)] = (uUp - uDn) * inv + (vRt - vLf) * inv;
    }
  }

  // gamma-dot at centres
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = idxC(N, i, j);
      const dudx = (u[idxU(N, i + 1, j)] - u[idxU(N, i, j)]) * inv;
      const dvdy = (v[idxV(N, i, j + 1)] - v[idxV(N, i, j)]) * inv;
      const s = 0.25 * (
        sNode[idxN(N, i,     j)]     + sNode[idxN(N, i + 1, j)] +
        sNode[idxN(N, i,     j + 1)] + sNode[idxN(N, i + 1, j + 1)]
      );
      const val = Math.sqrt(2.0 * dudx * dudx + 2.0 * dvdy * dvdy + s * s);
      gd[c] = val;
      muC[c] = muApp(val, K, n, tauY, m, muMin, muMax);
    }
  }

  // node viscosity = arithmetic mean of the 4 surrounding centres (clamp first!)
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < N ? i : N - 1;
      const j0 = j > 0 ? j - 1 : 0, j1 = j < N ? j : N - 1;
      muN[idxN(N, i, j)] = 0.25 * (
        muC[idxC(N, i0, j0)] + muC[idxC(N, i1, j0)] +
        muC[idxC(N, i0, j1)] + muC[idxC(N, i1, j1)]
      );
    }
  }
}
