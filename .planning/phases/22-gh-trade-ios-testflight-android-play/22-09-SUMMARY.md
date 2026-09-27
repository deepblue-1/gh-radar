---
phase: 22-gh-trade-ios-testflight-android-play
plan: 09
subsystem: mobile-release
tags: [fastlane, testflight, firebase, app-distribution, release, gates, uat]

requires:
  - phase: 22-01
    provides: "iOS 릴리스 명령 native:release:ios · 첫 TestFlight 빌드 202609270252 · 내부 그룹 자동 배포"
  - phase: 22-06
    provides: "release-ios.sh latest — latest TestFlight build N state S"
  - phase: 22-07
    provides: "native:release:android → Firebase · 첫 릴리스 versionCode 609271311 · firebase-latest · APK CHECK OK · 전용 SA 인증"
  - phase: 22-08
    provides: "README 릴리스 절 · 테스터 안내 · Firebase 그룹 3명 · ASC 초대 1(수락 대기) · OAuth 테스트 사용자 3"
provides:
  - "전 자동 게이트 green 기록(build · test · auth-guards e2e · minitest · 위생 · SA 역할 · 플러그인 잠금 · Play/AAB 보존)"
  - "두 번째 TestFlight 빌드 202609271538 — state VALID (업로드 약 2분 뒤)"
  - "두 번째 Firebase 릴리스 versionCode 609271542 — 그룹 ghtrade-testers 배포"
  - "반복 릴리스 뒤 mobile/ 무변경 · PROD CONFIG OK"
  - "end-of-phase UAT 목록 4항목(본인 iOS 자동 배포 · 본인 Android 탭 설치 · 테스터 절차 · DmaGate)"
affects: [22-10, 22 verify-work, 23]

actuals:
  tokens: 0        # 코드 변경 없음(검증·업로드 전용) — 이 SUMMARY 만 문서
  tasks: 2
  commits: 0       # MEASURED: git rev-list --count 12c75c99..HEAD (SUMMARY 작성 시점) — 태스크 커밋 없음(검증·업로드 전용 = 0 이 정상)
plan_head_before: 12c75c99ebf3b0f58c3db0ceae67e9ae2d2c83a0

tech-stack:
  added: []
  patterns:
    - "반복 릴리스는 iOS → (1분 이상 간격) → Android 순서로만 — cap sync 가 같은 생성 파일을 쓰므로 동시 실행 금지(FA-5)"

key-files:
  created:
    - .planning/phases/22-gh-trade-ios-testflight-android-play/22-09-SUMMARY.md
  modified: []

key-decisions:
  - "22-09: iOS 두 번째 빌드 N1 202609270252 → N2 202609271538 — IPA CHECK OK build=202609271538 · 15:40:56 KST 업로드 · 15:43:05 첫 조회에서 이미 state VALID(대기 약 2분 · 반복 폴링 불필요)"
  - "22-09: Android 두 번째 릴리스 VC1 609271311 → VC2 609271542 — APK CHECK OK sha1=2fe3…7b7d versionCode=609271542 · 15:42:35 KST 업로드 · firebase-latest = 609271542"
  - "22-09: 두 번째 Android 업로드도 전용 SA 파일 인증만(service_credentials_file 1건 · Application Default Credentials 0건)"
  - "22-09: 릴리스 두 번 뒤 git status --porcelain mobile/ 0줄 · native:verify-prod PROD CONFIG OK — push 안 함(22-10 게이트)"

