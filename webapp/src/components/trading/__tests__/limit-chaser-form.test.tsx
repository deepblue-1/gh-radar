import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RelayLcSetMsg, RelayLimitChaser, RelayLimitChaserInput, RelayUserSettingsMsg } from '@gh-radar/shared';

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
 *   ⑥ S→C 전용 필드 미송신 · cfg 49키(+ postBuyAuto · quick-260929-vzy + extraBuyBurstRelease · quick-261003-rc4 + 자동매도 요청 4 · Phase 27) · 클라 고정 3(Pitfall 6)
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
/** 스토어의 84 사용자 설정(Phase 27 · 27-07) — 기본 미수신. 케이스가 바꾸면 다음 렌더부터 보인다. */
let mockUserSettings: RelayUserSettingsMsg | undefined;
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock, userSettings: mockUserSettings }),
  };
});

import { mockPointer, restoreMatchMedia } from '@/lib/__tests__/match-media';
import { isServerFoldEdge, LC_FOLD_HIDDEN_DEFER_MS, LimitChaserForm, type LimitChaserFormProps } from '../limit-chaser-form';
import { buyOrderQtyFromAmount } from '@/lib/limit-chaser';
import { LC_COMMIT_TEXT, LC_REJECT_ECHO_GRACE_MS } from '../lc/use-lc-field-commit';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';
import { POST_BUY_UNLOCK_SR_TEXT } from '../lc/lc-fields';
import { cardGroupStatusOf } from '../card/card-body';

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
  mockUserSettings = undefined;
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

  it('선매수 스위치도 같은 규율이다 — 1회 · preBuyEnabled true(마스터 ON 이면 동반 변화 없음)', () => {
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
    // 44 + extraBuyBurstRelease(quick-261003-rc4) = 45 + 자동매도 요청 4(Phase 27) = 49.
    expect(Object.keys(lastConfig())).toHaveLength(49);
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

describe('⑥ S→C 전용 필드를 보내지 않는다 · cfg 49키 (Pitfall 6) (옛 ⑨)', () => {
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
    // Phase 27 자동매도 에코 전용 4 — 서버가 계산한다.
    'autoSellState',
    'autoSellSoldQty',
    'autoSellBasis',
    'autoSellBasisPrice',
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
    'postBuyAuto',
    // + extraBuyBurstRelease(quick-261003-rc4) = 45.
    'extraBuyBurstRelease',
    // + 자동매도 요청 4(Phase 27 — relay 가 존재로 buy3_schema 4 를 파생한다) = 49.
    'autoSellEnabled',
    'autoSellStartCond',
    'autoSellRatioPct',
    'autoSellMethod',
  ];
  function expectCleanCfg(cfg: RelayLimitChaserInput): void {
    const keys = Object.keys(cfg);
    expect(keys).toHaveLength(49);
    expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort());
    for (const f of FORBIDDEN) expect(keys).not.toContain(f);
    expect(keys).not.toContain('key');
    expect(keys).not.toContain('market');
  }

  it('스위치 경로 cfg 키가 정확히 49개다 — 래치 상태여도 S→C 필드를 되보내지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    click(sw('매도주문 켜기'));
    expectCleanCfg(lastConfig());
  });

  it('값 경로 cfg 키도 정확히 49개다', () => {
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

  it('매수 pane = 매수주문 → 선매수 → 추가매수 → 후매수 · 매도 pane = 매도주문 → 매수취소 → 자동매도 (quick-261001-gjk · Phase 27 D-01)', () => {
    render(<LimitChaserForm {...props()} />);
    expect(slotsIn('buy')).toEqual(['lc-group-buy', 'lc-group-pre-buy', 'lc-group-extra-buy', 'lc-group-post-buy']);
    expect(slotsIn('sell')).toEqual(['lc-group-sell', 'lc-group-cancel', 'lc-group-auto-sell']);
    expect(document.querySelector('[data-slot="lc-group-buy-price"]')).toBeNull();
    expect(document.querySelector('[data-slot="lc-group-sweep"]')).toBeNull();
  });

  it('매도주문 한 카드 — 제목줄(스위치 「매도주문 켜기」) 아래 주문가격 · 비교가격 · 매도비율 · 매수잔량 · ○잔량추적 · ○체결 · (래치 때) 기준선 (quick-261001-gjk)', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEntryLatched: true }) })} />);
    const header = group('sell').querySelector('[data-slot="lc-group-header"]') as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByText('매도주문')).toBeInTheDocument();
    expect(within(header).getByRole('switch', { name: '매도주문 켜기' })).toBeInTheDocument();
    const rows = Array.from((group('sell').querySelector('[data-slot="lc-group-rows"]') as HTMLElement).children);
    const keyOf = (el: Element) =>
      el.getAttribute('data-lc-field') ??
      el.querySelector('[data-lc-field]')?.getAttribute('data-lc-field') ??
      el.getAttribute('data-slot');
    expect(rows.map(keyOf)).toEqual([
      'lc-sell-order-price',
      'lc-sell-watch-price',
      'lc-sell-order-ratio',
      'lc-sell-watch-qty',
      'lc-sell-qty-track-ratio',
      'lc-sell-min-trade-qty',
      'lc-derived',
    ]);
  });

  it('선매수 행 = 금액 · 매도잔량 · ○체결량 · ○한방 · 한방가격 · 매도주문 잔량추적·체결 · 매수취소 체결·잔량추적은 그룹 끝', () => {
    render(<LimitChaserForm {...props()} />);
    const rowsOf = (slot: string) =>
      Array.from((group(slot).querySelector('[data-slot="lc-group-rows"]') as HTMLElement).children);
    expect(rowsOf('pre-buy').map((el) => el.getAttribute('data-lc-field') ?? el.getAttribute('data-slot'))).toEqual([
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
      '[data-lc-field]:not([data-slot="lc-check-row"] [data-lc-field]), [data-slot="lc-check-row"], [data-slot="lc-derived"], [data-slot="lc-post-buy-trigger"], [data-slot="lc-auto-sell-sold"], [data-slot="lc-auto-sell-basis"]',
    );
    // 값 행 19(공통 2 · 선매수 3 · 추가매수 3 · 후매수 4 · 매도주문 4 · 취소 1 · 자동매도 2) + 3택 행 2(자동매도 방법 —
    // 마우스 기기는 「라벨 ─ 값 ›」 행과 카드 ≥992 세그먼트 행을 둘 다 마운트하고 컨테이너 쿼리로 하나만 보인다) +
    // 체크 행 7(+ 추가매수 버스트 시 해제 · quick-261003-rc4) + 기준선 1 + 발동잔량 1 + 자동매도 누적 · 기준 2 = 32
    // (고정 스키마 — E1 zero-one-many).
    expect(rows).toHaveLength(32);
    for (const r of Array.from(rows)) expect(r.className).toContain('min-h-[44px]');
    openInline('lc-sweep-watch-price');
    const editing = document.querySelector('[data-lc-field="lc-sweep-watch-price"][data-editing="true"]') as HTMLElement;
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
    expect(folds).toHaveLength(4);
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

  it('시세를 못 받은 종목(가격 전부 0)은 마스터 · 세 그룹 스위치가 비활성이고 사유 한 줄(게이트 이름 병합)이 매수 열 **맨 아래**에 선다', () => {
    render(<LimitChaserForm {...props({ server: null })} />);
    for (const name of ['매수주문 켜기', '선매수 켜기', '추가매수 켜기', '후매수 켜기']) expect(sw(name)).toBeDisabled();
    const panel = panelIn('buy') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(pane('buy').lastElementChild).toBe(panel);
    expect(reasons('buy')).toEqual([
      '매수주문 · 선매수 · 추가매수 · 후매수 · 시세를 받지 못해 주문가격이 0 이에요. 주문가격을 입력하면 켤 수 있어요.',
    ]);
  });

  it('비교가격 0 이면 비교가격 문구 — 서버가 마스터를 눕히는 값이다(relay `buy` 갈래 동형)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buyEnabled: false, buyWatchPrice: 0, sellEnabled: true }) })} />);
    expect(sw('매수주문 켜기')).toBeDisabled();
    expect(reasons('buy')).toEqual([
      '매수주문 · 선매수 · 추가매수 · 후매수 · 시세를 받지 못해 비교가격이 0 이에요. 비교가격을 입력하면 켤 수 있어요.',
    ]);
  });

  it('주문금액이 모자라 0주여도 패널 · 스위치 `disabled` 는 없다 — 수량 0 은 누르는 순간의 사전 검증이다(R7)', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 1_274_000 })} />);
    expect(panelIn('buy')).toBeNull();
    expect(sw('매수주문 켜기')).toBeEnabled();
    expect(sw('선매수 켜기')).toBeEnabled();
  });

  it('매도 사유는 매도 열에만 선다 — 매수 사유가 새지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellWatchQty: 0 }) })} />);
    expect(panelIn('buy')).toBeNull();
    expect(reasons('sell')).toEqual(['매도주문 · 매도 매수잔량이 0 이에요. 감시할 매수잔량을 입력하면 켤 수 있어요.']);
    expect(sw('매도주문 켜기')).toBeDisabled();
  });

  it('켜진 게이트의 주문가격을 0 으로 확정 → 전송 0 + 그 자리 「매수주문 · 시세를 받지 못해 …」', () => {
    render(<LimitChaserForm {...props()} />);
    editInline('lc-buy-order-price', '0');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByText(/^매수주문 · 시세를 받지 못해 주문가격이 0 이에요/)).toBeInTheDocument();
    expect(input('lc-buy-order-price')).not.toBeNull();
  });

  it('켜진 선매수의 금액을 수량 0 이 되게 확정 → 전송 0 + 「선매수 · 금액이 주문가격보다 작아 …」(값 경로는 armBlockOf)', () => {
    render(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true }) })} />);
    click(fold('pre-buy'));
    editInline('lc-buy-order-amount', '1');
    expect(sentConfigs()).toHaveLength(0);
    expect(
      screen.getByText('선매수 · 금액이 주문가격보다 작아 주문수량이 0주예요 — 금액을 올려 주세요'),
    ).toBeInTheDocument();
  });

  it('선매수 ∧ 한방가격 0 이면 한방 체크 켜기가 폼 맨 위 「선매수 한방 · …」로 막힌다 · 선매수 OFF 면 막지 않는다', () => {
    const { unmount } = render(
      <LimitChaserForm {...props({ server: echo({ preBuyEnabled: true, sweepWatchPrice: 0 }) })} />,
    );
    click(chk('선매수 한방'));
    expect(sentConfigs()).toHaveLength(0);
    expect(submitError()?.textContent).toBe(
      '선매수 한방 · 시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.',
    );
    unmount();
    render(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: false, sweepWatchPrice: 0 }) })} />);
    click(chk('선매수 한방'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().sweepEnabled).toBe(true);
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
  it('★ 두 pane 이 언제나 DOM 에 있고 비활성 pane 만 `hidden @min-[685px]/lc:block` 이다', () => {
    render(<LimitChaserForm {...props()} />);
    expect(pane('buy').className).not.toContain('hidden');
    expect(pane('sell').className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', '@min-[685px]/lc:block']));
    click(screen.getByRole('tab', { name: '매도' }));
    expect(pane('buy').className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', '@min-[685px]/lc:block']));
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

  it('≥685 열 머리 「● 매수」「● 매도」 — 폰은 숨김 · 점 `--up`/`--down` · 15/700 (D-03)', () => {
    render(<LimitChaserForm {...props()} />);
    for (const [side, text, dot] of [
      ['buy', '매수', 'bg-[var(--up)]'],
      ['sell', '매도', 'bg-[var(--down)]'],
    ] as const) {
      const head = pane(side).querySelector('[data-slot="lc-column-head"]') as HTMLElement;
      expect(head.textContent).toBe(text);
      expect(head.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['hidden', '@min-[685px]/lc:flex', 'text-[15px]', 'font-bold']),
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
  it('새 에코가 행을 덮는다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    rerender(<LimitChaserForm {...props({ server: echo({ buyWatchQty: 5_000 }) })} />);
    expect(rowText('lc-buy-watch-qty')).toBe('5,000주');
  });

  it('구서버 `buyOrderAmount: 0` 에코(서버가 모른다 · Pitfall 11) → 주문금액 행은 폼에 남은 값이 아니라 「—」 (D-04a · WR-07)', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    rerender(<LimitChaserForm {...props({ server: echo({ buy3Schema: 0, buyOrderAmount: 0, buyWatchQty: 7_000 }) })} />);
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
      '매도주문 · 매도 매수잔량이 0 이에요. 감시할 매수잔량을 입력하면 켤 수 있어요.',
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

describe('WR-02 · D-04a 잔여 — 구서버 에코(buy3Schema 0)', () => {
  /**
   * 구서버 에코(`buy3Schema 0`) · 서버 금액 0 · 수량 500주 · 매수 무장. 구서버 에코는 끄기만 · 매수주문부터(WR-02)라
   * D-04a 에서 남는 것은 금액 행 「—」 표기와 끄기 cfg 의 서버 금액 · 수량뿐이다.
   */
  const legacy = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buy3Schema: 0, buyOrderAmount: 0, buyOrderQty: 500, buyEnabled: true, ...over });
  const AMOUNT_FIRST = '주문금액을 먼저 입력해 주세요';
  const LEGACY_READ_ONLY = '구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요';
  const LEGACY_MASTER_FIRST = '구서버 전략이라 매수주문부터 꺼 주세요';

  it('선매수 금액 행은 클라 기본값(10만원)이 아니라 「—」 · 접근성 이름 「선매수 금액 미입력」', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    expect(rowText('lc-buy-order-amount')).toBe('—');
    expect(row('lc-buy-order-amount')).toHaveAccessibleName('선매수 금액 미입력');
  });

  it('다른 값 확정(인라인 Enter) → 전송 0 · 말풍선 구서버 읽기 전용 문장(확정 전 검증이 훅과 같은 lcLegacyBlockOf)', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    editInline('lc-buy-watch-qty', '9000');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(LEGACY_READ_ONLY);
    expect(screen.queryByText(AMOUNT_FIRST)).toBeNull();
  });

  it('금액을 아는 구서버 에코(마스터 ON)의 비교가격 인라인 확정 → 전송 0 · 편집기 말풍선 구서버 읽기 전용 문장', () => {
    render(<LimitChaserForm {...props({ server: legacy({ buyOrderAmount: 50, buyOrderQty: 3 }) })} />);
    const el = editInline('lc-buy-watch-price', '129000');
    expect(sentConfigs()).toHaveLength(0);
    expect(el).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(LEGACY_READ_ONLY);
  });

  it('켜는 스위치는 `disabled` — 눌러도 전송 0 · 사유는 누르기 전에 매도 열 「켤 수 없는 이유」 패널 한 줄(WR-02 — 구서버 에코는 읽기 전용 · 24-13)', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    expect(sw('매도주문 켜기')).toBeDisabled();
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(pane('sell').querySelector('[data-slot="lc-arm-blocked-text"]')).toHaveTextContent(LEGACY_READ_ONLY);
  });

  it('WR-02 — 매수가 켜진 채 매도 끄기 → 전송 0 · 폼 맨 위 「구서버 전략이라 매수주문부터 꺼 주세요」 · 매도 그대로 → 매수주문 끄기 → 전송 1 · cfg 마스터 false', () => {
    render(<LimitChaserForm {...props({ server: legacy({ buyOrderAmount: 50, buyOrderQty: 3, sellEnabled: true }) })} />);
    click(sw('매도주문 켜기')); // 켜진 스위치를 누른다 = 끄기
    expect(sentConfigs()).toHaveLength(0);
    expect(submitError()).toHaveTextContent(LEGACY_MASTER_FIRST);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'true');
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyEnabled).toBe(false);
    expect(lastConfig().sellEnabled).toBe(true);
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

  it('주문금액 인라인은 빈 칸으로 열리지만 확정은 보내지 않는다 — 구서버 에코는 읽기 전용이라 금액부터 받는 경로가 없다(WR-02)', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    const el = openInline('lc-buy-order-amount');
    expect(el.value).toBe('');
    typeValue(el, '300');
    pressKey(el, 'Enter');
    expect(sentConfigs()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(LEGACY_READ_ONLY);
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

    it('다른 값 시트는 적용이 잠기고 상태 줄이 구서버 읽기 전용 문장', () => {
      render(<LimitChaserForm {...props({ server: legacy() })} />);
      click(row('lc-buy-watch-qty'));
      const pad = within(within(sheetEl() as HTMLElement).getByRole('group', { name: '숫자 키패드' }));
      for (const k of ['9', '0', '0', '0']) click(pad.getByRole('button', { name: k }));
      const status = document.querySelector('[data-slot="numpad-status"]') as HTMLElement;
      expect(within(status).getByRole('alert')).toHaveTextContent(LEGACY_READ_ONLY);
      expect(document.querySelector('[data-slot="numpad-confirm"]')).toBeDisabled();
      expect(sentConfigs()).toHaveLength(0);
    });
  });

  it('미등록 전략은 해당 없다 — 주문금액 행은 폼 값 그대로', () => {
    render(<LimitChaserForm {...props({ server: null })} />);
    // D-04 새 전략 기본값 — 선매수 금액 4,000만원(옛 10만원 폐기 · 24-07).
    expect(rowText('lc-buy-order-amount')).toBe('4,000만원');
  });
});

describe('WR-02 — 구서버 에코 화면: 켜는 방향 disabled · 열 패널 한 줄 (24-13)', () => {
  /** 구서버 에코 — 마스터 ON · 매도 ON · 선 · 추가 · 후매수 · 매수취소 OFF(24-13 e2e 시드와 같은 모양). */
  const legacy = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buy3Schema: 0, buyEnabled: true, sellEnabled: true, ...over });
  const LEGACY_READ_ONLY = '구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요';
  const lines = (side: 'buy' | 'sell') =>
    Array.from(pane(side).querySelectorAll('[data-slot="lc-arm-blocked"]')).map((li) => ({
      gates: li.querySelector('[data-slot="lc-arm-blocked-gates"]')?.textContent,
      text: li.querySelector('[data-slot="lc-arm-blocked-text"]')?.textContent,
    }));

  it('꺼진 스위치(선매수 · 추가매수 · 후매수 · 매수취소)는 `disabled` · 켜진 스위치(매수주문 · 매도주문)는 끌 수 있다(T-16-44)', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    for (const name of ['선매수 켜기', '추가매수 켜기', '후매수 켜기', '매수취소 켜기']) expect(sw(name)).toBeDisabled();
    for (const name of ['매수주문 켜기', '매도주문 켜기']) expect(sw(name)).toBeEnabled();
  });

  it('매수 열 패널 한 줄 = 「매수주문 · 선매수 · 추가매수 · 후매수」 + legacyReadOnly · 매도 열 한 줄 = 「매도주문 · 매수취소」 + legacyReadOnly', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    expect(lines('buy')).toEqual([{ gates: '매수주문 · 선매수 · 추가매수 · 후매수', text: LEGACY_READ_ONLY }]);
    expect(lines('sell')).toEqual([{ gates: '매도주문 · 매수취소', text: LEGACY_READ_ONLY }]);
    expect(pane('buy').lastElementChild).toBe(pane('buy').querySelector('[data-slot="lc-arm-blocked-panel"]'));
  });

  it('가격 0 · 매도 매수잔량 0 사유가 함께 있어도 구서버 한 줄이 그 열의 유일한 줄이다', () => {
    render(
      <LimitChaserForm
        {...props({ server: legacy({ buyEnabled: false, buyOrderPrice: 0, sellEnabled: false, sellWatchQty: 0 }) })}
      />,
    );
    expect(lines('buy')).toEqual([{ gates: '매수주문 · 선매수 · 추가매수 · 후매수', text: LEGACY_READ_ONLY }]);
    expect(lines('sell')).toEqual([{ gates: '매도주문 · 매수취소', text: LEGACY_READ_ONLY }]);
  });

  it('켜진 매수주문을 끄면 전송 1(24-12 규칙) · 꺼진 스위치는 눌러도 전송 0(disabled)', () => {
    render(<LimitChaserForm {...props({ server: legacy() })} />);
    for (const name of ['선매수 켜기', '추가매수 켜기', '후매수 켜기', '매수취소 켜기']) click(sw(name));
    expect(sentConfigs()).toHaveLength(0);
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyEnabled).toBe(false);
    expect(lastConfig().sellEnabled).toBe(true);
  });

  it('매수취소가 켜져 있으면 끌 수 있다 — 매수취소도 켜는 방향만 막는다', () => {
    render(<LimitChaserForm {...props({ server: legacy({ cancelQtyEnabled: true }) })} />);
    expect(sw('매수취소 켜기')).toBeEnabled();
  });

  it('buy3 에코(buy3Schema 1)는 종전과 같다 — 패널 없음 · 여섯 스위치 모두 누를 수 있다', () => {
    render(<LimitChaserForm {...props({ server: legacy({ buy3Schema: 1 }) })} />);
    expect(pane('buy').querySelector('[data-slot="lc-arm-blocked-panel"]')).toBeNull();
    expect(pane('sell').querySelector('[data-slot="lc-arm-blocked-panel"]')).toBeNull();
    for (const name of ['매수주문 켜기', '선매수 켜기', '추가매수 켜기', '후매수 켜기', '매도주문 켜기', '매수취소 켜기']) {
      expect(sw(name)).toBeEnabled();
    }
  });

  it('세션 미준비(disabled)면 구서버여도 패널이 없다 — 종전 규칙(끊김은 폼 맨 위 몫)', () => {
    render(<LimitChaserForm {...props({ server: legacy(), disabled: true })} />);
    expect(pane('buy').querySelector('[data-slot="lc-arm-blocked-panel"]')).toBeNull();
    expect(pane('sell').querySelector('[data-slot="lc-arm-blocked-panel"]')).toBeNull();
  });
});

