import { readFileSync } from 'node:fs';
import path from 'node:path';

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
  LC_GATE_FIELDS,
  LC_ORPHAN_WAIT_MS,
  lcGroupAmountBlockOf,
  lcLegacyBlockOf,
  useLcFieldCommit,
  type UseLcFieldCommitOptions,
} from '../use-lc-field-commit';
import { lcRowByField } from '../lc-fields';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';

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
    ...LC_BUY3_ECHO_DEFAULTS,
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
    extraBuyOrderQty: 0,
    postBuyOrderQty: 0,
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

  it('WR-04 — 비활성(세션 미준비)이면 전송 0 · 조용히 무시하지 않고 `disconnected` 실패로 남긴다(입력값 보존)', () => {
    const t = setup({ disabled: true });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(out).toBe('disconnected');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.sweepMinTickCount).toEqual({
      reason: 'disconnected',
      text: LC_COMMIT_TEXT.disconnected,
      value: 5,
    });
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

  it('GC-WR-02 — 꺼낼 때 무장 가드로 막힌 대기 토글의 되돌림은 그 순간 서버 값이다(누른 순간 값이 아니다)', () => {
    // 테스트 전용 가드 — 선매수가 켜진 cfg 는 늘 막는다(꺼낼 때 막힘 조건을 만든다).
    const armBlockOf = (v: LimitChaserFormValues) => (v.preBuyEnabled ? '선매수 · 막힘' : null);
    const t = setup({ server: echo({ buyEnabled: false, sellEnabled: true }), armBlockOf });
    let out: string | undefined;
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
      out = t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(out).toBe('queued');
    // 누른 순간 — 마스터 OFF 였다(되돌림 기준이 누른 순간 값이면 OFF 로 돌아간다).
    expect(t.formRef.current.preBuyEnabled).toBe(true);
    expect(t.formRef.current.buyEnabled).toBe(true);
    // 앞 건 성공 에코 — 그사이 다른 단말이 마스터를 켰다 → 답 신호 렌더에서 꺼낼 때 무장 가드로 막힘.
    t.update({ server: echo({ buyEnabled: true, sellEnabled: true, buyWatchQty: 9_000 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.preBuyEnabled).toEqual({
      reason: 'armBlocked',
      text: '선매수 · 막힘',
      value: true,
    });
    // 되돌림 = 그 순간 서버 값 — 선매수 OFF · 마스터 ON(누른 순간 값 OFF 가 아니다).
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(true);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('GC-WR-02 — 미등록(서버 없음) 등록 토글이 거부되면 되돌림은 종전대로 확정 직전 폼 값이다', () => {
    const t = setup({ server: null });
    expect(t.formRef.current.buyEnabled).toBe(false);
    act(() => {
      t.hook.result.current.commit('buyEnabled', true, 'toggle');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    // 낙관 표시 — 폼 값이 이미 ON 이다(서버가 없으니 「지금 폼 값」을 기준으로 삼으면 ON 에 머문다).
    expect(t.formRef.current.buyEnabled).toBe(true);
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.buyEnabled?.reason).toBe('rejected');
    expect(t.formRef.current.buyEnabled).toBe(false);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('미등록 전략에서 게이트(`buyEnabled`)는 전송되고(첫 스위치 = 등록) · `cancelTradeEnabled` 는 로컬이다', () => {
    const t = setup({ server: null });
    let gate: string | undefined;
    let check: string | undefined;
    // 체크를 먼저 — 등록 전송이 나가 있으면 체크는 로컬이 아니라 대기다(WR-01, 아래 describe).
    act(() => {
      check = t.hook.result.current.commit('cancelTradeEnabled', true, 'toggle');
    });
    act(() => {
      gate = t.hook.result.current.commit('buyEnabled', true, 'toggle');
    });
    expect(check).toBe('local');
    expect(gate).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.buyEnabled).toBe(true);
    // 로컬 반영한 체크는 등록 cfg 에 실린다.
    expect(t.cfgs()[0]!.cancelTradeEnabled).toBe(true);
  });

  it('CR-03 → WR-02 — 구서버 에코(`buy3Schema 0`) 금액 0 에서 주문금액 확정은 보내지 않는다 — `legacySchema`(금액 확정 경로 없음 · 거부를 성공으로 읽을 여지도 없다)', () => {
    const t = setup({ server: echo({ buy3Schema: 0, buyOrderAmount: 0, buyOrderQty: 7 }) });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyOrderAmount', 20, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.buyOrderAmount).toEqual({
      reason: 'legacySchema',
      text: LC_COMMIT_TEXT.legacyReadOnly,
      value: 20,
    });
    expect(t.hook.result.current.inflightField).toBeNull();
  });
});

describe('CR-01 — relay 스키마 범위 밖 cfg 는 보내지 않는다(마지막 방어선)', () => {
  it.each([
    ['sellOrderRatio', 0, '매도비율 · 1% 이상 입력해 주세요'],
    ['sellOrderRatio', 101, '매도비율 · 최대 100%까지 입력할 수 있어요'],
    ['sellQtyTrackRatio', 0, '잔량추적 · 1% 이상 입력해 주세요'],
    ['sellQtyTrackRatio', 91, '잔량추적 · 최대 90%까지 입력할 수 있어요'],
    ['sweepMinTickCount', 256, '한방 · 최대 255건까지 입력할 수 있어요'],
  ] as const)('%s = %d 확정 → `blocked` · 전송 0 · 사유 %s', (field, value, text) => {
    const t = setup();
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit(field, value, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures[field]).toEqual({ reason: 'invalid', text, value });
  });

  it('계약 — `lc-fields.ts` 범위가 relay `RelayLcSetSchema` 원문과 같다(한쪽만 바뀌면 여기서 깨진다)', () => {
    // webapp 은 relay 의 zod 를 import 할 수 없어 원문을 읽는다. 스키마 줄 모양이 바뀌면 이 정규식도 같이 고친다.
    const src = readFileSync(path.resolve(__dirname, '../../../../../../relay/src/ws/protocol.ts'), 'utf8');
    const zodRange = (field: string): { min: number; max: number } => {
      const m = new RegExp(`\\b${field}: z\\.number\\(\\)\\.int\\(\\)\\.min\\((\\d+)\\)\\.max\\((\\d+)\\)`).exec(src);
      expect(m, `relay 스키마의 ${field}`).not.toBeNull();
      return { min: Number(m![1]), max: Number(m![2]) };
    };
    const ubyte = /const UByteSchema = z\.number\(\)\.int\(\)\.min\((\d+)\)\.max\((\d+)\)/.exec(src);
    expect(ubyte).not.toBeNull();
    expect(/\bsweepMinTickCount: UByteSchema\b/.test(src)).toBe(true);
    expect(lcRowByField('sellOrderRatio')?.row.range).toEqual(zodRange('sellOrderRatio'));
    expect(lcRowByField('sellQtyTrackRatio')?.row.range).toEqual(zodRange('sellQtyTrackRatio'));
    expect(lcRowByField('sweepMinTickCount')?.row.range).toEqual({ min: Number(ubyte![1]), max: Number(ubyte![2]) });
  });

  it('경계값(1 · 90 · 100 · 255)은 그대로 나간다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sellQtyTrackRatio', 90, 'value');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('서버 동기값이 범위 밖이면 **다른 필드** 확정도 막는다 — cfg 는 32필드 전부라 그 값이 실린다', () => {
    const t = setup({ server: echo({ sellQtyTrackRatio: 100 }) });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.sweepMinTickCount?.text).toBe('잔량추적 · 최대 90%까지 입력할 수 있어요');
  });

  it('끄는 방향 토글도 범위 밖 cfg 면 보내지 않고 낙관 표시를 되돌린다(보내면 끄기도 못 하고 연결만 끊긴다)', () => {
    const t = setup({ server: echo({ buyEnabled: true, sellOrderRatio: 0 }) });
    let out: string | undefined;
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(t.send).not.toHaveBeenCalled();
    act(() => {
      out = t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.formRef.current.buyEnabled).toBe(true);
  });
});

describe('CR-02 — 타임아웃은 결과 모름이다 · 늦게 닿은 앞 건을 뒤 건이 되돌리지 않는다', () => {
  it('무장 해제(A) 타임아웃 뒤 다른 필드(B)는 대기 · A 늦은 에코 → 답 신호 증가 렌더에서 A 가 반영된 기준값으로 B 전송', () => {
    const t = setup({ server: echo({ sellEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('sellEnabled', false, 'toggle');
    });
    t.update({ unacked: true });
    expect(t.hook.result.current.failures.sellEnabled?.reason).toBe('timeout');

    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    // 곧바로 보내면 cfg 에 A 의 옛 값(sellEnabled: true)이 실려 늦게 닿은 해제를 되돌린다.
    expect(out).toBe('queued');
    expect(t.send).toHaveBeenCalledTimes(1);

    // A 의 늦은 에코 — A 는 성공, B 는 아직(답 신호 증가가 한 렌더 늦다).
    t.update({ server: echo({ sellEnabled: false }) });
    expect(t.hook.result.current.failures.sellEnabled).toBeUndefined();
    expect(t.send).toHaveBeenCalledTimes(1);
    t.update({ serverAnswerSeq: 1, unacked: false });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.sellEnabled).toBe(false);
    expect(t.cfgs()[1]!.buyWatchQty).toBe(8_000);
  });

  it('A 가 늦게 거부(답 신호만)되면 장벽이 풀리고 대기 건이 곧바로 나간다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ unacked: true });
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.buyWatchQty).toBe(8_000);
    expect(t.cfgs()[1]!.sweepMinTickCount).toBe(3);
  });

  it(`${LC_ORPHAN_WAIT_MS}ms 안에 아무 답도 없으면 대기 건은 보내지 않고 실패 · 토글은 되돌림 · 장벽은 풀린다`, () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ unacked: true });
    act(() => {
      t.hook.result.current.commit('cancelTradeEnabled', true, 'toggle');
    });
    expect(t.formRef.current.cancelTradeEnabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(LC_ORPHAN_WAIT_MS);
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.failures.cancelTradeEnabled?.reason).toBe('timeout');
    expect(t.formRef.current.cancelTradeEnabled).toBe(false);
    expect(t.hook.result.current.queuedFields).toEqual([]);
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    expect(out).toBe('sent');
  });

  it('결과 모름인 필드를 서버 값으로 되돌리는 확정은 no-op 이 아니다 — 곧바로 나가 늦게 닿는 앞 건을 뒤에서 덮는다', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ unacked: true });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepMinTickCount', 3, 'value');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.sweepMinTickCount).toBe(3);
  });

  it('같은 필드 「다시 시도」는 곧바로 나가고(장벽 없음), 그 뒤 다른 필드는 그 전송의 답을 기다린다', () => {
    const t = setup({ server: echo({ sellEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('sellEnabled', false, 'toggle');
    });
    t.update({ unacked: true });
    let retry: string | undefined;
    let other: string | undefined;
    act(() => {
      retry = t.hook.result.current.commit('sellEnabled', false, 'toggle');
      other = t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    expect(retry).toBe('sent');
    expect(other).toBe('queued');
    expect(t.send).toHaveBeenCalledTimes(2);
    t.update({ server: echo({ sellEnabled: false }), unacked: false });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(3);
    expect(t.cfgs()[2]!.sellEnabled).toBe(false);
  });
});

describe('WR-02 — 성공 렌더와 답 신호 증가 렌더 사이의 확정을 거부로 오판하지 않는다(대기열이 비어 있어도)', () => {
  it('A 성공 에코 렌더 → B 확정은 대기 → 증가 렌더에서 B 전송 · 그 뒤 증가가 없으면 B 는 실패가 아니다', () => {
    const t = setup({ server: echo({ sellEnabled: false }) });
    act(() => {
      t.hook.result.current.commit('sellEnabled', true, 'toggle');
    });
    t.update({ server: echo({ sellEnabled: true }) });
    expect(t.hook.result.current.flashField).toBe('sellEnabled');
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    expect(out).toBe('queued');
    expect(t.send).toHaveBeenCalledTimes(1);

    // 카드의 한 렌더 늦은 답 신호 증가 — 이 증가는 A 의 것이지 B 의 거부가 아니다.
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.hook.result.current.failures.buyEnabled).toBeUndefined();
    expect(t.hook.result.current.inflightField).toBe('buyEnabled');
    expect(t.formRef.current.buyEnabled).toBe(false);
  });
});

describe('WR-06 — 꺼낼 때 no-op 이 된 대기 확정은 성공 신호를 낸다(열린 시트·편집기가 닫히게)', () => {
  it('drain — 앞 건 에코가 대기 건의 값까지 담고 오면 전송 0 · 그 필드 성공', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    t.update({ server: echo({ sweepMinTickCount: 5, buyWatchQty: 8_000 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.lastSuccessField).toBe('buyWatchQty');
    expect(t.hook.result.current.successSeq).toBe(2);
    expect(t.hook.result.current.queuedFields).toEqual([]);
  });

  it('앞 건 실패로 대기열을 비울 때 — 서버가 이미 그 값인 건은 실패가 아니라 성공', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    // 다른 단말이 buyWatchQty 를 8,000 으로 바꾼 에코 — A(호가변경)는 반영되지 않았다.
    t.update({ server: echo({ buyWatchQty: 8_000 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.sweepMinTickCount?.reason).toBe('rejected');
    expect(t.hook.result.current.failures.buyWatchQty).toBeUndefined();
    expect(t.hook.result.current.lastSuccessField).toBe('buyWatchQty');
  });
});

describe('lastSuccessSent — 보낸 프레임의 답일 때만 참 (GC-IN-03)', () => {
  it('즉시 전송 → 그 값 에코 → 성공 · lastSuccessSent true', () => {
    const t = setup();
    expect(t.hook.result.current.lastSuccessSent).toBe(false);
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ server: echo({ sweepMinTickCount: 5 }) });
    expect(t.hook.result.current.lastSuccessField).toBe('sweepMinTickCount');
    expect(t.hook.result.current.successSeq).toBe(1);
    expect(t.hook.result.current.lastSuccessSent).toBe(true);
  });

  it('대기 건이 꺼낼 때 no-op(서버가 이미 그 값) → 성공 신호 · lastSuccessSent false', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('extraBuyEnabled', true, 'toggle');
    });
    // 앞 건 에코 + 다른 단말이 켠 추가매수 — 앞 건 성공(보낸 프레임의 답)은 true.
    t.update({ server: echo({ sweepMinTickCount: 5, extraBuyEnabled: true }) });
    expect(t.hook.result.current.lastSuccessField).toBe('sweepMinTickCount');
    expect(t.hook.result.current.lastSuccessSent).toBe(true);
    // 답 신호 증가 — 꺼낼 때 no-op 이라 전송 0 · 성공이지만 보낸 프레임의 답이 아니다.
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.lastSuccessField).toBe('extraBuyEnabled');
    expect(t.hook.result.current.successSeq).toBe(2);
    expect(t.hook.result.current.lastSuccessSent).toBe(false);
  });

  it('앞 건 실패로 대기 건을 접으며 주 필드가 섰음(동반 불일치 · GC-WR-02 섬) → 성공 · lastSuccessSent false', () => {
    const t = setup({ server: echo({ preBuyEnabled: true, buyEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
      t.hook.result.current.commit('preBuyEnabled', false, 'toggle', { buyEnabled: false });
    });
    t.update({ server: echo({ preBuyEnabled: false, buyEnabled: true }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.buyWatchQty?.reason).toBe('rejected');
    expect(t.hook.result.current.lastSuccessField).toBe('preBuyEnabled');
    expect(t.hook.result.current.lastSuccessSent).toBe(false);
  });

  it('앞 건 실패로 대기 건을 접을 때 서버가 주 필드 · 동반 모두 그 값 → 성공 · lastSuccessSent false', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
    });
    t.update({ server: echo({ buyWatchQty: 8_000 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.sweepMinTickCount?.reason).toBe('rejected');
    expect(t.hook.result.current.lastSuccessField).toBe('buyWatchQty');
    expect(t.hook.result.current.lastSuccessSent).toBe(false);
  });

  it('미등록 전략의 로컬 반영 성공 → lastSuccessSent false', () => {
    const t = setup({ server: null });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyOrderPrice', 120_000, 'value');
    });
    expect(out).toBe('local');
    expect(t.hook.result.current.lastSuccessField).toBe('buyOrderPrice');
    expect(t.hook.result.current.lastSuccessSent).toBe(false);
  });

  it('타임아웃 실패 뒤 늦은 에코로 실패를 거둔 성공 → lastSuccessSent false', () => {
    const t = setup();
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    t.update({ unacked: true });
    expect(t.hook.result.current.failures.sweepMinTickCount?.reason).toBe('timeout');
    t.update({ server: echo({ sweepMinTickCount: 5 }), unacked: false });
    expect(t.hook.result.current.failures.sweepMinTickCount).toBeUndefined();
    expect(t.hook.result.current.lastSuccessField).toBe('sweepMinTickCount');
    expect(t.hook.result.current.lastSuccessSent).toBe(false);
  });
});

describe('WR-01 — 미등록 전략에서 등록 전송이 나가 있으면 값 편집은 로컬 성공이 아니라 대기다', () => {
  it('등록(매수주문 켜기) 중 매수가격 편집 → `queued` · 성공 강조 없음 · 등록 에코 뒤 답 신호에서 정상 전송', () => {
    const t = setup({ server: null });
    let out: string | undefined;
    act(() => {
      t.hook.result.current.commit('buyEnabled', true, 'toggle');
      out = t.hook.result.current.commit('buyOrderPrice', 120_000, 'value');
    });
    expect(out).toBe('queued');
    expect(t.hook.result.current.flashField).toBeNull();
    expect(t.send).toHaveBeenCalledTimes(1);

    // 등록 에코 — 등록 cfg 시점 값(매수가격 130,000). 편집은 아직 대기다.
    t.update({ server: echo({ buyEnabled: true }) });
    expect(t.send).toHaveBeenCalledTimes(1);
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.buyOrderPrice).toBe(120_000);
    expect(t.cfgs()[1]!.buyEnabled).toBe(true);
    expect(t.cfgs()[1]!.crud).toBe('C');
  });

  it('등록이 결과 모름 뒤 늦게 거부(답 신호만)되면 대기 편집은 보내지 않고 로컬 반영한다(철거 프레임 금지)', () => {
    const t = setup({ server: null });
    act(() => {
      t.hook.result.current.commit('buyEnabled', true, 'toggle');
    });
    t.update({ unacked: true });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyOrderPrice', 120_000, 'value');
    });
    expect(out).toBe('queued');
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.formRef.current.buyOrderPrice).toBe(120_000);
    expect(t.hook.result.current.flashField).toBe('buyOrderPrice');
  });
});

