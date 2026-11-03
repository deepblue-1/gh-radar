#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-tickgw.sh
# Phase 37 (D-05 · D-06 · D-07 · D-22) — 당일 틱 경로 컨테이너 tickgw 를 GCE VM radar-gw 에 배포
#
# ⚠️ 언제 · 누가:
#   - **평일 21:00 KST 이후에만.** radar-gw 는 주문 경로 relay 와 gh-trade 운반기가 같이 사는 공유 호스트다
#     (docs/relay-operations.md 「radar-gw 호스트 공유」). 장중에는 시각 가드가 종료 2 로 막는다.
#     20:00~21:00 도 막는다(WR-34): tickgw 당일 캐시는 메모리뿐이고 20:01 마감 마무리 → 승격 Job 20:10 · 20:40 이 그 메모리를
#     읽는다(TICKGW_KEEP_UNTIL 21:00 도 같은 전제). 그 사이 컨테이너를 바꾸면 그날 승격 입력이 통째로 사라진다.
#   - **메인 세션이 돌린다**(서브에이전트 배포는 분류기 차단). IAP SSH 는 샌드박스가 막으므로 dangerouslyDisableSandbox.
#   - **relay 먼저 · push 나중** — git push 자체가 webapp 프로덕션 배포다. tickgw · server 결선이 끝난 뒤 push.
#   - D-22: 119 인덱서(gh-trade)가 확인된 뒤에만 켠다. 그 전 server 는 TICKGW_URL 미설정 → 503(「당일 자료 준비 중」).
#
# 선행:
#   1) GCP_PROJECT_ID=gh-radar bash scripts/setup-tickgw-iam.sh   (방화벽 tcp:8092 · Secret gh-radar-tickgw-secret · accessor)
#   2) radar-gw 에서 sudo bash infra/relay/tickpull/install.sh --host-fp SHA256:…   (tickpull 사용자 · 키 · known_hosts)
#   3) 119 authorized_keys 에 radar-gw-tickpull 등록(gh-trade 사용자)
#
# 사용법:
#   GCP_PROJECT_ID=gh-radar bash scripts/deploy-tickgw.sh
#   GCP_PROJECT_ID=gh-radar bash scripts/deploy-tickgw.sh --allow-daytime   # 시각 가드 해제 — 시험 전용
#   bash scripts/deploy-tickgw.sh --self-test                               # 순수 함수 단언(네트워크 · gcloud 없음)
#   ALLOW_DIRTY=1 …                                                         # 빌드 입력이 HEAD 와 달라도 배포(태그 <sha>-dirty · IN-33)
#
# 하는 일:
#   ① gcloud guard → ② 시각 가드 → ③ radar-gw 에서 `id -u/-g tickpull` 을 먼저 읽는다(없으면 「tickpull 미설치」 종료 2)
#   → ④ Secret ENABLED 버전 확인 → ⑤ 이미지 빌드(amd64 · 빌드 인자 TICKPULL_UID/GID — 컨테이너 안 ssh 가 tickpull uid 로
#      getpwuid 에 성공해야 한다) · push → ⑥ IAP SSH 원격 스크립트: VM 메타데이터 자격으로 Secret 을 읽어 tmpfs env-file
#      (/dev/shm · 0600 · trap 삭제)에 쓰고 docker pull · 기존 tickgw 교체 · docker run(256MB · OOM 점수 500 · tickpull uid ·
#      키 디렉터리 읽기 전용 마운트) · /healthz 20회 확인 · ssh 자기 시험(`id -un` = tickpull ·
#      `ssh -G <119>` 설정 해석 — 119 에는 닿지 않는다) · env-file 삭제. 확인이 실패하면 새 컨테이너를 지우고 **교체 전
#      이미지로 다시 기동**(되돌림 · WR-34 — tickgw 가 하나도 없는 상태로 남지 않게) · 종료 1 → ⑦ server 결선 안내.
#
# 비밀 위생: 값은 Mac 에 오지 않는다 — VM 이 메타데이터 토큰으로 Secret Manager REST 를 읽어 tmpfs 에만 쓴다
#   (deploy-relay.sh 와 같은 꼴). 명령줄 · 로그에 값이 남지 않는다.
#
# 종료코드: 0 정상 · 1 배포 실패 · 2 사용법 · 가드 · 선행 미충족
# ═══════════════════════════════════════════════════════════════