patterns-established:
  - "게이트 기록은 실제 수치(통과 수 · 초)로 — 21-36 형식"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "전 자동 게이트 6개 green — build · test · auth-guards e2e · minitest+위생 · 업로드 SA 역할 정확히 하나 · 플러그인 잠금+Play/AAB 보존"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "build_command (exit 0 · error TS 0 · 10s)"
        status: pass
      - kind: unit
        ref: "test_command — relay 28 files/630 tests · webapp 124 files/2431 passed 1 skipped"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/auth-guards.spec.ts — 15 passed"
        status: pass
      - kind: unit
        ref: "ruby mobile/fastlane/test/build_numbers_test.rb (7 runs 0 failures 0 errors) · check-release-hygiene.sh RELEASE HYGIENE OK"
        status: pass
      - kind: other
        ref: "gcloud projects get-iam-policy gh-radar (읽기) → roles/firebaseappdistro.admin 한 줄"
        status: pass
      - kind: other
        ref: "Gemfile.lock 플러그인 1.0.0 · fastlane 2.240.1 · Pluginfile 없음 · lanes build/beta/validate/track · play-sa · npm 스크립트 3개 배선"
        status: pass
    human_judgment: false
  - id: D2
    description: "두 번째 iOS 릴리스 — 빌드 번호 엄격 증가 · TestFlight VALID"
    requirement: MOBILE-02
    verification:
      - kind: e2e
        ref: "native:release:ios (mktemp 로그 · PROD CONFIG OK · IPA CHECK OK · errors 0 · N2 202609271538 > N1 202609270252)"
        status: pass
      - kind: integration
        ref: "bash mobile/scripts/release-ios.sh latest → latest TestFlight build 202609271538 state VALID"
        status: pass
    human_judgment: false
  - id: D3
    description: "두 번째 Android 릴리스 — versionCode 엄격 증가 · 상한 안 · 전용 SA 인증 · Firebase 최신 = VC2"
    requirement: MOBILE-02
    verification:
      - kind: e2e
        ref: "native:release:android (mktemp 로그 표식 5종 · ADC 0 · VC2 609271542 > VC1 609271311 · ≤ 2,100,000,000)"
        status: pass
      - kind: integration
        ref: "bash mobile/scripts/release-android.sh firebase-latest → latest Firebase build 609271542"
        status: pass
    human_judgment: false
  - id: D4
    description: "반복 릴리스 뒤 저장소 무변경 · 운영 설정"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "git status --porcelain -- mobile/ 0줄 · pnpm --filter @gh-radar/mobile run native:verify-prod → PROD CONFIG OK"
        status: pass
    human_judgment: false
  - id: D5
    description: "end-of-phase UAT — 본인 iPhone 자동 배포 · 본인 Android 탭 덮어 설치 · 테스터 README 절차 · dma_credentials 없는 계정 DmaGate"
    requirement: MOBILE-02
    verification: []
    human_judgment: true
    rationale: "실기기 · 타인 Google/Apple 계정 · 초대 수락 · TestFlight/사이드로드 설치 UI 는 자동화할 수 없다(22-09 Task 2 human-check)"

duration: 7min
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 09: 전 게이트 + 두 번째 릴리스(iOS 202609271538 · Android 609271542) Summary

**자동 게이트 6개를 모두 통과시킨 뒤 플랫폼마다 명령 한 번으로 두 번째 빌드를 올렸다. TestFlight 202609270252 → 202609271538 은 약 2분 만에 VALID 가 됐고, Firebase 609271311 → 609271542 는 전용 SA 자격으로 그룹 ghtrade-testers 에 배포됐다. 두 번 올린 뒤에도 저장소는 바뀌지 않았고 설정은 운영값이다.**

## Performance

- **Duration:** 약 7분(게이트 약 2분 · iOS 릴리스 125초 · Android 릴리스 26초 · 확인)
- **Started:** 2026-09-27T06:36:23Z
- **Completed:** 2026-09-27T06:43:24Z
- **Tasks:** 2
- **Files modified:** 0 (이 SUMMARY 뿐)

## Accomplishments

- 전 자동 게이트 6개 green — 실제 수치는 아래 「게이트 결과」
- iOS 반복 릴리스: 빌드 번호 자동 증가 → 명령 한 번 → TestFlight VALID(내부 그룹 자동 배포 대상)
- Android 반복 릴리스: versionCode 자동 증가 → 명령 한 번 → Firebase 그룹 배포. 22-08 에서 들어온 테스터 2명은 스크롤 수정 뒤 처음으로 이 빌드를 받는다(새 빌드 메일)
- 반복 뒤 `mobile/` 무변경 · `PROD CONFIG OK`

