---
phase: 21-gh-trade-mobile-app
plan: 17
subsystem: mobile
tags: [android, capacitor, custom-tabs, androidx-browser, webview, junit]

requires:
  - phase: 21-gh-trade-mobile-app
    provides: "21-12/21-13 GhTradeWebViewClient(BridgeWebViewClient 상속) · MainActivity.serverHost()/currentTheme · GhTradePalette · TabRoutesTest 표 테스트 선례"
provides:
  - "ExternalLinks.opensInAppBrowser(scheme, host, appHost) — 사이트(서버 호스트) 밖 http(s) 판정 순수 함수(D-28)"
  - "InAppBrowser.open(activity, uri, theme) — CustomTabsIntent(테마 색 구성 · 툴바 bg · 로그 호스트만)"
  - "GhTradeWebViewClient.shouldOverrideUrlLoading — 메인 프레임 + 호스트 밖 http(s) 만 Custom Tabs, 나머지 super"
  - "ExternalLinksTest — iOS 21-22 와 공유하는 정본 26케이스 표"
  - "native:test:android = TabRoutesTest + ExternalLinksTest"
affects: [21-21, 21-22, 21-24]

actuals:
  tokens: 3034
  tasks: 3
  commits: 2
plan_head_before: bfd56f1b528d16eb5f2cdc50016437d163c6fd07

tech-stack:
  added: ["androidx.browser:browser:1.9.0 (앱 모듈 직접 선언 — 런타임 클래스패스에는 capgo 경유로 이미 존재)"]
  patterns:
    - "셸 네이티브 링크 분류는 순수 함수 1곳 + 플랫폼 공유 표 테스트(TabRoutes 와 같은 모양)"
    - "WebViewClient 오버라이드에서 가로채지 않는 경로는 super 결과를 그대로 반환(Capacitor launchIntent 보존)"

key-files:
  created:
    - mobile/android/app/src/main/java/com/ghtrade/app/ExternalLinks.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/InAppBrowser.kt
    - mobile/android/app/src/test/java/com/ghtrade/app/ExternalLinksTest.kt
  modified:
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt
    - mobile/android/variables.gradle
    - mobile/android/app/build.gradle
    - mobile/package.json

key-decisions:
  - "21-17 Task 1: androidx.browser 1.9.0 을 앱 모듈에 선언(선택 a, 사용자 결정) — capgo 가 이미 APK 에 싣는 좌표와 같아 런타임 의존 집합 무변경, 컴파일 클래스패스에만 노출"
  - "사이트 밖 판정은 앱 호스트 소문자 정확 일치만 같은 호스트 — 접미사 위장(trade.jx1.io.evil.com)과 www 하위 호스트는 외부로 본다"
  - "시스템 브라우저 예외 호스트 목록 없음 · server.allowNavigation 계속 비움(21-15 네이티브 로그인 이후 외부로 넘길 OAuth 호스트 없음)"

patterns-established:
  - "ExternalLinks 정본 표: Android ExternalLinksTest ↔ iOS external-links-check.swift(21-22) — 표를 고치면 두 파일을 함께"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "호스트 밖 http(s) 판정 순수 함수 ExternalLinks.opensInAppBrowser — 26케이스 정본 표로 잠금"
    requirement: MOBILE-01
    verification:
      - kind: unit
        ref: "mobile/android/app/src/test/java/com/ghtrade/app/ExternalLinksTest.kt#opensInAppBrowser"
        status: pass
    human_judgment: false
  - id: D2
    description: "GhTradeWebViewClient 가로채기 + InAppBrowser(Custom Tabs) — 빌드 · 스모크 ready(같은 호스트 문서는 WebView 에 그대로)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:android"
        status: pass
      - kind: e2e
        ref: "pnpm --filter @gh-radar/mobile run native:smoke:android (SMOKE OK ready platform=android)"
        status: pass
    human_judgment: false
  - id: D3
    description: "실기/에뮬레이터에서 홈·종목상세 뉴스 · 종토방 원문 · 챗 인용 링크가 Custom Tabs 로 열리고 닫으면 앱 같은 화면으로 돌아온다(G-21-N3 Android)"
    requirement: MOBILE-01
    verification:
      - kind: manual_procedural
        ref: "에뮬레이터 CDP 합성 target=_blank 앵커 클릭 → CustomTabActivity(앱 task #75) → BACK → MainActivity 같은 URL"
        status: pass
    human_judgment: true
    rationale: "실제 웹 링크(뉴스·종토방·챗 인용)를 사람이 눌러 보는 확인은 21-24 UAT 항목 4 — 에뮬레이터 실측은 합성 앵커 1건"

