/**
 * Phase 34 Plan 09 — 매집감지 보고서 e2e 픽스처 (accum-report.spec · 34-10 폭 백스톱 공용).
 *
 * 원천 = 워커 픽스처 실측 20261014 6행(`workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz`)을
 * `@/test-fixtures/accum-export` 로 읽는다(RTL · lib 단위와 같은 원천 — 웹 쪽 사본 없음).
 * - 20261014 = 실측 6행 평평한 열 그대로(목록) · 상세 = 그 행의 평평한 열 + payload 그대로.
 * - 20261013 = 같은 6행의 `date` 만 바꾼 **합성** 응답 — 날짜 알약 이동 확인용(그날 실측 아님).
 * - `ACCUM_WORST_ROW` = 폭 백스톱(34-10) 용 **합성** 최악값 행 — 15자 종목명 · 배지 「종료」+「이월 D+5」+「사이클 3」 ·
 *   사유 「이월 탈락(복원 안 됨) · 08:41」 · 결과 「상한가 +29.9%」 · pos −1,234.5억 · 평단 200,407 · 등록가 205,500.
 *   실재 종목명 · ISIN 이 아니다(종목명은 일부러 말이 안 되는 15자 · ISIN 은 KR79 합성 대역).
 * - 합성 다중 사이클 · 이월 상세 = `accumSyntheticDetail`(34-06) 재사용 — `synthetic` 옵션으로 바탕 실측 행의 상세를 갈아 끼운다.
 * - (34-10) `ACCUM_WORST_DETAIL` = 폭 백스톱 A6 용 **합성** 상세 — 사이클 3개(09:05~09:15 청산 · 09:20~09:30 청산 ·
 *   13:00 재등록 살아 있음 — cycle 값 1,1,2 · CR-01) · 가격 = 한선엔지니어링 실측 가격을 최대 1,234,500 으로 늘린 7자리.
 *   `ACCUM_WORST_DROP_DETAIL` = 같은 7자리 가격 + 06:00 이월 탈락 종료(종료 라벨 최악 「이월 탈락(복원 안 됨) 06:00」) 별도 행.
 *   둘 다 `ACCUM_BACKSTOP_DATE`(20261013) 목록에 `ACCUM_WORST_ROW` 와 함께 실린다(`accumReportFixture(d, { backstop })`).
 *   `accumKpiWorstFixture` = KPI 최악값(종료 32 = 청산 12 · 탈락 10 · 만료 10 · 팀 순매수 합 −1,234.5억) **합성** 목록.
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 공개 정보뿐.
 */

import type { AccumDetailRow, AccumReportCycle, AccumReportPayload, AccumReportRow } from '@gh-radar/shared';

import {
  ACCUM_DATE,
  CHEONIL,
  CJSEAFOOD_PREF,
  CXI,
  DONGYANG,
  HANSUN,
  NAMELESS,
  accumDetailRows,
  accumKstMs,
  accumListRows,
  accumSyntheticDetail,
  type AccumSyntheticDetailKind,
} from '@/test-fixtures/accum-export';

export { ACCUM_DATE, CHEONIL, CJSEAFOOD_PREF, CXI, DONGYANG, HANSUN, NAMELESS };

/** 행 있는 날짜(내림차순) — 최신 = 실측 날짜 · 20261013 은 합성(위 머리 주석). */
export const ACCUM_LATEST = ACCUM_DATE;
export const ACCUM_DATES: string[] = [ACCUM_DATE, '20261013'];

/** 합성 최악값 행의 15자 종목명 · ISIN(KR79 합성 대역). */
export const ACCUM_WORST_NAME = '합성종목이름열다섯글자테스트용';
export const ACCUM_WORST_ISIN = 'KR790000AC99';

/**
 * **합성 — 실측 아님.** 한선엔지니어링 실측 행의 평평한 열을 바탕으로 표시 칸만 최악값으로 덮어쓴 행.
 * 상한가 마감(last_px = upper) · last_rate 29.9 → 「상한가 +29.9%」 · 종료(state 3) · 이월 탈락(end_reason 2) 08:41 ·
 * 이월 D+5 · 사이클 3 · pos −1,234.5억(= −123,450,000,000 원) · 평단 200,407 · 등록가 205,500.
 */
