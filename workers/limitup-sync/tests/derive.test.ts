import { describe, it, expect } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readNdjsonGz, type Row } from "../src/load";
import { gridSummaryOf, kstSecOfDay, memberDailyOf, memberTopShares, type GridJson } from "../src/derive";

/**
 * 파생 2표 — gh-trade 보고서 정의 대조(「같은 숫자 원칙」 · RESEARCH Pitfall 11).
 * 골든 = tests/fixtures/make-golden.py(gh-trade venv · `fingerprint_agg` · `_sell_share_after` 를 import)의 출력
 * `export/20261002/expected-derive.json`. member_top 곱셈은 float64(int64 넘침 보정 — 스크립트 머리 주석).
 */
const DAY = join(__dirname, "fixtures", "export", "20261002");
const DATE = "20261002";

type GoldenMember = {
  member: string;
  name: string | null;
  n: number;
  entry_sum: number;
  entry_cnt: number;
  lock_buy_sum: number;
  lock_buy_cnt: number;
  pre_sell_sum: number;
  pre_sell_cnt: number;
  lead: number;
  n_broke: number;
  n_lock: number;
  n_held: number;
};
type GoldenGrid = { isin: string; q_max_krw: number | null; q_max_ms: number | null; sell_share_60s: number | null };
const golden = JSON.parse(readFileSync(join(DAY, "expected-derive.json"), "utf8")) as {
  member_daily: GoldenMember[];
  grid_summary: GoldenGrid[];
};

const entries = readNdjsonGz(join(DAY, "entries.ndjson.gz"));
const locks = readNdjsonGz(join(DAY, "locks.ndjson.gz"));
const alloc = readNdjsonGz(join(DAY, "member_alloc.ndjson.gz"));
const grids = readdirSync(join(DAY, "grid"))
  .sort()
  .map((f) => JSON.parse(gunzipSync(readFileSync(join(DAY, "grid", f))).toString("utf8")) as GridJson);
const locksOf = (isin: string) => locks.filter((r) => r.isin === isin);

describe("kstSecOfDay", () => {
  it("epoch ms → 그날 00:00 KST 기준 초(내림)", () => {
    expect(kstSecOfDay(Date.parse("2026-10-02T13:57:08.020+09:00"))).toBe(50228);
    expect(kstSecOfDay(Date.parse("2026-10-02T09:00:00.999+09:00"))).toBe(32400);
  });
});

