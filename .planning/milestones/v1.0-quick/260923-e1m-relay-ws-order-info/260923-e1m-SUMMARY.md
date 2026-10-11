---
phase: quick-260923-e1m
plan: 01
subsystem: relay (WS-order 통보 기록 경로 · dma_orders 쓰기 창구)
status: complete
tags: [relay, dma_orders, ws-order, limit-chaser, vi, audit, logging]
requires: []
provides:
  - "OrderUpdate.filledQtyDelta · OrderFillSink · supabaseOrderFillSink(CAS 누적 + 상태 파생) · OrderSinks.addFill · ORDER_FILL_CAS_MAX_ATTEMPTS"
  - "isCancelLikeNotice · settleOriginal(원주문 라우팅) · autoInsertRow B3 가드"
  - "relayTrail · isRelayRelated (공유 세션 WinForms 수동 통보 info 강등)"
affects: [relay/src/store/orders.ts, relay/src/ws/order-handler.ts]
tech-stack:
  added: []
  patterns:
    - "PostgREST 조건부 UPDATE compare-and-swap (eq filled_qty · eq status + select id, 0행이면 재조회)"
    - "취소성 통보 = 원주문 행 갱신 (orgOrderNo 축, 거래소 자동취소는 orderNo)"
    - "relay 흔적(당일 · 사용자당)으로 ERROR/info 판정"
key-files:
  created: []
  modified:
    - relay/src/store/orders.ts
    - relay/src/ws/order-handler.ts
    - relay/tests/helpers/fake-dma-orders.ts
    - relay/tests/order-store.test.ts
    - relay/tests/ws-order.test.ts
decisions:
  - "S1 누적은 Supabase RPC 가 아니라 PostgREST 조건부 UPDATE(CAS)로 한다 — 직렬 drain · relay 단독 writer(D-03) · 18-33 과 같은 판단. 마이그레이션 0, relay 단독 배포"
  - "대기 밖 E 는 filledQtyDelta(조각), finish 첫 통보는 filledQty(절대값) — 둘을 함께 실으면 계약 위반 드롭"
  - "종결 행(cancelled·rejected)에 늦은 E 는 filled_qty 만 누적 — status·notice_type·message 불변"
  - "자동 C 는 원주문 행을 {orderRowId, status cancelled, noticeType, resultCode, message} 로만 갱신 — orderNo·origin·체결수량은 싣지 않는다"
  - "자동 R(정정·취소 거부)은 원주문 상태 유지 — 조회·갱신·insert 0, info 1줄"
  - "relay 흔적(timeout·연결 종료 종목 + 정산 주문번호)과 후보 존재로 ERROR/info 를 가른다 — 오판은 ERROR 쪽(보수적)"
metrics:
  duration: "~15분"
  completed: 2026-09-23
  tasks: 3
  files: 5
actuals:
  tokens: 20300
  tasks: 3
  commits: 0
plan_head_before: a46131f
---

# Phase quick-260923-e1m Plan 01: relay WS-order 통보 기록 경로 4결함(S1·B1·B3·A1) Summary

대기 밖 체결 조각을 CAS 조건부 UPDATE 로 `filled_qty` 에 누적하고, 행 `qty` 로 filled/partially_filled 를 파생한다. 자동주문 취소확인 C 는 원주문번호로 원주문 행을 cancelled 로 닫는다. 취소성 통보로는 새 행을 만들지 않는다. 공유 세션 WinForms 수동 통보는 ERROR 가 아니라 info 로 남긴다. 마이그레이션·RPC 는 없다.

> **commits: 0 은 의도된 값이다.** 실행 제약에 따라 executor 는 커밋하지 않았다(사용자 CLAUDE.md — 커밋 메시지 확인 후 오케스트레이터가 커밋). 변경 5파일은 working tree 에 미커밋 상태로 남아 있다. 아래 「제안 커밋」 참고.

## S1 설계 판단 — RPC 대신 CAS

