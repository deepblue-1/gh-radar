import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 맥 한 대에서 세션 여러 개가 동시에 돌면 기본 워커(코어−1)가 겹쳐 메모리가 고갈된다(2026-10-10 멈춤).
    // 기본 2개 — 혼자 돌릴 땐 VITEST_MAX_WORKERS=6 처럼 올린다.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
    globals: false,
    environment: "node",
    // co-located 순수함수 단위 테스트(src/**/*.test.ts) + 기존 tests/ 통합 테스트 둘 다 수집.
    // Phase 11 computeComovement.test.ts 는 plan 이 src/lib 에 co-locate 지정 (Rule 3 — include 확장).
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
