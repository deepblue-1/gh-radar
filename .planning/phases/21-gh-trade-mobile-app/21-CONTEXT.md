# Phase 21: GH Trade 모바일 앱 (Capacitor) - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

webapp(Next.js 15, Vercel `https://trade.jx1.io`)을 **Capacitor Remote-URL 셸**로 감싼 iOS · iPadOS · Android 앱 **GH Trade** 를 만든다. WebView 가 운영 URL 을 그대로 로드한다(static export 불가 — middleware 인증 가드 · `/auth/callback` route handler · `/trading/*` 서버 `redirect()` 가 막는다. 확인 완료). 네이티브 코드는 **하단 플로팅 탭바(홈·검색·트레이딩·AI·마이) · pull-to-refresh · 네이티브 Google Sign-In · 오프라인 폴백 · 테마/상태바 연동** 만 담당하고, 화면은 전부 웹이다. 참조 구현은 `/Users/alex/repos/weekly-wine-app`(Capacitor 8 Remote-URL 셸 · Swift `CookieViewController` · Kotlin `MainActivity`).

웹 쪽도 이 phase 에서 함께 바꾼다: 브랜드명 **GH Trade**(노출 문자열만) · 전용 `/search` 페이지 · `/me` 상단 계정 카드 · safe-area 대응 · Capacitor 감지 시 분기(사이드바 숨김 · ChatFab 숨김 · 네이티브 로그인 · refresh 훅 · 오버레이/테마 메시지). **웹 변경은 브라우저 사용자에게도 그대로 배포된다**(`/search`·계정 카드·이름 변경은 웹 기능이기도 하다).

**범위 밖:** 푸시 알림(v2 NOTF-*) · 스토어 제출/심사 자료 · 결제 · 딥링크/유니버설 링크 · 이메일/비번 로그인 · 웹 화면 자체의 재디자인(Phase 20 토스 테마는 그대로 씀).

**PROJECT.md 정정:** Out of Scope 「모바일 앱 — 웹 우선」은 이 phase 로 뒤집힌다. 계획 단계에서 PROJECT.md 의 해당 항목을 v1 요구사항(MOBILE-01)으로 옮긴다.

</domain>

<decisions>
## Implementation Decisions

### 아키텍처 (사전 확정 · 2026-09-25 사용자 4건)
- **D-01:** **Remote-URL 셸.** `capacitor.config.ts` `server.url = https://trade.jx1.io`, `webDir` 에는 오프라인 폴백 `index.html` 만. static export · 로컬 번들 없음. — **Reversibility:** costly — 번들 방식으로 바꾸려면 middleware·callback·redirect 를 클라이언트로 옮기는 웹 개편이 필요.
- **D-02:** **하단 플로팅 탭바는 네이티브**(iOS Swift `CAPBridgeViewController` 서브클래스 · Android Kotlin `BridgeActivity` 서브클래스). 웹에 탭바 컴포넌트를 만들지 않는다. weekly-wine 의 알약형 구조(좌우 16 · 높이 70 · radius 32 · 블러 배경 · 하단 페이드)를 출발점으로 삼되 색·모양은 **목업 검토(D-27)** 로 확정한다.
- **D-03:** **로그인 = 네이티브 Google Sign-In → Supabase `signInWithIdToken`.** Google 이 WebView OAuth 를 차단(`disallowed_userAgent`)하므로 앱에서는 `/login` 이 Capacitor 를 감지하면 기존 `signInWithOAuth` 대신 네이티브 플러그인(후보 `@capgo/capacitor-social-login`)으로 id_token 을 받아 `supabase.auth.signInWithIdToken({provider:'google', token, nonce})` 로 세션을 만든다. 세션은 브라우저 클라이언트가 만들므로 쿠키/`onAuthStateChange` 경로가 그대로 이어진다. UA 위장 방식은 채택하지 않는다. — **Reversibility:** costly — GCP OAuth 클라이언트(iOS·Android 2개)와 Supabase Google provider 「Authorized Client IDs」 등록이 선행 조건(사용자 콘솔 작업 · 계획에 사전 태스크로 명시).
- **D-04:** **pull-to-refresh = 네이티브 제스처 → 웹 훅.** iOS `UIRefreshControl` · Android `SwipeRefreshLayout` 이 제스처를 받아 `window.__ghTrade?.refresh?.()` 를 evaluate 한다. 페이지가 훅을 등록했으면 그 훅, 아니면 `location.reload()`. 웹은 전역 refresh 레지스트리(context) 하나로 페이지별 `refresh` 를 등록/해제한다(홈 `useHomeQuery.refresh` · 스캐너 `usePolling.refresh` · 테마 · 관심종목 · 종목상세 · `/search`).
- **D-05:** 네이티브 프로젝트는 **모노레포 `mobile/` 패키지**(`@gh-radar/mobile`, pnpm workspace 등록). `ios/` · `android/` · `capacitor.config.ts` · `resources/`(아이콘 원본) · `www/index.html`(오프라인 폴백) 이 여기 산다. Vercel ignore 스크립트(`scripts/vercel-ignore-build.sh`)는 `webapp/`·`packages/shared/`·lockfile 만 보므로 `mobile/` 변경은 웹 배포를 유발하지 않는다(lockfile 이 바뀌면 빌드는 되지만 무해).

