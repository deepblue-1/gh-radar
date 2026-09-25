# Phase 21: GH Trade 모바일 앱 (Capacitor) - Pattern Map

**Mapped:** 2026-09-25
**Files analyzed:** 44 (new 27 · modified 17)
**Analogs found:** 39 / 44

> 경로 규칙: `webapp/src/...` = gh-radar(추적 소스). `weekly-wine:` 접두 = 형제 저장소 `/Users/alex/repos/weekly-wine-app`(**읽기 전용** · 해당 저장소 git 추적 확인됨). 네이티브 파일은 weekly-wine 을 **그대로 복사하지 말 것** — RESEARCH Pitfall 1·3·4·5(SceneDelegate · BridgeWebViewClient · onBackPressedDispatcher · errorPath 금지)가 원형보다 우선한다.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| **웹 — 신규** | | | | |
| `webapp/src/lib/native/native-detect.ts` | utility (inline script) | transform | `app/layout.tsx` `suppressHydrationWarning` + next-themes 클래스 주입 방식 | partial |
| `webapp/src/lib/native/post-native.ts` | utility | event-driven (web→native) | weekly-wine `filterState` 메시지 핸들러(수신측) · RESEARCH Pattern 4 코드 | partial |
| `webapp/src/lib/native/native-bridge-provider.tsx` | provider | event-driven / pub-sub | `lib/auth-context.tsx` (context + EMPTY 폴백) · `lib/relay-provider.tsx` (useMemo value, Provider 밖 no-op) | exact(role) |
| `webapp/src/lib/native/use-native-refresh.ts` | hook | event-driven | `lib/relay-provider.tsx` `useRelaySubscription`(등록/해제 참조계수) | role-match |
| `webapp/src/lib/native/native-overlay-marker.tsx` | component (marker) | event-driven | 동일 모듈 참조계수 · `ui/sheet.tsx` Content 마운트 수명 | partial |
| `webapp/src/lib/native/native-google-login.ts` | service | request-response | `app/login/page.tsx` `handleGoogleLogin`(L54-60) | role-match |
| `webapp/src/app/search/page.tsx` | page | request-response | `app/watchlist/page.tsx` | exact |
| `webapp/src/components/search/search-page-client.tsx` (명칭 재량) | component | request-response | `components/search/global-search.tsx` + `hooks/use-debounced-search.ts` | exact |
| `webapp/src/lib/recent-search.ts` (재량 · `gh-radar:recent-search`) | utility | file-I/O (localStorage) | `lib/breakout-list.ts` `readDatedSet/writeDatedSet` (L70-95) | exact |
| `webapp/src/components/me/account-card.tsx` | component | request-response | `components/layout/user-section.tsx` + `components/layout/theme-toggle.tsx` | exact |
| `webapp/src/lib/native/__tests__/*.test.ts(x)` (4개) | test | — | `lib/__tests__/relay-provider.test.tsx` | exact |
| `webapp/src/components/stock/__tests__/stock-native-refresh.test.tsx` | test | — | `lib/__tests__/relay-provider.test.tsx` (vi.mock 패턴) | role-match |
| `webapp/e2e/fixtures/native-app.ts` | test fixture | — | `e2e/fixtures/home.ts`/`mock-api.ts` (page 준비 헬퍼) | role-match |
| `webapp/e2e/specs/native-shell.spec.ts` · `search-page.spec.ts` | e2e | — | `e2e/specs/me.spec.ts` · `search.spec.ts` · `home.spec.ts` | exact |
| **웹 — 수정** | | | | |
| `webapp/src/app/layout.tsx` | layout/config | — | 자기 자신 (Provider 중첩 L47-70) | — |
| `webapp/src/lib/use-relay-socket.ts` (`probeNow`) | hook | streaming | 자기 자신 `onResume` L1534 · `reconnect` L480 | — |
| `webapp/src/lib/relay-provider.tsx` (`probeNow` 노출) | provider | streaming | 자기 자신 `EMPTY_RELAY_VALUE.reconnect: NOOP` L366 | — |
| `webapp/src/lib/__tests__/relay-socket.test.ts` (probeNow 케이스) | test | — | 같은 파일 기존 resume 케이스 | exact |
| `webapp/src/hooks/use-polling.ts` 소비처 `components/scanner/scanner-client.tsx` | component | request-response | `scanner-client.tsx` L44-72 `refresh` | — |
| `webapp/src/hooks/use-home-query.ts` 소비처(홈 클라이언트) | component | request-response | `use-home-query.ts` L192 `refresh: load` | — |
| `webapp/src/components/stock/stock-detail-client.tsx` | component | request-response | 자기 자신 `load` L71-99 | — |
| 테마·관심종목 클라이언트 (`components/watchlist/watchlist-client.tsx`, 테마 목록) | component | request-response | `scanner-client.tsx` 등록 방식과 동일 | role-match |
| `webapp/src/components/ui/sheet.tsx` · `ui/dialog.tsx` · `number-pad-sheet.tsx` | component (primitive) | event-driven | `sheet.tsx` `SheetContent` L55-80 | — |
| `webapp/src/app/login/page.tsx` | page | request-response | 자기 자신 L54-67 | — |
| `webapp/src/app/me/page.tsx` | page | — | 자기 자신 (AccountCard 삽입) | — |
| `webapp/src/components/layout/app-header.tsx` · `app-shell.tsx` | component | — | `app-shell.tsx` L63 aside · `app-header.tsx` L72 햄버거 `lg:hidden` | — |
| `webapp/src/components/layout/app-sidebar.tsx` (「검색」 링크) | component | — | `NAV_SEARCH_GROUP` L88-94 · 렌더 L379-392 | — |
| `webapp/src/components/chat/chat-fab.tsx` | component | — | L118 `fixed right-6 bottom-6` | — |
| 하단 고정 바 4곳 (`dirty-action-bar.tsx:104` · `shared-panels.tsx:248` · `stock-detail-tabs.tsx:219` · `alert-toasts.tsx:58`) | component (CSS) | — | `globals.css:650` `body:has(...)` 규칙 | exact |
| `webapp/src/styles/globals.css` (`@custom-variant native`, `--native-tabbar-reserve`) | config (CSS) | — | `globals.css:5` `@custom-variant dark` | exact |
| 브랜드 문자열 (`layout.tsx:15` · `app-header.tsx:27,79,83` · `login/page.tsx:67` · `design/page.tsx:22,41` · `design/_sections/layouts.tsx:14,43`) | config | — | — (문자열 치환) | — |
| `webapp/src/app/icon.svg` | asset | — | 스케치 004 `#app-a` (L216-225) | exact |
| **모노레포 설정** | | | | |
| `pnpm-workspace.yaml` | config | — | 자기 자신 packages 목록 | — |
| root `package.json` | config | — | 자기 자신 L4-8 (`pnpm -r run build/typecheck`) | — |
| `scripts/vercel-ignore-build.sh` | config | — | 변경 불필요 확인(L22) | — |
| **네이티브 — 신규 (`mobile/`)** | | | | |
| `mobile/package.json` | config | — | weekly-wine `package.json` scripts | role-match |
| `mobile/capacitor.config.ts` | config | — | weekly-wine `capacitor.config.ts` | exact |
| `mobile/tsconfig.json` | config | — | weekly-wine `tsconfig.json` | exact |
| `mobile/www/index.html` | static page | request-response (복귀 폴링) | weekly-wine `www/index.html` (61줄) | exact |
| `mobile/ios/App/App/SceneDelegate.swift` | native entry | — | **없음** (weekly-wine 은 AppDelegate+storyboard 세대) → RESEARCH Pattern 1 | none |
| `mobile/ios/App/App/GHTradeBridgeViewController.swift` | native controller | event-driven | weekly-wine `CookieViewController.swift` | exact |
| `mobile/ios/App/App/NavigationDelegateProxy.swift` | native delegate | event-driven | weekly-wine `PaymentNavigationDelegate` L840-889 | exact |
| `mobile/android/.../MainActivity.kt` | native controller | event-driven | weekly-wine `MainActivity.kt` | exact |
| `mobile/android/.../GhTradeWebViewClient.kt` | native delegate | event-driven | weekly-wine `observeURL` L725-745 (**반면교사** — 교체 대신 상속) | partial |
| `mobile/android/app/src/main/res/drawable/ic_tab_*.xml` · `values/strings.xml` · `values(-sw600dp)/bools.xml` · `variables.gradle` | resource | — | weekly-wine `res/drawable/ic_tab_home(_fill).xml` 등 · `android/variables.gradle` | exact |
| `mobile/resources/*` + `mobile/scripts/render-resources.mjs` | asset/script | batch | 없음 (Playwright 스크린샷 스크립트 신규) | none |

