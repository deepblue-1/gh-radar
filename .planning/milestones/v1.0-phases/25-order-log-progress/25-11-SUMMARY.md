---
phase: 25-order-log-progress
plan: 11
subsystem: database · supabase · 배포 게이트
tags: [supabase, migration, remote-apply, revoke, postgrest, anon, pgtap, deploy-order]
status: complete

requires:
  - phase: 25-01
    provides: "dma_strategy_events 테이블 · dma_journal_cursor 전략 커서 칸 2 · dma_strategy_apply (마이그레이션 20260929180000 · 20260929180100)"
  - phase: 25-03
    provides: "조회 RPC 2 — dma_strategy_events_for_user · dma_order_events_for_user (마이그레이션 20260929180200)"
provides:
  - "원격 Supabase 에 Phase 25 마이그레이션 3개 적용 확인(외부 세션 quick-260929-sas 가 사용자 승인으로 적용 · 이 실행은 확인만)"
  - "원격 migration list 전체 48행 Local=Remote(불일치 0)"
  - "원격 anon 권한 거부 3건 — 세 RPC 모두 HTTP 401(REVOKE 가 원격에서 살아 있음)"
  - "25-12(relay 배포) 선행 조건 성립"
affects: [25-12]

actuals:
  tokens: 2600
  tasks: 3
  commits: 1   # 측정값(git rev-list --count 3fe85ce2..HEAD, SUMMARY 작성 시점). 이 1건은 다른 세션 커밋 48d014c9(quick-260929-sas)이고 25-11 코드 커밋은 0 — 문서 전용 플랜
plan_head_before: 3fe85ce23fb0604efe4846ba7b2d8bba9c2ec235

tech-stack:
  added: []
  patterns:
    - "원격 권한 확인 탐침은 권한이 새더라도 원격 쓰기가 0 이 되는 인자로 — 쓰기 RPC 는 첫 줄 RAISE 에 걸리는 빈 인자로 부른다"
    - "비밀이 든 env 읽기가 훅에 막히면 우회하지 않고 값 비출력 스크립트를 사용자 `!` 실행으로 넘긴다"

key-files:
  created:
    - .planning/phases/25-order-log-progress/25-11-SUMMARY.md
  modified: []

key-decisions:
  - "Task 1 결정(apply)과 Task 2 원격 적용은 이 세션이 아니라 gh-radar-46 세션(quick-260929-sas)에서 사용자 승인으로 처리됐다 — 이 실행은 적용을 다시 하지 않고 읽기 전용 확인(migration list · anon 탐침)만 했다"
  - "dma_strategy_apply 탐침 인자를 플랜 예시 대신 {p_gateway:'', p_epoch:'', p_events:{}} 로 바꿨다 — 권한이 새더라도 함수 첫 줄 RAISE 로 원격 쓰기 0 (편차 Rule 2)"
  - "quick-260929-sas 의 C6(20260929190000 새 객체 3종 anon 거부) PASS 는 범위가 달라 25-11 증거로 쓰지 않았다 — 25-11 증거는 Phase 25 세 RPC 탐침 3건뿐"

patterns-established:
  - "원격 적용 게이트 기록은 적용 주체(어느 세션 · 누가 승인)와 확인 주체를 분리해 적는다"

requirements-completed: []

coverage:
  - id: D1
    description: "Phase 25 마이그레이션 3개(20260929180000 · 180100 · 180200)가 원격에 적용돼 migration list Local · Remote 양쪽에 있다"
    verification:
      - kind: manual_procedural
        ref: "supabase migration list (읽기 전용 · 48행 Local=Remote · 불일치 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "원격 anon 으로 세 RPC 호출 시 권한 거부(401) — 함수 없음이 아니다"
    verification:
      - kind: manual_procedural
        ref: "p25-anon-check.sh (세션 scratchpad · 사용자 `!` 실행 · 값 비출력) — 세 RPC 모두 HTTP 401"
        status: pass
    human_judgment: false
  - id: D3
    description: "로컬 pgTAP 이 원격과 같은 마이그레이션 48개 재생 위에서 권한 잠금을 증명"
    verification:
      - kind: integration
        ref: "supabase/tests/dma_strategy_read.test.sql 24/24 · supabase/tests/dma_strategy_apply.test.sql 30/30 (supabase/postgres:17.6.1.104)"
        status: pass
    human_judgment: false

