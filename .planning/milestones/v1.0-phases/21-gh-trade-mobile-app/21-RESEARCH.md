# Phase 21: GH Trade 모바일 앱 (Capacitor) - Research

**Researched:** 2026-09-25
**Domain:** Capacitor 8 Remote-URL 하이브리드 셸(iOS Swift · Android Kotlin 네이티브 셸) + Next.js 15 웹 쪽 앱 분기 + 네이티브 Google Sign-In → Supabase `signInWithIdToken`
**Confidence:** HIGH (Capacitor 8.5.2 · 8.2.0 소스, weekly-wine 소스, webapp 소스를 이번 세션에 직접 Read) / MEDIUM (Google·Supabase 콘솔 절차, Android 구버전 WebView 동작) / LOW 항목은 Assumptions Log 에 모았다

> **이 문서의 가장 중요한 발견 7가지** (플래너가 먼저 읽을 것)
> 1. **Xcode 27(iOS 27 SDK)은 UIScene 수명주기가 없으면 앱이 실행되지 않는다.** weekly-wine(Capacitor 8.2 템플릿)의 `AppDelegate`/`Info.plist` 를 복사하면 실행 즉시 죽는다. Capacitor **8.5.2** 템플릿은 `SceneDelegate.swift` 를 포함하며, 루트 VC 를 **코드로** `CAPBridgeViewController()` 로 만든다 — storyboard `customClass` 만 바꾸면 서브클래스가 **적용되지 않는다**. `SceneDelegate` 의 그 한 줄을 서브클래스로 바꿔야 한다.
> 2. **`server.errorPath` 는 쓰지 않는다.** iOS 는 `NSURLErrorCancelled(-999)`(탭 연타·리다이렉트)까지 오류 페이지로 보내고, Android 는 **메인 프레임 HTTP 4xx/5xx**(Next.js 404 페이지 포함)에도 오류 페이지를 띄운다. 오프라인 폴백은 네트워크 오류 코드만 걸러 **직접** 로드한다. weekly-wine 의 `www/index.html` 은 **연결돼 있지 않은 죽은 코드**다.
> 3. **Android 에서 `webView.webViewClient = object : WebViewClient()` 로 교체하면 안 된다**(weekly-wine 방식). `BridgeWebViewClient` 를 상속해 `bridge.setWebViewClient(...)` 로 끼운다 — 그래야 로컬 에셋 서버(`shouldInterceptRequest`)·구형 WebView 브리지 주입·`WebViewListener` 가 산다.
> 4. **Android 16(API 36 타깃)에서는 `onBackPressed()` 가 호출되지 않는다.** weekly-wine 의 뒤로가기 정책은 Android 16 기기에서 죽는다. `onBackPressedDispatcher.addCallback` 으로 구현한다.
> 5. **iOS 의 Google 재로그인은 옛 id_token 을 돌려준다.** `@capgo/capacitor-social-login` iOS 는 이전 로그인이 있으면 `restorePreviousSignIn` 으로 **새 nonce 없는** 토큰을 반환한다 → Supabase 가 nonce 불일치로 거절. 로그인 옵션에 `forcePrompt: true` 필수.
> 6. **네이티브 탭바가 웹의 하단 고정 바를 가린다.** CONTEXT D-25 목록(5곳)에 없는 **종목상세 「주문하기」 CTA 바**(`stock-detail-tabs.tsx:219`)와 **/trading 폰 하단 패널**(`shared-panels.tsx:248`)이 탭바 아래에 깔린다. 앱에서는 하단 고정 요소 전부를 탭바 높이만큼 들어 올리는 공통 CSS 변수가 필요하다.
> 7. **Capacitor 8.5.2 의 코어 `SystemBars` 플러그인이 Android 인셋을 이미 처리한다**(DecorView 에 리스너 · `--safe-area-inset-*` CSS 변수 주입 · 키보드(IME) 패딩). 우리 코드는 DecorView 에 리스너를 **걸지 않고**, 웹 CSS 는 `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))` 를 쓴다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 아키텍처 (사전 확정 · 2026-09-25 사용자 4건)
- **D-01:** **Remote-URL 셸.** `capacitor.config.ts` `server.url = https://trade.jx1.io`, `webDir` 에는 오프라인 폴백 `index.html` 만. static export · 로컬 번들 없음. — **Reversibility:** costly — 번들 방식으로 바꾸려면 middleware·callback·redirect 를 클라이언트로 옮기는 웹 개편이 필요.
- **D-02:** **하단 플로팅 탭바는 네이티브**(iOS Swift `CAPBridgeViewController` 서브클래스 · Android Kotlin `BridgeActivity` 서브클래스). 웹에 탭바 컴포넌트를 만들지 않는다. weekly-wine 의 알약형 구조(좌우 16 · 높이 70 · radius 32 · 블러 배경 · 하단 페이드)를 출발점으로 삼되 색·모양은 **목업 검토(D-27)** 로 확정한다.
- **D-03:** **로그인 = 네이티브 Google Sign-In → Supabase `signInWithIdToken`.** Google 이 WebView OAuth 를 차단(`disallowed_userAgent`)하므로 앱에서는 `/login` 이 Capacitor 를 감지하면 기존 `signInWithOAuth` 대신 네이티브 플러그인(후보 `@capgo/capacitor-social-login`)으로 id_token 을 받아 `supabase.auth.signInWithIdToken({provider:'google', token, nonce})` 로 세션을 만든다. 세션은 브라우저 클라이언트가 만들므로 쿠키/`onAuthStateChange` 경로가 그대로 이어진다. UA 위장 방식은 채택하지 않는다. — **Reversibility:** costly — GCP OAuth 클라이언트(iOS·Android 2개)와 Supabase Google provider 「Authorized Client IDs」 등록이 선행 조건(사용자 콘솔 작업 · 계획에 사전 태스크로 명시).
- **D-04:** **pull-to-refresh = 네이티브 제스처 → 웹 훅.** iOS `UIRefreshControl` · Android `SwipeRefreshLayout` 이 제스처를 받아 `window.__ghTrade?.refresh?.()` 를 evaluate 한다. 페이지가 훅을 등록했으면 그 훅, 아니면 `location.reload()`. 웹은 전역 refresh 레지스트리(context) 하나로 페이지별 `refresh` 를 등록/해제한다(홈 `useHomeQuery.refresh` · 스캐너 `usePolling.refresh` · 테마 · 관심종목 · 종목상세 · `/search`).
- **D-05:** 네이티브 프로젝트는 **모노레포 `mobile/` 패키지**(`@gh-radar/mobile`, pnpm workspace 등록). `ios/` · `android/` · `capacitor.config.ts` · `resources/`(아이콘 원본) · `www/index.html`(오프라인 폴백) 이 여기 산다. Vercel ignore 스크립트(`scripts/vercel-ignore-build.sh`)는 `webapp/`·`packages/shared/`·lockfile 만 보므로 `mobile/` 변경은 웹 배포를 유발하지 않는다(lockfile 이 바뀌면 빌드는 되지만 무해).

#### 탭 목적지와 앱 안 웹 셸
- **D-06:** 탭 5개 = **홈 `/` · 검색 `/search` · 트레이딩 `/trading` · AI `/chat` · 마이 `/me`.** 탭 탭(tap) = WebView 에 해당 경로 로드(같은 탭 재탭 = 그 경로로 다시 이동, 스크롤 최상단).
- **D-07:** **전용 `/search` 페이지 신설.** 상단 검색 입력(기존 `useDebouncedSearch` + GlobalSearch 결과 리스트 재사용, 선택 시 `/stocks/{code}`) + 아래에 **상승률 상위 `/scanner` · 테마 `/themes` · 관심종목 `/watchlist` 진입 카드**. 사이드바 「종목검색」 그룹의 3항목이 이 탭 하나로 이식된다. 웹 사이드바에도 「검색」 링크를 추가하되 기존 3항목은 유지(사이드바 재편은 범위 밖).
- **D-08:** **`/me` 상단에 계정 카드 추가 — 웹·앱 공통.** 아바타(Google `avatar_url` → 이니셜 폴백, `UserSection` 규칙 재사용) · 이름 · 이메일 · **테마 토글** · **로그아웃** 버튼. 그 아래 기존 MeClient(상태줄 → 전략 현황 → 계좌별 미체결·잔고). 사이드바 하단 `UserSection`/`ThemeToggle` 은 그대로 둔다.
- **D-09:** **앱에서도 헤더 햄버거 + 사이드바 드로어 유지**(웹과 동일). 단 **앱에서는 폭과 무관하게 고정 사이드바(`lg:block aside`)를 항상 숨기고** 드로어로만 연다 — iPad 가로에서 사이드바와 탭바가 같은 목적지를 두 곳에 두지 않기 위해. 햄버거는 앱에서 `lg` 이상에서도 표시.
- **D-10:** **AI 탭 = `/chat` 이동.** 앱에서는 **`ChatFab`(종목상세 우하단 플로팅) 숨김.** 종목 컨텍스트 대화는 종목상세 안 버튼(헤더 액션 줄에 「AI 분석」 → 기존 `ChatSheet` 열기)으로 연다. 웹은 FAB 그대로.
- **D-11:** **Capacitor 감지 = `window.Capacitor?.isNativePlatform?.()`** (Remote-URL 모드에서도 Capacitor 가 native-bridge 를 원격 페이지에 주입한다). 감지 시 `<html>` 에 `native-app` 클래스 + `data-native-platform="ios|android"` 를 붙이고, CSS/컴포넌트 분기는 이 클래스만 본다. weekly-wine 은 자체 `bridge.js` 가 원격 페이지에서 실행되지 않았음이 탐색에서 확인됐다 — **웹 코드가 스스로 감지**하는 이 방식을 쓴다(네이티브 주입 스크립트 의존 금지).

#### 탭바 표시 규칙
- **D-12:** **숨김 = ① URL 이 `/login`·`/auth/*` ② 오프라인 폴백 화면 ③ 웹이 「오버레이 열림」 신호를 보낸 동안.** 오버레이 = 트레이딩 바텀시트·키패드 시트(Phase 20 `NumberPadSheet` 류) · shadcn `Sheet`(사이드바 드로어 · 모바일 하단 패널) · `Dialog`(주문 확인). 웹은 열림/닫힘을 네이티브에 메시지(`overlay: true|false`)로 보내고 네이티브는 150ms 지연 후 0.2s 페이드(weekly-wine `filterState` 방식). 채널: iOS `webkit.messageHandlers.ghTrade.postMessage` · Android `window.GhTradeBridge` (`addJavascriptInterface`). 웹은 두 채널을 감싼 `postNative(type, payload)` 하나만 쓴다.
- **D-13:** **탭바는 폭·기기와 무관하게 항상 표시**(iPad 가로 포함). 사이드바는 D-09 로 앱에서 항상 숨기므로 중복 내비가 없다.
- **D-14:** **활성 탭 = URL 경로 정확 매칭만.** 홈 `/` · 검색 `/search`,`/scanner`,`/themes`,`/watchlist` · 트레이딩 `/trading`(쿼리 무시) · AI `/chat` · 마이 `/me`. **그 외(종목상세 `/stocks/*` · 테마상세 `/themes/*` · 종목 뉴스/토론 하위 등)는 5탭 전부 비활성**(weekly-wine 방식). 판정은 iOS `webView.observe(\.url)` KVO · Android `onPageFinished`+`doUpdateVisitedHistory`(SPA `pushState` 도 잡히도록 웹이 `route` 메시지를 추가로 보낸다 — Next.js 클라 내비는 페이지 로드 이벤트를 내지 않는다).
- **D-15:** **아이콘 = 각 OS 기본** — iOS SF Symbols(`house`/`house.fill` · `magnifyingglass` · `chart.line.uptrend.xyaxis`/`.fill` 계열 · `sparkles` · `person.crop.circle`/`.fill`) · Android Material Icons(outlined ↔ filled). 활성 = filled 변형 + 강조색. 웹 lucide 와 다른 것을 허용.

#### 새로고침 세부
- **D-16:** **`/trading` · `/me` 의 refresh 훅 = relay 재탐침 + 스냅샷 재요청.** `use-relay-socket` 의 resume probe(`RELAY_RESUME_PROBE_MS` 경로)를 강제 실행 — 소켓이 죽었으면 재연결, 살아 있으면 전략·잔고·미체결 스냅샷 재요청. 편집 중 상태(수동주문 입력)는 유지. `RelayProvider` 가 `probeNow()` 류 메서드를 노출한다.
- **D-17:** **스피너는 고정 1초 후 종료**(weekly-wine 방식). 훅의 Promise 완료 시점과 무관. reload 폴백도 같다.
- **D-18:** **종목상세 refresh = 시세·차트·통계 캐시 재조회만.** 뉴스·토론 섹션은 서버 캐시 재읽기(`GET`)만 하고 **외부 API 호출을 유발하는 경로(`POST /news/refresh`)는 부르지 않는다** — Naver 예산 · 크롤링 5원칙 · 「사용자 수에 비례하는 외부 호출 금지」 준수. 뉴스 수동 새로고침은 기존 버튼만.
- **D-19:** **오프라인 = 앱 내장 폴백 화면 + 자동 복구.** `mobile/www/index.html`: GH Trade 워드마크 · 「인터넷 연결을 확인해주세요 · 복구되면 자동으로 이동합니다」 · 「다시 시도」 버튼 · `online` 이벤트 + 5초 폴링으로 `server.url` 복귀(weekly-wine `www/index.html` 이식). 탭바 숨김(D-12 ②). 첫 로드 실패(`didFailProvisionalNavigation` / `onReceivedError` 메인프레임)에 이 페이지를 띄운다.

#### 앱 정체성·시스템 연동
- **D-20:** **appId = `com.ghtrade.app`** (iOS 번들 ID = Android `applicationId`), **표시명 = `GH Trade`**(`appName` · `CFBundleDisplayName` · `strings.xml app_name`). — **Reversibility:** one-way — 스토어 게시 후 번들 ID 변경 불가.
- **D-21:** **브랜드명 변경은 노출 문자열만.** `layout.tsx` metadata title → `GH Trade`, 헤더 로고 텍스트 · `aria-label` · 로그인 카드 제목 「GH Trade에 로그인」 · `/design` 카탈로그 2곳. **`gh-radar:` 접두 localStorage 키 · `[gh-radar]` 콘솔 접두 · 패키지명 `@gh-radar/*` · 저장소명은 바꾸지 않는다**(저장된 사용자 설정 유실 방지). 테스트 픽스처의 `e2e@gh-radar.local` 도 유지.
- **D-22:** **아이콘·스플래시는 Claude 가 새로 그린다** — 레이더 모티프(현 `icon.svg` 동심원+스윕) 계승 + 「GH Trade」 워드마크, 바탕은 토스 다크 `#17171c`. 1024 아이콘 · 2732 스플래시(라이트 `#ffffff` / 다크 `#17171c`) SVG→PNG 를 `mobile/resources/` 에 두고 `@capacitor/assets generate` 로 양 플랫폼 배포. **시안 2개를 탭바 목업과 함께 제시해 사용자가 선택**(D-27). 웹 파비콘(`icon.svg`)도 같은 시안으로 교체.
- **D-23:** **테마 = 웹 토글을 네이티브가 따라간다.** 웹은 `next-themes` 해석 결과(`dark|light`)를 마운트 시와 변경 시 `postNative('theme', …)` 로 보낸다. 네이티브는 상태바 스타일(light/dark content) · WebView/뷰 배경색(라이트 `#ffffff` · 다크 `#17171c` = Phase 20 B 테마 `--bg`) · 탭바 팔레트를 전환하고 **마지막 값을 저장**(UserDefaults/SharedPreferences)해 다음 실행 첫 프레임부터 적용(깜빡임 방지). 앱은 OS 다크모드 설정을 보지 않는다(웹 `enableSystem=false` 와 일치).
- **D-24:** **회전: 폰 세로 고정, iPad 전방향.** iOS `UISupportedInterfaceOrientations` = Portrait only, `~ipad` = 4방향, `UIRequiresFullScreen` 없음(Split View 허용), `TARGETED_DEVICE_FAMILY = 1,2`. Android `screenOrientation`: 폰 `portrait`, 태블릿(sw600dp) `fullSensor` — 리소스 한정자(`values-sw600dp`)로 분기.
- **D-25:** **safe-area 는 웹이 책임진다.** `viewport-fit=cover` 추가(`viewport` export), 헤더 `padding-top: env(safe-area-inset-top)`, 하단 고정 요소 5곳(`dirty-action-bar` · `shared-panels` 모바일 하단 시트 · `chat-fab` · `alert-toasts` · `ui/sheet` bottom)에 `env(safe-area-inset-bottom)`. **앱에서는 본문 하단에 탭바 높이+여백(≈ 70 + 14 + inset)만큼 `padding-bottom`** 을 `html.native-app` 에서 준다(weekly-wine 은 카페24 CSS `padding-bottom:100px` 가 담당). WebView 는 `contentInsetAdjustmentBehavior = .never` + 상태바 아래부터 frame(weekly-wine 방식) 대신 **풀블리드 + 웹 safe-area** 로 간다 — 헤더 블러가 상태바 뒤까지 이어지는 토스식 표현.
- **D-26:** **Android 뒤로가기** = WebView `canGoBack` 이면 `goBack`, 아니면 홈 탭이 아닐 때 홈으로, 홈이면 앱 종료(weekly-wine 정책 이식). 오버레이 열림 상태면 웹에 `back` 메시지를 먼저 보내 시트를 닫게 한다.

