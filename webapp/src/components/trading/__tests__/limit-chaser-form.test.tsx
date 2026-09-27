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
 *   ⑥ S→C 전용 필드 미송신 · cfg 43키 · 클라 고정 3(Pitfall 6)
 *   ⑦ 리스트 구성(D-19 · D-20 · D-21 · D-22) · 44px · 꺼진 그룹 흐림(편집 가능)
 *   ⑧ 감시대상 행이 없다(Phase 24 ⑤ — 새 서버는 감시대상을 읽지 않는다)
 *   ⑨ 체크 행(D-22)
 *   ⑩ 무장 불가(WR-06 · GC-WR-12 · R2-WR-02 · T-16-44)
 *   ⑪ 미등록 전략은 값·체크가 로컬만, 등록은 스위치만(A-P1)
 *   ⑫ pane·탭 — 두 pane 이 늘 DOM · CSS 숨김
 *   ⑬ 에코가 목록을 이긴다 · 편집 중 버퍼는 보존(D-11 · E4)
 *   ⑭ 터치 기기 = 시트 · 「감시 중」 안내는 그 행 카드의 게이트 에코가 ON 일 때만(D-05 · D-12)
 *   ⑮ (Phase 24) 매수 카드 4장 · 제목줄 접기 · 요약 줄 · 자동 펼침 · 후매수 단계 · 흐림 한 겹(⑤ ⑥ ⑩)
 *   ⑯ (Phase 24) 라벨 개명 · 시트 제목 · 접근성 이름 접두 · 의미어(D-09 · D-10 · D-11 · R14)
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
import { buyOrderQtyFromAmount } from '@/lib/limit-chaser';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';

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
    ...LC_BUY3_ECHO_DEFAULTS,
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
/** 조상 사슬에서 `opacity-45` 가 몇 번 곱해지는가(⑩ — 한 겹이어야 한다). */
function opacityLayers(el: HTMLElement | null): number {
  let n = 0;
  for (let cur = el; cur; cur = cur.parentElement) if (cur.classList.contains('opacity-45')) n += 1;
  return n;
}
const fold = (slot: string): HTMLElement =>
  group(slot).querySelector('[data-slot="lc-group-fold"]') as HTMLElement;

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

  it('Phase 24 — 새 전략 첫 등록 cfg 에 신필드 기본값(D-04 · D-05 · D-17 폴백)과 금액→수량 산출이 실린다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(screen.getByRole('switch', { name: '매수주문 켜기' }));
    const cfg = lastConfig();
    expect(cfg).toMatchObject({
      preBuyEnabled: false,
      extraBuyEnabled: false,
      postBuyEnabled: false,
      extraBuyMinQty: 0,
      extraBuyMaxQty: 0,
      extraBuyOrderAmount: 4000,
      postBuyOrderAmount: 4000,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
    });
    // 한 함수 · 같은 공통 매수가격으로 산출 — 역산 금지.
    expect(cfg.extraBuyOrderQty).toBe(buyOrderQtyFromAmount(4000, cfg.buyOrderPrice));
    expect(cfg.postBuyOrderQty).toBe(buyOrderQtyFromAmount(4000, cfg.buyOrderPrice));
    expect(cfg.extraBuyOrderQty).toBe(1333);
    // relay 가 못박는 값 · S→C 런타임은 싣지 않는다.
    expect(cfg).not.toHaveProperty('buy3Schema');
    expect(cfg).not.toHaveProperty('postBuyPhase');
  });

  it('선매수 스위치도 같은 규율이다 — 1회 · preBuyEnabled true(한 필드 확정 · 동반 규칙은 24-06)', () => {
    render(<LimitChaserForm {...props()} />);
    click(screen.getByRole('switch', { name: '선매수 켜기' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().preBuyEnabled).toBe(true);
    expect(screen.queryByRole('switch', { name: '한방체결 켜기' })).toBeNull();
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
    expect(Object.keys(lastConfig())).toHaveLength(43);
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

describe('⑥ S→C 전용 필드를 보내지 않는다 · cfg 43키 (Pitfall 6) (옛 ⑨)', () => {
  const FORBIDDEN = [
    'sellOrderQty',
    'sellQtyTrackBaseline',
    'sellEntryLatched',
    'cancelQtyTrackBaseline',
    'cancelEntryLatched',
    // Phase 24 S→C 런타임 5 — buy3Schema 는 relay 가 못박는다.
    'buy3Schema',
    'extraBuyAbandoned',
    'postBuyTriggerQty',
    'postBuyReentryLeft',
    'postBuyPhase',
  ] as const;
  /**
   * 클라 입력 28 + 클라 고정 3 + Phase 24 C→S 12 = 43(감시대상은 Phase 24 ⑤ 로 빠졌다). `key` · `market` 은 싣지 않는다
   * (relay 파생 · WR-03 / D-28).
   */
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
    'preBuyEnabled',
    'extraBuyEnabled',
    'extraBuyMinQty',
    'extraBuyMaxQty',
    'extraBuyOrderAmount',
    'extraBuyOrderQty',
    'postBuyEnabled',
    'postBuyReboundPct',
    'postBuyFloorQty',
    'postBuyReentry',
    'postBuyOrderAmount',
    'postBuyOrderQty',
  ];
  function expectCleanCfg(cfg: RelayLimitChaserInput): void {
    const keys = Object.keys(cfg);
    expect(keys).toHaveLength(43);
    expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort());
    for (const f of FORBIDDEN) expect(keys).not.toContain(f);
    expect(keys).not.toContain('key');
    expect(keys).not.toContain('market');
  }

  it('스위치 경로 cfg 키가 정확히 43개다 — 래치 상태여도 S→C 필드를 되보내지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    click(sw('매도주문 켜기'));
    expectCleanCfg(lastConfig());
  });

  it('값 경로 cfg 키도 정확히 43개다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    editInline('lc-sell-order-ratio', '50');
    expectCleanCfg(lastConfig());
    expect(lastConfig().sellOrderRatio).toBe(50);
  });

  it('클라 고정 3 은 항상 true/0/0 으로 나간다 — 폼에 노출되지 않는다', () => {
    render(<LimitChaserForm {...props()} />);
    click(chk('선매수 한방'));
    expect(lastConfig().sweepEnabled).toBe(true);
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

  it('매수 pane = 매수주문 → 선매수 → 추가매수 → 후매수 · 매도 pane = 가격 → 매도주문 → 매수취소(맨 아래)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(slotsIn('buy')).toEqual(['lc-group-buy', 'lc-group-pre-buy', 'lc-group-extra-buy', 'lc-group-post-buy']);
    expect(slotsIn('sell')).toEqual(['lc-group-sell-price', 'lc-group-sell', 'lc-group-cancel']);
    expect(document.querySelector('[data-slot="lc-group-buy-price"]')).toBeNull();
    expect(document.querySelector('[data-slot="lc-group-sweep"]')).toBeNull();
  });

  it('매도 가격 섹션은 제목·스위치가 없고 접근성 이름 「매도 가격 설정」 이다', () => {
    render(<LimitChaserForm {...props()} />);
    expect(group('sell-price').getAttribute('aria-label')).toBe('매도 가격 설정');
    expect(group('sell-price').querySelector('[data-slot="lc-group-header"]')).toBeNull();
    expect(within(group('sell-price')).queryAllByRole('switch')).toHaveLength(0);
  });

  it('선매수 행 = 금액 · 매도잔량 · ○체결량 · ○한방 · 한방가격 · 매도주문 잔량추적·체결 · 매수취소 체결·잔량추적은 그룹 끝', () => {
    render(<LimitChaserForm {...props()} />);
    const rowsOf = (slot: string) =>
      Array.from((group(slot).querySelector('[data-slot="lc-group-rows"]') as HTMLElement).children);
    expect(rowsOf('pre-buy').map((el) => el.getAttribute('data-slot') ?? el.getAttribute('data-lc-field'))).toEqual([
      'lc-buy-order-amount',
      'lc-buy-watch-qty',
      'lc-check-row',
      'lc-check-row',
      'lc-sweep-watch-price',
    ]);
    const sell = rowsOf('sell').map((el) => el.getAttribute('data-slot'));
    expect(sell.slice(-2)).toEqual(['lc-check-row', 'lc-check-row']);
    const cancel = rowsOf('cancel');
    expect(cancel.map((el) => el.getAttribute('data-slot')).slice(-2)).toEqual(['lc-check-row', 'lc-check-row']);
    // 취소잔량은 값만 있는 일반 행이다(D-21 — 스위치가 됐으므로 체크가 아니다).
    expect(cancel[0]!.getAttribute('data-lc-field')).toBe('lc-cancel-watch-qty');
  });

  it('꺼진 매수주문(마스터 에코 OFF)의 공통 카드 행은 opacity .45 **한 겹**인데 행을 누르면 편집이 열린다 (⑩ · R9)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false }) })} />);
    const rows = (slot: string) => group(slot).querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
    // 컨테이너는 흐리지 않는다 — 행마다 한 번(.45 × .45 방지).
    expect(rows('buy').className).not.toContain('opacity-45');
    expect(opacityLayers(row('lc-buy-order-price'))).toBe(1);
    expect(opacityLayers(row('lc-buy-watch-price'))).toBe(1);
    openInline('lc-buy-watch-price');
    expect(input('lc-buy-watch-price')).toHaveFocus();
  });

  it('모든 리스트 행이 44px 이다 — 값 행 · 체크 행 · 기준선 행 · 발동잔량 행 · 편집 중 행 (D-20)', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    const rows = document.querySelectorAll<HTMLElement>(
      '[data-lc-field]:not([data-slot="lc-check-row"] [data-lc-field]), [data-slot="lc-check-row"], [data-slot="lc-derived"], [data-slot="lc-post-buy-trigger"]',
    );
    // 값 행 17(공통 2 · 선매수 3 · 추가매수 3 · 후매수 4 · 매도 가격 2 · 매도주문 2 · 취소 1) + 체크 행 6 + 기준선 1
    // + 발동잔량 1 = 25 (고정 스키마 — E1 zero-one-many).
    expect(rows).toHaveLength(25);
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
    // 접기 버튼은 로컬 동작이라 세션과 무관하게 눌린다(E1 loading).
    const folds = Array.from(form.querySelectorAll('[data-slot="lc-group-fold"]'));
    expect(folds).toHaveLength(3);
    for (const f of folds) expect(f).toBeEnabled();
    const buttons = Array.from(form.querySelectorAll('button')).filter(
      (b) => b.getAttribute('role') !== 'tab' && b.getAttribute('data-slot') !== 'lc-group-fold',
    );
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

describe('⑧ 감시대상 행이 없다 (Phase 24 ⑤ — 새 서버는 감시대상을 읽지 않는다)', () => {
  it('매수 쪽에 감시대상 행 · 「매도잔량」/「매수잔량」 토글이 없다', () => {
    render(<LimitChaserForm {...props()} />);
    expect(document.querySelectorAll('[data-slot="lc-watch-row"]')).toHaveLength(0);
    expect(screen.queryByRole('group', { name: '감시대상' })).toBeNull();
    expect(screen.queryByRole('button', { name: '매도잔량' })).toBeNull();
    expect(screen.queryByRole('button', { name: '매수잔량' })).toBeNull();
  });

  it('값 확정(매수 비교가격)으로 나간 cfg 에 감시대상 키가 없다 — 서버 에코가 "1" 이어도', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyWatchSide: '1' }) })} />);
    editInline('lc-buy-watch-price', '129000');
    expect(sentConfigs()).toHaveLength(1);
    const cfg = lastConfig();
    expect(cfg.buyWatchPrice).toBe(129_000);
    expect('buyWatchSide' in cfg).toBe(false);
  });
});

