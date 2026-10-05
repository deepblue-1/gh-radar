import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Phase 28 Plan 13 Task 2 — 사건 카드 (UI-SPEC ④-4 · D-11 · D-12 · E8).
 *
 * 잠그는 것: `section#ev-{isin}` + aria-labelledby → 리스트 행 버튼(quick-261005-vk1 D-03 — 외피 · h3 없음) · 사실 문장 순서 ·
 * 출처 배지 글자 그대로 · 창구 막대(매수 up · 매도 down · 깨진 잠김 없으면 매도 묶음 없음) · 빈 문구 · 마운트 즉시 격자 로드 ·
 * 로딩/에러/다시 시도 ·
 * **색 감사**(SVG stroke/fill 허용 집합 · 오버레이 마커 색 · 초록 상태 토큰 0 · SVG 안 글자 요소 0).
 * 입력 = 실 export 20261002(덕우전자 깨짐 · 엑시온그룹 유지 · 형지글로벌 미도달 = 목록 밖) + 실 격자 gzip.
 */

const urlsMock = vi.fn();
vi.mock('@/lib/limitup-api', () => ({
  fetchLimitupGridUrls: (d: string) => urlsMock(d),
}));

import type { LimitupFactRow } from '@gh-radar/shared';

import { dayRowsOf } from '@/lib/limitup-report';
import { __resetLimitupGridCache } from '@/lib/use-limitup-grid';
import { dayOf } from '@/test-fixtures/limitup-report';
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

describe('LimitupEventCard — 외피(리스트 행 아래 펼침)', () => {
  it('section#ev-{isin} · aria-labelledby = 리스트 행 버튼 → region 이름 · 머리(h3) · 카드 외피 없음', async () => {
    urlsOk();
    render(
      <>
        <button type="button" id={`limitup-row-${DUKWOO}`}>
          덕우전자 263600 — 사건 카드
        </button>
        <LimitupEventCard
          date={D}
          row={rowOf(DUKWOO)}
          labelledBy={`limitup-row-${DUKWOO}`}
          entry={entries.find((e) => e.isin === DUKWOO) ?? null}
          facts={facts.filter((f) => f.isin === DUKWOO)}
          marks={marks.filter((m) => m.isin === DUKWOO)}
        />
      </>,
    );
    const sec = card(DUKWOO);
    expect(sec.tagName).toBe('SECTION');
    expect(sec.getAttribute('aria-labelledby')).toBe(`limitup-row-${DUKWOO}`);
    expect(screen.getByRole('region', { name: '덕우전자 263600 — 사건 카드' })).toBe(sec);
    expect(sec.querySelector('h3')).toBeNull();
    expect(sec.className).not.toContain('bg-[var(--card)]');
    await waitFor(() => expect(sec.querySelectorAll('svg').length).toBe(2));
  });

  it('미도달 종목은 목록 행이 없다(사건 카드 대상 아님)', () => {
    expect(rows.map((r) => r.isin)).toEqual([DUKWOO, AXION]);
    expect(rows.some((r) => r.isin === HYUNGJI)).toBe(false);
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
  it('열리면(마운트) 바로 grid-urls → 격자 — 화면 근처 지연 로드 없음', async () => {
    urlsOk();
    renderCard(DUKWOO);
    expect(urlsMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(card(DUKWOO).querySelectorAll('svg')).toHaveLength(2));
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
