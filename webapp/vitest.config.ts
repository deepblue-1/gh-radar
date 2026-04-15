import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Phase 5 Wave 0 — webapp unit 테스트용 vitest 설정.
 * - jsdom 환경 (usePolling 훅 테스트의 document/window 필요)
 * - globals 활성 (describe/it/expect 전역)
 * - 경로 alias `@/*` → src/*
 * - watch 모드 금지 (VALIDATION.md 규약 — CLI 에서 `--run` 강제)
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
