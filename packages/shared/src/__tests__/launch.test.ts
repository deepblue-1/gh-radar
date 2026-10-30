/**
 * Phase 35 (35-03) — 발사 경계 계산 한 벌 골든(D-10 자동 대조 정답지).
 *
 * 픽스처 `__fixtures__/launch-pieces-1012-1026.json` 은 gh-trade 첨부 `pieces.json`(196행 · 10/12~10/26 16:00 Q16)의
 * 바이트 동일 사본이다. 기대값은 첨부 `launch-gate-map.html` 의 `group()` 출력(35-RESEARCH 「Code Examples」 표)이고,
 * 웹 지도(경계 띠 · 리본)와 relay 백필 머리 계산이 같은 shared 함수를 쓰므로 이 표가 둘 다 잠근다.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  isLaunchAccept,
  isLaunchFireBaseOf,
  isLaunchReject,
  isLaunchTailProbe,
  launchDaysOf,
  launchFireBaseOf,
  launchFireOf,
  launchGateSideOf,
  launchHeadOf,
  launchPanelStatsOf,
  launchRibbonAt,
  LAUNCH_FIRES,
  LAUNCH_ORDER,
  LAUNCH_RANGE_DAYS,
  type LaunchCalcPiece,
  type LaunchDayKind,
} from "../launch";
import { isMarketStrategyEvent, STRATEGY_EVENT_KIND } from "../strategy-event";

/** 첨부 pieces.json 한 원소. */
interface AttachRow {
  date: string;
  broker: string;
  market: string;
  wire: number;
  q: string;
  j: number;
  rel: number;
  result: string;
}

interface Piece extends LaunchCalcPiece {
  gateway: string;
  market: string;
}

const FIXTURE = fileURLToPath(new URL("../__fixtures__/launch-pieces-1012-1026.json", import.meta.url));
const RAW = JSON.parse(readFileSync(FIXTURE, "utf8")) as AttachRow[];

const GATEWAY: Record<string, string> = { KB: "KB120", 교보: "KYOBO119" };
const MARKET: Record<string, string> = { 코스피: "K", 코스닥: "Q" };

/** 테스트 어댑터 — broker/market 매핑 · rel → sent_rel_us · date → trade_date. */
const PIECES: Piece[] = RAW.map((r) => ({
  trade_date: r.date,
  gateway: GATEWAY[r.broker]!,
  market: MARKET[r.market]!,
  wire: r.wire,
  sent_rel_us: r.rel,
  result: r.result,
}));

function panel(gateway: string, market: string): Piece[] {
  return PIECES.filter((p) => p.gateway === gateway && p.market === market);
}

type DayTuple = [date: string, n: number, lo: number | null, hi: number | null, first: number, kind: LaunchDayKind];

function tuplesOf(pieces: Piece[]): DayTuple[] {
  return launchDaysOf(pieces).map((d) => [d.date.slice(5), d.pieces.length, d.lo, d.hi, d.first, d.kind]);
}

describe("첨부 pieces.json 입력", () => {
  it("196행 · 접수 132 · 101 47 · 기타 17", () => {
    expect(PIECES).toHaveLength(196);
    const count: Record<string, number> = {};
    for (const p of PIECES) count[p.result] = (count[p.result] ?? 0) + 1;
    expect(count).toEqual({ 접수: 132, "101": 47, 기타: 17 });
  });

  it("LAUNCH_ORDER = 첨부 ORDER(KB 코스닥 · KB 코스피 · 교보 코스닥 · 교보 코스피)", () => {
    expect(LAUNCH_ORDER).toEqual([
      ["KB120", "Q"],
      ["KB120", "K"],
      ["KYOBO119", "Q"],
      ["KYOBO119", "K"],
    ]);
  });
});

/**
 * 첨부 group() 출력 — D-10 정답지(35-RESEARCH 「Code Examples」 날짜별 표 33행 그대로).
 * (date, 조각 수, lo, hi, first, 분류)
 */
