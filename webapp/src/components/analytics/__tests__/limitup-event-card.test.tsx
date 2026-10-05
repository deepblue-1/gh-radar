import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Phase 28 Plan 13 Task 2 — 사건 카드 (UI-SPEC ④-4 · D-11 · D-12 · E8).
 *
 * 잠그는 것: `section#ev-{isin}` + aria-labelledby → h3(tabIndex -1) · 머리 「{코드} · 상한가 {N}」 · 잠김 태그(깨짐 up · 유지
 * down · +N title) · 결과 태그 1개(잠김 없음) · 사실 문장 순서 · 출처 배지 글자 그대로 · 창구 막대(매수 up · 매도 down ·
 * 깨진 잠김 없으면 매도 묶음 없음) · 빈 문구 · 격자 지연 로드(IntersectionObserver) · 로딩/에러/다시 시도 ·
 * **색 감사**(SVG stroke/fill 허용 집합 · 오버레이 마커 색 · 초록 상태 토큰 0 · SVG 안 글자 요소 0).
 * 입력 = 실 export 20261002(덕우전자 깨짐 · 엑시온그룹 유지 · 형지글로벌 미도달) + 실 격자 gzip.
 */

const urlsMock = vi.fn();
vi.mock('@/lib/limitup-api', () => ({
  fetchLimitupGridUrls: (d: string) => urlsMock(d),
}));

import type { LimitupFactRow } from '@gh-radar/shared';

import { dayRowsOf } from '@/lib/limitup-report';
import { __resetLimitupGridCache } from '@/lib/use-limitup-grid';
import { dayOf, lockRow } from '@/test-fixtures/limitup-report';
import {
  AXION,
  DUKWOO,
  EXPORT_DATE as D,
  HYUNGJI,
  exportEntries,
  exportFacts,
  exportLocks,
  exportMarks,
  gridGzOf,
} from '@/test-fixtures/limitup-export';

import { LimitupEventCard } from '../limitup-event-card';

const entries = exportEntries();
const locks = exportLocks();
const facts = exportFacts();
const marks = exportMarks();
const rows = dayRowsOf({ day: dayOf({ entries, locks, facts, marks }) });
const rowOf = (isin: string) => rows.find((r) => r.isin === isin)!;

const fetchMock = vi.fn();
const gz = (isin: string) =>
  new Response(new Uint8Array(gridGzOf(isin)), { status: 200, headers: { 'content-type': 'application/gzip' } });

function urlsOk() {
  urlsMock.mockResolvedValue({
    date: D,
    expiresIn: 600,
    urls: Object.fromEntries([DUKWOO, AXION, HYUNGJI].map((i) => [i, `https://storage.test/${i}.json.gz?t=1`])),
  });
  fetchMock.mockImplementation(async (u: string) => gz([DUKWOO, AXION, HYUNGJI].find((i) => u.includes(i))!));
}

function renderCard(isin: string, over: { facts?: LimitupFactRow[] } = {}) {
  const row = rowOf(isin);
  return render(
    <LimitupEventCard
      date={D}
      row={row}
      entry={entries.find((e) => e.isin === isin) ?? null}
      facts={over.facts ?? facts.filter((f) => f.isin === isin)}
      marks={marks.filter((m) => m.isin === isin)}
    />,
  );
}

const card = (isin: string) => document.getElementById(`ev-${isin}`)!;

