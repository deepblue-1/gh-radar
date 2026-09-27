#!/usr/bin/env bash
# GH Trade 릴리스 APK 검사 (Phase 22 재범위 · D-13 · D-14 · T-22-04 · T-22-19 · T-22-22 · 재범위 부록 Pattern F5).
#
# 왜: Firebase App Distribution 으로 나간 APK 는 테스터 폰에 그대로 깔린다. 여기서 막지 않으면 테스터가
#     - 업로드 키가 아닌 키(debug 키 등)로 서명된 빌드를 받아 네이티브 Google 로그인이 깨지고
#       (GCP Android 클라이언트 = 업로드 SHA-1) 다음 빌드부터 덮어 설치도 안 되거나,
#     - debuggable 빌드 · 옛 빌드(up-to-date 건너뛰기로 남은 APK)를 받거나,
#     - dev URL(localhost)을 여는 빈 화면 · WebView 원격 디버깅이 켜진 빌드를 받는다.
#
# 서명은 apksigner 로만 본다 — minSdk 24 에서 AGP 는 v2 서명만 하므로 JDK 서명 도구로는 인증서가 보이지
# 않는다(check-aab.sh 의 방법을 복사하면 항상 실패하거나 검사가 무력화된다 · Pitfall F4).
#
# 사용: bash scripts/check-apk.sh [APK]
#   기본값 APK = android/app/build/outputs/apk/release/app-release.apk (mobile/ 기준 · ignore 대상)
#   필요 env: GHTRADE_UPLOAD_SHA1 (업로드 인증서 SHA-1 — 공개 지문 · 대소문자·콜론 무관 · release-android.sh 가 싣는다)
#   기대 versionCode: APK 와 같은 폴더의 ghtrade-version-code.txt (lane firebase 가 쓴다)
# 통과: 「APK CHECK OK sha1=… versionCode=…」 한 줄 · exit 0. 위반: 「APK CHECK FAIL — …」 줄들 · exit 1.
set -euo pipefail
# 인자 경로는 호출한 위치 기준이다 — mobile/ 로 옮기기 전에 절대 경로로 바꾼다.
APK_ARG="${1:-}"
if [[ -n "$APK_ARG" && "$APK_ARG" != /* ]]; then APK_ARG="$PWD/$APK_ARG"; fi
cd "$(dirname "$0")/.."

APK="${APK_ARG:-android/app/build/outputs/apk/release/app-release.apk}"
EXPECTED_SHA1="${GHTRADE_UPLOAD_SHA1:-}"
PKG="com.ghtrade.app"
MIN_SDK=24                          # android/variables.gradle minSdkVersion
PROD_URL="https://trade.jx1.io"     # verify-prod-config.mjs PROD_URL 과 같은 값

if [[ ! -f "$APK" ]]; then
  echo "APK CHECK FAIL — APK 가 없다: $APK" >&2
  exit 1
fi

FAILS=""
fail() { FAILS="$FAILS
APK CHECK FAIL — $1"; }

# 대소문자·콜론 차이를 없앤다(apksigner 표기 = 소문자·콜론 없음).
norm_sha1() { printf '%s' "$1" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]'; }

# build-tools(apksigner · aapt2)는 PATH 에 없다 — SDK 의 가장 높은 버전 폴더를 쓴다.
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BT="$(ls -d "$SDK"/build-tools/*/ 2>/dev/null | sed 's:/$::' | sort -V | tail -1 || true)"
APKSIGNER="${BT:+$BT/apksigner}"
AAPT2="${BT:+$BT/aapt2}"
# apksigner 는 java 가 필요하다 — JAVA_HOME 이 비면 Android Studio JBR 로 채운다.
if [[ -z "${JAVA_HOME:-}" && -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

# ── 서명: 무결성 · 서명자 정확히 1개 · 그 SHA-1 == 업로드 SHA-1 ─────────────
SHA1=""
if [[ -z "$APKSIGNER" || ! -x "$APKSIGNER" ]]; then
  fail "apksigner 를 찾지 못했다($SDK/build-tools/*)"
else
  if ! "$APKSIGNER" verify --min-sdk-version "$MIN_SDK" "$APK" >/dev/null 2>&1; then
    fail "apksigner verify 실패 — 서명이 없거나 깨졌다"
  fi
  CERTS="$("$APKSIGNER" verify --min-sdk-version "$MIN_SDK" --print-certs "$APK" 2>/dev/null || true)"
  n_signers="$(printf '%s\n' "$CERTS" | grep -cE '^Signer #[0-9]+ certificate SHA-1 digest:' || true)"
  if [[ "$n_signers" != "1" ]]; then
    fail "서명자가 정확히 1개가 아니다(${n_signers}개)"
  fi
  SHA1="$(printf '%s\n' "$CERTS" | awk -F': ' '/^Signer #[0-9]+ certificate SHA-1 digest:/{print $2; exit}')"
  SHA1="$(norm_sha1 "$SHA1")"
  if [[ -z "$EXPECTED_SHA1" ]]; then
    fail "GHTRADE_UPLOAD_SHA1 이 비어 있다 — android.env 확인(주입: ! bash mobile/scripts/setup-release-secrets.sh keystore)"
  elif [[ -z "$SHA1" ]]; then
    fail "서명 인증서 SHA-1 을 읽지 못했다 — 업로드 키로 서명되지 않았다"
  elif [[ "$SHA1" != "$(norm_sha1 "$EXPECTED_SHA1")" ]]; then
    fail "업로드 키로 서명되지 않았다 — 서명 SHA-1 $SHA1 ≠ 업로드 SHA-1 $(norm_sha1 "$EXPECTED_SHA1")"
  fi
fi

# ── 패키지 · versionCode · debuggable ────────────────────────────
VC_FILE="$(dirname "$APK")/ghtrade-version-code.txt"
WANT_VC=""
if [[ -f "$VC_FILE" ]]; then WANT_VC="$(tr -d '[:space:]' < "$VC_FILE")"; fi
GOT_VC=""
if [[ -z "$AAPT2" || ! -x "$AAPT2" ]]; then
  fail "aapt2 를 찾지 못했다($SDK/build-tools/*)"
else
  BADGING="$("$AAPT2" dump badging "$APK" 2>/dev/null || true)"
  PKG_LINE="$(printf '%s\n' "$BADGING" | grep -m1 '^package: ' || true)"
  got_pkg="$(printf '%s' "$PKG_LINE" | sed -nE "s/.* name='([^']*)'.*/\1/p")"
  GOT_VC="$(printf '%s' "$PKG_LINE" | sed -nE "s/.* versionCode='([^']*)'.*/\1/p")"
  if [[ "$got_pkg" != "$PKG" ]]; then
    fail "패키지가 $PKG 가 아니다(${got_pkg:-읽지 못함})"
  fi
  if [[ -z "$WANT_VC" ]]; then
    fail "기대 versionCode 파일이 없다: $VC_FILE — release-android.sh firebase 로 만든 APK 만 검사한다"
  elif [[ "$GOT_VC" != "$WANT_VC" ]]; then
    fail "versionCode ${GOT_VC:-읽지 못함} ≠ 이번 빌드 $WANT_VC — 옛 APK 이거나 다른 빌드다"
  fi
  if printf '%s\n' "$BADGING" | grep -q '^application-debuggable'; then
    fail "debuggable APK 다(application-debuggable) — 릴리스 빌드가 아니다"
  fi
fi

# ── 운영 URL · cleartext · WebView 원격 디버깅 ───────────────────
CFG="$(unzip -p "$APK" assets/capacitor.config.json 2>/dev/null || true)"
if [[ -z "$CFG" ]]; then
  fail "assets/capacitor.config.json 이 없다"
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
echo "APK CHECK OK sha1=$SHA1 versionCode=$GOT_VC"
