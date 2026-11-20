---
phase: 44-admin-settlement
plan: 03
subsystem: admin-settlement
tags: [supabase, plpgsql, pgtap, settlement, rpc]

requires:
  - phase: 44-01
    provides: 표 5(settlement_ledger · settlement_ledger_history · settlement_settles 등) · admin_settlement_raw · 내부 함수 settlement_ledger_json(17키)
provides:
  - 거래 쓰기 RPC 3 — settlement_ledger_save(bigint, jsonb, text) · settlement_ledger_delete(bigint, text) · settlement_set_pend(jsonb)
  - 정산 RPC 2 — settlement_settle_confirm(text, bigint, jsonb, jsonb, text) · settlement_settle_cancel(bigint, text)
  - 오류 코드 FUTURE_DATE · PERSON_NOT_IN_POOL · NO_SUCH_ROW · SETTLE_LINKED · STALE_SETTLE · NOT_LATEST
  - pgTAP settlement.test.sql 절 L · D · C · X(192 단언)
affects: [44-05, 44-08, 44-13]

actuals:
  tokens: 11685
  tasks: 2
  commits: 4
plan_head_before: c43a2618d7dae35f55d154601b71068444bda538
plan_head_after: 51906966e4bd68e27dfee8c07b4175f8ff37d6d7

tech-stack:
  added: []
  patterns:
    - "쓰기 RPC 는 업무 규칙(미래 날짜 · 사람-묶음 · 정산 줄 잠금)을 P0001 코드로 먼저 쥐고, 모양 CHECK 는 23514 그대로 올린다"
    - "고치기 · 지우기 · 정산 취소는 지움 표시 + settlement_ledger_history(before = to_jsonb(옛 행) · snake_case) — 물리 DELETE 없음"
    - "묶음 단위 pg_advisory_xact_lock(hashtext('settlement_settle:' || pool)) + 최신 id IS DISTINCT FROM 기대값 → STALE_SETTLE"
    - "pgTAP 에서 RPC 반환은 CREATE TEMP TABLE … AS SELECT rpc(...) AS r 로 잡고 pg_temp 도우미(t44_day · t44_id)로 KST 날짜 · id 를 쓴다"

key-files:
  created:
    - supabase/migrations/20261120110000_settlement_ledger_rpc.sql
    - supabase/migrations/20261120120000_settlement_settle_rpc.sql
  modified:
    - supabase/tests/settlement.test.sql

key-decisions:
  - "settlement_set_pend 는 항목마다 UPDATE · 하나라도 없는 id 면 NO_SUCH_ROW 로 호출 전체를 되돌린다 · 빈 배열은 아무것도 하지 않는다(플랜 「바뀐 행이 0 이면」 을 항목 단위로 읽음)"
  - "settlement_ledger_save 고치기는 kind 까지 값 열 전부를 바꾼다 · seeded · created_by/at 은 그대로"
  - "pend 가 없거나 JSON null 이면 {} · 객체가 아니면 22023(save · set_pend 둘 다) · confirm 의 p_pool 이 p1 · p2 가 아니면 22023"
  - "confirm 의 p_outs 빈 배열 허용(rowIds []) — 바로 출금 없는 정산"
  - "cancel 은 바로 출금 줄을 FOR UPDATE 로 잠근 뒤 취소 전 json 을 모으고 history · 지움 표시 순(set_pend 와 엇갈려도 반환 값 = 지운 값)"
  - "마이그레이션 버전 20261120110000 · 20261120120000 — 로컬 꼬리 20261120100000_settlement.sql 다음. 원격 머리는 조회하지 않았다(오케스트레이터 제약). 44-13 이 push 전에 확인"

patterns-established:
  - "정산 쓰기 RPC 오류 규약: P0001 + MESSAGE 코드 6종(아래 표) — server 44-05 · 44-08 이 409 · 404 로 옮긴다"

requirements-completed: []

