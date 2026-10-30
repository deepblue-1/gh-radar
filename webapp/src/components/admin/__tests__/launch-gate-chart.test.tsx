import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { launchDaysOf, type LaunchMapPiece } from '@gh-radar/shared';

import { launchAxisOf, launchRibbonCellsOf, LAUNCH_CHART } from '@/lib/launch-map';

import { LaunchGateChart } from '../launch-gate-chart';

/**
 * Phase 35 (35-07) — 경계 지도 패널 `LaunchGateChart` (D-16 ~ D-19 · LAUNCH-06b).
 *
 * 입력 = shared 픽스처(gh-trade 첨부 pieces.json 사본)를 지도 조각 모양으로 옮긴 것 · 첨부 NEXT.
 * 잠그는 것: 패널 머리 집계 · 날짜 행 · 점 수 · 경계 띠 종류 · 다음 점선 · 빈 패널 문구 · jsdom 폴백 폭 640.
 */

interface AttachRow {
  date: string;
  broker: string;
  market: string;
  wire: number;
  j: number;
  rel: number;
  result: string;
}

const RAW = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../packages/shared/src/__fixtures__/launch-pieces-1012-1026.json'),
    'utf8',
  ),
) as AttachRow[];

const GATEWAY: Record<string, string> = { KB: 'KB120', 교보: 'KYOBO119' };
const MARKET: Record<string, string> = { 코스피: 'K', 코스닥: 'Q' };

const PIECES: LaunchMapPiece[] = RAW.map((r) => ({
  trade_date: r.date.replace(/-/g, ''),
  gateway: GATEWAY[r.broker]!,
  market: MARKET[r.market]!,
  profile: 'Q16',
  fire_exchange: 'KRX',
  side: null,
  wire: r.wire,
  piece_idx: r.j,
  sent_rel_us: r.rel,
  result: r.result,
  retry: null,
}));

function daysOf(gateway: string, market: string) {
  return launchDaysOf(PIECES.filter((p) => p.gateway === gateway && p.market === market));
}

