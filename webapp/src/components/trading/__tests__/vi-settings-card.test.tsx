import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RelayViTrigger } from '@gh-radar/shared';

/**
 * Phase 16 Plan 14 Task 1 — VI 설정 카드 · 시작/중지 확인 (TRADE-02 · D-07 · T-16-10).
 *
 * 여기서 잠그는 것은 **금전으로 이어지는 조작 규율**이다:
 *   ① 값 변경은 「수정」을 눌러야 나가고 그때 `run` 이 유지된다
 *   ② 「시작」·「중지」는 확인 다이얼로그를 거치고 **기본 포커스가 취소/닫기**다 (S-7)
 *   ③ 시작 요약에 **금액·상승률**이 들어 있다 (무엇이 얼마로 나가는지 모르고 시작 금지)
 *   ④ 제출 후 에코 전까지 재활성되지 않는다 (두 번째 등록 = 두 번째 무인 발주)
 *   ⑤ 빈 61(미등록)이 사용자의 입력을 지우지 않는다 (WinForms CR-01)
 *   ⑥ 만원 → 원 변환이 와이어에서 정확하다
 */

const sendMock = vi.fn();

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }),
  };
});

import { ViSettingsCard, VI_ACK_TIMEOUT_MS } from '../vi-settings-card';

const ACCOUNT = '37728502101';
const ACCOUNTS = [{ accountNo: ACCOUNT, name: 'KB 위탁종합' }];

