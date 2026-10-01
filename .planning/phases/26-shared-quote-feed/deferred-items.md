# Phase 26 — Deferred Items

## Deferred Items

- 작업대 카드 헤더 종목명이 폰 카드 폭(≈342~344px)에서 현재가·등락률이 뜨면 말줄임된다 — e2e `trading-workbench.spec.ts` 「5. 격자 1/2/3단 × 폰/와이드」(뷰포트 360 · `삼성전자` over 26) · 「P20-3 최악값 × 본문 344」(344 카드 · over 24) 실패
  status: wontfix — 사용자 결정 2026-10-01 「수정 필요없음」 (Phase 26 마감 시)
  **Found during:** 26-05 Task 1 e2e (quote 경로 복구 뒤 처음 시세가 다시 뜬 실행)
  **Why deferred:** 제품 코드(`webapp/src/components/trading/card/card-header.tsx` l1 한 줄 배치) 결함이고 이 플랜의 범위(e2e 픽스처 · 소켓 선택) 밖이다. 26-03 이후 e2e 는 시세가 0 이라 헤더 가격 칸이 `——`(≈32px)였고 이름이 들어갔다. 시세가 돌아와 `98,100+0.10%`(≈103px)가 되자 이름 칸이 26px 모자란다. 26-03 이전(사용자 세션으로 시세가 오던 때)과 같은 상태이며 `e6f11bfa..HEAD` 사이 `webapp/src` 커밋은 0건이다 — Phase 26 회귀가 아니다.
  **Repro:** `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "5\. 격자 1/2/3단"` · 임시 진단(시세 on → nameOver 26 · priceText `98,100+0.10%` · 시세 off → nameOver 0 · `——`)
  **Next:** 헤더 l1 폰 밴드 배치 결정(이름 말줄임을 허용해 단언을 바꿀지 · 가격을 둘째 줄로 내릴지)은 UI 결정이라 사용자 확인이 필요하다.

- 터치 기기 종목 추가란 글꼴 16px 단언 실패 — `trading-workbench.spec.ts` 「터치 기기 · iPhone 가로 폭 844 에서 종목 추가 입력이 16px 다」(받은 값 14px)
  status: wontfix — 사용자 결정 2026-10-01 「수정 필요없음」 (Phase 26 마감 시)
  **Found during:** 26-05 Task 1 e2e
  **Why deferred:** relay · 소켓 경로와 무관한 CSS 회귀다. `stock-add-bar.tsx` 입력이 `text-[length:var(--t-sm)]` 하나라 터치 16px 분기가 없다 — `3e78d9f1`(09-25 「전역 검색 14px · 종목추가 바 46px」)가 quick-260922-tqr 의 터치 16px 를 덮은 것으로 보인다. 제품 코드라 이 플랜에서 고치지 않는다.
  **Repro:** `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "16px 다"`
