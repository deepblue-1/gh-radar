#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# setup-push-secrets.sh — 체결 앱 푸시 비밀 주입 (Phase 40 · 40-09)
#
# 이 스크립트는 사용자가 직접 실행한다(메모리 「비밀 주입은 사용자 `!` 실행」 — 에이전트 실행은 분류기가 막는다):
#   ! bash scripts/setup-push-secrets.sh apns
#
# 규약 (mobile/scripts/setup-release-secrets.sh 와 같다)
#   - 대화형 입력 없음(`!` 셸에 TTY 가 없을 수 있다).
#   - 값은 어떤 경로로도 출력하지 않는다. 출력은 「OK <stage>」 / 「SKIP <stage> — 이미 같은 값」 /
#     「ERROR <stage> — <경로 · 사유만>」 뿐이다. 값 · 길이 · Key ID 를 찍지 않는다(.p8 파일 이름에 Key ID 가 들어 있어
#     경로는 `AuthKey_*.p8` 무늬로만 쓴다). 셸 추적 모드를 켜지 않는다.
#   - 이미 같은 값이 최신 버전이면 새 버전을 만들지 않는다(재실행 안전).
#   - Secret 껍데기 · relay SA 접근권은 만들지 않는다 — `GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh` 몫.
#
# stages
#   apns  ~/.config/gh-trade/push/AuthKey_<KeyID>.p8 (40-04 에서 받은 APNs 인증 키 · 600) 을
#         gh-radar-apns-auth-key ← .p8 의 base64 **한 줄**(docker `--env-file` 은 여러 줄 값을 못 싣는다 — RESEARCH Pitfall 10)
#         gh-radar-apns-key-id   ← 파일 이름 `AuthKey_` 뒤 10자
#         에 새 버전으로 올린다. relay 는 다음 `bash scripts/deploy-relay.sh` 때 읽는다(APNS_AUTH_KEY_B64 · APNS_KEY_ID).
#
# 선택 env
#   GHTRADE_PUSH_DIR           .p8 디렉터리. 기본 ~/.config/gh-trade/push
#   CLOUDSDK_CORE_PROJECT      GCP 프로젝트. 기본 gh-radar
#   CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE  비어 있고 ~/.config/gcloud/gh-radar-deployer.json 이 있으면 그 키를 쓴다
#                              (빈 값으로 명시하면 gcloud 사용자 계정)
# ═══════════════════════════════════════════════════════════════

PUSH_DIR="${GHTRADE_PUSH_DIR:-$HOME/.config/gh-trade/push}"
APNS_KEY_SECRET=gh-radar-apns-auth-key
APNS_KEY_ID_SECRET=gh-radar-apns-key-id

usage() {
  echo "사용: bash scripts/setup-push-secrets.sh <stage>..." >&2
  echo "  stages: apns" >&2
}

# gcloud 준비 — setup-release-secrets.sh 관례(프로젝트 기본값 · deployer 키 자동 지정).
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

