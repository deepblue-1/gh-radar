---
phase: 18-gh-trade-ui-nxt-vi
plan: 24
subsystem: database
tags: [postgres, pgtap, check-constraint, three-valued-logic, supabase-migration, gap-closure]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-14 · 18-18)
    provides: "20260921120000 · 20260922120000 의 dma_orders_price_check (원격 적용됨)"
provides:
  - "pgTAP 회귀 supabase/tests/dma_orders_price_check.test.sql (거부 6 · 통과 5 · CHECK 단일성 1)"
  - "일회용 컨테이너 러너 scripts/verify-dma-orders-price-check.sh (--until 컷오프 · trap 정리 · 원격 접촉 0)"
  - "후속 마이그레이션 파일 20260922180000_dma_orders_price_check_null_safe.sql (미적용 — 원격 반영은 18-29)"
  - "T-18-82 정정 기록 (이 SUMMARY)"
affects: [18-29, relay dma_orders insert 경로]

actuals:
  tokens: 4668
  tasks: 2
  commits: 2
plan_head_before: 25a37463d51f9b00d98de430d35b383c0c606cae

tech-stack:
  added: []
  patterns:
    - "DB 회귀는 로컬 이미지 일회용 컨테이너에 저장소 마이그레이션을 파일명 순 재생 → pgTAP (--until 로 수정 전/후 재현)"
    - "CHECK 식의 NULLable 비교는 COALESCE(…, false) 로 접는다 — 사전 확인 WHERE 도 같은 null-safe 식의 부정으로 쓴다"

key-files:
  created:
    - supabase/tests/dma_orders_price_check.test.sql
    - scripts/verify-dma-orders-price-check.sh
    - supabase/migrations/20260922180000_dma_orders_price_check_null_safe.sql
  modified:
    - relay/src/store/orders.ts

key-decisions:
  - "NULL 접기는 COALESCE(krx_session IN ('G2','G3'), false) 로 쓰고 G2/G3 가격 0 은 order_type = 'N' 에만 연다 — 정정+G2+0 도 DB 가 거부"
  - "FK 충족은 트랜잭션 안 auth.users 1행 insert(superuser 세션)로 했다 — session_replication_role 우회는 쓰지 않았다"
  - "러너는 supabase_admin 으로 docker exec 접속만 한다(포트 비공개). 재생에 필요한 사전 스텁은 auth.jwt() 1개뿐(qnf 선례와 동일) — 41개 파일 전량 무수정 재생 성공"

patterns-established:
  - "DB CHECK 회귀는 not ok 줄만 보고 행을 알 수 있게 단언 설명에 (price, order_type, krx_session) 튜플을 그대로 쓴다"

requirements-completed: [TRADE-07]

coverage:
  - id: D1
    description: "수정 전 스키마가 세션 없는 가격 0 신규·정정을 받는다는 사실을 자동 회귀로 재현(RED)"
    requirement: TRADE-07
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --until 20260922120000"
        status: pass
    human_judgment: false
  - id: D2
    description: "NULL 을 FALSE 로 접는 CHECK 마이그레이션 파일 — 회귀 12/12 GREEN, 위반 행 존재 시 트랜잭션째 실패"
    requirement: TRADE-07
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh"
        status: pass
      - kind: manual_procedural
        ref: "20260922120000 까지 재생 + (0,'N',NULL) 1행 → 새 파일 적용 → RAISE · 옛 CHECK 잔존 (아래 원문)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-09-22
---

# Phase 18 Plan 24: dma_orders_price_check NULL-safe (GC-CR-01) Summary

**`dma_orders_price_check` 를 3값 논리 구멍 없이 「가격 0 = 취소 또는 G2/G3 세션 신규」 로 다시 거는 후속 마이그레이션을 만들었습니다. 일회용 로컬 Postgres 에서 pgTAP 회귀로 RED(3줄)를 먼저 재현한 뒤 GREEN(12/12)으로 닫았습니다. 원격 적용은 18-29 몫입니다.**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-09-22T09:28:18Z
- **Completed:** 2026-09-22T09:33:43Z
- **Tasks:** 2/2
- **Files:** 신규 3 · 수정 1

## Accomplishments

