import { describe, expect, it } from 'vitest';
import { LIMIT_CHASER_SERVER_ONLY_FIELDS } from '@gh-radar/shared';
import type { RelayLimitChaser } from '@gh-radar/shared';

/**
 * Phase 16 Plan 12 — 상따 순수 함수 계약 검증 (TRADE-01).
 *
 * 잠그는 규칙:
 *   - 매수수량은 **금액 → 수량** 한 방향으로만 산출한다. **역산 금지** — 수량×가격÷10000 은
 *     나머지 손실로 왕복이 깨진다(gh-trade 실측 사고: 무장 수량 2주 → 598주).
 *   - 큰 금액에서 **uint 래핑이 없다** — 10억 이상도 정확한 정수를 돌려준다.
 *   - 전략 키는 서버 `strncpy(..., 12)` 와 동형으로 **isin·accountNo 를 12자로 절단**한다.
 *   - 더티 비교 대상에 **S→C 전용 4필드가 없다**(Pitfall 6) — 있으면 서버가 계산한 값이
 *     사용자 미반영 변경으로 둔갑해 액션 바가 영원히 떠 있는다.
 *   - `buyOrderAmount === 0` 은 「서버가 모른다」다(Pitfall 11) — 비교에서 빠지고 폼도 덮지 않는다.
 *   - 삭제 판정에 **취소 게이트가 포함**된다(Pitfall 7) — 매수·매도만 보면 살아 있는 전략을
 *     지운다고 오표시한다.
 */

import {
  DIRTY_COMPARED_FIELDS,
  buyOrderQtyFromAmount,
  crudOf,
  defaultLimitChaserForm,
  dirtyFieldsOf,
  estimatedSellQty,
  exchangeLabeledName,
  formFromServer,
  isDeleteIntent,
  isLimitChaserArmRejection,
  isLimitChaserSetRejection,
  isMarketCloseReleaseNotice,
  limitChaserGateDisarmed,
  marketCloseReleaseKeysOf,
  parseStrategyKey,
  seedListSharesDefaults,
  preBuyAutoCheckLogLine,
  preBuyAutoChecksOf,
  seedFromUpperLimit,
  strategyKey,
  type LimitChaserFormValues,
} from '../limit-chaser';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';

const ISIN = 'KR7005930003';
const ACCOUNT = '1234567890';

/** 서버 에코 1건 — 폼 기본값과 **완전히 같은** 상태로 시작한다(더티 0 기준선). */
function serverEcho(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  const form = defaultLimitChaserForm();
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    crud: 'C',
    exchange: 'KRX',
    key: `${ISIN}:${ACCOUNT}:KRX`,
    buyOrderQty: 0,
    // 감시대상 — 읽기 전용 에코 필드(폼 값에는 없다 · Phase 24 ⑤). 새 서버 에코는 relay 가 "0" 으로 채운다.
    buyWatchSide: '0',
    // S→C 전용 4필드 — 서버만 채운다.
    sellOrderQty: 0,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    ...LC_BUY3_ECHO_DEFAULTS,
    // 클라 고정 3
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    ...form,
    ...over,
  };
}

describe('buyOrderQtyFromAmount — 매수수량 산출 (유일 지점)', () => {
  it('10만원 ÷ 30,000원 = 3주 (내림)', () => {
    expect(buyOrderQtyFromAmount(10, 30_000)).toBe(3);
  });

  it('매수가격이 0 이면 0 주 — 나눗셈을 하지 않는다', () => {
    expect(buyOrderQtyFromAmount(10, 0)).toBe(0);
  });

  it('매수가격이 음수여도 0 주', () => {
    expect(buyOrderQtyFromAmount(10, -1)).toBe(0);
  });

  it('나머지는 언제나 **버린다** — 반올림하지 않는다', () => {
    // 10만원 ÷ 15,000 = 6.67주. 반올림하면 7주가 되고, 그 1주는 예수금 없이 나가는 주문이다.
    expect(buyOrderQtyFromAmount(10, 15_000)).toBe(6);
    // 10만원 ÷ 10,001 = 9.999주 → 9주. 올림도 아니다.
    expect(buyOrderQtyFromAmount(10, 10_001)).toBe(9);
  });

  it('큰 금액에서 uint 래핑이 없다 — 100억원 ÷ 1원 = 100억주', () => {
    // uint32 상한 4,294,967,295 를 넘는다. 래핑하면 1,410,065,408 이 나온다.
    expect(buyOrderQtyFromAmount(1_000_000, 1)).toBe(10_000_000_000);
  });

  it('역산 금지 — 나머지가 있는 금액도 금액→수량 한 방향만 본다', () => {
    // 10만원 ÷ 30,000 = 3주. 역산하면 3×30,000÷10,000 = 9(만원) 으로 금액이 줄어든다.
    const qty = buyOrderQtyFromAmount(10, 30_000);
    expect(qty * 30_000).toBeLessThan(10 * 10_000);
  });
});

