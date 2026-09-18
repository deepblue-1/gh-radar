---
phase: 17-gh-trade-led
plan: 02
subsystem: api
tags: [flatbuffers, relay, dma, gh-trade, protocol, parser, tdd]

# Dependency graph
requires:
  - phase: 17-gh-trade-led
    provides: "17-01 의 재생성 생성물 44+3파일 · shared 계약 전체 · 이미 채워진 파서 층(kc·bs·미체결 5필드)"
provides:
  - "주문통보 3필드 `ParsedOrderResp.board`/`requestKind`/`requester` — 게이트웨이 원문 그대로"
  - "브라우저 프레임 `RelayOrderMsg.bd`/`.rk`/`.rq` — 빈 값은 키째 생략"
  - "테스트 프레임 입력 11종: `FakeQuoteInput.krxClosePrice` · `FakeTapeEntryInput.bsCode` · `FakeUnfilled` 4필드 · `FakeOrderRespInput` 3필드"
  - "자동 게이트 3종: `message` 문구 파싱 0 · `buildDirectOrderReq` Phase 18 슬롯 송신 0 · 낯선 `bs_code` 로 프레임 드롭 0"
  - "Q-ID(10자) 취소·`vi.confirm` 통과 회귀 그물 — 앞으로 형식 제한이 들어오면 깨진다"
affects: [17-03, 17-04, 17-05, 17-06, 17-07, 17-08, 17-09, 17-10, 17-11, 17-12, phase-18]

# Actuals (#2632) — estimateTokens 스케일(chars/4, 실현 diff 기준)
actuals:
  tokens: 5736
  tasks: 3
  commits: 6
plan_head_before: 65eff4f1596a45cf2e510ce9973a2676b814c9a5

tech-stack:
  added: []
  patterns:
    - "빈 와이어 값은 브라우저 프레임에서 **키째 생략** — 「말하지 않았다」와 「\"\" 라고 말했다」를 구분한다"
    - "낯선 열거값은 프레임을 버리지 않고 `\"\"`(미상)으로 좁힌다 — 색 힌트 때문에 누적거래량을 잃지 않는다"
    - "행위 판정은 `notice_type`/`request_kind` 동등 비교 — `message` 문구는 어디서도 보지 않는다"
    - "테스트 픽스처의 **기본값은 구 서버**(신규 필드 전부 빈 값) — 그래야 회귀 테스트가 어제 서버를 재현한다"

key-files:
  created: []
  modified:
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/helpers/frames.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/hub.test.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "주문통보 신규 3필드는 빈 값이면 브라우저 프레임에서 **키째 생략**한다 — 빈 문자열을 실으면 「서버가 `\"\"` 라고 말했다」와 「서버가 말하지 않았다」가 구분되지 않는다"
  - "파서 층은 17-01 이 이미 채웠다 — 중복 커밋을 지어내지 않고 각 태스크 acceptance 재실행으로 증명하고 SUMMARY 에 편차로 남겼다"
  - "Q-ID 단언은 **통과하는** 테스트로 두었다 — 지금 막히지 않음을 굳히는 회귀 그물이고, 17-04 가 형식 제한을 넣을 때 깨지라고 둔 것이다"
  - "`requester` 는 표시 전용 — `dma_orders.origin` 은 `originKind`(원주문 주체) 그대로 둔다"
  - "`buildDirectOrderReq` 의 Phase 18 슬롯 미송신을 grep 이 아니라 **되읽기 단언**(`pieceCount()===0` · `krxSession()===null`)으로도 굳혔다"

patterns-established:
  - "Pattern 1: FlatBuffers 문자열은 테이블을 열기 **전에** 전부 `createString` (Pitfall 2)"
  - "Pattern 2: 파서가 이미 채워진 필드라도 **테스트가 없으면 계약이 아니다** — 와이어→브라우저 경로를 hub 단위 테스트로 닫는다"

