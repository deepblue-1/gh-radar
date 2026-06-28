#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-limit-up-sync-iam.sh
# Phase 12 (LIMIT-01) — limit-up-sync 워커의 IAM + secret accessor 설정
#
# Phase 11 동조 워커 선례 1:1 복제 + 변경점 (12-04-PLAN.md / 12-CONTEXT D-19/D-20):
#   - 신규 runtime SA gh-radar-limit-up-sync-sa (동조 워커 SA → limit-up-sync-sa)
#   - scheduler SA gh-radar-scheduler-sa 재사용 (Phase 05.1)
#   - 외부 API 키 제거 (T-12-04-02 최소권한): gh-radar-supabase-service-role accessor 1개만.
#     이 워커는 rebuild_limit_up RPC(자체 DB 집계)만 호출 → 외부 API 키 불요.
# ═══════════════════════════════════════════════════════════════

# Section 1: gcloud 가드 (Phase 11 동조 워커 선례 미러)
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
  echo "Hint: gcloud config configurations activate $EXPECTED_CONFIG" >&2
  exit 1
fi

if [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: active project is '$ACTIVE_PROJECT', expected '$EXPECTED_PROJECT'" >&2
  echo "Hint: gcloud config set project $EXPECTED_PROJECT" >&2
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

# Section 4: 신규 limit-up-sync 전용 SA (idempotent create)
LIMIT_UP_SYNC_SA_NAME=gh-radar-limit-up-sync-sa
LIMIT_UP_SYNC_SA_EMAIL="${LIMIT_UP_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$LIMIT_UP_SYNC_SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $LIMIT_UP_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$LIMIT_UP_SYNC_SA_NAME" \
    --display-name="gh-radar limit-up-sync (rebuild_limit_up RPC, Phase 12 LIMIT-01)"
  echo "✓ SA created: $LIMIT_UP_SYNC_SA_NAME"
fi

# Section 5: 기존 secret 존재 확인 — Supabase service-role 1개만 (외부 API 키 제거, T-12-04-02)
for SECRET in gh-radar-supabase-service-role; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "✓ secret exists (reused): $SECRET"
  else
    echo "ERROR: secret '$SECRET' not found — Phase 05.1 setup-ingestion-iam.sh 가 먼저 실행되어야 함" >&2
    exit 1
  fi
done

# Section 6: Secret accessor 바인딩 — limit-up-sync SA 에 Supabase 시크릿만 부여
# (외부 API 키 accessor 바인딩 없음 — 이 워커는 외부 API 키 불요. T-12-04-02 최소권한)
gcloud secrets add-iam-policy-binding gh-radar-supabase-service-role \
  --member="serviceAccount:${LIMIT_UP_SYNC_SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: gh-radar-supabase-service-role → $LIMIT_UP_SYNC_SA_NAME"

echo ""
echo "✅ setup-limit-up-sync-iam.sh complete"
echo "Next: bash scripts/deploy-limit-up-sync.sh"
