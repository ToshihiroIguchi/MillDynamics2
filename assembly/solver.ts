// assembly/solver.ts
import { Real, MODE_CAVITY, MODE_PERIODIC, MODE_CHANNEL, MODE_SLUMP, MODE_OBSTACLE, MODE_INFLOW } from './types';
import { idxC, idxU, idxV, idxN, ghostU, ghostV, calcDivergence, applyGradient } from './grid';
import { computeStrainRate } from './strain';
import { Multigrid } from './multigrid';
import { advectScalar, advectVelocity } from './advect';
import { diffuseVelocity } from './diffuse';
import { penalizeVelocity } from './penalize';
import { updateMillSolidMask, updateCylinderSolidMask } from './sdf';
import { updateBedMask, solveChordOffset } from './bed';
import { applyPorousDrag, computePermeability } from './porous';
import { computeShellTorque, computeCylinderDrag } from './diagnostics';

export class Solver {
  N: i32;
  L: Real;
  dx: Real;
  inv: Real;

  // Fluid physical properties
  rho: Real = 1.0;
  K: Real = 0.01;
  n: Real = 1.0;
  tauY: Real = 0.0;
  m: Real = 1000.0;
  muMin: Real = 1e-4;
  muMax: Real = 1e4;

  // Numerical parameters
  cfl: Real = 0.4;
  maxDt: Real = 0.01;
  fixedDt: Real = 0.0;
  nSub: i32 = 1;
  nVisc: i32 = 24;
  omegaDamp: Real = 0.8;
  useMacCormack: bool = true;
  etaPenal: Real = 1e-4;

  // Domain & Boundary condition
  boundaryMode: i32 = MODE_CAVITY;
  uLid: Real = 1.0;
  uInflow: Real = 0.0;
  bodyFx: Real = 0.0;
  bodyFy: Real = 0.0;
  gx: Real = 0.0;
  gy: Real = 0.0;

  // Mill / Obstacle geometry
  cx: Real = 0.5;
  cy: Real = 0.5;
  millRadius: Real = 0.0;
  omega: Real = 0.0;
  millAngle: Real = 0.0;
  nLifters: i32 = 0;
  hLifter: Real = 0.0;
  wLifter: Real = 0.0;
  alphaLifter: Real = 0.0;
  cylRadius: Real = 0.0;

  // Porous bed parameters
  fillJ: Real = 0.0;
  thetaRepose: Real = 0.6981317007977318; // 40 degrees
  kSlip: Real = 0.85;
  epsilon: Real = 0.40;
  dp: Real = 0.002;
  A_ergun: Real = 150.0;
  B_ergun: Real = 1.75;
  C_gamma: Real = 1.0;

  // Simulation time
  time: Real = 0.0;
  lastDt: Real = 0.0;

  // Primary staggered fields
  u: Float64Array = new Float64Array(0);
  v: Float64Array = new Float64Array(0);
  p: Float64Array = new Float64Array(0);
  div: Float64Array = new Float64Array(0);

  // Intermediate velocity scratch arrays
  uStar: Float64Array = new Float64Array(0);
  vStar: Float64Array = new Float64Array(0);
  uHat: Float64Array = new Float64Array(0);
  vHat: Float64Array = new Float64Array(0);
  rhsU: Float64Array = new Float64Array(0);
  rhsV: Float64Array = new Float64Array(0);
  tmpU: Float64Array = new Float64Array(0);
  tmpV: Float64Array = new Float64Array(0);

  // Rheology & Porous fields
  gammaDot: Float64Array = new Float64Array(0);
  muC: Float64Array = new Float64Array(0);
  muN: Float64Array = new Float64Array(0);
  sNode: Float64Array = new Float64Array(0);

  // Solid geometry & Bed fields
  chi: Float64Array = new Float64Array(0);
  uSolid: Float64Array = new Float64Array(0);
  vSolid: Float64Array = new Float64Array(0);
  chiBed: Float64Array = new Float64Array(0);
  uMedia: Float64Array = new Float64Array(0);
  vMedia: Float64Array = new Float64Array(0);

  // Multigrid solver instance
  mg: Multigrid = new Multigrid();

  constructor() {
    this.N = 0;
    this.L = 0.0;
    this.dx = 0.0;
    this.inv = 0.0;
  }

