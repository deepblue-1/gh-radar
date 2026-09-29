/**
 * 상따(`RelayLimitChaser`) 테스트 공용 픽스처 — **테스트 전용**이다. 제품 코드는 이 파일을
 * import 하지 않는다.
 *
 * Phase 24 매수 3종 17필드(C→S 12 + S→C 5 · quick-260929-vzy 로 `postBuyAuto` 합류해 18)가 계약에 합류하면서 인라인 팩토리 17곳이 같은
 * 기본값을 각자 적어야 했다. 기본값을 한 곳에 두지 않으면 다음 필드 합류 때 17곳이 갈라진다 —
 * 신필드 기본값은 여기 `LC_BUY3_ECHO_DEFAULTS` 하나가 정본이다.
 */
import type { RelayLimitChaser } from '@gh-radar/shared';

/** Phase 24 신필드 17개 + 후매수 자동 1(quick-260929-vzy) = 18개. */
type Buy3EchoFields = Pick<
  RelayLimitChaser,
  | 'buy3Schema'
  | 'preBuyEnabled'
  | 'extraBuyEnabled'
  | 'extraBuyMinQty'
  | 'extraBuyMaxQty'
  | 'extraBuyOrderAmount'
  | 'extraBuyOrderQty'
  | 'extraBuyAbandoned'
  | 'postBuyEnabled'
  | 'postBuyReboundPct'
  | 'postBuyFloorQty'
  | 'postBuyReentry'
  | 'postBuyOrderAmount'
  | 'postBuyOrderQty'
  | 'postBuyTriggerQty'
  | 'postBuyReentryLeft'
  | 'postBuyPhase'
  | 'postBuyAuto'
>;

/**
 * 신필드 18개의 **중립값** — 새 서버 에코(`buy3Schema: 1`)이고 세 그룹 스위치는 전부 꺼져 있으며
 * 수는 0, 후매수 단계는 0(꺼짐)이다. 기존 테스트의 의미(매수 LED 「감시」 등)를 바꾸지 않는 값이다.
 */
export const LC_BUY3_ECHO_DEFAULTS: Buy3EchoFields = {
  buy3Schema: 1,
  preBuyEnabled: false,
  extraBuyEnabled: false,
  extraBuyMinQty: 0,
  extraBuyMaxQty: 0,
  extraBuyOrderAmount: 0,
  extraBuyOrderQty: 0,
  extraBuyAbandoned: false,
  postBuyEnabled: false,
  postBuyReboundPct: 0,
  postBuyFloorQty: 0,
  postBuyReentry: 0,
  postBuyOrderAmount: 0,
  postBuyOrderQty: 0,
  postBuyTriggerQty: 0,
  postBuyReentryLeft: 0,
  postBuyPhase: 0,
  postBuyAuto: false,
};

const ISIN = 'KR7005930003';
/** 테스트용 가짜 계좌번호 — 실계좌 리터럴을 쓰지 않는다(relay D-27). */
const ACCOUNT = '12345678901';

/**
 * 서버 에코 1건. 기본은 **매수만 켜진 살아 있는 전략**이다(`limit-chaser-form.test` `echo()` 와
 * 같은 모양) + 신필드 중립값 + `over`.
 */
export function makeLimitChaser(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    exchange: 'KRX',
    crud: 'C',
    key: `${ISIN}:${ACCOUNT}:KRX`,
    buyOrderPrice: 130_000,
    buyOrderQty: 3,
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
    // S→C 전용 — 서버만 채운다.
    sellOrderQty: 0,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    cancelQtyTrackBaseline: 0,
    cancelEntryLatched: false,
    ...LC_BUY3_ECHO_DEFAULTS,
    ...over,
  };
}
