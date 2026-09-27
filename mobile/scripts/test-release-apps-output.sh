#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# test-release-apps-output.sh — release-apps.sh 화면 요약 회귀 검사 (Phase 22 W-1 · T-22-23 · quick 260927-s4j)
#
# 왜: native:release 는 Claude 가 실행하기도 한다. fastlane 전체 출력이 화면에 나오면 Firebase
#     「link expires in 1 hour」 서명 다운로드 링크와 콘솔/공유 URL 이 대화 기록에 남는다(되돌릴 수 없다).
#     release-apps.sh 는 화면에 표식 줄만(URL 가림) 내고, 전체 출력은 700 폴더 · 600 파일 로그에만 써야 한다.
#
# 오프라인 보장: 업로드 · 네트워크 · 비밀 열람이 없다.
#   - PATH 맨 앞의 가짜 pnpm 이 URL 세 줄 · 표식 줄 · 잡음 줄을 찍는다(실제 릴리스 명령 없음).
#   - 경우마다 가짜 HOME 을 쓴다(로그는 그 아래에만 생긴다).
#   - GHTRADE_RELEASE_ENV 는 없는 파일을 가리킨다 → release-ios.sh latest · release-android.sh firebase-latest 는
#     env 파일 없음(exit 3)으로 fastlane 전에 멈춘다. 자격 env 는 unset 한다.
#   - bundle · fastlane · gcloud · firebase 트립와이어가 불리면 실패한다.
# 한계: iOS 성공 경로는 다루지 않는다 — VALID 폴링(최대 15분 · 30초 간격) 때문이다.
#
# 사용: bash mobile/scripts/test-release-apps-output.sh      (/bin/bash 로 돌리면 3.2 호환도 함께 검사된다)
# 통과: 마지막 줄 「RELEASE APPS OUTPUT TEST OK」 · exit 0. 실패: 「RELEASE APPS OUTPUT TEST FAIL — …」 · exit 1.
# ═══════════════════════════════════════════════════════════════

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HERE/release-apps.sh"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
BIN="$T/bin"
mkdir -p "$BIN"

die() { echo "RELEASE APPS OUTPUT TEST FAIL — $*"; exit 1; }

# ── 안전 장치 ────────────────────────────────────────────────────
export STUB_CALLS="$T/pnpm-calls"
export STUB_TRIP="$T/tripwire"
export PATH="$BIN:$PATH"
export GHTRADE_RELEASE_ENV="$T/no-such-release.env"
unset GHTRADE_RELEASE_DIR FIREBASE_APPDISTRO_SA_JSON GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN

# 가짜 pnpm — 받은 인자를 기록하고, 플러그인 형식 그대로 URL 세 줄 + 표식 + 잡음을 찍는다.
cat > "$BIN/pnpm" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$STUB_CALLS"
echo "> @gh-radar/mobile@0.0.0 $2 /stub"
echo "PROD CONFIG OK — https://trade.jx1.io · stub"
echo "> Task :app:packageRelease"
echo "STUB-NOISE-LINE-q7"
echo "[12:00:00]: versionCode 609271200"
echo "APK CHECK OK sha1=AA:BB:CC versionCode=609271200"
echo "[12:00:01]: 🔐 Authenticating with --service_credentials_file /stub/sa.json"
echo "[12:00:02]: 📦 Distributing release."
printf '[12:00:03]: \033[32m🎉 App Distribution upload finished successfully. Setting release notes.\033[0m\n'
echo "[12:00:03]: 🔗 View this release in the Firebase console: https://console.firebase.google.com/project/p/appdistribution/app/a/releases/STUBTOKCONSOLE1"
echo "[12:00:03]: 🔗 Share this release with testers who have access: https://appdistribution.firebase.google.com/testerapps/a/releases/STUBTOKSHARE2" >&2
echo "[12:00:03]: 🔗 Download the release binary (link expires in 1 hour): https://firebaseappdistribution.googleapis.com/app-binary-downloads/x.apk?token=STUBTOKSIGNED3&Expires=1" >&2
if [ "${STUB_PNPM_EXIT:-0}" != 0 ]; then
  echo "[!] upload failed — see https://example.invalid/STUBTOKERR4" >&2
  echo " ELIFECYCLE  Command failed with exit code $STUB_PNPM_EXIT." >&2
  exit "$STUB_PNPM_EXIT"
fi
# 마지막 줄은 개행 없이 끝낸다 — 필터가 그래도 처리해야 한다.
printf '[12:00:04]: fastlane.tools finished successfully 🎉'
exit 0
STUB
chmod +x "$BIN/pnpm"

for t in bundle fastlane gcloud firebase; do
  printf '#!/bin/sh\necho "%s $*" >> "$STUB_TRIP"\nexit 97\n' "$t" > "$BIN/$t"
  chmod +x "$BIN/$t"
done

[[ "$(command -v pnpm)" == "$BIN/pnpm" ]] || die "pnpm 이 가짜로 해석되지 않는다: $(command -v pnpm)"
[[ ! -e "$GHTRADE_RELEASE_ENV" ]] || die "GHTRADE_RELEASE_ENV 가 실제 파일을 가리킨다"

