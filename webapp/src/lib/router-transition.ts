/**
 * 앱 라우터 이동 시작 신호 (Phase 37 R2-WR-30) + 이동 멈춤 감시 (debug ios-resume-sidebar-stall).
 *
 * Next 15 는 `src/instrumentation-client.ts` 의 `onRouterTransitionStart(url, type)` 를 **모든** 앱 라우터 이동의 시작에서
 * 동기로 부른다 — `<Link>` 클릭 · `router.push` / `router.replace`(`push` · `replace`) · 브라우저 뒤로 · 앞으로(`traverse`).
 * 액션을 큐에 넣기 직전이라, 구독자는 그 이동이 끝나기 전에 알 수 있다.
 *
 * 쓰는 곳: 틱뷰어 커서(`useTickCursor`)의 URL `t` 쓰기 — Next 15 는 패치한 `history.replaceState` 를 `ACTION_RESTORE` 로
 * 바꾸고, 대기 중인 이동이 있으면 그 이동을 버린다(app-router-instance `dispatchAction`). 그래서 이동이 대기 중이면 쓰지 않는다.
 * 우리 쪽 `history.replaceState` 는 이 신호를 내지 않는다(Next 가 부르지 않는다).
 *
 * ── 이동 멈춤 감시 (2026-11-20) ──
 * iOS 앱(WKWebView)에서 다른 앱에 갔다 오면 사이드바 메뉴를 눌러도 끝내 넘어가지 않는 일이 있었다. Next 의 이동은 RSC 응답을
 * 기다리는데 그 fetch 에는 시한이 없다 — 복귀 직후 죽은 연결로 나간 요청(특히 드로어가 열리며 걸린 링크 프리페치)이 멈추면,
 * 그 링크를 누를 때마다 같은 멈춘 프리페치 promise 를 기다린다(navigate-reducer `data.then` · AUTO 항목 5분 유효).
 * 원인이 환경(OS 의 연결 동결)이라 없앨 수 없으므로 감지해서 되살린다: 이동 시작 후 `NAV_STALL_MS` 가 지나도 주소가 출발
 * 그대로면 기록을 남기고 그 주소로 **문서 이동**(`location.assign`)한다 — 새 문서는 새 연결 · 새 세션 · 새 relay 로 시작한다.
 * - 주소가 바뀌면(어디로든 — 리다이렉트 포함) 이동이 끝난 것으로 본다. 그래서 같은 주소로의 이동 · 뒤로/앞으로는 감시하지 않는다.
 * - 화면이 숨어 있으면 강제 이동하지 않고 다시 기다린다(백그라운드에서 문서를 갈아엎지 않는다).
 * - 개발 서버(`next dev` 첫 컴파일은 10초를 넘는다 · e2e 도 dev)에서는 끈다.
 * - 기록은 기기 localStorage 에만 둔다(최근 `NAV_STALL_LOG_MAX` 건) — My page 「이동 멈춤 기록」이 보여 준다.
 */

export type RouterTransitionType = 'push' | 'replace' | 'traverse';
export type RouterTransitionListener = (to: URL, type: RouterTransitionType) => void;

const listeners = new Set<RouterTransitionListener>();

/** 이동 시작 후 이만큼 지나도 주소가 그대로면 멈춘 것으로 본다. 이동은 평소 1초 안팎이다. */
export const NAV_STALL_MS = 10_000;
/** 기록 보관 건수 상한. */
export const NAV_STALL_LOG_MAX = 20;
export const NAV_STALL_LOG_KEY = 'gh-nav-stall-log';

/** 이동 멈춤 1건 — 다음에 원인을 확정하기 위한 기기 쪽 증거. */
export interface NavStallRecord {
  /** 강제 이동한 시각(ISO). */
  at: string;
  /** 출발 주소(경로 + 쿼리). */
  from: string;
  /** 가려던 주소(경로 + 쿼리). */
  to: string;
  type: RouterTransitionType;
  /** 이동 시작부터 강제 이동까지(ms). */
  waitedMs: number;
  /** 화면이 마지막으로 다시 보이게 된 뒤 이동 시작까지(ms) — 복귀 직후 몰림 여부. 이 문서에서 숨김이 없었으면 null. */
  sinceResumeMs: number | null;
  /** 강제 이동 시점의 `navigator.onLine`. */
  online: boolean;
}

interface Watch {
  timer: ReturnType<typeof setTimeout>;
  from: string;
  to: URL;
  type: RouterTransitionType;
  startedAt: number;
  sinceResumeMs: number | null;
}

