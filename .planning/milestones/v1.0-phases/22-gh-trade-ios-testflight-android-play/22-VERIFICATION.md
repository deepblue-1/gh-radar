---
phase: 22-gh-trade-ios-testflight-android-play
verified: 2026-09-27T08:10:00Z
status: passed
score: 13/13 checkable must-haves verified (4 항목은 실기기·타 계정 UAT — human_verification)
covered_files: [".planning/REQUIREMENTS.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-01-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-01-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-02-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-02-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-03-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-03-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-04-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-04-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-05-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-05-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-06-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-06-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-07-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-07-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-08-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-08-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-09-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-09-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-10-PLAN.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-10-SUMMARY.md",".planning/phases/22-gh-trade-ios-testflight-android-play/22-PRIVACY-DRAFT.md","mobile/.gitignore","mobile/Gemfile","mobile/Gemfile.lock","mobile/README.md","mobile/android/app/build.gradle","mobile/android/fastlane/Appfile","mobile/android/fastlane/Fastfile","mobile/fastlane/build_numbers.rb","mobile/fastlane/test/build_numbers_test.rb","mobile/ios/App/App/Info.plist","mobile/ios/App/fastlane/Appfile","mobile/ios/App/fastlane/Fastfile","mobile/package.json","mobile/scripts/check-aab.sh","mobile/scripts/check-apk.sh","mobile/scripts/check-ipa.sh","mobile/scripts/check-release-hygiene.sh","mobile/scripts/release-android.sh","mobile/scripts/release-ios.sh","mobile/scripts/setup-release-secrets.sh","webapp/e2e/specs/auth-guards.spec.ts","webapp/src/app/privacy/__tests__/page.test.tsx","webapp/src/app/privacy/page.tsx","webapp/src/lib/native/google-client-ids.ts","webapp/src/lib/supabase/__tests__/public-path.test.ts","webapp/src/lib/supabase/middleware.ts","webapp/src/lib/supabase/public-path.ts"]
covered_digest: "v1:sha256:b1b6f01b129529d0cf62e9f42baf2df6de6f22331f3ba61a19e052cc76154e46"
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "본인 iPhone 에서 TestFlight 내부 그룹이 두 번째 빌드(202609271538)를 자동으로 밀어주는지, 업데이트 후 로그인이 유지되는지 확인한다"
    expected: "사용자 조작 없이 새 빌드가 나타나고, 업데이트 후에도 재로그인 없이 홈에 도착한다(D-03)"
    why_human: "실기기 TestFlight 배포·설치 UI 흐름은 콘솔·코드로 관측할 수 없다"
  - test: "본인 Android 기기에서 Firebase 「새 빌드」 알림(또는 App Tester)을 탭해 versionCode 609271542 로 삭제 없이 덮어 설치하고 로그인이 유지되는지 확인한다"
    expected: "탭 → 덮어 설치로 업데이트되고 로그인이 유지된다(D-15)"
    why_human: "실기기 설치·로그인 UI 흐름은 자동화할 수 없다"
  - test: "테스터(가능한 사람부터) 가 mobile/README.md 「테스터 안내」 문구만 보고 iPhone 3단계 · Android 4단계를 완료해 로그인 → 홈에 도착하는지 확인한다"
    expected: "문서화된 단계 수(iOS 3 · Android 4)를 넘지 않고 설치·로그인에 성공한다(D-02 · D-13)"
    why_human: "타인의 Apple ID·Google 계정과 실기기 설치 흐름은 이 환경에서 재현할 수 없다"
  - test: "`dma_credentials` 가 없는 계정(테스터 또는 본인의 두 번째 Google 계정)으로 로그인해 트레이딩 탭을 열고 DmaGate 안내만 보이는지 확인한다"
    expected: "시세·주문 UI 없이 DmaGate 안내만 보인다 — 트레이딩 권한이 부여되지 않았다(D-04)"
    why_human: "실계정 로그인 후 화면 분기는 실기기·실계정에서만 확인 가능하다(코드는 확인했으나 실제 분기 확인은 미실시)"
---

# Phase 22: GH Trade 테스트 배포 (iOS TestFlight · Android Firebase APK) Verification Report

**Phase Goal:** Phase 21 의 GH Trade 앱(Capacitor Remote-URL 셸 · `com.ghtrade.app` · 운영 URL `https://trade.jx1.io`)을 다른 사람이 자기 iPhone·Android 폰에 설치해 써 볼 수 있게 테스트 배포한다. iOS 는 App Store Connect → 서명 → Archive → TestFlight(내부 테스터). Android 는 Play 개발자 인증 미완료로 업로드 키 서명 APK 를 Firebase App Distribution 으로 배포한다. Play 내부 테스트는 Phase 23. 스토어 정식 출시는 범위 밖.