#### 목업 게이트 (필수 · 구현 전)
- **D-27:** **탭바 모양과 아이콘 시안은 HTML 목업으로 확인받은 뒤 구현한다**(사용자 규칙: UI 는 목업 먼저 · 검토 게이트 전 커밋 금지). 스케치 `004-native-tab-bar`: 변형 2~3(알약형 weekly-wine 계승 / 풀폭 토스식 / 절충) × 다크·라이트 × 폰 390·iPad 세로 820, 홈·트레이딩·종목상세(비활성) 화면 위에 오버레이. 아이콘 시안 2개 동봉. 채택안은 CONTEXT 에 D-27a 로 추기하고 네이티브 상수(색·크기·radius)의 정본으로 삼는다.
- **D-27a (2026-09-25 목업 검토 확정 · 스케치 004):** **탭바 = A 알약**, **아이콘 = A 다크 레이더**. 네이티브 상수 정본: 좌우 여백 16 · 높이 70 · radius 32 · 배경 `--card` 82% + 블러 18 · 그림자 `0 2px 16px rgba(0,0,0,.18)` + 1px `--line` inset · 바닥 = safe-area inset + 14 · 탭바 상단부터 150 하단 페이드(`--bg` 92%) · 활성 = `--primary` 14% 원 46 + filled 아이콘 + primary 라벨 10px · 비활성 `--muted-fg` · iPad 폭 560 가운데 · 웹 본문 하단 여백 136(폰)/130(iPad). 색은 `toss-dark.css`/`toss-light.css` 토큰 값을 hex 로 옮긴다(다크 card `#202027` · bg `#17171c` · primary `#3485fa` · muted `#9e9ea4` · line rgba(255,255,255,.07) / 라이트 card `#ffffff` · bg `#ffffff` · primary `#3182f6` · muted `#6b7684` · line `#e5e8eb`). 아이콘 원본 = `.planning/sketches/004-native-tab-bar/index.html` 의 `#app-a` symbol(1024) — `mobile/resources/icon.svg` 로 추출해 PNG 렌더. 스플래시 = 바탕(라이트 `#ffffff`/다크 `#17171c`) + 아이콘 96 + 「GH Trade」 워드마크.

### Claude's Discretion
- 탭바의 SwiftUI vs UIKit · Compose vs View 선택(weekly-wine 은 UIKit/View — 이식 비용 최소를 우선).
- 웹↔네이티브 메시지 스키마 세부(`postNative` 타입 목록 · JSON 형태), 웹 refresh 레지스트리 API 이름(`useNativeRefresh(fn)` 류).
- Android 내부 스크롤 영역(호가 사다리·시트)에서 당기기 오동작 방지 방식(weekly-wine `onInnerScroll` 캡처 방식 또는 `overscroll-behavior`).
- 로그인 화면 앱 분기의 문구·버튼 모양(기존 「Google로 로그인」 버튼 유지, 핸들러만 교체 권장) · 세션 만료 시 재로그인 흐름(기존 `session_expired` 경로 재사용).
- `@capgo/capacitor-social-login` vs `@codetrix-studio/capacitor-google-auth` 최종 선택(Capacitor 8 호환 · nonce 지원 기준으로 리서치가 판단).
- Capacitor 버전(8.x 최신) · iOS 최소 15 · Android minSdk 24 (weekly-wine 과 동일 출발).
- 개발 편의: `server.url` 을 로컬(`http://<LAN IP>:3100`, `cleartext: true`)로 바꾸는 dev 설정 분리 방식(`capacitor.config.dev.ts` 또는 env).
- Cloud/Vercel 쪽 변경 없음. 스토어 서명·fastlane 은 범위 밖(Xcode/Android Studio 로컬 빌드·실기기 설치까지가 이 phase 의 검증).

### Deferred Ideas (OUT OF SCOPE)
- **푸시 알림**(상한가 근접·관심종목 급등 — v2 NOTF-01/02). weekly-wine 의 `@capacitor/push-notifications` 골격은 참고만.
- **딥링크 / 유니버설 링크**(`trade.jx1.io/stocks/…` → 앱) — 스토어 배포 뒤 별도 phase.
- **스토어 제출 · fastlane · 서명 자동화** — 이 phase 는 로컬 빌드·실기기 설치까지.
- **사이드바 IA 재편**(「종목검색」 그룹을 `/search` 로 완전 대체) — 이번엔 링크 추가만.
- **AI 탭이 종목 컨텍스트 이어받기**(`/chat?code=`) — D-10 대안으로 기각, 필요 시 재논의.
- **웹(브라우저 모바일)에도 하단 탭바** — 네이티브 전용으로 확정, 웹 탭바는 별도 논의.
</user_constraints>

<phase_requirements>
## Phase Requirements

요구사항 ID 가 아직 없다. 플래너가 `REQUIREMENTS.md` 에 **MOBILE-01** 을 추가하고(`PROJECT.md` Out of Scope 「모바일 앱 — 웹 우선」 과 `REQUIREMENTS.md:131` 「모바일 앱 | 웹 우선, 반응형으로 대응」 행을 정정) 아래처럼 쪼개 매핑하기를 권한다.

| ID (제안) | Description | Research Support |
|----|-------------|------------------|
| MOBILE-01 | GH Trade iOS·iPadOS·Android 앱 — Capacitor Remote-URL 셸(`com.ghtrade.app`) + 네이티브 탭바·당겨서 새로고침·네이티브 Google 로그인·오프라인 폴백·테마 연동, 웹의 앱 분기·`/search`·`/me` 계정 카드·브랜드명 GH Trade | 아래 전 섹션. 하위 인수조건은 §Validation Architecture 의 Req→Test 표 (MOBILE-01a~k) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| 출처 | 지시 | 이 phase 에 미치는 영향 |
|------|------|--------------------------|
| CLAUDE.md §Naver Search API · 공식 API 운영 기준 3 | 사용자 트리거로 O(N) 외부 호출 금지(예외: 기존 스로틀된 수동 새로고침) | **D-18**: 종목상세 당겨서 새로고침이 `POST /api/stocks/:code/news/refresh` 를 부르면 위반. refresh 훅은 `GET` 캐시 재조회만 |
| CLAUDE.md 크롤링 5원칙 3 | 사용자 클릭 시 on-demand fetch 금지 | 토론방 섹션 refresh 도 서버 캐시 `GET` 만 |
| CLAUDE.md Conventions | 상따 화면 반응형은 뷰포트가 아니라 본문 폭 컨테이너 쿼리(§2.2b 정본 = `globals.css`). 앱 셸·사이드바는 뷰포트 브레이크포인트 | `html.native-app` 분기는 **셸 층**(사이드바·햄버거·FAB·하단 여백)에만. `/trading` 안쪽 컨테이너 쿼리 밴드에 앱 분기를 넣지 않는다. 좌우 safe-area 패딩을 `main` 에 넣으면 컨테이너 폭이 줄어 밴드 경계가 움직인다(Pitfall 14) |
| CLAUDE.md Constraints | 배포 = 프론트 Vercel, 백엔드 Cloud Run | 앱은 Vercel 운영 URL 을 로드할 뿐 인프라 변경 없음. CORS 변경 불필요(WebView origin = `https://trade.jx1.io`) |
| 사용자 전역 CLAUDE.md | 커밋 메시지 한글 · 커밋 전 메시지 확인 · push 까지 · Co-Authored-By 금지 | 실행 단계 규칙. 이 저장소에서 `git push` = webapp 프로덕션 배포(STATE.md 교훈) |
| MEMORY: UI 는 HTML 목업 먼저 · 목업 검토 게이트 후 커밋 | D-27 게이트는 이미 통과(D-27a). `/search` · `/me` 계정 카드 등 **새 웹 UI** 는 목업 규칙 적용 대상인지 플래너가 판단(스케치 004 가 계정 카드·/search 를 다루지 않음 → Open Question 5) |
| MEMORY: dev 포트 3100 (dev.sh 정본) | 로컬 dev URL 은 `http://localhost:3100` | dev 용 `server.url` 기본값 |
| MEMORY: Vercel env paste trailing newline | 새 `NEXT_PUBLIC_*` 를 넣으면 길이/끝 hex 검증 | Google 클라이언트 ID 는 **공개 식별자**라 코드 상수로 두면 Vercel env 변경 자체가 필요 없다(권장) |
| MEMORY: 기존 credentials 재요청 금지 | env·Secret Manager·이전 기록 먼저 확인 | 저장소에 Google OAuth 웹 클라이언트 ID 흔적 없음(`grep apps.googleusercontent.com` 0건) → Supabase 대시보드/GCP 에서 **읽어 와야** 한다(사용자 콘솔 태스크) |
| MEMORY: 병렬 Wave 는 worktree 분리 | 네이티브(mobile/)와 웹(webapp/)은 파일이 겹치지 않아 병렬 가능하나 lockfile 은 공유 | `pnpm-lock.yaml` 을 건드리는 태스크(mobile 의존성 추가)는 한 Wave 에 하나만 |

## Summary

이 phase 는 세 층이다: **(1) `mobile/` 네이티브 셸**(Capacitor 8.5.2 · iOS SPM · Android Gradle), **(2) 웹 쪽 앱 분기**(`html.native-app` · `postNative` · refresh 레지스트리 · 오버레이 신호 · safe-area · 네이티브 로그인 분기), **(3) 웹 기능 추가**(`/search` · `/me` 계정 카드 · 브랜드명). 참조 구현 weekly-wine(Capacitor 8.2.0)은 탭바·당겨서 새로고침·URL 관찰의 **UI 코드**는 거의 그대로 이식할 만하지만, **골격 코드 4곳이 지금 환경에서 깨진다**: UIScene 없는 iOS 템플릿(Xcode 27 에서 실행 불가), `webViewClient` 통째 교체(Capacitor 로컬 서버·리스너 우회), `onBackPressed`(Android 16 에서 미호출), 오프라인 폴백 미연결. 새로 만드는 쪽은 Capacitor **8.5.2** 템플릿에서 시작하고 weekly-wine 에서는 UI 조각만 가져온다.

Capacitor 는 Remote-URL 모드에서도 원격 페이지에 native-bridge 를 주입한다 — iOS 는 `WKUserScript(atDocumentStart, forMainFrameOnly)` 로 **모든 출처**에, Android 는 `WebViewCompat.addDocumentStartJavaScript(..., {server.url 출처})` 로 **server.url 출처에만**. 따라서 D-11 감지(`window.Capacitor.isNativePlatform()`)는 `<head>` 인라인 스크립트에서 첫 페인트 전에 동작한다. 또 native-bridge 의 저수준 API `Capacitor.nativePromise(plugin, method, options)` 로 네이티브 플러그인을 부를 수 있어 **webapp 에 `@capacitor/core` 나 로그인 플러그인 npm 패키지를 추가하지 않아도 된다**(플러그인의 JS 래퍼는 google 경로에서 인자를 그대로 넘긴다 — 소스 확인).

로그인은 `@capgo/capacitor-social-login@8.5.11`(Capacitor 8 전용 메이저, 2026-09-23 배포, 활발) 로 결정한다. `@codetrix-studio/capacitor-google-auth` 는 2024-05 이후 배포가 없고(3.4.0-rc.4) Capacitor 8 을 지원하지 않는다. nonce 는 **raw 를 Supabase 에, SHA-256 hex 를 플러그인에** 넘긴다(Supabase 가 raw 를 해시해 토큰의 `nonce` 클레임과 비교 — `auth-js` 타입 주석 확인). iOS 는 GoogleSignIn-iOS 9.0.0 부터 nonce 를 지원하므로(플러그인이 `from: "9.0.0"` 의존) Supabase 문서의 「iOS 는 Skip nonce check 켜기」 안내는 옛 SDK 기준이다 — 단 **`forcePrompt: true`** 로 복원 경로를 막아야 한다.

**Primary recommendation:** `mobile/` 은 `@capacitor/cli@8.5.2` 로 새로 `cap add` 한 템플릿(SceneDelegate 포함) 위에 weekly-wine 의 탭바/새로고침/URL 관찰 UI 코드를 이식하고, 네비게이션 델리게이트(iOS 전달형 프록시)·`BridgeWebViewClient` 상속(Android)으로 오프라인 폴백을 직접 구현하며, 웹은 `NativeBridgeProvider` 하나(감지·`postNative`·`window.__ghTrade`·refresh 레지스트리·오버레이 참조계수·테마/라우트 메시지)로 모든 앱 분기를 모은다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 하단 탭바(표시·활성·숨김·페이드) | Native shell (iOS VC / Android Activity) | Browser (overlay·route 신호) | D-02. 활성 판정은 URL 이 정본(KVO/`doUpdateVisitedHistory`), 웹 `route` 메시지는 SPA 보강 |
| 탭 이동 | Native shell → Browser | — | 네이티브가 `window.__ghTrade.navigate(path)` 를 evaluate(클라 내비, relay 소켓 유지) · 훅 없으면 `webView.load` 폴백 (Pattern 6) |
| 당겨서 새로고침 제스처 | Native shell | Browser (refresh 레지스트리) | D-04. 제스처·스피너 1초(D-17)는 네이티브, 무엇을 다시 읽을지는 웹 |
| Google 로그인 | Native plugin (id_token 발급) | Browser (`signInWithIdToken` 세션 생성) · Supabase Auth (토큰 검증) | D-03. 세션 쿠키는 `@supabase/ssr` 브라우저 클라이언트가 `document.cookie` 로 쓴다 → middleware 가 그대로 읽음 |
| 라우트 가드 · 세션 갱신 | Frontend Server (Next middleware) | — | 변경 없음. 앱도 같은 middleware 를 통과 |
| 오프라인 폴백 | Native shell (오류 감지·로컬 페이지 로드) | 로컬 정적 페이지(`mobile/www/index.html`) | Capacitor `errorPath` 대신 직접 구현(Pitfall 2) |
| safe-area · 탭바 여백 | Browser (CSS) | Native (Android SystemBars 가 `--safe-area-inset-*` 주입) | D-25 |
| 테마 → 상태바/배경/탭바 팔레트 | Browser (next-themes 가 정본) → Native | Native 저장값(첫 프레임) | D-23 |
| 앱 감지 · `html.native-app` | Browser (`<head>` 인라인 스크립트) | — | D-11. 첫 페인트 전 클래스 부착 |
| 아이콘·스플래시 | Build tooling (`@capacitor/assets`) | — | 원본 PNG 렌더는 로컬 스크립트(Playwright) |
| `/search` · `/me` 계정 카드 · 브랜드명 | Browser (Next.js 페이지/컴포넌트) | API (기존 검색 API 재사용) | 웹·앱 공통 기능 |
| relay 재탐침(D-16) | Browser (`use-relay-socket` effect) | relay 서버(변경 없음) | relay 인바운드 계약에 「스냅샷 재요청」 프레임이 없다(Pitfall 11) |