## Pattern Assignments

### `webapp/src/lib/native/native-bridge-provider.tsx` (provider, event-driven)

**Analog:** `webapp/src/lib/auth-context.tsx` + `webapp/src/lib/relay-provider.tsx`

**Context + Provider 밖 no-op 폴백** (auth-context.tsx L13-32) — 같은 모양으로 `EMPTY` 값을 두고 `useContext(...) ?? EMPTY`:
```tsx
const NOOP_SIGN_OUT = async () => { /* Provider 바깥 기본 no-op */ };
const EMPTY: AuthState = { user: null, displayName: null, isLoading: false, signOut: NOOP_SIGN_OUT };
const AuthContext = createContext<AuthState | null>(null);
```
**value 메모 + React 19 `<Context value>` 구문** (relay-provider.tsx L450-468):
```tsx
const value = useMemo<RelayContextValue>(() => ({ ...connection, sendOrder, orderLocks }), [connection, sendOrder, orderLocks]);
return <RelayContext value={value}>{children}</RelayContext>;
...
export function useRelayContext(): RelayContextValue {
  return useContext(RelayContext) ?? EMPTY_RELAY_VALUE;
}
```
- `probeNow` 도 이 EMPTY 에 `NOOP` 로 추가해야 Provider 없는 테스트가 throw 하지 않는다(relay-provider.tsx L366 `reconnect: NOOP` 옆).
- 테마 메시지는 `useTheme().resolvedTheme` — `theme-toggle.tsx` L20-27 의 mounted 가드 그대로 사용(하이드레이션 전 값 전송 금지).
- 마운트 위치: `app/layout.tsx` — `ThemeProvider` 안(useTheme 필요) · `AuthProvider`/`RelayProvider` 와 같은 레벨에서 `children` 을 감싼다. `usePathname()` 을 쓰므로 `'use client'`.