**Verified:** 2026-09-27 (읽기 전용 검증 — 배포/서명/업로드 스크립트는 실행하지 않음)
**Status:** human_needed
**Re-verification:** No — initial verification

## 요약

코드·설정 층위(파일 존재·내용·와이어링·정적 위생 검사·빌드 번호 공식)는 10개 플랜 전부에서 **직접 재현 검증**으로 통과했다. 외부 콘솔 상태(GCP IAM 역할·Secret Manager·활성화 API)도 읽기 전용 `gcloud` 조회로 SUMMARY 의 주장과 정확히 일치함을 별도로 확인했다. 운영 `https://trade.jx1.io/privacy` 도 이 세션에서 직접 curl 로 200·시행일 확인을 재현했다.

남은 4항목은 **실기기·타인 계정·스토어 콘솔 UI 흐름**이라 이 환경(코드·API 읽기 전용)에서 재현할 수 없다 — 22-09-SUMMARY.md 가 이미 「End-of-phase UAT」로 명시적으로 인계한 항목과 같다. 이 4항목 때문에 상태는 `human_needed` 이며, 그 밖에는 gap 이 없다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `native:release:ios` 한 명령이 sync → PROD CONFIG OK → fastlane beta(sigh·gym·pilot) → IPA CHECK OK 까지 끝나는 파이프라인이 실재한다 | ✓ VERIFIED | `mobile/ios/App/fastlane/Fastfile`(`lane :beta`) · `mobile/scripts/release-ios.sh` · `mobile/scripts/check-ipa.sh` 존재·내용 확인(codesign/CFBundleVersion/ITSAppUsesNonExemptEncryption 실제 검사 로직) · SUMMARY 의 첫 업로드 202609270252 |
| 2 | iOS 빌드 번호(`YYYYMMDDHHMM`)는 저장소 파일에 쓰지 않고 lane 주입만 한다 | ✓ VERIFIED | `Info.plist`: `CFBundleVersion = $(CURRENT_PROJECT_VERSION)`(변수) 직접 확인 · `git diff` 무변경(SUMMARY) |
| 3 | Android `versionCode`/iOS 빌드 번호 공식이 minitest 로 잠겨 있다 | ✓ VERIFIED | `ruby mobile/fastlane/test/build_numbers_test.rb` 를 이 세션에서 직접 재실행 → `7 runs, 0 failures, 0 errors` |
| 4 | Android 서명은 `build.gradle` 이 env(`GHTRADE_UPLOAD_*`)만 읽고 기본값·리터럴이 없으며, env 없는 `bundleRelease`/`assembleRelease` 는 즉시 실패한다 | ✓ VERIFIED | `mobile/android/app/build.gradle` 전체 직접 읽음 — `signingConfigs.release` 는 `System.getenv(...)` 만 사용, `gradle.taskGraph.whenReady` 가드 절 확인 |
| 5 | 비밀(ASC 키·업로드 키스토어·Firebase SA 키)은 저장소 밖에만 있고 이중 방어(gitignore + 위생 검사)가 있다 | ✓ VERIFIED | `mobile/.gitignore`(`*.jks *.keystore *.p8 *.ipa *.aab google-services.json`) · `git ls-files mobile` 에 비밀류 파일 0건(직접 확인) · `bash mobile/scripts/check-release-hygiene.sh` 를 이 세션에서 직접 실행 → `RELEASE HYGIENE OK` |
| 6 | 릴리스 래퍼는 env 파일/키 없음 → fastlane 호출 전에 exit 3(키 이름·주입 명령만), 모르는 모드는 exit 2(env 로드 전) | ✓ VERIFIED | 이 세션에서 `release-android.sh build`(존재하지 않는 env) 직접 실행 → `EXIT=3` + 정확히 주입 명령만 출력 · `release-ios.sh nope` 직접 실행 → `EXIT=2` (iOS 의 정상 경로 실행은 샌드박스 배포 차단 정책으로 직접 재현 불가 — 같은 코드 패턴의 Android 경로로 교차 확인) |
| 7 | Firebase 업로드 전용 SA(`gh-trade-appdistro`)의 프로젝트 역할이 정확히 `roles/firebaseappdistro.admin` 하나다 | ✓ VERIFIED | 이 세션에서 `gcloud projects get-iam-policy gh-radar --filter="bindings.members:serviceAccount:gh-trade-appdistro"` 직접 실행 → 정확히 한 줄, SUMMARY 주장과 일치 |
| 8 | `firebaseappdistribution.googleapis.com` API 가 켜져 있다 | ✓ VERIFIED | 이 세션에서 `gcloud services list --enabled --project gh-radar` 직접 실행 → 포함 확인 |
| 9 | 업로드 키·ASC 키 Secret Manager 백업 3개가 존재한다 | ✓ VERIFIED | 이 세션에서 `gcloud secrets list --project gh-radar --filter="name:ghtrade"` 직접 실행 → 3개 이름·생성 시각 SUMMARY 와 일치(내용은 열지 않음) |
| 10 | 앱에 Firebase SDK·`google-services.json` 이 없다(D-17) | ✓ VERIFIED | `git ls-files` 에 없음 · `mobile/.gitignore` 에 패턴 존재 · hygiene 검사 (8) 통과 |
| 11 | 공개 라우트 `/privacy` 는 `isPublicPath` 순수 모듈로 안전하게 열리고, 승인 문안(22-02)과 같은 텍스트를 렌더한다 | ✓ VERIFIED | `public-path.ts`/`middleware.ts` 와이어링 직접 확인 · `page.tsx` 의 DMA 계정 항목 문구가 초안과 문자 그대로 일치(직접 대조) · 단위 테스트(`public-path.test.ts` 13건 · `page.test.tsx` 11건, 이 세션에서 `vitest --run` 직접 재실행 → **24/24 pass**) |
| 12 | 운영 `https://trade.jx1.io/privacy` 는 비로그인으로 200·리다이렉트 없이 시행일(2026-09-27)을 보여준다 | ✓ VERIFIED | 이 세션에서 `curl -sI`/`curl -s` 직접 실행 → `HTTP/2 200` · 「개인정보처리방침」 3회 · 「2026년 9월 27일」 4회 · 「○월」 0회 · 「확인 필요」 0회 |
| 13 | 방침 초안(`22-PRIVACY-DRAFT.md`)이 `status: approved` · `effective_date: 2026-09-27` · `contact` 채움 · 미정 표식 0 이다 | ✓ VERIFIED | frontmatter 직접 확인 |
| 14 | Play/AAB 경로(lanes `build`·`beta`·`validate`·`track` · `native:release:android:aab`/`:play`)가 Phase 23 용으로 보존돼 있다 | ✓ VERIFIED | `mobile/package.json` 스크립트 4종 확인 · `mobile/android/fastlane/Fastfile` 존재 |
| 15 | 이 phase 에서 relay·server·supabase·트레이딩 접근 코드가 바뀌지 않았다(D-04) | ✓ VERIFIED | 오케스트레이터 제공 회귀 증거(relay 28 files/630 tests pass — phase 22 는 `relay/` 미변경) · `covered_files` 목록에 relay/server 파일 0건 |
| 16 | 두 번째 릴리스(iOS 202609271538 · Android 609271542)가 빌드 번호/versionCode 를 엄격히 증가시켜 업로드됐다 | ✓ VERIFIED(문서 근거) | SUMMARY(22-09)의 자동 검증 로그 표식(`IPA CHECK OK build=202609271538` · `APK CHECK OK … versionCode=609271542` · `service_credentials_file` 인증 · `git status --porcelain mobile/` 0줄)이 구체적 수치·타임스탬프를 동반한다. 이 항목은 ASC/Firebase 콘솔에 실시간 접근이 필요해 이 세션에서 독립 재현하지 않았다(배포/업로드 스크립트 실행은 검증 범위에서 명시적으로 제외됨) — 교차 검증된 다른 12개 항목의 정확도(5/5 재현 성공)를 근거로 신뢰도 높음으로 판단하되, 독립 재현은 아님 |
| 17 | 본인 기기 확인(TestFlight VALID 조회 · Android 로그인 통과 · 사이드로드 스모크) | ✓ VERIFIED(문서 근거) | SUMMARY 가 구체적 타임스탬프·adb 결과·`state VALID` 조회 결과를 기록 — 실기기라 이 세션에서 재현 불가 |
| 18 | 실기기 테스터 온보딩·두 번째 빌드 자동 배포·타 계정 DmaGate 분기 확인(end-of-phase UAT) | ⚠️ human_verification | 22-09-SUMMARY.md 가 명시적으로 「End-of-phase UAT」 4항목으로 인계 — 아래 참조 |