## Standard Stack

### Core (mobile/ 패키지)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@capacitor/cli` | 8.5.2 (2026-09-11) | `cap add/sync/open`, 설정 로딩, SPM `Package.swift`·`capacitor.settings.gradle` 생성 | 공식. **8.5 템플릿에 `SceneDelegate` 포함**(Xcode 27 필수) `[VERIFIED: npm registry + 템플릿 tarball 추출]` |
| `@capacitor/core` | 8.5.2 | 네이티브 측 코어 JS(`cap sync` 가 요구). 웹앱엔 불필요 | 공식 `[VERIFIED: npm registry]` |
| `@capacitor/ios` | 8.5.2 | iOS 런타임(`CAPBridgeViewController` · `SceneDelegateProxy` · `SystemBars`) · SPM `capacitor-swift-pm` exact 8.5.2 | 공식 `[VERIFIED: npm registry]` |
| `@capacitor/android` | 8.5.2 | Android 런타임(`BridgeActivity` · `BridgeWebViewClient` · `SystemBars` 인셋) | 공식 `[VERIFIED: npm registry]` |
| `@capgo/capacitor-social-login` | 8.5.11 (2026-09-23) | 네이티브 Google Sign-In(iOS GoogleSignIn-iOS ≥9.0.0 · Android Credential Manager) → id_token | Capacitor 8 전용 메이저 · nonce 지원 · codetrix 포크 후계 `[VERIFIED: npm registry + 패키지 소스 Read]` |
| `typescript` | ^5 (devDependency) | `capacitor.config.ts` 로딩 — CLI 가 `resolveNode(rootDir,'typescript')` 로 찾는다. pnpm 격리 레이아웃에선 `mobile/` 에 직접 선언해야 함 | `[VERIFIED: @capacitor/cli@8.5.2 dist/config.js:84-89]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@capacitor/assets` | 3.0.5 (마지막 배포 2024-03) | 아이콘·스플래시 생성(iOS `AppIcon`·`Splash.imageset` · Android mipmap/adaptive/splash) | **devDependency 로 넣지 말고** `npx @capacitor/assets@3.0.5 generate` 로 일회 실행 — sharp 0.32.6 + `@capacitor/cli@^5` 를 끌고 오며 Vercel 의 워크스페이스 전체 설치(`pnpm install --frozen-lockfile`)에 들어간다 `[VERIFIED: 패키지 package.json]` |
| `androidx.swiperefreshlayout:swiperefreshlayout` | 1.2.0 | Android 당겨서 새로고침 | weekly-wine 은 1.1.0, 최신 안정 1.2.0 `[VERIFIED: Google Maven metadata]` |
| Kotlin Gradle plugin | 2.2.x (예: 2.2.21) | MainActivity Kotlin 컴파일 | 템플릿은 Java. D-02 가 Kotlin 이므로 추가. weekly-wine 의 1.9.22 는 최신 androidx 메타데이터와 충돌 가능성 `[ASSUMED]` — `assembleDebug` 가 검증 |
| `@playwright/test` (webapp devDep, 기존) | ^1.59.1 | 아이콘/스플래시 SVG+워드마크 → PNG 렌더(Pretendard 폰트 그대로) | 새 설치 0. chromium 캐시 존재 `[VERIFIED: ~/Library/Caches/ms-playwright]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@capgo/capacitor-social-login` | `@codetrix-studio/capacitor-google-auth` | 3.4.0-rc.4 (2024-05) 이후 무배포 · Capacitor 8 미지원 · 원 저장소 사실상 아카이브(capgo README 「Fork Information」) → **기각** |
| webapp 에서 `Capacitor.nativePromise()` 직접 호출 | webapp 에 `@capacitor/core` + `@capgo/capacitor-social-login` 설치 | 타입은 생기지만 (a) 웹 번들 증가 (b) 플러그인 JS 가 `./oauth-popup-redirect` 부수효과 import 를 브라우저에서도 실행 (c) 웹 배포와 앱 바이너리 사이 버전 결합. google 경로는 JS 래퍼가 인자를 그대로 넘기므로(`social-login.js` `return rawSocialLogin.login(options)`) 직접 호출과 동치 → **직접 호출 + 얇은 타입 래퍼 권장** |
| 오프라인: 직접 구현 | `server.errorPath: 'index.html'` | 코드 0줄이지만 iOS -999 오탐 · Android HTTP 4xx/5xx 오탐(Pitfall 2) → **기각** |
| Android JS 채널 `addJavascriptInterface` (D-12 문구) | `WebViewCompat.addWebMessageListener(webView, "GhTradeBridge", setOf(origin), listener)` | 둘 다 `window.GhTradeBridge.postMessage(str)` 모양. 후자는 **허용 출처 제한**(오프라인 페이지·iframe 에 노출 안 됨) · Capacitor 자신이 쓰는 방식. D-12 가 명시한 전자로 가도 되며, 그 경우 메시지 타입 화이트리스트 + `webView.url` 호스트 검사를 넣는다 |
| 원본 PNG 렌더: Playwright | `sharp`(store 에 0.34.5 존재) / `qlmanage` / `rsvg-convert` | sharp 는 `mobile` devDep 추가 필요 + SVG `<text>` 가 fontconfig 폰트로 대체(Pretendard 아님). `rsvg-convert`·`magick`·`inkscape` 미설치. `sips` 는 SVG 래스터화 불가. `qlmanage` 는 썸네일 여백/배경 불안정 |

**Installation:**
```bash
# mobile/ 패키지 (pnpm workspace)
pnpm --filter @gh-radar/mobile add @capacitor/core@8.5.2 @capacitor/ios@8.5.2 @capacitor/android@8.5.2 @capgo/capacitor-social-login@8.5.11
pnpm --filter @gh-radar/mobile add -D @capacitor/cli@8.5.2 typescript@^5
# 아이콘·스플래시는 일회 실행 (의존성 추가 없음)
cd mobile && npx @capacitor/assets@3.0.5 generate --ios --android --assetPath resources
```

**Version verification (2026-09-25 실행):** `npm view @capacitor/core version` → `8.5.2` (dist-tags latest 8.5.2, latest-8.4 8.4.3) · `@capgo/capacitor-social-login` → `8.5.11` · `@capacitor/assets` → `3.0.5` · `@codetrix-studio/capacitor-google-auth` → `3.4.0-rc.4` (time.modified 2024-05-01). 정확 버전 고정(`^` 대신 exact)을 권한다 — `cap update` 가 `capacitor-swift-pm` 을 `exact:` 로 박고, 웹 쪽 `nativePromise` 인자 모양이 앱 바이너리의 플러그인 버전에 묶이기 때문.

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem npm` 결과(2026-09-25):

| Package | Registry | Age (최신판) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @capacitor/core | npm | 8.5.2 = 14일 (패키지 자체 7년+) | 3.26M/wk | github.com/ionic-team/capacitor | [SUS] reason `too-new` | Flagged — **최신판 게시일이 가까워서일 뿐** 공식 Ionic 패키지. planner 는 checkpoint:human-verify 1건(또는 `latest-8.4` = 8.4.3 으로 내려 고정)으로 처리 |
| @capacitor/cli | npm | 14일 | 3.30M/wk | github.com/ionic-team/capacitor | [SUS] `too-new` | 위와 동일 |
| @capacitor/ios | npm | 14일 | 2.38M/wk | github.com/ionic-team/capacitor | [SUS] `too-new` | 위와 동일. ★ SceneDelegate 템플릿은 CLI 8.5.x 에서 확인됨 — 8.4.3 으로 내리면 템플릿 재확인 필요 |
| @capacitor/android | npm | 14일 | 2.60M/wk | github.com/ionic-team/capacitor | [SUS] `too-new` | 위와 동일 |
| @capgo/capacitor-social-login | npm | 8.5.11 = 2일 | 139K/wk | github.com/Cap-go/capacitor-social-login | [SUS] `too-new` | Flagged — checkpoint:human-verify. 대안: 같은 8.x 의 약간 이전 판 고정 |
| @capacitor/assets | npm | 3.0.5 (2024-03) | 489K/wk | github.com/ionic-team/capacitor-assets | [OK] | Approved (npx 일회 실행) |
| @capacitor/splash-screen / @capacitor/app | npm | 2026-07 | 1.09M / 1.97M/wk | ionic-team/capacitor-plugins | [OK] | **설치하지 않음 권장**(Pattern 9 · Pitfall 12) |

`npm view <pkg> scripts.postinstall` / `scripts.install` → 위 패키지 전부 **없음**. `@capgo/capacitor-social-login` 은 `capacitor:sync:before` 훅(`scripts/configure-dependencies.js`)이 있어 `cap sync` 때 **자기 자신의** `Package.swift`·`android/gradle.properties` 를 고쳐 쓴다(비활성 provider 제거). 이 저장소 pnpm 은 파일을 APFS clone 으로 가져온다(`stat` 링크 수 1) → 전역 store 오염 없음 `[VERIFIED: stat node_modules/.pnpm/next-themes@*/…/package.json → 1 links]`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** @capacitor/core · cli · ios · android (8.5.2) · @capgo/capacitor-social-login (8.5.11) — 전부 `too-new`(최신판 게시 14일/2일) 사유. 설치 전 checkpoint:human-verify 1건.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────── iOS / Android 앱 프로세스 ─────────────────────────────┐
 앱 실행 ──▶ SceneDelegate / MainActivity.onCreate                                                          │
            │  (저장된 theme 로 배경·상태바 선적용 = 첫 프레임, D-23)                                           │
            ▼                                                                                               │
   GHTradeBridgeViewController / MainActivity(BridgeActivity)                                              │
   ├─ WKWebView / CapacitorWebView ──load──▶ https://trade.jx1.io{path}  ◀── Vercel(Next.js middleware 가드) │
   │     │ native-bridge 주입(iOS 전 출처 · Android server.url 출처)                                         │
   │     ▼                                                                                                  │
   │   [웹] <head> 인라인 스크립트: Capacitor.isNativePlatform() → html.native-app + data-native-platform    │
   │   [웹] NativeBridgeProvider ─ postNative({type,payload}) ──▶ ghTrade 채널 ──┐                         │
   │        · route(pathname)  · theme(dark|light)  · overlay(true|false)       │                         │
   │        window.__ghTrade = { refresh(), navigate(path), back() } ◀── evaluateJavaScript ──┐             │
   │                                                                             ▼            │             │
   ├─ 네비 델리게이트 프록시 / BridgeWebViewClient 상속 ── 오류? ─┬─ 네트워크 오류(메인프레임) ─▶ 로컬 폴백 │
   │      (나머지 콜백은 Capacitor 원본에 전달)                  └─ -999 · HTTP 404 등 ─▶ 무시              │
   │                                                              capacitor://localhost/index.html          │
   │                                                              https://localhost/index.html (Android)    │
   │                                                              └─ 복구 탐침 성공 ─▶ server.url 로 복귀    │
   ├─ 탭바(UIKit / View) ◀─ URL(KVO · doUpdateVisitedHistory) + route/overlay 메시지 ─ 활성·숨김 판정         │
   │     탭 탭 ─▶ evaluate __ghTrade.navigate(path) ─(없으면)▶ webView.load(url)                          │
   ├─ UIRefreshControl / SwipeRefreshLayout ─▶ evaluate __ghTrade.refresh() || location.reload() · 1초 후 종료│
   └─ 뒤로(Android) ─ overlay? ─▶ __ghTrade.back() / canGoBack ─▶ goBack / 홈 / 종료                         │
                                                                                                            │
 로그인(/login, native-app) ──▶ Capacitor.nativePromise('SocialLogin','login',{nonce: sha256(raw)}) ──▶     │
      GoogleSignIn-iOS / Credential Manager ──id_token──▶ supabase.auth.signInWithIdToken({token, nonce: raw})│
      ──document.cookie 세션──▶ location.replace(next) ──▶ middleware 가 쿠키로 통과                         │
                       └────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
mobile/                              # @gh-radar/mobile (pnpm workspace 에 추가)
├── package.json                     # build/typecheck 스크립트 없음(루트 pnpm -r 회피) · native:* 스크립트만
├── capacitor.config.ts              # appId com.ghtrade.app · server.url(env 로 dev 전환) · SystemBars · SocialLogin providers
├── tsconfig.json                    # capacitor.config.ts 로딩용 최소 설정
├── www/index.html                   # 오프라인 폴백(= webDir 필수 파일, iOS 는 없으면 fatalLoadError)
├── resources/                       # icon.svg(=#app-a) · icon-only.png · icon-foreground.png · icon-background.png · splash.png · splash-dark.png
├── scripts/render-resources.mjs     # Playwright 로 SVG+워드마크 → PNG (webapp 의 @playwright/test 를 createRequire 로 로드)
├── ios/App/App/
│   ├── SceneDelegate.swift          # ★ rootViewController = GHTradeBridgeViewController()
│   ├── GHTradeBridgeViewController.swift   # 탭바·새로고침·URL 관찰·메시지·테마·오프라인
│   ├── NavigationDelegateProxy.swift       # Capacitor 델리게이트 전달 + 오류 필터
│   ├── Info.plist                   # 표시명·방향·URL scheme(REVERSED iOS client ID)·Scene manifest
│   └── Base.lproj/Main.storyboard   # customClass 도 맞춰 둔다(보조)
└── android/app/src/main/
    ├── java/com/ghtrade/app/MainActivity.kt      # BridgeActivity 상속
    ├── java/com/ghtrade/app/GhTradeWebViewClient.kt # BridgeWebViewClient 상속
    ├── res/drawable/ic_tab_*.xml                 # Material Symbols outlined/filled
    ├── res/values/bools.xml + res/values-sw600dp/bools.xml  # is_tablet
    └── res/values/strings.xml                    # app_name = GH Trade

webapp/src/
├── lib/native/                      # 새 디렉터리
│   ├── native-detect.ts             # 인라인 스크립트 문자열 + isNativeApp()
│   ├── post-native.ts               # postNative(type,payload) — iOS/Android 채널 감싸기
│   ├── native-bridge-provider.tsx   # 레지스트리·오버레이 참조계수·route/theme 메시지·window.__ghTrade
│   ├── use-native-refresh.ts        # useNativeRefresh(fn)
│   ├── native-overlay-marker.tsx    # Sheet/Dialog Content 안에 렌더 → 마운트=열림
│   └── native-google-login.ts       # nonce 생성·해시 · nativePromise 래퍼 · signInWithIdToken
├── app/search/page.tsx              # D-07
└── components/me/account-card.tsx   # D-08
```

