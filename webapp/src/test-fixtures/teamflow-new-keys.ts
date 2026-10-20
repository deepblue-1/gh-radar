/**
 * quick 261018-j17 — 팀 매집 export 새 키 행(실샘플 3행)을 테스트 입력으로 읽는다(lib 단위 · RTL · E2E 픽스처 공용).
 *
 * 원천 = 맥 실샘플 `~/ticks/teamflow/sample/20261014/team_flow.ndjson.gz`
 * (sha256 2906e7a084a75c2f90349dea3b824fde1ab97c55f07f1e4e676fee84ceffdf0b · gh-trade 261020-fvz · 261020-fv7 export) 에서
 * isin 3개 줄만 **바이트 그대로** 복사한 `teamflow-new-keys-20261014.ndjson`(샘플 순서 · 재직렬화 없음 · 합성 없음).
 * 새 키(`payload.member_flow` · `payload.pnl` · `payload.members.rows[].buy_val/sell_val/net_val`)를 빼면 옛 샘플
 * (`teamflow-export.ts` 가 읽는 워커 픽스처 gz)의 같은 isin 행과 같다(플래너 대조 · 픽스처 정직성 테스트가 잠근다).
 * - KR7000650002 천일고속 — 상한가 · 「상한가 가격」 구간 있음 · pnl +0.30억(+1.1%)
 * - KR7084670009 동양고속 — 미도달 · 「상한가 가격」 구간 없음 · pnl −0.08억(−1.3%)
 * - KR7011151008 CJ씨푸드1우 — pnl null · member_flow 있음
 *
 * 고정값 정본 = 인박스 `docs/inbox/from-gh-trade/261020-teamflow-member-flow.md` · `261020-teamflow-pnl.md` 「확인 방법」 —
 * 기대값 리터럴은 테스트 쪽에 둔다(픽스처와 기대값이 같은 원천이면 대조가 무의미하다). 실계좌 · 사용자 식별 리터럴 없음.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { TeamflowRow } from '@gh-radar/shared';

import { CHEONIL, DONGYANG, teamflowRows } from './teamflow-export';

export const CJSEAFOOD_PREF = 'KR7011151008';
export const NEW_KEY_ISINS = [CHEONIL, DONGYANG, CJSEAFOOD_PREF] as const;

const FILE = path.join(__dirname, 'teamflow-new-keys-20261014.ndjson');

/** 실샘플 3행 그대로(샘플 순서 — isin 오름차순). 부를 때마다 새로 파싱한다(호출부가 고쳐도 서로 영향 없음). */
export function teamflowNewKeyRows(): TeamflowRow[] {
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as TeamflowRow);
}

/** isin 이 새 키 3행 중 하나면 그 실샘플 행의 깊은 복사본, 아니면 row 그대로(입력 불변). */
export function withTeamflowNewKeys(row: TeamflowRow): TeamflowRow {
  if (!(NEW_KEY_ISINS as readonly string[]).includes(row.isin)) return row;
  return teamflowNewKeyRows().find((r) => r.isin === row.isin)!;
}

/** 옛 34행 중 3행만 새 키 — 나머지 31행은 키 없는 옛 행(실제 재적재 전환기와 같은 섞임). */
export function teamflowRowsWithNewKeys(): TeamflowRow[] {
  const fresh = new Map(teamflowNewKeyRows().map((r) => [r.isin, r]));
  return teamflowRows().map((r) => fresh.get(r.isin) ?? r);
}
