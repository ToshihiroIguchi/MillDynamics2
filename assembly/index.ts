// assembly/index.ts
import { Real } from './types';
import { calcDivergence, applyGradient } from './grid';
import { muApp } from './rheology';
import { computeStrainRate } from './strain';
import { Multigrid, applyPoisson, subtractMean, zero, l2Norm } from './multigrid';
import { advectScalar, advectVelocity } from './advect';
import { computeViscousDivergence, diffuseVelocity } from './diffuse';
import { penalizeVelocity } from './penalize';
import { Solver } from './solver';

export function add(a: f64, b: f64): f64 {
  return a + b;
}

const g_solver: Solver = new Solver();

// Solver instance exports
export function createSolver(N: i32, L: Real): void {
  g_solver.init(N, L);
}

export function setFluid(rho: Real, mu: Real): void {
  g_solver.rho = rho;
  g_solver.K = mu;
  g_solver.n = 1.0;
  g_solver.tauY = 0.0;
}

export function setBoundaryMode(mode: i32): void {
  g_solver.setBoundaryMode(mode);
}

export function setLidVelocity(U: Real): void {
  g_solver.uLid = U;
}

export function setWallVelocities(uTop: Real, uBot: Real, vRight: Real, vLeft: Real): void {
  g_solver.uLid = uTop;
}

export function setBodyForce(fx: Real, fy: Real): void {
  g_solver.bodyFx = fx;
  g_solver.bodyFy = fy;
}

export function setGravity(gx: Real, gy: Real): void {
  g_solver.gx = gx;
  g_solver.gy = gy;
}

export function setInflow(U: Real): void {
  g_solver.uInflow = U;
}

export function setFixedTimeStep(dt: Real): void {
  g_solver.fixedDt = dt;
}

export function setInitialField(kind: i32, amp: Real, k: Real): void {
  g_solver.setInitialField(kind, amp, k);
}

export function setRheology(K: Real, n: Real, tauY: Real, m: Real, muMin: Real, muMax: Real): void {
  g_solver.K = K;
  g_solver.n = n;
  g_solver.tauY = tauY;
  g_solver.m = m;
  g_solver.muMin = muMin;
  g_solver.muMax = muMax;
}

export function setViscousIterations(k: i32): void {
  g_solver.nVisc = k;
}

export function setPenalization(eta: Real): void {
  g_solver.etaPenal = eta;
}

export function setSubSteps(nSub: i32): void {
  g_solver.nSub = nSub;
}

export function setAdvectionScheme(useMacCormack: i32): void {
  g_solver.useMacCormack = (useMacCormack != 0);
}

export function step(dt: Real): void {
  g_solver.step(dt);
}

export function getTime(): Real { return g_solver.time; }
export function getLastDt(): Real { return g_solver.lastDt; }

export function ptrU(): usize { return g_solver.u.dataStart; }
export function ptrV(): usize { return g_solver.v.dataStart; }
export function ptrP(): usize { return g_solver.p.dataStart; }
export function ptrDiv(): usize { return g_solver.div.dataStart; }
export function ptrGammaDot(): usize { return g_solver.gammaDot.dataStart; }
export function ptrMu(): usize { return g_solver.muC.dataStart; }
export function ptrMuN(): usize { return g_solver.muN.dataStart; }
export function ptrChi(): usize { return g_solver.chi.dataStart; }

export function diagMaxDiv(): Real { return g_solver.diagMaxDiv(); }
export function diagKineticEnergy(): Real { return g_solver.diagKineticEnergy(); }
export function diagMaxVel(): Real { return g_solver.diagMaxVel(); }
export function diagYieldedFraction(): Real { return g_solver.diagYieldedFraction(); }

// --- Operator Unit Testing Flat Buffers & Wrappers ---
let g_N: i32 = 0;
let g_L: Real = 0.0;
let g_dx: Real = 0.0;
let g_inv: Real = 0.0;
let g_periodic: bool = false;