### Pattern 1: iOS — SceneDelegate 에서 서브클래스를 루트로
**What:** Capacitor 8.5 템플릿의 `SceneDelegate` 는 storyboard 가 아니라 코드로 VC 를 만든다.
**When:** `cap add ios` 직후 반드시.
```swift
// Source: @capacitor/cli@8.5.2 assets/ios-spm-template.tar.gz → App/App/SceneDelegate.swift (원문은 CAPBridgeViewController())
func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    window = UIWindow(windowScene: windowScene)
    window?.rootViewController = GHTradeBridgeViewController()   // ★ 여기만 교체
    window?.makeKeyAndVisible()
    SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
}
```
템플릿 `Info.plist` 에는 `UIApplicationSceneManifest`(`UISceneDelegateClassName = $(PRODUCT_MODULE_NAME).SceneDelegate`, `UISceneStoryboardFile = Main`)가 이미 있다 `[VERIFIED: 템플릿 Info.plist]`. storyboard 의 `customClass="CAPBridgeViewController" customModule="Capacitor"` 도 `GHTradeBridgeViewController`/`App` 로 맞춰 두면 혼동이 없다.

### Pattern 2: iOS — `CAPBridgeViewController` 서브클래스 골격
**핵심 사실(소스 확인):** `loadView()` 는 `final` 이고 `view = webView` 다(`CAPBridgeViewController.swift:30,46`) → **VC 의 루트 뷰가 곧 WKWebView**. 탭바는 `view.addSubview` 로 WebView 위에 얹는다(weekly-wine 과 동일). 풀블리드(D-25)이므로 weekly-wine 의 `viewDidLayoutSubviews` frame 조작(상태바 아래로 내림)은 **가져오지 않는다**. Capacitor 는 `scrollView.bounces = false`(`:301`) · 기본 `contentInsetAdjustmentBehavior = .never`(`CAPInstanceDescriptor.m:45`) · `scrollView.delegate = delegationHandler`(줌 비활성 시, `:323`)로 설정한다.
```swift
// Source: weekly-wine CookieViewController.swift 구조 + Capacitor 8.5.2 확장점
final class GHTradeBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private var navProxy: NavigationDelegateProxy?
    override func capacitorDidLoad() {            // webView·bridge 준비 완료, 뷰 계층 추가 전
        super.capacitorDidLoad()
        guard let wv = webView else { return }
        applyTheme(ThemeStore.load(), animated: false)       // D-23 첫 프레임 (UserDefaults)
        wv.isOpaque = false
        wv.scrollView.bounces = true                         // ★ UIRefreshControl 에 필수 (Capacitor 가 false 로 둠)
        wv.allowsBackForwardNavigationGestures = true
        wv.configuration.userContentController.add(self, name: "ghTrade")   // Capacitor contentController 에 추가
        navProxy = NavigationDelegateProxy(original: wv.navigationDelegate, owner: self)
        wv.navigationDelegate = navProxy                     // 오프라인 필터 (Pattern 5)
        setupTabBar(); setupPullToRefresh(); observeURL(); observeKeyboard()
    }
    // 방향: Info.plist ~ipad 해석에 기대지 말고 idiom 으로 확정 (Pitfall 9)
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }
    // 상태바: SystemBars 플러그인이 load 시 .default 로 덮어쓰므로 우리 값을 반환 (Pitfall 13)
    override var preferredStatusBarStyle: UIStatusBarStyle { currentTheme == .dark ? .lightContent : .darkContent }
}
```
- **메시지 수신:** `userContentController(_:didReceive:)` 에서 `message.name == "ghTrade"`, `message.body` 를 `String`(JSON) 으로 받아 `type` 화이트리스트(`route`·`theme`·`overlay`·`ready`)만 처리. 다른 타입은 무시.
- **URL 관찰:** weekly-wine `observeURL()`(548~655) 의 KVO + 150ms 지연 숨김 + `removeAllAnimations` 경합 방지를 그대로 이식하되, 판정 함수만 D-14 경로표로 교체. 호스트가 `server.url` 호스트가 아니면(= `capacitor://localhost` 오프라인 페이지) 탭바 숨김(D-12 ②).
- **당겨서 새로고침:** weekly-wine `setupPullToRefresh`(659~676) 이식, 핸들러만 `evaluateJavaScript("window.__ghTrade&&window.__ghTrade.refresh?window.__ghTrade.refresh():location.reload()")` + `asyncAfter(1.0){ endRefreshing() }`. 오버레이 열림 동안 `refreshControl` 을 떼거나 `isEnabled=false`(Pitfall 7).
- **테마:** `overrideUserInterfaceStyle`(리프레시 스피너·키보드 색 일치) · `view.backgroundColor`/`scrollView.backgroundColor` · 탭바 팔레트 · `setNeedsStatusBarAppearanceUpdate()` · UserDefaults 저장.
- **탭바 상수(D-27a):** 좌우 16 · 높이 70 · radius 32 · iPad 는 `width = min(560, bounds.width − 32)` 가운데 정렬(iPadOS 창 크기 가변 대비). 배경 = `UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))` + 그 위 card 색 82% 오버레이(UIKit 블러 반경은 조절 불가 — 「블러 18」은 근사) · 1px `line` 테두리(`layer.borderWidth`) · 그림자 `shadowRadius 16 / offset (0,2) / opacity .18`(pill 바깥 컨테이너, `clipsToBounds=false`).

### Pattern 3: Android — `BridgeActivity` 서브클래스 + `BridgeWebViewClient` 상속
**핵심 사실(소스 확인):** `BridgeActivity.onCreate` → `setContentView(capacitor_bridge_layout_main)` → `load()` → `bridgeBuilder.create()`(여기서 플러그인 load · `loadUrl(appUrl)`). 우리 코드는 `load()` 오버라이드에서 `super.load()` 뒤에 붙인다(weekly-wine 과 동일). `Bridge.setWebViewClient(BridgeWebViewClient)` 가 public(`Bridge.java:1468`), `addWebViewListener` 도 public(`:1497`).
```kotlin
// Source: weekly-wine MainActivity.kt load() 구조 + Capacitor 8.5.2 Bridge API
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        requestedOrientation = if (resources.getBoolean(R.bool.is_tablet))
            ActivityInfo.SCREEN_ORIENTATION_FULL_USER else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT   // D-24
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {   // ★ Android 16 대응
            override fun handleOnBackPressed() = handleBack()
        })
    }
    override fun load() {
        super.load()
        val wv = bridge.webView
        bridge.setWebViewClient(GhTradeWebViewClient(bridge, this))   // ★ 교체가 아니라 상속본 설치
        applyTheme(ThemeStore.load(this))                              // D-23 첫 프레임
        wv.addJavascriptInterface(GhTradeBridge(), "GhTradeBridge")    // 또는 addWebMessageListener (대안표)
        wrapInSwipeRefresh(wv); setupTabBar(); /* 인셋 리스너는 탭바 컨테이너에만 (Pitfall 8) */
    }
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)   // SystemBars 가 여기서 DEFAULT(OS 다크모드) 스타일로 되돌린다
        applyTheme(currentTheme)                  // ★ 그 뒤에 우리 테마 재적용 (Pitfall 13)
    }
}

class GhTradeWebViewClient(bridge: Bridge, private val host: MainActivity) : BridgeWebViewClient(bridge) {
    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        super.doUpdateVisitedHistory(view, url, isReload); host.onUrlChanged(url)
    }
    override fun onPageFinished(view: WebView, url: String) { super.onPageFinished(view, url); host.onUrlChanged(url) }
    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        super.onReceivedError(view, request, error)   // errorPath 미설정이면 리스너 호출만
        if (request.isForMainFrame && error.errorCode in NETWORK_ERRORS) host.showOffline(request.url.toString())
    }
    // onReceivedHttpError 는 오버라이드하지 않는다 → 404/500 은 웹 페이지 그대로 보인다
}
```
- `shouldInterceptRequest` 를 **절대** 오버라이드하지 않는다(로컬 에셋 서버 = 오프라인 페이지 `https://localhost/index.html` 과 구형 WebView 브리지 주입 경로 `BridgeWebViewClient.java:22-23`).
- `NETWORK_ERRORS` = `ERROR_HOST_LOOKUP(-2)`, `ERROR_CONNECT(-6)`, `ERROR_IO(-7)`, `ERROR_TIMEOUT(-8)` `[ASSUMED 범위 — 에뮬레이터 비행기 모드로 확인]`.
- 오프라인 페이지 로드는 `view.loadUrl("https://localhost/index.html?to=" + encoded)` — 프로그램 호출 `loadUrl` 은 `shouldOverrideUrlLoading` 을 거치지 않아 `launchIntent` 외부 브라우저 분기를 타지 않는다. 폴백 페이지에서 `location.href = 'https://trade.jx1.io/...'` 는 `launchIntent` 가 앱 URL 호스트로 인정해 WebView 안에서 연다(`Bridge.launchIntent`).
- **SwipeRefreshLayout:** weekly-wine `setupPullToRefresh`(186~209) 이식. `setOnChildScrollUpCallback { _, _ -> webView.canScrollVertically(-1) || innerScrolled || overlayOpen }`. 엣지투엣지면 `setProgressViewOffset(false, top, top + 64dp)` 로 스피너를 상태바 아래로.
- **탭바:** weekly-wine `setupTabBar`(441~534) 이식(CoordinatorLayout 에 `Gravity.BOTTOM` FrameLayout + CardView radius 32). 블러: Android 에는 WebView 뒤를 실시간 블러할 표준 수단이 없다(`RenderEffect` 는 뷰 자신을 흐림) → **card 색 ~94% 불투명** 근사 `[ASSUMED 시각 판단 — 사용자 확인]`.

### Pattern 4: 웹 — 감지·채널·레지스트리를 한 Provider 로
```tsx
// webapp/src/lib/native/native-detect.ts — <head> 인라인 (첫 페인트 전)
export const NATIVE_DETECT_SCRIPT = `(function(){try{var C=window.Capacitor;
if(C&&C.isNativePlatform&&C.isNativePlatform()){var d=document.documentElement;
d.classList.add('native-app');d.setAttribute('data-native-platform',C.getPlatform());}}catch(e){}})();`;
// layout.tsx: <html ... suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html: NATIVE_DETECT_SCRIPT}} /></head>
```
- native-bridge 는 문서 시작 시점에 주입되므로(iOS `JSExport.swift:20` `injectionTime: .atDocumentStart` · Android `Bridge.java:269` `addDocumentStartJavaScript`) 인라인 스크립트가 실행될 때 `window.Capacitor` 가 이미 있다. native-bridge 가 `cap.isNativePlatform = () => true` 와 `cap.getPlatform` 을 정의한다(`native-bridge.js:832-836`).
- `<html>` 에 `suppressHydrationWarning` 이 이미 있다(next-themes 가 같은 방식으로 `dark` 클래스를 붙임) → 클래스 추가가 하이드레이션 경고를 내지 않는다.
- **Tailwind v4 변형:** `globals.css:5` 의 `@custom-variant dark (&:where(.dark, .dark *));` 와 같은 모양으로 `@custom-variant native (&:where(.native-app, .native-app *));` → `native:hidden`, `native:lg:inline-flex` 등.
```ts
// post-native.ts — 두 채널 감싸기 (문자열 JSON 하나로 통일)
export function postNative(type: NativeMsgType, payload?: unknown): boolean {
  if (typeof window === 'undefined') return false;
  const msg = JSON.stringify({ type, payload });
  const w = window as unknown as { webkit?: { messageHandlers?: { ghTrade?: { postMessage(m: string): void } } };
                                   GhTradeBridge?: { postMessage(m: string): void } };
  if (w.webkit?.messageHandlers?.ghTrade) { w.webkit.messageHandlers.ghTrade.postMessage(msg); return true; }
  if (w.GhTradeBridge) { w.GhTradeBridge.postMessage(msg); return true; }
  return false;
}
```
- **Provider 책임:** (1) `window.__ghTrade = { refresh, navigate, back }` 설치·해제 (2) refresh 레지스트리 = **스택**(마지막 등록이 우선, 언마운트 시 제거 — 중첩 페이지 대비) (3) 오버레이 참조계수 0↔1 전이에서만 `postNative('overlay', bool)` (4) `usePathname()` 변경 시 `postNative('route', pathname)` (5) `useTheme().resolvedTheme` 마운트·변경 시 `postNative('theme', …)`. 앱이 아니면(클래스 없음) 전부 no-op.
- `navigate(path)` = `router.push(path)` + 같은 경로면 `window.scrollTo({top:0})`(D-06 재탭).
- `back()` = 오버레이가 열려 있으면 `document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))` 후 `true`, 아니면 `false`. Radix 의 ESC 처리는 `ownerDocument.addEventListener("keydown", …, { capture: true })` 로 **document** 를 듣고 가장 위 레이어만 닫는다 `[VERIFIED: @radix-ui/react-use-escape-keydown@1.1.1 dist/index.mjs]`. (커스텀 포털 `shared-panels` 는 오버레이가 아니라 상시 패널이므로 대상 아님.)

### Pattern 5: 오프라인 폴백 — 필터된 직접 로드
- **iOS:** weekly-wine `PaymentNavigationDelegate`(840~889) 의 **전달형 프록시** 패턴(`responds(to:)` + `forwardingTarget(for:)`)을 그대로 쓰되 `decidePolicyFor` 는 구현하지 않고(원본에 자동 전달) `didFailProvisionalNavigation`·`didFail` 만 구현: 원본 호출 → `(error as NSError).domain == NSURLErrorDomain && code ∈ {-1009 NotConnected, -1001 TimedOut, -1003 CannotFindHost, -1004 CannotConnectToHost, -1005 ConnectionLost, -1020 DataNotAllowed}` 이고 **-999(Cancelled) 가 아니면** `webView.load(URLRequest(url: bridge.config.localURL.appendingPathComponent("index.html") + "?to=…"))`. `localURL` 은 `capacitor://localhost` 이고 Remote 모드에서도 에셋 핸들러가 `public/` 을 서빙한다(`errorPathURL` 도 같은 방식으로 만든다 — `CAPInstanceConfiguration.swift:18-23`).
- **폴백 페이지(`mobile/www/index.html`):** weekly-wine 원형(워드마크·문구·「다시 시도」·`online` 이벤트·5초 폴링)에 두 가지 보강 — (a) 복귀 전 **실제 도달 확인**: `fetch('https://trade.jx1.io/icon.svg', {mode:'no-cors', cache:'no-store'})` 성공 시에만 이동(`navigator.onLine` 만 보면 「와이파이는 붙었는데 인터넷 없음」에서 5초마다 폴백↔실패 왕복) `[ASSUMED: capacitor:// 출처의 no-cors fetch 허용 — 시뮬레이터 확인]` (b) `?to=` 로 받은 원래 URL 이 `https://trade.jx1.io/` 로 시작할 때만 그리로, 아니면 루트로(오픈 리다이렉트 방지). 테마는 네이티브가 쿼리로 넘기거나(`&theme=dark`) `prefers-color-scheme` 무시하고 저장 테마 사용.
- **iOS 필수 조건:** `webDir/index.html` 이 없으면 `loadWebView()` 가 `fatalLoadError()`(`CAPBridgeViewController.swift:172`) — 폴백 페이지가 그 파일을 겸한다.

### Pattern 6: 탭 이동 = 클라이언트 내비(권장)
D-06 「WebView 에 해당 경로 로드」를 `webView.load(URLRequest)` 로 구현하면 탭마다 **전체 문서 재로드** → relay wss 재연결·전 데이터 재요청·스플래시 없는 흰 깜빡임. 네이티브는 먼저 `window.__ghTrade&&window.__ghTrade.navigate?window.__ghTrade.navigate('/search'):location.assign('/search')` 를 evaluate 한다 — 웹 훅이 있으면 `router.push`(SPA, 소켓 유지), 없으면(하이드레이션 전·오프라인 페이지) 네이티브 로드와 동일한 효과. 오프라인 페이지(호스트가 localhost)에서는 `webView.load(server.url + path)` 를 직접. 이는 D-06 의 의미(해당 경로로 이동·재탭 시 최상단)를 지키는 구현 선택이다 `[플래너 확인 권장 — Open Question 2]`.

