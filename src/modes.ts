// src/modes.ts
// Boundary-mode constants. These MUST match assembly/types.ts exactly.
//
// They previously existed as three separate hand-copied literal sets — in
// src/main.ts, tests/phase3_penalization.test.ts and tests/phase4_bed_porous.ts
// — and none of them agreed with assembly/types.ts. The app ran the mill with
// mode 4, which is MODE_INFLOW, not MODE_SLUMP; that both imposed a spurious
// inflow condition on the left boundary and set `skipMean` on the pressure
// solve, disabling the mean-zero compatibility projection that a pure-Neumann
// Poisson problem requires (NUMERICS.md §8). Import from here instead of
// re-declaring. tests/modes.test.ts pins these against the WASM exports.

export const MODE_MILL = 0;
export const MODE_PERIODIC = 1;
export const MODE_CAVITY = 2;
export const MODE_CHANNEL = 3;
export const MODE_INFLOW = 4;
export const MODE_COUETTE = 5;
export const MODE_SLUMP = 6;
export const MODE_OBSTACLE = 7;
