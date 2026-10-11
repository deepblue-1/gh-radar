---
phase: 21-gh-trade-mobile-app
plan: 29
subsystem: mobile-android
tags: [android, webview, tabbar, ime, windowinsetsanimation, webmessagelistener, androidx-webkit, backup, offline-fallback, playwright]
status: complete

requires:
  - phase: 21-25
    provides: "WR-03 Android 브리지 = 답 a(androidx.webkit 선언 + WebMessageListener) · D-12a · D-12b 결정"
  - phase: 21-27
    provides: "theme-default.spec.ts IN-06 케이스(이 플랜이 폴백 케이스를 덧붙임)"
  - phase: 21-28
    provides: "iOS 짝 수치(키보드 절반 0.08~0.2초 · 재표시 90ms · 대기 1.5초 · 280ms 감속) · 오프라인 dev=1 신호 조건 · 스모크 ANDROID_SERIAL"
provides:
  - "Android IME 애니메이션 onPrepare 즉시 탭바 숨김(IME 길이 절반 80~200ms · 같은 곡선 · 이동 없음) · 재표시 90ms 디바운스 (G-21-R3-1 · D-12a)"
  - "Android 문서 로드 대기 awaitingContent — onPageStarted → 첫 route 또는 1.5초 → 280ms 감속 · 콜드 스타트도 상한 예약 (G-21-R3-4 · D-12b)"
  - "ready 메시지에서 pullBlocked 초기화 (IN-01)"
  - "브리지 WebMessageListener(허용 출처 = 서버 출처 · 메인 프레임만) · 미지원 WebView 는 addJavascriptInterface + 최상위 출처 스킴·호스트·포트 전체 비교 (WR-03 · 답 a)"
  - "allowBackup=false · fullBackupContent=false · data_extraction_rules.xml(cloud-backup · device-transfer 전 도메인 제외) (WR-02)"
  - "오프라인 폴백 dev=1(루프백 http 서버일 때만) · 폴백 페이지 PROD/DEV 허용 출처 분리 · data-return-target · e2e 3케이스 (IN-02)"
  - "오프라인 폴백 뒤로가기 = 앱 종료(루프 재현 후 수정) (IN-03)"
affects: [21-35, 21-36]

actuals:
  tokens: 8800
  tasks: 3
  commits: 3
plan_head_before: 55c6aec7726deea0b11cc772fc357311b7c38179

tech-stack:
  added:
    - "androidx.webkit:webkit 1.14.0 (app 모듈 직접 선언 — capacitor-android 가 이미 싣는 같은 좌표 · 런타임 의존 집합 불변)"
  patterns:
    - "IME 방향 판정 = WindowInsetsAnimationCompat.onPrepare 의 루트 창 인셋(애니메이션 전 상태) · onStart/onEnd 보정 · 콜백은 탭바에만(Pitfall 8)"
    - "ViewPropertyAnimator 곡선은 다음 animate() 에도 남는다 → 모든 animate() 에 곡선 명시"
    - "보임 분기 멱등(shownTarget) — 진행 중 280ms 감속을 200ms 로 갈아타지 않게(21-28 iOS 와 같은 가드)"

key-files:
  created:
    - mobile/android/app/src/main/res/xml/data_extraction_rules.xml
  modified:
    - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt
    - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt
    - mobile/android/app/build.gradle
    - mobile/android/app/src/main/AndroidManifest.xml
    - mobile/www/index.html
    - webapp/e2e/specs/theme-default.spec.ts