function worstRowOf(date: string): AccumReportRow {
  const base = accumListRows().find((r) => r.isin === HANSUN)!;
  return {
    ...base,
    date,
    isin: ACCUM_WORST_ISIN,
    short_code: '0AC099',
    name: ACCUM_WORST_NAME,
    market: 'KOSDAQ',
    base: 158_200,
    upper: 205_500,
    last_px: 205_500,
    last_rate: 29.9,
    high_px: 205_500,
    high_rate: 29.9,
    state: 3,
    end_reason: 2,
    cycle: 3,
    carry_days: 5,
    since_date: '20261007',
    reg_time_ms: accumKstMs('20261007', '14:12:09'),
    end_time_ms: accumKstMs(date, '08:41:00'),
    pos_net_krw: -123_450_000_000,
    pos_avg_px: 200_407,
    pos_reg_px: 205_500,
    day_net_krw: -123_450_000_000,
  };
}

/** 합성 최악값 행(기본 날짜 = 20261014). */
export const ACCUM_WORST_ROW: AccumReportRow = worstRowOf(ACCUM_DATE);

export type AccumReportBody = { access: true; dates: string[]; date: string; rows: AccumReportRow[] };

/**
 * `GET /api/accum/report?d=` 응답 — `d` 없음(null) = 최신 · ACCUM_DATES 안 = 그 날짜(20261013 은 date 만 바꾼 합성) ·
 * 그 밖 = 행 없는 날(rows []). `worst` = 합성 최악값 행을 맨 앞에 더한다.
 */
export function accumReportFixture(
  d: string | null,
  opts: { worst?: boolean; backstop?: boolean } = {},
): AccumReportBody {
  const date = d ?? ACCUM_LATEST;
  if (!ACCUM_DATES.includes(date)) return { access: true, dates: ACCUM_DATES, date, rows: [] };
  const rows = accumListRows().map((r) => ({ ...r, date }));
  if (opts.backstop) {
    const extra = [worstRowOf(date), flatOf(worstDetailOf(date)), flatOf(worstDropDetailOf(date))];
    return { access: true, dates: ACCUM_DATES, date, rows: [...extra, ...rows] };
  }
  return { access: true, dates: ACCUM_DATES, date, rows: opts.worst ? [worstRowOf(date), ...rows] : rows };
}

/**
 * `GET /api/accum/report/{date}/{isin}` 응답 — 실측 상세(평평한 열 + payload) · 날짜는 요청 date 로 맞춘다 ·
 * 없는 isin 이면 `row: null`. `synthetic` 을 주면 그 합성 상세의 바탕 isin 을 합성 행으로 갈아 끼운다.
 * 합성 최악값 isin 은 한선엔지니어링 payload + 최악값 평평한 열(가격 · 주문 · 누적 실측 그대로).
 */
export function accumDetailFixtureOf(
  date: string,
  isin: string,
  opts: { synthetic?: AccumSyntheticDetailKind[] } = {},
): { access: true; row: AccumDetailRow | null } {
  for (const kind of opts.synthetic ?? []) {
    const s = accumSyntheticDetail(kind);
    if (s.isin === isin) return { access: true, row: { ...s, date } };
  }
  if (isin === ACCUM_WORST_DETAIL_ISIN) return { access: true, row: worstDetailOf(date) };
  if (isin === ACCUM_WORST_DROP_ISIN) return { access: true, row: worstDropDetailOf(date) };
  if (isin === ACCUM_WORST_ISIN) {
    const hansun = accumDetailRows().find((r) => r.isin === HANSUN)!;
    return { access: true, row: { ...worstRowOf(date), payload: hansun.payload } };
  }
  const row = accumDetailRows().find((r) => r.isin === isin);
  return { access: true, row: row === undefined ? null : { ...row, date } };
}

