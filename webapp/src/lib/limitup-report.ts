/**
 * limitup-report — 상한가 보고서 머리(KPI · 하루 격자 · 날짜 탐색)의 순수 계산 (Phase 28 Plan 12 · D-11 · D-12).
 *
 * 화면과 떨어진 함수로 두어 숫자를 단위 테스트로 잠근다(`__tests__/limitup-report.test.ts`).
 *
 * ★ 같은 숫자 원칙(UI-SPEC P-5 「원천은 플래너가 확정」): 값 정의는 gh-trade 보고서와 같은 축을 쓴다. 정본 = gh-trade
 *   `server/tools/analysis/tickana/report.py`:
 *   - `_stocks` (349~375행) — 행 순서 = (도달 먼저, 첫 상한 체결 시각 → 없으면 첫 잠김 시작 → 없으면 맨 뒤, isin)
 *   - `_result_tag` (386~395행) — 잠김 없음 · 종가 = 상한가면 유지 · 아니면 깨짐. 웹은 UI-SPEC ④-3 표대로
 *     「유지」 앞에 앞선 깨짐이 있으면 「깨짐」 을 하나 더 단다(판정 축은 같은 종가 규칙).
 *   - 어제 D+1 = 이전 적재 날짜 locks `d1_ret` 중앙값(pandas median — 짝수 개는 가운데 둘 평균) · 건수
 * ★ 목록 = 첫 상한가 체결이 있는 종목만(quick-261005-vk1 D-02 · `isListedStock`). entry 가 있고 `first_upper_ms` 가
 *   null 이면 「상한가 미도달」 이라 목록 · 사건 카드에서 빼고 KPI 아래 한 줄(`excludedCaptionOf`)로만 말한다. entry 가 없는
 *   옛 잠김 행(27-07 이전 DB)은 잠김이 있으니 남는다. `stocksOf` 자체(gh-trade `_stocks` 동형)는 그대로 두고 소비처가 거른다.
 * ★ KPI 4칸(D-02 — 스케치 011 채택안): 상한가 도달 = 목록 종목 수 · 종가까지 유지 = 목록 중 결과 태그에 「유지」 가 있는
 *   종목 수 · 깨짐 = 목록 중 태그가 「깨짐」 하나뿐인 종목 수 · 어제 D+1(위). 옛 「탐지 종목 · 잠김(3초↑) · 25%↑ 미도달」 은 없다.
 * ★ 행 「직전 1분 매수 1위」 는 사실 `member_entry_buy`(창 [anchor − 60s, anchor] — workers/limitup-sync derive.ts) 의
 *   values 에서만 만든다(`entryBuyTopOf`). entries `entry_buy_member*`/`entry_buy_share*` 는 **다른 창**이라 「직전 1분」 이름을
 *   달면 틀린 숫자가 된다(실 export 덕우전자 entries 1위 신한 89.6% vs 사실 한국증권 54.4%).
 * ★ 비율 단위 함정(RESEARCH Pitfall 10): export `d1_ret` · `close_ret` · `sell_share_60s` 는 **소수**다.
 *   `fmtRet` 은 퍼센트를 받으므로 × 100 해서 넣는다.
 */

import {
  formatEok,
  formatGroup,
  memberName,
  type LimitupDate,
  type LimitupDay,
  type LimitupEntryRow,
  type LimitupFactRow,
  type LimitupGridSummaryRow,
  type LimitupLockRow,
} from '@gh-radar/shared';

import { fmtRet } from './limit-up-format';

const DASH = '—';

/** 장 시작 · 끝 — 그날 00:00 KST 기준 초(09:00 · 15:30). 스파크라인 공통 x 축. */
export const SPARK_SEC_START = 32_400;
export const SPARK_SEC_END = 55_800;
/** y 축 하한(20억) — 기준선 10억이 늘 아래 절반 안에 보인다(UI-SPEC ④-3 제안 행사). */
export const SPARK_Y_FLOOR_KRW = 2_000_000_000;
/** 기준선(10억) — 사용자 가설 기준선. 선만 그린다(gh-trade `--baseline-krw` 기본값). */
export const SPARK_BASELINE_KRW = 1_000_000_000;

// ---------------------------------------------------------------------------
// 종목 묶음 (gh-trade `_stocks`)
// ---------------------------------------------------------------------------

