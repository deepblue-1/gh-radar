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
