/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ThemeStockMember, ThemeWithStats } from '@gh-radar/shared';

/**
 * Phase 10 Plan 07 — 테마 UI 단위 테스트.
 *
 * Task 1: ThemesClient (변형 C 랭킹 + 내 테마 칩 + empty + 강도막대 색)
 * Task 2: ThemeDetailClient (ThemeStockMember → StockWithProximity 매핑 + scanner 재사용)
 * Task 3: StockThemeChips (theme_stocks 역조회 + overflow + 빈 분류)
 *
 * useThemesQuery / useAuth / theme-api / supabase 는 mock — 렌더 계약만 검증.
 */

// ---------- Mocks ----------

const useThemesQueryMock = vi.fn();
vi.mock('@/hooks/use-themes-query', () => ({
  useThemesQuery: () => useThemesQueryMock(),
}));

const useAuthMock = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => useAuthMock(),
}));

// next/navigation — ThemeDetailClient 가 삭제 후 router.push('/themes') (10-07 optimistic).
const routerPushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

// theme-edit-dialog 의 무거운 의존(command/supabase) 차단 — 렌더만 stub.
// onSaved/onDeleted 콜백을 버튼으로 노출해 ThemesClient 의 낙관적 배선(upsert/remove + refresh)을 검증.
vi.mock('@/components/theme/theme-edit-dialog', () => ({
  ThemeEditDialog: ({
    open,
    onSaved,
    onDeleted,
  }: {
    open: boolean;
    onSaved: (theme: ThemeWithStats) => void;
    onDeleted?: (id: string) => void;
  }) =>
    open ? (
      <div data-testid="edit-dialog">
        <button
          type="button"
          onClick={() =>
            onSaved({
              id: 'new-theme',
              name: '새로 만든 테마',
              description: null,
              isSystem: false,
              ownerId: 'user-1',
              sources: ['user'],
              top3AvgChangeRate: null,
              statsUpdatedAt: null,
              createdAt: '2026-06-09T00:00:00Z',
              updatedAt: '2026-06-09T00:00:00Z',
              stockCount: 1,
              stocks: [],
            })
          }
        >
          mock-save
        </button>
        <button type="button" onClick={() => onDeleted?.('del-theme')}>
          mock-delete
        </button>
      </div>
    ) : null,
}));

// theme-api fetchers — 상세 조회(Task 2) mock.
const fetchSystemThemeDetailMock = vi.fn();
const fetchMyThemeDetailMock = vi.fn();
vi.mock('@/lib/theme-api', () => ({
  fetchSystemThemeDetail: (...a: unknown[]) => fetchSystemThemeDetailMock(...a),
  fetchMyThemeDetail: (...a: unknown[]) => fetchMyThemeDetailMock(...a),
}));

// supabase client — fetchMyThemeDetail 폴백 경로 stub + theme-chips 역조회 mock.
// theme_stocks.select().eq().is() 체인이 themeStocksResult 로 resolve.
let themeStocksResult: { data: unknown; error: unknown } = {
  data: [],
  error: null,
};
vi.mock('@/lib/supabase/client', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.is = () => Promise.resolve(themeStocksResult);
    return builder;
  };
  return {
    createClient: () => ({
      from: () => makeBuilder(),
    }),
  };
});