describe('WR-02 · D-04a 잔여 — 구서버 에코(buy3Schema 0) 금액 0 — 금액 행 「—」 표기 · 끄기 cfg 는 서버 금액 · 수량', () => {
  /**
   * 레거시 전략 — 구서버 에코(`buy3Schema 0`) · 서버는 금액을 모르고(0) 수량 500주를 쥐고 매수가 무장돼 있다.
   * 금액부터 받는 경로(D-04a 금액 확정 특례)는 WR-02 로 도달 불가가 되어 제거됐다 — 금액 확정도 `legacySchema` 로 막힌다.
   */
  const legacy = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buy3Schema: 0, buyOrderAmount: 0, buyOrderQty: 500, buyEnabled: true, ...over });

  it('amountRequired(「—」 표기용) — 구서버 ∧ 금액 0 이면 true · 금액을 알면 false · 미등록이면 false', () => {
    expect(setup({ server: legacy() }).hook.result.current.amountRequired).toBe(true);
    expect(setup().hook.result.current.amountRequired).toBe(false);
    expect(setup({ server: null }).hook.result.current.amountRequired).toBe(false);
  });

  it('금액 외 값 확정은 보내지 않는다 — `blocked` · 구서버 읽기 전용 문장(WR-02 가 금액 먼저보다 앞선다 · 수량을 기본 금액으로 덮지 않는다)', () => {
    const t = setup({ server: legacy() });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.buyWatchQty).toEqual({
      reason: 'legacySchema',
      text: LC_COMMIT_TEXT.legacyReadOnly,
      value: 9_000,
    });
  });

  it('켜는 토글도 막는다 · 낙관 표시 없음', () => {
    const t = setup({ server: legacy({ sellEnabled: false }) });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sellEnabled', true, 'toggle');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.formRef.current.sellEnabled).toBe(false);
    expect(t.hook.result.current.failures.sellEnabled?.reason).toBe('legacySchema');
  });

  it('끄기(무장 해제)는 늘 허용 — cfg 의 금액·수량은 서버 값 그대로(0 · 500주)다', () => {
    const t = setup({ server: legacy() });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.buyEnabled).toBe(false);
    expect(t.cfgs()[0]!.buyOrderAmount).toBe(0);
    expect(t.cfgs()[0]!.buyOrderQty).toBe(500);
  });

  it('주문금액 확정도 보내지 않는다 — 구서버 에코는 읽기 전용이라 금액부터 받는 경로가 없다(WR-02 · D-04a 금액 확정 제거)', () => {
    const t = setup({ server: legacy() });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyOrderAmount', 30, 'value');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.buyOrderAmount?.reason).toBe('legacySchema');
    expect(t.hook.result.current.amountRequired).toBe(true);
  });

  it('매수주문 끄기가 나가 있는 동안 켜는 토글은 대기했다가 꺼낼 때 같은 가드로 막힌다 — 전송 0 · 낙관 표시 되돌림', () => {
    const t = setup({ server: legacy({ sellEnabled: false }) });
    act(() => {
      t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sellEnabled', true, 'toggle');
    });
    expect(out).toBe('queued');
    expect(t.formRef.current.sellEnabled).toBe(true);
    t.update({ server: legacy({ sellEnabled: false, buyEnabled: false }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.failures.sellEnabled?.reason).toBe('legacySchema');
    expect(t.formRef.current.sellEnabled).toBe(false);
  });

  it('WR-01 — buy3 에코(`buy3Schema 1`)의 선매수 금액 0 은 미입력이다 · amountRequired false · 다른 값 확정이 나간다', () => {
    const t = setup({ server: legacy({ buy3Schema: 1, buyOrderQty: 0 }) });
    expect(t.hook.result.current.amountRequired).toBe(false);
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.buyWatchQty).toBe(9_000);
    // 폼 기본 금액(4,000만원)으로 메우지 않는다 — 에코의 0 그대로 실린다(T-24-45).
    expect(t.cfgs()[0]!.buyOrderAmount).toBe(0);
  });

  it('WR-01 — 구서버 에코(`buy3Schema 0`) 금액 0 은 종전 D-04a 그대로 amountRequired true', () => {
    expect(setup({ server: legacy() }).hook.result.current.amountRequired).toBe(true);
    expect(setup({ server: legacy({ buy3Schema: 1 }) }).hook.result.current.amountRequired).toBe(false);
  });

  it('미등록 전략은 해당 없다 — 값 확정은 로컬 반영', () => {
    const t = setup({ server: null });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
    });
    expect(out).toBe('local');
  });
});

