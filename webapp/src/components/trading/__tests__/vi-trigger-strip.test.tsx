import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayViOrderItem } from '@gh-radar/shared';

/**
 * Phase 18 Plan 05 Task 2 — VI 발동 스트립 + 「더보기」 표 (TRADE-08 · D-06 · UI-SPEC E3).
 *
 * 여기서 잠그는 것:
 *   ① 접힌 줄 = 「VI」 + 「미확인 M」 필 + 칩 가로 스크롤 + 「더보기」 (개수는 칩이 말한다)
 *   ①' 한 패널 — settings 슬롯은 `hidden` 토글(마운트 유지) · alert 슬롯은 접혀도 보인다
 *   ② 확인 체크는 **표에서만** — 칩 영역에는 체크박스가 없다
 *   ③ 확인 활성 판정은 기존 `isConfirmable` 하나다(주문번호 有 ∧ !confirm_locked)
 *   ④ 체크 즉시 잠기고 `vi.confirm` 1회 · 더티 바 없음
 *   ⑤ 미확인(`Accepted ∧ !confirmed`) 칩·행은 `--new-bg` + 텍스트로 말한다
 *   ⑥ 받은 배열 순서를 그대로 쓴다(정렬은 리듀서 한 곳 — 컴포넌트 재정렬 0회)
 *   ⑦ 110초 진행바는 바 + `{N}s` 숫자
 */

const sendMock = vi.fn();

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }),
  };
});

import { ViTriggerStrip, VI_STRIP_EMPTY_TEXT } from '../workbench/vi-trigger-strip';
import { VI_CONFIRM_SEND_FAILED_TEXT } from '../vi-order-list';

const ACCOUNT = '37728502101';
const NOW = Date.UTC(2026, 8, 22, 0, 41, 31);

function item(over: Partial<RelayViOrderItem> = {}): RelayViOrderItem {
  return {
    isin: 'KR7096530001',
    exchange: 'KRX',
    market: 'Q',
    accountNo: ACCOUNT,
    orderNo: '3407000071',
    orderQty: 256,
    orderPrice: 38_950,
    triggerPrice: 38_550,
    basePrice: 30_000,
    viEndTime: '094331000',
    deadline110Ms: NOW + 84_000,
    deadline119Ms: NOW + 93_000,
    confirmed: false,
    confirmLocked: false,
    state: 'Accepted',
    filledQty: 0,
    name: '씨젠',
    ...over,
  };
}

function renderStrip(items: RelayViOrderItem[]) {
  return render(<ViTriggerStrip items={items} nowMs={NOW} />);
}

const strip = () => document.querySelector('[data-slot="vi-trigger-strip"]') as HTMLElement;
const chips = () => document.querySelector('[data-slot="vi-chips"]') as HTMLElement;
const tableBlock = () => document.querySelector('[data-slot="vi-trigger-table"]') as HTMLElement | null;
const openTable = () => fireEvent.click(within(strip()).getByRole('button', { name: '더보기' }));
const bodyRows = () =>
  Array.from(tableBlock()!.querySelectorAll('tbody tr[data-slot="vi-order-row"]')) as HTMLElement[];

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockReturnValue(true);
});

describe('E3 empty · loading — 0건', () => {
  it('라벨 「VI」 + 빈 문구 · 「미확인」 필 없음 · 스피너/스켈레톤 없음', () => {
    renderStrip([]);
    expect(within(strip()).getByTestId('vi-strip-label').textContent).toBe('VI');
    expect(within(strip()).getByText(VI_STRIP_EMPTY_TEXT)).toBeInTheDocument();
    expect(VI_STRIP_EMPTY_TEXT).toBe('오늘 발동된 VI 주문이 없어요');
    expect(strip().querySelector('[data-slot="vi-unconfirmed-pill"]')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[data-slot="vi-order-skeleton"]')).toBeNull();
  });

  it('0건 펼침 → 표도 빈 문구도 그리지 않는다(스트립 줄이 이미 말한다) · aria-controls 대상은 존재한다', () => {
    renderStrip([]);
    openTable();
    expect(tableBlock()).toBeNull();
    expect(document.querySelector('[data-slot="vi-order-table"]')).toBeNull();
    expect(document.querySelector('[data-slot="vi-order-empty"]')).toBeNull();
    expect(screen.getAllByText('오늘 발동된 VI 주문이 없어요')).toHaveLength(1);
    const controls = within(strip()).getByRole('button', { name: '접기' }).getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).not.toBeNull();
  });
});

