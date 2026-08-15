// assembly/multigrid.ts
import { Real, MODE_PERIODIC, MODE_CHANNEL } from './types';

export class Multigrid {
  nLevels: i32 = 0;
  maxCycles: i32 = 6;
  tol: Real = 1e-5;
  boundaryMode: i32 = 0;

  sizes: Int32Array = new Int32Array(0);
  dxs: Float64Array = new Float64Array(0);
  invDxs: Float64Array = new Float64Array(0);

  // Per-level storage (flat arrays indexed by level)
  phi: Array<Float64Array> = new Array<Float64Array>(0);
  b: Array<Float64Array> = new Array<Float64Array>(0);
  r: Array<Float64Array> = new Array<Float64Array>(0);

  init(N: i32, L: Real, maxCycles: i32 = 6, tol: Real = 1e-5, mode: i32 = 0): void {
    this.maxCycles = maxCycles;
    this.tol = tol;
    this.boundaryMode = mode;

    let lvls = 1;
    let curN = N;
    while (curN > 4 && (curN % 2 == 0)) {
      curN >>= 1;
      lvls++;
    }
    this.nLevels = lvls;

    this.sizes = new Int32Array(lvls);
    this.dxs = new Float64Array(lvls);
    this.invDxs = new Float64Array(lvls);

    this.phi = new Array<Float64Array>(lvls);
    this.b = new Array<Float64Array>(lvls);
    this.r = new Array<Float64Array>(lvls);

    curN = N;
    let curDx = L / <Real>N;
    for (let l = 0; l < lvls; l++) {
      this.sizes[l] = curN;
      this.dxs[l] = curDx;
      this.invDxs[l] = 1.0 / curDx;

      const nc = curN * curN;
      this.phi[l] = new Float64Array(nc);
      this.b[l] = new Float64Array(nc);
      this.r[l] = new Float64Array(nc);

      curN >>= 1;
      curDx *= 2.0;
    }
  }

  solve(skipMean: bool = false): i32 {
    const b0 = this.b[0];
    const phi0 = this.phi[0];
    const r0 = this.r[0];
    const n0 = this.sizes[0];

    if (!skipMean) {
      subtractMean(b0, n0 * n0);
    }

    zero(phi0, n0 * n0);

    const bnorm = l2Norm(b0, n0 * n0);
    if (bnorm < 1e-15) {
      return 0;
    }

    let cycles = 0;
    for (let c = 0; c < this.maxCycles; c++) {
      cycles++;
      this.vcycle(0);
      if (!skipMean) {
        subtractMean(phi0, n0 * n0);
      }
      this.computeResidual(0);
      const rnorm = l2Norm(r0, n0 * n0);
      if (rnorm < this.tol * bnorm) {
        break;
      }
    }
    return cycles;
  }

  vcycle(lvl: i32): void {
    if (lvl == this.nLevels - 1) {
      this.smooth(lvl, 50);
      return;
    }

    this.smooth(lvl, 2);
    this.computeResidual(lvl);
    this.restrict(lvl, lvl + 1);

    const nextN = this.sizes[lvl + 1];
    zero(this.phi[lvl + 1], nextN * nextN);

    this.vcycle(lvl + 1);

    this.prolongAdd(lvl + 1, lvl);
    this.smooth(lvl, 2);
  }

  smooth(l: i32, sweeps: i32): void {
    const n = this.sizes[l];
    const h2 = this.dxs[l] * this.dxs[l];
    const p = this.phi[l];
    const rhs = this.b[l];
    const isXPeriodic = (this.boundaryMode == MODE_PERIODIC || this.boundaryMode == MODE_CHANNEL);
    const isYPeriodic = (this.boundaryMode == MODE_PERIODIC);

    for (let s = 0; s < sweeps; s++) {
      for (let colour = 0; colour < 2; colour++) {
        for (let j = 0; j < n; j++) {
          for (let i = ((j + colour) & 1); i < n; i += 2) {
            const k = i + j * n;

            let sum: Real = 0.0;
            let cnt: Real = 0.0;

            // X-direction
            if (isXPeriodic) {
              const left  = (i > 0)     ? p[k - 1] : p[n - 1 + j * n];
              const right = (i < n - 1) ? p[k + 1] : p[0     + j * n];
              sum += left + right;
              cnt += 2.0;
            } else {
              if (i > 0)     { sum += p[k - 1]; cnt += 1.0; }
              if (i < n - 1) { sum += p[k + 1]; cnt += 1.0; }
            }

            // Y-direction
            if (isYPeriodic) {
              const bottom = (j > 0)     ? p[k - n] : p[i + (n - 1) * n];
              const top    = (j < n - 1) ? p[k + n] : p[i + 0 * n];
              sum += bottom + top;
              cnt += 2.0;
            } else {
              if (j > 0)     { sum += p[k - n]; cnt += 1.0; }
              if (j < n - 1) { sum += p[k + n]; cnt += 1.0; }
            }

            p[k] = (sum - h2 * rhs[k]) / cnt;
          }
        }
      }
    }
  }

