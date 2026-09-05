#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증 (D-36, D-39)
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
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
SERVICE=gh-radar-server
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/server:${SHA}"
IMAGE_LATEST="${REGISTRY}/server:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or .env.deploy)}"
: "${CORS_ALLOWED_ORIGINS:?CORS_ALLOWED_ORIGINS must be set}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# ═══════════════════════════════════════════════════════════════
# Section 2.5: Kiwoom secret accessor 바인딩 (Phase 09.1 D-17 — server 측 ka10001 호출)
#   server 는 default compute SA 사용 → KIWOOM secret 에 accessor 바인딩 필요
#   주 바인딩은 scripts/setup-intraday-sync-iam.sh §9.4 가 담당. 여기는 안전망 (idempotent).
# ═══════════════════════════════════════════════════════════════
PROJECT_NUMBER=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
DEFAULT_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in gh-radar-kiwoom-appkey gh-radar-kiwoom-secretkey; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ Kiwoom secret accessor bound for server SA (idempotent)"

# Phase 07 Plan 06 — Naver secret accessor 바인딩 (server POST /refresh 경로용)
# 주의: 주 바인딩은 scripts/setup-news-sync-iam.sh 가 담당. 여기는 안전망 (idempotent).
for SECRET in NAVER_CLIENT_ID NAVER_CLIENT_SECRET; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ Naver secret accessor bound for server SA (idempotent)"

# Phase 08 Plan 06 + 08.1 Plan 04 — Bright Data + Anthropic secret accessor 바인딩
# 주 바인딩은 scripts/setup-discussion-sync-iam.sh 가 담당. 여기는 안전망 (idempotent).
for SECRET in gh-radar-brightdata-api-key gh-radar-anthropic-api-key; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ Bright Data + Anthropic secret accessor bound for server SA (idempotent)"

# Phase 15 Plan 19 — relay 주문 공유 비밀 accessor 바인딩 (D-08 / D-22 / T-15-06)
#   server 런타임 SA 는 **default compute SA** 인데 `setup-relay-iam.sh` 는 relay SA 에만
#   접근권을 준다(15-19 실측: 바인딩 1건 = relay SA 뿐). 바인딩 없이 `--update-secrets` 로
#   RELAY_ORDER_SECRET 을 붙이면 리비전이 secret 을 못 읽어 기동에 실패한다.
for SECRET in gh-radar-relay-order-secret; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ relay order secret accessor bound for server SA (idempotent)"

# 선행 Secret 검증 — 배포 전 필수 secret 존재 여부
#   relay 주문 비밀 부재는 `gcloud run deploy` 자체를 실패시킨다. 원인을 gcloud 원문이
#   아니라 여기서 말하고, 무엇을 먼저 돌려야 하는지까지 알려 준다.
for SECRET in gh-radar-relay-order-secret; do
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-relay-iam.sh" >&2
    exit 1
  fi
done

for SECRET in gh-radar-anthropic-api-key; do
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-discussion-sync-iam.sh" >&2
    exit 1
  fi
done
echo "✓ Pre-deploy secret check"

# ═══════════════════════════════════════════════════════════════
# Section 3: Build (amd64 강제, GIT_SHA 주입)
# ═══════════════════════════════════════════════════════════════
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f server/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# ═══════════════════════════════════════════════════════════════
# Section 4: Push
# ═══════════════════════════════════════════════════════════════
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# ═══════════════════════════════════════════════════════════════
# Section 5: Deploy (D-28 프로파일 + RESEARCH Pitfall 4 delimiter)
# Phase 09.1 D-30: VPC connector 옵션 — server 도 Static IP 경유
# ═══════════════════════════════════════════════════════════════
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3

# VPC stack 존재 확인 (없으면 Wave 3 setup 미실행)
if ! gcloud compute networks describe "$VPC_NAME" >/dev/null 2>&1; then
  echo "ERROR: VPC '$VPC_NAME' not found. Run: bash scripts/setup-intraday-sync-iam.sh" >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# ⚠️ `--set-env-vars` 는 env 를 **전량 치환**한다 (T-15-55).
