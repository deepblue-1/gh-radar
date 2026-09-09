---
phase: 16-trading-limit-chaser-vi-my-page
plan: 24
subsystem: relay
tags: [zod, flatbuffers, wire-guard, graceful-shutdown, promise, vitest, react]

requires:
  - phase: 16-18
    provides: "`OrderSelector` 판별 유니온(`order_no` 는 `userId` 필수)과 `#drain` 이 그대로 쓰는 재시도·드롭 규율 — 이 plan 은 큐의 **진입/종료 계약**만 바꿨고 셀렉터 계약은 하나도 건드리지 않았다"
  - phase: 16-19
    provides: "`vi-settings-card.submit` 의 세션 가드(`if (locked) return;`) — 금액 상한 가드를 그 **바로 뒤**에 붙였다(순서가 곧 우선순위다)"
  - phase: 16-20
    provides: "`packages/shared/src/relay.ts` 의 현행 계약(`DmaOrderOrigin` 포함) — 새 상수를 그 파일의 VI 절 머리에 얹었다"
provides:
  - "`MAX_VI_ORDER_AMOUNT_KRW`(= 10,000,000,000원) — VI 주문금액 상한의 **단일 정본**. zod·envelope·UI 세 층이 같은 상수를 참조하고 값 복제는 grep 으로 0건이 강제된다"
  - "`MAX_VI_ORDER_AMOUNT_MANWON` (`webapp/src/lib/vi-alert.ts`) — 원 단위 정본에서 `krwToManwon` 으로 **유도한** 만원 상한. 만원 숫자를 직접 적는 곳이 어디에도 없다"
  - "`VI_AMOUNT_LIMIT_MESSAGE` + `data-slot=\"vi-amount-limit\"` — 잘린 이유를 말하는 UI 계약"
  - "`OrderStore.flushNow()` 의 새 계약 — 진행 중 배치를 **기다렸다가** 재큐잉분까지 비우고, 못 비우면 남은 큐 길이를 error 로 남긴다"
  - "`ORDER_FLUSH_MAX_ROUNDS`(= `ORDER_MAX_RETRIES + 2`) — 종료를 영원히 막지 않는 반복 상한"
  - "`OrderStore.#tick` / `flushNow` 의 **비대칭 계약** — tick 은 건너뛰고 종료는 기다린다"
affects: [16-25 상따 폼(같은 shared 계약을 읽는다), 16-26 배포·TRADE-02/03 재판정, 향후 VI 금액을 다루는 모든 표면]

tech-stack:
  added: []
  patterns:
    - "표현 범위 가드는 **와이어 타입이 있는 층 전부**에 건다. 한 층만 막으면 다른 호출 경로가 그 층을 우회한다 — `toWireUint`(상따)의 규율을 VI 경로로 확장한 것이 이 plan 이다"
    - "상한값은 **하나의 상수**로 두고 단위 변환은 기존 변환 함수로 유도한다. 층마다 숫자를 적으면 가장 느슨한 층이 실질 상한이 된다"
    - "입력 상한은 **삼키지 않고 자른다**. 자른 사실과 이유를 한 줄로 남긴다 — 조용한 무반응은 UI 판 무로그 fail-safe 다"
    - "동시성 가드는 `boolean` 이 아니라 **대기 가능한 Promise 핸들**로 둔다. `boolean` 은 「지금 도는가」만 답하고 「끝날 때까지 기다린다」를 답할 수 없다"
    - "같은 자원을 두 경로가 쓰면 규율을 하나로 뭉개지 말고 **경로별 계약을 분리**해 주석으로 못박는다(tick=건너뛴다 / 종료=기다린다)"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/ws/protocol.ts
    - relay/src/dma/envelope.ts
    - relay/src/store/orders.ts
    - relay/src/index.ts
    - webapp/src/lib/vi-alert.ts
    - webapp/src/components/trading/vi-settings-card.tsx
    - relay/tests/protocol.test.ts
    - relay/tests/order-store.test.ts
    - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx

