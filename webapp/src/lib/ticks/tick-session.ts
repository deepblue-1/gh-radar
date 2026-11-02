/**
 * TickSession — 격자 바이트 하나(해제된 레코드 프레이밍)를 뷰어가 쓰는 표 묶음으로 한 번에 만든다 (Phase 37 D-00 · D-13 · D-18 · D-20).
 *
 * ① 전부 `@gh-radar/shared` 뷰어 모델(37-03 · 37-05) 호출뿐인 순수 함수다 — Web Worker 로 그대로 옮길 수 있다(RESEARCH A10).
 * ② 표 — 레코드 인덱스(머리만) · 수신순/거래소순 순열과 그 역(rec → 자리) · A3 열 배열(+ rec → A3 열 색인) ·
 *   마지막 B6 표(**거래소순 자리** → B6 rec) · 마지막 B9 표(**수신순 자리** → B9 rec) · 5분 밀도 144칸 · VI 구간.
 * ③ 지연 디코딩(RESEARCH Pattern 2) — B6 · B9 · R8 본문은 여기서 풀지 않는다(VI 만 R8 을 한 번 훑는다). 호가 10단은
 *   커서가 고른 B6 하나만 `bookAt` 으로 그때 푼다.
 * ④ 주문 판정(37-13 · D-20 · D-13) — shared 오라클 일치 함수 그대로. **묶기는 표시 순열과 별개 입력 순서로 한다**(Anti-Patterns):
 *   - KRX = `a3.toTrades()` → `scopeTrades(…, "accum")`(G1+G4 · (t, seq) 순 · 뷰어 기본) → `classifyKrxOrders`.
 *   - NXT = A3 · B6 → `NxtRow` → `tagNxtRuns`(G1 · seq 순) → `nxtRunStats` · `classifyNxtTeamOrders`(팀 = 한 가격 2조각 이상).
 *   공통 출력은 `ViewOrder` — 조각 rec(입력 순서) · 닫는 B6(같은 보드 seq = 마지막 + 1 · 거래소순 첫 것) · 종류 · 팀 ·
 *   진행 중(스트림 끝에서 아직 닫히지 않은 주문 · Pitfall 9).
 * ⑤ 뒤집힘 = `inversionsOf`(1조각 런 포함) · 중복 = 같은 보드 · seq 의 두 번째 이후 수신(판정에서 빼지 않는다 · Pitfall 12).
 * recv_ns 는 BigInt64Array 그대로다(Number 금지).
 * ⑥ 당일 증분(37-19 · D-18 · Pitfall 9) — `appendTickBytes` 가 새 zstd 바이트를 풀어 이전 원시 버퍼 뒤에 잇고 **세션을 처음부터
 *   다시 만든다**(순열 · 판정 · 팀 모델 전부). 스트림 끝에서 열려 있던 주문은 다음 조각 · 닫는 B6 가 오면 다시 분류돼야 하므로
 *   부분 갱신을 하지 않는다. 레코드 색인은 버퍼 순서라 이어붙여도 앞 레코드의 rec 는 그대로다(커서가 같은 틱에 남는다).
 *   소요 ms 는 `rebuildMs`(해제 + 재생성 · 37-17 UAT 가 읽는다).
 */

import { decompress } from 'fzstd';

import {
  DayRateTracker,
  concatBytes,
  NO_BOARD,
  TAG_CODE,
  a3ColumnsOf,
  buildTickIndex,
  classifyKrxOrders,
  classifyNxtTeamOrders,
  dayStartNs,
  densityOf,
  exchangeOrderOf,
  inversePerm,
  inversionsOf,
  lastB6Of,
  lastB9Of,
  nxtRunStats,
  parseStr,
  recvOrderOf,
  scopeTrades,
  tagNxtRuns,
  viSpansOf,
  type A3Columns,
  type Inversion,
  type NxtRow,
  type OrderKind,
  type TeamScope,
  type TickExchange,
  type TickIndex,
  type ViSpan,
} from '@gh-radar/shared';

import { buildTeamModel, type TeamModel } from './team-model';

/** 판정 범위 — KRX 는 `accum`(G1+G4 · 뷰어 기본) · NXT 는 런 규칙. */
export type ViewScope = TeamScope | 'nxt';

