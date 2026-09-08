/**
 * Phase 16 Plan 12 — 상따(LimitChaser) 폼 순수 함수 (TRADE-01).
 *
 * ① 결정 근거
 *   - **더티 판정의 유일 지점**이다(D-06). 「값 변경은 즉시 전송하지 않고 「수정」 버튼으로만
 *     반영된다」는 이 phase 의 핵심 규율이고, 그 판정이 두 곳에 있으면 한쪽만 고쳐진 채로
 *     액션 바가 뜨거나 안 뜬다. `dirtyFieldsOf` 가 유일한 비교기다.
 *   - **삭제 판정의 유일 지점**이다(D-08). 매수·매도·취소 게이트가 전부 꺼지면 `crud "D"` 다.
 *     별도 「삭제」 버튼이 없으므로 이 판정이 곧 삭제 경로다.
 *   - 수량 산출식은 gh-trade 정본과 **동형**이다
 *     `[VERIFIED: LimitChaserForm.cs:2809 BuyOrderQtyFromAmount]`.
 *     기본값·상한가 시딩도 같은 파일의 상수(:129~178) / `SeedFromUpperLimitOnce()`(:711) 를 옮겼다.
 *
 * ② 함정
 *   - ★ **역산 금지.** `수량 × 가격 ÷ 10000` 으로 금액을 되돌리지 않는다. 나머지가 잘리면서
 *     왕복이 깨진다 — gh-trade 에 **무장 수량 2주가 598주로 튄 실측 사고**가 있다(약 300배).
 *     금액 → 수량 한 방향만 존재하고, 그 방향이 이 파일에 딱 한 번 나온다.
 *   - ★ **`buyOrderAmount === 0` 은 「서버가 모른다」**는 뜻이다(Pitfall 11 — 구 클라가 보냈거나
 *     한 번도 실린 적이 없다). 금액 칸을 덮지 않고, 더티 비교에서도 뺀다. 덮으면 사용자가
 *     방금 입력한 금액이 사라지고, 비교에 넣으면 액션 바가 영원히 떠 있는다.
 *   - ★ **삭제 판정에 취소 게이트를 포함**한다(Pitfall 7). 매수·매도만 보면 「자동취소만 켠
 *     전략」을 삭제로 오판한다 — 서버는 취소 게이트가 하나라도 켜져 있으면 전략을 남긴다.
 *   - ★ **S→C 전용 4필드**(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *     `cancelQtyTrackBaseline`)는 서버가 계산해 에코로만 내려준다(Pitfall 6). 더티 비교에
 *     넣으면 서버 계산값이 「사용자 미반영 변경」으로 둔갑한다. 입력 타입에도 없다.
 *   - ★ **스위치 3종은 더티가 아니다.** 즉시 전송(D-05)이라 송신~에코 사이 한 프레임 동안
 *     서버값과 달라지는데, 그걸 더티로 세면 스위치를 켤 때마다 액션 바가 깜빡인다.
 *   - ★ 에코의 `buyEnabled`/`sellEnabled` 는 설정값이 아니라 **무장 상태**다(Pitfall 10).
 *     「내가 켰는데 서버가 껐다」가 아니라 「발주가 나갔다」는 뜻이다 — 배지 문구가 이 둘을
 *     구분하는 것은 `strategy-badge.tsx`(16-11) 소관이고, 여기서는 비교 대상에서 뺄 뿐이다.
 *
 * ③ 하지 않는 것
 *   - **서버로 보낼 페이로드를 여기서 조립하지 않는다.** 전송은 폼이 컨텍스트 `send` 로 한다
 *     (`limit-chaser-form.tsx`). 조립기가 lib 에 있으면 「보냈다」는 착각이 순수 함수 층까지
 *     내려와 테스트가 전송 경로를 검증한다고 오해하게 된다.
 *   - **S→C 전용 4필드를 입력 타입에 넣지 않는다.** 넣는 순간 어딘가에서 되보내진다.
 *   - **`crud` 를 「삭제됨」 표시의 근거로 쓰지 않는다.** `crudOf(form)` 는 **전송용 힌트**일
 *     뿐이다. 화면의 「삭제됨」 판정은 반드시 **서버 에코의 `crud`** 를 봐야 한다 —
 *     서버가 정규화한 결과가 정본이고, 클라 판정과 갈릴 수 있다(Pitfall 7).
 */

