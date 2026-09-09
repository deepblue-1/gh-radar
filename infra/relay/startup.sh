#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# startup.sh — radar-gw GCE startup-script (Phase 15 RELAY-03)
#
# GCE 는 이 스크립트를 **매 부팅마다** 실행한다. 따라서 전 단계가 멱등이어야 한다.
# 재실행은 정상 동작이며, 아무것도 바꾸지 않는 것이 정상 결과다.
#
# ── 이 스크립트가 하지 않는 것 (의도적) ─────────────────────────
#   · openconnect 를 **켜지는** 않는다. 다만 D-03 선검증을 마친 뒤로는
#     **부팅 자동 기동을 등록한다** (2026-09-06). 상시 접속이 아니면 사용자가 호가주문
#     탭을 열었을 때 relay 가 게이트웨이에 닿지 못한다 — 재부팅 후 조용히 죽는 구조였다.
#     최초 연결만 사람이 직렬 콘솔을 열어 둔 채 관찰하면 되고, 그 뒤로는 상시 유지가 맞다.
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
#
# ⚠️ **이미 서비스 중인 caddy 는 절대 건드리지 않는다.** 이 스크립트는 최초 부팅용이지만
#    메타데이터 갱신 후 `google_metadata_script_runner startup` 으로 **재실행**되기도 한다.
#    조건 없이 `disable --now` 를 걸면 그때 살아 있던 관문이 꺼지고 dma.jx1.io 가 통째로
#    죽는다 — 2026-09-06 실장애가 정확히 이것이다(10:10 KST 부터 전면 down).
#    "아직 한 번도 안 켜진 최초 설치" 일 때만 정지 상태를 강제한다.
if systemctl is-active --quiet caddy || systemctl is-enabled --quiet caddy 2>/dev/null; then
  log "· caddy 이미 기동/등록됨 — 건드리지 않는다 (재실행 안전)"
else
  systemctl disable --now caddy >/dev/null 2>&1 || true
  log "✓ caddy installed (정지 상태 유지 — 기동은 15-07 체크포인트)"
fi

# Caddyfile 배치 + 로그 디렉터리
install_asset caddyfile /etc/caddy/Caddyfile 0644
install -d -m 0755 -o caddy -g caddy /var/log/caddy 2>/dev/null \
  || install -d -m 0755 /var/log/caddy
# 로그 파일 소유권 자가 치유. `sudo caddy validate` 는 파일 로거를 실제로 provisioning 해
# dma.log 를 root:root 0600 으로 만들어 버린다. 그 상태로 caddy(user=caddy)가 기동하면
# "permission denied" 로 설정 로드 자체가 실패한다 (15-07 Task 3 실측).
chown -R caddy:caddy /var/log/caddy 2>/dev/null || true

# ACME 계정 이메일 주입 (선택).
#   Caddyfile 에 `email {$CADDY_EMAIL}` 을 두고 환경변수로 넣는 방식은 쓰지 않는다 —
#   변수가 비면 인자 0개짜리 `email` 로 전개돼 설정 파싱이 실패하고 Caddy 가
#   아예 기동하지 않는다(15-07 Task 3 실측). 값이 있을 때만 전역 블록을 덧붙인다.
#   install_asset 이 매 부팅 원본을 새로 깔기 때문에 이 덧붙임은 멱등하다.
if CADDY_EMAIL_VALUE="$(md_attr caddy-email)" && [[ -n "$CADDY_EMAIL_VALUE" ]]; then
  TMP_CADDYFILE=$(mktemp)
  printf '{\n\temail %s\n}\n\n' "$CADDY_EMAIL_VALUE" >"$TMP_CADDYFILE"
  cat /etc/caddy/Caddyfile >>"$TMP_CADDYFILE"
  install -m 0644 "$TMP_CADDYFILE" /etc/caddy/Caddyfile
  rm -f "$TMP_CADDYFILE"
  log "✓ ACME 이메일 전역 블록 주입"
else
  log "· caddy-email 메타데이터 없음 — 만료 알림 이메일 없이 발급된다 (전역 블록 미주입)"
fi

# 과거 방식의 잔재 드롭인이 있으면 제거한다 (더 이상 참조되지 않는다).
if [[ -f /etc/systemd/system/caddy.service.d/10-env.conf ]]; then
  rm -f /etc/systemd/system/caddy.service.d/10-env.conf
  rmdir /etc/systemd/system/caddy.service.d 2>/dev/null || true
  systemctl daemon-reload
  log "· 구 CADDY_EMAIL 드롭인 제거"
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

