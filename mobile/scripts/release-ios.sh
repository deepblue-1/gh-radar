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
# 종료 코드: 3 = env 파일 없음 · 키 비어 있음 · 키 파일 없음(fastlane 시작 전)
#            그 외 = fastlane lane 또는 check-ipa.sh 의 종료 코드
#
# 선택 env: GHTRADE_RELEASE_ENV  env 파일 경로. 기본 ~/.config/gh-trade/release/ios.env
# ═══════════════════════════════════════════════════════════════

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

(cd ios/App && bundle exec fastlane beta)
bash scripts/check-ipa.sh