### Pattern 7: 네이티브 Google 로그인 (웹 쪽)
```ts
// webapp/src/lib/native/native-google-login.ts — 의존성 추가 없음
type Cap = { nativePromise<T>(plugin: string, method: string, opts?: object): Promise<T> };
const cap = () => (window as unknown as { Capacitor: Cap }).Capacitor;

function randomNonce(bytes = 32): string {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(s: string): Promise<string> {           // crypto.subtle = 보안 출처 전용 (Pitfall 16)
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function nativeGoogleSignIn(supabase: SupabaseClient) {
  await cap().nativePromise('SocialLogin', 'initialize', {
    google: { webClientId: GOOGLE_WEB_CLIENT_ID, iOSClientId: GOOGLE_IOS_CLIENT_ID,
              iOSServerClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' },
  });
  const raw = randomNonce();
  const res = await cap().nativePromise<{ result?: { idToken?: string | null; accessToken?: { token: string } | null } }>(
    'SocialLogin', 'login',
    { provider: 'google', options: { scopes: ['email', 'profile'], nonce: await sha256Hex(raw), forcePrompt: true } },
  );
  const idToken = res.result?.idToken;
  if (!idToken) throw new Error('no_id_token');
  return supabase.auth.signInWithIdToken({
    provider: 'google', token: idToken, nonce: raw,
    ...(res.result?.accessToken?.token ? { access_token: res.result.accessToken.token } : {}),   // at_hash 대비
  });
}
// login/page.tsx handleGoogleLogin: isNativeApp() 이면 위 함수 → 성공 시 window.location.replace(safeNext)
```
- 결과 모양 `login.result?.idToken`(`login.idToken` 아님) `[CITED: 플러그인 README «Reading the login result»]`. `accessToken` 은 Android 에서 null 일 수 있다(`definitions.d.ts` `GoogleLoginResponseOnline.accessToken` 주석).
- **`forcePrompt: true` 이유:** iOS `GoogleProvider.swift` 는 `hasPreviousSignIn() && !forceAuthCode` 이면 `restorePreviousSignIn` → `refreshTokensIfNeeded` 로 **이전 토큰**을 돌려준다(nonce 미반영) `[VERIFIED: GoogleProvider.swift login() 소스]`. `forcePrompt` 는 매번 계정 선택을 띄워 웹의 `prompt=select_account` 와 UX 도 같다.
- 성공 후 **하드 내비**(`location.replace`) — 세션은 `document.cookie` 에 쓰였고(`@supabase/ssr` `cookies.js:88-99`), 다음 요청의 middleware `getUser()` 가 읽는다. 기존 `signOut` 도 하드 리다이렉트라 대칭.
- 취소(iOS GIDSignIn cancel / Android `USER_CANCELLED`)는 `oauth_denied` 문구로, 그 외 실패는 `auth_failed` 로 매핑 `[ASSUMED 오류 코드 모양 — 기기에서 로그 확인]`.

### Pattern 8: 오버레이 신호 = Content 안 마커 컴포넌트
Radix 의 `onOpenChange` 는 **부모가 `open` prop 을 직접 바꿀 때는 호출되지 않는다**(예: `AppShell` 햄버거가 `setSheetOpen(true)` 로 여는 드로어) → `onOpenChange` 훅킹은 열림을 놓친다. 대신 `SheetContent`/`DialogContent`(`ui/sheet.tsx` · `ui/dialog.tsx`)와 `number-pad-sheet.tsx` 의 `Dialog.Content` 안에 `<NativeOverlayMarker />` 를 렌더한다 — Content 는 열려 있는 동안(+퇴장 애니메이션)만 마운트되므로 `useEffect(() => { inc(); return dec; }, [])` 가 정확한 참조계수가 된다. 웹 브라우저에서는 no-op.
- 대안(편집 0곳): `MutationObserver` 로 `body[data-scroll-locked]` 감시 — Radix 모달이 `react-remove-scroll-bar` 로 이 속성을 참조계수로 관리한다(`react-remove-scroll-bar@2.3.8 component.js` `lockAttribute = 'data-scroll-locked'`). 전이적 의존성 내부 구현이라 **보조 안전망**으로만.

### Pattern 9: capacitor.config.ts
```ts
// mobile/capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://trade.jx1.io';   // dev: http://localhost:3100
const config: CapacitorConfig = {
  appId: 'com.ghtrade.app',
  appName: 'GH Trade',
  webDir: 'www',
  server: { url: serverUrl, cleartext: serverUrl.startsWith('http://') },   // allowNavigation 불필요(아래)
  ios: { contentInset: 'never', allowsLinkPreview: false, scrollEnabled: true },
  android: { allowMixedContent: false },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } },
  },
};
export default config;
```
- **`allowNavigation` = 비워 둔다.** 앱 URL 호스트(`trade.jx1.io`)는 자동 허용(iOS `isApplicationNavigation` · Android `launchIntent` 의 appUri 비교). Supabase REST/Realtime·Cloud Run API·`wss://…/ws` relay 는 **내비게이션이 아니라** fetch/XHR/WebSocket 이라 대상 아님. accounts.google.com 은 네이티브 로그인이라 불필요. 외부 링크(뉴스 원문 등)는 외부 브라우저로 나가는 기본 동작이 바람직(iOS `target=_blank` 도 `UIApplication.shared.open` — `WebViewDelegationHandler.swift:334-339`).
- `server.cleartext` 는 `cap sync` 가 `capacitor-cordova-android-plugins` 매니페스트에 `usesCleartextTraffic="true"` 로 주입한다(`@capacitor/cli dist/cordova.js:756`) — 그 디렉터리는 gitignore 대상이므로 **운영 빌드 전 반드시 env 없이 `cap sync` 재실행**(Pitfall 15).
- `CapacitorHttp`·`CapacitorCookies` 는 기본 비활성 — **켜지 않는다**(켜면 `fetch` 가 네이티브로 가로채져 `/chat` SSE 스트리밍이 깨진다 `[ASSUMED]`).
- `@capacitor/splash-screen`·`@capacitor/app`·`@capacitor/status-bar` 는 **설치하지 않는다**: 스플래시는 iOS LaunchScreen·Android `Theme.SplashScreen` 이 시스템 레벨로 처리하고 `BridgeActivity.onCreate` 가 스스로 `setTheme(AppTheme_NoActionBar)` 로 전환한다(`BridgeActivity.java:25-26`). 상태바는 코어 `SystemBars` + 네이티브 코드. `@capacitor/app` 은 자체 `OnBackPressedCallback` 을 등록해 D-26 정책과 경합한다.

### Anti-Patterns to Avoid
- **weekly-wine `viewDidLayoutSubviews` 의 `wv.frame` 조작 이식:** view == webView 라 루트 뷰 frame 을 바꾸는 셈이고, D-25 풀블리드와 정면 충돌.
- **weekly-wine 쿠키 저장/복원(`saveCookies`/`restoreCookies`) 이식:** Cafe24 세션쿠키용이었다. Supabase 쿠키는 max-age 가 있어 WKWebsiteDataStore/CookieManager 가 영속한다. Android 는 `onPause` 에 `CookieManager.getInstance().flush()` 만 유지.
- **weekly-wine `signingConfigs.release` 의 기본 비밀번호 하드코딩(`?: 'weeklywine2024'`) 복사 금지.** 서명은 범위 밖 — debug 서명만.
- **`ViewCompat.setOnApplyWindowInsetsListener` 를 DecorView/루트에 거는 것:** 뷰당 리스너는 하나 — `SystemBars` 의 DecorView 리스너(`SystemBars.java:191-193`)를 덮어써 CSS 인셋 주입과 IME 패딩이 사라진다.
- **`@JavascriptInterface` 메서드에서 UI 직접 조작:** JS 브리지 스레드에서 불린다 → `runOnUiThread`/`Handler(Looper.getMainLooper())` 로 넘긴다(weekly-wine 도 `handler.post`).
- **웹 탭바/하단 내비 추가:** D-02 · Deferred.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Google 네이티브 로그인 | GIDSignIn/Credential Manager 직접 연동 플러그인 | `@capgo/capacitor-social-login` | nonce·Credential Manager 재시도([16] reauth)·Family Link 처리 내장 |
| id_token 검증 | 클라이언트 JWT 검증 | Supabase `signInWithIdToken`(서버가 iss/aud/nonce/서명 검증) | 보안 경계는 서버 |
| Android safe-area 값 | 네이티브 인셋 → JS 주입 코드 | 코어 `SystemBars`(`insetsHandling:'css'`) + `var(--safe-area-inset-*, env(...))` | WebView<140 버그·IME 보정·키보드 버그(WebView<144)까지 이미 처리 |
| 아이콘/스플래시 리사이즈 | 수작업 mipmap/appiconset | `@capacitor/assets generate` | iOS 아이콘 알파 제거(`flatten`)·Contents.json·다크 스플래시 자동 |
| 오버레이 닫기(뒤로가기) | 시트별 close 콜백 레지스트리 | 합성 `Escape` keydown → Radix DismissableLayer | 가장 위 레이어만 닫는 규칙을 Radix 가 보장 |
| nonce 해시 | JS SHA-256 구현 | Web Crypto `crypto.subtle.digest` | 표준·검증된 구현 |
| 방향 분기 | 기기 모델 판별 | iOS `userInterfaceIdiom` · Android `values-sw600dp/bools.xml` | 공식 한정자 |

**Key insight:** 이 phase 의 위험은 「새로 짤 게 많다」가 아니라 **Capacitor 가 이미 하는 일을 모르고 덮어쓰는 것**이다(webViewClient 교체, DecorView 인셋 리스너, statusBarStyle, errorPath, scrollView.bounces). 확장은 항상 「상속 + super 호출」 또는 「전달형 프록시」로.

## Runtime State Inventory

> 브랜드 표시명 변경(gh-radar → GH Trade, D-21)이 포함되어 작성한다. 식별자·키는 바꾸지 않으므로 대부분 「없음」이다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | localStorage `gh-radar:*` 키 — D-21 로 **변경 안 함**. Supabase 테이블·Storage 에 브랜드 문자열 저장 없음(코드 grep 기준) | 없음 |
| Live service config | **Google OAuth 동의 화면 앱 이름** — 네이티브 계정 선택 화면에 GCP 동의 화면의 앱 이름이 나온다(현재 값 미확인, 저장소 밖). Supabase Auth 는 Google 전용이라 이메일 템플릿 무관 | 사용자 콘솔: 동의 화면 이름을 「GH Trade」로 바꿀지 결정(선택 · Open Question 6) |
| OS-registered state | 새 앱 — 기존 등록 없음. 웹 PWA manifest 없음(`webapp/src/app` 에 manifest 파일 없음) | 없음 |
| Secrets/env vars | 이름 변경 없음. 새 공개 식별자(Google web/iOS client ID) 가 생긴다 — 비밀 아님 | 코드 상수로 두면 Vercel env 추가 불필요 |
| Build artifacts | 없음(첫 빌드). 단 `cap sync` 산출물(`ios/App/App/capacitor.config.json`·`public/` · `android/app/src/main/assets/*` · `capacitor-cordova-*-plugins/`)은 템플릿 `.gitignore` 로 추적 제외 → 새 클론·CI 에서는 빌드 전 `cap sync` 필수 | 검증 명령에 `cap sync` 선행 |

**테스트 영향 정정:** CONTEXT 의 「`app-sidebar.test.tsx` 등 로고 텍스트 `gh-radar` 단언 → 갱신 필요」는 grep 결과 해당 단언이 **없다**(그 파일의 `gh-radar` 는 `e2e@gh-radar.local` 픽스처뿐). 웹 테스트·e2e 에서 브랜드 문자열을 단언하는 곳은 0건 — 새 단언을 추가해야 한다.

## Common Pitfalls

### Pitfall 1: Xcode 27 = UIScene 필수 (weekly-wine 템플릿 복사 시 실행 불가)
**What goes wrong:** 앱이 시작 즉시 「UIScene life cycle is required for apps built with this SDK」 어설션으로 종료.
**Why:** iOS 27 SDK 부터 `UIApplicationSceneManifest` 없거나 AppDelegate 가 scene 구성 메서드를 구현하지 않으면 실행 안 됨(TN3187). 이 머신은 Xcode 27.0 / iOS 27.0 SDK. weekly-wine 은 Capacitor 8.2 템플릿(SceneDelegate 없음).
**How to avoid:** `@capacitor/cli@8.5.2` 로 `cap add ios`(템플릿에 SceneDelegate·Scene manifest 포함) → Pattern 1.
**Warning signs:** 시뮬레이터 실행 직후 `EXC_BREAKPOINT` in `UIApplication_RuntimeIssues`.

### Pitfall 2: `server.errorPath` 오탐
**What goes wrong:** iOS — 탭 연타/리다이렉트로 이전 로드가 취소(-999)되면 `didFailProvisionalNavigation` → errorPath 로드가 **진행 중이던 새 로드까지 취소**하고 오프라인 화면이 뜬다. Android — `/stocks/INVALID` 같은 404 나 Vercel 5xx 에 「인터넷 연결 확인」이 뜬다.
**Why:** `WebViewDelegationHandler.swift:139-160` 은 오류 종류를 보지 않고 errorPath 를 로드. `BridgeWebViewClient.java:75-88` 은 `onReceivedHttpError` 에서도 메인 프레임이면 errorPath 로드.
**How to avoid:** errorPath 미설정 + Pattern 5 필터.

### Pitfall 3: 서브클래스가 적용되지 않음 (storyboard 만 수정)
**What goes wrong:** Main.storyboard `customClass` 를 바꿨는데 탭바가 안 나온다.
**Why:** 8.5 템플릿 `SceneDelegate` 가 `window?.rootViewController = CAPBridgeViewController()` 를 코드로 설정.
**How to avoid:** SceneDelegate 한 줄 교체(Pattern 1).

### Pitfall 4: Android `webViewClient` 통째 교체
**What goes wrong:** 오프라인 페이지(`https://localhost/…`)가 404/빈 화면, 구형 WebView(문서시작 스크립트 미지원)에서 `window.Capacitor` 없음, `SystemBars` 의 `onPageCommitVisible` 리스너 미호출(→ viewport-fit 판정 안 됨 → 인셋 오작동).
**Why:** weekly-wine `observeURL()`(726~855)은 `WebViewClient()` 새 인스턴스로 교체하고 일부 콜백만 원본에 넘긴다 — `shouldInterceptRequest`·`onPageCommitVisible`·`onRenderProcessGone` 누락.
**How to avoid:** `class … : BridgeWebViewClient(bridge)` + `bridge.setWebViewClient(...)`, 모든 오버라이드에서 `super` 호출.

### Pitfall 5: Android 16 에서 뒤로가기 무반응/즉시 종료
**What goes wrong:** targetSdk 36 + Android 16 기기에서 `onBackPressed()` 오버라이드가 불리지 않아 D-26 정책이 전혀 동작하지 않음.
**Why:** Android 16 behavior change — 「`onBackPressed` is not called and `KeyEvent.KEYCODE_BACK` is not dispatched anymore」 `[CITED: developer.android.com/about/versions/16/behavior-changes-16]`.
**How to avoid:** `onBackPressedDispatcher.addCallback(this, OnBackPressedCallback(true))`. 홈에서 종료 시 `isEnabled=false` 후 `onBackPressedDispatcher.onBackPressed()` 또는 `finish()`. 에뮬레이터 이미지가 API 36.1 이라 로컬 검증 가능.

