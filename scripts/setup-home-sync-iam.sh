#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 13 Plan 06 — home-sync IAM 세팅 (setup-theme-sync-iam.sh 미러)
#
# 설정 대상:
#   1. SA 생성: gh-radar-home-sync-sa (Home Sync Worker — 최소권한)
#   2. Secret accessor 바인딩 2건 (전부 기존 시크릿 재사용 — 신규 생성 없음):
#      - home-sync-sa → gh-radar-supabase-service-role   (home_theme_snapshots UPSERT)
#      - home-sync-sa → gh-radar-anthropic-api-key         (Claude Haiku 클러스터링 1회)
#      ※ brightdata 시크릿 바인딩 없음 — home-sync 는 외부 크롤링 0(Supabase+Anthropic 만).
#   3. gh-radar-scheduler-sa 존재 확인(재사용 — Scheduler → Cloud Run Job invoker).
#      ※ Job invoker 바인딩은 deploy-home-sync.sh §6.5 에서 Job 생성 후 부여(05.1 선례).
#
# 참조: scripts/setup-theme-sync-iam.sh (SA + Secret accessor 패턴).
# MEMORY: 기존 creds 재요청 금지 — 2 시크릿 모두 이전 phase 에서 등록됨(재사용).
# RESEARCH §Pattern 5: home-sync 는 VPC 무관, theme-sync 스택 복제. OIDC 금지.
# THREAT T-13-14 (over-privileged SA) mitigate: supabase-service-role + anthropic accessor 2건만.
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
HOME_SYNC_SA_NAME="gh-radar-home-sync-sa"
HOME_SYNC_SA="${HOME_SYNC_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

# 기존 시크릿 2종 — 전부 재사용(신규 생성 없음). MEMORY: 기존 creds 재요청 금지.
SUPABASE_SECRET="gh-radar-supabase-service-role"
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
# Section 4: home-sync 전용 SA 생성 (idempotent)
# ═══════════════════════════════════════════════════════════════
if gcloud iam service-accounts describe "$HOME_SYNC_SA" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "✓ SA exists: $HOME_SYNC_SA_NAME"
else
  gcloud iam service-accounts create "$HOME_SYNC_SA_NAME" \
    --display-name="gh-radar home-sync (Supabase + Anthropic only, no VPC)" \
    --project="$EXPECTED_PROJECT"
  echo "✓ SA created: $HOME_SYNC_SA_NAME"
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
# Section 5: 기존 Secret 2종 존재 확인 (신규 생성 없음 — 전부 재사용)
#   MEMORY: 기존 creds 재요청 금지. 부재 시 선행 phase setup 누락 → 에러.
# ═══════════════════════════════════════════════════════════════
for SECRET in "$SUPABASE_SECRET" "$ANTHROPIC_SECRET"; do
  if gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "✓ secret exists (reused): $SECRET"
  else
    echo "ERROR: Secret '$SECRET' not found." >&2
    echo "  → 이 시크릿은 이전 phase(ingestion/theme-sync)에서 등록되어야 합니다." >&2
    echo "  → 신규 생성하지 마세요(재사용 원칙). 누락 시 해당 phase setup 을 먼저 실행하세요." >&2
    exit 1
  fi
done

# ═══════════════════════════════════════════════════════════════
# Section 6: Secret Accessor 바인딩 — 총 2건 (home-sync-sa → 2 시크릿)
#   home-sync 는 server-side /refresh 경로가 없으므로 Job SA 1개만 바인딩.
#   THREAT T-13-14 mitigate: 최소권한 — brightdata 미바인딩, VPC 없음.
# ═══════════════════════════════════════════════════════════════
bind_accessor() {
  local secret="$1" member="$2"
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${member}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$EXPECTED_PROJECT" >/dev/null
  echo "  ✓ bound: $secret → $member"
}

echo "▶ binding Secret Accessor role — 2 bindings total..."

# (1) home-sync SA → supabase-service-role (home_theme_snapshots UPSERT + top_movers/stock_quotes/news_articles 읽기)
bind_accessor "$SUPABASE_SECRET" "$HOME_SYNC_SA"

# (2) home-sync SA → anthropic-api-key (Claude Haiku 클러스터링 1회)
bind_accessor "$ANTHROPIC_SECRET" "$HOME_SYNC_SA"

echo ""
echo "✅ setup-home-sync-iam.sh complete"
echo "   SA: $HOME_SYNC_SA"
echo "   Secrets (all reused, 신규 0): $SUPABASE_SECRET, $ANTHROPIC_SECRET"
echo "Next: bash scripts/deploy-home-sync.sh"