### 탭 목적지와 앱 안 웹 셸
- **D-06:** 탭 5개 = **홈 `/` · 검색 `/search` · 트레이딩 `/trading` · AI `/chat` · 마이 `/me`.** 탭 탭(tap) = WebView 에 해당 경로 로드(같은 탭 재탭 = 그 경로로 다시 이동, 스크롤 최상단).
- **D-07:** **전용 `/search` 페이지 신설.** 상단 검색 입력(기존 `useDebouncedSearch` + GlobalSearch 결과 리스트 재사용, 선택 시 `/stocks/{code}`) + 아래에 **상승률 상위 `/scanner` · 테마 `/themes` · 관심종목 `/watchlist` 진입 카드**. 사이드바 「종목검색」 그룹의 3항목이 이 탭 하나로 이식된다. 웹 사이드바에도 「검색」 링크를 추가하되 기존 3항목은 유지(사이드바 재편은 범위 밖).
- **D-08:** **`/me` 상단에 계정 카드 추가 — 웹·앱 공통.** 아바타(Google `avatar_url` → 이니셜 폴백, `UserSection` 규칙 재사용) · 이름 · 이메일 · **테마 토글** · **로그아웃** 버튼. 그 아래 기존 MeClient(상태줄 → 전략 현황 → 계좌별 미체결·잔고). 사이드바 하단 `UserSection`/`ThemeToggle` 은 그대로 둔다.
- **D-09:** **앱에서도 헤더 햄버거 + 사이드바 드로어 유지**(웹과 동일). 단 **앱에서는 폭과 무관하게 고정 사이드바(`lg:block aside`)를 항상 숨기고** 드로어로만 연다 — iPad 가로에서 사이드바와 탭바가 같은 목적지를 두 곳에 두지 않기 위해. 햄버거는 앱에서 `lg` 이상에서도 표시.
- **D-10:** **AI 탭 = `/chat` 이동.** 앱에서는 **`ChatFab`(종목상세 우하단 플로팅) 숨김.** 종목 컨텍스트 대화는 종목상세 안 버튼(헤더 액션 줄에 「AI 물기」 → 기존 `ChatSheet` 열기)으로 연다. 웹은 FAB 그대로.
- **D-11:** **Capacitor 감지 = `window.Capacitor?.isNativePlatform?.()`** (Remote-URL 모드에서도 Capacitor 가 native-bridge 를 원격 페이지에 주입한다). 감지 시 `<html>` 에 `native-app` 클래스 + `data-native-platform="ios|android"` 를 붙이고, CSS/컴포넌트 분기는 이 클래스만 본다. weekly-wine 은 자체 `bridge.js` 가 원격 페이지에서 실행되지 않았음이 탐색에서 확인됐다 — **웹 코드가 스스로 감지**하는 이 방식을 쓴다(네이티브 주입 스크립트 의존 금지).

