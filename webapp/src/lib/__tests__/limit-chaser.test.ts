import { describe, expect, it } from 'vitest';
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
  isLimitChaserSetRejection,
  parseStrategyKey,
  seedFromUpperLimit,
  strategyKey,
  type LimitChaserFormValues,
} from '../limit-chaser';

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
    // S→C 전용 4필드 — 서버만 채운다.
    sellOrderQty: 0,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    buyEntryLatched: false,
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

  it('S→C 전용 6필드는 비교 대상이 아니다 (Pitfall 6)', () => {
    for (const f of [
      'sellOrderQty',
      'sellQtyTrackBaseline',
      'sellEntryLatched',
      'cancelQtyTrackBaseline',
      'cancelEntryLatched',
      'buyEntryLatched',
    ] as const) {
      expect(DIRTY_COMPARED_FIELDS).not.toContain(f);
    }
    // 서버가 그 6필드를 아무리 흔들어도 더티가 생기지 않는다.
    const noisy = serverEcho({
      sellOrderQty: 999,
      sellQtyTrackBaseline: 777,
      sellEntryLatched: true,
      cancelQtyTrackBaseline: 555,
      cancelEntryLatched: true,
      buyEntryLatched: true,
    });
    expect(dirtyFieldsOf(noisy, defaultLimitChaserForm())).toEqual([]);
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
  it('감시잔량 10000 · 주문금액 10만원 · 최소체결 30000 · 매도호가잔량 10 · 잔량추적 50 · 매도비율 100 · 호가변경 3 · 취소잔량 10', () => {
    const d = defaultLimitChaserForm();
    expect(d.buyWatchQty).toBe(10_000);
    expect(d.buyOrderAmount).toBe(10);
    expect(d.buyMinTradeQty).toBe(30_000);
    expect(d.sellWatchQty).toBe(10);
    expect(d.sellQtyTrackRatio).toBe(50);
    expect(d.sellMinTradeQty).toBe(30_000);
    expect(d.sellOrderRatio).toBe(100);
    expect(d.sweepMinTickCount).toBe(3);
    expect(d.cancelWatchQty).toBe(10);
  });

  it('게이트는 전부 false 이고 감시 대상은 매도호가("0")', () => {
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
    expect(d.buyWatchSide).toBe('0');
  });

  it('호출마다 새 객체를 돌려준다 — 공유 참조를 수정하면 다음 신규 폼이 오염된다', () => {
    const a = defaultLimitChaserForm();
    a.buyOrderAmount = 999;
    expect(defaultLimitChaserForm().buyOrderAmount).toBe(10);
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

  it('`buyOrderAmount === 0` 이면 금액 칸을 덮지 않는다 (Pitfall 11)', () => {
    const prev: LimitChaserFormValues = { ...defaultLimitChaserForm(), buyOrderAmount: 150 };
    expect(formFromServer(serverEcho({ buyOrderAmount: 0 }), prev).buyOrderAmount).toBe(150);
    expect(formFromServer(serverEcho({ buyOrderAmount: 20 }), prev).buyOrderAmount).toBe(20);
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
