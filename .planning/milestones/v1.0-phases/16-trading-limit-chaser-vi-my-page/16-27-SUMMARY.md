---
phase: 16-trading-limit-chaser-vi-my-page
plan: 27
subsystem: relay
tags: [dma, order-correlation, toctou, websocket, flatbuffers, vitest]

requires:
  - phase: 16
    provides: "16-22 가 세운 `narrowPending` 순수 함수 + `PendingOrder` 매칭 축 4종(qty·price·isCancel·orgOrderNo)"
provides:
  - "`narrowPending` 하드 필터 — 통보가 실어 온 `orgOrderNo`·취소성 `noticeType`(C/M)을 후보 수와 무관하게 적용, 0건이면 `null`"
  - "후보 1건 지름길 제거 — 유일 후보라도 축이 어긋나면 정산하지 않는다"
  - "통보 소비 루프 warn 조건 확대 — 후보 1건 미정산도 로그를 남긴다"
  - "`await insertRequest` 직후 연결 생존 재확인 가드 — 조립·대기등록·송신 이전에 중단"
  - "회귀 테스트 2종 — 「유일 후보라도 취소확인은 신규 대기를 정산하지 않는다」 · 「㉕ await 중 연결 종료」"
affects: [16-28 이후 갭 클로징 2라운드, relay 주문 상관 경로, dma_orders 감사 기록]

tech-stack:
  added: []
  patterns:
    - "하드 필터 vs 단계적 좁히기 — 규율을 가르는 기준은 「통보가 그 축을 실어 왔는가」"
    - "await 경계 TOCTOU 가드 — `conns.get(conn) !== state` 를 부작용 발생 이전에 둔다"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "하드 필터 결과가 0건이면 `null` 을 돌려 5초 타임아웃으로 넘긴다 — 잘못 귀속된 기록보다 없는 기록이 낫다"
  - "① 취소 축의 `refine` 은 하드 필터와 조건이 겹치지만 삭제하지 않는다 — 축 순서 ①~④ 의 문서적 대응을 유지하는 편이 읽기에 낫다 (무해한 중복)"
  - "② 통보 종류 축의 지역 `isCancelNotice` 재선언은 제거하고 하드 필터에서 계산한 값을 재사용한다"
  - "TOCTOU 가드에서 `reject` 를 부르지 않는다 — 받을 소켓이 이미 없다. `logger.warn` + `enqueueUpdate(status:\"rejected\")` 로만 남긴다"
  - "가드 자리를 `buildDirectOrderReq` **이전**으로 고정 — 대기 등록·타이머 생성 전이라 회수할 것이 없는 유일한 지점"

patterns-established:
  - "축 소비 규율 2종 분리: 실어 온 축 = 하드 필터(0건 → null), 비어 있을 수 있는 축 = `refine`(0건 → 건너뜀)"
  - "회귀 잠금 검증: 가드를 임시로 무력화해 새 테스트가 **실제로 실패하는지** 확인한 뒤 복원"

requirements-completed: [TRADE-03]

duration: 21min
completed: 2026-09-09
---

# Phase 16 Plan 27: 통보 오귀속 · await TOCTOU 종결 Summary

**통보가 실어 온 강한 축을 후보 수와 무관한 하드 필터로 승격하고(GC-CR-01), `await insertRequest` 경계에서 연결 생존을 재확인해 죽은 연결의 주문이 게이트웨이로 나가지 않게 했다(GC-CR-03).**

## Performance

- **Duration:** 21분
- **Started:** 2026-09-09T04:48:20Z
- **Completed:** 2026-09-09T05:09:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

### Task 1 — 하드 필터 승격 (GC-CR-01) · commit `eeb3a6e`

`narrowPending` 의 첫 실행문 `if (candidates.length <= 1) return candidates[0] ?? null;` 을 제거하고 `if (candidates.length === 0) return null;` 만 남겼다. 그 자리에 **하드 필터**를 넣었다 (`relay/src/ws/order-handler.ts:894-912`):

- `isCancelNotice = n.noticeType === "C" || n.noticeType === "M"`
- `n.orgOrderNo !== ""` 이면 `p.isCancel && p.orgOrderNo === n.orgOrderNo` 인 후보만 남긴다. `""` 면 이 축을 적용하지 않는다.
- `isCancelNotice` 면 `p.isCancel` 인 후보만 남긴다. 아니면 적용하지 않는다.
- 결과 0건 → `null` (`:911`). 1건 → 그것. 2건 이상 → `pool` 시작값으로 삼아 기존 ①~④ 단계적 좁히기를 그대로 이어 간다.

