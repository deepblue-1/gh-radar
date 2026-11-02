import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { DENSITY_BUCKETS, fmtTickTime } from '@gh-radar/shared';

import { buildTickSession, type TickSession } from '@/lib/ticks/tick-session';
import { TICK_FIXTURE_DATE as D, TICK_FIXTURE_ISIN as ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';

import { TickSlider, type TickSliderProps } from '../tick-slider';

/**
 * Phase 37 Plan 10 Task 2 — 슬라이더 카드: 시각 입력 성공/실패 · 손잡이 비율(08:00~20:00) · 밀도 막대 144 · VI 눈금 수 ·
 * 끌기 → onSeekNs · ‹ ▶ › · 속도 칩 · 「끝으로」.
 */

const base = buildTickSession(tickGridBytes(), { date: D, ex: 'KRX', isin: ISIN });
const HOUR_NS = 3_600_000_000_000n;

function props(over: Partial<TickSliderProps> = {}): TickSliderProps {
  return {
    session: base,
    rec: base.recvOrder[0]!,
    onSeekNs: vi.fn(),
    onStep: vi.fn(),
    playing: false,
    onPlay: vi.fn(),
    speed: 1,
    onSpeed: vi.fn(),
    onJump: vi.fn(() => true),
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TickSlider', () => {
  it('시각 입력 + Enter → onJump · 성공이면 현재 시각으로 돌아온다', () => {
    const onJump = vi.fn(() => true);
    render(<TickSlider {...props({ onJump })} />);
    const input = screen.getByLabelText('틱 시각') as HTMLInputElement;
    const now = fmtTickTime(base.index.recvNs[base.recvOrder[0]!]!);
    expect(input.value).toBe(now);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '13:05:07.1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onJump).toHaveBeenCalledWith('13:05:07.1');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('잘못된 형식 → 입력 테두리 빨강(aria-invalid) · 「점프」 버튼도 같은 경로', () => {
    const onJump = vi.fn(() => false);
    render(<TickSlider {...props({ onJump })} />);
    const input = screen.getByLabelText('틱 시각') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '25:00' } });
    fireEvent.click(screen.getByRole('button', { name: '점프' }));
    expect(onJump).toHaveBeenCalledWith('25:00');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.className).toContain('--destructive');
    expect(input.value).toBe('25:00');
  });

  it('손잡이 = 현재 recv 시각의 08:00~20:00 비율 · aria-valuetext = 현재 시각', () => {
    const rec = base.recvOrder[0]!;
    render(<TickSlider {...props({ rec })} />);
    const f = Number(base.index.recvNs[rec]! - base.dayStartNs) / Number(12n * HOUR_NS);
    const thumb = document.querySelector('[data-slot="tick-slider-thumb"]') as HTMLElement;
    expect(parseFloat(thumb.style.left)).toBeCloseTo(f * 100, 3);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe(fmtTickTime(base.index.recvNs[rec]!));
  });

  it('밀도 막대 144개 · 값 있는 칸만 높이', () => {
    render(<TickSlider {...props()} />);
    const bars = document.querySelectorAll('[data-slot="tick-density-bar"]');
    expect(bars.length).toBe(DENSITY_BUCKETS);
    const tall = [...bars].filter((b) => Number(b.getAttribute('height')) > 0).length;
    expect(tall).toBe([...base.density].filter((v) => v > 0).length);
  });

  it('VI 시작마다 주황 눈금', () => {
    const at = (h: number) => base.dayStartNs + BigInt(h) * HOUR_NS;
    const session: TickSession = {
      ...base,
      vi: [
        { startNs: at(1), endNs: at(1) + 120_000_000_000n, startRec: 0, endRec: 1, viType: '1', triggerPx: 1000 },
        { startNs: at(5), endNs: null, startRec: 2, endRec: null, viType: '2', triggerPx: 1100 },
      ],
    };
    render(<TickSlider {...props({ session })} />);
    const marks = document.querySelectorAll('[data-slot="tick-vi-mark"]');
    expect(marks.length).toBe(2);
    expect(parseFloat((marks[0] as HTMLElement).style.left)).toBeCloseTo((1 / 12) * 100, 3);
    expect(parseFloat((marks[1] as HTMLElement).style.left)).toBeCloseTo((5 / 12) * 100, 3);
  });

  it('끌기 시작 → 그 위치 시각으로 onSeekNs', () => {
    const onSeekNs = vi.fn();
    render(<TickSlider {...props({ onSeekNs })} />);
    const slider = screen.getByRole('slider');
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 1200,
      top: 0,
      height: 38,
      right: 1300,
      bottom: 38,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(slider, { clientX: 700, pointerId: 1 });
    expect(onSeekNs).toHaveBeenCalledTimes(1);
    expect(onSeekNs.mock.calls[0]![0]).toBe(base.dayStartNs + 6n * HOUR_NS);
  });

  it('‹ ▶ › · 속도 칩 · 「끝으로」 는 showEnd 일 때만', () => {
    const p = props();
    const { rerender } = render(<TickSlider {...p} />);
    fireEvent.click(screen.getByRole('button', { name: '이전 틱' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 틱' }));
    fireEvent.click(screen.getByRole('button', { name: '재생' }));
    expect(p.onStep).toHaveBeenNthCalledWith(1, -1);
    expect(p.onStep).toHaveBeenNthCalledWith(2, 1);
    expect(p.onPlay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '10×' }));
    fireEvent.click(screen.getByRole('button', { name: '최대' }));
    expect(p.onSpeed).toHaveBeenNthCalledWith(1, 10);
    expect(p.onSpeed).toHaveBeenNthCalledWith(2, 'max');
    expect(screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: '끝으로' })).toBeNull();

    const onEnd = vi.fn();
    rerender(<TickSlider {...p} playing showEnd onEnd={onEnd} />);
    expect(screen.getByRole('button', { name: '정지' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '끝으로' }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
