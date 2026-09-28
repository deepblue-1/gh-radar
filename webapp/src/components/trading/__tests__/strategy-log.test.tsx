import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  LIMIT_CHASER_SERVER_COUNTER_FIELDS,
  LIMIT_CHASER_SERVER_LATCH_FIELDS,
  LIMIT_CHASER_SERVER_ONLY_FIELDS,
  LIMIT_CHASER_SERVER_RUNTIME_FIELDS,
} from '@gh-radar/shared';
import type { RelayLimitChaser, RelayLimitChaserInput, RelayServerMsg } from '@gh-radar/shared';

import {
  POST_BUY_OVERRIDE_FIELDS,
  StrategyLog,
  TRANSITION_ORDER,
  TRANSITION_TEXT,
  echoAnswersSent,
  isRuntimeOnlyEcho,
  limitChaserValuesChanged,
  marketCloseDisabledLogLine,
  serverMessageLogLine,
  strategiesDisabledLogLine,
  strategyLogLine,
  type StrategyLogEntry,
} from '../strategy-log';
import { isLimitChaserServerMessage } from '@/lib/limit-chaser';
import { isViServerMessage } from '@/lib/vi-alert';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';

/**
 * Phase 16 Plan 13 Task 1 — 전략 로그 (A13 · T-16-07).
 *
 * 여기서 잠그는 것:
 *   - 전이 문장이 **순수 함수**에서 나오는가 (화면마다 다른 말을 하지 않게)
 *   - 무장 해제가 「발주」인지 「사용자 조작」인지 **구분**되는가 (Pitfall 10)
 *   - 서버 거부(`ServerMessage ERROR`)가 **문구를 지어내지 않고** 원문을 싣는가 (D-36)
 *   - 상따/VI 몫 판정이 종목 유무로 갈리는가 (Pitfall 9)
 */

const BASE: RelayLimitChaser = {
  isin: 'KR7005930003',
  accountNo: '1234567801',
  // 시장 구분은 1자 코드다 — `"Q"`=KOSDAQ, 그 외=KOSPI (게이트웨이는 첫 글자만 읽는다).
  market: 'K',
  crud: 'C',
  buyOrderPrice: 71_000,
  buyOrderQty: 14,
  buyWatchPrice: 71_100,
  buyWatchQty: 10_000,
  buyMinTradeQty: 30_000,
  buyWatchSide: '0',
  buyTradeQtyEnabled: false,
  buyEnabled: false,
  sellOrderPrice: 71_200,
  sellOrderQty: 0,
  sellWatchPrice: 71_300,
  sellWatchQty: 10,
  sellMinTradeQty: 30_500,
  sellEnabled: false,
  sellTradeQtyEnabled: false,
  sweepWatchPrice: 71_400,
  sweepEnabled: false,
  sweepMinTickCount: 3,
  sweepRecalcEnabled: true,
  sweepMinCount: 0,
  sweepMinRate: 0,
  exchange: 'KRX',
  sellOrderRatio: 100,
  sellQtyTrackEnabled: false,
  sellQtyTrackRatio: 50,
  sellQtyTrackBaseline: 0,
  buyOrderAmount: 10,
  sellEntryLatched: false,
  cancelQtyEnabled: false,
  cancelWatchQty: 10,
  cancelTradeEnabled: false,
  cancelQtyTrackEnabled: false,
  cancelQtyTrackBaseline: 0,
  cancelEntryLatched: false,
  ...LC_BUY3_ECHO_DEFAULTS,
  key: 'KR7005930003:1234567801:KRX',
};

const at = (over: Partial<RelayLimitChaser>): RelayLimitChaser => ({ ...BASE, ...over });

function msg(over: Partial<RelayServerMsg> = {}): RelayServerMsg {
  return { t: 'msg', lv: 'INFO', m: '세션에 참여했습니다', i: '', a: '', src: 'System', kind: '', ...over };
}