# ── VPN 상시 유지 (2026-09-06) ──────────────────────────────────
# enable 만 한다 — start 는 하지 않는다. 최초 연결은 여전히 사람이 관찰하며 켜고,
# 그 뒤 재부팅부터는 자동으로 올라온다.
#
# StartLimitBurst=5/1h 는 **그대로 둔다** (T-15-10 — KB 계정 잠금 방지).
# 무한 재시도로 바꾸면 인증 실패가 반복될 때 계정이 잠긴다. 그 상한을 소진하면
# 유닛이 failed 로 정지하는데, 그 상태를 회수하는 것이 아래 워치독이다.
systemctl enable openconnect@kb >/dev/null 2>&1 \
  || log "WARN: openconnect@kb 자동 기동 등록 실패 — 수동 확인 필요"

# 워치독: 10분마다 점검해, 유닛이 failed 이고 마지막 회수로부터 1시간이 지났으면
# 실패 카운터를 리셋하고 1회만 재기동한다. 시간당 재시도 총량은 여전히 유한하다.
install_watchdog() {
  cat >/usr/local/sbin/kbvpn-watchdog <<'WATCHDOG_EOF'
#!/usr/bin/env bash
# openconnect@kb 가 **어떤 이유로든** 돌고 있지 않으면 1회 회수한다.
#
# 예전에는 `failed` 만 회수했는데, 그래서는 부족하다: 데드맨 타이머나 사람이
# `systemctl stop` 으로 **깨끗이** 내린 경우 상태가 `inactive` 라 회수 대상에서 빠지고
# VPN 이 영영 안 올라온다 (2026-09-06 실장애). 판정 기준을 "active 가 아니면 켠다" 로
# 넓힌다 — 상시 유지가 요구사항이기 때문이다.
#
# 계정 잠금 보호는 그대로다: ① 이 스크립트가 **시간당 1회**로 자체 제한하고,
# ② 유닛의 StartLimitBurst=5/1h 가 그 위에 또 있다. 둘 다 유지한다.
set -uo pipefail
UNIT=openconnect@kb
STAMP=/run/kbvpn-watchdog.last

[[ "$(systemctl is-active "$UNIT" 2>/dev/null)" == "active" ]] && exit 0

NOW=$(date +%s)
LAST=0
[[ -r "$STAMP" ]] && LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
# StartLimitIntervalSec 과 같은 주기(1h)로 회수를 제한한다.
if (( NOW - LAST < 3600 )); then
  logger -t kbvpn-watchdog "정지 상태이나 직전 회수로부터 1시간 미만 — 대기"
  exit 0
fi

echo "$NOW" >"$STAMP"
logger -t kbvpn-watchdog "openconnect@kb 정지 감지 — 실패 카운터 리셋 후 1회 재기동"
systemctl reset-failed "$UNIT" || true
systemctl start "$UNIT" || logger -t kbvpn-watchdog "재기동 실패 — 사람 개입 필요"
WATCHDOG_EOF
  chmod 0700 /usr/local/sbin/kbvpn-watchdog

  cat >/etc/systemd/system/kbvpn-watchdog.service <<'WDSVC_EOF'
[Unit]
Description=KB VPN 워치독 — failed 정지 회수 (시간당 1회 상한)

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/kbvpn-watchdog
WDSVC_EOF

  cat >/etc/systemd/system/kbvpn-watchdog.timer <<'WDTMR_EOF'
[Unit]
Description=KB VPN 워치독 10분 주기

[Timer]
OnBootSec=10min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
WDTMR_EOF
}
install_watchdog