---

### `webapp/src/lib/native/native-detect.ts` + `app/layout.tsx` 수정

**Analog:** `webapp/src/app/layout.tsx` L41-47
```tsx
<html lang="ko" suppressHydrationWarning className={`${pretendard.variable} ${geistMono.variable}`}>
  <body>
    <ThemeProvider>
```
- `suppressHydrationWarning` 이 이미 있으므로 `<head><script dangerouslySetInnerHTML={{__html: NATIVE_DETECT_SCRIPT}} /></head>` 를 `<body>` 앞에 추가(RESEARCH Pattern 4).
- metadata `title: 'gh-radar'`(L15) → `'GH Trade'`. `viewport` 에 `viewportFit: 'cover'` 추가 시 Pitfall 14(모든 브라우저 적용) 검토.

**CSS 변형 analog:** `webapp/src/styles/globals.css` L5
```css
@custom-variant dark (&:where(.dark, .dark *));
```
→ 바로 아래 `@custom-variant native (&:where(.native-app, .native-app *));`

---

### `webapp/src/lib/native/use-native-refresh.ts` 및 소비처

**소비처 excerpt 1 — 스캐너** (`components/scanner/scanner-client.tsx` L44-72):
```tsx
const { data, error, refresh, isRefreshing, isInitialLoading } =
  usePolling(fetcher, { intervalMs: AUTO_REFRESH_INTERVAL_MS, key, cacheKey: `scanner:${key}` });
...
const handleRefresh = useCallback(() => { void refresh(); }, [refresh]);
```
→ `useNativeRefresh(refresh)` 한 줄 추가. `usePolling.refresh` 는 이미 `useCallback`(use-polling.ts L121-123)이라 안정 참조.

**소비처 2 — 홈:** `hooks/use-home-query.ts` L192 `return { data, isLoading, isRefreshing, error, refresh: load };` → 홈 클라이언트에서 `useNativeRefresh(refresh)`.

**소비처 3 — 종목상세 (D-18):** `components/stock/stock-detail-client.tsx` L71-99 `load` (AbortController + `fetchStockDetail`) 를 등록. 뉴스/토론은 `GET` 재조회만 — `POST /news/refresh` 호출 경로를 등록 함수에 넣지 말 것(MOBILE-01l 테스트가 fetch spy 로 단언).

**소비처 4 — `/trading`·`/me` (D-16):** `useNativeRefresh(useRelayContext().probeNow)`.

---

### `webapp/src/lib/use-relay-socket.ts` — `probeNow()` 추가 (streaming)

