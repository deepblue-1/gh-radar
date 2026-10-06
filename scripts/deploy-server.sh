#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-server.sh — server(Express) Cloud Run 배포
#
# 필수 env: GCP_PROJECT_ID · SUPABASE_URL · CORS_ALLOWED_ORIGINS(라이브 Cloud Run env 에서 그대로) ·
#           RELAY_INTERNAL_URL(Phase 29 — 아래)
#
# Phase 29 D-07 (29-24) — relay 결선을 **다시 붙였다.** Phase 16 Plan 16(D-02)이 주문 접수를 relay wss 전용으로 옮기며
#   server → relay 호출과 그 결선(env · secret 바인딩 · server SA accessor)을 걷어냈는데, Phase 29 의 웹 Admin 명령
#   (사용자 · DMA 연결 · 서버 레지스트리 즉시 반영 · 주문/시세 서버 전환)은 **server 가 relay 내부 HTTP 를 부른다**
#   (`server/src/services/relay-admin-client.ts` · `x-relay-secret` 관문). 주문은 여전히 relay wss 전용이다 — 다시 붙인 건
#   Admin 경로뿐이다. 그래서:
#     · env `RELAY_INTERNAL_URL` — relay VM 의 VPC 사설 주소(infra/relay/README.md §주문 경로 결선 「RELAY_INTERNAL_URL」 행 ·
#       내부 고정 IP `gh-radar-relay-internal`). 저장소에 박제하지 않고 배포자가 넘긴다. server 는 production 에서
#       10.10.0.0/26 밖이면 부팅을 거부하므로(assertRelayUrl) 여기서 먼저 같은 모양을 본다.
#     · secret `RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest` 바인딩 + server 런타임 SA(default compute SA) accessor.
#   방화벽 `relay-allow-internal-order`(tcp:8091 · 서브넷 출처)는 16-16 뒤에도 지우지 않아 그대로 있다 — 새로 열 것은 없다.
#   둘 중 하나라도 없으면 server 는 기동은 하되 Admin 즉시 반영이 꺼지고 DMA 프록시 라우트가 503 이다(server.ts 경고).
# ═══════════════════════════════════════════════════════════════

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

# Phase 29 D-07 — relay 내부 주소. 값은 출력하지 않는다(있다 · 모양이 맞다만 본다).
if [[ -z "${RELAY_INTERNAL_URL:-}" ]]; then
  echo "ERROR: RELAY_INTERNAL_URL must be set — relay VM 의 VPC 사설 주소(http://<내부 고정 IP>:8091)" >&2
  echo "  값: infra/relay/README.md §주문 경로 결선 표의 「RELAY_INTERNAL_URL」 행 (내부 고정 IP gh-radar-relay-internal)" >&2
  echo "  확인: gcloud compute addresses describe gh-radar-relay-internal --region=asia-northeast3 --format='value(address)'" >&2
  exit 1