VM=radar-gw
ZONE=asia-northeast3-a
REGION=asia-northeast3
REPO=gh-radar
CONTAINER=tickgw
SECRET_NAME=gh-radar-tickgw-secret
TICKGW_PORT=8092
TICKGW_INDEXER_HOST="${TICKGW_INDEXER_HOST:-smok95@10.16.207.119}"
LOG_LEVEL="${LOG_LEVEL:-info}"

die() { echo "[deploy-tickgw] ERROR $1" >&2; exit "${2:-1}"; }

# daytime_blocked DOW HHMM — 월~금(1~5) 08:00 ≤ HHMM < 21:00 이면 참(0). 호출자는 TZ=Asia/Seoul 로 값을 구한다
#   끝이 21:00 인 근거(WR-34): 20:01 마감 마무리 · 승격 Job 20:10 · 20:40 · TICKGW_KEEP_UNTIL 21:00 이 메모리 캐시를 읽는다
daytime_blocked() {
  local dow=$1 hhmm=$((10#$2))
  (( dow >= 1 && dow <= 5 && hhmm >= 800 && hhmm < 2100 ))
}

# parse_ids TEXT — `id -u` · `id -g` 두 줄에서 숫자 둘을 "UID GID" 로. 아니면 실패
parse_ids() {
  local uid gid
  uid=$(printf '%s\n' "$1" | tr -d '\r' | grep -E '^[0-9]+$' | sed -n 1p)
  gid=$(printf '%s\n' "$1" | tr -d '\r' | grep -E '^[0-9]+$' | sed -n 2p)
  [[ -n $uid && -n $gid ]] || return 1
  printf '%s %s\n' "$uid" "$gid"
}

self_test() {
  local n=0 c dow hhmm want rc got
  for c in '1 0800 1' '1 0759 0' '5 1959 1' '5 2000 1' '5 2059 1' '5 2100 0' '6 1200 0' '7 0900 0' '3 2130 0' '2 1200 1'; do
    read -r dow hhmm want <<<"$c"
    rc=0
    daytime_blocked "$dow" "$hhmm" || rc=1
    if { [[ $want == 1 ]] && (( rc != 0 )); } || { [[ $want == 0 ]] && (( rc == 0 )); }; then
      echo "self-test FAIL daytime_blocked $dow $hhmm (기대 차단=$want)" >&2; exit 1
    fi
    n=$((n + 1))
  done
  got=$(parse_ids $'996\r\n995\n') || { echo "self-test FAIL parse_ids" >&2; exit 1; }
  [[ $got == '996 995' ]] || { echo "self-test FAIL parse_ids: $got" >&2; exit 1; }
  n=$((n + 1))
  if parse_ids $'id: tickpull: no such user\n' >/dev/null; then echo "self-test FAIL parse_ids(no user)" >&2; exit 1; fi
  n=$((n + 1))
  echo "self-test OK $n cases"
}

ALLOW_DAYTIME=0
for ARG in "$@"; do
  case "$ARG" in
    --self-test) self_test; exit 0 ;;
    --allow-daytime) ALLOW_DAYTIME=1 ;;
    -h|--help) sed -n '4,41p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument '$ARG'" 2 ;;
  esac
done

# ── ① gcloud guard ────────────────────────────────────────────
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"
[[ -n "$EXPECTED_PROJECT" ]] || die "GCP_PROJECT_ID env var is required" 2
ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  die "gcloud config mismatch (config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT)" 2
fi
echo "✓ guard: config=$ACTIVE_CONFIG project=$ACTIVE_PROJECT"

