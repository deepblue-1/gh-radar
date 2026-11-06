---
phase: 40-fill-push-notification
plan: 05
subsystem: database
status: complete
tags: [supabase, postgres, plpgsql, pgtap, push, idempotency]

requires:
  - phase: 40-01
    provides: "dma_push_devices · dma_push_chains · dma_push_log 표 · dma_push_device_upsert/disable RPC"
  - phase: 40-02
    provides: "PushFacts · PushAutoSellFacts camelCase 키 계약"
provides:
  - "RPC public.dma_push_claim(p_gateway text, p_orders uuid[], p_strategy jsonb, p_recipients jsonb, p_platforms text[], p_allow_fallback boolean) RETURNS jsonb — 판정 · 멱등 · 기록 · 기기 조회 DB 왕복 1회"
  - "반환 {sends: [{log_id, stage, chain_key, facts, devices: [{device_id, platform, token}]}], deferred: [uuid]}"
affects: [40-06, 40-12]

actuals:
  tokens: 21800
  tasks: 3
  commits: 5
plan_head_before: 43ae0da89cf3a70bdf08391d636febece7346ff2
plan_head_after: cd282539f93c69033557fef4c06a5de3dbd4a7c9

tech-stack:
  added: []
  patterns:
    - "판정(①) → 기록(②) 두 단계 루프 — 판정 결과를 jsonb 사건 목록으로 모은 뒤 한 곳에서 체인 단조 upsert · 로그 · 기기 조회"
    - "후보 → 체인 루트 재귀 CTE + GROUP BY 로 한 호출 안 같은 체인 1회 판정(D-09)"
    - "pgTAP 픽스처는 pg_temp PROCEDURE + CALL — 반환값 줄이 TAP 스트림에 섞이지 않는다"

key-files:
  created:
    - supabase/migrations/20261107100100_dma_push_claim.sql
    - supabase/tests/dma_push_claim.test.sql
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-05-task2-red.json
    - .planning/phases/40-fill-push-notification/tdd-evidence/40-05-task3-red.json
  modified: []

key-decisions:
  - "이미 그 단계 이상을 기록한 체인은 구분 짝 · 취소 사유를 기다리지 않고 판정을 끝낸다 — 재생 · 가운데 조각이 deferred 를 부풀리지 않게"
  - "거부 단계의 구분 짝은 루트 주문번호의 kind 3/6/8 · 그 밖 단계는 kind 3/6 · group 0 행은 짝으로 치지 않는다"
  - "자동매도 완료의 평균 · 손익 범위 = 같은 계좌 · 종목 · 거래일의 직전 kind 11 시각 ~ 그 kind 13 시각 매도 E 행(완료 뒤 매도는 다음 주기 몫)"
  - "자동매도 사실: kind 11 은 basePrice = bid1_price · triggerPrice = price, kind 13 은 basePrice = price(기준 가격) · triggerPrice 0(모름) · origin 'limit_chaser' · side 'S'"
  - "당일 밖 수동 취소는 suppressed 가 아니라 stale 로 기록(당일 판정이 먼저)"

patterns-established:
  - "판정 RPC 는 행 스냅샷이 아니라 호출 시점 DB 행을 읽는다 — relay 는 후보 id 만 넘긴다"

requirements-completed: [SC-1, SC-2, SC-3, SC-4]

coverage:
  - id: D1
    description: "3조각 체결 → 첫 체결 1 + 전량 1 · 가운데 조각 0 · 한 묶음 접수→전량 = 전량 1"
    requirement: SC-1
    verification:
      - kind: integration
        ref: "supabase/tests/dma_push_claim.test.sql#1~6절"
        status: pass
    human_judgment: false
  - id: D2
    description: "같은 후보 재호출 · stale/suppressed 뒤 재호출 · 같은 kind 11 재호출 = sends 0 (체인 단조 upsert)"
    requirement: SC-2
    verification:
      - kind: integration
        ref: "supabase/tests/dma_push_claim.test.sql#5 · 14 · 17 · 18절"
        status: pass
    human_judgment: false
  - id: D3
    description: "정정 체인 1개로 셈 · 신규/로컬 거부 · 서버/거래소/수동 취소 · 구분 짝 대기 · group 9 억제 · 자동매도 시작/완료 사실"
    verification:
      - kind: integration
        ref: "supabase/tests/dma_push_claim.test.sql#9~18절"
        status: pass
    human_judgment: false
  - id: D4
    description: "받는 기기 = p_recipients[계좌] 사용자의 켜진 p_platforms 기기 · 다른 계좌 · 토글 꺼짐 · 플랫폼 밖 0 · 반환에 계좌 키 없음 · 권한 (f, f, t)"
    requirement: SC-4
    verification:
      - kind: integration
        ref: "supabase/tests/dma_push_claim.test.sql#1 · 8 · 19 · 20절"
        status: pass
    human_judgment: false
  - id: D5
    description: "저널 적용 RPC 재정의 없음 · 기존 저널 적용 · 기기 테스트 회귀 통과"
    requirement: SC-3
    verification:
      - kind: other
        ref: "grep -v '^[[:space:]]*--' supabase/migrations/20261107100100_dma_push_claim.sql | grep -cE 'FUNCTION public\\.dma_(journal|strategy)_apply' = 0"
        status: pass
      - kind: integration
        ref: "supabase/tests/dma_journal_apply.test.sql (96) · supabase/tests/dma_push_devices.test.sql (48)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-11-07
