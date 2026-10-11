---
phase: 11-co-movement-candidates-top-k
plan: 04
subsystem: infra
tags: [cloud-run-job, cloud-scheduler, gcp-iam, secret-manager, supabase-rpc, comovement, cosurge, oauth-invoker]

requires:
  - phase: 11-co-movement-candidates-top-k (Plan 01)
    provides: co-movement-sync 워커 스캐폴드 (config/logger/supabase/Dockerfile) + rebuild_comovement() RPC 마이그레이션
  - phase: 11-co-movement-candidates-top-k (Plan 02)
    provides: task-timeout 180s 확정 + service_role statement_timeout 600s + production 적재 baseline (theme 5538 / cosurge 9704)
  - phase: 05.1-ingestion-infra
    provides: gh-radar-scheduler-sa + gh-radar-supabase-service-role secret (재사용)
provides:
  - co-movement-sync Cloud Run Job (gh-radar-comovement-sync, task-timeout 180s, 단일 cycle) — rebuild_comovement(24) RPC 1줄 호출
  - Cloud Scheduler (gh-radar-comovement-sync-nightly, cron 0 2 * * 2-6 KST, OAuth invoker) — 야간 멱등 full-rebuild 자동화
  - 최소권한 runtime SA (gh-radar-comovement-sync-sa, supabase-service-role 1개만 — KRX 미바인딩, T-11-16)
  - smoke INV-1~5 6/6 PASS + 11-DEPLOY-LOG.md Plan 04 섹션 (image d0c7f9c, 실행 result theme 5537 / cosurge 9704)
affects: [11-05-ui, phase-completion]

tech-stack:
  added: []
  patterns:
    - "얇은 단일 cycle Job 워커: RPC 1줄(rebuild_comovement) 호출 — fetch/map/dedup 없음(intraday-sync 선례, MODE dispatch 제거)"
    - "Scheduler→Job 인증은 --oauth-service-account-email (OAuth, OIDC 금지 — T-11-14) + 리소스 단위 run.invoker 바인딩"
    - "외부 API 키 불요 워커(자체 DB 집계)는 SA 에 service-role secret 1개만 accessor — KRX/Anthropic/Kiwoom 미바인딩(최소권한)"

key-files:
  created:
    - .planning/phases/11-co-movement-candidates-top-k/11-04-SUMMARY.md
  modified:
    - scripts/smoke-comovement-sync.sh
    - .planning/phases/11-co-movement-candidates-top-k/11-DEPLOY-LOG.md

key-decisions:
  - "Scheduler cron = 0 2 * * 2-6 (화~토 02:00 KST) — 전 영업일 EOD candle-sync 확정 후 새벽 재집계. 사용자가 기본값 그대로 EXPLICIT 승인"
  - "task-timeout 180s + max-retries=0 — 멱등 TRUNCATE+INSERT full-rebuild 라 실패 시 재시도 불필요(다음 cron 이 완전 복구). 11-CALIBRATION.md 실측 ~25s 의 ×7 마진"
  - "smoke INV-4 count 추출이 content-range 의 trailing CR 미제거로 빈값 → tr -d '\\r' 추가(Rule 1 버그). 데이터 자체는 정상 적재(5537/9704)"

patterns-established:
  - "동조 사전계산 신선도 = co-movement-sync Job 야간 1회 Scheduler 자동화 (Plan 03 읽기경로가 최신 read)"
  - "신규 SA Secret Manager 바인딩 시 eventual-consistency 전파 지연 → SA describe 가시성 확인 후 idempotent 스크립트 1회 재실행(무한 재시도 금지)"

requirements-completed: [COMV-01]

duration: 12min
completed: 2026-06-11
---

# Phase 11 Plan 04: co-movement-sync 워커 Job/Scheduler 배포 Summary

**얇은 단일 cycle co-movement-sync 워커(rebuild_comovement RPC 1줄)를 Cloud Run Job(task-timeout 180s) + Cloud Scheduler(cron 0 2 * * 2-6 KST, OAuth invoker)로 배포하고, smoke INV-1~5 6/6 PASS 로 야간 멱등 full-rebuild(theme 5537 / cosurge 9704)를 검증**

## Performance

- **Duration:** ~12 min (checkpoint 재개 — Task 3 [BLOCKING] 배포만)
- **Started:** 2026-06-11 (사용자 "승인 — 배포 진행" 후 재개)
- **Completed:** 2026-06-11
- **Tasks:** 3 (Task 1/2 는 prior agent 완료 — 본 세션은 Task 3 배포 + smoke)
- **Files modified:** 2 (smoke 스크립트 + DEPLOY-LOG), 1 created (SUMMARY)