**조사 결과.** 대기에 붙은 경로(`finish`)에도 누적 방식은 없다. 그 경로는 첫 통보 1건의 절대값을 방금 insert 한 신선한 행(filled_qty 0)에 쓴다. 코드베이스의 증분 패턴은 `incr_api_usage` RPC(`20260417120000_api_usage.sql`) 하나뿐이다. `dma_orders` 원 마이그레이션(`20260905120200`)도 「v1 은 filled_qty 누적으로 충분하다」라고 적어 두었고, `filled_qty integer NOT NULL DEFAULT 0` 이라 CAS 비교값이 NULL 일 수 없다.

**CAS 를 택한 근거 3가지:**
1. **18-33(R3-WR-01)과 같은 판단이다.** 「relay 필터로 UPDATE 한 문장 안에서 원자적으로 한다. 마이그레이션·트리거가 필요 없고, 원격 반영 사람 게이트가 없다」.
2. **relay 가 유일한 writer 다(D-03).** 그리고 `#drain` 은 항목을 직렬로 await 한다. relay 내부에는 동시 쓰기가 없다. CAS 는 그 전제가 깨질 때를 위한 원자성 보증이다. 재시도 상한은 `ORDER_FILL_CAS_MAX_ATTEMPTS = 3` 이고, 상한에 닿으면 throw 해 큐의 재시도 1회·드롭 규율로 넘긴다.
3. **마이그레이션이 없다.** 배포 순서 제약(마이그레이션 → relay)과 원격 적용 게이트가 사라지고 relay 단독 배포가 된다.

비용은 조각당 왕복 2회(select + update)다. 큐는 비동기라 통보 수신 경로(D-32)를 막지 않는다.

## 태스크별 변경

### Task 1 (tracer · S1) — 대기 밖 E 조각 누적 + 상태 파생
- `store/orders.ts`
  - `OrderUpdate.filledQtyDelta` 를 추가했다(조각이고 더한다. 대기 밖 전용이며 `filledQty` 와 함께 실으면 계약 위반이다).
  - `OrderFillSink` 타입, 필수 필드 `OrderSinks.addFill`, `ORDER_FILL_CAS_MAX_ATTEMPTS = 3` 을 추가했다.
  - `supabaseOrderFillSink` 동작은 이렇다.
    - 먼저 `id, qty, filled_qty, status` 를 읽는다. `order_no` 셀렉터는 lookup 과 같은 3축에 최근 1행이다.
    - `next = cur + delta` 를 계산하고, `next ≥ qty` 면 filled, 아니면 partially_filled 로 파생한다.
    - 그 전이가 `replaceableStatusesOf` 에 맞으면 patch(`order_no` 제외)와 함께 쓴다. 종결 행이면 `filled_qty`·`updated_at` 만 쓴다.
    - UPDATE 조건은 `eq id · eq filled_qty(cur) · eq status(읽은 값)` + `select id` 다. 0행이면 다시 읽는다.
    - qty 를 넘는 누적은 자르지 않고 warn 을 남긴다(`column·qty·filledQty` 만).
    - 행이 없으면 warn + `{applied:false}` 다. PostgREST 오류는 `safePgError` 를 지난 뒤 throw 한다.
  - `supabaseOrderSinks` 가 `addFill` 을 싣는다. index.ts 는 그대로다.
  - `OrderStore` 에 `#addFill` 과 `QueueItem.fillDelta` 를 추가했다. `enqueueUpdate` 는 두 필드를 함께 실으면 드롭하고, 1 미만·비정수 delta 는 warn 후 무시하며, delta 가 있으면 빈 patch 도 받는다. `#drain` 은 delta 를 fill sink 로 보낸다. 미결선이면 throw 해 재시도→드롭으로 드러난다.
- `ws/order-handler.ts`: `patchOf` 가 `filledQtyDelta: filledQtyOf(notice)` 를 싣는다. `finish` 는 절대값 그대로 두고 주석만 추가했다.
- `tests/helpers/fake-dma-orders.ts`
  - `select(cols)` 컬럼 투영과 `FakeQuery.columns` 를 추가했다.
  - DB 기본값 거울 `DB_DEFAULTS`(status 'requested' · filled_qty 0)를 한 곳에 두고, `eq`·`in`·투영이 이 값을 읽는다.
  - insert 행에 `qty`·`filled_qty: 0` 을 넣는다.
  - `onSelect(q, nth)` 훅은 결과를 스냅숏한 **뒤**에 부른다. 그래서 CAS 경합을 재현한다.

