import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { dayRowsOf } from '@/lib/limitup-report';
import { entryRow, kstMs, loadedReport, lockRow, summaryRow } from '@/test-fixtures/limitup-report';

import { LimitupDayGrid } from '../limitup-day-grid';

/**
 * Phase 28 Plan 12 Task 2 → quick-261005-vk1 D-03 — 상한가 종목 리스트 + 그 자리 펼침 (UI-SPEC ④-3 · D-12 중립색).
 *
 * 잠그는 것: 행 순서(미도달 없음) · 행 버튼 접근 이름 「… — 사건 카드」 · aria-describedby 설명(WR-A05) · aria-expanded /
 * aria-controls 아코디언(기본 첫 행 · 한 번에 하나 · 재클릭 닫힘) · 열린 행 아래 renderDetail(버튼의 다음 형제) ·
 * 결과 태그 색 클래스 · 스파크라인 색 감사(`--fg` · `--muted` · `--led-latent` 만) · SVG 안 글자 요소 0 · 깨짐 ● HTML 오버레이 ·
 * 「곡선 없음」 · 빈 상태 · 8칸 머리줄 aria-hidden · 「직전 1분 매수 1위」 머리.
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
      // 첫 상한가 없음(entry 있음) → 목록 밖
      entryRow({ isin: 'KR7000004005', name: '미도달', short_code: '000040', reached: false, t25_ms: 1 }),
    ],
    locks: [
      lockRow({ isin: A, lock_id: 1, start_ms: kstMs(D, '09:30:00'), end_ms: kstMs(D, '10:00:00'), broke: true }),
      lockRow({ isin: A, lock_id: 2, start_ms: kstMs(D, '10:05:00'), end_ms: null, broke: false }),
      lockRow({ isin: B, lock_id: 1, start_ms: kstMs(D, '09:05:00'), end_ms: kstMs(D, '12:15:00'), broke: true }),
      // entry 없는 옛 잠김 행 — 이름 · 코드 null · 격자 없음
      lockRow({ isin: C, lock_id: 1, start_ms: kstMs(D, '11:00:00'), end_ms: kstMs(D, '11:00:30'), broke: true }),
    ],
    facts: [
      {
        date: D,
        isin: A,
        event_no: 0,
        fact_no: 4,
        t_ms: kstMs(D, '09:30:00'),
        template_id: 'member_entry_buy',
        text: '진입 1분 매수 창구 상위: 한국증권 54.4% · 신한증권 42.1%',
        values: { m1: '한국증권', m1_code: '00003', s1: 54.4, m2: '신한증권', m2_code: '00002', s2: 42.1 },
        source: '추정(분 단위)',
        schema_version: 1,
      },
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
  return render(
    <LimitupDayGrid
      rows={dayRowsOf(report)}
      renderDetail={(r) => <section id={`ev-${r.isin}`} data-testid="detail" data-isin={r.isin} />}
    />,
  );
}

const rowButtons = () => within(document.querySelector('ol')!).getAllByRole('button');

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('LimitupDayGrid', () => {
  it('행 순서 = 첫 상한 시각(없으면 첫 잠김) 순 · 미도달 없음 · 접근 이름 「{종목명} {코드} — 사건 카드」', () => {
    renderGrid();
    expect(rowButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      '베타 000020 — 사건 카드',
      '알파 000010 — 사건 카드',
      `${C} — 사건 카드`,
    ]);
    expect(rowButtons().every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(document.querySelector('[data-isin="KR7000004005"]')).toBeNull();
  });

  it('행 값은 설명(aria-describedby)으로 보조기기에 닿는다 — 결과 · 첫 상한가 · 최대 · +60초 매도 · 직전 1분 매수 1위 (WR-A05)', () => {
    renderGrid();
    const [, alpha, c] = rowButtons();
    expect(alpha).toHaveAccessibleName('알파 000010 — 사건 카드');
    expect(alpha).toHaveAccessibleDescription(
      '결과 깨짐 · 유지, 첫 상한가 09:30:00, 최대 23.4억, +60초 매도 4%, 직전 1분 매수 1위 한국증권 54.4% (추정)',
    );
    // 값 없는 칸은 「—」 그대로 · 창구가 없으면 (추정) 꼬리 없음
    expect(c).toHaveAccessibleDescription('결과 깨짐, 첫 상한가 11:00:00, 최대 —, +60초 매도 —, 직전 1분 매수 1위 —');
  });

  it('아코디언 — 기본 첫 행만 열림 · 다른 행 클릭 → 그 행만 · 같은 행 재클릭 → 전부 닫힘', () => {
    renderGrid();
    const expanded = () => rowButtons().map((b) => b.getAttribute('aria-expanded'));
    expect(expanded()).toEqual(['true', 'false', 'false']);
    expect(rowButtons()[0]!.getAttribute('aria-controls')).toBe(`ev-${B}`);
    expect(rowButtons()[1]!.hasAttribute('aria-controls')).toBe(false);
    expect(screen.getAllByTestId('detail').map((d) => d.getAttribute('data-isin'))).toEqual([B]);

    fireEvent.click(rowButtons()[1]!);
    expect(expanded()).toEqual(['false', 'true', 'false']);
    expect(rowButtons()[1]!.getAttribute('aria-controls')).toBe(`ev-${A}`);
    expect(screen.getAllByTestId('detail').map((d) => d.getAttribute('data-isin'))).toEqual([A]);

    fireEvent.click(rowButtons()[1]!);
    expect(expanded()).toEqual(['false', 'false', 'false']);
    expect(screen.queryAllByTestId('detail')).toHaveLength(0);
  });

  it('열린 행의 상세는 그 행 버튼의 바로 다음 형제 · 열린 버튼은 호버와 같은 면', () => {
    renderGrid();
    fireEvent.click(rowButtons()[2]!);
    const btn = rowButtons()[2]!;
    expect(btn.nextElementSibling).toBe(document.getElementById(`ev-${C}`));
    expect(btn.className).toContain('bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]');
    expect(btn.id).toBe(`limitup-row-${C}`);
  });

  it('행을 열 때 그 행이 앱 머리 위로 숨었으면 scrollIntoView(block start · reduced-motion 이면 auto)', () => {
    renderGrid();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q }) as unknown as MediaQueryList,
    );
    const btn = rowButtons()[1]!;
    const scroll = vi.fn();
    btn.scrollIntoView = scroll;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ top: -40 } as DOMRect);
    fireEvent.click(btn);
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });

    // 화면 안이면 건드리지 않는다
    const other = rowButtons()[2]!;
    const scroll2 = vi.fn();
    other.scrollIntoView = scroll2;
    vi.spyOn(other, 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect);
    fireEvent.click(other);
    expect(scroll2).not.toHaveBeenCalled();
  });

  it('제목 「상한가 종목」 + 부제 · 데스크톱 머리줄은 aria-hidden 8칸 · 「직전 1분 매수 1위」', () => {
    renderGrid();
    expect(screen.getByRole('heading', { level: 2, name: '상한가 종목' })).toBeTruthy();
    expect(screen.getByText('첫 상한가 시각 순 · 잔량 곡선 09:00~15:30')).toBeTruthy();
    const head = screen.getByText('직전 1분 매수 1위').parentElement!;
    expect(head.getAttribute('aria-hidden')).toBe('true');
    expect(head.children).toHaveLength(8);
    expect([...head.children].map((c) => c.textContent)).toEqual([
      '종목',
      '결과',
      '첫 상한가',
      '잔량 (09:00~15:30)',
      '최대 잔량',
      '+60초 매도',
      '직전 1분 매수 1위',
      '',
    ]);
  });

  it('결과 태그 색 — 깨짐 up · 유지 down · 「깨짐」「유지」 둘', () => {
    renderGrid();
    const [beta, alpha] = rowButtons();
    const tagOf = (row: HTMLElement, t: string) => row.querySelector<HTMLElement>(`[data-tag="${t}"]`)!;
    expect(tagOf(beta!, '깨짐').className).toContain('bg-[var(--up-bg)]');
    expect(tagOf(beta!, '깨짐').className).toContain('text-[var(--up)]');
    expect([...alpha!.querySelectorAll('[data-tag]')].map((e) => e.textContent)).toEqual(['깨짐', '유지']);
    expect(tagOf(alpha!, '유지').className).toContain('bg-[var(--down-bg)]');
    expect(tagOf(alpha!, '유지').className).toContain('text-[var(--down)]');
  });

  it('메타 — 「{코드} · 상한가 {N}원」 · 첫 상한가 · 최대 · +60초 매도 · 직전 1분 매수 1위(말줄임 + title) + 추정 배지 · 없는 값 「—」', () => {
    renderGrid();
    const alpha = rowButtons()[1]!;
    expect(within(alpha).getByText('000010 · 상한가 1,000원')).toBeTruthy();
    expect(alpha.textContent).toContain('09:30:00');
    expect(alpha.textContent).toContain('23.4억');
    expect(alpha.textContent).toContain('4%');
    const top = within(alpha).getByText('한국증권 54.4%');
    expect(top.getAttribute('title')).toBe('한국증권 54.4%');
    expect(top.className).toContain('truncate');
    expect(within(alpha).getByText('추정').getAttribute('title')).toBe('추정(분 단위)');
    // entries.entry_buy_member1(키움 00050)는 다른 창이라 쓰지 않는다
    expect(alpha.textContent).not.toContain('키움');
    const c = rowButtons()[2]!;
    expect(within(c).queryByText('추정')).toBeNull();
    expect(within(c).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('스파크라인 색 감사 — fill/stroke 는 var(--fg) · var(--muted) · var(--led-latent) 만 · SVG 안 글자 0', () => {
    renderGrid();
    const svgs = document.querySelectorAll('svg:not(.lucide)'); // chevron(lucide) 은 장식 아이콘
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
    const alphaSvg = rowButtons()[1]!.querySelector('svg:not(.lucide)')!;
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
    expect(c.querySelector('svg:not(.lucide)')).toBeNull();
  });

  it('행 0 → 「이 날은 상한가 사건이 없어요」 · 목록 없음', () => {
    render(<LimitupDayGrid rows={[]} />);
    expect(screen.getByText('이 날은 상한가 사건이 없어요')).toBeTruthy();
    expect(screen.getByText('상한가에 닿은 종목이 없는 날이에요. ‹ 로 이전 보고서를 볼 수 있어요')).toBeTruthy();
    expect(document.querySelector('ol')).toBeNull();
  });
});