/** 주문 종류 — KRX 는 teamflow 글자 그대로 · NXT 는 런 규칙의 팀/일반(단일가 bs 는 「단일가」). */
export type ViewOrderKind = OrderKind | 'NXT팀' | 'NXT일반';

/** 화면용 주문 하나(KRX 주문 · NXT 런 공통). */
export interface ViewOrder {
  id: number;
  /** 조각 rec — 판정 입력 순서(KRX = 범위 순 · NXT = seq 순). */
  recs: number[];
  /** 닫는 B6 rec — 같은 보드 seq = 마지막 조각 seq + 1 인 B6(거래소순 첫 것). 없으면 null. */
  closingB6Rec: number | null;
  /** final_bs_code 한 글자('1' 매도 · '2' 매수 · 그 밖 단일가). */
  bs: string;
  pieces: number;
  /** 가격 단 수. */
  nPx: number;
  qty: number;
  val: number;
  /** 첫 · 마지막 조각 시각(epoch ns) — 체결 시각, 못 읽으면 수신 시각. */
  firstNs: bigint;
  lastNs: bigint;
  firstSeq: number;
  lastSeq: number;
  kind: ViewOrderKind;
  team: boolean;
  /** 스트림 끝에서 아직 열린 주문(마지막 조각 다음 seq 가 아직 없음) — 분류가 잠정이다(Pitfall 9). */
  open: boolean;
}

export interface TickSession {
  /** `${date}|${ex}|${isin}` — 격자 캐시 키와 같다. */
  key: string;
  /** `YYYYMMDD`(KST). */
  date: string;
  ex: TickExchange;
  buf: Uint8Array;
  index: TickIndex;
  /** 수신순 자리 → rec. */
  recvOrder: Int32Array;
  /** 거래소순 자리 → rec. */
  exOrder: Int32Array;
  /** rec → 수신순 자리. */
  recvPos: Int32Array;
  /** rec → 거래소순 자리. */
  exPos: Int32Array;
  a3: A3Columns;
  /** rec → A3 열 색인(A3 ∧ ok 가 아니면 -1). */
  a3Of: Int32Array;
  /** 거래소순 자리 → 같은 보드 마지막 B6 rec(없으면 -1). */
  lastB6: Int32Array;
  /** 수신순 자리 → 마지막 B9 rec(없으면 -1). */
  lastB9: Int32Array;
  /** 08:00~20:00 5분 거래대금 144칸(수신 시각 기준). */
  density: Float64Array;
  vi: ViSpan[];
  /** 그날 08:00 KST epoch ns — 슬라이더 시작. */
  dayStartNs: bigint;

  // ── 37-13 주문 판정 · 뒤집힘 · 중복 ──
  scope: ViewScope;
  /** 주문 — id = 배열 색인 · 판정 입력 순서. */
  orders: ViewOrder[];
  /** rec → 주문 id(조각 · 닫는 B6) · 그 밖 -1. */
  orderOfRec: Int32Array;
  /** rec → 1 이면 팀 주문의 조각 · 닫는 B6. */
  teamOfRec: Uint8Array;
  /** 스트림 끝 열린 주문 id(가장 늦게 끝나는 것) · 없으면 -1. */
  openOrder: number;
  /** 닫는 B6 가 런 조각보다 먼저 수신된 경우(거래소순 자리 오름차순 · 1조각 런 포함). */
  inversions: Inversion[];
  /** 닫는 B6 rec → 뒤집힘. */
  inversionOfB6: Map<number, Inversion>;
  /** rec → 1 이면 같은 보드 · seq 의 두 번째 이후 수신(중복). */
  duplicates: Uint8Array;
  /** 주문 id → 마지막 조각의 거래소순 자리. */
  orderEndPos: Int32Array;
  /** orderEndPos 오름차순 주문 id. */
  ordersByEnd: Int32Array;
  /** 거래소순 자리 → 그 자리 이하 마지막 A3 열 색인(없으면 -1). */
  lastA3: Int32Array;
  /** 기준가(체결 `px − 부호×chg` 최빈값 · DayRateTracker) — 없으면 null. */
  basePx: number | null;

