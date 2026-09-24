---
phase: 19-account-order-journal
plan: 02
subsystem: relay
tags: [relay, wss, order-handler, dma_orders, d-01, d-05, e2e]

requires:
  - phase: 16
    provides: "wss 주문 경로(order-handler) · rid 상관 · narrowPending"
provides:
  - "rid 즉시응답 상관만 남은 relay 주문 핸들러 — 사용자 세션 경로 DB 쓰기 0"
  - "종목맵(symbols) 하나로 열리는 WsFanout 주문 결선"
  - "동결 테이블 dma_orders 에 쓸 수 있는 relay 코드 0 (기록 모듈·테스트·가짜 PostgREST 삭제)"
  - "e2e 2 spec 의 「DB 기록 0건」 단언"
affects: [19-05, 19-10, 19-11, 19-12]

actuals:
  tokens: 91137
  tasks: 3
  commits: 3
plan_head_before: 41a4b28ea09b1b8f269f44a5b57b214f64544a8f

tech-stack:
  added: []
  patterns:
    - "relay 사용자 세션 경로 = 메모리 상관 전용, 기록은 관찰자 기록기 단독 (Phase 19 D-01)"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/src/ws/fanout.ts
    - relay/src/index.ts
    - relay/src/order/notice-status.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/ws-order.test.ts
    - webapp/e2e/specs/orderbook.spec.ts
    - webapp/e2e/specs/trading-workbench.spec.ts
  deleted:
    - relay/src/store/orders.ts
    - relay/tests/order-store.test.ts
    - relay/tests/helpers/fake-dma-orders.ts

key-decisions:
  - "relay 주문 핸들러는 rid 즉시응답 상관만 한다 — 요청 행·정산·미부착 통보·자동주문 행·원주문 정산·정정 이동·전략 캐시 계좌 추정 전부 제거 (D-01)"
  - "요청 경로의 await 가 사라져 ③-2(기록 실패 게이트)·③-3(연결 생존 재확인)도 제거 — 게이트부터 송신까지 동기 경로"
  - "동결 테이블에 쓸 수 있는 코드가 남는 것 자체가 위험이라 store/orders.ts 와 그 테스트·가짜 PostgREST 를 삭제 (D-05)"
  - "Hub 의 {t:\"order\"} 팬아웃과 [HUB] 주문 통보 수신(감사 사본) 로그는 유지 (D-03 · Open Q7)"

patterns-established:
  - "대기와 매칭되지 않는 51 통보는 order-handler 에서 아무것도 하지 않는다 — 토스트는 Hub 팬아웃, 기록은 관찰자"

requirements-completed: [D-01, D-05]

coverage:
  - id: D1
    description: "수동 주문 rid 즉시응답 경로(order.new/modify/cancel → DirectOrderReq(2) → 51 → 요청 연결에만 order.result)가 DB 창구 없이 동작"
    requirement: D-01
    verification:
      - kind: integration
        ref: "relay/tests/ws-order.test.ts (54 tests — ① ② ③ ⑧ ⑩ ⑪ ⑳ ㉒ ㉙ ㉜ ㉟ ㊵ ㊷ ㊸ 등)"
        status: pass
    human_judgment: false
  - id: D2
    description: "중복 가드(rid · 사용자 튜플 · 취소 원주문번호) · 5초 timeout 문구 · narrowPending 상관 회귀"
    requirement: D-01
    verification:
      - kind: integration
        ref: "relay/tests/ws-order.test.ts#⑦ ⑧ ㉓ ㉔ ㉚ ㉛ ㊱ + describe narrowPending"
        status: pass
    human_judgment: false
  - id: D3
    description: "대기 밖 자동주문 통보 → order.result 없음 · 예외 없음 · {t:\"order\"} 사용자 전 연결 팬아웃 · 감사 사본 로그 유지"
    requirement: D-01
    verification:
      - kind: integration
        ref: "relay/tests/ws-order.test.ts#①-c 대기와 매칭되지 않는 자동주문(상따) 통보"
        status: pass
    human_judgment: false
  - id: D4
    description: "WsFanout 이 symbols 만으로 주문 분기를 연다 (기록 창구 미주입 갈래 없음)"
    requirement: D-01
    verification:
      - kind: integration
        ref: "relay/tests/ws-order.test.ts 하네스(orderStore 없이 symbols 만 주입) + tests/fanout.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "relay 에 dma_orders 쓰기 코드 0 — 기록 모듈·테스트·가짜 PostgREST 삭제, relay 전량 회귀 green"
    requirement: D-05
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay run test (21 files · 527 passed)"
        status: pass
      - kind: other
        ref: "grep -rn 'dma_orders\")' relay/src == 0 · grep -rnwE 'OrderStore|supabaseOrderSinks|insertRequest|enqueueUpdate|findIdByOrderNo' relay/src relay/tests == 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "e2e 두 spec 이 실제 relay 프로세스로 「주문은 나가되 DB 기록 0건」을 증명"
    requirement: D-01
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/orderbook.spec.ts e2e/specs/trading-workbench.spec.ts (50 passed)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-09-25
status: complete
---