### Task 2 (B1 · B3) — 자동주문 취소성 통보 → 원주문 행
- `ws/order-handler.ts`
  - `export function isCancelLikeNotice` 를 추가했다. C 는 항상 참이다. R 은 정규화한 orgOrderNo 가 있거나 requestKind 가 Cancel/Modify 일 때 참이다. A·E·M 은 거짓이다.
  - 내부 함수 `orderNoLookupKeys(raw)` 를 추가했다. `[trim, 정규화 후 10자리 0 좌패딩]` 에서 중복과 빈 값을 뺀다.
  - `recordUnmatched` 에서 수동 분기 뒤·`ensureRow` 앞에 `isCancelLikeNotice` 분기를 두고 `settleOriginal` 로 보낸다.
  - `settleOriginal` 동작은 이렇다.
    - R 이면 info 1줄만 남긴다(원주문 상태 유지).
    - C 는 orgOrderNo 로 찾는다. orgOrderNo 가 비어 있으면(거래소 자동취소) orderNo 로 찾는다. inflight 왕복이 있으면 재사용하고, 없으면 `findIdByOrderNo` 로 찾는다.
    - 찾으면 `{orderRowId, status cancelled, noticeType, resultCode, message}` 로 갱신한다.
    - 못 찾으면 warn 만 남긴다.
    - 조회가 실패하면 `safePgError` error 를 남기고, 원주문번호 셀렉터로 cancelled 열화 갱신을 보낸다.
  - `autoInsertRow` 맨 앞에 B3 가드를 두었다. 취소성 통보가 오면 error 를 남기고 null 을 돌려준다.
  - 낡은 가격 CHECK 주석은 원격 CHECK(20260922120000 + 20260922180000) 기준으로 고쳤다.
  - `orderType` 은 `"N"` 고정이다(C 는 가드 때문에 도달하지 않는다).
  - 파일 머리 T-16-07 문단과 recordUnmatched docstring 에 한 줄씩 더했다.
- `tests/ws-order.test.ts`: `mkOrderStore` 에 `existingIds`·`lookupFails` 를 추가했다.

### Task 3 (A1) — 공유 세션 WinForms 수동 통보 info 강등
- `ws/order-handler.ts`
  - `relayTrail`(사용자당 `{day, isins, orderNos}`, KST 일 단위로 비움)과 `trailOf`·`markTrailIsin`·`markTrailOrderNo`·`isRelayRelated` 를 추가했다.
  - 흔적을 찍는 자리는 셋이다. `finish(null)` 은 isin, `finish(notice)` 는 정산 주문번호, `closeConn` 은 대기를 비우기 전에 각 대기의 isin 을 남긴다.
  - hub 리스너가 `recordUnmatched(userId, notice, candidates.length > 0)` 로 후보 여부를 넘긴다.
  - 수동 분기에서 붙을 행이 없을 때 판정은 이렇다. `isRelayRelated` 가 참이면 기존 ERROR 문구를 그대로 쓴다. 거짓이면 info 로 「같은 세션의 다른 클라이언트(WinForms 등) 주문 통보 — relay 가 낸 주문이 아니다 (공유 게이트웨이 세션 팬아웃 · D-17 철회), 기록 대상 아님」 을 남긴다.
  - recordUnmatched docstring 에 3번 항목(공유 세션 팬아웃)과 판정 규칙 문단을 추가했다.

## 테스트 결과

| 항목 | 이전 | 이후 |
|------|------|------|
| `pnpm --filter @gh-radar/relay test` | 22 files · 564 tests green | **22 files · 586 tests green** (+22) |
| `typecheck` | 0 오류 | 0 오류 |
| `typecheck:tests` | 0 오류 | 0 오류 |
| `git status --porcelain -- supabase/migrations` | 비어 있음 | 비어 있음 |
| `grep -c '\.rpc(' relay/src/store/orders.ts` | 0 | 0 |

RED → GREEN 순서로 확인했다.
- Task 1: order-store 10 fail(⓻-b 포함), ws-order ⑬·S1-① fail → 구현 후 green
- Task 2: B1 6건 + isCancelLikeNotice 3건 fail → green(B1-⑤ 는 보존 경로라 처음부터 통과)
- Task 3: A1-① fail → green(A1-② 는 ERROR 유지 잠금이라 처음부터 통과)

