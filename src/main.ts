import { initWasm } from './wasm';

async function bootstrap() {
  const statusEl = document.getElementById('status');
  try {
    const wasm = await initWasm();
    console.log('WASM loaded successfully. add(2, 3) =', wasm.add(2, 3));
    if (statusEl) {
      statusEl.textContent = `WASM Ready: add(2, 3) = ${wasm.add(2, 3)}`;
    }
  } catch (err) {
    console.error('Failed to initialize WASM:', err);
    if (statusEl) {
      statusEl.textContent = `Error: ${String(err)}`;
    }
  }
}

bootstrap();
