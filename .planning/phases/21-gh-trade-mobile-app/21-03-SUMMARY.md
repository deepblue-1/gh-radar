---
phase: 21-gh-trade-mobile-app
plan: 03
subsystem: native-auth-config
tags: [google-oauth, supabase-auth, capacitor, social-login, gcp]
status: complete

requires:
  - phase: 21-01
    provides: "확정 번들/패키지 ID com.ghtrade.app"
  - phase: 21-02
    provides: "app-debug.apk — ~/.android/debug.keystore 로 서명(apksigner 로 SHA-1 대조)"
provides:
  - "GCP 프로젝트 gh-radar 의 iOS·Android OAuth 클라이언트(콘솔)"
  - "Supabase Google provider Authorized Client IDs = 웹,iOS,Android(웹 먼저) · Skip nonce checks off"
  - "webapp/src/lib/native/google-client-ids.ts — GOOGLE_WEB_CLIENT_ID · GOOGLE_IOS_CLIENT_ID · GOOGLE_ANDROID_CLIENT_ID · GOOGLE_IOS_URL_SCHEME"
affects: [21-15, 21-16]

actuals:
  tokens: 1272
  tasks: 3
  commits: 2
plan_head_before: ef8ce0a3fb6a829bef50d554cac3f2449b64bbdb

tech-stack:
  added: []
  patterns:
    - "공개 OAuth 클라이언트 ID 는 Vercel env 가 아니라 문자열 리터럴 상수 + 형식 단위 테스트로 고정"
    - "파생 값(iOS URL scheme)도 런타임 계산 없이 리터럴로 적고 테스트가 원본과의 역순 관계를 잠금"

key-files:
  created:
    - webapp/src/lib/native/google-client-ids.ts
    - webapp/src/lib/native/__tests__/google-client-ids.test.ts
  modified: []

key-decisions:
  - "Android debug SHA-1 = 83:1A:3B:99:1C:37:45:00:D4:6B:90:AC:49:CC:14:F0:F0:12:C3:D3 (~/.android/debug.keystore · alias androiddebugkey) — 21-02 app-debug.apk 서명자와 일치, signingConfig 오버라이드 없음"
  - "GCP gh-radar(1023658565518) 클라이언트: web=1023658565518-0c4lc5toseshoj6774omahf6ttpasv5g · ios=1023658565518-ch3hgiuq8kqk5r33c3e4er92uvkmdgrj · android=1023658565518-ntevj6d0cpj737e43qm4nok0ol87t4bn (.apps.googleusercontent.com) — 공개 식별자"
  - "Supabase Google provider Client IDs 를 web,ios,android 순서로 저장 — 기존 web 값은 바꾸지 않았고 GCP 웹 클라이언트와 같음을 확인"
  - "Supabase 「Skip nonce checks」 off 유지(T-21-09 · Pitfall 6)"
  - "OAuth 동의 화면 앱 이름은 gh-radar 유지(consent=kept) — 네이티브 계정 선택 화면에 gh-radar 로 보인다"
  - "release 서명 SHA-1 은 미등록 — 스토어 서명은 Deferred(T-21-27 accept)"

patterns-established:
  - "Google 클라이언트 ID 변경 시 3곳 동기화: google-client-ids.ts · Supabase Client IDs · (21-15) iOS Info.plist URL scheme"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — requirements.ready-ids 0/1(형제 플랜 미완)이라 표시하지 않음

coverage:
  - id: D1
    description: "iOS·Android OAuth 클라이언트 생성 + Supabase Authorized Client IDs(웹 먼저) 등록 · Skip nonce off"
    requirement: MOBILE-01
    human_judgment: true
    rationale: "콘솔 작업은 사용자가 수행했고 재개 신호로만 확인됐다. 실제 id_token aud 수락은 21-16 UAT(시뮬레이터·에뮬레이터 네이티브 로그인)에서 드러난다"
  - id: D2
    description: "공개 식별자 상수 4개 — 형식·공백 없음·서로 다름·같은 프로젝트 번호·iOS URL scheme 역순"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/google-client-ids.test.ts"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp typecheck"
        status: pass
    human_judgment: false

duration: 약 6h (체크포인트 대기 포함 · Task 3 실작업 약 3분)
completed: 2026-09-26
---

