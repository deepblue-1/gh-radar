#!/usr/bin/env bash
# GH Trade iOS 시뮬레이터 스모크 (Phase 21 트레이서).
#
# dev sync(:3100) → 시뮬레이터 빌드 → 설치·실행 → 통합 로그에서 웹의 `ready` 도착 확인 →
# 종료 시(성공·실패 무관) 운영 URL 로 다시 sync(Pitfall 15 — dev URL 이 생성 설정에 남지 않게).
#
# 전제: webapp dev 서버가 http://localhost:3100 에서 떠 있다(dev.sh 는 쓰지 않는다 —
#       `PORT=3100 pnpm --filter @gh-radar/webapp run dev`).
# 환경변수: DEVICE (기본 "iPhone 17") · IOS_DEVICE_UDID (지정 시 DEVICE 보다 우선) · READY_TIMEOUT (기본 60초)
# 기기는 UDID 로 명시한다(IN-08) — `booted` 별칭은 다른 시뮬레이터가 부팅돼 있으면 엉뚱한 기기에 설치한다.
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

# (a2) 대상 시뮬레이터 UDID — IOS_DEVICE_UDID, 없으면 이름이 DEVICE 인 기기(부팅된 것 우선 · 없으면 첫 기기)
UDID="${IOS_DEVICE_UDID:-}"
if [ -z "${UDID}" ]; then
  UDID="$(xcrun simctl list devices available -j | DEVICE="${DEVICE}" node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    const all = Object.values(d).flat().filter((x) => x.name === process.env.DEVICE);
    const pick = all.find((x) => x.state === "Booted") || all[0];
    if (pick) process.stdout.write(pick.udid);
  ')"
  if [ -z "${UDID}" ]; then
    echo "SMOKE FAIL — 시뮬레이터 \"${DEVICE}\" 없음 (xcrun simctl list devices available 확인 · DEVICE 또는 IOS_DEVICE_UDID 지정)"
    exit 1
  fi
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

# (d) 시뮬레이터 빌드 — 서명한다(로컬 실행용 ad-hoc). CODE_SIGNING_ALLOWED=NO 로 빌드하면
#     엔타이틀먼트가 없어 Google 로그인이 키체인 -34018 로 실패한다(21-16 UAT 1차).
echo "── xcodebuild (Debug · iOS Simulator · 서명)"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/DerivedData \
  build -quiet
bash scripts/check-sim-entitlements.sh "${APP_PATH}/App"

# (e) 부팅 · 설치 · 실행
echo "── 시뮬레이터: ${DEVICE} (${UDID})"
xcrun simctl boot "${UDID}" 2>/dev/null || true   # 이미 부팅돼 있으면 통과
xcrun simctl bootstatus "${UDID}" -b >/dev/null
xcrun simctl install "${UDID}" "${APP_PATH}"
START="$(date '+%Y-%m-%d %H:%M:%S')"
xcrun simctl terminate "${UDID}" "${APP_ID}" >/dev/null 2>&1 || true
xcrun simctl launch "${UDID}" "${APP_ID}"

# (f) ready 로그 대기
LOGS=""
FOUND=0
elapsed=0
while [ "${elapsed}" -lt "${READY_TIMEOUT}" ]; do
  sleep 3
  elapsed=$((elapsed + 3))
  LOGS="$(xcrun simctl spawn "${UDID}" log show --style compact --start "${START}" \
    --predicate 'subsystem == "com.ghtrade.app"' 2>/dev/null || true)"
  if printf '%s\n' "${LOGS}" | grep -q "${EXPECT}"; then
    FOUND=1
    break
  fi
done

# (g) 스크린샷
xcrun simctl io "${UDID}" screenshot "${SHOT}" >/dev/null 2>&1 || true
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
