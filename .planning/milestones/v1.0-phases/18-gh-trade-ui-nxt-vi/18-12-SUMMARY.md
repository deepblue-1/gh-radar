---
phase: 18-gh-trade-ui-nxt-vi
plan: 12
subsystem: ui
tags: [trading, routing, sidebar, redirect, react, tdd]
status: complete

requires:
  - phase: 18-11
    provides: "/trading 라우트 · TradingWorkbench(?focus= 마운트 1회 소비 · parseStrategyKey 해석)"
  - phase: 17-07
    provides: "latchLedStateOf · LATCH_LED_NAMES (LED 판정 단일 정의)"
provides:
  - "옛 트레이딩 라우트 4개의 서버 redirect() — /trading, [key] 는 /trading?focus={재인코드 키}"
  - "사이드바 「트레이딩」 제목 링크(GroupHeading item/active) + 3단 KRX VI · NXT VI · 등록 전략(LED 3점)"
  - "limitChaserHref 본문 = /trading?focus= (이름·호출부 무수정)"
  - "strategyLedLabel · lib/trading-focus.ts (TRADING_FOCUS_EVENT · requestTradingFocus · useTradingFocusRequest)"
  - "TradingWorkbench 포커스 요청 수신 + withFocusedCard(?focus= 와 공용 펼침 규칙)"
affects: [18-13]

actuals:
  tokens: 16500
  tasks: 3
  commits: 7
plan_head_before: ff2ecebb660b073e6a9cfecb58a53d7cf08c3f13

tech-stack:
  added: []
  patterns:
    - "동적 세그먼트 → 쿼리 이관은 서버 컴포넌트에서 decode→encode 왕복 (next.config 정규식 금지)"
    - "헬퍼 이름 유지 + 본문만 교체로 호출부 무수정"
    - "URL 은 마운트 1회만 읽고, 이미 떠 있는 화면에는 클릭 사실을 window CustomEvent 로 따로 보낸다(뒤로가기 재펼침 금지 유지)"

key-files:
  created:
    - webapp/src/lib/trading-focus.ts
  modified:
    - webapp/src/app/trading/limit-chaser/page.tsx
    - webapp/src/app/trading/limit-chaser/new/page.tsx
    - webapp/src/app/trading/limit-chaser/[key]/page.tsx
    - webapp/src/app/trading/vi/page.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/chat/__tests__/chat-fab.test.tsx
    - webapp/src/components/trading/__tests__/vi-client.test.tsx
    - webapp/src/components/trading/workbench/stock-add-bar.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/styles/globals.css

key-decisions:
  - "이미 /trading 위에서 사이드바 전략을 눌러도 카드가 펼쳐지게, URL(?focus=) 대신 클릭 시 window CustomEvent(gh-radar:trading-focus)로 작업대에 요청한다 — searchParams 변화에 반응시키면 18-11 의 '뒤로가기로 다시 펼치지 않는다' 계약(테스트로 잠김)이 깨지고, 같은 항목 재클릭(URL 불변)도 못 잡는다"
  - "/trading 의 활성 표시는 「트레이딩」 제목 하나 — 3단 VI 2항목·전략 항목은 같은 작업대를 가리키므로 aria-current 를 받지 않는다"
  - "3단 VI 항목의 「가동」 배지는 줄마다 viTriggers.{KRX|NXT}.run 만 보고, 중지·모름이면 배지를 그리지 않는다(목업은 가동일 때만 표시). 사이드바에는 합집합이 필요한 자리가 없어 viAnyRunning import 를 뺐다(함수는 그대로)"
  - "3단 전략 항목의 원 아이콘 2개를 LED 3점(7px, latchLedStateOf 판정)으로 교체 — 폭 27px 로 옛 26px 예산과 같다. strategyIoLabel 은 유일한 사용처가 사라져 strategyLedLabel 로 대체"
  - "전략 표시 이름 폴백 = 전략 name → 계좌 역매핑 이름 → code → ISIN (빈 문자열은 없음으로)"

