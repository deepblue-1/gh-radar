---
phase: 35-launch-gate
plan: 04
subsystem: database
tags: [postgres, supabase, pgtap, plpgsql, rpc, launch-gate, journal]

requires:
  - phase: 35-02
    provides: "launch_pieces · launch_heads · launch_upsert_piece/head(jsonb, text) 규칙 헬퍼"
provides:
  - "launch_project_event(public.dma_strategy_events) — Wave A no-op 스텁(35-10 이 같은 시그니처로 교체)"
  - "dma_strategy_apply(text, text, jsonb) 재정의 — kind 17·18 만 예외 서브블록 투영 · rows 제외 · errors[{seq, error}]"
  - "launch_reproject(p_from date DEFAULT NULL, p_to date DEFAULT NULL) → {projected, errors}"
  - "dma_strategy_events_for_user_json(uuid, date, boolean) · dma_order_events_for_user(uuid, uuid, text[]) 재정의 — kind 17·18 제외"
  - "pgTAP supabase/tests/launch_gate_apply.test.sql (38 단언)"
affects: [35-09, 35-10]

actuals:
  tokens: 11017
  tasks: 2
  commits: 4
plan_head_before: 8fedc10902738d54cdce143a3bd766f730aa91f8
plan_head_after: 9cbf11d99aa8f4c6bcf988630976bb1a44794675

tech-stack:
  added: []
  patterns:
    - "적용 RPC 재정의 + kind 한정 예외 서브블록(포이즌 격리 T-19-15 동형 · 원문 INSERT 는 블록 밖)"
    - "pgTAP 에서 투영 함수를 모드 표(t_mode: map · boom · stub)로 바꿔 끼우는 테스트 매핑(ROLLBACK 으로 소멸)"

key-files:
  created:
    - supabase/migrations/20261027200100_launch_gate_apply.sql
    - supabase/tests/launch_gate_apply.test.sql
    - .planning/phases/35-launch-gate/deferred-items.md
  modified: []

key-decisions:
  - "35-04: 재생 멱등의 updated_at 불변 단언은 트랜잭션 안 now() 고정 때문에 그대로면 공허하다 — launch_* updated_at 에 2000-01-01 표시값을 박고 재생 뒤 그대로인지 본다 + 투영 호출 계수(t_calls)로 투영 0회를 직접 확인"
  - "35-04: 스텁 단언은 테스트 매핑으로 바꾸기 전에 마이그레이션의 실제 스텁으로 적재해 확인한다 — 그 원문(KYOBO119 r1)이 그대로 reproject 단언의 입력이 된다"
  - "35-04: 원천 SETOF dma_strategy_events_for_user 는 건드리지 않았다(RESEARCH Q3 ③ 선택 항목) — 차단은 래퍼 · 주문 타임라인 2곳. pgTAP 가 「원천은 실계좌 kind 17 을 돌려준다」 전제를 단언해 거르는 곳이 래퍼임을 고정"

patterns-established:
  - "kind 한정 서브블록: IF v_row.kind IN (…) THEN BEGIN PERFORM …; EXCEPTION WHEN OTHERS THEN v_errors := …; END; CONTINUE; END IF;"

requirements-completed: []

coverage:
  - id: D1
    description: "dma_strategy_apply 재정의 — kind 1·17·18 섞인 배치 → applied 3 · rows 1(kind 1) · 원문 3 · launch_pieces/heads 각 1 · 커서 3, 마이그레이션 스텁은 no-op"
    requirement: "LAUNCH-03"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate_apply.test.sql (ok 1-9)"
        status: pass
    human_judgment: false
  - id: D2
    description: "포이즌 격리 · 재생 멱등 · 도착 순서 무관"
    requirement: "LAUNCH-03"
    verification:
      - kind: integration
        ref: "supabase/tests/launch_gate_apply.test.sql (ok 10-20)"
        status: pass
    human_judgment: false
  - id: D3
    description: "launch_reproject — 스텁 때 쌓인 원문 재투영 · seq 큰 쪽 승 · 2회 멱등 · 날짜 범위"
    requirement: "LAUNCH-03"
    verification:
      - kind: integration
        ref: "supabase/tests/launch_gate_apply.test.sql (ok 21-27)"
        status: pass
    human_judgment: false
  - id: D4
    description: "가시성 2곳(json 래퍼 · 주문 타임라인) kind 17·18 제외 · purge 가 17·18 을 지우지 않음 · 권한 (f, f, t)"
    requirement: "LAUNCH-04"
    verification:
      - kind: integration
        ref: "supabase/tests/launch_gate_apply.test.sql (ok 28-38) · RED 확인: 제외 줄을 뺀 사본으로 ok 29 · 30 이 not ok"
        status: pass
    human_judgment: false
  - id: D5
    description: "기존 apply 계약(공개 45키 · 반환 모양) · 기존 회귀 파일"
    requirement: "LAUNCH-03"
    verification:
      - kind: integration
        ref: "dma_strategy_apply 30/30 · launch_gate 59/59 · dma_strategy_accum_signal 31/31 · dma_strategy_read 28/28 · dma_strategy_limit_feature 24/24"
        status: pass
      - kind: integration
        ref: "dma_gateway_identities 26/42 — 16 not ok 은 35-04 전(--until 20261027200000)과 목록이 같은 기존 실패(deferred-items.md)"
        status: pass
    human_judgment: false

