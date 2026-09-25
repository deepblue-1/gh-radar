import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

/**
 * Phase 20 Plan 04 Task 3 — 상따 설정 **토스식 리스트** 폼 계약 (TRADE-01 · D-01~D-04 · D-19~D-22).
 *
 * 옛 판(Phase 16-12 ~ 18-10)은 「값 변경 → 더티 → 하단 「수정」」 모델을 잠갔다. D-04 로 그 모델은
 * 폐기됐고 **확정 1회 = 전송 1회**가 됐다. 옛 describe 는 지우지 않고 의미를 옮겨 다시 썼다 —
 * describe 이름 끝 괄호가 옛 번호다(추적성).
 *
 * 잠그는 규칙:
 *   ① 스위치 4개는 확인 없이 즉시 전송(Phase 16 D-05) · 매수취소 = `cancelQtyEnabled`(D-21)
 *   ② 값 확정 = 1회 전송(D-04) · 값 필드는 낙관 반영 없음(D-06) · 더티 바 없음
 *   ③ 반영 판정은 에코의 그 필드 값뿐(거부도 답 신호를 올린다)
 *   ④ 동시에 나가 있는 전송은 1건(직렬화)
 *   ⑤ 전부 OFF = `crud "D"` · 취소 게이트가 살아 있으면 `"C"`(D-08 · Pitfall 7)
 *   ⑥ S→C 전용 필드 미송신 · cfg 32키 · 클라 고정 3(Pitfall 6)
 *   ⑦ 리스트 구성(D-19 · D-20 · D-21 · D-22) · 44px · 꺼진 그룹 흐림(편집 가능)
 *   ⑧ 감시대상 행 안 토글(D-02 · D-02a)
 *   ⑨ 체크 행(D-22)
 *   ⑩ 무장 불가(WR-06 · GC-WR-12 · R2-WR-02 · T-16-44)
 *   ⑪ 미등록 전략은 값·체크·감시대상이 로컬만, 등록은 스위치만(A-P1)
 *   ⑫ pane·탭 — 두 pane 이 늘 DOM · CSS 숨김
 *   ⑬ 에코가 목록을 이긴다 · 편집 중 버퍼는 보존(D-11 · E4)
 *   ⑭ 터치 기기 = 시트 · 「감시 중」 안내는 그 그룹이 감시 중일 때만(D-05 · D-12)
 *
 * ★ 스텁 경계 — `@/lib/relay-provider` 의 `useRelayContext` 하나다. `send` 의 반환값은 「소켓에
 *   실었는가」 하나다(16-19). 서버 응답은 `rerender(<LimitChaserForm server=… serverAnswerSeq=… />)`
 *   로 흉내 낸다 — 카드 상태 훅이 하는 일(에코 · 답 신호)을 그대로 준다.
 * ★ jsdom 에는 CSS 도 레이아웃도 없다 — 밴드별 모양은 **클래스 계약**으로만 단언하고 실제 폭은
 *   20-07 P20-3(Playwright)이 잰다. 없는 검증을 했다고 적지 않는다.
 */

const sendMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock }),
  };
});

import { mockPointer, restoreMatchMedia } from '@/lib/__tests__/match-media';
import { LimitChaserForm, type LimitChaserFormProps } from '../limit-chaser-form';

const ISIN = 'KR7086520004';
const ACCOUNT = '37728502101';

/** `lc.set` 로 나간 cfg 만 뽑는다 — 다른 프레임이 섞여도 단언이 흔들리지 않는다. */
function sentConfigs(): RelayLimitChaserInput[] {
  return sendMock.mock.calls
    .map(([msg]) => msg as RelayLcSetMsg)
    .filter((msg) => msg?.t === 'lc.set')
    .map((msg) => msg.cfg);
}

function lastConfig(): RelayLimitChaserInput {
  const cfgs = sentConfigs();
  expect(cfgs.length).toBeGreaterThan(0);
  return cfgs[cfgs.length - 1]!;
}

/**
 * 서버 에코 1건. 기본은 **매수만 켜진 살아 있는 전략**이다 —
 * `floor(50만원 / 130,000) = 3주` 라 무장이 되는 값이다(0 주면 WR-06 가 전송 직전에 막는다).
 */
function echo(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    exchange: 'KRX',
    crud: 'C',
    key: `${ISIN}:${ACCOUNT}:KRX`,
    buyOrderPrice: 130_000,
    buyOrderQty: 1,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '0',
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    buyOrderAmount: 50,
    sellOrderPrice: 130_000,
    sellWatchPrice: 130_000,
    sellWatchQty: 100_000,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sweepWatchPrice: 130_000,
    sweepEnabled: false,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    cancelQtyEnabled: false,
    cancelWatchQty: 10,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    // S→C 전용 — 서버만 채운다. 폼은 되보내지 않는다(⑥).
    sellOrderQty: 76,
    sellQtyTrackBaseline: 41_200,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
    ...over,
  };
}

function props(over: Partial<LimitChaserFormProps> = {}): LimitChaserFormProps {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    server: echo(),
    ...over,
  };
}

const INLINE_FAILED = '반영하지 못했어요 · Enter 로 다시 시도해 주세요';

/** 값 행(또는 체크 값 행의 값 버튼) — 옛 입력 id 가 `data-lc-field` 다. */
const row = (id: string): HTMLElement => document.querySelector(`[data-lc-field="${id}"]`) as HTMLElement;
/** 값 슬롯 글자(「130,000원」) — 편집 중이면 null. */
const rowText = (id: string): string | null =>
  document.querySelector(`[data-lc-field="${id}"] [data-slot="lc-row-value"]`)?.textContent ?? null;