기존 ⑨ ⑫ ①-c ㉑ ㉖ ㉗ ㉘ ㊸ ㊹ ㊺ 는 수정 없이 통과한다. ⑬ 은 기대값만 `filledQtyDelta: 7` 로 바꿨다.

**새 테스트 (22):**
- order-store 「S1 — 체결 조각 누적 (quick-260923-e1m)」 9건
  - S1-a 조각 3·4 → 7 partially_filled, +3 → 10 filled
  - S1-b CAS 경합 재조회 → 8
  - S1-b2 경합이 상한까지 가면 error + throw
  - S1-c 종결 행은 filled_qty 만 누적
  - S1-d order_no 셀렉터 3축 누적(남의 행·어제 행 불변, patch 에 order_no 없음)
  - S1-e 행 없음 → warn + `{applied:false}`
  - S1-f qty 초과 warn(필드 3개, 원문 없음)
  - S1-g 계약 위반 드롭 + rowPatchOf 가 delta 로 컬럼을 만들지 않음
  - S1-h 갱신 전용 store 의 delta → 재시도 후 드롭 + error
- ws-order 「quick-260923-e1m — 통보 기록 경로」 10건
  - S1-① 진짜 store e2e 누적
  - B1-①~⑦: LC C, VI C, R804 상태 유지, 미발견 warn, 거래소 자동취소 예외, 조회 실패 열화, 진짜 store C
  - A1-① WinForms 3건 info, A1-② relay 관련 ERROR 유지
- ws-order 「isCancelLikeNotice — 취소성 통보 판정」 3건

## 배포 단계 (20:00 KST 이후에만)

