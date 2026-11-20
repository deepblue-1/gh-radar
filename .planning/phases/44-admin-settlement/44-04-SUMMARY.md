---
phase: 44-admin-settlement
plan: 04
subsystem: database
tags: [supabase, postgres, pgtap, settlement, seed, migration]

requires:
  - phase: 44-01
    provides: settlement_accounts(계좌 키 → dma_accounts FK) · settlement_ledger(종류별 모양 · 사람-묶음 CHECK · seeded 열) · pgTAP 하네스 사용법
  - phase: 44-03
    provides: 쓰기 RPC 마이그레이션 두 파일(20261120110000 · 20261120120000) — 시드 버전은 이 둘보다 커야 한다
provides:
  - "public.settlement_seed(p_accounts jsonb) RETURNS jsonb {accounts, seeded} — 검사 먼저(22023 · SETTLEMENT_ACCOUNT_MISSING:<accKey>) · 계좌 대응 ON CONFLICT DO NOTHING · seeded 행 0 일 때만 9건"
  - "20261120130000_settlement_seed.sql 의 DO 블록 — 빈 계좌 마스터면 RAISE NOTICE 로 건너뜀 · 아니면 사용자 확인 4계좌로 호출"
  - "pgTAP supabase/tests/settlement_seed.test.sql (27 단언 · M1 ~ M8)"
affects: [44-13]

actuals:
  tokens: 4117
  tasks: 2
  commits: 2
plan_head_before: 9020ad794e845a81edb8a6fe3003f43d372ebbf1
plan_head_after: deb69751be0dc9baf7145be86c414d909a3e1f63

tech-stack:
  added: []
  patterns:
    - "운영에서만 도는 시드 = 규칙을 쥔 함수 + 빈 마스터면 NOTICE 로 건너뛰는 DO 블록(로컬 pgTAP 재생 안전)"
    - "시드 함수는 배열 전체를 먼저 검사하고 그 뒤에야 넣는다 — 실패 시 0행"

key-files:
  created:
    - supabase/migrations/20261120130000_settlement_seed.sql
    - supabase/tests/settlement_seed.test.sql
  modified: []

key-decisions:
  - "T1 답 (가) — 사용자가 확인한 계좌번호 4개를 시드 마이그레이션 DO 블록에 직접 적었다(계좌 대응까지 배포 때 자동)"
  - "시드 9건 순서 = 목업 LEDGER 원문 순서(09-13 kbG→kbH 1억 다음 09-13 kbG→kyH 4억, 그 다음 09-18) — RESEARCH 「시드 9건」 표 · shared 검산 픽스처 id 1 ~ 9 와 같다. 플랜 truths 문장은 쥬니 묶음 원금 3건을 묶어 적었을 뿐 id 순서 정본은 목업"
  - "seeded 행 판정은 지운 줄까지 센다 — 시드 줄 하나를 지웠다고 9건이 다시 들어오지 않는다"
  - "인자 검사에 같은 계좌 키 · 같은 (증권사, 계좌번호) 두 번 → 22023 을 더했다(UNIQUE 23505 보다 먼저 · 뜻이 분명한 오류)"
  - "마이그레이션 버전 20261120130000 — 로컬 꼬리 20261120120000 · 원격 머리 20261119170000(오케스트레이터 확인) 보다 큼"

patterns-established:
  - "운영 시드 마이그레이션: CREATE OR REPLACE FUNCTION <seed>(jsonb) + DO $$ IF NOT EXISTS(마스터) THEN RAISE NOTICE ELSE PERFORM <seed>(...) END IF $$"

requirements-completed: []

