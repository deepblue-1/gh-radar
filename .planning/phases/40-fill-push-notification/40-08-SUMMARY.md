---
phase: 40-fill-push-notification
plan: 08
subsystem: mobile
tags: [android, fcm, firebase, google-services-json, release-hygiene, notification-channel]

requires:
  - phase: 40-04
    provides: "저장소 밖 ~/.config/gh-trade/push/google-services.json (GSJ-OK · sha256 기록)"
  - phase: 40-03
    provides: "@capacitor/push-notifications 8.1.3 (Android 플러그인 · firebase-messaging 의존)"
  - phase: 40-13
    provides: "check-ipa.sh iOS Firebase 0 단언 문구"
provides:
  - "mobile/android/app/google-services.json 추적(Phase 22 D-17 Android 만 번복)"
  - "app/build.gradle 릴리스 가드 — 파일 없이 bundleRelease/assembleRelease 면 GradleException(Pitfall 7)"
  - "check-release-hygiene (2)(3)(8) 반전 · (11) iOS Firebase 0"
  - "check-apk.sh google_app_id 리소스 단언"
  - "Manifest POST_NOTIFICATIONS · default_notification_channel_id=fills · default_notification_icon=@drawable/ic_stat_ghtrade"
  - "variables.gradle firebaseMessagingVersion = '25.0.1'"
affects: [40-10, 40-12]

actuals:
  tokens: 4200
  tasks: 3
  commits: 3
plan_head_before: 857a2fdbba376dd7d2fdabd34b001e00d3c88bf8
plan_head_after: 13f06a445ecbe2a50d215539ac3ededb510fde42

tech-stack:
  added: []
  patterns:
    - "조건부 google-services apply 는 그대로 두고 taskGraph.whenReady 릴리스 가드로 「조용히 꺼짐」 을 막는다"
    - "공개 설정 파일 모양 검사는 node -e 로 위반 종류만 출력(값 비출력)"
    - "aapt2 dump resources 같은 큰 출력은 [[ \"$RES\" == *pat* ]] 로 매칭 — printf | grep -q 는 pipefail + SIGPIPE 로 오판"

key-files:
  created:
    - mobile/android/app/google-services.json
    - mobile/android/app/src/main/res/drawable/ic_stat_ghtrade.xml
  modified:
    - mobile/.gitignore
    - mobile/android/app/build.gradle
    - mobile/scripts/check-release-hygiene.sh
    - mobile/scripts/check-apk.sh
    - mobile/android/app/src/main/AndroidManifest.xml
    - mobile/android/variables.gradle

key-decisions:
  - "위생 검사 (3) 은 정확한 경로 mobile/android/app/google-services.json 한 줄만 grep -vx 로 예외 — 다른 위치 google-services.json · GoogleService-Info.plist · *service-account*.json 은 계속 실패"
  - "check-apk.sh google_app_id 검사는 셸 패턴 매칭 — 플랜 문구대로 printf | grep -q 를 쓰면 실제 리소스가 있는 APK 도 실패했다(pipefail SIGPIPE)"
  - "ic_stat_ghtrade 는 icon.svg 심볼을 바깥 원 반지름 ≈10(24 격자) 이 되도록 축척 ≈0.0295 · 선 1.6 · 그라데이션 쐐기는 뺐다(상태바는 알파만)"

patterns-established:
  - "릴리스 가드 음성 대조: GHTRADE_UPLOAD_STORE_FILE 가짜 값 + gradlew -m assembleRelease(dry-run) 로 서명 없이 가드만 확인"

requirements-completed: [SC-1, SC-5]

