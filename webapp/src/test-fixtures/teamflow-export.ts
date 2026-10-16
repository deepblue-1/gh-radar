/**
 * Phase 33 — 팀 매집 실측 픽스처(10/14 · 34행)를 테스트 입력으로 읽는다(컴포넌트 RTL · lib 단위 · E2E 픽스처 공용).
 *
 * 원천 = `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` — 맥 샘플
 * `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz` 바이트 사본(sha256 f6656ae2…d897 · gh-trade `export_day_records`
 * 출력 그대로 · 행 키 = 계약 열). 합성 행 없음 — `teamflowReportFixture` 의 봉투(access · dates)만 응답 모양을 흉내 낸다.
 * 실계좌 · 사용자 식별 리터럴 없음(종목 · 창구 공개 정보뿐).
 * - KR7000650002 천일고속 — 상한가(첫 상한가 11:50) · 팀 순매수 +4.1억
 * - KR7010580009 에스엠벡셀 — 상한가 · 「0% 미만」 · 「상한가 가격」 구간 둘 다 있음
 * - KR7084670009 동양고속 — 미도달 +22.1% · 팀 순매수 +2.2억
 * - KR7452280001 한선엔지니어링 — 미도달 +26.9% · 팀 순매수 +5.9억(정렬 1위)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type { TeamflowRow } from '@gh-radar/shared';

export const TEAMFLOW_DATE = '20261014';
export const CHEONIL = 'KR7000650002';
export const SMBEXCEL = 'KR7010580009';
export const DONGYANG = 'KR7084670009';
export const HANSUN = 'KR7452280001';

const DIR = path.resolve(__dirname, '../../../workers/limitup-sync/tests/fixtures/team_flow', TEAMFLOW_DATE);

/** export 34행 그대로(isin 오름차순 — 파일 순서). */
export function teamflowRows(): TeamflowRow[] {
  return gunzipSync(readFileSync(path.join(DIR, 'team_flow.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as TeamflowRow);
}

/** `GET /api/teamflow/report` 성공 응답 모양 — 기본 = 10/14 34행 · dates 2개. */
export function teamflowReportFixture(
  opts: { date?: string | null; dates?: string[]; rows?: TeamflowRow[] } = {},
): { access: true; dates: string[]; date: string | null; rows: TeamflowRow[] } {
  return {
    access: true,
    dates: opts.dates ?? [TEAMFLOW_DATE, '20261013'],
    date: opts.date === undefined ? TEAMFLOW_DATE : opts.date,
    rows: opts.rows ?? teamflowRows(),
  };
}