# Phase 19 Plan 02: relay 사용자 세션 주문 기록부 제거 Summary

**relay wss 주문 핸들러에서 dma_orders 기록부(요청 행·정산·미부착 통보·자동주문 행·원주문 정산·정정 이동·전략 캐시 계좌 추정)를 전부 걷어냈다. 이제 rid 즉시응답 상관만 메모리에서 하고, 기록 모듈 1,318줄과 그 테스트·가짜 PostgREST도 삭제했다. 주문 결선은 종목맵 하나로 열린다.**

## Performance

- **Duration:** 약 12분
- **Started:** 2026-09-24T15:20Z
- **Completed:** 2026-09-24T15:33Z (KST 2026-09-25 00:33)
- **Tasks:** 3/3
- **Files:** 11개 (수정 8 · 삭제 3). diff 는 +163 / −5,784
- **order-handler.ts:** 1,886줄 → 935줄

## Accomplishments

- `order-handler.ts` 계약을 줄였다. `OrderNoticeSource` 는 `on("order")` 하나만 남았다. `OrderHandlerDeps` 는 `sessions · hub · symbols · send · timeoutMs` 다섯 개다. `PendingOrder` 에서는 행 id 를 뺐고, `settle` 은 이동 수량 인자 없이 `(notice | null)` 만 받는다.
- 사용자 세션 경로의 DB 쓰기는 0 이다. 게이트 ⓪①②③③-1 → 조립 → ④ 대기 → ⑤ 송신이 **동기 경로**가 되어, `closeConn` 과의 경쟁(옛 ③-3)도 구조적으로 사라졌다.
- `fanout.ts` 는 `deps.symbols !== undefined` 하나로 주문 분기를 연다. 종목맵이 없을 때의 경고 문구는 「종목맵 미주입 — 주문 인바운드를 받지 않는다」다.
- `index.ts` 에서 기록 모듈 생성·주입·종료 flush 를 뺐다. 종료 절차는 5단계가 됐다.
- `notice-status.ts` 에서 순위 표·종결 집합·교체 가능 상태 함수를 지웠다. 격자의 정본은 `dma_journal_next_status`(19-01)라고 명시했다. `statusOf` / `filledQtyOf` / `ORDER_RESP_TIMEOUT_MS` 는 남겼다.
- `subscription-hub.ts` 는 주석만 바꿨다. 코드 변경은 0 이고, 감사 사본 로그와 `{t:"order"}` 팬아웃은 그대로다.
- e2e: orderbook 은 0건 한 곳, trading-workbench 는 GC5·GC6 두 곳을 `orderInserts()).toHaveLength(0)` 로 반전했다. 픽스처는 건드리지 않았다.

## D-05 근거 (삭제 3파일)

`relay/src/store/orders.ts`(1,318줄) · `relay/tests/order-store.test.ts`(67 it) · `relay/tests/helpers/fake-dma-orders.ts` 를 `git rm` 했다. D-05 로 `dma_orders` 는 전환 시점부터 쓰기를 멈추는 동결 테이블이다. 거기에 쓸 수 있는 코드가 relay 에 남아 있는 것 자체가 위험이다. 누군가 다시 결선하는 순간 동결이 깨지고 두 기록자가 되살아난다. 삭제 전에 `relay/src · relay/tests · webapp/e2e` 에 남은 import 가 0 인 것을 확인했다(Task 1 이 order-handler · index · ws-order 를 먼저 정리했다).

## ws-order.test.ts 케이스 표 (92 → 54 tests)