## Accomplishments

- **Cloud Run Job `gh-radar-comovement-sync` 배포** — image `co-movement-sync:d0c7f9c` (digest `sha256:7110f22b...`), task-timeout 180s, memory 512Mi, max-retries=0, 단일 cycle(MODE 없음). rebuild_comovement(24) RPC 1줄 호출 → theme_comovement/cosurge_edges 멱등 full-rebuild.
- **Cloud Scheduler `gh-radar-comovement-sync-nightly` 생성·ENABLED** — cron `0 2 * * 2-6`(Asia/Seoul, 화~토 새벽 2시), `--oauth-service-account-email`(OAuth, OIDC 금지 — T-11-14), Job 리소스 단위 run.invoker 바인딩.
- **최소권한 runtime SA `gh-radar-comovement-sync-sa`** — `gh-radar-supabase-service-role` accessor 1개만 바인딩, `gh-radar-krx-auth-key` 바인딩 0건(T-11-16 acceptance 입증). 외부 API 키 불요(자체 DB 집계).
- **smoke INV-1~5 6/6 PASS** — Job execute --wait exit 0, 로그 "co-movement-sync complete" 1건, "failed" 0건, theme_comovement 5537행 / cosurge_edges 9704행 > 0, Scheduler ENABLED + cron 일치.
- **11-DEPLOY-LOG.md Plan 04 섹션 append** — image SHA + cron + smoke 표 + Job 실행 result(theme_comovement_rows=5537, cosurge_edge_rows=9704, lookback_since=2024-06-11).

## Task Commits

1. **Task 1: rebuild.ts + index.ts 워커 본문 + 단위 테스트 (7 tests green)** - `49d90b9` (feat) — prior agent
2. **Task 2: IAM/deploy/smoke 스크립트 3종 (candle-sync 복제, KRX 제거)** - `d0c7f9c` (feat) — prior agent
3. **Task 3: [BLOCKING] IAM + 배포 + Job 실행 smoke + DEPLOY-LOG** - `2591557` (feat) — 본 세션

## Files Created/Modified

- `scripts/smoke-comovement-sync.sh` - INV-4 count 추출에 `tr -d '\r'` 추가(trailing CR 제거 — 양 INV-4)
- `.planning/phases/11-co-movement-candidates-top-k/11-DEPLOY-LOG.md` - Plan 04 배포 섹션 append (Job/Scheduler/SA/smoke/result)
- `.planning/phases/11-co-movement-candidates-top-k/11-04-SUMMARY.md` - 본 문서

## Decisions Made

- **Scheduler cron `0 2 * * 2-6` (사용자 EXPLICIT 승인):** RESEARCH §Open Q 3 권고대로 전 영업일 EOD candle-sync(17:30) 확정 후 다음날 새벽 2시 화~토 재집계. 사용자가 orchestrator AskUserQuestion(2026-06-11)에서 기본값 그대로 승인.
- **max-retries=0 + task-timeout 180s:** rebuild_comovement 은 멱등 TRUNCATE+INSERT full-rebuild 라 단일 실패 시 재시도가 무의미(다음 cron 이 완전 복구). 11-CALIBRATION.md 실측 wall-clock ~25s 의 ×7 마진을 Job 레벨 천장으로(DB role statement_timeout 600s 하위).
- **smoke INV-4 = Rule 1 버그(데이터 정상):** Job 자체는 INV-2 로 완주 확인됐고 production 에 5537/9704 행 정상 적재. 실패 원인은 순수 smoke 스크립트 count 추출이 `content-range: 0-999/5537\r` 의 trailing CR 로 `grep -oE '[0-9]+$'`($ 앵커가 CR 뒤) 미스매치한 것. `tr -d '\r'` 1줄로 수정.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 신규 SA Secret Manager IAM 전파 지연**
- **Found during:** Task 3 (IAM — setup-comovement-sync-iam.sh)
- **Issue:** SA `gh-radar-comovement-sync-sa` 생성 직후 secret accessor 바인딩 시 `Service account ... does not exist`(HTTP 400) — GCP IAM eventual-consistency 전파 지연(스크립트 버그 아님).
- **Fix:** `gcloud iam service-accounts describe` 로 SA 가시성 확인 후, idempotent 스크립트(SA-exists 분기 + 바인딩) 1회 재실행으로 accessor 바인딩 완료. 무한 재시도 아님(원인 파악 후 1회 교정). 스크립트 무변경.
- **Files modified:** (없음 — 스크립트 idempotent 재실행만)
- **Verification:** `Updated IAM policy for secret [gh-radar-supabase-service-role]` + `✓ secretAccessor bound`. T-11-16 acceptance: supabase-service-role 1건, krx-auth-key 0건.
- **Committed in:** (인프라 변경 — 코드 커밋 없음)

