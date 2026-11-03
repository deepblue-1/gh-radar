/**
 * Phase 37 (D-20) KRX 주문 묶기 · 팀 판정 — gh-trade tickana `teamflow.classify_orders` 를 한 줄씩 옮긴 순수 함수.
 *
 * 정본(2026-11-02 원문 — 어긋나면 함수 이름으로 찾는다):
 *   gh-trade server/tools/analysis/tickana/teamflow.py:37-41  KIND_* 문자열
 *   gh-trade server/tools/analysis/tickana/teamflow.py:68-86  load_day_parquet — teamflow 범위(KRX G1 · isin, msg_seq 순)
 *   gh-trade server/tools/analysis/tickana/teamflow.py:96-134 classify_orders
 *   gh-trade server/tools/analysis/tickana/teamflow.py:242-258 prepare_frame — zz = ask1 == 0 ∧ bid1 == 0
 *   gh-trade server/tools/analysis/tickana/teamflow_accum.py:282-300 load_day_a3 — accum 범위(KRX G1+G4 · isin, 체결 시각, msg_seq 순)
 *   gh-trade docs/analysis/krx-a3-zero-quote.md §2 주문 묶기 · §3 모양 A/B/C/C0/D/E · §4 팀 = A ∪ B ∪ C0
 *
 * 같은 주문 = 직전 행과 msg_seq 차가 정확히 1 ∧ 같은 bs ∧ 같은 isin. 시간 창은 없다 — KRX 는 종목마다 A3 · B6 가 순번 하나를
 * 나눠 쓰고 주문마다 B6 를 하나 내므로 A3 순번의 빈칸이 곧 주문 경계다.
 *
 * **입력 순서 계약: classifyKrxOrders 는 정렬하지 않는다.** 입력은 언제나 `scopeTrades` 가 만든 순서다 — teamflow 는 한 보드
 * 세션의 msg_seq 순, accum 은 (체결 시각, msg_seq) 순(G1 → G4 세션 번호 재시작은 seq 불연속이라 자동 경계). 화면의
 * 거래소순 · 수신순 순열 위에서 묶으면 파이썬과 갈린다(RESEARCH Anti-Patterns).
 *
 * 중복 수신 전문은 제거하지 않는다(teamflow.py:69-70 「중복 제거는 하지 않는다」 · Pitfall 12) — 골든 호환.
 */
import { numOf as num, strOf as str, type FieldValue } from "./decode";

/** 계산 범위 — teamflow = KRX G1(§5-1 손익 골든) · accum = KRX G1+G4(매집감지 · 뷰어 기본). */
export type TeamScope = "teamflow" | "accum";

/** A3 체결 한 건 — 판정 · 손익에 필요한 열만. `rec` = 원본 레코드 색인(화면 연결용). */
export interface A3Trade {
  rec: number;
  seq: number;
  board: string;
  bs: string;
  px: number;
  qty: number;
  a1: number;
  b1: number;
  tNs: bigint | null;
  isin: string;
  exchange: "KRX" | "NXT";
}

