#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-tick-convert-iam.sh
# Phase 37 D-21 ⑤ · D-22 — 틱 격자 변환 Job(gh-radar-tick-convert)의 SA · Secret accessor · 원본 아카이브 버킷 IAM
#
# 선례 = scripts/setup-limitup-sync-iam.sh (가드 · API · SA 멱등 · Secret accessor · 버킷 단위 IAM).
# 차이 (37-18-PLAN / 37-RESEARCH Pattern 11 「권한」):
#   - 신규 runtime SA gh-radar-tick-convert-sa · scheduler SA gh-radar-scheduler-sa 재사용
#   - 버킷을 만들지 않는다 — gs://gh-trade-tick-archive 는 gh-trade tick-archive 가 만든 원본 아카이브다
#     (프로젝트 gh-radar · asia-northeast3 · 기본 클래스 ARCHIVE · 균일 버킷 수준 액세스 —
#      docs/inbox/from-gh-trade/261005-tick-raw-archive-gcs.md). 없으면 멈춘다.
#   - 버킷 단위 roles/storage.objectViewer 만(Cloud Run GCS 볼륨 읽기 전용 마운트) — D-21 ⑤: 바인딩은 gh-radar 가 하고
#     gh-trade 에는 인박스 노트로 알렸다. 프로젝트 IAM 은 바꾸지 않는다 · SA JSON 키를 만들지 않는다.
#   - server 실행 SA 의 Job 단위 overrides 실행 권한은 Job 이 있어야 걸 수 있어 deploy-tick-convert.sh 가 한다.
#
# 필수 env: GCP_PROJECT_ID
# 멱등: 여러 번 돌려도 안전 (describe 후 create · add-iam-policy-binding 은 중복 무해).
# 실행: 메인 세션(37-16) — 서브에이전트에서 실행하지 않는다.
# 다음: deploy-tick-convert.sh → smoke-tick-convert.sh <YYYYMMDD>
# ═══════════════════════════════════════════════════════════════

# Section 1: gcloud 가드
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
  iam.googleapis.com \
  storage.googleapis.com \
  monitoring.googleapis.com

echo "✓ APIs enabled"

# Section 3: 선행 SA 존재 확인 — scheduler SA 재사용 (Phase 05.1)
SCHED_SA_EMAIL="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SCHED_SA_EMAIL" >/dev/null 2>&1; then
  echo "ERROR: SA '$SCHED_SA_EMAIL' not found — 선행 setup(ingestion IAM) 이 먼저 실행되어야 함" >&2
  exit 1
fi
echo "✓ SA exists (reused): $SCHED_SA_EMAIL"

# Section 4: 신규 tick-convert 전용 SA (idempotent create)
WORKER_SA_NAME=gh-radar-tick-convert-sa
WORKER_SA_EMAIL="${WORKER_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$WORKER_SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $WORKER_SA_NAME"
else
  gcloud iam service-accounts create "$WORKER_SA_NAME" \
    --display-name="gh-radar tick-convert (tick grid conversion Job, Phase 37 D-02/D-03)"
  echo "✓ SA created: $WORKER_SA_NAME"
fi

# Section 5: Secret — Supabase service-role 1개만 (외부 API 키 없음 — 최소권한)
SECRET=gh-radar-supabase-service-role
if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  echo "✓ secret exists (reused): $SECRET"
else
  echo "ERROR: secret '$SECRET' not found — Phase 05.1 setup-ingestion-iam.sh 가 먼저 실행되어야 함" >&2
  exit 1
fi

gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:${WORKER_SA_EMAIL}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: $SECRET → $WORKER_SA_NAME"

# Section 6: 원본 아카이브 버킷 — 존재 확인만(gh-trade 소유 · 만들지 않는다)
BUCKET_URL="gs://gh-trade-tick-archive"
if ! gcloud storage buckets describe "$BUCKET_URL" >/dev/null 2>&1; then
  echo "ERROR: bucket '$BUCKET_URL' not found — gh-trade tick-archive 가 만든다(인박스 261005-tick-raw-archive-gcs)" >&2
  exit 1
fi
echo "✓ bucket exists (gh-trade): $BUCKET_URL"

# Section 7: 버킷 단위 IAM (D-21 ⑤ · 프로젝트 IAM 무변경 · SA JSON 키 없음)
# 워커 SA — Cloud Run GCS 볼륨 읽기 전용 마운트(/mnt/tick → raw/<krx|nxt>/<D>/)
gcloud storage buckets add-iam-policy-binding gs://gh-trade-tick-archive \
  --member="serviceAccount:${WORKER_SA_EMAIL}" \
  --role="roles/storage.objectViewer" >/dev/null
echo "✓ bucket IAM: roles/storage.objectViewer → $WORKER_SA_NAME (gs://gh-trade-tick-archive)"

echo ""
echo "✅ setup-tick-convert-iam.sh complete"
echo "ℹ gh-trade 에는 인박스 노트 ⑤로 알렸다(D-21 ⑤ — 변환 Job SA 의 objectViewer 바인딩은 gh-radar 가 한다)."
echo "Next:"
echo "  1. bash scripts/deploy-tick-convert.sh        (GCP_PROJECT_ID · SUPABASE_URL · NOTIFICATION_CHANNEL_ID)"
echo "  2. bash scripts/smoke-tick-convert.sh <YYYYMMDD> [nightly|request <KRX|NXT>]"
