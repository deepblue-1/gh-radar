#!/usr/bin/env bash
# GH Trade 릴리스 IPA 검사 (Phase 22 · T-22-04 · RESEARCH Code Examples 「IPA 검사」).
#
# 왜: TestFlight 로 나간 빌드는 테스터 기기에 그대로 깔린다. 여기서 막지 않으면 테스터가
#     - dev URL(localhost)을 여는 빈 화면을 보거나(server.url · cleartext),
#     - Google 로그인이 키체인 -34018 로 실패하거나(application-identifier 누락 · 다른 팀 서명),
#     - 웹 인스펙터가 켜진 빌드를 받는다(CAPACITOR_DEBUG=true · get-task-allow true).
#     빌드 번호가 lane 이 주입한 값과 다르면 다음 업로드가 중복 번호로 거절된다(D-09).
#
# 사용: bash scripts/check-ipa.sh [IPA] [EXPECTED_BUILD]
#   기본값 IPA = $GHTRADE_RELEASE_OUT/App.ipa · EXPECTED_BUILD = $GHTRADE_RELEASE_OUT/build_number.txt
# 통과: 「IPA CHECK OK build=…」 한 줄 · exit 0. 위반: 「IPA CHECK FAIL — …」 줄들 · exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${GHTRADE_RELEASE_OUT:-}"
IPA="${1:-$OUT/App.ipa}"
if [[ -n "${2:-}" ]]; then
  EXPECTED="$2"
elif [[ -f "$OUT/build_number.txt" ]]; then
  EXPECTED="$(cat "$OUT/build_number.txt")"
else
  EXPECTED=""
fi
TEAM="954QPCS3F5"
APP_ID="$TEAM.com.ghtrade.app"
PROD_URL="https://trade.jx1.io"   # verify-prod-config.mjs PROD_URL 과 같은 값

if [[ ! -f "$IPA" ]]; then
  echo "IPA CHECK FAIL — IPA 가 없다: $IPA" >&2
  exit 1
fi

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
unzip -q "$IPA" -d "$T"
APP="$T/Payload/App.app"
if [[ ! -d "$APP" ]]; then
  echo "IPA CHECK FAIL — Payload/App.app 이 없다: $IPA" >&2
  exit 1
fi

FAILS=""
fail() { FAILS="$FAILS
IPA CHECK FAIL — $1"; }

PB=/usr/libexec/PlistBuddy
PLIST="$APP/Info.plist"

# 서명 — Apple Distribution(팀 954QPCS3F5)
SIGN="$(codesign -dvv "$APP" 2>&1 || true)"
if ! printf '%s\n' "$SIGN" | grep -q "Authority=Apple Distribution: .*($TEAM)"; then
  fail "Apple Distribution($TEAM) 서명이 아니다"
fi

# 엔타이틀먼트 — application-identifier(키체인 · 로그인 유지) · get-task-allow false
ENT="$(codesign -d --entitlements :- "$APP" 2>/dev/null || true)"
if ! printf '%s\n' "$ENT" | grep -q "<string>$APP_ID</string>"; then
  fail "application-identifier $APP_ID 가 없다 — Google 로그인이 키체인(-34018)에서 실패한다"
fi
if ! printf '%s\n' "$ENT" | grep -A1 "<key>get-task-allow</key>" | grep -q "<false/>"; then
  fail "get-task-allow 가 false 가 아니다 — 디버거 연결이 가능한 빌드다"
fi

# 빌드 번호 — lane 이 주입한 12자리 값
BUILD="$($PB -c 'Print :CFBundleVersion' "$PLIST" 2>/dev/null || true)"
if [[ ! "$BUILD" =~ ^[0-9]{12}$ ]]; then
  fail "CFBundleVersion 이 12자리 숫자가 아니다: $BUILD"
fi
if [[ -z "$EXPECTED" || "$BUILD" != "$EXPECTED" ]]; then
  fail "CFBundleVersion($BUILD) 이 lane 빌드 번호(${EXPECTED:-없음})와 다르다"
fi
SHORT="$($PB -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null || true)"
if [[ "$SHORT" != "1.0" ]]; then
  fail "CFBundleShortVersionString 이 1.0 이 아니다: $SHORT"
fi

# 수출 규정 — HTTPS 만 사용하는 면제
ENC="$($PB -c 'Print :ITSAppUsesNonExemptEncryption' "$PLIST" 2>/dev/null || true)"
if [[ "$ENC" != "false" ]]; then
  fail "ITSAppUsesNonExemptEncryption 이 false 가 아니다: ${ENC:-없음}"
fi

# 웹 인스펙터 — Release 구성에는 debug.xcconfig 가 없어 빈 값이어야 한다
DBG="$($PB -c 'Print :CAPACITOR_DEBUG' "$PLIST" 2>/dev/null || true)"
if [[ "$DBG" == "true" ]]; then
  fail "CAPACITOR_DEBUG=true — 웹 인스펙터가 켜진 빌드다"
fi

# 운영 URL · cleartext
CFG="$APP/capacitor.config.json"
if [[ ! -f "$CFG" ]]; then
  fail "Payload/App.app/capacitor.config.json 이 없다"
elif ! node -e '
  const c = require(process.argv[1]);
  const s = c.server || {};
  process.exit(s.url === process.argv[2] && s.cleartext !== true ? 0 : 1);
' "$CFG" "$PROD_URL"; then
  fail "capacitor.config.json server.url 이 $PROD_URL 이 아니거나 cleartext 가 켜져 있다"
fi

if [[ -n "$FAILS" ]]; then
  printf '%s\n' "$FAILS" | sed '/^$/d' >&2
  exit 1
fi
echo "IPA CHECK OK build=$EXPECTED"
