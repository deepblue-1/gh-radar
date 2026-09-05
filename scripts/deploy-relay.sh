#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-relay.sh
# Phase 15 (RELAY-03) — relay 컨테이너를 GCE VM `radar-gw` 에 배포
#
# 워커 3종 세트(`setup-*-iam.sh` / `deploy-*.sh` / `smoke-*.sh`) 규약을 그대로 따르되
# 두 가지가 다르다:
#   ① 배포 대상이 Cloud Run Job 이 아니라 **VM 위 Docker 컨테이너**다.
#      AR push → IAP SSH → docker pull → docker run (restart 정책 always).
#   ② 알림 근거가 Job 실패 메트릭이 아니라 **uptime check** 다 (ops/alert-relay-down.yaml).
#
# 사용법:
#   GCP_PROJECT_ID=gh-radar \
#   SUPABASE_URL=https://<ref>.supabase.co \
#   NOTIFICATION_CHANNEL_ID=<채널 ID 또는 full resource name> \
#     bash scripts/deploy-relay.sh
#
#   bash scripts/deploy-relay.sh --rollback <이미지 태그>   # 빌드 없이 이전 태그로 복귀
#
# 선택 env:
#   DMA_HOST   미설정 시 127.0.0.1 (로컬 mock). **실서버 주소는 D-27 상 명시 주입 전용.**
#   LOG_LEVEL  미설정 시 info
#
# 비밀은 이 스크립트가 만지지 않는다 (T-15-29):
#   SUPABASE_SERVICE_ROLE_KEY · DMA_CRED_KEY · RELAY_ORDER_SECRET 3종은 **VM 안에서**
#   메타데이터 토큰 → Secret Manager REST 로 읽어 tmpfs env-file(0600)에 쓰고
#   `docker run --env-file` 로 주입한 뒤 즉시 삭제한다. 명령줄로 넘기면
#   `ps` · `journalctl` · 셸 히스토리에 값이 남는다.
# ═══════════════════════════════════════════════════════════════

MODE=deploy
ROLLBACK_TAG=""
case "${1:-}" in
  "") ;;
  --rollback)
    MODE=rollback
    ROLLBACK_TAG="${2:-}"
    ;;
  *)
    echo "usage: bash scripts/deploy-relay.sh [--rollback <tag>]" >&2
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────
# Section 1: gcloud guard
# ───────────────────────────────────────────────────────────────
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi
ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: gcloud config mismatch (config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT)" >&2
  exit 1
fi
echo "✓ guard: config=$ACTIVE_CONFIG project=$ACTIVE_PROJECT"

# ───────────────────────────────────────────────────────────────
# Section 2: 변수
# ───────────────────────────────────────────────────────────────
VM=radar-gw
ZONE=asia-northeast3-a
REGION=asia-northeast3
REPO=gh-radar
VPC=gh-radar-vpc
CONTAINER=gh-radar-relay
HEALTH_HOST=dma.jx1.io
UPTIME_CHECK=gh-radar-relay-healthz
ALERT_POLICY=gh-radar-relay-down
RELAY_SA="gh-radar-relay-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/relay:${SHA}"
IMAGE_LATEST="${REGISTRY}/relay:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or .env.deploy)}"

# 컨테이너 env (비밀 아님). 값은 아래 remote head 로만 전달된다.
LOG_LEVEL="${LOG_LEVEL:-info}"
WS_PORT=8090
ORDER_API_PORT=8091
DMA_PORT=9100
DMA_BROKER=KB

# D-27 / T-15-30 — 기본값은 **로컬 mock** 이다. relay/src/config.ts 의 기본값과 같은 이유로,
# 실서버(KB 사내망 게이트웨이) 주소는 배포자가 명시적으로 넘길 때만 컨테이너에 들어간다.
DMA_HOST="${DMA_HOST:-127.0.0.1}"
if [[ "$DMA_HOST" == "10.41.1.120" ]]; then
  echo "⚠ 실서버 접속 모드 — 사용자 지시가 있었는지 확인하세요 (D-27)" >&2
  echo "  이 phase 의 기본 검증 대상은 로컬 mock 이며, 실서버 접속 검증은 15-20 소관입니다." >&2
fi