1. **마이그레이션이 없으므로 DB 단계도 없다.** 원격 DB 는 건드리지 않는다.
2. relay 를 기존 `scripts/deploy-relay.sh` 로 배포한다. 장중(08:00~20:00)에는 재시작하지 않는다. `GCP_PROJECT_ID`·`SUPABASE_URL` 등 env 는 기존 배포 규약을 따른다.
3. `/healthz` 와 `scripts/smoke-relay.sh` 로 검증한다.
4. 그다음 push 한다. 이 저장소에서 push 는 곧 webapp 배포다. 이번 변경에는 webapp diff 가 없다. 다른 세션의 webapp 미커밋 변경(layout/*, vi-order-list, exchange-tag, e2e)은 이 커밋에 섞지 않는다.
5. 배포 다음 장중에 docker logs 를 확인한다.
   - `docker logs gh-radar-relay | grep WS-order` 로 세 가지를 본다. 「다른 클라이언트」 info 가 나오는지, relay 주문이 없는 창에서 「붙지 않는 수동 통보」 ERROR 가 0 인지, 「가격이 0 이하」 가 0 인지다.
   - dma_orders 에서는 자동 원주문의 cancelled 전이(notice_type C)와 대기 밖 체결의 filled_qty 누적 → filled 전이를 확인한다.

## 관측된 잔여 (범위 밖)

- **수동 취소 pending 정산 시 원주문 행을 갱신하지 않는다.** relay 가 낸 수동 취소가 finish 로 정산될 때 원주문 행(수동·자동 모두)이 cancelled 로 바뀌지 않는다(진단 조사 6 — 09-10 3404010000). B1 은 자동주문 recordUnmatched 경로만 다룬다.
- **기존 오염 행을 보정하지 않았다.** LC 059/070 의 filled_qty 700/408, 그리고 accepted 로 고착된 자동 취소 원주문들(VI 012/013/018/019/033/034, LC 023/024/029/031/039/041 등)이다. 코드 수정만 했다.
- **finish 직후 200ms 플러시 전 E 조회 누락 경합이 남아 있다.** 이제 relay 흔적(정산 주문번호) 덕분에 ERROR 로 드러난다(A1-②). 조각 자체는 기록되지 않는다.
- **교보 브로커 경로는 그대로다**(orgOrderNo 를 기입하지 않고 noticeType 기본값이 'A').
- **정정확인 M 의 자동 insert 동작**은 바꾸지 않았다.
- **(신규 관찰) 자동주문의 첫 통보가 E 인 경우 문제가 있다.** `autoInsertRow` 가 `qty` 에 체결 조각 수량을 적는다(기존 동작). 그 뒤 조각 누적이 곧 qty 에 닿아 행이 filled 로 파생될 수 있다. 정상 흐름은 A 가 먼저 오므로 드물다. 고치려면 E-first insert 의 qty 출처를 따로 정해야 한다.
- **relay 흔적은 재시작하면 사라진다.** 재시작은 20:00 이후뿐이라 수용했다. 같은 날 relay 주문이 걸렸던 종목의 WinForms 주문은 ERROR 로 남는다(보수적 오판 방향).

## Deviations from Plan

**계획을 벗어난 판단 1건과 추가 테스트:**
- **[Rule 2 — 정확성] fill sink 가 행 `qty` 를 모르는 경우(비숫자·≤0)를 방어했다.** 이때는 상태를 지어내지 않고 `filled_qty`·`updated_at` 만 누적한다. 실제 DB 는 `qty NOT NULL CHECK > 0` 이라 도달하지 않는 방어다.
- 계획의 behavior 5건 외에 S1-b2(CAS 상한), S1-d(order_no 셀렉터 3축), S1-e(행 없음), S1-f(qty 초과 warn 필드)를 더했다. T-e1m-01/03 mitigation 을 잠그기 위해서다.

그 밖에는 계획대로 실행했다.

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·스키마 변경은 없다. 새 로그 줄에는 계좌 필드가 없다(A1-①·B1-③·B1-⑥ 이 SAMPLE_ACCOUNT_NO 부재를 단언한다). fill sink 로그는 column·숫자만 싣는다. PostgREST 오류는 전부 `safePgError` 를 지난다.

## 제안 커밋 (한글 · Co-Authored-By 없음)

relay 파일만 담는다. `.planning/quick/260923-cqj*`·`260923-dmb*` 와 webapp 파일은 절대 섞지 않는다.

1. `fix(quick-260923-e1m): 대기 밖 체결 조각을 filled_qty 에 CAS 로 누적하고 행 수량으로 체결 상태를 파생한다`
   - relay/src/store/orders.ts
   - relay/src/ws/order-handler.ts
   - relay/tests/helpers/fake-dma-orders.ts
   - relay/tests/order-store.test.ts
   - relay/tests/ws-order.test.ts

   (세 태스크가 같은 두 소스·두 테스트 파일을 공유하고 hunk 가 섞여 있다. 그래서 태스크별로 나누려면 `git add -p` 가 필요하다. 아래 단일 커밋안을 권장한다.)

**권장 — 단일 코드 커밋 + 문서 커밋:**

1. `fix(quick-260923-e1m): relay 주문 통보 기록 경로 — 체결 조각 누적·자동취소 원주문 닫기·WinForms 수동 통보 info 강등`
   - relay/src/store/orders.ts
   - relay/src/ws/order-handler.ts
   - relay/tests/helpers/fake-dma-orders.ts
   - relay/tests/order-store.test.ts
   - relay/tests/ws-order.test.ts
2. `docs(quick-260923-e1m): relay WS-order 통보 기록 경로 수정 — PLAN·SUMMARY 기록`
   - .planning/quick/260923-e1m-relay-ws-order-info/260923-e1m-PLAN.md
   - .planning/quick/260923-e1m-relay-ws-order-info/260923-e1m-SUMMARY.md
   - (선택) .planning/debug/relay-ws-order-unmatched-notice.md — `fix`/`files_changed` 갱신이 필요하면 오케스트레이터가 채운다

## Self-Check: PASSED

- FOUND: relay/src/store/orders.ts (supabaseOrderFillSink ×여러 곳, ORDER_FILL_CAS_MAX_ATTEMPTS)
- FOUND: relay/src/ws/order-handler.ts (isCancelLikeNotice export 1, settleOriginal ≥2, isRelayRelated ≥2, 20260922180000 ≥1, 낡은 「price` 는 CHECK > 0」 0)
- FOUND: relay/tests/helpers/fake-dma-orders.ts, relay/tests/order-store.test.ts, relay/tests/ws-order.test.ts
- 커밋 해시: 없음(의도 — executor 커밋 금지 제약)
- `git status --porcelain -- relay` = 계획한 5파일뿐
