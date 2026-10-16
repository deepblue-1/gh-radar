/**
 * Phase 33 Plan 04 — 팀 매집 보고서 e2e 픽스처 (P33-TF1~4 · P33-TF-B1~B3).
 *
 * 원천 = 워커 픽스처 실 export 20261014(`workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` —
 * gh-trade `export_day_records` 출력 그대로 · 34행)를 `@/test-fixtures/teamflow-export` 로 읽는다(RTL · lib 단위와 같은 원천).
 * - 20261014 = 실 export 34행 그대로.
 * - 20261013 = 같은 34행의 `date` 만 바꾼 **합성** 응답 — 날짜 알약 ‹ 이동을 확인하려는 용도뿐(그날 실측 아님).
 * - `WORST_ROW` = 폭 백스톱(UI-SPEC T2 · T3 · 상세 T6 · T8) 용 **합성** 최악값 행 — 15자 종목명 · 상한가 15:19 · 금액 −1,234.5억.
 *   실재 종목명 · ISIN 이 아니다(종목명은 일부러 말이 안 되는 15자 · ISIN 은 KR79 합성 대역).
 * ★ 실계좌 · 사용자 식별 리터럴 없음 — 종목 · 창구 공개 정보뿐.
 */

import type { LimitupDate, TeamflowBand, TeamflowBucket, TeamflowRow } from '@gh-radar/shared';

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

/** 「28%~상한 미만」 행 매수 중 팀 37% — 구간 차트 맨 오른쪽 % 칸(백스톱 T6). */
const WORST_BAND_SHARE = 0.37;

/**
 * 합성 구간 한 행 — 표시 칸(net_val · share)만 뜻이 있고 나머지 수량 · 금액은 모양만 맞춘 값이다(실측 아님).
 * share 는 team_buy ÷ buy_aggr 와 맞춘다.
 */
function worstBand(label: string, netVal: number, share: number): TeamflowBand {
  const buyAggr = 10_000;
  const teamBuy = Math.round(buyAggr * share);
  return {
    label,
    vol: 25_000,
    val: 5_000_000_000,
    buy_aggr: buyAggr,
    sell_aggr: 9_000,
    team_buy: teamBuy,
    team_sell: teamBuy,
    net: 0,
    team_buy_val: Math.max(netVal, 0),
    team_sell_val: Math.max(-netVal, 0),
    net_val: netVal,
    share,
  };
}

/** 합성 10분 버킷 — key → 「HH:MM」(54 = 09:00). 표시 칸(net_val · share · lo · hi)만 뜻이 있다. */
function worstBucket(key: number, netVal: number, share: number | null, lo: number, hi: number): TeamflowBucket {
  const min = key * 10;
  const start = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return {
    key,
    start,
    lo,
    hi,
    share,
    vol: 3_000,
    val: 600_000_000,
    buy_aggr: 1_500,
    sell_aggr: 1_200,
    team_buy: share === null ? 0 : Math.round(1_500 * share),
    team_sell: 100,
    net: 0,
    team_buy_val: Math.max(netVal, 0),
    team_sell_val: Math.max(-netVal, 0),
    net_val: netVal,
  };
}

/**
 * 폭 백스톱용 합성 행 — 실 행(천일고속) 모양을 빌려 표시 칸만 최악값으로 바꾼다.
 * worst 모드는 이 한 행만 싣는다 → KPI 「팀 순매수 합」 도 「−1,234.5억」.
 *
 * payload 도 **합성**이다(Plan 07 · 상세 백스톱 T6 · T8 — 실측 아님):
 * - bands = 9 구간 라벨 전부 + 「하루 합계」 · 「28%~상한 미만」 net_val −123,450,000,000(「−1,234.5억」 — 값 칸 최장) ·
 *   share 0.37(「37%」) · 나머지는 작은 값. 구간 차트 라벨 칸 96 · 값/% 칸 120 이 최악값에서도 겹치지 않는지 본다.
 * - buckets = key 54~91 중 몇 칸 + key 93(종가 단일가 → 슬롯 38 합산) · window 14:10~14:19(key 85 · 슬롯 31) ·
 *   first_limit_ms 15:19 → 「첫 상한가 15:19」 라벨이 svg 오른쪽 끝 가까이(선 왼쪽으로 붙는 경로).
 * - members 3행 · summary_lines 2줄.
 */
export const WORST_ROW: TeamflowRow = (() => {
  const base = teamflowRows().find((r) => r.isin === CHEONIL)!;
  const bands: TeamflowBand[] = [
    worstBand('0% 미만', 3_200_000, 0.04),
    worstBand('0~5%', -12_500_000, 0.08),
    worstBand('5~10%', 8_400_000, 0.11),
    worstBand('10~15%', -21_000_000, 0.09),
    worstBand('15~20%', 45_600_000, 0.16),
    worstBand('20~25%', -33_300_000, 0.12),
    worstBand('25~28%', 61_700_000, 0.21),
    worstBand('28%~상한 미만', WORST_WON, WORST_BAND_SHARE),
    worstBand('상한가 가격', -98_700_000, 0.94),
    worstBand('하루 합계', WORST_WON, 0.33),
  ];
  const buckets: TeamflowBucket[] = [
    worstBucket(54, -7_000_000, 0.12, 0.5, 6.6),
    worstBucket(60, 12_000_000, 0.18, 8.2, 12.4),
    worstBucket(66, -25_000_000, 0.09, 11.0, 16.3),
    worstBucket(72, 40_000_000, 0.27, 15.1, 21.8),
    worstBucket(78, -9_000_000, null, 19.4, 23.2),
    worstBucket(84, 66_000_000, 0.35, 21.0, 27.5),
    worstBucket(85, 526_000_000, 0.62, 21.7, 29.9),
    worstBucket(86, -148_000_000, 0.41, 25.3, 29.9),
    worstBucket(90, 18_000_000, 0.22, 27.1, 29.9),
    worstBucket(91, -4_000_000, 0.05, 28.4, 29.9),
    worstBucket(93, 0, 0, 29.9, 29.9),
  ];
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
    payload: {
      ...base.payload!,
      bands,
      buckets,
      window: {
        i: 31,
        j: 31,
        start: '14:10',
        end: '14:19',
        lo: 21.7,
        hi: 29.9,
        net_val: 526_000_000,
        share_lo: 0.62,
        share_hi: 0.62,
      },
      worst: [],
      reach: null,
      members: {
        time: '15:30',
        rows: [
          { member: '00002', name: '신한', buy: 1_234_567, sell: 987_654, net: 246_913 },
          { member: '00003', name: '한국', buy: 876_543, sell: 1_098_765, net: -222_222 },
          { member: '00012', name: 'NH', buy: 543_210, sell: null, net: null },
        ],
        absent: ['교보', '유진'],
        total: null,
        top_buy: { member: '00050', name: '키움증권', qty: 3_456_789 },
        top_sell: null,
      },
      summary_lines: [
        '20% 아래 팀 순매수 <b>−1,234.5억</b>(합성), 20%~상한 미만 팀 순매수 <b>−1,234.5억</b>.',
        '팀 순매수가 가장 크게 이어진 10분 구간은 <b>14:10~14:19</b> — 순매수 합 <b>+5.3억</b>(합성).',
      ],
    },
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
