#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-limitup-sync-iam.sh
# Phase 28 D-13 · D-14 · D-16 — 밤 export 적재 워커의 SA · Secret accessor · GCS 버킷 · 버킷 IAM
#
# 선례 = Phase 12 상한가 이력 워커 IAM 스크립트(Section 1~5 — 가드 · API · SA 멱등 · Secret accessor).
# 차이 (28-08-PLAN / 28-RESEARCH §E-3 · §F-2 · Pitfall 8):
#   - 신규 runtime SA gh-radar-limitup-sync-sa · scheduler SA gh-radar-scheduler-sa 재사용
#   - Section 6 버킷 gs://gh-radar-limitup-export — 없을 때만 생성
#       asia-northeast3 · STANDARD · 균일 버킷 수준 액세스 · 공개 접근 방지 enforced
#       D-16: 수명 주기 삭제 규칙을 두지 않는다 — GCS 사본은 지우지 않아 재적재 가능
#             (보존 정리는 Supabase 표 · Storage 격자만 — 워커의 limitup_purge_old)
#   - Section 7 버킷 단위 IAM (프로젝트 IAM 은 바꾸지 않는다 · SA JSON 키를 만들지 않는다)
#       워커 SA  → roles/storage.objectViewer (Cloud Run 볼륨 읽기 전용 마운트)
#       relay SA → roles/storage.objectUser   (radar-gw 운반기 = VM 메타데이터 자격)
#         D+1 보충으로 어제 파일을 같은 경로에 다시 올린다 → storage.objects.delete 필요.
#         objectCreator + objectViewer 는 2026-10-05 gh-trade 실측 403 (tick-archive 버킷 재업로드 · rm 거부).
#
# 멱등: 여러 번 돌려도 안전 (describe 후 create · add-iam-policy-binding 은 중복 무해).
# 다음: deploy-limitup-sync.sh → (radar-gw 운반 or seed) → smoke-limitup-sync.sh → radar-gw install
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
  storage.googleapis.com

echo "✓ APIs enabled"

# Section 3: 선행 SA 존재 확인 — scheduler SA 재사용 (Phase 05.1) · relay SA (relay 배포 · radar-gw VM 자격)
SCHED_SA_EMAIL="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
RELAY_SA_EMAIL="gh-radar-relay-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

for SA_EMAIL in "$SCHED_SA_EMAIL" "$RELAY_SA_EMAIL"; do
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA_EMAIL' not found — 선행 setup(ingestion IAM · relay) 이 먼저 실행되어야 함" >&2
    exit 1
  fi
  echo "✓ SA exists (reused): $SA_EMAIL"
done

# Section 4: 신규 limitup-sync 전용 SA (idempotent create)
WORKER_SA_NAME=gh-radar-limitup-sync-sa
WORKER_SA_EMAIL="${WORKER_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$WORKER_SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $WORKER_SA_NAME"
else
  gcloud iam service-accounts create "$WORKER_SA_NAME" \
    --display-name="gh-radar limitup-sync (night export load, Phase 28 D-14)"
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

# Section 6: GCS 버킷 (없을 때만 생성 — 이름 · 위치는 radar-gw 운반기 env · Cloud Run 볼륨 · 운영 문서가 함께 가리킨다)
# D-16: 수명 주기 규칙 없음 — 이 스크립트는 객체 삭제 규칙을 설정하지 않는다.
BUCKET_URL="gs://gh-radar-limitup-export"

if gcloud storage buckets describe "$BUCKET_URL" >/dev/null 2>&1; then
  echo "✓ bucket exists: $BUCKET_URL"
else
  echo "▶ creating bucket: $BUCKET_URL (asia-northeast3 · STANDARD · uniform · public access prevention)..."
  gcloud storage buckets create "$BUCKET_URL" \
    --project="$EXPECTED_PROJECT" \
    --location=asia-northeast3 \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention
  echo "✓ bucket created: $BUCKET_URL"
fi

# Section 7: 버킷 단위 IAM (프로젝트 IAM 무변경)
# 워커 SA — 볼륨 마운트 읽기
gcloud storage buckets add-iam-policy-binding gs://gh-radar-limitup-export \
  --member="serviceAccount:${WORKER_SA_EMAIL}" \
  --role="roles/storage.objectViewer" >/dev/null
echo "✓ bucket IAM: roles/storage.objectViewer → $WORKER_SA_NAME"

# relay SA — radar-gw 운반기의 gcloud storage rsync (D+1 보충 덮어쓰기 = delete 권한 필요 → objectUser)
gcloud storage buckets add-iam-policy-binding gs://gh-radar-limitup-export \
  --member="serviceAccount:${RELAY_SA_EMAIL}" \
  --role="roles/storage.objectUser" >/dev/null
echo "✓ bucket IAM: roles/storage.objectUser → gh-radar-relay-sa"

echo ""
echo "✅ setup-limitup-sync-iam.sh complete"
echo "Next:"
echo "  1. bash scripts/deploy-limitup-sync.sh        (GCP_PROJECT_ID · SUPABASE_URL · NOTIFICATION_CHANNEL_ID)"
echo "  2. bash scripts/smoke-limitup-sync.sh         (GCS 에 export 날짜가 올라온 뒤 — 행 수 == manifest)"
echo "  3. radar-gw: infra/relay/limitup-pull/install.sh (BUCKET=$BUCKET_URL)"
