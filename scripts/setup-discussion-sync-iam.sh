#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 08 Plan 06 — discussion-sync IAM 세팅 (setup-news-sync-iam.sh 1:1 미러 + PIVOT)
#
# 설정 대상:
#   1. SA 생성: gh-radar-discussion-sync-sa (Discussion Sync Worker)
#   2. Secret 생성/확인: gh-radar-brightdata-api-key  (PIVOT — Bright Data Web Unlocker)
#      - 값은 stdin (--data-file=-) 으로만 주입 (T-01 mitigation: shell history 노출 차단).
#      - 본 스크립트가 값을 받지는 않으며, 이미 존재하면 reuse. 신규 생성 시에는 콘솔이
#        "Enter value..." 로 input 대기 → BRIGHTDATA_API_KEY 를 stdin 입력.
#   3. Accessor 바인딩 3건:
#      - discussion-sync-sa → gh-radar-supabase-service-role  (DB write)
#      - discussion-sync-sa → gh-radar-brightdata-api-key     (Bright Data POST)
#      - server-sa          → gh-radar-brightdata-api-key     (server POST /refresh)
#   4. SERVER_SA env override 허용 — 기본값은 이 프로젝트 server Cloud Run service 가
#      사용 중인 default compute SA (gh-radar-server-sa 미생성 환경 호환)
#
# 참조: scripts/setup-news-sync-iam.sh (Phase 7) — 본 파일은 그 구조의 직접 미러.
# PIVOT: 08-POC-PIVOT.md — Secret 이름 gh-radar-proxy-api-key → gh-radar-brightdata-api-key.
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증
# ═══════════════════════════════════════════════════════════════
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

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수 선언
# ═══════════════════════════════════════════════════════════════
DISCUSSION_SYNC_SA_NAME="gh-radar-discussion-sync-sa"
DISCUSSION_SYNC_SA="${DISCUSSION_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

# server Cloud Run service 가 사용 중인 SA 자동 감지 (Phase 7 동일 패턴)
detect_server_sa() {
  local detected
  detected=$(gcloud run services describe gh-radar-server \
    --region=asia-northeast3 \
    --format='value(spec.template.spec.serviceAccountName)' \
    --project="$EXPECTED_PROJECT" 2>/dev/null || true)
  if [[ -n "$detected" ]]; then
    echo "$detected"
    return
  fi
  local pn
  pn=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
  echo "${pn}-compute@developer.gserviceaccount.com"
}

SERVER_SA="${SERVER_SA:-$(detect_server_sa)}"
echo "✓ SERVER_SA resolved: $SERVER_SA"
echo "  (env override: SERVER_SA=<email> bash scripts/setup-discussion-sync-iam.sh)"

# Bright Data Web Unlocker API key Secret 이름 (PIVOT: gh-radar-brightdata-api-key)
BRIGHTDATA_SECRET="gh-radar-brightdata-api-key"
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
  cloudbuild.googleapis.com \
  --project="$EXPECTED_PROJECT"

echo "✓ APIs enabled"

# ═══════════════════════════════════════════════════════════════
# Section 4: discussion-sync 전용 SA 생성 (idempotent)
# ═══════════════════════════════════════════════════════════════
if gcloud iam service-accounts describe "$DISCUSSION_SYNC_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SA exists: $DISCUSSION_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$DISCUSSION_SYNC_SA_NAME" \
    --display-name="gh-radar discussion-sync (Bright Data + Supabase only)" \
    --project="$EXPECTED_PROJECT"
  echo "✓ SA created: $DISCUSSION_SYNC_SA_NAME"
fi

# SERVER_SA 존재 확인
if [[ "$SERVER_SA" == *"@developer.gserviceaccount.com" ]]; then
  echo "✓ SERVER_SA is GCP-managed default compute SA (always exists)"
elif gcloud iam service-accounts describe "$SERVER_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SERVER_SA exists: $SERVER_SA"
else
  echo "ERROR: SERVER_SA '$SERVER_SA' not found. Verify gh-radar-server Cloud Run revision." >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Section 5: Bright Data API key Secret 생성 (idempotent)
#   stdin(--data-file=-) 로만 값 주입 — T-01 mitigation
#   이미 존재하면 값 변경 없이 reuse (불필요한 version add 방지)
# ═══════════════════════════════════════════════════════════════
if gcloud secrets describe "$BRIGHTDATA_SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "  SKIP: secret '$BRIGHTDATA_SECRET' already exists (reused)"
else
  echo "  CREATING: '$BRIGHTDATA_SECRET' (Bright Data Web Unlocker API key — stdin 입력 대기)"
  gcloud secrets create "$BRIGHTDATA_SECRET" \
    --replication-policy=automatic \
    --project="$EXPECTED_PROJECT"
  echo "  Enter value for $BRIGHTDATA_SECRET (Ctrl-D to finish):"
  gcloud secrets versions add "$BRIGHTDATA_SECRET" --data-file=- --project="$EXPECTED_PROJECT"
fi

# Supabase Secret 존재 확인 (선행 조건 — Phase 5.x 에서 이미 등록되어 있어야 함)
if ! gcloud secrets describe "$SUPABASE_SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "ERROR: Secret '$SUPABASE_SECRET' not found. Run Phase 5 setup first." >&2
  exit 1
fi
echo "✓ Supabase secret exists: $SUPABASE_SECRET"

# ═══════════════════════════════════════════════════════════════
# Section 6: Secret Accessor 바인딩 — 총 3건
#   discussion-sync SA → 2건 (supabase-service-role + brightdata-api-key)
#   server SA          → 1건 (brightdata-api-key) — server POST /refresh 경로
# ═══════════════════════════════════════════════════════════════
bind_accessor() {
  local secret="$1" member="$2"
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$EXPECTED_PROJECT" >/dev/null
  echo "  ✓ bound: $secret → $member"
}

echo "▶ binding Secret Accessor role — 3 bindings total..."

# (1) discussion-sync SA → supabase-service-role
bind_accessor "$SUPABASE_SECRET" "$DISCUSSION_SYNC_SA"

# (2) discussion-sync SA → brightdata-api-key
bind_accessor "$BRIGHTDATA_SECRET" "$DISCUSSION_SYNC_SA"

# (3) server SA → brightdata-api-key (POST /refresh 경로용)
bind_accessor "$BRIGHTDATA_SECRET" "$SERVER_SA"

echo ""
echo "✅ setup-discussion-sync-iam.sh complete"
echo "   SA: $DISCUSSION_SYNC_SA"
echo "   SERVER_SA: $SERVER_SA"
echo "   Secrets: $BRIGHTDATA_SECRET, $SUPABASE_SECRET (reused)"
echo "Next: bash scripts/deploy-discussion-sync.sh"