  init(N: i32, L: Real): void {
    this.N = N;
    this.L = L;
    this.dx = L / <Real>N;
    this.inv = <Real>N / L;
    this.cx = 0.5 * L;
    this.cy = 0.5 * L;
    this.time = 0.0;
    this.lastDt = 0.0;
    this.millAngle = 0.0;

    const nc = N * N;
    const nu = (N + 1) * N;
    const nv = N * (N + 1);
    const nn = (N + 1) * (N + 1);

    this.u = new Float64Array(nu);
    this.v = new Float64Array(nv);
    this.p = new Float64Array(nc);
    this.div = new Float64Array(nc);

    this.uStar = new Float64Array(nu);
    this.vStar = new Float64Array(nv);
    this.uHat = new Float64Array(nu);
    this.vHat = new Float64Array(nv);
    this.rhsU = new Float64Array(nu);
    this.rhsV = new Float64Array(nv);
    this.tmpU = new Float64Array(nu);
    this.tmpV = new Float64Array(nv);

    this.gammaDot = new Float64Array(nc);
    this.muC = new Float64Array(nc);
    this.muN = new Float64Array(nn);
    this.sNode = new Float64Array(nn);

    this.chi = new Float64Array(nc);
    this.uSolid = new Float64Array(nu);
    this.vSolid = new Float64Array(nv);
    this.chiBed = new Float64Array(nc);
    this.uMedia = new Float64Array(nu);
    this.vMedia = new Float64Array(nv);

    for (let i = 0; i < nc; i++) {
      this.muC[i] = this.K;
    }
    for (let i = 0; i < nn; i++) {
      this.muN[i] = this.K;
    }

    const isPeriodic = (this.boundaryMode == MODE_PERIODIC) ? 1 : 0;
    this.mg.init(N, L, 10, 1e-6, isPeriodic);
  }

  setBoundaryMode(mode: i32): void {
    this.boundaryMode = mode;
    if (this.N > 0) {
      const isPeriodic = (this.boundaryMode == MODE_PERIODIC) ? 1 : 0;
      this.mg.init(this.N, this.L, 10, 1e-6, isPeriodic);
    }
  }

