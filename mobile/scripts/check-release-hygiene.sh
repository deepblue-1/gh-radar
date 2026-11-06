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
#   (2) 릴리스 비밀·산출물 샘플 경로(20개 — Firebase SA 키 · 릴리스 APK 포함)가 모두 git ignore 된다.
#       android/app/google-services.json 은 Phase 40 부터 추적 대상이라 샘플에서 뺐다(Phase 22 D-17 Android 만 번복)
#   (3) 추적 파일 가운데 비밀·산출물 확장자 · google-services.json · GoogleService-Info.plist 가 없다 —
#       정확한 경로 mobile/android/app/google-services.json 한 줄만 예외(SA 키 차단은 그대로)
#   (4) 비밀 디렉터리 700 · 그 안의 비밀 파일(Firebase SA 키 포함) 600 — **권한만 본다. 내용은 열지 않는다**
#   (5) mobile/scripts/*.sh 에 셸 추적 모드를 켜는 줄이 없다(값이 터미널에 찍힌다)
#   (6) Fastfile 이 빌드 번호를 프로젝트 파일에 쓰는 액션을 쓰지 않는다
#   (7) mobile/README.md 에 비밀 패턴이 없다
#   (8) android/app/google-services.json 이 있어야 하고 모양이 맞아야 한다 — project_id gh-radar ·
#       Android 클라이언트 package_name com.ghtrade.app 정확히 1개 · private_key · service_account 문자열 없음
#       (SA 키를 잘못 넣는 실수 방지). 없으면 릴리스 FCM 이 조용히 꺼진다(Phase 40 · Pitfall 7). 값은 출력하지 않는다
#   (9) android Fastfile 의 Firebase 호출마다 자격(service_credentials_file:)과 업로드 APK 경로
#       (android_artifact_path:)를 명시한다 — 빠지면 ADC(=owner 키)·「최근 mtime APK」 로 떨어진다(Pitfall F2 · F3)
#  (10) 업로드 전 검사 순서(REVIEW CR-01 · W-2 회귀 잠금) — lane 단위로, 업로드 액션 앞에 짝 검사가 있어야 한다:
#       upload_to_testflight ↔ check-ipa.sh · upload_to_play_store ↔ check-aab.sh · firebase_app_distribution ↔ check-apk.sh.
#       iOS 는 upload_to_testflight 에 ipa: 를 명시해야 한다(검사한 IPA 와 올리는 IPA 가 같아야 한다)
#  (11) iOS Firebase 0 — ios/App/CapApp-SPM/Package.swift 에 firebase(대소문자 무시)가 없고, 추적 파일에
#       GoogleService-Info.plist 가 없다(Phase 40 SC-5 — iOS 는 APNs 직접)
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
  firebase-appdistro-service-account.json \
  android/app/build/outputs/apk/release/app-release.apk; do
  if ! git check-ignore -q "$p"; then
    fail "git ignore 되지 않는 릴리스 경로: mobile/$p (mobile/.gitignore 보강)"
  fi
done

# ── (3) 추적 파일에 비밀·산출물 없음(저장소 전체) ─────────────────
# 정확한 경로 mobile/android/app/google-services.json 만 예외(Phase 40 — 공개 FCM 클라이언트 설정 · 모양은 (8)).
tracked="$(git ls-files --full-name -- ':(top)' | grep -E '\.(p8|p12|jks|keystore|mobileprovision|ipa|aab|apk|cer)$|\.dSYM\.zip$|(^|/)key\.properties$|play-store-key\.json$|service-account[^/]*\.json$|(^|/)google-services\.json$|(^|/)GoogleService-Info\.plist$' | grep -vx 'mobile/android/app/google-services.json' || true)"
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

# ── (8) google-services.json(Android) 존재 · 모양(Phase 40 · Phase 22 D-17 Android 만 번복) ──
# 값은 출력하지 않는다 — node 는 위반 종류만 낸다.
GSJ="android/app/google-services.json"
if [[ ! -f "$GSJ" ]]; then
  fail "mobile/$GSJ 이 없다 — 릴리스에서 Android 체결 푸시(FCM)가 조용히 꺼진다(Phase 40 · Pitfall 7). ~/.config/gh-trade/push/google-services.json 에서 복사한다"
elif ! gsj_bad="$(node -e '
  const fs = require("fs");
  const raw = fs.readFileSync(process.argv[1], "utf8");
  const bad = [];
  let j = null;
  try { j = JSON.parse(raw); } catch { bad.push("JSON 아님"); }
  if (j) {
    if ((j.project_info || {}).project_id !== "gh-radar") bad.push("project_id 가 gh-radar 가 아니다");
    const pkgs = (j.client || []).map((c) => ((c.client_info || {}).android_client_info || {}).package_name);
    const n = pkgs.filter((p) => p === "com.ghtrade.app").length;
    if (n !== 1) bad.push(`com.ghtrade.app 클라이언트 ${n}개(기대 1)`);
  }
  if (raw.includes("private_key")) bad.push("private_key 문자열이 있다");
  if (raw.includes("service_account")) bad.push("service_account 문자열이 있다");
  if (bad.length) { console.log(bad.join(" · ")); process.exit(1); }