describe('strategyLogLine — 전이 문장(순수 함수)', () => {
  it('① 처음 본 전략 = 등록. 무장 상태도 함께 적는다', () => {
    expect(strategyLogLine(null, at({ buyEnabled: true }))).toBe('전략이 등록됐어요 · 매수주문 무장');
  });

  it('② 매수주문(마스터) 무장 / 무장 해제 — 문구는 카드 이름을 따른다 (Phase 24 ⑨)', () => {
    expect(strategyLogLine(BASE, at({ buyEnabled: true }))).toBe('매수주문 무장');
    expect(strategyLogLine(at({ buyEnabled: true }), BASE)).toBe('매수주문 무장 해제');
  });

  it('③ ★ 마스터 해제는 「발주」로 읽지 않는다 — `buyFired` 는 은퇴했다 (Pitfall 11)', () => {
    // 마스터는 발주로 접히지 않는다. 발주 사실은 서버 사유 줄(`[상따] … 매수 N주 @…`)이 말한다.
    expect(strategyLogLine(at({ buyEnabled: true }), BASE)).toBe('매수주문 무장 해제');
    expect(strategyLogLine(at({ buyEnabled: true }), BASE, { sent: null })).toBe('매수주문 무장 해제');
    expect(Object.values(TRANSITION_TEXT)).not.toContain('매수 발주 — 무장 해제');
    expect(TRANSITION_ORDER as readonly string[]).not.toContain('buyFired');
  });

  it('④ 매도 무장 → 래치 전이가 각각 다른 문장이다', () => {
    expect(strategyLogLine(BASE, at({ sellEnabled: true }))).toBe('매도 무장 — 대기 (지지벽 미관측)');
    expect(
      strategyLogLine(at({ sellEnabled: true }), at({ sellEnabled: true, sellEntryLatched: true })),
    ).toBe('매도 진입 래치 ON — 감시 시작');
    expect(
      strategyLogLine(at({ sellEnabled: true, sellEntryLatched: true }), at({ sellEnabled: true })),
    ).toBe('매도 진입 래치 해제');
  });

  it('⑤ 취소 게이트 무장/해제 — 두 항 중 하나만 켜져도 무장이다', () => {
    expect(strategyLogLine(BASE, at({ cancelQtyEnabled: true }))).toBe(
      '매수 미체결 자동취소 무장',
    );
    expect(strategyLogLine(BASE, at({ cancelTradeEnabled: true }))).toBe(
      '매수 미체결 자동취소 무장',
    );
    expect(strategyLogLine(at({ cancelQtyEnabled: true }), BASE)).toBe(
      '매수 미체결 자동취소 해제',
    );
  });

  it('⑥ 값만 바뀌면 「서버 반영 완료」 — 반영의 유일한 증거가 에코다', () => {
    expect(strategyLogLine(BASE, at({ buyWatchQty: 8_000 }))).toBe('서버 반영 완료');
    // 게이트·래치·S→C 파생만 바뀐 것은 값 변경이 아니다(둘을 뭉개면 문장이 항상 붙는다).
    expect(strategyLogLine(BASE, at({ buyEnabled: true }))).toBe('매수주문 무장');
  });

  it('⑦ `crud:"D"` 는 삭제다 — 스위치가 아니라 에코가 판정한다 (Pitfall 7)', () => {
    expect(strategyLogLine(at({ buyEnabled: true }), at({ crud: 'D' }))).toBe(
      '전략이 삭제됐어요 (매수·매도·자동취소가 모두 꺼졌어요)',
    );
  });

  it('⑧ 아무것도 안 바뀌면 null — 같은 줄을 반복해 쌓지 않는다', () => {
    expect(strategyLogLine(BASE, at({}))).toBeNull();
  });

  it('⑨ 여러 전이가 한 줄로 합쳐지고 순서는 매수 → 매도 → 취소 → 값 고정이다', () => {
    const line = strategyLogLine(
      BASE,
      at({ buyEnabled: true, sellEnabled: true, cancelQtyEnabled: true, buyWatchQty: 8_000 }),
    );
    expect(line).toBe(
      '매수주문 무장 · 매도 무장 — 대기 (지지벽 미관측) · 매수 미체결 자동취소 무장 · 서버 반영 완료',
    );
  });
});

describe('serverMessageLogLine / strategiesDisabledLogLine', () => {
  it('⑩ ERROR 는 「거부」로 쓰고 서버 원문을 **그대로** 싣는다 (D-36 · PC-7)', () => {
    const out = serverMessageLogLine(
      msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '허용되지 않은 거래소입니다' }),
    );
    expect(out.level).toBe('error');
    // ★ 17-11 — 출처 배지가 접두로 붙었다(D-17). 「거부」 문구와 서버 원문은 그대로다.
    expect(out.text).toBe('[서버] 서버가 거부했어요 (SetLimitChaser) — 허용되지 않은 거래소입니다');
  });

  it('⑪ INFO 는 통지로 남고 레벨이 error 가 아니다', () => {
    const out = serverMessageLogLine(msg({ m: '세션에 참여했습니다', src: 'System' }));
    expect(out.level).toBe('info');
    expect(out.text).toContain('세션에 참여했습니다');
  });

  it('⑫ 65(전부 정지 집계 응답) 문구는 전부 정지를 말하고 「장 마감 규칙」이라고 하지 않는다 (quick-260926-nr2)', () => {
    // ★ 65 는 gh-trade ProcessDisableStrategies 의 집계 응답뿐이다 — 15:40 과 무관하다.
    expect(strategiesDisabledLogLine()).toBe(
      '전부 정지가 반영됐어요 · 서버가 모든 전략을 비활성화했어요',
    );
    expect(strategiesDisabledLogLine()).not.toContain('장 마감');
  });

  it('⑫b 15:40 KRX 자동 해제 문구는 KRX 로 좁힌 장 마감 규칙이다 (quick-260926-nr2)', () => {
    expect(marketCloseDisabledLogLine()).toBe(
      '서버가 KRX 전략을 자동 비활성화했어요 (장 마감 규칙)',
    );
  });
});