const EXPECTED_DAYS: Record<string, DayTuple[]> = {
  "KB120|Q": [
    ["10-12", 6, null, -342, -342, "all_accept"],
    ["10-13", 6, null, -347, -347, "all_accept"],
    ["10-14", 5, -350, -342, -352, "gate"],
    ["10-15", 6, -337, -327, -347, "gate"],
    ["10-16", 6, null, -342, -342, "all_accept"],
    ["10-20", 15, -347, -345, -347, "gate"],
    ["10-21", 3, -322, null, -342, "all_reject"],
    ["10-22", 16, -335, -334, -337, "gate"],
    ["10-23", 6, null, -327, -327, "all_accept"],
    ["10-26", 18, null, -332, -332, "all_accept"],
  ],
  "KB120|K": [
    ["10-12", 3, -302, null, -305, "all_reject"],
    ["10-14", 10, -291, -291, -301, "gate"],
    ["10-16", 3, null, null, -290, "unknown"],
    ["10-19", 6, null, -290, -290, "all_accept"],
    ["10-21", 3, -275, null, -295, "all_reject"],
    ["10-23", 6, -280, -260, -290, "gate"],
  ],
  "KYOBO119|Q": [
    ["10-12", 6, null, -476, -476, "all_accept"],
    ["10-13", 3, null, -498, -498, "all_accept"],
    ["10-14", 2, -537, null, -547, "all_reject"],
    ["10-15", 3, -512, null, -522, "all_reject"],
    ["10-16", 6, null, -510, -510, "all_accept"],
    ["10-19", 3, -497, null, -517, "all_reject"],
    ["10-20", 9, null, -511, -511, "all_accept"],
    ["10-21", 3, null, -516, -516, "all_accept"],
    ["10-22", 6, null, -521, -521, "all_accept"],
    ["10-23", 3, -501, null, -531, "all_reject"],
    ["10-26", 9, null, -521, -521, "all_accept"],
  ],
  "KYOBO119|K": [
    ["10-12", 3, -415, null, -415, "all_reject"],
    ["10-14", 4, -399, null, -410, "all_reject"],
    ["10-16", 3, -384, null, -404, "all_reject"],
    ["10-19", 6, null, -394, -394, "all_accept"],
    ["10-21", 3, -390, null, -400, "all_reject"],
    ["10-23", 6, null, -395, -395, "all_accept"],
  ],
};

/** 패널 집계 — 조각 수 · 날 수 · (경계, 전부 접수, 전부 거부, 판단 불가) · 접수 최소 · 거부 최대. */
const EXPECTED_PANELS: Record<string, { pieces: number; stats: ReturnType<typeof launchPanelStatsOf> }> = {
  "KB120|Q": {
    pieces: 87,
    stats: { days: 10, n_gate: 4, n_all_accept: 5, n_all_reject: 1, n_unknown: 0, min_accept: -347, max_reject: -322 },
  },
  "KB120|K": {
    pieces: 31,
    stats: { days: 6, n_gate: 2, n_all_accept: 1, n_all_reject: 2, n_unknown: 1, min_accept: -291, max_reject: -275 },
  },
  "KYOBO119|Q": {
    pieces: 53,
    stats: { days: 11, n_gate: 0, n_all_accept: 7, n_all_reject: 4, n_unknown: 0, min_accept: -521, max_reject: -497 },
  },
  "KYOBO119|K": {
    pieces: 25,
    stats: { days: 6, n_gate: 0, n_all_accept: 2, n_all_reject: 4, n_unknown: 0, min_accept: -395, max_reject: -384 },
  },
};

/** 리본 표본 — v = 첨부 NEXT(`{"KB|코스피":-285,"KB|코스닥":-337,"교보|코스피":-400,"교보|코스닥":-526}`). */
const EXPECTED_RIBBON: Record<string, { v: number; ok: number; bad: number; unknown: number }> = {
  "KB120|Q": { v: -337, ok: 5, bad: 3, unknown: 2 },
  "KB120|K": { v: -285, ok: 2, bad: 2, unknown: 2 },
  "KYOBO119|Q": { v: -526, ok: 0, bad: 3, unknown: 8 },
  "KYOBO119|K": { v: -400, ok: 0, bad: 3, unknown: 3 },
};

