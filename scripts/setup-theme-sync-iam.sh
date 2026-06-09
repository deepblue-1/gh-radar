#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 10 Plan 08 — theme-sync IAM 세팅 (setup-discussion-sync-iam.sh 미러)
#
# 설정 대상:
#   1. SA 생성: gh-radar-theme-sync-sa (Theme Sync Worker — 최소권한)
#   2. Secret accessor 바인딩 3건 (전부 기존 시크릿 재사용 — 신규 생성 없음):
#      - theme-sync-sa → gh-radar-supabase-service-role   (themes/theme_stocks UPSERT)
#      - theme-sync-sa → gh-radar-brightdata-api-key       (직접→프록시 폴백, Pitfall 1)
#      - theme-sync-sa → gh-radar-anthropic-api-key         (AI 보강 — Plan 06 discoverThemes)
#   3. gh-radar-scheduler-sa 존재 확인(재사용 — Scheduler → Cloud Run Job invoker).
#      ※ Job invoker 바인딩은 deploy-theme-sync.sh §5.5 에서 Job 생성 후 부여(05.1 선례).
#
# 참조: scripts/setup-discussion-sync-iam.sh (Bright Data + Anthropic accessor 패턴).
# MEMORY: 기존 creds 재요청 금지 — 3 시크릿 모두 이전 phase 에서 등록됨(재사용).
#         theme-sync 는 server-side /refresh 경로가 없으므로 server SA 바인딩 불필요.
# RESEARCH §Don't Hand-Roll: master-sync/discussion-sync 스택 복제. §Pitfall 4: OIDC 금지.
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
THEME_SYNC_SA_NAME="gh-radar-theme-sync-sa"
THEME_SYNC_SA="${THEME_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

# 기존 시크릿 3종 — 전부 재사용(신규 생성 없음). MEMORY: 기존 creds 재요청 금지.
SUPABASE_SECRET="gh-radar-supabase-service-role"
BRIGHTDATA_SECRET="gh-radar-brightdata-api-key"
ANTHROPIC_SECRET="gh-radar-anthropic-api-key"

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
# Section 4: theme-sync 전용 SA 생성 (idempotent)
# ═══════════════════════════════════════════════════════════════
if gcloud iam service-accounts describe "$THEME_SYNC_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SA exists: $THEME_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$THEME_SYNC_SA_NAME" \
    --display-name="gh-radar theme-sync (Supabase + Bright Data + Anthropic only)" \
    --project="$EXPECTED_PROJECT"
  echo "✓ SA created: $THEME_SYNC_SA_NAME"
fi

# Scheduler SA 존재 확인 — 재사용(Scheduler → Job invoker). 미존재면 선행 phase 누락.
SCHEDULER_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SCHEDULER_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ Scheduler SA exists (reused): gh-radar-scheduler-sa"
else
  echo "ERROR: Scheduler SA 'gh-radar-scheduler-sa' not found. Run an earlier ingestion/sync setup first." >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Section 5: 기존 Secret 3종 존재 확인 (신규 생성 없음 — 전부 재사용)
#   MEMORY: 기존 creds 재요청 금지. 부재 시 선행 phase setup 누락 → 에러.
# ═══════════════════════════════════════════════════════════════
for SECRET in "$SUPABASE_SECRET" "$BRIGHTDATA_SECRET" "$ANTHROPIC_SECRET"; do
  if gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "✓ secret exists (reused): $SECRET"
  else
    echo "ERROR: Secret '$SECRET' not found." >&2
    echo "  → 이 시크릿은 이전 phase(ingestion/discussion-sync)에서 등록되어야 합니다." >&2
    echo "  → 신규 생성하지 마세요(재사용 원칙). 누락 시 해당 phase setup 을 먼저 실행하세요." >&2
    exit 1
  fi
done

# ═══════════════════════════════════════════════════════════════
# Section 6: Secret Accessor 바인딩 — 총 3건 (theme-sync-sa → 3 시크릿)
#   theme-sync 는 server-side /refresh 경로가 없으므로 Job SA 1개만 바인딩.
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

# (1) theme-sync SA → supabase-service-role (themes/theme_stocks UPSERT)
bind_accessor "$SUPABASE_SECRET" "$THEME_SYNC_SA"

# (2) theme-sync SA → brightdata-api-key (직접→프록시 폴백, Pitfall 1)
bind_accessor "$BRIGHTDATA_SECRET" "$THEME_SYNC_SA"

# (3) theme-sync SA → anthropic-api-key (AI 보강 — Plan 06 discoverThemes/correctMembership)
bind_accessor "$ANTHROPIC_SECRET" "$THEME_SYNC_SA"

echo ""
echo "✅ setup-theme-sync-iam.sh complete"
echo "   SA: $THEME_SYNC_SA"
echo "   Secrets (all reused): $SUPABASE_SECRET, $BRIGHTDATA_SECRET, $ANTHROPIC_SECRET"
echo "Next: bash scripts/deploy-theme-sync.sh"