  // ── 37-14 팀 모델(차트 팀 레이어 · 팀 거래정보 KPI) ──
  /** 팀 체결 · 손익 접두 · 당일 계단 · 10분 막대 · 주문 원 — 세션 생성 때 한 번(`buildTeamModel`). */
  team: TeamModel;

  // ── 37-19 당일 증분 ──
  /** `appendTickBytes` 가 만든 세션의 해제 + 재생성 소요(ms) · 격자(`buildTickSession` 직접)는 null. */
  rebuildMs: number | null;
}

export function tickSessionKeyOf(date: string, ex: TickExchange, isin: string): string {
  return `${date}|${ex}|${isin}`;
}

/** (보드, seq) 키 — 보드 < 255 · seq < 1e8 이라 double 로 정확하다. */
function bsKey(board: number, seq: number): number {
  return board * 1e8 + seq;
}

/** A3 열 j 의 시각 — 체결 시각(못 읽으면 수신 시각). */
function a3TimeNs(index: TickIndex, a3: A3Columns, j: number): bigint {
  const t = a3.tNs[j]!;
  return t === -1n ? index.recvNs[a3.rec[j]!]! : t;
}

/** QuoteHeader 전문(A3 · B6)의 isin 오프셋(layouts.ts). */
const ISIN_OFF_QUOTE = 17;

interface OrderDraft {
  recs: number[];
  bs: string;
  nPx: number;
  kind: ViewOrderKind;
  team: boolean;
}

function buildOrders(
  index: TickIndex,
  a3: A3Columns,
  a3Of: Int32Array,
  exOrder: Int32Array,
  drafts: OrderDraft[],
): Pick<TickSession, 'orders' | 'orderOfRec' | 'teamOfRec' | 'openOrder'> {
  const n = index.n;
  // 닫는 B6 — (보드, seq) → 거래소순 첫 B6 rec · 보드별 최대 seq(진행 중 판정)
  const b6First = new Map<number, number>();
  const maxSeq = new Float64Array(Math.max(1, index.boards.length)).fill(-1);
  for (let p = 0; p < exOrder.length; p++) {
    const r = exOrder[p]!;
    const b = index.board[r]!;
    if (b === NO_BOARD) continue;
    const s = index.seq[r]!;
    if (s > maxSeq[b]!) maxSeq[b] = s;
    if (index.tag[r] === TAG_CODE.B6) {
      const k = bsKey(b, s);
      if (!b6First.has(k)) b6First.set(k, r);
    }
  }
  const orderOfRec = new Int32Array(n).fill(-1);
  const teamOfRec = new Uint8Array(n);
  const orders: ViewOrder[] = [];
  let openOrder = -1;
  let openEnd = -1n;
  for (const d of drafts) {
    if (d.recs.length === 0) continue;
    const id = orders.length;
    let qty = 0;
    let val = 0;
    let firstSeq = Number.POSITIVE_INFINITY;
    let lastSeq = -1;
    let lastRec = d.recs[0]!;
    for (const r of d.recs) {
      const j = a3Of[r]!;
      qty += a3.qty[j]!;
      val += a3.qty[j]! * a3.px[j]!;
      const s = index.seq[r]!;
      if (s < firstSeq) firstSeq = s;
      if (s > lastSeq) {
        lastSeq = s;
        lastRec = r;
      }
      orderOfRec[r] = id;
      if (d.team) teamOfRec[r] = 1;
    }
    const board = index.board[lastRec]!;
    const closingB6Rec = board === NO_BOARD ? null : (b6First.get(bsKey(board, lastSeq + 1)) ?? null);
    if (closingB6Rec !== null) {
      orderOfRec[closingB6Rec] = id;
      if (d.team) teamOfRec[closingB6Rec] = 1;
    }
    const open = closingB6Rec === null && board !== NO_BOARD && maxSeq[board]! <= lastSeq;
    const firstNs = a3TimeNs(index, a3, a3Of[d.recs[0]!]!);
    const lastNs = a3TimeNs(index, a3, a3Of[d.recs[d.recs.length - 1]!]!);
    if (open && lastNs >= openEnd) {
      openOrder = id;
      openEnd = lastNs;
    }
    orders.push({
      id,
      recs: d.recs,
      closingB6Rec,
      bs: d.bs,
      pieces: d.recs.length,
      nPx: d.nPx,
      qty,
      val,
      firstNs,
      lastNs,
      firstSeq,
      lastSeq,
      kind: d.kind,
      team: d.team,
      open,
    });
  }
  return { orders, orderOfRec, teamOfRec, openOrder };
}