# 주간 예약 재접속: KB 게이트웨이의 세션 인증은 **접속 시각 + 14일 롤링**이다.
#   실측 2건 — 09-05 14:28 접속 → 09-19 14:28 만료 / 09-06 04:03 접속 → 09-20 04:03 만료.
#   (계정 만료가 아니다. 재접속하면 창이 그 시점부터 다시 14일로 밀린다.)
# 상시 유지가 정책이므로 갱신하지 않으면 그 만료 창이 언젠가 **장중에** 온다.
# 그래서 장이 없는 매주 일요일 06:00 KST 에 한 번 재접속해 창을 미리 밀어 둔다.
#
#   · 밀린 발화 따라잡기 옵션(systemd Timer 의 catch-up 키)은 **의도적으로 넣지 않는다.**
#     VM 이 며칠 꺼져 있다 장중에 부팅하면 놓친 발화가 그 자리에서 몰려 실행돼
#     장중 재접속이 걸린다. 한 주를 건너뛰어도 14일 창 안이라 손해가 없다.
#     (키 이름과 상세 근거는 infra/relay/README.md §주간 예약 재접속)
#   · 자체 재시도·백오프·reset-failed 를 넣지 않는다. 실패 회수는 위 워치독
#     (10분 주기 · 시간당 1회) 소관이다. 여기서 또 돌리면 유닛의 StartLimitBurst=5/1h
#     예산과 KB 계정 인증 시도 횟수를 이중으로 태운다.
install_renew_timer() {
  cat >/usr/local/sbin/kbvpn-renew <<'RENEW_EOF'
#!/usr/bin/env bash
# openconnect@kb 를 1회 재시작해 세션 인증 14일 창을 갱신한다.
# 실패해도 여기서 재시도하지 않는다 — kbvpn-watchdog(10분 주기)가 회수한다.
set -uo pipefail
UNIT=openconnect@kb
logger -t kbvpn-renew "주간 예약 재접속 시작 — ${UNIT} restart 1회"
if systemctl restart "$UNIT"; then
  logger -t kbvpn-renew "재접속 성공 — 세션 인증 14일 창 갱신됨"
else
  logger -t kbvpn-renew "재접속 실패 — 재시도하지 않는다. 워치독 회수 대기"
fi
RENEW_EOF
  chmod 0700 /usr/local/sbin/kbvpn-renew

  cat >/etc/systemd/system/kbvpn-renew.service <<'RNSVC_EOF'
[Unit]
Description=KB VPN 주간 예약 재접속 — 세션 인증 14일 롤링 갱신

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/kbvpn-renew
RNSVC_EOF

  cat >/etc/systemd/system/kbvpn-renew.timer <<'RNTMR_EOF'
[Unit]
Description=KB VPN 주간 예약 재접속 (일요일 06:00 KST)

[Timer]
# VM 시계는 UTC 다. systemd 252 는 캘린더 표현에 타임존을 직접 지원한다
# (systemd-analyze calendar 'Sun 06:00 Asia/Seoul' → Next elapse 정상 산출).
OnCalendar=Sun 06:00 Asia/Seoul
# 밀린 발화 따라잡기 옵션은 의도적으로 넣지 않는다 — 놓친 발화가 부팅 직후
# 몰려 실행되면 장중에 재접속이 걸린다. 근거: infra/relay/README.md §주간 예약 재접속

[Install]
WantedBy=timers.target
RNTMR_EOF
}
install_renew_timer

systemctl daemon-reload
systemctl enable --now kbvpn-watchdog.timer >/dev/null 2>&1 \
  || log "WARN: kbvpn-watchdog.timer 등록 실패"
systemctl enable --now kbvpn-renew.timer >/dev/null 2>&1 \
  || log "WARN: kbvpn-renew.timer 등록 실패"

log "✓ VPN 자산 배치 완료 (자동 기동 등록 · 워치독 10분 · 주간 갱신 일 06:00 KST · 재시도 상한 5회/1h 유지)"

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

# ───────────────────────────────────────────────────────────────
# 8. WireGuard 서버 (개발기 직결) — quick-260909-muo
#    개발기(Mac/Windows)가 외부 CLI·IAP·포트 포워딩 없이 wg0 를 통해
#    10.41.1.120 의 {9100, 22} 에만 닿게 한다. 인증은 피어 공개키다.
#
#    ⚠️ 이 섹션은 기본 경로·tun0 라우트·kbvpn-* 자산(연결·워치독·주간갱신·
#       라우팅 안전장치)·Caddy·relay 컨테이너를 **한 줄도 건드리지 않는다.**
#       wg0 에 Table/기본경로 설정을 넣지 않으므로 기본 경로는 ens4 그대로다.
#
#    ⚠️ 인터페이스는 **이름**(iifname/oifname)으로만 매칭한다. openconnect 가
#       재접속하면 tun0 이 재생성되며 인덱스(iif/oif)가 바뀌어, 인덱스 기준
#       규칙은 오류 없이 조용히 죽는다. 이름 기준은 재생성에 영향받지 않는다.
#
#    ⚠️ docker 함정: 이 VM 에는 docker.io 가 있어 iptables-nft 의 filter/FORWARD
#       정책이 **DROP** 이다. 별도 nft 테이블(inet wgfwd)의 accept 는 이를 덮지
#       못한다 — 어느 base chain 에서든 drop 판정이 나오면 그 자리에서 끝나기
#       때문이다. 그래서 docker 가 체인 재생성 시에도 보존하는 유일한 훅인
#       DOCKER-USER 에 같은 조건을 PostUp 이 넣고 PostDown 이 뺀다.
# ───────────────────────────────────────────────────────────────
log "▶ WireGuard 서버 구성..."