describe('S→C 전용 필드 · 값 변경 판정 · 런타임 전용 에코 (quick-260926-nr2)', () => {
  it('LIMIT_CHASER_SERVER_ONLY_FIELDS 는 정확히 10개이고 COUNTER(3) ∪ LATCH(2) ∪ RUNTIME(5) 와 같다 (Phase 24)', () => {
    expect(LIMIT_CHASER_SERVER_ONLY_FIELDS).toHaveLength(10);
    expect(LIMIT_CHASER_SERVER_COUNTER_FIELDS).toHaveLength(3);
    expect(LIMIT_CHASER_SERVER_LATCH_FIELDS).toHaveLength(2);
    expect(LIMIT_CHASER_SERVER_RUNTIME_FIELDS).toHaveLength(5);
    expect(new Set(LIMIT_CHASER_SERVER_ONLY_FIELDS)).toEqual(
      new Set([
        ...LIMIT_CHASER_SERVER_COUNTER_FIELDS,
        ...LIMIT_CHASER_SERVER_LATCH_FIELDS,
        ...LIMIT_CHASER_SERVER_RUNTIME_FIELDS,
      ]),
    );
  });

  it('Phase 24 D-13 — 런타임 5필드만 바뀐 에코는 런타임 전용이고 로그도 배너 판정도 없다', () => {
    const a = at({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1 });
    const b = {
      ...a,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
      extraBuyAbandoned: true,
      buy3Schema: 1,
    };
    expect(isRuntimeOnlyEcho(a, b)).toBe(true);
    expect(limitChaserValuesChanged(a, b)).toBe(false);
    expect(strategyLogLine(a, b)).toBeNull();
  });

  it('Phase 24 — 그룹 게이트 3종만 바뀐 에코는 「서버 반영 완료」 · 「다른 단말」이 아니다', () => {
    const a = at({ buyEnabled: true });
    for (const over of [
      { preBuyEnabled: true },
      { extraBuyEnabled: true },
      { postBuyEnabled: true },
    ]) {
      expect(limitChaserValuesChanged(a, { ...a, ...over })).toBe(false);
      expect(strategyLogLine(a, { ...a, ...over }) ?? '').not.toContain('서버 반영 완료');
    }
    // 사용자 설정 값(후매수 반등률)은 여전히 값 변경이다.
    expect(limitChaserValuesChanged(a, { ...a, postBuyReboundPct: 40 })).toBe(true);
  });

  it.each([
    ['sellOrderQty', { sellOrderQty: 42 }],
    ['sellQtyTrackBaseline', { sellQtyTrackBaseline: 9_000 }],
    ['cancelQtyTrackBaseline', { cancelQtyTrackBaseline: 7_000 }],
    ['name', { name: '삼성전자' }],
    ['code', { code: '005930' }],
  ] as const)('%s 만 바뀐 에코는 「서버 반영 완료」가 아니다 (null)', (_label, over) => {
    expect(strategyLogLine(BASE, at(over))).toBeNull();
    expect(limitChaserValuesChanged(BASE, at(over))).toBe(false);
  });

  it('limitChaserValuesChanged — 사용자 값(buyWatchQty)은 true, 게이트·래치만은 false', () => {
    expect(limitChaserValuesChanged(BASE, at({ buyWatchQty: 8_000 }))).toBe(true);
    expect(
      limitChaserValuesChanged(
        BASE,
        at({
          buyEnabled: true,
          sellEnabled: true,
          cancelQtyEnabled: true,
          cancelTradeEnabled: true,
          sellEntryLatched: true,
          cancelEntryLatched: true,
        }),
      ),
    ).toBe(false);
  });

  it('isRuntimeOnlyEcho — 동일 내용(새 객체)·카운터 3종만·name/code 만 다름 → true', () => {
    expect(isRuntimeOnlyEcho(BASE, BASE)).toBe(true);
    expect(isRuntimeOnlyEcho(BASE, { ...BASE })).toBe(true);
    expect(
      isRuntimeOnlyEcho(
        BASE,
        at({ sellOrderQty: 5, sellQtyTrackBaseline: 100, cancelQtyTrackBaseline: 200 }),
      ),
    ).toBe(true);
    expect(isRuntimeOnlyEcho(BASE, at({ name: '삼성전자', code: '005930' }))).toBe(true);
  });

  it('isRuntimeOnlyEcho — 래치·게이트·사용자 값이 다르면 false', () => {
    expect(isRuntimeOnlyEcho(BASE, at({ sellEntryLatched: true }))).toBe(false);
    expect(isRuntimeOnlyEcho(BASE, at({ cancelEntryLatched: true }))).toBe(false);
    expect(isRuntimeOnlyEcho(BASE, at({ buyEnabled: true }))).toBe(false);
    expect(isRuntimeOnlyEcho(BASE, at({ cancelTradeEnabled: true }))).toBe(false);
    expect(isRuntimeOnlyEcho(BASE, at({ buyWatchQty: 8_000 }))).toBe(false);
    expect(isRuntimeOnlyEcho(BASE, at({ crud: 'D' }))).toBe(false);
  });
});

describe('echoAnswersSent — 이 에코가 보낸 제출의 답인가 (GC-WR-01)', () => {
  /** 에코 → 실제 `lc.set` 입력 모양(S→C 전용 · 파생 필드 제외) — 카드 `pendingRef` 에 서는 값과 같다. */
  const inputOf = (e: RelayLimitChaser): RelayLimitChaserInput => {
    const drop = new Set<string>([
      ...LIMIT_CHASER_SERVER_ONLY_FIELDS,
      'key',
      'market',
      'name',
      'code',
      'buyWatchSide',
    ]);
    return Object.fromEntries(
      Object.entries(e).filter(([k]) => !drop.has(k)),
    ) as unknown as RelayLimitChaserInput;
  };
  const OFF = at({ buyEnabled: false, preBuyEnabled: false, sellEnabled: false });
  const REQ = inputOf(
    at({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true, sellOrderPrice: 150_800 }),
  );

  it.each([
    [
      '부분 거부 — 매도만 눕혀지고 선매수 · 마스터 · 상한가 채움은 섰다 → 답',
      OFF,
      REQ,
      at({ buyEnabled: true, preBuyEnabled: true, sellEnabled: false, sellOrderPrice: 150_800 }),
      true,
    ],
    [
      '요청 변화 전부가 섰다 → 답',
      OFF,
      REQ,
      at({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true, sellOrderPrice: 150_800 }),
      true,
    ],
    [
      '요청 변화 중 하나만(값 필드) 섰다 → 답',
      OFF,
      REQ,
      at({ sellOrderPrice: 150_800 }),
      true,
    ],
    [
      '요청 변화가 하나도 서지 않은 에코(다른 단말의 매도 매수잔량 변경) → 답 아님',
      OFF,
      REQ,
      { ...OFF, sellWatchQty: 330_000 },
      false,
    ],
    [
      '요청 변화가 없는 제출(서버 값 그대로) → 에코가 무엇을 싣든 답 아님',
      OFF,
      inputOf(OFF),
      at({ buyEnabled: true, preBuyEnabled: true }),
      false,
    ],
    [
      '식별 3종 · crud 차이는 요청 변화가 아니다 → 답 아님',
      OFF,
      inputOf({ ...OFF, crud: 'D' }),
      { ...OFF, crud: 'D' },
      false,
    ],
  ] as const)('%s', (_label, prev, sent, next, expected) => {
    expect(echoAnswersSent(prev, sent, next)).toBe(expected);
  });

  it('직전 에코가 없으면(첫 스냅샷 · 등록) 답이다', () => {
    expect(echoAnswersSent(null, REQ, at({ buyEnabled: true }))).toBe(true);
  });

  it('Pitfall 8 — 후매수 단계 전이 에코(1 → 2)의 override 값이 우연히 내 요청과 같아도 답이 아니다 · 전이 없으면 답이다', () => {
    const armed = at({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1 });
    const sent = inputOf({ ...armed, sellWatchQty: 264_000, sellOrderPrice: 150_800 });
    const fired = {
      ...armed,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      // D-38 — 서버 override = 발동잔량 × 80%(330,000 → 264,000). 내 요청과 우연히 같은 값이다.
      sellWatchQty: 264_000,
      sellOrderPrice: 150_800,
    };
    expect(echoAnswersSent(armed, sent, fired)).toBe(false);
    // 이탈(2 → 1)도 전이다.
    expect(echoAnswersSent({ ...fired }, inputOf({ ...fired, sellWatchQty: 10 }), { ...armed, sellWatchQty: 10 })).toBe(false);
    // 단계 전이가 없으면 같은 필드 변화는 내 요청의 답이다.
    expect(echoAnswersSent(armed, sent, { ...armed, sellWatchQty: 264_000 })).toBe(true);
  });

  it('override 밖 요청 변화는 단계 전이 에코에서도 판정한다', () => {
    const armed = at({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1 });
    const sent = inputOf({ ...armed, postBuyReboundPct: 40 });
    expect(
      echoAnswersSent(armed, sent, { ...armed, postBuyPhase: 2, postBuyReboundPct: 40 }),
    ).toBe(true);
  });
});

