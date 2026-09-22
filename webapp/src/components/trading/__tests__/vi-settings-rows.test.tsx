import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayAccount, RelayViSetMsg, RelayViTrigger } from '@gh-radar/shared';

/**
 * Phase 18 Plan 05 Task 1 — VI 설정 2줄 (TRADE-08 · D-05 · D-27 · UI-SPEC E2).
 *
 * 여기서 잠그는 것:
 *   ① 줄의 거래소가 `vi.set` 페이로드의 `exchange` 로 나간다 (Pitfall 8 — 고정 상수 금지)
 *   ② 두 줄은 서로 다른 전략 슬롯이다 — 더티·에코·전송이 다른 줄을 건드리지 않는다
 *   ③ 스냅샷이 없거나 한 거래소만 있어도 두 줄은 항상 그려진다 (E2 empty/partial)
 *   ④ 「수정」은 `run` 을 현재값 그대로 싣고, 시작/중지만 확인 다이얼로그를 거친다 (Phase 16 D-07)
 *   ⑤ 3초 ack 타임아웃은 잠금을 풀고 문구를 띄울 뿐 **아무것도 다시 보내지 않는다**
 *   ⑥ 더티 중 에코는 값을 덮고 「다른 단말에서 변경됨」 을 인라인으로 띄운다 (D-27)
 *   ⑦ 금액 상한 가드(WR-07)가 줄에서도 그대로다
 */

const sendMock = vi.fn();
/** 세션 계좌 목록 — CR-02 describe 만 채운다(정본 계좌의 이름 조회). 나머지는 빈 배열 그대로다. */
let accountsMock: RelayAccount[] = [];

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock, accounts: accountsMock }),
  };
});

import {
  ViSettingsRows,
  VI_ACK_TIMEOUT_MS,
  VI_ACK_TIMEOUT_TEXT,
  VI_AMOUNT_LIMIT_MESSAGE,
  VI_DEFAULT_AMOUNT_MANWON,
  VI_DEFAULT_CHECK_RATE,
  VI_ECHO_OVERWRITTEN_TEXT,
  VI_SET_SEND_FAILED_TEXT,
  viRegisteredAccountText,
  viRowAccountOf,
} from '../workbench/vi-settings-rows';
import { MAX_VI_ORDER_AMOUNT_MANWON, manwonToKrw } from '@/lib/vi-alert';
import type { RelayViTriggers } from '@/lib/use-relay-socket';

const ACCOUNT = '37728502101';

function trigger(over: Partial<RelayViTrigger> = {}): RelayViTrigger {
  return {
    accountNo: ACCOUNT,
    exchange: 'KRX',
    orderAmountKrw: 10_000_000, // 1,000만원
    checkRate: 22,
    priceType: 'U',
    run: false,
    ...over,
  };
}

const BOTH: RelayViTriggers = {
  KRX: trigger(),
  NXT: trigger({ exchange: 'NXT', orderAmountKrw: 5_000_000, checkRate: 25 }),
};

function renderRows(props: Partial<React.ComponentProps<typeof ViSettingsRows>> = {}) {
  return render(<ViSettingsRows viTriggers={BOTH} accountNo={ACCOUNT} {...props} />);
}

const row = (ex: 'KRX' | 'NXT') =>
  document.querySelector(`[data-slot="vi-settings-row"][data-exchange="${ex}"]`) as HTMLElement;
const rateInput = (ex: 'KRX' | 'NXT') =>
  document.querySelector(`#vi-${ex.toLowerCase()}-rate`) as HTMLInputElement;
const amountInput = (ex: 'KRX' | 'NXT') =>
  document.querySelector(`#vi-${ex.toLowerCase()}-amount`) as HTMLInputElement;
const fixButton = (ex: 'KRX' | 'NXT') =>
  row(ex).querySelector('[data-slot="vi-row-fix"]') as HTMLButtonElement | null;
