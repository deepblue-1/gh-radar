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
    // WR-01 — 가격 선 · 주문 원은 가격 판 높이 클립(y 9 · 높이 214) 안
    const layer = svg!.querySelector('[data-slot="accum-price-layer"]')!;
    expect(layer.contains(pricePath)).toBe(true);
    expect(layer.querySelectorAll('circle').length).toBe(svg!.querySelectorAll('circle').length);
    const pxClipId = /^url\(#(.+)\)$/.exec(layer.getAttribute('clip-path') ?? '')?.[1];
    expect(pxClipId).toMatch(/-px$/);
    const pxRect = svg!.querySelector(`clipPath[id="${pxClipId}"] rect`)!;
    expect([pxRect.getAttribute('y'), pxRect.getAttribute('height')]).toEqual(['9', '214']);
    // 차트는 KPI 줄 아래(같은 차트 블록 안)
    const block = sec.querySelector('[data-slot="accum-chart-block"]')!;
    expect(block.contains(svg!)).toBe(true);
    const kline = block.querySelector('[data-slot="accum-kline"]')!;
    expect(kline.compareDocumentPosition(svg!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

const textsOf = (svg: SVGSVGElement) => Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? '');

describe('AccumChart — 데이터 레이어 (A6 레이어 1~7 · D-15 · D-18)', () => {
  it('(c2) 천일고속 — 음영 · 빈 띠 · 누적 계단 · 0선 · 10분 막대 19칸 · 원 45개(네이티브 title 없음 — 마우스 상자) · first 원 맨 마지막(--fg 테두리)', async () => {
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
    expect(Array.from(bars).every((g) => g.querySelector('title') === null)).toBe(true);
    const circles = Array.from(svg.querySelectorAll('circle'));
    expect(circles).toHaveLength(45);
    expect(circles.every((c) => c.querySelector('title') === null)).toBe(true);
    const last = circles[circles.length - 1]!;
    expect(last.getAttribute('stroke')).toBe('var(--fg)');
    expect(last.getAttribute('fill-opacity')).toBe('0.9');
    expect(circles[0]!.getAttribute('fill-opacity')).toBe('0.55');
    expect(textsOf(svg)).not.toContain('팀 체결 없음');
    expect(sec.querySelectorAll('i')).toHaveLength(0);
  });

  it('(c9) 마우스 툴팁(gh-trade 동형) — 원 위 = 주문 2줄 + 고리 · 누적 판 = 그 시각 누적 · 10분 판 = 칸 매수/매도/순 · 빈 곳 · 떠나면 지움 · 터치 무시', async () => {
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    const tip = () => sec.querySelector<HTMLElement>('[data-slot="accum-chart-tip"]');
    const circles = Array.from(svg.querySelectorAll('circle'));
    const first = circles[circles.length - 1]!; // 09:01:00 팀매수 시작
    const at = (cx: number, cy: number, pointerType = 'mouse') =>
      act(() => {
        fireEvent.pointerMove(svg, { clientX: cx, clientY: cy, pointerType });
      });
    const cx = Number(first.getAttribute('cx'));
    const cy = Number(first.getAttribute('cy'));
    // 터치는 상자를 띄우지 않는다
    at(cx, cy, 'touch');
    expect(tip()).toBeNull();
    at(cx, cy);
    const lines = Array.from(tip()!.children).map((d) => d.textContent);
    expect(lines[0]).toBe('09:01:00 팀 매수 9주 · 0.02억 @174,300 · 1조각 · 팀매수 시작');
    expect(lines[1]).toMatch(/^순매수 누적 [+−][\d.,]+억 · 등락률 [+−]\d+\.\d\d%$/);
    expect(tip()!.getAttribute('role')).toBe('tooltip');
    expect(svg.querySelector('[data-slot="accum-order-hover"]')!.getAttribute('cx')).toBe(first.getAttribute('cx'));
    // 누적 판(240~352) — 그 시각 계단 값
    at(cx + 40, 300);
    expect(tip()!.textContent).toMatch(/^\d\d:\d\d:\d\d · 순매수 누적 [+−]?[\d.,]+억/);
    expect(svg.querySelector('[data-slot="accum-order-hover"]')).toBeNull();
    // 10분 판(376~448) — 팀 주문 있는 칸
    const bar = svg.querySelector('[data-slot="accum-bucket"] rect')!;
    const bx = Number(bar.getAttribute('x')) + Number(bar.getAttribute('width')) / 2;
    at(bx, 420);
    expect(tip()!.textContent).toMatch(/^\d\d:\d0~\d\d:\d0 · 팀 매수 [\d.,]+억 \/ 매도 [\d.,]+억 \/ 순 [+−]?[\d.,]+억$/);
    // 그림 영역 밖(왼쪽 가격 축) → 지움 · 떠나면 지움
    at(10, 100);
    expect(tip()).toBeNull();
    at(cx, cy);
    expect(tip()).not.toBeNull();
    act(() => {
      fireEvent.pointerLeave(svg);
    });
    expect(tip()).toBeNull();
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

  /** 천일 실측 행에 payload.avg_px 를 붙인 상세(quick-261021-amg). */
  const withAvg = (avg_px: unknown) => {
    const base = accumDetailFixture(CHEONIL).row!;
    detailOver.set(CHEONIL, {
      ...base,
      payload: { ...base.payload!, avg_px } as unknown as AccumDetailRow['payload'],
    });
    return base;
  };

  it('(c8) avg_px 있음 → 가격 레이어 안 팀 평단 계단 1개(--up · 1 2 점점선 · pointer-events none · title 없음) · 가격 선 → 평단 → 원 순서 (quick-261021-amg)', async () => {
    const base = accumDetailFixture(CHEONIL).row!;
    const t0 = base.payload!.price.t0_ms;
    withAvg({ t_ms: [t0 + 3600e3, t0 + 7200e3, t0 + 10800e3], px: [200000, 201000, 0] });
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    const avg = svg.querySelectorAll('[data-slot="accum-team-avg-path"]');
    expect(avg).toHaveLength(1);
    const p = avg[0]!;
    const layer = svg.querySelector('[data-slot="accum-price-layer"]')!;
    expect(layer.contains(p)).toBe(true);
    const d = p.getAttribute('d') ?? '';
    expect(d).toMatch(/^M[\d.]+,[\d.]+H[\d.]+V[\d.]+H[\d.]+$/);
    expect(d).not.toMatch(/NaN/);
    expect(p.getAttribute('stroke')).toBe('var(--up)');
    expect(p.getAttribute('stroke-dasharray')).toBe('1 2');
    expect(p.getAttribute('pointer-events')).toBe('none');
    expect(p.getAttribute('fill')).toBe('none');
    expect(p.querySelectorAll('title')).toHaveLength(0);
    const pricePath = svg.querySelector('[data-slot="accum-price-path"]')!;
    const firstCircle = svg.querySelector('circle')!;
    expect(pricePath.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(p.compareDocumentPosition(firstCircle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('(c9) 실측 천일(avg_px 없음) → 평단 선 없음 · 가격 선 · 원 45개 그대로 (quick-261021-amg)', async () => {
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    expect(svg.querySelector('[data-slot="accum-team-avg-path"]')).toBeNull();
    expect(svg.querySelector('[data-slot="accum-price-path"]')!.getAttribute('d')).toMatch(/^M/);
    expect(svg.querySelectorAll('circle')).toHaveLength(45);
  });

  it('(c10) avg_px 모양 불량 → 평단 선만 없음 · 차트 · 가격 선 그대로 · 「그날 체결 자료 없음」 없음 (quick-261021-amg)', async () => {
    withAvg({ t_ms: 'x', px: null });
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec);
    expect(svg).toBeTruthy();
    expect(svg!.querySelector('[data-slot="accum-team-avg-path"]')).toBeNull();
    expect(svg!.querySelector('[data-slot="accum-price-path"]')).toBeTruthy();
    expect(sec.querySelector('[data-slot="accum-no-price"]')).toBeNull();
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

const CAPTION =
  '원 = 1천만원 이상 팀 주문 + 사이클마다 첫 팀 매수(크기 = 금액) · 15:30~16:00 은 체결 없음(정상) · 휠·두 손가락 = 확대/축소 · 끌기 = 이동';

const presetsOf = (sec: HTMLElement) =>
  Array.from(sec.querySelectorAll<HTMLButtonElement>('[data-slot="accum-presets"] button'));
const rangeOf = (sec: HTMLElement) => sec.querySelector('[data-slot="accum-view-range"]')?.textContent ?? null;
const pressedOf = (sec: HTMLElement) => presetsOf(sec).map((b) => b.getAttribute('aria-pressed'));

describe('AccumDetail 차트 블록 머리 — 범례 · 프리셋 · 창 범위 · 캡션 (A5 · D-14 · D-18)', () => {
  it('(h1) 천일고속 — 범례 9 순서 · 프리셋 3 「전체」 켜짐 · 창 「09:00 ~ 20:00」 → 「정규장」 클릭 → 「09:00 ~ 15:30」 · aria-pressed 전환 · SVG 접근 이름', async () => {
    const sec = await expand(CHEONIL);
    const legend = sec.querySelector('[data-slot="accum-legend"]')!;
    expect(legend).toBeTruthy();
    const items = Array.from(legend.children).map((c) => c.textContent);
    expect(items).toEqual(['가격(10초)', '팀 평단', '팀 매수', '팀 매도', '팀매수 시작', '순매수 누적', '등록', '청산·종료', '등록 전']);
    expect(Array.from(legend.children).every((c) => c.querySelector('span[aria-hidden="true"]') !== null)).toBe(true);
    expect(sec.querySelectorAll('i')).toHaveLength(0);

    const btns = presetsOf(sec);
    expect(btns.map((b) => b.textContent)).toEqual(['전체', '정규장', '마지막 2시간']);
    expect(btns.every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(pressedOf(sec)).toEqual(['true', 'false', 'false']);
    expect(rangeOf(sec)).toBe('09:00 ~ 20:00');

    fireEvent.click(btns[1]!);
    expect(rangeOf(sec)).toBe('09:00 ~ 15:30');
    expect(pressedOf(sec)).toEqual(['false', 'true', 'false']);
    expect(chartOf(sec)!.getAttribute('aria-label')!.startsWith('천일고속 매집 상세 차트 — 09:00~15:30')).toBe(true);

    // 마지막 2시간 = 마지막 체결 15:30:00 끝 2시간
    fireEvent.click(btns[2]!);
    expect(rangeOf(sec)).toBe('13:30 ~ 15:30');
    expect(pressedOf(sec)).toEqual(['false', 'false', 'true']);
    expect(btns[2]!.disabled).toBe(false);

    // 블록 순서 = KPI 줄 → 범례 → 프리셋 줄 → 차트 → 캡션
    const block = sec.querySelector('[data-slot="accum-chart-block"]')!;
    const order = ['accum-kline', 'accum-legend', 'accum-presets', 'accum-chart', 'accum-caption'].map(
      (s) => block.querySelector(`[data-slot="${s}"]`)!,
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(block.querySelector('[data-slot="accum-caption"]')!.textContent).toBe(CAPTION);
  });

  it('(h2) noPrice(price.idx 빔) — 「그날 체결 자료 없음」 한 줄 · 범례 · 프리셋 · 차트 · 캡션 없음 · KPI 줄은 남는다', async () => {
    detailOver.set(CHEONIL, accumSyntheticDetail('noPrice'));
    const sec = await expand(CHEONIL);
    expect(sec.querySelector('[data-slot="accum-kline"]')).toBeTruthy();
    const none = sec.querySelector('[data-slot="accum-no-price"]');
    expect(none?.textContent).toBe('그날 체결 자료 없음');
    for (const s of ['accum-legend', 'accum-presets', 'accum-chart', 'accum-caption']) {
      expect(sec.querySelector(`[data-slot="${s}"]`)).toBeNull();
    }
  });

  it('(h2b) payload 모양 어긋남(price null · cycles 객체) → 「그날 체결 자료 없음」 · 사이클 표 없음 · 손익 줄 그대로 · throw 없음(WR-05)', async () => {
    const base = accumDetailFixture(CHEONIL).row!;
    detailOver.set(CHEONIL, {
      ...base,
      payload: { ...base.payload!, price: null, cycles: {} } as unknown as AccumDetailRow['payload'],
    });
    const sec = await expand(CHEONIL);
    expect(sec.querySelector('[data-slot="accum-kline"]')).toBeTruthy();
    expect(sec.querySelector('[data-slot="accum-no-price"]')?.textContent).toBe('그날 체결 자료 없음');
    expect(sec.querySelector('[data-slot="accum-chart"]')).toBeNull();
    expect(sec.querySelector('[data-slot="accum-pnl"]')).toBeTruthy();
  });

  it('(h2c) 준비 본문 렌더 예외 → 상세 자리만 「상세를 불러오지 못했어요」 · 목록 행은 그대로(error boundary · WR-05)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const base = accumDetailFixture(CHEONIL).row!;
      detailOver.set(CHEONIL, { ...base, date: null as unknown as string }); // 출처 칩 fmtYmdShort 가 throw
      const sec = await expand(CHEONIL);
      const crash = sec.querySelector('[data-slot="accum-detail-crash"]');
      expect(crash?.getAttribute('role')).toBe('alert');
      expect(crash?.textContent).toBe('상세를 불러오지 못했어요');
      expect(document.getElementById(`accum-row-${CHEONIL}`)).toBeTruthy();
      expect(document.getElementById(`accum-row-${DONGYANG}`)).toBeTruthy();
    } finally {
      err.mockRestore();
    }
  });

  it('(h3) CJ씨푸드1우(day_cum_net 빔) — 캡션이 「팀 체결 없음 · 원 = 1천만원 이상」 으로 시작', async () => {
    const sec = await expand(CJSEAFOOD_PREF);
    const cap = sec.querySelector('[data-slot="accum-caption"]')!.textContent ?? '';
    expect(cap.startsWith('팀 체결 없음 · 원 = 1천만원 이상')).toBe(true);
    expect(cap).toBe(`팀 체결 없음 · ${CAPTION}`);
  });
});

describe('AccumDetail 차트 조작 — 키보드 래퍼 (A6 · D-14 · UI-SPEC 접근성 보강)', () => {
  it('(h4) 「정규장」 → 차트 래퍼(role=group) → 키 → 창 범위 「10:18 ~ 16:48」 · 프리셋 셋 다 aria-pressed=false · SVG touch-action pan-y', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      const sec = await expand(CHEONIL);
      fireEvent.click(presetsOf(sec)[1]!);
      const group = sec.querySelector<HTMLElement>('[role="group"][data-slot="accum-chart-wrap"]')!;
      expect(group).toBeTruthy();
      expect(group.tabIndex).toBe(0);
      expect(group.getAttribute('aria-label')).toBe(
        '천일고속 차트 보기 창 — 왼쪽·오른쪽 화살표 이동, +·− 확대/축소, 0 전체',
      );
      expect((chartOf(sec)!.style as CSSStyleDeclaration & { touchAction: string }).touchAction).toBe('pan-y');
      act(() => {
        fireEvent.keyDown(group, { key: 'ArrowRight' });
      });
      expect(rangeOf(sec)).toBe('10:18 ~ 16:48');
      expect(pressedOf(sec)).toEqual(['false', 'false', 'false']);
      expect(chartOf(sec)!.getAttribute('aria-label')!.startsWith('천일고속 매집 상세 차트 — 10:18~16:48')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('AccumCycleTable — 사이클 표 (A7 · D-20 · CR-01)', () => {
  it('(t1) multiCycle(cycle 값 중복) → 차트 블록 다음 사이클 표 · 머리 9열 · 캡션 · # 1, 2 · 마지막 행 첫 칸 --team 띠 · 「장 마감까지」', async () => {
    detailOver.set(HANSUN, accumSyntheticDetail('multiCycle'));
    const sec = await expand(HANSUN);
    const tbl = sec.querySelector<HTMLElement>('[data-slot="accum-cycles"]');
    expect(tbl).toBeTruthy();
    // 차트 블록 다음(같은 상세 루트의 형제 · 토글 없음)
    const block = sec.querySelector('[data-slot="accum-chart-block"]')!;
    expect(block.compareDocumentPosition(tbl!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.contains(tbl!)).toBe(false);
    expect(tbl!.querySelector('[aria-expanded]')).toBeNull();
    expect(tbl!.textContent).toContain('사이클');
    expect(tbl!.textContent).toContain('2개 · 값은 각 사이클 종료 시점(살아 있으면 마지막)');
    const heads = Array.from(tbl!.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(heads).toEqual(['#', '등록', '종료', '상태', '등록가', '평단', '순매수', '최고 순매수', '매수 / 매도 수량']);
    const rows = Array.from(tbl!.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    const cells = rows.map((r) => Array.from(r.querySelectorAll('td')).map((td) => td.textContent));
    expect(cells.map((c) => c[0])).toEqual(['1', '2']);
    expect(cells[0]!.slice(1, 4)).toEqual(['09:12:40', '11:32:04', '청산']);
    expect(cells[1]!.slice(1, 4)).toEqual(['13:05:20', '장 마감까지', '매집중']);
    const firstTd = (r: Element) => r.querySelector('td')!;
    expect(firstTd(rows[1]!).className).toContain('shadow-[inset_3px_0_0_var(--team)]');
    expect(firstTd(rows[0]!).className).not.toContain('shadow-[inset_3px_0_0_var(--team)]');
    // 가로 스크롤 래퍼(폰)
    expect(tbl!.querySelector('.overflow-x-auto')).toBeTruthy();
  });

  it('(t2) 사이클 1 → 표 없음 — 천일고속(실측 1개)', async () => {
    const sec = await expand(CHEONIL);
    expect(sec.querySelector('[data-slot="accum-chart-block"]')).toBeTruthy();
    expect(sec.querySelector('[data-slot="accum-cycles"]')).toBeNull();
  });
});

const PNL_CAPTION =
  '그날 하루 팀 주문 기준(등록 전 · 상한가 가격 포함) · 출처 모를 매도(전날 이전 보유분 추정)는 손익 제외';
const RULE_TEXTS = [
  '이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 30조각 이상 · 시총 5,000억 이하 (현재 시총 3,144억)',
  '등록 후 순매수(pos)는 KYOBO119 서버 상태기 값이에요 — 등록 이후 누적, 우리 서버 체결 제외, 마지막 사이클 기준. 목록 · KPI · 사이클 표가 이 값이에요.',
  '하루 순매수(day) · 차트는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 그래서 두 값은 부호까지 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.',
  '원은 1천만원 이상 팀 주문 + 사이클마다 첫 팀 매수(금액 무관 · 「팀매수 시작」)예요. 누적 계단은 전체 팀 주문이에요.',
  '종료 사유 — 청산(순매수 1억 미만 — 서버는 계속 추적하고 다시 1억 이상이면 같은 사이클로 재등장) / 매집 종료(청산 뒤 순매수가 사이클 최고의 −30% 이하 · 우리 체결 제외 — 다음 등록은 새 사이클) / 이월 탈락(서버 재기동 때 복원 안 됨) / 이월 만료(이월 10일 초과).',
];
const rulesToggleOf = (sec: HTMLElement) =>
  sec.querySelector<HTMLButtonElement>('[data-slot="accum-rules"] button[aria-expanded]')!;
const detailCalls = () => authFetchMock.mock.calls.filter(([p]) => DETAIL_RE.test(String(p)));

describe('AccumDetail 부속 — 팀 당일 손익 줄 (A8 · D-21)', () => {
  it('(p1) 천일고속(pnl 있음) → 「팀 당일 손익」 + 「+0.30억(+1.1%)」(up) · 실현 · 평가 · 보유 · 출처 모를 매도 · 캡션 · 면 상자 없음', async () => {
    const sec = await expand(CHEONIL);
    const pnl = sec.querySelector<HTMLElement>('[data-slot="accum-pnl"]');
    expect(pnl).toBeTruthy();
    expect(pnl!.querySelector('h3')!.textContent).toBe('팀 당일 손익');
    const total = pnl!.querySelector('[data-slot="accum-pnl-total"]')!;
    expect(total.textContent).toBe('+0.30억(+1.1%)');
    expect(total.className).toContain('text-[var(--up)]');
    const items = Array.from(pnl!.querySelectorAll('[data-slot="accum-pnl-item"]')).map((e) => e.textContent);
    expect(items).toEqual(['실현+0.27억', '평가+0.03억', '보유3,401주', '출처 모를 매도3,783주']);
    expect(pnl!.textContent).toContain(PNL_CAPTION);
    expect(pnl!.className).not.toMatch(/bg-|rounded/);
  });

  it('(p2) CJ씨푸드1우(pnl null) → 「팀 당일 손익」 + 「팀 체결 없음」 만 · 항목 · 캡션 없음', async () => {
    const sec = await expand(CJSEAFOOD_PREF);
    const pnl = sec.querySelector<HTMLElement>('[data-slot="accum-pnl"]')!;
    expect(pnl).toBeTruthy();
    expect(pnl.querySelector('h3')!.textContent).toBe('팀 당일 손익');
    expect(pnl.textContent).toBe('팀 당일 손익팀 체결 없음');
    expect(pnl.querySelectorAll('[data-slot="accum-pnl-item"]')).toHaveLength(0);
  });
});

describe('AccumDetail 부속 — 판정 기준 · 출처 칩 · D-19 순서 (A9 · D-19 · D-22)', () => {
  it('(r1) 「판정 기준」 기본 접힘(본문 없음) → 클릭 → 본문 5줄 순서 + 출처 줄 · 다시 클릭 → 언마운트', async () => {
    const sec = await expand(CHEONIL);
    const rules = sec.querySelector<HTMLElement>('[data-slot="accum-rules"]')!;
    expect(rules).toBeTruthy();
    const btn = rulesToggleOf(sec);
    expect(btn.textContent).toBe('판정 기준');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(rules.querySelector('ul')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const lis = Array.from(rules.querySelectorAll('ul > li')).map((li) => li.textContent);
    expect(lis).toEqual(RULE_TEXTS);
    // 본문 1 의 수 = mono 한 덩어리
    const nums = Array.from(rules.querySelectorAll('ul > li:first-child .mono')).map((e) => e.textContent);
    expect(nums).toEqual(['1.0억', '30조각', '5,000억', '3,144억']);
    expect(rules.textContent).toContain('규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13');
    expect(rules.querySelector('a')).toBeNull();
    fireEvent.click(btn);
    expect(rules.querySelector('ul')).toBeNull();
  });

  it('(s1) multiCycle → 블록 문서 순서 kline → legend → presets → chart → cycles → pnl → rules → detail-source · 출처 칩 「KYOBO119 판정 기준 · 10/14 20:30 적재」 맨 끝 · KPI 줄에 임계 없음', async () => {
    detailOver.set(HANSUN, accumSyntheticDetail('multiCycle'));
    const sec = await expand(HANSUN);
    const order = [
      'accum-kline',
      'accum-legend',
      'accum-presets',
      'accum-chart',
      'accum-cycles',
      'accum-pnl',
      'accum-rules',
      'accum-detail-source',
    ].map((s) => {
      const el = sec.querySelector(`[data-slot="${s}"]`);
      expect(el, s).toBeTruthy();
      return el!;
    });
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const chip = sec.querySelector('[data-slot="accum-detail-source"]')!;
    expect(chip.textContent).toBe('KYOBO119 판정 기준 · 10/14 20:30 적재');
    expect(chip.className).toContain('whitespace-nowrap');
    // 상세 맨 끝 — 뒤따르는 요소 없음
    const all = Array.from(sec.querySelectorAll('*'));
    expect(all.filter((e) => chip.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING && !chip.contains(e))).toHaveLength(0);
    expect(sec.querySelector('[data-slot="accum-kline"]')!.textContent).not.toContain('임계');
  });

  it('(s2) noPrice → 「그날 체결 자료 없음」 이어도 손익 줄 · 판정 기준 · 출처 칩은 그대로', async () => {
    detailOver.set(CHEONIL, accumSyntheticDetail('noPrice'));
    const sec = await expand(CHEONIL);
    expect(sec.querySelector('[data-slot="accum-no-price"]')).toBeTruthy();
    for (const s of ['accum-pnl', 'accum-rules', 'accum-detail-source']) {
      expect(sec.querySelector(`[data-slot="${s}"]`), s).toBeTruthy();
    }
  });

  it('(s3) 판정 기준을 연 채 행을 접고 다시 펼침 → 상세 요청 1회 유지 · 손익 줄 즉시 · 판정 기준은 다시 접힘', async () => {
    const sec = await expand(CHEONIL);
    fireEvent.click(rulesToggleOf(sec));
    expect(rulesToggleOf(sec).getAttribute('aria-expanded')).toBe('true');
    const btn = document.getElementById(`accum-row-${CHEONIL}`) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(document.getElementById(`ac-${CHEONIL}`)).toBeNull();
    fireEvent.click(btn);
    const again = document.getElementById(`ac-${CHEONIL}`)!;
    expect(again.querySelector('[data-slot="accum-pnl"]')).toBeTruthy();
    expect(rulesToggleOf(again).getAttribute('aria-expanded')).toBe('false');
    expect(again.querySelector('[data-slot="accum-rules"] ul')).toBeNull();
    await flush();
    expect(detailCalls()).toHaveLength(1);
  });
});

/** path d 의 마지막 `H` 값(없으면 null). */
const lastHOf = (d: string) => (d.match(/H[\d.]+/g) ?? []).at(-1) ?? null;

describe('quick-261025-fac 포지션 순매수 선(스케치 017 B)', () => {
  it('(f1) posNet(한선 합성) → 굵은 --team 포지션 계단 3조각 · 열린 끝 = 그날 계단 끝 · 그날 계단 회색 보조 · 포지션이 위 · 판 제목', async () => {
    detailOver.set(HANSUN, accumSyntheticDetail('posNet'));
    const sec = await expand(HANSUN);
    const svg = chartOf(sec)!;
    const pos = svg.querySelectorAll('[data-slot="accum-pos-net-path"]');
    expect(pos).toHaveLength(1);
    const p = pos[0]!;
    expect(p.getAttribute('stroke')).toBe('var(--team)');
    expect(p.getAttribute('stroke-width')).toBe('2.2');
    expect(p.getAttribute('fill')).toBe('none');
    const pd = p.getAttribute('d')!;
    expect(pd).not.toMatch(/NaN/);
    expect(pd.match(/M/g)).toHaveLength(3);
    const cum = svg.querySelector('[data-slot="accum-cum-path"]')!;
    expect(lastHOf(pd)).toBe(lastHOf(cum.getAttribute('d')!));
    expect(cum.getAttribute('stroke')).toBe('var(--muted-fg)');
    expect(cum.getAttribute('stroke-width')).toBe('1');
    expect(cum.getAttribute('stroke-opacity')).toBe('0.7');
    expect(cum.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const texts = textsOf(svg);
    expect(texts).toContain('포지션 순매수 · 그날 누적');
    expect(texts).not.toContain('순매수 누적');
  });

  it('(f2) 천일고속(pos_net 없음) → 포지션 선 없음 · 그날 계단 --team 1.5 · stroke-opacity 없음 · 판 제목 「순매수 누적」', async () => {
    const sec = await expand(CHEONIL);
    const svg = chartOf(sec)!;
    expect(svg.querySelector('[data-slot="accum-pos-net-path"]')).toBeNull();
    const cum = svg.querySelector('[data-slot="accum-cum-path"]')!;
    expect(cum.getAttribute('stroke')).toBe('var(--team)');
    expect(cum.getAttribute('stroke-width')).toBe('1.5');
    expect(cum.hasAttribute('stroke-opacity')).toBe(false);
    const texts = textsOf(svg);
    expect(texts).toContain('순매수 누적');
    expect(texts).not.toContain('포지션 순매수 · 그날 누적');
  });

  it('(f3) posNetCarry(동양 합성 · end 없음 · 06:01 이월 점 · 13억) → 포지션 선이 왼쪽 끝에서 시작 · 2조각 · 열린 끝 · 축에 +13.0억', async () => {
    detailOver.set(DONGYANG, accumSyntheticDetail('posNetCarry'));
    const sec = await expand(DONGYANG);
    const svg = chartOf(sec)!;
    const pd = svg.querySelector('[data-slot="accum-pos-net-path"]')!.getAttribute('d')!;
    const x1 = Number(svg.querySelector('[data-slot="accum-cum-zero"]')!.getAttribute('x1')).toFixed(1);
    expect(pd.startsWith(`M${x1},`)).toBe(true);
    expect(pd.match(/M/g)).toHaveLength(2);
    expect(lastHOf(pd)).toBe(lastHOf(svg.querySelector('[data-slot="accum-cum-path"]')!.getAttribute('d')!));
    const axis = Array.from(svg.querySelectorAll('[data-slot="accum-cum-axis"] text')).map((t) => t.textContent);
    expect(axis).toContain('+13.0억');
  });

  it('(f4) posNet → 누적 판 첫 조각 위 마우스 → 「HH:MM:SS · 순매수 누적 ±X억 · 포지션 순매수 ±Y억(이월 포함)」', async () => {
    detailOver.set(HANSUN, accumSyntheticDetail('posNet'));
    const sec = await expand(HANSUN);
    const svg = chartOf(sec)!;
    const pd = svg.querySelector('[data-slot="accum-pos-net-path"]')!.getAttribute('d')!;
    const m = /^M([\d.]+),[\d.]+H([\d.]+)/.exec(pd)!;
    const mx = (Number(m[1]) + Number(m[2])) / 2;
    act(() => {
      fireEvent.pointerMove(svg, { clientX: mx, clientY: 300, pointerType: 'mouse' });
    });
    const tip = sec.querySelector<HTMLElement>('[data-slot="accum-chart-tip"]')!;
    expect(tip.textContent).toMatch(
      /^\d\d:\d\d:\d\d · 순매수 누적 [+−]?[\d.,]+억 · 포지션 순매수 [+−]?[\d.,]+억\(이월 포함\)/,
    );
  });
});