### 탭바 표시 규칙
- **D-12:** **숨김 = ① URL 이 `/login`·`/auth/*` ② 오프라인 폴백 화면 ③ 웹이 「오버레이 열림」 신호를 보낸 동안.** 오버레이 = 트레이딩 바텀시트·키패드 시트(Phase 20 `NumberPadSheet` 류) · shadcn `Sheet`(사이드바 드로어 · 모바일 하단 패널) · `Dialog`(주문 확인). 웹은 열림/닫힘을 네이티브에 메시지(`overlay: true|false`)로 보내고 네이티브는 150ms 지연 후 0.2s 페이드(weekly-wine `filterState` 방식). 채널: iOS `webkit.messageHandlers.ghTrade.postMessage` · Android `window.GhTradeBridge` (`addJavascriptInterface`). 웹은 두 채널을 감싼 `postNative(type, payload)` 하나만 쓴다.
- **D-13:** **탭바는 폭·기기와 무관하게 항상 표시**(iPad 가로 포함). 사이드바는 D-09 로 앱에서 항상 숨기므로 중복 내비가 없다.
- **D-14:** **활성 탭 = URL 경로 정확 매칭만.** 홈 `/` · 검색 `/search`,`/scanner`,`/themes`,`/watchlist` · 트레이딩 `/trading`(쿼리 무시) · AI `/chat` · 마이 `/me`. **그 외(종목상세 `/stocks/*` · 테마상세 `/themes/*` · 종목 뉴스/토론 하위 등)는 5탭 전부 비활성**(weekly-wine 방식). 판정은 iOS `webView.observe(\.url)` KVO · Android `onPageFinished`+`doUpdateVisitedHistory`(SPA `pushState` 도 잡히도록 웹이 `route` 메시지를 추가로 보낸다 — Next.js 클라 내비는 페이지 로드 이벤트를 내지 않는다).
- **D-15:** **아이콘 = 각 OS 기본** — iOS SF Symbols(`house`/`house.fill` · `magnifyingglass` · `chart.line.uptrend.xyaxis`/`.fill` 계열 · `sparkles` · `person.crop.circle`/`.fill`) · Android Material Icons(outlined ↔ filled). 활성 = filled 변형 + 강조색. 웹 lucide 와 다른 것을 허용.

### 새로고침 세부
- **D-16:** **`/trading` · `/me` 의 refresh 훅 = relay 재탐침 + 스냅샷 재요청.** `use-relay-socket` 의 resume probe(`RELAY_RESUME_PROBE_MS` 경로)를 강제 실행 — 소켓이 죽었으면 재연결, 살아 있으면 전략·잔고·미체결 스냅샷 재요청. 편집 중 상태(수동주문 입력)는 유지. `RelayProvider` 가 `probeNow()` 류 메서드를 노출한다.
- **D-17:** **스피너는 고정 1초 후 종료**(weekly-wine 방식). 훅의 Promise 완료 시점과 무관. reload 폴백도 같다.
- **D-18:** **종목상세 refresh = 시세·차트·통계 캐시 재조회만.** 뉴스·토론 섹션은 서버 캐시 재읽기(`GET`)만 하고 **외부 API 호출을 유발하는 경로(`POST /news/refresh`)는 부르지 않는다** — Naver 예산 · 크롤링 5원칙 · 「사용자 수에 비례하는 외부 호출 금지」 준수. 뉴스 수동 새로고침은 기존 버튼만.
- **D-19:** **오프라인 = 앱 내장 폴백 화면 + 자동 복구.** `mobile/www/index.html`: GH Trade 워드마크 · 「인터넷 연결을 확인해주세요 · 복구되면 자동으로 이동합니다」 · 「다시 시도」 버튼 · `online` 이벤트 + 5초 폴링으로 `server.url` 복귀(weekly-wine `www/index.html` 이식). 탭바 숨김(D-12 ②). 첫 로드 실패(`didFailProvisionalNavigation` / `onReceivedError` 메인프레임)에 이 페이지를 띄운다.

