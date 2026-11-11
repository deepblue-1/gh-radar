#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# setup-kis-secrets.sh — 한투(KIS) 앱키 · 시크릿 주입 (Phase 41 · 41-02)
#
# 이 스크립트는 사용자가 직접 실행한다(메모리 「비밀 주입은 사용자 `!` 실행」 — 에이전트 실행은 분류기가 막는다):
#   ! bash scripts/setup-kis-secrets.sh
#
# 입력 파일 만드는 법 (값은 대화에 붙여 넣지 않는다):
#   1. 편집기로 ~/.config/gh-radar/kis.env 를 만들고 두 줄만 적는다
#        KIS_APPKEY=<한투 앱키>
#        KIS_APPSECRET=<한투 앱시크릿>
#   2. chmod 600 ~/.config/gh-radar/kis.env
#   (경로를 바꾸려면 KIS_ENV_FILE=<경로>)
#
# 규약 (setup-push-secrets.sh 와 같다)
#   - 대화형 입력 없음(`!` 셸에 TTY 가 없을 수 있다).
#   - 값 · 길이 · 앞뒤 글자를 어떤 경로로도 출력하지 않는다. 출력은 「OK <이름>」 / 「SKIP <이름> — 이미 같은 값」 /
#     「ERROR <이름> — <사유만>」 줄뿐이다. 셸 추적 모드를 켜지 않는다.
#   - 입력 파일은 `source` 로 실행하지 않는다 — KIS_APPKEY · KIS_APPSECRET 두 키만 한 줄씩 읽는다.
#   - 최신 버전과 같은 값이면 새 버전을 만들지 않는다(재실행 안전).
#   - Secret 껍데기 · 수집기 SA 접근권은 만들지 않는다 — `GCP_PROJECT_ID=gh-radar bash scripts/setup-kis-news-sync-iam.sh` 몫.
#   - 값을 바꾼 뒤 수집기는 다음 실행부터 읽는다(Job 은 `:latest` 버전을 실행 시작 때 읽는다).
#
# 선택 env
#   KIS_ENV_FILE               입력 파일. 기본 ~/.config/gh-radar/kis.env
#   CLOUDSDK_CORE_PROJECT      GCP 프로젝트. 기본 gh-radar
#   CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE  비어 있고 ~/.config/gcloud/gh-radar-deployer.json 이 있으면 그 키를 쓴다
#                              (빈 값으로 명시하면 gcloud 사용자 계정)
# ═══════════════════════════════════════════════════════════════

ENV_FILE="${KIS_ENV_FILE:-$HOME/.config/gh-radar/kis.env}"
APPKEY_SECRET=gh-radar-kis-appkey
APPSECRET_SECRET=gh-radar-kis-appsecret
MIN_LEN=16

case "${1:-}" in
  -h | --help)
    echo "사용: ! bash scripts/setup-kis-secrets.sh   (입력: \${KIS_ENV_FILE:-~/.config/gh-radar/kis.env} · 권한 600)"
    exit 0
    ;;
  "") ;;
  *)
    echo "ERROR args — 인자를 받지 않는다 (--help 참고)" >&2
    exit 1
    ;;
esac

# gcloud 준비 — setup-push-secrets.sh 관례(프로젝트 기본값 · deployer 키 자동 지정).
gcloud_prep() {
  export CLOUDSDK_CORE_PROJECT="${CLOUDSDK_CORE_PROJECT:-gh-radar}"
  local deployer="$HOME/.config/gcloud/gh-radar-deployer.json"
  if [[ -z "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE+x}" && -f "$deployer" ]]; then
    export CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE="$deployer"
  elif [[ -z "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}" ]]; then
    unset CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE
  fi
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "ERROR gcloud — gcloud CLI 가 없다" >&2
    return 1
  fi
  if [[ -n "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}" ]]; then
    echo "OK gcloud — 인증: SA 키 파일 ${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE} · 프로젝트 ${CLOUDSDK_CORE_PROJECT}"
  else
    echo "OK gcloud — 인증: gcloud 사용자 계정 · 프로젝트 ${CLOUDSDK_CORE_PROJECT}"
  fi
}

# 파일 권한(8진 3자리) — macOS(stat -f) · Linux(stat -c) 둘 다.
file_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

# ── 1. 입력 파일 ────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR input — 파일 없음: $ENV_FILE (머리 주석의 「입력 파일 만드는 법」)" >&2
  exit 1
