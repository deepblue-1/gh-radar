---
phase: 22-gh-trade-ios-testflight-android-play
plan: 08
subsystem: mobile-release
tags: [readme, testers, firebase, app-distribution, testflight, app-store-connect, oauth, google-sign-in]

requires:
  - phase: 22-05
    provides: "Firebase 그룹 ghtrade-testers · GCP Android OAuth 클라이언트 GH Trade Android (upload key) · 동의 화면 「테스트」 상태 기록"
  - phase: 22-06
    provides: "release-ios.sh latest · TestFlight 내부 그룹 GH Trade 테스터"
  - phase: 22-07
    provides: "첫 Firebase 릴리스 versionCode 609271311 · release-android.sh firebase-latest"
provides:
  - "mobile/README.md 「릴리스 (TestFlight · Firebase APK — Phase 22)」 절 — 명령표 · 처음 1회 순서 · 업데이트(90일 · 150일 만료) · 비밀 파일 표 · 문제 해결 · 테스터 안내(iPhone 3단계 · Android 4단계)"
  - "README 「비밀 파일」 보강 · 「범위 밖 (Phase 21 · 22 Deferred)」 갱신"
  - "google-client-ids.ts 머리 주석 D-14(업로드 키 SHA-1 Android 클라이언트 · Play 앱 서명 SHA-1 은 Phase 23) — 상수 4개 불변"
  - "본인 Android 실기(Firebase 설치본 609271311) Google 로그인 통과 → 테스터 편입: Firebase 그룹 3명 · ASC 신규 초대 1 · OAuth 테스트 사용자 3명"
affects: [22-09, 22-10, 23]

actuals:
  tokens: 4000     # chars/4 — git show d9b134c3 -- mobile webapp = 16,074자(2개 파일 · +146/−4)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 23a21f83..HEAD = 2 · 그중 22-08 커밋은 1(d9b134c3) — 798f911f 는 별도 /gsd-debug 세션의 fix(native) 커밋
plan_head_before: 23a21f83c9081c2333b9f72d4fcc110ae97d513c

tech-stack:
  added: []
  patterns:
    - "테스터 초대 전에 본인 실기 로그인 게이트 — 깨진 빌드가 테스터에게 가지 않게"
    - "SUMMARY·README 에는 명수·그룹 이름·SA 이름·파일 이름만 — 이메일·링크·비밀 값 금지"

key-files:
  created: []
  modified:
    - mobile/README.md
    - webapp/src/lib/native/google-client-ids.ts

key-decisions:
  - "22-08: 재개 신호 done ownerAndroid=ok firebaseTesters=3 ascInvites=1 consentTestUsers=3 — 본인 Android(Galaxy S10e · Android 12 · WebView 153)에서 Firebase 설치본 versionCode 609271311 Google 로그인 → 홈 착지 · Play 프로텍트 경고 문구 보고 없음"
  - "22-08: Firebase 그룹 ghtrade-testers 3명(본인 + 2) · OAuth 테스트 사용자 3명(이번에 1명 추가) · ASC 신규 초대 1(Marketing · GH Trade 한정) + 기존 사용자/초대 1 · TestFlight 내부 그룹 추가 0(수락 대기 — 22-09 를 막지 않음) · dma_credentials 발급 0(D-04)"
  - "22-08: 본인 기기 확인 중 발견한 본문 스크롤 불가 · 상태바 아래 빈 띠 중복은 별도 /gsd-debug 커밋 798f911f(웹 전용)로 수정 — 앱이 운영 웹 URL 을 불러오므로 웹 배포로 설치본에 반영, 새 APK 불필요"
  - "22-08: 그 디버그 세션이 master 를 push 해 origin/master = 798f911f · 운영 웹 배포됨 — 22-10 push 결정 게이트가 선점됐고 /privacy 는 시행일 자리표시 「2026년 ○월 ○일」 그대로 200. 22-10 이 시행일(첫 공개 배포일 2026-09-27 KST 기본)을 채워 재배포해야 한다"

