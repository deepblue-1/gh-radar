import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayViOrderItem } from '@gh-radar/shared';

/**
 * Phase 18 Plan 05 Task 2 — VI 발동 스트립 + 「더보기」 표 (TRADE-08 · D-06 · UI-SPEC E3).
 *
 * 여기서 잠그는 것:
 *   ① 접힌 줄 = 「VI N」 + 「미확인 M」 필 + 칩 가로 스크롤 + 「더보기」
 *   ② 확인 체크는 **표에서만** — 칩 영역에는 체크박스가 없다
 *   ③ 확인 활성 판정은 기존 `isConfirmable` 하나다(주문번호 有 ∧ !confirm_locked)
 *   ④ 체크 즉시 잠기고 `vi.confirm` 1회 · 더티 바 없음
 *   ⑤ 미확인(`Accepted ∧ !confirmed`) 칩·행은 `--new-bg` + 텍스트로 말한다
 *   ⑥ relay 배열 순서를 그대로 쓴다(클라 재정렬 0회)
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
import { VI_CONFIRM_SEND_FAILED_TEXT, VI_WORKBENCH_TABLE_CAPTION } from '../vi-order-list';

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
  it('라벨 「VI 0」 유지 + 빈 문구 · 「미확인」 필 없음 · 스피너/스켈레톤 없음', () => {
    renderStrip([]);
    expect(within(strip()).getByTestId('vi-strip-label')).toHaveTextContent(/^VI\s*0$/);
    expect(within(strip()).getByText(VI_STRIP_EMPTY_TEXT)).toBeInTheDocument();
    expect(VI_STRIP_EMPTY_TEXT).toBe('오늘 발동된 VI 주문이 없어요');
    expect(strip().querySelector('[data-slot="vi-unconfirmed-pill"]')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[data-slot="vi-order-skeleton"]')).toBeNull();
  });

  it('「더보기」 표도 같은 빈 문구다', () => {
    renderStrip([]);
    openTable();
    expect(within(tableBlock()!).getByText('오늘 발동된 VI 주문이 없어요')).toBeInTheDocument();
    expect(tableBlock()!.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('E3 populated — 칩 · 미확인', () => {
  it('미확인 1건 → 「미확인 1」 필 · 그 칩 배경 `--new-bg` · 확인된 칩은 강조 없음', () => {
    renderStrip([
      item(),
      item({ orderNo: '3407000070', name: '알테오젠', state: 'Filled', filledQty: 256, confirmed: true, confirmLocked: true }),
    ]);
    expect(within(strip()).getByTestId('vi-strip-label')).toHaveTextContent(/^VI\s*2/);
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

  it('「더보기」 → 헤더 「VI 발동 주문」 + 요약 + 「접기 ▴」 · 캡션 원문 · 접으면 사라진다', () => {
    renderStrip([item(), item({ orderNo: '3407000070', confirmed: true })]);
    expect(tableBlock()).toBeNull();
    const more = within(strip()).getByRole('button', { name: '더보기' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    const t = within(tableBlock()!);
    expect(t.getByText('VI 발동 주문')).toBeInTheDocument();
    expect(t.getByText('VI 2 · 미확인 1 · 양 거래소 한 목록 · 최신 위')).toBeInTheDocument();
    expect(t.getByText(VI_WORKBENCH_TABLE_CAPTION)).toBeInTheDocument();
    expect(within(strip()).getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(t.getByRole('button', { name: '접기 ▴' }));
    expect(tableBlock()).toBeNull();
  });

  it('펼침 상태는 localStorage 에 남기지 않는다', () => {
    const before = window.localStorage.length;
    renderStrip([item()]);
    openTable();
    expect(window.localStorage.length).toBe(before);
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

describe('E3 ordering — relay 배열 순서 그대로', () => {
  it('KRX·NXT 가 섞이고 시각이 뒤집혀 있어도 표·칩은 받은 순서다(재정렬 0회)', () => {
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
  it('1건과 여러 건이 같은 문법이다 — 라벨은 숫자형 「VI {N}」', () => {
    const { unmount } = renderStrip([item()]);
    expect(within(strip()).getByTestId('vi-strip-label')).toHaveTextContent(/^VI\s*1$/);
    expect(chips().querySelectorAll('[data-slot="vi-chip"]')).toHaveLength(1);
    unmount();
    renderStrip([item(), item({ orderNo: '2' }), item({ orderNo: '3' })]);
    expect(within(strip()).getByTestId('vi-strip-label')).toHaveTextContent(/^VI\s*3$/);
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
