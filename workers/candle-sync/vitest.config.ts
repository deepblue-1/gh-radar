import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 맥 한 대에서 세션 여러 개가 동시에 돌면 기본 워커(코어−1)가 겹쳐 메모리가 고갈된다(2026-10-10 멈춤).
    // 기본 2개 — 혼자 돌릴 땐 VITEST_MAX_WORKERS=6 처럼 올린다.
    minWorkers: 1,
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
    globals: true,
    // Plan 02 는 placeholder 만 — 실제 테스트는 Plan 03/04 가 추가.
    // 빈 워크스페이스에서 vitest exit 1 회피 (Plan 03/04 가 테스트 추가하면 자연스럽게 제거 가능)
    passWithNoTests: true,
  },
});
