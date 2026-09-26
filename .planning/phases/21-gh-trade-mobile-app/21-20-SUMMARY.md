---
phase: 21-gh-trade-mobile-app
plan: 20
subsystem: mobile-ios-tabbar · webapp-native-shell
status: complete
tags: [mobile, capacitor, ios, tab-bar, gap-closure, G-21-1, D-27b, D-23a, D-08b, D-28]
requires:
  - "21-16 (UAT 2차 갭 소스)"
  - "21-17 · 21-18 · 21-19 (D-28 · D-23a · D-08b 결정 원천)"
provides:
  - "iOS GHTradeTabBar 캡슐 C — 라벨 없음 · 캡슐 56×36 primary 16% · ultra-thin 유리 + glass 틴트 · 그림자 두 겹 · 높이 60 · radius 30 · 페이드 86 (bg 80% @75%)"
  - "GHTradePalette.glass · glassAlpha (다크 #2c2c35 0.62 / 라이트 #ffffff 0.72) · line 필드 제거"
  - "웹 --native-tabbar-offset = gap + 60 + 8 · --native-body-reserve 98"
  - "native-shell e2e 수치 잠금 — CTA bottom 82 · main 하단 98 · CTA 아래끝 ≤ 844−74"
  - "CONTEXT D-27b · D-23a · D-08b · D-28 (D-27a · D-08a · D-23 원문 보존 + 대체 포인터)"
affects:
  - "21-21 (Android 가 같은 D-27b 상수 · GhTradePalette glass 로 맞춘다 — 현재 Android 팔레트엔 line 이 남아 있음)"
  - "21-24 (UAT 항목 1 — 라벨 없음 · 캡슐 · 유리 · 60 · iPad 560 · 다크 대비 · CTA 비가림 사람 확인 / push 는 네이티브 60 과 같이)"
tech-stack:
  added: []
  patterns:
    - "CSS 두 겹 box-shadow → UIKit 본체 layer 그림자 + 알약 뒤 투명 CALayer(contactShadow) 두 번째 그림자, 같은 shadowPath"
    - "CSS backdrop-filter 반경은 UIKit 에서 조절 불가 → 자체 틴트가 가장 옅은 systemUltraThinMaterial + 스케치 알파를 가진 틴트 뷰"
key-files:
  created: []
  modified:
    - mobile/ios/App/App/GHTradeTabBar.swift
    - mobile/ios/App/App/GHTradeTheme.swift
    - mobile/ios/App/App/GHTradeBridgeViewController.swift
    - webapp/src/styles/globals.css
    - webapp/e2e/specs/native-shell.spec.ts
    - .planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md
key-decisions:
  - "21-20: D-27b 탭바 = 스케치 007 C(라벨 없음 · 캡슐 56×36 16% · 테두리 없음 · 유리 · 그림자 두 겹 · 높이 60 · radius 30 · 페이드 86) — 네이티브 60 ↔ 웹 offset gap+60+8 · 본문 98 을 한 커밋에서 같이 바꿨다"
  - "21-20: iOS 유리 매핑 = systemUltraThinMaterial + glass.withAlphaComponent(glassAlpha) · CSS blur 24 ≒ shadowRadius 12 · blur 2 ≒ 1"
  - "21-20: 탭바 대비(WCAG 1.4.11) 다크 비활성 5.78 · 활성 3.51 / 라이트 비활성 4.62 · 활성 3.08 — 모두 ≥ 3.0, glassAlpha 조정 불필요"
  - "21-20: CONTEXT 에 D-27b · D-23a · D-08b · D-28 기록 — 이전 결정 원문은 역사로 두고 끝에 대체 포인터만"
requirements-completed: [MOBILE-01]
coverage:
  - deliverable: "라벨 없는 60 탭바(iOS) ↔ 웹 offset·본문 98 ↔ e2e 수치"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/native-shell.spec.ts (11 passed — 앱 390 홈 98 · 앱 390 종목상세 82/98/844−74 · 브라우저 0/20/96/8 · 앱 1280 98)"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/mobile run native:build:ios → BUILD SUCCEEDED · SIM ENTITLEMENTS OK"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:ios → SMOKE OK ready platform=ios"
        status: pass
  - deliverable: "iOS 캡슐 C 시각(유리 · 그림자 두 겹 · 캡슐 16% · 페이드 80% · 다크 자리값)"
    human_judgment: true
    rationale: "빌드·스모크·grep 은 통과했지만 스모크는 /login(탭바 숨김, D-12)에 머물러 탭바가 화면에 없다 — 유리감·그림자·캡슐 모양은 21-24 UAT 항목 1 에서 사람이 본다"
  - deliverable: "CONTEXT 결정 4건 기록"
    human_judgment: false
    verification:
      - kind: command
        ref: "Task 3 verify 루프 → CONTEXT DECISIONS OK · 각 머리 1줄 · 대체 포인터 grep 전부 ≥1"
        status: pass