  computeResidual(l: i32): void {
    const n = this.sizes[l];
    const invH2 = 1.0 / (this.dxs[l] * this.dxs[l]);
    const p = this.phi[l];
    const rhs = this.b[l];
    const res = this.r[l];
    const isXPeriodic = (this.boundaryMode == MODE_PERIODIC || this.boundaryMode == MODE_CHANNEL);
    const isYPeriodic = (this.boundaryMode == MODE_PERIODIC);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = i + j * n;
        let sum: Real = 0.0;
        let cnt: Real = 0.0;

        if (isXPeriodic) {
          const left  = (i > 0)     ? p[k - 1] : p[n - 1 + j * n];
          const right = (i < n - 1) ? p[k + 1] : p[0     + j * n];
          sum += left + right;
          cnt += 2.0;
        } else {
          if (i > 0)     { sum += p[k - 1]; cnt += 1.0; }
          if (i < n - 1) { sum += p[k + 1]; cnt += 1.0; }
        }

        if (isYPeriodic) {
          const bottom = (j > 0)     ? p[k - n] : p[i + (n - 1) * n];
          const top    = (j < n - 1) ? p[k + n] : p[i + 0 * n];
          sum += bottom + top;
          cnt += 2.0;
        } else {
          if (j > 0)     { sum += p[k - n]; cnt += 1.0; }
          if (j < n - 1) { sum += p[k + n]; cnt += 1.0; }
        }

        const lap = (sum - cnt * p[k]) * invH2;
        res[k] = rhs[k] - lap;
      }
    }
  }

  restrict(fLvl: i32, cLvl: i32): void {
    const fN = this.sizes[fLvl];
    const cN = this.sizes[cLvl];
    const fRes = this.r[fLvl];
    const cRhs = this.b[cLvl];

    for (let jc = 0; jc < cN; jc++) {
      const jf = jc << 1;
      for (let ic = 0; ic < cN; ic++) {
        const if_ = ic << 1;
        const sum = fRes[if_     + jf * fN]
                  + fRes[if_ + 1 + jf * fN]
                  + fRes[if_     + (jf + 1) * fN]
                  + fRes[if_ + 1 + (jf + 1) * fN];
        cRhs[ic + jc * cN] = 0.25 * sum;
      }
    }
  }

  prolongAdd(cLvl: i32, fLvl: i32): void {
    const cN = this.sizes[cLvl];
    const fN = this.sizes[fLvl];
    const cPhi = this.phi[cLvl];
    const fPhi = this.phi[fLvl];
    const isXPeriodic = (this.boundaryMode == MODE_PERIODIC || this.boundaryMode == MODE_CHANNEL);
    const isYPeriodic = (this.boundaryMode == MODE_PERIODIC);

    for (let jf = 0; jf < fN; jf++) {
      let gy = (<Real>jf + 0.5) * 0.5 - 0.5;
      let j0: i32 = 0, j1: i32 = 0;
      let fy: Real = 0.0;

      if (isYPeriodic) {
        gy = gy - Math.floor(gy / <Real>cN) * <Real>cN;
        if (gy < 0.0) gy += <Real>cN;
        j0 = <i32>Math.floor(gy);
        j1 = (j0 + 1) % cN;
        fy = gy - <Real>j0;
      } else {
        j0 = <i32>Math.floor(gy);
        fy = gy - <Real>j0;
        if (j0 < 0) { j0 = 0; fy = 0.0; }
        if (j0 > cN - 2) { j0 = cN - 2; fy = 1.0; }
        j1 = j0 + 1;
      }

      for (let if_ = 0; if_ < fN; if_++) {
        let gx = (<Real>if_ + 0.5) * 0.5 - 0.5;
        let i0: i32 = 0, i1: i32 = 0;
        let fx: Real = 0.0;

        if (isXPeriodic) {
          gx = gx - Math.floor(gx / <Real>cN) * <Real>cN;
          if (gx < 0.0) gx += <Real>cN;
          i0 = <i32>Math.floor(gx);
          i1 = (i0 + 1) % cN;
          fx = gx - <Real>i0;
        } else {
          i0 = <i32>Math.floor(gx);
          fx = gx - <Real>i0;
          if (i0 < 0) { i0 = 0; fx = 0.0; }
          if (i0 > cN - 2) { i0 = cN - 2; fx = 1.0; }
          i1 = i0 + 1;
        }

        const c00 = cPhi[i0 + j0 * cN];
        const c10 = cPhi[i1 + j0 * cN];
        const c01 = cPhi[i0 + j1 * cN];
        const c11 = cPhi[i1 + j1 * cN];

        const interp = (1.0 - fx) * (1.0 - fy) * c00 +
                       fx * (1.0 - fy) * c10 +
                       (1.0 - fx) * fy * c01 +
                       fx * fy * c11;

        fPhi[if_ + jf * fN] += interp;
      }
    }
  }
}

export function subtractMean(arr: Float64Array, len: i32): void {
  let sum: Real = 0.0;
  for (let i = 0; i < len; i++) {
    sum += arr[i];
  }
  const mean = sum / <Real>len;
  for (let i = 0; i < len; i++) {
    arr[i] -= mean;
  }
}

export function zero(arr: Float64Array, len: i32): void {
  for (let i = 0; i < len; i++) {
    arr[i] = 0.0;
  }
}

export function l2Norm(arr: Float64Array, len: i32): Real {
  let sumSq: Real = 0.0;
  for (let i = 0; i < len; i++) {
    sumSq += arr[i] * arr[i];
  }
  return Math.sqrt(sumSq / <Real>len);
}

export function applyPoisson(out: Float64Array, phi: Float64Array, N: i32, invH2: Real): void {
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = i + j * N;
      let sum: Real = 0.0;
      let cnt: Real = 0.0;

      if (i > 0)     { sum += phi[k - 1]; cnt += 1.0; }
      if (i < N - 1) { sum += phi[k + 1]; cnt += 1.0; }
      if (j > 0)     { sum += phi[k - N]; cnt += 1.0; }
      if (j < N - 1) { sum += phi[k + N]; cnt += 1.0; }

      out[k] = (sum - cnt * phi[k]) * invH2;
    }
  }
}
