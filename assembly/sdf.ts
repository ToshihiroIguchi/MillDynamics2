// assembly/sdf.ts
import { Real } from './types';
import { idxC, idxU, idxV } from './grid';

// Mill shell: fluid where r < R, solid outside.
// Positive outside (solid), negative inside (fluid).
// @ts-ignore
@inline export function sdfShell(x: Real, y: Real, cx: Real, cy: Real, R: Real): Real {
  const dx = x - cx;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - R;
}

// Cylinder obstacle: solid inside r <= R, fluid outside r > R.
// Negative inside (solid), positive outside (fluid).
// @ts-ignore
@inline export function sdfCylinder(x: Real, y: Real, cx: Real, cy: Real, R: Real): Real {
  const dx = x - cx;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - R;
}

// One lifter bar: a box in the (radial, tangential) frame of angle theta.
// Negative inside the bar (solid), positive outside (fluid).
export function sdfLifter(
  x: Real,
  y: Real,
  cx: Real,
  cy: Real,
  R: Real,
  theta: Real,
  h: Real,
  w: Real,
  alpha: Real
): Real {
  const dx = x - cx;
  const dy = y - cy;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const a =  dx * ct + dy * st;        // radial coordinate
  const b = -dx * st + dy * ct;        // tangential coordinate

  // Box centre at radius R - h/2, half-extents (h/2, w/2), tilted by alpha
  const ca = R - 0.5 * h;
  let pa = a - ca;
  let pb = b;
  if (alpha != 0.0) {
    const cA = Math.cos(alpha);
    const sA = Math.sin(alpha);
    const ra =  pa * cA + pb * sA;
    const rb = -pa * sA + pb * cA;
    pa = ra;
    pb = rb;
  }
  const qa = Math.abs(pa) - 0.5 * h;
  const qb = Math.abs(pb) - 0.5 * w;
  const ox = qa > 0.0 ? qa : 0.0;
  const oy = qb > 0.0 ? qb : 0.0;
  const outside = Math.sqrt(ox * ox + oy * oy);
  const inside = Math.min(Math.max(qa, qb), 0.0);
  return outside + inside;          // negative inside the bar
}

// Compute solid fraction chi and solid velocity fields (uSolid, vSolid)
export function updateMillSolidMask(
  chi: Float64Array,
  uSolid: Float64Array,
  vSolid: Float64Array,
  N: i32,
  dx: Real,
  cx: Real,
  cy: Real,
  R: Real,
  omega: Real,
  nLifters: i32,
  hLifter: Real,
  wLifter: Real,
  alphaLifter: Real,
  currentAngle: Real
): void {
  const twoPi = 2.0 * Math.PI;

  // 1. Cell centres for chi
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx;
      
      // Outside shell (r > R): sdfShell > 0 is solid
      // Lifters: sdfLifter < 0 is solid
      // Let sdfSolid <= 0 denote solid region, > 0 denote fluid
      // Outside shell: dist = R - r = -sdfShell(x, y)
      let dSolid = -sdfShell(x, y, cx, cy, R);

      if (nLifters > 0 && hLifter > 0.0 && wLifter > 0.0) {
        for (let k = 0; k < nLifters; k++) {
          const theta = currentAngle + (<Real>k * twoPi) / <Real>nLifters;
          const dL = sdfLifter(x, y, cx, cy, R, theta, hLifter, wLifter, alphaLifter);
          if (dL < dSolid) dSolid = dL;
        }
      }

      // Smooth step over dx: chi = 0.5 * (1 - tanh(dSolid / dx))
      // When dSolid < 0 (solid): tanh < 0 -> chi -> 1
      // When dSolid > 0 (fluid): tanh > 0 -> chi -> 0
      const s = dSolid / dx;
      chi[idxC(N, i, j)] = 0.5 * (1.0 - Math.tanh(s));
    }
  }

  // 2. u faces: x = i * dx, y = (j + 0.5) * dx
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx;
    const dy = y - cy;
    for (let i = 0; i <= N; i++) {
      uSolid[idxU(N, i, j)] = -omega * dy;
    }
  }

  // 3. v faces: x = (i + 0.5) * dx, y = j * dx
  for (let j = 0; j <= N; j++) {
    const y = j * dx;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx;
      const dxRel = x - cx;
      vSolid[idxV(N, i, j)] = omega * dxRel;
    }
  }
}

// Compute solid fraction chi for a stationary cylinder obstacle
export function updateCylinderSolidMask(
  chi: Float64Array,
  uSolid: Float64Array,
  vSolid: Float64Array,
  N: i32,
  dx: Real,
  cx: Real,
  cy: Real,
  R: Real
): void {
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx;
      const dCylinder = sdfCylinder(x, y, cx, cy, R);
      const s = dCylinder / dx;
      chi[idxC(N, i, j)] = 0.5 * (1.0 - Math.tanh(s));
    }
  }

  for (let k = 0; k < (N + 1) * N; k++) {
    uSolid[k] = 0.0;
  }
  for (let k = 0; k < N * (N + 1); k++) {
    vSolid[k] = 0.0;
  }
}

// Compute solid fraction chi for concentric Taylor-Couette cylinders
export function updateTaylorCouetteSolidMask(
  chi: Float64Array,
  uSolid: Float64Array,
  vSolid: Float64Array,
  N: i32,
  dx: Real,
  cx: Real,
  cy: Real,
  R_i: Real,
  R_o: Real,
  omega_i: Real,
  omega_o: Real
): void {
  const rMid = 0.5 * (R_i + R_o);

  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx;
      const r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const dInner = r - R_i; // < 0 inside inner cylinder
      const dOuter = R_o - r; // < 0 outside outer cylinder
      const dSolid = Math.min(dInner, dOuter);
      const s = dSolid / dx;
      chi[idxC(N, i, j)] = 0.5 * (1.0 - Math.tanh(s));
    }
  }

  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx;
    const dy = y - cy;
    for (let i = 0; i <= N; i++) {
      const x = i * dx;
      const r = Math.sqrt((x - cx) * (x - cx) + dy * dy);
      const w = (r <= rMid) ? omega_i : omega_o;
      uSolid[idxU(N, i, j)] = -w * dy;
    }
  }

  for (let j = 0; j <= N; j++) {
    const y = j * dx;
    const dy = y - cy;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * dx;
      const dxRel = x - cx;
      const r = Math.sqrt(dxRel * dxRel + dy * dy);
      const w = (r <= rMid) ? omega_i : omega_o;
      vSolid[idxV(N, i, j)] = w * dxRel;
    }
  }
}
