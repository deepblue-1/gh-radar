---
phase: 22-gh-trade-ios-testflight-android-play
plan: 07
subsystem: mobile-release
tags: [fastlane, firebase, app-distribution, android, apk, apksigner, aapt2, release-hygiene]

requires:
  - phase: 22-04
    provides: "업로드 키스토어 · android.env(GHTRADE_UPLOAD_* · GHTRADE_UPLOAD_SHA1) · env 서명 build.gradle · build_numbers.rb android_version_code · release-android.sh 5모드 · check-aab.sh 규약 · Play lanes build/beta/validate/track"
  - phase: 22-05
    provides: "Firebase Android 앱 ID 1:1023658565518:android:3b06f0472060afa97e4edf · 그룹 ghtrade-testers(본인 1명) · 전용 SA gh-trade-appdistro(roles/firebaseappdistro.admin 하나) 키 600 · 위생 검사 (9) Firebase 자격 명시 불변식"
provides:
  - "fastlane-plugin-firebase_app_distribution 1.0.0 Gemfile 잠금(Pluginfile 없음 · fastlane 2.240.1 불변)"
  - "Fastfile lanes firebase · firebase_latest · 상수 GHTRADE_FIREBASE_ANDROID_APP_ID · GHTRADE_RELEASE_APK · 헬퍼 ghtrade_build_release_apk · ghtrade_appdistro_sa! (Play lanes 4개 보존)"
  - "mobile/scripts/check-apk.sh — apksigner 서명자 1개·SHA-1 정규화 대조 · aapt2 package/versionCode/debuggable · assets/capacitor.config.json 운영값 → APK CHECK OK"
  - "release-android.sh 기본 firebase · firebase-latest · check-apk 모드 + 기존 5모드 · unset GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN"
  - "npm native:release:android → firebase · native:release:android:play → beta (Phase 23)"
  - "첫 Firebase App Distribution 릴리스 versionCode 609271311 (그룹 ghtrade-testers)"
affects: [22-08, 22-09, 23]

actuals:
  tokens: 6800     # chars/4 — git diff 9ecff239..HEAD -- mobile = 27,256자(7개 파일 · +279/−27)
  tasks: 3
  commits: 3       # MEASURED: git rev-list --count --grep='(22-07)' 9ecff239..HEAD = 3 · 원시 범위 9ecff239..HEAD = 5 는 끼어든 22-05 docs 커밋 2개(b9263f4a · 7c630d54) 포함
plan_head_before: 9ecff239

tech-stack:
  added:
    - "fastlane-plugin-firebase_app_distribution 1.0.0"
    - "google-apis-firebaseappdistribution_v1 0.22.0"
    - "google-apis-firebaseappdistribution_v1alpha 0.30.0"
  patterns:
    - "Firebase 업로드는 android_artifact_path · service_credentials_file 을 항상 명시 — 기본값(mtime 최신 APK · ADC 폴백)에 기대지 않는다"
    - "업로드 전 게이트는 lane 안에서 sh 로 check-apk — 실패하면 업로드 전에 lane 이 멈춘다"
    - "v2 전용 APK 서명 검사는 apksigner(build-tools 최고 버전) — JDK 서명 도구 금지"
    - "빌드 전 이전 release APK 삭제 + ghtrade-version-code.txt 대조로 옛/엉뚱한 APK 업로드 차단"

key-files:
  created:
    - mobile/scripts/check-apk.sh
  modified:
    - mobile/Gemfile
    - mobile/Gemfile.lock
    - mobile/android/fastlane/Fastfile
    - mobile/scripts/release-android.sh
    - mobile/package.json
    - mobile/android/app/build.gradle

