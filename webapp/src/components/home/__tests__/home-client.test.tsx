/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { HomeSnapshotResponse } from '@gh-radar/shared';

const fetchHomeMock = vi.fn();
vi.mock('@/lib/home-api', () => ({
  fetchHome: (...a: unknown[]) => fetchHomeMock(...a),
}));

import { HomeClient } from '../home-client';

/**
 * quick-260913-g4c — 홈 자동 갱신은 최신 보기(selected === null)에서만.
 * 과거 슬롯 탐색 중에는 자동 요청 0건(화면 점프 방지), '오늘' 복귀 시 30초 폴링 재개.
 */

const DATE = '2026-09-14';
const SLOT_A = '2026-09-14T00:59:00.000Z'; // 09:59 KST
const SLOT_B = '2026-09-14T01:00:00.000Z'; // 10:00 KST (최신)

const RESPONSE: HomeSnapshotResponse = {
  snapshot: {
    tradeDate: DATE,
    capturedAt: SLOT_B,
    themeCount: 0,
    stockCount: 1,
    isCarried: false,
    payload: {
      threshold: 15,
      marketStatus: 'open',
      themes: [],
      singles: [{ code: '035720', name: '카카오', changeRate: 22.8, reason: null, news: [] }],
    },
  },
  index: [
    { tradeDate: DATE, capturedAt: SLOT_B, themeCount: 0, stockCount: 1, isCarried: false },
    { tradeDate: DATE, capturedAt: SLOT_A, themeCount: 0, stockCount: 1, isCarried: false },
  ],
};

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('HomeClient 자동 갱신 (최신 보기에서만)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-14T01:00:10Z')); // 월 10:00 KST
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    fetchHomeMock.mockReset();
    fetchHomeMock.mockResolvedValue(RESPONSE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });

  it('최신 보기 30s 폴링 → 과거 슬롯 선택 후 60s 추가 호출 0 → 오늘 복귀 후 다시 30s 폴링', async () => {
    render(<HomeClient />);
    const slider = await screen.findByRole('slider', { name: '시점 선택' });
    expect(fetchHomeMock).toHaveBeenCalledTimes(1);

    // 최신 보기 — 30s 후 1회 증가.
    await advance(30_000);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(2));

    // 과거 슬롯(09:59) 선택 → 500ms 디바운스 후 그 슬롯 조회 1회.
    fireEvent.change(slider, { target: { value: '0' } });
    await advance(500);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(3));
    // index 를 이미 가졌으므로 indexSince(증분)가 함께 갈 수 있다 — 슬롯 선택 계약만 본다.
    expect(fetchHomeMock.mock.calls[2][0]).toMatchObject({ date: DATE, capturedAt: SLOT_A });

    // 탐색 중 — 60s 동안 자동 요청 0.
    await advance(60_000);
    expect(fetchHomeMock).toHaveBeenCalledTimes(3);

    // '오늘' → 무필터 즉시 조회 + 폴링 재개.
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(4));
    expect(fetchHomeMock.mock.calls[3][0].date).toBeUndefined();
    expect(fetchHomeMock.mock.calls[3][0].capturedAt).toBeUndefined();
    await advance(30_000);
    await waitFor(() => expect(fetchHomeMock).toHaveBeenCalledTimes(5));
  });
});

/**
 * quick-260914-jtj — "주도 테마 N" 제목 행 '전체 복사' → 보고 있는 스냅샷의 모든 테마.
 * 실제 타이머 사용(자동 갱신 describe 와 독립). setup.ts 가 테스트마다 쿼리 캐시를 비운다.
 */
const THEMED_RESPONSE: HomeSnapshotResponse = {
  snapshot: {
    tradeDate: DATE,
    capturedAt: SLOT_B,
    themeCount: 2,
    stockCount: 4,
    isCarried: false,
    payload: {
      threshold: 15,
      marketStatus: 'open',
      themes: [
        {
          name: '2차전지',
          reason: '리튬 가격 반등·수주 공시',
          stocks: [
            { code: '003670', name: '포스코퓨처엠', changeRate: 22.3 },
            { code: '086520', name: '에코프로', changeRate: 29.9 },
          ],
          news: [{ title: '리튬 반등 기사', url: 'https://example.com/li', source: '연합뉴스' }],
        },
        {
          name: '원전',
          reason: null,
          stocks: [
            { code: '052690', name: '한전기술', changeRate: 20 },
            { code: '034020', name: '두산에너빌리티', changeRate: 23 },
          ],
          news: [],
        },
      ],
      singles: [],
    },
  },
  index: [
    { tradeDate: DATE, capturedAt: SLOT_B, themeCount: 2, stockCount: 4, isCarried: false },
  ],
};

describe('주도 테마 전체 복사 (quick-260914-jtj)', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    fetchHomeMock.mockReset();
    fetchHomeMock.mockResolvedValue(THEMED_RESPONSE);
  });

  afterEach(() => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    vi.restoreAllMocks();
  });

  it('제목 행 버튼 클릭 → 헤더 + 번호 블록 전체를 복사하고 복사됨 표시', async () => {
    render(<HomeClient />);

    const button = await screen.findByRole('button', { name: '주도 테마 전체 복사' });
    expect(button).toHaveTextContent('전체 복사');
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(
      '[주도 테마] 2026-09-14 10:00\n\n1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%\n\n2. 원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%',
    );
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
  });
});