beforeEach(() => {
  __resetLimitupGridCache();
  urlsMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LimitupEventCard — 머리 · 태그', () => {
  it('section#ev-{isin} · aria-labelledby → h3(종목명 · tabIndex -1) · 「{코드} · 상한가 {N}」 · 깨짐 태그 up', async () => {
    urlsOk();
    renderCard(DUKWOO);
    const sec = card(DUKWOO);
    expect(sec.tagName).toBe('SECTION');
    const h3 = sec.querySelector('h3')!;
    expect(h3.textContent).toBe('덕우전자');
    expect(h3.getAttribute('tabindex')).toBe('-1');
    expect(sec.getAttribute('aria-labelledby')).toBe(h3.id);
    expect(screen.getByRole('region', { name: '덕우전자' })).toBe(sec);
    expect(within(sec).getByText('263600 · 상한가 5,730')).toBeTruthy();
    const tag = within(sec).getByText('잠김 ① · 10초 뒤 깨짐');
    expect(tag.getAttribute('data-tone')).toBe('up');
    expect(tag.className).toContain('bg-[var(--up-bg)]');
    expect(tag.className).toContain('text-[var(--up)]');
    await waitFor(() => expect(sec.querySelectorAll('svg').length).toBe(2));
  });

  it('유지 태그 down · 잠김 없음 → 결과 태그 1개(「미도달」) + 「잠김 구간이 없어요」', async () => {
    urlsOk();
    renderCard(AXION);
    const tag = within(card(AXION)).getByText('잠김 ② · 종가 유지');
    expect(tag.className).toContain('bg-[var(--down-bg)]');
    renderCard(HYUNGJI);
    const h = card(HYUNGJI);
    expect(within(h).getByText('미도달').className).toContain('bg-[var(--muted)]');
    expect(h.querySelectorAll('[data-slot="limitup-lock-tags"] > span')).toHaveLength(1);
    expect(within(h).getByText('잠김 구간이 없어요')).toBeTruthy();
    await waitFor(() => expect(h.querySelectorAll('svg').length).toBe(1)); // 레인 1 만
  });

  it('잠김 7개 이상 → 6개 + 「+N」(title 에 나머지)', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    const many = Array.from({ length: 8 }, (_, i) =>
      lockRow({ isin: 'KR7000009999', lock_id: i + 1, broke: true, dur_s: 30, start_ms: 1, end_ms: 2 }),
    );
    const row = { ...rowOf(DUKWOO), isin: 'KR7000009999', locks: many };
    render(<LimitupEventCard date={D} row={row} entry={null} facts={[]} marks={[]} />);
    const sec = card('KR7000009999');
    const tags = sec.querySelectorAll('[data-slot="limitup-lock-tags"] > span');
    expect(tags).toHaveLength(7);
    const more = within(sec).getByText('+2');
    expect(more.getAttribute('title')).toBe('잠김 ⑦ · 30초 뒤 깨짐 · 잠김 ⑧ · 30초 뒤 깨짐');
  });
});

describe('LimitupEventCard — 사실 문장 · 창구 비중', () => {
  it('facts.text 그대로 · t_ms → event_no → fact_no 순 · 시각 칸 · 출처 배지 글자 그대로', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const items = card(DUKWOO).querySelectorAll('[data-slot="limitup-facts"] li');
    const mine = facts.filter((f) => f.isin === DUKWOO);
    expect(items).toHaveLength(mine.length);
    expect(items[0]!.textContent).toBe('09:02:26' + mine[0]!.text + '실측');
    const sources = [...items].map((li) => li.querySelector('[data-slot="limitup-source"]')!.textContent);
    expect(sources).toContain('추정(분 단위)');
    expect(sources.every((s) => s === '실측' || s === '추정(분 단위)')).toBe(true);
    // 같은 t_ms 09:06:01.938 — event 0 첫 상한가 체결이 event 1 잠김 시작보다 앞
    const texts = [...items].map((li) => li.textContent ?? '');
    expect(texts.findIndex((t) => t.includes('첫 상한가 체결'))).toBeLessThan(
      texts.findIndex((t) => t.includes('잠김 1 시작')),
    );
  });

  it('창구 막대 — 진입 1분 매수(up) 3행 · 깨짐 전 1분 매도(down) · 너비 = 비중 %', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const m = card(DUKWOO).querySelector('[data-slot="limitup-members"]')!;
    expect(within(m as HTMLElement).getByText('B9 1분 증분 배분')).toBeTruthy();
    expect(within(m as HTMLElement).getByText('추정(분 단위)')).toBeTruthy();
    const [buy, sell] = m.querySelectorAll('[data-slot="limitup-bars"]');
    expect(buy!.getAttribute('data-tone')).toBe('up');
    expect(sell!.getAttribute('data-tone')).toBe('down');
    expect(buy!.textContent).toContain('한국증권');
    expect(buy!.textContent).toContain('54.4%');
    const fills = buy!.querySelectorAll<HTMLElement>('[data-slot="limitup-bar-fill"]');
    expect(fills).toHaveLength(3);
    expect(fills[0]!.style.width).toBe('54.4%');
    expect(fills[0]!.className).toContain('bg-[var(--up)]');
    expect(sell!.querySelector('[data-slot="limitup-bar-fill"]')!.className).toContain('bg-[var(--down)]');
  });

  it('깨진 잠김 없음 → 「깨짐 전 1분 매도」 묶음 자체 없음 · 사실 없음 → 「사실 문장이 없어요」 · 막대 없음 「—」', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(AXION, { facts: [] });
    const c = card(AXION);
    expect(within(c).queryByText('깨짐 전 1분 매도')).toBeNull();
    expect(within(c).getByText('사실 문장이 없어요')).toBeTruthy();
    const members = c.querySelector('[data-slot="limitup-members"]') as HTMLElement;
    expect(within(members).getByText('—')).toBeTruthy();
  });
});