| 구분 | 케이스 | 사유 |
|------|--------|------|
| 삭제 | ⑫ ⑬ ⑭ | 자동주문 새 행 insert · 기존 행 update · 수동 통보 조회 갱신 — 기록 경로 전용 (D-01) |
| 삭제 | ⑯ | 기록 실패 → 주문 안 보냄 게이트(③-2) 제거 (D-01) |
| 삭제 | ⑱ ⑲ | 자동주문 insert 경주(in-flight)·조회 userId — 기록 경로 전용 (D-01) |
| 삭제 | ㉕ | await 중 연결 종료(③-3) — await 가 사라져 경로 자체가 없음 (D-01) |
| 삭제 | ㉖ | 연결 종료 후 통보의 0행 갱신 대신 error — 기록 경로 전용. 감사 사본 단언은 ①-c 로 옮김 (D-01) |
| 삭제 | ㉗ ㉘ | 행 생성 예외·빈 주문번호 거부 행 분리 — 기록 경로 전용 (D-01) |
| 삭제 | ㉞ | 자동주문 감사 행 side 표기 — 기록 경로 전용 (D-01) |
| 삭제 | ㊹ ㊺ (+ 진짜 store 하네스 3 헬퍼) | 늦은 M 의 상태 단조성 — 이제 DB 투영(19-01) 몫 (D-01) |
| 삭제 | describe「quick-260923-m23 — 정정확인 M 수량」 | 정정 이동 기록·qty 캡 — 기록 경로 전용 (D-01) |
| 삭제 | describe「quick-260923-e1m — 통보 기록 경로」 | S1·B1·A1 기록 규칙 — 기록 경로 전용 (D-01) |
| 삭제 | describe「isCancelLikeNotice」 · describe「modifyMovedQty」 | 함수 자체 제거 (D-01) |
| 수정(DB 단언 제거) | ① | insert·update 단언 → 와이어 `orderType N` 단언으로 대체, order.result 유지 |
| 수정 | ①-b | 제목에서 「감사 행 stock_code null」 제거, 와이어 market Q 단언 유지 |
| 수정(재작성) | ①-c | DB 전용 케이스라 → `<behavior>` 자동주문 통보 케이스로: 두 탭 모두 `{t:"order"}` 수신 · order.result 0 · unhandledRejection 0 · 감사 사본 로그(계좌 없음) · 다른 종목 수동 대기는 오정산 없이 timeout |
| 수정 | ③ ④ ⑤ ⑥ | insert 단언 제거. 와이어·거부 프레임·0바이트 단언 유지 |
| 수정 | ㊴ | 제목 「감사 기록과 와이어」 → 「와이어」, insert 단언 제거, 조립 로그 단언 유지 |
| 유지(부수 DB 단언만 제거) | ⑦ ⑧ ⑨ ⑩ ⑪ ⑮ ⑳ ㉑ ㉓ ㉔ ㉙ ㉚ ㉛ ㉜ ㉟ ㊱ ㊲ ㊳ ㊵ ㊶ ㊷ ㊸ | 상관·프레임 단언은 그대로. ⑧ 은 DB result_code 단언을 프레임 `resultCode < 0` 으로, ⑪ 은 타이머 정리 관측을 「첫 주문 통보 미수신」 error 로그 부재로 바꿈 |
| 유지(무수정) | ② ⑰ ㉒ ㉝ · describe「narrowPending」 전체(`mkPending` 의 행 id 필드만 제거) | 변경 없음 |

## Task Commits

1. **Task 1 [tracer]: order-handler 기록부 제거 · 결선 정리 · ws-order 하네스** — `b89cfde` (refactor)
2. **Task 2: 죽은 기록 모듈 삭제 · 순위 표 정리 · hub 주석** — `30eeccb` (refactor, 의도한 삭제 3파일)
3. **Task 3: e2e 감사 기록 단언을 0건으로 반전** — `c497d47` (test)

Tracer 게이트: HUMAN_VERIFY_MODE end-of-phase, `<verify>` 가 automated 전용이라 재실행했고 통과했다. 이 게이트를 통과한 뒤 Task 2·3 으로 확장했다.

## 검증 결과

