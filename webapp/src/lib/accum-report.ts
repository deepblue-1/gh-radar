/**
 * accum-report — 매집감지 보고서(`/analytics/accum`) 표시 변환 (Phase 34 · UI-SPEC A11 「표시 변환 규칙」).
 *
 * - 행 키는 export 열 이름 그대로(snake_case · `@gh-radar/shared` AccumReportRow). 원 → 억 · % · 시각 변환은 여기와
 *   `lib/teamflow-report.ts` 의 포매터만 한다 — **억 · % · 시각 포매터를 새로 만들지 않는다**(D-13 · fmtEok · toneOf 재사용).
 * - 라이브 작업대(`lib/accum-list.ts` `sortAccum` · shared `ACCUM_STATE_LABELS`)를 import 하지 않는다 — 행 모양이 다르고
 *   정렬 규칙(매집중/매도중을 가른다 · D-08)과 상태 3 라벨(「종료」 · D-11)이 다르다.
 * - kind 16(라이브)과 join 하지 않는다 — 이 보고서의 이력 정본은 `limitup_accum_flow` 다(D-22).
 * - 당일 축(quick-261026-01h · 스케치 018 · 인박스 261025-accum-day-axis) — `dayAxisOf(rows)` 가 true 인 날짜만 목록 · KPI · 상세 KPI 의
 *   큰 숫자가 당일 순매수(pos_day_buy − pos_day_sell)이고 누적(pos_net)은 보조다. 함수마다 `dayAxis` 인자(기본 false)로 가르고,
 *   인자가 없으면 지금 결과와 바이트 동일하다(재생성 전 날짜는 오늘 화면 그대로).
 */

import type { AccumDetailRow, AccumReportPayload, AccumReportRow } from '@gh-radar/shared';

import { fmtYmdShort, kstClock } from './limitup-report';
import { fmtEok, fmtPnl, fmtRate, isNum, kstHm, pnlOf, toneOf, type TeamflowTone } from './teamflow-report';

/**
 * 밤 적재 시각 「HH:MM」 — 빈 상태 2곳 · 머리 출처 칩 · 상세 출처 칩이 모두 이 값 하나를 읽는다.
 * D-24 ① 10분 미루기(운반 20:20 → 20:30 · 적재 20:30 → 20:40)가 실행되면 **여기 하나만** 「20:40」 으로 바꾼다.
 */
export const ACCUM_LOAD_HM = '20:30';

const DASH = '—';

/** 배열 아닌 객체(null 제외) — payload 모양 확인(34 WR-05). */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** state 정렬 순위 — 1 매집중 → 2 매도중 → 3 종료 → 그 밖(null 포함) 맨 뒤. */
function stateRank(state: number | null): number {
  return state === 1 || state === 2 || state === 3 ? state : 4;
}

// ---------------------------------------------------------------------------
// 당일 축 (quick-261026-01h · 스케치 018 · D2 · D3)
// ---------------------------------------------------------------------------

/** 당일 순매수(원) = pos_day_buy_krw − pos_day_sell_krw · 둘 중 하나라도 수가 아니면 null(옛 행 · 이 열 추가 전 적재). */
export function todayNetOf(row: Pick<AccumReportRow, 'pos_day_buy_krw' | 'pos_day_sell_krw'>): number | null {
  const buy = row.pos_day_buy_krw;
  const sell = row.pos_day_sell_krw;
  return isNum(buy) && isNum(sell) ? buy - sell : null;
}

/** 전날 서버 당일 매수 · 매도 · 순매수(원) — 목록 RPC 의 prev 2키(20261026010000). */
export interface AccumPrevDay {
  buyKrw: number;
  sellKrw: number;
  netKrw: number;
}

/** 전날 요약 — prev_pos_day_buy_krw · prev_pos_day_sell_krw 둘 다 수일 때만, 아니면 null. */
export function prevDayOf(
  row: Pick<AccumReportRow, 'prev_pos_day_buy_krw' | 'prev_pos_day_sell_krw'>,
): AccumPrevDay | null {
  const buy = row.prev_pos_day_buy_krw;
  const sell = row.prev_pos_day_sell_krw;
  if (!isNum(buy) || !isNum(sell)) return null;
  return { buyKrw: buy, sellKrw: sell, netKrw: buy - sell };
}

