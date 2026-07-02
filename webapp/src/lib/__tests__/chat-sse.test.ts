import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase 14 Plan 07 Task 2 — chat-sse 단위 테스트.
 *
 * 두 계층 검증:
 * 1. parseSSEStream — somi-chat-core 포팅 파서. ReadableStream reader 를 mock 하여
 *    (a) 단일 이벤트 파싱 (b) 청크 경계로 잘린 이벤트 버퍼 flush (c) 잘못된 JSON 무시
 *    (d) 여러 이벤트 타입 순차 콜백 을 검증한다 (T-14-08 파서 견고성).
 * 2. streamChat — createClient/resolveBaseUrl/fetch mock 으로 Bearer 헤더 부착 +
 *    /api/chat POST + getReader 스트림 소비 를 최소 검증한다 (T-14-02c).
 */

// --- supabase 세션 mock (access_token 취득) -----------------------------------
const getSessionMock = vi.fn(async () => ({
  data: { session: { access_token: 'tok-abc' } as { access_token: string } | null },
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: () => getSessionMock() } }),
}));

// --- resolveBaseUrl mock (fallback console.warn 회피) --------------------------
vi.mock('@/lib/api', () => ({
  resolveBaseUrl: () => 'http://localhost:8080',
}));

import { parseSSEStream, streamChat, type ChatSSEEventHandler } from '../chat-sse';

/** 문자열 청크 배열을 Uint8Array 로 순차 방출하는 reader mock. */
function readerFromChunks(
  chunks: string[],
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    read: async () => {
      if (i < chunks.length) {
        return { done: false as const, value: encoder.encode(chunks[i++]) };
      }
      return { done: true as const, value: undefined };
    },
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

/** SSE 응답 body(ReadableStream) 를 문자열 청크에서 생성. */
function bodyFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: 'tok-abc' } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// =============================================================================
// parseSSEStream
// =============================================================================
describe('parseSSEStream', () => {
  it('단일 text 이벤트를 파싱해 onEvent 로 전달한다', async () => {
    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    await parseSSEStream(
      readerFromChunks(['event: text\ndata: {"text":"안"}\n\n']),
      onEvent,
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('text', { text: '안' });
  });

  it('청크 경계로 잘린 이벤트도 버퍼 flush 로 정상 파싱한다', async () => {
    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    // 한 이벤트를 3개 청크로 쪼갬 (event 라인 / data 라인 절반 / 나머지+종단)
    await parseSSEStream(
      readerFromChunks(['event: text\nda', 'ta: {"text":"뻐', '기"}\n\n']),
      onEvent,
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('text', { text: '뻐기' });
  });

  it('잘못된 JSON data 라인은 무시하고 throw 하지 않는다', async () => {
    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    await expect(
      parseSSEStream(
        readerFromChunks([
          'event: text\ndata: {not-json}\n\n',
          'event: text\ndata: {"text":"ok"}\n\n',
        ]),
        onEvent,
      ),
    ).resolves.toBeUndefined();
    // 깨진 이벤트는 스킵, 정상 이벤트만 콜백
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('text', { text: 'ok' });
  });

  it('여러 이벤트 타입(agent_start/stock_card/done)을 순차 콜백한다', async () => {
    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    await parseSSEStream(
      readerFromChunks([
        'event: agent_start\ndata: {"agent":"quote","label":"시세·수급 전문가"}\n\n',
        'event: stock_card\ndata: {"code":"005930","name":"삼성전자","price":70000,"changeRate":2.5}\n\n',
        'event: done\ndata: {}\n\n',
      ]),
      onEvent,
    );
    const calls = (onEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((c) => c[0])).toEqual(['agent_start', 'stock_card', 'done']);
    expect(calls[1]?.[1]).toMatchObject({ code: '005930', name: '삼성전자' });
  });
});

// =============================================================================
// streamChat
// =============================================================================
describe('streamChat', () => {
  it('Bearer access_token 을 부착해 /api/chat 로 POST 하고 스트림을 소비한다', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: bodyFromChunks(['event: text\ndata: {"text":"hi"}\n\n']),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    await streamChat({ message: '삼성 어때', stockCode: '005930' }, onEvent);

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call?.[0]).toBe('http://localhost:8080/api/chat');
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-abc',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      message: '삼성 어때',
      stockCode: '005930',
    });
    expect(onEvent).toHaveBeenCalledWith('text', { text: 'hi' });
  });

  it('세션이 없으면 로그인 필요 에러를 throw 한다 (D-01)', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    await expect(
      streamChat({ message: 'x' }, onEvent),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 응답은 세션만료 에러로 throw 한다', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      body: null,
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const onEvent = vi.fn() as unknown as ChatSSEEventHandler;
    await expect(streamChat({ message: 'x' }, onEvent)).rejects.toThrow();
  });
});
