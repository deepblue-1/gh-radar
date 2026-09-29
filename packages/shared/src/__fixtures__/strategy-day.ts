/**
 * Phase 25 — 기획서 「하루 흐름」 전략 이벤트 픽스처 (**테스트 전용**).
 *
 * `index.ts` 에서 재수출하지 않는다 — 제품 번들에 들어가면 안 된다. 소비처:
 *   - shared 단위 테스트(`__tests__/strategy-event-text.test.ts`) — 상대 경로 import
 *   - webapp 테스트 · e2e — `webapp/src/test-fixtures/strategy-day.ts` 재수출 한 파일만 import
 *   - relay 트레이서(`relay/tests/journal-push.test.ts` ⑦) — 런타임 동적 import(NodeNext · rootDir 경계)
 *
 * 값은 기획서(`reference/spec-order-log-progress-20260929.md`) 예시 하루 흐름 · 채택 목업 F-A 데이터와 같다.
 * seq 는 시각 순이다 — 25-01 이 `exposed`(seq 1) · `buy12451`(seq 2) 를 세웠고, 25-04 가 seq 3 부터 하루 전량을 잇는다.
 *
 * 두 벌:
 *   - `STRATEGY_DAY_*` — 기획서 하루 흐름(seq 1~14). 목록 · 스토어 · e2e 목 응답이 「하루」 로 쓴다.
 *   - `STRATEGY_BRANCH_ROWS` — 조립 규칙의 갈래(seq 101~ — 하루 흐름과 섞이지 않게). 골든 테스트 전용.
 * 기대 문장은 `STRATEGY_DAY_GOLDEN` 한 표(하루 흐름 + 갈래 이름 전량)다.
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
  [
    "entered1",
    dbRow({
      seq: 3,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:45:02.880"),
      kind: 2,
      cum_volume: 900_000,
      entry_round: 1,
      snap_qty: [30_000, 55_000, 72_000],
      snap_cum: [900_000, 903_000, 908_000],
    }),
  ],
  [
    "queued12451",
    dbRow({
      seq: 4,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:45:02.880"),
      kind: 4,
      group: 1,
      cum_volume: 900_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12451",
      price: 12_350,
      qty: 300,
      queue_case: 1,
      base_cum: 900_000,
      ahead_qty: 30_000,
      expected_cum: 930_000,
    }),
  ],
  [
    // 오차 = expected_cum − 첫 체결 시점 누적 = 930,000 − 914,000
    "fill12451",
    dbRow({
      seq: 5,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:45:07.415"),
      kind: 5,
      group: 1,
      cum_volume: 914_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12451",
      price: 12_350,
      qty: 300,
      expected_cum: 930_000,
      error_volume: 16_000,
    }),
  ],
  [
    "buy12452",
    dbRow({
      seq: 6,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:47:15.330"),
      kind: 3,
      group: 2,
      cum_volume: 950_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12452",
      price: 12_350,
      qty: 300,
      reason_code: "AddBuy 구간(매수1호가==감시가 && 하한<=잔량<=상한)",
      cond_threshold: 150_000,
      cond_actual: 152_000,
      cond_metric: 2,
      ev_kind: 1,
      ev_price: 12_350,
      ev_qty_before: 148_500,
      ev_qty_after: 152_000,
      limit_bid_qty: 152_000,
      // 17.24ms → 반올림 17ms
      accept_latency_us: 17_240,
    }),
  ],
  [
    "queued12452",
    dbRow({
      seq: 7,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:47:15.347"),
      kind: 4,
      group: 2,
      cum_volume: 950_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12452",
      price: 12_350,
      qty: 300,
      queue_case: 1,
      base_cum: 950_000,
      ahead_qty: 152_000,
      expected_cum: 1_102_000,
    }),
  ],
  [
    "buy12453",
    dbRow({
      seq: 8,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:52:40.105"),
      kind: 3,
      group: 3,
      cum_volume: 1_000_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12453",
      price: 12_350,
      qty: 300,
      reason_code: "PostBuy 반등(매수1호가==감시가 && 잔량>발동잔량)",
      cond_threshold: 100_000,
      cond_actual: 100_000,
      cond_metric: 2,
      ev_kind: 1,
      ev_price: 12_350,
      ev_qty_before: 104_000,
      ev_qty_after: 100_000,
      limit_bid_qty: 100_000,
      accept_latency_us: 17_000,
    }),
  ],
  [
    "queued12453",
    dbRow({
      seq: 9,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:52:40.122"),
      kind: 4,
      group: 3,
      cum_volume: 1_000_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12453",
      price: 12_350,
      qty: 300,
      queue_case: 1,
      base_cum: 1_000_000,
      ahead_qty: 100_000,
      expected_cum: 1_100_000,
    }),
  ],
  [
    // 오차 = 1,102,000 − 1,061,000
    "fill12452",
    dbRow({
      seq: 10,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:55:31.208"),
      kind: 5,
      group: 2,
      cum_volume: 1_061_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12452",
      price: 12_350,
      qty: 300,
      expected_cum: 1_102_000,
      error_volume: 41_000,
    }),
  ],
  [
    // 남은 거래량 = expected_cum − 취소 시점 누적 = 1,100,000 − 1,088,000
    "cancel12453",
    dbRow({
      seq: 11,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:56:03.411"),
      kind: 7,
      group: 3,
      cum_volume: 1_088_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12453",
      price: 12_350,
      qty: 300,
      expected_cum: 1_100_000,
      remaining_volume: 12_000,
      has_remaining: true,
      cancel_reason: 3,
    }),
  ],
  [
    "sell12454",
    dbRow({
      seq: 12,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:11:40.210"),
      kind: 6,
      group: 4,
      cum_volume: 1_640_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12454",
      price: 12_350,
      qty: 600,
      order_condition: "0",
      reason_code: "B6Sell1 잔량(매수1호가==감시가 && 잔량<=임계)",
      cond_threshold: 50_000,
      cond_actual: 47_800,
      cond_metric: 2,
      ev_kind: 1,
      ev_price: 12_350,
      ev_qty_before: 51_200,
      ev_qty_after: 47_800,
      bid1_price: 12_350,
      bid1_qty: 47_800,
      accept_latency_us: 16_000,
    }),
  ],
  [
    "sell12455",
    dbRow({
      seq: 13,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:11:58.310"),
      kind: 6,
      group: 5,
      cum_volume: 1_650_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12455",
      price: 12_350,
      qty: 300,
      order_condition: "0",
      reason_code: "A3 체결수량(체결가==감시가 && 체결수량>=최소)",
      cond_threshold: 10_000,
      cond_actual: 18_000,
      cond_metric: 3,
      ev_kind: 2,
      ev_price: 12_350,
      ev_trade_qty: 18_000,
      bid1_price: 12_350,
      bid1_qty: 42_000,
      accept_latency_us: 16_000,
    }),
  ],
  [
    // 거부 — 주문번호 없음(줄 머리 [—]) · 사유는 서버 원문 그대로(D-36 · 파싱 없음)
    "reject",
    dbRow({
      seq: 14,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:12:01.004"),
      kind: 8,
      group: 3,
      cum_volume: 1_651_200,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "",
      price: 12_350,
      qty: 300,
      result_code: 1,
      message: "주문거부 가격범위초과",
    }),
  ],
];

/** 조립 규칙 갈래 — 이름 → DB 행 (seq 101~ · 시각 순). */
const BRANCH_DB_ROWS: ReadonlyArray<readonly [string, StrategyEventDbRow]> = [
  [
    // 일부 즉시체결 — Queued qty = 남은 수량 · immediate_fill_qty = 체결분 (gh-trade 정정 2026-09-29)
    "queuedPartial",
    dbRow({
      seq: 101,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:01.100"),
      kind: 4,
      group: 1,
      cum_volume: 900_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12456",
      price: 12_350,
      qty: 200,
      immediate_fill_qty: 100,
      queue_case: 1,
      base_cum: 900_000,
      ahead_qty: 30_000,
      expected_cum: 930_000,
    }),
  ],
  [
    // 전량 즉시체결 — Queued qty 0 · immediate_fill_qty = 전량 (대기 없음 · FirstFill 없음)
    "queuedFull",
    dbRow({
      seq: 102,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:02.200"),
      kind: 4,
      group: 1,
      cum_volume: 905_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12457",
      price: 12_350,
      qty: 0,
      immediate_fill_qty: 300,
    }),
  ],
  [
    "exposedOpen",
    dbRow({
      seq: 103,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:03.300"),
      kind: 1,
      exchange: "NXT",
      cum_volume: 310_500,
      ask_qty_at_limit: 42_100,
      open_at_limit: true,
    }),
  ],
  [
    // 3초 스냅 전에 상한가 이탈 — 벡터 길이 2
    "enteredShort",
    dbRow({
      seq: 104,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:04.400"),
      kind: 2,
      cum_volume: 1_200_000,
      entry_round: 2,
      snap_qty: [41_000, 38_000],
      snap_cum: [1_200_000, 1_204_000],
    }),
  ],
  [
    "fillNegative",
    dbRow({
      seq: 105,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:05.500"),
      kind: 5,
      group: 2,
      cum_volume: 1_105_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12458",
      price: 12_350,
      expected_cum: 1_100_000,
      error_volume: -5_000,
    }),
  ],
  [
    // 대기 전 취소 — has_remaining false 면 남은 거래량 조각이 없다
    "cancelNoRemaining",
    dbRow({
      seq: 106,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:06.600"),
      kind: 7,
      group: 1,
      cum_volume: 1_110_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12459",
      price: 12_350,
      qty: 300,
      cancel_reason: 1,
    }),
  ],
  [
    "cancelOther",
    dbRow({
      seq: 107,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:07.700"),
      kind: 7,
      group: 2,
      cum_volume: 1_120_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12460",
      price: 12_350,
      qty: 300,
      cancel_reason: 9,
    }),
  ],
  [
    // 모르는 취소 사유(표 밖 42) — 원문 숫자(D-10) · 매도 그룹이라 tone sell
    "cancelUnknown",
    dbRow({
      seq: 108,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:08.800"),
      kind: 7,
      group: 4,
      cum_volume: 1_130_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12461",
      price: 12_350,
      qty: 600,
      cancel_reason: 42,
    }),
  ],
  [
    // 모르는 kind(99) — 그룹은 알아도 행위 · 본문을 지어내지 않는다
    "unknownKind",
    dbRow({
      seq: 109,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:09.900"),
      kind: 99,
      group: 1,
      cum_volume: 1_140_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12462",
    }),
  ],
  [
    // 주문 이벤트인데 group 0(None) — 구분 칸은 원문 `0` · 방향색 없음
    "groupZeroOrder",
    dbRow({
      seq: 110,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:10.010"),
      kind: 3,
      group: 0,
      cum_volume: 1_150_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12463",
      price: 12_350,
      qty: 10,
    }),
  ],
  [
    // 체결훅 매도 — 근거는 체결통보(ev_kind 3) · 조건식 없는 사유라 조건 조각 없음
    "sellFillHook",
    dbRow({
      seq: 111,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:11.011"),
      kind: 6,
      group: 6,
      cum_volume: 1_160_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12464",
      price: 12_300,
      qty: 50,
      order_condition: "0",
      reason_code: "FillHook 취소거부재취소(취소 거부 → 차감 잔량 재취소 + 체결분 매도)",
      ev_kind: 3,
      ev_price: 12_300,
      ev_trade_qty: 50,
      accept_latency_us: 15_000,
    }),
  ],
  [
    // 상승률(cond_metric 7) — 값은 bp · 표시는 소수 둘째 자리 %
    "riseRate",
    dbRow({
      seq: 112,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "11:00:12.012"),
      kind: 3,
      group: 1,
      cum_volume: 1_170_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "12465",
      price: 12_350,
      qty: 100,
      reason_code: "PreBuy A3 버스트횟수+상승률(횟수>=최소 && 상승률>=최소)",
      cond_threshold: 300,
      cond_actual: 412,
      cond_metric: 7,
      ev_kind: 2,
      ev_price: 12_350,
      ev_trade_qty: 2_000,
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

/** 갈래 이름 → 공개 행 (하루 흐름과 별도 — seq 101~). */
export const STRATEGY_BRANCH_ROWS: Readonly<Record<string, StrategyEventRow>> = Object.fromEntries(
  BRANCH_DB_ROWS.map(([name, r]) => [name, toStrategyEventRow(r)]),
);

/**
 * 이름(하루 흐름 + 갈래) → 표면별 기대 문장(골든). `logLine` = 주문로그 탭 F-A 한 줄(`orderLogLineText`),
 * `timelineAction` · `timelineText` = 오늘 주문 펼침(`timelineStrategyText`) — 주문 이벤트만 있다.
 */
export const STRATEGY_DAY_GOLDEN: Readonly<
  Record<string, { logLine: string; timelineAction?: string; timelineText?: string }>
> = {
  // ── 기획서 하루 흐름 (seq 1~14) ──
  exposed: {
    logLine: "[09:42:13.215][상한가노출] KRX | ○○전자 | 매도잔량 185,400 | 누적 620,000",
  },
  buy12451: {
    logLine:
      "[09:45:02.861][12451][선매수] KRX | ○○전자 | 주문 · 조건 매도잔량≤50,000 / 실측 38,200 · 근거 호가(매도1잔량 52,100→38,200) · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms | 누적 861,800",
    timelineAction: "주문",
    timelineText:
      "선매수 · 조건 매도잔량≤50,000 / 실측 38,200 · 근거 호가(매도1잔량 52,100→38,200) · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms · 누적 861,800",
  },
  entered1: {
    logLine:
      "[09:45:02.880][상한가진입 1차] KRX | ○○전자 | 잔량/누적 즉시 30,000/900,000 · 1초 55,000/903,000 · 3초 72,000/908,000 | 누적 900,000",
  },
  queued12451: {
    logLine: "[09:45:02.880][12451][선매수] KRX | ○○전자 | 대기 · 300주 · 체결예상 930,000 (900,000 + 30,000) | 누적 900,000",
    timelineAction: "대기",
    timelineText: "300주 · 체결예상 930,000 (900,000 + 30,000) · 누적 900,000",
  },
  fill12451: {
    logLine: "[09:45:07.415][12451][선매수] KRX | ○○전자 | 체결 · 오차 +16,000 | 누적 914,000",
    timelineAction: "첫 체결",
    timelineText: "오차 +16,000 · 누적 914,000",
  },
  buy12452: {
    logLine:
      "[09:47:15.330][12452][추가매수] KRX | ○○전자 | 주문 · 조건 매수잔량≥150,000 / 실측 152,000 · 근거 호가(매수1잔량 148,500→152,000) · 상한가 매수잔량 152,000 · 12,350×300주 · 접수 +17ms | 누적 950,000",
    timelineAction: "주문",
    timelineText:
      "추가매수 · 조건 매수잔량≥150,000 / 실측 152,000 · 근거 호가(매수1잔량 148,500→152,000) · 상한가 매수잔량 152,000 · 12,350×300주 · 접수 +17ms · 누적 950,000",
  },
  queued12452: {
    logLine:
      "[09:47:15.347][12452][추가매수] KRX | ○○전자 | 대기 · 300주 · 체결예상 1,102,000 (950,000 + 152,000) | 누적 950,000",
    timelineAction: "대기",
    timelineText: "300주 · 체결예상 1,102,000 (950,000 + 152,000) · 누적 950,000",
  },
  // 연산자는 서버 reason_code 가 정본이다 — PostBuy 반등(… 잔량>발동잔량) = 「>」. 기획서 · 채택 목업
  // (mockup-order-log-tab.html :142 · mockup-today-orders-expand.html EV_12453)의 「≤」 는 형식 설명용 예시라 다르다.
  buy12453: {
    logLine:
      "[09:52:40.105][12453][후매수] KRX | ○○전자 | 주문 · 조건 매수잔량>100,000 / 실측 100,000 · 근거 호가(매수1잔량 104,000→100,000) · 상한가 매수잔량 100,000 · 12,350×300주 · 접수 +17ms | 누적 1,000,000",
    timelineAction: "주문",
    timelineText:
      "후매수 · 조건 매수잔량>100,000 / 실측 100,000 · 근거 호가(매수1잔량 104,000→100,000) · 상한가 매수잔량 100,000 · 12,350×300주 · 접수 +17ms · 누적 1,000,000",
  },
  queued12453: {
    logLine:
      "[09:52:40.122][12453][후매수] KRX | ○○전자 | 대기 · 300주 · 체결예상 1,100,000 (1,000,000 + 100,000) | 누적 1,000,000",
    timelineAction: "대기",
    timelineText: "300주 · 체결예상 1,100,000 (1,000,000 + 100,000) · 누적 1,000,000",
  },
  fill12452: {
    logLine: "[09:55:31.208][12452][추가매수] KRX | ○○전자 | 체결 · 오차 +41,000 | 누적 1,061,000",
    timelineAction: "첫 체결",
    timelineText: "오차 +41,000 · 누적 1,061,000",
  },
  cancel12453: {
    logLine:
      "[09:56:03.411][12453][후매수] KRX | ○○전자 | 취소 · 매수1 이탈 · 남은 거래량 12,000 (1,100,000 − 1,088,000) | 누적 1,088,000",
    timelineAction: "취소",
    timelineText: "매수1 이탈 · 남은 거래량 12,000 (1,100,000 − 1,088,000) · 누적 1,088,000",
  },
  sell12454: {
    logLine:
      "[10:11:40.210][12454][호가매도] KRX | ○○전자 | 주문 · 조건 매수잔량≤50,000 / 실측 47,800 · 근거 호가(매수1잔량 51,200→47,800) · 매수1 12,350·47,800주 · 12,350×600주 지정가 · 접수 +16ms | 누적 1,640,000",
    timelineAction: "주문",
    timelineText:
      "호가매도 · 조건 매수잔량≤50,000 / 실측 47,800 · 근거 호가(매수1잔량 51,200→47,800) · 매수1 12,350·47,800주 · 12,350×600주 지정가 · 접수 +16ms · 누적 1,640,000",
  },
  sell12455: {
    logLine:
      "[10:11:58.310][12455][체결매도] KRX | ○○전자 | 주문 · 조건 단건 매도체결≥10,000 / 실측 18,000 · 근거 체결(12,350 매도체결 18,000주) · 매수1 12,350·42,000주 · 12,350×300주 지정가 · 접수 +16ms | 누적 1,650,000",
    timelineAction: "주문",
    timelineText:
      "체결매도 · 조건 단건 매도체결≥10,000 / 실측 18,000 · 근거 체결(12,350 매도체결 18,000주) · 매수1 12,350·42,000주 · 12,350×300주 지정가 · 접수 +16ms · 누적 1,650,000",
  },
  reject: {
    logLine: "[10:12:01.004][—][후매수] KRX | ○○전자 | 거부 · 주문거부 가격범위초과 | 누적 1,651,200",
    timelineAction: "거부",
    timelineText: "주문거부 가격범위초과 · 누적 1,651,200",
  },

  // ── 조립 규칙 갈래 (seq 101~) ──
  queuedPartial: {
    logLine:
      "[11:00:01.100][12456][선매수] KRX | ○○전자 | 대기 · 200주 · 100주 즉시체결 · 체결예상 930,000 (900,000 + 30,000) | 누적 900,000",
    timelineAction: "대기",
    timelineText: "200주 · 100주 즉시체결 · 체결예상 930,000 (900,000 + 30,000) · 누적 900,000",
  },
  queuedFull: {
    logLine: "[11:00:02.200][12457][선매수] KRX | ○○전자 | 즉시체결 · 300주 · 대기 없음 | 누적 905,000",
    timelineAction: "즉시체결",
    timelineText: "300주 · 대기 없음 · 누적 905,000",
  },
  exposedOpen: {
    logLine: "[11:00:03.300][상한가노출] NXT | ○○전자 | 시초 상한가 · 매도잔량 42,100 | 누적 310,500",
  },
  enteredShort: {
    logLine:
      "[11:00:04.400][상한가진입 2차] KRX | ○○전자 | 잔량/누적 즉시 41,000/1,200,000 · 1초 38,000/1,204,000 · 3초 전 이탈 | 누적 1,200,000",
  },
  fillNegative: {
    logLine: "[11:00:05.500][12458][추가매수] KRX | ○○전자 | 체결 · 오차 −5,000 | 누적 1,105,000",
    timelineAction: "첫 체결",
    timelineText: "오차 −5,000 · 누적 1,105,000",
  },
  cancelNoRemaining: {
    logLine: "[11:00:06.600][12459][선매수] KRX | ○○전자 | 취소 · 수동 취소 | 누적 1,110,000",
    timelineAction: "취소",
    timelineText: "수동 취소 · 누적 1,110,000",
  },
  cancelOther: {
    logLine: "[11:00:07.700][12460][추가매수] KRX | ○○전자 | 취소 · 기타 | 누적 1,120,000",
    timelineAction: "취소",
    timelineText: "기타 · 누적 1,120,000",
  },
  cancelUnknown: {
    logLine: "[11:00:08.800][12461][호가매도] KRX | ○○전자 | 취소 · 42 | 누적 1,130,000",
    timelineAction: "취소",
    timelineText: "42 · 누적 1,130,000",
  },
  unknownKind: {
    logLine: "[11:00:09.900][12462][선매수] KRX | ○○전자 | 99 | 누적 1,140,000",
    timelineAction: "99",
    timelineText: "누적 1,140,000",
  },
  groupZeroOrder: {
    logLine: "[11:00:10.010][12463][0] KRX | ○○전자 | 주문 · 상한가 매수잔량 0 · 12,350×10주 | 누적 1,150,000",
    timelineAction: "주문",
    // group 0 = None — 그룹 접두 없음(원문 「0」 은 로그 구분 칸에만)
    timelineText: "상한가 매수잔량 0 · 12,350×10주 · 누적 1,150,000",
  },
  sellFillHook: {
    logLine:
      "[11:00:11.011][12464][체결훅] KRX | ○○전자 | 주문 · 근거 체결통보(12,300 50주) · 12,300×50주 지정가 · 접수 +15ms | 누적 1,160,000",
    timelineAction: "주문",
    timelineText: "체결훅 · 근거 체결통보(12,300 50주) · 12,300×50주 지정가 · 접수 +15ms · 누적 1,160,000",
  },
  riseRate: {
    logLine:
      "[11:00:12.012][12465][선매수] KRX | ○○전자 | 주문 · 조건 상승률≥3.00% / 실측 4.12% · 근거 체결(12,350 체결 2,000주) · 상한가 매수잔량 0 · 12,350×100주 · 접수 +18ms | 누적 1,170,000",
    timelineAction: "주문",
    timelineText:
      "선매수 · 조건 상승률≥3.00% / 실측 4.12% · 근거 체결(12,350 체결 2,000주) · 상한가 매수잔량 0 · 12,350×100주 · 접수 +18ms · 누적 1,170,000",
  },
};
