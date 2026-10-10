import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 맥 한 대에서 세션 여러 개가 동시에 돌면 기본 워커(코어−1)가 겹쳐 메모리가 고갈된다(2026-10-10 멈춤).
    // 기본 2개 — 혼자 돌릴 땐 VITEST_MAX_WORKERS=6 처럼 올린다.
    minWorkers: 1,
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // Phase 10 Wave 0 — 아직 테스트가 없으므로(파서는 Wave 2) 0 test 시 exit 0 보장.
    passWithNoTests: true,
  },
});
