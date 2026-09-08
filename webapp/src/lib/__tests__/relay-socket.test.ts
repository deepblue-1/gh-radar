import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * Phase 15 Plan 12 Task 2 → **Phase 16 Plan 09 에서 `useRelayConnection` 으로 갱신**.
 *
 * 전역 `WebSocket` 을 fake 클래스로 대체해 **테스트가 서버 프레임을 주입**한다
 * (`chat-sse.test.ts` 의 `readerFromChunks` 와 같은 사상 — 네트워크 없이 프로토콜만 검증).
 *
 * 증명 대상 (승격 전 단언을 **그대로 유지**한다 — 케이스가 사라지면 회귀 감지가 사라진다):
 *  - D-11  첫 메시지 `{t:"auth", token}`, URL 에 토큰 없음 (T-15-04)
 *  - T-15-10  close 4401 은 재접속하지 않음, 백오프 상한 10회 후 `manual_required`
 *  - D-16  지수 백오프 1s→2s→…
 *  - D-33/D-37  `isin|exchange` 키별 시세 보관 — 거래소 두 벌이 서로를 덮지 않는다
 *  - UI-SPEC  재접속 중 데이터 유지 + `isStale`
 *  - T-15-41  깨진 프레임은 throw 없이 스킵
 *  - D-02  `sendOrder` 의 `rid` 상관 응답과 **실패 표면화**(미연결=rejected / 미응답=timeout)
 *
 * 종목 축(구독 전환·키 격리·참조계수)의 검증은 소비자 경계로 옮겨졌다 →
 * `relay-provider.test.tsx`.
 *
 * ⚠️ 경로 주의: webapp vitest include 는 `src/**\/*.test.{ts,tsx}` 다. `webapp/tests/`
 *    아래에 두면 조용히 실행되지 않는다.
 */

// --- supabase 세션 mock (access_token 취득 경로 — chat-sse.ts 와 동일) -----------
const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'tok-abc' } as { access_token: string } | null },
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: () => getSessionMock() } }),
}));

// --- URL 해석 mock (env 폴백 경고 회피 + URL 단언 고정) --------------------------
vi.mock('@/lib/relay-url', () => ({
  resolveRelayWsUrl: () => 'ws://relay.test:8090/ws',
}));

import { RELAY_STATE_LABELS } from '@gh-radar/shared';
import type {
  RelayAccountState,
  RelayOrderNewMsg,
  RelayQuote,
  RelayTape,
  RelayTapeEntry,
  RelayUnfilled,
} from '@gh-radar/shared';
import { relayQuoteKey, useRelayConnection } from '../use-relay-socket';

const ISIN_A = 'KR7005930003';
const ISIN_B = 'KR7000660001';

