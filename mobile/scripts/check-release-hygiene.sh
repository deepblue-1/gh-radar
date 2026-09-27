#!/usr/bin/env bash
# GH Trade 릴리스 위생 검사 (Phase 22 · V14 · T-22-01 · T-22-02 · T-22-07).
#
# 왜: 릴리스 비밀(업로드 키스토어·비밀번호 · ASC API 키 · Play SA JSON)이 한 번이라도 저장소·로그에
#     들어가면 되돌릴 수 없다 — 업로드 키가 새면 Google 에 업로드 키 재설정을 요청해야 하고, ASC 키가
#     새면 폐기·재발급해야 한다. 빌드 번호가 프로젝트 파일에 쓰여 커밋되면 다음 릴리스가 중복 번호로
#     거절된다(D-09). 이 검사는 그런 결함을 한 번에 정적으로 찾는다.
#
# 검사 항목
#   (1) build.gradle 의 storePassword · keyPassword 에 따옴표 리터럴·기본값 연산자가 없고 env 로만 읽는다
#   (2) 릴리스 비밀·산출물 샘플 경로(21개 — Firebase SA 키 · google-services.json · 릴리스 APK 포함)가 모두 git ignore 된다
#   (3) 추적 파일 가운데 비밀·산출물 확장자 · google-services.json 이 없다
#   (4) 비밀 디렉터리 700 · 그 안의 비밀 파일(Firebase SA 키 포함) 600 — **권한만 본다. 내용은 열지 않는다**
#   (5) mobile/scripts/*.sh 에 셸 추적 모드를 켜는 줄이 없다(값이 터미널에 찍힌다)
#   (6) Fastfile 이 빌드 번호를 프로젝트 파일에 쓰는 액션을 쓰지 않는다
#   (7) mobile/README.md 에 비밀 패턴이 없다
#   (8) android/app/google-services.json 이 없다 — 있으면 build.gradle 이 google-services 플러그인을 켜고
#       앱 안 Firebase 금지(D-17)를 깬다(재범위 부록 Pitfall F5)
#   (9) android Fastfile 의 Firebase 호출마다 자격(service_credentials_file:)과 업로드 APK 경로
#       (android_artifact_path:)를 명시한다 — 빠지면 ADC(=owner 키)·「최근 mtime APK」 로 떨어진다(Pitfall F2 · F3)
#
# 사용: bash scripts/check-release-hygiene.sh
# 통과: 「RELEASE HYGIENE OK …」 한 줄 · exit 0. 위반: 「RELEASE HYGIENE FAIL — …」 줄들 · exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

REL="${GHTRADE_RELEASE_DIR:-$HOME/.config/gh-trade/release}"
GRADLE="android/app/build.gradle"

# 배열 대신 줄바꿈 누적 문자열 — bash 3.2(macOS 기본)에서 `set -u` + 빈 배열 참조가 터진다.
FAILS=""
fail() { FAILS="${FAILS}${1}"$'\n'; }
NOTES=""
note() { NOTES="${NOTES}${1}"$'\n'; }

# ── (1) build.gradle 서명 비밀번호 ──────────────────────────────
if [[ ! -f "$GRADLE" ]]; then
  fail "$GRADLE 없음"