### Pitfall 6: iOS 재로그인 nonce 불일치
(Pattern 7 참조) — `forcePrompt: true` 없으면 두 번째 로그인부터 `Nonces mismatch` 류 오류 `[VERIFIED: 플러그인 소스 / ASSUMED: Supabase 오류 문구]`. Supabase 의 「Skip nonce check」는 **전역 설정**(모든 클라이언트의 nonce 검증을 끔)이므로 켜지 않는다. GoogleSignIn-iOS 는 9.0.0 에서 커스텀 nonce 지원 추가(「Allow providing a custom `nonce` via GSI to AppAuth」) `[CITED: github.com/google/GoogleSignIn-iOS CHANGELOG]`.

### Pitfall 7: 당겨서 새로고침 오작동
- **iOS 가 아예 안 당겨짐:** Capacitor 가 `scrollView.bounces = false` 로 만든다 → `true` 로 되돌려야 `UIRefreshControl` 동작(weekly-wine 도 `webView.scrollView.bounces = true`).
- **시트 열린 채 당기면 재로드:** 키패드 시트 편집 중 당김 → 입력 유실. 오버레이 열림 동안 비활성.
- **내부 스크롤(호가 사다리·카드 목록) 최상단에서 당김이 문서 새로고침으로 번짐:** iOS 는 WebKit 스크롤 체이닝 → 내부 스크롤 컨테이너에 `overscroll-behavior-y: contain`. Android 는 `SwipeRefreshLayout` 이 `webView.canScrollVertically(-1)` 만 봄 → weekly-wine `onInnerScroll` 은 「마지막으로 스크롤된 요소」 상태라 부정확. 권장: 웹이 `touchstart`(capture, passive)에서 터치 대상의 가장 가까운 스크롤 조상 `scrollTop>0` 여부를 `postNative('pull', {blocked})` 로 알림 `[ASSUMED 타이밍 — 에뮬레이터 확인]`.
- **스피너가 상태바/헤더 밑에 숨음:** 풀블리드라 새로고침 컨트롤이 상태바 영역에 그려진다. iOS 는 시각 확인 후 필요 시 `refreshControl.bounds` 오프셋, Android 는 `setProgressViewOffset`.

### Pitfall 8: Android 인셋 — SystemBars 와 충돌
**Why (Capacitor 8.5.2 소스):** `SystemBars` 가 **DecorView** 에 `OnApplyWindowInsetsListener` 를 건다. `WebView ≥ 140 && viewport-fit=cover` 이면 패딩 0(풀블리드) + 하위 뷰에 시스템바 인셋 전달 + `--safe-area-inset-*` 주입, 아니면 DecorView 에 시스템바만큼 패딩(비풀블리드) + 하위 뷰 인셋 0. 키보드가 보이면 DecorView 하단 패딩 = IME 높이(`SystemBars.java:193-240`).
**How to avoid:**
1. 우리 인셋 리스너는 **탭바 컨테이너에만** 건다. 전달받은 `navigationBars` 하단값 + 14dp(D-27a 해석은 Open Question 1)로 여백.
2. **키보드가 보이면 탭바 숨김**(IME 가 보이면 DecorView 가 줄어 탭바가 키보드 위로 올라와 입력칸을 가림) — `insets.isVisible(WindowInsetsCompat.Type.ime())`. iOS 도 `keyboardWillShow/Hide` 로 동일 처리(`/search`·`/chat` 입력).
3. 비풀블리드 경로에서는 상태바 뒤가 DecorView 배경이 보인다 → `SystemBars.setStyle` 이 DecorView 배경을 `windowBackground` 테마 속성으로 덮어쓰므로(`SystemBars.java:300`) 우리 `applyTheme` 이 그 **뒤에** 다시 `decorView.setBackgroundColor(themeBg)`.
4. API < 35 기기에서의 실제 모양은 로컬에 이미지가 없다(API 36.1 만) → Environment 참조.

### Pitfall 9: iPad 방향이 세로로 잠김
**Why:** `CAPBridgeViewController.setScreenOrientationDefaults()` 는 `Bundle.main.infoDictionary["UISupportedInterfaceOrientations"]` 만 읽어 `supportedInterfaceOrientations` 를 만든다. `~ipad` 키가 infoDictionary 조회에 병합되는지는 확인하지 않았다 `[ASSUMED]`. 폰을 Portrait 만 두면 iPad 가 잠길 수 있다.
**How to avoid:** Pattern 2 처럼 `supportedInterfaceOrientations` 를 idiom 으로 오버라이드(Info.plist 도 D-24 대로 두 키 모두 기입). iPad 시뮬레이터 회전으로 확인.

### Pitfall 10: 네이티브 탭바가 웹 하단 고정 요소를 가림
**What goes wrong:** 앱에서 종목상세 「주문하기」 CTA, `/trading` 폰 하단 패널, 더티 액션 바가 탭바 밑에 깔려 누를 수 없다(네이티브 뷰가 WebView 위).
**Found (소스 Read):**
- `stock-detail-tabs.tsx:219` `fixed inset-x-0 bottom-0 z-30 … pb-[max(20px,env(safe-area-inset-bottom))] md:hidden` — **D-25 목록에 없음**, 종목상세는 탭바가 보이는 화면(D-14 전부 비활성).
- `shared-panels.tsx:248` `fixed inset-x-0 bottom-0 z-20 rounded-t-[var(--r-lg)]…` — `/trading` 은 탭바 활성 화면.
- `dirty-action-bar.tsx:104` `fixed inset-x-0 bottom-0 z-40 …`
- `chat-fab.tsx:118` `fixed right-6 bottom-6 z-40` (앱에선 숨김 D-10) · `globals.css:650` FAB 들어올림 규칙
- `alert-toasts.tsx:58` `fixed right-3 bottom-3 … max-[699px]:top-3 … max-[699px]:bottom-auto` (폰은 상단 — 영향 작음)
- `number-pad-sheet.tsx:241` `bottom-[max(10px,env(safe-area-inset-bottom))]` (오버레이 → 탭바 숨김이라 무관)
**How to avoid:** `html.native-app` 에 공통 변수 하나 — 예: `--native-tabbar-reserve: calc(<탭바 윗변까지 높이>)` — 를 두고 상시 하단 고정 바들은 앱에서 `bottom: var(--native-tabbar-reserve)` (+ 자기 safe-area 패딩 제거), 본문 `padding-bottom` 도 같은 변수에서 파생. 웹 브라우저는 0.

### Pitfall 11: D-16 「스냅샷 재요청」은 relay 계약에 없다
**Found:** relay 인바운드 스키마(`relay/src/ws/protocol.ts:355-367`) 원문:
```
export const RelayInboundSchema = z.discriminatedUnion("t", [
  RelayAuthSchema,
  RelaySubSchema,
  RelayUnsubSchema,
  RelayLcSetSchema,
  RelayLcArmSchema,
  RelayViSetSchema,
  RelayViConfirmSchema,
  RelayStrategiesDisableSchema,
  RelayOrderNewSchema,
  RelayOrderModifySchema,
  RelayOrderCancelSchema,
]);
```
스냅샷은 인증 ACK 직후 relay 가 내려 준다(`use-relay-socket.ts` `accountStates` 주석: 「relay 는 인증 직후 캐시된 계좌 상태를 계좌마다 한 프레임씩 내려보낸다」).
**How to avoid:** `probeNow()` = effect 내부 `onResume(true)`(`use-relay-socket.ts:1534`)를 ref 로 노출 — 예산 소진/백오프 대기면 즉시 `restart()`, 소켓 OPEN+ACK 이면 `startProbe()`(`:1512`, `RELAY_RESUME_PROBE_MS = 5_000` 동안 프레임이 안 오면 `restart()`). 살아 있으면 스트림이 곧 최신이므로 추가 요청 없음. 「살아 있어도 스냅샷을 새로 받고 싶다」면 `reconnect()`(nonce 재연결 = 새 스냅샷)지만 구독 재수립·순간 stale 표시 비용이 있다 → **probe 만 권장**, relay 변경 없음(Open Question 3). 수동주문 입력 상태는 컴포넌트 로컬이라 재연결에도 유지.

### Pitfall 12: `@capacitor/app` 설치 시 뒤로가기 경합
`@capacitor/app` 은 자체 `OnBackPressedCallback` 으로 WebView `goBack` 을 처리한다 `[ASSUMED — 플러그인 소스 미확인]`. 설치하지 않으면 경합 없음.

### Pitfall 13: 상태바 스타일이 OS 다크모드로 되돌아감
- **iOS:** `SystemBars.load()` 가 `bridge?.statusBarStyle = .default`(config `style` 기본 `DEFAULT`)로 설정 → VC 의 `statusBarStyle` 이 바뀜. `preferredStatusBarStyle` 을 오버라이드해 우리 테마 값을 반환하면 안전.
- **Android:** `SystemBars.handleOnConfigurationChanged` 가 회전·uiMode 변경마다 `setStyle(currentStyle)` → `DEFAULT` 면 OS 다크모드 기준으로 아이콘색을 바꾸고 DecorView 배경도 덮는다(`SystemBars.java` `setStyle`) → `onConfigurationChanged` 에서 `super` 뒤 재적용(Pattern 3). 매니페스트 `configChanges` 에 `uiMode|orientation|screenSize…` 가 있어 액티비티는 재생성되지 않는다(템플릿 확인).

### Pitfall 14: `viewport-fit=cover` 는 **모든 브라우저 사용자**에게 적용된다
**What goes wrong:** iPhone Safari **가로** 모드에서 좌우 노치 영역(`safe-area-inset-left/right` ≈ 47px)으로 헤더·본문이 들어가 잘린다. 앱은 폰 세로 고정이라 무관하지만 웹 사용자는 영향.
**How to avoid (둘 중 택1):** (a) 헤더·`main` 좌우 패딩을 `max(<기존 램프>, env(safe-area-inset-left/right))` 로 — 단 `main` 폭이 줄면 `/trading` 컨테이너 밴드(700·830·992) 진입 뷰포트가 바뀐다(§2.2b, CLAUDE.md Conventions) (b) `<head>` 인라인 스크립트에서 **앱일 때만** viewport meta 에 `viewport-fit=cover` 를 덧붙인다 — 웹 사용자 무영향, `SystemBars` 는 `onPageCommitVisible` 때 meta 를 읽으므로 인라인 수정이 반영된다 `[ASSUMED 타이밍]`. D-25 는 (정적) viewport export 를 명시했으므로 플래너가 선택(Open Question 4). 어느 쪽이든 `e2e/specs/home.spec.ts` 셸 불변식(헤더 좌우 패딩 == main 좌우 패딩, 318~)은 두 요소에 같은 식을 쓰면 유지된다.

### Pitfall 15: dev `server.url` 이 운영 빌드에 새어 들어감
`cap sync` 는 설정을 `ios/App/App/capacitor.config.json`·`android/app/src/main/assets/capacitor.config.json` 에 굽는다(둘 다 gitignore). `CAP_SERVER_URL=http://localhost:3100 pnpm exec cap sync` 뒤 env 없이 다시 sync 하지 않고 기기용 빌드를 하면 localhost 를 로드 + Android 는 cleartext 허용 상태. 스크립트를 `native:sync`(운영) / `native:sync:dev`(dev) 로 분리하고 빌드 스크립트가 항상 운영 sync 를 선행.

### Pitfall 16: LAN IP dev 에서는 네이티브 로그인 불가
`crypto.subtle` 은 **보안 출처**(https 또는 `http://localhost`)에서만 존재 → `http://192.168.x.x:3100` 에서는 nonce 해시가 `TypeError`. 또 운영 Cloud Run API 의 `CORS_ALLOWED_ORIGINS` 에 LAN 출처가 없고 relay URL `ws://localhost:8090` 은 기기 자신을 가리킨다. **dev 는 iOS 시뮬레이터 `http://localhost:3100`(호스트 네트워크 공유) · Android 에뮬레이터 `adb reverse tcp:3100 tcp:3100`(+ 8080, 8090) 후 `http://localhost:3100`** 로 한다. 실기기는 운영 URL(웹 push 후).

### Pitfall 17: pnpm 경로 — 전역 가상 스토어 금지
Capacitor CLI 는 플러그인 경로를 `require.resolve` 실경로(`node_modules/.pnpm/@capacitor+…/node_modules/@capacitor/…`)로 계산해 `Package.swift`/`capacitor.settings.gradle` 에 쓴다(`dist/ios/update.js:112` `relative(nativeXcodeProjDirAbs, plugin.rootPath)`). pnpm 전역 가상 스토어(`enableGlobalVirtualStore`/`virtualStoreType: global`)면 그 경로가 존재하지 않아 SPM·Gradle 해석 실패 `[CITED: github.com/ionic-team/capacitor/issues/8621 — 2026-09-23 기준 open]`. 이 저장소는 로컬 `node_modules/.pnpm`(1135 항목) 사용 중 → **`node-linker=hoisted` 불필요**. 단 경로에 버전 해시가 들어가므로 Capacitor/플러그인 버전을 올릴 때마다 `cap sync` 로 재생성·커밋.

### Pitfall 18: iOS ITP 쿠키 7일 상한
WKWebView 는 ITP 가 켜져 있어 **스크립트(document.cookie)로 쓴 쿠키**의 만료가 최대 7일로 잘린다 `[ASSUMED]`. `signInWithIdToken` 세션은 브라우저 클라이언트가 document.cookie 로 쓰지만, 이후 middleware 의 토큰 갱신은 `Set-Cookie` 응답 헤더(서버 설정 쿠키)로 다시 써진다 → 활발히 쓰면 유지, 7일 이상 미사용 시 재로그인 가능성. Safari 웹과 같은 조건이라 수용 가능 — UAT 에 메모.

### Pitfall 19: Android 어댑티브 아이콘 잘림
`#app-a` 레이더 외곽 원(r 312 + stroke 21 → 지름 ≈ 666/1024 = 65%)은 어댑티브 아이콘 안전 영역(108dp 중 지름 66dp ≈ 61%)보다 크다 → 원형 마스크에서 외곽 링이 잘릴 수 있다. `icon-foreground` 는 레이더 그룹을 중심 기준 ~0.88배 축소, `icon-background` 는 단색 `#17171c`. iOS 용 `icon-only` 는 원본 그대로(알파는 `@capacitor/assets` 가 `flatten` 으로 제거 — `platforms/ios/index.js` `_generateIcons`).

### Pitfall 20: SF Symbol 이름 오타는 조용히 실패
`UIImage(systemName:)` 는 없는 이름에 `nil` → 아이콘 없는 탭. `chart.line.uptrend.xyaxis` 는 `.fill` 변형이 없을 수 있다 `[ASSUMED]`(D-15 「`.fill` 계열」) → 활성은 굵기(`.semibold`)·색으로 표현하거나 `chart.line.uptrend.xyaxis.circle.fill`. `magnifyingglass`·`sparkles` 도 fill 변형 없음. 이름별 `assert(image != nil)` + 폴백.

## Code Examples