requirements-completed: [TRADE-04]

coverage:
  - id: D1
    description: "호가 프레임이 KRX 정규장 종가(`kc`)를 원값으로 나른다 — `0` 도 권위값이고 NXT 프레임에도 실린다 (D-11)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#①-1 KRX 정규장 종가를 원값으로 나른다 (D-11)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#①-2 종가 `0` 도 권위값이라 59 증분 프레임을 버리지 않는다"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#①-3 NXT 프레임에도 KRX 종가가 실린다"
        status: pass
    human_judgment: false
  - id: D2
    description: "체결 테이프 원소가 서버 체결구분(`bs`)을 나르고, 낯선 값은 `\"\"` 로 좁히되 프레임을 버리지 않는다 (D-10 / T-17-06)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#②-1 서버 체결구분 \"1\"·\"2\" 는 원값 그대로 나른다"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#②-2 낯선·빈 체결구분은 \"\"(미상)으로 좁히고 프레임을 버리지 않는다"
        status: pass
      - kind: other
        ref: "sed -n '/export function parseTradeTape/,/^}/p' relay/src/dma/envelope.ts | grep -cE 'dropField\\(\"bad-bs' → 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "미체결 행이 예약·접수대기·시간외종가·취소보관·주문시각 5필드를 **해석 없이** 나르고, `pendingCancelSent` 로 행을 빼지 않는다 (D-07 / D-14)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#③-1 미체결 5필드는 해석 없이 원문 그대로 올라온다 (D-07)"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#③-2 빈 board · 부재 pending_cancel_sent 는 \"\" · false 다"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#③-3 pendingCancelSent === true 행을 목록에서 빼지 않는다"
        status: pass
    human_judgment: false
  - id: D4
    description: "주문 통보가 `board`·`request_kind`·`requester` 를 나르고 브라우저 프레임 `bd`/`rk`/`rq` 까지 도달한다. 빈 값은 키째 생략하고 구 서버 프레임은 회귀 없이 통과한다 (D-08)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#④-1 주문 통보가 board·request_kind·requester 를 원문 그대로 나른다"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#④-2 세 필드가 전부 빈 구 서버 프레임도 기존 통보를 그대로 만든다 (회귀)"
        status: pass
      - kind: integration
        ref: "relay/tests/hub.test.ts#⑬ 주문 통보의 bd·rk·rq 가 브라우저 프레임까지 간다 (17-02 / D-08)"
        status: pass
      - kind: integration
        ref: "relay/tests/hub.test.ts#⑭ 빈 bd·rk·rq 는 키 자체를 생략한다"
        status: pass
    human_judgment: false
  - id: D5
    description: "`message` 문구를 어디서도 파싱하지 않는다 — 804 거부에서 서버가 문구를 교체하므로 문구 비교는 조용히 틀린다 (T-17-04)"
    requirement: TRADE-04
    verification:
      - kind: other
        ref: "grep -cE 'message' relay/src/order/notice-status.ts → 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "`DirectOrderReq` 송신 바이트 무변경 — `piece_count`/`krx_session` 을 보내지 않는다 (D-12 / T-17-05)"
    requirement: TRADE-04
    verification:
      - kind: other
        ref: "sed -n '/export function buildDirectOrderReq/,/^}/p' relay/src/dma/envelope.ts | grep -cE 'addPieceCount|addKrxSession' → 0"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#④-3 buildDirectOrderReq 는 piece_count·krx_session 을 싣지 않는다 (D-12 / T-17-05)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Q-ID 주문번호(`Q`+9자, 10자)가 relay 의 취소·확인 zod 가드를 통과한다 (D-07)"
    requirement: TRADE-04
    verification:
      - kind: unit
        ref: "relay/tests/protocol.test.ts#② 예약주문 Q-ID 주문번호(Q+숫자 9자 = 10자)가 취소 경로를 통과한다 (17-02 / D-07)"
        status: pass
    human_judgment: false
  - id: D8
    description: "실계좌/모의 게이트웨이에서 실제 `board`·`request_kind`·`requester` 값이 기대한 어휘로 오는지 — 이 plan 은 목 프레임으로만 확인했다"
    verification: []
    human_judgment: true
    rationale: "어휘(`\"G2\"`/`\"G3\"`, `\"New\"`/`\"Modify\"`/`\"Cancel\"`, `\"Manual\"`)는 gh-trade `.fbs` 주석과 C# 정본에서 읽은 것이고, 실서버가 다른 문자열을 보내면 목 테스트는 통과한 채 화면만 빈다. 실기 확인은 D-26 대로 장 마감 후 배포·관찰로만 닫힌다."