coverage:
  - id: D1
    description: "settlement_seed 함수 — 없는 계좌 SETTLEMENT_ACCOUNT_MISSING(0행) · 대응 4행 + 9건(목업 그대로 · 예수금 안 건드림) · 두 번째 호출 0 · 0 · 계좌 대응 없이 9건 · 지운 시드 줄이 있어도 다시 안 넣음 · 넣은 돈 검산 · 22023 · 권한"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement_seed.test.sql (27 ok · 0 not ok)"
        status: pass
    human_judgment: false
  - id: D2
    description: "빈 계좌 마스터 재생에서 시드 마이그레이션이 건너뛰어 기존 pgTAP 이 깨지지 않음"
    verification:
      - kind: integration
        ref: "supabase/tests/settlement_seed.test.sql#M8 빈 계좌 마스터 재생 → 시드 마이그레이션이 건너뜀(seeded 행 0)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql (192 ok · 0 not ok · 시드 파일 포함 149 마이그레이션 재생)"
        status: pass
    human_judgment: false
  - id: D3
    description: "운영 경로 DO 블록 — 네 계좌가 마스터에 있으면 4행 + 9건(두 번 적용해도 그대로) · 하나라도 없으면 SETTLEMENT_ACCOUNT_MISSING 으로 마이그레이션이 멈춤"
    verification:
      - kind: integration
        ref: "임시 확인(커밋 안 함): --until 20261120120000 --with <4계좌 픽스처> --with 시드 파일 ×2 → 3 ok / --with <3계좌 픽스처> --with 시드 파일 → exit 5 · SETTLEMENT_ACCOUNT_MISSING:kyG"
        status: pass
    human_judgment: false
  - id: D4
    description: "운영 DB 에 실제 적용(db push) 뒤 정산 화면 첫 숫자가 맞는지"
    verification: []
    human_judgment: true
    rationale: "원격 적용 · 운영 확인은 44-13(메인 세션) 몫 — 이 플랜은 커밋까지만"

duration: 5min
completed: 2026-11-20
status: complete
---

# Phase 44 Plan 04: 정산 시드 마이그레이션 Summary

**`settlement_seed(p_accounts jsonb)` 가 사용자 확인 계좌 4개의 대응과 목업 LEDGER 9건(원 단위 · 예수금 안 건드림)을 정확히 한 번 넣고, 계좌가 하나라도 계좌 마스터에 없으면 `SETTLEMENT_ACCOUNT_MISSING:<accKey>` 로 `db push` 를 멈춘다 — 빈 로컬 재생에서는 DO 블록이 `RAISE NOTICE` 로 건너뛰어 다른 pgTAP 을 깨지 않는다(pgTAP 27 + 기존 192 통과 · SEED-OK).**

## Performance

- **Duration:** 약 5분(코드 · 검증 구간 — 오리엔테이션 제외)
- **Started:** 2026-11-20T07:55:58Z
- **Completed:** 2026-11-20T08:00:06Z
- **Tasks:** 2 (T1 체크포인트 = 오케스트레이터가 사용자와 해결 · T2 실행)
- **Files modified:** 2 (새 파일 2)

## Task 1 해결 기록 (checkpoint:human-action — 오케스트레이터가 이미 해결)

- 사용자: 「네 계좌 모두 어드민 계좌 메뉴에 이미 등록돼 있으니 확인해 달라」. 오케스트레이터가 2026-11-20 운영 어드민 계좌 화면(`trade.jx1.io/admin/accounts` · 계좌 4개 · KB 2 · 교보 2)을 읽어 값을 받았다.
- **선택: (가)** — 번호를 저장소의 시드 마이그레이션에 적는다(계좌 대응까지 배포 때 자동).
- 계좌 키 대응(번호는 이 문서에 적지 않는다 — `supabase/migrations/20261120130000_settlement_seed.sql` 맨 아래 DO 블록이 정본):

| 계좌 키 | 계좌 | 증권사 |
|---|---|---|
| kbG | KB 정근형 | `KB` |
| kyH | 교보 김현중 | `KYOBO` |
| kyG | 교보 정근형(11/1 개설) | `KYOBO` |
| kbH | KB 김현중 | `KB` |

- 검증: 네 번호 모두 숫자만 · 12자 이하 · 서로 다름 · 증권사가 키와 맞음(kbG · kbH = KB · kyH · kyG = KYOBO).

