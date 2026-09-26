---
phase: "22"
slug: "gh-trade-ios-testflight-android-play"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-27"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 정본 출처: `22-RESEARCH.md` §Validation Architecture (MOBILE-02a~o). Per-Task Verification Map 은 플래너가 PLAN 확정 시 채운다(Phase 21 방식).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (웹 단위)** | Vitest ^2.1.9 + jsdom + @testing-library/react — `webapp/vitest.config.ts` · setup `webapp/tests/setup.ts` |
| **Framework (웹 e2e)** | Playwright ^1.59.1 — baseURL `http://localhost:3100` · 비로그인 스펙은 `e2e/specs/auth-guards.spec.ts` 의 파일 레벨 `storageState` 비우기 패턴 |
| **Framework (릴리스 파이프라인)** | bash 검사 스크립트(`mobile/scripts/check-ipa.sh` · `check-aab.sh` · `check-release-hygiene.sh`) + `node mobile/scripts/verify-prod-config.mjs` + Ruby minitest(빌드 번호 함수 `mobile/fastlane/build_numbers.rb`) |
| **Framework (iOS release)** | fastlane 2.240.x(`mobile/Gemfile` · Ruby 4.0.2 · bundler 4.0.8) → gym(xcodebuild archive/export) → pilot(altool) |
| **Framework (Android release)** | Gradle `bundleRelease`(환경변수 서명 · `-PghtradeVersionCode`) → supply(`upload_to_play_store track:internal`) · jarsigner/keytool 검사 |
| **Config file** | `webapp/vitest.config.ts` · `webapp/playwright.config.ts` · `mobile/package.json`(`native:*`) · `mobile/Gemfile`(신규) · `mobile/ios/App/fastlane/Fastfile` · `mobile/android/fastlane/Fastfile`(신규) |
| **Quick run command** | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy src/lib/supabase` |
| **Full suite command** | `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp run typecheck` |
| **e2e command** | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/auth-guards.spec.ts` |
| **iOS release command** | `pnpm --filter @gh-radar/mobile run native:release:ios` (sync 양쪽 → verify-prod → lane `beta` → check-ipa · 수 분 · Wave 단위) |
| **Android release command** | `pnpm --filter @gh-radar/mobile run native:release:android:aab`(빌드만 · check-aab) / `native:release:android`(업로드) |
| **Estimated runtime** | 웹 단위 ~20–40초 · webapp 전체 ~2분 · auth-guards e2e ~1분 · hygiene/verify-prod 수 초 · iOS archive+upload 5–10분 · Android bundleRelease 2–5분 |

---

## Sampling Rate

- **After every task commit:** 웹 태스크 = `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy src/lib/supabase`(+ e2e 태스크면 `auth-guards.spec.ts -g privacy`) · 네이티브 설정 태스크 = `bash mobile/scripts/check-release-hygiene.sh` + `node mobile/scripts/verify-prod-config.mjs`
- **After every plan wave:** 웹 full suite + typecheck + `auth-guards.spec.ts` · 네이티브 Wave 는 `native:release:android:aab` + `check-aab.sh`(업로드 없이) · iOS 는 archive 가 가능한 Wave 부터 `native:release:ios`
- **Before `/gsd-verify-work`:** 위 전부 green + iOS·Android 실제 업로드 1회씩(MOBILE-02l·m) + 두 번째 빌드 업로드 1회(D-03 자동 업데이트) + Manual-Only UAT 승인
- **Max feedback latency:** 웹 40초 · 릴리스 파이프라인은 빌드·업로드 시간이 지배(Wave 단위)

---

## Per-Task Verification Map