patterns-established:
  - "웹 전용 수정은 설치본(Capacitor · 운영 URL 로드)에 웹 배포로 반영된다 — 네이티브 셸 변경이 아니면 새 APK/IPA 불필요"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "README 「릴리스」 절 · 테스터 안내 · 비밀 파일 · 범위 밖 갱신 — 필수 문구 15개 · 이메일 0 · 비밀 패턴 0 · 위생 통과"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "Task 1 verify 2 — README 필수 문구 15개 grep(누락 0) · check-release-hygiene.sh RELEASE HYGIENE OK · 이메일 정규식 0 · PASSWORD=/BEGIN PRIVATE KEY/private_key 0 · 'release 서명 자동화' 0 · '범위 밖 (Phase 21 · 22 Deferred)' 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "google-client-ids.ts 주석 D-14 갱신 — 상수 4개 · export 불변, 단위 테스트 통과"
    requirement: MOBILE-02
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/google-client-ids.test.ts (10 passed)"
        status: pass
      - kind: other
        ref: "export const 줄 diff 23a21f83 대비 없음 · grep -c 'Phase 22 D-14' = 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "Firebase SA 자격 유효 · 최신 릴리스 = 22-07 versionCode"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "bash mobile/scripts/release-android.sh firebase-latest → latest Firebase build 609271311"
        status: pass
    human_judgment: false
  - id: D4
    description: "본인 Android 실기에서 Firebase 설치본 Google 로그인 통과 뒤에만 테스터 편입(Firebase 3 · ASC 초대 1 · OAuth 테스트 사용자 3 · dma_credentials 0)"
    requirement: MOBILE-02
    verification:
      - kind: manual_procedural
        ref: "사용자 재개 신호 done ownerAndroid=ok firebaseTesters=3 ascInvites=1 consentTestUsers=3 · adb 로 설치본 versionCode 609271311 확인(2026-09-27 14:22 설치)"
        status: pass
    human_judgment: true
    rationale: "사람 계정·콘솔 조작·실기 UI 흐름이라 자동 검사로 증명할 수 없다 — 사용자 보고(명수)로만 확인"

duration: 2h 16m
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 08: 릴리스 문서 · 테스터 편입 Summary

**`mobile/README.md` 에 TestFlight · Firebase APK 릴리스 절차와 테스터에게 그대로 보낼 안내(iPhone 3단계 · Android 4단계)를 한 문서로 남기고, 본인 Galaxy S10e 에서 Firebase 설치본 609271311 의 Google 로그인이 통과한 뒤 테스터를 편입했다(Firebase 3명 · ASC 신규 초대 1 · OAuth 테스트 사용자 3명 · 트레이딩 권한 0)**

## Performance

- **Duration:** 2h 16m (Task 2 사람 확인·콘솔 작업 대기, 별도 디버그 세션 포함 — 순수 실행은 짧다)
- **Started:** 2026-09-27T04:16:45Z
- **Completed:** 2026-09-27T06:33:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- README 「릴리스」 절: 명령표(`native:release:ios` · `:android` · `:android:aab` · `:android:play`) · 처음 1회 순서 · 업데이트 절차(빌드 번호 자동 · TestFlight 90일 · Firebase 150일 만료) · 비밀 파일 표(이름·권한만) · 문제 해결 · 테스터 안내 · Phase 23 Play 이관 시 재설치 1회와 2027 사이드로드 인증 확대 경고
- `google-client-ids.ts` 주석이 업로드 키 SHA-1 Android 클라이언트 등록 사실(D-14)로 바뀌었고 상수는 그대로다
- 본인 실기 게이트 통과 → 테스터 편입. Firebase SA 자격이 여전히 유효하고 최신 릴리스는 609271311

## Task Commits

1. **Task 1: README 릴리스 절 · 테스터 안내 · 비밀 파일 · 범위 밖 갱신 + client-ids D-14 주석** - `d9b134c3` (docs)
2. **Task 2: 본인 Android 로그인 확인 → 테스터 초대** - 커밋 없음(사람 확인·콘솔 작업 · 재개 뒤 검사만)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

참고: 범위 `23a21f83..HEAD` 에는 22-08 이 아닌 `798f911f`(별도 /gsd-debug 세션 fix)가 끼어 있다.

## Files Created/Modified

- `mobile/README.md` - 「릴리스 (TestFlight · Firebase APK — Phase 22)」 절 · 테스터 안내 · 「비밀 파일」 보강 · 「범위 밖 (Phase 21 · 22 Deferred)」
- `webapp/src/lib/native/google-client-ids.ts` - 머리 주석 Android 절 마지막 문장 교체(Phase 22 D-14) · 상수 4개 불변

## Decisions Made

재개 신호(명수만): `done ownerAndroid=ok firebaseTesters=3 ascInvites=1 consentTestUsers=3`

- **본인 Android 로그인:** 통과. 기기 Galaxy S10e · Android 12 · WebView 153. Firebase 초대 수락 → release APK versionCode **609271311** 설치(adb 확인 · 2026-09-27 14:22) → 「Google로 로그인」 → 홈 착지
- **Play 프로텍트 경고:** 보고된 경고 문구 없음(FA-A3 — 기록할 문구 없음)
- **Firebase 테스터:** 그룹 `ghtrade-testers` 총 **3명**(본인 + 2). 나머지 2명은 2026-09-27 14:35 KST 무렵 활동 — 즉 스크롤 수정 전의 현재 릴리스 609271311 에 초대됐다. Firebase 릴리스는 609271311 하나뿐
- **ASC 초대:** 신규 **1**(역할 Marketing · 앱 액세스 GH Trade 한정) + 이미 사용자/초대된 1명. TestFlight 내부 그룹 `GH Trade 테스터` 추가는 **0**(수락 대기 — 22-09 를 막지 않는다)
- **OAuth 테스트 사용자:** 총 **3명**(이번에 1명 추가 · 동의 화면 「테스트」 상태)
- **`dma_credentials`:** 누구에게도 발급하지 않음(D-04)