# ── ② 시각 가드 — 평일 08:00~21:00 KST 금지(장중 + 승격 창) ──────────
KST_DOW=$(TZ=Asia/Seoul date +%u)
KST_HHMM=$(TZ=Asia/Seoul date +%H%M)
if (( ! ALLOW_DAYTIME )) && daytime_blocked "$KST_DOW" "$KST_HHMM"; then
  die "평일 08:00~21:00 KST(지금 ${KST_HHMM}) — 장중은 radar-gw 공유 호스트 규칙, 20:00~21:00 은 승격 창(마감 마무리 20:01 · 승격 Job 20:10 · 20:40 · KEEP_UNTIL 21:00 — 교체하면 그날 승격 입력 소실). 21:00 이후에 배포한다 (시험만 --allow-daytime)" 2
fi
echo "✓ 시각 가드 통과 (KST dow=${KST_DOW} ${KST_HHMM}$( (( ALLOW_DAYTIME )) && echo ' · --allow-daytime'))"

# ── ③ tickpull uid/gid 를 먼저 읽는다 ───────────────────────────
echo "▶ radar-gw tickpull uid/gid 조회 ..."
# 첫 줄 REMOTE_OK = VM 에 닿았다는 표지(IN-33) — 없으면 IAP · ssh · 샌드박스 실패이지 tickpull 미설치가 아니다
IDS_RC=0
IDS_RAW=$(gcloud compute ssh "$VM" --zone="$ZONE" --project="$EXPECTED_PROJECT" --tunnel-through-iap \
  --command 'echo REMOTE_OK; id -u tickpull && id -g tickpull && sudo test -f /var/lib/tickpull/.ssh/id_ed25519 && sudo test -f /var/lib/tickpull/.ssh/known_hosts && echo KEYS_OK' \
  2>/dev/null) || IDS_RC=$?
printf '%s\n' "$IDS_RAW" | grep -q '^REMOTE_OK' \
  || die "IAP SSH 실패(gcloud compute ssh 종료 ${IDS_RC}) — radar-gw 에 닿지 못했다. 샌드박스면 dangerouslyDisableSandbox · IAP 방화벽 · gcloud 인증 확인 (tickpull 설치 여부는 아직 모른다)" 2
IDS=$(parse_ids "$IDS_RAW") || die "tickpull 미설치 — radar-gw 에서 infra/relay/tickpull/install.sh 먼저 (docs/relay-operations.md 「tickgw」)" 2
printf '%s\n' "$IDS_RAW" | grep -q '^KEYS_OK' \
  || die "tickpull 키 · known_hosts 없음 — radar-gw 에서 infra/relay/tickpull/install.sh 다시 (키는 없을 때만 만든다)" 2
read -r TICKPULL_UID TICKPULL_GID <<<"$IDS"
echo "✓ tickpull uid=${TICKPULL_UID} gid=${TICKPULL_GID}"

# ── ④ Secret 버전 확인(값은 읽지 않는다) ─────────────────────────
if [[ -z "$(gcloud secrets versions list "$SECRET_NAME" --project="$EXPECTED_PROJECT" --filter='state=ENABLED' --format='value(name)' --limit=1 2>/dev/null || true)" ]]; then
  die "Secret $SECRET_NAME 에 ENABLED 버전이 없다 — 사용자가 \`! GCP_PROJECT_ID=$EXPECTED_PROJECT bash scripts/setup-tickgw-iam.sh\`" 2
fi
echo "✓ secret: $SECRET_NAME (ENABLED 버전 있음)"