duration: 약 10분
completed: 2026-10-27
status: complete
---

# Phase 35 Plan 04: kind 17·18 DB 쪽 해석 배선(apply 재정의 · reproject · 가시성 차단) Summary

**`dma_strategy_apply` 를 재정의했다. 같은 시그니처 · 반환 모양을 유지하면서, 새로 들어간 행이 kind 17·18 일 때만 예외 서브블록에서 `launch_project_event`(지금은 스텁)를 부르고, 그 행을 rows 에서 빼며, 실패는 `errors[{seq, error}]` 로 돌려준다. 여기에 `launch_reproject` 와 사용자 경로 2곳의 17·18 제외를 더했고, pgTAP 38/38 로 잠갔다.**

## Performance

- **Duration:** 약 10분
- **Completed:** 2026-10-27
- **Tasks:** 2/2
- **Files:** 3개 생성(마이그레이션 · pgTAP · deferred-items)

## Accomplishments

- **apply 재정의(Task 1 트레이서).** 20260929180100 본문에서 세 곳만 바꿨다: ① `v_errors` 선언 ② kind 17·18 서브블록 + `CONTINUE` ③ `'errors', v_errors`. 43칸 INSERT 는 원문과 diff 가 비어 있다. relay 는 바꾸지 않았다. rows 에 17·18 이 없으므로 ws fan-out 으로 나갈 행도 없다.
- **스텁.** `launch_project_event(public.dma_strategy_events)` 는 `RETURN;` 만 한다. 그래서 gh-trade 서버가 먼저 배포돼도 원문만 쌓이고 errors 는 비어 있다(pgTAP ok 1 · 2).
- **재투영.** `launch_reproject(p_from, p_to)` 는 kind 17·18 원문을 `ORDER BY gateway, applied_at, seq` 순으로 행마다 서브블록에서 다시 투영하고 `{projected, errors}` 를 돌려준다. 35-10 이 매핑을 교체한 직후 1회 돌린다.
- **가시성.** json 래퍼에 `AND (t.ev->>'kind')::int NOT IN (17, 18)` 을, 주문 타임라인 전략 갈래에 `AND e.kind NOT IN (17, 18)` 을 넣었다. purge 함수와 원문 표는 손대지 않았다.

## pgTAP