const sentMsgs = () => sendMock.mock.calls.map((c) => c[0] as RelayViSetMsg);

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockReturnValue(true);
  accountsMock = [];
});

describe('줄 구성 (D-05)', () => {
  it('KRX 한 줄 · NXT 한 줄 — 태그 · 스위치 · 상승률 · 금액. 계좌·마감알림은 줄에 없다', () => {
    renderRows();
    const rows = document.querySelectorAll('[data-slot="vi-settings-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-exchange')).toBe('KRX');
    expect(rows[1].getAttribute('data-exchange')).toBe('NXT');

    for (const ex of ['KRX', 'NXT'] as const) {
      const r = within(row(ex));
      expect(r.getByText(ex)).toBeInTheDocument();
      expect(r.getByRole('switch', { name: `VI ${ex} 시작` })).toBeInTheDocument();
      expect(r.getByText('상승률')).toBeInTheDocument();
      expect(r.getByText('금액')).toBeInTheDocument();
      expect(r.getByText('%')).toBeInTheDocument();
      expect(r.getByText('만원')).toBeInTheDocument();
    }
    // ★ 계좌 셀렉터·마감알림 스위치는 상태줄 몫이다(Q-1).
    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'VI 마감 알림' })).toBeNull();
    expect(screen.queryByText('계좌')).toBeNull();
  });

  it('가동 중이면 「가동중」 + 「서버 반영 {시각}」, 아니면 「중지」', () => {
    renderRows({ viTriggers: { KRX: trigger({ run: true }), NXT: BOTH.NXT } });
    const krx = within(row('KRX'));
    expect(krx.getByText('가동중')).toBeInTheDocument();
    expect(krx.getByText(/^서버 반영 \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
    expect(krx.getByRole('switch', { name: 'VI KRX 중지' })).toHaveAttribute('aria-checked', 'true');
    const nxt = within(row('NXT'));
    expect(nxt.getByText('중지')).toBeInTheDocument();
    expect(nxt.queryByText('가동중')).toBeNull();
  });

  it('서버 값이 줄마다 따로 보인다 (만원 변환은 krwToManwon)', () => {
    renderRows();
    expect(rateInput('KRX').value).toBe('22');
    expect(amountInput('KRX').value).toBe('1,000');
    expect(rateInput('NXT').value).toBe('25');
    expect(amountInput('NXT').value).toBe('500');
  });
});

describe('① 줄의 거래소를 실어 보낸다 (Pitfall 8)', () => {
  it('KRX 줄의 「수정」 → exchange:"KRX", NXT 줄의 「수정」 → exchange:"NXT"', () => {
    renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    fireEvent.click(fixButton('KRX')!);
    fireEvent.change(amountInput('NXT'), { target: { value: '700' } });
    fireEvent.click(fixButton('NXT')!);

    const [krx, nxt] = sentMsgs();
    expect(krx).toEqual({
      t: 'vi.set',
      accountNo: ACCOUNT,
      exchange: 'KRX',
      orderAmountKrw: manwonToKrw(1_000),
      checkRate: 30,
      run: false,
    });
    expect(nxt).toEqual({
      t: 'vi.set',
      accountNo: ACCOUNT,
      exchange: 'NXT',
      orderAmountKrw: manwonToKrw(700),
      checkRate: 25,
      run: false,
    });
  });

  it('「수정」은 run 을 현재값 그대로 싣는다 (가동 중 줄은 run:true)', () => {
    renderRows({ viTriggers: { KRX: trigger({ run: true }), NXT: BOTH.NXT } });
    fireEvent.change(rateInput('KRX'), { target: { value: '24' } });
    fireEvent.click(fixButton('KRX')!);
    expect(sentMsgs()[0]).toMatchObject({ exchange: 'KRX', run: true, checkRate: 24 });
  });

  it('시작/중지 확인 경로도 줄의 거래소를 싣는다', async () => {
    renderRows({ viTriggers: { KRX: trigger({ run: true }), NXT: BOTH.NXT } });
    fireEvent.click(within(row('NXT')).getByRole('switch', { name: 'VI NXT 시작' }));
    const start = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(within(start).getByRole('button', { name: '시작' }));
    expect(sentMsgs()[0]).toMatchObject({ exchange: 'NXT', run: true });

    fireEvent.click(within(row('KRX')).getByRole('switch', { name: 'VI KRX 중지' }));
    const stop = await screen.findByTestId('vi-stop-dialog');
    fireEvent.click(within(stop).getByRole('button', { name: '중지' }));
    expect(sentMsgs()[1]).toMatchObject({ exchange: 'KRX', run: false });
  });
});