function trigger(over: Partial<RelayViTrigger> = {}): RelayViTrigger {
  return {
    accountNo: ACCOUNT,
    orderAmountKrw: 10_000_000, // 1,000만원
    checkRate: 22,
    priceType: 'U',
    run: false,
    ...over,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof ViSettingsCard>> = {}) {
  return render(
    <ViSettingsCard
      accounts={ACCOUNTS}
      server={trigger()}
      todayOrderCount={5}
      unfilledCount={3}
      appliedAt="13:44:02"
      {...props}
    />,
  );
}

/** 입력은 **id 로** 잡는다 — 더티가 되면 라벨에 `● ` 접두가 붙어 접근 이름이 바뀐다. */
const amountInput = () => document.querySelector('#vi-amount') as HTMLInputElement;
const rateInput = () => document.querySelector('#vi-check-rate') as HTMLInputElement;

beforeEach(() => {
  sendMock.mockClear();
  window.localStorage.clear();
});

describe('설정 4행 · 고정 캡션', () => {
  it('계좌·금액·상승률·마감알림 4행과 헤더 캡션이 있다', () => {
    renderCard();
    expect(screen.getByLabelText('계좌')).toBeInTheDocument();
    expect(amountInput()).toHaveValue('1,000');
    expect(rateInput()).toHaveValue('22');
    expect(screen.getByRole('switch', { name: 'VI 마감 알림' })).toBeInTheDocument();
    expect(screen.getByText('세션당 1건 · KRX · 주문가 = 상한가')).toBeInTheDocument();
    expect(screen.getByText('주문수량 = 금액 ÷ 상한가')).toBeInTheDocument();
    expect(screen.getByText('이상 VI 발동 시 자동 매수')).toBeInTheDocument();
  });

  it('종목 축·주문유형·계좌 비밀번호 UI 가 없다', () => {
    const { container } = renderCard();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    // 계좌 셀렉터 하나뿐 — 주문유형 셀렉터를 만들지 않는다.
    expect(container.querySelectorAll('select')).toHaveLength(1);
  });

  it('더티 0 이면 액션 바가 렌더 자체가 없다', () => {
    renderCard();
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
  });
});

describe('① 값 변경 → 「수정」 — run 은 유지된다 (D-07)', () => {
  it('금액을 바꾸면 액션 바가 서고 「수정」이 현재 run 을 그대로 싣는다', () => {
    renderCard({ server: trigger({ run: true }) });

    fireEvent.change(amountInput(), { target: { value: '1500' } });
    const bar = document.querySelector('[data-slot="dirty-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar).toHaveTextContent('변경한 값 1개가 아직 서버에 반영되지 않았어요');
    expect(bar).toHaveTextContent('가동 상태(run)는 그대로 유지돼요');

    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toEqual({
      t: 'vi.set',
      accountNo: ACCOUNT,
      // ⑥ 만원 → 원. 한 자리가 어긋나면 1만 배 주문이다.
      orderAmountKrw: 15_000_000,
      checkRate: 22,
      // ★ 「수정」은 가동 상태를 건드리지 않는다.
      run: true,
    });
  });

  it('중지 상태에서 값만 고쳐도 run 은 false 로 유지된다', () => {
    renderCard({ server: trigger({ run: false }) });
    fireEvent.change(rateInput(), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    expect(sendMock.mock.calls[0][0]).toMatchObject({ checkRate: 25, run: false });
  });

  it('「되돌리기」는 폼만 되돌리고 아무것도 보내지 않는다', () => {
    renderCard();
    fireEvent.change(amountInput(), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(amountInput()).toHaveValue('1,000');
    expect(sendMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
  });
});

describe('② 시작/중지 확인 다이얼로그 (S-7)', () => {
  it('「시작」 → 다이얼로그가 열리고 기본 포커스는 **취소**다', async () => {
    renderCard({ server: trigger({ run: false }) });
    fireEvent.click(screen.getByRole('button', { name: '시작' }));

    const dialog = await screen.findByTestId('vi-start-dialog');
    expect(dialog).toHaveTextContent('VI 자동매수를 시작할까요?');
    expect(dialog).toHaveTextContent('조건에 맞는 VI 발동 종목을 자동으로 매수해요.');
    expect(dialog).toHaveTextContent(
      '시작하면 사람 확인 없이 주문이 나가요. 금액·상승률을 다시 확인해 주세요.',
    );
    // ★ Enter 연타로 자동매수가 시작되면 안 된다.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '취소' })).toHaveFocus(),
    );
    /*
      ★ 실행 버튼 옆에 또 다른 클릭 타깃(X 닫기)을 두지 않는다.
        `data-slot="dialog-close"` 로 조회하면 **아무것도 잡지 못한다** — Radix `asChild` 가
        자식 `Button` 의 `data-slot="button"` 으로 덮어써서 그 선택자는 항상 null 이다
        (변이 실측). 접근 이름으로 본다.
    */
    expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull();
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '취소',
      '시작',
    ]);
  });

  it('③ 시작 요약에 계좌·금액·상승률·주문가가 전부 있다', async () => {
    renderCard({ server: trigger({ run: false }) });
    fireEvent.change(amountInput(), { target: { value: '1500' } });
    fireEvent.change(rateInput(), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '시작' }));

    const summary = (await screen.findByTestId('vi-start-dialog')).querySelector(
      '[data-slot="vi-confirm-summary"]',
    );
    expect(summary).not.toBeNull();
    const text = summary!.textContent ?? '';
    expect(text).toContain(ACCOUNT);
    // ★ 사용자가 방금 고친 **현재 폼 값**이 실려야 한다 — 서버값을 보여 주면 거짓말이다.
    expect(text).toContain('1,500만원');
    expect(text).toContain('25% 이상');
    expect(text).toContain('상한가 · KRX');
  });

  it('시작 확정 → 현재 폼 값 + run:true 로 나간다', async () => {
    renderCard({ server: trigger({ run: false }) });
    fireEvent.change(amountInput(), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: '시작' }));
    const dialog = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(dialog.querySelector('button:last-of-type') as HTMLButtonElement);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      orderAmountKrw: 15_000_000,
      run: true,
    });
  });

  it('취소를 누르면 아무것도 나가지 않고 다이얼로그가 닫힌다', async () => {
    renderCard({ server: trigger({ run: false }) });
    fireEvent.click(screen.getByRole('button', { name: '시작' }));
    const dialog = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    // ★ Radix 는 닫힘 전이 중에도 노드를 남긴다 — `data-state` 로 본다.
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'closed'));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('가동 중에는 「중지」 다이얼로그이고 기본 포커스는 **닫기**다', async () => {
    renderCard({ server: trigger({ run: true }), todayOrderCount: 5, unfilledCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: '중지' }));

    const dialog = await screen.findByTestId('vi-stop-dialog');
    expect(dialog).toHaveTextContent('VI 자동매수를 중지할까요?');
    expect(dialog).toHaveTextContent('새 VI 발동에 더 이상 주문하지 않아요.');
    expect(dialog).toHaveTextContent('5건');
    expect(dialog).toHaveTextContent('3건 (유지)');
    expect(dialog).toHaveTextContent(
      '이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus());
    expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull();
    // 실행 버튼보다 **앞**에 닫기가 온다 — 순서가 뒤집히면 Radix 기본 포커스가 실행 버튼이다.
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '닫기',
      '중지',
    ]);
  });

  it('중지 확정 → run:false 로 나간다', async () => {
    renderCard({ server: trigger({ run: true }) });
    fireEvent.click(screen.getByRole('button', { name: '중지' }));
    const dialog = await screen.findByTestId('vi-stop-dialog');
    fireEvent.click(dialog.querySelector('button:last-of-type') as HTMLButtonElement);
    expect(sendMock.mock.calls[0][0]).toMatchObject({ run: false });
  });
});

