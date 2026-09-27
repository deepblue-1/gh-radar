---
phase: "22"
slug: "gh-trade-ios-testflight-android-play"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-27"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 정본 출처: `22-RESEARCH.md` §Validation Architecture (MOBILE-02a~o) · **2026-09-27 재범위 뒤 Android 는 §「재범위 부록」 Validation Architecture (부록) V-F1~V-F16 이 정본**(MOBILE-02g 는 `native:release:android:aab` 회귀로만 · 02m · 02n 의 Play 설치본 부분은 Phase 23). Per-Task Verification Map 은 플래너가 PLAN 확정 시 채운다(Phase 21 방식).
>
> **재범위(2026-09-27):** 22-01~22-04 는 실행 완료(행 유지). 옛 22-05~22-07(Play 경로) 행은 `.planning/phases/23-gh-trade-play/from-phase-22/` 로 이관된 플랜과 함께 이 표에서 뺐고, 같은 번호 22-05~22-10 을 Firebase APK 경로 · iOS 잔여 · 공통 마감 플랜으로 다시 채웠다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (웹 단위)** | Vitest ^2.1.9 + jsdom + @testing-library/react — `webapp/vitest.config.ts` · setup `webapp/tests/setup.ts` |
| **Framework (웹 e2e)** | Playwright ^1.59.1 — baseURL `http://localhost:3100` · 비로그인 스펙은 `e2e/specs/auth-guards.spec.ts` 의 파일 레벨 `storageState` 비우기 패턴 |
| **Framework (릴리스 파이프라인)** | bash 검사 스크립트(`mobile/scripts/check-ipa.sh` · `check-aab.sh` · `check-apk.sh`(22-07) · `check-release-hygiene.sh`) + `node mobile/scripts/verify-prod-config.mjs` + Ruby minitest(빌드 번호 함수 `mobile/fastlane/build_numbers.rb`) |
| **Framework (iOS release)** | fastlane 2.240.x(`mobile/Gemfile` · Ruby 4.0.2 · bundler 4.0.8) → gym(xcodebuild archive/export) → pilot(altool) · lane `latest`(22-06 · 처리 상태 조회) |
| **Framework (Android release — Phase 22)** | Gradle `assembleRelease`(환경변수 업로드 키 서명 · `-PghtradeVersionCode`) → `check-apk.sh`(apksigner · aapt2 — v2 전용 APK 라 JDK 서명 도구 불가) → `firebase_app_distribution`(fastlane 플러그인 1.0.x · 전용 SA `service_credentials_file`) |
| **Framework (Android release — 보존 · Phase 23)** | Gradle `bundleRelease` → supply(`upload_to_play_store track:internal`) · check-aab(JDK 서명 도구) — `native:release:android:aab` · `:play` |
| **Config file** | `webapp/vitest.config.ts` · `webapp/playwright.config.ts` · `mobile/package.json`(`native:*`) · `mobile/Gemfile`(+ Firebase 플러그인) · `mobile/ios/App/fastlane/Fastfile` · `mobile/android/fastlane/Fastfile` |
| **Quick run command** | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy src/lib/supabase` |
| **Full suite command** | `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp run typecheck` |
| **e2e command** | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/auth-guards.spec.ts` |
| **iOS release command** | `pnpm --filter @gh-radar/mobile run native:release:ios` (sync 양쪽 → verify-prod → lane `beta` → check-ipa · 수 분 · Wave 단위) |
| **Android release command** | `pnpm --filter @gh-radar/mobile run native:release:android`(APK → check-apk → Firebase · 22-07 부터 기본) / `native:release:android:aab`(AAB 빌드만 · check-aab · 보존) / `native:release:android:play`(Play · Phase 23) · 보조 `bash mobile/scripts/release-android.sh firebase-latest|check-apk` · `bash mobile/scripts/release-ios.sh latest` |
| **Estimated runtime** | 웹 단위 ~20–40초 · webapp 전체 ~2분 · auth-guards e2e ~1분 · hygiene/verify-prod/check-apk 수 초 · iOS archive+upload 5–10분 · Android assembleRelease+Firebase 업로드 2–5분 |

