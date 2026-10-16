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
 *   ⑥ 더티 중 에코는 값을 덮는다 — 고지 없음 (D-27 · 2026-09-29 「다른 단말에서 변경됨」 제거)
 *   ⑦ 금액 상한 가드(WR-07)가 줄에서도 그대로다
 */

const sendMock = vi.fn();
/** 세션 계좌 목록 — CR-02 describe 만 채운다(정본 계좌의 이름 조회). 나머지는 빈 배열 그대로다. */
let accountsMock: RelayAccount[] = [];
/** 서버 통지(최신이 index 0) — P32 슬롯 오류 describe 만 채운다. */
let messagesMock: RelayServerMessageEntry[] = [];

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({
      ...actual.EMPTY_RELAY_VALUE,
      send: sendMock,
      accounts: accountsMock,
      messages: messagesMock,
    }),
  };
});

import {
  ViServerErrorLine,
  ViSettingsRows,
  VI_ACK_TIMEOUT_MS,
  VI_ACK_TIMEOUT_TEXT,
  VI_AMOUNT_LIMIT_MESSAGE,
  VI_DEFAULT_AMOUNT_MANWON,
  VI_DEFAULT_CHECK_RATE,
  VI_SET_SEND_FAILED_TEXT,
} from '../workbench/vi-settings-rows';
import { MAX_VI_ORDER_AMOUNT_MANWON, manwonToKrw } from '@/lib/vi-alert';
import type { RelayServerMessageEntry, RelayViTriggers } from '@/lib/use-relay-socket';

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

/** 거래소 칸 → 그 계좌의 (계좌, 거래소) 슬롯 맵 (Phase 32 D-18 — 행은 슬롯을 읽는다). 키 부재는 그대로 「모름」 이다. */
function slotsOf(triggers: RelayViTriggers, accountNo: string): Map<string, RelayViTrigger | null> {
  const m = new Map<string, RelayViTrigger | null>();
  for (const ex of ['KRX', 'NXT'] as const) {
    const v = triggers[ex];
    if (v !== undefined) m.set(`${accountNo}|${ex}`, v);
  }
  return m;
}

type RowsProps = Omit<React.ComponentProps<typeof ViSettingsRows>, 'viSlots' | 'accounts'> & {
  viTriggers: RelayViTriggers;
};

/** 한 계좌 화면 — 계좌 목록이 비어 고른 계좌 두 행만 선다(종전 모양). 거래소 칸 시드를 그 계좌 슬롯으로 옮긴다. */
function Rows({ viTriggers, ...rest }: RowsProps) {
  return <ViSettingsRows viSlots={slotsOf(viTriggers, rest.accountNo)} accounts={[]} {...rest} />;
}

function renderRows(props: Partial<RowsProps> = {}) {
  return render(<Rows viTriggers={BOTH} accountNo={ACCOUNT} {...props} />);
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
  messagesMock = [];
});

