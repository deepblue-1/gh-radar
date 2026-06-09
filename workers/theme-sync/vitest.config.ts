import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // Phase 10 Wave 0 — 아직 테스트가 없으므로(파서는 Wave 2) 0 test 시 exit 0 보장.
    passWithNoTests: true,
  },
});
