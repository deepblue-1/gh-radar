# Deferred Items — Phase 16

Plan 실행 중 발견했으나 **그 plan 의 변경이 원인이 아니어서** 손대지 않은 것들.
스코프 밖 수정 금지 규율(executor SCOPE BOUNDARY)에 따라 여기 기록만 남긴다.

## 16-11 (2026-09-08)

E2E 전량(`pnpm --filter gh-radar-webapp test:e2e`)에서 **3건이 실패**한다. 셋 다
16-11 의 diff 가 닿지 않는 파일이고, `app-sidebar.tsx` 를 16-11 이전 버전
(`a43cabfd`)으로 되돌린 상태에서 재현해 **선행 실패임을 실측 확인**했다.

| Spec | 케이스 | 증상 | 원인 추정 |
|------|--------|------|-----------|
| `a11y.spec.ts` | `/stocks/005930 — critical/serious 위반 0` | axe `aria-prohibited-attr` 1건 | `stock-daily-chart-skeleton.tsx` 의 `<div data-slot="skeleton" aria-busy aria-label="일봉 차트 로딩 중">` — role 없는 `div` 에 `aria-label` 은 금지다. `role="status"` 를 주면 해소된다(`themes-skeleton`·`watchlist-skeleton` 은 이미 `role="status"` 를 갖고 있어 같은 계열의 누락으로 보인다). |
| `news.spec.ts` | `caps list at server-provided limit` | `toBeGreaterThan` 실패 | 뉴스 목록 상한 계약 회귀. 16-11 무관. |
| `search.spec.ts` | `⌘K 단축키 → 검색 → 선택` | `getByRole('dialog')` 미출현 | ⌘K 단축키가 헤드리스에서 CommandDialog 를 열지 못함. 키보드 포커스/단축키 경로 회귀. |

`news.spec.ts` 의 `refresh cooldown (V-19)` 은 실행에 따라 통과/실패가 갈렸다(불안정).

**하지 않은 것:** 위 3건 중 어느 것도 고치지 않았다. 16-11 의 표면(사이드바·게이트·배지·
라우트 셸)과 무관하고, 손대면 이 plan 의 diff 가 진단 불가능해진다.

## 16-15 (2026-09-09)

16-11 이 기록한 선행 실패 3건(`a11y` · `news` · `search`)이 **그대로 재현**된다. 16-15 의
diff(`/me` 표면 · 전략 현황 카드 · 계좌 상태 맵)와 닿는 파일이 하나도 없고, 실패 케이스도
`/stocks/005930` · `/news` · ⌘K 로 전부 다른 표면이다. 손대지 않았다.

추가로 기록해 두는 것:

| 대상 | 내용 |
|------|------|
| `account-panel` 의 `min-w-0` | 지금 마크업에서는 표 컨테이너의 `overflow-x:auto` 가 콘텐츠 최소폭 전파를 막아 **이 값을 지워도 당장은 넘치지 않는다**(변이 실측). 규칙 자체는 `me.spec.ts` 케이스 7 이 computed style 로 잠갔다 — 표를 감싸는 방식이 바뀌면 이 값이 유일한 방어선이 된다. |
| 「발주됨」 배지 | My page 에서는 뜨지 않는다. 주문 통보(`RelayOrderMsg`)에 ISIN 이 없어 어느 전략의 발주인지 귀속시킬 수 없다. 근거 없이 붙이면 한 번도 발주되지 않은 전략에 「발주됨」이 붙으므로 **의도적으로 만들지 않았다**. 귀속 경로가 생기면(통보에 ISIN 추가 등) 그때 붙인다. |
