/**
 * accum-list — 작업대 「매집」 패널(kind 16 매집감지)의 클라 순수 함수 (quick-261018-rfy · D-01 · D-02).
 *
 * ① 현재 상태 = isin 별 최신 행 — kind 16 행은 그 시점 누적 상태 전체라(델타 아님) 키별 마지막 행이 지금 상태다.
 *   최신 판정은 gwTimeMs desc → gateway asc → seq desc. 세 서버가 같은 isin 을 각자 넣지만 값 차이는
 *   our_excluded_qty 뿐이라 웹은 이 규칙 하나다(같은 분 quote-primary 우선은 REST RPC 에만 있다 — 웹은 quote-primary 를 모른다).
 *
 * ② 정렬 — 매집중 · 매도중(1·2)이 먼저(팀 순매수 큰 순), 청산(3)은 뒤(**먼저 청산한 순** — gh-trade 클라 `AccumWatchForm.SortRows`
 *   ClosedAtTick 오름차순 동형). 동률은 isin 으로 고정.
 *
 * ②' 목록에 싣는 행 — 청산 행은 종료 사유 1(청산)만. 2 이월 탈락 · 3 이월 만료는 06:00 거래일 경계(또는 서버 기동 정합)에서만 나오는데,
 *   gh-trade 클라는 그 종료 프레임을 받을 때 그 종목 행이 없거나(자정 넘김이 목록을 비운다 · 모르는 종목의 종료는 무시) 재접속 89 스냅샷이
 *   조용히 지운다 — 클라에 「청산」 행으로 남는 일이 없다(2026-10-21 사용자 제보 · 06:00 종료 행 6~7건).
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

/** 같은 재기동의 복원 행(queue_case 3)으로 묶는 창 — 마지막 복원 행 기준(⑤). */
export const RESTORE_BATCH_WINDOW_MS = 120_000;

/**
 * ⑤ 복원 묶음 = 그 서버의 전체 목록 — 게이트웨이별 **가장 최근 복원 묶음**(queue_case 3 · `RESTORE_BATCH_WINDOW_MS` 창)의
 * 시작 시각. 서버가 재기동하며 내는 복원 행 묶음은 그 서버가 지금 들고 있는 포지션 전체이므로, 그보다 오래된 행의 종목은
 * 그 서버가 더는 들고 있지 않다(2026-10-18 이월 파일 교체로 종료 행 없이 사라진 46종목). 복원 행이 없는 게이트웨이는 키가 없다.
 * ★ 같은 규칙을 REST RPC(`dma_accum_signals_for_user_json` · 20261018233000)가 SQL 로 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.
 */
export function restoreCutByGateway(
  rows: readonly Pick<StrategyEventRow, 'gateway' | 'gwTimeMs' | 'queueCase'>[],
): Map<string, number> {
  const last = new Map<string, number>();
  for (const r of rows) {
    if (r.queueCase !== 3) continue;
    const cur = last.get(r.gateway);
    if (cur === undefined || r.gwTimeMs > cur) last.set(r.gateway, r.gwTimeMs);
  }
  const cut = new Map<string, number>();
  for (const r of rows) {
    if (r.queueCase !== 3) continue;
    if (r.gwTimeMs < (last.get(r.gateway) as number) - RESTORE_BATCH_WINDOW_MS) continue;
    const cur = cut.get(r.gateway);
    if (cur === undefined || r.gwTimeMs < cur) cut.set(r.gateway, r.gwTimeMs);
  }
  return cut;
}

/** isin 별 최신 행 1건씩(①) — 복원 묶음보다 오래된 행은 먼저 버린다(⑤). 순서는 처음 본 isin 순. */
export function latestAccumByIsin(rows: readonly StrategyEventRow[]): StrategyEventRow[] {
  const cut = restoreCutByGateway(rows);
  const byIsin = new Map<string, StrategyEventRow>();
  for (const r of rows) {
    const c = cut.get(r.gateway);
    if (c !== undefined && r.gwTimeMs < c) continue;
    const cur = byIsin.get(r.isin);
    if (cur === undefined || isNewer(r, cur)) byIsin.set(r.isin, r);
  }
  return [...byIsin.values()];
}

/** 목록에 싣는 행인가(②') — 활성(1 · 2) 전부 · 청산(3)은 종료 사유 1 만. */
export function isListedAccum(sig: Pick<AccumSignal, 'state' | 'endReason'>): boolean {
  return sig.state !== 3 || sig.endReason === 1;
}

/** 표시 순서(②) — 새 배열을 돌려준다. */
export function sortAccum(signals: readonly AccumSignal[]): AccumSignal[] {
  return [...signals].sort((a, b) => {
    const aEnd = a.state === 3;
    const bEnd = b.state === 3;
    if (aEnd !== bEnd) return aEnd ? 1 : -1;
    if (!aEnd && a.netKrw !== b.netKrw) return b.netKrw - a.netKrw;
    if (aEnd && a.gwTimeMs !== b.gwTimeMs) return a.gwTimeMs - b.gwTimeMs;
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
