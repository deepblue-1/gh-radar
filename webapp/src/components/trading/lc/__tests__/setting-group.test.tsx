import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPointer, restoreMatchMedia } from '@/lib/__tests__/match-media';

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
  POST_BUY_UNLOCK_SR_TEXT,
  type LcGroupSpec,
  type LcRowSpec,
} from '../lc-fields';
import {
  CheckValueRow,
  ChoiceRow,
  DerivedRow,
  formatSettingValue,
  GroupHeaderCheck,
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

describe('① 필드 스펙 — 카드 순서 · 옛 id · 문구 · 게이트 (D-19 · D-21 · D-22 · Phase 24 ⑤ · D-09)', () => {
  it('매수 쪽 슬롯 순서 = 매수주문 → 선매수 → 추가매수 → 후매수 · 매도 쪽 = 매도주문 → 매수취소 → 자동매도 (quick-261001-gjk · Phase 27 D-01)', () => {
    expect(LC_BUY_GROUPS.map((g) => g.slot)).toEqual(['buy', 'pre-buy', 'extra-buy', 'post-buy']);
    expect(LC_SELL_GROUPS.map((g) => g.slot)).toEqual(['sell', 'cancel', 'auto-sell']);
  });

  it('매수주문 공통 카드 = 주문가격 · 비교가격 · 선매수 = 금액 · 매도잔량 · ○체결량 · ○한방 · 한방가격', () => {
    expect(groupOf('buy').rows.map(idOf)).toEqual(['lc-buy-order-price', 'lc-buy-watch-price']);
    expect(groupOf('pre-buy').rows.map((r) => r.kind)).toEqual(['value', 'value', 'checkValue', 'checkValue', 'value']);
    expect(groupOf('pre-buy').rows.map(idOf)).toEqual([
      'lc-buy-order-amount',
      'lc-buy-watch-qty',
      'lc-buy-min-trade-qty',
      'lc-sweep-tick',
      'lc-sweep-watch-price',
    ]);
    // + ☐버스트 시 해제 체크 행(quick-261003-rc4 — 최소 · 최대 잔량 밑 마지막 행).
    expect(groupOf('extra-buy').rows.map((r) => r.kind)).toEqual(['value', 'value', 'value', 'check']);
    expect(groupOf('extra-buy').rows.map(idOf)).toEqual([
      'lc-extra-buy-amount',
      'lc-extra-buy-min-qty',
      'lc-extra-buy-max-qty',
      'lc-extra-buy-burst-release',
    ]);
    expect(groupOf('post-buy').rows.map((r) => r.kind)).toEqual(['value', 'value', 'note', 'value', 'value', 'derived']);
    expect(groupOf('post-buy').rows.map(idOf)).toEqual([
      'lc-post-buy-amount',
      'lc-post-buy-reentry',
      null,
      'lc-post-buy-floor-qty',
      'lc-post-buy-rebound',
      null,
    ]);
  });

  it('매도주문 행 = 주문가격 · 비교가격 · 매도비율 · 매수잔량 · 잔량추적 % · 체결 · (조건부) 기준선 · 매수취소 = 매수잔량 · 체결 · 잔량추적 (quick-261001-gjk)', () => {
    expect(groupOf('sell').rows.map((r) => r.kind)).toEqual([
      'value',
      'value',
      'value',
      'value',
      'checkValue',
      'checkValue',
      'derived',
    ]);
    expect(groupOf('sell').rows.map(idOf)).toEqual([
      'lc-sell-order-price',
      'lc-sell-watch-price',
      'lc-sell-order-ratio',
      'lc-sell-watch-qty',
      'lc-sell-qty-track-ratio',
      'lc-sell-min-trade-qty',
      null,
    ]);
    expect(groupOf('cancel').rows.map((r) => r.kind)).toEqual(['value', 'check', 'check']);
    expect(groupOf('cancel').rows.map(idOf)).toEqual([
      'lc-cancel-watch-qty',
      'lc-cancel-trade',
      'lc-cancel-qty-track',
    ]);
  });

  it('옛 입력 id 를 그대로 보존하고 새 id 를 더한다 — e2e `data-lc-field` · 인라인 입력 id 가 이 값이다', () => {
    const ids: Record<string, string> = {};
    for (const g of [...LC_BUY_GROUPS, ...LC_SELL_GROUPS]) {
      for (const r of g.rows) {
        if (r.kind === 'value' || r.kind === 'checkValue' || r.kind === 'choice') ids[r.field] = r.id;
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
      sweepEnabled: 'lc-sweep',
      sweepMinTickCount: 'lc-sweep-tick',
      sweepWatchPrice: 'lc-sweep-watch-price',
      extraBuyOrderAmount: 'lc-extra-buy-amount',
      extraBuyMinQty: 'lc-extra-buy-min-qty',
      extraBuyMaxQty: 'lc-extra-buy-max-qty',
      extraBuyBurstRelease: 'lc-extra-buy-burst-release',
      postBuyOrderAmount: 'lc-post-buy-amount',
      postBuyReentry: 'lc-post-buy-reentry',
      postBuyFloorQty: 'lc-post-buy-floor-qty',
      postBuyReboundPct: 'lc-post-buy-rebound',
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
      autoSellStartCond: 'lc-auto-sell-start-cond',
      autoSellRatioPct: 'lc-auto-sell-ratio',
      autoSellMethod: 'lc-auto-sell-method',
    });
  });

  it('라벨 · 단위 · 시트 설명이 UI-SPEC 카피 표 원문이다 (D-09 개명)', () => {
    const spec = (id: string) => lcRowById(id)!.row as Extract<LcRowSpec, { kind: 'value' | 'checkValue' }>;
    expect([spec('lc-buy-order-price').label, spec('lc-buy-order-price').unit, spec('lc-buy-order-price').desc]).toEqual([
      '주문가격',
      '원',
      '세 매수가 같이 쓰는 매수 주문 가격이에요',
    ]);
    expect(spec('lc-buy-watch-price').desc).toBe('세 매수가 같이 지켜보는 가격(상한가)이에요');
    expect([spec('lc-buy-order-amount').unit, spec('lc-buy-order-amount').desc]).toEqual(['만원', '선매수 한 번에 넣을 금액이에요']);
    expect(spec('lc-buy-watch-qty').desc).toBe('비교가격의 매도잔량이 이 값 이하로 줄면 선매수를 넣어요');
    expect(spec('lc-sweep-tick').desc).toBe('호가가 이만큼 바뀌면 한 번에 체결해요');
    expect(spec('lc-extra-buy-max-qty').desc).toBe('상한가 매수잔량이 이 값을 넘으면 포기해요 · 0 = 무제한');
    expect(spec('lc-post-buy-reentry').desc).toBe(
      '최초 포함 총 진입 횟수예요 · 후매수와 추가매수 자동이 같이 써요 · 0 = 사지 않아요 · 껐다 켜면 이 값부터 다시 세요',
    );
    expect([spec('lc-post-buy-reentry').unit, spec('lc-post-buy-rebound').unit]).toEqual(['회', '%']);
    expect([spec('lc-sell-order-ratio').unit, spec('lc-sell-order-ratio').desc]).toEqual([
      '%',
      '보유 수량 중 매도할 비율이에요',
    ]);
    expect([spec('lc-sell-qty-track-ratio').label, spec('lc-sell-qty-track-ratio').unit]).toEqual(['잔량추적', '%']);
    expect(spec('lc-sell-watch-qty').desc).toBe('비교가격의 매수잔량이 이 값보다 줄면 매도를 넣어요');
    expect(spec('lc-sell-min-trade-qty').desc).toBe('체결이 이 값 이상이면 매도를 넣어요');
    expect(spec('lc-cancel-watch-qty').desc).toBe('매도 비교가격의 매수잔량이 이 값보다 적으면 매수 주문을 취소해요');
  });

  it('스위치 이름 7개(「한방체결 켜기」 없음 · Phase 27 「자동매도 켜기」) · 매수취소 스위치 = cancelQtyEnabled', () => {
    expect(LC_SWITCH_LABEL).toEqual({
      buyEnabled: '매수주문 켜기',
      preBuyEnabled: '선매수 켜기',
      extraBuyEnabled: '추가매수 켜기',
      postBuyEnabled: '후매수 켜기',
      sellEnabled: '매도주문 켜기',
      cancelQtyEnabled: '매수취소 켜기',
      autoSellEnabled: '자동매도 켜기',
    });
    expect(groupOf('cancel').gate).toBe('cancelQtyEnabled');
    expect(groupOf('cancel').title).toBe('매수취소');
    expect(groupOf('sell').title).toBe('매도주문');
    expect(groupOf('sell').gate).toBe('sellEnabled');
  });

  it('lcNavigableRows 는 값 편집 행만 — 체크 전용 · 기준선 · 발동잔량 · 소진 안내는 건너뛴다 (R4)', () => {
    expect(lcNavigableRows('buy').map((r) => r.field)).toEqual(['buyOrderPrice', 'buyWatchPrice']);
    expect(lcNavigableRows('pre-buy').map((r) => r.id)).toEqual([
      'lc-buy-order-amount',
      'lc-buy-watch-qty',
      'lc-buy-min-trade-qty',
      'lc-sweep-tick',
      'lc-sweep-watch-price',
    ]);
    expect(lcNavigableRows('post-buy').map((r) => r.id)).toEqual([
      'lc-post-buy-amount',
      'lc-post-buy-reentry',
      'lc-post-buy-floor-qty',
      'lc-post-buy-rebound',
    ]);
    expect(lcNavigableRows('cancel')).toEqual([{ field: 'cancelWatchQty', id: 'lc-cancel-watch-qty' }]);
    expect(lcNavigableRows('sell').map((r) => r.id)).toEqual([
      'lc-sell-order-price',
      'lc-sell-watch-price',
      'lc-sell-order-ratio',
      'lc-sell-watch-qty',
      'lc-sell-qty-track-ratio',
      'lc-sell-min-trade-qty',
    ]);
  });

  it('lcRowById 는 값 id 와 체크 id 둘 다로 그룹을 찾고 모르는 id 는 null', () => {
    expect(lcRowById('lc-buy-trade')!.group.slot).toBe('pre-buy');
    expect(lcRowById('lc-sweep')!.group.slot).toBe('pre-buy');
    expect(lcRowById('lc-buy-min-trade-qty')!.row.kind).toBe('checkValue');
    expect(lcRowById('lc-cancel-qty-track')!.group.slot).toBe('cancel');
    expect(lcRowById('lc-nope')).toBeNull();
  });
});

describe('②-auto GroupHeaderCheck · 제목줄 체크 슬롯 (quick-260929-vzy D-05)', () => {
  it('후매수 · 추가매수 스펙이 제목줄 체크 「자동」 을 싣는다 — 다른 그룹은 없다 (quick-261011-0yb 추가매수 합류)', () => {
    expect(groupOf('post-buy').headerCheck).toMatchObject({
      field: 'postBuyAuto',
      checkId: 'lc-post-buy-auto',
      label: '자동',
      ariaLabel: '후매수 자동',
    });
    expect(groupOf('extra-buy').headerCheck).toMatchObject({
      field: 'extraBuyAuto',
      checkId: 'lc-extra-buy-auto',
      label: '자동',
      ariaLabel: '추가매수 자동',
    });
    for (const g of [...LC_BUY_GROUPS, ...LC_SELL_GROUPS]) {
      if (g.slot !== 'post-buy' && g.slot !== 'extra-buy') expect(g.headerCheck).toBeUndefined();
    }
  });

  it('role checkbox · aria-checked · 이름 「후매수 자동」 · 누르면 onToggle · disabled 면 부르지 않는다', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <GroupHeaderCheck id="lc-post-buy-auto" label="자동" ariaLabel="후매수 자동" hint="h" checked={false} onToggle={onToggle} />,
    );
    const box = screen.getByRole('checkbox', { name: '후매수 자동' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box).toHaveTextContent('자동');
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <GroupHeaderCheck id="lc-post-buy-auto" label="자동" ariaLabel="후매수 자동" hint="h" checked disabled onToggle={onToggle} />,
    );
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('SettingGroup 제목줄 — headerCheck 는 switchNode 바로 앞 · 스위치가 마지막 자식', () => {
    const { container } = render(
      <SettingGroup
        spec={groupOf('post-buy')}
        on={false}
        headerCheck={<span data-testid="hc" />}
        switchNode={<span data-testid="sw" />}
      >
        <div>행</div>
      </SettingGroup>,
    );
    const header = container.querySelector('[data-slot="lc-group-header"]') as HTMLElement;
    expect(header.lastElementChild).toBe(screen.getByTestId('sw'));
    expect(screen.getByTestId('hc').nextElementSibling).toBe(screen.getByTestId('sw'));
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
    expect(section.getAttribute('title')).toBe(groupOf('buy').hint ?? null);
  });

  it('모든 그룹 카드(매수 4 + 매도 3)는 제목줄이 있고 section 에 aria-label 이 없으며 상단 패딩이 pt-2.5 다 — 헤더 없는 카드 재발 방지 (quick-261001-gjk · Phase 27)', () => {
    const groups = [...LC_BUY_GROUPS, ...LC_SELL_GROUPS];
    expect(groups).toHaveLength(7);
    for (const g of groups) {
      const { container, unmount } = render(
        <SettingGroup spec={g}>
          <div>행</div>
        </SettingGroup>,
      );
      const section = container.querySelector('section') as HTMLElement;
      const header = section.querySelector('[data-slot="lc-group-header"]');
      expect(header, g.slot).not.toBeNull();
      expect(header).toHaveTextContent(g.title);
      expect(section.hasAttribute('aria-label'), g.slot).toBe(false);
      const tokens = section.className.split(/\s+/);
      expect(tokens, g.slot).toContain('pt-2.5');
      expect(tokens, g.slot).not.toContain('pt-1');
      unmount();
    }
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
    const status = flow.querySelector('[data-slot="lc-group-status"]') as HTMLElement;
    expect(status.textContent).toBe('발주 완료 · 무장 해제');
    expect(status.className).toContain('text-[12px]');
    // 24-08 — 상태는 한 덩어리(inline-block)로 둘째 줄에 내려가고, 길면 「 · 」 조각 경계에서만 줄바꿈한다
    // (구분점은 앞 조각에 붙는다 · 조각 안 nowrap). 폰 밴드 실측은 e2e P24-7.
    expect(status.className).toContain('inline-block');
    expect(status.className).toContain('max-w-full');
    const pieces = Array.from(status.children) as HTMLElement[];
    expect(pieces.map((p) => p.textContent)).toEqual(['발주 완료 ·', '무장 해제']);
    for (const p of pieces) expect(p.className).toContain('whitespace-nowrap');
    expect(header.innerHTML).not.toMatch(/truncate|text-ellipsis/);
  });

  it('상태 「감시 중」은 `--led-armed` 이고 그 밖은 `--muted-fg` 다', () => {
    const { container, rerender } = render(
      <SettingGroup spec={groupOf('buy')} statusText="감시 중" on>
        <div />
      </SettingGroup>,
    );
    const status = () => container.querySelector('[data-slot="lc-group-status"]') as HTMLElement;
    expect(status()).toHaveTextContent('감시 중');
    expect(status().className).toContain('text-[var(--led-armed)]');
    rerender(
      <SettingGroup spec={groupOf('buy')} statusText="무장 · 대기" on>
        <div />
      </SettingGroup>,
    );
    expect(status()).toHaveTextContent('무장 · 대기');
    expect(status().className).toContain('text-[var(--muted-fg)]');
    expect(status().className).not.toContain('--led-armed');
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
    render(<GroupSwitch label="선매수 켜기" checked={false} onCheckedChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: '선매수 켜기' });
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

  it('폭 백스톱 L3 — 값 쉐브런은 폰 밴드(<685)에서 숨고 ≥685 에서만 선다(상따 설정 전체 한 규칙 · Phase 24 E1 overflow)', () => {
    const { container } = renderAll();
    const chevs = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="lc-row-chevron"]'));
    expect(chevs.length).toBeGreaterThan(0);
    for (const c of chevs) {
      const tokens = c.className.split(/\s+/);
      expect(tokens).toContain('hidden');
      expect(tokens).toContain('@min-[685px]/lc:inline');
      expect(c.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('소스 가드 — 스위치는 radix-ui primitive 를 직접 쓰고 `ui/switch` 를 쓰지 않는다', () => {
    const src = readFileSync(path.resolve(__dirname, '../setting-group.tsx'), 'utf8');
    expect(src).toMatch(/from 'radix-ui'/);
    expect(src).not.toMatch(/from '@\/components\/ui\/switch'/);
  });
});

/*
  ⑦ 20-07 a11y — ≥685 두 열에서 매수·매도 쪽 값 버튼이 같은 이름을 가질 수 있다(「비교가격 127,400원」 ·
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
          <SettingRow id="lc-sell-order-price" label="주문가격" unit="원" value={127_400} editing={false} onActivate={() => {}} />
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

  it('체크 버튼(이름에 그룹이 이미 있다)은 설명을 달지 않는다 · 매도주문 카드 안 주문가격 행은 카드 설명을 단다 (quick-261001-gjk)', () => {
    renderTwoColumns();
    expect(screen.getByRole('checkbox', { name: '매수주문 체결' })).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: '주문가격 127,400원' })).toHaveAccessibleDescription('매도주문 감시 중');
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

  it('sr 있는 kv 만 값 앞에 sr-only 접두 · 값은 `--muted-fg` — sr 없는 kv 는 종전 마크업 (quick-261002-fim)', () => {
    const { container } = render(
      <GroupSummary
        items={[
          { key: '반등', value: '30%', off: false },
          { key: '발동잔량', value: '264,000주', off: true, sr: POST_BUY_UNLOCK_SR_TEXT },
        ]}
      />,
    );
    const kvs = Array.from(container.querySelector('[data-slot="lc-group-summary"]')!.children) as HTMLElement[];
    // sr 없는 kv — 키 · 값 두 칸 그대로 · sr-only 0개.
    expect(kvs[0].children).toHaveLength(2);
    expect(kvs[0].querySelectorAll('.sr-only')).toHaveLength(0);
    // sr 있는 kv — 키 · sr-only 접두 · 값.
    const [key, sr, val] = Array.from(kvs[1].children) as HTMLElement[];
    expect(key.textContent).toBe('발동잔량');
    expect(sr.className).toContain('sr-only');
    expect(sr.textContent!.trim()).toBe('잠금 해제선');
    expect(val.textContent).toBe('264,000주');
    expect(val.className).toContain('text-[var(--muted-fg)]');
    expect(kvs[1].querySelectorAll('.sr-only')).toHaveLength(1);
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
    ['구서버 전략 · 끄기만 가능', 'text-[var(--destructive)]'],
    ['꺼짐', 'text-[var(--muted-fg)]'],
    ['소진', 'text-[var(--muted-fg)]'],
    ['켜짐 · 켠 매수 없음', 'text-[var(--muted-fg)]'],
    ['무장 · 대기 · 후매수 발동', 'text-[var(--muted-fg)]'],
  ])('%s → %s', (text, cls) => {
    expect(groupStatusClassOf(text)).toBe(cls);
  });

  it('헤더와 접기 버튼이 같은 판정을 쓴다 — 「보유중」 상태 span 이 `--led-latent`', () => {
    const { container } = render(
      <SettingGroup spec={groupOf('buy')} statusText="보유중" on fold={{ expanded: false, onToggle: () => {}, summary: null }}>
        <div />
      </SettingGroup>,
    );
    const status = container.querySelector('[data-slot="lc-group-status"]') as HTMLElement;
    expect(status).toHaveTextContent('보유중');
    expect(status.className).toContain('text-[var(--led-latent)]');
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

  it('DerivedRow 값 0 · mutedValue 264,000 → 해제선 「264,000주」 `--muted-fg` + sr-only 「잠금 해제선」 (quick-261002-fim)', () => {
    const { container } = render(
      <DerivedRow
        slot="lc-post-buy-trigger"
        label="발동잔량"
        value={0}
        unit="주"
        emphasis
        valueText="—"
        srText="없음"
        mutedValue={264_000}
        mutedSrText={POST_BUY_UNLOCK_SR_TEXT}
      />,
    );
    const row = container.querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    const v = within(row).getByText('264,000주');
    expect(v.className).toContain('text-[var(--muted-fg)]');
    expect(v.className).not.toContain('--up');
    expect(v.className).not.toContain('font-semibold');
    expect(v).toHaveAttribute('data-muted-value', 'true');
    expect(v).not.toHaveAttribute('aria-hidden');
    expect((row.querySelector('.sr-only') as HTMLElement).textContent!.trim()).toBe('잠금 해제선');
    expect(within(row).queryByText('—')).toBeNull();
  });

  it('DerivedRow 값 330,000 · mutedValue 264,000 → 값 우선(`--up`) · 해제선 · sr-only 없음 (quick-261002-fim)', () => {
    const { container } = render(
      <DerivedRow
        slot="lc-post-buy-trigger"
        label="발동잔량"
        value={330_000}
        unit="주"
        emphasis
        valueText="—"
        srText="없음"
        mutedValue={264_000}
        mutedSrText={POST_BUY_UNLOCK_SR_TEXT}
      />,
    );
    const row = container.querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    expect(within(row).getByText('330,000주').className).toContain('text-[var(--up)]');
    expect(within(row).queryByText('264,000주')).toBeNull();
    expect(row.querySelector('.sr-only')).toBeNull();
  });

  it('DerivedRow 값 0 · mutedValue 0 → 종전 「—」 + sr-only 「없음」 (quick-261002-fim)', () => {
    const { container } = render(
      <DerivedRow
        slot="lc-post-buy-trigger"
        label="발동잔량"
        value={0}
        unit="주"
        emphasis
        valueText="—"
        srText="없음"
        mutedValue={0}
        mutedSrText={POST_BUY_UNLOCK_SR_TEXT}
      />,
    );
    const row = container.querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    expect(within(row).getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect((row.querySelector('.sr-only') as HTMLElement).textContent).toBe('없음');
    expect(row.querySelector('[data-muted-value]')).toBeNull();
  });

  it('DerivedRow 기본(emphasis 없음)은 기존 기준선 행 그대로 — slot lc-derived', () => {
    const { container } = render(<DerivedRow label="잔량추적 기준선" value={100_000} unit="주" />);
    expect(container.querySelector('[data-slot="lc-derived"]')!.textContent).toBe('잔량추적 기준선100,000주');
  });

  it('formatSettingValue(3, 회) → 「3회」', () => {
    expect(formatSettingValue(3, '회')).toBe('3회');
  });
});

describe('Phase 27 자동매도 — ChoiceRow · DerivedRow 표시 · 요약 hot · footer · 칩 색 (D-02 · D-03 · D-05)', () => {
  const OPTIONS = [
    { value: 3, label: '양쪽' },
    { value: 1, label: '매도1호가' },
    { value: 2, label: '매수1호가' },
  ] as const;

  describe('ChoiceRow 데스크톱(주 포인터 fine)', () => {
    beforeEach(() => mockPointer(false));
    afterEach(restoreMatchMedia);

    it('radiogroup 「자동매도 방법」 · 3 버튼 순서 · 값만 aria-checked · 다른 버튼 클릭 = onSelect 1회 · 같은 버튼은 0', () => {
      const onSelect = vi.fn();
      render(<ChoiceRow id="lc-auto-sell-method" label="방법" value={3} options={OPTIONS} a11yName="자동매도 방법" onSelect={onSelect} />);
      const group = screen.getByRole('radiogroup', { name: '자동매도 방법' });
      const radios = within(group).getAllByRole('radio');
      expect(radios.map((r) => r.textContent)).toEqual(['양쪽', '매도1호가', '매수1호가']);
      expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
      fireEvent.click(radios[0]!);
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.click(radios[2]!);
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(2);
      // 낙관 반영 없음 — 선택 표시는 value 만 따른다.
      expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    });

    it('폭 백스톱 — 세그먼트 행은 카드 ≥992(데스크톱 밴드)에서만 · 그 아래는 「라벨 ─ 값 ›」 행(시트) · 새 경계 숫자 0', () => {
      const { container } = render(
        <ChoiceRow id="lc-auto-sell-method" label="방법" value={3} options={OPTIONS} a11yName="자동매도 방법" onSelect={() => {}} />,
      );
      const [rowBtn, segRow] = Array.from(container.querySelectorAll<HTMLElement>('[data-lc-field="lc-auto-sell-method"]'));
      expect(rowBtn!.tagName).toBe('BUTTON');
      expect(rowBtn!.className.split(/\s+/)).toContain('@min-[992px]/lc:hidden');
      expect(rowBtn).toHaveAttribute('aria-haspopup', 'dialog');
      expect(segRow!.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', '@min-[992px]/lc:flex']));
      expect(segRow!.querySelector('[role="radiogroup"]')).not.toBeNull();
    });

    it('행 상자 44px · 세그먼트 26px · 선택 면은 기존 세그먼트 토큰(--seg-on-*) · 값 0 이면 선택 없음', () => {
      const { container } = render(
        <ChoiceRow id="lc-auto-sell-method" label="방법" value={0} options={OPTIONS} a11yName="자동매도 방법" onSelect={() => {}} />,
      );
      const rowEl = container.querySelector('[data-lc-field="lc-auto-sell-method"]') as HTMLElement;
      expect(rowEl.className).toContain('min-h-[44px]');
      const radios = screen.getAllByRole('radio');
      expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
      for (const r of radios) expect(r.className).toContain('h-[26px]');
      const { container: c2 } = render(
        <ChoiceRow id="x" label="방법" value={1} options={OPTIONS} a11yName="방법 기본값" onSelect={() => {}} />,
      );
      const on = within(c2).getByRole('radio', { checked: true });
      expect(on.textContent).toBe('매도1호가');
      expect(on.className).toContain('bg-[var(--seg-on-bg)]');
    });

    it('화살표는 포커스만 옮긴다(선택 = 전송이라 화살표로 보내지 않는다)', () => {
      const onSelect = vi.fn();
      render(<ChoiceRow id="m" label="방법" value={3} options={OPTIONS} a11yName="자동매도 방법" onSelect={onSelect} />);
      const radios = screen.getAllByRole('radio');
      radios[0]!.focus();
      fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' });
      expect(radios[1]).toHaveFocus();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('ChoiceRow 폰(주 포인터 coarse)', () => {
    beforeEach(() => mockPointer(true));
    afterEach(restoreMatchMedia);

    it('「방법 ─ 양쪽」 값 행 → 시트(제목 · 설명 · 3옵션) · 고르면 onSelect 1회 + 닫힘', async () => {
      const onSelect = vi.fn();
      render(
        <ChoiceRow
          id="lc-auto-sell-method"
          label="방법"
          value={3}
          options={OPTIONS}
          a11yName="자동매도 방법"
          sheetTitle="자동매도 방법"
          description="주기마다 낼 매도의 호가 쪽이에요 · 다음 주기부터 적용"
          onSelect={onSelect}
        />,
      );
      const rowBtn = screen.getByRole('button', { name: '자동매도 방법 양쪽' });
      expect(rowBtn).toHaveAttribute('aria-haspopup', 'dialog');
      fireEvent.click(rowBtn);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('주기마다 낼 매도의 호가 쪽이에요 · 다음 주기부터 적용')).toBeInTheDocument();
      const opts = within(dialog).getAllByRole('radio');
      expect(opts.map((o) => o.textContent)).toEqual(['양쪽', '매도1호가', '매수1호가']);
      fireEvent.click(opts[2]!);
      expect(onSelect).toHaveBeenCalledWith(2);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });

  it('DerivedRow display — 「기준 상한가 13,000원」 · 값 0 이면 「—」(sr 「없음」) · 누적 emphasis 는 --up', () => {
    const { container, rerender } = render(
      <DerivedRow label="기준" value={13_000} unit="원" display="상한가 13,000원" valueText="—" srText="없음" slot="b" />,
    );
    expect(container.querySelector('[data-slot="b"]')!.textContent).toBe('기준상한가 13,000원');
    rerender(<DerivedRow label="기준" value={0} unit="원" display="—" valueText="—" srText="없음" slot="b" />);
    expect(container.querySelector('[data-slot="b"]')!.textContent).toBe('기준—없음');
    rerender(<DerivedRow label="누적 매도" value={6000} unit="주" emphasis valueText="—" slot="s" />);
    const v = container.querySelector('[data-slot="s"] .text-\\[var\\(--up\\)\\]');
    expect(v?.textContent).toBe('6,000주');
  });

  it('GroupSummary hot kv 는 값 글자만 --up', () => {
    const { container } = render(
      <GroupSummary
        items={[
          { key: '누적', value: '6,000주', off: false, hot: true },
          { key: '기준', value: '—', off: true },
        ]}
      />,
    );
    const hot = container.querySelector('[data-hot="true"]') as HTMLElement;
    expect(hot.textContent).toBe('6,000주');
    expect(hot.className).toContain('text-[var(--up)]');
  });

  it('SettingGroup footer — 펼친 본문 마지막 행 뒤에만 · 접힘이면 렌더하지 않는다', () => {
    const spec = groupOf('auto-sell');
    const view = (expanded: boolean) => (
      <SettingGroup
        spec={spec}
        fold={{ expanded, onToggle: () => {}, summary: <div>요약</div> }}
        footer={<button type="button">바로시작</button>}
      >
        <div data-testid="last-row">행</div>
      </SettingGroup>
    );
    const { container, rerender } = render(view(false));
    expect(container.querySelector('[data-slot="lc-group-footer"]')).toBeNull();
    rerender(view(true));
    const footer = container.querySelector('[data-slot="lc-group-footer"]') as HTMLElement;
    expect(footer).not.toBeNull();
    expect(screen.getByTestId('last-row').nextElementSibling).toBe(footer);
  });

  it('제목줄 칩 — 「매도중」 초록 · 「완료」 주황 (D-03 개정 · 새 토큰 0)', () => {
    const { container, rerender } = render(
      <SettingGroup spec={groupOf('auto-sell')} statusText="매도중">
        <div>행</div>
      </SettingGroup>,
    );
    const status = () => container.querySelector('[data-slot="lc-group-status"]') as HTMLElement;
    expect(status().className).toContain('text-[var(--led-armed)]');
    rerender(
      <SettingGroup spec={groupOf('auto-sell')} statusText="완료">
        <div>행</div>
      </SettingGroup>,
    );
    expect(status().className).toContain('text-[var(--led-latent)]');
  });

  it('소스 가드 — ChoiceRow 는 값 행과 같은 판정(useEditMode)을 쓰고 새 미디어 질의를 두지 않는다', () => {
    const src = readFileSync(path.resolve(__dirname, '../setting-group.tsx'), 'utf8');
    expect(src).toMatch(/useEditMode\(\)/);
    expect(src).not.toMatch(/matchMedia/);
    expect(src).toMatch(/export function ChoiceRow/);
  });
});