duration: 확인 단계만(원격 적용은 외부 세션)
completed: 2026-09-29
---

# Phase 25 Plan 11: 원격 스키마 적용 게이트 Summary

**Phase 25 스키마(dma_strategy_events · 전략 커서 칸 2 · RPC 3)가 원격 Supabase 에 적용됐음을 migration list 48행 Local=Remote 와 세 RPC anon 호출 HTTP 401 로 확인 — 적용 자체는 외부 세션(quick-260929-sas)이 사용자 승인으로 했고 이 실행은 확인만 했다. 25-12(relay 배포) 선행 조건 성립.**

## Performance

- **Tasks:** 3 (Task 1 · 2 는 외부 세션에서 처리 · Task 3 확인과 기록)
- **Files modified:** 1 (이 SUMMARY)
- **Completed:** 2026-09-29

## 외부 적용 사실 (이 실행은 확인만)

- **적용 주체:** gh-radar-46 세션(quick-260929-sas). 2026-09-29 21:37:53 KST 보고 — 사용자가 그 세션에서 승인하고 `supabase db push` 로 4개 적용.
  - `20260929180000` dma_strategy_events (25-01)
  - `20260929180100` dma_strategy_apply (25-01)
  - `20260929180200` dma_strategy_read_rpcs (25-03)
  - `20260929190000` dma_gateway_identities (quick-260929-sas — 두 조회 RPC 를 (gateway, dma_user_id) 가시성으로 재정의 · 시그니처 · 반환 · 권한 불변)
- 그 세션의 적용 후 대조 ALL PASS · KB smoke 12/0.
- **이 세션에서 사용자가 「apply」 를 고른 것은 아니다.** Task 1 결정 체크포인트는 외부 세션의 사용자 승인으로 갈음됐다.
- executor 는 `supabase db push` · `db reset` · 원격 SQL 을 실행하지 않았다(T-25-43).

## migration list 요약 (읽기 전용 재실행)

| 항목 | 결과 |
|---|---|
| 전체 행 | 48 |
| Local=Remote | 48 (불일치 0) |
| Phase 25 관련 4행(180000 · 180100 · 180200 · 190000) | 모두 Local · Remote 양쪽에 존재 |

적용 전 목록은 외부 세션에서 찍혔다(이 실행에는 적용 전 스냅샷 없음).

## 마이그레이션 · 테스트 마지막 커밋

| 파일 | 마지막 커밋 | 비고 |
|---|---|---|
| `supabase/migrations/20260929180000_dma_strategy_events.sql` | `ae732e9b` | 25-01 · 이후 수정 0 |
| `supabase/migrations/20260929180100_dma_strategy_apply.sql` | `ae732e9b` | 25-01 · 이후 수정 0 |
| `supabase/migrations/20260929180200_dma_strategy_read_rpcs.sql` | `c6bf5828` | 25-03 · 이후 수정 0 |
| `supabase/migrations/20260929190000_dma_gateway_identities.sql` | `5cfacb83` | quick-260929-sas · 조회 RPC 2 재정의 |
| `supabase/tests/dma_strategy_read.test.sql` | `76764b87` | quick-260929-sas · Phase 25 픽스처 연결 1줄 |

Phase 25 마이그레이션 3개는 25-03 이후 수정 0.

## 로컬 pgTAP (마이그레이션 48개 재생 · 이미지 supabase/postgres:17.6.1.104)

| 파일 | 결과 | 권한 단언 |
|---|---|---|
| `dma_strategy_read.test.sql` | 24/24 | ok 23 · 24 — 두 조회 RPC EXECUTE (anon, authenticated, service_role) = (f, f, t) |
| `dma_strategy_apply.test.sql` | 30/30 | ok 27 — dma_strategy_apply EXECUTE = (f, f, t) · ok 28 — dma_strategy_events SELECT = (f, f, t) |

## 원격 anon 권한 거부 (사용자 `!` 실행)

스크립트: 세션 scratchpad `p25-anon-check.sh` — `webapp/.env.local` 의 공개 URL · anon 키를 셸 변수에만 담고 값은 출력하지 않는다(길이만 출력 — URL 40 · 키 208).

| RPC | HTTP 코드 | 판정 |
|---|---|---|
| `dma_strategy_events_for_user` | 401 | 권한 거부 — 함수 있음 · REVOKE 유효 |
| `dma_order_events_for_user` | 401 | 권한 거부 — 함수 있음 · REVOKE 유효 |
| `dma_strategy_apply` | 401 | 권한 거부 — 함수 있음 · REVOKE 유효 |