requirements-completed: []

duration: 12min
completed: 2026-09-22
---

# Phase 18 Plan 12: 옛 트레이딩 라우트 리다이렉트 + 사이드바 재구성 Summary

**옛 상따·VI 화면 4개 경로를 서버 `redirect()` 로 `/trading`(전략 키는 `?focus=`)에 모았습니다. 사이드바 「트레이딩」 제목은 `/trading` 링크가 됐고, 그 아래 3단은 「KRX VI」·「NXT VI」·등록 전략(종목명 + LED 3점)입니다. 이미 `/trading` 위에서 사이드바 전략을 눌러도 이제 카드가 펼쳐집니다.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-09-22T02:26:56Z
- **Completed:** 2026-09-22T02:38:55Z
- **Tasks:** 3 (+ 알려진 문제 수정 1건)
- **Files:** 신설 1 · 수정 16

## Accomplishments

- **리다이렉트 4개 (Task 1)**
  - `/trading/limit-chaser` · `/trading/limit-chaser/new` · `/trading/vi` → `/trading`.
  - `/trading/limit-chaser/[key]` → `await params` → `decodeURIComponent` → `encodeURIComponent` → `/trading?focus=…`. 잘린 `%` 는 원문을 그대로 싸서 보냅니다(작업대가 무시).
  - 넷 다 서버 컴포넌트이고 `'use client'` 가 없습니다. `next.config.ts` 에는 리다이렉트가 없습니다.
- **사이드바 (Task 2)**
  - `GroupHeading` 이 `item`/`active` 를 받으면 링크로 승격됩니다. 활성 판정은 기존 `samePath` 그대로이고, `usePathname()` 이 쿼리를 싣지 않아 `?focus=` 에서도 켜집니다.
  - 3단 = KRX VI · NXT VI · 등록 전략 N개. 개별 「상따」·「VI」 메뉴 상수와 「등록된 전략 없음」 문구를 걷었습니다.
  - 전략 항목: 종목명 1줄 ellipsis + `title`, LED 3점 7px(`latchLedStateOf`), 묶음 하나에만 `aria-label`(「매수 감시 · 매도 OFF · 취소 대기」).
  - `limitChaserHref` 는 이름을 그대로 두고 본문만 `/trading?focus=${encodeURIComponent(key)}` 로 바꿨습니다. `useTradingVisible` 과 그룹 항상 펼침은 손대지 않았고, 컨테이너 쿼리도 없습니다.
- **이미 `/trading` 위일 때 포커스 (18-11 알려진 문제 수정)**
  - 사이드바 전략 클릭 → `requestTradingFocus(key)` 이벤트 + 평소대로 링크 이동.
  - 작업대는 `useTradingFocusRequest` 로 듣고 `?focus=` 와 같은 규칙(`parseStrategyKey` → 등록 키 대조 → `withFocusedCard`)으로 펼칩니다. 스냅샷 전이면 마운트 때와 같은 보류 슬롯에 넣습니다.
  - 수식 키 클릭(새 탭)은 지금 탭 카드를 건드리지 않습니다. 뒤로가기는 이벤트가 없으므로 다시 펼치지 않습니다.
- **링크·주석 정리 (Task 3)**
  - My page 전략 현황 카드의 VI 행: `/trading/vi` → `/trading`. 구조는 그대로이고, 전략 행의 `limitChaserHref` 호출부는 무수정입니다.
  - `chat-fab.tsx` 는 머리 주석 문구만 바꿨습니다(`STOCK_DETAIL_PATH` 동작 무변경).

## Task Commits