describe('LimitupEventCard — 격자 지연 로드 · 레인', () => {
  it('화면 근처에 오기 전엔 요청 0 → IntersectionObserver 가 알리면 grid-urls → 격자', async () => {
    let fire: ((e: { isIntersecting: boolean }[]) => void) | null = null;
    let opts: IntersectionObserverInit | undefined;
    class IO {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void, o?: IntersectionObserverInit) {
        fire = cb;
        opts = o;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', IO);
    urlsOk();
    renderCard(DUKWOO);
    expect(opts?.rootMargin).toBe('400px 0px');
    expect(urlsMock).not.toHaveBeenCalled();
    expect(card(DUKWOO).querySelectorAll('[data-slot="limitup-lane-slot"][data-state="loading"]')).toHaveLength(2);
    act(() => fire!([{ isIntersecting: true }]));
    await waitFor(() => expect(card(DUKWOO).querySelectorAll('svg')).toHaveLength(2));
    expect(urlsMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('로딩 — 레인 자리 높이 유지 + 「불러오는 중…」 · 캡션 범위는 격자 없이도 보인다 · 사실 문장은 그대로', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    const slots = c.querySelectorAll<HTMLElement>('[data-slot="limitup-lane-slot"]');
    expect(slots).toHaveLength(2);
    expect(slots[0]!.style.height).toBe('180px');
    expect(slots[1]!.style.height).toBe('140px');
    expect(within(c).getAllByText('불러오는 중…')).toHaveLength(2);
    expect(within(c).getByText('진입 10분 · 09:00~09:07 — 가격(위) · 상한가까지 남은 매도벽 금액(아래)')).toBeTruthy();
    expect(
      within(c).getByText('잠김 전 구간 · 09:04~09:07 — 상한가 매수잔량 금액 · 큰 매도 ▼ · 취소 ✕ · 깨짐 ●'),
    ).toBeTruthy();
    expect(c.querySelectorAll('[data-slot="limitup-facts"] li').length).toBeGreaterThan(0);
  });

  it('에러 — 「곡선을 불러오지 못했어요」 + 「다시 시도」 1개 → 누르면 다시 받아 레인', async () => {
    urlsMock.mockResolvedValue({ date: D, expiresIn: 600, urls: { [DUKWOO]: 'https://storage.test/x?t=1' } });
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    await waitFor(() => expect(within(c).getAllByText('곡선을 불러오지 못했어요')).toHaveLength(2));
    const retry = within(c).getAllByRole('button', { name: '다시 시도' });
    expect(retry).toHaveLength(1);
    expect(c.querySelectorAll('[data-slot="limitup-facts"] li').length).toBeGreaterThan(0); // 서버 집계는 그대로
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => gz(DUKWOO));
    fireEvent.click(retry[0]!);
    await waitFor(() => expect(c.querySelectorAll('svg')).toHaveLength(2));
  });

  it('레인 — SVG role=img + 요약 aria-label · 높이 160/120 · 오버레이 라벨(최대 · 깨짐 · 가장 큰 ▼ · ✕)', async () => {
    urlsOk();
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    await waitFor(() => expect(c.querySelectorAll('svg')).toHaveLength(2));
    const lock = screen.getByRole('img', { name: '덕우전자 잠김 전 구간 잔량 — 최대 27.5억 09:06:02, 깨짐 09:06:12' });
    const entry = screen.getByRole('img', { name: /^덕우전자 진입 10분 09:00~09:07 가격 · 매도벽 — 첫 상한가 체결 09:06:01$/ });
    expect((entry.parentElement as HTMLElement).style.height).toBe('160px');
    expect((lock.parentElement as HTMLElement).style.height).toBe('120px');
    const overlay = lock.parentElement!.querySelector('[data-slot="limitup-lane-overlay"]')!;
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    const labels = [...overlay.querySelectorAll('[data-label]')].map((l) => l.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['기준 10억', '최대 27.5억 @09:06:02', '깨짐 09:06:12', '09:06 매도 6,713주', '취소 −4.6억']),
    );
    // 나머지 ▼ · ✕ 는 글자 없이 title 만
    expect(overlay.querySelectorAll('[data-mark="sell"]')).toHaveLength(7);
    expect(overlay.querySelectorAll('[data-mark="cancel"]')).toHaveLength(6);
    for (const m of overlay.querySelectorAll('[data-mark]')) expect(m.getAttribute('title')).toBeTruthy();
    const entryLabels = [...entry.parentElement!.querySelectorAll('[data-label]')].map((l) => l.textContent);
    expect(entryLabels).toEqual(
      expect.arrayContaining(['상한가 5,730', '등락률 25%', '25% 도달', '매도벽 소진', '첫 상한가 체결']),
    );
  });

  it('색 감사 — SVG stroke/fill 허용 집합 · 오버레이 마커 색 · 초록 상태 토큰 0 · SVG 안 글자 요소 0', async () => {
    urlsOk();
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    await waitFor(() => expect(c.querySelectorAll('svg')).toHaveLength(2));
    const allowed = new Set(['var(--fg)', 'var(--muted)', 'var(--led-latent)', 'var(--border-subtle)', 'none']);
    for (const svg of c.querySelectorAll('svg')) {
      for (const el of svg.querySelectorAll('*')) {
        for (const a of ['stroke', 'fill']) {
          const v = el.getAttribute(a);
          if (v !== null) expect(allowed.has(v), `${el.tagName} ${a}=${v}`).toBe(true);
        }
        expect(['rect', 'line', 'path']).toContain(el.tagName.toLowerCase());
      }
      expect(svg.querySelectorAll('text, tspan, foreignObject')).toHaveLength(0);
    }
    const ov = (k: string) => c.querySelector(`[data-mark="${k}"]`)!.className;
    expect(ov('break')).toContain('bg-[var(--up)]');
    expect(ov('sell')).toContain('text-[var(--down)]');
    expect(ov('cancel')).toContain('text-[var(--muted-fg)]');
    expect(ov('reach25')).toContain('bg-[var(--led-latent)]');
    expect(ov('firstUpper')).toContain('bg-[var(--fg)]');
    expect(ov('max')).toContain('bg-[var(--fg)]');
    const breakLabel = [...c.querySelectorAll('[data-label]')].find((l) => l.textContent === '깨짐 09:06:12')!;
    expect(breakLabel.className).toContain('text-[var(--up)]');
    expect(c.innerHTML).not.toContain('led-armed');
  });
});
