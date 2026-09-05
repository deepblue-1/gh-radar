#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# kbvpn-connect — openconnect 실행 (systemd ExecStart)
# 설치 위치: /usr/local/sbin/kbvpn-connect (0700)
# 선행 조건: kbvpn-fetch-secret 이 /run/kbvpn.cred 를 채워 둔 상태
#
# 규율:
#   · systemd Type=simple 과 맞추기 위해 데몬화 옵션을 쓰지 않고 포그라운드로 돈다.
#     (Mac 참조 스크립트는 데몬으로 띄우지만 유닛에서는 그러면 안 된다)
#   · 접속 서버·authgroup·인증서 핀·계정 ID 를 이 파일에 하드코딩하지 않는다.
#     전부 /etc/kbvpn.env (0600, startup-script 가 배치) 에서 읽는다.
#   · 자격증명 파일 내용을 echo 하지 않는다. openconnect 자신의 출력만 저널로 넘어간다.
#   · 비밀 값은 프로세스 인자가 아니라 stdin 으로만 넘긴다 —
#     인자로 주면 `ps` 와 `systemctl show` 에 그대로 보인다 (T-15-26).
#
# 자격증명 파일 형식: 1행 = 계정 ID, 2행 = 비밀 값
#   → 1행은 --user 인자로, 2행 이후는 stdin 으로 openconnect 에 넘긴다.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

CRED_FILE=/run/kbvpn.cred
ENV_FILE=/etc/kbvpn.env
VPNC_WRAPPER=/usr/local/sbin/kbvpn-vpnc-wrapper

if [[ ! -r "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE 를 읽을 수 없다 — startup-script 배치 여부를 확인하라" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$ENV_FILE"

: "${KBVPN_SERVER:?KBVPN_SERVER 가 /etc/kbvpn.env 에 없다}"
: "${KBVPN_AUTHGROUP:?KBVPN_AUTHGROUP 가 /etc/kbvpn.env 에 없다}"
: "${KBVPN_SERVERCERT:?KBVPN_SERVERCERT 가 /etc/kbvpn.env 에 없다}"

if [[ ! -r "$CRED_FILE" ]]; then
  echo "ERROR: $CRED_FILE 가 없다 — ExecStartPre(kbvpn-fetch-secret) 가 먼저 돌아야 한다" >&2
  exit 1
fi

if [[ ! -x "$VPNC_WRAPPER" ]]; then
  echo "ERROR: $VPNC_WRAPPER 가 실행 가능하지 않다 — split-tunnel 없이 연결하면 안 된다" >&2
  exit 1
fi

# 1행 = 계정 ID. 비밀 값이 아니라서 인자로 넘겨도 되지만, 2행 이후는 절대 인자로 넘기지 않는다.
KBVPN_ACCOUNT="$(head -n 1 "$CRED_FILE")"
if [[ -z "$KBVPN_ACCOUNT" ]]; then
  echo "ERROR: 자격증명 1행(계정 ID)이 비어 있다" >&2
  exit 1
fi

# --script 로 split-tunnel 래퍼를 물린다. 이게 빠지면 서버가 푸시한 default route 가
# 그대로 설치돼 관리 평면 전체를 잃는다 (RESEARCH Pitfall 10).
exec openconnect \
  --protocol=anyconnect \
  --authgroup="$KBVPN_AUTHGROUP" \
  --servercert "$KBVPN_SERVERCERT" \
  --user="$KBVPN_ACCOUNT" \
  --passwd-on-stdin \
  --script="$VPNC_WRAPPER" \
  "$KBVPN_SERVER" \
  < <(tail -n +2 -- "$CRED_FILE")
