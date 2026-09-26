---
phase: 21-gh-trade-mobile-app
round: 2
verified: 2026-09-26T14:30:33Z
status: passed
score: 15/15 must-haves verified
re_verification_of: 21-VERIFICATION.md
covered_range:
  plans: "21-17 .. 21-36"
  quick: ["260926-v5n", "260926-vk9"]
  code_range: "aba7954..88dcfae7 (webapp/ · mobile/) — 백엔드는 배포 이미지 relay:2fe94209 기준 diff 0"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "6/6 (human_verification 5건 대기)"
  gaps_closed:
    - "round-1 human_verification 5건(탭바 시각 · 기본 다크 · 테마 아이콘 · 인앱 브라우저 · 회귀) — 21-UAT.md UAT 2차~4차 테스트 1~13 · 27 · 29 · 30 pass"
    - "G-21-1 · G-21-N1 · G-21-N2 · G-21-N3 (21-17~21-22)"
    - "G-21-R3-1 ~ G-21-R3-11 (21-25~21-34 + quick 260926-v5n · 260926-vk9)"
    - "G-21-CR — 21-REVIEW.md 13건 전부 수정 (21-REVIEW-R2.md 13/13)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "R2-A1 — Android 브리지 폴백 채널(addJavascriptInterface)은 WEB_MESSAGE_LISTENER 미지원 구형 WebView 에서 하위 프레임 송신을 막지 못한다"
    category: security
    reason: "21-REVIEW-R2.md WR-03 근거 단락에서 수용된 잔여 위험(현재 iframe 없음 · API 36/최신 WebView 는 webmessage 채널). iframe 도입 시 재검토"
    evidence_status: "none provided (구형 WebView 재현 없음)"
  - finding: "R2-A2 — deferred-items.md 21-34 항목 3건 open(OrderbookLadder variant 'orderbook' 소비처 없음 · CardBody basePrice/upperLimit 미사용 프롭 · 옛 이름 주석)"
    category: other
    reason: "동작 영향 없음 · 정리 후보. MOBILE-01 능력과 무관"
    evidence_status: "none provided"
