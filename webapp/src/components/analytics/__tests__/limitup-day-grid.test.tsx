import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { dayRowsOf } from '@/lib/limitup-report';
import { entryRow, kstMs, loadedReport, lockRow, summaryRow } from '@/test-fixtures/limitup-report';

import { LimitupDayGrid } from '../limitup-day-grid';

/**
 * Phase 28 Plan 12 Task 2 — 하루 격자 (UI-SPEC ④-3 · D-12 중립색).
 *
 * 잠그는 것: 행 순서 · 행 버튼 접근 이름 · 결과 태그 색 클래스 · 스파크라인 색 감사(`--fg` · `--muted` · `--led-latent` 만 —
 * 초록 상태 토큰 0 · 곡선에 매수/매도 관례색 0) · SVG 안 글자 요소 0 · 깨짐 ● HTML 오버레이 · 「곡선 없음」 ·
 * 행 → `#ev-{isin}` 스크롤 + h3 포커스(reduced-motion) · 빈 상태 · 8열 머리줄 aria-hidden.
 */

const D = '20261002';
const A = 'KR7000001001';
const B = 'KR7000002009';
const C = 'KR7000003007';

const report = loadedReport({
  day: {
    entries: [
      entryRow({
        isin: A,
        name: '알파',
        short_code: '000010',
        reached: true,
        first_upper_ms: kstMs(D, '09:30:00'),
        upper_px: 1000,
        close_px: 1000,
        entry_buy_member1: '00050',
        entry_buy_member2: '00002',
      }),
      entryRow({
        isin: B,
        name: '베타',
        short_code: '000020',
        reached: true,
        first_upper_ms: kstMs(D, '09:05:00'),
        upper_px: 2000,
        close_px: 1800,
      }),
      entryRow({ isin: C, name: null, short_code: null, reached: false, t25_ms: 1 }),
    ],
    locks: [
      lockRow({ isin: A, lock_id: 1, start_ms: kstMs(D, '09:30:00'), end_ms: kstMs(D, '10:00:00'), broke: true }),
      lockRow({ isin: A, lock_id: 2, start_ms: kstMs(D, '10:05:00'), end_ms: null, broke: false }),
      lockRow({ isin: B, lock_id: 1, start_ms: kstMs(D, '09:05:00'), end_ms: kstMs(D, '12:15:00'), broke: true }),
    ],
    summaries: [
      summaryRow({
        isin: A,
        q_krw: Array.from({ length: 2340 }, (_, i) => (i % 7 === 0 ? null : i * 1_000_000)),
        q_max_krw: 2_339_000_000,
        sell_share_60s: 0.04,
      }),
      summaryRow({ isin: B, q_krw: [0, 500_000_000, 1_500_000_000], q_max_krw: 1_500_000_000 }),
    ],
  },
});

function renderGrid() {
  return render(<LimitupDayGrid rows={dayRowsOf(report)} />);
}

