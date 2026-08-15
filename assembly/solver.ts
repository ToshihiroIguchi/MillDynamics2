// assembly/solver.ts
import { Real, MODE_MILL, MODE_PERIODIC, MODE_CAVITY, MODE_CHANNEL, MODE_INFLOW, MODE_COUETTE } from './types';
import { Grid, idxC, idxU, idxV, idxN, calcDivergence, applyGradient } from './grid';
import { computeStrainRate } from './strain';
import { Multigrid } from './multigrid';
import { advectVelocity } from './advect';
import { diffuseVelocity } from './diffuse';
import { penalizeVelocity } from './penalize';

export class Solver {
  grid: Grid = new Grid();
  mg: Multigrid = new Multigrid();

  // Primary fields
  u: Float64Array = new Float64Array(0);
  v: Float64Array = new Float64Array(0);
  uDst: Float64Array = new Float64Array(0);
  vDst: Float64Array = new Float64Array(0);
  uHat: Float64Array = new Float64Array(0);
  vHat: Float64Array = new Float64Array(0);

  p: Float64Array = new Float64Array(0);
  div: Float64Array = new Float64Array(0);

  gammaDot: Float64Array = new Float64Array(0);
  muC: Float64Array = new Float64Array(0);
  muN: Float64Array = new Float64Array(0);
  sNode: Float64Array = new Float64Array(0);

  chi: Float64Array = new Float64Array(0);
  uWallX: Float64Array = new Float64Array(0);
  uWallY: Float64Array = new Float64Array(0);

  rhsU: Float64Array = new Float64Array(0);
  rhsV: Float64Array = new Float64Array(0);
  tmpU: Float64Array = new Float64Array(0);
  tmpV: Float64Array = new Float64Array(0);

  // Physical parameters
  rho: Real = 1800.0;
  K: Real = 0.5;
  n: Real = 0.7;
  tauY: Real = 5.0;
  m: Real = 1000.0;
  muMin: Real = 1e-4;
  muMax: Real = 1000.0;

  gx: Real = 0.0;
  gy: Real = -9.81;
  bodyFx: Real = 0.0;
  bodyFy: Real = 0.0;

  // Boundary conditions
  boundaryMode: i32 = MODE_MILL;
  uLid: Real = 0.0;
  uInflow: Real = 0.0;

  // Numerical parameters
  cfl: Real = 2.0;
  dtMax: Real = 2e-3;
  fixedDt: Real = 0.0;
  nSub: i32 = 2;
  nVisc: i32 = 24;
  omegaDamp: Real = 0.8;
  etaPenal: Real = 1e-4;
  useMacCormack: bool = true;

  // Simulation time
  time: Real = 0.0;
  lastDt: Real = 0.0;

  setBoundaryMode(mode: i32): void {
    this.boundaryMode = mode;
    this.grid.periodic = (mode == MODE_PERIODIC);
    this.mg.isPeriodic = (mode == MODE_PERIODIC);
  }

  init(N: i32, L: Real): void {
    const isPeriodic = (this.boundaryMode == MODE_PERIODIC);
    this.grid.init(N, L, isPeriodic);

    const nc = this.grid.nc;
    const nu = this.grid.nu;
    const nv = this.grid.nv;
    const nn = this.grid.nn;

    this.u = new Float64Array(nu);
    this.v = new Float64Array(nv);
    this.uDst = new Float64Array(nu);
    this.vDst = new Float64Array(nv);
    this.uHat = new Float64Array(nu);
    this.vHat = new Float64Array(nv);

    this.p = new Float64Array(nc);
    this.div = new Float64Array(nc);

    this.gammaDot = new Float64Array(nc);
    this.muC = new Float64Array(nc);
    this.muN = new Float64Array(nn);
    this.sNode = new Float64Array(nn);

    this.chi = new Float64Array(nc);
    this.uWallX = new Float64Array(nc);
    this.uWallY = new Float64Array(nc);

    this.rhsU = new Float64Array(nu);
    this.rhsV = new Float64Array(nv);
    this.tmpU = new Float64Array(nu);
    this.tmpV = new Float64Array(nv);

    this.mg.init(N, L, 6, 1e-5, isPeriodic);
    this.time = 0.0;
  }

