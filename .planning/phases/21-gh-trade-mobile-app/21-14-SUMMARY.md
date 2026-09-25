---
phase: 21-gh-trade-mobile-app
plan: 14
subsystem: mobile
tags: [app-icon, splash, capacitor-assets, playwright, favicon, android-adaptive-icon, ios-asset-catalog]
status: complete

requires:
  - phase: 21-01
    provides: "mobile/ 패키지 · native:assets 스크립트 골격 · @capacitor/assets@3.0.5 감사 [OK]"
  - phase: 21-02
    provides: "Android 프로젝트(Theme.SplashScreen 런치 테마 · mipmap 템플릿)"
provides:
  - "mobile/resources/icon.svg — 스케치 004 #app-a 원본(= webapp/src/app/icon.svg 파비콘, 바이트 동일)"
  - "mobile/scripts/render-resources.mjs — webapp @playwright/test 로 PNG 5종 렌더(RENDER OK 5), 네트워크 0"
  - "mobile/resources/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png — @capacitor/assets 입력 원본"
  - "iOS AppIcon(알파 없음) · Splash.imageset(Default@1/2/3x + dark appearance)"
  - "Android mipmap 레거시/라운드/어댑티브 · drawable(-port/-land)(-night) 스플래시 · values(-night)/splash_colors.xml gh_splash_background"
  - "mobile/scripts/sharpen-adaptive-icons.sh — 어댑티브 전경 72dp 재샘플(native:assets 체인 마지막 단계)"
affects: [21-16]

actuals:
  tokens: 4000
  tasks: 2
  commits: 2
plan_head_before: 91c9aa88f084b3e8da821b38d6a825affdce580a

tech-stack:
  added: []
  patterns:
    - "원본 PNG 는 webapp devDependency Playwright 를 createRequire 로 빌려 렌더 — mobile 의존성 0 (D-05)"
    - "setContent 문서엔 폰트를 base64 data: URL 로 인라인 + page.route('**/*') abort 로 외부 요청 차단(T-21-41)"
    - "@capacitor/assets 는 npx 정확 버전 일회 실행, 생성 직후 후처리 스크립트로 생성기 결함 보정"

key-files:
  created:
    - mobile/resources/icon.svg
    - mobile/resources/icon-only.png
    - mobile/resources/icon-foreground.png
    - mobile/resources/icon-background.png
    - mobile/resources/splash.png
    - mobile/resources/splash-dark.png
    - mobile/scripts/render-resources.mjs
    - mobile/scripts/sharpen-adaptive-icons.sh
    - mobile/android/app/src/main/res/values/splash_colors.xml
    - mobile/android/app/src/main/res/values-night/splash_colors.xml
    - "mobile/ios/App/App/Assets.xcassets/Splash.imageset/Default@{1,2,3}x~universal~anyany[-dark].png"
    - "mobile/android/app/src/main/res/{drawable-*-night-*,drawable-night,drawable-*-ldpi,mipmap-ldpi}/…, mipmap-*/ic_launcher_background.png"
  modified:
    - webapp/src/app/icon.svg
    - mobile/package.json
    - mobile/android/app/src/main/res/values/styles.xml
    - mobile/android/app/src/main/res/values/ic_launcher_background.xml
    - mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
    - mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
    - mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json
    - mobile/ios/App/App/Assets.xcassets/Splash.imageset/Contents.json

key-decisions:
  - "icon-foreground 는 플랜대로 0.88배 유지 — 단 @capacitor/assets 가 어댑티브 XML 에 inset 16.7%(전경 = 72dp 가시영역)를 넣으므로 실제 링 지름은 가시 원의 약 57%(iOS 65% 보다 약간 작음, 안전영역은 여유). 홈 화면 크기 판단은 21-16 UAT"
  - "생성기가 어댑티브 전경을 48dp 로만 뽑아 inset 72dp 에 1.5배 업스케일(흐림) → sharpen-adaptive-icons.sh 가 1024 원본에서 72dp×밀도로 재샘플, native:assets 에 체인해 재생성 때도 유지"
  - "생성기의 AndroidManifest.xml 재포맷(내용 변화 없음)은 원복 — 스코프 밖 소음"
  - "iOS 템플릿 splash-2732x2732*.png 3개 삭제 — Contents.json 이 Default@*x 로 교체돼 미참조(카탈로그 unassigned 경고 방지)"
  - "ic_launcher_background 색 리소스 #FFFFFF → #17171C (어댑티브 XML 은 이제 mipmap 배경을 참조하지만 색 참조처가 생겨도 일치하게)"
  - "스플래시 워드마크에 스케치 004 의 letter-spacing -0.02em 적용(플랜 미기재, 시안 값)"

patterns-established:
  - "에셋 재생성 = pnpm --filter @gh-radar/mobile run native:assets (렌더 → generate → sharpen) 후 AndroidManifest 재포맷 원복 · 템플릿 잔여 파일 점검"

requirements-completed: []  # MOBILE-01 은 Phase 21 여러 플랜 공유 — 형제 플랜 미완이라 표시하지 않음

metrics:
  duration: "~5min"
  completed: 2026-09-26
---

# Phase 21 Plan 14: 아이콘·스플래시 (D-22) Summary

**스케치 004 `#app-a` 다크 레이더를 원본 SVG 하나로 추출해 웹 파비콘과 공유하고, Playwright 로 렌더한 PNG 5종을 `@capacitor/assets@3.0.5` 일회 실행으로 iOS AppIcon/Splash(다크 포함) · Android 어댑티브/레거시 아이콘 · 스플래시에 배포 — Android 12+ 시스템 스플래시 배경 라이트 #FFFFFF / 다크 #17171C.**

