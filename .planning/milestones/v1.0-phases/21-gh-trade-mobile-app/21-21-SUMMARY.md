---
phase: 21-gh-trade-mobile-app
plan: 21
subsystem: mobile-android-tabbar
status: complete
tags: [mobile, capacitor, android, tab-bar, gap-closure, G-21-1, D-27b, D-23a]
requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-16 (UAT 2차 갭 소스) · 21-20 (D-27b 결정 기록 · iOS 캡슐 C · 웹 offset gap+60+8 · 본문 98)"
provides:
  - "Android GhTradeTabBar 캡슐 C 근사 — 라벨 없음 · 아이콘 26 / 캡슐 56×36 r18 셀 정중앙 · radius 30 · 테두리 없음 · glass 94% 불투명 · elevation 12 · 캡슐 primary 16% · 페이드 bg 80% @75%"
  - "GhTradePalette.glass (다크 0xFF2C2C35 · 라이트 0xFFFFFFFF) · line 필드 제거"
  - "MainActivity 탭바 60dp · 페이드 86dp · currentTheme 자리값 dark"
affects:
  - "21-24 (UAT 항목 1 — Android 라벨 없음 · 캡슐 · 불투명 유리 근사 수용 · 다크 대비 · CTA 비가림 · 제스처/3버튼 바닥 사람 확인)"
actuals:
  tokens: 4149
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "CSS backdrop-filter 유리 → Android 는 같은 glass RGB 를 알파 240 으로 불투명 근사(A10 유지)"
    - "CSS 넓고 옅은 box-shadow → elevation 높이만 조절(색 알파로 흉내 내지 않음 — spotShadowAlpha 곱)"
key-files:
  created: []
  modified:
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradePalette.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
key-decisions:
  - "21-21: Android 유리 = glass RGB(iOS 와 같은 #2c2c35 / #ffffff) × 알파 240(≈94%) — 실블러가 없어 스케치 알파(62·72%)를 쓰지 않음(A10)"
  - "21-21: Android 탭바 대비(WCAG 1.4.11) 다크 비활성 5.26 · 활성 3.23 / 라이트 비활성 4.62 · 활성 3.08 — 모두 ≥ 3.0, 캡슐 알파 41(16%) 조정 불필요"
patterns-established:
  - "탭 칸은 시각 라벨 없이 contentDescription 으로만 이름을 남긴다(iOS accessibilityLabel 과 대칭)"
requirements-completed: [MOBILE-01]
coverage:
  - id: D1
    description: "라벨 없는 60dp 탭바(Android) — 아이콘·캡슐 정중앙 · radius 30 · 페이드 86dp · 경로/숨김/이동 회귀 없음"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/mobile run native:test:android (TabRoutesTest + ExternalLinksTest) → BUILD SUCCESSFUL"
        status: pass
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:android → BUILD SUCCESSFUL"
        status: pass
      - kind: automated_ui
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:android → SMOKE OK ready platform=android"
        status: pass
    human_judgment: false
  - id: D2
    description: "Android 캡슐 C 시각 — 테두리 없음 · glass 94% 불투명 유리 근사 · elevation 12 · 캡슐 16% · 페이드 80% · 다크 자리값"
    requirement: MOBILE-01
    verification:
      - kind: automated_ui
        ref: "native:smoke:android 스크린샷 $TMPDIR/gh-trade-android-smoke.png (홈 · 라이트 저장값 · 탭바 표시)"
        status: pass
    human_judgment: true
    rationale: "불투명 유리 근사의 수용 여부 · 그림자 인상 · 다크 대비 체감 · 제스처/3버튼 바닥은 21-24 UAT 항목 1 에서 사람이 본다"
duration: 3min
completed: 2026-09-26
commits: 2
plan_head_before: 7867fc41a8bd0e319fe1f919c0547f612618ccc2
---

# Phase 21 Plan 21: 라벨 없는 캡슐 C 탭바(Android) Summary

**Android 탭바를 스케치 007 C 로 옮겼다. 라벨이 없고 높이 60dp, radius 30이다. 아이콘 26과 캡슐 56×36(r18, primary 16%)은 셀 정중앙에 선다. 테두리는 없고, 유리는 iOS 와 같은 glass RGB 를 94% 불투명으로 근사했다. 그림자는 elevation 12, 페이드는 86dp(bg 80% @75%)이며 사전 로드 자리값은 다크다.**

## Performance

- **Duration:** 약 3 min (실행 구간)
- **Started:** 2026-09-26T04:26:36Z
- **Completed:** 2026-09-26T04:29:35Z
- **Tasks:** 2 (트레이서 1 · auto 1)
- **Files modified:** 3

