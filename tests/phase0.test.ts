import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';

describe('Phase 0 - WASM Loading & Execution', () => {
  it('calls add(a, b) correctly from WebAssembly', async () => {
    const { e } = await loadSolver(true);
    expect(e.add(2.5, 3.5)).toBe(6.0);
  });
});
