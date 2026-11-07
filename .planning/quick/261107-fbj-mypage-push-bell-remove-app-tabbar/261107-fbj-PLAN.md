---
phase: quick-261107-fbj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — /me 정리(탭 순서 · 설정 탭 · 계정 카드 종 + 시트/팝오버 · 문구 · 알림음 끔)
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/__tests__/me-client.test.tsx
  - webapp/src/components/me/account-card.tsx
  - webapp/src/components/me/__tests__/account-card.test.tsx
  - webapp/src/components/me/push-alert-bell.tsx
  - webapp/src/components/me/__tests__/push-alert-bell.test.tsx
  - webapp/src/components/me/push-devices-card.tsx
  - webapp/src/components/me/push-devices-panel.tsx
  - webapp/src/components/me/__tests__/push-devices-card.test.tsx
  - webapp/src/components/me/__tests__/push-devices-panel.test.tsx
  - webapp/src/components/me/device-settings-card.tsx
  - webapp/src/components/me/__tests__/device-settings-card.test.tsx
  - webapp/src/lib/alert-tone.ts
  - webapp/src/lib/__tests__/alert-tone.test.ts
  - webapp/src/lib/breakout-list.ts
  - webapp/src/lib/__tests__/breakout-list.test.ts
  - webapp/src/lib/push/push-devices-api.ts
  - webapp/src/lib/use-trading-alerts.ts
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/brand-account.spec.ts
  - webapp/e2e/specs/account-axis-backstop.spec.ts
  # Task 2 — GH Trade 앱 네이티브 하단 플로팅 탭바 제거(iOS · Android)
  - mobile/ios/App/App/GHTradeBridgeViewController.swift
  - mobile/ios/App/App/NavigationDelegateProxy.swift
  - mobile/ios/App/App/GHTradeTheme.swift
  - mobile/ios/App/App/GHTradeTabBar.swift
  - mobile/ios/App/App/TabRoutes.swift
  - mobile/ios/App/App.xcodeproj/project.pbxproj
  - mobile/scripts/check-tab-routes-ios.sh
  - mobile/scripts/tab-routes-check.swift
  - mobile/scripts/release-apps.sh
  - mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradePalette.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/TabRoutes.kt
  - mobile/android/app/src/main/java/com/ghtrade/app/AppRoutes.kt
  - mobile/android/app/src/test/java/com/ghtrade/app/TabRoutesTest.kt
  - mobile/android/app/src/test/java/com/ghtrade/app/AppRoutesTest.kt
  - mobile/android/app/src/main/res/drawable/ic_tab_home.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_home_fill.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_search.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_search_fill.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_trading.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_trading_fill.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_ai.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_ai_fill.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_me.xml
  - mobile/android/app/src/main/res/drawable/ic_tab_me_fill.xml
  - mobile/package.json
  - mobile/README.md
  # Task 3 — 웹 쪽 앱 셸: 탭바 여백 걷기 · /trading 하단 공용 패널 복원 · overlay immediate 걷기 · 주석 정리
  - webapp/src/styles/globals.css
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/lib/native/native-bridge-provider.tsx
  - webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx
  - webapp/src/lib/native/native-overlay-marker.tsx
  - webapp/src/lib/native/post-native.ts
  - webapp/src/lib/native/__tests__/native-overlay.test.tsx
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/ui/sheet.tsx
  - webapp/src/components/ui/dialog.tsx
  - webapp/src/components/ui/popover.tsx
  - webapp/src/components/layout/app-shell.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/providers/theme-provider.tsx
  - webapp/src/components/stock/stock-detail-tabs.tsx
  - webapp/src/lib/strategy-log-feed.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/e2e/specs/native-shell.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
autonomous: true
requirements: ["261107-fbj"]

estimate:
  tokens: 210000
  raw_tokens: 210000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "U-1: /me 탭 순서가 현황 → 잔고 → 주문 → 손익 → 설정이고 `?tab=` 딥링크(settings · pnl 포함)는 그대로 열린다"
    - "U-2: /me 설정 탭에는 상따 기본설정(LimitChaserDefaultsSection)만 있다 — 돌파 알림음 카드와 알림 받는 기기 카드가 없고, 돌파 알림음은 예전에 켜 둔 저장값이 있어도 울리지 않는다"
    - "U-3: 계정 카드에 테마 · 로그아웃 앞 40×40 종 버튼(접근 이름 · title 「매매 알림」)이 있고, 켜짐(앱 = 이 기기 켜짐 · PC 웹 = 등록 기기 중 하나라도 켜짐)이면 Bell + 초록 점(--led-armed 8px), 아니면 BellOff · 점 없음이다. 하이드레이션 전에는 점이 없다. DMA 게이트 화면의 계정 카드에도 같은 종이 있다"
    - "U-3: 종을 누르면 폰 폭(<768) 또는 앱에서는 바텀 시트, 데스크톱 브라우저에서는 종에 붙은 팝오버가 열리고, 그 안에 기존 기능(이 기기 스위치 · 다른 기기 목록 · 끄기/지우기 · 권한 거부 · 옛 앱 안내)이 그대로 동작한다. 스위치를 켜면 패널을 닫지 않아도 종의 점이 바로 켜진다"
    - "U-4: 문구가 제목 「매매 알림」 · 스위치 「이 기기 매매 알림」 · 앱 설명 「주문 접수 · 체결 · 거부 · 자동 취소와 자동매도 시작 · 완료를 이 기기로 알려 드려요.」 · 웹 설명 「주문 접수 · 체결 · 거부 · 자동 취소와 자동매도 소식을 받을 기기예요. 켜기는 그 기기의 GH Trade 앱에서 해요.」 다"
    - "U-5: 새 GH Trade 앱 빌드(iOS · Android)에 하단 플로팅 탭바가 없다. 이동은 웹 헤더 햄버거 드로어로 하고, 당겨서 새로고침(오버레이 · 오프라인 동안 꺼짐) · 오프라인 폴백 · 테마 · Android 뒤로가기(오버레이 닫기 → 히스토리 → 홈 → 종료 · 로그인 화면은 종료)는 그대로다"
    - "U-6: 앱에서 종목상세 「트레이딩」 CTA 바와 더티 바는 브라우저와 같은 식으로 화면 하단에 서서 안전영역만 비키고, 본문 `main` 하단은 8px + 안전영역(홈 인디케이터)만 비운다"
    - "U-7: 앱 /trading 폰 밴드에서 하단 공용 패널(미체결 · 잔고 · 전략 로그)과 흐름 안 자리가 다시 보이고, 패널은 화면 하단에 붙어 안전영역만큼 아래 패딩을 갖는다(이때 본문 하단은 8px — 안전영역을 두 번 비우지 않는다)"
  artifacts:
    - path: webapp/src/components/me/push-alert-bell.tsx
      provides: "PushAlertBell(종 버튼 · 초록 점 · 폰/앱 시트 · 데스크톱 팝오버) + usePushAlertOn(점 판정 훅)"
    - path: webapp/src/components/me/push-devices-panel.tsx
      provides: "PushDevicesPanel(카드 테두리 없는 본문 — 이 기기 스위치 · 다른 기기 목록 · 안내) + PUSH_DEVICES_TEXT(매매 알림 문구) + formatPushLastSeen"
    - path: webapp/src/styles/globals.css
      provides: "§21 — 탭바 변수 없음 · 앱 main 하단 = s-2 + 안전영역(공용 패널 자리가 있으면 s-2) · 앱 공용 패널 숨김 규칙 없음 · --app-safe-bottom 은 env() 만"
    - path: mobile/ios/App/App/GHTradeBridgeViewController.swift
      provides: "탭바 · 표시 상태기계 · 키보드 관찰 · 문서 로드 대기 없음 — overlay/오프라인 → 당겨서 새로고침 가부만"
    - path: mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
      provides: "탭바 없음 · rootLayout 은 load() 에서 잡음 · 뒤로가기 ④ 홈 = navigateHome()"
    - path: mobile/android/app/src/main/java/com/ghtrade/app/AppRoutes.kt
      provides: "normalize · isAuthPath(뒤로가기 판정 전용 순수 함수)"
  key_links:
    - from: webapp/src/components/me/account-card.tsx
      to: webapp/src/components/me/push-alert-bell.tsx
      via: "테마 버튼 앞에 <PushAlertBell className={iconButton} />"
    - from: webapp/src/components/me/push-alert-bell.tsx
      to: "webapp/src/lib/push/use-push-devices.ts (usePushDevices · 공유 저장소 1벌) + PushDevicesPanel"
      via: "점 = usePushAlertOn() · 열면 Sheet(side=bottom) 또는 Popover 안에 PushDevicesPanel"
    - from: webapp/src/styles/globals.css
      to: "webapp/src/components/trading/workbench/shared-panels.tsx data-slot=shared-panels / shared-panels-spacer"
      via: "앱 숨김 규칙 삭제 · 브라우저 data-pinned 안전영역 패딩 규칙 공용 · main:has(spacer) 하단 s-2"
    - from: mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt
      to: mobile/android/app/src/main/java/com/ghtrade/app/AppRoutes.kt
      via: "navigateBack 의 홈 분기 판정(normalize · isAuthPath) — currentPath 는 onUrlChanged · route 메시지가 갱신"