---

# Phase 40 Plan 05: 체결 푸시 판정 RPC Summary

**`dma_push_claim` 한 번 호출로 체인 루트(정정 거슬러 오르기) · 7단계 판정 · 구분 짝/취소 사유 대기 · 당일 · 체인 단조 upsert · 받는 기기 조회 · 송신 로그를 한 트랜잭션에서 끝내고, 계좌번호 없는 `{sends, deferred}` 를 돌려준다 — pgTAP 90단언으로 3조각 → 2건 · 재생 0 · 계좌 범위를 잠갔다.**

## Performance

- **Duration:** 약 15분
- **Started:** 2026-11-06T23:22:44Z
- **Completed:** 2026-11-06T23:37:10Z
- **Tasks:** 3 (tracer 1 · TDD 2)
- **Files:** 새 파일 4(마이그레이션 · pgTAP · RED 증거 2)

## 최종 마이그레이션 이름

`supabase/migrations/20261107100100_dma_push_claim.sql` — 계획 이름 그대로. 시작 때 워크트리 · master 의 가장 늦은 버전이 `20261107100000_dma_push_tables.sql`(40-01) 이라 바꿀 필요가 없었다.

## 계약 (40-06 relay 가 소비)

`public.dma_push_claim(p_gateway text, p_orders uuid[], p_strategy jsonb, p_recipients jsonb, p_platforms text[], p_allow_fallback boolean) RETURNS jsonb` · `LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp` · EXECUTE (anon, authenticated, service_role) = (f, f, t).

반환 예시(pgTAP 2절 실제 반환 — 토큰 · id 는 가림):

```json
{
  "sends": [{
    "log_id": "c0940e67-…",
    "stage": "first_fill",
    "chain_key": "0004011",
    "facts": {
      "stage": "first_fill", "isin": "KR7282720005", "stockName": "금양그린파워", "stockCode": "282720",
      "exchange": "KRX", "tradeDate": "2026-11-07", "gwTimeMs": 1794009602000, "side": "B", "group": 1,
      "origin": "limit_chaser", "qty": 500, "price": 3120, "filledQty": 200, "lastFillPrice": 3120,
      "avgFillPrice": 3120, "cancelledQty": null, "cancelReason": null, "message": null, "autosell": null
    },
    "devices": [{ "device_id": "0b2890f8-…", "platform": "ios", "token": "<가림>" }]
  }],
  "deferred": []
}
```

자동매도 완료(18절) `facts.autosell` = `{"basis": 1, "basePrice": 3120, "triggerPrice": 0, "soldQty": 500, "avgSellPrice": 3104, "pnlPct": -0.48}` · `chain_key` = `"AS:ep-40:123"`. 짝 대기(15절) = `{"sends": [], "deferred": ["415de65a-…"]}`.

## Accomplishments

