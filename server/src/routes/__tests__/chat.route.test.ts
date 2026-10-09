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

/**
 * auth.getUser + conversations 테이블 + rpc("dma_visible_accounts") 를 지원하는 최소 supabase mock.
 * quick-261009-c43 D-01 — mapped 기본 true(계좌 1행) 라 기존 테스트는 매핑 사용자로 그대로 돈다.
 */
function makeSupabase(opts: {
  user?: { id: string } | null;
  conversations?: any[];
  mapped?: boolean;
  rpcError?: { code: string; message: string };
}) {
  const conversations = opts.conversations ?? [];
  const rpcCalls: Array<[string, unknown]> = [];
  const deletes: string[] = [];
  return {
    rpcCalls,
    deletes,
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push([fn, args]);
      if (opts.rpcError) return Promise.resolve({ data: null, error: opts.rpcError });
      if (opts.mapped === false) return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [{ gateway: "kb120", account_no: "12345678" }], error: null });
    },
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
        delete: () => {
          deletes.push(table);
          return builder;
        },
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
      .set("Accept-Encoding", "gzip")
      .send({ message: "삼성전자 어때?" });
    expect(r.status).toBe(200);
    // SSE 는 압축 제외 — gzip 버퍼에 이벤트가 묶이면 스트리밍·keepalive 가 끊긴다.
    expect(r.headers["content-encoding"]).toBeUndefined();
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

describe("D-01 DMA 매핑 게이트 (quick-261009-c43)", () => {
  it("미매핑: POST /api/chat → 403 DMA_UNMAPPED, SSE 헤더 전 · handleChatStream 0회", async () => {
    const r = await request(app(makeSupabase({ user: USER, mapped: false })))
      .post("/api/chat")
      .set("Authorization", "Bearer tok")
      .send({ message: "삼성전자 어때?" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(r.headers["content-type"]).not.toMatch(/text\/event-stream/);
    expect(handleChatStreamMock).not.toHaveBeenCalled();
  });

  it("미매핑: GET /conversations → 403 DMA_UNMAPPED", async () => {
    const r = await request(app(makeSupabase({ user: USER, mapped: false, conversations: [conv(TID, "user-1")] })))
      .get("/api/chat/conversations")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
  });

  it("미매핑: GET /conversations/:id → 403 DMA_UNMAPPED", async () => {
    const r = await request(app(makeSupabase({ user: USER, mapped: false, conversations: [conv(TID, "user-1")] })))
      .get(`/api/chat/conversations/${TID}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
  });

  it("미매핑: DELETE /conversations/:id → 403 DMA_UNMAPPED, 삭제 미수행", async () => {
    const sb = makeSupabase({ user: USER, mapped: false, conversations: [conv(TID, "user-1")] });
    const r = await request(app(sb))
      .delete(`/api/chat/conversations/${TID}`)
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(sb.deletes).toHaveLength(0);
  });

  it("미매핑: GET /access → 403 DMA_UNMAPPED", async () => {
    const r = await request(app(makeSupabase({ user: USER, mapped: false })))
      .get("/api/chat/access")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
  });

  it("매핑: GET /access → 200 { access: true }", async () => {
    const r = await request(app(makeSupabase({ user: USER })))
      .get("/api/chat/access")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ access: true });
  });

  it("무토큰: 401 이고 rpc 0회(인증 전 판정 없음)", async () => {
    const sb = makeSupabase({ user: USER });
    const r = await request(app(sb)).get("/api/chat/access");
    expect(r.status).toBe(401);
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it("rpc 인자 = dma_visible_accounts · p_user_id = req.userId", async () => {
    const sb = makeSupabase({ user: USER });
    await request(app(sb)).get("/api/chat/access").set("Authorization", "Bearer tok");
    expect(sb.rpcCalls).toEqual([["dma_visible_accounts", { p_user_id: "user-1" }]]);
  });

  it("rpc 오류: 500 DB_ERROR — 권한 없음으로 위장하지 않는다", async () => {
    const r = await request(
      app(makeSupabase({ user: USER, rpcError: { code: "57014", message: "canceling statement" } })),
    )
      .get("/api/chat/access")
      .set("Authorization", "Bearer tok");
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(r.body.error.code).not.toBe("DMA_UNMAPPED");
    expect(JSON.stringify(r.body)).not.toContain("canceling statement");
  });
});