key-decisions:
  - "22-07: 첫 Firebase App Distribution 릴리스 versionCode 609271311 — 2026-09-27 13:11:22 KST 업로드 완료(그룹 ghtrade-testers · 본인 1명) · firebase_latest buildVersion 도 609271311"
  - "22-07: 업로드 APK 검사 줄 APK CHECK OK sha1=2fe3ba78a5741606f879a8d33c2823ef72987b7d versionCode=609271311 — 서명자 1개 · 업로드 키 SHA-1 일치"
  - "22-07: 인증은 전용 SA 키 경로 인자만 — 로그에 Authenticating with --service_credentials_file 1건 · Application Default Credentials 0건"
  - "22-07: Gemfile.lock 추가 gem 은 정확히 3개(fastlane-plugin-firebase_app_distribution 1.0.0 · google-apis-firebaseappdistribution_v1 0.22.0 · _v1alpha 0.30.0) · fastlane 2.240.1 불변 · Pluginfile/eval_gemfile 없음"
  - "22-07: 사이드로드 스모크 SIDELOAD SMOKE OK serial=emulator-5554 versionCode=609271311 · 이후 release 판 제거로 debug 스모크 복원"

patterns-established:
  - "릴리스 로그는 저장소 밖 mktemp 에 두고 표식 줄·versionCode 만 옮긴다 — 1시간 다운로드 링크·console/testing URI 는 옮기지 않는다"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "플러그인 Gemfile 잠금 — 1.0.x · fastlane 2.240.1 불변 · Pluginfile/eval_gemfile 없음 · fastlane 이 플러그인을 로드"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "Task 1 verify 1 (Gemfile.lock grep · Pluginfile 부재) · verify 2 (bundle exec fastlane action firebase_app_distribution | grep fastlane-plugin-fireb)"
        status: pass
    human_judgment: false
  - id: D2
    description: "native:release:android 한 명령 → PROD CONFIG OK → 업로드 키 서명 APK → APK CHECK OK → 전용 SA 로 Firebase 업로드(ADC 없음)"
    requirement: MOBILE-02
    verification:
      - kind: e2e
        ref: "Task 1 verify 3 — pnpm --filter @gh-radar/mobile run native:release:android (mktemp 로그 표식 5종)"
        status: pass
    human_judgment: false
  - id: D3
    description: "릴리스가 build.gradle · Info.plist · pbxproj 를 바꾸지 않고 위생 검사 통과"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "Task 1 verify 4 — git status --porcelain 3파일 비어 있음 · check-release-hygiene.sh RELEASE HYGIENE OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "래퍼 모드 확장·엣지 — exit 2 · exit 3(env/SA 누락, fastlane 전) · check-apk 음성(debug·없는 파일·틀린 SHA-1) · 소문자 SHA-1 정규화 · firebase-latest = versionCode · gradle 가드 문구 · Play/AAB 보존"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "Task 2 verify 1~8 (V6 firebase-latest 는 업로드 뒤 재실행: latest Firebase build 609271311 · check-apk 모드 APK CHECK OK versionCode=609271311)"
        status: pass
    human_judgment: false
  - id: D5
    description: "업로드한 release APK 가 에뮬레이터에 설치·실행되고 이후 release 판 제거로 debug 스모크 복원"
    requirement: MOBILE-02
    verification:
      - kind: manual_procedural
        ref: "Task 3 verify 1 SIDELOAD SMOKE OK serial=emulator-5554 versionCode=609271311 · verify 2 uninstall Success + pm list 비어 있음"
        status: pass
    human_judgment: false
  - id: D6
    description: "테스터(본인) 기기에서 Firebase 초대 메일 → App Tester 설치 → Google 로그인"
    requirement: MOBILE-02
    verification: []
    human_judgment: true
    rationale: "사람 계정·실기 UI 흐름 — 22-08 본인 확인 범위(OAuth 동의 화면 테스트 모드 테스트 사용자 인계 포함)"

duration: 1h 21m
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 07: Android APK → Firebase App Distribution 트레이서 Summary