describe('줄 구성 (D-05)', () => {
  it('KRX 한 줄 · NXT 한 줄 — 태그 · 스위치 · 상승률 · 금액. 계좌는 줄에 없다', () => {
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
    // ★ 계좌 셀렉터는 상태줄 몫이다(Q-1). VI 브라우저 알림 스위치는 기능째 제거됐다 — 줄에 되살아나지 않는다(quick-260922-tqr).
    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'VI 마감 알림' })).toBeNull();
    expect(screen.queryByText('계좌')).toBeNull();
  });

  it('가동 상태는 스위치가 말한다 — 줄에 「가동중」·「서버 반영」·「중지」 글자가 없다', () => {
    renderRows({ viTriggers: { KRX: trigger({ run: true }), NXT: BOTH.NXT } });
    expect(row('KRX')).toHaveAttribute('data-run', 'true');
    expect(within(row('KRX')).getByRole('switch', { name: 'VI KRX 중지' })).toHaveAttribute('aria-checked', 'true');
    expect(row('NXT')).toHaveAttribute('data-run', 'false');
    expect(within(row('NXT')).getByRole('switch', { name: 'VI NXT 시작' })).toHaveAttribute('aria-checked', 'false');
    for (const ex of ['KRX', 'NXT'] as const) {
      expect(row(ex).textContent).not.toMatch(/가동중|서버 반영|중지/);
    }
  });

  it('레이아웃 — 상승률 상자 64px · 금액 상자 92px · 머리 100% 줄 없음 · 1열 격자 / 본문 830 이상 2열', () => {
    renderRows();
    const section = document.querySelector('[data-slot="vi-settings-rows"]') as HTMLElement;
    expect(section.className).toContain('grid-cols-1');
    expect(section.className).toContain('@min-[830px]/wb:grid-cols-2');
    for (const ex of ['KRX', 'NXT'] as const) {
      expect(rateInput(ex).parentElement!.className).toContain('w-16');
      expect(amountInput(ex).parentElement!.className).toContain('w-[92px]');
      expect(row(ex).querySelector('[class*="flex-[1_1_100%]"]')).toBeNull();
      // 태그 · 스위치는 줄의 직접 자식이다(한 줄 배치)
      expect(within(row(ex)).getByRole('switch').parentElement).toBe(row(ex));
    }
    const blocks = document.querySelectorAll('[data-slot="vi-settings-block"]');
    expect(blocks[1].className).toContain('@min-[830px]/wb:not-first:border-l');
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
      <Rows
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
  it('viTriggers 가 비어 있어도 두 줄 · 스위치 OFF · 기본값', () => {
    renderRows({ viTriggers: {} });
    for (const ex of ['KRX', 'NXT'] as const) {
      const r = within(row(ex));
      expect(r.getByRole('switch', { name: `VI ${ex} 시작` })).toHaveAttribute('aria-checked', 'false');
      expect(row(ex)).toHaveAttribute('data-run', 'false');
      expect(rateInput(ex).value).toBe(String(VI_DEFAULT_CHECK_RATE));
      expect(amountInput(ex).value).toBe(new Intl.NumberFormat('ko-KR').format(VI_DEFAULT_AMOUNT_MANWON));
    }
    // 별도 빈 상태 문구 · 스피너 없음
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelector('[data-slot="vi-settings-empty"]')).toBeNull();
  });

  it('스냅샷에 KRX 만 있으면 NXT 줄은 기본값 · 중지, KRX 줄만 서버 값', () => {
    renderRows({ viTriggers: { KRX: trigger({ run: true, checkRate: 27, orderAmountKrw: 30_000_000 }) } });
    expect(rateInput('KRX').value).toBe('27');
    expect(amountInput('KRX').value).toBe('3,000');
    expect(row('KRX')).toHaveAttribute('data-run', 'true');
    expect(within(row('KRX')).getByRole('switch', { name: 'VI KRX 중지' })).toHaveAttribute('aria-checked', 'true');
    expect(rateInput('NXT').value).toBe(String(VI_DEFAULT_CHECK_RATE));
    expect(row('NXT')).toHaveAttribute('data-run', 'false');
    expect(within(row('NXT')).getByRole('switch', { name: 'VI NXT 시작' })).toHaveAttribute('aria-checked', 'false');
  });

  it('빈 61(null · 미등록)은 입력값을 지우지 않는다 (CR-01)', () => {
    const { rerender } = renderRows({ viTriggers: { KRX: trigger(), NXT: null } });
    fireEvent.change(rateInput('NXT'), { target: { value: '31' } });
    rerender(<Rows viTriggers={{ KRX: trigger(), NXT: null }} accountNo={ACCOUNT} />);
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
      <Rows viTriggers={{ KRX: trigger({ checkRate: 30 }), NXT: BOTH.NXT }} accountNo={ACCOUNT} />,
    );
    expect(fixButton('KRX')).toBeNull();
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
  it('더티 중 에코가 오면 값을 덮고 고지는 띄우지 않는다 (2026-09-29 「다른 단말에서 변경됨」 제거)', () => {
    const { rerender } = renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    rerender(
      <Rows viTriggers={{ KRX: trigger({ checkRate: 26 }), NXT: BOTH.NXT }} accountNo={ACCOUNT} />,
    );
    expect(rateInput('KRX').value).toBe('26');
    expect(fixButton('KRX')).toBeNull();
    const block = document.querySelector('[data-slot="vi-settings-block"][data-exchange="KRX"]') as HTMLElement;
    expect(within(block).queryByRole('status')).toBeNull();
    expect(screen.queryByText(/다른 단말/)).toBeNull();
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
    // Phase 32 D-18: 행의 계좌 = 고른 계좌다. 고른 계좌가 공란이면(계좌 도착 전) 두 행 모두 잠긴다.
    renderRows({ viTriggers: { KRX: null, NXT: trigger({ exchange: 'NXT', run: true }) }, accountNo: '' });
    expect(within(row('KRX')).getByRole('switch', { name: 'VI KRX 시작' })).toBeDisabled();
    expect(within(row('NXT')).getByRole('switch', { name: 'VI NXT 중지' })).toBeDisabled();
  });

  it('더티 상태에서 세션이 끊기면 「수정」을 눌러도 아무것도 나가지 않고, 돌아오면 같은 클릭이 나간다', () => {
    const { rerender } = renderRows();
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    rerender(<Rows viTriggers={BOTH} accountNo={ACCOUNT} disabled />);
    expect(fixButton('KRX')).toBeDisabled();
    fireEvent.click(fixButton('KRX')!);
    expect(sendMock).not.toHaveBeenCalled();
    expect(rateInput('KRX').value).toBe('30'); // 더티 값 보존

    rerender(<Rows viTriggers={BOTH} accountNo={ACCOUNT} />);
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
  18-13 이관 — 옛 VI 화면 상태줄의 VI 몫 서버 거부(`vi-server-error`)는 한 자리 경보다.
  판정(`isViServerMessage`)은 작업대의 `useViServerError` 가 하고 `ViServerErrorLine` 은 받은 1건을
  그리기만 한다. 자리(VI 패널 스트립 줄 아래)는 작업대 테스트가 잠근다.
*/
describe('VI 몫 서버 거부 — 인라인 경보 (옛 VI 화면 ② · T-16-07)', () => {
  it('error 가 있으면 role="alert" 로 출처 배지 + 원문을 그린다', () => {
    render(<ViServerErrorLine error={{ text: '상승률 조건 미달로 건너뜀', src: 'VITrigger' }} />);
    const el = document.querySelector('[data-slot="vi-server-error"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('role', 'alert');
    expect(el.querySelector('[data-slot="vi-server-error-src"]')?.textContent).toBe('[VI]');
    expect(el).toHaveTextContent('상승률 조건 미달로 건너뜀');
  });

  it('`SetVITrigger`·`Account` 출처는 `[서버]` 다 — 배지 판정은 serverMsgBadge 하나다', () => {
    render(<ViServerErrorLine error={{ text: 'VI 주문금액이 0 입니다', src: 'SetVITrigger' }} />);
    expect(document.querySelector('[data-slot="vi-server-error-src"]')?.textContent).toBe('[서버]');
  });

  it('error 가 null 이면 아무것도 그리지 않는다', () => {
    const { container } = render(<ViServerErrorLine error={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('[data-slot="vi-server-error"]')).toBeNull();
  });

  it('거부가 없으면 설정 줄 섹션은 경보를 그리지 않는다 — 한 자리 경보의 자리는 작업대가 정한다', () => {
    renderRows();
    expect(document.querySelector('[data-slot="vi-server-error"]')).toBeNull();
  });
});

// (Phase 32 D-18) 「등록 계좌 정본 · 고지」(18-15 CR-02) 와 「상태줄 계좌로 옮겨 시작」(18-28 GC-WR-04) describe 는 지웠다 —
// 행이 (계좌, 거래소) 슬롯이라 행의 계좌가 곧 정본이고 옮길 곳이 없다. 대체 단언은 아래 「P32 옮기기 제거 · 슬롯 오류」.

/*
  Phase 32 D-18 · UI-SPEC S12 — 작업대 VI 설정 행 = 상단 줄에서 고른 계좌의 (계좌, 거래소) 슬롯.
  행은 세션 계좌 × KRX · NXT 를 전부 마운트하고 고른 계좌 두 행만 보인다(숨은 행 = 더티 보존).
  저장(`vi.set`)은 그 행의 계좌로만 나간다 — 다른 계좌 슬롯은 건드리지 않는다.
*/
describe('P32 고른 계좌 슬롯 (D-18 · S12)', () => {
  const A = '1111111101';
  const B = '2222222202';
  const ACCOUNTS: RelayAccount[] = [
    { accountNo: A, name: '위탁종합' },
    { accountNo: B, name: '위탁CMA' },
  ];
  /** A 는 KRX 가동(3,000만원 · 27%) · NXT 미등록, B 는 두 거래소 미등록(빈 행). */
  const SLOTS = new Map<string, RelayViTrigger | null>([
    [`${A}|KRX`, trigger({ accountNo: A, run: true, checkRate: 27, orderAmountKrw: 30_000_000 })],
    [`${A}|NXT`, null],
    [`${B}|KRX`, null],
    [`${B}|NXT`, null],
  ]);
  const group = (acct: string) =>
    document.querySelector(`[data-slot="vi-settings-account"][data-account="${acct}"]`) as HTMLElement;
  const slotRow = (acct: string, ex: 'KRX' | 'NXT') =>
    group(acct).querySelector(`[data-slot="vi-settings-row"][data-exchange="${ex}"]`) as HTMLElement;
  const slotInput = (acct: string, ex: 'KRX' | 'NXT', field: 'rate' | 'amount') =>
    slotRow(acct, ex).querySelector(`input[id$="-${field}"]`) as HTMLInputElement;
  const slotFix = (acct: string, ex: 'KRX' | 'NXT') =>
    slotRow(acct, ex).querySelector('[data-slot="vi-row-fix"]') as HTMLButtonElement | null;
  const renderSlots = (accountNo: string, over: Partial<React.ComponentProps<typeof ViSettingsRows>> = {}) =>
    render(<ViSettingsRows viSlots={SLOTS} accounts={ACCOUNTS} accountNo={accountNo} {...over} />);

  it('A 를 고르면 A 의 KRX 슬롯 값 · 가동이 보이고, B 행은 마운트된 채 숨는다', () => {
    renderSlots(A);
    expect(group(A)).not.toHaveAttribute('hidden');
    expect(group(B)).toHaveAttribute('hidden');
    expect(slotRow(B, 'KRX')).not.toBeNull(); // DOM 에 있다(마운트 유지)
    expect(slotRow(A, 'KRX')).toHaveAttribute('data-run', 'true');
    // 보이는 행만 종전 id 를 갖는다 — 숨은 행과 id 가 겹치지 않는다.
    expect(rateInput('KRX')).toBe(slotInput(A, 'KRX', 'rate'));
    expect(rateInput('KRX').value).toBe('27');
    expect(amountInput('KRX').value).toBe('3,000');
    expect(document.querySelectorAll('#vi-krx-rate')).toHaveLength(1);
  });

  it('B 로 바꾸면 B 의 행(미등록 빈 행 · 중지 · 기본값)이 보이고 A 행이 숨는다', () => {
    const { rerender } = renderSlots(A);
    rerender(<ViSettingsRows viSlots={SLOTS} accounts={ACCOUNTS} accountNo={B} />);
    expect(group(B)).not.toHaveAttribute('hidden');
    expect(group(A)).toHaveAttribute('hidden');
    expect(rateInput('KRX')).toBe(slotInput(B, 'KRX', 'rate'));
    expect(slotRow(B, 'KRX')).toHaveAttribute('data-run', 'false');
    expect(rateInput('KRX').value).toBe(String(VI_DEFAULT_CHECK_RATE));
    expect(within(slotRow(B, 'KRX')).getByRole('switch', { name: 'VI KRX 시작' })).not.toBeDisabled();
    // A 의 가동 값은 A 행에 그대로 남아 있다.
    expect(slotInput(A, 'KRX', 'rate').value).toBe('27');
  });

  it('A 행 편집(더티)은 B 로 갔다 A 로 돌아와도 그대로다 — 더티 합은 숨은 행을 포함한다', () => {
    const onDirtyCountChange = vi.fn();
    const { rerender } = renderSlots(A, { onDirtyCountChange });
    fireEvent.change(rateInput('NXT'), { target: { value: '31' } });
    expect(onDirtyCountChange).toHaveBeenLastCalledWith(1);
    rerender(
      <ViSettingsRows viSlots={SLOTS} accounts={ACCOUNTS} accountNo={B} onDirtyCountChange={onDirtyCountChange} />,
    );
    expect(rateInput('NXT').value).toBe(String(VI_DEFAULT_CHECK_RATE)); // B 행
    expect(onDirtyCountChange).toHaveBeenLastCalledWith(1); // 숨은 A 행 몫
    rerender(
      <ViSettingsRows viSlots={SLOTS} accounts={ACCOUNTS} accountNo={A} onDirtyCountChange={onDirtyCountChange} />,
    );
    expect(rateInput('NXT').value).toBe('31');
    expect(slotFix(A, 'NXT')).not.toBeNull();
  });

  it('B 행에 입력해 저장하면 vi.set 은 B 계좌 · 그 거래소로 나간다 (A 송신 0)', () => {
    renderSlots(B);
    fireEvent.change(amountInput('KRX'), { target: { value: '700' } });
    fireEvent.click(slotFix(B, 'KRX')!);
    expect(sentMsgs()).toEqual([
      { t: 'vi.set', accountNo: B, exchange: 'KRX', orderAmountKrw: manwonToKrw(700), checkRate: 22, run: false },
    ]);
  });

  it('A 슬롯 에코는 A 행만 바꾼다 — 같은 거래소의 B 행 더티는 그대로', () => {
    const { rerender } = renderSlots(B);
    fireEvent.change(rateInput('KRX'), { target: { value: '33' } });
    const next = new Map(SLOTS);
    next.set(`${A}|KRX`, trigger({ accountNo: A, run: true, checkRate: 29, orderAmountKrw: 30_000_000 }));
    rerender(<ViSettingsRows viSlots={next} accounts={ACCOUNTS} accountNo={B} />);
    expect(rateInput('KRX').value).toBe('33');
    expect(slotFix(B, 'KRX')).not.toBeNull();
    expect(slotInput(A, 'KRX', 'rate').value).toBe('29');
  });

  it('계좌 1개면 2행 — 지금과 같은 모양', () => {
    render(<ViSettingsRows viSlots={SLOTS} accounts={[ACCOUNTS[0]]} accountNo={A} />);
    expect(document.querySelectorAll('[data-slot="vi-settings-row"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="vi-settings-account"]')).toHaveLength(1);
  });
});

/*
  Phase 32 D-18 · UI-SPEC S12 — 계좌별 슬롯이면 「옮기기」 는 뜻이 없다(같은 거래소에 다른 계좌로 저장 = 그 계좌의 새 슬롯).
  옮기기 버튼 · 확인 창의 이동 표기 · 등록 계좌 고지 줄이 없고, 행의 `vi.set` 은 언제나 행의 계좌로 나간다.
  `vi.set` 거부(relay 거부 · 54 SetVITrigger)는 보낸 (계좌, 거래소) 행에만 기존 VI 오류 문구로 선다.
*/
describe('P32 옮기기 제거 · 슬롯 오류 (D-18 · S12)', () => {
  const A = '1111111101';
  const B = '2222222202';
  const OTHER = '9999999909';
  const ACCOUNTS: RelayAccount[] = [
    { accountNo: A, name: '위탁종합' },
    { accountNo: B, name: '위탁CMA' },
  ];
  const group = (acct: string) =>
    document.querySelector(`[data-slot="vi-settings-account"][data-account="${acct}"]`) as HTMLElement;
  const slotBlock = (acct: string, ex: 'KRX' | 'NXT') =>
    group(acct).querySelector(`[data-slot="vi-settings-block"][data-exchange="${ex}"]`) as HTMLElement;
  const slotFix = (acct: string, ex: 'KRX' | 'NXT') =>
    slotBlock(acct, ex).querySelector('[data-slot="vi-row-fix"]') as HTMLButtonElement | null;
  const slotError = (acct: string, ex: 'KRX' | 'NXT') =>
    slotBlock(acct, ex).querySelector('[data-slot="vi-row-server-error"]') as HTMLElement | null;
  const msg = (over: Partial<RelayServerMessageEntry>): RelayServerMessageEntry => ({
    t: 'msg',
    lv: 'ERROR',
    m: '',
    i: '',
    a: '',
    src: 'Relay',
    kind: 'vi.set',
    receivedAt: '09:00:00',
    ...over,
  });

  it('어떤 슬롯 상태에서도 「옮기기」 버튼 · 이동 확인 창이 없고, 시작은 행의 계좌로 나간다', async () => {
    // 슬롯 값의 계좌가 행 계좌와 달라도(옛 모양 에코 · 공란) 행의 계좌가 정본이다.
    const slots = new Map<string, RelayViTrigger | null>([
      [`${A}|KRX`, trigger({ accountNo: OTHER, run: false })],
      [`${A}|NXT`, trigger({ exchange: 'NXT', accountNo: '', run: false })],
    ]);
    render(<ViSettingsRows viSlots={slots} accounts={ACCOUNTS} accountNo={A} />);
    expect(document.querySelector('[data-slot="vi-row-move"]')).toBeNull();
    expect(screen.queryByText(/옮겨 시작/)).toBeNull();

    fireEvent.click(within(slotBlock(A, 'KRX')).getByRole('switch', { name: 'VI KRX 시작' }));
    const dlg = await screen.findByTestId('vi-start-dialog');
    expect(dlg).not.toHaveAttribute('data-move');
    expect(dlg.querySelector('[data-slot="vi-confirm-move"]')).toBeNull();
    expect(within(dlg).getByText('계좌', { selector: 'dt' }).nextElementSibling).toHaveTextContent(`${A} · 위탁종합`);
    fireEvent.click(within(dlg).getByRole('button', { name: '시작' }));
    expect(sentMsgs()).toEqual([expect.objectContaining({ accountNo: A, exchange: 'KRX', run: true })]);
  });

  it('vi.set 거부가 오면 보낸 (계좌, 거래소) 행에만 기존 VI 오류 문구가 선다 — 다른 계좌의 같은 거래소 행에는 없다', () => {
    const slots = new Map<string, RelayViTrigger | null>([
      [`${A}|KRX`, trigger({ accountNo: A })],
      [`${A}|NXT`, null],
      [`${B}|KRX`, null],
      [`${B}|NXT`, null],
    ]);
    const view = (accountNo: string) => (
      <ViSettingsRows viSlots={slots} accounts={ACCOUNTS} accountNo={accountNo} />
    );
    const { rerender } = render(view(A));
    fireEvent.change(rateInput('KRX'), { target: { value: '30' } });
    fireEvent.click(slotFix(A, 'KRX')!);
    expect(slotFix(A, 'KRX')).toHaveTextContent('반영 중…');

    // relay 거부(소유 세션 · 계좌 대조) — 그 행만, 잠금이 풀린다.
    messagesMock = [msg({ m: '이 세션에서 사용할 수 없는 계좌입니다.', a: A })];
    rerender(view(A));
    expect(slotError(A, 'KRX')).toHaveTextContent('이 세션에서 사용할 수 없는 계좌입니다.');
    expect(slotError(A, 'KRX')).toHaveAttribute('role', 'alert');
    expect(slotFix(A, 'KRX')).toHaveTextContent('수정');
    expect(slotError(A, 'NXT')).toBeNull();
    expect(slotError(B, 'KRX')).toBeNull();

    // B 로 바꿔 B KRX 를 보내고 서버 54(SetVITrigger) 거부 — B 행에만, A 행 오류는 A 행 몫 그대로.
    rerender(view(B));
    fireEvent.change(rateInput('KRX'), { target: { value: '31' } });
    fireEvent.click(slotFix(B, 'KRX')!);
    messagesMock = [msg({ m: 'VI 주문금액이 0 입니다', a: B, src: 'SetVITrigger', kind: '' }), ...messagesMock];
    rerender(view(B));
    expect(slotError(B, 'KRX')).toHaveTextContent('VI 주문금액이 0 입니다');
    expect(slotError(B, 'KRX')).toHaveTextContent('[서버]');
    expect(slotError(B, 'NXT')).toBeNull();
    expect(slotError(A, 'KRX')).toHaveTextContent('이 세션에서 사용할 수 없는 계좌입니다.');
    expect(sentMsgs().map((m) => m.accountNo)).toEqual([A, B]);
  });

  it('「계좌 … 에 등록된 VI 예요」 고지 줄이 없다 — 행 블록은 행 한 줄뿐이다(가동 · 중지 모두)', () => {
    const slots = new Map<string, RelayViTrigger | null>([
      [`${A}|KRX`, trigger({ accountNo: OTHER, run: true })],
      [`${A}|NXT`, trigger({ exchange: 'NXT', accountNo: OTHER, run: false })],
    ]);
    render(<ViSettingsRows viSlots={slots} accounts={ACCOUNTS} accountNo={A} />);
    expect(document.querySelector('[data-slot="vi-row-account"]')).toBeNull();
    expect(document.querySelector('[data-slot="vi-row-account-box"]')).toBeNull();
    expect(screen.queryByText(/에 등록된 VI 예요/)).toBeNull();
    for (const ex of ['KRX', 'NXT'] as const) {
      expect(slotBlock(A, ex).children).toHaveLength(1);
    }
  });
});
