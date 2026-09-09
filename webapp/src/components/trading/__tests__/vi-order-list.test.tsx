import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayViOrderItem } from '@gh-radar/shared';

/**
 * Phase 16 Plan 14 Task 2 — VI 주문내역 (TRADE-02 · D-10 · UI-SPEC B5/B6).
 *
 * 여기서 잠그는 것은 **잘못 읽으면 안전장치가 풀리는 표시**다:
 *   ① 상태 6종 + **부분체결 파생**(서버 상태가 아니다)
 *   ② `confirm_locked` 행은 체크할 수 없다 (119초 면제를 되돌릴 수 없게 만들지 않는다)
 *   ③ 접수 전(`orderNo === ""`) 행도 체크할 수 없다 (서버가 응답 없이 드롭한다)
 *   ④ 체크는 **즉시 1회** 전송이고 다이얼로그가 없다
 *   ⑤ 20초 경계에서 색·`aria-valuenow` 가 같이 바뀐다
 *   ⑥ 진행바는 `Accepted` ∧ 잔여>0 행에만 있다
 *   ⑦ 빈 상태 문구
 *   ⑧ 연타해도 1회만 나간다
 *
 * ★ 표(≥1280)와 카드(<1280) **두 트리가 모두 DOM 에 있다.** 조회할 때 트리를 좁히지 않으면
 *   같은 이름의 요소가 2벌이라 개수 단언이 전부 두 배가 된다.
 */

const sendMock = vi.fn();

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }),
  };
});

import {
  VI_CONFIRM_SEND_FAILED_TEXT,
  ViOrderList,
  acceptedClock,
  changeRateOf,
  isConfirmable,
  remainingSeconds,
  stateFaceOf,
} from '../vi-order-list';

const ACCOUNT = '37728502101';
/** 고정 기준 시각 — 데드라인을 초 단위로 정확히 지어낸다. */
const NOW = Date.UTC(2026, 8, 9, 4, 44, 2);

function item(over: Partial<RelayViOrderItem> = {}): RelayViOrderItem {
  return {
    isin: 'KR7007660006',
    market: 'K',
    accountNo: ACCOUNT,
    orderNo: '0031245',
    orderQty: 205,
    orderPrice: 48_750,
    triggerPrice: 41_250,
    basePrice: 33_510,
    viEndTime: '134530250',
    deadline110Ms: NOW + 64_000,
    deadline119Ms: NOW + 73_000,
    confirmed: false,
    confirmLocked: false,
    state: 'Accepted',
    filledQty: 0,
    name: '이수페타시스',
    ...over,
  };
}

/** 데스크톱 표 트리로 좁힌다. */
const table = () => document.querySelector('[data-slot="vi-order-table"]') as HTMLElement;
/** 모바일 카드 트리로 좁힌다 — 진행바는 여기에만 있다(목업 정본). */
const cards = () => document.querySelector('[data-slot="vi-order-cards"]') as HTMLElement;

function renderList(items: RelayViOrderItem[], nowMs = NOW) {
  return render(<ViOrderList items={items} nowMs={nowMs} />);
}

/**
 * ★ `send` 스텁의 기본값은 **`true`** 다 (GC-WR-06 / 16-31 승계).
 *   `toggle` 이 반환값을 읽게 된 뒤로 `undefined`(falsy)는 「보내지 못했다」로 읽힌다 —
 *   기본값을 세우지 않으면 전송 관련 케이스가 전부 실패 경로로 떨어진다.
 */
beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockReturnValue(true);
});

