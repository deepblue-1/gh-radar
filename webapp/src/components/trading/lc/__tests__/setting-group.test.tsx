import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Phase 20 Plan 04 Task 1 — 토스식 상따 리스트의 **필드 스펙**과 **그룹·행 조각**.
 *
 * 잠그는 것:
 *   ① `lc-fields.ts` 가 그룹·행 순서(D-19) · 옛 id · 라벨/단위/설명(UI-SPEC 카피 표) · 게이트 매핑
 *      (매수취소 = `cancelQtyEnabled`, D-21) · 체크 행(D-22)의 **단일 원천**이다.
 *   ② `SettingGroup` — 둥근 면 · 제목줄(제목 + 상태 + 오른쪽 끝 스위치) · 꺼진 그룹 흐림(D-01).
 *   ③ `GroupSwitch` — Radix Switch primitive 직접 · `role="switch"` · 시각 40×24 + 히트 44×44.
 *   ④ `CheckValueRow` — 「○ 라벨 ─ 값 ›」(D-22) · 체크와 값 버튼이 따로 포커스된다.
 *   ⑤ `WatchTargetRow` — 행 안 토글 · **D-02a**: 모든 밴드에서 시각 라벨 없이 행 전체 폭.
 *   ⑥ `DerivedRow` — 읽기 전용(버튼 아님 · 쉐브런 없음).
 *   ⑦ 모든 행 44px · 뷰포트 브레이크포인트 0 · 말줄임 0.
 *
 * ★ jsdom 은 컨테이너 쿼리를 평가하지 않는다 — 밴드별 모양은 **클래스 존재**로만 단언하고, 실제
 *   폭 실측은 20-07 P20-3(Playwright)이 맡는다. 없는 검증을 했다고 적지 않는다.
 */

import {
  LC_BUY_GROUPS,
  LC_SELL_GROUPS,
  LC_SWITCH_LABEL,
  lcNavigableRows,
  lcRowById,
  type LcGroupSpec,
  type LcRowSpec,
} from '../lc-fields';
import {
  CheckValueRow,
  DerivedRow,
  GroupSwitch,
  SettingGroup,
  SettingRow,
  WatchTargetRow,
} from '../setting-group';

const VIEWPORT_BP = /(^|\s)(sm|md|lg|xl|2xl):/;
const groupOf = (slot: LcGroupSpec['slot']): LcGroupSpec =>
  [...LC_BUY_GROUPS, ...LC_SELL_GROUPS].find((g) => g.slot === slot)!;
const idOf = (r: LcRowSpec): string | null =>
  r.kind === 'value' || r.kind === 'checkValue' ? r.id : r.kind === 'check' ? r.checkId : null;