---

## Sampling Rate

- **After every task commit:** 웹 태스크 = `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy src/lib/supabase`(+ e2e 태스크면 `auth-guards.spec.ts -g privacy`) · 네이티브 설정 태스크 = `bash mobile/scripts/check-release-hygiene.sh` + `node mobile/scripts/verify-prod-config.mjs`
- **After every task commit (재범위 Android · 22-05 이후):** `bash mobile/scripts/check-release-hygiene.sh` + 해당 태스크의 네트워크 없는 엣지 검사(V-F1 잠금 · V-F3 보존 · V-F4 래퍼 exit 2/3 · V-F6 check-apk 음성) — 모두 수 초
- **After every plan wave:** 웹 full suite + typecheck + `auth-guards.spec.ts` · 네이티브 Wave 는 `release-android.sh check-apk`(업로드 없이) · 업로드 태스크는 V-F7 · V-F8 · V-F9 · V-F11 · iOS 는 `release-ios.sh latest`
- **Before `/gsd-verify-work`:** 위 전부 green + iOS·Android(Firebase) 실제 업로드 1회씩(02l · V-F7) + 두 번째 빌드 업로드 1회씩(D-03 · D-15 · V-F10) + V-F13(SA 최소 권한) · V-F15(TestFlight VALID) · V-F16(push 게이트) + Manual-Only UAT 승인
- **Max feedback latency:** 웹 40초 · 릴리스 파이프라인은 빌드·업로드 시간이 지배(Wave 단위)

---

## Per-Task Verification Map

테스트 ID `MOBILE-02a~o` 는 RESEARCH §Validation Architecture 정의. 위협 ID `T-22-NN` 은 각 PLAN `<threat_model>` 정의(T-22-01 비밀 저장소 유입 · 02 비밀 로그 출력 · 03 산출물 저장소 잔류 · 04 dev 설정 릴리스 혼입 · 05 Play 서명×Google 로그인 · 06 테스터 실돈 경로 · 07 빌드 번호 파일 기록 · 08 방침 부정확·미승인 · 09 결합 변경 섞인 push · 10 Play SA 과권한 · 11 업로드 키 분실·덮어쓰기 · 12 공개 prefix 경계 · 13 Secret Manager 접근 · 14 ASC 테스터 역할 · 15 동의 화면·가입 정책 · 17 문서 이메일 · 18 `/privacy` 결합 · 19 다른 키 AAB/APK · 20 Firebase 업로드 SA 키 · 21 owner ADC 폴백 · 22 엉뚱한 APK 업로드 · 23 1시간 다운로드 링크 노출 · 24 운영 프로젝트 Firebase 추가 표면 · 25 google-services.json 유입 · 26 에뮬레이터 release 판 잔류 · 27 Firebase SHA-1 × GCP 클라이언트 쌍 중복 · 28 모르는 모드가 업로드로 떨어짐 · 29 다른 세션 커밋 동반 push · SC RubyGems 공급망). V-F* 는 RESEARCH 재범위 부록 Validation Architecture (부록). 엣지 프로브 FA-1~5 는 22-01 「Flagged assumptions」 표. Checkpoint 태스크의 자동 명령은 사람 작업 **뒤** 실행기가 돌리는 사후 확인이다.