describe('순수 함수', () => {
  it('remainingSeconds 는 음수를 0 으로 접고 **올림**이다', () => {
    expect(remainingSeconds(NOW + 64_000, NOW)).toBe(64);
    expect(remainingSeconds(NOW - 5_000, NOW)).toBe(0);
    expect(remainingSeconds(0, NOW)).toBe(0);
    /*
      ★ 내림이면 마지막 1초 동안 `0초` 를 보여 주고 진행바가 **한 박자 먼저 사라진다**
        (`hasDeadline` 이 잔여>0 만 그리므로). 올림이라야 마감 순간에 0 이 된다.
    */
    expect(remainingSeconds(NOW + 24_500, NOW)).toBe(25);
    expect(remainingSeconds(NOW + 1, NOW)).toBe(1);
  });

  it('acceptedClock 은 마감 −110초이고, 마감을 모르면 null 이다', () => {
    // 마감을 모르는 행에 epoch 0 시각(09:00:00 같은 값)을 그리면 없는 사실을 지어내는 것이다.
    expect(acceptedClock(0)).toBeNull();
    expect(acceptedClock(NOW + 64_000)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('changeRateOf 는 기준가를 모르면 null 이다', () => {
    expect(changeRateOf(41_250, 33_510)).toBeCloseTo(23.097, 2);
    expect(changeRateOf(41_250, 0)).toBeNull();
  });

  it('★ 부분체결은 `state === "PartiallyFilled"` 가 아니라 Accepted ∧ filledQty>0 이다', () => {
    expect(stateFaceOf({ state: 'Accepted', filledQty: 120, orderQty: 278 }).label).toBe(
      '부분체결 120/278',
    );
    expect(stateFaceOf({ state: 'Accepted', filledQty: 0, orderQty: 278 }).label).toBe('접수');
    // 서버가 절대 보내지 않는 값이라, 이 비교로 판정하면 어떤 행도 부분체결이 되지 않는다.
    expect(stateFaceOf({ state: 'Filled', filledQty: 278, orderQty: 278 }).label).toBe('체결');
  });

  it('★ isConfirmable — 잠금 판정의 유일 지점을 직접 잠근다', () => {
    /*
      비활성 체크박스는 클릭해도 `onCheckedChange` 가 발화하지 않아, 렌더 테스트만으로는
      **전송 가드 쪽 변이가 검출되지 않는다**(변이 실측). 두 층이 같은 함수를 쓰는지를
      여기서 직접 본다.
    */
    expect(isConfirmable({ orderNo: '0031245', confirmLocked: false })).toBe(true);
    expect(isConfirmable({ orderNo: '', confirmLocked: false })).toBe(false);
    expect(isConfirmable({ orderNo: '0031245', confirmLocked: true })).toBe(false);
    expect(isConfirmable({ orderNo: '0031245', confirmLocked: false }, true)).toBe(false);
  });
});

describe('① 상태 6종 + 부분체결 파생', () => {
  it('여섯 상태와 파생이 각자 다른 텍스트로 읽힌다', () => {
    renderList([
      item({ orderNo: '', state: 'Pending', triggerPrice: 1_000 }),
      item({ orderNo: '1', state: 'Accepted', triggerPrice: 2_000 }),
      item({ orderNo: '2', state: 'Accepted', filledQty: 120, orderQty: 278, triggerPrice: 3_000 }),
      item({ orderNo: '3', state: 'Filled', filledQty: 76, orderQty: 76, triggerPrice: 4_000 }),
      item({ orderNo: '4', state: 'Cancelled', triggerPrice: 5_000 }),
      item({ orderNo: '5', state: 'Rejected', triggerPrice: 6_000 }),
      item({ orderNo: '6', state: 'Cancelling', triggerPrice: 7_000 }),
    ]);

    const badges = within(table()).getAllByText(
      /접수 전|^접수$|부분체결|^체결$|^취소$|^거부$|취소 중/,
    );
    expect(badges.map((b) => b.textContent)).toEqual([
      '접수 전',
      '접수',
      '부분체결 120/278',
      '체결',
      '취소',
      '거부',
      '취소 중',
    ]);

    // 색 없이도 갈리는 **형태 축** — 접수 전만 속 빈 도트다.
    const dots = table().querySelectorAll('[data-slot="vi-state-badge"] [data-dot]');
    expect(dots[0]).toHaveAttribute('data-dot', 'hollow');
    expect(dots[1]).toHaveAttribute('data-dot', 'solid');
  });

  it('행에 `data-state` 앵커가 붙는다', () => {
    renderList([item({ state: 'Rejected' })]);
    expect(table().querySelector('[data-slot="vi-order-row"]')).toHaveAttribute(
      'data-state',
      'Rejected',
    );
  });

  it('종목명이 없으면 ISIN 을 보여준다 — 이름을 지어내지 않는다', () => {
    renderList([item({ name: undefined })]);
    expect(within(table()).getByText('KR7007660006')).toBeInTheDocument();
  });
});

describe('②③ 체크할 수 없는 행', () => {
  it('`confirm_locked` 행은 비활성 + `aria-disabled`', () => {
    renderList([item({ confirmLocked: true, confirmed: true })]);
    const box = within(table()).getByRole('checkbox');
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(box);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('접수 전(주문번호 없음) 행도 비활성이다 — 서버가 응답 없이 드롭한다', () => {
    renderList([item({ orderNo: '', state: 'Pending' })]);
    const box = within(table()).getByRole('checkbox');
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(box);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('열린 행의 접근성 이름이 **무엇이 면제되는지**까지 말한다', () => {
    renderList([item()]);
    expect(
      within(table()).getByRole('checkbox', {
        name: '이수페타시스 주문 확인 — 119초 미확인 취소 면제',
      }),
    ).toBeEnabled();
  });
});

describe('④⑧ 확인 체크는 즉시 1회 전송', () => {
  it('체크하면 `vi.confirm` 이 그 자리에서 나가고 다이얼로그가 없다', () => {
    renderList([item()]);
    fireEvent.click(within(table()).getByRole('checkbox'));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      t: 'vi.confirm',
      orderNo: '0031245',
      confirmed: true,
    });
    // D-10 — 확인 체크는 확인 다이얼로그를 거치지 않는다.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('낙관 반영으로 체크가 즉시 켜진다 (73 이 오기 전)', () => {
    renderList([item()]);
    const box = within(table()).getByRole('checkbox');
    expect(box).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(box);
    expect(within(table()).getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
  });

  it('★ 연타해도 1회만 나간다 (전송 중 잠금)', () => {
    renderList([item()]);
    const box = within(table()).getByRole('checkbox');
    fireEvent.click(box);
    fireEvent.click(within(table()).getByRole('checkbox'));
    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('73 정정이 오면 잠금이 풀리고 다시 바꿀 수 있다', () => {
    const { rerender } = render(<ViOrderList items={[item()]} nowMs={NOW} />);
    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(sendMock).toHaveBeenCalledTimes(1);

    // 서버가 확인 상태를 정정해 준다(73 델타).
    rerender(<ViOrderList items={[item({ confirmed: true })]} nowMs={NOW} />);

    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1][0]).toMatchObject({ confirmed: false });
  });

  it('73 이 낙관값과 다른 값을 주면 **서버가 이긴다**', () => {
    const { rerender } = render(<ViOrderList items={[item()]} nowMs={NOW} />);
    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(within(table()).getByRole('checkbox')).toHaveAttribute('data-state', 'checked');

    // 서버가 잠가 버렸다 — 확인은 반영되지 않았다.
    rerender(
      <ViOrderList items={[item({ confirmed: false, confirmLocked: true })]} nowMs={NOW} />,
    );
    const box = within(table()).getByRole('checkbox');
    expect(box).toHaveAttribute('data-state', 'unchecked');
    expect(box).toBeDisabled();
  });
});

describe('⑨ 보내지 못한 확인에는 낙관 반영도 잠금도 걸리지 않는다 (GC-WR-06)', () => {
  const errorText = () => document.querySelector('[data-slot="vi-confirm-error"]');

  it('`send` 가 false 면 체크가 켜지지 않고 행이 잠기지 않으며 사유가 뜬다', () => {
    sendMock.mockReturnValue(false);
    renderList([item()]);

    fireEvent.click(within(table()).getByRole('checkbox'));

    // 시도는 했다 — 그러나 소켓이 받지 않았다.
    expect(sendMock).toHaveBeenCalledTimes(1);
    // ★ 낙관 반영 없음. 「확인했다」고 믿게 두지 않는다.
    expect(within(table()).getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked');
    // ★ 사유가 화면에 있다.
    expect(errorText()).not.toBeNull();
    expect(errorText()).toHaveTextContent(VI_CONFIRM_SEND_FAILED_TEXT);

    /*
      ★ 잠기지 않았다는 증명 — `sending` 이 걸렸다면 두 번째 클릭이 삼켜진다.
        이 화면에서 잠금을 푸는 신호는 서버 73 델타뿐이라, 잘못 건 잠금은 **영구**다.
    */
    sendMock.mockReturnValue(true);
    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(within(table()).getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    // 성공 전송이 사유를 지운다(영구 경고가 아니다).
    expect(errorText()).toBeNull();
  });

  it('`send` 가 true 면 기존 낙관 반영·잠금이 그대로 걸린다 (회귀 방지)', () => {
    renderList([item()]);

    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(within(table()).getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    expect(errorText()).toBeNull();

    // 연타 잠금이 살아 있다 — 실패 분기가 성공 경로를 갉아먹지 않았다.
    fireEvent.click(within(table()).getByRole('checkbox'));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe('⑤⑥ 데드라인 (B6 · C4)', () => {
  it('잔여 25초는 중립, 15초는 `--destructive` 이고 숫자도 같이 바뀐다', () => {
    const { rerender } = render(
      <ViOrderList items={[item({ deadline110Ms: NOW + 25_000 })]} nowMs={NOW} />,
    );
    const bar = within(cards()).getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuemax', '110');
    expect(cards().querySelector('[data-slot="vi-deadline"]')).toHaveAttribute('data-hot', 'false');
    expect(table().querySelector('[data-slot="vi-deadline"]')).toHaveAttribute('data-hot', 'false');
    expect(within(cards()).getByText('25초')).toBeInTheDocument();

    rerender(<ViOrderList items={[item({ deadline110Ms: NOW + 15_000 })]} nowMs={NOW} />);

    const hotBar = within(cards()).getByRole('progressbar');
    expect(hotBar).toHaveAttribute('aria-valuenow', '15');
    // ★ 색과 숫자가 **같이** 바뀐다 — 색만 바뀌면 색맹 사용자가 경계를 놓친다.
    expect(cards().querySelector('[data-slot="vi-deadline"]')).toHaveAttribute('data-hot', 'true');
    expect(table().querySelector('[data-slot="vi-deadline"]')).toHaveAttribute('data-hot', 'true');
    expect(hotBar.querySelector('[data-slot="vi-deadline-fill"]')).toHaveClass(
      'bg-[var(--destructive)]',
    );
  });

  it('경계값 20초는 아직 중립이다 (미만일 때만 임박)', () => {
    renderList([item({ deadline110Ms: NOW + 20_000 })]);
    expect(cards().querySelector('[data-slot="vi-deadline"]')).toHaveAttribute('data-hot', 'false');
  });

  it('진행바 폭이 잔여/110 이고 **전이가 걸려 있지 않다**', () => {
    renderList([item({ deadline110Ms: NOW + 55_000 })]);
    const fill = cards().querySelector('[data-slot="vi-deadline-fill"]') as HTMLElement;
    expect(fill.style.width).toBe('50%');
    // 폭에 전이가 붙으면 바가 항상 실제보다 뒤처진 값을 보여 준다.
    expect(fill.className).not.toMatch(/transition|duration/);
  });

  it('★ 진행바는 `Accepted` ∧ 잔여>0 행에만 있다', () => {
    renderList([
      item({ orderNo: '1', state: 'Accepted', deadline110Ms: NOW + 30_000 }), // 있음
      item({ orderNo: '2', state: 'Accepted', deadline110Ms: NOW - 1_000 }), // 잔여 0 → 없음
      item({ orderNo: '3', state: 'Filled', deadline110Ms: NOW + 30_000 }), // 상태 → 없음
      item({ orderNo: '4', state: 'Cancelled', deadline110Ms: NOW + 30_000 }), // 없음
      item({ orderNo: '', state: 'Pending', deadline110Ms: 0 }), // 없음
    ]);
    expect(within(cards()).getAllByRole('progressbar')).toHaveLength(1);
    // 표 쪽은 숫자만 그리므로 나머지 행이 `—` 다(빈 칸으로 두지 않는다).
    expect(within(table()).getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('확인 여부가 데드라인 문구로 읽힌다', () => {
    const { rerender } = render(
      <ViOrderList items={[item({ deadline110Ms: NOW + 30_000 })]} nowMs={NOW} />,
    );
    expect(within(cards()).getByText('미확인 → 119초 취소')).toBeInTheDocument();
    rerender(
      <ViOrderList
        items={[item({ deadline110Ms: NOW + 30_000, confirmed: true })]}
        nowMs={NOW}
      />,
    );
    expect(within(cards()).getByText('확인됨')).toBeInTheDocument();
  });
});

describe('⑦ 빈 상태 · 고지', () => {
  it('빈 목록 문구가 UI-SPEC 원문 그대로다', () => {
    renderList([]);
    expect(screen.getByText('오늘 발동된 VI 주문이 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('가동 중이면 조건에 맞는 VI 발동 종목이 여기에 쌓여요.'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="vi-order-table"]')).toBeNull();
  });

  it('캡션과 하단 고지가 항상 있다', () => {
    renderList([item()]);
    expect(screen.getByText('확인 체크 = 119초 미확인 취소 면제')).toBeInTheDocument();
    expect(
      screen.getByText(
        '110초 미도달 취소는 서버 규칙이라 면제되지 않아요 · 접수 전(주문번호 없음)은 확인할 수 없어요',
      ),
    ).toBeInTheDocument();
  });

  it('스냅샷 전에는 스켈레톤이고 「없음」이라고 말하지 않는다', () => {
    render(<ViOrderList items={[]} loading nowMs={NOW} />);
    expect(document.querySelector('[data-slot="vi-order-skeleton"]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('오늘 발동된 VI 주문이 없어요')).toBeNull();
  });
});

describe('접수 전 행의 병합 키 (⑦ — 서로 다른 종목이 한 줄로 겹치지 않는다)', () => {
  it('주문번호가 둘 다 빈 두 종목이 각자 한 행씩 서고 **키가 겹치지 않는다**', () => {
    /*
      ★ 행 개수만 세면 이 단언은 공허하다 — React 는 키가 겹쳐도 두 요소를 다 그리고
        경고만 남긴다(변이 실측). 그래서 그 경고 자체를 잡는다. 키가 `orderNo` 로
        퇴화하면 두 접수 전 행이 같은 `""` 키를 갖고, 그 순간 리스트 갱신에서 한 행의
        상태가 다른 행으로 옮겨 간다.
    */
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    renderList([
      item({ orderNo: '', isin: 'KR7007660006', state: 'Pending', triggerPrice: 41_250 }),
      item({
        orderNo: '',
        isin: 'KR7042700005',
        name: '한미반도체',
        state: 'Pending',
        triggerPrice: 98_400,
      }),
    ]);
    expect(table().querySelectorAll('[data-slot="vi-order-row"]')).toHaveLength(2);
    expect(within(table()).getByText('이수페타시스')).toBeInTheDocument();
    expect(within(table()).getByText('한미반도체')).toBeInTheDocument();

    const keyWarnings = errors.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('same key')),
    );
    spy.mockRestore();
    expect(keyWarnings).toEqual([]);
  });

  it('접수 시각은 `HH:MM:SS` 고정폭이다 — 한글 조사가 섞이지 않는다', () => {
    renderList([item({ deadline110Ms: NOW + 64_000 })]);
    const clock = table().querySelector('[data-slot="vi-order-row"] td:nth-child(2)');
    expect(clock?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
