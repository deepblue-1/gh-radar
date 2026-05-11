---
phase: 09-daily-candle-data
plan: 05
type: execute
wave: 2
depends_on:
  - 09-04
files_modified:
  - scripts/setup-candle-sync-iam.sh
  - scripts/deploy-candle-sync.sh
  - scripts/smoke-candle-sync.sh
  - ops/alert-candle-sync-daily-failure.yaml
  - ops/alert-candle-sync-recover-failure.yaml
autonomous: true
requirements_addressed:
  - DATA-01

must_haves:
  truths:
    - "setup-candle-sync-iam.sh 가 runtime SA `gh-radar-candle-sync-sa` 신규 생성 + 기존 시크릿 (`gh-radar-krx-auth-key`, `gh-radar-supabase-service-role`) accessor 부여 + 기존 `gh-radar-scheduler-sa` 재사용 — D-13"
    - "deploy-candle-sync.sh 가 3개 Cloud Run Job 배포 — daily/recover/backfill 모두 동일 이미지 + MODE env default 분기 — RESEARCH §5.1 Job 3개 권장 채택"
    - "각 Job 의 task-timeout — daily=300s, recover=900s, backfill=10800s — RESEARCH §5.2"
    - "각 Job 의 memory — daily/recover=512Mi, backfill=1Gi — RESEARCH §5.3"
    - "각 Job 의 --parallelism=1 --max-retries=0 --tasks=1 + run.invoker 바인딩 (gh-radar-scheduler-sa) — RESEARCH §5.4"
    - "Scheduler 2종 — gh-radar-candle-sync-eod (`30 17 * * 1-5` → daily Job) + gh-radar-candle-sync-recover (`10 8 * * 1-5` → recover Job), OAuth `--oauth-service-account-email` (OIDC 금지)"
    - "Cloud Monitoring alert policy 2종 신설 (daily-failure + recover-failure) — master-sync 패턴 mirror"
    - "smoke-candle-sync.sh 가 INV-1~6 검증 + --check-backfill / --check-coverage / --check-completeness / --check-scheduler 플래그 지원"
    - "deploy 스크립트는 idempotent — 두 번 실행해도 안전 (describe || create 패턴)"
  artifacts:
    - path: "scripts/setup-candle-sync-iam.sh"
      provides: "candle-sync runtime SA + secret accessor (KRX/Supabase 재사용)"
      contains: "gh-radar-candle-sync-sa"
    - path: "scripts/deploy-candle-sync.sh"
      provides: "3 Cloud Run Jobs + 2 Schedulers + run.invoker 바인딩"
      contains: "gh-radar-candle-sync-backfill"
    - path: "scripts/smoke-candle-sync.sh"
      provides: "INV-1~6 + --check-* 플래그"
      contains: "INV-6"
    - path: "ops/alert-candle-sync-daily-failure.yaml"
      provides: "daily Job 실패 1건/5분 → 이메일"
      contains: "gh-radar-candle-sync-daily"
    - path: "ops/alert-candle-sync-recover-failure.yaml"
      provides: "recover Job 실패 1건/5분 → 이메일"
      contains: "gh-radar-candle-sync-recover"
  key_links:
    - from: "scripts/deploy-candle-sync.sh"
      to: "Cloud Run Job 3종 (daily/recover/backfill)"
      via: "gcloud run jobs deploy + run.invoker 바인딩"
      pattern: "gh-radar-candle-sync-(daily|recover|backfill)"
    - from: "Cloud Scheduler 2종"
      to: "Cloud Run Job 의 :run API"
      via: "OAuth gh-radar-scheduler-sa"
      pattern: "--oauth-service-account-email"
    - from: "ops/alert-candle-sync-*.yaml"
      to: "Cloud Monitoring notification channel"
      via: "${NOTIFICATION_CHANNEL_ID} placeholder"
      pattern: "NOTIFICATION_CHANNEL_ID"
---

<objective>
candle-sync 의 GCP 운영 인프라 — IAM 설정 + Cloud Run Job 3개 배포 + Cloud Scheduler 2개 + Cloud Monitoring alert 2개. Plan 06 의 production push + 백필 + smoke 가 본 plan 의 스크립트를 실행한다.

**중요 결정 (RESEARCH §5.1 채택):** Job 3개 분리 — `gh-radar-candle-sync-daily` / `gh-radar-candle-sync-recover` / `gh-radar-candle-sync-backfill`. 동일 Docker 이미지 + Job 별 default MODE env 분리. 사유: 동시 실행 race 자연 방지 (T-09-06) + task-timeout/memory mode 별 최적화 + alert policy 분리.

Purpose:
- DATA-01 SC #3 (Cloud Run Job + Scheduler EOD 증분)
- DATA-01 SC #4 (rate-limit/재시도/fail-isolation — IAM/SA 최소권한)
- DATA-01 SC #5 (정합성 모니터링 — alert + smoke)
- D-13 (SA 분리), D-14 (배포 스크립트), D-15 (모니터링)
- RESEARCH §5.1 Job 3개 분리, §5.2/3 task-timeout/memory, §5.4 동시 실행 방지
- RESEARCH §7 T-09-01 (401 alert), T-09-04 (Scheduler OAuth), T-09-05 (Secret rotation), T-09-06 (동시 실행 race)

