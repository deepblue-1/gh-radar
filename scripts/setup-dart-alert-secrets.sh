#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# setup-dart-alert-secrets.sh — OpenDART 키 2개 · 텔레그램 봇 토큰 · 방 id 주입 (Phase 43 · 43-07 · 261113-rn7 · setup-kis-secrets.sh 꼴)
#
# 이 스크립트는 사용자가 직접 실행한다(비밀 주입은 사용자 `!` 실행 — 에이전트 실행은 분류기가 막는다):
#   ! bash scripts/setup-dart-alert-secrets.sh
#
# 입력 파일 만드는 법 (값은 대화에 붙여 넣지 않는다):
#   1. 편집기로 ~/.config/gh-radar/dart-alert.env 를 만들고 네 줄을 적는다(바꿀 줄만 있어도 된다 — 없는 줄은 SKIP)
#        OPENDART_API_KEY=<OpenDART 인증키 40자 — 키 1 · 공개매수 · 주요사항보고서>
#        OPENDART_API_KEY_2=<두 번째 OpenDART 인증키 40자 — 키 2 · 같이 운영하는 팀원 개인 키 · 키 1 과 다른 값>
#        TELEGRAM_BOT_TOKEN=<BotFather 가 준 토큰 — 123456789:AA… 꼴>
#        TELEGRAM_CHAT_ID=<방 id — 처음엔 운영자 개인 대화 id, 시험 뒤 단체방 id(음수)>
#      방 id 는 `! bash scripts/telegram-find-chat.sh` 로 찾는다(토큰 줄만 있으면 된다).
#   2. chmod 600 ~/.config/gh-radar/dart-alert.env
#   (경로를 바꾸려면 DART_ALERT_ENV_FILE=<경로>)
#
# 규약 (setup-kis-secrets.sh 와 같다)
#   - 대화형 입력 없음(`!` 셸에 TTY 가 없을 수 있다).
#   - 값 · 길이 · 앞뒤 글자를 어떤 경로로도 출력하지 않는다. 출력은 「OK <이름>」 / 「SKIP <이름> — <사유>」 /
#     「ERROR <이름> — <사유만>」 줄뿐이다. 셸 추적 모드를 켜지 않는다.
#   - 입력 파일은 `source` 로 실행하지 않는다 — 네 키만 한 줄씩 읽고 첫 '=' 에서만 자른다.
#   - 파일에 없는 키는 「SKIP <이름> — 파일에 없음」 — 방 id 를 나중에 넣는 순서를 지원한다.
#   - 최신 버전과 같은 값이면 새 버전을 만들지 않는다(재실행 안전) — 방 id 만 바꿔 다시 돌리면 나머지는 SKIP.
#   - 키 1 · 키 2 줄 중 하나라도 있으면 두 키가 같은 값인지 먼저 본다 — 파일에 없는 쪽은 그 Secret(gh-radar-opendart-key ·
#     gh-radar-opendart-key-2) 최신 값을 변수에만 읽어 비교하고 곧바로 비운다. 같으면 새 버전 없이 ERROR(같은 키를 둘로 세면
#     실제 한도를 넘고 수집기가 시작을 거부한다). 상대 Secret 을 읽지 못하면 「SKIP 같은 값 검사 — <Secret> 을 읽지 못함」(리뷰 IN-05).
#   - 키별 검사(공용 최소 길이 검사 금지 — 음수 방 id 는 짧다):
#       OPENDART_API_KEY   영숫자 40자
#       OPENDART_API_KEY_2 영숫자 40자(키 1 과 같은 꼴)
#       TELEGRAM_BOT_TOKEN 숫자:영숫자_- (콜론 뒤 30자 이상)
#       TELEGRAM_CHAT_ID   ^-?[0-9]+$ (음수 허용 — 슈퍼그룹은 -100… 꼴)
#   - Secret 껍데기 · 수집기 SA 접근권은 만들지 않는다 — `GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh` 몫.
#   - 값을 바꾼 뒤 수집기는 다음 실행부터 읽는다(Job 은 `:latest` 버전을 실행 시작 때 읽는다). 이미 도는 실행에
#     바로 적용하려면 ops/alert-dart-alert-error-log.yaml 「비밀을 바꾼 뒤 도는 실행 처리」 를 따른다.
#
# 선택 env
#   DART_ALERT_ENV_FILE        입력 파일. 기본 ~/.config/gh-radar/dart-alert.env
#   CLOUDSDK_CORE_PROJECT      GCP 프로젝트. 기본 gh-radar
#   CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE  비어 있고 ~/.config/gcloud/gh-radar-deployer.json 이 있으면 그 키를 쓴다
#                              (빈 값으로 명시하면 gcloud 사용자 계정)
# ═══════════════════════════════════════════════════════════════

