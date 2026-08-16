import { describe, it, expect } from 'vitest';
import { loadSolver } from './helpers/loadWasm';
import * as MODES from '../src/modes';

// The boundary-mode constants used to exist as three independent hand-copied
// literal sets on the TypeScript side, none of which matched assembly/types.ts.
// src/main.ts ran the mill with mode 4 (MODE_INFLOW) believing it to be
// MODE_SLUMP. This test pins the shared definitions against the WASM exports so
// the two can no longer drift apart silently.
describe('Boundary mode constants match the WASM build', () => {
  it('src/modes.ts agrees with assembly/types.ts', async () => {
    const { e } = await loadSolver(true);

    const expected: Record<string, number> = {
      MODE_MILL: e.EXPORT_MODE_MILL.valueOf(),
      MODE_PERIODIC: e.EXPORT_MODE_PERIODIC.valueOf(),
      MODE_CAVITY: e.EXPORT_MODE_CAVITY.valueOf(),
      MODE_CHANNEL: e.EXPORT_MODE_CHANNEL.valueOf(),
      MODE_INFLOW: e.EXPORT_MODE_INFLOW.valueOf(),
      MODE_COUETTE: e.EXPORT_MODE_COUETTE.valueOf(),
      MODE_SLUMP: e.EXPORT_MODE_SLUMP.valueOf(),
      MODE_OBSTACLE: e.EXPORT_MODE_OBSTACLE.valueOf()
    };

    for (const [name, wasmValue] of Object.entries(expected)) {
      expect(
        (MODES as unknown as Record<string, number>)[name],
        `${name} in src/modes.ts must equal the WASM value`
      ).toBe(wasmValue);
    }

    // Guard the specific confusion that caused the bug.
    expect(MODES.MODE_SLUMP).not.toBe(MODES.MODE_INFLOW);
    expect(MODES.MODE_SLUMP).toBe(6);
    expect(MODES.MODE_INFLOW).toBe(4);
  });
});
