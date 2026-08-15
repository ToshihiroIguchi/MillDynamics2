// assembly/index.ts
import { Real } from './types';
import { calcDivergence, applyGradient } from './grid';
import { muApp } from './rheology';
import { computeStrainRate } from './strain';
import { Multigrid, applyPoisson, subtractMean, zero, l2Norm } from './multigrid';

export function add(a: f64, b: f64): f64 {
  return a + b;
}

let g_N: i32 = 0;
let g_L: Real = 0.0;
let g_inv: Real = 0.0;
let g_periodic: bool = false;

let g_u: Float64Array = new Float64Array(0);
let g_v: Float64Array = new Float64Array(0);
let g_p: Float64Array = new Float64Array(0);
let g_div: Float64Array = new Float64Array(0);
let g_gd: Float64Array = new Float64Array(0);
let g_muC: Float64Array = new Float64Array(0);
let g_muN: Float64Array = new Float64Array(0);
let g_sNode: Float64Array = new Float64Array(0);

const g_mg: Multigrid = new Multigrid();

export function initTestGrid(N: i32, L: Real, periodic: i32): void {
  g_N = N;
  g_L = L;
  g_inv = <Real>N / L;
  g_periodic = periodic != 0;

  const nc = N * N;
  const nu = (N + 1) * N;
  const nv = N * (N + 1);
  const nn = (N + 1) * (N + 1);

  g_u = new Float64Array(nu);
  g_v = new Float64Array(nv);
  g_p = new Float64Array(nc);
  g_div = new Float64Array(nc);
  g_gd = new Float64Array(nc);
  g_muC = new Float64Array(nc);
  g_muN = new Float64Array(nn);
  g_sNode = new Float64Array(nn);

  g_mg.init(N, L, 10, 1e-6);
}

export function ptrU(): usize { return g_u.dataStart; }
export function ptrV(): usize { return g_v.dataStart; }
export function ptrP(): usize { return g_p.dataStart; }
export function ptrDiv(): usize { return g_div.dataStart; }
export function ptrGammaDot(): usize { return g_gd.dataStart; }
export function ptrMu(): usize { return g_muC.dataStart; }
export function ptrMuN(): usize { return g_muN.dataStart; }

export function opDivergence(): void {
  calcDivergence(g_div, g_u, g_v, g_N, g_inv);
}

export function opApplyGradient(factor: Real, mode: i32): void {
  applyGradient(g_u, g_v, g_p, g_N, g_inv, factor, mode);
}

export function opStrainRate(
  K: Real, n: Real, tauY: Real, m: Real, muMin: Real, muMax: Real,
  mode: i32, uWallTop: Real, uWallBot: Real, vWallRight: Real, vWallLeft: Real
): void {
  computeStrainRate(
    g_gd, g_muC, g_muN, g_sNode,
    g_u, g_v, g_N, g_inv,
    K, n, tauY, m, muMin, muMax,
    mode, uWallTop, uWallBot, vWallRight, vWallLeft
  );
}

export function testMuApp(gd: Real, K: Real, n: Real, tauY: Real, m: Real, muMin: Real, muMax: Real): Real {
  return muApp(gd, K, n, tauY, m, muMin, muMax);
}

// Multigrid test exports
export function initMG(N: i32, L: Real, maxCycles: i32, tol: Real): void {
  g_N = N;
  g_L = L;
  g_mg.init(N, L, maxCycles, tol);
}

export function ptrMGPhi(): usize { return g_mg.phi[0].dataStart; }
export function ptrMGB(): usize { return g_mg.b[0].dataStart; }
export function ptrMGRes(): usize { return g_mg.r[0].dataStart; }

export function solveMG(skipMean: i32): i32 {
  return g_mg.solve(skipMean != 0);
}

export function opApplyPoisson(outPtr: usize, inPtr: usize, N: i32, invH2: Real): void {
  const out = changetype<Float64Array>(outPtr);
  const inArr = changetype<Float64Array>(inPtr);
  applyPoisson(out, inArr, N, invH2);
}

export function opL2(ptr: usize, len: i32): Real {
  const arr = changetype<Float64Array>(ptr);
  return l2Norm(arr, len);
}

export function opSubMean(ptr: usize, len: i32): void {
  const arr = changetype<Float64Array>(ptr);
  subtractMean(arr, len);
}