describe("gridSummaryOf", () => {
  it("step_s · sec0 · q_krw(coarse 그대로 · null 유지) · date · isin", () => {
    for (const g of grids) {
      const s = gridSummaryOf(DATE, g, locksOf(g.isin));
      expect(s.date).toBe(DATE);
      expect(s.isin).toBe(g.isin);
      expect(s.step_s).toBe(10);
      expect(s.sec0).toBe(32400);
      expect(s.q_krw).toHaveLength(2340);
      expect(s.q_krw).toEqual(g.coarse.cols.q_krw);
    }
  });

  it("q_krw null 은 null 로 남는다 · 최대 계산에서 빠진다", () => {
    const g = structuredClone(grids[0]);
    g.coarse.cols.q_krw[5] = null;
    const s = gridSummaryOf(DATE, g, locksOf(g.isin));
    expect(s.q_krw[5]).toBeNull();
    expect(s.q_max_krw).not.toBeNull();
  });

  it("q_max_krw · q_max_ms · sell_share_60s 가 골든과 같다(1e-9)", () => {
    const got = grids.map((g) => gridSummaryOf(DATE, g, locksOf(g.isin)));
    expect(got.map((s) => s.isin)).toEqual(golden.grid_summary.map((s) => s.isin));
    for (const [i, s] of got.entries()) {
      const want = golden.grid_summary[i];
      expect(s.q_max_krw).toBe(want.q_max_krw);
      expect(s.q_max_ms).toBe(want.q_max_ms);
      if (want.sell_share_60s === null) expect(s.sell_share_60s).toBeNull();
      else expect(s.sell_share_60s).toBeCloseTo(want.sell_share_60s, 9);
    }
  });

  it("깨진 잠김 종목(덕우전자)의 +60초 매도 비중은 null 이 아니다 · 잠김 없는 종목은 null", () => {
    const broke = grids.find((g) => g.isin === "KR7263600009")!;
    const none = grids.find((g) => g.isin === "KR7308100007")!;
    expect(gridSummaryOf(DATE, broke, locksOf(broke.isin)).sell_share_60s).not.toBeNull();
    expect(gridSummaryOf(DATE, none, locksOf(none.isin)).sell_share_60s).toBeNull();
  });

  it("+60초 매도는 fine 점(sec = s0+10 … s0+60)만 쓴다 — 창 밖 · 10초 배수가 아닌 점은 무시", () => {
    const sec = [100, 105, 110, 120, 160, 170, 171];
    const col = (v: number) => sec.map(() => v);
    const g: GridJson = {
      schema_version: 1,
      date: DATE,
      isin: "X",
      coarse: { step_s: 10, sec: [100], cols: { t_ms: [1], q_krw: [5] } },
      fine: {
        margin_s: 300,
        windows: [
          { from_sec: 100, to_sec: 171, sec, cols: { t_ms: col(2), q_krw: col(1), sell_led_10s: [1000, 1000, 3, 1, 0, 1000, 1000], buy_led_10s: [1000, 1000, 1, 1, 2, 1000, 1000] } },
        ],
      },
    };
    // s0 = 100 → 쓰는 점 110 · 120 · 160 (100 은 sec > s0 아님 · 105/171 은 10초 배수 아님 · 170 은 s0+60 초과)
    const lockStart = Date.parse("2026-10-02T00:01:40.500+09:00"); // KST 하루 100.5초 → 내림 100
    const s = gridSummaryOf(DATE, g, [{ isin: "X", lock_id: 1, start_ms: lockStart, end_ms: lockStart + 5000 }]);
    expect(s.sell_share_60s).toBeCloseTo(4 / 8, 12);
    expect(s.q_max_krw).toBe(5);
    expect(s.q_max_ms).toBe(1);
  });

  it("q_max 동률이면 이른 t_ms · 매도+매수 합 0 이면 null", () => {
    const g: GridJson = {
      schema_version: 1,
      date: DATE,
      isin: "X",
      coarse: { step_s: 10, sec: [100, 110], cols: { t_ms: [900, 800], q_krw: [7, 7] } },
      fine: { margin_s: 300, windows: [{ from_sec: 110, to_sec: 120, sec: [110, 120], cols: { t_ms: [700, 600], q_krw: [7, 3], sell_led_10s: [0, 0], buy_led_10s: [0, 0] } }] },
    };
    const st = Date.parse("2026-10-02T00:01:40+09:00");
    const s = gridSummaryOf(DATE, g, [{ isin: "X", lock_id: 1, start_ms: st, end_ms: st + 1 }]);
    expect(s.q_max_krw).toBe(7);
    expect(s.q_max_ms).toBe(700);
    expect(s.sell_share_60s).toBeNull();
  });

  it("격자 date 가 적재 날짜와 다르면 throw", () => {
    expect(() => gridSummaryOf("20261001", grids[0], [])).toThrow(/date/);
  });
});

describe("memberTopShares", () => {
  const rows: Row[] = [
    { side: "buy", member: "A", start_ms: 0, end_ms: 100, d_value: 100 }, // 창 [50,150] 과 50 겹침 → 50
    { side: "buy", member: "B", start_ms: 50, end_ms: 150, d_value: 30 }, // 전부 겹침 → 30
    { side: "buy", member: "A", start_ms: 200, end_ms: 300, d_value: 999 }, // 안 겹침 → 0
    { side: "buy", member: "C", start_ms: 60, end_ms: 70, d_value: -5 }, // 합 0 이하 → 제외
    { side: "sell", member: "D", start_ms: 0, end_ms: 200, d_value: 1000 }, // 다른 side
  ];
  it("겹친 길이 가중 · 0 이하 제외 · 비중 = 창구 합 ÷ 전체 합", () => {
    const m = memberTopShares(rows, "buy", 50, 150);
    expect([...m.keys()].sort()).toEqual(["A", "B"]);
    expect(m.get("A")).toBeCloseTo(50 / 80, 12);
    expect(m.get("B")).toBeCloseTo(30 / 80, 12);
  });
  it("겹치는 증분이 없으면 빈 Map", () => {
    expect(memberTopShares(rows, "buy", 1000, 2000).size).toBe(0);
  });
});

