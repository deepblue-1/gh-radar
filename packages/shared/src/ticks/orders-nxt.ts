/**
 * Phase 37 (D-13 · D-20) NXT 런 판정 — gh-trade tickana `nxt_runs` · `nxt_fixture` 를 한 줄씩 옮긴 순수 함수.
 *
 * 정본(2026-11-02 원문 — 어긋나면 함수 이름으로 찾는다):
 *   gh-trade server/tools/analysis/tickana/nxt_runs.py:1-42   머리 주석 — 런 정의(D-01) · 닫는 B6(D-02) · 도착 역전
 *   gh-trade server/tools/analysis/tickana/nxt_runs.py:44-62  load_g1 — G1 만 · A3 뒤에 B6 를 이어 (isin, msg_seq) 안정 정렬
 *   gh-trade server/tools/analysis/tickana/nxt_runs.py:63-76  tag_runs
 *   gh-trade server/tools/analysis/tickana/nxt_runs.py:79-127 run_stats
 *   gh-trade server/tools/analysis/tickana/nxt_runs.py:172-182 summary_line
 *   gh-trade server/tools/analysis/tickana/nxt_fixture.py:94-134 TeamOrder · classify_nxt_team_orders(D-04 · D-05)
 *   gh-trade docs/features/accum-signal.md 「NXT 런」 D-01 · D-02 · D-04
 *
 * 런(D-01): 이번 A3 의 msg_seq == 같은 종목 직전 A3(B6 건너뜀)의 msg_seq + 1 ∧ 같은 final_bs_code → 같은 런, 아니면 새 런.
 * B6 는 런을 닫지 않는다(A3 · B6 는 다른 멀티캐스트 그룹이라 닫는 B6 가 먼저 오기도 한다) — 그래서 수신순이 아니라 seq 순으로 묶는다.
 * 닫는 B6(D-02) = (isin, 런 마지막 seq + 1) 인 B6. 늦은 조각 = 닫는 B6 recv 보다 늦게 도착한 런 A3.
 * 팀(D-04): bs ∈ {'1','2'} ∧ 런 안 한 가격 2조각 이상(SMP 모양)만. NXT 에는 KRX 의 「0/0 단독 · 스윕 끝」 대응물이 없다.
 * 단일가 bs(그 밖의 값)는 버린다(D-05). 같은 ISIN 의 KRX 와 합산하지 않는다 — 뷰어는 거래소 하나(D-13).
 */
import type { FieldValue } from "./decode";

/** NXT 판정 입력 한 행 — A3(k='A') 또는 B6(k='B'). B6 는 체결 열이 없다. `rec` = 원본 레코드 색인. */
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

function num(v: FieldValue | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return Number.NaN;
}

function str(v: FieldValue | undefined): string {
  return typeof v === "string" ? v : "";
}

/** decodeAny 결과(표, 행) → NxtRow. A3 · B6 가 아니면 null. */
export function nxtRowOf(rec: number, table: string, row: Readonly<Record<string, FieldValue>>): NxtRow | null {
  if (table !== "a3" && table !== "b6") return null;
  const recv = row["recv_ns"];
  const base = {
    rec,
    seq: num(row["msg_seq"]),
    board: str(row["board_id"]),
    isin: str(row["isin"]),
    recvNs: typeof recv === "bigint" ? recv : BigInt(num(recv)),
  };
  if (table === "b6") return { ...base, k: "B" };
  const t = row["trade_time_ns"];
  return {
    ...base,
    k: "A",
    bs: str(row["final_bs_code"]),
    px: num(row["trade_price"]),
    qty: num(row["trade_qty"]),
    tNs: typeof t === "bigint" ? t : null,
    a1: num(row["ask1_px"]),
    b1: num(row["bid1_px"]),
  };
}

/** tagNxtRuns 결과 — sorted = G1 만 (isin, msg_seq) 순 · runOf[i] = sorted[i] 의 런 번호(0부터, B6 는 -1). */
export interface NxtTagged {
  sorted: NxtRow[];
  runOf: Int32Array;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * G1 만 남겨 (isin, msg_seq) 안정 정렬 후 런 번호를 붙인다. 파이썬 load_g1 은 A3 표 뒤에 B6 표를 이어 붙인 뒤 안정 정렬하므로
 * 같은 (isin, seq) 이면 A3 가 앞, 같은 종류끼리는 입력 순서를 지킨다 — 여기서도 같은 키로 정렬한다.
 */
export function tagNxtRuns(rows: readonly NxtRow[]): NxtTagged {
  const idx: number[] = [];
  for (let i = 0; i < rows.length; i++) if (rows[i]!.board === "G1") idx.push(i);
  idx.sort((x, y) => {
    const a = rows[x]!;
    const b = rows[y]!;
    return cmpStr(a.isin, b.isin) || a.seq - b.seq || (a.k === b.k ? 0 : a.k === "A" ? -1 : 1) || x - y;
  });
  const sorted = idx.map((i) => rows[i]!);
  const runOf = new Int32Array(sorted.length).fill(-1);
  let run = -1;
  let prev: NxtRow | null = null; // 같은 종목 직전 A3(B6 건너뜀)
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]!;
    if (r.k !== "A") continue;
    if (prev !== null && prev.isin !== r.isin) prev = null;
    const same = prev !== null && r.seq === prev.seq + 1 && r.bs === prev.bs;
    if (!same) run += 1;
    runOf[i] = run;
    prev = r;
  }
  return { sorted, runOf };
}