describe('④ 제출 후 즉시 재활성 금지 (T-16-10)', () => {
  it('전송하면 「반영 중…」 이고 에코 전까지 다시 눌러도 나가지 않는다', async () => {
    // ★ `shouldAdvanceTime` 없이 가짜 타이머를 켜면 RTL 의 `waitFor`(실시간 폴링)가 멈춰
    //   테스트가 타임아웃되고, 그 타임아웃은 `finally` 를 밟지 못해 **다음 테스트까지**
    //   가짜 타이머를 물려준다(실측으로 확인한 함정).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { rerender } = render(
        <ViSettingsCard
          accounts={ACCOUNTS}
          server={trigger({ run: false })}
          todayOrderCount={0}
          unfilledCount={0}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
      const dialog = await screen.findByTestId('vi-start-dialog');
      fireEvent.click(dialog.querySelector('button:last-of-type') as HTMLButtonElement);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const runButton = document.querySelector(
        '[data-slot="vi-run-button"]',
      ) as HTMLButtonElement;
      expect(runButton).toBeDisabled();
      expect(runButton).toHaveTextContent('반영 중…');

      // 연타해도 두 번째 등록이 만들어지지 않는다.
      fireEvent.click(runButton);
      expect(sendMock).toHaveBeenCalledTimes(1);

      // ★ 타임아웃이 지나도 **아무것도 다시 보내지 않는다** — 잠금만 풀린다.
      act(() => {
        vi.advanceTimersByTime(VI_ACK_TIMEOUT_MS + 100);
      });
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-slot="vi-run-button"]')).not.toBeDisabled();

      // 에코가 오면 가동 상태가 바뀐다.
      rerender(
        <ViSettingsCard
          accounts={ACCOUNTS}
          server={trigger({ run: true })}
          todayOrderCount={0}
          unfilledCount={0}
        />,
      );
      expect(document.querySelector('[data-slot="vi-run-bar"]')).toHaveAttribute(
        'data-run',
        'true',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('⑤ 에코 규율', () => {
  it('서버 에코는 더티 필드도 덮고 덮인 개수를 알린다 (D-11)', () => {
    const onServerEcho = vi.fn();
    const { rerender } = render(
      <ViSettingsCard
        accounts={ACCOUNTS}
        server={trigger()}
        todayOrderCount={0}
        unfilledCount={0}
        onServerEcho={onServerEcho}
      />,
    );
    fireEvent.change(amountInput(), { target: { value: '1500' } });
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).not.toBeNull();

    rerender(
      <ViSettingsCard
        accounts={ACCOUNTS}
        server={trigger({ orderAmountKrw: 20_000_000 })}
        todayOrderCount={0}
        unfilledCount={0}
        onServerEcho={onServerEcho}
      />,
    );

    expect(amountInput()).toHaveValue('2,000');
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
    expect(onServerEcho).toHaveBeenCalledWith({ overwrittenDirty: 1 });
  });

  it('빈 61(미등록)은 입력값을 지우지 않고 가동만 내린다 (CR-01)', () => {
    const { rerender } = render(
      <ViSettingsCard
        accounts={ACCOUNTS}
        server={trigger({ run: true })}
        todayOrderCount={0}
        unfilledCount={0}
      />,
    );
    fireEvent.change(amountInput(), { target: { value: '1500' } });

    rerender(
      <ViSettingsCard
        accounts={ACCOUNTS}
        server={null}
        todayOrderCount={0}
        unfilledCount={0}
      />,
    );

    // ★ 사용자가 입력한 값이 그대로 남는다 — 빈 응답을 「값 0」으로 읽지 않는다.
    expect(amountInput()).toHaveValue('1,500');
    expect(document.querySelector('[data-slot="vi-run-bar"]')).toHaveAttribute(
      'data-run',
      'false',
    );
  });

  it('미조회(undefined)면 폼이 잠긴다 — 서버 상태를 모르는 채로 시작하지 않는다', () => {
    renderCard({ server: undefined });
    expect(amountInput()).toBeDisabled();
    expect(document.querySelector('[data-slot="vi-run-button"]')).toBeDisabled();
  });
});

describe('⑥ 마감알림 — 이 기기 전용 · 실패를 숨기지 않는다', () => {
  it('권한이 거부되면 스위치를 되돌리고 사유를 남긴다', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(function FakeNotification() {}, {
        permission: 'default',
        requestPermission: async () => 'denied' as NotificationPermission,
      }),
    });
    const onAlertToggle = vi.fn();
    renderCard({ onAlertToggle });

    const sw = screen.getByRole('switch', { name: 'VI 마감 알림' });
    fireEvent.click(sw);

    await waitFor(() =>
      expect(document.querySelector('[data-slot="vi-alert-reason"]')).not.toBeNull(),
    );
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem('gh-radar:vi-alert')).toBe('off');
    expect(onAlertToggle).toHaveBeenCalledWith(false, expect.stringContaining('차단'));
    Reflect.deleteProperty(window, 'Notification');
  });

  it('허용되면 켜지고 이 기기에만 저장된다 — 서버로 나가지 않는다', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: Object.assign(function FakeNotification() {}, {
        permission: 'granted',
        requestPermission: async () => 'granted' as NotificationPermission,
      }),
    });
    renderCard();

    const sw = screen.getByRole('switch', { name: 'VI 마감 알림' });
    fireEvent.click(sw);

    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    expect(window.localStorage.getItem('gh-radar:vi-alert')).toBe('on');
    // ★ 마감알림은 와이어로 나가지 않는다(T-16-09).
    expect(sendMock).not.toHaveBeenCalled();
    Reflect.deleteProperty(window, 'Notification');
  });
});