describe("launchDaysOf — 첨부 group() 이식", () => {
  for (const [gateway, market] of LAUNCH_ORDER) {
    const key = `${gateway}|${market}`;
    it(`${key} — 날짜별 (date, 조각, lo, hi, first, 분류)가 정답지와 같다`, () => {
      expect(tuplesOf(panel(gateway, market))).toEqual(EXPECTED_DAYS[key]);
    });
  }

  it("정답지 33행 = 발사 33개", () => {
    expect(Object.values(EXPECTED_DAYS).reduce((s, rows) => s + rows.length, 0)).toBe(33);
  });

  it("KB 코스피 10/16 — 조각 3개 전부 기타 → 판단 불가(lo · hi null · Pitfall 5)", () => {
    const [d] = launchDaysOf(panel("KB120", "K").filter((p) => p.trade_date === "2026-10-16"));
    expect(d).toMatchObject({ lo: null, hi: null, first: -290, kind: "unknown" });
    expect(d!.pieces.every((p) => p.result === "기타")).toBe(true);
  });

  it("515 는 거부로 센다 — [515 −20, 접수 −10, 기타 −30] → lo −20 · hi −10 · gate · first −30", () => {
    const days = launchDaysOf([
      { trade_date: "2026-10-27", wire: 0, sent_rel_us: -20, result: "515" },
      { trade_date: "2026-10-27", wire: 1, sent_rel_us: -10, result: "접수" },
      { trade_date: "2026-10-27", wire: 2, sent_rel_us: -30, result: "기타" },
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ lo: -20, hi: -10, first: -30, kind: "gate" });
  });

  it("모르는 결과(무응답 · E127)는 기타 — 경계 계산에서 뺀다", () => {
    expect(isLaunchAccept("접수")).toBe(true);
    expect(isLaunchReject("101")).toBe(true);
    expect(isLaunchReject("515")).toBe(true);
    for (const r of ["무응답", "E127", "기타", ""]) {
      expect(isLaunchAccept(r)).toBe(false);
      expect(isLaunchReject(r)).toBe(false);
    }
    const [d] = launchDaysOf([
      { trade_date: "2026-10-27", wire: 0, sent_rel_us: -40, result: "무응답" },
      { trade_date: "2026-10-27", wire: 1, sent_rel_us: -35, result: "E127" },
    ]);
    expect(d).toMatchObject({ lo: null, hi: null, first: -40, kind: "unknown" });
  });

  it("묶음 안 조각은 wire 오름차순이고 입력 배열을 바꾸지 않는다", () => {
    const input = [...panel("KB120", "Q")].reverse();
    const before = input.map((p) => p.wire);
    const days = launchDaysOf(input);
    for (const d of days) {
      const wires = d.pieces.map((p) => p.wire);
      expect(wires).toEqual([...wires].sort((a, b) => a - b));
    }
    expect(input.map((p) => p.wire)).toEqual(before);
  });
});

describe("launchHeadOf — 백필 머리(D-04)", () => {
  /** (날짜, 서버, 시장) 묶음 = 발사 하나. */
  function fires(): Map<string, Piece[]> {
    const m = new Map<string, Piece[]>();
    for (const p of PIECES) {
      const k = `${p.trade_date}|${p.gateway}|${p.market}`;
      const list = m.get(k);
      if (list) list.push(p);
      else m.set(k, [p]);
    }
    return m;
  }

  it("발사 33개 · n_pieces 합 196 · offset_used_us = 그 발사 최소 rel(33/33) · nonmono 0건", () => {
    const groups = fires();
    expect(groups.size).toBe(33);
    let total = 0;
    let nonmono = 0;
    for (const ps of groups.values()) {
      const h = launchHeadOf(ps);
      total += h.n_pieces;
      if (h.nonmono) nonmono++;
      expect(h.offset_used_us).toBe(Math.min(...ps.map((p) => p.sent_rel_us)));
      expect(h.n_accepted + h.n_reject + h.n_other).toBe(h.n_pieces);
    }
    expect(total).toBe(196);
    expect(nonmono).toBe(0);
  });

  it("KB 코스닥 10/14 — n 5 · lo −350 · hi −342 · first_accept_idx = 접수 조각 최소 wire", () => {
    const ps = panel("KB120", "Q").filter((p) => p.trade_date === "2026-10-14");
    const h = launchHeadOf(ps);
    const accWires = ps.filter((p) => p.result === "접수").map((p) => p.wire);
    expect(h).toMatchObject({ n_pieces: 5, gate_lo_us: -350, gate_hi_us: -342, offset_used_us: -352, nonmono: false });
    expect(h.first_accept_idx).toBe(Math.min(...accWires));
  });

  it("빈 배열은 throw", () => {
    expect(() => launchHeadOf([])).toThrow();
  });
});

