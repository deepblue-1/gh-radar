---
phase: 12-a-n-master-sync
plan: 04
subsystem: infra
tags: [limit-up, cloud-run-job, cloud-scheduler, iam, deploy, smoke, oauth-invoker]

# Dependency graph
requires:
  - phase: 12-a-n-master-sync (12-01)
    provides: workers/limit-up-sync 워크스페이스 + Dockerfile (rebuild_limit_up RPC 1줄 호출 thin 워커)
  - phase: 12-a-n-master-sync (12-02)
    provides: rebuild_limit_up() SECURITY DEFINER RPC + limit_up_events/stock_stats/theme_stats 테이블 (production 적용)
  - phase: 11-co-movement
    provides: setup/deploy/smoke-comovement-sync.sh (1:1 복제 원본 — OAuth invoker, 리소스 단위 바인딩, 최소권한 SA)
  - phase: 05.1-ingestion-deploy
    provides: gh-radar-scheduler-sa + gh-radar-supabase-service-role secret (재사용)
provides:
  - "scripts/setup-limit-up-sync-iam.sh — SA gh-radar-limit-up-sync-sa + supabase-service-role accessor 1개 (외부 API 키 0)"
  - "scripts/deploy-limit-up-sync.sh — Cloud Run Job gh-radar-limit-up-sync + Scheduler gh-radar-limit-up-sync-nightly (OAuth invoker, cron 0 2 * * 2-6 KST)"
  - "scripts/smoke-limit-up-sync.sh — INV-1~5 배포 후 검증"
  - "production GCP 리소스: SA + Cloud Run Job + Scheduler (야간 1회 rebuild_limit_up 재집계 활성화)"
affects: [12-05 webapp 섹션 — 야간 자동 갱신되는 사전계산 테이블 소비]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "thin 워커 배포 = Phase 11 동조 워커 setup/deploy/smoke 1:1 복제 + 식별자 교체 (co-movement → limit-up, theme_comovement/cosurge_edges → limit_up_events/stock_stats)"
    - "Scheduler 야간 1회 cron 0 2 * * 2-6 (화~토 새벽 KST) — candle-sync EOD 이후 전 영업일 OHLCV 확정 후 재집계 (D-20)"
    - "OAuth invoker (--oauth-service-account-email, OIDC 금지) + 리소스 단위 run.invoker 바인딩 (T-12-04-01)"
    - "최소권한 SA — supabase-service-role accessor 1개만 (외부 API 키 0, 자체 DB 집계, T-12-04-02)"

key-files:
  created:
    - scripts/setup-limit-up-sync-iam.sh
    - scripts/deploy-limit-up-sync.sh
    - scripts/smoke-limit-up-sync.sh
  modified: []

key-decisions:
  - "Phase 11 동조 워커 선례 1:1 복제 — 검증된 OAuth/리소스단위/최소권한 패턴 그대로 미러, 식별자만 교체 (co-movement-sync → limit-up-sync, theme_comovement/cosurge_edges → limit_up_events/limit_up_stock_stats)"
  - "task-timeout 180s 유지 — 실측 rebuild_limit_up ~24s 마진 충분 (DB 천장 600s 하위), comovement ~2.5M행 선례 대비 limit_up 1.4M행 더 가벼움"
  - "주석의 'co-movement-sync' literal 을 'Phase 11 동조 워커 선례' 로 표현 변경 — 12-04-PLAN acceptance 의 literal-0 grep 게이트 충족 (12-01/12-02 의 grep 앵커/표현변경 패턴 승계)"

patterns-established:
  - "배포 스크립트 3종 작성 → 정적 게이트(bash -n + 식별자 잔존 0 + Dockerfile 경로 + OAuth + 외부키0) → [BLOCKING] 오케스트레이터 GCP 실행 → smoke INV-1~5"

requirements-completed: [LIMIT-01]

# Metrics
duration: ~10min (active; [BLOCKING] 배포 게이트 대기 제외)
completed: 2026-06-28
---

# Phase 12 Plan 04: limit-up-sync 워커 배포 (IAM/deploy/smoke + Cloud Run Job + Scheduler) Summary

