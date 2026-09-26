---
phase: 21-gh-trade-mobile-app
plan: 22
subsystem: mobile
tags: [ios, ipados, capacitor, wkwebview, sfsafariviewcontroller, navigation-delegate, swiftc]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-11 NavigationDelegateProxy(전달형 프록시) · 21-17 Android ExternalLinks 정본 26케이스 표 · 21-20 GHTradePalette/currentTheme · CONTEXT D-28"
provides:
  - "iOS ExternalLinks.opensInAppBrowser(scheme:host:appHost:) · isSameAppHost — Foundation 전용 순수 판정(Android 와 같은 규칙)"
  - "NavigationDelegateProxy.decidePolicyFor — 최상위 + 호스트 밖 http(s) 만 SFSafariViewController, 나머지 원본 전달"
  - "NavigationDelegateProxy WKUIDelegate createWebViewWith — 호스트 밖 = 인앱 브라우저 · 같은 호스트 = 같은 WebView · 그 외 원본"
  - "mobile/scripts/external-links-check.swift + check-external-links-ios.sh — EXTERNAL LINKS OK 32"
  - "native:check-external-links:ios"
affects: [21-23, 21-24]

actuals:
  tokens: 3666
  tasks: 2
  commits: 2
plan_head_before: 4e9a1f6b9744ee761627a125cba0c4668160bd23

tech-stack:
  added: []
  patterns:
    - "셸 링크 분류 = 순수 함수 1곳 + 두 플랫폼 공유 정본 표(Android JUnit ↔ iOS swiftc TAP)"
    - "전달형 프록시가 가로채는 선택적 델리게이트 메서드는 원본을 명시 호출하고, 결과 nil(원본 없음·미구현)이면 기본값으로 정확히 한 번 응답"

key-files:
  created:
    - mobile/ios/App/App/ExternalLinks.swift
    - mobile/scripts/external-links-check.swift
    - mobile/scripts/check-external-links-ios.sh
  modified:
    - mobile/ios/App/App/NavigationDelegateProxy.swift
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/ios/App/App.xcodeproj/project.pbxproj
    - mobile/package.json

key-decisions:
  - "21-22: iOS 같은 호스트 새 창 요청(target=_blank · window.open)은 새 WKWebView 없이 같은 WebView 에 load — Capacitor 기본(Safari 앱)을 바로잡아 Android 와 일치 · opener 관계 없음(T-21-46)"
  - "21-22: 프록시는 3인자 decidePolicyFor 만 구현(WKWebpagePreferences 4인자 미구현) — Capacitor 8.5.2 도 3인자만 구현함을 소스로 확인, 전달 경로 불변"
  - "21-22: uiDelegate 도 같은 프록시에 세우되 originalUI 를 교체 전에 잡는다 — WebKit 이 델리게이트 설정 시점에 responds(to:) 를 캐시하므로 순서가 기능 조건"

patterns-established:
  - "ExternalLinks 정본 표 변경 시 Android ExternalLinksTest.kt 와 iOS external-links-check.swift 를 함께 — 기계 대조(diff) 가능한 같은 행 모양"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "iOS ExternalLinks 판정 — Android ExternalLinksTest 26케이스(같은 순서·기대값) + isSameAppHost 6케이스"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/mobile run native:check-external-links:ios (EXTERNAL LINKS OK 32)"
        status: pass
    human_judgment: false
  - id: D2
    description: "NavigationDelegateProxy decidePolicyFor · createWebViewWith 가로채기 + VC uiDelegate 배선 — 빌드 · 스모크 ready(같은 호스트 문서는 원본 경로로 실림)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios (BUILD SUCCEEDED · SIM ENTITLEMENTS OK)"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:ios (SMOKE OK ready platform=ios)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/mobile run native:check-tab-routes:ios (TAB ROUTES OK 36 — 회귀)"
        status: pass
    human_judgment: false
  - id: D3
    description: "실기/시뮬레이터에서 홈·종목상세 뉴스 · 종토방 원문 · 챗 인용 링크가 앱 위 SFSafariViewController 로 열리고 닫으면 같은 화면(iPhone · iPad)"
    requirement: MOBILE-01
    human_judgment: true
    rationale: "iOS 시뮬레이터 WebView 를 스크립트로 클릭할 도구(웹 인스펙터 프록시 등)가 없어 가로채기 경로 자체는 사람 확인 — 21-24 UAT 항목 4"

duration: 4min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 22: iOS 사이트 밖 링크 → SFSafariViewController 인앱 브라우저 Summary

**iOS/iPadOS WebView 의 서버 호스트 밖 http(s) 최상위 이동과 새 창 요청을 `NavigationDelegateProxy` 에서 가로채 SFSafariViewController(앱 테마 색)로 열고, 같은 호스트 새 창은 같은 WebView 에 싣는다. 판정은 Android 21-17 과 같은 26케이스 정본 표로 swiftc 검사가 잠근다.**