key-decisions:
  - "만원 상한을 카드가 아니라 **`vi-alert.ts`** 에 뒀다. 그 파일이 `MANWON_IN_KRW`·`manwonToKrw`·`krwToManwon` 를 소유한 「단위 변환의 유일 지점」이므로, 유도식도 같은 자리에 있어야 다음 소비자가 자기 방식으로 다시 나누지 않는다"
  - "`UIntSchema` 자체는 손대지 않았다. 그것을 공유하는 상따 필드 20여 개는 `toWireUint` 가 이미 지키고 있어, 공유 스키마에 VI 정책을 얹으면 **관계 없는 필드에 정책 상한이 번진다**"
  - "입력 초과는 **거부가 아니라 클램프**다. 입력을 삼키면 사용자는 왜 안 써지는지 모른다 — 상한으로 자르고 `vi-amount-limit` 한 줄이 이유를 댄다. 자른 결과가 곧 폼 값이라 「다이얼로그 표시값 = 전송값」이 구조적으로 성립한다(T-16-41)"
  - "제출 가드는 입력 클램프가 있어도 **따로 필요하다**. 서버 에코가 상한 밖 금액을 돌려주면 폼 값 자체가 상한을 넘고, 사용자는 아무것도 하지 않았는데 프레임이 zod 에서 통째로 버려진다"
  - "`#flushing: boolean` 을 병행하지 않고 **`#current: Promise|null` 로 완전히 대체**했다. 두 개를 두면 어느 쪽이 정본인지 알 수 없고, `boolean` 이 남아 있으면 다음 사람이 그것으로 다시 즉시반환 분기를 만든다"
  - "tick 과 종료의 계약을 **의도적으로 다르게** 뒀다. tick 이 기다리면 200ms 마다 대기자가 쌓여 장애 중인 Supabase 를 겹쳐 두드린다 — 기다림은 「곧 죽는 프로세스」의 특권이다"
  - "반복 상한을 `ORDER_MAX_RETRIES + 2` 로 두고 상한 도달을 `logger.error` 로 남겼다. 이론상 2회면 끝나지만, 상한이 없으면 「큐가 비지 않는 상태」가 종료를 영원히 막는다(T-16-40)"
  - "기존 케이스 ⑤(재시도 1회 → 다음 호출에 드롭)를 **tick 경로로 이관**했다. 그 규율의 무대는 인터벌 tick 이고, 종료 경로는 이제 반대 계약(한 번에 비운다)을 갖는다 — 한 테스트가 두 계약을 동시에 주장할 수 없다"

patterns-established:
  - "와이어 상한 3층 배치: shared 상수(정본) → zod `.max()`(경계) → 조립기 `throw`(마지막 관문). 테스트도 상수를 참조해 숫자를 복제하지 않는다"
  - "경주 테스트는 sink 안에서 **풀 수 있는 Promise** 로 배치를 붙잡고, 그 사이에 큐를 늘린 뒤 `flushNow()` 가 즉시 settle 되지 않음을 단언한다"

requirements-completed: []  # TRADE-02·TRADE-03 은 16-26 소관 — 아래 「요구사항 판정」 참조

duration: 12min
completed: 2026-09-09
---

# Phase 16 Plan 24: VI 금액 상한 3층 배치 + 종료 플러시 경주 (WR-07 + WR-09) Summary

**브라우저가 넣은 VI 주문금액이 `ulong` 표현 범위를 넘으면 `setBigUint64` 가 modulo 2^64 로 감싸 전혀 다른 금액이 실계좌로 나가던 경로를 shared 상수 하나로 세 층(zod·조립기·UI)에서 동시에 막았고, SIGTERM 이 200ms 인터벌 플러시와 겹치면 마지막 체결 통보가 조용히 사라지던 `flushNow()` 를 「진행 중 배치를 기다렸다 재큐잉분까지 비우는」 계약으로 바꿨다.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-09-09T02:14Z (11:14 KST)
- **Completed:** 2026-09-09T02:26Z (11:26 KST)
- **Tasks:** 2 / 2
- **Files modified:** 11 (신규 0 · 수정 11) — 소스 8 · 테스트 3

