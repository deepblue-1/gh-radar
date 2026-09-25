---
phase: 21-gh-trade-mobile-app
plan: 11
subsystem: mobile
tags: [ios, uikit, wkwebview, capacitor, pull-to-refresh, theme, offline, orientation]

requires:
  - phase: 21-01
    provides: "GHTradeBridgeViewController · SceneDelegate 루트 VC · pbxproj 수동 등록 방식 · www/index.html 최소판 · smoke-ios.sh"
  - phase: 21-04
    provides: "웹 theme {theme} 메시지 · window.__ghTrade.refresh"
  - phase: 21-07
    provides: "페이지별 refresh 등록 — 미등록 페이지는 location.reload 폴백"
  - phase: 21-10
    provides: "GHTradeTheme · GHTradePalette · 탭바/페이드 apply · isOfflinePage(스킴+호스트) · overlayOpen · updateTabBarVisibility"
provides:
  - "ThemeStore (UserDefaults gh-trade.theme · 기본 light) — load()/save(_:)"
  - "NavigationDelegateProxy — Capacitor 델리게이트 전달형 프록시 + 네트워크 오류 필터 → owner.showOffline(failedURL:)"
  - "VC: applyTheme(_:animated:) · showOffline(failedURL:) · preferredStatusBarStyle · supportedInterfaceOrientations(idiom) · 당겨서 새로고침(1초 고정)"
  - "mobile/www/index.html 오프라인 폴백 완성 — safeTarget 허용 출처 · no-cors 도달 탐침 · online + 5초 · 다시 시도 · ?theme= 라이트/다크"
  - "Info.plist 폰 세로 전용 · ~ipad 4방향 유지"
affects: [21-16]

actuals:
  tokens: 6476
  tasks: 2
  commits: 2
plan_head_before: f2330cb914ae43424b8fabf6228cc94c39b209b5

tech-stack:
  added: []
  patterns:
    - "Capacitor 확장은 교체 대신 전달형 프록시 — 실패 콜백만 구현(원본 먼저 호출) · 나머지는 responds(to:)/forwardingTarget(for:)"
    - "테마는 applyTheme 한 곳에서만 바꾼다(currentTheme private(set)) — 첫 프레임은 SceneDelegate 창 배경 + capacitorDidLoad 저장값"
    - "당김 새로고침 가능 여부는 updateTabBarVisibility 진입 시 함께 맞춘다 — 오버레이·오프라인 상태가 바뀌는 모든 경로가 거기를 지난다"
    - "오프라인 페이지 복귀는 navigator.onLine 이 아니라 no-cors fetch 도달 탐침 · 탐침 중 버튼 모양은 바꾸지 않는다(5초 주기 깜빡임 방지)"

key-files:
  created:
    - mobile/ios/App/App/ThemeStore.swift
    - mobile/ios/App/App/NavigationDelegateProxy.swift
  modified:
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/ios/App/App/SceneDelegate.swift
    - mobile/ios/App/App/Info.plist
    - mobile/ios/App/App.xcodeproj/project.pbxproj
    - mobile/www/index.html

key-decisions:
  - "21-11: iOS 테마 변경은 applyTheme 단일 경로(currentTheme private(set)) — 웹 theme 은 dark/light 만 수용, OS traitCollection 미추종, 저장은 UserDefaults gh-trade.theme"
  - "21-11: 오프라인 폴백 URL 의 to 값은 URLComponents 인코딩 뒤 + 를 %2B 로 추가 인코딩 — URLSearchParams 가 + 를 공백으로 읽는 것 방지"
  - "21-11: 폴백 페이지 탐침 대상은 target 출처의 /icon.svg(21-14 app/icon.svg, 운영·dev 모두 200)"

patterns-established:
  - "iOS 새 Swift 파일은 기존 항목 뒤에 PBXBuildFile · PBXFileReference · App 그룹 children · Sources 4곳 수동 등록(21-01 방식 유지)"

requirements-completed: []

