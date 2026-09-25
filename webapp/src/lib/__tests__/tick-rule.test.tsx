import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * D-15a (20-REVIEW WR-05) — 종목 마스터 `stocks.security_group` → 호가 단위 잠금 강도.
 *
 * 스텁 경계는 `@/lib/supabase/client` 의 `createClient` 하나다. 조회 모양(`stocks` · `security_group` ·
 * `isin` 일치 · `maybeSingle`)을 그대로 단언한다 — 판별자는 새로 만들지 않고 마스터 컬럼을 읽는다.
 */

const q = vi.hoisted(() => ({
  result: { data: null as { security_group: string | null } | null, error: null as unknown },
  calls: [] as { table: string; cols: string; col: string; val: string }[],
  throwOnCreate: false,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    if (q.throwOnCreate) throw new Error('supabase env missing');
    return {
      from: (table: string) => ({
        select: (cols: string) => ({
          eq: (col: string, val: string) => ({
            maybeSingle: async () => {
              q.calls.push({ table, cols, col, val });
              return q.result;
            },
          }),
        }),
      }),
    };
  },
}));

import { clearTickRuleCache, fetchTickRule, useTickRule } from '../tick-rule';

const ISIN = 'KR7005930003';

beforeEach(() => {
  clearTickRuleCache();
  q.result = { data: null, error: null };
  q.calls = [];
  q.throwOnCreate = false;
});
afterEach(() => vi.restoreAllMocks());

describe('fetchTickRule — 마스터 security_group 을 읽는다', () => {
  it('stocks.security_group 을 isin 으로 한 행 조회한다', async () => {
    q.result = { data: { security_group: '주권' }, error: null };
    await expect(fetchTickRule(ISIN)).resolves.toBe('stock');
    expect(q.calls).toEqual([{ table: 'stocks', cols: 'security_group', col: 'isin', val: ISIN }]);
  });

  it.each([
    ['ETF', 'etp'],
    ['ETN', 'etp'],
    ['ELW', 'etp'],
    ['주권', 'stock'],
    ['미확인', 'unknown'],
  ] as const)('%s → %s', async (group, rule) => {
    q.result = { data: { security_group: group }, error: null };
    await expect(fetchTickRule(ISIN)).resolves.toBe(rule);
  });

  it('행이 없으면(ETP 는 마스터에 isin 이 없다) unknown', async () => {
    q.result = { data: null, error: null };
    await expect(fetchTickRule(ISIN)).resolves.toBe('unknown');
  });
});

describe('useTickRule — 조회 중 undefined · 실패는 로그 + unknown', () => {
  it('조회 중에는 undefined(호출부는 주식 잠금 그대로) → ETF 면 etp', async () => {
    q.result = { data: { security_group: 'ETF' }, error: null };
    const { result } = renderHook(() => useTickRule(ISIN));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('etp'));
  });

  it('조회 오류 → unknown · 경고 로그를 남긴다(무로그 fail-safe 금지) · 캐시하지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    q.result = { data: null, error: new Error('boom') };
    const first = renderHook(() => useTickRule(ISIN));
    await waitFor(() => expect(first.result.current).toBe('unknown'));
    expect(warn).toHaveBeenCalledTimes(1);
    first.unmount();
    // 다음 마운트는 다시 묻는다 — 일시 오류가 세션 내내 경고만으로 굳지 않는다.
    q.result = { data: { security_group: '주권' }, error: null };
    const second = renderHook(() => useTickRule(ISIN));
    await waitFor(() => expect(second.result.current).toBe('stock'));
  });

  it('클라이언트 생성 실패(환경변수 없음)도 unknown + 로그', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    q.throwOnCreate = true;
    const { result } = renderHook(() => useTickRule(ISIN));
    await waitFor(() => expect(result.current).toBe('unknown'));
    expect(warn).toHaveBeenCalled();
  });

  it('성공 결과는 캐시된다 — 같은 ISIN 두 번째 마운트는 조회 없이 첫 렌더부터 값', async () => {
    q.result = { data: { security_group: '주권' }, error: null };
    const first = renderHook(() => useTickRule(ISIN));
    await waitFor(() => expect(first.result.current).toBe('stock'));
    const second = renderHook(() => useTickRule(ISIN));
    expect(second.result.current).toBe('stock');
    expect(q.calls).toHaveLength(1);
  });

  it('ISIN 이 바뀐 렌더에서 옛 종목 분류를 쓰지 않는다', async () => {
    q.result = { data: { security_group: '주권' }, error: null };
    const { result, rerender } = renderHook(({ isin }) => useTickRule(isin), { initialProps: { isin: ISIN } });
    await waitFor(() => expect(result.current).toBe('stock'));
    q.result = { data: null, error: null };
    rerender({ isin: 'KR7069500007' });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('unknown'));
  });

  it('빈 ISIN 은 조회하지 않는다', () => {
    const { result } = renderHook(() => useTickRule(''));
    expect(result.current).toBeUndefined();
    expect(q.calls).toHaveLength(0);
  });
});