/**
 * 당일 축 날짜인가(D3) — **날짜 단위** 판정: 한 행이라도 `todayNetOf` 가 수이고 `th_recent_pieces > 0` 이면 true.
 * - pos_day 가 날짜 전체에 없으면(gh-trade 재생성 전 이력) false → 목록 · KPI · 상세가 오늘 모양 그대로다.
 * - th_recent_pieces 를 함께 보는 이유: 옛 서버 export 행은 당일 축 4열이 0 이라, 재생성 전 새 export 날짜가 「0.0억」 으로
 *   도배되는 것을 막는다(0 = 옛 서버 — shared AccumReportRow 주석).
 */
export function dayAxisOf(
  rows: readonly Pick<AccumReportRow, 'pos_day_buy_krw' | 'pos_day_sell_krw' | 'th_recent_pieces'>[],
): boolean {
  return rows.some((r) => todayNetOf(r) !== null && isNum(r.th_recent_pieces) && r.th_recent_pieces > 0);
}

/**
 * 당일 평단 열이 실린 날짜인가(quick-261026-0ty) — **날짜 단위** 판정: 한 행이라도 `pos_day_avg_px` 가 수(0 포함)면 true.
 * - 그날 전체가 null 이면 재생성 전(또는 20261026120000 적용 전 적재)이라 01h 폴백(「누적 평단」 표기)을 쓴다.
 * - 0 은 값이다(당일 매수 없음 → 그 행 「당일 평단」 은 「—」).
 */
export function hasDayAvgOf(rows: readonly Pick<AccumReportRow, 'pos_day_avg_px'>[]): boolean {
  return rows.some((r) => isNum(r.pos_day_avg_px));
}

/** null(isNum 아님) 맨 뒤 · 큰 순 비교 — 같으면 0. */
function descNullsLast(a: number | null | undefined, b: number | null | undefined): number {
  const an = isNum(a);
  const bn = isNum(b);
  if (an !== bn) return an ? -1 : 1;
  if (an && bn && a !== b) return b - a;
  return 0;
}

/**
 * 목록 정렬(D-08): state 1 → 2 → 3 · 그 안 `pos_net_krw` 내림차순(null 맨 뒤) · 같으면 isin 오름차순.
 * 당일 축(`dayAxis`)이면 state 다음에 당일 순매수(`todayNetOf`) 큰 순(null 뒤)을 먼저 본다 — 그다음 pos_net · isin.
 * 원본 배열을 바꾸지 않는다.
 */
export function sortAccumRows<R extends AccumReportRow>(rows: readonly R[], opts: { dayAxis?: boolean } = {}): R[] {
  const dayAxis = opts.dayAxis === true;
  return [...rows].sort((a, b) => {
    const s = stateRank(a.state) - stateRank(b.state);
    if (s !== 0) return s;
    if (dayAxis) {
      const d = descNullsLast(todayNetOf(a), todayNetOf(b));
      if (d !== 0) return d;
    }
    const an = isNum(a.pos_net_krw);
    const bn = isNum(b.pos_net_krw);
    if (an !== bn) return an ? -1 : 1;
    if (an && bn && a.pos_net_krw !== b.pos_net_krw) return b.pos_net_krw! - a.pos_net_krw!;
    return a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0;
  });
}

/** 상태 라벨(D-11 자체 라벨) — 1 「매집중」 · 2 「매도중」 · 3 「종료」 · 그 밖 「—」. */
export function stateLabelOf(state: number | null | undefined): string {
  if (state === 1) return '매집중';
  if (state === 2) return '매도중';
  if (state === 3) return '종료';
  return DASH;
}

const PX_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 가격(원) → 「205,500」 · null/NaN/0 이하 「—」. */
export function fmtPx(n: number | null | undefined): string {
  if (!isNum(n) || n <= 0) return DASH;
  return PX_FMT.format(Math.round(n));
}

export interface AccumDetailKpi {
  label: string;
  text: string;
  /** 부호 색이 필요한 항목만(등록 후 순매수) */
  tone?: TeamflowTone;
}

