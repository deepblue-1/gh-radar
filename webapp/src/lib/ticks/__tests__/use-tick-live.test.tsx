import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { zstdCompressSync } from 'node:zlib';

import { TICK_LIVE_HEADERS, iterRecords } from '@gh-radar/shared';

/**
 * Phase 37 Plan 19 — useTickLive(당일 `/api/ticks/live` 하루치 → 세션) · appendTickBytes · fetchTickLive.
 *
 * 잠그는 것(Task 1 트레이서): 가짜 server(37-15 계약 헤더 6종) loading(대기 2) → 2초 뒤 같은 epoch · offsetEnd 로 이어 받기 →
 * ready → 세션 레코드 수 = 픽스처 레코드 수 · 초기 커서 = 끝 틱 · enabled false 면 요청 0 · 두 덩이 이어붙임 = 한 덩이 ·
 * rebuildMs 숫자 · 503 = unavailable(더 요청하지 않음).
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
  }),
}));

import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, TICK_FIXTURE_RECORDS, tickGridBytes } from '@/test-fixtures/tick-grid';

import { appendTickBytes, buildTickSession } from '../tick-session';
import { endRecOf, initialRecOf } from '../use-tick-cursor';
import { TICK_LIVE_LOADING_MS, useTickLive } from '../use-tick-live';

const RAW = tickGridBytes();

/** 해제 바이트를 레코드 경계 `at`(레코드 수) 에서 둘로 — 각 덩이를 zstd 로 다시 압축(tickgw 프레임 흉내). */
function splitChunks(at: number): [Uint8Array, Uint8Array] {
  let i = 0;
  let cut = RAW.length;
  for (const r of iterRecords(RAW)) {
    if (i === at) {
      cut = r.off - 16;
      break;
    }
    i += 1;
  }
  return [new Uint8Array(zstdCompressSync(RAW.subarray(0, cut))), new Uint8Array(zstdCompressSync(RAW.subarray(cut)))];
}

const [Z1, Z2] = splitChunks(6_000);
const EPOCH = 'e-1';

interface FakeResp {
  status?: number;
  body?: Uint8Array | string;
  state?: string;
  queue?: number;
  offsetEnd?: number;
  lastRecvNs?: string;
  epoch?: string;
}