**2. [Rule 1 - Bug] smoke INV-4 count 추출이 trailing CR 로 빈 문자열 반환**
- **Found during:** Task 3 (smoke 1차 실행)
- **Issue:** INV-4(theme_comovement/cosurge_edges 행수 > 0) FAIL. 원인 — `content-range: 0-999/5537\r` 의 HTTP 헤더 trailing CR 때문에 `grep -oE '[0-9]+$'` 의 `$`(라인끝)가 CR 뒤를 가리켜 매치 실패 → TOTAL 빈값 → `[ "$TOTAL" -gt 0 ]` 실패. 실제 데이터는 정상 적재(REST 206 `content-range: 0-0/5537` 직접 확인).
- **Fix:** 양 INV-4 의 count 추출 파이프에 `tr -d '\r'` 추가(`echo "$RANGE_HEADER" | tr -d '\r' | grep -oE '[0-9]+$'`).
- **Files modified:** scripts/smoke-comovement-sync.sh
- **Verification:** 재실행 6/6 PASS (theme_comovement 5537 / cosurge_edges 9704 > 0).
- **Committed in:** 2591557 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking 전파지연 재시도, 1 smoke 버그)
**Impact on plan:** 둘 다 배포 정확성에 필수. (1)은 GCP 전파 지연 회피(스크립트·인프라 무변경), (2)는 smoke 검증 정확성 수정(데이터·배포 무영향). 스코프 확장 없음.

## Issues Encountered

- **워크트리 base 불일치:** 재개 시 worktree 가 `a1ab777`(11-04 Task 1/2 이전) 트리로 생성돼 prior 아티팩트(deploy 스크립트/rebuild.ts) 미가시. `a1ab777` 이 `d0c7f9c`(master HEAD)의 ancestor 임을 확인 후 `git reset --hard d0c7f9c`(fast-forward, working tree clean)로 Task 1/2 완료 트리 복원.
- **service-role 키 형식:** Secret `gh-radar-supabase-service-role` 가 신형 `sb_secret_...`(41자) 포맷 — JWT(200+자)가 아니라 처음엔 의심했으나 REST 호출(206 + 정확한 count)로 정상 동작 확인. INV-4 실패는 키가 아니라 CR 추출 버그였음.

## User Setup Required

None - 배포는 사용자 EXPLICIT 승인(AskUserQuestion 2026-06-11 — "승인 — 배포 진행", cron 기본값 승인) 하에 수행 완료. SUPABASE_URL 등 env 는 기존 candle-sync Job/Secret Manager 에서 재사용. 추가 설정 불필요.

## Next Phase Readiness

- **Plan 05 (UI):** co-movement-sync Job + Scheduler 가 ENABLED — 매 영업일 새벽 theme_comovement/cosurge_edges 갱신 자동화 완료. Plan 03 읽기경로(`/api/stocks/:code/co-movement`)가 최신 사전계산 데이터를 read → UI 가 신선한 동조 후보 표시 가능.
- **COMV-01 성공기준 3 충족:** 얇은 워커(RPC 1줄, fetch/map/dedup 없음) + Cloud Run Job + Scheduler(EOD 이후 야간 1회). 외부 API 키 불요(service-role 1개) → SA 최소권한 + Naver 5원칙 무관(자체 DB 집계, 외부 HTTP 0).
- **블로커 없음.** STATE.md/ROADMAP.md/REQUIREMENTS.md 갱신은 오케스트레이터 책임(worktree 분리 정책 — 본 SUMMARY 는 미갱신).

---
*Phase: 11-co-movement-candidates-top-k*
*Completed: 2026-06-11*

## Self-Check: PASSED

- 생성/수정 파일 전부 디스크 확인: 11-04-SUMMARY.md, smoke-comovement-sync.sh, 11-DEPLOY-LOG.md, rebuild.ts(prior), deploy-comovement-sync.sh(prior).
- 커밋 3종 git log 확인: 49d90b9(Task1), d0c7f9c(Task2), 2591557(Task3).
- production 실측: Cloud Run Job execute exit 0, "co-movement-sync complete" 로그 1건, theme_comovement 5537 / cosurge_edges 9704 행, Scheduler ENABLED + cron 0 2 * * 2-6. smoke 6/6 PASS.