## Accomplishments

- **상한 없는 금액이 게이트웨이에 닿지 않는다 (WR-07 / T-16-38).** `MAX_VI_ORDER_AMOUNT_KRW = 10_000_000_000`(원) 하나가 정본이고 ① relay zod (`.max()`) ② `buildSetVITriggerReq`(`OrderBuildError("BAD_ORDER_AMOUNT")`) ③ UI(입력 클램프 + 제출 가드) 세 층이 **같은 상수를 import** 한다. 세 층 어디에도 `10_000_000_000` 리터럴이 없다(grep 0건) — 값을 복제하지 않았다는 사실이 acceptance 로 잠겨 있다.
- **VI 경로가 상따 경로의 규율에 합류했다.** 같은 파일이 `buyOrderPrice` 등에는 `toWireUint`(MAX_UINT32) 가드를 걸고 「넘기면 조용히 감싸 전혀 다른 값이 된다」고 적어 두었는데 VI 필드만 빠져 있었다. 이제 조립기 주석이 「zod 가 먼저 막지만 **조립 단계가 모든 호출 경로의 마지막 관문**」이라는 근거를 코드 옆에 남긴다.
- **확인 다이얼로그가 보여 주는 금액 = 실제 나가는 금액 (T-16-41).** 입력이 상한에서 잘린 **뒤의 값**이 `form.amountManwon` 이고, 요약도 `submit` 도 그 값을 읽는다. 조립 단계가 조용히 다른 값으로 바꾸는 경로가 구조적으로 없다. 「상한 초과 상태에서 `vi.set` 미전송」을 테스트가 잠근다.
- **입력 초과가 조용한 무반응이 아니다.** `parseDigits` 는 상한 검사가 없어 100억을 넘겨 쳐도 그대로 들어갔다. 이제 상한으로 잘리고 `data-slot="vi-amount-limit"` 한 줄이 `주문금액은 최대 1,000,000만원까지 넣을 수 있어요` 로 이유를 댄다. 상한 안쪽으로 되돌리면 안내도 사라진다(영구 경고가 아니다).
- **SIGTERM 이 tick 과 겹쳐도 큐가 빈다 (WR-09 / T-16-39).** `flushNow()` 는 진행 중 배치의 **핸들을 `await`** 한 뒤(그 사이 tick 이 새 배치를 시작할 수 있으므로 while 루프) 큐가 빌 때까지 최대 `ORDER_FLUSH_MAX_ROUNDS`(=3) 회 돈다. 옛 구현은 `#flushing` 이면 즉시 반환했고, 곧바로 `close()` 가 인터벌을 끊어 진행 중 배치 **이후**에 들어온 마지막 체결 통보를 그대로 잃었다.
- **비우지 못하면 그 사실이 로그로 드러난다 (S-5 / T-16-40).** 반복 상한에 걸리면 `queued`·`rounds`·`dropped` 를 실은 `logger.error` 를 남기고 반환한다 — 조용히 포기하지도, 무한히 매달리지도 않는다.
- **tick 의 중복 진입 방지는 그대로다.** `#tick()` 은 `#current !== null` 이면 **건너뛴다**(기다리지 않는다). 두 경로의 계약 차이를 주석과 테스트(⑤ vs ⑮⑯⑰) 양쪽에 못박았다.

## Task Commits

1. **Task 1: VI 주문금액 상한을 zod·envelope·UI 세 층에 같은 값으로 건다 (WR-07)** — `c041f00` (feat)
2. **Task 2: flushNow 가 진행 중 플러시를 기다렸다 큐를 끝까지 비운다 (WR-09)** — `7c5e1fd` (fix)

## Files Created/Modified

### 계약 (정본)

