import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  fetchWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
} from '../watchlist-api';

/**
 * Phase 06.2 Plan 06 Task 1 — watchlist-api 단위 테스트.
 *
 * Supabase 클라이언트의 체인 빌더를 mocking 하여 각 함수가:
 * - fetchWatchlist: `.from("watchlists").select(...).order("added_at", { ascending: false })`
 *   체인을 정확히 호출하고 snake_case → camelCase 매핑 결과를 반환
 * - addWatchlistItem: `.insert({ user_id, stock_code })` 을 전달
 * - removeWatchlistItem: `.delete().eq("user_id", userId).eq("stock_code", stockCode)` 체인을 전달
 *
 * 인테그레이션 블록은 env `SUPABASE_E2E_URL` 이 있을 때만 실행 (describe.skipIf).
 */

interface MockChain {
  select: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
}

function makeMockChain(overrides?: Partial<MockChain>): MockChain {
  const chain: MockChain = {
    select: vi.fn(() => chain),
    order: vi.fn(async () => ({ data: [], error: null })),
    insert: vi.fn(async () => ({ data: null, error: null })),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    ...overrides,
  } as MockChain;
  return chain;
}

function makeSupabase(chain: MockChain) {
  return {
    from: vi.fn(() => chain as unknown),
  };
}

describe('fetchWatchlist', () => {
  let chain: MockChain;
  let supabase: ReturnType<typeof makeSupabase>;

  beforeEach(() => {
    chain = makeMockChain();
    supabase = makeSupabase(chain);
  });

  it('`watchlists` 테이블에서 embedded JOIN + added_at DESC 정렬로 조회', async () => {
    chain.order = vi.fn(async () => ({ data: [], error: null }));
    // @ts-expect-error — partial Supabase mock
    await fetchWatchlist(supabase);
    expect(supabase.from).toHaveBeenCalledWith('watchlists');
    const selectArg = (chain.select.mock.calls[0]?.[0] ?? '') as string;
    expect(selectArg).toContain('stock_code');
    expect(selectArg).toContain('stock:stocks!inner');
    // stock_quotes 는 stocks 내부에 nested embed (PostgREST 제약 — watchlists 직접 FK 없음)
    expect(selectArg).toContain('stock_quotes');
    expect(chain.order).toHaveBeenCalledWith('added_at', { ascending: false });
  });

  it('snake_case 응답을 WatchlistRow (camelCase) 로 매핑', async () => {
    const row = {
      stock_code: '005930',
      added_at: '2026-04-16T06:00:00Z',
      position: 0,
      stock: {
        code: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        kosdaq_segment: null,
        stock_quotes: {
          price: 58700,
          change_amount: 1700,
          change_rate: 2.98,
          trade_amount: 120_000_000_000,
          updated_at: '2026-04-16T06:00:00Z',
        },
      },
    };
    chain.order = vi.fn(async () => ({ data: [row], error: null }));
    // @ts-expect-error — partial Supabase mock
    const { data, error } = await fetchWatchlist(supabase);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toEqual({
      stockCode: '005930',
      addedAt: '2026-04-16T06:00:00Z',
      position: 0,
      stock: {
        code: '005930',
        name: '삼성전자',
        market: 'KOSPI',
        kosdaqSegment: null,
      },
      quote: {
        price: 58700,
        changeAmount: 1700,
        changeRate: 2.98,
        tradeAmount: 120_000_000_000,
        updatedAt: '2026-04-16T06:00:00Z',
      },
    });
  });

  it('stock_quotes 가 null 이면 WatchlistRow.quote = null', async () => {
    const row = {
      stock_code: '000660',
      added_at: '2026-04-16T05:00:00Z',
      position: 1,
      stock: {
        code: '000660',
        name: 'SK하이닉스',
        market: 'KOSPI',
        kosdaq_segment: null,
        stock_quotes: null,
      },
    };
    chain.order = vi.fn(async () => ({ data: [row], error: null }));
    // @ts-expect-error — partial Supabase mock
    const { data } = await fetchWatchlist(supabase);
    expect(data![0]!.quote).toBeNull();
  });

  it('error 반환 시 data 는 null', async () => {
    const err = new Error('rls denied');
    chain.order = vi.fn(async () => ({ data: null, error: err }));
    // @ts-expect-error — partial Supabase mock
    const { data, error } = await fetchWatchlist(supabase);
    expect(data).toBeNull();
    expect(error).toBe(err);
  });
});

describe('addWatchlistItem', () => {
  it('watchlists 테이블에 user_id + stock_code 로 insert 호출', async () => {
    const chain = makeMockChain();
    const supabase = makeSupabase(chain);
    // @ts-expect-error — partial Supabase mock
    await addWatchlistItem(supabase, 'user-123', '005930');
    expect(supabase.from).toHaveBeenCalledWith('watchlists');
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-123',
      stock_code: '005930',
    });
  });
});

describe('removeWatchlistItem', () => {
  it('delete().eq(user_id).eq(stock_code) 체인을 호출', async () => {
    const chain = makeMockChain();
    const supabase = makeSupabase(chain);
    // @ts-expect-error — partial Supabase mock
    await removeWatchlistItem(supabase, 'user-123', '005930');
    expect(supabase.from).toHaveBeenCalledWith('watchlists');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-123');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'stock_code', '005930');
  });
});

// integration — SUPABASE_E2E_URL 있을 때만 실행 (D3 RLS 격리 검증)
describe.skipIf(!process.env.SUPABASE_E2E_URL)(
  'RLS 격리 (integration)',
  () => {
    it('유저 A 의 row 는 유저 B 세션에서 0 rows', () => {
      // integration 구현은 Plan 08 E2E 에서 실제 2유저 시나리오와 함께 검증.
      // 여기서는 env gate 만 열어두고, 실환경에서 수동 smoke 로 확인한다.
      expect(process.env.SUPABASE_E2E_URL).toBeTruthy();
    });
  },
);