## Accomplishments

- **G-21-1 Android:** `TabItem` 의 텍스트 라벨 뷰를 통째로 지웠다(필드 · 생성 · addView · 색 · 눌림 알파 · `TextView`/`Typeface` import). `contentDescription = tab.title` · `isClickable` · `isFocusable` · `isSelected` 는 그대로다. 눌림 표시는 아이콘 알파 0.55 만 남았다.
- **기하:** 아이콘 26dp 와 캡슐 56×36 r18(사각 `GradientDrawable` + cornerRadius)을 `Gravity.CENTER` 로 셀 정중앙에 두었다(위 여백 없음). 알약 반경은 30dp 다. `MainActivity` 에서 탭바는 60dp, 페이드는 86dp 다. 좌우 16 · 폭 560 · 바닥 max(nav − 14, 14) · 인셋 리스너(탭바만) · IME 숨김 · 초기 GONE 은 그대로 뒀다.
- **시각:** 알약 = `setAlphaComponent(p.glass, 240)` 이고 `setStroke` 는 지웠다. elevation 은 12dp(outlineProvider BACKGROUND 유지), 캡슐 색은 `setAlphaComponent(p.primary, 41)` 이다. 페이드는 `0f, 0.75f, 1f` 에 bg 알파 204 를 쓴다.
- **팔레트:** `line` 을 없애고 `glass` 를 더했다. `card` 는 스피너 배경에 계속 쓴다.
- **D-23a:** 탭바 초기 팔레트 `GhTradePalette.of("dark")` · `MainActivity.currentTheme = "dark"`.

## D-27b 상수 대응표 (스케치 007 `.vc` CSS → Android)

| 스케치 CSS | Android 구현 | 위치 |
|---|---|---|
| `--tbh: 60px` | `CoordinatorLayout.LayoutParams(MATCH_PARENT, dp(60f))` | MainActivity.setupTabBar |
| `border-radius: calc(--tbh / 2)` = 30 | `pillBackground.cornerRadius = dpF(30f)` · outline BACKGROUND | GhTradeTabBar |
| 테두리 없음 | `setStroke` 제거 · 팔레트 `line` 제거 | GhTradeTabBar · GhTradePalette |
| `background: --glass-hi` 다크 `rgba(44,44,53,.62)` / 라이트 `rgba(255,255,255,.72)` + `backdrop-filter: blur(28px) saturate(1.8)` | `setAlphaComponent(p.glass, 240)` — glass 0xFF2C2C35 / 0xFFFFFFFF × ≈94% (실블러 없음 → 불투명 근사, A10) | GhTradePalette · TabBar.apply |
| `box-shadow: 0 4px 24px rgba(0,0,0,.14), 0 1px 2px rgba(0,0,0,.08)` | `elevation = dpF(12f)` (높이만 조절 · 접촉 그림자 두 번째 겹은 Android elevation 이 함께 그린다) | GhTradeTabBar.init |
| `.hl` 56×36 r18 `--primary` 16% | `LayoutParams(dp(56f), dp(36f), Gravity.CENTER)` · `cornerRadius = dpF(18f)` · `setAlphaComponent(p.primary, 41)` | TabItem |
| 아이콘 26 `place-items:center` | `LayoutParams(dp(26f), dp(26f), Gravity.CENTER)` | TabItem |
| 라벨 없음 · `aria-label` | 라벨 뷰 제거 · `contentDescription = tab.title` | TabItem |
| `.fade` height `--tbh + 26` = 86 · `--bg` 80% @75% | `dp(86f)` · `floatArrayOf(0f, 0.75f, 1f)` · `setAlphaComponent(bg, 204)` | MainActivity · fadeDrawable |
| `.body` padding-bottom 98 | 웹 `--native-body-reserve: 98px` (21-20 — 공통) | globals.css |
| 좌우 16 · 폭 560 · 바닥 max(inset−14, 14) | 불변 | MainActivity · onMeasure |

## 대비비 계산 (WCAG 상대 휘도 · 1.4.11 비텍스트 ≥ 3.0)

node 한 줄로 계산했다. 유리 면은 glass 를 240/255 로 bg 위에 합성한 색이고, 캡슐 면은 primary 41/255 를 그 유리 면 위에 합성한 색이다.