- pgTAP 회귀 12단언을 만들었습니다. 러너는 `public.ecr.aws/supabase/postgres:17.6.1.104` 일회용 컨테이너에 마이그레이션 40/41개를 재생한 뒤 회귀를 돌리고, 1회 실행에 약 7.5초 걸립니다. 실행 뒤 남는 컨테이너는 0개입니다.
- 두 컷오프(20260922120000 · 20260921120000) 모두에서 GC-CR-01 을 재현했습니다. 20260921120000 컷오프에서는 가격 0 취소가 이미 통과한다는 것도 확인했습니다. R1 CR-01 이 세운 DB 층 전제가 처음부터 틀렸다는 증거입니다.
- 20260922180000 마이그레이션으로 12/12 GREEN 이 됐습니다. 새 파일만 빼고 재생하면 RED 3줄이 그대로 남으므로, 원인은 이 파일 하나로 격리됩니다.
- 위반 행이 있으면 개수를 말하며 트랜잭션째 실패하고, 옛 CHECK 는 그대로 남습니다(수동 확인).

## Task Commits

1. **Task 1: [tracer] pgTAP 회귀 + 일회용 컨테이너 러너 (RED)** — `ec4a67b` (test)
2. **Task 2: null-safe 후속 마이그레이션 + relay 주석 정정 (GREEN)** — `af4fd68` (fix)

## 증거 원문

### Task 1 — RED, `--until 20260922120000` (40개 재생)

```
# replayed 40 migrations (until 20260922120000)
1..12
not ok 1 - rejects (0,'N',NULL) — 세션 없는 가격 0 신규
# Failed test 1: "rejects (0,'N',NULL) — 세션 없는 가격 0 신규"
#       caught: no exception
#       wanted: 23514
not ok 2 - rejects (0,'M',NULL) — 가격 0 정정
# Failed test 2: "rejects (0,'M',NULL) — 가격 0 정정"
#       caught: no exception
#       wanted: 23514
not ok 3 - rejects (0,'M','G2') — 세션 실린 가격 0 정정
# Failed test 3: "rejects (0,'M','G2') — 세션 실린 가격 0 정정"
#       caught: no exception
#       wanted: 23514
ok 4 - rejects (-1,'N',NULL) — 음수 신규
ok 5 - rejects (-1,'C',NULL) — 음수 취소
ok 6 - rejects (-1,'N','G2') — 세션 실린 음수 신규
ok 7 - accepts (0,'C',NULL) — 시간외종가 원주문(가격 0) 취소
ok 8 - accepts (0,'N','G2') — 장개시전 시간외종가 신규
ok 9 - accepts (0,'N','G3') — 장종료후 시간외종가 신규
ok 10 - accepts (70000,'N',NULL) — 양수 신규
ok 11 - accepts (70000,'M',NULL) — 양수 정정
ok 12 - exactly one CHECK on public.dma_orders references price
ERROR:  3 tests failed of 12
# RESULT: FAIL (psql exit 3)
```

### Task 1 — RED, `--until 20260921120000` (39개 재생, 18-14 이전)

```
# replayed 39 migrations (until 20260921120000)
not ok 1 - rejects (0,'N',NULL) — 세션 없는 가격 0 신규
not ok 2 - rejects (0,'M',NULL) — 가격 0 정정
not ok 3 - rejects (0,'M','G2') — 세션 실린 가격 0 정정
ok 4 - rejects (-1,'N',NULL) — 음수 신규
ok 5 - rejects (-1,'C',NULL) — 음수 취소
ok 6 - rejects (-1,'N','G2') — 세션 실린 음수 신규
ok 7 - accepts (0,'C',NULL) — 시간외종가 원주문(가격 0) 취소
ok 8 - accepts (0,'N','G2') — 장개시전 시간외종가 신규
ok 9 - accepts (0,'N','G3') — 장종료후 시간외종가 신규
ok 10 - accepts (70000,'N',NULL) — 양수 신규
ok 11 - accepts (70000,'M',NULL) — 양수 정정
ok 12 - exactly one CHECK on public.dma_orders references price
# RESULT: FAIL (psql exit 3)
```

