// assembly/strain.ts
import { Real, MODE_PERIODIC, MODE_CHANNEL } from './types';
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
  const isXPeriodic = (mode == MODE_PERIODIC || mode == MODE_CHANNEL);
  const isYPeriodic = (mode == MODE_PERIODIC);

  // 1. Shear strain rate (dudy + dvdx) at nodes (i,j) in [0,N] x [0,N]
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const uUp = (j < N) ? u[idxU(N, i, j)]     : (isYPeriodic ? u[idxU(N, i, 0)]     : ghostU(u, N, i, N - 1, +1, mode, uWallTop, uWallBot));
      const uDn = (j > 0) ? u[idxU(N, i, j - 1)] : (isYPeriodic ? u[idxU(N, i, N - 1)] : ghostU(u, N, i, 0,     -1, mode, uWallTop, uWallBot));
      const vRt = (i < N) ? v[idxV(N, i, j)]     : (isXPeriodic ? v[idxV(N, 0, j)]     : ghostV(v, N, N - 1, j, +1, mode, vWallRight, vWallLeft));
      const vLf = (i > 0) ? v[idxV(N, i - 1, j)] : (isXPeriodic ? v[idxV(N, N - 1, j)] : ghostV(v, N, 0,     j, -1, mode, vWallRight, vWallLeft));
      const s = (uUp - uDn) * inv + (vRt - vLf) * inv;
      sNode[idxN(N, i, j)] = s;
    }
  }

  // 2. gamma-dot and mu at cell centres
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

  // 3. Direct node viscosity from node shear strain rate (prevents double-averaging yield blurring)
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const s = Math.abs(sNode[idxN(N, i, j)]);
      muN[idxN(N, i, j)] = muApp(s, K, n, tauY, m, muMin, muMax);
    }
  }
}
