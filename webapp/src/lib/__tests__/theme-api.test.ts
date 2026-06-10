import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createUserTheme,
  updateUserTheme,
  deleteUserTheme,
  addThemeStock,
  removeThemeStock,
  forkSystemTheme,
  fetchMyThemes,
  fetchSystemThemes,
  isThemeStockLimitError,
  THEME_STOCK_LIMIT_CODE,
} from '../theme-api';

/**
 * Phase 10 Plan 05 Task 1 — theme-api 단위 테스트.
 *
 * watchlist-api.test.ts 패턴 복제:
 * - Supabase 체인 빌더 mock — 각 유저 CRUD 함수가 정확한 from/select/insert/update/delete/eq/is
 *   체인을 호출하는지 + snake_case → camelCase 매핑 검증.
 * - fetchSystemThemes 는 apiFetch('/api/themes') 경유 (Express service-role) — apiFetch mock.
 * - forkSystemTheme: 시스템 메타 read → 유저 테마 insert(is_system=false, owner_id) →
 *   active 멤버십(effective_to IS NULL)만 복사. 과거 제외 이력은 미복사(D-05 스냅샷).
 * - 50-limit: addThemeStock 이 P0001(user_theme_stock_limit_exceeded) 를 식별 가능하게 surface.
 */

// --- apiFetch mock (시스템 테마 Express 경로) ----------------------------------
const apiFetchMock = vi.fn();
vi.mock('../api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// --- Supabase 체인 mock 빌더 (watchlist-api.test.ts 동형) ----------------------
interface MockChain {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

/**
 * 모든 비종단 연산자(select/eq/is/order/update/delete)는 chain 을 반환하고,
 * 종단 연산(single, insert 단독, order 단독)은 overrides 로 결과를 주입한다.
 */
function makeMockChain(overrides?: Partial<MockChain>): MockChain {
  const chain = {} as MockChain;
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(async () => ({ data: [], error: null }));
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  Object.assign(chain, overrides);
  return chain;
}

/**
 * from() 호출마다 다른 chain 을 순서대로 돌려주는 mock supabase.
 * forkSystemTheme 처럼 from() 을 여러 번 호출하는 함수의 단계별 검증에 사용.
 */
function makeSupabase(chains: MockChain[]) {
  let i = 0;
  const from = vi.fn(() => {
    const c = chains[Math.min(i, chains.length - 1)] as MockChain;
    i += 1;
    return c as unknown;
  });
  return { from, _chains: chains };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// fetchSystemThemes — Express /api/themes (service-role 집계)
// =============================================================================
describe('fetchSystemThemes', () => {
  it("apiFetch('/api/themes') 결과를 그대로 반환", async () => {
    const payload = [
      { id: 't1', name: '2차전지', isSystem: true, stockCount: 12 },
    ];
    apiFetchMock.mockResolvedValueOnce(payload);
    const result = await fetchSystemThemes();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/themes');
    expect(result).toEqual(payload);
  });
});

// =============================================================================
// fetchMyThemes — Supabase 직접 (RLS owner-only 자동 필터)
// =============================================================================
describe('fetchMyThemes', () => {
  // 새 구현: 시스템 랭킹과 동일하게 nested embed(theme_stocks→stocks→stock_quotes)로
  // 멤버 시세를 끌어와 클라이언트에서 상위3평균 계산 + desc 정렬. 종단은 await .eq('is_system',false).
  function myThemeRow(
    overrides: Record<string, unknown> = {},
    members: Array<{
      stock_code: string;
      effective_to: string | null;
      change_rate: number;
    }> = [],
  ) {
    return {
      id: 'u1',
      name: '내 관심 테마',
      description: null,
      is_system: false,
      owner_id: 'user-123',
      sources: ['user'],
      top3_avg_change_rate: null,
      stats_updated_at: null,
      created_at: '2026-06-09T00:00:00Z',
      updated_at: '2026-06-09T00:00:00Z',
      theme_stocks: members.map((m) => ({
        stock_code: m.stock_code,
        source: 'user',
        effective_to: m.effective_to,
        stocks: {
          code: m.stock_code,
          name: `종목${m.stock_code}`,
          market: 'KOSPI',
          stock_quotes: {
            price: 1000,
            change_rate: m.change_rate,
            trade_amount: 100,
          },
        },
      })),
      ...overrides,
    };
  }

  it('themes 에서 is_system=false 로 조회 (RLS owner 자동 필터) + stock_quotes embed', async () => {
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: [], error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await fetchMyThemes(supabase);
    expect(supabase.from).toHaveBeenCalledWith('themes');
    const selectArg = (chain.select.mock.calls[0]?.[0] ?? '') as string;
    // 멤버 시세 embed — 상위3평균 클라 계산용
    expect(selectArg).toContain('theme_stocks');
    expect(selectArg).toContain('stock_quotes');
    // RLS 가 owner 자동 필터하지만, 시스템 테마는 명시적으로 제외 (단일 테이블)
    expect(chain.eq).toHaveBeenCalledWith('is_system', false);
  });

  it('snake_case row → ThemeWithStats(camelCase) 매핑 + active 멤버 상위3평균 계산', async () => {
    const row = myThemeRow({}, [
      { stock_code: '0001', effective_to: null, change_rate: 5 },
      { stock_code: '0002', effective_to: null, change_rate: 3 },
      { stock_code: '0003', effective_to: null, change_rate: 1 },
      { stock_code: '0004', effective_to: null, change_rate: -2 },
    ]);
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: [row], error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const themes = await fetchMyThemes(supabase);
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      id: 'u1',
      name: '내 관심 테마',
      isSystem: false,
      ownerId: 'user-123',
      sources: ['user'],
      stockCount: 4,
    });
    // 상위3(5,3,1) 평균 = 3
    expect(themes[0]!.top3AvgChangeRate).toBeCloseTo(3, 5);
  });

  it('제외 멤버(effective_to set)는 집계에서 제외 → stockCount=active 수', async () => {
    const row = myThemeRow({}, [
      { stock_code: '0001', effective_to: null, change_rate: 4 },
      {
        stock_code: '0002',
        effective_to: '2026-06-09T00:00:00Z',
        change_rate: 9,
      },
    ]);
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: [row], error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const themes = await fetchMyThemes(supabase);
    expect(themes[0]!.stockCount).toBe(1);
    expect(themes[0]!.top3AvgChangeRate).toBeCloseTo(4, 5);
  });

  it('종목 없으면 stockCount=0 + top3평균 null', async () => {
    const row = myThemeRow({ id: 'u2', name: '빈 테마' }, []);
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: [row], error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const themes = await fetchMyThemes(supabase);
    expect(themes[0]!.stockCount).toBe(0);
    expect(themes[0]!.top3AvgChangeRate).toBeNull();
  });

  it('상위3평균 desc 정렬 (null 맨 뒤)', async () => {
    const high = myThemeRow({ id: 'hi', updated_at: '2026-06-01T00:00:00Z' }, [
      { stock_code: 'a', effective_to: null, change_rate: 10 },
    ]);
    const low = myThemeRow({ id: 'lo', updated_at: '2026-06-02T00:00:00Z' }, [
      { stock_code: 'b', effective_to: null, change_rate: 2 },
    ]);
    const none = myThemeRow({ id: 'no', updated_at: '2026-06-03T00:00:00Z' }, []);
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: [low, none, high], error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const themes = await fetchMyThemes(supabase);
    expect(themes.map((t) => t.id)).toEqual(['hi', 'lo', 'no']);
  });

  it('error 발생 시 throw', async () => {
    const err = new Error('rls denied');
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: null, error: err })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await expect(fetchMyThemes(supabase)).rejects.toThrow('rls denied');
  });
});