if [[ "$MODE" == rollback ]]; then
  if [[ -z "$ROLLBACK_TAG" ]]; then
    echo "ERROR: --rollback 은 이미지 태그가 필요합니다. 사용 가능한 태그:" >&2
    gcloud artifacts docker tags list "${REGISTRY}/relay" --format='value(tag)' 2>/dev/null | tail -10 >&2
    exit 1
  fi
  TARGET_IMAGE="${REGISTRY}/relay:${ROLLBACK_TAG}"
  APP_VERSION="$ROLLBACK_TAG"
else
  TARGET_IMAGE="$IMAGE"
  APP_VERSION="$SHA"
fi
echo "✓ variables: mode=$MODE SHA=$SHA TARGET=$TARGET_IMAGE DMA_HOST=$DMA_HOST"

# ───────────────────────────────────────────────────────────────
# Section 3: 선행 리소스 검증
#   실패하면 setup-relay-iam.sh 를 먼저 돌리라고 안내하고 중단한다.
# ───────────────────────────────────────────────────────────────
SETUP_HINT="Run: GCP_PROJECT_ID=${EXPECTED_PROJECT} bash scripts/setup-relay-iam.sh"

VM_STATUS=$(gcloud compute instances describe "$VM" --zone="$ZONE" --format='value(status)' 2>/dev/null || true)
if [[ "$VM_STATUS" != "RUNNING" ]]; then
  echo "ERROR: VM '$VM' 상태가 RUNNING 이 아닙니다 (status=${VM_STATUS:-NOT_FOUND}). $SETUP_HINT" >&2
  exit 1
fi
echo "✓ VM RUNNING: $VM ($ZONE)"