/**
 * 상세 KPI 줄 4항목(D-19 · 마지막 사이클 = 평평한 열 · 임계 없음):
 * 「등록가」 · 「평단」(fmtPx) · 「등록 후 순매수」(±억 1자리 · 부호 색) · 「최고 순매수」(±억 1자리).
 * 당일 축(`dayAxis`)이면 5항목 — 「당일 순매수」(부호 색) · 「누적 순매수」(pos_net · 부호 색) · 「누적 평단」(pos_avg_px) ·
 * 「등록가」 · 「최고 순매수」(quick-261026-01h).
 * 당일 축이고 그날 당일 평단 열이 실렸으면(`dayAvg` = hasDayAvgOf · quick-261026-0ty) 6항목 — 「당일 순매수」 뒤에
 * 「당일 평단」(pos_day_avg_px · 0 · null 이면 「—」 · 누적 평단으로 채우지 않는다)을 넣는다.
 */
export function detailKpisOf(row: AccumReportRow, dayAxis = false, dayAvg = false): AccumDetailKpi[] {
  if (dayAxis) {
    const today = todayNetOf(row);
    return [
      { label: '당일 순매수', text: fmtEok(today, { signed: true }), tone: toneOf(today) },
      ...(dayAvg ? [{ label: '당일 평단', text: fmtPx(row.pos_day_avg_px) }] : []),
      { label: '누적 순매수', text: fmtEok(row.pos_net_krw, { signed: true }), tone: toneOf(row.pos_net_krw) },
      { label: '누적 평단', text: fmtPx(row.pos_avg_px) },
      { label: '등록가', text: fmtPx(row.pos_reg_px) },
      { label: '최고 순매수', text: fmtEok(row.pos_peak_net_krw, { signed: true }) },
    ];
  }
  return [
    { label: '등록가', text: fmtPx(row.pos_reg_px) },
    { label: '평단', text: fmtPx(row.pos_avg_px) },
    { label: '등록 후 순매수', text: fmtEok(row.pos_net_krw, { signed: true }), tone: toneOf(row.pos_net_krw) },
    { label: '최고 순매수', text: fmtEok(row.pos_peak_net_krw, { signed: true }) },
  ];
}

// ---------------------------------------------------------------------------
// KPI 4칸 (D-09 · UI-SPEC A2)
// ---------------------------------------------------------------------------

export interface AccumKpis {
  /** 등록 종목 = 행 수 */
  total: number;
  /** 보조 「이월 n」 = carry_days > 0 행 수 */
  carry: number;
  /** 장 마감 보유 = state ∈ {1, 2} 행 수 */
  held: number;
  /** 보조 「매집중 a」 = state 1 */
  accumulating: number;
  /** 보조 「매도중 b」 = state 2 */
  selling: number;
  /** 종료 = state 3 행 수 */
  ended: number;
  /** 보조 「청산 · 매집 종료 · 탈락 · 만료」 = 종료 행의 end_reason 1 · 4 · 2 · 3 */
  liquidated: number;
  terminated: number;
  dropped: number;
  expired: number;
  /** 팀 순매수 합(등록 후 · 원) = 전 행 pos_net_krw 합(종료 행 포함 · null 제외) — 수가 하나도 없으면 null */
  posSum: number | null;
  /** 당일 순매수 합(원) = 전 행 `todayNetOf` 합(null 제외) — 수가 하나도 없으면 null(quick-261026-01h · 당일 축 KPI) */
  daySum: number | null;
}

/** KPI 4칸 집계(UI-SPEC A2 표 그대로). 빈 배열 = 전부 0 · posSum null. */
export function accumKpisOf(rows: readonly AccumReportRow[]): AccumKpis {
  const k: AccumKpis = {
    total: rows.length,
    carry: 0,
    held: 0,
    accumulating: 0,
    selling: 0,
    ended: 0,
    liquidated: 0,
    terminated: 0,
    dropped: 0,
    expired: 0,
    posSum: null,
    daySum: null,
  };
  for (const r of rows) {
    if (isNum(r.carry_days) && r.carry_days > 0) k.carry += 1;
    if (r.state === 1) k.accumulating += 1;
    else if (r.state === 2) k.selling += 1;
    else if (r.state === 3) {
      k.ended += 1;
      if (r.end_reason === 1) k.liquidated += 1;
      else if (r.end_reason === 2) k.dropped += 1;
      else if (r.end_reason === 3) k.expired += 1;
      else if (r.end_reason === 4) k.terminated += 1;
    }
    if (isNum(r.pos_net_krw)) k.posSum = (k.posSum ?? 0) + r.pos_net_krw;
    const today = todayNetOf(r);
    if (today !== null) k.daySum = (k.daySum ?? 0) + today;
  }
  k.held = k.accumulating + k.selling;
  return k;
}

