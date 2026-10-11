---
phase: 22-gh-trade-ios-testflight-android-play
plan: 06
subsystem: mobile-release
tags: [fastlane, testflight, ios, app-store-connect, spaceship, release-pipeline]

requires:
  - phase: 22-01
    provides: "lane beta · release-ios.sh(env 이름 검사 · exit 3) · ios.env/ASC 키(저장소 밖) · TestFlight 첫 빌드 202609270252"
provides:
  - "fastlane lane latest — 최신 TestFlight 빌드 번호 + 처리 상태 한 줄(조회 전용)"
  - "release-ios.sh [beta|latest] — 인자 없음 = beta · 모르는 모드 exit 2(env 로드 전)"
  - "22-01 빌드 202609270252 TestFlight 처리 완료(VALID) 확인 — 내부 그룹 자동 배포 전제 성립"
affects: [22-08, 22-09]

actuals:
  tokens: 730      # chars/4 — bcb67d49 의 추가 줄 2,927자(2개 파일)
  tasks: 2
  commits: 1       # MEASURED: git rev-list --count 68b8008e..HEAD (SUMMARY 커밋 전) — Task 2 는 조회 전용이라 코드 커밋 없음
plan_head_before: 68b8008e915b909aa894343cc13600175b08c0c0

tech-stack:
  added: []
  patterns:
    - "릴리스 래퍼 모드: MODE=${1:-beta} + case 검사를 cd·env 로드 앞에 둔다 — 모르는 모드 exit 2 (release-android.sh 와 같은 구조)"
    - "조회 lane 은 app_store_connect_api_key → latest_testflight_build_number → Spaceship Build.all 만 부르고 산출 경로에 쓰지 않는다"
    - "출력 계약: 「latest TestFlight build {번호} state {상태}」 한 줄 — 22-09 가 grep 한다"

key-files:
  created: []
  modified:
    - mobile/ios/App/fastlane/Fastfile
    - mobile/scripts/release-ios.sh

key-decisions:
  - "22-06: Spaceship(fastlane 2.240.1) 실측 — Build.all 키워드 인자 client · app_id · version · build_number · platform · processing_states · includes · sort · limit / ProcessingState 상수 INVALID · PROCESSING · FAILED · VALID"
  - "22-06: 22-01 빌드 202609270252 = VALID (2026-09-27 11:50:06 KST 첫 조회에서 확인 · 대기 0분 · 업로드 후 약 9시간)"
  - "22-06: latest lane 은 GHTRADE_RELEASE_OUT 을 검사하지 않는다(쓰지 않으므로) — 래퍼의 exit 3 env 검사는 두 모드 공통으로 그대로 둔다"

patterns-established:
  - "조회 전용 lane 의 비밀 비출력 검증: env 를 서브셸에서 source 한 뒤 출력 로그에 대한 grep -cF 개수만 확인(값 비출력)"

requirements-completed: [MOBILE-02]

coverage:
  - id: D1
    description: "release-ios.sh 모드 계약 — 모르는 모드 exit 2(env 로드 전) · latest env 누락 exit 3(주입 안내 · lane 미시작) · 인자 없음 = beta 경로(exit 3)"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "bash -n mobile/scripts/release-ios.sh"
        status: pass
      - kind: integration
        ref: "GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-x bash mobile/scripts/release-ios.sh nope → rc 2 · 사용법에 latest"
        status: pass
      - kind: integration
        ref: "GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-x bash mobile/scripts/release-ios.sh latest → rc 3 · 'setup-release-secrets.sh dir asc' · 'Driving the lane' 없음"
        status: pass
      - kind: integration
        ref: "GHTRADE_RELEASE_ENV=/nonexistent/gh-trade-x bash mobile/scripts/release-ios.sh → rc 3"
        status: pass
    human_judgment: false
  - id: D2
    description: "lane latest 가 조회 전용(업로드·빌드·프로파일 액션 없음)이고 최신 TestFlight 빌드 번호·처리 상태를 한 줄로 낸다 — ASC 키 ID·발급자 ID 비출력"
    requirement: MOBILE-02
    verification:
      - kind: other
        ref: "awk '/lane :latest do/,/^  end$/' mobile/ios/App/fastlane/Fastfile | grep -cE 'upload_to_testflight|build_app|get_provisioning_profile' → 0"
        status: pass
      - kind: integration
        ref: "bash mobile/scripts/release-ios.sh latest → rc 0 · 출력 로그에서 ASC_KEY_ID · ASC_ISSUER_ID 값 grep -cF 0건"
        status: pass
    human_judgment: false
  - id: D3
    description: "22-01 TestFlight 빌드 202609270252 처리 완료(VALID) · Info.plist · pbxproj 무변경"
    requirement: MOBILE-02
    verification:
      - kind: integration
        ref: "bash mobile/scripts/release-ios.sh latest 2>&1 | grep -q 'latest TestFlight build 202609270252 state VALID'"
        status: pass
      - kind: other
        ref: "test -z \"$(git status --porcelain -- mobile/ios/App/App/Info.plist mobile/ios/App/App.xcodeproj/project.pbxproj)\""
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-09-27
status: complete
---

# Phase 22 Plan 06: iOS latest lane · TestFlight 처리 완료 확인 Summary