테스트 ID `MOBILE-02a~o` 는 RESEARCH §Validation Architecture 정의. 위협 ID `T-22-NN` 은 각 PLAN `<threat_model>` 정의(T-22-01 비밀 저장소 유입 · 02 비밀 로그 출력 · 03 산출물 저장소 잔류 · 04 dev 설정 릴리스 혼입 · 05 Play 서명×Google 로그인 · 06 테스터 실돈 경로 · 07 빌드 번호 파일 기록 · 08 방침 부정확·미승인 · 09 결합 변경 섞인 push · 10 Play SA 과권한 · 11 업로드 키 분실·덮어쓰기 · 12 공개 prefix 경계 · 13 Secret Manager 접근 · 14 ASC 테스터 역할 · 15 동의 화면·가입 정책 · 17 문서 이메일 · 18 `/privacy` 결합 · 19 다른 키 AAB · SC RubyGems 공급망). 엣지 프로브 FA-1~5 는 22-01 「Flagged assumptions」 표. Checkpoint 태스크의 자동 명령은 사람 작업 **뒤** 실행기가 돌리는 사후 확인이다.

| Task ID | Plan | Wave | Requirement | Test ID | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|---------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | MOBILE-02 | — (콘솔 선행 · D-01 · D-02 A2 · D-10) | — | 계정 개설 없음 · 번들 ID·ASC 레코드·내부 그룹(자동 배포)만 | checkpoint:human-action | `security find-identity -v -p codesigning` 에 `Apple Distribution: …(954QPCS3F5)` (제시 전 · 콘솔 결과는 22-01-02 sigh·pilot 이 사후 확인) | ✅ | ⬜ pending |
| 22-01-02 | 01 | 1 | MOBILE-02 | 02d · 02h · 02i(iOS) · 02l(업로드) · FA-2 | T-22-01 · 02 · 03 · 04 · 07 · SC | env 누락 시 fastlane 전 exit 3·이름만 · 비밀은 사용자 `!`(인증 게이트) · 산출물 저장소 밖 · IPA 배포 서명·키체인 엔타이틀먼트·운영 URL · 빌드 번호 무기록 | tracer (smoke + artifact) | `cd mobile && PATH=/opt/homebrew/opt/ruby/bin:$PATH bundle exec fastlane --version` · `GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-missing-vars bash mobile/scripts/release-ios.sh` (exit 3) · `pnpm --filter @gh-radar/mobile run native:release:ios` · `git diff --quiet -- mobile/ios/App/App.xcodeproj/project.pbxproj` + PlistBuddy `CFBundleVersion`/`ITSAppUsesNonExemptEncryption` | ❌ 태스크가 생성 | ⬜ pending |
| 22-02-01 | 02 | 1 | MOBILE-02 | 02c(문안 선행) | T-22-08 · 17 | 코드 근거 재확인 · 이메일 0 · 웹 코드 미변경 | doc + grep | 22-02-PLAN Task 1 verify 1(13절·부록 제목 grep → `DRAFT OK`) · verify 2(근거 파일 `test -f` → `EVIDENCE OK`) | ❌ 태스크가 생성 | ⬜ pending |
| 22-02-02 | 02 | 1 | MOBILE-02 | — (D-11 문안 검토 게이트) | T-22-08 | 승인 전 웹 코드 반영 금지 · blocking-human | checkpoint:decision | 초안 `status:` · 「부록 B.」 존재 grep(제시 전) | ✅(22-02-01) | ⬜ pending |
| 22-02-03 | 02 | 1 | MOBILE-02 | 02c(문안 확정) | T-22-08 | 미정 표식 0 · 승인 날짜·시행일 | grep | `grep -q "^status: approved" 22-PRIVACY-DRAFT.md` + 미정 표식 0 → `APPROVED OK` | ✅(22-02-01) | ⬜ pending |
| 22-03-01 | 03 | 2 | MOBILE-02 | 02b | T-22-12 | 공개 prefix 경계(`/privacyx`·`/privacy-x` 차단) · 로그인 분기 불변 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/supabase/__tests__/public-path.test.ts` · `pnpm --filter @gh-radar/webapp run typecheck` | ❌ 태스크가 생성 | ⬜ pending |
| 22-03-02 | 03 | 2 | MOBILE-02 | 02a · 02c | T-22-08 · 12 · 18 | 승인 문안 그대로 · 정적 RSC(요청·훅 0) · 웹 변경 6파일 이내 | unit + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/app/privacy/__tests__/page.test.tsx src/lib/supabase/__tests__/public-path.test.ts` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/auth-guards.spec.ts` | ❌ 태스크가 생성(spec 은 ✅ · 케이스 신규) | ⬜ pending |
| 22-04-01 | 04 | 2 | MOBILE-02 | 02e · 02f · 02j · 02k(권한) · FA-1 · FA-4 | T-22-01 · 02 · 07 · 11 | build.gradle 비밀 기본값 0 · env 없이 디버그 통과·릴리스 가드 실패 · 키스토어 SKIP(덮어쓰기 없음) · 비대화형 | unit + build + static | `/opt/homebrew/opt/ruby/bin/ruby mobile/fastlane/test/build_numbers_test.rb` · `pnpm --filter @gh-radar/mobile run native:build:android` · `env -u GHTRADE_UPLOAD_STORE_FILE ./gradlew bundleRelease`(실패 기대) · 더미 키스토어 SKIP 테스트 · `bash mobile/scripts/check-release-hygiene.sh` | ❌ 태스크가 생성 | ⬜ pending |
| 22-04-02 | 04 | 2 | MOBILE-02 | 02k | T-22-01 · 11 · 13 | 키스토어·비밀번호 사용자 `!` 생성 · 600/700 · Secret Manager 백업(값 미열람) | checkpoint:human-action | `bash mobile/scripts/check-release-hygiene.sh` + `gcloud secrets describe gh-radar-ghtrade-upload-keystore --format='value(name)'` | ✅(22-04-01) | ⬜ pending |
| 22-04-03 | 04 | 2 | MOBILE-02 | 02g · 02d(Android) · FA-2 | T-22-02 · 04 · 07 | fastlane 에 서명 속성 미전달 · 업로드 키 서명 AAB · 운영 URL · 저장소 파일 무변경 | smoke + artifact | `GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-missing-vars bash mobile/scripts/release-android.sh build`(exit 3) · `pnpm --filter @gh-radar/mobile run native:release:android:aab` · `git diff --quiet -- mobile/android/app/build.gradle …` + hygiene | ❌ 태스크가 생성 | ⬜ pending |
| 22-05-01 | 05 | 3 | MOBILE-02 | — (D-08 one-way 결정) | T-22-05 · 11 | 앱 서명 키 종류를 사람이 결정(고전 키 권장) · own-key 는 D-08 재논의 | checkpoint:decision | `bash mobile/scripts/release-android.sh check`(제시 전 AAB 서명 확인) | ✅(22-04-03) | ⬜ pending |
| 22-05-02 | 05 | 3 | MOBILE-02 | — (D-10 첫 수동 업로드) | T-22-05 · 19 | 첫 업로드 = 파이프라인 AAB · 업로드 SHA-1 대조 · 데이터 보안 양식 미작성(D-12) | checkpoint:human-action | `bash mobile/scripts/release-android.sh check` | ✅ | ⬜ pending |
| 22-06-01 | 06 | 4 | MOBILE-02 | 02m(선행 — SA 연결) | T-22-10 · 14 · 15 · 05 | SA 앱 한정 최소 권한 · ASC Marketing·앱 한정 · Android 클라이언트 = 1 + 앱 서명 인증서 수 · 동의 화면 상태(D-05) | checkpoint:human-action | `bash mobile/scripts/check-release-hygiene.sh && bash mobile/scripts/release-android.sh validate` | ✅(22-04) | ⬜ pending |
| 22-06-02 | 06 | 4 | MOBILE-02 | 02l · 02m · 02n · 02o · FA-4 | T-22-05 · 06 | supply 업로드 · track 에 새 versionCode · TestFlight 처리 완료 · 저장소 파일 무변경 · (UAT) 설치본 로그인·logcat SHA-1·DmaGate | integration + human-check | `pnpm --filter @gh-radar/mobile run native:release:android` · `bash mobile/scripts/release-android.sh track` · `bash mobile/scripts/release-ios.sh latest` · `git status --porcelain -- build.gradle Info.plist pbxproj` 빈 출력 | ✅ · lane `latest` 신규 | ⬜ pending |
| 22-06-03 | 06 | 4 | MOBILE-02 | — (D-02 · D-03 · D-08 문서) | T-22-02 | README 비밀 패턴·이메일 0 · client-ids 상수 불변 | unit + grep | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native/__tests__/google-client-ids.test.ts` · README 필수 문구 grep + `bash mobile/scripts/check-release-hygiene.sh` | ✅ | ⬜ pending |
| 22-07-01 | 07 | 5 | MOBILE-02 | 02a~02m 전부 · 02i · FA-4 · FA-5 (D-03 반복) | T-22-01 · 04 · 07 | 두 번째 업로드 번호 엄격 증가 · 두 번 뒤 `git status --porcelain mobile/` 빈 출력 · PROD CONFIG OK · (UAT) 자동 업데이트 | full gates + integration | build_command · test_command · `playwright test e2e/specs/auth-guards.spec.ts` · build_numbers minitest + hygiene · `native:release:ios` · `native:release:android` + track · `git status` + `native:verify-prod` | ✅ | ⬜ pending |
| 22-07-02 | 07 | 5 | MOBILE-02 | — (D-11 push 게이트) | T-22-09 · 08 | 이번 push 백엔드 diff 0 · 배포 relay SHA 기준 diff 0 · 방침 승인 · 웹 변경 허용 7개 · blocking-human | checkpoint:decision | `git diff --stat origin/master HEAD -- relay/ server/ supabase/ workers/ packages/shared/` 빈 출력 · `/healthz` version 기준 diff 빈 출력 · `grep "^status: approved"` · 웹 변경 파일 허용 목록 | ✅ | ⬜ pending |
| 22-07-03 | 07 | 5 | MOBILE-02 | 02a(운영) | T-22-09 | push 직전 게이트 재확인 · 모르는 커밋이면 멈춤 · 운영 `/privacy` 200 | cli | `curl -s -o /dev/null -w '%{http_code}' https://trade.jx1.io/privacy` = 200 (push 시) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