coverage:
  - id: D1
    description: "google-services.json 이 추적되고 ignore 되지 않으며 디버그 APK 에 google_app_id 리소스가 실린다(sha256 원본 일치)"
    requirement: "SC-5"
    verification:
      - kind: automated_ui
        ref: "git ls-files --error-unmatch · ! git check-ignore · gradlew assembleDebug · aapt2 dump resources → GSJ-APK-OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "google-services.json 없이 릴리스 태스크면 Gradle 실패(Pitfall 7) · 있으면 통과"
    requirement: "SC-5"
    verification:
      - kind: other
        ref: "GHTRADE_UPLOAD_STORE_FILE=/nonexistent.jks gradlew -m assembleRelease — 파일 없음 BUILD FAILED(가드 문구) · 파일 있음 BUILD SUCCESSFUL"
        status: pass
    human_judgment: false
  - id: D3
    description: "위생 검사가 Android 설정 파일을 요구 · 모양 검증하고 SA 키 · iOS Firebase 를 계속 막는다"
    requirement: "SC-5"
    verification:
      - kind: other
        ref: "bash mobile/scripts/check-release-hygiene.sh → OK(새 문구) · 파일 제거 음성 대조 exit 1 · 가짜 SA JSON 음성 대조 exit 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "릴리스 APK 검사가 google_app_id 리소스를 단언한다"
    requirement: "SC-5"
    verification:
      - kind: other
        ref: "check-apk.sh 디버그 APK → google_app_id 실패 줄 0 · resources.arsc 뺀 사본 → 실패 줄 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "병합 Manifest 에 POST_NOTIFICATIONS · default_notification_channel_id=fills · default_notification_icon=ic_stat_ghtrade · 소리 리소스 0"
    requirement: "SC-1"
    verification:
      - kind: automated_ui
        ref: "gradlew assembleDebug · aapt2 dump xmltree AndroidManifest.xml · ls res/raw = 0 → MANIFEST-OK 조건 전부 충족"
        status: pass
    human_judgment: false
  - id: D6
    description: "소형 아이콘이 상태바에서 심볼로 알아볼 수 있다"
    requirement: "SC-1"
    verification: []
    human_judgment: true
    rationale: "실기기 알림 표시는 40-12 UAT 에서 본다 — 여기서는 빌드 · 리소스 연결만 확인"

duration: 약 12분
completed: 2026-11-07
status: complete
---

# Phase 40 Plan 08: Android Firebase 켜기 Summary

**google-services.json 을 저장소에 추적하고(sha256 원본 일치), 위생 검사를 「없어야 안전」 에서 「Android 파일은 있어야 하고 모양이 맞아야 안전 · SA 키 · iOS Firebase 는 계속 금지」 로 뒤집었으며, 파일 없는 릴리스는 Gradle 이 막고 Manifest 는 채널 `fills` · 단색 아이콘 · POST_NOTIFICATIONS 를 갖췄다.**

## Performance

- **Duration:** 약 12분
- **Completed:** 2026-11-07
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments

- `mobile/android/app/google-services.json` 추적 — 복사 뒤 sha256 `69e95dd8…37cc` 가 40-EXTERNAL-PREREQ 기록과 같음(REPO-SHA-OK). `.gitignore` 는 차단 줄 대신 `GoogleService-Info.plist` 차단.
- `app/build.gradle` 릴리스 가드(Pitfall 7) — 조건부 `apply plugin` 은 그대로라 디버그 · 파일 없는 체크아웃은 종전처럼 빌드.
- `check-release-hygiene.sh` (2) 20경로 · (3) 정확한 경로만 예외 + plist 차단 · (8) 존재 + 모양 검사 · (11) iOS Firebase 0 · OK 줄 새 문구.
- `check-apk.sh` google_app_id 단언.
- Manifest · 소형 아이콘 · `firebaseMessagingVersion = '25.0.1'`(플러그인 8.1.3 의 기본값과 같은 값 확인).

## Task Commits

1. **Task 1: google-services.json 추적 · 릴리스 가드 (tracer)** — `cc186f81`
2. **Task 2: 위생 검사 반전 · iOS Firebase 0 · APK google_app_id** — `189b2c2e`
3. **Task 3: Manifest 권한 · 채널 · 아이콘 · FCM 버전 고정** — `13f06a44`

## 검증 결과

