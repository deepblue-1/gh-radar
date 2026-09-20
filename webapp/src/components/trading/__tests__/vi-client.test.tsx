import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { RelayAccountState, RelayUnfilled, RelayViNoticeMsg } from '@gh-radar/shared';

/**
 * Phase 17 Plan 06 Task 3 — VI 화면의 **서버 메시지 출처 배지**와 **발동 통보 거래소**
 * (TRADE-04 · D-06 · D-09 · D-17).
 *
 * 여기서 잠그는 것은 **어느 시장의 사실인가**와 **누가 한 말인가**다:
 *   ① `vi.notice` 표시에 거래소가 함께 나온다 — 같은 종목이 양쪽에서 발동하면 서로 다른
 *      주문이고, 거래소를 지우면 사용자는 어느 쪽이 잡혔는지 알 수 없다.
 *   ② 서버 메시지 앞에 출처 배지가 붙고, 판정은 `serverMsgBadge` **한 함수**만 쓴다.
 *   ③ 상따 몫 통지는 **여전히 그리지 않는다** (Pitfall 9) — 배지가 생겼다고 남의 거부를
 *      끌어오면, 사용자는 멀쩡한 VI 를 껐다 켜고 그 재등록이 두 번째 무인 발주다.
 */

type RelayShape = ReturnType<typeof import('@/lib/relay-provider').useRelayContext>;

let mockRelay: RelayShape;

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/trading/vi',
}));

import { AccountPanel } from '@/components/orderbook/account-panel';
import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { ViClient } from '../vi-client';

/** 이 저장소의 표면 앵커는 `data-slot` 이다 (`data-testid` 는 다이얼로그 전용). */
const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);

const ACCOUNT = '37728502101';

/** ServerMessage 1건 — 이 테스트가 보는 것은 `src` 와 `m` 뿐이다. */
function msg(src: string, m: string, over: { i?: string; lv?: 'INFO' | 'WARN' | 'ERROR' } = {}) {
  return {
    t: 'msg' as const,
    lv: over.lv ?? ('ERROR' as const),
    i: over.i ?? '',
    a: ACCOUNT,
    src,
    kind: '',
    m,
    receivedAt: '13:42:05',
  };
}

function notice(over: Partial<RelayViNoticeMsg> = {}): RelayViNoticeMsg {
  return {
    t: 'vi.notice',
    isin: 'KR7005930003',
    exchange: 'KRX',
    accountNo: ACCOUNT,
    triggerPrice: 41_250,
    basePrice: 33_510,
    changeRate: 23,
    orderPrice: 48_750,
    orderQty: 205,
    market: 'K',
    orderSeq: 1,
    viEndTime: '134530250',
    name: '삼성전자',
    ...over,
  };
}

function relayState(over: Partial<RelayShape> = {}): RelayShape {
  return {
    ...EMPTY_RELAY_VALUE,
    status: 'ready',
    statusLabel: '실시간',
    accounts: [{ accountNo: ACCOUNT, name: 'KB 위탁종합' }],
    ...over,
  };
}

beforeEach(() => {
  mockRelay = relayState();
  window.localStorage.clear();
});

describe('① `vi.notice` 발동 통보 — 거래소를 함께 말한다 (D-06)', () => {
  it('최근 발동 종목과 **거래소**가 상태줄에 나온다', () => {
    mockRelay = relayState({ viNotices: [notice({ exchange: 'NXT' })] });
    render(<ViClient />);

    const notice$ = slot('vi-last-notice') as HTMLElement;
    expect(notice$).not.toBeNull();
    expect(within(notice$).getByText('삼성전자')).toBeInTheDocument();
    expect(notice$).toHaveTextContent('NXT');
  });

  it('같은 종목이 양쪽에서 발동해도 **최신 1건**의 거래소를 말한다 (누적 최신 우선)', () => {
    mockRelay = relayState({
      viNotices: [notice({ exchange: 'KRX' }), notice({ exchange: 'NXT' })],
    });
    render(<ViClient />);
    expect(slot('vi-last-notice')).toHaveTextContent('KRX');
  });

  it('통보가 없으면 그 줄 자체가 없다 — 없는 발동을 지어내지 않는다', () => {
    render(<ViClient />);
    expect(slot('vi-last-notice')).toBeNull();
  });

  it('종목명을 모르면 ISIN 을 보여 준다 (이름을 지어내지 않는다)', () => {
    mockRelay = relayState({ viNotices: [notice({ name: undefined })] });
    render(<ViClient />);
    expect(slot('vi-last-notice')).toHaveTextContent('KR7005930003');
  });
});

