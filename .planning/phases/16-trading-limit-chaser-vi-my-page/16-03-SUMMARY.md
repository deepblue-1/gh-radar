---
phase: 16-trading-limit-chaser-vi-my-page
plan: 03
subsystem: relay
tags: [contract, zod, websocket, flatbuffers, limit-chaser, vi, dma-order]

# Dependency graph
requires:
  - phase: 15-dma-relay-kb-gh-trade-server-10-wss
    provides: "packages/shared/src/relay.ts 계약 파일, relay/src/ws/protocol.ts zod + total parser, relay/src/ws/fanout.ts 인바운드 디스패치"
  - phase: 16-trading-limit-chaser-vi-my-page
    plan: 01
    provides: "SetLimitChaser 45슬롯 생성 코드 — cancelQtyTrackBaseline 접근자(field 44)"
provides:
  - "RelayLimitChaser / RelayViTrigger / RelayViOrderItem — 전략 상태 3종 와이어 타입"
  - "RelayLimitChaserInput — S→C 전용 4필드를 뺀 33필드 입력 타입 (Omit 파생)"
  - "인바운드 6종 계약: lc.set · vi.set · vi.confirm · strategies.disable · order.new · order.cancel"
  - "아웃바운드 7종 계약: lc · lc.snap · vi · vi.list · vi.notice · strategies.disabled · order.result"
  - "RelayInboundSchema 9종 판별 유니온 — 전략·주문 인바운드의 형식·범위 검증 경계"
  - "fanout.ts 인바운드 분기 순서 교정 — 새 메시지 타입 추가가 keyOf 를 깨지 않는다"
