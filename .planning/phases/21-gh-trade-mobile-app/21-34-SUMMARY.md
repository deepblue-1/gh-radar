---
phase: 21-gh-trade-mobile-app
plan: 34
subsystem: ui
tags: [stock-detail, trading, workbench, next-link, next-app-router, playwright, gap-closure, cleanup]

requires:
  - phase: 21-25
    provides: "스케치 008 채택안 ② A(넓은 폭 「트레이딩」 = 히어로 첫 줄 끝 32 알약) · D-30 · D-31"
  - phase: 21-30
    provides: "종목상세 뉴스토론 탭 안 전체목록(T9) — 3탭 셸이 그대로 물려받는다"
  - phase: 21-33
    provides: "/trading?code= 착지(카드 보장·펼침·포커스) · 카드 수동주문 주문유형(시간외종가)"
provides:
  - "종목상세 「트레이딩」 링크 — 폰 하단 바(detail-order-cta · 수치 불변) + 넓은 폭 히어로 알약(detail-trading-button) · isPickable 게이트"
  - "종목상세 3탭(차트 · 종목정보 · 뉴스토론) · 옛 ?tab=orderbook → /trading?code=(매매 불가 = ?tab=chart)"
  - "호가 탭 전용 코드 6파일 삭제 · KRX_ONLY_TITLE 제거 · ManualOrderForm/CardBody variant·호가 각주 제거"
  - "orderbook.spec 고유 검증 5묶음을 trading-workbench.spec 「G-21-R3-10 이전 — …」로 이관 후 삭제"
  - "카드 시간외종가 참고 종가 = 카드 시세 quote.kc(옛 호가 탭과 같은 원천)"
affects: [21-35, 21-36]

actuals:
  tokens: 68000
  tasks: 3
  commits: 4
plan_head_before: 6ee964a29e0b87366ffc4b49741ca445035a96e0

tech-stack:
  added: []
  patterns:
    - "페이지 밖 옛 딥링크 = 탭 셸 effect 한 번(ref 가드) · 라우터는 그 이동에만 — 탭 전환은 pushState 그대로(단위 테스트가 탭 클릭 시 router push/replace 0 을 잠근다)"
    - "매매 가능 판정은 stock-add-bar isPickable 한 곳 — 종목상세 버튼 게이트와 작업대 착지가 같은 함수"
    - "게이트웨이를 내리는 e2e 는 파일 맨 끝 자기 relay describe(앞 describe afterAll 이 8090 을 비운 뒤)"

key-files:
  created: []
  modified:
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/stock/stock-detail-client.tsx
    - webapp/src/components/stock/stock-hero.tsx
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/lib/exchange-choices.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/stock-detail-tabs.spec.ts
    - webapp/e2e/specs/native-shell.spec.ts
  deleted:
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx
    - webapp/src/components/stock/__tests__/orderbook.test.tsx
    - webapp/src/components/orderbook/relay-status-bar.tsx
    - webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx
    - webapp/src/components/orderbook/orderbook-skeleton.tsx
    - webapp/e2e/specs/orderbook.spec.ts

key-decisions:
  - "넓은 폭 「트레이딩」 알약은 stock-hero 첫 줄 끝 — 브라우저는 ml-auto, 앱(iPad)은 「AI 분석」이 ml-auto 를 가지므로 native:ml-0 으로 그 옆에 붙인다(두 ml-auto 가 빈 공간을 반씩 나눠 떨어지는 것 방지)"
  - "옛 ?tab=orderbook 매매 가능 = router.replace(/trading?code=) — replace 라 뒤로가기가 사라진 탭 URL 로 돌아오지 않는다 · 매매 불가 = replaceState(?tab=chart)"
  - "탭 셸 단위 테스트의 「라우터 훅 없음」 잠금을 「탭 클릭 시 router push/replace 0」 잠금으로 바꿨다 — 옛 딥링크가 페이지 밖으로 나가야 해서 라우터가 필요해졌다. 서버 왕복 탭 전환 회귀는 여전히 막힌다"
  - "호가 탭 제거로 참고 종가를 넘기던 유일한 표면이 사라져 CardBody 가 quote.kc > 0 을 스스로 읽는다(Rule 1)"
  - "GC6 의 「호가 탭에서도 잠긴 채」 구간은 종목상세 → 「트레이딩」 착지 카드로 바꿨다 — 같은 키를 보는 다른 진입로이고 client-side 이동이라 앱 수명 잠금 검증이 그대로다"