describe('LaunchGateChart — 16:00 KB 코스닥(첨부 10일)', () => {
  function renderKbQ() {
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} planLines={[-337]} />);
    const panel = document.querySelector<HTMLElement>('[data-slot="launch-panel"]')!;
    const svg = panel.querySelector<SVGSVGElement>('svg[data-slot="launch-chart"]')!;
    return { panel, svg };
  }

  it('패널 머리 — 「KB 코스닥」 · 경계 잡힌 날 4 · 전부 접수 5 · 전부 거부 1', () => {
    const { panel } = renderKbQ();
    expect(panel.dataset.gateway).toBe('KB120');
    expect(panel.dataset.market).toBe('Q');
    expect(within(panel).getByRole('heading', { name: 'KB 코스닥' })).toBeInTheDocument();
    expect(within(panel).getByText('경계 잡힌 날 4 · 전부 접수 5 · 전부 거부 1')).toBeInTheDocument();
  });

  it('svg — jsdom 폴백 폭 640 · viewBox 1:1 · role img · aria-label', () => {
    const { svg } = renderKbQ();
    expect(svg.getAttribute('width')).toBe('640');
    const h = Number(svg.getAttribute('height'));
    expect(svg.getAttribute('viewBox')).toBe(`0 0 640 ${h}`);
    // H = T 22 + 10일 × 24 + GAP_R 32 + RIBBON_H 40 + TICK_H 22
    expect(h).toBe(22 + 10 * 24 + 32 + 40 + 22);
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'KB 코스닥 발사 경계 지도');
  });

  it('날짜 행 10개 · 점 87개(circle) · 각 점 title', () => {
    const { svg } = renderKbQ();
    const rows = svg.querySelectorAll('[data-slot="launch-day"]');
    expect(rows).toHaveLength(10);
    expect([...rows].map((r) => r.querySelector('text')!.textContent)).toEqual([
      '10/12',
      '10/13',
      '10/14',
      '10/15',
      '10/16',
      '10/20',
      '10/21',
      '10/22',
      '10/23',
      '10/26',
    ]);
    const dots = svg.querySelectorAll('circle');
    expect(dots).toHaveLength(87);
    for (const c of dots) expect(c.querySelector('title')?.textContent).toMatch(/^\d\d\/\d\d .+µs · wire \d+ · /);
  });

  it('경계 띠 — gate 4 · 전부 거부 1(+ 「경계는 이보다 뒤 →」) · 전부 접수 5', () => {
    const { svg } = renderKbQ();
    expect(svg.querySelectorAll('rect[data-band="gate"]')).toHaveLength(4);
    expect(svg.querySelectorAll('rect[data-band="reject_after"]')).toHaveLength(1);
    expect(svg.querySelectorAll('rect[data-band="accept_before"]')).toHaveLength(5);
    expect(within(svg as unknown as HTMLElement).getAllByText('경계는 이보다 뒤 →')).toHaveLength(1);
    const gate = svg.querySelector('rect[data-band="gate"]')!;
    expect(gate.getAttribute('fill')).toBe('var(--launch-gate-bg)');
    expect(gate.getAttribute('stroke')).toBe('var(--launch-gate)');
  });

  it('다음 첫 조각 점선 1개(--primary · 4 3)', () => {
    const { svg } = renderKbQ();
    const lines = svg.querySelectorAll('[data-slot="launch-next"]');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.getAttribute('stroke')).toBe('var(--primary)');
    expect(lines[0]!.getAttribute('stroke-dasharray')).toBe('4 3');
  });

  it('planLines 3개(서버 계획 조각마다) → launch-next 3개 · data-idx 0..2 · title 「다음 발사 계획 n번」', () => {
    render(
      <LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} planLines={[-350, -345, -325]} />,
    );
    const lines = Array.from(document.querySelectorAll('[data-slot="launch-next"]'));
    expect(lines.map((l) => l.getAttribute('data-idx'))).toEqual(['0', '1', '2']);
    expect(lines.map((l) => l.querySelector('title')?.textContent)).toEqual([
      '다음 발사 계획 1번 −350µs',
      '다음 발사 계획 2번 −345µs',
      '다음 발사 계획 3번 −325µs',
    ]);
    expect(document.querySelectorAll('[data-slot="launch-next-off"]')).toHaveLength(0);
  });

  it('children 은 패널 머리 아래 · 날짜 없는 패널에도 그린다', () => {
    render(
      <LaunchGateChart gateway="KYOBO119" market="K" fire="q16" days={[]} planLines={[]}>
        <div data-slot="slot-probe">줄</div>
      </LaunchGateChart>,
    );
    expect(document.querySelector('[data-slot="launch-panel"] [data-slot="slot-probe"]')).not.toBeNull();
  });

  it('planLines [] → 점선 없음', () => {
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} planLines={[]} />);
    expect(document.querySelectorAll('[data-slot="launch-next"]')).toHaveLength(0);
  });

  it('색은 전부 var(--…) — oklch · hex 직접값 없음', () => {
    const { svg } = renderKbQ();
    const html = svg.outerHTML;
    expect(html).not.toMatch(/oklch|#[0-9a-f]{3,6}\b/i);
  });
});

