#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# startup.sh — radar-gw GCE startup-script (Phase 15 RELAY-03)
#
# GCE 는 이 스크립트를 **매 부팅마다** 실행한다. 따라서 전 단계가 멱등이어야 한다.
# 재실행은 정상 동작이며, 아무것도 바꾸지 않는 것이 정상 결과다.
#
# ── 이 스크립트가 하지 않는 것 (의도적) ─────────────────────────
#   · openconnect 를 켜지 않는다. 부팅 자동 기동도 등록하지 않는다.
#     최초 연결은 D-03 선검증 체크포인트에서 사람이 직렬 콘솔을 열어 둔 채 수동 start 한다.
#   · Caddy 를 켜지 않는다. dma.jx1.io A 레코드가 dig 로 확인되기 전에 켜면
#     Let's Encrypt rate limit 을 소진한다 (T-15-13). 기동은 15-07 체크포인트 소관.
#   · relay 컨테이너를 띄우지 않는다. 이미지 배포는 15-08 의 deploy-relay.sh 소관.
#
# ── VM 자산 전달 경로 ───────────────────────────────────────────
#   VPN 스크립트 3종 · systemd 유닛 · Caddyfile 은 저장소가 단일 정본이고,
#   setup-relay-iam.sh 가 인스턴스 메타데이터에 실어 보낸다.
#   이 스크립트는 메타데이터 서버에서 읽어 배치만 한다 (저장소-VM 이중 관리 금지).
#   자산을 고친 뒤에는 아래로 갱신한다:
#     gcloud compute instances add-metadata radar-gw --zone=asia-northeast3-a \
#       --metadata-from-file=kbvpn-connect=infra/relay/kbvpn-connect.sh,...
#     그 다음 VM 재부팅 또는 `sudo google_metadata_script_runner startup`
# ═══════════════════════════════════════════════════════════════

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

METADATA_ROOT="http://metadata.google.internal/computeMetadata/v1"
METADATA_HEADER="Metadata-Flavor: Google"

log() { echo "[relay-startup] $*"; }

# 인스턴스 커스텀 메타데이터 속성 읽기 (없으면 비어 있는 상태로 실패 코드 반환)
md_attr() {
  curl -sf -H "$METADATA_HEADER" "${METADATA_ROOT}/instance/attributes/$1"
}