describe('② 줄 독립 — 서로 다른 전략 슬롯', () => {
  it('값이 완전히 같아도 KRX 편집이 NXT 를 더티로 만들지 않는다', () => {
    const same: RelayViTriggers = { KRX: trigger(), NXT: trigger({ exchange: 'NXT' }) };
    renderRows({ viTriggers: same });
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    expect(fixButton('KRX')).not.toBeNull();
    expect(fixButton('NXT')).toBeNull();
    expect(rateInput('NXT').value).toBe('22');
  });

  it('한 줄의 에코가 다른 줄의 더티를 지우지 않는다', () => {
    const { rerender } = renderRows();
    fireEvent.change(rateInput('NXT'), { target: { value: '40' } });
    rerender(
      <ViSettingsRows
        viTriggers={{ KRX: trigger({ checkRate: 23 }), NXT: BOTH.NXT }}
        accountNo={ACCOUNT}
      />,
    );
    expect(rateInput('KRX').value).toBe('23');
    expect(rateInput('NXT').value).toBe('40');
    expect(fixButton('NXT')).not.toBeNull();
  });

  it('더티 개수는 두 줄의 합으로 보고된다', () => {
    const onDirtyCountChange = vi.fn();
    renderRows({ onDirtyCountChange });
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    fireEvent.change(amountInput('NXT'), { target: { value: '800' } });
    expect(onDirtyCountChange).toHaveBeenLastCalledWith(2);
  });
});

describe('③ 빈/부분 스냅샷 (E2 empty · partial)', () => {
  it('viTriggers 가 비어 있어도 두 줄 · 스위치 OFF · 「중지」 · 기본값', () => {
    renderRows({ viTriggers: {} });
    for (const ex of ['KRX', 'NXT'] as const) {
      const r = within(row(ex));
      expect(r.getByRole('switch', { name: `VI ${ex} 시작` })).toHaveAttribute('aria-checked', 'false');
      expect(r.getByText('중지')).toBeInTheDocument();
      expect(rateInput(ex).value).toBe(String(VI_DEFAULT_CHECK_RATE));
      expect(amountInput(ex).value).toBe(new Intl.NumberFormat('ko-KR').format(VI_DEFAULT_AMOUNT_MANWON));
    }
    // 별도 빈 상태 문구 · 스피너 없음
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[data-slot="vi-settings-empty"]')).toBeNull();
  });

  it('스냅샷에 KRX 만 있으면 NXT 줄은 기본값 · 「중지」, KRX 줄만 서버 값', () => {
    renderRows({ viTriggers: { KRX: trigger({ run: true, checkRate: 27, orderAmountKrw: 30_000_000 }) } });
    expect(rateInput('KRX').value).toBe('27');
    expect(amountInput('KRX').value).toBe('3,000');
    expect(within(row('KRX')).getByText('가동중')).toBeInTheDocument();
    expect(rateInput('NXT').value).toBe(String(VI_DEFAULT_CHECK_RATE));
    expect(within(row('NXT')).getByText('중지')).toBeInTheDocument();
  });

  it('빈 61(null · 미등록)은 입력값을 지우지 않는다 (CR-01)', () => {
    const { rerender } = renderRows({ viTriggers: { KRX: trigger(), NXT: null } });
    fireEvent.change(rateInput('NXT'), { target: { value: '31' } });
    rerender(<ViSettingsRows viTriggers={{ KRX: trigger(), NXT: null }} accountNo={ACCOUNT} />);
    expect(rateInput('NXT').value).toBe('31');
  });
});

