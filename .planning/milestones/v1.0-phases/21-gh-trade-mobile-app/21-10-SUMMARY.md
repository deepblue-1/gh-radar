---
phase: 21-gh-trade-mobile-app
plan: 10
subsystem: mobile
tags: [ios, uikit, tab-bar, capacitor, wkwebview, sf-symbols, native-bridge]

requires:
  - phase: 21-01
    provides: "GHTradeBridgeViewController · ghTrade 채널 · pbxproj 수동 등록 방식 · smoke-ios.sh"
  - phase: 21-04
    provides: "웹 route/overlay 메시지 · window.__ghTrade.navigate"
provides:
  - "TabRoutes.swift — GHTabID(home·search·trading·ai·me, path·title) · TabRoutes.normalize/activeTab(forPath:)/hidesTabBar(path:) (Foundation 전용)"
  - "GHTradeTheme(.light/.dark, userInterfaceStyle) · GHTradePalette.of(_:) — D-27a hex"
  - "GHTradeTabBar(UIView) · GHTradeTabItem(UIControl) · GHTradeFadeView — onSelect · setActive(_:) · apply(_:) · fadeView"
  - "VC: currentTheme(didSet → 탭바 팔레트) · overlayOpen · updateTabBarVisibility(animated:) · selectTab(_:)"
  - "mobile/scripts/check-tab-routes-ios.sh + tab-routes-check.swift — native:check-tab-routes:ios → TAB ROUTES OK 36"
affects: [21-11, 21-12, 21-16]

actuals:
  tokens: 9000
  tasks: 3
  commits: 4
plan_head_before: 3e96c27d79d3ca94b149cadfdca1c8ca16311436

tech-stack:
  added: []
  patterns:
    - "순수 경로표는 Foundation 전용 Swift 파일로 두고 swiftc 단독 컴파일 스크립트로 검사(Xcode 테스트 타깃 없음) — 출력은 TAP 모양이라 tdd-red-evidence 판정기에 그대로 들어간다"
    - "탭바 숨김 = 150ms DispatchWorkItem 지연 + 0.2s 페이드, 보임 = removeAllAnimations 후 즉시 0.2s (weekly-wine 경합 방지)"
    - "오프라인 판정은 url 스킴+호스트 == server.url 스킴+호스트 (호스트만 보면 dev localhost 와 capacitor://localhost 가 겹친다)"
    - "새 문서의 ready 메시지에서 overlayOpen 초기화 — 전체 로드로 닫힘 신호를 잃는 고착 방지"

key-files:
  created:
    - mobile/ios/App/App/TabRoutes.swift
    - mobile/ios/App/App/GHTradeTheme.swift
    - mobile/ios/App/App/GHTradeTabBar.swift
    - mobile/scripts/tab-routes-check.swift
    - mobile/scripts/check-tab-routes-ios.sh
  modified:
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/ios/App/App.xcodeproj/project.pbxproj
    - mobile/package.json

key-decisions:
  - "탭 항목 클래스명은 플랜 action 의 GHTradeTabItem(UIControl) — artifacts 표의 「GHTradeTab」은 이 클래스를 가리킨다"
  - "오프라인 페이지 판정에 스킴 비교 추가(host 만 비교하면 dev 에서 capacitor://localhost 가 앱 서버로 오인)"
  - "ready 수신 시 overlayOpen=false — T-21-18 고착 완화(웹 참조계수는 문서마다 0 에서 시작)"
  - "tabBar.apply(palette) 가 페이드 색까지 갱신하고, VC 는 tabBar.overrideUserInterfaceStyle 로 블러 재질을 앱 테마에 맞춘다(21-11 은 currentTheme 만 바꾸면 된다)"
  - "그림자 shadowRadius 8(CSS blur 16 근사, 플랜 값) · shadowPath 고정"

patterns-established:
  - "iOS 새 Swift 파일 pbxproj 등록 — GHTradeBridgeViewController 항목 뒤에 PBXBuildFile·PBXFileReference·App 그룹 children·Sources 4곳"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — 형제 플랜 미완이라 표시하지 않음

