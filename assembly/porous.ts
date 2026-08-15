// assembly/porous.ts
import { Real } from './types';
import { idxC, idxU, idxV } from './grid';
import { muApp } from './rheology';

export function computePermeability(epsilon: Real, dp: Real, A: Real): Real {
  const oneMinusEps = 1.0 - epsilon;
  const eps3 = epsilon * epsilon * epsilon;
  const dp2 = dp * dp;
  return (eps3 * dp2) / (A * oneMinusEps * oneMinusEps);
}

export function applyPorousDrag(
  u: Float64Array,
  v: Float64Array,
  uMedia: Float64Array,
  vMedia: Float64Array,
  chiBed: Float64Array,
  gammaDot: Float64Array,
  N: i32,
  dt: Real,
  rho: Real,
  epsilon: Real,
  dp: Real,
  A_ergun: Real,
  B_ergun: Real,
  C_gamma: Real,
  K: Real,
  n: Real,
  tauY: Real,
  m: Real,
  muMin: Real,
  muMax: Real
): void {
  if (epsilon <= 0.0 || epsilon >= 1.0 || dp <= 0.0) return;

  const oneMinusEps = 1.0 - epsilon;
  const eps3 = epsilon * epsilon * epsilon;
  const dp2 = dp * dp;
  const K_perm = (eps3 * dp2) / (A_ergun * oneMinusEps * oneMinusEps);
  const sqrtK = Math.sqrt(K_perm);
  const invRho = 1.0 / rho;

  const darcyCoeff = (A_ergun * oneMinusEps * oneMinusEps) / (eps3 * dp2);
  const forchCoeff = (B_ergun * rho * oneMinusEps) / (eps3 * dp);
  const poreShearCoeff = C_gamma / (epsilon * sqrtK);

  // 1. Porous drag on u faces: i in [0, N], j in [0, N-1]
  for (let j = 0; j < N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = idxU(N, i, j);
      const cL = i > 0 ? idxC(N, i - 1, j) : idxC(N, 0, j);
      const cR = i < N ? idxC(N, i,     j) : idxC(N, N - 1, j);
      const chiFace = 0.5 * (chiBed[cL] + chiBed[cR]);

      if (chiFace > 0.0) {
        const uM = uMedia[k];
        const uRel = Math.abs(u[k] - uM);
        const gdResolved = 0.5 * (gammaDot[cL] + gammaDot[cR]);
        const gdPore = poreShearCoeff * uRel;
        const gdEffective = gdResolved > gdPore ? gdResolved : gdPore;

        const muEff = muApp(gdEffective, K, n, tauY, m, muMin, muMax);
        const aVal = (darcyCoeff * muEff + forchCoeff * uRel) * invRho * chiFace;
        const dtA = dt * aVal;

        u[k] = (u[k] + dtA * uM) / (1.0 + dtA);
      }
    }
  }

  // 2. Porous drag on v faces: i in [0, N-1], j in [0, N]
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idxV(N, i, j);
      const cB = j > 0 ? idxC(N, i, j - 1) : idxC(N, i, 0);
      const cT = j < N ? idxC(N, i, j    ) : idxC(N, i, N - 1);
      const chiFace = 0.5 * (chiBed[cB] + chiBed[cT]);

      if (chiFace > 0.0) {
        const vM = vMedia[k];
        const vRel = Math.abs(v[k] - vM);
        const gdResolved = 0.5 * (gammaDot[cB] + gammaDot[cT]);
        const gdPore = poreShearCoeff * vRel;
        const gdEffective = gdResolved > gdPore ? gdResolved : gdPore;

        const muEff = muApp(gdEffective, K, n, tauY, m, muMin, muMax);
        const aVal = (darcyCoeff * muEff + forchCoeff * vRel) * invRho * chiFace;
        const dtA = dt * aVal;

        v[k] = (v[k] + dtA * vM) / (1.0 + dtA);
      }
    }
  }
}