# 8.1 패키지 — Debian 12 커널에 wireguard 모듈이 내장돼 있어 DKMS·외부 저장소가
#     필요 없다. 이미 설치돼 있으면 apt 가 no-op 이다.
apt-get install -y --no-install-recommends wireguard nftables \
  || log "WARN: wireguard/nftables 설치 실패 — 아래 단계가 무의미해진다"

install -d -m 0700 /etc/wireguard

# 8.2 서버 개인키 — **없을 때만 1회 생성한다.**
#     재생성하면 서버 공개키가 바뀌어 이미 배포된 모든 클라이언트 프로필이
#     한꺼번에 무효가 된다. 이 파일이 이 섹션에서 유일하게 멱등하지 않으면
#     안 되는 자산이다.
if [[ ! -s /etc/wireguard/wg0.key ]]; then
  ( umask 077; wg genkey >/etc/wireguard/wg0.key )
  chmod 0600 /etc/wireguard/wg0.key
  log "✓ 서버 개인키 생성 (/etc/wireguard/wg0.key 0600 — 값은 출력하지 않는다)"
else
  log "· 서버 개인키 기존 키 유지 (재생성 금지 — 클라이언트 프로필 무효화 방지)"
fi

# 8.3 peers.conf — 사람(관리자)이 wg-peer-add 로 관리하는 파일이다.
#     있으면 손대지 않는다. 없을 때만 헤더 주석만 담긴 빈 파일을 만든다.
if [[ ! -f /etc/wireguard/peers.conf ]]; then
  cat >/etc/wireguard/peers.conf <<'PEERS_SEED_EOF'
# WireGuard 피어 목록 — /usr/local/sbin/wg-peer-add 가 append 한다.
# startup.sh 는 이 파일이 없을 때만 만들고, 있으면 절대 덮어쓰지 않는다.
PEERS_SEED_EOF
  chmod 0600 /etc/wireguard/peers.conf
  log "✓ /etc/wireguard/peers.conf 생성 (빈 목록, 0600)"
else
  log "· /etc/wireguard/peers.conf 기존 파일 유지 (사람이 관리)"
fi

# 8.4 nft 규칙 파일 — 매 부팅 재작성(순수 생성물).
cat >/etc/wireguard/wgfwd.nft <<'WGFWD_NFT_EOF'
#!/usr/sbin/nft -f
# wgfwd — wg0(개발기) → tun0(KB 사내망) 최소 통로.
#
# ⚠️ forward 체인의 policy 를 drop 으로 두지 않는다. 별도 테이블의 drop 정책은
#    docker 브리지를 포함한 **호스트 전체 forward** 를 죽인다. 「그 외는 막는다」는
#    맨 아래 두 줄의 **명시 drop 규칙**으로 구현한다.
#
# ⚠️ 인터페이스는 iifname/oifname(이름)으로만 쓴다. openconnect 재접속으로 tun0 이
#    재생성되면 인덱스가 바뀌어 iif/oif(인덱스) 기준 규칙이 조용히 죽는다.

# 재적용 멱등 관용구: 없으면 만들고(no-op), 지운 뒤, 새로 정의한다.
table inet wgfwd
delete table inet wgfwd