- `packages/shared/src/relay.ts` (+15)
  - `export const MAX_VI_ORDER_AMOUNT_KRW = 10_000_000_000;` — VI 절 머리(`RelayViTrigger` 바로 위)에 배치
  - JSDoc 3항: (a) **원 단위**다(만원이 아니다) (b) fbs `ulong` 이라 상한 없이 통과하면 `setBigUint64` 가 modulo 2^64 로 감싼다 (c) **zod·envelope·UI 세 층의 유일한 정본**이다
- `packages/shared/src/index.ts` — 재export 목록에 추가(기존 한 줄 export 를 여러 줄로 폈다)

### relay

- `relay/src/ws/protocol.ts` (+13/-2)
  - `RelayViSetSchema.orderAmountKrw`: `UIntSchema` → `z.number().int().min(0).max(MAX_VI_ORDER_AMOUNT_KRW)`
  - 필드 JSDoc 에 「`UIntSchema` 를 쓰지 않는 이유」와 「`UIntSchema` 자체는 그대로 둔다 — 그것을 공유하는 상따 필드는 `toWireUint` 가 지킨다」를 명시
- `relay/src/dma/envelope.ts` (+16/-2)
  - `buildSetVITriggerReq` 의 정수·음수 검사 **뒤에** 상한 검사 추가 → `OrderBuildError("BAD_ORDER_AMOUNT", …)` (메시지에 상한값 포함)
  - 함수 JSDoc `@throws` 에 「**금액 상한 초과**」 추가. 본문 주석에 「조립 단계가 마지막 관문」 + 「`Number.MAX_SAFE_INTEGER` 초과는 이 상한에 이미 포함 — 별도 분기 없음」
- `relay/src/store/orders.ts` (+105/-26)
  - `ORDER_FLUSH_MAX_ROUNDS = ORDER_MAX_RETRIES + 2` 신설(export)
  - `#flushing: boolean` → `#current: Promise<void> | null` (**대기 가능한 핸들**)
  - `#tick()` 신설 — 인터벌 전용. `#current !== null` 이면 건너뛰고, 예외는 `catch` 해 error 로 남긴다(unhandled rejection 금지)
  - `#runDrain()` — 배치 1회 + `finally` 에서 `#current = null`
  - `#drain()` — 옛 `flushNow` 본문 그대로(큐 스왑·순회·재시도·드롭). 카운터 규율 무변경. `finally { #flushing = false }` 만 제거
  - `flushNow()` — ① `while (#current !== null) await #current` ② 큐가 빌 때까지 최대 `ORDER_FLUSH_MAX_ROUNDS` 라운드 ③ 남으면 `logger.error`
  - `start()` 의 인터벌 콜백이 `void this.flushNow()` → `this.#tick()`
- `relay/src/index.ts` (+3)
  - 종료 절차 5) 주석 보강 — 「`flushNow()` 는 진행 중 배치를 기다린 뒤 재큐잉분까지 비운다(16-24 / WR-09). 그래서 `close()` 를 그 뒤에 부르는 순서가 여전히 유효하다」. **코드 순서는 바꾸지 않았다.**

### webapp

- `webapp/src/lib/vi-alert.ts` (+11)
  - `MAX_VI_ORDER_AMOUNT_MANWON = krwToManwon(MAX_VI_ORDER_AMOUNT_KRW)` — 만원 숫자를 직접 적지 않고 **유도**한다
- `webapp/src/components/trading/vi-settings-card.tsx` (+62/-6)
  - `VI_AMOUNT_LIMIT_MESSAGE` (export) — 상한값은 이 파일에 없고 정본 경로를 JSDoc 이 밝힌다
  - `amountClamped` state + `amountOverLimit` 파생 + `showAmountLimit`
  - `handleAmountChange` — 상한 초과 입력은 **상한으로 고정**
  - `submit()` — 세션 가드·연타 가드 **뒤에** 금액 상한 가드(에코발 초과를 막는다)
  - 금액 행 아래 `data-slot="vi-amount-limit"` 안내 문단(`role="status"`, `--destructive`, `vi-alert-reason` 과 같은 형태)
  - `ViConfirmDialog` 위에 「표시값 = 전송값이 성립하는 이유」 주석

