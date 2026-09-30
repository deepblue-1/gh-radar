import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LM7-D1 — 오늘 상장해 `stocks.isin` 이 아직 비어 있는 보통주(intraday-sync bootstrap 이
 * code·name 만 넣은 행)는 isin 조회로 못 찾는다. 그 ISIN 만 단축코드로 `stocks.code` 를 한 번 더 조회한다.
 *
 * 스텁 경계는 `@/lib/supabase/client` 의 `createClient` 하나다. `in(col, values)` 는 **컬럼별로** 거른다.
 */

type Row = { isin: string | null; code: string; name: string };

const q = vi.hoisted(() => ({
  rows: [] as { isin: string | null; code: string; name: string }[],
  calls: [] as { table: string; cols: string; col: string; values: string[] }[],
  errorFor: {} as Partial<Record<string, unknown>>,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        in: async (col: string, values: string[]) => {
          q.calls.push({ table, cols, col, values });
          const error = q.errorFor[col];
          if (error) return { data: null, error };
          const data = q.rows.filter((r) =>
            values.includes((r as Record<string, string | null>)[col] as string),
          );
          return { data, error: null };
        },
      }),
    }),
  }),
}));

import { clearStockNameCache, fetchStockNames } from '../stock-names';

const SAMSUNG: Row = { isin: 'KR7005930003', code: '005930', name: '삼성전자' };
const NEW_A: Row = { isin: null, code: '475560', name: '신규상장A' };
const NEW_B: Row = { isin: null, code: '0126Z0', name: '신규상장B' };

beforeEach(() => {
  clearStockNameCache();
  q.rows = [];
  q.calls = [];
  q.errorFor = {};
});

describe('fetchStockNames — isin 조회 뒤 신규 상장 코드 폴백', () => {
  it('isin 으로 모두 풀리면 조회는 isin 한 번뿐이다', async () => {
    q.rows = [SAMSUNG];
    const out = await fetchStockNames(['KR7005930003']);
    expect(out.get('KR7005930003')).toBe('삼성전자');
    expect(q.calls).toEqual([
      { table: 'stocks', cols: 'isin,name', col: 'isin', values: ['KR7005930003'] },
    ]);
  });

  it('isin 이 빈 신규 상장 보통주는 단축코드로 한 번 더 묶어 조회해 이름을 붙인다', async () => {
    q.rows = [NEW_A, NEW_B];
    const out = await fetchStockNames(['KR7475560004', 'KR70126Z0006']);
    expect(out.get('KR7475560004')).toBe('신규상장A');
    expect(out.get('KR70126Z0006')).toBe('신규상장B');
    expect(q.calls).toHaveLength(2);
    expect(q.calls[0]!.col).toBe('isin');
    expect(q.calls[1]).toEqual({
      table: 'stocks',
      cols: 'code,name',
      col: 'code',
      values: ['475560', '0126Z0'],
    });
  });

  it('isin 으로 이미 풀린 종목은 코드 조회 값에 넣지 않는다', async () => {
    q.rows = [SAMSUNG, NEW_A];
    const out = await fetchStockNames(['KR7005930003', 'KR7475560004']);
    expect(out.get('KR7005930003')).toBe('삼성전자');
    expect(out.get('KR7475560004')).toBe('신규상장A');
    expect(q.calls[1]!.values).toEqual(['475560']);
  });

  it('우선주 모양 ISIN 은 코드를 유도하지 않는다 — 틀린 이름 금지', async () => {
    q.rows = [{ isin: null, code: '005931', name: '함정' }];
    const out = await fetchStockNames(['KR7005931001']);
    expect(out.size).toBe(0);
    expect(q.calls).toHaveLength(1);
    expect(q.calls[0]!.col).toBe('isin');
  });

  it('코드 조회 오류는 던진다', async () => {
    q.rows = [NEW_A];
    const boom = new Error('code lookup failed');
    q.errorFor = { code: boom };
    await expect(fetchStockNames(['KR7475560004'])).rejects.toBe(boom);
  });
});