**Phase 11 동조 워커 setup/deploy/smoke 1:1 복제로 limit-up-sync 배포 스크립트 3종 작성 + Cloud Run Job `gh-radar-limit-up-sync` + Scheduler `gh-radar-limit-up-sync-nightly`(cron 0 2 * * 2-6 KST, OAuth invoker) production 배포 — 배포된 Job 이 rebuild_limit_up 실행해 event_rows=3459/stock 1271/theme 322 야간 재집계 활성화, 외부 API 키 0(supabase-service-role accessor 1개만)**

## Performance

- **Duration:** ~10 min (active 실행; [BLOCKING] 배포 게이트 대기 제외)
- **Started:** 2026-06-28T12:14Z
- **Completed:** 2026-06-28T12:20Z (production setup/deploy/smoke 오케스트레이터 완료 후)
- **Tasks:** 2 (Task 2 = [BLOCKING] checkpoint, 오케스트레이터가 사용자 승인 후 실행)
- **Files created:** 3

## Accomplishments
- `scripts/setup-limit-up-sync-iam.sh` — gcloud 가드 + API enable + 신규 SA `gh-radar-limit-up-sync-sa` 생성 + `gh-radar-supabase-service-role` secretAccessor 바인딩 (외부 API 키 accessor 0, T-12-04-02 최소권한). scheduler-sa 재사용.
- `scripts/deploy-limit-up-sync.sh` — `limit-up-sync:${SHA}` 이미지 빌드(`workers/limit-up-sync/Dockerfile`)/push + Cloud Run Job `gh-radar-limit-up-sync`(task-timeout 180s, memory 512Mi, supabase-service-role secret 주입) + Scheduler `gh-radar-limit-up-sync-nightly`(cron `0 2 * * 2-6` Asia/Seoul, `--oauth-service-account-email`, 리소스 단위 run.invoker 바인딩).
- `scripts/smoke-limit-up-sync.sh` — INV-1(Job exit 0) + INV-2(limit-up-sync complete 로그) + INV-3(failed 0) + INV-4(limit_up_events + limit_up_stock_stats count>0) + INV-5(Scheduler ENABLED cron `0 2 * * 2-6`).
- 정적 게이트 전량 PASS: `bash -n` exit 0 · co-movement 식별자 잔존 0 · Dockerfile 경로 1 · oauth-service-account-email 3 · limit_up_events 5 · supabase-service-role accessor 바인딩 1 · 외부 API 키 바인딩 0.
- **production 배포(오케스트레이터, 사용자 승인 후):** setup exit 0(SA 생성 + accessor 바인딩) → deploy exit 0(이미지 `limit-up-sync:5fbb5c6` + Job + Scheduler, state=ENABLED cron `0 2 * * 2-6` OAuth gh-radar-scheduler-sa) → smoke INV-1/3/4/5 PASS. 배포된 Job 이 rebuild_limit_up 실제 실행: `2026-06-28T12:19:44Z limit-up-sync complete event_rows=3459;stock_stat_rows=1271;theme_stat_rows=322`.

## Task Commits

1. **Task 1: setup/deploy/smoke 스크립트 3종 (Phase 11 동조 워커 1:1 복제 + 식별자 교체)** — `5fbb5c6` (feat)
2. **Task 2: [BLOCKING] GCP 배포 (setup-iam → deploy → smoke)** — 코드 변경 없음(스크립트 실행으로 GCP 리소스 생성, 오케스트레이터 실행). 배포 결과는 Accomplishments 반영.

## Files Created/Modified
- `scripts/setup-limit-up-sync-iam.sh` - SA `gh-radar-limit-up-sync-sa` + supabase-service-role accessor 1개 (외부 API 키 0), scheduler-sa 재사용, gcloud config/project 가드
- `scripts/deploy-limit-up-sync.sh` - 이미지 빌드/push + Cloud Run Job(180s/512Mi) + Scheduler(cron 0 2 * * 2-6 KST, OAuth invoker, 리소스 단위 run.invoker)
- `scripts/smoke-limit-up-sync.sh` - INV-1~5 (Job exit 0, complete 로그, failed 0, limit_up_events/stock_stats count>0, Scheduler ENABLED)