affects: [16-04, 16-05, 16-06, 16-07, 16-08, 16-09, 16-10, 16-11, 16-12, 16-13, 16-14, 16-15, 16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "게이트웨이가 조용히 거부하는(게이트를 눕히는) 값 범위는 relay zod 경계를 서버 검증과 동형으로 잡아 요란하게 거부한다"
    - "S→C 전용 필드는 Omit 파생 타입으로 인바운드에서 구조적으로 제거한다 — 주석 경고가 아니라 타입으로 막는다"
    - "판별 유니온에 멤버를 추가하기 전에 디스패치의 좁히기 순서를 먼저 고친다 (공통 필드 가정 제거)"

key-files:
  created:
    - relay/tests/protocol.test.ts
  modified:
    - packages/shared/src/relay.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts

key-decisions:
  - "order.result.status 를 DmaOrderStatus | \"timeout\" 이 아니라 DmaOrderStatus 로 둔다 — \"timeout\" 은 이미 그 유니온의 멤버라 덧붙이면 밖의 값처럼 읽힌다"
  - "전략 상태 3종을 인바운드 섹션 앞의 독립 섹션에 둔다 — 인바운드(Omit 파생)와 아웃바운드가 함께 참조하므로 어느 한쪽에 넣으면 방향이 잘못 읽힌다"
  - "RelayLcCrud / RelayLcWatchSide 를 이름 있는 타입으로 승격 — OrderSide·OrderMarket 선례와 같은 규약이고 webapp 이 리터럴을 흩뿌리지 않게 한다"
  - "fanout.ts 의 미구현 인바운드는 close 가 아니라 warn 로그 + 무시 — 프로토콜 위반이 아니므로 연결을 끊으면 16-07/16-08 착지 후 되돌려야 한다"
  - "relay/tests/helpers/frames.ts 의 기존 타입 오류는 고치지 않는다 — 16-02 가 같은 파일을 소유한 병렬 wave 라 고치면 머지 충돌이 난다"

patterns-established:
  - "인바운드 스키마 테스트는 '거부'만이 아니라 경계 안쪽의 '통과'도 함께 고정한다 — 과잉 차단도 조용한 거부다"
  - "로그 마스킹 검증은 logger 전 레벨을 스파이해 JSON.stringify 덤프에 비밀 문자열이 없음을 단언한다"

requirements-completed: [TRADE-03]

# Metrics
duration: 22min
completed: 2026-09-08
---

# Phase 16 Plan 03: 전략·주문 wss 메시지 계약 Summary

**브라우저와 relay 가 상따·VI·주문을 주고받을 단일 타입 계약(상태 3종 + 인바운드 6종 + 아웃바운드 7종)을 shared 에 못박고, 인바운드 6종을 게이트웨이 검증과 동형인 zod 경계로 거부 가능하게 만들었다**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-08T09:56Z
- **Completed:** 2026-09-08T10:18Z
- **Tasks:** 2
- **Files modified:** 4 (created 1, modified 3)
- **Tests:** relay 216 → **240** (신규 24)

## Accomplishments

- **와이어 계약이 하나로 확정됐다.** `packages/shared/src/relay.ts` 에 `RelayLimitChaser`(활성 37필드 + 파생 `key`) · `RelayViTrigger` · `RelayViOrderItem` 을 더하고, 인바운드 6종·아웃바운드 7종을 각 유니온에 append 했다. 이제 relay 3층(codec/hub/fanout)과 webapp 이 서로를 탐색하지 않고 이 파일에 대해 병렬 구현할 수 있다.
- **S→C 전용 4필드를 타입으로 막았다.** `RelayLimitChaserInput = Omit<RelayLimitChaser, "sellOrderQty" | "sellQtyTrackBaseline" | "sellEntryLatched" | "cancelQtyTrackBaseline" | "key">` 로 클라 입력 30 + 고정 3 = **33필드**만 남긴다. 주석 경고가 아니라 구조로 막았고, zod 도 같은 33필드만 받으므로 실려 와도 통과하지 못한다(테스트로 고정).
- **조용한 거부를 요란한 거부로 바꿨다.** 게이트웨이는 범위를 벗어난 설정을 거부하는 대신 **게이트를 눕혀 저장**하고 `ServerMessage ERROR` 만 따로 보낸다. `sellOrderRatio` 1~100 · `sellQtyTrackRatio` 1~90 · ubyte 0~255 · `qty`/`price` positive · `key` 64자 · `orderNo` 1~10자를 서버 검증과 **같은 경계**로 잡아, 눕혀진 채 저장되기 전에 relay 에서 끝낸다 (T-16-05).
- **주문 판별자 충돌을 구조적으로 피했다.** 기존 아웃바운드 `RelayOrderMsg.t === "order"` 를 그대로 두고 인바운드는 `order.new`/`order.cancel`, 상관 응답은 `order.result` 로 접미사를 갈랐다 (Pitfall 15). 테스트가 `{t:"order"}` 인바운드를 `null` 로 거부하는 것까지 고정한다.
- **D-08 → D-02 서술이 두 파일에서 뒤집혔다.** `protocol.ts` 상단 「주문 메시지를 받지 않는다 … `POST /api/orders` 전용 (D-08)」 이 사라지고, shared 헤더의 D-22 와 `CreateOrderRequest`/`CreateOrderResponse`/`RelayOrderMsg`/`RelayUnfilled.code` JSDoc 이 「wss 단일 경로, 16-16 에서 REST 제거」로 갱신됐다.
- **판별 유니온 확장이 디스패치를 깨는 함정을 먼저 제거했다** (Pitfall 14 — 아래 Deviations #1).

## Task Commits

1. **Task 1: shared 계약에 전략·주문 메시지 타입 추가** — `b9c8d4f` (feat)
2. **Task 2: relay protocol.ts 인바운드 zod 확장 + 경계 테스트** — `86c182b` (feat)

## Files Created/Modified

- `packages/shared/src/relay.ts` — 「전략 상태」 섹션 신설(`RelayLcCrud`·`RelayLcWatchSide`·`RelayLimitChaser`·`RelayLimitChaserInput`·`RelayViTrigger`·`RelayViOrderState`·`RelayViOrderItem`) + 인바운드 6종·아웃바운드 7종 + 유니온 append + D-02 문서 갱신
- `relay/src/ws/protocol.ts` — `AccountNoSchema`/`UIntSchema`/`UByteSchema`/`RidSchema` 헬퍼 + 스키마 6종 + `RelayInboundSchema` 9종 유니온 + 상단 주석 D-01/D-02 교체
- `relay/src/ws/fanout.ts` — `#onAuthedMessage` 좁히기 순서 교정 (Deviations #1)
- `relay/tests/protocol.test.ts` — **신규**, 24 케이스 (6종 파싱 · 경계 거부 · 로그 마스킹 · 미지 `t` 거부)

## Decisions Made

1. **`order.result.status` 는 `DmaOrderStatus` 단독.** 계획서는 `DmaOrderStatus | "timeout"` 을 지시했지만 `"timeout"` 은 **이미 `DmaOrderStatus` 의 멤버**다(`relay.ts` 기존 정의). 덧붙이면 TS 가 같은 타입으로 접으면서도 읽는 사람에게는 "유니온 밖의 특수값"처럼 보인다. 타입은 `DmaOrderStatus` 로 두고 JSDoc 에 「`"timeout"` 을 포함한 수명주기 상태」 + 「실패가 아니라 결과를 모름」(Pitfall 9)을 명시했다.
2. **전략 상태 3종을 독립 섹션에 배치.** 인바운드는 `Omit` 파생으로, 아웃바운드는 그대로 참조한다. 어느 한 섹션에 넣으면 방향이 잘못 읽히므로 「인바운드·아웃바운드 공용」 섹션을 인바운드 앞에 새로 열었다.
3. **`RelayLcCrud` / `RelayLcWatchSide` 를 이름 있는 타입으로 승격.** 인라인 `"C" | "D"` 로 둘 수도 있었으나, 같은 파일이 `OrderSide`·`OrderType`·`OrderMarket` 을 전부 이름 있는 타입으로 두는 규약이고, webapp 이 `"0"`/`"1"` 리터럴의 의미를 코드에서 유추하지 않아도 되게 한다.
4. **미구현 인바운드는 warn 로그 후 무시(연결 유지).** `fanout.ts` 에서 전략·주문 메시지는 **프로토콜 위반이 아니다** — 스키마를 통과한 정당한 메시지이고 핸들러만 아직 없다. `close(4400)` 로 끊으면 16-07/16-08 착지 후 되돌려야 하고, 조용히 버리면 PC-7 위반이다. 그래서 `logger.warn({ userId, t: msg.t }, "아직 처리기가 없는 인바운드 — 무시")` 로 기록만 남긴다.
5. **`orgOrderNo` 상한을 두지 않았다.** `vi.confirm.orderNo` 는 서버 `ConfirmVIOrderReq` 규약이 10자로 확인돼 `max(10)` 을 걸었지만, `DirectOrderReq` 의 원주문번호 폭은 `.fbs` 주석에도 RESEARCH 에도 없다. 계획서 지시(`z.string().min(1)`)를 그대로 따랐다 — 검증되지 않은 상한으로 정당한 취소를 막는 쪽이 더 나쁘다. `maxPayload` 64KB 가 상위 방어로 남아 있다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 인바운드 유니온 확장이 `fanout.ts` 디스패치를 깨뜨림 (Pitfall 14)**

- **Found during:** Task 1 (`pnpm typecheck`)
- **Issue:** `#onAuthedMessage` 가 `unauthorized` 가드 직후 `keyOf(msg.isin, msg.ex)` 를 **무조건** 호출한다. `isin`/`ex` 는 시세 구독 2종에만 있는 필드라, 인바운드 유니온에 전략·주문 6종을 더하는 순간 `TS2339` 6건으로 relay 타입체크가 실패했다. RESEARCH Pitfall 14 가 예고한 그대로다 — 「분기 순서를 먼저 바꾼 뒤 새 메시지를 추가한다」.
- **Fix:** `keyOf` 호출 **앞에** `if (msg.t !== "sub" && msg.t !== "unsub")` 좁히기를 넣고, 그 분기에서 미구현 인바운드를 warn 로그 후 반환한다. 이후 `sub`/`unsub` 경로는 손대지 않았고 이 자리가 16-07/16-08 핸들러의 착지점이 된다.
- **Files modified:** `relay/src/ws/fanout.ts`
- **Verification:** `pnpm typecheck` exit 0 (13 워크스페이스 전부 Done), relay 216 테스트 전부 그대로 통과.
- **Committed in:** `b9c8d4f`

**2. [Rule 2 - 문서 정합] `RelayUnfilled.code` 의 「`POST /api/orders` 가 취소 키로 받는다」 서술이 D-02 와 모순**

- **Found during:** Task 1
- **Issue:** 계획은 `RelayOrderMsg`·`CreateOrderRequest`/`Response` 의 D-08/D-22 문구 갱신만 지시했으나, 같은 파일 `RelayUnfilled.code` JSDoc 에 「`POST /api/orders` 가 ISIN 이 아니라 이 값을 받으므로 … 없으면 그 행의 취소 버튼을 열지 않는다」 가 남아 있었다. D-02 에서 취소는 `RelayOrderCancelMsg` 가 **`isin`** 을 키로 쓰므로, 그대로 두면 16-09 이후 구현자가 단축코드 없는 행의 취소 버튼을 불필요하게 잠근다.
- **Fix:** 「표시용이며 취소는 `isin` 을 키로 쓴다 — 없으면 UI 가 ISIN 을 대신 보여준다」로 교체.
- **Files modified:** `packages/shared/src/relay.ts`
- **Committed in:** `b9c8d4f`

---

**Total deviations:** 2 auto-fixed (Rule 3 블로킹 1 · Rule 2 문서정합 1)
**Impact on plan:** 스코프 확장 없음. #1 은 계획이 참조한 RESEARCH 가 이미 예고한 선행 조건이고, #2 는 같은 파일 안에서 계획이 놓친 같은 종류의 문구다. 둘 다 계약 확정의 필요조건이라 후속 plan 으로 미룰 수 없었다.

## Deferred Issues (스코프 밖 — 고치지 않음)

**`relay/tests/helpers/frames.ts:365` — `createUnfilledState` 인자 10 ≠ 11 (`TS2554`)**

- **성격:** 이 plan 이 만든 것이 아니다. 16-01 이 `UnfilledState` 를 9 → 10 슬롯으로 재동기화(`orderTime` 추가)하면서 생긴 **기존 실패**이고, 내 base 커밋(`8fdcda9`)에 이미 있었다. `git status` 로 이 파일 무변경을 확인했다.
- **왜 고치지 않았나:** `relay/tests/helpers/frames.ts` 는 **동시 실행 중인 16-02 의 `files_modified` 에 명시된 파일**이다(16-02 는 같은 wave 2). 여기서 고치면 머지 충돌이 나고, 16-02 는 `orderTime` 을 포함한 프레임 헬퍼 확장을 이미 계획에 담고 있다.
- **영향 범위:** `pnpm --filter @gh-radar/relay run typecheck:tests` 한 경로뿐이다. 루트 `pnpm typecheck` 는 `tsconfig.json` 이 `tests/` 를 exclude 하므로 영향 없고, vitest 는 타입을 보지 않으므로 **240 테스트 전부 통과**한다.
- **확인:** 내 신규 `relay/tests/protocol.test.ts` 는 `typecheck:tests` 에 **오류를 0건 추가**한다(보고된 오류는 `frames.ts` 1건뿐).

> 이 항목을 phase 디렉터리의 공유 `deferred-items.md` 대신 여기 적었다 — 병렬 wave 에서 두 executor 가 같은 파일을 새로 만들면 add/add 충돌이 난다. SUMMARY 는 plan 별로 이름이 갈리므로 충돌 표면이 없다.

## Acceptance Criteria 검증

### Task 1

| 게이트 | 기대 | 실제 | 결과 |
|--------|------|------|------|
| `grep -c "RelayLimitChaser\b"` | >= 3 | **5** | PASS |
| 인바운드 6종 리터럴 | >= 6 | **8** | PASS |
| 아웃바운드 7종 리터럴 | >= 7 | **8** | PASS |
| `grep -c "bigint"` | == 0 | **0** | PASS |
| `grep -c "cancelQtyTrackBaseline"` | >= 1 | **3** | PASS |
| `pnpm --filter @gh-radar/shared build` | exit 0 | exit 0 | PASS |
| `pnpm typecheck` | exit 0 | exit 0 | PASS |

### Task 2

| 게이트 | 기대 | 실제 | 결과 |
|--------|------|------|------|
| 스키마 6종 심볼 출현 | >= 12 | **12** | PASS |
| `grep -c "POST /api/orders 전용"` | == 0 | **0** | PASS |
| `protocol.test.ts` 케이스 수 | >= 7 | **24** | PASS |
| `pnpm --filter @gh-radar/relay test` | exit 0 | exit 0 (240/240) | PASS |
| `pnpm typecheck` | exit 0 | exit 0 | PASS |
| `grep -c "z.string().length(12)"` | == 1 | **0** | 아래 참조 |

**마지막 게이트 문언 불일치 1건 (16-01 선례와 같은 유형, 기록용).** 게이트의 **의도**는 「IsinSchema 재정의 없음 — 재사용 확인」인데, 리터럴 `z.string().length(12)` 는 이 저장소의 실제 코드와 형태가 다르다. Phase 15 가 남긴 `IsinSchema` 는 prettier 로 3줄에 걸쳐 있어(`z\n  .string()\n  .length(12)\n  .regex(...)`) 한 줄 grep 이 애초에 0 이다 — 내 변경 **이전에도 0** 이었다. 의도는 직접 실측해 충족을 확인했다:

| 실측 | 결과 |
|------|------|
| `grep -n 'length(12)'` | **1건** (`:40`, `IsinSchema` 정의 안) |
| `IsinSchema` 정의 | **1건** (`:38`) · 사용 5건 (기존 2 + 신규 3) |
| `ExchangeSchema` 정의 | **1건** (`:44`) · 사용 6건 (기존 2 + 신규 4) |

즉 **재정의 0건, 재사용만 있다** — 게이트가 막으려던 것은 일어나지 않았다.

## Verification 결과

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared build` | exit **0** (ESM/CJS/DTS 전부 success) |
| `pnpm typecheck` | exit **0** — 13 워크스페이스 전부 Done |
| `pnpm --filter @gh-radar/relay test` | exit **0** — **15 파일 / 240 테스트 통과** (기존 216 + 신규 24) |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | 오류 1건 — **전부 기존 `frames.ts`** (위 Deferred 참조). 신규 테스트 파일 기여 **0건** |
| 커밋 파일 삭제 | 두 커밋 모두 **0건** (`git diff --diff-filter=D`) |
| 미추적 잔여 파일 | **0건** (`git status --short` 빈 출력) |

### 알려진 사각지대 대응 (16-02 가 보고한 2건)

1. **root `pnpm typecheck` 는 relay `tests/` 를 exclude 한다** → `relay/tests/protocol.test.ts` 를 새로 만들었으므로 `pnpm --filter @gh-radar/relay run typecheck:tests` 를 **별도로 실행**했다. 신규 파일은 오류 0건.
2. **`webapp/e2e/` 는 어떤 tsc 도 보지 않는다** → 이 plan 은 `webapp/e2e/` 를 건드리지 않는다. 해당 없음.

## Known Stubs

**`relay/src/ws/fanout.ts` — 전략·주문 인바운드 6종의 핸들러가 아직 없다.**

- **위치:** `#onAuthedMessage`, `sub`/`unsub` 좁히기 직전 분기
- **현재 동작:** `logger.warn({ userId, t: msg.t }, "[WS] 아직 처리기가 없는 인바운드 — 무시")` 후 반환. **조용히 버리지 않는다**(PC-7).
- **의도된 것인가:** 그렇다. 이 plan 의 범위는 **계약과 형식 검증까지**다(plan `<objective>` 명시). 실제 중계(FlatBuffer 변환 + DMA 세션 송신)는 **16-07/16-08** 소관이고, 그 자리가 이 분기다.
- **사용자에게 보이는 표면 없음:** webapp 은 아직 이 메시지를 보내지 않는다(전송 코드가 16-09 이후에 생긴다). 빈 값이 UI 로 흐르는 경로가 없다.

## Threat Flags

없음. 계획의 `<threat_model>` 밖 신규 보안 표면이 생기지 않았다.

- **T-16-05 (Tampering):** zod 판별 유니온 + 범위 경계를 게이트웨이 검증과 동형으로 고정(ratio 1~100 · trackRatio 1~90 · qty/price positive · ubyte 0~255). 위반은 `parseInbound → null` → 상위 close(4400). 경계 **안쪽 통과**도 함께 테스트해 과잉 차단(= 또 다른 조용한 거부)을 막았다.
- **T-16-06 (DoS):** `strategies.disable.key` `z.string().max(64)` — 서버 WR-09 와 같은 값. 65자 거부 / 64자 통과를 테스트로 고정.
- **T-16-09 (Information Disclosure):** `parseInbound` 는 첫 issue 의 `path`/`code` 만 남긴다. 테스트 3건이 **계좌번호·토큰·원문 문자열이 로그 덤프에 없음**을 단언한다(전 레벨 logger 스파이). `path` 는 필드 이름이지 값이 아님도 함께 고정.
- **T-16-01 (EoP, transfer):** 이 층은 `accountNo` 를 **형식만** 본다. 소유권 대조는 `session.allowedAccounts` 를 쥔 16-07/16-08 핸들러 책임이며, 이를 `AccountNoSchema` JSDoc · 파일 상단 「하지 않는 것」 · 테스트 파일 헤더 3곳에 명시했다 — 「여기 통과가 곧 권한이 아니다」.

## User Setup Required

없음 — 외부 서비스·시크릿·마이그레이션 변경이 없다. 순수 타입·검증 계층 변경이다.

## Next Phase Readiness

**열린 것:**

- **16-04/16-05 (relay codec):** `RelayLimitChaser` 37필드 이름이 확정됐다. `envelope.ts` 파서 4종(60/61/64·65/72·73/56)이 이 타입으로 좁히면 된다. 64비트 정수 3곳(`orderAmountKrw`·`deadline110Ms`·`deadline119Ms`)은 계약이 `number` 이므로 `toNum()` 통과가 **필수**다 — 빠뜨리면 `encode()` 가 팬아웃 루프에서 throw 한다 (Pitfall 3).
- **16-07/16-08 (relay 핸들러):** `fanout.ts` 의 미구현 분기가 착지점이다. 좁히기 순서는 이미 안전하므로 `if (msg.t === "lc.set")` 류를 그 자리에 추가하면 된다. **계좌 소유권 대조를 반드시 여기서** 한다 (T-16-01).
- **16-09 이후 (webapp):** `RelayLimitChaserInput` 33필드가 폼 상태의 정본이다. `use-relay-socket` 의 `applyFrame` 에 아웃바운드 7종 case 를 추가하면 된다(알 수 없는 `t` 무시 규약 덕에 구버전이 깨지지 않는다).
- **16-16 (REST 제거):** `CreateOrderRequest`/`CreateOrderResponse` JSDoc 에 「16-16 에서 제거」가 박혀 있어 대상이 명확하다.

**후속 plan 이 확인해야 할 것:**

- **`relay/tests/helpers/frames.ts` 타입 오류는 16-02 가 닫아야 한다.** 16-02 머지 후에도 `typecheck:tests` 가 빨간색이면 그때 별도 처리가 필요하다.
- **`market` 을 relay 가 채우는 경로가 실제로 있는지** — `order.new`/`order.cancel` 이 `market` 을 받지 않기로 확정됐으므로, 16-08 이 `SymbolMap` 으로 ISIN → 시장을 채우지 않으면 주문이 조립되지 않는다. 계약이 그 구현을 **전제**한다.
- **16-01 이 남긴 미해소 항목 2건**(`parseOrderResp` 의 `origin` 미읽음 · 51 통보 0행 update 시 insert 분기)은 이 plan 범위 밖이며 그대로 열려 있다.

**블로커:** 없음.

## Self-Check: PASSED

- **파일 4/4 FOUND** — `packages/shared/src/relay.ts` · `relay/src/ws/protocol.ts` · `relay/src/ws/fanout.ts` · `relay/tests/protocol.test.ts`
- **커밋 2/2 FOUND** — `b9c8d4f` · `86c182b` (둘 다 `git cat-file -t` = `commit`)
- **STATE.md / ROADMAP.md 무변경 확인** — worktree 병렬 실행 규약대로 공유 아티팩트를 건드리지 않았다(`git status --short` 빈 출력, 두 커밋의 변경 파일 목록에 없음)

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