patterns-established:
  - "표면 삭제 전 사용처 표(grep) → 코드 import 0 확인 → git rm → 공유 모듈 존재 검사"
  - "e2e 이관 대조 표: 옛 테스트마다 이미 있음 / 이전 / 버림 판정, 이관 케이스 제목 접두 「G-21-R3-10 이전 — 」"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "종목상세 「트레이딩」 — 390 폰 하단 바 · 1280 히어로 알약 각각 누르면 /trading 에 그 종목 카드가 펼쳐져 있고, 매매 불가(isin 없음) 종목엔 두 버튼·예약 여백 0 (G-21-R3-9 · D-30 · T-21-93)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx#폰 「트레이딩」 CTA (Test 7 · 7b · 8)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-hero.test.tsx#Test 4 · Test 5"
        status: pass
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-detail-client.test.tsx#Test 2f"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/stock-detail-tabs.spec.ts -g \"G-21-R3-9 트레이딩 버튼\""
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/native-shell.spec.ts -g CTA"
        status: pass
    human_judgment: true
    rationale: "넓은 폭 알약 밀도(앱판 「AI 분석」과 나란히 · 긴 종목명 줄바꿈)는 스케치 008 ② 시각 판단 — 21-36 UAT"
  - id: D2
    description: "종목상세 3탭 · 옛 ?tab=orderbook → 매매 가능 /trading?code= 카드 착지(뒤로가기가 호가 탭 URL 로 돌아오지 않음) · 매매 불가 ?tab=chart (G-21-R3-10 · D-31)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx#Test 1 · 1b · 6 · 6b"
        status: pass
      - kind: unit
        ref: "webapp/src/components/stock/__tests__/stock-detail-client.test.tsx#Test 2b · 2d · 2e"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/stock-detail-tabs.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "호가 탭 전용 코드 삭제(6파일 · KRX_ONLY_TITLE · variant · 호가 각주) — 공유 모듈 유지 · 코드 import 0 · 전체 단위 테스트/타입체크 통과"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test (122 files · 2402 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "orderbook.spec 고유 검증 5묶음을 작업대 카드 기준으로 이관(인증→구독→10단·테이프·토큰 URL / 390 카드 미체결 / G2 배지 폭별·카드 시간외종가 order.new G2·접수·REST 0 / 비로그인 wss 0 / 회선 단절 재접속 배지+사다리 유지) · GC6 재작성"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts --grep-invert \"격자 1/2/3단|P20-3 최악값|종목 추가 입력이 16px\" (48 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "카드 시간외종가 「참고 종가」 = 카드 시세 quote.kc(kc 0 이면 「—」)"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#⑤ 시간외종가 참고 종가 (2 cases)"
        status: pass
    human_judgment: true
    rationale: "실시세 kc 가 장 마감 뒤 실제로 채워져 보이는지는 실 relay 시세로만 확인된다 — 21-36 UAT"

duration: 23min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 34: 종목상세 「트레이딩」 링크 · 호가주문 탭 제거 Summary

**종목상세 「주문하기」를 `isPickable` 게이트의 `/trading?code=` 링크 「트레이딩」(폰 하단 바 + 넓은 폭 히어로 32 알약 · 스케치 008 ② A)으로 바꾸고, 호가주문 탭을 지워 3탭으로 만들며 옛 `?tab=orderbook` 을 트레이딩 착지(매매 불가 = 차트)로 돌렸다. 탭 전용 6파일 · `variant` · 호가 각주를 지우고, `orderbook.spec` 의 고유 검증 5묶음을 작업대 카드 e2e 로 옮긴 뒤 삭제했다.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-26T12:01:34Z
- **Completed:** 2026-09-26T12:24:43Z
- **Tasks:** 3 (Task 1 tracer · Task 2 · Task 3) + Rule 1 수정 1
- **Files modified:** 25 (삭제 7 포함 · +796 / −3608)

## Accomplishments

### ① CTA 채택안 대조 (스케치 008 ② **A** · D-30)

| 항목 | README Winner / index.html ② A | 구현 |
|---|---|---|
| 자리 | 히어로 첫 줄 끝(`ml-auto` 액션 자리) | `stock-hero.tsx` 첫 줄 flex-wrap 끝 · 브라우저 `ml-auto` · 앱 `native:ml-0`(「AI 분석」 옆) |
| 크기·모양 | `.trade.sz-a` 32 높이 · padding 0 14 · radius 999 · 13px · 600 | `h-8 px-3.5 rounded-full text-[13px] font-semibold` |
| 색 | 채움 `--up` · 흰 글자(폰 CTA 와 같은 색) | `bg-[var(--up)] text-white` |
| 폭 | 넓은 폭(≥768)만 | `hidden md:inline-flex` |
| 동작 | `/trading?code={code}` | `next/link` `href=/trading?code={encodeURIComponent(code)}` · `data-slot="detail-trading-button"` |
| 폰(<768) | 하단 바 56 · r16 · 17/600 · `--up` 그대로, 라벨만 「트레이딩」 | `data-slot="detail-order-cta-bar"`/`detail-order-cta` 유지 · 버튼 → Link · 수치 불변(native-shell 82 · 10 · 76 · 96 통과) |
| 매매 불가 | 버튼 없음 | `isPickable(stock)` false → 알약 · 바 · `data-order-cta` 예약 여백 0 |
| 긴 종목명 | 줄바꿈 허용 | 첫 줄 `flex-wrap` 그대로 |

IN-04: CTA 주석 「탭바 몫은 본문 98(`--native-body-reserve` · IN-04)」 — 옛 108 표기 0.

### ② 삭제 전 사용처 표 (Task 2 ① · T-21-94)

| 삭제 대상 | 코드 사용처(삭제 전 `grep -rn src e2e`) | 주석·테스트만 |
|---|---|---|
| `stock/stock-orderbook-section.tsx` | `stock-detail-client.tsx:29` import · `:219` 렌더 | 자기 테스트 2개(`stock-orderbook-section.test` · `orderbook.test`) · `stock-native-refresh.test` 목 · `stock-detail-client.test` · e2e `stock-detail-tabs.spec` 5 · `orderbook.spec` · 주석(card-body · strategy-card · quote-grid-10 · relay-provider · use-relay-socket · relay-status-bar.test) |
| `orderbook/relay-status-bar.tsx` | 없음 | 자기 테스트 · `me-client.tsx:70` 주석 · `orderbook.test` 주석 |
| `orderbook/orderbook-skeleton.tsx` | 없음 | `relay-status-bar.test` 만 |
| `lib/exchange-choices.ts` `KRX_ONLY_TITLE` | `stock-orderbook-section.tsx:62/480` 만 | 없음(상수 주석의 「테스트가 같은 상수를 읽는다」도 실제 사용처 0) |

예상 밖 코드 사용처 0 → 6파일 `git rm` · 상수 제거. 공유 모듈 유지 확인: `account-panel` · `order-panel` · `orderbook-ladder` · `trade-tape` · `order-confirm-dialog` · `quote-grid-10` · `useStrategyCardState`(card-body · strategy-card). 삭제 뒤 코드 import 0 · typecheck 통과.

### ③ `orderbook.spec` 대조 표 (Task 3 ① · T-21-95)

고유 검증 다섯 가지(**굵게**)는 전부 판정했다. 「이전」 케이스 제목 접두는 `G-21-R3-10 이전 — `.

| 옛 테스트 | 판정 | 작업대 쪽 |
|---|---|---|
| **1. 인증 → 구독 → 호가 10단 · 토큰은 URL 에 없다** | 이전 | 「G-21-R3-10 이전 — 인증 → 구독 → 카드 호가 10단 · 체결 테이프 최신순, 토큰은 relay URL 에 없다」(390 · 모바일 사다리 20행 99,000/97,000 · `RELAY_WS_URL` · `?` 0). 10단 자체는 기존 9 도 본다 |
| 2. 체결 테이프 3건 최신순 | 이전 | 위 케이스에 합침(30:17 → 30:15) |
| 3. KRX→NXT 전환 → unsub/sub 왕복 | 버림 | 호가 탭 상태줄 거래소 세그먼트 전용 UI. 카드 거래소 토글은 키 전환(GC3 KRX·NXT 두 카드) · 구독 왕복은 relay `hub.test` · `fanout.test` 소관 |
| 4. NXT 호가 없음 → 전용 빈 상태(D3) | 버림 | 문구 「이 종목은 NXT 호가가 없어요」가 삭제된 섹션 전용이었다(src grep 0). 카드는 `exchangeChoicesOf` 로 NXT 를 숨긴다 |
| 5. `dma_credentials` 없음 → 게이트 | 이미 있음 | 19. 게이트가 작업대 본문 전체를 대체 |
| 6. 주문 → wss → 통보 → 접수 배너 · REST 0 · DB 0 | 이전 | 시간외종가 케이스에 합침 — 같은 wss 단일 경로 · 「주문이 접수됐어요 · 주문번호 …」 · `/api/orders` 0 · `orderInserts` 0 |
| 7. 통보 없음 → 결과 모름 · 잠김 | 이미 있음 | GC5 · GC6 |
| **8. 390 미체결·잔고 리플로우 잘림 0** | 이전 | 「G-21-R3-10 이전 — 390 카드 「미체결」 탭은 이 종목 · 이 거래소만 · 7자리 가격/6자리 수량 행도 조용한 잘림 0 · 취소 버튼 그대로」. 옛 `.rlist` 카드행 대신 카드 탭은 가로 스크롤 임베드 표라 계약은 `scrollOverflowing` 0(표는 스크롤 영역 안). 다른 종목 · 같은 종목 NXT 행 0 · 잔고 1행 |
| **9. 회선 단절 → 재접속 배지 + 사다리 유지** | 이전 | 파일 맨 끝 자기 relay describe 「G-21-R3-10 이전 — 회선 단절 → 상태줄 「재접속 중」 · 「다시 연결」 없음 · 카드 사다리는 비워지지 않는다」(게이트웨이 close) |
| **10. 비로그인 → 로그인 · relay wss 0** | 이전 | 「G-21-R3-10 이전 — 비로그인 /trading?code= 는 로그인 화면으로 …」(storageState 비움 · 소켓 0) |
| 11. 호가 탭 키패드 시트가 AI FAB 위 | 버림 | FAB 은 `/stocks/{code}` 전용(`chat-fab.tsx`) — /trading 에 FAB 이 없어 겹칠 조합이 사라졌다. 시트 기하(폭 · 가운데)는 「Phase 20 — 터치 기기 시트」가 잠근다 |
| P20-6 ① 거부 · 예약구간 — 호가 상태줄 1줄 · 고지 줄 | 버림 | 호가 탭 상태줄·고지 줄 전용 UI. 작업대 상태줄 잘림 0 은 8(E1) · 28b · 거부 표시는 15 |
| P20-6 ② 미반영 · 장전 — 고지 줄 | 버림 | 호가 탭 고지 줄 전용. 카드 미반영은 card-body · strategy-card(-flow) 단위 테스트 |
| **P20-6 ③ 끊김 · 시간외종가 — 폭별 배치** | 이전(부분) | 「G-21-R3-10 이전 — 시간외종가 G2 창: 상태줄 배지가 390 · 1440 에서 잘림 없이 서고, 카드 주문유형 시간외종가 → 확인 「시간외종가」 → order.new krxSession G2 · 가격 0 → 접수 배너 · REST 0」. 옛 폭별 「다시 연결」 자리(폰 고지 줄 vs 상태줄)는 호가 탭 2자리 UI 라 버림 — 작업대는 상태줄 한 자리(`workbench-status-bar.test`) |
| GC6(작업대) 「호가 탭에서도 잠긴 채」 | 재작성 | 종목상세 → 히어로 「트레이딩」 → 착지 카드에서도 잠김 · 소켓 1 · 주문 1 · 새로고침에만 해제(소켓 2) |

### 테스트 결과

| 명령 | 결과 |
|---|---|
| vitest stock-detail-tabs · stock-detail-client · stock-native-refresh · stock-hero | 4 files · **38 passed** |
| vitest manual-order-form · card-body · strategy-card-flow (+ lc-tracer) | **157 passed** (참고 종가 2건 포함) |
| `pnpm --filter @gh-radar/webapp run test` (전체) | 122 files · **2402 passed** · 1 skipped |
| `pnpm --filter @gh-radar/webapp run typecheck` | 통과(error TS 0) |
| `playwright test stock-detail-tabs · stock-detail · native-shell` | **27 passed** |
| `playwright test trading-workbench.spec --grep-invert "격자 1/2/3단\|P20-3 최악값\|종목 추가 입력이 16px"` | **48 passed**(21-33 의 43 + 이관 5) |
| `test ! -e webapp/e2e/specs/orderbook.spec.ts` · `grep -rl orderbook.spec webapp/e2e` | 없음 · 0 |

## Task Commits

1. **Task 1: 「트레이딩」 링크 (트레이서)** — `86563a6b` (feat)
2. **Task 2: 호가주문 탭 제거 · 딥링크 · 탭 전용 파일 삭제** — `bc36464c` (feat)
3. **Task 3: orderbook.spec 이관·삭제 · GC6 · variant 제거** — `d33572c1` (refactor)
4. **Rule 1: 카드 시간외종가 참고 종가 = quote.kc** — `7f0cf8ea` (fix)

트레이서 게이트(interactive · end-of-phase · automated-only verify): Task 1 verify 두 명령 재실행 통과 → 확장 진행.

## Files Created/Modified

- `webapp/src/components/stock/stock-detail-tabs.tsx` — 3탭 · `tradable` 프롭 · CTA `next/link` 「트레이딩」 · 옛 `?tab=orderbook` 1회 처리 · 머리 주석 T3/T6/T8 · IN-04
- `webapp/src/components/stock/stock-detail-client.tsx` — `isPickable` → `tradable` 전달 · 호가 섹션 제거 · 3탭(D-31) 주석
- `webapp/src/components/stock/stock-hero.tsx` — `tradable` · `detail-trading-button` 알약
- `webapp/src/components/trading/card/manual-order-form.tsx` · `card-body.tsx` — `variant` · `data-variant` · `ORDERBOOK_FOOTNOTE` 제거 · 카드 테두리 고정 · 머리 주석 카드 한 표면 · CardBody 참고 종가 `quote.kc`
- `webapp/src/components/trading/workbench/trading-workbench.tsx` — CardBody 호출 `variant` 제거
- `webapp/src/lib/exchange-choices.ts` — `KRX_ONLY_TITLE` 제거 · 머리 주석
- 테스트: `stock-detail-tabs.test` · `stock-detail-client.test` · `stock-native-refresh.test` · `stock-hero.test` · `manual-order-form.test` · `card-body.test` · `strategy-card-flow.test` · `lc/__tests__/lc-tracer.test`
- e2e: `stock-detail-tabs.spec`(3탭 · 딥링크 두 경우 · G-21-R3-9 로컬 relay describe) · `native-shell.spec`(라벨) · `trading-workbench.spec`(이관 5 · GC6)
- 삭제 7: 위 frontmatter `deleted`
- `.planning/phases/21-gh-trade-mobile-app/deferred-items.md` — 21-34 항목 3

## Decisions Made

- 넓은 폭 알약은 앱에서 `native:ml-0` — 「AI 분석」(`ml-auto`)과 두 `ml-auto` 가 빈 공간을 나눠 떨어지지 않게.
- 옛 딥링크: 매매 가능 `router.replace`(기록에 탭 URL 을 남기지 않음 — e2e 가 goBack 으로 확인) · 매매 불가 `replaceState('?tab=chart')`.
- 탭 셸 단위 테스트 잠금을 「라우터 훅 export 없음」 → 「탭 클릭 시 router push/replace 0」 으로 바꿨다(목에 라우터 스파이 추가, 주석에 이유).
- 카드 시간외종가 참고 종가는 CardBody 가 `quote.kc > 0` 에서 읽는다(프롭 덮어쓰기는 유지).
- 「카드는 ISIN ∧ 거래소로 자른다」(`cardAccountSliceOf`) — 390 미체결 이관 케이스에 같은 종목 NXT 행을 넣어 KRX 카드에 서지 않음을 함께 잠갔다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 카드 시간외종가 「참고 종가」가 항상 「—」**
- **Found during:** Task 3 (variant 제거 중 CardBody 프롭 점검)
- **Issue:** 참고 종가(`quote.kc`)를 폼에 넘기던 곳은 삭제된 `stock-orderbook-section` 뿐이었다. 카드는 한 번도 넘기지 않아, 호가 탭이 사라지면 유일한 시간외종가 표면(카드)의 잠긴 가격 상자가 늘 「참고 종가 —」 · 확인 다이얼로그 참고가 null 이 된다(스케치 008 ③ 「가격 잠김(참고 종가)」 계약 위반).
- **Fix:** CardBody 가 `referenceClose ?? (quote.kc > 0 ? quote.kc : null)` 을 폼에 넘긴다 — 같은 원천 · 벽시계 없음.
- **Files modified:** webapp/src/components/trading/card/card-body.tsx, webapp/src/components/trading/__tests__/card-body.test.tsx
- **Verification:** card-body.test 2건(kc 128,700 → 「참고 종가 128,700원」 · kc 0 → 「—」). 수정 전 코드는 undefined 프롭만 넘겨 첫 건이 실패한다.
- **Committed in:** `7f0cf8ea`

**2. [Rule 3 - Blocking] CardBody `variant="card"` 호출부 2곳(플랜 files 밖)**
- **Found during:** Task 3
- **Issue:** `lc/__tests__/lc-tracer.test.tsx` · `__tests__/strategy-card-flow.test.tsx` 가 `variant="card"` 를 넘겨 타입 오류가 난다.
- **Fix:** 프롭과 머리 주석의 `CardBody variant="card"` 표기 제거.
- **Committed in:** `d33572c1`

**3. [Rule 1 - Test data] 390 미체결 이관 케이스의 NXT 스트레스 행**
- **Found during:** Task 3 e2e 첫 실행(1 failed · Received 1)
- **Issue:** 옛 호가 탭은 종목만 잘랐지만 카드는 ISIN ∧ 거래소로 자른다(`cardAccountSliceOf` — 의도된 동작). 옛 데이터의 NXT 스트레스 행이 KRX 카드에 서지 않았다.
- **Fix:** 스트레스 행을 KRX 로 두고, 같은 종목 NXT 행을 따로 넣어 「KRX 카드에 없음」을 단언.
- **Committed in:** `d33572c1`

**4. [수용 기준 문구] card-body.tsx 의 `variant` grep 1건**
- **Issue:** 수용 기준 「주석 제외 `grep -c variant` = 0」에 `<OrderbookLadder variant="chaser">` 가 걸린다. 이것은 공유 모듈 사다리의 다른 프롭(chaser 3트리)이고, 지울 대상인 카드/호가 표면 `variant` 가 아니다.
- **Handling:** 공유 모듈 금지(prohibition)라 손대지 않았다. `variant="chaser"` 를 뺀 검사는 0. 사다리의 `'orderbook'` 분기가 소비처를 잃은 것은 deferred-items 에 적었다.

---

**Total deviations:** 3 auto-fixed (Rule 1 ×2 · Rule 3 ×1) + 수용 기준 문구 1
**Impact on plan:** 참고 종가 수정은 탭 제거가 만든 회귀를 막는 데 필요하다. 나머지는 검증을 통과시키기 위한 최소 조정이고 범위 확장은 없다.

## Issues Encountered

- `trading-workbench.spec` 알려진 범위 밖 3건(격자 1/2/3단 · P20-3 최악값 · 종목 추가 16px)은 플랜 verify 대로 제외했다(deferred-items 1번 · 21-06 이후 동일).
- 동시 세션: 실행 중 master 에 남의 커밋은 들어오지 않았다(기준 `6ee964a2` 에서 내 커밋 4개만 쌓였다). 남의 미커밋 변경(`.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock`)은 스테이징하지 않았다.
- 21-34 files 밖에 옛 이름·옛 동작 주석이 남았다(globals.css §21 「주문하기」 · account-panel.test 의 orderbook.spec 언급 등). 동작과 무관해 고치지 않았고 deferred-items 에 적었다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-35(게이트 기록 · REVIEW-R2) · 21-36(UAT 3차 · push 결정)이 다음이다. push 는 하지 않았다.
- 사람 확인(21-36 UAT): 폰 하단 바 · 넓은 폭 알약(앱판 「AI 분석」과 나란히) · 3탭 · 옛 `?tab=orderbook` 북마크 · 카드 시간외종가(참고 종가 표시 포함).

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- 수정 파일 존재 · 삭제 7파일 부재(`test ! -e`) 확인.
- 커밋 4개(`86563a6b` · `bc36464c` · `d33572c1` · `7f0cf8ea`) git log 에서 확인 · `git rev-list --count 6ee964a2..HEAD` = 4.
- 수용 기준: `/trading?code=` 3 · 「트레이딩」 6 · `handleValueChange('orderbook')` 0 · `detail-trading-button` 1 · `isPickable` 3 · spec `G-21-R3-9` 3 · 「본문 98」 1 · 「본문 108」 0 · `v: 'orderbook'` 0 · `router.replace` 2 · `StockOrderbookSection` 0 · 삭제 import 0 · 공유 모듈 존재 · `orderbook.spec` 참조 0 · `G-21-R3-10` 11 · 「호가 탭에서도」 0 · manual-order-form `variant` 0 · `ORDERBOOK_FOOTNOTE` 0 · 작업대 `variant="card"` 0 · card-body `variant` 0(`variant="chaser"` 사다리 프롭 제외 — 편차 4).