# Metrics
duration: 8 min
completed: 2026-09-18
status: complete
---

# Phase 17 Plan 02: 기존 테이블 말미 필드 파서 확장 Summary

**서버가 이미 보내고 있던 13개 말미 필드가 이 plan 이후로 relay 밖으로 나온다 — 주문통보 3필드를 새로 파싱해 브라우저 `bd`/`rk`/`rq` 까지 결선했고, 17-01 이 앞당겨 채운 나머지 10필드(호가 `kc` · 체결 `bs` · 미체결 5필드)는 테스트 프레임과 단언으로 계약이 되게 굳혔다. 문구 파싱 0 · Phase 18 슬롯 송신 0 이 자동 게이트가 됐다.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-18T01:46:32Z
- **Completed:** 2026-09-18T01:54:12Z
- **Tasks:** 3 (tracer 1 · auto 2, 전부 `tdd="true"`)
- **Files modified:** 7
- **테스트:** relay 405 → **419** (+14), webapp 866 · shared 108 회귀 0

## Accomplishments

- **주문 통보가 행위 단어를 나르기 시작했다.** `ParsedOrderResp` 에 `board`·`requestKind`·`requester` 를 더하고 hub 가 브라우저 프레임에 `bd`/`rk`/`rq` 로 싣는다. **빈 값은 키째 생략**한다 — 빈 문자열을 실으면 「서버가 `""` 라고 말했다」와 「서버가 말하지 않았다」가 구분되지 않기 때문이고, 계약이 셋을 optional 로 둔 이유다. `side`·`isin` 은 계속 싣지 않는다(Pitfall 8).
- **문구 파싱 0 이 게이트가 됐다.** `relay/src/order/notice-status.ts` 를 읽어 **`message` 를 한 번도 참조하지 않음**을 확인했다(`grep -c message` → 0). 판정은 `noticeType`/`resultCode`/`quantity` 뿐이다. 804 정정·취소 거부에서 서버가 문구를 교체해도 relay 의 판정은 흔들리지 않는다(T-17-04). 고칠 분기가 없었다.
- **Phase 18 슬롯이 송신 경로에 들어가지 않았다.** `buildDirectOrderReq` 안에 `addPieceCount`/`addKrxSession` 이 0건임을 grep 게이트로 두고, 거기에 더해 **조립 결과를 되읽어** `pieceCount() === 0` · `krxSession() === null` 을 단언했다. grep 은 호출부 이름만 보지만 되읽기는 바이트를 본다(T-17-05, critical).
- **낯선 값이 프레임을 죽이지 않는다.** `bs_code` 가 `"9"`·`"X"`·빈 값이어도 원소는 `""`(미상)으로 남고 프레임은 산다 — `change_sign` 과 달리 드롭하면 누적거래량이 어긋난다. 4원소 프레임이 4원소 그대로 나오고 드롭 카운터가 0 임을 단언했다(T-17-06).
- **미체결 5필드가 해석 없이 올라옴을 굳혔다.** `"예약대기"` · `"증권사 보관 · 09:00 처리"` 같은 문구가 잘리거나 재해석되지 않고, `pendingCancelSent === true` 행이 목록에서 **빠지지 않는다**(서버가 브로커 앞에서 `R` 로 답하므로 relay 가 또 판정하면 취소 경로가 두 벌이 된다 — D-07).
- **Q-ID 회귀 그물을 깔았다.** `"Q091533123"`(10자)이 `order.cancel` 의 `orgOrderNo` 와 `vi.confirm` 의 `orderNo`(`min(1).max(10)`) 를 모두 통과함을 단언했다. 지금은 통과하는 테스트이고, 17-04 가 주문번호에 형식 제한을 넣으면서 이 단언이 깨지면 **예약 취소가 relay 에서 조용히 막혔다**는 뜻이다.

