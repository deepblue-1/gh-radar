---
phase: 21-gh-trade-mobile-app
plan: 28
subsystem: mobile-ios
tags: [ios, wkwebview, tabbar, keyboard, bridge-origin, smoke, simctl, adb]
status: complete

requires:
  - phase: 21-24
    provides: "iOS 탭바 · 브리지 · 오프라인 폴백 · 스모크 스크립트(UAT 3차 대상 빌드)"
provides:
  - "iOS 키보드 사유 탭바 즉시 숨김(키보드 절반 길이 · 같은 곡선 · 이동 없음) · 재표시 90ms 디바운스 · 하단 가림 판정(D-12a)"
  - "iOS 문서 로드 대기 awaitingContent — didStartProvisionalNavigation → 첫 route 또는 1.5초 → 280ms ease-out · 숨긴 채 시작(D-12b)"
  - "iOS 브리지 출처 = WKSecurityOrigin 스킴·호스트·포트 전체 비교(WR-03 iOS)"
  - "iOS 오프라인 폴백 URL 의 dev=1 신호(루프백 http 서버일 때만 · IN-02 iOS) — 21-29 폴백 페이지가 읽는다"
  - "스모크 기기 명시 — iOS UDID(IOS_DEVICE_UDID · DEVICE) · Android adb -s(ANDROID_SERIAL · 여러 대면 실패)(IN-08)"
  - "mobile/README 명령표 = package.json native:* 13개(IN-05)"
affects: [21-29, 21-35, 21-36]

actuals:
  tokens: 7000
  tasks: 3
  commits: 3
plan_head_before: 655e82c70af0984a9cb4da438675396b1d818f5a

tech-stack:
  added: []
  patterns:
    - "숨김 사유별 타이밍 분기 — 키보드 = 즉시(키보드 userInfo 곡선) · 그 외 = 150ms 대기 + 0.2초 페이드"
    - "보임 분기 멱등 — 모델 값이 이미 보임이면 진행 중 애니메이션을 걷어내지 않는다"
    - "스모크는 기기를 식별자로 명시(simctl UDID · adb -s) — 별칭·암묵 선택 금지"

key-files:
  created: []
  modified:
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - mobile/ios/App/App/NavigationDelegateProxy.swift
    - mobile/scripts/smoke-ios.sh
    - mobile/scripts/smoke-android.sh
    - mobile/README.md

key-decisions:
  - "D-12a 수치 그대로: 키보드 숨김 = min(0.2, max(0.08, 키보드 duration × 0.5)) · 곡선 = userInfo curve << 16 · transform identity · 재표시 0.09초 디바운스 · 끝 프레임 height>0 && minY < bounds.maxY−1 일 때만 키보드"
  - "D-12b 수치 그대로: 대기 상한 1.5초 · 해제 표시 0.28초 .curveEaseOut · 콜드 스타트도 setupTabBar 에서 beginDocumentLoad() 로 상한 예약(첫 로드가 프록시 설치 전이어도 고착 없음)"
  - "보임 분기에 「이미 보이는 중이면 반환」 가드 추가 — 대기 해제(280ms) 직후 applyPath 의 같은 보임 호출이 removeAllAnimations 로 페이드를 순간 표시로 튀게 하던 경합 방지"
  - "출처 판정은 양쪽 기본 포트(http 80 · https 443)를 0 으로 정규화해 비교 — 서버 URL 에 기본 포트를 명시해도 운영 출처가 거부되지 않게"
  - "문서 로드 대기 해제에 notice 로그 「document load wait ended reason=route|timeout」 — 콜드 스타트 실측 · 고착 진단용"