duration: 6 min
completed: 2026-09-26
commits: 3
plan_head_before: 810e51aba128612ec46dc003cc4579a8f74ca221
actuals:
  tokens: 11377
  tasks: 3
  commits: 3
---

# Phase 21 Plan 20: 라벨 없는 캡슐 C 탭바(iOS) · 웹 여백 98 · 갭 클로징 결정 기록 Summary

**iOS 탭바를 스케치 007 C 로 옮겼다. 라벨이 없고 높이 60, radius 30, 캡슐 56×36(primary 16%)이며 테두리 없이 ultra-thin 유리와 glass 틴트를 쓰고 그림자는 두 겹이다. 웹 하단 고정 바 기준선은 gap + 60 + 8(=82), 본문 여백은 98 로 맞추고 e2e 로 잠갔다. 갭 클로징 결정 네 건은 CONTEXT 에 정본으로 남겼다.**

## Performance

- **Duration:** 약 6 min (실행 구간)
- **Started:** 2026-09-26T04:17:52Z
- **Completed:** 2026-09-26T04:24:07Z
- **Tasks:** 3 (트레이서 1 · auto 2)
- **Files modified:** 6

## Accomplishments

- **G-21-1 iOS:** 탭 칸 텍스트 라벨을 통째로 지웠다. `accessibilityLabel = tab.title` 과 traits `.selected` 는 그대로다. 아이콘 26 과 캡슐 56×36 radius 18 은 셀 정중앙(centerX + centerY)에 선다. 알약과 그림자 경로의 반경은 30 이다.
- **유리 · 그림자:** `.systemUltraThinMaterial` 위에 `glass.withAlphaComponent(glassAlpha)` 틴트를 올렸고, 1px 테두리는 지웠다. 그림자는 본체 (0,4) r12 0.14 와 알약 뒤 `contactShadow` (0,1) r1 0.08 두 겹이다. 두 겹 모두 `layoutSubviews` 에서 같은 반경 30 경로를 쓰고 암묵 애니메이션은 껐다.
- **페이드:** 높이 86, locations `[0, 0.75, 1]`, bg 알파 0 → 0.8 → 0.8.
- **D-23a 자리값:** 탭바 초기 팔레트와 VC `currentTheme` 을 `.dark` 로 바꿨다.
- **웹:** `--native-tabbar-offset: calc(var(--native-tabbar-gap) + 60px + 8px)` · `--native-body-reserve: 98px` 로 바꿨다. §21 주석의 정본 표기도 D-27b 로 고쳤다.
- **CONTEXT:** 「갭 클로징 결정 (UAT 2차 · 2026-09-26 사용자 확정)」 아래에 D-27b · D-23a · D-08b · D-28 을 적었다. D-27a · D-08a · D-23 · code_context 「기본 light」 줄에는 끝에 대체 포인터만 붙였다(원문 삭제 0 — word-diff 로 확인).

## D-27b 상수 대응표 (스케치 007 `.vc` CSS → UIKit)