duration: 4min
completed: 2026-09-26
status: complete
---

# Phase 21 Plan 17: Android 사이트 밖 링크 → Custom Tabs 인앱 브라우저 Summary

**Android WebView 의 서버 호스트 밖 http(s) 메인 프레임 이동을 androidx.browser 1.9.0 `CustomTabsIntent`(앱 테마 색)로 가로채고, 판정은 26케이스 JUnit 표로 잠근 순수 함수 `ExternalLinks.opensInAppBrowser` 한 곳에 둔다.**

## Performance

- **Duration:** 약 4 min (실행 구간 — Task 1 결정은 오케스트레이터가 디스패치 전에 받음)
- **Started:** 2026-09-26T04:01:02Z
- **Completed:** 2026-09-26T04:04:31Z
- **Tasks:** 3 (Task 1 결정 · Task 2 트레이서 · Task 3 JUnit)
- **Files modified:** 7 (신규 3 · 수정 4)

## Accomplishments

- `ExternalLinks.opensInAppBrowser(scheme, host, appHost)` — http/https 허용 목록 · 호스트/앱 호스트 null·빈 값 false · 앱 호스트 **소문자 정확 일치** false · 루프백 4종 false · 그 외 true. `java.util.Locale` 외 import 없음(순수 Kotlin).
- `InAppBrowser.open` — `setShowTitle(true)` · `setColorScheme(다크/라이트)` · 툴바 `GhTradePalette.of(theme).bg` · URL 무가공 전달 · 로그 2건 모두 `uri.host` 만 · `ActivityNotFoundException` 삼킴.
- `GhTradeWebViewClient.shouldOverrideUrlLoading` — `request.isForMainFrame && ExternalLinks.opensInAppBrowser(…, host.serverHost())` 일 때만 `InAppBrowser.open(host, request.url, host.currentTheme)` 후 true, 그 외 `super.shouldOverrideUrlLoading(view, request)` 반환(같은 호스트 → WebView · 비 http(s) → Capacitor 시스템 인텐트 · data/blob → WebView · 하위 프레임 무개입).
- `ExternalLinksTest` 26케이스 · `native:test:android` 가 TabRoutesTest(4) + ExternalLinksTest(1 테스트 · 26 단언) 를 함께 실행 — **5 tests · failures 0 · errors 0**.
- 에뮬레이터 실측(Task 2 추가 확인): WebView devtools(CDP)로 `https://example.com/news/123?token=secret` `target=_blank` 앵커를 클릭 → logcat `GHTrade: in-app browser host=example.com`(호스트만) → `topResumedActivity = com.android.chrome/…customtabs.CustomTabActivity t75`(앱 task #75 안, MainActivity 위) · Intent `dat` 는 원래 URL 그대로(덧붙인 쿼리 없음) → BACK → `topResumedActivity = com.ghtrade.app/.MainActivity` · WebView `location.href` 는 `http://localhost:3100/` 그대로. 같은 호스트 앵커(`/search`)는 WebView 안에서 `http://localhost:3100/search` 로 이동하고 in-app browser 로그 0건.

## Task Commits

1. **Task 1: Custom Tabs 구현 경로 결정** — 커밋 없음(checkpoint:decision · 오케스트레이터가 디스패치 전 사용자 답 `a` 수령)
2. **Task 2: 트레이서 — ExternalLinks 판정 → 가로채기 → Custom Tabs** — `20caf45` (feat)
3. **Task 3: 판정 표 JUnit 26케이스 + native:test:android 확장** — `240ba57` (test)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

- `mobile/android/app/src/main/java/com/ghtrade/app/ExternalLinks.kt` — 사이트 밖 http(s) 판정 순수 함수(D-28 · iOS 21-22 와 같은 표)
- `mobile/android/app/src/main/java/com/ghtrade/app/InAppBrowser.kt` — Custom Tabs 실행(테마 색 · 호스트만 로깅)
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt` — `shouldOverrideUrlLoading` 가로채기 · 클래스 KDoc D-28 줄 · 「super 먼저」 문장에 예외 명시
- `mobile/android/app/src/test/java/com/ghtrade/app/ExternalLinksTest.kt` — 정본 26케이스 JUnit4 표
- `mobile/android/variables.gradle` — `androidxBrowserVersion = '1.9.0'`
- `mobile/android/app/build.gradle` — `implementation "androidx.browser:browser:$androidxBrowserVersion"`
- `mobile/package.json` — `native:test:android` 에 `--tests com.ghtrade.app.ExternalLinksTest` 추가(build/typecheck/test/lint 키 없음 유지)

## Decisions Made

### Task 1 — androidx.browser 앱 모듈 선언 여부 (checkpoint:decision · gate=blocking-human)

- **선택: a — androidx.browser 1.9.0 을 앱 모듈에 선언 (권장안).** 사용자가 오케스트레이터 체크포인트에서 선택(2026-09-26). 실행기는 재제시하지 않았다.
- **근거:** 공식 `CustomTabsIntent` · `CustomTabColorSchemeParams` 를 타입 검사와 함께 쓴다. 좌표·버전이 `:capgo-capacitor-social-login` 이 이미 APK 에 싣는 `androidx.browser:browser:1.9.0` 과 같아 APK 의존 집합이 바뀌지 않는다(Google Maven AndroidX 공식 아티팩트 · npm/lockfile 무변경). 라이브러리의 `implementation` 의존은 소비 모듈 컴파일에 노출되지 않으므로 앱 선언이 필요했다.
- **재실측(오케스트레이터 실행, 2026-09-26, `mobile/android` 에서) — 선언 전:**
  - ① `./gradlew :app:dependencies --configuration debugRuntimeClasspath -q | grep -n 'androidx.browser'` → `276:     +--- androidx.browser:browser:1.9.0` (1줄, capgo 하위)
  - ② 같은 명령 `--configuration debugCompileClasspath` → **0줄** (앱이 아직 컴파일할 수 없음 → 선택 a 는 「새 선언 1줄」)
- **선언 후 확인(실행기, Task 2 acceptance):**
  - `debugCompileClasspath` 의 `androidx.browser:browser:1.9.0` → 1건
  - `debugRuntimeClasspath` → `226:+--- androidx.browser:browser:1.9.0`(앱 직접) · `286:     +--- androidx.browser:browser:1.9.0 (*)`(capgo 하위) — 두 줄 모두 1.9.0, 승격 표기(`1.9.0 ->`) 없음. Gradle 캐시에도 `androidx.browser/browser/1.9.0` 한 버전만 존재.

### 그 밖

- 같은 호스트 판정은 소문자 **정확 일치**만 — `www.trade.jx1.io`(케이스 6) · `trade.jx1.io.evil.com`(케이스 7)은 외부로 본다(T-21-44).
- 멀티 윈도우는 켜지 않는다 — Capacitor 8.5.2 소스 · 앱 소스 모두 `setSupportMultipleWindows` 0건 재확인 → `target=_blank` 도 메인 프레임 이동으로 `shouldOverrideUrlLoading` 을 지난다(에뮬레이터 실측으로도 확인). `onCreateWindow` 처리 불필요.
- AndroidManifest · `capacitor.config.ts`(allowNavigation) 무변경(`git diff --quiet` exit 0).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GhTradeWebViewClient 클래스 KDoc 의 「모든 오버라이드는 super 를 먼저 부른다」가 새 가로채기와 모순**
- **Found during:** Task 2
- **Issue:** 플랜이 지정한 `shouldOverrideUrlLoading` 은 가로챌 때 super 를 부르지 않는다(부르면 Capacitor 가 외부 인텐트를 먼저 띄운다). 기존 KDoc 규칙 문장이 그대로면 다음 편집자가 super 를 앞에 넣어 기능을 깨뜨릴 수 있다.
- **Fix:** 문장에 예외 괄호 추가 — `(예외 shouldOverrideUrlLoading — 호스트 밖 http(s) 만 가로채고 나머지는 super 결과를 그대로 반환)`.
- **Files modified:** `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt`
- **Committed in:** `20caf45`

### 기록 사항 (편차 아님)

- **acceptance grep 아티팩트:** Task 2 의 `grep -c 'androidx.browser:browser:$androidxBrowserVersion' app/build.gradle` 은 macOS(BSD) grep 이 패턴 중간 `$` 를 줄끝 앵커로 해석해 0 을 낸다. `grep -cF`(고정 문자열)와 `\$` 이스케이프 둘 다 **1** — 선언은 45행에 있다.
- **보호 브랜치 판정:** `git.base-branch --is-protected master` 가 `true` 이지만, 이 저장소는 `branching_strategy: none` 으로 모든 플랜 커밋을 master 에 쌓아 왔고 오케스트레이터가 메인 워킹트리 순차 실행·일반 커밋을 지시했다(드리프트 아님). 커밋은 로컬만 — **push 하지 않았다**(push = Vercel 웹 배포, 21-24 체크포인트에서 사용자가 정한다).
- **에뮬레이터 CDP 확인은 플랜 밖 추가 검증**(파일 변경 없음) — 스모크는 「같은 호스트가 빼앗기지 않음」만 증명하므로 가로채기 경로 자체를 실측했다.

**Total deviations:** 1 auto-fixed (1 Rule 1 — 주석 정합)
**Impact on plan:** 동작 변화 없음 · 스코프 확장 없음.

## Issues Encountered

None — 빌드 · 스모크 · 단위 테스트 모두 첫 실행에 통과.

## Verification

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/mobile run native:build:android` | BUILD SUCCESSFUL · `Unresolved reference` / 컴파일 경고 0 |
| `pnpm --filter @gh-radar/mobile run native:smoke:android` | `GHTrade : ready platform=android nativeApp=true` → `SMOKE OK ready platform=android` · 종료 시 운영 URL 로 sync 복원 |
| `pnpm --filter @gh-radar/mobile exec cap sync android && … run native:test:android` | BUILD SUCCESSFUL · ExternalLinksTest tests=1 failures=0 errors=0(26 단언) · TabRoutesTest tests=4 failures=0 errors=0 · 추적 파일 diff 없음(운영 설정 유지) |
| Task 2/3 acceptance 전 항목 | PASS (위 grep 아티팩트 1건은 고정 문자열로 확인) |

## Threat Flags

없음 — 새 표면(외부 URL → Custom Tabs)은 플랜 threat_model T-21-43~47 · T-21-SC 에 모두 있고 각 mitigation 을 구현했다(스킴 허용 목록 · 정확 일치 · 호스트만 로깅 · 멀티 윈도우 미사용 · 1.9.0 승격 없음).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- iOS 21-22 는 `ExternalLinksTest` 26케이스를 같은 순서·같은 기대값으로 `external-links-check.swift` 에 복제하면 된다.
- 21-21 과 결합: 이 플랜은 `GhTradePalette.of(theme).bg` 와 `host.currentTheme` getter 만 읽는다 — 21-21 이 팔레트·초기 테마를 바꿔도 컴파일·동작 동일.
- 사람 확인(실제 뉴스·종토방·챗 인용 링크 → Custom Tabs, 닫으면 같은 화면)은 21-24 UAT 항목 4.
- 설치된 에뮬레이터 APK 는 스모크용 dev URL 빌드다(프로젝트 설정 파일은 운영 sync 로 복원됨).

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: ExternalLinks.kt · InAppBrowser.kt · ExternalLinksTest.kt (신규 3)
- FOUND commits: `20caf45` · `240ba57` (`git rev-list --count bfd56f1..HEAD` = 2)