describe('WR-01 — buy3 선매수 금액 0 전략은 새 마운트 · 재마운트 뒤에도 편집된다 (24-VERIFICATION 갭 1)', () => {
  /**
   * 후매수 전용 buy3 전략 — 선매수 금액 0(미입력) · 선매수 수량 0 · 후매수 켜짐 · 매도 켜짐. 새로고침 뒤 첫 마운트와 같다.
   * buy3 서버는 선매수 금액을 늘 싣는다 — 0 은 「서버가 모른다」(구서버 D-04a)가 아니라 「선매수 금액 미입력」(D-03)이다.
   */
  const postOnly = (over: Partial<RelayLimitChaser> = {}) =>
    echo({
      buy3Schema: 1,
      buyOrderAmount: 0,
      buyOrderQty: 0,
      buyEnabled: true,
      postBuyEnabled: true,
      postBuyOrderAmount: 4000,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
      sellEnabled: true,
      ...over,
    });
  const AMOUNT_FIRST = '주문금액을 먼저 입력해 주세요';

  it('첫 마운트 — 선매수 금액 행 「—」 · 후매수 반등 확정이 1건 나간다(선매수 금액 · 수량 0 그대로) · 「주문금액을 먼저 입력해 주세요」 없음', () => {
    render(<LimitChaserForm {...props({ server: postOnly() })} />);
    expect(rowText('lc-buy-order-amount')).toBe('—');
    expect(row('lc-buy-order-amount')).toHaveAccessibleName('선매수 금액 미입력');
    click(fold('post-buy'));
    editInline('lc-post-buy-rebound', '40');
    expect(sentConfigs()).toHaveLength(1);
    const cfg = lastConfig();
    expect(cfg.postBuyReboundPct).toBe(40);
    expect(cfg.buyOrderAmount).toBe(0);
    expect(cfg.buyOrderQty).toBe(0);
    expect(screen.queryByText(AMOUNT_FIRST)).toBeNull();
  });

  it('재마운트 — unmount 뒤 새 render 에서도 비교가격 확정이 1건 나간다', () => {
    const first = render(<LimitChaserForm {...props({ server: postOnly() })} />);
    first.unmount();
    render(<LimitChaserForm {...props({ server: postOnly() })} />);
    editInline('lc-buy-watch-price', '129000');
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyWatchPrice).toBe(129_000);
    expect(lastConfig().buyOrderAmount).toBe(0);
    expect(screen.queryByText(AMOUNT_FIRST)).toBeNull();
  });

  it('선매수 금액 행을 300 으로 확정 → 1건 · cfg buyOrderAmount 300(정상 값 확정 경로)', () => {
    render(<LimitChaserForm {...props({ server: postOnly() })} />);
    editInline('lc-buy-order-amount', '300');
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().buyOrderAmount).toBe(300);
    // floor(300만원 / 130,000) = 23주
    expect(lastConfig().buyOrderQty).toBe(23);
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
    // 요약 줄 = 세 그룹 + 자동매도(Phase 27 D-01 — 매도 pane 접이식 카드)
    expect(document.querySelectorAll('[data-slot="lc-group-summary"]')).toHaveLength(4);
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
    const trig = group('post-buy').querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    const v = within(trig).getByText('330,000주');
    expect(v.className).toContain('text-[var(--up)]');
    expect(rowText('lc-post-buy-reentry')).toBe('3회 · 남은 2회');
  });

  it('잠금 중(단계 1 · 발동잔량 0) — 해제선 「264,000주」 를 `--muted-fg` 회색 + sr-only 「잠금 해제선」 (quick-261002-fim)', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({ postBuyEnabled: true, postBuyPhase: 1, postBuyTriggerQty: 0, postBuyUnlockQty: 264_000 }),
        })}
      />,
    );
    const trig = group('post-buy').querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    expect(trig.querySelector('button')).toBeNull();
    const v = within(trig).getByText('264,000주');
    expect(v.className).toContain('text-[var(--muted-fg)]');
    expect(v.className).not.toContain('--up');
    expect(trig.querySelector('.sr-only')!.textContent!.trim()).toBe(POST_BUY_UNLOCK_SR_TEXT);
    expect(within(trig).queryByText('—')).toBeNull();
  });

  it('발동잔량 · 해제선이 둘 다 오면 발동잔량 「330,000주」 `--up` 만 — 해제선은 그리지 않는다 (quick-261002-fim)', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({ postBuyEnabled: true, postBuyPhase: 1, postBuyTriggerQty: 330_000, postBuyUnlockQty: 264_000 }),
        })}
      />,
    );
    const trig = group('post-buy').querySelector('[data-slot="lc-post-buy-trigger"]') as HTMLElement;
    expect(within(trig).getByText('330,000주').className).toContain('text-[var(--up)]');
    expect(within(trig).queryByText('264,000주')).toBeNull();
    expect(trig.querySelector('.sr-only')).toBeNull();
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

  it('⑩ 흐림 — 매도 에코 OFF 면 매도주문 행(주문가격 · 매도비율 포함) · 매수취소 스위치 OFF 면 매수잔량 · 체결은 자기 체크만', () => {
    render(<LimitChaserForm {...props({ server: echo({ sellEnabled: false, cancelQtyEnabled: false, cancelTradeEnabled: true }) })} />);
    expect(opacityLayers(row('lc-sell-order-price'))).toBe(1);
    expect(opacityLayers(row('lc-sell-order-ratio'))).toBe(1);
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

describe('⑰ 그룹 스위치 D-01 · D-02 전반 — 마스터가 같은 제출에 함께 움직인다 (24-06 · UI-SPEC 상호작용 계약)', () => {
  it('D-01 — 마스터 OFF 에서 선매수 켬 → lc.set 1회 · cfg 선매수 + 마스터 true · 두 스위치 낙관 ON · 확인창 없음', () => {
    const off = echo({ buyEnabled: false, sellEnabled: true });
    const { rerender } = render(<LimitChaserForm {...props({ server: off })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: true, buyEnabled: true, crud: 'C' });
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // 거부(답만 증가) — 둘 다 서버 값으로 돌아온다.
    rerender(<LimitChaserForm {...props({ server: off, serverAnswerSeq: 1 })} />);
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sentConfigs()).toHaveLength(1);
  });

  it('D-01 — 추가매수 · 후매수도 같다(마스터 OFF → 동반 ON)', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({ buyEnabled: false, sellEnabled: true, extraBuyOrderAmount: 50, postBuyOrderAmount: 50, postBuyReboundPct: 30 }),
        })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: true, buyEnabled: true });
  });

  it('D-02 전반 — 마스터 ON · 후매수만 ON · 매도 ON 에서 후매수 끔 → cfg 후매수 false + 마스터 false · crud "C"', () => {
    render(
      <LimitChaserForm
        {...props({ server: echo({ postBuyEnabled: true, sellEnabled: true, postBuyOrderAmount: 50, postBuyReboundPct: 30 }) })}
      />,
    );
    click(sw('후매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ postBuyEnabled: false, buyEnabled: false, crud: 'C' });
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('D-02 전반 — 매도 · 취소 게이트까지 전부 OFF 면 그 제출이 곧 삭제(crud "D") · 확인창 없음', () => {
    render(
      <LimitChaserForm {...props({ server: echo({ postBuyEnabled: true, postBuyOrderAmount: 50, postBuyReboundPct: 30 }) })} />,
    );
    click(sw('후매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ postBuyEnabled: false, buyEnabled: false, crud: 'D' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('다른 그룹이 켜져 있으면 그 그룹만 끈다 — 선매수 · 후매수 ON 에서 선매수 끔 → 마스터 true 그대로', () => {
    render(
      <LimitChaserForm
        {...props({ server: echo({ preBuyEnabled: true, postBuyEnabled: true, postBuyOrderAmount: 50, postBuyReboundPct: 30 }) })}
      />,
    );
    click(sw('선매수 켜기'));
    expect(lastConfig()).toMatchObject({ preBuyEnabled: false, buyEnabled: true, postBuyEnabled: true });
  });

  it('D-05 — 새 전략에서 마스터만 켜면 세 그룹은 OFF 그대로(선매수 자동 ON 없음)', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(sw('매수주문 켜기'));
    expect(lastConfig()).toMatchObject({ buyEnabled: true, preBuyEnabled: false, extraBuyEnabled: false, postBuyEnabled: false });
  });

  it('미등록 전략에서 그룹 스위치를 켜면 마스터와 함께 등록이 나간다(LC_GATE_FIELDS)', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: true, buyEnabled: true, crud: 'C' });
  });
});

