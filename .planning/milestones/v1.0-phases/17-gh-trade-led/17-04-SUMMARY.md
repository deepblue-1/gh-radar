---
phase: 17-gh-trade-led
plan: 04
subsystem: api
tags: [flatbuffers, relay, dma, gh-trade, protocol, limit-chaser, latch, zod, tdd]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 `MSG.ArmSellLatchReq(36)`/`ArmCancelLatchReq(37)`/`ArmBuyLatchReq(38)` 상수 · 재생성된 `get-strategy-req` 접근자 · shared 인바운드 계약 `RelayLcArmMsg` · 미결선 `lc.arm` error 가드"
  - phase: 17-gh-trade-led
    provides: "17-02 의 Q-ID 회귀 그물(인바운드 주문번호에 형식 제한을 넣지 말라는 tripwire) · 리터럴 픽스처 관례"
  - phase: 17-gh-trade-led
    provides: "17-03 의 hub `unhandledFrameCount()` 드롭 0 게이트 · 명시 `case` 규율"
provides:
  - "인바운드 `lc.arm` 결선 — `{t:\"lc.arm\", key, latch}` 1건이 36/37/38 Envelope 으로 게이트웨이에 도달한다"
  - "`RelayLcArmSchema` (빈 키 거부 · `latch` 3값 · 64B 상한) 와 `RelayInboundSchema` 10종 유니온"
  - "`buildArmLatchReq(msgType, key)` — `get_strategy_req{key}` 슬롯을 실제로 채우는 조립기 (`buildBareRequest` 금지)"
  - "`ArmLatchMsgType` — 36/37/38 만 받는 좁힌 타입 (엉뚱한 msg_type 을 컴파일 타임에 차단)"
  - "`protocol.ts` 술어 3종 `isValidIsin`/`isValidAccountNo`/`isRelayExchange` — 전략 키 조각 판정을 zod 스키마 하나에서 재사용"
  - "fanout `#armLatchAccount` — 전략 키 분해 + 형식 관문 (파싱 지점 1곳)"
  - "테스트 리더 `readArmLatchRequest(msgType, payload)` — 36/37/38 의 `get_strategy_req.key` 디코드"
  - "`relay/tests/ws-latch.test.ts` 19케이스 — 왕복 6 · 가드 8 · 실패 경로 5"
