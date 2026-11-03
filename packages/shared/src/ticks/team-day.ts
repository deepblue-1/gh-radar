/**
 * 팀 하루 요약 (quick 261103-j4d 결정 1) — 해제된 격자 바이트 하나 → 틱뷰어 상세 「팀 거래정보」 끝 틱 KPI 와 같은 숫자
 * (팀 체결 수 · 당일 순매수 금액 · 수량 · 13키 손익 · 마지막 체결가). 목록(`tick_grids` 저장값 · 워커)과 상세(웹)가 이 모듈의
 * 주문 초안 · 범위 함수를 한 벌로 쓴다.
 *
 * 출처: 주문 초안(`krxOrderDraftsOf` · `nxtOrderDraftsOf`)과 범위 규칙(`teamTradesOf`)은 37-13 · 37-14 webapp
 * `tick-session.ts` · `team-model.ts` 에서 옮겼다(복사 아님 — 웹은 이제 여기서 import).
 *
 * ① 범위 — KRX = `scopeTrades(toTrades(), 'accum')`(G1+G4 · (t, seq) 순) · NXT = 그 거래소 A3 전부(런 규칙 팀만 · 같은
 *   ISIN KRX 와 합산 안 함 · D-13).
 * ② 주문 초안 — KRX = `classifyKrxOrders` · NXT = A3 · B6 → `NxtRow` → `tagNxtRuns` → `nxtRunStats` · `classifyNxtTeamOrders`
 *   (팀 = 한 가격 2조각 이상 · 단일가 bs 는 「단일가」 · 팀 아님).
 * ③ 끝 틱 — 거래소순(recvOrderOf → exchangeOrderOf)으로 가장 뒤 A3 의 체결가가 lastPx · 자르기 시각 = 모든 A3 의
 *   (체결 시각 · 못 읽으면 수신 시각) 최댓값(웹 `runMaxNs[끝 A3]` 와 같은 값) → `fillsUpTo` → `pnlAt`.
 * ④ 메모리(결정 4 — 워커가 64만 레코드 격자에 쓴다) — 단계별 작은 함수로 나눠 큰 중간물(NxtRow 배열 · 초안)이 다음 단계 전에
 *   참조를 잃게 한다. 상세에만 필요한 표(밀도 · VI · 뒤집힘 · 중복 · B6/B9 표)는 만들지 않는다. recv_ns 는 BigInt 그대로.
 */
import type { TickExchange } from "../tick-api";
import { parseStr } from "./decode";
import { classifyKrxOrders, scopeTrades, type A3Trade, type OrderKind } from "./orders-krx";
import { classifyNxtTeamOrders, nxtRunStats, tagNxtRuns, type NxtRow } from "./orders-nxt";
import {
  NO_BOARD,
  TAG_CODE,
  a3ColumnsOf,
  buildTickIndex,
  exchangeOrderOf,
  recvOrderOf,
  type A3Columns,
  type TickIndex,
} from "./record-index";
import { buildPnlPrefix, fillsUpTo, pnlAt, teamFillsOf, type TeamPnl } from "./team-pnl";

/** 주문 종류 — KRX 는 teamflow 글자 그대로 · NXT 는 런 규칙의 팀/일반(단일가 bs 는 「단일가」). */
export type TickOrderKind = OrderKind | "NXT팀" | "NXT일반";

/** 주문 초안 — 조각 rec(판정 입력 순서) · 종류 · 팀. 화면용 주문(웹 ViewOrder)은 이것에 수량 · 시각 · 닫는 B6 를 더한다. */
export interface TickOrderDraft {
  recs: number[];
  bs: string;
  nPx: number;
  kind: TickOrderKind;
  team: boolean;
}

/** 팀 하루 요약 — 상세 「팀 거래정보」 끝 틱 KPI 와 같은 값. */
export interface TeamDaySummary {
  /** 끝 틱까지 반영한 팀 체결 수(= 상세 kpi.k). 0 = 팀 체결 없음. */
  fills: number;
  /** 당일 팀 순매수 금액 · 수량(매수 − 매도). */
  dayNetVal: number;
  dayNetQty: number;
  /** 평균단가법 13키(팀 체결이 없으면 null). */
  pnl: TeamPnl | null;
  /** 거래소순 마지막 A3 체결가(A3 가 없으면 null). */
  lastPx: number | null;
}

/** QuoteHeader 전문(A3 · B6)의 isin 오프셋(layouts.ts). */
const ISIN_OFF_QUOTE = 17;

/** 팀 판정 범위 입력 — KRX = accum(G1+G4 · (t, seq) 순) · NXT = 그 거래소 A3 전부(입력 순서 그대로). */
export function teamTradesOf(a3: A3Columns, ex: TickExchange): A3Trade[] {
  const all = a3.toTrades();
  return ex === "NXT" ? all : scopeTrades(all, "accum");
}

/** KRX — 이미 범위를 건 trades(`teamTradesOf(a3, 'KRX')`)로 classifyKrxOrders. */
export function krxOrderDraftsOf(scoped: readonly A3Trade[]): TickOrderDraft[] {
  const { orders } = classifyKrxOrders(scoped);
  return orders.map((o) => {
    const recs: number[] = [];
    for (let i = o.first; i <= o.last; i++) recs.push(scoped[i]!.rec);
    return { recs, bs: o.bs, nPx: o.nPx, kind: o.kind, team: o.team };
  });
}

