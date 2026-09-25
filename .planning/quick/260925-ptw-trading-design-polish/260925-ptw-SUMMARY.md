---
phase: quick-260925-ptw
plan: 01
subsystem: webapp/trading-workbench
status: complete
tags: [trading, workbench, card-header, card-tabs, css-layer, viewport, a11y]
requires: []
provides:
  - "코드 없는 한 줄 종목명 + 이름 옆 ⓘ + 맨 오른쪽 ✕ 카드 헤더"
  - "카드 탭 본문 고정 높이(4 × --row-h) + 접기 버튼 + 접힘 기억(cardTabsFolded)"
  - "공용 패널 미체결·잔고 행 → 카드 보장·block:start 스크롤·헤더 토글 포커스(reveal)"
  - ".tbl-wrap 머리글 좌정렬 기본값을 @layer components 로 — 우정렬 머리글 복구"
  - "작업대 머리줄(workbench-head) flex-wrap — 제목·계좌·상태줄 한 줄"
  - "viewport maximum-scale=1 · user-scalable=no + 종목추가 입력 14px"
affects: [webapp/src/styles/globals.css (전역 .tbl-wrap 표 머리글)]
tech-stack:
  added: []
  patterns:
    - "층 없는 전역 규칙이 층 있는 Tailwind 유틸을 이기는 문제 — 기본값만 @layer components 로 내림"
    - "ScrollTarget.reveal 플래그로 스크롤 방식·포커스 이동을 호출 경로별로 분기"
key-files:
  created:
    - webapp/src/styles/__tests__/table-head-align.test.ts
  modified:
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/workbench/stock-add-bar.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/ui/command.tsx
    - webapp/src/lib/trading-layout.ts
    - webapp/src/styles/globals.css
    - webapp/src/app/layout.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/src/components/trading/__tests__/card-header.test.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
decisions:
  - "카드 탭 고정 높이는 네 탭 공통 h-[calc(var(--row-h)*4)] — 밀도 토큰을 따라가며 새 px 숫자를 박지 않는다"
  - "탭 접힘만 localStorage(cardTabsFolded)로 기억 — 새로 마운트되는 카드의 기본값, 알림 탭 요청은 펼치기만 하고 저장하지 않는다"
  - "잔고 행은 거래소를 모르므로 addCard 와 같은 ISIN 단위 규칙(상태줄 계좌 · KRX)으로 카드를 보장"
  - "카드 탭 안 미체결 클릭은 reveal 하지 않는다(nearest · 포커스 불변) — 공용 패널 경로만 reveal"
  - ".tbl-wrap thead th 의 text-align:left 만 @layer components 로 — 나머지(B 평면화)는 층 없는 채로"
metrics:
  duration: "~55m"
  completed: 2026-09-25
actuals:
  tokens: 19500
  tasks: 3
  commits: 0
plan_head_before: f2653ab
---

# Phase quick-260925-ptw Plan 01: 트레이딩 작업대 디자인 손보기 8건 Summary

카드 헤더에서 종목코드를 빼고 ⓘ 를 종목명 옆·✕ 를 종목명 줄 맨 오른쪽으로 옮겼다. 카드 탭 본문은 4 × --row-h 고정 높이에 세로 스크롤·접기(기억)를 붙였다. 공용 패널 미체결·잔고 행을 누르면 카드를 보장하고 머리 위로 스크롤한 뒤 헤더에 포커스를 준다. 표 머리글 우정렬은 CSS 층위 버그를 근본에서 고쳐 복구했다. 머리줄은 flex-wrap 한 줄로 묶었고, viewport 확대를 막고 종목추가 입력을 14px 로 되돌렸다.

> 커밋 없음 — 오케스트레이터 지시(사용자 전역 규칙: 커밋 메시지 확인 후 커밋)에 따라 모든 변경은 작업 트리에 미커밋으로 남겼다. `commits: 0` 은 그 결과이고, 코드 변경은 `git status` 에 있다.

## 8건 반영

