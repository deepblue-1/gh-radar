#!/usr/bin/env bash
# iOS 시뮬레이터 빌드에 application-identifier 엔타이틀먼트가 들어갔는지 확인한다.
#
# 왜: GoogleSignIn(GTMAppAuth)은 로그인 결과를 키체인에 쓴다. 서명 없이
#     (`CODE_SIGNING_ALLOWED=NO`) 빌드한 앱은 엔타이틀먼트가 하나도 없어서 키체인 호출이
#     -34018 「Client has neither application-identifier nor keychain-access-groups
#     entitlements」로 실패하고, 웹에는 「로그인 처리에 실패」(auth_failed)만 보인다
#     (21-16 UAT 1차 iPhone 17). 서명 팀(DEVELOPMENT_TEAM)이 있는 자동 서명으로 빌드하면
#     Xcode 가 시뮬레이터용 엔타이틀먼트를 실행 파일의 `__TEXT,__entitlements` 섹션에 넣는다
#     (시뮬레이터는 코드 서명이 아니라 이 섹션을 읽는다 — 그래서 `codesign -d --entitlements`
#     에는 보이지 않는다).
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${1:-ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app/App}"
EXPECT="954QPCS3F5.com.ghtrade.app"

if [ ! -f "${BIN}" ]; then
  echo "SIM ENTITLEMENTS FAIL — 실행 파일이 없다: ${BIN}" >&2
  exit 1
fi

# `otool -V` 의 오른쪽 ASCII 열을 이어 붙이면 plist 원문이 된다(개행·탭은 점으로 보인다).
ENT="$(otool -arch arm64 -s __TEXT __entitlements -V "${BIN}" 2>/dev/null \
  | sed -n 's/^[^|]*|\(.*\)|$/\1/p' | tr -d '\n' || true)"
if printf '%s' "${ENT}" | grep -q "<key>application-identifier</key>..<string>${EXPECT}</string>"; then
  echo "SIM ENTITLEMENTS OK application-identifier=${EXPECT}"
  exit 0
fi

echo "SIM ENTITLEMENTS FAIL — ${BIN} 에 application-identifier(${EXPECT})가 없다." >&2
echo "  CODE_SIGNING_ALLOWED=NO 로 빌드했거나 DEVELOPMENT_TEAM 이 빠졌다. 이대로면 Google 로그인이 키체인(-34018)에서 실패한다." >&2
exit 1
