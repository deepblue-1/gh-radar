---
phase: 21-gh-trade-mobile-app
plan: 01
subsystem: mobile
tags: [capacitor, ios, wkwebview, scenedelegate, native-bridge, remote-url, tracer]

requires: []
provides:
  - "@gh-radar/mobile 패키지(native:* 스크립트 · Capacitor 8.5.2 정확 고정)"
  - "mobile/capacitor.config.ts — appId com.ghtrade.app · appName GH Trade · server.url 운영 기본 · CAP_SERVER_URL dev 전용 · SystemBars"
  - "iOS 프로젝트(Capacitor 8.5.2 SPM 템플릿 · UIScene) · SceneDelegate 루트 = GHTradeBridgeViewController()"
  - "GHTradeBridgeViewController · NativeMessageType · WeakScriptMessageHandler — ghTrade 채널(ready 수신 → os Logger)"
  - "webapp lib/native/native-detect.ts — NATIVE_DETECT_SCRIPT · isNativeApp · nativePlatform (layout <head> 인라인)"
  - "mobile/scripts/smoke-ios.sh — 「SMOKE OK ready platform=ios」 시뮬레이터 스모크"
affects: [21-02, 21-03, 21-04, 21-05, 21-06, 21-10, 21-11, 21-14, 21-15, 21-16]

actuals:
  tokens: 23000
  tasks: 3
  commits: 3
plan_head_before: 8b025ed21034eb72612ed220a5f012309bb85d3a

tech-stack:
  added: ["@capacitor/core 8.5.2", "@capacitor/ios 8.5.2", "@capacitor/android 8.5.2", "@capacitor/cli 8.5.2", "typescript ^5.9.3 (mobile devDep)", "capacitor-swift-pm 8.5.2 (SPM)"]
  patterns:
    - "웹이 스스로 감지: <head> 인라인 IIFE 가 window.Capacitor.isNativePlatform() 참일 때만 html.native-app + data-native-platform + ready 송신"
    - "웹→네이티브 메시지 = JSON 문자열 {type, payload} · 채널 우선순위 webkit.messageHandlers.ghTrade → window.GhTradeBridge"
    - "네이티브 수신 가드: 메인 프레임 · 문자열 JSON · NativeMessageType 화이트리스트 · 보낸 문서 호스트 == server.url 호스트"
    - "새 Swift 파일은 pbxproj 에 수동 등록(PBXFileReference · PBXBuildFile · App 그룹 children · Sources phase) — App 폴더가 동기화 그룹이 아님"
    - "dev sync 는 스모크 스크립트 안에서만, EXIT trap 으로 운영 URL 재sync (Pitfall 15)"

key-files:
  created:
    - mobile/package.json
    - mobile/tsconfig.json
    - mobile/capacitor.config.ts
    - mobile/.gitignore
    - mobile/www/index.html
    - mobile/scripts/smoke-ios.sh
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/ios/App/App.xcodeproj/project.pbxproj
    - mobile/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
    - mobile/ios/App/CapApp-SPM/Package.swift
    - webapp/src/lib/native/native-detect.ts
    - webapp/src/lib/native/__tests__/native-detect.test.ts
  modified:
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - webapp/src/app/layout.tsx
    - mobile/ios/App/App/SceneDelegate.swift
    - mobile/ios/App/App/Base.lproj/Main.storyboard

key-decisions:
  - "D-20 번들 ID = com.ghtrade.app 확정 (Apple Developer 팀 954QPCS3F5 「Hyun-joong Kim」 에 Explicit App ID 등록 완료, capability 없음)"
  - "패키지 정당성 승인: @capacitor/core·cli·ios·android 8.5.2 · @capgo/capacitor-social-login 8.5.11(21-15 설치) — install 스크립트 없음"
  - "iOS App 폴더는 PBXFileSystemSynchronizedRootGroup 이 아님 → 이후 플랜의 새 Swift 파일도 pbxproj 수동 등록"
  - "ATS 예외 불필요 — Info.plist 템플릿 그대로(http://localhost:3100 로드 성공)"
  - "앱 호스트 검사는 message.frameInfo.request.url?.host == bridge.config.serverURL.host (T-21-02)"

patterns-established:
  - "native-detect: 인라인 스크립트 문자열 + isNativeApp()/nativePlatform() 읽기 헬퍼 — 컴포넌트 JS 분기는 이 헬퍼로만"
  - "iOS 메시지 핸들러는 WeakScriptMessageHandler 래퍼로 등록(순환 참조 차단)"

requirements-completed: []