const input = (id: string): HTMLInputElement | null => document.querySelector<HTMLInputElement>(`#${id}`);
const sw = (name: string): HTMLElement => screen.getByRole('switch', { name });
const chk = (name: string): HTMLElement => screen.getByRole('checkbox', { name });
const group = (slot: string): HTMLElement => document.querySelector(`[data-slot="lc-group-${slot}"]`) as HTMLElement;
const pane = (side: 'buy' | 'sell'): HTMLElement => document.querySelector(`[data-pane="${side}"]`) as HTMLElement;
const submitError = () => document.querySelector('[data-slot="lc-submit-error"]');
const actionBar = () => document.querySelector('[data-slot="dirty-action-bar"]');

function click(el: HTMLElement): void {
  act(() => {
    fireEvent.click(el);
  });
}
/** 행을 눌러 인라인 편집을 연다(마우스 기기 · D-14). */
function openInline(id: string): HTMLInputElement {
  expect(row(id), `값 행 ${id}`).not.toBeNull();
  click(row(id));
  const el = input(id);
  expect(el, `인라인 입력 ${id}`).not.toBeNull();
  return el!;
}
function typeValue(el: HTMLInputElement, value: string): void {
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
}
function pressKey(el: HTMLElement, key: string): void {
  act(() => {
    fireEvent.keyDown(el, { key });
  });
}
/** 인라인으로 한 필드를 확정한다 — 행 클릭 → 입력 → Enter. */
function editInline(id: string, value: string): HTMLInputElement {
  const el = openInline(id);
  typeValue(el, value);
  pressKey(el, 'Enter');
  return el;
}
/** 편집기에서 포커스를 뺀다 — 이미 저장한 버퍼면 다시 보내지 않고 편집만 끝낸다. */
function blurEditor(id: string): void {
  act(() => {
    fireEvent.blur(input(id)!);
  });
}

beforeEach(() => {
  sendMock.mockReset();
  // ★ 기본은 「소켓에 실렸다」 — `mockReset()` 뒤 기본 반환 `undefined`(falsy)면 모든 케이스가
  //   「전송 실패」 경로로 떨어진다.
  sendMock.mockReturnValue(true);
});

