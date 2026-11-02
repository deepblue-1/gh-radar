import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 맥 한 대에서 세션 여러 개가 동시에 돌면 기본 워커(코어−1)가 겹쳐 메모리가 고갈된다(2026-10-10 멈춤).
    // 기본 2개 — 혼자 돌릴 땐 VITEST_MAX_WORKERS=6 처럼 올린다.
    minWorkers: 1,
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 2,
    globals: true,
    // 테스트 파일이 없으면 실패한다 — 트레이서의 워커 끝 증명이 조용히 0건이 되지 않게.
    passWithNoTests: false,
    // 워커 로그(pino)는 시험 출력에서 끈다 — 보려면 LOG_LEVEL=info 로 돌린다.
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "silent" },
  },
});