// ============================================================
// fake WebSocket — 테스트가 서버 역할을 한다
// ============================================================

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) throw new Error('WebSocket 인스턴스가 없습니다');
    return ws;
  }

  readonly url: string;
  readyState = 0; // CONNECTING
  readonly sent: string[] = [];
  closedWith: { code?: number } | null = null;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  /** 브라우저 `close()` — 훅이 리스너를 먼저 떼므로 close 이벤트를 되쏘지 않는다. */
  close(code?: number): void {
    this.closedWith = { code };
    this.readyState = 3; // CLOSED
  }

  // --- 테스트 조작 ---------------------------------------------------------

  /** 서버가 업그레이드를 수락. */
  accept(): void {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }

  /** 서버가 프레임 1건 전송. */
  push(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  /** 서버가 깨진 본문 전송. */
  pushRaw(raw: string): void {
    this.onmessage?.({ data: raw } as MessageEvent);
  }

  /** 서버가 소켓을 닫음. */
  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  /** 훅이 보낸 메시지를 파싱해 돌려준다. */
  parsedSent(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

// ============================================================
// 프레임 픽스처
// ============================================================

function tenFrom(base: number): number[] {
  return Array.from({ length: 10 }, (_, k) => base + k * 100);
}

function quoteFrame(overrides: Partial<RelayQuote> = {}): RelayQuote {
  return {
    t: 'q',
    i: ISIN_A,
    x: 'KRX',
    snap: true,
    p: 70_000,
    o: 69_500,
    h: 71_200,
    l: 68_900,
    c: 1_000,
    cs: '2',
    cr: 1.45,
    v: 1_234_567,
    va: 86_419_690_000,
    ap: tenFrom(70_100),
    aq: Array.from({ length: 10 }, (_, k) => 100 + k),
    bp: tenFrom(69_000),
    bq: Array.from({ length: 10 }, (_, k) => 200 + k),
    ta: 5_500,
    tb: 6_100,
    ul: 89_700,
    ll: 48_300,
    base: 69_000,
    viu: 76_000,
    vid: 62_000,
    ls: 5_969_782_550,
    et: '093015123456',
    ...overrides,
  };
}

function tapeEntry(seq: number): RelayTapeEntry {
  return {
    t: `0930${String(seq).padStart(2, '0')}000000`,
    p: 70_000 + seq,
    cs: '2',
    c: seq,
    q: 10,
    cv: 1_000 + seq,
  };
}

function tapeFrame(
  entries: RelayTapeEntry[],
  snap = false,
  over: Partial<RelayTape> = {},
): RelayTape {
  return { t: 'tape', i: ISIN_A, x: 'KRX', snap, e: entries, ...over };
}

function acctFrame(over: Partial<RelayAccountState> = {}): RelayAccountState {
  return {
    t: 'acct',
    a: '12345678-01',
    snap: true,
    hold: [{ isin: ISIN_A, qty: 10, sellableQty: 10, avgPrice: 68_500 }],
    unf: [],
    rm: [],
    st: '09:30:15',
    ...over,
  };
}

function orderNew(rid: string): RelayOrderNewMsg {
  return {
    t: 'order.new',
    rid,
    isin: ISIN_A,
    exchange: 'KRX',
    side: 'B',
    qty: 10,
    price: 69_900,
    accountNo: '12345678-01',
  };
}

// ============================================================
// 하네스
// ============================================================

/** effect + 마이크로태스크(getSession) 를 모두 흘려보낸다. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface HookProps {
  enabled: boolean;
}

function render(initial: HookProps = { enabled: true }) {
  return renderHook((props: HookProps) => useRelayConnection(props), {
    initialProps: initial,
  });
}

/** 연결 → 인증 ACK(상태 프레임)까지 진행한 소켓을 돌려준다. */
async function connected(
  _result: ReturnType<typeof render>,
  state: 'ready' | 'declaring' = 'ready',
): Promise<FakeWebSocket> {
  await settle();
  const ws = FakeWebSocket.last();
  await act(async () => {
    ws.accept();
  });
  await act(async () => {
    ws.push({ t: 'state', s: state, accounts: [{ accountNo: '12345678-01', name: '위탁종합' }] });
  });
  return ws;
}

/** 현재 상태에서 키로 호가를 꺼낸다 — 전역 맵이므로 조회는 소비자 책임이다. */
function quoteOf(
  hook: ReturnType<typeof render>,
  isin: string,
  ex: 'KRX' | 'NXT',
): RelayQuote | null {
  return hook.result.current.quotes.get(relayQuoteKey(isin, ex)) ?? null;
}

function tapeOf(
  hook: ReturnType<typeof render>,
  isin: string,
  ex: 'KRX' | 'NXT',
): RelayTapeEntry[] {
  return hook.result.current.tapes.get(relayQuoteKey(isin, ex)) ?? [];
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ============================================================
// 테스트
// ============================================================

describe('useRelayConnection — 연결 게이트', () => {
  it('① enabled:false 면 WebSocket 을 만들지 않는다', async () => {
    const hook = render({ enabled: false });
    await settle();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.statusLabel).toBe('');
  });

  it('② 로그인 세션이 없으면 연결하지 않고 unauthorized 로 둔다', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const hook = render();
    await settle();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(hook.result.current.status).toBe('unauthorized');
    expect(hook.result.current.statusLabel).toBe(RELAY_STATE_LABELS.unauthorized);
  });
});

describe('useRelayConnection — 인증 (D-11 / T-15-04)', () => {
  it('③ 첫 전송이 {t:"auth", token} 이고 URL 에 토큰이 실리지 않는다', async () => {
    render();
    await settle();

    const ws = FakeWebSocket.last();
    await act(async () => {
      ws.accept();
    });

    const first = ws.parsedSent()[0];
    expect(first).toEqual({ t: 'auth', token: 'tok-abc' });
    expect(ws.url).toBe('ws://relay.test:8090/ws');
    expect(ws.url).not.toContain('tok-abc');
    expect(ws.url).not.toContain('?');
  });
});

describe('useRelayConnection — 상태 프레임 (D-36)', () => {
  it('④ state 프레임의 라벨이 RELAY_STATE_LABELS 와 일치한다', async () => {
    const hook = render();
    const ws = await connected(hook, 'declaring');

    expect(hook.result.current.status).toBe('declaring');
    expect(hook.result.current.statusLabel).toBe(RELAY_STATE_LABELS.declaring);

    await act(async () => {
      ws.push({ t: 'state', s: 'ready', msg: '세션 준비됨', accounts: [] });
    });

    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.statusLabel).toBe(RELAY_STATE_LABELS.ready);
    expect(hook.result.current.statusMessage).toBe('세션 준비됨');
  });
});

