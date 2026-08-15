// assembly/penalize.ts
import { Real } from './types';
import { idxC, idxU, idxV } from './grid';

export function penalizeVelocity(
  u: Float64Array,
  v: Float64Array,
  chi: Float64Array,
  uWallX: Float64Array,
  uWallY: Float64Array,
  N: i32,
  dt: Real,
  eta: Real
): void {
  const factor = dt / eta;

  // Penalize u on faces
  for (let j = 0; j < N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = idxU(N, i, j);
      const cL = i > 0 ? idxC(N, i - 1, j) : idxC(N, 0, j);
      const cR = i < N ? idxC(N, i,     j) : idxC(N, N - 1, j);
      const chiFace = 0.5 * (chi[cL] + chi[cR]);

      if (chiFace > 0.0) {
        const uW = 0.5 * (uWallX[cL] + uWallX[cR]);
        const alpha = factor * chiFace;
        u[k] = (u[k] + alpha * uW) / (1.0 + alpha);
      }
    }
  }

  // Penalize v on faces
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i < N; i++) {
      const k = idxV(N, i, j);
      const cB = j > 0 ? idxC(N, i, j - 1) : idxC(N, i, 0);
      const cT = j < N ? idxC(N, i, j    ) : idxC(N, i, N - 1);
      const chiFace = 0.5 * (chi[cB] + chi[cT]);

      if (chiFace > 0.0) {
        const vW = 0.5 * (uWallY[cB] + uWallY[cT]);
        const alpha = factor * chiFace;
        v[k] = (v[k] + alpha * vW) / (1.0 + alpha);
      }
    }
  }
}
