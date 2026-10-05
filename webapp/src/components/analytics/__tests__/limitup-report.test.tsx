import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import type { LimitupReportResponse } from '@gh-radar/shared';

/**
 * Phase 28 Plan 12 Task 2 — `/analytics/limitup` 본문 (UI-SPEC ④-0 · ④-1 · ④-2 · 상태 매트릭스 보고서 행 · E5 · E6 · E11).
 *
 * 잠그는 것: 머리 + 날짜 알약(로딩 중에도) · 「불러오는 중…」 · 에러 + 다시 시도 → 재호출 · 401/403/useDmaGateReason → DmaGate
 * 「상한가 보고서」 · 적재 이력 0(‹ › disabled) · 없는 날짜 + 「최신 보고서 보기」 · 탐지 0 · 형식 오류 `?d` → replace ·
 * ‹ › → push(`?d=`) · 문서 제목 · KPI 4칸(quick-261005-vk1 D-02) · 제외 한 줄 유무 · 리스트 행 · 첫 행 아래 사건 카드(D-03).
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/analytics/limitup',
}));

let mockGate: 'unauthenticated' | 'unmapped' | null = null;
vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => mockGate };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const fetchReportMock = vi.fn();
vi.mock('@/lib/limitup-api', () => ({
  fetchLimitupReport: (d?: string) => fetchReportMock(d),
  // 28-13 사건 카드가 격자 서명 URL 을 부른다 — 이 파일은 머리 · KPI · 격자만 보므로 응답하지 않는다(레인 「불러오는 중…」).
  fetchLimitupGridUrls: () => new Promise(() => {}),
}));

import { ApiClientError } from '@/lib/api';
import { entryRow, kstMs, loadedReport, lockRow, summaryRow } from '@/test-fixtures/limitup-report';

import { LimitupReport } from '../limitup-report';

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function open(query: string, resp?: LimitupReportResponse | Error) {
  searchParams = new URLSearchParams(query);
  if (resp instanceof Error) fetchReportMock.mockRejectedValueOnce(resp);
  else if (resp !== undefined) fetchReportMock.mockResolvedValueOnce(resp);
  const r = render(<LimitupReport />);
  await flush();
  return r;
}

const prevBtn = () => screen.getByRole('button', { name: '이전 보고서' }) as HTMLButtonElement;
const nextBtn = () => screen.getByRole('button', { name: '다음 보고서' }) as HTMLButtonElement;

beforeEach(() => {
  mockGate = null;
  replaceMock.mockReset();
  pushMock.mockReset();
  fetchReportMock.mockReset();
  document.title = '';
});

describe('LimitupReport', () => {
  it('로딩 — 머리 + 날짜 알약(?d 에서 즉시) + 「불러오는 중…」 · KPI 미렌더', async () => {
    fetchReportMock.mockReturnValueOnce(new Promise(() => {}));
    await open('d=20261002');
    expect(screen.getByRole('heading', { level: 1, name: '상한가 보고서' })).toBeTruthy();
    expect(screen.getByText('평일 밤 21:20쯤 그날 보고서가 올라와요')).toBeTruthy();
    expect(screen.getByText('10/02 (금)')).toBeTruthy();
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(document.querySelector('[data-slot="limitup-kpis"]')).toBeNull();
    expect(fetchReportMock).toHaveBeenCalledWith('20261002');
    expect(document.title).toBe('상한가 보고서 · 10/02');
  });

  it('에러 → 「보고서를 불러오지 못했어요」 + 「다시 시도」 → 재호출', async () => {
    await open('d=20261002', new ApiClientError({ code: 'DB_ERROR', message: 'x', status: 500 }));
    expect(screen.getByText('보고서를 불러오지 못했어요')).toBeTruthy();
    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(retry.className).toContain('text-[var(--accent-fg)]');
    fetchReportMock.mockResolvedValueOnce(loadedReport({}));
    fireEvent.click(retry);
    await flush();
    expect(fetchReportMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('보고서를 불러오지 못했어요')).toBeNull();
  });

  it('403 DMA_UNMAPPED → DmaGate 「상한가 보고서는 증권사 계정이 연결된 사용자만 …」 · 머리 없음', async () => {
    await open('', new ApiClientError({ code: 'DMA_UNMAPPED', message: 'x', status: 403 }));
    expect(screen.getByText(/^상한가 보고서는 증권사 계정이 연결된 사용자만 이용할 수 있어요/)).toBeTruthy();
    expect(document.querySelector('[data-slot="dma-gate"]')!.getAttribute('data-reason')).toBe('unmapped');
    expect(screen.queryByText('평일 밤 21:20쯤 그날 보고서가 올라와요')).toBeNull();
  });

  it('401 → DmaGate unauthenticated', async () => {
    await open('', new ApiClientError({ code: 'UNAUTHENTICATED', message: 'x', status: 401 }));
    expect(document.querySelector('[data-slot="dma-gate"]')!.getAttribute('data-reason')).toBe('unauthenticated');
    expect(screen.getByText('상한가 보고서는 로그인한 뒤 이용할 수 있어요.')).toBeTruthy();
  });

  it('useDmaGateReason 사유 → 게이트만 · 조회 0', async () => {
    mockGate = 'unmapped';
    await open('');
    expect(document.querySelector('[data-slot="dma-gate"]')).toBeTruthy();
    expect(fetchReportMock).not.toHaveBeenCalled();
  });

  it('적재 이력 0 → 「아직 올라온 보고서가 없어요」 · ‹ › 둘 다 disabled · 알약 「—」', async () => {
    await open('', { access: true, dates: [], date: null, loaded: false });
    expect(screen.getByText('아직 올라온 보고서가 없어요')).toBeTruthy();
    expect(screen.getByText('첫 보고서는 평일 밤 21:20쯤 올라와요')).toBeTruthy();
    expect(prevBtn().disabled).toBe(true);
    expect(nextBtn().disabled).toBe(true);
    expect(fetchReportMock).toHaveBeenCalledWith(undefined);
    expect(document.title).toBe('상한가 보고서');
  });

  it('없는 날짜 → 「이 날 보고서가 아직 없어요」 + 최신 MM/DD + 「최신 보고서 보기」 → push', async () => {
    await open('d=20260915', { access: true, dates: ['20261002', '20261001'], date: '20260915', loaded: false });
    expect(screen.getByText('이 날 보고서가 아직 없어요')).toBeTruthy();
    expect(screen.getByText('보고서는 평일 밤 21:20쯤 올라와요. 최신 보고서는 10/02예요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '최신 보고서 보기' }));
    expect(pushMock).toHaveBeenCalledWith('/analytics/limitup?d=20261002');
    // 목록보다 오래된 날 — ‹ 없음 · › = 가장 오래된 적재 날짜
    expect(prevBtn().disabled).toBe(true);
    fireEvent.click(nextBtn());
    expect(pushMock).toHaveBeenLastCalledWith('/analytics/limitup?d=20261001');
  });

  it('목록 0 인 날 → KPI 4칸 「0」 · 제외 한 줄 없음 · 리스트 빈 상태 「이 날은 상한가 사건이 없어요」', async () => {
    await open('d=20261002', loadedReport({}));
    const kpi = (label: string) => document.querySelector(`[data-kpi="${label}"] dd`)!.textContent;
    expect([...document.querySelectorAll('[data-kpi]')].map((e) => e.getAttribute('data-kpi'))).toEqual([
      '상한가 도달',
      '종가까지 유지',
      '깨짐',
      '어제 D+1',
    ]);
    expect(kpi('상한가 도달')).toBe('0');
    expect(kpi('종가까지 유지')).toBe('0');
    expect(kpi('깨짐')).toBe('0');
    expect(kpi('어제 D+1')).toBe('—');
    expect(document.querySelector('[data-slot="limitup-excluded"]')).toBeNull();
    expect(screen.getByText('이 날은 상한가 사건이 없어요')).toBeTruthy();
  });

  it('미도달만 있는 날 → 제외 한 줄 · 리스트 빈 상태 · 사건 카드 0', async () => {
    await open(
      'd=20261002',
      loadedReport({ day: { entries: [entryRow({ isin: 'KR7000009001', name: '미도달주', reached: false })] } }),
    );
    expect(document.querySelector('[data-slot="limitup-excluded"]')!.textContent).toBe(
      '상한가에 닿지 않은 1종목(미도달주)은 목록에서 뺐어요',
    );
    expect(screen.getByText('상한가에 닿은 종목이 없는 날이에요. ‹ 로 이전 보고서를 볼 수 있어요')).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="limitup-event-card"]')).toHaveLength(0);
  });

  it('형식 오류 ?d → router.replace("/analytics/limitup") · 최신으로 조회', async () => {
    await open('d=2026-10-02', loadedReport({}));
    expect(replaceMock).toHaveBeenCalledWith('/analytics/limitup');
    expect(fetchReportMock).toHaveBeenCalledWith(undefined);
  });

  it('쿼리 없음 = 최신 — URL 은 쓰지 않는다 · 문서 제목 = 응답 date', async () => {
    await open('', loadedReport({ date: '20261002', dates: ['20261002', '20261001'] }));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(document.title).toBe('상한가 보고서 · 10/02');
    expect(screen.getByText('10/02 (금)')).toBeTruthy();
    expect(nextBtn().disabled).toBe(true);
    fireEvent.click(prevBtn());
    expect(pushMock).toHaveBeenCalledWith('/analytics/limitup?d=20261001');
  });

  it('정상 — KPI 값 · 어제 D+1 title · 리스트 행 · 첫 행 아래 사건 카드 · 문서 제목 · 1120 폭 래퍼', async () => {
    const D = '20261001';
    await open(
      'd=20261001',
      loadedReport({
        date: D,
        dates: ['20261002', D, '20260930'],
        day: {
          entries: [
            entryRow({
              isin: 'KR7000001001',
              name: '알파',
              short_code: '000010',
              reached: true,
              first_upper_ms: kstMs(D, '09:30:00'),
              upper_px: 1000,
              close_px: 1000,
            }),
          ],
          locks: [lockRow({ isin: 'KR7000001001', lock_id: 1, upper_px: 1000, close_px: 1000 })],
          summaries: [summaryRow({ isin: 'KR7000001001', q_krw: [0, 1] })],
        },
        prev: { date: '20260930', locks: [lockRow({ isin: 'KR7000001001', lock_id: 1, d1_ret: 0.031 })] },
      }),
    );
    expect(document.title).toBe('상한가 보고서 · 10/01');
    expect(document.querySelector('[data-kpi="상한가 도달"] dd')!.textContent).toBe('1');
    expect(document.querySelector('[data-kpi="종가까지 유지"] dd')!.textContent).toBe('1');
    expect(document.querySelector('[data-kpi="깨짐"] dd')!.textContent).toBe('0');
    const d1 = document.querySelector<HTMLElement>('[data-kpi="어제 D+1"]')!;
    expect(d1.querySelector('dd')!.textContent).toBe('+3.1%');
    expect(d1.getAttribute('title')).toBe('중앙값 · 1건');
    const rowBtn = screen.getByRole('button', { name: '알파 000010 — 사건 카드' });
    expect(rowBtn.getAttribute('aria-expanded')).toBe('true');
    // 첫 행 아래 사건 카드 — 행 버튼이 영역 이름 · 격자 뒤 별도 카드 묶음 없음
    const card = document.getElementById('ev-KR7000001001')!;
    expect(rowBtn.nextElementSibling).toBe(card);
    expect(card.getAttribute('aria-labelledby')).toBe(rowBtn.id);
    expect(document.querySelectorAll('[data-slot="limitup-event-card"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="limitup-excluded"]')).toBeNull();
    expect(document.querySelector('[data-slot="limitup-report"]')!.className).toContain('max-w-[1120px]');
    expect(prevBtn().disabled).toBe(false);
    expect(nextBtn().disabled).toBe(false);
  });
});