/** decodeFields(A3) 결과 행 → A3Trade. 열: msg_seq · board_id · final_bs_code · trade_price · trade_qty · ask1_px · bid1_px · trade_time_ns · isin · exchange. */
export function a3TradeOf(rec: number, row: Readonly<Record<string, FieldValue>>): A3Trade {
  const t = row["trade_time_ns"];
  return {
    rec,
    seq: num(row["msg_seq"]),
    board: str(row["board_id"]),
    bs: str(row["final_bs_code"]),
    px: num(row["trade_price"]),
    qty: num(row["trade_qty"]),
    a1: num(row["ask1_px"]),
    b1: num(row["bid1_px"]),
    tNs: typeof t === "bigint" ? t : null,
    isin: str(row["isin"]),
    exchange: str(row["exchange"]) === "NXT" ? "NXT" : "KRX",
  };
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 체결 시각 오름차순 · null 맨 뒤(duckdb NULLS LAST · pandas na_position='last'). */
export function cmpTimeNullsLast(a: bigint | null, b: bigint | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 범위 고르기 + 파이썬과 같은 순서(안정 정렬). NXT 는 이 함수가 아니라 `orders-nxt` 를 쓴다.
 * - teamflow: `exchange='KRX' ∧ board_id='G1'` · `order by isin, msg_seq`
 * - accum:    `exchange='KRX' ∧ board_id ∈ {G1, G4}` · `order by isin, trade_time_ns(NULLS LAST), msg_seq`
 */
export function scopeTrades(trades: readonly A3Trade[], scope: TeamScope): A3Trade[] {
  if (scope === "teamflow") {
    return trades
      .filter((t) => t.exchange === "KRX" && t.board === "G1")
      .sort((x, y) => cmpStr(x.isin, y.isin) || x.seq - y.seq);
  }
  return trades
    .filter((t) => t.exchange === "KRX" && (t.board === "G1" || t.board === "G4"))
    .sort((x, y) => cmpStr(x.isin, y.isin) || cmpTimeNullsLast(x.tNs, y.tNs) || x.seq - y.seq);
}

/** 주문 종류 — teamflow.py KIND_* 와 같은 글자. */
export const ORDER_KIND = {
  AUCTION: "단일가",
  SMP: "자전거래방지",
  ZZ_ALONE: "0/0 단독",
  ZZ_SWEEP_END: "0/0 스윕 끝",
  NORMAL: "일반",
} as const;
export type OrderKind = (typeof ORDER_KIND)[keyof typeof ORDER_KIND];

/** 주문 하나. first · last = 입력 배열 색인(양끝 포함). */
export interface KrxOrder {
  oid: number;
  first: number;
  last: number;
  pieces: number;
  nPx: number;
  maxSame: number;
  kind: OrderKind;
  team: boolean;
  bs: string;
  qty: number;
  val: number;
  firstSeq: number;
  lastSeq: number;
}

function kindOf(firstBs: string, maxSame: number, pieces: number, nPx: number, lastZz: boolean): OrderKind {
  // np.select 순서 그대로 — 앞 조건이 이긴다
  if (firstBs !== "1" && firstBs !== "2") return ORDER_KIND.AUCTION;
  if (maxSame >= 2) return ORDER_KIND.SMP;
  if (pieces === 1 && lastZz) return ORDER_KIND.ZZ_ALONE;
  if (nPx >= 2 && lastZz) return ORDER_KIND.ZZ_SWEEP_END;
  return ORDER_KIND.NORMAL;
}

/** 팀 = 자전거래방지 ∪ 0/0 단독 ∪ 0/0 스윕 끝(krx-a3-zero-quote.md §4). */
export function isTeamKind(kind: OrderKind): boolean {
  return kind === ORDER_KIND.SMP || kind === ORDER_KIND.ZZ_ALONE || kind === ORDER_KIND.ZZ_SWEEP_END;
}

/**
 * 체결 조각 → 주문 · 종류 · 팀. 입력 순서 그대로 본다(정렬하지 않는다). `oidOf[i]` = 입력 i 번째 조각의 주문 번호.
 */
export function classifyKrxOrders(trades: readonly A3Trade[]): { orders: KrxOrder[]; oidOf: Int32Array } {
  const n = trades.length;
  const oidOf = new Int32Array(n);
  const orders: KrxOrder[] = [];
  let i = 0;
  while (i < n) {
    const start = i;
    let j = i + 1;
    while (j < n) {
      const p = trades[j - 1]!;
      const c = trades[j]!;
      if (!(c.seq - p.seq === 1 && c.bs === p.bs && c.isin === p.isin)) break;
      j += 1;
    }
    const oid = orders.length;
    const perPx = new Map<number, number>();
    let qty = 0;
    let val = 0;
    let maxSame = 0;
    for (let k = start; k < j; k++) {
      const t = trades[k]!;
      oidOf[k] = oid;
      const c = (perPx.get(t.px) ?? 0) + 1;
      perPx.set(t.px, c);
      if (c > maxSame) maxSame = c;
      qty += t.qty;
      val += t.qty * t.px;
    }
    const first = trades[start]!;
    const last = trades[j - 1]!;
    const pieces = j - start;
    const nPx = perPx.size;
    const lastZz = last.a1 === 0 && last.b1 === 0;
    const kind = kindOf(first.bs, maxSame, pieces, nPx, lastZz);
    orders.push({
      oid,
      first: start,
      last: j - 1,
      pieces,
      nPx,
      maxSame,
      kind,
      team: isTeamKind(kind),
      bs: first.bs,
      qty,
      val,
      firstSeq: first.seq,
      lastSeq: last.seq,
    });
    i = j;
  }
  return { orders, oidOf };
}
