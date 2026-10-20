/**
 * Phase 34 — 매집감지 실측 픽스처(10/14 · 6행)를 테스트 입력으로 읽는다(컴포넌트 RTL · lib 단위 · E2E 픽스처 공용).
 *
 * 원천 = `workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz`(34-01 트레이서 전반 · sha256
 * 8037c4e5…05a8) — 워커 · server · 웹이 같은 파일을 gunzip 원문으로 읽는다(웹 쪽 사본 없음). 행 키 = 계약 열(37열 + payload).
 * 6행(isin 오름차순 — 파일 순서)과 용도:
 * - KR7000650002 천일고속 — 상한가 · orders 45 · first 1(09:01:00 1천만 미만 첫 매수) · KPI 줄 기준 행
 * - KR7011151008 CJ씨푸드1우 — 팀 주문 0(orders 빔 · pnl null) — payload 결측 셸
 * - KR7084670009 동양고속 — 미도달
 * - KR7452280001 한선엔지니어링 — 최대 행(json ≈ 224KB · orders 501)
 * - KRA0113321F5 — name null(종목 칸 · 접근 이름이 short_code 로 대체)
 * - KYG2114A1094 씨엑스아이 — 비 KR ISIN
 *
 * **pos_* · th_* · cycles 는 gh-trade 모의 등록 줄(전 행 같은 09:57:20 · state 1 · 사이클 1 · pos_net_krw +162,312,900) —
 * 다중 사이클 · 이월 · 종료는 34-04 · 34-06 이 합성으로 더한다.** 가격 · 주문 · 누적 · day_* · pnl 은 10/14 실물 pcap 재계산.
 * 실계좌 · 사용자 식별 리터럴 없음(종목 공개 정보뿐).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { AccumDetailRow, AccumReportRow } from '@gh-radar/shared';

export const ACCUM_DATE = '20261014';
export const CHEONIL = 'KR7000650002';
export const CJSEAFOOD_PREF = 'KR7011151008';
export const DONGYANG = 'KR7084670009';
export const HANSUN = 'KR7452280001';
export const NAMELESS = 'KRA0113321F5';
export const CXI = 'KYG2114A1094';

const DIR = path.resolve(__dirname, '../../../workers/limitup-sync/tests/fixtures/accum_flow', ACCUM_DATE);

/** export 6행 그대로(평평한 37열 + payload · isin 오름차순 — 파일 순서). */
export function accumDetailRows(): AccumDetailRow[] {
  return gunzipSync(readFileSync(path.join(DIR, 'accum_flow.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as AccumDetailRow);
}

/** 목록 행 — payload 키를 뺀 평평한 37열(목록 RPC 모양). */
export function accumListRows(): AccumReportRow[] {
  return accumDetailRows().map(({ payload: _payload, ...flat }) => flat);
}

/** `GET /api/accum/report` 성공 응답 모양 — 기본 = 10/14 6행 · dates 2개. */
export function accumReportFixture(
  over: { date?: string | null; dates?: string[]; rows?: AccumReportRow[] } = {},
): { access: true; dates: string[]; date: string | null; rows: AccumReportRow[] } {
  return {
    access: true,
    dates: over.dates ?? [ACCUM_DATE, '20261013'],
    date: over.date === undefined ? ACCUM_DATE : over.date,
    rows: over.rows ?? accumListRows(),
  };
}

// ---------------------------------------------------------------------------
// 합성 목록 행 (34-04 · D-08 · D-09 · D-11 검증용)
// ---------------------------------------------------------------------------

/** 합성 행 ISIN — KR79 합성 대역(실재 종목 아님). */
export const AC_LIVE = 'KR790000AC01';
export const AC_SELL = 'KR790000AC02';
export const AC_CARRY = 'KR790000AC03';
export const AC_LIQ = 'KR790000AC04';
export const AC_DROP = 'KR790000AC05';
export const AC_EXPIRE = 'KR790000AC06';
export const AC_PARTIAL = 'KR790000AC07';

/** `YYYYMMDD` + KST 「HH:MM:SS」 → epoch ms. */
export function accumKstMs(ymd: string, hms: string): number {
  const [h, m, s] = hms.split(':').map(Number) as [number, number, number];
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), h - 9, m, s);
}

/** 기준가 10,000 · 상한가 13,000 에 맞춘 가격 열(등락률 % → 가격). 상한가면 last_px = upper. */
function pxCols(lastRate: number | null, highRate: number | null, limit = false) {
  const base = 10_000;
  const upper = 13_000;
  const px = (r: number | null) => (r === null ? null : Math.round(base * (1 + r / 100)));
  return {
    base,
    upper,
    last_px: limit ? upper : px(lastRate),
    last_rate: lastRate,
    high_px: px(highRate),
    high_rate: highRate,
  };
}

/**
 * **합성 — 실측 아님 · 목업 A(`reference/mockup-accum-list.html`)의 상태 조합.** 10/14 실측 천일고속 행을 바탕으로
 * 평평한 열(상태 · 사유 · 사이클 · 이월 · 등록/종료 시각 · pos_* · day_net · 가격)만 덮어쓴 7행. ISIN 은 KR79 합성 대역
 * `KR790000AC01`~`KR790000AC07` · 종목명은 실재가 아닌 문자열 · 6자 코드도 합성(`AC0001`~).
 * 시각 = KST ms — 종료 시각은 그날(20261014) · 등록 시각은 등록 거래일(`since_date`) 기준.
 *
 * ① 매집중 오늘 등록(+9.3억 · 09:12:40) ② 매도중(−2.4억) ③ 매집중 이월 D+2 · 사이클 2(since 10/10 · 10:02:33 · +3.6억)
 * ④ 종료 청산(end_reason 1 · 11:32:04 · −6.9억) ⑤ 종료 이월 탈락(end_reason 2 · D+1 · since 10/13 · 06:00:00 · +0.4억)
 * ⑥ 종료 이월 만료(end_reason 3 · D+5 · since 10/06 · 06:00:00 · +0.2억) ⑦ 결측(name · market · last_rate · high_rate ·
 * reg_time_ms · pos_net_krw · day_net_krw null · since_date "" · state 1).
 * 정렬(D-08) 기대 = ① ③ ⑦ → ② → ⑤ ⑥ ④.
 */
export function accumSyntheticListRows(): AccumReportRow[] {
  const base = accumListRows().find((r) => r.isin === CHEONIL)!;
  const D = ACCUM_DATE;
  const row = (n: number, over: Partial<AccumReportRow>): AccumReportRow => ({
    ...base,
    isin: `KR790000AC0${n}`,
    short_code: `AC000${n}`,
    cycle: 1,
    carry_days: 0,
    end_reason: 0,
    end_time_ms: null,
    since_date: D,
    ...over,
  });
  return [
    row(1, {
      name: '합성매집중',
      market: 'KOSDAQ',
      ...pxCols(26.93, 29.96),
      state: 1,
      reg_time_ms: accumKstMs(D, '09:12:40'),
      pos_net_krw: 930_000_000,
      pos_avg_px: 12_680,
      pos_reg_px: 11_410,
      day_net_krw: 310_000_000,
    }),
    row(2, {
      name: '합성매도중',
      market: 'KOSDAQ',
      ...pxCols(10.87, 25.27),
      state: 2,
      reg_time_ms: accumKstMs(D, '09:48:15'),
      pos_net_krw: -240_000_000,
      pos_avg_px: 3_080,
      pos_reg_px: 2_995,
      day_net_krw: -2_010_000_000,
    }),
    row(3, {
      name: '합성이월',
      market: 'KOSPI',
      ...pxCols(13.77, 29.81),
      state: 1,
      cycle: 2,
      carry_days: 2,
      since_date: '20261010',
      reg_time_ms: accumKstMs('20261010', '10:02:33'),
      pos_net_krw: 360_000_000,
      pos_avg_px: 21_350,
      pos_reg_px: 20_900,
      day_net_krw: 40_000_000,
    }),
    row(4, {
      name: '합성청산',
      market: 'KOSDAQ',
      ...pxCols(18.09, 29.98),
      state: 3,
      end_reason: 1,
      reg_time_ms: accumKstMs(D, '09:05:11'),
      end_time_ms: accumKstMs(D, '11:32:04'),
      pos_net_krw: -690_000_000,
      pos_avg_px: 14_200,
      pos_reg_px: 13_900,
      day_net_krw: -3_340_000_000,
    }),
    row(5, {
      name: '합성탈락',
      market: 'KOSDAQ',
      ...pxCols(13.88, 20.33),
      state: 3,
      end_reason: 2,
      carry_days: 1,
      since_date: '20261013',
      reg_time_ms: accumKstMs('20261013', '13:30:02'),
      end_time_ms: accumKstMs(D, '06:00:00'),
      pos_net_krw: 40_000_000,
      pos_avg_px: 9_880,
      pos_reg_px: 9_800,
      day_net_krw: 0,
    }),
    row(6, {
      name: '합성만료',
      market: 'KOSDAQ',
      ...pxCols(-3.1, 28.09),
      state: 3,
      end_reason: 3,
      carry_days: 5,
      since_date: '20261006',
      reg_time_ms: accumKstMs('20261006', '09:36:40'),
      end_time_ms: accumKstMs(D, '06:00:00'),
      pos_net_krw: 20_000_000,
      pos_avg_px: 3_340,
      pos_reg_px: 3_290,
      day_net_krw: 0,
    }),
    row(7, {
      name: null,
      market: null,
      ...pxCols(null, null),
      state: 1,
      since_date: '',
      reg_time_ms: null,
      pos_net_krw: null,
      pos_avg_px: null,
      pos_reg_px: null,
      day_net_krw: null,
    }),
  ];
}

/** `GET /api/accum/report/{date}/{isin}` 성공 응답 모양 — 픽스처에 없는 isin 이면 row: null. */
export function accumDetailFixture(isin: string): { access: true; row: AccumDetailRow | null } {
  return { access: true, row: accumDetailRows().find((r) => r.isin === isin) ?? null };
}
