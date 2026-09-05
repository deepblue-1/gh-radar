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

## 15-11 (2026-09-05)

### `mockDiscussionsApi` E2E 픽스처가 구계약(배열)을 반환 — 토론 섹션 E2E 6건 선재 실패

- **발견 경로:** 15-11 Task 3 탭 회귀 E2E 작성 중 `뉴스토론` 탭의 토론 섹션이
  `토론방을 불러올 수 없어요` 에러 상태로 렌더되는 것을 확인.
- **원인:** `webapp/e2e/fixtures/discussions.ts` 의 GET 스텁이 `Discussion[]` 배열을
  그대로 반환하나, 클라이언트 계약은 `fetchStockDiscussions` →
  `DiscussionListResponse = { items, hasMore }` 다. 컴포넌트가 `page.items` 를 읽어
  `undefined` 가 되면서 load 가 throw → 에러 분기.
- **15-11 무관 근거:** 15-11 이 건드리지 않은 **풀페이지 라우트**
  `/stocks/:code/discussions` 테스트(`discussions.spec.ts:102`)도 동일하게 실패한다.
  base 커밋 `d8bac90` 의 소스로 되돌려 실행해도 재현됨.
- **영향:** `playwright test discussions` 6 failed / 2 passed.
- **처리:** 픽스처를 `{ items, hasMore }` 로 갱신 + 무한스크롤 케이스의 `hasMore`
  시나리오 재설계가 필요. 토론 도메인 판단이 얽혀 있어 별도 quick 으로.
- **15-11 이 한 것:** 탭 회귀 단언은 데이터 상태와 무관하게 "섹션이 올바른 탭에
  mount 되는가" 만 보도록 `[data-testid^="stock-discussion-section"]` 접두 매칭 사용.
  픽스처 자체는 고치지 않았다.

### `stock-detail-chart.spec.ts` `getByLabel('일봉 차트')` strict mode violation (수정함)

- **원인:** 스켈레톤의 `aria-label="일봉 차트 로딩 중"` 이 기본 substring 매칭에 걸려
  로케이터가 2개 요소로 해석됨.
- **선재 근거:** base 커밋 `d8bac90` 소스로 되돌려 실행해도 동일 실패(재현 확인).
- **처리:** 범위 밖이지만 15-11 Task 3 의 acceptance(`stock-detail-chart` green)가
  이 테스트를 직접 요구하므로 `{ exact: true }` 로 로케이터 정밀화만 적용했다.
  단언 의도(차트 카드 aria-label 존재)는 그대로다.
