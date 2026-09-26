---
phase: 22-gh-trade-ios-testflight-android-play
plan: 01
subsystem: mobile-release
tags: [fastlane, testflight, ios, app-store-connect, sigh, gym, pilot, capacitor, release-pipeline]

requires:
  - phase: 21 (GH Trade 네이티브 앱 셸)
    provides: "Capacitor iOS 프로젝트(pbxproj 팀 954QPCS3F5 · Automatic 서명 · MARKETING_VERSION 1.0) · native:verify-prod(PROD CONFIG OK) · native:assets 아이콘"
provides:
  - "native:release:ios 한 명령 — cap sync(양 플랫폼) → verify-prod → 래퍼(env 이름 검증 · exit 3) → fastlane beta(sigh · gym · pilot) → IPA CHECK OK"
  - "TestFlight 에 올라간 첫 GH Trade 빌드 1.0 (202609270252)"
  - "mobile/Gemfile(.lock) fastlane 2.240.1 잠금 — 22-04 Android lane 이 같은 Gemfile 을 쓴다"
  - "GhTradeBuildNumbers.ios_build_number(t) = YYYYMMDDHHMM — 22-04 가 android_version_code 를 더한다"
  - "setup-release-secrets.sh stages dir · asc — 22-04 가 keystore · backup · play-sa 를 더한다"
  - "check-ipa.sh (서명 · application-identifier · get-task-allow · 빌드 번호 · 수출 규정 · CAPACITOR_DEBUG · 운영 URL)"
  - "ASC 에 App Store 프로파일 `com.ghtrade.app AppStore` (sigh 가 생성 · 이후 재사용)"
affects: [22-04, 22-05, 22-06, 22-07]

actuals:
  tokens: 8300     # chars/4 — 1594d546 의 추가 줄 33,209자(11개 파일 · Gemfile.lock 367줄 포함)
  tasks: 2
  commits: 4       # MEASURED: git rev-list --count 87ce275d..HEAD (SUMMARY 커밋 전) — 이 중 22-01 코드 커밋은 1594d546 하나, 나머지 3개(b26ea0f6 · d64a49c0 · 7a1f895c)는 사이에 끝난 22-02 커밋
plan_head_before: 87ce275db5d54468ffdd7451de74083a8f90b479

tech-stack:
  added: ["fastlane 2.240.1 (Bundler · Homebrew Ruby 4 · mobile/vendor/bundle)"]
  patterns:
    - "빌드 번호는 저장소 파일에 쓰지 않는다 — lane 이 YYYYMMDDHHMM 을 계산해 xcargs CURRENT_PROJECT_VERSION= 로만 주입(Info.plist 는 $(CURRENT_PROJECT_VERSION) 변수 유지 · pbxproj 무변경)"
    - "비밀은 ~/.config/gh-trade/release/(700/600)에만, 사용자 `!` 스크립트로만 주입 — 래퍼가 source 하고 누락 시 키 이름만 출력하고 exit 3"
    - "릴리스 산출물(.ipa · .dSYM.zip · .mobileprovision · build_number.txt)은 GHTRADE_RELEASE_OUT(저장소 밖)에만 · mobile/.gitignore 가 이중 방어"
    - "업로드 전 게이트 사슬: cap sync(양쪽) → PROD CONFIG OK → (업로드) → IPA CHECK OK"

key-files:
  created:
    - mobile/Gemfile
    - mobile/Gemfile.lock
    - mobile/fastlane/build_numbers.rb
    - mobile/ios/App/fastlane/Fastfile
    - mobile/ios/App/fastlane/Appfile
    - mobile/scripts/setup-release-secrets.sh
    - mobile/scripts/release-ios.sh
    - mobile/scripts/check-ipa.sh
  modified:
    - mobile/ios/App/App/Info.plist
    - mobile/package.json
    - mobile/.gitignore

key-decisions:
  - "22-01: ASC 앱 이름 `GH Trade`(선점 없음) · ASC 사용자 초대 화면 열림(가능) → D-02 내부 테스터 경로 유지"
  - "22-01: 첫 TestFlight 업로드 빌드 1.0 (202609270252) — 2026-09-27 02:54 KST 업로드 성공, 처리 대기는 skip"
  - "22-01: sigh 가 App Store 프로파일 `com.ghtrade.app AppStore` 를 ASC API 키로 새로 생성(키 권한 충분 · 수동 생성 불필요)"
  - "22-01: archive 는 Xcode 계정 인증 + -allowProvisioningUpdates 만으로 통과 — -authenticationKey* xcargs 추가 불필요"
  - "22-01: ASC API 키는 weekly-wine 것을 재사용(사용자 `!` setup-release-secrets.sh dir asc 로 저장소 밖 복사 · 인증 게이트 1회 발생)"

