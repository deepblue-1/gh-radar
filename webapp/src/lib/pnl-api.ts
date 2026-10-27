/**
 * pnl-api — 일자별 매매손익 조회 (Phase 36 · D-17 · D-18 · launch-api 꼴).
 *
 * ① 원천: server `GET /api/pnl?account=&range=`(/me · 내 계좌 한 벌) · `GET /api/admin/pnl?group=&range=`(어드민 · 계정별 |
 *   계좌별). server 가 RPC 1회로 jsonb 를 내준다(36-07). 브라우저는 Supabase 를 직접 읽지 않는다.
 * ② 계약 = shared `PnlReport` 한 벌 — 키는 RPC 그대로(snake_case). 봉투 언랩 없음. 정렬(일자 최신순 · 종목 손익 큰 순 ·
 *   미상 맨 뒤 · KB → 교보)은 RPC 정본이라 화면은 재정렬하지 않는다.
 * ③ 캐시 없음. 같은 키 **진행 중** 요청만 하나로 합친다(StrictMode effect 이중 실행 · 끝나면 지운다 → 「다시 시도」 = 새 요청).
 */

import type { PnlGroupBy, PnlRange, PnlReport } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';

const inflight = new Map<string, Promise<unknown>>();

function joined<T>(path: string): Promise<T> {
  const running = inflight.get(path);
  if (running !== undefined) return running as Promise<T>;
  const p = authFetch<T>(path).finally(() => {
    if (inflight.get(path) === p) inflight.delete(path);
  });
  inflight.set(path, p);
  return p;
}

/** /me — 고른 계좌 한 벌(그룹 0~1개 · `dma_user_ids` 는 늘 빈 배열). */
export function fetchMyPnl(accountNo: string, range: PnlRange): Promise<PnlReport> {
  const query = `?account=${encodeURIComponent(accountNo)}&range=${encodeURIComponent(range)}`;
  return joined<PnlReport>(`/api/pnl${query}`);
}

/** 어드민 — 전 계정 · 전 계좌를 계정별(user) | 계좌별(account) 로 묶는다. */
export function fetchAdminPnl(group: PnlGroupBy, range: PnlRange): Promise<PnlReport> {
  const query = `?group=${encodeURIComponent(group)}&range=${encodeURIComponent(range)}`;
  return joined<PnlReport>(`/api/admin/pnl${query}`);
}