describe('useRelayConnection — 시세 키별 보관 (D-33 / D-37)', () => {
  it('⑤ 거래소 두 벌이 서로를 덮지 않고 각자 키에 남는다 (토글 왕복 깜빡임 0)', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
      ws.push(quoteFrame({ x: 'NXT', p: 69_800 }));
    });

    // 승격 전에는 별도 `quoteCacheRef` 가 하던 일을 키가 대신한다 — 토글해도 값이 사라지지
    // 않으므로 스켈레톤으로 되돌아갈 여지 자체가 없다.
    expect(quoteOf(hook, ISIN_A, 'KRX')?.p).toBe(70_000);
    expect(quoteOf(hook, ISIN_A, 'NXT')?.p).toBe(69_800);
    expect(quoteOf(hook, ISIN_B, 'KRX')).toBeNull();
  });

  it('⑤-a snap=false 델타는 같은 키에 병합되고 다른 키는 건드리지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
      ws.push(quoteFrame({ x: 'NXT', p: 69_800 }));
    });

    await act(async () => {
      ws.push({ t: 'q', i: ISIN_A, x: 'KRX', snap: false, p: 70_500 });
    });

    const krx = quoteOf(hook, ISIN_A, 'KRX');
    expect(krx?.p).toBe(70_500);
    // 병합이므로 델타에 없던 필드는 이전 스냅샷 값이 남아 있어야 한다
    expect(krx?.ul).toBe(89_700);
    expect(quoteOf(hook, ISIN_A, 'NXT')?.p).toBe(69_800);
  });
});

describe('useRelayConnection — 구독 참조계수', () => {
  it('⑥ 인증 ACK 이후 subscribe 가 sub 을, unsubscribe 가 unsub 을 보낸다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });
    expect(ws.parsedSent().at(-1)).toEqual({ t: 'sub', isin: ISIN_A, ex: 'KRX' });

    act(() => {
      hook.result.current.unsubscribe(ISIN_A, 'KRX');
    });
    expect(ws.parsedSent().at(-1)).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
  });

  it('⑥-a 인증 ACK 이전 구독은 보류됐다가 ACK 시점에 나간다 (close 4400 회피)', async () => {
    const hook = render();
    await settle();
    const ws = FakeWebSocket.last();
    await act(async () => {
      ws.accept();
    });

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });
    // auth 1건뿐 — 인증 전 sub 은 relay 가 close(4400) 로 끊는다
    expect(ws.parsedSent()).toEqual([{ t: 'auth', token: 'tok-abc' }]);

    await act(async () => {
      ws.push({ t: 'state', s: 'ready', accounts: [] });
    });

    expect(ws.parsedSent().at(-1)).toEqual({ t: 'sub', isin: ISIN_A, ex: 'KRX' });
  });

  it('⑥-b unauthorized 상태에서는 구독을 보내지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push({ t: 'state', s: 'unauthorized' });
    });

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });

    expect(ws.parsedSent().filter((m) => m.t === 'sub')).toHaveLength(0);
  });
});

