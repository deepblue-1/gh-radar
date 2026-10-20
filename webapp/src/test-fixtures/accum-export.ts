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

/** `GET /api/accum/report/{date}/{isin}` 성공 응답 모양 — 픽스처에 없는 isin 이면 row: null. */
export function accumDetailFixture(isin: string): { access: true; row: AccumDetailRow | null } {
  return { access: true, row: accumDetailRows().find((r) => r.isin === isin) ?? null };
}