describe('WR-02 — 구서버 에코(buy3Schema 0)는 끄기만 · 매수주문부터 (24-VERIFICATION 갭 2)', () => {
  /**
   * 구서버 전략 — 매수주문(마스터) ON · 매도 ON · 금액은 서버가 안다(100만원). relay 는 `buy_watch_side` 를 싣지 않고
   * 구서버는 그 부재를 "0" 으로 읽는다 — 매수가 켜진 채 나가는 cfg 는 감시 기준을 조용히 뒤집는다.
   */
  const legacy = (over: Partial<RelayLimitChaser> = {}) =>
    echo({ buy3Schema: 0, buyEnabled: true, sellEnabled: true, buyOrderAmount: 100, ...over });
  /** 판정 입력 `next` — 실제로 나갈 값(서버 동기값 + 바꾼 필드). */
  const nextOf = (over: Partial<LimitChaserFormValues>): LimitChaserFormValues => ({
    ...formFromServer(legacy(), defaultLimitChaserForm()),
    ...over,
  });

  it('lcLegacyBlockOf 표 — 구서버가 아니면 늘 null · 끄는 방향 ∧ 결과 마스터 OFF 만 null', () => {
    const on = nextOf({});
    const off = nextOf({ buyEnabled: false });
    // 구서버가 아니면 어떤 입력도 막지 않는다.
    expect(lcLegacyBlockOf(false, 'buyWatchQty', 9_000, on)).toBeNull();
    expect(lcLegacyBlockOf(false, 'sellEnabled', true, on)).toBeNull();
    expect(lcLegacyBlockOf(false, 'sellEnabled', false, on)).toBeNull();
    // 값 · 켜는 방향 = 읽기 전용 문장.
    expect(lcLegacyBlockOf(true, 'buyWatchQty', 9_000, on)).toBe(LC_COMMIT_TEXT.legacyReadOnly);
    expect(lcLegacyBlockOf(true, 'sellEnabled', true, on)).toBe(LC_COMMIT_TEXT.legacyReadOnly);
    expect(lcLegacyBlockOf(true, 'buyOrderAmount', 300, on)).toBe(LC_COMMIT_TEXT.legacyReadOnly);
    // 매수가 켜진 채 다른 끄기 = 매수주문부터.
    expect(lcLegacyBlockOf(true, 'sellEnabled', false, on)).toBe(LC_COMMIT_TEXT.legacyMasterFirst);
    expect(lcLegacyBlockOf(true, 'cancelTradeEnabled', false, on)).toBe(LC_COMMIT_TEXT.legacyMasterFirst);
    // 매수주문 끄기 · 마스터 OFF 뒤 끄기(체크 포함)는 허용.
    expect(lcLegacyBlockOf(true, 'buyEnabled', false, off)).toBeNull();
    expect(lcLegacyBlockOf(true, 'sellEnabled', false, off)).toBeNull();
    expect(lcLegacyBlockOf(true, 'cancelTradeEnabled', false, off)).toBeNull();
  });

  it('문구 원천 — 원문 그대로', () => {
    expect(LC_COMMIT_TEXT.legacyReadOnly).toBe('구서버 전략이라 끄기만 할 수 있어요 — 서버를 확인해 주세요');
    expect(LC_COMMIT_TEXT.legacyMasterFirst).toBe('구서버 전략이라 매수주문부터 꺼 주세요');
  });

  it('매수가 켜진 채 매도 끄기 = `blocked` · 전송 0 · 매도 그대로 → 매수주문 끄기 = 전송 1(매도 그대로) → 마스터 OFF 에코 뒤 매도 끄기 = 철거', () => {
    const t = setup({ server: legacy() });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sellEnabled', false, 'toggle');
    });
    expect(out).toBe('blocked');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.formRef.current.sellEnabled).toBe(true);
    expect(t.hook.result.current.failures.sellEnabled).toEqual({
      reason: 'legacySchema',
      text: LC_COMMIT_TEXT.legacyMasterFirst,
      value: false,
    });

    act(() => {
      out = t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.buyEnabled).toBe(false);
    expect(t.cfgs()[0]!.sellEnabled).toBe(true);

    t.update({ server: legacy({ buyEnabled: false }) });
    t.update({ serverAnswerSeq: 1 });
    act(() => {
      out = t.hook.result.current.commit('sellEnabled', false, 'toggle');
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.buyEnabled).toBe(false);
    expect(t.cfgs()[1]!.sellEnabled).toBe(false);
    expect(t.cfgs()[1]!.crud).toBe('D');
  });

  it('값 확정 · 금액 확정 · 켜는 토글 = 모두 `blocked` · `legacySchema` · 읽기 전용 문장 · 낙관 표시 없음', () => {
    const t = setup({ server: legacy({ sellEnabled: false }) });
    const outs: string[] = [];
    act(() => {
      outs.push(t.hook.result.current.commit('buyWatchQty', 9_000, 'value'));
      outs.push(t.hook.result.current.commit('buyOrderAmount', 300, 'value'));
      outs.push(t.hook.result.current.commit('sellEnabled', true, 'toggle'));
    });
    expect(outs).toEqual(['blocked', 'blocked', 'blocked']);
    expect(t.send).not.toHaveBeenCalled();
    for (const f of ['buyWatchQty', 'buyOrderAmount', 'sellEnabled'] as const) {
      expect(t.hook.result.current.failures[f]?.reason).toBe('legacySchema');
      expect(t.hook.result.current.failures[f]?.text).toBe(LC_COMMIT_TEXT.legacyReadOnly);
    }
    expect(t.setForm).not.toHaveBeenCalled();
  });

  it('대기열 — 매수주문 끄기가 나가 있는 동안 값 확정은 `queued` → 성공 에코 · 답 신호 뒤 꺼낼 때 같은 가드로 전송 0', () => {
    const t = setup({ server: legacy() });
    act(() => {
      t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
    });
    expect(out).toBe('queued');
    t.update({ server: legacy({ buyEnabled: false }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.queuedFields).toEqual([]);
    expect(t.hook.result.current.failures.buyWatchQty).toEqual({
      reason: 'legacySchema',
      text: LC_COMMIT_TEXT.legacyReadOnly,
      value: 9_000,
    });
  });

  it('구서버 ∧ 금액 0 에서 매수주문 끄기 cfg 는 금액 · 수량을 서버 값 그대로 싣는다(D-04a 잔여 규칙)', () => {
    const t = setup({ server: legacy({ buyOrderAmount: 0, buyOrderQty: 500 }) });
    act(() => {
      t.hook.result.current.commit('buyEnabled', false, 'toggle');
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.buyOrderAmount).toBe(0);
    expect(t.cfgs()[0]!.buyOrderQty).toBe(500);
  });

  it('buy3 에코(`buy3Schema 1`)에서는 제한이 없다 — 매수가 켜진 채 매도 끄기 · 값 확정 · 켜는 토글이 그대로 나간다', () => {
    const t = setup({ server: legacy({ buy3Schema: 1 }) });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sellEnabled', false, 'toggle');
    });
    expect(out).toBe('sent');
    expect(t.cfgs()[0]!.buyEnabled).toBe(true);
    expect(t.hook.result.current.failures.sellEnabled).toBeUndefined();
  });
});

