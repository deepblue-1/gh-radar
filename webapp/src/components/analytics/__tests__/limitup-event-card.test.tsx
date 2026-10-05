import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Phase 28 Plan 13 Task 2 — 사건 카드 (UI-SPEC ④-4 · D-11 · D-12 · E8).
 *
 * 잠그는 것: `section#ev-{isin}` + aria-labelledby → 리스트 행 버튼(quick-261005-vk1 D-03 — 외피 · 머리 없음) ·
 * D-04 스케치 011 A: 한 줄 요약 · 레인 제목/캡션 · 번호 사실 문장(시각 접두 없음 · 창구 문장 머리) · 번호 배지 ↔ 사실 줄 호버
 * 상호 강조 · 창구 막대 제목 + range(매수 up · 매도 down · 깨진 잠김 없으면 매도 묶음 없음) · 25% 계열 없음 · 출처 배지 글자
 * 그대로 · 빈 문구 · 마운트 즉시 격자 로드 · 로딩/에러/다시 시도 ·
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
    expect(sec.querySelector('h2')).toBeNull();
    expect(sec.className).not.toContain('bg-[var(--card)]');
    await waitFor(() => expect(sec.querySelectorAll('svg').length).toBe(2));
  });

  it('미도달 종목은 목록 행이 없다(사건 카드 대상 아님)', () => {
    expect(rows.map((r) => r.isin)).toEqual([DUKWOO, AXION]);
    expect(rows.some((r) => r.isin === HYUNGJI)).toBe(false);
  });
});

describe('LimitupEventCard — 한 줄 요약 · 사실 문장 · 창구 막대', () => {
  it('한 줄 요약 — 덕우전자 「… → 10.1초 만에 깨짐(5,720원) · 종가 5,290원 (−7.7%)」 + 상한가 직전 1분 매수 1위', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const story = card(DUKWOO).querySelector<HTMLElement>('[data-slot="limitup-story"]')!;
    const [main, sub] = story.querySelectorAll('p');
    expect(main!.textContent).toBe(
      '09:02:26 20% 도달 → 3분 35초 뒤 09:06:01 첫 상한가 5,730원 → 10.1초 만에 깨짐(5,720원) · 종가 5,290원 (−7.7%)',
    );
    expect([...main!.querySelectorAll('strong')].map((s) => s.textContent)).toEqual([
      '09:02:26',
      '09:06:01',
      '5,730원',
      '10.1초',
    ]);
    expect(sub!.textContent).toBe('상한가 직전 1분 매수 1위 한국증권 54.4%');
  });

  it('레인 제목 · 캡션 — 「상한가 도달까지」 「잠김 구간」(옛 「진입 10분」 「잠김 전 구간」 없음)', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    expect(within(c).getByRole('heading', { level: 3, name: '상한가 도달까지' })).toBeTruthy();
    expect(within(c).getByText('09:00~09:07 · 가격(위) · 상한가까지 남은 매도벽(아래)')).toBeTruthy();
    expect(within(c).getByRole('heading', { level: 3, name: '잠김 구간' })).toBeTruthy();
    expect(within(c).getByText('09:06:01~09:06:12 · 상한가 매수잔량 금액 · 큰 매도 ▼ · 취소 ✕')).toBeTruthy();
    expect(c.textContent).not.toMatch(/진입 10분|잠김 전 구간|진입 1분|깨짐 전 1분|25%/);
  });

  it('사실 문장 — 번호 배지 · 시각 칸 · 시각 접두 없는 문장 · 창구 문장 머리 · 출처 글자 그대로', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const items = [...card(DUKWOO).querySelectorAll<HTMLElement>('[data-slot="limitup-facts"] li')];
    expect(items).toHaveLength(facts.filter((f) => f.isin === DUKWOO).length);
    expect(items.map((li) => li.getAttribute('data-event-n'))).toEqual([
      '1', '2', '3', null, '4', '5', '6', '7', '8', '9', null,
    ]);
    const text = (li: HTMLElement) => li.querySelector('[data-slot="limitup-fact-text"]')!.textContent;
    expect(items[0]!.textContent).toBe('109:02:26등락률 20% 첫 도달 — 현재가 5,300원실측');
    expect(text(items[3]!)).toBe(
      '상한가 직전 1분 매수 창구 (09:05:01~09:06:01): 한국증권 54.4% · 신한증권 42.1% · NH투자증권 3.4%추정(분 단위)',
    );
    expect(text(items[10]!)).toMatch(/^깨짐 직전 1분 매도 창구 \(09:05:12~09:06:12\): 신한증권 96\.2%/);
    for (const li of items) expect(text(li)).not.toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} /);
    // 강조 번호(20% 도달 · 첫 상한가 · 잠김 시작 · 깨짐) = --fg 바탕
    const disc = (n: string) => items.find((li) => li.getAttribute('data-event-n') === n)!.querySelector('[data-slot="limitup-fact-n"]')!;
    expect(disc('1').className).toContain('bg-[var(--fg)]');
    expect(disc('2').className).toContain('bg-[var(--muted)]');
    const sources = items.map((li) => li.querySelector('[data-slot="limitup-source"]')!.textContent);
    expect(sources.every((x) => x === '실측' || x === '추정(분 단위)')).toBe(true);
  });

  it('창구 막대 — 「상한가 직전 1분 매수 창구」 + range · 「깨짐 직전 1분 매도 창구」 + range · 너비 = 비중 %', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const m = card(DUKWOO).querySelector<HTMLElement>('[data-slot="limitup-members"]')!;
    expect(within(m).getByRole('heading', { level: 4, name: '상한가 직전 1분 매수 창구' })).toBeTruthy();
    expect(within(m).getByText('09:05:01~09:06:01 · 1분 단위 배분이라 추정')).toBeTruthy();
    expect(within(m).getByRole('heading', { level: 4, name: '깨짐 직전 1분 매도 창구' })).toBeTruthy();
    expect(within(m).getByText('09:05:12~09:06:12 · 1분 단위 배분이라 추정')).toBeTruthy();
    expect(within(m).queryByText('B9 1분 증분 배분')).toBeNull();
    const [buy, sell] = m.querySelectorAll('[data-slot="limitup-bars"]');
    expect(buy!.getAttribute('data-tone')).toBe('up');
    expect(sell!.getAttribute('data-tone')).toBe('down');
    expect(buy!.textContent).toContain('한국증권');
    const fills = buy!.querySelectorAll<HTMLElement>('[data-slot="limitup-bar-fill"]');
    expect(fills).toHaveLength(3);
    expect(fills[0]!.style.width).toBe('54.4%');
    expect(fills[0]!.className).toContain('bg-[var(--up)]');
    expect(sell!.querySelector('[data-slot="limitup-bar-fill"]')!.className).toContain('bg-[var(--down)]');
  });

  it('깨진 잠김 없음 → 매도 막대 묶음 자체 없음 · 사실 없음 → 「사실 문장이 없어요」 · 막대 없음 「—」', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(AXION, { facts: [] });
    const c = card(AXION);
    expect(within(c).queryByText('깨짐 직전 1분 매도 창구')).toBeNull();
    expect(within(c).getByText('사실 문장이 없어요')).toBeTruthy();
    const members = c.querySelector('[data-slot="limitup-members"]') as HTMLElement;
    expect(within(members).getByText('—')).toBeTruthy();
  });
});