별도 Wave 0 플랜은 두지 않는다 — 새 테스트·검사 파일은 각 태스크가 구현보다 먼저 만든다. 프레임워크 설치는 `cd mobile && bundle install`(fastlane 2.240.x) 뿐이며 웹 쪽 추가 설치는 없다.

- [ ] `webapp/src/lib/supabase/__tests__/public-path.test.ts` + `isPublicPath` 추출(`webapp/src/lib/supabase/public-path.ts`) — MOBILE-02b (22-03-01)
- [ ] `webapp/src/app/privacy/__tests__/page.test.tsx` — MOBILE-02c (22-03-02)
- [ ] `webapp/e2e/specs/auth-guards.spec.ts` 에 `/privacy` 공개 · `/privacy-x` 차단 케이스 — MOBILE-02a (22-03-02)
- [ ] `mobile/fastlane/build_numbers.rb`(22-01-02 iOS · 22-04-01 Android) + `mobile/fastlane/test/build_numbers_test.rb`(Ruby 4 번들 minitest 6 — Gemfile 미추가) — MOBILE-02f (22-04-01)
- [ ] `mobile/scripts/check-release-hygiene.sh` — MOBILE-02e·j·k (22-04-01)
- [ ] `mobile/scripts/check-ipa.sh` (22-01-02) · `mobile/scripts/check-aab.sh` (22-04-03) — MOBILE-02g·h
- [ ] `mobile/Gemfile` + `bundle install` — 프레임워크 설치 (22-01-02)

