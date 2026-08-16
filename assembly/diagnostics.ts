// assembly/diagnostics.ts
import { Real } from './types';
import { idxC, idxU, idxV } from './grid';

// Shell driving torque [N*m per metre of mill length] (KERNEL_REFERENCE.md §10)
//
// The integral must be restricted to the physical wetted wall. Everything at
// r > R is fictitious solid used only to fill the square domain; the pressure
// projection is deliberately *not* masked there (NUMERICS.md §8), so grad(p)
// injects a spurious velocity into those cells every step which penalization
// then has to cancel. Integrating over them added an O(10^5) N*m/m artefact
// dominated by the domain corners, against a physical scale of O(10-100).
// millRadius <= 0 (obstacle / Taylor-Couette modes) keeps the unrestricted sum.
export function computeShellTorque(
  u: Float64Array,
  v: Float64Array,
  chi: Float64Array,
  N: i32,
  dx: Real,
  cx: Real,
  cy: Real,
  omega: Real,
  rho: Real,
  eta: Real,
  millRadius: Real = 0.0
): Real {
  const dA = dx * dx;
  let T: Real = 0.0;

  // Interface band half-width: chi transitions over ~2 cells either side of r = R.
  const rMax = millRadius > 0.0 ? millRadius + 2.0 * dx : 0.0;
  const rMax2 = rMax * rMax;

  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx - cy;
    for (let i = 0; i < N; i++) {
      const c = idxC(N, i, j);
      const ch = chi[c];
      if (ch <= 0.0) continue;

      const x = (i + 0.5) * dx - cx;
      if (rMax2 > 0.0 && (x * x + y * y) > rMax2) continue;
      const uc = 0.5 * (u[idxU(N, i, j)] + u[idxU(N, i + 1, j)]);
      const vc = 0.5 * (v[idxV(N, i, j)] + v[idxV(N, i, j + 1)]);

      const uw = -omega * y;
      const vw = omega * x;

      const Fx = rho * (ch / eta) * (uc - uw) * dA;
      const Fy = rho * (ch / eta) * (vc - vw) * dA;

      // r x F negated: driving torque applied to mill shell
      T -= (x * Fy - y * Fx);
    }
  }

  return T;
}

// Cylinder total drag coefficient C_D
export function computeCylinderDrag(
  u: Float64Array,
  v: Float64Array,
  chi: Float64Array,
  N: i32,
  dx: Real,
  rho: Real,
  eta: Real,
  U_inf: Real,
  d_cyl: Real
): Real {
  const dA = dx * dx;
  let Fx_total: Real = 0.0;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = idxC(N, i, j);
      const ch = chi[c];
      if (ch <= 0.0) continue;

      const uc = 0.5 * (u[idxU(N, i, j)] + u[idxU(N, i + 1, j)]);
      const Fx = rho * (ch / eta) * uc * dA;
      Fx_total += Fx;
    }
  }

  const q = 0.5 * rho * U_inf * U_inf * d_cyl;
  return q > 0.0 ? Fx_total / q : 0.0;
}