## 게이트 결과 (Task 1)

| # | 게이트 | 결과 | 시간 |
|---|---|---|---|
| 1 | build_command (shared build · relay typecheck · typecheck:tests · webapp typecheck) | exit 0 · `error TS` 0 | 10s |
| 2 | test_command | relay **28 files / 630 passed** · webapp **124 files / 2431 passed · 1 skipped** · 요약 줄 failed 0 | 56s (vitest 5.97s + 48.33s) |
| 3 | `playwright test e2e/specs/auth-guards.spec.ts` | **15 passed** | 24s (실행 23.1s) |
| 4 | `build_numbers_test.rb` + `check-release-hygiene.sh` | **7 runs, 17 assertions, 0 failures, 0 errors, 0 skips** · `RELEASE HYGIENE OK` | 1s 미만 |
| 5 | 업로드 SA 역할(읽기 전용 `get-iam-policy gh-radar`) | `roles/firebaseappdistro.admin` 정확히 한 줄 | — |
| 6 | 플러그인 잠금 · Play/AAB 보존 | `fastlane-plugin-firebase_app_distribution (1.0.0)` · `fastlane (2.240.1)` · Pluginfile 없음 · lanes build/beta/validate/track · `play-sa` · npm `:android`→firebase · `:aab`→build · `:play`→beta | — |

- test_command 로그에 「failed」 문자열 7건은 테스트 픽스처의 로그 줄(`failedSend` · `fetch failed` 등)이다 — vitest 요약 줄에는 없다.
- 위생 검사 안내 줄 「play-service-account.json 아직 주입 전」 은 Phase 23 몫으로 정상이다.

## Task Commits

1. **Task 1: 전 자동 게이트** — 커밋 없음(검증 전용 · 수정 없음)
2. **Task 2: 두 번째 릴리스 iOS → Android** — 커밋 없음(업로드·검증 전용 · 저장소 무변경)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `.planning/phases/22-gh-trade-ios-testflight-android-play/22-09-SUMMARY.md` — 이 문서

## Decisions Made

**iOS (먼저 실행):**
- **N1 → N2:** `202609270252` → **`202609271538`** (N2 > 202609270252)
- 명령 15:38:51 KST 시작 → 15:40:56 종료(125초) · 22-07 트레이서 업로드(13:11)와 2시간 이상 간격
- 로그 표식: `PROD CONFIG OK` 1건 · `IPA CHECK OK build=202609271538` · `Successfully uploaded the new binary to App Store Connect` · `fastlane.tools finished successfully` · `fastlane finished with errors` 0건
- **처리 대기:** 15:43:05 KST 첫 조회에서 `latest TestFlight build 202609271538 state VALID` — 업로드 뒤 약 2분, 60초 반복 폴링은 필요 없었다. FAILED/INVALID · ITMS-91053 경고 없음

**Android (iOS 종료 1분 이상 뒤):**
- **VC1 → VC2:** `609271311` → **`609271542`** (VC2 > VC1 · ≤ 2,100,000,000)
- 명령 15:42:09 KST 시작 → 15:42:35 종료(26초) · iOS 종료 15:40:56 와 다른 분이고 동시 실행 아님(FA-5)
- 로그 표식: `PROD CONFIG OK` 1 · `APK CHECK OK sha1=2fe3ba78a5741606f879a8d33c2823ef72987b7d versionCode=609271542` · `Authenticating with --service_credentials_file` 1 · `Application Default Credentials` **0** · `Uploaded APK successfully and created release 1.0 (609271542)` · `Distributing release.` · `App Distribution upload finished successfully` 1
- **최신 릴리스:** `release-android.sh firebase-latest` → `latest Firebase build 609271542`

**저장소·설정:** 두 릴리스 뒤 `git status --porcelain -- mobile/` 0줄 · `native:verify-prod` → `PROD CONFIG OK`. push 는 하지 않았다(22-10 게이트).