**Analog:** 같은 파일 L1498-1541 (effect 내부 클로저)
```ts
const onResume = (probe: boolean) => {
  if (disposed) return;
  if (exhausted || retryTimer !== null) { restart(); return; }
  if (probe) startProbe();
};
```
- `onResume` 은 effect 지역 클로저 → `probeNowRef = useRef<() => void>(NOOP)` 를 두고 effect 안에서 `probeNowRef.current = () => onResume(true)`, cleanup 에서 `NOOP` 로 복원. 반환 인터페이스(L480 `reconnect: () => void;` 옆)에 `probeNow: () => void` 추가 + 안정 `useCallback(() => probeNowRef.current(), [])`.
- 이벤트 리스너 등록 패턴(L1553-1561 `visibilitychange/pageshow/online`)과 같은 경로를 쓰므로 relay 프로토콜 무변경(Pitfall 11).
- 테스트: `lib/__tests__/relay-socket.test.ts` 기존 resume/probe 케이스(가짜 WebSocket + fake timers)를 복제해 `-t probeNow` 3케이스.

---

### `webapp/src/lib/native/native-overlay-marker.tsx` + `ui/sheet.tsx`·`ui/dialog.tsx` 수정

**삽입 지점:** `components/ui/sheet.tsx` L55-80 `SheetContent`
```tsx
return (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content data-slot="sheet-content" data-side={side} className={cn(...)} {...props}>
      {/* ← 여기 children 앞에 <NativeOverlayMarker /> */}
```
- `DialogContent`(ui/dialog.tsx) · `number-pad-sheet.tsx` 의 `Dialog.Content` 에 동일. 마커 = `useEffect(() => { inc(); return dec; }, [])` — `onOpenChange` 훅킹 금지(Pattern 8: AppShell 이 `open` prop 을 직접 바꿈).

---

### `webapp/src/lib/native/native-google-login.ts` + `app/login/page.tsx` 수정

**Analog:** `app/login/page.tsx` L26-31 (에러 코드 맵), L54-60
```tsx
const ERROR_MESSAGES: Record<string, string> = {
  "auth_failed": "로그인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
  "oauth_denied": "Google 로그인을 취소하셨습니다. 계속하려면 다시 시도해주세요.",
  ...
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    queryParams: { prompt: "select_account" },
  },
});
```
- `isNativeApp()` 분기에서 `nativeGoogleSignIn(supabase)` → 성공 `window.location.replace(safeNext)`; 취소 → `oauth_denied`, 기타 → `auth_failed` (기존 맵 재사용, 새 문구 만들지 않음). 본체는 RESEARCH Pattern 7 코드를 그대로.
- 하드 내비 선례: `auth-context.tsx` signOut `window.location.href = "/login"`.
- L67 `gh-radar에 로그인` → `GH Trade에 로그인`.

---

### `webapp/src/app/search/page.tsx` (page)

**Analog:** `app/watchlist/page.tsx` (전문)
```tsx
'use client';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { WatchlistClient } from '@/components/watchlist/watchlist-client';
export default function WatchlistPage() {
  return (<AppShell sidebar={<AppSidebar />}><WatchlistClient /></AppShell>);
}
```
→ 본문은 `SearchPageClient` 로 분리. middleware 보호 대상인지 확인(watchlist 는 보호 — `/search` 는 공개 검색이면 불필요).

### `webapp/src/components/search/search-page-client.tsx` (component, request-response)

**Analog:** `components/search/global-search.tsx` L33-100 + `hooks/use-debounced-search.ts`
```tsx
const { results, loading, error } = useDebouncedSearch(query, 300);
const handleSelect = useCallback((code: string) => { setOpen(false); setQuery(''); router.push(`/stocks/${code}`); }, [router]);
const trimmed = query.trim();
const showInitial = trimmed.length === 0;
const showEmpty = !loading && !error && trimmed.length > 0 && results.length === 0;
```
- 카피 재사용: 「검색 중…」 · 「검색에 실패했습니다. 잠시 후 다시 시도해 주세요.」 · `"{query}" 에 해당하는 종목이 없습니다`.
- 결과 행: `{s.name}` · `mono` 코드 · `<Badge variant="outline">{s.market}</Badge>` (L83-91) — D-07a 는 52 행 + 현재가/등락률 추가.
- `cmdk` 불필요(페이지 인라인 리스트). placeholder 는 D-07a 「종목명 또는 코드」.
- 「지금 상승률 상위」 5행: scanner fetcher 1회 호출(`scanner-client.tsx` 의 `fetcher` 모양 참조) — `usePolling` 쓰지 말 것(자동 폴링 없음). refresh 는 `useNativeRefresh` 로 등록.
- 진입 타일 3개 링크·아이콘은 `app-sidebar.tsx` L88-94 `NAV_SEARCH_GROUP`(TrendingUp·Layers·Star) 을 재사용.