coverage:
  - id: D1
    description: "웹 <head> 네이티브 감지 스크립트 — 브라우저 무변화 · iOS/Android ready 송신 · throw 흡수 · isNativeApp/nativePlatform"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "webapp/src/lib/native/__tests__/native-detect.test.ts (8 tests)"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/webapp run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "iOS 셸 빌드 — Capacitor 8.5.2 SPM · SceneDelegate 루트 GHTradeBridgeViewController · 시뮬레이터 Debug 빌드"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios → ** BUILD SUCCEEDED **"
        status: pass
    human_judgment: false
  - id: D3
    description: "트레이서 end-to-end — 시뮬레이터 GH Trade 셸이 dev 웹(:3100)을 로드하고 웹의 ready 가 ghTrade 채널로 도착해 통합 로그에 기록, 종료 시 운영 URL 재sync"
    requirement: MOBILE-01
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:ios → SMOKE OK ready platform=ios (2회: PID 4275 · 7406) · 이후 ios/App/App/capacitor.config.json url=https://trade.jx1.io cleartext=false"
        status: pass
    human_judgment: false
  - id: D4
    description: "설정 보안 가드 — capacitor.config.ts 금지 키 0 · Info.plist 전면 허용 키 0 · 생성 파일 gitignore · vercel-ignore-build.sh 무수정"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "Task 3 acceptance_criteria grep/node/git check-ignore 12건"
        status: pass
    human_judgment: false

duration: 29min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 01: GH Trade iOS 셸 트레이서 Summary

**Capacitor 8.5.2 Remote-URL iOS 셸(`com.ghtrade.app`)이 SceneDelegate 로 세운 `GHTradeBridgeViewController` 안에서 웹을 로드하고, 웹 `<head>` 인라인 스크립트가 스스로 `html.native-app` 을 붙여 보낸 `ready` 가 `ghTrade` 채널로 도착해 시뮬레이터 통합 로그에 `ready platform=ios nativeApp=true` 로 찍히는 것까지 증명**

## Performance

- **Duration:** 29 min (Task 3 실행분 — Task 1·2 체크포인트는 이전 에이전트/사용자 처리)
- **Started:** 2026-09-25T14:44:39Z
- **Completed:** 2026-09-25T15:14:03Z (KST 2026-09-26 00:14)
- **Tasks:** 3 (Task 1·2 체크포인트 해소 · Task 3 트레이서)
- **Files modified:** 33 (생성 템플릿 포함 · 커밋 대상 30 + webapp 3)

## Accomplishments

- **트레이서 통과:** `native:smoke:ios` 「SMOKE OK ready platform=ios」 2회(서로 다른 PID) — 가장 위험한 가정 4개(Xcode 27 UIScene · SceneDelegate 코드 교체 · Remote-URL 원격 페이지에 native-bridge 주입 · 웹→네이티브 메시지 채널)가 성립한다. 스크린샷에서 dev 웹 `/login` 이 셸 안에 렌더됨을 확인.
- `mobile/` 워크스페이스 패키지 + Capacitor 8.5.2 정확 고정 + Remote-URL 설정(운영 기본, dev 는 `CAP_SERVER_URL`) + 최소 오프라인 폴백.
- `GHTradeBridgeViewController` — `ghTrade` 메시지를 메인 프레임·문자열 JSON·타입 화이트리스트·앱 호스트 일치로 걸러 `ready` 만 `Logger.notice`, 나머지 타입은 debug(21-10·21-11 이 채움).
- 웹 `NATIVE_DETECT_SCRIPT` · `isNativeApp` · `nativePlatform` + 단위 테스트 8건(TDD RED → GREEN).
- 스모크 스크립트가 종료 시 운영 URL 로 재sync — 실행 후 생성 설정이 `https://trade.jx1.io` · `cleartext:false` 임을 확인(Pitfall 15).

## Task Commits

1. **Task 1: D-20 번들 ID 확정** — 체크포인트(커밋 없음, 사용자 `confirm 팀=954QPCS3F5`)
2. **Task 2: 패키지 정당성 게이트** — 체크포인트(커밋 없음, 사용자 `approved`)
3. **Task 3 (tracer, TDD):**
   - RED `370c051` — test(21-01): 네이티브 감지 스크립트 실패 테스트 추가
   - GREEN `b3954ed` — feat(21-01): 웹 네이티브 감지 스크립트 구현 · `<head>` 주입
   - `8128d74` — feat(21-01): GH Trade iOS 셸 트레이서(mobile/ · cap add ios · GHTradeBridgeViewController · 스모크)

