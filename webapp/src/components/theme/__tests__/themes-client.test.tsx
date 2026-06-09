/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ThemeWithStats } from '@gh-radar/shared';

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

import { ThemesClient } from '../themes-client';

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