---

## Manual-Only Verifications

자동화 불가 사유: 콘솔 UI(Apple Developer · App Store Connect · Play Console · GCP) · 사람 계정(테스터 초대·Google 계정) · 실기기 설치본 동작 · 비밀 주입(사용자 `!` 실행). 정본 절차: 콘솔 = 22-01-01 · 22-05-02 · 22-06-01 체크포인트 `<instructions>` · 비밀 = 22-01-02 인증 게이트(`dir asc`) · 22-04-02(`keystore backup`) · 22-06-01(`play-sa`) · 문안 = 22-02-02 · 실기기 UAT = 22-06-02 · 22-07-01 `<human-check>`(end-of-phase 수집).

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 번들 ID Explicit 등록 · ASC 앱 레코드(이름 · 한국어 · SKU `com.ghtrade.app`) | MOBILE-02 (D-01 · D-10) | Apple 포털/ASC 화면 | 이름 선점 시 대안 선택 후 보고 |
| ASC 내부 그룹(자동 배포 ON) · 테스터 ASC 초대(Marketing · 앱 한정) → 그룹 추가 | MOBILE-02 (D-02) | 사람 초대 수락 | 테스터가 ASC 초대 → TestFlight 초대 → 설치 3단계 |
| Play 앱 생성 · 내부 테스트 테스터 이메일 · 첫 AAB 수동 업로드 · **앱 서명 키 종류 선택** · 내부 테스트 출시 | MOBILE-02 (D-08 · D-10) | Play Console | 선택한 서명 옵션 문구·스크린샷 보고 |
| Play 앱 서명 인증서(전부) SHA-1 + 업로드 키 SHA-1 → GCP Android OAuth 클라이언트 각각 생성 | MOBILE-02 (D-08) | GCP 콘솔 | 사용자 인증 정보 목록에 `com.ghtrade.app` 클라이언트 N개 |
| Play 서비스 계정 초대(테스트 트랙 출시 · 앱 정보 보기) | MOBILE-02 (D-07) | Play Console 사용자 및 권한 | 이후 MOBILE-02m 자동 확인 |
| OAuth 동의 화면 게시 상태 확인 · 「테스트」면 테스터 계정 추가 | MOBILE-02 (D-05) | GCP 콘솔 | 상태 값 보고 |
| 비밀 주입 `! bash mobile/scripts/setup-release-secrets.sh …`(dir · asc · keystore · backup · play-sa) | MOBILE-02 (D-06 · D-08) | 분류기 차단 · 비출력 | 스크립트가 OK/SHA-1/SA 이메일만 출력 |
| `/privacy` 한글 초안 문안 검토 → 승인 | MOBILE-02 (D-11) | 법적 문구 판단 | 승인 전 커밋·push 금지 |
| iPhone TestFlight 설치본: 로그인 → 홈 · 재실행 · 로그아웃 후 재로그인 | MOBILE-02n (D-04 · D-05) | 실기기 · Google 계정 UI | mesya iPhone 16 또는 테스터 |
| Android Play 설치본: 로그인 → 홈 · `adb logcat -s GoogleProvider` 의 `signingSha1` 이 GCP 등록값과 일치 | MOBILE-02n (D-08) | Play 설치 경로 · 실기기/에뮬 Play 스토어 | 에뮬레이터 `Medium_Phone_API_36.1`(playstore) 또는 실기기 |
| 테스터 계정(dma_credentials 없음) `/trading` → `DmaGate` · 시세·주문 불가 | MOBILE-02o (D-04) | 타인 계정 필요 | 테스터 1명 1회 |
| 두 번째 빌드 업로드 → 테스터 기기에 자동 업데이트 도착 | MOBILE-02 (D-03) | 기기 관찰 | TestFlight 자동 배포 · Play 업데이트 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s (웹) · 릴리스 파이프라인은 Wave 단위
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