patterns-established:
  - "키보드 사유 숨김: hiddenByKeyboard 플래그 + showWork 디바운스, 숨김이 다시 오면 예약 취소"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "iOS 키보드 사유 탭바 즉시 숨김 · 재표시 90ms · 하단 가림 판정 (G-21-R3-1 · D-12a)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios && native:smoke:ios (BUILD SUCCEEDED · SIM ENTITLEMENTS OK · SMOKE OK ready platform=ios)"
        status: pass
    human_judgment: true
    rationale: "키보드 위 잔상이 사라졌는지 · 재표시 깜빡임 체감은 실기 입력 포커스로만 판단된다 — 21-36 UAT"
  - id: D2
    description: "iOS 문서 로드 대기(콜드 스타트 · 로그인 뒤 전체 로드 중 숨김 → 첫 route 또는 1.5초 → 280ms ease-out) (G-21-R3-4 · D-12b)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:smoke:ios 두 회 — 로그 'document load wait ended reason=route'(iPad · 문서 시작 +0.48초) · 'reason=timeout'(iPhone 17 · +1.50초)"
        status: pass
    human_judgment: true
    rationale: "로그인 → 홈 전환에서 탭바가 그려진 화면 뒤에 부드럽게 나타나는지는 사람이 본다 — 21-36 UAT"
  - id: D3
    description: "iOS 브리지 출처 스킴·호스트·포트 전체 비교 (WR-03 iOS)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:smoke:ios — dev 출처 http://localhost:3100 의 ready · route 가 새 출처 판정을 통과(SMOKE OK · reason=route)"
        status: pass
      - kind: other
        ref: "grep -c frameInfo.securityOrigin ≥1 · 비주석 'let senderHost' 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "오프라인 폴백 URL dev=1 — 서버 URL 이 루프백 http 일 때만 (IN-02 iOS 신호)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "grep -c 'name: \"dev\", value: \"1\"' GHTradeBridgeViewController.swift ≥1 · native:build:ios BUILD SUCCEEDED"
        status: pass
    human_judgment: true
    rationale: "오프라인 전환 시 실제 폴백 URL 에 dev=1 이 붙는지는 네트워크 차단 실기 확인 필요 — 폴백 페이지 쪽 소비는 21-29"
  - id: D5
    description: "스모크 기기 명시 — iOS UDID · Android adb -s · 여러 대면 실패 (IN-08)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:smoke:ios → '── 시뮬레이터: iPhone 17 (3B11B38C-…)' SMOKE OK · native:smoke:android → SMOKE OK ready platform=android · bash -n 두 스크립트"
        status: pass
    human_judgment: false
  - id: D6
    description: "mobile/README 명령표 = package.json native:* (IN-05)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "node README 표 대조 → README TABLE OK 13"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-09-26
---

# Phase 21 Plan 28: iOS 셸 UAT 3차 갭 · 리뷰 finding Summary

**iOS 탭바가 키보드에는 즉시(키보드 절반 길이 · 같은 곡선 · 이동 없음) 사라지고 90ms 디바운스로 돌아오며, 전체 문서 로드마다 첫 route(또는 1.5초)까지 숨었다가 280ms ease-out 으로 나타난다 — 브리지는 WKSecurityOrigin 스킴·호스트·포트가 모두 같을 때만 받고, 스모크는 UDID · `adb -s` 로 기기를 명시한다**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-26T10:22:29Z
- **Completed:** 2026-09-26T10:29:32Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- **G-21-R3-1 · D-12a (키보드):** `keyboardWillShow` 가 userInfo `keyboardAnimationDurationUserInfoKey` · `keyboardAnimationCurveUserInfoKey`(`rawValue << 16`)를 저장하고, `keyboardFrameEndUserInfoKey` 를 `view.convert(_, from: nil)` 한 사각형이 `height > 0 && minY < view.bounds.maxY − 1` 일 때만 키보드로 본다(하드웨어 · iPad 플로팅 키보드는 숨기지 않음). 키보드 사유 숨김 = 대기 0 · `min(0.2, max(0.08, duration × 0.5))` · 같은 곡선 + `.beginFromCurrentState` · alpha 만(transform identity). 키보드로 숨긴 뒤 재표시는 `showWork` 0.09초 디바운스 — 그 사이 숨김이 오면 취소된다. 오버레이 · 경로 · 오프라인 숨김은 D-12 경로(0.15 + 0.2 · 8pt 하강) 그대로.
- **G-21-R3-4 · D-12b (문서 로드 대기):** `NavigationDelegateProxy.webView(_:didStartProvisionalNavigation:)` 가 원본을 먼저 부르고 `owner?.beginDocumentLoad()`. VC `awaitingContent = true`(콜드 스타트) · 1.5초 상한 `awaitingWork` · `.route` 분기에서 `applyPath` 전에 `endAwaitingContent(reason: "route")` · `shouldHideTabBar` 에 포함 · 해제 표시만 0.28초 `.curveEaseOut`. `setupTabBar` 는 탭바 · 페이드를 `isHidden = true` · `alpha = 0` 으로 시작하고 `beginDocumentLoad()` 로 상한을 예약한다. 웹 코드 · 화이트리스트(`case ready, route, theme, overlay, pull`) 무변경.
- **WR-03 iOS (출처):** `message.frameInfo.securityOrigin` 의 `protocol`(소문자) · `host`(소문자, 빈 값 거부) · `port` 를 `bridge.config.serverURL` 과 정확 일치로 비교(기본 포트 80/443 → 0 정규화). isMainFrame 유지 · 거부 로그 「ignored … from foreign origin」. dev `http://localhost:3100` 과 오프라인 `capacitor://localhost` 는 스킴 · 포트가 달라 다른 출처로 판정된다.
- **IN-02 iOS (dev 신호):** `showOffline` 이 서버 URL `scheme == "http"` 이고 호스트가 `localhost` · `127.0.0.1` 일 때만 `URLQueryItem(name: "dev", value: "1")` 을 붙인다. 운영(`https://trade.jx1.io`)에는 없다.
- **IN-08 (스모크 기기):** iOS = `IOS_DEVICE_UDID`, 없으면 `simctl list devices available -j` 에서 이름 = `DEVICE` 인 기기(Booted 우선 · 없으면 첫 기기) → boot · bootstatus · install · terminate · launch · spawn log · io screenshot 모두 `"${UDID}"`. 못 찾으면 「SMOKE FAIL — 시뮬레이터 "…" 없음」. Android = `ANDROID_SERIAL`, 없으면 연결 기기(`device` 상태)가 1대일 때만 그 시리얼, 2대 이상이면 「SMOKE FAIL — 기기가 여러 대다 · ANDROID_SERIAL 을 지정하세요(목록: …)」, 0대면 실패 → 이후 모든 adb 호출은 `ADB=(adb -s "${SERIAL}")`.
- **IN-05 (README):** 명령표 행 추가/수정 — `native:check-external-links:ios`(신설 · `EXTERNAL LINKS OK`) · `native:test:android`(= `TabRoutesTest` · `ExternalLinksTest`) · `native:smoke:ios`(`DEVICE` · `IOS_DEVICE_UDID` · 여러 기기면 지정) · `native:smoke:android`(`AVD` · `ANDROID_SERIAL` · `adb -s` · 여러 기기면 지정 필수). 표 밖 문단 무변경. package.json `native:*` 13개 전부 표에 있음.

