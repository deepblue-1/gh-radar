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
#   - 빌드 번호는 KST 분 단위 타임스탬프다(iOS YYYYMMDDHHMM · Android (연도−2020)·10^8+MMDDHHmm).
#     직전 번호보다 작아지면(시계·시간대 역행) 시작하지 않는다.
#     직전 릴리스와 같은 분이면 스토어가 거절하므로, 같으면 다음 분까지 기다린 뒤 시작한다.
#   - 비밀은 각 플랫폼 래퍼(release-ios.sh · release-android.sh)가 다룬다. 이 스크립트는 값을 읽지 않는다.
#     비밀 파일이 없으면 래퍼가 exit 3 과 주입 명령(`! bash mobile/scripts/setup-release-secrets.sh …`)을 낸다.
#   - 전체 출력은 저장소 밖 $OUT_ROOT/logs/(폴더 700)에 파일마다 600 으로만 남는다. 화면에는 표식 줄
#     (PROD CONFIG OK · … CHECK OK · 업로드 성공 · 오류 줄)만 나오고 URL 은 가린다 — Claude 가 실행해도
#     Firebase 1시간 다운로드 링크가 대화에 남지 않는다(T-22-23). 실패하면 오류 요약과 로그 경로가 나온다.
#   - 한 플랫폼이 실패하면 거기서 멈춘다(exit 1). 이미 올라간 플랫폼은 되돌리지 않는다.
# ═══════════════════════════════════════════════════════════════

TARGET="${1:-all}"
case "$TARGET" in
  all|ios|android) ;;
  -h|--help)
    sed -n '4,/^# ═══/p' "$0"   # 헤더 끝 표식까지(줄 수가 바뀌어도 잘리지 않는다)
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
chmod 700 "$LOG_DIR" # 이미 있던 폴더도 고친다 — 로그에 서명 다운로드 링크가 있다(T-22-23)
STAMP="$(date +%Y%m%d-%H%M%S)"

IOS_RESULT="건너뜀"
ANDROID_RESULT="건너뜀"

say() { printf '\n▶ %s\n' "$*"; }

# ── 화면 요약 · 로그(W-1 · T-22-23) ─────────────────────────────
# 화면 허용 표식 — 여기 맞는 줄만 화면에 낸다. 「🔗 …」 URL 세 줄(Firebase 콘솔 · 공유 · 1시간 다운로드)은 넣지 않는다.
#   PROD CONFIG OK · 줄머리 FAIL     verify-prod-config.mjs
#   (IPA|APK|AAB) CHECK (OK|FAIL)   check-ipa.sh · check-apk.sh · check-aab.sh
#   CFBundleVersion · versionCode    iOS · Android lane 의 번호 줄
#   Successfully uploaded …          pilot(TestFlight) 성공 줄
#   Authenticating with · Distributing release · App Distribution upload finished successfully
#                                    firebase_app_distribution 1.0.0 (Authenticating 은 README 의 ADC 판별 줄)
#   fastlane.tools finished successfully · fastlane finished with errors · [!]   fastlane 끝 줄 · user_error 요약
#   줄머리 ERROR: · 주입: · 복구:     래퍼 exit 3 안내(release-ios.sh · release-android.sh)
#   ELIFECYCLE · ** … FAILED ** · BUILD FAILED   pnpm · xcodebuild · gradle 실패
SCREEN_MARKS='PROD CONFIG OK|^FAIL|(IPA|APK|AAB) CHECK (OK|FAIL)|CFBundleVersion [0-9]+|versionCode [0-9]+|Successfully uploaded the new binary to App Store Connect|Authenticating with|Distributing release|App Distribution upload finished successfully|fastlane[.]tools finished successfully|fastlane finished with errors|\[!\]|^ERROR:|주입:|복구:|ELIFECYCLE|\*\* .*FAILED \*\*|BUILD FAILED'
# 실패 요약에 뽑을 오류 줄.
ERROR_MARKS='FAIL|ERROR|\[!\]|error:|Error:|ELIFECYCLE|FAILED|Exception|exit code|exit status'
ESC="$(printf '\033')"

# 로그 파일을 600 으로 만든다. umask 는 서브셸 안에서만 건다 — 전역 umask 는 cap sync · 빌드 산출물 권한까지 바꾼다.
new_log() { ( umask 077; : > "$1" ); chmod 600 "$1"; }

# 화면에 낼 줄 다듬기: ANSI 색 제거 → 스킴이 붙은 URL 가림(두 번째 방어선) → 4칸 들여쓰기.
# LC_ALL=C — 바이트 단위로 처리해 이모지·잘린 UTF-8 에서도 sed 가 멈추지 않게 한다.
mask_lines() {
  LC_ALL=C sed -e "s/${ESC}\[[0-9;]*[A-Za-z]//g" \
    -e 's#[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]*#(URL 생략 — 로그)#g' \
    -e 's/^/    /'
}

# stdin 전체를 로그($1)에 쓰고, 화면에는 표식 줄만 낸다. 입력을 끝까지 비우고 항상 0 을 돌려준다 —
# 중간에 끝나면 앞의 pnpm/fastlane 이 SIGPIPE 로 죽어 업로드가 도중에 끊긴다. 종료 코드는 pipefail 로 pnpm 것이 남는다.
screen_filter() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s\n' "$line" >&3 || true
    if [[ $line =~ $SCREEN_MARKS ]]; then
      printf '%s\n' "$line" | mask_lines || true
    fi
  done 3>>"$1"
  return 0
}

