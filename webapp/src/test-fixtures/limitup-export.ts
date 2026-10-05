/**
 * Phase 28 Plan 13 — 실 export 픽스처(20261002 · 3종목)를 테스트 입력으로 읽는다(lib 단위 · 컴포넌트 · 격자 훅 공용).
 *
 * 원천 = `workers/limitup-sync/tests/fixtures/export/20261002/` — gh-trade `tickana/export.py` 출력 그대로(행 키 = 계약 열).
 * - KR7263600009 덕우전자 — 잠김 ① 10초 뒤 깨짐(burst_sell · cancel 마커 · 깨짐 전 1분 매도 사실)
 * - KR7069920007 엑시온그룹 — 잠김 ② 종가 유지
 * - KR7308100007 형지글로벌 — 미도달(잠김 없음)
 * 격자 파일은 `.json.gz` 바이트 그대로(`gridGzOf`)와 해제한 JSON(`gridOf`) 둘 다 준다.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import type {
  LimitupEntryRow,
  LimitupFactRow,
  LimitupGridFile,
  LimitupLockRow,
  LimitupMarkRow,
} from '@gh-radar/shared';

export const EXPORT_DATE = '20261002';
export const DUKWOO = 'KR7263600009';
export const AXION = 'KR7069920007';
export const HYUNGJI = 'KR7308100007';

const DIR = path.resolve(__dirname, '../../../workers/limitup-sync/tests/fixtures/export', EXPORT_DATE);

function ndjson<T>(name: string): T[] {
  return gunzipSync(readFileSync(path.join(DIR, `${name}.ndjson.gz`)))
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T);
}

export function gridGzOf(isin: string): Buffer {
  return readFileSync(path.join(DIR, 'grid', `${isin}.json.gz`));
}

export function gridOf(isin: string): LimitupGridFile {
  return JSON.parse(gunzipSync(gridGzOf(isin)).toString('utf8')) as LimitupGridFile;
}

export const exportEntries = (): LimitupEntryRow[] => ndjson<LimitupEntryRow>('entries');
export const exportLocks = (): LimitupLockRow[] => ndjson<LimitupLockRow>('locks');
export const exportFacts = (): LimitupFactRow[] => ndjson<LimitupFactRow>('facts');

/** jumps 의 burst_sell · cancel 을 RPC 가 내는 마커 모양으로 — 종목마다 krw 큰 순 40개(RPC 와 같은 자르기). */
export function exportMarks(): LimitupMarkRow[] {
  type Jump = LimitupMarkRow & { kind: string };
  const rows = ndjson<Jump>('jumps').filter((j) => j.kind === 'burst_sell' || j.kind === 'cancel');
  const byIsin = new Map<string, LimitupMarkRow[]>();
  for (const j of rows) {
    const m: LimitupMarkRow = {
      isin: j.isin,
      jump_no: j.jump_no,
      t_ms: j.t_ms,
      kind: j.kind as LimitupMarkRow['kind'],
      qty: j.qty,
      krw: j.krw,
      q_before: j.q_before,
      q_after: j.q_after,
    };
    const list = byIsin.get(j.isin);
    if (list) list.push(m);
    else byIsin.set(j.isin, [m]);
  }
  return [...byIsin.keys()]
    .sort()
    .flatMap((isin) => byIsin.get(isin)!.sort((a, b) => (b.krw ?? 0) - (a.krw ?? 0)).slice(0, 40));
}
