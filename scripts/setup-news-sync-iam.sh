#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 07 Plan 06 — news-sync IAM 세팅 (setup-master-sync-iam.sh 미러)
#
# 설정 대상:
#   1. SA 생성: gh-radar-news-sync-sa (News Sync Worker)
#   2. Secret 생성/확인: NAVER_CLIENT_ID + NAVER_CLIENT_SECRET
#      (Naver Developer 포털 발급 — stdin 주입으로 프로세스 리스트/shell history 노출 방어)
#      ※ 플랜 원본은 'gh-radar-naver-client-id' / 'gh-radar-naver-client-secret' 명명을
#        권장했으나 이 프로젝트 GCP 에는 이미 'NAVER_CLIENT_ID' / 'NAVER_CLIENT_SECRET' 로
#        등록돼 있어 재사용 (중복 리소스 생성 회피, D1 deviation).
#   3. Accessor 바인딩 5건:
#      - news-sync-sa → supabase-service-role + NAVER_CLIENT_ID + NAVER_CLIENT_SECRET
#      - server-sa    → NAVER_CLIENT_ID + NAVER_CLIENT_SECRET (server POST /refresh 용)
#   4. SERVER_SA env override 허용 — 기본값은 이 프로젝트 server Cloud Run service 가
#      사용 중인 default compute SA (gh-radar-server-sa 는 이 프로젝트에 존재하지 않음, D2).
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증
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
# Section 2: 변수 선언
#   NEWS_SYNC_SA: news-sync 전용 워커 SA
#   SERVER_SA: server Cloud Run service 가 사용하는 SA (env override 허용)
#
#   SERVER_SA 기본값: 이 프로젝트는 server 에 custom SA(gh-radar-server-sa)를 붙이지 않고
#   project default compute SA 를 사용한다. 플랜 문구는 'gh-radar-server-sa@...' 를
#   예시로 들었지만 실제 Cloud Run revision 의 serviceAccountName 을 따르는 것이 옳음.
#   (D2 deviation — plan default 대신 실제 Cloud Run 값)
# ═══════════════════════════════════════════════════════════════
NEWS_SYNC_SA_NAME="gh-radar-news-sync-sa"
NEWS_SYNC_SA="${NEWS_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

# 실제 gh-radar-server Cloud Run service 의 SA 를 자동 감지 + 기본값 세팅
# 만약 감지 실패하거나 service 가 아직 없다면 fallback 으로 project default compute SA 사용
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
  # Fallback: default compute SA
  local pn
  pn=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
  echo "${pn}-compute@developer.gserviceaccount.com"
}

SERVER_SA="${SERVER_SA:-$(detect_server_sa)}"
echo "✓ SERVER_SA resolved: $SERVER_SA"
echo "  (env override: SERVER_SA=<email> bash scripts/setup-news-sync-iam.sh)"

# Naver Secret 이름 — 플랜 원본은 'gh-radar-naver-client-id' / 'gh-radar-naver-client-secret'
# 였으나 현재 프로젝트에는 이미 축약명 'NAVER_CLIENT_ID' / 'NAVER_CLIENT_SECRET' 로 등록됨.
# 아래 배열에 선언해 일관 사용 (D1 deviation).
# 대안 plan-spec 명: gh-radar-naver-client-id, gh-radar-naver-client-secret
NAVER_ID_SECRET="NAVER_CLIENT_ID"
NAVER_SECRET_SECRET="NAVER_CLIENT_SECRET"

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
# Section 4: news-sync 전용 SA 생성 (idempotent)
# ═══════════════════════════════════════════════════════════════
if gcloud iam service-accounts describe "$NEWS_SYNC_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SA exists: $NEWS_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$NEWS_SYNC_SA_NAME" \
    --display-name="gh-radar news-sync (Naver Search + Supabase only)" \
    --project="$EXPECTED_PROJECT"
  echo "✓ SA created: $NEWS_SYNC_SA_NAME"
fi

# SERVER_SA 는 이미 존재한다고 가정 (Cloud Run service 가 사용 중). 간단 존재 체크만:
if [[ "$SERVER_SA" == *"@developer.gserviceaccount.com" ]]; then
  echo "✓ SERVER_SA is GCP-managed default compute SA (always exists)"
elif gcloud iam service-accounts describe "$SERVER_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SERVER_SA exists: $SERVER_SA"
else
  echo "ERROR: SERVER_SA '$SERVER_SA' not found. Verify gh-radar-server Cloud Run revision." >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Section 5: Naver Search API Secret 생성 (idempotent)
#   stdin(`--data-file=-`)로만 값 주입 → T-01 mitigation (shell history 노출 차단)
#
#   이미 등록된 경우 값 변경 없이 재사용 — 불필요한 version add 방지.
#   (원본 플랜 스펙은 gh-radar-naver-client-id / gh-radar-naver-client-secret)
# ═══════════════════════════════════════════════════════════════
for SECRET_NAME in "$NAVER_ID_SECRET" "$NAVER_SECRET_SECRET"; do
  if gcloud secrets describe "$SECRET_NAME" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "  SKIP: secret '$SECRET_NAME' already exists (reused)"
  else
    echo "  CREATING: '$SECRET_NAME' (Naver Developer 포털 발급 값 stdin 입력 대기)"
    gcloud secrets create "$SECRET_NAME" \
      --replication-policy=automatic \
      --project="$EXPECTED_PROJECT"
    echo "  Enter value for $SECRET_NAME (Ctrl-D to finish):"
    gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$EXPECTED_PROJECT"
  fi
done

# ═══════════════════════════════════════════════════════════════
# Section 6: Secret Accessor 바인딩 — 총 5건
#   news-sync SA → 3건 (supabase-service-role + NAVER_CLIENT_ID + NAVER_CLIENT_SECRET)
#   server SA    → 2건 (NAVER_CLIENT_ID + NAVER_CLIENT_SECRET)
#   (plan 참조 명: gh-radar-naver-client-id / gh-radar-naver-client-secret — D1 deviation)
# ═══════════════════════════════════════════════════════════════
bind_accessor() {
  local secret="$1" member="$2"
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$EXPECTED_PROJECT" >/dev/null
  echo "  ✓ bound: $secret → $member"
}

echo "▶ binding Secret Accessor role — 5 bindings total..."

# (1) news-sync SA → supabase-service-role
bind_accessor "gh-radar-supabase-service-role" "$NEWS_SYNC_SA"

# (2) news-sync SA → NAVER_CLIENT_ID (alt plan-spec: gh-radar-naver-client-id)
bind_accessor "$NAVER_ID_SECRET" "$NEWS_SYNC_SA"

# (3) news-sync SA → NAVER_CLIENT_SECRET (alt plan-spec: gh-radar-naver-client-secret)
bind_accessor "$NAVER_SECRET_SECRET" "$NEWS_SYNC_SA"

# (4) server SA → NAVER_CLIENT_ID (server POST /refresh 경로용)
bind_accessor "$NAVER_ID_SECRET" "$SERVER_SA"

# (5) server SA → NAVER_CLIENT_SECRET
bind_accessor "$NAVER_SECRET_SECRET" "$SERVER_SA"

echo ""
echo "✅ setup-news-sync-iam.sh complete"
echo "   SA: $NEWS_SYNC_SA"
echo "   SERVER_SA: $SERVER_SA"
echo "   Secrets: $NAVER_ID_SECRET, $NAVER_SECRET_SECRET"
echo "Next: bash scripts/deploy-news-sync.sh"