describe('E2 partial — 줄 단위 더티', () => {
  it('상승률만 바꾸면 「수정」 1개 · 바뀐 라벨만 `● ` 접두', () => {
    renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    const r = row('KRX');
    expect(r.querySelectorAll('[data-slot="vi-row-fix"]')).toHaveLength(1);
    expect(within(r).getByText('● 상승률')).toBeInTheDocument();
    expect(within(r).getByText('금액')).toBeInTheDocument();
    expect(within(r).queryByText('● 금액')).toBeNull();
  });

  it('공란 입력이면 「수정」이 disabled 이고 눌러도 나가지 않는다', () => {
    renderRows();
    fireEvent.change(amountInput('KRX'), { target: { value: '' } });
    expect(amountInput('KRX').value).toBe('');
    expect(fixButton('KRX')).toBeDisabled();
    fireEvent.click(fixButton('KRX')!);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('E2 loading · error — 반영 중 · 타임아웃 · 전송 실패', () => {
  it('전송 후 에코 전에는 「반영 중…」 + disabled, 에코가 오면 풀리고 더티가 사라진다', () => {
    const { rerender } = renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    fireEvent.click(fixButton('KRX')!);
    expect(fixButton('KRX')).toHaveTextContent('반영 중…');
    expect(fixButton('KRX')).toBeDisabled();
    fireEvent.click(fixButton('KRX')!);
    expect(sendMock).toHaveBeenCalledTimes(1);

    rerender(
      <ViSettingsRows viTriggers={{ KRX: trigger({ checkRate: 30 }), NXT: BOTH.NXT }} accountNo={ACCOUNT} />,
    );
    expect(fixButton('KRX')).toBeNull();
    // 내 에코는 「다른 단말」이 아니다
    expect(screen.queryByText(VI_ECHO_OVERWRITTEN_TEXT)).toBeNull();
  });

  it('★ 3초 타임아웃 — 잠금을 풀고 문구를 띄우며 더티 값을 보존하고, 아무것도 다시 보내지 않는다', () => {
    vi.useFakeTimers();
    try {
      renderRows();
      fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
      fireEvent.click(fixButton('KRX')!);
      expect(sendMock).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(VI_ACK_TIMEOUT_MS * 5);
      });
      expect(sendMock).toHaveBeenCalledTimes(1); // 재전송 0
      const status = within(row('KRX').parentElement!).getByRole('status');
      expect(status).toHaveTextContent(VI_ACK_TIMEOUT_TEXT);
      expect(rateInput('KRX').value).toBe('30');
      expect(fixButton('KRX')).toHaveTextContent('수정');
      expect(fixButton('KRX')).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('보내지 못하면(send=false) 잠그지 않고 줄 아래 role=status 로 사유를 남긴다', () => {
    sendMock.mockReturnValue(false);
    renderRows();
    fireEvent.change(rateInput('NXT'), { target: { value: '30' } });
    fireEvent.click(fixButton('NXT')!);
    expect(fixButton('NXT')).toHaveTextContent('수정');
    expect(fixButton('NXT')).not.toBeDisabled();
    const block = document.querySelector('[data-slot="vi-settings-block"][data-exchange="NXT"]')!;
    expect(within(block as HTMLElement).getByRole('status')).toHaveTextContent(VI_SET_SEND_FAILED_TEXT);
    expect(rateInput('NXT').value).toBe('30');
  });

  it('세션이 준비되지 않으면(disabled) 입력·스위치가 잠기고 아무것도 나가지 않는다', () => {
    renderRows({ disabled: true });
    expect(rateInput('KRX')).toBeDisabled();
    expect(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' })).toBeDisabled();
  });
});

describe('D-27 — 다른 단말의 에코', () => {
  it('더티 중 에코가 오면 값을 덮고 「다른 단말에서 변경됨」 role=status 를 띄운다', () => {
    const { rerender } = renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    rerender(
      <ViSettingsRows viTriggers={{ KRX: trigger({ checkRate: 26 }), NXT: BOTH.NXT }} accountNo={ACCOUNT} />,
    );
    expect(rateInput('KRX').value).toBe('26');
    expect(fixButton('KRX')).toBeNull();
    const block = document.querySelector('[data-slot="vi-settings-block"][data-exchange="KRX"]') as HTMLElement;
    expect(within(block).getByRole('status')).toHaveTextContent(VI_ECHO_OVERWRITTEN_TEXT);
    // 다른 줄에는 고지가 없다
    const nxt = document.querySelector('[data-slot="vi-settings-block"][data-exchange="NXT"]') as HTMLElement;
    expect(within(nxt).queryByRole('status')).toBeNull();
  });
});

describe('시작/중지 확인 다이얼로그 (Phase 16 D-07 승계)', () => {
  it('스위치 토글은 확인 다이얼로그를 거치고 기본 포커스는 취소다', async () => {
    renderRows();
    fireEvent.click(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' }));
    expect(sendMock).not.toHaveBeenCalled();
    const dlg = await screen.findByTestId('vi-start-dialog');
    expect(within(dlg).getByRole('button', { name: '취소' })).toHaveFocus();
    // 요약에 계좌·금액·상승률·거래소가 있다
    expect(within(dlg).getByText(ACCOUNT)).toBeInTheDocument();
    expect(within(dlg).getByText('1,000만원')).toBeInTheDocument();
    expect(within(dlg).getByText('22% 이상')).toBeInTheDocument();
    expect(within(dlg).getByText('상한가 · KRX')).toBeInTheDocument();
  });

  it('취소하면 아무것도 나가지 않는다', async () => {
    renderRows();
    fireEvent.click(within(row('NXT')).getByRole('switch', { name: 'VI NXT 시작' }));
    const dlg = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: '취소' }));
    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('vi-start-dialog')).toBeNull();
  });

  it('확정 후 에코 전까지 스위치는 pending 이고 다시 눌리지 않는다', async () => {
    renderRows();
    const sw = within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' });
    fireEvent.click(sw);
    const dlg = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: '시작' }));
    expect(sw).toHaveAttribute('data-pending', 'true');
    expect(sw).toBeDisabled();
  });
});

