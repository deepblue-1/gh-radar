import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * Phase 15 Plan 12 Task 2 — `useRelaySocket` 단위 테스트.
 *
 * 전역 `WebSocket` 을 fake 클래스로 대체해 **테스트가 서버 프레임을 주입**한다
 * (`chat-sse.test.ts` 의 `readerFromChunks` 와 같은 사상 — 네트워크 없이 프로토콜만 검증).
 *
 * 증명 대상:
 *  - D-11  첫 메시지 `{t:"auth", token}`, URL 에 토큰 없음 (T-15-04)
 *  - T-15-40  종목 전환 시 `unsub` + 이전 종목 데이터 잔존 0 (오주문 차단)
 *  - T-15-10  close 4401 은 재접속하지 않음, 백오프 상한 10회 후 `manual_required`
 *  - D-37  스냅샷 캐시로 거래소 토글 왕복 깜빡임 0
 *  - UI-SPEC  재접속 중 데이터 유지 + `isStale`
 *  - T-15-41  깨진 프레임은 throw 없이 스킵
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
  RelayExchange,
  RelayQuote,
  RelayTape,
  RelayTapeEntry,
  RelayUnfilled,
} from '@gh-radar/shared';
import { useRelaySocket } from '../use-relay-socket';

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

function tapeFrame(entries: RelayTapeEntry[], snap = false, over: Partial<RelayTape> = {}): RelayTape {
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
  isin: string;
  exchange: RelayExchange;
  enabled?: boolean;
}

function render(initial: HookProps) {
  return renderHook((props: HookProps) => useRelaySocket(props), { initialProps: initial });
}

/** 연결 → 인증 ACK(상태 프레임) → 구독까지 진행한 소켓을 돌려준다. */
async function connected(
  result: ReturnType<typeof render>,
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

describe('useRelaySocket — 연결 게이트', () => {
  it('① enabled:false 면 WebSocket 을 만들지 않는다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX', enabled: false });
    await settle();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.statusLabel).toBe('');
  });

  it('② 로그인 세션이 없으면 연결하지 않고 unauthorized 로 둔다', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
    await settle();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(hook.result.current.status).toBe('unauthorized');
    expect(hook.result.current.statusLabel).toBe(RELAY_STATE_LABELS.unauthorized);
  });
});