### 앱 정체성·시스템 연동
- **D-20:** **appId = `com.ghtrade.app`** (iOS 번들 ID = Android `applicationId`), **표시명 = `GH Trade`**(`appName` · `CFBundleDisplayName` · `strings.xml app_name`). — **Reversibility:** one-way — 스토어 게시 후 번들 ID 변경 불가.
- **D-21:** **브랜드명 변경은 노출 문자열만.** `layout.tsx` metadata title → `GH Trade`, 헤더 로고 텍스트 · `aria-label` · 로그인 카드 제목 「GH Trade에 로그인」 · `/design` 카탈로그 2곳. **`gh-radar:` 접두 localStorage 키 · `[gh-radar]` 콘솔 접두 · 패키지명 `@gh-radar/*` · 저장소명은 바꾸지 않는다**(저장된 사용자 설정 유실 방지). 테스트 픽스처의 `e2e@gh-radar.local` 도 유지.
- **D-22:** **아이콘·스플래시는 Claude 가 새로 그린다** — 레이더 모티프(현 `icon.svg` 동심원+스윕) 계승 + 「GH Trade」 워드마크, 바탕은 토스 다크 `#17171c`. 1024 아이콘 · 2732 스플래시(라이트 `#ffffff` / 다크 `#17171c`) SVG→PNG 를 `mobile/resources/` 에 두고 `@capacitor/assets generate` 로 양 플랫폼 배포. **시안 2개를 탭바 목업과 함께 제시해 사용자가 선택**(D-27). 웹 파비콘(`icon.svg`)도 같은 시안으로 교체.
- **D-23:** **테마 = 웹 토글을 네이티브가 따라간다.** 웹은 `next-themes` 해석 결과(`dark|light`)를 마운트 시와 변경 시 `postNative('theme', …)` 로 보낸다. 네이티브는 상태바 스타일(light/dark content) · WebView/뷰 배경색(라이트 `#ffffff` · 다크 `#17171c` = Phase 20 B 테마 `--bg`) · 탭바 팔레트를 전환하고 **마지막 값을 저장**(UserDefaults/SharedPreferences)해 다음 실행 첫 프레임부터 적용(깜빡임 방지). 앱은 OS 다크모드 설정을 보지 않는다(웹 `enableSystem=false` 와 일치).
- **D-24:** **회전: 폰 세로 고정, iPad 전방향.** iOS `UISupportedInterfaceOrientations` = Portrait only, `~ipad` = 4방향, `UIRequiresFullScreen` 없음(Split View 허용), `TARGETED_DEVICE_FAMILY = 1,2`. Android `screenOrientation`: 폰 `portrait`, 태블릿(sw600dp) `fullSensor` — 리소스 한정자(`values-sw600dp`)로 분기.
- **D-25:** **safe-area 는 웹이 책임진다.** `viewport-fit=cover` 추가(`viewport` export), 헤더 `padding-top: env(safe-area-inset-top)`, 하단 고정 요소 5곳(`dirty-action-bar` · `shared-panels` 모바일 하단 시트 · `chat-fab` · `alert-toasts` · `ui/sheet` bottom)에 `env(safe-area-inset-bottom)`. **앱에서는 본문 하단에 탭바 높이+여백(≈ 70 + 14 + inset)만큼 `padding-bottom`** 을 `html.native-app` 에서 준다(weekly-wine 은 카페24 CSS `padding-bottom:100px` 가 담당). WebView 는 `contentInsetAdjustmentBehavior = .never` + 상태바 아래부터 frame(weekly-wine 방식) 대신 **풀블리드 + 웹 safe-area** 로 간다 — 헤더 블러가 상태바 뒤까지 이어지는 토스식 표현.
- **D-26:** **Android 뒤로가기** = WebView `canGoBack` 이면 `goBack`, 아니면 홈 탭이 아닐 때 홈으로, 홈이면 앱 종료(weekly-wine 정책 이식). 오버레이 열림 상태면 웹에 `back` 메시지를 먼저 보내 시트를 닫게 한다.