  setInitialField(kind: i32, amp: Real = 1.0, k: Real = 1.0): void {
    const N = this.N;
    const dx = this.dx;
    const twoPiK = 2.0 * Math.PI * k;

    if (kind == 0) {
      for (let i = 0; i < (N + 1) * N; i++) this.u[i] = 0.0;
      for (let i = 0; i < N * (N + 1); i++) this.v[i] = 0.0;
      for (let i = 0; i < N * N; i++) this.p[i] = 0.0;
    } else if (kind == 1) {
      for (let j = 0; j < N; j++) {
        const y = (j + 0.5) * dx;
        for (let i = 0; i <= N; i++) {
          const x = i * dx;
          this.u[idxU(N, i, j)] = -amp * Math.cos(twoPiK * x) * Math.sin(twoPiK * y);
        }
      }
      for (let j = 0; j <= N; j++) {
        const y = j * dx;
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * dx;
          this.v[idxV(N, i, j)] = amp * Math.sin(twoPiK * x) * Math.cos(twoPiK * y);
        }
      }
      for (let j = 0; j < N; j++) {
        const y = (j + 0.5) * dx;
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * dx;
          this.p[idxC(N, i, j)] = -0.25 * this.rho * amp * amp * (
            Math.cos(2.0 * twoPiK * x) + Math.cos(2.0 * twoPiK * y)
          );
        }
      }
    }
  }

  calcAdaptiveDt(): Real {
    let maxVel: Real = 0.0;
    const nu = (this.N + 1) * this.N;
    for (let i = 0; i < nu; i++) {
      const spd = Math.abs(this.u[i]);
      if (spd > maxVel) maxVel = spd;
    }
    const nv = this.N * (this.N + 1);
    for (let i = 0; i < nv; i++) {
      const spd = Math.abs(this.v[i]);
      if (spd > maxVel) maxVel = spd;
    }

    let dt = this.maxDt;
    if (maxVel > 1e-6) {
      const dtCfl = (this.cfl * this.dx) / maxVel;
      if (dtCfl < dt) dt = dtCfl;
    }
    return dt;
  }

  subStep(dt: Real): void {
    const N = this.N;
    const dx = this.dx;
    const inv = this.inv;

    const uWallTop = (this.boundaryMode == MODE_CAVITY || this.boundaryMode == MODE_CHANNEL) ? this.uLid : 0.0;
    const uWallBot = 0.0;

    // 0. Update solid geometry mask if in mill or obstacle mode
    if (this.boundaryMode == MODE_OBSTACLE) {
      updateCylinderSolidMask(this.chi, this.uSolid, this.vSolid, N, dx, this.cx, this.cy, this.cylRadius);
    } else if (this.millRadius > 0.0 && this.boundaryMode != MODE_CHANNEL && this.boundaryMode != MODE_CAVITY) {
      this.millAngle += dt * this.omega;
      updateMillSolidMask(
        this.chi, this.uSolid, this.vSolid, N, dx,
        this.cx, this.cy, this.millRadius, this.omega,
        this.nLifters, this.hLifter, this.wLifter, this.alphaLifter,
        this.millAngle
      );
    }

    // 0b. Update porous bed mask
    if (this.fillJ > 0.0 && this.millRadius > 0.0) {
      updateBedMask(
        this.chiBed, this.uMedia, this.vMedia,
        N, dx, this.cx, this.cy, this.millRadius,
        this.fillJ, this.thetaRepose, this.omega, this.kSlip
      );
    }

    // 1. Strain rate & Apparent viscosity
    computeStrainRate(
      this.gammaDot, this.muC, this.muN, this.sNode,
      this.u, this.v, N, inv,
      this.K, this.n, this.tauY, this.m, this.muMin, this.muMax,
      this.boundaryMode, uWallTop, uWallBot, 0.0, 0.0
    );

    // 2. Advection
    const isXPeriodic = (this.boundaryMode == MODE_PERIODIC || this.boundaryMode == MODE_CHANNEL);
    advectVelocity(
      this.uStar, this.vStar,
      this.u, this.v,
      this.uHat, this.vHat,
      N, dx, inv, dt,
      this.useMacCormack, isXPeriodic
    );

    for (let k = 0; k < (N + 1) * N; k++) this.u[k] = this.uStar[k];
    for (let k = 0; k < N * (N + 1); k++) this.v[k] = this.vStar[k];

    // 3. Body forces & Gravity (scaled by (1 - chiFace)) (KERNEL_REFERENCE.md §10)
    const fx = this.bodyFx + this.gx;
    const fy = this.bodyFy + this.gy;
    if (fx != 0.0 || fy != 0.0) {
      const invRho = 1.0 / this.rho;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i <= N; i++) {
          const k = idxU(N, i, j);
          const cL = i > 0 ? idxC(N, i - 1, j) : idxC(N, 0, j);
          const cR = i < N ? idxC(N, i,     j) : idxC(N, N - 1, j);
          const chiFace = 0.5 * (this.chi[cL] + this.chi[cR]);
          this.u[k] += dt * fx * invRho * (1.0 - chiFace);
        }
      }
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i < N; i++) {
          const k = idxV(N, i, j);
          const cB = j > 0 ? idxC(N, i, j - 1) : idxC(N, i, 0);
          const cT = j < N ? idxC(N, i, j    ) : idxC(N, i, N - 1);
          const chiFace = 0.5 * (this.chi[cB] + this.chi[cT]);
          this.v[k] += dt * fy * invRho * (1.0 - chiFace);
        }
      }
    }

    // 3b. Porous Ergun drag inside the bed (NUMERICS.md §6)
    if (this.fillJ > 0.0) {
      applyPorousDrag(
        this.u, this.v, this.uMedia, this.vMedia, this.chiBed, this.gammaDot,
        N, dt, this.rho, this.epsilon, this.dp,
        this.A_ergun, this.B_ergun, this.C_gamma,
        this.K, this.n, this.tauY, this.m, this.muMin, this.muMax
      );
    }

    // Inflow condition at boundary
    if (this.boundaryMode == MODE_INFLOW || this.boundaryMode == MODE_OBSTACLE) {
      for (let j = 0; j < N; j++) {
        this.u[idxU(N, 0, j)] = this.uInflow;
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

    // 5. Pressure Poisson solve: div(u*) -> rhs -> solve -> grad(p)
    calcDivergence(this.div, this.u, this.v, N, inv);

    const b0 = this.mg.b[0];
    const rhoInvDt = this.rho / dt;
    const nc = N * N;
    for (let k = 0; k < nc; k++) {
      b0[k] = this.div[k] * rhoInvDt;
    }

    const skipMean = (this.boundaryMode == MODE_INFLOW || this.boundaryMode == MODE_OBSTACLE) ? 1 : 0;
    this.mg.solve(skipMean != 0);

    const phi0 = this.mg.phi[0];
    for (let k = 0; k < nc; k++) {
      this.p[k] = phi0[k];
    }

    // 6. Velocity projection: u = u* - dt/rho * grad(p)
    const factor = dt / this.rho;
    applyGradient(this.u, this.v, this.p, N, inv, factor, this.boundaryMode);

    // 7. Brinkman penalization: solid obstacle / mill drum / lifters
    penalizeVelocity(
      this.u, this.v, this.uSolid, this.vSolid, this.chi,
      N, dt, this.etaPenal
    );
  }

  step(dtOverride: Real = 0.0): void {
    const dt = dtOverride > 0.0 ? dtOverride : (this.fixedDt > 0.0 ? this.fixedDt : this.calcAdaptiveDt());
    this.lastDt = dt;
    const subDt = dt / <Real>this.nSub;

    for (let s = 0; s < this.nSub; s++) {
      this.subStep(subDt);
      this.time += subDt;
    }
  }

  diagMaxDiv(): Real {
    calcDivergence(this.div, this.u, this.v, this.N, this.inv);
    let maxD: Real = 0.0;
    const nc = this.N * this.N;
    for (let i = 0; i < nc; i++) {
      const d = Math.abs(this.div[i]);
      if (d > maxD) maxD = d;
    }
    return maxD;
  }

  diagKineticEnergy(): Real {
    let ke: Real = 0.0;
    const N = this.N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const uAvg = 0.5 * (this.u[idxU(N, i, j)] + this.u[idxU(N, i + 1, j)]);
        const vAvg = 0.5 * (this.v[idxV(N, i, j)] + this.v[idxV(N, i, j + 1)]);
        ke += 0.5 * this.rho * (uAvg * uAvg + vAvg * vAvg) * this.dx * this.dx;
      }
    }
    return ke;
  }

  diagMaxVel(): Real {
    let maxV: Real = 0.0;
    const nu = (this.N + 1) * this.N;
    for (let i = 0; i < nu; i++) {
      const s = Math.abs(this.u[i]);
      if (s > maxV) maxV = s;
    }
    const nv = this.N * (this.N + 1);
    for (let i = 0; i < nv; i++) {
      const s = Math.abs(this.v[i]);
      if (s > maxV) maxV = s;
    }
    return maxV;
  }

  diagYieldedFraction(): Real {
    if (this.tauY <= 0.0) return 1.0;
    let yielded: i32 = 0;
    const nc = this.N * this.N;
    const invM = 1.0 / this.m;
    for (let i = 0; i < nc; i++) {
      if (this.gammaDot[i] > invM) {
        yielded++;
      }
    }
    return <Real>yielded / <Real>nc;
  }

  diagTorque(): Real {
    return computeShellTorque(
      this.u, this.v, this.chi,
      this.N, this.dx, this.cx, this.cy,
      this.omega, this.rho, this.etaPenal
    );
  }

  diagCylinderDrag(U_inf: Real, d_cyl: Real): Real {
    return computeCylinderDrag(
      this.u, this.v, this.chi,
      this.N, this.dx,
      this.rho, this.etaPenal,
      U_inf, d_cyl
    );
  }

  diagBedArea(): Real {
    let area: Real = 0.0;
    const nc = this.N * this.N;
    const dA = this.dx * this.dx;
    for (let i = 0; i < nc; i++) {
      area += this.chiBed[i] * dA;
    }
    return area;
  }

  diagBedMeanShearRate(): Real {
    let sumGd: Real = 0.0;
    let sumWeight: Real = 0.0;
    const nc = this.N * this.N;
    for (let i = 0; i < nc; i++) {
      const w = this.chiBed[i];
      sumGd += this.gammaDot[i] * w;
      sumWeight += w;
    }
    return sumWeight > 0.0 ? sumGd / sumWeight : 0.0;
  }

  diagFreeMeanShearRate(): Real {
    let sumGd: Real = 0.0;
    let sumWeight: Real = 0.0;
    const nc = this.N * this.N;
    for (let i = 0; i < nc; i++) {
      const w = (1.0 - this.chi[i]) * (1.0 - this.chiBed[i]);
      if (w > 0.0) {
        sumGd += this.gammaDot[i] * w;
        sumWeight += w;
      }
    }
    return sumWeight > 0.0 ? sumGd / sumWeight : 0.0;
  }
}