| 스케치 CSS | UIKit 구현 | 위치 |
|---|---|---|
| `--tbh: 60px` | `tabBar.heightAnchor.constraint(equalToConstant: 60)` | VC setupTabBar |
| `border-radius: calc(--tbh / 2)` = 30 | `pill.layer.cornerRadius = 30` (continuous) · `shadowPath cornerRadius: 30` | GHTradeTabBar |
| 테두리 없음 | `layer.border*` 제거 | GHTradeTabBar |
| `background: --glass-hi` 다크 `rgba(44,44,53,.62)` / 라이트 `rgba(255,255,255,.72)` | `tint.backgroundColor = p.glass.withAlphaComponent(p.glassAlpha)` (0x2c2c35/0.62 · 0xffffff/0.72) | GHTradeTheme · TabBar.apply |
| `backdrop-filter: blur(28px) saturate(1.8)` | `UIBlurEffect(style: .systemUltraThinMaterial)` (반경 조절 불가 — 재질이 블러·채도) | GHTradeTabBar |
| `box-shadow: 0 4px 24px rgba(0,0,0,.14)` | `layer.shadowOffset (0,4) · shadowRadius 12 · shadowOpacity 0.14` | GHTradeTabBar.setup |
| `…, 0 1px 2px rgba(0,0,0,.08)` | `contactShadow` CALayer `(0,1) · r1 · 0.08` · 같은 경로 | GHTradeTabBar.setup/layoutSubviews |
| `.hl` 56×36 r18 `--primary` 16% | `highlight` 56×36 · `cornerRadius = 18` · `primary.withAlphaComponent(0.16)` | GHTradeTabItem |
| 아이콘 26 `place-items:center` | icon 26×26 · centerX/centerY | GHTradeTabItem |
| 라벨 없음 · `aria-label` | 라벨 뷰 제거 · `accessibilityLabel = tab.title` | GHTradeTabItem |
| `.fade` height `--tbh + 26` = 86 · `--bg` 80% @75% | `fade.heightAnchor 86` · locations `[0, 0.75, 1]` · alpha `0 → 0.8 → 0.8` | VC · GHTradeFadeView |
| `.body` padding-bottom `--tbh + 38` = 98 | `--native-body-reserve: 98px` | globals.css §21 |
| 좌우 16 · iPad 560 · 바닥 max(inset−14, 14) | 불변(제약 그대로) | VC setupTabBar |

## 대비비 계산 (WCAG 상대 휘도 · 1.4.11 비텍스트 ≥ 3.0)

node 한 줄 계산. 유리 면은 glass 를 glassAlpha 로 bg 위에 합성한 색이고, 캡슐 면은 primary 16% 를 그 유리 면 위에 합성한 색이다.