describe('⑨ 체크 행 「○ 라벨 ─ 값 ›」 (D-22) (옛 ⑫ 체크박스)', () => {
  it('체크 이름이 「{그룹} {라벨}」 로 다섯 개 다 있다', () => {
    render(<LimitChaserForm {...props()} />);
    for (const name of ['선매수 체결량', '선매수 한방', '매도주문 잔량추적', '매도주문 체결', '매수취소 체결', '매수취소 잔량추적']) {
      expect(chk(name).tagName).toBe('BUTTON');
    }
  });

  it('「선매수 체결량」 체크 → cfg.buyTradeQtyEnabled true 1회 (한 필드 = 전송 1회)', () => {
    render(<LimitChaserForm {...props()} />);
    click(chk('선매수 체결량'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyTradeQtyEnabled).toBe(true);
    expect(chk('선매수 체결량')).toHaveAttribute('aria-checked', 'true');
  });

  it('체크가 꺼져 있어도 값 버튼은 편집할 수 있다 (quick-260912-u58 ④)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(chk('선매수 체결량')).toHaveAttribute('aria-checked', 'false');
    const valueBtn = row('lc-buy-min-trade-qty');
    expect(valueBtn.tagName).toBe('BUTTON');
    expect(valueBtn).toHaveAccessibleName('선매수 체결량 30,000주');
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

  it('체크도 전송 0 · 표시만 바뀐다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(chk('선매수 체결량'));
    expect(sentConfigs()).toHaveLength(0);
    expect(chk('선매수 체결량')).toHaveAttribute('aria-checked', 'true');
  });

  it('그 뒤 스위치 ON → 등록 cfg 에 로컬 값이 실린다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    editInline('lc-buy-watch-qty', '8000');
    click(chk('선매수 체결량'));
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    const cfg = lastConfig();
    expect(cfg.buyEnabled).toBe(true);
    expect(cfg.buyWatchQty).toBe(8_000);
    expect(cfg.buyTradeQtyEnabled).toBe(true);
    expect('buyWatchSide' in cfg).toBe(false);
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

  it('`buyOrderAmount: 0` 에코(서버가 모른다 · Pitfall 11) → 주문금액 행은 폼에 남은 값이 아니라 「—」 (D-04a · WR-07)', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    rerender(<LimitChaserForm {...props({ server: echo({ buyOrderAmount: 0, buyWatchQty: 7_000 }) })} />);
    // 폼은 옛 금액을 버리지 않지만(formFromServer) 서버 사실이 아니므로 보이지 않는다.
    expect(rowText('lc-buy-order-amount')).toBe('—');
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

describe('WR-03 — 대기열에서 꺼낼 때 막히거나 끊긴 토글도 폼 맨 위가 말한다 (무로그 fail-safe 금지)', () => {
  const GATE_DISCONNECTED = '연결이 끊겨 켜기/끄기를 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.';

  it('값 전송 중 대기에 선 스위치가 꺼낼 때 끊기면 — 스위치는 되돌고 폼 맨 위에 끊김 문장', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    editInline('lc-sweep-tick', '5');
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'true');

    sendMock.mockReturnValue(false);
    rerender(<LimitChaserForm {...props({ server: echo({ sweepMinTickCount: 5 }) })} />);
    rerender(<LimitChaserForm {...props({ server: echo({ sweepMinTickCount: 5 }), serverAnswerSeq: 1 })} />);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(submitError()?.textContent).toBe(GATE_DISCONNECTED);
  });

  it('꺼낼 때 무장 불가로 막힌 스위치 — 스위치는 되돌고 폼 맨 위에 그 사유 문장', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    editInline('lc-sell-watch-qty', '0');
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: echo({ sellWatchQty: 0 }) })} />);
    rerender(<LimitChaserForm {...props({ server: echo({ sellWatchQty: 0 }), serverAnswerSeq: 1 })} />);
    expect(sentConfigs()).toHaveLength(1);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(submitError()?.textContent).toBe(
      '매도주문 · 매도 호가잔량이 0 이에요. 감시할 잔량을 입력하면 켤 수 있어요.',
    );
  });
});