# ── ⑤ amd64 빌드 + push ───────────────────────────────────────
SHA=$(git rev-parse --short HEAD)
# IN-33 — 이미지 태그 · APP_VERSION 은 HEAD SHA 인데 빌드는 작업 트리다. 빌드 입력(Dockerfile COPY 경로)이 HEAD 와 다르면
#   운영 이미지와 커밋이 어긋나므로 막는다. 일부러 그대로 올리려면 ALLOW_DIRTY=1 — 태그 · APP_VERSION 에 -dirty-<epoch초> 를 붙인다
#   (R2-IN-07 — 같은 HEAD 에서 두 번 dirty 배포해도 태그가 겹쳐 앞 이미지를 덮지 않게 매번 다른 접미).
BUILD_PATHS=(package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tickgw)
if [[ -n "$(git status --porcelain -- "${BUILD_PATHS[@]}")" ]]; then
  if [[ "${ALLOW_DIRTY:-0}" == "1" ]]; then
    SHA="${SHA}-dirty-$(date +%s)"
    echo "⚠ 빌드 입력이 HEAD 와 다르다 — ALLOW_DIRTY=1 · 태그 ${SHA}"
  else
    git status --short -- "${BUILD_PATHS[@]}" >&2
    die "빌드 입력(${BUILD_PATHS[*]})에 커밋 안 된 변경이 있다 — 커밋하거나 깨끗한 worktree 에서 배포 (그대로 올리려면 ALLOW_DIRTY=1 · 태그 -dirty-<epoch초>)" 2
  fi
fi
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/tickgw:${SHA}"
IMAGE_LATEST="${REGISTRY}/tickgw:latest"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null 2>&1 || true
echo "▶ docker build (TICKPULL_UID=${TICKPULL_UID} TICKPULL_GID=${TICKPULL_GID}) ..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  --build-arg "TICKPULL_UID=${TICKPULL_UID}" \
  --build-arg "TICKPULL_GID=${TICKPULL_GID}" \
  -f tickgw/Dockerfile \
  -t "$IMAGE" -t "$IMAGE_LATEST" .
echo "▶ docker push ..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"
echo "✓ pushed: $IMAGE"

# ── ⑥ VM 배포(IAP SSH) — head(공개 설정) + body(리터럴) · base64 ───
REMOTE_HEAD=$(printf 'PROJECT=%q\nTARGET_IMAGE=%q\nCONTAINER=%q\nAPP_VERSION=%q\nLOG_LEVEL=%q\nSECRET_NAME=%q\nTICKGW_PORT=%q\nTICKGW_INDEXER_HOST=%q\nTICKPULL_UID=%q\nTICKPULL_GID=%q\n' \
  "$EXPECTED_PROJECT" "$IMAGE" "$CONTAINER" "$SHA" "$LOG_LEVEL" "$SECRET_NAME" "$TICKGW_PORT" \
  "$TICKGW_INDEXER_HOST" "$TICKPULL_UID" "$TICKPULL_GID")