describe('① 필드 스펙 — 그룹·행 순서 · 옛 id · 문구 · 게이트 (D-19 · D-21 · D-22)', () => {
  it('매수 쪽 슬롯 순서 = 가격 → 매수주문 → 한방체결 · 매도 쪽 = 가격 → 매도주문 → 매수취소(맨 아래)', () => {
    expect(LC_BUY_GROUPS.map((g) => g.slot)).toEqual(['buy-price', 'buy', 'sweep']);
    expect(LC_SELL_GROUPS.map((g) => g.slot)).toEqual(['sell-price', 'sell', 'cancel']);
  });

  it('매수주문 행 = 비교가격 · 감시대상 · 잔량 · 체결(체크 값) — 체크 행은 그룹 끝', () => {
    const rows = groupOf('buy').rows;
    expect(rows.map((r) => r.kind)).toEqual(['value', 'watch', 'value', 'checkValue']);
    expect(rows.map(idOf)).toEqual(['lc-buy-watch-price', null, 'lc-buy-watch-qty', 'lc-buy-min-trade-qty']);
  });

  it('매도주문 행 = 비교가격 · 호가잔량 · 잔량추적 % · 체결 · (조건부) 기준선 · 매수취소 = 취소잔량 · 체결 · 잔량추적', () => {
    expect(groupOf('sell').rows.map((r) => r.kind)).toEqual([
      'value',
      'value',
      'checkValue',
      'checkValue',
      'derived',
    ]);
    expect(groupOf('cancel').rows.map((r) => r.kind)).toEqual(['value', 'check', 'check']);
    expect(groupOf('cancel').rows.map(idOf)).toEqual([
      'lc-cancel-watch-qty',
      'lc-cancel-trade',
      'lc-cancel-qty-track',
    ]);
  });

  it('옛 입력 id 를 그대로 보존한다 — e2e `data-lc-field` · 인라인 입력 id 가 이 값이다', () => {
    const ids: Record<string, string> = {};
    for (const g of [...LC_BUY_GROUPS, ...LC_SELL_GROUPS]) {
      for (const r of g.rows) {
        if (r.kind === 'value' || r.kind === 'checkValue') ids[r.field] = r.id;
        if (r.kind === 'checkValue' || r.kind === 'check') ids[r.check] = r.checkId;
      }
    }
    expect(ids).toEqual({
      buyOrderPrice: 'lc-buy-order-price',
      buyOrderAmount: 'lc-buy-order-amount',
      buyWatchPrice: 'lc-buy-watch-price',
      buyWatchQty: 'lc-buy-watch-qty',
      buyMinTradeQty: 'lc-buy-min-trade-qty',
      buyTradeQtyEnabled: 'lc-buy-trade',
      sweepMinTickCount: 'lc-sweep-tick',
      sweepWatchPrice: 'lc-sweep-watch-price',
      sellOrderPrice: 'lc-sell-order-price',
      sellOrderRatio: 'lc-sell-order-ratio',
      sellWatchPrice: 'lc-sell-watch-price',
      sellWatchQty: 'lc-sell-watch-qty',
      sellQtyTrackRatio: 'lc-sell-qty-track-ratio',
      sellQtyTrackEnabled: 'lc-sell-qty-track',
      sellMinTradeQty: 'lc-sell-min-trade-qty',
      sellTradeQtyEnabled: 'lc-sell-trade',
      cancelWatchQty: 'lc-cancel-watch-qty',
      cancelTradeEnabled: 'lc-cancel-trade',
      cancelQtyTrackEnabled: 'lc-cancel-qty-track',
    });
  });

  it('라벨 · 단위 · 시트 설명이 UI-SPEC 카피 표 원문이다', () => {
    const spec = (id: string) => lcRowById(id)!.row as Extract<LcRowSpec, { kind: 'value' | 'checkValue' }>;
    expect([spec('lc-buy-order-price').label, spec('lc-buy-order-price').unit, spec('lc-buy-order-price').desc]).toEqual([
      '매수가격',
      '원',
      '넣을 매수 주문 가격이에요',
    ]);
    expect([spec('lc-buy-order-amount').unit, spec('lc-buy-order-amount').desc]).toEqual(['만원', '한 번에 넣을 금액이에요']);
    expect(spec('lc-buy-watch-qty').desc).toBe('잔량이 이 값보다 줄면 매수를 넣어요');
    expect(spec('lc-sweep-tick').desc).toBe('호가가 이만큼 바뀌면 한 번에 체결해요');
    expect([spec('lc-sell-order-ratio').unit, spec('lc-sell-order-ratio').desc]).toEqual([
      '%',
      '보유 수량 중 매도할 비율이에요',
    ]);
    expect([spec('lc-sell-qty-track-ratio').label, spec('lc-sell-qty-track-ratio').unit]).toEqual(['잔량추적', '%']);
    expect(spec('lc-sell-min-trade-qty').desc).toBe('체결이 이 값 이상이면 매도를 넣어요');
    expect(spec('lc-cancel-watch-qty').desc).toBe('잔량이 이 값보다 적으면 취소해요');
  });

  it('스위치 이름 4개 · 매수취소 스위치 = cancelQtyEnabled · 흐림은 매수주문·한방체결·매도주문만', () => {
    expect(LC_SWITCH_LABEL).toEqual({
      buyEnabled: '매수주문 켜기',
      sweepEnabled: '한방체결 켜기',
      sellEnabled: '매도주문 켜기',
      cancelQtyEnabled: '매수취소 켜기',
    });
    expect(groupOf('cancel').gate).toBe('cancelQtyEnabled');
    expect(groupOf('cancel').title).toBe('매수취소');
    const dim = [...LC_BUY_GROUPS, ...LC_SELL_GROUPS].filter((g) => g.dimWhenOff).map((g) => g.slot);
    expect(dim).toEqual(['buy', 'sweep', 'sell']);
    // 가격 섹션은 제목·스위치가 없고 접근성 이름만 있다.
    for (const [slot, name] of [
      ['buy-price', '매수 가격 설정'],
      ['sell-price', '매도 가격 설정'],
    ] as const) {
      expect(groupOf(slot).title).toBeUndefined();
      expect(groupOf(slot).gate).toBeUndefined();
      expect(groupOf(slot).ariaLabel).toBe(name);
    }
  });

  it('lcNavigableRows 는 값 편집 행만 — 감시대상 · 체크 전용 · 기준선은 건너뛴다', () => {
    expect(lcNavigableRows('buy').map((r) => r.field)).toEqual(['buyWatchPrice', 'buyWatchQty', 'buyMinTradeQty']);
    expect(lcNavigableRows('cancel')).toEqual([{ field: 'cancelWatchQty', id: 'lc-cancel-watch-qty' }]);
    expect(lcNavigableRows('sell').map((r) => r.id)).toEqual([
      'lc-sell-watch-price',
      'lc-sell-watch-qty',
      'lc-sell-qty-track-ratio',
      'lc-sell-min-trade-qty',
    ]);
  });

  it('lcRowById 는 값 id 와 체크 id 둘 다로 그룹을 찾고 모르는 id 는 null', () => {
    expect(lcRowById('lc-buy-trade')!.group.slot).toBe('buy');
    expect(lcRowById('lc-buy-min-trade-qty')!.row.kind).toBe('checkValue');
    expect(lcRowById('lc-cancel-qty-track')!.group.slot).toBe('cancel');
    expect(lcRowById('lc-nope')).toBeNull();
  });
});

