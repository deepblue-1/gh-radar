/**
 * accum-list — 작업대 「매집」 패널(kind 16 매집감지)의 클라 순수 함수 (quick-261018-rfy · D-01 · D-02).
 *
 * ① 현재 상태 = isin 별 최신 행 — kind 16 행은 그 시점 누적 상태 전체라(델타 아님) 키별 마지막 행이 지금 상태다.
 *   최신 판정은 gwTimeMs desc → gateway asc → seq desc. 세 서버가 같은 isin 을 각자 넣지만 값 차이는
 *   our_excluded_qty 뿐이라 웹은 이 규칙 하나다(같은 분 quote-primary 우선은 REST RPC 에만 있다 — 웹은 quote-primary 를 모른다).
 *
 * ② 정렬 — 매집중 · 매도중(1·2)이 먼저(**당일 순매수 큰 순** — dayNetKrw · null(옛 행)은 수 있는 행 뒤 → 같으면 누적 netKrw 큰 순 ·
 *   quick-261026-01h 당일 축 · WinForms 동형), 청산(3)은 뒤(**먼저 청산한 순** — gh-trade 클라 `AccumWatchForm.SortRows`
 *   ClosedAtTick 오름차순 동형). 동률은 isin 으로 고정.
 *
 * ②' 목록에 싣는 행 — 활성(1 · 2) 전부 · 청산 행은 종료 사유 1(청산)과, 종료 사유 4(매집 종료 — 인박스 261024-accum-hidden-carry10
 *   「추가 — 매집 종료」)는 그날 같은 서버 그 종목에 청산 행(row 4 · end 1)이 있을 때만. 서버는 end 4 에 88 을 내지 않아 gh-trade 클라는
 *   장중 청산으로 생긴 회색 「청산」 행을 자정까지 그대로 둔다(배지 그대로 — 사유만 툴팁). 숨김 이월 뒤 끝난 종목은 그날 청산 행이 없다 —
 *   클라 목록에 처음부터 없었으므로 싣지 않는다. 2 기동 정합 · 3 이월 만료는 06:00 거래일 경계(또는 서버 기동 정합)에서만 나오는데,
 *   gh-trade 클라는 그 종료 프레임을 받을 때 그 종목 행이 없거나(자정 넘김이 목록을 비운다 · 모르는 종목의 종료는 무시) 재접속 89 스냅샷이
 *   조용히 지운다 — 클라에 「청산」 행으로 남는 일이 없다(2026-10-21 사용자 제보 · 06:00 종료 행 6~7건).
 *   판정은 isin 별 최신 행만으로는 못 한다(end 4 가 최신이면 end 1 이 가려진다) — 자르기 뒤 행 전체에서 `closedRowsOf` 로 구해
 *   `isListedAccum(sig, closed)` 로 거르고, 거름은 훅(use-accum-signals)이 한 번 한다(패널은 받은 것을 그대로 보인다).
 *   매집 종료 행의 값 · 「갱신」 시각 · 청산끼리 순서(②)는 **그날 최신 청산 행(end 1) 기준**이고 종료 사유만 4 다 — 클라는 88 을 받지
 *   않아 청산 순간의 값 · 시각을 그대로 들고 있다(WinForms 동형 · 2026-10-24 결정). 그래서 훅은 청산 행의 신호에 `endReason: 4` 만 덮는다.
 *   ★ 같은 생각을 복원 RPC(20261024230000 — (gateway, isin) 별 그날 최신 청산 행을 함께 싣는다)가 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.
 *
 * ③ ✕ 숨김 = 이 기기 · 오늘 · **사이클 단위** — 활성 행 키 `${isin}|${cycle}` · 청산 행 키 `${isin}|${cycle}|end`.
 *   청산(end_reason 1)은 서버가 같은 포지션을 숨김으로 계속 추적하고, 다시 등록 임계 이상이면 **같은 cycle** 로 재등장한다
 *   (인박스 261024-accum-hidden-carry10 D-4). 그래서 활성 때 숨긴 사이클은 청산 · 재등장까지 계속 숨기고, 청산 행에서 숨긴 것은
 *   청산 동안만 숨긴다 — 재등장하면 다시 보인다. 같은 종목의 새 사이클(번호가 바뀜)은 어느 쪽이든 다시 보인다.
 *   매집 종료(4) 행도 state 3 이라 청산 행과 같은 키(`…|end`)다 — 청산 행에서 숨긴 것은 매집 종료 뒤에도 숨김이다.
 *   날짜 키 집합은 돌파 패널(`breakout-list.ts` readDatedSet/writeDatedSet)과 같은 저장 문법이다.
 *
 * ⑥ 전날 순매수(quick-261026-01h · `prevDayNetOf`) — 이월 행 「전날 ±x.x억」 의 원천은 KYOBO119 판정 accum_flow(매집감지 보고서)의
 *   전 거래일 마지막 행 pos_day 차(pos_day_buy − pos_day_sell)다. 패널이 다른 서버(KB120)를 보여도 같은 값을 쓴다(서버 사이 차이는
 *   우리 체결 제외분뿐). 최신 보고서가 오늘 전이면 그 행의 pos_day 차, 오늘(21:00 적재 뒤)이면 prev_pos_day 키(목록 RPC 가 앞날 행에서
 *   싣는다). 행 있는 날짜 기준이라 적재 누락일이 있으면 그 앞날 값이 된다.
 *
 * ④ 신규 강조 — 돌파 규칙 그대로(`HIGHLIGHT_MS` 30초). 첫 채움(REST 복원)은 무강조, 그 뒤 새로 오른 키(새 isin · 새 사이클 ·
 *   같은 사이클 재등장)만 강조한다. 청산 행은 강조하지 않는다. 청산 행이 최신이면 활성 키가 기록에서 빠지므로 재등장 행은 새 키다.
 *   「직전 커밋 기록 + 현재 입력」 순수 계산 — 컴포넌트가 렌더에서 계산하고 커밋 뒤 옮긴다.
 *
 * ⑦ 필터(quick-261104-nxs · gh-trade quick-261104-519 `AccumFilter` · `IsShownRow` 동형) — 등락률(%) · 당일 순매수(억) 「최소 ~ 최대」
 *   네 칸뿐이다(수익률 · 누적 · 시총 칸은 없다). 판정 값 = **화면에 보이는 값**이다 — 등락률은 패널의 표시 등락률(95 → 구독 시세 →
 *   행 값)을 소수 둘째 자리 **0에서 먼 쪽**으로 반올림해 비교하고, 당일 순매수는 `dayNetKrw`(null(옛 행) · 비유한수 → 0 — gh-trade
 *   C-2)를 억 칸 `Math.round(억 × 1e8)` 원과 비교한다. 경계 포함. 빈 칸 = 그쪽 제한 없음, 잘못된 값 · NaN · 무한대 = 빈 칸(예외 없음).
 *   min > max 는 바꿔 주지 않는다(아무것도 통과 못 함 — 그대로). ✕ 숨김(③)이 먼저 적용되고, 칩 · 펼친 표 · 회색 청산 행이 이 판정
 *   하나로 걸러진다. 네 칸은 이 기기에 날짜 키 없이 기억하고(`ACCUM_FILTER_KEY` · 처음 = 등락률 최소 15 · 당일 순매수 최소 1억),
 *   「전부 보기」 는 기억하지 않는다(매 진입 꺼짐).
 */

