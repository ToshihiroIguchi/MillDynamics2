// assembly/advect.ts
import { Real } from './types';
import { idxC, idxU, idxV } from './grid';

// Bilinear sample of a cell-centred scalar field
// @ts-ignore
@inline export function sampleScalar(
  field: Float64Array,
  N: i32,
  inv: Real,
  x: Real,
  y: Real,
  periodic: bool = false
): Real {
  let gx = x * inv - 0.5;
  let gy = y * inv - 0.5;

  if (periodic) {
    gx = gx - Math.floor(gx / <Real>N) * <Real>N;
    if (gx < 0.0) gx += <Real>N;
    gy = gy - Math.floor(gy / <Real>N) * <Real>N;
    if (gy < 0.0) gy += <Real>N;

    const i0 = <i32>Math.floor(gx);
    const j0 = <i32>Math.floor(gy);
    const fx = gx - <Real>i0;
    const fy = gy - <Real>j0;

    const i1 = (i0 + 1) % N;
    const j1 = (j0 + 1) % N;

    const a = field[idxC(N, i0, j0)];
    const b = field[idxC(N, i1, j0)];
    const c = field[idxC(N, i0, j1)];
    const d = field[idxC(N, i1, j1)];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  if (gx < 0.0) gx = 0.0;
  if (gx > <Real>(N - 1)) gx = <Real>(N - 1);
  if (gy < 0.0) gy = 0.0;
  if (gy > <Real>(N - 1)) gy = <Real>(N - 1);

  let i0 = <i32>Math.floor(gx);
  let j0 = <i32>Math.floor(gy);
  if (i0 > N - 2) i0 = N - 2;
  if (j0 > N - 2) j0 = N - 2;
  const fx = gx - <Real>i0;
  const fy = gy - <Real>j0;

  const a = field[idxC(N, i0,     j0)];
  const b = field[idxC(N, i0 + 1, j0)];
  const c = field[idxC(N, i0,     j0 + 1)];
  const d = field[idxC(N, i0 + 1, j0 + 1)];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// Bilinear sample of u face field
// @ts-ignore
@inline export function sampleUField(
  u: Float64Array,
  N: i32,
  inv: Real,
  x: Real,
  y: Real,
  periodic: bool = false
): Real {
  let gx = x * inv;
  let gy = y * inv - 0.5;

  if (periodic) {
    gx = gx - Math.floor(gx / <Real>N) * <Real>N;
    if (gx < 0.0) gx += <Real>N;
    if (gx >= <Real>N) gx = 0.0;
    gy = gy - Math.floor(gy / <Real>N) * <Real>N;
    if (gy < 0.0) gy += <Real>N;
    if (gy >= <Real>N) gy = 0.0;

    let i0 = <i32>Math.floor(gx);
    let j0 = <i32>Math.floor(gy);
    if (i0 < 0) i0 = 0;
    if (i0 >= N) i0 = N - 1;
    if (j0 < 0) j0 = 0;
    if (j0 >= N) j0 = N - 1;

    const fx = gx - <Real>i0;
    const fy = gy - <Real>j0;

    const i1 = (i0 + 1) % N;
    const j1 = (j0 + 1) % N;

    const a = u[idxU(N, i0, j0)];
    const b = u[idxU(N, i1, j0)];
    const c = u[idxU(N, i0, j1)];
    const d = u[idxU(N, i1, j1)];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  if (gx < 0.0) gx = 0.0;
  if (gx > <Real>N) gx = <Real>N;
  if (gy < 0.0) gy = 0.0;
  if (gy > <Real>(N - 1)) gy = <Real>(N - 1);

  let i0 = <i32>Math.floor(gx);
  let j0 = <i32>Math.floor(gy);
  if (i0 > N - 1) i0 = N - 1;
  if (j0 > N - 2) j0 = N - 2;
  const fx = gx - <Real>i0;
  const fy = gy - <Real>j0;

  const a = u[idxU(N, i0,     j0)];
  const b = u[idxU(N, i0 + 1, j0)];
  const c = u[idxU(N, i0,     j0 + 1)];
  const d = u[idxU(N, i0 + 1, j0 + 1)];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// Bilinear sample of v face field
// @ts-ignore
@inline export function sampleVField(
  v: Float64Array,
  N: i32,
  inv: Real,
  x: Real,
  y: Real,
  periodic: bool = false
): Real {
  let gx = x * inv - 0.5;
  let gy = y * inv;

  if (periodic) {
    gx = gx - Math.floor(gx / <Real>N) * <Real>N;
    if (gx < 0.0) gx += <Real>N;
    if (gx >= <Real>N) gx = 0.0;
    gy = gy - Math.floor(gy / <Real>N) * <Real>N;
    if (gy < 0.0) gy += <Real>N;
    if (gy >= <Real>N) gy = 0.0;

    let i0 = <i32>Math.floor(gx);
    let j0 = <i32>Math.floor(gy);
    if (i0 < 0) i0 = 0;
    if (i0 >= N) i0 = N - 1;
    if (j0 < 0) j0 = 0;
    if (j0 >= N) j0 = N - 1;

    const fx = gx - <Real>i0;
    const fy = gy - <Real>j0;

    const i1 = (i0 + 1) % N;
    const j1 = (j0 + 1) % N;

    const a = v[idxV(N, i0, j0)];
    const b = v[idxV(N, i1, j0)];
    const c = v[idxV(N, i0, j1)];
    const d = v[idxV(N, i1, j1)];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  if (gx < 0.0) gx = 0.0;
  if (gx > <Real>(N - 1)) gx = <Real>(N - 1);
  if (gy < 0.0) gy = 0.0;
  if (gy > <Real>N) gy = <Real>N;

  let i0 = <i32>Math.floor(gx);
  let j0 = <i32>Math.floor(gy);
  if (i0 > N - 2) i0 = N - 2;
  if (j0 > N - 1) j0 = N - 1;
  const fx = gx - <Real>i0;
  const fy = gy - <Real>j0;

  const a = v[idxV(N, i0,     j0)];
  const b = v[idxV(N, i0 + 1, j0)];
  const c = v[idxV(N, i0,     j0 + 1)];
  const d = v[idxV(N, i0 + 1, j0 + 1)];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// Advect passive scalar field
export function advectScalar(
  dst: Float64Array,
  src: Float64Array,
  phiHat: Float64Array,
  u: Float64Array,
  v: Float64Array,
  N: i32,
  dx: Real,
  inv: Real,
  dt: Real,
  useMacCormack: bool = true,
  periodic: bool = false
): void {
  // Step 1: Standard backward semi-Lagrangian -> phiHat
  for (let j = 0; j < N; j++) {
    const y = (<Real>j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (<Real>i + 0.5) * dx;

      // RK2 backward trace (-dt)
      const u1 = sampleUField(u, N, inv, x, y, periodic);
      const v1 = sampleVField(v, N, inv, x, y, periodic);
      const xMid = x - 0.5 * dt * u1;
      const yMid = y - 0.5 * dt * v1;

      const uMid = sampleUField(u, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(v, N, inv, xMid, yMid, periodic);
      const xBack = x - dt * uMid;
      const yBack = y - dt * vMid;

      phiHat[idxC(N, i, j)] = sampleScalar(src, N, inv, xBack, yBack, periodic);
    }
  }

  if (!useMacCormack) {
    for (let k = 0; k < N * N; k++) {
      dst[k] = phiHat[k];
    }
    return;
  }

  // Step 2: Forward trace on phiHat to evaluate phiTilde, form corrected initial state in dst
  for (let j = 0; j < N; j++) {
    const y = (<Real>j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (<Real>i + 0.5) * dx;
      const k = idxC(N, i, j);

      // RK2 forward trace (+dt)
      const u1 = sampleUField(u, N, inv, x, y, periodic);
      const v1 = sampleVField(v, N, inv, x, y, periodic);
      const xMid = x + 0.5 * dt * u1;
      const yMid = y + 0.5 * dt * v1;

      const uMid = sampleUField(u, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(v, N, inv, xMid, yMid, periodic);
      const xFwd = x + dt * uMid;
      const yFwd = y + dt * vMid;

      const phiTilde = sampleScalar(phiHat, N, inv, xFwd, yFwd, periodic);
      dst[k] = src[k] + 0.5 * (src[k] - phiTilde);
    }
  }

  // Step 3: Backward trace on corrected state dst, with clamping to original src stencil bounds
  for (let j = 0; j < N; j++) {
    const y = (<Real>j + 0.5) * dx;
    for (let i = 0; i < N; i++) {
      const x = (<Real>i + 0.5) * dx;
      const k = idxC(N, i, j);

      // RK2 backward trace (-dt)
      const u1 = sampleUField(u, N, inv, x, y, periodic);
      const v1 = sampleVField(v, N, inv, x, y, periodic);
      const xMid = x - 0.5 * dt * u1;
      const yMid = y - 0.5 * dt * v1;

      const uMid = sampleUField(u, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(v, N, inv, xMid, yMid, periodic);
      const xBack = x - dt * uMid;
      const yBack = y - dt * vMid;

      let valNew = sampleScalar(dst, N, inv, xBack, yBack, periodic);

      // Clamping to src stencil at xBack, yBack
      let gx = xBack * inv - 0.5;
      let gy = yBack * inv - 0.5;

      if (periodic) {
        gx = gx - Math.floor(gx / <Real>N) * <Real>N;
        if (gx < 0.0) gx += <Real>N;
        gy = gy - Math.floor(gy / <Real>N) * <Real>N;
        if (gy < 0.0) gy += <Real>N;

        const i0 = <i32>Math.floor(gx);
        const j0 = <i32>Math.floor(gy);
        const fx = gx - <Real>i0;
        const fy = gy - <Real>j0;

        const i1 = (fx > 1e-12) ? (i0 + 1) % N : i0;
        const j1 = (fy > 1e-12) ? (j0 + 1) % N : j0;

        const a = src[idxC(N, i0, j0)];
        const b = src[idxC(N, i1, j0)];
        const c = src[idxC(N, i0, j1)];
        const d = src[idxC(N, i1, j1)];

        let minVal = a; if (b < minVal) minVal = b; if (c < minVal) minVal = c; if (d < minVal) minVal = d;
        let maxVal = a; if (b > maxVal) maxVal = b; if (c > maxVal) maxVal = c; if (d > maxVal) maxVal = d;

        if (valNew < minVal) valNew = minVal;
        if (valNew > maxVal) valNew = maxVal;
      } else {
        if (gx < 0.0) gx = 0.0;
        if (gx > <Real>(N - 1)) gx = <Real>(N - 1);
        if (gy < 0.0) gy = 0.0;
        if (gy > <Real>(N - 1)) gy = <Real>(N - 1);

        let i0 = <i32>Math.floor(gx);
        let j0 = <i32>Math.floor(gy);
        const fx = gx - <Real>i0;
        const fy = gy - <Real>j0;

        let i1 = (fx > 1e-12) ? i0 + 1 : i0;
        let j1 = (fy > 1e-12) ? j0 + 1 : j0;
        if (i1 > N - 1) i1 = N - 1;
        if (j1 > N - 1) j1 = N - 1;
        if (i0 > N - 1) i0 = N - 1;
        if (j0 > N - 1) j0 = N - 1;

        const a = src[idxC(N, i0, j0)];
        const b = src[idxC(N, i1, j0)];
        const c = src[idxC(N, i0, j1)];
        const d = src[idxC(N, i1, j1)];

        let minVal = a; if (b < minVal) minVal = b; if (c < minVal) minVal = c; if (d < minVal) minVal = d;
        let maxVal = a; if (b > maxVal) maxVal = b; if (c > maxVal) maxVal = c; if (d > maxVal) maxVal = d;

        if (valNew < minVal) valNew = minVal;
        if (valNew > maxVal) valNew = maxVal;
      }

      phiHat[k] = valNew;
    }
  }

  // Copy final result back to dst
  for (let k = 0; k < N * N; k++) {
    dst[k] = phiHat[k];
  }
}

// Advection of velocity components u and v
export function advectVelocity(
  uDst: Float64Array,
  vDst: Float64Array,
  uSrc: Float64Array,
  vSrc: Float64Array,
  uHat: Float64Array,
  vHat: Float64Array,
  N: i32,
  dx: Real,
  inv: Real,
  dt: Real,
  useMacCormack: bool = true,
  periodic: bool = false
): void {
  // --- Step 1: uHat and vHat via backward semi-Lagrangian ---
  for (let j = 0; j < N; j++) {
    const y = (<Real>j + 0.5) * dx;
    for (let i = 0; i <= N; i++) {
      const x = <Real>i * dx;
      const u1 = sampleUField(uSrc, N, inv, x, y, periodic);
      const v1 = sampleVField(vSrc, N, inv, x, y, periodic);
      const xMid = x - 0.5 * dt * u1;
      const yMid = y - 0.5 * dt * v1;
      const uMid = sampleUField(uSrc, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(vSrc, N, inv, xMid, yMid, periodic);
      const xBack = x - dt * uMid;
      const yBack = y - dt * vMid;

      uHat[idxU(N, i, j)] = sampleUField(uSrc, N, inv, xBack, yBack, periodic);
    }
  }

  for (let j = 0; j <= N; j++) {
    const y = <Real>j * dx;
    for (let i = 0; i < N; i++) {
      const x = (<Real>i + 0.5) * dx;
      const u1 = sampleUField(uSrc, N, inv, x, y, periodic);
      const v1 = sampleVField(vSrc, N, inv, x, y, periodic);
      const xMid = x - 0.5 * dt * u1;
      const yMid = y - 0.5 * dt * v1;
      const uMid = sampleUField(uSrc, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(vSrc, N, inv, xMid, yMid, periodic);
      const xBack = x - dt * uMid;
      const yBack = y - dt * vMid;

      vHat[idxV(N, i, j)] = sampleVField(vSrc, N, inv, xBack, yBack, periodic);
    }
  }

  if (!useMacCormack) {
    for (let k = 0; k < (N + 1) * N; k++) uDst[k] = uHat[k];
    for (let k = 0; k < N * (N + 1); k++) vDst[k] = vHat[k];
    return;
  }

  // --- Step 2: Forward trace on uHat, vHat to form corrected fields in uDst, vDst ---
  for (let j = 0; j < N; j++) {
    const y = (<Real>j + 0.5) * dx;
    for (let i = 0; i <= N; i++) {
      const x = <Real>i * dx;
      const k = idxU(N, i, j);

      const u1 = sampleUField(uSrc, N, inv, x, y, periodic);
      const v1 = sampleVField(vSrc, N, inv, x, y, periodic);
      const xMid = x + 0.5 * dt * u1;
      const yMid = y + 0.5 * dt * v1;
      const uMid = sampleUField(uSrc, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(vSrc, N, inv, xMid, yMid, periodic);
      const xFwd = x + dt * uMid;
      const yFwd = y + dt * vMid;

      const uTilde = sampleUField(uHat, N, inv, xFwd, yFwd, periodic);
      uDst[k] = uSrc[k] + 0.5 * (uSrc[k] - uTilde);
    }
  }

  for (let j = 0; j <= N; j++) {
    const y = <Real>j * dx;
    for (let i = 0; i < N; i++) {
      const x = (<Real>i + 0.5) * dx;
      const k = idxV(N, i, j);

      const u1 = sampleUField(uSrc, N, inv, x, y, periodic);
      const v1 = sampleVField(vSrc, N, inv, x, y, periodic);
      const xMid = x + 0.5 * dt * u1;
      const yMid = y + 0.5 * dt * v1;
      const uMid = sampleUField(uSrc, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(vSrc, N, inv, xMid, yMid, periodic);
      const xFwd = x + dt * uMid;
      const yFwd = y + dt * vMid;

      const vTilde = sampleVField(vHat, N, inv, xFwd, yFwd, periodic);
      vDst[k] = vSrc[k] + 0.5 * (vSrc[k] - vTilde);
    }
  }

  // --- Step 3: Backward trace on uDst, vDst with clamping to uSrc, vSrc bounds ---
  for (let j = 0; j < N; j++) {
    const y = (<Real>j + 0.5) * dx;
    for (let i = 0; i <= N; i++) {
      const x = <Real>i * dx;
      const k = idxU(N, i, j);

      const u1 = sampleUField(uSrc, N, inv, x, y, periodic);
      const v1 = sampleVField(vSrc, N, inv, x, y, periodic);
      const xMid = x - 0.5 * dt * u1;
      const yMid = y - 0.5 * dt * v1;
      const uMid = sampleUField(uSrc, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(vSrc, N, inv, xMid, yMid, periodic);
      const xBack = x - dt * uMid;
      const yBack = y - dt * vMid;

      let uNew = sampleUField(uDst, N, inv, xBack, yBack, periodic);

      // Clamp to uSrc
      let gx = xBack * inv;
      let gy = yBack * inv - 0.5;

      if (periodic) {
        gx = gx - Math.floor(gx / <Real>N) * <Real>N;
        if (gx < 0.0) gx += <Real>N;
        if (gx >= <Real>N) gx = 0.0;
        gy = gy - Math.floor(gy / <Real>N) * <Real>N;
        if (gy < 0.0) gy += <Real>N;
        if (gy >= <Real>N) gy = 0.0;

        let i0 = <i32>Math.floor(gx);
        let j0 = <i32>Math.floor(gy);
        if (i0 < 0) i0 = 0;
        if (i0 >= N) i0 = N - 1;
        if (j0 < 0) j0 = 0;
        if (j0 >= N) j0 = N - 1;

        const fx = gx - <Real>i0;
        const fy = gy - <Real>j0;

        const i1 = (fx > 1e-12) ? (i0 + 1) % N : i0;
        const j1 = (fy > 1e-12) ? (j0 + 1) % N : j0;

        const a = uSrc[idxU(N, i0, j0)];
        const b = uSrc[idxU(N, i1, j0)];
        const c = uSrc[idxU(N, i0, j1)];
        const d = uSrc[idxU(N, i1, j1)];

        let minU = a; if (b < minU) minU = b; if (c < minU) minU = c; if (d < minU) minU = d;
        let maxU = a; if (b > maxU) maxU = b; if (c > maxU) maxU = c; if (d > maxU) maxU = d;

        if (uNew < minU) uNew = minU;
        if (uNew > maxU) uNew = maxU;
      } else {
        if (gx < 0.0) gx = 0.0;
        if (gx > <Real>N) gx = <Real>N;
        if (gy < 0.0) gy = 0.0;
        if (gy > <Real>(N - 1)) gy = <Real>(N - 1);

        let i0 = <i32>Math.floor(gx);
        let j0 = <i32>Math.floor(gy);
        const fx = gx - <Real>i0;
        const fy = gy - <Real>j0;

        let i1 = (fx > 1e-12) ? i0 + 1 : i0;
        let j1 = (fy > 1e-12) ? j0 + 1 : j0;
        if (i1 > N) i1 = N;
        if (j1 > N - 1) j1 = N - 1;
        if (i0 > N) i0 = N;
        if (j0 > N - 1) j0 = N - 1;

        const a = uSrc[idxU(N, i0, j0)];
        const b = uSrc[idxU(N, i1, j0)];
        const c = uSrc[idxU(N, i0, j1)];
        const d = uSrc[idxU(N, i1, j1)];

        let minU = a; if (b < minU) minU = b; if (c < minU) minU = c; if (d < minU) minU = d;
        let maxU = a; if (b > maxU) maxU = b; if (c > maxU) maxU = c; if (d > maxU) maxU = d;

        if (uNew < minU) uNew = minU;
        if (uNew > maxU) uNew = maxU;
      }

      uHat[k] = uNew;
    }
  }

  for (let j = 0; j <= N; j++) {
    const y = <Real>j * dx;
    for (let i = 0; i < N; i++) {
      const x = (<Real>i + 0.5) * dx;
      const k = idxV(N, i, j);

      const u1 = sampleUField(uSrc, N, inv, x, y, periodic);
      const v1 = sampleVField(vSrc, N, inv, x, y, periodic);
      const xMid = x - 0.5 * dt * u1;
      const yMid = y - 0.5 * dt * v1;
      const uMid = sampleUField(uSrc, N, inv, xMid, yMid, periodic);
      const vMid = sampleVField(vSrc, N, inv, xMid, yMid, periodic);
      const xBack = x - dt * uMid;
      const yBack = y - dt * vMid;

      let vNew = sampleVField(vDst, N, inv, xBack, yBack, periodic);

      // Clamp to vSrc
      let gx = xBack * inv - 0.5;
      let gy = yBack * inv;

      if (periodic) {
        gx = gx - Math.floor(gx / <Real>N) * <Real>N;
        if (gx < 0.0) gx += <Real>N;
        if (gx >= <Real>N) gx = 0.0;
        gy = gy - Math.floor(gy / <Real>N) * <Real>N;
        if (gy < 0.0) gy += <Real>N;
        if (gy >= <Real>N) gy = 0.0;

        let i0 = <i32>Math.floor(gx);
        let j0 = <i32>Math.floor(gy);
        if (i0 < 0) i0 = 0;
        if (i0 >= N) i0 = N - 1;
        if (j0 < 0) j0 = 0;
        if (j0 >= N) j0 = N - 1;

        const fx = gx - <Real>i0;
        const fy = gy - <Real>j0;

        const i1 = (fx > 1e-12) ? (i0 + 1) % N : i0;
        const j1 = (fy > 1e-12) ? (j0 + 1) % N : j0;

        const a = vSrc[idxV(N, i0, j0)];
        const b = vSrc[idxV(N, i1, j0)];
        const c = vSrc[idxV(N, i0, j1)];
        const d = vSrc[idxV(N, i1, j1)];

        let minV = a; if (b < minV) minV = b; if (c < minV) minV = c; if (d < minV) minV = d;
        let maxV = a; if (b > maxV) maxV = b; if (c > maxV) maxV = c; if (d > maxV) maxV = d;

        if (vNew < minV) vNew = minV;
        if (vNew > maxV) vNew = maxV;
      } else {
        if (gx < 0.0) gx = 0.0;
        if (gx > <Real>(N - 1)) gx = <Real>(N - 1);
        if (gy < 0.0) gy = 0.0;
        if (gy > <Real>N) gy = <Real>N;

        let i0 = <i32>Math.floor(gx);
        let j0 = <i32>Math.floor(gy);
        const fx = gx - <Real>i0;
        const fy = gy - <Real>j0;

        let i1 = (fx > 1e-12) ? i0 + 1 : i0;
        let j1 = (fy > 1e-12) ? j0 + 1 : j0;
        if (i1 > N - 1) i1 = N - 1;
        if (j1 > N) j1 = N;
        if (i0 > N - 1) i0 = N - 1;
        if (j0 > N) j0 = N;

        const a = vSrc[idxV(N, i0, j0)];
        const b = vSrc[idxV(N, i1, j0)];
        const c = vSrc[idxV(N, i0, j1)];
        const d = vSrc[idxV(N, i1, j1)];

        let minV = a; if (b < minV) minV = b; if (c < minV) minV = c; if (d < minV) minV = d;
        let maxV = a; if (b > maxV) maxV = b; if (c > maxV) maxV = c; if (d > maxV) maxV = d;

        if (vNew < minV) vNew = minV;
        if (vNew > maxV) vNew = maxV;
      }

      vHat[k] = vNew;
    }
  }

  // Copy final result back to uDst, vDst
  for (let k = 0; k < (N + 1) * N; k++) uDst[k] = uHat[k];
  for (let k = 0; k < N * (N + 1); k++) vDst[k] = vHat[k];
}
