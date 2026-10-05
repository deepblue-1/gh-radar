import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { limitFeatureTooltip, type RelayLimitFeatureMsg } from '@gh-radar/shared';

import { LimitFeatureTable } from '../card/limit-feature-table';

/**
 * Phase 28 (28-07) — 카드 탭 「상한가」 9칸 표 (UI-SPEC ①-2 · E1 상태).
 *
 * 잠그는 것:
 *   - 85 없음(empty · loading 같은 모양) → 9칸 「—」(--faint) · title 없음 · 스피너 없음
 *   - 잠김 중 10초 칸 2 · 3 은 같은 칸 안 폰 span(`@min-[685px]/lc:hidden`) + 넓은 span(`hidden @min-[685px]/lc:inline`)
 *   - 표 title = shared `limitFeatureTooltip` 그대로(웹은 문구를 만들지 않는다)
 *   - isStale → data-stale + opacity .55 · 값 유지
 *   - 칸 tone → --up · --down · --muted-fg · --faint
 */

function lf(over: Partial<RelayLimitFeatureMsg> = {}): RelayLimitFeatureMsg {
  return {
    t: 'limit.feature',
    i: 'KR7005930003',
    x: 'KRX',
    gwTimeMs: 1_791_161_160_000, // 2026-10-05 09:46:00 KST
    featureSchema: 1,
    upperPx: 13000,
    lastPx: 13000,
    rateBp: 3000,
    basePx: 10000,
    qQty: 133_077,
    qKrw: 1_730_000_000,
    wallKrwVisible: 0,
    wallQtyHidden: 0,
    wallTruncated: false,
    sellLed10s: 3_700,
    buyLed10s: 6_300,
    cancel10s: 2_300,
    new10s: 12_400,
    auctionFill10s: 0,
    drainS: -1,
    lockState: 1,
    lockElapsedS: 43,
    burstUpperLimit: false,
    auction: false,
    memberBuy: [{ memberNo: '00050', dQty: 52_000, dValue: 676_000_000, shareBp: 7400 }],
    memberSell: [{ memberNo: '00002', dQty: 18_000, dValue: 234_000_000, shareBp: 6100 }],
    memberDeltaPartial: false,
    modelState: 1,
    modelSchemaVersion: 1,
    pBreakBp: 1830,
    pHorizonS: 60,
    ...over,
  };
}

function setup(feature: RelayLimitFeatureMsg | null, isStale?: boolean) {
  const utils = render(<LimitFeatureTable feature={feature} isStale={isStale} />);
  const table = utils.container.querySelector('[data-slot="lc-limit-feature"]') as HTMLTableElement;
  const cells = () => Array.from(table.querySelectorAll<HTMLTableCellElement>('[data-slot="lc-limit-feature-cell"]'));
  return { ...utils, table, cells };
}

