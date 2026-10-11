---
phase: 16-trading-limit-chaser-vi-my-page
plan: 20
subsystem: api
tags: [contract, dead-code, audit, supabase, vitest, typescript]

requires:
  - phase: 16-17
    provides: My page 표면과 `GET /api/orders` 조회 라우트(16-16 이 POST 제거 후 남긴 것)
provides:
  - "`DmaOrderOrigin` = `\"manual\" | \"limit_chaser\" | \"vi\"` — `dma_orders.origin` CHECK 3종의 shared 계약 사본"
  - "`DmaOrderRow.origin` — `GET /api/orders` 응답에 자동주문/수동주문 구분이 실린다"
  - "`ORDER_COLS` 에 `origin` (그리고 `user_id` 는 여전히 없음)"
  - "`select(...)` 컬럼 화이트리스트 회귀 잠금 테스트 (`origin` 있음 ∧ `user_id` 없음)"
  - "`server/src/errors.ts` 의 사실과 맞는 결과 판정 주석 — 정본은 `RelayOrderResultMsg.status`"
affects: [16-26 요구사항 재판정, 주문 이력 표(D-20 deferred) 후속 작업]

tech-stack:
  added: []
  patterns:
    - "패키지 경계를 넘는 열거는 사본을 두되 「값이 갈리면 DB CHECK 가 터진다」를 근거로 못박는다"
    - "픽스처는 DEFAULT 값을 피한다 — `manual` 로 두면 매핑이 빠져도 통과하는 케이스가 된다"
    - "임포터 0건 모듈은 남기지 않는다. 미래 소비자를 위한 선반영은 「살아 있는 계약」으로 오독된다"

key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - server/src/services/dma-orders.ts
    - server/tests/routes/orders.test.ts
    - server/src/errors.ts
  deleted:
    - webapp/src/lib/orders-api.ts

key-decisions:
  - "WR-04 의 두 선택지 중 **모듈 삭제**를 택했다 — 「`listOrders` 를 결선한다」는 곧 주문 이력 표를 만드는 것이고 그 표는 D-20 이 이 phase 밖(deferred)에 두었다"
  - "`GET /api/orders` 라우트는 **남긴다** (D-03 사용자 결정). 죽은 것은 브라우저 클라이언트였지 라우트가 아니다"
  - "마이그레이션의 목적 문장을 재정의하지 않았다 — 목적은 유효하고 미달성 구간은 「표가 아직 없다」뿐이다"
  - "server 에 `origin` 기본값 보정을 넣지 않는다 — DB DEFAULT `'manual'` + NOT NULL 이 이미 강제한다. 두 번째 기본값은 두 진실이 된다"
  - "`manual` 은 「수동」과 「출처 불명」이 같은 값이다 — `DmaOrderRow.origin` JSDoc 이 이 사실을 표시 층에 경고로 넘긴다"

patterns-established:
  - "컬럼 화이트리스트는 `*` 가 아님까지 단언한다 — `*` 면 컬럼 추가마다 응답이 조용히 넓어진다"
  - "거짓 주석은 지우는 것으로 끝내지 않고 **실제 자리를 파일명으로** 가리켜 재발을 막는다"

requirements-completed: []  # TRADE-03 은 16-26 소관 — 아래 「요구사항 판정」 참조

duration: 5min
completed: 2026-09-09
---

# Phase 16 Plan 20: 죽은 주문 모듈 제거 + origin 읽기 계약 완성 Summary

**`dma_orders.origin` 이 relay 의 쓰기 전용 컬럼에서 `GET /api/orders` 의 응답 필드가 됐고, 임포터 0건이던 `webapp/src/lib/orders-api.ts` 와 그 모듈을 살아 있다고 주장하던 `errors.ts` 의 거짓 문장이 함께 사라졌다.**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-09-09T01:14Z (10:14 KST)
- **Completed:** 2026-09-09T01:19Z (10:19 KST)
- **Tasks:** 2/2
- **Files modified:** 5 (+ 삭제 1)

## Accomplishments