describe('① 스위치 4개는 확인 없이 즉시 전송된다 (Phase 16 D-05 · D-21) (옛 ①)', () => {
  it('신규 폼에서 매수주문 스위치 ON → lc.set 1회 · buyEnabled true · crud "C" · **다이얼로그 없음**', () => {
    // 신규 폼 — 첫 스위치가 곧 등록이다. 상한가 시딩으로 가격이 차 있어야 무장할 수 있다(WR-06).
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(screen.getByRole('switch', { name: '매수주문 켜기' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyEnabled).toBe(true);
    expect(lastConfig().crud).toBe('C');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('한방체결 스위치도 같은 규율이다 — 1회 · sweepEnabled true', () => {
    render(<LimitChaserForm {...props()} />);
    click(screen.getByRole('switch', { name: '한방체결 켜기' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().sweepEnabled).toBe(true);
  });

  it('매도주문 스위치도 같은 규율이다 — 1회 · sellEnabled true', () => {
    render(<LimitChaserForm {...props()} />);
    click(screen.getByRole('switch', { name: '매도주문 켜기' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().sellEnabled).toBe(true);
  });

  it('★ 매수취소 스위치 = cancelQtyEnabled(D-21) — id `lc-cancel-qty` · 1회 전송', () => {
    render(<LimitChaserForm {...props()} />);
    const cancel = screen.getByRole('switch', { name: '매수취소 켜기' });
    expect(cancel.id).toBe('lc-cancel-qty');
    expect(cancel).toHaveAttribute('aria-checked', 'false');
    click(cancel);
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().cancelQtyEnabled).toBe(true);
    // 토글은 전송 뒤 낙관 표시한다(선택 면만) — 실패하면 서버 값으로 되돌린다(⑨).
    expect(screen.getByRole('switch', { name: '매수취소 켜기' })).toHaveAttribute('aria-checked', 'true');
  });

  it('`send` 가 false 면 스위치 낙관 반영이 없고 폼 맨 위에 기존 문장이 선다 (GC-WR-06)', () => {
    sendMock.mockReturnValue(false);
    render(<LimitChaserForm {...props()} />);
    click(screen.getByRole('switch', { name: '매도주문 켜기' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(screen.getByRole('switch', { name: '매도주문 켜기' })).toHaveAttribute('aria-checked', 'false');
    const err = submitError() as HTMLElement;
    expect(err).toHaveAttribute('role', 'alert');
    expect(err.textContent).toBe('연결이 끊겨 켜기/끄기를 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.');
  });
});

describe('② 값 확정 = 1회 전송 · 더티 바 없음 (D-04 · D-06) (옛 ②③④ 재정의)', () => {
  it('매수가격 인라인 150000 Enter → lc.set 1회 · cfg 매수가격 150000 · 나머지는 서버 값', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '150000');
    expect(sentConfigs()).toHaveLength(1);
    const cfg = lastConfig();
    expect(cfg.buyOrderPrice).toBe(150_000);
    expect(cfg.buyWatchQty).toBe(10_000);
    expect(cfg.sellOrderRatio).toBe(100);
    expect(cfg.buyEnabled).toBe(true);
  });

  it('더티 바 · 「수정」 · 「되돌리기」가 어디에도 없다 — 편집 뒤에도', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '150000');
    expect(actionBar()).toBeNull();
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    expect(document.body.textContent).not.toContain('「수정」을 눌러야 반영돼요');
  });

  it('값 필드는 낙관 반영이 없다 — 편집이 끝나도 에코 전 행은 서버 값 「130,000원」 · 반영 중', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '150000');
    blurEditor('lc-buy-order-price');
    expect(input('lc-buy-order-price')).toBeNull();
    expect(rowText('lc-buy-order-price')).toBe('130,000원');
    expect(row('lc-buy-order-price')).toHaveAttribute('aria-busy', 'true');
    expect(sentConfigs()).toHaveLength(1);
  });

  it('Esc 와 같은 값 Enter 는 전송 0 이다', () => {
    render(<LimitChaserForm {...props()} />);
    const el = openInline('lc-buy-watch-qty');
    typeValue(el, '9000');
    pressKey(el, 'Escape');
    expect(input('lc-buy-watch-qty')).toBeNull();
    editInline('lc-buy-watch-qty', '10000');
    expect(sentConfigs()).toHaveLength(0);
    expect(rowText('lc-buy-watch-qty')).toBe('10,000주');
  });
});

describe('③ 반영 판정은 에코 값 일치뿐이다 (D-06 · Pitfall 1·4) (옛 ③ 재정의)', () => {
  it('에코 값 일치 → 편집 닫힘 · 행 「150,000원」 · 값 글자 --primary 900ms 강조', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { rerender } = render(<LimitChaserForm {...props()} />);
      editInline('lc-buy-order-price', '150000');
      rerender(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 150_000 }), serverAnswerSeq: 1 })} />);
      expect(input('lc-buy-order-price')).toBeNull();
      expect(rowText('lc-buy-order-price')).toBe('150,000원');
      const slot = row('lc-buy-order-price').querySelector('[data-slot="lc-row-value"]') as HTMLElement;
      expect(slot.className).toContain('text-[var(--primary)]');
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(slot.className).not.toContain('text-[var(--primary)]');
    } finally {
      vi.useRealTimers();
    }
  });

  it('답만 오고 값이 다르면 실패 — 편집 유지 · 입력 150,000 보존 · 말풍선 · 재전송 0', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    editInline('lc-buy-order-price', '150000');
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(input('lc-buy-order-price')).not.toBeNull();
    expect(input('lc-buy-order-price')!.value).toBe('150,000');
    expect(input('lc-buy-order-price')!.readOnly).toBe(false);
    expect(screen.getByText(INLINE_FAILED).closest('[role="alert"]')).not.toBeNull();
    expect(sentConfigs()).toHaveLength(1);
  });

  it('늦은 에코(답 뒤에 값)도 성공이다 — 실패가 거둬지고 행이 에코 값이 된다', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    editInline('lc-buy-order-price', '150000');
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(screen.getByText(INLINE_FAILED)).toBeInTheDocument();
    rerender(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 150_000 }), serverAnswerSeq: 1 })} />);
    expect(input('lc-buy-order-price')).toBeNull();
    expect(rowText('lc-buy-order-price')).toBe('150,000원');
    expect(screen.queryByText(INLINE_FAILED)).toBeNull();
    expect(sentConfigs()).toHaveLength(1);
  });
});

describe('④ 동시에 나가 있는 전송은 1건이다 (UI-SPEC §6 직렬화 · T-20-08)', () => {
  it('매수가격 반영 중에 주문금액을 확정하면 대기 — 에코 + 답 신호 뒤에 2회째가 나간다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '150000');
    editInline('lc-buy-order-amount', '100');
    expect(sentConfigs()).toHaveLength(1);

    const next = echo({ buyOrderPrice: 150_000 });
    rerender(<LimitChaserForm {...props({ server: next, serverAnswerSeq: 0 })} />);
    // 카드는 성공 에코 한 번에 답 신호를 한 렌더 뒤에 올린다 — 그 증가를 본 렌더에서 꺼낸다.
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: next, serverAnswerSeq: 1 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig().buyOrderAmount).toBe(100);
  });

  it('두 번째 건의 cfg 기준값은 **새 서버 값**이다 — 앞 건이 바꾼 매수가격이 실린다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '150000');
    editInline('lc-buy-order-amount', '100');
    const next = echo({ buyOrderPrice: 150_000 });
    rerender(<LimitChaserForm {...props({ server: next, serverAnswerSeq: 0 })} />);
    rerender(<LimitChaserForm {...props({ server: next, serverAnswerSeq: 1 })} />);
    expect(lastConfig().buyOrderPrice).toBe(150_000);
    expect(Object.keys(lastConfig())).toHaveLength(32);
  });
});

