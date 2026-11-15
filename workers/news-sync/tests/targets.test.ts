import { describe, it, expect } from "vitest";
import {
  REGISTERED_IDLE_MINUTES,
  REGISTERED_LOOKUP_LIMIT,
  REGISTERED_ONLY_CAP,
  buildTargetRecords,
  loadTargets,
} from "../src/pipeline/targets";

/**
 * quick-261115-r4f — 화면 조회 등록 종목(kis_news_targets)을 news-sync 대상에 더한다.
 * 등록 전용 = 최근 10분 안 등록 · 급등 · 관심종목 밖 · 마스터 안 · ETP 아님 · 최근 조회순 30개까지.
 */

type Master = { code: string; name: string; security_group?: string | null };

function masterOf(code: string, extra: Partial<Master> = {}): Master {
  return { code, name: `n-${code}`, security_group: "주권", ...extra };
}

function regCodes(n: number, start = 500000): string[] {
  return Array.from({ length: n }, (_, i) => String(start + i));
}

describe("buildTargetRecords — 등록 전용 조립", () => {
  it("인자 3개 호출은 모든 레코드가 registered false", () => {
    const recs = buildTargetRecords(
      [{ code: "000001", rank: 3 }],
      ["000002"],
      [masterOf("000001"), masterOf("000002")],
    );
    expect(recs.map((r) => r.registered)).toEqual([false, false]);
  });

  it("등록 전용 35개 유효 입력 → 정확히 앞 30개 · rank null · watched false · registered true", () => {
    const codes = regCodes(35);
    const recs = buildTargetRecords([], [], codes.map((c) => masterOf(c)), codes);
    expect(REGISTERED_ONLY_CAP).toBe(30);
    expect(recs).toHaveLength(30);
    expect(recs.map((r) => r.code)).toEqual(codes.slice(0, 30));
    for (const r of recs) {
      expect(r).toEqual({ code: r.code, name: `n-${r.code}`, rank: null, watched: false, registered: true });
    }
  });

  it("급등 · 관심과 겹치는 코드는 상한을 먹지 않고 registered 표시도 없다 · 등급 규칙 그대로", () => {
    const codes = regCodes(35);
    const registered = ["000001", "000002", ...codes];
    const recs = buildTargetRecords(
      [{ code: "000001", rank: 45 }],
      ["000002"],
      [masterOf("000001"), masterOf("000002"), ...codes.map((c) => masterOf(c))],
      registered,
    );
    const regOnly = recs.filter((r) => r.registered);
    expect(regOnly).toHaveLength(30);
    expect(regOnly.map((r) => r.code)).toEqual(codes.slice(0, 30));
    expect(recs[0]).toEqual({ code: "000001", name: "n-000001", rank: 45, watched: false, registered: false });
    expect(recs[1]).toEqual({ code: "000002", name: "n-000002", rank: null, watched: true, registered: false });
    expect(recs.filter((r) => r.code === "000001")).toHaveLength(1);
  });

  it("마스터 밖 · ETP 는 빠지고 상한 자리도 먹지 않는다", () => {
    const valid = regCodes(30);
    const registered = ["777001", "777002", "777003", ...valid, "500999"];
    const masters = [
      // 777001 은 마스터에 없음
      masterOf("777002", { security_group: "ETF" }),
      masterOf("777003", { name: "KODEX 인버스" }),
      ...valid.map((c) => masterOf(c)),
      masterOf("500999"),
    ];
    const recs = buildTargetRecords([], [], masters, registered);
    expect(recs.map((r) => r.code)).toEqual(valid);
  });

  it("security_group null · 일반 이름은 들어간다", () => {
    const recs = buildTargetRecords(
      [],
      [],
      [{ code: "600001", name: "일반회사", security_group: null }, { code: "600002", name: "다른회사" }],
      ["600001", "600002"],
    );
    expect(recs.map((r) => r.code)).toEqual(["600001", "600002"]);
    expect(recs.every((r) => r.registered)).toBe(true);
  });

  it("같은 코드 중복은 1번만 · 순서 = 급등 → 관심 → 등록 전용(입력 순서)", () => {
    const recs = buildTargetRecords(
      [{ code: "000001", rank: 1 }],
      ["000002"],
      [masterOf("000001"), masterOf("000002"), masterOf("600002"), masterOf("600001")],
      ["600002", "600001", "600002"],
    );
    expect(recs.map((r) => r.code)).toEqual(["000001", "000002", "600002", "600001"]);
  });
});

// ── loadTargets 용 가짜 supabase ──────────────────────────────────────

type Result = { data: unknown; error: unknown } | { reject: unknown };

interface CallLog {
  table: string;
  calls: Array<[string, unknown[]]>;
}