### iOS 전달형 네비게이션 프록시 (오프라인 필터)
```swift
// Source: weekly-wine CookieViewController.swift:840-889 (PaymentNavigationDelegate) 패턴 + Capacitor 8.5.2 WebViewDelegationHandler
final class NavigationDelegateProxy: NSObject, WKNavigationDelegate {
    weak var original: WKNavigationDelegate?
    weak var owner: GHTradeBridgeViewController?
    private static let offlineCodes: Set<Int> = [NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut,
        NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed]
    init(original: WKNavigationDelegate?, owner: GHTradeBridgeViewController) { self.original = original; self.owner = owner }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        handle(error, webView)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        original?.webView?(webView, didFail: navigation, withError: error)
        handle(error, webView)
    }
    private func handle(_ error: Error, _ webView: WKWebView) {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain, e.code != NSURLErrorCancelled, Self.offlineCodes.contains(e.code) else { return }
        owner?.showOffline(failedURL: e.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
    }
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }
    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let o = original, o.responds(to: aSelector) { return o }
        return super.forwardingTarget(for: aSelector)
    }
}
```
`original` 은 Capacitor 의 `WebViewDelegationHandler`(bridge 가 강하게 보유)라 `weak` 로 충분하다 `[ASSUMED — CapacitorBridge 가 delegationHandler 를 보유]`. weekly-wine 은 `var original`(강) — 어느 쪽이든 동작.

### 웹 refresh 레지스트리 사용처
```tsx
// 홈: useHomeQuery 결과를 등록 — D-04
const { refresh } = useHomeQuery(/* … */);
useNativeRefresh(refresh);        // 마운트 시 push, 언마운트 시 remove. 웹에선 no-op

// 종목상세 (D-18): 시세·차트·통계 GET 만. news/discussion 은 GET 재조회, POST /news/refresh 금지
useNativeRefresh(useCallback(() => Promise.all([reloadQuote(), reloadChart(), reloadStats(), reloadNewsCache()]), [...]));

// /trading · /me (D-16)
const { probeNow } = useRelayContext();
useNativeRefresh(probeNow);
```

### Android 방향 분기 리소스
```xml
<!-- res/values/bools.xml -->       <resources><bool name="is_tablet">false</bool></resources>
<!-- res/values-sw600dp/bools.xml --><resources><bool name="is_tablet">true</bool></resources>
```
매니페스트 `android:screenOrientation` 은 enum 이라 리소스 참조로 분기할 수 없다 → `onCreate` 에서 `requestedOrientation` 설정(Pattern 3). Android 16+ 대화면(sw≥600dp)에서는 API 36 타깃 앱의 방향 제한이 무시되므로(「orientation, resizability, and aspect ratio restrictions no longer apply on displays with smallest width >= 600dp」) 태블릿은 어차피 전방향 `[CITED: behavior-changes-16]`.

### 아이콘·스플래시 생성
```bash
# 1) 원본 렌더 (Playwright 는 webapp devDep — createRequire 로 로드)
node mobile/scripts/render-resources.mjs   # → mobile/resources/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png
# 2) 플랫폼 배포 (Custom mode: 위 5개 파일 이름 그대로 · resources/ 는 기본 탐색 경로)
cd mobile && npx @capacitor/assets@3.0.5 generate --ios --android --assetPath resources
```
원본 규격: `icon-only` ≥1024², `splash[-dark]` ≥2732² `[CITED: @capacitor/assets README «Custom Mode»]`. 스플래시 워드마크 폰트는 `webapp/public/fonts/PretendardVariable.woff2`(`lib/fonts.ts:9`)를 `@font-face` 로 로드.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AppDelegate + `UIMainStoryboardFile` 단독 | UIScene(SceneDelegate) 필수 | iOS 27 SDK (Xcode 27) | weekly-wine 골격 사용 불가 |
| `onBackPressed()` | `OnBackPressedDispatcher` / `OnBackInvokedCallback` | Android 16 (API 36 타깃) | weekly-wine 뒤로가기 코드 교체 |
| `windowOptOutEdgeToEdgeEnforcement` 로 엣지투엣지 회피 | 회피 불가, 엣지투엣지 대응 필수 | Android 16 타깃 | 웹 safe-area + SystemBars |
| `@capacitor/status-bar` 로 인셋/스타일 | 코어 `SystemBars`(insetsHandling css · IME 보정) | Capacitor 8.x (8.5.2 에서 DecorView 방식 · `initialViewportFitValueHint`) | status-bar 플러그인 불필요 |
| `@codetrix-studio/capacitor-google-auth` | `@capgo/capacitor-social-login` (Credential Manager) | codetrix 2024 이후 정지 | — |
| GoogleSignIn-iOS nonce 미지원 → Supabase 「Skip nonce check」 | GoogleSignIn-iOS ≥9.0.0 커스텀 nonce | GSI 9.0.0 | nonce 검증 유지 가능 |

**Deprecated/outdated:** Supabase 문서의 「For iOS enable the Skip nonce check option」 — 구 SDK 기준(현 SDK 는 nonce 지원) `[CITED: supabase.com/docs/guides/auth/social-login/auth-google]`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Kotlin Gradle plugin 2.2.x 가 AGP 8.13 · Gradle 8.14.3 · JDK 21 과 호환되고 1.9.22 는 최신 androidx 메타데이터와 충돌할 수 있다 | Standard Stack | `assembleDebug` 실패 → 버전 조정(1.9.22 는 로컬 캐시에 있음) |
| A2 | Android 오프라인 판정 오류 코드 집합(-2,-6,-7,-8) | Pattern 3 | 오프라인인데 폴백 미표시 / 과표시 |
| A3 | `capacitor://localhost` 오프라인 페이지에서 `https://trade.jx1.io` no-cors fetch 탐침이 허용된다 | Pattern 5 | 자동 복구가 `navigator.onLine` 폴링으로 퇴화 |
| A4 | Android `doUpdateVisitedHistory` 가 `pushState` 에도 불린다 | Pattern 3 | 웹 `route` 메시지가 보강하므로 영향 작음 |
| A5 | 로그인 취소/실패 오류 모양(iOS GIDSignIn cancel, Android USER_CANCELLED) | Pattern 7 | 취소가 `auth_failed` 로 표시되는 문구 문제 |
| A6 | `infoDictionary` 가 `~ipad` 키를 병합하는지 미확인 | Pitfall 9 | 오버라이드로 회피하므로 영향 없음 |
| A7 | ITP 7일 상한이 WKWebView document.cookie 에 적용 | Pitfall 18 | 재로그인 빈도 |
| A8 | `CapacitorHttp` 를 켜면 SSE 스트리밍이 깨진다 | Pattern 9 | 켜지 않으므로 무관 |
| A9 | `@capacitor/app` 이 자체 back 콜백을 등록 | Pitfall 12 | 설치하지 않으므로 무관 |
| A10 | Android 탭바 블러 대신 card ~94% 불투명 근사가 시각적으로 수용 가능 | Pattern 3 | 사용자 시각 확인 필요(D-27a 「블러 18」) |
| A11 | 인라인 스크립트로 viewport meta 를 앱에서만 수정하면 SystemBars 가 cover 로 인식 | Pitfall 14 (b) | (b) 선택 시 Android 인셋 미주입 |
| A12 | `chart.line.uptrend.xyaxis.fill` 부재 등 SF Symbol 변형 존재 여부 | Pitfall 20 | 아이콘 누락 — assert 로 조기 발견 |
| A13 | Android `touchstart` → `postNative('pull')` 이 SwipeRefreshLayout 가로채기 판단보다 먼저 도착 | Pitfall 7 | 내부 스크롤에서 가끔 새로고침 — `overscroll-behavior` 로 보완 |
| A14 | iOS id_token `aud` = iOS 클라이언트 ID, Android Credential Manager id_token `aud` = 웹 클라이언트 ID | Security / 콘솔 절차 | Supabase Client IDs 목록 누락 시 로그인 실패(오류 메시지로 즉시 드러남) |

## Open Questions

1. **「바닥 = safe-area inset + 14」의 방향**
   - What we know: 스케치 004 CSS 는 `.tabbar.va { bottom: calc(34px - 14px) }` — 탭바 바닥이 홈 인디케이터 영역 **안으로 14 내려간** 위치(화면 바닥에서 20). weekly-wine iOS 도 `bottomAnchor = safeArea.bottom + 14`(아래로 14). 문자 그대로 「inset + 14 위」면 바닥에서 48.
   - What's unclear: D-27a 문구와 목업 픽셀 중 어느 쪽이 정본인지. 인셋 0 기기(iPhone SE·Android 3버튼/API<35)에서는 목업식이면 탭바가 화면 밖으로 14 나간다(weekly-wine Android 는 3버튼일 때 6dp 로 보정).
   - Recommendation: **목업 픽셀이 정본**(채택 판단은 목업을 보고 했다) — `bottomGap = max(inset − 14, 8)`. 본문 여백 136(폰)/130(iPad)은 D-27a 상수 그대로 두되 공식으로 쓰려면 `inset + 102`(폰 inset 34 → 136).
2. **탭 이동을 클라이언트 내비(`router.push`)로 할지** — Pattern 6. D-06 문구는 「WebView 에 해당 경로 로드」. 권장: 클라 내비 + 폴백. 전체 재로드를 원하면 relay 재연결 비용 수용.
3. **D-16 「살아 있어도 스냅샷 재요청」** — relay 에 해당 프레임 없음(Pitfall 11). 권장: probe 만(relay 무변경). 대안: `reconnect()`.
4. **`viewport-fit=cover` 범위** — 전 사용자(D-25 원문) vs 앱 전용 인라인 수정. Safari 가로 노치 영향(Pitfall 14).
5. **`/search` · `/me` 계정 카드 목업 게이트** — 스케치 004 는 탭바·아이콘만 다뤘다. MEMORY 규칙(「UI 는 HTML 목업 먼저」)상 새 웹 화면 두 개도 목업 대상인지. 권장: 기존 컴포넌트 재조합(GlobalSearch 결과 리스트 · UserSection 아바타 · ThemeToggle)이라 가벼운 목업 1장(두 화면 × 다크/라이트)으로 게이트.
6. **Google 동의 화면 앱 이름·OAuth 클라이언트 위치** — 기존 웹 OAuth 클라이언트가 어느 GCP 프로젝트에 있는지(`gh-radar` 프로젝트인지) 저장소에 기록 없음. iOS·Android 클라이언트는 **같은 프로젝트**에 만들어야 한다(플러그인 README). 사용자 콘솔 태스크 첫 단계에서 확인.
7. **Apple 개발자 계정·번들 ID 가용성** — `com.ghtrade.app` 이 전역에서 선점되지 않았는지, 실기기 설치용 팀(유료/개인)이 있는지. weekly-wine 프로비저닝은 다른 번들이다. 선점돼 있으면 D-20(one-way)을 재논의해야 하는 블로커.
8. **스토어 정책(범위 밖이지만 미래 블로커)** — App Store 4.8(서드파티 로그인만 제공 시 Sign in with Apple 등 동등 옵션 요구) · 4.2(웹 래핑 최소 기능). 이 phase 에선 기록만.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | iOS 빌드 | ✓ | 27.0 (27A266a) · iOS 27.0 SDK · 시뮬레이터 SDK 27.0 | — |
| Xcode 라이선스/first-launch | `xcrun`·`clang` | ✓ | `xcrun clang --version` 성공 · `-checkFirstLaunchStatus` exit 0 (STATE.md 의 「라이선스 미동의」는 이번 세션 기준 해소됨) | — |
| iOS 시뮬레이터 런타임 | 시뮬레이터 실행 | ✓ | iOS 26.3 · 26.4 (기기: iPhone 17/17 Pro/Air/16e, iPad Pro 11·13 M5, iPad Air, iPad mini) | 27 런타임 없음 — 26.x 로 실행(배포 타깃 15 이므로 무관) |
| JDK | Gradle | ✓ | OpenJDK 21.0.9 (Android Studio JBR) | — |
| Android SDK | Android 빌드 | ✓ | platforms android-36, 36.1 · build-tools 35.0.0/36.0.0/36.1.0 · `ANDROID_HOME` 설정됨 | — |
| Android 에뮬레이터 | 실행 확인 | ✓ | AVD `Medium_Phone_API_36.1` (google_apis_playstore) | API<35 이미지 없음 → Pitfall 8-4 확인하려면 `sdkmanager "system-images;android-33;google_apis_playstore;arm64-v8a"` 추가(선택) |
| Gradle 캐시 | 오프라인 빌드 속도 | ✓ | wrapper 8.14.3 · KGP 1.9.22 캐시 | — |
| Android Studio | 수동 실행·서명 리포트 | ✓ | /Applications/Android Studio.app | — |
| Node / pnpm | CLI | ✓ | v22.22.0 / 11.15.1 (Capacitor CLI 8.5 는 node ≥22 요구 ✓) | — |
| Playwright chromium | 원본 PNG 렌더 | ✓ | chromium-1217 캐시 | — |
| rsvg-convert / ImageMagick / Inkscape | SVG 렌더 | ✗ | — | Playwright |
| CocoaPods | — | 불필요 | SPM 사용 | — |
| Google 계정이 로그인된 에뮬레이터 | Android 네이티브 로그인 | 미확인 | — | 수동 UAT 전 에뮬레이터에 계정 추가 |
| GCP 콘솔 · Supabase 대시보드 접근 | OAuth 클라이언트 · Client IDs | 사용자 | — | 사용자 콘솔 태스크(checkpoint:human-action) |

