/**
 * 이동 멈춤 감시 (debug ios-resume-sidebar-stall) — 이동 시작 후 NAV_STALL_MS 가 지나도 주소가 출발 그대로면
 * 기록을 남기고 문서 이동으로 되살린다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NAV_STALL_LOG_MAX,
  NAV_STALL_MS,
  __setNavStallWatchForTest,
  clearNavStallLog,
  noteRouterTransitionStart,
  readNavStallLog,
  subscribeRouterTransition,
} from '@/lib/router-transition';

const hardNavigate = vi.fn<(href: string) => void>();

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('이동 멈춤 감시', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    hardNavigate.mockReset();
    window.history.replaceState(null, '', '/trading');
    clearNavStallLog();
    setVisibility('visible');
    __setNavStallWatchForTest({ enabled: true, hardNavigate });
  });
  afterEach(() => {
    __setNavStallWatchForTest({ enabled: false });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('10초 지나도 주소가 그대로면 기록하고 그 주소로 문서 이동한다', () => {
    noteRouterTransitionStart('/me', 'push');
    vi.advanceTimersByTime(NAV_STALL_MS - 1);
    expect(hardNavigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hardNavigate).toHaveBeenCalledWith(`${window.location.origin}/me`);
    const log = readNavStallLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ from: '/trading', to: '/me', type: 'push', waitedMs: NAV_STALL_MS });
  });

  it('주소가 바뀌었으면(리다이렉트 포함) 아무것도 하지 않는다', () => {
    noteRouterTransitionStart('/admin/pnl', 'push');
    window.history.pushState(null, '', '/'); // 서버가 / 로 돌려보낸 경우
    vi.advanceTimersByTime(NAV_STALL_MS);
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(readNavStallLog()).toHaveLength(0);
  });

  it('새 이동이 앞 이동의 감시를 대신한다', () => {
    noteRouterTransitionStart('/me', 'push');
    vi.advanceTimersByTime(NAV_STALL_MS - 1000);
    noteRouterTransitionStart('/search', 'push');
    vi.advanceTimersByTime(1000);
    expect(hardNavigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(NAV_STALL_MS - 1000);
    expect(hardNavigate).toHaveBeenCalledTimes(1);
    expect(hardNavigate).toHaveBeenCalledWith(`${window.location.origin}/search`);
  });

  it('숨어 있는 동안은 문서 이동하지 않고 보이면 다시 본다', () => {
    noteRouterTransitionStart('/me', 'push');
    setVisibility('hidden');
    vi.advanceTimersByTime(NAV_STALL_MS);
    expect(hardNavigate).not.toHaveBeenCalled();
    setVisibility('visible');
    vi.advanceTimersByTime(NAV_STALL_MS);
    expect(hardNavigate).toHaveBeenCalledTimes(1);
  });

  it('뒤로/앞으로 · 같은 주소 · 다른 출처는 감시하지 않는다', () => {
    noteRouterTransitionStart('/me', 'traverse');
    noteRouterTransitionStart('/trading', 'push');
    noteRouterTransitionStart('https://example.com/x', 'push');
    vi.advanceTimersByTime(NAV_STALL_MS * 2);
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it('복귀 뒤 경과 시간을 기록한다', () => {
    setVisibility('hidden');
    setVisibility('visible');
    vi.advanceTimersByTime(1500);
    noteRouterTransitionStart('/me', 'push');
    vi.advanceTimersByTime(NAV_STALL_MS);
    expect(readNavStallLog()[0]?.sinceResumeMs).toBe(1500);
  });

  it('기록은 최근 NAV_STALL_LOG_MAX 건만 남긴다', () => {
    for (let i = 0; i < NAV_STALL_LOG_MAX + 3; i += 1) {
      noteRouterTransitionStart(`/me?i=${i}`, 'push');
      vi.advanceTimersByTime(NAV_STALL_MS);
    }
    const log = readNavStallLog();
    expect(log).toHaveLength(NAV_STALL_LOG_MAX);
    expect(log.at(-1)?.to).toBe(`/me?i=${NAV_STALL_LOG_MAX + 2}`);
  });

  it('꺼져 있으면(개발 서버) 감시하지 않고 구독자 알림은 그대로다', () => {
    __setNavStallWatchForTest({ enabled: false, hardNavigate });
    const seen: string[] = [];
    const off = subscribeRouterTransition((to) => seen.push(to.pathname));
    noteRouterTransitionStart('/me', 'push');
    vi.advanceTimersByTime(NAV_STALL_MS);
    off();
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(seen).toEqual(['/me']);
  });
});
