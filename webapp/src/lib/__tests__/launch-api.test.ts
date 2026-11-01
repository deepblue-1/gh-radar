import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LaunchPlanResponse } from '@gh-radar/shared';

/**
 * launch-api 단위 테스트 (Phase 35 · 35 R3-IN-03).
 *
 * 잠그는 것: `fetchLaunchPlan` 의 진행 중 요청 합치기(`joined`)와 `{ fresh: true }` 우회(35 R2-WR-01 — 저장 뒤 다시 읽기가
 * 먼저 나간 요청의 옛 응답을 받지 않게). 지도 탭 테스트는 `fetchLaunchPlan` 을 통째로 목으로 바꾸므로 이 분기를 보지 않는다.
 * 하네스: `authFetch` 만 목(경로 · 진행 중 약속을 테스트가 쥔다).
 */

const authFetchMock = vi.fn();
vi.mock('../auth-fetch', () => ({ authFetch: (...args: unknown[]) => authFetchMock(...args) }));

import { ApiClientError } from '../api';
import { fetchLaunchPlan } from '../launch-api';

const PATH = '/api/admin/launch/plan';
const respOf = (rev: number): LaunchPlanResponse => ({
  servers: { KB120: { status: 'ok', plan_rev: rev, updated_at: null, entries: [] } },
  changes: [],
});

/** 끝나지 않은 authFetch 약속 하나 — 테스트가 resolve · reject 한다. */
function pending() {
  let resolve!: (v: LaunchPlanResponse) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<LaunchPlanResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { p, resolve, reject };
}

afterEach(() => {
  authFetchMock.mockReset();
});

describe('fetchLaunchPlan — 진행 중 요청 합치기 · fresh 우회 (35 R2-WR-01 · R3-IN-03)', () => {
  it('fresh 없음 — 진행 중 요청에 합친다(authFetch 1회 · 두 호출이 같은 응답)', async () => {
    const a = pending();
    authFetchMock.mockReturnValueOnce(a.p);
    const first = fetchLaunchPlan();
    const second = fetchLaunchPlan();
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(authFetchMock).toHaveBeenCalledWith(PATH);
    a.resolve(respOf(1));
    await expect(first).resolves.toEqual({ kind: 'ready', resp: respOf(1) });
    await expect(second).resolves.toEqual({ kind: 'ready', resp: respOf(1) });
  });

  it('{ fresh: true } — 진행 중 요청이 있어도 새로 보낸다(authFetch 2회) · 먼저 나간 요청의 옛 응답을 받지 않는다', async () => {
    const old = pending();
    const fresh = pending();
    authFetchMock.mockReturnValueOnce(old.p).mockReturnValueOnce(fresh.p);
    const first = fetchLaunchPlan();
    const reread = fetchLaunchPlan({ fresh: true });
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    expect(authFetchMock).toHaveBeenNthCalledWith(2, PATH);
    // 새 요청이 먼저 오고 옛 요청이 늦게 와도 각자 제 응답이다.
    fresh.resolve(respOf(2));
    await expect(reread).resolves.toEqual({ kind: 'ready', resp: respOf(2) });
    old.resolve(respOf(1));
    await expect(first).resolves.toEqual({ kind: 'ready', resp: respOf(1) });
  });

  it('{ fresh: true } 는 합치기 자리를 차지하지 않는다 — 그 뒤 fresh 없는 요청은 진행 중 fresh 에 합치지 않고 새로 보낸다', async () => {
    const fresh = pending();
    const plain = pending();
    authFetchMock.mockReturnValueOnce(fresh.p).mockReturnValueOnce(plain.p);
    const reread = fetchLaunchPlan({ fresh: true });
    const next = fetchLaunchPlan();
    expect(authFetchMock).toHaveBeenCalledTimes(2);
    plain.resolve(respOf(3));
    fresh.resolve(respOf(2));
    await expect(reread).resolves.toEqual({ kind: 'ready', resp: respOf(2) });
    await expect(next).resolves.toEqual({ kind: 'ready', resp: respOf(3) });
  });

  it('끝난 요청은 합치기 자리에서 빠진다(실패 포함) — 다음 호출은 새 요청', async () => {
    authFetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(respOf(4));
    await expect(fetchLaunchPlan()).rejects.toThrow('network');
    await expect(fetchLaunchPlan()).resolves.toEqual({ kind: 'ready', resp: respOf(4) });
    expect(authFetchMock).toHaveBeenCalledTimes(2);
  });

  it('404 → absent · 그 밖 오류는 그대로 throw (fresh 도 같다)', async () => {
    authFetchMock
      .mockRejectedValueOnce(new ApiClientError({ code: 'NOT_FOUND', message: 'x', status: 404 }))
      .mockRejectedValueOnce(new ApiClientError({ code: 'X', message: 'x', status: 502 }));
    await expect(fetchLaunchPlan({ fresh: true })).resolves.toEqual({ kind: 'absent' });
    await expect(fetchLaunchPlan({ fresh: true })).rejects.toBeInstanceOf(ApiClientError);
  });
});
