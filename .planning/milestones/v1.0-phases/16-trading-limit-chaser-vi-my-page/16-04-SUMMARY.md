---
phase: 16-trading-limit-chaser-vi-my-page
plan: 04
subsystem: api
tags: [flatbuffers, relay, dma, limit-chaser, vi-trigger, codec, typescript]

# Dependency graph
requires:
  - phase: 16-01
    provides: gh-trade 정본 재동기화된 relay 생성 코드 (SetLimitChaser 45슬롯 · cancel_qty_track_baseline 포함)
  - phase: 16-03
    provides: RelayLimitChaserInput · RelayViTrigger 등 shared 전략 계약 타입, RelayLcSetSchema zod 경계
provides:
  - MSG 상수에 전략 요청 7종(10/11/14/21/24/33/34) + 응답 7종(56/60/61/64/65/72/73) 추가
  - INBOUND_MSG_TYPES 12종 → 19종 확장 + 새 유입 집합의 하류 처리 책임을 상단 주석에 열거 (PC-12)
  - envelope.ts 전략 요청 빌더 7종 (SetLimitChaser · SetVITrigger · ConfirmVIOrder · DisableStrategies · 빈 요청 3종)
  - 단일문자 와이어 변환 toWireCrud · toWireWatchSide
  - uint/ubyte 와이어 표현 범위 가드 + LC_FIXED_SWEEP_* 고정 3 상수
  - shared 배럴에 16-03 전략 계약 타입 재export (16-03 누락 보완)