describe('isLimitChaserServerMessage — 상따/VI 몫 판정 (Pitfall 9)', () => {
  it('⑬ SetLimitChaser 는 상따, 종목 없는 Account 통지는 VI 몫이라 상따가 표시하지 않는다', () => {
    expect(isLimitChaserServerMessage(msg({ src: 'SetLimitChaser', i: '' }))).toBe(true);
    expect(isLimitChaserServerMessage(msg({ src: 'Account', i: 'KR7005930003' }))).toBe(true);
    // ★ 종목이 없는 계좌 통지 = VI 몫. 여기서 그리면 사용자가 멀쩡한 상따를 껐다 켠다.
    expect(isLimitChaserServerMessage(msg({ src: 'Account', i: '' }))).toBe(false);
    expect(isLimitChaserServerMessage(msg({ src: 'System', i: '' }))).toBe(false);
  });

  /*
    ★ 17-11 — `src === "LimitChaser"`(상따 **런타임 사유 줄**) 는 상따 화면의 몫이다.
      17-01 이 `src` 어휘에 더했지만 받아 주는 판정이 없어 **한 글자도 그려지지 않았다**
      (17-06 이 VI 쪽에서 같은 결손을 발견하고 `VITrigger` 만 열었다 — `LimitChaser` 를
      VI 가 받는 것은 Pitfall 9 위반이라 그쪽에 열지 않았고, 이 화면이 그 소비처다).
  */
  it('⑬b ★ `LimitChaser` 런타임 사유 줄은 상따 몫이고, VI 몫으로는 새지 않는다 (Pitfall 9)', () => {
    expect(isLimitChaserServerMessage(msg({ src: 'LimitChaser', i: '' }))).toBe(true);
    expect(isLimitChaserServerMessage(msg({ src: 'LimitChaser', i: 'KR7005930003' }))).toBe(true);
    // VI 화면은 여전히 그리지 않는다 — 남의 거부를 내 거부로 그리지 않는다.
    expect(isViServerMessage(msg({ src: 'LimitChaser', i: '' }))).toBe(false);
    expect(isViServerMessage(msg({ src: 'VITrigger', i: '' }))).toBe(true);
  });
});