describe('② SettingGroup — 둥근 면 · 제목줄 · 꺼진 그룹 흐림 (D-01)', () => {
  it('`section[data-slot=lc-group-{slot}]` · 면 `--group-bg` radius 16 · 패딩 10 10 4', () => {
    const { container } = render(
      <SettingGroup spec={groupOf('buy')} statusText="꺼짐" on={false}>
        <div>행</div>
      </SettingGroup>,
    );
    const section = container.querySelector('section[data-slot="lc-group-buy"]') as HTMLElement;
    expect(section).not.toBeNull();
    for (const c of ['bg-[var(--group-bg)]', 'rounded-[16px]', 'px-2.5', 'pt-2.5', 'pb-1', 'min-w-0']) {
      expect(section.className.split(/\s+/)).toContain(c);
    }
    expect(section.getAttribute('title')).toBe('비교가격의 감시잔량이 위 값 이하로 줄면 매수 발주');
  });

  it('가격 섹션은 헤더가 없고 접근성 이름 「매수 가격 설정」 이다', () => {
    const { container } = render(
      <SettingGroup spec={groupOf('buy-price')}>
        <div>행</div>
      </SettingGroup>,
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.getAttribute('aria-label')).toBe('매수 가격 설정');
    expect(section.querySelector('[data-slot="lc-group-header"]')).toBeNull();
    expect(screen.getByRole('region', { name: '매수 가격 설정' })).toBe(section);
  });

  it('헤더는 제목 15/600 + 상태 한 흐름이고 스위치는 오른쪽 끝(마지막 자식)이다', () => {
    const { container } = render(
      <SettingGroup
        spec={groupOf('sell')}
        statusText="발주 완료 · 무장 해제"
        on
        switchNode={<span data-testid="sw" />}
      >
        <div>행</div>
      </SettingGroup>,
    );
    const header = container.querySelector('[data-slot="lc-group-header"]') as HTMLElement;
    expect(header.lastElementChild).toBe(screen.getByTestId('sw'));
    const title = within(header).getByText('매도주문');
    expect(title.className).toContain('text-[15px]');
    expect(title.className).toContain('font-semibold');
    // 제목과 상태가 **한 텍스트 흐름**(min-w-0 flex-1) 안이다 — 길면 둘째 줄로 내려간다(말줄임 없음).
    const flow = title.parentElement as HTMLElement;
    expect(flow.className).toContain('flex-1');
    expect(flow.className).toContain('min-w-0');
    expect(within(flow).getByText('발주 완료 · 무장 해제').className).toContain('text-[12px]');
    expect(header.innerHTML).not.toMatch(/truncate|text-ellipsis/);
  });

  it('상태 「감시 중」은 `--led-armed` 이고 그 밖은 `--muted-fg` 다', () => {
    const { rerender } = render(
      <SettingGroup spec={groupOf('buy')} statusText="감시 중" on>
        <div />
      </SettingGroup>,
    );
    expect(screen.getByText('감시 중').className).toContain('text-[var(--led-armed)]');
    rerender(
      <SettingGroup spec={groupOf('buy')} statusText="무장 · 대기" on>
        <div />
      </SettingGroup>,
    );
    expect(screen.getByText('무장 · 대기').className).toContain('text-[var(--muted-fg)]');
    expect(screen.getByText('무장 · 대기').className).not.toContain('--led-armed');
  });

  it('꺼진 매수주문 그룹의 행 컨테이너는 opacity-45 · 켜지면 없음 · 매수취소는 꺼져도 없음', () => {
    const rowsOf = (c: HTMLElement) => c.querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
    const off = render(
      <SettingGroup spec={groupOf('buy')} on={false}>
        <button type="button">행</button>
      </SettingGroup>,
    );
    expect(rowsOf(off.container).className).toContain('opacity-45');
    // 흐려도 편집은 막지 않는다 — 행 버튼은 여전히 활성이다.
    expect(within(off.container).getByRole('button', { name: '행' })).toBeEnabled();
    off.unmount();

    const on = render(
      <SettingGroup spec={groupOf('buy')} on>
        <div />
      </SettingGroup>,
    );
    expect(rowsOf(on.container).className).not.toContain('opacity-45');
    on.unmount();

    const cancel = render(
      <SettingGroup spec={groupOf('cancel')} on={false}>
        <div />
      </SettingGroup>,
    );
    expect(rowsOf(cancel.container).className).not.toContain('opacity-45');
  });
});