coverage:
  - id: D1
    description: "거래 저장 · 고치기 RPC — 17키 반환 · created_by · edited_by/at · FUTURE_DATE · PERSON_NOT_IN_POOL · NO_SUCH_ROW · SETTLE_LINKED · history edit · 23514 그대로"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql (절 L · 24 단언)"
        status: pass
    human_judgment: false
  - id: D2
    description: "거래 지우기 RPC — 반환 = 지우기 전 행 · 지움 표시 · history delete · 조회에서 빠짐 · 행 보존 · NO_SUCH_ROW · SETTLE_LINKED"
    verification:
      - kind: integration
        ref: "supabase/tests/settlement.test.sql (절 D · 9 단언)"
        status: pass
    human_judgment: false
  - id: D3
    description: "반영 결과 기록 RPC — 지운 줄 포함 · 없는 id 전체 취소 · 22023"
    verification:
      - kind: integration
        ref: "supabase/tests/settlement.test.sql (절 X1 · 8 단언)"
        status: pass
    human_judgment: false
  - id: D4
    description: "정산 확정 · 취소 RPC — 묶음 잠금 · STALE_SETTLE · 정산 + 바로 출금 한 트랜잭션 · 최근 것만 취소(NOT_LATEST) · 바로 출금 줄 함께 settle_cancel · 취소 전 줄 반환 · NO_SUCH_ROW · 23514"
    verification:
      - kind: integration
        ref: "supabase/tests/settlement.test.sql (절 C · 30 단언)"
        status: pass
    human_judgment: false
  - id: D5
    description: "쓰기 RPC 5 권한 — anon · authenticated EXECUTE 불가 · service_role 가능 · SECURITY DEFINER · search_path 고정 · 다른 phase pgTAP 회귀 없음"
    verification:
      - kind: integration
        ref: "supabase/tests/settlement.test.sql (절 X2 · 17 단언)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dart_alert.test.sql (183 ok)"
        status: pass
    human_judgment: false
  - id: D6
    description: "실제 두 탭 동시 확정에서 advisory lock 이 둘째를 STALE_SETTLE 로 돌려보내는지(두 세션 경합)"
    verification: []
    human_judgment: true
    rationale: "pgTAP 은 한 세션 · 한 트랜잭션이라 잠금 대기를 재현하지 못한다 — 순차 기대값 대조(C2)만 잠갔다. 두 세션 경합은 44-08 server 테스트 · 44-13 운영 확인 몫"

duration: 9min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 03: 정산 쓰기 RPC 5(거래 저장 · 고치기 · 지우기 · 반영 결과 기록 · 정산 확정 · 취소) Summary

**거래 쓰기 RPC 3(`20261120110000_settlement_ledger_rpc.sql`)과 정산 RPC 2(`20261120120000_settlement_settle_rpc.sql`)가 미래 날짜 · 심쥬니-묶음 · 바로 출금 줄 직접 수정 금지 · 묶음 잠금 기대값 대조 · 최근 정산만 취소 · 지움 표시 이력 규칙을 트랜잭션 안에서 쥐고, 진짜 Postgres 에서 pgTAP 192 단언(새 88)으로 잠겼다.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-11-20T01:03:05Z
- **Completed:** 2026-11-20T01:11:26Z
- **Tasks:** 2 (DB-LEDGER-OK · DB-SETTLE-OK 모두 도달)
- **Files modified:** 3 (새 파일 2 · 고친 파일 1)

## Accomplishments

- 거래 저장 · 고치기 · 지우기 · 반영 결과 기록 RPC — server 44-05 가 부를 계약(17키 반환 · 오류 코드 4종).
- 정산 확정 · 취소 RPC — 묶음 advisory lock 안에서 기대값 대조 · 정산 + 바로 출금 줄 한 트랜잭션 · 최근 것만 취소 · 취소 전 줄 반환(server 44-08 계약).
- 행 물리 DELETE 없음 · 이력 RPC 없음(D-21 · 플랜 금지 2건 지킴).

## Task Commits

