# Phase 21 — Deferred Items (범위 밖 발견)

## 21-06 실행 중 발견 (2026-09-26)

기존 실패 e2e 3건. 모두 이 플랜과 무관하다. 앞의 2건은 플랜 시작 커밋 `c3393ba` 의 `webapp/src` 로 되돌려 돌려도 똑같이 실패한다.

1. `e2e/specs/trading-workbench.spec.ts:580` 「5. 격자 1/2/3단 × 폰/와이드 … 잘림 0 (E6 overflow · D-12)」
   - 뷰포트 360(카드 342px)에서 카드 헤더 종목명 `<b>삼성전자</b>` 가 상자를 19px 넘친다.
2. `e2e/specs/trading-workbench.spec.ts:2089` 「P20-3 최악값 × 본문 344 · 700 · 830 · 992 …」
   - 344 카드 매수 pane 에서 같은 `<b>삼성전자</b>` 가 17px 넘친다. 1과 뿌리가 같아 보인다(카드 헤더 이름 칸 폭).
3. `e2e/specs/trading-workbench.spec.ts:2314` 「터치 기기 · iPhone 가로 폭 844 에서 종목 추가 입력이 16px 다」
   - quick-260925-ptw 에서 확대/축소를 금지하면서 입력 글꼴을 14px(`--t-sm`) 하나로 정했다(`app/layout.tsx` viewport 주석).
   - 테스트는 그 전 계약인 16px 를 아직 단언한다. 테스트가 낡았다.

위 3건을 빼고 돌린 `trading-workbench.spec.ts` 나머지는 41건 모두 통과했다.

## 21-06 관찰 — 코드 미변경

- `DirtyActionBar` 를 렌더하는 프로덕션 소비처가 지금은 없다. `DirtyBarHostContext` 소비처도 없고, 작업대는 `dirtyBarCount={0}` 을 넘긴다.
  - globals.css §21 의 더티 바 규칙은 컴포넌트가 다시 쓰일 때를 위한 계약으로 남겼다.
  - 카드 안 더티 바(`card-dirty-host`)를 되살리면 `usePinnedToViewportBottom`(strategy-card.tsx)의 `limit` 식을 고쳐야 한다. 지금 식은 `innerHeight − --wb-bottom-inset` 이다.
  - 앱에서는 여기에 `--native-tabbar-offset` 을 더 빼야 한다. 이 값은 calc 식이라 JS 로 읽으려면 `@property` 로 `<length>` 등록이 필요하다. 빼지 않으면 탭바 위로 올라간 공용 패널 밑에 바가 묻힌다.

## 21-34 실행 중 발견 (2026-09-26)

- `OrderbookLadder` 의 `variant: 'orderbook'` 분기는 D-31 뒤 프로덕션 소비처가 없다(카드 본문만 `variant="chaser"` 로 쓴다).
  status: open
  **What:** 공유 모듈 삭제 금지(21-34 prohibition)라 손대지 않았다. 지우려면 사다리 단위 테스트(orderbook-ladder.test)와 함께 별도 정리.
- `CardBody` 의 `basePrice` · `upperLimit` 폴백 프롭은 넘기는 호출부가 없다(옛 호가 탭이 REST 스냅샷을 넘기던 자리).
  status: open
  **What:** 동작 영향 없음(실시간 `quote` 가 이긴다). 정리 후보.
- 옛 이름·옛 동작을 말하는 주석이 21-34 files 밖에 남았다 — `globals.css` §21 · 챗 FAB 규칙(「주문하기」 CTA · 「호가주문 탭에서는 CTA 가 언마운트」), `orderbook/__tests__/account-panel.test.tsx:753`(「실측 폭 단언은 E2E(orderbook.spec.ts)」 — 이제 trading-workbench.spec 「G-21-R3-10 이전 — 390 카드 미체결」), 플랜이 이미 짚은 me-client · quote-grid-10 · strategy-card · relay-provider · use-relay-socket.
  status: open
  **What:** 동작 무관 · 플랜 「과설계 금지」 로 이번 범위에서 고치지 않았다.

