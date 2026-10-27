import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { launchDaysOf, type LaunchMapPiece } from '@gh-radar/shared';

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
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} next={-337} />);
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

  it('next null → 점선 없음', () => {
    render(<LaunchGateChart gateway="KB120" market="Q" fire="q16" days={daysOf('KB120', 'Q')} next={null} />);
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
    render(<LaunchGateChart gateway="KYOBO119" market="K" fire="q16" days={[]} next={-400} />);
    const panel = document.querySelector<HTMLElement>('[data-slot="launch-panel"]')!;
    expect(within(panel).getByRole('heading', { name: '교보 코스피' })).toBeInTheDocument();
    expect(screen.getByText('이 범위에 발사 없음')).toBeInTheDocument();
    expect(panel.querySelector('svg')).toBeNull();
  });
});