1. **Task 1: 거래 쓰기 RPC + pgTAP L · D · X** — RED `93c83dcd` (test) → GREEN `e4a49c36` (feat)
2. **Task 2: 정산 RPC + pgTAP C · X2** — RED `2a825784` (test) → GREEN `51906966` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## 정한 마이그레이션 버전

| 항목 | 값 |
|---|---|
| T1 버전 | `20261120110000` (`supabase/migrations/20261120110000_settlement_ledger_rpc.sql`) |
| T2 버전 | `20261120120000` (`supabase/migrations/20261120120000_settlement_settle_rpc.sql`) |
| 로컬 꼬리(그때) | `20261120100000_settlement.sql`(44-01) — 메인 체크아웃 `supabase/migrations` 꼬리도 같음 |
| 원격 머리 | **조회 안 함** — 오케스트레이터 제약(원격 · 운영 접촉 금지). 44-13 이 push 전에 `supabase migration list --linked` 로 확인해야 한다 |
| 순서 · 중복 | 스키마 `20261120100000` < 거래 RPC `20261120110000` < 정산 RPC `20261120120000` · `ls supabase/migrations \| cut -c1-14 \| sort \| uniq -d` 빈 출력 |
| 앞 파일 | 44-01 `_settlement.sql` · T1 `_settlement_ledger_rpc.sql` 모두 커밋 뒤 고치지 않음(`git diff --quiet HEAD` 통과 · T2 커밋 파일 목록에 없음) |

## RPC 시그니처 · 반환

| RPC | 인자 | 반환 |
|---|---|---|
| `settlement_ledger_save(p_id bigint, p_row jsonb, p_by text)` | `p_id` NULL = 새 줄 · 아니면 고치기. `p_row` = `txDate` · `kind` · `who` · `fromAcc` · `toAcc` · `via` · `amountKrw` · `memo`(기본 '') · `reflect`(기본 false) · `pend`(기본 {}) | `settlement_ledger_json` 17키 |
| `settlement_ledger_delete(p_id bigint, p_by text)` | — | 지우기 **전** 행 17키(reflect · pend 포함) |
| `settlement_set_pend(p_pends jsonb)` | `[{id, pend: {accKey: {deltaKrw, targetKrw, reason}}}]` — 지운 줄 포함 | void |
| `settlement_settle_confirm(p_pool text, p_expect_prev bigint, p_settle jsonb, p_outs jsonb, p_by text)` | `p_settle` = `profitKrw` · `shares` · `snapshot` · `readAt` · `memo` / `p_outs` = `[{who, fromAcc, amountKrw, reflect, pend}]`(빈 배열 허용) | `{settleId, rowIds}` — rowIds 는 p_outs 순서 |
| `settlement_settle_cancel(p_id bigint, p_by text)` | — | `{rows: [취소 전 바로 출금 줄 17키 — id 순]}` |

- 다섯 함수 모두 plpgsql · `SECURITY DEFINER` · `SET search_path = public, pg_temp` · `REVOKE … FROM PUBLIC` · `FROM anon, authenticated` · `GRANT … TO service_role` · COMMENT.
- 「오늘」 = `(now() AT TIME ZONE 'Asia/Seoul')::date`(save 의 미래 판정 · confirm 의 바로 출금 줄 날짜).
- 이력 `before` 는 `to_jsonb(옛 행)` 이라 키가 snake_case 열 이름(`amount_krw` · `deleted_at` …)이다 — 화면에 내보내지 않는 DB 전용 값.

## 오류 코드 표 (`RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'`)