- **판정 한 길(R1~R13):** 후보 id → 재귀 CTE 로 체인 루트(M/C → org_order_no · 깊이 20 · 부모 없으면 org 문자열 키 · 로컬 거부 `R:epoch:seq`) → `GROUP BY` 로 같은 체인 1회 판정 → 구성원(루트 + 정정 행 재귀) Σfilled · 살아 있는 구성원 · C 행 · E 행(체결가 · 가중 평균 · 시각) → 거부 > 전량 > 취소 > 첫 체결 > 접수(트리거가 루트 N 일 때만) 순.
- **멱등(SC-2):** `INSERT … ON CONFLICT DO UPDATE … WHERE sent_rank < EXCLUDED.sent_rank RETURNING` 이 행을 돌려줄 때만 로그 INSERT → sends. 기기 0 이면 아무것도 쓰지 않는다. stale · suppressed 는 rank 3 체인 + 로그만.
- **구분 짝 · 대기(D-03 · Pitfall 3):** 루트 주문번호 kind 3/6(거부는 8) · 로컬 거부는 kind 8 (계좌 · isin · result_code · 3초). 짝이 없고 origin 이 manual/vi 가 아니면 false 호출은 기록 없이 `deferred`. 서버 취소의 kind 7 사유도 같은 규칙, 거래소 자기 취소(C 행 없음)는 사유 5 로 바로.
- **억제:** 수동 취소(C 행 requester 'Manual' · kind 7 사유 1) · group 9 자동매도 주문 → suppressed. 정정/취소 요청 거부 후보는 판정 대상 밖.
- **자동매도 사건(R10):** kind 11 → 시작 · kind 13 (4 ∧ ≠4) → 완료(누적 매도 수량 · 발동 뒤 매도 평균 · Σ실현손익 ÷ Σ(qty × 평단) × 100).
- **수신자(D-06 · SC-4):** 기기 조회 한 곳 `enabled ∧ platform = ANY(p_platforms) ∧ user_id = ANY(p_recipients[계좌])`. 반환 어디에도 `account_no` · `accountNo` 없음(jsonb_path 검사 + 양성 대조).

## pgTAP

- `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql` → `1..90` · 90 ok · `# RESULT: PASS` (117 마이그레이션 재생)
- 회귀 `… --test supabase/tests/dma_push_devices.test.sql` → `1..48` · `# RESULT: PASS`
- 회귀 `… --test supabase/tests/dma_journal_apply.test.sql` → `1..96` · `# RESULT: PASS`
- **단언 수: 90** (Task 1 18 · Task 2 49 · Task 3 23)

## Task Commits

1. **Task 1 (tracer): 판정 한 길 — 접수 · 첫 체결 · 전량 + 체인 단조 upsert + 기기 · 로그** — `2353bd74` (feat)
2. **Task 2: 정정 체인 · 거부 · 취소 · 당일 밖 · 짝 대기 · 자동매도 주문 억제**
   - RED — `c0ab7f4c` (test)
   - GREEN — `b86fc353` (feat)
3. **Task 3: 자동매도 시작/완료 사실 + 수신자 · 플랫폼 · 토글 · 계좌 범위 + 권한 회귀**
   - RED — `7073f05c` (test)
   - GREEN — `cd282539` (feat)

Tracer 게이트: 자동 모드 아님 · `end-of-phase` + 자동 verify 만 → 재실행 PASS 확인 후 확장. REFACTOR 커밋 없음(정리할 것 없음).

## TDD Gate Compliance

- **Task 2 RED** `c0ab7f4c` — exit 1 · 대상 `(0004041, 서버 취소) stage = cancelled` = not ok 35(have first_fill · want cancelled) · 33/67 실패 · 분류기 `RED_EVIDENCE_OK`(`target_test_failed`). 증거 `tdd-evidence/40-05-task2-red.json`.
  - semanticAssessment: 대상 단언이 실제 실행돼 R6 취소 규칙 부재로 first_fill 이 나와 실패. 구문 · 픽스처 · 로드 오류 없음. 실패 33개 전부 Task 2 규칙 단언, 통과 34 = Task 1 18 + 현행값이 곧 기대값인 경계 16(정정 행 접수 0 · 요청 거부 0 · stale · manual 무대기 · true 폴백).
- **Task 2 GREEN** `b86fc353` — 67/67 PASS.
- **Task 3 RED** `7073f05c` — exit 1 · 대상 `(kind 11 seq 120) stage = autosell_start` = not ok 67(have NULL) · 10/90 실패 · 분류기 `RED_EVIDENCE_OK`. 증거 `tdd-evidence/40-05-task3-red.json`.
  - semanticAssessment: 대상 단언이 실제 실행돼 R10(p_strategy 판정) 부재로 NULL. 실패 10개 전부 18절 자동매도. 19 · 20절(수신자 · 플랫폼 · 토글 · 계좌 범위 · 키 부재)은 Task 1 기기 조회가 이미 계약대로라 통과 — 회귀 잠금으로 더했다.