function liveResponse(r: FakeResp): Response {
  const status = r.status ?? 200;
  if (status !== 200) {
    return new Response(typeof r.body === 'string' ? r.body : '{}', {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const body = (r.body as Uint8Array | undefined) ?? new Uint8Array(0);
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      [TICK_LIVE_HEADERS.epoch]: r.epoch ?? EPOCH,
      [TICK_LIVE_HEADERS.offsetEnd]: String(r.offsetEnd ?? 0),
      [TICK_LIVE_HEADERS.lastRecvNs]: r.lastRecvNs ?? '',
      [TICK_LIVE_HEADERS.state]: r.state ?? 'ready',
      [TICK_LIVE_HEADERS.queue]: String(r.queue ?? 0),
      [TICK_LIVE_HEADERS.complete]: 'true',
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
const calls = () =>
  fetchMock.mock.calls.map(([u]) => {
    const url = new URL(String(u));
    return { path: url.pathname, epoch: url.searchParams.get('epoch'), offset: Number(url.searchParams.get('offset')) };
  });

beforeEach(() => {
  // setImmediate · nextTick 은 진짜로 둔다 — Response.json() 본문 읽기가 그걸 쓴다(409 경로).
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const opts = (over: Partial<Parameters<typeof useTickLive>[0]> = {}) => ({
  isin: ISIN,
  ex: 'KRX' as const,
  date: D,
  enabled: true,
  ...over,
});

describe('appendTickBytes (37-19 · D-18 · Pitfall 9)', () => {
  it('두 덩이(하루치 + 증분) 이어붙임 = 한 번에 받은 것 · rebuildMs 숫자', () => {
    const once = buildTickSession(RAW, { date: D, ex: 'KRX', isin: ISIN });
    const a = appendTickBytes(null, Z1, { date: D, ex: 'KRX', isin: ISIN });
    expect(a.index.n).toBe(6_000);
    const b = appendTickBytes(a, Z2, { date: D, ex: 'KRX', isin: ISIN });
    expect(b.index.n).toBe(TICK_FIXTURE_RECORDS);
    expect(Buffer.compare(Buffer.from(b.buf), Buffer.from(once.buf))).toBe(0);
    expect(b.a3.n).toBe(once.a3.n);
    expect(b.orders.length).toBe(once.orders.length);
    expect(Buffer.compare(Buffer.from(b.exOrder.buffer), Buffer.from(once.exOrder.buffer))).toBe(0);
    expect(b.openOrder).toBe(once.openOrder);
    expect(typeof b.rebuildMs).toBe('number');
    expect(b.rebuildMs).toBeGreaterThanOrEqual(0);
    expect(once.rebuildMs).toBeNull();
    // 앞 레코드 rec 는 그대로 — 같은 틱의 recv_ns 가 같다
    expect(b.index.recvNs[5_999]).toBe(a.index.recvNs[5_999]);
  });

  it('빈 바이트 → 이전 세션 그대로 · 이전도 없으면 빈 세션', () => {
    const a = appendTickBytes(null, Z1, { date: D, ex: 'KRX', isin: ISIN });
    expect(appendTickBytes(a, new Uint8Array(0), { date: D, ex: 'KRX' })).toBe(a);
    expect(appendTickBytes(null, new Uint8Array(0), { date: D, ex: 'KRX' }).index.n).toBe(0);
  });
});

describe('useTickLive — 하루치 (D-05 · D-22)', () => {
  it('enabled false → 요청 0(today live=false)', async () => {
    const { result } = renderHook(() => useTickLive(opts({ enabled: false })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.session).toBeNull();
  });

  it('loading(대기 2) → 2초 뒤 같은 epoch · offsetEnd 로 이어 받기 → ready · 레코드 = 픽스처 · 끝 틱', async () => {
    fetchMock
      .mockResolvedValueOnce(liveResponse({ body: Z1, state: 'queued', queue: 2, offsetEnd: Z1.length }))
      .mockResolvedValueOnce(
        liveResponse({ body: Z2, state: 'ready', offsetEnd: Z1.length + Z2.length, lastRecvNs: '1760590000000000000' }),
      );
    const { result } = renderHook(() => useTickLive(opts()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.meta?.queue).toBe(2);
    expect(result.current.meta?.state).toBe('queued');
    expect(result.current.session).toBeNull();
    expect(calls()).toEqual([{ path: '/api/ticks/live', epoch: null, offset: 0 }]);
    // 인증 헤더 = 같은 Bearer
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICK_LIVE_LOADING_MS);
    });
    expect(calls()[1]).toEqual({ path: '/api/ticks/live', epoch: EPOCH, offset: Z1.length });
    expect(result.current.status).toBe('ready');
    const s = result.current.session!;
    expect(s.index.n).toBe(TICK_FIXTURE_RECORDS);
    expect(typeof s.rebuildMs).toBe('number');
    expect(result.current.meta?.lastRecvNs).toBe('1760590000000000000');
    // D-18 당일 t 없음 = 끝 틱
    expect(initialRecOf(s, null, true)).toBe(endRecOf(s));
    expect(initialRecOf(s, null, true)).toBe(s.exOrder[s.exOrder.length - 1]);
  });

  it('503 미결선 → unavailable · 더 요청하지 않는다', async () => {
    fetchMock.mockResolvedValue(liveResponse({ status: 503, body: '{"error":{"code":"TICKS_LIVE_UNAVAILABLE"}}' }));
    const { result } = renderHook(() => useTickLive(opts()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── Task 2 — 폴링 규율(D-06) ──────────────────────────────────────────────────────

/** 하루치(Z1) ready 상태로 연 뒤 돌려준다 — 다음 증분부터 시험. */
async function openReady(initial: Partial<Parameters<typeof useTickLive>[0]> = {}) {
  fetchMock.mockResolvedValueOnce(
    liveResponse({ body: Z1, state: 'ready', offsetEnd: Z1.length, lastRecvNs: '1760590000000000000' }),
  );
  const hook = renderHook((p: Parameters<typeof useTickLive>[0]) => useTickLive(p), {
    initialProps: opts({ atEnd: true, ...initial }),
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(hook.result.current.status).toBe('ready');
  expect(hook.result.current.session!.index.n).toBe(6_000);
  return hook;
}

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(v: DocumentVisibilityState) {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useTickLive — 폴링 규율 (D-06)', () => {
  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });

  it('보임 ∧ 끝 → 5초마다 offsetEnd 증분 · 바이트가 오면 세션 갱신', async () => {
    const { result } = await openReady();
    fetchMock.mockResolvedValueOnce(liveResponse({ body: Z2, offsetEnd: Z1.length + Z2.length }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls()[1]).toEqual({ path: '/api/ticks/live', epoch: EPOCH, offset: Z1.length });
    expect(result.current.session!.index.n).toBe(TICK_FIXTURE_RECORDS);
    expect(result.current.newCount).toBe(0);
    // 빈 증분 → 세션 그대로(identity)
    const s = result.current.session;
    fetchMock.mockResolvedValueOnce(liveResponse({ offsetEnd: Z1.length + Z2.length }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(calls()[2]!.offset).toBe(Z1.length + Z2.length);
    expect(result.current.session).toBe(s);
  });

  it('커서가 과거 틱 → 요청 0 · 그사이 도착한 레코드 = 새 틱 n건 · 끝으로 → 즉시 1회 · 폴링 재개', async () => {
    const hook = await openReady();
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (release = res)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000); // 증분 요청이 떠 있는 동안
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    hook.rerender(opts({ atEnd: false })); // 과거 틱으로
    await act(async () => {
      release(liveResponse({ body: Z2, offsetEnd: Z1.length + Z2.length }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.newCount).toBe(TICK_FIXTURE_RECORDS - 6_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 멈춘 동안 요청 0
    fetchMock.mockResolvedValue(liveResponse({ offsetEnd: Z1.length + Z2.length }));
    await act(async () => {
      hook.result.current.goEnd();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // 즉시 1회
    expect(hook.result.current.newCount).toBe(0);
    hook.rerender(opts({ atEnd: true })); // 뷰어가 끝으로 옮겼다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4); // 폴링 재개(간격 5초)
  });

  it('탭 숨김 → 요청 0 · 다시 보이면 즉시 1회', async () => {
    await openReady();
    fetchMock.mockResolvedValue(liveResponse({ offsetEnd: Z1.length }));
    act(() => setVisibility('hidden'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('409 → 새 epoch 로 offset 0 부터 다시 · 세션 교체 · generation +1', async () => {
    const { result } = await openReady();
    const before = result.current.session;
    expect(result.current.generation).toBe(0);
    fetchMock
      .mockResolvedValueOnce(liveResponse({ status: 409, body: '{"epoch":"e-2"}' }))
      .mockResolvedValueOnce(liveResponse({ body: Z1, epoch: 'e-2', state: 'loading', offsetEnd: Z1.length }))
      .mockResolvedValueOnce(liveResponse({ body: Z2, epoch: 'e-2', state: 'ready', offsetEnd: Z1.length + Z2.length }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000); // 409
    });
    // 409 본문 Response.json() 은 진짜 이벤트 루프가 돌아야 풀린다 — vi.waitFor(진짜 타이머)로 기다리며 0ms 타이머(즉시 재요청)를 민다.
    // 간격은 줄지 않았다: 가짜 시계는 0ms 만 움직인다.
    await vi.waitFor(async () => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(calls()[2]).toEqual({ path: '/api/ticks/live', epoch: 'e-2', offset: 0 });
    });
    // 새 하루치를 받는 동안 이전 세션은 그대로 보인다
    expect(result.current.session).toBe(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICK_LIVE_LOADING_MS);
    });
    expect(calls()[3]).toEqual({ path: '/api/ticks/live', epoch: 'e-2', offset: Z1.length });
    expect(result.current.session).not.toBe(before);
    expect(result.current.session!.index.n).toBe(TICK_FIXTURE_RECORDS);
    expect(result.current.generation).toBe(1);
    expect(result.current.meta?.epoch).toBe('e-2');
  });

  it('delayed · blocked → meta.state 노출 · 간격은 그대로 5초', async () => {
    const { result } = await openReady();
    fetchMock.mockResolvedValue(
      liveResponse({ state: 'delayed', offsetEnd: Z1.length, lastRecvNs: '1760590000000000000' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.meta?.state).toBe('delayed');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('오류(502 · 네트워크 · 500) → 다음 주기까지 기다림 · 연속 3회 errors 3 · 간격 줄이지 않음 · 성공하면 0', async () => {
    const { result } = await openReady();
    fetchMock
      .mockResolvedValueOnce(liveResponse({ status: 502, body: '{}' }))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(liveResponse({ status: 500, body: '{}' }))
      .mockResolvedValueOnce(liveResponse({ offsetEnd: Z1.length }));
    for (let i = 1; i <= 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_999);
      });
      expect(fetchMock).toHaveBeenCalledTimes(i);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(result.current.errors).toBe(i);
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.errors).toBe(0);
    expect(result.current.status).toBe('ready');
  });

  it('stop → 더 요청하지 않는다(카드 취소)', async () => {
    fetchMock.mockResolvedValue(liveResponse({ body: Z1, state: 'loading', offsetEnd: Z1.length }));
    const { result } = renderHook(() => useTickLive(opts()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => result.current.stop());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