fi
# server 의 assertRelayUrl(production)과 같은 모양 — http(s) · 10.10.0.0/26 호스트. 어긋나면 새 리비전이 부팅을 거부한다.
if [[ ! "$RELAY_INTERNAL_URL" =~ ^https?://10\.10\.0\.(0|[1-9][0-9]?)(:[0-9]{1,5})?/?$ ]] || (( BASH_REMATCH[1] > 63 )); then
  echo "ERROR: RELAY_INTERNAL_URL 이 relay 사설 대역(10.10.0.0/26 · http(s)://10.10.0.N[:포트]) 모양이 아닙니다 — server 가 부팅을 거부합니다" >&2
  exit 1
fi

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

# Phase 16 Plan 16 (D-02) — relay 주문 공유 비밀 accessor 바인딩을 제거했었다(주문 접수가 relay wss 전용).
# Phase 29 D-07 — Admin 명령만 server → relay 를 다시 부른다. 그래서 server 런타임 SA(default compute SA)가
#   `gh-radar-relay-order-secret` 을 다시 읽는다(`RELAY_ORDER_SECRET` 바인딩 · `x-relay-secret` 헤더). 안전망(idempotent).
#   relay SA 바인딩은 `setup-relay-iam.sh` 소관이며 여기서 손대지 않는다.
for SECRET in gh-radar-relay-order-secret; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ relay order secret accessor bound for server SA (idempotent · Phase 29 D-07)"

# 선행 Secret 검증 — 배포 전 필수 secret 존재 여부
#   Phase 29 D-07: relay 주문 비밀 존재 검사를 **다시 넣었다**(16-16 이 뺐던 것). server 가 다시 바인딩하므로
#   부재하면 `gcloud run deploy` 가 실패한다 — 빌드 · push 전에 여기서 막는다.
for SECRET in gh-radar-anthropic-api-key; do
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-discussion-sync-iam.sh" >&2
    exit 1
  fi
done
for SECRET in gh-radar-relay-order-secret; do
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: GCP_PROJECT_ID=${EXPECTED_PROJECT} bash scripts/setup-relay-iam.sh" >&2
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
# Phase 16 Plan 16 (D-02) — relay 결선 env·secret 3종을 제거했었다(주문 접수가 relay wss 전용).
# Phase 29 D-07 (29-24) — Admin 명령 경로로 둘을 **다시 붙였다**: env `RELAY_INTERNAL_URL` · secret
#   `RELAY_ORDER_SECRET`. `ORDER_TIMEOUT_MS` 는 돌아오지 않는다(주문은 여전히 wss). Admin 호출 타임아웃은
#   server 기본값(`RELAY_ADMIN_TIMEOUT_MS` 미설정 = 12000ms)을 쓴다.
#
# ⚠️⚠️ **스크립트 수정만으로는 실행 중인 리비전이 바뀌지 않는다** (Phase 09.1 KIS 정리
#      선례와 동형 / 16-RESEARCH §Runtime State Inventory). `--set-env-vars` 는 전량
#      치환이라 **새 env 는** 이 문자열대로 맞춰지지만, **secret 바인딩(`--update-secrets`)
#      은 병합**이라 목록에서 뺐다고 사라지지 않는다. (16-17 은 `--remove-env-vars=RELAY_INTERNAL_URL,ORDER_TIMEOUT_MS`
#      · `--remove-secrets=RELAY_ORDER_SECRET` 로 걷어냈었다 — Phase 29 는 이 스크립트 한 번으로 다시 붙는다.)
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
  --set-env-vars="^@^NODE_ENV=production@LOG_LEVEL=info@SUPABASE_URL=${SUPABASE_URL}@CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}@KIWOOM_BASE_URL=https://api.kiwoom.com@KIWOOM_TOKEN_TYPE=live@NAVER_BASE_URL=https://openapi.naver.com@NAVER_DAILY_BUDGET=24500@APP_VERSION=${SHA}@DISCUSSION_CLASSIFY_ENABLED=${DISCUSSION_CLASSIFY_ENABLED:-false}@RELAY_INTERNAL_URL=${RELAY_INTERNAL_URL}" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,KIWOOM_APPKEY=gh-radar-kiwoom-appkey:latest,KIWOOM_SECRETKEY=gh-radar-kiwoom-secretkey:latest,NAVER_CLIENT_ID=NAVER_CLIENT_ID:latest,NAVER_CLIENT_SECRET=NAVER_CLIENT_SECRET:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest,RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest"

# ═══════════════════════════════════════════════════════════════
# Section 5.5: 배포 후 env 대조 (T-15-55 — 전량 치환 사고 감지)
#
#   "배포가 성공했다" 와 "설정이 온전하다" 는 다른 사실이다. `--set-env-vars` 문자열에서
#   한 항목이 빠져도 gcloud 는 성공을 보고한다 — 사라진 env 는 런타임에야 드러난다.
#   그래서 리비전에서 **이름 목록만** 뽑아 필수 키를 대조한다.
#
#   값은 출력하지 않는다 — 이름 목록만 본다.
#
#   Phase 29 D-07: relay 결선 2종(`RELAY_INTERNAL_URL` · `RELAY_ORDER_SECRET`)을 이 목록에 다시 넣었다
#   (16-16 이 뺐던 것의 역). 빠지면 server 는 뜨지만 Admin 즉시 반영이 꺼진다 — 그래서 누락을 배포 실패로 본다.
# ═══════════════════════════════════════════════════════════════
REQUIRED_ENV_KEYS=(
  NODE_ENV LOG_LEVEL SUPABASE_URL CORS_ALLOWED_ORIGINS
  KIWOOM_BASE_URL KIWOOM_TOKEN_TYPE NAVER_BASE_URL NAVER_DAILY_BUDGET
  APP_VERSION DISCUSSION_CLASSIFY_ENABLED
  SUPABASE_SERVICE_ROLE_KEY KIWOOM_APPKEY KIWOOM_SECRETKEY
  NAVER_CLIENT_ID NAVER_CLIENT_SECRET BRIGHTDATA_API_KEY ANTHROPIC_API_KEY
  RELAY_INTERNAL_URL RELAY_ORDER_SECRET
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

# Phase 29 D-07 — relay 결선 요약(값 미출력). 위 대조가 두 이름의 존재를 이미 보장했다.
#   주문 경로 진단의 첫 단서는 여전히 relay `/healthz`(`scripts/smoke-relay.sh`)와 브라우저 wss 연결 상태이고,
#   Admin 경로는 server 로그의 「RELAY_INTERNAL_URL/RELAY_ORDER_SECRET not set」 경고 부재로 확인한다.
echo "✓ relay 결선: RELAY_INTERNAL_URL 설정됨(값 미출력) · RELAY_ORDER_SECRET 바인딩 (gh-radar-relay-order-secret:latest)"

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