describe('useRelayConnection — 재접속 규율 (D-16 / T-15-10)', () => {
  it('⑧ 서버가 닫으면 백오프 재접속하고, 데이터를 지우지 않고 isStale 만 세운다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
    });

    await act(async () => {
      ws.serverClose(1006);
    });

    expect(hook.result.current.status).toBe('reconnecting');
    expect(hook.result.current.attempt).toBe(1);
    expect(hook.result.current.isStale).toBe(true);
    // 마지막 값 유지 — 빈 화면으로 되돌리면 사용자가 문맥을 잃는다
    expect(quoteOf(hook, ISIN_A, 'KRX')?.p).toBe(70_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    // 백오프 1초 전에는 새 소켓이 없다
    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);

    // 새 스냅샷이 오면 신선도 회복
    const ws2 = FakeWebSocket.last();
    await act(async () => {
      ws2.accept();
    });
    await act(async () => {
      ws2.push({ t: 'state', s: 'ready', accounts: [] });
    });
    expect(hook.result.current.isStale).toBe(false);
    expect(hook.result.current.status).toBe('ready');
  });

  it('⑧-a 재접속하면 참조계수가 남아 있는 키를 자동으로 다시 구독한다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });
    expect(ws.parsedSent().filter((m) => m.t === 'sub')).toHaveLength(1);

    await act(async () => {
      ws.serverClose(1006);
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await settle();

    const ws2 = FakeWebSocket.last();
    await act(async () => {
      ws2.accept();
    });
    await act(async () => {
      ws2.push({ t: 'state', s: 'ready', accounts: [] });
    });

    // 새 소켓에서 **딱 1번** 다시 나간다 — 재구독을 빠뜨리면 재접속 후 화면이 굳는다
    expect(ws2.parsedSent().filter((m) => m.t === 'sub')).toEqual([
      { t: 'sub', isin: ISIN_A, ex: 'KRX' },
    ]);
  });

  it('⑨ close 4401 은 재접속하지 않고 unauthorized 로 확정한다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.serverClose(4401);
    });

    expect(hook.result.current.status).toBe('unauthorized');

    // 타이머를 아무리 진행해도 재연결 시도 0
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('⑩ 재접속 10회를 소진하면 manual_required 로 멈춘다 (무한 재시도 금지)', async () => {
    const hook = render();
    await settle();

    for (let i = 0; i < 11; i += 1) {
      const ws = FakeWebSocket.last();
      await act(async () => {
        ws.serverClose(1006);
      });
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      await settle();
    }

    expect(hook.result.current.status).toBe('manual_required');
    expect(hook.result.current.statusLabel).toBe(RELAY_STATE_LABELS.manual_required);
    expect(hook.result.current.attempt).toBe(10);
    // 최초 1 + 재접속 10 = 11. 11번째 close 이후로는 새 소켓이 없다
    expect(FakeWebSocket.instances).toHaveLength(11);
  });
});