/** 런별 통계 — run_stats 의 열(span_us · late_max_us 등 표시에 안 쓰는 열은 뺐다). */
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

/** 런 번호 → 그 런 A3 의 sorted 색인(seq 순). */
function runMembers(tagged: NxtTagged): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < tagged.runOf.length; i++) {
    const r = tagged.runOf[i]!;
    if (r < 0) continue;
    (out[r] ??= []).push(i);
  }
  return out;
}

export function nxtRunStats(tagged: NxtTagged): NxtRunStat[] {
  const { sorted } = tagged;
  // 닫는 B6 — (isin, seq) 의 첫 B6(정렬 순서) recv
  const b6Recv = new Map<string, bigint>();
  for (const r of sorted) {
    if (r.k !== "B") continue;
    const key = `${r.isin}:${r.seq}`;
    if (!b6Recv.has(key)) b6Recv.set(key, r.recvNs);
  }
  return runMembers(tagged).map((ms, run) => {
    const rs = ms.map((i) => sorted[i]!);
    const first = rs[0]!;
    const last = rs[rs.length - 1]!;
    const perPx = new Map<number, number>();
    const bsSet = new Set<string>();
    let zz = 0;
    let firstSeq = first.seq;
    let lastSeq = first.seq;
    for (const r of rs) {
      perPx.set(r.px!, (perPx.get(r.px!) ?? 0) + 1);
      bsSet.add(r.bs!);
      if (r.a1 === 0 && r.b1 === 0) zz += 1;
      if (r.seq < firstSeq) firstSeq = r.seq;
      if (r.seq > lastSeq) lastSeq = r.seq;
    }
    let maxSame = 0;
    let multiPx = 0;
    for (const c of perPx.values()) {
      if (c > maxSame) maxSame = c;
      if (c >= 2) multiPx += 1;
    }
    const close = b6Recv.get(`${first.isin}:${lastSeq + 1}`) ?? null;
    let latePieces = 0;
    if (close !== null) for (const r of rs) if (r.recvNs > close) latePieces += 1;
    const closingB6Ok = close !== null;
    return {
      run,
      isin: first.isin,
      n: rs.length,
      bs: first.bs!,
      nbs: bsSet.size,
      npx: perPx.size,
      maxSame,
      multiPx,
      zz,
      firstSeq,
      lastSeq,
      lastPx: last.px!,
      closingB6Ok,
      closingB6RecvNs: close,
      latePieces,
      allLate: closingB6Ok && latePieces === rs.length,
    };
  });
}

/** summary_line 의 숫자(zz_orders 는 옛 200µs 지표라 뺐다). */
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

export function nxtSummaryOf(label: string, tagged: NxtTagged, stats: readonly NxtRunStat[]): NxtSummary {
  const isins = new Set<string>();
  let a3 = 0;
  let b6 = 0;
  for (const r of tagged.sorted) {
    isins.add(r.isin);
    if (r.k === "A") a3 += 1;
    else b6 += 1;
  }
  const multi = stats.filter((s) => s.n >= 2);
  const multiOk = multi.filter((s) => s.closingB6Ok);
  return {
    label,
    isins: isins.size,
    a3,
    b6,
    runsGe2: multi.length,
    smp: stats.filter((s) => s.maxSame >= 2).length,
    closingOk: stats.filter((s) => s.closingB6Ok).length,
    runs: stats.length,
    inverted: multiOk.filter((s) => s.latePieces > 0).length,
    invertedOf: multiOk.length,
    allLate: multi.filter((s) => s.allLate).length,
  };
}

/** NXT 팀 주문 하나 — 값은 KRX 팀 주문과 같은 정의(수량 · 금액 = 조각 합, 시각 · 가격 = 마지막 조각, D-04). */
export interface NxtTeamOrder {
  run: number;
  /** 마지막 조각 체결 시각(epoch ns). 체결 시각을 못 읽은 조각이면 null. */
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
  /** 조각 원본 레코드 색인(seq 순). */
  recs: number[];
}

/** 런 → 팀 주문 목록(런 순 = seq 순). bs ∉ {'1','2'} 버림 · 한 가격 최대 조각 < 2 버림. */
export function classifyNxtTeamOrders(tagged: NxtTagged): NxtTeamOrder[] {
  const { sorted } = tagged;
  const out: NxtTeamOrder[] = [];
  runMembers(tagged).forEach((ms, run) => {
    const rs = ms.map((i) => sorted[i]!);
    const bs = rs[0]!.bs!;
    if (bs !== "1" && bs !== "2") return;
    const perPx = new Map<number, number>();
    let maxSame = 0;
    let qty = 0;
    let krw = 0;
    for (const r of rs) {
      const c = (perPx.get(r.px!) ?? 0) + 1;
      perPx.set(r.px!, c);
      if (c > maxSame) maxSame = c;
      qty += r.qty!;
      krw += r.qty! * r.px!;
    }
    if (maxSame < 2) return;
    const last = rs[rs.length - 1]!;
    out.push({
      run,
      tNs: last.tNs ?? null,
      side: bs,
      qty,
      krw,
      px: last.px!,
      maxSame,
      pieces: rs.length,
      nPx: perPx.size,
      firstSeq: rs[0]!.seq,
      lastSeq: last.seq,
      recs: rs.map((r) => r.rec),
    });
  });
  return out;
}
