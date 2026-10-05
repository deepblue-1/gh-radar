import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // 테스트 파일이 없으면 실패한다 — 트레이서의 워커 끝 증명이 조용히 0건이 되지 않게.
    passWithNoTests: false,
  },
});