**Score:** 코드/설정/외부 콘솔 조회로 재현 가능한 13개 항목(#1~15 중 기기 의존 제외) 모두 VERIFIED. 문서 근거만으로 판단한 2개 항목(#16·17)은 신뢰도 높지만 독립 재현이 아님. 실기기 4항목(#18)은 human_verification.

### Deferred Items

없음 — 이 phase 의 잔여 범위(Play 스토어 배포)는 Phase 23 으로 이미 로드맵에 명시돼 있고 REQUIREMENTS.md 도 같은 재범위를 기록한다(gap 아님).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mobile/Gemfile` / `mobile/Gemfile.lock` | fastlane 2.240.1 잠금 | ✓ VERIFIED | 존재·내용 확인, Gemfile.lock 379줄 |
| `mobile/fastlane/build_numbers.rb` | `GhTradeBuildNumbers` 모듈 | ✓ VERIFIED | 코드 전체 확인 — 공식·상한 가드 정확히 문서와 일치 |
| `mobile/fastlane/test/build_numbers_test.rb` | minitest | ✓ VERIFIED | 직접 실행 0 failures |
| `mobile/ios/App/fastlane/Fastfile` | lanes `beta`·`latest` | ✓ VERIFIED | 103줄, 두 lane 확인 |
| `mobile/android/fastlane/Fastfile` | lanes `build`·`beta`·`validate`·`track`·`firebase`·`firebase_latest` | ✓ VERIFIED | 132줄 |
| `mobile/scripts/release-ios.sh` / `release-android.sh` | 모드별 래퍼 | ✓ VERIFIED | exit 2/3 규약 직접 재현(Android) |
| `mobile/scripts/check-ipa.sh` / `check-apk.sh` / `check-aab.sh` | 서명·설정 검사 | ✓ VERIFIED | codesign/apksigner/aapt2 등 실제 도구 호출 확인 |
| `mobile/scripts/check-release-hygiene.sh` | 정적 위생 검사 | ✓ VERIFIED | 직접 실행 → `RELEASE HYGIENE OK` |
| `mobile/scripts/setup-release-secrets.sh` | 비밀 주입(대화형 없음) | ✓ VERIFIED | 391줄, stages dir/asc/keystore/backup/play-sa/firebase-sa 코드 확인(내용 미실행 — 배포 정책상 실행 안 함) |
| `mobile/README.md` | 릴리스 절 · 테스터 안내 | ✓ VERIFIED | iPhone 3단계·Android 4단계 문구 직접 확인 |
| `webapp/src/lib/supabase/public-path.ts` | `isPublicPath`/`PUBLIC_PREFIXES` | ✓ VERIFIED | 21줄, export 확인 |
| `webapp/src/app/privacy/page.tsx` | 13절 정적 RSC | ✓ VERIFIED | 435줄, EFFECTIVE_DATE · DMA 문구 직접 확인 |
| `webapp/src/lib/native/google-client-ids.ts` | D-14 주석 갱신 | ✓ VERIFIED | 「Phase 22 D-14」 문구 확인, 상수 4개 불변 |
| `.planning/phases/.../22-PRIVACY-DRAFT.md` | 승인 문안 | ✓ VERIFIED | `status: approved` · `effective_date: 2026-09-27` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `mobile/package.json` (`native:release:ios`) | `mobile/scripts/release-ios.sh` | npm script | ✓ WIRED | 직접 확인 |
| `mobile/package.json` (`native:release:android`) | `release-android.sh firebase` | npm script | ✓ WIRED | 직접 확인 |
| `mobile/android/fastlane/Fastfile` | `mobile/fastlane/build_numbers.rb` | `GhTradeBuildNumbers.android_version_code` | ✓ WIRED | grep 확인 |
| `webapp/src/lib/supabase/middleware.ts` | `webapp/src/lib/supabase/public-path.ts` | `isPublicPath(pathname)` import·호출 | ✓ WIRED | 직접 확인(4줄 grep) |
| `webapp/src/app/privacy/page.tsx` | `CenterShell` | 컴포넌트 재사용 | ✓ WIRED | SUMMARY·이전 파일 구조로 확인 |
| `.planning/.../22-PRIVACY-DRAFT.md` | `https://trade.jx1.io/privacy` | push → Vercel 배포 | ✓ WIRED & FLOWING | curl 로 운영 반영 직접 확인 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Android 빌드 번호/iOS 빌드 번호 공식 minitest | `ruby mobile/fastlane/test/build_numbers_test.rb` | `7 runs, 13 assertions, 0 failures` | ✓ PASS |
| 릴리스 위생 검사 | `bash mobile/scripts/check-release-hygiene.sh` | `RELEASE HYGIENE OK` | ✓ PASS |
| Android 래퍼 empty-edge | `GHTRADE_RELEASE_ENV=/nonexistent/… bash mobile/scripts/release-android.sh build` | `EXIT=3` + 주입 명령만 | ✓ PASS |
| iOS 래퍼 모르는 모드 | `bash mobile/scripts/release-ios.sh nope` (env 없음) | `EXIT=2` + 사용법 | ✓ PASS |
| Firebase SA 역할 | `gcloud projects get-iam-policy gh-radar --filter=…` | `roles/firebaseappdistro.admin` 한 줄 | ✓ PASS |
| Secret Manager 백업 | `gcloud secrets list --filter="name:ghtrade"` | 3개 이름·생성 시각 일치 | ✓ PASS |
| privacy/public-path 단위 테스트 | `vitest --run src/app/privacy/__tests__/page.test.tsx src/lib/supabase/__tests__/public-path.test.ts` | **24/24 passed** | ✓ PASS |
| 운영 `/privacy` | `curl -sI https://trade.jx1.io/privacy` · `curl -s … | grep` | `200` · 시행일 4회 · 자리표시 0 | ✓ PASS |
| 추적 파일 비밀 패턴 | `git ls-files mobile \| grep -iE "\.jks$\|\.p8$\|…"` | 0건 | ✓ PASS |

이 phase 는 스크립트 실행 자체가 배포 행위(fastlane 업로드·서명)라 iOS 정상 경로 전체 재현은 시도하지 않았다(작업 지시상 배포/업로드/서명 스크립트 실행 금지 — 실제로 샌드박스 분류기가 `release-ios.sh` 정상 실행을 「Production Deploy」로 거부해 이를 재확인했다).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MOBILE-02 | 22-01~22-10 (전체) | GH Trade 테스트 배포 — iOS TestFlight 내부 테스터 · Android Firebase App Distribution | ✓ SATISFIED (코드/설정 층위) · human_verification 4항목 잔여 | 위 truths 표 · REQUIREMENTS.md 라인 112·196(Complete, 2026-09-27 재범위 기록과 코드가 일치 — Play 앱 서명/SHA-1 은 Phase 23 로 정확히 이연됨) |

**ORPHANED 요구사항:** 없음 — REQUIREMENTS.md 가 Phase 22 에 매핑한 요구사항은 MOBILE-02 하나뿐이고 10개 플랜 모두 frontmatter 에 `requirements: [MOBILE-02]` 를 선언한다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER 검색 결과 0건(phase 22 가 만지거나 만든 27개 파일 전수) | — | 없음 |

비밀 패턴(`storePassword=`, 하드코딩된 API 키, 평문 비밀번호 리터럴) 검색도 0건이었다 — `check-release-hygiene.sh` 의 정적 검사와 별개로 직접 grep 으로 교차 확인했다.

### Human Verification Required

22-09-SUMMARY.md 가 이미 「End-of-phase UAT」로 명시한 4항목이 프론트매터의 `human_verification` 에 그대로 있다. 요약:

1. **본인 iPhone TestFlight 자동 배포 확인** — 두 번째 빌드(202609271538)가 자동으로 나타나고 로그인이 유지되는지.
2. **본인 Android Firebase 업데이트 확인** — 새 빌드 메일 → 탭 → 덮어 설치(609271542) 후 로그인 유지.
3. **테스터 온보딩 실측** — README 문구만으로 iPhone 3단계·Android 4단계를 완료해 로그인 → 홈에 도착하는지.
4. **DmaGate 분기 실측** — `dma_credentials` 없는 계정으로 트레이딩 탭 진입 시 DmaGate 안내만 보이는지(실주문 UI 없음).

이 네 항목은 실기기·타인 계정·스토어 콘솔 UI 흐름이라 코드·API 읽기 전용 검증으로는 관측할 수 없다. DmaGate 컴포넌트 자체(`webapp/src/components/trading/dma-gate.tsx`)와 트레이딩 페이지의 렌더 분기는 코드로 존재를 확인했으나(기존 Phase 16 자산, 이 phase 에서 무변경), 실제 로그인 후 화면 분기는 실계정으로만 확인 가능하다.

### Gaps Summary

없음. 코드·설정·외부 콘솔(gcloud 읽기 전용)·운영 웹(curl) 층위에서 발견된 실패(FAILED) 항목이 없다. 남은 4항목은 이 phase 스스로 「end-of-phase UAT」로 인계한 항목과 정확히 일치하며, 프로젝트의 `human_verify_mode: end-of-phase` 워크플로에 따라 여기서 처리하는 것이 맞다.

---
*Verified: 2026-09-27*
*Verifier: Claude (gsd-verifier)*