| 테마 | 유리 면 | 캡슐 면 | 비활성 muted vs 유리 | 활성 primary vs 캡슐 |
|---|---|---|---|---|
| 다크 | `#24242c` (#2c2c35 62% on #17171c) | `#27344d` | **5.78** (#9e9ea4) | **3.51** (#3485fa) |
| 라이트 | `#ffffff` (#ffffff 72% on #ffffff) | `#deebfe` | **4.62** (#6b7684) | **3.08** (#3182f6) |

네 값 모두 3.0 이상이라 glassAlpha 는 조정하지 않았다. 가장 빠듯한 값은 라이트 활성 3.08 이다. 라이트에서는 glass 와 bg 가 모두 흰색이라 glassAlpha 를 바꿔도 이 값은 변하지 않는다. 실제 화면에서는 ultra-thin 재질이 뒤 콘텐츠를 섞어 유리 면이 조금 달라진다. 계산은 틴트와 bg 만으로 한 근사다.

## Task Commits

1. **Task 1: 트레이서 — 라벨 없는 60 탭바(iOS) ↔ 웹 offset·본문 98 ↔ native-shell e2e 수치** — `d0af26b` (feat)
2. **Task 2: iOS 캡슐 C 시각 — 테두리 제거 · 유리 · 그림자 두 겹 · 캡슐 16% · 페이드 80% · 다크 자리값** — `ac88911` (feat)
3. **Task 3: CONTEXT 갭 클로징 결정 4건 기록** — `62536c3` (docs)

## 검증 결과

- **e2e:** `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/native-shell.spec.ts` → **11 passed**. 앱 390 홈의 main 하단은 98 이다. 앱 390 종목상세는 CTA bottom 82 · 하단 10 · 예약 76 · main 98 이고, CTA 버튼 아래끝이 844−74 이하다. 브라우저 390 은 0 · 20 · 96 · 8 · 헤더 56 이고, 앱 1280 의 main 은 98 이다.
- **iOS 빌드:** `native:build:ios` → `** BUILD SUCCEEDED **` · `SIM ENTITLEMENTS OK`. Task 1 뒤와 Task 2 뒤 각각 한 번씩 돌렸다.
- **iOS 스모크:** `native:smoke:ios` → `SMOKE OK ready platform=ios`(iPhone 17). Task 1 뒤와 Task 2 뒤 각각 돌렸고, 종료 시 운영 URL 로 다시 sync 됐다(작업 트리 잔여 변경 0).
- **트레이서 게이트:** end-of-phase 모드이고 verify 가 자동 명령뿐이라 재실행으로 통과했다. 체크포인트는 만들지 않았다.
- **acceptance grep:** Task 1 · 2 · 3 의 모든 항목이 PASS 다. 옛 값 잔존은 0 이다: UILabel · 반경 32 · VC 70/120 · CSS 70px+8px · 108px · e2e '108px'/'92px' · systemThinMaterial · layer.border · 0.14 강조 · 0.92 페이드 · `.light` 자리값 · `let line`.

## Decisions Made

- 라벨을 지운 뒤 눌림 표시는 아이콘 알파 0.55 만 남겼다(계획대로).
- 캡슐 강조 뷰에도 `cornerCurve = .continuous` 를 줬다. 알약과 곡률을 맞추려는 것이고 수치 변화는 없다.
- 접촉 그림자는 `contactShadow` 로 뒀다. 본체 layer 에 먼저 `addSublayer` 한 투명 CALayer 라 알약(pill) 서브뷰보다 아래에 깔린다. `shadowPath` 가 있어 내용이 없어도 그림자를 그린다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 떠 있던 :3100 dev 서버의 Turbopack 감시가 멈춰 globals.css 변경이 반영되지 않음**
- **Found during:** Task 1 verify
- **Issue:** e2e 3건이 실패했다(`main` paddingBottom 이 `108px`). `curl` 로 받은 CSS 청크에 여전히 `70px + 8px` · `108px` 가 들어 있었다. `touch` 뒤에도 청크 해시가 그대로였다. 이 서버는 09:06 에 뜬 고아 프로세스였다(ppid 1, `pnpm --filter @gh-radar/webapp run dev`).
- **Fix:** 그 프로세스 3개(pnpm · next dev · next-server)를 종료했다. 같은 명령 `PORT=3100 pnpm --filter @gh-radar/webapp run dev` 를 nohup 으로 분리해 다시 띄웠다. 로그는 scratchpad `dev3100.log` 에 쌓인다. 새 서버의 CSS 에서 `60px + 8px` · `98px` 을 확인했고, e2e 11 passed 를 받았다.
- **Files modified:** 없음(환경)
- **Commit:** 해당 없음

---

**Total deviations:** 1 auto-fixed (Rule 3 환경). **Impact:** 코드 범위 변화 없음. :3100 dev 서버는 이 실행기가 다시 띄운 것으로 바뀌었다(같은 명령 · 같은 포트).

## Issues Encountered

- 스모크 스크린샷은 `/login` 화면이다. 로그인 경로에서는 탭바가 숨는다(D-12). 그래서 캡슐 · 유리 · 그림자를 자동 캡처로 보지 못했다. 사람 확인은 21-24 UAT 항목 1 에서 한다.
- Android `GhTradePalette` 에는 아직 `line` 이 있고 `glass` 가 없다. 이 부분은 21-21 이 같은 이름(glass)으로 옮긴다. iOS 주석에는 「Android 94% 근사 — A10」 이라고 적어 두었다.

## Known Stubs

None.

## Threat Flags

None. 새 네트워크·인증·파일 표면은 없다. T-21-30 은 60 ↔ 82/98 을 같은 커밋에서 바꾸고 e2e 로 잠가 완화했다. T-21-51 은 accessibilityLabel 을 유지해 완화했다. T-21-54 는 D-27b 를 단일 정본으로 두고 globals.css · e2e · Swift 주석이 모두 D-27b 를 가리키게 해 완화했다.

## Next Phase Readiness

- 다음은 21-21(Android 캡슐 C 근사)이다. 웹 여백 98 은 두 플랫폼 공통이라 이미 준비됐다.
- **push 금지 유지.** 웹 여백 98 은 새 네이티브 60 과 같이 나가야 하므로 21-24 에서 결정한다.

## Self-Check: PASSED

- FOUND: mobile/ios/App/App/GHTradeTabBar.swift · GHTradeTheme.swift · GHTradeBridgeViewController.swift · webapp/src/styles/globals.css · webapp/e2e/specs/native-shell.spec.ts · 21-CONTEXT.md
- FOUND commits: d0af26b · ac88911 · 62536c3