# 메타데이터 속성 → 파일 배치. install 이 덮어쓰므로 재실행 시 자산이 갱신된다.
install_asset() {
  local attr="$1" dest="$2" mode="$3" tmp
  tmp="$(mktemp)"
  if ! md_attr "$attr" >"$tmp" || [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    log "ERROR: 메타데이터 속성 '${attr}' 을 읽지 못했다 (setup-relay-iam.sh 재실행 필요)"
    return 1
  fi
  install -m "$mode" -o root -g root "$tmp" "$dest"
  rm -f "$tmp"
  log "✓ 배치: ${dest} (${mode})"
}

# ───────────────────────────────────────────────────────────────
# 1. swap 1GB — e2-micro 는 1024MB 뿐이라 OOM 여유가 필요하다 (Pitfall 11)
# ───────────────────────────────────────────────────────────────
if [[ ! -f /swapfile ]]; then
  log "▶ swap 1GB 생성..."
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
fi
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  swapon /swapfile
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
log "✓ swap ready (1G)"

# ───────────────────────────────────────────────────────────────
# 2. 기본 패키지
# ───────────────────────────────────────────────────────────────
log "▶ apt-get update / install..."
apt-get update -y
apt-get install -y --no-install-recommends \
  docker.io \
  openconnect \
  vpnc-scripts \
  ca-certificates \
  curl \
  python3 \
  unattended-upgrades \
  debian-keyring \
  debian-archive-keyring \
  apt-transport-https \
  gnupg \
  netcat-openbsd
log "✓ base packages ready"

# ───────────────────────────────────────────────────────────────
# 3. Docker 로그 로테이션
#    20GB 디스크에서 컨테이너 로그가 폭주하면 디스크 풀 → VM 정지로 직결된다.
# ───────────────────────────────────────────────────────────────
DOCKER_DAEMON_JSON='{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}'
mkdir -p /etc/docker
if [[ "$(cat /etc/docker/daemon.json 2>/dev/null || true)" != "$DOCKER_DAEMON_JSON" ]]; then
  log "▶ /etc/docker/daemon.json 갱신 (로그 로테이션)..."
  printf '%s\n' "$DOCKER_DAEMON_JSON" >/etc/docker/daemon.json
  systemctl restart docker
fi
log "✓ docker log rotation ready (max-size 10m / max-file 3)"

# ───────────────────────────────────────────────────────────────
# 4. Caddy 설치 — 단, 기동하지 않는다
# ───────────────────────────────────────────────────────────────
CADDY_KEYRING=/usr/share/keyrings/caddy-stable-archive-keyring.gpg
if [[ ! -f "$CADDY_KEYRING" ]]; then
  log "▶ Caddy apt 저장소 등록..."
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o "$CADDY_KEYRING"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
fi
if ! command -v caddy >/dev/null 2>&1; then
  log "▶ caddy 설치..."
  apt-get install -y caddy
fi

# 설치 직후 패키지가 자동 기동시킨 caddy 를 즉시 내리고 자동 기동을 해제한다.
# DNS A 레코드 확인 전 기동 = Let's Encrypt rate limit 소진 (T-15-13).
systemctl disable --now caddy >/dev/null 2>&1 || true
log "✓ caddy installed (정지 상태 유지 — 기동은 15-07 체크포인트)"

# Caddyfile 배치 + 로그 디렉터리
install_asset caddyfile /etc/caddy/Caddyfile 0644
install -d -m 0755 -o caddy -g caddy /var/log/caddy 2>/dev/null \
  || install -d -m 0755 /var/log/caddy

# CADDY_EMAIL 주입 — 공식 패키지 유닛은 EnvironmentFile 을 읽지 않으므로 드롭인을 쓴다.
if CADDY_EMAIL_VALUE="$(md_attr caddy-email)" && [[ -n "$CADDY_EMAIL_VALUE" ]]; then
  install -d -m 0755 /etc/systemd/system/caddy.service.d
  printf '[Service]\nEnvironment=CADDY_EMAIL=%s\n' "$CADDY_EMAIL_VALUE" \
    >/etc/systemd/system/caddy.service.d/10-env.conf
  log "✓ CADDY_EMAIL 드롭인 배치"
else
  log "· caddy-email 메타데이터 없음 — 만료 알림 이메일 없이 발급된다"
fi

# ───────────────────────────────────────────────────────────────
# 5. VPN 자산 배치 (기동은 하지 않는다)
# ───────────────────────────────────────────────────────────────
log "▶ VPN 자산 배치..."
install_asset kbvpn-fetch-secret  /usr/local/sbin/kbvpn-fetch-secret  0700
install_asset kbvpn-connect       /usr/local/sbin/kbvpn-connect       0700
install_asset kbvpn-vpnc-wrapper  /usr/local/sbin/kbvpn-vpnc-wrapper  0700
install_asset openconnect-service /etc/systemd/system/openconnect@.service 0644

# /etc/kbvpn.env — 서버 주소·authgroup·인증서 핀·계정 ID (비밀 값 아님, 그러나 0600).
# 메타데이터에 없으면 사람이 직접 작성한다. 없다고 해서 부팅을 실패시키지 않는다.
if [[ ! -f /etc/kbvpn.env ]]; then
  if md_attr kbvpn-env >/tmp/kbvpn.env.tmp 2>/dev/null && [[ -s /tmp/kbvpn.env.tmp ]]; then
    install -m 0600 -o root -g root /tmp/kbvpn.env.tmp /etc/kbvpn.env
    log "✓ /etc/kbvpn.env 배치 (0600)"
  else
    log "· /etc/kbvpn.env 없음 — D-03 선검증 전에 수동 작성 필요"
    log "  필요 키: KBVPN_SERVER · KBVPN_AUTHGROUP · KBVPN_SERVERCERT · KBVPN_USER"
  fi
  rm -f /tmp/kbvpn.env.tmp
fi

systemctl daemon-reload
# 의도적으로 자동 기동을 등록하지 않고 start 도 하지 않는다 (D-03).
log "✓ VPN 자산 배치 완료 (유닛 정지 상태 · 자동 기동 미등록)"

# ───────────────────────────────────────────────────────────────
# 6. Artifact Registry 인증 헬퍼
#    선택: gcloud/docker-credential-gcr 설치 대신 메타데이터 토큰 + docker login.
#    이유 — Debian 공개 이미지에 gcloud 가 있다고 가정할 수 없고(RESEARCH A4),
#    kbvpn-fetch-secret 과 동일하게 "추가 의존 0" 경로로 통일하는 편이
#    부팅 시간·디스크·공급망 표면 모두에서 유리하다.
#    토큰은 1시간 만료라 pull 직전에 다시 실행해야 한다 → 15-08 deploy-relay.sh 가 호출.
# ───────────────────────────────────────────────────────────────
cat >/usr/local/sbin/relay-docker-login <<'DOCKER_LOGIN_EOF'
#!/usr/bin/env bash
# Artifact Registry 로그인 (토큰 1시간 만료 — pull 직전에 실행할 것)
set -euo pipefail
MD="http://metadata.google.internal/computeMetadata/v1"
HDR="Metadata-Flavor: Google"
REGION="${AR_REGION:-asia-northeast3}"
TOKEN="$(curl -sf -H "$HDR" "${MD}/instance/service-accounts/default/token" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')"
printf '%s' "$TOKEN" \
  | docker login -u oauth2accesstoken --password-stdin "https://${REGION}-docker.pkg.dev"
DOCKER_LOGIN_EOF
chmod 0700 /usr/local/sbin/relay-docker-login
log "✓ relay-docker-login 배치"

# ───────────────────────────────────────────────────────────────
# 7. 3분 라우팅 안전장치 (Pitfall 10 · T-15-11)
#    VPN 이 활성 상태로 부팅됐는데 기본 경로가 tun 으로 넘어가 있으면
#    관리 평면(IAP SSH 포함)을 잃는다. 부팅 3분 뒤 한 번 점검해 자가 복구한다.
#    최초 검증 시에는 직렬 콘솔로도 접근 가능하다 (README 참조).
# ───────────────────────────────────────────────────────────────
cat >/usr/local/sbin/kbvpn-route-guard <<'ROUTE_GUARD_EOF'
#!/usr/bin/env bash
# 기본 경로가 VPN 터널로 넘어갔으면 openconnect 를 내린다.
set -uo pipefail
DEFAULT_DEV="$(ip route show default 2>/dev/null \
  | awk '/^default/{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
if [[ "$DEFAULT_DEV" == tun* ]]; then
  logger -t kbvpn-route-guard "기본 경로가 ${DEFAULT_DEV} 로 탈취됨 — openconnect 중지"
  systemctl stop 'openconnect@*' || true
else
  logger -t kbvpn-route-guard "기본 경로 정상(${DEFAULT_DEV:-none}) — 조치 없음"
fi
ROUTE_GUARD_EOF
chmod 0700 /usr/local/sbin/kbvpn-route-guard

# 전송(transient) 타이머로 예약한다 — 유닛 파일을 만들지 않고
# 부팅 자동 기동 등록도 필요 없어 "자동 기동 금지" 규율과 충돌하지 않는다.
systemctl stop kbvpn-route-guard.timer >/dev/null 2>&1 || true
systemctl reset-failed kbvpn-route-guard.service >/dev/null 2>&1 || true
systemd-run --on-active=180 --unit=kbvpn-route-guard \
  --description="VPN 라우팅 탈취 3분 자동 복구" \
  /usr/local/sbin/kbvpn-route-guard >/dev/null 2>&1 \
  || log "WARN: 라우팅 안전장치 타이머 예약 실패 — 수동 점검 필요"
log "✓ 라우팅 안전장치 예약 (부팅 후 180초 1회)"

log "═══ startup.sh 완료 ═══"
log "다음: ① D-06 DNS A 레코드 → caddy 기동  ② D-03 VPN 선검증(수동 ≤3회)"