# Phase 21 Plan 03: 네이티브 Google 로그인 OAuth 선행 설정 Summary

**GCP `gh-radar` 에 iOS·Android OAuth 클라이언트를 만들고 Supabase Authorized Client IDs(웹,iOS,Android · nonce 검사 유지)에 등록했다. 세 공개 클라이언트 ID 와 iOS URL scheme 은 `google-client-ids.ts` 리터럴 상수로 고정했고, 테스트 10건이 형식과 역순 관계를 확인한다.**

## Performance

- **Duration:** 체크포인트(사람 콘솔 작업) 대기를 포함하면 여러 시간. 이어받은 Task 3 실작업은 약 3분
- **Started:** 2026-09-25 (Task 1 · 이전 실행기)
- **Completed:** 2026-09-26T06:43+09:00
- **Tasks:** 3 (Task 1 출력만 · Task 2 사람 작업 · Task 3 TDD)
- **Files modified:** 2 (신규)

## Accomplishments

- Android debug 키스토어 SHA-1 을 뽑았고, 21-02 `app-debug.apk` 서명자와 같다는 것을 apksigner 로 확인했다.
- 사용자가 GCP 에 iOS(`com.ghtrade.app`)·Android(`com.ghtrade.app` + debug SHA-1) OAuth 클라이언트를 만들었다. Supabase Google provider Client IDs 는 `web,ios,android` 로 저장했고 Skip nonce checks 는 끈 채로 두었다.
- `webapp/src/lib/native/google-client-ids.ts` 에 공개 식별자 4개를 문자열 리터럴로 두었다. 머리 주석에는 비밀이 아니라는 점, Supabase 와 동기화해야 한다는 점, Android aud 가 웹 ID 라는 점(A14), Vercel env 를 쓰지 않는 이유를 적었다.
- 단위 테스트 10건으로 다섯 가지를 확인한다: 정규식, 공백·개행 없음, 세 값이 서로 다름, 프로젝트 번호 1023658565518, iOS URL scheme 역순.

## Task Commits

1. **Task 1: Android debug SHA-1 추출.** 파일 변경이 없어 커밋하지 않았다(출력만).
2. **Task 2: GCP·Supabase 콘솔 설정.** 사람이 한 작업이라 커밋이 없다. 재개 신호는 `web=… ios=… android=… consent=kept skip-nonce=off` 였다.
3. **Task 3: 공개 식별자 상수 + 테스트 (TDD)**
   - RED `be2d087` (test): 실패 테스트와 빈 문자열 골격. `check tdd-red-evidence` 결과 RED_EVIDENCE_OK(10건 중 6건 단언 실패, 대상 테스트는 「GOOGLE_IOS_URL_SCHEME 역순」)
   - GREEN `81a0b1d` (feat): 실제 세 ID 와 iOS URL scheme 상수. 10/10 통과, webapp typecheck 통과

## Files Created/Modified

- `webapp/src/lib/native/google-client-ids.ts`: 웹·iOS·Android 클라이언트 ID 와 iOS URL scheme 공개 상수
- `webapp/src/lib/native/__tests__/google-client-ids.test.ts`: 형식·공백·중복·프로젝트 번호·역순 scheme 단언 10건

## Decisions Made

- **Android debug SHA-1:** `83:1A:3B:99:1C:37:45:00:D4:6B:90:AC:49:CC:14:F0:F0:12:C3:D3`. SHA-256 은 `05:C4:4D:2D:C5:16:A3:81:00:28:BD:54:AF:B9:7D:02:D2:0B:F4:3D:EA:02:FD:5F:EE:18:66:99:96:7C:77:C0`. 원본은 `~/.android/debug.keystore`(alias `androiddebugkey`)이고 저장소에는 넣지 않았다.
- **세 클라이언트 ID (공개):**
  - web `1023658565518-0c4lc5toseshoj6774omahf6ttpasv5g.apps.googleusercontent.com`
  - ios `1023658565518-ch3hgiuq8kqk5r33c3e4er92uvkmdgrj.apps.googleusercontent.com`
  - android `1023658565518-ntevj6d0cpj737e43qm4nok0ol87t4bn.apps.googleusercontent.com`
  - 오케스트레이터가 세 값 모두 `^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$` 에 맞고 서로 다르다는 것을 확인했다.
