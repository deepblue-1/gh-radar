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
  RelayRateCrossItem,
  RelayTape,
  RelayTapeEntry,
  RelayUnfilled,
  RelayViOrderItem,
} from '@gh-radar/shared';
import {
  RELAY_MARKET_BATCH_MS,
  RELAY_MARKET_BUFFER_MAX,
  relayQuoteKey,
  useRelayConnection,
  type RelayConnectionState,
} from '../use-relay-socket';

const ISIN_A = 'KR7005930003';
/** 로그에 **새면 안 되는** 값. 계좌번호가 콘솔에 찍히는지 단언에 쓴다(T-16-18). */
const ACCOUNT_NO = '37728502101';
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
    kc: 0,
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
    bs: '',
  };
}

function tapeFrame(
  entries: RelayTapeEntry[],
  snap = false,
  over: Partial<RelayTape> = {},
): RelayTape {
  return { t: 'tape', i: ISIN_A, x: 'KRX', snap, e: entries, ...over };
}

/** `acctFrame` 기본 계좌번호. 단언이 「어느 계좌인가」를 명시할 수 있게 상수로 둔다. */
const ACCT_NO = '12345678-01';

function acctFrame(over: Partial<RelayAccountState> = {}): RelayAccountState {
  return {
    t: 'acct',
    a: ACCT_NO,
    snap: true,
    hold: [{ isin: ISIN_A, qty: 10, sellableQty: 10, avgPrice: 68_500 }],
    unf: [],
    rm: [],
    st: '09:30:15',
    ...over,
  };
}

/**
 * `acctFrame` 이 쓰는 기본 계좌의 병합 결과.
 *
 * 16-23 에서 「마지막 수신 계좌」 단일 필드(`account`)가 계약에서 제거됐다 — 계좌 축은
 * **계좌번호로 골라야** 한다(CR-01). 그래서 단언도 계좌번호를 명시한다.
 */
function acctOf(current: {
  accountStates: ReadonlyMap<string, RelayAccountState>;
}): RelayAccountState | null {
  return current.accountStates.get(ACCT_NO) ?? null;
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

/**
 * 대기 중인 시세·체결 배치를 흘려보낸다 (quick-260923-elb 1a).
 *
 * q/tape 는 도착 즉시가 아니라 **≤ `RELAY_MARKET_BATCH_MS` 뒤** 한 번에 반영된다 — 관측 계약이
 * 바뀐 것이지 값이 바뀐 것이 아니다. 시세만 push 하고 곧바로 읽는 단언은 이 호출을 앞에 둔다.
 */
function flushMarket(): void {
  act(() => {
    vi.advanceTimersByTime(RELAY_MARKET_BATCH_MS);
  });
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
    flushMarket();

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
    flushMarket();

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

describe('useRelayConnection — 구독 level (quick-260923-ge2)', () => {
  const subs = (ws: FakeWebSocket) => ws.parsedSent().filter((m) => m.t === 'sub');
  const unsubs = (ws: FakeWebSocket) => ws.parsedSent().filter((m) => m.t === 'unsub');

  it('W1 price 구독은 lv:"price" 를 싣는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX', 'price');
    });

    expect(ws.parsedSent().at(-1)).toEqual({ t: 'sub', isin: ISIN_A, ex: 'KRX', lv: 'price' });
  });

  it('W2 price 위에 full 이 붙으면 같은 키로 sub 을 다시 보내고 full 프레임은 종전 모양이다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX', 'price');
    });
    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });

    expect(subs(ws)).toEqual([
      { t: 'sub', isin: ISIN_A, ex: 'KRX', lv: 'price' },
      { t: 'sub', isin: ISIN_A, ex: 'KRX' },
    ]);
    expect(unsubs(ws)).toHaveLength(0);
  });

  it('W3 full 이 빠지면 lv:"price" 로 강등 재송신하고, 마지막 price 이탈에서 unsub 한다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });
    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX', 'price');
    });
    expect(subs(ws)).toHaveLength(1);

    act(() => {
      hook.result.current.unsubscribe(ISIN_A, 'KRX');
    });
    expect(subs(ws)).toHaveLength(2);
    expect(ws.parsedSent().at(-1)).toEqual({ t: 'sub', isin: ISIN_A, ex: 'KRX', lv: 'price' });
    expect(unsubs(ws)).toHaveLength(0);

    act(() => {
      hook.result.current.unsubscribe(ISIN_A, 'KRX', 'price');
    });
    expect(ws.parsedSent().at(-1)).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
  });

  it('W4 인증 ACK 이전 price 구독은 보류됐다가 ACK 시점에 lv:"price" 로 나간다', async () => {
    const hook = render();
    await settle();
    const ws = FakeWebSocket.last();
    await act(async () => {
      ws.accept();
    });

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX', 'price');
    });
    expect(ws.parsedSent()).toEqual([{ t: 'auth', token: 'tok-abc' }]);

    await act(async () => {
      ws.push({ t: 'state', s: 'ready', accounts: [] });
    });

    expect(ws.parsedSent().at(-1)).toEqual({ t: 'sub', isin: ISIN_A, ex: 'KRX', lv: 'price' });
  });

  it('W5 재접속 재구독도 실효 level 로 나간다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX', 'price');
    });
    expect(subs(ws)).toHaveLength(1);

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

    expect(subs(ws2)).toEqual([{ t: 'sub', isin: ISIN_A, ex: 'KRX', lv: 'price' }]);
  });

  it('W6 잡지 않은 level 의 해제는 무시한다 (카운트가 새지 않는다)', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
    });
    const before = ws.parsedSent().length;

    act(() => {
      hook.result.current.unsubscribe(ISIN_A, 'KRX', 'price');
    });
    expect(ws.parsedSent()).toHaveLength(before);

    act(() => {
      hook.result.current.unsubscribe(ISIN_A, 'KRX');
    });
    expect(unsubs(ws)).toEqual([{ t: 'unsub', isin: ISIN_A, ex: 'KRX' }]);
  });
});