| 테마 | 유리 면 | 캡슐 면 | 비활성 muted vs 유리 | 활성 primary vs 캡슐 |
|---|---|---|---|---|
| 다크 | `#2b2b34` (#2c2c35 94% on #17171c) | `#2c3954` | **5.26** (#9e9ea4) | **3.23** (#3485fa) |
| 라이트 | `#ffffff` (#ffffff 94% on #ffffff) | `#deebfe` | **4.62** (#6b7684) | **3.08** (#3182f6) |

네 값 모두 3.0 이상이라 캡슐 알파(41 ≈ 16%)는 조정하지 않았다. 다크 유리 면이 iOS(62% 틴트 #24242c)보다 밝아서 다크 값이 iOS(5.78 · 3.51)보다 조금 낮지만 기준은 넘는다. 라이트는 glass 와 bg 가 모두 흰색이라 iOS 와 같은 값이다.

## Task Commits

1. **Task 1: 트레이서 — 라벨 없는 60dp 탭바(아이콘·캡슐 정중앙 · radius 30) + 페이드 86dp 기하** — `52874bd` (feat)
2. **Task 2: Android 캡슐 C 시각 — 테두리 제거 · glass 94% 유리 근사 · elevation 12 · 캡슐 16% · 페이드 80% · 다크 자리값** — `9441811` (feat)

## 검증 결과

- **Task 1:** `cap sync android` 다음 `native:test:android` → `BUILD SUCCESSFUL` 이었다(TabRoutesTest + ExternalLinksTest). 이어서 `native:build:android` → `BUILD SUCCESSFUL`, `native:smoke:android` → `SMOKE OK ready platform=android` 를 받았다.
- **트레이서 게이트:** end-of-phase 모드이고 verify 가 자동 명령뿐이다. 세 명령 통과를 기준으로 확장했고, 체크포인트는 만들지 않았다.
- **Task 2:** `native:build:android` → `BUILD SUCCESSFUL`, `native:test:android` 재실행 → `BUILD SUCCESSFUL`, `native:smoke:android` → `SMOKE OK ready platform=android` 였다. 스모크 종료 시 운영 URL 로 다시 sync 됐고 작업 트리 잔여 변경은 0 이다.
- **acceptance grep:** Task 1 · 2 전 항목 PASS. 옛 값 잔존은 0 이다: TextView · topMargin · OVAL · dpF(32f) · dp(70f) · dp(120f) · setStroke · primary 36 · bg 235 · `of("light")` · `val line`.
- **스모크 스크린샷:** 에뮬레이터에 로그인 세션이 남아 있어 `/login` 이 아니라 홈으로 들어갔다. 그래서 탭바가 실제로 보였다. 저장된 테마는 라이트였다. 스크린샷에서 확인한 것: 라벨 없음 · 홈 캡슐과 아이콘 정중앙 · 알약 양끝 반원 · 테두리 없음 · 아래쪽 elevation 그림자. D-12 로그인 숨김은 이번 캡처로 보지 못했다. 이 동작은 21-16 UAT 3 에서 pass 였고 이번에는 숨김 코드를 건드리지 않았다.

## Decisions Made

- 캡슐 강조의 모양은 `GradientDrawable` 기본(RECTANGLE)에 cornerRadius 18 을 주어 만들었다(OVAL 제거).
- 스케치의 두 번째 접촉 그림자(0 1px 2px .08)는 따로 흉내 내지 않았다. Android elevation 그림자가 이미 가까운 ambient 와 먼 spot 을 함께 그리기 때문이다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- 스모크 스크린샷을 보면 WebView 내용이 빈 흰 화면이다(홈 데이터 로딩 전 캡처 시점). 탭바 아래 제스처 영역과 WebView 사이에 옅은 회색 경계도 보인다. 탭바 코드와는 무관한 기존 캡처 조건이라 이번 범위에서 고치지 않았다. 21-24 UAT 항목 1(실사용 화면)에서 함께 본다.

## Known Stubs

None.

## Threat Flags

None. 새 네트워크·인증·파일 표면은 없다. T-21-30 은 60dp ↔ 웹 82/98(21-20 e2e 잠금), 바닥 규칙·인셋 리스너 불변으로 완화했다. T-21-51 은 contentDescription · isSelected 를 유지해 완화했다. T-21-39 는 `setOnApplyWindowInsetsListener(tabBar)` 를 유지해 완화했다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 네이티브 두 플랫폼이 모두 60 기하로 맞춰져 웹 여백 98 과 짝이 됐다.
- **push 금지 유지.** 사람 확인과 push 결정은 21-24 에서 한다.

## Self-Check: PASSED

- FOUND: GhTradeTabBar.kt · GhTradePalette.kt · MainActivity.kt
- FOUND commits: 52874bd · 9441811