describe('LaunchGateChart — 빈 패널', () => {
  it('days [] → 「이 범위에 발사 없음」 만 · svg 없음', () => {
    render(<LaunchGateChart gateway="KYOBO119" market="K" fire="q16" days={[]} planLines={[-400]} />);
    const panel = document.querySelector<HTMLElement>('[data-slot="launch-panel"]')!;
    expect(within(panel).getByRole('heading', { name: '교보 코스피' })).toBeInTheDocument();
    expect(screen.getByText('이 범위에 발사 없음')).toBeInTheDocument();
    expect(panel.querySelector('svg')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 2 — 09:00:30 합패널 · 이상치 · 리본 · 날짜별 표
// ─────────────────────────────────────────────────────────────────────────────

const N_LEG = { trade_date: '20261026', gateway: 'KB120', market: 'Q', fire_exchange: 'NXT', piece_idx: null } as const;

/** 10/26 KB120 코스닥 — N 매수 3(pieces120.txt) + 합성 A 매도 1(e2e 픽스처와 같은 값). */
const N0930_KB_Q: LaunchMapPiece[] = [
  { ...N_LEG, profile: 'N', side: 'buy', wire: 0, sent_rel_us: -20148, result: '101', retry: 2 },
  { ...N_LEG, profile: 'N', side: 'buy', wire: 1, sent_rel_us: -20143, result: '101', retry: 1 },
  { ...N_LEG, profile: 'N', side: 'buy', wire: 2, sent_rel_us: -20141, result: '101', retry: 1 },
  { ...N_LEG, profile: 'A', side: 'sell', wire: 3, sent_rel_us: -20139, result: '101', retry: 0 },
];

describe('LaunchGateChart — 09:00:30 합패널(N 매수 원 · A 매도 마름모)', () => {
  function renderN() {
    const days = launchDaysOf(N0930_KB_Q);
    render(<LaunchGateChart gateway="KB120" market="Q" fire="n0930" days={days} planLines={[-245]} />);
    const svg = document.querySelector<SVGSVGElement>('svg[data-slot="launch-chart"]')!;
    return { svg, days };
  }

  it('원 3 · 마름모 1 · 마름모 title 에 「매도」 · 원 title 에 「매수 · 101 · 재전송 2」', () => {
    const { svg } = renderN();
    expect(svg.querySelectorAll('circle')).toHaveLength(3);
    const diamonds = svg.querySelectorAll('path[data-shape="diamond"]');
    expect(diamonds).toHaveLength(1);
    expect(diamonds[0]!.getAttribute('fill')).toBe('var(--launch-bad)');
    expect(diamonds[0]!.querySelector('title')!.textContent).toBe('10/26 −20,139µs · wire 3 · 매도 · 101');
    const titles = [...svg.querySelectorAll('circle > title')].map((t) => t.textContent);
    expect(titles).toContain('10/26 −20,148µs · wire 0 · 매수 · 101 · 재전송 2');
  });

  it('점 감지 칸에 마우스를 대면 즉시 툴팁 「−20,139µs」 · 「10/26 · wire 3 · 매도 · 101」, 벗어나면 사라진다', () => {
    const { svg } = renderN();
    const hits = svg.querySelectorAll('rect[data-slot="launch-dot-hit"]');
    expect(hits).toHaveLength(4);
    const wrap = svg.parentElement!;
    expect(wrap.querySelector('[data-slot="launch-dot-tip"]')).toBeNull();
    const diamondHit = [...hits].find((h) => h.previousElementSibling?.getAttribute('data-shape') === 'diamond')!;
    fireEvent.mouseEnter(diamondHit);
    const tip = wrap.querySelector('[data-slot="launch-dot-tip"]')!;
    expect(tip.textContent).toBe('−20,139µs10/26 · wire 3 · 매도 · 101');
    fireEvent.mouseLeave(wrap);
    expect(wrap.querySelector('[data-slot="launch-dot-tip"]')).toBeNull();
  });

  it('next −245 는 축 밖 → 점선 없음 · 「▸ 다음 −245µs」', () => {
    const { svg } = renderN();
    expect(svg.querySelectorAll('[data-slot="launch-next"]')).toHaveLength(0);
    const off = svg.querySelector('[data-slot="launch-next-off"]')!;
    expect(off.textContent).toContain('▸ 다음 −245µs');
  });

  it('리본 rect 수 = 칸 수 × 3 · 왼쪽 「쐈다면」', () => {
    const { svg, days } = renderN();
    const axis = launchAxisOf(
      N0930_KB_Q.map((p) => p.sent_rel_us),
      [-245],
      'n0930',
    );
    const { cells } = launchRibbonCellsOf(days, axis, LAUNCH_CHART.W_MIN - LAUNCH_CHART.L - LAUNCH_CHART.R);
    expect(cells.length).toBeGreaterThan(0);
    expect(svg.querySelectorAll('[data-slot="launch-ribbon"] rect')).toHaveLength(cells.length * 3);
    expect(within(svg as unknown as HTMLElement).getByText('쐈다면')).toBeInTheDocument();
  });
});

describe('LaunchGateChart — 이상치 점 바깥 표식', () => {
  it('q16 한 날 [−300, −305, −20148] → −20148 점은 왼쪽 끝 · 「◂」 · title 「· 축 밖」', () => {
    const days = launchDaysOf(
      [-300, -305, -20148].map((v, wire) => ({
        trade_date: '20261026',
        gateway: 'KB120',
        market: 'Q',
        profile: 'Q16',
        fire_exchange: 'KRX',
        side: null,
        wire,
        piece_idx: wire,
        sent_rel_us: v,
        result: '접수',
        retry: null,
      })),
    );
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={days} planLines={[]} />);
    const svg = document.querySelector<SVGSVGElement>('svg[data-slot="launch-chart"]')!;
    expect(within(svg as unknown as HTMLElement).getAllByText('◂')).toHaveLength(1);
    const out = [...svg.querySelectorAll('circle')].find((c) => c.querySelector('title')!.textContent!.includes('−20,148'))!;
    expect(out.getAttribute('cx')).toBe(String(LAUNCH_CHART.L));
    expect(out.querySelector('title')!.textContent).toBe('10/26 −20,148µs · wire 2 · 접수 · 축 밖');
  });
});

describe('LaunchGateChart — 날짜별 표 보기', () => {
  it('KB 코스닥 — 접힘 · 행 = days 10 · 10/14 경계 · 10/21 전부 거부', () => {
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} planLines={[-337]} />);
    const details = document.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('날짜별 표 보기')).toBeInTheDocument();
    const table = details.querySelector('table[data-slot="launch-day-table"]')!;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '날짜',
      '첫 조각 µs',
      '결과',
      '처음 접수 µs',
      '경계 µs',
      '조각',
    ]);
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(10);
    const cells = (tr: Element) => [...tr.querySelectorAll('td')].map((td) => td.textContent);
    expect(cells(rows[2]!)).toEqual(['10/14', '−352', '경계', '−342', '−350 ~ −342', '5']);
    expect(cells(rows[6]!)).toEqual(['10/21', '−342', '전부 거부', '—', '−322 보다 뒤', '3']);
    expect(cells(rows[0]!)).toEqual(['10/12', '−342', '전부 접수', '−342', '−342 보다 앞', '6']);
    expect(table.parentElement!.className).toContain('overflow-x-auto');
  });

  it('KB 코스피 10/16 — 결과 알약 「판단 불가」(Pitfall 5) · 경계 「—」', () => {
    render(<LaunchGateChart gateway="KB120" market="K" fire="q16" days={daysOf('KB120', 'K')} planLines={[-285]} />);
    const table = document.querySelector('table[data-slot="launch-day-table"]')!;
    const row = [...table.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td')!.textContent === '10/16')!;
    const pill = row.querySelector('[data-slot="launch-day-kind"]')!;
    expect(pill.textContent).toBe('판단 불가');
    expect(pill.getAttribute('data-kind')).toBe('unknown');
    expect(row.querySelectorAll('td')[4]!.textContent).toBe('—');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 35-15 — 바꿀 계획 실선(D-28 · Pitfall S9)
// ─────────────────────────────────────────────────────────────────────────────

describe('LaunchGateChart — 바꿀 계획 draftLines', () => {
  it('draftLines 3개 → launch-draft-line 3(--launch-gate 실선 · 점선 아님) · 번호 글 1·2·3 · title 「바꿀 n번」', () => {
    render(
      <LaunchGateChart
        gateway="KB120"
        market="Q"
        fire="q16"
        days={daysOf('KB120', 'Q')}
        planLines={[-350, -345, -325]}
        draftLines={[-340, -335, -322]}
      />,
    );
    const lines = Array.from(document.querySelectorAll('[data-slot="launch-draft-line"]'));
    expect(lines.map((l) => l.getAttribute('data-idx'))).toEqual(['0', '1', '2']);
    expect(lines.every((l) => l.getAttribute('stroke') === 'var(--launch-gate)')).toBe(true);
    expect(lines.every((l) => l.getAttribute('stroke-dasharray') === null)).toBe(true);
    expect(lines.map((l) => l.querySelector('title')?.textContent)).toEqual([
      '바꿀 1번 −340µs',
      '바꿀 2번 −335µs',
      '바꿀 3번 −322µs',
    ]);
    const nums = Array.from(document.querySelectorAll('[data-slot="launch-draft-num"]')).map((t) => t.textContent);
    expect(nums).toEqual(['1', '2', '3']);
    // 계획 점선은 그대로 3개
    expect(document.querySelectorAll('[data-slot="launch-next"]')).toHaveLength(3);
  });

  it('draftLines 없음(기본) → 실선 · 번호 없음', () => {
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} planLines={[-350]} />);
    expect(document.querySelectorAll('[data-slot="launch-draft-line"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="launch-draft-num"]')).toHaveLength(0);
  });

  it('바꿀 값도 축 후보 — −250 은 축을 넓혀 그 선이 축 안에 든다', () => {
    const days = daysOf('KB120', 'Q');
    const values = days.flatMap((d) => d.pieces.map((p) => p.sent_rel_us));
    expect(launchAxisOf(values, [-350], 'q16').xmax).toBeLessThan(-250);
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={days} planLines={[-350]} draftLines={[-250]} />);
    expect(document.querySelectorAll('[data-slot="launch-draft-line"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="launch-draft-off"]')).toHaveLength(0);
  });

  it('09:00:30 — 계획 · 바꿀 값 둘 다 축 밖 · 같은 쪽 → 한 글 「▸ 다음 −245µs · 바꿀 1번 −190µs」(겹치지 않게)', () => {
    render(
      <LaunchGateChart
        gateway="KB120"
        market="Q"
        fire="n0930"
        days={launchDaysOf(N0930_KB_Q)}
        planLines={[-245]}
        draftLines={[-190]}
      />,
    );
    expect(document.querySelectorAll('[data-slot="launch-draft-line"]')).toHaveLength(0);
    const off = document.querySelector('[data-slot="launch-next-off"]')!;
    expect(off.textContent).toContain('▸ 다음 −245µs');
    expect(off.querySelector('[data-slot="launch-draft-off"]')!.textContent).toBe(' · 바꿀 1번 −190µs');
    expect(document.querySelectorAll('[data-slot="launch-draft-off"]')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quick-261030-dz7 — 16:00 뒤탐침 ▲(목업 A안)
// ─────────────────────────────────────────────────────────────────────────────

describe('LaunchGateChart — 16:00 뒤탐침 ▲(quick-261030-dz7 · 목업 A안)', () => {
  const LEG = { gateway: 'KB120', market: 'Q', profile: 'Q16', fire_exchange: 'KRX' } as const;
  const real = (date: string, wire: number, rel: number, result: string): LaunchMapPiece => ({
    ...LEG,
    trade_date: date,
    side: null,
    wire,
    piece_idx: wire,
    sent_rel_us: rel,
    result,
    retry: null,
  });
  const tail = (
    date: string,
    wire: number,
    i: number,
    rel: number,
    result: string,
    result_code: string | null,
  ): LaunchMapPiece => ({
    ...LEG,
    trade_date: date,
    side: 'buy',
    wire,
    piece_idx: i,
    sent_rel_us: rel,
    result,
    retry: 0,
    probe: true,
    round: -2,
    result_code,
  });
  const PIECES_TP: LaunchMapPiece[] = [
    real('20261026', 0, -292, '101'),
    real('20261026', 1, -284, '접수'),
    tail('20261026', 2, 0, -274, '기타', 'E127'),
    real('20261027', 0, -290, '101'),
    real('20261027', 1, -286, '101'),
    real('20261027', 2, -270, '접수'),
    real('20261028', 0, -290, '101'),
    real('20261028', 1, -286, '101'),
    real('20261028', 2, -280, '101'),
    real('20261029', 0, -300, '101'),
    real('20261029', 1, -296, '101'),
    real('20261029', 2, -284, '접수'),
    real('20261030', 0, -290, '101'),
    real('20261030', 1, -286, '101'),
    real('20261030', 2, -270, '101'),
    tail('20261030', 3, 0, -260, '101', '101'),
    tail('20261030', 4, 1, -250, '기타', 'F083'),
    tail('20261030', 5, 2, -240, '접수', null),
  ];

  function renderTp() {
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={launchDaysOf(PIECES_TP)} planLines={[]} />);
    const panel = document.querySelector<HTMLElement>('[data-slot="launch-panel"]')!;
    const svg = panel.querySelector<SVGSVGElement>('svg[data-slot="launch-chart"]')!;
    const row = (date: string) => svg.querySelector<SVGGElement>(`[data-slot="launch-day"][data-date="${date}"]`)!;
    return { panel, svg, row };
  }

  it('삼각형 4 · 원 14(실조각) · 10/30 톤 bad · ok · ok · 10/26 E127 속 빈 테두리', () => {
    const { svg, row } = renderTp();
    expect(svg.querySelectorAll('path[data-shape="triangle"]')).toHaveLength(4);
    expect(svg.querySelectorAll('circle')).toHaveLength(14);
    const t30 = [...row('20261030').querySelectorAll('path[data-shape="triangle"]')];
    expect(t30.map((t) => t.getAttribute('data-tone'))).toEqual(['bad', 'ok', 'ok']);
    expect(t30[1]!.getAttribute('fill')).toBe('var(--launch-ok)');
    expect(t30[1]!.getAttribute('stroke')).toBe('var(--card)');
    const t26 = row('20261026').querySelector('path[data-shape="triangle"]')!;
    expect(t26.getAttribute('data-tone')).toBe('other');
    expect(t26.getAttribute('fill')).toBe('none');
    expect(t26.getAttribute('stroke')).toBe('var(--launch-other)');
  });

  it('10/30 = 경계 띠(뒤탐침이 잡음) · 「경계는 이보다 뒤 →」 없음 · 패널 머리 경계 4 · 접수 0 · 거부 1', () => {
    const { panel, row } = renderTp();
    expect(row('20261030').querySelector('rect[data-band="gate"]')).not.toBeNull();
    expect(row('20261030').textContent).not.toContain('경계는 이보다 뒤 →');
    expect(within(panel).getByText('경계 잡힌 날 4 · 전부 접수 0 · 전부 거부 1')).toBeInTheDocument();
  });

  it('−250 삼각형 감지 칸 호버 → 「−250µs」 · 「10/30 · 뒤탐침 2 · 가격거부(열림) · F083」 · title 같은 재료', () => {
    const { svg, row } = renderTp();
    const tri = row('20261030').querySelectorAll('path[data-shape="triangle"]')[1]!;
    expect(tri.querySelector('title')!.textContent).toBe('10/30 −250µs · 뒤탐침 2 · 가격거부(열림) · F083');
    const hit = tri.nextElementSibling!;
    expect(hit.getAttribute('data-slot')).toBe('launch-dot-hit');
    fireEvent.mouseEnter(hit);
    const tip = svg.parentElement!.querySelector('[data-slot="launch-dot-tip"]')!;
    expect(tip.textContent).toBe('−250µs10/30 · 뒤탐침 2 · 가격거부(열림) · F083');
  });

  it('날짜별 표 — 조각 칸 10/30 「3 · 탐침 3」 · 10/26 「2 · 탐침 1」 · 10/27 「3」', () => {
    renderTp();
    const table = document.querySelector('table[data-slot="launch-day-table"]')!;
    const last = (date: string) => {
      const tr = [...table.querySelectorAll('tbody tr')].find((r) => r.querySelector('td')!.textContent === date)!;
      return [...tr.querySelectorAll('td')].at(-1)!;
    };
    expect(last('10/30').textContent).toBe('3 · 탐침 3');
    expect(last('10/30').querySelector('[data-slot="launch-day-probes"]')).not.toBeNull();
    expect(last('10/26').textContent).toBe('2 · 탐침 1');
    expect(last('10/27').textContent).toBe('3');
    expect(last('10/27').querySelector('[data-slot="launch-day-probes"]')).toBeNull();
  });
});
