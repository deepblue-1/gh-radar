---
phase: 09-daily-candle-data
plan: 05
subsystem: infra
tags: [gcloud, cloud-run-jobs, cloud-scheduler, secret-manager, iam, monitoring, krx, supabase, bash]

# Dependency graph
requires:
  - phase: 05.1-ingestion-cloud-run-job-cloud-scheduler-kis
    provides: gh-radar-scheduler-sa (OAuth invoker SA), setup-ingestion-iam.sh 패턴
  - phase: 06-master-sync
    provides: gh-radar-krx-auth-key 시크릿, gh-radar-supabase-service-role 시크릿, deploy-master-sync.sh 패턴
  - phase: 09-daily-candle-data/02-worker-scaffold
    provides: workers/candle-sync/Dockerfile (배포 빌드 대상)
  - phase: 09-daily-candle-data/04-modes-and-entry
    provides: MODE dispatch (daily/recover/backfill) + APP_VERSION/LOG_LEVEL 환경 변수 시그니처
provides:
  - scripts/setup-candle-sync-iam.sh (runtime SA + secret accessor 자동 설정)
  - scripts/deploy-candle-sync.sh (3 Cloud Run Jobs + 2 Schedulers + run.invoker)
  - scripts/smoke-candle-sync.sh (INV-1~6 + 4개 --check-* 플래그)
  - ops/alert-candle-sync-daily-failure.yaml (Cloud Monitoring policy)
  - ops/alert-candle-sync-recover-failure.yaml (Cloud Monitoring policy)
affects:
  - 09-06-backfill-and-verify (본 plan 의 스크립트 실행 — production push)
  - 10-ai-summarization (analysis-grade OHLCV 데이터 가용성)

# Tech tracking
tech-stack:
  added: []  # 신규 라이브러리 없음 — 인프라 스크립트만
  patterns:
    - "Cloud Run Jobs — 동일 이미지 + Job 별 default MODE env 분리 (3개 Job ↔ 3개 mode 1:1 매핑, RESEARCH §5.1)"
    - "Cloud Scheduler — --oauth-service-account-email (OIDC 금지, Phase 05.1 D-07 lesson 승계)"
    - "run.invoker — 리소스 단위 바인딩 (프로젝트 단위 금지)"
    - "Idempotent deploy — describe || create (Scheduler + Secret accessor)"
    - "Smoke flag dispatch — --check-{backfill,coverage,completeness,scheduler} subcommand pattern"
    - ":latest 별칭 — Secret rotation 인프라 (T-09-05 mitigation)"

key-files:
  created:
    - scripts/setup-candle-sync-iam.sh
    - scripts/deploy-candle-sync.sh
    - scripts/smoke-candle-sync.sh
    - ops/alert-candle-sync-daily-failure.yaml
    - ops/alert-candle-sync-recover-failure.yaml
  modified: []

key-decisions:
  - "Job 3개 분리 채택 (RESEARCH §5.1) — daily/recover/backfill. 동일 이미지 + Job 별 default MODE env. 동시 실행 race 자연 방지(T-09-06) + task-timeout/memory mode 별 최적화 + alert policy 분리."
  - "각 Job task-timeout 분리 (RESEARCH §5.2) — daily=300s / recover=900s / backfill=10800s. 백필은 ~4M row UPSERT 라 KRX 일자 740회 호출 ~3시간 추정."
  - "메모리 mode 별 분리 (RESEARCH §5.3) — daily/recover=512Mi / backfill=1Gi. 백필은 페이지 buffer 크기 때문에 더 큰 메모리 필요."
  - "max-retries=0 + parallelism=1 + tasks=1 (T-09-06) — Cloud Run 자동 재시도 차단. 워커 내부 withRetry 만 사용."
  - "Scheduler 2종 시간 (D-09) — gh-radar-candle-sync-eod (30 17 * * 1-5, EOD 17:00 + 30분 마진) + gh-radar-candle-sync-recover (10 8 * * 1-5, KRX 익일 갱신 + 10분 마진). R1 가설 검증 전까지 이중 트리거 유지."
  - "OAuth (OIDC 금지) — Cloud Scheduler → Cloud Run Job invoker 호출은 `--oauth-service-account-email` 전용 (Phase 05.1 D-07 lesson 승계)."
  - "secretAccessor 최소권한 — candle-sync SA 는 KRX + Supabase 시크릿만. KIS 시크릿 미바인딩 (T-09-04.1)."
  - "Alert policy 2종만 (T-09-06.1) — daily + recover. backfill 은 수동 실행이므로 실시간 모니터링 가능 → alert 불필요."
  - "smoke INV-2 OR 조건 — 'runDaily complete' 또는 'KRX data not yet available' 두 메시지 모두 PASS 처리 (D-09 R1 fallback 시 17:30 실행이 자료 부재 빈도 높음 → INV-2 가 실패하면 안 됨)."

