#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# setup-release-secrets.sh — GH Trade 릴리스 비밀 주입 (Phase 22 · D-06 · RESEARCH Pattern 5)
#
# 이 스크립트는 사용자가 직접 실행한다:
#   ! bash mobile/scripts/setup-release-secrets.sh <stage>...
#   예) ! bash mobile/scripts/setup-release-secrets.sh dir asc
#
# 규약
#   - 대화형 입력 없음(`!` 셸에 TTY 가 없을 수 있다 — read 프롬프트 · keytool 대화형 금지).
#   - 값은 어떤 경로로도 출력하지 않는다. 출력은 「OK <stage>」 / 「SKIP <stage> — 이미 있음」 /
#     「ERROR <stage> — …(경로만)」 뿐이다. 셸 추적 모드를 켜지 않는다.
#   - 이미 있는 파일은 덮어쓰지 않고 SKIP 한다(재실행 안전 · 엣지 FA-4).
#   - 비밀은 저장소 밖 ${GHTRADE_RELEASE_DIR:-~/.config/gh-trade/release}(700) 아래 600 파일로만 둔다.
#
# stages
#   dir   비밀 디렉터리 생성 · 700
#   asc   weekly-wine 의 App Store Connect API 키(.p8)와 키 ID · 발급자 ID 줄만 옮겨 ios.env 를 만든다
#   (22-04 가 keystore · backup · play-sa 를 더한다)
#
# 선택 env
#   GHTRADE_RELEASE_DIR        비밀 디렉터리. 기본 ~/.config/gh-trade/release
#   WEEKLY_WINE_FASTLANE_DIR   ASC 키 원본 위치. 기본 ~/repos/weekly-wine-app/ios/App/fastlane
# ═══════════════════════════════════════════════════════════════

REL="${GHTRADE_RELEASE_DIR:-$HOME/.config/gh-trade/release}"

usage() {
  echo "사용: bash mobile/scripts/setup-release-secrets.sh <stage>..." >&2
  echo "  stages: dir · asc   (22-04: keystore · backup · play-sa)" >&2
}

stage_dir() {
  mkdir -p "$REL"
  chmod 700 "$REL"
  echo "OK dir"
}

stage_asc() {
  local ww src_env key_src tmp
  ww="${WEEKLY_WINE_FASTLANE_DIR:-$HOME/repos/weekly-wine-app/ios/App/fastlane}"
  src_env="$ww/.env.default"

  if [[ ! -d "$REL" ]]; then
    echo "ERROR asc — 비밀 디렉터리가 없다: $REL (먼저 dir 단계를 실행)" >&2
    return 1
  fi
  if [[ -f "$REL/ios.env" ]]; then
    echo "SKIP asc — 이미 있음"
    return 0
  fi
  if [[ ! -f "$src_env" ]]; then
    echo "ERROR asc — weekly-wine ASC 키 파일 없음: $src_env" >&2
    return 1
  fi

  # 파일 전체를 옮기지 않는다 — 두 키 줄만 추린다(값은 화면에 나오지 않는다).
  tmp="$(mktemp "$REL/.asc.XXXXXX")"
  grep -E '^(export[[:space:]]+)?ASC_(KEY_ID|ISSUER_ID)=' "$src_env" \
    | sed -E 's/^export[[:space:]]+//' | tr -d '\r' > "$tmp" || true

  local ASC_KEY_ID="" ASC_ISSUER_ID=""
  # shellcheck disable=SC1090
  source "$tmp"
  if [[ -z "$ASC_KEY_ID" || -z "$ASC_ISSUER_ID" ]]; then
    rm -f "$tmp"
    echo "ERROR asc — $src_env 에 ASC_KEY_ID · ASC_ISSUER_ID 줄이 없다" >&2
    return 1
  fi
  if [[ ! "$ASC_KEY_ID" =~ ^[A-Za-z0-9]+$ ]]; then
    rm -f "$tmp"
    echo "ERROR asc — ASC_KEY_ID 형식이 예상과 다르다(영숫자만 허용)" >&2
    return 1
  fi

  key_src="$ww/AuthKey.p8"
  if [[ ! -f "$key_src" ]]; then key_src="$ww/AuthKey_${ASC_KEY_ID}.p8"; fi
  if [[ ! -f "$key_src" ]]; then
    rm -f "$tmp"
    echo "ERROR asc — weekly-wine ASC 키 파일 없음: $ww/AuthKey.p8" >&2
    return 1
  fi

  local key_dst="$REL/AuthKey_${ASC_KEY_ID}.p8"
  if [[ ! -f "$key_dst" ]]; then
    install -m 600 "$key_src" "$key_dst"
  fi

  {
    cat "$tmp"
    echo "ASC_KEY_PATH=$key_dst"
    echo "GHTRADE_RELEASE_OUT=$HOME/Library/Developer/gh-trade-release/ios"
  } > "$REL/.ios.env.new"
  rm -f "$tmp"
  chmod 600 "$REL/.ios.env.new"
  mv "$REL/.ios.env.new" "$REL/ios.env"
  echo "OK asc"
}

if [[ $# -eq 0 ]]; then
  usage
  exit 2
fi

for stage in "$@"; do
  case "$stage" in
    dir) stage_dir ;;
    asc) stage_asc ;;
    *)
      echo "모르는 stage: $stage" >&2
      usage
      exit 2
      ;;
  esac
done
