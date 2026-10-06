/**
 * Phase 29 (29-10) — Admin 라우트 · requireAdmin 테스트용 Supabase 목.
 *
 * - `auth.getUser(token)` : `users[token]` 이 있으면 그 사용자(`{ id, email }`), 없으면 「invalid token」.
 * - `from("app_users")`   : 메모리 표(이메일 키). select · upsert · update · delete + eq · is 필터 + `.select()` 반환 행.
 *   PostgREST 의 체인 모양만 흉내 낸다 — 필터 의미는 eq(같음) · is(같음, null 비교용) 두 개뿐.
 * - `rpc(fn)`             : `rpc[fn]` 핸들러가 있으면 그것(29-13 레지스트리 RPC) · 없으면 `admin_users_raw` → `raw`
 *                           (또는 `rpcError`). 그 밖 이름은 오류.
 * - `from(<그 밖 표>)`     : `tables[표]` 메모리 배열(29-13 `dma_servers`) — select · update · delete + eq 필터.
 * - `select(cols, { count: "exact", head: true })` : 행 없이 `count` 만(29-13 공유 판정).
 *
 * 기록(`rec`)으로 「무엇을 몇 번 불렀는지」 를 단언한다(왕복 수 · 쓰기 대상 · 필터).
 */

export type AppUserRow = { email: string; role: string; dma_user_id: string | null; updated_at?: string };

export type AdminSupabaseOpts = {
  users?: Record<string, { id: string; email?: string | null }>;
  appUsers?: AppUserRow[];
  raw?: unknown;
  rpcError?: { message: string; code?: string };
  /** 이름별 RPC 핸들러(29-13) — 있으면 `raw` 보다 먼저. */
  rpc?: Record<string, (params: unknown) => { data: unknown; error: unknown }>;
  /** app_users 밖의 메모리 표(29-13 `dma_servers`). */
  tables?: Record<string, Record<string, unknown>[]>;
  /** 주면 해당 종류의 app_users 질의가 이 오류를 돌려준다. */
  dbError?: Partial<Record<"select" | "upsert" | "update" | "delete", { message: string; code?: string }>>;
};

export type AdminOp = {
  table: string;
  kind: "select" | "upsert" | "update" | "delete";
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  filters: [op: "eq" | "is", col: string, val: unknown][];
  /** select 의 count 옵션(`{ count: "exact", head: true }`). */
  count?: boolean;
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
  const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    Object.entries(opts.tables ?? {}).map(([t, rs]) => [t, rs.map((r) => ({ ...r }))]),
  );

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
      const h = opts.rpc?.[fn];
      if (h) return h(params);
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
      const match = (r: Record<string, unknown>) => q.filters.every(([, col, val]) => r[col] === val);

      const execOther = (): { data: unknown; error: unknown; count?: number | null } => {
        const t = tables[table];
        if (!t) return { data: null, error: { message: `unexpected table ${table}` } };
        const hits = t.filter(match);
        switch (q.kind) {
          case "select":
            return { data: hits.map((r) => ({ ...r })), error: null };
          case "update":
            for (const r of hits) Object.assign(r, q.payload);
            return { data: q.returning ? hits.map((r) => ({ ...r })) : null, error: null };
          case "delete":
            tables[table] = t.filter((r) => !hits.includes(r));
            return { data: q.returning ? hits.map((r) => ({ ...r })) : null, error: null };
          default:
            return { data: null, error: { message: `unsupported ${q.kind} on ${table}` } };
        }
      };

      const exec = (): { data: unknown; error: unknown; count?: number | null } => {
        rec.ops.push({
          table,
          kind: q.kind,
          payload: q.payload,
          options: q.options,
          filters: q.filters,
          ...(q.count ? { count: true } : {}),
        });
        const err = opts.dbError?.[q.kind];
        if (err) return { data: null, error: err };
        if (table !== "app_users") return execOther();
        const hits = [...rows.values()].filter((r) => match(r as unknown as Record<string, unknown>));
        switch (q.kind) {
          case "select":
            if (q.count) return { data: null, count: hits.length, error: null };
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
        select: (_cols?: string, o?: { count?: string; head?: boolean }) => {
          if (q.kind !== "select") q.returning = true;
          if (o?.count) q.count = true;
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

  return { client: client as any, rec, rows, tables };
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