describe('⑰-b D-02 후반 · D-19 — WinForms 동형 서버 접힘 뒤 마스터 자동 끔 (가드 4개 · 2026-09-28 정정)', () => {
  /*
    ★ 웹이 보낸 전략의 에코 = 수량이 웹 산출과 같다 — `floor(50만원 / 130,000) = 3주`(`echo()` 기본 `buyOrderQty: 1` 은
      다른 클라가 둔 값처럼 읽힌다). WR-06 가드 ⑤ 는 에코와 `buyEnabled` 한 필드만 다를 때만 자동 끔을 보낸다.
  */
  /** 직전 에코 — 선매수 ON · 마스터 ON · 매도 ON. */
  const A = () => echo({ preBuyEnabled: true, sellEnabled: true, buyOrderQty: 3 });
  /** 서버가 선매수를 접은 에코 — 세 그룹 OFF · 마스터 ON · 매도 ON. */
  const B = (over: Partial<RelayLimitChaser> = {}) => echo({ sellEnabled: true, buyOrderQty: 3, ...over });
  /** 에코 적용 뒤 「다음 틱」. */
  const tick = () =>
    act(() => {
      vi.advanceTimersByTime(1);
    });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('D-02 후반 — 하강 전이(그룹 ON → 세 그룹 OFF · 마스터 ON) 뒤 다음 틱에 buyEnabled:false 정확히 1회 · crud C · 나머지 = 에코 · 사유 serverFold', () => {
    const onSent = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: A(), onSent })} />);
    const b = B({ sweepMinTickCount: 7 });
    rerender(<LimitChaserForm {...props({ server: b, onSent })} />);
    // 에코 적용과 같은 틱에는 보내지 않는다.
    expect(sentConfigs()).toHaveLength(0);
    tick();
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({
      buyEnabled: false,
      crud: 'C',
      sellEnabled: true,
      preBuyEnabled: false,
      sweepMinTickCount: 7,
    });
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent.mock.calls[0]![1]).toEqual({ cause: 'serverFold' });
    tick();
    expect(sentConfigs()).toHaveLength(1);
  });

  it('D-02 후반 — 같은 에코 B 재수신(새 객체 · 같은 값)은 추가 전송 0', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    rerender(<LimitChaserForm {...props({ server: B() })} />);
    tick();
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: B() })} />);
    tick();
    rerender(<LimitChaserForm {...props({ server: B() })} />);
    tick();
    expect(sentConfigs()).toHaveLength(1);
  });

  it('D-02 후반 — 첫 렌더가 곧 에코 B(이전 에코 없음 · 첫 스냅샷)면 전송 0', () => {
    render(<LimitChaserForm {...props({ server: B() })} />);
    tick();
    tick();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('D-02 후반 — 재접속(disabled true → false) 뒤 첫 에코가 B 여도 전송 0 (기준선 초기화)', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    const stale = A();
    rerender(<LimitChaserForm {...props({ server: stale, disabled: true })} />);
    tick();
    // 재접속 직후 — 옛 에코 객체가 아직 남아 있다가 lc.snap 이 새 에코로 덮는다.
    rerender(<LimitChaserForm {...props({ server: stale, disabled: false })} />);
    tick();
    rerender(<LimitChaserForm {...props({ server: B() })} />);
    tick();
    expect(sentConfigs()).toHaveLength(0);
    // 재접속 뒤 첫 에코가 곧장 B 인 경우도 같다.
    const second = render(<LimitChaserForm {...props({ server: A() })} />);
    second.rerender(<LimitChaserForm {...props({ server: A(), disabled: true })} />);
    second.rerender(<LimitChaserForm {...props({ server: B(), disabled: false })} />);
    tick();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('D-02 후반 가드 ① — 매도 · 취소>잔량 · 취소>체결 전부 OFF 면 (삭제가 되므로) 전송 0 · 매수주문 상태 「켜짐 · 켠 매수 없음」', () => {
    const status = { buy: '켜짐 · 켠 매수 없음' };
    const { rerender } = render(
      <LimitChaserForm {...props({ server: echo({ preBuyEnabled: true }), groupStatus: status })} />,
    );
    rerender(<LimitChaserForm {...props({ server: echo(), groupStatus: status })} />);
    tick();
    tick();
    expect(sentConfigs()).toHaveLength(0);
    expect(group('buy')).toHaveTextContent('켜짐 · 켠 매수 없음');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
  });

  it('D-02 후반 가드 ③ — 다른 확정이 in-flight 면 그 자리에서 0 · 그 성공 에코 뒤(여전히 접힘) 1회', () => {
    const onSent = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: A(), onSent })} />);
    editInline('lc-buy-watch-price', '129000');
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: B(), onSent })} />);
    tick();
    expect(sentConfigs()).toHaveLength(1);
    // in-flight 의 성공 에코 — 세 그룹 OFF · 마스터 ON 그대로.
    rerender(<LimitChaserForm {...props({ server: B({ buyWatchPrice: 129_000 }), onSent })} />);
    rerender(<LimitChaserForm {...props({ server: B({ buyWatchPrice: 129_000 }), serverAnswerSeq: 1, onSent })} />);
    tick();
    rerender(<LimitChaserForm {...props({ server: B({ buyWatchPrice: 129_000 }), serverAnswerSeq: 2, onSent })} />);
    tick();
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ buyEnabled: false, buyWatchPrice: 129_000 });
    expect(onSent.mock.calls[1]![1]).toEqual({ cause: 'serverFold' });
  });

  it('D-02 후반 가드 ② — 기다리는 사이 그룹이 다시 켜진 에코가 오면 전송 0', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    editInline('lc-buy-watch-price', '129000');
    rerender(<LimitChaserForm {...props({ server: B() })} />);
    tick();
    rerender(<LimitChaserForm {...props({ server: A() })} />);
    rerender(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true, sellEnabled: true, buyWatchPrice: 129_000 }), serverAnswerSeq: 1 })} />);
    tick();
    rerender(<LimitChaserForm {...props({ server: echo({ preBuyEnabled: true, sellEnabled: true, buyWatchPrice: 129_000 }), serverAnswerSeq: 2 })} />);
    tick();
    expect(sentConfigs()).toHaveLength(1);
  });

  it('D-02 후반 — 자동 끔 제출이 거부되면 마스터가 ON 으로 되돌아오고 재시도 0', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    const b = B();
    rerender(<LimitChaserForm {...props({ server: b })} />);
    tick();
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: b, serverAnswerSeq: 1 })} />);
    tick();
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    rerender(<LimitChaserForm {...props({ server: B(), serverAnswerSeq: 2 })} />);
    tick();
    tick();
    expect(sentConfigs()).toHaveLength(1);
  });

  it('D-02 후반 — 사람이 마지막 그룹을 꺼 마스터가 함께 꺼진 에코(D-02 전반 결과)는 트리거가 아니다', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: false, buyEnabled: false });
    rerender(<LimitChaserForm {...props({ server: B({ buyEnabled: false }) })} />);
    tick();
    rerender(<LimitChaserForm {...props({ server: B({ buyEnabled: false }), serverAnswerSeq: 1 })} />);
    tick();
    expect(sentConfigs()).toHaveLength(1);
  });

  it('D-34 — 서버가 세 그룹 접힘과 함께 마스터도 내린 에코(한 에코에 그룹 · 마스터 OFF)는 트리거가 아니다 · 전송 0', () => {
    // gh-trade D-34(9f07d025): 세 그룹이 모두 접히는 순간 서버가 마스터 게이트도 내린다 — 자동 끔은 구 서버용 백스톱.
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    rerender(<LimitChaserForm {...props({ server: B({ buyEnabled: false }) })} />);
    tick();
    tick();
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  /*
    WR-06 가드 ⑤ — 에코에 다른 클라가 둔 수량 · 고정 필드가 있으면 자동 끔 0 (buyEnabled 외 전 필드 동일일 때만).
    사람 손이 아닌 자동 제출이 다른 곳(WinForms · 다른 단말)에서 둔 값을 조용히 덮지 않는다 — 가드 ① 과 같은 결로
    매수주문 스위치는 켜진 채 남고, 다시 예약하지 않는다.
  */
  it('WR-06 가드 ⑤ — 에코의 수량이 웹 산출과 다르면(다른 클라가 둔 7주 ≠ 3주) 자동 끔 0 · 매수주문 ON 그대로 · 재수신에도 0', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    rerender(<LimitChaserForm {...props({ server: B({ buyOrderQty: 7 }) })} />);
    tick();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    // 같은 B 재수신 — 하강 전이가 아니고 접은 판정을 다시 예약하지도 않는다.
    rerender(<LimitChaserForm {...props({ server: B({ buyOrderQty: 7 }) })} />);
    tick();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(sentConfigs()).toHaveLength(0);
  });

  it('WR-06 가드 ⑤ — 에코의 클라 고정 필드가 다르면(sweepMinCount 5 ≠ 고정 0) 자동 끔 0', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
    rerender(<LimitChaserForm {...props({ server: B({ sweepMinCount: 5 }) })} />);
    tick();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
  });

  /*
    GC-IN-01 — 직전 · 이번 에코 중 하나라도 구서버(`buy3Schema 0`)면 하강 전이가 아니다. 구서버에 마스터 OFF 는 실제
    매수 감시 해제이고, 「서버가 매수 그룹 해제」 로그도 거짓이다. 보장은 relay 세션 `ready` 소실(파일 밖)이 아니라 이
    판정이 한다.
  */
  describe('GC-IN-01 — buy3 → 구서버 전환 에코는 하강 전이가 아니다', () => {
    /** 구서버 전환 에코 — 신필드 부재(그룹 0) · 마스터 ON · 매도 ON · 수량 웹 산출과 같음. */
    const legacyB = (over: Partial<RelayLimitChaser> = {}) => B({ buy3Schema: 0, ...over });

    it('isServerFoldEdge — buy3(선매수 ON) → 구서버(세 그룹 OFF · 마스터 ON) false · 구서버 → buy3(세 그룹 OFF) false · buy3 하강 전이 true', () => {
      expect(isServerFoldEdge(A(), legacyB())).toBe(false);
      expect(isServerFoldEdge(echo({ buy3Schema: 0, preBuyEnabled: true, sellEnabled: true }), B())).toBe(false);
      expect(isServerFoldEdge(A(), B())).toBe(true);
    });

    it('폼 — buy3 에코(선매수 ON · 마스터 ON · 매도 ON) → 구서버 전환 에코 → 다음 틱 · 유예 뒤에도 전송 0 · 매수주문 ON 그대로', () => {
      const onSent = vi.fn();
      const { rerender } = render(<LimitChaserForm {...props({ server: A(), onSent })} />);
      rerender(<LimitChaserForm {...props({ server: legacyB(), onSent })} />);
      tick();
      act(() => {
        vi.advanceTimersByTime(LC_FOLD_HIDDEN_DEFER_MS * 2);
      });
      expect(sentConfigs()).toHaveLength(0);
      expect(onSent).not.toHaveBeenCalled();
      expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    });
  });

  /*
    WR-06 가드 ⑥ — 화면에 보이지 않는 인스턴스(백그라운드 탭 · 앱)는 자동 끔을 `LC_FOLD_HIDDEN_DEFER_MS` 유예한 뒤
    최신 에코로 재확인한다(가드 ②). 그사이 보이는 인스턴스가 보낸 마스터 OFF 에코가 왔으면 보내지 않는다 — 같은
    사용자의 탭 · 앱 N개에서 통상 1건. 보이는 인스턴스(jsdom 기본 'visible')는 종전대로 다음 틱이다(위 첫 케이스).
  */
  describe('숨은 인스턴스 — 비가시 유예 뒤 재확인 (WR-06 가드 ⑥)', () => {
    const advance = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });

    beforeEach(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    });
    afterEach(() => {
      // 인스턴스에 덮은 게터만 지운다 — jsdom 의 원래 값(Document.prototype · 'visible')이 돌아온다.
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    });

    it('숨은 인스턴스 — 다음 틱 전송 0 → LC_FOLD_HIDDEN_DEFER_MS 뒤 마스터 OFF 1건 · 사유 serverFold', () => {
      expect(document.visibilityState).toBe('hidden');
      const onSent = vi.fn();
      const { rerender } = render(<LimitChaserForm {...props({ server: A(), onSent })} />);
      rerender(<LimitChaserForm {...props({ server: B(), onSent })} />);
      tick();
      expect(sentConfigs()).toHaveLength(0);
      advance(LC_FOLD_HIDDEN_DEFER_MS);
      expect(sentConfigs()).toHaveLength(1);
      expect(lastConfig()).toMatchObject({ buyEnabled: false, crud: 'C', sellEnabled: true, preBuyEnabled: false });
      expect(onSent.mock.calls[0]![1]).toEqual({ cause: 'serverFold' });
      advance(LC_FOLD_HIDDEN_DEFER_MS * 2);
      expect(sentConfigs()).toHaveLength(1);
    });

    it('숨은 인스턴스 — 유예 중 다른 인스턴스가 보낸 마스터 OFF 에코가 오면 유예가 끝나도 전송 0 (가드 ② 재확인)', () => {
      const { rerender } = render(<LimitChaserForm {...props({ server: A() })} />);
      rerender(<LimitChaserForm {...props({ server: B() })} />);
      advance(1_000);
      expect(sentConfigs()).toHaveLength(0);
      rerender(<LimitChaserForm {...props({ server: B({ buyEnabled: false }) })} />);
      advance(LC_FOLD_HIDDEN_DEFER_MS * 2);
      expect(sentConfigs()).toHaveLength(0);
      expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
    });

    it('숨은 인스턴스 — 유예 중 in-flight 가 생기면(가드 ③) 풀린 뒤 다시 유예 예약 · 중복 전송 0', () => {
      const onSent = vi.fn();
      const { rerender } = render(<LimitChaserForm {...props({ server: A(), onSent })} />);
      rerender(<LimitChaserForm {...props({ server: B(), onSent })} />);
      advance(500);
      editInline('lc-buy-watch-price', '129000');
      expect(sentConfigs()).toHaveLength(1);
      // 유예가 끝나도 in-flight 라 기다린다.
      advance(LC_FOLD_HIDDEN_DEFER_MS);
      expect(sentConfigs()).toHaveLength(1);
      // in-flight 의 성공 에코 — 세 그룹 OFF · 마스터 ON 그대로.
      rerender(<LimitChaserForm {...props({ server: B({ buyWatchPrice: 129_000 }), onSent })} />);
      rerender(<LimitChaserForm {...props({ server: B({ buyWatchPrice: 129_000 }), serverAnswerSeq: 1, onSent })} />);
      tick();
      // 풀린 렌더에서 다시 유예 예약 — 다음 틱에는 아직 0.
      expect(sentConfigs()).toHaveLength(1);
      advance(LC_FOLD_HIDDEN_DEFER_MS);
      expect(sentConfigs()).toHaveLength(2);
      expect(lastConfig()).toMatchObject({ buyEnabled: false, buyWatchPrice: 129_000 });
      expect(onSent.mock.calls[1]![1]).toEqual({ cause: 'serverFold' });
      advance(LC_FOLD_HIDDEN_DEFER_MS * 2);
      expect(sentConfigs()).toHaveLength(2);
    });
  });
});