  setInitialField(kind: i32, amp: Real, k: Real): void {
    const N = this.grid.N;
    const dx = this.grid.dx;

    if (kind == 1) {
      // Taylor-Green vortex
      for (let j = 0; j < N; j++) {
        for (let i = 0; i <= N; i++) {
          const x = <Real>i * dx;
          const y = (<Real>j + 0.5) * dx;
          this.u[idxU(N, i, j)] = -amp * Math.cos(k * x) * Math.sin(k * y);
        }
      }
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i < N; i++) {
          const x = (<Real>i + 0.5) * dx;
          const y = <Real>j * dx;
          this.v[idxV(N, i, j)] = amp * Math.sin(k * x) * Math.cos(k * y);
        }
      }
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = (<Real>i + 0.5) * dx;
          const y = (<Real>j + 0.5) * dx;
          this.p[idxC(N, i, j)] = -0.25 * this.rho * amp * amp * (Math.cos(2.0 * k * x) + Math.cos(2.0 * k * y));
        }
      }
    }
  }

  computeDt(): Real {
    if (this.fixedDt > 0.0) return this.fixedDt;

    const N = this.grid.N;
    let maxVel: Real = 1e-6;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = idxC(N, i, j);
        if (this.chi[c] < 0.5) {
          const uc = 0.5 * (this.u[idxU(N, i, j)] + this.u[idxU(N, i + 1, j)]);
          const vc = 0.5 * (this.v[idxV(N, i, j)] + this.v[idxV(N, i, j + 1)]);
          const spd = Math.sqrt(uc * uc + vc * vc);
          if (spd > maxVel) maxVel = spd;
        }
      }
    }

    const dtCfl = this.cfl * this.grid.dx / maxVel;
    const gMag = Math.sqrt(this.gx * this.gx + this.gy * this.gy);
    const dtGrav = gMag > 1e-6 ? Math.sqrt(this.grid.dx / gMag) : this.dtMax;

    let dt = dtCfl;
    if (dtGrav < dt) dt = dtGrav;
    if (this.dtMax < dt) dt = this.dtMax;
    return dt;
  }

  step(dtManual: Real = 0.0): void {
    const dtStep = (dtManual > 0.0) ? dtManual : this.computeDt();
    const dtSub = dtStep / <Real>this.nSub;
    this.lastDt = dtStep;

    for (let sub = 0; sub < this.nSub; sub++) {
      this.subStep(dtSub);
    }
  }

  subStep(dt: Real): void {
    const N = this.grid.N;
    const dx = this.grid.dx;
    const inv = this.grid.inv;
    const isPeriodic = (this.boundaryMode == MODE_PERIODIC);

    const uWallTop = (this.boundaryMode == MODE_CAVITY) ? this.uLid : 0.0;
    const uWallBot = 0.0;

    // 1. Strain rate & Apparent viscosity
    computeStrainRate(
      this.gammaDot, this.muC, this.muN, this.sNode,
      this.u, this.v, N, inv,
      this.K, this.n, this.tauY, this.m, this.muMin, this.muMax,
      this.boundaryMode, uWallTop, uWallBot, 0.0, 0.0
    );

    // 2. Advection (u*, v*)
    advectVelocity(
      this.uDst, this.vDst, this.u, this.v, this.uHat, this.vHat,
      N, dx, inv, dt,
      this.useMacCormack, isPeriodic
    );
    for (let k = 0; k < (N + 1) * N; k++) this.u[k] = this.uDst[k];
    for (let k = 0; k < N * (N + 1); k++) this.v[k] = this.vDst[k];

    // Inflow / Lid BC after advection
    if (this.boundaryMode == MODE_INFLOW) {
      for (let j = 0; j < N; j++) {
        this.u[idxU(N, 0, j)] = this.uInflow;
      }
    }

    // 3. Body forces & Gravity (CRITICAL BUG PREVENTION: scaled by 1 - chi!)
    const totalFx = this.gx + this.bodyFx;
    const totalFy = this.gy + this.bodyFy;

    if (totalFx != 0.0 || totalFy != 0.0) {
      // u faces
      for (let j = 0; j < N; j++) {
        for (let i = 0; i <= N; i++) {
          const k = idxU(N, i, j);
          const cL = i > 0 ? idxC(N, i - 1, j) : idxC(N, 0, j);
          const cR = i < N ? idxC(N, i,     j) : idxC(N, N - 1, j);
          const chiFace = 0.5 * (this.chi[cL] + this.chi[cR]);
          this.u[k] += dt * totalFx * (1.0 - chiFace);
        }
      }
      // v faces
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i < N; i++) {
          const k = idxV(N, i, j);
          const cB = j > 0 ? idxC(N, i, j - 1) : idxC(N, i, 0);
          const cT = j < N ? idxC(N, i, j    ) : idxC(N, i, N - 1);
          const chiFace = 0.5 * (this.chi[cB] + this.chi[cT]);
          this.v[k] += dt * totalFy * (1.0 - chiFace);
        }
      }
    }

    // 4. Diffusion (implicit damped Jacobi)
    diffuseVelocity(
      this.u, this.v, this.rhsU, this.rhsV, this.tmpU, this.tmpV,
      this.muC, this.muN,
      N, dx, inv, dt, this.rho,
      this.nVisc, this.omegaDamp,
      this.boundaryMode, uWallTop, uWallBot, 0.0, 0.0
    );

    // 5. Brinkman Penalization (implicit)
    penalizeVelocity(
      this.u, this.v,
      this.chi, this.uWallX, this.uWallY,
      N, dt, this.etaPenal
    );

    // 6. Pressure Projection
    calcDivergence(this.div, this.u, this.v, N, inv);

    const b0 = this.mg.b[0];
    const factor = this.rho / dt;
    for (let c = 0; c < N * N; c++) {
      b0[c] = factor * this.div[c];
    }

    const skipMean = (this.boundaryMode == MODE_INFLOW);
    this.mg.solve(skipMean);

    const phi0 = this.mg.phi[0];
    const gradFactor = dt / this.rho;
    applyGradient(this.u, this.v, phi0, N, inv, gradFactor, this.boundaryMode);

    for (let c = 0; c < N * N; c++) {
      this.p[c] = phi0[c];
    }

    this.time += dt;
  }

  // Diagnostics
  diagMaxDiv(): Real {
    calcDivergence(this.div, this.u, this.v, this.grid.N, this.grid.inv);
    const N = this.grid.N;
    let maxD: Real = 0.0;
    for (let c = 0; c < N * N; c++) {
      const d = Math.abs(this.div[c]);
      if (d > maxD) maxD = d;
    }
    return maxD;
  }

  diagKineticEnergy(): Real {
    const N = this.grid.N;
    const dA = this.grid.dx * this.grid.dx;
    let sumKE: Real = 0.0;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const uc = 0.5 * (this.u[idxU(N, i, j)] + this.u[idxU(N, i + 1, j)]);
        const vc = 0.5 * (this.v[idxV(N, i, j)] + this.v[idxV(N, i, j + 1)]);
        sumKE += 0.5 * this.rho * (uc * uc + vc * vc) * dA;
      }
    }
    return sumKE;
  }

  diagMaxVel(): Real {
    const N = this.grid.N;
    let maxV: Real = 0.0;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const uc = 0.5 * (this.u[idxU(N, i, j)] + this.u[idxU(N, i + 1, j)]);
        const vc = 0.5 * (this.v[idxV(N, i, j)] + this.v[idxV(N, i, j + 1)]);
        const spd = Math.sqrt(uc * uc + vc * vc);
        if (spd > maxV) maxV = spd;
      }
    }
    return maxV;
  }

  diagYieldedFraction(): Real {
    const N = this.grid.N;
    let yieldedCount = 0;
    let fluidCount = 0;

    for (let c = 0; c < N * N; c++) {
      if (this.chi[c] < 0.5) {
        fluidCount++;
        const tau = this.muC[c] * this.gammaDot[c];
        if (tau > this.tauY) {
          yieldedCount++;
        }
      }
    }
    return fluidCount > 0 ? <Real>yieldedCount / <Real>fluidCount : 1.0;
  }
}
