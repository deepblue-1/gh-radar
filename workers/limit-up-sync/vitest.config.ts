import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // 본 plan 이 config.test.ts + rebuild.test.ts 를 복제하므로 테스트 존재.
    // passWithNoTests 유지 (향후 cycle 테스트 추가/제거 시 안전).
    passWithNoTests: true,
  },
});
