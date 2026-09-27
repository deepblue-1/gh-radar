#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# release-android.sh — GH Trade Android 릴리스 래퍼 (Phase 22 · D-07 · D-08 · D-13~D-17 · RESEARCH Pattern 4 · 재범위 부록 F3)
#
# 이 래퍼는 `native:release:android(:aab·:play)` 의 마지막 단계다 — 업로드·빌드 모드를 단독 실행하기
# 전에 `native:sync` + `native:verify-prod` 가 선행돼야 한다(Pitfall 8). 평소에는
#   pnpm --filter @gh-radar/mobile run native:release:android        (APK → Firebase App Distribution · Phase 22 기본)
#   pnpm --filter @gh-radar/mobile run native:release:android:aab    (AAB 만 — Play 경로 보존)
#   pnpm --filter @gh-radar/mobile run native:release:android:play   (AAB → Play internal — Phase 23)
# 로만 실행한다(cap sync 양 플랫폼 → PROD CONFIG OK → 이 래퍼).
#
# 두 릴리스 명령(iOS · Android)을 동시에 돌리지 않는다 — 둘 다 cap sync 로 같은 생성 파일을
# 다시 쓴다(엣지 FA-5).
# 같은 분에 다시 돌리지 않는다 — versionCode 가 같아 Play 가 거절하고, Firebase 에서도 두 릴리스가
# 같은 번호라 구분되지 않는다(엣지 FA-1 · 재범위 부록 Pitfall F10). 1분 뒤 재실행.
#
# 비밀은 이 래퍼가 화면에 내보내지 않는다 (scripts/dma-credentials.sh 와 동일 규약):
#   env 파일은 `set -a; source` 로만 읽고 내용을 echo 하지 않으며, 검증 실패 시에도
#   **비어 있는 키 이름만** 출력한다. 값은 어떤 경로로도 찍지 않는다. 셸 추적 모드 금지.
#   Firebase SA 키는 경로만 넘기고 내용은 열지 않는다.
#
# 사용: bash scripts/release-android.sh [firebase|firebase-latest|check-apk|build|check|beta|validate|track]   (기본 firebase)
#   Phase 22 기본 — APK → Firebase App Distribution (D-13 · D-15):
#     firebase         APK 빌드 → check-apk(lane 안 · 업로드 전 게이트) → Firebase 업로드(그룹 ghtrade-testers)
#     firebase-latest  Firebase 최신 릴리스 buildVersion 출력(lane firebase_latest · 업로드 키 불필요)
#     check-apk        APK 검사만(fastlane 없음)
#   AAB — 보존(D-16):
#     build            AAB 빌드 → check-aab
#     check            AAB 검사만(fastlane 없음)
#   Play — Phase 23 이 쓴다(play-sa 필요 · D-16):
#     beta             AAB 빌드 → Play internal 업로드 → check-aab
#     validate         Play SA JSON 확인
#     track            internal 트랙 versionCode 출력
#
# 종료 코드: 2 = 모르는 모드(env 로드 전)
#            3 = env 파일 없음 · 키 비어 있음 · 키스토어/SA 키 파일 없음(fastlane 시작 전 · `!` 주입 명령 안내)
#            그 외 = fastlane lane 또는 check-apk.sh · check-aab.sh 의 종료 코드
#
# 선택 env: GHTRADE_RELEASE_ENV         env 파일 경로. 기본 ~/.config/gh-trade/release/android.env
#           GHTRADE_RELEASE_DIR         비밀 디렉터리. 기본 ~/.config/gh-trade/release
#           FIREBASE_APPDISTRO_SA_JSON  Firebase 업로드 전용 SA 키 경로. 기본 $GHTRADE_RELEASE_DIR/firebase-appdistro-service-account.json
#           FIREBASE_APPDISTRO_GROUPS   배포 그룹 별칭(쉼표 구분). 기본 ghtrade-testers
#           PLAY_RELEASE_STATUS         beta 업로드 상태(기본 completed · draft 앱이면 draft — Pitfall 9)
# ═══════════════════════════════════════════════════════════════

MODE="${1:-firebase}"
case "$MODE" in
  firebase|firebase-latest|check-apk|build|check|beta|validate|track) ;;
  *)
    echo "사용: bash scripts/release-android.sh [firebase|firebase-latest|check-apk|build|check|beta|validate|track]   (기본 firebase)" >&2
    exit 2
    ;;
esac

# mobile/ 로 이동 — 어느 cwd 에서 실행해도 같은 상대 경로를 쓴다.
cd "$(dirname "$0")/.."