// scanner-table 내부 WatchlistToggle 이 useWatchlistSet 요구 — 비로그인이면 null 이라
// 안전하나, provider 부재 시 default EMPTY 반환하도록 stub.
vi.mock('@/hooks/use-watchlist-set', () => ({
  useWatchlistSet: () => ({
    set: new Set<string>(),
    isAtLimit: false,
    optimisticAdd: vi.fn(),
    optimisticRemove: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { ThemesClient } from '../themes-client';
import { ThemeDetailClient } from '../theme-detail-client';
import { StockThemeChips } from '../theme-chips';

// ---------- Fixtures ----------

function sysTheme(
  id: string,
  name: string,
  top3: number | null,
  sources: ThemeWithStats['sources'] = ['naver'],
  stockCount = 5,
): ThemeWithStats {
  return {
    id,
    name,
    description: null,
    isSystem: true,
    ownerId: null,
    sources,
    top3AvgChangeRate: top3,
    statsUpdatedAt: null,
    createdAt: '2026-06-09T00:00:00Z',
    updatedAt: '2026-06-09T00:00:00Z',
    stockCount,
  };
}

function myTheme(id: string, name: string, top3: number | null): ThemeWithStats {
  return {
    id,
    name,
    description: null,
    isSystem: false,
    ownerId: 'user-1',
    sources: ['user'],
    top3AvgChangeRate: top3,
    statsUpdatedAt: null,
    createdAt: '2026-06-09T00:00:00Z',
    updatedAt: '2026-06-09T00:00:00Z',
    stockCount: 3,
  };
}

function setQuery(partial: Partial<ReturnType<typeof baseQuery>>) {
  useThemesQueryMock.mockReturnValue({ ...baseQuery(), ...partial });
}

function baseQuery() {
  return {
    systemThemes: [] as ThemeWithStats[],
    myThemes: [] as ThemeWithStats[],
    isLoading: false,
    isRefreshing: false,
    error: null as Error | null,
    refresh: vi.fn(),
    upsertMyTheme: vi.fn(),
    removeMyTheme: vi.fn(),
  };
}

beforeEach(() => {
  useThemesQueryMock.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'user-1' } });
  setQuery({});
});

describe('ThemesClient — 변형 C 랭킹', () => {
  it('내 테마가 상단 칩으로, 시스템 테마가 랭킹 리스트로 렌더된다', () => {
    setQuery({
      myThemes: [myTheme('m1', '내 급등관심', 15.1)],
      systemThemes: [
        sysTheme('s1', '초전도체', 18.4),
        sysTheme('s2', '이재명(정치)', 14.2, ['alphasquare'], 41),
      ],
    });
    render(<ThemesClient />);

    // 내 테마 칩
    expect(screen.getByText('내 급등관심')).toBeInTheDocument();
    // 시스템 랭킹
    expect(screen.getByText('초전도체')).toBeInTheDocument();
    expect(screen.getByText('이재명(정치)')).toBeInTheDocument();
    // 카피 계약 (헤더 sub + sort pill 두 곳에 노출)
    expect(screen.getAllByText(/상위 3종목 평균 등락률/).length).toBeGreaterThan(0);
  });

  it('시스템 랭킹은 서버 정렬 순서(top3 desc)를 그대로 1,2,… 순위로 매긴다', () => {
    setQuery({
      systemThemes: [
        sysTheme('s1', '초전도체', 18.4),
        sysTheme('s2', '이재명(정치)', 14.2),
        sysTheme('s3', '한동훈(정치)', -2.4),
      ],
    });
    render(<ThemesClient />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    // 첫 행 = 순위 1 + 초전도체, 마지막 행 = 순위 3 + 한동훈
    expect(within(items[0]!).getByText('1')).toBeInTheDocument();
    expect(within(items[0]!).getByText('초전도체')).toBeInTheDocument();
    expect(within(items[2]!).getByText('3')).toBeInTheDocument();
    expect(within(items[2]!).getByText('한동훈(정치)')).toBeInTheDocument();
  });

  it('강도 막대 색: 양수 평균은 --up, 음수 평균은 --down', () => {
    setQuery({
      systemThemes: [
        sysTheme('s1', '초전도체', 18.4),
        sysTheme('s3', '한동훈(정치)', -2.4),
      ],
    });
    const { container } = render(<ThemesClient />);
    const bars = container.querySelectorAll('span[style*="width"]');
    // 두 행 각각 1개씩 막대
    expect(bars.length).toBeGreaterThanOrEqual(2);
    const classes = Array.from(bars).map((b) => b.className);
    expect(classes.some((c) => c.includes('bg-[var(--up)]'))).toBe(true);
    expect(classes.some((c) => c.includes('bg-[var(--down)]'))).toBe(true);
  });

  it('내 테마 empty: 로그인 유저는 "아직 내 테마가 없어요" + 생성 CTA 노출', () => {
    setQuery({ myThemes: [], systemThemes: [sysTheme('s1', '초전도체', 18.4)] });
    render(<ThemesClient />);
    expect(screen.getByText('아직 내 테마가 없어요')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /테마 만들기/ }).length,
    ).toBeGreaterThan(0);
  });

  it('loading=true → skeleton(role=status, aria-busy) 노출', () => {
    setQuery({ isLoading: true });
    render(<ThemesClient />);
    expect(screen.getByLabelText('테마 로딩 중')).toBeInTheDocument();
  });

  it('error + 시스템 0개 → role=alert + 에러 카피', () => {
    setQuery({ error: new Error('boom'), systemThemes: [] });
    render(<ThemesClient />);
    expect(
      screen.getByText('테마를 불러오지 못했습니다. 새로고침해주세요.'),
    ).toBeInTheDocument();
  });

  it('출처 푸터 카피가 노출된다', () => {
    setQuery({ systemThemes: [sysTheme('s1', '초전도체', 18.4)] });
    render(<ThemesClient />);
    expect(
      screen.getByText(/출처: 네이버 금융 테마 · 알파스퀘어 · 일 1회 16:00 KST 갱신/),
    ).toBeInTheDocument();
  });

  it('비로그인 시 내 테마 섹션은 로그인 유도, 생성 CTA 미노출', () => {
    useAuthMock.mockReturnValue({ user: null });
    setQuery({ systemThemes: [sysTheme('s1', '초전도체', 18.4)] });
    render(<ThemesClient />);
    expect(screen.getByText(/로그인하면 나만의 테마를/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /테마 만들기/ })).toBeNull();
  });

  // ── 낙관적 갱신 배선 (10-07 optimistic) ──────────────────────────
  // 다이얼로그 onSaved → upsertMyTheme(즉시 반영) + refresh(reconcile),
  // onDeleted → removeMyTheme(즉시 제거) + refresh.

  it('onSaved: upsertMyTheme 를 먼저 호출하고 이어서 refresh 로 reconcile', () => {
    const upsertMyTheme = vi.fn();
    const refresh = vi.fn();
    setQuery({
      systemThemes: [sysTheme('s1', '초전도체', 18.4)],
      upsertMyTheme,
      refresh,
    });
    render(<ThemesClient />);

    // 생성 CTA → 다이얼로그 오픈 → mock-save 클릭(onSaved 발화).
    fireEvent.click(screen.getAllByRole('button', { name: /테마 만들기/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'mock-save' }));

    expect(upsertMyTheme).toHaveBeenCalledTimes(1);
    expect(upsertMyTheme).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-theme', isSystem: false }),
    );
    // 낙관적 갱신 후 reconcile refresh 도 호출.
    expect(refresh).toHaveBeenCalled();
  });

  it('onDeleted: removeMyTheme(id) 를 호출하고 refresh 로 reconcile', () => {
    const removeMyTheme = vi.fn();
    const refresh = vi.fn();
    setQuery({
      systemThemes: [sysTheme('s1', '초전도체', 18.4)],
      removeMyTheme,
      refresh,
    });
    render(<ThemesClient />);

    fireEvent.click(screen.getAllByRole('button', { name: /테마 만들기/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'mock-delete' }));

    expect(removeMyTheme).toHaveBeenCalledWith('del-theme');
    expect(refresh).toHaveBeenCalled();
  });
});