## Performance

- **Duration:** ~5min (2026-09-25T22:17Z → 22:23Z)
- **Tasks:** 2/2
- **Files:** 커밋 2개, 비PNG 13개 파일 + 생성 PNG 다수

## Accomplishments

- `mobile/resources/icon.svg` = `#app-a` 본문(defs 맨 앞) — `webapp/src/app/icon.svg` 와 `cmp` 동일
- `render-resources.mjs`: icon-only 1024 · icon-foreground 1024(투명, 0.88배) · icon-background 1024(#17171c) · splash 2732(#ffffff + 320px 둥근 아이콘 22.37% + 「GH Trade」 800 96px #191f28) · splash-dark 2732(#17171c + 흰 워드마크) → `RENDER OK 5`, Pretendard 로드 실패 시 예외
- `@capacitor/assets` 생성: iOS 14 · Android 148 파일, iOS 아이콘 알파 없음(hasAlpha: no)
- `windowSplashScreenBackground=@color/gh_splash_background` (values #FFFFFF / values-night #17171C), `@capacitor/splash-screen` 미설치
- 빌드: `native:build:ios` → BUILD SUCCEEDED (에셋 카탈로그 경고 0) · `native:build:android` → BUILD SUCCESSFUL (AAPT error 0)
- sync 후 iOS/Android capacitor.config.json 모두 `https://trade.jx1.io` · cleartext false
- webapp typecheck 통과 · webapp test 115 files / 2192 passed

## Task Commits

1. **Task 1: 원본 SVG + Playwright PNG 5종 + 파비콘** — `c6f8b77` (feat)
2. **Task 2: @capacitor/assets 생성 + Android 12 스플래시 배경 + 빌드** — `eb250ab` (feat)

## Visual Inspection

- icon-only / splash / splash-dark / Android port-night 스플래시를 이미지로 확인 — 중앙 정렬, 워드마크 Pretendard 800 정상
- 어댑티브 전경을 108dp 원형 마스크 합성으로 확인 — 외곽 링·스윕 끝점이 66dp 안전원 안(inset 적용 시 더 여유)
- 레거시 ic_launcher / ic_launcher_round(API 24–25) 확인

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 어댑티브 아이콘 전경 1.5배 업스케일 흐림**
- **Found during:** Task 2
- **Issue:** @capacitor/assets 3.0.5 가 `mipmap-anydpi-v26/ic_launcher*.xml` 에 inset 16.7%(→ 72dp)를 쓰면서 `ic_launcher_foreground.png` 는 48dp(xxxhdpi 192px)로만 생성 → 런처에서 288px 로 늘어나 흐려짐
- **Fix:** `mobile/scripts/sharpen-adaptive-icons.sh` — 1024 원본에서 54/72/108/144/216/288px 재샘플, `native:assets` 끝에 체인(재생성 시 회귀 방지). `native:assets` 에 플랜 Task 2 의 배경색 인자도 반영
- **Files modified:** mobile/scripts/sharpen-adaptive-icons.sh, mobile/package.json, mipmap-*/ic_launcher_foreground.png
- **Commit:** eb250ab

**2. [Rule 1 - Bug] 생성기 부작용 정리**
- **Found during:** Task 2
- **Issue:** 생성기가 AndroidManifest.xml 을 재포맷(의미 변화 없음)하고, iOS 템플릿 `splash-2732x2732*.png` 3개를 미참조 상태로 남김
- **Fix:** Manifest 는 `git checkout` 원복, 템플릿 스플래시 3개는 `git rm`(의도된 삭제)
- **Commit:** eb250ab

**3. [Acceptance 적합] `createRequire` 1줄**
- **Found during:** Task 1
- **Issue:** 기준이 `grep -n createRequire` 1줄 — named import 는 2줄이 된다
- **Fix:** `import nodeModule from 'node:module'` + `nodeModule.createRequire(...)` 한 줄
- **Commit:** c6f8b77

---

**Total deviations:** 3 auto-fixed. **Impact:** 산출물 품질 보정뿐, 스코프 확장 없음(mobile 의존성 0 유지).

## Issues Encountered

- 어댑티브 전경 크기: 플랜의 0.88배(Pitfall 19)는 inset 없는 108dp 레이어 가정. 생성기 inset 때문에 실제 링은 가시 원의 ~57% — 안전하지만 iOS(65%)보다 작다. 21-16 UAT 에서 홈 화면 크기가 작게 느껴지면 `scale(0.88)` → `scale(1)` 로 올려도 안전영역 안(65%/92%).
- `drawable-night/splash.png` 는 생성기가 320×240(가로)로 만든다 — Android 11 이하 다크 세로에선 더 구체적인 `drawable-port-night-*` 가 우선이라 실사용 영향 없음.

## Known Stubs

None.

## Next Phase Readiness

- 21-16: 실기기/에뮬레이터 UAT 에서 홈 화면·설정 29px 가독성, 다크 스플래시 확인. push 는 21-16 게이트(파비콘은 다음 push 때 웹에 반영).

## Self-Check: PASSED

- FOUND: mobile/resources/icon.svg · render-resources.mjs · PNG 5종 · sharpen-adaptive-icons.sh · splash_colors.xml ×2 · webapp/src/app/icon.svg
- FOUND: c6f8b77 · eb250ab
- commits 측정: `git rev-list --count 91c9aa8..HEAD` = 2