human_verification: []
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-17-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-17-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-18-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-18-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-19-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-19-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-20-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-20-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-21-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-21-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-22-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-22-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-23-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-23-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-24-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-24-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-25-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-25-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-26-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-26-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-27-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-27-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-28-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-28-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-29-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-29-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-30-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-30-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-31-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-31-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-32-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-32-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-33-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-33-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-34-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-34-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-35-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-35-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-36-PLAN.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-36-SUMMARY.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-CONTEXT.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-REVIEW-R2.md"
  - ".planning/phases/21-gh-trade-mobile-app/21-UAT.md"
  - ".planning/phases/21-gh-trade-mobile-app/deferred-items.md"
  - ".planning/quick/260926-v5n-ios-keyboard-tabbar-instant-hide-on-devi/260926-v5n-PLAN.md"
  - ".planning/quick/260926-v5n-ios-keyboard-tabbar-instant-hide-on-devi/260926-v5n-SUMMARY.md"
  - ".planning/quick/260926-vk9-numpad-sheet-tabbar-instant-hide/260926-vk9-PLAN.md"
  - ".planning/quick/260926-vk9-numpad-sheet-tabbar-instant-hide/260926-vk9-SUMMARY.md"
  - "mobile/README.md"
  - "mobile/android/app/build.gradle"
  - "mobile/android/app/src/main/AndroidManifest.xml"
  - "mobile/android/app/src/main/java/com/ghtrade/app/GhTradeBridge.kt"
  - "mobile/android/app/src/main/java/com/ghtrade/app/GhTradeWebViewClient.kt"
  - "mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt"
  - "mobile/android/app/src/main/res/xml/data_extraction_rules.xml"
  - "mobile/ios/App/App/GHTradeBridgeViewController.swift"
  - "mobile/ios/App/App/NavigationDelegateProxy.swift"
  - "mobile/scripts/smoke-android.sh"
  - "mobile/scripts/smoke-ios.sh"
  - "mobile/www/index.html"
  - "webapp/e2e/specs/auth-session.spec.ts"
  - "webapp/e2e/specs/discussion-filter.spec.ts"
  - "webapp/e2e/specs/discussions.spec.ts"
  - "webapp/e2e/specs/home.spec.ts"
  - "webapp/e2e/specs/me.spec.ts"
  - "webapp/e2e/specs/native-shell.spec.ts"
  - "webapp/e2e/specs/news.spec.ts"
  - "webapp/e2e/specs/search-page.spec.ts"
  - "webapp/e2e/specs/sidebar-tree.spec.ts"
  - "webapp/e2e/specs/stock-detail-tabs.spec.ts"
  - "webapp/e2e/specs/theme-default.spec.ts"
  - "webapp/e2e/specs/trading-workbench.spec.ts"
  - "webapp/src/app/auth/callback/route.ts"
  - "webapp/src/app/error.tsx"
  - "webapp/src/app/layout.tsx"
  - "webapp/src/app/login/__tests__/page.test.tsx"
  - "webapp/src/app/login/page.tsx"
  - "webapp/src/app/not-found.tsx"
  - "webapp/src/app/page.tsx"
  - "webapp/src/app/scanner/page.tsx"
  - "webapp/src/app/stocks/[code]/discussions/page.tsx"
  - "webapp/src/app/stocks/[code]/news/page.tsx"
  - "webapp/src/app/themes/page.tsx"
  - "webapp/src/app/watchlist/page.tsx"
  - "webapp/src/components/chat/__tests__/conversation-list.test.tsx"
  - "webapp/src/components/chat/conversation-list.tsx"
  - "webapp/src/components/home/__tests__/home-client.test.tsx"
  - "webapp/src/components/home/home-client.tsx"
  - "webapp/src/components/home/home-header.tsx"
  - "webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx"
  - "webapp/src/components/layout/__tests__/app-sidebar.test.tsx"
  - "webapp/src/components/layout/__tests__/page-header.test.tsx"
  - "webapp/src/components/layout/app-shell.tsx"
  - "webapp/src/components/layout/app-sidebar.tsx"
  - "webapp/src/components/layout/page-header.tsx"
  - "webapp/src/components/layout/page-layout.ts"
  - "webapp/src/components/providers/theme-provider.tsx"
  - "webapp/src/components/scanner/scanner-client.tsx"
  - "webapp/src/components/search/__tests__/search-page-client.test.tsx"
  - "webapp/src/components/search/search-page-client.tsx"
  - "webapp/src/components/stock/__tests__/discussion-full-list.test.tsx"
  - "webapp/src/components/stock/__tests__/stock-detail-client.test.tsx"
  - "webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx"
  - "webapp/src/components/stock/__tests__/stock-hero.test.tsx"
  - "webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx"
  - "webapp/src/components/stock/discussion-full-list.tsx"
  - "webapp/src/components/stock/news-full-list.tsx"
  - "webapp/src/components/stock/news-view.ts"
  - "webapp/src/components/stock/stock-detail-client.tsx"
  - "webapp/src/components/stock/stock-detail-tabs.tsx"
  - "webapp/src/components/stock/stock-discussion-section.tsx"
  - "webapp/src/components/stock/stock-hero.tsx"
  - "webapp/src/components/stock/stock-news-section.tsx"
  - "webapp/src/components/stock/stock-news-tab-panel.tsx"
  - "webapp/src/components/theme/__tests__/themes-client.test.tsx"
  - "webapp/src/components/theme/theme-rank-row.tsx"
  - "webapp/src/components/theme/themes-client.tsx"
  - "webapp/src/components/theme/themes-skeleton.tsx"
  - "webapp/src/components/trading/__tests__/breakout-strip.test.tsx"
  - "webapp/src/components/trading/__tests__/card-body.test.tsx"
  - "webapp/src/components/trading/__tests__/card-header.test.tsx"
  - "webapp/src/components/trading/__tests__/card-tabs.test.tsx"
  - "webapp/src/components/trading/__tests__/manual-order-form.test.tsx"
  - "webapp/src/components/trading/__tests__/me-client.test.tsx"
  - "webapp/src/components/trading/__tests__/stock-info-modal.test.tsx"
  - "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx"
  - "webapp/src/components/trading/__tests__/strategy-card.test.tsx"
  - "webapp/src/components/trading/__tests__/strategy-status-card.test.tsx"
  - "webapp/src/components/trading/__tests__/today-orders-card.test.tsx"
  - "webapp/src/components/trading/__tests__/trading-workbench.test.tsx"
  - "webapp/src/components/trading/card/card-body.tsx"
  - "webapp/src/components/trading/card/card-header.tsx"
  - "webapp/src/components/trading/card/card-tabs.tsx"
  - "webapp/src/components/trading/card/manual-order-form.tsx"
  - "webapp/src/components/trading/card/stock-info-modal.tsx"
  - "webapp/src/components/trading/card/strategy-card.tsx"
  - "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx"
  - "webapp/src/components/trading/lc/__tests__/number-pad-sheet.test.tsx"
  - "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx"
  - "webapp/src/components/trading/lc/number-pad-sheet.tsx"
  - "webapp/src/components/trading/lc/setting-group.tsx"
  - "webapp/src/components/trading/me-client.tsx"
  - "webapp/src/components/trading/strategy-status-card.tsx"
  - "webapp/src/components/trading/surface-placeholder.tsx"
  - "webapp/src/components/trading/today-orders-card.tsx"
  - "webapp/src/components/trading/workbench/breakout-strip.tsx"
  - "webapp/src/components/trading/workbench/shared-panels.tsx"
  - "webapp/src/components/trading/workbench/trading-workbench.tsx"
  - "webapp/src/components/ui/popover.tsx"
  - "webapp/src/components/watchlist/watchlist-client.tsx"
  - "webapp/src/hooks/use-debounced-search.ts"
  - "webapp/src/lib/__tests__/breakout-list.test.ts"
  - "webapp/src/lib/__tests__/numpad.test.ts"
  - "webapp/src/lib/__tests__/recent-search.test.ts"
  - "webapp/src/lib/__tests__/relay-socket.test.ts"
  - "webapp/src/lib/__tests__/safe-path.test.ts"
  - "webapp/src/lib/__tests__/strategy-log-feed.test.tsx"
  - "webapp/src/lib/__tests__/tab-scroll-memory.test.tsx"
  - "webapp/src/lib/__tests__/trading-alerts.test.ts"
  - "webapp/src/lib/__tests__/use-breakout-quotes.test.tsx"
  - "webapp/src/lib/__tests__/use-trading-alerts.test.tsx"
  - "webapp/src/lib/breakout-list.ts"
  - "webapp/src/lib/exchange-choices.ts"
  - "webapp/src/lib/native/__tests__/native-overlay.test.tsx"
  - "webapp/src/lib/native/native-bridge-provider.tsx"
  - "webapp/src/lib/native/native-overlay-marker.tsx"
  - "webapp/src/lib/native/post-native.ts"
  - "webapp/src/lib/numpad.ts"
  - "webapp/src/lib/recent-search.ts"
  - "webapp/src/lib/safe-path.ts"
  - "webapp/src/lib/strategy-log-feed.tsx"
  - "webapp/src/lib/tab-scroll-memory.ts"
  - "webapp/src/lib/trading-alerts.ts"
  - "webapp/src/lib/use-breakout-quotes.ts"
  - "webapp/src/lib/use-relay-socket.ts"
  - "webapp/src/lib/use-trading-alerts.ts"
  - "webapp/src/styles/globals.css"