describe('⑱ 그룹 켜기 사전 검증 줄 · D-36 · D-11 재제출 (24-06 · 24-22 · UI-SPEC §7 · R7 · R8)', () => {
  const precheckIn = (slot: string) => group(slot).querySelector('[data-slot="lc-group-precheck"]');
  const AMOUNT_FIRST = '주문금액을 먼저 입력해 주세요';
  const QTY_ZERO = '금액이 주문가격보다 작아 주문수량이 0주예요 — 금액을 올려 주세요';
  const MIN_OVER_MAX = '최소 잔량이 최대 잔량보다 커요 — 최대를 0(무제한)으로 하거나 최소를 낮춰 주세요';
  const REBOUND = '반등을 1~100%로 입력해 주세요';
  const SELL_RATIO = '후매수는 매도비율이 있어야 켤 수 있어요 — 매도비율을 1~100%로 입력해 주세요';
  const D36 =
    '추가매수는 상한가 도달 전 또는 매수1잔량이 최소 미만일 때만 켤 수 있습니다 — 매수1호가 == 비교가격, 매수1잔량 200 ≥ 최소 1';

  it('D-03 — 추가매수 금액 0 에서 켜기 → 전송 0 · 스위치 OFF 그대로 · 그 카드 사전 검증 줄 · 스위치는 disabled 가 아니다', () => {
    render(<LimitChaserForm {...props()} />);
    expect(sw('추가매수 켜기')).toBeEnabled();
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'false');
    const line = precheckIn('extra-buy') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line).toHaveAttribute('role', 'alert');
    expect(line.textContent).toBe(AMOUNT_FIRST);
    expect(submitError()).toBeNull();
    // 사전 검증 실패로 카드가 자동으로 펼쳐지지 않는다.
    expect(fold('extra-buy')).toHaveAttribute('aria-expanded', 'false');
  });

  it('D-03 — 그 상태에서도 다른 행(추가매수 최소 잔량) 확정은 전송된다', () => {
    render(<LimitChaserForm {...props()} />);
    click(sw('추가매수 켜기'));
    click(fold('extra-buy'));
    editInline('lc-extra-buy-min-qty', '5000');
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().extraBuyMinQty).toBe(5_000);
  });

  it('수량 0 — 추가매수 금액 1(만원) · 주문가격 130,000 → 「금액이 주문가격보다 작아 …」', () => {
    render(<LimitChaserForm {...props({ server: echo({ extraBuyOrderAmount: 1 }) })} />);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(precheckIn('extra-buy')?.textContent).toBe(QTY_ZERO);
  });

  it('D-10 — 추가매수 최소 > 최대(≠0) → 최소/최대 문구 · 최대 0(무제한)이면 통과해 전송', () => {
    const { unmount } = render(
      <LimitChaserForm {...props({ server: echo({ extraBuyOrderAmount: 50, extraBuyMinQty: 50_000, extraBuyMaxQty: 10_000 }) })} />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(precheckIn('extra-buy')?.textContent).toBe(MIN_OVER_MAX);
    unmount();
    render(<LimitChaserForm {...props({ server: echo({ extraBuyOrderAmount: 50, extraBuyMinQty: 50_000, extraBuyMaxQty: 0 }) })} />);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().extraBuyEnabled).toBe(true);
  });

  it('후매수 — 반등 0(레거시) → 반등 문구 · 매도비율 0(레거시) → 매도비율 문구 · 금액이 먼저 실패하면 그 문구 하나만', () => {
    const a = render(<LimitChaserForm {...props({ server: echo({ postBuyOrderAmount: 50, postBuyReboundPct: 0 }) })} />);
    click(sw('후매수 켜기'));
    expect(precheckIn('post-buy')?.textContent).toBe(REBOUND);
    a.unmount();
    const b = render(
      <LimitChaserForm {...props({ server: echo({ postBuyOrderAmount: 50, postBuyReboundPct: 30, sellOrderRatio: 0 }) })} />,
    );
    click(sw('후매수 켜기'));
    expect(precheckIn('post-buy')?.textContent).toBe(SELL_RATIO);
    b.unmount();
    render(<LimitChaserForm {...props({ server: echo({ postBuyOrderAmount: 0, postBuyReboundPct: 0, sellOrderRatio: 0 }) })} />);
    click(sw('후매수 켜기'));
    expect(document.querySelectorAll('[data-slot="lc-group-precheck"]')).toHaveLength(1);
    expect(precheckIn('post-buy')?.textContent).toBe(AMOUNT_FIRST);
    expect(sentConfigs()).toHaveLength(0);
  });

  it('WR-02 — 구서버 에코(buy3Schema 0 · 금액 0) 선매수 켜기는 `disabled` → 전송 0 · 사전 검증 줄 없음 · 사유는 매수 열 패널의 구서버 읽기 전용 문장(24-13 — 누르기 전에 안다)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buy3Schema: 0, buyOrderAmount: 0, buyOrderQty: 500 }) })} />);
    expect(sw('선매수 켜기')).toBeDisabled();
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(precheckIn('pre-buy')).toBeNull();
    expect(submitError()).toBeNull();
    expect(pane('buy').querySelector('[data-slot="lc-arm-blocked-text"]')).toHaveTextContent(
      '구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요',
    );
  });

  it('IN-04 — buy3 선매수 금액 0 → 선매수 카드 사전 검증 줄 주문금액 · 전송 0 · 스위치 OFF · 폼 맨 위 한 줄 없음(수량 0 문구 아님)', () => {
    render(<LimitChaserForm {...props({ server: echo({ buy3Schema: 1, buyOrderAmount: 0, buyOrderQty: 0 }) })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(precheckIn('pre-buy')?.textContent).toBe(AMOUNT_FIRST);
    expect(precheckIn('pre-buy')?.textContent).not.toBe(QTY_ZERO);
    expect(submitError()).toBeNull();
  });

  it('IN-03 — 한방가격 0 → 선매수 카드 줄(ARM_BLOCKED_TEXT.sweepPrice 원문) · 전송 0 · 폼 맨 위 한 줄 없음 · 한방가격 에코 뒤 줄이 사라진다', () => {
    const SWEEP_PRICE = '시세를 받지 못해 한방가격이 0 이에요. 한방가격을 입력하면 켤 수 있어요.';
    const { rerender } = render(
      <LimitChaserForm {...props({ server: echo({ buyOrderAmount: 50, sweepEnabled: true, sweepWatchPrice: 0 }) })} />,
    );
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(precheckIn('pre-buy')?.textContent).toBe(SWEEP_PRICE);
    expect(submitError()).toBeNull();
    rerender(
      <LimitChaserForm {...props({ server: echo({ buyOrderAmount: 50, sweepEnabled: true, sweepWatchPrice: 130_000 }) })} />,
    );
    expect(precheckIn('pre-buy')).toBeNull();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('사라지는 때 ① — 원인 값(추가매수 금액)이 고쳐진 에코 뒤 같은 검증이 통과하면 사라진다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    click(sw('추가매수 켜기'));
    expect(precheckIn('extra-buy')).not.toBeNull();
    click(fold('extra-buy'));
    editInline('lc-extra-buy-amount', '50');
    expect(sentConfigs()).toHaveLength(1);
    // 에코 전에는 그대로다.
    expect(precheckIn('extra-buy')).not.toBeNull();
    rerender(<LimitChaserForm {...props({ server: echo({ extraBuyOrderAmount: 50 }) })} />);
    expect(precheckIn('extra-buy')).toBeNull();
    // 사전 검증 정리는 제출을 만들지 않는다.
    expect(sentConfigs()).toHaveLength(1);
  });

  it('사라지는 때 ② — 그 그룹이 켜진 에코(다른 단말)가 오면 사라진다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    click(sw('추가매수 켜기'));
    expect(precheckIn('extra-buy')).not.toBeNull();
    rerender(<LimitChaserForm {...props({ server: echo({ extraBuyEnabled: true }) })} />);
    expect(precheckIn('extra-buy')).toBeNull();
    expect(sentConfigs()).toHaveLength(0);
  });

  it('사라지는 때 ③ — 다른 사유로 다시 누르면 그 문구로 교체되고 줄은 늘 하나다', () => {
    const { rerender } = render(<LimitChaserForm {...props()} />);
    click(sw('추가매수 켜기'));
    expect(precheckIn('extra-buy')?.textContent).toBe(AMOUNT_FIRST);
    rerender(
      <LimitChaserForm {...props({ server: echo({ extraBuyOrderAmount: 50, extraBuyMinQty: 50_000, extraBuyMaxQty: 10_000 }) })} />,
    );
    click(sw('추가매수 켜기'));
    expect(precheckIn('extra-buy')?.textContent).toBe(MIN_OVER_MAX);
    expect(document.querySelectorAll('[data-slot="lc-group-precheck"]')).toHaveLength(1);
  });

  it('끄는 방향은 어떤 검증도 없다(T-16-44) — 금액 0 인 켜진 추가매수도 끈다', () => {
    render(<LimitChaserForm {...props({ server: echo({ extraBuyEnabled: true, sellEnabled: true }) })} />);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().extraBuyEnabled).toBe(false);
    expect(precheckIn('extra-buy')).toBeNull();
  });

  it('E4 long-text — 최장 문구는 줄바꿈 허용 · 말줄임 없음', () => {
    render(
      <LimitChaserForm {...props({ server: echo({ postBuyOrderAmount: 50, postBuyReboundPct: 30, sellOrderRatio: 0 }) })} />,
    );
    click(sw('후매수 켜기'));
    const line = precheckIn('post-buy') as HTMLElement;
    expect(line.textContent).toBe(SELL_RATIO);
    const cls = line.getAttribute('class') ?? '';
    expect(cls).not.toMatch(/truncate|line-clamp|whitespace-nowrap|text-ellipsis/);
    expect(cls).toContain('text-[12.5px]');
  });

  it('D-36 — 매수1호가 == 비교가격(둘 다 > 0) ∧ 매수1잔량 200 ≥ 최소(0 → 1)이면 제출 없이 스위치 그대로 · 사전 검증 줄 없음 · 로그 원문 한 줄(error)', () => {
    const onClientLog = vi.fn();
    render(
      <LimitChaserForm
        {...props({ server: echo({ extraBuyOrderAmount: 50 }), bestBid: 130_000, bestBidQty: 200, onClientLog })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(precheckIn('extra-buy')).toBeNull();
    expect(submitError()).toBeNull();
    expect(onClientLog).toHaveBeenCalledTimes(1);
    expect(onClientLog).toHaveBeenCalledWith(D36, 'error');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('D-36 얇은 벽 — 매수1호가 == 비교가격이라도 매수1잔량 200 < 최소 500 이면 켠다(전송 1 · 로그 0)', () => {
    const onClientLog = vi.fn();
    render(
      <LimitChaserForm
        {...props({
          server: echo({ extraBuyOrderAmount: 50, extraBuyMinQty: 500 }),
          bestBid: 130_000,
          bestBidQty: 200,
          onClientLog,
        })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: true, extraBuyMinQty: 500 });
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('D-36 잔량 모름 — 매수1잔량 0 은 하한(1) 미만이라 허용(전송 1 · 로그 0 — 서버 「모름」 규칙이 백스톱)', () => {
    const onClientLog = vi.fn();
    render(
      <LimitChaserForm
        {...props({ server: echo({ extraBuyOrderAmount: 50 }), bestBid: 130_000, bestBidQty: 0, onClientLog })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('D-36 — 매수1호가 0(호가 미수신)이면 허용 · 상한가로 치환하지 않는다 · 호가가 다르면 허용', () => {
    const onClientLog = vi.fn();
    const a = render(
      <LimitChaserForm
        {...props({ server: echo({ extraBuyOrderAmount: 50 }), bestBid: 0, bestBidQty: 200, upperLimit: 130_000, onClientLog })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    a.unmount();
    render(
      <LimitChaserForm
        {...props({ server: echo({ extraBuyOrderAmount: 50 }), bestBid: 129_500, bestBidQty: 200, onClientLog })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(2);
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('D-36 은 추가매수만 — 선매수 · 후매수는 매수1호가 == 비교가격 ∧ 두꺼운 벽이어도 켠다', () => {
    const onClientLog = vi.fn();
    render(
      <LimitChaserForm
        {...props({
          server: echo({ postBuyOrderAmount: 50, postBuyReboundPct: 30 }),
          bestBid: 130_000,
          bestBidQty: 200,
          onClientLog,
        })}
      />,
    );
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('D-11 — 후매수 ON 에서 다른 행(반등) 확정 → cfg postBuyReentry = 에코 설정값 3(잔여 1 아님) · postBuyReentryLeft 키 없음', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({
            postBuyEnabled: true,
            postBuyOrderAmount: 50,
            postBuyReboundPct: 30,
            postBuyReentry: 3,
            postBuyReentryLeft: 1,
            postBuyPhase: 2,
          }),
        })}
      />,
    );
    click(fold('post-buy'));
    editInline('lc-post-buy-rebound', '40');
    expect(sentConfigs()).toHaveLength(1);
    const cfg = lastConfig();
    expect(cfg.postBuyReboundPct).toBe(40);
    expect(cfg.postBuyReentry).toBe(3);
    expect(cfg).not.toHaveProperty('postBuyReentryLeft');
    expect(cfg).not.toHaveProperty('postBuyPhase');
  });
});

describe('⑲ 선매수 자동 체크 D-06 · D-07 · D-08 — 사람의 선매수 ON 에만 매도 · 취소 6체크가 같은 제출에 실린다 (24-07)', () => {
  /** 마스터 OFF · 매도/취소 전부 OFF · 매도 가격 0(상한가로 채울 자리) · 매도 매수잔량 10 · 체결 30,000 · 취소 매수잔량 10. */
  const idle = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyEnabled: false, sellOrderPrice: 0, sellWatchPrice: 0, sellWatchQty: 10, ...over });
  const SIX = {
    sellEnabled: true,
    sellQtyTrackEnabled: true,
    sellTradeQtyEnabled: true,
    cancelQtyEnabled: true,
    cancelTradeEnabled: true,
    cancelQtyTrackEnabled: true,
  } as const;
  const FULL_LINE =
    '선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 매도 주문가격·비교가격 = 상한가 150,800원';

  it('마스터 OFF 에서 선매수 클릭 → lc.set 1회 · cfg 에 선매수 · 마스터 · 6체크 · 상한가로 채운 매도 가격 · 매도 스위치 낙관 ON · 확인창 없음', () => {
    const onClientLog = vi.fn();
    render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({
      preBuyEnabled: true,
      buyEnabled: true,
      ...SIX,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
      crud: 'C',
    });
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('매수취소 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // 로그는 성공 에코 뒤에만 — 보낸 순간에는 없다.
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('IN-05 — 클릭 직후 매도 스위치는 낙관 ON 이지만 매도 주문가격 행 글자는 클릭 전 그대로 · 성공 에코 뒤 「150,800원」', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800 })} />);
    const before = rowText('lc-sell-order-price');
    click(sw('선매수 켜기'));
    expect(lastConfig().sellOrderPrice).toBe(150_800);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(rowText('lc-sell-order-price')).toBe(before);
    const ok = idle({ buyEnabled: true, preBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, serverAnswerSeq: 1 })} />);
    expect(rowText('lc-sell-order-price')).toBe('150,800원');
  });

  it('성공 에코(선매수 ON) 뒤 onClientLog 한 줄(info) — 6체크를 한 줄로 합친다', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    const ok = idle({ buyEnabled: true, preBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    expect(onClientLog).toHaveBeenCalledWith(FULL_LINE, 'info');
    // 같은 에코 재수신 · 답 신호 증가에도 다시 쓰지 않는다.
    rerender(<LimitChaserForm {...props({ server: { ...ok }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
  });

  it('거부(답만 증가) → 자동 체크 줄 없음 · 매도 · 취소 체크도 서버 값으로 되돌아간다', () => {
    const onClientLog = vi.fn();
    const s = idle();
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    rerender(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수취소 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('생략이 있으면 error 줄 — 취소 매수잔량 0 → 취소 · 취소>잔량추적 켜지 않음(cfg 도 false 그대로)', () => {
    const onClientLog = vi.fn();
    const s = idle({ cancelWatchQty: 0 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(lastConfig()).toMatchObject({ cancelQtyEnabled: false, cancelQtyTrackEnabled: false, cancelTradeEnabled: true });
    // 성공 에코는 요청한 대로 선다(매도 3체크 · 취소>체결 · 상한가로 채운 가격) — 줄은 에코로 확정한다(R3-G1).
    const ok = {
      ...s,
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: true,
      sellQtyTrackEnabled: true,
      sellTradeQtyEnabled: true,
      cancelTradeEnabled: true,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
    };
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    const [text, level] = onClientLog.mock.calls[0]!;
    expect(level).toBe('error');
    expect(text).toContain(' / 켜지 않음: 취소(취소 매수잔량 0) · 취소>잔량추적(취소 매수잔량 0)');
  });

  it('상한가 미수신(0) → 매도 가격을 채우지 않고 매도주문을 켜지 않는다(D-20 — 서버 위임 없음)', () => {
    render(<LimitChaserForm {...props({ server: idle(), upperLimit: 0 })} />);
    click(sw('선매수 켜기'));
    expect(lastConfig()).toMatchObject({ sellEnabled: false, sellOrderPrice: 0, sellWatchPrice: 0, sellQtyTrackEnabled: true });
  });

  it('마스터 ON 이면 buyEnabled 동반 없이도 자동 체크는 실린다', () => {
    render(<LimitChaserForm {...props({ server: idle({ buyEnabled: true }), upperLimit: 150_800 })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: true, buyEnabled: true, ...SIX });
  });

  it('사전 검증 실패(수량 0)면 자동 체크도 없다 — 전송 0 · 매도 스위치 그대로', () => {
    render(<LimitChaserForm {...props({ server: idle({ buyOrderAmount: 1 }), upperLimit: 150_800 })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('D-08 — 에코 · 재접속 · 다른 단말로 선매수가 ON 이 되면 자동 체크는 나가지 않는다(전송 0 · 로그 0)', () => {
    vi.useFakeTimers();
    try {
      const onClientLog = vi.fn();
      const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
      rerender(
        <LimitChaserForm {...props({ server: idle({ buyEnabled: true, preBuyEnabled: true }), upperLimit: 150_800, onClientLog })} />,
      );
      // 재접속(disabled → 다시 ready) 뒤 같은 상태 lc.snap.
      rerender(<LimitChaserForm {...props({ server: idle({ buyEnabled: true, preBuyEnabled: true }), upperLimit: 150_800, onClientLog, disabled: true })} />);
      rerender(<LimitChaserForm {...props({ server: idle({ buyEnabled: true, preBuyEnabled: true }), upperLimit: 150_800, onClientLog })} />);
      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(sendMock).not.toHaveBeenCalled();
      expect(onClientLog).not.toHaveBeenCalled();
      expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('선매수를 끄는 제출에는 6체크 변화가 없다 · 자동으로 켜진 체크는 유지된다(끄는 방향 cfg 의 매도 · 취소 = 서버 값)', () => {
    const on = idle({
      buyEnabled: true,
      preBuyEnabled: true,
      postBuyEnabled: true,
      postBuyOrderAmount: 50,
      postBuyReboundPct: 30,
      ...SIX,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
    });
    render(<LimitChaserForm {...props({ server: on, upperLimit: 150_800 })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: false, ...SIX, sellOrderPrice: 150_800 });
  });

  it('6체크가 이미 전부 켜져 있으면 동반 없음 · 성공 뒤 로그 줄 없음', () => {
    const onClientLog = vi.fn();
    const s = idle({ ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(lastConfig()).toMatchObject({ preBuyEnabled: true, buyEnabled: true });
    rerender(
      <LimitChaserForm {...props({ server: { ...s, buyEnabled: true, preBuyEnabled: true }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />,
    );
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('후매수 켜기에는 자동 체크가 없다(D-35 — 추가매수는 대상 · 후매수는 대상 아님)', () => {
    render(
      <LimitChaserForm {...props({ server: idle({ extraBuyOrderAmount: 50, postBuyOrderAmount: 50, postBuyReboundPct: 30 }), upperLimit: 150_800 })} />,
    );
    click(sw('후매수 켜기'));
    expect(lastConfig()).toMatchObject({ postBuyEnabled: true, sellEnabled: false, cancelQtyEnabled: false });
  });
});

describe('WR-03 — 대기열 선매수 켜기의 동반 필드는 꺼내는 순간 다시 계산된다 (24-VERIFICATION 갭 3)', () => {
  /** ⑲ 과 같은 출발점 — 마스터 OFF · 매도/취소 전부 OFF · 매도 가격 0 · 매도 매수잔량 10. */
  const idle = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyEnabled: false, sellOrderPrice: 0, sellWatchPrice: 0, sellWatchQty: 10, ...over });

  it('매도 주문가격 120,000 확정(in-flight) → 선매수 켜기(대기) → 에코 뒤 나간 cfg 는 120,000 을 지키고 비교가격만 상한가 · 로그도 그 판정', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
    editInline('lc-sell-order-price', '120000');
    expect(sentConfigs()).toHaveLength(1);
    click(sw('선매수 켜기'));
    // 앞 건이 나가 있다 — 선매수 켜기는 대기열에 선다.
    expect(sentConfigs()).toHaveLength(1);

    const priced = idle({ sellOrderPrice: 120_000 });
    rerender(<LimitChaserForm {...props({ server: priced, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: priced, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({
      preBuyEnabled: true,
      buyEnabled: true,
      sellOrderPrice: 120_000,
      sellWatchPrice: 150_800,
      sellEnabled: true,
      sellQtyTrackEnabled: true,
      sellTradeQtyEnabled: true,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
    });
    expect(onClientLog).not.toHaveBeenCalled();

    // 그 성공 에코 뒤 한 줄 — 실제로 나간 cfg 와 같은 판정(비교가격만 채움)이다.
    const ok = {
      ...priced,
      buyEnabled: true,
      preBuyEnabled: true,
      sellWatchPrice: 150_800,
      sellEnabled: true,
      sellQtyTrackEnabled: true,
      sellTradeQtyEnabled: true,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
    };
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    const [text, level] = onClientLog.mock.calls[0]!;
    expect(level).toBe('info');
    expect(text).toContain('매도 비교가격 = 상한가 150,800원');
    expect(text).not.toContain('매도 주문가격·비교가격');
  });

  it('D-07 낡은 플래그 — 매도 매수잔량 0 확정(in-flight) → 선매수 켜기(대기) → 둘째 cfg 에 매도 3체크가 실리지 않는다 · 로그 error', () => {
    const onClientLog = vi.fn();
    const priced = { sellOrderPrice: 150_800, sellWatchPrice: 150_800 };
    const { rerender } = render(
      <LimitChaserForm {...props({ server: idle(priced), upperLimit: 150_800, onClientLog })} />,
    );
    editInline('lc-sell-watch-qty', '0');
    expect(sentConfigs()).toHaveLength(1);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);

    const zero = idle({ ...priced, sellWatchQty: 0 });
    rerender(<LimitChaserForm {...props({ server: zero, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    rerender(<LimitChaserForm {...props({ server: zero, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    // relay 가 프레임 전체를 거부할 `sellEnabled: true ∧ 매수잔량 0` 이 실리지 않는다 — 선매수 켜기는 나간다.
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({
      preBuyEnabled: true,
      buyEnabled: true,
      sellWatchQty: 0,
      sellEnabled: false,
      sellQtyTrackEnabled: false,
      sellTradeQtyEnabled: false,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
    });

    const ok = {
      ...zero,
      buyEnabled: true,
      preBuyEnabled: true,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
    };
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    const [text, level] = onClientLog.mock.calls[0]!;
    expect(level).toBe('error');
    expect(text).toContain('매도주문(매도 매수잔량 0)');
  });
});

describe('GC-WR-02 — 대기 건을 실패로 접어도 폼 토글은 서버 값이다 (24-VERIFICATION-R2 갭 2)', () => {
  /** 선매수 ON · 마스터 ON · 매도 ON(추가 · 후매수 OFF) — 선매수가 마지막 켜진 그룹이다. */
  const armed = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true, ...over });

  it('값 확정(in-flight) → 선매수 끄기(대기 · 마스터 동반 끔) → 서버가 선매수를 접은 에코 → 앞 건 거부 → 선매수 OFF · 말풍선 0 · 마스터 ON · 전송 1', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: armed() })} />);
    editInline('lc-sweep-tick', '5');
    expect(sentConfigs()).toHaveLength(1);
    // 마지막 켜진 그룹을 끈다 — D-02 전반으로 마스터가 동반 끔 · 앞 건이 나가 있어 대기 · 두 스위치 낙관 OFF.
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');

    // 서버가 선매수를 접었다(마스터 ON · 값 미반영) → 답 신호 → in-flight 거부 → 대기 건 접기.
    const folded = armed({ preBuyEnabled: false });
    rerender(<LimitChaserForm {...props({ server: folded })} />);
    rerender(<LimitChaserForm {...props({ server: folded, serverAnswerSeq: 1 })} />);

    // 끄려던 선매수는 이미 서버에 섰다 — ON 으로 되살아나지 않고 「반영하지 못했어요」도 붙지 않는다.
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('반영하지 못했어요')).toBeNull();
    // 동반(마스터 끔)은 서지 않았다 — 화면은 서버 값(ON)이다.
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    // 재전송 없음(T-16-10).
    expect(sentConfigs()).toHaveLength(1);
  });
});

describe('GC-WR-03 — 마지막 그룹 끄기의 마스터 동반은 꺼내는 순간 다시 판정한다 (24-VERIFICATION-R2 갭 3)', () => {
  /*
    D-02 전반 = 사람이 **본** 마지막(누른 순간 화면) ∧ 판정 시점(즉시 · 대기열에서 꺼내는 순간) 서버 값에서도 여전히
    마지막일 때만 마스터 OFF 를 싣는다. 대기 중 다른 단말 · WinForms 가 켠 그룹을 사람 손 없이 해제하지 않는다.
    즉시 경로(대기 없음)의 결과는 ⑰ 케이스들이 잠근다.
  */
  /** 후매수를 켤 수 있는 값(금액 · 반등률)을 둔 buy3 에코 — 마스터 ON · 매도 ON · 기본은 선매수만 ON. */
  const armed = (over: Partial<RelayLimitChaser> = {}) =>
    echo({
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: true,
      postBuyOrderAmount: 50,
      postBuyReboundPct: 30,
      ...over,
    });

  it('값 확정(in-flight) → 선매수 끄기(대기 · 화면상 마지막) → 다른 단말이 후매수를 켠 에코 → 둘째 cfg 에 마스터 OFF 없음 · 후매수 ON 유지', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: armed() })} />);
    editInline('lc-sweep-tick', '5');
    expect(sentConfigs()).toHaveLength(1);
    click(sw('선매수 켜기'));
    // 앞 건이 나가 있다 — 대기열에 선다.
    expect(sentConfigs()).toHaveLength(1);

    // 앞 건의 성공 에코 — 그사이 다른 단말이 후매수를 켰다.
    const other = armed({ sweepMinTickCount: 5, postBuyEnabled: true, postBuyPhase: 1 });
    rerender(<LimitChaserForm {...props({ server: other, serverAnswerSeq: 1 })} />);
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: other, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: false, buyEnabled: true, postBuyEnabled: true, crud: 'C' });
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('값 확정(in-flight) → 선매수 끄기(대기) → 꺼내는 순간에도 마지막이면 둘째 cfg 는 마스터 OFF 를 싣는다', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: armed() })} />);
    editInline('lc-sweep-tick', '5');
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);

    const same = armed({ sweepMinTickCount: 5 });
    rerender(<LimitChaserForm {...props({ server: same, serverAnswerSeq: 1 })} />);
    rerender(<LimitChaserForm {...props({ server: same, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: false, buyEnabled: false, crud: 'C' });
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('누른 순간 마지막이 아니었으면(후매수 ON 이 보였다) 꺼내는 순간 마지막이 돼도 마스터 OFF 를 싣지 않는다', () => {
    const both = armed({ postBuyEnabled: true, postBuyPhase: 1 });
    const { rerender } = render(<LimitChaserForm {...props({ server: both })} />);
    editInline('lc-sweep-tick', '5');
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    // 화면상 후매수가 켜져 있었다 — 마스터 동반 없음(낙관 표시도 ON 그대로).
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');

    // 앞 건의 성공 에코 — 그사이 다른 단말이 후매수를 껐다.
    const postOff = armed({ sweepMinTickCount: 5 });
    rerender(<LimitChaserForm {...props({ server: postOff, serverAnswerSeq: 1 })} />);
    rerender(<LimitChaserForm {...props({ server: postOff, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: false, buyEnabled: true });
  });

  it('대기 중 낙관 표시 — 누른 순간 마지막이라 마스터 낙관 OFF → 꺼내는 순간 동반이 빠지면 마스터는 서버 값(ON)으로 돌아온다', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: armed() })} />);
    editInline('lc-sweep-tick', '5');
    click(sw('선매수 켜기'));
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');

    const other = armed({ sweepMinTickCount: 5, postBuyEnabled: true, postBuyPhase: 1 });
    rerender(<LimitChaserForm {...props({ server: other, serverAnswerSeq: 1 })} />);
    rerender(<LimitChaserForm {...props({ server: other, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('후매수 켜기')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('D-35 — 추가매수 켬도 선매수처럼 매도 · 취소 6체크를 같은 제출에 (2026-09-28 사용자 지시)', () => {
  /**
   * ⑲ 과 같은 출발점 + 추가매수 금액 50(만원) — 마스터 OFF · 매도/취소 전부 OFF · 매도 가격 0 · 매도 매수잔량 10 ·
   * 매수1호가 0(호가 미수신 = D-36 허용).
   */
  const idle = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyEnabled: false, sellOrderPrice: 0, sellWatchPrice: 0, sellWatchQty: 10, extraBuyOrderAmount: 50, ...over });
  const SIX = {
    sellEnabled: true,
    sellQtyTrackEnabled: true,
    sellTradeQtyEnabled: true,
    cancelQtyEnabled: true,
    cancelTradeEnabled: true,
    cancelQtyTrackEnabled: true,
  } as const;
  const SIX_OFF = {
    sellEnabled: false,
    sellQtyTrackEnabled: false,
    sellTradeQtyEnabled: false,
    cancelQtyEnabled: false,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
  } as const;
  const FULL_LINE =
    '추가매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 매도 주문가격·비교가격 = 상한가 150,800원';
  const D36 =
    '추가매수는 상한가 도달 전 또는 매수1잔량이 최소 미만일 때만 켤 수 있습니다 — 매수1호가 == 비교가격, 매수1잔량 200 ≥ 최소 1';
  /** 「켬: a · b · …」 조각의 항목 목록. */
  const turnedOnOf = (text: string): string[] => {
    const m = /켬: ([^/]+)/.exec(text);
    return m === null ? [] : m[1]!.trim().split(' · ');
  };

  it('마스터 OFF 에서 추가매수 클릭 → lc.set 1회 · cfg 에 추가매수 · 마스터 · 6체크 · 상한가로 채운 매도 가격 · 확인창 없음 → 성공 에코 뒤 「추가매수 자동 체크 — 켬: …」(info) 한 줄', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({
      extraBuyEnabled: true,
      buyEnabled: true,
      ...SIX,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
      crud: 'C',
    });
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('매수취소 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // 로그는 성공 에코 뒤에만 — 보낸 순간에는 없다.
    expect(onClientLog).not.toHaveBeenCalled();

    const ok = idle({ buyEnabled: true, extraBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    expect(onClientLog).toHaveBeenCalledWith(FULL_LINE, 'info');
    // 같은 에코 재수신 · 답 신호 증가에도 다시 쓰지 않는다.
    rerender(<LimitChaserForm {...props({ server: { ...ok }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
  });

  it('D-36 이 먼저 — 매수1호가 == 비교가격 ∧ 매수1잔량 ≥ 최소면 전송 0 · 로그는 D-36 원문 한 줄뿐 · 자동 체크 줄 0 · 매도 · 취소 스위치 OFF 그대로', () => {
    const onClientLog = vi.fn();
    render(
      <LimitChaserForm
        {...props({ server: idle(), upperLimit: 150_800, bestBid: 130_000, bestBidQty: 200, onClientLog })}
      />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    expect(onClientLog).toHaveBeenCalledWith(D36, 'error');
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수취소 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('D-36 얇은 벽 — 상한가라도 매수1잔량 < 최소면 추가매수 · 마스터 · 6체크가 한 제출에 실리고 성공 뒤 「추가매수 자동 체크 — 켬: …」 한 줄', () => {
    const onClientLog = vi.fn();
    const s = idle({ extraBuyMinQty: 500 });
    const { rerender } = render(
      <LimitChaserForm {...props({ server: s, upperLimit: 150_800, bestBid: 130_000, bestBidQty: 200, onClientLog })} />,
    );
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({
      extraBuyEnabled: true,
      buyEnabled: true,
      extraBuyMinQty: 500,
      ...SIX,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
    });
    expect(onClientLog).not.toHaveBeenCalled();
    const ok = { ...s, buyEnabled: true, extraBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 };
    rerender(
      <LimitChaserForm
        {...props({ server: ok, upperLimit: 150_800, bestBid: 130_000, bestBidQty: 200, onClientLog, serverAnswerSeq: 1 })}
      />,
    );
    expect(onClientLog).toHaveBeenCalledTimes(1);
    expect(onClientLog).toHaveBeenCalledWith(FULL_LINE, 'info');
  });

  it('사전 검증이 먼저 — 추가매수 금액 0 → 「주문금액을 먼저 입력해 주세요」 · 전송 0 · 자동 체크 0', () => {
    const onClientLog = vi.fn();
    render(<LimitChaserForm {...props({ server: idle({ extraBuyOrderAmount: 0 }), upperLimit: 150_800, onClientLog })} />);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(0);
    expect(group('extra-buy').querySelector('[data-slot="lc-group-precheck"]')?.textContent).toBe(
      '주문금액을 먼저 입력해 주세요',
    );
    expect(onClientLog).not.toHaveBeenCalled();
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수취소 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('이미 켜진 체크는 건드리지 않는다 — 매도주문 · 취소 ON 에코에서 추가매수 켬 → 그 둘은 「켬:」 에 없고 나머지 넷만', () => {
    const onClientLog = vi.fn();
    const s = idle({ sellEnabled: true, cancelQtyEnabled: true, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: true, buyEnabled: true, ...SIX });
    const ok = { ...s, buyEnabled: true, extraBuyEnabled: true, ...SIX };
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    const [text, level] = onClientLog.mock.calls[0]!;
    expect(level).toBe('info');
    expect(text).toBe('추가매수 자동 체크 — 켬: 매도>잔량추적 · 매도>체결 · 취소>체결 · 취소>잔량추적');
    expect(turnedOnOf(text)).not.toContain('매도주문');
    expect(turnedOnOf(text)).not.toContain('취소');
  });

  it('추가매수를 다시 꺼도 자동으로 켜진 매도 · 취소 6체크는 유지된다(끄는 cfg 의 6체크 = true)', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800 })} />);
    click(sw('추가매수 켜기'));
    const ok = idle({ buyEnabled: true, extraBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, serverAnswerSeq: 1 })} />);
    click(sw('추가매수 켜기'));
    // 성공 뒤 답 신호 대기(직렬화 장벽) — 다음 답 신호에 대기 건이 나간다(WR-03 describe 와 같은 흉내).
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: false, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
  });

  it('거부(답만 증가) → 추가매수 · 마스터 · 매도 · 취소 스위치가 전부 서버 값으로 · 자동 체크 로그 0', () => {
    const onClientLog = vi.fn();
    const s = idle();
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('추가매수 켜기'));
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: true, buyEnabled: true, ...SIX });
    rerender(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매수취소 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(onClientLog).not.toHaveBeenCalled();
  });

  it('대기열 — 매도 주문가격 120,000 확정(in-flight) → 추가매수 켜기(대기) → 나간 cfg 는 꺼내는 순간 서버 값으로 계산(120,000 유지 · 비교가격만 상한가) · 로그도 그 판정', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
    editInline('lc-sell-order-price', '120000');
    expect(sentConfigs()).toHaveLength(1);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);

    const priced = idle({ sellOrderPrice: 120_000 });
    rerender(<LimitChaserForm {...props({ server: priced, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    rerender(<LimitChaserForm {...props({ server: priced, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({
      extraBuyEnabled: true,
      buyEnabled: true,
      sellOrderPrice: 120_000,
      sellWatchPrice: 150_800,
      ...SIX,
    });
    expect(onClientLog).not.toHaveBeenCalled();

    const ok = { ...priced, buyEnabled: true, extraBuyEnabled: true, sellWatchPrice: 150_800, ...SIX };
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3 })} />);
    expect(onClientLog).toHaveBeenCalledTimes(1);
    const [text, level] = onClientLog.mock.calls[0]!;
    expect(level).toBe('info');
    expect(text.startsWith('추가매수 자동 체크 — 켬: ')).toBe(true);
    expect(text).toContain('매도 비교가격 = 상한가 150,800원');
    expect(text).not.toContain('매도 주문가격·비교가격');
  });

  it('대상 아님 — 후매수 켬은 6체크를 싣지 않고 로그 0 · 에코로 추가매수가 ON 이 돼도 전송 0 · 로그 0(D-08)', () => {
    const onClientLog = vi.fn();
    const s = idle({ postBuyOrderAmount: 50, postBuyReboundPct: 30 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('후매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ postBuyEnabled: true, buyEnabled: true, ...SIX_OFF, sellOrderPrice: 0 });
    const ok = { ...s, buyEnabled: true, postBuyEnabled: true };
    rerender(<LimitChaserForm {...props({ server: ok, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    // 다른 단말이 추가매수를 켰다 — 에코만 온다.
    rerender(
      <LimitChaserForm {...props({ server: { ...ok, extraBuyEnabled: true }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />,
    );
    expect(sentConfigs()).toHaveLength(1);
    expect(onClientLog).not.toHaveBeenCalled();
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
  });
});

describe('GC-WR-04 — 자동 체크 로그는 그룹별이다 (24-VERIFICATION-R2 갭 4)', () => {
  /** D-35 describe 와 같은 출발점 — 마스터 OFF · 매도/취소 전부 OFF · 매도 가격 0 · 매도 매수잔량 10 · 추가매수 금액 50. */
  const idle = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyEnabled: false, sellOrderPrice: 0, sellWatchPrice: 0, sellWatchQty: 10, extraBuyOrderAmount: 50, ...over });
  const SIX = {
    sellEnabled: true,
    sellQtyTrackEnabled: true,
    sellTradeQtyEnabled: true,
    cancelQtyEnabled: true,
    cancelTradeEnabled: true,
    cancelQtyTrackEnabled: true,
  } as const;
  const CANCEL_THREE = { cancelQtyEnabled: true, cancelTradeEnabled: true, cancelQtyTrackEnabled: true } as const;
  const PRE_FULL_LINE =
    '선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 매도 주문가격·비교가격 = 상한가 150,800원';
  /** onClientLog 호출 중 자동 체크 줄만. */
  const autoLines = (log: ReturnType<typeof vi.fn>): [string, string][] =>
    (log.mock.calls as [string, string][]).filter(([text]) => text.includes('자동 체크'));

  it('선매수 켬(in-flight) → 추가매수 켬(대기) → 선매수 성공 에코 → 「선매수 자동 체크 — 켬: …」 한 줄 · 추가매수(꺼낼 때 계산 — 켤 것 없음)는 줄 0 · 합계 1', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: idle(), upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    click(sw('추가매수 켜기'));
    // 선매수가 나가 있다 — 추가매수 켜기는 대기열에 선다(D-35 트리거 둘째).
    expect(sentConfigs()).toHaveLength(1);

    const pre = idle({ buyEnabled: true, preBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(autoLines(onClientLog)).toEqual([[PRE_FULL_LINE, 'info']]);

    // 다음 답 신호에 추가매수가 나간다 — 꺼낼 때 계산: 6체크 · 매도 가격 · 마스터가 이미 서 있어 동반 없음.
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: true, preBuyEnabled: true, buyEnabled: true, ...SIX });

    const both = { ...pre, extraBuyEnabled: true };
    rerender(<LimitChaserForm {...props({ server: both, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3 })} />);
    // 켤 것도 생략도 없는 추가매수 결과는 줄이 없다 — 선매수 줄 하나만 남는다.
    expect(autoLines(onClientLog)).toEqual([[PRE_FULL_LINE, 'info']]);
  });

  it('선매수 켬(in-flight) → 후매수 켬(대기 · 자동 체크 대상 아님) → 선매수 성공 에코 → 「선매수 자동 체크 — 켬: …」 한 줄', () => {
    const onClientLog = vi.fn();
    const s = idle({ postBuyOrderAmount: 50, postBuyReboundPct: 30 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    click(sw('후매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);

    const pre = { ...s, buyEnabled: true, preBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 };
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(autoLines(onClientLog)).toEqual([[PRE_FULL_LINE, 'info']]);

    // 후매수가 나가고 성공해도 자동 체크 줄은 늘지 않는다(후매수는 대상 아님).
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ postBuyEnabled: true });
    rerender(
      <LimitChaserForm {...props({ server: { ...pre, postBuyEnabled: true }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3 })} />,
    );
    expect(autoLines(onClientLog)).toEqual([[PRE_FULL_LINE, 'info']]);
  });

  it('생략 사유도 그룹별 — 매도 매수잔량 0: 선매수 성공 → 「선매수 자동 체크 — … 켜지 않음: 매도주문(매도 매수잔량 0) …」 · 추가매수 성공 → 「추가매수 자동 체크 — 켜지 않음: …」 두 줄 모두(error)', () => {
    const onClientLog = vi.fn();
    const s = idle({ sellWatchQty: 0, sellOrderPrice: 150_800, sellWatchPrice: 150_800 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: true, sellEnabled: false, ...CANCEL_THREE });
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);

    const pre = { ...s, buyEnabled: true, preBuyEnabled: true, ...CANCEL_THREE };
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    let lines = autoLines(onClientLog);
    expect(lines).toHaveLength(1);
    expect(lines[0]![0].startsWith('선매수 자동 체크 — ')).toBe(true);
    expect(lines[0]![0]).toContain('켜지 않음: 매도주문(매도 매수잔량 0)');
    expect(lines[0]![1]).toBe('error');

    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ extraBuyEnabled: true, sellEnabled: false });
    rerender(
      <LimitChaserForm {...props({ server: { ...pre, extraBuyEnabled: true }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3 })} />,
    );
    lines = autoLines(onClientLog);
    expect(lines).toHaveLength(2);
    expect(lines[1]![0].startsWith('추가매수 자동 체크 — 켜지 않음: ')).toBe(true);
    expect(lines[1]![0]).toContain('매도주문(매도 매수잔량 0)');
    expect(lines[1]![1]).toBe('error');
  });

  it('막힘은 자기 슬롯만 — 선매수 켬(in-flight) → 추가매수 켬이 사전 검증(금액 0)으로 막힘 → 선매수 성공 뒤 선매수 줄 존재', () => {
    const onClientLog = vi.fn();
    const s = idle({ extraBuyOrderAmount: 0 });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    click(sw('추가매수 켜기'));
    expect(group('extra-buy').querySelector('[data-slot="lc-group-precheck"]')?.textContent).toBe(
      '주문금액을 먼저 입력해 주세요',
    );

    const pre = { ...s, buyEnabled: true, preBuyEnabled: true, ...SIX, sellOrderPrice: 150_800, sellWatchPrice: 150_800 };
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(autoLines(onClientLog)).toEqual([[PRE_FULL_LINE, 'info']]);
    expect(sentConfigs()).toHaveLength(1);
  });

  it('GC-IN-03 — 대기 추가매수 켬을 꺼낼 때 서버가 이미 추가매수 ON(다른 단말)이면 전송 0 no-op 성공 · 「추가매수 자동 체크」 줄 0 (D-08)', () => {
    const onClientLog = vi.fn();
    // 마스터 ON · 추가매수 OFF · 매도 매수잔량 0(매도 세 체크 생략 사유) · 취소 세 체크 이미 ON · 매도 가격 이미 채움
    //   → 꺼낼 때 계산한 동반이 빈 객체라, 서버가 추가매수 ON 이면 no-op 이다.
    const s = idle({ buyEnabled: true, sellWatchQty: 0, sellOrderPrice: 150_800, sellWatchPrice: 150_800, ...CANCEL_THREE });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    editInline('lc-sell-order-price', '140000');
    expect(sentConfigs()).toHaveLength(1);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);

    // 값 확정 에코 + 다른 단말이 켠 추가매수.
    const other = { ...s, sellOrderPrice: 140_000, extraBuyEnabled: true };
    rerender(<LimitChaserForm {...props({ server: other, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    rerender(<LimitChaserForm {...props({ server: other, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    // 꺼낼 때 no-op — 보낼 것이 없다(성공 처리 · 전송 누적 1).
    expect(sentConfigs()).toHaveLength(1);
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'true');
    // 이 폼은 아무것도 보내지 않았다 — 켠 주체는 다른 단말이라 자동 체크 줄이 없다.
    expect(autoLines(onClientLog)).toEqual([]);
  });
});

describe('⑳ 새 전략 기본값(D-04) · 상장주식수 시딩(D-17) — 폼당 1회 · 손댄 칸 제외 · 서버 전략이면 생략 · 제출 없음 (24-07)', () => {
  const SEEDED = {
    'lc-buy-watch-qty': '30,000주',
    'lc-buy-min-trade-qty': '30,000주',
    'lc-extra-buy-min-qty': '30,000주',
    'lc-extra-buy-max-qty': '300,000주',
    'lc-sell-min-trade-qty': '30,000주',
  } as const;
  const expectRows = (want: Record<string, string>) => {
    for (const [id, text] of Object.entries(want)) expect(rowText(id), id).toBe(text);
  };

  it('E1 새 전략 — 금액 각 4,000만원 · 반등 30% · 최소 100,000주 · 최대 3회 · 스위치 전부 OFF', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    expect(rowText('lc-buy-order-amount')).toBe('4,000만원');
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('후매수 켜기')).toHaveAttribute('aria-checked', 'false');
  });

  it('listShares 0 → 폴백 그대로 · 뒤에 1,000만주 도착 → 5칸 시딩 · 전송 0 · 로그 0 · 그 뒤 값이 바뀌어도 다시 시딩하지 않는다', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 0, onClientLog })} />);
    expectRows({
      'lc-buy-watch-qty': '10,000주',
      'lc-buy-min-trade-qty': '30,000주',
      'lc-extra-buy-min-qty': '1주',
      'lc-extra-buy-max-qty': '무제한',
      'lc-sell-min-trade-qty': '30,000주',
    });
    rerender(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 10_000_000, onClientLog })} />);
    expectRows(SEEDED);
    expect(sendMock).not.toHaveBeenCalled();
    expect(onClientLog).not.toHaveBeenCalled();
    rerender(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 20_000_000, onClientLog })} />);
    expectRows(SEEDED);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('처음부터 listShares 가 있으면 마운트에서 시딩한다(liveSeed remount 경로)', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 10_000_000 })} />);
    expectRows(SEEDED);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('사용자가 이 폼에서 손댄 칸은 덮지 않는다 — 매도잔량 8,000 로컬 확정 뒤 도착 → 8,000 그대로 · 나머지 4칸만', () => {
    const { rerender } = render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 0 })} />);
    editInline('lc-buy-watch-qty', '8000');
    expect(rowText('lc-buy-watch-qty')).toBe('8,000주');
    rerender(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 10_000_000 })} />);
    expectRows({ ...SEEDED, 'lc-buy-watch-qty': '8,000주' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('서버에 그 키의 전략이 있으면 시딩하지 않는다(에코가 이긴다)', () => {
    const s = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: s, listShares: 0 })} />);
    rerender(<LimitChaserForm {...props({ server: s, listShares: 10_000_000 })} />);
    expect(rowText('lc-buy-watch-qty')).toBe('10,000주');
    expect(rowText('lc-extra-buy-max-qty')).toBe('무제한');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('새 전략에서 마스터를 켜 등록하면 cfg 에 시딩된 5칸과 D-04 기본값이 실린다', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000, listShares: 10_000_000 })} />);
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({
      buyEnabled: true,
      buyWatchQty: 30_000,
      buyMinTradeQty: 30_000,
      extraBuyMinQty: 30_000,
      extraBuyMaxQty: 300_000,
      sellMinTradeQty: 30_000,
      buyOrderAmount: 4000,
      extraBuyOrderAmount: 4000,
      postBuyOrderAmount: 4000,
      sellQtyTrackRatio: 55,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
      buyOrderQty: buyOrderQtyFromAmount(4000, 30_000),
    });
  });
});

/**
 * 24-REVIEW-R3 R3-WR-02 — 훅의 해소 이펙트는 한 실행 안에서 성공을 둘 낼 수 있다(① in-flight 성공 + ③ 늦은 에코 성공).
 * 일반 성공 신호는 한 칸이라 뒤엣것이 덮는다 — 자동 체크 줄 · 편집기 닫기는 **보낸 프레임의 답 신호**
 * (`sentSuccessSeq` · `lastSentSuccessField`)로 소비한다. 거부 단계는 거부 신호 없는 답(즉시 실패)으로 모델한다.
 */
describe('R3-WR-02 — 성공 신호가 한 실행에 겹쳐도 자동 체크 줄 · 편집기 닫기가 선다 (24-REVIEW-R3)', () => {
  /** GC-WR-04 idle 모양 + 매도 가격을 채웠다(매도주문 켜기가 무장 가드에 막히지 않게). */
  const idle = (over: Partial<RelayLimitChaser> = {}) =>
    echo({
      buyEnabled: false,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
      sellWatchQty: 10,
      extraBuyOrderAmount: 50,
      ...over,
    });
  const SIX = {
    sellEnabled: true,
    sellQtyTrackEnabled: true,
    sellTradeQtyEnabled: true,
    cancelQtyEnabled: true,
    cancelTradeEnabled: true,
    cancelQtyTrackEnabled: true,
  } as const;
  const autoLines = (log: ReturnType<typeof vi.fn>): [string, string][] =>
    (log.mock.calls as [string, string][]).filter(([text]) => text.includes('자동 체크'));

  it('매도주문 켜기 거부 실패가 남은 채 선매수 켬(매도 동반) → 성공 에코(매도도 섬) → 「선매수 자동 체크 — 켬: 매도주문 …」 한 줄', () => {
    const onClientLog = vi.fn();
    const s = idle();
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().sellEnabled).toBe(true);

    // 거부 — 서버 값 그대로 · 답 신호만 오른다.
    rerender(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1 })} />);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');

    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig()).toMatchObject({ preBuyEnabled: true, buyEnabled: true, sellEnabled: true });

    const pre = idle({ buyEnabled: true, preBuyEnabled: true, ...SIX });
    rerender(<LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2 })} />);
    const lines = autoLines(onClientLog);
    expect(lines).toHaveLength(1);
    expect(lines[0]![0].startsWith('선매수 자동 체크 — 켬: ')).toBe(true);
    expect(lines[0]![0]).toContain('매도주문');
    expect(sentConfigs()).toHaveLength(2);
  });

  it('매도주문 거부 실패가 남은 채 값 행 인라인 확정 → 그 값과 매도 ON 을 함께 실은 에코 → 그 편집기가 닫힌다', () => {
    const s = idle({ buyEnabled: true });
    const { rerender } = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800 })} />);
    click(sw('매도주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    rerender(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, serverAnswerSeq: 1 })} />);
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');

    editInline('lc-buy-watch-qty', '9000');
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig().buyWatchQty).toBe(9_000);
    // 반영 중 — 편집기는 성공 에코까지 열려 있다.
    expect(input('lc-buy-watch-qty')).not.toBeNull();

    // 같은 실행에 ① 값 확정 성공(보낸 것) + ③ 매도 실패의 늦은 에코 성공.
    const answered = { ...s, buyWatchQty: 9_000, sellEnabled: true };
    rerender(<LimitChaserForm {...props({ server: answered, upperLimit: 150_800, serverAnswerSeq: 2 })} />);
    expect(input('lc-buy-watch-qty')).toBeNull();
    expect(rowText('lc-buy-watch-qty')).toBe('9,000주');
    expect(sentConfigs()).toHaveLength(2);
  });
});

/**
 * 24-REVIEW-R3 R3-WR-01 — 부분 거부는 ERROR(답 신호 + 거부 신호)가 같은 제출의 에코보다 먼저 온다. 폼은 거부 신호가 오른
 * 답을 에코까지 유예하는 훅 판정을 그대로 쓴다 — 선매수 자동 체크 줄과 대기 추가매수(D-35)가 사라지지 않는다.
 * 전면 거부(에코 없음)는 유예 뒤 종전대로 되돌린다. waitFor 를 쓰지 않으므로 가짜 시계는 실시간과 분리한다.
 */
describe('R3-WR-01 — 부분 거부 ERROR 가 에코보다 먼저 와도 선매수 자동 체크 줄 · 대기 추가매수가 선다 (24-REVIEW-R3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** GC-WR-04 와 같은 출발점 — 마스터 OFF · 매도/취소 전부 OFF · 매도 가격 0 · 매도 매수잔량 10 · 추가매수 금액 50. */
  const idle = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buyEnabled: false, sellOrderPrice: 0, sellWatchPrice: 0, sellWatchQty: 10, extraBuyOrderAmount: 50, ...over });
  const FIVE_WITHOUT_SELL = {
    sellQtyTrackEnabled: true,
    sellTradeQtyEnabled: true,
    cancelQtyEnabled: true,
    cancelTradeEnabled: true,
    cancelQtyTrackEnabled: true,
  } as const;
  /** 부분 거부 — 에코가 매도주문만 눕혔다. 「켬」 은 에코에 선 항목만 · 에코에 무장으로 서지 않은 항목은 무장 안 됨 · error (R3-G1 · R4-WR-01 · R5-WR-02). */
  const PRE_PARTIAL_LINE =
    '선매수 자동 체크 — 켬: 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 켜지 않음: 매도주문(무장 안 됨) / 매도 주문가격·비교가격 = 상한가 150,800원';
  const autoLines = (log: ReturnType<typeof vi.fn>): [string, string][] =>
    (log.mock.calls as [string, string][]).filter(([text]) => text.includes('자동 체크'));
  const failedShown = () => (document.body.textContent ?? '').includes('반영하지 못했어요');

  /** 선매수 켬(in-flight) → 추가매수 켬(대기) → 거부 신호(답 1 · 거부 1). */
  function startAndReject(onClientLog: ReturnType<typeof vi.fn>) {
    const s = idle();
    const view = render(<LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog })} />);
    click(sw('선매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    click(sw('추가매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    view.rerender(
      <LimitChaserForm {...props({ server: s, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1, serverRejectSeq: 1 })} />,
    );
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(failedShown()).toBe(false);
    expect(autoLines(onClientLog)).toEqual([]);
    expect(sentConfigs()).toHaveLength(1);
    return view;
  }

  it('F1 부분 거부 — 거부 신호 먼저 → 같은 제출 에코(매도만 눕힘) → 「선매수 자동 체크 … 켜지 않음: 매도주문(무장 안 됨)」 error 한 줄 → 다음 답 신호에 대기 추가매수 1건', () => {
    const onClientLog = vi.fn();
    const { rerender } = startAndReject(onClientLog);

    const pre = idle({
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: false,
      ...FIVE_WITHOUT_SELL,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
    });
    rerender(
      <LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 1, serverRejectSeq: 1 })} />,
    );
    expect(autoLines(onClientLog)).toEqual([[PRE_PARTIAL_LINE, 'error']]);
    expect(failedShown()).toBe(false);
    expect(sentConfigs()).toHaveLength(1);

    rerender(
      <LimitChaserForm {...props({ server: pre, upperLimit: 150_800, onClientLog, serverAnswerSeq: 2, serverRejectSeq: 1 })} />,
    );
    expect(sentConfigs()).toHaveLength(2);
    expect(lastConfig().extraBuyEnabled).toBe(true);
    // R4-WR-01 — 같은 흐름의 대기 추가매수는 방금 서버가 눕힌 매도주문을 다시 싣지 않는다(훅 ⑬ 눕힌 동반).
    expect(lastConfig().sellEnabled).toBe(false);
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(failedShown()).toBe(false);

    // 추가매수 성공 에코 → 그 줄은 매도주문을 「켜지 않음(무장 안 됨)」 으로 사실대로 적는다(error · 원인은 단정하지 않는다).
    rerender(
      <LimitChaserForm
        {...props({ server: { ...pre, extraBuyEnabled: true }, upperLimit: 150_800, onClientLog, serverAnswerSeq: 3, serverRejectSeq: 1 })}
      />,
    );
    expect(autoLines(onClientLog)).toEqual([
      [PRE_PARTIAL_LINE, 'error'],
      ['추가매수 자동 체크 — 켜지 않음: 매도주문(무장 안 됨)', 'error'],
    ]);
    expect(sentConfigs()).toHaveLength(2);
    expect(failedShown()).toBe(false);
  });

  it('F2 전면 거부 — 에코 없이 유예가 끝나면 선매수 · 추가매수 · 매도(동반) 스위치가 서버 값으로 되돌아가고 자동 체크 줄 0 · 재전송 0', () => {
    const onClientLog = vi.fn();
    startAndReject(onClientLog);

    act(() => {
      vi.advanceTimersByTime(LC_REJECT_ECHO_GRACE_MS);
    });
    expect(sw('선매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('추가매수 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(sw('매도주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(failedShown()).toBe(true);
    expect(autoLines(onClientLog)).toEqual([]);
    expect(sentConfigs()).toHaveLength(1);
  });
});

/*
  quick-260929-vzy — 후매수 ☐자동(D-05 · D-06 · P-2). 판정은 서버다 — 폼은 체크 입력을 보내고 에코 값을 보인다.
  WinForms `HandleArmToggle`: ☐매수주문을 **사람이** 끌 때만 ☐자동을 같은 제출에서 끈다. 마지막 그룹 끄기의 마스터 동반
  끔 · 서버 접힘 뒤 자동 끔은 자동을 건드리지 않는다. 자동 켜기는 후매수 켜기와 같은 사전 검증을 지난다.
*/
describe('후매수 자동 — 마스터 OFF 동반 끔 · 켜기 사전 검증 · 비활성 · 발화 에코 (quick-260929-vzy)', () => {
  const auto = (): HTMLElement => chk('후매수 자동');
  const precheckIn = (slot: string) => group(slot).querySelector('[data-slot="lc-group-precheck"]');

  it('① D-06 — 매수주문 끄기 = lc.set 1건 · buyEnabled false + postBuyAuto false · 거부면 두 컨트롤이 함께 서버 값으로', () => {
    const on = echo({ buyEnabled: true, sellEnabled: true, postBuyAuto: true });
    const { rerender } = render(<LimitChaserForm {...props({ server: on })} />);
    expect(auto()).toHaveAttribute('aria-checked', 'true');
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ buyEnabled: false, postBuyAuto: false });
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'false');
    expect(auto()).toHaveAttribute('aria-checked', 'false');
    // 거부(답만 증가) — 둘 다 서버 값(켜짐)으로 돌아온다.
    rerender(<LimitChaserForm {...props({ server: on, serverAnswerSeq: 1 })} />);
    expect(sw('매수주문 켜기')).toHaveAttribute('aria-checked', 'true');
    expect(auto()).toHaveAttribute('aria-checked', 'true');
    expect(sentConfigs()).toHaveLength(1);
  });

  it('② 마지막 그룹(후매수) 끄기의 D-02 전반 제출은 자동을 에코 값 그대로 싣는다', () => {
    render(
      <LimitChaserForm
        {...props({
          server: echo({ postBuyEnabled: true, sellEnabled: true, postBuyOrderAmount: 50, postBuyReboundPct: 30, postBuyAuto: true }),
        })}
      />,
    );
    click(sw('후매수 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ postBuyEnabled: false, buyEnabled: false, postBuyAuto: true });
  });

  it('⑤ 서버 발화 에코(자동 true→false · 후매수 · 마스터 켜짐)는 아무것도 보내지 않고 체크만 푼다', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      const base = { sellEnabled: true, buyOrderQty: 3, postBuyOrderAmount: 50, postBuyReboundPct: 30 };
      const { rerender } = render(
        <LimitChaserForm {...props({ server: echo({ ...base, buyEnabled: false, postBuyAuto: true }) })} />,
      );
      expect(auto()).toHaveAttribute('aria-checked', 'true');
      rerender(
        <LimitChaserForm
          {...props({ server: echo({ ...base, buyEnabled: true, postBuyEnabled: true, postBuyAuto: false }) })}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(LC_FOLD_HIDDEN_DEFER_MS * 2);
      });
      expect(sentConfigs()).toHaveLength(0);
      expect(auto()).toHaveAttribute('aria-checked', 'false');
      expect(sw('후매수 켜기')).toHaveAttribute('aria-checked', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('② 서버 접힘 뒤 자동 끔(serverFold) 제출도 자동을 에코 값 그대로 싣는다', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      const { rerender } = render(
        <LimitChaserForm
          {...props({ server: echo({ preBuyEnabled: true, sellEnabled: true, buyOrderQty: 3, postBuyAuto: true }) })}
        />,
      );
      rerender(<LimitChaserForm {...props({ server: echo({ sellEnabled: true, buyOrderQty: 3, postBuyAuto: true }) })} />);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(sentConfigs()).toHaveLength(1);
      expect(lastConfig()).toMatchObject({ buyEnabled: false, postBuyAuto: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('③ P-2 — 금액 0 · 반등 0 · 매도비율 0 이면 전송 0 · 후매수 카드 사전 검증 줄 · 체크는 움직이지 않는다', () => {
    const cases: [Partial<RelayLimitChaser>, string][] = [
      [{ postBuyOrderAmount: 0, postBuyReboundPct: 30 }, LC_COMMIT_TEXT.amountRequired],
      [{ postBuyOrderAmount: 50, postBuyReboundPct: 0 }, LC_COMMIT_TEXT.reboundRange],
      [{ postBuyOrderAmount: 50, postBuyReboundPct: 30, sellOrderRatio: 0 }, LC_COMMIT_TEXT.sellRatioRequired],
    ];
    for (const [over, text] of cases) {
      const { unmount } = render(<LimitChaserForm {...props({ server: echo(over) })} />);
      click(auto());
      expect(sentConfigs(), text).toHaveLength(0);
      expect(auto()).toHaveAttribute('aria-checked', 'false');
      expect(precheckIn('post-buy')?.textContent).toBe(text);
      unmount();
    }
  });

  it('③ P-2 — 검증을 지나면 lc.set 1건에 postBuyAuto true · 마스터 · 후매수는 그대로(자동은 마스터를 켜지 않는다)', () => {
    render(
      <LimitChaserForm
        {...props({ server: echo({ buyEnabled: false, sellEnabled: true, postBuyOrderAmount: 50, postBuyReboundPct: 30 }) })}
      />,
    );
    click(auto());
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ postBuyAuto: true, buyEnabled: false, postBuyEnabled: false, crud: 'C' });
    expect(precheckIn('post-buy')).toBeNull();
  });

  it('④ 구서버 에코 · 시세 미수신(주문가격 0)이면 꺼진 자동은 disabled · 켜진 자동은 세션이 준비된 한 끌 수 있다', () => {
    const a = render(<LimitChaserForm {...props({ server: echo({ buy3Schema: 0 }) })} />);
    expect(auto()).toBeDisabled();
    a.unmount();
    const b = render(<LimitChaserForm {...props({ server: echo({ buyOrderPrice: 0 }) })} />);
    expect(auto()).toBeDisabled();
    b.unmount();
    const c = render(<LimitChaserForm {...props({ server: echo({ buy3Schema: 0, postBuyAuto: true }) })} />);
    expect(auto()).toBeEnabled();
    c.unmount();
    render(<LimitChaserForm {...props({ server: echo({ postBuyAuto: true }), disabled: true })} />);
    expect(auto()).toBeDisabled();
  });
});

describe('추가매수 「버스트 해제」 체크 — 양방향 설정값 · 게이트 아님 (quick-261003-rc4 B10)', () => {
  const burst = () => chk('추가매수 버스트 해제');

  it('추가매수 카드 마지막 행 · id lc-extra-buy-burst-release · 기본 OFF', () => {
    render(<LimitChaserForm {...props()} />);
    const btn = document.getElementById('lc-extra-buy-burst-release') as HTMLElement;
    expect(btn).toBe(burst());
    expect(btn.getAttribute('role')).toBe('checkbox');
    expect(btn).toHaveAttribute('aria-checked', 'false');
    // 추가매수 그룹 행 영역의 마지막 행이다(최소 · 최대 잔량 행 밑).
    const rowsEl = group('extra-buy');
    const ids = [...rowsEl.querySelectorAll('[id^="lc-extra-buy"]')].map((el) => el.id);
    expect(ids.at(-1)).toBe('lc-extra-buy-burst-release');
    expect(ids.indexOf('lc-extra-buy-max-qty')).toBeLessThan(ids.indexOf('lc-extra-buy-burst-release'));
  });

  it('등록된 전략에서 누르면 lc.set 1건 · cfg 49키 · extraBuyBurstRelease true', () => {
    render(<LimitChaserForm {...props()} />);
    click(burst());
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().extraBuyBurstRelease).toBe(true);
    expect(Object.keys(lastConfig())).toHaveLength(49);
    expect(burst()).toHaveAttribute('aria-checked', 'true');
  });

  it('에코가 false 로 오면(구 서버 · schema 미지원) 서버 값으로 되돌고 말풍선 「반영하지 못했어요」', () => {
    const srv = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: srv })} />);
    click(burst());
    expect(burst()).toHaveAttribute('aria-checked', 'true');
    rerender(<LimitChaserForm {...props({ server: echo(), serverAnswerSeq: 1 })} />);
    expect(burst()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('반영하지 못했어요').closest('[role="alert"]')).not.toBeNull();
  });

  it('에코 true 를 따른다(종목 진입 · 다른 단말이 켠 값)', () => {
    render(<LimitChaserForm {...props({ server: echo({ extraBuyBurstRelease: true }) })} />);
    expect(burst()).toHaveAttribute('aria-checked', 'true');
  });

  it('미등록 전략이면 로컬만 · 전송 0', () => {
    render(<LimitChaserForm {...props({ server: null, upperLimit: 30_000 })} />);
    click(burst());
    expect(sentConfigs()).toHaveLength(0);
    expect(burst()).toHaveAttribute('aria-checked', 'true');
  });

  it('추가매수 스위치 OFF 면 라벨이 흐려진다(값 유지) · 원형 체크는 흐리지 않는다', () => {
    render(<LimitChaserForm {...props({ server: echo({ extraBuyEnabled: false, extraBuyBurstRelease: true }) })} />);
    const label = within(burst()).getByText('버스트 해제');
    expect(opacityLayers(label)).toBe(1);
    expect(burst()).toHaveAttribute('aria-checked', 'true');
    const circle = burst().querySelector('[data-slot="lc-check-circle"]') as HTMLElement;
    expect(opacityLayers(circle)).toBe(0);
  });
});