patterns-established:
  - "Cloud Run Job 자원 분리 — RESEARCH 단계에서 mode 별 task-timeout/memory 결정 후 deploy_job() 함수 인자로 위임"
  - "Smoke flag dispatch — case ${1:-} 으로 4개 --check-* subcommand 분기, 기본 인자 없으면 INV-1~6 전체 실행"
  - "Alert YAML mirror — ops/alert-ingestion-failure.yaml 구조 그대로 + ${NOTIFICATION_CHANNEL_ID} placeholder 유지, Plan 06 가 sed 치환 + gcloud alpha monitoring policies create"

requirements-completed:
  - DATA-01

# Metrics
duration: 4min
completed: 2026-05-11
---

# Phase 09 Plan 05: candle-sync IAM/Deploy/Scheduler Summary

**candle-sync 의 GCP 운영 인프라 — 3 Cloud Run Jobs (mode 별 자원 분리) + 2 Schedulers (이중 트리거) + 2 Monitoring alerts. 스크립트 작성만 — 실제 GCP 실행은 Plan 06.**

## Performance

- **Duration:** 4분
- **Started:** 2026-05-11T07:51:19Z
- **Completed:** 2026-05-11T07:55:16Z
- **Tasks:** 4 (모두 type="auto", tdd=false)
- **Files created:** 5 (3 bash scripts + 2 YAML alert policies)

## Accomplishments