/** 오늘 종목 하나 — entries 행(없으면 locks 첫 행으로 채움) + 그 종목 잠김(lock_id 순). */
export interface LimitupStock {
  isin: string;
  shortCode: string | null;
  name: string | null;
  reached: boolean;
  /** 정렬 기준 시각 — 첫 상한 체결(없으면 첫 잠김 시작). 둘 다 없으면 null(도달 그룹 맨 뒤). */
  anchorMs: number | null;
  entry: LimitupEntryRow | null;
  locks: LimitupLockRow[];
  closePx: number | null;
  upperPx: number | null;
}

function nonEmpty(s: string | null | undefined): s is string {
  return s != null && s !== '';
}

export function stocksOf(day: Pick<LimitupDay, 'entries' | 'locks'>): LimitupStock[] {
  const byIsin = new Map<string, LimitupLockRow[]>();
  for (const lk of day.locks) {
    const list = byIsin.get(lk.isin);
    if (list) list.push(lk);
    else byIsin.set(lk.isin, [lk]);
  }
  for (const list of byIsin.values()) list.sort((a, b) => a.lock_id - b.lock_id);

  const out = new Map<string, LimitupStock>();
  for (const e of day.entries) {
    out.set(e.isin, {
      isin: e.isin,
      shortCode: e.short_code,
      name: e.name,
      reached: false,
      anchorMs: null,
      entry: e,
      locks: [],
      closePx: e.close_px,
      upperPx: e.upper_px,
    });
  }
  for (const [isin, locks] of byIsin) {
    const first = locks[0]!;
    let s = out.get(isin);
    if (!s) {
      // entries 가 없는 옛 잠김 행(27-07 이전 DB) — locks 첫 행으로 채운다(reached = 참).
      s = {
        isin,
        shortCode: first.short_code,
        name: first.name,
        reached: true,
        anchorMs: null,
        entry: null,
        locks: [],
        closePx: first.close_px,
        upperPx: first.upper_px,
      };
      out.set(isin, s);
    }
    if (!nonEmpty(s.name) && nonEmpty(first.name)) s.name = first.name;
    if (!nonEmpty(s.shortCode) && nonEmpty(first.short_code)) s.shortCode = first.short_code;
    // 종가 · 상한가는 entries 값이 정본(gh-trade `d.get`) — 결측일 때만 잠김 첫 행으로 보탠다.
    if (s.closePx == null) s.closePx = first.close_px;
    if (s.upperPx == null) s.upperPx = first.upper_px;
    s.locks = locks;
  }

  const rows = [...out.values()];
  for (const s of rows) {
    const reached = s.entry?.reached;
    s.reached = reached != null ? reached : s.locks.length > 0;
    const starts = s.locks.map((l) => l.start_ms).filter((v): v is number => v != null);
    s.anchorMs = s.entry?.first_upper_ms ?? (starts.length > 0 ? Math.min(...starts) : null);
  }
  return rows.sort((a, b) => {
    if (a.reached !== b.reached) return a.reached ? -1 : 1;
    const aa = a.anchorMs ?? Number.POSITIVE_INFINITY;
    const bb = b.anchorMs ?? Number.POSITIVE_INFINITY;
    if (aa !== bb) return aa < bb ? -1 : 1;
    return a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0;
  });
}

/**
 * 목록에 서는 종목인가(D-02) — entry 가 있으면 첫 상한가 체결(`first_upper_ms`)이 있어야 하고, entry 가 없는 옛 잠김 전용
 * 행(27-07 이전 DB)은 잠김이 있으면 선다.
 */
export function isListedStock(s: Pick<LimitupStock, 'entry' | 'locks'>): boolean {
  return s.entry !== null ? s.entry.first_upper_ms != null : s.locks.length > 0;
}

/** 종목 라벨 — 이름 → 코드 → isin(gh-trade `_label` 은 이름 → isin. 실데이터 20% 가 이름 · 코드 둘 다 null). */
function labelOf(s: Pick<LimitupStock, 'name' | 'shortCode' | 'isin'>): string {
  return nonEmpty(s.name) ? s.name : nonEmpty(s.shortCode) ? s.shortCode : s.isin;
}

/** 제외 캡션에 이름을 늘어놓는 최대 개수 — 넘치면 「 외 N」. */
const EXCLUDED_NAMES_MAX = 5;