// ---------------------------------------------------------------------------
// 34-10 폭 백스톱 합성 상세 — 사이클 3개 · 짧은 사이클 · 7자리 가격 · 06:00 종료 (전부 합성 · 실측 아님)
// ---------------------------------------------------------------------------

/** 백스톱 목록 날짜 — 20261013(date 만 바꾼 합성 날짜 · 위 머리 주석). */
export const ACCUM_BACKSTOP_DATE = '20261013';
/** 합성 7자리 다중 사이클 상세 · 합성 06:00 이월 탈락 상세 ISIN(KR79 합성 대역 · AC99 다음 아래로). */
export const ACCUM_WORST_DETAIL_ISIN = 'KR790000AC98';
export const ACCUM_WORST_DROP_ISIN = 'KR790000AC97';
/** 7자리 가격 최댓값 — 가격 축 「1,234,500」 · 왼쪽 축 폭 60(34-06 priceAxisWidthOf). */
export const ACCUM_7DIGIT_MAX_PX = 1_234_500;

const DAY_MS = 86_400_000;

/** 사이클 한 항목(16키) — 기본 = 그날 등록 · 살아 있음 · pos_* 없음. */
function cycleOn(date: string, over: Partial<AccumReportCycle>): AccumReportCycle {
  return {
    cycle: 1,
    since_date: date,
    reg_time_ms: null,
    end_time_ms: null,
    end_reason: 0,
    carry_days: 0,
    state: 1,
    pos_buy_qty: null,
    pos_buy_krw: null,
    pos_sell_qty: null,
    pos_sell_krw: null,
    pos_net_krw: null,
    pos_avg_px: null,
    pos_peak_net_krw: null,
    pos_reg_px: null,
    our_excluded_qty: null,
    ...over,
  };
}

/**
 * 한선엔지니어링 실측 payload 를 7자리 가격(최대 1,234,500)으로 늘리고 시각을 `date` 로 옮긴 합성 payload.
 * 주문 금액(val · 원 반지름)과 누적 · 10분 막대 금액은 그대로 — 가격 축 글자만 7자리가 된다.
 */
function sevenDigitPayloadOf(date: string): AccumReportPayload {
  const p = accumDetailRows().find((r) => r.isin === HANSUN)!.payload!;
  const mx = Math.max(...p.price.px, ...p.orders.px);
  const k = ACCUM_7DIGIT_MAX_PX / mx;
  const scale = (v: number) => Math.round(v * k);
  const dt = accumKstMs(date, '00:00:00') - accumKstMs(ACCUM_DATE, '00:00:00');
  const shift = (t: number) => t + dt;
  return {
    ...p,
    price: { ...p.price, t0_ms: shift(p.price.t0_ms), px: p.price.px.map(scale) },
    orders: { ...p.orders, t_ms: p.orders.t_ms.map(shift), px: p.orders.px.map(scale) },
    day_cum_net: { ...p.day_cum_net, t_ms: p.day_cum_net.t_ms.map(shift) },
  };
}

/**
 * **합성 — ACCUM_WORST_DETAIL.** 사이클 3개: ① 09:05~09:15 청산 ② 09:20~09:30 청산 ③ 13:00 재등록 · 살아 있음
 * (cycle 값 1 · 1 · 2 — 번호 연속 · 고유를 가정하지 않는다 · CR-01). 짧은 사이클 두 개가 전체 창 · 폰 310 에서 라벨 3줄을
 * 넘치게 만든다(넘친 라벨은 생략 · 선과 title 은 남는다). 가격 7자리(≥ 1,000,000 → 왼쪽 축 60).
 */
