import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

describe('Phase 1a Operators - U1, U2, U3, U10', () => {
  it('U1: Divergence of divergence-free field < 1e-12', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    e.initTestGrid(N, L, 1);

    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));
    const k = 2 * Math.PI / L;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = i * dx;
        const y = (j + 0.5) * dx;
        u[i + j * (N + 1)] = Math.sin(k * x) * Math.cos(k * y);
      }
    }

    for (let j = 0; j <= N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * dx;
        const y = j * dx;
        v[i + j * N] = -Math.cos(k * x) * Math.sin(k * y);
      }
    }

    e.opDivergence();
    const div = view(e.ptrTestDiv(), N * N);

    let maxDiv = 0;
    for (let c = 0; c < N * N; c++) {
      const d = Math.abs(div[c]);
      if (d > maxDiv) maxDiv = d;
    }
    console.log(`U1 max |div(u)| = ${maxDiv.toExponential(3)}`);
    expect(maxDiv).toBeLessThan(1e-12);
  });

  it('U2: Divergence 2nd order accuracy for u=(x^2, 0)', async () => {
    const { e, view } = await loadSolver(true);
    const errors: number[] = [];

    for (const N of [64, 128, 256]) {
      const L = 1.0;
      const dx = L / N;
      e.initTestGrid(N, L, 0);

      const u = view(e.ptrTestU(), (N + 1) * N);
      const v = view(e.ptrTestV(), N * (N + 1));

      for (let j = 0; j < N; j++) {
        for (let i = 0; i <= N; i++) {
          const x = i * dx;
          u[i + j * (N + 1)] = x * x;
        }
      }
      for (let k = 0; k < N * (N + 1); k++) {
        v[k] = 0;
      }

      e.opDivergence();
      const div = view(e.ptrTestDiv(), N * N);

      let maxErr = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const xc = (i + 0.5) * dx;
          const exact = 2 * xc;
          const err = Math.abs(div[i + j * N] - exact);
          if (err > maxErr) maxErr = err;
        }
      }
      errors.push(maxErr);
    }
    console.log(`U2 errors: ${errors.map(err => err.toExponential(3)).join(', ')}`);
    expect(errors[0]).toBeLessThan(1e-12);
    expect(errors[1]).toBeLessThan(1e-12);
    expect(errors[2]).toBeLessThan(1e-12);
  });

  it('U3: Gradient / divergence adjointness identity < 1e-12', async () => {
    const { e, view } = await loadSolver(true);
    const N = 64;
    const L = 1.0;
    const dx = L / N;
    e.initTestGrid(N, L, 0);

    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));
    const p = view(e.ptrTestP(), N * N);

    let s = 12345;
    function rand() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296.0;
    }

    for (let c = 0; c < N * N; c++) {
      p[c] = rand() - 0.5;
    }

    for (let j = 0; j < N; j++) {
      u[0 + j * (N + 1)] = 0;
      u[N + j * (N + 1)] = 0;
      for (let i = 1; i < N; i++) {
        u[i + j * (N + 1)] = rand() - 0.5;
      }
    }

    for (let i = 0; i < N; i++) {
      v[i + 0 * N] = 0;
      v[i + N * N] = 0;
    }
    for (let j = 1; j < N; j++) {
      for (let i = 0; i < N; i++) {
        v[i + j * N] = rand() - 0.5;
      }
    }

    e.opDivergence();
    const div = view(e.ptrTestDiv(), N * N);

    let innerPDiv = 0;
    for (let c = 0; c < N * N; c++) {
      innerPDiv += p[c] * div[c] * dx * dx;
    }

    let innerGradPU = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 1; i < N; i++) {
        const gradPx = (p[i + j * N] - p[(i - 1) + j * N]) / dx;
        innerGradPU += gradPx * u[i + j * (N + 1)] * dx * dx;
      }
    }
    for (let j = 1; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const gradPy = (p[i + j * N] - p[i + (j - 1) * N]) / dx;
        innerGradPU += gradPy * v[i + j * N] * dx * dx;
      }
    }

    const diff = Math.abs(innerGradPU + innerPDiv);
    console.log(`U3 adjointness identity error: ${diff.toExponential(3)}`);
    expect(diff).toBeLessThan(1e-12);
  });

  it('U10: Strain rate is exact for linear velocity fields < 1e-12', async () => {
    const { e, view } = await loadSolver(true);
    const N = 32;
    const L = 1.0;
    const dx = L / N;
    e.initTestGrid(N, L, 0);

    const u = view(e.ptrTestU(), (N + 1) * N);
    const v = view(e.ptrTestV(), N * (N + 1));
    const gd = view(e.ptrTestGammaDot(), N * N);

    // Case 1: Simple shear u = (y, 0) => gammaDot = 1.0 exactly
    for (let j = 0; j < N; j++) {
      for (let i = 0; i <= N; i++) {
        const y = (j + 0.5) * dx;
        u[i + j * (N + 1)] = y;
      }
    }
    for (let k = 0; k < N * (N + 1); k++) v[k] = 0.0;

    e.opStrainRate(1.0, 1.0, 0.0, 1000.0, 1e-6, 1e6, 0, L, 0.0, 0.0, 0.0);

    let maxErrShear = 0;
    for (let c = 0; c < N * N; c++) {
      const err = Math.abs(gd[c] - 1.0);
      if (err > maxErrShear) maxErrShear = err;
    }
    console.log(`U10 shear u=(y,0) max error = ${maxErrShear.toExponential(3)}`);
    expect(maxErrShear).toBeLessThan(1e-12);

    // Case 2: Extensional flow u = (x, -y) => gammaDot = 2.0 exactly
    for (let j = 0; j < N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = i * dx;
        u[i + j * (N + 1)] = x;
      }
    }
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i < N; i++) {
        const y = j * dx;
        v[i + j * N] = -y;
      }
    }

    e.opStrainRate(1.0, 1.0, 0.0, 1000.0, 1e-6, 1e6, 1, 0.0, 0.0, 0.0, 0.0);

    let maxErrExt = 0;
    for (let c = 0; c < N * N; c++) {
      const err = Math.abs(gd[c] - 2.0);
      if (err > maxErrExt) maxErrExt = err;
    }
    console.log(`U10 extensional u=(x,-y) max error = ${maxErrExt.toExponential(3)}`);
    expect(maxErrExt).toBeLessThan(1e-12);
  });
});
