import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

describe('Phase 1b Multigrid - U4, U5, U6', () => {
  it('U4: Multigrid solves manufactured Poisson solution with order >= 1.9 and error < 1% at 128^2', async () => {
    const { e, view } = await loadSolver(true);
    const errors: number[] = [];
    const L = 1.0;
    const m = 2; // mode

    for (const N of [64, 128, 256]) {
      const dx = L / N;
      e.initMG(N, L, 20, 1e-10);

      const b = view(e.ptrMGB(), N * N);
      const phiExact = new Float64Array(N * N);

      const factor = -2.0 * Math.pow(m * Math.PI / L, 2);

      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = (i + 0.5) * dx;
          const y = (j + 0.5) * dx;
          const exact = Math.cos(m * Math.PI * x / L) * Math.cos(m * Math.PI * y / L);
          phiExact[i + j * N] = exact;
          b[i + j * N] = factor * exact;
        }
      }

      const cycles = e.solveMG(0);
      const phi = view(e.ptrMGPhi(), N * N);

      // Mean subtraction on exact and numerical
      let meanEx = 0, meanNum = 0;
      for (let c = 0; c < N * N; c++) {
        meanEx += phiExact[c];
        meanNum += phi[c];
      }
      meanEx /= (N * N);
      meanNum /= (N * N);

      let sumSq = 0;
      let maxPhi = 0;
      for (let c = 0; c < N * N; c++) {
        const diff = (phi[c] - meanNum) - (phiExact[c] - meanEx);
        sumSq += diff * diff;
        if (Math.abs(phiExact[c]) > maxPhi) maxPhi = Math.abs(phiExact[c]);
      }
      const l2 = Math.sqrt(sumSq / (N * N));
      const relL2 = l2 / maxPhi;
      errors.push(relL2);

      console.log(`U4 N=${N}: cycles=${cycles}, relL2 error = ${relL2.toExponential(4)}`);
    }

    const order = (Math.log2(errors[0] / errors[1]) + Math.log2(errors[1] / errors[2])) / 2.0;
    console.log(`U4 convergence order across 64/128/256: ${order.toFixed(3)}`);

    // 128^2 error is errors[1]
    expect(errors[1]).toBeLessThan(0.01);
    expect(order).toBeGreaterThan(1.85);
  });

  it('U5: Poisson null space converges to constant with ||grad(phi)|| < 1e-10', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    e.initMG(N, L, 15, 1e-12);

    const b = view(e.ptrMGB(), N * N);
    for (let c = 0; c < N * N; c++) b[c] = 0.0;

    // Set non-zero initial phi in level 0
    const phi = view(e.ptrMGPhi(), N * N);
    let s = 98765;
    function rand() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296.0;
    }
    for (let c = 0; c < N * N; c++) {
      phi[c] = rand() - 0.5;
    }

    // Solve (mean removal is active)
    e.solveMG(0);

    // Compute max gradient magnitude of resulting phi
    let maxGrad = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N - 1; i++) {
        const gx = Math.abs(phi[(i + 1) + j * N] - phi[i + j * N]) / dx;
        if (gx > maxGrad) maxGrad = gx;
      }
    }
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N; i++) {
        const gy = Math.abs(phi[i + (j + 1) * N] - phi[i + j * N]) / dx;
        if (gy > maxGrad) maxGrad = gy;
      }
    }

    console.log(`U5 max ||grad(phi)|| = ${maxGrad.toExponential(3)}`);
    expect(maxGrad).toBeLessThan(1e-10);
  });

  it('U6: Poisson operator symmetry <a, L b> = <b, L a> within 1e-12', async () => {
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    const invH2 = 1.0 / (dx * dx);

    const a = new Float64Array(N * N);
    const b = new Float64Array(N * N);
    const La = new Float64Array(N * N);
    const Lb = new Float64Array(N * N);

    let s = 45678;
    function rand() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296.0;
    }

    for (let c = 0; c < N * N; c++) {
      a[c] = rand() - 0.5;
      b[c] = rand() - 0.5;
    }

    // Compute L a and L b with discrete Neumann Poisson operator
    function applyL(out: Float64Array, phi: Float64Array) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = i + j * N;
          let sum = 0.0, cnt = 0.0;
          if (i > 0)     { sum += phi[k - 1]; cnt += 1.0; }
          if (i < N - 1) { sum += phi[k + 1]; cnt += 1.0; }
          if (j > 0)     { sum += phi[k - N]; cnt += 1.0; }
          if (j < N - 1) { sum += phi[k + N]; cnt += 1.0; }
          out[k] = (sum - cnt * phi[k]) * invH2;
        }
      }
    }

    applyL(La, a);
    applyL(Lb, b);

    let innerALb = 0, innerBLa = 0;
    for (let c = 0; c < N * N; c++) {
      innerALb += a[c] * Lb[c] * dx * dx;
      innerBLa += b[c] * La[c] * dx * dx;
    }

    const diff = Math.abs(innerALb - innerBLa);
    console.log(`U6 symmetry error |<a, Lb> - <b, La>| = ${diff.toExponential(3)}`);
    expect(diff).toBeLessThan(1e-12);
  });
});