REMOTE_BODY=$(cat <<'REMOTE_BODY_EOF'
set -euo pipefail
log() { printf '  [vm] %s\n' "$*"; }

MD_URL="http://metadata.google.internal/computeMetadata/v1"
MD_HDR="Metadata-Flavor: Google"
ACCESS_TOKEN="$(curl -sf -H "$MD_HDR" "${MD_URL}/instance/service-accounts/default/token" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')"
[ -n "$ACCESS_TOKEN" ] || { echo "메타데이터 액세스 토큰 획득 실패" >&2; exit 1; }

fetch_secret() {
  curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/$1/versions/latest:access" \
    | python3 -c 'import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode("utf-8").rstrip("\r\n"), end="")'
}

[ "$(id -u tickpull)" = "$TICKPULL_UID" ] && [ "$(id -g tickpull)" = "$TICKPULL_GID" ] \
  || { echo "tickpull uid/gid 가 빌드 때와 다르다 — 다시 배포" >&2; exit 1; }

/usr/local/sbin/relay-docker-login >/dev/null
docker pull "$TARGET_IMAGE" >/dev/null
log "pull 완료: $TARGET_IMAGE"
docker logout "$(echo "$TARGET_IMAGE" | cut -d/ -f1)" >/dev/null 2>&1 || true

# ── 비밀 → tmpfs env-file (/dev/shm · 0600 · trap 삭제) ──
umask 077
ENV_FILE="$(mktemp /dev/shm/tickgw-env.XXXXXXXX)"
trap 'rm -f "$ENV_FILE"' EXIT
chmod 600 "$ENV_FILE"
TG_SECRET="$(fetch_secret "$SECRET_NAME")"
[ "${#TG_SECRET}" -ge 32 ] || { echo "빈 · 짧은 비밀: $SECRET_NAME" >&2; exit 1; }
log "비밀 획득 (값은 기록하지 않음)"
{
  printf 'NODE_ENV=production\n'
  printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL"
  printf 'APP_VERSION=%s\n' "$APP_VERSION"
  printf 'TICKGW_PORT=%s\n' "$TICKGW_PORT"
  printf 'TICKGW_INDEXER_HOST=%s\n' "$TICKGW_INDEXER_HOST"
  printf 'TICKGW_SSH_KEY=/ssh/id_ed25519\n'
  printf 'TICKGW_KNOWN_HOSTS=/ssh/known_hosts\n'
  printf 'TICKGW_SECRET=%s\n' "$TG_SECRET"
} > "$ENV_FILE"
unset TG_SECRET

# ── 컨테이너 교체 — 되돌림용으로 교체 전 이미지를 적어 두고 kill → 3초(Ops Agent 가 옛 로그 끝까지 읽게) → rm ──
# 되돌림은 태그가 아니라 이미지 ID(sha256:…)로 잡는다(R2-IN-07) — 같은 태그를 다시 pull 해 태그가 새 이미지로 옮겨 가도
#   교체 전 컨테이너가 쓰던 이미지 그 자체로 되돌린다. 같은 이미지(ID 같음)면 되돌릴 것이 없다.
PREV_IMAGE="$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null || true)"
PREV_REF="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)"
TARGET_ID="$(docker image inspect --format '{{.Id}}' "$TARGET_IMAGE" 2>/dev/null || true)"
if [ -n "$PREV_IMAGE" ]; then
  log "교체 전 이미지: $PREV_REF ($PREV_IMAGE)"
  docker kill "$CONTAINER" >/dev/null 2>&1 || true
  sleep 3
fi
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# --network=host: 119 경로(WireGuard/VPN 라우팅)를 host 그대로 타고, server(Cloud Run 서브넷)가 radar-gw:8092 로 닿는다.
# --memory=256m(스왑 없음) + --oom-score-adj=500: 메모리가 모자라면 주문 경로 relay(384MB)보다 **먼저** 죽는다
#   — gh-trade 소유 tick-archive · limitup-pull 유닛의 OOMScoreAdjust 500 과 같은 방향(docs/relay-operations.md).
# --user tickpull uid:gid + /var/lib/tickpull/.ssh 읽기 전용 마운트: 컨테이너 안 ssh 가 tickpull 키만 쓴다.
run_container() {
  docker run -d \
    --name "$CONTAINER" \
    --restart=always \
    --network=host \
    --memory=256m \
    --memory-swap=256m \
    --oom-score-adj=500 \
    --user "${TICKPULL_UID}:${TICKPULL_GID}" \
    -v /var/lib/tickpull/.ssh:/ssh:ro \
    --log-driver=json-file \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    --env-file "$ENV_FILE" \
    "$1" >/dev/null
}

wait_health() {
  local _
  for _ in $(seq 1 20); do
    if curl -sf --max-time 3 "http://127.0.0.1:${TICKGW_PORT}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# fail_rollback MSG — 새 컨테이너를 지우고 교체 전 이미지로 다시 기동한다(WR-34 — tickgw 가 0개로 남지 않게). 언제나 종료 1
fail_rollback() {
  echo "  [vm] $1" >&2
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if [ -n "$PREV_IMAGE" ] && [ "$PREV_IMAGE" != "$TARGET_ID" ]; then
    log "되돌림: 교체 전 이미지로 다시 기동 — $PREV_REF ($PREV_IMAGE)"
    if run_container "$PREV_IMAGE" && wait_health; then
      log "되돌림 OK — 옛 tickgw 가 돈다(새 이미지 배포는 실패 · 종료 1)"
    else
      echo "  [vm] 되돌림도 실패 — tickgw 없음(server /api/ticks/live 502). docker logs $CONTAINER 확인" >&2
    fi
  else
    echo "  [vm] 되돌릴 교체 전 이미지가 없다(첫 배포 · 같은 이미지 ID) — tickgw 없음(server /api/ticks/live 502)" >&2
  fi
  exit 1
}

run_container "$TARGET_IMAGE" || fail_rollback "docker run 실패"
log "컨테이너 기동: $CONTAINER"

# ── 기동 확인 ──
if ! wait_health; then
  echo "  [vm] /healthz 응답 없음 — 최근 로그 40줄:" >&2
  docker logs --tail 40 "$CONTAINER" >&2 || true
  fail_rollback "/healthz 실패"
fi
log "/healthz 200: $(curl -s --max-time 5 "http://127.0.0.1:${TICKGW_PORT}/healthz")"

# ── ssh 자기 시험 — getpwuid · 설정 해석만(119 에는 닿지 않는다) ──
WHO="$(docker exec "$CONTAINER" id -un 2>/dev/null || true)"
if [ "$WHO" != "tickpull" ]; then
  fail_rollback "자기 시험 실패: 컨테이너 사용자 '${WHO}' ≠ tickpull"
fi
if ! docker exec "$CONTAINER" ssh -G "$TICKGW_INDEXER_HOST" >/dev/null 2>&1; then
  docker exec "$CONTAINER" ssh -G "$TICKGW_INDEXER_HOST" 2>&1 | tail -3 >&2 || true
  fail_rollback "자기 시험 실패: ssh -G (No user exists for uid 등)"
fi
if ! docker exec "$CONTAINER" test -r /ssh/id_ed25519; then
  fail_rollback "자기 시험 실패: /ssh/id_ed25519 를 읽을 수 없다(uid · 마운트)"
fi
# 되돌림이 env-file 을 다시 쓰므로 확인이 끝난 뒤에 지운다(그 사이에도 tmpfs · 0600 · EXIT trap)
rm -f "$ENV_FILE"
log "자기 시험 OK (id -un=tickpull · ssh -G · 키 읽기)"
log "docker ps: $(docker ps --filter "name=${CONTAINER}" --format '{{.Status}}')"
log "docker stats: $(docker stats --no-stream --format '{{.MemUsage}} cpu={{.CPUPerc}}' "$CONTAINER")"
REMOTE_BODY_EOF
)

REMOTE_B64=$(printf '%s\n%s' "$REMOTE_HEAD" "$REMOTE_BODY" | base64 | tr -d '\n')
echo "▶ IAP SSH 배포: $VM ..."
gcloud compute ssh "$VM" \
  --tunnel-through-iap \
  --zone="$ZONE" \
  --project="$EXPECTED_PROJECT" \
  --command="echo '${REMOTE_B64}' | base64 -d | sudo bash -s"
echo "✓ VM 배포 완료: $IMAGE"

# ── ⑦ server 결선 안내 ────────────────────────────────────────
INTERNAL_IP=$(gcloud compute instances describe "$VM" --zone="$ZONE" --project="$EXPECTED_PROJECT" \
  --format='value(networkInterfaces[0].networkIP)' 2>/dev/null || echo '<radar-gw 내부 IP>')
echo ""
echo "✅ tickgw @ ${IMAGE}"
echo "   다음: server 에 TICKGW_URL=http://${INTERNAL_IP}:${TICKGW_PORT} · Secret ${SECRET_NAME} → TICKGW_SECRET 바인딩(deploy-server.sh · 37-15)"
echo "   확인: radar-gw 에서 docker logs tickgw · curl -s http://127.0.0.1:${TICKGW_PORT}/healthz"
echo "   변경 알림: radar-gw 공유 호스트 — gh-trade 인박스 노트 추기(docs/relay-operations.md)"