patterns-established:
  - "릴리스 래퍼 계약: env 파일 없음/키 비어 있음 → fastlane 전에 exit 3 + 키 이름·경로·주입 명령만"
  - "비밀 주입 스크립트: 대화형 입력 없음 · 값 비출력(OK/SKIP 만) · 이미 있으면 SKIP · tmp→mv 원자적 쓰기"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "native:release:ios 한 명령이 운영 sync → PROD CONFIG OK → fastlane beta(sigh·gym·pilot) → IPA CHECK OK 까지 끝나고 빌드가 App Store Connect 에 업로드됨"
    requirement: MOBILE-02
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/mobile run native:release:ios (exit 0 · PROD CONFIG OK · 「Successfully uploaded the new binary to App Store Connect」 · IPA CHECK OK build=202609270252)"
        status: pass
    human_judgment: false
  - id: D2
    description: "빌드 번호 주입만 — pbxproj 무변경 · Info.plist CFBundleVersion = $(CURRENT_PROJECT_VERSION) · ITSAppUsesNonExemptEncryption=false"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "git diff --quiet -- mobile/ios/App/App.xcodeproj/project.pbxproj && PlistBuddy CFBundleVersion/ITSAppUsesNonExemptEncryption 검사"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty 엣지 — env 파일 없음/키 비어 있음이면 래퍼가 fastlane 전에 exit 3 · 키 이름·주입 명령만 출력"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-missing-vars bash mobile/scripts/release-ios.sh → exit 3 · 「setup-release-secrets.sh dir asc」 포함 · 「Driving the lane」 없음"
        status: pass
    human_judgment: false
  - id: D4
    description: "비밀·산출물 저장소 밖 — gitignore 샘플 17개 전부 ignore · 추적 파일 비밀 패턴 0 · mobile/ 아래 ipa/mobileprovision/dSYM.zip 0 · 비밀 디렉터리 700"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "acceptance: git check-ignore 루프 · git ls-files 비밀 패턴 · find mobile 산출물 · stat -f %Lp ~/.config/gh-trade/release"
        status: pass
    human_judgment: false
  - id: D5
    description: "업로드된 빌드가 TestFlight 내부 그룹 `GH Trade 테스터` 에 자동 배포되어 테스터 기기에 설치됨"
    requirement: MOBILE-02
    verification: []
    human_judgment: true
    rationale: "Apple 처리(Processing) 완료와 기기 설치는 콘솔·실기에서만 확인 가능 — 22-06 UAT 가 확인한다"

duration: "약 1h 10m (계획 커밋 01:45 KST ~ 02:55 KST · 콘솔 선행·비밀 주입 사람 게이트 대기 포함 · 실제 릴리스 실행 약 2분 20초)"
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 01: iOS 릴리스 트레이서 (fastlane → TestFlight) Summary

**`native:release:ios` 한 명령이 운영 sync → PROD CONFIG OK → fastlane 2.240.1 beta(sigh 가 `com.ghtrade.app AppStore` 프로파일 생성 → gym Release archive · 빌드 번호 202609270252 주입 → pilot 업로드) → IPA CHECK OK 까지 끝나 첫 GH Trade 빌드가 TestFlight 에 올라갔다 — 저장소 파일 무변경 · 비밀·산출물은 저장소 밖.**

## Performance

- **Duration:** 약 1h 10m (사람 게이트 대기 포함 — 실제 릴리스 명령은 2분 20초: sigh 3s · build_app 57s · upload 73s)
- **Started:** 2026-09-26T16:45:31Z (근사 — 계획 커밋 1e7c3af4 직후)
- **Completed:** 2026-09-26T17:54:58Z
- **Tasks:** 2 / 2 (Task 1 콘솔 선행 · Task 2 트레이서)
- **Files modified:** 11

## Accomplishments