1. **Task 1: 리다이렉트 4개** — `fb45604`
2. **Task 2: 사이드바 재구성** — RED `2118b44` → GREEN `0b4492e`
3. **알려진 문제: 이미 /trading 위 포커스** — RED `8a8e9dd` → GREEN `0fb9b6f`
4. **Task 3: 링크·주석 정리** — `ad45f33`
5. **시각 보정: VI 항목 글자색** — `c9665e5`

## TDD Gate Compliance

- Task 2 RED(`2118b44`)는 `@/lib/trading-focus` import 실패로 파일 전체가 빨간 상태였고, GREEN(`0b4492e`)에서 25 케이스가 통과했습니다.
- 작업대 포커스 RED(`8a8e9dd`)는 신규 3 케이스 중 2개가 단언 실패(카드가 펼쳐지지 않음)였습니다. 세 번째(어긋난/미등록 키 무시)는 원래 동작이라 RED 에서도 통과합니다. GREEN(`0fb9b6f`)에서 21/21 통과.
- REFACTOR 커밋은 없습니다.

## 옛 경로 전수 확인 (`grep -rn "/trading/limit-chaser\|/trading/vi" webapp/src`)

리다이렉트 라우트 4개(`webapp/src/app/trading/**`)를 뺀 나머지:

| 위치 | 종류 | 판정 |
|------|------|------|
| `components/layout/app-sidebar.tsx:58` | 주석 | 옛 리다이렉트의 재인코드 규율 설명 |
| `components/trading/vi-settings-card.tsx:14` | 주석 | 옛 화면 전용 파일(18-13 삭제) |
| `components/trading/vi-order-list.tsx:263` | 주석 | `panel` 변형 = 옛 VI 카드 설명 |
| `components/trading/vi-client.tsx:4 · :74` | 주석 | 옛 화면 파일(18-13 삭제) |
| `components/trading/card/strategy-card.tsx:100` | 주석 | 옛 화면 대비 설명 |
| `components/trading/workbench/vi-settings-rows.tsx:628` | 주석 | 옛 카드와 공유 설명 |
| `components/trading/workbench/vi-trigger-strip.tsx:6` | 주석 | 대체 관계 설명 |
| `components/orderbook/account-panel.tsx:142` · `workbench/trading-workbench.tsx:87` · `workbench/vi-trigger-strip.tsx:37` · `workbench/vi-settings-rows.tsx:68` · `vi-client.tsx:59-60` · `card/card-body.tsx:54` · `limit-chaser-client.tsx:72` | **모듈 import 경로** | `@/components/trading/vi-order-list` 같은 파일 경로가 grep 패턴에 걸린 오탐입니다. 라우트 참조가 아닙니다. |

- plan `<verify>` 명령 그대로면 위 import 8줄 때문에 `8` 이 나옵니다. import 경로(`components/trading/(vi-|limit-chaser-)`)를 빼면 **라우트 리터럴 참조는 0건**입니다.
- 테스트 파일의 옛 경로 픽스처(chat-fab Test 5 · vi-client `usePathname` · 전략 현황 카드 ⑧)는 `/trading` 으로 바꿨습니다.
- 사이드바 테스트의 「옛 경로 링크 없음」 단언은 리터럴 대신 정규식으로 적었습니다.

## Verification

- `pnpm --filter @gh-radar/webapp test` — 93 files · **1386 passed** · 1 skipped (기준선 1008 이상)
  - 이번 plan: app-sidebar 25(재작성) · trading-workbench +3
- config `build_command` 전문(shared build · relay typecheck · relay typecheck:tests · webapp typecheck) — exit 0
- grep 게이트
  - `redirect(`: 4파일 각 1
  - `[key]` 의 `focus=`: 2
  - `next.config.ts` 의 `redirects`: 없음
  - `limitChaserHref`: 사이드바·전략 현황 카드 모두 존재
  - 사이드바 `/trading?focus=`: 존재
  - 사이드바 `@container`: 0
