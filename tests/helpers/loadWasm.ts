import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function loadSolver(debug = true) {
  const path = fileURLToPath(new URL(
    debug ? '../../assembly/build/mill.debug.wasm'
          : '../../assembly/build/mill.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(readFileSync(path), {
    env: {
      abort(_m: number, _f: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      trace() {},
    },
  });
  const e = instance.exports as any;
  const view = (ptr: number, len: number) =>
    new Float64Array(e.memory.buffer, ptr, len);
  return { e, view };
}
