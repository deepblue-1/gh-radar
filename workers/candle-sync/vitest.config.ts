import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // Plan 02 는 placeholder 만 — 실제 테스트는 Plan 03/04 가 추가.
    // 빈 워크스페이스에서 vitest exit 1 회피 (Plan 03/04 가 테스트 추가하면 자연스럽게 제거 가능)
    passWithNoTests: true,
  },
});