describe('useRelayConnection — 구독 제어 속도 (quick-260923-kq1)', () => {
  const isinOf = (i: number) => `KR7${String(i).padStart(6, '0')}000`;
  const subs = (ws: FakeWebSocket) => ws.parsedSent().filter((m) => m.t === 'sub');
  const unsubs = (ws: FakeWebSocket) => ws.parsedSent().filter((m) => m.t === 'unsub');

  it('P1 한꺼번에 몰린 구독은 초당 6건으로 나가고, 카드(full)가 돌파 칩(price)보다 먼저다', async () => {
    const hook = render();
    const ws = await connected(hook);

    // 재접속 직후처럼 칩 20 건이 먼저 등록되고 카드 2 건이 뒤에 온다 — 인증 전이라 한 번에 흘러간다.
    act(() => {
      for (let i = 0; i < 20; i += 1) hook.result.current.subscribe(isinOf(i), 'KRX', 'price');
    });
    // 칩이 버킷 6 을 먼저 썼다. 카드는 다음 토큰에서 칩보다 먼저 나가야 한다.
    expect(subs(ws)).toHaveLength(6);
    act(() => {
      hook.result.current.subscribe(ISIN_A, 'KRX');
      hook.result.current.subscribe(ISIN_B, 'KRX');
    });
    expect(subs(ws)).toHaveLength(6);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    const afterFirstRefill = subs(ws).slice(6);
    expect(afterFirstRefill.slice(0, 2)).toEqual([
      { t: 'sub', isin: ISIN_A, ex: 'KRX' },
      { t: 'sub', isin: ISIN_B, ex: 'KRX' },
    ]);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    // 전부 결국 나간다 — 누락 없이 22 건, 키 중복 없이.
    const all = subs(ws);
    expect(all).toHaveLength(22);
    expect(new Set(all.map((f) => (f as { isin: string }).isin)).size).toBe(22);
  });

  it('P2 버킷이 빈 동안 해제된 키를 다시 구독하면 unsub·sub 을 보내지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      for (let i = 0; i < 6; i += 1) hook.result.current.subscribe(isinOf(i), 'KRX');
    });
    expect(subs(ws)).toHaveLength(6);

    act(() => {
      hook.result.current.unsubscribe(isinOf(0), 'KRX');
      hook.result.current.subscribe(isinOf(0), 'KRX');
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(unsubs(ws)).toEqual([]);
    expect(subs(ws)).toHaveLength(6);
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
    expect(acctOf(hook.result.current)).not.toBeNull();

    await act(async () => {
      hook.rerender({ enabled: false });
    });

    expect(ws.parsedSent().at(-1)).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
    expect(ws.closedWith).toEqual({ code: 1000 });
    expect(hook.result.current.status).toBe('idle');
    // 로그아웃 뒤 이전 사용자의 잔고·시세가 메모리에 남으면 안 된다 (T-16-04)
    expect(acctOf(hook.result.current)).toBeNull();
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

describe('useRelayConnection — 전략 송신구 `send` (T-16-19 / PC-7)', () => {
  it('⑱ 소켓이 열리기 전 send 는 false 를 돌려주고 console.error 를 한 번 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = render({ enabled: false });
    await settle();

    let sent: boolean | null = null;
    act(() => {
      sent = hook.result.current.send({
        t: 'vi.set',
        accountNo: ACCOUNT_NO,
        orderAmountKrw: 10_000_000,
        checkRate: 22,
        run: true,
      });
    });

    // 보내지 **않았음**이 반환값으로 드러난다 — 조용한 드롭은 PC-7 위반이다.
    expect(sent).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);

    const logged = String(spy.mock.calls[0]?.[0]);
    // 메시지 종류는 남는다 — 무엇이 사라졌는지 알 수 없으면 로그가 아니다.
    expect(logged).toContain('t=vi.set');
    // ★ 계좌번호는 남지 않는다 (T-16-18). 이 로그가 나가는 곳은 브라우저 콘솔이다.
    expect(logged).not.toContain(ACCOUNT_NO);
    expect(logged).not.toContain('10000000');

    spy.mockRestore();
  });

  it('⑱-a 연결 후 send 는 true 를 돌려주고 소켓에 정확히 1프레임이 나간다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = render();
    const ws = await connected(hook);
    const before = ws.sent.length;

    let sent: boolean | null = null;
    act(() => {
      sent = hook.result.current.send({ t: 'strategies.disable' });
    });

    expect(sent).toBe(true);
    expect(ws.sent).toHaveLength(before + 1);
    expect(ws.parsedSent().at(-1)).toEqual({ t: 'strategies.disable' });
    // 정상 경로에서는 로그가 없다 — 매 송신마다 콘솔이 더러워지면 아무도 안 본다.
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
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
    flushMarket();

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
    flushMarket();

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
              orderTime: '093015',
              queuedStatus: '',
              pendingStatus: '',
              board: '',
              pendingCancelSent: false,
              exchange: 'KRX',
            },
          ],
        }),
      );
    });
    expect(acctOf(hook.result.current)?.unf).toHaveLength(1);

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

    expect(acctOf(hook.result.current)?.unf).toHaveLength(0);
    expect(acctOf(hook.result.current)?.hold[0]?.qty).toBe(20);
    // 소비자가 델타를 다시 해석하지 않도록 스냅샷 형태로 정규화한다
    expect(acctOf(hook.result.current)?.snap).toBe(true);
    expect(acctOf(hook.result.current)?.rm).toEqual([]);
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
              orderTime: '093015',
              queuedStatus: '',
              pendingStatus: '',
              board: '',
              pendingCancelSent: false,
              exchange: 'KRX',
            },
          ],
        }),
      );
    });

    expect(acctOf(hook.result.current)?.hold.map((h) => h.isin)).toEqual([ISIN_A]);
    expect(acctOf(hook.result.current)?.unf).toEqual([]);
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
    expect(acctOf(hook.result.current)?.hold).toHaveLength(2);

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

    expect(acctOf(hook.result.current)?.hold.map((h) => h.isin)).toEqual([ISIN_B]);
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
      orderTime: '093015',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
      exchange: 'KRX',
    });

    await act(async () => {
      ws.push(acctFrame({ snap: true, unf: [unf('A1', 10, 0), unf('A2', 5, 5)] }));
    });
    expect(acctOf(hook.result.current)?.unf).toHaveLength(2);

    await act(async () => {
      ws.push(
        acctFrame({ snap: false, hold: [], unf: [unf('A1', 0, 10), unf('A2', 3, 7)], rm: [] }),
      );
    });

    expect(acctOf(hook.result.current)?.unf.map((u) => u.orderNo)).toEqual(['A2']);
    expect(acctOf(hook.result.current)?.unf[0]?.unfilledQty).toBe(3);
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
      orderTime: '093015',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
      exchange: 'KRX',
    });

    await act(async () => {
      ws.push(acctFrame({ snap: true, unf: [unf(10)] }));
    });

    // upsert 와 삭제가 한 프레임에 실린 경우 — 삭제가 이긴다(순서: upsert → rm).
    await act(async () => {
      ws.push(acctFrame({ snap: false, hold: [], unf: [unf(4)], rm: ['A1'] }));
    });

    expect(acctOf(hook.result.current)?.unf).toEqual([]);
  });

  it('⑮-e orderIndex 는 원시 acct 의 unf 행(0 행 포함)을 병합 필터 **전에** 추가만 한다 (quick-260923-pgu)', async () => {
    const hook = render();
    const ws = await connected(hook);

    const row = (orderNo: string, unfilledQty: number, over: Partial<RelayUnfilled> = {}): RelayUnfilled => ({
      orderNo,
      orgOrderNo: '',
      isin: ISIN_A,
      side: 'B',
      price: 69_900,
      orderQty: 10,
      filledQty: 10 - unfilledQty,
      unfilledQty,
      orderTime: '093015',
      queuedStatus: '',
      pendingStatus: '',
      board: '',
      pendingCancelSent: false,
      exchange: 'KRX',
      name: '삼성전자',
      ...over,
    });

    expect(hook.result.current.orderIndex.size).toBe(0);

    await act(async () => {
      ws.push(acctFrame({ snap: true, unf: [row('A1', 10)] }));
    });
    // 한 델타 안에서 접수+전량 체결된 주문 — 미체결 상태에는 없지만 색인에는 있다.
    await act(async () => {
      ws.push(acctFrame({ snap: false, hold: [], unf: [row('A2', 0, { isin: ISIN_B, side: 'S' })], rm: [] }));
    });
    expect(acctOf(hook.result.current)?.unf.map((u) => u.orderNo)).toEqual(['A1']);
    expect(hook.result.current.orderIndex.get('A2')).toMatchObject({
      isin: ISIN_B,
      side: 'S',
      exchange: 'KRX',
      orderQty: 10,
      accountNo: ACCT_NO,
    });

    // 전량 체결·rm 으로 미체결에서 빠져도 색인은 남는다(add-only).
    const before = hook.result.current.orderIndex;
    await act(async () => {
      ws.push(acctFrame({ snap: false, hold: [], unf: [], rm: ['A1'] }));
    });
    expect(acctOf(hook.result.current)?.unf).toEqual([]);
    expect(hook.result.current.orderIndex.get('A1')).toMatchObject({ isin: ISIN_A, name: '삼성전자' });
    // 새 행이 없는 프레임은 색인 참조를 바꾸지 않는다.
    expect(hook.result.current.orderIndex).toBe(before);
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

describe('시세·체결 프레임 배치 (quick-260923-elb 1a)', () => {
  /**
   * 렌더 수를 세는 하네스. 배치의 계약은 「값」이 아니라 **커밋 수**다 — 창 안의 프레임이
   * 몇 건이든 상태 갱신은 1번이어야 `/trading` 트리 전체가 프레임마다 다시 그려지지 않는다.
   */
  function renderCounted() {
    const counter = { renders: 0 };
    const hook = renderHook(
      (props: HookProps) => {
        counter.renders += 1;
        return useRelayConnection(props);
      },
      { initialProps: { enabled: true } },
    );
    return { hook, counter };
  }

  it('ⓐ 창 안의 여러 시세는 창이 닫힐 때 한 번에 반영된다 — 종목별 순차 병합과 같은 결과 · 렌더 +1', async () => {
    const { hook, counter } = renderCounted();
    const ws = await connected(hook);
    const before = counter.renders;

    act(() => {
      ws.push(quoteFrame({ p: 70_000 }));
      ws.push({ t: 'q', i: ISIN_A, x: 'KRX', snap: false, p: 70_500 });
      ws.push(quoteFrame({ i: ISIN_B, p: 51_000 }));
      ws.push({ t: 'q', i: ISIN_A, x: 'KRX', snap: false, p: 70_700 });
    });

    act(() => {
      vi.advanceTimersByTime(RELAY_MARKET_BATCH_MS - 1);
    });
    expect(quoteOf(hook, ISIN_A, 'KRX')).toBeNull();
    expect(quoteOf(hook, ISIN_B, 'KRX')).toBeNull();
    expect(counter.renders).toBe(before);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const a = quoteOf(hook, ISIN_A, 'KRX');
    // 마지막 값이 이긴다 + snap 뒤 delta 는 필드 병합(델타에 없던 상한가가 남는다)
    expect(a?.p).toBe(70_700);
    expect(a?.ul).toBe(89_700);
    expect(quoteOf(hook, ISIN_B, 'KRX')?.p).toBe(51_000);
    expect(counter.renders).toBe(before + 1);
  });

  const LC_KEY = `${ISIN_A}:12345678-01:KRX`;
  const NON_MARKET: Array<[string, Record<string, unknown>, (s: RelayConnectionState) => void]> = [
    ['acct', { ...acctFrame() }, (s) => expect(acctOf(s)).not.toBeNull()],
    [
      'order',
      { t: 'order', no: 'A100', nt: 'A', rc: 0, msg: '', org: '', p: 69_900, q: 10, x: 'KRX' },
      (s) => expect(s.orders[0]?.no).toBe('A100'),
    ],
    [
      'lc',
      {
        t: 'lc',
        item: {
          isin: ISIN_A,
          accountNo: '12345678-01',
          exchange: 'KRX',
          key: LC_KEY,
          crud: 'C',
          buyEnabled: true,
          sellEnabled: false,
          sweepEnabled: false,
        },
      },
      (s) => expect(s.lastLimitChaserEcho?.key).toBe(LC_KEY),
    ],
    [
      'vi.notice',
      {
        t: 'vi.notice',
        isin: ISIN_A,
        accountNo: '12345678-01',
        triggerPrice: 86_000,
        basePrice: 69_000,
        changeRate: 24,
        orderPrice: 89_700,
        orderQty: 10,
        market: 'K',
        orderSeq: 1,
        viEndTime: '093215000',
      },
      (s) => expect(s.viNotices).toHaveLength(1),
    ],
    [
      'msg',
      { t: 'msg', lv: 'INFO', m: '알림', i: '', a: '', src: 'System', kind: '' },
      (s) => expect(s.messages[0]?.m).toBe('알림'),
    ],
    [
      'state',
      { t: 'state', s: 'ready', msg: '반복 프레임' },
      (s) => expect(s.statusMessage).toBe('반복 프레임'),
    ],
  ];

  it.each(NON_MARKET)(
    'ⓑ 시세 대기 중 %s 프레임은 지연 없이 — 대기 시세와 **같은 렌더**에서 함께 보이고 버퍼는 빈다',
    async (_name, frame, check) => {
      const { hook, counter } = renderCounted();
      const ws = await connected(hook);

      act(() => {
        ws.push(quoteFrame({ p: 70_000 }));
      });
      expect(quoteOf(hook, ISIN_A, 'KRX')).toBeNull();
      const before = counter.renders;

      act(() => {
        ws.push(frame);
      });
      // 타이머를 진행하지 않았다 — 거래 신호는 배치 창을 기다리지 않는다(T-elb-02).
      expect(counter.renders).toBe(before + 1);
      expect(quoteOf(hook, ISIN_A, 'KRX')?.p).toBe(70_000);
      check(hook.result.current);

      // 대기분은 이미 같은 dispatch 로 나갔다 — 창이 닫혀도 더 그릴 것이 없다.
      act(() => {
        vi.advanceTimersByTime(RELAY_MARKET_BATCH_MS);
      });
      expect(counter.renders).toBe(before + 1);
    },
  );

  it('ⓒ 대기 시세는 소켓이 닫혀도 버려지지 않는다 — 닫힌 소켓의 마지막 틱까지 유지하고 isStale', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      ws.push(quoteFrame({ p: 70_000 }));
      ws.push({ t: 'q', i: ISIN_A, x: 'KRX', snap: false, p: 70_300 });
    });
    act(() => {
      ws.serverClose(1006);
    });

    expect(quoteOf(hook, ISIN_A, 'KRX')?.p).toBe(70_300);
    // snap q 가 isStale 을 내리므로 flush 가 stale 전이보다 먼저여야 이 값이 true 다.
    expect(hook.result.current.isStale).toBe(true);
  });

  it('ⓓ 언마운트는 배치 타이머를 남기지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      ws.push(quoteFrame({ p: 70_000 }));
    });
    act(() => {
      hook.unmount();
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('ⓓ-2 enabled:false 전환은 대기 시세까지 버리고 초기값으로 돌아간다 (T-16-04)', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      ws.push(quoteFrame({ p: 70_000 }));
    });
    await act(async () => {
      hook.rerender({ enabled: false });
    });

    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.quotes.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ⓔ 알림 수신 시각(toLocaleTimeString)은 msg 프레임에서만 계산한다', async () => {
    const hook = render();
    const ws = await connected(hook);
    const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');

    act(() => {
      for (let k = 0; k < 20; k += 1) {
        ws.push({ t: 'q', i: ISIN_A, x: 'KRX', snap: false, p: 70_000 + k });
        ws.push(tapeFrame([tapeEntry(k + 1)]));
      }
    });
    flushMarket();
    expect(tapeOf(hook, ISIN_A, 'KRX')).toHaveLength(20);
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      ws.push({ t: 'msg', lv: 'INFO', m: '알림', i: '', a: '', src: 'System', kind: '' });
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(hook.result.current.messages[0]?.receivedAt).not.toBe('');

    spy.mockRestore();
  });

  it('ⓕ 대기 버퍼가 RELAY_MARKET_BUFFER_MAX 에 닿으면 타이머 없이 바로 반영된다 (숨은 탭 안전판)', async () => {
    const hook = render();
    const ws = await connected(hook);

    act(() => {
      for (let k = 0; k < RELAY_MARKET_BUFFER_MAX; k += 1) {
        ws.push(quoteFrame({ p: 70_000 + k }));
      }
    });

    expect(quoteOf(hook, ISIN_A, 'KRX')?.p).toBe(70_000 + RELAY_MARKET_BUFFER_MAX - 1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('rate.cross 순서 — 최신 돌파가 맨 위 (사용자 결정 2026-09-22)', () => {
  // 축은 relay `sortRateCrossNewestFirst` 와 같다: exchangeTime ↓ · 동률이면 isin ↑.
  function crossItem(isin: string, exchangeTime: string, lastPrice = 10_000): RelayRateCrossItem {
    return {
      isin,
      exchange: 'KRX',
      lastPrice,
      changeRate: 12.5,
      thresholdPct: 10,
      basePrice: 8_900,
      exchangeTime,
      serverTime: '09:00:00',
    };
  }
  const A = 'KR7005930003';
  const B = 'KR7000660001';
  const C = 'KR7035720002';

  function isinsOf(hook: ReturnType<typeof render>): string[] {
    return hook.result.current.rateCrossItems.map((i) => i.isin);
  }

  it('① 78 은 서버 원순서(오름차순)와 무관하게 최신 위로 놓이고, 새 76 종목은 맨 위에 온다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push({
        t: 'rate.cross.snap',
        items: [crossItem(A, '090100000001'), crossItem(B, '090300000003')],
      });
    });
    expect(isinsOf(hook)).toEqual([B, A]);

    await act(async () => {
      ws.push({ t: 'rate.cross', item: crossItem(C, '090500000005') });
    });
    expect(isinsOf(hook)).toEqual([C, B, A]);
  });

  it('② 같은 isin+exchange · 같은 exchangeTime 의 76(구간 안 갱신)은 자리를 지키고 값만 바뀐다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push({
        t: 'rate.cross.snap',
        items: [
          crossItem(A, '090100000001'),
          crossItem(B, '090300000003'),
          crossItem(C, '090500000005'),
        ],
      });
    });
    expect(isinsOf(hook)).toEqual([C, B, A]);

    // 가운데 원소 B 의 구간 안 갱신 — exchangeTime 은 구간을 연 시각이라 그대로다.
    await act(async () => {
      ws.push({ t: 'rate.cross', item: crossItem(B, '090300000003', 11_500) });
    });
    expect(isinsOf(hook)).toEqual([C, B, A]);
    expect(hook.result.current.rateCrossItems[1]?.lastPrice).toBe(11_500);
  });

  it('③ 같은 종목의 더 늦은 exchangeTime(이탈 후 재돌파 = 새 구간)은 맨 위로 오른다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push({
        t: 'rate.cross.snap',
        items: [crossItem(A, '090100000001'), crossItem(B, '090300000003')],
      });
    });
    expect(isinsOf(hook)).toEqual([B, A]);

    await act(async () => {
      ws.push({ t: 'rate.cross', item: crossItem(A, '091000000010') });
    });
    expect(isinsOf(hook)).toEqual([A, B]);
    expect(hook.result.current.rateCrossItems).toHaveLength(2);
  });

  it('④ exchangeTime 동률이면 isin 오름차순', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push({
        t: 'rate.cross.snap',
        items: [crossItem(C, '090500000005'), crossItem(A, '090100000001'), crossItem(B, '090500000005')],
      });
    });
    expect(isinsOf(hook)).toEqual([B, C, A]);
  });
});