docstring 은 **삭제하지 않고 범위를 좁혔다**: 「①~④ 를 단계적 좁히기로 쓰는 이유」 문단을 유지한 채, 「그러나 그 근거의 유효 범위는 「비어 있는 축」까지다 — 통보가 실제로 실어 온 강한 축은 후보 수와 무관한 하드 필터다」를 덧붙였다.

② 통보 종류 축은 지역 `isCancelNotice` 재선언을 지우고 하드 필터의 값을 재사용한다. ① 취소 축의 `refine` 은 하드 필터와 조건이 같아 무해한 중복이지만, 축 번호 ①~④ 의 문서적 대응을 위해 남기고 그 근거를 주석으로 적었다.

**warn 조건 확대 (T-16-51):** 통보 소비 루프의 `if (candidates.length > 1)` 을 **`relay/src/ws/order-handler.ts:359` 의 `if (candidates.length > 0 && picked === null)`** 로 바꿨다. 이제 후보 1건 미정산도 로그를 남긴다. 로그 필드는 그대로 `isin`·`noticeType`·후보 수뿐이다 — 계좌번호·주문번호 원문 없음(T-16-32 승계).

**테스트 뒤집기:** `relay/tests/ws-order.test.ts:1027` 「유일 후보라도 취소확인은 신규 대기를 정산하지 않는다 (GC-CR-01)」. 잠그는 것 4가지 — 후보 0건 → `null` / 신규 대기 1건 + `"C"`+`orgOrderNo` → `null` / 신규 대기 1건 + `"A"`+빈 `orgOrderNo` → 수량·가격이 어긋나도 그 대기(구 서버 호환) / 취소 대기 1건 + **다른** `orgOrderNo` 취소확인 → `null`. 옛 주석 「유일 후보는 축을 보지 않는다」는 0건.

### Task 2 — await 경계 TOCTOU 가드 (GC-CR-03) · commit `909a217`

`await deps.orderStore.insertRequest(...)` 의 `try/catch` 직후, 조립보다 먼저 게이트 ③-3 을 넣었다.

- 가드: **`relay/src/ws/order-handler.ts:701`** `if (conns.get(conn) !== state) {`
- 조립: **`relay/src/ws/order-handler.ts:719`** `payload = buildDirectOrderReq({`
- → 가드가 조립보다 **18줄 위**다. 대기 등록(`state.pending.push`)·타이머 생성·`session.send` 는 전부 그 아래이므로, 중단 시 회수할 것이 없다.

중단 순서: `logger.warn(… "[WS-order] 요청 처리 중 연결 종료 — 주문을 보내지 않는다")` → `enqueueUpdate({ orderRowId, status: "rejected", message: "요청 처리 중 연결이 끊겨 주문을 보내지 않았습니다." })` → `release(state, keys)` → `return`. `reject` 는 호출하지 않으며(받을 소켓 없음) 그 이유를 주석에 남겼다. `release` 가 `closeConn` 뒤에 무해한 이유(`dupKeys.delete` 조기 반환)도 주석에 있다. ⑤ 송신 실패 분기는 손대지 않았다.