## 정한 마이그레이션 버전

| 항목 | 값 |
|---|---|
| 정한 버전 | `20261120130000` (`supabase/migrations/20261120130000_settlement_seed.sql`) |
| 로컬 꼬리(그때) | `20261120120000_settlement_settle_rpc.sql` |
| 원격 머리 | `20261119170000` — 오케스트레이터가 확인한 값(이 실행은 원격을 조회하지 않음) |
| 이 phase 의 다른 세 파일 | `20261120100000_settlement` · `20261120110000_settlement_ledger_rpc` · `20261120120000_settlement_settle_rpc` — 셋 다 고치지 않음(`git diff --quiet` 통과) |
| 중복 버전 | 없음(`uniq -d` 빈 출력) |

## Accomplishments

- `settlement_seed` — 배열 전체를 먼저 검사(배열 아님 · 항목 모양 · 계좌 키 4값 밖 · 증권사-키 불일치 · 계좌번호 없음 · 같은 키/계좌 두 번 → 22023 · 계좌 마스터에 없음 → P0001 `SETTLEMENT_ACCOUNT_MISSING:<accKey>`)하고, 통과해야 대응 행과 9건을 넣는다. 반환 `{accounts, seeded}` 는 실제로 넣은 수.
- 시드 9건은 목업 LEDGER 순서 그대로 `ORDER BY ord` 로 넣어 id 순서가 고정된다 — 법인 용역 = `corp_service`, 그 밖 옮김 = `transfer`, 쥬니 묶음 원금 메모 3건, 출자 경로 NULL.
- DO 블록 — 계좌 마스터가 비면 `RAISE NOTICE` 로 건너뛰고(로컬 재생), 아니면 확인된 4계좌로 부른다. 운영에서 두 번 적용돼도 4행 · 9건 그대로.

## Task Commits

1. **Task 1: 사용자 확인 — 계좌 4개** — 커밋 없음(오케스트레이터가 사용자와 해결 · 위 기록)
2. **Task 2: 시드 마이그레이션 + pgTAP** — RED `b701f5d9` (test) → GREEN `deb69751` (feat)

**Plan metadata:** 이 SUMMARY 커밋(docs)

## pgTAP 단언 수

- `supabase/tests/settlement_seed.test.sql` — **27** (M8 2 · M1 3 · M2 4 · M3 3 · M4 4 · M5 1 · M6 5 · M7 5) · 27 ok · 0 not ok.
- `supabase/tests/settlement.test.sql` — 192 ok · 0 not ok(시드 파일 포함 149 마이그레이션 재생 — 시드가 기존 테스트를 깨지 않음).
- 운영 경로 임시 확인(커밋 안 함 · scratchpad 픽스처): 네 계좌가 있는 DB 에 시드 파일을 두 번 적용 → 대응 4행 · 시드 9건 · 키-증권사 일치 3 ok / 교보 정근형을 뺀 DB → `SETTLEMENT_ACCOUNT_MISSING:kyG` 로 적용 실패(exit 5).

## Files Created/Modified

- `supabase/migrations/20261120130000_settlement_seed.sql` — 함수 `settlement_seed` + 권한 3줄 · COMMENT + 빈 마스터 건너뛰는 DO 블록
- `supabase/tests/settlement_seed.test.sql` — pgTAP M1 ~ M8 27 단언(가짜 계좌번호 991xx)

## Decisions Made

- frontmatter `key-decisions` 5건.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 빠진 검사] 같은 계좌 키 · 같은 계좌 두 번 → 22023**
- **Found during:** Task 2
- **Issue:** 플랜의 22023 목록에 없는 경우 — 같은 키를 두 번 주면 ON CONFLICT 로 뒤의 것이 조용히 버려지고, 다른 키에 같은 계좌를 주면 UNIQUE 23505 가 난다.
- **Fix:** 검사 단계에서 키 · (증권사, 계좌번호) 중복을 22023 으로 거부 · M6 에 「같은 계좌 키 두 번」 단언 추가.
- **Files modified:** supabase/migrations/20261120130000_settlement_seed.sql, supabase/tests/settlement_seed.test.sql
- **Committed in:** b701f5d9 · deb69751