---

<objective>
/me 마이페이지를 스케치 030 A 채택안대로 정리하고(탭 순서 · 설정 탭 매매 설정만 · 계정 카드 종 아이콘 + 시트/팝오버 · 「매매 알림」 문구 · 돌파 알림음 끔), GH Trade 앱(iOS · Android)의 네이티브 하단 플로팅 탭바를 걷어 내며, 웹 쪽 앱 셸(탭바 여백 · 공용 패널 숨김)을 브라우저와 같은 안전영역 규칙으로 되돌린다.

Purpose: 설정 탭이 매매 설정만 보이게 하고, 푸시 기기 관리를 계정 카드에서 한 번에 찾게 하며, 앱에서 탭바가 가리던 하단 공간(/trading 공용 패널 포함)을 되찾는다. 이동은 이미 있는 헤더 햄버거 드로어(5목적지 모두 사이드바에 있음)로 한다.
Output: 웹 /me 변경 + 새 앱 빌드용 네이티브 셸 변경 + 웹 앱 셸 CSS/브리지 정리, 각 Task 원자 커밋 3개(이상).

결정 출처: 오케스트레이터가 넘긴 사용자 결정 1~8 을 이 계획에서 U-1 ~ U-8 로 부른다(잠김 — 다시 묻지 않는다). 스케치 정본 `.planning/sketches/030-mypage-push-devices-hero/README.md`(A 채택) · 목업 `index.html` 의 heroA · panel() · .ib/.bd/.pop/.sheet CSS.

Tracer 생략 근거: 세 갈래 모두 이미 있는 패턴(Sheet/Popover · usePushDevices · §21 CSS · 브리지 메시지)을 따르는 정리 작업이라 새 아키텍처가 없다 — 얇은 관통 경로가 줄 정보가 없다. 세 Task 는 서로 파일이 겹치지 않아 순서대로 실행한다.

실행 규칙(사용자 · 메모리):
- 이 머신은 동시 세션 메모리 압박이 있다 — vitest 는 항상 `--maxWorkers=2`, Playwright 는 `--workers=1`, 영향받는 파일만 돌린다. 전체 회귀 금지.
- Playwright 전 `lsof -nP -iTCP:3100 -sTCP:LISTEN` 로 3100 점유 확인 — 다른 트리의 dev 서버면 죽이지 말고 e2e 를 건너뛰고 SUMMARY 에 「e2e 미실행(3100 점유)」 를 쓴다. webServer 타임아웃에 NextFontGoogleFontFileReplacer 반복이면 `rm -rf webapp/.next` 뒤 재실행.
- 실행자는 커밋까지만 한다 — push · 배포 · `pnpm native:release` 금지(메인 세션 몫). server/ · relay/ · workers/ · packages/ 는 건드리지 않는다.
- 커밋 메시지는 한글 · `Co-Authored-By` 줄 없음. 경로를 지정해 커밋한다(`git add -A` 금지 — 동시 세션 경합). 커밋 직전 `git status -sb` 로 남의 변경이 섞이지 않았는지 본다.
- 주석은 한국어 · 저장소 문체(촘촘 · 결정 ID 인용) — 이번 변경 출처는 `quick-261107-fbj`.
- ★ 남기는 주석에 **지운 식별자 이름을 그대로 적지 않는다**(각 Task `<verify>` 의 부정 grep 이 그 이름을 잡는다). 「돌파 알림음 카드 제거」 · 「네이티브 탭바 제거(quick-261107-fbj)」 처럼 개념으로 적는다. 「탭바」 낱말을 남겨야 하는 줄은 같은 줄에 `quick-261107-fbj` 를 함께 적는다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/sketches/030-mypage-push-devices-hero/README.md
@webapp/src/components/trading/me-client.tsx
@webapp/src/components/me/account-card.tsx
@webapp/src/components/me/push-devices-card.tsx
@webapp/src/lib/push/use-push-devices.ts
@webapp/src/components/ui/sheet.tsx
@webapp/src/components/ui/popover.tsx
@webapp/src/lib/alert-tone.ts
@webapp/src/styles/globals.css
@webapp/src/components/trading/workbench/shared-panels.tsx
@webapp/src/lib/native/native-bridge-provider.tsx
@mobile/ios/App/App/GHTradeBridgeViewController.swift
@mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt

