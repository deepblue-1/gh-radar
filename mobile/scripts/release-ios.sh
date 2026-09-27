#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# release-ios.sh — GH Trade iOS 릴리스 래퍼 (Phase 22 · D-06 · D-07 · RESEARCH Pattern 4)
#
# 이 래퍼는 `native:release:ios` 의 마지막 단계다 — 단독 실행 전에 `native:sync` +
# `native:verify-prod` 가 선행돼야 한다(Pitfall 8). 평소에는
#   pnpm --filter @gh-radar/mobile run native:release:ios
# 로만 실행한다(cap sync 양 플랫폼 → PROD CONFIG OK → 이 래퍼).
#
# 두 릴리스 명령(iOS · Android)을 동시에 돌리지 않는다 — 둘 다 cap sync 로 같은 생성 파일을
# 다시 쓴다(엣지 FA-5).
#
# 비밀은 이 래퍼가 화면에 내보내지 않는다 (scripts/dma-credentials.sh 와 동일 규약):
#   env 파일은 `set -a; source` 로만 읽고 내용을 echo 하지 않으며, 검증 실패 시에도
#   **비어 있는 키 이름만** 출력한다. 값은 어떤 경로로도 찍지 않는다. 셸 추적 모드 금지.
#
# 사용: bash scripts/release-ios.sh [beta|latest]   (기본 beta)
#   beta    Release archive → check-ipa → TestFlight 업로드 (인자 없음과 같다)
#           check-ipa 는 lane 안에서 업로드 **전에** 돈다 — 실패하면 업로드하지 않는다(22-REVIEW CR-01).
#           여기서 다시 돌리지 않는다: 같은 IPA 를 두 번 보는 셈이고, 업로드 뒤 검사는 막지 못한다.
#   latest  조회 전용 — 최신 TestFlight 빌드 번호 + 처리 상태 한 줄
#           「latest TestFlight build {번호} state {상태}」 (업로드·아카이브·check-ipa 없음)
#   env 검사는 두 모드에 똑같이 적용한다(ios.env 는 한 파일이다).
#
# 종료 코드: 2 = 모르는 모드(env 로드 전)
#            3 = env 파일 없음 · 키 비어 있음 · 키 파일 없음(fastlane 시작 전)
#            그 외 = fastlane lane 의 종료 코드(check-ipa 실패 포함 — 그때는 업로드 안 됨)
#
# 선택 env: GHTRADE_RELEASE_ENV  env 파일 경로. 기본 ~/.config/gh-trade/release/ios.env
# ═══════════════════════════════════════════════════════════════

# 모드 검사는 env 로드 전에 한다 — 오타가 기본 업로드(beta)로 떨어지지 않게(T-22-28).
MODE="${1:-beta}"
case "$MODE" in
  beta|latest) ;;
  *)
    echo "사용: bash scripts/release-ios.sh [beta|latest]   (기본 beta)" >&2
    exit 2
    ;;
esac

# mobile/ 로 이동 — 어느 cwd 에서 실행해도 같은 상대 경로를 쓴다.
cd "$(dirname "$0")/.."

ENV_FILE="${GHTRADE_RELEASE_ENV:-$HOME/.config/gh-trade/release/ios.env}"
INJECT="! bash mobile/scripts/setup-release-secrets.sh dir asc"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: 릴리스 env 파일이 없습니다: $ENV_FILE" >&2
  echo "주입: $INJECT" >&2
  exit 3
fi

# 파일 내용은 출력하지 않는다. `set -a` 로 source 하는 동안만 자동 export 한다.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 배열 대신 문자열로 모은다 — bash 3.2(macOS 기본)에서 `set -u` + 빈 배열 참조가 터진다.
MISSING=""
if [[ -z "${ASC_KEY_ID:-}" ]]; then MISSING="$MISSING ASC_KEY_ID"; fi
if [[ -z "${ASC_ISSUER_ID:-}" ]]; then MISSING="$MISSING ASC_ISSUER_ID"; fi
if [[ -z "${ASC_KEY_PATH:-}" ]]; then MISSING="$MISSING ASC_KEY_PATH"; fi
if [[ -z "${GHTRADE_RELEASE_OUT:-}" ]]; then MISSING="$MISSING GHTRADE_RELEASE_OUT"; fi
if [[ -n "$MISSING" ]]; then
  # 이름만 찍는다 — 값은 절대 출력하지 않는다.
  echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
  echo "주입: $INJECT" >&2
  exit 3
fi
if [[ ! -f "$ASC_KEY_PATH" ]]; then
  echo "ERROR: ASC_KEY_PATH 가 가리키는 키 파일이 없습니다: $ASC_KEY_PATH" >&2
  echo "주입: $INJECT" >&2
  exit 3
fi

# fastlane 은 Homebrew Ruby 4 로 실행한다(시스템 Ruby 2.6 은 최소 3.1 미달).
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
export FASTLANE_SKIP_UPDATE_CHECK=1
export FASTLANE_HIDE_CHANGELOG=1

if [[ "$MODE" == "latest" ]]; then
  (cd ios/App && bundle exec fastlane latest)
  exit 0
fi

(cd ios/App && bundle exec fastlane beta)
