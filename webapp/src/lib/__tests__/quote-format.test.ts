import { describe, expect, it } from 'vitest';

import { formatMarketCap, formatOnePercentShares, formatTradeValue } from '../quote-format';

/**
 * 260911-w5h — 상따 헤더 종목정보 표기의 **경계**를 박제한다.
 *
 * ★ 이 파일이 잠그는 핵심은 「모르는 값을 0 으로 그리지 않는다」다(T-w5h-04). 헤더 8칸은
 *   실시간 프레임이 아직 안 온 상태에서도 렌더되므로, 0 을 숫자로 그리는 순간 사용자는 그
 *   숫자로 매도 판단을 한다.
 */

describe('formatMarketCap', () => {
  it('모르는 값에는 대시를 돌려준다 — 0 · 음수 · NaN · Infinity', () => {
    expect(formatMarketCap(0, 1_000_000)).toBe('—');
    expect(formatMarketCap(10_000, 0)).toBe('—');
    expect(formatMarketCap(-1, 1_000_000)).toBe('—');
    expect(formatMarketCap(10_000, -1)).toBe('—');
    expect(formatMarketCap(Number.NaN, 1_000_000)).toBe('—');
    expect(formatMarketCap(10_000, Number.NaN)).toBe('—');
    expect(formatMarketCap(Number.POSITIVE_INFINITY, 1)).toBe('—');
  });

  it('1억 미만은 대시다 — 「0억」을 그리지 않는다', () => {
    // 1,000원 × 10,000주 = 1,000만원 < 1억
    expect(formatMarketCap(1_000, 10_000)).toBe('—');
    // 정확히 1억 직전
    expect(formatMarketCap(1, 99_999_999)).toBe('—');
  });

  it('1억 ~ 1조 미만은 억 한 단위다', () => {
    expect(formatMarketCap(1, 100_000_000)).toBe('1억');
    // 10,000원 × 41,200,000주 = 4,120억
    expect(formatMarketCap(10_000, 41_200_000)).toBe('4,120억');
    // 억 미만 잔액은 버린다 — 4,120억 + 9,999만원
    expect(formatMarketCap(1, 412_099_990_000)).toBe('4,120억');
  });

  it('정확히 1조는 조 한 단위다 — 억 자리가 0 이면 억을 쓰지 않는다', () => {
    expect(formatMarketCap(1, 1_000_000_000_000)).toBe('1조');
    expect(formatMarketCap(1, 133_000_000_000_000)).toBe('133조');
  });

  it('1조 이상은 조 + 억 두 단위다', () => {
    // 133조 4,120억
    expect(formatMarketCap(1, 133_412_000_000_000)).toBe('133조 4,120억');
    // 억 미만 잔액은 여기서도 버린다
    expect(formatMarketCap(1, 133_412_099_999_999)).toBe('133조 4,120억');
  });

  it('현재가 × 상장주식수로 계산한다 — 두 값이 함께 쓰인다', () => {
    // 70,000원 × 5,969,782,550주 ≈ 417조
    expect(formatMarketCap(70_000, 5_969_782_550)).toBe('417조 8,847억');
  });
});

describe('formatOnePercentShares', () => {
  it('모르는 값에는 대시를 돌려준다', () => {
    expect(formatOnePercentShares(0)).toBe('—');
    expect(formatOnePercentShares(-1)).toBe('—');
    expect(formatOnePercentShares(Number.NaN)).toBe('—');
    expect(formatOnePercentShares(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('1% 를 주 단위 콤마 정수로 쓴다', () => {
    expect(formatOnePercentShares(72_800_200)).toBe('728,002주');
    expect(formatOnePercentShares(100)).toBe('1주');
  });

  it('소수는 내림한다 — 올리면 없는 물량이 생긴다', () => {
    expect(formatOnePercentShares(199)).toBe('1주');
    /*
      ★ 100주 미만 상장은 `0주` 다. 시총(`formatMarketCap`)과 달리 여기에는 「1억 미만 →
        대시」 같은 하한을 두지 않았다 — 상장주식수가 100주 미만인 종목은 한국 시장에
        존재하지 않으므로 그 하한은 영원히 안 타는 분기이고, 없는 경우를 위한 분기는
        읽는 사람에게 「그런 경우가 있다」는 거짓말을 한다.
        반면 `ls` 가 **0**(= 프레임 미수신)인 경우는 실재하고, 그것은 위 케이스가 잠근다.
    */
    expect(formatOnePercentShares(99)).toBe('0주');
  });
});

/**
 * 260912-k2x — 헤더 종목정보가 10칸이 되면서 들어온 **누적거래대금** 칸.
 *
 * ★ `lib/format.ts` 의 `formatTradeAmount`(`133.4조` — 소수 1자리 **한 단위**, 스캐너 표기)와
 *   **다른 함수**다. 합치면 스캐너의 거래대금 표기가 함께 바뀐다. 여기는 `formatMarketCap`
 *   과 동형인 **조/억 두 단위**다.
 */
describe('formatTradeValue', () => {
  it('모르는 값에는 대시를 돌려준다 — 0 · 음수 · NaN · Infinity (「0억」을 그리지 않는다)', () => {
    expect(formatTradeValue(0)).toBe('—');
    expect(formatTradeValue(-1)).toBe('—');
    expect(formatTradeValue(Number.NaN)).toBe('—');
    expect(formatTradeValue(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('1억 미만은 대시다 — 표시할 유효 자릿수가 없다', () => {
    expect(formatTradeValue(99_999_999)).toBe('—');
    expect(formatTradeValue(1)).toBe('—');
  });

  it('1억 ~ 1조 미만은 억 한 단위다', () => {
    expect(formatTradeValue(100_000_000)).toBe('1억');
    expect(formatTradeValue(184_200_000_000)).toBe('1,842억');
  });

  it('1조 이상은 조 + 억 두 단위다', () => {
    expect(formatTradeValue(133_412_000_000_000)).toBe('133조 4,120억');
  });

  it('억 자리가 0 이면 조만 쓴다', () => {
    expect(formatTradeValue(1_000_000_000_000)).toBe('1조');
    expect(formatTradeValue(133_000_000_000_000)).toBe('133조');
  });

  it('억 미만 잔액은 **버린다** — 반올림하면 없는 정밀도를 주장한다', () => {
    expect(formatTradeValue(184_299_999_999)).toBe('1,842억');
    expect(formatTradeValue(133_412_099_999_999)).toBe('133조 4,120억');
  });
});