- **`origin` 이 API 층에 도달했다 (WR-05 / T-16-23).** `packages/shared/src/relay.ts` 에 `DmaOrderOrigin`(`"manual" | "limit_chaser" | "vi"`)을 `DmaOrderRow` 바로 위에 선언하고 `origin` 필드를 `filledQty` 와 `createdAt` 사이에 넣었다. `packages/shared/src/index.ts` 가 재export 한다. server 쪽은 `DmaOrderDbRow.origin`(non-optional — DB 가 NOT NULL) · `ORDER_COLS` 의 `,origin,` · `mapOrder` 의 `origin: r.origin` 세 지점이다. 마이그레이션이 선언한 「내가 낸 주문 vs 전략이 낸 주문」 구분이 이제 브라우저가 읽을 수 있는 자리까지 온다.
- **`user_id` 배제 규율이 회귀 잠금됐다 (T-16-22).** 컬럼이 늘어나는 변경이라 화이트리스트가 흐려질 수 있는 지점이었다. 테스트 mock 의 `select()` 를 인자 기록형으로 바꿔 새 케이스 ⑯-b2 가 `cols` 를 실제로 파싱해 ① `origin` 포함 ② `user_id` **미포함** ③ `"*"` 가 아님 세 가지를 단언한다.
- **픽스처가 DEFAULT 를 피한다.** `orderRow()` 의 `origin` 을 `"limit_chaser"` 로 두었다. `manual` 이었다면 `mapOrder` 매핑이 빠져도(그래서 `undefined` 여도) `toMatchObject` 가 통과할 여지가 없진 않지만, 무엇보다 **DEFAULT 값은 「배관이 실제로 흐른다」를 증명하지 못한다** — 자동주문 값이 왕복해야 증명이 된다.
- **죽은 모듈이 사라졌다 (WR-04 / T-16-25).** 삭제 전 게이트를 재실행해 `grep -rn "orders-api\|listOrders\|ORDER_ERROR_CODES\|isUnknownOutcome\|orderErrorCode\|orderErrorMessage" webapp/src webapp/e2e` 가 **자기 자신 8줄 외 0건**임을 확인했고(`webapp/tests`·`webapp/scripts` 포함 repo 전역 재확인도 0건), `git rm` 했다. 삭제 후 `grep -rn "orders-api" webapp/` = **0건**.
- **거짓 주석이 실제 자리를 가리킨다 (T-16-24).** `server/src/errors.ts` 의 「웹앱의 `lib/orders-api.ts` 는 `ORDER_ERROR_CODES` 를 **그대로 유지**한다」를 지우고, 판정 정본이 `RelayOrderResultMsg.status` 이며 인라인 판정 지점이 `webapp/src/components/orderbook/order-panel.tsx` 와 `.../account-panel.tsx` 두 곳뿐임을 명시했다. 「여기에 그 모듈을 가리키는 문장을 다시 만들지 말 것」과 「`GET /api/orders` 는 살아 있으나(D-03) 브라우저 호출자는 이력 표(D-20 deferred)를 만들 때 함께 만든다」를 근거로 남겼다.

## Task Commits

1. **Task 1: `DmaOrderRow`·`ORDER_COLS` 에 `origin` + 계약 테스트 (WR-05)** — `2731b92` (feat)
2. **Task 2: 죽은 주문 모듈 삭제 + `errors.ts` 거짓 주석 정정 (WR-04)** — `8d532d1` (refactor)

## Files Created/Modified

- `packages/shared/src/relay.ts` — `DmaOrderOrigin` 열거 신설 + `DmaOrderRow.origin` 필드(각각 JSDoc 근거 동반)
- `packages/shared/src/index.ts` — `DmaOrderOrigin` 재export
- `server/src/services/dma-orders.ts` — `DmaOrderDbRow.origin` · `ORDER_COLS` · `mapOrder` · 파일 상단 「server 는 읽기만 한다」 한 줄
- `server/tests/routes/orders.test.ts` — `Recorder.selects` 신설 · 픽스처 `origin` · ⑯-b 단언 확장 · 케이스 ⑯-b2 신설
- `server/src/errors.ts` — Phase 16 Plan 16 주석 블록 마지막 문단 재작성
- ~~`webapp/src/lib/orders-api.ts`~~ — **삭제**(127줄, 임포터 0건)

## 확정 판단의 근거 — 왜 「결선」이 아니라 「삭제」인가

| 후보 | 그러면 무엇을 만들어야 하나 | 이 phase 범위인가 |
|------|---------------------------|------------------|
| `listOrders` 를 결선 | 주문 이력 표(오늘 주문 목록 UI) | ❌ **D-20 이 「오늘 주문 이력 표는 미포함(deferred)」** |
| 모듈 삭제 | 없음 | ✅ |

`GET /api/orders` 가 메우는 구멍은 「이력 표」뿐이다 — 새로고침 후 **미체결·잔고 복원은 이미 wss 계좌 상태(66/67 스냅샷)** 가 한다. 없는 소비자를 위해 죽은 모듈을 남기면 다음 사람이 그것을 살아 있는 계약으로 읽고, 실제로 `errors.ts` 가 이미 그렇게 읽고 있었다(그 문장이 이 plan 이 고친 거짓 주석이다). 라우트 자체는 D-03 이 「오늘 주문 목록 복원용으로 유지」라고 못박은 **사용자 결정**이라 건드리지 않았다.

## Known Stubs

없음. **다만 미완결 구간을 명시한다:** `origin` 은 응답 계약에는 실렸으나 **표시 층(주문 이력 표)이 없다** — D-20 이 v1 범위 밖으로 둔 결과다. 이 사실은 코드 3곳에 근거로 남아 있다.

1. `server/src/errors.ts` — 「`GET /api/orders` 는 살아 있으나 브라우저 호출자는 아직 없다 … 표를 만들 때 클라이언트를 함께 만든다(D-20 deferred)」
2. `server/tests/routes/orders.test.ts` ⑯-b — 「표시 층(주문 이력 표)은 D-20 deferred 라 아직 없다 — 계약만 먼저 완성한 상태다」
3. 본 SUMMARY 의 위 표