### 목업 게이트 (필수 · 구현 전)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 참조 구현 (weekly-wine-app — 다른 저장소, 읽기 전용)
- `/Users/alex/repos/weekly-wine-app/capacitor.config.ts` — Remote-URL 셸 설정 원형(`server.url` · `allowNavigation` · 플러그인)
- `/Users/alex/repos/weekly-wine-app/ios/App/App/CookieViewController.swift` — 네이티브 탭바(`setupTabBar` 279~) · URL 관찰 활성 판정(`observeURL` 548~) · pull-to-refresh(`setupPullToRefresh` 659~) · JS 메시지 채널(`filterState`)
- `/Users/alex/repos/weekly-wine-app/android/app/src/main/java/kr/co/weeklywine/app/MainActivity.kt` — `BridgeActivity.load()` 오버라이드 · `SwipeRefreshLayout` 래핑(186~) · `AndroidBridge` JS 인터페이스 · 탭바(441~) · `onUrlChanged`(857~) · 뒤로가기 정책
- `/Users/alex/repos/weekly-wine-app/ios/App/App/Info.plist`, `ios/App/CapApp-SPM/Package.swift` — iPad 4방향 · SPM 의존 구조(CocoaPods 미사용)
- `/Users/alex/repos/weekly-wine-app/android/variables.gradle`, `android/app/build.gradle` — minSdk 24 · target 36 · splashscreen/swiperefreshlayout 의존
- `/Users/alex/repos/weekly-wine-app/www/index.html` — 오프라인 폴백(자동 복구) 원형
- `/Users/alex/repos/weekly-wine-app/docs/app-navigation-mockup.html` — 탭바 목업 형식 참고
- ⚠ weekly-wine `src/bridge.ts` 는 원격 페이지에서 실행되지 않는 것으로 탐색됨 — 따르지 말 것(D-11).

### 웹 쪽 정본
- `webapp/src/styles/globals.css` — 토큰 정본 · §2.2b 밴드 표(앱 셸은 뷰포트 브레이크포인트, `/trading` 안쪽은 컨테이너 쿼리 — 앱 분기도 이 원칙을 지킨다)
- `webapp/src/components/layout/app-shell.tsx`, `app-header.tsx`, `app-sidebar.tsx`, `user-section.tsx`, `theme-toggle.tsx` — 셸·헤더·사이드바(D-08 계정 카드 · D-09 사이드바 숨김 · D-21 로고 텍스트)
- `webapp/src/app/layout.tsx` — metadata title · `viewport`(D-21 · D-25)
- `webapp/src/app/login/page.tsx`, `webapp/src/lib/auth-context.tsx`, `webapp/src/lib/supabase/client.ts`, `webapp/src/app/auth/callback/route.ts` — 로그인 분기(D-03)
- `webapp/src/lib/relay-provider.tsx`, `webapp/src/lib/use-relay-socket.ts`(resume probe · `RELAY_RESUME_PROBE_MS`) — D-16 재탐침
- `webapp/src/hooks/use-polling.ts`, `use-home-query.ts`, `use-themes-query.ts`, `use-watchlist-query.ts` — 페이지별 `refresh` (D-04 레지스트리 연결점)
- `webapp/src/components/search/global-search.tsx`, `webapp/src/hooks/use-debounced-search.ts` — `/search` 재사용 원천(D-07)
- `webapp/src/components/chat/chat-fab.tsx`, `chat-sheet.tsx` — D-10
- `webapp/src/components/trading/dirty-action-bar.tsx`, `workbench/shared-panels.tsx`, `workbench/alert-toasts.tsx`, `ui/sheet.tsx` — D-25 safe-area 대상
- `webapp/src/app/icon.svg` — 현 파비콘(D-22 교체 대상)
- `.planning/sketches/004-native-tab-bar/index.html`, `README.md` — **채택 정본(2026-09-25)**: 탭바 A 알약 수치 · 아이콘 A 다크 레이더 SVG(`#app-a`) · 화면별 활성/숨김 시연
- `.planning/sketches/themes/toss-dark.css`, `toss-light.css`, `.planning/sketches/MANIFEST.md` — 목업 토큰(스케치 004 가 상속)

