import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // 스캐폴드 단계 — config.test.ts 외 본 cycle 테스트는 Plan 04 가 rebuild.ts 와 함께 추가.
    // 빈 워크스페이스에서도 vitest exit 1 회피 (Plan 04 가 테스트 추가하면 자연 제거 가능)
    passWithNoTests: true,
  },
});