ENV_FILE="${DART_ALERT_ENV_FILE:-$HOME/.config/gh-radar/dart-alert.env}"
DART_KEY_SECRET=gh-radar-opendart-key
DART_KEY2_SECRET=gh-radar-opendart-key-2
TG_TOKEN_SECRET=gh-radar-telegram-bot-token
TG_CHAT_SECRET=gh-radar-telegram-chat-id

# 키별 꼴 — 변수로 두고 [[ =~ $RE ]] 로 쓴다(따옴표 없이 · bash 3.2 호환).
DART_KEY_RE='^[A-Za-z0-9]{40}$'
TG_TOKEN_RE='^[0-9]+:[A-Za-z0-9_-]{30,}$'
TG_CHAT_RE='^-?[0-9]+$'

case "${1:-}" in
  -h | --help)
    echo "사용: ! bash scripts/setup-dart-alert-secrets.sh   (입력: \${DART_ALERT_ENV_FILE:-~/.config/gh-radar/dart-alert.env} · 권한 600)"
    echo "      파일 네 줄: OPENDART_API_KEY= · OPENDART_API_KEY_2= · TELEGRAM_BOT_TOKEN= · TELEGRAM_CHAT_ID= (없는 줄은 SKIP)"
    echo "      키 2(OPENDART_API_KEY_2)는 키 1 과 다른 인증키여야 한다 — 같으면 새 버전 없이 ERROR"
    echo "      출력은 OK/SKIP/ERROR 줄뿐 — 값 · 길이는 나오지 않는다"
    exit 0
    ;;
  "") ;;
  *)
    echo "ERROR args — 인자를 받지 않는다 (--help 참고)" >&2
    exit 1
    ;;
esac

# gcloud 준비 — setup-kis-secrets.sh 관례(프로젝트 기본값 · deployer 키 자동 지정).
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

# 파일 권한(8진 3자리) — Linux(stat -c) · macOS(stat -f) 둘 다.
file_mode() {
  # GNU(stat -c)를 먼저 — GNU stat 의 -f 는 「파일시스템 상태」 라 '%Lp' 를 파일 이름으로 읽고 여러 줄을 먼저 찍는다(리뷰 IN-53).
  # macOS(BSD) stat 은 -c 를 모르니 실패하고 -f '%Lp' 로 간다.
  if stat -c '%a' "$1" >/dev/null 2>&1; then
    stat -c '%a' "$1"
  else
    stat -f '%Lp' "$1"
  fi
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
DART_KEY=""
DART_KEY2=""
TG_TOKEN=""
TG_CHAT=""
SEEN_DART_KEY=0
SEEN_DART_KEY2=0
SEEN_TG_TOKEN=0
SEEN_TG_CHAT=0
clear_values() {
  DART_KEY=""
  DART_KEY2=""
  TG_TOKEN=""
  TG_CHAT=""
}
# 한 줄을 통째로 읽고 첫 '=' 에서만 자른다(`IFS='=' read` 는 끝 '=' 를 떼어 낸다 — setup-kis-secrets.sh 사례).
while IFS= read -r line_raw || [[ -n "$line_raw" ]]; do
  line_raw="${line_raw%$'\r'}"
  [[ "$line_raw" == *=* ]] || continue
  line_key="${line_raw%%=*}"
  line_rest="${line_raw#*=}"
  line_key="${line_key#export }"
  line_key="${line_key//[[:space:]]/}"
  case "$line_key" in
    OPENDART_API_KEY)
      DART_KEY="$line_rest"
      SEEN_DART_KEY=1
      ;;
    OPENDART_API_KEY_2)
      DART_KEY2="$line_rest"
      SEEN_DART_KEY2=1
      ;;
    TELEGRAM_BOT_TOKEN)
      TG_TOKEN="$line_rest"
      SEEN_TG_TOKEN=1
      ;;
    TELEGRAM_CHAT_ID)
      TG_CHAT="$line_rest"
      SEEN_TG_CHAT=1
      ;;
    *) ;; # 빈 줄 · 주석 · 다른 키는 무시
  esac
