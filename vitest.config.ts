import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // CI環境 (Ubuntu) はローカルより2-5x遅いため余裕を持って設定
    testTimeout: 120000,  // 2 minutes per test default
    hookTimeout: 30000,
  },
});