// ---------------------------------------------------------------------------
// 목록 행 변환 (D-08 · D-10 ~ D-13 · UI-SPEC A3 · 「표시 변환 규칙」)
// ---------------------------------------------------------------------------

/** 사유 2(이월 탈락) 줄 `title` — 「복원 안 됨」 이 무엇인지 설명한다(D-11). */
export const ACCUM_DROP_TITLE = '서버 재기동 때 이월 파일에 없어 복원되지 않은 종목이에요';

/** 종료 사유 라벨 — 1 「청산」 · 2 「이월 탈락(복원 안 됨)」 · 3 「이월 만료」 · 4 「매집 종료」 · 그 밖(0 · null) null. */
export function endReasonLabelOf(endReason: number | null | undefined): string | null {
  if (endReason === 1) return '청산';
  if (endReason === 2) return '이월 탈락(복원 안 됨)';
  if (endReason === 3) return '이월 만료';
  if (endReason === 4) return '매집 종료';
  return null;
}

/** 종료 시각 KST 「HH:MM」 · 없으면 null. */
function endHmOf(row: Pick<AccumReportRow, 'end_time_ms'>): string | null {
  return isNum(row.end_time_ms) ? kstHm(row.end_time_ms) : null;
}

/** 종료 행(state 3)의 사유 줄 「{사유} · HH:MM」(end_time_ms null 이면 사유만) · 그 밖 null. */
export function reasonLineOf(row: Pick<AccumReportRow, 'state' | 'end_reason' | 'end_time_ms'>): string | null {
  if (row.state !== 3) return null;
  const label = endReasonLabelOf(row.end_reason);
  if (label === null) return null;
  const hm = endHmOf(row);
  return hm === null ? label : `${label} · ${hm}`;
}

/** 흐린 행(D-11) — 종료 이월 탈락 · 만료만. 장중 청산(1)은 정상 농도. */
export function isDimRow(row: Pick<AccumReportRow, 'state' | 'end_reason'>): boolean {
  return row.state === 3 && (row.end_reason === 2 || row.end_reason === 3);
}

export interface AccumTag {
  /** limit = 상한가 마감 · rate = 미도달 등락률 · none = 등락률 없음 */
  kind: 'limit' | 'rate' | 'none';
  text: string;
  /** xl 보조줄 「고가 +NN.N%」 — 상한가가 아니고 high_rate 가 수일 때만 */
  sub: string | null;
}

/**
 * 결과 태그(D-12) — `upper` · `last_px` 둘 다 수이고 `last_px >= upper` 면 「상한가 +NN.N%」(시각 없음 · last_rate 없으면
 * 「상한가」) · 아니면 「+NN.N%」 / 「−N.N%」 · last_rate 없음 「—」.
 */
export function accumTagOf(
  row: Pick<AccumReportRow, 'upper' | 'last_px' | 'last_rate' | 'high_rate'>,
): AccumTag {
  if (isNum(row.upper) && isNum(row.last_px) && row.last_px >= row.upper) {
    return { kind: 'limit', text: isNum(row.last_rate) ? `상한가 ${fmtRate(row.last_rate)}` : '상한가', sub: null };
  }
  const sub = isNum(row.high_rate) ? `고가 ${fmtRate(row.high_rate)}` : null;
  if (!isNum(row.last_rate)) return { kind: 'none', text: DASH, sub };
  return { kind: 'rate', text: fmtRate(row.last_rate), sub };
}

const YMD_RE = /^\d{8}$/;

/** 이월 행 — `since_date` 가 8자리 숫자이고 그날(date)보다 앞. 결측("" · "None" · null)은 이월 아님. */
export function isCarry(row: Pick<AccumReportRow, 'since_date' | 'date'>): boolean {
  return typeof row.since_date === 'string' && YMD_RE.test(row.since_date) && row.since_date < row.date;
}

/** 오늘 등록 — `since_date === date`. */
export function isTodayReg(row: Pick<AccumReportRow, 'since_date' | 'date'>): boolean {
  return row.since_date === row.date;
}

/** 등록 칸 1줄 — 오늘 등록 「HH:MM」(reg_time_ms 없으면 「—」) · 이월 「MM/DD 등록」 · since 결측 「—」. */
function regLineOf(row: AccumReportRow): string {
  if (isTodayReg(row)) return isNum(row.reg_time_ms) ? kstHm(row.reg_time_ms) : DASH;
  if (isCarry(row)) return `${fmtYmdShort(row.since_date!)} 등록`;
  return DASH;
}

