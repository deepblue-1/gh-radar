---
phase: 40-fill-push-notification
plan: 13
subsystem: mobile
tags: [ios, apns, entitlements, xcode, fastlane, capacitor]

requires:
  - phase: 22
    provides: "check-sim-entitlements.sh · check-ipa.sh · iOS Fastfile beta lane"
provides:
  - "mobile/ios/App/App/App.entitlements (aps-environment)"
  - "pbxproj App 타깃 Debug · Release CODE_SIGN_ENTITLEMENTS = App/App.entitlements"
  - "AppDelegate 원격 알림 등록 성공 · 실패 → Capacitor 알림"
  - "check-sim-entitlements.sh aps-environment 단언"
  - "check-ipa.sh aps-environment production · iOS Firebase 0 단언"
  - "iOS Fastfile env GHTRADE_FORCE_PROFILE"
affects: [40-03, 40-08, 40-10, 40-12]

actuals:
  tokens: 2100
  tasks: 2
  commits: 2
plan_head_before: 617542dbe56857851fce6e94129cbb2ba7c39eab
plan_head_after: ae3572a1937971d15393334edd3b9b38d1764767

tech-stack:
  added: []
  patterns:
    - "APNs 토큰은 AppDelegate → NotificationCenter(.capacitorDidRegisterForRemoteNotifications) → 플러그인 registration 이벤트"

key-files:
  created:
    - mobile/ios/App/App/App.entitlements
  modified:
    - mobile/ios/App/App.xcodeproj/project.pbxproj
    - mobile/ios/App/App/AppDelegate.swift
    - mobile/scripts/check-sim-entitlements.sh
    - mobile/scripts/check-ipa.sh
    - mobile/ios/App/fastlane/Fastfile

key-decisions:
  - "App.entitlements 값은 development — App Store export 가 프로파일 값(production)으로 바꾼다 · IPA 검사가 production 을 단언"
  - "check-sim-entitlements.sh 는 application-identifier 통과 뒤 aps-environment 를 따로 단언(실패 문구를 나눠 원인이 보이게)"

patterns-established:
  - "IPA 검사의 Firebase 0 단언: Frameworks/Firebase* · 번들 안 GoogleService-Info.plist 둘 다"

requirements-completed: [SC-1, SC-5]

coverage:
  - id: D1
    description: "iOS 시뮬레이터 빌드 실행 파일 엔타이틀먼트에 aps-environment 가 실린다(App.entitlements · CODE_SIGN_ENTITLEMENTS Debug/Release)"
    requirement: "SC-1"
    verification:
      - kind: automated_ui
        ref: "xcodebuild … build (BUILD SUCCEEDED) && bash mobile/scripts/check-sim-entitlements.sh"
        status: pass
    human_judgment: false
  - id: D2
    description: "AppDelegate 가 APNs 등록 성공 · 실패를 Capacitor 알림으로 넘긴다"
    requirement: "SC-1"
    verification:
      - kind: other
        ref: "시뮬레이터 빌드 컴파일 통과 · 실기기 토큰 수신은 40-12"
        status: pass
    human_judgment: true
    rationale: "실제 APNs 토큰 수신은 실기기 + App ID Push 가 있어야 확인된다(40-12 UAT)"
  - id: D3
    description: "릴리스 IPA 검사가 aps-environment production 과 iOS Firebase 0 을 단언"
    requirement: "SC-5"
    verification:
      - kind: other
        ref: "시뮬레이터 앱으로 만든 가짜 IPA 에 check-ipa.sh — aps-environment 실패 줄 · GoogleService-Info.plist 추가 시 Firebase 실패 줄"
        status: pass
    human_judgment: false
  - id: D4
    description: "iOS Fastfile GHTRADE_FORCE_PROFILE=1 일 때만 배포 프로파일 재생성 · 위생 검사 회귀 없음"
    requirement: "SC-5"
    verification:
      - kind: other
        ref: "bash mobile/scripts/check-release-hygiene.sh → RELEASE HYGIENE OK"
        status: pass
    human_judgment: false

duration: 75min
completed: 2026-11-07
status: complete
---

# Phase 40 Plan 13: iOS Push 셸 Summary

**iOS 앱에 aps-environment 엔타이틀먼트(Debug · Release)와 AppDelegate APNs 등록 2 메서드를 넣고, 시뮬레이터 빌드 검사 · 릴리스 IPA 검사가 Push 누락과 iOS Firebase 혼입을 막게 했다 — Fastfile 은 GHTRADE_FORCE_PROFILE=1 일 때만 프로파일을 다시 만든다.**

## Performance

- **Duration:** 약 75분(대부분 SwiftPM 패키지 해석 정지 대응)
- **Started:** 2026-11-07T07:33Z 무렵
- **Completed:** 2026-11-07
- **Tasks:** 2
- **Files modified:** 6 (생성 1 · 수정 5)

## Accomplishments

