#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-comovement-sync-iam.sh
# Phase 11 (COMV-01) — co-movement-sync 워커의 IAM + secret accessor 설정
#
# candle-sync 1:1 복제 + 변경점 (11-04-PLAN.md / 11-RESEARCH §워커/배포):
#   - 신규 runtime SA gh-radar-comovement-sync-sa (candle-sync-sa → comovement-sync-sa)
#   - scheduler SA gh-radar-scheduler-sa 재사용 (Phase 05.1)
#   - KRX secret 제거 (T-11-16 최소권한): gh-radar-supabase-service-role accessor 1개만.
#     이 워커는 rebuild_comovement RPC(자체 DB 집계)만 호출 → 외부 API 키 불요.
# ═══════════════════════════════════════════════════════════════

# Section 1: gcloud 가드 (candle-sync 미러)
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

# Section 4: 신규 comovement-sync 전용 SA (idempotent create)
COMOVEMENT_SYNC_SA_NAME=gh-radar-comovement-sync-sa
COMOVEMENT_SYNC_SA_EMAIL="${COMOVEMENT_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$COMOVEMENT_SYNC_SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $COMOVEMENT_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$COMOVEMENT_SYNC_SA_NAME" \
    --display-name="gh-radar co-movement-sync (rebuild_comovement RPC, Phase 11 COMV-01)"
  echo "✓ SA created: $COMOVEMENT_SYNC_SA_NAME"
fi

# Section 5: 기존 secret 존재 확인 — Supabase service-role 1개만 (KRX 제거, T-11-16)
for SECRET in gh-radar-supabase-service-role; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "✓ secret exists (reused): $SECRET"
  else
    echo "ERROR: secret '$SECRET' not found — Phase 05.1 setup-ingestion-iam.sh 가 먼저 실행되어야 함" >&2
    exit 1
  fi
done

# Section 6: Secret accessor 바인딩 — comovement-sync SA 에 Supabase 시크릿만 부여
# (KRX accessor 바인딩 없음 — 이 워커는 외부 API 키 불요. T-11-16 최소권한)
gcloud secrets add-iam-policy-binding gh-radar-supabase-service-role \
  --member="serviceAccount:${COMOVEMENT_SYNC_SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: gh-radar-supabase-service-role → $COMOVEMENT_SYNC_SA_NAME"

echo ""
echo "✅ setup-comovement-sync-iam.sh complete"
echo "Next: bash scripts/deploy-comovement-sync.sh"