describe('⑤ 삭제 판정은 취소 게이트를 포함한다 (D-08 · Pitfall 7) (옛 ⑥⑦)', () => {
  it('매수만 켜진 전략의 매수 OFF = 매수·매도·취소가 전부 꺼지는 마지막 OFF → crud "D"', () => {
    render(<LimitChaserForm {...props()} />);
    click(sw('매수주문 켜기'));
    expect(lastConfig().buyEnabled).toBe(false);
    expect(lastConfig().crud).toBe('D');
  });

  it('취소잔량(매수취소 스위치)이 켜져 있으면 매수를 꺼도 crud "C" — 전략이 남는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ cancelQtyEnabled: true }) })} />);
    click(sw('매수주문 켜기'));
    expect(lastConfig().crud).toBe('C');
  });

  it('매수취소 스위치만 켜진 전략에서 그 스위치를 끄면 crud "D"', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false, cancelQtyEnabled: true }) })} />);
    click(sw('매수취소 켜기'));
    expect(lastConfig().cancelQtyEnabled).toBe(false);
    expect(lastConfig().crud).toBe('D');
  });

  it('매수취소 「체결」 체크만 켜진 전략도 살아 있다 — 매수를 꺼도 crud "C"', () => {
    render(<LimitChaserForm {...props({ server: echo({ cancelTradeEnabled: true }) })} />);
    click(sw('매수주문 켜기'));
    expect(lastConfig().crud).toBe('C');
  });
});

describe('⑥ S→C 전용 필드를 보내지 않는다 · cfg 32키 (Pitfall 6) (옛 ⑨)', () => {
  const FORBIDDEN = [
    'sellOrderQty',
    'sellQtyTrackBaseline',
    'sellEntryLatched',
    'cancelQtyTrackBaseline',
    'cancelEntryLatched',
    'buyEntryLatched',
  ] as const;
  /** 클라 입력 29 + 클라 고정 3 = 32. `key` · `market` 은 싣지 않는다(relay 파생 · WR-03 / D-28). */
  const EXPECTED_KEYS = [
    'isin',
    'accountNo',
    'exchange',
    'crud',
    'buyOrderQty',
    'buyOrderPrice',
    'buyOrderAmount',
    'buyWatchPrice',
    'buyWatchQty',
    'buyWatchSide',
    'buyMinTradeQty',
    'buyTradeQtyEnabled',
    'buyEnabled',
    'sellOrderPrice',
    'sellOrderRatio',
    'sellWatchPrice',
    'sellWatchQty',
    'sellMinTradeQty',
    'sellTradeQtyEnabled',
    'sellQtyTrackEnabled',
    'sellQtyTrackRatio',
    'sellEnabled',
    'sweepWatchPrice',
    'sweepMinTickCount',
    'sweepEnabled',
    'sweepRecalcEnabled',
    'sweepMinCount',
    'sweepMinRate',
    'cancelQtyEnabled',
    'cancelWatchQty',
    'cancelTradeEnabled',
    'cancelQtyTrackEnabled',
  ];
  function expectCleanCfg(cfg: RelayLimitChaserInput): void {
    const keys = Object.keys(cfg);
    expect(keys).toHaveLength(32);
    expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort());
    for (const f of FORBIDDEN) expect(keys).not.toContain(f);
    expect(keys).not.toContain('key');
    expect(keys).not.toContain('market');
  }

  it('스위치 경로 cfg 키가 정확히 32개다 — 래치 상태여도 S→C 필드를 되보내지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    click(sw('매도주문 켜기'));
    expectCleanCfg(lastConfig());
  });

  it('값 경로 cfg 키도 정확히 32개다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    editInline('lc-sell-order-ratio', '50');
    expectCleanCfg(lastConfig());
    expect(lastConfig().sellOrderRatio).toBe(50);
  });

  it('클라 고정 3 은 항상 true/0/0 으로 나간다 — 폼에 노출되지 않는다', () => {
    render(<LimitChaserForm {...props()} />);
    click(sw('한방체결 켜기'));
    expect(lastConfig().sweepRecalcEnabled).toBe(true);
    expect(lastConfig().sweepMinCount).toBe(0);
    expect(lastConfig().sweepMinRate).toBe(0);
    expect(screen.queryByText(/한방 재계산|최소 횟수|최소 상승률/)).toBeNull();
  });
});