describe("memberDailyOf", () => {
  it("창구 회원번호 정렬 · 행 키 = 표 열 이름 · date = 적재 날짜", () => {
    const rows = memberDailyOf(DATE, entries, locks, alloc);
    expect(rows.map((r) => r.member)).toEqual([...rows.map((r) => r.member)].sort());
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(
        [
          "date", "member", "name", "n", "entry_sum", "entry_cnt", "lock_buy_sum", "lock_buy_cnt",
          "pre_sell_sum", "pre_sell_cnt", "lead", "n_broke", "n_lock", "n_held",
        ].sort(),
      );
      expect(r.date).toBe(DATE);
    }
  });

  it("n · 합 · 수 · lead · n_broke · n_lock · n_held 가 골든(gh-trade fingerprint_agg)과 같다", () => {
    const rows = memberDailyOf(DATE, entries, locks, alloc);
    expect(rows.map((r) => r.member)).toEqual(golden.member_daily.map((r) => r.member));
    for (const [i, r] of rows.entries()) {
      const w = golden.member_daily[i];
      expect(r.name).toBe(w.name);
      for (const k of ["n", "entry_cnt", "lock_buy_cnt", "pre_sell_cnt", "lead", "n_broke", "n_lock", "n_held"] as const) {
        expect(r[k], `${w.member} ${k}`).toBe(w[k]);
      }
      for (const k of ["entry_sum", "lock_buy_sum", "pre_sell_sum"] as const) {
        expect(r[k], `${w.member} ${k}`).toBeCloseTo(w[k], 9);
      }
    }
  });

  it("매도만 한 창구도 lock_buy 0.0 으로 센다 · start/end 없는 잠김은 건너뛴다 · 선행 동률은 회원번호 큰 쪽", () => {
    const st = 1_000_000;
    const en = st + 120_000;
    const al: Row[] = [
      { isin: "X", side: "buy", member: "00001", name: "가", start_ms: st, end_ms: en, d_value: 100 },
      { isin: "X", side: "sell", member: "00002", name: "나", start_ms: st, end_ms: en, d_value: 50 },
      { isin: "X", side: "sell", member: "00003", name: "다", start_ms: st, end_ms: en, d_value: 50 },
    ];
    const lk: Row[] = [
      { isin: "X", lock_id: 1, start_ms: st, end_ms: en, broke: true },
      { isin: "X", lock_id: 2, start_ms: null, end_ms: en, broke: true },
    ];
    const rows = memberDailyOf(DATE, [], lk, al);
    const by = new Map(rows.map((r) => [r.member, r]));
    // anchor = 첫 잠김 시작(entries 없음) → 진입 창 [st−60s, st] 은 배분과 0 겹침 → 진입 없음
    expect(by.get("00001")).toMatchObject({ n: 1, entry_cnt: 0, lock_buy_sum: 1, lock_buy_cnt: 1, n_lock: 1, n_broke: 1, lead: 0 });
    expect(by.get("00002")).toMatchObject({ n: 1, lock_buy_sum: 0, lock_buy_cnt: 1, pre_sell_cnt: 1, lead: 0 });
    expect(by.get("00002")!.pre_sell_sum).toBeCloseTo(0.5, 12);
    expect(by.get("00003")).toMatchObject({ lead: 1, n_held: 0 });
  });

  it("진입 anchor 순서 — first_upper_ms 없으면 t{detect_rate_pct}_ms", () => {
    const t20 = 5_000_000;
    const al: Row[] = [{ isin: "X", side: "buy", member: "00009", name: null, start_ms: t20 - 30_000, end_ms: t20, d_value: 10 }];
    const en: Row[] = [{ date: DATE, isin: "X", first_upper_ms: null, detect_rate_pct: 20, t20_ms: t20, t25_ms: t20 + 999_999, t15_ms: null }];
    const rows = memberDailyOf(DATE, en, [], al);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ member: "00009", name: null, n: 1, entry_cnt: 1, n_lock: 0 });
    expect(rows[0].entry_sum).toBeCloseTo(1, 12);
  });
});