else
  # env 이름 자체의 따옴표(System.getenv("…"))는 지우고, 남은 따옴표·엘비스·삼항을 찾는다.
  pw_lines="$(grep -nE '(store|key)Password' "$GRADLE" | sed -E 's/System\.getenv\("[A-Z0-9_]+"\)//g' || true)"
  bad_pw="$(printf '%s\n' "$pw_lines" | grep -E "['\"]|\?" || true)"
  if [[ -n "$bad_pw" ]]; then
    fail "$GRADLE 서명 비밀번호 줄에 리터럴·기본값이 있다(D-07 · weekly-wine 결함): $(printf '%s' "$bad_pw" | cut -d: -f1 | tr '\n' ' ')줄"
  fi
  if ! grep -q 'System.getenv("GHTRADE_UPLOAD_STORE_PASSWORD")' "$GRADLE"; then
    fail "$GRADLE 가 GHTRADE_UPLOAD_STORE_PASSWORD 를 env 로 읽지 않는다(D-08)"
  fi
fi

# ── (2) gitignore 샘플(22-01 acceptance 와 같은 목록 + 업로드 키스토어 · 릴리스 AAB) ──
for p in App.ipa x.aab x.apk AuthKey_X.p8 a.p12 a.cer a.mobileprovision key.properties \
  play-store-key.json play-service-account.json ios/App/fastlane/report.xml ios/App/fastlane/README.md \
  android/fastlane/report.xml vendor/bundle/x .bundle/config App.app.dSYM.zip \
  ghtrade-upload.jks android/app/build/outputs/bundle/release/app-release.aab \
  firebase-appdistro-service-account.json android/app/google-services.json \
  android/app/build/outputs/apk/release/app-release.apk; do
  if ! git check-ignore -q "$p"; then
    fail "git ignore 되지 않는 릴리스 경로: mobile/$p (mobile/.gitignore 보강)"
  fi
done

# ── (3) 추적 파일에 비밀·산출물 없음(저장소 전체) ─────────────────
tracked="$(git ls-files --full-name -- ':(top)' | grep -E '\.(p8|p12|jks|keystore|mobileprovision|ipa|aab|apk|cer)$|\.dSYM\.zip$|(^|/)key\.properties$|play-store-key\.json$|service-account[^/]*\.json$|(^|/)google-services\.json$' || true)"
if [[ -n "$tracked" ]]; then
  fail "추적 중인 비밀·산출물 파일: $(printf '%s' "$tracked" | tr '\n' ' ')"
fi

# ── (4) 비밀 디렉터리·파일 권한(내용 미열람) ─────────────────────
if [[ -d "$REL" ]]; then
  mode="$(stat -f '%Lp' "$REL")"
  if [[ "$mode" != "700" ]]; then
    fail "비밀 디렉터리 권한 $mode (기대 700): $REL"
  fi
  for f in ios.env android.env ghtrade-upload.jks play-service-account.json firebase-appdistro-service-account.json; do
    if [[ -f "$REL/$f" ]]; then
      mode="$(stat -f '%Lp' "$REL/$f")"
      if [[ "$mode" != "600" ]]; then fail "비밀 파일 권한 $mode (기대 600): $REL/$f"; fi
    else
      note "안내: $REL/$f 아직 주입 전"
    fi
  done
  p8_seen=""
  for f in "$REL"/AuthKey_*.p8; do
    if [[ -f "$f" ]]; then
      p8_seen=1
      mode="$(stat -f '%Lp' "$f")"
      if [[ "$mode" != "600" ]]; then fail "비밀 파일 권한 $mode (기대 600): $f"; fi
    fi
  done
  if [[ -z "$p8_seen" ]]; then note "안내: $REL/AuthKey_*.p8 아직 주입 전"; fi
else
  note "안내: 비밀 디렉터리 $REL 아직 주입 전"
fi

# ── (5) 셸 추적 모드 금지 ────────────────────────────────────────
# 패턴은 문자 클래스로 쪼개 써서 이 파일 자신이 그 문자열을 한 덩어리로 담지 않는다.
trace="$(grep -nE '^[[:space:]]*set[[:space:]]+-[a-zA-Z]*x|^[[:space:]]*set[[:space:]]+-o[[:space:]]+x[t]race' scripts/*.sh || true)"
if [[ -n "$trace" ]]; then
  fail "셸 추적 모드를 켜는 줄(비밀이 터미널에 찍힌다): $(printf '%s' "$trace" | cut -d: -f1-2 | tr '\n' ' ')"
fi

# ── (6) 빌드 번호를 프로젝트 파일에 쓰는 fastlane 액션 금지(D-09) ──
for ff in ios/App/fastlane/Fastfile android/fastlane/Fastfile; do
  if [[ -f "$ff" ]]; then
    hit="$(grep -nE 'increment_(build_number|version_code)' "$ff" | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
    if [[ -n "$hit" ]]; then
      fail "$ff 가 빌드 번호를 프로젝트 파일에 쓴다(D-09 — 주입만): $(printf '%s' "$hit" | cut -d: -f1 | tr '\n' ' ')줄"
    fi
  fi
done

# ── (7) README 비밀 패턴 ─────────────────────────────────────────
if [[ -f README.md ]]; then
  secret_doc="$(grep -nE 'PASSWORD=|BEGIN PRIVATE KEY|"private_key"' README.md || true)"
  if [[ -n "$secret_doc" ]]; then
    fail "mobile/README.md 에 비밀 패턴: $(printf '%s' "$secret_doc" | cut -d: -f1 | tr '\n' ' ')줄"
  fi
fi

# ── (8) google-services.json 부재(D-17 — 앱 안에 Firebase SDK·설정 없음) ──
if [[ -e android/app/google-services.json ]]; then
  fail "mobile/android/app/google-services.json 이 있다 — build.gradle 이 google-services 플러그인을 켠다(D-17 · Pitfall F5). 저장소 밖으로 옮기거나 지운다"
fi

# ── (9) Firebase 호출 자격·APK 경로 명시(Pitfall F2 · F3) ──────────
FF_ANDROID="android/fastlane/Fastfile"
if [[ -f "$FF_ANDROID" ]]; then
  ff_code="$(grep -vE '^[[:space:]]*#' "$FF_ANDROID" || true)"
  # 0건이면 grep 이 1 을 내고 pipefail 로 검사 전체가 멈춘다 — 0 은 정상 값이다.
  count_of() { printf '%s\n' "$ff_code" | { grep -oE "$1" || true; } | wc -l | tr -d ' '; }
  fad_u="$(count_of 'firebase_app_distribution\(')"
  fad_l="$(count_of 'firebase_app_distribution_get_latest_release\(')"
  fad_c="$(count_of 'service_credentials_file:')"
  fad_a="$(count_of 'android_artifact_path:')"
  if (( fad_c < fad_u + fad_l )); then
    fail "$FF_ANDROID Firebase 호출 $((fad_u + fad_l))개에 service_credentials_file: 이 ${fad_c}개뿐 — 빠지면 ADC(owner 키)로 인증한다(Pitfall F2)"
  fi
  if (( fad_a < fad_u )); then
    fail "$FF_ANDROID Firebase 업로드 ${fad_u}개에 android_artifact_path: 가 ${fad_a}개뿐 — 빠지면 최근 mtime APK 가 올라간다(Pitfall F3)"
  fi
fi

if [[ -n "$NOTES" ]]; then printf '%s' "$NOTES"; fi

if [[ -n "$FAILS" ]]; then
  printf '%s' "$FAILS" | while IFS= read -r line; do
    [[ -n "$line" ]] && echo "RELEASE HYGIENE FAIL — $line" >&2
  done
  exit 1
fi

echo "RELEASE HYGIENE OK — gradle env 서명 · ignore 21경로 · 추적 비밀 0 · 권한 700/600 · 추적 모드 0 · 번호 주입만 · README 깨끗 · google-services.json 없음 · Firebase 자격 명시"
