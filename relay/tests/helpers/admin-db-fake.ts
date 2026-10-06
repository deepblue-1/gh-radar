/**
 * Phase 29 Plan 11 — Admin 의도 RPC 의 **메모리 대역**(`SupabaseClient` 모양). 운영 무접촉.
 *
 * 29-05 마이그레이션(`20261006200200_dma_admin_intent_rpcs.sql` · `20261006200300_dma_admin_reflect.sql`)의 의미를 그대로
 * 옮긴다 — 업무 거부는 PostgREST 오류 `{ code: "P0001", message: "<CODE>" }`. 정본 검증은 pgTAP(29-05)이고, 이 대역은 relay
 * dispatcher · 라우터가 RPC 를 **어떤 인자 · 순서로** 부르는지를 단언하려고 있다.
 *
 * 다루는 것: rpc 9종(create · set_password · put_account · mark_account_removed · settle_server · delete_dma_user · intent ·
 * record_results + 미지 이름 기록) · `from("dma_users").select().eq().maybeSingle()` ·
 * `from("dma_credentials").select().eq()` · `from("dma_credentials").update().eq().eq()`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminIntentRow, DmaBroker } from "@gh-radar/shared";

export type FakeRpcCall = { name: string; args: Record<string, unknown> };

type AccountRow = {
  dmaUserId: string;
  broker: DmaBroker;
  accountNo: string;
  name: string;
  branchNo: string;
  traderId: string;
  priority: number;
};

type ServerRow = { dmaUserId: string; broker: DmaBroker; accountNo: string; serverKey: string; state: "active" | "removing" };

type LegacyRow = { user_id: string; dma_user_id: string; dma_password_enc: string };

type PgError = { code: string; message: string; details: string | null; hint: string | null };

type Result = { data: unknown; error: PgError | null };

const reject = (message: string): Result => ({ data: null, error: { code: "P0001", message, details: null, hint: null } });
const ok = (data: unknown): Result => ({ data, error: null });

export type SeedAccount = Partial<Omit<AccountRow, "dmaUserId" | "accountNo">> & {
  accountNo: string;
  servers: Array<string | { key: string; state: "active" | "removing" }>;
};

export class AdminDbFake {
  readonly appUsers = new Set<string>();
  /** 레지스트리 서버 키 → 증권사(FK · SERVER_BROKER_MISMATCH 판정용). */
  readonly serverBroker = new Map<string, DmaBroker>();
  readonly dmaUsers = new Map<string, string>();
  accounts: AccountRow[] = [];
  serverRows: ServerRow[] = [];
  legacy: LegacyRow[] = [];
  readonly calls: FakeRpcCall[] = [];
  /** 다음 1회 그 RPC 를 이 오류로 실패시킨다. */
  readonly failNext = new Map<string, PgError>();
  readonly client: SupabaseClient;

  constructor(servers: Array<{ key: string; broker: DmaBroker }> = []) {
    for (const s of servers) this.serverBroker.set(s.key, s.broker);
    this.client = {
      rpc: (name: string, args: Record<string, unknown>) => Promise.resolve(this.#rpc(name, args)),
      from: (table: string) => this.#query(table),
    } as unknown as SupabaseClient;
  }

  callsTo(name: string): FakeRpcCall[] {
    return this.calls.filter((c) => c.name === name);
  }

  /** 유저 + 계좌 + 등록 행을 바로 심는다(RPC 기록 없이). */
  seedUser(input: { email?: string; dmaUserId: string; passwordEnc: string; accounts: SeedAccount[] }): void {
    if (input.email !== undefined) this.appUsers.add(input.email);
    this.dmaUsers.set(input.dmaUserId, input.passwordEnc);
    for (const a of input.accounts) {
      const broker = a.broker ?? "KB";
      this.accounts.push({
        dmaUserId: input.dmaUserId,
        broker,
        accountNo: a.accountNo,
        name: a.name ?? "위탁",
        branchNo: a.branchNo ?? (broker === "KB" ? "00001" : ""),
        traderId: a.traderId ?? (broker === "KB" ? "000001" : ""),
        priority: a.priority ?? 1,
      });
      for (const s of a.servers) {
        const { key, state } = typeof s === "string" ? { key: s, state: "active" as const } : s;
        this.serverRows.push({ dmaUserId: input.dmaUserId, broker, accountNo: a.accountNo, serverKey: key, state });
      }
    }
  }

  intentOf(dmaUserId: string): AdminIntentRow[] {
    return this.serverRows
      .filter((s) => s.dmaUserId === dmaUserId)
      .map((s) => {
        const a = this.#account(dmaUserId, s.broker, s.accountNo)!;
        return {
          dmaUserId,
          broker: a.broker,
          accountNo: a.accountNo,
          name: a.name,
          branchNo: a.branchNo,
          traderId: a.traderId,
          priority: a.priority,
          serverKey: s.serverKey,
          state: s.state,
        };
      })
      .sort(
        (x, y) =>
          x.priority - y.priority ||
          (x.accountNo < y.accountNo ? -1 : x.accountNo > y.accountNo ? 1 : 0) ||
          (x.serverKey < y.serverKey ? -1 : x.serverKey > y.serverKey ? 1 : 0),
      );
  }

  #account(dmaUserId: string, broker: DmaBroker, accountNo: string): AccountRow | undefined {
    return this.accounts.find((a) => a.dmaUserId === dmaUserId && a.broker === broker && a.accountNo === accountNo);
  }

  #serverList(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
    return [...new Set(list.map((x) => x.trim()))].sort();
  }

  #mismatch(broker: DmaBroker, servers: string[]): boolean {
    return servers.some((s) => this.serverBroker.get(s) !== broker);
  }

  #dropOrphanAccounts(dmaUserId: string): number {
    const before = this.accounts.length;
    this.accounts = this.accounts.filter(
      (a) =>
        a.dmaUserId !== dmaUserId ||
        this.serverRows.some((s) => s.dmaUserId === dmaUserId && s.broker === a.broker && s.accountNo === a.accountNo),
    );
    return before - this.accounts.length;
  }

  #rpc(name: string, args: Record<string, unknown>): Result {
    this.calls.push({ name, args: structuredClone(args) });
    const injected = this.failNext.get(name);
    if (injected !== undefined) {
      this.failNext.delete(name);
      return { data: null, error: injected };
    }
    const id = String(args.p_dma_user_id ?? "");
    switch (name) {
      case "dma_admin_create_dma_user": {
        const email = String(args.p_email ?? "").trim().toLowerCase();
        const account = args.p_account as Record<string, unknown>;
        const servers = this.#serverList(args.p_servers);
        if (!this.appUsers.has(email)) return reject("NO_APP_USER");
        if (this.dmaUsers.has(id)) return reject("DMA_USER_EXISTS");
        if (servers.length === 0) return reject("NO_SERVERS");
        const broker = account.broker as DmaBroker;
        if (this.#mismatch(broker, servers)) return reject("SERVER_BROKER_MISMATCH");
        this.dmaUsers.set(id, String(args.p_password_enc));
        this.accounts.push({
          dmaUserId: id,
          broker,
          accountNo: String(account.accountNo),
          name: String(account.name ?? ""),
          branchNo: String(account.branchNo ?? ""),
          traderId: String(account.traderId ?? ""),
          priority: Number(account.priority ?? 0),
        });
        for (const s of servers) {
          this.serverRows.push({ dmaUserId: id, broker, accountNo: String(account.accountNo), serverKey: s, state: "active" });
        }
        return ok({ dmaUserId: id });
      }
      case "dma_admin_set_password": {
        if (!this.dmaUsers.has(id)) return reject("NO_DMA_USER");
        this.dmaUsers.set(id, String(args.p_password_enc));
        return ok(null);
      }
      case "dma_admin_put_account": {
        if (!this.dmaUsers.has(id)) return reject("NO_DMA_USER");
        const account = args.p_account as Record<string, unknown>;
        const servers = this.#serverList(args.p_servers);
        if (servers.length === 0) return reject("NO_SERVERS");
        const broker = account.broker as DmaBroker;
        if (this.#mismatch(broker, servers)) return reject("SERVER_BROKER_MISMATCH");
        const accountNo = String(account.accountNo);
        const fields = {
          name: String(account.name ?? ""),
          branchNo: String(account.branchNo ?? ""),
          traderId: String(account.traderId ?? ""),
          priority: Number(account.priority ?? 0),
        };
        const existing = this.#account(id, broker, accountNo);
        if (existing) Object.assign(existing, fields);
        else this.accounts.push({ dmaUserId: id, broker, accountNo, ...fields });
        for (const row of this.serverRows) {
          if (row.dmaUserId === id && row.broker === broker && row.accountNo === accountNo && !servers.includes(row.serverKey)) {
            row.state = "removing";
          }
        }
        for (const s of servers) {
          const row = this.serverRows.find(
            (r) => r.dmaUserId === id && r.broker === broker && r.accountNo === accountNo && r.serverKey === s,
          );
          if (row) row.state = "active";
          else this.serverRows.push({ dmaUserId: id, broker, accountNo, serverKey: s, state: "active" });
        }
        const removing = this.serverRows
          .filter((r) => r.dmaUserId === id && r.broker === broker && r.accountNo === accountNo && r.state === "removing")
          .map((r) => r.serverKey)
          .sort();
        return ok({ activated: servers, removing });
      }
      case "dma_admin_mark_account_removed": {
        const broker = args.p_broker as DmaBroker;
        const accountNo = String(args.p_account_no);
        if (!this.#account(id, broker, accountNo)) return reject("NO_SUCH_ACCOUNT");
        const otherActive = this.serverRows.some(
          (s) => s.dmaUserId === id && s.state === "active" && !(s.broker === broker && s.accountNo === accountNo),
        );
        if (!otherActive) return reject("LAST_ACCOUNT");
        for (const s of this.serverRows) {
          if (s.dmaUserId === id && s.broker === broker && s.accountNo === accountNo && s.state === "active") s.state = "removing";
        }
        return ok(null);
      }
      case "dma_admin_settle_server": {
        const server = String(args.p_server_key);
        const removed = Array.isArray(args.p_removed_accounts) ? (args.p_removed_accounts as string[]) : [];
        const before = this.serverRows.length;
        this.serverRows = this.serverRows.filter((s) => {
          if (s.dmaUserId !== id || s.serverKey !== server) return true;
          if (args.p_user_removed === true) return false;
          return !(s.state === "removing" && removed.includes(s.accountNo));
        });
        const deletedRows = before - this.serverRows.length;
        return ok({ deletedRows, deletedAccounts: this.#dropOrphanAccounts(id) });
      }
      case "dma_admin_delete_dma_user": {
        if (!this.dmaUsers.has(id)) return reject("NO_DMA_USER");
        if (this.serverRows.some((s) => s.dmaUserId === id)) return reject("SERVERS_REMAIN");
        this.dmaUsers.delete(id);
        this.accounts = this.accounts.filter((a) => a.dmaUserId !== id);
        return ok(null);
      }
      case "dma_admin_intent":
        return ok(this.intentOf(id));
      case "dma_admin_record_results": {
        const rows = Array.isArray(args.p_results) ? (args.p_results as Array<{ server?: string }>) : [];
        if (!this.dmaUsers.has(id)) return ok(0);
        return ok(rows.filter((r) => typeof r.server === "string" && this.serverBroker.has(r.server)).length);
      }
      default:
        return ok(null);
    }
  }

  #query(table: string): unknown {
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const rows = (): Array<Record<string, unknown>> => {
      const source: Array<Record<string, unknown>> =
        table === "dma_users"
          ? [...this.dmaUsers].map(([dma_user_id, password_enc]) => ({ dma_user_id, password_enc }))
          : table === "dma_credentials"
            ? (this.legacy as unknown as Array<Record<string, unknown>>)
            : [];
      return source.filter((r) => filters.every(([col, v]) => r[col] === v));
    };
    const exec = (): Result => {
      if (patch !== null) {
        this.calls.push({ name: `update:${table}`, args: { patch: { ...patch }, filters: Object.fromEntries(filters) } });
        for (const r of rows()) Object.assign(r, patch);
        return ok(null);
      }
      return ok(rows().map((r) => ({ ...r })));
    };
    const builder = {
      select: () => builder,
      update: (p: Record<string, unknown>) => {
        patch = p;
        return builder;
      },
      eq: (col: string, v: unknown) => {
        filters.push([col, v]);
        return builder;
      },
      maybeSingle: () => Promise.resolve(ok(rows()[0] ? { ...rows()[0] } : null)),
      then: (resolve: (r: Result) => unknown, rejectFn?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(resolve, rejectFn),
    };
    return builder;
  }
}
