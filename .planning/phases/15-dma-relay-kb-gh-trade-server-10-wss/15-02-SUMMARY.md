---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 02
subsystem: api
tags: [flatbuffers, tcp-framing, codec, parser, defensive-parsing, vitest, test-helpers, websocket]

# Dependency graph
requires:
  - phase: 15-01
    provides: "relay/ 워크스페이스 · FlatBuffers 생성물 41개 · logger/config · packages/shared/src/relay.ts 3자 계약"
  - phase: external/gh-trade
    provides: "client/Services/DMA/PacketCodec.cs(TryExtract 규율) · Client.cs(TakeCount·상한 상수) · server/src/protocol/StockDMA.fbs(필드 의미)"
provides:
  - "relay/src/dma/codec.ts — frame() 인코더 + FrameReader 스트림 디코더 (1MB 상한 · desync 신호 · 드롭 카운터 · 64B hex 덤프)"
  - "relay/src/dma/msg-type.ts — MSG 상수 20종 단일 정본 + INBOUND_MSG_TYPES 수신 화이트리스트 12종"
  - "relay/src/dma/envelope.ts — 요청 빌더 5종 + total 파서 + takeCount/toNum/형식 가드 + shared 계약 타입 변환 4종"
  - "relay/tests/helpers/frames.ts — 응답 프레임 빌더 (전 필드 override — 일부러 깨진 프레임 생성 가능)"
  - "relay/tests/helpers/fake-gateway.ts — node:net 스텁 게이트웨이 (청크 경계 지정·쓰레기 주입·강제 종료·핑 카운트)"
  - "relay/tests/helpers/ws-client.ts — wss 테스트 클라이언트 (nextMessage·waitClose·bufferedAmount)"
  - "relay/tsconfig.tests.json + typecheck:tests — tests/ 타입체크 사각지대 해소"