describe('useRelayConnection — 정리 (cleanup)', () => {
  it('⑪ 언마운트 시 걸려 있던 구독을 unsub 하고 close(1000) 하며 타이머를 정리한다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });

    act(() => {
      hook.unmount();
    });

    const sent = ws.parsedSent();
    expect(sent.at(-1)).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
    expect(ws.closedWith).toEqual({ code: 1000 });

    // 타이머가 남아 있으면 언마운트 후에도 소켓이 다시 열린다
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('⑫ enabled 가 false 로 바뀌면 같은 정리 절차를 밟고 세션 데이터를 버린다 (D-23)', async () => {
    const hook = render({ enabled: true });
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });
    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
      ws.push(acctFrame());
    });
    expect(hook.result.current.account).not.toBeNull();

    await act(async () => {
      hook.rerender({ enabled: false });
    });

    expect(ws.parsedSent().at(-1)).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
    expect(ws.closedWith).toEqual({ code: 1000 });
    expect(hook.result.current.status).toBe('idle');
    // 로그아웃 뒤 이전 사용자의 잔고·시세가 메모리에 남으면 안 된다 (T-16-04)
    expect(hook.result.current.account).toBeNull();
    expect(hook.result.current.quotes.size).toBe(0);

    // 다시 켜면 새 소켓으로 깨끗하게 재연결된다
    await act(async () => {
      hook.rerender({ enabled: true });
    });
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe('useRelayConnection — 주문 상관 응답 (D-02)', () => {
  it('⑰ order.result 는 같은 rid 의 Promise 로 흘러가고 상태에 쌓이지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    let settled: unknown = null;
    act(() => {
      void hook.result.current.sendOrder(orderNew('r-1')).then((r) => {
        settled = r;
      });
    });

    expect(ws.parsedSent().at(-1)).toMatchObject({ t: 'order.new', rid: 'r-1' });

    await act(async () => {
      ws.push({
        t: 'order.result',
        rid: 'r-1',
        orderNo: 'A100',
        resultCode: 0,
        message: '',
        status: 'accepted',
      });
    });

    expect(settled).toMatchObject({ rid: 'r-1', orderNo: 'A100', status: 'accepted' });
    // 상관 응답은 1회성이다 — 주문 통보 누적(`orders`)은 `{t:"order"}` 푸시의 몫이다
    expect(hook.result.current.orders).toEqual([]);
  });

  it('⑰-a 소켓이 없으면 rejected 로, 응답이 없으면 timeout 으로 갈라 돌려준다', async () => {
    const hook = render({ enabled: false });
    await settle();

    let offline: { status?: string } | null = null;
    await act(async () => {
      offline = await hook.result.current.sendOrder(orderNew('r-off'));
    });
    // 보내지 **않았음**이 확실한 경우와 결과를 모르는 경우를 뭉개면 재주문 안전성을
    // 판단할 수 없다 (Pitfall 9).
    expect(offline!.status).toBe('rejected');

    await act(async () => {
      hook.rerender({ enabled: true });
    });
    const ws = await connected(hook);
    expect(ws).toBeTruthy();

    let hung: { status?: string } | null = null;
    act(() => {
      void hook.result.current.sendOrder(orderNew('r-hang')).then((r) => {
        hung = r;
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(hung!.status).toBe('timeout');
  });
});

describe('useRelayConnection — 프레임 견고성', () => {
  it('⑬ 체결 테이프 링버퍼는 200건을 넘지 않고 최신이 앞에 온다', async () => {
    const hook = render();
    const ws = await connected(hook);

    const batch1 = Array.from({ length: 150 }, (_, k) => tapeEntry(k + 1));
    const batch2 = Array.from({ length: 100 }, (_, k) => tapeEntry(k + 151));

    await act(async () => {
      ws.push(tapeFrame(batch1));
      ws.push(tapeFrame(batch2));
    });

    const tape = tapeOf(hook, ISIN_A, 'KRX');
    expect(tape).toHaveLength(200);
    // 배치는 시간 오름차순 → 마지막 체결이 index 0
    expect(tape[0]?.p).toBe(tapeEntry(250).p);
    // 가장 오래된 50건은 상한을 넘어 잘려나간다
    expect(tape.some((e) => e.p === tapeEntry(1).p)).toBe(false);
  });

  it('⑬-a 체결 테이프도 키별로 나뉜다 — 다른 종목의 체결이 섞이지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(tapeFrame([tapeEntry(1), tapeEntry(2)], true));
      ws.push(tapeFrame([tapeEntry(9)], true, { i: ISIN_B }));
    });

    expect(tapeOf(hook, ISIN_A, 'KRX')).toHaveLength(2);
    expect(tapeOf(hook, ISIN_B, 'KRX')).toHaveLength(1);
  });

  it('⑭ 깨진 JSON 프레임과 알 수 없는 t 는 throw 없이 스킵한다 (T-15-41)', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
    });

    expect(() => {
      act(() => {
        ws.pushRaw('{ 이건 JSON 이 아니다');
        ws.pushRaw('null');
        ws.push({ t: 'brand-new-frame-type', whatever: 1 });
      });
    }).not.toThrow();

    // 상태는 그대로 유지된다
    expect(quoteOf(hook, ISIN_A, 'KRX')?.p).toBe(70_000);
    expect(hook.result.current.status).toBe('ready');
  });

  it('⑮ acct 델타는 upsert + rm 제거로 병합된다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(
        acctFrame({
          snap: true,
          unf: [
            {
              orderNo: 'A1',
              orgOrderNo: '',
              isin: ISIN_A,
              side: 'B',
              price: 69_900,
              orderQty: 10,
              filledQty: 0,
              unfilledQty: 10,
              exchange: 'KRX',
            },
          ],
        }),
      );
    });
    expect(hook.result.current.account?.unf).toHaveLength(1);

    await act(async () => {
      ws.push(
        acctFrame({
          snap: false,
          hold: [{ isin: ISIN_A, qty: 20, sellableQty: 20, avgPrice: 68_800 }],
          unf: [],
          rm: ['A1'],
        }),
      );
    });

    expect(hook.result.current.account?.unf).toHaveLength(0);
    expect(hook.result.current.account?.hold[0]?.qty).toBe(20);
    // 소비자가 델타를 다시 해석하지 않도록 스냅샷 형태로 정규화한다
    expect(hook.result.current.account?.snap).toBe(true);
    expect(hook.result.current.account?.rm).toEqual([]);
  });

  // ----------------------------------------------------------
  // 0 수량 = 삭제 신호 (gh-trade quick-260906-e8b).
  // relay 캐시(`subscription-hub.ts` 의 `#mergeAccountState`)와 **같은 규칙**이어야 한다 —
  // 갈리면 새 탭(캐시 재생)과 기존 탭(델타 누적)이 다른 잔고를 본다.
  // ----------------------------------------------------------

  it('⑮-a 구버전 스냅샷에 섞여 온 0 잔고·0 미체결은 저장하지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(
        acctFrame({
          snap: true,
          hold: [
            { isin: ISIN_A, qty: 30, sellableQty: 30, avgPrice: 68_500 },
            { isin: ISIN_B, qty: 0, sellableQty: 0, avgPrice: 0 },
          ],
          unf: [
            {
              orderNo: 'A1',
              orgOrderNo: '',
              isin: ISIN_A,
              side: 'B',
              price: 69_900,
              orderQty: 10,
              filledQty: 10,
              unfilledQty: 0,
              exchange: 'KRX',
            },
          ],
        }),
      );
    });

    expect(hook.result.current.account?.hold.map((h) => h.isin)).toEqual([ISIN_A]);
    expect(hook.result.current.account?.unf).toEqual([]);
  });

  it('⑮-b 델타의 수량 0 톰스톤 잔고 행이 기존 보유 종목을 지운다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push(
        acctFrame({
          snap: true,
          hold: [
            { isin: ISIN_A, qty: 30, sellableQty: 30, avgPrice: 68_500 },
            { isin: ISIN_B, qty: 12, sellableQty: 12, avgPrice: 51_000 },
          ],
        }),
      );
    });
    expect(hook.result.current.account?.hold).toHaveLength(2);

    // 전량 매도 → 서버가 맵에서 지우고 0/0/0 행으로 알린다. 잔고에는 `rm` 이 없다.
    await act(async () => {
      ws.push(
        acctFrame({
          snap: false,
          hold: [{ isin: ISIN_A, qty: 0, sellableQty: 0, avgPrice: 0 }],
          unf: [],
          rm: [],
        }),
      );
    });

    expect(hook.result.current.account?.hold.map((h) => h.isin)).toEqual([ISIN_B]);
  });

  it('⑮-c 델타의 unfilledQty 0 행은 rm 없이도 미체결에서 사라진다', async () => {
    const hook = render();
    const ws = await connected(hook);

    const unf = (orderNo: string, unfilledQty: number, filledQty: number): RelayUnfilled => ({
      orderNo,
      orgOrderNo: '',
      isin: ISIN_A,
      side: 'B',
      price: 69_900,
      orderQty: 10,
      filledQty,
      unfilledQty,
      exchange: 'KRX',
    });

    await act(async () => {
      ws.push(acctFrame({ snap: true, unf: [unf('A1', 10, 0), unf('A2', 5, 5)] }));
    });
    expect(hook.result.current.account?.unf).toHaveLength(2);

    await act(async () => {
      ws.push(
        acctFrame({ snap: false, hold: [], unf: [unf('A1', 0, 10), unf('A2', 3, 7)], rm: [] }),
      );
    });

    expect(hook.result.current.account?.unf.map((u) => u.orderNo)).toEqual(['A2']);
    expect(hook.result.current.account?.unf[0]?.unfilledQty).toBe(3);
  });

  it("⑮-d 같은 델타가 한 주문을 갱신하면서 rm 으로도 지우면 최종은 '없음'이다", async () => {
    const hook = render();
    const ws = await connected(hook);

    const unf = (unfilledQty: number): RelayUnfilled => ({
      orderNo: 'A1',
      orgOrderNo: '',
      isin: ISIN_A,
      side: 'B',
      price: 69_900,
      orderQty: 10,
      filledQty: 10 - unfilledQty,
      unfilledQty,
      exchange: 'KRX',
    });

    await act(async () => {
      ws.push(acctFrame({ snap: true, unf: [unf(10)] }));
    });

    // upsert 와 삭제가 한 프레임에 실린 경우 — 삭제가 이긴다(순서: upsert → rm).
    await act(async () => {
      ws.push(acctFrame({ snap: false, hold: [], unf: [unf(4)], rm: ['A1'] }));
    });

    expect(hook.result.current.account?.unf).toEqual([]);
  });

  it('⑯ msg 프레임은 최신 우선으로 누적된다 (상태 바 최근 3건의 원천)', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      for (let k = 1; k <= 4; k += 1) {
        ws.push({ t: 'msg', lv: 'INFO', m: `알림 ${k}`, i: '', a: '', src: 'System', kind: '' });
      }
    });

    const messages = hook.result.current.messages;
    expect(messages[0]?.m).toBe('알림 4');
    expect(messages).toHaveLength(4);
  });
});