- **TestFlight 첫 업로드 성공:** 빌드 1.0 (202609270252) · 2026-09-27 02:54:19 KST 「Successfully uploaded the new binary to App Store Connect」 · `IPA CHECK OK build=202609270252`.
- **sigh 자동 프로파일 생성:** ASC API 키 권한으로 `com.ghtrade.app AppStore` 를 새로 만들고 저장소 밖(`~/Library/Developer/gh-trade-release/ios/AppStore_com.ghtrade.app.mobileprovision`)에 받았다 — 이후 실행은 재사용.
- **빌드 번호 주입 경로 증명:** lane 이 12자리 KST 시각을 `build_number.txt` 에 쓰고 `xcargs CURRENT_PROJECT_VERSION=` 로 주입, check-ipa 가 IPA 안 `CFBundleVersion` 과 대조 · pbxproj/Info.plist 무변경.
- **비밀 경계 유지:** 인증 게이트 1회(사용자 `!` 주입) 외에 실행기는 비밀 파일을 열지 않았고, fastlane 요약도 `api_key ********` 로 가림.
- **산출물 저장소 밖:** `App.ipa` · `App.app.dSYM.zip` · `.mobileprovision` · `build_number.txt` 모두 `~/Library/Developer/gh-trade-release/ios/` 에만 있고 `mobile/` 아래 0개 · `git status mobile/` 깨끗.

## Task Commits

1. **Task 1: Apple 콘솔 선행 (checkpoint:human-action)** — 커밋 없음 (사용자 재개 신호 `done 앱이름=GH Trade 사용자초대=가능`)
2. **Task 2 (tracer): iOS 릴리스 파이프라인** — `1594d546` (feat) · 실제 업로드는 저장소 변경 없음(산출물은 저장소 밖)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `mobile/Gemfile` · `mobile/Gemfile.lock` — fastlane `~> 2.240` (2.240.1 잠금 · rubygems.org 단일 소스)
- `mobile/fastlane/build_numbers.rb` — `GhTradeBuildNumbers.ios_build_number(t)` = `YYYYMMDDHHMM`
- `mobile/ios/App/fastlane/Fastfile` — lane `beta`: env 이름 검증 → ASC API 키 → 빌드 번호 → sigh(readonly false) → gym(app-store export · 저장소 밖 출력) → pilot
- `mobile/ios/App/fastlane/Appfile` — `com.ghtrade.app` · 팀 `954QPCS3F5`
- `mobile/ios/App/App/Info.plist` — `ITSAppUsesNonExemptEncryption` = false (CFBundleVersion 변수 참조 유지)
- `mobile/scripts/setup-release-secrets.sh` — 사용자 `!` 전용 비밀 주입 stages `dir` · `asc`
- `mobile/scripts/release-ios.sh` — env 로드 · 이름만 검증(exit 3) → `bundle exec fastlane beta` → check-ipa
- `mobile/scripts/check-ipa.sh` — 서명 · 엔타이틀먼트 · 빌드 번호 · 수출 규정 · 디버그 · 운영 URL 검사
- `mobile/package.json` — `native:release:ios`
- `mobile/.gitignore` — 릴리스 비밀·산출물 패턴(이중 방어)

## Decisions Made

- **ASC 앱 이름:** `GH Trade` (Task 1 재개 신호 · 선점 없음).
- **ASC 사용자 초대:** 가능 — D-02(내부 테스터 경로) 유지, 초대는 22-06.
- **업로드 빌드 번호:** `202609270252` (`build_number.txt` · 마케팅 버전 1.0).
- **sigh 프로파일 이름:** `com.ghtrade.app AppStore` (sigh 가 ASC API 키로 신규 생성 — A9 키 권한 충분, 수동 생성 분기 불필요).
- **업로드 시각:** 2026-09-27 02:54:19 KST (`skip_waiting_for_build_processing` — Apple 처리 완료는 확인하지 않음).
- **인증 게이트 발생:** 예 — Task 2 ⑪(b) 에서 `ios.env` 부재로 exit 3, 사용자가 `! bash mobile/scripts/setup-release-secrets.sh dir asc` 실행(출력 「OK dir」「OK asc」), 이후 재실행 성공.
- **archive 인증 방식:** Xcode 계정 인증 + `-allowProvisioningUpdates` (xcargs `CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION=… -allowProvisioningUpdates`) — `-authenticationKeyPath/ID/IssuerID` 플래그는 필요 없었다.
- **App Store Connect 앱 레코드:** fastlane 이 앱을 찾아 업로드(Apple ID 는 기록하지 않음).

## Authentication Gates