## Performance

- **Duration:** 약 4 min
- **Started:** 2026-09-26T04:32:06Z
- **Completed:** 2026-09-26T04:35:41Z
- **Tasks:** 2 (Task 1 트레이서 · Task 2 auto)
- **Files modified:** 7 (신규 3 · 수정 4)

## Accomplishments

- `ExternalLinks.swift`(`import Foundation` 만) — `opensInAppBrowser` 는 Android `ExternalLinks.kt` 와 같은 순서(스킴 http/https 허용 목록 → 호스트 없음/빈 값 → 앱 호스트 없음/빈 값 → 소문자 정확 일치 → 루프백 4종 → true). `isSameAppHost` 는 http(s) + 소문자 정확 일치.
- `external-links-check.swift` 표 1 = **Android ExternalLinksTest 26케이스와 순서·기대값 대조 일치** — 두 파일의 케이스 행을 추출해 `diff` 한 결과 차이 0(`null`↔`nil` 치환만). 표 2 = `isSameAppHost` 6케이스. 결과 `# tests 32 · # pass 32 · # fail 0 · EXTERNAL LINKS OK 32`.
- `NavigationDelegateProxy` — 3인자 `decidePolicyFor` 가로채기 · `presentInAppBrowser`(전경 활성 + 표시 중 컨트롤러 없음일 때만 · `entersReaderIfAvailable=false` · `barCollapsingEnabled=true` · `.close` · 틴트 `GHTradePalette.primary` · 테마 `overrideUserInterfaceStyle` · 로그 `in-app browser host=` 호스트만 · URL 무가공) · `WKUIDelegate` `createWebViewWith` · `responds(to:)`/`forwardingTarget(for:)` 를 `originalUI` 까지 확장.
- `GHTradeBridgeViewController.capacitorDidLoad` — 72행 `proxy.originalUI = wv.uiDelegate` → 73행 `wv.uiDelegate = proxy`(잡기 → 세우기 순서).
- `native:check-external-links:ios` 등록(build/typecheck/test/lint 키 없음 유지).

## decidePolicyFor 분기표 (decisionHandler 호출 1회 확인)

| 분기 | 조건 | decisionHandler 호출 | 그 뒤 |
|---|---|---|---|
| 가로채기 | 최상위(`targetFrame == nil` 또는 메인 프레임) · URL 있음 · `opensInAppBrowser` true | 프록시가 `.cancel` **1회** 후 `return` | `presentInAppBrowser(url)` |
| 원본 전달 | 그 외 + `original` 이 메서드 구현(Capacitor `WebViewDelegationHandler`) | 원본이 모든 자기 분기에서 **1회**(Capacitor 8.5.2 소스 확인 — 각 분기 `decisionHandler(...)` 후 `return`) · 프록시는 호출 안 함(`forwarded != nil`) | 원본 판정(플러그인 → allowNavigation → 앱 URL 밖 최상위는 시스템 → allow) |
| 원본 없음 | 그 외 + `original` nil 또는 미구현(선택 체이닝 결과 `nil`) | 프록시가 `.allow` **1회** | — |

## createWebViewWith 분기표

| 분기 | 조건 | 동작 | 반환 |
|---|---|---|---|
| 호스트 밖 | URL 있음 · `opensInAppBrowser` true | `presentInAppBrowser(url)` | nil |
| 같은 호스트 | URL 있음 · `isSameAppHost` true | `webView.load(navigationAction.request)`(같은 WebView · 새 WKWebView 없음 → opener 없음) | nil |
| 그 외(비 http(s) · 루프백 · 앱 호스트 모름 · URL 없음) | — | `originalUI` 의 같은 메서드(Capacitor: 시스템 open) | 원본 반환값(원본 없으면 nil) |

`target=_blank` 앵커는 `decidePolicyFor`(targetFrame nil)를 먼저 지나므로 호스트 밖이면 거기서 cancel 되고 `createWebViewWith` 는 불리지 않는다. `window.open` 은 곧바로 `createWebViewWith` 로 온다 — 두 곳 모두 같은 판정.

## Task Commits

1. **Task 1: 트레이서 — ExternalLinks 판정 → decidePolicyFor 가로채기 → SFSafariViewController** — `f74fb84` (feat)
2. **Task 2: 새 창 요청(createWebViewWith) + VC uiDelegate 배선 + 스크립트 등록** — `c44d5b4` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `mobile/ios/App/App/ExternalLinks.swift` — 호스트 밖 http(s) · 같은 앱 호스트 판정(Foundation 전용)
- `mobile/scripts/external-links-check.swift` — Android 와 같은 정본 26케이스 + isSameAppHost 6케이스 TAP 검사
- `mobile/scripts/check-external-links-ios.sh` — swiftc 컴파일·실행(실행 비트)
- `mobile/ios/App/App/NavigationDelegateProxy.swift` — decidePolicyFor · WKUIDelegate createWebViewWith · SFSafariViewController · 전달 확장 · 클래스 문서 주석 갱신
- `mobile/ios/App/App/GHTradeBridgeViewController.swift` — uiDelegate 프록시 배선 · 머리 주석 D-28 한 줄
- `mobile/ios/App/App.xcodeproj/project.pbxproj` — ExternalLinks.swift 4곳 등록(PBXBuildFile `D7FAEADD65ED4C46819A199C` · PBXFileReference `EACE1D5FD58640DFBC9E939A` · App 그룹 · Sources) — NavigationDelegateProxy 항목 바로 뒤
- `mobile/package.json` — `native:check-external-links:ios`