describe('③ GroupSwitch — Radix primitive · role=switch · 40×24 + 히트 44×44 (Phase 16 D-05)', () => {
  it('role=switch · aria-checked · 이름 = 라벨 · 클릭 → onCheckedChange(!checked)', () => {
    const onChange = vi.fn();
    render(<GroupSwitch id="lc-cancel-qty" label="매수취소 켜기" checked={false} onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: '매수취소 켜기' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw.id).toBe('lc-cancel-qty');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('켜진 스위치를 누르면 false 로 부른다 · 확인 다이얼로그가 없다', () => {
    const onChange = vi.fn();
    render(<GroupSwitch label="매수주문 켜기" checked onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: '매수주문 켜기' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('disabled 면 눌러도 호출 0', () => {
    const onChange = vi.fn();
    render(<GroupSwitch label="매도주문 켜기" checked={false} disabled onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: '매도주문 켜기' });
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('시각 40×24 · 트랙 off `--switch-off` / on `--primary` · 히트 영역 가상요소 · thumb 20 이동 16', () => {
    render(<GroupSwitch label="한방체결 켜기" checked={false} onCheckedChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: '한방체결 켜기' });
    const cls = sw.className.split(/\s+/);
    for (const c of ['h-6', 'w-10', 'relative', 'bg-[var(--switch-off)]', 'data-[state=checked]:bg-[var(--primary)]']) {
      expect(cls).toContain(c);
    }
    expect(sw.className).toContain('after:-inset-y-[10px]');
    expect(sw.className).toContain('after:-inset-x-[2px]');
    const thumb = sw.firstElementChild as HTMLElement;
    expect(thumb.className).toContain('size-5');
    expect(thumb.className).toContain('translate-x-[2px]');
    expect(thumb.className).toContain('data-[state=checked]:translate-x-[18px]');
  });
});

describe('④ CheckValueRow — 「○ 라벨 ─ 값 ›」 (D-22)', () => {
  it('체크는 `button[role=checkbox]` · aria-checked · 이름 「{그룹} {라벨}」 · 누르면 onToggle', () => {
    const onToggle = vi.fn();
    render(
      <CheckValueRow
        checkId="lc-buy-trade"
        groupTitle="매수주문"
        label="체결"
        checked={false}
        onToggle={onToggle}
        value={30_000}
        unit="주"
        valueId="lc-buy-min-trade-qty"
        onActivateValue={() => {}}
      />,
    );
    const chk = screen.getByRole('checkbox', { name: '매수주문 체결' });
    expect(chk.tagName).toBe('BUTTON');
    expect(chk.id).toBe('lc-buy-trade');
    expect(chk).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(chk);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('값 버튼은 따로다 — 이름 「체결 30,000주」 · 체크가 꺼져 있어도 누르면 편집을 연다', () => {
    const onActivate = vi.fn();
    const { container } = render(
      <CheckValueRow
        checkId="lc-buy-trade"
        groupTitle="매수주문"
        label="체결"
        checked={false}
        onToggle={() => {}}
        value={30_000}
        unit="주"
        valueId="lc-buy-min-trade-qty"
        onActivateValue={onActivate}
      />,
    );
    const btn = screen.getByRole('button', { name: '체결 30,000주' });
    expect(btn.getAttribute('data-lc-field')).toBe('lc-buy-min-trade-qty');
    expect(container.querySelector('[data-lc-field="lc-buy-min-trade-qty"] [data-slot="lc-row-value"]')!.textContent).toBe(
      '30,000주',
    );
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledWith(btn);
  });

  it('켜진 체크는 `--primary` 채움 원이다', () => {
    render(<CheckValueRow checkId="lc-sell-trade" groupTitle="매도주문" label="체결" checked onToggle={() => {}} />);
    const chk = screen.getByRole('checkbox', { name: '매도주문 체결' });
    expect(chk).toHaveAttribute('aria-checked', 'true');
    const circle = chk.querySelector('[data-slot="lc-check-circle"]') as HTMLElement;
    expect(circle.className).toContain('bg-[var(--primary)]');
    expect(circle.className).toContain('size-5');
  });

  it('값 없는 체크 행(매수취소 체결)은 값 버튼이 없고 체크 버튼이 행을 채운다', () => {
    const { container } = render(
      <CheckValueRow checkId="lc-cancel-trade" groupTitle="매수취소" label="체결" checked={false} onToggle={() => {}} />,
    );
    expect(container.querySelectorAll('button')).toHaveLength(1);
    const chk = screen.getByRole('checkbox', { name: '매수취소 체결' });
    expect(chk.className).toContain('flex-1');
    expect(container.querySelector('[data-slot="lc-row-value"]')).toBeNull();
  });

  it('편집 중이면 값 버튼 자리에 편집기가 들어가고 행 높이 클래스는 그대로다', () => {
    const { container } = render(
      <CheckValueRow
        checkId="lc-sell-qty-track"
        groupTitle="매도주문"
        label="잔량추적"
        checked
        onToggle={() => {}}
        value={50}
        unit="%"
        valueId="lc-sell-qty-track-ratio"
        editing
        editor={<input id="lc-sell-qty-track-ratio" aria-label="잔량추적" defaultValue="50" />}
        onActivateValue={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: '잔량추적 50%' })).toBeNull();
    expect(container.querySelector('#lc-sell-qty-track-ratio')).not.toBeNull();
    const row = container.querySelector('[data-slot="lc-check-row"]') as HTMLElement;
    expect(row.className).toContain('min-h-[44px]');
    expect(container.querySelector('[data-lc-field="lc-sell-qty-track-ratio"][data-editing="true"]')).not.toBeNull();
  });
});

describe('⑤ WatchTargetRow — 행 안 토글 · D-02a 모든 밴드 라벨 없이 전체 폭 (D-02 · D-02a)', () => {
  it('role=group 「감시대상」 · aria-pressed 두 버튼 · 선택은 `--seg-on-bg` · 누르면 onSelect', () => {
    const onSelect = vi.fn();
    render(<WatchTargetRow value="0" onSelect={onSelect} />);
    const group = screen.getByRole('group', { name: '감시대상' });
    const sell = within(group).getByRole('button', { name: '매도잔량' });
    const buy = within(group).getByRole('button', { name: '매수잔량' });
    expect(sell).toHaveAttribute('aria-pressed', 'true');
    expect(buy).toHaveAttribute('aria-pressed', 'false');
    expect(sell.className).toContain('bg-[var(--seg-on-bg)]');
    expect(buy.className).not.toContain('bg-[var(--seg-on-bg)]');
    fireEvent.click(buy);
    expect(onSelect).toHaveBeenCalledWith('1');
  });

  it('전송 중(busy)이면 두 버튼 모두 비활성이고 눌러도 부르지 않는다', () => {
    const onSelect = vi.fn();
    render(<WatchTargetRow value="1" busy onSelect={onSelect} />);
    for (const name of ['매도잔량', '매수잔량']) {
      const b = screen.getByRole('button', { name });
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '감시대상' })).toHaveAttribute('aria-busy', 'true');
  });

  it('★ D-02a — 어느 밴드에서도 시각 「감시대상」 라벨이 없고 트랙이 행 전체 폭이다(이름은 group 이 유지)', () => {
    const { container } = render(<WatchTargetRow value="0" onSelect={() => {}} />);
    // 보이는 글자로서의 「감시대상」은 없다 — 접근성 이름만 남는다.
    expect(screen.queryByText('감시대상')).toBeNull();
    expect(container.textContent).not.toContain('감시대상');
    const track = screen.getByRole('group', { name: '감시대상' });
    const cls = track.className.split(/\s+/);
    for (const c of ['flex', 'w-full', 'rounded-[8px]', 'bg-[var(--raised-2)]', 'p-0.5']) expect(cls).toContain(c);
    expect(track.className).not.toContain('inline-flex');
    expect(track.className).not.toContain('w-auto');
  });

  it('버튼 모양 — 폰 32px · 14/600 · px 8 → ≥700 26px · 13/600 (flex-1 은 모든 밴드) · 4글자 nowrap', () => {
    render(<WatchTargetRow value="0" onSelect={() => {}} />);
    const b = screen.getByRole('button', { name: '매도잔량' });
    const cls = b.className.split(/\s+/);
    for (const c of [
      'h-8',
      'flex-1',
      'min-w-0',
      'whitespace-nowrap',
      'rounded-[6px]',
      'px-2',
      'text-[14px]',
      'font-semibold',
      '@min-[700px]/lc:h-[26px]',
      '@min-[700px]/lc:text-[13px]',
    ]) {
      expect(cls).toContain(c);
    }
    expect(b.className).not.toContain('@min-[700px]/lc:flex-none');
    expect(b.className).not.toContain('@min-[700px]/lc:px-2.5');
  });
});

describe('⑥ DerivedRow — 읽기 전용 기준선 행', () => {
  it('버튼이 아니고 쉐브런이 없다 · 「잔량추적 기준선 41,200주」', () => {
    const { container } = render(<DerivedRow label="잔량추적 기준선" value={41_200} unit="주" />);
    const row = container.querySelector('[data-slot="lc-derived"]') as HTMLElement;
    expect(row.tagName).not.toBe('BUTTON');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(row.textContent).toBe('잔량추적 기준선41,200주');
    expect(row.textContent).not.toContain('›');
  });
});

describe('⑦ 공통 규율 — 44px · 컨테이너 쿼리만 · 말줄임 0', () => {
  function renderAll() {
    return render(
      <div>
        <SettingGroup spec={groupOf('buy')} statusText="감시 중" on switchNode={
          <GroupSwitch label="매수주문 켜기" checked onCheckedChange={() => {}} />
        }>
          <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={130_000} editing={false} onActivate={() => {}} />
          <WatchTargetRow value="0" onSelect={() => {}} />
          <CheckValueRow
            checkId="lc-buy-trade"
            groupTitle="매수주문"
            label="체결"
            checked
            onToggle={() => {}}
            value={30_000}
            unit="주"
            valueId="lc-buy-min-trade-qty"
            onActivateValue={() => {}}
          />
          <CheckValueRow checkId="lc-cancel-trade" groupTitle="매수취소" label="체결" checked={false} onToggle={() => {}} />
          <DerivedRow label="잔량추적 기준선" value={100_000} unit="주" />
        </SettingGroup>
      </div>,
    );
  }

  it('값 행 · 감시대상 행 · 체크 행 · 기준선 행이 전부 min-h-[44px] 다', () => {
    const { container } = renderAll();
    const rows = [
      container.querySelector('[data-lc-field="lc-buy-watch-price"]'),
      container.querySelector('[data-slot="lc-watch-row"]'),
      ...Array.from(container.querySelectorAll('[data-slot="lc-check-row"]')),
      container.querySelector('[data-slot="lc-derived"]'),
    ] as HTMLElement[];
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.className).toContain('min-h-[44px]');
  });

  it('렌더된 마크업에 뷰포트 브레이크포인트 클래스와 말줄임 유틸이 하나도 없다', () => {
    const { container } = renderAll();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[class]'))) {
      const cls = el.getAttribute('class') ?? '';
      expect(cls, el.outerHTML.slice(0, 80)).not.toMatch(VIEWPORT_BP);
      expect(cls).not.toMatch(/truncate|text-ellipsis/);
    }
  });

  it('소스 가드 — 스위치는 radix-ui primitive 를 직접 쓰고 `ui/switch` 를 쓰지 않는다', () => {
    const src = readFileSync(path.resolve(__dirname, '../setting-group.tsx'), 'utf8');
    expect(src).toMatch(/from 'radix-ui'/);
    expect(src).not.toMatch(/from '@\/components\/ui\/switch'/);
  });
});