function fakeSupabase(results: Record<string, Result[]>) {
  const log: CallLog[] = [];
  const supabase = {
    from(table: string) {
      const entry: CallLog = { table, calls: [] };
      log.push(entry);
      const queue = results[table] ?? [];
      const res = queue.shift() ?? { data: [], error: null };
      const settle = (): Promise<unknown> =>
        "reject" in res ? Promise.reject(res.reject) : Promise.resolve(res);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "in", "order", "limit"]) {
        chain[m] = (...args: unknown[]) => {
          entry.calls.push([m, args]);
          return chain;
        };
      }
      chain.maybeSingle = () => {
        entry.calls.push(["maybeSingle", []]);
        return settle();
      };
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        settle().then(ok, bad);
      return chain;
    },
  };
  return { supabase: supabase as never, log };
}

const NOW = new Date(Date.UTC(2026, 10, 15, 2, 30, 0)); // 2026-11-15 11:30 KST

function baseResults(registered: Result, masters: Master[]): Record<string, Result[]> {
  return {
    top_movers: [
      { data: { scan_id: "s1" }, error: null },
      { data: [{ code: "000001", rank: 1 }], error: null },
    ],
    watchlists: [{ data: [{ stock_code: "000002" }], error: null }],
    kis_news_targets: [registered],
    stocks: [{ data: masters, error: null }],
  };
}

describe("loadTargets — kis_news_targets 읽기", () => {
  it("질의 모양: gt(10분 전 ISO) · order(최근순 · 코드순) · limit(200) · 마스터 select 에 security_group", async () => {
    const { supabase, log } = fakeSupabase(
      baseResults(
        { data: [{ stock_code: "600001", last_requested_at: "x" }], error: null },
        [masterOf("000001"), masterOf("000002"), masterOf("600001")],
      ),
    );

    const out = await loadTargets(supabase, NOW);

    expect(out.registeredLookupError).toBeNull();
    expect(out.records.map((r) => [r.code, r.registered])).toEqual([
      ["000001", false],
      ["000002", false],
      ["600001", true],
    ]);

    const reg = log.find((l) => l.table === "kis_news_targets");
    expect(reg).toBeDefined();
    expect(REGISTERED_IDLE_MINUTES).toBe(10);
    expect(REGISTERED_LOOKUP_LIMIT).toBe(200);
    expect(reg!.calls).toEqual([
      ["select", ["stock_code, last_requested_at"]],
      ["gt", ["last_requested_at", "2026-11-15T02:20:00.000Z"]],
      ["order", ["last_requested_at", { ascending: false }]],
      ["order", ["stock_code", { ascending: true }]],
      ["limit", [200]],
    ]);

    const st = log.find((l) => l.table === "stocks");
    expect(st!.calls[0]).toEqual(["select", ["code, name, security_group"]]);
    const inCall = st!.calls.find((c) => c[0] === "in");
    expect([...(inCall![1][1] as string[])].sort()).toEqual(["000001", "000002", "600001"]);
  });

  it("급등 · 관심이 0건이어도 등록 전용이 있으면 담긴다", async () => {
    const { supabase } = fakeSupabase({
      top_movers: [{ data: null, error: null }],
      watchlists: [{ data: [], error: null }],
      kis_news_targets: [{ data: [{ stock_code: "600001", last_requested_at: "x" }], error: null }],
      stocks: [{ data: [masterOf("600001")], error: null }],
    });

    const out = await loadTargets(supabase, NOW);

    expect(out.records).toEqual([
      { code: "600001", name: "n-600001", rank: null, watched: false, registered: true },
    ]);
    expect(out.registeredLookupError).toBeNull();
  });

  it("대상이 모두 비면 마스터 조회 없이 빈 records", async () => {
    const { supabase, log } = fakeSupabase({
      top_movers: [{ data: null, error: null }],
      watchlists: [{ data: [], error: null }],
      kis_news_targets: [{ data: [], error: null }],
    });

    const out = await loadTargets(supabase, NOW);

    expect(out).toEqual({ records: [], registeredLookupError: null });
    expect(log.some((l) => l.table === "stocks")).toBe(false);
  });

  it("kis_news_targets 에러 응답 → throw 없이 급등 ∪ 관심 그대로 + 에러 메시지", async () => {
    const { supabase } = fakeSupabase(
      baseResults(
        { data: null, error: { message: "permission denied for table kis_news_targets" } },
        [masterOf("000001"), masterOf("000002")],
      ),
    );

    const out = await loadTargets(supabase, NOW);

    expect(out.records.map((r) => r.code)).toEqual(["000001", "000002"]);
    expect(out.records.every((r) => !r.registered)).toBe(true);
    expect(out.registeredLookupError).toBe("permission denied for table kis_news_targets");
  });

  it("kis_news_targets 예외 → throw 없이 급등 ∪ 관심 그대로 + 예외 메시지", async () => {
    const { supabase } = fakeSupabase(
      baseResults({ reject: new Error("fetch failed") }, [masterOf("000001"), masterOf("000002")]),
    );

    const out = await loadTargets(supabase, NOW);

    expect(out.records.map((r) => r.code)).toEqual(["000001", "000002"]);
    expect(out.registeredLookupError).toBe("fetch failed");
  });
});
