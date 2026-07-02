import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertConversationOwner,
  listConversations,
  createConversation,
  appendMessage,
  loadConversation,
  deleteConversation,
} from "../chat-history";
import { ApiError } from "../../errors";

/**
 * chat-history 서비스 유닛 테스트 (T-14-01 IDOR mitigate).
 *
 * 서비스롤 CRUD 의 명시 소유권 필터(.eq("user_id"))·제목 truncate·updated_at 갱신·
 * 소유권 검증(타 사용자 대화 404)을 in-memory supabase mock 으로 검증한다.
 * mock 은 from().select().eq().order()/insert().select().single()/update().eq()/
 * delete().eq() 체인을 thenable builder 로 흉내낸다.
 */

type Row = Record<string, unknown>;

function makeMockSupabase(
  seed: { conversations?: Row[]; messages?: Row[] } = {},
) {
  const store: Record<string, Row[]> = {
    conversations: seed.conversations ? seed.conversations.map((r) => ({ ...r })) : [],
    messages: seed.messages ? seed.messages.map((r) => ({ ...r })) : [],
  };
  const inserted: { table: string; rows: Row[] }[] = [];
  const updated: { table: string; patch: Row }[] = [];
  const deleted: { table: string }[] = [];
  let genSeq = 0;

  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let pendingRows: Row[] = [];
    let patch: Row = {};
    let orderCol: string | null = null;
    let orderAsc = true;

    const applyFilters = (rows: Row[]) =>
      rows.filter((r) => filters.every(([c, v]) => r[c] === v));

    const materializeInsert = (): Row[] =>
      pendingRows.map((r) => ({
        id: `gen-${++genSeq}`,
        created_at: "2026-07-02T00:00:00Z",
        updated_at: "2026-07-02T00:00:00Z",
        ...r,
      }));

    const b: Record<string, unknown> = {
      select() {
        return b;
      },
      insert(rows: Row | Row[]) {
        mode = "insert";
        pendingRows = Array.isArray(rows) ? rows : [rows];
        return b;
      },
      update(p: Row) {
        mode = "update";
        patch = p;
        return b;
      },
      delete() {
        mode = "delete";
        return b;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return b;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return b;
      },
      async maybeSingle() {
        const rows = applyFilters(store[table]);
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        if (mode === "insert") {
          const rows = materializeInsert();
          store[table].push(...rows);
          inserted.push({ table, rows });
          return { data: rows[0], error: null };
        }
        const rows = applyFilters(store[table]);
        return { data: rows[0] ?? null, error: null };
      },
      then(resolve: (v: { data: Row[] | null; error: null }) => unknown) {
        if (mode === "insert") {
          const rows = materializeInsert();
          store[table].push(...rows);
          inserted.push({ table, rows });
          return resolve({ data: rows, error: null });
        }
        if (mode === "update") {
          const rows = applyFilters(store[table]);
          rows.forEach((r) => Object.assign(r, patch));
          updated.push({ table, patch });
          return resolve({ data: null, error: null });
        }
        if (mode === "delete") {
          const keep = store[table].filter(
            (r) => !filters.every(([c, v]) => r[c] === v),
          );
          store[table] = keep;
          deleted.push({ table });
          return resolve({ data: null, error: null });
        }
        let rows = applyFilters(store[table]);
        if (orderCol) {
          const col = orderCol;
          rows = [...rows].sort((a, z) => {
            const av = a[col] as string;
            const zv = z[col] as string;
            const cmp = av < zv ? -1 : av > zv ? 1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        return resolve({ data: rows, error: null });
      },
    };
    return b;
  }

  const client = {
    from: (t: string) => builder(t),
    _store: store,
    _inserted: inserted,
    _updated: updated,
    _deleted: deleted,
  };
  return client as unknown as SupabaseClient & {
    _store: Record<string, Row[]>;
    _inserted: { table: string; rows: Row[] }[];
    _updated: { table: string; patch: Row }[];
    _deleted: { table: string }[];
  };
}

const conv = (over: Partial<Row> = {}): Row => ({
  id: "c1",
  user_id: "user-1",
  stock_code: null,
  title: "안녕",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("chat-history 서비스", () => {
  it("Test 1: assertConversationOwner — 소유자 일치 통과 / 불일치·미존재 404", async () => {
    const sb = makeMockSupabase({ conversations: [conv({ id: "c1", user_id: "user-1" })] });

    const ok = await assertConversationOwner(sb, "c1", "user-1");
    expect(ok.id).toBe("c1");
    expect(ok.userId).toBe("user-1");

    // 타 사용자 → 404 (존재 여부 누설 회피, T-14-01)
    await expect(assertConversationOwner(sb, "c1", "user-2")).rejects.toMatchObject({
      status: 404,
      code: "CONVERSATION_NOT_FOUND",
    });
    // 미존재 id → 404
    await expect(assertConversationOwner(sb, "nope", "user-1")).rejects.toBeInstanceOf(ApiError);
  });

  it("Test 2: createConversation — title 30자 truncate + user_id/stock_code INSERT", async () => {
    const sb = makeMockSupabase();
    const long = "가".repeat(50);

    const row = await createConversation(sb, "user-1", {
      stockCode: "005930",
      firstUserMessage: long,
    });

    expect(row.userId).toBe("user-1");
    expect(row.stockCode).toBe("005930");
    expect(row.title).toBe("가".repeat(30));
    expect(sb._inserted.some((i) => i.table === "conversations")).toBe(true);
  });

  it("Test 3: appendMessage — messages INSERT + conversations.updated_at UPDATE", async () => {
    const sb = makeMockSupabase({ conversations: [conv({ id: "c1" })] });

    await appendMessage(sb, "c1", {
      role: "assistant",
      content: "답변입니다",
      blocks: [{ type: "chart", code: "005930" }],
    });

    const msgs = sb._store.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].conversation_id).toBe("c1");
    expect(msgs[0].role).toBe("assistant");
    expect(msgs[0].content).toBe("답변입니다");
    expect(msgs[0].blocks).toEqual([{ type: "chart", code: "005930" }]);
    // 대화 updated_at 갱신 (목록 최신순 유지)
    expect(sb._updated.some((u) => u.table === "conversations" && "updated_at" in u.patch)).toBe(true);
  });

  it("Test 4: listConversations — WHERE user_id [+stock_code] ORDER updated_at DESC", async () => {
    const sb = makeMockSupabase({
      conversations: [
        conv({ id: "c1", user_id: "user-1", stock_code: null, updated_at: "2026-07-01T00:00:00Z" }),
        conv({ id: "c2", user_id: "user-1", stock_code: "005930", updated_at: "2026-07-03T00:00:00Z" }),
        conv({ id: "c3", user_id: "user-1", stock_code: null, updated_at: "2026-07-02T00:00:00Z" }),
        conv({ id: "cX", user_id: "user-2", stock_code: null, updated_at: "2026-07-05T00:00:00Z" }),
      ],
    });

    const all = await listConversations(sb, "user-1");
    expect(all.map((c) => c.id)).toEqual(["c2", "c3", "c1"]); // 최신순, user-2 제외
    expect(all.every((c) => c.userId === "user-1")).toBe(true);

    const byStock = await listConversations(sb, "user-1", "005930");
    expect(byStock.map((c) => c.id)).toEqual(["c2"]);
  });

  it("Test 5: loadConversation — 소유권 검증 후 messages ORDER created_at ASC", async () => {
    const sb = makeMockSupabase({
      conversations: [conv({ id: "c1", user_id: "user-1" })],
      messages: [
        { id: "m2", conversation_id: "c1", role: "assistant", content: "두번째", blocks: null, created_at: "2026-07-01T00:00:02Z" },
        { id: "m1", conversation_id: "c1", role: "user", content: "첫번째", blocks: null, created_at: "2026-07-01T00:00:01Z" },
      ],
    });

    const { conversation, messages } = await loadConversation(sb, "c1", "user-1");
    expect(conversation.id).toBe("c1");
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]); // created_at ASC
    expect(messages[0].conversationId).toBe("c1");

    // 타 사용자 로드 시 소유권 검증 실패
    await expect(loadConversation(sb, "c1", "user-2")).rejects.toMatchObject({ status: 404 });
  });

  it("Test 6(보강): deleteConversation — 소유권 검증 후 삭제", async () => {
    const sb = makeMockSupabase({ conversations: [conv({ id: "c1", user_id: "user-1" })] });

    await deleteConversation(sb, "c1", "user-1");
    expect(sb._deleted.some((d) => d.table === "conversations")).toBe(true);
    expect(sb._store.conversations).toHaveLength(0);

    // 타 사용자 삭제 시도 → 404 (소유권 검증)
    const sb2 = makeMockSupabase({ conversations: [conv({ id: "c1", user_id: "user-1" })] });
    await expect(deleteConversation(sb2, "c1", "user-2")).rejects.toMatchObject({ status: 404 });
  });
});
