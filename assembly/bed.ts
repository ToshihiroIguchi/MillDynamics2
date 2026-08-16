// assembly/bed.ts
import { Real } from './types';
import { idxC, idxU, idxV } from './grid';

// Bisection to solve chord offset d such that segment area = J * pi * R^2 (KERNEL_REFERENCE.md §8)
export function solveChordOffset(R: Real, J: Real): Real {
  if (J <= 0.0) return R;
  if (J >= 1.0) return -R;

  const target = J * Math.PI * R * R;
  let lo = -R;
  let hi = R;

  for (let it = 0; it < 60; it++) {
    const mid = 0.5 * (lo + hi);
    const s = Math.sqrt(Math.max(R * R - mid * mid, 0.0));
    const area = R * R * Math.acos(mid / R) - mid * s;
    if (area > target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return 0.5 * (lo + hi);
}

// Update bed indicator chiBed and circulating media velocity fields
export function updateBedMask(
  chiBed: Float64Array,
  uMedia: Float64Array,
  vMedia: Float64Array,
  N: i32,
  dx: Real,
  cx: Real,
  cy: Real,
  R: Real,
  J: Real,
  thetaRepose: Real,
  omega: Real,
  kSlip: Real,
  chi: Float64Array = new Float64Array(0)
): void {
  if (J <= 0.0 || R <= 0.0) {
    const nc = N * N;
    for (let k = 0; k < nc; k++) chiBed[k] = 0.0;
    const nu = (N + 1) * N;
    for (let k = 0; k < nu; k++) uMedia[k] = 0.0;
    const nv = N * (N + 1);
    for (let k = 0; k < nv; k++) vMedia[k] = 0.0;
    return;
  }

  const d = solveChordOffset(R, J);

  // Surface normal vector n (pointing into the free zone)
  // For CCW rotation (omega >= 0): inclined up to the right, n = (-sin theta_r, cos theta_r)
  // For CW rotation (omega < 0): n = (+sin theta_r, cos theta_r)
  const signOmega: Real = omega >= 0.0 ? 1.0 : -1.0;
  const nx = -signOmega * Math.sin(thetaRepose);
  const ny = Math.cos(thetaRepose);

  // 1. Bed indicator at cell centres: smooth transition over dx.
  // Excluded from the solid: there is no grinding media inside the shell wall or
  // inside a lifter. Without this the Ergun drag (coefficient ~1e5 1/s) and the
  // Brinkman penalization (chi/eta ~ 1e4 1/s) both act on the same wall-adjacent
  // cells, pinning them at k_slip*omega*r while the shell demands omega*r, which
  // shows up as a large permanent spurious shell torque.
  const useChi = chi.length == N * N;
  const invWidth = 1.0 / dx;
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx - cy;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx - cx;
      const r = Math.sqrt(x * x + y * y);
      
      // Inside mill circle: r <= R
      const dCyl = r - R; // <= 0 inside circle
      // Below free surface chord: (x*nx + y*ny) <= -d => distChord = (x*nx + y*ny) + d <= 0 inside bed
      const dChord = (x * nx + y * ny) + d;
      
      // The bed is the intersection { r <= R } and { (x,y).n + d <= 0 }
      // Outside bed: max(dCyl, dChord) > 0
      const dBed = Math.max(dCyl, dChord);
      
      // chiBed: 1 inside bed (dBed < 0), 0 outside bed (dBed > 0)
      const c = idxC(N, i, j);
      let cb = 0.5 * (1.0 - Math.tanh(dBed * invWidth));
      if (useChi) cb *= (1.0 - chi[c]);
      chiBed[c] = cb;
    }
  }

  // 2. Media circulating velocity on u faces
  const wMedia = kSlip * omega;
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx - cy;
    for (let i = 0; i <= N; i++) {
      uMedia[idxU(N, i, j)] = -wMedia * y;
    }
  }

  // 3. Media circulating velocity on v faces
  for (let j = 0; j <= N; j++) {
    const y = j * dx - cy;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx - cx;
      vMedia[idxV(N, i, j)] = wMedia * x;
    }
  }
}