- **Task 3 GREEN** `cd282539` — 90/90 PASS + 회귀 2개 PASS.

## Decisions Made

frontmatter `key-decisions` 5개. 요지: (1) 이미 그 단계 이상 기록한 체인은 짝 · 사유를 기다리지 않는다, (2) 거부 짝은 kind 8 도 본다(RESEARCH Pattern 5 — 계획 R12 는 3/6 만 적었으나 behavior 「kind 8 짝 group 2」 가 요구), (3) 자동매도 완료 매도 범위 상한 = kind 13 시각, (4) kind 13 의 기준가 · 발동가 매핑, (5) 당일 판정이 수동 억제보다 먼저.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 견고성] 재생 · 가운데 조각은 짝 대기를 만들지 않는다**
- **Found during:** Task 2
- **Issue:** 계획 R12 순서대로면 이미 보낸 단계와 같은 단계를 다시 판정할 때도 짝이 없으면 deferred 를 돌려줘 relay 가 쓸모없는 1.5초 재호출을 한다.
- **Fix:** 판정 직후 `dma_push_chains` 의 sent_rank 가 그 단계 rank 이상이면 짝 조회 전에 건너뛴다(단조 upsert 의 WHERE 는 동시성 방어로 그대로 둔다).
- **Files modified:** supabase/migrations/20261107100100_dma_push_claim.sql
- **Commit:** `b86fc353`

**2. [Rule 2 - 견고성] 입력 모양 방어**
- **Found during:** Task 1 · 3
- **Issue:** p_recipients 원소가 uuid 가 아니거나, p_strategy 원소가 객체가 아니거나 seq 가 숫자가 아니면 캐스트 예외로 묶음 전체가 실패한다.
- **Fix:** uuid 정규식 · `jsonb_typeof` · seq 정규식으로 거른 뒤 캐스트(모양 어긋난 원소 = 없는 것과 같다). `p_allow_fallback` NULL = false. 구성원이 0 인 체인(부모 없는 C 행만)은 건너뛴다.
- **Files modified:** supabase/migrations/20261107100100_dma_push_claim.sql
- **Commit:** `2353bd74` · `b86fc353` · `cd282539`

### 계획 해석

- 계획 「단언은 헬퍼 함수 없이」 — 단언은 전부 `is/ok` + `jsonb_array_length` · `#>>` 로 썼다. 픽스처(주문 행 · E 행 · 전략 행 삽입)만 `pg_temp` PROCEDURE + `CALL` 로 묶었다(반환값 줄이 TAP 에 섞이지 않게).
- 계획 Task 3 의 「수신자 · 플랫폼 · enabled 거름을 기기 조회 한 곳으로 정리」 는 Task 1 에서 이미 한 곳(기록 루프의 기기 조회)으로 구현돼 Task 3 은 회귀 단언만 더했다.

**Total deviations:** 2 auto-fixed (Rule 2 둘). **Impact:** 반환 계약 · 체인 키 규칙은 계획과 같다. 추가는 전부 대기 감소 · 입력 방어.

## Issues Encountered

- 자동매도 루프 변수 `s` 가 주문 판정 쿼리의 별칭 `s`(dma_strategy_events) 와 겹쳐 plpgsql 「ambiguous column」 오류 → 변수를 `v_sev` 로 바꿈(같은 GREEN 커밋 안).

## 남은 위험 (40-06 · 40-12 가 알아야 할 것)

- **A6** — 자동매도 주문의 저널 origin 이 limit_chaser 가 아니라 NULL 이어도 지금 규칙(manual/vi 가 아니면 대기)이 대기를 건다. 대기 뒤에도 kind 6 group 9 가 없으면 억제를 놓친다 — 그 경우는 두 기록기 지연이 1.5초를 넘을 때뿐.
- **relay 재호출:** `deferred` 는 같은 id 를 `p_allow_fallback = true` 로 한 번 더 부르는 것이 계약이다(40-06).

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261107100100_dma_push_claim.sql
- FOUND: supabase/tests/dma_push_claim.test.sql
- FOUND: .planning/phases/40-fill-push-notification/tdd-evidence/40-05-task2-red.json
- FOUND: .planning/phases/40-fill-push-notification/tdd-evidence/40-05-task3-red.json
- FOUND: 2353bd74 · c0ab7f4c · b86fc353 · 7073f05c · cd282539 (HEAD 조상)