## 콜드 스타트 → 탭바 표시 실측 (참고값 · 판정은 21-36 UAT)

dev 빌드(`http://localhost:3100` · Next dev 서버) 시뮬레이터 로그 기준. 로그인 안 된 상태라 첫 경로는 `/login`(경로 숨김) — 대기 해제 시각만 잰다.

| 실행 | 프로세스 시작 | 문서 로드 시작 | ready | 대기 해제 | 문서 시작 → 해제 |
|---|---|---|---|---|---|
| iPad Pro 11 (M5) · 19:26 | 02.749 | 03.573 | 03.895 | 04.048 `reason=route` | **0.48초** (프로세스 시작 → 1.30초) |
| iPhone 17 · 19:28 | 02.473 | 03.352 | 04.173 | 04.853 `reason=timeout` | **1.50초** (상한 · didFinishLoad 05.414 — dev 서버 컴파일로 하이드레이션이 늦음) |

→ 1.5초 상한이 실제로 표시를 보장했다(T-21-65). 운영 서버는 dev 컴파일이 없어 route 해제 쪽이 기대 경로다.

## Task Commits

1. **Task 1: 트레이서 — 키보드 사유 즉시 숨김 · 재표시 90ms · 하단 가림 판정 (G-21-R3-1 · D-12a)** — `c018333` (fix)
2. **Task 2: 문서 로드 대기 · 브리지 출처 전체 비교 · 오프라인 dev=1 (G-21-R3-4 · WR-03 · IN-02)** — `d237822` (fix)
3. **Task 3: 스모크 기기 지정 · README 명령표 (IN-08 · IN-05)** — `3f00e92` (fix)

트레이서 게이트(Task 1 뒤): 대화형 · `end-of-phase` · `<verify>` 자동 전용 → 재실행 통과(BUILD SUCCEEDED · SIM ENTITLEMENTS OK · SMOKE OK ready platform=ios) → 확장 진행.

## Files Created/Modified

- `mobile/ios/App/App/GHTradeBridgeViewController.swift` — 키보드 즉시 숨김 · 재표시 90ms · awaitingContent · 숨긴 채 시작 · 보임 멱등 가드 · 출처 전체 비교 · 오프라인 dev=1
- `mobile/ios/App/App/NavigationDelegateProxy.swift` — `didStartProvisionalNavigation`(원본 먼저) → `beginDocumentLoad()`
- `mobile/scripts/smoke-ios.sh` — UDID 확정(`IOS_DEVICE_UDID` · `DEVICE`) · `booted` 별칭 제거
- `mobile/scripts/smoke-android.sh` — `ANDROID_SERIAL` · 여러 대 실패 · `adb -s` 배열
- `mobile/README.md` — 명령표 = `native:*` 13개

## Decisions Made

