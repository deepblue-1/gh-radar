# Phase 15 — 범위 밖 발견 항목 (Deferred)

실행 중 발견했으나 **해당 plan 의 변경이 원인이 아닌** 선재(pre-existing) 이슈를 기록한다.
고치지 않는다 — 별도 quick 작업으로 처리할 것.

## 15-01 (2026-09-05)

### `packages/shared` 테스트 1건 선재 실패 — `THEME_STOCK_SOURCES` 에 `"ai"` 잔존

- **발견 경로:** `pnpm -r run test` (15-01 verification 중 부수 확인)
- **실패:** `packages/shared/src/__tests__/theme.test.ts:25`
  — `THEME_STOCK_SOURCES` 가 `["naver","alphasquare","ai","user"]` 를 기대하나
  실제는 `"ai"` 가 빠진 3종.
- **원인:** theme-sync 의 AI 분류 경로가 2026-07-06 (quick-260706-erk) 에 코드째 제거되면서
  상수는 갱신됐으나 테스트가 남았다. 자동 메모리 `project_claude_haiku_cost_classify` 참조.
- **15-01 무관 근거:** 15-01 의 변경 파일 목록에 `theme.ts` / `theme.test.ts` 가 없다
  (`git diff --name-only 27088f3..HEAD` 확인).
- **영향:** `pnpm -r run test` 가 exit 1. 루트 `pnpm typecheck` 는 exit 0 으로 영향 없음.
- **처리:** 기대값을 3종으로 고치거나 `"ai"` 를 되살리거나 — 어느 쪽인지 theme 도메인
  판단이 필요하므로 phase 15 범위 밖. 별도 quick 으로.
