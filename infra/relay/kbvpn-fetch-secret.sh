#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# kbvpn-fetch-secret — Secret Manager → /run/kbvpn.cred (tmpfs, 0600)
# 설치 위치: /usr/local/sbin/kbvpn-fetch-secret (0700)
# 호출 경로: openconnect@.service 의 ExecStartPre
#
# 규율 (T-15-26):
#   · 자격증명 값이 평문으로 존재하는 유일한 지점이 /run(tmpfs) 이다.
#     디스크에 남지 않고, 재부팅 시 사라지며, ExecStopPost 가 종료 시 삭제한다.
#   · 파일 내용을 stdout/stderr 로 절대 출력하지 않는다 (journalctl 유출 방지).
#   · gcloud 존재를 가정하지 않는다 — Debian 공개 이미지에 gcloud 가 항상 있다고
#     확정할 수 없어(RESEARCH A4) 메타데이터 토큰 + REST 무의존 경로를 1순위로 쓴다.
#   · curl + python3 만 사용한다. python3 는 Debian 12 기본 포함이고,
#     JSON 파서를 추가로 설치하지 않는다.
#
# 출력 형식 (Mac 참조 스크립트와 동형):
#   1행 = 접속 계정 ID   (/etc/kbvpn.env 의 KBVPN_USER)
#   2행 = 접속 비밀 값   (Secret Manager)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

CRED_FILE=/run/kbvpn.cred
ENV_FILE=/etc/kbvpn.env
METADATA_ROOT="http://metadata.google.internal/computeMetadata/v1"
METADATA_HEADER="Metadata-Flavor: Google"

# ── 1. 비민감 설정 로드 (/etc/kbvpn.env, 0600) ──────────────────
# 서버 주소·authgroup·인증서 핀·계정 ID 는 이 파일에서만 온다.
# 저장소에는 어떤 값도 커밋하지 않는다.
if [[ ! -r "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE 를 읽을 수 없다 — startup-script 배치 여부를 확인하라" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$ENV_FILE"

: "${KBVPN_USER:?KBVPN_USER 가 /etc/kbvpn.env 에 없다}"
SECRET_NAME="${KBVPN_SECRET_NAME:-gh-radar-kb-vpn-password}"

# ── 2. 메타데이터 서버에서 프로젝트 ID + 액세스 토큰 ────────────
PROJECT_ID="$(curl -sf -H "$METADATA_HEADER" "${METADATA_ROOT}/project/project-id")"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: 메타데이터 서버에서 프로젝트 ID 를 얻지 못했다" >&2
  exit 1
fi

ACCESS_TOKEN="$(
  curl -sf -H "$METADATA_HEADER" \
    "${METADATA_ROOT}/instance/service-accounts/default/token" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])'
)"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "ERROR: 메타데이터 서버에서 액세스 토큰을 얻지 못했다 (VM SA 스코프 확인)" >&2
  exit 1
fi

# ── 3. tmpfs 에 0600 으로 자격증명 파일 작성 ────────────────────
# umask 를 먼저 좁혀 "생성 순간부터" 0600 이게 한다 (chmod 이전 경합 차단).
umask 077
: >"$CRED_FILE"
chmod 600 "$CRED_FILE"

printf '%s\n' "$KBVPN_USER" >"$CRED_FILE"

# Secret 본문은 파이프로만 흐르고 변수·로그를 거치지 않는다.
curl -sf \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest:access" \
  | python3 -c 'import sys, json, base64; v = base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode(); sys.stdout.write(v.rstrip("\r\n") + "\n")' \
  >>"$CRED_FILE"

# ── 4. 결과 검증 — 내용은 출력하지 않고 "행 수" 만 본다 ─────────
if [[ "$(wc -l <"$CRED_FILE")" -lt 2 ]]; then
  rm -f "$CRED_FILE"
  echo "ERROR: 자격증명 파일이 불완전하다 — Secret '${SECRET_NAME}' 에 값이 등록됐는지 확인하라" >&2
  exit 1
fi

echo "✓ 자격증명을 ${CRED_FILE} (tmpfs, 0600) 에 배치했다"