**fastlane lane `latest`(ASC API 키 → `latest_testflight_build_number` → Spaceship `Build.all` 처리 상태)와 `release-ios.sh [beta|latest]` 모드를 더해, 명령 한 번으로 `latest TestFlight build 202609270252 state VALID` 를 확인했다 — 22-01 첫 빌드는 처리 완료 상태라 내부 그룹 자동 배포 전제가 섰다.**

## Performance

- **Duration:** 약 2분(실행 구간)
- **Started:** 2026-09-27T02:48:46Z
- **Completed:** 2026-09-27T02:50:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `release-ios.sh latest` 가 업로드·아카이브·check-ipa 없이 최신 TestFlight 빌드 번호와 처리 상태를 한 줄로 낸다(22-09 두 번째 빌드 확인에 그대로 쓴다).
- 모드 검사를 env 로드 앞에 두어 오타가 기본 업로드(beta)로 떨어지지 않는다(exit 2). 기존 beta 경로·exit 3 규약·비밀 비출력 규약은 그대로다.
- 22-01 빌드 `202609270252` 가 App Store Connect 에서 `VALID`(처리 완료)로 확인됐다.

## Task Commits

1. **Task 1: iOS lane `latest` · `release-ios.sh [beta|latest]`** — `bcb67d49` (feat)
2. **Task 2: 202609270252 처리 완료 확인** — 커밋 없음(조회 전용 · 결과는 이 SUMMARY)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified
- `mobile/ios/App/fastlane/Fastfile` — 머리 주석에 lane 목록(beta · latest) · `lane :latest`(ASC 키 이름 검사 → API 키 → 최신 빌드 번호 → `Build.all(app_id:, build_number:)` 로 `processing_state`, 못 찾으면 `UNKNOWN`) 추가. beta 는 무변경.
- `mobile/scripts/release-ios.sh` — 헤더에 사용법·모드·종료 코드 2 추가, 맨 앞 `MODE="${1:-beta}"` + case(모르는 모드 stderr 사용법 · exit 2), 끝에서 latest 면 `fastlane latest` 만 실행.

## Decisions Made

- **확인한 Spaceship 인자(fastlane 2.240.1 실측):** `Spaceship::ConnectAPI::Build.all` 키워드 인자 = `client` · `app_id` · `version` · `build_number` · `platform` · `processing_states` · `includes` · `sort` · `limit`. `Build::ProcessingState` 상수 = `INVALID` · `PROCESSING` · `FAILED` · `VALID`. `Token.from(hash:, filepath:)`. lane 은 이 중 `app_id` · `build_number` 만 쓴다.
- **처리 상태 결과:** `latest TestFlight build 202609270252 state VALID`
  - 확인 시각: 2026-09-27 11:50:06 KST (첫 조회)
  - 기다린 시간: 0분 — 첫 조회에서 이미 VALID(업로드 2026-09-27 02:54:19 KST 뒤 약 9시간). PROCESSING 반복 대기는 필요 없었다.
  - 최신 빌드 번호가 22-01 업로드 번호와 같다 — 이 phase 밖 업로드 없음.
- ITMS-91053 등 처리 실패는 없었다(VALID). `PrivacyInfo.xcprivacy` 는 Deferred 그대로 — 추가하지 않았다.
- latest lane 은 `GHTRADE_RELEASE_OUT` 을 검사·사용하지 않는다(쓰지 않으므로). 래퍼 쪽 env 검사(4개 키 · exit 3)는 플랜대로 두 모드 공통이다.

## Deviations from Plan

None - plan executed exactly as written.

참고(코드 변경 없음): acceptance 의 `grep -c 'MODE="${1:-beta}"'` 는 macOS BSD grep 의 기본 정규식에서 `{1` 을 구간 표현으로 읽어 0 을 낸다 — 이미 같은 줄이 있는 `release-android.sh` 에서도 0 이다. 고정 문자열 `grep -cF 'MODE="${1:-beta}"' mobile/scripts/release-ios.sh` 로 1 을 확인했다.

## Issues Encountered

- 없음. 커밋은 오케스트레이터 지시대로 master 에 했다(`git.base-branch --is-protected master` = true 지만 이 프로젝트는 branching_strategy none · 순차 실행 · push 없음).

## Threat Flags

없음 — 새 표면은 ASC API 읽기 조회뿐이고 플랜 위협 등록부(T-22-02 · T-22-28 · T-22-07)가 다룬다. T-22-02 는 출력 로그에서 키 ID·발급자 ID 값 0건(개수만 확인)으로, T-22-28 은 exit 2 검증으로, T-22-07 은 Info.plist · pbxproj 무변경으로 확인했다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 22-08(테스터 초대 · 문서): TestFlight 첫 빌드가 VALID 라 내부 그룹 `GH Trade 테스터` 자동 배포·테스터 설치 확인(22-01 D5)을 진행할 수 있다.
- 22-09(두 번째 릴리스): `bash mobile/scripts/release-ios.sh latest` 로 두 번째 빌드 번호·처리 상태를 같은 한 줄 계약으로 확인한다.
- 22-05 는 Task 3 사용자 체크포인트에서 멈춰 있다(이 플랜과 파일 겹침 없음).

---
*Phase: 22-gh-trade-ios-testflight-android-play*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: mobile/ios/App/fastlane/Fastfile · mobile/scripts/release-ios.sh
- FOUND: bcb67d49