affects: [17-05, 17-07, 17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 10645
  tasks: 3
  commits: 4
plan_head_before: 7aad162e83ae0bacf912b4ac611e770e9ad6f053

tech-stack:
  added: []
  patterns:
    - "한 문자열에 붙어 오는 복합 키는 **술어로** 조각 판정을 재사용한다 — 정규식·상한을 두 파일에 적으면 경로별로 갈린다"
    - "서버가 쥔 전제(무장 여부)는 relay 가 재판정하지 않는다 — 캐시가 한 틱 낡으면 「서버는 되는데 relay 가 막는」 상태가 된다"
    - "거부 케이스는 언제나 「게이트웨이 수신 프레임 0」과 함께 단언한다 — 거부 로그만으로는 미송신을 알 수 없다"
    - "슬롯을 공유하는 요청은 msg_type 만 세면 안 된다 — 본문을 디코드해야 빈 요청과 구분된다"

key-files:
  created:
    - relay/tests/ws-latch.test.ts
  modified:
    - relay/src/ws/protocol.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/fanout.ts
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "무장 전제(36 `IsSellArmed` · 37 `IsCancelArmed ∧ HasPendingBuy` · 38 `IsBuyArmed ∧ side==\"1\"`)를 relay 가 재판정하지 않는다 — 서버가 한글 사유로 거부하고 relay 는 그 문구를 나르기만 한다"
  - "전략 키 조각 판정은 `protocol.ts` 의 zod 스키마를 재사용하는 술어 3종으로 두었다 — 정규식·상한을 `fanout.ts` 에 다시 적으면 `lc.set` 경로와 비대칭이 생긴다"
  - "`key` 상한 64B 는 `strategies.disable` 과 같은 값(서버 WR-09) — 목적은 왕복 절약이 아니라 로그 폭 봉쇄다 (T-16-06)"
  - "`ARM_LATCH_MSG_TYPE` 을 `Record<RelayLcArmMsg[\"latch\"], ArmLatchMsgType>` 로 못박았다 — 계약에 넷째 래치가 생기면 여기가 먼저 컴파일 에러다"
  - "Task 2 는 RED 없이 착지했다 — 가드는 Task 1 tracer 가 자기 action ③ 대로 이미 결선했고, 중복 커밋을 지어내는 대신 돌연변이 검사로 테스트가 실제로 문다는 것을 확인했다 (17-02 선례)"

patterns-established:
  - "Pattern 1: 요청 테이블을 **재사용**하는 msg_type 은 조립기를 따로 만든다 — `buildBareRequest` 로 보내면 프레임은 나가지만 서버가 「전략 없음」으로 거부하고, msg_type 카운터는 그 실패를 잡지 못한다"
  - "Pattern 2: 인바운드 거부 로그에는 `latch` 와 사유만 — 전략 키 안에 계좌번호가 있으므로 **키째 싣는 것도 금지**다 (T-16-45)"

requirements-completed: [TRADE-05]

coverage:
  - id: D1
    description: "브라우저의 `lc.arm` 1건이 `get_strategy_req.key` 를 채운 36/37/38 Envelope 으로 그 사용자의 DMA 세션에 도달한다 (D-04)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-1 latch:\"sell\" 은 msg_type 36 으로 나가고 get_strategy_req.key 가 전략 키다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-2 latch:\"cancel\" 은 msg_type 37 로 나간다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-3 latch:\"buy\" 는 msg_type 38 로 나간다"
        status: pass
      - kind: other
        ref: "sed -n '/export function buildArmLatchReq/,/^}/p' relay/src/dma/envelope.ts | grep -c buildBareRequest → 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "빈 키와 세 값 밖의 `latch` 는 zod 가 끊는다 — 게이트웨이로 0바이트 (C# `SendArmSellLatch` 송신 취소 동형)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-4 세 값 밖의 latch 는 zod 가 거부하고 게이트웨이로 0바이트다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-5 빈 key 는 zod 가 거부하고 게이트웨이로 0바이트다 (C# SendArmSellLatch 동형)"
        status: pass
    human_judgment: false
  - id: D3
    description: "가드가 `lc.set` 과 동형이고 두 벌이 아니다 — Ready 세션 · 전략 키 형식 3종 · 세션 계좌 (T-17-11 / T-17-12)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-1 세션이 Ready 가 아니면 lc.arm 은 게이트웨이로 0바이트다 (T-17-12)"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-2 dma_credentials 미등록 사용자의 lc.arm 도 0바이트다 (D-04)"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-3 3토막이 아닌 key 는 거부되고 게이트웨이로 0바이트다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-4 ISIN 이 12자가 아닌 key 는 거부되고 게이트웨이로 0바이트다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-5 exchange 가 KRX/NXT 밖이면 거부되고 게이트웨이로 0바이트다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-7 세션 계좌 목록 밖 계좌의 lc.arm 은 게이트웨이로 0바이트다 (T-17-11)"
        status: pass
    human_judgment: false
  - id: D4
    description: "거부 로그에 계좌번호도 전략 키도 싣지 않는다 (T-16-45 / T-17-15)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-6 형식 거부 로그에 계좌번호를 싣지 않는다 — latch 와 사유뿐이다 (T-16-45)"
        status: pass
    human_judgment: false
  - id: D5
    description: "`lc.arm` 은 기존 인바운드 토큰 버킷을 공유한다 — 별도 버킷이 아니다 (T-17-13)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#②-8 lc.arm 은 다른 인바운드와 **같은 버킷**을 쓴다 — 합계가 상한이다 (T-17-13)"
        status: pass
    human_judgment: false
  - id: D6
    description: "결과는 기존 60 에코가, 실패는 기존 54 한글 문구가 말한다 — relay 가 문구를 고치지 않고 전용 ack 프레임도 만들지 않는다 (D-04 / D-36)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#①-6 60 에코는 기존 `lc` 프레임으로 돌아온다 — 새 t 값이 생기지 않는다"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#③-1 sell/cancel/buy 래치 거부는 서버 한글 문구 그대로 기존 msg 경로로 온다 (3케이스)"
        status: pass
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#③-2 래치 왕복에서 브라우저가 받는 t 는 lc 와 msg 뿐이다 — 전용 ack 프레임이 없다"
        status: pass
    human_judgment: false
  - id: D7
    description: "래치 요청이 pending-key FIFO 를 오염시키지 않는다 (Pitfall 3 / T-17-14)"
    requirement: TRADE-05
    verification:
      - kind: integration
        ref: "relay/tests/ws-latch.test.ts#③-3 lc.arm 3연타 뒤 빈 61 은 여전히 미등록으로 귀속된다 — FIFO 가 오염되지 않았다"
        status: pass
    human_judgment: false
  - id: D8
    description: "실기(mock 게이트웨이 `run-mac.sh` · 실서버) 에서 래치 클릭 왕복이 실제로 켜고 꺼지는지 — 서버가 토글을 어떻게 판정하는지는 실기로만 확정된다"
    verification: []
    human_judgment: true
    rationale: "가짜 게이트웨이는 36/37/38 을 받아 기록만 하고 서버의 토글·전제 판정을 흉내 내지 않는다(그것을 흉내 내면 스텁의 해석이 프로덕션의 정답지가 된다). LED 가 붙는 17-11 이후 D-25 에 따라 사용자 관찰로 닫힌다."

# Metrics
duration: 14 min
completed: 2026-09-18
status: complete
---

# Phase 17 Plan 04: 상따 래치 수동 점등 경로 Summary

**브라우저의 `lc.arm` 1건이 `get_strategy_req{key}` 를 채운 36/37/38 Envelope 으로 게이트웨이에 도달하고, 성공은 기존 60 에코가·실패는 기존 54 한글 문구가 말하는 전송 계층을 왕복 테스트 19케이스로 굳혔다**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-18T03:03:00Z
- **Completed:** 2026-09-18T03:17:00Z
- **Tasks:** 3 (tracer 1 · auto 2)
- **Files modified:** 5 (신규 1)

## Accomplishments

- **17-01 이 남긴 미결선 가드가 실제 경로로 바뀌었다.** `lc.arm` 은 계약에만 있고 zod 유니온에 없어 런타임에 도달할 수 없었다. `RelayLcArmSchema` 를 유니온에 넣고 `fanout` 분기를 `lc.set` 바로 뒤에 결선하면서, 도달 불가를 알리던 `logger.error` 가드를 **걷어냈다** — 둘을 함께 두면 다음 사람이 어느 쪽이 진짜인지 모른다.
- **조립기가 슬롯을 실제로 채운다.** 36/37/38 은 `get_strategy_req` 를 **재사용**하는 것이지 비워 보내는 21 계열이 아니다. `buildBareRequest` 로 보내면 프레임은 나가지만 서버가 「등록된 상따 전략이 없습니다」로 거부하고, **msg_type 만 세는 검증은 그 실패를 통과시킨다**(Pitfall 2). 그래서 테스트 리더(`readArmLatchRequest`)도 본문을 디코드해 키를 꺼내도록 만들었다.
- **가드가 한 벌이다.** 계좌 대조는 `lc.set` 이 부르는 **같은 `#accountAllowed`** 를 부른다. 전략 키 조각 판정(ISIN·계좌·거래소)은 `protocol.ts` 의 zod 스키마를 재사용하는 술어 3종으로 뽑아, `fanout.ts` 에 정규식을 다시 적지 않았다 — 두 벌이면 한쪽만 고쳐져 「한 경로로는 통과하고 다른 경로로는 막히는」 비대칭이 조용히 생긴다.
- **무장 전제를 relay 가 재판정하지 않는다.** 36/37/38 의 전제는 서버가 쥔 전략 상태이고, relay 의 에코 캐시로 그것을 다시 판정하면 캐시가 한 틱 낡은 순간 「서버는 켤 수 있는데 relay 가 막는」 상태가 만들어진다. 전제 불충족은 서버가 한글 사유(54)로 거부하고 그 문구가 **한 글자도 고쳐지지 않은 채** 기존 `msg` 경로로 내려간다 — 그것을 gh-trade `Gateway.cpp` 원문 3건과 **문자열 동등 비교**로 굳혔다.
- **거부는 언제나 「나간 프레임 0」과 함께 단언했다.** 래치 ON 은 발주 판정을 시작시키므로 잘못 나간 프레임 하나가 남의 전략을 무장시킨다(T-17-11). 거부 로그만 보면 실제로 안 나갔는지 알 수 없어, 6개 거부 케이스 전부에 게이트웨이 수신 0 단언을 붙였다.

## Task Commits

1. **Task 1 (tracer, TDD): `lc.arm` 한 경로**
   - RED — `ea05d07` (test) — 4 failed / 438 passed
   - GREEN — `1e3c5fe` (feat) — 442 passed
   - REFACTOR — 없음 (조립기·분기 모두 최소 형태라 정리할 것이 없었다. tdd.md 규약대로 변경이 없으면 커밋하지 않는다)
2. **Task 2: 가드 3종 동형 확인** — `6e199ab` (test) — 450 passed
3. **Task 3: 실패 경로 회귀** — `8b75294` (test) — 455 passed

**Plan metadata:** 이 SUMMARY 커밋.

## Files Created/Modified

- `relay/tests/ws-latch.test.ts` (신규, 535줄) — 왕복 6 · 가드 8 · 실패 경로 5, 총 19케이스
- `relay/src/ws/protocol.ts` — `RelayLcArmSchema` · 유니온 10종 · 키 조각 술어 3종(`isValidIsin`/`isValidAccountNo`/`isRelayExchange`)
- `relay/src/dma/envelope.ts` — `ArmLatchMsgType` · `buildArmLatchReq`, `buildBareRequest` 주석에 「36/37/38 에 쓰지 않는다」 명시
- `relay/src/ws/fanout.ts` — `ARM_LATCH_MSG_TYPE` 상수 객체 · `lc.arm` 분기 · `#armLatchAccount` 키 분해 헬퍼 · 미결선 error 가드 제거
- `relay/tests/helpers/fake-gateway.ts` — `readArmLatchRequest`

## Decisions Made

1. **무장 전제는 서버 몫이다.** `lc.set` 의 ②-1 시장 해석과 ②-2 무장 가드를 래치 경로에 **적용하지 않았다**. 래치 요청 본문은 전략 키 하나뿐이라 `market` 도 게이트 값도 없고, 전제의 정본은 서버가 쥔 전략 상태다. 17-CONTEXT 의 「서버 진실은 클라이언트가 재계산하지 않는다」를 전송 계층에도 적용한 것이다.
2. **「매도잔량 기준 매수 래치 클릭 불가」의 서버측 정본을 테스트에 박았다.** 사용자 결정은 UI 만의 규칙이 아니다 — 서버가 `매도잔량 기준에서는 매수 진입 확인 래치가 없습니다 …` 로 거부하고(`Gateway.cpp:3216`, BL-01), relay 는 그 문구를 나른다. 클릭 불가 UI 가 우회되더라도(직접 wss·옛 탭) 래치가 켜지지 않는다는 보장은 **여기가 아니라 서버**에 있고, 그 사실을 ③-1 이 문자열로 굳혔다.
3. **키 상한을 64B 로 두었다.** `strategies.disable` 과 같은 값(서버 WR-09)이고 실제 최대는 29B 다. 목적은 왕복 절약이 아니라 로그 폭 봉쇄다(T-16-06).
4. **`ARM_LATCH_MSG_TYPE` 을 `Record` 로 못박았다.** 값이 셋뿐이라 if 사슬을 만들지 않았고, 키 집합을 계약(`RelayLcArmMsg["latch"]`)에 묶어 넷째 래치가 생기면 여기가 먼저 컴파일 에러가 되게 했다.
5. **`readArmLatchRequest` 는 `null`(36/37/38 이 아니거나 요청 테이블 없음)과 `""`(테이블은 있는데 키가 빔)를 구분한다.** 둘을 뭉개면 「빈 요청을 보냈다」는 실패 모드가 「보내지 않았다」와 같아 보인다.

## 상위 wave 가 남긴 tripwire 점검

- **17-02 의 Q-ID 회귀 그물 (`relay/tests/protocol.test.ts`)** — 이 plan 은 `RelayOrderCancelSchema.orgOrderNo` · `RelayViConfirmSchema.orderNo` 를 **건드리지 않았다**. 새 상한은 `RelayLcArmSchema.key` 에만 붙었고, 10자 `Q...` 주문번호 단언은 그대로 통과한다(relay 455 green).
- **17-03 의 hub `unhandledFrameCount()` 게이트 (`relay/tests/fanout.test.ts` ⑭-3)** — 이 plan 은 **인바운드(C→S) 화이트리스트만** 넓혔고 수신 화이트리스트(`INBOUND_MSG_TYPES`)는 22종 그대로다. hub `case` 추가가 필요 없고 게이트는 green.
- **`#allowInbound` 버킷 공유** — `lc.arm` 은 `#onAuthedMessage` 맨 앞에서 `msg.t` 로 이미 같은 버킷을 탄다. 별도 버킷을 만들지 않았고, 그 사실을 ②-8 이 「`vi.confirm` 5건 뒤 래치 10건 → 통과 5건」으로 증명한다.

## Deviations from Plan

### 계획서와의 차이

**1. Task 2 가 RED 없이 착지했다**
- **Found during:** Task 2
- **Issue:** Task 2 는 `tdd="true"` 지만, 6개 가드는 Task 1(tracer) 의 action ③ 이 이미 「키 분해 후 `#accountAllowed`」를 지시했고 그 커밋에서 결선됐다. Task 2 의 테스트 8건은 작성 즉시 전량 통과했다 — 실패하는 RED 를 만들려면 방금 넣은 가드를 일부러 빼야 하는데, 그것은 굳히려는 규율 자체를 잠시 부수는 짓이다.
- **Fix:** 중복 커밋을 지어내지 않고 **돌연변이 검사**로 테스트가 실제로 무는지 확인했다 — `#armLatchAccount` 에서 `!isValidIsin(isin)` 한 줄을 제거하자 ②-4 만 정확히 깨졌고(1 failed / 449 passed), 되돌린 뒤 다시 green. 커밋은 `test(17-04)` 로 남겼다(17-02 가 「파서 층은 17-01 이 이미 채웠다」를 다룬 것과 같은 처리).
- **Verification:** 돌연변이 1건 → ②-4 단독 실패 → 복원 후 450 passed
- **Committed in:** `6e199ab`

**2. `③-3` FIFO 회귀는 「현행 동작 기준선」이다**
- **Found during:** Task 3
- **Issue:** 계획서는 「빈 61 이 VI 조회 FIFO 에서 정상 귀속되는지」를 단언하라고 했지만, relay 에는 **아직 FIFO 가 없다**(`subscription-hub.ts:993` 이 「요청 거래소 FIFO 로 귀속하는 것은 17-05 다」라고 적어 두었다). 지금 빈 61 의 귀속은 「거래소 정보가 없으므로 `"KRX"`」다.
- **Fix:** 계획서 ③ 의 단서(「17-05 가 21 을 2회 보내도록 바꾸기 **전**의 현행 동작을 기준으로 단언한다」)를 그대로 따라, `lc.arm` 3연타 뒤 빈 61 이 여전히 `{t:"vi", x:"KRX", cfg:null}` 로 오고 상따 에코로 새지 않음을 박았다. 이 단언이 오늘 잡는 것은 「래치가 귀속을 바꾸는 큐를 만들지 않았다」이고, **진짜 이빨은 17-05 가 FIFO 를 세우는 순간** 생긴다 — 그때 이 테스트가 먼저 말한다.
- **Files modified:** `relay/tests/ws-latch.test.ts`
- **Verification:** 455 passed
- **Committed in:** `8b75294`

**3. `authed()` 헬퍼가 인증 직후 스냅샷을 기다린다**
- **Found during:** Task 1 GREEN (①-6 첫 실패)
- **Issue:** 스냅샷(`lc.snap`·`vi`·`vi.list`)은 `state ready` **뒤에** 온다. 그것을 기다리지 않으면 「왕복에서 새 `t` 값이 생기지 않는다」 단언이 남은 스냅샷 프레임을 잉여 ack 로 오인한다 — 게이트가 자기 소음을 잡는 셈이 된다.
- **Fix:** `authed()` 가 프리페치 3종의 마지막 응답인 `vi.list` 까지 기다리고 `flushIo(30)` 하도록 했다. 테스트 하네스 변경이고 프로덕션 코드와 무관하다.
- **Files modified:** `relay/tests/ws-latch.test.ts`
- **Committed in:** `1e3c5fe`

### Auto-fixed Issues

**4. [Rule 1 - Bug] `protocol.ts` 헤더의 「9종뿐」이 거짓이 됐다**
- **Found during:** Task 1 (GREEN)
- **Issue:** D-11 주석이 「브라우저가 보낼 수 있는 것은 9종뿐 — 시세 3종 + 전략 4종 + 주문 2종」이라고 못박고 있는데, `lc.arm` 합류로 10종이 됐다. 신뢰 경계 파일의 계약 진술이 실제와 갈리면 다음 사람이 유니온을 세지 않고 주석을 믿는다.
- **Fix:** 「10종뿐 … 전략 5종」으로 갱신.
- **Files modified:** `relay/src/ws/protocol.ts`
- **Verification:** `RelayInboundSchema` 유니온 원소 10개와 일치
- **Committed in:** `1e3c5fe`

---

**Total deviations:** 3 계획서와의 차이(RED 미발생 1 · 기준선 해석 1 · 테스트 하네스 1) + 1 auto-fix(주석 정합)
**Impact on plan:** 범위 변화 없음. 계획서가 지시한 산출물 5종(스키마 · 조립기 · fanout 분기 · 리더 · 테스트)을 전부 냈고, 가드는 계획서가 요구한 대로 `lc.set` 과 한 벌이다.

## Issues Encountered

- **`pnpm --filter @gh-radar/relay test -- ws-latch` 의 `-- ws-latch` 는 파일 필터로 먹지 않는다** — vitest 가 전체 19파일을 돈다(2.4초라 실무상 문제없어 그대로 뒀다). 계획서의 verify 명령을 그대로 쓰되, 「ws-latch 만 돌았다」고 읽으면 안 된다.
- GSD `check tdd-red-evidence` 는 vitest 출력을 파싱하지 못한다(`node --test` TAP 전용). 위 「Task Commits」에 RED 증거(명령·종료코드·실패 건수·실패 형태)를 직접 남겼다.

## Known Stubs

없음 — 이 plan 이 만든 경로에 자리표시 값·미결선 분기가 없다. 17-01 이 남겨 둔 미결선 `lc.arm` 가드는 이 plan 이 **제거**했다.

## Threat Flags

없음 — 이 plan 이 넓힌 신뢰 경계는 계획서 `<threat_model>` 이 이미 등록한 인바운드 `lc.arm`(T-17-11~T-17-15) 하나이고, 다섯 건 전부 mitigate 로 처리·단언했다. 패키지 설치 0건(T-17-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **17-11(LED 결선)이 기다리던 전송 계층이 섰다.** 17-07 의 LED 칩이 클릭으로 `{t:"lc.arm", key, latch}` 를 올리면 그대로 36/37/38 이 나가고, 색은 60 에코가 되돌려 준다. 브라우저가 추가로 다룰 새 프레임 종류는 **없다**.
- **17-05 에 넘기는 것:** 빈 61 의 거래소 귀속 FIFO. `③-3` 이 「래치는 FIFO 에 아무것도 넣지 않는다」를 기준선으로 박아 두었으므로, 17-05 가 FIFO 를 세울 때 이 테스트가 회귀 그물로 작동한다.
- **실기 확인(D-25)은 열려 있다.** mock 게이트웨이(`run-mac.sh`)는 서버 HEAD 라 토글·전제를 실제로 판정한다 — LED 가 붙는 17-11 이후 클릭 왕복을 눈으로 확인해야 이 경로가 「켜고 꺼진다」까지 닫힌다.

## Self-Check: PASSED

- `relay/tests/ws-latch.test.ts` 존재 확인 — FOUND
- 커밋 4건(`ea05d07` · `1e3c5fe` · `6e199ab` · `8b75294`) 존재 확인 — FOUND
- 태스크 acceptance 전량 재실행 — PASS (`buildArmLatchReq` 1회 · `buildBareRequest` 0회 · `createString` 이 `startGetStrategyReq` 보다 앞 · `lc.arm` 분기의 `#accountAllowed` 1회 · `readArmLatchRequest` export)
- plan `<verification>` 재실행 — relay 455 passed / 19 files, webapp 899 passed·1 skipped / 71 files, shared build + relay typecheck + typecheck:tests + webapp typecheck 전부 종료코드 0

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-18*