describe('⑦ 금액 상한 (WR-07)', () => {
  it('상한을 넘는 입력은 상한으로 잘리고 이유를 말하며, 잘린 값 그대로 나간다', () => {
    renderRows();
    fireEvent.change(amountInput('KRX'), { target: { value: String(MAX_VI_ORDER_AMOUNT_MANWON + 1) } });
    expect(amountInput('KRX').value).toBe(new Intl.NumberFormat('ko-KR').format(MAX_VI_ORDER_AMOUNT_MANWON));
    expect(screen.getByText(VI_AMOUNT_LIMIT_MESSAGE)).toBeInTheDocument();
    fireEvent.click(fixButton('KRX')!);
    expect(sentMsgs()[0].orderAmountKrw).toBe(manwonToKrw(MAX_VI_ORDER_AMOUNT_MANWON));
  });

  it('서버 에코가 상한 밖 금액이면 `vi.set` 이 아예 나가지 않는다', async () => {
    renderRows({
      viTriggers: { KRX: trigger({ orderAmountKrw: manwonToKrw(MAX_VI_ORDER_AMOUNT_MANWON + 10) }), NXT: BOTH.NXT },
    });
    fireEvent.click(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' }));
    const dlg = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: '시작' }));
    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.getByText(VI_AMOUNT_LIMIT_MESSAGE)).toBeInTheDocument();
  });
});