key-decisions:
  - "D-12a Android 수치: 키보드 사유 숨김 = (IME durationMillis / 2).coerceIn(80, 200)ms · IME 애니메이션 interpolator 그대로 · translationY 0 · 재표시 90ms(showRunnable) — 오버레이·경로·오프라인은 150 + 200ms(8dp 하강) 그대로"
  - "D-12b Android 수치: onPageStarted(super 먼저) → 대기 · 1.5초 상한(mainHandler) · 첫 route 에서 applyPath 전 해제 · 해제 표시만 280ms DecelerateInterpolator · 해제 로그 'document load wait ended reason=route|timeout'"
  - "WR-03 답 a 구현: 브리지 채널 = WebMessageListener(에뮬레이터 로그 bridge channel=webmessage origin=http://localhost:3100) · 등록은 load() 그대로(Capacitor 플러그인으로 옮길 필요 없음 — ready 도착)"
  - "출처 비교는 기본 포트(http 80 · https 443) 정규화 · 리스너 허용 규칙 문자열에서도 기본 포트를 뺀다(21-28 iOS 와 같은 정규화)"
  - "IN-03 은 재현됐다 → navigateBack 첫 분기 isOfflinePage -> finish()"

patterns-established:
  - "스모크 밖 검증은 WebView devtools 소켓(adb forward localabstract:webview_devtools_remote_<pid>) + CDP Runtime.evaluate 로 입력칸 주입 · 브리지 메시지 · 하위 프레임 송신을 재현"

requirements-completed: [MOBILE-01]

coverage:
  - id: D1
    description: "Android IME 애니메이션 시작 즉시 탭바 숨김 · 재표시 90ms (G-21-R3-1 · D-12a)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/mobile run native:build:android && native:smoke:android (BUILD SUCCESSFUL · SMOKE OK ready platform=android)"
        status: pass
      - kind: manual_procedural
        ref: "CDP 로 입력칸 주입 + route / → adb input tap → logcat 'ime anim prepare visibleBefore=false duration=200' · 탭바 숨김 스크린샷 · blur → 'visibleBefore=true' · 탭바 재표시 스크린샷"
        status: pass
    human_judgment: true
    rationale: "키보드 위로 끌려 올라간 프레임이 실제로 없어졌는지는 실기 입력 체감으로만 판단된다 — 21-36 UAT"
  - id: D2
    description: "Android 문서 로드 대기(onPageStarted → 첫 route 또는 1.5초 → 280ms 감속) (G-21-R3-4 · D-12b)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "native:smoke:android 로그 'document load wait ended reason=timeout' (dev 에뮬레이터 · 부하 높음) · 한 회 route 가 대기 중 도착('route path=/login awaiting=true')"
        status: pass
    human_judgment: true
    rationale: "로그인 → 홈 전환에서 탭바가 그려진 화면 뒤에 부드럽게 나타나는지는 사람이 본다 — 21-36 UAT"
  - id: D3
    description: "ready 에서 pullBlocked 초기화 (IN-01)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "grep 'pullBlocked = false' 가 '\"ready\" ->'(444) 와 '\"route\" ->'(458) 사이(450) · native:build:android"
        status: pass
    human_judgment: false
  - id: D4
    description: "브리지 WebMessageListener · 메인 프레임만 · 출처 전체 비교 폴백 (WR-03 답 a)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "logcat 'bridge channel=webmessage origin=http://localhost:3100' · SMOKE OK ready platform=android"
        status: pass
      - kind: manual_procedural
        ref: "CDP — 같은 출처 srcdoc iframe 의 GhTradeBridge.postMessage(route /sub) 는 무시 · 메인 프레임 route /main 은 수신('route path=/main')"
        status: pass
    human_judgment: false
  - id: D5
    description: "백업·기기 이전 끔 (WR-02)"
    requirement: MOBILE-01
    verification:
      - kind: other
        ref: "aapt2 dump xmltree app-debug.apk → allowBackup=false · fullBackupContent=false · dataExtractionRules=@0x7f110001 → BACKUP OFF OK"
        status: pass
    human_judgment: false
  - id: D6
    description: "오프라인 폴백 dev=1 · 허용 출처 분리 (IN-02)"
    requirement: MOBILE-01
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/theme-default.spec.ts#오프라인 폴백 복귀 대상(IN-02) (3케이스 · 전체 14 passed)"
        status: pass
      - kind: manual_procedural
        ref: "에뮬레이터 폴백 문서 'https://localhost/index.html?to=…%2Fsearch&theme=dark&dev=1 -> http://localhost:3100/search'"
        status: pass
    human_judgment: false
  - id: D7
    description: "오프라인 폴백 뒤로가기 = 종료 (IN-03)"
    requirement: MOBILE-01
    verification:
      - kind: manual_procedural
        ref: "IN-03 재현 기록 — 수정 전 BACK 3회 모두 폴백 재진입(누적 1→4 · 앱 앞) · 수정 후 BACK 1회에 앱 종료(누적 1 유지)"
        status: pass
    human_judgment: true
    rationale: "실기 오프라인(비행기 모드 · 실제 네트워크)에서의 뒤로가기 체감은 21-36 UAT 에서 사람이 확인한다"