describe("launchPanelStatsOf — 4패널 집계", () => {
  for (const [gateway, market] of LAUNCH_ORDER) {
    const key = `${gateway}|${market}`;
    it(`${key} — 조각 ${EXPECTED_PANELS[key]!.pieces} · 집계가 정답지와 같다`, () => {
      const ps = panel(gateway, market);
      expect(ps).toHaveLength(EXPECTED_PANELS[key]!.pieces);
      expect(launchPanelStatsOf(launchDaysOf(ps))).toEqual(EXPECTED_PANELS[key]!.stats);
    });
  }

  it("빈 패널 — days 0 · 최소/최대 null", () => {
    expect(launchPanelStatsOf([])).toEqual({
      days: 0,
      n_gate: 0,
      n_all_accept: 0,
      n_all_reject: 0,
      n_unknown: 0,
      min_accept: null,
      max_reject: null,
    });
  });
});

describe("launchRibbonAt — 첨부 식(v ≥ hi → 접수 · 아니면 v ≤ lo → 거부 · 나머지 모름)", () => {
  for (const [gateway, market] of LAUNCH_ORDER) {
    const key = `${gateway}|${market}`;
    const e = EXPECTED_RIBBON[key]!;
    it(`${key} v=${e.v} → 접수 ${e.ok} · 거부 ${e.bad} · 모름 ${e.unknown}`, () => {
      expect(launchRibbonAt(launchDaysOf(panel(gateway, market)), e.v)).toEqual({
        ok: e.ok,
        bad: e.bad,
        unknown: e.unknown,
      });
    });
  }

  it("hi 를 먼저 판정한다 — lo > hi(뒤집힌 날)에서 v 가 둘 사이면 접수", () => {
    const days = launchDaysOf([
      { trade_date: "2026-10-27", wire: 0, sent_rel_us: -20, result: "접수" },
      { trade_date: "2026-10-27", wire: 1, sent_rel_us: -10, result: "101" },
    ]);
    expect(launchRibbonAt(days, -15)).toEqual({ ok: 1, bad: 0, unknown: 0 });
  });
});

describe("발사 기준 — launchFireBaseOf · launchFireOf · LAUNCH_FIRES (D-03 · D-17)", () => {
  it("launchFireBaseOf(profile, 거래소)", () => {
    expect(launchFireBaseOf("Q16", "KRX")).toBe("16:00:00");
    expect(launchFireBaseOf("A", "KRX")).toBe("09:00:27");
    expect(launchFireBaseOf("N", "NXT")).toBe("09:00:30");
    expect(launchFireBaseOf("A", "NXT")).toBe("09:00:30");
    expect(launchFireBaseOf("Q16", "NXT")).toBeNull();
    expect(launchFireBaseOf("N", "KRX")).toBeNull();
    expect(launchFireBaseOf("X", "KRX")).toBeNull();
  });

  it("launchFireOf — 지도 대상은 q16 · n0930 뿐(A 의 KRX 09:00:27 다리는 null)", () => {
    expect(launchFireOf({ fire_exchange: "KRX", fire_base: "16:00:00" })).toBe("q16");
    expect(launchFireOf({ fire_exchange: "NXT", fire_base: "09:00:30" })).toBe("n0930");
    expect(launchFireOf({ fire_exchange: "KRX", fire_base: "09:00:27" })).toBeNull();
    expect(launchFireOf({ fire_exchange: "NXT", fire_base: "16:00:00" })).toBeNull();
    // A KRX 재확인 회차(마감선 09:00:29.5 재발사)도 지도 대상이 아니다.
    expect(launchFireOf({ fire_exchange: "KRX", fire_base: "09:00:29" })).toBeNull();
  });

  // quick-261030-d7b — 주문 내역 판정. A KRX 는 본회차 09:00:27 + 재확인 회차(09:00:29 등) — 09:00:00 이상 09:00:30 미만.
  // 그 밖은 launchFireBaseOf 와 같을 때만. launchFireBaseOf("A", "KRX") 는 여전히 09:00:27(백필 기본값 — 위 단언).
  it.each([
    ["A", "KRX", "09:00:27", true],
    ["A", "KRX", "09:00:29", true],
    ["A", "KRX", "09:00:25", true],
    ["A", "KRX", "09:00:30", false],
    ["A", "KRX", "08:59:59", false],
    ["A", "KRX", "16:00:00", false],
    ["Q16", "KRX", "16:00:00", true],
    ["N", "NXT", "09:00:30", true],
    ["A", "NXT", "09:00:30", true],
    ["Q16", "KRX", "16:00:01", false],
    ["N", "NXT", "09:00:29", false],
    ["A", "NXT", "09:00:29", false],
    ["X", "KRX", "09:00:27", false],
    ["N", "KRX", "09:00:27", false],
  ] as const)("isLaunchFireBaseOf(%s, %s, %s) → %s", (profile, fireExchange, fireBase, out) => {
    expect(isLaunchFireBaseOf(profile, fireExchange, fireBase)).toBe(out);
  });

  it("LAUNCH_FIRES · LAUNCH_RANGE_DAYS", () => {
    expect(LAUNCH_FIRES).toEqual({
      q16: { fire_exchange: "KRX", fire_base: "16:00:00" },
      n0930: { fire_exchange: "NXT", fire_base: "09:00:30" },
    });
    expect(LAUNCH_RANGE_DAYS).toEqual({ "10d": 10, "20d": 20, all: null });
  });
});

