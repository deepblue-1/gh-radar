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

import { launchDaysOf, launchHeadOf, LAUNCH_ORDER, type LaunchCalcPiece, type LaunchDayKind } from "../launch";

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

describe("launchDaysOf — 첨부 group() 이식", () => {
  it("KB 코스닥 10일 — 날짜별 (date, 조각, lo, hi, first, 분류)", () => {
    expect(tuplesOf(panel("KB120", "Q"))).toEqual<DayTuple[]>([
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
    ]);
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
