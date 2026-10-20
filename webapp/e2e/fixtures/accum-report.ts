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
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 공개 정보뿐.
 */

import type { AccumDetailRow, AccumReportRow } from '@gh-radar/shared';

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
export function accumReportFixture(d: string | null, opts: { worst?: boolean } = {}): AccumReportBody {
  const date = d ?? ACCUM_LATEST;
  if (!ACCUM_DATES.includes(date)) return { access: true, dates: ACCUM_DATES, date, rows: [] };
  const rows = accumListRows().map((r) => ({ ...r, date }));
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
  if (isin === ACCUM_WORST_ISIN) {
    const hansun = accumDetailRows().find((r) => r.isin === HANSUN)!;
    return { access: true, row: { ...worstRowOf(date), payload: hansun.payload } };
  }
  const row = accumDetailRows().find((r) => r.isin === isin);
  return { access: true, row: row === undefined ? null : { ...row, date } };
}
