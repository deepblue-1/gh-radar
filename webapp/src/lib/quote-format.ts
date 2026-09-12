/**
 * 상따 헤더 「종목정보」 표기 순수함수 (260911-w5h · TRADE-01).
 *
 * 이 모듈이 존재하는 이유는 **모르는 값을 0 으로 그리지 않기 위해서**다. 시총·발행1% 는
 * 실시간 프레임(`RelayQuote`)의 `ls`(상장주식수)에서 나오는데, 그 프레임이 아직 오지 않았거나
 * 종목이 시세를 못 받는 상태면 `ls` 는 0 이다. 그때 「0억」을 그리면 그 숫자로 매도 판단이
 * 이뤄진다 — 그래서 표시할 유효 자릿수가 없으면 대시를 돌려준다.
 *
 * ★ `lib/format.ts` 의 `formatTradeAmount` 를 재사용하지 않는다. **다른 포맷**이기 때문이다:
 *   저쪽은 1조 이상을 `133.4조` 처럼 **소수 1자리 한 단위**로 쓰고 여기는 `133조 4,120억`
 *   처럼 **조 + 억 두 단위**로 쓴다(목업 7 이 확정한 표기). 상따 헤더는 2열 4행 8칸이 전부
 *   한 줄에 들어가야 해서 억 자리까지 읽히는 편이 값의 크기를 더 빨리 말한다.
 *   「중복 함수」로 보고 둘을 합치면 스캐너의 거래대금 표기가 함께 바뀐다 — 합치지 마라.
 *   ★ 260912-k2x 의 `formatTradeValue`(누적거래대금)도 **같은 금지 아래** 있다. 그 함수는
 *     `formatMarketCap` 과 동형인 조/억 두 단위이고, `formatTradeAmount` 와는 표기가 다르다.
 */

const KRW = new Intl.NumberFormat('ko-KR');

/** 조 = 1e12, 억 = 1e8. 한국어 금액 표기의 두 단위다. */
const JO = 1e12;
const UK = 1e8;

/** 모르는 값 — 「0」이 아니다. 화면 전역에서 같은 글리프를 쓴다. */
const DASH = '—';

/**
 * 시가총액 = 현재가 × 상장주식수.
 *
 * - 둘 중 하나라도 0 이하이거나 유한하지 않으면 `—`(지어내지 않는다).
 * - 1억 미만이면 `—` — 표시할 유효 자릿수가 없다. 「0억」은 0 을 그리는 것과 같다.
 * - 1조 미만: `4,120억`
 * - 1조 이상: `133조 4,120억` · 억 자리가 0 이면 `133조`
 * - 억 미만 잔액은 **버린다**(반올림하면 없는 정밀도를 주장하게 된다).
 */
export function formatMarketCap(price: number, listedShares: number): string {
  if (!Number.isFinite(price) || !Number.isFinite(listedShares)) return DASH;
  if (price <= 0 || listedShares <= 0) return DASH;

  const cap = price * listedShares;
  if (cap < JO) {
    const uk = Math.floor(cap / UK);
    return uk === 0 ? DASH : `${KRW.format(uk)}억`;
  }
  const jo = Math.floor(cap / JO);
  const uk = Math.floor((cap % JO) / UK);
  return uk === 0 ? `${jo}조` : `${jo}조 ${KRW.format(uk)}억`;
}

/**
 * 상장주식수의 1% — 상따에서 「이 종목이 얼마나 가벼운가」를 재는 눈금이다.
 *
 * 0 이하·비유한이면 `—`. 소수는 **내림**한다(주식은 쪼갤 수 없고, 올리면 없는 물량이 생긴다).
 */
export function formatOnePercentShares(listedShares: number): string {
  if (!Number.isFinite(listedShares) || listedShares <= 0) return DASH;
  return `${KRW.format(Math.floor(listedShares / 100))}주`;
}

/**
 * 누적거래대금 표기 — `formatMarketCap` 과 **동형**이다 (260912-k2x).
 *
 * - 0 이하·비유한이면 `—`. 「0억」을 그리면 그 숫자로 매도 판단이 이뤄진다.
 * - 1억 미만이면 `—` — 표시할 유효 자릿수가 없다.
 * - 1조 미만: `1,842억`
 * - 1조 이상: `133조 4,120억` · 억 자리가 0 이면 `133조`
 * - 억 미만 잔액은 **버린다**(반올림하면 없는 정밀도를 주장하게 된다).
 *
 * ★ 인자는 **누적거래대금 원**(`RelayQuote.va`) 하나다. 가격 × 수량을 여기서 다시 계산하지
 *   않는다 — 그 곱은 이미 프레임이 들고 오는 값이고, 다시 계산하면 두 숫자가 갈린다.
 */
export function formatTradeValue(tradeValue: number): string {
  if (!Number.isFinite(tradeValue) || tradeValue <= 0) return DASH;

  if (tradeValue < JO) {
    const uk = Math.floor(tradeValue / UK);
    return uk === 0 ? DASH : `${KRW.format(uk)}억`;
  }
  const jo = Math.floor(tradeValue / JO);
  const uk = Math.floor((tradeValue % JO) / UK);
  return uk === 0 ? `${jo}조` : `${jo}조 ${KRW.format(uk)}억`;
}