fi
MODE="$(file_mode "$ENV_FILE")"
if [[ "$MODE" != 600 && "$MODE" != 400 ]]; then
  echo "ERROR input — 권한이 600 또는 400 이 아니다: $ENV_FILE (chmod 600 뒤 다시 실행)" >&2
  exit 1
fi

# 값은 변수에만 둔다(화면 · 명령줄 · 파일에 남기지 않는다).
APPKEY=""
APPSECRET=""
SEEN_APPKEY=0
SEEN_APPSECRET=0
while IFS='=' read -r line_key line_rest || [[ -n "$line_key" ]]; do
  line_key="${line_key%$'\r'}"
  line_rest="${line_rest%$'\r'}"
  line_key="${line_key#export }"
  line_key="${line_key//[[:space:]]/}"
  case "$line_key" in
    KIS_APPKEY)
      APPKEY="$line_rest"
      SEEN_APPKEY=1
      ;;
    KIS_APPSECRET)
      APPSECRET="$line_rest"
      SEEN_APPSECRET=1
      ;;
    *) ;; # 빈 줄 · 주석 · 다른 키는 무시
  esac
done < "$ENV_FILE"
line_rest=""

# 값 하나를 따옴표 한 겹 벗겨 검사 — 사유만 출력한다.
strip_quotes() {
  local s="$1"
  if [[ ${#s} -ge 2 && ( ( "${s:0:1}" == '"' && "${s: -1}" == '"' ) || ( "${s:0:1}" == "'" && "${s: -1}" == "'" ) ) ]]; then
    s="${s:1:${#s}-2}"
  fi
  printf '%s' "$s"
}
APPKEY="$(strip_quotes "$APPKEY")"
APPSECRET="$(strip_quotes "$APPSECRET")"

FAILED=0
check_value() {
  local name="$1" seen="$2" secret_value="$3"
  if [[ "$seen" != 1 ]]; then
    echo "ERROR $name — 입력 파일에 줄이 없다" >&2
    return 1
  fi
  if [[ -z "$secret_value" ]]; then
    echo "ERROR $name — 값이 비었다" >&2
    return 1
  fi
  if [[ "$secret_value" =~ [[:space:]] ]]; then
    echo "ERROR $name — 값에 공백이 있다" >&2
    return 1
  fi
  if [[ ${#secret_value} -lt $MIN_LEN ]]; then
    echo "ERROR $name — 값이 너무 짧다(복사가 잘렸는지 확인)" >&2
    return 1
  fi
}
check_value KIS_APPKEY "$SEEN_APPKEY" "$APPKEY" || FAILED=1
check_value KIS_APPSECRET "$SEEN_APPSECRET" "$APPSECRET" || FAILED=1
if [[ "$FAILED" != 0 ]]; then
  APPKEY=""
  APPSECRET=""
  exit 1
fi

# ── 2. gcloud · Secret 껍데기 ────────────────────────────────────
gcloud_prep || exit 1
for s in "$APPKEY_SECRET" "$APPSECRET_SECRET"; do
  if ! gcloud secrets describe "$s" >/dev/null 2>&1; then
    echo "ERROR $s — Secret 없음 — 먼저 GCP_PROJECT_ID=${CLOUDSDK_CORE_PROJECT} bash scripts/setup-kis-news-sync-iam.sh" >&2
    APPKEY=""
    APPSECRET=""
    exit 1
  fi
done

# ── 3. 새 버전(같은 값이면 SKIP) ────────────────────────────────
put_secret() {
  local secret="$1" secret_value="$2" current
  current="$(gcloud secrets versions access latest --secret="$secret" 2>/dev/null || true)"
  if [[ -n "$current" && "$current" == "$secret_value" ]]; then
    current=""
    echo "SKIP $secret — 이미 같은 값"
    return 0
  fi
  current=""
  if ! printf '%s' "$secret_value" | gcloud secrets versions add "$secret" --data-file=- >/dev/null 2>&1; then
    echo "ERROR $secret — 새 버전 실패 (권한 · 프로젝트 확인)" >&2
    return 1
  fi
  echo "OK $secret — 새 버전 (수집기는 다음 실행부터 읽는다)"
}

put_secret "$APPKEY_SECRET" "$APPKEY" || FAILED=1
put_secret "$APPSECRET_SECRET" "$APPSECRET" || FAILED=1
APPKEY=""
APPSECRET=""
exit "$FAILED"