coverage:
  - id: D1
    description: "당겨서 새로고침 — bounces 복원 · UIRefreshControl → __ghTrade.refresh(없으면 reload) · 1초 뒤 스피너 종료 · 오버레이/오프라인 중 분리 (D-04 · D-17)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios → BUILD SUCCEEDED · acceptance grep 전부 통과"
        status: pass
    human_judgment: true
    rationale: "실제 당김 제스처·스피너 위치(안전영역 아래)는 시뮬레이터 자동화로 재현 불가 — 21-16 UAT"
  - id: D2
    description: "테마 추종·저장·첫 프레임 — 웹 theme → 상태바·배경·탭바 즉시 반영 + UserDefaults 저장, 다음 실행 첫 프레임 저장값 (D-23)"
    requirement: MOBILE-01
    verification:
      - kind: automated_ui
        ref: "시뮬레이터: 저장값 dark 로 기동 → 다크 배경·밝은 상태바 스크린샷 → 웹 theme light 수신 후 저장값 light 로 갱신(plist 확인)"
        status: pass
    human_judgment: false
  - id: D3
    description: "네트워크 오류 전용 오프라인 폴백 + 자동 복구 (D-19)"
    requirement: MOBILE-01
    verification:
      - kind: automated_ui
        ref: "시뮬레이터: dev 서버 정지 상태로 기동 → -1004 → 'offline fallback for http://localhost:3100/' · 폴백 화면 스크린샷 → dev 서버 재기동 8초 뒤 ready 로그로 복귀"
        status: pass
      - kind: unit
        ref: "node 로 safeTarget 추출 실행 — 허용 2출처만 통과, evil.com · trade.jx1.io.evil.com · javascript: · //evil.com · http://trade.jx1.io → 운영 루트"
        status: pass
    human_judgment: false
  - id: D4
    description: "폰 세로 고정 · iPad 4방향 · 표시명 GH Trade · 배포 타깃 15.0 · TARGETED_DEVICE_FAMILY 1,2 (D-24 · D-20)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "plutil -lint OK · CFBundleDisplayName = GH Trade · UISupportedInterfaceOrientations = [Portrait] · ~ipad 4개 · UIRequiresFullScreen 0"
        status: pass
    human_judgment: true
    rationale: "iPad 실제 회전·Split View 는 21-16 UAT"

duration: 8min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 11: iOS 셸 시스템 연동 Summary

**UIRefreshControl 로 웹 refresh 훅을 부르는 1초 고정 당김 새로고침, 웹 테마를 따라 상태바·배경·탭바를 바꾸고 UserDefaults 로 첫 프레임에 적용하는 테마 추종, Capacitor 델리게이트 전달형 프록시로 네트워크 오류만 잡아 띄우는 자동 복구 오프라인 페이지, 폰 세로·iPad 4방향 고정**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-25T23:01:18Z
- **Completed:** 2026-09-25T23:09Z
- **Tasks:** 2
- **Files modified:** 7 (신규 2)

## Accomplishments