- **Task 2 ⑪(b):** `~/.config/gh-trade/release/ios.env` 가 없어 `native:release:ios` 가 `cap sync` + `PROD CONFIG OK` 뒤 래퍼에서 exit 3(키 이름·경로·주입 명령만 출력). 사용자가 `! bash mobile/scripts/setup-release-secrets.sh dir asc` 를 실행 → 「OK dir」「OK asc」. 비밀 디렉터리 700 · `ios.env` + `AuthKey_<id>.p8` 1개 확인(값 미열람). 재실행 → 업로드 성공.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] setup-release-secrets.sh `asc` 단계 견고화**
- **Found during:** Task 2 ⑦ (비밀 주입 스크립트 작성)
- **Issue:** 플랜 문구대로 `^ASC_KEY_ID=` · `^ASC_ISSUER_ID=` 두 줄만 grep 하면 원본이 `export ` 접두사나 CRLF 줄끝을 쓸 때 키를 못 찾거나 값에 `\r` 이 섞인다. 키 ID 가 파일 경로(`AuthKey_${ASC_KEY_ID}.p8`)에 들어가므로 형식 검증 없이 쓰면 경로 조작 여지가 있고, 원본 키가 `AuthKey.p8` 이 아닌 `AuthKey_<ID>.p8` 이름일 수도 있으며, 중간 실패 시 반쯤 쓰인 `ios.env` 가 남으면 다음 실행이 SKIP 해 버린다.
- **Fix:** `export` 접두사 허용 + 제거 · `tr -d '\r'` · `ASC_KEY_ID` 영숫자 가드(아니면 값 없이 ERROR) · `AuthKey.p8` 없으면 `AuthKey_<ID>.p8` 대체 탐색 · `.ios.env.new`(600)에 쓴 뒤 `mv` 로 원자적 교체 · 임시 파일은 `$REL` 안에서 만들고 모든 오류 경로에서 삭제. 출력은 여전히 「OK/SKIP/ERROR + 경로」 뿐.
- **Files modified:** mobile/scripts/setup-release-secrets.sh
- **Verification:** 이전 실행기가 가짜 픽스처로 검증(픽스처 삭제) · 실제 사용자 실행 출력 「OK dir」「OK asc」 · 이 릴리스가 그 `ios.env` 로 성공
- **Committed in:** 1594d546 (Task 2 커밋)

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** 비밀 주입의 정확성·안전성 보강. 인터페이스(stages · 출력 규약) 무변경, 스코프 확장 없음.

## Issues Encountered

- 없음 — ⑪(c) 실패 분기(번들 ID 없음 · sigh 403 · archive 계정 인증 · ITMS-91053/Invalid Binary) 어느 것도 발생하지 않았다. 업로드 로그에 ITMS 경고 없음. Apple 처리 후 경고 메일(예: 개인정보 매니페스트 ITMS-91053)이 오면 22-06 에서 기록한다 — `PrivacyInfo.xcprivacy` 는 여전히 Deferred.

## User Setup Required

- 이 플랜의 콘솔 선행(Task 1)과 비밀 주입(인증 게이트)은 완료됐다. 테스터 초대·기기 설치 확인은 22-06.

## Next Phase Readiness

- 22-04(Android 서명·업로드 키)가 같은 `mobile/Gemfile` · `build_numbers.rb` · `setup-release-secrets.sh` 위에 얹힌다.
- 22-06 은 TestFlight 처리 완료 · 내부 그룹 자동 배포 · 테스터 초대 · 실기 설치를 확인한다(D5).
- 주의: 같은 분 안 재실행은 같은 빌드 번호가 되어 스토어가 거절한다(FA-1) — 두 번째 업로드(22-07)는 1분 이상 간격.

## Self-Check: PASSED

- FOUND: mobile/Gemfile · mobile/Gemfile.lock · mobile/fastlane/build_numbers.rb · mobile/ios/App/fastlane/Fastfile · mobile/ios/App/fastlane/Appfile · mobile/scripts/setup-release-secrets.sh · mobile/scripts/release-ios.sh · mobile/scripts/check-ipa.sh
- FOUND: 커밋 1594d546
- FOUND: ~/Library/Developer/gh-trade-release/ios/App.ipa · build_number.txt = 202609270252
- 네 `<automated>` verify 모두 통과(fastlane 2.240.1 · Empty 엣지 exit 3 · 실제 릴리스 PROD CONFIG OK + IPA CHECK OK · pbxproj/Info.plist) · acceptance 9항 모두 통과

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*