const END_WORD: Record<number, string> = { 1: '청산', 2: '탈락', 3: '만료', 4: '종료' };

/**
 * 등록 · 종료 칸(xl · A3) — [1줄, 2줄].
 * 2줄 = end_reason 1 「HH:MM 청산」 · 2 「HH:MM 탈락」 · 3 「HH:MM 만료」 · 4 「HH:MM 종료」(시각 없으면 단어만) · 0 이고 이월 「오늘 이월」 · 그 밖 「장 마감까지」.
 */
export function regCellOf(row: AccumReportRow): [string, string] {
  const word = row.end_reason === null ? undefined : END_WORD[row.end_reason];
  let line2: string;
  if (word !== undefined) {
    const hm = endHmOf(row);
    line2 = hm === null ? word : `${hm} ${word}`;
  } else {
    line2 = isCarry(row) ? '오늘 이월' : '장 마감까지';
  }
  return [regLineOf(row), line2];
}

export interface AccumMetaItem {
  /** 앞 라벨(--muted-fg) — null 이면 값만(「10/13 등록 → 06:00」) */
  label: string | null;
  value: string;
  /** 금액 항목만 — 부호 색 · `none` = 값 없음(「—」 --faint) */
  tone?: TeamflowTone | 'none';
}

const amountTone = (won: number | null): TeamflowTone | 'none' => (isNum(won) ? toneOf(won) : 'none');

/**
 * 폰(< xl) 3줄 메타 — 「팀 순매수 {pos}」 · 「하루 {day}」 · 「등록 HH:MM」 또는 「MM/DD 등록」 + 종료 있으면 「 → HH:MM」.
 * xl 에서는 앞 두 항목이 팀 순매수 · 하루 순매수 칸으로 풀린다(라벨 sr-only).
 * 당일 축(`dayAxis`)이면 4항목 「당일 {today}」 · 「누적 {pos}」 · 「하루 {day}」 · 등록(quick-261026-01h).
 */
export function metaLineOf(row: AccumReportRow, dayAxis = false): AccumMetaItem[] {
  const end = endHmOf(row);
  const tail = end === null ? '' : ` → ${end}`;
  const reg: AccumMetaItem = isCarry(row)
    ? { label: null, value: `${fmtYmdShort(row.since_date!)} 등록${tail}` }
    : { label: '등록', value: `${regLineOf(row)}${tail}` };
  const day: AccumMetaItem = {
    label: '하루',
    value: fmtEok(row.day_net_krw, { signed: true }),
    tone: amountTone(row.day_net_krw),
  };
  if (dayAxis) {
    const today = todayNetOf(row);
    return [
      { label: '당일', value: fmtEok(today, { signed: true }), tone: amountTone(today) },
      { label: '누적', value: fmtEok(row.pos_net_krw, { signed: true }), tone: amountTone(row.pos_net_krw) },
      day,
      reg,
    ];
  }
  return [
    { label: '팀 순매수', value: fmtEok(row.pos_net_krw, { signed: true }), tone: amountTone(row.pos_net_krw) },
    day,
    reg,
  ];
}

/**
 * 행 sr 설명 1문장(UI-SPEC A3) — 「{상태}{, 이월 D+n}{, 사이클 n}{, {사유} HH:MM}, 결과 {태그}{, 고가 +NN.N%},
 * 팀 순매수 등록 후 {pos}, 하루 순매수 {day}{, 팀 당일 손익 {±억(±%)}}, 등록 {HH:MM | MM/DD}{, 종료 HH:MM}」. 결측에 throw 없음(「—」).
 * 끝 「종료 HH:MM」 은 사유 절이 시각을 이미 말했으면 생략한다(IN-02 — 같은 시각을 두 번 읽지 않게).
 * 당일 축(`dayAxis`)이면 금액 절이 「당일 순매수 {today}, 누적 {pos}, 하루 순매수 {day}」 다(quick-261026-01h).
 */
