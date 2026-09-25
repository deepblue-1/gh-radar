import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

import {
  crudOf,
  defaultLimitChaserForm,
  formFromServer,
  type LimitChaserFormValues,
} from '@/lib/limit-chaser';
import {
  LC_COMMIT_TEXT,
  LC_FLASH_MS,
  useLcFieldCommit,
  type UseLcFieldCommitOptions,
} from '../use-lc-field-commit';

/**
 * `useLcFieldCommit` 단위 — 필드 확정 상태 기계 (20-01 Task 2 · D-04 ~ D-07).
 *
 * 카드가 주는 입력 셋(`server` · `serverAnswerSeq` · `unacked`)을 `rerender` 로 바꿔 가며
 * 성공 · 거부 · 타임아웃 · 끊김 · 무장 불가 · 직렬화(대기) · 늦은 에코 · 토글 되돌림을 단언한다.
 *
 * ★ 성공 = 에코의 그 필드 값 === 보낸 값뿐이다(Pitfall 1). 답 신호만으로는 성공이 아니다.
 * ★ 이 훅은 **아무것도 다시 보내지 않는다**(T-16-10) — 전송 수를 매 단계 센다.
 */

const ISIN = 'KR7086520004';
const ACCOUNT = '37728502101';

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
    buyOrderAmount: 10,
    sellOrderPrice: 130_000,
    sellOrderQty: 0,
    sellWatchPrice: 130_000,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
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
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
    ...over,
  };
}

/** 테스트 전용 조립 — 폼의 `buildCfg` 와 같은 모양(32필드). */
function buildCfg(values: LimitChaserFormValues): RelayLimitChaserInput {
  return {
    ...values,
    isin: ISIN,
    accountNo: ACCOUNT,
    exchange: 'KRX',
    crud: crudOf(values),
    buyOrderQty: 1,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
  };
}

type Opts = UseLcFieldCommitOptions & {
  unacked?: boolean;
  armBlockOf?: (v: LimitChaserFormValues) => string | null;
};

function setup(over: Partial<Opts> = {}) {
  const server = 'server' in over ? (over.server ?? null) : echo();
  const formRef = {
    current: server != null ? formFromServer(server, defaultLimitChaserForm()) : defaultLimitChaserForm(),
  };
  // `setForm` 은 실제로 폼 값을 바꾼다 — 낙관 반영·되돌림을 폼 값으로 관측한다.
  const setForm = vi.fn(
    (u: LimitChaserFormValues | ((p: LimitChaserFormValues) => LimitChaserFormValues)) => {
      formRef.current = typeof u === 'function' ? u(formRef.current) : u;
    },
  );
  const send = vi.fn<(msg: { t: 'lc.set'; cfg: RelayLimitChaserInput }) => boolean>(() => true);
  const onSent = vi.fn();
  let props: Opts = {
    server,
    formRef,
    setForm,
    buildCfg,
    send,
    onSent,
    serverAnswerSeq: 0,
    disabled: false,
    unacked: false,
    ...over,
  };
  const hook = renderHook((p: Opts) => useLcFieldCommit(p), { initialProps: props });
  const update = (next: Partial<Opts>) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  const cfgs = () => send.mock.calls.map(([m]) => m.cfg);
  return { hook, update, send, setForm, onSent, formRef, cfgs, props: () => props };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Task 1 규칙 — 확정 1회 = 전송 1회', () => {
  it('서버 값과 같은 확정은 전송 0 · `noop`', () => {
    const t = setup();
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 3, 'value');
    });
    expect(out).toBe('noop');
    expect(t.send).not.toHaveBeenCalled();
  });

  it('값 확정은 1회 전송 · cfg = 서버 동기값 + 바꾼 필드 1개(로컬의 오래된 값은 싣지 않는다, T-20-03) · 값 낙관 반영 없음', () => {
    const t = setup();
    t.formRef.current = { ...t.formRef.current, sellOrderRatio: 50 };
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.sweepMinTickCount).toBe(5);
    expect(t.cfgs()[0]!.sellOrderRatio).toBe(100);
    expect(t.onSent).toHaveBeenCalledWith(t.cfgs()[0]);
    expect(t.setForm).not.toHaveBeenCalled();
    expect(t.hook.result.current.inflightField).toBe('sweepMinTickCount');
  });

  it('에코의 그 필드 값이 보낸 값과 같으면 성공 — 900ms 강조 뒤 해제', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ server: echo({ sweepMinTickCount: 5 }) });
    const r = t.hook.result.current;
    expect(r.inflightField).toBeNull();
    expect(r.flashField).toBe('sweepMinTickCount');
    expect(r.successSeq).toBe(1);
    expect(r.lastSuccessField).toBe('sweepMinTickCount');
    act(() => {
      vi.advanceTimersByTime(LC_FLASH_MS);
    });
    expect(t.hook.result.current.flashField).toBeNull();
  });

  it('답만 오고 값이 다르면 거부 — 「반영하지 못했어요」 · 재전송 0 (Pitfall 1 · T-16-10)', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.sweepMinTickCount).toEqual({
      reason: 'rejected',
      text: LC_COMMIT_TEXT.failed,
      value: 5,
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('Pitfall 4 — 답 신호가 먼저(실패), 다음 렌더에 서버 값이 일치하면 성공으로 바뀐다(늦은 에코)', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.sweepMinTickCount?.reason).toBe('rejected');
    t.update({ server: echo({ sweepMinTickCount: 5 }) });
    expect(t.hook.result.current.failures.sweepMinTickCount).toBeUndefined();
    expect(t.hook.result.current.flashField).toBe('sweepMinTickCount');
    expect(t.hook.result.current.successSeq).toBe(1);
  });

  it('send 가 false 면 끊김 실패 · 폼 불변 · 전송 통지 없음', () => {
    const t = setup();
    t.send.mockReturnValue(false);
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(out).toBe('disconnected');
    expect(t.hook.result.current.failures.sweepMinTickCount).toEqual({
      reason: 'disconnected',
      text: LC_COMMIT_TEXT.disconnected,
      value: 5,
    });
    expect(t.setForm).not.toHaveBeenCalled();
    expect(t.onSent).not.toHaveBeenCalled();
    expect(t.hook.result.current.inflightField).toBeNull();
  });

  it('비활성(세션 미준비)이면 `blocked` · 전송 0', () => {
    const t = setup({ disabled: true });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
  });

  it('미등록 전략(server 없음)의 값 확정은 로컬 반영만 — 전송 0 · 강조 (A-P1)', () => {
    const t = setup({ server: null });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 7, 'value');
    });
    expect(out).toBe('local');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.formRef.current.sweepMinTickCount).toBe(7);
    expect(t.hook.result.current.flashField).toBe('sweepMinTickCount');
  });

  it('clearFailure 는 그 필드 실패만 지운다', () => {
    const t = setup();
    t.send.mockReturnValue(false);
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    act(() => {
      t.hook.result.current.clearFailure('sweepMinTickCount');
    });
    expect(t.hook.result.current.failures.sweepMinTickCount).toBeUndefined();
    expect(t.hook.result.current.failures.buyWatchQty?.reason).toBe('disconnected');
  });
});