### 테스트

- `relay/tests/protocol.test.ts` (+69)
  - `viSet()` 픽스처 헬퍼 신설
  - ⑥ 상한 초과 2케이스(`MAX+1`, `1e21`) → `null` + `logger.warn` 호출 단언
  - ⑥ 경계 통과 — 상한값 자체·0 은 통과, `-1`·`1.5` 는 거부
  - `describe("buildSetVITriggerReq — 금액 상한 (WR-07)")` — 스키마를 우회해 조립기를 직접 불러도 `OrderBuildError.code === "BAD_ORDER_AMOUNT"`, 상한값 자체는 조립된다
- `relay/tests/order-store.test.ts` (+100/-10)
  - ⑤ 를 **tick 경로**로 이관(`start()` + `advanceTimersByTimeAsync(200)` ×3) — 「재큐잉은 다음 tick」 규율의 무대를 정확히 맞췄다
  - ⑥ 에 `calls === 2` 단언 추가 — 재시도가 **같은 `flushNow()` 안에서** 끝난다는 사실을 명시
  - ⑮ 경주 — sink 를 풀 수 있는 Promise 로 붙잡고, 그 사이 큐에 넣은 `row-2` 까지 비워지는지. `await Promise.resolve()` 시점에 `settled === false` 로 「기다렸다」를 단언(옛 구현은 여기서 이미 끝나 있었다)
  - ⑯ 재큐잉분이 같은 `flushNow()` 안에서 재시도 → `flushed 1 · queued 0 · retried 1 · dropped 0`
  - ⑰ 항상 실패하는 sink 로도 `flushNow()` 가 **반환**하고 `dropped > 0`
- `webapp/src/components/trading/__tests__/vi-settings-card.test.tsx` (+52)
  - ⑧ 상한 초과 입력 클램프 + `vi-amount-limit` 표시 + 상한 안쪽 복귀 시 소멸
  - ⑧ 잘린 값 그대로 「수정」이 나간다(`orderAmountKrw === manwonToKrw(상한)`)
  - ⑧ 서버 에코발 상한 초과 상태에서 「시작」 확정 → `send` **0회**

## Verification Results

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay test` | **345 passed / 17 files** exit 0 |
| `pnpm --filter @gh-radar/webapp test` | **642 passed · 1 skipped / 57 files** exit 0 |
| `pnpm --filter @gh-radar/shared test` | **99 passed / 8 files** exit 0 |
| `pnpm typecheck` (13 워크스페이스) | 전부 Done, exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -rc MAX_VI_ORDER_AMOUNT_KRW` 4파일 | shared 1 · protocol 3 · envelope 3 · vi-settings-card 1 — **전부 ≥1** |
| `grep -c "10_000_000_000\|10000000000"` 3파일 | protocol 0 · envelope 0 · vi-settings-card 0 — **값 복제 0건** |
| `grep -c "vi-amount-limit"` | 1 |
| `grep -c "if (this.#flushing) return"` | **0** |
| `grep -c "#current"` / `"#drain"` | 9 / 3 (기준 ≥4 / ≥2) |
| `grep -c "WR-09"` orders.ts · index.ts | 4 · 1 |
| `grep -rn "10.41.1.120" relay/ webapp/src` | 2건 — **둘 다 기존 산문 주석**(아래 참조), 이번 plan 이 건드리지 않았다 |

**D-27 grep 에 대한 부연.** 플랜의 verification 은 `0건` 을 기대했으나 실측 2건이다: `relay/README.md:17`(「기본 `DMA_HOST` 는 로컬 mock 이다. 실서버 `10.41.1.120` 접속은…」이라는 **경고문**)과 `relay/src/dma/link-health.ts:20`(터널 판정 조건을 설명하는 주석). 둘 다 이 plan 이전부터 있었고(`git diff HEAD~2 HEAD` 에 두 파일 없음), 실서버에 **접속하는 코드가 아니라 접속을 금지·설명하는 문장**이다. D-27 의 취지(단위 테스트만 쓴다 · 실계좌에 붙지 않는다)는 지켜졌다 — 이번 plan 의 모든 테스트는 sink/스텁 주입 단위 테스트다.

