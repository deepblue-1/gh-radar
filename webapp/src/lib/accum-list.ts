/**
 * accum-list — 작업대 「매집」 패널(kind 16 매집감지)의 클라 순수 함수 (quick-261018-rfy · D-01 · D-02).
 *
 * ① 현재 상태 = isin 별 최신 행 — kind 16 행은 그 시점 누적 상태 전체라(델타 아님) 키별 마지막 행이 지금 상태다.
 *   최신 판정은 gwTimeMs desc → gateway asc → seq desc. 세 서버가 같은 isin 을 각자 넣지만 값 차이는
 *   our_excluded_qty 뿐이라 웹은 이 규칙 하나다(같은 분 quote-primary 우선은 REST RPC 에만 있다 — 웹은 quote-primary 를 모른다).
 *
 * ② 정렬 — 매집중 · 매도중(1·2)이 먼저(팀 순매수 큰 순), 청산(3)은 뒤(갱신 늦은 순). 동률은 isin 으로 고정.
 *
 * ③ ✕ 숨김 = 이 기기 · 오늘 · **사이클 단위** — 키 `${isin}|${cycle}`. 같은 종목의 새 사이클(cycle +1)이 오면 다시 보인다.
 *   날짜 키 집합은 돌파 패널(`breakout-list.ts` readDatedSet/writeDatedSet)과 같은 저장 문법이다.
 *
 * ④ 신규 강조 — 돌파 규칙 그대로(`HIGHLIGHT_MS` 30초). 첫 채움(REST 복원)은 무강조, 그 뒤 새로 오른 키(새 isin · 새 사이클)만
 *   강조한다. 청산 행은 강조하지 않는다. 「직전 커밋 기록 + 현재 입력」 순수 계산 — 컴포넌트가 렌더에서 계산하고 커밋 뒤 옮긴다.
 */

import type { AccumSignal, StrategyEventRow } from '@gh-radar/shared';

import { HIGHLIGHT_MS, kstDateKey, readDatedSet, writeDatedSet } from './breakout-list';

/** ✕ 로 숨긴 사이클 집합 — 날짜 키(KST 오늘) 단위. */
export const ACCUM_DISMISSED_KEY = 'gh-radar:accum-dismissed';

/** 숨김 · 강조 키 — 사이클 단위(③ · ④). */
export function accumDismissKey(sig: Pick<AccumSignal, 'isin' | 'cycle'>): string {
  return `${sig.isin}|${sig.cycle}`;
}

/** 오늘 숨긴 사이클 키 집합. 날짜가 다르거나 저장소가 막혔으면 빈 집합. */
export function readAccumDismissed(today: string = kstDateKey()): ReadonlySet<string> {
  return readDatedSet(ACCUM_DISMISSED_KEY, today);
}

/** 숨긴 사이클을 기록하고 갱신된 집합을 돌려준다. */
export function addAccumDismissed(keys: readonly string[], today: string = kstDateKey()): ReadonlySet<string> {
  const next = new Set(readAccumDismissed(today));
  for (const k of keys) next.add(k);
  writeDatedSet(ACCUM_DISMISSED_KEY, today, next);
  return next;
}

/** a 가 b 보다 최신인가 — gwTimeMs desc → gateway asc → seq desc (①). */
function isNewer(
  a: Pick<StrategyEventRow, 'gwTimeMs' | 'gateway' | 'seq'>,
  b: Pick<StrategyEventRow, 'gwTimeMs' | 'gateway' | 'seq'>,
): boolean {
  if (a.gwTimeMs !== b.gwTimeMs) return a.gwTimeMs > b.gwTimeMs;
  if (a.gateway !== b.gateway) return a.gateway < b.gateway;
  return a.seq > b.seq;
}

/** isin 별 최신 행 1건씩(①). 순서는 처음 본 isin 순. */
export function latestAccumByIsin(rows: readonly StrategyEventRow[]): StrategyEventRow[] {
  const byIsin = new Map<string, StrategyEventRow>();
  for (const r of rows) {
    const cur = byIsin.get(r.isin);
    if (cur === undefined || isNewer(r, cur)) byIsin.set(r.isin, r);
  }
  return [...byIsin.values()];
}

/** 표시 순서(②) — 새 배열을 돌려준다. */
export function sortAccum(signals: readonly AccumSignal[]): AccumSignal[] {
  return [...signals].sort((a, b) => {
    const aEnd = a.state === 3;
    const bEnd = b.state === 3;
    if (aEnd !== bEnd) return aEnd ? 1 : -1;
    if (!aEnd && a.netKrw !== b.netKrw) return b.netKrw - a.netKrw;
    if (aEnd && a.gwTimeMs !== b.gwTimeMs) return b.gwTimeMs - a.gwTimeMs;
    return a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0;
  });
}

/** 사이클 키 → 강조 만료 시각(ms) · null = 무강조. */
export type AccumMeta = ReadonlyMap<string, number | null>;

/**
 * 강조 기록 한 걸음(④) — 직전 커밋 기록(`prev`) + 현재 입력. 이미 본 키는 직전 값을 유지하고, 새 키는
 * 직전 커밋이 filled 전이었으면(첫 채움) 무강조, 아니면 `now + HIGHLIGHT_MS`(청산 행은 무강조). 결과는 현재 키만 담는다.
 */
export function advanceAccumMeta(
  prev: AccumMeta,
  signals: readonly AccumSignal[],
  now: number,
  filledBefore: boolean,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const s of signals) {
    const key = accumDismissKey(s);
    const seen = prev.get(key);
    if (seen !== undefined) {
      out.set(key, seen);
      continue;
    }
    out.set(key, filledBefore && s.state !== 3 ? now + HIGHLIGHT_MS : null);
  }
  return out;
}