# 컨테이너에 주입하는 비밀 3종. 존재 + ENABLED 버전 + relay SA 접근권까지 본다.
# (`gh-radar-kb-vpn-password` 는 host systemd 소관이라 컨테이너 배포의 전제가 아니다.)
for SECRET_NAME in gh-radar-supabase-service-role gh-radar-dma-cred-key gh-radar-relay-order-secret; do
  if ! gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET_NAME' not found. $SETUP_HINT" >&2
    exit 1
  fi
  VERSION_COUNT=$(gcloud secrets versions list "$SECRET_NAME" --filter='state=ENABLED' \
    --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${VERSION_COUNT:-0}" -lt 1 ]]; then
    echo "ERROR: Secret '$SECRET_NAME' 에 ENABLED 버전이 없습니다 — 값 주입이 선행돼야 합니다." >&2
    echo "       (값은 대화·커밋에 남기지 않는다. infra/relay/README.md §Secret 3종 값 주입 참조)" >&2
    exit 1
  fi
  if ! gcloud secrets get-iam-policy "$SECRET_NAME" --format='value(bindings.members)' 2>/dev/null \
      | grep -q "$RELAY_SA"; then
    echo "ERROR: '$RELAY_SA' 에 Secret '$SECRET_NAME' 접근권이 없습니다. $SETUP_HINT" >&2
    exit 1
  fi
done
echo "✓ Secret 3종 존재 + ENABLED 버전 + relay SA 접근권"

# 방화벽은 **정확히 3규칙**이어야 한다. 포트 80 규칙이 늘어나면 D-09 위반이므로 이름까지 본다.
# (`--filter='... AND allowed.ports=80'` 형태는 기대대로 걸러지지 않는다 — 전체 목록을 읽는다.)
FW_RULES=$(gcloud compute firewall-rules list --filter="network=${VPC}" --format='value(name)' | sort | tr '\n' ' ')
EXPECTED_FW="relay-allow-https relay-allow-iap-ssh relay-allow-internal-order "
if [[ "$FW_RULES" != "$EXPECTED_FW" ]]; then
  echo "ERROR: ${VPC} 방화벽 규칙이 기대와 다릅니다." >&2
  echo "  expected: $EXPECTED_FW" >&2
  echo "  actual  : $FW_RULES" >&2
  echo "  $SETUP_HINT" >&2
  exit 1
fi
echo "✓ 방화벽 3규칙 (포트 80 규칙 없음)"

# ───────────────────────────────────────────────────────────────
# Section 4: amd64 빌드 + push  (rollback 에서는 건너뛴다)
#   VM 은 x86_64 인데 개발기는 arm64 Mac 이다. 플랫폼을 고정하지 않으면
#   `exec format error` 로 컨테이너가 즉시 죽는다.
# ───────────────────────────────────────────────────────────────
if [[ "$MODE" == deploy ]]; then
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null 2>&1 || true

  echo "▶ docker build..."
  docker build \
    --platform=linux/amd64 \
    --build-arg "GIT_SHA=${SHA}" \
    -f relay/Dockerfile \
    -t "$IMAGE" -t "$IMAGE_LATEST" .

  echo "▶ docker push..."
  docker push "$IMAGE"
  docker push "$IMAGE_LATEST"
  echo "✓ pushed: $IMAGE"
else
  if ! gcloud artifacts docker images describe "$TARGET_IMAGE" >/dev/null 2>&1; then
    echo "ERROR: rollback 대상 이미지가 없습니다: $TARGET_IMAGE" >&2
    exit 1
  fi
  echo "✓ rollback 대상 이미지 확인: $TARGET_IMAGE"
fi

# ───────────────────────────────────────────────────────────────
# Section 5: VM 배포 (IAP SSH)
#
#   원격 스크립트는 base64 로 감싸 넘긴다. `--command` 문자열에 따옴표가 섞이면
#   로컬 셸 → gcloud → ssh → 원격 셸 4중 인용을 통과하며 조용히 깨진다.
#
#   head(공개 설정) + body(리터럴) 로 나눈 이유: body 를 인용 heredoc 으로 두면
#   원격에서 쓰는 `$VAR` 가 로컬에서 전개되지 않는다. 비밀은 head 에도 body 에도 없다.
# ───────────────────────────────────────────────────────────────
REMOTE_HEAD=$(printf 'PROJECT=%q\nTARGET_IMAGE=%q\nCONTAINER=%q\nAPP_VERSION=%q\nLOG_LEVEL=%q\nSUPABASE_URL=%q\nWS_PORT=%q\nORDER_API_PORT=%q\nDMA_HOST=%q\nDMA_PORT=%q\nDMA_BROKER=%q\n' \
  "$EXPECTED_PROJECT" "$TARGET_IMAGE" "$CONTAINER" "$APP_VERSION" "$LOG_LEVEL" \
  "$SUPABASE_URL" "$WS_PORT" "$ORDER_API_PORT" "$DMA_HOST" "$DMA_PORT" "$DMA_BROKER")

REMOTE_BODY=$(cat <<'REMOTE_BODY_EOF'
set -euo pipefail
log() { printf '  [vm] %s\n' "$*"; }

MD_URL="http://metadata.google.internal/computeMetadata/v1"
MD_HDR="Metadata-Flavor: Google"

# Secret Manager REST 접근용 액세스 토큰. VM 에 gcloud 를 설치하지 않아도 된다.
ACCESS_TOKEN="$(curl -sf -H "$MD_HDR" "${MD_URL}/instance/service-accounts/default/token" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')"
[ -n "$ACCESS_TOKEN" ] || { echo "메타데이터 액세스 토큰 획득 실패" >&2; exit 1; }

fetch_secret() {
  curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/$1/versions/latest:access" \
    | python3 -c 'import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode("utf-8").rstrip("\r\n"), end="")'
}

# Artifact Registry 토큰은 1시간 만료 — pull 직전에 로그인한다.
/usr/local/sbin/relay-docker-login >/dev/null
log "Artifact Registry 로그인"

docker pull "$TARGET_IMAGE" >/dev/null
log "pull 완료: $TARGET_IMAGE"

# `docker login` 은 액세스 토큰을 /root/.docker/config.json 에 **평문으로** 남긴다
# (docker 가 경고로 알려 준다). 이미지를 이미 받았으니 자격증명을 붙들고 있을 이유가 없다 —
# 재시작 정책은 로컬 이미지를 쓰므로 로그아웃해도 컨테이너 복구에 지장이 없다.
docker logout "$(echo "$TARGET_IMAGE" | cut -d/ -f1)" >/dev/null 2>&1 || true

# ── 비밀 3종 → tmpfs env-file (T-15-29) ────────────────────────
# /dev/shm 는 tmpfs 라 디스크에 닿지 않는다. 0600 + trap 삭제로 실행 직후 사라진다.
umask 077
ENV_FILE="$(mktemp /dev/shm/relay-env.XXXXXXXX)"
trap 'rm -f "$ENV_FILE"' EXIT
chmod 600 "$ENV_FILE"

SB_KEY="$(fetch_secret gh-radar-supabase-service-role)"
CRED_KEY="$(fetch_secret gh-radar-dma-cred-key)"
ORDER_SECRET="$(fetch_secret gh-radar-relay-order-secret)"
# 빈 값 검사 — 값이 아니라 **어느 키가 비었는지**만 남긴다.
[ -n "$SB_KEY" ]       || { echo "빈 비밀: supabase service role" >&2; exit 1; }
[ -n "$CRED_KEY" ]     || { echo "빈 비밀: dma cred key" >&2; exit 1; }
[ -n "$ORDER_SECRET" ] || { echo "빈 비밀: relay order secret" >&2; exit 1; }
log "비밀 3종 획득 (값은 기록하지 않음)"

{
  printf 'NODE_ENV=production\n'
  printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL"
  printf 'APP_VERSION=%s\n' "$APP_VERSION"
  printf 'SUPABASE_URL=%s\n' "$SUPABASE_URL"
  printf 'WS_PORT=%s\n' "$WS_PORT"
  printf 'ORDER_API_PORT=%s\n' "$ORDER_API_PORT"
  printf 'DMA_HOST=%s\n' "$DMA_HOST"
  printf 'DMA_PORT=%s\n' "$DMA_PORT"
  printf 'DMA_BROKER=%s\n' "$DMA_BROKER"
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SB_KEY"
  printf 'DMA_CRED_KEY=%s\n' "$CRED_KEY"
  printf 'RELAY_ORDER_SECRET=%s\n' "$ORDER_SECRET"
} > "$ENV_FILE"

# ── 컨테이너 교체 ──────────────────────────────────────────────
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# --network=host 인 이유(D-05/D-07):
#   ① 아웃바운드가 host 라우팅 테이블을 그대로 탄다 — KB 대역은 openconnect 의 tun0,
#      나머지는 ens4. 브리지 네트워크였다면 VPN 이 올라올 때마다 컨테이너 쪽 경로를
#      따로 손봐야 한다.
#   ② Caddy 가 127.0.0.1:8090 / 127.0.0.1:8091 로 프록시한다. host 네트워크면
#      포트 매핑 없이 그대로 맞는다.
# 메모리 유계 이유(Pitfall 11):
#   e2-micro 는 1GB 다. 상한이 없으면 relay 가 새어도 OOM killer 가 호스트 전체
#   (Caddy·openconnect·sshd 포함)에서 희생자를 고른다. 상한을 걸면 컨테이너만 죽고
#   재시작 정책이 되살린다. swap 포함 상한은 그 2배로 둔다.
docker run -d \
  --name "$CONTAINER" \
  --restart=always \
  --network=host \
  --memory=384m \
  --memory-swap=768m \
  --log-driver=json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  --env-file "$ENV_FILE" \
  "$TARGET_IMAGE" >/dev/null
log "컨테이너 기동: $CONTAINER"

# env-file 은 여기서 사라진다. docker 는 이미 컨테이너 설정에 값을 복사했으므로
# 재시작(restart 정책)에도 env 는 유지된다.
rm -f "$ENV_FILE"

# ── 기동 확인 ──────────────────────────────────────────────────
HEALTH_OK=0
for _ in $(seq 1 20); do
  if curl -sf --max-time 3 "http://127.0.0.1:${ORDER_API_PORT}/healthz" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

STATUS="$(docker ps --filter "name=${CONTAINER}" --format '{{.Status}}')"
log "docker ps: ${STATUS:-<없음>}"
if [ "$HEALTH_OK" -ne 1 ]; then
  echo "  [vm] /healthz 응답 없음 — 최근 로그 40줄:" >&2
  docker logs --tail 40 "$CONTAINER" >&2 || true
  exit 1
fi
log "/healthz 200: $(curl -s --max-time 5 "http://127.0.0.1:${ORDER_API_PORT}/healthz")"

# 메모리 실측 (Pitfall 11 — 합계 700MB 초과 시 e2-small 전환 검토)
log "free -m: $(free -m | awk '/^Mem:/{printf "total=%s used=%s available=%s", $2, $3, $7}')"
log "docker stats: $(docker stats --no-stream --format '{{.MemUsage}} cpu={{.CPUPerc}}' "$CONTAINER")"
REMOTE_BODY_EOF
)

REMOTE_SCRIPT="${REMOTE_HEAD}
${REMOTE_BODY}"
REMOTE_B64=$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')

echo "▶ IAP SSH 배포: $VM ..."
gcloud compute ssh "$VM" \
  --tunnel-through-iap \
  --zone="$ZONE" \
  --project="$EXPECTED_PROJECT" \
  --command="echo '${REMOTE_B64}' | base64 -d | sudo bash -s"
echo "✓ VM 배포 완료"

if [[ "$MODE" == rollback ]]; then
  echo ""
  echo "✅ Rolled back @ $TARGET_IMAGE"
  echo "Next: bash scripts/smoke-relay.sh"
  exit 0
fi

# ───────────────────────────────────────────────────────────────
# Section 6: uptime check + 알림 정책 (멱등 — update-or-create)
#   Cloud Run Job 처럼 "실행 실패" 메트릭이 없다. 상시 프로세스의 가용성은
#   외부에서 실제로 두드려 보는 uptime check 가 유일한 근거다.
#   `--validate-ssl=true` 라 인증서 만료도 같은 알림으로 잡힌다 (T-15-13).
# ───────────────────────────────────────────────────────────────
EXISTING_UPTIME=$(gcloud monitoring uptime list-configs \
  --filter="displayName=${UPTIME_CHECK}" --format='value(name)' 2>/dev/null | head -1)

if [[ -n "$EXISTING_UPTIME" ]]; then
  echo "▶ uptime check update: $UPTIME_CHECK ..."
  gcloud monitoring uptime update "$EXISTING_UPTIME" \
    --period=1 --timeout=10 --validate-ssl=true --status-classes=2xx >/dev/null
else
  echo "▶ uptime check create: $UPTIME_CHECK ..."
  gcloud monitoring uptime create "$UPTIME_CHECK" \
    --resource-type=uptime-url \
    --resource-labels="host=${HEALTH_HOST},project_id=${EXPECTED_PROJECT}" \
    --protocol=https \
    --port=443 \
    --path=/healthz \
    --period=1 \
    --timeout=10 \
    --validate-ssl=true \
    --status-classes=2xx >/dev/null
fi
echo "✓ uptime check ready: $UPTIME_CHECK → https://${HEALTH_HOST}/healthz"

ALERT_FILE="ops/alert-relay-down.yaml"
if [[ -f "$ALERT_FILE" ]]; then
  : "${NOTIFICATION_CHANNEL_ID:?NOTIFICATION_CHANNEL_ID must be set for alert policy}"
  # gcloud monitoring 은 notificationChannels 에 full resource name 을 요구 — ID 만 주어지면 정규화.
  CHANNEL_RESOURCE="$NOTIFICATION_CHANNEL_ID"
  case "$CHANNEL_RESOURCE" in
    projects/*) ;;
    *) CHANNEL_RESOURCE="projects/${EXPECTED_PROJECT}/notificationChannels/${NOTIFICATION_CHANNEL_ID}" ;;
  esac
  RESOLVED_YAML=$(mktemp)
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${CHANNEL_RESOURCE}|g" "$ALERT_FILE" > "$RESOLVED_YAML"

  EXISTING_POLICY=$(gcloud alpha monitoring policies list \
    --filter="displayName=${ALERT_POLICY}" \
    --format='value(name)' 2>/dev/null | head -1)

  if [[ -n "$EXISTING_POLICY" ]]; then
    echo "▶ updating alert policy: ${ALERT_POLICY} ..."
    gcloud alpha monitoring policies update "$EXISTING_POLICY" --policy-from-file="$RESOLVED_YAML" >/dev/null
  else
    echo "▶ creating alert policy: ${ALERT_POLICY} ..."
    gcloud alpha monitoring policies create --policy-from-file="$RESOLVED_YAML" >/dev/null
  fi
  rm -f "$RESOLVED_YAML"
  echo "✓ Alert policy ready: $ALERT_POLICY"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Deployed @ $TARGET_IMAGE"
echo "   VM:        $VM ($ZONE)"
echo "   Container: $CONTAINER (재시작 정책 always · 384MB 상한)"
echo "   DMA_HOST:  $DMA_HOST : $DMA_PORT"
echo "   Public:    https://${HEALTH_HOST}/healthz"
echo ""
echo "Next: bash scripts/smoke-relay.sh"