describe('Task 2 — 타임아웃 · 직렬화 · 무장 가드 · 토글', () => {
  it('in-flight 중 카드 `unacked`(3초 무응답)가 서면 타임아웃 실패 · 재전송 0', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ unacked: true });
    expect(t.hook.result.current.failures.sweepMinTickCount).toEqual({
      reason: 'timeout',
      text: LC_COMMIT_TEXT.failed,
      value: 5,
    });
    expect(t.hook.result.current.inflightField).toBeNull();
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('직렬화 — A 전송 중 B 는 `queued` · A 에코 렌더에서는 보내지 않고 다음 answerSeq 증가 렌더에서 B 를 보낸다', () => {
    const t = setup();
    let outB: string | undefined;
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      outB = t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    expect(outB).toBe('queued');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.queuedFields).toEqual(['buyWatchQty']);

    // A 의 에코 — 카드의 답 신호는 한 렌더 늦게 보인다. 이 렌더에서 B 를 보내면 안 된다.
    t.update({ server: echo({ sweepMinTickCount: 5 }) });
    expect(t.hook.result.current.flashField).toBe('sweepMinTickCount');
    expect(t.send).toHaveBeenCalledTimes(1);

    // 답 신호 증가 렌더 — 이제 B 가 나간다. cfg = A 가 반영된 새 서버 값 + B.
    t.update({ serverAnswerSeq: 2 });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.sweepMinTickCount).toBe(5);
    expect(t.cfgs()[1]!.buyWatchQty).toBe(8_000);
    expect(t.hook.result.current.inflightField).toBe('buyWatchQty');
    expect(t.hook.result.current.queuedFields).toEqual([]);

    // 그 뒤 답 신호가 더 오르지 않으면 B 를 거부로 오판하지 않는다.
    act(() => {
      vi.advanceTimersByTime(LC_FLASH_MS * 2);
    });
    t.update({ disabled: false });
    expect(t.hook.result.current.failures.buyWatchQty).toBeUndefined();
    expect(t.hook.result.current.inflightField).toBe('buyWatchQty');
  });

  it('같은 필드를 대기 중에 다시 확정하면 값만 바뀌고 자리는 그대로다', () => {
    const t = setup();
    let out: string | undefined;
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
      t.hook.result.current.commit('sellWatchQty', 20, 'value');
      out = t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
    });
    expect(out).toBe('queued');
    expect(t.hook.result.current.queuedFields).toEqual(['buyWatchQty', 'sellWatchQty']);

    t.update({ server: echo({ sweepMinTickCount: 5 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.buyWatchQty).toBe(9_000);
    expect(t.hook.result.current.queuedFields).toEqual(['sellWatchQty']);
  });

  it('A 가 거부되면 대기 건은 하나도 보내지 않고 각 필드를 거부 실패로 표시한다 (조용한 드롭 0 · 자동 전송 0)', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.failures.sweepMinTickCount?.reason).toBe('rejected');
    expect(t.hook.result.current.failures.buyWatchQty).toEqual({
      reason: 'rejected',
      text: LC_COMMIT_TEXT.failed,
      value: 8_000,
    });
    expect(t.hook.result.current.queuedFields).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    t.update({ serverAnswerSeq: 2 });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('무장 불가 값은 `armBlocked` 로 막는다 — 전송 0 · 문구는 `armBlockOf` 문장 그대로', () => {
    const armBlockOf = vi.fn((v: LimitChaserFormValues) =>
      v.buyEnabled && v.buyOrderAmount < 13 ? '매수주문 · 주문금액이 부족해요' : null,
    );
    const t = setup({ armBlockOf });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyOrderAmount', 5, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.buyOrderAmount).toEqual({
      reason: 'armBlocked',
      text: '매수주문 · 주문금액이 부족해요',
      value: 5,
    });
    // 판정은 서버 동기값 + 바꾼 필드 1개로 한다.
    expect(armBlockOf).toHaveBeenLastCalledWith(
      expect.objectContaining({ buyEnabled: true, buyOrderAmount: 5, sweepMinTickCount: 3 }),
    );
  });

  it('대기 건을 꺼낼 때도 무장 판정을 새 서버 값으로 다시 한다', () => {
    const armBlockOf = (v: LimitChaserFormValues) =>
      v.sellEnabled && v.sellWatchQty === 0 ? '매도주문 · 호가잔량이 0 이에요' : null;
    const t = setup({ armBlockOf });
    act(() => {
      t.hook.result.current.commit('sellEnabled', true, 'toggle');
      t.hook.result.current.commit('sellWatchQty', 0, 'value');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    t.update({ server: echo({ sellEnabled: true }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.failures.sellWatchQty?.reason).toBe('armBlocked');
  });

  it('끄는 방향 게이트는 무장 판정과 무관하게 나간다 (T-16-44)', () => {
    const armBlockOf = () => '매수주문 · 막힘';
    const t = setup({ armBlockOf, server: echo({ sellEnabled: true }) });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sellEnabled', false, 'toggle');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('토글은 전송 뒤 낙관 반영하고, 거부되면 확정 전 값으로 되돌린다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sellEnabled', true, 'toggle');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.formRef.current.sellEnabled).toBe(true);
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.sellEnabled?.reason).toBe('rejected');
    expect(t.formRef.current.sellEnabled).toBe(false);
  });

  it('토글도 타임아웃이면 되돌린다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('cancelTradeEnabled', true, 'toggle');
    });
    expect(t.formRef.current.cancelTradeEnabled).toBe(true);
    t.update({ unacked: true });
    expect(t.formRef.current.cancelTradeEnabled).toBe(false);
  });

  it('토글 send 가 false 면 setForm 호출 0', () => {
    const t = setup();
    t.send.mockReturnValue(false);
    act(() => {
      t.hook.result.current.commit('sellEnabled', true, 'toggle');
    });
    expect(t.setForm).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.sellEnabled?.reason).toBe('disconnected');
  });

  it('대기에 들어간 토글은 즉시 낙관 표시하고, 앞 건 실패로 폐기되면 되돌린다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('cancelTradeEnabled', true, 'toggle');
    });
    expect(t.formRef.current.cancelTradeEnabled).toBe(true);
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.formRef.current.cancelTradeEnabled).toBe(false);
    expect(t.hook.result.current.failures.cancelTradeEnabled?.reason).toBe('rejected');
  });

  it('폐기된 대기 필드에도 늦은 에코가 적용된다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.buyWatchQty?.reason).toBe('rejected');
    t.update({ server: echo({ buyWatchQty: 8_000 }) });
    expect(t.hook.result.current.failures.buyWatchQty).toBeUndefined();
  });

  it('미등록 전략에서 게이트(`buyEnabled`)는 전송되고(첫 스위치 = 등록) · `cancelTradeEnabled` 는 로컬이다', () => {
    const t = setup({ server: null });
    let gate: string | undefined;
    let check: string | undefined;
    act(() => {
      gate = t.hook.result.current.commit('buyEnabled', true, 'toggle');
    });
    act(() => {
      check = t.hook.result.current.commit('cancelTradeEnabled', true, 'toggle');
    });
    expect(gate).toBe('sent');
    expect(check).toBe('local');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.buyEnabled).toBe(true);
  });

  it('`buyOrderAmount` 에코가 0(서버가 모른다)이면 답 도착만으로 성공이다', () => {
    const t = setup({ server: echo({ buyOrderAmount: 0 }) });
    act(() => {
      t.hook.result.current.commit('buyOrderAmount', 20, 'value');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.buyOrderAmount).toBeUndefined();
    expect(t.hook.result.current.flashField).toBe('buyOrderAmount');
    expect(t.hook.result.current.inflightField).toBeNull();
  });
});
