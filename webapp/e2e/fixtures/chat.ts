import type { Page, Route } from '@playwright/test';
import type {
  ChatSSEEventType,
  ChatSSEEventMap,
  ConversationRow,
  MessageRow,
} from '@gh-radar/shared';

/**
 * Phase 14 Plan 11 — 챗 E2E fixture (CHAT-01).
 *
 * server `POST /api/chat`(SSE) + 대화관리(GET/DELETE /api/chat/conversations)를
 * 결정론적으로 모킹한다. 실서버/Anthropic 호출(비용·네트워크 불안정) 없이 프론트 흐름
 * (로그인 게이트 → 전송 → SSE 스트리밍 → 히스토리)만 검증하기 위한 mock.
 *
 * SSE 는 `text/event-stream` body 한 덩어리로 fulfill 한다 — chat-sse.ts 의
 * `parseSSEStream`(getReader 루프)이 청크를 순차 소비하며 `event:`/`data:` 라인을 파싱한다.
 *
 * 라우트는 `**` / 정규식으로 host-agnostic 매칭(NEXT_PUBLIC_API_BASE_URL 무관).
 * 정규식은 상호 배타적:
 *  - POST /api/chat                     → SSE 스트림
 *  - GET  /api/chat/conversations       → 목록(배열)
 *  - GET  /api/chat/conversations/:id   → 상세({ conversation, messages })
 */

/** SSE event/data 쌍 목록을 `event: <name>\ndata: <json>\n\n` 문자열로 직렬화. */
function serializeSSE(
  events: Array<[ChatSSEEventType, ChatSSEEventMap[ChatSSEEventType]]>,
): string {
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

export const CHAT_CONVERSATION_ID = '11111111-1111-1111-1111-111111111111';

/** 기본 SSE 시나리오 — session → 전문가 진행 → 텍스트 스트림 → 미니카드 → 완료. */
export const CHAT_SSE_EVENTS: Array<
  [ChatSSEEventType, ChatSSEEventMap[ChatSSEEventType]]
> = [
  ['session', { conversationId: CHAT_CONVERSATION_ID }],
  ['agent_start', { agent: 'quote', label: '시세·수급 전문가' }],
  ['agent_end', { agent: 'quote' }],
  ['text', { text: '오늘 주도 테마는 ' }],
  ['text', { text: 'AI 반도체입니다.' }],
  ['stock_card', { code: '000660', name: 'SK하이닉스', price: 195000, changeRate: 1.3 }],
  ['response_complete', {}],
  ['done', {}],
];

/** thread 에 최종 렌더될 assistant 답변 텍스트(스트림 조립 결과). */
export const CHAT_ASSISTANT_TEXT = '오늘 주도 테마는 AI 반도체입니다.';

/** /chat 목록용 대화 2건(updatedAt desc 정렬 대상). */
export const CHAT_CONVERSATIONS: ConversationRow[] = [
  {
    id: CHAT_CONVERSATION_ID,
    userId: 'e2e-user',
    stockCode: '000660',
    title: 'SK하이닉스 상한가 분석',
    createdAt: '2026-07-02T01:00:00.000Z',
    updatedAt: '2026-07-02T02:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    userId: 'e2e-user',
    stockCode: null,
    title: '오늘 주도 테마 정리',
    createdAt: '2026-07-01T01:00:00.000Z',
    updatedAt: '2026-07-01T05:00:00.000Z',
  },
];

/** 상세 조회 시 반환할 메시지(오래된→최신). */
export const CHAT_MESSAGES: MessageRow[] = [
  {
    id: 'm-1',
    conversationId: CHAT_CONVERSATION_ID,
    role: 'user',
    content: 'SK하이닉스 오늘 왜 올랐어?',
    blocks: null,
    createdAt: '2026-07-02T01:00:00.000Z',
  },
  {
    id: 'm-2',
    conversationId: CHAT_CONVERSATION_ID,
    role: 'assistant',
    content: 'HBM 수요 기대감으로 강세입니다.',
    blocks: null,
    createdAt: '2026-07-02T01:00:05.000Z',
  },
];

export interface MockChatApiOptions {
  /** SSE 시나리오 override. 미지정 시 CHAT_SSE_EVENTS. */
  sseEvents?: Array<[ChatSSEEventType, ChatSSEEventMap[ChatSSEEventType]]>;
  /** 대화 목록 override. 미지정 시 CHAT_CONVERSATIONS. */
  conversations?: ConversationRow[];
}

/**
 * 챗 SSE + 대화관리 API 모킹. 로그인 상태(storageState)에서만 의미가 있다
 * — streamChat/chat-api 가 Supabase access_token 을 Bearer 로 부착하므로.
 */
export async function mockChatApi(
  page: Page,
  opts: MockChatApiOptions = {},
): Promise<void> {
  const sseEvents = opts.sseEvents ?? CHAT_SSE_EVENTS;
  const conversations = opts.conversations ?? CHAT_CONVERSATIONS;

  // GET /api/chat/conversations/:id — 상세({ conversation, messages }).
  await page.route(
    /\/api\/chat\/conversations\/[^/?]+(?:\?[^/]*)?$/,
    async (route: Route) => {
      const url = route.request().url();
      const match = url.match(/\/api\/chat\/conversations\/([^/?]+)/);
      const id = match?.[1] ?? CHAT_CONVERSATION_ID;
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      const conversation =
        conversations.find((c) => c.id === id) ?? conversations[0]!;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-request-id': 'test-req-id' },
        body: JSON.stringify({ conversation, messages: CHAT_MESSAGES }),
      });
    },
  );

  // GET /api/chat/conversations — 목록(배열, 종목 필터 stockCode 무시하고 전량 반환).
  await page.route(
    /\/api\/chat\/conversations(?:\?[^/]*)?$/,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-request-id': 'test-req-id' },
        body: JSON.stringify(conversations),
      });
    },
  );

  // POST /api/chat — SSE 스트림.
  await page.route(/\/api\/chat(?:\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
        'x-request-id': 'test-req-id',
      },
      body: serializeSSE(sseEvents),
    });
  });
}