affects: [15-03, 15-04, 15-05, 15-06, 15-07, 15-08, 15-09, 15-10, 15-12, 15-13, 15-14, 15-15, 15-16, 15-17, 15-18, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "와이어 지식은 dma/ 두 모듈에만 둔다 — 상위 계층은 @gh-radar/shared 계약 타입만 본다"
    - "파서는 total — 어떤 입력에도 throw 하지 않고 null 로 수렴한다 (C# Try-패턴 이식)"
    - "드롭·절단 경로는 반드시 카운터 + 사유 + 64B hex 를 남긴다 (무로그 fail-safe 금지)"
    - "테스트 프레임 빌더를 tests/helpers/frames.ts 한 곳에 두고 단위 테스트와 소켓 스텁이 공유"

key-files:
  created:
    - relay/src/dma/msg-type.ts
    - relay/src/dma/codec.ts
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/helpers/ws-client.ts
    - relay/tests/fake-gateway.test.ts
    - relay/tsconfig.tests.json
  modified:
    - relay/package.json

key-decisions:
  - "MAX_FRAME_SIZE = 1MB 고정 — 인계 문서의 4MB 는 서버 송신 큐 상한(kSendQueueMaxBytes) 오독. 근거 주석 박제"
  - "수신 버퍼 상한 비교는 HEADER_SIZE + MAX_RECV_BUFFER_SIZE 로 한다 — 상한 크기 프레임이 여러 청크로 쪼개져 올 때 정상 프레임을 desync 로 오판하지 않기 위해서다"
  - "짧게 온 호가 벡터는 10단으로 채우지 않는다 — 게이트웨이가 보낸 것이 진실이고 takeCount 는 상한 절단만 한다 (C# 클라이언트 동형)"
  - "change_sign 이 1자가 아니면 프레임 전체를 드롭한다 — 체결 테이프도 원소 하나가 깨지면 프레임째 버린다(일부만 흘리면 누적거래량이 조용히 어긋난다)"
  - "요청 프레임을 읽는 fake-gateway 는 tryParseEnvelope 를 쓰지 않는다 — 그 함수는 응답 대역 화이트리스트라 요청 계열(1·4·28·29·32)을 전부 드롭한다"
  - "tests/ 전용 tsconfig 를 추가했다 — 헬퍼가 어떤 tsc 도 보지 않는 사각지대였고, 도입 즉시 타입 오류 2건을 잡았다"

patterns-established:
  - "3단 방어: ① 최소 크기(8B) ② msg_type 화이트리스트 + 슬롯 null ③ 필드 형식·길이 가드. try/catch 는 필요조건일 뿐이다"
  - "bigint → number 변환 경계는 toNum 하나뿐 (D-34). 안전 정수 초과는 warn + 클램프"
  - "테스트 헬퍼의 close() 는 서버와 모든 연결을 정리한다 — 하나라도 남으면 vitest 가 멈춘다"

requirements-completed: []

# Metrics
duration: 19min
completed: 2026-09-05
---

# Phase 15 Plan 02: DMA 와이어 코덱 · Envelope 안전 파싱 · 테스트 헬퍼 Summary

**`[uint32 LE 길이][FlatBuffer]` 프레이밍과 Envelope 조립/파싱을 gh-trade C# 기준 구현에서 이식하고, Verifier 없는 JS 런타임에서 깨진 프레임이 UI 로 새지 않도록 3단 방어(최소 크기 · msg_type 화이트리스트 · TakeCount 동형 필드 가드)를 57건 단위 테스트로 못박음**

## Performance

- **Duration:** 약 19분
- **Started:** 2026-09-05T21:02Z (worktree base 확정)
- **Completed:** 2026-09-05T21:21Z
- **Tasks:** 3/3
- **Files modified:** 11 (신규 10 · 수정 1)

## Accomplishments

- **SC-3 기반 확보.** 결합·분할된 TCP 스트림에서 프레임 경계가 복원되고, 1MB 초과 길이 헤더는 드롭이 아니라 **연결 재수립 신호**(`desync`)로 보고된다. 8B 미만 페이로드는 그 프레임만 버리고 연결은 유지된다 — 전부 테스트로 증명.
- **Verifier 부재 대응 완료.** 정상 프레임을 끝에서 10바이트 잘라도 예외 없이 `null` 로 수렴하고 드롭 카운터가 오른다. "예외가 안 났다 = 정상"이라는 오독을 테스트가 직접 부정한다.
- **필드 가드 이식.** `takeCount`(음수 0 / 초과 절단, 둘 다 warn) · `toNum`(안전 정수 클램프 + warn) · ISIN 12자 · 거래소 화이트리스트 · `change_sign` 1자. 호가 15단이 와도 10단으로 잘리고 **프레임은 살아남는다**(절단 ≠ 드롭).
- **조립 빌더 5종** 준비 — 15-03 의 세션 상태기계가 와이어 걱정 없이 상태 전이에만 집중할 수 있다.
- **Wave 0 테스트 도구 2종.** gh-trade mock 서버 빌드 없이 vitest 안에서 완결되는 가짜 게이트웨이(D-40 fallback)와 wss 클라이언트 헬퍼. 전체 relay 테스트가 **1초**에 종료(핸들 누수 없음).

## Task Commits

1. **Task 1: 프레이밍 코덱 + MsgType 상수 + 단위 테스트** — `b4f0e21` (feat)
2. **Task 2: Envelope 조립 + 안전 파싱 + 필드 상한 가드 + 단위 테스트** — `e1a448b` (feat)
3. **Task 3: 테스트 헬퍼 — 가짜 게이트웨이 + ws 클라이언트 (Wave 0)** — `76a4ebc` (test)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

| 파일 | 역할 |
|------|------|
| `relay/src/dma/msg-type.ts` | `MSG` 상수 20종 + `INBOUND_MSG_TYPES` 12종. 생성 enum 을 재export 하지 않는다(전체 47종에 범위 밖 값이 섞여 화이트리스트로 못 쓴다) |
| `relay/src/dma/codec.ts` | `frame()` · `tryExtract()` · `FrameReader`(push/reset/droppedFrameCount/pendingBytes) · `logDroppedFrame()` 공용 드롭 로그 |
| `relay/src/dma/envelope.ts` | 빌더 5종 · `tryParseEnvelope` · `parseQuoteState/parseTradeTape/parseServerMessage/parseLoginResp` · `takeCount/toNum/isValidIsin/isValidExchange/isValidChangeSign` · 상한 상수 6종 |
| `relay/src/dma/__tests__/codec.test.ts` | 15건 — 연접 분리 · 헤더 중간 절단 · 2MB 헤더 desync · 정확히 1MB 통과 · 1MB 분할 통과 · 최소 크기 드롭 · 왕복 · MsgType enum 대조 |
| `relay/src/dma/__tests__/envelope.test.ts` | 30건 — 빌더 왕복 3 · 끝 10B 절단 · junk 12B · msg_type 99 · 슬롯 null · takeCount 15/-1 · toNum 클램프 · ISIN 11/13자 · 15단 절단 · 테이프 250건 절단 · LoginResp |
| `relay/tests/helpers/frames.ts` | 응답 프레임 빌더 4종 + `buildBareEnvelope`. 모든 필드 override 가능 — 일부러 깨진 프레임을 만들 수 있어야 가드를 시험할 수 있다 |
| `relay/tests/helpers/fake-gateway.ts` | `startFakeGateway` · `onFrame` · `respondLogin` · `pushQuote/pushTape` · `sendRaw/sendFrame` · `sendGarbage`(3종) · `hardClose` · `receivedPings` · `waitForConnection` · `close` |
| `relay/tests/helpers/ws-client.ts` | `connectWs` + `TestWs`(sendAuth/sendSub/sendUnsub/sendRaw · nextMessage · waitClose · bufferedAmount · close) |
| `relay/tests/fake-gateway.test.ts` | 헬퍼 스모크 12건 (가짜 게이트웨이 10 + ws 클라이언트 2) |
| `relay/tsconfig.tests.json` | tests/ + src 테스트 파일 전용 타입체크 설정 |
| `relay/package.json` | `typecheck:tests` 스크립트 1줄 추가 (수정) |

## Decisions Made

**1. `MAX_FRAME_SIZE` 는 1MB — 인계 문서의 4MB 를 채택하지 않았다.**
서버 `Gateway.h` 의 `kMaxRecvBufSize` 와 C# `PacketCodec.MAX_FRAME_SIZE` 가 모두 1MB 다. 4MB 는 **송신 큐 총량 상한**(`kSendQueueMaxBytes`)이다. 상한을 넉넉히 잡으면 desync 감지가 늦어지고 e2-micro 메모리를 압박한다. 근거를 코드 주석에 박았고, `4 * 1024 * 1024` 문자열이 파일에 없음을 acceptance 가 검사한다.

**2. 수신 버퍼 상한 비교에 `HEADER_SIZE` 를 더한다.**
`tryExtract` 가 이미 상한 초과 헤더를 걸러내므로 잔여 바이트는 구조적으로 `4 + MAX_FRAME_SIZE` 를 넘을 수 없다. `MAX_RECV_BUFFER_SIZE` 와 그냥 비교하면 **정확히 1MB 프레임이 여러 청크로 쪼개져 올 때 정상 프레임을 desync 로 오판**한다. 이 경계를 테스트(④-b)로 고정했다.

**3. 짧게 온 호가 벡터를 10단으로 채우지 않는다.**
`packages/shared` 의 `RelayQuote` 주석은 "길이 10 고정"이라 적혀 있지만, 게이트웨이가 3단만 보냈으면 3단이 진실이다. 0 으로 패딩하면 없는 호가를 UI 가 그린다. C# 클라이언트와 동형으로 **상한 절단만** 한다.

**4. `change_sign` 1자 위반은 프레임 전체 드롭 — 체결 테이프도 마찬가지.**
테이프 원소 하나만 걸러 내보내면 브라우저의 누적거래량이 조용히 어긋난다. 원소 하나라도 형식이 깨졌으면 그 프레임을 통째로 버린다(카운터 + warn 을 남긴다).

**5. 가짜 게이트웨이는 `tryParseEnvelope` 를 쓰지 않는다.**
그 함수는 **수신(응답) 대역 화이트리스트**라 게이트웨이가 받는 요청 계열(1·4·28·29·32)을 전부 드롭한다. 스텁은 `Envelope.getRootAsEnvelope` 로 `msg_type` 만 직접 읽는다. 후속 plan 이 이 함정을 되밟지 않도록 파일 상단 docblock 에 명시했다.

**6. `LoginResp` 는 `success`/`message` 만 읽는다 (D-25).**
생성물에 `AccountEntry` 접근자가 이미 있지만(15-01 실측), 이 plan 은 계좌 접근자를 참조하지 않는다. `envelope.ts` 에 해당 문자열이 0회 등장함을 acceptance 가 검사한다.

## Deviations from Plan

### 구조 변경 (계획에 없던 파일 2개 추가)

**1. [Rule 3 - Blocking] `relay/tests/helpers/frames.ts` 를 Task 2 에서 신설**
- **Found during:** Task 2 (envelope 테스트 작성)
- **Issue:** 파서 가드를 시험하려면 **응답 프레임**(58/59·69/71·54·50)을 만들어야 하는데, relay 는 응답을 만들지 않으므로 프로덕션 코드에 빌더가 없다. Task 3 의 `fake-gateway.pushQuote/pushTape` 도 같은 빌더를 필요로 한다.
- **Fix:** 응답 프레임 빌더를 `tests/helpers/frames.ts` 한 곳에 두고 `envelope.test.ts` 와 `fake-gateway.ts` 가 공유하게 했다. 두 벌로 두면 스키마가 바뀔 때 한쪽만 고쳐진다. 모든 필드를 override 가능하게 설계해 **일부러 깨진 프레임**(ISIN 11자, `change_sign` 0자, 호가 15단)을 만들 수 있다.
- **Files:** `relay/tests/helpers/frames.ts` (신규)
- **Committed in:** `e1a448b`

**2. [Rule 2 - Missing critical] `relay/tsconfig.tests.json` + `typecheck:tests` 스크립트 신설**
- **Found during:** Task 3 (헬퍼 검증)
- **Issue:** `relay/tsconfig.json` 은 `tests` 와 `src/**/*.test.ts` 를 exclude 한다(15-01 이 server 규약을 따른 결과). vitest 는 타입을 보지 않는다. 즉 **이 phase 의 남은 18 plan 이 전부 의존할 테스트 헬퍼가 어떤 tsc 도 보지 않는 사각지대**에 있었다.
- **Fix:** `tests/` + `src` 를 함께 보는 별도 tsconfig 와 `typecheck:tests` 스크립트를 추가했다. 루트 `pnpm -r run typecheck` 는 `typecheck` 만 돌므로 기존 동작에 영향이 없다.
- **Verification:** 도입 즉시 실제 타입 오류 2건을 잡았다 (아래 3번).
- **Files:** `relay/tsconfig.tests.json` (신규) · `relay/package.json` (스크립트 1줄)
- **Committed in:** `76a4ebc`

### Auto-fixed Issues

**3. [Rule 1 - Bug] 테스트 헬퍼 타입 오류 2건**
- **Found during:** Task 3 (`typecheck:tests` 최초 실행)
- **Issue:** ① `fake-gateway.ts` 가 `Envelope.addMsgType(b, 99)` 로 리터럴을 넘겨 `MsgType` enum 파라미터와 불일치(TS2345). ② `ws-client.ts` 의 `close()` 가 `this.raw.readyState` 를 직접 두 번 비교해, TS 가 첫 비교로 좁힌 타입 때문에 `await` 뒤의 재확인이 "도달 불가"로 판정(TS2367) — 즉 **강제 종료 fallback 이 죽은 코드**가 될 수 있었다.
- **Fix:** ① `frames.buildBareEnvelope(UNKNOWN_MSG_TYPE)` 재사용으로 대체(중복 제거 겸). ② `readyState` 를 지역 `number` 변수로 받아 좁히기를 끊고, `await` 전후로 각각 새로 읽게 했다.
- **Files modified:** `relay/tests/helpers/fake-gateway.ts` · `relay/tests/helpers/ws-client.ts`
- **Committed in:** `76a4ebc`

### 계획 전제와 실측이 어긋난 항목 (수정 아님 — 사실 보고)

**4. [사실 정정] `MAX_RECV_BUFFER_SIZE` 검사는 도달 불가에 가까운 안전망이다**
- plan 은 "내부 버퍼가 `MAX_RECV_BUFFER_SIZE` 를 넘으면 `desync: true`" 를 요구했다. 구현하며 확인한 사실: `tryExtract` 가 상한 초과 헤더를 먼저 거르므로, 루프를 빠져나온 시점의 잔여 바이트는 **구조적으로** `HEADER_SIZE + MAX_FRAME_SIZE` 를 넘을 수 없다. 검사는 남겼지만(무한 누적 경로 부재를 코드로 못박는 의미) 실제로는 발화하지 않는다는 점을 주석에 명시했다. 그래서 이 경로만 단위 테스트로 직접 발화시키지 못했다 — 대신 "1MB 프레임 분할 통과"(④-b)로 **오판하지 않음**을 증명했다.

**5. [사실 정정] `QuoteState` 에는 `createQuoteState` 편의 함수도 없다**
- plan 은 "일반 테이블에는 `create*` 가 있다"를 전제로 했다(`LoginReq` 기준, 맞다). 그러나 필드가 많은 `QuoteState` 에는 flatc 가 `create*` 를 만들지 않는다. `frames.ts` 의 호가 빌더도 `startQuoteState → add* → endQuoteState` 로 조립했다. `TradeTape`·`ServerMessage`·`TradeTapeEntry`·`LoginReq` 계열에는 `create*` 가 있어 그대로 썼다.

---

**Total deviations:** 2 구조 추가(Rule 3 · Rule 2) + 1 auto-fix(Rule 1, 2건) + 2 사실 정정
**Impact on plan:** 추가 파일 2개는 모두 "plan 이 요구한 검증을 실제로 돌리기 위해" 필요한 도구이며 기능 범위 확대가 없다. plan 이 명시한 7개 산출 파일은 전부 계획대로 만들어졌다.

## Issues Encountered

- **범위 밖 선재 실패 1건 (신규 아님).** `pnpm -r run test` 는 `packages/shared/src/__tests__/theme.test.ts:25` 에서 여전히 실패한다. 15-01 이 이미 `deferred-items.md` 에 기록했고 이 plan 이 건드린 파일이 아니므로 손대지 않았다. relay 단위 검증은 `pnpm --filter @gh-radar/relay test` 로 볼 것.
- **worktree 경로 주의 재확인.** `sync-relay-schema.sh --check` 는 기본값이 메인 체크아웃을 가리켜 `RELAY=<worktree>/relay` 를 명시해 실행했다(15-01 과 동일). 결과는 무변경.

## Known Stubs

없음. `relay/src/dma/**` 와 테스트 헬퍼에 `TODO`/`FIXME`/placeholder 문자열이 0건이다(`grep` 확인). 이 plan 의 산출물은 순수 함수와 테스트 도구뿐이며 UI 로 흐르는 하드코딩 빈 값이 없다.

계획대로 **만들지 않은 것**(스텁이 아니라 범위 밖):
- 계좌·주문 빌더(MsgType 2/3/25)와 `AccountState` 파서 — D-25 게이트 뒤 plan 소관.
- `MAX_ACCOUNT_LIST_COUNT`/`MAX_HOLDING_COUNT`/`MAX_UNFILLED_COUNT`/`MAX_REMOVED_ORDER_COUNT` 4개 상수는 정본으로 **선박제만** 해 두었다(현재 미사용). 계좌 wave 가 값을 다시 고르지 않게 하기 위해서다.

## Verification

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay test` | **exit 0 · 3 files · 57 tests passed · 약 1초 종료**(핸들 누수 없음) |
| `pnpm --filter @gh-radar/relay test codec` | exit 0 · 15건 (요구 6건 이상) |
| `pnpm --filter @gh-radar/relay test envelope` | exit 0 · 30건 (요구 8건 이상) |
| `pnpm --filter @gh-radar/relay test fake-gateway` | exit 0 · 12건 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 (신설) |
| 루트 `pnpm typecheck` (13 워크스페이스) | exit 0 |
| `sync-relay-schema.sh --check` (D-26 생성물 무수정) | exit 0 · 신규/변경 **0** · 삭제 없음 |
| `grep -c '4 \* 1024 \* 1024' codec.ts` | 0 |
| `grep -v '^\s*//' codec.ts \| grep -c '1024 \* 1024'` | 2 |
| `grep -c 'MIN_ENVELOPE_SIZE = 8' codec.ts` | 1 |
| `grep -c 'droppedFrameCount' codec.ts` / `desync` | 5 / 11 |
| `grep -c 'startEnvelope' envelope.ts` | 6 (빌더 5 + 주석 1) |
| `grep -c 'createEnvelope' envelope.ts` | 0 |
| `grep -c 'MAX_ORDER_BOOK_DEPTH = 10'` / `MAX_TAPE_ENTRY_COUNT = 200'` | 1 / 1 |
| `grep -c 'MAX_SAFE_INTEGER' envelope.ts` | 4 |
| `grep -c 'accounts' envelope.ts` (D-25 게이트) | **0** |
| `grep -c 'startFakeGateway'`/`sendGarbage`/`hardClose`/`receivedPings` | 1 / 2 / 2 / 2 |
| `grep -c 'waitClose' ws-client.ts` | 2 |
| `git status --porcelain relay/src/generated` | 0 |

## Threat Model 대응

| Threat ID | 대응 | 증거 |
|-----------|------|------|
| T-15-07 | 1MB 상한을 산술보다 먼저 검사 · 8B 최소 크기 · `INBOUND_MSG_TYPES` 화이트리스트 · 슬롯 null 검사 · `takeCount` 클램프(10/200) · ISIN·거래소·`change_sign` 형식 가드 | codec.test.ts ③⑤ · envelope.test.ts ④⑤⑨ + 호가 15단 절단 · 테이프 250건 절단 |
| T-15-07b | 수신 버퍼 무한 누적 경로 부재(상한 검사 + compact) | codec.ts `#compact` · 버퍼 상한 검사 (④-b 가 오판 없음을 증명) |
| T-15-17 | `toNum` 단일 변환 경계 + 안전 정수 초과 warn·클램프 | envelope.test.ts ⑧ · 누적거래대금 클램프 케이스 |
| T-15-18 | 드롭 카운터 + 사유 + 선두 64B hex + msgType 힌트 (`logDroppedFrame` 공용) | codec.test.ts ⑤(reason/head/카운터 단언) · envelope.test.ts ⑤ |

신규 위협 표면 없음 — 이 plan 은 네트워크 엔드포인트·인증 경로·파일 접근·스키마를 추가하지 않는다. 테스트 헬퍼의 리스너는 `127.0.0.1` + 임의 포트이며 vitest 프로세스 안에서만 산다.

## User Setup Required

없음. 외부 서비스·시크릿·계정 설정을 요구하지 않는다.

## Next Phase Readiness

**준비된 것**
- **15-03(DmaClient/Session)**: `FrameReader.push()` 의 `desync` 를 재접속 트리거로 쓰고, `tryParseEnvelope` → `msgType` 스위치로 상태 전이만 짜면 된다. 요청 빌더 5종이 이미 있다.
- **15-04 이후(SubscriptionHub/WsFanout)**: `parseQuoteState`/`parseTradeTape` 가 곧바로 `@gh-radar/shared` 계약 타입을 내므로 직렬화 계층이 별도로 필요 없다. `JSON.stringify` 가 bigint 로 터지지 않음을 테스트가 보증한다.
- **모든 후속 wave**: `startFakeGateway` + `connectWs` 로 소켓 경계 조건을 재현할 수 있다.

**후속 plan 이 알아야 할 것**
1. **`tryParseEnvelope` 는 수신 전용이다.** 요청 프레임(1·4·28·29·32)을 이 함수로 읽으면 전부 드롭된다. 게이트웨이 쪽을 흉내 내는 코드는 `Envelope.getRootAsEnvelope` 를 직접 쓸 것 (`fake-gateway.ts` 참조).
2. **드롭 카운터는 두 개다.** 코덱은 `FrameReader` 인스턴스별(`droppedFrameCount`), 파서는 모듈 전역(`droppedEnvelopeCount()`). 테스트에서 후자는 `resetDroppedEnvelopeCount()` 로 격리할 것.
3. **`change_sign` 1자 위반 = 프레임 드롭.** 실 게이트웨이가 빈 `change_sign` 을 정상적으로 보내는 상황이 관측되면 이 규율을 재검토해야 한다(현재는 fbs 주석 "원문 1자"를 근거로 엄격히 간다).
4. **`typecheck:tests` 를 verification 에 포함할 것.** 헬퍼는 루트 typecheck 가 보지 않는다.
5. **계좌 상한 상수 4종은 이미 `envelope.ts` 에 있다.** D-25 게이트 뒤 plan 은 값을 새로 고르지 말고 그대로 쓸 것.
6. **`sync-relay-schema.sh` 재실행 시 `RELAY=` 명시** (15-01 과 동일 주의).

## Self-Check

- 생성 주장 파일 존재 확인: `relay/src/dma/msg-type.ts` · `relay/src/dma/codec.ts` · `relay/src/dma/envelope.ts` · `relay/src/dma/__tests__/codec.test.ts` · `relay/src/dma/__tests__/envelope.test.ts` · `relay/tests/helpers/frames.ts` · `relay/tests/helpers/fake-gateway.ts` · `relay/tests/helpers/ws-client.ts` · `relay/tests/fake-gateway.test.ts` · `relay/tsconfig.tests.json` — 전부 FOUND
- 커밋 존재 확인: `b4f0e21` · `e1a448b` · `76a4ebc` — 전부 FOUND

## Self-Check: PASSED

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-05*
