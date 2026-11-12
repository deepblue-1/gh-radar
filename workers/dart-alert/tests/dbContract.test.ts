import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  CLAIMED_ROW_KEYS,
  createDartAlertDb,
  INSERTED_ROW_KEYS,
  LEASE_RESULT_KEYS,
  LeaseLostError,
  OUTAGE_RESULT_KEYS,
} from "../src/db";
import type { ClaimedRow, InsertedRow, InsertItem } from "../src/lap";

/**
 * Phase 43-02 Task 3 — 워커 DB 어댑터(src/db.ts) ↔ 마이그레이션 파일 자동 대조(체커 W5).
 *
 * PostgREST 는 이름 붙은 인자로 함수를 찾는다 — rpc 이름이나 `p_*` 인자 키가 하나라도 어긋나면 운영에서
 * 「함수를 못 찾음」 이 난다. 가짜 DB 로만 도는 테스트는 그 어긋남을 못 잡으므로, 이 파일은 저장소의 실제
 * 마이그레이션(이름이 `_dart_alert.sql` 로 끝나는 파일 하나)을 읽어 함수 시그니처 · 본문 · 상태 표 정의를 뽑고
 * 어댑터가 실제로 부르는 이름 · 인자 키 · 읽는 반환 키 · 고른 칸과 대조한다.
 *
 * 범위: 워커가 부르는 dart_alert RPC 여섯 + 상태 표 읽기. `incr_api_usage`(43-03)는 kis-news-sync 가 운영에서 같은
 * 인자로 쓰는 기존 RPC 라 대조하지 않고, `dart_alert_ops_stats` 는 워커가 부르지 않는다(43-07 보고 스크립트) —
 * 파서 자기 점검의 개수에만 들어간다.
 */

// ── 마이그레이션 찾기 · 읽기 ────────────────────────────────────────
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

function findMigration(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith("_dart_alert.sql"));
}

// ── 작은 파서 ───────────────────────────────────────────────────────
interface SqlParam {
  name: string;
  hasDefault: boolean;
}
interface SqlFn {
  name: string;
  params: SqlParam[];
  returns: string;
  body: string;
}

/** `-- …` 줄 주석을 지운다(주석 안의 괄호 · 쉼표 · 함수 이름이 파서를 속이지 않게) */
function stripLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i < 0 ? line : line.slice(0, i);
    })
    .join("\n");
}

/** `open` 위치의 `(` 와 짝인 `)` 위치 */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`짝 없는 괄호 @${open}`);
}

/** 깊이 0 의 쉼표로 나눈다 */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const FN_HEAD = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(\w+)\s*\(/gi;

/** 같은 이름이 둘 이상이면 마지막 정의(DB 에 남는 것) */
function parseFunctions(sqlRaw: string): Map<string, SqlFn> {
  const sql = stripLineComments(sqlRaw);
  const heads: { name: string; start: number; open: number }[] = [];
  for (const m of sql.matchAll(FN_HEAD)) {
    heads.push({ name: m[1]!, start: m.index!, open: m.index! + m[0].length - 1 });
  }
  const fns = new Map<string, SqlFn>();
  heads.forEach((h, i) => {
    const close = matchParen(sql, h.open);
    const params = splitTop(sql.slice(h.open + 1, close)).map((p) => ({
      name: p.split(/\s+/)[0]!,
      hasDefault: /\bDEFAULT\b/i.test(p),
    }));
    const ret = /^\s*RETURNS\s+(\w+)/i.exec(sql.slice(close + 1));
    const end = i + 1 < heads.length ? heads[i + 1]!.start : sql.length;
    fns.set(h.name, {
      name: h.name,
      params,
      returns: ret ? ret[1]!.toLowerCase() : "",
      body: sql.slice(h.start, end),
    });
  });
  return fns;
}

function parseTableColumns(sqlRaw: string, table: string): string[] {
  const sql = stripLineComments(sqlRaw);
  const m = new RegExp(`CREATE\\s+TABLE\\s+public\\.${table}\\s*\\(`, "i").exec(sql);
  if (!m) return [];
  const open = m.index + m[0].length - 1;
  const close = matchParen(sql, open);
  return splitTop(sql.slice(open + 1, close))
    .map((def) => def.split(/\s+/)[0]!)
    .filter((w) => !/^(PRIMARY|CONSTRAINT|CHECK|UNIQUE|FOREIGN|EXCLUDE)$/i.test(w));
}

// ── 가짜 supabase 클라이언트 ─────────────────────────────────────────
interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}
interface TableRead {
  table: string;
  columns: string;
  eq: [string, unknown][];
}
type Reply = { data: unknown; error: unknown };

