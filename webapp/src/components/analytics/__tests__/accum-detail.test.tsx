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
import {
  ACCUM_DATE,
  CHEONIL,
  CJSEAFOOD_PREF,
  DONGYANG,
  HANSUN,
  accumDetailFixture,
  accumReportFixture,
  accumSyntheticDetail,
} from '@/test-fixtures/accum-export';

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

const textsOf = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? '');

describe('AccumChart — 데이터 레이어 (A6 레이어 1~7 · D-15 · D-18)', () => {
  it('(c2) 천일고속 — 음영 · 빈 띠 · 누적 계단 · 0선 · 10분 막대 19칸(title) · 원 45개(title) · first 원 맨 마지막(--fg 테두리)', async () => {
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    expect(svg.querySelector('[data-slot="accum-shade"]')).toBeTruthy();
    expect(svg.querySelector('[data-slot="accum-gap"]')).toBeTruthy();
    expect(svg.querySelector('[data-slot="accum-gap"]')!.getAttribute('fill')).toBe('var(--accum-gap)');
    expect(svg.querySelector('[data-slot="accum-shade"]')!.getAttribute('fill')).toBe('var(--accum-shade)');
    const cum = svg.querySelector('[data-slot="accum-cum-path"]')!;
    expect(cum.getAttribute('d')).toMatch(/^M[\d.]+,[\d.]+L/);
    expect(cum.getAttribute('stroke')).toBe('var(--team)');
    expect(svg.querySelector('[data-slot="accum-cum-zero"]')!.getAttribute('stroke-dasharray')).toBe('2 3');
    const bars = svg.querySelectorAll('[data-slot="accum-bucket"]');
    expect(bars).toHaveLength(19);
    expect(Array.from(bars).every((g) => /^\d\d:\d\d~\d\d:\d\d 팀 매수 [\d.,]+억 · 팀 매도 [\d.,]+억$/.test(g.querySelector('title')?.textContent ?? ''))).toBe(true);
    const circles = Array.from(svg.querySelectorAll('circle'));
    expect(circles).toHaveLength(45);
    expect(circles.every((c) => c.querySelector('title') !== null)).toBe(true);
    const last = circles[circles.length - 1]!;
    expect(last.getAttribute('stroke')).toBe('var(--fg)');
    expect(last.getAttribute('fill-opacity')).toBe('0.9');
    expect(last.querySelector('title')!.textContent).toBe('09:01:00 팀 매수 9주 · 0.02억 @174,300 · 1조각 · 팀매수 시작');
    expect(circles[0]!.getAttribute('fill-opacity')).toBe('0.55');
    expect(textsOf(svg)).not.toContain('팀 체결 없음');
    expect(sec.querySelectorAll('i')).toHaveLength(0);
  });

  it('(c3) CJ씨푸드1우(orders 0 · day_cum_net 0) — 「팀 체결 없음」 2개(누적 판 · 10분 판) · 원 0 · 가격 선 · 0선 · 빈 띠는 그대로', async () => {
    const sec = await expand(CJSEAFOOD_PREF);
    const svg = chartOf(sec)!;
    expect(svg).toBeTruthy();
    expect(textsOf(svg).filter((t) => t === '팀 체결 없음')).toHaveLength(2);
    expect(svg.querySelectorAll('circle')).toHaveLength(0);
    expect(svg.querySelectorAll('[data-slot="accum-bucket"]')).toHaveLength(0);
    expect(svg.querySelector('[data-slot="accum-price-path"]')!.getAttribute('d')).toMatch(/^M/);
    expect(svg.querySelector('[data-slot="accum-cum-zero"]')).toBeTruthy();
    expect(svg.querySelector('[data-slot="accum-gap"]')).toBeTruthy();
  });
});

describe('AccumChart — 사이클 세로선 · 이월 줄 · 눈금 · 축 글자 (A6 레이어 2 · 6 · 8 · D-16)', () => {
  it('(c4) multiCycle(한선 합성) → 「등록 09:12 · 1」 · 「등록 13:05 · 2」 · 「청산 11:32」 · 판 제목 2개 · 눈금 「9」…「20」 · 세로선 title', async () => {
    detailOver.set(HANSUN, accumSyntheticDetail('multiCycle'));
    const sec = await expand(HANSUN);
    const svg = chartOf(sec)!;
    const texts = textsOf(svg);
    expect(texts).toContain('등록 09:12 · 1');
    expect(texts).toContain('등록 13:05 · 2');
    expect(texts).toContain('청산 11:32');
    expect(texts).toContain('순매수 누적');
    expect(texts).toContain('10분 팀 매수 / 매도');
    for (const h of ['9', '10', '15', '20']) expect(texts).toContain(h);
    const marks = Array.from(svg.querySelectorAll('[data-slot="accum-cycle-line"]'));
    expect(marks.map((g) => g.querySelector('title')?.textContent)).toEqual([
      '사이클 1 등록 09:12:40',
      '사이클 1 청산 11:32:04',
      '사이클 2 등록 13:05:20',
    ]);
    expect(svg.getAttribute('aria-label')).toContain('사이클 2개');
    // 오늘 등록 → 음영 있음 · 이월 줄 없음
    expect(svg.querySelector('[data-slot="accum-shade"]')).toBeTruthy();
    expect(texts.some((t) => t.startsWith('이월 D+'))).toBe(false);
  });

  it('(c5) carry(동양고속 합성) → 이월 줄 「이월 D+2 · 10/10 …」 · 등록선 · 음영 없음 · 종료선 「청산 14:56」', async () => {
    detailOver.set(DONGYANG, accumSyntheticDetail('carry'));
    const sec = await expand(DONGYANG);
    const svg = chartOf(sec)!;
    const texts = textsOf(svg);
    expect(texts.find((t) => t.startsWith('이월 D+2 · 10/10'))).toBe('이월 D+2 · 10/10 09:20 등록');
    expect(texts).toContain('청산 14:56');
    expect(texts.some((t) => t.startsWith('등록 '))).toBe(false);
    expect(svg.querySelector('[data-slot="accum-shade"]')).toBeNull();
  });

  it('(c6) drop0600(천일 합성) → 왼쪽 끝 종료선 라벨 「이월 탈락(복원 안 됨) 06:00」 · first 원 없음', async () => {
    detailOver.set(CHEONIL, accumSyntheticDetail('drop0600'));
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    expect(textsOf(svg)).toContain('이월 탈락(복원 안 됨) 06:00');
    const line = svg.querySelector('[data-slot="accum-cycle-line"] line')!;
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(52, 6);
    expect(Array.from(svg.querySelectorAll('circle')).some((c) => c.getAttribute('stroke') === 'var(--fg)')).toBe(false);
  });

  it('(c7) 천일고속 축 글자 — 가격 축 5개(쉼표 정수) · 누적 축 ±억 · 10분 판 최대값 억', async () => {
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    const px = Array.from(svg.querySelectorAll('[data-slot="accum-px-axis"] text')).map((t) => t.textContent);
    expect(px).toHaveLength(5);
    expect(px.every((t) => /^\d{1,3}(,\d{3})*$/.test(t ?? ''))).toBe(true);
    const cum = Array.from(svg.querySelectorAll('[data-slot="accum-cum-axis"] text')).map((t) => t.textContent);
    expect(cum).toContain('0.0억');
    expect(cum.length).toBeGreaterThanOrEqual(2);
    expect(svg.querySelector('[data-slot="accum-bucket-max"]')!.textContent).toMatch(/^[\d.,]+억$/);
  });
});