function worstDetailOf(date: string): AccumDetailRow {
  const base = accumDetailRows().find((r) => r.isin === HANSUN)!;
  const at = (hms: string) => accumKstMs(date, hms);
  const reg3 = at('13:00:00');
  const payload = sevenDigitPayloadOf(date);
  return {
    ...base,
    date,
    isin: ACCUM_WORST_DETAIL_ISIN,
    short_code: '0AC098',
    name: '합성칠자리세사이클',
    market: 'KOSDAQ',
    base: 950_000,
    upper: 1_235_000,
    last_px: payload.price.px[payload.price.px.length - 1]!,
    last_rate: 21.4,
    high_px: ACCUM_7DIGIT_MAX_PX,
    high_rate: 29.9,
    state: 1,
    end_reason: 0,
    cycle: 2,
    carry_days: 0,
    since_date: date,
    reg_time_ms: reg3,
    end_time_ms: null,
    pos_avg_px: 1_180_400,
    pos_reg_px: 1_172_000,
    payload: {
      ...payload,
      cycles: [
        cycleOn(date, { cycle: 1, reg_time_ms: at('09:05:00'), end_time_ms: at('09:15:00'), end_reason: 1, state: 3 }),
        cycleOn(date, { cycle: 1, reg_time_ms: at('09:20:00'), end_time_ms: at('09:30:00'), end_reason: 1, state: 3 }),
        cycleOn(date, { cycle: 2, reg_time_ms: reg3 }),
      ],
    },
  };
}

/**
 * **합성 — ACCUM_WORST_DROP_DETAIL.** 7자리 가격 + 이월 D+3(10/08 14:12 등록) · 06:00 이월 탈락(end_reason 2) —
 * 종료선은 09:00 왼쪽 끝에 붙고 라벨은 원래 시각 「이월 탈락(복원 안 됨) 06:00」(선 오른쪽 · 이월 줄 다음 줄).
 */
function worstDropDetailOf(date: string): AccumDetailRow {
  const base = worstDetailOf(date);
  const since = '20261008';
  const reg = accumKstMs(since, '14:12:09');
  const end = accumKstMs(date, '06:00:00');
  return {
    ...base,
    isin: ACCUM_WORST_DROP_ISIN,
    short_code: '0AC097',
    name: '합성칠자리이월탈락',
    state: 3,
    end_reason: 2,
    cycle: 1,
    carry_days: 3,
    since_date: since,
    reg_time_ms: reg,
    end_time_ms: end,
    payload: {
      ...base.payload!,
      orders: { ...base.payload!.orders, first: base.payload!.orders.first.map(() => 0 as const) },
      cycles: [
        cycleOn(date, { since_date: since, reg_time_ms: reg, end_time_ms: end, end_reason: 2, carry_days: 3, state: 3 }),
      ],
    },
  };
}

/** 상세 행 → 목록 평평한 열(payload 제거). */
function flatOf(row: AccumDetailRow): AccumReportRow {
  const { payload: _payload, ...flat } = row;
  return flat;
}

export const ACCUM_WORST_DETAIL: AccumDetailRow = worstDetailOf(ACCUM_BACKSTOP_DATE);
export const ACCUM_WORST_DROP_DETAIL: AccumDetailRow = worstDropDetailOf(ACCUM_BACKSTOP_DATE);

/**
 * **합성 — KPI 최악값 목록(백스톱 A2).** 종료 32행 = 청산 12 · 탈락 10 · 만료 10(보조 「청산 12 · 탈락 10 · 만료 10」) ·
 * 이월 32(전부 이월 D+5) · 팀 순매수 합 −1,234.5억(첫 행만 금액 · 나머지 null — 합에서 빠진다). 날짜 = ACCUM_BACKSTOP_DATE.
 */
export function accumKpiWorstFixture(): AccumReportBody {
  const date = ACCUM_BACKSTOP_DATE;
  const rows = Array.from({ length: 32 }, (_, i) => {
    const reason = i < 12 ? 1 : i < 22 ? 2 : 3;
    return {
      ...worstRowOf(date),
      isin: `KR790000K${String(i).padStart(3, '0')}`,
      short_code: `0K${String(i).padStart(4, '0')}`,
      end_reason: reason,
      pos_net_krw: i === 0 ? -123_450_000_000 : null,
    };
  });
  return { access: true, dates: ACCUM_DATES, date, rows };
}