describe('strategyKey — 전략 키 조립 (유일 지점)', () => {
  it('`{isin}:{accountNo}:{exchange}` 로 조립한다', () => {
    expect(strategyKey(ISIN, ACCOUNT, 'KRX')).toBe('KR7005930003:1234567890:KRX');
  });

  it('isin·accountNo 를 12자로 절단한다 — 서버 strncpy 와 동형', () => {
    expect(strategyKey(`${ISIN}XXXX`, '123456789012345', 'NXT')).toBe(
      'KR7005930003:123456789012:NXT',
    );
  });
});

describe('exchangeLabeledName — 거래소 꼬리 (GC-IN-04 · D-03)', () => {
  it('NXT 면 「{종목명} · NXT」 — 같은 종목 KRX·NXT 두 전략을 가른다', () => {
    expect(exchangeLabeledName('삼성전자', 'NXT')).toBe('삼성전자 · NXT');
  });

  it('KRX(기본 거래소)는 꼬리를 붙이지 않는다 — 기존 표면 문구 불변', () => {
    expect(exchangeLabeledName('삼성전자', 'KRX')).toBe('삼성전자');
  });

  it('이름이 ISIN 폴백이어도 NXT 면 꼬리가 붙는다', () => {
    expect(exchangeLabeledName(ISIN, 'NXT')).toBe(`${ISIN} · NXT`);
  });
});