## Task Commits

1. **Task 1 (tracer, TDD): 호가 `kc` · 체결테이프 `bs`**
   - RED — `2c6b039` (test)
   - GREEN — `6d25bc5` (feat)
   - REFACTOR — 없음 (빌더 추가가 이미 최소·명시적)
2. **Task 2 (TDD): 미체결 5필드 + Q-ID 회귀**
   - RED — `08c6bcc` (test)
   - GREEN — `fbe7b21` (feat)
   - REFACTOR — 없음
3. **Task 3 (TDD): 주문통보 3필드 + 불변식 2종**
   - RED — `dc02c63` (test)
   - GREEN — `b05b0c7` (feat)
   - REFACTOR — 없음

**Plan metadata:** 이 SUMMARY 커밋.

`commits: 6` 은 서술이 아니라 `git rev-list --count 65eff4f..HEAD` 로 **측정**한 값이다.

## Files Created/Modified

- `relay/src/dma/envelope.ts` — `ParsedOrderResp` + `parseOrderResp` 에 `board`·`requestKind`·`requester` 3필드
- `relay/src/hub/subscription-hub.ts` — `RelayOrderMsg` 에 `bd`/`rk`/`rq` 조건부 스프레드(빈 값 생략)
- `relay/tests/helpers/frames.ts` — 테스트 프레임 입력 11종 추가(`krxClosePrice` · `bsCode` · 미체결 4 · 주문통보 3), 문자열은 테이블 열기 전 `createString`
- `relay/src/dma/__tests__/envelope.test.ts` — 11 케이스 추가(호가 3 · 테이프 2 · 미체결 3 · 주문통보 3)
- `relay/tests/hub.test.ts` — 브라우저 프레임 도달 2 케이스(⑬ 값 있음 · ⑭ 빈 값 키 생략)
- `relay/tests/protocol.test.ts` — Q-ID 10자 취소·확인 회귀 단언
- `relay/tests/ws-order.test.ts` — `mkNotice` 픽스처에 신규 3필드(기본값 = 구 서버 빈 값)

## Decisions Made