' "$GSJ" 2>&1)"; then
  fail "mobile/$GSJ 모양이 맞지 않다(SA 키 · 다른 프로젝트 파일이 아닌지 확인): $gsj_bad"
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

# ── (10) 업로드 전 검사 순서(CR-01 · W-2) ────────────────────────
# lane 을 만날 때마다 「검사 봤음」 표시를 지운다 — 다른 lane 의 검사로 통과하지 않게(lane 단위 판정).
# 정규식은 [.] · [(] 브래킷으로 쓴다 — BSD awk 는 -v 값의 역슬래시를 해석한다.
# 여는 괄호까지 맞춰 firebase_app_distribution_get_latest_release( 를 업로드로 세지 않는다.
upload_gate() { # $1 Fastfile · $2 업로드 정규식 · $3 검사 정규식 · $4 업로드 이름 · $5 검사 이름
  [[ -f "$1" ]] || return 0
  awk -v ff="$1" -v up="$2" -v chk="$3" -v upn="$4" -v chkn="$5" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*lane[[:space:]]+:/ {
      lane = $0; sub(/^[[:space:]]*lane[[:space:]]+:/, "", lane); sub(/[^A-Za-z0-9_].*$/, "", lane)
      seen = 0
    }
    $0 ~ chk { seen = 1 }
    $0 ~ up && !seen { printf "%s lane %s: %d줄 %s 앞에 %s 가 없다 — 업로드 전 검사 없음(CR-01)\n", ff, lane, NR, upn, chkn }
  ' "$1"
}
gate_out="$(
  upload_gate ios/App/fastlane/Fastfile 'upload_to_testflight[(]' 'check-ipa[.]sh' upload_to_testflight check-ipa.sh
  upload_gate android/fastlane/Fastfile 'upload_to_play_store[(]' 'check-aab[.]sh' upload_to_play_store check-aab.sh
  upload_gate android/fastlane/Fastfile 'firebase_app_distribution[(]' 'check-apk[.]sh' firebase_app_distribution check-apk.sh
)"
if [[ -n "$gate_out" ]]; then
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then fail "$line"; fi
  done <<EOF
$gate_out
EOF
fi
FF_IOS="ios/App/fastlane/Fastfile"
if [[ -f "$FF_IOS" ]]; then
  ios_code="$(grep -vE '^[[:space:]]*#' "$FF_IOS" || true)"
  # 0건이면 grep 이 1 을 내고 pipefail 로 검사 전체가 멈춘다 — 0 은 정상 값이다.
  ios_count_of() { printf '%s\n' "$ios_code" | { grep -oE "$1" || true; } | wc -l | tr -d ' '; }
  tf_u="$(ios_count_of 'upload_to_testflight\(')"
  tf_i="$(ios_count_of '(^|[^A-Za-z0-9_])ipa:')"
  if (( tf_i < tf_u )); then
    fail "$FF_IOS upload_to_testflight ${tf_u}개에 ipa: 가 ${tf_i}개뿐 — 검사한 IPA 와 올리는 IPA 가 다를 수 있다(CR-01)"
  fi
fi

# ── (11) iOS Firebase 0(Phase 40 SC-5 — iOS 는 APNs 직접) ─────────────
SPM="ios/App/CapApp-SPM/Package.swift"
if [[ -f "$SPM" ]] && grep -qi 'firebase' "$SPM"; then
  fail "$SPM 에 Firebase 가 있다 — Phase 40 SC-5 · Firebase 는 Android 만"
fi
gsi="$(git ls-files --full-name -- ':(top)' | grep -E '(^|/)GoogleService-Info\.plist$' || true)"
if [[ -n "$gsi" ]]; then
  fail "GoogleService-Info.plist 가 추적된다 — Phase 40 SC-5 · iOS 는 Firebase 없음: $(printf '%s' "$gsi" | tr '\n' ' ')"
fi

if [[ -n "$NOTES" ]]; then printf '%s' "$NOTES"; fi

if [[ -n "$FAILS" ]]; then
  printf '%s' "$FAILS" | while IFS= read -r line; do
    [[ -n "$line" ]] && echo "RELEASE HYGIENE FAIL — $line" >&2
  done
  exit 1
fi

echo "RELEASE HYGIENE OK — gradle env 서명 · ignore 20경로 · 추적 비밀 0 · 권한 700/600 · 추적 모드 0 · 번호 주입만 · README 깨끗 · google-services.json(Android) 검증 · iOS Firebase 0 · Firebase 자격 명시 · 업로드 전 검사 순서"