/** KRX — accum 범위(G1+G4 · (t, seq) 순)로 classifyKrxOrders. */
function krxDrafts(a3: A3Columns): OrderDraft[] {
  const scoped = scopeTrades(a3.toTrades(), 'accum');
  const { orders } = classifyKrxOrders(scoped);
  return orders.map((o) => {
    const recs: number[] = [];
    for (let i = o.first; i <= o.last; i++) recs.push(scoped[i]!.rec);
    return { recs, bs: o.bs, nPx: o.nPx, kind: o.kind, team: o.team };
  });
}

/** NXT — A3 · B6 → NxtRow → tagNxtRuns → 런마다 주문 · classifyNxtTeamOrders 로 팀. */
function nxtDrafts(buf: Uint8Array, index: TickIndex, a3: A3Columns, a3Of: Int32Array): OrderDraft[] {
  const rows: NxtRow[] = [];
  for (let r = 0; r < index.n; r++) {
    if (index.ok[r] !== 1 || index.board[r] === NO_BOARD) continue;
    const t = index.tag[r];
    const base = {
      rec: r,
      seq: index.seq[r]!,
      board: index.boards[index.board[r]!] ?? '',
      recvNs: index.recvNs[r]!,
    };
    if (t === TAG_CODE.B6) {
      rows.push({ ...base, k: 'B', isin: parseStr(buf, index.off[r]! + ISIN_OFF_QUOTE, 12) });
    } else if (t === TAG_CODE.A3) {
      const j = a3Of[r]!;
      if (j < 0) continue;
      const bs = a3.bs[j]!;
      const tNs = a3.tNs[j]!;
      rows.push({
        ...base,
        k: 'A',
        isin: a3.isin[j]!,
        bs: bs === 32 ? '' : String.fromCharCode(bs),
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
    const auction = st.bs !== '1' && st.bs !== '2';
    const team = !auction && teamRuns.has(st.run);
    const kind: ViewOrderKind = auction ? '단일가' : team ? 'NXT팀' : 'NXT일반';
    return { recs: members[st.run] ?? [], bs: st.bs, nPx: st.npx, kind, team };
  });
}

/** 같은 보드 · seq 의 두 번째 이후 수신 = 1. */
function duplicatesOf(index: TickIndex, recvOrder: Int32Array): Uint8Array {
  const out = new Uint8Array(index.n);
  const seen = new Set<number>();
  for (let p = 0; p < recvOrder.length; p++) {
    const r = recvOrder[p]!;
    const b = index.board[r]!;
    if (b === NO_BOARD || index.seq[r]! < 0) continue;
    const k = bsKey(b, index.seq[r]!);
    if (seen.has(k)) out[r] = 1;
    else seen.add(k);
  }
  return out;
}

export function buildTickSession(
  buf: Uint8Array,
  { date, ex, isin = '' }: { date: string; ex: TickExchange; isin?: string },
): TickSession {
  const index = buildTickIndex(buf, ex === 'NXT' ? 'nxt' : 'krx');
  const recvOrder = recvOrderOf(index);
  const exOrder = exchangeOrderOf(index, recvOrder);
  const exPos = inversePerm(exOrder);
  const a3 = a3ColumnsOf(buf, index);
  const a3Of = new Int32Array(index.n).fill(-1);
  for (let j = 0; j < a3.n; j++) a3Of[a3.rec[j]!] = j;

  const scope: ViewScope = ex === 'NXT' ? 'nxt' : 'accum';
  const drafts = ex === 'NXT' ? nxtDrafts(buf, index, a3, a3Of) : krxDrafts(a3);
  const judged = buildOrders(index, a3, a3Of, exOrder, drafts);

  const inversions = inversionsOf(index, a3, exOrder);
  const inversionOfB6 = new Map<number, Inversion>();
  for (const inv of inversions) inversionOfB6.set(inv.b6Rec, inv);

  const orderEndPos = new Int32Array(judged.orders.length);
  for (const o of judged.orders) {
    let end = -1;
    for (const r of o.recs) if (exPos[r]! > end) end = exPos[r]!;
    orderEndPos[o.id] = end;
  }
  const ordersByEnd = Int32Array.from(judged.orders, (o) => o.id).sort(
    (x, y) => orderEndPos[x]! - orderEndPos[y]! || x - y,
  );

  const lastA3 = new Int32Array(index.n);
  let cur = -1;
  for (let p = 0; p < exOrder.length; p++) {
    const j = a3Of[exOrder[p]!]!;
    if (j >= 0) cur = j;
    lastA3[p] = cur;
  }

  const tracker = new DayRateTracker();
  for (let j = 0; j < a3.n; j++) {
    const pct = a3.pct[j]!;
    tracker.add(pct === 32 ? '' : String.fromCharCode(pct), a3.chg[j]!, a3.px[j]!);
  }

  const session: Omit<TickSession, 'team'> & { team?: TeamModel } = {
    key: tickSessionKeyOf(date, ex, isin),
    date,
    ex,
    buf,
    index,
    recvOrder,
    exOrder,
    recvPos: inversePerm(recvOrder),
    exPos,
    a3,
    a3Of,
    lastB6: lastB6Of(index, exOrder),
    lastB9: lastB9Of(index, recvOrder),
    density: densityOf(a3, index, date),
    vi: viSpansOf(buf, index),
    dayStartNs: dayStartNs(date, '0800'),
    scope,
    ...judged,
    inversions,
    inversionOfB6,
    duplicates: duplicatesOf(index, recvOrder),
    orderEndPos,
    ordersByEnd,
    lastA3,
    basePx: a3.n > 0 ? tracker.base() : null,
    rebuildMs: null,
  };
  // 팀 모델은 위 표(주문 판정 · 거래소순 끝 자리 · 마지막 A3)를 읽는다 — 세션을 먼저 만들고 붙인다.
  session.team = buildTeamModel(session as TickSession);
  return session as TickSession;
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 당일 증분 이어붙이기(머리 주석 ⑥) — `zstdBytes`(이어붙인 zstd 프레임 · fzstd 가 모두 푼다)를 풀어 `prev.buf` 뒤에 잇고
 * `buildTickSession` 으로 전체를 다시 만든다. 빈 바이트면 `prev` 를 그대로 돌려준다(`prev` 도 없으면 빈 세션).
 */
export function appendTickBytes(
  prev: TickSession | null,
  zstdBytes: Uint8Array,
  meta: { date: string; ex: TickExchange; isin?: string },
): TickSession {
  if (zstdBytes.length === 0 && prev !== null) return prev;
  const t0 = nowMs();
  const raw = zstdBytes.length === 0 ? new Uint8Array(0) : decompress(zstdBytes);
  if (raw.length === 0 && prev !== null) return prev;
  const buf = prev === null ? raw : concatBytes([prev.buf, raw]);
  const session = buildTickSession(buf, meta);
  session.rebuildMs = nowMs() - t0;
  return session;
}

/**
 * 거래소순으로 rec 이하에서 끝난 최근 주문 k 개(최신 먼저). rec 가 주문 안인데 그 주문이 아직 끝나지 않았으면(끝 자리가 rec
 * 뒤) 그 주문을 맨 앞에 둔다.
 */
export function recentOrdersOf(session: TickSession, rec: number, k = 10): ViewOrder[] {
  if (rec < 0 || session.orders.length === 0) return [];
  const pos = session.exPos[rec]!;
  const by = session.ordersByEnd;
  // upper bound — orderEndPos ≤ pos 인 마지막 색인 + 1
  let lo = 0;
  let hi = by.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (session.orderEndPos[by[mid]!]! <= pos) lo = mid + 1;
    else hi = mid;
  }
  const out: ViewOrder[] = [];
  const cur = session.orderOfRec[rec]!;
  if (cur >= 0 && session.orderEndPos[cur]! > pos) out.push(session.orders[cur]!);
  for (let i = lo - 1; i >= 0 && out.length < k; i--) out.push(session.orders[by[i]!]!);
  return out;
}