describe('Phase 27 자동매도 카드 — 3택 행 · 누적/기준 · 칩 · 접힘 · 흐림 (D-01 · D-02 · D-03)', () => {
  /** 자동매도가 켜진 에코 — 상태 · 기준은 테스트마다 덮는다. */
  const autoEcho = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ autoSellEnabled: true, autoSellStartCond: 2, autoSellRatioPct: 10, autoSellMethod: 3, ...over });
  const renderAuto = (server: RelayLimitChaser | null, over: Partial<LimitChaserFormProps> = {}) =>
    render(
      <LimitChaserForm
        {...props({ tab: 'sell', hideTabs: true, server, groupStatus: cardGroupStatusOf(server), ...over })}
      />,
    );
  const rerenderAuto = (rerender: (ui: React.ReactElement) => void, server: RelayLimitChaser) =>
    rerender(
      <LimitChaserForm {...props({ tab: 'sell', hideTabs: true, server, groupStatus: cardGroupStatusOf(server) })} />,
    );
  const radios = () => within(screen.getByRole('radiogroup', { name: '자동매도 방법' })).getAllByRole('radio');

  it('데스크톱 — 방법 = radiogroup 「자동매도 방법」 · 양쪽 · 매도1호가 · 매수1호가 순 · 에코 값만 aria-checked', () => {
    renderAuto(autoEcho());
    click(fold('auto-sell'));
    expect(radios().map((r) => r.textContent)).toEqual(['양쪽', '매도1호가', '매수1호가']);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('데스크톱 — 다른 버튼 클릭 = lc.set 1회(autoSellMethod 2) · 낙관 반영 없음 · 에코 뒤 선택 이동', () => {
    const { rerender } = renderAuto(autoEcho());
    click(fold('auto-sell'));
    click(radios()[2]!);
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().autoSellMethod).toBe(2);
    // 에코 전까지 서버 값(양쪽) 그대로(Phase 20 D-06).
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    // 같은 옵션을 다시 눌러도 전송 0.
    click(radios()[0]!);
    expect(sentConfigs()).toHaveLength(1);
    rerenderAuto(rerender, autoEcho({ autoSellMethod: 2 }));
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
  });

  it('읽기 전용 2행 — 누적 0 「—」 · 6000 「6,000주」 빨강 · 기준 상한가/매수가 · 상태 0 「—」 · 버튼 아님', () => {
    const { rerender } = renderAuto(autoEcho({ autoSellState: 0, autoSellBasis: 1, autoSellBasisPrice: 13_000 }));
    click(fold('auto-sell'));
    const sold = () => document.querySelector('[data-slot="lc-auto-sell-sold"]') as HTMLElement;
    const basis = () => document.querySelector('[data-slot="lc-auto-sell-basis"]') as HTMLElement;
    expect(sold().textContent).toBe('누적 매도—없음');
    expect(basis().textContent).toBe('기준—없음');
    rerenderAuto(
      rerender,
      autoEcho({ autoSellState: 3, autoSellSoldQty: 6000, autoSellBasis: 1, autoSellBasisPrice: 13_000 }),
    );
    expect(sold().textContent).toBe('누적 매도6,000주');
    expect(sold().querySelector('.text-\\[var\\(--up\\)\\]')).not.toBeNull();
    expect(basis().textContent).toBe('기준상한가 13,000원');
    rerenderAuto(rerender, autoEcho({ autoSellState: 2, autoSellBasis: 2, autoSellBasisPrice: 12_500 }));
    expect(basis().textContent).toBe('기준매수가 12,500원');
    for (const el of [sold(), basis()]) {
      expect(el.tagName).not.toBe('BUTTON');
      expect(el.querySelector('button')).toBeNull();
      expect(el.textContent).not.toContain('›');
    }
  });

  it('제목줄 — 에코 state 3 → 칩 「매도중」(초록) · state 0 → 칩 없음 · 스위치 「자동매도 켜기」', () => {
    const { rerender } = renderAuto(autoEcho({ autoSellState: 3 }));
    const status = () => group('auto-sell').querySelector('[data-slot="lc-group-status"]');
    expect(status()?.textContent).toBe('매도중');
    expect(status()?.className).toContain('text-[var(--led-armed)]');
    expect(within(group('auto-sell')).getByRole('switch', { name: '자동매도 켜기' })).toBeChecked();
    rerenderAuto(rerender, autoEcho({ autoSellState: 1 }));
    expect(status()?.textContent).toBe('대기');
    expect(status()?.className).toContain('text-[var(--led-latent)]');
    rerenderAuto(rerender, autoEcho({ autoSellState: 0 }));
    expect(status()).toBeNull();
  });

  it('킬 스위치 에코(autoSellEnabled false · state 0) → 스위치 OFF · 칩 없음 — 웹이 따로 접지 않는다', () => {
    renderAuto(echo({ autoSellEnabled: false, autoSellState: 0, autoSellRatioPct: 10, autoSellMethod: 3 }));
    expect(within(group('auto-sell')).getByRole('switch', { name: '자동매도 켜기' })).not.toBeChecked();
    expect(group('auto-sell').querySelector('[data-slot="lc-group-status"]')).toBeNull();
  });

  it('접힘 — 첫 렌더 접힘 · 요약 5조각 · 제목줄 클릭 → 본문 표시 · 요약 숨김', () => {
    renderAuto(autoEcho({ autoSellState: 3, autoSellSoldQty: 6000, autoSellBasis: 1, autoSellBasisPrice: 13_000 }));
    const rows = group('auto-sell').querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
    expect(fold('auto-sell')).toHaveAttribute('aria-expanded', 'false');
    expect(rows.classList.contains('hidden')).toBe(true);
    const summary = group('auto-sell').querySelector('[data-slot="lc-group-summary"]') as HTMLElement;
    expect(summary.textContent).toBe('시작조건2%비율10%방법양쪽누적6,000주기준상한가 13,000원');
    expect(summary.querySelector('[data-hot="true"]')?.textContent).toBe('6,000주');
    click(fold('auto-sell'));
    expect(rows.classList.contains('hidden')).toBe(false);
    expect((summary.parentElement as HTMLElement).classList.contains('hidden')).toBe(true);
  });

  it('흐림 — 매도주문 OFF 여도 자동매도 ON 이면 입력 행이 흐리지 않는다 · 자동매도 OFF 면 입력 행만 흐린다', () => {
    const { rerender } = renderAuto(autoEcho({ sellEnabled: false }));
    click(fold('auto-sell'));
    const choiceRow = () => document.querySelector('[data-lc-field="lc-auto-sell-method"]') as HTMLElement;
    expect(opacityLayers(row('lc-auto-sell-start-cond'))).toBe(0);
    expect(opacityLayers(choiceRow())).toBe(0);
    rerenderAuto(rerender, autoEcho({ autoSellEnabled: false, sellEnabled: true }));
    expect(opacityLayers(row('lc-auto-sell-start-cond'))).toBe(1);
    expect(opacityLayers(row('lc-auto-sell-ratio'))).toBe(1);
    expect(opacityLayers(choiceRow())).toBe(1);
    expect(opacityLayers(document.querySelector('[data-slot="lc-auto-sell-sold"]') as HTMLElement)).toBe(0);
  });

  it('시작조건 0 = 「이탈 후 다음 체결」 · 비율 「10%」', () => {
    renderAuto(autoEcho({ autoSellStartCond: 0 }));
    click(fold('auto-sell'));
    expect(rowText('lc-auto-sell-start-cond')).toBe('이탈 후 다음 체결');
    expect(rowText('lc-auto-sell-ratio')).toBe('10%');
  });

  it('범위 가드 — 옛 에코 비율 0 · 방법 0 · 꺼짐에서 스위치 → 전송 0 · 폼 맨 위 실패 문구 (Pitfall 5)', () => {
    renderAuto(echo({ autoSellEnabled: false, autoSellRatioPct: 0, autoSellMethod: 0 }));
    click(within(group('auto-sell')).getByRole('switch', { name: '자동매도 켜기' }));
    expect(sentConfigs()).toHaveLength(0);
    expect(submitError()?.textContent).toMatch(/^비율 · /);
  });

  it('미등록 폼에서 자동매도 스위치 = 등록 전송(crud C · 비율 10 · 방법 3 기본값)', () => {
    renderAuto(null);
    click(within(group('auto-sell')).getByRole('switch', { name: '자동매도 켜기' }));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({ crud: 'C', autoSellEnabled: true, autoSellRatioPct: 10, autoSellMethod: 3 });
  });

  describe('폰(주 포인터 coarse)', () => {
    beforeEach(() => mockPointer(true));
    afterEach(restoreMatchMedia);

    it('방법 행 「방법 ─ 양쪽」 → 시트 3옵션(같은 순서) · 고르면 lc.set 1회 · 시트 닫힘 · 포커스 행 복귀', async () => {
      renderAuto(autoEcho());
      click(fold('auto-sell'));
      const methodRow = row('lc-auto-sell-method');
      expect(methodRow.tagName).toBe('BUTTON');
      expect(methodRow).toHaveAttribute('aria-haspopup', 'dialog');
      expect(rowText('lc-auto-sell-method')).toBe('양쪽');
      expect(screen.queryByRole('radiogroup', { name: '자동매도 방법' })).toBeNull();
      click(methodRow);
      const sheet = document.querySelector('[data-slot="lc-choice-sheet"]') as HTMLElement;
      expect(sheet).not.toBeNull();
      const opts = within(sheet).getAllByRole('radio');
      expect(opts.map((o) => o.textContent)).toEqual(['양쪽', '매도1호가', '매수1호가']);
      expect(opts[0]).toHaveAttribute('aria-checked', 'true');
      click(opts[1]!);
      expect(sentConfigs()).toHaveLength(1);
      expect(lastConfig().autoSellMethod).toBe(1);
      await waitFor(() => expect(document.querySelector('[data-slot="lc-choice-sheet"]')).toBeNull());
      await waitFor(() => expect(row('lc-auto-sell-method')).toHaveFocus());
      // 낙관 반영 없음 — 행은 에코 전까지 서버 값.
      expect(rowText('lc-auto-sell-method')).toBe('양쪽');
    });
  });
});