### `webapp/src/lib/recent-search.ts` (utility, localStorage)

**Analog:** `lib/breakout-list.ts` L70-95 — `typeof window === "undefined"` 가드 + try/catch 「저장 실패가 화면 동작을 막지 않는다」 + JSON 파싱 후 타입 필터. 키는 기존 `gh-radar:` 접두 규약(`BREAKOUT_TONE_KEY = "gh-radar:breakout-tone"` L35) → `gh-radar:recent-search`, 최대 10.

---

### `webapp/src/components/me/account-card.tsx` (component)

**Analog:** `components/layout/user-section.tsx` L30-69 (아바타 폴백 체인 — 그대로 이식)
```tsx
const { user, displayName, signOut } = useAuth();
const [imgError, setImgError] = useState(false);
if (!user) return null;
const email = user.email ?? "";
const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
const initial = (email[0] ?? "?").toUpperCase();
const name = displayName ?? "사용자";
const showImage = Boolean(avatarUrl) && !imgError;
// eslint-disable-next-line @next/next/no-img-element
<img src={avatarUrl} alt="" onError={() => setImgError(true)} className="... rounded-full object-cover" aria-hidden="true" />
```
- 로그아웃: `onClick={() => { void signOut(); }}` + `aria-label="로그아웃"` (L101-107).
- 테마 버튼: `ThemeToggle`(theme-toggle.tsx) 의 `className` 구멍으로 40×40 radius 12 `--raised` 적용하거나 같은 mounted 가드 로직 복제. D-08a 는 `aria-label="테마 전환"` 고정 — 기존 `LABELS` 와 다르므로 prop 추가 또는 자체 버튼.
- 삽입: `app/me/page.tsx` 에서 `<AppShell>` 안 `<AccountCard />` 뒤 16 여백 후 `<MeClient />`.

---

### 셸 앱 분기 — `app-shell.tsx` · `app-header.tsx` · `chat-fab.tsx` (D-09·D-10)

- `app-shell.tsx:63` aside `hidden ... lg:block` → `native:lg:hidden` 추가.
- `app-header.tsx:72` 햄버거 `lg:hidden` → `native:lg:inline-flex` 추가. L79 `aria-label="gh-radar 홈"` · L83 텍스트 → GH Trade.
- `chat-fab.tsx:118` → `native:hidden`. 종목상세 헤더에 「AI 분석」 버튼(기존 ChatSheet 열기 — `chat-fab.tsx` `handleClick` 과 같은 `useChat` 호출).

### 하단 고정 바 (Pitfall 10)

**Analog:** `styles/globals.css` L650-654 (본문 상태에 따라 고정 요소 위치를 올리는 선례)
```css
@media (max-width: 767.98px) {
  body:has([data-slot="detail-order-cta-bar"]) [data-slot="chat-fab"] {
    bottom: calc(70px + max(20px, env(safe-area-inset-bottom, 0px)));
  }
}
```
→ 같은 방식으로 `html.native-app [data-slot="detail-order-cta-bar"|"dirty-action-bar"|...] { bottom: var(--native-tabbar-reserve); padding-bottom: ... }`. 대상 선택자는 이미 있는 `data-slot`(`dirty-action-bar`, `detail-order-cta-bar`) 사용. `shared-panels.tsx:248` 은 data-slot 확인 후 없으면 추가. 컴포넌트 파일 수정보다 globals.css 규칙 한 곳에 모으는 것이 선례와 일치.

### 사이드바 「검색」 링크

`app-sidebar.tsx` L86 `NAV_HOME` 옆에 `const NAV_SEARCH_PAGE: NavLeaf = { href: "/search", label: "검색", icon: Search };` 를 두고 L379-381 홈 `<li>` 바로 다음에 같은 `<li><NavLink item=... active={isActive(...)} /></li>`. 기존 3항목 유지. 테스트 `components/layout/__tests__/app-sidebar.test.tsx` 갱신.

### `webapp/src/app/icon.svg`

현재(32 viewBox, `#0a0a0a` 바탕 동심원 2 + 스윕 선) → 스케치 `.planning/sketches/004-native-tab-bar/index.html` L216-225 `<symbol id="app-a" viewBox="0 0 1024 1024">` 본문을 독립 `<svg viewBox="0 0 1024 1024">` 로 옮긴다(`#17171c` · `#f04452` 그라데이션 스윕 · stroke 42). 같은 SVG 가 `mobile/resources/icon.svg` 원본.

