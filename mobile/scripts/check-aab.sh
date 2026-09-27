#!/usr/bin/env bash
# GH Trade 릴리스 AAB 검사 (Phase 22 · T-22-04 · D-08 · RESEARCH Code Examples 「AAB 검사」).
#
# 왜: Play 는 업로드 키로 서명된 AAB 만 받는다(앱 서명 키는 Google 이 보관 — D-08). 다른 키로 서명되면
#     업로드가 거절되고, 여기서 막지 않으면 테스터가
#     - dev URL(localhost)을 여는 빈 화면을 보거나(server.url · cleartext),
#     - WebView 원격 디버깅이 켜진 빌드를 받는다(android.webContentsDebuggingEnabled).
#
# 사용: bash scripts/check-aab.sh [AAB]
#   기본값 AAB = android/app/build/outputs/bundle/release/app-release.aab (mobile/ 기준 · ignore 대상)
#   필요 env: GHTRADE_UPLOAD_SHA1 (업로드 인증서 SHA-1 — 공개 지문 · release-android.sh 가 android.env 에서 싣는다)
# 통과: 「AAB CHECK OK sha1=…」 한 줄 · exit 0. 위반: 「AAB CHECK FAIL — …」 줄들 · exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

AAB="${1:-android/app/build/outputs/bundle/release/app-release.aab}"
EXPECTED_SHA1="${GHTRADE_UPLOAD_SHA1:-}"
PROD_URL="https://trade.jx1.io"   # verify-prod-config.mjs PROD_URL 과 같은 값

if [[ ! -f "$AAB" ]]; then
  echo "AAB CHECK FAIL — AAB 가 없다: $AAB" >&2
  exit 1
fi

# JDK 도구 위치 — PATH 의 /usr/bin/keytool · jarsigner 는 JDK 가 없으면 동작하지 않는 macOS 스텁이다.
jdk_tool() {
  local name="$1" c
  for c in "${JAVA_HOME:-}/bin/$name" "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/$name"; do
    if [[ -x "$c" ]]; then echo "$c"; return 0; fi
  done
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  return 1
}

FAILS=""
fail() { FAILS="$FAILS
AAB CHECK FAIL — $1"; }

# 서명 인증서 SHA-1 == 업로드 인증서 SHA-1 (대소문자 무시)
SHA1=""
if ! KEYTOOL="$(jdk_tool keytool)"; then
  fail "keytool 을 찾지 못했다(JAVA_HOME 또는 Android Studio JBR)"
else
  SHA1="$("$KEYTOOL" -printcert -jarfile "$AAB" 2>/dev/null | awk '/SHA1:/{print $2; exit}' || true)"
  if [[ -z "$SHA1" ]]; then
    fail "서명 인증서가 없다 — 서명되지 않은 AAB"
  elif [[ -z "$EXPECTED_SHA1" ]]; then
    fail "GHTRADE_UPLOAD_SHA1 이 비어 있다 — android.env 확인(주입: ! bash mobile/scripts/setup-release-secrets.sh keystore)"
  else
    got="$(printf '%s' "$SHA1" | tr '[:lower:]' '[:upper:]')"
    want="$(printf '%s' "$EXPECTED_SHA1" | tr '[:lower:]' '[:upper:]')"
    if [[ "$got" != "$want" ]]; then
      fail "업로드 키로 서명되지 않았다 — 서명 SHA-1 $SHA1 ≠ 업로드 SHA-1 $EXPECTED_SHA1"
    fi
  fi
fi

# 서명 무결성
if ! JARSIGNER="$(jdk_tool jarsigner)"; then
  fail "jarsigner 를 찾지 못했다(JAVA_HOME 또는 Android Studio JBR)"
elif ! "$JARSIGNER" -verify "$AAB" 2>/dev/null | grep -q "jar verified"; then
  fail "jarsigner -verify 실패 — 서명이 깨졌거나 없다"
fi

# 운영 URL · cleartext · WebView 원격 디버깅
CFG="$(unzip -p "$AAB" base/assets/capacitor.config.json 2>/dev/null || true)"
if [[ -z "$CFG" ]]; then
  fail "base/assets/capacitor.config.json 이 없다"
elif ! printf '%s' "$CFG" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const c = JSON.parse(s);
    const srv = c.server || {};
    const and = c.android || {};
    const bad = [];
    if (srv.url !== process.argv[1]) bad.push(`server.url=${srv.url}`);
    if (srv.cleartext === true) bad.push("server.cleartext=true");
    if (and.webContentsDebuggingEnabled === true) bad.push("android.webContentsDebuggingEnabled=true");
    if (bad.length) { console.error(bad.join(" · ")); process.exit(1); }
  });
' "$PROD_URL"; then
  fail "capacitor.config.json 이 운영값이 아니다(server.url 은 $PROD_URL · cleartext/웹 디버깅 꺼짐이어야 한다)"
fi

if [[ -n "$FAILS" ]]; then
  printf '%s\n' "$FAILS" | sed '/^$/d' >&2
  exit 1
fi
echo "AAB CHECK OK sha1=$SHA1"
