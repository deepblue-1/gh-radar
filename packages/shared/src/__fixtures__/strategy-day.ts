/**
 * Phase 25 — 기획서 「하루 흐름」 전략 이벤트 픽스처 (**테스트 전용**).
 *
 * `index.ts` 에서 재수출하지 않는다 — 제품 번들에 들어가면 안 된다. 소비처:
 *   - shared 단위 테스트(`__tests__/strategy-event-text.test.ts`) — 상대 경로 import
 *   - webapp 테스트 · e2e — `webapp/src/test-fixtures/strategy-day.ts` 재수출 한 파일만 import
 *   - relay 트레이서(`relay/tests/journal-push.test.ts` ⑦) — 런타임 동적 import(NodeNext · rootDir 경계)
 *
 * 값은 기획서(`reference/spec-order-log-progress-20260929.md`) 예시 하루 흐름 · 채택 목업 F-A 데이터와 같다.
 * seq 는 시각 순이다. 이 플랜(25-01)은 `exposed`(seq 1) · `buy12451`(seq 2) 두 건이고, 25-04 가 seq 3 부터
 * 시각 순으로 하루 전량을 잇는다.
 *
 * 실계좌 · 실서버 값 없음 — 계좌는 relay `SAMPLE_ACCOUNT_NO` · e2e `E2E_ACCOUNT_NO` 와 같은 가짜 값이다(D-27).
 */
import { toStrategyEventRow, type StrategyEventDbRow, type StrategyEventRow } from "../strategy-event";

export const FIXTURE_TRADE_DATE = "2026-09-29";
export const FIXTURE_ACCOUNT_NO = "1234567801";
export const FIXTURE_STOCK_NAME = "○○전자";
const FIXTURE_ISIN = "KR7005930003";
const FIXTURE_STOCK_CODE = "005930";

/** KST 날짜 · `HH:MM:SS.mmm` → epoch ms. */
export function kstMs(date: string, hms: string): number {
  return Date.parse(`${date}T${hms}+09:00`);
}

/** 없는 값은 0 / "" / false / [] — 와이어 규약과 같은 기본 행. */
function dbRow(over: Partial<StrategyEventDbRow> & Pick<StrategyEventDbRow, "seq" | "gw_time_ms" | "kind">): StrategyEventDbRow {
  return {
    gateway: "KB",
    journal_epoch: "ep-25",
    trade_date: FIXTURE_TRADE_DATE,
    group: 0,
    exchange: "KRX",
    isin: FIXTURE_ISIN,
    stock_code: FIXTURE_STOCK_CODE,
    cum_volume: 0,
    account_no: "",
    order_no: "",
    price: 0,
    qty: 0,
    order_condition: "",
    reason_code: "",
    cond_threshold: 0,
    cond_actual: 0,
    cond_metric: 0,
    ev_kind: 0,
    ev_price: 0,
    ev_qty_before: 0,
    ev_qty_after: 0,
    ev_trade_qty: 0,
    limit_bid_qty: 0,
    bid1_price: 0,
    bid1_qty: 0,
    accept_latency_us: 0,
    immediate_fill_qty: 0,
    queue_case: 0,
    base_cum: 0,
    ahead_qty: 0,
    expected_cum: 0,
    error_volume: 0,
    remaining_volume: 0,
    has_remaining: false,
    cancel_reason: 0,
    result_code: 0,
    message: "",
    entry_round: 0,
    snap_qty: [],
    snap_cum: [],
    ask_qty_at_limit: 0,
    open_at_limit: false,
    ...over,
  };
}

/** 이름 → DB 행 (시각 순). */
const NAMED_DB_ROWS: ReadonlyArray<readonly [string, StrategyEventDbRow]> = [
  [
    "exposed",
    dbRow({
      seq: 1,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:42:13.215"),
      kind: 1,
      cum_volume: 620_000,
      ask_qty_at_limit: 185_400,
    }),
  ],
  [
    "buy12451",
    dbRow({
      seq: 2,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:45:02.861"),
      kind: 3,
      group: 1,
      cum_volume: 861_800,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12451",
      price: 12_350,
      qty: 300,
      reason_code: "PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)",
      cond_threshold: 50_000,
      cond_actual: 38_200,
      cond_metric: 1,
      ev_kind: 1,
      ev_price: 12_350,
      ev_qty_before: 52_100,
      ev_qty_after: 38_200,
      limit_bid_qty: 0,
      accept_latency_us: 18_000,
    }),
  ],
];

/** 조회 · 적용 RPC 행 원문 (seq 오름차순). */
export const STRATEGY_DAY_DB_ROWS: readonly StrategyEventDbRow[] = NAMED_DB_ROWS.map(([, r]) => r);

/** 공개 행 (매퍼 결과 · seq 오름차순). */
export const STRATEGY_DAY_ROWS: readonly StrategyEventRow[] = STRATEGY_DAY_DB_ROWS.map(toStrategyEventRow);

/** 이름 → 공개 행. */
export const STRATEGY_DAY_BY_NAME: Readonly<Record<string, StrategyEventRow>> = Object.fromEntries(
  NAMED_DB_ROWS.map(([name, r]) => [name, toStrategyEventRow(r)]),
);

/** 이름 → 표면별 기대 문장(골든). 25-04 가 나머지 이름과 타임라인 문장을 더한다. */
export const STRATEGY_DAY_GOLDEN: Readonly<
  Record<string, { logLine: string; timelineAction?: string; timelineText?: string }>
> = {
  buy12451: {
    logLine:
      "[09:45:02.861][12451][선매수] KRX | ○○전자 | 주문 · 조건 매도잔량≤50,000 / 실측 38,200 · 근거 호가(매도1잔량 52,100→38,200) · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms | 누적 861,800",
  },
};