describe('WR-04 — 인라인 편집기가 열린 채 세션이 비활성이 되면 Enter 가 끊김을 말한다', () => {
  it('Enter → 전송 0 · 편집기 유지 · 말풍선 「연결이 끊겨 보내지 못했어요」', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    const el = openInline('lc-sweep-tick');
    typeValue(el, '7');
    rerender(<LimitChaserForm {...props({ disabled: true })} />);
    pressKey(input('lc-sweep-tick')!, 'Enter');
    expect(sentConfigs()).toHaveLength(0);
    expect(input('lc-sweep-tick')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('연결이 끊겨 보내지 못했어요');
  });
});

describe('CR-01 — 인라인 편집도 relay 스키마 범위 밖 값을 보내지 않는다 (빈 값 = 0 포함)', () => {
  it('매도비율 칸을 지우고 Enter — 0 을 보내지 않고 말풍선 「1% 이상 입력해 주세요」', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-sell-order-ratio', '');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toBe('1% 이상 입력해 주세요');
  });

  it('잔량추적 91 Enter · 포커스 이탈 모두 전송 0 · 90 은 1회 전송', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-sell-qty-track-ratio', '91');
    blurEditor('lc-sell-qty-track-ratio');
    expect(sentConfigs()).toHaveLength(0);
    editInline('lc-sell-qty-track-ratio', '90');
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().sellQtyTrackRatio).toBe(90);
  });

  it('체크 토글도 cfg 가 범위 밖이면(서버 값 0) 보내지 않고 폼 맨 위에 사유를 말한다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellOrderRatio: 0 }) })} />);
    click(chk('매수취소 체결'));
    expect(sentConfigs()).toHaveLength(0);
    expect(submitError()?.textContent).toBe('매도비율 · 1% 이상 입력해 주세요');
  });
});