| 검사 | 결과 |
|------|------|
| 원본 · 저장소 사본 sha256 대조 | SRC-SHA-OK · REPO-SHA-OK (음성 대조 뒤 복원 때마다 RESTORED-SHA-OK) |
| Task 1 verify (추적 · 비ignore · assembleDebug · google_app_id) | GSJ-APK-OK |
| 트레이서 게이트 (interactive · end-of-phase · 자동 verify 재실행) | 통과 → 확장 |
| 릴리스 가드 음성 대조 (파일 치움 + 가짜 서명 env · `-m assembleRelease`) | 가드 문구로 BUILD FAILED · 파일 복원 뒤 BUILD SUCCESSFUL |
| Task 2 verify (`bash -n` 둘 · 위생 검사 새 OK 줄) | HYGIENE-OK 조건 충족 |
| 위생 검사 음성 대조 ① 파일을 scratchpad 로 옮김 | exit 1 · 「RELEASE HYGIENE FAIL — mobile/android/app/google-services.json 이 없다 …」 → 원위치 뒤 OK |
| 위생 검사 음성 대조 ② 가짜 SA 모양 JSON 으로 교체 | exit 1 · project_id · 클라이언트 0개 · private_key · service_account 네 위반 모두 검출 → 원위치 뒤 OK |
| check-apk.sh 디버그 APK / resources.arsc 뺀 사본 | google_app_id 실패 줄 0 / 1 |
| Task 3 verify (assembleDebug · 병합 Manifest 권한 · 채널 meta-data · 위생 검사) | MANIFEST-OK 조건 충족 · 아이콘 meta-data → `drawable/ic_stat_ghtrade` |
| acceptance grep | `GoogleService-Info.plist` in .gitignore = 1 · `Pitfall 7` in build.gradle = 2 · `GoogleService-Info` in 위생 = 5 · `google_app_id` in check-apk = 3 · `firebase-appdistro-service-account.json` = 2 · 채널 = 1 · `fills` = 1 · 버전 = 1 · res/raw = 0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] check-apk.sh google_app_id 검사가 정상 APK 도 실패**
- **Found during:** Task 2
- **Issue:** 처음 `printf '%s\n' "$RES" | grep -q 'string/google_app_id'` 로 썼더니, `set -o pipefail` 아래 grep 이 일찍 끝나 printf 가 SIGPIPE 를 받아 파이프 전체가 실패 → 리소스가 있는 디버그 APK 에서도 「google_app_id 리소스가 없다」.
- **Fix:** `[[ "$RES" != *"string/google_app_id"* ]]` 셸 패턴 매칭 + 이유 주석.
- **Files modified:** mobile/scripts/check-apk.sh
- **Commit:** `189b2c2e`

### 참고(편차 아님)

- 플랜 acceptance 의 `grep -c "service-account\[^/\]\*\\\\.json"` 은 BSD grep 에서 HEAD 판에도 0 이 나오는 표기 문제다. 고정 문자열 `grep -cF 'service-account[^/]*\.json$'` = 1(HEAD 와 같음)로 SA 키 차단 유지를 확인했다.
- worktree 에 node_modules · cap sync 산출물이 없어 `pnpm install --frozen-lockfile --prefer-offline` 과 `cap sync android`(운영 URL · env 없음)를 돌렸다. 추적 파일 변경 0.

## Known Stubs

없음.

## Next Phase Readiness

- 40-10: 웹이 스위치를 켤 때 `createChannel({ id: 'fills', name: '체결 알림' })` — Manifest 기본 채널과 같은 id.
- 40-12: 실제 릴리스 APK/AAB 는 이 가드 · check-apk google_app_id 단언을 거친다. 실기기 알림 아이콘 모양은 UAT 에서 확인.

## Self-Check: PASSED

- FOUND: mobile/android/app/google-services.json · mobile/android/app/src/main/res/drawable/ic_stat_ghtrade.xml
- FOUND: cc186f81 · 189b2c2e · 13f06a44 (HEAD 조상)
