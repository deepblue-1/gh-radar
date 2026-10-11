---
phase: 17-gh-trade-led
plan: 10
subsystem: ui
tags: [webapp, react, order-notice, pure-function, merge-window, tdd, a11y]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-02 가 브라우저 계약까지 결선한 주문통보 3필드 `RelayOrderMsg.bd`/`.rk`/`.rq`(빈 값은 키째 생략)"
  - phase: 17-gh-trade-led
    provides: "17-08 · 17-09 의 웹 표면 선례 — 서버 진실을 재계산하지 않고, 표시 문자열의 주인은 순수함수 하나다"
provides:
  - "`orderActionWord(facts)` — 행위 단어 판정. `notice_type` → `request_kind` → side 순, **문구 인자 없음**"
  - "`orderActionSide(facts)` — 방향색 원천. 취소·정정은 `null`"
  - "`orderNoticeLabel(facts)` — 「수동」 메타 + 「시간외종가」 접두까지 조립한 표시 라벨"
  - "`mergeKeyOf(row)` · `mergeOrderNotices(rows, windowMs = 3000)` — 3초 창 묶기 순수함수 (C# `MergeKeyOf` 동형)"
  - "`MergedOrderNotice` — 묶인 한 줄의 표시 계약(head · count · qty 합계 · priceMin/Max · 첫 통보 at · `#첫~끝`)"
  - "자동 게이트 3종: `order-notices.ts` 에 `Date.now()` 0 · 함수 시그니처에 문구 키 0 · `orders-api.ts` 에 묶기 호출 0"
  - "실측 확정: 주문통보를 그리는 웹 표면은 `today-orders-card` **하나**다 — 두 번째 구현이 필요 없다"