## Deviations from Plan

### 계획 밖 사건(이 플랜 밖에서 처리)

**1. [본인 기기 확인 중 발견 — 별도 /gsd-debug 세션에서 수정] Android 앱 본문 스크롤 불가 · 상태바 아래 빈 띠 중복**
- **Found during:** Task 2 (본인 Galaxy S10e 설치본 확인)
- **Issue:** 본문이 스와이프로 스크롤되지 않고, 상태바 아래에 빈 띠가 두 번 들어갔다
- **Fix (798f911f `fix(native): Android 앱 본문 스크롤 불가 · 상태바 아래 빈 띠 중복 수정`):** 웹 전용 — `overscroll-behavior-y` 봉쇄를 iOS 로 한정(Chromium 144+ 가 본문 스와이프를 막았다) · `--app-safe-top/left/right` 를 `env()` 만으로(edge-to-edge 가 아닌 Android ≤14 에서 상태바 inset 이 두 번 들어갔다)
- **Files modified:** webapp/src/styles/globals.css · webapp/src/app/layout.tsx · webapp/e2e/specs/native-shell.spec.ts · tasks/lessons.md
- **설치본 반영:** 앱이 운영 웹 URL 을 불러오므로 웹 배포로 이미 설치된 앱에 반영된다 — 새 APK 불필요(22-09 두 번째 릴리스는 원래 계획대로)
- **Committed in:** 798f911f (22-08 커밋 아님)

**2. [기록 — 22-10 인계] 디버그 세션의 push 로 22-10 push 결정 게이트가 선점됨**
- 그 세션이 master 를 push 해 `origin/master = 798f911f` — Phase 22 커밋 전부가 origin 에 있고 webapp 이 운영 배포됐다
- 운영 `https://trade.jx1.io/privacy` 는 200 이지만 시행일 자리표시 「2026년 ○월 ○일」 이 그대로 보인다
- **22-10 이 할 일:** 시행일을 채워 재배포. 시행일은 사용자가 달리 정하지 않으면 첫 공개 배포일 **2026-09-27 (KST)**

**3. [기록] Task 1 verify 3 기준점** — 계획은 상수 불변을 `origin/master` 와 비교하지만, push 로 origin/master 가 이미 d9b134c3 를 포함해 비교가 자명해졌다. 플랜 시작 전 기준 `23a21f83` 과 `export const` 줄을 비교해 불변을 확인했다(diff 없음).

**4. [기록] 보호 브랜치(master) 커밋** — config `git.branching_strategy: none` · 이전 플랜과 같은 관례(이 실행기는 push 하지 않음).

---

**Total deviations:** 0 auto-fixed · 계획 밖 사건 1(별도 세션 수정) + 기록 3
**Impact on plan:** 플랜 범위 변화 없음. 22-10 의 push 게이트 전제가 바뀌었다(이미 배포됨 → 시행일 채움 후 재배포).

## Issues Encountered

- 본인 기기에서 본문 스크롤 불가 · 상태바 빈 띠 중복 — 위 1번, 798f911f 로 해결(웹 배포로 설치본 반영)

## User Setup Required

None - 테스터 편입은 콘솔에서 끝났다(명수는 위 결정 절). ASC 초대 수락 뒤 TestFlight 내부 그룹 `GH Trade 테스터` 에 추가하는 일만 남았다(22-09 비차단).

## Next Phase Readiness

- **22-09:** 두 번째 릴리스(번호 엄격 증가)를 올리면 Firebase 그룹 3명에게 새 빌드 메일이 간다. ASC 신규 초대 수락 여부와 무관하게 진행 가능
- **22-10:** push 게이트는 이미 선점됨 — `/privacy` 시행일(기본 2026-09-27 KST)을 채워 재배포
- 참고(계획 밖): 오케스트레이터가 사용자 iPad(iPad Pro 11 3세대)를 팀에 등록한 뒤 개발 서명 Release 빌드를 devicectl 로 설치했다 — TestFlight 경로와 무관

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*

## Self-Check: PASSED

- 파일: mobile/README.md · webapp/src/lib/native/google-client-ids.ts · 22-08-SUMMARY.md 존재
- 커밋: d9b134c3(22-08 Task 1) · 798f911f(계획 밖 fix) 존재
- 검사: firebase-latest → latest Firebase build 609271311 · README 이메일 0 · 비밀 패턴 0 · RELEASE HYGIENE OK · client-ids 테스트 10 passed · 상수 불변 · SUMMARY 이메일 0