**Missing dependencies with no fallback:** 없음(콘솔 작업은 사람 태스크).
**Missing dependencies with fallback:** SVG 래스터라이저 → Playwright · API<35 에뮬레이터 → 선택 설치.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (웹 단위) | Vitest ^2.1.9 + jsdom + @testing-library/react (`webapp/vitest.config.ts` — include `src/**/*.test.{ts,tsx}`, setup `tests/setup.ts`) |
| Framework (웹 e2e) | Playwright ^1.59.1 (`webapp/playwright.config.ts`, baseURL :3100, setup 프로젝트가 로그인 storageState) |
| Framework (iOS) | `xcodebuild build` (컴파일 검증) · `xcrun simctl` 설치/실행/스크린샷 (스모크) |
| Framework (Android) | `./gradlew assembleDebug` (컴파일) · `adb install/shell am start/exec-out screencap` (스모크) |
| Quick run command | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/native` |
| Full suite command | `pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp run typecheck` (+ config `test_command` 의 relay 테스트) |
| iOS build command | `cd mobile && pnpm exec cap sync ios && xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build` |
| Android build command | `cd mobile && pnpm exec cap sync android && cd android && ./gradlew assembleDebug` |

- 첫 iOS 빌드는 SPM 이 `capacitor-swift-pm`·`GoogleSignIn-iOS`(+AppAuth/GTMSessionFetcher)를 받아 수 분 걸린다 → iOS/Android 빌드는 **태스크당이 아니라 Wave 단위** 검증. SPM 의존성 해석만 빠르게 보려면 `xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj`.
- 시뮬레이터 스모크(반자동): `xcrun simctl boot "iPhone 17"` → `xcrun simctl install booted ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app` → `xcrun simctl launch booted com.ghtrade.app` → `xcrun simctl io booted screenshot /tmp/ios-home.png`. Android: `emulator -avd Medium_Phone_API_36.1 &` → `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` → `adb shell am start -n com.ghtrade.app/.MainActivity` → `adb exec-out screencap -p > /tmp/and-home.png`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOBILE-01a | 인라인 감지 스크립트: `window.Capacitor` 가 있으면 `html.native-app` + `data-native-platform`, 없으면 무변경 | unit | `vitest --run src/lib/native/__tests__/native-detect.test.ts` | ❌ Wave 0 |
| MOBILE-01b | `postNative`: iOS 핸들러 우선 → Android 브리지 → 둘 다 없으면 false, 페이로드는 JSON 문자열 | unit | `vitest --run src/lib/native/__tests__/post-native.test.ts` | ❌ Wave 0 |
| MOBILE-01c | refresh 레지스트리: 마지막 등록 우선 · 언마운트 제거 · 비어 있으면 `location.reload` · `window.__ghTrade` 설치/해제 · 웹(비앱)에서 no-op | unit | `vitest --run src/lib/native/__tests__/native-bridge-provider.test.tsx` | ❌ Wave 0 |
| MOBILE-01d | 오버레이 참조계수: Sheet 두 개 중첩 열림/닫힘에서 `overlay` 메시지는 0↔1 전이 때만 · `back()` 이 가장 위 시트만 닫음 | unit | 같은 파일 + `ui/sheet` 렌더 | ❌ Wave 0 |
| MOBILE-01e | route/theme 메시지: 경로 변경·`resolvedTheme` 변경 시 1회씩 | unit | 같은 파일 | ❌ Wave 0 |
| MOBILE-01f | 네이티브 로그인: 플러그인에는 `sha256(raw)`, Supabase 에는 `raw`, `forcePrompt:true`, 성공 시 `location.replace(safeNext)`, 취소 → `oauth_denied` | unit (nativePromise·supabase mock) | `vitest --run src/lib/native/__tests__/native-google-login.test.ts` + `src/app/login/__tests__/page.test.tsx` | ❌ Wave 0 |
| MOBILE-01g | `/search` 페이지: 입력 → 디바운스 검색 결과 → 선택 시 `/stocks/{code}` · 진입 카드 3개 링크 | unit + e2e | `vitest --run src/app/search` · `playwright test e2e/specs/search-page.spec.ts` | ❌ Wave 0 |
| MOBILE-01h | `/me` 계정 카드: 아바타→이니셜 폴백 · 이름·이메일 · 테마 토글 · 로그아웃 | unit + e2e | `vitest --run src/components/me` · `playwright test e2e/specs/me.spec.ts` | 부분(me.spec 존재) |
| MOBILE-01i | 브랜드: title `GH Trade` · 헤더 로고/aria · 로그인 제목 · localStorage 키 불변 | unit + e2e | `vitest --run src/components/layout` · `playwright test e2e/specs/smoke.spec.ts` | ❌ 단언 신규 |
| MOBILE-01j | 앱 모드 셸(Playwright `addInitScript` 로 가짜 `window.Capacitor`+`webkit.messageHandlers.ghTrade` 주입): 1280 폭에서 `aside` 숨김·햄버거 보임 · `/stocks/*` 에 ChatFab 없음 · 하단 고정 바가 `--native-tabbar-reserve` 만큼 올라감 · 본문 하단 여백 · 메시지 캡처 | e2e | `playwright test e2e/specs/native-shell.spec.ts` | ❌ Wave 0 |
| MOBILE-01k | 브라우저 모드 회귀: 셸 불변식(헤더==본문 좌우 패딩 · 잉크 정렬) 유지 | e2e | `playwright test e2e/specs/home.spec.ts -g "셸 불변식"` | ✅ |
| MOBILE-01l | D-18: 종목상세 refresh 훅이 `POST …/news/refresh` 를 호출하지 않음 | unit (fetch spy) | `vitest --run src/components/stock/__tests__/stock-native-refresh.test.tsx` | ❌ Wave 0 |
| MOBILE-01m | D-16: `probeNow()` — 백오프/소진이면 즉시 restart, OPEN+ACK 면 probe 시작, 5s 무프레임이면 restart | unit (가짜 WebSocket·타이머) | `vitest --run src/lib/__tests__/relay-socket.test.ts -t probeNow` | ✅ 파일 존재 · 케이스 신규 |
| MOBILE-01n | iOS 컴파일 · SPM 해석 · SceneDelegate 서브클래스 | build | iOS build command | ❌ (mobile/ 신규) |
| MOBILE-01o | Android 컴파일 · Kotlin · 리소스 | build | Android build command | ❌ (mobile/ 신규) |

### Manual-only (기기·시뮬레이터 확인 — 자동화 불가 사유: 네이티브 UI·실제 OS 동작)
| 항목 | 기기 | 확인 방법 |
|------|------|-----------|
| 탭바 시각(D-27a 수치·다크/라이트·iPad 560 가운데·페이드) | iPhone 17 시뮬 · iPad Pro 11 시뮬 · Android 에뮬 | 스크린샷을 스케치 004 와 나란히 비교 |
| 활성 탭 판정(D-14) · 종목상세 5탭 비활성 · 로그인 화면 숨김 · 오버레이 열림 시 150ms 후 페이드 | 전부 | 화면 이동 시나리오 |
| 당겨서 새로고침: 페이지 훅 호출 · 1초 후 스피너 종료 · 시트 열림 중 비활성 · 호가 사다리 안 당김 무반응 | 전부 | 수동 제스처 |
| 네이티브 Google 로그인 → 홈 착지 · 재로그인(두 번째) 성공 · 로그아웃 후 재로그인 | iOS 시뮬(가능) · Android 에뮬(Google 계정 필요) · 실기기 1대 | GCP/Supabase 콘솔 작업 후 |
| 오프라인: 비행기 모드로 실행 → 폴백 · 복구 시 원래 경로로 자동 복귀 · 탭 연타(-999)에 폴백 안 뜸 · 404 페이지에 폴백 안 뜸 | iOS 시뮬(네트워크 링크 컨디셔너)·Android 에뮬 | 수동 |
| 테마 토글 → 상태바 아이콘색·배경·탭바 즉시 전환 · 재실행 첫 프레임에 이전 테마 | 전부 | 수동 |
| 회전: 폰 세로 고정 · iPad 4방향 · Android 태블릿(sw600) 회전 | iPad 시뮬 · (Android 태블릿 AVD 없음 — 선택 생성) | 수동 |
| Android 뒤로가기(D-26): 시트 닫기 → goBack → 홈 → 종료 · 제스처/3버튼 내비 양쪽 탭바 여백 | Android 에뮬(API 36.1 = Android 16 동작 확인) | 수동 |
| 키보드 표시 시 탭바 숨김(/search·/chat) · 입력칸 가림 없음 | 전부 | 수동 |
| 운영 URL 로 빌드한 앱의 실기기 설치 | iPhone 실기기(서명 팀 필요) · Android 실기기 | 수동 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @gh-radar/webapp exec vitest --run <touched dir>` (웹) / 해당 없음(네이티브 편집 태스크는 다음 항목)
- **Per wave merge:** 웹 full suite + typecheck + (네이티브 Wave) iOS build command + Android build command
- **Phase gate:** 전부 green + `playwright test e2e/specs/native-shell.spec.ts e2e/specs/home.spec.ts e2e/specs/me.spec.ts` + Manual-only 표 UAT → `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `webapp/src/lib/native/__tests__/` — native-detect · post-native · native-bridge-provider · native-google-login (MOBILE-01a~f)
- [ ] `webapp/e2e/specs/native-shell.spec.ts` + 공용 픽스처 `e2e/fixtures/native-app.ts`(addInitScript 가짜 Capacitor · 메시지 캡처 배열) (MOBILE-01j)
- [ ] `webapp/e2e/specs/search-page.spec.ts` (MOBILE-01g)
- [ ] `relay-socket.test.ts` 에 `probeNow` 케이스 (MOBILE-01m)
- [ ] `mobile/package.json` 스크립트: `native:sync`, `native:sync:dev`, `native:build:ios`, `native:build:android`, `native:assets` (이름에 `build`/`typecheck` 단독 사용 금지 — 루트 `pnpm -r run build` 가 집어 감)
- [ ] 프레임워크 설치: 없음(기존 Vitest/Playwright 재사용)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Google id_token → Supabase `signInWithIdToken`(서버가 서명·iss·aud·exp·nonce 검증) · nonce = `crypto.getRandomValues` 32바이트 raw / SHA-256 hex · `forcePrompt` |
| V3 Session Management | yes | 기존 `@supabase/ssr` 쿠키 세션 + middleware `getUser()` 갱신 — 변경 없음. 로그인 후 하드 내비 |
| V4 Access Control | yes | middleware 공개 prefix(`/login`,`/auth`) 불변. 새 `/search` 는 보호 경로(기본 차단 규칙이 자동 적용) |
| V5 Input Validation | yes | 네이티브 메시지 핸들러: JSON 파싱 실패 무시 · `type` 화이트리스트 · `route` 는 `/` 시작 문자열만 · 폴백 페이지 `?to=` 는 `https://trade.jx1.io/` 접두 검사(오픈 리다이렉트 방지) · 기존 `safeNext` 가드 재사용 |
| V6 Cryptography | yes | Web Crypto `subtle.digest('SHA-256')` — 직접 구현 금지 |
| V14 Configuration | yes | 운영 빌드: `webContentsDebuggingEnabled` 기본(릴리스 false) · cleartext 없음(Pitfall 15) · `allowNavigation` 빈 배열 · `CapacitorHttp` 비활성 · 키스토어/비밀번호 커밋 금지 · `Info.plist` 에 불필요한 `NSAllowsArbitraryLoads` 금지 |

### Known Threat Patterns for Capacitor Remote-URL + Supabase
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| id_token 재전송(replay) | Spoofing | nonce(raw↔hash) 검증 유지 · Supabase 「Skip nonce check」 끄기 |
| 다른 앱의 id_token 사용(aud 혼동) | Spoofing | Supabase Google provider Client IDs 에 **우리** web·iOS 클라이언트만 등록 |
| 원격 페이지 XSS 가 네이티브 플러그인 호출 | Elevation | 노출 플러그인 최소화(SocialLogin·SystemBars 만) · 네이티브 메시지 타입 화이트리스트 · 기존 CSP/XSS 방어 유지 |
| Android `addJavascriptInterface` 가 모든 프레임/출처에 노출 | Elevation | `addWebMessageListener`(출처 제한) 대안 또는 핸들러에서 `webView.url` 호스트 확인 · 메서드는 UI 신호만 |
| 폴백 페이지 오픈 리다이렉트(`?to=`) | Tampering | 접두 검사 |
| dev 설정(cleartext·localhost) 운영 유출 | Info Disclosure | sync 스크립트 분리 · 빌드 전 운영 sync 강제 |
| WebView 디버깅 활성 릴리스 | Info Disclosure | 릴리스 기본 false 유지(명시 true 금지) |

## Sources

### Primary (HIGH confidence — 이번 세션 직접 Read)
- `@capacitor/ios@8.5.2`(npm pack): `CAPBridgeViewController.swift`(30·46·172·292-325) · `WebViewDelegationHandler.swift`(139-160·334-339) · `JSExport.swift:20` · `Plugins/SystemBars.swift` · `CAPSceneDelegateProxy.swift` · `CAPInstanceDescriptor.swift/.m`
- `@capacitor/android@8.5.2`: `BridgeWebViewClient.java`(22-88) · `Bridge.java`(`loadWebView` 265-270 · `launchIntent` · `getErrorUrl` 553-566 · `setWebViewClient` 1468 · `addWebViewListener` 1497) · `BridgeActivity.java` · `MessageHandler.java` · `plugin/SystemBars.java`(8.5.2 DecorView 인셋 · `initialViewportFitValueHint`) · `assets/native-bridge.js`(832-836 · 999)
- `@capacitor/cli@8.5.2`: `assets/ios-spm-template.tar.gz`(SceneDelegate · Info.plist · Package.swift · pbxproj) · `assets/android-template.tar.gz` · `dist/declarations.d.ts`(server.errorPath 등) · `dist/config.js:84-89` · `dist/ios/update.js:112` · `dist/cordova.js:756`
- `@capgo/capacitor-social-login@8.5.11`: `README.md`(Google·Troubleshooting) · `ios/Sources/SocialLoginPlugin/GoogleProvider.swift` · `android/.../GoogleProvider.java` · `dist/esm/social-login.js` · `dist/esm/definitions.d.ts` · `Package.swift` · `scripts/configure-dependencies.js`
- `@capacitor/assets@3.0.5`: `README.md` · `package.json` · `dist/platforms/ios/index.js`
- `@supabase/auth-js@2.103.2 lib/types.d.ts:570-583` · `@supabase/ssr@0.10.2 createBrowserClient.js · cookies.js`
- `react-remove-scroll-bar@2.3.8 component.js` · `@radix-ui/react-use-escape-keydown@1.1.1` · `next@15.5.15 metadata/types/extra-types.d.ts:52` · `block-cross-site.js`
- weekly-wine-app: `capacitor.config.ts` · `ios/App/App/CookieViewController.swift`(전체) · `AppDelegate.swift` · `Info.plist` · `Main.storyboard` · `CapApp-SPM/Package.swift` · `android/.../MainActivity.kt`(전체) · `variables.gradle` · `app/build.gradle` · `build.gradle` · `AndroidManifest.xml` · `styles.xml` · `www/index.html` · `ios/App/App/capacitor.config.json` · `tasks/lessons.md`
- gh-radar: `webapp/src/app/layout.tsx` · `login/page.tsx` · `auth/callback/route.ts` · `lib/supabase/{client,middleware}.ts` · `lib/auth-context.tsx` · `lib/use-relay-socket.ts`(1099-1600) · `lib/relay-provider.tsx` · `components/layout/{app-shell,app-header}.tsx` · `components/ui/sheet.tsx` · `components/trading/lc/number-pad-sheet.tsx` · `components/stock/stock-detail-tabs.tsx` · `styles/globals.css` · `components/providers/theme-provider.tsx` · `vitest.config.ts` · `playwright.config.ts` · `e2e/specs/home.spec.ts` · `vercel.json` · `scripts/vercel-ignore-build.sh` · `relay/src/ws/protocol.ts:355-367` · `pnpm-workspace.yaml` · `.gitignore` · `.planning/sketches/004-native-tab-bar/{README.md,index.html}`
- npm registry(`npm view`), Google Maven metadata, Maven Central(KGP) — 버전

### Secondary (MEDIUM)
- https://capacitorjs.com/docs/apis/system-bars — insetsHandling·권장 CSS
- https://developer.android.com/about/versions/16/behavior-changes-16 — predictive back · 대화면 방향 무시 · 엣지투엣지 opt-out 폐지
- https://supabase.com/docs/guides/auth/social-login/auth-google — Client IDs(웹 먼저, 쉼표) · Android nonce 해시 절차 · (구) iOS Skip nonce
- https://capgo.app/docs/plugins/social-login/google/ios/ — iOS URL scheme(REVERSED client ID)
- https://github.com/google/GoogleSignIn-iOS/blob/main/CHANGELOG.md — 9.0.0 커스텀 nonce
- https://github.com/ionic-team/capacitor/issues/8621 — pnpm 전역 가상 스토어 경로 문제
- UIScene 필수(iOS 27 SDK): https://developer.apple.com/forums/thread/813300 · https://github.com/expo/expo/issues/46664 · https://blakecrosley.com/blog/uikit-scene-lifecycle-mandate-ios-27

### Tertiary (LOW)
- -999 취소를 오류로 다루는 함정 사례: https://github.com/craft-native/craft/issues/252
- Android 16 back 실사례: https://dev.to/dainyjose/android-system-back-button-closes-the-app-after-upgrading-to-target-sdk-36-react-native-fix-475g

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 레지스트리·tarball 소스로 버전과 템플릿 내용 확인. SUS 는 게시일 사유뿐.
- Architecture: HIGH — 모든 확장점(loadView final · view==webView · setWebViewClient · SystemBars 인셋 · errorPath 동작)을 8.5.2 소스에서 확인. 탭 이동 방식·D-16 해석은 플래너 결정 필요(Open Q 2·3).
- Pitfalls: HIGH(1-5·8·10·11·13·15·17 소스 근거) / MEDIUM(6·14·16) / LOW(7 일부·12·18·20).
- 콘솔 절차(GCP·Supabase): MEDIUM — 공식 문서 인용, 실제 화면 라벨은 사용자 작업 때 확인.

**Research date:** 2026-09-25
**Valid until:** 2026-10-25 (Capacitor 8.x 는 주 단위 릴리스 · Xcode/iOS 27 초기 — 30일)