describe('E3 populated — 칩 · 미확인', () => {
  it('미확인 1건 → 「미확인 1」 필 · 그 칩 배경 `--new-bg` · 확인된 칩은 강조 없음', () => {
    renderStrip([
      item(),
      item({ orderNo: '3407000070', name: '알테오젠', state: 'Filled', filledQty: 256, confirmed: true, confirmLocked: true }),
    ]);
    expect(within(strip()).getByTestId('vi-strip-label').textContent).toBe('VI');
    expect(chips().querySelectorAll('[data-slot="vi-chip"]')).toHaveLength(2);
    expect(within(strip()).getByText('미확인 1')).toBeInTheDocument();
    const [first, second] = Array.from(chips().querySelectorAll('[data-slot="vi-chip"]')) as HTMLElement[];
    expect(first.className).toContain('bg-[var(--new-bg)]');
    expect(first).toHaveAttribute('data-unconfirmed', 'true');
    expect(second.className).not.toContain('bg-[var(--new-bg)]');
  });

  it('칩 = 종목명 · 발동가 · 전일대비 · 시각 · 상태 배지. 줄바꿈 없는 가로 스크롤', () => {
    renderStrip([item()]);
    const chip = chips().querySelector('[data-slot="vi-chip"]') as HTMLElement;
    const c = within(chip);
    expect(c.getByText('씨젠')).toBeInTheDocument();
    expect(c.getByText('38,550')).toBeInTheDocument();
    expect(c.getByText('+28.5%')).toBeInTheDocument();
    expect(c.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
    expect(c.getByText('접수')).toBeInTheDocument();
    expect(chips().className).toContain('overflow-x-auto');
    expect(chips().className).toContain('flex-nowrap');
  });

  it('★ 확인 체크박스는 칩 영역에 없다 — 표에서만', () => {
    renderStrip([item()]);
    expect(within(strip()).queryAllByRole('checkbox')).toHaveLength(0);
    openTable();
    expect(within(tableBlock()!).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(strip()).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('「더보기」 → 머리줄·요약·설명문 없이 표만 선다 · 스트립 「접기」 하나로 닫힌다', () => {
    renderStrip([item(), item({ orderNo: '3407000070', confirmed: true })]);
    expect(tableBlock()).toBeNull();
    const more = within(strip()).getByRole('button', { name: '더보기' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    const block = tableBlock()!;
    expect(block.querySelector('[data-slot="vi-order-table"]')).not.toBeNull();
    const t = within(block);
    expect(t.queryByText('VI 발동 주문')).toBeNull();
    expect(block.textContent).not.toContain('양 거래소 한 목록');
    expect(block.textContent).not.toContain('ConfirmVIOrderReq');
    expect(t.queryByRole('button', { name: /접기/ })).toBeNull();
    // 체크박스 이름은 남는다 — 체크가 무엇을 면제하는지 말하는 유일한 자리다.
    expect(t.getAllByRole('checkbox', { name: '씨젠 주문 확인 — 119초 미확인 취소 면제' }).length).toBeGreaterThan(0);
    const fold = within(strip()).getByRole('button', { name: '접기' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(fold);
    expect(tableBlock()).toBeNull();
  });

  it('펼침 상태를 기억한다 — 다시 마운트하면 펼친 채다 (quick-260923-lyt)', () => {
    const first = renderStrip([item()]);
    openTable();
    expect(tableBlock()).not.toBeNull();
    first.unmount();
    renderStrip([item()]);
    expect(tableBlock()).not.toBeNull();
  });
});

describe('확인 체크 (D-06 · isConfirmable)', () => {
  it('체크 가능한 행을 체크 → `vi.confirm` 1회 · 즉시 잠김 · 더티 바 없음', () => {
    renderStrip([item()]);
    openTable();
    const box = within(tableBlock()!).getByRole('checkbox', {
      name: '씨젠 주문 확인 — 119초 미확인 취소 면제',
    });
    expect(box).not.toBeDisabled();
    fireEvent.click(box);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toEqual({ t: 'vi.confirm', orderNo: '3407000071', confirmed: true });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
    expect(screen.queryByText(/미반영/)).toBeNull();
  });

  it('주문번호 없는 행 → disabled + title + aria-describedby 로 사유가 연결된다', () => {
    renderStrip([item({ orderNo: '', state: 'Pending' })]);
    openTable();
    const box = within(tableBlock()!).getByRole('checkbox');
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('title', '접수 전(주문번호 없음)은 확인할 수 없어요');
    const id = box.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toHaveTextContent('접수 전(주문번호 없음)은 확인할 수 없어요');
  });

  it('confirmLocked 행 → disabled + title 「서버가 잠근 확인(confirm_locked)」', () => {
    renderStrip([item({ confirmLocked: true })]);
    openTable();
    const box = within(tableBlock()!).getByRole('checkbox');
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('title', '서버가 잠근 확인(confirm_locked)');
    expect(document.getElementById(box.getAttribute('aria-describedby')!)).toHaveTextContent(
      '서버가 잠근 확인(confirm_locked)',
    );
  });

  it('E3 error — 보내지 못하면 잠그지 않고 그 행 아래 인라인 role=status 로 고지한다', () => {
    sendMock.mockReturnValue(false);
    renderStrip([item(), item({ orderNo: '3407000070', name: '에코프로비엠' })]);
    openTable();
    const box = within(tableBlock()!).getByRole('checkbox', { name: /^씨젠/ });
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(box).not.toBeDisabled();
    const status = within(tableBlock()!).getByRole('status');
    expect(status).toHaveTextContent(VI_CONFIRM_SEND_FAILED_TEXT);
    // 실패한 행 바로 다음 줄이다
    const failRow = status.closest('tr')!;
    expect(failRow.previousElementSibling?.textContent).toContain('씨젠');
  });
});

describe('E3 partial · 배지', () => {
  it('Accepted ∧ filledQty>0 → 「부분체결 {filled}/{qty}」 (칩·표 모두)', () => {
    renderStrip([item({ orderQty: 40, filledQty: 15, name: '레인보우로보틱스' })]);
    expect(within(chips()).getByText('부분체결 15/40')).toBeInTheDocument();
    openTable();
    expect(within(tableBlock()!).getByText('부분체결 15/40')).toBeInTheDocument();
  });
});

describe('E3 ordering — 받은 배열 순서 그대로(정렬은 리듀서 한 곳 — 컴포넌트 재정렬 0회)', () => {
  it('KRX·NXT 가 섞이고 시각이 뒤집혀 있어도 표·칩은 받은 순서다(컴포넌트 재정렬 0회)', () => {
    const items = [
      item({ orderNo: 'A', name: '가', exchange: 'NXT', deadline110Ms: NOW + 10_000 }),
      item({ orderNo: 'B', name: '나', exchange: 'KRX', deadline110Ms: NOW + 90_000 }),
      item({ orderNo: 'C', name: '다', exchange: 'NXT', deadline110Ms: NOW + 90_000 }),
      item({ orderNo: 'D', name: '라', exchange: 'KRX', deadline110Ms: NOW + 50_000 }),
    ];
    const snapshot = items.map((i) => i.orderNo);
    renderStrip(items);
    const chipNames = Array.from(chips().querySelectorAll('[data-slot="vi-chip"] [data-slot="vi-chip-name"]')).map(
      (e) => e.textContent,
    );
    expect(chipNames).toEqual(['가', '나', '다', '라']);
    openTable();
    expect(bodyRows().map((r) => r.querySelector('[data-slot="vi-row-name"]')!.textContent)).toEqual([
      '가',
      '나',
      '다',
      '라',
    ]);
    // 입력 배열을 제자리에서 바꾸지도 않는다
    expect(items.map((i) => i.orderNo)).toEqual(snapshot);
  });

  it('양 거래소가 한 목록이고 행마다 거래소 태그가 있다', () => {
    renderStrip([item({ exchange: 'NXT' }), item({ orderNo: 'X', exchange: 'KRX' })]);
    openTable();
    const tags = bodyRows().map((r) => r.querySelector('[data-slot="exchange-tag"]')!.textContent);
    expect(tags).toEqual(['NXT', 'KRX']);
  });
});

describe('110초 진행바 — 바 + `{N}s`', () => {
  it('Accepted ∧ 잔여>0 행은 progressbar + `84s` 숫자를 함께 그린다 (색만으로 말하지 않는다)', () => {
    renderStrip([item()]);
    openTable();
    const row = bodyRows()[0];
    const bar = within(row).getByRole('progressbar', { name: '110초 자동취소까지 남은 시간' });
    expect(bar).toHaveAttribute('aria-valuenow', '84');
    expect(within(row).getByText('84s')).toBeInTheDocument();
  });

  it('잔여 없는 행은 「—」', () => {
    renderStrip([item({ state: 'Filled', filledQty: 256 })]);
    openTable();
    expect(within(bodyRows()[0]).queryByRole('progressbar')).toBeNull();
  });
});

/* ───────────── Task 3 — E3 나머지 상태 ───────────── */

describe('E3 long-text · 색만으로 말하지 않기', () => {
  const LONG = '아주아주긴종목명을가진가상의바이오테크놀로지홀딩스우선주';

  it('긴 종목명은 칩·셀에서 1줄 ellipsis(truncate) 이고 전체 문자열은 title 에 있다', () => {
    renderStrip([item({ name: LONG })]);
    const chipName = chips().querySelector('[data-slot="vi-chip-name"]') as HTMLElement;
    expect(chipName.className).toContain('truncate');
    expect(chipName).toHaveAttribute('title', LONG);
    openTable();
    const cell = bodyRows()[0].querySelector('[data-slot="vi-row-name"]') as HTMLElement;
    expect(cell.className).toContain('truncate');
    expect(cell).toHaveAttribute('title', LONG);
  });

  it('미확인은 연노랑 **+ 텍스트**(「미확인 N」 필 · 「접수」 배지)로 말한다', () => {
    renderStrip([item()]);
    expect(within(strip()).getByText('미확인 1')).toBeInTheDocument();
    const chip = chips().querySelector('[data-slot="vi-chip"]') as HTMLElement;
    expect(within(chip).getByText('접수')).toBeInTheDocument();
    openTable();
    const row = bodyRows()[0];
    expect(row).toHaveAttribute('data-unconfirmed', 'true');
    expect(row.className).toContain('bg-[var(--new-bg)]');
    expect(within(row).getByText('접수')).toBeInTheDocument();
  });

  it('확인하면 그 행의 미확인 강조가 즉시 빠진다(낙관 반영)', () => {
    renderStrip([item()]);
    openTable();
    fireEvent.click(within(tableBlock()!).getByRole('checkbox'));
    expect(bodyRows()[0]).not.toHaveAttribute('data-unconfirmed');
  });
});

describe('E3 zero-one-many', () => {
  it('1건과 여러 건이 같은 문법이다 — 라벨은 「VI」 그대로, 개수는 칩 수가 말한다', () => {
    const { unmount } = renderStrip([item()]);
    expect(within(strip()).getByTestId('vi-strip-label').textContent).toBe('VI');
    expect(chips().querySelectorAll('[data-slot="vi-chip"]')).toHaveLength(1);
    unmount();
    renderStrip([item(), item({ orderNo: '2' }), item({ orderNo: '3' })]);
    expect(within(strip()).getByTestId('vi-strip-label').textContent).toBe('VI');
    expect(chips().querySelectorAll('[data-slot="vi-chip"]')).toHaveLength(3);
  });
});

describe('세션 가드', () => {
  it('세션이 준비되지 않으면 표의 확인 체크가 전부 잠긴다(isConfirmable 의 disabled 인자)', () => {
    render(<ViTriggerStrip items={[item()]} nowMs={NOW} disabled />);
    openTable();
    expect(within(tableBlock()!).getByRole('checkbox')).toBeDisabled();
  });
});

describe('칩 줄 키보드 접근 (18-13 · WCAG 2.1.1)', () => {
  it('칩 줄은 포커스 받을 것이 없으므로 영역 자체가 탭으로 닿고 이름을 가진다(axe scrollable-region-focusable)', () => {
    render(<ViTriggerStrip items={[]} />);
    const chips = document.querySelector('[data-slot="vi-chips"]') as HTMLElement;
    expect(chips).toHaveAttribute('tabindex', '0');
    expect(chips).toHaveAttribute('role', 'group');
    expect(chips).toHaveAttribute('aria-label', 'VI 발동 종목');
  });
});

describe('한 패널 — settings · alert 슬롯', () => {
  function renderWithSlots(items: RelayViOrderItem[] = []) {
    return render(
      <ViTriggerStrip
        items={items}
        nowMs={NOW}
        settings={
          <div data-testid="settings-probe">
            <label htmlFor="probe-input">상승률</label>
            <input id="probe-input" defaultValue="22" />
          </div>
        }
        alert={
          <p role="alert" data-testid="alert-probe">
            [VI] 거부
          </p>
        }
      />,
    );
  }
  const probe = () => screen.getByTestId('settings-probe');

  it('settings 는 접혀도 DOM 에 있고 hidden 조상 아래다 → 더보기로 드러나고 → 접어도 같은 노드 · 입력값 유지', () => {
    renderWithSlots();
    const node = probe();
    expect(node.closest('[hidden]')).not.toBeNull();
    openTable();
    expect(probe()).toBe(node);
    expect(node.closest('[hidden]')).toBeNull();
    const input = node.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(within(strip()).getByRole('button', { name: '접기' }));
    expect(probe()).toBe(node);
    expect(node.closest('[hidden]')).not.toBeNull();
    fireEvent.click(within(strip()).getByRole('button', { name: '더보기' }));
    expect((probe().querySelector('input') as HTMLInputElement).value).toBe('25');
  });

  it('settings 는 표보다 위다(스트립 줄 → 설정 → 표)', () => {
    renderWithSlots([item()]);
    openTable();
    const settings = probe();
    const table = tableBlock()!;
    expect(strip().compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(settings.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('alert 는 접혀 있어도 보인다(hidden 조상 없음) · 스트립 줄 바로 다음이다', () => {
    renderWithSlots();
    const alert = screen.getByRole('alert');
    expect(alert.closest('[hidden]')).toBeNull();
    expect(strip().nextElementSibling).toBe(alert);
  });
});