function fakeSupabase(script: Record<string, Reply> = {}, stateRow: unknown = null) {
  const calls: RpcCall[] = [];
  const reads: TableRead[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return script[fn] ?? { data: null, error: null };
    },
    from: (table: string) => {
      const read: TableRead = { table, columns: "", eq: [] };
      reads.push(read);
      const q = {
        select(columns: string) {
          read.columns = columns;
          return q;
        },
        eq(col: string, val: unknown) {
          read.eq.push([col, val]);
          return q;
        },
        maybeSingle: async () => ({ data: stateRow, error: null }),
        single: async () => ({ data: stateRow, error: null }),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, reads };
}

/** 값이 undefined 인 키는 JSON 으로 나가지 않는다 */
function wireKeys(args: Record<string, unknown>): string[] {
  return Object.keys(JSON.parse(JSON.stringify(args)) as Record<string, unknown>);
}

interface Mismatch {
  fn: string;
  unknown: string[];
  missingRequired: string[];
}

function compareCalls(fns: Map<string, SqlFn>, calls: RpcCall[]): Mismatch[] {
  const out: Mismatch[] = [];
  for (const c of calls) {
    const f = fns.get(c.fn);
    if (!f) {
      out.push({ fn: c.fn, unknown: ["<마이그레이션에 없는 함수>"], missingRequired: [] });
      continue;
    }
    const keys = wireKeys(c.args);
    const names = f.params.map((p) => p.name);
    const unknown = keys.filter((k) => !names.includes(k));
    const missingRequired = f.params.filter((p) => !p.hasDefault && !keys.includes(p.name)).map((p) => p.name);
    if (unknown.length > 0 || missingRequired.length > 0) out.push({ fn: c.fn, unknown, missingRequired });
  }
  return out;
}

// ── 대본 ───────────────────────────────────────────────────────────
const HOLDER = "exec-HOLDER-SECRET-LIKE:1a2b3c4d";
const RCEPT = "20261112000777";

const ITEM: InsertItem = {
  rcept_no: RCEPT,
  watch: "tender_offer",
  priority: 0,
  rcept_dt: "2026-11-12",
  corp_cls: "K",
  corp_name: "아이템회사-ITEM-CONTENT",
  stock_code: "069510",
  report_nm: "공개매수신고서",
  flr_nm: "가람홀딩스",
  late: false,
};
const INSERTED: InsertedRow[] = [{ rcept_no: RCEPT, late: false }];
const CLAIMED: (ClaimedRow & { stale: boolean })[] = [
  {
    rcept_no: RCEPT,
    watch: "tender_offer",
    corp_cls: "K",
    corp_name: "에스텍",
    stock_code: "069510",
    report_nm: "공개매수신고서",
    flr_nm: "가람홀딩스",
    late: false,
    attempts: 1,
    first_seen_at: "2026-11-12T00:30:00+00:00",
    stale: false,
  },
];
const HAPPY: Record<string, Reply> = {
  dart_alert_lease_acquire: { data: { held: true, fresh: true, reclaimed: 0, expired: 0 }, error: null },
  dart_alert_lease_release: { data: true, error: null },
  dart_alert_insert: { data: INSERTED, error: null },
  dart_alert_claim: { data: CLAIMED, error: null },
  dart_alert_mark: { data: true, error: null },
  dart_alert_outage: { data: { opened: true, since: "2026-11-12T00:35:00+00:00" }, error: null },
};

/** 어댑터 메서드를 모두 부른다 — leaseAcquire 는 lastOk 있음 · 없음, outage 는 open(사유) · notice(sent) · close */
async function callEverything() {
  const fake = fakeSupabase(HAPPY, { last_ok: {}, outage_since: null, outage_notice: null });
  const db = createDartAlertDb(fake.client, HOLDER);
  await db.leaseAcquire(HOLDER, 90, { tender_offer: "2026-11-12T00:30:00Z" });
  await db.leaseAcquire(HOLDER, 90);
  await db.insert([ITEM], false);
  await db.claim(5);
  await db.mark(RCEPT, { ok: true, messageId: 4242, error: null, retryInS: 0 });
  await db.mark(RCEPT, { ok: false, messageId: null, error: "transient:0", retryInS: 5 });
  await db.outage("open", "DART 조회 실패");
  await db.outage("notice", "sent");
  await db.outage("close");
  await db.leaseRelease(HOLDER);
  await db.readState();
  return fake;
}

const WORKER_RPCS = [
  "dart_alert_claim",
  "dart_alert_insert",
  "dart_alert_lease_acquire",
  "dart_alert_lease_release",
  "dart_alert_mark",
  "dart_alert_outage",
];

// ── 테스트 ─────────────────────────────────────────────────────────
describe("dbContract — src/db.ts ↔ 마이그레이션 _dart_alert.sql", () => {
  const files = findMigration();
  const sql = files.length === 1 ? readFileSync(join(MIGRATIONS_DIR, files[0]!), "utf8") : "";
  const fns = parseFunctions(sql);
  const stateCols = parseTableColumns(sql, "dart_alert_state");

  it("이름이 _dart_alert.sql 로 끝나는 마이그레이션이 정확히 1개", () => {
    expect(files).toHaveLength(1);
  });

  it("파서 자기 점검 — 함수 7개 이상 · 상태 칸 1개 이상 · 인자 키를 바꾼 가짜 기록은 어긋남으로 잡힌다", async () => {
    const dartFns = [...fns.keys()].filter((n) => n.startsWith("dart_alert_"));
    expect(dartFns.length).toBeGreaterThanOrEqual(7);
    expect(dartFns).toEqual(expect.arrayContaining([...WORKER_RPCS, "dart_alert_ops_stats"]));
    expect(stateCols.length).toBeGreaterThanOrEqual(1);
    expect(stateCols).toEqual(expect.arrayContaining(["id", "lease_holder", "last_ok", "outage_since", "outage_notice"]));

    const { calls } = await callEverything();
    const tampered = calls.map((c) => {
      if (c.fn !== "dart_alert_mark") return c;
      const { p_retry_in_s, ...rest } = c.args;
      return { fn: c.fn, args: { ...rest, p_retry_s: p_retry_in_s } };
    });
    expect(compareCalls(fns, tampered).length).toBeGreaterThanOrEqual(1);
    expect(compareCalls(fns, [{ fn: "dart_alert_nope", args: {} }]).length).toBe(1);
  });

  it("어댑터의 rpc 이름과 인자 키가 마이그레이션 함수 시그니처와 같다", async () => {
    const { calls } = await callEverything();
    expect([...new Set(calls.map((c) => c.fn))].sort()).toEqual(WORKER_RPCS);
    for (const fn of WORKER_RPCS) expect(fns.has(fn)).toBe(true);
    const mismatches = compareCalls(fns, calls);
    expect(mismatches).toEqual([]);

    // 선택 인자: 값이 없으면 키를 넣지 않는다(DEFAULT 로 간다)
    const leases = calls.filter((c) => c.fn === "dart_alert_lease_acquire");
    expect(wireKeys(leases[0]!.args).sort()).toEqual(["p_holder", "p_last_ok", "p_ttl_seconds"]);
    expect(wireKeys(leases[1]!.args).sort()).toEqual(["p_holder", "p_ttl_seconds"]);
    const outages = calls.filter((c) => c.fn === "dart_alert_outage");
    expect(outages.map((c) => c.args)).toEqual([
      { p_holder: HOLDER, p_action: "open", p_reason: "DART 조회 실패" },
      { p_holder: HOLDER, p_action: "notice", p_reason: "sent" },
      { p_holder: HOLDER, p_action: "close" },
    ]);
    // 넣기 · 차례 · 기록 · 장애의 p_holder 는 어댑터를 만들 때 받은 holder
    for (const c of calls) expect(c.args.p_holder).toBe(HOLDER);
    const marks = calls.filter((c) => c.fn === "dart_alert_mark");
    expect(marks[1]!.args).toEqual({
      p_holder: HOLDER,
      p_rcept_no: RCEPT,
      p_ok: false,
      p_message_id: null,
      p_error: "transient:0",
      p_retry_in_s: 5,
    });
    expect(calls.find((c) => c.fn === "dart_alert_insert")!.args).toEqual({
      p_holder: HOLDER,
      p_items: [ITEM],
      p_seed: false,
    });
    expect(calls.find((c) => c.fn === "dart_alert_claim")!.args).toEqual({ p_holder: HOLDER, p_limit: 5 });
  });

  it("반환 형 — lease_acquire · insert · claim · outage 는 jsonb, lease_release · mark 는 boolean", () => {
    const returns = Object.fromEntries(WORKER_RPCS.map((n) => [n, fns.get(n)?.returns]));
    expect(returns).toEqual({
      dart_alert_claim: "jsonb",
      dart_alert_insert: "jsonb",
      dart_alert_lease_acquire: "jsonb",
      dart_alert_lease_release: "boolean",
      dart_alert_mark: "boolean",
      dart_alert_outage: "jsonb",
    });
  });

  it("반환 키 — 워커가 읽는 키가 그 함수 본문(마지막 정의)에 jsonb 키 낱말로 있다", () => {
    const want: Record<string, readonly string[]> = {
      dart_alert_lease_acquire: LEASE_RESULT_KEYS,
      dart_alert_insert: INSERTED_ROW_KEYS,
      dart_alert_claim: CLAIMED_ROW_KEYS,
      dart_alert_outage: OUTAGE_RESULT_KEYS,
    };
    const missing: string[] = [];
    for (const [fn, keys] of Object.entries(want)) {
      const body = fns.get(fn)?.body ?? "";
      for (const k of keys) if (!body.includes(`'${k}'`)) missing.push(`${fn}.${k}`);
    }
    expect(missing).toEqual([]);
    expect(CLAIMED_ROW_KEYS).toContain("stale");
  });

  it("readState — dart_alert_state 의 id = 1 한 행에서 표에 있는 칸만 골라 DartAlertState 로 바꾼다", async () => {
    const fake = fakeSupabase({}, {
      last_ok: { tender_offer: "2026-11-12T00:30:00Z" },
      outage_since: null,
      outage_notice: null,
    });
    const db = createDartAlertDb(fake.client, HOLDER);
    expect(await db.readState()).toEqual({
      lastOk: { tender_offer: "2026-11-12T00:30:00Z" },
      outage: { since: null, notice: null },
    });
    expect(fake.reads).toHaveLength(1);
    const read = fake.reads[0]!;
    expect(read.table).toBe("dart_alert_state");
    expect(read.eq).toEqual([["id", 1]]);
    const picked = read.columns.split(",").map((c) => c.trim()).filter(Boolean);
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.filter((c) => !stateCols.includes(c))).toEqual([]);

    const open = fakeSupabase({}, { last_ok: {}, outage_since: "2026-11-12T00:35:00+00:00", outage_notice: "sent" });
    expect(await createDartAlertDb(open.client, HOLDER).readState()).toEqual({
      lastOk: {},
      outage: { since: "2026-11-12T00:35:00+00:00", notice: "sent" },
    });
  });

  it("오류 — 55000 은 LeaseLostError(insert · claim · mark · outage), 22023 은 holder · 접수번호 · items 없는 일반 Error", async () => {
    const lost = { data: null, error: { code: "55000", message: "dart_alert_x: 임대 보유자가 아니다", details: HOLDER } };
    const script = Object.fromEntries(
      ["dart_alert_insert", "dart_alert_claim", "dart_alert_mark", "dart_alert_outage"].map((n) => [n, lost]),
    );
    const db = createDartAlertDb(fakeSupabase(script).client, HOLDER);
    const attempts: (() => Promise<unknown>)[] = [
      () => db.insert([ITEM], false),
      () => db.claim(5),
      () => db.mark(RCEPT, { ok: true, messageId: 1, error: null, retryInS: 0 }),
      () => db.outage("open", "사유"),
    ];
    for (const run of attempts) {
      const err = await run().then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(LeaseLostError);
      expect((err as Error).name).toBe("LeaseLostError");
      expect((err as Error).message).not.toContain(HOLDER);
    }

    const bad = {
      data: null,
      error: {
        code: "22023",
        message: "dart_alert_insert: p_items 는 jsonb 배열이어야 한다",
        details: `${HOLDER} ${RCEPT} ${ITEM.corp_name}`,
        hint: JSON.stringify([ITEM]),
      },
    };
    const db2 = createDartAlertDb(
      fakeSupabase({ dart_alert_insert: bad, dart_alert_mark: bad }).client,
      HOLDER,
    );
    for (const run of [() => db2.insert([ITEM], false), () => db2.mark(RCEPT, { ok: false, messageId: null, error: "x", retryInS: 1 })]) {
      const err = (await run().then(
        () => null,
        (e: unknown) => e,
      )) as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(LeaseLostError);
      expect(err.message).toContain("22023");
      for (const secret of [HOLDER, RCEPT, ITEM.corp_name]) expect(err.message).not.toContain(secret);
    }
  });

  it("반환 — release · mark 의 data 가 boolean 이 아니면 Error · insert · claim 은 대본 배열 그대로", async () => {
    const weird = { data: "true", error: null };
    const db = createDartAlertDb(
      fakeSupabase({ dart_alert_lease_release: weird, dart_alert_mark: { data: null, error: null } }).client,
      HOLDER,
    );
    await expect(db.leaseRelease(HOLDER)).rejects.toThrow(Error);
    await expect(db.mark(RCEPT, { ok: true, messageId: 1, error: null, retryInS: 0 })).rejects.toThrow(Error);

    const ok = createDartAlertDb(fakeSupabase(HAPPY).client, HOLDER);
    expect(await ok.insert([ITEM], false)).toEqual(INSERTED);
    expect(await ok.claim(5)).toEqual(CLAIMED);
    expect(await ok.leaseAcquire(HOLDER, 90)).toEqual({ held: true, fresh: true, reclaimed: 0, expired: 0 });
    expect(await ok.leaseRelease(HOLDER)).toBe(true);
    expect(await ok.mark(RCEPT, { ok: true, messageId: 1, error: null, retryInS: 0 })).toBe(true);
    expect(await ok.outage("open", "사유")).toEqual({ opened: true, since: "2026-11-12T00:35:00+00:00" });
  });
});