/** NXT — A3 · B6 → NxtRow → tagNxtRuns → 런마다 주문 · classifyNxtTeamOrders 로 팀. */
export function nxtOrderDraftsOf(
  buf: Uint8Array,
  index: TickIndex,
  a3: A3Columns,
  a3Of: Int32Array,
): TickOrderDraft[] {
  const rows: NxtRow[] = [];
  for (let r = 0; r < index.n; r++) {
    if (index.ok[r] !== 1 || index.board[r] === NO_BOARD) continue;
    const t = index.tag[r];
    const base = {
      rec: r,
      seq: index.seq[r]!,
      board: index.boards[index.board[r]!] ?? "",
      recvNs: index.recvNs[r]!,
    };
    if (t === TAG_CODE.B6) {
      rows.push({ ...base, k: "B", isin: parseStr(buf, index.off[r]! + ISIN_OFF_QUOTE, 12) });
    } else if (t === TAG_CODE.A3) {
      const j = a3Of[r]!;
      if (j < 0) continue;
      const bs = a3.bs[j]!;
      const tNs = a3.tNs[j]!;
      rows.push({
        ...base,
        k: "A",
        isin: a3.isin[j]!,
        bs: bs === 32 ? "" : String.fromCharCode(bs),
        px: a3.px[j]!,
        qty: a3.qty[j]!,
        tNs: tNs === -1n ? null : tNs,
        a1: a3.a1[j]!,
        b1: a3.b1[j]!,
      });
    }
  }
  const tagged = tagNxtRuns(rows);
  const stats = nxtRunStats(tagged);
  const teamRuns = new Set(classifyNxtTeamOrders(tagged).map((o) => o.run));
  const members: number[][] = [];
  for (let i = 0; i < tagged.runOf.length; i++) {
    const run = tagged.runOf[i]!;
    if (run < 0) continue;
    (members[run] ??= []).push(tagged.sorted[i]!.rec);
  }
  return stats.map((st) => {
    const auction = st.bs !== "1" && st.bs !== "2";
    const team = !auction && teamRuns.has(st.run);
    const kind: TickOrderKind = auction ? "단일가" : team ? "NXT팀" : "NXT일반";
    return { recs: members[st.run] ?? [], bs: st.bs, nPx: st.npx, kind, team };
  });
}

/** 팀 주문 조각 rec 표식(rec → 1). 초안은 이 함수가 끝나면 참조를 잃는다. */
function teamMarksOf(
  buf: Uint8Array,
  index: TickIndex,
  a3: A3Columns,
  trades: readonly A3Trade[],
  ex: TickExchange,
): Uint8Array {
  let a3Of: Int32Array | null = null;
  if (ex === "NXT") {
    a3Of = new Int32Array(index.n).fill(-1);
    for (let j = 0; j < a3.n; j++) a3Of[a3.rec[j]!] = j;
  }
  const drafts = a3Of !== null ? nxtOrderDraftsOf(buf, index, a3, a3Of) : krxOrderDraftsOf(trades);
  const marks = new Uint8Array(index.n);
  for (const d of drafts) if (d.team) for (const r of d.recs) marks[r] = 1;
  return marks;
}

/** 끝 틱 — 거래소순 마지막 A3 열 색인 · 모든 A3 의 체결 시각(못 읽으면 수신 시각) 최댓값. */
function endTickOf(index: TickIndex, a3: A3Columns): { jLast: number; cutNs: bigint } {
  const exOrder = exchangeOrderOf(index, recvOrderOf(index));
  let lastRec = -1;
  for (let p = exOrder.length - 1; p >= 0; p--) {
    const r = exOrder[p]!;
    if (index.tag[r] === TAG_CODE.A3 && index.ok[r] === 1) {
      lastRec = r;
      break;
    }
  }
  let jLast = -1;
  let cutNs = -(2n ** 63n);
  for (let j = 0; j < a3.n; j++) {
    if (a3.rec[j] === lastRec) jLast = j;
    const t = a3.tNs[j]!;
    const tt = t === -1n ? index.recvNs[a3.rec[j]!]! : t;
    if (tt > cutNs) cutNs = tt;
  }
  return { jLast, cutNs };
}

/**
 * 해제된 격자 바이트 → 팀 하루 요약(상세 「팀 거래정보」 끝 틱 KPI 와 같은 값). A3 가 없으면 fills 0 · pnl null · lastPx null.
 */
export function teamDaySummaryOf(buf: Uint8Array, ex: TickExchange): TeamDaySummary {
  const index = buildTickIndex(buf, ex === "NXT" ? "nxt" : "krx");
  const a3 = a3ColumnsOf(buf, index);
  if (a3.n === 0) return { fills: 0, dayNetVal: 0, dayNetQty: 0, pnl: null, lastPx: null };
  const trades = teamTradesOf(a3, ex);
  const marks = teamMarksOf(buf, index, a3, trades, ex);
  const prefix = buildPnlPrefix(teamFillsOf(trades, (i) => marks[trades[i]!.rec] === 1));
  const { jLast, cutNs } = endTickOf(index, a3);
  const lastPx = a3.px[jLast]!;
  const k = fillsUpTo(prefix, cutNs);
  const { pnl } = pnlAt(prefix, k, lastPx);
  return {
    fills: k,
    dayNetVal: prefix.buyVal[k]! - prefix.sellVal[k]!,
    dayNetQty: prefix.buyQty[k]! - prefix.sellQty[k]!,
    pnl,
    lastPx,
  };
}
