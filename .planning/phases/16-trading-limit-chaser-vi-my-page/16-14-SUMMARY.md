---
phase: 16-trading-limit-chaser-vi-my-page
plan: 14
subsystem: ui
tags: [react, nextjs, tailwind, vitest, rtl, playwright, a11y, relay-wss, notifications, pure-functions]

# Dependency graph
requires:
  - phase: 16-13
    provides: "`isLimitChaserServerMessage` 통지 몫 판정 · `dirty-action-bar` FAB 회피 배치 · 상따 조립 규율(에코 상관·이탈 경고)"
  - phase: 16-12
    provides: "`dirty-action-bar.tsx` · 「값은 「수정」 버튼」 폼 규율"
  - phase: 16-11
    provides: "`/trading/vi` 라우트 셸 · `dma-gate.tsx` · `strategy-badge.tsx`(사이드바 VI 배지)"
  - phase: 16-10
    provides: "`account-panel.tsx` 계좌 전용 모드 · `originTag` · `.rlist` 모바일 리플로우 · 확인 다이얼로그 규율"
  - phase: 16-09
    provides: "전역 relay 컨텍스트 — `viTrigger`/`viOrders` 스냅샷 · `send`/`sendOrder`"
  - phase: 16-03
    provides: "`RelayViTrigger`·`RelayViOrderItem`·`RelayViSetMsg`·`RelayViConfirmMsg` 와이어 계약"
provides:
  - "`lib/vi-alert.ts` — `parseViEndTime`/`scheduleViAlert` 3분기 · 만원↔원 변환 **유일 지점** · `isViServerMessage`"
  - "`vi-settings-card.tsx` — 설정 4행 + 시작/중지 바 + 확인 다이얼로그 2종(기본 포커스 취소/닫기)"
  - "`vi-order-list.tsx` — 상태 6종 + 부분체결 파생 · 확인 체크(낙관+잠금) · 110초 데드라인 · `isConfirmable`"
  - "`vi-client.tsx` — B1~B9 조립 · 거래소 필터 · 전체 취소 · 마감알림 타이머"
  - "`account-panel.tsx` `stack` · `unfilledHeaderActions` 선택 prop (기본값 무변경)"
  - "`use-relay-socket.ts` `viOrderKey` export — 접수 전 행 키 규칙의 유일 지점"
  - "`fake-gateway.ts` `readViSetRequest`/`readViConfirmRequest` — 전략 요청 페이로드 파서"
  - "`e2e/fixtures/relay.ts` `strategyRequests()` — 「무엇을 보냈는가」의 유일한 주입구"