/**
 * 「상한가에 닿지 않은 N종목(이름 · 이름 …)은 목록에서 뺐어요」 — 제외가 없으면 null(줄 자체가 없다).
 * 이름은 `stocksOf` 순서 그대로 최대 5개, 넘치면 뒤에 「 외 {나머지}」.
 */
export function excludedCaptionOf(report: { day: Pick<LimitupDay, 'entries' | 'locks'> }): string | null {
  const names = stocksOf(report.day)
    .filter((s) => !isListedStock(s))
    .map(labelOf);
  if (names.length === 0) return null;
  const shown = names.slice(0, EXCLUDED_NAMES_MAX).join(' · ');
  const rest = names.length - EXCLUDED_NAMES_MAX;
  return `상한가에 닿지 않은 ${formatGroup(names.length)}종목(${shown}${rest > 0 ? ` 외 ${formatGroup(rest)}` : ''})은 목록에서 뺐어요`;
}

// ---------------------------------------------------------------------------
// KPI 4칸 (D-02)
// ---------------------------------------------------------------------------

export interface LimitupKpis {
  /** 상한가 도달 — 목록 종목 수. */
  reached: string;
  /** 종가까지 유지 — 목록 중 결과 태그에 「유지」 가 있는 종목 수. */
  held: string;
  /** 깨짐 — 목록 중 결과 태그가 「깨짐」 하나뿐인 종목 수. */
  broke: string;
  /** 어제 D+1 중앙값 「+0.9%」 · 없으면 「—」. 색 없음. */
  d1: string;
  /** 「중앙값 · N건」 — 값이 없으면 null(타일 `title` 생략). */
  d1Title: string | null;
}

/** pandas `Series.median()` 동형 — 짝수 개는 가운데 둘 평균. 빈 배열은 null. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * KPI 4칸. 종가까지 유지 = 종가 = 상한가(앞선 깨짐 뒤 재잠김 포함) · 깨짐 = 잠김이 있고 종가 ≠ 상한가.
 * 잠김 없음 종목(첫 상한가 체결은 있으나 3초 잠김이 없던 종목)은 유지 · 깨짐 어디에도 들지 않는다.
 */
export function kpisOf(report: {
  day: Pick<LimitupDay, 'entries' | 'locks'>;
  prev: { date: LimitupDate; locks: LimitupLockRow[] } | null;
}): LimitupKpis {
  const listed = stocksOf(report.day).filter(isListedStock);
  let held = 0;
  let broke = 0;
  for (const s of listed) {
    const tags = resultTagsOf(s);
    if (tags.includes('유지')) held += 1;
    else if (tags.length === 1 && tags[0] === '깨짐') broke += 1;
  }

  const d1s = (report.prev?.locks ?? []).map((l) => l.d1_ret).filter((v): v is number => v != null);
  const d1 = median(d1s);

  return {
    reached: formatGroup(listed.length),
    held: formatGroup(held),
    broke: formatGroup(broke),
    d1: d1 == null ? DASH : fmtRet(d1 * 100),
    d1Title: d1 == null ? null : `중앙값 · ${formatGroup(d1s.length)}건`,
  };
}

// ---------------------------------------------------------------------------
// 결과 태그 (UI-SPEC ④-3 · gh-trade `_result_tag` 종가 규칙)
// ---------------------------------------------------------------------------

/** 목록 종목은 첫 상한가 체결이 있으므로 「미도달」 은 나오지 않는다(D-02). */
export type LimitupResultTag = '깨짐' | '유지' | '잠김 없음';

export function resultTagsOf(stock: Pick<LimitupStock, 'locks' | 'closePx' | 'upperPx'>): LimitupResultTag[] {
  if (stock.locks.length === 0) return ['잠김 없음'];
  const { closePx, upperPx } = stock;
  if (closePx != null && upperPx != null && Math.trunc(closePx) === Math.trunc(upperPx)) {
    return stock.locks.some((l) => l.broke === true) ? ['깨짐', '유지'] : ['유지'];
  }
  return ['깨짐'];
}

// ---------------------------------------------------------------------------
// 직전 1분 매수 1위 (사실 member_entry_buy)
// ---------------------------------------------------------------------------

export interface EntryBuyTop {
  name: string;
  /** 비중 % (사실 values `s1` 그대로 — 소수 1자리 퍼센트). */
  pct: number;
  /** 「한국증권 54.4%」. */
  label: string;
}