`bash scripts/verify-dma-orders-price-check.sh --test <file>` (로컬 일회용 컨테이너 · 84개 마이그레이션 재생 · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104`):

| 파일 | 결과 |
|------|------|
| launch_gate_apply.test.sql (신규) | ok 38 · not ok 0 · PASS |
| launch_gate.test.sql | ok 59 · not ok 0 · PASS |
| dma_strategy_apply.test.sql | ok 30 · not ok 0 · PASS |
| dma_strategy_accum_signal.test.sql | ok 31 · not ok 0 · PASS |
| dma_strategy_read.test.sql | ok 28 · not ok 0 · PASS |
| dma_strategy_limit_feature.test.sql | ok 24 · not ok 0 · PASS |
| dma_gateway_identities.test.sql | ok 26 · **not ok 16 — 기존 실패**(아래 Issues) |

정적 검사: purge 함수 정의 없음 · `ALTER TABLE public.dma_strategy_events` 없음 · `NOT IN (17, 18)` 2회 · `ORDER BY gateway, applied_at, seq` 있음 → 통과.

새 테스트의 단언 구성: 스텁 2 · 트레이서 7 · 포이즌 6 · 재생 3 · 도착 순서 2 · reproject 7 · 가시성 3 · purge 3 · 권한 5.

## Task Commits

1. **Task 1 (tracer): 스텁 + apply 재정의 + 트레이서 pgTAP**: `e1b5c39b`
2. **Task 2: launch_reproject · 래퍼/주문 타임라인 17·18 제외 · 포이즌~권한 pgTAP**: `9cbf11d9`

트레이서 게이트: Task 1 커밋 뒤 tracer `<verify>`(launch_gate_apply 7/7 · dma_strategy_apply 30/30)를 다시 돌려 통과를 확인한 다음 Task 2 로 넘어갔다.

`commits: 4` 는 `git rev-list --count 8fedc109..9cbf11d9` 로 잰 값이다. 그 범위에 동시 세션의 Phase 36 커밋 2개(`1b61728a` · `963afd06`)가 끼어 있고, 이 플랜의 커밋은 위 2개다.

## Files Created/Modified

- `supabase/migrations/20261027200100_launch_gate_apply.sql`: 스텁 · apply 재정의 · reproject · json 래퍼 · 주문 타임라인(함수 5개 · 권한 각 3줄)
- `supabase/tests/launch_gate_apply.test.sql`: pgTAP 38 단언
- `.planning/phases/35-launch-gate/deferred-items.md`: 범위 밖 발견 1건

## Decisions Made

- 재생 단언: 트랜잭션 안에서는 `now()` 가 고정이라 updated_at 이 늘 같다. 그래서 표시값(2000-01-01)을 박아 두고 재생 뒤에도 그대로인지 보며, 투영 호출 계수(`t_calls` = 2)를 함께 확인한다.
- 스텁 단언은 테스트 매핑으로 바꾸기 전에 마이그레이션 원본 스텁으로 적재해 확인한다. 그 원문(KYOBO119 r1 seq 20 · 21)을 reproject 단언이 그대로 쓴다.
- 원천 SETOF `dma_strategy_events_for_user` 는 그대로 두었다(RESEARCH Q3 ③ 선택). 거르는 곳은 래퍼와 타임라인이고, pgTAP ok 28 이 「원천에는 kind 17 이 나온다」 를 전제로 고정한다.

## Deviations from Plan

### Auto-fixed Issues

없음. 계획 범위 안에서 다음 두 가지를 보강했다.
- 재생 단언에 투영 호출 계수를 더했다(위 결정 1).
- RED 확인: 제외 줄 2개를 뺀 마이그레이션 사본(`--until 20261027200000 --with <사본>`)으로 돌리면 ok 29 · 30 만 not ok 가 된다. 가시성 단언이 실제로 판별한다는 뜻이다.

**Total deviations:** 0건. **Impact:** 없음.

## Issues Encountered

- **dma_gateway_identities.test.sql 16 not ok 은 기존 실패다.** 35-04 마이그레이션 전(`--until 20261027200000`)과 후의 not ok 목록을 diff 해 보면 똑같다. 이 테스트는 Phase 29 v2 레지스트리 이전의 가시성 모델(dma_credentials gateway 기본값 KB 등)을 전제하고 있다. 플랜 must_have 「회귀 6파일 not ok 0」 중 이 파일만 이 이유로 충족하지 못한다. 범위 밖이라 고치지 않았고 `deferred-items.md` 에 기록했다.

## Known Stubs

- `supabase/migrations/20261027200100_launch_gate_apply.sql` `launch_project_event`: 의도된 Wave A 스텁(D-06 · D-21 ③)이다. 칸 매핑은 gh-trade 노트가 확정된 뒤 35-10 이 같은 시그니처로 교체하고 `launch_reproject()` 를 1회 돌린다. 이 플랜의 목표(배선 · 격리 · 가시성)는 스텁 상태로도 달성된다.

## Threat Flags

없음. 새 함수와 재정의 함수는 모두 service_role 전용(REVOKE PUBLIC · anon · authenticated)이고, 사용자 경로에서는 노출이 줄기만 했다.

## User Setup Required

없음. 원격 적용(`supabase db push`)은 35-09 메인 세션 몫이다.

## Next Phase Readiness

- 35-09: 원격에 적용하는 순서는 20261027200000 → 20261027200100 이다. relay 재배포는 필요 없다(같은 RPC 계약).
- 35-10: `CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)` 로 정식 매핑을 넣는다. kind 17 은 `launch_upsert_piece(…, 'journal')`, 18 은 `launch_upsert_head(…, 'journal')` 로 보내고 journal_epoch · seq · gw_time_ms 는 p_ev 에서 가져간다. 그다음 `SELECT public.launch_reproject();` 를 돌린다. 테스트 매핑 틀은 `launch_gate_apply.test.sql` 에 있다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261027200100_launch_gate_apply.sql
- FOUND: supabase/tests/launch_gate_apply.test.sql
- FOUND: .planning/phases/35-launch-gate/deferred-items.md
- FOUND: e1b5c39b
- FOUND: 9cbf11d9
