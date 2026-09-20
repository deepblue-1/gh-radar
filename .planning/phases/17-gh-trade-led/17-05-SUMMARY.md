---
phase: 17-gh-trade-led
plan: 05
subsystem: api
tags: [flatbuffers, relay, dma, gh-trade, protocol, vi-trigger, exchange, fifo, zod, tdd]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 `RelayViTrigger.exchange`·`RelayViOrderItem.exchange`·`RelayViNoticeMsg.exchange`·`RelayViTriggerMsg.x` 계약과 이미 채워진 파서 3종 · 기본값 없는 `buildSetVITriggerReq(exchange)`"
  - phase: 17-gh-trade-led
    provides: "17-02 의 Q-ID tripwire(인바운드 주문번호에 형식 제한 금지) · 리터럴 픽스처 관례"
  - phase: 17-gh-trade-led
    provides: "17-03 의 hub `unhandledFrameCount()` 드롭 0 게이트 · 명시 `case` 규율"
  - phase: 17-gh-trade-led
    provides: "17-04 의 `buildArmLatchReq` 조립 형태(문자열 → `GetStrategyReq` → `Envelope`)와 「래치는 어떤 FIFO 에도 넣지 않는다」 규율"
provides:
  - "`buildGetVITriggerReq(exchange)` — 21 이 `get_strategy_req.key` 슬롯에 거래소를 싣는다 (`buildBareRequest` 금지)"
  - "Ready 프리페치가 21 을 KRX·NXT **2회** 보낸다 — 24·34 는 각 1회 그대로"
  - "`#pendingViGets` 세션별 요청 거래소 FIFO + C# `_pendingViGets` 규약 (a)~(d) 이식"
  - "거래소별 VI 캐시 `#viTriggers: ${userId}|${exchange}` 와 `getViTrigger(userId, exchange)` — 3상태를 거래소마다 독립 판정"
  - "인증 직후 `{t:\"vi\", x, cfg}` 스냅샷이 두 거래소 모두 (모르는 거래소는 보내지 않는다)"
  - "`RelayViSetSchema.exchange` (optional · `ExchangeSchema` 재사용) — 미지 값은 거부"
  - "`viPendingKey` 에 거래소 포함 — 양쪽 거래소 접수 전 주문이 2행"
  - "테스트 리더 `readGetVITriggerExchange(msgType, payload)` — 21 요청의 거래소 디코드"