- **Supabase:** Client IDs 는 `web,ios,android` 순서(웹 먼저)다. 원래 있던 web 값은 바꾸지 않았고 GCP 웹 클라이언트와 같다는 것을 확인했다.
- **Skip nonce checks:** OFF 를 유지한다(T-21-09).
- **동의 화면 이름:** `gh-radar` 그대로 두었다(consent=kept).
- **release SHA-1:** 범위 밖(Deferred). release 빌드로 로그인하려면 이후 phase 에서 SHA-1 을 추가해야 한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 가 import 오류(INVALID_RED)로 끝나지 않도록 빈 골격을 RED 커밋에 넣음**
- **Found during:** Task 3 RED
- **Issue:** 플랜 문구대로 「상수 파일 없음」 상태에서 RED 를 돌리면 모듈 로드가 실패하고 테스트가 0건 실행된다. tdd.md #3770 기준으로는 INVALID_RED 다.
- **Fix:** 빈 문자열 export 4개만 있는 골격을 테스트와 함께 RED 커밋했다(21-01 과 같은 처리). 그 결과 6건이 단언 실패했고 판정은 RED_EVIDENCE_OK 였다.
- **Files modified:** webapp/src/lib/native/google-client-ids.ts
- **Commit:** be2d087

**2. [운영 메모] master 에 직접 커밋**
- 커밋 전 검사에서 `git.base-branch --is-protected master` 가 true 로 나왔다. 하지만 `.planning/config.json` 의 `branching_strategy` 가 `none` 이고, 오케스트레이터도 master 위에서 순차 실행하도록 지시했다. 21-01·21-02·21-04 도 같은 방식으로 진행했기 때문에 master 에 그대로 커밋했다. push 는 하지 않았다.

### USER-SETUP 파일

- 플랜의 `user_setup` 콘솔 작업은 Task 2 에서 사용자가 이미 끝냈다. 그래서 「Incomplete」 상태의 `21-USER-SETUP.md` 를 새로 만들지 않고, 완료 기록을 이 SUMMARY 의 Decisions 에 남겼다.

**Total deviations:** 1건 auto-fix(Rule 3), 운영 메모 1건. **Impact:** 산출물과 범위에는 변화가 없다.

## TDD Gate Compliance

- RED `be2d087` (test(21-03)) 다음에 GREEN `81a0b1d` (feat(21-03)) 가 왔다. REFACTOR 는 하지 않았다(리터럴 상수라 정리할 부분이 없다).
- RED 증거: `gsd-tools check tdd-red-evidence` 결과는 `RED_EVIDENCE_OK` / `target_test_failed` 였다. vitest `tap-flat` 출력에 `# tests 10 / # pass 4 / # fail 6` 요약을 덧붙여 판정했다.

## Issues Encountered

None.

## User Setup Required

없음 — 콘솔 설정(GCP OAuth 클라이언트 2개, Supabase Client IDs, nonce off)은 Task 2 에서 끝났다.

## Next Phase Readiness

- 21-15 네이티브 로그인은 `GOOGLE_WEB_CLIENT_ID`·`GOOGLE_IOS_CLIENT_ID` 를 import 해 SocialLogin `initialize` 에 넘기고, iOS Info.plist `CFBundleURLSchemes` 에 `GOOGLE_IOS_URL_SCHEME` 과 같은 값을 적으면 된다.
- 토큰이 실제로 받아들여지는지(aud·nonce)는 21-16 UAT 에서 확인한다.
- 다음 플랜: 21-05.

## Self-Check: PASSED

- FOUND: webapp/src/lib/native/google-client-ids.ts
- FOUND: webapp/src/lib/native/__tests__/google-client-ids.test.ts
- FOUND: be2d087 (test(21-03) RED)
- FOUND: 81a0b1d (feat(21-03) GREEN)
- 인수 기준: `apps.googleusercontent.com` 3줄 · `com.googleusercontent.apps.` 1줄 · `GOOGLE_.*SECRET` 0 · keystore/jks 가 git status 에 없음 — 모두 PASS
- 플랜 verify: `vitest --run src/lib/native/__tests__/google-client-ids.test.ts` 10/10 · `src/lib/native` 전체 47/47 · webapp typecheck exit 0