describe('LimitupEventCard — 격자 로드 · 레인', () => {
  it('열리면(마운트) 바로 grid-urls → 격자 — 화면 근처 지연 로드 없음', async () => {
    urlsOk();
    renderCard(DUKWOO);
    expect(urlsMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(card(DUKWOO).querySelectorAll('svg')).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('로딩 — 레인 자리 높이 유지(띠 1줄 + 플롯 + 눈금) + 「불러오는 중…」 · 요약 · 사실 문장은 그대로', () => {
    urlsMock.mockReturnValue(new Promise(() => {}));
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    const slots = c.querySelectorAll<HTMLElement>('[data-slot="limitup-lane-slot"]');
    expect(slots).toHaveLength(2);
    expect(slots[0]!.style.height).toBe('206px');
    expect(slots[1]!.style.height).toBe('166px');
    expect(within(c).getAllByText('불러오는 중…')).toHaveLength(2);
    expect(c.querySelector('[data-slot="limitup-story"]')).toBeTruthy();
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

  it('레인 — SVG role=img + 요약 aria-label · 플롯 높이 160/120 · 라벨 띠 번호 배지 · 선 라벨 · 직전 1분 캡션 · 25% 없음', async () => {
    urlsOk();
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    await waitFor(() => expect(c.querySelectorAll('svg')).toHaveLength(2));
    const lock = screen.getByRole('img', { name: '덕우전자 잠김 구간 잔량 — 최대 27.5억 09:06:02, 깨짐 09:06:12' });
    const entry = screen.getByRole('img', {
      name: /^덕우전자 상한가 도달까지 09:00~09:07 가격 · 매도벽 — 첫 상한가 체결 09:06:01$/,
    });
    expect((entry.parentElement as HTMLElement).style.height).toBe('160px');
    expect((lock.parentElement as HTMLElement).style.height).toBe('120px');

    const entryLane = entry.closest<HTMLElement>('[data-slot="limitup-lane"]')!;
    const band = entryLane.querySelector('[data-slot="limitup-event-band"]')!;
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect([...band.querySelectorAll('[data-event-n]')].map((b) => b.textContent)).toEqual([
      '109:02:26 20% 도달 · 5,300원',
      '209:02:51 매수 버스트 3,314만',
      '309:06:01 첫 상한가 체결 · 5,730원',
    ]);
    const labels = [...entryLane.querySelectorAll('[data-label]')].map((l) => l.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['상한가 5,730원', '등락률 20% (탐지 기준) 5,292원', '상한가 직전 1분']),
    );
    expect(labels.join('|')).not.toMatch(/25%/);

    const lockLane = lock.closest<HTMLElement>('[data-slot="limitup-lane"]')!;
    const lockLabels = [...lockLane.querySelectorAll('[data-label]')].map((l) => l.textContent);
    expect(lockLabels).toEqual(expect.arrayContaining(['기준 10억', '깨짐 직전 1분']));
    const overlay = lockLane.querySelector('[data-slot="limitup-lane-overlay"]')!;
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
    // ▼ · ✕ 는 글자 없이 title 만 · 번호 마커 ④~⑨
    expect(overlay.querySelectorAll('[data-mark="sell"]')).toHaveLength(7);
    expect(overlay.querySelectorAll('[data-mark="cancel"]')).toHaveLength(6);
    for (const m of overlay.querySelectorAll('[data-mark]')) expect(m.getAttribute('title')).toBeTruthy();
    expect(
      [...overlay.querySelectorAll('[data-slot="limitup-point"]')].map((p) => p.getAttribute('data-event-n')),
    ).toEqual(['4', '5', '6', '7', '8', '9']);
  });

  it('호버 상호 강조 — 사실 줄에 올리면 같은 번호 배지 · 점이 강조 · 배지에 올리면 사실 줄이 강조', async () => {
    urlsOk();
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    await waitFor(() => expect(c.querySelectorAll('svg')).toHaveLength(2));
    const factLi = c.querySelector<HTMLElement>('[data-slot="limitup-facts"] li[data-event-n="3"]')!;
    fireEvent.mouseEnter(factLi);
    const badge = c.querySelector<HTMLElement>('[data-slot="limitup-event-band"] [data-event-n="3"]')!;
    expect(badge.getAttribute('data-hl')).toBe('true');
    expect(badge.className).toContain('bg-[color-mix(in_oklab,var(--muted-fg)_30%,var(--muted))]');
    expect(c.querySelector('[data-slot="limitup-point"][data-event-n="3"]')!.getAttribute('data-hl')).toBe('true');
    expect(factLi.className).toContain('bg-[var(--muted)]');
    fireEvent.mouseLeave(factLi);
    expect(badge.hasAttribute('data-hl')).toBe(false);

    const badge9 = c.querySelector<HTMLElement>('[data-slot="limitup-point"][data-event-n="9"]')!;
    fireEvent.mouseEnter(badge9);
    expect(c.querySelector('[data-slot="limitup-facts"] li[data-event-n="9"]')!.getAttribute('data-hl')).toBe('true');
  });

  it('색 감사 — SVG stroke/fill 허용 집합(+ --accent 창 면) · 마커 색 · 초록 상태 토큰 0 · SVG 안 글자 요소 0', async () => {
    urlsOk();
    renderCard(DUKWOO);
    const c = card(DUKWOO);
    await waitFor(() => expect(c.querySelectorAll('svg')).toHaveLength(2));
    const allowed = new Set([
      'var(--fg)',
      'var(--muted)',
      'var(--led-latent)',
      'var(--border-subtle)',
      'var(--accent)',
      'none',
    ]);
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
    expect(c.querySelectorAll('rect[data-slot="limitup-window"][fill="var(--accent)"]')).toHaveLength(2);
    const pt = (n: string) => c.querySelector(`[data-slot="limitup-point"][data-event-n="${n}"]`)!.className;
    expect(pt('1')).toContain('bg-[var(--led-latent)]');
    expect(pt('9')).toContain('bg-[var(--up)]');
    expect(pt('3')).toContain('bg-[var(--fg)]');
    expect(c.querySelector('[data-mark="sell"]')!.className).toContain('text-[var(--down)]');
    expect(c.querySelector('[data-mark="cancel"]')!.className).toContain('text-[var(--muted-fg)]');
    expect(c.querySelector('[data-mark="wallClear"]')!.className).toContain('bg-[var(--fg)]');
    expect(c.innerHTML).not.toMatch(/led-armed|--success|--green/);
  });
});
