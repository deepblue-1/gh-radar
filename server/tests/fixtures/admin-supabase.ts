/**
 * Phase 29 (29-10) — Admin 라우트 · requireAdmin 테스트용 Supabase 목.
 *
 * - `auth.getUser(token)` : `users[token]` 이 있으면 그 사용자(`{ id, email }`), 없으면 「invalid token」.
 * - `from("app_users")`   : 메모리 표(이메일 키). select · upsert · update · delete + eq · is 필터 + `.select()` 반환 행.
 *   PostgREST 의 체인 모양만 흉내 낸다 — 필터 의미는 eq(같음) · is(같음, null 비교용) 두 개뿐.
 * - `rpc(fn)`             : `admin_users_raw` → `raw`(또는 `rpcError`). 그 밖 이름은 오류.
 *
 * 기록(`rec`)으로 「무엇을 몇 번 불렀는지」 를 단언한다(왕복 수 · 쓰기 대상 · 필터).
 */

export type AppUserRow = { email: string; role: string; dma_user_id: string | null; updated_at?: string };

export type AdminSupabaseOpts = {
  users?: Record<string, { id: string; email?: string | null }>;
  appUsers?: AppUserRow[];
  raw?: unknown;
  rpcError?: { message: string; code?: string };
  /** 주면 해당 종류의 app_users 질의가 이 오류를 돌려준다. */
  dbError?: Partial<Record<"select" | "upsert" | "update" | "delete", { message: string; code?: string }>>;
};

export type AdminOp = {
  table: string;
  kind: "select" | "upsert" | "update" | "delete";
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  filters: [op: "eq" | "is", col: string, val: unknown][];
};

export type AdminRecorder = {
  rpcCalls: { fn: string; params?: unknown }[];
  ops: AdminOp[];
};

export function makeAdminSupabase(opts: AdminSupabaseOpts = {}) {
  const rows = new Map<string, AppUserRow>(
    (opts.appUsers ?? []).map((r) => [r.email, { ...r }]),
  );
  const rec: AdminRecorder = { rpcCalls: [], ops: [] };

  const client = {
    auth: {
      getUser: async (token: string) => {
        const u = opts.users?.[token];
        return u
          ? { data: { user: { id: u.id, email: u.email ?? undefined } }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } };
      },
    },
    async rpc(fn: string, params?: unknown) {
      rec.rpcCalls.push({ fn, params });
      if (fn !== "admin_users_raw") return { data: null, error: { message: `unexpected rpc ${fn}` } };
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.raw ?? null, error: null };
    },
    from(table: string) {
      const q: AdminOp & { returning: boolean } = {
        table,
        kind: "select",
        filters: [],
        returning: false,
      };
      const match = (r: AppUserRow) =>
        q.filters.every(([, col, val]) => (r as Record<string, unknown>)[col] === val);

      const exec = (): { data: unknown; error: unknown } => {
        rec.ops.push({ table, kind: q.kind, payload: q.payload, options: q.options, filters: q.filters });
        const err = opts.dbError?.[q.kind];
        if (err) return { data: null, error: err };
        if (table !== "app_users") return { data: null, error: { message: `unexpected table ${table}` } };
        const hits = [...rows.values()].filter(match);
        switch (q.kind) {
          case "select":
            return { data: hits.map((r) => ({ ...r })), error: null };
          case "upsert": {
            const p = q.payload as AppUserRow;
            const prev = rows.get(p.email);
            rows.set(p.email, { dma_user_id: prev?.dma_user_id ?? null, ...prev, ...p });
            return { data: null, error: null };
          }
          case "update":
            for (const r of hits) Object.assign(r, q.payload);
            return { data: q.returning ? hits.map((r) => ({ email: r.email })) : null, error: null };
          case "delete":
            for (const r of hits) rows.delete(r.email);
            return { data: q.returning ? hits.map((r) => ({ email: r.email })) : null, error: null };
        }
      };

      const b: any = {
        select: () => {
          if (q.kind !== "select") q.returning = true;
          return b;
        },
        upsert: (p: Record<string, unknown>, o?: Record<string, unknown>) => {
          q.kind = "upsert";
          q.payload = p;
          q.options = o;
          return b;
        },
        update: (p: Record<string, unknown>) => {
          q.kind = "update";
          q.payload = p;
          return b;
        },
        delete: () => {
          q.kind = "delete";
          return b;
        },
        eq: (col: string, val: unknown) => {
          q.filters.push(["eq", col, val]);
          return b;
        },
        is: (col: string, val: unknown) => {
          q.filters.push(["is", col, val]);
          return b;
        },
        maybeSingle: async () => {
          const r = exec();
          if (r.error) return r;
          const arr = (r.data as unknown[] | null) ?? [];
          return { data: arr[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(exec()).then(resolve, reject),
      };
      return b;
    },
  };

  return { client: client as any, rec, rows };
}

/** 토큰 3종 — admin(대문자 이메일 토큰) · trader · 승인 대기(표에 없음). */
export const ADMIN_TOKEN = "tok-admin";
export const TRADER_TOKEN = "tok-trader";
export const PENDING_TOKEN = "tok-pending";
export const NO_EMAIL_TOKEN = "tok-no-email";

export const ADMIN_EMAIL = "alex@jx1.io";

export const baseUsers: AdminSupabaseOpts["users"] = {
  [ADMIN_TOKEN]: { id: "00000000-0000-4000-8000-000000000001", email: "Alex@JX1.io" },
  [TRADER_TOKEN]: { id: "00000000-0000-4000-8000-000000000002", email: "trader@gmail.com" },
  [PENDING_TOKEN]: { id: "00000000-0000-4000-8000-000000000003", email: "pending@gmail.com" },
  [NO_EMAIL_TOKEN]: { id: "00000000-0000-4000-8000-000000000004", email: null },
};

export const baseAppUsers = (): AppUserRow[] => [
  { email: ADMIN_EMAIL, role: "admin", dma_user_id: null },
  { email: "trader@gmail.com", role: "trader", dma_user_id: "kim01" },
  { email: "viewer@gmail.com", role: "viewer", dma_user_id: null },
];