const rowButtons = () => within(document.querySelector('ol')!).getAllByRole('button');

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('LimitupDayGrid', () => {
  it('행 순서 = 도달 · 첫 상한 시각 순 → 미도달 · 접근 이름 「{종목명} {코드} — 사건 카드로 이동」', () => {
    renderGrid();
    expect(rowButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      '베타 000020 — 사건 카드로 이동',
      '알파 000010 — 사건 카드로 이동',
      `${C} — 사건 카드로 이동`,
    ]);
    expect(rowButtons().every((b) => b.getAttribute('type') === 'button')).toBe(true);
  });

  it('행 값은 설명(aria-describedby)으로 보조기기에 닿는다 — 결과 태그 · 첫 잠김 · 잠김 · 최대 · +60초 매도 · 창구 (WR-A05)', () => {
    renderGrid();
    const [, alpha, c] = rowButtons();
    expect(alpha).toHaveAccessibleName('알파 000010 — 사건 카드로 이동');
    expect(alpha).toHaveAccessibleDescription(
      '결과 깨짐 · 유지, 첫 잠김 09:30:00, 잠김 2, 최대 23.4억, +60초 매도 4%, 창구 키움증권 · 신한증권 (추정)',
    );
    // 값 없는 칸은 「—」 그대로 · 창구가 없으면 (추정) 꼬리 없음
    expect(c).toHaveAccessibleDescription(/^결과 미도달, 첫 잠김 —, 잠김 .+, 창구 —$/);
  });

  it('제목 「하루 격자」 + 부제 · 데스크톱 머리줄은 aria-hidden 8칸', () => {
    renderGrid();
    expect(screen.getByRole('heading', { level: 2, name: '하루 격자' })).toBeTruthy();
    expect(screen.getByText('상한가 매수잔량 금액 · 09:00~15:30')).toBeTruthy();
    const head = screen.getByText('진입 매수 창구').parentElement!;
    expect(head.getAttribute('aria-hidden')).toBe('true');
    expect(head.children).toHaveLength(8);
    expect(head.className).toContain('xl:grid-cols-[152px_1fr_72px_40px_64px_72px_96px_128px]');
  });

  it('결과 태그 색 — 깨짐 up · 유지 down · 미도달 muted · 「깨짐」「유지」 둘', () => {
    renderGrid();
    const [beta, alpha, c] = rowButtons();
    const tagOf = (row: HTMLElement, t: string) => row.querySelector<HTMLElement>(`[data-tag="${t}"]`)!;
    expect(tagOf(beta!, '깨짐').className).toContain('bg-[var(--up-bg)]');
    expect(tagOf(beta!, '깨짐').className).toContain('text-[var(--up)]');
    expect([...alpha!.querySelectorAll('[data-tag]')].map((e) => e.textContent)).toEqual(['깨짐', '유지']);
    expect(tagOf(alpha!, '유지').className).toContain('bg-[var(--down-bg)]');
    expect(tagOf(alpha!, '유지').className).toContain('text-[var(--down)]');
    expect(tagOf(c!, '미도달').className).toContain('bg-[var(--muted)]');
    expect(tagOf(c!, '미도달').className).toContain('text-[var(--muted-fg)]');
  });

  it('메타 — 첫 잠김 · 잠김 · 최대 · +60초 매도 · 창구(말줄임 + title) + 추정 배지 · 없는 값 「—」', () => {
    renderGrid();
    const alpha = rowButtons()[1]!;
    expect(alpha.textContent).toContain('09:30:00');
    expect(alpha.textContent).toContain('23.4억');
    expect(alpha.textContent).toContain('4%');
    const members = within(alpha).getByText('키움증권 · 신한증권');
    expect(members.getAttribute('title')).toBe('키움증권 · 신한증권');
    expect(members.className).toContain('truncate');
    expect(within(alpha).getByText('추정').getAttribute('title')).toBe('추정(분 단위)');
    // 미도달 · 격자 없음 — 셀 단위 「—」 · 배지는 값 있을 때만
    const c = rowButtons()[2]!;
    expect(within(c).queryByText('추정')).toBeNull();
    expect(within(c).getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('스파크라인 색 감사 — fill/stroke 는 var(--fg) · var(--muted) · var(--led-latent) 만 · SVG 안 글자 0', () => {
    renderGrid();
    const svgs = document.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
    const allowed = new Set(['var(--fg)', 'var(--muted)', 'var(--led-latent)', 'none']);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('viewBox')).toBe('0 0 2340 100');
      expect(svg.querySelectorAll('text, tspan').length).toBe(0);
      for (const el of svg.querySelectorAll('*')) {
        for (const attr of ['fill', 'stroke']) {
          const v = el.getAttribute(attr);
          if (v !== null) expect(allowed.has(v)).toBe(true);
        }
      }
      expect(svg.outerHTML).not.toMatch(/led-armed|--up|--down/);
      const path = svg.querySelector('path')!;
      expect(path.getAttribute('stroke')).toBe('var(--fg)');
      expect(path.getAttribute('stroke-width')).toBe('1.5');
      expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      const line = svg.querySelector('line')!;
      expect(line.getAttribute('stroke')).toBe('var(--led-latent)');
      expect(line.getAttribute('stroke-dasharray')).toBe('2 4');
    }
    // 알파: 잠김 2구간 음영 · null 에서 끊긴 곡선(M 여러 개)
    const alphaSvg = rowButtons()[1]!.querySelector('svg')!;
    expect(alphaSvg.querySelectorAll('rect')).toHaveLength(2);
    expect(alphaSvg.querySelectorAll('rect')[0]!.getAttribute('fill')).toBe('var(--muted)');
    expect((alphaSvg.querySelector('path')!.getAttribute('d')!.match(/M/g) ?? []).length).toBeGreaterThan(1);
  });

  it('깨짐 ● = SVG 밖 HTML 오버레이(--up · aria-hidden · 깨진 잠김 end 시각 %)', () => {
    renderGrid();
    const beta = rowButtons()[0]!;
    const dots = beta.querySelectorAll<HTMLElement>('[data-slot="limitup-spark-break"]');
    expect(dots).toHaveLength(1);
    expect(dots[0]!.closest('svg')).toBeNull();
    expect(dots[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(dots[0]!.className).toContain('bg-[var(--up)]');
    // 12:15:00 = (44100 − 32400) / 23400 = 50%
    expect(dots[0]!.style.left).toBe('50%');
    // 알파는 깨진 잠김 1개(lock 1) · 유지된 잠김(lock 2)에는 ● 없음
    expect(rowButtons()[1]!.querySelectorAll('[data-slot="limitup-spark-break"]')).toHaveLength(1);
  });

  it('grid_summary 없는 행 = 슬롯 안 「곡선 없음」(11px --faint) · 표 값은 그대로', () => {
    renderGrid();
    const c = rowButtons()[2]!;
    const none = within(c).getByText('곡선 없음');
    expect(none.className).toContain('text-[11px]');
    expect(none.className).toContain('text-[var(--faint)]');
    expect(c.querySelector('svg')).toBeNull();
  });

  it('행 클릭 → #ev-{isin} scrollIntoView(smooth) + 카드 h3 focus(preventScroll)', () => {
    renderGrid();
    const card = document.createElement('section');
    card.id = `ev-${A}`;
    const h3 = document.createElement('h3');
    h3.tabIndex = -1;
    card.appendChild(h3);
    document.body.appendChild(card);
    const scroll = vi.fn();
    card.scrollIntoView = scroll;
    const focus = vi.spyOn(h3, 'focus');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: false, media: q }) as unknown as MediaQueryList,
    );

    fireEvent.click(rowButtons()[1]!);
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('reduced-motion 이면 behavior auto · 카드가 없으면 아무것도 하지 않는다', () => {
    renderGrid();
    const card = document.createElement('section');
    card.id = `ev-${B}`;
    document.body.appendChild(card);
    const scroll = vi.fn();
    card.scrollIntoView = scroll;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q }) as unknown as MediaQueryList,
    );
    fireEvent.click(rowButtons()[0]!);
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });

    expect(() => fireEvent.click(rowButtons()[2]!)).not.toThrow();
  });

  it('행 0 → 「이 날은 상한가 사건이 없어요」 · 목록 없음', () => {
    render(<LimitupDayGrid rows={[]} />);
    expect(screen.getByText('이 날은 상한가 사건이 없어요')).toBeTruthy();
    expect(screen.getByText('탐지 종목이 0개인 날이에요. ‹ 로 이전 보고서를 볼 수 있어요')).toBeTruthy();
    expect(document.querySelector('ol')).toBeNull();
  });
});