import type { AccumReportResponse, AccumSignal, StrategyEventRow } from '@gh-radar/shared';

import { HIGHLIGHT_MS, kstDateKey, readDatedSet, writeDatedSet } from './breakout-list';
import { isNum } from './teamflow-report';

/** ✕ 로 숨긴 사이클 집합 — 날짜 키(KST 오늘) 단위. */
export const ACCUM_DISMISSED_KEY = 'gh-radar:accum-dismissed';

/* ── ⑦ 필터 ─────────────────────────────────────────────────────────── */

/** 필터 4칸 저장 키(⑦) — 날짜 키 없음 · 계속 유지. */
export const ACCUM_FILTER_KEY = 'gh-radar:accum-filter';

/** 필터 4칸 — 등락률(%) · 당일 순매수(억). null = 그쪽 제한 없음(⑦). */
export interface AccumFilter {
  rateMin: number | null;
  rateMax: number | null;
  dayMin: number | null;
  dayMax: number | null;
}

/** 처음(저장 없음) 값 — 등락률 15% 이상 · 당일 순매수 1억 이상 · 최대 칸은 빈 칸(⑦). */
export const DEFAULT_ACCUM_FILTER: AccumFilter = { rateMin: 15, rateMax: null, dayMin: 1, dayMax: null };