### 운영·정책
- `CLAUDE.md` §「Naver Search API Rate Limit」 · 「공식 API 운영 기준」 · 크롤링 5원칙 — D-18 의 근거(사용자 트리거 외부 호출 금지)
- `scripts/vercel-ignore-build.sh`, `webapp/vercel.json` — `mobile/` 변경이 웹 배포를 유발하지 않음(D-05)
- `webapp/README.md` §환경변수 — `NEXT_PUBLIC_SUPABASE_URL` 등 변수명(값은 읽지 않는다)
- `.planning/PROJECT.md` — Out of Scope 「모바일 앱」 정정 대상

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GlobalSearch` + `useDebouncedSearch`(300ms) + `router.push('/stocks/{code}')` — `/search` 페이지 본문으로 그대로 재사용 가능. 결과 리스트(`CommandItem`)만 페이지 레이아웃으로 옮긴다.
- `UserSection` 의 아바타 폴백 체인(`avatar_url` → 이니셜) · `useAuth().signOut`(하드 리다이렉트 `/login`) · `ThemeToggle` — `/me` 계정 카드 구성 요소.
- `usePolling(...).refresh` · `useHomeQuery.refresh(load)` · `useThemesQuery` · `useWatchlistQuery` — 전역 refresh 레지스트리에 등록만 하면 된다.
- `use-relay-socket.ts` 의 resume probe(`probeTimer`/`probeAlive` · `restart()`) — D-16 은 이 내부 함수를 공개 메서드로 노출하는 최소 변경.
- `next-themes` `useTheme().resolvedTheme` — D-23 메시지 원천.
- `webapp/src/app/icon.svg` 레이더 모티프 — 아이콘 시안 출발점.
- weekly-wine `CookieViewController.swift` / `MainActivity.kt` — 탭바·refresh·URL 관찰·뒤로가기 코드를 GH Trade 이름·경로·팔레트로 이식(결제/챗/쿠키 복원 코드는 제외).

### Established Patterns
- 인증: Supabase `@supabase/ssr` 쿠키 세션 + middleware 가드(공개 경로 `/login`,`/auth` 만). 클라이언트 `createBrowserClient` 로 `signInWithIdToken` 하면 같은 쿠키 저장소에 세션이 써져 middleware·`onAuthStateChange` 가 그대로 동작한다.
- 백엔드 호출은 절대 URL(`NEXT_PUBLIC_API_BASE_URL` Cloud Run · `NEXT_PUBLIC_RELAY_WS_URL` wss) + `Authorization: Bearer` — WebView origin 이 `https://trade.jx1.io` 그대로라 CORS 변경 불필요.
- 테마: `attribute="class"` `.dark` · `enableSystem=false` · 기본 light. `themeColor` 메타는 OS `prefers-color-scheme` 을 보는 별개 값(앱은 D-23 메시지 사용).
- 반응형: 앱 셸은 Tailwind 기본 브레이크포인트(`lg` 1024 에서 사이드바), `/trading` 내부는 컨테이너 쿼리 §2.2b. `html.native-app` 분기는 셸 층(사이드바·FAB·하단 여백)에만 둔다.
- `position: fixed` 하단 요소는 컨테이너 쿼리 조상 함정 때문에 이미 `document.body` 포털을 쓴다(DirtyActionBar) — safe-area 패딩도 포털 요소에 건다.
- 이 저장소에서 `git push` = webapp 프로덕션 배포(Vercel). 웹 변경(이름·`/search`·계정 카드·safe-area)은 push 즉시 사용자에게 노출된다 — 목업 게이트와 로컬 검증 뒤 push.