## Decisions Made

frontmatter `key-decisions` 참조. 넷을 기록에 남긴다.

**① 왜 만원 상한을 `vi-alert.ts` 에 뒀나.** 후보는 셋이었다 — (a) 카드 안에서 `MAX_VI_ORDER_AMOUNT_KRW / 10_000` (b) shared 에 만원 상수를 하나 더 (c) `vi-alert.ts` 에서 `krwToManwon` 으로 유도. (a) 는 `10_000` 리터럴을 되살린다 — 그 파일 스스로가 「단위 변환의 유일한 지점」이라고 못박은 규칙을 깨는 것이고, acceptance grep 도 그것을 금지한다. (b) 는 정본이 둘이 되어 이 plan 이 없애려는 문제를 그대로 재생산한다. (c) 는 `MANWON_IN_KRW` 를 소유한 파일이 유도까지 소유하므로 **변환 지점이 계속 하나**다. 카드는 그 결과만 읽는다.

**② 왜 `UIntSchema` 를 그대로 뒀나.** 상한을 그 공유 스키마에 얹으면 한 줄로 끝나지만, `buyOrderPrice`·`buyWatchQty`·`sweepMinRate` 등 20여 개 상따 필드가 같은 스키마를 쓴다. VI 의 **정책 상한**(100억원)이 상따의 **가격·수량**에 번지면 그것은 관계 없는 조용한 거부다. 상따 필드는 이미 `toWireUint`(MAX_UINT32 — 표현 범위)가 지키고 있고, 그 둘은 성격이 다르다(정책 vs 와이어). 그래서 VI 필드만 자기 스키마를 갖는다.

**③ 왜 입력을 거부하지 않고 잘랐나.** 거부(입력을 무시)하면 사용자는 키를 눌러도 숫자가 안 늘어나는 화면을 보고 **왜인지 모른 채** 멈춘다 — 이 프로젝트가 PC-7 로 금지한 무로그 fail-safe 의 UI 판이다. 자르면 값이 눈에 띄게 상한으로 점프하고 바로 아래 문장이 이유를 댄다. 부수효과가 하나 더 있다: 자른 결과가 곧 폼 값이라 **확인 다이얼로그 표시값과 전송값이 자동으로 같아진다**(T-16-41). 거부 설계에서는 「화면 값」과 「전송 값」이 갈릴 여지가 남는다.

**④ 왜 tick 과 종료의 계약을 다르게 뒀나.** 「기다린다」를 양쪽에 일괄 적용하면 코드는 단순해지지만, 200ms 마다 새 대기자가 생겨 Supabase 장애 중에 대기 체인이 쌓이고 같은 항목을 두 번 쓰는 중복 진입도 열린다. 기다림이 정당한 이유는 **곧 죽는 프로세스**이기 때문이다 — 그 특권은 종료 경로에만 준다. 두 경로가 `#current` 라는 같은 핸들을 공유하되 그것을 다르게 소비한다는 사실을, 두 함수의 주석과 테스트(⑤ vs ⑮)가 각각 못박는다.

## 요구사항 판정

**`REQUIREMENTS.md` 를 건드리지 않았다.** 이 plan 의 frontmatter 는 `[TRADE-02, TRADE-03]` 이지만 둘 다 **16-26 소관**이다(16-23 이 같은 이유로 미룬 것과 같은 판단). TRADE-03 은 16-VERIFICATION 에서 blocked 이고, TRADE-02 는 16-25 가 남은 절을 마친 뒤 최종 재판정한다. 여기서 올리면 남은 갭 클로징 plan 이 실행되기 전에 완료로 표기된다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 기존 테스트 ⑤ 가 새 `flushNow` 계약과 정면으로 충돌했다 — 계약을 tick 경로로 이관**

