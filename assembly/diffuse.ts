// assembly/diffuse.ts
import { Real, MODE_PERIODIC, MODE_CHANNEL } from './types';
import { idxC, idxU, idxV, idxN, ghostU, ghostV } from './grid';

export function computeViscousDivergence(
  outU: Float64Array,
  outV: Float64Array,
  u: Float64Array,
  v: Float64Array,
  muC: Float64Array,
  muN: Float64Array,
  N: i32,
  dx: Real,
  inv: Real,
  mode: i32 = 0,
  uWallTop: Real = 0.0,
  uWallBot: Real = 0.0,
  vWallRight: Real = 0.0,
  vWallLeft: Real = 0.0
): void {
  const invDx2 = inv * inv;

  // L_mu u
  for (let j = 0; j < N; j++) {
    for (let i = 1; i < N; i++) {
      const k = idxU(N, i, j);
      const mR = muC[idxC(N, i,     j)];
      const mL = muC[idxC(N, i - 1, j)];
      const mT = muN[idxN(N, i, j + 1)];
      const mB = muN[idxN(N, i, j)];

      const uR = u[idxU(N, i + 1, j)];
      const uC = u[k];
      const uL = u[idxU(N, i - 1, j)];
      const uT = (j < N - 1) ? u[idxU(N, i, j + 1)] : ghostU(u, N, i, N - 1, +1, mode, uWallTop, uWallBot);
      const uB = (j > 0)     ? u[idxU(N, i, j - 1)] : ghostU(u, N, i, 0,     -1, mode, uWallTop, uWallBot);

      const vTR = v[idxV(N, i,     j + 1)];
      const vTL = v[idxV(N, i - 1, j + 1)];
      const vBR = v[idxV(N, i,     j)];
      const vBL = v[idxV(N, i - 1, j)];

      const dxx = (2.0 * mR * (uR - uC) - 2.0 * mL * (uC - uL)) * invDx2;
      const dyy = (mT * ((uT - uC) * inv + (vTR - vTL) * inv) - mB * ((uC - uB) * inv + (vBR - vBL) * inv)) * inv;

      outU[k] = dxx + dyy;
    }

    if (mode == MODE_PERIODIC || mode == MODE_CHANNEL) {
      const k0 = idxU(N, 0, j);
      const mR = muC[idxC(N, 0,     j)];
      const mL = muC[idxC(N, N - 1, j)];
      const mT = muN[idxN(N, 0, j + 1)];
      const mB = muN[idxN(N, 0, j)];

      const uR = u[idxU(N, 1, j)];
      const uC = u[k0];
      const uL = u[idxU(N, N - 1, j)];
      const uT = (j < N - 1) ? u[idxU(N, 0, j + 1)] : ghostU(u, N, 0, N - 1, +1, mode, uWallTop, uWallBot);
      const uB = (j > 0)     ? u[idxU(N, 0, j - 1)] : ghostU(u, N, 0, 0,     -1, mode, uWallTop, uWallBot);

      const vTR = v[idxV(N, 0, j + 1)];
      const vTL = v[idxV(N, N - 1, j + 1)];
      const vBR = v[idxV(N, 0, j)];
      const vBL = v[idxV(N, N - 1, j)];

      const dxx = (2.0 * mR * (uR - uC) - 2.0 * mL * (uC - uL)) * invDx2;
      const dyy = (mT * ((uT - uC) * inv + (vTR - vTL) * inv) - mB * ((uC - uB) * inv + (vBR - vBL) * inv)) * inv;

      outU[k0] = dxx + dyy;
      outU[idxU(N, N, j)] = outU[k0];
    } else {
      outU[idxU(N, 0, j)] = 0.0;
      outU[idxU(N, N, j)] = 0.0;
    }
  }

  // L_mu v
  for (let j = 1; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idxV(N, i, j);
      const mT = muC[idxC(N, i, j)];
      const mB = muC[idxC(N, i, j - 1)];
      const mR = muN[idxN(N, i + 1, j)];
      const mL = muN[idxN(N, i,     j)];

      const vT = v[idxV(N, i, j + 1)];
      const vC = v[k];
      const vB = v[idxV(N, i, j - 1)];
      const vR = (i < N - 1) ? v[idxV(N, i + 1, j)] : ghostV(v, N, N - 1, j, +1, mode, vWallRight, vWallLeft);
      const vL = (i > 0)     ? v[idxV(N, i - 1, j)] : ghostV(v, N, 0,     j, -1, mode, vWallRight, vWallLeft);

      const uRT = u[idxU(N, i + 1, j)];
      const uRB = u[idxU(N, i + 1, j - 1)];
      const uLT = u[idxU(N, i,     j)];
      const uLB = u[idxU(N, i,     j - 1)];

      const dyy = (2.0 * mT * (vT - vC) - 2.0 * mB * (vC - vB)) * invDx2;
      const dxx = (mR * ((vR - vC) * inv + (uRT - uRB) * inv) - mL * ((vC - vL) * inv + (uLT - uLB) * inv)) * inv;

      outV[k] = dxx + dyy;
    }
  }
  if (mode == MODE_PERIODIC) {
    for (let i = 0; i < N; i++) {
      const k0 = idxV(N, i, 0);
      const mT = muC[idxC(N, i, 0)];
      const mB = muC[idxC(N, i, N - 1)];
      const mR = muN[idxN(N, i + 1, 0)];
      const mL = muN[idxN(N, i,     0)];

      const vT = v[idxV(N, i, 1)];
      const vC = v[k0];
      const vB = v[idxV(N, i, N - 1)];
      const vR = (i < N - 1) ? v[idxV(N, i + 1, 0)] : ghostV(v, N, N - 1, 0, +1, mode, vWallRight, vWallLeft);
      const vL = (i > 0)     ? v[idxV(N, i - 1, 0)] : ghostV(v, N, 0,     0, -1, mode, vWallRight, vWallLeft);

      const uRT = u[idxU(N, i + 1, 0)];
      const uRB = u[idxU(N, i + 1, N - 1)];
      const uLT = u[idxU(N, i,     0)];
      const uLB = u[idxU(N, i,     N - 1)];

      const dyy = (2.0 * mT * (vT - vC) - 2.0 * mB * (vC - vB)) * invDx2;
      const dxx = (mR * ((vR - vC) * inv + (uRT - uRB) * inv) - mL * ((vC - vL) * inv + (uLT - uLB) * inv)) * inv;

      outV[k0] = dxx + dyy;
      outV[idxV(N, i, N)] = outV[k0];
    }
  } else {
    for (let i = 0; i < N; i++) {
      outV[idxV(N, i, 0)] = 0.0;
      outV[idxV(N, i, N)] = 0.0;
    }
  }
}