frontmatter `key-decisions` 참조 — 수치는 D-12a · D-12b 그대로, 실행 중 추가한 것은 ① 보임 분기 멱등 가드 ② 기본 포트 정규화 ③ 대기 해제 notice 로그 ④ 콜드 스타트 상한 예약.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 대기 해제 280ms 페이드가 applyPath 의 두 번째 보임 호출에 걷혀 순간 표시로 튐**
- **Found during:** Task 2
- **Issue:** 플랜 순서대로 `.route` 에서 `endAwaitingContent()` → `applyPath()` 를 부르면 두 번째 `updateTabBarVisibility` 의 보임 분기가 `tabBar.layer.removeAllAnimations()` 로 진행 중 280ms 애니메이션을 모델 값(alpha 1)으로 즉시 스냅시킨다 — D-12b 의 「부드럽게」가 무효.
- **Fix:** 보임 분기에서 모델 값이 이미 보임(`!isHidden` · alpha 1 · transform identity)이면 아무것도 하지 않고 반환.
- **Files modified:** mobile/ios/App/App/GHTradeBridgeViewController.swift
- **Verification:** native:build:ios · native:smoke:ios 통과
- **Committed in:** d237822

**2. [Rule 2 - Missing Critical] 콜드 스타트 대기의 1.5초 상한이 첫 로드 시점에 따라 예약되지 않을 수 있음**
- **Found during:** Task 2
- **Issue:** `awaitingContent = true` 로 시작하지만 상한 예약은 `didStartProvisionalNavigation` 에서만 걸린다 — 첫 로드가 프록시 설치 전에 시작되면(또는 로드가 route 없이 끝나면) 탭바가 영구 숨김(T-21-65).
- **Fix:** `setupTabBar` 끝에서 `beginDocumentLoad()` 로 상한을 예약(프록시 콜백이 오면 재예약).
- **Files modified:** mobile/ios/App/App/GHTradeBridgeViewController.swift
- **Verification:** iPhone 17 스모크에서 `reason=timeout` 해제 확인
- **Committed in:** d237822

**3. [Rule 2 - Missing Critical] 출처 비교의 기본 포트 정규화**
- **Found during:** Task 2
- **Issue:** 플랜 식 `o.port == (s.port ?? 0)` 은 서버 URL 에 기본 포트를 명시(`https://…:443`)하면 운영 출처를 거부한다.
- **Fix:** 양쪽 모두 http 80 · https 443 을 0 으로 정규화 후 비교(로컬 함수 — 별도 헬퍼 타입 없음).
- **Files modified:** mobile/ios/App/App/GHTradeBridgeViewController.swift
- **Committed in:** d237822

**4. [Rule 2 - Missing Critical] keyboardWillShow 가 하단을 가리지 않으면 keyboardVisible 을 false 로 되돌림**
- **Found during:** Task 1
- **Issue:** 플랜 문구는 「가릴 때만 true」 — 도킹 → 플로팅 전환처럼 willShow 가 연속으로 올 때 이전 true 가 남으면 탭바가 계속 숨는다.
- **Fix:** `keyboardVisible = covers` 로 매번 판정값을 대입.
- **Files modified:** mobile/ios/App/App/GHTradeBridgeViewController.swift
- **Committed in:** c018333

---

**Total deviations:** 4 auto-fixed (1 bug · 3 missing critical). **Impact:** 모두 플랜 truth(부드러운 표시 · 고착 없음 · 운영 출처 수용 · 하단 가림 판정)를 지키기 위한 것 — 범위 확장 없음.

## Issues Encountered

- **IN-08 이 실제로 재현됐다.** Task 1 · 2 의 스모크(옛 `booted` 별칭)는 `iPhone 17` 이 아니라 동시에 부팅돼 있던 **iPad Pro 11-inch (M5)** 에 설치·실행됐다(로그가 iPad 쪽에만 있음). 판정(`ready`)은 iPad 에서도 유효해 두 태스크 검증에는 영향 없음. Task 3 이후 스모크는 `── 시뮬레이터: iPhone 17 (3B11B38C-DDE2-40F7-AA65-2163A581A6B9)` 로 지정 기기에만 설치됐다. 두 번째 부팅 기기(iPad)는 다른 세션 것일 수 있어 끄지 않았다.
- dev 서버 :3100 은 이미 떠 있었다(다른 세션 PID 97752 — 건드리지 않음). relay 는 띄우지 않았다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 21-29(Android 대응)가 같은 D-12a · D-12b 수치와 이 플랜의 iOS `dev=1` 신호를 쓴다(폴백 페이지 허용 목록 분리는 21-29).
- 사람 확인(키보드 위 잔상 없음 · 로그인 직후 탭바 순서 · 재표시 깜빡임)은 21-36 UAT.
- push · 배포 없음(21-36 결정).

## Self-Check: PASSED

- 파일 5개 존재 · 커밋 `c018333` · `d237822` · `3f00e92` 존재(git log 확인)
- 세 태스크 acceptance grep 전부 통과 · webapp/ 파일 0 · README TABLE OK 13 · bash -n 통과 · EXTERNAL LINKS OK 32

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*