- **Found during:** Task 2
- **Issue:** `order-store.test.ts` ⑤ 는 「`flushNow()` 1회 → `calls 1 · queued 1 · retried 1`, 2회째 → 드롭」을 단언한다. 이는 **「flushNow 는 배치를 한 번만 돈다」**는 옛 계약에 의존한 것이고, 이 plan 이 요구하는 「재큐잉분까지 비운다」와 동시에 참일 수 없다. 플랜은 이 충돌을 예고하지 않았고(acceptance 는 「16-18 의 경계 케이스 포함 전부 exit 0」만 요구), 손대지 않으면 Task 2 는 애초에 green 이 될 수 없다.
- **왜 멈추지 않았나:** 테스트가 주장하던 규율(**재큐잉을 같은 순회에서 다시 때리지 않는다**)은 폐기 대상이 아니다 — 그 규율의 무대가 **인터벌 tick** 이었을 뿐이다. 그래서 케이스를 지우지 않고 `start()` + `advanceTimersByTimeAsync(200)` 로 **무대를 옮겼다**. 커버리지는 줄지 않고(오히려 tick 경로의 재큐잉이 처음으로 직접 검증됐다), 종료 경로의 새 계약은 ⑮⑯⑰ 가 따로 잠근다. 아키텍처 변경이 아니라 Task 2 를 완료하기 위한 필수 수반 변경이므로 Rule 3 이다.
- **Fix:** ⑤ 제목을 「tick 은 실패를 1회 재큐잉하고 **다음 tick** 에서 드롭한다」로 바꾸고 본문을 tick 경로로 재작성. 위에 「두 경로의 계약이 다르다」는 이유를 블록 주석으로 남겼다. ⑥ 에는 `calls === 2` 단언을 더해 새 계약을 명시했다(두 번째 `flushNow()` 는 무동작).
- **Files modified:** `relay/tests/order-store.test.ts`
- **Verification:** `pnpm --filter @gh-radar/relay test` **345 passed** (24 in order-store.test.ts)
- **Committed in:** `7c5e1fd`

**2. [Rule 3 - Blocking] `#tick()` 의 unhandled rejection 경로 — 플랜에 없던 `catch` 를 붙였다**

- **Found during:** Task 2
- **Issue:** 옛 코드는 인터벌에서 `void this.flushNow()` 였고, `flushNow` 안의 `try/finally` 가 예외를 밖으로 내보내지 않았다. 새 구조에서 `#tick()` 은 `#current` 에 Promise 를 **저장만** 하고 await 하지 않으므로, `#drain` 이 예상 밖 예외를 던지면(예: sink 가 동기 throw 하는 잘못된 결선) 그것이 **unhandled rejection** 이 되어 프로세스를 죽인다. 플랜 ①~④ 에는 이 자리가 없다.
- **Fix:** `this.#current.catch((err) => logger.error({ err }, "[orders] 배치 플러시가 예외로 끝났다"))` 를 붙이고 「`#drain` 은 항목 단위로 catch 하므로 여기까지 오지 않는 것이 정상 — 그래도 조용한 unhandled rejection 은 만들지 않는다(S-5)」를 주석으로 남겼다. `flushNow` 쪽은 `await` 하므로 예외가 종료 절차의 `catch` 로 정상 전파된다(삼키지 않는다).
- **Files modified:** `relay/src/store/orders.ts`
- **Verification:** relay 전 스위트 345 passed · typecheck·typecheck:tests exit 0
- **Committed in:** `7c5e1fd`

**3. [Rule 1 - Bug] acceptance grep `"if (this.#flushing) return" == 0` 이 새 JSDoc 문구와 충돌했다**