affects: [17-06, 17-09, 17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 16243
  tasks: 3
  commits: 5
plan_head_before: d43087d5c3374494d6a818a79a053074be09d466

tech-stack:
  added: []
  patterns:
    - "거래소를 담지 않는 응답은 **요청 순서 FIFO** 로만 귀속한다 — 귀속할 수 없으면 캐시를 고치지 않는다(지어내지 않는다)"
    - "본문이 있는 응답은 **본문이 정본**이고 FIFO 는 head 와 일치할 때만 소비한다 — 팬아웃 에코가 큐를 밀지 않는다"
    - "상관 키에 축을 더하는 것은 **유일하지 않은 키에만** — 이미 유일한 키(주문번호)에 더하면 두 경로의 키가 갈린다"
    - "요청 집합과 FIFO push 순서를 같은 상수(`VI_PREFETCH_EXCHANGES`) 한 벌로 돌려 구조적으로 어긋날 수 없게 한다"

key-files:
  created: []
  modified:
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/fanout.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/order-handler.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/strategy-hub.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/ws-latch.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "빈 61 을 귀속할 FIFO 가 없으면 **캐시를 고치지 않고 팬아웃도 하지 않는다** — 이전의 「근거가 없으면 KRX」 폴백을 없앴다 (T-17-16)"
  - "본문 있는 61 도 head 와 같을 때만 FIFO 를 소비한다 (C# 규칙 (b)/(c)) — 그러지 않으면 KRX 등록본이 NXT 의 빈 응답 자리를 먹는다"
  - "「본문 없는 요청 3종(24/21/34)」 불변식을 **2종(24/34)** 으로 바꿨다 — 21 은 이제 거래소를 싣는다(서버 정본이 그렇게 읽는다)"
  - "`ws-latch` ③-3 기준선을 「빈 61 은 언제나 x:KRX」 → 「귀속 근거가 없으면 어느 칸도 건드리지 않는다」로 **좁혔다**"
  - "`viOrderKey`(주문번호 있는 행)는 바꾸지 않고 `viPendingKey` 에만 거래소를 더했다 (T-17-18)"
  - "`requestStrategySnapshot` 의 21 2회를 복붙 두 줄이 아니라 `VI_PREFETCH_EXCHANGES` 루프로 두었다 — 요청 순서와 FIFO push 순서를 한 벌로 묶는다"
  - "Task 1 은 RED 를 만들 수 없었다(17-01 이 파서·조립기를 이미 채웠다) — 지어내는 대신 돌연변이 2건으로 테스트가 실제로 무는지 확인했다"

patterns-established:
  - "Pattern 1: 귀속 실패는 **아무 말도 하지 않는 것**이 기본값이다 — 지어낸 귀속은 틀린 칸의 사용자 입력을 지운다"
  - "Pattern 2: 슬롯을 재사용하는 요청은 msg_type 카운트로 검증하지 않는다 — 같은 거래소 2회도 카운트는 2다. 페이로드를 디코드해야 한다"
  - "Pattern 3: 픽스처의 optional 문자열은 **슬롯 부재**와 **빈 문자열**을 둘 다 표현할 수 있어야 한다 — 구 서버 와이어가 전자다"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "VI 파서 3종(61·56·72/73)이 거래소를 싣고 빈 와이어 값은 `fromWireExchange` 하나가 KRX 로 정규화한다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#⑥-d VI 파서 3종이 거래소를 싣고 빈 와이어 값은 `fromWireExchange` 가 KRX 로 정규화한다 (17-05 / D-06)"
        status: pass
      - kind: other
        ref: "awk per-function grep: parseViTrigger/parseViOrderList/parseViOrderNotice 각 fromWireExchange 1회 · 신규 정규화 함수 0건"
        status: pass
    human_judgment: false
  - id: D2
    description: "`buildSetVITriggerReq` 가 호출부의 거래소를 그대로 싣고 **기본값이 없다** (T-17-17)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#⑥-c 조립기는 거래소를 **호출부가 준 값 그대로** 싣는다 — 기본값이 없다 (17-05 / T-17-17)"
        status: pass
      - kind: other
        ref: "sed -n '/export function buildSetVITriggerReq/,/^}/p' relay/src/dma/envelope.ts | grep -c '\"KRX\"' → 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ready 프리페치가 21 을 KRX·NXT 2회 보내고 24·34 는 각 1회 그대로다"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#①-2 21 은 KRX·NXT 2회다 — 24·34 는 각 1회 그대로 (17-05 / D-06)"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#① Ready 직후 전략 조회가 **4건** 나간다 — 24·34 각 1회 + 21 거래소별 2회 (D-12 / 17-05)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#⑨ 본문 없는 요청은 **2종(24/34)** 이다 — 21 은 거래소를 싣는다 (17-05 / D-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "거래소를 담지 않는 빈 61 이 **요청 거래소 FIFO** 로 정확히 귀속되고, 귀속할 수 없으면 캐시를 고치지 않는다 (T-17-16)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#①-3 빈 61 은 **요청 거래소 FIFO** 로 귀속된다 — KRX 미등록 · NXT 등록 (17-05 / Pitfall 3)"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#①-4 응답 순서가 뒤바뀌어도 결과가 같다 — 본문 있는 61 은 본문이 정본이다"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#①-5 21 을 보낸 적 없는데 온 빈 61 은 **캐시를 고치지 않는다** (T-17-16)"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#①-6 세션이 교체되면 FIFO 를 비운다 — 옛 큐로 귀속되지 않는다 (규칙 (d))"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#③-3 lc.arm 3연타 뒤 귀속 근거 없는 빈 61 은 어느 칸도 건드리지 않는다 (17-05 / T-17-16)"
        status: pass
    human_judgment: false
  - id: D5
    description: "relay 세션 캐시와 `{t:\"vi\"}` 프레임이 거래소별이고 브라우저 인증 스냅샷도 두 거래소 모두 내려간다"
    requirement: TRADE-04
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑭ 0건도 프레임이 오지만, VI 를 아직 모르면 vi 프레임은 오지 않는다 (KRX·NXT 2프레임 toEqual)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑬ 인증만 하면 전략 스냅샷 3프레임이 구독 없이 온다 (D-12) — NXT 는 「모름」이라 1프레임"
        status: pass
    human_judgment: false
  - id: D6
    description: "`vi.set` 이 거래소를 받고 미지 값은 zod 가 끊는다 — 「생략 = KRX」는 호출부 한 곳에서만 (T-17-19 / T-17-17)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#①-vi `vi.set` 은 거래소를 optional 로 받고 미지 값은 거부한다 (17-05 / D-06 / T-17-19)"
        status: pass
      - kind: integration
        ref: "relay/tests/fanout.test.ts#⑰-c vi.set 의 거래소가 그대로 나간다 — 생략하면 호출부가 KRX 를 채운다 (17-05 / D-06)"
        status: pass
    human_judgment: false
  - id: D7
    description: "VI 주문 상관 키가 접수 전 행에서만 ISIN+거래소다 — 양쪽 발동은 2행, 주문번호 행의 키는 불변 (T-17-18)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#⑦-x 접수 전 VI 주문의 상관 키에 거래소가 들어간다 — 양쪽 발동은 **2행**이다 (17-05 / D-06)"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#⑦-y 주문번호가 있는 행의 키는 **바뀌지 않는다** — 72 스냅샷과 73 델타가 갈리지 않는다 (T-17-18)"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-hub.test.ts#⑦-z 접수되며 주문번호가 붙으면 자리표시 행이 걷힌다 — 거래소가 같아야 걷힌다"
        status: pass
    human_judgment: false
  - id: D8
    description: "실서버 게이트웨이가 21 두 건에 실제로 거래소별로 답하고 NXT 전략이 화면에 뜨는지 — 실기 확인은 이 plan 범위 밖(D-25)"
    verification: []
    human_judgment: true
    rationale: "스텁 게이트웨이는 21 요청 페이로드를 보지 않고 심어 둔 답을 그대로 돌려준다(설계상 업무 로직을 흉내 내지 않는다). 「KRX 요청에는 KRX 전략, NXT 요청에는 NXT 전략」이라는 서버측 슬롯 선택은 mock 게이트웨이(gh-trade `run-mac.sh`) 또는 실서버로만 확인된다 — D-25 에 따라 17-08 이후 사용자 관찰로 닫힌다."

# Metrics
duration: 1h 9m
completed: 2026-09-20
status: complete
---

# Phase 17 Plan 05: VI 전략 거래소 축 (relay 층) Summary

**VI 전략·발동통보·주문목록에 거래소 축을 넣고, Ready 프리페치 `GetVITriggerReq(21)` 를 KRX·NXT 2회로 넓혀 거래소를 담지 않는 빈 61 을 C# `_pendingViGets` 동형의 요청 거래소 FIFO 로 귀속시켰다 — 귀속할 근거가 없으면 캐시를 고치지 않는다**

## Performance

- **Duration:** 1h 9m (API 연결 오류로 GREEN 중간에 끊겼다 재개 — 아래 「Issues Encountered」)
- **Started:** 2026-09-18T12:24:00Z
- **Completed:** 2026-09-20T08:46:00Z
- **Tasks:** 3 (tracer 1 · auto 2, 셋 다 `tdd="true"`)
- **Files modified:** 12

## Accomplishments

- **NXT 에 등록된 VI 전략이 relay 에 존재하게 됐다.** `buildGetVITriggerReq(exchange)` 가 `get_strategy_req.key` 슬롯에 거래소를 싣고(서버 `Gateway::ProcessGetVITrigger` 가 그 문자열로 슬롯을 고른다), Ready 프리페치가 KRX·NXT 두 번 보낸다. 24·34 는 각 1회 그대로다.
- **거래소를 담지 않는 빈 61 의 귀속이 요청 순서로 정확해졌다.** C# `Client.cs:2187-2214`/`:3038` 의 규약 (a)~(d) 를 그대로 이식했다: 빈 응답은 head 를 꺼내 귀속, 본문 있는 응답은 **본문이 정본**이되 head 와 같을 때만 큐를 소비, 세션 교체 시 큐를 비운다. 응답 순서가 뒤바뀌어도 결과가 같다는 것을 테스트로 굳혔다.
- **귀속 실패의 기본 동작을 「지어내기」에서 「아무 말도 하지 않기」로 바꿨다.** 이전에는 근거가 없으면 `"KRX"` 라고 말했다. 이제 FIFO 가 비면 캐시를 고치지 않고 팬아웃도 하지 않는다 — 틀린 칸으로 귀속하면 사용자가 입력 중인 금액이 지워지기 때문이다 (T-17-16).
- **캐시·프레임·스냅샷이 전부 거래소별이 됐다.** `#viTriggers` 키가 `${userId}|${exchange}` 가 되고, 3상태(모름/미등록/등록) 판정이 거래소마다 독립이다. 인증 직후 스냅샷은 두 거래소를 각각 내리되 **모르는 거래소는 보내지 않는다**.
- **`vi.set` 이 거래소를 받고 미지 값은 끊는다.** 기존 `ExchangeSchema` 를 재사용했고(새 enum 금지 — T-17-19), 「생략 = KRX」는 `fanout.ts` 호출부 한 곳에서만 채운다. 조립기에는 기본값이 없다는 것을 grep 게이트와 테스트 양쪽으로 굳혔다.
- **양쪽 거래소의 접수 전 VI 주문이 더 이상 한 줄로 겹치지 않는다.** `viPendingKey` 에만 거래소를 더했고 **주문번호가 있는 행의 키는 건드리지 않았다** — 거기에 더하면 72 스냅샷과 73 델타의 키가 갈려 같은 주문이 두 줄로 남는다 (T-17-18).

## Task Commits

1. **Task 1 (tracer/TDD): VI 거래소 한 경로 — 파서 3종 · 조립기 · 프레임** — `b58a51b` (test)
   - RED 없음(구현이 이미 존재 — 아래 「TDD Gate Compliance」). 돌연변이 2건으로 테스트가 무는 것을 확인했다.
2. **Task 2 (TDD): Ready 프리페치 21 2회 + 요청 거래소 FIFO + 거래소별 캐시**
   - RED — `4f66fe1` (test)
   - GREEN — `484281f` (feat)
   - REFACTOR — 없음 (변경할 것이 없었다. tdd.md 규약대로 변경이 없으면 커밋하지 않는다)
3. **Task 3 (TDD): `vi.set` 거래소 수용 + VI 접수 전 상관 키에 거래소**
   - RED — `328fb7b` (test)
   - GREEN — `52f1a46` (feat)
   - REFACTOR — 없음

**Plan metadata:** 이 SUMMARY 커밋.

**측정된 커밋 수:** `git rev-list --count d43087d..HEAD` = **5** (서술이 아니라 측정값이다).

## Files Created/Modified

- `relay/src/dma/envelope.ts` — `buildGetVITriggerReq(exchange)` 신설(빈 Envelope → `get_strategy_req{key}`), `buildBareRequest` 주석을 24/34 전용으로 좁힘
- `relay/src/hub/subscription-hub.ts` — `viTriggerKey` · `VI_PREFETCH_EXCHANGES` · `#pendingViGets` FIFO · `#onViTrigger` 귀속 규약 (a)~(d) · `getViTrigger(userId, exchange)` · `#clearCaches`/`closeAll` 의 FIFO·거래소별 캐시 폐기 · `viPendingKey` 에 거래소
- `relay/src/ws/fanout.ts` — `VI_SNAPSHOT_EXCHANGES` 루프로 인증 스냅샷 2프레임
- `relay/src/ws/protocol.ts` — `RelayViSetSchema.exchange` (optional, `ExchangeSchema` 재사용)
- `relay/src/ws/order-handler.ts` — `getViTrigger(userId, notice.exchange)` (통보가 실어 온 거래소의 전략에서 계좌를 읽는다)
- `relay/tests/helpers/frames.ts` — VI 빌더 3종에 `exchange` optional(생략 = 슬롯 부재)
- `relay/tests/helpers/fake-gateway.ts` — `readViSetRequest` 가 `exchange` 원문 반환, `readGetVITriggerExchange` 신설
- `relay/tests/strategy-hub.test.ts` — ①·② 갱신, ①-2~①-6 · ⑦-x/y/z 신설, `FakeSession.sentPayloads`/`viGetExchanges()`
- `relay/tests/fanout.test.ts` — ⑬·⑭ 거래소별로 갱신, ⑰-c 신설
- `relay/tests/protocol.test.ts` — ①-vi 신설
- `relay/tests/ws-latch.test.ts` — ③-3 기준선 교체 (아래 참조)
- `relay/src/dma/__tests__/envelope.test.ts` — ⑥-c·⑥-d 신설, ⑨ 불변식 갱신

## Decisions Made

1. **귀속 근거가 없으면 아무 칸도 건드리지 않는다.** C# 규칙 (a) 가 큐가 비면 `RequestedKey` 를 `""` 로 두고 「어느 행도 건드리지 않는다」로 끝내는 것과 같다. 17-CONTEXT 의 「서버 진실은 클라이언트가 재계산하지 않는다」가 여기서도 같은 답을 준다 — 근거 없는 귀속은 재계산보다 나쁘다(추측이다).
2. **본문 있는 61 도 head 와 같을 때만 FIFO 를 소비한다.** 무조건 소비하면 Set 에코·Disable 에코·11.2 푸시가 큐를 밀어 다음 빈 61 이 한 칸 어긋난다. 무조건 안 하면 KRX 등록본이 온 뒤의 빈 61 이 아직 살아 있는 KRX head 를 먹고 NXT 가 KRX 로 귀속된다. **둘 다 틀리고 (b)/(c) 만 맞다.**
3. **`requestStrategySnapshot` 의 21 2회를 루프로 두었다.** 계획서의 acceptance 는 "호출이 2회 있다" 였고 문자열로는 1회다. 복붙 두 줄 대신 `VI_PREFETCH_EXCHANGES` 루프를 쓴 이유는 **요청 순서와 FIFO push 순서가 구조적으로 어긋날 수 없게** 하기 위해서다(계획서 스스로 "여기 순서와 FIFO 순서가 어긋나면 두 칸이 통째로 바뀐다"고 경고한 그 지점이다). 실제 요청 2건은 `strategyReqCount === 2` 와 `viGetExchanges() === ["KRX","NXT"]` 로 **행동으로** 단언한다.
4. **`viOrderKey` 는 바꾸지 않았다.** 계획서 지시 그대로이며, 회귀 테스트 ⑦-y 로 굳혔다.
5. **`order-handler.strategyOf` 는 통보의 거래소로 전략을 찾는다.** 계획서에 없던 결선이지만 `getViTrigger` 시그니처 변경이 강제하는 선택이고, 거래소를 지어내 고르면 NXT 발주의 감사 행에 KRX 계좌가 남는다.

## Deviations from Plan

### 의도적 불변식 변경 (조용히 고치지 않고 여기 적는다)

**1. 「본문 없는 요청 3종(24/21/34)」 → 「2종(24/34)」 — `envelope.test.ts` ⑨**
- **Found during:** Task 2 (GREEN)
- **Issue:** ⑨ 는 `buildGetVITriggerReq()` 산출물의 `getStrategyReq()` 가 `null` 임을 단언하던 **기존 불변식**이다. 21 에 거래소를 실으면 필연적으로 깨진다.
- **판단:** 계획서 재량이 아니라 **서버 정본이 결정한다.** `Gateway::ProcessGetVITrigger`(`Gateway.cpp:2974-2983`) 는 `get_strategy_req.key` 문자열로 조회할 거래소 슬롯을 고르고, `StockDMA.fbs:642-648` 이 "`GetVITriggerReq(21)` 에서는 거래소 문자열" 이라고 못박는다. 본문을 비우면 서버가 KRX 로 접으므로 **NXT 슬롯은 영원히 조회되지 않는데 msg_type 카운터는 2 로 정상처럼 보인다.** 계획서의 acceptance(`buildBareRequest` grep 0)도 같은 결론이다.
- **Fix:** ⑨ 를 「24·34 는 본문 없음(+`getStrategyReq()` 도 null) · 21 은 KRX/NXT 각각 key 를 싣는다」로 다시 썼다. 제목도 사실에 맞게 고쳤다.
- **Committed in:** `484281f`

**2. `ws-latch.test.ts` ③-3 기준선 교체 (17-04 가 남긴 판단)**
- **Found during:** Task 2 (GREEN)
- **이전:** 「래치 3연타 뒤에도 빈 61 은 `{t:"vi", x:"KRX", cfg:null}`」 — 17-04 가 **17-05 이전의 현행 동작**을 기준선으로 박아 두고 판단을 넘긴 자리다(그 주석에 명시돼 있다).
- **지금:** 「래치 3연타 뒤 **귀속 근거가 없는** 빈 61 은 어느 칸도 건드리지 않는다」.
- **왜 바뀌는가:** 스텁 게이트웨이는 21 두 건에 모두 자동 응답하므로(무응답 금지 규약 재현) 인증 시점에 FIFO 가 이미 비워진다. 그 뒤에 온 빈 61 은 짝지을 21 이 없다.
- **왜 느슨해진 것이 아닌가:** 원래 검증 의도인 「래치 키가 VI 귀속을 오염시키지 않는다」는 **그대로 유지되고 더 좁아진다** — 래치 키가 쓰이지 않는다는 것을 "KRX 로 폴백했다" 가 아니라 "아무 칸도 건드리지 않았다" 로 확인하기 때문이다. 테스트는 프리페치가 남긴 2프레임(KRX/NXT)을 먼저 `toEqual` 로 고정한 뒤, 3연타+빈 61 이후 **프레임 수가 늘지 않음**과 `lc` 누출 0 을 단언한다.
- **Committed in:** `484281f`

### Auto-fixed Issues

**3. [Rule 3 - Blocking] `getViTrigger` 시그니처 변경이 `order-handler.strategyOf` 를 깨뜨렸다**
- **Found during:** Task 2 (GREEN)
- **Issue:** `OrderNoticeSource.getViTrigger(userId)` 로는 거래소별 캐시에서 아무것도 못 찾는다(키 미스 → 언제나 `undefined`). 자동주문 통보의 계좌 출처가 조용히 사라진다.
- **Fix:** 인터페이스를 `(userId, exchange)` 로 넓히고 호출부가 `notice.exchange`(파서가 이미 채우는 값)를 넘긴다.
- **Files modified:** `relay/src/ws/order-handler.ts`
- **Verification:** relay typecheck · typecheck:tests · 467 green
- **Committed in:** `484281f`

**4. [Rule 3 - Blocking] `strategy-hub` ①·② 의 「21 1회」 단언이 새 동작과 정면으로 어긋났다**
- **Found during:** Task 2 (GREEN)
- **Issue:** 계획서 action ⑥ 이 지시한 갱신 대상이다. ② (재접속 재조회)도 같은 이유로 2 가 된다 — 한쪽만 다시 조회하면 그 칸만 최신이 된다.
- **Fix:** ① 을 「전략 조회 4건 = 24·34 각 1회 + 21 2회」로, ② 를 「재접속에서도 21 은 2회」로 갱신하고 파일 머리 주석도 사실에 맞췄다.
- **Committed in:** `484281f`

**5. [Rule 3 - Blocking] `fanout` ⑬·⑭ 가 `getViTrigger(userId)` 로 캐시를 기다리다 타임아웃**
- **Found during:** Task 2 (GREEN)
- **Fix:** 거래소 인자를 넘기고, 각 시나리오의 **정확한 기대치**로 좁혔다 — ⑬ 은 스텁이 두 21 에 같은 KRX 본문으로 답하므로 KRX 만 채워지고 NXT 는 「모름」이라 `vi` 프레임 1건, ⑭(A) 는 빈 61 두 건이 각각 귀속되므로 `[{x:"KRX"},{x:"NXT"}]` 2건.
- **Committed in:** `484281f`

---

**Total deviations:** 2 의도적 불변식 변경 + 3 auto-fixed (전부 blocking)
**Impact on plan:** 불변식 2건은 서버 정본과 계획서 acceptance 가 함께 요구한 것이고 SUMMARY 에 근거를 남겼다. blocking 3건은 시그니처 변경의 필연적 파급이며 범위를 넓히지 않았다. 계획서가 배정한 `<behavior>` 항목은 전부 테스트로 남아 있다.

## 계획서와의 차이 (범위 관련)

- **Task 1 의 실질 작업은 테스트였다.** 계획서는 Task 1 에 파서 3종·조립기·`{t:"vi",x}` 프레임을 배정했지만, **17-01 이 자기 deviation #2 로 그 셋을 이미 채워 두었다**(17-01-SUMMARY 에 "17-02·17-05 는 파서 층이 이미 채워진 상태에서 시작한다"고 명시). 남은 일은 테스트 헬퍼 확장과 `<behavior>` 단언이었고, 그래서 Task 1 커밋 타입이 `feat` 가 아니라 `test` 다.
- **Task 1 `<behavior>` 6번("`exchange` 미지정으로 조립하면 게이트웨이가 읽은 값이 `"KRX"`")은 조립기 층에서 표현할 수 없다.** `ViTriggerInput.exchange` 는 필수이고 **조립기에 기본값을 두지 않는 것이 같은 Task 의 acceptance** 다. 「미지정 = KRX」가 실제로 일어나는 곳은 `vi.set` 호출부이므로 Task 3 `<behavior>` 2번과 같은 단언이고, `fanout.test.ts` ⑰-c ② 가 그것을 와이어 바이트로 확인한다.
- **Task 2 acceptance 「`requestStrategySnapshot` 본문에 `buildGetVITriggerReq` 호출이 2회」는 문자열로 1회다** — 루프로 돌린다(위 Decisions 3). 행동 단언 2건으로 대체 검증했다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 | — (아래 참조) | — | — | 구현 선행 (17-01) |
| Task 2 | ✓ `4f66fe1` | ✓ `484281f` | — (변경 없음) | Pass |
| Task 3 | ✓ `328fb7b` | ✓ `52f1a46` | — (변경 없음) | Pass |

**커밋 순서가 RED→GREEN 쌍이 아니라 `test, test, feat, test, feat` 다.** Task 1 이 `test` 단독으로 끝나기 때문이고(아래), Task 2·3 은 각각 정상 쌍이다.

### Task 1 은 RED 를 만들 수 없었다 — 지어내지 않고 돌연변이로 확인했다

tdd.md 「Fail-Fast Rules」 1번(Unexpected GREEN)이 요구하는 **조사**를 먼저 했다: 파서 3종의 `fromWireExchange` 호출과 기본값 없는 `buildSetVITriggerReq` 는 **17-01 커밋 `6bd5429` 에 이미 있었다**(17-01-SUMMARY deviation #2). 즉 「테스트가 틀렸다」가 아니라 「기능이 이미 존재한다」 쪽이다.

RED 를 억지로 만들려면 멀쩡한 구현을 되돌렸다가 복원해야 하는데, 그것은 게이트가 검사하려던 증거를 연출하는 일이라 하지 않았다. 대신 **돌연변이 검사 2건**으로 테스트가 실제로 무는지 확인했다(17-02·17-04 선례):

| 돌연변이 | 결과 |
|---|---|
| `parseViTrigger` 의 `exchange: fromWireExchange(...)` → `exchange: "KRX"` 고정 | ⑥-d **실패** (1 failed / 456 passed) |
| `buildSetVITriggerReq` 의 `SetVITrigger.addExchange(b, exchangeOff)` 제거 | ⑥-c **실패** (1 failed / 456 passed) |

둘 다 복원 후 `git diff --stat` 차이 0 을 확인했다.

### RED 증거 — Task 2 (#3770 실질 요건 충족)

| 항목 | 값 |
|---|---|
| command | `npx vitest run tests/strategy-hub.test.ts` (cwd `relay`) |
| exit code | `1` |
| target tests | ①-2 · ①-3 · ①-4 · ①-5 · ①-6 (5건) |
| 실패 형태 | **전부 단언 실패** — `expected 1 to be 2` · `expected {…} to be null` · `expected null to match object { exchange: 'NXT', run: true }` · `expected null to be undefined` ×2 |
| 집계 | 21건 중 **5 실패 / 16 통과** |

### RED 증거 — Task 3

| 항목 | 값 |
|---|---|
| command | `npx vitest run tests/strategy-hub.test.ts tests/protocol.test.ts tests/fanout.test.ts` (cwd `relay`) |
| exit code | `1` |
| target tests | ①-vi · ⑰-c · ⑦-x (3건) |
| 실패 형태 | **전부 단언 실패** — `expected 'KRX' to be 'NXT'` · `expected undefined to be 'NXT'` · `expected [ {…} ] to have a length of 2 but got 1` |
| 집계 | 96건 중 **3 실패 / 93 통과** |

로드 실패·0건 발견·unexpected green 어느 쪽도 아니다. 실패한 건은 전부 계획된 behavior 에 대한 단언이고, 나머지가 정상 통과했다는 것이 「픽스처가 깨진 게 아니다」의 증거다. (⑦-y·⑦-z 는 RED 시점에도 통과했다 — 그 둘은 **바뀌면 안 되는 것**을 지키는 회귀 그물이다.)

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다 (도구 갭 — 보고 대상, 17-01 이 원인까지 특정했다).** `parseNodeTestSummary` 가 `node --test` 의 `# tests/# pass/# fail` 푸터로만 집계를 읽는데 vitest 의 tap 리포터는 그 푸터를 출력하지 않아 언제나 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내는 것은 증거 위조이므로 하지 않았고, 대신 위 표로 실질 증거를 남긴다.

## Issues Encountered

- **API 연결 오류로 Task 2 GREEN 도중 실행이 끊겼다 (2026-09-18 → 09-20 재개).** 작업 손실은 없었다 — RED 커밋 2건(`b58a51b`·`4f66fe1`)은 이미 착지해 있었고 미커밋 구현(`envelope.ts` +39 / `subscription-hub.ts` +77)이 워킹 트리에 그대로 남아 있었다. 재개 시점의 테스트는 10 failed / 452 passed 였고, 그 중 `envelope.test.ts` ⑨ 는 새 RED 케이스가 아니라 **기존 불변식**이라 별도로 판단해 위 「의도적 불변식 변경 1」로 처리했다. `git stash`·`reset --hard` 는 쓰지 않았다.
  - 그 결과 **커밋 순서가 엄밀한 RED→GREEN 쌍이 아니라 `test, test, feat, test, feat` 가 됐다.** Task 2 의 RED 와 GREEN 사이에 이틀이 끼어 있으나 두 커밋의 내용·순서는 규약대로다.
- **`duration` 은 벽시계로 1h 9m 이 아니라 중단 시간을 뺀 실작업 시간이다** — 중단 구간을 포함하면 이틀이 되어 계측값으로 쓸모가 없다.
- 그 밖의 문제 없음. 상류 게이트 2종 모두 통과: 17-03 의 `fanout.test.ts` ⑭-3 `unhandledFrameCount() === 0`, 17-02 의 `protocol.test.ts` ② Q-ID tripwire.

## Known Stubs

없음. 변경한 `relay/src/**` 파일에 `TODO`/`FIXME`/placeholder 0건, 새로 넣은 skip/todo 테스트 0건.

**다만 phase 내 인계가 하나 있다 (스텁이 아니라 계획된 wave 경계):** relay 가 인증 스냅샷에서 `vi` 를 **2프레임**(KRX·NXT) 내리기 시작했는데 `webapp/src/lib/use-relay-socket.ts:448` 의 리듀서는 아직 `frame.x` 를 무시하고 `viTrigger` 한 칸을 덮는다. 두 칸 다 미등록이면 무해하지만, KRX 만 등록된 세션에서는 나중 프레임이 이길 수 있다. **거래소별 상태로 받는 것은 17-06 의 첫 항목**이며(17-06-PLAN `must_haves.truths` 1번), 그때까지 relay 는 배포하지 않는다(D-26 — 이 plan 은 배포 대상 코드를 바꿨지만 **배포하지 않았다**). `.planning/WINDOWS.md` 에 `deviation` 으로 기록했다.

## Threat Flags

없음 — 이 plan 이 만든 표면은 전부 `<threat_model>` 에 이미 등재돼 있고(T-17-16~T-17-19), 넷 다 `mitigate` 대로 처리했다. 신규 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경 0건.

## User Setup Required

없음 — 신규 의존성 0건, 외부 서비스 설정 변경 없음.

## Next Phase Readiness

**17-06(웹 표면)이 바로 시작할 수 있다:**
- `{t:"vi", x:"KRX"|"NXT", cfg}` 가 인증 직후 **거래소별로** 온다. 「모르는 거래소는 오지 않는다」는 3상태 규율이 그대로이므로 리듀서는 `x` 를 키로 두고 도착한 것만 채우면 된다.
- `vi.set` 에 `exchange` 를 실으면 그대로 발주 거래소가 된다. 생략하면 KRX 다(기존 화면 무변경).
- `RelayViOrderItem.exchange` 가 채워져 있고 접수 전 행도 거래소별로 분리돼 있어 거래소 열·행 키를 그대로 그릴 수 있다.
- **첫 항목으로 리듀서를 거래소별로 바꿔야 한다** (위 「Known Stubs」의 인계).

**주의:**
- 배포는 D-26 대로 장 마감(20:00 KST) 이후, 사용자 확인 뒤에. **17-06 전에 relay 만 단독 배포하면** 위 인계 때문에 VI 설정 카드가 잘못된 칸을 보일 수 있다.
- 실서버에서 21 두 건이 실제로 거래소별로 답하는지는 mock 게이트웨이(gh-trade `run-mac.sh`) 또는 실기로만 확인된다 (coverage D8 / D-25).

## Self-Check: PASSED

- 수정 파일 12건 전부 디스크에 존재 확인 (신규 생성 파일 0건 — 이 plan 은 기존 파일만 고쳤다)
- 커밋 5건 전부 `git log` 에서 확인: `b58a51b` · `4f66fe1` · `484281f` · `328fb7b` · `52f1a46`
- `commits: 5` 는 `git rev-list --count d43087d..HEAD` 로 **측정**한 값이다(서술이 아니다)
- 모든 태스크 `<acceptance_criteria>` 재실행 통과 (Task 1: 6/6 · Task 2: 8/8 — 1건은 루프로 대체 검증, 위 Decisions 3 · Task 3: 5/5)
- plan `<verification>` 재실행 통과:
  - `pnpm --filter @gh-radar/relay run test` → **467 passed / 19 files** (baseline 455 대비 +12, 회귀 0)
  - `relay typecheck` · `typecheck:tests` · `webapp typecheck` · `shared build` 전부 clean
  - `pnpm --filter @gh-radar/webapp run test` → **899 passed | 1 skipped / 71 files** (baseline과 동일 — 회귀 0)
  - `pnpm --filter @gh-radar/shared run test` → **108 passed / 9 files** (baseline과 동일)
  - Ready 프리페치 24·34 각 1회 · 21 2회(key KRX/NXT) 단언 통과

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-20*
