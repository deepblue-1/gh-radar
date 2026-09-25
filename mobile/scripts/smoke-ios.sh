#!/usr/bin/env bash
# GH Trade iOS 시뮬레이터 스모크 (Phase 21 트레이서).
#
# dev sync(:3100) → 시뮬레이터 빌드 → 설치·실행 → 통합 로그에서 웹의 `ready` 도착 확인 →
# 종료 시(성공·실패 무관) 운영 URL 로 다시 sync(Pitfall 15 — dev URL 이 생성 설정에 남지 않게).
#
# 전제: webapp dev 서버가 http://localhost:3100 에서 떠 있다(dev.sh 는 쓰지 않는다 —
#       `PORT=3100 pnpm --filter @gh-radar/webapp run dev`).
# 환경변수: DEVICE (기본 "iPhone 17") · READY_TIMEOUT (기본 60초)
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="com.ghtrade.app"
DEVICE="${DEVICE:-iPhone 17}"
READY_TIMEOUT="${READY_TIMEOUT:-60}"
APP_PATH="ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app"
SHOT="${TMPDIR:-/tmp}/gh-trade-ios-smoke.png"
EXPECT="ready platform=ios nativeApp=true"

# (a) dev 서버 확인
if ! curl -sf -o /dev/null http://localhost:3100/login; then
  echo "webapp dev 서버(:3100)를 먼저 띄우세요 — PORT=3100 pnpm --filter @gh-radar/webapp run dev" >&2
  exit 2
fi

# (b) 종료 시 운영 URL 로 복원
restore_prod() {
  echo "── 운영 URL 로 다시 sync (Pitfall 15)"
  pnpm exec cap sync ios >/dev/null 2>&1 || echo "⚠️ 운영 sync 복원 실패 — pnpm --filter @gh-radar/mobile run native:sync 를 직접 실행하세요" >&2
}
trap restore_prod EXIT

# (c) dev URL 로 sync
echo "── dev sync (CAP_SERVER_URL=http://localhost:3100)"
CAP_SERVER_URL=http://localhost:3100 pnpm exec cap sync ios

# (d) 시뮬레이터 빌드
echo "── xcodebuild (Debug · iOS Simulator)"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/DerivedData \
  CODE_SIGNING_ALLOWED=NO build -quiet

# (e) 부팅 · 설치 · 실행
echo "── 시뮬레이터: ${DEVICE}"
xcrun simctl boot "${DEVICE}" 2>/dev/null || true   # 이미 부팅돼 있으면 통과
xcrun simctl bootstatus "${DEVICE}" -b >/dev/null
xcrun simctl install booted "${APP_PATH}"
START="$(date '+%Y-%m-%d %H:%M:%S')"
xcrun simctl terminate booted "${APP_ID}" >/dev/null 2>&1 || true
xcrun simctl launch booted "${APP_ID}"

# (f) ready 로그 대기
LOGS=""
FOUND=0
elapsed=0
while [ "${elapsed}" -lt "${READY_TIMEOUT}" ]; do
  sleep 3
  elapsed=$((elapsed + 3))
  LOGS="$(xcrun simctl spawn booted log show --style compact --start "${START}" \
    --predicate 'subsystem == "com.ghtrade.app"' 2>/dev/null || true)"
  if printf '%s\n' "${LOGS}" | grep -q "${EXPECT}"; then
    FOUND=1
    break
  fi
done

# (g) 스크린샷
xcrun simctl io booted screenshot "${SHOT}" >/dev/null 2>&1 || true
echo "── 스크린샷: ${SHOT}"

# (h) 판정
if [ "${FOUND}" -eq 1 ]; then
  printf '%s\n' "${LOGS}" | grep "${EXPECT}" | tail -1
  echo "SMOKE OK ready platform=ios"
  exit 0
fi
echo "── 최근 로그 30줄 (subsystem com.ghtrade.app)"
printf '%s\n' "${LOGS}" | tail -30
echo "SMOKE FAIL — ${READY_TIMEOUT}초 안에 '${EXPECT}' 를 찾지 못했다"
exit 1