describe("kind 17 · 18 은 시세 이벤트가 아니다 (D-05)", () => {
  it("isMarketStrategyEvent(17) · (18) === false — 넣으면 ws fan-out 으로 전원에게 퍼진다", () => {
    expect(isMarketStrategyEvent(17)).toBe(false);
    expect(isMarketStrategyEvent(18)).toBe(false);
  });

  it("STRATEGY_EVENT_KIND.LaunchPiece === 17 · LaunchHead === 18 (정식 인계 노트 261028) · 둘 다 시세 이벤트 아님", () => {
    expect(STRATEGY_EVENT_KIND.LaunchPiece).toBe(17);
    expect(STRATEGY_EVENT_KIND.LaunchHead).toBe(18);
    expect(isMarketStrategyEvent(STRATEGY_EVENT_KIND.LaunchPiece)).toBe(false);
    expect(isMarketStrategyEvent(STRATEGY_EVENT_KIND.LaunchHead)).toBe(false);
  });
});

describe("뒤탐침(quick-261030-dz7) — 판정 · 경계 · 머리", () => {
  type P = LaunchCalcPiece;
  const real = (d: string, wire: number, rel: number, result: string): P => ({
    trade_date: d,
    wire,
    sent_rel_us: rel,
    result,
  });
  const tail = (d: string, wire: number, rel: number, result: string, result_code: string | null = null): P => ({
    trade_date: d,
    wire,
    sent_rel_us: rel,
    result,
    probe: true,
    round: -2,
    result_code,
  });
  const front = (result: string, result_code: string | null = null): P => ({
    trade_date: "2026-10-30",
    wire: 0,
    sent_rel_us: -300,
    result,
    probe: true,
    round: -1,
    result_code,
  });

  /** 목업 4일 — 10/30 실조각 전부 101 + 뒤탐침 3발(wire 3~5). */
  const MOCK: P[] = [
    real("2026-10-27", 0, -290, "101"),
    real("2026-10-27", 1, -286, "101"),
    real("2026-10-27", 2, -270, "접수"),
    real("2026-10-28", 0, -290, "101"),
    real("2026-10-28", 1, -286, "101"),
    real("2026-10-28", 2, -280, "101"),
    real("2026-10-29", 0, -300, "101"),
    real("2026-10-29", 1, -296, "101"),
    real("2026-10-29", 2, -284, "접수"),
    real("2026-10-30", 0, -290, "101"),
    real("2026-10-30", 1, -286, "101"),
    real("2026-10-30", 2, -270, "101"),
    tail("2026-10-30", 3, -260, "101", "101"),
    tail("2026-10-30", 4, -250, "기타", "F083"),
    tail("2026-10-30", 5, -240, "접수"),
  ];

  it("isLaunchTailProbe — probe true · round −2 만", () => {
    expect(isLaunchTailProbe({ probe: true, round: -2 })).toBe(true);
    expect(isLaunchTailProbe({ probe: true, round: -1 })).toBe(false);
    expect(isLaunchTailProbe({ probe: null, round: -2 })).toBe(false);
    expect(isLaunchTailProbe({})).toBe(false);
  });

  it("launchGateSideOf(뒤탐침) — 101 · 515 거부 · 접수 · 기타(E127 아님) 열림 · 기타 E127 · 무응답 경계 밖", () => {
    expect(launchGateSideOf(tail("d", 0, 0, "101"))).toBe("closed");
    expect(launchGateSideOf(tail("d", 0, 0, "515"))).toBe("closed");
    expect(launchGateSideOf(tail("d", 0, 0, "접수"))).toBe("open");
    expect(launchGateSideOf(tail("d", 0, 0, "기타", "F083"))).toBe("open");
    expect(launchGateSideOf(tail("d", 0, 0, "기타", null))).toBe("open");
    expect(launchGateSideOf(tail("d", 0, 0, "기타", "E127"))).toBeNull();
    expect(launchGateSideOf(tail("d", 0, 0, "무응답"))).toBeNull();
  });

  it("launchGateSideOf(실조각 · 앞쪽 탐침) — 지금 규칙 그대로(기타 = 경계 밖)", () => {
    for (const p of [real("d", 0, 0, "접수"), front("접수")]) expect(launchGateSideOf(p)).toBe("open");
    for (const r of ["101", "515"]) {
      expect(launchGateSideOf(real("d", 0, 0, r))).toBe("closed");
      expect(launchGateSideOf(front(r))).toBe("closed");
    }
    expect(launchGateSideOf({ ...real("d", 0, 0, "기타"), result_code: "F083" })).toBeNull();
    expect(launchGateSideOf(front("기타", "F083"))).toBeNull();
    expect(launchGateSideOf(real("d", 0, 0, "무응답"))).toBeNull();
    expect(launchGateSideOf(real("d", 0, 0, "E127"))).toBeNull();
    expect(launchGateSideOf(front("기타", "E127"))).toBeNull();
  });

  it("launchDaysOf(목업 4일) — 10/30 = 뒤탐침이 경계를 잡는다(lo −260 · hi −250 · gate)", () => {
    const days = launchDaysOf(MOCK);
    expect(days.map((d) => [d.date.slice(5), d.pieces.length, d.lo, d.hi, d.first, d.kind])).toEqual([
      ["10-27", 3, -286, -270, -290, "gate"],
      ["10-28", 3, -280, null, -290, "all_reject"],
      ["10-29", 3, -296, -284, -300, "gate"],
      ["10-30", 6, -260, -250, -290, "gate"],
    ]);
    expect(launchPanelStatsOf(days)).toMatchObject({ n_gate: 3, n_all_accept: 0, n_all_reject: 1 });
    expect(launchRibbonAt(days, -250)).toEqual({ ok: 3, bad: 0, unknown: 1 });
  });

  it("대조 — 10/30 에서 뒤탐침을 빼면 전부 거부", () => {
    const [d] = launchDaysOf(MOCK.filter((p) => p.trade_date === "2026-10-30" && !isLaunchTailProbe(p)));
    expect(d).toMatchObject({ lo: -270, hi: null, kind: "all_reject" });
  });

  it("뒤탐침이 E127 기타 · 무응답뿐인 날 → 경계 밖(lo −290 · hi null · all_reject)", () => {
    const [d] = launchDaysOf([
      real("2026-10-31", 0, -290, "101"),
      tail("2026-10-31", 1, -280, "기타", "E127"),
      tail("2026-10-31", 2, -270, "무응답"),
    ]);
    expect(d).toMatchObject({ lo: -290, hi: null, kind: "all_reject" });
  });

  it("launchHeadOf — 실조각만 센다(뒤탐침 제외) · 뒤탐침만이면 throw · 앞쪽 탐침은 한 조각", () => {
    const day = MOCK.filter((p) => p.trade_date === "2026-10-30");
    expect(launchHeadOf(day)).toEqual({
      n_pieces: 3,
      n_accepted: 0,
      n_reject: 3,
      n_other: 0,
      first_accept_idx: null,
      gate_lo_us: -270,
      gate_hi_us: null,
      offset_used_us: -290,
      nonmono: false,
    });
    expect(() => launchHeadOf(day.filter(isLaunchTailProbe))).toThrow(/뒤탐침/);
    const withFront = [front("101"), real("2026-10-30", 1, -290, "접수")];
    expect(launchHeadOf(withFront)).toMatchObject({ n_pieces: 2, n_reject: 1, n_accepted: 1, offset_used_us: -300 });
  });
});