coverage:
  - id: D1
    description: "D-14 활성 판정 · D-12 ① 경로 숨김 · GHTabID 순서/경로/제목 표 36건"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/mobile run native:check-tab-routes:ios → TAB ROUTES OK 36 (RED 8e45b4a: RED_EVIDENCE_OK target activeTab \"/scanner\")"
        status: pass
    human_judgment: false
  - id: D2
    description: "알약 탭바 · 팔레트 · 페이드 · VC 배선이 iOS 시뮬레이터 Debug 로 컴파일"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios → ** BUILD SUCCEEDED ** (Task 2 · Task 3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "회귀 없음 — 셸이 dev 웹을 로드하고 ready 도착, /login 에서 탭바 숨김, 종료 후 운영 URL 재sync"
    requirement: MOBILE-01
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:ios → SMOKE OK ready platform=ios (PID 39511) · capacitor.config.json url=https://trade.jx1.io cleartext=false"
        status: pass
    human_judgment: false
  - id: D4
    description: "시각 시나리오(라이트) — 홈 활성 · pushState+route /trading 활성 · /stocks/005930 전부 비활성 · overlay open 숨김 · overlay close+/me 마이 활성 · 바닥 화면 끝 ≈20pt(iPhone 17)"
    requirement: MOBILE-01
    verification:
      - kind: manual
        ref: "임시 정적 페이지(:3101, 저장소 밖) + CAP_SERVER_URL 임시 sync 시뮬레이터 스크린샷 5장 — 이후 운영 URL 재sync 확인"
        status: pass
    human_judgment: true
  - id: D5
    description: "다크 팔레트 시각 · iPad 560 가운데 · 키보드 숨김 · 실제 탭 탭 이동"
    requirement: MOBILE-01
    verification:
      - kind: manual
        ref: "21-16 UAT (다크 전환 배선은 21-11)"
        status: pending
    human_judgment: true

duration: 8min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 10: iOS 네이티브 플로팅 탭바 Summary

**UIKit 알약 탭바(높이 70 · radius 32 연속 곡률 · systemThinMaterial + card 82% · 바닥 max(inset−14,14) · 폭 ≤560)를 WKWebView 위에 얹고, Foundation 전용 `TabRoutes` 로 D-14 정확 일치 활성 · D-12 숨김(로그인·오프라인·오버레이·키보드, 150ms 지연 페이드) · 웹 navigate 훅 탭 이동까지 배선 — 시뮬레이터에서 활성/비활성/숨김 전이를 스크린샷으로 확인**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-25T22:06:37Z
- **Completed:** 2026-09-25T22:14:51Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- `TabRoutes.swift` — `GHTabID` 5탭(D-06 순서) · `normalize`(쿼리·프래그먼트·끝 슬래시) · `activeTab(forPath:)` 정확 일치 표 · `hidesTabBar(path:)`(`/login`·`/auth` 와 하위만). swiftc 단독 검사 36건 통과.
- `GHTradeTheme`/`GHTradePalette` — D-27a hex 그대로(다크 `#202027`·`#17171c`·`#3485fa`·`#9e9ea4`·white 7% / 라이트 `#ffffff`·`#ffffff`·`#3182f6`·`#6b7684`·`#e5e8eb`).
- `GHTradeTabBar` — 그림자 컨테이너 + 알약(블러 · 덮개 · 1px 테두리) · 항목 5개(강조 원 46 · SF Symbols 21pt · 10pt semibold 라벨 · 접근성 selected) · `GHTradeFadeView`(bg 0→92%, 터치 통과). 없는 심볼은 `assertionFailure` + `circle` 폴백.
- VC 배선 — Auto Layout 제약(바닥 우선/필수 쌍 · 폭 우선/최대 560) · URL KVO + `route` · `overlay` · 키보드 · 150ms 지연 숨김/즉시 보임 · 탭 → `navigate` 훅 evaluate(오프라인이면 server.url+경로 직접 로드).

## Task Commits

1. **Task 1: TabRoutes 경로표 + swiftc 검사 (TDD)**
   - RED `8e45b4a` — test(21-10): iOS 탭 경로표 swiftc 검사 실패 테스트
   - GREEN `89c5da5` — feat(21-10): iOS TabRoutes 경로표 구현
2. **Task 2: 팔레트 · 알약 탭바 · 페이드** — `722257f`
3. **Task 3: VC 배선** — `4423e4e`

**Plan metadata:** (이 SUMMARY 커밋)

## Files Created/Modified

- `mobile/ios/App/App/TabRoutes.swift` — D-14/D-12 ① 경로표(Foundation 전용)
- `mobile/ios/App/App/GHTradeTheme.swift` — 테마 enum · 팔레트 · hex 헬퍼
- `mobile/ios/App/App/GHTradeTabBar.swift` — 탭바 · 항목 · 페이드 뷰
- `mobile/ios/App/App/GHTradeBridgeViewController.swift` — 탭바 배선(route/overlay/ready 처리 추가, theme/pull 은 21-11)
- `mobile/ios/App/App.xcodeproj/project.pbxproj` — 새 Swift 3파일 수동 등록
- `mobile/scripts/tab-routes-check.swift` · `mobile/scripts/check-tab-routes-ios.sh` · `mobile/package.json`(`native:check-tab-routes:ios`)

## Decisions Made

frontmatter `key-decisions` 참조. 핵심: 오프라인 판정에 스킴 포함 · `ready` 로 오버레이 고착 해제 · 블러 재질을 `overrideUserInterfaceStyle` 로 앱 테마에 고정.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 가 컴파일 오류(INVALID_RED)가 되지 않도록 스텁을 RED 커밋에 포함**
- **Found during:** Task 1
- **Issue:** `TabRoutes.swift` 없이 검사 스크립트를 돌리면 swiftc 컴파일 실패 = INVALID_RED.
- **Fix:** 빈 값을 돌려주는 스텁 + pbxproj 등록을 RED 에 포함, 검사 출력을 TAP 모양(`ok/not ok` + `# tests/# pass/# fail`)으로 내 `check tdd-red-evidence` → `RED_EVIDENCE_OK`(target `activeTab "/scanner"`, 22/36 실패). `FAIL …` 줄과 `TAB ROUTES OK n` 은 플랜 규격대로 유지.
- **Committed in:** 8e45b4a

**2. [Rule 1 - Bug] 오프라인 페이지 판정을 호스트만이 아니라 스킴+호스트로**
- **Found during:** Task 3
- **Issue:** 플랜은 `url.host != serverURL.host` 로 오프라인을 판정 — dev(`http://localhost:3100`)에서는 오프라인 폴백(`capacitor://localhost`)도 호스트가 `localhost` 라 오프라인으로 잡히지 않는다.
- **Fix:** `url.host == server.host && url.scheme == server.scheme` 일 때만 앱 서버 문서로 본다.
- **Committed in:** 4423e4e

**3. [Rule 2 - Critical] T-21-18 오버레이 고착 완화 — `ready` 수신 시 `overlayOpen = false`**
- **Found during:** Task 3
- **Issue:** 오버레이가 열린 채 전체 문서 로드가 일어나면 웹은 닫힘 신호를 보내지 못해 탭바가 영구 숨김.
- **Fix:** 새 문서마다 오는 `ready`(웹 참조계수 0 에서 시작)에서 `overlayOpen` 을 초기화하고 재평가.
- **Committed in:** 4423e4e

---

**Total deviations:** 3 auto-fixed (1 blocking · 1 bug · 1 critical). **Impact:** 범위 변화 없음. 플랜 인터페이스(`GHTabID`·`TabRoutes`·`GHTradePalette`·`GHTradeTabBar`·VC API) 그대로이며 `GHTradeTheme.userInterfaceStyle` 만 추가.

## Issues Encountered

- 로그인 전 모든 경로가 `/login` 으로 리다이렉트돼 스모크 스크린샷에는 (정상적으로) 탭바가 없다. 탭바 시각 확인은 저장소 밖 임시 정적 페이지(`python3 -m http.server 3101`, pushState + `route`/`overlay` 메시지를 시간차로 송신)를 `CAP_SERVER_URL` 임시 sync 로 띄워 확인했고, 끝에 운영 URL 로 다시 sync(`https://trade.jx1.io` · `cleartext:false` 확인).
  - 확인: 홈 활성(원 + filled house) → `/trading?focus=1` 트레이딩 활성 → `/stocks/005930` 5탭 전부 비활성 → overlay open 숨김 → overlay close + `/me` 마이 활성(filled). 바닥 ≈ 화면 끝 20pt, 좌우 16.
  - 활성 라벨이 강조 원 아래 가장자리에 걸치는 것은 스케치 CSS(원 top 7·46 / 아이콘 top 12·26 / 라벨 +4)와 같은 배치다 — 결함 아님.
- SwiftPM 키체인 멈춤은 재발하지 않음(캐시 사용).
- 띄운 dev 서버(:3100) · 임시 정적 서버(:3101) · 시뮬레이터는 모두 종료.

## Known Stubs

없음. `.theme`/`.pull` 메시지는 여전히 `log.debug` — 21-11 의 계획된 범위(스텁 아님). `currentTheme` 기본 `.light` 도 21-11 이 저장값으로 바꾼다.

## User Setup Required

None.

## Next Phase Readiness

- 21-11: `currentTheme` 대입만으로 탭바 팔레트·블러 재질이 바뀐다. `theme` 메시지 · `ThemeStore` · 오프라인 네비 프록시(`isOfflinePage` 는 URL KVO 가 이미 판정) 연결 대상.
- 21-12: Android `TabRoutes.kt` 는 `mobile/scripts/tab-routes-check.swift` 의 36건 표를 그대로 옮길 것.
- 21-16 UAT: 다크 · iPad 560 · 키보드 숨김 · 실제 탭 탭 이동(웹 navigate 훅, relay 소켓 유지).
- push 안 함(21-16 게이트).

## TDD Gate Compliance

Task 1: RED `8e45b4a` (test, RED_EVIDENCE_OK) → GREEN `89c5da5` (feat). REFACTOR 없음.

## Self-Check: PASSED

- 파일 FOUND: TabRoutes.swift · GHTradeTheme.swift · GHTradeTabBar.swift · tab-routes-check.swift · check-tab-routes-ios.sh
- 커밋 FOUND: 8e45b4a · 89c5da5 · 722257f · 4423e4e (`git rev-list --count 3e96c27..HEAD` = 4)
- 검증: TAB ROUTES OK 36 · BUILD SUCCEEDED ×2 · SMOKE OK ready platform=ios · acceptance grep 전부 통과

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