/**
 * 상한가 직전 1분 매수 1위 — event 0 `member_entry_buy` 사실의 `m1_code`(회원사명) · 없으면 `m1` 문자열 + `s1`.
 * `s1` 이 유한 숫자가 아니면(「—」) null. 창 = [anchor − 60s, anchor](entries `entry_buy_*` 와 다른 창 — 머리 주석).
 */
export function entryBuyTopOf(facts: readonly LimitupFactRow[]): EntryBuyTop | null {
  const f = facts.find((x) => x.event_no === 0 && x.template_id === 'member_entry_buy');
  const v = f?.values;
  if (!v) return null;
  const s1 = v.s1;
  if (typeof s1 !== 'number' || !Number.isFinite(s1)) return null;
  const code = v.m1_code;
  const raw = v.m1;
  const byCode = typeof code === 'string' && code !== '' ? memberName(code) : '';
  const name = byCode !== '' ? byCode : typeof raw === 'string' && raw !== '' ? raw : null;
  if (name === null) return null;
  return { name, pct: s1, label: `${name} ${s1.toFixed(1)}%` };
}

// ---------------------------------------------------------------------------
// 종목 리스트 행 (D-03)
// ---------------------------------------------------------------------------

export interface LimitupDayRow {
  isin: string;
  /** 종목 라벨 — 이름 → 코드 → isin. */
  label: string;
  code: string | null;
  /** 「5,730원」 — 상한가를 모르면 null. */
  upper: string | null;
  tags: LimitupResultTag[];
  /** 첫 상한가 체결 「HH:MM:SS」 · 없으면 첫 잠김 시작 · 둘 다 없으면 「—」. */
  firstUpper: string;
  maxQ: string;
  sell60: string;
  /** 상한가 직전 1분 매수 1위 「한국증권 54.4%」 · 사실 없으면 「—」. */
  entryTop: string;
  summary: LimitupGridSummaryRow | null;
  locks: LimitupLockRow[];
}

/** 목록 종목만(D-02) · 첫 상한가 시각 순(`stocksOf` 정렬 그대로). */
export function dayRowsOf(report: { day: LimitupDay }): LimitupDayRow[] {
  const summaries = new Map(report.day.summaries.map((s) => [s.isin, s]));
  const factsBy = new Map<string, LimitupFactRow[]>();
  for (const f of report.day.facts) {
    const list = factsBy.get(f.isin);
    if (list) list.push(f);
    else factsBy.set(f.isin, [f]);
  }
  return stocksOf(report.day)
    .filter(isListedStock)
    .map((s) => {
      const summary = summaries.get(s.isin) ?? null;
      const starts = s.locks.map((l) => l.start_ms).filter((v): v is number => v != null);
      const fu = s.entry?.first_upper_ms ?? (starts.length > 0 ? Math.min(...starts) : null);
      const sell = summary?.sell_share_60s;
      const top = entryBuyTopOf(factsBy.get(s.isin) ?? []);
      return {
        isin: s.isin,
        label: labelOf(s),
        code: nonEmpty(s.shortCode) ? s.shortCode : null,
        upper: s.upperPx != null ? `${formatGroup(s.upperPx)}원` : null,
        tags: resultTagsOf(s),
        firstUpper: fu != null ? kstClock(fu) : DASH,
        maxQ: summary?.q_max_krw != null ? formatEok(summary.q_max_krw) : DASH,
        // 정수 % 표시만 — 0.5 는 위로(Math.round).
        sell60: sell != null ? `${Math.round(sell * 100)}%` : DASH,
        entryTop: top !== null ? top.label : DASH,
        summary,
        locks: s.locks,
      };
    });
}

// ---------------------------------------------------------------------------
// 날짜
// ---------------------------------------------------------------------------

/**
 * 적재 날짜 목록(내림차순) 안에서 ‹(prev = 바로 이전 적재 날짜) · ›(next = 바로 다음 적재 날짜).
 * `d` null = 최신. 목록에 없는 날짜(적재 안 됨)는 그 앞뒤 적재 날짜로 간다.
 */