affects: [16-05, 16-06, 16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FlatBuffers 테이블 조립은 startXxx + addXxx + endXxx 개별 호출만 — 위치 인자 create* 금지"
    - "와이어 폭 절단(truncateToWire)은 서버 strncpy 와 동형으로 맞추고 절단 사실을 로그로 남긴다"
    - "표현 범위 가드(uint/ubyte)는 envelope.ts, 정책 범위(1~100 · 1~90)는 zod 스키마 — 한 곳에만"

key-files:
  created: []
  modified:
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - packages/shared/src/index.ts

key-decisions:
  - "sweep 고정 3(sweepRecalcEnabled=true · sweepMinCount=0 · sweepMinRate=0)은 입력값과 무관하게 relay 가 못박는다 — 서버 Case3 경로가 실사용 검증된 적이 없어 브라우저가 열 수 있게 두면 미검증 발주 경로가 열린다. 조용히 덮지 않고 divergence 시 경고를 남긴다"
  - "market 변환은 기존 toWireMarket 재사용 — 플랜의 toWireMarketCode 신설은 「단일문자 변환은 한 곳에만」 원칙과 충돌하므로 중복 정의하지 않았다"
  - "정책 범위 검증(sellOrderRatio 1~100 · sellQtyTrackRatio 1~90)은 envelope.ts 에 복제하지 않는다 — RelayLcSetSchema 가 정본이고 두 곳에 적으면 언젠가 갈라진다"
  - "DisableStrategiesReq.key 상한은 문자 길이가 아니라 UTF-8 바이트로 잰다 (Buffer.byteLength) — 서버가 바이트로 자른다"
  - "16-05 로 미룬 왕복 단언 대신 생성 접근자로 직접 되읽는 빌더 테스트 12케이스를 지금 넣었다 — 파서 버그가 빌더 버그를 가리지 않게"

patterns-established:
  - "화이트리스트 확장 시 유입 집합을 상단 주석에 전부 열거하고 개수를 테스트로 못박는다 (PC-12)"
  - "S→C 전용 필드는 송신 코드에 아예 등장시키지 않는다 — 남아 있는 것만으로 「왕복하는 값」 착각을 만든다 (Pitfall 6)"
  - "조립 실패는 전부 OrderBuildError(코드 + 사유) — 조용한 드롭 금지 (PC-7/S-2)"

requirements-completed: [TRADE-03]

# Metrics
duration: 21min
completed: 2026-09-08
---

# Phase 16 Plan 04: relay codec 송신 절반 Summary

**MsgType 화이트리스트를 19종으로 넓히고, 상따·VI 전략 요청 빌더 7종을 위치 인자 없이 addXxx 개별 호출로 조립 — S→C 전용 4필드 송신 0건, sweep 고정 3 못박음**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-08T19:23:00Z
- **Completed:** 2026-09-08T19:44:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `MSG` 에 전략 14종(요청 7 · 응답 7)을 **생성 enum 값과 대조해** 추가하고, `INBOUND_MSG_TYPES` 를 12 → 19 종으로 확장했다. 상단 주석의 「상따/VI 계열 제외」를 D-01 근거로 뒤집으면서, 새로 통과하는 7종(56/60/61/64/65/72/73)과 **여전히 제외하는 것**(27/57 종목마스터 · 20 단건조회 · 26/68 Reconcile · 30/31/70 NXT 상따 · 74/75 거래원)을 함께 명시했다.
- 전략 요청 빌더 7종을 추가했다. 45슬롯 `SetLimitChaser` 를 `startSetLimitChaser` + `addXxx` 33회 + `endSetLimitChaser` 로 조립해, deprecated 8슬롯 때문에 인자가 밀려도 컴파일되는 위치 인자 함수의 함정(T-16-05)을 구조적으로 봉쇄했다.
- 빌더 왕복 테스트 12케이스를 넣어 **S→C 전용 4필드 미송신**·**sweep 고정 3 못박기**·**12자 절단**·**범위 위반 throw**·**요청 7종의 수신 화이트리스트 비통과**를 단언했다.
- 16-03 이 shared 배럴에 등록하지 않은 전략 계약 타입 20종을 재export 해 패키지 밖 import 를 복구했다.

## Task Commits

1. **Task 1: msg-type.ts 화이트리스트 확장 + 유입 집합 열거** — `d33f2a4` (feat)
2. **Rule 3 선행 보완: shared 배럴 재export 누락** — `7783a42` (fix)
3. **Task 2: envelope.ts 전략 요청 빌더 7종** — `7418c17` (feat)

## Files Created/Modified

- `relay/src/dma/msg-type.ts` — MSG 14종 추가(요청 7 · 응답 7), INBOUND 19종, 상단 주석이 유입 집합과 하류 처리 책임을 열거
- `relay/src/dma/envelope.ts` — 전략 요청 빌더 7종 + `toWireCrud`/`toWireWatchSide` + `toWireUint`/`toWireUByte`/`truncateToWire` + `LC_FIXED_SWEEP_*`·`VI_PRICE_TYPE`·`MAX_STRATEGY_KEY_BYTES` 상수
- `relay/src/dma/__tests__/codec.test.ts` — INBOUND size 19 단언, 유입 집합 7종 대조, 요청 7종 비수신 단언
- `relay/src/dma/__tests__/envelope.test.ts` — 「전략 요청 조립」 describe 12케이스
- `packages/shared/src/index.ts` — 16-03 전략 계약 타입 20종 재export

## Decisions Made

**1. sweep 고정 3은 relay 가 못박되, 조용히 덮지 않는다.**
`RelayLcSetSchema` 는 `sweepRecalcEnabled`/`sweepMinCount`/`sweepMinRate` 를 브라우저에서 받도록 열려 있지만, 빌더는 입력과 무관하게 `true`/`0`/`0` 을 쓴다. WinForms 가 한 번도 다른 값을 보낸 적이 없어 서버의 Case3 경로가 실사용 검증된 적이 없기 때문이다. 다만 입력이 고정값과 다르면 `logger.warn` 으로 덮어썼다는 사실을 남긴다 (PC-7 무로그 fail-safe 금지).
→ **16-07/16-08 참고사항:** 웹앱이 이 3필드를 UI 로 노출할 이유가 없다. zod 스키마가 받는다고 해서 왕복하지 않는다.

**2. `toWireMarketCode` 를 신설하지 않고 기존 `toWireMarket` 을 재사용했다.**
플랜은 `toWireMarketCode`/`toWireCrud`/`toWireWatchSide` 3종 신설을 지시했으나, `RelayLimitChaser.market` 은 `OrderMarket = "K" | "Q"` 로 기존 `toWireMarket` 의 입출력과 완전히 같다. 같은 파일 안에 동형 함수를 둘 두면 플랜이 명시한 「단일문자 변환은 한 곳에만」 원칙 자체가 깨진다. `toWireCrud`·`toWireWatchSide` 2종만 추가했다.

**3. 표현 범위와 정책 범위를 분리했다.**
`toWireUint`/`toWireUByte` 는 uint32·ubyte 로 **표현 가능한가**만 본다(넘기면 조용히 감싸 전혀 다른 값이 되므로). `sellOrderRatio` 1~100, `sellQtyTrackRatio` 1~90 같은 서버 정책 범위는 `relay/src/ws/protocol.ts` 의 zod 스키마 한 곳에만 둔다 — 복제하면 언젠가 갈라지고, 갈라지면 어느 쪽이 정본인지 알 수 없다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shared 배럴에 16-03 전략 계약 타입 재export 누락**
- **Found during:** Task 2 (envelope.ts 빌더 조립)
- **Issue:** 16-03 이 `packages/shared/src/relay.ts` 에 `RelayLimitChaserInput` 등 20종을 추가했지만 `src/index.ts` 배럴에 등록하지 않아, 패키지 밖에서 import 시 `TS2459: declares 'RelayLimitChaserInput' locally, but it is not exported` 로 컴파일이 막혔다. 16-03 자체 테스트는 상대 경로 import 라 이 결손을 만나지 않는다.
- **Fix:** 상태 3종(+파생 4) · 인바운드 6종 · 아웃바운드 7종을 배럴에 재export
- **Files modified:** `packages/shared/src/index.ts`
- **Verification:** `pnpm typecheck` exit 0 (relay·webapp·workers 전체)
- **Committed in:** `7783a42`

**2. [Rule 1 - Bug] msg-type.ts 재작성 중 GetQuoteResp(58)·QuoteUpdate(59) 유실**
- **Found during:** Task 1
- **Issue:** 파일 전체 재작성 과정에서 기존 상수 2종이 `MSG` 에서 빠졌는데 `INBOUND_MSG_TYPES` 는 여전히 참조 — 호가 스냅샷/증분 경로가 통째로 깨졌을 것이다.
- **Fix:** 커밋 전 복원
- **Verification:** `codec.test.ts` 의 생성 enum 대조 + INBOUND size 19 단언 통과, 기존 호가 테스트 green
- **Committed in:** `d33f2a4` (Task 1 커밋에 포함 — 커밋 전 수정)

### 계획된 범위를 넘어 추가한 것

**3. [Rule 2 - Missing Critical] 빌더 7종 왕복 테스트 12케이스**
- **Found during:** Task 2
- **Issue:** 플랜은 왕복 단언을 16-05 Task 2 로 미뤘으나, 그때는 파서(16-05)를 함께 쓰게 되어 **파서 버그가 빌더 버그를 가릴 수 있다**. T-16-05(위치 인자 오조립)의 실질 방어선은 grep 게이트 하나뿐이었고, grep 은 「슬롯을 잘못 골랐다」·「S→C 필드를 실었다」를 잡지 못한다.
- **Fix:** 생성 접근자로 직접 되읽는 `describe("전략 요청 조립")` 12케이스 추가 (`envelope.test.ts`)
- **Files modified:** `relay/src/dma/__tests__/envelope.test.ts`
- **Verification:** relay 전체 262 tests green
- **Committed in:** `7418c17`

---

**Total deviations:** 3 (1 blocking, 1 bug, 1 missing-critical)
**Impact on plan:** 셋 다 플랜 목표에 종속적이다. 1번이 없으면 Task 2 가 컴파일되지 않고, 2번은 회귀, 3번은 threat register T-16-05 의 유일한 방어선을 grep 하나에서 실측 단언으로 보강한 것이다. 스코프 크립 없음.

## Issues Encountered

**worktree 베이스가 wave 2 이전이었다.** 이 worktree 는 `e018095`(wave 1 직후)에서 갈라져 있었고, `depends_on` 이 가리키는 16-03 의 산출물(`RelayLimitChaserInput`)이 트리에 없었다. 오케스트레이터가 준 베이스 `399ade3`(wave 2 완료 시점)을 **fast-forward merge** 로 당겨와 해결했다 — `reset --hard`/`clean` 은 쓰지 않았다. 충돌 0건.

**`@gh-radar/shared` dist 미빌드.** 새 worktree 라 `packages/shared/dist` 가 없어 vitest 가 `Failed to resolve entry for package` 로 전량 실패했다. `pnpm --filter @gh-radar/shared run build` 로 해결. 루트 `pnpm typecheck` 는 shared build 를 선행하지만 `vitest` 단독 실행은 그렇지 않다.

**플랜의 grep 게이트가 자기 설명 주석에 걸렸다.** 「위치 인자 함수를 쓰지 않는 이유」를 설명하는 주석에 `createSetLimitChaser(` 리터럴이 들어가 `grep -c ... == 0` 게이트가 1을 냈다. 주석을 `create*` 표기로 바꿔 게이트 의미(실사용 0건)를 지켰다.

## Verification

| 검증 | 결과 |
|------|------|
| `pnpm typecheck` (shared build + 전 패키지) | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 (relay `tests/` 는 루트 typecheck 가 제외 — 별도 실행) |
| `pnpm --filter @gh-radar/relay test` | 15 files / **262 tests** passed |
| `grep -c "createSetLimitChaser(\|createSetVITrigger(\|createConfirmVIOrderReq(\|createDisableStrategiesReq(" envelope.ts` | **0** |
| `grep -c "startSetLimitChaser" envelope.ts` | **1** |
| `grep -c "addSellOrderQty\|addSellQtyTrackBaseline\|addSellEntryLatched\|addCancelQtyTrackBaseline" envelope.ts` | **0** |
| `grep -cE "export function build(GetLimitChaserListReq\|...)" envelope.ts` | **7** |
| `grep -c "상따/VI/종목마스터 계열…제외" msg-type.ts` | **0** |

## Known Stubs

없음. 플랜 범위의 송신 절반은 전부 실동작한다. 수신 파서(16-05)와 Hub 분기(16-06)가 아직 없어 확장된 화이트리스트 7종은 **현재 `tryParseEnvelope` 를 통과한 뒤 `SubscriptionHub.#onFrame` 의 기존 switch 에서 처리되지 않는다** — 16-06 이 명시 `case` 를 넣기 전까지의 의도된 중간 상태이며, msg-type.ts 상단 주석이 그 책임을 기록하고 있다.

## User Setup Required

None — 외부 서비스 설정 없음.

## Next Phase Readiness

**16-05 (파서) 로 넘길 것:**
- 응답 7종이 화이트리스트를 통과한다. 파서가 없으면 Hub 의 `default:` 로 떨어지므로 **16-06 과 짝으로 완결**되어야 한다.
- `LC_FIXED_SWEEP_RECALC_ENABLED`/`LC_FIXED_SWEEP_MIN_COUNT`/`LC_FIXED_SWEEP_MIN_RATE` 를 export 해 뒀다. 16-05 Task 2 의 왕복 단언은 리터럴 대신 이 상수를 쓰면 정본이 하나로 유지된다.
- `parseLimitChaser` 는 **37필드 전부**(S→C 전용 4 포함)를 읽어야 한다. 빌더가 안 보내는 것과 파서가 안 읽는 것은 다른 문제다.
- 파생 `key` 는 `${isin}:${accountNo}:${exchange}` 로 파서가 채운다. 빌더가 12자 절단한 값과 같은 절단본을 써야 키가 맞는다.

**16-06 (Hub) 로 넘길 것:**
- 명시 `case` 가 필요한 7종: 56 · 60 · 61 · 64 · 65 · 72 · 73. `msg-type.ts` 상단 주석이 이 목록의 정본이다.
- 프리페치 3연발은 `buildGetLimitChaserListReq()` · `buildGetVITriggerReq()` · `buildGetVIOrderListReq()` 를 그대로 쓰면 된다.

**16-07/16-08 (웹앱) 로 넘길 것:**
- sweep 고정 3은 UI 노출 대상이 아니다 (Decisions #1).
- `checkRate` 는 정수 %, `sweepMinRate` 는 BasisPoints — **단위가 다르다** (Pitfall 5). 빌더 JSDoc 에 박아 뒀다.

**우려:** 없음. 다만 이 브랜치는 `399ade3` 을 merge 한 상태라 오케스트레이터 머지 시 wave 2 커밋이 이미 master 에 있어 no-op 으로 흡수된다.

## Self-Check: PASSED

- 파일 6/6 존재 확인 (msg-type.ts · envelope.ts · codec.test.ts · envelope.test.ts · shared/index.ts · 본 SUMMARY)
- 커밋 3/3 브랜치에 존재 확인 (`d33f2a4` · `7783a42` · `7418c17`)
- 삭제된 추적 파일 0건, untracked 잔여 0건

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