| 코드 | RPC | 언제 |
|---|---|---|
| `FUTURE_DATE` | save | `txDate` > KST 오늘(D-12) |
| `PERSON_NOT_IN_POOL` | save(새로 · 고치기) | 출자 · 원금 회수 + 심쥬니(J) + kbG · kyH · kyG(D-29) — 표 CHECK 23514 앞에서 |
| `NO_SUCH_ROW` | save 고치기 · delete · set_pend · cancel | 없는 id · 지운 줄(save · delete) · 없는 id(set_pend — 지운 줄은 받음) · 없는 정산 · 이미 취소한 정산(cancel) |
| `SETTLE_LINKED` | save 고치기 · delete | `settle_id` 있는 바로 출금 줄(D-19) |
| `STALE_SETTLE` | confirm | 묶음 최신(취소 안 된) 정산 id `IS DISTINCT FROM p_expect_prev`(Pitfall 5) |
| `NOT_LATEST` | cancel | 그 묶음 가장 최근 정산이 아님(D-17) |
| 22023 | save · set_pend · confirm | `p_row` 객체 아님 · `pend` 객체 아님 · `p_pends` 배열 아님 · `p_pool` 이 p1 · p2 아님 · `p_settle` 객체 아님 · `p_outs` 배열 아님 |
| 23514 · 23502 | save · confirm | 종류별 모양 · 금액 · 메모 · 수익 0 이하 CHECK · NOT NULL — 원래 코드 그대로 |

## pgTAP 단언 수

- `supabase/tests/settlement.test.sql` — **192**(44-01 104 + 이 플랜 88: L 24 · D 9 · C 30 · X1 8 · X2 17 — 함수 존재 has_function 은 L0 3 · C0 2 로 L · C 에 포함) · 192 ok · 0 not ok.
- 회귀: `supabase/tests/dart_alert.test.sql` 183 ok · 0 not ok(마이그레이션 148개 재생).
- 절 머리: `-- L.` · `-- D.` · `-- C.` · `-- X.`. 일회용 컨테이너 1개씩 · 원격 DB 접촉 0.

## Files Created/Modified

- `supabase/migrations/20261120110000_settlement_ledger_rpc.sql` — 거래 쓰기 RPC 3
- `supabase/migrations/20261120120000_settlement_settle_rpc.sql` — 정산 RPC 2
- `supabase/tests/settlement.test.sql` — 절 L · D · C · X 추가 · plan 104 → 192

## Decisions Made

- 위 frontmatter `key-decisions` 6건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] RED 증거 — 함수 없는 재생은 psql 이 첫 직접 호출에서 멈춰 TAP 이 불완전**
- **Found during:** Task 1 · Task 2 RED
- **Issue:** 새 함수 없이 돌리면 `CREATE TEMP TABLE … AS SELECT rpc(...)` 가 42883 으로 트랜잭션을 깨 분류기 `invalid_record` 가 된다(44-01 메모 3 과 같은 벽).
- **Fix:** 44-01 과 같은 방식 — 커밋하지 않는 변형 마이그레이션을 scratchpad 에 두고 `--until <앞 버전> --with <변형>` 으로 전 단언을 돌렸다. T1 변형은 D-12 미래 날짜 검사만 뺐고(대상 「L2 (D-12) 내일(KST) 날짜 → FUTURE_DATE」 가 `caught: no exception` · 144 ok), T2 변형은 cancel 의 「이미 취소」 검사만 뺐다(대상 「C4 취소한 정산 다시 취소 → NO_SUCH_ROW」 가 `caught: P0001: NOT_LATEST` · 191 ok). 둘 다 `RED_EVIDENCE_OK`. 커밋된 마이그레이션은 완성본뿐.
- **Committed in:** 93c83dcd · 2a825784(RED 테스트) → e4a49c36 · 51906966(GREEN)

**2. [Rule 2 - 빠진 검증] 인자 모양 22023 검사 추가**
- **Found during:** Task 1 · Task 2 구현
- **Issue:** 플랜은 `settlement_set_pend` 의 배열 검사만 적었다. `pend` 가 배열 · 문자열이면 표에 그대로 들어가 shared `SettlementPend`(객체) 계약이 깨지고, `p_pool` NULL 이면 advisory lock 이 STRICT 로 건너뛰어진다.
- **Fix:** save · set_pend 의 pend 객체 검사 · confirm 의 `p_pool` · `p_settle` · `p_outs` 모양 검사(22023). pgTAP X1 「pend 가 객체가 아니면 22023」 로 잠금.
- **Committed in:** e4a49c36 · 51906966

