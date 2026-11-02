/**
 * TickSession — 격자 바이트 하나(해제된 레코드 프레이밍)를 뷰어가 쓰는 표 묶음으로 한 번에 만든다 (Phase 37 D-00 · D-18).
 *
 * ① 전부 `@gh-radar/shared` 뷰어 모델(37-05) 호출뿐인 순수 함수다 — Web Worker 로 그대로 옮길 수 있다(RESEARCH A10).
 * ② 표 — 레코드 인덱스(머리만) · 수신순/거래소순 순열과 그 역(rec → 자리) · A3 열 배열(+ rec → A3 열 색인) ·
 *   마지막 B6 표(**거래소순 자리** → B6 rec) · 마지막 B9 표(**수신순 자리** → B9 rec) · 5분 밀도 144칸 · VI 구간.
 * ③ 지연 디코딩(RESEARCH Pattern 2) — B6 · B9 · R8 본문은 여기서 풀지 않는다(VI 만 R8 을 한 번 훑는다). 호가 10단은
 *   커서가 고른 B6 하나만 `bookAt` 으로 그때 푼다.
 * recv_ns 는 BigInt64Array 그대로다(Number 금지).
 */

import {
  a3ColumnsOf,
  buildTickIndex,
  dayStartNs,
  densityOf,
  exchangeOrderOf,
  inversePerm,
  lastB6Of,
  lastB9Of,
  recvOrderOf,
  viSpansOf,
  type A3Columns,
  type TickExchange,
  type TickIndex,
  type ViSpan,
} from '@gh-radar/shared';

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
}

export function tickSessionKeyOf(date: string, ex: TickExchange, isin: string): string {
  return `${date}|${ex}|${isin}`;
}

export function buildTickSession(
  buf: Uint8Array,
  { date, ex, isin = '' }: { date: string; ex: TickExchange; isin?: string },
): TickSession {
  const index = buildTickIndex(buf, ex === 'NXT' ? 'nxt' : 'krx');
  const recvOrder = recvOrderOf(index);
  const exOrder = exchangeOrderOf(index, recvOrder);
  const a3 = a3ColumnsOf(buf, index);
  const a3Of = new Int32Array(index.n).fill(-1);
  for (let j = 0; j < a3.n; j++) a3Of[a3.rec[j]!] = j;
  return {
    key: tickSessionKeyOf(date, ex, isin),
    date,
    ex,
    buf,
    index,
    recvOrder,
    exOrder,
    recvPos: inversePerm(recvOrder),
    exPos: inversePerm(exOrder),
    a3,
    a3Of,
    lastB6: lastB6Of(index, exOrder),
    lastB9: lastB9Of(index, recvOrder),
    density: densityOf(a3, index, date),
    vi: viSpansOf(buf, index),
    dayStartNs: dayStartNs(date, '0800'),
  };
}