describe('companions — 한 확정 = 한 lc.set 에 동반 필드 (Phase 24 D-01 · D-02)', () => {
  /** 마스터 OFF · 세 그룹 OFF 인 살아 있는 전략(매도 ON — 삭제 아님). */
  const masterOff = () => echo({ buyEnabled: false, sellEnabled: true });

  it('D-01 — 그룹 켜기 + 동반 마스터 = 전송 1회 · cfg 에 둘 다 · 나머지는 서버 값 · 두 필드 모두 낙관 표시', () => {
    const t = setup({ server: masterOff() });
    t.formRef.current = { ...t.formRef.current, sweepMinTickCount: 9 };
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(out).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    const cfg = t.cfgs()[0]!;
    expect(cfg.preBuyEnabled).toBe(true);
    expect(cfg.buyEnabled).toBe(true);
    expect(cfg.sellEnabled).toBe(true);
    // 로컬의 오래된 값은 싣지 않는다(T-20-03) — 동반 필드가 생겨도 기준값은 서버 동기값이다.
    expect(cfg.sweepMinTickCount).toBe(3);
    expect(t.formRef.current.preBuyEnabled).toBe(true);
    expect(t.formRef.current.buyEnabled).toBe(true);
  });

  it('성공 판정은 주 필드만 — 에코의 그 그룹이 ON 이면 성공(마스터 값과 무관)', () => {
    const t = setup({ server: masterOff() });
    act(() => {
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    // 서버가 동반 필드를 부분 거부해도(마스터 OFF 그대로) 주 필드가 섰으면 주 필드 실패가 아니다.
    t.update({ server: echo({ buyEnabled: false, sellEnabled: true, preBuyEnabled: true }) });
    const r = t.hook.result.current;
    expect(r.inflightField).toBeNull();
    expect(r.lastSuccessField).toBe('preBuyEnabled');
    expect(r.failures.preBuyEnabled).toBeUndefined();
  });

  it('거부(답만 증가 · 에코 OFF)면 주 필드와 동반 필드를 함께 확정 전 값으로 되돌린다', () => {
    const t = setup({ server: masterOff() });
    act(() => {
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.preBuyEnabled?.reason).toBe('rejected');
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(false);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('타임아웃(unacked)도 동반 필드까지 되돌린다', () => {
    const t = setup({ server: masterOff() });
    act(() => {
      t.hook.result.current.commit('postBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    t.update({ unacked: true });
    expect(t.formRef.current.postBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(false);
  });

  it('send 가 false 면 setForm 호출 0 · 끊김 실패', () => {
    const t = setup({ server: masterOff() });
    t.send.mockReturnValue(false);
    act(() => {
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(t.setForm).not.toHaveBeenCalled();
    expect(t.hook.result.current.failures.preBuyEnabled?.reason).toBe('disconnected');
  });

  it('대기 중 앞 건 실패로 폐기되면 대기 토글의 동반 필드도 되돌린다', () => {
    const t = setup({ server: masterOff() });
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('extraBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(t.formRef.current.extraBuyEnabled).toBe(true);
    expect(t.formRef.current.buyEnabled).toBe(true);
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.formRef.current.extraBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(false);
  });

  it('무장 가드(armBlockOf)는 동반 필드를 합친 값으로 판정한다', () => {
    const armBlockOf = (v: LimitChaserFormValues) => (v.buyEnabled ? '매수주문 · 막힘' : null);
    const alone = setup({ server: masterOff(), armBlockOf });
    let a: string | undefined;
    act(() => {
      a = alone.hook.result.current.commit('preBuyEnabled', true, 'toggle');
    });
    expect(a).toBe('sent');

    const withMaster = setup({ server: masterOff(), armBlockOf });
    let b: string | undefined;
    act(() => {
      b = withMaster.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(b).toBe('blocked');
    expect(withMaster.send).not.toHaveBeenCalled();
    expect(withMaster.hook.result.current.failures.preBuyEnabled?.text).toBe('매수주문 · 막힘');
  });

  it('같은 필드를 대기 중 다시 확정하면 값과 companions 가 마지막 것으로 바뀌고 자리는 그대로다', () => {
    const t = setup({ server: masterOff() });
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyWatchQty', 8_000, 'value');
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true, cancelTradeEnabled: true });
    });
    expect(t.hook.result.current.queuedFields).toEqual(['buyWatchQty', 'preBuyEnabled']);
    // A 성공 → 답 신호 → buyWatchQty 전송 → 성공 → 답 신호 → preBuyEnabled 전송.
    t.update({ server: echo({ buyEnabled: false, sellEnabled: true, sweepMinTickCount: 5 }) });
    t.update({ serverAnswerSeq: 1 });
    t.update({ server: echo({ buyEnabled: false, sellEnabled: true, sweepMinTickCount: 5, buyWatchQty: 8_000 }) });
    t.update({ serverAnswerSeq: 2 });
    expect(t.send).toHaveBeenCalledTimes(3);
    const cfg = t.cfgs()[2]!;
    expect(cfg.preBuyEnabled).toBe(true);
    expect(cfg.buyEnabled).toBe(true);
    expect(cfg.cancelTradeEnabled).toBe(true);
  });

  it('no-op — 주 필드와 모든 companions 가 서버 값과 같을 때만 · 하나라도 다르면 전송', () => {
    const on = () => echo({ buyEnabled: true, preBuyEnabled: true });
    const same = setup({ server: on() });
    let a: string | undefined;
    act(() => {
      a = same.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(a).toBe('noop');
    expect(same.send).not.toHaveBeenCalled();

    const diff = setup({ server: on() });
    let b: string | undefined;
    act(() => {
      b = diff.hook.result.current.commit('preBuyEnabled', true, 'toggle', { sellEnabled: true });
    });
    expect(b).toBe('sent');
    expect(diff.cfgs()[0]!.sellEnabled).toBe(true);
  });

  it('미등록(server 없음) — 그룹 스위치(동반 마스터)는 등록 전송 · 한방 체크는 로컬이다', () => {
    const t = setup({ server: null });
    let sweep: string | undefined;
    let group: string | undefined;
    act(() => {
      sweep = t.hook.result.current.commit('sweepEnabled', true, 'toggle');
    });
    act(() => {
      group = t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { buyEnabled: true });
    });
    expect(sweep).toBe('local');
    expect(group).toBe('sent');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.cfgs()[0]!.preBuyEnabled).toBe(true);
    expect(t.cfgs()[0]!.buyEnabled).toBe(true);
    expect(t.cfgs()[0]!.sweepEnabled).toBe(true);
  });

  it('meta — `onSent(cfg, meta)` 로 사유를 넘긴다 · 없으면 둘째 인자 undefined', () => {
    const t = setup({ server: echo({ buyEnabled: true, sellEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('buyEnabled', false, 'toggle', undefined, { cause: 'serverFold' });
    });
    expect(t.onSent).toHaveBeenCalledTimes(1);
    expect(t.onSent.mock.calls[0]![0]).toEqual(t.cfgs()[0]);
    expect(t.onSent.mock.calls[0]![1]).toEqual({ cause: 'serverFold' });

    const plain = setup();
    act(() => {
      plain.hook.result.current.commit('sweepMinTickCount', 5, 'value');
    });
    expect(plain.onSent.mock.calls[0]![1]).toBeUndefined();
  });

  it('meta — 대기열에서 꺼내 보낼 때도 그 확정의 meta 가 그대로 간다 · 실패해도 재시도 없음', () => {
    const t = setup({ server: echo({ buyEnabled: true, sellEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      t.hook.result.current.commit('buyEnabled', false, 'toggle', undefined, { cause: 'serverFold' });
    });
    t.update({ server: echo({ buyEnabled: true, sellEnabled: true, sweepMinTickCount: 5 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.cfgs()[1]!.buyEnabled).toBe(false);
    expect(t.onSent.mock.calls[1]![1]).toEqual({ cause: 'serverFold' });
    // 거부 — 마스터는 서버 값(ON)으로 돌아오고 다시 보내지 않는다.
    t.update({ serverAnswerSeq: 2 });
    expect(t.formRef.current.buyEnabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    t.update({ serverAnswerSeq: 3 });
    expect(t.send).toHaveBeenCalledTimes(2);
  });

  it('WR-03 — 함수 companions 는 꺼내는 순간의 서버 동기값으로 계산된다 · 앞 건이 확정한 값을 낡은 채움이 덮지 않는다', () => {
    const t = setup({ server: echo({ sellOrderPrice: 0 }) });
    const fill = (b: LimitChaserFormValues): Partial<LimitChaserFormValues> =>
      b.sellOrderPrice === 0 ? { sellOrderPrice: 99_999 } : {};
    let out: string | undefined;
    act(() => {
      t.hook.result.current.commit('sellOrderPrice', 12_000, 'value');
      out = t.hook.result.current.commit('preBuyEnabled', true, 'toggle', fill);
    });
    expect(out).toBe('queued');
    expect(t.send).toHaveBeenCalledTimes(1);
    t.update({ server: echo({ sellOrderPrice: 12_000 }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(2);
    const cfg = t.cfgs()[1]!;
    expect(cfg.preBuyEnabled).toBe(true);
    expect(cfg.sellOrderPrice).toBe(12_000);
  });

  it('WR-03 — 함수 companions 의 no-op 판정도 판정 시점 계산이다(확정 순간 · 꺼내는 순간)', () => {
    const fill = (b: LimitChaserFormValues): Partial<LimitChaserFormValues> =>
      b.sellOrderPrice === 0 ? { sellOrderPrice: 99_999 } : {};
    // 확정 순간 — 계산 결과({})와 주 필드가 모두 서버 값과 같다.
    const same = setup({ server: echo({ preBuyEnabled: true }) });
    let a: string | undefined;
    act(() => {
      a = same.hook.result.current.commit('preBuyEnabled', true, 'toggle', fill);
    });
    expect(a).toBe('noop');
    expect(same.send).not.toHaveBeenCalled();

    // 꺼내는 순간 — 누른 순간에는 채울 값이 있었지만(전송 대상), 꺼낼 때 서버가 이미 그 상태다 → 전송 0 · 성공.
    const t = setup({ server: echo({ sellOrderPrice: 0 }) });
    let b: string | undefined;
    act(() => {
      t.hook.result.current.commit('sweepMinTickCount', 5, 'value');
      b = t.hook.result.current.commit('preBuyEnabled', true, 'toggle', fill);
    });
    expect(b).toBe('queued');
    const there = echo({ sellOrderPrice: 12_000, preBuyEnabled: true, sweepMinTickCount: 5 });
    t.update({ server: there });
    t.update({ serverAnswerSeq: 1 });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.lastSuccessField).toBe('preBuyEnabled');
    expect(t.hook.result.current.failures.preBuyEnabled).toBeUndefined();
  });

  it('WR-04 — 앞 건 실패로 대기 건을 접을 때 주 필드만 같다고 성공으로 접지 않는다 · 동반 마스터가 다르면 서버 값(ON)으로 되돌림 → GC-WR-02: 주 필드는 성공', () => {
    const t = setup({ server: echo({ preBuyEnabled: true, buyEnabled: true }) });
    let out: string | undefined;
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
      out = t.hook.result.current.commit('preBuyEnabled', false, 'toggle', { buyEnabled: false });
    });
    expect(out).toBe('queued');
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(false);
    // 서버가 선매수를 접었다(발주) · 마스터 ON · buyWatchQty 미반영 → 답 신호(한 렌더 뒤 · 훅 ⑦) → in-flight 거부.
    t.update({ server: echo({ preBuyEnabled: false, buyEnabled: true }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.buyWatchQty?.reason).toBe('rejected');
    // GC-WR-02 — 주 필드가 서버에 섰으면 성공, 동반만 서버 값. 대기 건 전체를 성공으로 접은 것은 아니다(마스터는 ON 으로 돌아온다).
    expect(t.hook.result.current.failures.preBuyEnabled).toBeUndefined();
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(true);
    expect(t.hook.result.current.queuedFields).toEqual([]);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('WR-04 대조 — 서버가 주 필드와 동반 마스터 모두 그 값이면 대기 건은 성공으로 접힌다(전송 없음 · 실패 표시 없음)', () => {
    const t = setup({ server: echo({ preBuyEnabled: true, buyEnabled: true, sellEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
      t.hook.result.current.commit('preBuyEnabled', false, 'toggle', { buyEnabled: false });
    });
    t.update({ server: echo({ preBuyEnabled: false, buyEnabled: false, sellEnabled: true }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.buyWatchQty?.reason).toBe('rejected');
    expect(t.hook.result.current.failures.preBuyEnabled).toBeUndefined();
    expect(t.hook.result.current.lastSuccessField).toBe('preBuyEnabled');
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('IN-05 — 동반 값 필드(매도 주문가격)는 에코 전에 폼에 넣지 않는다 · cfg 에는 실린다 · 거부 뒤 불리언만 되돌린다', () => {
    const t = setup({ server: echo({ buyEnabled: false }) });
    act(() => {
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', {
        sellOrderPrice: 150_800,
        sellEnabled: true,
        buyEnabled: true,
      });
    });
    expect(t.formRef.current.preBuyEnabled).toBe(true);
    expect(t.formRef.current.sellEnabled).toBe(true);
    expect(t.formRef.current.buyEnabled).toBe(true);
    expect(t.formRef.current.sellOrderPrice).toBe(130_000);
    expect(t.cfgs()[0]!.sellOrderPrice).toBe(150_800);
    // 그사이 폼의 값 칸이 다른 값이 됐다(에코 등) — 되돌림은 값 칸을 덮지 않는다.
    t.formRef.current = { ...t.formRef.current, sellOrderPrice: 777 };
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.preBuyEnabled?.reason).toBe('rejected');
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.sellEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(false);
    expect(t.formRef.current.sellOrderPrice).toBe(777);
  });

  it('GC-WR-02 — 주 필드가 이미 서버에 섰다: 앞 건 거부로 대기 「선매수 끔 + 마스터 동반 끔」을 접어도 주 필드는 성공 · 동반만 서버 값', () => {
    const t = setup({ server: echo({ preBuyEnabled: true, buyEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
      t.hook.result.current.commit('preBuyEnabled', false, 'toggle', { buyEnabled: false });
    });
    const seqBefore = t.hook.result.current.successSeq;
    // 서버가 선매수를 접었다 · 마스터 ON · buyWatchQty 미반영 → 답 신호(다음 렌더) → in-flight 거부 → 대기 건 접기.
    t.update({ server: echo({ preBuyEnabled: false, buyEnabled: true }) });
    t.update({ serverAnswerSeq: 1 });
    const r = t.hook.result.current;
    expect(r.failures.buyWatchQty?.reason).toBe('rejected');
    expect(r.failures.preBuyEnabled).toBeUndefined();
    expect(r.successSeq).toBeGreaterThan(seqBefore);
    expect(r.lastSuccessField).toBe('preBuyEnabled');
    // 폼 토글 = 서버 값 — 선매수 OFF(누른 순간 값 ON 으로 되살리지 않는다) · 마스터 ON.
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(true);
    // 재전송 없음(T-16-10).
    expect(t.send).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    t.update({ serverAnswerSeq: 2 });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('GC-WR-02 — 주 필드가 서버에 서지 않았다: 대기 건은 실패(`rejected`) · 폼 토글은 서버 값(선매수 ON · 마스터 ON)', () => {
    const t = setup({ server: echo({ preBuyEnabled: true, buyEnabled: true }) });
    act(() => {
      t.hook.result.current.commit('buyWatchQty', 9_000, 'value');
      t.hook.result.current.commit('preBuyEnabled', false, 'toggle', { buyEnabled: false });
    });
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.buyEnabled).toBe(false);
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.preBuyEnabled?.reason).toBe('rejected');
    expect(t.formRef.current.preBuyEnabled).toBe(true);
    expect(t.formRef.current.buyEnabled).toBe(true);
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('GC-WR-02 — in-flight 실패 되돌림도 서버 동기값이다: 그사이 다른 단말이 켠 매도는 누른 순간 값(OFF)이 아니라 서버 값(ON)', () => {
    const t = setup({ server: echo({ sellEnabled: false }) });
    act(() => {
      t.hook.result.current.commit('preBuyEnabled', true, 'toggle', { sellEnabled: true, buyEnabled: true });
    });
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.formRef.current.preBuyEnabled).toBe(true);
    expect(t.formRef.current.sellEnabled).toBe(true);
    // 다른 단말이 매도를 켰다(선매수 OFF 그대로) → 답 신호(거부).
    t.update({ server: echo({ sellEnabled: true }) });
    t.update({ serverAnswerSeq: 1 });
    expect(t.hook.result.current.failures.preBuyEnabled?.reason).toBe('rejected');
    expect(t.formRef.current.preBuyEnabled).toBe(false);
    expect(t.formRef.current.sellEnabled).toBe(true);
    expect(t.formRef.current.buyEnabled).toBe(true);
    expect(t.send).toHaveBeenCalledTimes(1);
  });
});

describe('게이트 필드 (Phase 24 — 세 그룹 스위치가 등록할 수 있다 · 한방은 체크가 됐다)', () => {
  it('LC_GATE_FIELDS = 마스터 · 선 · 추가 · 후매수 · 매도 · 취소잔량 — 한방 없음', () => {
    expect([...LC_GATE_FIELDS]).toEqual([
      'buyEnabled',
      'preBuyEnabled',
      'extraBuyEnabled',
      'postBuyEnabled',
      'sellEnabled',
      'cancelQtyEnabled',
    ]);
  });

  it('끄는 방향 한방 체크는 무장 가드를 지나지 않는다(무장 해제 — T-16-44)', () => {
    const armBlockOf = () => '매수주문 · 막힘';
    const t = setup({ server: echo({ preBuyEnabled: true, sweepEnabled: true }), armBlockOf });
    let out: string | undefined;
    act(() => {
      out = t.hook.result.current.commit('sweepEnabled', false, 'toggle');
    });
    expect(out).toBe('sent');
  });

  it('사전 검증 · D-16 문구 원천 — UI-SPEC 원문 그대로', () => {
    expect(LC_COMMIT_TEXT.qtyZero).toBe('금액이 주문가격보다 작아 주문수량이 0주예요 — 금액을 올려 주세요');
    expect(LC_COMMIT_TEXT.minOverMax).toBe(
      '최소 잔량이 최대 잔량보다 커요 — 최대를 0(무제한)으로 하거나 최소를 낮춰 주세요',
    );
    expect(LC_COMMIT_TEXT.reboundRange).toBe('반등을 1~100%로 입력해 주세요');
    expect(LC_COMMIT_TEXT.sellRatioRequired).toBe(
      '후매수는 매도비율이 있어야 켤 수 있어요 — 매도비율을 1~100%로 입력해 주세요',
    );
    expect(LC_COMMIT_TEXT.extraBuyAtUpperLimit).toBe(
      '추가매수는 상한가 도달 전에만 켤 수 있습니다 — 매수1호가 == 비교가격',
    );
  });
});

describe('D-03 — 선매수 · 추가매수 · 후매수 금액 0 이면 그 그룹 스위치만 막힌다(lcGroupAmountBlockOf · IN-04)', () => {
  const values = (over: Partial<LimitChaserFormValues> = {}): LimitChaserFormValues => ({
    ...formFromServer(echo(), defaultLimitChaserForm()),
    extraBuyOrderAmount: 10,
    postBuyOrderAmount: 10,
    ...over,
  });

  it('추가매수 금액 0 에서 켜는 방향 → 「주문금액을 먼저 입력해 주세요」', () => {
    expect(lcGroupAmountBlockOf(values({ extraBuyOrderAmount: 0 }), 'extraBuyEnabled', true)).toBe(
      LC_COMMIT_TEXT.amountRequired,
    );
  });
  it('끄는 방향 · 금액 > 0 은 막지 않는다', () => {
    expect(lcGroupAmountBlockOf(values({ extraBuyOrderAmount: 0 }), 'extraBuyEnabled', false)).toBeNull();
    expect(lcGroupAmountBlockOf(values(), 'extraBuyEnabled', true)).toBeNull();
  });
  it('후매수도 같다', () => {
    expect(lcGroupAmountBlockOf(values({ postBuyOrderAmount: 0 }), 'postBuyEnabled', true)).toBe(
      LC_COMMIT_TEXT.amountRequired,
    );
    expect(lcGroupAmountBlockOf(values({ postBuyOrderAmount: 0 }), 'postBuyEnabled', false)).toBeNull();
  });
  it('IN-04 — 선매수도 같다: 선매수 금액 0 에서 켜는 방향 → 「주문금액을 먼저 입력해 주세요」 · 끄는 방향 · 금액 > 0 은 null', () => {
    expect(lcGroupAmountBlockOf(values({ buyOrderAmount: 0 }), 'preBuyEnabled', true)).toBe(LC_COMMIT_TEXT.amountRequired);
    expect(lcGroupAmountBlockOf(values({ buyOrderAmount: 0 }), 'preBuyEnabled', false)).toBeNull();
    expect(lcGroupAmountBlockOf(values({ buyOrderAmount: 10 }), 'preBuyEnabled', true)).toBeNull();
  });
  it('그 밖 필드(다른 행 확정)는 null — 다른 행은 자유롭다 · 선매수는 금액 > 0 이면 null', () => {
    const v = values({ extraBuyOrderAmount: 0, postBuyOrderAmount: 0 });
    expect(lcGroupAmountBlockOf(v, 'extraBuyMinQty', 5)).toBeNull();
    expect(lcGroupAmountBlockOf(v, 'preBuyEnabled', true)).toBeNull();
    expect(lcGroupAmountBlockOf(v, 'buyWatchPrice', 1)).toBeNull();
  });
});