세 건 모두 401 이다. 함수 없음(404) 은 한 건도 없었다. SUMMARY · 실행 기록 어디에도 anon 키 · 서비스롤 키 원문은 없다(T-25-46).

참고: quick-260929-sas 의 C6(20260929190000 새 객체 3종 anon 거부) 도 PASS 였지만 대상이 달라 이 플랜 증거로 쓰지 않는다.

## Task Commits

1. **Task 1: 원격 스키마 문 확인(one-way)** — 커밋 없음(외부 세션 사용자 승인)
2. **Task 2: 원격 적용** — 커밋 없음(외부 세션 `supabase db push` · 이 실행은 읽기 전용 migration list)
3. **Task 3: 원격 적용 확인 기록** — 이 SUMMARY 커밋(`docs(25-11)`)

## Files Created/Modified

- `.planning/phases/25-order-log-progress/25-11-SUMMARY.md` — 원격 적용 확인 기록

## Decisions Made

- 적용 주체와 확인 주체를 분리해 기록했다 — 적용은 외부 세션(사용자 승인), 확인은 이 실행.
- 외부 세션 C6 결과는 증거에서 뺐다(범위 다름).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 안전] dma_strategy_apply 탐침 인자 변경**
- **Found during:** Task 3
- **Issue:** 플랜 예시대로 부르면 권한이 샐 경우 원격에 쓰기가 생길 수 있다
- **Fix:** 인자를 `{"p_gateway":"","p_epoch":"","p_events":{}}` 로 — 권한이 새더라도 함수 첫 줄 RAISE 로 원격 쓰기 0
- **Verification:** HTTP 401(권한 단계에서 거부 · 함수 본문 도달 전)

**2. [Rule 3 - 차단] `.env.local` 읽기가 Secret read guard 훅에 막힘**
- **Found during:** Task 3
- **Issue:** 이전 executor 가 공개 URL · anon 키를 읽으려다 훅에 차단
- **Fix:** 우회하지 않고 값 비출력 스크립트를 만들어 사용자 `!` 실행으로 넘김
- **Verification:** 사용자가 붙인 출력(길이 · HTTP 코드만)

### 흐름 편차

- Task 1 · 2 가 이 세션의 체크포인트가 아니라 외부 세션(quick-260929-sas)에서 처리됐다. 이 실행은 재적용하지 않고 확인만 했다.

---

**Total deviations:** 2 auto-fixed (Rule 2 1 · Rule 3 1) + 흐름 편차 1
**Impact on plan:** 안전 강화와 훅 존중. 범위 확장 없음.

## Issues Encountered

- 없음(훅 차단은 편차 2 로 처리).

## User Setup Required

None — 추가 외부 설정 없음.

## 다음 배포 칸

배포 순서: 마이그레이션(완료) → **gh-trade 서버 전송(아직 예고 전)** → relay(25-12) → server → webapp push.

- relay 배포(25-12)에는 quick-260929-sas 의 relay 커밋 `9cfc746f` · `5cfacb83` 도 함께 실린다.
- push 자체가 webapp 프로덕션 배포이므로 relay 가 먼저다.

## 후속 (Phase 25 플랜 범위 밖)

- **D-09 두 줄 형식** — gh-trade `537266ea` · `bddf2e76`, 정본 `docs/features/order-log-progress.md` ⑦. Phase 25 플랜 범위 밖 후속으로 남긴다.

## Next Phase Readiness

- 25-12(relay 배포) 선행 조건 성립 — 원격에 `dma_strategy_apply` 가 있어 relay 전략 기록기가 적재할 수 있다(Pitfall 4 회피).
- 남은 선행: gh-trade 서버 전송(예고 전).

---
*Phase: 25-order-log-progress*
*Completed: 2026-09-29*

## Self-Check: PASSED

- FOUND: .planning/phases/25-order-log-progress/25-11-SUMMARY.md
- FOUND 커밋: ae732e9b · c6bf5828 · 5cfacb83 · 76764b87 · 9cfc746f · 48d014c9 · 3fe85ce2
- 플랜 자동 검증(파일 존재 · 401/403 기록 · 404 표기 없음) 통과 · 키 원문 패턴 0건