- **runtime SA + secret accessor 자동화** — `gh-radar-candle-sync-sa` 신규 생성 + 기존 `gh-radar-krx-auth-key` / `gh-radar-supabase-service-role` 시크릿 재사용 (D-02). 최소권한 (KIS 시크릿 미바인딩 — T-09-04.1).
- **3 Cloud Run Jobs 배포 스크립트** — 동일 이미지 + Job 별 default MODE env 분리 (RESEARCH §5.1). task-timeout (300s/900s/10800s) + memory (512Mi/512Mi/1Gi) mode 별 최적화. `--parallelism=1 --max-retries=0 --tasks=1` (T-09-06 race 방지).
- **2 Cloud Schedulers 자동화** — `eod` (30 17 * * 1-5) + `recover` (10 8 * * 1-5), KST. `--oauth-service-account-email` (OIDC 금지, Phase 05.1 D-07 lesson 승계). describe || create idempotent.
- **INV-1~6 smoke + 4개 --check-* 플래그** — 기본 실행은 daily Job execute --wait + 로그/Supabase row count/Scheduler ENABLED 검증. `--check-backfill` (row ≥ 4M, 005930 ≥ 1500) / `--check-coverage` (SC #5 결측 종목 < 5%) / `--check-completeness` (결측 일자 ≤ 4) / `--check-scheduler` (cron 정확 매칭).
- **Cloud Monitoring alert 2종** — daily/recover Job 실패 1건/5분 → 이메일. `ops/alert-ingestion-failure.yaml` 구조 mirror + `${NOTIFICATION_CHANNEL_ID}` placeholder 유지 (Plan 06 sed 치환).

## Task Commits

각 task 가 원자 커밋:

1. **Task 1: setup-candle-sync-iam.sh** — `bfdb3f8` (feat)
2. **Task 2: deploy-candle-sync.sh (3 Jobs + 2 Schedulers)** — `5f98b42` (feat)
3. **Task 3: smoke-candle-sync.sh (INV-1~6 + 4 flags)** — `e6f3e5b` (feat)
4. **Task 4: alert YAML 2종** — `2a75150` (feat)

## Files Created/Modified

### Created (5)

- `scripts/setup-candle-sync-iam.sh` (96 lines, executable) — gcloud config 가드 + API enable + 선행 `gh-radar-scheduler-sa` 가드 + 신규 `gh-radar-candle-sync-sa` 생성 + 기존 시크릿 2종 accessor 바인딩
- `scripts/deploy-candle-sync.sh` (150 lines, executable) — docker build/push + 3 Job deploy + run.invoker + 2 Scheduler create/update (OAuth)
- `scripts/smoke-candle-sync.sh` (212 lines, executable) — INV-1~6 + 4 flag dispatch + Supabase REST `Prefer: count=exact` 패턴 + psql SC #5 SQL
- `ops/alert-candle-sync-daily-failure.yaml` — Cloud Monitoring policy (failed count > 0, 300s alignment)
- `ops/alert-candle-sync-recover-failure.yaml` — 동일 구조, recover Job 대상

## Decisions Made

- **Job 분리 vs args 분기 — Job 3개 분리 채택** (RESEARCH §5.1). 동일 이미지여도 Job 리소스 분리로 race 자연 방지(T-09-06) + alert policy mode 별로 깔끔하게 매핑 + task-timeout/memory 따로 튜닝 가능. args 분기 방식은 Scheduler 가 args 를 못 넘기는 제약과 alert 가 어려운 문제.
- **OAuth (OIDC 금지)** — Phase 05.1 D-07 lesson 그대로 승계. `--oauth-service-account-email` 만 사용. Cloud Run Job invoker 호출 시 OIDC 토큰을 받지 못해 401 가능성 → Phase 05.1 에서 이미 검증된 OAuth 방식 고정.
- **describe || create idempotent** — Scheduler 의 경우 cron 변경 가능성이 있어 update 분기 명시. Secret accessor 는 add-iam-policy-binding 이 자체적으로 idempotent.
- **smoke INV-2 OR 조건** — D-09 R1 가설 (KRX EOD 17:00 시점 부분 가용) 검증 전까지 `runDaily complete` 또는 `KRX data not yet available` 두 메시지 모두 PASS 처리. recover Scheduler 가 8:10 에 도달하면 incomplete 보정 가능 → 17:30 실행은 가벼운 trigger 로 운용.
- **알림 채널 placeholder** — `${NOTIFICATION_CHANNEL_ID}` 그대로 보존. Plan 06 가 `gcloud alpha monitoring channels create` 로 채널 생성 후 sed 치환 + policy create. 본 plan 단계에서는 채널 ID 가 결정되지 않음.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- YAML parser 부재 (node-yaml/PyYAML 모두 미설치). YAML 구조 검증을 fallback 으로 처리 — 필수 키(`displayName`, `conditions`, `conditionThreshold`, `filter`, `combiner`, `enabled`, `notificationChannels`) 존재 확인 + 탭 인덴트 금지 검사. 실제 적용은 Plan 06 Task 4 가 `gcloud alpha monitoring policies create` 실행 시 GCP 가 YAML 검증.

## User Setup Required

None - 본 plan 은 스크립트 작성만이며, 실제 GCP 호출은 Plan 06 의 [BLOCKING] tasks 에서 사용자 실행 + 검증.

**Plan 06 가 본 plan 의 산출물을 실행:**
- Task 2: `bash scripts/setup-candle-sync-iam.sh` (runtime SA + secret accessor)
- Task 3: `bash scripts/deploy-candle-sync.sh` + 수동 `gcloud run jobs execute gh-radar-candle-sync-backfill` (백필)
- Task 4: `gcloud alpha monitoring channels create` + sed 치환 + `gcloud alpha monitoring policies create` (alert)
- 최종 검증: `bash scripts/smoke-candle-sync.sh` + 4개 --check-* 플래그

## Next Phase Readiness

- Plan 06 (backfill-and-verify) 가 본 산출물을 실행 — production push + 백필 + smoke + INV-1~6.
- 신규 SA `gh-radar-candle-sync-sa` 는 KRX + Supabase 시크릿만 (KIS 미접근) — 최소권한 원칙.
- 백필 실행 전 사용자가 daily/recover Scheduler 일시 pause 필요 (T-09-06 run-book — Plan 06 Task 3 명시).

## Self-Check: PASSED

- **scripts/setup-candle-sync-iam.sh:** FOUND, executable, bash -n PASS
- **scripts/deploy-candle-sync.sh:** FOUND, executable, bash -n PASS
- **scripts/smoke-candle-sync.sh:** FOUND, executable, bash -n PASS
- **ops/alert-candle-sync-daily-failure.yaml:** FOUND, structure validated (필수 키 + 탭 인덴트 없음)
- **ops/alert-candle-sync-recover-failure.yaml:** FOUND, structure validated
- **Commits:**
  - bfdb3f8 (Task 1) — FOUND
  - 5f98b42 (Task 2) — FOUND
  - e6f3e5b (Task 3) — FOUND
  - 2a75150 (Task 4) — FOUND

---
*Phase: 09-daily-candle-data*
*Plan: 05*
*Completed: 2026-05-11*