| Task ID | Plan | Wave | Requirement | Test ID | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | MOBILE-02 | — (콘솔 선행 · D-01 · D-02 A2 · D-10) | — | 계정 개설 없음 · 번들 ID·ASC 레코드·내부 그룹(자동 배포)만 | checkpoint:human-action | `security find-identity -v -p codesigning` 에 `Apple Distribution: …(954QPCS3F5)` (제시 전 · 콘솔 결과는 22-01-02 sigh·pilot 이 사후 확인) | ✅ | ✅ green |
| 22-01-02 | 01 | 1 | MOBILE-02 | 02d · 02h · 02i(iOS) · 02l(업로드) · FA-2 | T-22-01 · 02 · 03 · 04 · 07 · SC | env 누락 시 fastlane 전 exit 3·이름만 · 비밀은 사용자 `!`(인증 게이트) · 산출물 저장소 밖 · IPA 배포 서명·키체인 엔타이틀먼트·운영 URL · 빌드 번호 무기록 | tracer (smoke + artifact) | `cd mobile && PATH=/opt/homebrew/opt/ruby/bin:$PATH bundle exec fastlane --version` · `GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-missing-vars bash mobile/scripts/release-ios.sh` (exit 3) · `pnpm --filter @gh-radar/mobile run native:release:ios` · `git diff --quiet -- mobile/ios/App/App.xcodeproj/project.pbxproj` + PlistBuddy `CFBundleVersion`/`ITSAppUsesNonExemptEncryption` | ❌ 태스크가 생성 | ✅ green |
| 22-02-01 | 02 | 1 | MOBILE-02 | 02c(문안 선행) | T-22-08 · 17 | 코드 근거 재확인 · 이메일 0 · 웹 코드 미변경 | doc + grep | 22-02-PLAN Task 1 verify 1(13절·부록 제목 grep → `DRAFT OK`) · verify 2(근거 파일 `test -f` → `EVIDENCE OK`) | ❌ 태스크가 생성 | ✅ green |
| 22-02-02 | 02 | 1 | MOBILE-02 | — (D-11 문안 검토 게이트) | T-22-08 | 승인 전 웹 코드 반영 금지 · blocking-human | checkpoint:decision | 초안 `status:` · 「부록 B.」 존재 grep(제시 전) | ✅(22-02-01) | ✅ green |
| 22-02-03 | 02 | 1 | MOBILE-02 | 02c(문안 확정) | T-22-08 | 미정 표식 0 · 승인 날짜·시행일 | grep | `grep -q "^status: approved" 22-PRIVACY-DRAFT.md` + 미정 표식 0 → `APPROVED OK` | ✅(22-02-01) | ✅ green |
| 22-03-01 | 03 | 2 | MOBILE-02 | 02b | T-22-12 | 공개 prefix 경계(`/privacyx`·`/privacy-x` 차단) · 로그인 분기 불변 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/supabase/__tests__/public-path.test.ts` · `pnpm --filter @gh-radar/webapp run typecheck` | ❌ 태스크가 생성 | ✅ green |
| 22-03-02 | 03 | 2 | MOBILE-02 | 02a · 02c | T-22-08 · 12 · 18 | 승인 문안 그대로 · 정적 RSC(요청·훅 0) · 웹 변경 6파일 이내 | unit + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy/__tests__/page.test.tsx src/lib/supabase/__tests__/public-path.test.ts` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/auth-guards.spec.ts` | ❌ 태스크가 생성(spec 은 ✅ · 케이스 신규) | ✅ green |
| 22-04-01 | 04 | 2 | MOBILE-02 | 02e · 02f · 02j · 02k(권한) · FA-1 · FA-4 | T-22-01 · 02 · 07 · 11 | build.gradle 비밀 기본값 0 · env 없이 디버그 통과·릴리스 가드 실패 · 키스토어 SKIP(덮어쓰기 없음) · 비대화형 | unit + build + static | `/opt/homebrew/opt/ruby/bin/ruby mobile/fastlane/test/build_numbers_test.rb` · `pnpm --filter @gh-radar/mobile run native:build:android` · `env -u GHTRADE_UPLOAD_STORE_FILE ./gradlew bundleRelease`(실패 기대) · 더미 키스토어 SKIP 테스트 · `bash mobile/scripts/check-release-hygiene.sh` | ❌ 태스크가 생성 | ✅ green |
| 22-04-02 | 04 | 2 | MOBILE-02 | 02k | T-22-01 · 11 · 13 | 키스토어·비밀번호 사용자 `!` 생성 · 600/700 · Secret Manager 백업(값 미열람) | checkpoint:human-action | `bash mobile/scripts/check-release-hygiene.sh` + `gcloud secrets describe gh-radar-ghtrade-upload-keystore --format='value(name)'` | ✅(22-04-01) | ✅ green |
| 22-04-03 | 04 | 2 | MOBILE-02 | 02g · 02d(Android) · FA-2 | T-22-02 · 04 · 07 | fastlane 에 서명 속성 미전달 · 업로드 키 서명 AAB · 운영 URL · 저장소 파일 무변경 | smoke + artifact | `GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-missing-vars bash mobile/scripts/release-android.sh build`(exit 3) · `pnpm --filter @gh-radar/mobile run native:release:android:aab` · `git diff --quiet -- mobile/android/app/build.gradle …` + hygiene | ❌ 태스크가 생성 | ✅ green |
| 22-05-01 | 05 | 1(재범위) | MOBILE-02 | V-F12(부분) · V-F13(선행) | T-22-01 · 02 · 20 · 25 | firebase-sa 단계: 단일 역할 `roles/firebaseappdistro.admin` · 키 600 · 값 비출력 · 백업 없음 · 모르는 stage exit 2 · 디렉터리 없음이면 gcloud 전에 ERROR · 위생: ignore 21경로 · google-services.json 부재 · Firebase SA 키 권한 · Firebase 호출 자격 명시 불변식 | static + unit(셸) | `bash -n` 2개 · `setup-release-secrets.sh nope`(exit 2 · usage 에 firebase-sa) · `GHTRADE_RELEASE_DIR=/nonexistent/… … firebase-sa`(ERROR · `OK gcloud` 없음) · `check-release-hygiene.sh`(ignore 21경로) · 임시 `android/app/google-services.json` → FAIL · 임시 644 SA 키 → FAIL | ❌ 태스크가 생성 | ✅ green |
| 22-05-02 | 05 | 1(재범위) | MOBILE-02 | — (D-17 one-way 결정) | T-22-24 | Firebase 를 붙일 GCP 프로젝트를 사람이 결정 · 부수 효과 목록 고지 · blocking | checkpoint:decision | `gcloud services list --enabled --project gh-radar` 의 firebase·identitytoolkit·appdistribution 0건(제시 전 사전 상태) | ✅ | ✅ green |
| 22-05-03 | 05 | 1(재범위) | MOBILE-02 | V-F13 · (Manual) | T-22-15 · 20 · 24 · 25 · 27 | Firebase 추가 · Android 앱(SHA-1 비움) · 「시작하기」 · 그룹(본인 1명) · `! firebase-sa` · GCP Android 클라이언트(업로드 SHA-1) · 동의 화면 상태 · 웹 로그인 회귀 | checkpoint:human-action | hygiene + SA 키 `stat` 600 + `gcloud projects get-iam-policy` 역할 = `roles/firebaseappdistro.admin` 한 줄 + `firebaseappdistribution.googleapis.com` enabled | ✅(22-05-01) | ✅ green |
| 22-06-01 | 06 | 1(재범위) | MOBILE-02 | V-F15(엣지) | T-22-02 · 28 | 모르는 모드 exit 2(env 로드 전) · env 누락 exit 3 · 인자 없음 = beta · latest 는 조회 전용(업로드·아카이브·프로파일 액션 없음) | unit(셸) + static | `bash -n release-ios.sh` · `GHTRADE_RELEASE_ENV=/nonexistent/… release-ios.sh nope`(2) · `… latest`(3 · lane 미시작) · 인자 없음(3) | ❌ 태스크가 생성 | ✅ green |
| 22-06-02 | 06 | 1(재범위) | MOBILE-02 | V-F15 · 02l | T-22-07 | 22-01 빌드 202609270252 가 VALID(처리 완료) · 프로젝트 파일 무변경 | integration | `bash mobile/scripts/release-ios.sh latest` → `latest TestFlight build 202609270252 state VALID` · `git status --porcelain -- Info.plist pbxproj` 빈 출력 | ✅(22-06-01) | ✅ green |
| 22-07-01 | 07 | 2(재범위) | MOBILE-02 | V-F1 · V-F2 · V-F7 · V-F8 · V-F11(부분) | T-22-02 · 04 · 11 · 19 · 21 · 22 · 23 · SC | tracer: `native:release:android` → 업로드 키 서명 APK → APK CHECK OK(sha1 2fe3…7b7d) → 전용 SA 파일 인증 업로드 · ADC 줄 없음 · 명시 경로 · 로그 저장소 밖 · 프로젝트 파일 무변경 | tracer (e2e + artifact) | Gemfile.lock grep(플러그인 1.0.x · fastlane 2.240.1 · Pluginfile 없음) · `fastlane action firebase_app_distribution` · `native:release:android` 로그 표식 5종 · `git status --porcelain -- build.gradle Info.plist pbxproj` + hygiene | ❌ 태스크가 생성 | ✅ green |
| 22-07-02 | 07 | 2(재범위) | MOBILE-02 | V-F3 · V-F4 · V-F5 · V-F6 · V-F9 · V-F12 | T-22-19 · 21 · 22 · 28 | 기본 모드 firebase · firebase-latest · check-apk · 엣지 exit 2/3(fastlane 전) · check-apk 음성(debug APK · 없는 파일 · 틀린 SHA-1) · 소문자 SHA-1 정규화 · 최신 릴리스 = 트레이서 versionCode · gradle 가드(assembleRelease) · Play/AAB 보존 | unit(셸) + build + integration | `release-android.sh nope`(2) · `GHTRADE_RELEASE_ENV=/nonexistent… firebase`(3) · `FIREBASE_APPDISTRO_SA_JSON=/nonexistent… firebase`(3 · firebase-sa 안내) · `check-apk.sh app-debug.apk`(1 · debuggable · 업로드 키) · `firebase-latest` · `check-apk` 모드 · `env -u GHTRADE_UPLOAD_STORE_FILE ./gradlew assembleRelease` · 보존 grep + beta exit 3 | ❌ 태스크가 생성 | ✅ green |
| 22-07-03 | 07 | 2(재범위) | MOBILE-02 | V-F14(자동 부분) | T-22-26 | debug 판 제거 → release APK 설치 Success · versionCode 일치 · 실행 · release 판 제거(복원) | smoke | adb install/dumpsys/`am start -W` → `SIDELOAD SMOKE OK` · uninstall 후 `pm list packages` 빈 출력 | ❌ 태스크가 실행 | ✅ green |
| 22-08-01 | 08 | 3(재범위) | MOBILE-02 | — (D-02 · D-03 · D-13 · D-14 · D-15 · D-18 문서) | T-22-02 · 17 | README 필수 문구 15개 · 이메일·비밀 패턴 0 · client-ids 상수 origin/master 대비 불변 · D-14 주석 | unit + grep | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/google-client-ids.test.ts` · README 문구 루프 + hygiene · `git show origin/master:…google-client-ids.ts` 대비 export diff 없음 | ✅ | ✅ green |
| 22-08-02 | 08 | 3(재범위) | MOBILE-02 | (Manual) 본인 Android 로그인 게이트 · 테스터 초대 | T-22-05 · 06 · 14 · 15 · 17 | 본인 Firebase 설치본 로그인 성공 뒤에만 테스터 초대 · ASC Marketing·앱 한정 · `dma_credentials` 미발급 · 명수만 기록 | checkpoint:human-action | `release-android.sh firebase-latest`(SA 유효) + README 이메일 0 + hygiene | ✅ | ✅ green |
| 22-09-01 | 09 | 4(재범위) | MOBILE-02 | 전 게이트 · V-F1 · V-F3 · V-F10 · V-F13 | T-22-01 · 21 | build · test · e2e · minitest · 위생 · SA 역할 정확히 하나 · 플러그인 잠금 · Play/AAB 보존 | full gates | build_command · test_command · `playwright test e2e/specs/auth-guards.spec.ts` · minitest + hygiene · `gcloud projects get-iam-policy`(읽기) · Gemfile.lock/Fastfile/package.json grep | ✅ | ✅ green |
| 22-09-02 | 09 | 4(재범위) | MOBILE-02 | V-F7 · V-F9 · V-F10 · V-F11 · V-F15 · 02i · 02l · FA-4 · FA-5 | T-22-04 · 06 · 07 · 21 · 23 | 두 번째 릴리스 iOS → Android 순서 · 번호 엄격 증가(N2 > N1 · VC2 > VC1 · ≤ 2,100,000,000) · TestFlight VALID · Firebase 최신 = VC2 · `git status --porcelain mobile/` 빈 출력 · PROD CONFIG OK · (UAT) 자동 배포 · 탭 설치 업데이트 · 테스터 절차 · DmaGate | integration + human-check | `native:release:ios`(build_number.txt 전후 비교) · `native:release:android`(ghtrade-version-code.txt 전후 비교 · 로그 표식) · `release-ios.sh latest` · `release-android.sh firebase-latest` · `git status` + `native:verify-prod` | ✅ | ✅ green |
| 22-10-01 | 10 | 5(재범위) | MOBILE-02 | 02c(시행일) · V-F16(부분) | T-22-08 | 시행일 네 곳 = push 날(KST) · 자리표시 0 · 승인 유지 · page RED→GREEN · STATE 현재 위치 이름 정정 | unit (tdd) | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy/__tests__/page.test.tsx src/lib/supabase/__tests__/public-path.test.ts` · typecheck · 날짜·자리표시 grep · STATE grep | ✅ | ✅ green |
| 22-10-02 | 10 | 5(재범위) | MOBILE-02 | V-F16 · (D-11 push 게이트) | T-22-08 · 09 · 29 | 이번 push 백엔드 diff 0 · 배포 relay SHA(/healthz version) 기준 diff 0 · 방침 승인 + 시행일 · 웹 변경 허용 7개 · behind 0 · blocking-human | checkpoint:decision | `git diff --stat origin/master HEAD -- relay/ server/ supabase/ workers/ packages/shared/` 빈 출력 · `/healthz` version 기준 diff 빈 출력 · `status: approved` + `effective_date` 날짜 + 자리표시 0 · 웹 변경 허용 목록 · `git rev-list --count HEAD..origin/master` = 0 | ✅ | ✅ green |
| 22-10-03 | 10 | 5(재범위) | MOBILE-02 | 02a(운영) | T-22-09 · 29 | 시행일 재확인 · push 직전 게이트 재확인 · 모르는 커밋이면 멈춤 · 운영 `/privacy` 200 + 시행일 | cli | `curl` `/privacy` = 200 · 본문에 「개인정보처리방침」 과 page.tsx 의 EFFECTIVE_DATE(push 시) → `PRIVACY LIVE` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

별도 Wave 0 플랜은 두지 않는다 — 새 테스트·검사 파일은 각 태스크가 구현보다 먼저 만든다. 프레임워크 설치는 `cd mobile && bundle install`(fastlane 2.240.x) 뿐이며 웹 쪽 추가 설치는 없다.

- [x] `webapp/src/lib/supabase/__tests__/public-path.test.ts` + `isPublicPath` 추출(`webapp/src/lib/supabase/public-path.ts`) — MOBILE-02b (22-03-01)
- [x] `webapp/src/app/privacy/__tests__/page.test.tsx` — MOBILE-02c (22-03-02)
- [x] `webapp/e2e/specs/auth-guards.spec.ts` 에 `/privacy` 공개 · `/privacy-x` 차단 케이스 — MOBILE-02a (22-03-02)
- [x] `mobile/fastlane/build_numbers.rb`(22-01-02 iOS · 22-04-01 Android) + `mobile/fastlane/test/build_numbers_test.rb`(Ruby 4 번들 minitest 6 — Gemfile 미추가) — MOBILE-02f (22-04-01)
- [x] `mobile/scripts/check-release-hygiene.sh` — MOBILE-02e·j·k (22-04-01)
- [x] `mobile/scripts/check-ipa.sh` (22-01-02) · `mobile/scripts/check-aab.sh` (22-04-03) — MOBILE-02g·h
- [x] `mobile/Gemfile` + `bundle install` — 프레임워크 설치 (22-01-02)

재범위(2026-09-27) 추가 — 음성 검사(V-F4 · V-F6)가 먼저 RED 가 되게 각 태스크가 만든다:

- [x] `mobile/scripts/check-release-hygiene.sh` 보강(ignore 21경로 · google-services.json 부재 · Firebase SA 키 권한 · Firebase 자격 명시 불변식) + `setup-release-secrets.sh firebase-sa` — V-F12 · V-F13 (22-05-01)
- [x] iOS lane `latest` + `release-ios.sh [beta|latest]` — V-F15 (22-06-01)
- [x] `mobile/Gemfile` 에 `fastlane-plugin-firebase_app_distribution ~> 1.0` + `bundle install` — V-F1 · V-F2 (22-07-01 · 프레임워크 설치)
- [x] `mobile/scripts/check-apk.sh` (apksigner · aapt2) · lane `firebase` · `release-android.sh firebase` · npm 재배선 — V-F7 · V-F8 (22-07-01)
- [x] `release-android.sh firebase-latest|check-apk` · 기본 firebase · lane `firebase_latest` — V-F3 · V-F4 · V-F6 · V-F9 (22-07-02)

---

## Manual-Only Verifications

자동화 불가 사유: 콘솔 UI(Apple Developer · App Store Connect · Firebase · GCP) · 사람 계정(테스터 초대·Google 계정) · 실기기 설치본 동작 · 비밀 주입(사용자 `!` 실행). 정본 절차(재범위 뒤): 콘솔 = 22-01-01 · 22-05-03 · 22-08-02 체크포인트 `<instructions>` · 결정 = 22-05-02(D-17) · 22-10-02(push) · 비밀 = 22-01-02 인증 게이트(`dir asc`) · 22-04-02(`keystore backup`) · 22-05-03(`firebase-sa`) · 문안 = 22-02-02 · 실기기 UAT = 22-09-02 `<human-check>`(end-of-phase 수집). Play 관련 행(앱 서명 키 · 첫 AAB · Play SA · Play 설치본 logcat)은 Phase 23 으로 이관했다.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 번들 ID Explicit 등록 · ASC 앱 레코드(이름 · 한국어 · SKU `com.ghtrade.app`) | MOBILE-02 (D-01 · D-10) | Apple 포털/ASC 화면 | 이름 선점 시 대안 선택 후 보고 |
| ASC 내부 그룹(자동 배포 ON) · 테스터 ASC 초대(Marketing · 앱 한정) → 그룹 추가 | MOBILE-02 (D-02) | 사람 초대 수락 | 테스터가 ASC 초대 → TestFlight 초대 → 설치 3단계 |
| Firebase 프로젝트 결정(D-17) → Firebase 추가 · Android 앱 `com.ghtrade.app`(SHA-1 비움) · App Distribution 「시작하기」 · 그룹 `ghtrade-testers`(본인 먼저) | MOBILE-02 (D-13 · D-17) | Firebase 콘솔 · 되돌릴 수 없는 결정 | 재개 신호 `done project=… appId=1:…:android:… group=…` (22-05) |
| 업로드 키 SHA-1 → GCP Android OAuth 클라이언트 1개(`GH Trade Android (upload key)`) | MOBILE-02 (D-14) | GCP 콘솔 | 재개 신호 `androidOAuth=1` (22-05) |
| OAuth 동의 화면 게시 상태 확인 · 「테스트」면 테스터 계정을 테스트 사용자로 | MOBILE-02 (D-05) | GCP 콘솔 | 상태 값 보고(22-05) · 추가는 22-08 |
| 비밀 주입 `! bash mobile/scripts/setup-release-secrets.sh …`(dir · asc · keystore · backup · firebase-sa) | MOBILE-02 (D-06 · D-17) | 분류기 차단 · 비출력 | 스크립트가 OK/SKIP/SHA-1/SA 이메일만 출력 |
| Firebase 추가 뒤 웹 Google 로그인 회귀 1회 | MOBILE-02 (FA-A6) | 사람 계정 | 재개 신호 `webLogin=ok` (22-05) |
| 본인 Android: Firebase 초대 → 개발판 삭제 → 출처 허용 → 설치 → Google 로그인 → 홈(테스터 초대 전 게이트) · 실패 시 `adb logcat -d -s GoogleProvider` 의 `signingSha1` = 업로드 SHA-1 대조 | MOBILE-02 (D-14) | 실기기 · Google 계정 UI | 재개 신호 `ownerAndroid=ok` (22-08) |
| 테스터 초대 — Firebase 그룹 · ASC(Marketing · GH Trade 한정 → 내부 그룹) | MOBILE-02 (D-02 · D-13) | 사람 초대 수락 | 명수만 보고(22-08) |
| `/privacy` 한글 초안 문안 검토 → 승인 | MOBILE-02 (D-11) | 법적 문구 판단 | 승인 전 커밋·push 금지(22-02 완료) |
| iPhone TestFlight 설치본: 로그인 → 홈 · 재실행 · 로그아웃 후 재로그인 · 두 번째 빌드 자동 도착 | MOBILE-02n (D-03 · D-04 · D-05) | 실기기 · Google 계정 UI | mesya iPhone 16 또는 테스터(22-09 human-check ①) |
| Android Firebase 설치본: 새 빌드 메일 → 탭 → 삭제 없이 덮어 설치 → 로그인 유지 | MOBILE-02 (D-15) | 실기기 · 메일/App Tester | 22-09 human-check ② |
| 테스터 절차: iOS 3단계 · Android 4단계를 README 만으로 · Play 프로텍트 문구 기록 | MOBILE-02 (D-02 · D-13 · FA-A3) | 타인 기기 | 22-09 human-check ③ |
| 테스터 계정(dma_credentials 없음) `/trading` → `DmaGate` · 시세·주문 불가 | MOBILE-02o (D-04) | 타인 계정 필요 | 22-09 human-check ④ |
| push(= 웹 프로덕션 배포) 결정 | MOBILE-02 (D-11) | 배포 결정 | 22-10-02 blocking-human |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 40s (웹) · 릴리스 파이프라인은 Wave 단위
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-27 (validate-phase 감사 · 갭 0)

---

## Validation Audit 2026-09-27

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

- 재실행 green: vitest privacy·supabase·google-client-ids 34건 · Ruby minitest 7 runs 0 fail · `check-release-hygiene.sh` OK · `verify-prod-config.mjs` PROD CONFIG OK · `bash -n` 13개 · 래퍼 엣지 exit(ios nope=2·latest=3 · android nope=2·firebase=3 · setup nope=2) · `check-apk.sh` 음성 3종 exit 1 · 양성 versionCode=609271542 · webapp typecheck · 운영 `/privacy` 200 + 시행일
- 기록 근거 green(업로드·콘솔·기기 필요로 재실행 안 함): IPA/AAB/APK 업로드 · TestFlight VALID · SIDELOAD SMOKE · auth-guards e2e 15 passed · 임시 파일 hygiene 음성 검사
- checkpoint 행은 SUMMARY 재개 신호로 완료 확인 · 실기기 UAT 는 `22-UAT.md` 4/4 pass
- 선택 보강(비차단): 래퍼 exit·check-apk 음성 검사를 `mobile/scripts/test/release-wrappers.test.sh` 로 영속화 가능