export function diffuseVelocity(
  u: Float64Array,
  v: Float64Array,
  rhsU: Float64Array,
  rhsV: Float64Array,
  tmpU: Float64Array,
  tmpV: Float64Array,
  muC: Float64Array,
  muN: Float64Array,
  N: i32,
  dx: Real,
  inv: Real,
  dt: Real,
  rho: Real,
  nIter: i32 = 24,
  omegaDamp: Real = 0.8,
  mode: i32 = 0,
  uWallTop: Real = 0.0,
  uWallBot: Real = 0.0,
  vWallRight: Real = 0.0,
  vWallLeft: Real = 0.0
): void {
  const invDx2 = inv * inv;
  const a = dt / rho * invDx2;

  // Build explicit RHS for u: rhsU = u* + a * [ muN_T*(v_T - v_T_left) - muN_B*(v_B - v_B_left) ]
  for (let j = 0; j < N; j++) {
    for (let i = 1; i < N; i++) {
      const k = idxU(N, i, j);
      const nT = idxN(N, i, j + 1);
      const nB = idxN(N, i, j);
      const vTR = v[idxV(N, i,     j + 1)];
      const vTL = v[idxV(N, i - 1, j + 1)];
      const vBR = v[idxV(N, i,     j)];
      const vBL = v[idxV(N, i - 1, j)];
      const cross = muN[nT] * (vTR - vTL) - muN[nB] * (vBR - vBL);
      rhsU[k] = u[k] + a * cross;
    }
    if (mode == MODE_PERIODIC || mode == MODE_CHANNEL) {
      const k0 = idxU(N, 0, j);
      const nT = idxN(N, 0, j + 1);
      const nB = idxN(N, 0, j);
      const vTR = v[idxV(N, 0, j + 1)];
      const vTL = v[idxV(N, N - 1, j + 1)];
      const vBR = v[idxV(N, 0, j)];
      const vBL = v[idxV(N, N - 1, j)];
      const cross = muN[nT] * (vTR - vTL) - muN[nB] * (vBR - vBL);
      rhsU[k0] = u[k0] + a * cross;
    }
  }

  // Build explicit RHS for v: rhsV = v* + a * [ muN_R*(u_R_top - u_R_bot) - muN_L*(u_L_top - u_L_bot) ]
  for (let j = 1; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idxV(N, i, j);
      const nR = idxN(N, i + 1, j);
      const nL = idxN(N, i,     j);
      const uRT = u[idxU(N, i + 1, j)];
      const uRB = u[idxU(N, i + 1, j - 1)];
      const uLT = u[idxU(N, i,     j)];
      const uLB = u[idxU(N, i,     j - 1)];
      const cross = muN[nR] * (uRT - uRB) - muN[nL] * (uLT - uLB);
      rhsV[k] = v[k] + a * cross;
    }
  }
  if (mode == MODE_PERIODIC) {
    for (let i = 0; i < N; i++) {
      const k0 = idxV(N, i, 0);
      const nR = idxN(N, i + 1, 0);
      const nL = idxN(N, i,     0);
      const uRT = u[idxU(N, i + 1, 0)];
      const uRB = u[idxU(N, i + 1, N - 1)];
      const uLT = u[idxU(N, i,     0)];
      const uLB = u[idxU(N, i,     N - 1)];
      const cross = muN[nR] * (uRT - uRB) - muN[nL] * (uLT - uLB);
      rhsV[k0] = v[k0] + a * cross;
    }
  }

  // Jacobi sweeps
  for (let it = 0; it < nIter; it++) {
    // Sweep u
    for (let j = 0; j < N; j++) {
      for (let i = 1; i < N; i++) {
        const k = idxU(N, i, j);
        const mR = muC[idxC(N, i,     j)];
        const mL = muC[idxC(N, i - 1, j)];
        const mT = muN[idxN(N, i, j + 1)];
        const mB = muN[idxN(N, i, j)];

        const uR = u[idxU(N, i + 1, j)];
        const uL = u[idxU(N, i - 1, j)];
        const uT = (j < N - 1) ? u[idxU(N, i, j + 1)] : ghostU(u, N, i, N - 1, +1, mode, uWallTop, uWallBot);
        const uB = (j > 0)     ? u[idxU(N, i, j - 1)] : ghostU(u, N, i, 0,     -1, mode, uWallTop, uWallBot);

        const off = a * (2.0 * mR * uR + 2.0 * mL * uL + mT * uT + mB * uB);
        const diag = 1.0 + a * (2.0 * mR + 2.0 * mL + mT + mB);
        const uNew = (rhsU[k] + off) / diag;
        tmpU[k] = u[k] + omegaDamp * (uNew - u[k]);
      }

      if (mode == MODE_PERIODIC || mode == MODE_CHANNEL) {
        const k0 = idxU(N, 0, j);
        const mR = muC[idxC(N, 0,     j)];
        const mL = muC[idxC(N, N - 1, j)];
        const mT = muN[idxN(N, 0, j + 1)];
        const mB = muN[idxN(N, 0, j)];

        const uR = u[idxU(N, 1, j)];
        const uL = u[idxU(N, N - 1, j)];
        const uT = (j < N - 1) ? u[idxU(N, 0, j + 1)] : ghostU(u, N, 0, N - 1, +1, mode, uWallTop, uWallBot);
        const uB = (j > 0)     ? u[idxU(N, 0, j - 1)] : ghostU(u, N, 0, 0,     -1, mode, uWallTop, uWallBot);

        const off = a * (2.0 * mR * uR + 2.0 * mL * uL + mT * uT + mB * uB);
        const diag = 1.0 + a * (2.0 * mR + 2.0 * mL + mT + mB);
        const uNew = (rhsU[k0] + off) / diag;
        tmpU[k0] = u[k0] + omegaDamp * (uNew - u[k0]);
        tmpU[idxU(N, N, j)] = tmpU[k0];
      }
    }

    // Copy tmpU -> u
    for (let k = 0; k < (N + 1) * N; k++) {
      u[k] = tmpU[k];
    }

    // Sweep v
    for (let j = 1; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = idxV(N, i, j);
        const mT = muC[idxC(N, i, j)];
        const mB = muC[idxC(N, i, j - 1)];
        const mR = muN[idxN(N, i + 1, j)];
        const mL = muN[idxN(N, i,     j)];

        const vT = v[idxV(N, i, j + 1)];
        const vB = v[idxV(N, i, j - 1)];
        const vR = (i < N - 1) ? v[idxV(N, i + 1, j)] : ghostV(v, N, N - 1, j, +1, mode, vWallRight, vWallLeft);
        const vL = (i > 0)     ? v[idxV(N, i - 1, j)] : ghostV(v, N, 0,     j, -1, mode, vWallRight, vWallLeft);

        const off = a * (2.0 * mT * vT + 2.0 * mB * vB + mR * vR + mL * vL);
        const diag = 1.0 + a * (2.0 * mT + 2.0 * mB + mR + mL);
        const vNew = (rhsV[k] + off) / diag;
        tmpV[k] = v[k] + omegaDamp * (vNew - v[k]);
      }
    }
    if (mode == MODE_PERIODIC) {
      for (let i = 0; i < N; i++) {
        const k0 = idxV(N, i, 0);
        const mT = muC[idxC(N, i, 0)];
        const mB = muC[idxC(N, i, N - 1)];
        const mR = muN[idxN(N, i + 1, 0)];
        const mL = muN[idxN(N, i,     0)];

        const vT = v[idxV(N, i, 1)];
        const vB = v[idxV(N, i, N - 1)];
        const vR = (i < N - 1) ? v[idxV(N, i + 1, 0)] : ghostV(v, N, N - 1, 0, +1, mode, vWallRight, vWallLeft);
        const vL = (i > 0)     ? v[idxV(N, i - 1, 0)] : ghostV(v, N, 0,     0, -1, mode, vWallRight, vWallLeft);

        const off = a * (2.0 * mT * vT + 2.0 * mB * vB + mR * vR + mL * vL);
        const diag = 1.0 + a * (2.0 * mT + 2.0 * mB + mR + mL);
        const vNew = (rhsV[k0] + off) / diag;
        tmpV[k0] = v[k0] + omegaDamp * (vNew - v[k0]);
        tmpV[idxV(N, i, N)] = tmpV[k0];
      }
    }

    // Copy tmpV -> v
    for (let k = 0; k < N * (N + 1); k++) {
      v[k] = tmpV[k];
    }
  }
}