import type { RelayExchange, RelayLcCrud, RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

/**
 * 폼이 실제로 편집하는 값 24종.
 *
 * `RelayLimitChaserInput`(33) 에서 뺀 것:
 *   - 정체성 4 (`isin`·`accountNo`·`market`·`exchange`) — 상단 종목·거래소·계좌 카드(A1) 소관
 *   - 파생 2 (`crud` = `crudOf`, `buyOrderQty` = `buyOrderQtyFromAmount`)
 *   - 클라 고정 3 (`sweepRecalcEnabled: true` · `sweepMinCount: 0` · `sweepMinRate: 0`)
 *
 * ★ 고정 3 을 폼에 노출하지 않는 이유: relay 빌더가 `true`/`0`/`0` 으로 **덮어쓴다**(16-04).
 *   입력으로 열어두면 「설정했는데 반영 안 됨」이 된다.
 */
export type LimitChaserFormValues = Omit<
  RelayLimitChaserInput,
  | 'isin'
  | 'accountNo'
  | 'market'
  | 'exchange'
  | 'crud'
  | 'buyOrderQty'
  | 'sweepRecalcEnabled'
  | 'sweepMinCount'
  | 'sweepMinRate'
>;

/** 상한가 시딩이 채우는 가격 5칸. */
export type LimitChaserSeedPrices = Pick<
  LimitChaserFormValues,
  'buyWatchPrice' | 'buyOrderPrice' | 'sellWatchPrice' | 'sellOrderPrice' | 'sweepWatchPrice'
>;

/** 삭제 판정에 필요한 게이트 4종 — 서버 정규화(`crud "D"`)와 같은 집합이다. */
export type LimitChaserGates = Pick<
  LimitChaserFormValues,
  'buyEnabled' | 'sellEnabled' | 'cancelQtyEnabled' | 'cancelTradeEnabled'
>;

/**
 * 매수수량 산출 — **유일 지점**.
 *
 * `floor(금액(만원) × 10000 / 매수가격)`. 가격이 0 이하면 0 이다(나눗셈을 하지 않는다).
 * gh-trade 는 long 으로 계산한 뒤 좁혀 uint 래핑을 막는데, JS `number` 는 2^53 까지 정확한
 * 정수를 담으므로 같은 결과를 낸다 — 100억주(1e10)도 래핑 없이 그대로 나온다.
 *
 * ★ 역산(`수량 × 가격 ÷ 10000`) 을 만들지 않는다. 파일 상단 ② 참조.
 */
export function buyOrderQtyFromAmount(amountManwon: number, price: number): number {
  if (!(price > 0)) return 0;
  return Math.floor((amountManwon * 10_000) / price);
}

/**
 * 전략 키 조립 — **유일 지점**. 서버 `LimitChaser::MakeKey` 와 동형.
 *
 * `isin`·`accountNo` 를 12자로 절단하는 것이 계약이다 — 서버가 `strncpy(..., 12)` 로 자르므로
 * 자르지 않으면 같은 전략을 다른 키로 보게 되고, 사이드바 목록과 상세가 서로를 못 찾는다.
 */
export function strategyKey(isin: string, accountNo: string, exchange: RelayExchange): string {
  return `${isin.slice(0, 12)}:${accountNo.slice(0, 12)}:${exchange}`;
}

/**
 * 더티 비교 대상 21종 — **공개 상수**다. 테스트가 「무엇이 비교되지 않는지」를 직접 단언한다.
 *
 * 폼 24종에서 뺀 것 = 스위치 3종(`buyEnabled`·`sellEnabled`·`sweepEnabled`). 즉시 전송이라
 * 더티가 아니다(파일 상단 ②). S→C 전용 4필드는 애초에 `LimitChaserFormValues` 에 없다 —
 * 타입이 먼저 막고, 이 배열이 한 번 더 막는다.
 */
export const DIRTY_COMPARED_FIELDS = [
  'buyOrderPrice',
  'buyWatchPrice',
  'buyWatchQty',
  'buyMinTradeQty',
  'buyWatchSide',
  'buyTradeQtyEnabled',
  'buyOrderAmount',
  'sellOrderPrice',
  'sellWatchPrice',
  'sellWatchQty',
  'sellMinTradeQty',
  'sellTradeQtyEnabled',
  'sellOrderRatio',
  'sellQtyTrackEnabled',
  'sellQtyTrackRatio',
  'sweepWatchPrice',
  'sweepMinTickCount',
  'cancelQtyEnabled',
  'cancelWatchQty',
  'cancelTradeEnabled',
  'cancelQtyTrackEnabled',
] as const satisfies readonly (keyof LimitChaserFormValues)[];

/** 더티 필드 이름 — 액션 바 개수 문구와 필드 강조가 같은 집합을 본다. */
export type LimitChaserDirtyField = (typeof DIRTY_COMPARED_FIELDS)[number];

/**
 * 더티 판정 — **유일 지점**(D-06).
 *
 * `server` 가 없으면(신규 폼) 비교 기준선이 없으므로 더티도 없다. 「아직 등록 안 된 전략」에
 * 「미반영 변경 24개」를 띄우면 액션 바가 신규 폼에서 항상 떠 있게 된다.
 *
 * `buyOrderAmount` 는 서버값이 `0`(=「모른다」) 일 때만 비교에서 빠진다 — 서버가 값을 알면
 * 정상적으로 비교한다.
 */
export function dirtyFieldsOf(
  server: RelayLimitChaser | null | undefined,
  form: LimitChaserFormValues,
): LimitChaserDirtyField[] {
  if (server == null) return [];
  const dirty: LimitChaserDirtyField[] = [];
  for (const field of DIRTY_COMPARED_FIELDS) {
    // 「서버가 모른다」 — 사용자 입력을 덮지도, 미반영으로 세지도 않는다 (Pitfall 11).
    if (field === 'buyOrderAmount' && server.buyOrderAmount === 0) continue;
    if (server[field] !== form[field]) dirty.push(field);
  }
  return dirty;
}

/**
 * 삭제 의도 판정 (D-08 / Pitfall 7).
 *
 * 매수·매도·**취소 2종**이 전부 꺼지면 서버가 `crud` 를 `"D"` 로 정규화한다. 취소 게이트가
 * 하나라도 켜져 있으면 매수·매도를 둘 다 꺼도 전략이 **남는다**.
 */
export function isDeleteIntent(gates: LimitChaserGates): boolean {
  return (
    !gates.buyEnabled &&
    !gates.sellEnabled &&
    !gates.cancelQtyEnabled &&
    !gates.cancelTradeEnabled
  );
}

/**
 * 전송할 `crud` — **전송용 힌트일 뿐이다.**
 *
 * ★ UI 의 「삭제됨」 표시는 이 값이 아니라 **서버 에코의 `crud`** 를 봐야 한다. 서버 정규화
 *   결과가 정본이고, 클라 판정이 앞서갈 수 있다(Pitfall 7).
 */
export function crudOf(gates: LimitChaserGates): RelayLcCrud {
  return isDeleteIntent(gates) ? 'D' : 'C';
}

/**
 * 상한가 5칸 시딩 `[VERIFIED: SeedFromUpperLimitOnce(), LimitChaserForm.cs:711]`.
 *
 * 종목 선택 시 1회만 적용한다. 서버 에코가 있으면 **서버값이 이긴다**(D-11) — 시딩을 매
 * 렌더 걸면 에코가 덮은 값을 다시 상한가로 되돌린다.
 */
export function seedFromUpperLimit(upperLimit: number): LimitChaserSeedPrices {
  return {
    buyWatchPrice: upperLimit,
    buyOrderPrice: upperLimit,
    sellWatchPrice: upperLimit,
    sellOrderPrice: upperLimit,
    sweepWatchPrice: upperLimit,
  };
}

/**
 * 신규 폼 기본값 `[VERIFIED: LimitChaserForm.cs:129~178]`.
 *
 * ★ 매 호출 **새 객체**를 돌려준다. 모듈 상수를 공유하면 한 폼의 편집이 다음 신규 폼으로 샌다.
 */
export function defaultLimitChaserForm(): LimitChaserFormValues {
  return {
    // 매수주문
    buyWatchPrice: 0,
    buyWatchQty: 10_000, // DEFAULT_BUY_WATCH_QTY
    buyWatchSide: '0', // Ask — 매도호가 감시
    buyMinTradeQty: 30_000, // DEFAULT_BUY_MIN_TRADE_QTY
    buyTradeQtyEnabled: false,
    buyEnabled: false,
    // 매수가격
    buyOrderPrice: 0,
    buyOrderAmount: 10, // DEFAULT_BUY_ORDER_AMOUNT (만원) — Designer 기본 20,000 과 다르다
    // 한방체결
    sweepWatchPrice: 0,
    sweepMinTickCount: 3, // DEFAULT_SWEEP_MIN_TICK_COUNT
    sweepEnabled: false,
    // 매도주문
    sellWatchPrice: 0,
    sellWatchQty: 10, // DEFAULT_SELL_WATCH_QTY
    sellMinTradeQty: 30_000, // DEFAULT_SELL_MIN_TRADE_QTY
    sellTradeQtyEnabled: false,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50, // DEFAULT_SELL_QTY_TRACK_RATIO
    sellEnabled: false,
    // 매도가격
    sellOrderPrice: 0,
    sellOrderRatio: 100, // DEFAULT_SELL_ORDER_RATIO
    // 매수 미체결 자동취소
    cancelQtyEnabled: false,
    cancelWatchQty: 10, // DEFAULT_CANCEL_QTY
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
  };
}

/**
 * 예상 매도수량 — **표시 전용**이다. 정본은 서버가 Set 시점에 스냅샷한 `sellOrderQty` 다.
 * `sellableQty` 는 계좌 스토어(`RelayAccountState.hold[].sellableQty`)에서 읽는다.
 */
export function estimatedSellQty(sellableQty: number, ratio: number): number {
  return Math.floor((sellableQty * ratio) / 100);
}

/**
 * 에코 → 폼 (D-11 서버값 우선).
 *
 * 더티 필드도 **덮어쓴다** — 편집 중 보호·보류가 없다. 값이 바뀌는 순간을 사용자가 놓치지
 * 않도록 배너를 띄우는 것은 상위 화면 책임이고, 여기서는 「서버가 이긴다」만 실행한다.
 *
 * 유일한 예외가 `buyOrderAmount === 0` 이다 — 「서버가 모른다」이므로 이전 값을 남긴다
 * (Pitfall 11). 수량 × 가격 역산으로 채우지도 않는다.
 */
export function formFromServer(
  server: RelayLimitChaser,
  prev: LimitChaserFormValues,
): LimitChaserFormValues {
  return {
    buyWatchPrice: server.buyWatchPrice,
    buyWatchQty: server.buyWatchQty,
    buyWatchSide: server.buyWatchSide,
    buyMinTradeQty: server.buyMinTradeQty,
    buyTradeQtyEnabled: server.buyTradeQtyEnabled,
    buyEnabled: server.buyEnabled,
    buyOrderPrice: server.buyOrderPrice,
    buyOrderAmount: server.buyOrderAmount === 0 ? prev.buyOrderAmount : server.buyOrderAmount,
    sweepWatchPrice: server.sweepWatchPrice,
    sweepMinTickCount: server.sweepMinTickCount,
    sweepEnabled: server.sweepEnabled,
    sellWatchPrice: server.sellWatchPrice,
    sellWatchQty: server.sellWatchQty,
    sellMinTradeQty: server.sellMinTradeQty,
    sellTradeQtyEnabled: server.sellTradeQtyEnabled,
    sellQtyTrackEnabled: server.sellQtyTrackEnabled,
    sellQtyTrackRatio: server.sellQtyTrackRatio,
    sellEnabled: server.sellEnabled,
    sellOrderPrice: server.sellOrderPrice,
    sellOrderRatio: server.sellOrderRatio,
    cancelQtyEnabled: server.cancelQtyEnabled,
    cancelWatchQty: server.cancelWatchQty,
    cancelTradeEnabled: server.cancelTradeEnabled,
    cancelQtyTrackEnabled: server.cancelQtyTrackEnabled,
  };
}