/*
  Phase 27 Plan 05 Task 3 — 자동매도 바로시작 · 중지 버튼 행(D-05 · D-07 · D-08 · D-09).
  활성 = autoSellButtonsOf(server) ∧ 41 대기 없음 ∧ (바로시작만) 자동매도 그룹 확정이 깨끗함. 41 대기 중에는 자동매도
  그룹의 스위치 · 값 · 방법 행 확정을 막는다(RESEARCH Pitfall 6 상호 배제 — 다른 그룹 무관).
*/
describe('Phase 27 바로시작 · 중지', () => {
  const autoEcho = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ autoSellEnabled: true, autoSellStartCond: 2, autoSellRatioPct: 10, autoSellMethod: 3, ...over });
  const asProps = (server: RelayLimitChaser | null, over: Partial<LimitChaserFormProps> = {}) =>
    props({
      tab: 'sell',
      hideTabs: true,
      server,
      groupStatus: cardGroupStatusOf(server),
      autoSellPending: null,
      onAutoSellCommand: vi.fn(),
      ...over,
    });
  const startBtn = () => document.querySelector<HTMLButtonElement>('[data-slot="lc-auto-sell-start"]');
  const stopBtn = () => document.querySelector<HTMLButtonElement>('[data-slot="lc-auto-sell-stop"]');
  const radios = () => within(screen.getByRole('radiogroup', { name: '자동매도 방법' })).getAllByRole('radio');

  it('펼친 자동매도 카드 마지막 행에 바로시작 · 중지 · 접힌 카드에는 둘 다 없음 · 설명 줄 없음', () => {
    render(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1 }))} />);
    expect(startBtn()).toBeNull();
    expect(stopBtn()).toBeNull();
    click(fold('auto-sell'));
    const footer = group('auto-sell').querySelector('[data-slot="lc-group-footer"]') as HTMLElement;
    expect(footer).not.toBeNull();
    expect(Array.from(footer.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['바로시작', '중지']);
    expect(footer.textContent).toBe('바로시작중지');
    // 마지막 행 — 행 영역의 마지막 자식이 버튼 행이다.
    const rows = group('auto-sell').querySelector('[data-slot="lc-group-rows"]') as HTMLElement;
    expect(rows.lastElementChild).toBe(footer);
  });

  it('에코 state 1 → 바로시작 활성 · 중지 비활성 / 2 · 3 → 반대 / 0 · 4 → 바로시작 / 에코 없음 → 둘 다 비활성', () => {
    const { rerender } = render(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1 }))} />);
    click(fold('auto-sell'));
    expect([startBtn()!.disabled, stopBtn()!.disabled]).toEqual([false, true]);
    for (const st of [2, 3]) {
      rerender(<LimitChaserForm {...asProps(autoEcho({ autoSellState: st }))} />);
      expect([startBtn()!.disabled, stopBtn()!.disabled]).toEqual([true, false]);
    }
    for (const st of [0, 4]) {
      rerender(<LimitChaserForm {...asProps(autoEcho({ autoSellState: st }))} />);
      expect([startBtn()!.disabled, stopBtn()!.disabled]).toEqual([false, true]);
    }
    rerender(<LimitChaserForm {...asProps(null)} />);
    expect([startBtn()!.disabled, stopBtn()!.disabled]).toEqual([true, true]);
  });

  it('바로시작 클릭 → onAutoSellCommand("start") 1회 · 확인창 없음 / 중지 → "stop"', () => {
    const onAutoSellCommand = vi.fn();
    const { rerender } = render(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1 }), { onAutoSellCommand })} />);
    click(fold('auto-sell'));
    click(startBtn()!);
    expect(onAutoSellCommand).toHaveBeenCalledTimes(1);
    expect(onAutoSellCommand).toHaveBeenLastCalledWith('start');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    rerender(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 3 }), { onAutoSellCommand })} />);
    click(stopBtn()!);
    expect(onAutoSellCommand).toHaveBeenLastCalledWith('stop');
    expect(sentConfigs()).toHaveLength(0);
  });

  it('D-07 — 자동매도 방법 확정 in-flight 동안 바로시작 비활성 · 중지 규칙 그대로', () => {
    const { rerender } = render(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1 }))} />);
    click(fold('auto-sell'));
    click(radios()[2]!);
    expect(sentConfigs()).toHaveLength(1);
    expect(startBtn()!.disabled).toBe(true);
    // 감시(2) 에코가 오기 전 — 중지는 버튼 규칙(state 1 → 비활성)만 본다. state 2 런타임 에코면 중지 활성.
    rerender(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 2 }))} />);
    expect(stopBtn()!.disabled).toBe(false);
  });

  it('D-07 — 자동매도 그룹 필드 실패 표시 중 바로시작 비활성', () => {
    const { rerender } = render(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1 }))} />);
    click(fold('auto-sell'));
    click(radios()[1]!);
    rerender(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1 }), { unacked: true })} />);
    expect(startBtn()!.disabled).toBe(true);
  });

  it('D-07 — 다른 그룹(매도주문) 확정 in-flight 는 바로시작에 영향 없음', () => {
    render(<LimitChaserForm {...asProps(autoEcho({ autoSellState: 1, sellEnabled: true }))} />);
    click(fold('auto-sell'));
    click(within(group('sell')).getByRole('switch'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig().sellEnabled).toBe(false);
    expect(startBtn()!.disabled).toBe(false);
  });

  it('pending start → 두 버튼 비활성 · 제목줄 「바로시작 전송…」 점선 · 자동매도 스위치 · 값 · 방법 행 비활성(다른 그룹 무관)', () => {
    const server = autoEcho({ autoSellState: 1, sellEnabled: true });
    const { rerender } = render(
      <LimitChaserForm
        {...asProps(server, {
          autoSellPending: 'start',
          groupStatus: { ...cardGroupStatusOf(server), autoSell: '바로시작 전송…' },
        })}
      />,
    );
    click(fold('auto-sell'));
    expect([startBtn()!.disabled, stopBtn()!.disabled]).toEqual([true, true]);
    const status = group('auto-sell').querySelector('[data-slot="lc-group-status"]') as HTMLElement;
    expect(status.textContent).toBe('바로시작 전송…');
    expect(status.className).toContain('border-dashed');
    expect(within(group('auto-sell')).getByRole('switch', { name: '자동매도 켜기' })).toBeDisabled();
    expect(row('lc-auto-sell-start-cond')).toBeDisabled();
    expect(row('lc-auto-sell-ratio')).toBeDisabled();
    for (const r of radios()) expect(r).toBeDisabled();
    // 다른 그룹은 막지 않는다.
    expect(within(group('sell')).getByRole('switch')).not.toBeDisabled();

    rerender(
      <LimitChaserForm
        {...asProps(autoEcho({ autoSellState: 3 }), {
          autoSellPending: 'stop',
          groupStatus: { ...cardGroupStatusOf(server), autoSell: '중지 전송…' },
        })}
      />,
    );
    expect(status.textContent).toBe('중지 전송…');
    expect(status.className).toContain('border-dashed');
    expect([startBtn()!.disabled, stopBtn()!.disabled]).toEqual([true, true]);
  });
});