다운로드 링크 · console/testing URI · 테스터 이메일은 기록하지 않는다. 릴리스 로그는 저장소 밖 임시 파일에만 있다.

## End-of-phase UAT (human-check — 22-09 Task 2)

| # | 확인 | 기대 결과 |
|---|---|---|
| ① | 본인 iPhone: TestFlight 에 두 번째 빌드 **202609271538** 이 자동으로 나타남 → 업데이트 → 실행 → 로그인 유지 · 홈 착지 · 앱 종료 후 재실행 유지 · 마이 → 로그아웃 → 재로그인 | 사용자 조작 없이 새 빌드가 도착하고 로그인이 유지된다(D-03) |
| ② | 본인 Android: 「새 빌드」 메일(또는 App Tester 알림) → 탭 → **삭제 없이** 덮어 설치(versionCode **609271542**) → 실행 → 로그인 유지 · 홈 | 알림 → 탭 → 덮어 설치로 업데이트되고 로그인이 유지된다(D-15) |
| ③ | 테스터(가능한 사람부터): README 「테스터 안내」 만 보고 iPhone 3단계 · Android 4단계(개발판 삭제 · 초대 수락 · 출처 허용 · 설치)를 마쳤는지, 로그인 → 홈에 도착했는지, 걸린 단계와 Play 프로텍트 문구가 있었는지 | 절차가 문서대로이고 단계 수가 iOS 3 · Android 4 를 넘지 않는다(D-02 · D-13) |
| ④ | `dma_credentials` 가 없는 계정(테스터 또는 본인의 두 번째 Google 계정)으로 트레이딩 탭 → DmaGate 안내만 보이고 시세·주문 UI 가 없음(실주문 금지) | DmaGate 만 보인다(D-04) |

- 자동화할 수 없는 이유: 실기기 · 타인 Google/Apple 계정 · 초대 수락 · TestFlight/사이드로드 설치 UI.
- Android 로그인이 `[28444]`/DEVELOPER_ERROR 로 실패하면 README 「문제 해결」 절(logcat `signingSha1` 대조)로 진단한다.
- 참고: iOS 테스터는 ASC 초대 수락 대기(22-08 · 내부 그룹 0명)라 ③ iPhone 은 수락 뒤에 가능하다. Android 테스터 2명은 이번 빌드가 스크롤 수정(798f911f · 웹 측 · 이미 운영 반영) 뒤 처음 받는 빌드다.

## Deviations from Plan

None — 플랜대로 실행했다. 게이트 실패 · 업로드 거절 · 재시도 없음.

### 기록 사항

- **보호 브랜치 master 에서 문서 커밋:** config `git.branching_strategy: none` · 이전 플랜과 같은 관례(push 안 함).
- **다른 세션 흔적 없음:** 커밋 전 `git status -sb` 에서 `master...origin/master [ahead 2]`(22-08 문서 커밋 2개) · 오케스트레이터의 STATE.md 미커밋 수정 · 무관한 `.planning/milestone.lock` · `.planning/research/.cache/` 만 보였다. 뒤의 둘은 스테이징하지 않았다.

## Issues Encountered

None.

## User Setup Required

None — 추가 외부 설정 없음. UAT 는 위 목록.

## Next Phase Readiness

- **22-10:** `/privacy` 시행일 채움 · push 결정(blocking-human). 이 플랜은 push 하지 않았고 백엔드 변경도 없다.
- **verify-work 22:** 위 UAT 4항목을 받는다.
- **Phase 23:** Play 경로(lanes build/beta/validate/track · `:aab` · `:play` · play-sa) 보존 확인됨.
- **만료:** TestFlight 202609271538 은 90일, Firebase 609271542 는 150일 뒤 사라진다.

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: .planning/phases/22-gh-trade-ios-testflight-android-play/22-09-SUMMARY.md
- 태스크 커밋 없음(검증·업로드 전용) — `git rev-list --count 12c75c99..HEAD` = 0 (SUMMARY 작성 시점)
- Task 1 verify 6개 PASS · Task 2 verify 4개 PASS · SUMMARY URL grep 0 · 이메일 0