- `App.entitlements`(`aps-environment` = `development`) 신규 · pbxproj 에 파일 참조 · App 그룹 children · Debug/Release `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;`
- `AppDelegate` 에 `didRegisterForRemoteNotificationsWithDeviceToken` → `.capacitorDidRegisterForRemoteNotifications` · `didFailToRegisterForRemoteNotificationsWithError` → `.capacitorDidFailToRegisterForRemoteNotifications`
- `check-sim-entitlements.sh` 가 aps-environment 없으면 `SIM ENTITLEMENTS FAIL — aps-environment 없음(…)` 로 exit 1
- `check-ipa.sh` 가 aps-environment ≠ production · iOS 번들 Firebase(`Frameworks/Firebase*` · `GoogleService-Info.plist`) 를 실패로 잡는다
- iOS Fastfile `get_provisioning_profile` 에 `force: ENV["GHTRADE_FORCE_PROFILE"] == "1",`

## Task Commits

1. **Task 1 (tracer): iOS Push 한 줄기** — `80c3dd70` (feat)
2. **Task 2: 릴리스 쪽 잠금** — `ae3572a1` (feat)

## pbxproj 새 ID

- `7A40E5C12F0D4B2E00A1F340` — `App.entitlements` PBXFileReference(`lastKnownFileType = text.plist.entitlements`) · App 그룹 children(Info.plist 다음). 기존 ID 와 겹침 0 확인.

## 검증

- 시뮬레이터 빌드 **실행함** — `** BUILD SUCCEEDED **` 뒤 `check-sim-entitlements.sh` 끝 줄 원문:
  `SIM ENTITLEMENTS OK application-identifier=954QPCS3F5.com.ghtrade.app aps-environment`
- Tracer 게이트: 위 끝 줄로 끝까지 확인한 뒤 Task 2 로 넘어감.
- `bash mobile/scripts/check-release-hygiene.sh` → `RELEASE HYGIENE OK — … 업로드 전 검사 순서` (위생 검사는 읽고 돌리기만 함)
- `check-ipa.sh` 실패 경로: 시뮬레이터 앱으로 만든 가짜 IPA(스크래치패드) → `IPA CHECK FAIL — aps-environment 가 production 이 아니다 …` · 번들에 빈 `GoogleService-Info.plist` 추가 시 `IPA CHECK FAIL — iOS 번들에 Firebase 가 있다 …` 확인. 실제 통과(`IPA CHECK OK`)는 40-12 첫 릴리스.
- acceptance grep 수치: entitlements `<key>aps-environment</key>` 1 · pbxproj CODE_SIGN_ENTITLEMENTS 2 · AppDelegate 두 메서드 각 1 · check-sim aps-environment 4 · check-ipa aps-environment 4 / `<string>production</string>` 1 / GoogleService-Info.plist 1 · Fastfile force 줄 1.
- `cap sync ios` 로 바뀐 추적 파일 없음(`git status` 확인 — 40-03 소유 생성물 되돌릴 일 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 시뮬레이터 빌드를 `native:build:ios` 스크립트 그대로가 아니라 같은 단계 + 개별 SwiftPM 캐시로 돌림**
- **Found during:** Task 1 verify
- **Issue:** `pnpm run native:build:ios` 의 xcodebuild 가 공용 SwiftPM 캐시(`~/Library/Caches/org.swift.swiftpm`)의 Capacitor/Cordova xcframework 아티팩트 다운로드에서 CPU 0 으로 멈춤(두 번 — 샌드박스 해제해도 동일, GitHub 직접 curl 은 0.3초). 같은 Wave 의 40-03 도 같은 정지를 겪었다.
- **Fix:** 멈춘 내 빌드만 종료 · 이 worktree 의 `mobile/ios/DerivedData`(gitignore) 삭제 후 `cap sync ios`(env 없음 · 스크립트와 같음) → `xcodebuild … -derivedDataPath <절대> -packageCachePath <절대>/SPMCache -packageAuthorizationProvider netrc build` → `bash scripts/check-sim-entitlements.sh`. 상대 경로 `-packageCachePath` 는 패키지 해석을 건너뛰어 `Missing package product 'CapApp-SPM'` 로 실패했다 — 절대 경로여야 한다.
- **Files modified:** 없음(빌드 명령만 — `package.json` 은 40-03 소유라 손대지 않음)
- **Commit:** 해당 없음

**운영 메모:** 동시 에이전트가 같은 스크래치패드 파일명(`ios-build.log`)을 써서 첫 로그가 섞였다 — 이후 `ios-build-40-13*.log` 로 분리.

## Issues Encountered

- 공용 SwiftPM 아티팩트 캐시 정지는 이 플랜 변경과 무관한 환경 문제다. 메인 트리에서 `native:build:ios` 가 같은 곳에서 멈추면 `~/Library/Caches/org.swift.swiftpm` 아티팩트 쪽을 먼저 의심할 것(40-12 릴리스 전 확인 권장).

## Next Phase Readiness

- 40-10 `registerPushToken` 이 받을 iOS registration 이벤트의 네이티브 쪽이 준비됨(플러그인 자체는 40-03).
- 40-12: App ID Push 켠 뒤 첫 릴리스는 `GHTRADE_FORCE_PROFILE=1` · `IPA CHECK OK` 확인 · 실기기 APNs 토큰 수신 UAT.
- 40-08: `check-ipa.sh` Firebase 문구 「iOS 번들에 Firebase 가 있다 — Phase 40 SC-5 · Firebase 는 Android 만」 에 맞춘다.

## Self-Check: PASSED

- FOUND: mobile/ios/App/App/App.entitlements
- FOUND: 80c3dd70 · ae3572a1 (HEAD 조상)