/* ───────────── Task 3 — 옛 VI 설정 카드 단위 테스트(18-13 삭제) 커버리지 이관 ───────────── */

describe('이관 — 표면 규율 (옛 「설정 4행」 describe)', () => {
  it('종목 축·주문유형·계좌 비밀번호 UI 가 없다', () => {
    renderRows();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/주문유형|종목 검색/)).toBeNull();
  });

  it('더티 0 이면 「수정」이 렌더 자체가 없다', () => {
    renderRows();
    expect(document.querySelectorAll('[data-slot="vi-row-fix"]')).toHaveLength(0);
  });
});

describe('이관 — ② 확인 다이얼로그 나머지 경로', () => {
  it('시작 확정 → 현재 폼 값(더티 포함) + run:true 로 나간다', async () => {
    renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '28' } });
    fireEvent.change(amountInput('KRX'), { target: { value: '1200' } });
    fireEvent.click(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' }));
    const dlg = await screen.findByTestId('vi-start-dialog');
    expect(within(dlg).getByText('1,200만원')).toBeInTheDocument();
    expect(within(dlg).getByText('28% 이상')).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: '시작' }));
    expect(sentMsgs()[0]).toEqual({
      t: 'vi.set',
      accountNo: ACCOUNT,
      exchange: 'KRX',
      orderAmountKrw: manwonToKrw(1_200),
      checkRate: 28,
      run: true,
    });
    expect(screen.queryByTestId('vi-start-dialog')).toBeNull();
  });

  it('가동 중에는 「중지」 다이얼로그이고 기본 포커스는 **닫기**, 요약에 거래소·오늘 주문·미체결', async () => {
    renderRows({ viTriggers: { KRX: BOTH.KRX, NXT: trigger({ exchange: 'NXT', run: true }) } });
    fireEvent.click(within(row('NXT')).getByRole('switch', { name: 'VI NXT 중지' }));
    const dlg = await screen.findByTestId('vi-stop-dialog');
    expect(within(dlg).getByRole('button', { name: '닫기' })).toHaveFocus();
    expect(within(dlg).getByText('NXT')).toBeInTheDocument();
    expect(within(dlg).getByText('0건')).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: '닫기' }));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('「시작」이 못 나가면 다이얼로그가 열린 채 사유를 보여 준다 — 닫힘 = 성공이 아니다', async () => {
    sendMock.mockReturnValue(false);
    renderRows();
    fireEvent.click(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' }));
    const dlg = await screen.findByTestId('vi-start-dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: '시작' }));
    expect(screen.getByTestId('vi-start-dialog')).toBeInTheDocument();
    expect(within(dlg).getByRole('alert')).toHaveTextContent(VI_SET_SEND_FAILED_TEXT);
    // 스위치는 잠기지 않았다(기다릴 에코가 없다). 다이얼로그가 배경을 aria-hidden 으로 가리므로 DOM 으로 잡는다.
    const sw = row('KRX').querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw).not.toHaveAttribute('data-pending');
    expect(sw).not.toBeDisabled();
  });
});