- 당겨서 새로고침(D-04 · D-17): Capacitor 가 끈 `scrollView.bounces` 를 되살리고 `UIRefreshControl` → `window.__ghTrade.refresh()`(없으면 `location.reload()`) evaluate, 훅 완료와 무관하게 1초 뒤 스피너 종료. 오버레이 열림·오프라인 페이지 동안은 컨트롤을 떼고(새로고침 도중이면 먼저 닫음) 닫히면 다시 붙인다. 풀블리드라 스피너를 `viewDidLayoutSubviews` 에서 안전영역 아래로 내린다.
- 테마(D-23): `applyTheme` 이 `currentTheme`(→ 탭바·페이드 팔레트) · VC `overrideUserInterfaceStyle` · WebView/스크롤/창 배경(#ffffff / #17171c) · 상태바(`preferredStatusBarStyle` 오버라이드로 SystemBars 덮어쓰기 차단)를 바꾸고 `gh-trade.theme` 에 저장. `SceneDelegate` 창 배경과 `capacitorDidLoad` 에서 저장값으로 첫 프레임을 칠한다. 웹 `theme` 은 `dark`/`light` 만 받는다. OS 다크모드 추종 코드는 없다.
- 오프라인 폴백(D-19): `NavigationDelegateProxy` 가 `didFailProvisionalNavigation`·`didFail` 만 구현하고(원본 먼저), 정책 결정 등 나머지는 원본으로 자동 전달된다. 네트워크 오류 6개 코드만 폴백하고 -999·HTTP 오류는 무시한다. `showOffline` 은 `capacitor://localhost/index.html?to=…&theme=…` 을 로드한다.
- 폴백 페이지: 워드마크 · 두 줄 안내 · 「다시 시도」 · `safeTarget` 허용 출처 검사 · `/icon.svg` no-cors 도달 탐침(`online` 이벤트 + 5초 주기 · 겹침 가드) · `?theme=` 로 첫 페인트 전 다크 적용 · 외부 리소스 없음.
- 방향·표시(D-24 · D-20): `supportedInterfaceOrientations` idiom 오버라이드. Info.plist 는 폰을 세로만 두고 `~ipad` 4방향은 유지하며 `UIRequiresFullScreen` 은 넣지 않았다. 표시명 `GH Trade`, `UIViewControllerBasedStatusBarAppearance` true, `TARGETED_DEVICE_FAMILY "1,2"`, 배포 타깃 15.0 은 템플릿에 이미 있었다.

## Task Commits

1. **Task 1: 당겨서 새로고침 + 테마 추종·저장·첫 프레임** — `df44749` (feat)
2. **Task 2: 오프라인 폴백 프록시 + 자동 복구 페이지 · 방향 · Info.plist** — `d87d7fc` (feat)

## Files Created/Modified

- `mobile/ios/App/App/ThemeStore.swift` — UserDefaults `gh-trade.theme` load/save (기본 light)
- `mobile/ios/App/App/NavigationDelegateProxy.swift` — 전달형 프록시 + 네트워크 오류 필터
- `mobile/ios/App/App/GHTradeBridgeViewController.swift` — applyTheme · 상태바 · 방향 · 당김 새로고침 · showOffline · 프록시 설치
- `mobile/ios/App/App/SceneDelegate.swift` — 창 배경 = 저장 테마 bg
- `mobile/ios/App/App/Info.plist` — `UISupportedInterfaceOrientations` 에서 가로 2개 제거(폰 세로 전용)
- `mobile/ios/App/App.xcodeproj/project.pbxproj` — 새 Swift 2파일 등록
- `mobile/www/index.html` — 오프라인 폴백 완성

## Verification

- `native:build:ios` → BUILD SUCCEEDED (Task 1 · Task 2 각각)
- `native:smoke:ios` → `SMOKE OK ready platform=ios` (Task 1 · Task 2 각각). 끝난 뒤 생성 설정은 `https://trade.jx1.io` · cleartext false
- `plutil -lint` OK · `CFBundleDisplayName` = `GH Trade` · `~ipad` 방향 4개 · 폰 방향 `["UIInterfaceOrientationPortrait"]`
- acceptance grep 전부 통과: `decidePolicyFor` 0 · `traitCollectionDidChange|registerForTraitChanges` 0 · `UIRequiresFullScreen` 0 · `errorPath`(capacitor.config.ts) 0
- `native:check-tab-routes:ios` → `TAB ROUTES OK 36` (회귀 없음)
- 시뮬레이터 확인(dev sync 로 잠깐 바꾼 뒤 운영 sync 로 복원):
  - 저장값 light 로 로그인 화면을 띄우면 어두운 상태바 글자
  - dev 서버를 끄고 기동하면 로그에 `offline fallback for http://localhost:3100/` 가 찍히고 폴백 화면이 뜬다. 저장값 light 면 라이트, dark 면 다크 배경 + 밝은 상태바 글자
  - dev 서버를 다시 띄우면 약 8초 뒤 `ready platform=ios` 로 원래 URL 에 돌아온다
  - 돌아온 뒤 웹이 `theme light` 를 보내면 네이티브가 라이트로 바뀌고 저장값도 light 가 된다
- webapp 파일은 건드리지 않아 웹 테스트는 해당 없음

## Decisions Made

- `currentTheme` 을 `private(set)` 로 좁혔다. 바꾸는 경로를 `applyTheme` 하나로 두어 상태바·배경·저장이 따로 놀지 않게 하기 위해서다(외부 사용처 없음 확인).
- `?to=` 값의 `+` 를 `%2B` 로 한 번 더 인코딩한다. URLComponents 는 `+` 를 그대로 두는데 `URLSearchParams` 는 공백으로 읽기 때문이다.
- 새로고침 가능 여부는 `updateTabBarVisibility` 가 호출될 때 함께 맞춘다. 오버레이·오프라인 상태가 바뀌는 모든 경로(URL KVO · overlay · ready)가 이 함수를 지난다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Swift 배타 접근 위반 컴파일 오류**
- **Found during:** Task 2
- **Issue:** `c?.percentEncodedQuery = c?.percentEncodedQuery?…` 가 `overlapping accesses to 'c'` 로 빌드 실패
- **Fix:** `guard var c` 로 옵셔널을 풀고 쿼리를 지역 변수로 계산한 뒤 대입
- **Files modified:** mobile/ios/App/App/GHTradeBridgeViewController.swift
- **Commit:** d87d7fc

**2. [Rule 1 - Bug] 폴백 페이지 버튼이 5초마다 흐려짐**
- **Found during:** Task 2 시뮬레이터 확인(다크 스크린샷에서 버튼이 흐린 상태로 찍힘)
- **Issue:** 탐침 때마다 `button.disabled` 를 켜고 꺼서, 주기 탐침이 돌 때마다 버튼이 깜빡였다
- **Fix:** disabled 토글을 없앴다. 겹친 실행은 `checking` 플래그로 막는다
- **Files modified:** mobile/www/index.html
- **Commit:** d87d7fc

---

**Total deviations:** 2 auto-fixed (Rule 1 두 건). 범위 변화 없음.

## Issues Encountered

- 시뮬레이터 앱의 UserDefaults 는 `simctl spawn defaults write com.ghtrade.app` 로는 바뀌지 않는다(앱 컨테이너가 아닌 곳에 써짐). 앱 데이터 컨테이너의 전체 경로를 넘겨야 반영된다. 검증에만 쓰는 절차라 코드 변경은 없다.

## Known Stubs

없음.

## Next Phase Readiness

- 21-16 UAT 항목:
  - 실제 당김 제스처와 스피너 위치
  - 웹에서 테마를 바꿀 때 전환 모습
  - 네트워크 링크 컨디셔너로 비행기 모드 폴백과 복구
  - iPad 회전과 Split View
- 띄운 dev 서버(:3100)와 시뮬레이터(iPhone 17)는 종료했다. 생성 설정은 운영 URL 이다.

## Self-Check: PASSED