covered_digest: "v1:sha256:22a4453657d061e62ad9951ba647f8753c3c4d727c50654465162f06e60ebed7"
---

# Phase 21: GH Trade 모바일 앱 (Capacitor) — 재검증 라운드 2

**Phase Goal:** webapp 을 Capacitor Remote-URL 셸(WebView 가 `https://trade.jx1.io` 로드)로 감싼 iOS·iPadOS·Android 앱 GH Trade — 네이티브 하단 플로팅 탭바(홈·검색·트레이딩·AI·마이) · pull-to-refresh(`window.__ghTrade.refresh()` → 없으면 reload) · 네이티브 Google Sign-In → Supabase `signInWithIdToken` · 브랜드명 GH Trade · 네이티브 프로젝트 `mobile/`.
**Verified:** 2026-09-26T14:30:33Z (HEAD `88dcfae7`)
**Status:** passed
**Re-verification:** Yes — 라운드 2 (1차 기록 `21-VERIFICATION.md` 는 수정하지 않음). 범위 = 갭 클로징 21-17 ~ 21-36 + quick 260926-v5n · 260926-vk9.

## 방법

SUMMARY 서술은 근거로 쓰지 않았다. 갭마다 PLAN must_haves 가 요구한 코드 지점을 `webapp/` · `mobile/ios` · `mobile/android` 에서 직접 grep/read 했다. 웹 쪽 핵심 표면은 대상 단위 테스트 12개 파일(393건)을 이 세션에서 직접 돌렸다. 기기 빌드 · e2e · 배포는 돌리지 않았다(지시 범위). 실기기 체감(시각 · 제스처 · 타이밍)의 사람 증거는 21-UAT.md UAT 4차(2026-09-26 운영: 웹 `dpl_HMnSS2ub` @ `6768bfd6` · relay:2fe94209 · iPhone 17 시뮬 · iPad Pro 11 시뮬 · Android 에뮬 · 실기기 iPhone 16)에서 테스트 1~30 전부 `result: pass` · issues 0 이다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| R2-T1 | (1차 T1 회귀) Remote-URL 셸이 운영 URL 을 로드하고 `mobile/` 패키지에 있다 | ✓ VERIFIED | `mobile/capacitor.config.ts:17` `CAP_SERVER_URL ?? 'https://trade.jx1.io'` · `:20` `appId: 'com.ghtrade.app'` · `:25` cleartext 는 http 일 때만. quick v5n/vk9 SUMMARY 의 산출물 3종 `{"url":"https://trade.jx1.io","cleartext":false}` · UAT 테스트 6 pass |
| R2-T2 | (1차 T2 회귀) 노출 브랜드 GH Trade · `gh-radar:` 키 유지 | ✓ VERIFIED | `webapp/src/app/layout.tsx:19` · `mobile/ios/App/App/Info.plist:10` · `strings.xml:3-4` · `webapp/src/lib/recent-search.ts:17` `gh-radar:recent-search` |
| R2-T3 | (1차 T3 + G-21-1) 네이티브 5탭 탭바, 라벨 없는 캡슐 C(높이 60) | ✓ VERIFIED | `TabRoutes.swift:11-20` 5케이스 → `/`·`/search`·`/trading`·`/chat`·`/me` · `GHTradeTabBar.swift` UILabel 0건 · `:65` radius 30 · `:162` 캡슐 radius 18 · `:186` accessibilityLabel · `GhTradeTabBar.kt` TextView 0건 · `:51` dpF(30f) · `:133` contentDescription. UAT 27 pass |
| R2-T4 | (1차 T4 회귀) pull-to-refresh → `__ghTrade.refresh()` 없으면 reload | ✓ VERIFIED | `GHTradeBridgeViewController.swift:297` · `MainActivity.kt:187` 같은 JS 문자열 · `native-bridge-provider.tsx:193` `w.__ghTrade = api`. IN-01: `MainActivity.kt:453` ready 에서 `pullBlocked = false`. UAT 5 · 30 pass |
| R2-T5 | (1차 T5 회귀) 네이티브 Google 로그인 → `signInWithIdToken`, next 가드 강화 | ✓ VERIFIED | `native-google-login.ts:116` · `login/page.tsx:64-68` `isNativeApp()` → `nativeGoogleSignIn` · `:50` `isSafeInternalPath`. `page.test.tsx` 11/11 · `safe-path.test.ts` 14/14 통과(이 세션). UAT 7 · 14 · 30 pass |
| R2-T6 | (1차 T6 회귀) G-21-N1 기본 다크 · G-21-N2 목적지 아이콘 · G-21-N3 인앱 브라우저 | ✓ VERIFIED | N1: `theme-provider.tsx:25` `defaultTheme="dark"` · `ThemeStore.swift:12` `?? .dark` · `ThemeStore.kt:16` `"dark"`. N2: `theme-toggle.tsx:22,28` export → `account-card.tsx:8-9,95-101` 재사용. N3: `NavigationDelegateProxy.swift:54,79,93` · `GhTradeWebViewClient.kt:28-35`. UAT 14 · 29 pass |
| R2-T7 | G-21-R3-1: 키보드 · 키패드 시트 열림에서 탭바 즉시 숨김(D-12a' · D-12a''), 재표시 90ms | ✓ VERIFIED | iOS `GHTradeBridgeViewController.swift:392-397` keyboardWillShow + 끝 프레임 판정 · `:437-445` `removeAllAnimations` + `performWithoutAnimation` · `:493` 0.09s 재표시 · `:167-169` overlay `immediate`. Android `MainActivity.kt:331-346` `WindowInsetsAnimationCompat` onPrepare → `keyboardRising()` · `:513-517` 즉시 경로 · `:554` 90ms. 웹 `number-pad-sheet.tsx:261` `<NativeOverlayMarker immediate />` · `native-bridge-provider.tsx:148`. `native-overlay.test.tsx` 14/14(immediate 페이로드 단언 `:163,167`). UAT 15 pass |
| R2-T8 | G-21-R3-4: 콜드 스타트·전체 문서 로드 중 탭바 숨김 → 첫 route 또는 1.5초 → 280ms | ✓ VERIFIED | iOS `:52` `awaitingContent = true`(초기 숨김 `:218-221`) · `NavigationDelegateProxy.swift:110-112` didStartProvisionalNavigation → `beginDocumentLoad()`(`:227-235` 1.5s) · `:516` 0.28 ease-out · `:415` 숨김 판정 포함. Android `:97` · `GhTradeWebViewClient.kt:42-44` onPageStarted → `onDocumentStart` · `:403` 1500L · `:568` 280L. UAT 14 pass |
| R2-T9 | G-21-R3-2 (D-25a): 앱에서 /trading 공용 패널 숨김 · 더티 바가 탭바 위 · /me 전 종목 전략 로그 | ✓ VERIFIED | `globals.css:697-699` `html.native-app [data-slot="shared-panels"], …spacer { display:none }` · `strategy-card.tsx:736-778` 프로브로 `--native-tabbar-offset` px 해석 후 limit 에서 차감 · `strategy-status-card.tsx:367,575` `useStrategyLogFeed()` → `<StrategyLog …>` (현황|로그 전환). `strategy-status-card.test.tsx` 21/21. UAT 26 pass |
| R2-T10 | G-21-R3-3 · R3-5 · R3-6: 만원 칩 천만/오천만/1억(더하기) · 제목 없는 그룹 pt-1 · 카드 ✕ 32/16/히트 44 | ✓ VERIFIED | `numpad.ts:91-95` add 1_000/5_000/10_000 · `setting-group.tsx:283` `spec.title ? 'pt-2.5' : 'pt-1'` · `card-header.tsx:284-292` aria-label `{name} 카드 닫기` · `size-8` · `after:-inset-1.5` · `XIcon size-4`. numpad 81 · setting-group 35 · card-header 27 통과. UAT 21 · 22 · 23 pass |
| R2-T11 | G-21-R3-7: 종목정보 팝업 고정 높이 · scrollbar-gutter · ✕ 20/32/44 · 폰 safe-area | ✓ VERIFIED | `stock-info-modal.tsx:161` `h-[min(720px,calc(100dvh-48px-var(--app-safe-top)-var(--app-safe-bottom)))]` · `:164` `pt-[calc(10px+var(--app-safe-top))]` · `:180-183` size-8 + after:-inset-1.5 + `XIcon size-5` · `:260` scrollbar-gutter. stock-info-modal 17/17. UAT 24 pass |
| R2-T12 | G-21-R3-8 (D-29): 뉴스·토론 전체보기가 탭 안/팝업 안 전체목록 · 뒤로가기 = 요약 · 옛 URL 리다이렉트 | ✓ VERIFIED | `news-full-list.tsx` · `discussion-full-list.tsx` 신설 · `stock-news-section.tsx:48,53` · `stock-discussion-section.tsx:54,277-278` `onShowAll` · `stock-news-tab-panel.tsx:29` `useNewsView` · `stock-info-modal.tsx:122,150-152` 로컬 `newsView` + onEscapeKeyDown · `app/stocks/[code]/news/page.tsx` · `discussions/page.tsx:23` redirect(`?tab=news&view=…`, CODE_RE 가드). UAT 17 · 25 pass |
| R2-T13 | G-21-R3-9 · R3-10 (D-30 · D-31): 「트레이딩」 CTA(폰 바 + 넓은 폭 알약, 매매 가능 종목만) → `/trading?code=` 카드 착지 · 종목상세 호가 탭 제거 · 카드 수동주문 주문유형 | ✓ VERIFIED | `stock-detail-tabs.tsx:162` `showOrderCta = tradable` · `:257-260` Link `/trading?code=` 「트레이딩」 · `:112-125` 옛 `?tab=orderbook` → replace · `stock-hero.tsx:96-102` 알약 · `stock-detail-client.tsx:152` `isPickable`. `trading-workbench.tsx:815-856` `?code=` 1회 소비 · 형식 가드 · `isPickable` · `ensureIsinCard(…, true)` · replaceState 로 code 제거. `stock-orderbook-section.tsx` · `relay-status-bar.tsx` · `orderbook-skeleton.tsx` 삭제 확인. `manual-order-form.tsx:10-13,115,132` 주문유형 + `affordanceOf`. trading-workbench 130/130(`:594` ?code= describe) · stock-detail-tabs 15/15. UAT 18 · 19 · 20 pass |
| R2-T14 | G-21-R3-11 (D-32 축소안): 탭 루트 스크롤 복원 · 스켈레톤 없이 직전 내용 → 조용한 갱신 · 재탭 = 맨 위 | ✓ VERIFIED | `lib/tab-scroll-memory.ts:18` TAB_ROOTS 5 · `:36-80` 기록/복원(검색 파라미터 착지 제외) · `app-shell.tsx:8,51` 배선 · `lib/query-cache` 소비처 search-page-client · conversation-list · today-orders-card. tab-scroll-memory 8/8. UAT 16 pass |
| R2-T15 | G-21-CR: 21-REVIEW.md 13건(WR-01~05 · IN-01~08) 전부 처리 | ✓ VERIFIED | 아래 「G-21-CR 코드 대조」 표 — 13/13 코드에서 확인. 21-REVIEW-R2.md `round1_fixed: 13`. UAT 28 pass |

**Score:** 15/15 truths verified (behavior-unverified 0 — 행동 의존 truth R2-T3 · T4 · T7 · T8 · T12 · T14 는 UAT 4차 운영 실기 pass 와 이 세션의 단위 테스트가 근거)

### 갭별 대조 (21-UAT.md `## Gaps`)

| 갭 | UAT status | resolved_by | 코드 확인 | UAT 재확인 |
|---|---|---|---|---|
| G-21-1 | resolved | 21-20 · 21-21 | ✓ R2-T3 | 27 pass |
| G-21-13 | resolved (코드 없음) | — | 해당 없음(사용자 재시험 pass) | 13 pass |
| G-21-N1 | resolved | 21-18 | ✓ R2-T6 | 14 pass |
| G-21-N2 | resolved | 21-19 | ✓ R2-T6 | 29 pass |
| G-21-N3 | resolved | 21-17 · 21-22 | ✓ R2-T6 | 29 pass |
| G-21-R3-1 | resolved | 21-28 · 21-29 + v5n · vk9 | ✓ R2-T7 | 15 pass |
| G-21-R3-2 | resolved | 21-32 (목업 21-25) | ✓ R2-T9 | 26 pass |
| G-21-R3-3 | resolved | 21-26 | ✓ R2-T10 | 21 pass |
| G-21-R3-4 | resolved | 21-28 · 21-29 | ✓ R2-T8 | 14 pass |
| G-21-R3-5 | resolved | 21-26 | ✓ R2-T10 | 22 pass |
| G-21-R3-6 | resolved | 21-26 | ✓ R2-T10 | 23 pass |
| G-21-R3-7 | resolved | 21-26 | ✓ R2-T11 | 24 pass |
| G-21-R3-8 | resolved | 21-30 · 21-33 | ✓ R2-T12 | 17 · 25 pass |
| G-21-R3-9 | resolved | 21-33 · 21-34 | ✓ R2-T13 | 18 · 19 pass |
| G-21-R3-10 | resolved | 21-33 · 21-34 | ✓ R2-T13 | 18 · 20 pass |
| G-21-R3-11 | resolved | 21-31 | ✓ R2-T14 | 16 pass |
| G-21-CR | resolved | 21-27 · 28 · 29 · 34 · 35 | ✓ R2-T15 | 28 pass |

### G-21-CR 코드 대조 (21-REVIEW.md 13건)

| ID | 코드 증거 (이 세션 grep) |
|---|---|
| WR-01 | `lib/safe-path.ts:11` 단일 정의 → `login/page.tsx:50` · `auth/callback/route.ts:34` · `native-bridge-provider.tsx:176` 공유 |
| WR-02 | `AndroidManifest.xml:6-8` `allowBackup="false"` · `fullBackupContent="false"` · `dataExtractionRules` · `res/xml/data_extraction_rules.xml` 존재 |
| WR-03 | Android `GhTradeBridge.kt:36-39` `addWebMessageListener(… setOf(origin))` + `isMainFrame` · `app/build.gradle:47` + `variables.gradle:11` webkit 1.14.0. iOS `GHTradeBridgeViewController.swift:132-145` `securityOrigin` 스킴·호스트·포트 비교 |
| WR-04 | `components/ui/popover.tsx:7,41` `NativeOverlayMarker` |
| WR-05 | `resultsQuery` — `use-debounced-search.ts` 4회 · `search-page-client.tsx` 5회. search-page-client 20/20 |
| IN-01 | `MainActivity.kt:453` ready 에서 `pullBlocked = false` |
| IN-02 | `mobile/www/index.html:95-98` PROD/DEV 출처 분리, `dev=1` 일 때만 localhost · `MainActivity.kt:256-260` · `GHTradeBridgeViewController.swift:341` |
| IN-03 | `MainActivity.kt:284` `isOfflinePage -> finish()` |
| IN-04 | `stock-detail-tabs.tsx` 에 `108` 0건, 주석은 98 |
| IN-05 | README 명령표 — 21-REVIEW-R2 증거 인용(이 세션 재확인 안 함, UAT 무관 문서 항목) |
| IN-06 | `layout.tsx:49` `themeColor: '#17171c'` · `theme-provider.tsx:46` `ThemeColorSync` |
| IN-07 | `recent-search.ts:20` `RECENT_CODE_RE` · `:33` 읽기 · `:81` 쓰기 |
| IN-08 | `smoke-ios.sh` `IOS_DEVICE_UDID` 4곳 · `smoke-android.sh` `ANDROID_SERIAL` 4곳 |

### Required Artifacts (이번 라운드 신규/핵심)

| Artifact | Status | Details |
|---|---|---|
| `webapp/src/lib/safe-path.ts` | ✓ VERIFIED | 3곳 import · 단위 14/14 |
| `webapp/src/lib/tab-scroll-memory.ts` | ✓ VERIFIED | AppShell 배선 · 단위 8/8 |
| `webapp/src/components/stock/news-full-list.tsx` · `discussion-full-list.tsx` | ✓ VERIFIED | 종목상세 탭 패널 · 트레이딩 팝업 두 곳에서 import |
| `webapp/src/components/stock/stock-news-tab-panel.tsx` (+ `news-view`) | ✓ VERIFIED | `?tab=news&view=` 상태 |
| `webapp/src/lib/strategy-log-feed.tsx` | ✓ VERIFIED | `/me` 전략 현황 카드에서 소비 |
| `mobile/android/app/src/main/res/xml/data_extraction_rules.xml` | ✓ VERIFIED | 매니페스트에서 참조 |
| 삭제 대상 `stock-orderbook-section.tsx` · `relay-status-bar.tsx` · `orderbook-skeleton.tsx` | ✓ 삭제됨 | 파일 없음 · 운영 코드 참조 없음 |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `NumberPadSheet` | 네이티브 즉시 숨김 | `<NativeOverlayMarker immediate />` → `postNative('overlay',{open,immediate})` → iOS `:167` / Android `:473` → `updateTabBarVisibility(immediate:)` | ✓ WIRED |
| iOS `NavigationDelegateProxy.didStartProvisionalNavigation` | `beginDocumentLoad()` | `owner?.beginDocumentLoad()` | ✓ WIRED |
| Android `GhTradeWebViewClient.onPageStarted` | `onDocumentStart()` | `host.onDocumentStart()` | ✓ WIRED |
| `StockHero` / `StockDetailTabs` 「트레이딩」 | `/trading?code=` 착지 | Link href → `trading-workbench.tsx:815` 소비 → `ensureIsinCard(…, true)` | ✓ WIRED |
| `AppShell` | 탭 루트 스크롤 복원 | `useTabRootScrollMemory()` | ✓ WIRED |
| `Popover` | 오버레이 계수 · Android 뒤로가기 | `NativeOverlayMarker` 자식 | ✓ WIRED |
| 옛 `/stocks/[code]/news` · `/discussions` | 탭 안 전체목록 | 서버 `redirect()` | ✓ WIRED |

### Behavioral Spot-Checks (이 세션 직접 실행)

| Behavior | Command | Result | Status |
|---|---|---|---|
| overlay immediate · safe-path · numpad · login next · 탭 스크롤 · /search 늦은 응답 | `npx vitest run` 6 파일 (native-overlay · numpad · login page · tab-scroll-memory · safe-path · search-page-client) | 148 passed | ✓ PASS |
| 종목상세 탭 · 종목정보 팝업 · 전략 현황 로그 · 작업대 ?code= · 카드 ✕ · 가격 섹션 여백 | `npx vitest run` 6 파일 (stock-detail-tabs · stock-info-modal · strategy-status-card · trading-workbench · card-header · setting-group) | 245 passed | ✓ PASS |
| 백엔드 무변경 (배포 이미지 기준) | `git diff --stat 2fe94209 HEAD -- relay/ server/ supabase/ workers/ packages/shared/` | 빈 출력 | ✓ PASS |

네이티브 빌드·스모크·JUnit·Playwright 는 지시에 따라 다시 돌리지 않았다. 21-35 · v5n · vk9 SUMMARY 의 게이트 기록(iOS/Android BUILD · SMOKE OK · TAB ROUTES OK 36 · EXTERNAL LINKS OK 32 · PROD CONFIG OK · webapp 2408 passed · Playwright native-shell 11 passed)과 UAT 4차 운영 실기 pass 를 보조 근거로 채택했다.

### Probe Execution

해당 없음 — 이 phase 는 `scripts/*/tests/probe-*.sh` 를 선언하지 않는다.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| MOBILE-01 | 21-01 ~ 21-36 (전 plan `requirements: [MOBILE-01]`) | ✓ SATISFIED | R2-T1 ~ R2-T15 + UAT 1~30 pass. `.planning/REQUIREMENTS.md:111` 체크박스 `- [ ]` · `:194` 추적표 `Pending` 은 의도된 상태 — 이 판정 뒤 오케스트레이터가 `[x]` · `Complete` 로 바꾸면 된다 |

고아 요구사항 없음 — REQUIREMENTS.md 에서 Phase 21 에 매핑된 ID 는 MOBILE-01 하나다.

### Anti-Patterns Found

`aba7954..HEAD` 에서 바뀐 `webapp/` · `mobile/` 운영 파일(테스트·e2e·pbxproj·이미지 제외) 전체에 `TBD|FIXME|XXX` · `TODO|HACK|PLACEHOLDER` 검색 → **0건**. 차단 부채 표시 없음.

### 정보 · 참고 (갭 아님)

- **R2-I1 — D-12a 원안 대체.** 21-28/21-29 must_have 는 「키보드 애니메이션 절반 길이 페이드」였으나 quick 260926-v5n 이 D-12a'(애니메이션 없이 즉시)로 대체했다. `21-CONTEXT.md` 에 D-12a' · D-12a'' 가 기록돼 있고 코드는 새 결정을 따른다. 사용자 요청(「더 빨리」)의 강화 방향이라 의도된 편차다.
- **R2-I2 — iPad 네이티브 빌드 세대.** UAT 4차에서 iPad Pro 11 시뮬은 21-36 빌드(v5n · vk9 네이티브 즉시 경로 없음)였다. iOS 는 유니버설 단일 바이너리라 같은 코드가 iPhone 17 시뮬 · 실기기 iPhone 16 에서 확인됐다. iPad 에 다음 운영 빌드를 설치하면 같은 경로를 탄다. 새 사람 확인 항목으로 올리지 않는다(같은 코드 경로를 UAT 15 가 이미 확인함).
- **R2-I3 — 범위 안 백엔드 커밋.** `aba7954..HEAD` 에 relay/packages/shared 를 건드린 다른 세션 커밋 2건(`e9e4c786` · `89f5680d`, quick-260926-rcc)이 있다. 둘 다 배포 이미지 relay:2fe94209 에 들어 있고 `2fe94209..HEAD` 백엔드 diff 는 0 이다(이 세션 확인). Phase 21 산출물이 아니다.
- **R2-A1 · R2-A2** — frontmatter `advisory` 참조(WR-03 폴백 채널 잔여 위험 수용 · deferred-items 정리 후보). 차단 아님.

### 사용자 결정 기록 (갭 아님)

- 2026-09-26 사용자가 이 phase 에 대해 `/gsd-secure-phase 21` · `/gsd-validate-phase 21`(Nyquist) · `/gsd-ui-review 21` 을 **생략하기로 명시 결정**했다. 이 검증은 그 게이트들을 대신하지 않는다 — 「미실행(사용자 결정)」으로 기록한다.
- 스토어 제출 · 서명 · TestFlight · Play 배포는 `21-CONTEXT.md:13,95,182` 대로 범위 밖이다. 별도 phase 로 다룬다.

### Human Verification Required

없음(이번 라운드 신규 항목 0). round-1 의 human_verification 5건과 UAT 3차 갭 재확인은 모두 21-UAT.md UAT 2차~4차에서 사람이 운영 환경으로 확인했다 — 테스트 1~30 `result: pass`, issues 0 (2026-09-26, 웹 `dpl_HMnSS2ub` @ `6768bfd6` · relay:2fe94209 · iPhone 17 시뮬 · iPad Pro 11 시뮬 · Android emulator-5554 · 실기기 iPhone 16).

### Gaps Summary

실제 갭 없음. 21-UAT.md 의 갭 17건(G-21-1 · G-21-13 · G-21-N1~N3 · G-21-R3-1~11 · G-21-CR)이 모두 `status: resolved` 이고, 코드가 필요한 16건은 PLAN must_haves 가 가리킨 지점에 실제로 구현·배선돼 있다. round-1 truth 6개도 회귀 없이 유지된다. 행동 의존 항목은 이 세션의 단위 테스트 393건과 UAT 4차 운영 실기 pass 로 뒷받침된다. MOBILE-01 은 충족이다.

---

_Verified: 2026-09-26T14:30:33Z_
_Verifier: Claude (gsd-verifier) — round 2_