table inet wgfwd {
  chain forward {
    type filter hook forward priority filter + 10; policy accept;

    # ① MSS 클램프 — 터널 오버헤드로 큰 응답이 조용히 멈추는 것을 막는다(양방향).
    iifname "wg0" oifname "tun0" tcp flags syn tcp option maxseg size set rt mtu
    iifname "tun0" oifname "wg0" tcp flags syn tcp option maxseg size set rt mtu

    # ② 허용은 게이트웨이 한 대의 두 포트뿐이다.
    iifname "wg0" oifname "tun0" ip daddr 10.41.1.120 tcp dport { 9100, 22 } accept

    # ③ 그 응답만 돌아온다.
    iifname "tun0" oifname "wg0" ct state established,related accept

    # ④ 나머지 wg0 출입은 전부 막는다 (사내망 횡이동 차단).
    iifname "wg0" drop
    oifname "wg0" drop
  }

  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    # 10.20.0.0/24 를 VM 의 tun0 주소로 바꿔 내보낸다 — 사내망은 이 대역을 모른다.
    oifname "tun0" ip saddr 10.20.0.0/24 masquerade
  }
}
WGFWD_NFT_EOF
chmod 0600 /etc/wireguard/wgfwd.nft
log "✓ /etc/wireguard/wgfwd.nft 재작성 (0600)"

# 8.5 wg0.conf — 매 부팅 재작성(순수 생성물).
#     ⚠️ 개인키를 이 파일에 넣지 않는다. PostUp 이 0600 키 파일에서 주입하므로
#        이 파일은 비밀을 담지 않는 생성물이 되고, 재작성이 안전해진다.
cat >/etc/wireguard/wg0.conf <<'WG0_CONF_EOF'
# 생성물 — startup.sh 가 매 부팅 재작성한다. VM 에서 직접 고치지 말 것.
# 피어는 /etc/wireguard/peers.conf 에서 온다 (wg-peer-add 가 관리).
[Interface]
Address = 10.20.0.1/24
ListenPort = 51820
SaveConfig = false

PostUp = wg set %i private-key /etc/wireguard/wg0.key
PostUp = wg addconf %i /etc/wireguard/peers.conf || true
PostUp = nft -f /etc/wireguard/wgfwd.nft
PostUp = iptables -D DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT 2>/dev/null || true
PostUp = iptables -I DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT
PostUp = iptables -D DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
PostUp = iptables -I DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

PostDown = iptables -D DOCKER-USER -i wg0 -o tun0 -d 10.41.1.120 -p tcp -m multiport --dports 9100,22 -j ACCEPT 2>/dev/null || true
PostDown = iptables -D DOCKER-USER -i tun0 -o wg0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
PostDown = nft delete table inet wgfwd || true
WG0_CONF_EOF
chmod 0600 /etc/wireguard/wg0.conf
log "✓ /etc/wireguard/wg0.conf 재작성 (0600 · 개인키 미포함)"

# 8.6 기동 순서 드롭인 — DOCKER-USER 체인은 dockerd 가 만든다.
#     부팅 시 wg-quick 이 dockerd 보다 먼저 뜨면 삽입이 조용히 실패한다.
install -d -m 0755 /etc/systemd/system/wg-quick@wg0.service.d
cat >/etc/systemd/system/wg-quick@wg0.service.d/10-after-docker.conf <<'WG_DROPIN_EOF'
# 생성물 — startup.sh 가 매 부팅 재작성한다.
# DOCKER-USER 체인은 dockerd 가 만든다. 그보다 먼저 뜨면 PostUp 의 iptables 삽입이
# 조용히 실패해 핸드셰이크는 되는데 9100 이 안 열리는 상태가 된다.
[Unit]
After=docker.service
Wants=docker.service
WG_DROPIN_EOF
chmod 0644 /etc/systemd/system/wg-quick@wg0.service.d/10-after-docker.conf

# 8.7 IP 포워딩 — VM 이 wg0 ↔ tun0 사이를 중계하려면 필요하다.
#     (GCE 의 canIpForward 는 켜지 않는다: tun0 로 나가는 패킷은 openconnect 가
#      캡슐화해 출발지가 VM 자신이므로 anti-spoof 와 무관하다 — T-15-27 최소권한.)
cat >/etc/sysctl.d/99-wireguard.conf <<'WG_SYSCTL_EOF'
# 생성물 — startup.sh 가 매 부팅 재작성한다.
net.ipv4.ip_forward=1
WG_SYSCTL_EOF
chmod 0644 /etc/sysctl.d/99-wireguard.conf
sysctl --system >/dev/null 2>&1 || log "WARN: sysctl --system 실패 — ip_forward 확인 필요"

# 8.8 피어 추가 헬퍼 — 관리자가 공개키를 받아 등록할 때 쓴다.
cat >/usr/local/sbin/wg-peer-add <<'WG_PEER_ADD_EOF'
#!/usr/bin/env bash
# wg-peer-add <이름> <공개키> <10.20.0.N>
#
# 피어를 /etc/wireguard/peers.conf 에 추가하고, wg0 이 살아 있으면 즉시 반영한다.
# 공개키 전체를 화면에 출력하지 않는다.
set -euo pipefail