describe('Phase 28 LimitFeatureTable — 9칸 표 (28-07)', () => {
  it('85 없음 → 9칸 「—」(--faint) · title 속성 없음 · data-stale 없음 · 로딩 표식 없음', () => {
    const { table, cells } = setup(null);
    expect(cells().map((c) => c.textContent)).toEqual(Array.from({ length: 9 }, () => '—'));
    for (const c of cells()) expect(c.className).toContain('text-[var(--faint)]');
    expect(table.hasAttribute('title')).toBe(false);
    expect(table.hasAttribute('data-stale')).toBe(false);
    expect(table.querySelector('[role="progressbar"], [aria-busy="true"]')).toBeNull();
  });

  it('lock 1 → 10초 칸 2 · 3 에 폰 span · 넓은 span 이 같은 칸 안에 (CSS 컨테이너 쿼리 클래스)', () => {
    const { cells } = setup(lf());
    const neu = cells()[4]!;
    const cancel = cells()[5]!;
    const narrowNew = neu.querySelector('[data-band="narrow"]')!;
    const wideNew = neu.querySelector('[data-band="wide"]')!;
    expect(narrowNew.textContent).toBe('신규 +1.2만');
    expect(narrowNew.className).toContain('@min-[685px]/lc:hidden');
    expect(wideNew.textContent).toBe('잔량 신규 +12,400');
    expect(wideNew.className).toContain('hidden @min-[685px]/lc:inline');
    expect(cancel.querySelector('[data-band="narrow"]')!.textContent).toBe('취소 -2,300');
    expect(cancel.querySelector('[data-band="wide"]')!.textContent).toBe('잔량 취소 -2,300');
    // 폰 문구가 없는 칸은 span 없이 글자 하나.
    expect(cells()[3]!.querySelector('[data-band]')).toBeNull();
    expect(cells()[3]!.textContent).toBe('매수 우세 63%');
  });

  it('lock 0 → 10초 칸 2 「체결 10,000주」 한 벌(폰 span 없음) · 칸 3 「—」', () => {
    const { cells } = setup(lf({ lockState: 0, lockElapsedS: 0 }));
    expect(cells()[4]!.querySelector('[data-band]')).toBeNull();
    expect(cells()[4]!.textContent).toBe('체결 10,000주');
    expect(cells()[5]!.textContent).toBe('—');
  });

  it('창구 행 「매수 키움증권 +5.2만」(--up) · 「매도 신한증권 +1.8만」(--down) · 「깨짐확률 18.3%」(기본색)', () => {
    const { cells } = setup(lf());
    const [b, s, p] = cells().slice(6);
    expect(b!.textContent).toBe('매수 키움증권 +5.2만');
    expect(b!.className).toContain('text-[var(--up)]');
    expect(s!.textContent).toBe('매도 신한증권 +1.8만');
    expect(s!.className).toContain('text-[var(--down)]');
    expect(p!.textContent).toBe('깨짐확률 18.3%');
    expect(p!.className).not.toMatch(/text-\[var\(--(up|down|muted-fg|faint)\)\]/);
  });

  it('확률 미적용 → 「깨짐확률 관찰 중」(--muted-fg) · 창구 없음 → 「매수 —」 · 「매도 —」', () => {
    const { cells } = setup(lf({ modelState: 0, pBreakBp: -1, pHorizonS: 0, memberBuy: [], memberSell: [] }));
    const [b, s, p] = cells().slice(6);
    expect([b!.textContent, s!.textContent, p!.textContent]).toEqual(['매수 —', '매도 —', '깨짐확률 관찰 중']);
    expect(p!.className).toContain('text-[var(--muted-fg)]');
  });

  it('표 title = shared limitFeatureTooltip 그대로 (넓은 밴드 문구 + 「09:46:00 기준 · 깨짐확률은 60초 안」)', () => {
    const msg = lf();
    const { table } = setup(msg);
    expect(table.getAttribute('title')).toBe(limitFeatureTooltip(msg));
    expect(table.getAttribute('title')).toContain('10초 매수 우세 63% · 잔량 신규 +12,400 · 잔량 취소 -2,300');
    expect(table.getAttribute('title')!.endsWith('09:46:00 기준 · 깨짐확률은 60초 안')).toBe(true);
  });

  it('isStale → data-stale="true" · opacity .55 · 값은 지우지 않는다', () => {
    const { table, cells } = setup(lf(), true);
    expect(table.getAttribute('data-stale')).toBe('true');
    expect(table.className).toContain('opacity-[.55]');
    expect(cells()[0]!.textContent).toBe('잠김 43초째');
    expect(table.getAttribute('title')).not.toBe('');
  });

  it('칸은 말줄임 문법(nowrap · overflow-hidden · ellipsis) — 넘침은 표 title 이 받는다', () => {
    const { cells } = setup(lf({ memberBuy: [{ memberNo: '00005', dQty: 123_000, dValue: 0, shareBp: 0 }] }));
    const b = cells()[6]!;
    expect(b.textContent).toBe('매수 미래에셋증권 +12.3만');
    for (const k of ['whitespace-nowrap', 'overflow-hidden', 'text-ellipsis']) expect(b.className).toContain(k);
  });

  it('같은 85 값으로 다시 그려도 title 문자열은 그대로 · 바뀐 칸만 바뀐다', () => {
    const msg = lf();
    const { table, cells, rerender } = setup(msg);
    const titleBefore = table.getAttribute('title');
    const untouched = cells()[6]!;
    rerender(<LimitFeatureTable feature={{ ...msg, lockElapsedS: 44 }} />);
    expect(cells()[0]!.textContent).toBe('잠김 44초째');
    // 값이 그대로인 창구 칸은 같은 DOM 노드 · 같은 글자다.
    expect(cells()[6]).toBe(untouched);
    expect(table.getAttribute('title')).not.toBe(titleBefore); // 지금 행 문구가 바뀌었으니 title 도 바뀐다
    rerender(<LimitFeatureTable feature={{ ...msg, lockElapsedS: 44 }} />);
    expect(table.getAttribute('title')).toContain('잠김 44초째');
  });
});
