import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';

import type { AccumDetailResponse, AccumDetailRow } from '@gh-radar/shared';

/**
 * Phase 34 Plan 06 — 매집감지 펼친 상세의 차트 정적 레이어(UI-SPEC A6 · D-14 ~ D-18).
 *
 * 잠그는 것: 측정 폭 1:1 viewBox(jsdom 폴백 640 × 472) · role=img 접근 이름 · 팀 체결 없음 판 글자 · 원 · 사이클 세로선 라벨 ·
 * 판 제목 · 이월 줄. `authFetch` 만 목 — 상세 캐시 · 합침 로직은 진짜로 돈다(accum-report.test.tsx 문법).
 */

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams('d=20261014'),
  usePathname: () => '/analytics/accum',
}));

vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => null };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const authFetchMock = vi.fn();
vi.mock('@/lib/auth-fetch', () => ({
  authFetch: (path: string, init?: unknown) => authFetchMock(path, init),
}));

import { clearQueryCache } from '@/lib/query-cache';
import { ACCUM_DATE, CHEONIL, accumDetailFixture, accumReportFixture } from '@/test-fixtures/accum-export';

import { AccumReport } from '../accum-report';

const DETAIL_RE = /^\/api\/accum\/report\/(\d{8})\/([A-Z0-9]{12})$/;

/** 상세 응답 덮어쓰기(isin → row) — 없으면 실측 픽스처. */
let detailOver = new Map<string, AccumDetailRow>();

function routeFetch(path: string): Promise<unknown> {
  const m = DETAIL_RE.exec(path);
  if (m) {
    const isin = m[2]!;
    const row = detailOver.get(isin);
    const resp: AccumDetailResponse = row ? { access: true, row } : accumDetailFixture(isin);
    return Promise.resolve(resp);
  }
  return Promise.resolve(accumReportFixture());
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

/** 목록을 그리고 그 행을 펼친다 → 펼친 상세 section. */
async function expand(isin: string): Promise<HTMLElement> {
  render(<AccumReport />);
  await flush();
  const btn = document.getElementById(`accum-row-${isin}`) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  fireEvent.click(btn);
  await flush();
  const sec = document.getElementById(`ac-${isin}`) as HTMLElement;
  expect(sec).toBeTruthy();
  return sec;
}

const chartOf = (sec: HTMLElement) => sec.querySelector<SVGSVGElement>('svg[data-slot="accum-chart"]');

beforeEach(() => {
  replaceMock.mockReset();
  authFetchMock.mockReset();
  authFetchMock.mockImplementation((path: string) => routeFetch(path));
  detailOver = new Map();
  clearQueryCache();
});

describe('AccumChart — 가격 판 · 1:1 viewBox (A6 · D-17)', () => {
  it('(c1) 천일고속 펼침 → svg[data-slot=accum-chart] viewBox "0 0 640 472"(jsdom 폴백) · role=img · 접근 이름 · 가격 선', async () => {
    expect(ACCUM_DATE).toBe('20261014');
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec);
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 640 472');
    expect(svg!.getAttribute('height')).toBe('472');
    expect(svg!.getAttribute('role')).toBe('img');
    const label = svg!.getAttribute('aria-label') ?? '';
    expect(label.startsWith('천일고속 매집 상세 차트 — 09:00~20:00')).toBe(true);
    expect(label).toContain('사이클 1개');
    expect(label).toContain('팀 주문 45건');
    expect(label).toMatch(/하루 순매수 [−+]?\d/);
    // 가격 선 — clipPath 안 path 하나 이상 · NaN 없음
    expect(svg!.querySelector('clipPath')).toBeTruthy();
    const pricePath = svg!.querySelector('[data-slot="accum-price-path"]');
    expect(pricePath).toBeTruthy();
    expect(pricePath!.getAttribute('d')).toMatch(/^M/);
    expect(pricePath!.getAttribute('d')).not.toMatch(/NaN/);
    // 차트는 KPI 줄 아래(같은 차트 블록 안)
    const block = sec.querySelector('[data-slot="accum-chart-block"]')!;
    expect(block.contains(svg!)).toBe(true);
    const kline = block.querySelector('[data-slot="accum-kline"]')!;
    expect(kline.compareDocumentPosition(svg!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