describe('parseStrategyKey — 전략 키 분해 (strategyKey 의 짝)', () => {
  it('세 조각 + 화이트리스트 거래소만 통과한다 — 반쪽 파싱은 다른 계좌를 편집하게 만든다', () => {
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}:KRX`)).toEqual({
      isin: ISIN,
      accountNo: ACCOUNT,
      exchange: 'KRX',
    });
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}:NXT`)?.exchange).toBe('NXT');
  });

  it('형식이 어긋나면 null — 구분자 부족·초과, 빈 조각, 미지 거래소', () => {
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}`)).toBeNull();
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}:KRX:X`)).toBeNull();
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}:KOSPI`)).toBeNull();
    expect(parseStrategyKey(`:${ACCOUNT}:KRX`)).toBeNull();
    expect(parseStrategyKey(`${ISIN}::KRX`)).toBeNull();
    expect(parseStrategyKey('')).toBeNull();
  });

  it('왕복 — 조립 → 파싱 → 조립이 원래 키와 같다', () => {
    for (const exchange of ['KRX', 'NXT'] as const) {
      const key = strategyKey(ISIN, ACCOUNT, exchange);
      const parsed = parseStrategyKey(key);
      expect(parsed).not.toBeNull();
      expect(strategyKey(parsed!.isin, parsed!.accountNo, parsed!.exchange)).toBe(key);
    }
  });
});

describe('dirtyFieldsOf — 더티 판정 (유일 지점, D-06)', () => {
  it('서버값과 같으면 더티 0', () => {
    expect(dirtyFieldsOf(serverEcho(), defaultLimitChaserForm())).toEqual([]);
  });

  it('값이 다른 필드 이름만 돌려준다', () => {
    const form: LimitChaserFormValues = {
      ...defaultLimitChaserForm(),
      buyOrderPrice: 130_000,
      sellOrderRatio: 50,
    };
    expect(dirtyFieldsOf(serverEcho(), form).sort()).toEqual(
      ['buyOrderPrice', 'sellOrderRatio'].sort(),
    );
  });

  it('S→C 전용 10필드는 비교 대상이 아니다 (Pitfall 6 · Phase 24 런타임 5 포함)', () => {
    for (const f of LIMIT_CHASER_SERVER_ONLY_FIELDS) {
      expect(DIRTY_COMPARED_FIELDS as readonly string[]).not.toContain(f);
    }
    // 서버가 그 필드를 아무리 흔들어도 더티가 생기지 않는다.
    const noisy = serverEcho({
      sellOrderQty: 999,
      sellQtyTrackBaseline: 777,
      sellEntryLatched: true,
      cancelQtyTrackBaseline: 555,
      cancelEntryLatched: true,
      buy3Schema: 0,
      extraBuyAbandoned: true,
      postBuyTriggerQty: 330_000,
      postBuyReentryLeft: 2,
      postBuyPhase: 2,
    });
    expect(dirtyFieldsOf(noisy, defaultLimitChaserForm())).toEqual([]);
  });

  it('감시대상은 더티 대상이 아니다 — 서버 에코가 "1" 이어도 더티 0 (Phase 24 ⑤)', () => {
    expect(DIRTY_COMPARED_FIELDS as readonly string[]).not.toContain('buyWatchSide');
    expect(dirtyFieldsOf(serverEcho({ buyWatchSide: '1' }), defaultLimitChaserForm())).toEqual([]);
  });

  it('스위치 3종(매수·매도·한방)은 더티 대상이 아니다 — 즉시 전송이라 왕복 중 더티가 뜨면 안 된다', () => {
    for (const f of ['buyEnabled', 'sellEnabled', 'sweepEnabled'] as const) {
      expect(DIRTY_COMPARED_FIELDS).not.toContain(f);
    }
    const form: LimitChaserFormValues = { ...defaultLimitChaserForm(), buyEnabled: true };
    expect(dirtyFieldsOf(serverEcho(), form)).toEqual([]);
  });

  it('`buyOrderAmount === 0` 인 서버값은 비교에서 제외된다 — 「서버가 모른다」', () => {
    const form: LimitChaserFormValues = { ...defaultLimitChaserForm(), buyOrderAmount: 150 };
    expect(dirtyFieldsOf(serverEcho({ buyOrderAmount: 0 }), form)).toEqual([]);
    // 서버가 값을 아는 경우엔 정상적으로 더티가 잡힌다.
    expect(dirtyFieldsOf(serverEcho({ buyOrderAmount: 10 }), form)).toEqual(['buyOrderAmount']);
  });

  it('서버 에코가 아직 없으면(신규 폼) 더티 0 — 비교 기준선이 없다', () => {
    const form: LimitChaserFormValues = { ...defaultLimitChaserForm(), buyOrderPrice: 130_000 };
    expect(dirtyFieldsOf(null, form)).toEqual([]);
  });
});

describe('isDeleteIntent / crudOf — 삭제 판정 (D-08, Pitfall 7)', () => {
  it('매수·매도·취소 게이트가 전부 OFF 면 삭제', () => {
    expect(
      isDeleteIntent({
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
    ).toBe(true);
  });

  it('취소 게이트가 살아 있으면 전략이 남는다 — 삭제가 아니다', () => {
    expect(
      isDeleteIntent({
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: true,
        cancelTradeEnabled: false,
      }),
    ).toBe(false);
    expect(
      isDeleteIntent({
        buyEnabled: false,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: true,
      }),
    ).toBe(false);
  });

  it('매수·매도 중 하나라도 켜져 있으면 삭제가 아니다', () => {
    expect(
      isDeleteIntent({
        buyEnabled: true,
        sellEnabled: false,
        cancelQtyEnabled: false,
        cancelTradeEnabled: false,
      }),
    ).toBe(false);
  });

  it('crudOf 는 삭제 의도면 "D", 아니면 "C"', () => {
    expect(crudOf(defaultLimitChaserForm())).toBe('D');
    expect(crudOf({ ...defaultLimitChaserForm(), buyEnabled: true })).toBe('C');
  });
});

describe('seedFromUpperLimit — 상한가 5칸 시딩', () => {
  it('매수감시가·매수가격·매도감시가·매도가격·한방가격 5칸을 상한가로 채운다', () => {
    expect(seedFromUpperLimit(130_000)).toEqual({
      buyWatchPrice: 130_000,
      buyOrderPrice: 130_000,
      sellWatchPrice: 130_000,
      sellOrderPrice: 130_000,
      sweepWatchPrice: 130_000,
    });
  });
});

describe('defaultLimitChaserForm — WinForms 기본값', () => {
  it('감시잔량 10000 · 주문금액 4,000만원(D-04) · 최소체결 30000 · 매도호가잔량 10 · 잔량추적 55(D-04) · 매도비율 100 · 호가변경 3 · 취소잔량 10', () => {
    const d = defaultLimitChaserForm();
    expect(d.buyWatchQty).toBe(10_000);
    expect(d.buyOrderAmount).toBe(4000);
    expect(d.buyMinTradeQty).toBe(30_000);
    expect(d.sellWatchQty).toBe(10);
    expect(d.sellQtyTrackRatio).toBe(55);
    expect(d.sellMinTradeQty).toBe(30_000);
    expect(d.sellOrderRatio).toBe(100);
    expect(d.sweepMinTickCount).toBe(3);
    expect(d.cancelWatchQty).toBe(10);
  });

  it('게이트는 전부 false 이고 감시대상 키가 없다 (Phase 24 ⑤)', () => {
    const d = defaultLimitChaserForm();
    expect(d.buyEnabled).toBe(false);
    expect(d.sellEnabled).toBe(false);
    expect(d.sweepEnabled).toBe(false);
    expect(d.cancelQtyEnabled).toBe(false);
    expect(d.cancelTradeEnabled).toBe(false);
    expect(d.cancelQtyTrackEnabled).toBe(false);
    expect(d.buyTradeQtyEnabled).toBe(false);
    expect(d.sellTradeQtyEnabled).toBe(false);
    expect(d.sellQtyTrackEnabled).toBe(false);
    expect('buyWatchSide' in d).toBe(false);
  });

  it('호출마다 새 객체를 돌려준다 — 공유 참조를 수정하면 다음 신규 폼이 오염된다', () => {
    const a = defaultLimitChaserForm();
    a.buyOrderAmount = 999;
    expect(defaultLimitChaserForm().buyOrderAmount).toBe(4000);
  });
});

describe('estimatedSellQty — 예상 매도수량(표시 전용)', () => {
  it('매도가능 × 비율 ÷ 100 내림', () => {
    expect(estimatedSellQty(153, 50)).toBe(76);
    expect(estimatedSellQty(76, 100)).toBe(76);
    expect(estimatedSellQty(0, 100)).toBe(0);
  });
});

describe('formFromServer — 에코 → 폼 (D-11 서버값 우선)', () => {
  it('서버값을 그대로 폼으로 옮긴다', () => {
    const prev = defaultLimitChaserForm();
    const next = formFromServer(serverEcho({ buyOrderPrice: 130_000, sellOrderRatio: 40 }), prev);
    expect(next.buyOrderPrice).toBe(130_000);
    expect(next.sellOrderRatio).toBe(40);
  });

  it('옛 서버 에코의 감시대상은 폼으로 들이지 않는다 (Phase 24 ⑤)', () => {
    const next = formFromServer(serverEcho({ buyWatchSide: '1' }), defaultLimitChaserForm());
    expect('buyWatchSide' in next).toBe(false);
  });

  it('`buyOrderAmount === 0` 이면 금액 칸을 덮지 않는다 (Pitfall 11)', () => {
    const prev: LimitChaserFormValues = { ...defaultLimitChaserForm(), buyOrderAmount: 150 };
    expect(formFromServer(serverEcho({ buyOrderAmount: 0 }), prev).buyOrderAmount).toBe(150);
    expect(formFromServer(serverEcho({ buyOrderAmount: 20 }), prev).buyOrderAmount).toBe(20);
  });

  it('Phase 24 D-03 — 추가매수 · 후매수 금액 0 은 0 그대로 들어온다(이전 폼 값으로 메우지 않는다)', () => {
    const prev: LimitChaserFormValues = {
      ...defaultLimitChaserForm(),
      extraBuyOrderAmount: 4000,
      postBuyOrderAmount: 4000,
    };
    const next = formFromServer(
      serverEcho({ extraBuyOrderAmount: 0, postBuyOrderAmount: 0, postBuyReentry: 5 }),
      prev,
    );
    expect(next.extraBuyOrderAmount).toBe(0);
    expect(next.postBuyOrderAmount).toBe(0);
    expect(next.postBuyReentry).toBe(5);
    // 폼 값에는 파생 수량 · S→C 런타임이 없다.
    expect(next).not.toHaveProperty('extraBuyOrderQty');
    expect(next).not.toHaveProperty('postBuyOrderQty');
    expect(next).not.toHaveProperty('postBuyPhase');
  });

  it('Phase 24 — 신규 폼 기본값: 그룹 스위치 OFF · 금액 4,000만원 · 반등 30% · 하한 100,000주 · 3회', () => {
    expect(defaultLimitChaserForm()).toMatchObject({
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
  });
});

/**
 * `isLimitChaserSetRejection` — 「이 통지가 **내 `lc.set` 에 대한 서버의 답**인가」
 * (debug `lc-unacked-stuck-new-route`).
 *
 * 이 판정이 넓어지면 남의 답으로 내 「미반영」이 거둬진다 — 서버가 아직 아무 말도 안 했는데
 * 화면이 「답을 받았다」로 바뀌는 것이라, 사용자는 나가지도 않은 전략을 걸렸다고 믿는다.
 * 좁아지면 원래 사고(영구 「미반영」)로 되돌아간다. **양쪽 경계를 같이 잠근다.**
 */
describe('isLimitChaserSetRejection — 내 요청의 답인가 (debug lc-unacked-stuck-new-route)', () => {
  const ISIN = 'KR7005930003';
  const ACCT = '37728502101';
  const base = { src: 'SetLimitChaser', i: ISIN, a: ACCT, lv: 'ERROR' };

  it('세 축이 모두 맞으면 답이다', () => {
    expect(isLimitChaserSetRejection(base, ISIN, ACCT)).toBe(true);
  });

  it('`lv` 가 ERROR 가 아니면 답이 아니다 — INFO 통지는 요청과 무관하게 흐른다', () => {
    expect(isLimitChaserSetRejection({ ...base, lv: 'INFO' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, lv: 'WARN' }, ISIN, ACCT)).toBe(false);
  });

  it('★ `src` 는 `SetLimitChaser` 뿐이다 — 인접 어휘를 답으로 읽지 않는다', () => {
    // `LimitChaser`(런타임 사유)·`Account`(계좌 통지)는 표시 몫이지만 **내 요청의 답은 아니다**.
    // 넓히면 체결 통지 한 줄에 「미반영」이 거둬져 거짓 안심이 된다.
    expect(isLimitChaserSetRejection({ ...base, src: 'LimitChaser' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, src: 'Account' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, src: 'Relay' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, src: 'SetVITrigger' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, src: 'System' }, ISIN, ACCT)).toBe(false);
    // 동등 비교만 한다 — 부분일치로 넓히면 아래가 통과해 버린다.
    expect(isLimitChaserSetRejection({ ...base, src: 'SetLimitChaserX' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, src: 'setlimitchaser' }, ISIN, ACCT)).toBe(false);
  });

  it('★ 종목·계좌 **둘 다** 맞아야 한다 — 한 축만 보면 남의 전략 답이 내 답이 된다', () => {
    expect(isLimitChaserSetRejection({ ...base, i: 'KR7000660001' }, ISIN, ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, a: '99999999999' }, ISIN, ACCT)).toBe(false);
  });

  it('★ 전략 키가 반쪽이면 답이 아니다 — 빈 축을 「같다」로 접으면 아무 통지나 통과한다', () => {
    // 종목을 아직 안 고른 신규 화면이 정확히 이 상태다(`isin === ""`).
    expect(isLimitChaserSetRejection({ ...base, i: '' }, '', ACCT)).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, a: '' }, ISIN, '')).toBe(false);
    expect(isLimitChaserSetRejection({ ...base, i: '', a: '' }, '', '')).toBe(false);
  });
});

describe('isLimitChaserArmRejection — 내 lc.arm 의 거부 답인가 (quick-260926-nr2)', () => {
  const m = (over: Partial<{ src: string; i: string; a: string; lv: string; kind: string }>) => ({
    src: 'System',
    i: '',
    a: '',
    lv: 'WARN',
    kind: '',
    ...over,
  });

  it('(a) 게이트웨이 36/37 거부 — System WARN · i/a/kind 빈 값 → true', () => {
    expect(isLimitChaserArmRejection(m({}), ISIN, ACCOUNT)).toBe(true);
    expect(isLimitChaserArmRejection(m({ lv: 'ERROR' }), ISIN, ACCOUNT)).toBe(true);
  });

  it('System INFO → false · System WARN + kind Purge(15:40 통지) → false', () => {
    expect(isLimitChaserArmRejection(m({ lv: 'INFO' }), ISIN, ACCOUNT)).toBe(false);
    expect(isLimitChaserArmRejection(m({ kind: 'Purge' }), ISIN, ACCOUNT)).toBe(false);
    // 종목·계좌가 실린 System 통지는 arm 거부 모양이 아니다.
    expect(isLimitChaserArmRejection(m({ i: ISIN }), ISIN, ACCOUNT)).toBe(false);
  });

  it('(b) relay 게이트웨이 전 거부 — Relay ERROR · i 빈 값 · a 가 빈 값 또는 이 계좌 → true', () => {
    expect(isLimitChaserArmRejection(m({ src: 'Relay', lv: 'ERROR' }), ISIN, ACCOUNT)).toBe(true);
    expect(
      isLimitChaserArmRejection(m({ src: 'Relay', lv: 'ERROR', a: ACCOUNT }), ISIN, ACCOUNT),
    ).toBe(true);
    // 다른 계좌 축은 내 답이 아니다.
    expect(
      isLimitChaserArmRejection(m({ src: 'Relay', lv: 'ERROR', a: '9999999999' }), ISIN, ACCOUNT),
    ).toBe(false);
    // relay 의 lc.arm 거부는 i 를 싣지 않는다(fanout 실측) — i 가 실린 것은 lc.set 경로다.
    expect(
      isLimitChaserArmRejection(m({ src: 'Relay', lv: 'ERROR', i: ISIN }), ISIN, ACCOUNT),
    ).toBe(false);
  });

  it('(c) LimitChaser WARN — 같은 isin → true, 다른 isin → false', () => {
    expect(isLimitChaserArmRejection(m({ src: 'LimitChaser', i: ISIN }), ISIN, ACCOUNT)).toBe(true);
    expect(
      isLimitChaserArmRejection(m({ src: 'LimitChaser', i: 'KR7000660001' }), ISIN, ACCOUNT),
    ).toBe(false);
  });

  it('SetLimitChaser 는 lc.set 의 답이지 arm 의 답이 아니다 → false', () => {
    expect(
      isLimitChaserArmRejection(
        m({ src: 'SetLimitChaser', lv: 'ERROR', i: ISIN, a: ACCOUNT }),
        ISIN,
        ACCOUNT,
      ),
    ).toBe(false);
  });

  it('isin 또는 accountNo 가 빈 값이면 false', () => {
    expect(isLimitChaserArmRejection(m({}), '', ACCOUNT)).toBe(false);
    expect(isLimitChaserArmRejection(m({}), ISIN, '')).toBe(false);
  });
});

describe('15:40 KRX 해제 판정 — 통지 · 대기 키 · 게이트 해제 (quick-260926-nr2)', () => {
  it('isMarketCloseReleaseNotice — src System + kind Purge 만 true', () => {
    expect(isMarketCloseReleaseNotice({ src: 'System', kind: 'Purge' })).toBe(true);
    // PurgeAllStrategies 의 Broadcast 는 source 가 없다.
    expect(isMarketCloseReleaseNotice({ src: '', kind: 'Purge' })).toBe(false);
    expect(isMarketCloseReleaseNotice({ src: 'System', kind: '' })).toBe(false);
    expect(isMarketCloseReleaseNotice({ src: 'LimitChaser', kind: 'Purge' })).toBe(false);
  });

  it('marketCloseReleaseKeysOf — KRX 이고 게이트가 하나라도 켜진 전략만', () => {
    const krxBuy = serverEcho({ exchange: 'KRX', buyEnabled: true, key: 'A:1:KRX' });
    const krxCancel = serverEcho({ exchange: 'KRX', cancelTradeEnabled: true, key: 'B:1:KRX' });
    const krxOff = serverEcho({
      exchange: 'KRX',
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
      cancelTradeEnabled: false,
      key: 'C:1:KRX',
    });
    const nxtBuy = serverEcho({ exchange: 'NXT', buyEnabled: true, key: 'D:1:NXT' });
    expect(marketCloseReleaseKeysOf([krxBuy, krxCancel, krxOff, nxtBuy])).toEqual(
      new Set(['A:1:KRX', 'B:1:KRX']),
    );
  });

  it('limitChaserGateDisarmed — 매수 · 매도 · 취소 무장 중 하나라도 켜짐 → 꺼짐', () => {
    const off = serverEcho({
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
      cancelTradeEnabled: false,
    });
    expect(limitChaserGateDisarmed({ ...off, buyEnabled: true }, off)).toBe(true);
    expect(limitChaserGateDisarmed({ ...off, sellEnabled: true }, off)).toBe(true);
    expect(limitChaserGateDisarmed({ ...off, cancelQtyEnabled: true }, off)).toBe(true);
    // 취소 두 게이트 중 하나만 꺼져도 취소 무장은 남는다.
    expect(
      limitChaserGateDisarmed(
        { ...off, cancelQtyEnabled: true, cancelTradeEnabled: true },
        { ...off, cancelTradeEnabled: true },
      ),
    ).toBe(false);
    expect(limitChaserGateDisarmed(off, { ...off, buyEnabled: true })).toBe(false);
    expect(limitChaserGateDisarmed(off, { ...off, sellEntryLatched: true })).toBe(false);
  });
});

/**
 * 24-07 — 선매수 자동 체크(D-06 · D-07 · D-08 · D-20). WinForms `AutoCheckExitForPreBuy` 동형 + 웹 D-07 추가.
 *
 * 잠그는 규칙: 서버(§9 ②′) · relay 무장 가드가 **조용히 눕힐 조합은 켜지 않는다** — 켜지 않은 항목은 사유와 함께
 * 로그 한 줄(error)로 알린다. 이미 켜진 체크는 건드리지 않는다. 0 → 상한가 채움은 상한가를 알 때만(명시 값).
 */
describe('preBuyAutoChecksOf — 선매수 자동 체크 (24-07 D-06 · D-07 · D-20)', () => {
  /** 매도 · 취소 전부 OFF · 매도 가격 0(상한가로 채울 자리) · 나머지는 켤 수 있는 값. */
  const base = (over: Partial<LimitChaserFormValues> = {}): LimitChaserFormValues => ({
    ...defaultLimitChaserForm(),
    sellEnabled: false,
    sellQtyTrackEnabled: false,
    sellTradeQtyEnabled: false,
    cancelQtyEnabled: false,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    sellOrderPrice: 0,
    sellWatchPrice: 0,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellOrderRatio: 100,
    cancelWatchQty: 10,
    ...over,
  });
  const ALL = ['매도주문', '매도>잔량추적', '매도>체결', '취소', '취소>체결', '취소>잔량추적'];

  it('전부 켤 수 있음 · 상한가 13,000 → 6체크 true + 매도 주문가격 · 비교가격 = 상한가 · 순서 고정 · 생략 0', () => {
    const r = preBuyAutoChecksOf(base(), 13_000);
    expect(r.companions).toEqual({
      sellEnabled: true,
      sellQtyTrackEnabled: true,
      sellTradeQtyEnabled: true,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
      sellOrderPrice: 13_000,
      sellWatchPrice: 13_000,
    });
    expect(r.turnedOn).toEqual(ALL);
    expect(r.skipped).toEqual([]);
    expect(r.priceFilled).toBe(13_000);
  });

  it('상한가 0(미수신) → 매도주문 · 취소 3종은 「상한가 미수신」으로 켜지 않는다 · 매도>잔량추적 · 매도>체결은 켠다 · 가격 채움 없음', () => {
    const r = preBuyAutoChecksOf(base(), 0);
    expect(r.turnedOn).toEqual(['매도>잔량추적', '매도>체결']);
    expect(r.skipped).toEqual([
      { item: '매도주문', reason: '상한가 미수신' },
      { item: '취소', reason: '상한가 미수신' },
      { item: '취소>체결', reason: '상한가 미수신' },
      { item: '취소>잔량추적', reason: '상한가 미수신' },
    ]);
    expect(r.priceFilled).toBeNull();
    expect(r.companions).not.toHaveProperty('sellOrderPrice');
    expect(r.companions).not.toHaveProperty('sellWatchPrice');
    expect(r.companions).not.toHaveProperty('sellEnabled');
  });

  it('매도 가격이 이미 있으면 채우지 않는다(명시 값만 · priceFilled null)', () => {
    const r = preBuyAutoChecksOf(base({ sellOrderPrice: 12_000, sellWatchPrice: 12_500 }), 13_000);
    expect(r.priceFilled).toBeNull();
    expect(r.companions).not.toHaveProperty('sellOrderPrice');
    expect(r.turnedOn).toEqual(ALL);
  });

  it('매도 매수잔량 0 → 매도 3체크를 「매도 매수잔량 0」으로 켜지 않는다(웹 D-07 — relay sell 갈래가 프레임 전체를 거부) · 취소 계열은 켠다', () => {
    const r = preBuyAutoChecksOf(base({ sellWatchQty: 0 }), 13_000);
    expect(r.skipped).toEqual([
      { item: '매도주문', reason: '매도 매수잔량 0' },
      { item: '매도>잔량추적', reason: '매도 매수잔량 0' },
      { item: '매도>체결', reason: '매도 매수잔량 0' },
    ]);
    expect(r.turnedOn).toEqual(['취소', '취소>체결', '취소>잔량추적']);
    expect(r.companions).not.toHaveProperty('sellEnabled');
  });

  it('취소 매수잔량 0 → 취소 · 취소>잔량추적을 「취소 매수잔량 0」으로 켜지 않는다(서버 §9 ②′) · 취소>체결은 켠다', () => {
    const r = preBuyAutoChecksOf(base({ cancelWatchQty: 0 }), 13_000);
    expect(r.skipped).toEqual([
      { item: '취소', reason: '취소 매수잔량 0' },
      { item: '취소>잔량추적', reason: '취소 매수잔량 0' },
    ]);
    expect(r.turnedOn).toEqual(['매도주문', '매도>잔량추적', '매도>체결', '취소>체결']);
  });

  it('취소가 이미 켜져 있으면 취소 매수잔량과 무관하게 취소>잔량추적은 따라 켠다(취소 자신은 건드리지 않는다)', () => {
    const r = preBuyAutoChecksOf(base({ cancelQtyEnabled: true, sellOrderPrice: 13_000, sellWatchPrice: 13_000 }), 13_000);
    expect(r.turnedOn).toContain('취소>잔량추적');
    expect(r.turnedOn).not.toContain('취소');
    expect(r.companions).not.toHaveProperty('cancelQtyEnabled');
  });

  it('매도 체결 0 → 매도>체결 · 취소>체결을 「매도 체결 0」으로 켜지 않는다', () => {
    const r = preBuyAutoChecksOf(base({ sellMinTradeQty: 0 }), 13_000);
    expect(r.skipped).toEqual([
      { item: '매도>체결', reason: '매도 체결 0' },
      { item: '취소>체결', reason: '매도 체결 0' },
    ]);
    expect(r.turnedOn).toEqual(['매도주문', '매도>잔량추적', '취소', '취소>잔량추적']);
  });

  it('매도비율 0(레거시) → 매도주문만 「매도비율 0」으로 켜지 않는다', () => {
    const r = preBuyAutoChecksOf(base({ sellOrderRatio: 0 }), 13_000);
    expect(r.skipped).toEqual([{ item: '매도주문', reason: '매도비율 0' }]);
    expect(r.turnedOn).toEqual(['매도>잔량추적', '매도>체결', '취소', '취소>체결', '취소>잔량추적']);
  });

  it('이미 켜진 체크는 turnedOn · companions 어디에도 없다 · 전부 켜져 있으면 로그 줄 없음', () => {
    const on = base({
      sellEnabled: true,
      sellQtyTrackEnabled: true,
      sellTradeQtyEnabled: true,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
      sellOrderPrice: 13_000,
      sellWatchPrice: 13_000,
    });
    const r = preBuyAutoChecksOf(on, 13_000);
    expect(r.turnedOn).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.companions).toEqual({});
    expect(preBuyAutoCheckLogLine(r)).toBeNull();

    const some = preBuyAutoChecksOf(base({ sellEnabled: true, sellOrderPrice: 13_000, sellWatchPrice: 13_000 }), 13_000);
    expect(some.turnedOn).not.toContain('매도주문');
    expect(some.companions).not.toHaveProperty('sellEnabled');
  });

  it('입력 객체를 바꾸지 않는다(순수 함수)', () => {
    const v = base();
    const copy = { ...v };
    preBuyAutoChecksOf(v, 13_000);
    expect(v).toEqual(copy);
  });
});

describe('preBuyAutoCheckLogLine — 자동 체크 로그 한 줄 문법 (UI-SPEC · D-06 — 6줄 폭증 금지)', () => {
  const base = (over: Partial<LimitChaserFormValues> = {}): LimitChaserFormValues => ({
    ...defaultLimitChaserForm(),
    sellOrderPrice: 0,
    sellWatchPrice: 0,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellOrderRatio: 100,
    cancelWatchQty: 10,
    ...over,
  });

  it('생략 없음 → info · 「켬: …」 + 「매도 주문가격·비교가격 = 상한가 13,000원」', () => {
    expect(preBuyAutoCheckLogLine(preBuyAutoChecksOf(base(), 13_000))).toEqual({
      level: 'info',
      text: '선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 매도 주문가격·비교가격 = 상한가 13,000원',
    });
  });

  it('생략이 하나라도 있으면 error · 「켜지 않음: 항목(사유) · …」 조각', () => {
    expect(preBuyAutoCheckLogLine(preBuyAutoChecksOf(base({ cancelWatchQty: 0 }), 13_000))).toEqual({
      level: 'error',
      text:
        '선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소>체결 / 켜지 않음: 취소(취소 매수잔량 0) · 취소>잔량추적(취소 매수잔량 0) / 매도 주문가격·비교가격 = 상한가 13,000원',
    });
  });

  it('가격을 채우지 않았으면 가격 조각이 없다 · 한쪽만 채웠으면 그 칸 이름만', () => {
    const noFill = preBuyAutoCheckLogLine(preBuyAutoChecksOf(base({ sellOrderPrice: 12_000, sellWatchPrice: 12_000 }), 13_000));
    expect(noFill?.text).toBe('선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적');
    const orderOnly = preBuyAutoCheckLogLine(preBuyAutoChecksOf(base({ sellWatchPrice: 12_000 }), 13_000));
    expect(orderOnly?.text.endsWith(' / 매도 주문가격 = 상한가 13,000원')).toBe(true);
  });

  it('켤 것이 없고 생략만 있으면 「켬」 조각 없이 「켜지 않음」만(error)', () => {
    const r = preBuyAutoChecksOf(
      base({
        sellQtyTrackEnabled: true,
        sellTradeQtyEnabled: true,
        cancelTradeEnabled: true,
        sellOrderRatio: 0,
        cancelWatchQty: 0,
      }),
      13_000,
    );
    expect(preBuyAutoCheckLogLine(r)).toEqual({
      level: 'error',
      text: '선매수 자동 체크 — 켜지 않음: 매도주문(매도비율 0) · 취소(취소 매수잔량 0) · 취소>잔량추적(취소 매수잔량 0) / 매도 주문가격·비교가격 = 상한가 13,000원',
    });
  });
});

describe('D-04 새 전략 기본값 — WinForms 기본값 표 그대로 (24-07)', () => {
  it('선매수 · 추가매수 · 후매수 금액 각 4,000만원 · 반등 30% · 최소 100,000주 · 최대 3회 · 매도 매수잔량 10 · 잔량추적 55% · 취소 매수잔량 10 · 폴백 5칸 · 스위치 전부 OFF', () => {
    expect(defaultLimitChaserForm()).toMatchObject({
      buyOrderAmount: 4000,
      extraBuyOrderAmount: 4000,
      postBuyOrderAmount: 4000,
      postBuyReboundPct: 30,
      postBuyFloorQty: 100_000,
      postBuyReentry: 3,
      sellWatchQty: 10,
      sellQtyTrackRatio: 55,
      cancelWatchQty: 10,
      buyWatchQty: 10_000,
      buyMinTradeQty: 30_000,
      sellMinTradeQty: 30_000,
      extraBuyMinQty: 0,
      extraBuyMaxQty: 0,
      preBuyEnabled: false,
      extraBuyEnabled: false,
      postBuyEnabled: false,
      buyEnabled: false,
    });
  });
});

describe('seedListSharesDefaults — 상장주식수 5칸 시딩 (D-17 · WinForms SeedListSharesDefaults 동형)', () => {
  it('상장주식수를 모르면(0 · 음수) null — 폴백이 남고 가드를 소진하지 않는다', () => {
    expect(seedListSharesDefaults(0)).toBeNull();
    expect(seedListSharesDefaults(-1)).toBeNull();
  });

  it('1,000만주 → 0.3% = 30,000 · 3% = 300,000', () => {
    expect(seedListSharesDefaults(10_000_000)).toEqual({
      buyWatchQty: 30_000,
      buyMinTradeQty: 30_000,
      extraBuyMinQty: 30_000,
      extraBuyMaxQty: 300_000,
      sellMinTradeQty: 30_000,
    });
  });

  it('정수 내림 — 5,969,782,550주 → 3% = 179,093,476 · 0.3% = 17,909,347', () => {
    const r = seedListSharesDefaults(5_969_782_550)!;
    expect(r.extraBuyMaxQty).toBe(179_093_476);
    expect(r.buyWatchQty).toBe(17_909_347);
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
  });

  it('추가매수 최소 · 최대는 uint32 상한(4,294,967,295)에서 멈춘다', () => {
    const r = seedListSharesDefaults(200_000_000_000)!;
    expect(r.extraBuyMaxQty).toBe(4_294_967_295);
    expect(r.extraBuyMinQty).toBe(600_000_000);
  });

  it('작은 값도 정수 내림 — 333주 → 0.3% = 0 · 3% = 9', () => {
    expect(seedListSharesDefaults(333)).toEqual({
      buyWatchQty: 0,
      buyMinTradeQty: 0,
      extraBuyMinQty: 0,
      extraBuyMaxQty: 9,
      sellMinTradeQty: 0,
    });
  });
});