duration: 19min
completed: 2026-09-26
---

# Phase 21 Plan 29: Android 셸 UAT 3차 갭 · 리뷰 finding Summary

**Android 탭바가 IME 애니메이션 `onPrepare` 에서 곧바로(IME 절반 길이 · 같은 곡선 · 이동 없음) 사라지고 90ms 디바운스로 돌아오며, 전체 문서 로드마다 첫 route(또는 1.5초)까지 숨었다가 280ms 감속으로 나타난다 — 브리지는 androidx.webkit WebMessageListener 로 서버 출처 · 메인 프레임만 받고, 백업·기기 이전은 꺼졌고, 오프라인 폴백은 dev=1 일 때만 localhost 로 돌아가며 폴백에서 뒤로가기는 앱을 닫는다**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-26T10:33:24Z
- **Completed:** 2026-09-26T10:52:37Z
- **Tasks:** 3
- **Files modified:** 8 (생성 1 · 수정 7)

## Accomplishments

- **G-21-R3-1 · D-12a (IME):** `ViewCompat.setWindowInsetsAnimationCallback(tabBar, …DISPATCH_MODE_CONTINUE_ON_SUBTREE)` — 탭바에만. `onPrepare` 에서 IME 이고 루트 창 인셋에 IME 가 아직 안 보이면(올라오는 방향) `keyboardAnimMs = durationMillis` · 곡선 저장 · `keyboardVisible = true` → 레이아웃 전 즉시 숨김. `onStart` 는 방향을 못 읽은 경우의 보정(끝 상태가 보임이면 첫 프레임 전 숨김), `onEnd` 는 실제 가시성으로 맞춘다. 기존 전역 레이아웃 리스너는 애니메이션 없는 IME 변화 보정용으로 남김. 숨김 분기: 키보드 사유 = 대기 0 · `(keyboardAnimMs / 2).coerceIn(80L, 200L)` · alpha 만(translationY 0) · 끝에서 GONE + `hiddenByKeyboard`. 보임: `hiddenByKeyboard` 면 `showRunnable` 90ms(그 사이 숨김이 오면 취소).
- **G-21-R3-4 · D-12b (문서 로드 대기):** `GhTradeWebViewClient.onPageStarted` — super 먼저 → `host.onDocumentStart()`(대기 true · 1.5초 상한 재예약). `"route"` 분기에서 `applyPath` 전에 `endAwaitingContent()`. 해제 표시만 280ms `DecelerateInterpolator`. 콜드 스타트는 `awaitingContent = true` 로 시작하고 `setupTabBar` 끝에서도 상한을 예약(21-28 과 같은 고착 방지). 보임 분기 멱등 가드(`shownTarget`).
- **IN-01:** `"ready"` 분기에서 `pullBlocked = false`.
- **WR-03 (답 a):** `app/build.gradle` 에 `androidx.webkit:webkit:$androidxWebkitVersion`. `GhTradeBridge.register(wv)` — `WEB_MESSAGE_LISTENER` 지원 시 `addWebMessageListener(wv, "GhTradeBridge", setOf(서버 출처))` · `isMainFrame` · `isAppOrigin(sourceOrigin)` 재확인 후 기존 JSON · 화이트리스트 판정. 미지원이면 `addJavascriptInterface` + 최상위 URL `isAppOrigin`. `MainActivity.load()` 는 `GhTradeBridge(this).register(wv)`. 웹 송신 계약 무변경(이 플랜 커밋의 webapp/src 파일 0).
- **WR-02:** 매니페스트 `allowBackup="false"` · `fullBackupContent="false"` · `dataExtractionRules="@xml/data_extraction_rules"`(XML 주석 포함). 새 `res/xml/data_extraction_rules.xml` — `<cloud-backup>` · `<device-transfer>` 각각 root · file · database · sharedpref · external `path="."` 제외.
- **IN-02:** `showOffline` 이 서버 URI 스킴 http · 호스트 localhost/127.0.0.1 일 때만 `&dev=1`. `www/index.html` `PROD_ORIGINS` · `DEV_ORIGINS` 분리, `get('dev') === '1'` 일 때만 합침, `data-return-target` 기록. e2e 「오프라인 폴백 복귀 대상(IN-02)」 3케이스.
- **IN-03:** 재현됨 → `navigateBack` 첫 분기 `isOfflinePage -> finish()`.