/** 부호 · 소수 · 지수만 — 16진수 · 여러 점 · 「Infinity」 를 거른다(쉼표는 먼저 지운다). */
const FILTER_CELL_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** 칸 글자 → 값(⑦). 앞뒤 공백 제거 · 천 단위 쉼표 허용 · 빈 칸 · 잘못된 값 · 비유한수 = null. 예외를 던지지 않는다. */
export function parseAccumFilterCell(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (t === '' || !FILTER_CELL_PATTERN.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** 값 → 칸 글자(⑦). null 은 빈 칸. */
export function formatAccumFilterCell(v: number | null): string {
  return v === null ? '' : String(v);
}

/** 소수 둘째 자리 반올림 — 0에서 먼 쪽(⑦ · gh-trade `MidpointRounding.AwayFromZero` 동형). */
export function roundRate2(rate: number): number {
  return (Math.sign(rate) * Math.round(Math.abs(rate) * 100)) / 100;
}

/** 필터 통과 여부(⑦) — rate = 표시 등락률(%), dayNetKrw = 당일 순매수(원 · null 은 0). 경계 포함. */
export function passesAccumFilter(f: AccumFilter, rate: number, dayNetKrw: number | null): boolean {
  if (f.rateMin !== null || f.rateMax !== null) {
    if (!Number.isFinite(rate)) return false;
    const r = roundRate2(rate);
    if (f.rateMin !== null && r < f.rateMin) return false;
    if (f.rateMax !== null && r > f.rateMax) return false;
  }
  const day = dayNetKrw !== null && Number.isFinite(dayNetKrw) ? dayNetKrw : 0;
  if (f.dayMin !== null && day < Math.round(f.dayMin * 1e8)) return false;
  if (f.dayMax !== null && day > Math.round(f.dayMax * 1e8)) return false;
  return true;
}

/** 저장값 한 칸 — 유한수면 그 값 · null 이면 null · 그 밖(문자열 · 누락)은 기본값. */
function filterCellOf(raw: Record<string, unknown>, key: keyof AccumFilter): number | null {
  const v = raw[key];
  if (v === null) return null;
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_ACCUM_FILTER[key];
}

/** 이 기기에 기억한 필터(⑦). 저장 없음 · JSON 깨짐 · 객체 아님 · 저장소 막힘 = 기본값. */
export function readAccumFilter(): AccumFilter {
  if (typeof window === 'undefined') return DEFAULT_ACCUM_FILTER;
  try {
    const text = window.localStorage.getItem(ACCUM_FILTER_KEY);
    if (text === null) return DEFAULT_ACCUM_FILTER;
    const raw: unknown = JSON.parse(text);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_ACCUM_FILTER;
    const obj = raw as Record<string, unknown>;
    return {
      rateMin: filterCellOf(obj, 'rateMin'),
      rateMax: filterCellOf(obj, 'rateMax'),
      dayMin: filterCellOf(obj, 'dayMin'),
      dayMax: filterCellOf(obj, 'dayMax'),
    };
  } catch {
    return DEFAULT_ACCUM_FILTER;
  }
}

/** 필터를 기억한다(⑦). 저장 실패는 무시한다 — 화면 동작을 막지 않는다. */
export function writeAccumFilter(f: AccumFilter): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCUM_FILTER_KEY, JSON.stringify(f));
  } catch {
    // 저장소 막힘(사생활 모드 · 용량) — 이번 진입 동안은 상태로만 유지된다.
  }
}

/** 숨김 · 강조 키 — 사이클 단위 · 청산 행은 `|end`(③ · ④). */
export function accumDismissKey(sig: Pick<AccumSignal, 'isin' | 'cycle' | 'state'>): string {
  const base = `${sig.isin}|${sig.cycle}`;
  return sig.state === 3 ? `${base}|end` : base;
}