ENV_FILE="${GHTRADE_RELEASE_ENV:-$HOME/.config/gh-trade/release/android.env}"
INJECT_KEYSTORE="! bash mobile/scripts/setup-release-secrets.sh keystore backup"
INJECT_PLAY="! bash mobile/scripts/setup-release-secrets.sh play-sa"
INJECT_FIREBASE="! bash mobile/scripts/setup-release-secrets.sh firebase-sa"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: 릴리스 env 파일이 없습니다: $ENV_FILE" >&2
  echo "주입: $INJECT_KEYSTORE" >&2
  exit 3
fi

# 파일 내용은 출력하지 않는다. `set -a` 로 source 하는 동안만 자동 export 한다.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 배열 대신 문자열로 모은다 — bash 3.2(macOS 기본)에서 `set -u` + 빈 배열 참조가 터진다.
MISSING=""
need() { if [[ -z "${!1:-}" ]]; then MISSING="$MISSING $1"; fi; }

case "$MODE" in
  firebase|build|beta|check)
    need GHTRADE_UPLOAD_STORE_FILE
    need GHTRADE_UPLOAD_STORE_PASSWORD
    need GHTRADE_UPLOAD_KEY_ALIAS
    need GHTRADE_UPLOAD_KEY_PASSWORD
    need GHTRADE_UPLOAD_SHA1
    ;;
  check-apk)
    need GHTRADE_UPLOAD_SHA1
    ;;
esac
if [[ -n "$MISSING" ]]; then
  # 이름만 찍는다 — 값은 절대 출력하지 않는다.
  echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
  echo "주입: $INJECT_KEYSTORE" >&2
  exit 3
fi
case "$MODE" in
  firebase|build|beta)
    if [[ ! -f "$GHTRADE_UPLOAD_STORE_FILE" ]]; then
      echo "ERROR: GHTRADE_UPLOAD_STORE_FILE 이 가리키는 키스토어가 없습니다: $GHTRADE_UPLOAD_STORE_FILE" >&2
      echo "복구: Secret Manager gh-radar-ghtrade-upload-keystore 백업에서 되살린다 — 새로 만들면 Play 가 업로드를 거부한다" >&2
      exit 3
    fi
    ;;
esac

case "$MODE" in
  beta|validate|track)
    need GOOGLE_PLAY_JSON_KEY
    if [[ -n "$MISSING" ]]; then
      echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
      echo "주입: $INJECT_PLAY" >&2
      exit 3
    fi
    if [[ ! -f "$GOOGLE_PLAY_JSON_KEY" ]]; then
      echo "ERROR: GOOGLE_PLAY_JSON_KEY 가 가리키는 SA JSON 이 없습니다: $GOOGLE_PLAY_JSON_KEY" >&2
      echo "주입: $INJECT_PLAY" >&2
      exit 3
    fi
    ;;
esac

# Firebase 업로드 전용 SA 키(D-17) — 경로는 비밀이 아니라 android.env 없이 기본값을 쓴다. 내용은 열지 않는다.
case "$MODE" in
  firebase|firebase-latest)
    export FIREBASE_APPDISTRO_SA_JSON="${FIREBASE_APPDISTRO_SA_JSON:-${GHTRADE_RELEASE_DIR:-$HOME/.config/gh-trade/release}/firebase-appdistro-service-account.json}"
    if [[ ! -f "$FIREBASE_APPDISTRO_SA_JSON" ]]; then
      echo "ERROR: Firebase 업로드 SA 키가 없습니다: $FIREBASE_APPDISTRO_SA_JSON" >&2
      echo "주입: $INJECT_FIREBASE" >&2
      exit 3
    fi
    ;;
esac

if [[ "$MODE" == "check" ]]; then
  bash scripts/check-aab.sh
  exit 0
fi
if [[ "$MODE" == "check-apk" ]]; then
  bash scripts/check-apk.sh
  exit 0
fi

# fastlane 은 Homebrew Ruby 4 로 실행한다(시스템 Ruby 2.6 은 최소 3.1 미달).
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
export FASTLANE_SKIP_UPDATE_CHECK=1
export FASTLANE_HIDE_CHANGELOG=1

# 모드 이름의 하이픈 → lane 이름의 밑줄(firebase-latest → lane firebase_latest).
LANE="${MODE//-/_}"
case "$MODE" in
  firebase|firebase-latest)
    # ADC 폴백 차단(이중 방어 · Pitfall F2) — ~/.zshrc 가 owner deployer 키를 export 한다.
    # lane 은 service_credentials_file: 로 전용 SA 키만 쓴다.
    unset GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN
    ;;
esac

(cd android && bundle exec fastlane "$LANE")
case "$MODE" in
  build|beta) bash scripts/check-aab.sh ;;
esac