// ============================================================================
// Task 2 — ThemeDetailClient (scanner row 재사용 + 유저/시스템 분기)
// ============================================================================

function member(
  code: string,
  name: string,
  changeRate: number,
): ThemeStockMember {
  return {
    code,
    name,
    market: 'KOSPI',
    price: 50000,
    changeRate,
    tradeAmount: 1_000_000,
    source: 'naver',
  };
}

function detail(
  partial: Partial<ThemeWithStats & { stocks: ThemeStockMember[] }>,
): ThemeWithStats & { stocks: ThemeStockMember[] } {
  return {
    ...sysTheme('d1', '초전도체', 18.4),
    stocks: [],
    ...partial,
  };
}

describe('ThemeDetailClient — scanner row 재사용', () => {
  beforeEach(() => {
    // 상세 화면은 비로그인으로 렌더(WatchlistToggle null) — 매핑/재사용만 검증.
    useAuthMock.mockReturnValue({ user: null });
  });

  it('ThemeStockMember → StockWithProximity 매핑 후 scanner-table 에 종목 행을 렌더', async () => {
    fetchSystemThemeDetailMock.mockResolvedValue(
      detail({
        name: '초전도체',
        stocks: [member('005930', '삼성전자', 29.9), member('000660', 'SK하이닉스', 12.1)],
      }),
    );
    render(<ThemeDetailClient id="d1" />);

    // lg Table + <lg Card 둘 다 렌더 → 종목명 2회 노출(반응형 duality).
    await waitFor(() =>
      expect(screen.getAllByText('삼성전자').length).toBeGreaterThan(0),
    );
    // scanner-table 재사용 — 종목명/코드/등락률(매핑된 changeRate) 노출
    expect(screen.getAllByText('SK하이닉스').length).toBeGreaterThan(0);
    expect(screen.getAllByText('005930').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+29.90%').length).toBeGreaterThan(0);
  });

  it('종목 리스트를 등락률 내림차순으로 정렬해 렌더 (입력 순서 무관)', async () => {
    // 입력은 등락률 오름차순 — 정렬하지 않으면 카카오가 맨 위로 렌더된다.
    fetchSystemThemeDetailMock.mockResolvedValue(
      detail({
        stocks: [
          member('035720', '카카오', -3.2),
          member('000660', 'SK하이닉스', 5.0),
          member('005930', '삼성전자', 29.9),
        ],
      }),
    );
    render(<ThemeDetailClient id="d1" />);
    await waitFor(() =>
      expect(screen.getAllByText('삼성전자').length).toBeGreaterThan(0),
    );
    // 첫 occurrence(ScannerTable 이 ScannerCardList 보다 먼저 렌더)의 문서 순서로 검증:
    // 등락률 desc → 삼성전자(29.9) → SK하이닉스(5.0) → 카카오(-3.2)
    const sam = screen.getAllByText('삼성전자')[0];
    const sk = screen.getAllByText('SK하이닉스')[0];
    const kakao = screen.getAllByText('카카오')[0];
    expect(
      sam.compareDocumentPosition(sk) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      sk.compareDocumentPosition(kakao) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('빈 테마 → "이 테마에 표시할 종목이 없습니다"', async () => {
    fetchSystemThemeDetailMock.mockResolvedValue(detail({ stocks: [] }));
    render(<ThemeDetailClient id="d1" />);
    await waitFor(() =>
      expect(
        screen.getByText('이 테마에 표시할 종목이 없습니다'),
      ).toBeInTheDocument(),
    );
  });

  it('시스템 테마는 [편집] 버튼 미노출 (read-only)', async () => {
    fetchSystemThemeDetailMock.mockResolvedValue(
      detail({ isSystem: true, stocks: [member('005930', '삼성전자', 1.2)] }),
    );
    render(<ThemeDetailClient id="d1" />);
    await waitFor(() =>
      expect(screen.getAllByText('삼성전자').length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('button', { name: '편집' })).toBeNull();
  });

  it('유저 테마는 [편집] 버튼 노출 (시스템 404 → fetchMyThemeDetail 폴백)', async () => {
    const { ApiClientError } = await import('@/lib/api');
    fetchSystemThemeDetailMock.mockRejectedValue(
      new ApiClientError({ code: 'THEME_NOT_FOUND', message: '없음', status: 404 }),
    );
    fetchMyThemeDetailMock.mockResolvedValue(
      detail({
        id: 'u1',
        name: '내 급등관심',
        isSystem: false,
        ownerId: 'user-1',
        sources: ['user'],
        stocks: [member('005930', '삼성전자', 1.2)],
      }),
    );
    render(<ThemeDetailClient id="u1" />);

    await waitFor(() =>
      expect(screen.getByText('내 급등관심')).toBeInTheDocument(),
    );
    expect(fetchMyThemeDetailMock).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '편집' })).toBeInTheDocument();
  });

  it('fetch 실패 시 고정 카피(내부 메시지 미노출)', async () => {
    fetchSystemThemeDetailMock.mockRejectedValue(new Error('PGRST internal'));
    render(<ThemeDetailClient id="d1" />);
    await waitFor(() =>
      expect(
        screen.getByText(/테마를 불러오지 못했습니다/),
      ).toBeInTheDocument(),
    );
    // 내부 메시지 누출 0
    expect(screen.queryByText(/PGRST internal/)).toBeNull();
  });
});

// ============================================================================
// Task 3 — StockThemeChips (theme_stocks 역조회 + overflow + 빈 분류)
// ============================================================================

function themeStockRow(
  id: string,
  name: string,
  isSystem: boolean,
): { theme_id: string; themes: { id: string; name: string; is_system: boolean; owner_id: string | null } } {
  return {
    theme_id: id,
    themes: { id, name, is_system: isSystem, owner_id: isSystem ? null : 'user-1' },
  };
}

describe('StockThemeChips — 역조회 + overflow', () => {
  beforeEach(() => {
    themeStocksResult = { data: [], error: null };
  });

  it('시스템 + 내 테마 칩을 함께 렌더하고 클릭 시 /themes/[id] 로 이동한다', async () => {
    themeStocksResult = {
      data: [
        themeStockRow('s1', '초전도체', true),
        themeStockRow('u1', '내 급등관심', false),
      ],
      error: null,
    };
    render(<StockThemeChips stockCode="005930" />);

    await waitFor(() =>
      expect(screen.getByText('초전도체')).toBeInTheDocument(),
    );
    expect(screen.getByText('내 급등관심')).toBeInTheDocument();
    // 칩 = /themes/[id] 링크
    expect(
      screen.getByLabelText('초전도체 테마로 이동').getAttribute('href'),
    ).toBe('/themes/s1');
    expect(
      screen.getByLabelText('내 급등관심 테마로 이동').getAttribute('href'),
    ).toBe('/themes/u1');
  });

  it('7개 이상이면 6개 표시 + "+N" overflow 트리거를 노출한다', async () => {
    themeStocksResult = {
      data: Array.from({ length: 8 }).map((_, i) =>
        themeStockRow(`t${i}`, `테마${i}`, true),
      ),
      error: null,
    };
    render(<StockThemeChips stockCode="005930" />);

    await waitFor(() =>
      expect(screen.getByText('테마0')).toBeInTheDocument(),
    );
    // 8 - 6 = 2 overflow
    expect(
      screen.getByRole('button', { name: '테마 2개 더 보기' }),
    ).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('분류된 테마가 없으면 "분류된 테마 없음" 안내를 노출한다', async () => {
    themeStocksResult = { data: [], error: null };
    render(<StockThemeChips stockCode="005930" />);
    await waitFor(() =>
      expect(screen.getByText('분류된 테마 없음')).toBeInTheDocument(),
    );
  });

  it('PostgREST 가 themes 를 array 로 반환해도 방어적으로 매핑한다', async () => {
    themeStocksResult = {
      data: [
        {
          theme_id: 's1',
          themes: [{ id: 's1', name: '2차전지', is_system: true, owner_id: null }],
        },
      ],
      error: null,
    };
    render(<StockThemeChips stockCode="005930" />);
    await waitFor(() =>
      expect(screen.getByText('2차전지')).toBeInTheDocument(),
    );
  });

  it('역조회 에러 시 칩/안내 모두 렌더하지 않고 조용히 폴백한다', async () => {
    themeStocksResult = { data: null, error: { message: 'rls denied' } };
    render(<StockThemeChips stockCode="005930" />);
    // loaded=true 후 themes=[] → "분류된 테마 없음" (에러 메시지 누출 0)
    await waitFor(() =>
      expect(screen.getByText('분류된 테마 없음')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/rls denied/)).toBeNull();
  });
});