describe('useRelaySocket — 인증 (D-11 / T-15-04)', () => {
  it('③ 첫 전송이 {t:"auth", token} 이고 URL 에 토큰이 실리지 않는다', async () => {
    render({ isin: ISIN_A, exchange: 'KRX' });
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

describe('useRelaySocket — 상태 프레임 (D-36)', () => {
  it('④ state 프레임의 라벨이 RELAY_STATE_LABELS 와 일치한다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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

describe('useRelaySocket — 시세와 스냅샷 캐시 (D-33 / D-37)', () => {
  it('⑤ q 프레임을 반영하고, 거래소 토글 왕복에서 캐시로 즉시 복원한다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
    const ws = await connected(hook);

    await act(async () => {
      ws.push(quoteFrame({ p: 70_000 }));
    });
    expect(hook.result.current.quote?.p).toBe(70_000);
    expect(hook.result.current.quote?.x).toBe('KRX');

    // NXT 로 토글 — 캐시가 비어 있으므로 스켈레톤(quote=null)
    await act(async () => {
      hook.rerender({ isin: ISIN_A, exchange: 'NXT' });
    });
    expect(hook.result.current.quote).toBeNull();

    await act(async () => {
      ws.push(quoteFrame({ x: 'NXT', p: 69_800 }));
    });
    expect(hook.result.current.quote?.p).toBe(69_800);

    // KRX 로 되돌리면 캐시에서 **즉시** 복원 — 프레임 없이도 깜빡이지 않는다
    await act(async () => {
      hook.rerender({ isin: ISIN_A, exchange: 'KRX' });
    });
    expect(hook.result.current.quote?.p).toBe(70_000);
    expect(hook.result.current.quote?.x).toBe('KRX');
  });
});

describe('useRelaySocket — 구독 전환 (참조계수 누수 / 오주문 차단)', () => {
  it('⑥ 거래소 변경 시 이전 unsub 다음 신규 sub 순서로 전송한다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
    const ws = await connected(hook);

    // 인증 ACK 직후 최초 구독
    expect(ws.parsedSent()[1]).toEqual({ t: 'sub', isin: ISIN_A, ex: 'KRX' });

    await act(async () => {
      hook.rerender({ isin: ISIN_A, exchange: 'NXT' });
    });

    const after = ws.parsedSent().slice(2);
    expect(after[0]).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
    expect(after[1]).toEqual({ t: 'sub', isin: ISIN_A, ex: 'NXT' });
  });

  it('⑦ 종목 변경 시 unsub 전송 + quote/tape/account 잔존 0 (T-15-40)', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
    const ws = await connected(hook);

    await act(async () => {
      ws.push(quoteFrame());
      ws.push(tapeFrame([tapeEntry(1), tapeEntry(2)], true));
      ws.push(acctFrame());
    });
    expect(hook.result.current.quote).not.toBeNull();
    expect(hook.result.current.tape).toHaveLength(2);
    expect(hook.result.current.account).not.toBeNull();

    await act(async () => {
      hook.rerender({ isin: ISIN_B, exchange: 'KRX' });
    });

    const after = ws.parsedSent().slice(2);
    expect(after[0]).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
    expect(after[1]).toEqual({ t: 'sub', isin: ISIN_B, ex: 'KRX' });

    // 이전 종목 데이터가 한 조각도 남으면 안 된다 — 남으면 다른 종목 호가로 주문한다
    expect(hook.result.current.quote).toBeNull();
    expect(hook.result.current.tape).toEqual([]);
    expect(hook.result.current.account).toBeNull();

    // 전환 직전 키로 늦게 도착한 프레임도 화면에 올리지 않는다
    await act(async () => {
      ws.push(quoteFrame({ p: 99_999 }));
    });
    expect(hook.result.current.quote).toBeNull();
  });
});

describe('useRelaySocket — 재접속 규율 (D-16 / T-15-10)', () => {
  it('⑧ 서버가 닫으면 백오프 재접속하고, 데이터를 지우지 않고 isStale 만 세운다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    expect(hook.result.current.quote?.p).toBe(70_000);
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

  it('⑨ close 4401 은 재접속하지 않고 unauthorized 로 확정한다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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

describe('useRelaySocket — 정리 (cleanup)', () => {
  it('⑪ 언마운트 시 unsub 전송 후 close(1000) 하고 타이머를 정리한다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
    const ws = await connected(hook);

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

  it('⑫ enabled 가 false 로 바뀌면 같은 정리 절차를 밟는다 (Radix Tabs 언마운트 대비)', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX', enabled: true });
    const ws = await connected(hook);

    await act(async () => {
      hook.rerender({ isin: ISIN_A, exchange: 'KRX', enabled: false });
    });

    expect(ws.parsedSent().at(-1)).toEqual({ t: 'unsub', isin: ISIN_A, ex: 'KRX' });
    expect(ws.closedWith).toEqual({ code: 1000 });
    expect(hook.result.current.status).toBe('idle');

    // 다시 켜면 새 소켓으로 깨끗하게 재연결된다
    await act(async () => {
      hook.rerender({ isin: ISIN_A, exchange: 'KRX', enabled: true });
    });
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe('useRelaySocket — 프레임 견고성', () => {
  it('⑬ 체결 테이프 링버퍼는 200건을 넘지 않고 최신이 앞에 온다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
    const ws = await connected(hook);

    const batch1 = Array.from({ length: 150 }, (_, k) => tapeEntry(k + 1));
    const batch2 = Array.from({ length: 100 }, (_, k) => tapeEntry(k + 151));

    await act(async () => {
      ws.push(tapeFrame(batch1));
      ws.push(tapeFrame(batch2));
    });

    const tape = hook.result.current.tape;
    expect(tape).toHaveLength(200);
    // 배치는 시간 오름차순 → 마지막 체결이 index 0
    expect(tape[0]?.p).toBe(tapeEntry(250).p);
    // 가장 오래된 50건은 상한을 넘어 잘려나간다
    expect(tape.some((e) => e.p === tapeEntry(1).p)).toBe(false);
  });

  it('⑭ 깨진 JSON 프레임과 알 수 없는 t 는 throw 없이 스킵한다 (T-15-41)', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    expect(hook.result.current.quote?.p).toBe(70_000);
    expect(hook.result.current.status).toBe('ready');
  });

  it('⑮ acct 델타는 upsert + rm 제거로 병합된다', async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
      ws.push(acctFrame({ snap: false, hold: [], unf: [unf('A1', 0, 10), unf('A2', 3, 7)], rm: [] }));
    });

    expect(hook.result.current.account?.unf.map((u) => u.orderNo)).toEqual(['A2']);
    expect(hook.result.current.account?.unf[0]?.unfilledQty).toBe(3);
  });

  it("⑮-d 같은 델타가 한 주문을 갱신하면서 rm 으로도 지우면 최종은 '없음'이다", async () => {
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
    const hook = render({ isin: ISIN_A, exchange: 'KRX' });
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