**`native:release:android` 한 명령으로 업로드 키 서명 release APK 를 apksigner·aapt2·운영 설정 검사(APK CHECK OK)로 막은 뒤 전용 SA 자격(ADC 없음)으로 Firebase App Distribution 그룹 ghtrade-testers 에 올렸다 — 첫 릴리스 versionCode 609271311**

## Performance

- **Duration:** 1h 21m (22-05 SA 키 인증 게이트 대기 포함 — 순수 작업은 그보다 짧다)
- **Started:** 2026-09-27T02:51:27Z (plan_head_before 9ecff239 커밋 시각 기준)
- **Completed:** 2026-09-27T04:13:00Z
- **Tasks:** 3
- **Files modified:** 7 (생성 1 · 수정 6)

## Accomplishments

- 첫 Firebase App Distribution 릴리스 versionCode 609271311 이 올라갔고 `firebase_latest` 가 같은 buildVersion 을 돌려준다
- 업로드 대상·서명·자격·설정을 기계적으로 검사한다(check-apk · android_artifact_path · service_credentials_file · unset ADC env)
- 래퍼 기본 경로가 firebase 가 됐고 Play/AAB 경로(lanes 4개 · `:aab` · 새 `:play` · play-sa)는 Phase 23 용으로 그대로 호출할 수 있다
- 같은 APK 가 에뮬레이터에 설치·실행되고 기기는 debug 스모크 상태로 복원됐다

## Task Commits

1. **Task 1 (tracer): 플러그인 잠금 · lane firebase · check-apk · 래퍼 firebase 모드 · npm 재배선** - `1ca389cf` (feat)
2. **Task 1 수정: check-apk 상대 경로 인자 해석** - `2f64468a` (fix)
3. **Task 2: firebase-latest · check-apk 모드 · 기본 firebase · gradle 가드 문구** - `eefcab6f` (feat)
4. **Task 3: 사이드로드 스모크** - 커밋 없음(기기 스모크 전용)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `mobile/scripts/check-apk.sh` - release APK 검사(apksigner 서명자 1개·SHA-1 · aapt2 package/versionCode/debuggable · capacitor.config.json 운영값) → APK CHECK OK
- `mobile/Gemfile` / `mobile/Gemfile.lock` - fastlane-plugin-firebase_app_distribution ~> 1.0 (+ google-apis 2개)
- `mobile/android/fastlane/Fastfile` - lanes firebase · firebase_latest · 앱 ID/APK 상수 · 빌드/SA 헬퍼(Play lanes 불변)
- `mobile/scripts/release-android.sh` - 기본 firebase · firebase-latest · check-apk 모드 · unset ADC env · exit 2/3
- `mobile/package.json` - native:release:android → firebase · native:release:android:play → beta
- `mobile/android/app/build.gradle` - 릴리스 가드 문구 1줄 정정(로직 불변 · numstat 1/1)

## Decisions Made

- **첫 Firebase 릴리스:** versionCode **609271311** · 업로드 2026-09-27 13:11:22 KST(명령 13:11:02 시작 → 13:11:23 종료) · 대상 그룹 ghtrade-testers(본인 1명)
- **APK 검사 줄:** `APK CHECK OK sha1=2fe3ba78a5741606f879a8d33c2823ef72987b7d versionCode=609271311`
- **인증 경로:** 로그에 `Authenticating with --service_credentials_file` 1건 · `Application Default Credentials` 0건 · `App Distribution upload finished successfully` 1건 · `PROD CONFIG OK` 1건
- **추가 gem 3개:** fastlane-plugin-firebase_app_distribution 1.0.0 · google-apis-firebaseappdistribution_v1 0.22.0 · google-apis-firebaseappdistribution_v1alpha 0.30.0 — fastlane 2.240.1 그대로 · Pluginfile/eval_gemfile 없음
- **최신 릴리스 조회:** `release-android.sh firebase-latest` → `latest Firebase build 609271311` · `release-android.sh check-apk` → 같은 versionCode 로 APK CHECK OK
- **사이드로드 스모크:** `SIDELOAD SMOKE OK serial=emulator-5554 versionCode=609271311` → release 판 제거 `Success` · `pm list packages com.ghtrade.app` 비어 있음(debug 스모크 복원). 게이트 전 빌드(609271245)에서도 같은 스모크가 통과했고 그 판도 제거했다
- 다운로드 링크·console/testing URI 는 기록하지 않는다(Pitfall F9)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] check-apk 가 호출 위치 기준 상대 경로 인자를 잘못 풀었다**
- **Found during:** Task 2 (음성 검사)
- **Issue:** 스크립트가 `cd mobile` 한 뒤 인자를 해석해, 저장소 루트에서 준 상대 경로 APK 를 찾지 못했다
- **Fix:** cd 전에 인자를 절대 경로로 정규화
- **Files modified:** mobile/scripts/check-apk.sh
- **Verification:** Task 2 verify 4·5 통과
- **Committed in:** 2f64468a