### Integration Points
- `webapp/src/app/layout.tsx` — `viewport` 에 `viewportFit: 'cover'`, `<html>` 클래스 부착용 클라이언트 컴포넌트(`NativeBridgeProvider`: 감지 · `postNative` · 테마/라우트/오버레이 메시지 · refresh 레지스트리 · `window.__ghTrade`) 마운트.
- `AppShell` — `native-app` 이면 고정 `aside` 숨김 + 햄버거 상시. `ChatFab` — `native-app` 이면 `null`.
- `ui/sheet.tsx` · `dialog.tsx` · Phase 20 시트 — 열림 상태를 `postNative('overlay', …)` 로 보고(`onOpenChange` 훅 한 곳).
- `login/page.tsx` — `handleGoogleLogin` 에서 `native-app` 분기.
- `mobile/` — 새 pnpm 패키지. `pnpm-workspace.yaml` 에 `mobile` 추가. 루트 `typecheck`/`build` 스크립트(`pnpm -r`)가 `mobile` 을 건드리지 않도록 `mobile/package.json` 에 해당 스크립트를 두지 않거나 no-op.
- e2e/단위 테스트: `app-sidebar.test.tsx` 등 로고 텍스트 `gh-radar` 단언 → `GH Trade` 갱신 필요. `e2e/specs/home.spec.ts` 셸 불변식(헤더·본문 패딩 일치)은 safe-area 패딩 추가 후에도 통과해야 한다.

</code_context>

<specifics>
## Specific Ideas

- 「weekly-wine-app 을 참고」 — 사용자가 명시한 레퍼런스. 탭바 알약형 · 네이티브 refresh · 오프라인 폴백 · iPad 4방향 은 그대로 계승, 결제·챗·쿠키 복원·`bridge.js` 는 가져오지 않는다.
- 이름은 「GH Trade」 — 웹·앱 타이틀만 바꾸면 된다는 사용자 판단(D-21).
- 메뉴 5개 순서 고정: 홈 / 검색 / 트레이딩 / AI / 마이페이지.
- 아이폰 · 안드로이드 · 아이패드 모두 지원(D-20 · D-24).

</specifics>

<deferred>
## Deferred Ideas

- **푸시 알림**(상한가 근접·관심종목 급등 — v2 NOTF-01/02). weekly-wine 의 `@capacitor/push-notifications` 골격은 참고만.
- **딥링크 / 유니버설 링크**(`trade.jx1.io/stocks/…` → 앱) — 스토어 배포 뒤 별도 phase.
- **스토어 제출 · fastlane · 서명 자동화** — 이 phase 는 로컬 빌드·실기기 설치까지.
- **사이드바 IA 재편**(「종목검색」 그룹을 `/search` 로 완전 대체) — 이번엔 링크 추가만.
- **AI 탭이 종목 컨텍스트 이어받기**(`/chat?code=`) — D-10 대안으로 기각, 필요 시 재논의.
- **웹(브라우저 모바일)에도 하단 탭바** — 네이티브 전용으로 확정, 웹 탭바는 별도 논의.

</deferred>

---

*Phase: 21-gh-trade-mobile-app*
*Context gathered: 2026-09-25*