affects: [17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 11999
  tasks: 3
  commits: 9
plan_head_before: b0d5ae6b52255e854ff4896ac61909ea2a9e31ed

tech-stack:
  added: []
  patterns:
    - "판정 함수는 **읽으면 안 되는 값을 인자로 받지 않는다** — 문구 파싱 금지를 주석이 아니라 시그니처로 강제한다"
    - "시간 의존 로직은 **입력 행의 타임스탬프만** 본다 — 현재 시각을 읽지 않으면 타이머·fake timer 없이 단위 테스트로 잠긴다"
    - "정렬이 뒤집힌 목록을 접을 때는 **접기 순서(시간 오름차순)와 출력 순서(입력 순서)를 분리**한다 — 같은 순서로 하면 창 기준이 조용히 반대가 된다"
    - "신규 모듈의 첫 RED 는 import 해결 실패(로드 크래시)라 #3770 기준 INVALID_RED 다 — **시그니처만 있는 스텁**을 같은 RED 커밋에 넣어 단언 실패로 다시 받는다"

key-files:
  created:
    - webapp/src/lib/order-notices.ts
    - webapp/src/lib/__tests__/order-notices.test.ts
  modified:
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx

key-decisions:
  - "3초 창 기준은 **그 묶음의 첫 통보 시각**으로 고정했다 — 정본 C# `LogPanelRenderer` 는 마지막 갱신 기준 슬라이딩이지만 그쪽은 증분 렌더러고, 매 렌더마다 목록 전체를 다시 접는 순수함수에서 슬라이딩은 한 행을 무한히 키운다 (plan ④ · T-17-36)"
  - "묶인 행의 **가격은 합계가 아니라 범위(min~max)** 다 — 계획서 문구는 「수량·금액은 합계」였으나 이 표의 칸은 단가(가격)라 더하면 3천원짜리 3건이 9천원으로 보인다. 정본 C# `RewriteMerged` 와 같은 선택"
  - "`origin === \"manual\"` 은 「수동」과 「출처 불명」이 **같은 값**이라(`DmaOrderRow.origin` 주석) 자동주문의 증거로 쓸 수 없다 — 자동 판정은 `manual` 이 **아닐 때만** 참이고, 그래서 주체 미상은 자동으로 묶이지 않는 쪽에 떨어진다"
  - "묶이지 않는 행의 키는 **주문번호**(없으면 행 id)다 — 번호가 행마다 고유하므로 「안 묶임」이 별도 분기 없이 성립한다. 번호가 `null` 인 행 둘이 빈 키로 서로 묶이는 구멍은 행 id 폴백으로 막았다"
  - "시간외종가 취소·정정의 보이는 문구는 「시간외종가」 뿐이다(D-15 사용자 결정) — 행위 단어가 눈에서 사라지는 것을 **상태 칸**(`orderDisplayStatus` 가 `취소`/`정정`)과 **sr-only 맨몸 단어**로 메웠다. 보이는 문자열은 결정대로다"
  - "통보 전 행의 `requestKind` 는 우리가 보낸 **주문 종류**(`orderType === \"C\"`)로 떨어진다 — 서버 문구가 아니라 우리 요청 기록이고, 이것이 없으면 통보 전 취소주문이 「▲ 매수」 빨강으로 보이는 회귀가 난다"

patterns-established:
  - "Pattern 1: 「문구를 읽지 않는다」는 grep 게이트가 아니라 **시그니처**로 건다 — 인자 객체에 문구 키가 없으면 미래의 누구도 읽을 수 없다"
  - "Pattern 2: 순수함수의 시간 의존성은 인자(`windowMs`)와 입력 타임스탬프로 밀어낸다 — CI 에서 흔들리는 grouping 테스트보다 없는 편이 낫다는 문제를 애초에 만들지 않는다"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "주문 통보의 행위 단어가 `notice_type` → `request_kind` → side 순으로 정해지고, 어디서도 `message` 문구를 읽지 않는다 (D-08 · D-15 / T-17-33)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#①-1 notice_type \"C\" 는 취소다 — request_kind 와 무관하다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#①-3 우선순위 — notice_type \"C\" 와 request_kind \"New\" 가 동시에 오면 취소가 이긴다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#①-4 notice_type 이 그 밖이면 request_kind Cancel 이 취소를 만든다 (거부 통보 경로)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#①-7 side 를 모르고 위 분기에도 안 걸리면 빈 문자열이다 — 지어내지 않는다"
        status: pass
      - kind: other
        ref: "sed -n '/export interface OrderActionFacts/,/^}/p;/export interface OrderNoticeFacts/,/^}/p' webapp/src/lib/order-notices.ts | grep -cE '^\\s*(message|msg)\\??:' → 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "취소·정정 행에 방향색이 붙지 않는다 — 서버가 side 를 취소·정정에 쓰지 않고 에코만 하므로 매도 주문의 취소도 「매수」로 보인다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#②-1 취소·정정 통보는 방향색 원천이 null 이다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑥-1 신규 매수 주문에 취소확인 통보가 오면 행위 단어가 「취소」로 바뀌고 방향색이 죽는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑥-3 통보가 없는 신규 매도 행은 종전대로 방향색 매도다 — 없는 행위를 지어내지 않는다"
        status: pass
    human_judgment: false
  - id: D3
    description: "`requester === \"Manual\"` 통보에 「수동」 메타가, `board` G2/G3 에 「시간외종가」 접두가 붙는다 (D-15)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#③-1 requester \"Manual\" 이면 「수동」 메타가 붙는다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#③-3 board G2/G3 · 접수·체결·거부는 side 단어 앞에 접두가 붙는다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#③-4 board G2/G3 · 취소·정정 확인은 「시간외종가」 만이다 (D-15 · 사용자 결정 2026-09-17)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#③-5 board 가 빈 값·그 밖이면 접두가 없다 — 벽시계로 판정하지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑥-2 수동 발주 · 시간외종가 접수는 「시간외종가 매수」 + 「수동」 메타로 읽힌다"
        status: pass
    human_judgment: false
  - id: D4
    description: "자동주문 체결·매도 접수가 3초 창으로 묶이고, **매수 접수·거부·취소확인·정정확인·수동·주체 미상은 묶이지 않는다** (D-16 / T-17-34)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-1 같은 자동주문 체결 3건이 3초 안에 오면 한 줄이 된다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-2 자동주문의 **매도 접수** 2건은 묶인다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-3 자동주문의 **매수 접수** 2건은 묶이지 않는다 (Pitfall 8 직접 그물)"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-4 거부(R)는 묶이지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-5 취소확인(C)은 묶이지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-6 정정확인(M)은 묶이지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑤-3 수동 발주(requester Manual)·주체 미상(origin manual)은 주문번호가 키다"
        status: pass
    human_judgment: false
  - id: D5
    description: "묶기 창 기준이 **그 묶음의 첫 통보**라 한 행이 무한히 자라지 않는다. 경계 3000ms 는 포함이고 창 폭은 인자다 (T-17-36)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-7 3초를 넘긴 4번째 체결은 새 행이 된다 — 창 기준은 그 묶음의 첫 통보다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-9 창 기준은 **그 묶음의 첫 통보**다 — 경계 3000ms 는 포함이다"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑥-10 창 폭은 인자로 바꿀 수 있다 — 현재 시각을 읽지 않는다"
        status: pass
      - kind: other
        ref: "grep -c 'Date.now()' webapp/src/lib/order-notices.ts → 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "오늘 주문 표가 묶인 행을 그리고, **묶기 뒤에도 미매칭 주문번호 재조회 루프가 원래 번호 전부를 본다** (T-17-35)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑦-1 같은 자동주문의 조각 매도 체결 3건이 한 줄로 그려진다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑦-2 묶기 뒤에도 재조회 루프는 **묶기 전** 주문번호 목록을 본다 (T-17-35)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑦-3 복원 행만 있고 relay 프레임이 없으면 묶기가 아무것도 바꾸지 않는다"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑦-4 묶인 행을 펼치는 UI 는 만들지 않는다 (이번 phase 범위 밖)"
        status: pass
      - kind: other
        ref: "grep -c 'mergeOrderNotices' webapp/src/lib/orders-api.ts → 0 (책임 분리)"
        status: pass
    human_judgment: false
  - id: D7
    description: "실계좌/모의 게이트웨이에서 `board`·`request_kind`·`requester` 가 실제로 `\"G2\"`/`\"G3\"` · `\"New\"`/`\"Modify\"`/`\"Cancel\"` · `\"Manual\"` 로 오는지, 그리고 조각 매도 실황에서 묶기가 사람 눈에 읽히는지"
    verification: []
    human_judgment: true
    rationale: "어휘는 gh-trade `.fbs` 주석과 C# 정본에서 읽은 것이고 이 plan 은 목 프레임으로만 확인했다(17-02 D8 과 같은 한계). 3초 창의 체감 — 몇 건이 실제로 한 줄이 되는지 — 도 장중 실황으로만 판단된다. D-26 대로 20:00 이후 배포·관찰로 닫는다."

# Metrics
duration: 15 min
completed: 2026-09-20
status: complete
---

# Phase 17 Plan 10: 주문통보 행위 단어 · 3초 창 묶기 Summary

**주문 통보가 「무엇을 한 통보인지」를 `notice_type`·`request_kind` 로만 말하게 하고(문구를 **인자로 받을 수조차 없다**), 조각 매도로 쏟아지던 통보를 첫-통보-기준 3초 창으로 묶는 순수함수 2벌을 세워 「오늘 주문」 표가 그것을 호출만 하게 했다.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-20T09:33:47Z
- **Completed:** 2026-09-20T09:48:40Z
- **Tasks:** 3 (tracer 1 · auto 2, 전부 `tdd="true"`)
- **Files created/modified:** 4 (신규 2 · 수정 2)
- **테스트:** webapp 936 → **974** (+38), relay 467 · 회귀 0

## Accomplishments

- **행위 단어의 판정 근거가 서버 필드 둘로 좁혀졌다.** `orderActionWord` 는 `notice_type "C"/"M"` → `request_kind Cancel/Modify` → side 단어 → 빈 문자열 순으로만 떨어진다. 804 정정·취소 거부에서 게이트웨이가 `message` 를 교체해도 이 판정은 흔들리지 않는다 — **함수가 문구를 인자로 받지 않기 때문**이다(T-17-33). 주석으로 금지한 것이 아니라 시그니처로 막았다.
- **취소·정정 행의 방향색이 죽었다.** 서버는 취소·정정 요청의 `side` 를 쓰지 않고 그대로 에코할 뿐이라 **매도 주문의 취소도 「매수」** 로 보인다(C# `ActionWord` 주석). `orderActionSide` 가 그 경우 `null` 을 돌려주고 표면은 중립색으로 그린다. 신규(`orderType "N"`) 매수 주문에 취소확인 통보가 온 행이 「취소」로 바뀌는 케이스가 자동 단언으로 잠겼다 — **종전 코드는 이 행을 「▲ 매수」 빨강으로 그렸다.**
- **조각 매도 통보가 한 줄이 됐다.** `mergeOrderNotices` 가 자동주문의 **체결 전량**과 **매도 접수**만 `origin|ISIN|거래소|side` 축으로 묶고, 매수 접수·거부·취소확인·정정확인·수동·주체 미상은 주문번호 키로 떨어져 **구조적으로** 묶이지 않는다. 묶인 행은 첫 통보 시각 · 수량 합계 · 가격 범위 · `#첫번호~끝번호` · `(N건)` 으로 읽힌다.
- **창이 무한히 자라지 않는다.** 기준을 마지막 갱신이 아니라 **그 묶음의 첫 통보**로 고정했다(T-17-36). 이 때문에 접기는 **시간 오름차순**으로 하고 출력 자리만 입력 순서(내림차순)로 되돌린다 — 목록 순서 그대로 접으면 창 기준이 「가장 최신 통보」가 되어 조용히 반대가 된다. 이 함정은 RED 가 실제로 잡았다(아래 Issues).
- **현재 시각을 읽지 않는다.** `Date.now()` 0건이 자동 게이트다. 시각은 전부 입력 행의 `createdAt` 이고 창 폭은 인자라, fake timer 도 실제 대기도 없이 고정 타임스탬프 픽스처로 8+3 케이스가 잠겼다.
- **재조회 경로가 묶기 때문에 끊기지 않는다.** `unmatchedOrderNos` 는 `mergeTodayOrders` 결과에서 나오고 묶기는 그 **뒤**에 화면만 접는다. 묶인 행이 1줄인 상태에서도 복원에 없는 주문번호 재조회가 나가는 것을 단언으로 잠갔다(T-17-35).

## 실측 결과 (계획서가 SUMMARY 기록을 요구한 2건)

### ① `side` 원천 — 복원 행 하나다 (Task 1 ②)

- `RelayOrderMsg` 에는 `side` 가 **없다**(`packages/shared/src/relay.ts:796` — Pitfall 8 규율 유지, 「통보에 방향·종목을 실으면 두 원천이 갈린다」).
- 「오늘 주문」 표의 행은 **전부 복원 스냅샷(`DmaOrderRow`)에서 나온다.** `mergeTodayOrders` 는 `restored.map(...)` 으로만 행을 만들고 라이브 프레임으로는 행을 **합성하지 않는다** — 짝을 못 찾은 프레임은 행이 아니라 `unmatchedOrderNos` 로 보고만 된다.
- 따라서 **이 표면에는 side 를 모르는 행이 존재하지 않는다.** 그래도 `NoticeSide` 는 `null` 을 허용하고 `orderActionWord` 가 빈 문자열로 떨어지게 두었다 — 다른 표면(Phase 18 예약/시간외종가 발주 UI)이 프레임만으로 줄을 만들면 그때 필요하다.
- 프레임에서 side 를 **지어내지 않았다.**

### ② 같은 묶기가 필요한 다른 표면 — 없다 (Task 3 ③)

- `RelayOrderMsg` 를 소비하는 webapp 코드: `lib/use-relay-socket.ts`(리듀서) · `lib/orders-api.ts`(병합) · `components/trading/today-orders-card.tsx`(표시) 뿐이다.
- `strategy-log.tsx` 는 `RelayLimitChaser` 에코 전이와 `RelayServerMsg` 만 그린다 — 주문 통보를 그리지 않는다.
- `strategy-status-card.tsx` 는 주석으로 「주문 통보에는 ISIN 이 없어 어느 전략의 주문인지 귀속시킬 수 없다」고 명시하고 소비하지 않는다.
- `account-panel`·`order-panel`·`me-client` 의 `orders` 언급은 전부 주석·라우트 경로·import 다.
- **결론: 두 번째 구현을 만들 자리가 없었다.** 순수함수는 그래도 `lib` 에 두었다(Phase 18 표면이 호출할 수 있도록).

## Task Commits

1. **Task 1 (tracer, TDD): 행위 단어 순수함수 + 표면 적용**
   - RED(순수함수) — `203452a` (test)
   - RED(표면) — `f73312c` (test)
   - GREEN — `98e6cd6` (feat)
   - REFACTOR — 없음 (GREEN 이 이미 최소)
2. **Task 2 (TDD): `mergeOrderNotices` 3초 창 묶기**
   - RED — `362268d` (test)
   - GREEN — `dc7abfe` (feat)
   - REFACTOR — 없음
3. **Task 3 (TDD): 오늘 주문 표에 묶기 적용**
   - RED — `bfafeec` (test)
   - GREEN — `8fc0095` (feat)
   - REFACTOR — 없음

**Plan metadata:** 이 SUMMARY 커밋.

`commits: 9` 는 서술이 아니라 `git rev-list --count b0d5ae6..HEAD` 로 **측정**한 값이다. **주의: 이 중 2건(`ce97f40` · `62a5673`)은 이 plan 의 것이 아니다** — 실행 중 같은 저장소에서 동시에 돌던 `quick-260920-pik`(relay netcut 측정기)이 master 에 남긴 커밋이고, `.planning/` 과 `infra/relay/` 만 건드려 이 plan 의 파일과 겹치지 않는다. 이 plan 이 만든 커밋은 **7건**이다. 측정 도구가 같아야 `/gsd-verify-work` 와 어긋나지 않으므로 값은 9 로 적고 내역을 여기 남긴다.

## Files Created/Modified

- `webapp/src/lib/order-notices.ts` **(신규)** — `orderActionWord` · `orderActionSide` · `orderNoticeLabel` · `mergeKeyOf` · `mergeOrderNotices` · `MERGE_WINDOW_MS` · 타입 5종
- `webapp/src/lib/__tests__/order-notices.test.ts` **(신규)** — 27 케이스(행위 7 · 방향 2 · 라벨 6 · 시그니처 1 · 키 4 · 창 11 중 중복 제외)
- `webapp/src/components/trading/today-orders-card.tsx` — `noticeFactsOf` 추가, `SideTag` 를 「받아 그리는」 컴포넌트로 교체, `priceText` 추가, 표·카드 두 벌 모두 `merged` 를 그린다
- `webapp/src/components/trading/__tests__/today-orders-card.test.tsx` — 7 케이스 추가(행위 단어 3 · 묶기 4)

## Decisions Made

1. **창 기준은 첫 통보 고정 — 정본과 의식적으로 다르다.** gh-trade `LogPanelRenderer.FindMergeRecord`(:330)는 `LastUpdate` 기준 **슬라이딩** 창이다. 그쪽은 줄이 올 때마다 한 줄씩 덧붙이는 증분 렌더러라 사람이 성장 상한을 보고 있고, 32건 기록 상한과 트림이 별도로 있다. 이 함수는 **매 렌더마다 목록 전체를 다시 접는** 순수함수라 슬라이딩이면 통보가 계속 오는 동안 한 행이 무한히 자란다. 계획서 ④ 와 threat register T-17-36 이 명시적으로 고른 쪽을 따랐다.
2. **접기 순서와 출력 순서를 분리했다.** 이 표는 `created_at` **내림차순**(최신 먼저)이다. 그 순서로 접으면 창의 anchor 가 「가장 최신 통보」가 되어 「첫 통보 기준」이 성립하지 않는다(실제로 RED 에서 `[3, 1]` 이 나왔다). 시간 오름차순으로 접고, 출력은 각 묶음 구성원의 **입력상 가장 앞 인덱스**로 되돌린다 — 서버가 준 정렬을 뒤집지 않는다.
3. **가격은 합계가 아니라 범위다.** 계획서 ③ 은 「수량·금액은 합계」라고 썼지만 이 표의 칸은 **단가(가격)** 다. 단가를 더하면 3천원짜리 3건이 9천원으로 보이고 트레이더는 그 숫자로 판단한다. 정본 C# 도 `MinPrice`/`MaxPrice` 를 쓴다. 수량은 계획서대로 합계다.
4. **`origin === "manual"` 을 자동주문의 반증으로만 쓴다.** `DmaOrderRow.origin` 주석이 「구 게이트웨이 빈 값 → `manual`, 즉 수동과 출처 불명이 같은 값」임을 경고한다. 그래서 `automated = origin !== "manual" && rq !== "Manual"` — **`manual` 이면 무조건 안 묶는다.** 출처 불명을 자동주문으로 오인해 묶으면 남의 주문 수량이 합쳐진다.
5. **묶이지 않는 행의 키는 주문번호, 없으면 행 id.** 계획서는 「주문번호」라고만 했으나 `orderNo` 는 `null` 일 수 있다(접수 전 거부·타임아웃). 그대로 두면 번호 없는 행 둘이 같은 키로 **묶인다** — 행 id 폴백으로 막았다.
6. **통보 전 행의 `requestKind` 는 `orderType` 이 말한다.** 서버 문구가 아니라 **우리가 보낸 주문 종류**(`dma_orders.order_type`)다. 이것이 없으면 통보가 아직 안 온 취소주문이 「▲ 매수」 빨강으로 보이는 회귀가 난다(종전 코드는 `orderType === "C"` 로 「매수 취소」를 회색으로 그리고 있었다).
7. **시간외종가 취소·정정의 보이는 문구는 「시간외종가」 뿐이다.** D-15(사용자 결정 2026-09-17)와 C# 정본이 일치한다 — C# 에서 취소·정정 확인 줄의 `Lead` 는 비어 있고 행위는 배지·본문(`확인`)이 말한다. 이 표에서는 **상태 칸**이 그 자리를 대신한다. 다만 스크린리더가 구분 칸만 읽을 때를 위해 `orderActionWord` 의 **맨몸 단어**를 `sr-only` 로 같이 뒀다 — 보이는 문자열은 결정대로 바뀌지 않는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 번호 없는 행이 서로 묶이는 구멍**
- **Found during:** Task 2 (`mergeKeyOf` 설계)
- **Issue:** 계획서의 「그 밖은 주문번호가 키」를 그대로 쓰면 `orderNo === null` 인 행(접수 전 거부·타임아웃) 둘이 같은 키(`NO|null`)로 **묶인다** — 서로 무관한 실패 주문 둘의 수량이 합쳐져 보인다
- **Fix:** `NO|${row.orderNo ?? row.id}` — 행 id 폴백. `id` 는 DB PK 라 행마다 고유하다
- **Files modified:** `webapp/src/lib/order-notices.ts`
- **Verification:** `⑤-4 라이브 통보가 없는 복원 행은 묶이지 않는다` · `⑥-11` 통과
- **Committed in:** `dc7abfe`

**2. [Rule 1 - Bug] 통보 전 취소주문이 방향색 매수로 보이는 회귀**
- **Found during:** Task 1 (표면 적용)
- **Issue:** 새 판정만 쓰면 `noticeType`/`requestKind` 가 둘 다 빈 통보 전 취소주문이 side 단어로 떨어져 **「▲ 매수」 빨강**이 된다. 종전 코드는 `orderType === "C"` 로 「매수 취소」를 회색으로 그리고 있었으므로 그대로 두면 회귀다
- **Fix:** `noticeFactsOf` 가 `live?.rk ?? (row.orderType === "C" ? "Cancel" : "")` 로 떨어진다. 서버 **문구**가 아니라 우리 요청 기록이라 D-08 밖이다. 표시 문자열은 「매수 취소」 → 「취소」로 바뀌는데, 이것이 정본 규율(취소에 방향을 그리지 않는다)에 맞는 쪽이다
- **Files modified:** `webapp/src/components/trading/today-orders-card.tsx`
- **Verification:** 기존 케이스 「복원 3건(접수 2 · 취소 1)」 · 「같은 orderNo 의 라이브 프레임」 두 건이 회귀 없이 통과, 신규 `⑥-3` 이 통보 없는 행의 방향색을 잠근다
- **Committed in:** `98e6cd6`

**3. [Rule 3 - Blocking] 신규 모듈의 첫 RED 가 로드 크래시라 INVALID_RED**
- **Found during:** Task 1 · Task 2 (RED 단계)
- **Issue:** 파일이 없는 상태의 첫 실행은 `Failed to resolve import "../order-notices"`(Task 1) · `TypeError: mergeOrderNotices is not a function`(Task 2) 였다. #3770 기준으로 둘 다 **INVALID_RED** 라 GREEN 을 승인하지 못한다
- **Fix:** **시그니처만 있고 판정은 없는 스텁**을 같은 RED 커밋에 넣어 다시 받았다. 스텁의 반환값은 중립이되 **설계된 값과 다르게** 골랐다(`orderActionWord → ""`, `mergeKeyOf → row.id`, `mergeOrderNotices → 각 행 1묶음`) — 그래야 목표 케이스가 단언으로 실패하고, 「묶지 않는다」 류의 불변식 케이스는 RED 에서도 통과한다(의도된 green)
- **Files modified:** `webapp/src/lib/order-notices.ts`
- **Verification:** 아래 RED 증거 표 — 두 사이클 모두 **AssertionError** 만 나온다
- **Committed in:** `203452a` · `362268d`

### 계획서·정본과의 차이 (의식적 선택)

**4. [정본 차이] 3초 창이 슬라이딩이 아니다**
- 정본 C# `LogPanelRenderer.FindMergeRecord`(:330)는 `(time - LastUpdate) > 3000` 으로 **마지막 갱신 기준 슬라이딩**이다.
- 이 plan 은 **묶음의 첫 통보 기준 고정** 창을 썼다. 계획서 ④ 와 threat register **T-17-36** 이 명시적으로 그렇게 정했고, 근거는 위 「Decisions Made 1」이다.
- **영향:** 통보가 3초보다 촘촘하게 계속 오는 상황에서 이쪽은 3초마다 새 행이 서고 C# 은 한 줄이 계속 자란다. 조각 매도(수백 ms 간격, 조각 수 유한)에서는 두 구현이 같은 답을 낸다.

**5. [계획서 차이] 묶인 행의 「금액 합계」 → 가격 범위**
- 위 「Decisions Made 3」. 수량은 계획서대로 합계다.

**6. [추가] 계획서에 없던 sr-only 맨몸 행위 단어**
- D-15 가 시간외종가 취소·정정의 보이는 문구를 「시간외종가」로 고정하면서 행위 단어가 눈에서 사라진다. 상태 칸이 대신하지만 구분 칸만 읽는 스크린리더에는 안 들린다 — `orderActionWord` 의 맨몸 단어를 `sr-only` 로 덧댔다. **보이는 문자열은 사용자 결정 그대로다.**

---

**Total deviations:** 3 auto-fixed (1 missing critical · 1 bug · 1 blocking) + 3 의식적 차이 기록
**Impact on plan:** 범위를 넓히지 않았다. #1·#2 는 없으면 잘못된 숫자·잘못된 색이 화면에 서는 correctness 문제이고, #4·#5 는 계획서·threat register 가 이미 고른 쪽을 따른 것이다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 (tracer) | ✓ `203452a` + `f73312c` | ✓ `98e6cd6` | — (변경 없음) | Pass |
| 2 | ✓ `362268d` | ✓ `dc7abfe` | — (변경 없음) | Pass |
| 3 | ✓ `bfafeec` | ✓ `8fc0095` | — (변경 없음) | Pass |

**RED 증거 (#3770 실질 요건 — 네 사이클 모두 「대상 테스트가 계획된 behavior 에 대한 단언으로 실패」)**

| 사이클 | command | exit | 대상 테스트 | 실패 형태 | 집계 |
|---|---|---|---|---|---|
| T1 순수함수 | `pnpm --filter @gh-radar/webapp test` | `1` | `orderActionWord > ①-1 …` 외 12건 | **단언 실패** — `expected '' to be '취소'` · `expected '' to be '정정'` | 953 중 **13 실패 / 939 통과** |
| T1 표면 | `pnpm --filter @gh-radar/webapp test` | `1` | `TodayOrdersCard > ⑥-1/⑥-2/⑥-3` | **단언 실패** — `expected 0 to be greater than 0`(`data-slot="today-order-side"` 부재) | 956 중 **3 실패 / 939 통과** |
| T2 | `pnpm --filter @gh-radar/webapp test` | `1` | `mergeKeyOf > ⑤-1`, `mergeOrderNotices > ⑥-1/⑥-2/⑥-7/⑥-8/⑥-9/⑥-10` | **단언 실패** — `expected 'id-0000100001' to be 'id-0000100002'` · `to have a length of 1 but got 3` | 971 중 **7 실패 / 963 통과** |
| T3 | `pnpm --filter @gh-radar/webapp test` | `1` | `TodayOrdersCard — 통보 묶기 > ⑦-1/⑦-2/⑦-4` | **단언 실패** — 묶기 미적용으로 행이 3줄(1줄 기대) | 975 중 **3 실패 / 971 통과** |

로드 실패·0건 발견·unexpected green 어느 쪽도 아니다(T1·T2 의 첫 실행이 로드 크래시였던 건은 위 deviation #3 에 적었고, **스텁을 넣어 다시 받은 결과가 위 표**다). 각 사이클의 **불변식 케이스**(①-7 · ②-2 · ③-2 · ⑤-2/⑤-3/⑤-4 · ⑥-3/⑥-4/⑥-5/⑥-6/⑥-11 · ⑦-3)는 RED 에서도 통과했다 — 그것들은 새 동작이 아니라 **묶지 말아야 할 것이 안 묶이는 성질**을 굳히는 회귀 그물이므로 의도된 green 이다.

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다 (17-01·17-02 가 보고한 도구 갭 그대로).**
`bin/lib/tdd-red-evidence.cjs` 의 `parseNodeTestSummary` 는 `node --test` 의 `# tests/# pass/# fail` 푸터 3줄로만 집계를 읽는데 vitest 는 그 푸터를 출력하지 않아 어떤 입력이든 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내는 것은 게이트가 검사하려던 증거의 위조라 하지 않았고, 대신 위 표로 실질 증거를 남긴다.

## Issues Encountered

- **내림차순 목록을 그대로 접으니 창 기준이 반대가 됐다.** `mergeOrderNotices` 첫 구현은 입력 순서대로 접으면서 창을 **절댓값 차**로 봤다. 그러면 `[at(4000), at(2000), at(1000), at(0)]` 에서 anchor 가 `4000`(가장 **최신**)이 되어 앞 3건이 묶이고 `at(0)` 이 새 행으로 떨어진다 — `[3, 1]`. 「첫 통보 기준」이라면 `[1, 3]` 이어야 한다. `⑥-7` 이 정확히 그것을 잡았고, 접기 순서(시간 오름차순)와 출력 순서(입력 순서)를 분리해 고쳤다. **절댓값 차로 「정렬 무관」을 흉내 낸 것이 원인**이다 — 정렬은 무관하지 않았다.
- **17-02 가 경고한 `pnpm … test -- <필터>` 무효는 여기서도 그대로다.** vitest 가 `--` 뒤 인자를 파일 필터로 쓰지 않아 73개 파일을 전부 돈다. 판정에는 영향이 없어(전량 green 이 더 강한 조건) 계획서 `<verify>` 명령을 그대로 쓰되 결과는 전량 실행으로 읽었다.
- 그 밖의 문제 없음. baseline(relay 467 · webapp 936 + 1 skipped) 대비 회귀 0, `pnpm typecheck` · `webapp lint`(신규 경고 0) green.

## Known Stubs

없음. RED 단계의 스텁 2벌은 같은 태스크의 GREEN 커밋에서 전부 실구현으로 교체됐다(`orderActionWord` · `orderActionSide` · `orderNoticeLabel` · `mergeKeyOf` · `mergeOrderNotices`). 하드코딩된 빈 배열·플레이스홀더 문구·미배선 컴포넌트는 남아 있지 않다.

## User Setup Required

없음 — 신규 의존성 0건, 외부 서비스 설정 변경 없음.

## Next Phase Readiness

**바로 시작 가능:**
- **17-11**(상따 래치 LED 마운트) — 이 plan 은 `components/trading/latch-led.tsx` 를 건드리지 않았다. 충돌 없음.
- **Phase 18**(예약/장전/시간외종가 발주 UI) — `mergeOrderNotices` 와 `orderNoticeLabel` 은 `webapp/src/lib` 에 있는 **표면 독립 순수함수**다. 새 표면은 **호출만** 하면 되고 두 번째 구현을 만들지 않는다(D-16). `NoticeSide` 가 `null` 을 허용하므로 프레임만으로 줄을 만드는 표면도 side 를 지어내지 않고 빈 문자열로 떨어질 수 있다.

**주의:**
- **묶기의 시각 원천은 `DmaOrderRow.createdAt`(주문 생성 시각)이지 통보 도착 시각이 아니다.** 브라우저 프레임에 통보 시각이 없어 이것이 유일한 축이다. 접수→체결 지연이 3초를 넘으면 같은 주문의 체결이 접수와 다른 창에 떨어질 수 있는데, 묶기 키가 애초에 접수(`AG`)와 체결(`FG`)을 갈라 두어 섞이지 않는다.
- **묶기는 표시 전용이다.** `dma_orders` 도, `unmatchedOrderNos` 재조회도, `orderDisplayStatus` 도 묶기를 보지 않는다. 뒤 plan 이 묶기를 `mergeTodayOrders` 안으로 옮기면 `orders-api.ts` 의 `mergeOrderNotices` 0건 게이트가 깨지는데, 그것이 의도된 알람이다.
- 배포는 D-26 대로 장 마감(20:00 KST) 이후 사용자 확인 뒤에 한다. 이 plan 은 webapp 만 바꿨고 **배포하지 않았다**.
- `TRADE-04` 는 형제 plan 이 아직 선언 중이라 `requirements.ready-ids` 가 막을 수 있다 — REQUIREMENTS.md 체크는 마지막 선언 plan 이 끝날 때 닫힌다(#2388, 정상 동작).

## Self-Check: PASSED

- 신규·수정 4파일 전부 디스크에 존재 확인
- 이 plan 의 커밋 7건 전부 `git log` 에서 확인: `203452a` · `f73312c` · `98e6cd6` · `362268d` · `dc7abfe` · `bfafeec` · `8fc0095`
- `commits: 9` 는 `git rev-list --count b0d5ae6..HEAD` 로 **측정**한 값이다(동시 실행 quick 커밋 2건 포함 — 위 Task Commits 에 내역)
- 모든 태스크 `<acceptance_criteria>` 최종 재실행 통과 (Task 1: 6/6 · Task 2: 7/7 · Task 3: 5/5)
- plan `<verification>` 재실행 통과: webapp **974 passed / 1 skipped**, relay **467 passed**, `pnpm typecheck` exit 0 (`error TS` 0건), `order-notices.ts` 의 `Date.now()` **0**, `orders-api.ts` 의 `mergeOrderNotices` **0**
- 회귀 확인: baseline(webapp 936 + 1 skipped · relay 467) 대비 실패 0

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-20*