describe('② 서버 메시지 출처 배지 (D-09 · D-17)', () => {
  it('`VITrigger` 런타임 사유 줄은 `[VI]` 배지를 달고 그려진다', () => {
    mockRelay = relayState({ messages: [msg('VITrigger', '상승률 조건 미달로 건너뜀')] });
    render(<ViClient />);

    const error$ = slot('vi-server-error');
    expect(error$).toHaveTextContent('[VI]');
    expect(error$).toHaveTextContent('상승률 조건 미달로 건너뜀');
  });

  it('`SetVITrigger`·`Account` 는 `[서버]` 다 — 모르는 출처는 모른다고 말한다', () => {
    mockRelay = relayState({ messages: [msg('SetVITrigger', 'VI 주문금액이 0 입니다')] });
    const view = render(<ViClient />);
    expect(slot('vi-server-error')).toHaveTextContent('[서버]');
    view.unmount();

    mockRelay = relayState({ messages: [msg('Account', '주문 가능 금액이 부족합니다')] });
    render(<ViClient />);
    expect(slot('vi-server-error')).toHaveTextContent('[서버]');
  });

  /*
    ★ Pitfall 9 는 **그대로**다. 배지가 생겼다고 이 화면이 상따 몫을 끌어오지 않는다 —
      `isViServerMessage` 가 유일 판정 지점이고, `[상따]` 배지가 보여야 하는 표면은
      메시지 전량을 그리는 상태 바(17-08)이지 VI 화면이 아니다.
  */
  it('`LimitChaser` 사유 줄은 VI 화면이 **그리지 않는다** (남의 거부를 내 거부로 그리지 않는다)', () => {
    mockRelay = relayState({ messages: [msg('LimitChaser', '상따 매수 조건 미달')] });
    render(<ViClient />);
    expect(slot('vi-server-error')).toBeNull();
  });

  it('종목이 붙은 `Account` 통지(상따 몫)도 그리지 않는다 (16-13 판정 승계)', () => {
    mockRelay = relayState({
      messages: [msg('Account', '주문 가능 금액이 부족합니다', { i: 'KR7005930003' })],
    });
    render(<ViClient />);
    expect(slot('vi-server-error')).toBeNull();
  });
});

/**
 * Phase 17 Plan 09 Task 1 — 미체결 표식은 **두 표면이 같은 문자열**이다 (D-13).
 *
 * ★ 실측 결과(17-09): VI 화면은 자기 미체결 표를 그리지 않는다. 거래소 필터로 행을 줄인
 *   `panelAccount` 를 `AccountPanel` 에 넘기고 헤더 자리만 빌린다(vi-client ⑥). 그래서
 *   표식을 만드는 자리는 계좌 패널 한 곳뿐이고, 이 테스트는 그 사실이 **런타임에서도**
 *   참인지를 같은 행으로 두 번 렌더해 문자열을 비교하는 방식으로 잠근다.
 */
describe('③ 미체결 표식 — 두 표면이 같은 문자열이다 (17-09 / D-13)', () => {
  const ROW: RelayUnfilled = {
    orderNo: 'Q091533123',
    orgOrderNo: '',
    isin: 'KR7005930003',
    side: 'B',
    price: 41_250,
    orderQty: 100,
    filledQty: 0,
    unfilledQty: 100,
    exchange: 'KRX',
    orderTime: '091533',
    queuedStatus: '발사완료 미발주 3주',
    pendingStatus: '증권사 보관 · 09:00 처리',
    board: '',
    pendingCancelSent: false,
  };

  function acct(rows: RelayUnfilled[]): RelayAccountState {
    return { t: 'acct', a: ACCOUNT, snap: true, hold: [], unf: rows, rm: [], st: '09:15:33' };
  }

  function sideTextOf(root: ParentNode): string {
    return root.querySelector('[data-slot="account-unfilled-side"]')?.textContent ?? '';
  }

  it('같은 행을 VI 화면과 계좌 패널에서 보면 표식이 **한 글자도** 다르지 않다', () => {
    mockRelay = relayState({ accountStates: new Map([[ACCOUNT, acct([ROW])]]) });
    const vi = render(<ViClient />);
    const viText = sideTextOf(document);
    expect(viText).toBe('▲ 매수QP');
    vi.unmount();

    render(
      <AccountPanel selectedAccountNo={ACCOUNT} account={acct([ROW])} status="ready" />,
    );
    expect(sideTextOf(document)).toBe(viText);
  });
});