/*
  Phase 17 Plan 11 Task 2 — 래치 전이 4종 · 값 변경 skip · 출처 배지 (D-17 · D-23).

  여기서 잠그는 것:
    ① 취소 래치 ON/해제가 **각자의 문장**을 갖는가 (매도와 대구). 매수 래치 전이는
       Phase 24 D-12 로 사라졌다(서버 봉인).
    ② ★ 래치만 바뀐 에코가 「서버 반영 완료」로 보고되지 않는가 — 보고되면 사용자는
       **자기가 하지도 않은 수정이 반영됐다**고 읽는다 (T-17-39)
    ③ 첫 스냅샷 규율이 매도·취소 **두 축에서 같은가** — 한쪽만 다르면 같은 상태가
       축마다 다르게 보고된다(매수는 래치가 없어 무장 문장만)
    ④ 두 표(`TRANSITION_TEXT`/`TRANSITION_ORDER`)가 **닫힌 집합으로 동형인가** — 문구만
       있고 아무도 만들지 않는 전이 / 전이는 나는데 문구가 없는 사건을 둘 다 막는다
*/
describe('⑰ 취소 래치 전이 2종 + skip 집합 (17-11 Task 2 · Phase 24 매수 래치 제거)', () => {
  it('⑰-1 취소 진입 래치 ON / 해제', () => {
    const armed = at({ cancelQtyEnabled: true });
    expect(strategyLogLine(armed, at({ cancelQtyEnabled: true, cancelEntryLatched: true }))).toBe(
      '취소 진입 래치 ON — 취소 판정 시작',
    );
    expect(strategyLogLine(at({ cancelQtyEnabled: true, cancelEntryLatched: true }), armed)).toBe(
      '취소 진입 래치 해제',
    );
  });

  it('⑰-2 매수 진입 래치 전이 문구 2종은 사라졌다 (Phase 24 D-12 · gh-trade D-25)', () => {
    const texts = Object.values(TRANSITION_TEXT);
    expect(texts).not.toContain('매수 진입 래치 ON — 잔량 항 판정 시작');
    expect(texts).not.toContain('매수 진입 래치 해제');
    expect(TRANSITION_ORDER as readonly string[]).not.toContain('buyLatched');
    expect(TRANSITION_ORDER as readonly string[]).not.toContain('buyUnlatched');
  });

  it('⑰-3 ★ 래치 두 필드**만** 바뀐 에코는 「서버 반영 완료」를 내지 않는다 (T-17-39)', () => {
    const line = strategyLogLine(
      BASE,
      at({ cancelEntryLatched: true, sellEntryLatched: true }),
    );
    expect(line).not.toBeNull();
    expect(line).not.toContain('서버 반영 완료');
    // 두 래치 문장만 남는다.
    expect(line).toBe('매도 진입 래치 ON — 감시 시작 · 취소 진입 래치 ON — 취소 판정 시작');
  });

  it('⑰-4 값이 함께 바뀌면 그때는 「서버 반영 완료」가 붙는다 — skip 이 값 축까지 먹지 않는다', () => {
    expect(strategyLogLine(BASE, at({ cancelEntryLatched: true, cancelWatchQty: 99 }))).toBe(
      '취소 진입 래치 ON — 취소 판정 시작 · 서버 반영 완료',
    );
  });

  it('⑰-5 ★ 첫 스냅샷 규율이 매도·취소 두 축에서 **같다** (실측 기준: 매도) — 매수는 무장 문장만', () => {
    // 매도는 래치가 켜져 있으면 등록 줄에 래치 문장을 쓴다 — 그것이 기존 규율이다.
    expect(strategyLogLine(null, at({ sellEnabled: true, sellEntryLatched: true }))).toBe(
      '전략이 등록됐어요 · 매도 진입 래치 ON — 감시 시작',
    );
    expect(
      strategyLogLine(null, at({ cancelQtyEnabled: true, cancelEntryLatched: true })),
    ).toBe('전략이 등록됐어요 · 취소 진입 래치 ON — 취소 판정 시작');
    expect(strategyLogLine(null, at({ buyEnabled: true, buyWatchSide: '1' }))).toBe(
      '전략이 등록됐어요 · 매수주문 무장',
    );
    // 래치가 꺼져 있으면 무장 문장으로 떨어진다.
    expect(strategyLogLine(null, at({ cancelQtyEnabled: true }))).toBe(
      '전략이 등록됐어요 · 매수 미체결 자동취소 무장',
    );
  });

  it('⑰-6 ★ 두 표가 26종 닫힌 집합으로 동형이다 — 문구/전이가 한쪽만 늘지 않는다 (Phase 24: −buyFired +그룹 6 +동반 6 +서버 접힘 1)', () => {
    expect(TRANSITION_ORDER).toHaveLength(26);
    expect(Object.keys(TRANSITION_TEXT)).toHaveLength(26);
    // 중복 없음 + 두 표의 원소 집합이 정확히 같다.
    expect(new Set(TRANSITION_ORDER).size).toBe(26);
    expect([...TRANSITION_ORDER].sort()).toEqual(Object.keys(TRANSITION_TEXT).sort());
  });

  it('⑰-7 한 줄 안의 순서는 매수 → 매도 → 취소 축을 지킨다 (래치도 제자리)', () => {
    const line = strategyLogLine(
      at({ buyEnabled: true, buyWatchSide: '1', sellEnabled: true, cancelQtyEnabled: true }),
      at({
        buyEnabled: false,
        buyWatchSide: '1',
        sellEnabled: true,
        sellEntryLatched: true,
        cancelQtyEnabled: true,
        cancelEntryLatched: true,
      }),
    );
    expect(line).toBe(
      '매수주문 무장 해제 · 매도 진입 래치 ON — 감시 시작 · 취소 진입 래치 ON — 취소 판정 시작',
    );
  });
});

describe('⑱ 서버 통지 출처 배지 (D-17)', () => {
  it('⑱-1 `LimitChaser` 사유 줄은 `[상따]` 로 시작하고 원문 어휘를 두 번 말하지 않는다', () => {
    const out = serverMessageLogLine(
      msg({ lv: 'ERROR', src: 'LimitChaser', m: '매도 무장이 꺼져 있습니다 — 매도 감시를 먼저 켜세요' }),
    );
    expect(out.text).toBe(
      '[상따] 서버가 거부했어요 — 매도 무장이 꺼져 있습니다 — 매도 감시를 먼저 켜세요',
    );
    expect(out.text).not.toContain('(LimitChaser)');
    expect(out.level).toBe('error');
  });

  it('⑱-2 `VITrigger` 는 `[VI]`, 그 밖은 `[서버]` + 원문 src 를 그대로 남긴다', () => {
    expect(serverMessageLogLine(msg({ src: 'VITrigger', m: 'VI 발동' })).text).toBe(
      '[VI] 서버 통지 — VI 발동',
    );
    // 배지가 출처를 이름으로 말하지 못하는 어휘는 원문 src 가 유일한 단서다 — 남긴다.
    expect(
      serverMessageLogLine(msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '허용되지 않은 거래소입니다' }))
        .text,
    ).toBe('[서버] 서버가 거부했어요 (SetLimitChaser) — 허용되지 않은 거래소입니다');
  });
});