`ok 7 - accepts (0,'C',NULL)` 줄을 보면 18-14 이전 CHECK(`price > 0 OR (price = 0 AND krx_session IN ('G2','G3'))`)도 세션 없는 가격 0 취소를 NULL 경로로 이미 통과시켰습니다. R1 CR-01 의 「DB 층이 가격 0 취소를 막는다」 는 전제는 처음부터 틀렸습니다. 18-14 의 DB 층 수정은 실제 동작을 바꾸지 않았고, 선언만 바꿨습니다.

### Task 2 — GREEN, 컷오프 없음 (41개 재생)

```
# replayed 41 migrations
1..12
ok 1 - rejects (0,'N',NULL) — 세션 없는 가격 0 신규
ok 2 - rejects (0,'M',NULL) — 가격 0 정정
ok 3 - rejects (0,'M','G2') — 세션 실린 가격 0 정정
ok 4 - rejects (-1,'N',NULL) — 음수 신규
ok 5 - rejects (-1,'C',NULL) — 음수 취소
ok 6 - rejects (-1,'N','G2') — 세션 실린 음수 신규
ok 7 - accepts (0,'C',NULL) — 시간외종가 원주문(가격 0) 취소
ok 8 - accepts (0,'N','G2') — 장개시전 시간외종가 신규
ok 9 - accepts (0,'N','G3') — 장종료후 시간외종가 신규
ok 10 - accepts (70000,'N',NULL) — 양수 신규
ok 11 - accepts (70000,'M',NULL) — 양수 정정
ok 12 - exactly one CHECK on public.dma_orders references price
# RESULT: PASS
```

새 파일을 넣은 뒤 `--until 20260922120000` 을 다시 돌려도 결과는 `not ok 1/2/3` 과 `# RESULT: FAIL (psql exit 3)` 으로 같습니다. 원인이 새 파일 하나로 격리됩니다.

### Task 2 — 위반 행 존재 시 실패 동작 (수동, 러너 밖 일회용 컨테이너)

20260922120000 까지 재생한 뒤 `(0,'N',NULL)` 행 1건을 넣고 새 파일을 적용했습니다.

```
--- apply 20260922180000 (위반 행 1건 존재) ---
ERROR:  dma_orders_price_check 위반 기존 행 1건 — 새 CHECK 를 걸 수 없어 트랜잭션째 중단합니다 (GC-CR-01)
CONTEXT:  PL/pgSQL function inline_code_block line 15 at RAISE
psql exit=3
--- price CHECK after ---
dma_orders_price_check | CHECK (((price > 0) OR ((price = 0) AND ((order_type = 'C'::text) OR (krx_session = ANY (ARRAY['G2'::text, 'G3'::text]))))))
rows=1
```

옛 CHECK 가 그대로 남았고 행도 그대로입니다. DB 는 아무것도 바꾸지 않았습니다(fail-closed). 컨테이너는 trap 으로 지웠고, 남은 컨테이너는 0개입니다.

## T-18-82 정정 (R3 · GC-CR-01)

**18-18 SUMMARY Task 3 ① 원문 (82행):**

> `"price" > 0` 갈래와 G2/G3 갈래가 그대로 있고, 취소 갈래는 `"price" = 0 AND (…)` 안에 들어 있다. 그래서 음수는 계속 거부되고, 세션 없는 가격 0 신규·정정도 계속 거부된다(T-18-82 완화).

**틀린 점:** 앞 문장(음수 거부)은 맞습니다. 하지만 「세션 없는 가격 0 신규·정정도 계속 거부된다」 는 사실이 아니었습니다. 같은 오류가 20260922120000 머리 주석의 「정정('M') 가격 0 은 여전히 거부된다」 에도 있습니다.

**원인 (3값 논리):** `(price=0, order_type='N', krx_session=NULL)` 행은 다음 순서로 평가됩니다.
1. `krx_session IN ('G2','G3')` → NULL
2. `order_type = 'C' OR NULL` → NULL
3. `price = 0 AND NULL` → NULL
4. `price > 0 OR NULL` → NULL

Postgres 는 CHECK 식이 NULL 이면 통과로 봅니다. `(0,'M',NULL)` 도 같은 경로로 들어갑니다. `(0,'M','G2')` 는 1단계가 TRUE 라 식 전체가 그냥 TRUE 입니다. 18-18 의 검증은 CHECK 정의 **문자열**만 grep 했고(`grep -c order_type` = 1), 실제 행을 insert 해 보지 않았습니다. 그래서 이 구멍을 잡지 못했습니다.

