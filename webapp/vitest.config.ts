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
    // 맥 한 대에서 세션 여러 개가 동시에 돌면 기본 워커(코어−1)가 겹쳐 메모리가 고갈된다(2026-10-10 멈춤).
    // 기본 2개 — 혼자 돌릴 땐 VITEST_MAX_WORKERS=6 처럼 올린다.
    minWorkers: 1,
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
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