describe('⑦ 리스트 구성 (D-19 · D-20 · D-21 · D-22) (옛 ⑩ · ⑫ 일부)', () => {
  const slotsIn = (side: 'buy' | 'sell') =>
    Array.from(pane(side).querySelectorAll('section[data-slot^="lc-group-"]')).map((el) =>
      el.getAttribute('data-slot'),
    );

  it('매수 pane = 가격 → 매수주문 → 한방체결 · 매도 pane = 가격 → 매도주문 → 매수취소(맨 아래)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(slotsIn('buy')).toEqual(['lc-group-buy-price', 'lc-group-buy', 'lc-group-sweep']);
    expect(slotsIn('sell')).toEqual(['lc-group-sell-price', 'lc-group-sell', 'lc-group-cancel']);
  });

  it('가격 섹션은 제목·스위치가 없고 접근성 이름 「매수 가격 설정」「매도 가격 설정」 이다', () => {
    render(<LimitChaserForm {...props()} />);
    for (const [slot, name] of [
      ['buy-price', '매수 가격 설정'],
      ['sell-price', '매도 가격 설정'],
    ] as const) {
      expect(group(slot).getAttribute('aria-label')).toBe(name);
      expect(group(slot).querySelector('[data-slot="lc-group-header"]')).toBeNull();
      expect(within(group(slot)).queryAllByRole('switch')).toHaveLength(0);
    }
  });

  it('체크 행은 그룹 끝이다 — 매수주문 체결 · 매도주문 잔량추적·체결 · 매수취소 체결·잔량추적', () => {
    render(<LimitChaserForm {...props()} />);
    const rowsOf = (slot: string) =>
      Array.from((group(slot).querySelector('[data-slot="lc-group-rows"]') as HTMLElement).children);
    const buy = rowsOf('buy');
    expect(buy[buy.length - 1]!.getAttribute('data-slot')).toBe('lc-check-row');
    const sell = rowsOf('sell').map((el) => el.getAttribute('data-slot'));
    expect(sell.slice(-2)).toEqual(['lc-check-row', 'lc-check-row']);
    const cancel = rowsOf('cancel');
    expect(cancel.map((el) => el.getAttribute('data-slot')).slice(-2)).toEqual(['lc-check-row', 'lc-check-row']);
    // 취소잔량은 값만 있는 일반 행이다(D-21 — 스위치가 됐으므로 체크가 아니다).
    expect(cancel[0]!.getAttribute('data-lc-field')).toBe('lc-cancel-watch-qty');
  });

  it('꺼진 매수주문 그룹의 행은 opacity .45 인데 행을 누르면 편집이 열린다 · 매수취소는 꺼져도 흐리지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false }) })} />);
    const rows = (slot: string) => group(slot).querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
    expect(rows('buy').className).toContain('opacity-45');
    expect(rows('cancel').className).not.toContain('opacity-45');
    expect(rows('buy-price').className).not.toContain('opacity-45');
    openInline('lc-buy-watch-qty');
    expect(input('lc-buy-watch-qty')).toHaveFocus();
  });

  it('모든 리스트 행이 44px 이다 — 값 행 · 체크 행 · 감시대상 행 · 기준선 행 · 편집 중 행 (D-20)', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    const rows = document.querySelectorAll<HTMLElement>(
      '[data-lc-field]:not([data-slot="lc-check-row"] [data-lc-field]), [data-slot="lc-check-row"], [data-slot="lc-watch-row"], [data-slot="lc-derived"]',
    );
    // 값 행 11 + 체크 행 5 + 감시대상 1 + 기준선 1 = 18 (고정 스키마 — E1 zero-one-many).
    expect(rows).toHaveLength(18);
    for (const r of Array.from(rows)) expect(r.className).toContain('min-h-[44px]');
    openInline('lc-sweep-tick');
    const editing = document.querySelector('[data-lc-field="lc-sweep-tick"][data-editing="true"]') as HTMLElement;
    expect(editing.className).toContain('min-h-[44px]');
  });

  it('옛 파생값 행(산출 주문수량 · 실제 주문금액 · 예상 매도수량)이 없다', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 30_000, buyOrderAmount: 10 }) })} />);
    expect(screen.queryByText('산출 주문수량')).toBeNull();
    expect(screen.queryByText('실제 주문금액')).toBeNull();
    expect(screen.queryByText(/예상 매도수량/)).toBeNull();
  });

  it('잔량추적 기준선 행은 `sellEntryLatched` 일 때만 매도주문 그룹에 읽기 전용으로 선다 (E1 partial)', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    expect(document.querySelector('[data-slot="lc-derived"]')).toBeNull();
    rerender(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    const derived = document.querySelector('[data-slot="lc-derived"]') as HTMLElement;
    expect(group('sell').contains(derived)).toBe(true);
    expect(derived.textContent).toBe('잔량추적 기준선41,200주');
    expect(derived.querySelector('button')).toBeNull();
  });

  it('세션 미준비(`disabled`)면 모든 행·스위치·체크·토글이 비활성이다 (E1 loading)', () => {
    render(<LimitChaserForm {...props({ disabled: true })} />);
    const form = document.querySelector('[data-slot="limit-chaser-form"]') as HTMLElement;
    const buttons = Array.from(form.querySelectorAll('button')).filter((b) => b.getAttribute('role') !== 'tab');
    expect(buttons.length).toBeGreaterThan(20);
    for (const b of buttons) expect(b).toBeDisabled();
    click(row('lc-buy-order-price'));
    expect(input('lc-buy-order-price')).toBeNull();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('값 0 은 「0원」처럼 그대로 보인다 (E1 empty)', () => {
    render(<LimitChaserForm {...props({ server: null })} />);
    expect(rowText('lc-buy-order-price')).toBe('0원');
    expect(rowText('lc-sweep-watch-price')).toBe('0원');
  });
});