## 수치 · 로그 기록

### 콜드 스타트 → 탭바 표시 실측 (참고값 · 판정은 21-36 UAT)

dev 빌드(`http://localhost:3100` · Next dev 서버) · emulator-5554(Medium Phone API 36.1) · 호스트 부하 높음(load average 9 — 다른 세션 동시 사용). 로그인 안 된 상태라 첫 경로는 `/login`(경로 숨김) — 대기 해제 시각만 잰다.

| 실행 | 프로세스 시작 | 브리지 등록 | 문서 로드 시작(onPageStarted) | 대기 해제 | ready | 첫 route |
|---|---|---|---|---|---|---|
| 19:51 | 43.169 | 50.540 | 54.932 | 56.442 `reason=timeout` (+1.51초) | 57.935 | — |
| 19:52 | 04.477 | 07.725 | 10.288 | 11.854 `reason=timeout` (+1.57초) | 13.490 | 17.424 |

→ 부하 걸린 dev 에뮬레이터에서는 하이드레이션(첫 route)이 문서 시작 후 6~7초라 1.5초 상한이 표시를 보장했다(T-21-65). 19:48 실행 한 번은 route 가 대기 중에 도착(`route path=/login awaiting=true`)해 route 해제 경로도 동작함을 확인. 운영 서버는 dev 컴파일이 없어 route 해제가 기대 경로다.

### IME 콜백 확인 (에뮬레이터 · CDP 주입)

로그인 안 된 dev 에뮬레이터라 입력칸이 있는 탭 화면이 없다 → WebView devtools 소켓으로 `position:fixed` 입력칸을 넣고 `route /` 를 브리지로 보내 탭바를 띄운 뒤 `adb input tap`.
- 올림: `ime anim prepare visibleBefore=false duration=200` → 탭바 숨김(스크린샷) · `mInputShown=true`
- 내림(blur): `ime anim prepare visibleBefore=true duration=200` → 탭바 재표시(스크린샷)
→ `onPrepare` 의 루트 창 인셋이 애니메이션 전 상태라는 가정이 API 36 에뮬레이터에서 맞았다. 숨김 길이 = 200/2 = 100ms.

### WR-03 채널 로그

- `bridge channel=webmessage origin=http://localhost:3100` (에뮬레이터 WebView 는 WEB_MESSAGE_LISTENER 지원)
- 등록 위치: `MainActivity.load()` 그대로 — 스모크 `ready` 도착, Capacitor 플러그인으로 옮길 필요 없음
- 하위 프레임: 같은 출처 srcdoc iframe 에는 객체가 주입되지만(`sub:object`) 그 `route /sub` 는 `isMainFrame=false` 로 버려짐 · 메인 프레임 `route /main` 은 수신

### aapt2 (WR-02)

```
A: http://schemas.android.com/apk/res/android:allowBackup(0x01010280)=false
A: http://schemas.android.com/apk/res/android:fullBackupContent(0x010104eb)=false
A: http://schemas.android.com/apk/res/android:dataExtractionRules(0x0101063e)=@0x7f110001
BACKUP OFF OK
```

### 폴백 e2e (IN-02)

`pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/theme-default.spec.ts` → **14 passed** (기존 11 + IN-02 3: localhost·dev 없음 → `https://trade.jx1.io/` · localhost + dev=1 → `http://localhost:3100/me` · 운영 /trading → `https://trade.jx1.io/trading`).

### IN-03 재현 기록

절차(dev 빌드 · emulator-5554): 앱이 `/login` 에 안착 → CDP 로 `route /` 를 보내 탭바 표시 → `adb shell cmd connectivity airplane-mode enable` + `adb reverse --remove tcp:3100`(dev 서버는 adb reverse 로 닿아 비행기 모드만으로는 끊기지 않는다) → `uiautomator dump` 로 탭바 「검색」(`[241,2144][440,2301]`) 탭 → logcat `offline fallback for` 대기 → `KEYCODE_BACK` 3회(3초 간격 — 에뮬레이터 부하) · 각 뒤 누적 수 · 앞 앱 확인 → `airplane-mode disable` + `adb reverse` 복구.

| 단계 | 수정 전 누적 · 앱 | 수정 후 누적 · 앱 |
|---|---|---|
| 검색 탭 뒤 | 1 · 앞 | 1 · 앞 (폴백 URL `…&theme=dark&dev=1` · 복귀 대상 `http://localhost:3100/search`) |
| BACK 1 | 2 · 앞 | 1 · **떠남** |
| BACK 2 | 3 · 앞 | 1 · 떠남 |
| BACK 3 | 4 · 앞 | 1 · 떠남 |

판정: **재현(루프)** — 폴백에서의 뒤로가기가 실패한 `/search` 를 다시 불러 매번 폴백으로 돌아왔다. `isOfflinePage -> finish()` 후 같은 절차에서 BACK 1회에 종료 · 폴백 재진입 없음. 마지막 `airplane_mode_on = 0` 확인.
참고: 수정 후 재확인 중 두 번은 검색 탭 이동이 클라 라우터 캐시(미들웨어 리다이렉트 프리페치)로 네트워크 없이 `/login?next=%2Fsearch` 로 끝나 폴백이 뜨지 않았다 — 그 경우 CDP `location.assign` 폴백을 스크립트에 넣었지만 최종 기록 실행은 탭 경로로 폴백이 떴다.

## Task Commits

1. **Task 1: 트레이서 — IME 즉시 숨김 · 재표시 90ms · 문서 로드 대기 · pullBlocked 초기화 (G-21-R3-1 · G-21-R3-4 · IN-01)** — `d430aec` (fix)
2. **Task 2: 브리지 WebMessageListener · 백업 끄기 (WR-03 · WR-02)** — `3d6e435` (fix)
3. **Task 3: 오프라인 폴백 dev=1 · 허용 출처 분리 · e2e · 뒤로가기 종료 (IN-02 · IN-03)** — `446cd80` (fix)

트레이서 게이트(Task 1 뒤): 대화형 · `end-of-phase` · `<verify>` 자동 전용 → 재실행 통과(BUILD SUCCESSFUL · SMOKE OK ready platform=android) → 확장 진행.

## Files Created/Modified