/**
 * quick-260923-cre — "개별 급등 N" 제목 행 '전체 복사' → 보고 있는 스냅샷의 개별 급등 전체.
 * 주도 테마 복사와 섹션별로 독립(D-07). 실제 타이머.
 */
const S1 = {
  code: '042700',
  name: '한미반도체',
  changeRate: 29.9,
  reason: 'HBM 장비 수주 공시',
  news: [{ title: '한미반도체 수주 기사', url: 'https://example.com/hm', source: '연합뉴스' }],
};
const S2 = { code: '035720', name: '카카오', changeRate: 22.8, reason: null, news: [] };

const SINGLES_TEXT =
  '[개별 급등] 2026-09-14 10:00\n\n1. 한미반도체 +29.9%\nHBM 장비 수주 공시\n\n2. 카카오 +22.8%';

const SINGLES_ONLY_RESPONSE: HomeSnapshotResponse = {
  snapshot: {
    ...THEMED_RESPONSE.snapshot!,
    themeCount: 0,
    stockCount: 2,
    payload: { ...THEMED_RESPONSE.snapshot!.payload, themes: [], singles: [S1, S2] },
  },
  index: [
    { tradeDate: DATE, capturedAt: SLOT_B, themeCount: 0, stockCount: 2, isCarried: false },
  ],
};

const BOTH_RESPONSE: HomeSnapshotResponse = {
  snapshot: {
    ...THEMED_RESPONSE.snapshot!,
    themeCount: 2,
    stockCount: 6,
    payload: { ...THEMED_RESPONSE.snapshot!.payload, singles: [S1, S2] },
  },
  index: [
    { tradeDate: DATE, capturedAt: SLOT_B, themeCount: 2, stockCount: 6, isCarried: false },
  ],
};

describe('개별 급등 전체 복사 (quick-260923-cre)', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    fetchHomeMock.mockReset();
  });

  afterEach(() => {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    vi.restoreAllMocks();
  });

  it('주도 테마가 없어도 제목 행 버튼이 개별 급등 전체를 복사한다', async () => {
    fetchHomeMock.mockResolvedValue(SINGLES_ONLY_RESPONSE);
    render(<HomeClient />);

    const button = await screen.findByRole('button', { name: '개별 급등 전체 복사' });
    expect(screen.queryByRole('button', { name: '주도 테마 전체 복사' })).toBeNull();
    expect(button).toHaveTextContent('전체 복사');
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SINGLES_TEXT);
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
  });

  it('두 섹션 버튼은 각자 자기 섹션만 복사한다 (D-07)', async () => {
    fetchHomeMock.mockResolvedValue(BOTH_RESPONSE);
    render(<HomeClient />);

    const singlesBtn = await screen.findByRole('button', { name: '개별 급등 전체 복사' });
    expect(screen.getByRole('button', { name: '한미반도체 급등이유 복사' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카카오 급등이유 복사' })).toBeInTheDocument();

    fireEvent.click(singlesBtn);
    expect(writeText).toHaveBeenNthCalledWith(1, SINGLES_TEXT);
    expect(writeText.mock.calls[0][0]).not.toContain('[주도 테마]');

    fireEvent.click(screen.getByRole('button', { name: '주도 테마 전체 복사' }));
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      '[주도 테마] 2026-09-14 10:00\n\n1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%\n\n2. 원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%',
    );
    expect(writeText.mock.calls[1][0]).not.toContain('[개별 급등]');
  });
});

/**
 * quick-260926-o2u D2·D4 — 홈은 공용 PageHeader(22px · 뒤로가기 없음 — 탭 루트)와 섹션 머리 문법
 * (15px muted 제목 + 13px faint 평문 개수, 알약 없음)을 쓴다. 날짜 네비·시점 슬라이더는 그대로다.
 */
describe('홈 헤더·섹션 머리 문법 (quick-260926-o2u)', () => {
  beforeEach(() => {
    fetchHomeMock.mockReset();
    fetchHomeMock.mockResolvedValue(BOTH_RESPONSE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('「주도 테마」·「개별 급등」 h2 = 15px muted, 바로 뒤 개수는 faint 평문(알약 아님)', async () => {
    render(<HomeClient />);

    const themesH2 = await screen.findByRole('heading', { level: 2, name: '주도 테마' });
    const singlesH2 = screen.getByRole('heading', { level: 2, name: '개별 급등' });
    for (const [h2, n] of [
      [themesH2, 2],
      [singlesH2, 2],
    ] as const) {
      expect(h2.className).toContain('text-[15px]');
      expect(h2.className).toContain('text-[var(--muted-fg)]');
      const count = h2.nextElementSibling as HTMLElement;
      expect(count).toHaveTextContent(String(n));
      expect(count.className).toContain('text-[var(--faint)]');
      expect(count.className).not.toContain('rounded-full');
    }
  });

  it('h1 「오늘의 급등 테마」 = 22px, 날짜 네비·시점 슬라이더 유지, 뒤로가기 없음', async () => {
    render(<HomeClient />);

    const h1 = await screen.findByRole('heading', { level: 1, name: '오늘의 급등 테마' });
    expect(h1.className).toContain('text-[22px]');
    expect(screen.getByRole('button', { name: '이전 날짜' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 날짜' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오늘' })).toBeInTheDocument();
    expect(await screen.findByRole('slider', { name: '시점 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '뒤로가기' })).toBeNull();
  });
});