이것은 스텁(빈 값이 UI 로 흘러가는 구조)이 **아니다** — 소비자가 아예 없고, 없다는 사실이 명시돼 있다.

## Decisions Made

- **모듈은 지우고 라우트는 남긴다.** 죽은 것은 브라우저 클라이언트였지 서버 라우트가 아니다(D-03).
- **마이그레이션 주석의 목적 문장은 그대로 둔다.** WR-05 는 「열지 않을 거라면 목적 문장을 정정하라」를 대안으로 제시했지만, 목적(자동/수동 구분)은 유효하고 실제로 이 plan 이 절반(읽기 계약)을 달성했다. 목적을 낮춰 적으면 남은 절반(표)이 영원히 안 만들어진다.
- **server 에 `origin` 기본값 보정을 넣지 않는다.** DB DEFAULT `'manual'` + NOT NULL 이 정본이다. 애플리케이션 층에 두 번째 기본값을 두면 「빈 값이 왜 manual 이 됐나」의 답이 두 곳이 된다.
- **`manual` 의 이중 의미를 계약 JSDoc 에 경고로 남겼다.** 구 게이트웨이가 빈 값을 보내면 relay 가 `manual` 로 좁히므로 `manual` 은 「사용자가 직접 냈다」의 **증거가 아니다**. 표를 만들 사람이 이걸 모르면 자동주문 감사에서 거짓 음성이 난다.
- **relay 의 `OrderOriginKind` 를 import 하지 않고 shared 에 사본을 두었다.** server 는 relay 를 의존하지 않는다(패키지 경계). 값이 갈리면 relay 의 insert 가 DB CHECK 위반으로 즉시 터지므로 조용히 어긋나지 않는다 — 사본의 리스크가 통제된 경우다.

## Deviations from Plan

계획대로 실행했다 — 자동 수정(Rule 1~3) 적용 건 없음.

**한 가지 판정 기록:** Task 1 acceptance 의 「`grep -n "ORDER_COLS" -A 2 server/src/services/dma-orders.ts` 출력에 `user_id` 없음」은 **문자 그대로는 1건**이 나온다. 그 1건은 `ORDER_COLS` 문자열이 아니라 `.select(ORDER_COLS)` **다음 줄의 `.eq("user_id", userId)` 소유권 필터**(L105)이며, 이것은 있어야 하는 것이다(T-15-01). 기준의 실제 의도인 「`ORDER_COLS` **문자열 안** 0건」은 충족한다 — L60 컬럼 목록에 `user_id` 없음. 새 테스트 ⑯-b2 가 이 구분을 문자열 파싱으로 정확히 잠근다(`cols` 배열에 `user_id` 없음 ∧ `WHERE` 필터는 별도 단언 ⑯-c 가 존재를 요구).

## Threat Flags

없음. 이 plan 은 새 네트워크 표면·인증 경로·파일 접근을 만들지 않았다. 스키마 변경도 없다(기존 컬럼의 **읽기** 계약만 넓혔고, 넓힌 컬럼은 소유자 본인 행의 비민감 열거값이다).

## Verification

| 항목 | 결과 |
|------|------|
| `pnpm typecheck` (13 워크스페이스) | ✅ 전부 Done |
| `pnpm --filter @gh-radar/server test` | ✅ 31 파일 / **252 통과** |
| `pnpm --filter @gh-radar/webapp test` | ✅ 57 파일 / **636 통과** (1 skipped) |
| `pnpm --filter @gh-radar/shared test` | ✅ 8 파일 / **99 통과** |
| `pnpm --filter @gh-radar/relay test` (추가 확인) | ✅ 17 파일 / **323 통과** |
| `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts` | ✅ **11 통과**(신규 ⑯-b2 포함) |
| `test ! -f webapp/src/lib/orders-api.ts` | ✅ 참 |
| `grep -rn "orders-api" webapp/` | ✅ **0건** |
| `grep -c "그대로 유지" server/src/errors.ts` | ✅ **0** |
| `grep -c "order-panel\|account-panel" server/src/errors.ts` | ✅ **2** |
| `grep -c "origin" server/src/services/dma-orders.ts` | ✅ **4** (타입 + ORDER_COLS + mapOrder + 주석) |
| `grep -c "DmaOrderOrigin" packages/shared/src/{relay,index}.ts` | ✅ relay 2 / index 1 |

## 요구사항 판정

**TRADE-03 은 Pending 유지.** 이 plan 은 TRADE-03 의 읽기 계약 구간(WR-05)을 닫았지만 gap 2 가 아직 열려 있다(16-19 SUMMARY 의 판정 승계). 최종 재판정은 **16-26** 소관이다 — 여기서 완료 처리하지 않는다.

## Self-Check: PASSED

- `packages/shared/src/relay.ts` FOUND · `packages/shared/src/index.ts` FOUND · `server/src/services/dma-orders.ts` FOUND · `server/tests/routes/orders.test.ts` FOUND · `server/src/errors.ts` FOUND
- `webapp/src/lib/orders-api.ts` **의도적으로 부재**(삭제 대상)
- 커밋 `2731b92` FOUND · `8d532d1` FOUND