/*
  Phase 24 Plan 05 Task 1 — 그룹 전이 · D-01/D-02 동반 문구 · D-02 후반 · override 귀속 (⑨ · D-13).

  여기서 잠그는 것:
    ① 그룹 게이트 3종이 각자 「무장」/「무장 해제」 문장을 갖는다(클라 합성은 게이트 전이만)
    ② D-01/D-02 동반 문장은 **내가 보낸 cfg(`sent`)** 가 둘 다 실었을 때만 — 그 에코의 마스터 ·
       그룹 전이 문장을 **대신**한다(같은 사건을 두 줄로 쓰지 않는다). `sent === null`(다른 단말)은
       종전 전이 문장 둘
    ③ D-02 후반 자동 끔은 **보낸 사유(`sentCause: 'serverFold'`)** 로만 — 사유 없는 같은 전이 ·
       WinForms 가 먼저 보낸 에코(`sent === null`)는 「매수주문 무장 해제」(발주 아님)
    ④ 런타임 4필드만 바뀐 에코는 0줄 · 발동/재진입 전이의 override 4필드는 「서버 반영 완료」가 아니다
    ⑤ 서버 사유 · 거부 원문은 파싱 없이 통과한다(D-13 · D-18)
*/
describe('Phase 24 ⑨ — 그룹 전이 · 동반 문구 · override 귀속 (24-05)', () => {
  const ON = at({ buyEnabled: true });
  const OFF = BASE;
  /** 보낸 cfg — 입력 계약은 S→C 전용 필드를 뺀 모양이지만 판정은 게이트만 읽는다. */
  const sentOf = (over: Partial<RelayLimitChaser>) =>
    ({ ...BASE, ...over }) as unknown as RelayLimitChaserInput;

  it('G-1 그룹 게이트 3종 × 무장 / 무장 해제 = 6문장', () => {
    expect(strategyLogLine(ON, { ...ON, preBuyEnabled: true })).toBe('선매수 무장');
    expect(strategyLogLine({ ...ON, preBuyEnabled: true }, ON)).toBe('선매수 무장 해제');
    expect(strategyLogLine(ON, { ...ON, extraBuyEnabled: true })).toBe('추가매수 무장');
    expect(strategyLogLine({ ...ON, extraBuyEnabled: true }, ON)).toBe('추가매수 무장 해제');
    expect(strategyLogLine(ON, { ...ON, postBuyEnabled: true })).toBe('후매수 무장');
    expect(strategyLogLine({ ...ON, postBuyEnabled: true }, ON)).toBe('후매수 무장 해제');
  });

  it('G-2 첫 스냅샷에서 켜진 그룹은 등록 줄에 무장 문장으로 붙는다', () => {
    expect(strategyLogLine(null, at({ buyEnabled: true, preBuyEnabled: true, postBuyEnabled: true }))).toBe(
      '전략이 등록됐어요 · 매수주문 무장 · 선매수 무장 · 후매수 무장',
    );
  });

  it('G-3 순서: 매수주문 → 선매수 → 추가매수 → 후매수 → 매도 → 취소 → 서버 반영 완료', () => {
    expect(
      strategyLogLine(OFF, at({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true })),
    ).toBe('매수주문 무장 · 선매수 무장 · 매도 무장 — 대기 (지지벽 미관측)');
    expect(
      strategyLogLine(
        OFF,
        at({
          buyEnabled: true,
          postBuyEnabled: true,
          extraBuyEnabled: true,
          cancelQtyEnabled: true,
          buyWatchQty: 8_000,
        }),
      ),
    ).toBe('매수주문 무장 · 추가매수 무장 · 후매수 무장 · 매수 미체결 자동취소 무장 · 서버 반영 완료');
  });

  it('D-01 내가 마스터 + 그룹을 함께 켜 보냈고 에코가 둘 다 ON → 「선매수 체크 — 매수주문도 켬」 한 줄', () => {
    const next = at({ buyEnabled: true, preBuyEnabled: true });
    const sent = sentOf({ buyEnabled: true, preBuyEnabled: true });
    expect(strategyLogLine(OFF, next, { sent })).toBe('선매수 체크 — 매수주문도 켬');
    // 추가 · 후매수도 같은 문법이다.
    expect(
      strategyLogLine(OFF, at({ buyEnabled: true, extraBuyEnabled: true }), {
        sent: sentOf({ buyEnabled: true, extraBuyEnabled: true }),
      }),
    ).toBe('추가매수 체크 — 매수주문도 켬');
    expect(
      strategyLogLine(OFF, at({ buyEnabled: true, postBuyEnabled: true }), {
        sent: sentOf({ buyEnabled: true, postBuyEnabled: true }),
      }),
    ).toBe('후매수 체크 — 매수주문도 켬');
  });

  it('D-01 ★ 보내지 않은 같은 에코(다른 단말) → 종전 전이 문장 둘 — 동반 문장을 지어내지 않는다', () => {
    const next = at({ buyEnabled: true, preBuyEnabled: true });
    expect(strategyLogLine(OFF, next, { sent: null })).toBe('매수주문 무장 · 선매수 무장');
    expect(strategyLogLine(OFF, next)).toBe('매수주문 무장 · 선매수 무장');
  });

  it('D-01 동반 문장은 다른 전이와 순서대로 이어진다 · 그룹을 싣지 않은 제출은 동반이 아니다', () => {
    const next = at({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true });
    expect(
      strategyLogLine(OFF, next, { sent: sentOf({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true }) }),
    ).toBe('선매수 체크 — 매수주문도 켬 · 매도 무장 — 대기 (지지벽 미관측)');
    // 마스터만 켜 보냈는데 다른 단말이 선매수를 함께 켠 에코 — 선매수는 내 제출이 아니다.
    expect(
      strategyLogLine(OFF, at({ buyEnabled: true, preBuyEnabled: true }), {
        sent: sentOf({ buyEnabled: true, preBuyEnabled: false }),
      }),
    ).toBe('매수주문 무장 · 선매수 무장');
  });

  it('D-02 전반: 마지막 그룹 OFF + 마스터 OFF 를 함께 보냈고 에코가 둘 다 OFF → 「후매수 해제 — 매수주문도 끔」', () => {
    const prev = at({ buyEnabled: true, postBuyEnabled: true, sellEnabled: true });
    const next = at({ buyEnabled: false, postBuyEnabled: false, sellEnabled: true });
    const sent = sentOf({ buyEnabled: false, postBuyEnabled: false, sellEnabled: true });
    expect(strategyLogLine(prev, next, { sent })).toBe('후매수 해제 — 매수주문도 끔');
    expect(
      strategyLogLine(at({ buyEnabled: true, preBuyEnabled: true }), OFF, {
        sent: sentOf({ buyEnabled: false, preBuyEnabled: false }),
      }),
    ).toBe('선매수 해제 — 매수주문도 끔');
    expect(
      strategyLogLine(at({ buyEnabled: true, extraBuyEnabled: true }), OFF, {
        sent: sentOf({ buyEnabled: false, extraBuyEnabled: false }),
      }),
    ).toBe('추가매수 해제 — 매수주문도 끔');
    // 보내지 않은 같은 에코는 종전 전이 문장 둘이다.
    expect(strategyLogLine(prev, next, { sent: null })).toBe('매수주문 무장 해제 · 후매수 무장 해제');
  });

  it('D-02 전반 — 그 제출이 삭제(crud "D")면 기존 삭제 문장 하나', () => {
    const prev = at({ buyEnabled: true, postBuyEnabled: true });
    expect(
      strategyLogLine(prev, at({ crud: 'D' }), { sent: sentOf({ buyEnabled: false, postBuyEnabled: false, crud: 'D' }) }),
    ).toBe('전략이 삭제됐어요 (매수·매도·자동취소가 모두 꺼졌어요)');
  });

  it('D-02 후반: 서버 접힘 뒤 보낸 마스터 OFF(`serverFold`)의 에코 → 서버 접힘 문장이 「매수주문 무장 해제」를 대신한다', () => {
    // 세 그룹 OFF · 마스터 ON(서버 접힘 뒤) → 마스터 OFF 에코.
    const prev = at({ buyEnabled: true, sellEnabled: true });
    const next = at({ buyEnabled: false, sellEnabled: true });
    const sent = sentOf({ buyEnabled: false, sellEnabled: true });
    expect(strategyLogLine(prev, next, { sent, sentCause: 'serverFold' })).toBe(
      '서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔',
    );
    // 사유 없는 같은 전이 = 사용자가 마스터를 끈 것 → 종전 문장.
    expect(strategyLogLine(prev, next, { sent })).toBe('매수주문 무장 해제');
    expect(strategyLogLine(prev, next, { sent, sentCause: null })).toBe('매수주문 무장 해제');
    // WinForms 가 먼저 보낸 자동 끔(웹은 보내지 않음) — 발주 문장 없이 종전 문장.
    expect(strategyLogLine(prev, next, { sent: null, sentCause: null })).toBe('매수주문 무장 해제');
    // 사유가 있어도 에코가 마스터를 끄지 않았으면 서버 접힘 문장을 쓰지 않는다(거부 · 정규화).
    expect(strategyLogLine(prev, { ...prev, sellWatchQty: 11 }, { sent, sentCause: 'serverFold' })).toBe(
      '서버 반영 완료',
    );
  });

  it('D-34: 서버가 세 그룹 접힘과 함께 마스터도 내린 에코(보내지 않음) → 게이트 전이 문장만 · 서버 접힘 문장 없음', () => {
    // 사유(「매수주문 해제 — 선·추가·후매수가 모두 접힘」)는 서버 사유 줄이 원문으로 말한다(D-13) — 클라는 게이트 전이만.
    const prev = at({ buyEnabled: true, preBuyEnabled: true, sellEnabled: true });
    const next = at({ sellEnabled: true });
    expect(strategyLogLine(prev, next, { sent: null, sentCause: null })).toBe('매수주문 무장 해제 · 선매수 무장 해제');
  });

  it('D-13 런타임 4필드만 바뀐 에코 = 0줄(sent 가 있어도)', () => {
    const a = at({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1 });
    const b = {
      ...a,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
      extraBuyAbandoned: true,
    };
    expect(isRuntimeOnlyEcho(a, b)).toBe(true);
    expect(strategyLogLine(a, b)).toBeNull();
    expect(strategyLogLine(a, b, { sent: sentOf(a) })).toBeNull();
  });

  it('Pitfall 8 — POST_BUY_OVERRIDE_FIELDS 는 매도 · 취소 override 4필드다', () => {
    expect([...POST_BUY_OVERRIDE_FIELDS].sort()).toEqual(
      ['cancelWatchQty', 'sellOrderPrice', 'sellWatchPrice', 'sellWatchQty'].sort(),
    );
  });

  it('Pitfall 8 — 후매수 발동(단계 → 2) · 재진입(2 → 1) 에코의 override 값 변화는 서버 귀속 — 「서버 반영 완료」 없음', () => {
    const armed = at({
      buyEnabled: true,
      postBuyEnabled: true,
      postBuyPhase: 1,
      sellWatchQty: 10,
      cancelWatchQty: 10,
      sellWatchPrice: 0,
      sellOrderPrice: 0,
    });
    const fired = {
      ...armed,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      sellEnabled: true,
      cancelQtyEnabled: true,
      // D-38 — 서버 override = 발동잔량 × 80%(330,000 → 264,000).
      sellWatchQty: 264_000,
      cancelWatchQty: 264_000,
      sellWatchPrice: 13_000,
      sellOrderPrice: 13_000,
    };
    expect(limitChaserValuesChanged(armed, fired)).toBe(false);
    // 게이트 전이 문장은 종전대로 남는다.
    expect(strategyLogLine(armed, fired)).toBe(
      '매도 무장 — 대기 (지지벽 미관측) · 매수 미체결 자동취소 무장',
    );
    // 재진입(2 → 1) — cfg 로 되돌아가는 값도 서버 귀속이다.
    const reentered = { ...armed, postBuyPhase: 1, sellEnabled: true, cancelQtyEnabled: true };
    expect(limitChaserValuesChanged(fired, reentered)).toBe(false);
    expect(strategyLogLine(fired, reentered) ?? '').not.toContain('서버 반영 완료');
  });

  it('Pitfall 8 — 단계 전이 없는 같은 필드 변화(1 → 1 · 2 → 2)는 종전대로 값 변경이다', () => {
    const a = at({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1 });
    expect(limitChaserValuesChanged(a, { ...a, sellWatchQty: 330_000 })).toBe(true);
    expect(strategyLogLine(a, { ...a, sellWatchQty: 330_000 })).toBe('서버 반영 완료');
    const b = at({ postBuyPhase: 2, sellEnabled: true });
    expect(limitChaserValuesChanged(b, { ...b, cancelWatchQty: 9 })).toBe(true);
    // 발동 전이라도 override 밖의 사용자 값은 여전히 값 변경이다.
    expect(limitChaserValuesChanged(a, { ...a, postBuyPhase: 2, buyWatchQty: 8_000 })).toBe(true);
  });

  it('D-13 · D-18 · D-37 서버 사유 줄은 원문 그대로 배지 `[상따]` — 클라가 다시 쓰지 않는다', () => {
    for (const m of [
      '매수 10주 @13,000 — 후매수 — 매수1잔량 340,000 > 발동잔량 330,000',
      '추가매수 포기 — 매수1잔량 520000 > 최대 500000',
      '후매수 재진입 — 잔여 2회, 발동잔량 재계산',
      '후매수 소진 — 잔여 0회',
    ]) {
      const out = serverMessageLogLine(msg({ src: 'LimitChaser', m, i: 'KR7005930003' }));
      expect(out.text).toBe(`[상따] 서버 통지 — ${m}`);
      expect(out.level).toBe('info');
    }
  });

  it('D-18 SetLimitChaser 거부는 `[서버] 서버가 거부했어요 (SetLimitChaser) — ` + 원문', () => {
    const m = '추가매수 설정이 불완전합니다(최소 > 최대) — 추가매수를 켜지 않았습니다';
    const out = serverMessageLogLine(msg({ lv: 'ERROR', src: 'SetLimitChaser', m }));
    expect(out.text).toBe(`[서버] 서버가 거부했어요 (SetLimitChaser) — ${m}`);
    expect(out.level).toBe('error');
  });
});

