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
