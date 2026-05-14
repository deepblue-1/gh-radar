#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-intraday-sync-iam.sh
# Phase 09.1 (DATA-02) — intraday-sync worker + server VPC stack + IAM
#
# 결정 (09.1-CONTEXT.md):
#   D-04: Direct VPC Egress + Cloud NAT + Static IP 1개 (Job + service 공유)
#   D-26: kiwoom_tokens Supabase 캐시
#   D-29: 리소스 이름 = gh-radar-vpc / gh-radar-subnet-an3 / gh-radar-router-an3 / gh-radar-nat-an3 / gh-radar-static-ip
#   D-30: server (gh-radar-server) 도 동일 VPC connector 로 재배포
#   D-31: 키움 IP 화이트리스트 등록 (사용자 액션, Plan 09 [BLOCKING])
#
# Idempotent — 재실행 시 기존 리소스 skip.
# ═══════════════════════════════════════════════════════════════

# Section 1: gcloud guard (candle-sync mirror)
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
  compute.googleapis.com
echo "✓ APIs enabled"

# Section 3: VPC + Subnet + Router + NAT + Static IP (RESEARCH §4.4)
REGION=asia-northeast3
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3
ROUTER_NAME=gh-radar-router-an3
NAT_NAME=gh-radar-nat-an3
STATIC_IP_NAME=gh-radar-static-ip

# 3.1 VPC
if ! gcloud compute networks describe "$VPC_NAME" >/dev/null 2>&1; then
  echo "▶ creating VPC: $VPC_NAME (custom subnet mode)..."
  gcloud compute networks create "$VPC_NAME" --subnet-mode=custom
fi
echo "✓ VPC ready: $VPC_NAME"

# 3.2 Subnet (/26 = 64 IP, RESEARCH §4.8)
if ! gcloud compute networks subnets describe "$SUBNET_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ creating Subnet: $SUBNET_NAME (10.10.0.0/26)..."
  gcloud compute networks subnets create "$SUBNET_NAME" \
    --network="$VPC_NAME" \
    --region="$REGION" \
    --range=10.10.0.0/26
fi
echo "✓ Subnet ready: $SUBNET_NAME"

# 3.3 Reserved Static External IP
if ! gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ reserving Static IP: $STATIC_IP_NAME..."
  gcloud compute addresses create "$STATIC_IP_NAME" --region="$REGION"
fi
STATIC_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format='value(address)')
echo "✓ Static IP reserved: $STATIC_IP"

# 3.4 Cloud Router
if ! gcloud compute routers describe "$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ creating Cloud Router: $ROUTER_NAME..."
  gcloud compute routers create "$ROUTER_NAME" --network="$VPC_NAME" --region="$REGION"
fi
echo "✓ Cloud Router ready: $ROUTER_NAME"

# 3.5 Cloud NAT (Static IP 바인딩, custom subnet ranges)
if ! gcloud compute routers nats describe "$NAT_NAME" --router="$ROUTER_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ creating Cloud NAT: $NAT_NAME (bind Static IP)..."
  gcloud compute routers nats create "$NAT_NAME" \
    --router="$ROUTER_NAME" \
    --region="$REGION" \
    --nat-custom-subnet-ip-ranges="$SUBNET_NAME" \
    --nat-external-ip-pool="$STATIC_IP_NAME"
fi
echo "✓ Cloud NAT ready: $NAT_NAME"

# Section 4: 선행 SA 존재 확인 (Phase 05.1 lesson — scheduler SA 재사용)
for SA in gh-radar-scheduler-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found — Phase 05.1 setup 가 선행되어야 함" >&2
    exit 1
  fi
  echo "✓ SA exists (reused): $SA"
done

# Section 5: intraday-sync 전용 SA
SA_NAME=gh-radar-intraday-sync-sa
SA_EMAIL="${SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $SA_NAME"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="gh-radar intraday-sync (Kiwoom ka10027/ka10001 + Supabase, Phase 09.1 DATA-02)"
  echo "✓ SA created: $SA_NAME"
fi

# Section 6: KIWOOM Secrets 신설 (D-26) — 사용자가 secret value 별도 등록 필요 (Plan 09 [BLOCKING])
for SECRET in gh-radar-kiwoom-appkey gh-radar-kiwoom-secretkey; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "✓ secret exists: $SECRET"
  else
    echo "▶ creating empty secret: $SECRET (사용자가 'gcloud secrets versions add ...' 로 value 추가 필요)"
    gcloud secrets create "$SECRET" --replication-policy=automatic
  fi
done

# Section 7: 기존 secret 존재 확인 (재사용)
for SECRET in gh-radar-supabase-service-role; do
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "ERROR: secret '$SECRET' not found — Phase 05.1 setup 가 선행되어야 함" >&2
    exit 1
  fi
  echo "✓ secret exists (reused): $SECRET"
done

# Section 8: Secret accessor 바인딩 — intraday-sync SA 에 KIWOOM 2종 + Supabase 1종
for SECRET in gh-radar-kiwoom-appkey gh-radar-kiwoom-secretkey gh-radar-supabase-service-role; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "✓ secretAccessor bound: $SECRET → $SA_NAME"
done

# Section 9: Cloud Run Service Agent + Runtime SA 에 Compute Network User (RESEARCH §4.7, Direct VPC Egress 전제)
PROJECT_NUMBER=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"

# 9.1 Cloud Run Service Agent
gcloud projects add-iam-policy-binding "$EXPECTED_PROJECT" \
  --member="serviceAccount:${RUN_SERVICE_AGENT}" \
  --role=roles/compute.networkUser >/dev/null
echo "✓ compute.networkUser bound: ${RUN_SERVICE_AGENT}"

# 9.2 intraday-sync worker SA
gcloud projects add-iam-policy-binding "$EXPECTED_PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/compute.networkUser >/dev/null
echo "✓ compute.networkUser bound: ${SA_NAME}"

# 9.3 server runtime SA (default compute SA — server 는 별도 SA 미사용, default compute)
DEFAULT_COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$EXPECTED_PROJECT" \
  --member="serviceAccount:${DEFAULT_COMPUTE_SA}" \
  --role=roles/compute.networkUser >/dev/null
echo "✓ compute.networkUser bound: ${DEFAULT_COMPUTE_SA} (server default compute SA)"

# 9.4 server SA 에도 KIWOOM Secret accessor 바인딩 (D-17 server 측 ka10001 호출)
for SECRET in gh-radar-kiwoom-appkey gh-radar-kiwoom-secretkey; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${DEFAULT_COMPUTE_SA}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "✓ secretAccessor bound: $SECRET → server default compute SA"
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ setup-intraday-sync-iam.sh complete"
echo ""
echo "📌 Static IP: $STATIC_IP"
echo ""
echo "🚨 다음 단계 (Plan 09 [BLOCKING]):"
echo "  1. KIWOOM_APPKEY / KIWOOM_SECRETKEY 값을 GCP Secret 에 추가:"
echo "     echo -n '<APPKEY>' | gcloud secrets versions add gh-radar-kiwoom-appkey --data-file=-"
echo "     echo -n '<SECRETKEY>' | gcloud secrets versions add gh-radar-kiwoom-secretkey --data-file=-"
echo "  2. 키움 OpenAPI 의 IP 등록 페이지 (https://openapi.kiwoom.com) 에 다음 IP 추가:"
echo "     $STATIC_IP"
echo "  3. bash scripts/deploy-intraday-sync.sh — Cloud Run Job 배포"
echo "  4. bash scripts/deploy-server.sh — server VPC 재배포"
