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
 *   ⑤ `DerivedRow` — 읽기 전용(버튼 아님 · 쉐브런 없음).
 *   ⑥ 모든 행 44px · 뷰포트 브레이크포인트 0 · 말줄임 0.
 *   ⑨ (Phase 24 ⑤) 접이식 제목줄 — `<button aria-expanded aria-controls>` · 스위치는 버튼 밖 형제 ·
 *      접힌 행 영역은 `hidden` 클래스(언마운트 없음) · 요약 줄 · 사전 검증 줄(`role="alert"`).
 *   ⑩ 상태 색 — 첫 단어 기준(감시 중 · 보유중 · 포기 · 그 밖) · 새 색 토큰 0.
 *   ⑪ 표시 문자열(`valueText`) · 접근성 이름(`ariaName`) · 행 단위 흐림(`dim`) · 발동잔량 강조 ·
 *      소진 안내 · 「회」 단위 · 값 버튼 설명 = 카드 제목 + 상태 문구(R10).
 *
 * (감시대상 행 조각은 Phase 24 ⑤ 로 지웠다 — 새 서버는 감시대상을 읽지 않는다.)
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
  formatSettingValue,
  GroupNote,
  GroupSummary,
  groupStatusClassOf,
  GroupSwitch,
  SettingGroup,
  SettingRow,
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

  it('매수주문 행 = 비교가격 · 잔량 · 체결(체크 값) — 감시대상 행 없음(Phase 24 ⑤) · 체크 행은 그룹 끝', () => {
    const rows = groupOf('buy').rows;
    expect(rows.map((r) => r.kind)).toEqual(['value', 'value', 'checkValue']);
    expect(rows.map(idOf)).toEqual(['lc-buy-watch-price', 'lc-buy-watch-qty', 'lc-buy-min-trade-qty']);
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

  it('lcNavigableRows 는 값 편집 행만 — 체크 전용 · 기준선은 건너뛴다', () => {
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

  it.each(['buy-price', 'sell-price'] as const)(
    '제목 없는 가격 섹션(%s)은 상단 패딩 pt-1 — 44px 행이 위 여백을 이미 가진다(G-21-R3-5)',
    (slot) => {
      const { container } = render(
        <SettingGroup spec={groupOf(slot)}>
          <div>행</div>
        </SettingGroup>,
      );
      const tokens = (container.querySelector('section') as HTMLElement).className.split(/\s+/);
      expect(tokens).toContain('pt-1');
      expect(tokens).not.toContain('pt-2.5');
      for (const c of ['px-2.5', 'pb-1']) expect(tokens).toContain(c);
    },
  );

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

describe('②-b 흐림 한 겹 — `dimRows={false}` 면 컨테이너는 흐리지 않고 행 `dim` 이 한 번만 곱한다(UI-SPEC §9)', () => {
  const opacityLayers = (el: HTMLElement | null): number => {
    let n = 0;
    for (let cur = el; cur; cur = cur.parentElement) if (cur.classList.contains('opacity-45')) n += 1;
    return n;
  };

  it('꺼진 그룹 + dimRows=false + 행 dim → 값 버튼까지 opacity-45 가 정확히 한 겹', () => {
    const { container } = render(
      <SettingGroup spec={groupOf('buy')} statusText="꺼짐" on={false} dimRows={false}>
        <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={130_000} dim editing={false} onActivate={() => {}} />
      </SettingGroup>,
    );
    expect((container.querySelector('[data-slot="lc-group-rows"]') as HTMLElement).className).not.toContain('opacity-45');
    const btn = container.querySelector('[data-lc-field="lc-buy-watch-price"]') as HTMLElement;
    expect(opacityLayers(btn)).toBe(1);
    // 흐린 행도 조작 가능 — aria-disabled 를 쓰지 않는다(R10).
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute('aria-disabled');
  });

  it('dimRows 기본값(true)은 지금처럼 컨테이너를 흐린다 — 매도·취소 기존 경로 무변경', () => {
    const { container } = render(
      <SettingGroup spec={groupOf('buy')} on={false}>
        <div />
      </SettingGroup>,
    );
    expect((container.querySelector('[data-slot="lc-group-rows"]') as HTMLElement).className).toContain('opacity-45');
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

describe('⑤ DerivedRow — 읽기 전용 기준선 행', () => {
  it('버튼이 아니고 쉐브런이 없다 · 「잔량추적 기준선 41,200주」', () => {
    const { container } = render(<DerivedRow label="잔량추적 기준선" value={41_200} unit="주" />);
    const row = container.querySelector('[data-slot="lc-derived"]') as HTMLElement;
    expect(row.tagName).not.toBe('BUTTON');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(row.textContent).toBe('잔량추적 기준선41,200주');
    expect(row.textContent).not.toContain('›');
  });
});

describe('⑥ 공통 규율 — 44px · 컨테이너 쿼리만 · 말줄임 0', () => {
  function renderAll() {
    return render(
      <div>
        <SettingGroup spec={groupOf('buy')} statusText="감시 중" on switchNode={
          <GroupSwitch label="매수주문 켜기" checked onCheckedChange={() => {}} />
        }>
          <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={130_000} editing={false} onActivate={() => {}} />
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

  it('값 행 · 체크 행 · 기준선 행이 전부 min-h-[44px] 다', () => {
    const { container } = renderAll();
    const rows = [
      container.querySelector('[data-lc-field="lc-buy-watch-price"]'),
      ...Array.from(container.querySelectorAll('[data-slot="lc-check-row"]')),
      container.querySelector('[data-slot="lc-derived"]'),
    ] as HTMLElement[];
    expect(rows).toHaveLength(4);
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

/*
  ⑦ 20-07 a11y — ≥700 두 열에서 매수·매도 쪽 값 버튼이 같은 이름을 가질 수 있다(「비교가격 127,400원」 ·
  「체결 30,000주」). 이름은 UI-SPEC 계약 「{라벨} {값}{단위}」 그대로 두고, **설명**으로 그룹 제목을 붙여
  스크린리더가 「비교가격 127,400원, 매수주문」처럼 가르게 한다(보이는 변화 0).
*/
describe('⑦ 값 버튼의 그룹 설명 — 이름은 「{라벨} {값}{단위}」 그대로 · 설명 = 그룹 제목 (20-07 a11y)', () => {
  function renderTwoColumns() {
    return render(
      <div>
        <SettingGroup spec={groupOf('buy')} statusText="감시 중" on>
          <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={127_400} editing={false} onActivate={() => {}} />
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
        </SettingGroup>
        <SettingGroup spec={groupOf('sell')} statusText="감시 중" on>
          <SettingRow id="lc-sell-watch-price" label="비교가격" unit="원" value={127_400} editing={false} onActivate={() => {}} />
          <CheckValueRow
            checkId="lc-sell-trade"
            groupTitle="매도주문"
            label="체결"
            checked
            onToggle={() => {}}
            value={30_000}
            unit="주"
            valueId="lc-sell-min-trade-qty"
            onActivateValue={() => {}}
          />
        </SettingGroup>
        <SettingGroup spec={groupOf('buy-price')}>
          <SettingRow id="lc-buy-order-price" label="매수가격" unit="원" value={127_400} editing={false} onActivate={() => {}} />
        </SettingGroup>
      </div>,
    );
  }

  it('같은 이름의 두 값 버튼은 설명(그룹 제목)으로 갈린다 — 이름은 바뀌지 않는다', () => {
    renderTwoColumns();
    const cmp = screen.getAllByRole('button', { name: '비교가격 127,400원' });
    expect(cmp).toHaveLength(2);
    expect(cmp[0]).toHaveAccessibleDescription(/^매수주문/);
    expect(cmp[1]).toHaveAccessibleDescription(/^매도주문/);
    const trade = screen.getAllByRole('button', { name: '체결 30,000주' });
    expect(trade).toHaveLength(2);
    expect(trade[0]).toHaveAccessibleDescription(/^매수주문/);
    expect(trade[1]).toHaveAccessibleDescription(/^매도주문/);
  });

  it('체크 버튼(이름에 그룹이 이미 있다) · 제목 없는 가격 섹션 행은 설명을 달지 않는다', () => {
    renderTwoColumns();
    expect(screen.getByRole('checkbox', { name: '매수주문 체결' })).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: '매수가격 127,400원' })).not.toHaveAttribute('aria-describedby');
  });

  it('설명은 카드 제목 + 상태 문구다 — 흐린 행의 비시각 경로(Phase 24 R10 · 「비교가격 127,400원, 매수주문 감시 중」)', () => {
    renderTwoColumns();
    const [buy] = screen.getAllByRole('button', { name: '비교가격 127,400원' });
    expect(buy).toHaveAccessibleDescription('매수주문 감시 중');
    expect(buy).not.toHaveAttribute('aria-disabled');
  });
});

/* ─────────────── Phase 24 ⑤ ⑥ ⑩ — 접이식 그룹 카드 · 요약 줄 · 사전 검증 줄 · 상태 색 · 표시 문자열 ─────────────── */

describe('⑨ SettingGroup fold — 제목줄 접기 · 요약 줄 · 사전 검증 줄 (UI-SPEC §2 · §3 · §7)', () => {
  const summaryItems = [
    { key: '금액', value: '4,000만원', off: false },
    { key: '체결량', value: '꺼짐', off: true },
  ] as const;

  function renderFold(expanded: boolean, extra: { precheckText?: string | null; on?: boolean } = {}) {
    const onToggle = vi.fn();
    const onSwitch = vi.fn();
    const utils = render(
      <SettingGroup
        spec={groupOf('buy')}
        statusText="감시 중"
        on={extra.on ?? true}
        dimRows={false}
        precheckText={extra.precheckText}
        fold={{ expanded, onToggle, summary: <GroupSummary items={summaryItems} /> }}
        switchNode={<GroupSwitch label="매수주문 켜기" checked onCheckedChange={onSwitch} />}
      >
        <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={130_000} editing={false} onActivate={() => {}} />
      </SettingGroup>,
    );
    return { ...utils, onToggle, onSwitch };
  }

  it('접힘 — 제목줄이 `<button type=button data-slot=lc-group-fold aria-expanded=false aria-controls>` 이고 행 영역은 DOM 에 남은 채 `hidden`', () => {
    const { container } = renderFold(false);
    const fold = container.querySelector('[data-slot="lc-group-fold"]') as HTMLButtonElement;
    expect(fold.tagName).toBe('BUTTON');
    expect(fold.type).toBe('button');
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    const rows = container.querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
    expect(fold.getAttribute('aria-controls')).toBe(rows.id);
    expect(rows.id).not.toBe('');
    expect(rows.classList.contains('hidden')).toBe(true);
    // 언마운트하지 않는다 — 행 버튼이 DOM 에 있다.
    expect(rows.querySelector('[data-lc-field="lc-buy-watch-price"]')).not.toBeNull();
    const summary = container.querySelector('[data-slot="lc-group-summary"]') as HTMLElement;
    expect(summary).not.toBeNull();
    expect(summary.closest('.hidden')).toBeNull();
  });

  it('펼침 — aria-expanded=true · 행 영역 hidden 없음 · 요약 줄은 숨김 · 쉐브런 rotate-90', () => {
    const { container } = renderFold(true);
    const fold = container.querySelector('[data-slot="lc-group-fold"]') as HTMLElement;
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect((container.querySelector('[data-slot="lc-group-rows"]') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect((container.querySelector('[data-slot="lc-group-summary"]') as HTMLElement).closest('.hidden')).not.toBeNull();
    const chev = fold.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(chev.textContent).toBe('›');
    expect(chev.className).toContain('rotate-90');
  });

  it('접힘 쉐브런은 회전하지 않고 전환은 150ms · reduced-motion 이면 없음', () => {
    const { container } = renderFold(false);
    const chev = container.querySelector('[data-slot="lc-group-fold"] [aria-hidden="true"]') as HTMLElement;
    expect(chev.className).not.toContain('rotate-90');
    for (const c of ['transition-transform', 'duration-150', 'motion-reduce:transition-none', 'text-[var(--faint)]']) {
      expect(chev.className).toContain(c);
    }
  });

  it('버튼 클릭 → onToggle 1회 · 스위치는 버튼 **밖 형제**라 눌러도 onToggle 0회', () => {
    const { container, onToggle, onSwitch } = renderFold(false);
    const fold = container.querySelector('[data-slot="lc-group-fold"]') as HTMLElement;
    const sw = screen.getByRole('switch', { name: '매수주문 켜기' });
    expect(fold.contains(sw)).toBe(false);
    expect(fold.parentElement!.contains(sw)).toBe(true);
    fireEvent.click(sw);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(fold);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('접기 버튼 이름 = 보이는 제목 + 상태(쉐브런 제외) · 최소 높이 32 · 말줄임 없음', () => {
    const { container } = renderFold(false);
    const fold = screen.getByRole('button', { name: '매수주문 감시 중' });
    expect(fold.getAttribute('data-slot')).toBe('lc-group-fold');
    for (const c of ['min-h-8', 'min-w-0', 'flex-1', 'rounded-[10px]', 'text-left']) expect(fold.className).toContain(c);
    expect(container.innerHTML).not.toMatch(/truncate|text-ellipsis/);
  });

  it('요약 줄은 접기 트리거가 아니다 — 눌러도 onToggle 0회', () => {
    const { container, onToggle } = renderFold(false);
    fireEvent.click(container.querySelector('[data-slot="lc-group-summary"]') as HTMLElement);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('사전 검증 줄 — 제목줄 바로 아래 `role=alert` · 접힘/펼침 둘 다 보인다 · null 이면 없음', () => {
    for (const expanded of [false, true]) {
      const { container, unmount } = renderFold(expanded, { precheckText: '주문금액을 먼저 입력해 주세요' });
      const pre = container.querySelector('[data-slot="lc-group-precheck"]') as HTMLElement;
      expect(pre).not.toBeNull();
      expect(pre.getAttribute('role')).toBe('alert');
      expect(pre.textContent).toBe('주문금액을 먼저 입력해 주세요');
      expect(pre.closest('.hidden')).toBeNull();
      const header = container.querySelector('[data-slot="lc-group-header"]') as HTMLElement;
      expect(header.nextElementSibling).toBe(pre);
      for (const c of ['text-[12.5px]', 'leading-[1.45]', 'text-[var(--destructive)]']) expect(pre.className).toContain(c);
      unmount();
    }
    const { container } = renderFold(false, { precheckText: null });
    expect(container.querySelector('[data-slot="lc-group-precheck"]')).toBeNull();
  });

  it('꺼진 그룹의 요약 줄은 흐리고(한 겹) 사전 검증 줄 · 접기 버튼은 흐리지 않는다', () => {
    const { container } = renderFold(false, { on: false, precheckText: '반등을 1~100%로 입력해 주세요' });
    const summary = container.querySelector('[data-slot="lc-group-summary"]') as HTMLElement;
    let layers = 0;
    for (let cur: HTMLElement | null = summary; cur; cur = cur.parentElement) if (cur.classList.contains('opacity-45')) layers += 1;
    expect(layers).toBe(1);
    expect((container.querySelector('[data-slot="lc-group-precheck"]') as HTMLElement).closest('.opacity-45')).toBeNull();
    expect((container.querySelector('[data-slot="lc-group-fold"]') as HTMLElement).closest('.opacity-45')).toBeNull();
  });

  it('fold 가 없으면 기존 헤더 그대로 — 접기 버튼 없음', () => {
    const { container } = render(
      <SettingGroup spec={groupOf('buy')} statusText="감시 중" on>
        <div />
      </SettingGroup>,
    );
    expect(container.querySelector('[data-slot="lc-group-fold"]')).toBeNull();
    expect(container.querySelector('[data-slot="lc-group-summary"]')).toBeNull();
  });
});

describe('⑨-b GroupSummary · GroupNote — 요약 kv · 소진 안내', () => {
  it('kv 마다 nowrap · 키 12 `--muted-fg` · 값 13/500 `--fg-2` · off 면 값만 `--muted-fg`', () => {
    const { container } = render(
      <GroupSummary
        items={[
          { key: '금액', value: '4,000만원', off: false },
          { key: '한방', value: '꺼짐', off: true },
        ]}
      />,
    );
    const box = container.querySelector('[data-slot="lc-group-summary"]') as HTMLElement;
    for (const c of ['flex', 'flex-wrap', 'gap-x-2.5', 'gap-y-1', 'text-[13px]', 'leading-[1.4]']) expect(box.className).toContain(c);
    const kvs = Array.from(box.children) as HTMLElement[];
    expect(kvs).toHaveLength(2);
    expect(kvs.map((k) => k.textContent)).toEqual(['금액4,000만원', '한방꺼짐']);
    for (const kv of kvs) expect(kv.className).toContain('whitespace-nowrap');
    const [key0, val0] = Array.from(kvs[0].children) as HTMLElement[];
    expect(key0.className).toContain('text-[12px]');
    expect(key0.className).toContain('text-[var(--muted-fg)]');
    expect(val0.className).toContain('text-[var(--fg-2)]');
    expect(val0.className).toContain('font-medium');
    const val1 = kvs[1].children[1] as HTMLElement;
    expect(val1.className).toContain('text-[var(--muted-fg)]');
    expect(val1.className).not.toContain('--fg-2');
    expect(box.innerHTML).not.toMatch(/truncate|text-ellipsis/);
  });

  it('GroupNote — 역할 없는 정적 텍스트 12.5px `--muted-fg`', () => {
    const { container } = render(<GroupNote slot="lc-post-buy-exhausted">소진 — 안내</GroupNote>);
    const note = container.querySelector('[data-slot="lc-post-buy-exhausted"]') as HTMLElement;
    expect(note.getAttribute('role')).toBeNull();
    for (const c of ['text-[12.5px]', 'leading-[1.45]', 'text-[var(--muted-fg)]']) expect(note.className).toContain(c);
    expect(note.textContent).toBe('소진 — 안내');
  });
});

describe('⑩ 상태 색 — 첫 단어 기준 · 새 색 토큰 0 (UI-SPEC §11)', () => {
  it.each([
    ['감시 중', 'text-[var(--led-armed)]'],
    ['감시 중 · 후매수 발동', 'text-[var(--led-armed)]'],
    ['보유중', 'text-[var(--led-latent)]'],
    ['포기', 'text-[var(--destructive)]'],
    ['꺼짐', 'text-[var(--muted-fg)]'],
    ['소진', 'text-[var(--muted-fg)]'],
    ['켜짐 · 켠 매수 없음', 'text-[var(--muted-fg)]'],
    ['무장 · 대기 · 후매수 발동', 'text-[var(--muted-fg)]'],
  ])('%s → %s', (text, cls) => {
    expect(groupStatusClassOf(text)).toBe(cls);
  });

  it('헤더와 접기 버튼이 같은 판정을 쓴다 — 「보유중」 상태 span 이 `--led-latent`', () => {
    render(
      <SettingGroup spec={groupOf('buy')} statusText="보유중" on fold={{ expanded: false, onToggle: () => {}, summary: null }}>
        <div />
      </SettingGroup>,
    );
    expect(screen.getByText('보유중').className).toContain('text-[var(--led-latent)]');
  });
});

describe('⑪ 표시 문자열 · 접근성 이름 · 행 단위 흐림 · 발동잔량 · 「회」', () => {
  it('SettingRow valueText 는 값 슬롯 글자 · ariaName 은 값 버튼 이름 전체를 덮는다', () => {
    const { container } = render(
      <SettingRow
        id="lc-extra-buy-max-qty"
        label="최대 잔량"
        unit="주"
        value={0}
        valueText="무제한"
        ariaName="추가매수 최대 잔량 무제한"
        editing={false}
        onActivate={() => {}}
      />,
    );
    expect(container.querySelector('[data-slot="lc-row-value"]')!.textContent).toBe('무제한');
    expect(screen.getByRole('button', { name: '추가매수 최대 잔량 무제한' })).toBeInTheDocument();
  });

  it('valueText 만 주면 기본 접근성 이름도 그 문자열을 쓴다', () => {
    render(<SettingRow id="x" label="최대" unit="회" value={3} valueText="3회 · 남은 2회" editing={false} onActivate={() => {}} />);
    expect(screen.getByRole('button', { name: '최대 3회 · 남은 2회' })).toBeInTheDocument();
  });

  it('SettingRow dim → 버튼에 opacity-45 · focus-within/hover 복원이 한 요소에 한 번 · 편집 중이면 없음', () => {
    const { container, rerender } = render(
      <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={1} dim editing={false} onActivate={() => {}} />,
    );
    const btn = container.querySelector('[data-lc-field="lc-buy-watch-price"]') as HTMLElement;
    const tokens = btn.className.split(/\s+/);
    expect(tokens.filter((t) => t === 'opacity-45')).toHaveLength(1);
    expect(tokens).toContain('focus-within:opacity-100');
    expect(tokens).toContain('pointer-fine:hover:opacity-100');
    rerender(
      <SettingRow id="lc-buy-watch-price" label="비교가격" unit="원" value={1} dim editing editor={<input />} onActivate={() => {}} />,
    );
    expect(container.innerHTML).not.toContain('opacity-45');
  });

  it('CheckValueRow dim → 라벨 · 값만 흐리고 원형 체크는 흐리지 않는다', () => {
    const { container } = render(
      <CheckValueRow
        checkId="lc-sweep"
        groupTitle="선매수"
        label="한방"
        checked={false}
        onToggle={() => {}}
        value={3}
        unit="건"
        valueId="lc-sweep-tick"
        dim
        onActivateValue={() => {}}
      />,
    );
    const circle = container.querySelector('[data-slot="lc-check-circle"]') as HTMLElement;
    expect(circle.closest('.opacity-45')).toBeNull();
    const label = screen.getByText('한방');
    expect(label.closest('.opacity-45')).not.toBeNull();
    const valueBtn = container.querySelector('[data-lc-field="lc-sweep-tick"]') as HTMLElement;
    expect(valueBtn.closest('.opacity-45')).not.toBeNull();
    expect(container.querySelectorAll('.opacity-45')).toHaveLength(2);
  });

  it('CheckValueRow valueText · ariaName', () => {
    render(
      <CheckValueRow
        checkId="lc-buy-trade"
        groupTitle="선매수"
        label="체결량"
        checked
        onToggle={() => {}}
        value={30_000}
        unit="주"
        valueId="lc-buy-min-trade-qty"
        valueText="3만주"
        ariaName="선매수 체결량 3만주"
        onActivateValue={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: '선매수 체결량 3만주' })).toBeInTheDocument();
  });

  it('DerivedRow emphasis 값 있음 → 「330,000주」 `--up` 600 · 버튼 아님 · slot 지정', () => {
    const { container } = render(
      <DerivedRow slot="lc-post-buy-trigger" label="발동잔량" value={330_000} unit="주" emphasis valueText="—" srText="없음" />,
    );
    const row = container.querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const v = screen.getByText('330,000주');
    expect(v.className).toContain('text-[var(--up)]');
    expect(v.className).toContain('font-semibold');
    expect(row.querySelector('.sr-only')).toBeNull();
  });

  it('DerivedRow 값 0 → 보이는 「—」(`--muted-fg`) + sr-only 「없음」', () => {
    const { container } = render(
      <DerivedRow slot="lc-post-buy-trigger" label="발동잔량" value={0} unit="주" emphasis valueText="—" srText="없음" />,
    );
    const row = container.querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    const dash = within(row).getByText('—');
    expect(dash.className).toContain('text-[var(--muted-fg)]');
    expect(dash.className).not.toContain('--up');
    expect(dash).toHaveAttribute('aria-hidden', 'true');
    expect((row.querySelector('.sr-only') as HTMLElement).textContent).toBe('없음');
  });

  it('DerivedRow 기본(emphasis 없음)은 기존 기준선 행 그대로 — slot lc-derived', () => {
    const { container } = render(<DerivedRow label="잔량추적 기준선" value={100_000} unit="주" />);
    expect(container.querySelector('[data-slot="lc-derived"]')!.textContent).toBe('잔량추적 기준선100,000주');
  });

  it('formatSettingValue(3, 회) → 「3회」', () => {
    expect(formatSettingValue(3, '회')).toBe('3회');
  });
});