describe('vi.list 순서 — 최신 발동이 맨 앞 (quick-260923-dmb)', () => {
  // 축: deadline110Ms ↓ · 동률이면 주문번호 있는 행 먼저(주문번호 ↓) · 시각 모름(≤0)은 맨 뒤.
  // 게이트웨이 72 는 생성 순(오래된 것 먼저)으로 오고 relay 는 그대로 팬아웃한다 — 정렬은
  // 리듀서 `sortViOrdersNewestFirst` 한 곳이다.
  const T = Date.UTC(2026, 8, 23, 0, 30, 0);
  function viItem(over: Partial<RelayViOrderItem> = {}): RelayViOrderItem {
    return {
      isin: 'KR7096530001',
      exchange: 'KRX',
      market: 'Q',
      accountNo: ACCOUNT_NO,
      orderNo: '3407000071',
      orderQty: 256,
      orderPrice: 38_950,
      triggerPrice: 38_550,
      basePrice: 30_000,
      viEndTime: '094331000',
      deadline110Ms: T + 84_000,
      deadline119Ms: T + 93_000,
      confirmed: false,
      confirmLocked: false,
      state: 'Accepted',
      filledQty: 0,
      name: '씨젠',
      ...over,
    };
  }
  const A = viItem({ orderNo: '0000000001', isin: 'KR7005930003', deadline110Ms: T + 10_000 });
  const B = viItem({ orderNo: '0000000002', isin: 'KR7000660001', deadline110Ms: T + 50_000 });
  const C = viItem({ orderNo: '0000000003', isin: 'KR7035720002', deadline110Ms: T + 90_000 });

  function orderNosOf(hook: ReturnType<typeof render>): string[] {
    return hook.result.current.viOrders.map((i) => i.orderNo);
  }

  it('① 72 가 오래된 순으로 와도 최신 발동이 맨 앞이다 — frame.items 는 제자리에서 바뀌지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);
    const items = [A, B, C];

    await act(async () => {
      ws.push({ t: 'vi.list', snap: true, items });
    });
    expect(orderNosOf(hook)).toEqual(['0000000003', '0000000002', '0000000001']);
    // 입력 배열 불변(T-dmb-01) — 복사 후 정렬.
    expect(items.map((i) => i.orderNo)).toEqual(['0000000001', '0000000002', '0000000003']);
  });

  it('② 73 신규(더 늦은 발동)는 맨 앞으로, 73 갱신(같은 deadline)은 자리를 지킨다', async () => {
    const hook = render();
    const ws = await connected(hook);

    await act(async () => {
      ws.push({ t: 'vi.list', snap: true, items: [A, B, C] });
    });
    const D = viItem({ orderNo: '0000000004', isin: 'KR7068270008', deadline110Ms: T + 100_000 });
    await act(async () => {
      ws.push({ t: 'vi.list', snap: false, items: [D] });
    });
    expect(orderNosOf(hook)).toEqual(['0000000004', '0000000003', '0000000002', '0000000001']);

    // 가장 오래된 A 의 갱신 — 도착은 가장 늦지만 시각이 자리를 정한다.
    await act(async () => {
      ws.push({ t: 'vi.list', snap: false, items: [{ ...A, confirmed: true }] });
    });
    expect(orderNosOf(hook)).toEqual(['0000000004', '0000000003', '0000000002', '0000000001']);
    expect(hook.result.current.viOrders[3]?.confirmed).toBe(true);
  });

  it('③ 접수 전 → 접수(주문번호 부여) 전이는 행 1개이고 끝으로 밀리지 않고 시각 순 자리에 있다', async () => {
    const hook = render();
    const ws = await connected(hook);
    const P = viItem({
      orderNo: '',
      state: 'Pending',
      isin: 'KR7086520004',
      triggerPrice: 71_000,
      deadline110Ms: T + 70_000,
    });

    await act(async () => {
      ws.push({ t: 'vi.list', snap: true, items: [A, B, P, C] });
    });
    expect(orderNosOf(hook)).toEqual(['0000000003', '', '0000000002', '0000000001']);

    await act(async () => {
      ws.push({
        t: 'vi.list',
        snap: false,
        items: [{ ...P, orderNo: '0000000009', state: 'Accepted' }],
      });
    });
    expect(orderNosOf(hook)).toEqual(['0000000003', '0000000009', '0000000002', '0000000001']);
    expect(hook.result.current.viOrders).toHaveLength(4);
  });

  it('④ 동률: 주문번호 있는 행 먼저(주문번호 ↓) · 접수 전은 그 뒤 · 시각 모름(≤0)은 맨 뒤', async () => {
    const hook = render();
    const ws = await connected(hook);
    const same = T + 60_000;
    const lo = viItem({ orderNo: '0000000011', isin: 'KR7005930003', deadline110Ms: same });
    const hi = viItem({ orderNo: '0000000012', isin: 'KR7000660001', deadline110Ms: same });
    const pend = viItem({ orderNo: '', state: 'Pending', isin: 'KR7035720002', deadline110Ms: same });
    const unknown = viItem({ orderNo: '0000000099', isin: 'KR7068270008', deadline110Ms: 0 });
    const old = viItem({ orderNo: '0000000001', isin: 'KR7086520004', deadline110Ms: T + 1_000 });

    await act(async () => {
      ws.push({ t: 'vi.list', snap: true, items: [unknown, pend, lo, old, hi] });
    });
    expect(orderNosOf(hook)).toEqual(['0000000012', '0000000011', '', '0000000001', '0000000099']);
  });
});