**증거:** 위 Task 1 RED 원문 2종(두 컷오프)과 Task 2 GREEN 원문입니다.

**현재 상태:** 원격 DB 에는 여전히 20260922120000 의 CHECK 가 걸려 있습니다(구멍 있음). 실제로 막고 있는 것은 relay 코드 층입니다. zod(`relay/src/ws/protocol.ts:288` — 신규 가격 0 에 `krxSession` 필수, 정정 스키마는 `krxSession` 을 받지 않음)와 조립기 `priceFloor` 가 그 층입니다. 20260922180000 원격 반영은 **18-29 의 사람 확인 게이트** 뒤에 합니다. 18-18-SUMMARY.md 원본은 이 플랜에서 수정하지 않았습니다.

## Files Created/Modified

- `supabase/tests/dma_orders_price_check.test.sql` — pgTAP 12단언을 한 트랜잭션 안에서 돌리고 ROLLBACK 합니다. FK 는 `auth.users` 1행 insert 로 충족합니다.
- `scripts/verify-dma-orders-price-check.sh` — 일회용 컨테이너 러너입니다(`--until` · trap · 로컬 이미지 전용 · 원격 접촉 0).
- `supabase/migrations/20260922180000_dma_orders_price_check_null_safe.sql` — 사전 확인 DO 블록과 null-safe CHECK 를 담았고, 아직 적용하지 않았습니다.
- `relay/src/store/orders.ts` — `OrderInsertRow.krxSession` 주석만 새 DB 규칙(20260922180000 · 신규)으로 고쳤습니다.

## Decisions Made

- NULL 접기는 `COALESCE(krx_session IN ('G2','G3'), false)` 로 썼습니다. 사전 확인 WHERE 도 같은 식의 `NOT (…)` 입니다. 안쪽 식이 TRUE/FALSE 로만 평가되므로 위반 행을 0 으로 잘못 세지 않습니다.
- FK 는 `auth.users (id, email)` 를 직접 insert 해서 충족했습니다. 이미지의 `auth.users` 는 나머지 컬럼이 NULL 을 허용합니다. `session_replication_role` 은 쓰지 않았습니다.
- 러너는 `supabase_admin`(superuser)으로 접속합니다. 재생 사전 스텁은 `auth.jwt()` 1개로, qnf 선례와 같습니다. 마이그레이션 파일은 하나도 고치지 않았고 41개 전량 재생이 오류 없이 끝났습니다.

## Deviations from Plan

None - plan executed exactly as written.

(참고: 수동 위반 행 확인을 처음 실행했을 때 zsh 변수 단어 분할 때문에 명령을 찾지 못했습니다. 같은 절차를 bash 스크립트로 다시 돌렸고, 산출물에는 영향이 없습니다.)

## 관찰 (고치지 않음 — 범위 밖)

- `relay/src/dma/envelope.ts:966` `priceFloor = orderType === "C" || krxSession !== null ? 0 : 1` 는 조립기 단독으로 보면 정정 + 세션 + 가격 0 을 허용합니다. 다만 zod 정정 스키마가 `krxSession` 을 받지 않으므로(`protocol.ts:328`) 실제 경로는 없습니다. 이제 새 DB CHECK 가 이 조합도 거부합니다. 플랜 지시대로 대조만 하고 코드는 고치지 않았습니다.

## Issues Encountered

없습니다.

## Next Phase Readiness

- 18-29: 원격 반영 전에 `NOT (새 CHECK 식)` 으로 기존 위반 행 수를 사전 확인해야 합니다. 마이그레이션 DO 블록과 같은 식을 쓰면 됩니다. 반영 뒤 이 러너와 같은 12개 튜플로 원격을 검증할지는 18-29 가 정합니다.

## Self-Check: PASSED

- FOUND: supabase/tests/dma_orders_price_check.test.sql
- FOUND: scripts/verify-dma-orders-price-check.sh
- FOUND: supabase/migrations/20260922180000_dma_orders_price_check_null_safe.sql
- FOUND: ec4a67b · af4fd68
- 18-18-SUMMARY.md · 20260921120000 · 20260922120000 diff (plan_head_before..HEAD) 빈 출력
