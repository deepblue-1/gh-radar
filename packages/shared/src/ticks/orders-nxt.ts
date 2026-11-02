/**
 * Phase 37 (D-13) NXT 런 판정 — 뼈대(RED). 구현은 GREEN 커밋.
 */
import type { FieldValue } from "./decode";

export interface NxtRow {
  rec: number;
  k: "A" | "B";
  seq: number;
  board: string;
  isin: string;
  recvNs: bigint;
  bs?: string;
  px?: number;
  qty?: number;
  tNs?: bigint | null;
  a1?: number;
  b1?: number;
}

export function nxtRowOf(_rec: number, _table: string, _row: Readonly<Record<string, FieldValue>>): NxtRow | null {
  return null;
}

export interface NxtTagged {
  sorted: NxtRow[];
  runOf: Int32Array;
}

export function tagNxtRuns(_rows: readonly NxtRow[]): NxtTagged {
  return { sorted: [], runOf: new Int32Array(0) };
}

export interface NxtRunStat {
  run: number;
  isin: string;
  n: number;
  bs: string;
  nbs: number;
  npx: number;
  maxSame: number;
  multiPx: number;
  zz: number;
  firstSeq: number;
  lastSeq: number;
  lastPx: number;
  closingB6Ok: boolean;
  closingB6RecvNs: bigint | null;
  latePieces: number;
  allLate: boolean;
}

export function nxtRunStats(_tagged: NxtTagged): NxtRunStat[] {
  return [];
}

export interface NxtSummary {
  label: string;
  isins: number;
  a3: number;
  b6: number;
  runsGe2: number;
  smp: number;
  closingOk: number;
  runs: number;
  inverted: number;
  invertedOf: number;
  allLate: number;
}

export function nxtSummaryOf(label: string, _tagged: NxtTagged, _stats: readonly NxtRunStat[]): NxtSummary {
  return { label, isins: 0, a3: 0, b6: 0, runsGe2: 0, smp: 0, closingOk: 0, runs: 0, inverted: 0, invertedOf: 0, allLate: 0 };
}

export interface NxtTeamOrder {
  run: number;
  tNs: bigint | null;
  side: "1" | "2";
  qty: number;
  krw: number;
  px: number;
  maxSame: number;
  pieces: number;
  nPx: number;
  firstSeq: number;
  lastSeq: number;
  recs: number[];
}

export function classifyNxtTeamOrders(_tagged: NxtTagged): NxtTeamOrder[] {
  return [];
}