describe('⑧ 감시대상 — 시트를 열지 않는 행 안 토글 (D-02 · D-02a) (옛 ⑰ 세그먼트)', () => {
  it('「매수잔량」 → cfg.buyWatchSide "1" 1회 · 시트/인라인이 열리지 않는다', () => {
    render(<LimitChaserForm {...props()} />);
    const g = screen.getByRole('group', { name: '감시대상' });
    click(within(g).getByRole('button', { name: '매수잔량' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyWatchSide).toBe('1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-editing="true"]')).toBeNull();
  });

  it('전송 중에는 두 버튼이 비활성(선택 면은 낙관 표시) · 에코가 오면 다시 활성', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    const g = () => screen.getByRole('group', { name: '감시대상' });
    click(within(g()).getByRole('button', { name: '매수잔량' }));
    expect(within(g()).getByRole('button', { name: '매수잔량' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['매도잔량', '매수잔량']) expect(within(g()).getByRole('button', { name })).toBeDisabled();
    rerender(<LimitChaserForm {...props({ server: echo({ buyWatchSide: '1' }), serverAnswerSeq: 1 })} />);
    for (const name of ['매도잔량', '매수잔량']) expect(within(g()).getByRole('button', { name })).toBeEnabled();
    expect(within(g()).getByRole('button', { name: '매수잔량' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('★ D-02a — 시각 「감시대상」 라벨이 어느 밴드에도 없고 트랙이 행 전체 폭이다(접근성 이름은 유지)', () => {
    render(<LimitChaserForm {...props()} />);
    const watchRow = document.querySelector('[data-slot="lc-watch-row"]') as HTMLElement;
    expect(watchRow.textContent).toBe('매도잔량매수잔량');
    const g = screen.getByRole('group', { name: '감시대상' });
    expect(g.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'w-full']));
    expect(g.className).not.toMatch(/inline-flex|w-auto/);
    for (const b of within(g).getAllByRole('button')) {
      expect(b.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['flex-1', 'h-8', 'whitespace-nowrap', '@min-[700px]/lc:h-[26px]']),
      );
    }
  });

  it('거부되면 서버 값으로 되돌고 그 자리 말풍선 「반영하지 못했어요」 · 자동 재시도 없음 (E2 error)', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    click(screen.getByRole('button', { name: '매수잔량' }));
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(screen.getByRole('button', { name: '매도잔량' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('반영하지 못했어요').closest('[role="alert"]')).not.toBeNull();
    expect(sentConfigs()).toHaveLength(1);
  });
});

describe('⑨ 체크 행 「○ 라벨 ─ 값 ›」 (D-22) (옛 ⑫ 체크박스)', () => {
  it('체크 이름이 「{그룹} {라벨}」 로 다섯 개 다 있다', () => {
    render(<LimitChaserForm {...props()} />);
    for (const name of ['매수주문 체결', '매도주문 잔량추적', '매도주문 체결', '매수취소 체결', '매수취소 잔량추적']) {
      expect(chk(name).tagName).toBe('BUTTON');
    }
  });

  it('「매수주문 체결」 체크 → cfg.buyTradeQtyEnabled true 1회 (한 필드 = 전송 1회)', () => {
    render(<LimitChaserForm {...props()} />);
    click(chk('매수주문 체결'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyTradeQtyEnabled).toBe(true);
    expect(chk('매수주문 체결')).toHaveAttribute('aria-checked', 'true');
  });

  it('체크가 꺼져 있어도 값 버튼은 편집할 수 있다 (quick-260912-u58 ④)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(chk('매수주문 체결')).toHaveAttribute('aria-checked', 'false');
    // 매수·매도 「체결 30,000주」 두 개가 있다 — 옛 id 로 매수 쪽을 고른다.
    const valueBtn = row('lc-buy-min-trade-qty');
    expect(valueBtn.tagName).toBe('BUTTON');
    expect(valueBtn).toHaveAccessibleName('체결 30,000주');
    click(valueBtn);
    expect(input('lc-buy-min-trade-qty')).not.toBeNull();
  });

  it('매수취소 체결·잔량추적은 값 버튼이 없다 — 체크 버튼 하나가 행이다', () => {
    render(<LimitChaserForm {...props()} />);
    for (const id of ['lc-cancel-trade', 'lc-cancel-qty-track']) {
      const btn = document.getElementById(id) as HTMLElement;
      expect(btn.getAttribute('role')).toBe('checkbox');
      const rowEl = btn.closest('[data-slot="lc-check-row"]') as HTMLElement;
      expect(rowEl.querySelectorAll('button')).toHaveLength(1);
      expect(rowEl.querySelector('[data-slot="lc-row-value"]')).toBeNull();
    }
  });

  it('체크 거부 → 서버 값으로 되돌고 말풍선 「반영하지 못했어요」', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    click(chk('매도주문 체결'));
    expect(chk('매도주문 체결')).toHaveAttribute('aria-checked', 'true');
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(chk('매도주문 체결')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('반영하지 못했어요').closest('[role="alert"]')).not.toBeNull();
  });
});

describe('⑩ 발주할 수 없는 전략은 무장되지 않는다 (WR-06 · GC-WR-12 · R2-WR-02) (옛 ⑬⑮⑯)', () => {
  const panelIn = (side: 'buy' | 'sell') => pane(side).querySelector('[data-slot="lc-arm-blocked-panel"]');
  const reasons = (side: 'buy' | 'sell') =>
    Array.from(pane(side).querySelectorAll('[data-slot="lc-arm-blocked"]')).map((li) => li.textContent);

  it('시세를 못 받은 종목(가격 전부 0)은 매수 스위치가 비활성이고 사유가 매수 열 **맨 아래**에 선다', () => {
    render(<LimitChaserForm {...props({ server: null })} />);
    expect(sw('매수주문 켜기')).toBeDisabled();
    const panel = panelIn('buy') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(pane('buy').lastElementChild).toBe(panel);
    expect(reasons('buy')[0]).toContain('매수주문 · 시세를 받지 못해 매수가격이 0 이에요.');
  });

  it('주문금액이 모자라 0주면 **금액** 문구 · 매수와 한방이 같은 사유면 한 줄로 합쳐진다 (GC-WR-12)', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 1_274_000 })} />);
    expect(reasons('buy')).toEqual([
      '매수주문 · 한방체결 · 주문금액이 매수가격보다 작아 주문수량이 0 주예요. 금액을 올리면 켤 수 있어요.',
    ]);
  });

  it('매도 사유는 매도 열에만 선다 — 매수 사유가 새지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellWatchQty: 0 }) })} />);
    expect(panelIn('buy')).toBeNull();
    expect(reasons('sell')).toEqual(['매도주문 · 매도 호가잔량이 0 이에요. 감시할 잔량을 입력하면 켤 수 있어요.']);
    expect(sw('매도주문 켜기')).toBeDisabled();
  });

  it('켜진 게이트의 매수가격을 0 으로 확정 → 전송 0 + 그 자리 「매수주문 · 시세를 받지 못해 …」', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '0');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByText(/^매수주문 · 시세를 받지 못해 매수가격이 0 이에요/)).toBeInTheDocument();
    expect(input('lc-buy-order-price')).not.toBeNull();
  });

  it('철거 의도(게이트 4종 OFF + 한방 ON)는 매수가격 0 이어도 막지 않는다 (R2-WR-02)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false, sweepEnabled: true }) })} />);
    editInline('lc-buy-order-price', '0');
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyOrderPrice).toBe(0);
  });

  it('★ 이미 켜진 게이트는 값이 0 이어도 **끌 수 있다** (T-16-44)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 0 }) })} />);
    expect(sw('매수주문 켜기')).toBeEnabled();
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyEnabled).toBe(false);
  });

  it('보유 0 이어도 매도는 무장할 수 있다 — 상따는 사기 전에 팔 조건을 건다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellOrderQty: 0 }) })} />);
    expect(sw('매도주문 켜기')).toBeEnabled();
    click(sw('매도주문 켜기'));
    expect(lastConfig().sellEnabled).toBe(true);
  });
});