- **실브라우저 실측.** 로컬 relay 픽스처와 임시 Playwright 스펙(커밋하지 않고 삭제), dev :3100 에서 확인했습니다.
  - 리다이렉트: 옛 경로 3개 → `/trading`. `[key]` → `/trading?focus=…` 로 가고 그 카드만 `data-open="true"` 입니다.
  - 사이드바 1440: 「트레이딩」 `aria-current=page`. KRX VI 에만 「가동」 배지가 붙습니다(KRX run=true 시드). 「상따」 링크 0개.
  - 링크 박스 밖으로 나간 자식 0, 가로 스크롤 없음. LED 점 9개 모두 7×7. 긴 이름(「한국제7호기업인수목적우선주식회사」)은 143px 에서 ellipsis 되고 `title` 이 있습니다.
  - 이미 `/trading` 위에서 전략 클릭 → 카드 펼침. 접고 같은 항목 재클릭(URL 불변) → 다시 펼침. 제목 클릭 → `/trading`.
  - 라이트/다크 스크린샷을 눈으로 확인했습니다. 여기서 VI 항목만 muted 색이라 전략 항목과 색이 갈린 것을 보고 `--fg` 로 맞췄습니다(`c9665e5`).
  - 실측 뒤 dev 서버(:3100)와 relay(:8090/8091)를 모두 내렸습니다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] 이미 `/trading` 위에서 사이드바 전략 링크가 카드를 펼치지 않음 (18-11 알려진 문제)**
- **발견:** Task 2 (오케스트레이터 지시)
- **문제:** 작업대는 `?focus=` 를 마운트 1회만 소비합니다. 그래서 같은 페이지에서는 URL 만 바뀌었습니다.
- **조치:** URL 변화에 반응시키지 않고 클릭 이벤트 채널(`lib/trading-focus.ts`)을 더했습니다.
  - 오케스트레이터는 「search param 변화에 반응」을 예로 들었습니다. 그러나 그렇게 하면 18-11 테스트가 잠근 「뒤로가기·다른 focus 로 URL 이 바뀌어도 다시 펼치지 않는다」가 깨지고, 같은 항목 재클릭(URL 불변)은 여전히 동작하지 않습니다.
- **파일:** `lib/trading-focus.ts`(신설) · `app-sidebar.tsx` · `trading-workbench.tsx`(plan `files_modified` 밖)
- **커밋:** `0b4492e` · `8a8e9dd` · `0fb9b6f`

**2. [Rule 3 - 차단] 전략 현황 카드 테스트의 기대 href**
- 헬퍼 본문이 바뀌었으므로 `strategy-status-card.test.tsx` ② 의 기대값을 `/trading?focus=` 로 맞췄습니다. 호출부 코드는 무수정입니다.
- **커밋:** `0b4492e`

**3. [Rule 1 - 주석 정확성] `globals.css` §2.2b 의 「컨테이너 쿼리는 상따 본문 하나뿐」**
- RESEARCH 「함께 바뀌는 링크 지점」 표에 있던 항목입니다. 이제 사실이 아니어서 한 줄로 고치고, 같은 절 끝의 lc/wb 문단을 가리키게 했습니다.
- 밴드 수치는 옮겨 적지 않았습니다.
- **커밋:** `ad45f33`

**4. [시각 결함] VI 항목 글자색**
- 목업 `.s3` 는 3단을 한 색으로 씁니다. VI 항목만 `LINK_IDLE` 의 muted 색이어서 전략 항목과 갈렸고, `--fg` 로 맞췄습니다.
- **커밋:** `c9665e5`

### 계획 문면과 다르게 한 것