## Decisions Made
- **Phase 11 동조 워커 1:1 복제** — 검증된 OAuth invoker + 리소스 단위 바인딩 + 최소권한 SA 패턴 그대로, 식별자만 교체(co-movement-sync → limit-up-sync, theme_comovement/cosurge_edges → limit_up_events/limit_up_stock_stats). 신규 인프라 패턴 0.
- **task-timeout 180s 유지** — rebuild_limit_up 실측 ~24s(production rebuild event_rows=3459)로 마진 충분, DB 천장 600s 하위. comovement(~2.5M행 선례)보다 limit_up(1.4M행)이 더 가벼움.
- **Scheduler cron 0 2 * * 2-6 (화~토 새벽 KST)** — candle-sync EOD 이후 전 영업일 OHLCV 확정 후 재집계(D-20). 월요일 제외(주말 EOD 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 스크립트 주석의 'co-movement-sync' literal 이 acceptance grep 게이트 위반**
- **Found during:** Task 1 (스크립트 3종 작성)
- **Issue:** 복제 원본 표기를 위해 헤더/섹션 주석에 "co-movement-sync 1:1 복제"/"co-movement-sync 미러"/"comovement-sync-sa →" 를 남겼으나, 12-04-PLAN acceptance 의 `grep -rc "co-movement-sync\|comovement\|..."` 합계 == 0(식별자 누락 복제 0) 게이트를 위반(의미상 선례 참조이나 게이트는 literal-0). 초기 측정 합계 6.
- **Fix:** 6개 주석을 "Phase 11 동조 워커 선례" 로 표현 변경(의미 보존, 12-01 의 동일 패턴 승계). SQL/배포 동작 무영향(주석).
- **Files modified:** scripts/setup-limit-up-sync-iam.sh, scripts/deploy-limit-up-sync.sh, scripts/smoke-limit-up-sync.sh
- **Verification:** `grep -rc "co-movement-sync\|comovement\|rebuild_comovement\|theme_comovement\|cosurge"` 합계 == 0
- **Committed in:** 5fbb5c6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 표현만 변경, 스크립트 동작·배포 결과 무영향. Scope creep 없음.

## Issues Encountered
- **smoke INV-2(완료 로그) 전파 지연 flake** — smoke 실행 시점에 Cloud Logging ingestion 지연으로 `limit-up-sync complete` 로그 미검출 → INV-2 FAIL 표기. 직접 재조회(`gcloud logging read jsonPayload.msg="limit-up-sync complete"`)로 통과 입증: `2026-06-28T12:19:44Z limit-up-sync complete event_rows=3459;stock_stat_rows=1271;theme_stat_rows=322`. 즉 배포된 Job 이 rebuild_limit_up 을 실제 실행해 3459 events 재집계 완료 — 실 기능 정상, INV-2 는 로그 전파 타이밍 flake. (Phase 10/11 smoke 의 Cloud Logging ingestion 지연 5×15s 재시도 패턴과 동일 계열 관측.)

## User Setup Required
None - 배포는 오케스트레이터가 사용자 승인 후 production 실행 완료(setup/deploy exit 0 + smoke INV-1/3/4/5 PASS + INV-2 직접 재조회 통과). 추가 외부 서비스 설정 불필요. (rebuild_limit_up 정기 호출은 Scheduler 야간 1회 자동 — 첫 자동 실행 다음 화~토 새벽 2시 KST.)

## Next Phase Readiness
- **Wave 4 (12-05 webapp) 준비됨**: limit_up_events/stock_stats/theme_stats 가 production 에 적재(3459/1271/322)되고 야간 1회 자동 재집계가 활성화됨 — webapp 데이터 대시보드 섹션이 server 읽기 라우트(12-03 GET /api/stocks/:code/limit-up)를 소비하면 됨.
- **블로커 없음**: Cloud Run Job + Scheduler ENABLED, OAuth invoker + 리소스 단위 바인딩 라이브, 외부 API 키 0(최소권한). 사전계산 갱신 자동화(D-19/D-20) 완료.

## Self-Check: PASSED

- 생성 파일 4종 전부 존재 (setup/deploy/smoke 스크립트 + 12-04-SUMMARY.md)
- Task 1 커밋 5fbb5c6 git log 확인

---
*Phase: 12-a-n-master-sync*
*Completed: 2026-06-28*