/** ✕ 로 숨긴 행인가(③) — 활성 때 숨긴 사이클 키는 청산 · 재등장에도, 청산 행 키는 청산 동안만. */
export function isAccumDismissed(
  dismissed: ReadonlySet<string>,
  sig: Pick<AccumSignal, 'isin' | 'cycle' | 'state'>,
): boolean {
  return dismissed.has(`${sig.isin}|${sig.cycle}`) || dismissed.has(accumDismissKey(sig));
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

/**
 * ②' 그날 청산 행(row 4 · end 1) — isin 별 최신 1건(최신 판정은 ①). 복원 묶음(⑤) 뒤 행만. 매집 종료(4) 행을 싣는지와,
 * 실을 때의 값 · 「갱신」 시각이 이 행이다. 입력은 한 게이트웨이 행이다(훅 ④) — 게이트웨이를 섞어 주면 다른 서버의 청산도 센다.
 * ★ 같은 판정을 REST RPC(20261024230000)가 SQL 로 쓴다 — 한쪽만 바꾸면 복원과 라이브가 갈린다.
 */
export function closedRowsOf(rows: readonly StrategyEventRow[]): Map<string, StrategyEventRow> {
  const cut = restoreCutByGateway(rows);
  const byIsin = new Map<string, StrategyEventRow>();
  for (const r of rows) {
    const c = cut.get(r.gateway);
    if (c !== undefined && r.gwTimeMs < c) continue;
    if (r.queueCase !== 4 || r.cancelReason !== 1) continue;
    const cur = byIsin.get(r.isin);
    if (cur === undefined || isNewer(r, cur)) byIsin.set(r.isin, r);
  }
  return byIsin;
}

/**
 * 목록에 싣는 행인가(②') — 활성(1 · 2) 전부 · 청산(3)은 종료 사유 1 과, `closed`(그날 청산 행이 있는 isin —
 * `closedRowsOf` 결과 그대로 줘도 된다)에 든 종목의 종료 사유 4(매집 종료).
 */
export function isListedAccum(
  sig: Pick<AccumSignal, 'isin' | 'state' | 'endReason'>,
  closed: { has(isin: string): boolean },
): boolean {
  if (sig.state !== 3 || sig.endReason === 1) return true;
  return sig.endReason === 4 && closed.has(sig.isin);
}

/** 표시 순서(②) — 새 배열을 돌려준다. */
export function sortAccum(signals: readonly AccumSignal[]): AccumSignal[] {
  return [...signals].sort((a, b) => {
    const aEnd = a.state === 3;
    const bEnd = b.state === 3;
    if (aEnd !== bEnd) return aEnd ? 1 : -1;
    if (!aEnd) {
      // 당일 순매수 큰 순 — null(옛 행)은 −∞ 로 뒤. 같을 때 뺄셈하지 않는다(−∞ − −∞ = NaN).
      const ad = a.dayNetKrw ?? -Infinity;
      const bd = b.dayNetKrw ?? -Infinity;
      if (ad !== bd) return bd > ad ? 1 : -1;
      if (a.netKrw !== b.netKrw) return b.netKrw - a.netKrw;
    }
    if (aEnd && a.gwTimeMs !== b.gwTimeMs) return a.gwTimeMs - b.gwTimeMs;
    return a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0;
  });
}

/**
 * 이월 행 전날 순매수(⑥) — 최신 매집감지 보고서(`fetchAccumReport()` · d 없음) → isin → 원.
 * - `resp.date < todayYmd` → 그날 행의 pos_day_buy_krw − pos_day_sell_krw
 * - `resp.date === todayYmd`(21:00 적재 뒤) → prev_pos_day_buy_krw − prev_pos_day_sell_krw
 * - 둘 중 하나라도 수가 아니면 그 isin 은 없다 · access false · date null · 미래 날짜 → 빈 Map.
 * 날짜는 'YYYYMMDD' 문자열 사전 비교다.
 */
export function prevDayNetOf(resp: AccumReportResponse, todayYmd: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!resp.access || resp.date === null || resp.date > todayYmd) return out;
  const isToday = resp.date === todayYmd;
  for (const r of resp.rows) {
    const buy = isToday ? r.prev_pos_day_buy_krw : r.pos_day_buy_krw;
    const sell = isToday ? r.prev_pos_day_sell_krw : r.pos_day_sell_krw;
    if (isNum(buy) && isNum(sell)) out.set(r.isin, buy - sell);
  }
  return out;
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
