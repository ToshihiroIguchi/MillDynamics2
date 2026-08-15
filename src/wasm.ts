import wasmUrl from '../assembly/build/mill.wasm?url';

export async function initWasm() {
  const response = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiateStreaming(response, {
    env: {
      abort(_m: number, _f: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      trace() {},
    },
  });
  return instance.exports as any;
}
