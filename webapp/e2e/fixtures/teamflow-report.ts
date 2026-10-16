/**
 * Phase 33 Plan 04 — 팀 매집 보고서 e2e 픽스처 (P33-TF1~4 · P33-TF-B1~B3).
 *
 * 원천 = 워커 픽스처 실 export 20261014(`workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` —
 * gh-trade `export_day_records` 출력 그대로 · 34행)를 `@/test-fixtures/teamflow-export` 로 읽는다(RTL · lib 단위와 같은 원천).
 * - 20261014 = 실 export 34행 그대로.
 * - 20261013 = 같은 34행의 `date` 만 바꾼 **합성** 응답 — 날짜 알약 ‹ 이동을 확인하려는 용도뿐(그날 실측 아님).
 * - `WORST_ROW` = 폭 백스톱(UI-SPEC T2 · T3) 용 **합성** 최악값 행 — 15자 종목명 · 상한가 15:19 · 금액 −1,234.5억.
 *   실재 종목명 · ISIN 이 아니다(종목명은 일부러 말이 안 되는 15자 · ISIN 은 KR79 합성 대역).
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 · 창구 공개 정보뿐.
 */

import type { LimitupDate, TeamflowRow } from '@gh-radar/shared';

import {
  CHEONIL,
  DONGYANG,
  HANSUN,
  SMBEXCEL,
  TEAMFLOW_DATE,
  teamflowReportFixture,
  teamflowRows,
} from '@/test-fixtures/teamflow-export';

export { CHEONIL, DONGYANG, HANSUN, SMBEXCEL };

export type TeamflowReportBody = ReturnType<typeof teamflowReportFixture>;

/** 행 있는 날짜(내림차순) — 최신 = export 날짜 · 20261013 은 합성(위 머리 주석). */
export const TEAMFLOW_LATEST: LimitupDate = TEAMFLOW_DATE;
export const TEAMFLOW_DATES: LimitupDate[] = [TEAMFLOW_DATE, '20261013'];

/** 합성 최악값 행의 15자 종목명 · ISIN. */
export const WORST_NAME = '합성종목이름열다섯글자테스트용';
export const WORST_ISIN = 'KR7999999990';
/** 2026-10-14 15:19:00 KST(= 06:19 UTC) — 태그 「상한가 15:19」. */
const WORST_FIRST_LIMIT_MS = Date.UTC(2026, 9, 14, 6, 19, 0);
/** −1,234.5억 = −123,450,000,000 원. */
const WORST_WON = -123_450_000_000;

/**
 * 폭 백스톱용 합성 행 — 실 행(천일고속) 모양을 빌려 표시 칸만 최악값으로 바꾼다.
 * worst 모드는 이 한 행만 싣는다 → KPI 「팀 순매수 합」 도 「−1,234.5억」.
 */
export const WORST_ROW: TeamflowRow = (() => {
  const base = teamflowRows().find((r) => r.isin === CHEONIL)!;
  return {
    ...base,
    date: TEAMFLOW_DATE,
    isin: WORST_ISIN,
    short_code: '999999',
    name: WORST_NAME,
    market: 'KOSDAQ',
    status: 'limit',
    first_limit_ms: WORST_FIRST_LIMIT_MS,
    team_net_val: WORST_WON,
    below20_net_val: WORST_WON,
    above20_net_val: WORST_WON,
  };
})();

/**
 * `GET /api/teamflow/report?d=` 200 본문.
 * - `date` 생략 = 최신(20261014) · 다른 날짜 = 같은 행의 `date` 만 옮긴 합성.
 * - `worst` = `WORST_ROW` 한 행만.
 */
export function teamflowE2EFixture(opts: { date?: LimitupDate; worst?: boolean } = {}): TeamflowReportBody {
  const date = opts.date ?? TEAMFLOW_LATEST;
  const rows = (opts.worst ? [WORST_ROW] : teamflowRows()).map((r) => ({ ...r, date }));
  return teamflowReportFixture({ date, dates: TEAMFLOW_DATES, rows });
}