**Plan metadata:** (이 SUMMARY 커밋)

## Files Created/Modified

- `pnpm-workspace.yaml` — `- mobile` 추가(allowBuilds 변경 없음 — ERR_PNPM_IGNORED_BUILDS 미발생)
- `pnpm-lock.yaml` — Capacitor 4개 + typescript (추가만, 삭제 0)
- `mobile/package.json` — `@gh-radar/mobile`, `native:*` 스크립트 8개(build/typecheck/test/lint 없음)
- `mobile/tsconfig.json` · `mobile/capacitor.config.ts` · `mobile/www/index.html` · `mobile/.gitignore`
- `mobile/scripts/smoke-ios.sh` — dev sync → xcodebuild → simctl 설치·실행 → 통합 로그 대기(60초) → 스크린샷 → 판정, EXIT trap 운영 sync
- `mobile/ios/**` — `cap add ios` 생성물(템플릿) + `SceneDelegate.swift`(루트 교체) · `Main.storyboard`(customClass 보조) · `GHTradeBridgeViewController.swift`(신규) · `project.pbxproj`(수동 등록)
- `webapp/src/lib/native/native-detect.ts` · `__tests__/native-detect.test.ts` · `webapp/src/app/layout.tsx`(`<head><script id="gh-native-detect">`)

## 결정

| 항목 | 확정값 | 근거 |
|---|---|---|
| **번들 ID / appId (D-20)** | `com.ghtrade.app` | 사용자 `confirm 팀=954QPCS3F5` (2026-09-25) — developer.apple.com 에 Explicit App ID 등록 완료, Description 「GH Trade」, capability 미설정 |
| **Apple 팀** | `954QPCS3F5` — 「Hyun-joong Kim」, 유료 Apple Developer Program(개인), 만료 2027-03-25 | 21-03 · 21-15 · 실기기 서명이 이 값을 쓴다 |
| **승인 패키지 버전** | `@capacitor/core@8.5.2` · `@capacitor/cli@8.5.2` · `@capacitor/ios@8.5.2` · `@capacitor/android@8.5.2` (게시 2026-09-11T15:05:36Z, github.com/ionic-team/capacitor) · `@capgo/capacitor-social-login@8.5.11` (게시 2026-09-23T09:31:09Z, github.com/Cap-go/capacitor-social-login — 21-15 설치) | 사용자 `approved`. 다섯 개 모두 install/postinstall/preinstall 없음. capgo 는 `capacitor:sync:before` 훅(`node scripts/configure-dependencies.js`) 있음 — 21-15 가 설치 후 `cap sync` 때 실행됨을 인지할 것 |
| **pbxproj 등록 방식** | App 폴더는 `PBXFileSystemSynchronizedRootGroup` **아님** → `GHTradeBridgeViewController.swift` 를 `PBXFileReference`(FB74C3B150BCA995DE3A0C1C) · `PBXBuildFile`(E6C484E6629468E93F2F430D) · App 그룹 children · Sources phase 에 수동 등록 | 이후 플랜(21-10 `GHTradeTabBar` 등 · 21-11 `NavigationDelegateProxy`·`ThemeStore`)의 새 Swift 파일도 같은 방식 |
| **ATS 예외** | **추가 안 함** — `Info.plist` 템플릿 그대로(`NSAllowsLocalNetworking` 불필요) | 시뮬레이터가 `http://localhost:3100` 을 -1022 없이 로드 |
| 앱 호스트 검사 | `message.frameInfo.request.url?.host == bridge?.config.serverURL.host` | T-21-02 |
| Capacitor SPM | `capacitor-swift-pm` 8.5.2 `exact` (CLI 생성 `CapApp-SPM/Package.swift`) · `Package.resolved` 커밋 | Pitfall 17 — 로컬 `node_modules/.pnpm` 경로 정상 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 가 import 오류(INVALID_RED)가 되지 않도록 스텁을 RED 커밋에 포함**
- **Found during:** Task 3 ⑫
- **Issue:** 테스트만 먼저 두면 `../native-detect` 모듈 부재로 로드 실패 — tdd.md 기준 INVALID_RED.
- **Fix:** 빈 `NATIVE_DETECT_SCRIPT=''` · `false` · `null` 을 돌려주는 스텁을 테스트와 함께 RED 커밋. 3건이 단언 실패로 RED(`check tdd-red-evidence` → `RED_EVIDENCE_OK`, 대상 테스트 「2. iOS 네이티브면 …」).
- **Note:** vitest TAP 출력에는 node-test 식 `# tests/# pass/# fail` 요약이 없어, 같은 출력의 `ok`/`not ok` 줄 수로 요약 3줄을 덧붙여 판정기에 넣었다(원 출력 변형 없음).
- **Committed in:** 370c051