describe('⑭ 터치 기기 — 모든 값 행이 시트다 · 「감시 중」 안내는 그 그룹이 감시 중일 때만 (D-05 · D-12)', () => {
  beforeEach(() => mockPointer(true));
  afterEach(restoreMatchMedia);

  const sheet = () => document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement | null;
  const statusLine = () => document.querySelector('[data-slot="numpad-status"]')?.textContent ?? '';
  const ARMED = '감시 중 — 적용하면 바로 반영돼요';

  it('매수 주문가격 행 탭 → 시트 「주문가격」 · 설명 · 확정 「주문가격 적용」 · 인라인 입력 없음 (D-09)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(row('lc-buy-order-price')).toHaveAttribute('aria-haspopup', 'dialog');
    click(row('lc-buy-order-price'));
    expect(screen.getByRole('dialog', { name: '주문가격' })).toBe(sheet());
    expect(sheet()!.textContent).toContain('세 매수가 같이 쓰는 매수 주문 가격이에요');
    expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe('주문가격 적용');
    expect(input('lc-buy-order-price')).toBeNull();
  });

  it('마스터 에코 ON 이면 공통 카드 주문가격 시트에 「감시 중 — 적용하면 바로 반영돼요」 · OFF 면 없음', () => {
    const { unmount } = render(<LimitChaserForm {...props()} />);
    click(row('lc-buy-order-price'));
    expect(statusLine()).toContain(ARMED);
    unmount();
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false }) })} />);
    click(row('lc-buy-order-price'));
    expect(statusLine()).not.toContain(ARMED);
  });

  it('그룹 카드 행은 그 그룹 에코로 판정한다 — 마스터가 켜져 있어도 선매수 OFF 면 한방 건수 시트에 안내 없음 · ON 이면 있음', () => {
    const { unmount } = render(<LimitChaserForm {...props()} />);
    click(row('lc-sweep-tick'));
    expect(sheet()).not.toBeNull();
    expect(statusLine()).not.toContain(ARMED);
    unmount();
    render(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true }) })} />);
    click(row('lc-sweep-tick'));
    expect(statusLine()).toContain(ARMED);
  });

  it('체크 값 행의 값 버튼도 시트다 — 「선매수 체결량」 · 선매수 설명 · 「선매수 체결량 적용」', () => {
    render(<LimitChaserForm {...props()} />);
    click(row('lc-buy-min-trade-qty'));
    expect(screen.getByRole('dialog', { name: '선매수 체결량' })).toBe(sheet());
    expect(sheet()!.textContent).toContain('체결이 이 값 이상이면 선매수를 넣어요');
    expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe('선매수 체결량 적용');
  });

  it('CR-01 — 잔량추적(최대 90) 시트: 「100」 칩 비활성 · 91 은 「적용」 잠금 · 전송 0', () => {
    render(<LimitChaserForm {...props()} />);
    click(row('lc-sell-qty-track-ratio'));
    const chip100 = within(sheet()!).getByRole('button', { name: '100' });
    expect(chip100).toBeDisabled();
    click(chip100);
    click(within(sheet()!).getByRole('button', { name: '9' }));
    click(within(sheet()!).getByRole('button', { name: '1' }));
    const confirm = document.querySelector('[data-slot="numpad-confirm"]') as HTMLButtonElement;
    expect(confirm).toBeDisabled();
    expect(statusLine()).toContain('최대 90%까지 입력할 수 있어요');
    click(confirm);
    expect(sentConfigs()).toHaveLength(0);
  });

  it('CR-01 — 매도비율 시트에서 「0」 은 「적용」 잠금 · 한방 건수 256 도 잠금', () => {
    render(<LimitChaserForm {...props()} />);
    click(row('lc-sell-order-ratio'));
    click(within(sheet()!).getByRole('button', { name: '0' }));
    expect(document.querySelector('[data-slot="numpad-confirm"]')).toBeDisabled();
    expect(statusLine()).toContain('1% 이상 입력해 주세요');
    click(within(sheet()!).getByRole('button', { name: '닫기' }));
    click(row('lc-sweep-tick'));
    // 「5」는 칩 이름과 겹친다 — 키패드 그룹 안에서만 찾는다.
    const pad = within(within(sheet()!).getByRole('group', { name: '숫자 키패드' }));
    for (const k of ['2', '5', '6']) click(pad.getByRole('button', { name: k }));
    expect(statusLine()).toContain('최대 255건까지 입력할 수 있어요');
    expect(document.querySelector('[data-slot="numpad-confirm"]')).toBeDisabled();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('WR-04 — 시트가 열린 채 세션이 비활성이 되면 「적용」은 조용히 무시되지 않고 끊김 문구 · 「다시 시도」 · 입력 보존', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    click(row('lc-sweep-tick'));
    const pad = within(within(sheet()!).getByRole('group', { name: '숫자 키패드' }));
    click(pad.getByRole('button', { name: '7' }));
    rerender(<LimitChaserForm {...props({ disabled: true })} />);
    click(document.querySelector('[data-slot="numpad-confirm"]') as HTMLElement);
    expect(sentConfigs()).toHaveLength(0);
    expect(sheet()).not.toBeNull();
    expect(statusLine()).toContain('연결이 끊겨 보내지 못했어요');
    expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe('다시 시도');
    expect(document.querySelector('[data-slot="numpad-value"]')!.textContent).toBe('7');
  });

  it('WR-06 — 대기에 선 시트 적용이 꺼낼 때 no-op(서버가 이미 그 값)이면 시트가 닫힌다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    // 앞 건(매도주문 켜기) 전송 중 — 잔량 시트 적용은 대기다(시트는 「반영 중…」으로 열려 있다).
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    click(row('lc-buy-watch-qty'));
    const pad = within(within(sheet()!).getByRole('group', { name: '숫자 키패드' }));
    for (const k of ['8', '0', '0', '0']) click(pad.getByRole('button', { name: k }));
    click(document.querySelector('[data-slot="numpad-confirm"]') as HTMLElement);
    expect(sentConfigs()).toHaveLength(1);
    expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe('반영 중…');
    // 앞 건 에코가 잔량 8,000 까지 담고 온다(다른 단말) — 대기 건은 꺼낼 때 no-op.
    const both = echo({ sellEnabled: true, buyWatchQty: 8_000 });
    rerender(<LimitChaserForm {...props({ server: both })} />);
    rerender(<LimitChaserForm {...props({ server: both, serverAnswerSeq: 1 })} />);
    expect(sentConfigs()).toHaveLength(1);
    expect(sheet()).toBeNull();
  });

});

