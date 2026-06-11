import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // co-located 순수함수 단위 테스트(src/**/*.test.ts) + 기존 tests/ 통합 테스트 둘 다 수집.
    // Phase 11 computeComovement.test.ts 는 plan 이 src/lib 에 co-locate 지정 (Rule 3 — include 확장).
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
