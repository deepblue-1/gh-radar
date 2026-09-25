#!/usr/bin/env bash
# iOS TabRoutes 경로표 검사 (D-14 · D-12 ①) — Xcode 테스트 타깃 없이 swiftc 로 컴파일·실행한다.
# 성공 시 마지막 줄 「TAB ROUTES OK <n>」, 실패 시 「FAIL …」 줄과 exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp scripts/tab-routes-check.swift "$TMP/main.swift"
xcrun swiftc -o "$TMP/check" ios/App/App/TabRoutes.swift "$TMP/main.swift"
"$TMP/check"
