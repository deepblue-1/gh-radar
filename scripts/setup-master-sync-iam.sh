#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증 (setup-ingestion-iam.sh 미러)
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: export GCP_PROJECT_ID=<your-project-id>" >&2
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

# ═══════════════════════════════════════════════════════════════
# Section 2: 필수 입력 env 검증 — KRX_AUTH_KEY 만 신규
#   KIS/SUPABASE secret 은 setup-ingestion-iam.sh 에서 이미 등록됨
# ═══════════════════════════════════════════════════════════════
: "${KRX_AUTH_KEY:?KRX_AUTH_KEY must be set}"

echo "✓ required env vars present (KRX_AUTH_KEY)"

# ═══════════════════════════════════════════════════════════════
# Section 3: API enable (idempotent — enabled 이면 no-op)
# ═══════════════════════════════════════════════════════════════
echo "▶ enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com

echo "✓ APIs enabled"

# ═══════════════════════════════════════════════════════════════
# Section 4: SA 존재 확인 (setup-ingestion-iam.sh 에서 이미 생성됨)
# ═══════════════════════════════════════════════════════════════
for SA in gh-radar-scheduler-sa gh-radar-ingestion-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "✓ SA exists: $SA"
  else
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-ingestion-iam.sh first" >&2
    exit 1
  fi
done

# ═══════════════════════════════════════════════════════════════
# Section 5: 기존 secret 존재 확인 (idempotent 가드)
# ═══════════════════════════════════════════════════════════════
for SECRET in gh-radar-kis-app-key gh-radar-kis-app-secret \
              gh-radar-kis-account-number gh-radar-supabase-service-role; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "✓ secret exists (reused): $SECRET"
  else
    echo "WARN: secret '$SECRET' not found — setup-ingestion-iam.sh 가 먼저 실행되어야 합니다" >&2
  fi
done

# ═══════════════════════════════════════════════════════════════
# Section 6: KRX Secret 생성/갱신 (신규)
#   stdin(`--data-file=-`)로만 값 주입 → 프로세스 리스트 노출 차단 (T-06.1-06-01)
# ═══════════════════════════════════════════════════════════════
create_or_update_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=automatic
    echo "✓ secret created: $name"
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  echo "✓ secret version added: $name"
}

create_or_update_secret gh-radar-krx-auth-key "$KRX_AUTH_KEY"

# ═══════════════════════════════════════════════════════════════
# Section 7: Secret accessor 바인딩 (런타임 SA → KRX secret)
#   기존 4개 secret 은 이미 바인딩됨 — KRX 만 신규 추가
# ═══════════════════════════════════════════════════════════════
INGESTION_SA="gh-radar-ingestion-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

gcloud secrets add-iam-policy-binding gh-radar-krx-auth-key \
  --member="serviceAccount:${INGESTION_SA}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: gh-radar-krx-auth-key → gh-radar-ingestion-sa"

echo ""
echo "✅ setup-master-sync-iam.sh complete"
echo "Next: bash scripts/deploy-master-sync.sh"
