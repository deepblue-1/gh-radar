import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CheckValueRow, DerivedRow, SettingRow, type LcRowSub } from '../setting-group';

/**
 * Phase 31 Plan 02 Task 1 — 두 줄 값 행 변형(D-07 · UI-SPEC S1 · S2 · 접근성 · 폭 백스톱 L4).
 *
 * 잠그는 것:
 *   ① `sub` 가 없으면 지금과 같은 44px 한 줄(회귀 0) — 가격 · 금액 · % · 회 · 건 · 체크 전용 행 불변.
 *   ② `sub` 가 있으면 행 상자 56px · 위 줄 = 기존 값 슬롯(`lc-row-value` · 글자만) · 아래 줄 = `lc-row-sub`
 *      12/400 · 16px 줄 높이 · 톤 alert 일 때만 `data-tone="alert"` + `--destructive`.
 *   ③ 상태 — flash 는 위 줄만 · busy 의 opacity-60 은 두 줄 함께(한 번) · 편집 중 div 도 56px.
 *   ④ 접근성 이름 「{라벨} {위 줄} {아래 줄}」 · ariaName 우선.
 *   ⑤ L4 — 두 줄 행 라벨만 낱말 경계 접힘(`break-keep` · `whitespace-normal`) · 말줄임 0.
 *   ⑥ DerivedRow 두 줄은 아래 줄이 빈 글자여도 자리(16px)를 둔다 · CheckValueRow 는 값 버튼 쪽만 두 줄.
 *
 * 값 예시는 UI-SPEC 「예시 수치 정정」 표(비교가 12,870원) — 「1,000만 / 777주」 · 「0만 / 무제한」 ·
 * 「1,500만 / 비교가격 필요」 · 파생 「32,175만 / 25,000주」.
 *
 * ★ jsdom 은 컨테이너 쿼리 · 실제 높이를 평가하지 않는다 — 클래스 존재로만 단언하고 실측은 e2e 몫이다.
 */

const MUTED: LcRowSub = { text: '777주', tone: 'muted' };
const ALERT: LcRowSub = { text: '비교가격 필요', tone: 'alert' };

const tokensOf = (el: Element | null): string[] => (el?.getAttribute('class') ?? '').split(/\s+/);

function renderValueRow(over: Partial<Parameters<typeof SettingRow>[0]> = {}) {
  return render(
    <SettingRow
      id="lc-sell-watch-qty"
      label="매수잔량"
      unit="만"
      value={1_000}
      valueText="1,000만"
      editing={false}
      onActivate={() => {}}
      {...over}
    />,
  );
}

