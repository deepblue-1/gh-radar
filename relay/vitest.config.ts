/**
 * Phase 15 Plan 01 — RELAY-01. relay 워크스페이스 vitest 설정.
 *
 * server/vitest.config.ts 와 동일 규약: co-located 순수함수 단위 테스트
 * (`src/**\/*.test.ts` — 코덱/엔벨로프 등)와 `tests/` 통합 테스트를 둘 다 수집한다.
 *
 * D-26: 생성 코드(`src/generated/**`)는 테스트 대상이 아니다 — include 가 `.test.ts`
 *       만 잡으므로 자동으로 빠진다.
 *
 * 하지 않는 것: watch 모드로 두지 않는다. `package.json` 의 `test` 는 `vitest run`
 *              (watch 면 루트 `pnpm -r run test` 가 영원히 멈춘다).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Wave 1 시점의 relay 는 테스트가 0건이다. vitest 4 는 테스트 파일이 없으면
    // exit 1 이라, 이 옵션이 없으면 루트 `pnpm -r run test` 가 relay 때문에 실패한다.
    // 테스트가 들어오는 wave 이후에도 유지 — 신규 워크스페이스/필터 실행 시 같은 함정.
    passWithNoTests: true,
  },
});