stage_apns() {
  local p8 base key_id mode new_b64 old_b64 old_id changed=0
  local -a found=()

  if [[ ! -d "$PUSH_DIR" ]]; then
    echo "ERROR apns — 디렉터리 없음: $PUSH_DIR (40-04 에서 받은 AuthKey_*.p8 을 여기에 둔다)" >&2
    return 1
  fi
  shopt -s nullglob
  found=("$PUSH_DIR"/AuthKey_*.p8)
  shopt -u nullglob
  if [[ "${#found[@]}" -ne 1 ]]; then
    echo "ERROR apns — $PUSH_DIR 에 AuthKey_*.p8 이 정확히 1개여야 한다 (지금 ${#found[@]}개)" >&2
    return 1
  fi
  p8="${found[0]}"
  mode="$(file_mode "$p8")"
  if [[ "$mode" != 600 ]]; then
    echo "ERROR apns — 권한이 600 이 아니다: $PUSH_DIR/AuthKey_*.p8 (chmod 600 뒤 다시 실행)" >&2
    return 1
  fi
  base="$(basename "$p8")"
  key_id="${base#AuthKey_}"
  key_id="${key_id%.p8}"
  if [[ ! "$key_id" =~ ^[A-Za-z0-9]{10}$ ]]; then
    echo "ERROR apns — 파일 이름에서 Key ID(AuthKey_ 뒤 10자 영숫자)를 읽지 못했다: $PUSH_DIR/AuthKey_*.p8" >&2
    return 1
  fi
  if ! grep -q -- '-----BEGIN PRIVATE KEY-----' "$p8"; then
    echo "ERROR apns — PEM 개인키(BEGIN PRIVATE KEY)가 아니다: $PUSH_DIR/AuthKey_*.p8" >&2
    return 1
  fi

  gcloud_prep || return 1
  local s
  for s in "$APNS_KEY_SECRET" "$APNS_KEY_ID_SECRET"; do
    if ! gcloud secrets describe "$s" >/dev/null 2>&1; then
      echo "ERROR apns — Secret '$s' 없음 — 먼저 GCP_PROJECT_ID=${CLOUDSDK_CORE_PROJECT} bash scripts/setup-relay-iam.sh" >&2
      return 1
    fi
  done

  # 값은 변수에만 둔다(화면 · 명령줄 · 파일에 남기지 않는다). 최신 버전과 같으면 새 버전을 만들지 않는다.
  new_b64="$(base64 < "$p8" | tr -d '\n')"
  old_b64="$(gcloud secrets versions access latest --secret="$APNS_KEY_SECRET" 2>/dev/null || true)"
  old_id="$(gcloud secrets versions access latest --secret="$APNS_KEY_ID_SECRET" 2>/dev/null || true)"

  # 두 비밀은 짝이다(새 키 + 옛 Key ID 면 relay 의 JWT 가 모든 iOS 송신에서 403 InvalidProviderToken — 40-REVIEW IN-04).
  # 키를 올린 뒤 Key ID 추가가 실패하면 방금 만든 키 버전을 disable 로 되돌린다. 버전 이름(`…/versions/N`)은 값이 아니라
  # 잡아 둬도 된다.
  local key_added=0 key_ver=""
  if [[ "$new_b64" != "$old_b64" ]]; then
    if ! key_ver="$(printf '%s' "$new_b64" | gcloud secrets versions add "$APNS_KEY_SECRET" --data-file=- --format='value(name)' 2>/dev/null)"; then
      new_b64=""
      old_b64=""
      echo "ERROR apns — Secret '$APNS_KEY_SECRET' 새 버전 실패 (권한 · 프로젝트 확인)" >&2
      return 1
    fi
    key_added=1
    key_ver="${key_ver##*/}"
    changed=1
  fi
  new_b64=""
  old_b64=""
  if [[ "$key_id" != "$old_id" ]]; then
    if ! printf '%s' "$key_id" | gcloud secrets versions add "$APNS_KEY_ID_SECRET" --data-file=- >/dev/null 2>&1; then
      if [[ "$key_added" == 0 ]]; then
        echo "ERROR apns — Secret '$APNS_KEY_ID_SECRET' 새 버전 실패 (권한 · 프로젝트 확인) — 키는 그대로라 짝은 안 바뀌었다 · 다시 실행" >&2
      elif [[ "$key_ver" =~ ^[0-9]+$ ]] \
        && gcloud secrets versions disable "$key_ver" --secret="$APNS_KEY_SECRET" >/dev/null 2>&1; then
        echo "ERROR apns — Secret '$APNS_KEY_ID_SECRET' 새 버전 실패 — 방금 만든 '$APNS_KEY_SECRET' 버전 ${key_ver} 을 disable 로 되돌렸다(짝 불일치 방지) · 권한 · 프로젝트 확인 뒤 다시 실행" >&2
      else
        echo "ERROR apns — 짝 불일치 — '$APNS_KEY_SECRET' 새 버전(${key_ver:-번호 모름}) + 옛 '$APNS_KEY_ID_SECRET' · 되돌리기(disable)도 실패. 배포 전에 다시 실행하거나 그 키 버전을 disable 할 것" >&2
      fi
      return 1
    fi
    changed=1
  fi

  if [[ "$changed" == 0 ]]; then
    echo "SKIP apns — 이미 같은 값"
  else
    echo "OK apns — $APNS_KEY_SECRET · $APNS_KEY_ID_SECRET 새 버전 (relay 는 다음 bash scripts/deploy-relay.sh 때 읽는다)"
  fi
}

if [[ "$#" -lt 1 ]]; then
  usage
  exit 1
fi

for STAGE in "$@"; do
  case "$STAGE" in
    apns) stage_apns ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR $STAGE — 알 수 없는 stage" >&2
      usage
      exit 1
      ;;
  esac
done
