import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

/**
 * Phase 14 Plan 06 — chat 라우트 테스트 (CHAT-01).
 *
 * SSE 스트림 본체는 chat-service 유닛이 커버 — 여기선 인증/검증/kill-switch/JSON 경로:
 *   - 401 (무토큰) / 400 (빈 message) / 503 (CHAT_DISABLED)
 *   - GET /conversations 목록 / DELETE /conversations/:id 소유권
 *
 * handleChatStream 은 mock (라우트 배선만 검증, Anthropic 네트워크 호출 차단).
 */

const { handleChatStreamMock } = vi.hoisted(() => ({
  handleChatStreamMock: vi.fn(async () => {}),
}));
vi.mock("../../services/chat-service", () => ({
  handleChatStream: handleChatStreamMock,
}));

const USER = { id: "user-1" };

const TID = "11111111-1111-4111-8111-111111111111";

function conv(id: string, userId: string, stockCode: string | null = null) {
  return {
    id,
    user_id: userId,
    stock_code: stockCode,
    title: "대화",
    created_at: "2026-07-02T00:00:00Z",
    updated_at: "2026-07-02T01:00:00Z",
  };
}

/** auth.getUser + conversations 테이블을 지원하는 최소 supabase mock. */
function makeSupabase(opts: { user?: { id: string } | null; conversations?: any[] }) {
  const conversations = opts.conversations ?? [];
  return {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    from: (table: string) => {
      let rows = table === "conversations" ? [...conversations] : [];
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        delete: () => builder,
        insert: () => builder,
        update: () => builder,
        then: (resolve: any) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as any;
}

const app = (sb: any) => createApp({ supabase: sb });

beforeEach(() => {
  handleChatStreamMock.mockReset().mockResolvedValue(undefined);
  delete process.env.CHAT_DISABLED;
});

afterEach(() => {
  delete process.env.CHAT_DISABLED;
  vi.clearAllMocks();
});

describe("POST /api/chat", () => {
  it("401: 토큰 없으면 UNAUTHENTICATED (SSE 헤더 전)", async () => {
    const r = await request(app(makeSupabase({ user: USER }))).post("/api/chat").send({ message: "안녕" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(handleChatStreamMock).not.toHaveBeenCalled();
  });

  it("400: 빈 message → ValidationFailed", async () => {
    const r = await request(app(makeSupabase({ user: USER })))
      .post("/api/chat")
      .set("Authorization", "Bearer tok")
      .send({ message: "" });
    expect(r.status).toBe(400);
    expect(handleChatStreamMock).not.toHaveBeenCalled();
  });

  it("503: CHAT_DISABLED kill-switch (헤더 전)", async () => {
    process.env.CHAT_DISABLED = "true";
    const r = await request(app(makeSupabase({ user: USER })))
      .post("/api/chat")
      .set("Authorization", "Bearer tok")
      .send({ message: "안녕" });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("CHAT_DISABLED");
    expect(handleChatStreamMock).not.toHaveBeenCalled();
  });

  it("200: 유효 요청 → handleChatStream 위임 + done 이벤트", async () => {
    const r = await request(app(makeSupabase({ user: USER })))
      .post("/api/chat")
      .set("Authorization", "Bearer tok")
      .send({ message: "삼성전자 어때?" });
    expect(r.status).toBe(200);
    expect(handleChatStreamMock).toHaveBeenCalledTimes(1);
    expect(handleChatStreamMock.mock.calls[0][3]).toMatchObject({
      userId: "user-1",
      message: "삼성전자 어때?",
    });
    expect(r.text).toContain("event: done");
  });
});

describe("GET /api/chat/conversations", () => {
  it("401: 토큰 없으면 거부", async () => {
    const r = await request(app(makeSupabase({ user: USER }))).get("/api/chat/conversations");
    expect(r.status).toBe(401);
  });

  it("200: 사용자 대화 목록 반환", async () => {
    const sb = makeSupabase({
      user: USER,
      conversations: [conv(TID, "user-1"), conv("22222222-2222-4222-8222-222222222222", "other")],
    });
    const r = await request(app(sb))
      .get("/api/chat/conversations")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    // bare array 반환(코드베이스 규약 + webapp apiFetch<ConversationRow[]> 계약).
    expect(Array.isArray(r.body)).toBe(true);
    // user_id 필터로 본인 대화만
    expect(r.body.every((c: any) => c.userId === "user-1")).toBe(true);
    expect(r.body).toHaveLength(1);
  });
});

describe("DELETE /api/chat/conversations/:id", () => {
  it("204: 소유 대화 삭제", async () => {
    const sb = makeSupabase({ user: USER, conversations: [conv(TID, "user-1")] });
    const r = await request(app(sb))
      .delete(`/api/chat/conversations/${TID}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(204);
  });

  it("404: 미소유 대화 삭제 시 존재 여부 누설 없이 404 (T-14-01)", async () => {
    const sb = makeSupabase({ user: USER, conversations: [conv(TID, "other-user")] });
    const r = await request(app(sb))
      .delete(`/api/chat/conversations/${TID}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("CONVERSATION_NOT_FOUND");
  });
});