### 오케스트레이터 지시·기록 사항

**2. [오케스트레이터 지시] 22-05 미완(SA 키 없음) 상태에서 업로드 외 작업을 먼저 진행**
- 이전 실행기가 lane firebase 를 subshell 로 직접 돌려(`set -a; source android.env` 비출력 · `unset GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN` · `bundle exec fastlane firebase`) 업로드 전 APK(versionCode 609271245)를 만들었고, lane 자신의 SA 가드에서 멈췄다 — 인증/업로드/ADC 줄 0건, 자격 증명 미사용. SA 키 생성(22-05 완료) 뒤 이 연속 실행기가 정식 명령으로 첫 업로드를 했다.

**3. [기록] 보호 브랜치 경고에도 master 커밋** — config `git.branching_strategy: none` · 이전 플랜과 같은 관례(push 안 함).

**4. [기록] 수용 기준 `grep -c 'MODE="${1:-firebase}"'` 가 세션 grep 에서 `$` 때문에 0** — 고정 문자열 `grep -cF` 로는 1(내용 일치).

---

**Total deviations:** 1 auto-fixed (Rule 1) + 3 기록 사항(오케스트레이터 지시 1 · 관례 1 · 검사 표기 1)
**Impact on plan:** 기능 범위 변화 없음. 순서만 22-05 게이트 때문에 나뉘었다.

## Authentication Gates

- **Task 1 업로드:** Firebase 업로드 전용 SA 키(22-05 산출물)가 없어 이전 실행기가 업로드 직전에 멈췄다. 사용자가 `setup-release-secrets.sh firebase-sa` 로 키를 만든 뒤(22-05 완료 · 키 600 · 역할 하나) 재개해 첫 업로드가 한 번에 성공했다.

## Issues Encountered

None — 업로드는 재시도 없이 1회 성공(INVALID_APP_ID · 403 없음).

## User Setup Required

None - 추가 외부 설정 없음. 테스터 Google 계정의 OAuth 동의 화면 테스트 사용자 추가는 22-08 인계.

## Next Phase Readiness

- 22-08: 본인 기기에서 Firebase 초대 → App Tester 설치 → 로그인 확인 · README 릴리스 절 · 테스터 안내
- 22-09: 두 번째 Firebase 릴리스는 versionCode 가 609271311 보다 커야 한다(같은 분 재실행 금지)
- Phase 23: Play 경로(`native:release:android:play` · lanes build/beta/validate/track · play-sa) 보존됨

## Self-Check: PASSED

- FOUND: mobile/scripts/check-apk.sh · mobile/android/fastlane/Fastfile · mobile/scripts/release-android.sh · mobile/package.json · mobile/Gemfile.lock
- FOUND commits: 1ca389cf · 2f64468a · eefcab6f
- Task 1 verify 1~4 PASS · Task 2 verify 1~8 PASS(V6 업로드 뒤 재실행) · Task 3 verify 1~2 PASS · 수용 grep 재실행 PASS

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*