export function dateNavOf(
  dates: readonly LimitupDate[],
  d: LimitupDate | null,
): { prev: LimitupDate | null; next: LimitupDate | null } {
  if (dates.length === 0) return { prev: null, next: null };
  const cur = d ?? dates[0]!;
  let prev: LimitupDate | null = null;
  let next: LimitupDate | null = null;
  for (const x of dates) {
    if (x < cur && (prev === null || x > prev)) prev = x;
    if (x > cur && (next === null || x < next)) next = x;
  }
  return { prev, next };
}

/** `?d=` 원문 → 실재하는 `YYYYMMDD` 만(그 밖 = null). server zod 와 같은 판정(`Date.UTC` 재전개). */
export function parseYmdParam(raw: string | null | undefined): LimitupDate | null {
  if (raw == null || !/^\d{8}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? raw : null;
}

const WEEKDAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });

/** `YYYYMMDD` → 「MM/DD」. */
export function fmtYmdShort(ymd: LimitupDate): string {
  return `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
}

/** `YYYYMMDD` → 「10/02 (금)」 — 요일은 그날 KST 정오의 실제 요일. */
export function fmtYmdLabel(ymd: LimitupDate): string {
  const noonKst = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), 3);
  return `${fmtYmdShort(ymd)} (${WEEKDAY.format(noonKst)})`;
}

/** epoch ms → 그날 00:00 KST 기준 초. */
export function kstSecOf(ms: number): number {
  return (((Math.floor(ms / 1000) + 9 * 3600) % 86_400) + 86_400) % 86_400;
}

/** epoch ms → KST 「HH:MM:SS」. */
export function kstClock(ms: number): string {
  const s = kstSecOf(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

// ---------------------------------------------------------------------------
// 스파크라인 (D-12 — viewBox `0 0 {sparkWidthOf(step_s)} 100` 기준 좌표)
// ---------------------------------------------------------------------------

/** viewBox 폭 = 09:00~15:30 의 coarse 칸 수(10초 → 2,340). 모든 행이 같은 x 축이다. */
export function sparkWidthOf(stepS: number): number {
  return (SPARK_SEC_END - SPARK_SEC_START) / (stepS > 0 ? stepS : 10);
}

/** y 상한 = max(그 행 최대, 20억). */
export function sparkYMaxOf(summary: Pick<LimitupGridSummaryRow, 'q_krw' | 'q_max_krw'>): number {
  let max = summary.q_max_krw ?? 0;
  for (const v of summary.q_krw) if (v != null && v > max) max = v;
  return Math.max(max, SPARK_Y_FLOOR_KRW);
}

/** 금액 → viewBox y(위 0 · 아래 100). */
export function sparkYOf(krw: number, yMax: number): number {
  return Math.round((100 - (krw / yMax) * 100) * 100) / 100;
}

/** epoch ms → viewBox x(coarse 칸 단위 · 09:00~15:30 으로 자른다). */
export function sparkXOf(ms: number, stepS: number): number {
  const sec = Math.min(Math.max(kstSecOf(ms), SPARK_SEC_START), SPARK_SEC_END);
  return (sec - SPARK_SEC_START) / (stepS > 0 ? stepS : 10);
}

/** epoch ms → 슬롯 폭 대비 % (HTML 오버레이 깨짐 ● 의 `left`). */
export function sparkPctOf(ms: number): number {
  const sec = Math.min(Math.max(kstSecOf(ms), SPARK_SEC_START), SPARK_SEC_END);
  return ((sec - SPARK_SEC_START) / (SPARK_SEC_END - SPARK_SEC_START)) * 100;
}

/**
 * 잔량 곡선 경로(`M`/`L`) — x = 09:00 기준 coarse 인덱스(`sec0` 가 늦으면 민다), y = `sparkYOf`.
 * `null` 은 선을 끊고 다음 값에서 `M` 으로 다시 시작한다(gh-trade 는 0 으로 채우지만 결측을 0 원으로 그리지 않는다).
 */
export function sparkPathOf(
  summary: Pick<LimitupGridSummaryRow, 'q_krw' | 'sec0' | 'step_s'>,
  yMax: number,
): string {
  const step = summary.step_s > 0 ? summary.step_s : 10;
  const x0 = (summary.sec0 - SPARK_SEC_START) / step;
  let d = '';
  let pen = false;
  summary.q_krw.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x0 + i} ${sparkYOf(v, yMax)}`;
    pen = true;
  });
  return d;
}