1. **빈 값은 키째 생략.** 계약이 `bd`/`rk`/`rq` 를 optional 로 둔 것은 「서버가 말하지 않았다」를 표현하기 위해서다. 빈 문자열을 실으면 그 구분이 사라지고 브라우저가 `""` 를 유효한 board 로 오독할 여지가 생긴다.
2. **Q-ID 단언은 통과하는 테스트로 둔다.** 계획서가 「막혀 있으면 허용한다」고 했으나 확인 결과 막혀 있지 않았다(`orgOrderNo: z.string().min(1)` — 형식·상한 제한 없음). 없는 문제를 고치는 대신 **현재 상태를 굳히는** 회귀 그물로 남겼다. `relay/src/ws/protocol.ts` 는 17-04 소유라 손대지 않았다.
3. **불변식은 grep 과 되읽기 둘 다로 건다.** `addPieceCount` grep 0 은 호출부 이름만 본다 — 누군가 `createDirectOrderReq` 위치 인자로 되돌리면 grep 은 통과하고 바이트는 바뀐다. 조립 결과를 되읽는 단언이 그 구멍을 막는다.
4. **픽스처 기본값은 구 서버다.** `buildOrderRespFrame` 의 신규 3필드 기본값을 `""` 로 두었다. 기본값을 「오늘 서버」로 하면 기존 회귀 테스트가 전부 오늘 서버를 재현하게 되어 구 서버 호환을 더는 검사하지 않는다.
5. **`requester` 는 표시 전용.** `dma_orders.origin` 은 `originKind`(원주문 주체) 그대로 둔다 — 취소 요청자로 덮어쓰면 자동주문이 수동으로 둔갑한다(D-08).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ws-order.test.ts` 의 `mkNotice` 픽스처가 신규 필수 3필드로 컴파일 불가**
- **Found during:** Task 3 (GREEN 직후 `typecheck:tests`)
- **Issue:** `ParsedOrderResp` 에 `board`·`requestKind`·`requester` 를 필수로 더하자 `relay/tests/ws-order.test.ts:1381` 의 픽스처가 `TS2322` 로 깨졌다
- **Fix:** 세 필드를 **구 서버 기본값(전부 `""`)** 으로 채웠다. 오늘 서버 값으로 채우면 이 픽스처를 쓰는 매칭 축 테스트가 구 서버 회귀를 더 이상 잡지 못한다
- **Files modified:** `relay/tests/ws-order.test.ts`
- **Verification:** `relay typecheck` · `typecheck:tests` 통과, relay 419 green
- **Committed in:** `b05b0c7`

### 계획서와의 차이 (17-01 선행분)

**2. [범위] Task 1·2 의 파서 작업은 이미 17-01 이 했다 — 다시 커밋하지 않았다**
- **확인 방법:** 각 태스크 `<acceptance_criteria>` 를 **17-01 SUMMARY 의 주장이 아니라 코드에 직접** 재실행해 증명했다.
  - `sed -n '/export function parseQuoteState/,/^}/p' … | grep -c 'toNum(q.krxClosePrice()'` → **1**
  - `sed -n '/export function parseTradeTape/,/^}/p' … | grep -c 'bs:'` → **1**
  - 미체결 push 객체의 `orderTime`·`queuedStatus`·`pendingStatus`·`board`·`pendingCancelSent` 5키 → **5**
- **이 plan 이 새로 넣은 것:** 테스트 프레임 빌더(파서가 읽을 값을 만들 수단 자체가 없었다), 6+5 케이스 단언, hub 브라우저 프레임 2 케이스, Q-ID 회귀, 불변식 게이트 2종.
- **판단:** 「이미 있다」를 no-op 커밋으로 위장하지 않았다. 다만 **테스트가 없으면 계약이 아니다** — 17-01 직후 상태에서는 빌더가 `bs_code`/`krx_close_price`/미체결 4필드를 **아예 채우지 않아** 파서가 그 경로로 값을 본 적이 한 번도 없었다(RED 가 그것을 보여준다: `kc` 는 항상 0, `bs` 는 항상 `""`). 이 plan 이 그 구멍을 닫았다.

**3. [범위] `relay/src/ws/protocol.ts` 를 고치지 않았다 (계획서 지시대로)**
- Q-ID 가 이미 통과하므로 고칠 것이 없었다. 계획서 ④가 정한 대로 그 파일은 17-04 소유로 남겼다.

**4. [추가] 계획서에 없던 hub 단위 테스트 2건을 넣었다**
- Task 3 acceptance 는 `grep -c "rk:"` 로 만족할 수 있었지만, grep 은 「키를 썼다」만 보고 「브라우저까지 갔다」는 보지 않는다. `hub.test.ts` 의 기존 `pushFrame` 하네스로 와이어→팬아웃 경로를 실제로 통과시켜 ⑬·⑭ 두 케이스를 굳혔다. 빈 값 키 생략은 이 테스트가 아니면 검증할 방법이 없었다.

---

**Total deviations:** 1 auto-fixed (blocking) + 3 범위 기록
**Impact on plan:** 범위를 넓히지 않았다. #2 는 17-01 이 앞당긴 작업을 중복하지 않은 것이고, #4 는 acceptance 를 더 강하게 만든 추가다.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 (tracer) | ✓ `2c6b039` | ✓ `6d25bc5` | — (변경 없음) | Pass |
| 2 | ✓ `08c6bcc` | ✓ `fbe7b21` | — (변경 없음) | Pass |
| 3 | ✓ `dc02c63` | ✓ `b05b0c7` | — (변경 없음) | Pass |

**RED 증거 (#3770 실질 요건 — 세 사이클 모두 「대상 테스트가 계획된 behavior 에 대한 단언으로 실패」)**

| 사이클 | command | exit | 대상 테스트 | 실패 형태 | 집계 |
|---|---|---|---|---|---|
| Task 1 | `pnpm --filter @gh-radar/relay run test` | `1` | `parseQuoteState > ①-1 …`, `①-3 …`, `parseTradeTape > ②-1 …` | **단언 실패** — `expected +0 to be 12625`, `expected [ '', '' ] to deeply equal [ '1', '2' ]` | 410 중 **3 실패 / 407 통과** |
| Task 2 | `pnpm --filter @gh-radar/relay run test` | `1` | `계좌 상태 조립·파싱 > ③-1 미체결 5필드는 해석 없이 원문 그대로 올라온다 (D-07)` | **단언 실패** — `expected { orderNo: 'Q091533123', …(13) } to match object { …(5) }` | 414 중 **1 실패 / 413 통과** |
| Task 3 | `pnpm --filter @gh-radar/relay run test` | `1` | `주문 조립·파싱 > ④-1 …`, `④-2 …`, `SubscriptionHub > ⑬ …` | **단언 실패** — `to match object { board: 'G3', … }` | 419 중 **3 실패 / 416 통과** |

로드 실패·0건 발견·unexpected green 어느 쪽도 아니다. 실패한 테스트는 전부 계획된 `<behavior>` 에 대한 단언이고, 나머지 400+ 건이 정상 통과했다는 것이 「픽스처가 깨진 게 아니다」의 증거다. 각 사이클에서 **불변식 케이스**(①-2 · ②-2 · ③-2 · ③-3 · ④-3 · ⑭)는 RED 단계에서도 통과했다 — 그것들은 새 동작이 아니라 **깨지지 말아야 할 성질**을 굳히는 회귀 그물이므로 의도된 green 이다.

**⚠ `gsd_run check tdd-red-evidence` 는 이 저장소에서 구조적으로 쓸 수 없다 (17-01 이 보고한 도구 갭 그대로).**
`bin/lib/tdd-red-evidence.cjs` 의 `parseNodeTestSummary` 는 `node --test` 의 `# tests/# pass/# fail` 푸터 3줄로만 집계를 읽는데 vitest 는 그 푸터를 출력하지 않아 어떤 입력이든 `INVALID_RED (zero_tests_discovered)` 가 된다. 푸터를 손으로 지어내는 것은 게이트가 검사하려던 증거의 위조라 하지 않았고, 대신 위 표로 실질 증거를 남긴다. 17-01 과 동일한 조치이며 **이 저장소의 모든 `tdd="true"` 태스크에 적용되는 GSD 쪽 갭**이다.