/*
  Phase 27 Plan 07 — 새 전략 폼 84 시딩(D-11). 시딩 규칙 = D-17 동형:
  ① 서버 에코가 있으면 에코가 이긴다 ② 84 가 늦게 오면 열린 미등록 폼을 다시 시딩 ③ 손댄 칸 보존 ④ 전송 · 로그 0.
*/
describe('Phase 27 새 폼 84 시딩', () => {
  const SAVED: RelayUserSettingsMsg = {
    t: 'user.settings',
    present: true,
    preBuyAmount: 5000,
    addBuyAmount: 6000,
    postBuyAmount: 7000,
    postBuyMaxCount: 4,
    postBuyFloorQty: 200_000,
    postBuyReboundPct: 40,
    sellQtyTrackRatio: 60,
    autoSellPeriodSec: 3,
    auctionSellRatioPct: 20,
    autoSellRatioDefaultPct: 15,
    autoSellMethodDefault: 1,
  };
  const newForm = (over: Partial<LimitChaserFormProps> = {}) =>
    props({ server: null, upperLimit: 30_000, listShares: 10_000_000, ...over });

  it('84 가 있으면 첫 렌더부터 9칸이 84 값 · 상한가 5칸 · 상장주식수 5칸 시딩은 종전대로 · 전송 0', () => {
    mockUserSettings = SAVED;
    const onClientLog = vi.fn();
    render(<LimitChaserForm {...newForm({ onClientLog })} />);
    expect(rowText('lc-buy-order-amount')).toBe('5,000만원');
    expect(rowText('lc-extra-buy-amount')).toBe('6,000만원');
    expect(rowText('lc-post-buy-amount')).toBe('7,000만원');
    expect(rowText('lc-buy-order-price')).toBe('30,000원');
    expect(rowText('lc-buy-watch-qty')).toBe('30,000주');
    expect(sendMock).not.toHaveBeenCalled();
    expect(onClientLog).not.toHaveBeenCalled();
    click(sw('매수주문 켜기'));
    expect(sentConfigs()).toHaveLength(1);
    expect(lastConfig()).toMatchObject({
      buyEnabled: true,
      buyOrderAmount: 5000,
      extraBuyOrderAmount: 6000,
      postBuyOrderAmount: 7000,
      postBuyReentry: 4,
      postBuyFloorQty: 200_000,
      postBuyReboundPct: 40,
      sellQtyTrackRatio: 60,
      autoSellRatioPct: 15,
      autoSellMethod: 1,
      buyWatchPrice: 30_000,
      buyWatchQty: 30_000,
      buyOrderQty: buyOrderQtyFromAmount(5000, 30_000),
    });
    expect(Object.keys(lastConfig())).not.toContain('autoSellPeriodSec');
  });

  it('84 미수신으로 열린 폼 → D-04 상수 · 뒤에 84 도착 → 손대지 않은 칸만 84 · 확정한 칸(선매수 금액 4,500 · 방법)은 유지 · 전송 0 · 로그 0', () => {
    const onClientLog = vi.fn();
    const { rerender } = render(<LimitChaserForm {...newForm({ onClientLog })} />);
    expect(rowText('lc-buy-order-amount')).toBe('4,000만원');
    expect(rowText('lc-post-buy-amount')).toBe('4,000만원');
    editInline('lc-buy-order-amount', '4500');
    expect(rowText('lc-buy-order-amount')).toBe('4,500만원');
    // 방법(3택)도 손댄 칸이다 — 미등록 폼이라 로컬만 바뀐다(⑪).
    click(fold('auto-sell'));
    const methodRadios = () => within(screen.getByRole('radiogroup', { name: '자동매도 방법' })).getAllByRole('radio');
    click(methodRadios()[2]!);
    expect(methodRadios()[2]).toHaveAttribute('aria-checked', 'true');
    expect(sendMock).not.toHaveBeenCalled();
    mockUserSettings = SAVED;
    rerender(<LimitChaserForm {...newForm({ onClientLog })} />);
    expect(rowText('lc-buy-order-amount')).toBe('4,500만원');
    expect(rowText('lc-extra-buy-amount')).toBe('6,000만원');
    expect(rowText('lc-post-buy-amount')).toBe('7,000만원');
    expect(rowText('lc-auto-sell-ratio')).toBe('15%');
    expect(methodRadios()[2]).toHaveAttribute('aria-checked', 'true');
    expect(sendMock).not.toHaveBeenCalled();
    expect(onClientLog).not.toHaveBeenCalled();
    // 84 가 다시 와도(브로드캐스트) 손댄 칸은 그대로 · 나머지는 새 값.
    mockUserSettings = { ...SAVED, preBuyAmount: 9000, addBuyAmount: 8000 };
    rerender(<LimitChaserForm {...newForm({ onClientLog })} />);
    expect(rowText('lc-buy-order-amount')).toBe('4,500만원');
    expect(rowText('lc-extra-buy-amount')).toBe('8,000만원');
    expect(sendMock).not.toHaveBeenCalled();
    click(sw('매수주문 켜기'));
    expect(lastConfig()).toMatchObject({
      buyOrderAmount: 4500,
      extraBuyOrderAmount: 8000,
      autoSellRatioPct: 15,
      autoSellMethod: 2,
    });
  });

  it('서버 에코가 있는 전략 폼은 84 로 덮지 않는다(에코가 이긴다) — 마운트 · 도착 둘 다', () => {
    mockUserSettings = SAVED;
    const s = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: s })} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    mockUserSettings = { ...SAVED, preBuyAmount: 9000 };
    rerender(<LimitChaserForm {...props({ server: s })} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('에코가 한 번 왔던 폼은 에코가 사라져도 84 로 다시 시딩하지 않는다(이미 등록된 전략의 값)', () => {
    const s = echo();
    const { rerender } = render(<LimitChaserForm {...props({ server: s })} />);
    mockUserSettings = SAVED;
    rerender(<LimitChaserForm {...props({ server: null })} />);
    expect(rowText('lc-buy-order-amount')).toBe('50만원');
    expect(sendMock).not.toHaveBeenCalled();
  });
});