- **VI 두 항목의 링크 대상은 `/trading` 이고 활성 표시가 없습니다.** VI 설정 줄에 앵커 id 가 없고, 활성은 제목 하나가 받는 편이 「지금 어디」를 흐리지 않습니다.
- **「가동」 배지 라벨은 기존 `viBadgeOf` 의 「가동」입니다**(UI-SPEC 문구 「가동중」 아님). 배지 정의를 새로 만들지 않았습니다.
- **`viAnyRunning` 은 사이드바에서 import 를 뺐습니다.** 합집합이 필요한 자리가 없습니다. 함수와 My page 사용처는 그대로입니다.
- **`strategyIoLabel`(원 아이콘 2개 라벨)을 `strategyLedLabel` 로 대체했습니다.** 사이드바 밖 사용처는 0건이었습니다.
- **`requirements-completed: []`** — TRADE-09 는 18-13 이 남아 있어 완료 표시를 보류합니다(오케스트레이터 지시).

**Total deviations:** 자동 수정 4건(Rule 1 ×2 · Rule 3 ×1 · 시각 ×1) + 문면 차이 5건. **Impact:** 모두 plan 범위(사이드바·작업대 진입로) 안의 정확성 보정이고, 새 네트워크 경로는 없습니다.

## 18-13 이 알아야 할 것

- **e2e `sidebar-tree.spec.ts` 는 지금 깨져 있습니다.** 옛 `TREE_LABELS`(상따·VI), 원 아이콘 라벨, `/trading/limit-chaser/…` 이동, `/trading/vi` 진입을 기대하기 때문입니다. 새 셀렉터:
  - 3단 항목 `[data-sidebar-item="vi-KRX"|"vi-NXT"|"strategy"]` · 기존 `[data-strategy-key]`
  - LED `[data-led][data-tone]`
  - 제목 `getByRole('link', { name: '트레이딩' })`
- 같은 이유로 `trading-limit-chaser.spec.ts` · `trading-vi.spec.ts` 도 옛 경로로 진입합니다. 이제 리다이렉트되어 옛 화면을 볼 수 없습니다.
- 이제 렌더하는 라우트가 없는 파일: `limit-chaser-client.tsx` · `vi-client.tsx` · `vi-settings-card.tsx` 와 그 테스트. 삭제 대상입니다.
- 실측 스펙 패턴: `withLocalRelay()` + `seedLimitChasers` + `seedViTrigger({ exchange: 'KRX', run: true, … })` 로 사이드바 3단 전부와 `?focus=` 왕복을 볼 수 있습니다.

## 사용자 결정 필요

없습니다. 18-08(돌파 순서)과 18-11(등록 전략 카드 ✕) 쟁점은 오케스트레이터가 올렸고, 이 plan 은 그 동작을 바꾸지 않았습니다.

## Known Stubs

없습니다.

## Threat Flags

없습니다. 새 네트워크 경로·권한 경로는 없습니다.
- T-18-58: `[key]` 는 서버에서 디코드 → 재인코드합니다. 작업대는 `parseStrategyKey` 로만 해석하고, 포커스 요청 이벤트도 같은 해석을 거칩니다. 어긋나거나 미등록인 키는 무시하고 송신 0 입니다(테스트).
- T-18-59: 제목 활성 판정은 기존 `samePath` 입니다.
- T-18-60: `useTradingVisible` 단일 정의를 그대로 씁니다(③ 테스트 유지).
- T-18-61: 줄마다 `viTriggers.{거래소}` 를 봅니다(⑤ 테스트).
- 포커스 요청 이벤트는 같은 탭 안에서 카드를 **펼치기만** 합니다. 등록·송신은 하지 않으므로 다른 스크립트가 쏴도 영향은 UI 펼침뿐입니다.

## Self-Check: PASSED

- `webapp/src/lib/trading-focus.ts` 가 존재합니다. 리다이렉트 4파일은 `redirect(` 를 호출하고 `'use client'` 가 없습니다.
- 커밋 7건(fb45604 · 2118b44 · 0b4492e · 8a8e9dd · 0fb9b6f · ad45f33 · c9665e5)이 git log 에 있고, `git rev-list --count ff2eceb..HEAD` = 7 입니다.