## Issues Encountered

- **`pnpm … test -- envelope` 의 필터 인자가 먹지 않는다.** vitest 는 `--` 뒤의 `envelope` 를 파일 필터로 쓰지 않고 17개 파일을 전부 돈다. 결과 판정에는 영향이 없어(전량 green 이 더 강한 조건) 계획서의 `<verify>` 명령을 그대로 쓰되, 실제 판정은 전량 실행으로 했다. 트레이서 게이트 재실행에서 한 번 `[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] Exit status 1` 을 관측했으나 같은 명령을 리다이렉션 없이 다시 돌리니 `EXIT=0` · 410 통과였다 — grep 파이프의 SIGPIPE 로 판단한다. 판정은 파일로 받아 확인했다.
- **`.planning/WINDOWS.md` 에 넣었다가 되돌린 항목 1건.** Q-ID 건을 `deviation` 으로 적었다가, **가드가 통과하므로 결함이 아니다**(닫을 것이 없는 `open` 항목은 `/gsd-ship` 만 막는다)고 판단해 `git checkout -- .planning/WINDOWS.md` 로 되돌렸다. 대신 위 「Decisions Made 2」에 회귀 그물의 의도를 남겼다.
- 그 밖의 문제 없음. baseline(relay 405 · webapp 866 · shared 108) 대비 회귀 0.