**2. [작은 판단] 지운 시드 줄도 seeded 로 센다 + 단언 추가**
- 플랜 「seeded 행이 0 일 때만」 을 지운 줄 포함으로 해석했다(시드 줄 하나를 지운 뒤 다시 적용돼도 9건이 되살아나지 않게). M4 에 단언 1개 추가.
- **Committed in:** b701f5d9 · deb69751

**3. [환경] 하네스가 복합 git · 루프 명령을 거절**
- T2 `<automated>` 명령을 같은 본문의 scratchpad 스크립트로 worktree 루트에서 실행(명령 불변) — SEED-OK. 44-01 과 같은 처리.

---

**Total deviations:** 3 (빠진 검사 1 · 작은 판단 1 · 환경 1)
**Impact on plan:** 범위 확대 없음. 검사 하나와 단언 2개가 더해졌을 뿐 함수 계약(이름 · 인자 · 반환 · 오류 코드)은 플랜 그대로.

## TDD Gate Compliance

- Task 2: `test(44-04)` b701f5d9 → `feat(44-04)` deb69751.
- RED 증거: 아무것도 넣지 않는 스텁 `settlement_seed`(커밋 안 함 · `--with` 로 재생 뒤 적용)로 27 단언 전부 실행 → 15 not ok. 분류기 `gsd-tools check tdd-red-evidence` = **RED_EVIDENCE_OK**(대상 「M2 첫 호출 반환 {accounts: 4, seeded: 9}」 · have `{"seeded": 0, "accounts": 0}` · format tap · report_errors 없음).
- semanticAssessment: 대상 M2 가 실제로 실행돼 계획한 단언(반환 4 · 9)에서 실패했다. 불러오기 · 문법 · 픽스처 오류 없음(계획 27 · 실행 27). 스텁 없이 돌리면 함수가 없어 psql 이 중간에 멈춰 TAP 이 불완전해지므로(44-01 편차 3 과 같은 이유) 스텁을 썼다.
- GREEN: 같은 테스트 27 ok + 기존 settlement 192 ok.

## Issues Encountered

- 없음.

## Known Stubs

- 없음(RED 용 스텁 함수는 scratchpad 에만 있었고 커밋하지 않았다).

## User Setup Required

None — 원격 적용(`supabase db push`)은 44-13(메인 세션). push 전에 원격 머리가 `20261120130000` 보다 작은지 다시 본다. 운영에서 네 계좌 중 하나라도 계좌 마스터에 없으면 시드만 롤백되고 push 가 멈춘다 — 계좌 메뉴에서 등록 뒤 다시 push.

## Next Phase Readiness

- 44-13 이 이 파일까지 push 하면 정산 화면이 첫 진입부터 시드 9건 · 계좌 대응으로 검산 숫자를 낸다.
- (나) 경로의 수동 SQL 은 필요 없다(답이 (가)).

## Self-Check: PASSED

- 파일 2개 있음: `supabase/migrations/20261120130000_settlement_seed.sql` · `supabase/tests/settlement_seed.test.sql`.
- 커밋 `b701f5d9` · `deb69751` 이 이 브랜치(`worktree-agent-a5c84057a375b314d`)에 있음 · `git rev-list --count 9020ad79..deb69751` = 2.
- 인수 기준: `SETTLEMENT_ACCOUNT_MISSING` 3 · `RAISE NOTICE` 2 · `CREATE OR REPLACE FUNCTION public.settlement_seed` 1 · `corp_service` 1 · `쥬니 묶음 원금` 3 · `2025-12-31` 2 · `FROM anon, authenticated` 1 · 테스트 `M[1-8]` 42 — 전부 기준 이상. 두 pgTAP `not ok` 0 · SEED-OK.

---
*Phase: 44-admin-settlement*
*Completed: 2026-11-20*