**3. [환경] 하네스가 복합 git · 검증 명령을 거절**
- 두 `<automated>` 명령을 같은 내용의 scratchpad 스크립트(`verify_t1.sh` · `verify_t2.sh` — 첫 줄에서 worktree 루트로 `cd`)로 실행(명령 본문 불변) — DB-LEDGER-OK · DB-SETTLE-OK.

---

**Total deviations:** 3 (막힘 1 · 빠진 검증 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 22023 검사는 인자 모양 방어뿐이고 업무 코드 · 반환 키는 플랜 그대로다.

## TDD Gate Compliance

- Task 1: `test(44-03)` 93c83dcd → `feat(44-03)` e4a49c36 — RED `RED_EVIDENCE_OK`(대상 「L2 (D-12) 내일(KST) 날짜 → FUTURE_DATE」 · `caught: no exception · wanted: P0001` · 145 중 144 ok). 의미 판정: 대상이 실제로 돌았고 계획한 throws_ok 단언에서, 미래 날짜를 받아들여서 실패했다 — 설정 · 불러오기 오류 없음.
- Task 2: `test(44-03)` 2a825784 → `feat(44-03)` 51906966 — RED `RED_EVIDENCE_OK`(대상 「C4 취소한 정산 다시 취소 → NO_SUCH_ROW」 · `caught: P0001: NOT_LATEST · wanted: P0001: NO_SUCH_ROW` · 192 중 191 ok). 의미 판정: 이미 취소한 정산을 다시 취소할 때 「없음」 으로 알아보지 못해 실패 — 계획한 단언 · 다른 실패 없음.
- REFACTOR 커밋 없음(정리할 것 없음).

## Issues Encountered

- 없음(위 막힘은 전부 자동 처리).

## Known Stubs

- 없음 — 이 플랜은 DB 함수 · 테스트만 더했다.

## User Setup Required

None — 원격 DB push 는 44-13(메인 세션).

## Next Phase Readiness

- server 44-05(거래 쓰기 라우트)는 `settlement_ledger_save` · `settlement_ledger_delete` · `settlement_set_pend` 를, 44-08(정산 라우트)은 `settlement_settle_confirm` · `settlement_settle_cancel` 을 위 시그니처 · 반환 · 오류 코드 표대로 부르면 된다. `STALE_SETTLE` · `NOT_LATEST` · `SETTLE_LINKED` · `FUTURE_DATE` · `PERSON_NOT_IN_POOL` 은 409 계열, `NO_SUCH_ROW` 는 404 계열로 옮기는 것이 자연스럽다(서버 몫).
- 44-13 은 push 전에 원격 머리가 `20261120100000` 보다 작은지 확인하고, 세 파일(스키마 · 거래 RPC · 정산 RPC)을 함께 올린다.
- 44-04 시드 마이그레이션 버전은 `20261120120000` 보다 커야 한다.

## Self-Check: PASSED

- 새 파일 2개 있음(`supabase/migrations/20261120110000_settlement_ledger_rpc.sql` · `supabase/migrations/20261120120000_settlement_settle_rpc.sql`).
- 커밋 4개(`93c83dcd` · `e4a49c36` · `2a825784` · `51906966`) 모두 이 브랜치(`worktree-agent-ab9e32c8f89d2beeb`) 조상 · `git rev-list --count c43a2618..HEAD` = 4.
- 인수 기준: T1 6항목 · T2 5항목 전부 통과(grep 수 fn 3 · FUTURE_DATE 4 · PERSON_NOT_IN_POOL 4 · SETTLE_LINKED 6 · anon 3 · ledger_json 3 · 재정의 0 · 절 L/D/X 3 / fn 2 · lock 2 · STALE 4 · NOT_LATEST 5 · anon 2 · 절 C 1). 각 태스크 커밋 파일 목록에 앞 마이그레이션 없음.
- 검증: settlement 192 ok · dart_alert 183 ok · not ok 0 · 「Looks like you planned」 없음.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
