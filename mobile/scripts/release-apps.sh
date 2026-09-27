#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# release-apps.sh — GH Trade 앱 릴리스 한 번에 (iOS TestFlight → Android Firebase App Distribution)
#
# 사용:
#   pnpm --filter @gh-radar/mobile run native:release            (= all)
#   bash mobile/scripts/release-apps.sh [all|ios|android]        (기본 all)
#
# 하는 일(플랫폼마다 순서대로, 동시에 돌리지 않는다 — 두 명령이 cap sync 로 같은 생성 파일을 쓴다 · FA-5):
#   iOS      native:release:ios → TestFlight 처리 상태를 VALID 가 될 때까지 확인(최대 15분)
#   Android  native:release:android → Firebase 최신 릴리스 번호가 방금 올린 번호인지 대조
#   끝에 플랫폼별 결과·빌드 번호를 한 표로 출력한다.
#
# 언제 쓰나: 네이티브 셸이 바뀌었을 때만(탭바 · 아이콘 · 권한 · 플러그인 · Capacitor 설정).
#   웹 화면·기능 변경은 git push(= Vercel 배포)만으로 두 앱에 반영된다 — 앱이 운영 웹을 불러온다.
#
# 규약
#   - 빌드 번호는 분 단위 타임스탬프다(iOS YYYYMMDDHHMM · Android (연도−2020)·10^8+MMDDHHmm).
#     직전 릴리스와 같은 분이면 스토어가 거절하므로, 같으면 다음 분까지 기다린 뒤 시작한다.
#   - 비밀은 각 플랫폼 래퍼(release-ios.sh · release-android.sh)가 다룬다. 이 스크립트는 값을 읽지 않는다.
#     비밀 파일이 없으면 래퍼가 exit 3 과 주입 명령(`! bash mobile/scripts/setup-release-secrets.sh …`)을 낸다.
#   - 로그는 저장소 밖 $OUT_ROOT/logs/ 에 남는다(다운로드 링크가 찍힐 수 있어 저장소에 두지 않는다).
#   - 한 플랫폼이 실패하면 거기서 멈춘다(exit 1). 이미 올라간 플랫폼은 되돌리지 않는다.
# ═══════════════════════════════════════════════════════════════

TARGET="${1:-all}"
case "$TARGET" in
  all|ios|android) ;;
  -h|--help)
    sed -n '4,24p' "$0"
    exit 0
    ;;
  *)
    echo "사용: bash mobile/scripts/release-apps.sh [all|ios|android]" >&2
    exit 2
    ;;
esac

MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MOBILE_DIR"

OUT_ROOT="$HOME/Library/Developer/gh-trade-release"
ANDROID_VC_FILE="$MOBILE_DIR/android/app/build/outputs/apk/release/ghtrade-version-code.txt"
LOG_DIR="$OUT_ROOT/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

IOS_RESULT="건너뜀"
ANDROID_RESULT="건너뜀"

say() { printf '\n▶ %s\n' "$*"; }

