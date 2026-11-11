#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 41 Plan 02 — kis-news-sync(한투 뉴스·공시 수집기) IAM 세팅 (setup-news-sync-iam.sh 꼴)
#
# 실행 주체: 41-09 에서 사용자가 직접
#   ! GCP_PROJECT_ID=gh-radar bash scripts/setup-kis-news-sync-iam.sh
# 그다음 값 넣기:
#   ! bash scripts/setup-kis-secrets.sh
#
# 설정 대상 (모두 멱등 — 다시 돌려도 안전):
#   1. SA 생성: gh-radar-kis-news-sync-sa (수집기 Job 전용)
#   2. Secret 껍데기: gh-radar-kis-appkey · gh-radar-kis-appsecret
#      — 값 없이 만든다. 값은 setup-kis-secrets.sh 가 넣는다(이 스크립트는 값을 받지도 묻지도 않는다).
#   3. Secret Accessor 바인딩 3건(리소스 단위 — 프로젝트 단위 금지):
#      kis-news-sync SA → gh-radar-kis-appkey · gh-radar-kis-appsecret · gh-radar-supabase-service-role
#
# server SA 에는 한투 Secret 권한을 주지 않는다 — 공식 API 운영 기준 ③(호출량은 사용자 수와 독립):
#   server 는 한투를 부르지 않고 DB(stock_feed_by_codes)만 읽는다. 한투 호출은 이 수집기 하나뿐이다.
# Scheduler SA(gh-radar-scheduler-sa) → Job invoker 바인딩은 Job 이 생긴 뒤 deploy-kis-news-sync.sh 가 한다.
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: GCP_PROJECT_ID=gh-radar bash scripts/setup-kis-news-sync-iam.sh" >&2
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
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
KIS_SA_NAME="gh-radar-kis-news-sync-sa"
KIS_SA="${KIS_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
KIS_APPKEY_SECRET="gh-radar-kis-appkey"
KIS_APPSECRET_SECRET="gh-radar-kis-appsecret"
SUPABASE_SECRET="gh-radar-supabase-service-role"

# ═══════════════════════════════════════════════════════════════
# Section 3: API enable (idempotent)
# ═══════════════════════════════════════════════════════════════
echo "▶ enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  --project="$EXPECTED_PROJECT"
echo "✓ APIs enabled"

# ═══════════════════════════════════════════════════════════════
# Section 4: 수집기 전용 SA (idempotent)
# ═══════════════════════════════════════════════════════════════
if gcloud iam service-accounts describe "$KIS_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SA exists: $KIS_SA_NAME"
else
  gcloud iam service-accounts create "$KIS_SA_NAME" \
    --display-name="gh-radar kis-news-sync (KIS news-title + Supabase only)" \
    --project="$EXPECTED_PROJECT"
  echo "✓ SA created: $KIS_SA_NAME"
fi

# ═══════════════════════════════════════════════════════════════
# Section 5: Secret 껍데기 (idempotent · 값 없음)
#   값은 setup-kis-secrets.sh 가 stdin(--data-file=-)으로만 넣는다.
# ═══════════════════════════════════════════════════════════════
for SECRET_NAME in "$KIS_APPKEY_SECRET" "$KIS_APPSECRET_SECRET"; do
  if gcloud secrets describe "$SECRET_NAME" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "  SKIP: secret '$SECRET_NAME' already exists"
  else
    gcloud secrets create "$SECRET_NAME" \
      --replication-policy=automatic \
      --project="$EXPECTED_PROJECT" >/dev/null
    echo "  ✓ created (empty): $SECRET_NAME"
  fi
done

if ! gcloud secrets describe "$SUPABASE_SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "ERROR: Secret '$SUPABASE_SECRET' not found (다른 워커들이 쓰는 기존 Secret — 프로젝트 확인)" >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Section 6: Secret Accessor 바인딩 — 3건 (리소스 단위)
# ═══════════════════════════════════════════════════════════════
bind_accessor() {
  local secret="$1" member="$2"
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$EXPECTED_PROJECT" >/dev/null
  echo "  ✓ bound: $secret → $member"
}

echo "▶ binding Secret Accessor role — 3 bindings..."
bind_accessor "$KIS_APPKEY_SECRET" "$KIS_SA"
bind_accessor "$KIS_APPSECRET_SECRET" "$KIS_SA"
bind_accessor "$SUPABASE_SECRET" "$KIS_SA"

echo ""
echo "✅ setup-kis-news-sync-iam.sh complete"
echo "   SA: $KIS_SA"
echo "   Secrets (껍데기): $KIS_APPKEY_SECRET, $KIS_APPSECRET_SECRET"
echo "Next: ! bash scripts/setup-kis-secrets.sh   (값 넣기 — 사용자 직접)"
echo "      bash scripts/deploy-kis-news-sync.sh  (GCP_PROJECT_ID · SUPABASE_URL 필요)"
