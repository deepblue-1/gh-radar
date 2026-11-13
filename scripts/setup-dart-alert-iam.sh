#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 43 Plan 07 — dart-alert(공시 텔레그램 알림) IAM 세팅 (setup-kis-news-sync-iam.sh 꼴)
#
# 실행 주체: 사용자가 직접(IAM · Secret 쓰기는 사용자 터미널에서만)
#   ! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh
# 그다음 값 넣기:
#   ! bash scripts/setup-dart-alert-secrets.sh
#
# 설정 대상 (모두 멱등 — 다시 돌려도 안전):
#   1. SA 생성: gh-radar-dart-alert-sa (수집기 Job 전용)
#   2. Secret 껍데기 4개: gh-radar-opendart-key(키 1) · gh-radar-opendart-key-2(키 2 · 261113-rn7) ·
#      gh-radar-telegram-bot-token · gh-radar-telegram-chat-id
#      — 값 없이 만든다. 값은 setup-dart-alert-secrets.sh 가 넣는다(이 스크립트는 값을 받지도 묻지도 않는다).
#   3. Secret Accessor 바인딩 5건(리소스 단위 — 프로젝트 단위 금지):
#      dart-alert SA → gh-radar-opendart-key · gh-radar-opendart-key-2 · gh-radar-telegram-bot-token ·
#                      gh-radar-telegram-chat-id · gh-radar-supabase-service-role
#
# server SA 에는 OpenDART · 텔레그램 Secret 권한을 주지 않는다 — 공식 API 운영 기준 ③(호출량은 사용자 수와 독립):
#   OpenDART 호출과 텔레그램 송신은 이 수집기 하나뿐이다.
# Scheduler SA(gh-radar-scheduler-sa) → Job invoker 바인딩은 Job 이 생긴 뒤 deploy-dart-alert.sh 가 한다.
# ═══════════════════════════════════════════════════════════════

case "${1:-}" in
  -h | --help)
    echo "사용: ! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh   (SA · Secret 껍데기 4개 · Accessor 5건 · 값은 넣지 않음)"
    exit 0
    ;;
  "") ;;
  *)
    echo "ERROR: 인자를 받지 않는다 (--help 참고)" >&2
    exit 1
    ;;
esac

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh" >&2
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
DART_SA_NAME="gh-radar-dart-alert-sa"
DART_SA="${DART_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
DART_KEY_SECRET="gh-radar-opendart-key"
DART_KEY2_SECRET="gh-radar-opendart-key-2"
TG_TOKEN_SECRET="gh-radar-telegram-bot-token"
TG_CHAT_SECRET="gh-radar-telegram-chat-id"
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
  monitoring.googleapis.com \
  logging.googleapis.com \
  --project="$EXPECTED_PROJECT"
echo "✓ APIs enabled"

# ═══════════════════════════════════════════════════════════════
# Section 4: 수집기 전용 SA (idempotent)
# ═══════════════════════════════════════════════════════════════
if gcloud iam service-accounts describe "$DART_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SA exists: $DART_SA_NAME"
else
  gcloud iam service-accounts create "$DART_SA_NAME" \
    --display-name="gh-radar dart-alert (OpenDART list + Telegram + Supabase only)" \
    --project="$EXPECTED_PROJECT"
  echo "✓ SA created: $DART_SA_NAME"
fi

# ═══════════════════════════════════════════════════════════════
# Section 5: Secret 껍데기 (idempotent · 값 없음)
#   값은 setup-dart-alert-secrets.sh 가 stdin(--data-file=-)으로만 넣는다.
# ═══════════════════════════════════════════════════════════════
for SECRET_NAME in "$DART_KEY_SECRET" "$DART_KEY2_SECRET" "$TG_TOKEN_SECRET" "$TG_CHAT_SECRET"; do
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
# Section 6: Secret Accessor 바인딩 — 5건 (리소스 단위)
# ═══════════════════════════════════════════════════════════════
bind_accessor() {
  local secret="$1" member="$2"
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$EXPECTED_PROJECT" >/dev/null
  echo "  ✓ bound: $secret → $member"
}

echo "▶ binding Secret Accessor role — 5 bindings..."
bind_accessor "$DART_KEY_SECRET" "$DART_SA"
bind_accessor "$DART_KEY2_SECRET" "$DART_SA"
bind_accessor "$TG_TOKEN_SECRET" "$DART_SA"
bind_accessor "$TG_CHAT_SECRET" "$DART_SA"
bind_accessor "$SUPABASE_SECRET" "$DART_SA"

echo ""
echo "✅ setup-dart-alert-iam.sh complete"
echo "   SA: $DART_SA"
echo "   Secrets (껍데기 4개): $DART_KEY_SECRET, $DART_KEY2_SECRET, $TG_TOKEN_SECRET, $TG_CHAT_SECRET"
echo "Next: ! bash scripts/setup-dart-alert-secrets.sh   (값 넣기 — 사용자 직접)"
echo "      bash scripts/deploy-dart-alert.sh            (GCP_PROJECT_ID · SUPABASE_URL 필요)"