affects: [16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "두 층(비활성 + 전송 가드)이 같은 잠금을 걸 때는 **판정 함수 하나**로 모은다 — 비활성 요소는 클릭이 발화하지 않아 렌더 테스트가 아래층 변이를 못 잡는다(변이 실측)"
    - "E2E 는 msg_type 이 아니라 **페이로드**를 본다 — 「보냈다」로는 `run` 이 눕혀졌는지 알 수 없다"
    - "로케일 시각 포맷 결손은 브라우저에서만 드러난다(jsdom `00:57:16` / Chromium `0시 57분 16초`) — E2E 가 실측으로 잡았다"
    - "`min-width:0` 은 출처가 여러 곳이라 하나만 지워서는 계산값이 안 바뀐다 — 단언은 「한 출처」가 아니라 **효과**를 재야 한다(16-13 과 같은 결론)"

key-files:
  created:
    - webapp/src/lib/vi-alert.ts
    - webapp/src/lib/__tests__/vi-alert.test.ts
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/components/trading/__tests__/vi-order-list.test.tsx
    - webapp/e2e/specs/trading-vi.spec.ts
  modified:
    - webapp/src/components/trading/vi-client.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/lib/use-relay-socket.ts
    - webapp/e2e/fixtures/relay.ts
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "「수정」과 「시작/중지」를 **같은 전송 함수**(`submit(nextRun)`)로 모으고 `run` 만 인자로 갈랐다. 두 경로를 따로 두면 한쪽이 `run` 을 지어내는 순간 「금액만 고쳤는데 자동매수가 켜진다」가 되는데, 그 결손은 화면 상태로는 보이지 않는다(스텁 게이트웨이도 11 에 응답하지 않는다). 그래서 E2E 가 **페이로드를 열어** `run` 을 대조한다."
  - "확인 체크의 잠금을 `isConfirmable` **한 함수**로 모았다. 처음엔 체크박스 `disabled` 와 전송 가드가 각자 조건을 갖고 있었는데, 변이 주입에서 **전송 가드 쪽 변이가 미검출**로 나왔다 — 비활성 체크박스는 클릭해도 `onCheckedChange` 가 발화하지 않아 렌더 테스트가 아래층에 닿지 않는다. 한 함수로 모으니 위층 테스트가 아래층까지 덮고, 그 함수 자체도 직접 단언했다."
  - "부분체결을 `state === \"Accepted\" && filledQty > 0` 파생으로 판정한다. 와이어 `state` 6종에 `PartiallyFilled` 는 **없다** — 서버 값으로 착각해 그 리터럴과 비교하면 항상 거짓이라 **어떤 행도 부분체결로 보이지 않고**, 그 침묵은 화면 어디에도 흔적을 남기지 않는다."
  - "데드라인 진행바를 **카드 트리에만** 둔다(목업 정본). 데스크톱 9열 표의 `110초` 열은 숫자만이다 — 바 + 「110초 취소까지」 + 「확인됨」을 열에 넣으면 9열 자연 폭 ~840px 이 992px 를 넘겨 표가 잘린다. 색 2단계(`data-hot`)는 **두 트리가 같은 조각**을 쓰므로 갈리지 않고, E2E 가 두 트리에서 동시에 확인한다."
  - "확인 체크에 **타임아웃 UI 를 만들지 않았다**(D-10). 서버는 확인 응답을 따로 주지 않고 73 델타로만 정정하므로 무응답이 정상 경로다. 대신 낙관 반영 + `ReadonlySet` 전송 잠금을 두고, 잠금은 「서버가 원하는 값으로 왔거나 잠겨서 더는 못 바꾼다」에서 풀린다."
  - "`viOrderKey` 를 `use-relay-socket.ts` 에서 **export** 해 화면이 재구현하지 않게 했다. 접수 전 행은 `orderNo` 가 `\"\"` 라 그대로 키로 쓰면 서로 다른 종목이 한 줄로 겹치는데, React 는 키가 겹쳐도 **경고만 남기고 두 행을 다 그린다** — 행 개수만 세는 단언은 이 결손에 대해 공허하다(변이 실측). 그래서 테스트가 키 경고 자체를 잡는다."
  - "VI 몫 통지 판정(`isViServerMessage`)을 **상따 판정 위에 얹었다**. `!isLimitChaserServerMessage(msg)` 만으로는 부족하다 — relay 자신의 요청 거부(`src === \"Relay\"`)까지 VI 통지로 읽히고, 그러면 상따 요청의 형식 오류가 「내 자동매수가 거부됐다」로 그려진다. `Account` 라는 발신 맥락을 함께 본다."
  - "`AccountPanel` 에 `stack`·`unfilledHeaderActions` **선택 prop 2개**를 더했다. 패널의 ≥1280 2열은 뷰포트 기준 미디어쿼리라, 556px 컬럼 안에 놓이면 한 칸이 270px 이 되어 표가 조용히 잘린다 — 컨테이너 폭을 모르는 패널이 스스로 판단할 수 없어 호출부가 알려 준다. 필터·일괄취소는 패널이 **소유하지 않고** 자리만 빌려준다(3표면 공용 규율 유지)."
  - "제출 재진입 가드를 state 가 아니라 **ref** 로 들었다. `submitting` state 는 다음 렌더에서야 보이므로 같은 tick 에 두 번 들어온 확정(다이얼로그 실행 버튼 더블클릭)을 막지 못한다 — 그 두 번째가 곧 두 번째 무인 발주 등록이다."
  - "마감알림 권한 요청은 **스위치를 켤 때만** 하고, 거부되면 스위치를 되돌리고 사유를 카드에 남긴다. 켜진 척 두면 사용자는 마감 10초 전에 아무 일도 일어나지 않는 이유를 영원히 알 수 없다(PC-7)."

patterns-established:
  - "잠금이 두 층이면 **판정 함수 하나**로 모은다 — 비활성 요소는 클릭이 발화하지 않아 위층 테스트가 아래층을 덮지 못한다"
  - "E2E 는 `msg_type` 이 아니라 페이로드를 본다 — 「보냈다」와 「무엇을 보냈는가」는 다른 사실이다"
  - "Radix `asChild` 는 자식의 `data-slot` 으로 덮어쓴다 — `[data-slot=dialog-close]` 조회는 **항상 null** 이라 공허하다. 접근 이름으로 본다"
  - "RTL 에서 `vi.useFakeTimers()` 를 `shouldAdvanceTime` 없이 켜면 `waitFor` 가 멈추고, 그 타임아웃은 `finally` 를 밟지 못해 **다음 테스트까지** 가짜 타이머를 물려준다"

requirements-completed: [TRADE-02]

# Metrics
duration: 100min
completed: 2026-09-09
---

# Phase 16 Plan 14: VI 변동성완화 종합주문 Summary

**사람 확인 없이 주문이 나가기 시작하는 유일한 화면을 조립하고, 「값은 「수정」·시작/중지는 확인·확인 체크는 즉시」 세 조작 규율을 RTL 67 · E2E 11 케이스로 잠갔다 — 그 과정에서 「비활성 요소 뒤의 가드는 테스트가 닿지 않는다」를 변이 실측으로 발견해 잠금 판정을 한 함수로 모았다.**

## Performance

- **Duration:** 약 100분
- **Tasks:** 3
- **Commits:** 3 (+ 이 SUMMARY)

## Task Commits

1. **Task 1: 설정 카드 · 시작/중지 확인 · 마감알림 유틸** — `7296548` (feat)
2. **Task 2: VI 주문내역 — 상태 6종 · 확인 체크 · 데드라인** — `7b067b2` (feat)
3. **Task 3: 화면 조립 + E2E 11케이스** — `7fb687a` (feat)

## What Was Built

### Task 1 — `lib/vi-alert.ts` · `vi-settings-card.tsx`

`vi-alert.ts` 는 VI 표면의 **React 없는 계약**을 모은다. 셋 다 두 곳에 두면 조용히 갈리는 종류다.

| 계약 | 규율 |
|------|------|
| 만원 ↔ 원 | `manwonToKrw`/`krwToManwon` **한 곳**. 한 자리가 어긋나면 1만 배 주문이다 |
| `vi_end_time` | 정상 −10초 / 파싱 실패 · **과거 시각** +110초 (WinForms `ComputeAlertAt` 이식) |
| 마감알림 설정 | `localStorage["gh-radar:vi-alert"]` **이 기기 전용**. 기본 꺼짐, 서버 전송 0 |
| 권한 거부 | 스위치를 되돌리고 **사유를 돌려준다**. 조용히 넘어가지 않는다 |
| 통지 몫 | `isViServerMessage` — 상따 판정(16-13)을 **재사용**하고 `src === "Relay"` 는 먹지 않는다 |

`vi-settings-card.tsx` 는 「라벨 72px \| 입력」 4행 + 고정 캡션 + 시작/중지 바다.

- **값 변경 = 더티 → 「수정」**(`run` 현재값 유지). 디바운스도 지연 전송도 없다(D-07).
- **시작/중지만 확인 다이얼로그.** `showCloseButton={false}` · 기본 포커스 = 취소/닫기 · 시작 요약에 **계좌·금액·상승률·주문가** 전부.
- **빈 61(미등록)은 입력을 지우지 않는다.** `viTrigger` 3상태(`undefined`/`null`/객체)를 뭉개지 않는다.
- 제출 후 에코(또는 3초) 전까지 재활성 금지. **재전송 경로는 파일에 없다.**

### Task 2 — `vi-order-list.tsx`

데스크톱 9열 표 / 모바일 카드. 두 트리가 항상 DOM 에 있고 폭 판정은 전부 CSS 다.

| 요소 | 규율 |
|------|------|
| 상태 배지 | 6종 + **부분체결 파생**(`Accepted ∧ filledQty>0`). 색 · 도트 형태 · 텍스트 3중 |
| `Cancelling` | UI-SPEC 표에 없지만 와이어에는 있다 — 빈 배지 대신 중립 「취소 중」 |
| 확인 체크 | 즉시 `vi.confirm` · 낙관 반영 · 73 이 정정 · **타임아웃 UI 없음** · 연타 1회화 |
| 잠금 | `isConfirmable` **한 곳** — `disabled` + `aria-disabled` + `opacity:.35` |
| 데드라인 | 카드 = 진행바(`role="progressbar"` 1곳) / 표 = 숫자. **≥20 중립 / <20 `--destructive`**, 전이 0 |
| 시각 | `deadline110Ms − 110초` 역산 + 자리수 직접 채움(로케일 포맷터 금지) |
| 키 | `viOrderKey` 재사용 — 접수 전 행이 `""` 로 겹치지 않는다 |

### Task 3 — `vi-client.tsx` + E2E

B1~B9 를 조립한다. 16-11 자리표시는 걷혔고 라우트는 **무변경**으로 소비한다.

- **B1 상태줄** — `DMA {RELAY_STATE_LABELS}`(D-36) · VI 가동/중지 · 오늘 VI 주문 N건 · **장 마감** · 미반영 · 거부(`role="alert"`) · 시각.
- **레이아웃** — ≥1280 `420px | 556px` + 주문내역 전폭 최하단(R3). 모바일 세로 순서는 `order` 로만 만든다(DOM 은 한 벌).
- **B7** — 거래소 필터(전체/KRX/NXT)는 **넘기는 행을 줄이는 것**으로 구현하고, 「전체 취소」는 확인 다이얼로그를 거친다. 패널은 자리만 빌려준다.
- **④ 15:40** — `run=false` Broadcast 를 놓쳐도 「가동 중」으로 오해하지 않게 시각으로도 판정한다(Pitfall 19). 주기 재조회는 만들지 않는다(D-13).
- **마감알림 타이머** — 주문 1건당 하나, 키로 중복 방지(73 은 같은 주문을 여러 번 실어 온다).

E2E 는 **진짜 relay 프로세스 + 스텁 게이트웨이** 왕복 11케이스다. 계획 9케이스를 전부 덮고 **대조군 2건**(통지 몫 · R3 데스크톱 레이아웃)을 더했다.

## Verification

```
pnpm typecheck (전 워크스페이스)               exit 0
pnpm --filter @gh-radar/webapp lint            신규 경고 0건 (기존 2건은 다른 파일)
pnpm --filter @gh-radar/webapp test            57 files · 628 passed · 1 skipped
  vi-alert.test.ts                             23 passed
  vi-settings-card.test.tsx                    18 passed
  vi-order-list.test.tsx                       26 passed
pnpm --filter @gh-radar/relay  test            17 files · 327 passed
pnpm --filter @gh-radar/webapp build           exit 0  (/trading/vi 11.4 kB)
e2e trading-vi.spec.ts                         11 passed
e2e me · trading-limit-chaser · orderbook ·
    sidebar-tree · (인접 spec 포함)             48 passed · 4 skipped
```

### 변이 주입 실측 (blindspot #6 — 첫 실행 green 이면 실효성을 의심한다)

**42종 주입 · 42종 전부 검출.** 처음엔 6종이 미검출이었고 그 여섯이 이 plan 의 수확이다.

| 배터리 | 종수 | 미검출 → 해소 |
|--------|------|---------------|
| Task 1 (설정·다이얼로그) | 12 | ① 「X 닫기 버튼 부활」 — `[data-slot=dialog-close]` 조회가 **항상 null** 이었다(Radix `asChild` 가 자식 `Button` 의 `data-slot` 으로 덮어쓴다). 접근 이름 + 푸터 버튼 목록 단언으로 교체 후 검출. ② 「기본 포커스 가로채기 제거」 — 취소가 DOM 상 먼저라 Radix 기본값도 취소를 잡아 **효과가 같다.** 진짜 계약인 「푸터 순서 + 포커스」를 함께 뒤집으니 5케이스가 깨졌다 — 단언이 옳은 것을 재고 있다는 확인이다. ③ 「재진입 ref 가드 제거」는 **끝까지 미검출** — 아래 참조 |
| Task 2 (주문내역) | 21 | ④ 「전송 가드 제거」 미검출 → 비활성 체크박스는 클릭이 발화하지 않아 렌더 테스트가 아래층에 닿지 않는다. **`isConfirmable` 로 두 층을 합치고** 그 함수를 직접 단언해 검출. ⑤ 「병합 키를 `orderNo` 로 퇴화」 미검출 → React 는 키가 겹쳐도 두 행을 다 그린다. **키 경고 자체**를 잡도록 교체 후 검출. ⑥ 「잔여를 내림으로」·「시각 미상을 0 으로」 미검출 → 픽스처가 전부 정수 초·유효 마감이었다. 소수 초·`deadline110Ms=0` 케이스 추가 후 검출 |
| Task 3 (E2E) | 9 | ⑦ 「그리드 자식 `min-w-0` 제거」 미검출 → **중복 출처가 4곳**(그리드 유틸 + 자식 3개)이라 하나만 지우면 계산값이 안 바뀐다. 넷을 함께 지우니 검출 — 단언이 「한 출처」가 아니라 **효과**를 재고 있다는 확인이다(16-13 과 같은 결론) |

특히 Task 3 변이 2(`clockNow` → `toLocaleTimeString('ko-KR', {hour12:false})`)가 **E2E 에서만** 검출됐다. jsdom 은 `00:57:16` 을 돌려주므로 단위 테스트로는 영원히 통과한다 — blindspot #5 가 예고한 그대로다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 누락된 안전장치] 제출 재진입 가드가 state 라 같은 tick 더블클릭을 못 막았다**
- **Found during:** Task 2 (변이 주입)
- **Issue:** `if (submitting) return` 은 state 를 읽으므로 같은 tick 에 두 번 들어온 확정(다이얼로그 실행 버튼 더블클릭)에 대해 **둘 다 통과**한다. 두 번째는 사용자가 누르지 않은 두 번째 무인 자동매수 등록이다.
- **Fix:** `submittingRef` 로 동기 가드. 해제는 에코·타임아웃 공통 `unlock()` 한 곳.
- **Files modified:** `vi-settings-card.tsx`
- **Commit:** `7b067b2`

**2. [Rule 1 - 공허한 단언] 다이얼로그 X 닫기 버튼 검사가 항상 통과했다**
- **Found during:** Task 1 (변이 주입)
- **Issue:** `dialog.querySelector('[data-slot="dialog-close"]')` 는 **언제나 null** 이다 — `ui/dialog.tsx` 가 `DialogPrimitive.Close asChild` 로 감싸고, Radix Slot 은 자식 `Button` 의 `data-slot="button"` 을 우선한다. `showCloseButton` 을 되살려도 테스트가 통과했다.
- **Fix:** 접근 이름(`/close/i`) + 푸터 버튼 텍스트 목록 단언으로 교체.
- **Files modified:** `__tests__/vi-settings-card.test.tsx`
- **Commit:** `7b067b2`

**3. [Rule 3 - 테스트 인프라] `vi.useFakeTimers()` 가 다음 테스트까지 오염시켰다**
- **Found during:** Task 1
- **Issue:** `shouldAdvanceTime` 없이 켜면 RTL 의 `waitFor`(실시간 폴링)가 멈춰 테스트가 타임아웃되고, **그 타임아웃은 `finally` 를 밟지 못해** 가짜 타이머가 다음 두 테스트까지 살아남았다(3건 동시 실패).
- **Fix:** `vi.useFakeTimers({ shouldAdvanceTime: true })`.
- **Files modified:** `__tests__/vi-settings-card.test.tsx`
- **Commit:** `7296548`

### 계획 대비 조정

**4. `AccountPanel` 에 선택 prop 2개 추가** (`stack`·`unfilledHeaderActions`) — 계획 files_modified 밖이다. 패널의 ≥1280 2열은 **뷰포트 기준** 미디어쿼리라 556px 컬럼 안에서 한 칸이 270px 이 되고(R3 위반), UI-SPEC B7 의 필터·「전체 취소」는 미체결 헤더 자리가 필요하다. 둘 다 기본값이 꺼짐이라 상따·My page·호가주문 탭은 **무변경**으로 통과한다(단위 37 · E2E 48 확인).

**5. 미체결 표를 6열로 줄이지 않았다** — UI-SPEC B7 은 「주문번호를 열이 아니라 종목 아래 보조줄로」라고 적었지만, 그 표는 **3표면이 공유**하고 16-13·16-15 의 E2E 가 현재 7열 구조에 걸려 있다. 한 표면의 폭 문제로 공용 표를 바꾸면 두 plan 의 계약이 함께 흔들린다 — `deferred-items.md` 에 남겼다.

**6. 데드라인 진행바는 카드 트리에만** — 목업 정본이 그렇고(데스크톱 `110초` 열은 숫자만), 바를 열에 넣으면 9열이 992px 를 넘는다. 색 2단계는 두 트리가 같은 조각을 써 갈리지 않고 E2E 가 둘 다 단언한다. `role="progressbar"` 정의는 소스에 **1곳**이다.

**7. `상승률` 을 정수 %로 입력받는다** — 목업은 `22.0` 으로 그렸지만 와이어 계약이 **정수 %** 다(`sweepMinRate` BasisPoints 와 단위가 다르다). 소수 입력을 열면 서버가 잘라 「25.5 로 등록했는데 25 로 도는」 상태가 된다.

**8. 마감알림 스위치를 순수 버튼으로 그렸다** — 공용 `ui/switch.tsx` 는 thumb 기하가 하드코딩(16px·`translate-x-4`)돼 목업의 44×26 을 만들 수 없고 36×20 은 터치 타깃으로 작다. `limit-chaser-form.tsx` ⑧ 과 같은 판단이다.

**9. 전략 로그 카드를 만들지 않았다** — UI-SPEC B 표(B1~B9)에 로그 컴포넌트가 없다. 15:40 자동 비활성화와 서버 거부는 상태줄(`role="alert"`, 지속) + 6초 배너 + **장 마감 칩**(지속)으로 알린다.

**10. 테스트 파일 3개 추가** — `vi-alert.test.ts` · `vi-settings-card.test.tsx` · `trading-vi.spec.ts` 중 앞 둘은 계획 files_modified 밖이지만, Task 1 의 `<verify>` 와 acceptance 가 요구하는 단언(`parseViEndTime` 3케이스 · 다이얼로그 기본 포커스 · 요약의 금액·상승률)을 담을 곳이 없었다.

**11. 전략 요청 파서 + `strategyRequests()` 노출** — `fake-gateway.ts`·`e2e/fixtures/relay.ts` 는 계획 files_modified 밖이다. acceptance 「케이스 2 가 전송 페이로드의 `run` 이 변경 전 값과 같음을 확인한다」는 **페이로드를 열지 않으면 성립하지 않는다**(스텁 게이트웨이는 11 에 자동 응답하지 않아 화면 상태로 구분되지 않는다). 파싱을 `fake-gateway.ts` 에 둔 이유는 `readQuoteRequestKey`(15-14)와 같다 — `flatbuffers` 는 relay 패키지 의존성이라 webapp 쪽에서 직접 열 수 없다. 순수 추가라 기존 소비자는 무변경이다.

**12. `viOrderKey` export** — 계획 files_modified 밖(`use-relay-socket.ts`)이지만 `export` 한 단어 추가다. 화면이 키 규칙을 재구현하면 병합기와 갈리는 순간 같은 목록이 두 모양이 된다(계획 blindspot 이 지목한 결손).

**13. E2E 9 → 11케이스** — 계획 9케이스를 전부 덮고 대조군 2건을 더했다. 케이스 10(통지 몫)이 없으면 「남의 거부를 먹는 화면」과 구분되지 않고, 케이스 11(R3)이 없으면 데스크톱 레이아웃이 통째로 미검증이다(케이스 9 는 390px 이다).

### 인증 게이트

없음.

## Known Stubs

없음. 이 plan 이 만든 표면은 전부 실제 데이터(전역 relay 스냅샷 `viTrigger`/`viOrders`/`accountStates`)에 연결돼 있고, 하드코딩된 빈 배열·플레이스홀더 문구가 UI 로 흐르는 자리가 없다. **16-11 자리표시(`SurfacePlaceholder`) 사용처는 이제 0건**이다(그 컴포넌트 파일 자체는 남아 있다 — `deferred-items.md` 참조).

남기는 사실 1건:

| 항목 | 내용 |
|------|------|
| `submittingRef` 재진입 가드 | 42종 변이 중 **유일하게 끝까지 미검출**이다. 시작/중지 버튼도 액션 바 버튼도 `submitting` 으로 이미 `disabled` 라, 이 가드에 닿는 경로가 테스트에서 만들어지지 않는다. 제거해도 아무 테스트가 깨지지 않지만 **같은 tick 더블클릭**(위 Deviation 1)의 유일한 방어선이므로 의도적으로 남긴다. |

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다. 전송은 전부 기존 `vi.set`/`vi.confirm`/`order.cancel` wss 경로 안쪽이고, 마감알림은 브라우저 로컬(`localStorage` + `Notification`)로 **서버 왕복이 0** 이다.

계획 `<threat_model>` 대응 상태:

| Threat ID | Disposition | 결과 |
|-----------|-------------|------|
| T-16-10 (VI 시작) | mitigate | 확인 다이얼로그 필수 + 요약에 **금액·상승률**(RTL·E2E 양쪽 단언) + 기본 포커스 취소(푸터 순서 변이로 실효성 확인) + 제출 후 재활성 금지 + **ref 재진입 가드**. 자동 재전송 경로는 코드에 없다 |
| T-16-10 (확인 체크) | mitigate | `confirmLocked`·접수 전 행은 `disabled` + `aria-disabled` + tab 제외. 잠금 판정은 `isConfirmable` 한 곳이고 그 함수를 직접 단언한다. **타임아웃 UI 없음** — 서버 무응답이 정상 경로다 |
| T-16-01 (`accountNo`) | transfer | 화면은 계좌를 고르기만 한다. 대조는 relay `session.allowedAccounts`(16-07) |
| T-16-09 (마감알림) | mitigate | `localStorage` 로컬 전용. 서버 전송 0(RTL 이 `send` 미호출을 단언). 권한 거부 시 스위치를 되돌리고 사유를 표시. 알림 본문에 계좌·금액을 싣지 않는다(단위 테스트가 긴 숫자 부재를 단언) |
| T-16-07 (15:40) | mitigate | `strategiesDisabled`/`run=false` 에코 반영 + **시각 판정 「장 마감」 칩**을 병행. 주기 재조회 없음(D-13) |

추가로 잡은 것: **Pitfall 9 의 반대 방향**을 E2E 케이스 10 이 대조군 3종(상따 몫 · relay 자기 거부 · VI 몫)으로 잠갔다. 16-13 이 「상따가 VI 것을 먹지 않는다」를 잠갔고 여기서 「VI 가 남의 것을 먹지 않는다」를 잠갔으므로 양방향이 닫혔다.

## Self-Check: PASSED

- `webapp/src/lib/vi-alert.ts` — FOUND (`gh-radar:vi-alert` 1건 · `isViServerMessage`)
- `webapp/src/lib/__tests__/vi-alert.test.ts` — FOUND (23 passed)
- `webapp/src/components/trading/vi-settings-card.tsx` — FOUND (`data-slot="vi-settings-card"` · 만원 리터럴 0건)
- `webapp/src/components/trading/__tests__/vi-settings-card.test.tsx` — FOUND (18 passed)
- `webapp/src/components/trading/vi-order-list.tsx` — FOUND (`role="progressbar"` **1건** · `transition` 0건)
- `webapp/src/components/trading/__tests__/vi-order-list.test.tsx` — FOUND (26 passed)
- `webapp/src/components/trading/vi-client.tsx` — FOUND (`data-slot="vi-page"`)
- `webapp/src/app/trading/vi/page.tsx` — FOUND (**무변경**으로 소비)
- `webapp/e2e/specs/trading-vi.spec.ts` — FOUND (11 passed)
- 커밋 `7296548` / `7b067b2` / `7fb687a` — FOUND
- `key_links` — `vi-client.tsx` → `useRelayContext` · `vi-settings-card` 가 `send({t:"vi.set"})` · `vi-order-list` 가 `send({t:"vi.confirm"})`
- `isLimitChaserServerMessage` 정의 — **1건**(16-13). `vi-alert.ts` 가 import 해 재사용
- 16-13 소관 파일(`orderbook-ladder` · `strategy-log` · `limit-chaser-client` · `app/trading/limit-chaser/**` · `trading-limit-chaser.spec`) + `dirty-action-bar` · `chat-fab` — **미수정 확인**
- `STATE.md` / `ROADMAP.md` — **미수정 확인**