#
#   여기 문자열에 없는 키는 재배포 시점에 조용히 사라진다 — 추가가 아니라 교체다
#   (`deploy-intraday-sync.sh` L91 이 같은 함정을 DT_GUARD_ENABLED 로 겪었다).
#   그래서 env 를 하나 추가할 때마다 **기존 항목 전부를 다시 적어야** 하고,
#   배포 직후 Section 5.5 가 필수 키 목록을 실제 리비전과 대조한다.
#
#   `--update-secrets` 는 반대로 **병합**이지만, 여기서도 전체를 나열해 두어야
#   "이 서비스가 읽는 secret 목록" 의 정본이 한 곳에 남는다.
#
# Phase 15 Plan 19 추가분 (D-08 / D-22):
#   RELAY_INTERNAL_URL  Direct VPC Egress 로 도달하는 relay 내부 주소. 기본
#                       `http://10.10.0.5:8091` = VM 내부 고정 IP (평문 http 는 VPC
#                       내부 구간이라 의도된 것이다 — TLS 종단은 Caddy 가 8090 에서만).
#                       server 의 사설 대역 가드가 10.10.0.0/26 밖 주소를 부팅 시 거부한다.
#   ORDER_TIMEOUT_MS    relay 의 첫 OrderResp 대기 상한. server 는 여기에 +500ms 를 더해
#                       기다린다 — 먼저 끊으면 relay 만 결과를 아는 상태가 된다.
#   RELAY_ORDER_SECRET  `X-Relay-Secret` 공유 비밀. **값은 절대 이 파일에 쓰지 않는다** —
#                       Secret Manager 참조만 둔다.
# ───────────────────────────────────────────────────────────────
echo "▶ gcloud run deploy (VPC: $VPC_NAME)..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --min-instances=1 \
  --max-instances=3 \
  --timeout=300s \
  --network="$VPC_NAME" \
  --subnet="$SUBNET_NAME" \
  --vpc-egress=all-traffic \
  --set-env-vars="^@^NODE_ENV=production@LOG_LEVEL=info@SUPABASE_URL=${SUPABASE_URL}@CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}@KIWOOM_BASE_URL=https://api.kiwoom.com@KIWOOM_TOKEN_TYPE=live@NAVER_BASE_URL=https://openapi.naver.com@NAVER_DAILY_BUDGET=24500@APP_VERSION=${SHA}@DISCUSSION_CLASSIFY_ENABLED=${DISCUSSION_CLASSIFY_ENABLED:-false}@RELAY_INTERNAL_URL=${RELAY_INTERNAL_URL:-http://10.10.0.5:8091}@ORDER_TIMEOUT_MS=${ORDER_TIMEOUT_MS:-5000}" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,KIWOOM_APPKEY=gh-radar-kiwoom-appkey:latest,KIWOOM_SECRETKEY=gh-radar-kiwoom-secretkey:latest,NAVER_CLIENT_ID=NAVER_CLIENT_ID:latest,NAVER_CLIENT_SECRET=NAVER_CLIENT_SECRET:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest,RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest"

# ═══════════════════════════════════════════════════════════════
# Section 5.5: 배포 후 env 대조 (T-15-55 — 전량 치환 사고 감지)
#
#   "배포가 성공했다" 와 "설정이 온전하다" 는 다른 사실이다. `--set-env-vars` 문자열에서
#   한 항목이 빠져도 gcloud 는 성공을 보고한다 — 사라진 env 는 런타임에야 드러난다.
#   그래서 리비전에서 **이름 목록만** 뽑아 필수 키를 대조한다.
#
#   값은 출력하지 않는다. `RELAY_INTERNAL_URL` 만 예외인데 비밀이 아니고(사설 IP),
#   오히려 이 값이 맞는지가 주문 경로 진단의 첫 단서이기 때문이다.
# ═══════════════════════════════════════════════════════════════
REQUIRED_ENV_KEYS=(
  NODE_ENV LOG_LEVEL SUPABASE_URL CORS_ALLOWED_ORIGINS
  KIWOOM_BASE_URL KIWOOM_TOKEN_TYPE NAVER_BASE_URL NAVER_DAILY_BUDGET
  APP_VERSION DISCUSSION_CLASSIFY_ENABLED
  RELAY_INTERNAL_URL ORDER_TIMEOUT_MS
  SUPABASE_SERVICE_ROLE_KEY KIWOOM_APPKEY KIWOOM_SECRETKEY
  NAVER_CLIENT_ID NAVER_CLIENT_SECRET BRIGHTDATA_API_KEY ANTHROPIC_API_KEY
  RELAY_ORDER_SECRET
)

ENV_NAMES=$(gcloud run services describe "$SERVICE" --region="$REGION" \
  --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' | sed '/^$/d')
ENV_COUNT=$(printf '%s\n' "$ENV_NAMES" | grep -c . || true)

MISSING_KEYS=()
for KEY in "${REQUIRED_ENV_KEYS[@]}"; do
  printf '%s\n' "$ENV_NAMES" | grep -qx "$KEY" || MISSING_KEYS+=("$KEY")
done

echo "✓ env 항목 ${ENV_COUNT}개 (필수 ${#REQUIRED_ENV_KEYS[@]}종 대조)"
if [[ ${#MISSING_KEYS[@]} -gt 0 ]]; then
  echo "ERROR: 배포 후 env 가 소실됐습니다 — --set-env-vars 전량 치환 누락 (T-15-55)" >&2
  echo "  missing: ${MISSING_KEYS[*]}" >&2
  exit 1
fi

# relay 결선 요약 — 값을 내보내는 것은 URL 뿐, secret 은 **바인딩 여부**만 말한다.
# `extract()` 는 리스트 리터럴(`['http://...']`)로 나온다 — 따옴표·대괄호를 벗겨서 쓴다.
RELAY_URL_VALUE=$(gcloud run services describe "$SERVICE" --region="$REGION" \
  --format="value(spec.template.spec.containers[0].env.filter(\"name:RELAY_INTERNAL_URL\").extract(value))" 2>/dev/null \
  | tr -d "[]'" | tr -d '[:space:]')
echo "✓ RELAY_INTERNAL_URL = ${RELAY_URL_VALUE:-<조회 실패>}"
echo "✓ RELAY_ORDER_SECRET = Secret Manager 참조 바인딩됨 (값 미출력)"

# ═══════════════════════════════════════════════════════════════
# Section 6: Smoke
# ═══════════════════════════════════════════════════════════════
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
echo ""
echo "✓ Deployed: $URL"
echo ""

echo "▶ smoke tests..."
bash "$(dirname "$0")/smoke-server.sh" "$URL"

echo ""
echo "✅ deploy-server.sh complete"