# 실패 시 로그($1)의 오류 줄 마지막 20줄 + 로그 경로.
fail_summary() {
  local log="$1" hits
  hits="$( { LC_ALL=C grep -aE "$ERROR_MARKS" "$log" || true; } | tail -20 )"
  printf '    ── 오류 요약 (로그의 오류 줄 마지막 20줄) ──\n'
  if [[ -n "$hits" ]]; then
    printf '%s\n' "$hits" | mask_lines
  else
    printf '    (오류 줄을 찾지 못했다 — 전체 로그를 본다)\n'
  fi
  printf '    전체 로그: %s (600 · 저장소 밖)\n' "$log"
}

# 이번 분의 빌드 번호(build_numbers.rb 와 같은 공식 · KST 고정 — 22-REVIEW WR-03).
# 머신 시간대를 따르면 Mac 시간대가 서쪽으로 바뀔 때 번호가 역행한다. date 는 한 번만 불러 분 경계 경합을 피한다.
kst_minute() { TZ=Asia/Seoul date +%Y%m%d%H%M; }
ios_num_now() { kst_minute; }
android_vc_now() {
  local m
  m="$(kst_minute)"
  echo $(( (10#${m:0:4} - 2020) * 100000000 + 10#${m:4:8} ))
}

# 직전 번호와 이번 분 번호가 같으면 다음 분 0초 + 2초까지 기다린다.
# 이번 번호가 직전보다 작으면(시계·시간대 역행) 스토어가 거절할 빌드이므로 시작하지 않는다(return 1).
wait_new_minute() {
  local label="$1" last_file="$2" now_fn="$3" last now secs
  [[ -f "$last_file" ]] || return 0
  last="$(tr -d '[:space:]' < "$last_file")"
  [[ "$last" =~ ^[0-9]+$ ]] || return 0
  now="$($now_fn)"
  if (( 10#$now < 10#$last )); then
    say "$label 이번 번호($now)가 직전 빌드($last)보다 작다 — 시계·시간대 역행. 스토어가 거절하므로 시작하지 않는다"
    return 1
  fi
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
  local log="$LOG_DIR/ios-$STAMP.log" num state line seen num_file
  num_file="$(ios_num_file)"
  if [[ -n "$num_file" ]] && ! wait_new_minute "iOS" "$num_file" ios_num_now; then
    IOS_RESULT="시작 안 함 — 빌드 번호 역행(시계·시간대 확인)"
    return 1
  fi
  new_log "$log"
  say "iOS — TestFlight 업로드 (로그: $log)"
  if ! pnpm run native:release:ios 2>&1 | screen_filter "$log"; then
    fail_summary "$log"
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
  # 판정은 모두 이번 번호($num)에 묶는다(22-REVIEW WR-02). 이전 빌드가 아직 최신으로 보이는 동안
  # 그 빌드의 INVALID 를 이번 빌드 실패로 오판하지 않는다. seen = 이번 번호로 마지막에 본 상태.
  state="UNKNOWN"
  seen=""
  for _ in $(seq 1 30); do
    line="$(bash scripts/release-ios.sh latest 2>&1 | grep -oE 'latest TestFlight build [0-9]+ state [A-Z_]+' | tail -1 || true)"
    [[ -n "$line" ]] && echo "    $line"
    case "$line" in
      "latest TestFlight build $num state VALID") state="VALID"; break ;;
      "latest TestFlight build $num state INVALID"|"latest TestFlight build $num state FAILED") state="${line##* }"; break ;;
      "latest TestFlight build $num state "*) seen="${line##* }" ;;
    esac
    sleep 30
  done
  case "$state" in
    VALID) IOS_RESULT="완료 — 빌드 $num · TestFlight VALID(내부 그룹 자동 배포)" ;;
    INVALID|FAILED) IOS_RESULT="업로드됨 — 빌드 $num · 처리 $state (App Store Connect 메일 확인)"; return 1 ;;
    *)
      if [[ "$seen" == "PROCESSING" ]]; then
        # 처리 중인 건 확인했다 — 느린 것뿐이다. 다음 플랫폼으로 넘어간다.
        IOS_RESULT="업로드됨 — 빌드 $num · 15분 안에 VALID 확인 못 함 · 아직 PROCESSING(나중에 release-ios.sh latest)"
      else
        # 15분 동안 이번 번호의 처리 기록(Build)이 안 보였다 — 처리 단계 실패일 수 있어 멈춘다.
        IOS_RESULT="업로드됨 — 빌드 $num · 15분 동안 처리 기록 없음(${seen:-최신이 이전 빌드} · App Store Connect 메일 확인)"
        return 1
      fi
      ;;
  esac
}

release_android() {
  local log="$LOG_DIR/android-$STAMP.log" vc latest
  if ! wait_new_minute "Android" "$ANDROID_VC_FILE" android_vc_now; then
    ANDROID_RESULT="시작 안 함 — versionCode 역행(시계·시간대 확인)"
    return 1
  fi
  new_log "$log"
  say "Android — APK → Firebase App Distribution (로그: $log)"
  if ! pnpm run native:release:android 2>&1 | screen_filter "$log"; then
    fail_summary "$log"
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