done < "$ENV_FILE"
line_rest=""
line_raw=""

# 값 하나를 따옴표 한 겹 벗긴다(앞뒤 공백도 걷는다).
strip_quotes() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  if [[ ${#s} -ge 2 && ( ( "${s:0:1}" == '"' && "${s: -1}" == '"' ) || ( "${s:0:1}" == "'" && "${s: -1}" == "'" ) ) ]]; then
    s="${s:1:${#s}-2}"
  fi
  printf '%s' "$s"
}
DART_KEY="$(strip_quotes "$DART_KEY")"
DART_KEY2="$(strip_quotes "$DART_KEY2")"
TG_TOKEN="$(strip_quotes "$TG_TOKEN")"
TG_CHAT="$(strip_quotes "$TG_CHAT")"

# 키별 검사 — 사유만 출력한다(값 · 길이 · 앞뒤 글자 없음).
check_dart_key() {
  local v="$1"
  [[ -n "$v" ]] || { echo "ERROR OPENDART_API_KEY — 값이 비었다" >&2; return 1; }
  [[ "$v" =~ $DART_KEY_RE ]] || { echo "ERROR OPENDART_API_KEY — 꼴이 아니다(영숫자 40자 · 복사가 잘렸거나 공백이 섞였는지 확인)" >&2; return 1; }
}
check_dart_key2() {
  local v="$1"
  [[ -n "$v" ]] || { echo "ERROR OPENDART_API_KEY_2 — 값이 비었다" >&2; return 1; }
  [[ "$v" =~ $DART_KEY_RE ]] || { echo "ERROR OPENDART_API_KEY_2 — 꼴이 아니다(영숫자 40자 · 복사가 잘렸거나 공백이 섞였는지 확인)" >&2; return 1; }
}
check_tg_token() {
  local v="$1"
  [[ -n "$v" ]] || { echo "ERROR TELEGRAM_BOT_TOKEN — 값이 비었다" >&2; return 1; }
  [[ "$v" =~ $TG_TOKEN_RE ]] || { echo "ERROR TELEGRAM_BOT_TOKEN — 꼴이 아니다(숫자:영숫자_- · BotFather 토큰 전체를 복사했는지 확인)" >&2; return 1; }
}
check_tg_chat() {
  local v="$1"
  [[ -n "$v" ]] || { echo "ERROR TELEGRAM_CHAT_ID — 값이 비었다" >&2; return 1; }
  [[ "$v" =~ $TG_CHAT_RE ]] || { echo "ERROR TELEGRAM_CHAT_ID — 꼴이 아니다(숫자 · 음수 허용 — telegram-find-chat.sh 가 보여 준 id 그대로)" >&2; return 1; }
}

FAILED=0
PRESENT=0
if [[ "$SEEN_DART_KEY" == 1 ]]; then PRESENT=$((PRESENT + 1)); check_dart_key "$DART_KEY" || FAILED=1; fi
if [[ "$SEEN_DART_KEY2" == 1 ]]; then PRESENT=$((PRESENT + 1)); check_dart_key2 "$DART_KEY2" || FAILED=1; fi
if [[ "$SEEN_TG_TOKEN" == 1 ]]; then PRESENT=$((PRESENT + 1)); check_tg_token "$TG_TOKEN" || FAILED=1; fi
if [[ "$SEEN_TG_CHAT" == 1 ]]; then PRESENT=$((PRESENT + 1)); check_tg_chat "$TG_CHAT" || FAILED=1; fi
if [[ "$PRESENT" == 0 ]]; then
  echo "ERROR input — OPENDART_API_KEY · OPENDART_API_KEY_2 · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID 줄이 하나도 없다: $ENV_FILE" >&2
  exit 1
fi
if [[ "$FAILED" != 0 ]]; then
  clear_values
  exit 1
fi

# ── 2. gcloud · Secret 껍데기 ────────────────────────────────────
gcloud_prep || { clear_values; exit 1; }
for pair in "$SEEN_DART_KEY:$DART_KEY_SECRET" "$SEEN_DART_KEY2:$DART_KEY2_SECRET" "$SEEN_TG_TOKEN:$TG_TOKEN_SECRET" "$SEEN_TG_CHAT:$TG_CHAT_SECRET"; do
  [[ "${pair%%:*}" == 1 ]] || continue
  s="${pair#*:}"
  if ! gcloud secrets describe "$s" >/dev/null 2>&1; then
    echo "ERROR $s — Secret 없음 — 먼저 ! GCP_PROJECT_ID=${CLOUDSDK_CORE_PROJECT} bash scripts/setup-dart-alert-iam.sh" >&2
    clear_values
    exit 1
  fi
done

# ── 2b. 키 2 ≠ 키 1 (261113-rn7 U-2 · 리뷰 IN-05 양쪽) — 같은 값이면 어떤 새 버전도 만들지 않고 멈춘다. 파일에 없는 쪽은 그 Secret
#    최신 값을 변수에만 읽는다 · 비교 값은 곧바로 비운다 · 값 · 길이는 출력하지 않는다 ──
if [[ "$SEEN_DART_KEY" == 1 || "$SEEN_DART_KEY2" == 1 ]]; then
  key1_now=""
  key2_now=""
  other_secret=""
  if [[ "$SEEN_DART_KEY" == 1 ]]; then
    key1_now="$DART_KEY"
  else
    other_secret="$DART_KEY_SECRET"
    key1_now="$(gcloud secrets versions access latest --secret="$DART_KEY_SECRET" 2>/dev/null || true)"
  fi
  if [[ "$SEEN_DART_KEY2" == 1 ]]; then
    key2_now="$DART_KEY2"
  else
    other_secret="$DART_KEY2_SECRET"
    key2_now="$(gcloud secrets versions access latest --secret="$DART_KEY2_SECRET" 2>/dev/null || true)"
  fi
  if [[ -z "$key1_now" || -z "$key2_now" ]]; then
    echo "SKIP 같은 값 검사 — $other_secret 을 읽지 못함"
  elif [[ "$key1_now" == "$key2_now" ]]; then
    key1_now=""
    key2_now=""
    if [[ "$SEEN_DART_KEY2" == 1 ]]; then
      echo "ERROR OPENDART_API_KEY_2 — 키 1(OPENDART_API_KEY)과 같은 값이다(서로 다른 인증키여야 한다)" >&2
    else
      echo "ERROR OPENDART_API_KEY — 키 2(Secret $DART_KEY2_SECRET)와 같은 값이다(서로 다른 인증키여야 한다)" >&2
    fi
    clear_values
    exit 1
  fi
  key1_now=""
  key2_now=""
fi

# ── 3. 새 버전(같은 값이면 SKIP · 파일에 없으면 SKIP) ─────────────
put_secret() {
  local secret="$1" seen="$2" name="$3" secret_value="$4" current
  if [[ "$seen" != 1 ]]; then
    echo "SKIP $name — 파일에 없음 ($secret 그대로)"
    return 0
  fi
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

put_secret "$DART_KEY_SECRET" "$SEEN_DART_KEY" OPENDART_API_KEY "$DART_KEY" || FAILED=1
put_secret "$DART_KEY2_SECRET" "$SEEN_DART_KEY2" OPENDART_API_KEY_2 "$DART_KEY2" || FAILED=1
put_secret "$TG_TOKEN_SECRET" "$SEEN_TG_TOKEN" TELEGRAM_BOT_TOKEN "$TG_TOKEN" || FAILED=1
put_secret "$TG_CHAT_SECRET" "$SEEN_TG_CHAT" TELEGRAM_CHAT_ID "$TG_CHAT" || FAILED=1
clear_values
exit "$FAILED"