- `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts tests/fanout.test.ts` → 2 files, 103 passed
- `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` → 0 error
- `pnpm --filter @gh-radar/relay run test` → 21 files, 527 passed
- 프로젝트 build_command(shared build + relay typecheck 2종 + webapp typecheck) → exit 0
- `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/orderbook.spec.ts e2e/specs/trading-workbench.spec.ts` → 50 passed (2.0m, dev 3100 자동 기동 + 로컬 relay 픽스처 8090)
- Acceptance grep: 기록 식별자 0 (relay/src/ws · index.ts) · `deps.symbols !== undefined` fanout.ts:401 · narrowPending 6 · 「결과를 확인하지 못했습니다」 3 · 삭제 3파일 부재 · OrderStore 류 0 (src+tests) · `dma_orders")` 0 · 「감사 사본」 2 · `orderInserts()).toHaveLength(0)` orderbook 1 / workbench 2 · 픽스처 diff 없음

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 「유지」 케이스에도 DB 단언이 붙어 있었다**
- **Found during:** Task 1
- **Issue:** RESEARCH 는 ⑦ ⑧ ⑨ ⑩ ⑪ ⑮ ⑳ ㉑ ㉓ ㉔ ㉙ ㉚ ㉛ ㉜ ㉟ ㊱ ㊲ ㊳ ㊵ ㊶ ㊷ ㊸ 를 무수정 「유지」로 분류했다. 그런데 실제로는 이 케이스들에 `orders.inserts/updates/lookups` 단언이 부수적으로 들어 있어, 하네스에서 기록 창구를 빼면 컴파일되지 않는다.
- **Fix:** 상관·프레임·와이어 단언은 그대로 두고 DB 단언 줄만 뺐다. ⑧ 은 「DB 에 result_code 를 쓰지 않는다」를 프레임 `resultCode < 0`(relay 자체 판정 표지)으로 옮겼다. ⑪ 은 타이머 정리 관측을 timeout 갱신 부재에서 「첫 주문 통보 미수신」 error 로그 부재로 바꿨다(finish(null) 이 send 전에 남기는 유일한 흔적).
- **Files modified:** relay/tests/ws-order.test.ts
- **Commit:** b89cfde

**2. [Rule 2 - 계획 허용 범위] ①-c 를 자동주문 behavior 케이스로 재작성**
- **Found during:** Task 1
- **Issue:** ①-c 는 단언이 전부 DB 라서, DB 단언만 걷어내면 빈 테스트가 된다. `<behavior>` 의 자동주문 통보 케이스(order.result 없음 · hub 팬아웃 그대로)도 기존에 없었다.
- **Fix:** ①-c 를 그 케이스로 다시 썼다. 삭제된 ㉖·㉗ 이 잠그던 「감사 사본 로그 유지 · unhandledRejection 0」 단언도 여기로 옮겼다.
- **Commit:** b89cfde

**3. [정리] order-handler 의 `filledQtyOf` import 제거**
- 원래 `patchOf`/정산 갱신에서만 쓰였다. `finish` 의 order.result status 는 `statusOf` 만 쓴다. `notice-status.ts` 의 `filledQtyOf` export 는 plan 지시대로 남겼다(현재 relay 내 사용처 0 — 관찰자 기록기가 필요하면 쓴다).

**Total deviations:** 3건(모두 자동 처리, 테스트 표면 한정). **Impact:** 제품 동작 범위 변화 없음. 요청 연결 한정 order.result 의 모양·문구·대상, Hub 팬아웃, 감사 로그는 그대로다.

## 남은 참고 사항 (범위 밖, 수정하지 않음)

- `relay/src/store/symbols.ts` 의 `stocksCodeOf` 는 이제 relay/src 안에 사용처가 없고 `tests/gateway-symbols.test.ts` 만 쓴다. 관찰자 기록기(19-05)가 `stock_code` 를 채울 때 재사용할 수 있어 두었다.
- `relay/src/dma/envelope.ts` 의 `toOrderOrigin` 주석, `symbols.ts` 주석, `notice-status.ts` 머리 주석에 `dma_orders.*` 열 이름 언급이 남아 있다. 동작과 무관하고, 새 테이블 열 이름이 확정되는 19-05 에서 함께 정리하는 편이 낫다.
- 배포·push 하지 않았다. 전환은 19-11 / 19-12 에서 한 번에 한다(D-14).

## Known Stubs

없음. 이 plan 은 제거 작업이라 새 UI·데이터 경로가 없다.

## Threat Flags

없음. 새 네트워크 표면·인증 경로·스키마 변경이 없다. 주문 게이트 ⓪①②③③-1 과 연결 스코프 대기 맵·`send` 주입 경로는 그대로다(T-19-19/20/21 — 유지 케이스 ② ⑤ ⑦ ㉓ ㊲ 가 회귀로 잠근다).

## Next Phase Readiness

19-02 완료. relay 쪽 D-01 제거가 끝났으므로 관찰자 기록기(19-05)는 유일한 기록자로 새로 더하기만 하면 된다. 결선은 19-10 이 index.ts 에 더한다.

## Self-Check: PASSED

- FOUND: relay/src/ws/order-handler.ts · relay/src/ws/fanout.ts · relay/src/index.ts · relay/tests/ws-order.test.ts · webapp/e2e/specs/orderbook.spec.ts · webapp/e2e/specs/trading-workbench.spec.ts
- ABSENT(의도): relay/src/store/orders.ts · relay/tests/order-store.test.ts · relay/tests/helpers/fake-dma-orders.ts
- FOUND commits: b89cfde · 30eeccb · c497d47