describe('D-15a — 상따 인라인도 ETP·분류 불명은 호가 단위 위반을 경고만 한다 (20-REVIEW WR-05)', () => {
  it.each(['etp', 'unknown'] as const)('%s — 매수가격 130,050 Enter → 전송된다', (tickRule) => {
    render(<LimitChaserForm {...props({ upperLimit: 156_000, tickRule })} />);
    editInline('lc-buy-order-price', '130050');
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyOrderPrice).toBe(130_050);
  });

  it('etp 여도 상한가 초과는 막힌다', () => {
    render(<LimitChaserForm {...props({ upperLimit: 156_000, tickRule: 'etp' })} />);
    editInline('lc-buy-order-price', '156100');
    expect(screen.getByRole('alert')).toHaveTextContent('상한가 156,000원을 넘을 수 없어요');
    expect(sentConfigs()).toHaveLength(0);
  });

  it('미지정(조회 전) — 그대로 잠근다(D-15)', () => {
    render(<LimitChaserForm {...props({ upperLimit: 156_000 })} />);
    editInline('lc-buy-order-price', '130050');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent('100원 단위로 입력해 주세요');
  });
});

describe('WR-07 · D-04a — 서버가 주문금액을 모르는 레거시 전략(에코 금액 0)', () => {
  /** 레거시 — 서버 금액 0 · 수량 500주 · 매수 무장. */
  const legacy = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyOrderAmount: 0, buyOrderQty: 500, buyEnabled: true, ...over });
  const AMOUNT_FIRST = '주문금액을 먼저 입력해 주세요';

  it('선매수 금액 행은 클라 기본값(10만원)이 아니라 「—」 · 접근성 이름 「선매수 금액 미입력」', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    expect(rowText('lc-buy-order-amount')).toBe('—');
    expect(row('lc-buy-order-amount')).toHaveAccessibleName('선매수 금액 미입력');
  });

  it('다른 값 확정(인라인 Enter) → 전송 0 · 말풍선 「주문금액을 먼저 입력해 주세요」', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    editInline('lc-buy-watch-qty', '9000');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(AMOUNT_FIRST);
  });

  it('켜는 스위치 → 전송 0 · 폼 맨 위 한 줄 「주문금액을 먼저 입력해 주세요」', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(submitError()).toHaveTextContent(AMOUNT_FIRST);
  });

  it('끄기(매수주문 끄기)는 늘 허용 — 금액·수량은 서버 값 그대로(0 · 500주) 나간다', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    click(sw('매수주문 켜기')); // 켜진 스위치를 누른다 = 끄기(접근성 이름은 고정)
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyEnabled).toBe(false);
    expect(lastConfig().buyOrderAmount).toBe(0);
    expect(lastConfig().buyOrderQty).toBe(500);
    expect(submitError()).toBeNull();
  });

  it('주문금액 인라인은 빈 칸으로 열리고, 확정하면 새 금액으로 수량을 계산해 보낸다 → 에코 뒤 정상', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: legacy() })} />);
    const el = openInline('lc-buy-order-amount');
    expect(el.value).toBe('');
    typeValue(el, '260');
    pressKey(el, 'Enter');
    expect(sentConfigs()).toHaveLength(1);
    // floor(260만원 / 130,000) = 20주
    expect(lastConfig().buyOrderAmount).toBe(260);
    expect(lastConfig().buyOrderQty).toBe(20);
    const known = legacy({ buyOrderAmount: 260, buyOrderQty: 20 });
    rerender(<LimitChaserForm {...props({ server: known })} />);
    rerender(<LimitChaserForm {...props({ server: known, serverAnswerSeq: 1 })} />);
    expect(rowText('lc-buy-order-amount')).toBe('260만원');
    editInline('lc-buy-watch-qty', '9000');
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig().buyOrderQty).toBe(20);
  });

  describe('터치 기기 — 시트', () => {
    beforeEach(() => mockPointer(true));
    afterEach(restoreMatchMedia);
    const sheetEl = () => document.querySelector('[data-slot="numpad-sheet"]');

    it('주문금액 시트는 빈 값 · 「지금 ○○」 없음', () => {
      render(<LimitChaserForm {...props({ server: legacy() })} />);
      click(row('lc-buy-order-amount'));
      expect(sheetEl()).not.toBeNull();
      expect(document.querySelector('[data-slot="numpad-value"]')?.textContent).toBe('');
      expect(document.querySelector('[data-slot="numpad-server"]')).toBeNull();
    });

    it('다른 값 시트는 적용이 잠기고 상태 줄이 「주문금액을 먼저 입력해 주세요」', () => {
      render(<LimitChaserForm {...props({ server: legacy() })} />);
      click(row('lc-buy-watch-qty'));
      const pad = within(within(sheetEl() as HTMLElement).getByRole('group', { name: '숫자 키패드' }));
      for (const k of ['9', '0', '0', '0']) click(pad.getByRole('button', { name: k }));
      const status = document.querySelector('[data-slot="numpad-status"]') as HTMLElement;
      expect(within(status).getByRole('alert')).toHaveTextContent(AMOUNT_FIRST);
      expect(document.querySelector('[data-slot="numpad-confirm"]')).toBeDisabled();
      expect(sentConfigs()).toHaveLength(0);
    });
  });

  it('미등록 전략은 해당 없다 — 주문금액 행은 폼 값 그대로', () => {
    render(<LimitChaserForm {...props({ server: null })} />);
    expect(rowText('lc-buy-order-amount')).toBe('10만원');
  });
});