export function accumRowDescriptionOf(row: AccumReportRow, dayAxis = false): string {
  const parts = [stateLabelOf(row.state)];
  if (isNum(row.carry_days) && row.carry_days > 0) parts.push(`이월 D+${row.carry_days}`);
  if (isNum(row.cycle) && row.cycle > 1) parts.push(`사이클 ${row.cycle}`);
  const end = endHmOf(row);
  let endSaid = false;
  if (row.state === 3) {
    const label = endReasonLabelOf(row.end_reason);
    if (label !== null) {
      parts.push(end === null ? label : `${label} ${end}`);
      endSaid = end !== null;
    }
  }
  const tag = accumTagOf(row);
  parts.push(`결과 ${tag.text}`);
  if (tag.sub !== null) parts.push(tag.sub);
  if (dayAxis) {
    parts.push(
      `당일 순매수 ${fmtEok(todayNetOf(row), { signed: true })}`,
      `누적 ${fmtEok(row.pos_net_krw, { signed: true })}`,
      `하루 순매수 ${fmtEok(row.day_net_krw, { signed: true })}`,
    );
  } else {
    parts.push(
      `팀 순매수 등록 후 ${fmtEok(row.pos_net_krw, { signed: true })}`,
      `하루 순매수 ${fmtEok(row.day_net_krw, { signed: true })}`,
    );
  }
  const pnl = pnlOf(row);
  if (pnl !== null) parts.push(`팀 당일 손익 ${fmtPnl(pnl)}`);
  parts.push(`등록 ${isCarry(row) ? fmtYmdShort(row.since_date!) : regLineOf(row)}`);
  if (end !== null && !endSaid) parts.push(`종료 ${end}`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// 사이클 표 (D-20 · UI-SPEC A7 · CR-01)
// ---------------------------------------------------------------------------

export interface AccumCycleRowView {
  /** 나온 순서 1-based — `cycle` 값을 쓰지 않는다(CR-01 · 차트 등록 라벨 「· k」 와 같은 번호) */
  k: number;
  reg: string;
  end: string;
  /** 종료 null = 장 마감까지 살아 있음(--muted-fg) */
  endIsOpen: boolean;
  status: string;
  regPx: string;
  avgPx: string;
  net: string;
  netTone: TeamflowTone;
  peak: string;
  qty: string;
}

const QTY_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 수량 한쪽 — 정수 쉼표 · null/NaN 「—」. */
const fmtQtyOrDash = (n: number | null | undefined): string => (isNum(n) ? QTY_FMT.format(n) : DASH);

/**
 * 사이클 표 행(D-20 · UI-SPEC A7 칸 규칙) — `payload.cycles` 나온 순서 그대로(cycles 키 결측 · payload null = 빈 배열).
 * - k = 배열 순서 1-based — `cycle` 값을 쓰지 않는다(CR-01 · 값이 중복 · 비연속일 수 있다).
 * - 등록 「HH:MM:SS」 · 사이클 since_date 가 8자리이고 그날(date)과 다르면 「MM/DD HH:MM:SS」 · reg null 「—」.
 * - 종료 「HH:MM:SS」 · null 이면 「장 마감까지」(endIsOpen) · 상태 = end_reason > 0 이면 사유 아니면 매집중/매도중.
 * - 등록가 · 평단 = fmtPx · 순매수(부호 색) · 최고 순매수 = ±억 1자리 · 수량 「{buy} / {sell}」(둘 다 null 이면 「—」).
 */
export function cycleRowsOf(row: AccumDetailRow): AccumCycleRowView[] {
  // 배열이 아니거나 객체가 아닌 항목은 버린다(34 WR-05 — payload 는 검증 없는 export 원문)
  const raw: unknown = row.payload?.cycles;
  const cycles = Array.isArray(raw) ? (raw.filter(isObj) as unknown as AccumReportPayload['cycles']) : [];
  return cycles.map((c, i) => {
    const since = c.since_date;
    const datePrefix =
      typeof since === 'string' && YMD_RE.test(since) && since !== row.date ? `${fmtYmdShort(since)} ` : '';
    const endIsOpen = !isNum(c.end_time_ms);
    const qty =
      !isNum(c.pos_buy_qty) && !isNum(c.pos_sell_qty)
        ? DASH
        : `${fmtQtyOrDash(c.pos_buy_qty)} / ${fmtQtyOrDash(c.pos_sell_qty)}`;
    return {
      k: i + 1,
      reg: isNum(c.reg_time_ms) ? `${datePrefix}${kstClock(c.reg_time_ms)}` : DASH,
      end: endIsOpen ? '장 마감까지' : kstClock(c.end_time_ms!),
      endIsOpen,
      status: (c.end_reason > 0 ? endReasonLabelOf(c.end_reason) : null) ?? stateLabelOf(c.state),
      regPx: fmtPx(c.pos_reg_px),
      avgPx: fmtPx(c.pos_avg_px),
      net: fmtEok(c.pos_net_krw, { signed: true }),
      netTone: toneOf(c.pos_net_krw),
      peak: fmtEok(c.pos_peak_net_krw, { signed: true }),
      qty,
    };
  });
}

// ---------------------------------------------------------------------------
// payload 모양 확인 (34 WR-05)
// ---------------------------------------------------------------------------

const ORDER_COLS = ['t_ms', 'side', 'qty', 'val', 'px', 'pieces', 'first'] as const;

/**
 * 차트가 가드 없이 읽는 payload 모양 확인(34 WR-05) — payload 는 저장소 경계 밖(gh-trade export) 원문이고 server · DB 가
 * 검증하지 않는다(D-05). price(t0_ms 유한 수 · idx · px 배열) · orders 7열 배열 · buckets 객체 배열 · day_cum_net(t_ms ·
 * net_krw 배열) · cycles 객체 배열 — 하나라도 어긋나면 null → 상세는 「그날 체결 자료 없음」 경로(키 하나 빠진 행이 렌더 예외로
 * 페이지 전체를 바꾸지 않게). pnl 은 `pnlOf` 가 따로 방어한다.
 */
export function payloadOf(row: Pick<AccumDetailRow, 'payload'>): AccumReportPayload | null {
  const p: unknown = row.payload;
  if (!isObj(p)) return null;
  const { price, orders, buckets, day_cum_net: cum, cycles } = p;
  if (!isObj(price) || !isNum(price.t0_ms as number) || !Array.isArray(price.idx) || !Array.isArray(price.px)) return null;
  if (!isObj(orders) || !ORDER_COLS.every((k) => Array.isArray(orders[k]))) return null;
  if (!Array.isArray(buckets) || !buckets.every(isObj)) return null;
  if (!isObj(cum) || !Array.isArray(cum.t_ms) || !Array.isArray(cum.net_krw)) return null;
  if (!Array.isArray(cycles) || !cycles.every(isObj)) return null;
  return row.payload;
}

// ---------------------------------------------------------------------------
// 판정 기준 (D-22 · UI-SPEC A9)
// ---------------------------------------------------------------------------

/** 판정 기준 본문 1 조각 — `num` 은 수 한 덩어리(mono --fg-2 · 줄바꿈 안 함). */
export interface AccumRulePart {
  text: string;
  num?: boolean;
}

type ThresholdCols = Pick<
  AccumReportRow,
  'th_net_krw' | 'th_same' | 'th_mcap_krw' | 'mcap_krw' | 'th_recent_pieces' | 'th_recent_sec'
>;

/** 원 → 억 정수 쉼표 「5,000억」. */
const eokIntOf = (won: number): string => `${QTY_FMT.format(Math.round(won / 1e8))}억`;

/**
 * 판정 기준 본문 1(UI-SPEC A9) 조각 — 「이 종목의 등록 임계 — 순매수 {1.0억} 이상 · 한 가격 {30조각} 이상 · 시총 {5,000억} 이하
 * (현재 시총 {3,144억})」. `th_mcap_krw` 0 = 「시총 상한 없음」 · 값 null/NaN 은 그 항목 「—」(뒤 「이상 · 이하」 없이).
 * 새 서버 행(`th_recent_pieces > 0` · gh-trade Phase 39 · quick-261026-01h)은 앞 두 항목이 「당일 순매수 {1.0억} 이상 · 최근 {60초}
 * 팀 매수 조각 {30개} 이상」 으로 바뀐다(창 길이가 수가 아니거나 0 이하면 「—」). 시총 · 현재 시총 조각은 공유.
 */
export function thresholdPartsOf(row: ThresholdCols): AccumRulePart[] {
  const out: AccumRulePart[] = [];
  const text = (t: string) => {
    const last = out[out.length - 1];
    if (last !== undefined && !last.num) last.text += t;
    else out.push({ text: t });
  };
  const num = (t: string) => out.push({ text: t, num: true });

  const pieces = row.th_recent_pieces;
  const recent = isNum(pieces) && pieces > 0;
  text(recent ? '이 종목의 등록 임계 — 당일 순매수 ' : '이 종목의 등록 임계 — 순매수 ');
  if (isNum(row.th_net_krw)) {
    num(fmtEok(row.th_net_krw));
    text(' 이상');
  } else text(DASH);
  if (recent) {
    text(' · 최근 ');
    const sec = row.th_recent_sec;
    if (isNum(sec) && sec > 0) num(`${QTY_FMT.format(sec)}초`);
    else text(DASH);
    text(' 팀 매수 조각 ');
    num(`${QTY_FMT.format(pieces)}개`);
    text(' 이상');
  } else {
    text(' · 한 가격 ');
    if (isNum(row.th_same)) {
      num(`${QTY_FMT.format(row.th_same)}조각`);
      text(' 이상');
    } else text(DASH);
  }
  text(' · 시총 ');
  if (row.th_mcap_krw === 0) text('상한 없음');
  else if (isNum(row.th_mcap_krw)) {
    num(eokIntOf(row.th_mcap_krw));
    text(' 이하');
  } else text(DASH);
  text(' (현재 시총 ');
  if (isNum(row.mcap_krw)) num(eokIntOf(row.mcap_krw));
  else text(DASH);
  text(')');
  return out;
}

/**
 * 판정 기준 본문 2 ~ 5(D-22 고정 순서 · UI-SPEC A9 Copywriting 글자 그대로 — 고치지 않는다). 본문 2 만 quick-261025-fac(스케치 017 B —
 * 누적 판 두 선)로 개정. 상수라 pos_net 없는 옛 행에도 같은 글이 뜬다 — gh-trade 가 10/01~10/23 accum_flow 를 재생성해 키가 생긴다.
 * 본문 4(원 문턱)는 quick-261026-01h 에서 500만원(gh-trade D-20 · 2026-10-25 · 그 전 export 는 1천만원 — 재생성으로 바뀐다).
 */
export const ACCUM_RULE_LINES: readonly string[] = [
  '등록 후 순매수(pos)는 KYOBO119 서버 상태기 값이에요 — 등록 이후 누적, 우리 서버 체결 제외, 마지막 사이클 기준. 목록 · KPI · 사이클 표가 이 값이에요.',
  '하루 순매수(day)는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 누적 판의 얇은 회색 계단이 이 값이고, 굵은 보라 선은 포지션 순매수(등록 후 · 이월 포함 · 우리 체결 제외 — 목록 · KPI 와 같은 값)예요. 그래서 두 값은 부호까지 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.',
  '원은 500만원 이상 팀 주문 + 사이클마다 첫 팀 매수(금액 무관 · 「팀매수 시작」)예요. 누적 계단은 전체 팀 주문이에요.',
  '종료 사유 — 청산(순매수 1억 미만 — 서버는 계속 추적하고 다시 1억 이상이면 같은 사이클로 재등장) / 매집 종료(청산 뒤 순매수가 사이클 최고의 −30% 이하 · 우리 체결 제외 — 다음 등록은 새 사이클) / 이월 탈락(서버 재기동 때 복원 안 됨) / 이월 만료(이월 10일 초과).',
];

/**
 * 당일 축 날짜용 판정 기준 본문 2 ~ 5(quick-261026-01h · 스케치 018) — 본문 1 · 2 만 당일 축용으로 다시 쓰고 3 · 4 는
 * `ACCUM_RULE_LINES` 와 공유한다(원 문턱 · 종료 사유). 목록 · KPI 가 당일 순매수를 큰 숫자로 보이는 날짜에서만 쓴다.
 */
export const ACCUM_RULE_LINES_DAY: readonly string[] = [
  '당일 순매수는 KYOBO119 서버 상태기 값이에요 — 그날 06:00(또는 새 사이클 시작)부터 팀 매수 − 매도, 우리 서버 체결 제외. 목록 · KPI 의 큰 숫자가 이 값이에요. 누적 순매수(pos)는 등록 이후 사이클 누적(이월 포함 · 우리 체결 제외)이고 목록 아랫줄 · 사이클 표 · 누적 판 왼쪽 회색 축 선이 이 값이에요. 당일 매수가 없으면 작업대의 당일 평단은 「—」(누적으로 채우지 않아요).',
  '하루 순매수(day)는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 누적 판 굵은 보라 계단(오른쪽 축)이 이 값의 흐름이라 끝값이 목록의 당일 순매수와 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.',
  ACCUM_RULE_LINES[2]!,
  ACCUM_RULE_LINES[3]!,
];

/** 판정 기준 출처 줄(링크 없음). */
export const ACCUM_RULE_SOURCE = '규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13';