# ── 실행 도우미 ──────────────────────────────────────────────────
RC=0
run_case() { # $1 경우 이름 · $2 가짜 pnpm 종료 코드 · 나머지 = release-apps.sh 인자
  local name="$1" code="$2"
  shift 2
  mkdir -p "$T/home-$name"
  set +e
  HOME="$T/home-$name" STUB_PNPM_EXIT="$code" "$BASH" "$TARGET" "$@" > "$T/$name.out" 2>&1
  RC=$?
  set -e
}
out_has() { grep -qF -- "$2" "$T/$1.out" || die "경우 $1 화면에 「$2」 가 없다"; }
out_lacks() { if grep -qF -- "$2" "$T/$1.out"; then die "경우 $1 화면에 「$2」 가 있다"; fi; }
log_of() { # $1 경우 · $2 플랫폼
  local f
  for f in "$T/home-$1/Library/Developer/gh-trade-release/logs/$2"-*.log; do
    if [[ -f "$f" ]]; then echo "$f"; return 0; fi
  done
  die "경우 $1 의 $2 로그가 없다"
}
ESC="$(printf '\033')"

# ── 경우 A: android · pnpm 성공 ──────────────────────────────────
run_case A 0 android
[[ $RC -eq 1 ]] || die "경우 A 종료 코드 $RC (기대 1 — 가짜 환경이라 Firebase 번호 대조 실패)"
out_lacks A "://"
out_lacks A "STUBTOKCONSOLE1"
out_lacks A "STUBTOKSHARE2"
out_lacks A "STUBTOKSIGNED3"
out_lacks A "STUB-NOISE-LINE-q7"
out_lacks A "Task :app:packageRelease"
out_lacks A "$ESC"
out_has A "PROD CONFIG OK"
out_has A "(URL 생략 — 로그)"
out_has A "versionCode 609271200"
out_has A "APK CHECK OK"
out_has A "Authenticating with"
out_has A "App Distribution upload finished successfully"
out_has A "fastlane.tools finished successfully"
out_has A "Android  업로드됨 — versionCode"
LOG_A="$(log_of A android)"
grep -qF "STUBTOKSIGNED3" "$LOG_A" || die "경우 A 로그에 서명 링크 원문이 없다"
grep -qF "STUB-NOISE-LINE-q7" "$LOG_A" || die "경우 A 로그에 잡음 줄 원문이 없다"
grep -qF "fastlane.tools finished successfully" "$LOG_A" || die "경우 A 로그에 개행 없는 마지막 줄이 없다"
[[ "$(stat -f '%Lp' "$LOG_A")" == "600" ]] || die "경우 A 로그 파일 권한 $(stat -f '%Lp' "$LOG_A") (기대 600)"
[[ "$(stat -f '%Lp' "$(dirname "$LOG_A")")" == "700" ]] || die "경우 A 로그 폴더 권한 $(stat -f '%Lp' "$(dirname "$LOG_A")") (기대 700)"

# ── 경우 B: android · pnpm 실패 ──────────────────────────────────
run_case B 1 android
[[ $RC -eq 1 ]] || die "경우 B 종료 코드 $RC (기대 1)"
out_has B "Android  실패 — 로그 확인"
out_has B "오류 요약"
LOG_B="$(log_of B android)"
out_has B "$LOG_B"
out_has B "[!] upload failed — see (URL 생략 — 로그)"
out_lacks B "://"
out_lacks B "STUBTOKERR4"
out_lacks B "STUBTOKSIGNED3"
grep -qF "STUBTOKERR4" "$LOG_B" || die "경우 B 로그에 오류 줄 원문이 없다"

# ── 경우 C: all · iOS pnpm 실패 → Android 건너뜀 ─────────────────
: > "$STUB_CALLS"
run_case C 1 all
[[ $RC -eq 1 ]] || die "경우 C 종료 코드 $RC (기대 1)"
out_has C "iOS      실패 — 로그 확인"
out_has C "Android  건너뜀"
out_lacks C "://"
[[ "$(wc -l < "$STUB_CALLS" | tr -d ' ')" == "1" ]] || die "경우 C pnpm 호출 $(wc -l < "$STUB_CALLS" | tr -d ' ')회 (기대 1)"
[[ "$(cat "$STUB_CALLS")" == "run native:release:ios" ]] || die "경우 C pnpm 인자 「$(cat "$STUB_CALLS")」 (기대 run native:release:ios)"

# ── 경우 D: 인자 오류 ────────────────────────────────────────────
run_case D 0 nope
[[ $RC -eq 2 ]] || die "경우 D 종료 코드 $RC (기대 2)"

# ── 트립와이어 ───────────────────────────────────────────────────
[[ ! -e "$STUB_TRIP" ]] || die "금지 명령이 불렸다: $(tr '\n' ' ' < "$STUB_TRIP")"

echo "RELEASE APPS OUTPUT TEST OK — 화면 URL 0 · 표식 줄 · 로그 700/600 · 성공/실패 전달 · iOS 실패 → Android 건너뜀 · 인자 오류 2 · 트립와이어 0"
