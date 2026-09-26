#!/usr/bin/env bash
# iOS ExternalLinks 판정표 검사 (D-28 · G-21-N3) — Xcode 테스트 타깃 없이 swiftc 로 컴파일·실행한다.
# 표는 Android ExternalLinksTest(21-17)와 같은 정본 26케이스 + isSameAppHost 표.
# 성공 시 마지막 줄 「EXTERNAL LINKS OK <n>」, 실패 시 「FAIL …」 줄과 exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp scripts/external-links-check.swift "$TMP/main.swift"
xcrun swiftc -o "$TMP/check" ios/App/App/ExternalLinks.swift "$TMP/main.swift"
"$TMP/check"