- `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt` — IME 애니메이션 콜백 · 키보드/대기/보임 분기 · onDocumentStart · endAwaitingContent · ready pullBlocked · register(wv) · serverUri 공개 · 오프라인 dev=1 · 폴백 뒤로가기 종료
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt` — onPageStarted(super 먼저) → onDocumentStart
- `mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt` — register(WebMessageListener / JS 인터페이스 폴백) · isAppOrigin(기본 포트 정규화)
- `mobile/android/app/build.gradle` — androidx.webkit 선언
- `mobile/android/app/src/main/AndroidManifest.xml` — 백업 3속성
- `mobile/android/app/src/main/res/xml/data_extraction_rules.xml` — 신규 · 전 도메인 제외
- `mobile/www/index.html` — PROD/DEV_ORIGINS · dev=1 · data-return-target
- `webapp/e2e/specs/theme-default.spec.ts` — IN-02 3케이스

## Decisions Made

frontmatter `key-decisions` 참조. 수치는 D-12a · D-12b 그대로. 실행 중 추가: ① IME 곡선을 애니메이션 interpolator 로 맞춤(iOS 「같은 곡선」 대응) ② `onStart` 방향 보정 ③ 보임 멱등 가드 ④ 기본 포트 정규화 ⑤ D-레벨 진단 로그(`document load started` · `route path=…` · `ime anim prepare …`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ViewPropertyAnimator 곡선이 다음 animate() 에 남음**
- **Found during:** Task 1
- **Issue:** 280ms 감속(DecelerateInterpolator)이나 IME 곡선을 한 번 설정하면 같은 뷰의 이후 200ms 페이드에도 그 곡선이 그대로 쓰인다(`setInterpolator(null)` 은 선형이 된다).
- **Fix:** 모든 `animate()` 에 곡선 명시 — 기본 `STANDARD`(AccelerateDecelerate) · 대기 해제 `REVEAL`(Decelerate) · 키보드 `keyboardInterpolator`.
- **Files modified:** MainActivity.kt
- **Committed in:** d430aec

**2. [Rule 1 - Bug] 대기 해제 280ms 가 applyPath 의 두 번째 보임 호출로 200ms 로 갈아타짐(21-28 iOS 와 같은 경합)**
- **Found during:** Task 1
- **Fix:** `shownTarget` 멱등 가드 — 마지막 애니메이션이 보임이고 VISIBLE 이면 반환.
- **Committed in:** d430aec

**3. [Rule 2 - Missing Critical] 콜드 스타트 1.5초 상한 예약 · IME 방향 보정**
- **Found during:** Task 1
- **Issue:** 첫 onPageStarted 가 클라이언트 설치 전에 지나가면 `awaitingContent = true` 가 풀리지 않을 수 있다(T-21-65) · onPrepare 인셋이 기기에 따라 방향을 못 줄 수 있다.
- **Fix:** `setupTabBar` 끝에서 `onDocumentStart()` · `onStart` 에서 끝 상태 보정.
- **Committed in:** d430aec

**4. [Rule 2 - Missing Critical] 출처 기본 포트 정규화**
- **Found during:** Task 2
- **Issue:** 플랜 식(Uri.port 정확 일치)은 서버 URL 에 `:443` 을 적으면 운영 출처를 거부한다.
- **Fix:** http 80 · https 443 정규화 후 비교 · 리스너 규칙 문자열에서 기본 포트 생략.
- **Committed in:** 3d6e435

---

**Total deviations:** 4 auto-fixed (2 bug · 2 missing critical)
**Impact on plan:** 모두 D-12a · D-12b · T-21-03 의 의도를 지키기 위한 보강. 새 파일 · 새 타입 없음.

## Issues Encountered

- 에뮬레이터가 다른 세션과 공유돼 부하가 높아(load average 9) 대기 해제가 대부분 timeout 경로였다 — 수치는 참고값.
- 로그인 안 된 dev 에뮬레이터라 입력칸이 있는 탭 화면이 없어 IME 는 CDP 주입 입력칸으로 확인했다.
- 플랜 acceptance 의 `grep -c 'androidx.webkit:webkit:$androidxWebkitVersion'` 는 macOS BSD grep 이 패턴 중간 `$` 를 앵커로 읽어 0 을 낸다 — `grep -cF` 로 1 확인(build.gradle 47행).
- 설치된 앱은 스모크가 넣은 dev 빌드로 남아 있다(생성 설정은 스모크가 운영 URL 로 복원).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Android 쪽 G-21-R3-1 · R3-4 · IN-01 · WR-03 · WR-02 · IN-02 · IN-03 닫힘. 체감 판정(키보드 · 로그인 직후 탭바 · 폴백 뒤로가기)은 21-36 UAT.
- push 금지(21-36 결정) — 이 플랜은 로컬 커밋만.

---
*Phase: 21-gh-trade-mobile-app*
*Completed: 2026-09-26*

## Self-Check: PASSED

- 파일: data_extraction_rules.xml · 21-29-SUMMARY.md 존재
- 커밋: d430aec · 3d6e435 · 446cd80 존재
