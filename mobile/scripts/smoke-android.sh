#!/usr/bin/env bash
# GH Trade Android 에뮬레이터 스모크 (Phase 21 · 21-02).
#
# dev sync(:3100) → assembleDebug → 설치·실행 → logcat 태그 GHTrade 에서 웹의 `ready` 도착 확인 →
# 종료 시(성공·실패 무관) 운영 URL 로 다시 sync(Pitfall 15 — dev URL·cleartext 가 생성 설정에 남지 않게).
#
# 전제: webapp dev 서버가 http://localhost:3100 에서 떠 있다(dev.sh 는 쓰지 않는다 —
#       `PORT=3100 pnpm --filter @gh-radar/webapp run dev`).
# 에뮬레이터의 localhost 는 에뮬레이터 자신이다 → `adb reverse` 로 호스트 :3100 에 잇는다(Pitfall 16).
# 연결된 기기가 없으면 AVD 를 띄우고, 이미 떠 있으면 그대로 쓴다(스크립트가 끄지 않는다).
# 환경변수: APP_ID (기본 com.ghtrade.app) · AVD (기본 Medium_Phone_API_36.1) · READY_TIMEOUT (기본 90초)
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="${APP_ID:-com.ghtrade.app}"
AVD="${AVD:-Medium_Phone_API_36.1}"
READY_TIMEOUT="${READY_TIMEOUT:-90}"
BOOT_TIMEOUT=180
APK="android/app/build/outputs/apk/debug/app-debug.apk"
SHOT="${TMPDIR:-/tmp}/gh-trade-android-smoke.png"
EXPECT="ready platform=android nativeApp=true"

if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="${ANDROID_HOME}/platform-tools:${PATH}"
fi

# (a) dev 서버 확인
if ! curl -sf -o /dev/null http://localhost:3100/login; then
  echo "webapp dev 서버(:3100)를 먼저 띄우세요 — PORT=3100 pnpm --filter @gh-radar/webapp run dev" >&2
  exit 2
fi

# (b) 종료 시 운영 URL 로 복원
restore_prod() {
  echo "── 운영 URL 로 다시 sync (Pitfall 15)"
  pnpm exec cap sync android >/dev/null 2>&1 || echo "⚠️ 운영 sync 복원 실패 — pnpm --filter @gh-radar/mobile run native:sync 를 직접 실행하세요" >&2
}
trap restore_prod EXIT

# (c) 기기/에뮬레이터 확보
if ! adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit !found }'; then
  echo "── 에뮬레이터 부팅: ${AVD}"
  "${ANDROID_HOME:?ANDROID_HOME 이 필요하다}/emulator/emulator" -avd "${AVD}" \
    -no-snapshot-save -no-audio -no-boot-anim >/dev/null 2>&1 &
fi
adb wait-for-device
waited=0
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  if [ "${waited}" -ge "${BOOT_TIMEOUT}" ]; then
    echo "SMOKE FAIL — ${BOOT_TIMEOUT}초 안에 에뮬레이터 부팅이 끝나지 않았다"
    exit 1
  fi
  sleep 3
  waited=$((waited + 3))
done

# (d) 에뮬레이터 localhost:3100 → 호스트 :3100 (Pitfall 16)
adb reverse tcp:3100 tcp:3100 >/dev/null

# (e) dev URL 로 sync · 빌드
echo "── dev sync (CAP_SERVER_URL=http://localhost:3100)"
CAP_SERVER_URL=http://localhost:3100 pnpm exec cap sync android
echo "── gradlew assembleDebug"
(cd android && ./gradlew assembleDebug -q)

# (f) 설치 · 실행
echo "── 설치·실행: ${APP_ID}"
adb install -r "${APK}" >/dev/null
adb logcat -c
adb shell am force-stop "${APP_ID}"
adb shell am start -n "${APP_ID}/.MainActivity" >/dev/null

# (g) ready 로그 대기
LOGS=""
FOUND=0
elapsed=0
while [ "${elapsed}" -lt "${READY_TIMEOUT}" ]; do
  sleep 3
  elapsed=$((elapsed + 3))
  LOGS="$(adb logcat -d -s GHTrade:I 2>/dev/null || true)"
  if printf '%s\n' "${LOGS}" | grep -q "${EXPECT}"; then
    FOUND=1
    break
  fi
done

# (h) 스크린샷
adb exec-out screencap -p > "${SHOT}" 2>/dev/null || true
echo "── 스크린샷: ${SHOT}"

# (i) 판정
if [ "${FOUND}" -eq 1 ]; then
  printf '%s\n' "${LOGS}" | grep "${EXPECT}" | tail -1
  echo "SMOKE OK ready platform=android"
  exit 0
fi
echo "── 최근 logcat 60줄"
adb logcat -d -t 60 2>/dev/null | tail -60 || true
echo "SMOKE FAIL — ${READY_TIMEOUT}초 안에 '${EXPECT}' 를 찾지 못했다"
exit 1
