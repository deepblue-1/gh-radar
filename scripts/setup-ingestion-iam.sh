#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증 (deploy-server.sh 미러)
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
# Section 2: 필수 입력 env 검증 — secret 값은 env로만 주입(하드코딩 금지)
# ═══════════════════════════════════════════════════════════════
: "${KIS_APP_KEY:?KIS_APP_KEY must be set}"
: "${KIS_APP_SECRET:?KIS_APP_SECRET must be set}"
: "${KIS_ACCOUNT_NUMBER:?KIS_ACCOUNT_NUMBER must be set (format XXXXXXXX-XX)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set}"

echo "✓ required env vars present"

# ═══════════════════════════════════════════════════════════════
# Section 3: API enable (idempotent — enabled면 no-op)
# ═══════════════════════════════════════════════════════════════
echo "▶ enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  monitoring.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com

echo "✓ APIs enabled"

# ═══════════════════════════════════════════════════════════════
# Section 4: gcloud alpha/beta 컴포넌트 설치 (monitoring policies용)
# ═══════════════════════════════════════════════════════════════
gcloud alpha --help >/dev/null 2>&1 || gcloud components install alpha -q
gcloud beta  --help >/dev/null 2>&1 || gcloud components install beta  -q

# ═══════════════════════════════════════════════════════════════
# Section 5: Service Account 2종 생성 (D-07, D-11 — SA 분리 원칙)
# ═══════════════════════════════════════════════════════════════
for SA in gh-radar-scheduler-sa gh-radar-ingestion-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "✓ SA exists: $SA"
  else
    gcloud iam service-accounts create "$SA" --display-name="gh-radar ${SA}"
    echo "✓ SA created: $SA"
  fi
done

# ═══════════════════════════════════════════════════════════════
# Section 6: Secret Manager 4종 (D-09)
#   - stdin(`--data-file=-`)로만 값 주입 → 프로세스 리스트 노출 차단
#   - --replication-policy=automatic 명시 (Pitfall 8)
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

create_or_update_secret gh-radar-kis-app-key        "$KIS_APP_KEY"
create_or_update_secret gh-radar-kis-app-secret     "$KIS_APP_SECRET"
create_or_update_secret gh-radar-kis-account-number "$KIS_ACCOUNT_NUMBER"

# gh-radar-supabase-service-role: Phase 2에서 이미 생성된 경우 재사용.
if gcloud secrets describe gh-radar-supabase-service-role >/dev/null 2>&1; then
  echo "✓ secret reused (Phase 2): gh-radar-supabase-service-role"
else
  create_or_update_secret gh-radar-supabase-service-role "$SUPABASE_SERVICE_ROLE_KEY"
fi

# ═══════════════════════════════════════════════════════════════
# Section 7: Secret accessor 바인딩 (런타임 SA → 4개 secret)
#   주의: Cloud Run Job invoker 바인딩은 Job이 존재해야 가능 → deploy-ingestion.sh §5.5에서 처리
# ═══════════════════════════════════════════════════════════════
INGESTION_SA="gh-radar-ingestion-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

for SECRET in gh-radar-kis-app-key gh-radar-kis-app-secret \
              gh-radar-kis-account-number gh-radar-supabase-service-role; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${INGESTION_SA}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "✓ secretAccessor bound: $SECRET"
done

echo ""
echo "✅ setup-ingestion-iam.sh complete"
echo "Next: bash scripts/deploy-ingestion.sh"