Interface notes (planner 가 읽어 둔 사실 — 다시 찾지 않아도 된다):
- `usePushDevices()` 는 모듈 저장소 1벌(useSyncExternalStore) — 마운트 때 목록이 없거나 60초보다 오래됐을 때만 `refreshPushDevices()` 1회(진행 중 요청 공유). 서버 스냅숏은 빈 목록. 종 + 패널이 같이 써도 서버 호출은 1벌이고 폴링이 없다(O(N) 아님).
- `updatePushDevicesLocal(fn)` 이 켜기 · 끄기 · 지우기 결과를 저장소에 바로 반영한다 → 같은 훅을 읽는 종도 즉시 다시 그린다.
- `readPushDeviceKey()`(lib/push/device-key.ts) = localStorage 읽기(실패 시 메모리 키) · 없으면 null. 켜기 경로가 `getOrCreatePushDeviceKey()` 로 키를 처음 만든다 → 종은 키를 마운트 때 한 번만 읽으면 안 된다(켜기 직후 점이 안 켜짐).
- `isNativeApp()`(lib/native/native-detect.ts) — 마운트 뒤에만 읽는다(하이드레이션).
- `Sheet`/`SheetContent`(ui/sheet.tsx) 와 `PopoverContent`(ui/popover.tsx) 는 Content 첫 자식으로 `NativeOverlayMarker` 를 이미 렌더한다 → 앱에서 시트를 열면 overlay 신호(당겨서 새로고침 끔 · Android back 이 시트부터 닫음)가 자동이다. SheetContent props: `side` · `showCloseButton`(기본 true) · `overlay`. 내보냄: Sheet · SheetContent · SheetHeader · SheetTitle · SheetDescription 등. Popover 내보냄: Popover · PopoverTrigger · PopoverAnchor · PopoverContent · PopoverHeader · PopoverTitle.
- 매체 질의 훅 패턴은 `today-orders-card.tsx` 의 `useTableLayout`(useSyncExternalStore + matchMedia · 서버 스냅숏 false)을 따른다.
- 토큰: `--led-armed`(#03b26c · 초록) · `--muted`(버튼 면) · `--raised-2`(hover/열림 면) · `--popover` · `--card`. 계정 카드 아이콘 버튼 클래스 = account-card.tsx 의 `iconButton` 문자열.
- 크롬(Playwright) 안전영역은 0 이다 — 안전영역 합성은 테스트에서 `document.documentElement.style.setProperty('--app-safe-bottom', '34px')` 로 흉내 낸다(인라인이 :root 선언을 이긴다).
</context>

<tasks>

<!-- planner-discipline-allow: DeviceSettingsCard -->
<!-- planner-discipline-allow: PushDevicesCard -->
<!-- planner-discipline-allow: readTonePref -->
<!-- planner-discipline-allow: writeTonePref -->
<!-- planner-discipline-allow: isTonePlaybackBlocked -->
<!-- planner-discipline-allow: resumeToneContext -->
<!-- planner-discipline-allow: me-device-card -->
<!-- planner-discipline-allow: 체결 알림 -->
<!-- planner-discipline-allow: DeviceSettingsCard|PushDevicesCard|readTonePref|writeTonePref|isTonePlaybackBlocked|resumeToneContext|me-device-card -->
<!-- planner-discipline-allow: TabRoutes -->
<!-- planner-discipline-allow: GHTradeTabBar -->
<!-- planner-discipline-allow: GhTradeTabBar -->
<!-- planner-discipline-allow: GHTabID -->
<!-- planner-discipline-allow: TabId -->
<!-- planner-discipline-allow: tabBar -->
<!-- planner-discipline-allow: ic_tab_ -->
<!-- planner-discipline-allow: check-tab-routes -->
<!-- planner-discipline-allow: tab-routes-check -->
<!-- planner-discipline-allow: TabRoutes|GHTradeTabBar|GhTradeTabBar|GHTabID|TabId|tabBar|ic_tab_|check-tab-routes|tab-routes-check -->
<!-- planner-discipline-allow: 탭바 -->
<!-- planner-discipline-allow: native-tabbar -->
<!-- planner-discipline-allow: native-body-reserve -->
<!-- planner-discipline-allow: NATIVE_TAB_PATHS -->
<!-- planner-discipline-allow: NATIVE_TABBAR -->
<!-- planner-discipline-allow: nativeTabbarOffsetPx -->
<!-- planner-discipline-allow: native-tabbar|native-body-reserve|NATIVE_TAB_PATHS|NATIVE_TABBAR|nativeTabbarOffsetPx -->
<!-- planner-discipline-allow: immediate -->

<task type="auto" tdd="true">
  <name>Task 1: /me 정리 — 탭 순서 · 설정 탭 매매 설정만 · 계정 카드 종(시트/팝오버) · 「매매 알림」 문구 · 돌파 알림음 끔</name>
  <files>webapp/src/components/trading/me-client.tsx, webapp/src/components/trading/__tests__/me-client.test.tsx, webapp/src/components/me/account-card.tsx, webapp/src/components/me/__tests__/account-card.test.tsx, webapp/src/components/me/push-alert-bell.tsx, webapp/src/components/me/__tests__/push-alert-bell.test.tsx, webapp/src/components/me/push-devices-panel.tsx (git mv from push-devices-card.tsx), webapp/src/components/me/__tests__/push-devices-panel.test.tsx (git mv from push-devices-card.test.tsx), webapp/src/components/me/device-settings-card.tsx (삭제), webapp/src/components/me/__tests__/device-settings-card.test.tsx (삭제), webapp/src/lib/alert-tone.ts, webapp/src/lib/__tests__/alert-tone.test.ts, webapp/src/lib/breakout-list.ts, webapp/src/lib/__tests__/breakout-list.test.ts, webapp/src/lib/push/push-devices-api.ts, webapp/src/lib/use-trading-alerts.ts, webapp/src/components/trading/workbench/trading-workbench.tsx, webapp/src/components/trading/workbench/breakout-strip.tsx, webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx, webapp/e2e/specs/me.spec.ts, webapp/e2e/specs/brand-account.spec.ts, webapp/e2e/specs/account-axis-backstop.spec.ts</files>
  <behavior>
    - push-alert-bell: 브라우저 모드 · 저장소에 켜진 기기 0 → 버튼 접근 이름 「매매 알림」 · BellOff · 초록 점(`data-slot="push-alert-dot"`) 없음
    - push-alert-bell: 브라우저 모드 · 다른 기기 하나라도 enabled → Bell + 점
    - push-alert-bell: 앱 모드(가짜 Capacitor) · localStorage 기기 키 행이 enabled → 점 · 키 행은 꺼짐이고 다른 기기만 켜짐 → 점 없음
    - push-alert-bell: 앱 모드 · 마운트 뒤 기기 키를 새로 쓰고 `updatePushDevicesLocal` 로 그 키 행(enabled)을 넣으면 다시 마운트하지 않아도 점이 생긴다(켜기 직후 반영)
    - push-alert-bell: matchMedia (min-width: 768px) 참 · 브라우저 → 클릭하면 팝오버(`[data-slot="popover-content"]`) 안에 패널(`data-slot="me-push-devices-panel"`)과 제목 「매매 알림」
    - push-alert-bell: matchMedia 거짓(폰) → 클릭하면 `[data-slot="sheet-content"][data-side="bottom"]` 안에 패널 · 앱 모드는 matchMedia 참이어도 시트
    - push-alert-bell: `renderToString` 결과에 점이 없다(하이드레이션) · Radix 제목/설명 경고(console.error)가 나지 않는다
    - account-card: 버튼 순서 = 「매매 알림」 → 테마 → 「로그아웃」(종은 목으로 대체해 순서만 잠근다)
    - me-client B1: 탭 순서 `['현황', '잔고', '주문', '손익', '설정']` · `?tab=settings` 패널에는 상따 기본설정만(돌파 알림음 카드 · 매매 알림 패널 없음)
    - alert-tone: 옛 저장값 `gh-radar:breakout-tone` = "on" 이어도 `playBreakoutTone()` 은 false 이고 AudioContext 생성자를 부르지 않는다
    - push-devices-panel: 기존 케이스 전부(켜기 순서 · iOS 채널 없음 · PUT 실패 · 서버 켜짐 · PC 목록/끄기/지우기 · 앱 목록 · 거부 · 옛 앱 · 끄기 · 하이드레이션 · 저장소) 가 새 문구 상수로 그대로 통과
  </behavior>
  <action>
① 탭 순서(U-1) — `me-client.tsx` 의 `ME_TABS` 를 status · accounts · orders · pnl · settings 순서로 바꾼다(`ME_TAB_VALUES` 는 파생이라 그대로). 바로 위 「D-1 — 탭 순서」 주석과 헤더 ① 단락(「4탭 … 현황 → 잔고 → 주문 → 설정 · Phase 36 이 5번째 「손익」 을 맨 뒤에」)을 「현황 → 잔고 → 주문 → 손익 → 설정(quick-261107-fbj — 설정을 맨 뒤로)」 로 고친다. 헤더 ① ★ 의 「앱은 /trading 하단 공용 패널을 숨기므로 전략 로그를 여기서 본다 · 잃는 동작은 앱에서 범위 밖」 문장은 「앱도 quick-261107-fbj 부터 /trading 하단 공용 패널을 다시 보인다 — /me 「현황 | 로그」 전환은 두 번째 입구로 그대로 둔다」 로 바꾼다. TabsContent 블록 순서는 바꾸지 않아도 된다(탭 순서는 트리거가 정한다). DMA 게이트 분기의 주석 「앱 「마이」 탭」 표현은 「앱에서 사이드바 드로어를 열지 않고」 로 바꾼다.

② 설정 탭(U-2) — settings TabsContent 에서 돌파 알림음 카드와 알림 받는 기기 카드 두 요소와 그 주석을 지우고 `LimitChaserDefaultsSection` 만 남긴다. 두 import 도 지운다. 돌파 알림음 카드 파일(`device-settings-card.tsx`)과 그 테스트는 `git rm` 한다(이제 닿는 곳이 없다).

③ 알림음 끔(U-2 · 사용자 「저장값과 무관하게 꺼짐」) — `alert-tone.ts` 를 `playBreakoutTone(): boolean` 이 언제나 false 를 돌려주는 모듈로 줄인다. Web Audio 합성 코드(컨텍스트 지연 생성 · 상수 · 차단 판정 · resume 함수)는 닿는 곳이 없어지므로 지운다. 호출부 계약(breakout-strip · use-trading-alerts 의 「기록 먼저, 재생 나중」)은 그대로 두고 함수 이름 · 시그니처를 유지해 호출부와 그 테스트의 목(`vi.mock('@/lib/alert-tone')`)이 그대로 컴파일된다. 헤더 주석은 「quick-261107-fbj — 돌파 알림음은 저장값과 무관하게 꺼짐 · /me 토글 카드도 제거 · 합성 구현은 git 이력(Phase 18 D-17)」 요지로 다시 쓴다. `breakout-list.ts` 의 알림음 설정 타입 · 저장 키 상수 · 읽기/쓰기 함수 4개를 지우고, 파일 머리 주석에서 「로컬 설정 패턴 정본」 으로 그 함수를 가리키던 문장은 같은 파일의 다른 로컬 저장 함수(예: 울린 종목 집합 읽기)를 가리키게 고친다. `breakout-list.test.ts` 에서 알림음 설정 단언만 지운다(같은 it 안의 다른 함수 단언은 남긴다). `alert-tone.test.ts` 는 새 동작 한두 케이스로 다시 쓴다: localStorage 에 옛 키 `gh-radar:breakout-tone`="on" 을 넣어도 false · `globalThis.AudioContext` 를 vi.fn 생성자로 바꿔 두고 호출 0 · 소스에 오디오 파일 참조가 없다는 기존 정적 단언은 남겨도 된다. `breakout-strip.tsx` 의 「토글·차단은 모듈이 판정」 한 줄 주석은 「재생 여부는 모듈이 판정 — 지금은 꺼짐(quick-261107-fbj)」 로, `workbench-status-bar.test.tsx` 머리 주석의 「알림음 아이콘 → /me 「이 기기」 카드」 는 「알림음은 quick-261107-fbj 로 꺼짐」 으로 고친다. 작업대에 알림음 토글을 노출하는 다른 UI 가 없는지 `<verify>` 의 grep 이 확인한다.

④ 패널 분리(U-3 · U-4) — `git mv webapp/src/components/me/push-devices-card.tsx webapp/src/components/me/push-devices-panel.tsx`(테스트도 같은 식으로 `push-devices-panel.test.tsx`). 컴포넌트를 `PushDevicesPanel({ className? })` 로 바꾸고 기존 로직(모드 판정 · 권한 · 켜기/끄기/지우기 · 확인 5초 · 하이드레이션)은 그대로 둔다. 바뀌는 것: 카드 테두리(`section` · `rounded bg-card p-3` · h2 제목)를 걷고 루트를 `div data-slot="me-push-devices-panel"` 로 — 제목은 감싸는 시트/팝오버가 그린다. 앱 모드에서 다른 기기가 있으면 목록 위에 목업 `.np-sec` 와 같은 소제목 「다른 기기」(12px/600 muted · 위 12 아래 4 여백)를 둔다(문구 상수 `otherDevices`). 행 최소 높이 · 글자 크기는 목업 `.np-row`(min-height 48 · 14px · 보조 12px)와 같게 맞추되 기존 클래스와 거의 같으면 건드리지 않는다. 문구 상수 `PUSH_DEVICES_TEXT` 를 U-4 대로: title 「매매 알림」 · thisDevice 「이 기기 매매 알림」 · captionApp 「주문 접수 · 체결 · 거부 · 자동 취소와 자동매도 시작 · 완료를 이 기기로 알려 드려요.」 · captionWeb 「주문 접수 · 체결 · 거부 · 자동 취소와 자동매도 소식을 받을 기기예요. 켜기는 그 기기의 GH Trade 앱에서 해요.」. 켜기 실패 로그를 `console.warn("[gh-radar] 이 기기 매매 알림 켜기 실패", …)` 로. 파일 머리 주석의 「/me 설정 탭 「알림 받는 기기」 카드」 · 「이 기기 체결 알림 스위치」 · 「위 「이 기기」 카드(돌파 알림음)와 별개」 표현을 새 자리(계정 카드 종 → 시트/팝오버 · quick-261107-fbj · 스케치 030 A)와 새 이름으로 고친다. 같은 문구 변경을 주석에도: `push-devices-api.ts` L28 · `use-trading-alerts.ts` L47 · `trading-workbench.tsx` L1257 의 「이 기기 체결 알림」 → 「이 기기 매매 알림」(코드 변경 없음). Android 알림 채널 이름(packages/shared `PUSH_CHANNEL_NAME`)은 OS 설정 화면 범주 이름이라 이번 범위 밖 — 건드리지 않는다. 패널 테스트는 import · data-slot · 제목 단언(하이드레이션 케이스의 title 포함 단언은 「캡션 · 스위치 켜짐 · 기기 줄이 없다」 로 바꾼다) · describe 제목과 머리 주석의 옛 이름(「이 기기 …」 스위치 이름 · 설정 탭 카드)만 고친다 — 케이스 동작은 그대로.

⑤ 종(U-3) — 새 파일 `push-alert-bell.tsx`(`"use client"`):
- `usePushAlertOn(): boolean` 을 내보낸다. `usePushDevices()` 의 devices 와, 마운트 뒤 effect 에서 한 번 정하는 `native = isNativeApp()`(마운트 전 null → false 반환)을 쓴다. 앱이면 렌더 때마다 `readPushDeviceKey()` 를 다시 읽어 그 키 행이 enabled 인가, 브라우저면 enabled 행이 하나라도 있는가. 키를 state 로 고정하지 않는다(켜기 직후 점이 안 켜지는 함정 — 위 Interface notes).
- `PushAlertBell({ className })`: 열림 state 하나 + 데스크톱 판정(마운트 뒤 · `!isNativeApp()` ∧ matchMedia `(min-width: 768px)` — today-orders-card 의 useSyncExternalStore 패턴, 서버 스냅숏 false). 렌더: `Popover open={open && desktop} onOpenChange={setOpen}` 안에 `PopoverTrigger asChild` 로 종 버튼, `PopoverContent align="end" sideOffset 8` 에 제목 + 패널; 형제로 `Sheet open={open && !desktop} onOpenChange={setOpen}` · `SheetContent side="bottom" showCloseButton={false}` 에 손잡이(36×4 · rounded · `--raised-2` · aria-hidden · 가운데) + `SheetHeader`/`SheetTitle` 「매매 알림」 + 패널. PopoverTrigger 의 클릭이 onOpenChange(!openProp) 를 부르므로 폰에서는 open=true 가 되어 시트가 열린다 — 별도 onClick 을 두지 않는다(팝오버 바깥 클릭 = 앵커 재클릭 경합 회피). Radix 경고가 나지 않게 시트에는 제목을 주고 설명이 없으면 `aria-describedby={undefined}` 를 준다. 팝오버는 `aria-labelledby` 로 제목(16/700 · 목업 `.np-h`)을 잇는다.
- 모양: 버튼 = 받은 `className`(계정 카드 iconButton) + `relative text-[var(--fg)]`, 열려 있는 동안(open state) 면 `bg-[var(--raised-2)]`(목업 `.ib.act`). 아이콘 lucide `Bell`(켜짐) / `BellOff`(아님) 18px · aria-hidden. 점 = `span data-slot="push-alert-dot" aria-hidden` · absolute top-2 right-2 · size-2 · rounded-full · `bg-[var(--led-armed)]` · `ring-2 ring-[var(--muted)]`, 버튼 hover · 열림이면 고리 색 `--raised-2`(목업 `.bd` 의 box-shadow 를 group-hover 로). aria-label · title 「매매 알림」(PUSH_DEVICES_TEXT.title 재사용 — 문구 한 곳).
- 팝오버 면: 폭 360(`max-w-[calc(100vw-32px)]`) · radius 16 · 안쪽 14/12/10 · `--popover` 면 · gap 0(목업 `.pop`). 시트 면: `rounded-t-[22px]` · `--card` 면 · 안쪽 위 10 · 좌우 16 · 아래 24 · gap 0 · `max-h-[85dvh] overflow-y-auto`(기기 많을 때 — 앱 하단 안전영역은 globals 의 bottom 시트 투명 테두리 규칙이 이미 비킨다).
- 파일 머리 주석: quick-261107-fbj · 스케치 030 A · 점 판정(앱 = 이 기기 · PC = 아무 기기) · 시트/팝오버 갈림 · 서버 호출 1벌(usePushDevices 공유 · 폴링 없음) · 앱 시트는 SheetContent 의 overlay 마커가 당겨서 새로고침/back 을 처리.

⑥ 계정 카드(U-3) — `account-card.tsx` 의 버튼 줄 맨 앞(테마 버튼 앞)에 `<PushAlertBell className={iconButton} />`. user 가 없으면 카드가 통째로 null 이라 종도 없다. 헤더 주석 ①(「테마 · 로그아웃 아이콘 버튼 40×40 · 앱 「마이」 탭에서」)을 「매매 알림 · 테마 · 로그아웃 40×40 · 앱에서 드로어를 열지 않고」 로, ⑥ 을 새로 「종 = 푸시 기기 관리 입구(quick-261107-fbj · 스케치 030 A) — 사용자 단위라 DMA 게이트 화면의 계정 카드에도 보인다」 로 적는다. DMA 게이트 분기에도 종을 둔다(결정: 푸시는 DMA 와 무관한 사용자 단위 · 켜 둬도 해가 없다 — 숨기면 미매핑 사용자가 기존 기기를 끌 곳이 없다). `account-card.test.tsx` 는 `vi.mock('@/components/me/push-alert-bell', …)` 로 종을 접근 이름 「매매 알림」 짜리 단순 버튼으로 바꾸고 버튼 순서 케이스 하나를 더한다.

⑦ 새 테스트 `push-alert-bell.test.tsx` — 위 behavior 7줄. `@/lib/push/push-devices-api` 는 push-devices-panel.test 와 같은 꼴로 목, 저장소는 `__resetPushDevicesForTest` · `updatePushDevicesLocal` 로 채운다. 앱 모드는 panel 테스트의 가짜 Capacitor 설치 방식(`window.Capacitor` + `html.native-app` — 그 테스트의 installCapacitor 를 그대로 옮기거나 최소판)을 따른다. matchMedia 는 `vi.stubGlobal`/`window.matchMedia = vi.fn(...)` 로 케이스마다 정한다.

⑧ e2e(코드 수정만 — 실행은 아래) — `me.spec.ts`: 탭 순서 단언(L957 근처 `['현황', '잔고', '주문', '설정', '손익']`)을 새 순서로, L442 · L952 근처 「4탭(현황 · 잔고 · 주문 · 설정)」 주석을 5탭 새 순서로. `brand-account.spec.ts` 의 「앱 모드 390」 테스트에 계정 카드 안 `getByRole('button', { name: '매매 알림' })` toBeInViewport 한 줄. `account-axis-backstop.spec.ts` 의 S9(「이 기기」 카드 · AudioContext 차단) 테스트 전체(L528 근처~그다음 S13 테스트 직전)를 지우고 머리 주석의 S9 언급을 고친다.

⑨ 실행 — `<verify>` 명령 후 e2e: `pnpm --filter @gh-radar/webapp exec playwright test brand-account --workers=1` 와 `pnpm --filter @gh-radar/webapp exec playwright test me.spec --workers=1 -g "전략 3 · 계좌 2"`(3100 점유 규칙은 objective). 그다음 경로 지정 커밋(예: 「feat(quick-261107-fbj): /me 탭 순서 · 설정 탭 정리 · 계정 카드 매매 알림 종」).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest --run --maxWorkers=2 push-alert-bell.test push-devices-panel.test account-card.test me-client.test alert-tone.test breakout-list.test breakout-strip.test use-trading-alerts.test workbench-status-bar.test && pnpm --filter @gh-radar/webapp run typecheck && ! grep -rnE "DeviceSettingsCard|PushDevicesCard|readTonePref|writeTonePref|isTonePlaybackBlocked|resumeToneContext|me-device-card" webapp/src webapp/e2e && ! grep -rn "체결 알림" webapp/src/components/me</automated>
  </verify>
  <done>
    - 위 vitest 9개 파일 통과 · typecheck(앱 + e2e tsconfig) 통과 · 두 부정 grep 이 빈 결과(기준선: HEAD 에서는 둘 다 결과가 있다 — 지금 통과하면 grep 이 틀린 것).
    - /me 탭 순서 현황 · 잔고 · 주문 · 손익 · 설정, 설정 탭 = 상따 기본설정만.
    - 계정 카드 종: 점 판정 · 시트/팝오버 갈림 · 패널 기능 · 하이드레이션이 테스트로 잠김.
    - e2e brand-account · me.spec(전략 3 · 계좌 2) 통과, 또는 3100 점유로 미실행이면 SUMMARY 에 그 사실.
    - Task 1 커밋 1개 이상(경로 지정 · 한글 · Co-Authored-By 없음).
  </done>
</task>

<task type="auto">
  <name>Task 2: GH Trade 앱 네이티브 하단 플로팅 탭바 제거 — iOS · Android (새 빌드만 · 옛 빌드 호환 불필요)</name>
  <files>mobile/ios/App/App/GHTradeBridgeViewController.swift, mobile/ios/App/App/NavigationDelegateProxy.swift, mobile/ios/App/App/GHTradeTheme.swift, mobile/ios/App/App/GHTradeTabBar.swift (삭제), mobile/ios/App/App/TabRoutes.swift (삭제), mobile/ios/App/App.xcodeproj/project.pbxproj, mobile/scripts/check-tab-routes-ios.sh (삭제), mobile/scripts/tab-routes-check.swift (삭제), mobile/scripts/release-apps.sh, mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt, mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt, mobile/android/app/src/main/java/com/ghtrade/app/GhTradePalette.kt, mobile/android/app/src/main/java/com/ghtrade/app/GhTradeTabBar.kt (삭제), mobile/android/app/src/main/java/com/ghtrade/app/AppRoutes.kt (git mv from TabRoutes.kt), mobile/android/app/src/test/java/com/ghtrade/app/AppRoutesTest.kt (git mv from TabRoutesTest.kt), mobile/android/app/src/main/res/drawable/ic_tab_*.xml (10개 삭제), mobile/package.json, mobile/README.md</files>
  <action>
원칙(U-5): 탭바 뷰 · 표시 상태기계(숨김/보임 · 150ms · 페이드 · 키보드 디바운스 · 문서 로드 대기) · 탭 경로표 · 탭 이동을 걷고, 다른 기능이 쓰는 것은 남긴다 — overlay 신호(당겨서 새로고침 끔 · Android back) · 오프라인 판정/폴백 · 테마 · `route`(Android 뒤로가기의 현재 경로) · 브리지 메시지 화이트리스트 · `openSettings`. 웹은 Task 3 에서 overlay 의 즉시 숨김 필드를 더 이상 보내지 않는다 — 네이티브도 그 필드를 읽지 않는다. diff 는 수술적으로: 남는 함수의 본문은 탭바 줄만 뺀다.

iOS (`mobile/ios/App/App/`):
- `GHTradeBridgeViewController.swift`: 탭바 프로퍼티 · `hideWork` · `showWork` · `hiddenByKeyboard` · `keyboardVisible` · `awaitingContent` · `awaitingWork` · `revealingAfterLoad` · `currentPath`(탭 전용) 를 지운다. `currentTheme` 의 didSet(탭바 팔레트)과 탭바 테마 함수, `setupTabBar` · `beginDocumentLoad` · `endAwaitingContent` · `applyPath` · `observeKeyboard` · keyboardWillShow/Hide · `shouldHideTabBar` · `updateTabBarVisibility` · `selectTab` 을 지우고 `capacitorDidLoad` 의 호출 두 줄(탭바 설치 · 키보드 관찰)도 지운다. 남는 것: `urlObservation` + `observeURL` + `handleURL`(본문 = `isOfflinePage = !onAppServer` 뒤 `updatePullToRefreshAvailability()`), `overlayOpen`, `isOfflinePage`, 당겨서 새로고침 · 오프라인 · 테마 · openSettings. 메시지: `.ready` = overlayOpen 이 참이면 false 로 되돌리고 `updatePullToRefreshAvailability()`; `.overlay` = `overlayOpen = open == true` 뒤 `updatePullToRefreshAvailability()`(즉시 필드 파싱 삭제); `.route` = 화이트리스트에 남기고 debug 로그만(이제 iOS 가 쓰지 않음 — Android 뒤로가기용 계약). `updatePullToRefreshAvailability` 의 doc 주석은 그대로 맞다. 클래스 머리 주석의 「하단 플로팅 탭바(21-10 · D-02 · D-27b) … 탭 = 웹 navigate 훅」 단락을 「quick-261107-fbj 로 네이티브 탭바 제거 — 이동은 웹 헤더 햄버거 드로어」 한 줄로 바꾼다.
- `NavigationDelegateProxy.swift`: `didStartProvisionalNavigation` 재정의(원본 호출 + VC 대기 시작뿐)를 지운다 — 이 프록시는 구현하지 않은 콜백을 `responds(to:)` · `forwardingTarget(for:)` 로 원본(Capacitor)에 자동 전달하므로(파일 머리 주석 · 실제 구현을 열어 확인) 원본은 계속 그 콜백을 받는다. 머리 주석 ① 의 「문서 로드 시작(원본 먼저 → 탭바 대기 · D-12b)」 구절과 그 MARK 를 지운다.
- `GHTradeTheme.swift`: `GHTradePalette` 에서 탭바만 쓰던 필드를 지운다 — 지우기 전에 `grep -rn "\.card\b\|\.muted\b\|\.glass\b\|glassAlpha" mobile/ios/App/App` 로 확인(planner 확인 시점: 남는 사용처는 `bg`(applyTheme) · `primary`(NavigationDelegateProxy 인앱 브라우저 틴트)뿐). 머리 주석의 탭바 · glass · Android 와 같은 값 설명을 남는 필드 기준으로 고친다.
- `git rm mobile/ios/App/App/GHTradeTabBar.swift mobile/ios/App/App/TabRoutes.swift`.
- `App.xcodeproj/project.pbxproj`: 두 파일 참조 8줄을 지운다 — ID `9C7F6BE0006574ED36488523`(GHTradeTabBar BuildFile) · `334843079C7D454CC7B563C7`(GHTradeTabBar FileRef) · `0A6A48CDA89C4090B5E0E300`(TabRoutes BuildFile) · `5ECFC53EE66BF0ED04ADF537`(TabRoutes FileRef) 가 들어간 줄 전부(PBXBuildFile · PBXFileReference · 그룹 children · Sources 단계 각 1줄씩). 다른 줄은 건드리지 않는다. `plutil -lint` 로 형식 확인.
- `git rm mobile/scripts/check-tab-routes-ios.sh mobile/scripts/tab-routes-check.swift`.

Android (`mobile/android/app/src/main/java/com/ghtrade/app/`):
- `MainActivity.kt`: `rootLayout` 대입(`bridge.webView.parent as ViewGroup`)을 탭바 설치 함수에서 꺼내 `load()` 의 `wrapInSwipeRefresh(wv)` **앞**으로 옮긴다(감싼 뒤엔 WebView 부모가 바뀐다 — 스피너 오프셋이 rootLayout 을 읽는다). 탭바 lateinit · 탭바 설치 함수(페이드 · 인셋 리스너 · IME 애니메이션 콜백 · 전역 레이아웃 리스너 포함) · `keyboardVisible` · `hideRunnable` · `showRunnable` · `hiddenByKeyboard` · `awaitingContent` · `awaitingTimeout` · `revealingAfterLoad` · `shownTarget` · `imeVisibleNow` · `keyboardRising` · `onDocumentStart` · `endAwaitingContent` · `shouldHideTabBar` · `updateTabBarVisibility` · `selectTab` · companion 의 두 Interpolator 를 지운다. `mainHandler` · `dpF` · `dp` 는 다른 사용처가 남는지 grep 해서 남으면 둔다(`dp` 는 updateSpinnerOffset 이 쓴다). `applyTheme` 의 탭바 팔레트 한 줄, `onConfigurationChanged` 의 탭바 폭 주석을 지운다. `onUrlChanged` 의 else 분기(탭바 비활성 · 표시 갱신)를 지운다 — isOfflinePage 갱신은 남긴다. `applyPath` = `currentPath = AppRoutes.normalize(path)` 만. 메시지: "ready" = pullBlocked · overlayOpen 리셋만, "route" = `path.startsWith("/") && !isOfflinePage` 이면 applyPath(로그의 awaiting 표기 삭제), "overlay" = `overlayOpen = payload?.optBoolean("open") == true`(즉시 필드 파싱 삭제). 뒤로가기 `navigateBack` 의 ④ 분기 판정을 `!isOfflinePage && currentPath != "/" && !AppRoutes.isAuthPath(currentPath)` 로, 동작을 `clearHistoryOnHome = true; navigateHome()` 로. 새 private `navigateHome()` = WebView 에 상수 스크립트 `window.__ghTrade&&window.__ghTrade.navigate?window.__ghTrade.navigate('/'):location.assign('/')` 를 evaluateJavascript(오프라인 분기는 ④ 판정이 이미 막으므로 필요 없음 · T-21-36 상수 스크립트 원칙 주석). 안 쓰게 된 import(Gravity · CoordinatorLayout · WindowInsetsAnimationCompat · Interpolator 류 · View · max 등)를 정리한다. 클래스 KDoc 의 「인셋 리스너는 탭바 컨테이너에만」 · 「하단 플로팅 탭바(21-12 …)」 항목을 「인셋 리스너를 걸지 않는다」 · 「quick-261107-fbj 로 네이티브 탭바 제거 — 이동은 웹 드로어」 로 고친다.
- `GhTradeWebViewClient.kt`: `onPageStarted` 재정의(super + 문서 로드 대기 시작뿐)와 그 KDoc 을 지우고 안 쓰게 된 import(Bitmap 등)를 정리한다.
- `GhTradePalette.kt`: 탭바만 쓰던 `muted` · `glass` 를 지우고(남는 사용처: `card` = 스피너 배경 · `bg` · `primary`) 머리 주석을 고친다.
- `git mv TabRoutes.kt AppRoutes.kt` → `object AppRoutes { normalize(path) · isAuthPath(path) }` 만 남긴다(enum 과 활성 판정 삭제 · 기존 「탭바 숨김」 함수가 isAuthPath — 로그인/인증 화면 판정 · 뒤로가기 ④ 전용). 머리 주석: 순수 Kotlin · JVM 단위 테스트 대상 · 뒤로가기 판정용.
- 테스트 `git mv mobile/android/app/src/test/java/com/ghtrade/app/TabRoutesTest.kt …/AppRoutesTest.kt` → normalize 케이스와 isAuthPath 케이스(기존 숨김 판정 표 그대로)만 남긴다.
- `git rm mobile/android/app/src/main/res/drawable/ic_tab_*.xml`(10개) — 지우기 전 `grep -rn "ic_tab_" mobile/android/app/src` 가 지울 탭바 파일 외 사용처 0 인지 본다.

스크립트 · 문서: `mobile/package.json` — `native:check-tab-routes:ios` 항목 삭제, `native:test:android` 의 `--tests` 를 AppRoutesTest + ExternalLinksTest 로. `mobile/README.md` — L6 「네이티브가 직접 그리는 것」 목록에서 하단 탭바를 빼고(이동 = 웹 헤더 햄버거 드로어), 스크립트 표의 iOS 탭 경로 검사 행 삭제, `native:test:android` 설명을 「앱 경로 판정(AppRoutesTest) · 인앱 브라우저 링크 판정표」 로, L89 「(탭바 · 아이콘 · …)」 에서 탭바 삭제. `mobile/scripts/release-apps.sh` L16 주석도 같은 식으로.

실행 · 커밋: `<verify>` 의 Gradle · xcodebuild 는 샌드박스가 데몬/DerivedData/네트워크를 막으면 `dangerouslyDisableSandbox: true` 로 다시 돌린다. 그래도 못 돌리면 SUMMARY 에 「iOS 빌드 미실행(사유)」 · 「Android 빌드 미실행(사유)」 를 명시한다 — 조용히 건너뛰지 않는다(GSD 게이트 임의 생략 금지). `cap sync` 는 돌리지 않는다(생성물 diff 방지 — 플러그인 변경 없음). 커밋 예: 「feat(quick-261107-fbj): 앱 네이티브 하단 탭바 제거 — iOS · Android」. 앱 릴리스(`pnpm native:release`)는 메인 세션 몫 — 실행하지 않는다.
  </action>
  <verify>
    <automated>! grep -rnE "TabRoutes|GHTradeTabBar|GhTradeTabBar|GHTabID|TabId|tabBar|ic_tab_|check-tab-routes|tab-routes-check" mobile/ios/App/App mobile/ios/App/App.xcodeproj mobile/android/app/src mobile/scripts mobile/package.json mobile/README.md && ! (grep -rn "탭바" mobile/ios/App/App mobile/android/app/src mobile/scripts mobile/README.md | grep -v "quick-261107-fbj") && plutil -lint mobile/ios/App/App.xcodeproj/project.pbxproj && pnpm --filter @gh-radar/mobile run native:test:android && xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath mobile/ios/DerivedData build -quiet</automated>
  </verify>
  <done>
    - 두 부정 grep 빈 결과(기준선: HEAD 에서 둘 다 결과 있음 — 12 · 22개 파일) · pbxproj lint OK.
    - Android `testDebugUnitTest`(AppRoutesTest · ExternalLinksTest — main Kotlin 컴파일 포함) 통과.
    - iOS Debug 시뮬레이터 빌드 성공, 또는 실행 불가 사유가 SUMMARY 에 명시됨.
    - Android 뒤로가기 ④(홈으로) · 로그인 화면 종료 · 오버레이 우선 닫기 경로가 코드상 유지(currentPath 는 onUrlChanged · route 로 갱신).
    - Task 2 커밋 1개 이상.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 웹 앱 셸 — 탭바 여백 걷기 · 하단 고정 바는 안전영역만 · /trading 하단 공용 패널 복원 · overlay 즉시 필드 걷기 · 주석 정리 · e2e</name>
  <files>webapp/src/styles/globals.css, webapp/src/components/trading/workbench/shared-panels.tsx, webapp/src/components/trading/__tests__/shared-panels.test.tsx, webapp/src/components/trading/card/strategy-card.tsx, webapp/src/components/trading/__tests__/strategy-card.test.tsx, webapp/src/lib/native/native-bridge-provider.tsx, webapp/src/lib/native/__tests__/native-bridge-provider.test.tsx, webapp/src/lib/native/native-overlay-marker.tsx, webapp/src/lib/native/post-native.ts, webapp/src/lib/native/__tests__/native-overlay.test.tsx, webapp/src/components/trading/lc/number-pad-sheet.tsx, webapp/src/components/ui/sheet.tsx, webapp/src/components/ui/dialog.tsx, webapp/src/components/ui/popover.tsx, webapp/src/components/layout/app-shell.tsx, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/providers/theme-provider.tsx, webapp/src/components/stock/stock-detail-tabs.tsx, webapp/src/lib/strategy-log-feed.tsx, webapp/src/components/trading/strategy-status-card.tsx, webapp/e2e/specs/native-shell.spec.ts, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <behavior>
    - shared-panels.test: 더티 바 예약 인라인 `bottom` 이 `${px}px`(탭바 변수 식 없음)
    - strategy-card.test: 카드 더티 바 위치 식 = innerHeight − `--wb-bottom-inset`(inset 0 → translateY(-656px) · 문서에 `--wb-bottom-inset: 120px` 이면 → translateY(-776px)) · 프로브 요소가 문서에 생기지 않는다
    - native-overlay.test: 키패드 시트 열림 → overlay `{open:true}` 1회 · 닫힘 → `{open:false}` 1회(즉시 필드 없음) · 기존 계수 · 겹침 · 브라우저 0 케이스 유지
    - native-bridge-provider.test: 앱이면 주요 목적지 5곳 prefetch(이름만 바뀜) · 브라우저/로그인 경로 0 그대로
    - e2e native-shell: 앱 390 홈 main 하단 8px · `--app-safe-bottom` 34px 주입 시 42px · 앱 390 종목상세 CTA 바 bottom 0 · 하단 20(34 주입 시 34) · 예약 96 · 앱 1280 홈 main 하단 8 · 앱 android 에서 `--safe-area-inset-bottom` 48px 주입은 무시(CTA 하단 20 · main 8) · 브라우저 회귀 그대로
    - e2e trading-workbench: 앱 390 /trading 은 공용 패널 보임 · data-pinned · spacer 1 · 패널 아랫변 = 화면 아랫변 · `--app-safe-bottom` 34px 주입 시 패널 아래 패딩 34px · main 하단 8px · 앱 1024 도 패널 보임 · 브라우저 390/1280 그대로 · 앱 키패드 열림 신호 = `{open:true}`
  </behavior>
  <action>
① globals.css §21(U-6 · U-7 · ~L747-836):
- `:root` 의 탭바 offset · 본문 예약 변수 두 줄과 `html.native-app { 탭바 gap · offset · reserve }` 블록을 지운다.
- `--app-safe-bottom` 을 `env(safe-area-inset-bottom, 0px)` 만 읽게 바꾼다(위 · 좌 · 우와 같은 규칙). 근거를 주석에: 주입값을 유지하던 유일한 이유가 네이티브 탭바가 같은 주입 인셋으로 자리 잡는 것이었고(quick-261107-fbj 로 제거), 주입이 0 이 아닌 경우는 WebView ≥ 140 뿐이며 그때 env() 가 정확하다(같은 블록의 상단 근거와 동일) — 주입값을 계속 읽으면 Android ≤ 14 비-엣지투엣지(S10e 등)에서 하단 고정 바 · 공용 패널 아래가 내비바 높이만큼 한 번 더 빈다(종전 주석의 「하단 이중 여백」). `--safe-area-inset-*` 는 이제 어느 변수도 읽지 않는다고 적는다.
- `html.native-app main` = `padding-bottom: calc(var(--s-2) + var(--app-safe-bottom))`(홈 인디케이터만 비킴). 이어서 `html.native-app main:has([data-slot="shared-panels-spacer"])` = `padding-bottom: var(--s-2)` — 폰 밴드에서는 흐름 안 자리(spacer)가 패널 실측 높이(안전영역 패딩 포함)를 이미 예약하므로 안전영역을 두 번 비우지 않는다(브라우저와 같은 페이지 끝 8px).
- 하단 고정 요소 규칙: `html.native-app [data-slot="dirty-action-bar"]` 는 `right: 0`(앱엔 챗 FAB 없음 · D-10)만 남기고 bottom · padding 줄을 지운다(브라우저 규칙 `max(s-2, safe)` 패딩 + 컴포넌트 bottom-0 이 그대로 적용). `html.native-app [data-slot="detail-order-cta-bar"]` 블록과 `@media (max-width:767.98px) html.native-app [data-order-cta="true"]` 블록을 지운다(브라우저 식 bottom 0 · 하단 max(20, safe) · 예약 76 + max(20, safe) 그대로 — CTA 식의 정본 stock-detail-tabs 주석과 일치).
- 앱 공용 패널 숨김 규칙(`html.native-app [data-slot="shared-panels"], …-spacer { display:none }`)과 그 주석 단락을 지운다. 브라우저 규칙 `[data-slot="shared-panels"][data-pinned="true"] { padding-bottom: var(--app-safe-bottom) }` 가 앱에도 그대로 적용된다.
- §21 머리 주석: 제목에서 「네이티브 탭바 여백」 을 빼고, 탭바 기하 정본(D-27b · 60 · 98 · 네이티브 상수 · e2e 수치) 단락을 「quick-261107-fbj — 네이티브 탭바 제거: 앱 하단 고정 요소 · 본문은 브라우저와 같은 안전영역 규칙」 한 단락으로 바꾼다. 「하단 고정 요소」 주석의 대상 목록에서 공용 패널 「브라우저 전용 · 앱에서는 숨김(D-25a)」 표현과 「앱 전용: 네이티브 탭바가 하단을 차지 …」 단락을 걷고, 시트는 앱 · 브라우저 모두 safe-area 만 비킨다고 적는다. 알림 토스트 문장의 「탭바·홈 인디케이터」 → 「홈 인디케이터」.
- 사이드바 · 햄버거 블록(~L889-899) 주석의 「네이티브 탭바가 목적지를 가지므로」 를 「앱은 iPad 가로에서도 고정 사이드바 없이 헤더 햄버거 드로어가 유일한 이동 입구다(quick-261107-fbj 네이티브 탭바 제거 뒤에도 유지)」 취지로. 규칙 자체는 바꾸지 않는다.

② shared-panels.tsx — 더티 바 예약 `reserveBottom` 을 탭바 변수 없는 `${reserve ?? 0}px` 로. 머리 주석 ⑤-c 를 「안전영역 — 앱 · 브라우저 공통: 폰 밴드 패널 하단에 `--app-safe-bottom` 패딩(globals §21) · 앱 숨김은 quick-261107-fbj 로 걷었다(네이티브 탭바 제거) · 앱 페이지 끝은 globals 의 `main:has(spacer)` 규칙이 8px 로 맞춘다」 로 다시 쓴다(옛 「e2e G-21-R3-2 가 0px 단언」 문장 삭제). `shared-panels.test.tsx` 의 `reserveBottom` 헬퍼와 그 주석을 같은 식으로.

③ strategy-card.tsx — 숨은 프로브(슬롯 상수 · px 읽기 함수 · `usePinnedToViewportBottom` 첫머리의 프로브 선행 호출)를 지우고 `limit = window.innerHeight - inset` 으로 되돌린다. 근거 주석: 앱 하단을 차지하던 네이티브 탭바가 없어졌고(quick-261107-fbj), 폰 밴드에서는 inset(공용 패널 실측 높이)이 안전영역까지 포함한다. 같은 함수 doc 과 L1275 근처 주석의 「앱은 네이티브 탭바 위」 구절도 정리. `strategy-card.test.tsx` 의 「더티 바 탭바 비킴(G-21-R3-2)」 describe 를 위 behavior 두 케이스로 바꾼다(getComputedStyle 프로브 목 · 프로브 정리 afterEach 삭제 · `--wb-bottom-inset` 은 `document.documentElement.style.setProperty` 로 넣고 afterEach 에서 지운다).

④ overlay 즉시 필드 걷기(새 앱만 · U-5 「옛 빌드 호환 불필요」 — 네이티브는 Task 2 에서 더 이상 읽지 않는다): `native-overlay-marker.tsx` 의 prop 과 effect 인자, `native-bridge-provider.tsx` 의 `OverlayAcquireOptions` 타입 · `acquireOverlay(opts)` 인자(→ 인자 없음) · 0→1 송신을 언제나 `{ open: true }` 로, `post-native.ts` 의 overlay 페이로드 계약 · 문서에서 그 필드, `number-pad-sheet.tsx` 의 마커 prop 과 L21 · L469-470 주석(키패드 열림 = 오버레이 열림 신호만 · 당겨서 새로고침 끔 · back 이 닫음)을 걷는다. `native-overlay.test.tsx` — 케이스 6 기대를 `{open:true}` → `{open:false}` 로, 즉시/일반 마커 순서 케이스 8a · 8b · 8c 는 구분이 사라지므로 삭제(겹침 0↔1 은 케이스 2 가 이미 잠근다), 머리 주석 목록에서 「탭바가 …」 결과 서술을 「당겨서 새로고침 · back」 기준으로 고친다.

⑤ native-bridge-provider.tsx 나머지 — 주요 경로 프리페치는 **남긴다**(결정: 앱엔 늘 보이는 Link 가 없어 드로어를 열기 전까지 Next 프리페치가 없다 — 첫 이동 0.3~1.2s 대기를 막던 근거가 드로어 이동에도 그대로 · 푸시 착지 router.push 도 같은 이득). 상수 이름을 `NATIVE_PREFETCH_PATHS` 로 바꾸고 주석의 「네이티브 탭바 5탭 경로 — TabRoutes 와 같아야 한다」 를 「앱 주요 목적지 5곳(드로어 사이드바 첫 묶음과 같은 순서)」 으로. 4a route 효과 주석 「네이티브 탭바 활성 보강」 → 「네이티브 현재 경로 보강(Android 뒤로가기 판정 · iOS 는 기록만)」. 머리 주석 책임 3 의 「(탭바 숨김 · 당김 비활성)」 → 「(당김 비활성 · back 판정)」, 즉시 신호 줄 삭제. `native-bridge-provider.test.tsx` 의 테스트 12a 제목 · 지역 상수 이름과 머리 주석 2 · 9 · 10 의 탭바 결과 서술을 맞춘다(단언 값은 같은 5경로).

⑥ 주석 정리(동작 변화 없음) — 「탭바」 가 남는 웹 소스 줄은 사실이 아니게 됐다: `ui/sheet.tsx` · `ui/dialog.tsx` · `ui/popover.tsx` 의 NativeOverlayMarker 한 줄 주석 → 「(당겨서 새로고침 끔 · back)」, `layout/app-shell.tsx` L83 → 드로어가 앱 유일 이동 입구, `layout/app-sidebar.tsx` L43 · L56 · L180 · L196 → 「모바일 탭바」 대신 「앱 · 좁은 화면은 드로어」 로(L56 의 검색 허브 하위 「검색」 켜짐 근거는 「앱에서 주요 목적지 5곳 중 하나로 보이게」 식으로 사실만), `providers/theme-provider.tsx` L14 「상태바 · 탭바」 → 「상태바」, `stock/stock-detail-tabs.tsx` L227-229 CTA 주석의 앱 줄 → 「앱도 브라우저와 같은 식(quick-261107-fbj 탭바 제거)」, `lib/strategy-log-feed.tsx` ① 과 `trading/strategy-status-card.tsx` ⑧ 의 「앱은 /trading 하단 공용 패널을 숨기므로」 → 「처음엔 앱이 공용 패널을 숨겨서 생겼고, quick-261107-fbj 로 패널이 돌아온 뒤에도 /me 두 번째 입구로 유지」. 꼭 「탭바」 를 남겨야 하는 줄은 같은 줄에 quick-261107-fbj 를 적는다(`<verify>` 의 grep 규칙).

⑦ e2e(코드 수정) — `native-shell.spec.ts` 「safe-area · 탭바 여백」 describe 를 「safe-area (앱 = 브라우저 식 · quick-261107-fbj)」 로: 앱 390 홈 main 하단 '8px' · 같은 페이지에서 `--app-safe-bottom` 34px 주입 뒤 '42px', 앱 390 종목상세 CTA 바 bottom '0px' · 하단 '20px' · 예약 '96px' · main '8px' · CTA 버튼 아랫변 ≤ 844 − 20 · 34px 주입 뒤 CTA 하단 '34px' · 예약 '110px', 앱 1280 홈 main '8px', 기존 「앱 android 390 — 주입 top 41px 무시」 테스트에 `--safe-area-inset-bottom` 48px 주입 후 main '8px' 단언 추가(또는 종목상세 별도 케이스로 CTA 하단 '20px'). describe 위 수식 주석(gap · offset 82 · 98 · 76)을 새 식으로, 파일 머리 목록 1 · 2 · 3 · 4 · 5 의 탭바 결과 서술을 사실대로. `trading-workbench.spec.ts` — 「G-21-R3-2 앱 공용 패널 숨김」 테스트를 「앱 공용 패널 복원 — 앱 390 패널 · spacer 보임 · 화면 하단 · 안전영역 패딩 · 앱 1024 보임 · 브라우저 그대로 (quick-261107-fbj)」 로 바꾼다(제목에 「앱 공용 패널」 유지 — -g 필터용): 프로브 단언 삭제, 앱 390 = 보임 · data-pinned true · spacer 1 · 패널 아랫변과 viewport 높이 차 ≤ 1 · `--wb-bottom-inset` 이 0 이 아닌 px · `--app-safe-bottom` 34px 주입 뒤 패널 paddingBottom '34px' · main paddingBottom '8px', 앱 1024 = 보임. 「앱 키패드 시트」 테스트(D-12a'')는 제목 · 주석에서 즉시 필드를 빼고 열림 신호 기대를 `{ open: true }` 로.

⑧ 실행 — `<verify>` 뒤 e2e: `pnpm --filter @gh-radar/webapp exec playwright test native-shell --workers=1` 와 `pnpm --filter @gh-radar/webapp exec playwright test trading-workbench --workers=1 -g "앱 공용 패널|앱 키패드 시트"`(3100 점유 규칙). 커밋 예: 「feat(quick-261107-fbj): 앱 탭바 여백 걷기 · /trading 하단 공용 패널 복원」(필요하면 CSS/패널 · 브리지/주석 두 커밋으로).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest --run --maxWorkers=2 shared-panels.test strategy-card.test native-overlay.test native-bridge-provider.test post-native.test number-pad-sheet.test && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run lint && ! grep -rnE "native-tabbar|native-body-reserve|NATIVE_TAB_PATHS|NATIVE_TABBAR|nativeTabbarOffsetPx" webapp/src webapp/e2e && ! grep -rnw "immediate" webapp/src/lib/native webapp/src/components/trading/lc/number-pad-sheet.tsx && ! (grep -rn "탭바" webapp/src --exclude-dir=__tests__ | grep -v "quick-261107-fbj")</automated>
  </verify>
  <done>
    - vitest 6개 파일 · typecheck · lint 통과, 세 부정 grep 빈 결과(기준선: HEAD 에서 각각 8 · 5 · 15개 파일 결과 있음).
    - 앱 CSS: 탭바 변수 0 · 앱 공용 패널 숨김 규칙 0 · 앱 하단 고정 바 = 브라우저 식 · main 하단 = 8 + 안전영역(공용 패널 자리 있으면 8) · `--app-safe-bottom` = env() 만.
    - e2e native-shell · trading-workbench(앱 공용 패널 | 앱 키패드 시트) 통과, 또는 3100 점유로 미실행이면 SUMMARY 에 그 사실.
    - Task 3 커밋 1개 이상.
  </done>
</task>

</tasks>

<verification>
- Task 별 `<verify>` 전부 통과(또는 실행 불가 사유가 SUMMARY 에 명시).
- 교차 확인(마지막에 한 번): `! grep -rnE "GHTradeTabBar|GhTradeTabBar|native-tabbar|NATIVE_TAB_PATHS" mobile/ios/App/App mobile/android/app/src webapp/src webapp/e2e` · `git status -sb` 에 이 계획 밖 파일 변경이 섞이지 않았다.
- 변경 디렉터리 대조(배포 경로 체크리스트 메모리): webapp/ 변경 = git push(Vercel) 로 반영 · mobile/ 변경 = 앱 릴리스 필요 · server/ · relay/ · workers/ · packages/ 변경 0. 이 사실을 SUMMARY 「메인 세션 할 일」 에 적는다.
- 사용자 UAT(메인 세션 · 배포 뒤): ① /me 폰 · 데스크톱에서 종 → 시트/팝오버 · 이 기기 스위치 켜면 점 ② 설정 탭 = 상따 기본설정만 ③ 새 앱 빌드에 하단 탭바 없음 · 햄버거로 이동 · Android 뒤로가기 ④ 앱 /trading 하단 공용 패널 · 종목상세 CTA 가 홈 인디케이터 위에 붙어 섬.
</verification>

<success_criteria>
- /me: 탭 순서 현황 → 잔고 → 주문 → 손익 → 설정, 설정 탭 = 상따 기본설정만, 돌파 알림음은 울리지 않는다.
- 계정 카드 종(「매매 알림」): 켜짐이면 초록 점, 폰/앱 = 바텀 시트 · 데스크톱 = 팝오버, 안의 이 기기 스위치 · 다른 기기 목록이 기존대로 동작하고 문구가 U-4 와 같다.
- 새 iOS · Android 빌드에 하단 플로팅 탭바가 없고 당겨서 새로고침 · 오프라인 · 테마 · Android 뒤로가기가 그대로다.
- 앱 하단 고정 바 · 본문 · /trading 공용 패널이 브라우저와 같은 안전영역 규칙으로 화면 하단에 붙고, 앱 /trading 에서 미체결 · 잔고 · 전략 로그 패널이 다시 보인다.
</success_criteria>

<output>
Create `.planning/quick/261107-fbj-mypage-push-bell-remove-app-tabbar/261107-fbj-SUMMARY.md` when done — Task 별 커밋 해시 · 실행/미실행 검증(특히 iOS xcodebuild · Gradle · e2e) · 메인 세션 할 일(webapp = git push 로 배포 · mobile = `pnpm --filter @gh-radar/mobile run native:release` 로 iOS · Android 새 빌드 · server/relay 배포 없음) · 범위 밖 메모(Android 알림 채널 이름 「체결 알림」 은 packages/shared 상수라 그대로).
</output>