PEERS=/etc/wireguard/peers.conf

usage() {
  cat <<'USAGE'
사용법: wg-peer-add <이름> <공개키> <10.20.0.N>

  <이름>     기록용 라벨 (예: alex-mac)
  <공개키>   WireGuard 앱이 만든 base64 44자 공개키 (개인키가 아니다)
  <10.20.0.N>  배정할 주소. N 은 2~254 (10.20.0.1 은 서버)

예: wg-peer-add alex-mac aBc...=  10.20.0.2
USAGE
}

if [[ $# -ne 3 ]]; then
  usage >&2
  exit 64
fi

NAME="$1"
PUBKEY="$2"
ADDR="$3"

if [[ ! "$NAME" =~ ^[A-Za-z0-9._-]{1,32}$ ]]; then
  echo "ERROR: 이름은 영숫자/._- 1~32자여야 한다: ${NAME}" >&2
  exit 1
fi

if [[ ! "$PUBKEY" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "ERROR: 공개키 형식이 아니다 (base64 44자여야 한다)." >&2
  echo "Hint: 앱의 '공개키(Public key)' 를 복사했는지 확인할 것. 개인키를 넣지 말 것." >&2
  exit 1
fi

if [[ ! "$ADDR" =~ ^10\.20\.0\.([2-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$ ]]; then
  echo "ERROR: 주소는 10.20.0.2 ~ 10.20.0.254 여야 한다 (10.20.0.1 은 서버): ${ADDR}" >&2
  exit 1
fi

install -d -m 0700 /etc/wireguard
[[ -f "$PEERS" ]] || { : >"$PEERS"; chmod 0600 "$PEERS"; }

# 중복 거부 — 같은 주소가 둘이면 라우팅이 조용히 오작동한다(오류가 안 난다).
if grep -qF "$PUBKEY" "$PEERS"; then
  echo "ERROR: 이 공개키는 이미 등록돼 있다. 먼저 ${PEERS} 에서 제거할 것." >&2
  exit 1
fi
if grep -qE "^AllowedIPs = ${ADDR//./\\.}/32$" "$PEERS"; then
  echo "ERROR: 주소 ${ADDR} 는 이미 배정돼 있다. 다른 N 을 쓸 것." >&2
  exit 1
fi

{
  printf '\n# %s  (추가 %s)\n' "$NAME" "$(date +%F)"
  printf '[Peer]\n'
  printf 'PublicKey = %s\n' "$PUBKEY"
  printf 'AllowedIPs = %s/32\n' "$ADDR"
} >>"$PEERS"
chmod 0600 "$PEERS"

echo "✓ ${NAME} → ${ADDR} 등록 (${PEERS})"

if wg show wg0 >/dev/null 2>&1; then
  wg addconf wg0 "$PEERS"
  echo "✓ wg0 에 즉시 반영됨"
else
  echo "· wg0 이 내려가 있다 — 다음 기동 시 반영된다 (systemctl start wg-quick@wg0)"
fi

echo "현재 피어 수: $(wg show wg0 peers 2>/dev/null | wc -l)"
WG_PEER_ADD_EOF
chmod 0700 /usr/local/sbin/wg-peer-add
log "✓ /usr/local/sbin/wg-peer-add 배치 (0700)"

# 8.9 기동. 실패해도 부팅을 죽이지 않는다.
WG_WAS_ACTIVE=0
systemctl is-active --quiet wg-quick@wg0 && WG_WAS_ACTIVE=1
systemctl daemon-reload
if systemctl enable --now wg-quick@wg0 >/dev/null 2>&1; then
  if [[ "$WG_WAS_ACTIVE" == "1" ]]; then
    log "· wg-quick@wg0 이미 기동 중 — 설정 재작성분 반영은 'systemctl restart wg-quick@wg0'"
  else
    log "✓ wg-quick@wg0 기동 (wg0 10.20.0.1/24 · UDP 51820)"
  fi
else
  log "WARN: wg-quick@wg0 기동 실패 — 'journalctl -u wg-quick@wg0' 확인 필요"
fi

log "═══ startup.sh 완료 ═══"
log "다음: ① D-06 DNS A 레코드 → caddy 기동  ② D-03 VPN 선검증(수동 ≤3회)"