Mirror 대상:
- `scripts/setup-master-sync-iam.sh` → `scripts/setup-candle-sync-iam.sh`
- `scripts/deploy-master-sync.sh` → `scripts/deploy-candle-sync.sh` (단, Job 3개 + Scheduler 2개로 확장)
- `scripts/smoke-master-sync.sh` → `scripts/smoke-candle-sync.sh`

본 plan 은 **스크립트 작성만** — 실제 GCP 실행은 Plan 06.

Output:
- 3개 bash 스크립트 + 2개 YAML alert policy = 5 파일
- 정적 검증 (shellcheck 또는 bash -n syntax check) PASS
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/09-daily-candle-data/09-CONTEXT.md
@.planning/phases/09-daily-candle-data/09-RESEARCH.md

# Mirror 대상 — master-sync 스크립트
@scripts/setup-master-sync-iam.sh
@scripts/deploy-master-sync.sh
@scripts/smoke-master-sync.sh

# Mirror 대상 — ingestion alert policy
@ops/alert-ingestion-failure.yaml

# Plan 02/04 산출
@workers/candle-sync/Dockerfile
@workers/candle-sync/src/index.ts

<interfaces>
<!-- Job 3개 정의 (RESEARCH §5.1 + §5.2/3) -->
| Job | MODE default | task-timeout | memory | Scheduler |
|-----|--------------|--------------|--------|-----------|
| gh-radar-candle-sync-daily   | daily   | 300s   | 512Mi | gh-radar-candle-sync-eod (`30 17 * * 1-5`) |
| gh-radar-candle-sync-recover | recover | 900s   | 512Mi | gh-radar-candle-sync-recover (`10 8 * * 1-5`) |
| gh-radar-candle-sync-backfill | backfill | 10800s | 1Gi  | (없음 — 수동 execute) |

<!-- SA -->
| SA | Role | Used By |
|----|------|---------|
| gh-radar-candle-sync-sa (신규) | Job 실행 + KRX/Supabase Secret accessor | Cloud Run Job 3개 runtime |
| gh-radar-scheduler-sa (재사용) | run.invoker on 3 Jobs | Scheduler 2개 (recover/eod) + 수동 backfill 도 OK |

<!-- Secret (재사용, 신설 X — D-02) -->
| Secret | Source |
|--------|--------|
| gh-radar-krx-auth-key | master-sync 가 이미 보유 |
| gh-radar-supabase-service-role | ingestion + master-sync 가 이미 보유 |
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: setup-candle-sync-iam.sh (runtime SA + secret accessor)</name>
  <files>scripts/setup-candle-sync-iam.sh</files>

  <read_first>
    - scripts/setup-master-sync-iam.sh (mirror 대상 — SA 생성 + secret accessor 패턴)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-02 (KRX_AUTH_KEY 재사용) §D-13 (SA 분리)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §7 T-09-04 (Scheduler SA invoker — 본 task 가 아닌 deploy 스크립트에서 binding)
  </read_first>

  <action>
파일 `scripts/setup-candle-sync-iam.sh` 를 다음 내용으로 생성. **실행 권한 (chmod +x) 부여 필수**:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-candle-sync-iam.sh
# Phase 9 (DATA-01) — candle-sync 워커의 IAM + secret accessor 설정
#
# 결정 (09-CONTEXT.md):
#   D-02: KRX_AUTH_KEY 재사용 — 기존 master-sync 시크릿 (gh-radar-krx-auth-key)
#   D-13: SA 분리 — runtime SA gh-radar-candle-sync-sa 신규 + scheduler SA 재사용
# ═══════════════════════════════════════════════════════════════

# Section 1: gcloud 가드 (master-sync 미러)
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: export GCP_PROJECT_ID=gh-radar" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]]; then
  echo "ERROR: active gcloud configuration is '$ACTIVE_CONFIG', expected '$EXPECTED_CONFIG'" >&2
  exit 1
fi