describe('⑮ 매수 카드 4장 · 제목줄 접기 · 요약 줄 · 자동 펼침 · 후매수 단계 (Phase 24 ⑤ ⑥ ⑩ · R1)', () => {
  const FOLD_SLOTS = ['pre-buy', 'extra-buy', 'post-buy'] as const;
  const rowsOf = (slot: string) => group(slot).querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
  const EXHAUSTED = '소진 — 「최대」에 횟수를 넣고 다시 켜면 그 값부터 세요';

  it('첫 렌더 — 세 그룹 카드 접힘(aria-expanded=false) · 행 영역 hidden 클래스(DOM 유지) · 요약 줄 3개 · 공통 카드는 접기 없음', () => {
    render(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true }) })} />);
    for (const slot of FOLD_SLOTS) {
      expect(fold(slot)).toHaveAttribute('aria-expanded', 'false');
      expect(rowsOf(slot).classList.contains('hidden')).toBe(true);
      expect(rowsOf(slot).children.length).toBeGreaterThan(0);
      expect(fold(slot).getAttribute('aria-controls')).toBe(rowsOf(slot).id);
    }
    // 켜진 그룹(선매수 ON)도 자동으로 펼치지 않는다.
    expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('[data-slot="lc-group-summary"]')).toHaveLength(3);
    expect(group('buy').querySelector('[data-slot="lc-group-fold"]')).toBeNull();
    expect(rowsOf('buy').classList.contains('hidden')).toBe(false);
  });

  it('접기 버튼 → 그 카드만 펼침 · lc.set 0 · 에코 재렌더 · 탭 전환 뒤에도 펼친 채', () => {
    const { rerender } = render(<LimitChaserForm {...props({ tab: 'buy', hideTabs: true })} />);
    click(fold('extra-buy'));
    expect(fold('extra-buy')).toHaveAttribute('aria-expanded', 'true');
    expect(rowsOf('extra-buy').classList.contains('hidden')).toBe(false);
    expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'false');
    expect(fold('post-buy')).toHaveAttribute('aria-expanded', 'false');
    expect(sendMock).not.toHaveBeenCalled();
    rerender(<LimitChaserForm {...props({ tab: 'buy', hideTabs: true, server: echo({ buyWatchQty: 5_000 }) })} />);
    expect(fold('extra-buy')).toHaveAttribute('aria-expanded', 'true');
    rerender(<LimitChaserForm {...props({ tab: 'sell', hideTabs: true, server: echo({ buyWatchQty: 5_000 }) })} />);
    rerender(<LimitChaserForm {...props({ tab: 'buy', hideTabs: true, server: echo({ buyWatchQty: 5_000 }) })} />);
    expect(fold('extra-buy')).toHaveAttribute('aria-expanded', 'true');
    click(fold('extra-buy'));
    expect(fold('extra-buy')).toHaveAttribute('aria-expanded', 'false');
  });

  it('그룹 스위치는 접기 버튼 밖 형제 — 눌러도 aria-expanded 불변', () => {
    render(<LimitChaserForm {...props()} />);
    const s = sw('후매수 켜기');
    expect(fold('post-buy').contains(s)).toBe(false);
    click(s);
    expect(fold('post-buy')).toHaveAttribute('aria-expanded', 'false');
  });

  it('요약 줄 — 선매수 「금액 · 매도잔량 · 체결량 · 한방」 · 추가매수 「금액 · 최소 · 최대」 · 후매수 5항목', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({
            buyOrderAmount: 4000,
            extraBuyOrderAmount: 4000,
            extraBuyMinQty: 50_000,
            extraBuyMaxQty: 0,
            postBuyOrderAmount: 4000,
            postBuyReentry: 3,
            postBuyReentryLeft: 2,
            postBuyPhase: 1,
            postBuyEnabled: true,
            postBuyReboundPct: 30,
            postBuyFloorQty: 100_000,
          }),
        })}
      />,
    );
    const kvs = (slot: string) =>
      Array.from(group(slot).querySelectorAll('[data-slot="lc-group-summary"] > span')).map((el) => el.textContent);
    expect(kvs('pre-buy')).toEqual(['금액4,000만원', '매도잔량10,000주', '체결량꺼짐', '한방꺼짐']);
    expect(kvs('extra-buy')).toEqual(['금액4,000만원', '최소50,000주', '최대무제한']);
    expect(kvs('post-buy')).toEqual(['금액4,000만원', '최대3회 · 남은 2회', '최소100,000주', '반등30%', '발동잔량—']);
  });

  it('T-24-19 — 접힌 카드 안 행 확정이 거부되면 그 카드가 자동으로 펼쳐진다', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    click(fold('pre-buy'));
    editInline('lc-buy-watch-qty', '9000');
    expect(sentConfigs()).toHaveLength(1);
    click(fold('pre-buy'));
    expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'false');
    // 거부 — 답 신호만 오르고 서버 값은 그대로다.
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(INLINE_FAILED)).toBeInTheDocument();
  });

  it('그룹 스위치 실패 · 에코로는 펼치지 않는다', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    click(sw('선매수 켜기'));
    rerender(<LimitChaserForm {...props({ server: srv, serverAnswerSeq: 1 })} />);
    expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'false');
    rerender(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true, buyWatchQty: 7_000 }), serverAnswerSeq: 2 })} />);
    expect(fold('pre-buy')).toHaveAttribute('aria-expanded', 'false');
  });

  it('후매수 소진(단계 3) — 스위치 OFF · 상태 「소진」 · 「3회 · 남은 0회」 · 펼친 경우만 소진 안내', () => {
    const exhausted = echo({ postBuyEnabled: false, postBuyPhase: 3, postBuyReentry: 3, postBuyReentryLeft: 0 });
    render(<LimitChaserForm {...props({ server: exhausted, groupStatus: { postBuy: '소진' } })} />);
    expect(sw('후매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(within(fold('post-buy')).getByText('소진')).toBeInTheDocument();
    expect(rowText('lc-post-buy-reentry')).toBe('3회 · 남은 0회');
    expect(document.querySelector('[data-slot="lc-post-buy-exhausted"]')).toBeNull();
    click(fold('post-buy'));
    const note = document.querySelector('[data-slot="lc-post-buy-exhausted"]') as HTMLElement;
    expect(note.textContent).toBe(EXHAUSTED);
    // 「최대」 행 바로 아래.
    expect(row('lc-post-buy-reentry').nextElementSibling).toBe(note);
  });

  it('단계 0 이면 최대 「3회」 · 발동잔량 행은 단계 0 에서도 늘 그려진다(「—」 + sr-only 「없음」)', () => {
    render(<LimitChaserForm {...props({ server: echo({ postBuyReentry: 3 }) })} />);
    expect(rowText('lc-post-buy-reentry')).toBe('3회');
    const trig = group('post-buy').querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    expect(trig).not.toBeNull();
    expect(trig.querySelector('button')).toBeNull();
    expect(within(trig).getByText('—')).toBeInTheDocument();
    expect(trig.querySelector('.sr-only')!.textContent).toBe('없음');
  });

  it('보유중(단계 2) — 발동잔량 「330,000주」 `--up` · 최대 「3회 · 남은 2회」', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({ postBuyEnabled: true, postBuyPhase: 2, postBuyReentry: 3, postBuyReentryLeft: 2, postBuyTriggerQty: 330_000, postBuyReboundPct: 30 }),
        })}
      />,
    );
    const v = within(group('post-buy')).getByText('330,000주');
    expect(v.className).toContain('text-[var(--up)]');
    expect(rowText('lc-post-buy-reentry')).toBe('3회 · 남은 2회');
  });

  it('⑩ 흐림 — 선매수 OFF 면 선매수 행 · 요약 한 겹 · 한방 체크 OFF 면 한방가격 흐림 · 원형 체크는 흐리지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true, sweepEnabled: false }) })} />);
    // 선매수 ON — 금액 행은 선명 · 한방 OFF 라 한방가격만 흐림.
    expect(opacityLayers(row('lc-buy-order-amount'))).toBe(0);
    expect(opacityLayers(row('lc-sweep-watch-price'))).toBe(1);
    const sweepCircle = document.querySelector('#lc-sweep [data-slot="lc-check-circle"]') as HTMLElement;
    expect(opacityLayers(sweepCircle)).toBe(0);
  });

  it('⑩ 흐림 — 선매수 OFF 면 요약 줄과 행이 한 겹씩 · 흐려도 aria-disabled 없음', () => {
    render(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: false }) })} />);
    expect(opacityLayers(group('pre-buy').querySelector('[data-slot="lc-group-summary"]') as HTMLElement)).toBe(1);
    expect(opacityLayers(row('lc-buy-order-amount'))).toBe(1);
    expect(row('lc-buy-order-amount')).not.toHaveAttribute('aria-disabled');
    expect(opacityLayers(fold('pre-buy'))).toBe(0);
  });

  it('⑩ 흐림 — 매도 에코 OFF 면 매도 가격 섹션 · 매도주문 행 · 매수취소 스위치 OFF 면 매수잔량 · 체결은 자기 체크만', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEnabled: false, cancelQtyEnabled: false, cancelTradeEnabled: true }) })} />);
    expect(opacityLayers(row('lc-sell-order-price'))).toBe(1);
    expect(opacityLayers(row('lc-sell-watch-qty'))).toBe(1);
    expect(opacityLayers(row('lc-cancel-watch-qty'))).toBe(1);
    const cancelTradeLabel = within(document.getElementById('lc-cancel-trade') as HTMLElement).getByText('체결');
    expect(opacityLayers(cancelTradeLabel)).toBe(0);
  });

  it('흐린 행 값 버튼 설명 = 카드 제목 + 상태 문구(R10)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false }), groupStatus: { buy: '꺼짐' } })} />);
    expect(row('lc-buy-order-price')).toHaveAccessibleDescription('매수주문 꺼짐');
  });
});