describe('⑪ 미등록 전략 — 값·체크·감시대상은 로컬만, 등록은 스위치만 (A-P1 · T-20-13)', () => {
  it('값 확정은 전송 0 · 행에 로컬 값이 선다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    editInline('lc-buy-watch-qty', '8000');
    expect(sentConfigs()).toHaveLength(0);
    expect(input('lc-buy-watch-qty')).toBeNull();
    expect(rowText('lc-buy-watch-qty')).toBe('8,000주');
  });

  it('체크 · 감시대상도 전송 0 · 표시만 바뀐다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(chk('매수주문 체결'));
    click(screen.getByRole('button', { name: '매수잔량' }));
    expect(sentConfigs()).toHaveLength(0);
    expect(chk('매수주문 체결')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: '매수잔량' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('그 뒤 스위치 ON → 등록 cfg 에 로컬 값이 실린다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    editInline('lc-buy-watch-qty', '8000');
    click(chk('매수주문 체결'));
    click(screen.getByRole('button', { name: '매수잔량' }));
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    const cfg = lastConfig();
    expect(cfg.buyEnabled).toBe(true);
    expect(cfg.buyWatchQty).toBe(8_000);
    expect(cfg.buyTradeQtyEnabled).toBe(true);
    expect(cfg.buyWatchSide).toBe('1');
    expect(cfg.buyOrderPrice).toBe(30_000);
  });

  it('신규 폼은 가격 5칸을 상한가로 1회 시딩한다 — 에코가 와도 다시 시딩하지 않는다', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    for (const id of ['lc-buy-order-price', 'lc-buy-watch-price', 'lc-sweep-watch-price', 'lc-sell-order-price', 'lc-sell-watch-price']) {
      expect(rowText(id)).toBe('30,000원');
    }
    rerender(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 29_000 }), upperLimit: 30_000 })} />);
    expect(rowText('lc-buy-order-price')).toBe('29,000원');
  });
});

describe('⑫ pane · 탭 — 두 pane 은 늘 DOM, 숨김은 CSS (260912-k2x · 18-10) (옛 ⑫)', () => {
  it('★ 두 pane 이 언제나 DOM 에 있고 비활성 pane 만 `hidden @min-[700px]/lc:block` 이다', () => {
    render(<LimitChaserForm {...props()} />);
    expect(pane('buy').className).not.toContain('hidden');
    expect(pane('sell').className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', '@min-[700px]/lc:block']));
    click(screen.getByRole('tab', { name: '매도' }));
    expect(pane('buy').className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', '@min-[700px]/lc:block']));
    expect(pane('sell').className).not.toContain('hidden');
    expect(row('lc-buy-order-price')).not.toBeNull();
  });

  it('제어형 `tab="sell"` 이면 매수 pane 이 숨는 클래스를 갖고 매도 pane 은 보인다', () => {
    render(<LimitChaserForm {...props({ tab: 'sell', hideTabs: true })} />);
    expect(pane('buy').className).toContain('hidden');
    expect(pane('sell').className).not.toContain('hidden');
  });

  it('`hideTabs` 면 폼 자체의 「매수 | 매도」 탭 줄이 없다 — 3탭은 카드 본문이 소유한다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    expect(screen.getByRole('tablist', { name: '주문 설정' })).toBeInTheDocument();
    rerender(<LimitChaserForm {...props({ hideTabs: true })} />);
    expect(screen.queryByRole('tablist', { name: '주문 설정' })).toBeNull();
  });

  it('≥700 열 머리 「● 매수」「● 매도」 — 폰은 숨김 · 점 `--up`/`--down` · 15/700 (D-03)', () => {
    render(<LimitChaserForm {...props()} />);
    for (const [side, text, dot] of [
      ['buy', '매수', 'bg-[var(--up)]'],
      ['sell', '매도', 'bg-[var(--down)]'],
    ] as const) {
      const head = pane(side).querySelector('[data-slot="lc-column-head"]') as HTMLElement;
      expect(head.textContent).toBe(text);
      expect(head.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['hidden', '@min-[700px]/lc:flex', 'text-[15px]', 'font-bold']),
      );
      expect((head.firstElementChild as HTMLElement).className).toContain(dot);
    }
    // 새 배치는 컨테이너 쿼리만 쓴다 — 뷰포트 브레이크포인트 0.
    const form = document.querySelector('[data-slot="limit-chaser-form"]') as HTMLElement;
    for (const el of Array.from(form.querySelectorAll<HTMLElement>('[class]'))) {
      expect(el.getAttribute('class')).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
      expect(el.getAttribute('class')).not.toMatch(/truncate|text-ellipsis/);
    }
  });
});