**테스트:** `relay/tests/ws-order.test.ts:947` 「㉕ await 중 연결 종료 — insert 왕복 도중 탭을 닫으면 게이트웨이로 나가지 않는다 (GC-CR-03)」. `mkOrderStore({ insertGate })` 로 Supabase 왕복을 붙잡고(`order-store.test.ts` 의 기존 관례) → `insert` 진입 확인 → `ws.close()` → 게이트 해제 → 단언: `DirectOrderReq` **0건** · `status:"rejected"` 1건 · 메시지 일치 · `advanceTimersByTimeAsync(5s×2)` 후에도 `status:"timeout"` **0건** · updates 총 1건.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | **32 passed** (Task 1 시점 31 → Task 2 에서 +1) |
| `pnpm --filter @gh-radar/relay test` | **17 files · 352 tests passed**, exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -c "candidates.length <= 1" relay/src/ws/order-handler.ts` | **0** ✅ |
| `grep -c "isCancelNotice" relay/src/ws/order-handler.ts` | **3** (≥1) ✅ |
| `grep -c "유일 후보라도 취소확인은 신규 대기를 정산하지 않는다" relay/tests/ws-order.test.ts` | **1** ✅ |
| `grep -c "유일 후보는 축을 보지 않는다" relay/tests/ws-order.test.ts` | **0** ✅ |
| `grep -c "conns.get(conn) !== state" relay/src/ws/order-handler.ts` | **2** (가드 1 + 주석 1, ≥1) ✅ |
| `grep -c "요청 처리 중 연결 종료" relay/src/ws/order-handler.ts` | **1** ✅ |
| `grep -c "요청 처리 중 연결이 끊겨" relay/src/ws/order-handler.ts` | **1** ✅ |
| `grep -c "await 중 연결 종료" relay/tests/ws-order.test.ts` | **1** ✅ |

**회귀 잠금 실증(테스트가 실제로 무엇을 잡는지 확인):** 가드 조건을 임시로 `false` 로 바꿔 실행한 결과 ㉕ 가 `AssertionError: expected [ Envelope{…} ] to have a length of +0 but got 1` 로 **실패**했다 — 가드가 없으면 죽은 연결의 주문이 실제로 게이트웨이로 나간다는 것을 실측으로 확인하고 즉시 복원했다. 통과만 보고 넘어가면 그 테스트가 무엇을 지키는지 모른 채 초록불만 얻는다.

## Deviations from Plan

### 계획대로 실행되지 않은 항목

**1. [Rule 1 - 정합] ② 통보 종류 축의 지역 `isCancelNotice` 재선언 제거**
- **발견 시점:** Task 1
- **문제:** 하드 필터에서 `isCancelNotice` 를 함수 스코프에 선언하면 ② 단계의 `const isCancelNotice = …` 가 shadow 재선언이 되어 같은 값을 두 번 계산한다. 계획은 이 지점을 명시하지 않았다.
- **조치:** ② 의 지역 선언을 지우고 하드 필터의 값을 재사용. 「취소성은 위 하드 필터가 이미 걸렀고, 여기서는 접수·체결의 반대 방향을 좁히는 몫이 남는다」는 주석 추가.
- **파일:** `relay/src/ws/order-handler.ts`
- **커밋:** `eeb3a6e`

### 검증 기준 중 충족하지 못한 1건 (스코프 밖)

`<verification>` 의 `grep -rn "10\.41\.1\.120" relay/` **0건** 기준은 **2건**으로 충족하지 못했다. 두 건 모두 이번 plan 이 손대지 않은 **선행 커밋(`506dfc0`, 16-21)의 문서·주석**이다:

- `relay/README.md:17` — 「기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 실계좌 접속은 …」 = **경고문**
- `relay/src/dma/link-health.ts:20` — 터널 판정 조건을 설명하는 주석

둘 다 접속에 쓰이는 리터럴이 아니라 **「실서버에 붙지 말라」는 경고 자체**다. 지우면 D-27 의 안전장치가 사라지므로 제거하지 않았다. D-27 의 실질(실서버 IP·실계좌로 **접속하는 코드** 0건, FakeGateway 만 사용)은 유지된다 — 이번 plan 의 신규 테스트도 FakeGateway 만 쓴다. 기준 문구를 「접속 리터럴 0건」으로 좁히는 것은 다음 문서 plan 의 몫으로 남긴다(스코프 밖).

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-49 (Spoofing / 주문 오귀속) | mitigate ✅ | 하드 필터 `:902-912`. 회귀 잠금 `ws-order.test.ts:1027` |
| T-16-50 (Tampering / 감사 기록 오확정) | mitigate ✅ | 가드 `:701` (조립 `:719` 보다 위). 회귀 잠금 `ws-order.test.ts:947` |
| T-16-51 (Repudiation / 무로그 미정산) | mitigate ✅ | warn 조건 `:359` = `candidates.length > 0 && picked === null` |
| T-16-32 (Information Disclosure) | mitigate ✅ | 새 warn 도 `isin`·`noticeType`·후보 수만. 계좌번호·주문번호 원문 0건 |
| T-16-13 (실서버 접속) | accept ✅ | FakeGateway 만 사용. 신규 테스트도 동일 |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 손댄 표면은 기존 상관 로직과 그 앞의 await 경계뿐이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **TRADE-03 은 여전히 Pending.** 이 plan 은 코드 층위의 GC-CR-01·GC-CR-03 을 닫았을 뿐이다. `16-26` 이 남긴 판정 근거 — 프로덕션 `/healthz` 의 `everReadyCount: 0`, 즉 **Ready 에 도달한 DMA 세션이 한 건도 없었다** — 는 그대로다. 단위 검증만으로 Complete 로 올리지 않는다(RELAY-02 와 같은 기준).
- **배포 미실시.** relay 재배포는 이 plan 의 스코프가 아니다. 갭 클로징 2라운드(16-27~16-35) 종결 plan 에서 일괄 처리한다.

## Self-Check: PASSED

- `relay/src/ws/order-handler.ts` FOUND (수정)
- `relay/tests/ws-order.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-27-SUMMARY.md` FOUND
- commit `eeb3a6e` FOUND
- commit `909a217` FOUND