describe('이관 — ⑤ 미조회 · ⑦ 세션 가드', () => {
  it('미조회(키 부재)면 그 줄이 잠긴다 — 서버 상태를 모르는 채로 시작하지 않는다', () => {
    renderRows({ viTriggers: { KRX: trigger() } });
    expect(within(row('NXT')).getByRole('switch', { name: 'VI NXT 시작' })).toBeDisabled();
    expect(rateInput('NXT')).toBeDisabled();
    expect(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' })).not.toBeDisabled();
  });

  it('계좌가 비어 있으면 잠긴다 — 계좌 없는 `vi.set` 을 만들지 않는다', () => {
    // 18-15 (CR-02): 잠금은 **정본 계좌** 기준이다. 미등록 줄은 상태줄 계좌가 정본이라 공란이면 잠기고,
    // 등록된 줄은 자기 계좌가 있으므로 잠기지 않는다(중지를 막지 않는다).
    renderRows({ viTriggers: { KRX: null, NXT: trigger({ exchange: 'NXT', run: true }) }, accountNo: '' });
    expect(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' })).toBeDisabled();
    expect(within(row('NXT')).getByRole('switch', { name: 'VI NXT 중지' })).not.toBeDisabled();
  });

  it('더티 상태에서 세션이 끊기면 「수정」을 눌러도 아무것도 나가지 않고, 돌아오면 같은 클릭이 나간다', () => {
    const { rerender } = renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    rerender(<ViSettingsRows viTriggers={BOTH} accountNo={ACCOUNT} disabled />);
    expect(fixButton('KRX')).toBeDisabled();
    fireEvent.click(fixButton('KRX')!);
    expect(sendMock).not.toHaveBeenCalled();
    expect(rateInput('KRX').value).toBe('30'); // 더티 값 보존

    rerender(<ViSettingsRows viTriggers={BOTH} accountNo={ACCOUNT} />);
    fireEvent.click(fixButton('KRX')!);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentMsgs()[0]).toMatchObject({ exchange: 'KRX', checkRate: 30 });
  });
});

describe('E2 loading — 스피너 없음', () => {
  it('전송 중에도 스피너·스켈레톤이 없다 (문구 「반영 중…」 + disabled 만)', () => {
    renderRows();
    fireEvent.change(rateInput('NXT'), { target: { value: '30' } });
    fireEvent.click(fixButton('NXT')!);
    expect(document.querySelector('[data-slot*="spinner"], [data-slot*="skeleton"], .animate-spin')).toBeNull();
  });
});

/*
  18-13 이관 — 옛 VI 화면 상태줄의 VI 몫 서버 거부(`vi-server-error`)를 두 줄 아래 한 자리로 옮겼다.
  판정(`isViServerMessage`)은 작업대의 `useViServerError` 가 하고 줄은 받은 1건을 그리기만 한다.
*/
describe('VI 몫 서버 거부 — 두 줄 아래 인라인 경보 (옛 VI 화면 ② · T-16-07)', () => {
  it('serverError 가 있으면 role="alert" 로 출처 배지 + 원문을 그린다', () => {
    renderRows({ serverError: { text: '상승률 조건 미달로 건너뜀', src: 'VITrigger' } });
    const el = document.querySelector('[data-slot="vi-server-error"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('role', 'alert');
    expect(el.querySelector('[data-slot="vi-server-error-src"]')?.textContent).toBe('[VI]');
    expect(el).toHaveTextContent('상승률 조건 미달로 건너뜀');
  });

  it('`SetVITrigger`·`Account` 출처는 `[서버]` 다 — 배지 판정은 serverMsgBadge 하나다', () => {
    renderRows({ serverError: { text: 'VI 주문금액이 0 입니다', src: 'SetVITrigger' } });
    expect(document.querySelector('[data-slot="vi-server-error-src"]')?.textContent).toBe('[서버]');
  });

  it('serverError 가 없으면 그 줄 자체가 없다', () => {
    renderRows({ serverError: null });
    expect(document.querySelector('[data-slot="vi-server-error"]')).toBeNull();
  });
});

/*
  18-15 (CR-02) — 등록된 VI 전략의 계좌가 정본이다 (UI-SPEC Q-3 VI 판).
  상태줄 계좌는 **미등록 줄의 기본 계좌**일 뿐이다. 가동 중인 무인 매수가 상태줄 조작으로
  다른 계좌로 옮겨 가는 경로(「수정」 한 번)를 닫는다. 잠그지 않는다 — 중지는 언제나 열려 있다.
*/
describe('CR-02 — 등록 전략의 계좌가 정본', () => {
  const STATUS = 'A-111';
  const REGISTERED = 'B-222';
  const block = (ex: 'KRX' | 'NXT') =>
    document.querySelector(`[data-slot="vi-settings-block"][data-exchange="${ex}"]`) as HTMLElement;
  const accountNotice = (ex: 'KRX' | 'NXT') => block(ex).querySelector('[data-slot="vi-row-account"]');

  it('viRowAccountOf — 미조회 · 미등록이면 상태줄 계좌, differs:false', () => {
    expect(viRowAccountOf(undefined, STATUS)).toEqual({ accountNo: STATUS, differs: false });
    expect(viRowAccountOf(null, STATUS)).toEqual({ accountNo: STATUS, differs: false });
  });

  it('viRowAccountOf — 등록 계좌가 다르면 그 계좌 · differs:true', () => {
    expect(viRowAccountOf(trigger({ accountNo: REGISTERED }), STATUS)).toEqual({
      accountNo: REGISTERED,
      differs: true,
    });
  });

  it('viRowAccountOf — 등록 계좌가 같으면 differs:false', () => {
    expect(viRowAccountOf(trigger({ accountNo: STATUS }), STATUS)).toEqual({ accountNo: STATUS, differs: false });
  });

  it('viRowAccountOf — 등록 계좌가 공란이면 등록 계좌가 아니다 (상태줄 계좌)', () => {
    expect(viRowAccountOf(trigger({ accountNo: '' }), STATUS)).toEqual({ accountNo: STATUS, differs: false });
  });

  it('★ 서버 KRX 계좌 B · 상태줄 A → 「수정」 은 B 로 나간다 (run 현재값)', () => {
    renderRows({
      viTriggers: { KRX: trigger({ accountNo: REGISTERED, run: true }), NXT: null },
      accountNo: STATUS,
    });
    fireEvent.change(rateInput('KRX'), { target: { value: '31' } });
    fireEvent.click(fixButton('KRX')!);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentMsgs()[0]).toEqual({
      t: 'vi.set',
      accountNo: REGISTERED,
      exchange: 'KRX',
      orderAmountKrw: manwonToKrw(1_000),
      checkRate: 31,
      run: true,
    });
  });

  it('불일치면 그 줄 아래에만 role=status 고지 — 계좌번호 · 이름을 말한다', () => {
    accountsMock = [
      { accountNo: STATUS, name: '상태줄계좌' },
      { accountNo: REGISTERED, name: '등록계좌' },
    ];
    renderRows({ viTriggers: { KRX: trigger({ accountNo: REGISTERED }), NXT: null }, accountNo: STATUS });
    const notice = accountNotice('KRX') as HTMLElement;
    expect(notice).not.toBeNull();
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent(REGISTERED);
    expect(notice.textContent).toBe(viRegisteredAccountText(REGISTERED, '등록계좌'));
    expect(accountNotice('NXT')).toBeNull();
  });

  it('등록 계좌 = 상태줄 계좌면 고지가 DOM 에 없다 (D-05 평상시 유지)', () => {
    renderRows({ viTriggers: { KRX: trigger({ accountNo: STATUS }), NXT: trigger({ exchange: 'NXT', accountNo: STATUS }) }, accountNo: STATUS });
    expect(document.querySelector('[data-slot="vi-row-account"]')).toBeNull();
  });

  it('미등록(null) · 상태줄 A → 「수정」 은 A 로 나간다', () => {
    renderRows({ viTriggers: { KRX: null, NXT: null }, accountNo: STATUS });
    fireEvent.change(rateInput('NXT'), { target: { value: '33' } });
    fireEvent.click(fixButton('NXT')!);
    expect(sentMsgs()[0]).toMatchObject({ accountNo: STATUS, exchange: 'NXT', checkRate: 33 });
  });
});