describe('StrategyLog — 렌더', () => {
  const entries: StrategyLogEntry[] = [
    { id: '2', at: '13:44:02', text: '매수주문 무장 해제', level: 'info' },
    { id: '1', at: '13:42:11', text: '서버가 거부했어요 — 계좌 권한 없음', level: 'error' },
  ];

  it('⑭ 빈 상태 문구가 UI-SPEC verbatim 이다', () => {
    render(<StrategyLog entries={[]} />);
    expect(screen.getByText('아직 반영된 이벤트가 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('스위치를 켜거나 값을 수정하면 서버 응답이 여기에 쌓여요.'),
    ).toBeInTheDocument();
  });

  it('⑮ 시각 + 문장을 최신 상단으로 쌓고 ERROR 는 destructive 색이다', () => {
    const { container } = render(<StrategyLog entries={entries} />);

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="strategy-log-row"]'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('13:44:02');
    expect(rows[1].textContent).toContain('13:42:11');
    expect(rows[1].dataset.level).toBe('error');
    expect(rows[1].innerHTML).toContain('--destructive');
    expect(rows[0].innerHTML).not.toContain('--destructive');
  });

  /*
    ★ **뒤집힌 계약** (260911-w5h). 옛 캡션(「서버 에코 기준 · 새로고침 시 지워져요」)은
      제목 줄 우측에 붙어 모바일에서 제목을 두 줄로 접었고, 상시 표시 문구는 어차피
      다음번에 읽히지 않는다(T-16-86 과 같은 이유). 사용자가 **없앤다**로 확정했다 —
      아래로 내린 것이 아니라 컴포넌트 어디에도 없다.
  */
  it('⑯ 캡션 문구가 컴포넌트 어디에도 없고 목록은 160px 스크롤이다', () => {
    const { container } = render(<StrategyLog entries={entries} />);

    const root = container.querySelector('[data-slot="strategy-log"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(within(root).queryByText('서버 에코 기준 · 새로고침 시 지워져요')).toBeNull();
    expect(root.textContent).not.toContain('새로고침');
    // 제목은 그대로다 — 없앤 것은 캡션뿐이다.
    expect(within(root).getByRole('heading', { name: '전략 로그' })).toBeInTheDocument();

    const list = container.querySelector('[data-slot="strategy-log-list"]');
    expect(list?.className).toContain('max-h-[160px]');
    expect(list?.className).toContain('overflow-y-auto');

    /*
      ★ `mono` 는 **시각에만** 있다. 목록 전체가 mono 면 한글 로그 문장이 자간이 벌어진 채
        읽히고 좁은 폭에서 두세 줄로 접힌다 — 세로로 줄을 맞춰야 하는 것은 시각뿐이다.
    */
    expect(list?.className).not.toContain('mono');
    const row = container.querySelector('[data-slot="strategy-log-row"]') as HTMLElement;
    const spans = Array.from(row.querySelectorAll('span'));
    expect(spans[0]!.className).toContain('mono'); // 시각
    expect(spans[0]!.textContent).toBe('13:44:02');
    expect(spans[1]!.className).not.toContain('mono'); // 문장은 본문 폰트
  });
});

describe('StrategyLog embed — 빈 문구 override (quick-260923-onn)', () => {
  it('emptyTitle 을 넘기면 그 문구 · 없으면 종전 「아직 기록이 없어요」', () => {
    const { unmount } = render(<StrategyLog entries={[]} variant="embed" emptyTitle="로그 없음" />);
    expect(screen.getByText('로그 없음')).toBeInTheDocument();
    expect(screen.queryByText('아직 기록이 없어요')).toBeNull();
    unmount();
    render(<StrategyLog entries={[]} variant="embed" />);
    expect(screen.getByText('아직 기록이 없어요')).toBeInTheDocument();
  });
});
