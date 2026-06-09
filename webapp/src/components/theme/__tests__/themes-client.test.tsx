/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

// theme-edit-dialog 의 무거운 의존(command/supabase) 차단 — 렌더만 stub.
vi.mock('@/components/theme/theme-edit-dialog', () => ({
  ThemeEditDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-dialog" /> : null,
}));

// theme-api fetchers — 상세 조회(Task 2) mock.
const fetchSystemThemeDetailMock = vi.fn();
const fetchMyThemeDetailMock = vi.fn();
vi.mock('@/lib/theme-api', () => ({
  fetchSystemThemeDetail: (...a: unknown[]) => fetchSystemThemeDetailMock(...a),
  fetchMyThemeDetail: (...a: unknown[]) => fetchMyThemeDetailMock(...a),
}));

// supabase client (fetchMyThemeDetail 폴백 경로용) — 직접 호출 안 되게 stub.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}));

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
      screen.getByText(/출처: 네이버 금융 테마 · 알파스퀘어 · AI 보강\(Claude\)/),
    ).toBeInTheDocument();
  });

  it('비로그인 시 내 테마 섹션은 로그인 유도, 생성 CTA 미노출', () => {
    useAuthMock.mockReturnValue({ user: null });
    setQuery({ systemThemes: [sysTheme('s1', '초전도체', 18.4)] });
    render(<ThemesClient />);
    expect(screen.getByText(/로그인하면 나만의 테마를/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /테마 만들기/ })).toBeNull();
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