describe('limitChaserSnapSeq — 64 스냅샷 적용 횟수 (WR-07 · 18-22)', () => {
  const ISIN = 'KR7086520004';
  function lcItem(over: Record<string, unknown> = {}) {
    return {
      isin: ISIN,
      accountNo: '12345678-01',
      exchange: 'KRX',
      key: `${ISIN}:12345678-01:KRX`,
      crud: 'C',
      buyEnabled: true,
      sellEnabled: false,
      sweepEnabled: false,
      ...over,
    };
  }

  it('① lc.snap 을 적용할 때마다 +1 — 빈 배열(「전략 없음」)도 1회로 센다 · 인증 ACK 만으로는 0', async () => {
    const hook = render();
    await connected(hook);
    const ws = FakeWebSocket.last();
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.limitChaserSnapSeq).toBe(0);

    await act(async () => {
      ws.push({ t: 'lc.snap', items: [] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);

    await act(async () => {
      ws.push({ t: 'lc.snap', items: [lcItem()] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(2);
    expect(hook.result.current.limitChasers).toHaveLength(1);
  });

  it('② lc(60 에코) 는 값을 바꾸지 않는다', async () => {
    const hook = render();
    const ws = await connected(hook);
    await act(async () => {
      ws.push({ t: 'lc', item: lcItem() });
    });
    expect(hook.result.current.limitChasers).toHaveLength(1);
    expect(hook.result.current.limitChaserSnapSeq).toBe(0);

    await act(async () => {
      ws.push({ t: 'lc.snap', items: [lcItem()] });
      ws.push({ t: 'lc', item: lcItem({ buyEnabled: false }) });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);
  });

  it('③ 리셋(로그아웃) 후 0 으로 돌아간다', async () => {
    const hook = render();
    const ws = await connected(hook);
    await act(async () => {
      ws.push({ t: 'lc.snap', items: [lcItem()] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);

    await act(async () => {
      hook.rerender({ enabled: false });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(0);
    expect(hook.result.current.limitChasers).toHaveLength(0);
  });

  it('④ ready → ready 반복 프레임은 기준점을 건드리지 않는다 (GC-IN-02 ③ · 18-26)', async () => {
    const hook = render();
    const ws = await connected(hook);
    await act(async () => {
      ws.push({ t: 'lc.snap', items: [lcItem()] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);

    await act(async () => {
      ws.push({ t: 'state', s: 'ready' });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);
  });

  it('⑤ 세션이 reconnecting → ready 로 **전환**되면 0 으로 돌아간다 — 옛 목록은 남는다 (GC-IN-02 ③ · 18-26)', async () => {
    const hook = render();
    const ws = await connected(hook);
    await act(async () => {
      ws.push({ t: 'lc.snap', items: [lcItem()] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);

    await act(async () => {
      ws.push({ t: 'state', s: 'reconnecting', attempt: 1 });
    });
    // 전환 전(ready 아님)에는 그대로다 — 기준점은 ready 에 들어설 때 선다.
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);
    await act(async () => {
      ws.push({ t: 'state', s: 'ready' });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(0);
    expect(hook.result.current.limitChasers).toHaveLength(1);

    await act(async () => {
      ws.push({ t: 'lc.snap', items: [] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);
  });

  it('⑥ 소켓 재연결 뒤 새 연결의 인증 ACK(ready) 도 전환이다 — 0 으로 돌아간다 (GC-IN-02 ③ · 18-26)', async () => {
    const hook = render();
    const ws = await connected(hook);
    await act(async () => {
      ws.push({ t: 'lc.snap', items: [lcItem()] });
    });
    expect(hook.result.current.limitChaserSnapSeq).toBe(1);

    await act(async () => {
      ws.serverClose(1006);
    });
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    const ws2 = await connected(hook);
    expect(ws2).not.toBe(ws);
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.limitChaserSnapSeq).toBe(0);
    expect(hook.result.current.limitChasers).toHaveLength(1);
  });
});

describe('nxt.snap — NXT 거래가능 집합 (quick-260923-pq2)', () => {
  const A = 'KR7005930003';
  const B = 'KR7000660001';
  const C = 'KR7035720002';

  it('초기 null(모름) → 프레임마다 Set 통째 교체 → 재접속은 유지 → enabled false(reset) 뒤 null', async () => {
    const hook = render({ enabled: true });
    expect(hook.result.current.nxtTradable).toBeNull();
    const ws = await connected(hook);
    expect(hook.result.current.nxtTradable).toBeNull();

    await act(async () => {
      ws.push({ t: 'nxt.snap', isins: [A, B] });
    });
    const first = hook.result.current.nxtTradable;
    expect(first).toBeInstanceOf(Set);
    expect(first?.has(A)).toBe(true);
    expect(first?.has(B)).toBe(true);

    // 두 번째 프레임은 병합이 아니라 전량 교체다.
    await act(async () => {
      ws.push({ t: 'nxt.snap', isins: [C] });
    });
    const second = hook.result.current.nxtTradable;
    expect(second?.has(C)).toBe(true);
    expect(second?.has(A)).toBe(false);
    expect(second?.size).toBe(1);

    // 재접속 — 다른 스냅샷처럼 지우지 않는다(relay 가 재인증마다 다시 내린다).
    await act(async () => {
      ws.serverClose(1006);
    });
    expect(hook.result.current.status).toBe('reconnecting');
    expect(hook.result.current.nxtTradable?.has(C)).toBe(true);
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
    expect(hook.result.current.nxtTradable?.has(C)).toBe(true);

    // 로그아웃·비활성화 = reset → 모름으로 되돌린다.
    await act(async () => {
      hook.rerender({ enabled: false });
    });
    expect(hook.result.current.nxtTradable).toBeNull();
  });
});
