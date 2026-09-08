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

## 16-13 (2026-09-09)

| 대상 | 내용 |
|------|------|
| `use-relay-socket.ts` 의 `clockStamp()` | `now.toLocaleTimeString("ko-KR", { hour12: false })` 가 **Chromium 에서 `0시 57분 16초`** 를 돌려준다(16-13 E2E 가 같은 호출을 쓰던 상따 상태줄에서 실측으로 잡았다). 이 값은 `RelayServerMessageEntry.receivedAt` 이 되어 **호가주문 탭의 `relay-status-bar` 알림 시각**에 그대로 렌더된다 — `.mono` 고정폭 계약이 깨져 알림이 쌓일 때마다 시각 열 폭이 달라진다. 상따 화면은 자체 `clockNow()`(자리수 직접 채움)로 우회했고, **Phase 15 표면인 `use-relay-socket`·`relay-status-bar` 는 손대지 않았다** — 16-13 의 diff 가 닿지 않는 파일이고 고치면 이 plan 의 진단이 흐려진다. 같은 한 줄 수정이면 되므로 다음 quick 에서 함께 정리하는 것이 맞다. |
| `text-[10px]` 선행 사용처 4파일 | `chat/agent-progress.tsx` · `stock/discussion-refresh-button.tsx` · `stock/news-refresh-button.tsx` · `stock/stock-comovement-section.tsx` · `stock/stock-limit-up-section.tsx` 에 10px 이 이미 쓰이고 있다(Phase 8/11/12 표면). 16-UI-SPEC T3 의 「10px 은 정확히 2곳」은 **Phase 16 표면 한정** 계약이고, 16-13 이 추가한 10px 은 호가 등락률·체결 시각 2곳뿐임을 RTL 이 잠갔다. 선행 사용처는 스코프 밖이라 손대지 않았다. |