describe('⑯ 라벨 개명 · 시트 제목 · 접근성 이름 접두 · 의미어 (D-09 · D-10 · R14)', () => {
  it('같은 라벨 두 벌은 접근성 이름 접두로 갈린다 — 매수/매도 주문가격 · 매도/취소 매수잔량', () => {
    render(<LimitChaserForm {...props()} />);
    expect(row('lc-buy-order-price')).toHaveAccessibleName('매수 주문가격 130,000원');
    expect(row('lc-buy-watch-price')).toHaveAccessibleName('매수 비교가격 130,000원');
    expect(row('lc-sell-order-price')).toHaveAccessibleName('매도 주문가격 130,000원');
    expect(row('lc-sell-watch-qty')).toHaveAccessibleName('매도 매수잔량 100,000주');
    expect(row('lc-cancel-watch-qty')).toHaveAccessibleName('취소 매수잔량 10주');
    expect(row('lc-buy-order-amount')).toHaveAccessibleName('선매수 금액 50만원');
  });

  it('보이는 라벨 — 매도 「주문가격 · 비교가격 · 매수잔량」 · 취소 「매수잔량」 · 옛 라벨 없음', () => {
    render(<LimitChaserForm {...props()} />);
    const labelIn = (id: string) => row(id).querySelector('span')!.textContent;
    expect(labelIn('lc-sell-order-price')).toBe('주문가격');
    expect(labelIn('lc-sell-watch-qty')).toBe('매수잔량');
    expect(labelIn('lc-cancel-watch-qty')).toBe('매수잔량');
    expect(labelIn('lc-buy-order-price')).toBe('주문가격');
    for (const old of ['매수가격', '매도가격', '호가잔량', '취소잔량', '호가변경', '주문금액']) {
      expect(screen.queryByText(old, { exact: true })).toBeNull();
    }
  });

  it('D-10 의미어 — 추가매수 최대 0 「무제한」 · 최소 0 「1주」 · 후매수 최소 잔량 0 「없음」(행 · 접근성 이름)', () => {
    render(<LimitChaserForm {...props({ server: echo({ extraBuyMaxQty: 0, extraBuyMinQty: 0, postBuyFloorQty: 0, extraBuyOrderAmount: 0 }) })} />);
    expect(rowText('lc-extra-buy-max-qty')).toBe('무제한');
    expect(row('lc-extra-buy-max-qty')).toHaveAccessibleName('추가매수 최대 잔량 무제한');
    expect(rowText('lc-extra-buy-min-qty')).toBe('1주');
    expect(rowText('lc-post-buy-floor-qty')).toBe('없음');
    expect(rowText('lc-extra-buy-amount')).toBe('—');
    expect(row('lc-extra-buy-amount')).toHaveAccessibleName('추가매수 금액 미입력');
  });

  it('의미어 행을 열면 숫자 0 으로 편집한다(D-10)', () => {
    render(<LimitChaserForm {...props({ server: echo({ extraBuyMaxQty: 0 }) })} />);
    const el = openInline('lc-extra-buy-max-qty');
    expect(el.value).toBe('0');
  });

  describe('터치 기기 — 시트 제목 · 「지금 ○○」', () => {
    beforeEach(() => mockPointer(true));
    afterEach(restoreMatchMedia);
    const sheetEl = () => document.querySelector('[data-slot="numpad-sheet"]') as HTMLElement | null;

    it.each([
      ['lc-buy-order-amount', '선매수 금액'],
      ['lc-post-buy-reentry', '후매수 최대 횟수'],
      ['lc-sweep-tick', '한방 건수'],
      ['lc-sell-watch-qty', '매수잔량'],
      ['lc-cancel-watch-qty', '매수잔량'],
    ])('%s → 시트 「%s」 · 확정 「%s 적용」', (id, title) => {
      render(<LimitChaserForm {...props()} />);
      click(row(id));
      expect(screen.getByRole('dialog', { name: title })).toBe(sheetEl());
      expect(document.querySelector('[data-slot="numpad-confirm"]')!.textContent).toBe(`${title} 적용`);
    });

    it('시트 「지금 ○○」 — 의미어 「지금 무제한」 · 후매수 최대는 잔여가 아니라 설정값 「지금 3회」', () => {
      const { unmount } = render(<LimitChaserForm {...props({ server: echo({ extraBuyMaxQty: 0 }) })} />);
      click(row('lc-extra-buy-max-qty'));
      expect(document.querySelector('[data-slot="numpad-server"]')!.textContent).toBe('지금 무제한');
      unmount();
      render(
        <LimitChaserForm
          {...props({ server: echo({ postBuyEnabled: true, postBuyPhase: 1, postBuyReentry: 3, postBuyReentryLeft: 2, postBuyReboundPct: 30 }) })}
        />,
      );
      click(row('lc-post-buy-reentry'));
      expect(document.querySelector('[data-slot="numpad-server"]')!.textContent).toBe('지금 3회');
    });

    it('후매수 최대는 0 을 받는다(0 = 사지 않음) · 반등 시트는 1~100(0 잠금)', () => {
      const { unmount } = render(<LimitChaserForm {...props()} />);
      click(row('lc-post-buy-reentry'));
      const pad = within(within(sheetEl()!).getByRole('group', { name: '숫자 키패드' }));
      click(pad.getByRole('button', { name: '0' }));
      expect(document.querySelector('[data-slot="numpad-confirm"]')).toBeEnabled();
      unmount();
      render(<LimitChaserForm {...props()} />);
      click(row('lc-post-buy-rebound'));
      const pad2 = within(within(sheetEl()!).getByRole('group', { name: '숫자 키패드' }));
      click(pad2.getByRole('button', { name: '0' }));
      expect(document.querySelector('[data-slot="numpad-confirm"]')).toBeDisabled();
      expect(document.querySelector('[data-slot="numpad-status"]')!.textContent).toContain('1% 이상 입력해 주세요');
    });
  });
});