- **Found during:** Task 2 (게이트 실행)
- **Issue:** 옛 동작을 설명하는 `flushNow` JSDoc 이 옛 코드를 **원문 그대로** 인용(`` `if (this.#flushing) return;` ``)해서, 즉시반환 경로를 제거했음에도 게이트 grep 이 1 을 냈다. 16-23 이 겪은 것과 **같은 종류의 함정**이다(설명 문장이 리터럴 게이트에 걸린다).
- **Fix:** 인용을 서술로 바꿨다 — 「진행 중이면 (`#flushing` 플래그를 보고) **아무것도 기다리지 않고 즉시 반환**했다」. 게이트는 0 이 되고 설명은 그대로다. 앞으로 그 리터럴이 파일에 등장하면 그것은 실제로 즉시반환 분기의 부활이다 — 게이트가 의도대로 작동한다.
- **Files modified:** `relay/src/store/orders.ts`
- **Verification:** `grep -c "if (this.#flushing) return" relay/src/store/orders.ts` = **0**
- **Committed in:** `7c5e1fd`

### 플랜과 다르게 한 것 (결과 동등)

- **envelope 전용 테스트 파일을 만들지 않았다.** 플랜은 「`protocol.test.ts` **또는** envelope 테스트」를 허용했고, `files_modified` 도 `relay/tests/protocol.test.ts` 만 열거한다. relay 에는 envelope 전용 스위트가 없어(조립기 검증이 `fake-gateway.test.ts` 등에 분산) 새 파일을 만드는 대신 `protocol.test.ts` 에 `describe` 를 하나 더했다 — 「스키마 층과 조립기 층이 같은 상수를 본다」를 **한 파일에서** 읽히게 하는 편이 낫다는 판단.
- **`ORDER_FLUSH_MAX_ROUNDS` 를 export 했다.** 플랜은 상수화만 요구했으나, 반복 상한은 로그 필드로도 나가는 계약 값이라 다른 상수(`ORDER_MAX_RETRIES` 등)와 같은 취급을 했다. 소비자는 아직 없다.
- **`#flushing` 을 병행하지 않았다.** 플랜 ①은 「또는 둘을 병행하되 대기 가능한 핸들이 반드시 있어야 한다」였다. 완전 대체를 골랐다 — 정본이 둘이면 다음 사람이 `boolean` 으로 다시 분기를 만든다(acceptance 의 `#current >= 4` 도 완전 대체를 전제한다).

---

**Total deviations:** 3 auto-fixed (Rule 3 ×2, Rule 1 ×1)
**Impact on plan:** 목표(WR-07 + WR-09)와 must_haves 5항목 전부 달성. 스코프 확장은 기존 테스트 케이스 2개(⑤·⑥)의 계약 이관과 `#tick` 의 `catch` 한 줄 — 전부 이 plan 의 변경이 **강제한** 최소 수반 변경이고, 새 기능은 하나도 넣지 않았다.

## Issues Encountered

**차단 요소 없음.** 두 task 모두 checkpoint 없이 끝났고 인증 게이트도 없었다.

**스코프 밖으로 남긴 것:**

- 작업 트리에 다른 작업의 미커밋 변경이 있었다(`infra/relay/README.md` 수정, `scripts/dma-tunnel.{sh,ps1}`·`.planning/quick/260909-el9-…` 미추적, 실행 중 생긴 `Claude outputs/` 미추적). **하나도 스테이지하지 않았다** — 두 커밋 모두 파일을 개별 지정해 담았다.
- `relay/README.md`·`link-health.ts` 의 `10.41.1.120` 언급 2건(위 「D-27 grep 부연」) — 산문이고 이 plan 의 표면이 아니다. 손대지 않았다.

## Known Stubs

없음. 이 plan 이 만든 값·경로는 전부 실제 소비자에 연결돼 있다(상수 → 세 층 · 안내 문구 → 렌더 · `flushNow` → 종료 절차).

## Self-Check: PASSED

- 파일 실재: `packages/shared/src/relay.ts` · `relay/src/store/orders.ts` · `webapp/src/lib/vi-alert.ts` · 이 SUMMARY — 전부 FOUND
- 커밋 실재: `c041f00`(Task 1) · `7c5e1fd`(Task 2) — 전부 FOUND