| # | 요청 | 반영 |
|---|------|------|
| PTW-1 | 종목코드 제거 · 종목명 한 줄 · ⓘ 이름 옆 | `card-header.tsx` — 코드 span·flex-col 두 줄 래퍼 삭제, 종목명 `<b>` 하나(15px/700 · truncate · title). ⓘ 를 l1 의 토글 바로 뒤로. `code` prop 은 ⓘ 비활성 판정(D-30) 전용으로만 남김 |
| PTW-2 | ✕ 를 종목명 줄 맨 오른쪽 | ✕ 를 헤더 직계 자식(l1 → ✕ → l2)으로. 760 미만: l2 가 `order-last basis-full` 로 둘째 줄, ✕ 는 첫 줄 끝. 760 이상: ✕ `@min-[760px]/lc:order-last` 로 LED 뒤 |
| PTW-3 | 탭 본문 고정 높이 + 스크롤 | `card-tabs.tsx` — 네 `TabsContent` 를 `card-tabs-body`(`h-[calc(var(--row-h)*4)] overflow-y-auto`) 하나로 감쌈. 기존 탭별 `max-h-[210px]` 래퍼 삭제. 실측: 정보/미체결/로그 모두 144px |
| PTW-4 | 탭 영역 접기 | 탭 줄 오른쪽 끝 `card-tabs-fold` 버튼(aria-expanded · aria-controls · 「탭 접기/펼치기」 · ChevronDown 회전). 접힘은 `writePanelsPref({cardTabsFolded})` 로 기억, 마운트 시 지연 초기화로 읽음. 접힌 채 탭 클릭 → 펼침(false 저장), 알림 `requestedTab` → 펼침(저장 안 함) |
| PTW-5 | 하단 패널 행 → 카드 생성/포커싱 | `account-panel.tsx` `onPickHolding`(account 스코프만, 넘기지 않으면 DOM 불변) → `shared-panels.tsx` 전달 → `trading-workbench.tsx` `pickHolding`/`selectUnfilledFromPanel` 이 `reveal: true` 로 `block:"start"` 스크롤 + `focus({preventScroll:true})`. 카드 `article` 에 `scroll-mt-16`(앱 헤더 56px 회피). 송신 0 |
| PTW-6 | 우정렬 열 머리글 우정렬 | `globals.css` — 층 없는 `.tbl-wrap thead th` 에서 `text-align:left` 만 빼 `@layer components` 로. 실측: 잔고 머리글 수량~손익률 `right` |
| PTW-7 | 상태줄을 제목·계좌와 같은 줄 | `workbench-head`(`flex flex-wrap gap-3`) 로 제목과 상태줄을 감싸고 상태줄에 `flex-[1_1_auto]`. 1440 에서 한 줄, 390 에서 상태줄이 다음 줄(스크린샷 확인) |
| PTW-8 | viewport 확대 금지 + 입력 글꼴 | `layout.tsx` viewport 에 `width/initialScale 1/maximumScale 1/userScalable false`(실측 meta = `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`). `stock-add-bar.tsx` 입력 `text-[length:var(--t-sm)]` 하나(실측 14px). command.tsx·e2e spec 은 주석만 |

## 검증

- `pnpm run typecheck`: 통과(tsc + e2e tsconfig, exit 0)
- `pnpm run lint`: 오류 0. 경고 5건은 모두 이번 변경과 무관하며 HEAD 에도 있다(theme-detail-client · card-body.test · strategy-status-card.test · trading-workbench `dirtyCardCount` · use-relay-socket). card-tabs.test 의 unused `screen` 경고는 원래 있던 것이지만 손댄 파일이라 import 를 지워 없앴다
- `pnpm run test`: **109 파일 통과 · 2132 통과 · 1 skip**. skip 은 `watchlist-api.test.ts` 의 `describe.skipIf(!SUPABASE_E2E_URL)` 로 원래 있던 것이다
- 태스크별 verify: Task 1 3파일 152/152 · Task 2 5파일 126/126(+viewport grep) · Task 3 5파일 통과. `data-part="code"` 0 · `max-h-[210px]` 0 · `pointer-fine:text-` 0
- 시각 확인(Playwright · 기존 auth.setup + 로컬 relay 스텁 · dev 서버 3100 자동 기동·종료): light/dark × 1440/390 네 조합 모두 통과. 스크린샷 28장은 `/private/tmp/claude-501/-Users-alex-repos-gh-radar--claude-worktrees-toss-b/5e2c4ce7-9c6d-4c94-8dcf-fcc7309ab4a6/scratchpad/ptw/` 에 있다. 임시 spec 은 실행 후 지웠다

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] strategy-card.test WR-05 케이스의 헤더 토글 쿼리가 모호해짐**
- **Found during:** Task 2
- **Issue:** 카드 탭 접기 버튼도 `aria-expanded` 를 갖게 되면서 `getByRole('button', { expanded: true })` 가 요소 2개를 찾았다
- **Fix:** `{ name: '에코프로비엠', expanded: true }` 로 헤더 토글을 이름으로 고르게 했다. 작업대 테스트 헬퍼 `toggleOf`(첫 `button[aria-expanded]`)는 헤더 토글이 DOM 상 먼저 오므로 그대로 유효하다
- **Files modified:** webapp/src/components/trading/__tests__/strategy-card.test.tsx

### 기타

- Task 3 은 구현과 테스트를 같은 흐름에서 작성했다(엄격한 RED 선행 아님). 새 단언(`block:'start'` · `activeElement` = 헤더 토글 · `account-holding-pick`)은 새 동작에만 존재하는 값이라 회귀 가드로 유효하다.
- 커밋 0 — 오케스트레이터 지시다(위 참고).

## 눈에 띄는 트레이드오프(사용자 확인 권장)

- 넓은 카드(1단 · 700 이상)에서 「정보」 탭은 10칸이 한 줄이라 고정 높이 144px 안에 빈 공간이 크게 남는다. 요청대로 네 탭의 높이를 같게 맞춘 결과다(카드 높이 불변이 목적).
- 폰에서 공용 패널 잔고 행으로 만든 카드는 relay 가 이름·코드를 못 풀면 ISIN 으로 보이고 ⓘ 가 비활성이다. 기존 D-30 규약 그대로다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 경로·송신 경로가 없다. 공용 패널 행 → 카드 경로의 relay 송신 0 은 작업대 테스트 ①~④ 가 단언한다(T-ptw-02). `cardTabsFolded` 는 boolean 검증 뒤에만 쓴다(T-ptw-01). viewport `userScalable:false` 의 접근성 트레이드오프는 layout.tsx JSDoc 에 적었다(T-ptw-05 accept).

## Self-Check: PASSED

- 생성 파일 `webapp/src/styles/__tests__/table-head-align.test.ts`: 있음
- 수정 파일 17개: `git status` 에 M 으로 있음
- 커밋: 지시에 따라 없음(해당 없음)