## Decisions Made

- 같은 호스트 새 창 요청은 같은 WebView 에 load — Capacitor 기본(무조건 Safari 앱)을 바로잡아 Android(멀티 윈도우 미사용 → 같은 WebView)와 맞췄다.
- 4인자(`WKWebpagePreferences`) `decidePolicyFor` 는 구현하지 않았다 — Capacitor 8.5.2 `WebViewDelegationHandler` 도 3인자만 구현(소스 grep 0건)이라 `responds(to:)` 전달로 WebKit 이 4인자를 고를 일이 없다.
- `uiDelegate` 교체 전 `originalUI` 를 잡는다 — WebKit 이 델리게이트 설정 시점에 응답 메서드를 조회하므로 순서가 곧 기능 조건(알림·확인·입력 창 · 미디어 권한 콜백 전달).
- `allowNavigation` · `capacitor.config.ts` 무변경(`git diff --quiet` exit 0).

## Deviations from Plan

None - plan executed exactly as written.

### 기록 사항 (편차 아님)

- `createWebViewWith` 의 원본 전달은 선택 체이닝이 `WKWebView?` 로 평탄화되므로 `?? nil` 없이 그대로 반환(첫 작성 후 불필요한 병합 연산자를 빌드 전에 제거).
- 트레이서 게이트: `auto_advance=false` · `human_verify_mode` 기본 end-of-phase · 트레이서 `<verify>` 는 automated 만 → 재실행 통과 후 확장(Task 2) 진행.
- 보호 브랜치 판정: `master` 는 `git.base-branch` 기준 보호지만 `branching_strategy: none` 이고 오케스트레이터가 메인 워킹트리 순차·일반 커밋을 지시했다. 커밋은 로컬만 — **push 하지 않았다**(21-24 체크포인트).
- 다른 세션의 미커밋 변경(`.planning/state.json` · `tasks/lessons.md` · `.planning/milestone.lock`)은 건드리지 않았다(파일 지정 add · 커밋 직전 `git status -sb`).

**Total deviations:** 0
**Impact on plan:** 없음.

## Issues Encountered

None — 표 검사 · 빌드 · 스모크 모두 첫 실행에 통과.

## Verification

| 명령 | 결과 |
|---|---|
| `bash mobile/scripts/check-external-links-ios.sh` / `native:check-external-links:ios` | `# tests 32 · # pass 32 · # fail 0` → `EXTERNAL LINKS OK 32` |
| `native:check-tab-routes:ios` (회귀) | `TAB ROUTES OK 36` |
| `plutil -lint …/project.pbxproj` | OK |
| `native:build:ios` (Task 1 · Task 2 각각) | `** BUILD SUCCEEDED **` · `SIM ENTITLEMENTS OK` · 새/수정 Swift 파일 경고 0 |
| `native:smoke:ios` (Task 1 · Task 2 각각, dev 서버 :3100) | `ready platform=ios nativeApp=true` → `SMOKE OK ready platform=ios` · 종료 시 운영 URL sync 복원(추적 파일 diff 없음) |
| Task 1 · Task 2 acceptance 전 항목 | PASS (4인자 오버로드 0 · 잡기 72행 → 세우기 73행 · 금지 키 없음 · capacitor.config.ts 무변경) |

## Threat Flags

없음 — 새 표면(외부 URL → SFSafariViewController · 새 창 요청 처리)은 플랜 threat_model T-21-43~47 · T-21-37 에 모두 있고 각 mitigation 을 구현했다(스킴 허용 목록 · 정확 일치 · 호스트만 로깅 · URL 무가공 · nil 반환으로 opener 없음 · 표시 중/비활성 무시 · 전달형 프록시 확장).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 사람 확인(홈·종목상세 뉴스 → 앱 위 Safari 시트 · 닫으면 같은 화면 · 같은 사이트 링크는 앱 안 · iPad 동일)은 21-24 UAT 항목 4.
- 설치된 시뮬레이터 앱은 스모크용 dev URL 빌드다(프로젝트 설정 파일은 운영 sync 로 복원됨).

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: ExternalLinks.swift · external-links-check.swift · check-external-links-ios.sh (신규 3)
- FOUND commits: `f74fb84` · `c44d5b4` (`git rev-list --count 4e9a1f6..HEAD` = 2)