# 이번 분의 빌드 번호(build_numbers.rb 와 같은 공식 · 로컬 시각).
ios_num_now() { date +%Y%m%d%H%M; }
android_vc_now() { echo $(( ($(date +%Y) - 2020) * 100000000 + 10#$(date +%m%d%H%M) )); }

# 직전 번호와 이번 분 번호가 같으면 다음 분 0초 + 2초까지 기다린다.
wait_new_minute() {
  local label="$1" last_file="$2" now_fn="$3" last now secs
  [[ -f "$last_file" ]] || return 0
  last="$(tr -d '[:space:]' < "$last_file")"
  now="$($now_fn)"
  if [[ "$last" == "$now" ]]; then
    secs=$(( 62 - 10#$(date +%S) ))
    say "$label 직전 빌드($last)와 같은 분이다 — ${secs}초 기다린다"
    sleep "$secs"
  fi
}

# mobile/ 에 커밋 안 된 변경이 있으면 알린다(릴리스 빌드는 작업 트리 그대로를 굽는다). 멈추지는 않는다.
if [[ -n "$(git -C "$MOBILE_DIR" status --porcelain -- . 2>/dev/null)" ]]; then
  say "주의: mobile/ 에 커밋되지 않은 변경이 있다 — 작업 트리 그대로 빌드된다"
  git -C "$MOBILE_DIR" status --short -- . | sed 's/^/    /'
fi

# lane 이 build_number.txt 를 쓰는 곳(ios.env 의 GHTRADE_RELEASE_OUT)을 래퍼에게 묻는다 — 경로를
# 여기서 하드코딩하면 env 를 바꿨을 때 옛 파일·없는 파일을 본다(22-REVIEW WR-01). env 가 없으면
# 빈 값 — 같은 분 대기는 건너뛰고, 곧 이어질 native:release:ios 가 exit 3 과 주입 명령을 낸다.
ios_num_file() {
  local dir
  dir="$(bash scripts/release-ios.sh out-dir 2>/dev/null || true)"
  [[ -n "$dir" ]] && printf '%s/build_number.txt' "$dir"
  return 0
}

release_ios() {
  local log="$LOG_DIR/ios-$STAMP.log" num state line num_file
  num_file="$(ios_num_file)"
  if [[ -n "$num_file" ]]; then wait_new_minute "iOS" "$num_file" ios_num_now; fi
  say "iOS — TestFlight 업로드 (로그: $log)"
  if ! pnpm run native:release:ios 2>&1 | tee "$log"; then
    IOS_RESULT="실패 — 로그 확인"
    return 1
  fi
  # 이번 빌드 번호는 이번 로그에서만 읽는다 — lane 이 찍는 「CFBundleVersion N」 줄(WR-01).
  # 파일에서 읽으면 경로가 어긋날 때 직전 릴리스 번호로 폴링해 거짓 「완료」 가 날 수 있다.
  num="$(grep -oE 'CFBundleVersion [0-9]{12}' "$log" | tail -1 | awk '{print $2}' || true)"
  if [[ -z "$num" ]]; then
    IOS_RESULT="업로드됨 — 빌드 번호를 로그에서 못 찾음(release-ios.sh latest 로 확인 · 로그 $log)"
    return 1
  fi
  say "iOS — 빌드 $num 처리 상태 확인(최대 15분, 30초 간격)"
  state="UNKNOWN"
  for _ in $(seq 1 30); do
    line="$(bash scripts/release-ios.sh latest 2>&1 | grep -oE 'latest TestFlight build [0-9]+ state [A-Z_]+' | tail -1 || true)"
    [[ -n "$line" ]] && echo "    $line"
    if [[ "$line" == "latest TestFlight build $num state VALID" ]]; then state="VALID"; break; fi
    if [[ "$line" == *"state INVALID"* || "$line" == *"state FAILED"* ]]; then state="${line##* }"; break; fi
    sleep 30
  done
  case "$state" in
    VALID) IOS_RESULT="완료 — 빌드 $num · TestFlight VALID(내부 그룹 자동 배포)" ;;
    INVALID|FAILED) IOS_RESULT="업로드됨 — 빌드 $num · 처리 $state (App Store Connect 메일 확인)"; return 1 ;;
    *) IOS_RESULT="업로드됨 — 빌드 $num · 15분 안에 VALID 확인 못 함(나중에 release-ios.sh latest)" ;;
  esac
}

release_android() {
  local log="$LOG_DIR/android-$STAMP.log" vc latest
  wait_new_minute "Android" "$ANDROID_VC_FILE" android_vc_now
  say "Android — APK → Firebase App Distribution (로그: $log)"
  if ! pnpm run native:release:android 2>&1 | tee "$log"; then
    ANDROID_RESULT="실패 — 로그 확인"
    return 1
  fi
  vc="$(tr -d '[:space:]' < "$ANDROID_VC_FILE")"
  latest="$(bash scripts/release-android.sh firebase-latest 2>&1 | grep -oE 'latest Firebase build [0-9]+' | tail -1 || true)"
  echo "    $latest"
  if [[ "$latest" == "latest Firebase build $vc" ]]; then
    ANDROID_RESULT="완료 — versionCode $vc · Firebase 그룹 ghtrade-testers 에 알림"
  else
    ANDROID_RESULT="업로드됨 — versionCode $vc · Firebase 최신 번호 대조 실패(${latest:-응답 없음})"
    return 1
  fi
}

STATUS=0
if [[ "$TARGET" == "all" || "$TARGET" == "ios" ]]; then
  release_ios || STATUS=1
fi
if [[ $STATUS -eq 0 && ( "$TARGET" == "all" || "$TARGET" == "android" ) ]]; then
  release_android || STATUS=1
fi

printf '\n═══ GH Trade 앱 릴리스 결과 (%s) ═══\n' "$STAMP"
printf '  iOS      %s\n' "$IOS_RESULT"
printf '  Android  %s\n' "$ANDROID_RESULT"
exit "$STATUS"