---

### 테스트 — `webapp/src/lib/native/__tests__/*`

**Analog:** `lib/__tests__/relay-provider.test.tsx` L1-40
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getSession: () => getSessionMock() } }) }));
```
- 상단 주석에 「깨졌을 때 사용자가 겪는 일」 번호 목록을 두는 관례 유지. `next/navigation`(`usePathname`/`useRouter`)·`next-themes` 는 `vi.mock`. `window.webkit.messageHandlers.ghTrade.postMessage` 를 `vi.fn` 으로 심고 **실제 송신 배열**을 단언(relay-provider 테스트의 「실제 송신 프레임 배열」 원칙).

### e2e — `e2e/fixtures/native-app.ts` · `specs/native-shell.spec.ts` · `specs/search-page.spec.ts`

- 픽스처 모양: `e2e/fixtures/home.ts` 의 `mockHomeApi(page, ...)` 처럼 `installNativeApp(page, { platform })` 헬퍼 → `page.addInitScript` 로 가짜 `window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }` + `webkit.messageHandlers.ghTrade.postMessage` 가 `window.__nativeMsgs` 배열에 push.
- spec import 관례: `me.spec.ts` L1-13 (`@playwright/test` + `../fixtures/*`). relay 가 필요 없는 셸 검증은 `mockHomeApi`/`mockStockApi` 만 사용. 기존 `search.spec.ts`(⌘K) 와 파일명 충돌 없도록 `search-page.spec.ts`.
- baseURL :3100 (dev.sh 기준).

---

### `mobile/capacitor.config.ts`

**Analog:** weekly-wine `capacitor.config.ts`
```ts
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'kr.co.weeklywine.app', appName: '위클리와인', webDir: 'www',
  server: { url: 'https://weeklywine.co.kr', cleartext: false, allowNavigation: [...] },
  plugins: { SplashScreen: { launchShowDuration: 0 }, ... },
  ios: { allowsLinkPreview: false, scrollEnabled: true },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};
export default config;
```
→ `appId: 'com.ghtrade.app'`, `appName: 'GH Trade'`, `server.url` = env 로 dev 전환(Pitfall 15 — 운영 기본값), `allowNavigation` 에 Supabase 도메인만, **`server.errorPath` 넣지 않음**(D-19), `SocialLogin` 플러그인 설정. 상세는 RESEARCH Pattern 9.

### `mobile/package.json`

**Analog:** weekly-wine `package.json` scripts (`cap:sync`, `cap:ios`, `cap:android`) → 이름을 `native:sync`, `native:sync:dev`, `native:build:ios`, `native:build:android`, `native:assets` 로. **`build`/`typecheck` 스크립트 금지** — root `package.json` L5-6 `pnpm -r run build`/`typecheck` 가 집어 감. `name: "@gh-radar/mobile"`, `private: true`. `@capacitor/app` 은 넣지 않음(Pitfall 12; weekly-wine 은 넣었음).

### `pnpm-workspace.yaml` · `scripts/vercel-ignore-build.sh`

- `packages:` 목록(`webapp`,`server`,`relay`,`workers/*`,`packages/*`)에 `- mobile` 추가. `allowBuilds`/`onlyBuiltDependencies` 는 capacitor 가 postinstall 빌드를 요구하면 양쪽 모두에 추가(파일 주석: 두 키 동시 유지).
- `vercel-ignore-build.sh` L22 `git diff --quiet "$PREV" "$CUR" -- webapp/ packages/shared/ pnpm-lock.yaml` → **변경 불필요**(mobile/ 미포함 확인).

### `mobile/www/index.html` (오프라인 폴백)

**Analog:** weekly-wine `www/index.html` L45-56
```html
<button class="retry-btn" onclick="location.href='https://weeklywine.co.kr'">다시 시도</button>
window.addEventListener('online', function() { location.href = 'https://weeklywine.co.kr'; });
setInterval(function() { ... location.href = 'https://weeklywine.co.kr'; }, 5000);
```
→ 보강: 이동 전 `fetch('https://trade.jx1.io/icon.svg', {mode:'no-cors', cache:'no-store'})` 성공 확인 · `?to=` 가 `https://trade.jx1.io/` 접두일 때만 복귀(오픈 리다이렉트 방지) · `&theme=` 로 색 결정.

### `mobile/ios/App/App/GHTradeBridgeViewController.swift`

**Analog:** weekly-wine `ios/App/App/CookieViewController.swift`
- 클래스/생명주기 (L5, L75-90):
```swift
class CookieViewController: CAPBridgeViewController, WKScriptMessageHandler {
  override func capacitorDidLoad() {
    super.capacitorDidLoad()
    webView?.scrollView.contentInsetAdjustmentBehavior = .never
    webView?.configuration.userContentController.add(self, name: "filterState")
    setupPullToRefresh(); setupTabBar()
```
→ 핸들러 이름 `ghTrade` 하나, body 는 JSON 문자열 `{type,payload}` 파싱해 `overlay`/`route`/`theme` 분기.
- 오버레이 숨김 애니메이션 (L192-215 `filterState`): alpha 0.2s 페이드 후 `isHidden` — D-12 는 **150ms 지연**(`DispatchWorkItem`, 원본의 `hideTabBarWork` 필드 L26 재사용 아이디어) 추가.
- 탭바 (L279-330): shadow 컨테이너 + `GradientBlurView` 페이드 + pill(`cornerRadius 32`, 좌우 16, 높이 70). 수치는 D-27a(바닥 여백 20 · iPad 560 가운데)로 교체, 색은 `theme` 메시지로 다크/라이트.
- URL 관찰 (L548-551): `urlObservation = webView?.observe(\.url, options: [.new])` → path 로 D-14 활성 탭 판정. 챗/결제 분기(L553-575)는 가져오지 않음.
- 당겨서 새로고침 (L659-676):
```swift
let refresh = UIRefreshControl()
refresh.addTarget(self, action: #selector(handleRefresh(_:)), for: .valueChanged)
webView.scrollView.refreshControl = refresh
@objc private func handleRefresh(_ sender: UIRefreshControl) {
  webView?.reload()
  DispatchQueue.main.asyncAfter(deadline: .now() + 1) { sender.endRefreshing() }
}
```
→ `reload()` 대신 `evaluateJavaScript("window.__ghTrade&&window.__ghTrade.refresh?window.__ghTrade.refresh():location.reload()")`, 1초 고정(D-17) 유지. 오버레이 열림 중 `refreshControl` 비활성.

### `mobile/ios/App/App/NavigationDelegateProxy.swift`

**Analog:** weekly-wine `CookieViewController.swift` L840-889 `PaymentNavigationDelegate`
```swift
class PaymentNavigationDelegate: NSObject, WKNavigationDelegate {
  var original: WKNavigationDelegate?
  override func responds(to aSelector: Selector!) -> Bool {
    return super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
  }
  override func forwardingTarget(for aSelector: Selector!) -> Any? {
    if let orig = original, orig.responds(to: aSelector) { return orig }
    return super.forwardingTarget(for: aSelector)
  }
}
```
→ `decidePolicyFor` 는 **구현하지 않음**(자동 전달). `didFailProvisionalNavigation`/`didFail` 만: 원본 호출 후 NSURLErrorDomain {-1009,-1001,-1003,-1004,-1005,-1020} 이고 -999 아니면 `bridge.config.localURL/index.html?to=` 로드(RESEARCH Pattern 5).

### `mobile/android/app/src/main/java/com/ghtrade/app/MainActivity.kt`

**Analog:** weekly-wine `MainActivity.kt`
- `load()` override (L90-120):
```kotlin
override fun load() {
  super.load()
  val webView = bridge.webView ?: return
  rootLayout = webView.parent as CoordinatorLayout
  WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = true
  webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
  setupPullToRefresh(webView); setupTabBar(); setupBackButton(webView); observeURL(webView)
}
```
→ 인터페이스 이름 `GhTradeBridge`, 메서드 `@JavascriptInterface fun postMessage(json: String)` 하나(L342-350 `inner class AndroidBridge` 모양, `handler.post { }` 로 UI 스레드 전환). `window.statusBarColor` 는 SystemBars 와 충돌(Pitfall 8) — 테마 메시지로 `isAppearanceLightStatusBars` 만.
- SwipeRefreshLayout 래핑 (L186-208): webView 를 부모에서 떼어 `SwipeRefreshLayout` 에 넣고 같은 index 로 재삽입 · `setOnChildScrollUpCallback { webView.canScrollVertically(-1) || innerScrolled }` · `postDelayed({ isRefreshing = false }, 1000)` → 리스너 본문을 `evaluateJavascript(refresh 훅)` 로.
- 탭바 (L441-470): 그라데이션 `fadeBlurView`(`CoordinatorLayout.LayoutParams` `gravity = BOTTOM`) + `FrameLayout` pill 70dp.
- 뒤로가기: weekly-wine L123 `override fun onBackPressed()` **사용 금지** → `onBackPressedDispatcher.addCallback`(Pitfall 5): `__ghTrade.back()` true 면 소비 → `webView.canGoBack()` → 홈 아니면 홈 → 종료.

### `mobile/android/.../GhTradeWebViewClient.kt`

**반면교사 analog:** weekly-wine L725-730
```kotlin
val originalClient = bridge.webViewClient
webView.webViewClient = object : WebViewClient() { ... }
```
→ 통째 교체 금지(Pitfall 4). `class GhTradeWebViewClient(bridge: Bridge) : BridgeWebViewClient(bridge)` 로 상속, `bridge.setWebViewClient(...)`. `onReceivedError` 메인프레임 + 네트워크 오류 코드만 폴백(HTTP 4xx/5xx 무시), `onPageFinished`/`doUpdateVisitedHistory` 에서 `onUrlChanged(url)`(weekly-wine L857 모양 — 챗/결제 분기 제외) 호출.

### Android 리소스

- `res/drawable/ic_tab_*.xml`: weekly-wine `ic_tab_home.xml`/`ic_tab_home_fill.xml` 쌍 명명 → `ic_tab_home`, `ic_tab_search`, `ic_tab_trading(_fill)`, `ic_tab_ai`, `ic_tab_me(_fill)` (Material Symbols 벡터).
- `android/variables.gradle`: weekly-wine 값(min 24 · compile/target 36 · androidx 버전)은 Capacitor 8.5.2 템플릿 생성본을 우선하고 차이만 비교.

## Shared Patterns

### Provider 밖 no-op (PC-7 무로그 fail-safe 금지와 병행)
**Source:** `webapp/src/lib/relay-provider.tsx` L360-377, 465-468
**Apply to:** native-bridge-provider · useNativeRefresh · probeNow · postNative(비앱이면 `false` 반환으로 「보내지 않음」을 표시)

### 앱 분기 = `html.native-app` 클래스만
**Source:** `globals.css:5` `@custom-variant dark`
**Apply to:** app-shell · app-header · chat-fab · 하단 고정 바 · 본문 하단 여백. 컴포넌트에서 `isNativeApp()` JS 분기는 로그인·Provider 처럼 동작이 다른 곳에만.

### 하드 내비 (세션 경계)
**Source:** `lib/auth-context.tsx` signOut `window.location.href = "/login"`
**Apply to:** 네이티브 로그인 성공 `location.replace(safeNext)`.

### localStorage 규약
**Source:** `lib/breakout-list.ts` L70-95 · 키 접두 `gh-radar:` (D-21 — 브랜드 변경에도 키 불변)
**Apply to:** recent-search.

### 테스트 주석 관례
**Source:** `lib/__tests__/relay-provider.test.tsx` L5-24 · `e2e/specs/me.spec.ts` L17-30 — 파일 상단에 「무엇을 증명하는가 / 깨지면 사용자가 겪는 일」 번호 목록.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `mobile/ios/App/App/SceneDelegate.swift` | native entry | weekly-wine 은 UIScene 이전 템플릿 — RESEARCH Pattern 1 코드 사용 (Pitfall 1·3) |
| `mobile/scripts/render-resources.mjs` + `mobile/resources/*` | script/asset | 저장소에 SVG→PNG 렌더 스크립트 없음 — RESEARCH Recommended Structure 대로 webapp 의 `@playwright/test` 를 createRequire 로 로드 |
| `mobile/ios/App/App/Info.plist` · `Base.lproj/Main.storyboard` | config | `cap add ios` 생성본을 편집(표시명·방향·URL scheme·Scene manifest) |
| `mobile/android/.../res/values(-sw600dp)/bools.xml` | resource | weekly-wine 에 태블릿 분기 없음 — 표준 Android 리소스 한정자 |
| `webapp/src/lib/native/native-detect.ts` 인라인 스크립트 | utility | `<head>` 인라인 스크립트 선례 없음(next-themes 가 내부적으로 수행) — RESEARCH Pattern 4 |

## Metadata

**Analog search scope:** `webapp/src/{app,lib,hooks,components,styles}`, `webapp/e2e/{fixtures,specs}`, repo root configs, `.planning/sketches/004,005`, `/Users/alex/repos/weekly-wine-app/{capacitor.config.ts,package.json,www,ios/App/App,android/app/src/main,android/variables.gradle}`
**Files scanned:** ~40
**Pattern extraction date:** 2026-09-25