**2. [Rule 3 - Blocking] 스모크 스크립트 보강 — `simctl bootstatus -b` 대기 · xcodebuild `-quiet`**
- **Found during:** Task 3 ⑬
- **Issue:** 부팅 직후 `install` 이 경합할 수 있고, 스모크 출력이 xcodebuild 로그로 넘쳐 판정 줄이 묻힘.
- **Fix:** 부팅 후 `xcrun simctl bootstatus "$DEVICE" -b` · 빌드는 `-quiet`(빌드 명령 자체는 `native:build:ios` 와 동일 인자).
- **Committed in:** 8128d74

---

**Total deviations:** 2 auto-fixed (2 blocking). **Impact:** 범위 변화 없음.

## Issues Encountered

- **SwiftPM 바이너리 아티팩트 다운로드가 xcodebuild 안에서 무한 대기.** 첫 `native:build:ios` 가 `Checking out 8.5.2 of package 'capacitor-swift-pm'` 뒤 10분 넘게 멈춤(CPU 0). `swift package resolve -v` 로 재현하니 `warning: multiple (2) keychain entries found for 'https://github.com'` 직후 멈춤 — SwiftPM 이 github.com 자격증명을 키체인에서 찾다 GUI 키체인 승인 대기에 걸린 것으로 판단(샌드박스 해제로도 동일, curl 직접 다운로드는 0.5초).
  - **해결:** `cd mobile/ios/App/CapApp-SPM && swift package resolve --disable-keychain` 로 공유 캐시(`~/Library/Caches/org.swift.swiftpm/artifacts`)를 채운 뒤(생성된 `.build`·`Package.resolved` 는 삭제) xcodebuild 가 캐시에서 해석 → BUILD SUCCEEDED. 스크립트·저장소 변경 없음.
  - **재발 조건:** SwiftPM 캐시가 비었거나 새 바이너리 타깃이 생길 때(21-15 `@capgo/capacitor-social-login` → GoogleSignIn SPM). 21-02·21-15 실행기는 xcodebuild 가 `Resolve Package Graph`/`Checking out` 에서 멈추면 같은 우회를 쓴다. 근본 해결은 사용자가 키체인의 github.com 인터넷 암호 중복 항목을 정리하는 것.
- 전역 `grep` 이 ugrep 래퍼라 `"$PREV"` 가 든 패턴이 BRE 에서 매치되지 않음 → `/usr/bin/grep -F` 로 확인(1줄, 무수정).
- 실행 중 띄운 webapp dev 서버(:3100)와 시뮬레이터는 종료함.

## User Setup Required

없음 — `user_setup`(Apple Identifiers 에 `com.ghtrade.app` 등록)은 Task 1 체크포인트에서 사용자가 완료했다.

## Next Phase Readiness

- 후속 플랜은 같은 채널 `ghTrade`, 같은 감지 클래스 `native-app`, 같은 `NativeMessageType`(ready·route·theme·overlay·pull) 위에 올라간다. route/theme/overlay/pull 은 현재 `log.debug` 만 — 21-10·21-11 이 채운다(계획된 분할, 스텁 아님).
- `www/index.html` 은 최소 폴백 — 자동 복구·`?to=`·테마는 21-11.
- Android 는 21-02 (`cap add android` 아직 안 함 — `@capacitor/android` 는 설치됨).
- push 금지 유지(21-16 게이트). 이 플랜은 `pnpm-lock.yaml` 을 바꿨으므로 다음 push 는 Vercel 빌드를 유발한다(`vercel-ignore-build.sh` 경로에 lockfile 포함).

## TDD Gate Compliance

RED `370c051` (test) → GREEN `b3954ed` (feat) 순서 준수. REFACTOR 없음.

## Self-Check: PASSED

- 파일 10개 FOUND (mobile/package.json · capacitor.config.ts · tsconfig.json · .gitignore · www/index.html · scripts/smoke-ios.sh · GHTradeBridgeViewController.swift · SceneDelegate.swift · native-detect.ts · native-detect.test.ts)
- 커밋 FOUND: 370c051 · b3954ed · 8128d74 (`git rev-list --count 8b025ed..HEAD` = 3)
- 검증 4건: vitest 8/8 · webapp typecheck exit 0 · native:build:ios BUILD SUCCEEDED · native:smoke:ios SMOKE OK

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