if [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: active project is '$ACTIVE_PROJECT', expected '$EXPECTED_PROJECT'" >&2
  exit 1
fi

echo "✓ gcloud guard: config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT"

# Section 2: API enable (idempotent)
echo "▶ enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com

echo "✓ APIs enabled"

# Section 3: 선행 SA 존재 확인 — gh-radar-scheduler-sa 재사용 (Phase 05.1)
for SA in gh-radar-scheduler-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found — Phase 05.1 setup-ingestion-iam.sh 가 먼저 실행되어야 함" >&2
    exit 1
  fi
  echo "✓ SA exists (reused): $SA"
done

# Section 4: 신규 candle-sync 전용 SA (idempotent create)
CANDLE_SYNC_SA_NAME=gh-radar-candle-sync-sa
CANDLE_SYNC_SA_EMAIL="${CANDLE_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$CANDLE_SYNC_SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $CANDLE_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$CANDLE_SYNC_SA_NAME" \
    --display-name="gh-radar candle-sync (KRX bydd_trd + Supabase, Phase 9 DATA-01)"
  echo "✓ SA created: $CANDLE_SYNC_SA_NAME"
fi

# Section 5: 기존 secret 존재 확인 (D-02 — 재사용)
for SECRET in gh-radar-krx-auth-key gh-radar-supabase-service-role; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "✓ secret exists (reused): $SECRET"
  else
    echo "ERROR: secret '$SECRET' not found — Phase 06.1 setup-master-sync-iam.sh + Phase 05.1 setup-ingestion-iam.sh 가 먼저 실행되어야 함" >&2
    exit 1
  fi
done

# Section 6: Secret accessor 바인딩 — candle-sync SA 에 KRX + Supabase 시크릿 부여
gcloud secrets add-iam-policy-binding gh-radar-krx-auth-key \
  --member="serviceAccount:${CANDLE_SYNC_SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: gh-radar-krx-auth-key → $CANDLE_SYNC_SA_NAME"

gcloud secrets add-iam-policy-binding gh-radar-supabase-service-role \
  --member="serviceAccount:${CANDLE_SYNC_SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: gh-radar-supabase-service-role → $CANDLE_SYNC_SA_NAME"

echo ""
echo "✅ setup-candle-sync-iam.sh complete"
echo "Next: bash scripts/deploy-candle-sync.sh"
```

실행 권한 부여:
```bash
chmod +x scripts/setup-candle-sync-iam.sh
```

bash syntax check:
```bash
bash -n scripts/setup-candle-sync-iam.sh
```
exit 0.
  </action>

  <verify>
    <automated>test -x scripts/setup-candle-sync-iam.sh && bash -n scripts/setup-candle-sync-iam.sh && grep -q "gh-radar-candle-sync-sa" scripts/setup-candle-sync-iam.sh && grep -q "gh-radar-krx-auth-key" scripts/setup-candle-sync-iam.sh && grep -q "gh-radar-supabase-service-role" scripts/setup-candle-sync-iam.sh</automated>
  </verify>

  <acceptance_criteria>
    - `test -x scripts/setup-candle-sync-iam.sh` (실행 권한)
    - `bash -n scripts/setup-candle-sync-iam.sh` exit 0 (syntax OK)
    - `grep -c "gh-radar-candle-sync-sa" scripts/setup-candle-sync-iam.sh` ≥ 3 (SA 변수 + create + 2개 secret accessor)
    - `grep "gh-radar-scheduler-sa" scripts/setup-candle-sync-iam.sh` 매치 (재사용 가드)
    - `grep "gh-radar-krx-auth-key" scripts/setup-candle-sync-iam.sh` 매치 (재사용)
    - `grep "gh-radar-supabase-service-role" scripts/setup-candle-sync-iam.sh` 매치 (재사용)
    - `grep "secretmanager.secretAccessor" scripts/setup-candle-sync-iam.sh` 매치
    - `grep "describe \"\$CANDLE_SYNC_SA_EMAIL\"" scripts/setup-candle-sync-iam.sh` 또는 등가 (idempotent describe || create)
    - GCP_PROJECT_ID + active config 가드 (master-sync 와 동일)
  </acceptance_criteria>

  <done>setup-candle-sync-iam.sh 작성 + syntax PASS. Plan 06 Task 2 에서 실행.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: deploy-candle-sync.sh (3 Jobs + 2 Schedulers + run.invoker)</name>
  <files>scripts/deploy-candle-sync.sh</files>

  <read_first>
    - scripts/deploy-master-sync.sh (mirror 대상 — Job deploy + Scheduler create/update + run.invoker binding)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-09 (Scheduler 이중 트리거 17:30 + 08:10) §D-12 (자원) §D-14 (배포 스크립트)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §5.1 (Job 3개) §5.2 (task-timeout) §5.3 (memory) §7 T-09-04 (Scheduler OAuth, OIDC 금지)
  </read_first>

  <action>
파일 `scripts/deploy-candle-sync.sh` 를 다음 내용으로 생성:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-candle-sync.sh
# Phase 9 (DATA-01) — Cloud Run Job 3개 + Cloud Scheduler 2개 배포
#
# RESEARCH §5.1 채택: Job 3개 분리 (daily/recover/backfill 동일 이미지, default MODE 분리)
# RESEARCH §5.2: task-timeout daily=300s / recover=900s / backfill=10800s
# RESEARCH §5.3: memory daily/recover=512Mi / backfill=1Gi
# RESEARCH §7 T-09-04: --oauth-service-account-email 사용 (OIDC 금지)
# ═══════════════════════════════════════════════════════════════

# Section 1: 가드 (master-sync 미러)
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: gcloud config mismatch" >&2
  exit 1
fi

# 선행 SA 검증
for SA in gh-radar-scheduler-sa gh-radar-candle-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-candle-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA check"

# Section 2: 변수
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/candle-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/candle-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# Section 3: Build (amd64 강제, GIT_SHA 주입)
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/candle-sync/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# Section 4: Push
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# Section 5: Deploy 3 Cloud Run Jobs (동일 이미지, mode 별 default env + 자원 분리)
RUNTIME_SA="gh-radar-candle-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@KRX_BASE_URL=https://data-dbg.krx.co.kr/svc/apis@LOG_LEVEL=info@APP_VERSION=${SHA}"
COMMON_SECRETS="KRX_AUTH_KEY=gh-radar-krx-auth-key:latest,SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

deploy_job() {
  local job="$1" mode="$2" timeout="$3" memory="$4"
  echo "▶ deploying Cloud Run Job: $job (MODE=$mode, timeout=$timeout, memory=$memory)..."
  gcloud run jobs deploy "$job" \
    --image="$IMAGE" \
    --region="$REGION" \
    --service-account="$RUNTIME_SA" \
    --cpu=1 \
    --memory="$memory" \
    --task-timeout="$timeout" \
    --max-retries=0 \
    --parallelism=1 \
    --tasks=1 \
    --set-env-vars="${COMMON_ENV}@MODE=${mode}" \
    --set-secrets="$COMMON_SECRETS"

  # T-09-04: Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
  gcloud run jobs add-iam-policy-binding "$job" \
    --region="$REGION" \
    --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
    --role=roles/run.invoker >/dev/null
  echo "✓ run.invoker bound: gh-radar-scheduler-sa → $job"
}

# RESEARCH §5.2 / §5.3
deploy_job "gh-radar-candle-sync-daily"    "daily"    "300s"   "512Mi"
deploy_job "gh-radar-candle-sync-recover"  "recover"  "900s"   "512Mi"
deploy_job "gh-radar-candle-sync-backfill" "backfill" "10800s" "1Gi"

# Section 6: Cloud Scheduler 2개 — eod (daily) + recover
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

create_or_update_scheduler() {
  local sched="$1" job="$2" cron="$3"
  local uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${job}:run"

  if gcloud scheduler jobs describe "$sched" --location="$REGION" >/dev/null 2>&1; then
    echo "▶ scheduler update: $sched (cron $cron → $job)..."
    gcloud scheduler jobs update http "$sched" \
      --location="$REGION" \
      --schedule="$cron" \
      --time-zone="Asia/Seoul" \
      --uri="$uri" \
      --http-method=POST \
      --oauth-service-account-email="$SCHED_SA"
  else
    echo "▶ scheduler create: $sched (cron $cron → $job)..."
    gcloud scheduler jobs create http "$sched" \
      --location="$REGION" \
      --schedule="$cron" \
      --time-zone="Asia/Seoul" \
      --uri="$uri" \
      --http-method=POST \
      --oauth-service-account-email="$SCHED_SA"
  fi
}

# D-09: 1차 cron 30 17 * * 1-5 (EOD 17:00 + 30분 마진, R1 가설 의존)
create_or_update_scheduler \
  "gh-radar-candle-sync-eod" \
  "gh-radar-candle-sync-daily" \
  "30 17 * * 1-5"

# D-09: 2차 cron 10 8 * * 1-5 (KRX 갱신 08:00 + 10분 마진, R1 fallback)
create_or_update_scheduler \
  "gh-radar-candle-sync-recover" \
  "gh-radar-candle-sync-recover" \
  "10 8 * * 1-5"

# Section 7: 완료
echo ""
echo "✓ Deployed 3 Jobs + 2 Schedulers @ $IMAGE"
echo "  - gh-radar-candle-sync-daily    (cron 30 17 * * 1-5, KST)"
echo "  - gh-radar-candle-sync-recover  (cron 10 8  * * 1-5, KST)"
echo "  - gh-radar-candle-sync-backfill (수동 execute — Plan 06 Task 3)"
echo ""
echo "Next: bash scripts/smoke-candle-sync.sh (post-deploy verification)"
```

실행 권한 부여:
```bash
chmod +x scripts/deploy-candle-sync.sh
bash -n scripts/deploy-candle-sync.sh
```
  </action>

  <verify>
    <automated>test -x scripts/deploy-candle-sync.sh && bash -n scripts/deploy-candle-sync.sh && grep -q "gh-radar-candle-sync-daily" scripts/deploy-candle-sync.sh && grep -q "gh-radar-candle-sync-recover" scripts/deploy-candle-sync.sh && grep -q "gh-radar-candle-sync-backfill" scripts/deploy-candle-sync.sh && grep -q "30 17 \* \* 1-5" scripts/deploy-candle-sync.sh && grep -q "10 8 \* \* 1-5" scripts/deploy-candle-sync.sh && grep -q "10800s" scripts/deploy-candle-sync.sh</automated>
  </verify>

  <acceptance_criteria>
    - `test -x scripts/deploy-candle-sync.sh` (실행 권한)
    - `bash -n scripts/deploy-candle-sync.sh` exit 0
    - 3개 Job 모두 매치 — `gh-radar-candle-sync-daily`, `gh-radar-candle-sync-recover`, `gh-radar-candle-sync-backfill`
    - task-timeout 분리 검증 — `grep -c "300s\\|900s\\|10800s" scripts/deploy-candle-sync.sh` ≥ 3
    - memory 분리 — `grep "512Mi" scripts/deploy-candle-sync.sh` 매치 (daily/recover) + `grep "1Gi" scripts/deploy-candle-sync.sh` 매치 (backfill)
    - MODE env 분리 — `grep "MODE=daily" scripts/deploy-candle-sync.sh` + `MODE=recover` + `MODE=backfill` 각각 1회 이상 매치
    - Scheduler cron — `grep "30 17 \\* \\* 1-5" scripts/deploy-candle-sync.sh` (D-09 1차) + `grep "10 8 \\* \\* 1-5" scripts/deploy-candle-sync.sh` (D-09 2차)
    - `grep "oauth-service-account-email" scripts/deploy-candle-sync.sh` (OAuth, OIDC 금지 — T-09-04)
    - `grep "run.invoker" scripts/deploy-candle-sync.sh` (Job 리소스 단위 binding)
    - `grep "max-retries=0" scripts/deploy-candle-sync.sh` (T-09-06)
    - `grep "parallelism=1" scripts/deploy-candle-sync.sh` (동시 실행 방지)
    - `--platform=linux/amd64` build (Cloud Run amd64)
    - `:latest` 별칭 — `grep ":latest" scripts/deploy-candle-sync.sh` 매치 (T-09-05 secret rotation 인프라)
  </acceptance_criteria>

  <done>deploy-candle-sync.sh 작성 + 3 Jobs + 2 Schedulers + run.invoker + OAuth + 자원 분리 모두 검증.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: smoke-candle-sync.sh (INV-1~6 + --check-* 플래그)</name>
  <files>scripts/smoke-candle-sync.sh</files>

  <read_first>
    - scripts/smoke-master-sync.sh (mirror 대상 — INV-1~6 패턴 + bash check function + Supabase REST count 패턴)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §6.4 INV-1~6 명세
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §6.1 결측 종목 SQL, §6.2 결측 일자 SQL
  </read_first>

  <action>
파일 `scripts/smoke-candle-sync.sh` 를 다음 내용으로 생성:

```bash
#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 개별 invariant fail 추적 (master-sync 패턴)

# ═══════════════════════════════════════════════════════════════
# smoke-candle-sync.sh
# Phase 9 (DATA-01) — candle-sync 배포 후 검증 (INV-1~6 + --check-* 플래그)
#
# Usage:
#   bash scripts/smoke-candle-sync.sh                       # INV-1~6 전체
#   bash scripts/smoke-candle-sync.sh --check-backfill      # 백필 검증 (row >= 4M, 005930 >= 1500)
#   bash scripts/smoke-candle-sync.sh --check-coverage      # SC #5 결측 종목 (RESEARCH §6.1) < 5%
#   bash scripts/smoke-candle-sync.sh --check-completeness  # SC #5 결측 일자 (RESEARCH §6.2) <= 4
#   bash scripts/smoke-candle-sync.sh --check-scheduler     # Scheduler 2종 ENABLED + cron
# ═══════════════════════════════════════════════════════════════

REGION=asia-northeast3
DAILY_JOB=gh-radar-candle-sync-daily
RECOVER_JOB=gh-radar-candle-sync-recover
BACKFILL_JOB=gh-radar-candle-sync-backfill
EOD_SCHED=gh-radar-candle-sync-eod
RECOVER_SCHED=gh-radar-candle-sync-recover

PASS=0
FAIL=0
declare -a FAILED_INVS

check() {
  local name="$1"; shift
  echo -n "  $name ... "
  if "$@" >/dev/null 2>&1; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
    FAILED_INVS+=("$name")
  fi
}

# ─── Flag dispatch ───
case "${1:-}" in
  --check-backfill)
    echo "Checking backfill — row count >= 4M, 005930 >= 1500"
    check "row count >= 4M" bash -c "
      : \${SUPABASE_URL:?SUPABASE_URL required}
      : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
      RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?select=code\" \
        -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Prefer: count=exact\" \
        -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
      TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
      echo \"row count: \$TOTAL\"
      [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 4000000 ]
    "
    check "005930 (삼성전자) row >= 1500" bash -c "
      RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?code=eq.005930&select=date\" \
        -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Prefer: count=exact\" \
        -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
      TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
      echo \"005930 row count: \$TOTAL\"
      [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 1500 ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-coverage)
    echo "Checking SC #5 결측 종목 (RESEARCH §6.1) — active 의 < 5%"
    # Postgres SQL via Supabase RPC 또는 raw SQL (psql)
    check "결측 종목 < 5%" bash -c "
      : \${SUPABASE_DB_URL:?SUPABASE_DB_URL required for SQL check}
      OUT=\$(psql \"\$SUPABASE_DB_URL\" -At -c \"
        WITH active AS (SELECT code FROM stocks WHERE is_delisted = false),
        recent_coverage AS (
          SELECT DISTINCT code FROM stock_daily_ohlcv
          WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        ),
        missing AS (
          SELECT a.code FROM active a
          LEFT JOIN recent_coverage rc ON a.code = rc.code
          WHERE rc.code IS NULL
        )
        SELECT
          ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM active),0) * 100, 2)
        FROM missing;
      \")
      echo \"missing_pct: \$OUT\"
      [ -n \"\$OUT\" ] && awk \"BEGIN{exit !(\$OUT < 5)}\"
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-completeness)
    echo "Checking SC #5 결측 일자 (RESEARCH §6.2) — incomplete_count <= 4"
    check "결측 일자 <= 4 (월)" bash -c "
      : \${SUPABASE_DB_URL:?SUPABASE_DB_URL required}
      OUT=\$(psql \"\$SUPABASE_DB_URL\" -At -c \"
        WITH active_count AS (SELECT COUNT(*) AS n FROM stocks WHERE is_delisted = false),
        daily_rows AS (
          SELECT date, COUNT(*) AS row_count FROM stock_daily_ohlcv
          WHERE date >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY date
        )
        SELECT COUNT(*) FROM daily_rows dr
        CROSS JOIN active_count ac
        WHERE dr.row_count < ac.n * 0.9;
      \")
      echo \"incomplete_count: \$OUT\"
      [ -n \"\$OUT\" ] && [ \"\$OUT\" -le 4 ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-scheduler)
    check "INV-6a $EOD_SCHED ENABLED + cron '30 17 * * 1-5'" bash -c "
      STATE=\$(gcloud scheduler jobs describe $EOD_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      SCHEDULE=\$(gcloud scheduler jobs describe $EOD_SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
      [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '30 17 * * 1-5' ]
    "
    check "INV-6b $RECOVER_SCHED ENABLED + cron '10 8 * * 1-5'" bash -c "
      STATE=\$(gcloud scheduler jobs describe $RECOVER_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      SCHEDULE=\$(gcloud scheduler jobs describe $RECOVER_SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
      [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '10 8 * * 1-5' ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;
esac

# ─── 기본 INV-1~6 ───
echo "Smoke testing candle-sync — INV-1~6"
echo ""

# INV-1: daily Job execute --wait exit 0
check "INV-1 daily Job execute --wait exit 0" \
  gcloud run jobs execute "$DAILY_JOB" --region="$REGION" --wait

# INV-2: 최근 5분 로그에 "runDaily complete" 또는 "KRX data not yet available" 1건 이상
check "INV-2 logs: runDaily complete OR KRX data not yet available" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$DAILY_JOB\"
    AND (jsonPayload.msg=\"runDaily complete\" OR jsonPayload.msg=\"KRX data not yet available\")
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -qE 'runDaily complete|KRX data not yet available'
"

# INV-3: 최근 5분 내 "candle-sync failed" OR "KRX 401" 0건
check "INV-3 logs: no candle-sync failed / 401" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$DAILY_JOB\"
    AND (jsonPayload.msg=\"candle-sync failed\" OR textPayload:\"KRX 401\")
  ' --freshness=5m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# INV-4: Supabase stock_daily_ohlcv 의 직전 영업일 row count > 활성 stocks × 0.9 (= ~2,520)
check "INV-4 stock_daily_ohlcv 직전 영업일 row count >= 2500" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  # 직전 영업일 = 가장 최근의 distinct date
  LATEST=\$(curl -fsS \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?select=date&order=date.desc&limit=1\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" 2>/dev/null \
    | grep -oE '\"date\":\"[0-9-]+\"' | head -1 | grep -oE '[0-9-]+')
  [ -n \"\$LATEST\" ] || exit 1
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?date=eq.\${LATEST}&select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"date=\$LATEST count=\$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 2500 ]
"

# INV-5: 005930 (삼성전자) 가 stock_daily_ohlcv 에 존재 + 행 >= 100
check "INV-5 005930 (삼성전자) row >= 100" bash -c "
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?code=eq.005930&select=date\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"005930 row count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 100 ]
"

# INV-6: Scheduler 2종 ENABLED
check "INV-6 schedulers ENABLED" bash -c "
  S1=\$(gcloud scheduler jobs describe $EOD_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
  S2=\$(gcloud scheduler jobs describe $RECOVER_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
  [ \"\$S1\" = ENABLED ] && [ \"\$S2\" = ENABLED ]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
```

실행 권한 부여:
```bash
chmod +x scripts/smoke-candle-sync.sh
bash -n scripts/smoke-candle-sync.sh
```
  </action>

  <verify>
    <automated>test -x scripts/smoke-candle-sync.sh && bash -n scripts/smoke-candle-sync.sh && grep -q "INV-1" scripts/smoke-candle-sync.sh && grep -q "INV-6" scripts/smoke-candle-sync.sh && grep -q "check-backfill" scripts/smoke-candle-sync.sh && grep -q "check-coverage" scripts/smoke-candle-sync.sh && grep -q "check-completeness" scripts/smoke-candle-sync.sh && grep -q "check-scheduler" scripts/smoke-candle-sync.sh</automated>
  </verify>

  <acceptance_criteria>
    - `test -x scripts/smoke-candle-sync.sh` (실행 권한)
    - `bash -n scripts/smoke-candle-sync.sh` exit 0
    - INV-1~6 모두 매치 — `grep -c "INV-[1-6]" scripts/smoke-candle-sync.sh` ≥ 6
    - 4개 플래그 매치 — `--check-backfill`, `--check-coverage`, `--check-completeness`, `--check-scheduler`
    - `gh-radar-candle-sync-daily` + `gh-radar-candle-sync-recover` (Job 이름) 매치
    - `30 17 \* \* 1-5` + `10 8 \* \* 1-5` (Scheduler cron) 매치
    - SC #5 SQL — `grep "missing_pct\\|incomplete_count" scripts/smoke-candle-sync.sh` 매치 (양쪽 모두)
    - 005930 (삼성전자) 회귀 마커 — `grep "005930" scripts/smoke-candle-sync.sh` 매치
    - 4M row count 검증 — `grep "4000000" scripts/smoke-candle-sync.sh` 매치 (--check-backfill)
    - `Prefer: count=exact` Supabase REST 패턴 — master-sync 와 동일
  </acceptance_criteria>

  <done>smoke-candle-sync.sh 작성 + INV-1~6 + 4개 플래그 모두 검증.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: ops/alert-candle-sync-{daily,recover}-failure.yaml (Cloud Monitoring policy)</name>
  <files>
    ops/alert-candle-sync-daily-failure.yaml,
    ops/alert-candle-sync-recover-failure.yaml
  </files>

  <read_first>
    - ops/alert-ingestion-failure.yaml (mirror 대상 — policy YAML 구조 + filter pattern)
    - .planning/phases/09-daily-candle-data/09-RESEARCH.md §6.3 (alert policy 2종 신설)
    - .planning/phases/09-daily-candle-data/09-CONTEXT.md §D-15 (모니터링)
  </read_first>

  <action>
ops/alert-ingestion-failure.yaml 의 구조를 그대로 mirror 하여 2개 YAML 작성. **${NOTIFICATION_CHANNEL_ID} placeholder 유지** — Plan 06 Task 4 의 사용자가 sed 치환.

1. **`ops/alert-candle-sync-daily-failure.yaml`**:
```yaml
displayName: gh-radar-candle-sync-daily-failure
documentation:
  content: |
    Cloud Run Job `gh-radar-candle-sync-daily` 의 실행 실패를 감지.
    DATA-01 SC #4 (rate-limit/재시도/fail-isolation) — daily mode 실패 시 즉시 알림.
    원인 추정: KRX 401 / MIN_EXPECTED 가드 위반 / Supabase 장애.
  mimeType: text/markdown
conditions:
  - displayName: candle-sync-daily failed execution count > 0
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "gh-radar-candle-sync-daily"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
      aggregations:
        - alignmentPeriod: 300s
          perSeriesAligner: ALIGN_SUM
combiner: OR
enabled: true
notificationChannels:
  - ${NOTIFICATION_CHANNEL_ID}
alertStrategy:
  autoClose: 1800s
```

2. **`ops/alert-candle-sync-recover-failure.yaml`**:
```yaml
displayName: gh-radar-candle-sync-recover-failure
documentation:
  content: |
    Cloud Run Job `gh-radar-candle-sync-recover` 의 실행 실패를 감지.
    DATA-01 SC #5 (정합성 모니터링) — recover mode 실패 시 즉시 알림.
    recover 는 best-effort 이지만 전체 실패(throw) 시에는 alert — findMissingDates SQL 장애 / Supabase 인증 만료 등.
  mimeType: text/markdown
conditions:
  - displayName: candle-sync-recover failed execution count > 0
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "gh-radar-candle-sync-recover"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
      aggregations:
        - alignmentPeriod: 300s
          perSeriesAligner: ALIGN_SUM
combiner: OR
enabled: true
notificationChannels:
  - ${NOTIFICATION_CHANNEL_ID}
alertStrategy:
  autoClose: 1800s
```

3. 정적 YAML 검증 (실제 적용은 Plan 06 Task 4):
```bash
# YAML syntax 검증 — node 또는 python
node -e "const yaml = require('yaml'); const fs = require('fs'); yaml.parse(fs.readFileSync('ops/alert-candle-sync-daily-failure.yaml','utf8')); yaml.parse(fs.readFileSync('ops/alert-candle-sync-recover-failure.yaml','utf8')); console.log('YAML OK')"
```
exit 0.
  </action>

  <verify>
    <automated>test -f ops/alert-candle-sync-daily-failure.yaml && test -f ops/alert-candle-sync-recover-failure.yaml && grep -q "gh-radar-candle-sync-daily" ops/alert-candle-sync-daily-failure.yaml && grep -q "gh-radar-candle-sync-recover" ops/alert-candle-sync-recover-failure.yaml && grep -q "NOTIFICATION_CHANNEL_ID" ops/alert-candle-sync-daily-failure.yaml && grep -q "NOTIFICATION_CHANNEL_ID" ops/alert-candle-sync-recover-failure.yaml</automated>
  </verify>

  <acceptance_criteria>
    - `test -f ops/alert-candle-sync-daily-failure.yaml` 존재
    - `test -f ops/alert-candle-sync-recover-failure.yaml` 존재
    - 각 파일에 `displayName: gh-radar-candle-sync-{daily|recover}-failure` 정확 매치
    - filter 에 `metric.labels.result = "failed"` 매치 (실패 감지)
    - filter 에 `resource.labels.job_name = "gh-radar-candle-sync-{daily|recover}"` 매치
    - `${NOTIFICATION_CHANNEL_ID}` placeholder 유지 (Plan 06 가 sed 치환)
    - `combiner: OR` + `enabled: true` + `alertStrategy.autoClose: 1800s`
    - YAML syntax PASS (parser 가 throw 안 함)
  </acceptance_criteria>

  <done>alert policy YAML 2종 작성. Plan 06 Task 4 가 channel 생성 + sed 치환 + `gcloud alpha monitoring policies create`.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloud Scheduler → Cloud Run Job | OAuth SA 인증 — invoker 권한 부재 시 미실행 |
| Cloud Run Job → Secret Manager | runtime SA 의 accessor 권한 부재 시 시작 실패 |
| Backfill Job 동시 실행 (수동) | 다른 mode Job 과 race 가능 (Job 분리 + idempotent UPSERT 로 mitigation) |
| Secret rotation | latest 별칭으로 양 워커 자동 동기화 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-04 | DENIAL OF SERVICE | Scheduler OAuth — Cloud Run Job invoker 권한 누락 | mitigate | deploy-candle-sync.sh 의 deploy_job() 안에서 `gcloud run jobs add-iam-policy-binding ... role=roles/run.invoker` — 3개 Job 각각에 binding. Scheduler 는 `--oauth-service-account-email` 사용 (OIDC 금지 — Phase 05.1 D-07 lesson 승계). 검증: smoke INV-6 의 Scheduler 상태 ENABLED. |
| T-09-05 | DENIAL OF SERVICE | Secret rotation — gh-radar-krx-auth-key 가 master-sync 와 공유 | accept | Secret Manager `:latest` 별칭 정책 — 양 워커 자동 동기화. 회전 시 manual run-book: 1) 신규 version 추가 + :latest 이동, 2) master-sync 다음 실행 (10 8) 으로 검증, 3) PASS 시 candle-sync 도 자동 적용. **Accept** 사유: 회전 빈도 낮음 + rollback 어려움은 키 추가 후 :latest 이동 취소로 회피 가능. |
| T-09-06 | DENIAL OF SERVICE / TAMPERING | 동시 실행 race — backfill 1회 + daily Scheduler 동시 실행 | mitigate | RESEARCH §5.1 결정 — **Job 3개 분리** (`gh-radar-candle-sync-{daily|recover|backfill}`). 각 Job 의 `--parallelism=1 --tasks=1 --max-retries=0`. Job 리소스가 서로 다르므로 동시 실행 가능하지만 동일 일자 UPSERT 는 PostgreSQL row-level lock + ON CONFLICT DO UPDATE 가 atomic. backfill 실행 전 사용자가 다른 Scheduler pause (manual run-book — Plan 06 Task 3 명시). |
| T-09-04.1 | INFORMATION DISCLOSURE | runtime SA 권한 과다 | mitigate | gh-radar-candle-sync-sa 는 KRX + Supabase 시크릿 accessor 만 — 최소권한. KIS 시크릿 미바인딩 (의도적). |
| T-09-06.1 | DENIAL OF SERVICE | alert policy 누락 | mitigate | Cloud Monitoring policy 2종 신설 (daily + recover) — Job 실패 1건/5분 → 이메일. backfill 은 수동 실행이므로 alert 불필요 (사용자가 실시간 모니터). |

</threat_model>

<verification>
- 3개 bash 스크립트 + 2개 YAML alert policy = 5 파일 생성
- 각 스크립트 `bash -n` syntax PASS
- 실행 권한 부여 (chmod +x)
- YAML parser PASS
- 본 plan 은 **스크립트 작성만** — 실제 GCP 실행은 Plan 06
- Plan 06 Task 2 ([BLOCKING] setup-iam) + Task 3 ([BLOCKING] deploy) + Task 4 ([BLOCKING] alert) 가 본 산출물 실행
</verification>

<success_criteria>
- setup-candle-sync-iam.sh — runtime SA + secret accessor (D-13)
- deploy-candle-sync.sh — 3 Jobs (mode 별 task-timeout/memory) + 2 Schedulers (D-09 cron) + run.invoker (T-09-04)
- smoke-candle-sync.sh — INV-1~6 + --check-* 4개 플래그
- alert policy 2종 (T-09-04 + SC #5)
- 모든 스크립트 idempotent (describe || create 패턴)
</success_criteria>

<output>
After completion, create `.planning/phases/09-daily-candle-data/09-05-SUMMARY.md`
</output>
</content>
</invoke>