let g_u: Float64Array = new Float64Array(0);
let g_v: Float64Array = new Float64Array(0);
let g_uDst: Float64Array = new Float64Array(0);
let g_vDst: Float64Array = new Float64Array(0);
let g_uHat: Float64Array = new Float64Array(0);
let g_vHat: Float64Array = new Float64Array(0);

let g_p: Float64Array = new Float64Array(0);
let g_div: Float64Array = new Float64Array(0);
let g_gd: Float64Array = new Float64Array(0);
let g_muC: Float64Array = new Float64Array(0);
let g_muN: Float64Array = new Float64Array(0);
let g_sNode: Float64Array = new Float64Array(0);

let g_scalarSrc: Float64Array = new Float64Array(0);
let g_scalarDst: Float64Array = new Float64Array(0);
let g_scalarHat: Float64Array = new Float64Array(0);

const g_mg: Multigrid = new Multigrid();

export function initTestGrid(N: i32, L: Real, periodic: i32): void {
  g_N = N;
  g_L = L;
  g_dx = L / <Real>N;
  g_inv = <Real>N / L;
  g_periodic = periodic != 0;

  const nc = N * N;
  const nu = (N + 1) * N;
  const nv = N * (N + 1);
  const nn = (N + 1) * (N + 1);

  g_u = new Float64Array(nu);
  g_v = new Float64Array(nv);
  g_uDst = new Float64Array(nu);
  g_vDst = new Float64Array(nv);
  g_uHat = new Float64Array(nu);
  g_vHat = new Float64Array(nv);

  g_p = new Float64Array(nc);
  g_div = new Float64Array(nc);
  g_gd = new Float64Array(nc);
  g_muC = new Float64Array(nc);
  g_muN = new Float64Array(nn);
  g_sNode = new Float64Array(nn);

  g_scalarSrc = new Float64Array(nc);
  g_scalarDst = new Float64Array(nc);
  g_scalarHat = new Float64Array(nc);

  g_mg.init(N, L, 10, 1e-6, g_periodic ? 1 : 0);
}

export function ptrTestU(): usize { return g_u.dataStart; }
export function ptrTestV(): usize { return g_v.dataStart; }
export function ptrUDst(): usize { return g_uDst.dataStart; }
export function ptrVDst(): usize { return g_vDst.dataStart; }
export function ptrTestP(): usize { return g_p.dataStart; }
export function ptrTestDiv(): usize { return g_div.dataStart; }
export function ptrTestGammaDot(): usize { return g_gd.dataStart; }
export function ptrTestMu(): usize { return g_muC.dataStart; }
export function ptrTestMuC(): usize { return g_muC.dataStart; }
export function ptrTestMuN(): usize { return g_muN.dataStart; }
export function ptrScalarSrc(): usize { return g_scalarSrc.dataStart; }
export function ptrScalarDst(): usize { return g_scalarDst.dataStart; }

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

export function initMG(N: i32, L: Real, maxCycles: i32, tol: Real): void {
  g_N = N;
  g_L = L;
  g_mg.init(N, L, maxCycles, tol, 0);
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

export function opAdvectScalar(dt: Real, useMacCormack: i32, periodic: i32): void {
  advectScalar(
    g_scalarDst, g_scalarSrc, g_scalarHat,
    g_u, g_v, g_N, g_dx, g_inv, dt,
    useMacCormack != 0, periodic != 0
  );
}

export function opAdvectVelocity(dt: Real, useMacCormack: i32, periodic: i32): void {
  advectVelocity(
    g_uDst, g_vDst, g_u, g_v, g_uHat, g_vHat,
    g_N, g_dx, g_inv, dt,
    useMacCormack != 0, periodic != 0
  );
}

export function opViscousDivergence(mode: i32): void {
  computeViscousDivergence(
    g_uDst, g_vDst, g_u, g_v, g_muC, g_muN,
    g_N, g_dx, g_inv, mode, 0.0, 0.0, 0.0, 0.0
  );
}