// =============================================================================
// createUserTheme — insert(is_system=false, owner_id)
// =============================================================================
describe('createUserTheme', () => {
  it('themes 에 is_system=false + owner_id 로 insert 후 새 id 반환', async () => {
    const chain = makeMockChain({
      single: vi.fn(async () => ({ data: { id: 'new-theme' }, error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const id = await createUserTheme(supabase, 'user-123', '내 테마');
    expect(supabase.from).toHaveBeenCalledWith('themes');
    expect(chain.insert).toHaveBeenCalledWith({
      name: '내 테마',
      owner_id: 'user-123',
      is_system: false,
    });
    expect(id).toBe('new-theme');
  });

  it('테마 개수 50-limit(P0001) 에러를 식별 가능하게 surface', async () => {
    const limitErr = {
      code: 'P0001',
      message: 'user_theme_count_limit_exceeded',
    };
    const chain = makeMockChain({
      single: vi.fn(async () => ({ data: null, error: limitErr })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await expect(createUserTheme(supabase, 'user-123', '초과 테마')).rejects.toSatisfy(
      (e: unknown) => isThemeStockLimitError(e),
    );
  });
});

// =============================================================================
// updateUserTheme — update(patch).eq(id)
// =============================================================================
describe('updateUserTheme', () => {
  it('update(patch).eq(id) 체인 — RLS 가 본인 테마만 허용', async () => {
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: null, error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await updateUserTheme(supabase, 'u1', { name: '수정', description: '설명' });
    expect(supabase.from).toHaveBeenCalledWith('themes');
    expect(chain.update).toHaveBeenCalledWith({
      name: '수정',
      description: '설명',
    });
    expect(chain.eq).toHaveBeenCalledWith('id', 'u1');
  });
});

// =============================================================================
// deleteUserTheme — delete().eq(id)
// =============================================================================
describe('deleteUserTheme', () => {
  it('delete().eq(id) 체인 — RLS 가 본인 테마만 허용', async () => {
    const chain = makeMockChain({
      eq: vi.fn(async () => ({ data: null, error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await deleteUserTheme(supabase, 'u1');
    expect(supabase.from).toHaveBeenCalledWith('themes');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'u1');
  });
});

// =============================================================================
// addThemeStock — insert(theme_id, stock_code, source='user')
// =============================================================================
describe('addThemeStock', () => {
  it("theme_stocks 에 source='user' 로 insert", async () => {
    const chain = makeMockChain({
      insert: vi.fn(async () => ({ data: null, error: null })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await addThemeStock(supabase, 'u1', '005930');
    expect(supabase.from).toHaveBeenCalledWith('theme_stocks');
    expect(chain.insert).toHaveBeenCalledWith({
      theme_id: 'u1',
      stock_code: '005930',
      source: 'user',
    });
  });

  it('종목 50-limit(P0001 user_theme_stock_limit_exceeded) 을 식별 가능하게 surface', async () => {
    const limitErr = {
      code: 'P0001',
      message: 'user_theme_stock_limit_exceeded',
    };
    const chain = makeMockChain({
      insert: vi.fn(async () => ({ data: null, error: limitErr })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const thrown = await addThemeStock(supabase, 'u1', '005930').catch((e) => e);
    expect(isThemeStockLimitError(thrown)).toBe(true);
    expect(THEME_STOCK_LIMIT_CODE).toBe('P0001');
  });

  it('P0001 이 아닌 에러는 그대로 throw (식별 false)', async () => {
    const otherErr = { code: '42501', message: 'permission denied' };
    const chain = makeMockChain({
      insert: vi.fn(async () => ({ data: null, error: otherErr })),
    });
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    const thrown = await addThemeStock(supabase, 'u1', '005930').catch((e) => e);
    expect(isThemeStockLimitError(thrown)).toBe(false);
  });
});

// =============================================================================
// removeThemeStock — delete().eq(theme_id).eq(stock_code)
// =============================================================================
describe('removeThemeStock', () => {
  it('delete().eq(theme_id).eq(stock_code) 체인', async () => {
    const chain = makeMockChain({
      eq: vi.fn(() => chain),
    });
    // 두 번째 eq 가 종단 — Promise resolve
    chain.eq = vi
      .fn()
      .mockImplementationOnce(() => chain)
      .mockImplementationOnce(async () => ({ data: null, error: null }));
    const supabase = makeSupabase([chain]);
    // @ts-expect-error — partial Supabase mock
    await removeThemeStock(supabase, 'u1', '005930');
    expect(supabase.from).toHaveBeenCalledWith('theme_stocks');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'theme_id', 'u1');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'stock_code', '005930');
  });
});

// =============================================================================
// forkSystemTheme — INSERT-SELECT 스냅샷 (D-05, RESEARCH §Pattern 7)
// =============================================================================
describe('forkSystemTheme', () => {
  function buildForkSupabase(opts: {
    sys: { name: string; description: string | null } | null;
    newId: string;
    members: { stock_code: string }[];
  }) {
    // chain[0]: themes select(...).eq(id).eq(is_system,true).single()  → sys
    const sysChain = makeMockChain({
      single: vi.fn(async () => ({ data: opts.sys, error: opts.sys ? null : new Error('not found') })),
    });
    // chain[1]: themes insert(...).select('id').single()  → { id: newId }
    const insertThemeChain = makeMockChain({
      single: vi.fn(async () => ({ data: { id: opts.newId }, error: null })),
    });
    // chain[2]: theme_stocks select('stock_code').eq(theme_id).is(effective_to,null)  → members
    const membersChain = makeMockChain({
      is: vi.fn(async () => ({ data: opts.members, error: null })),
    });
    // chain[3]: theme_stocks insert(rows)  → ok
    const insertStocksChain = makeMockChain({
      insert: vi.fn(async () => ({ data: null, error: null })),
    });
    return makeSupabase([sysChain, insertThemeChain, membersChain, insertStocksChain]);
  }

  it('시스템 메타 read → 유저 테마 insert(is_system=false, owner_id) → active 멤버십만 복사 → 새 id 반환', async () => {
    const supabase = buildForkSupabase({
      sys: { name: '2차전지', description: '배터리 밸류체인' },
      newId: 'forked-id',
      members: [{ stock_code: '005930' }, { stock_code: '373220' }],
    });
    // @ts-expect-error — partial Supabase mock
    const newId = await forkSystemTheme(supabase, 'user-123', 'sys-theme-id');

    expect(newId).toBe('forked-id');
    const chains = supabase._chains;

    // 1) 시스템 메타 read: eq(id) + eq(is_system,true)
    expect(chains[0]!.eq).toHaveBeenCalledWith('id', 'sys-theme-id');
    expect(chains[0]!.eq).toHaveBeenCalledWith('is_system', true);

    // 2) 유저 테마 insert: is_system=false + owner_id (시스템 이름/설명 승계)
    expect(chains[1]!.insert).toHaveBeenCalledWith({
      name: '2차전지',
      description: '배터리 밸류체인',
      owner_id: 'user-123',
      is_system: false,
    });

    // 3) active 멤버십만: is('effective_to', null) — 과거 제외 이력 미복사 (D-05 스냅샷)
    expect(chains[2]!.is).toHaveBeenCalledWith('effective_to', null);

    // 4) theme_stocks insert: 복사된 종목 전부 source='user' + 새 theme_id
    expect(chains[3]!.insert).toHaveBeenCalledWith([
      { theme_id: 'forked-id', stock_code: '005930', source: 'user' },
      { theme_id: 'forked-id', stock_code: '373220', source: 'user' },
    ]);
  });

  it('active 멤버십이 비어 있으면 종목 insert 스킵 + 빈 테마 id 반환', async () => {
    const supabase = buildForkSupabase({
      sys: { name: '빈 시스템 테마', description: null },
      newId: 'forked-empty',
      members: [],
    });
    // @ts-expect-error — partial Supabase mock
    const newId = await forkSystemTheme(supabase, 'user-123', 'sys-empty');
    expect(newId).toBe('forked-empty');
    // 멤버 0 → theme_stocks insert 호출 안 함 (빈 배열 insert 회피)
    expect(supabase._chains[3]!.insert).not.toHaveBeenCalled();
  });

  it('시스템 테마가 없으면 throw (잘못된 sysId / 유저 테마 fork 시도 차단)', async () => {
    const supabase = buildForkSupabase({
      sys: null,
      newId: 'never',
      members: [],
    });
    // @ts-expect-error — partial Supabase mock
    await expect(forkSystemTheme(supabase, 'user-123', 'bad-id')).rejects.toThrow();
  });
});