## Known Stubs

없음. 이 plan 은 화면을 만들지 않았고, 파서가 채운 값은 전부 실제 와이어 접근자에서 온다.

## User Setup Required

없음 — 신규 의존성 0건, 외부 서비스 설정 변경 없음.

## Next Phase Readiness

**바로 시작 가능:**
- **17-06 이후 웹 표면** — 호가 `kc`, 테이프 `bs`, 미체결 5필드, 주문통보 `bd`/`rk`/`rq` 가 **브라우저 계약까지 와 있다.** 화면 plan 은 「값이 없는데 화면만 고쳤다」를 걱정할 필요가 없다.
- **17-04**(`lc.arm` · 주문번호 가드) — Q-ID 회귀 그물이 `relay/tests/protocol.test.ts` 에 있다. `orderNo`/`orgOrderNo` 에 형식 제한을 넣을 때 **이 단언이 깨지면 예약 취소를 막은 것**이니 `Q`+9숫자를 허용 목록에 넣어야 한다.
- **Phase 18**(`piece_count`/`krx_session` 송신) — 미송신 게이트가 grep + 되읽기 두 겹이다. 실제로 보내기 시작하는 plan 은 `envelope.test.ts` ④-3 을 **의도적으로** 고쳐야 하고, 그 커밋이 D-12 해제의 기록이 된다.

**주의:**
- `packages/shared/src/**` 는 이 plan 이 고치지 않았다(17-01 계약 그대로). 뒤 plan 이 고치면 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려야 relay/webapp 이 최신 d.ts 를 본다.
- 배포는 D-26 대로 장 마감(20:00 KST) 이후, 사용자 확인 뒤에 한다. 이 plan 은 배포 대상 코드(relay 파서·hub)를 바꿨지만 **배포하지 않았다**.
- `TRADE-04` 는 형제 plan 이 아직 선언 중이라 `requirements.ready-ids` 가 `0/1 ready` 를 돌려줬다 — REQUIREMENTS.md 체크는 마지막 선언 plan 이 끝날 때 닫힌다(#2388 공유 ID 게이트, 정상 동작).

## Self-Check: PASSED

- 수정 파일 7건 전부 디스크에 존재 확인
- 커밋 6건 전부 `git log` 에서 확인: `2c6b039` · `6d25bc5` · `08c6bcc` · `fbe7b21` · `dc02c63` · `b05b0c7`
- `commits: 6` 은 `git rev-list --count 65eff4f..HEAD` 로 **측정**한 값이다
- 모든 태스크 `<acceptance_criteria>` 최종 재실행 통과 (Task 1: 6/6 · Task 2: 5/5 · Task 3: 6/6)
- plan `<verification>` 재실행 통과: relay test **419 green** · `typecheck` · `typecheck:tests` · webapp `typecheck` · shared build 전부 green, `buildDirectOrderReq` 미송신 게이트 `0`
- 회귀 확인: webapp 866 passed / 1 skipped · shared 108 passed — baseline 동일

---
*Phase: 17-gh-trade-led*
*Completed: 2026-09-18*