describe('P31 두 줄 행 (D-07 · UI-SPEC S1 · S2)', () => {
  it('sub 없는 SettingRow 는 지금과 같은 44px 한 줄이다 — lc-row-sub 슬롯 없음(회귀 0)', () => {
    const { container } = renderValueRow({ valueText: undefined, unit: '원', value: 12_870, label: '비교가격' });
    const btn = container.querySelector('[data-lc-field="lc-sell-watch-qty"]');
    expect(tokensOf(btn)).toContain('min-h-[44px]');
    expect(tokensOf(btn)).not.toContain('min-h-[56px]');
    expect(container.querySelector('[data-slot="lc-row-sub"]')).toBeNull();
    // 44px 행 라벨은 지금처럼 nowrap 이다(L4 는 두 줄 행 한정).
    expect(tokensOf(btn!.querySelector('span'))).toContain('whitespace-nowrap');
  });

  it('sub 「777주」(muted) → 상자 56px · 위 줄 「1,000만」 만 · 아래 줄 「777주」 12/400 · 16px · data-tone 없음', () => {
    const { container } = renderValueRow({ sub: MUTED });
    const btn = container.querySelector('[data-lc-field="lc-sell-watch-qty"]');
    expect(tokensOf(btn)).toContain('min-h-[56px]');
    expect(tokensOf(btn)).not.toContain('min-h-[44px]');
    expect(container.querySelector('[data-slot="lc-row-value"]')!.textContent).toBe('1,000만');
    const sub = container.querySelector('[data-slot="lc-row-sub"]')!;
    expect(sub.textContent).toBe('777주');
    expect(sub.hasAttribute('data-tone')).toBe(false);
    const t = tokensOf(sub);
    expect(t).toEqual(expect.arrayContaining(['text-[12px]', 'font-normal', 'leading-4', 'tabular-nums']));
    expect(t).toContain('text-[var(--muted-fg)]');
    expect(t).not.toContain('text-[var(--destructive)]');
  });

  it('sub 「비교가격 필요」(alert) → 아래 줄 data-tone="alert" · --destructive', () => {
    const { container } = renderValueRow({ value: 1_500, valueText: '1,500만', sub: ALERT });
    const sub = container.querySelector('[data-slot="lc-row-sub"]')!;
    expect(sub.getAttribute('data-tone')).toBe('alert');
    expect(tokensOf(sub)).toContain('text-[var(--destructive)]');
    expect(tokensOf(sub)).not.toContain('text-[var(--muted-fg)]');
  });

  it('flash 는 위 줄만 강조 · busy 의 opacity-60 은 두 줄을 감싼 블록에 한 번 · 쉐브런은 위 줄과 같은 줄(L3 유지)', () => {
    const flashed = renderValueRow({ sub: MUTED, flash: true });
    const value = flashed.container.querySelector('[data-slot="lc-row-value"]')!;
    const sub = flashed.container.querySelector('[data-slot="lc-row-sub"]')!;
    expect(tokensOf(value)).toContain('text-[var(--primary)]');
    expect(tokensOf(sub)).not.toContain('text-[var(--primary)]');
    // 쉐브런은 위 줄 값 슬롯과 같은 부모(한 줄) — 아래 줄은 그 부모 밖이다.
    const chev = flashed.container.querySelector('[data-slot="lc-row-chevron"]')!;
    expect(chev.parentElement).toBe(value.parentElement);
    expect(value.parentElement!.contains(sub)).toBe(false);
    expect(tokensOf(chev)).toEqual(expect.arrayContaining(['hidden', '@min-[685px]/lc:inline']));
    flashed.unmount();

    const busy = renderValueRow({ sub: MUTED, busy: true });
    const btn = busy.container.querySelector('[data-lc-field="lc-sell-watch-qty"]')!;
    const dimmed = Array.from(btn.querySelectorAll('*')).filter((el) => tokensOf(el).includes('opacity-60'));
    expect(dimmed).toHaveLength(1);
    expect(dimmed[0]!.querySelector('[data-slot="lc-row-value"]')).not.toBeNull();
    expect(dimmed[0]!.querySelector('[data-slot="lc-row-sub"]')).not.toBeNull();
  });

  it('기본 접근성 이름 = 「매수잔량 1,000만 777주」 · ariaName 이 있으면 그 값', () => {
    renderValueRow({ sub: MUTED });
    expect(screen.getByRole('button', { name: '매수잔량 1,000만 777주' })).toBeInTheDocument();
    const { unmount } = renderValueRow({ sub: MUTED, ariaName: '매도 매수잔량 1,000만 777주' });
    expect(screen.getByRole('button', { name: '매도 매수잔량 1,000만 777주' })).toBeInTheDocument();
    unmount();
  });

  it('editing=true 인 두 줄 SettingRow 의 div 도 min-h-[56px] — 편집 전후 같은 높이(레이아웃 이동 0)', () => {
    const { container } = renderValueRow({
      sub: MUTED,
      editing: true,
      editor: <input id="lc-sell-watch-qty" aria-label="매수잔량" defaultValue="1,000" />,
    });
    const div = container.querySelector('[data-lc-field="lc-sell-watch-qty"][data-editing="true"]');
    expect(div!.tagName).toBe('DIV');
    expect(tokensOf(div)).toContain('min-h-[56px]');
    expect(tokensOf(div)).not.toContain('min-h-[44px]');
    // 편집 중 라벨도 L4 접힘 변형이다.
    const label = div!.querySelector('label')!;
    expect(tokensOf(label)).toContain('break-keep');
    expect(tokensOf(label)).not.toContain('whitespace-nowrap');
  });

  it('L4 — 두 줄 행 라벨은 whitespace-nowrap 이 아니고 break-keep · whitespace-normal 이며 말줄임 클래스가 없다', () => {
    const { container } = renderValueRow({ label: '줄매수 최대 잔량', value: 0, valueText: '0만', sub: { text: '무제한', tone: 'muted' } });
    const btn = container.querySelector('[data-lc-field="lc-sell-watch-qty"]')!;
    const label = btn.querySelector('span')!;
    expect(label.textContent).toBe('줄매수 최대 잔량');
    const t = tokensOf(label);
    expect(t).not.toContain('whitespace-nowrap');
    expect(t).toEqual(expect.arrayContaining(['whitespace-normal', 'break-keep', 'text-[14px]']));
    for (const el of Array.from(container.querySelectorAll('[class]'))) {
      expect(el.getAttribute('class')).not.toMatch(/truncate|text-ellipsis|line-clamp/);
    }
  });

  it('DerivedRow 두 줄 — 「32,175만 / 25,000주」 · 아래 줄이 빈 글자여도 56px 와 16px 자리를 둔다 · 버튼 아님', () => {
    const full = render(
      <DerivedRow label="발동잔량" value={25_000} unit="주" emphasis display="32,175만" sub={{ text: '25,000주', tone: 'muted' }} />,
    );
    const row = full.container.querySelector('[data-slot="lc-derived"]')!;
    expect(tokensOf(row)).toContain('min-h-[56px]');
    expect(row.textContent).toBe('발동잔량32,175만25,000주');
    expect(full.container.querySelector('[data-slot="lc-row-sub"]')!.textContent).toBe('25,000주');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(tokensOf(row.querySelector('span'))).toContain('break-keep');
    full.unmount();

    const empty = render(<DerivedRow label="잔량추적 기준선" value={0} unit="주" valueText="—" srText="없음" sub={{ text: '', tone: 'muted' }} />);
    const row2 = empty.container.querySelector('[data-slot="lc-derived"]')!;
    expect(tokensOf(row2)).toContain('min-h-[56px]');
    const sub = empty.container.querySelector('[data-slot="lc-row-sub"]')!;
    expect(sub).not.toBeNull();
    expect(sub.textContent).toBe('');
    expect(sub.getAttribute('aria-hidden')).toBe('true');
    expect(tokensOf(sub)).toContain('min-h-4');
  });

  it('CheckValueRow 두 줄 — 값 버튼 쪽만 두 줄(56px) · 원형 체크 버튼은 그대로 · 이름 「체결량 500만 388주」', () => {
    const { container } = render(
      <CheckValueRow
        checkId="lc-buy-trade"
        groupTitle="선매수"
        label="체결량"
        checked
        onToggle={() => {}}
        value={500}
        unit="만"
        valueText="500만"
        valueId="lc-buy-min-trade-qty"
        onActivateValue={() => {}}
        sub={{ text: '388주', tone: 'muted' }}
      />,
    );
    const row = container.querySelector('[data-slot="lc-check-row"]')!;
    expect(tokensOf(row)).toContain('min-h-[56px]');
    const valueBtn = screen.getByRole('button', { name: '체결량 500만 388주' });
    expect(tokensOf(valueBtn)).toContain('min-h-[56px]');
    expect(valueBtn.querySelector('[data-slot="lc-row-sub"]')!.textContent).toBe('388주');
    const chk = screen.getByRole('checkbox', { name: '선매수 체결량' });
    expect(tokensOf(chk)).toContain('min-h-[44px]');
    expect(chk.querySelector('[data-slot="lc-check-circle"]')).not.toBeNull();
    expect(chk.querySelector('[data-slot="lc-row-sub"]')).toBeNull();
  });
});