let watch: Watch | null = null;
let lastVisibleAt: number | null = null;
let visibilityHooked = false;
let hardNavigate: (href: string) => void = (href) => window.location.assign(href);
let watchdogEnabled = process.env.NODE_ENV === 'production';

function pathOf(loc: { pathname: string; search: string }): string {
  return loc.pathname + loc.search;
}

function hookVisibility(): void {
  if (visibilityHooked || typeof document === 'undefined') return;
  visibilityHooked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lastVisibleAt = Date.now();
  });
}

// 이 모듈은 instrumentation-client 가 하이드레이션 전에 읽는다 — 첫 이동 전의 복귀도 잡도록 지금 건다.
hookVisibility();

export function readNavStallLog(): NavStallRecord[] {
  try {
    const raw = window.localStorage.getItem(NAV_STALL_LOG_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NavStallRecord[]) : [];
  } catch {
    return [];
  }
}

export function clearNavStallLog(): void {
  try {
    window.localStorage.removeItem(NAV_STALL_LOG_KEY);
  } catch {
    /* 저장소 차단 — 지울 것도 없다 */
  }
}

function appendNavStallLog(record: NavStallRecord): void {
  try {
    const next = [...readNavStallLog(), record].slice(-NAV_STALL_LOG_MAX);
    window.localStorage.setItem(NAV_STALL_LOG_KEY, JSON.stringify(next));
  } catch {
    /* 저장소 차단 · 가득 참 — 기록 없이 되살리기만 한다 */
  }
}

function checkStall(w: Watch): void {
  if (watch !== w) return;
  if (document.visibilityState === 'hidden') {
    // 숨은 동안은 문서를 갈아엎지 않는다 — 보일 때까지 같은 간격으로 다시 본다.
    w.timer = setTimeout(() => checkStall(w), NAV_STALL_MS);
    return;
  }
  watch = null;
  if (pathOf(window.location) !== w.from) return; // 주소가 바뀌었다 = 이동이 끝났다(리다이렉트 포함).
  appendNavStallLog({
    at: new Date().toISOString(),
    from: w.from,
    to: pathOf(w.to),
    type: w.type,
    waitedMs: Date.now() - w.startedAt,
    sinceResumeMs: w.sinceResumeMs,
    online: navigator.onLine,
  });
  console.warn('[router-transition] 이동 멈춤 — 문서 이동으로 되살린다', pathOf(w.to));
  hardNavigate(w.to.href);
}

function armStallWatch(to: URL, type: RouterTransitionType): void {
  if (!watchdogEnabled) return;
  hookVisibility();
  if (watch !== null) {
    // 새 이동이 앞 이동을 대신한다(Next 도 대기 중 이동을 버린다).
    clearTimeout(watch.timer);
    watch = null;
  }
  if (type === 'traverse') return; // 뒤로/앞으로는 주소가 먼저 바뀌어 판정할 수 없다.
  if (to.origin !== window.location.origin) return;
  const from = pathOf(window.location);
  if (pathOf(to) === from) return; // 같은 주소로의 이동은 주소 변화로 끝을 알 수 없다.
  const startedAt = Date.now();
  const w: Watch = {
    timer: undefined as unknown as ReturnType<typeof setTimeout>,
    from,
    to,
    type,
    startedAt,
    sinceResumeMs: lastVisibleAt === null ? null : startedAt - lastVisibleAt,
  };
  w.timer = setTimeout(() => checkStall(w), NAV_STALL_MS);
  watch = w;
}

/** `instrumentation-client.ts` 가 부른다 — 구독자 예외는 삼킨다(이동 자체를 막지 않게). */
export function noteRouterTransitionStart(href: string, type: RouterTransitionType): void {
  if (typeof window === 'undefined') return;
  let to: URL;
  try {
    to = new URL(href, window.location.href);
  } catch {
    return;
  }
  armStallWatch(to, type);
  for (const l of [...listeners]) {
    try {
      l(to, type);
    } catch (e) {
      console.warn('[router-transition] 구독자 오류', e);
    }
  }
}

/** 이동 시작을 듣는다 — 돌려준 함수로 해제. */
export function subscribeRouterTransition(l: RouterTransitionListener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 테스트 전용 — 감시 켜기 · 문서 이동 대체 · 상태 초기화. */
export function __setNavStallWatchForTest(opts: {
  enabled: boolean;
  hardNavigate?: (href: string) => void;
}): void {
  if (watch !== null) clearTimeout(watch.timer);
  watch = null;
  lastVisibleAt = null;
  watchdogEnabled = opts.enabled;
  hardNavigate = opts.hardNavigate ?? ((href) => window.location.assign(href));
}