describe('⑬ 에코가 목록을 이긴다 · 편집 중 버퍼는 보존 (D-11 · E4 partial) (옛 ⑧⑪)', () => {
  it('새 에코가 행을 덮는다 — 상위에 changed 수와 덮인 더티 0 을 알린다', () => {
    const onServerEcho = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ onServerEcho })} />);
    rerender(<LimitChaserForm {...props({ onServerEcho, server: echo({ buyWatchQty: 5_000 }) })} />);
    expect(rowText('lc-buy-watch-qty')).toBe('5,000주');
    expect(onServerEcho).toHaveBeenLastCalledWith({ changed: 1, overwrittenDirty: 0 });
  });

  it('`buyOrderAmount: 0` 에코는 주문금액 행을 덮지 않는다 (Pitfall 11 — 서버가 모른다)', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    rerender(<LimitChaserForm {...props({ server: echo({ buyOrderAmount: 0, buyWatchQty: 7_000 }) })} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    expect(rowText('lc-buy-watch-qty')).toBe('7,000주');
  });

  it('인라인 편집 중 에코는 입력 버퍼를 덮지 않고, 저장하면 내 값이 나간다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    const el = openInline('lc-buy-watch-qty');
    typeValue(el, '8000');
    rerender(<LimitChaserForm {...props({ server: echo({ buyWatchQty: 5_000, sweepMinTickCount: 4 }) })} />);
    expect(input('lc-buy-watch-qty')!.value).toBe('8,000');
    pressKey(input('lc-buy-watch-qty')!, 'Enter');
    expect(lastConfig().buyWatchQty).toBe(8_000);
    expect(lastConfig().sweepMinTickCount).toBe(4);
  });

  it('답 신호(에코 · 거부)가 오면 폼 맨 위 실패 문구가 접힌다', () => {
    sendMock.mockReturnValue(false);
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    click(sw('매도주문 켜기'));
    expect(submitError()).not.toBeNull();
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(submitError()).toBeNull();
  });
});

describe('⑭ 터치 기기 — 모든 값 행이 시트다 · 「감시 중」 안내는 그 그룹이 감시 중일 때만 (D-05 · D-12)', () => {
  beforeEach(() => mockPointer(true));
  afterEach(restoreMatchMedia);

  const sheet = () => document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement | null;
  const statusLine = () => document.querySelector('[data-slot="numpad-status"]')?.textContent ?? '';
  const ARMED = '감시 중 — 적용하면 바로 반영돼요';

  it('매수가격 행 탭 → 시트 「매수가격」 · 설명 · 확정 「매수가격 적용」 · 인라인 입력 없음', () => {
    render(<LimitChaserForm {...props()} />);
    expect(row('lc-buy-order-price')).toHaveAttribute('aria-haspopup', 'dialog');
    click(row('lc-buy-order-price'));
    expect(screen.getByRole('dialog', { name: '매수가격' })).toBe(sheet());
    expect(sheet()!.textContent).toContain('넣을 매수 주문 가격이에요');
    expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe('매수가격 적용');
    expect(input('lc-buy-order-price')).toBeNull();
  });

  it('매수주문이 「감시 중」이면 매수가격 시트에 「감시 중 — 적용하면 바로 반영돼요」', () => {
    render(<LimitChaserForm {...props({ buyStatusText: '감시 중' })} />);
    click(row('lc-buy-order-price'));
    expect(statusLine()).toContain(ARMED);
  });

  it('한방체결(「켜짐」/「꺼짐」) 필드에는 감시 중 안내가 없다', () => {
    render(<LimitChaserForm {...props({ buyStatusText: '감시 중', sweepStatusText: '켜짐' })} />);
    click(row('lc-sweep-tick'));
    expect(sheet()).not.toBeNull();
    expect(statusLine()).not.toContain(ARMED);
  });

  it('체크 값 행의 값 버튼도 시트다 — 「체결」 · 매수 설명 · 「체결 적용」', () => {
    render(<LimitChaserForm {...props()} />);
    click(row('lc-buy-min-trade-qty'));
    expect(screen.getByRole('dialog', { name: '체결' })).toBe(sheet());
    expect(sheet()!.textContent).toContain('체결이 이 값 이상이면 매수를 넣어요');
    expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe('체결 적용');
  });

  it('감시대상은 터치 기기에서도 시트를 열지 않고 즉시 전송한다', () => {
    render(<LimitChaserForm {...props()} />);
    click(screen.getByRole('button', { name: '매수잔량' }));
    expect(sheet()).toBeNull();
    expect(sentConfigs()).toHaveLength(1);
  });
});
