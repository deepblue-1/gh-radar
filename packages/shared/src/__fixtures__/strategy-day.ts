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
 * 세 벌:
 *   - `STRATEGY_DAY_*` — 기획서 하루 흐름(seq 1~14). 목록 · 스토어 · e2e 목 응답이 「하루」 로 쓴다.
 *   - `STRATEGY_BRANCH_ROWS` — 조립 규칙의 갈래(seq 101~ — 하루 흐름과 섞이지 않게). 골든 테스트 전용.
 *   - `STRATEGY_AUTO_SELL_ROWS` — Phase 27 자동매도(group 9 · kind 6/7 · 11~14) 갈래(seq 201~). 기대 문장은
 *     별도 표 `STRATEGY_AUTO_SELL_GOLDEN` — 앞 두 벌의 개수 단언을 건드리지 않는다.
 *   - `STRATEGY_LIMIT_FEATURE_ROWS` — Phase 28 관찰자 저널 kind 15 상한가 특징(분당 · 키당 1행 · 계좌 없음 · seq 301~).
 *     기대 문장은 별도 표 `STRATEGY_LIMIT_FEATURE_GOLDEN`(행 이름 → `orderLogLineText`) — e2e 28-11 이 같은 한 벌을 읽는다.
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 27 — 자동매도 (gh-trade Phase 28 · HANDOFF §4-1 v0.2 칸 재해석 · order-log-progress.md ④ 표)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 자동매도 갈래(seq 201~ · 시각 순). 값은 `limit-chaser.md` §6-6 예시 — 상한가 13,000 · 기준가 10,000(하한가
 * 7,000) · 시작조건 2% → 발동가 12,800 · 비율 10% · 주기 거래량 60,000 → 6,000주. 계좌는 가짜 값(D-27).
 * kind 11 · 13 · 14 는 주문번호가 없다(F-A 줄 `[—]`) · kind 12 order_no = 원주문 번호 · message = 새 번호.
 */
const AUTO_SELL_DB_ROWS: ReadonlyArray<readonly [string, StrategyEventDbRow]> = [
  [
    // 장전 동시호가 회차 — price 하한가 · cond 동시호가 매도비율 % / 예상체결량 · ev_kind 1(Quote)여도 「근거 호가」 아님
    "asAuctionOrder",
    dbRow({
      seq: 201,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "08:40:00.010"),
      kind: 6,
      group: 9,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13001",
      price: 7_000,
      qty: 1_200,
      reason_code: "AutoSellAuctionOrder 동시호가회차매도",
      cond_threshold: 20,
      cond_actual: 6_000,
      cond_metric: 3,
      ev_kind: 1,
      ev_price: 12_500,
      ev_qty_before: 10_000,
      ev_qty_after: 8_800,
      ev_trade_qty: 6_000,
      entry_round: 1,
    }),
  ],
  [
    // 회차 감축 취소 — cancel_reason 11
    "asCancelAuctionTrim",
    dbRow({
      seq: 202,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "08:45:00.020"),
      kind: 7,
      group: 9,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13001",
      qty: 400,
      cancel_reason: 11,
    }),
  ],
  [
    // 켬 0 → 1 — 같은 틱에 감시 전이가 없으면 기준가격 0(기준 조각 없음)
    "asStateOn",
    dbRow({
      seq: 203,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:30:00.100"),
      kind: 13,
      group: 9,
      cum_volume: 850_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellStateChange 상태변경",
      cond_threshold: 0,
      cond_actual: 1,
      queue_case: 1,
    }),
  ],
  [
    // 발동 N>0 — 상한가 2% 이탈 · 발동가 12,800 · 실측 체결가 12,790 · 기준가격 13,000 · cum = T0 누적
    "asTriggerN",
    dbRow({
      seq: 204,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:00.200"),
      kind: 11,
      group: 9,
      cum_volume: 914_000,
      account_no: FIXTURE_ACCOUNT_NO,
      price: 12_800,
      reason_code: "AutoSellTriggerN 발동(체결가<=발동가)",
      cond_threshold: 2,
      cond_actual: 12_790,
      cond_metric: 4,
      ev_kind: 2,
      ev_price: 12_790,
      ev_qty_before: 10_000,
      ev_trade_qty: 500,
      bid1_price: 13_000,
      queue_case: 1,
      entry_round: 2,
    }),
  ],
  [
    // 발동 N=0 — 기준가격 이탈 관측 뒤 다음 체결(발동가 없음)
    "asTrigger0",
    dbRow({
      seq: 205,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:01.300"),
      kind: 11,
      group: 9,
      cum_volume: 915_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellTrigger0 발동(기준가격 이탈 뒤 다음 체결)",
      cond_threshold: 0,
      cond_actual: 12_990,
      cond_metric: 4,
      ev_kind: 2,
      ev_price: 12_990,
      ev_trade_qty: 100,
      bid1_price: 13_000,
      queue_case: 1,
    }),
  ],
  [
    // 발동 — 기준 종류 2 매수가 (매수가 12,500 · 3% → 발동가 12,125)
    "asTriggerBuyPrice",
    dbRow({
      seq: 206,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:02.400"),
      kind: 11,
      group: 9,
      exchange: "NXT",
      cum_volume: 320_000,
      account_no: FIXTURE_ACCOUNT_NO,
      price: 12_125,
      reason_code: "AutoSellTriggerN 발동(체결가<=발동가)",
      cond_threshold: 3,
      cond_actual: 12_100,
      cond_metric: 4,
      ev_kind: 2,
      ev_price: 12_100,
      ev_trade_qty: 200,
      bid1_price: 12_500,
      queue_case: 2,
      entry_round: 3,
    }),
  ],
  [
    // 감시 2 → 매도중 3 — 기준가격 13,000 · 누적 매도 0(조각 없음)
    "asStateSelling",
    dbRow({
      seq: 207,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:02.500"),
      kind: 13,
      group: 9,
      cum_volume: 914_000,
      account_no: FIXTURE_ACCOUNT_NO,
      price: 13_000,
      reason_code: "AutoSellStateChange 상태변경",
      cond_threshold: 2,
      cond_actual: 3,
      queue_case: 1,
    }),
  ],
  [
    // 주기 매도(매도1호가) — 주기 거래량 60,000 × 10% = 6,000주 · ev_qty_before/after = 직전/이번 주기 누적
    "asAsk1",
    dbRow({
      seq: 208,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:10.500"),
      kind: 6,
      group: 9,
      cum_volume: 974_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13002",
      price: 12_990,
      qty: 6_000,
      reason_code: "AutoSellAsk1 주기매도(매도1호가)",
      cond_threshold: 10,
      cond_actual: 60_000,
      cond_metric: 3,
      ev_kind: 2,
      ev_price: 12_990,
      ev_qty_before: 914_000,
      ev_qty_after: 974_000,
      ev_trade_qty: 60_000,
    }),
  ],
  [
    // 주기 매도(매수1호가) — 양쪽의 매수1 몫 · 주문조건 · 매수1 · 접수 지연 조각까지
    "asBid1",
    dbRow({
      seq: 209,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:20.600"),
      kind: 6,
      group: 9,
      cum_volume: 1_004_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13003",
      price: 12_980,
      qty: 3_000,
      order_condition: "0",
      reason_code: "AutoSellBid1 주기매도(매수1호가)",
      cond_threshold: 10,
      cond_actual: 30_000,
      cond_metric: 3,
      ev_kind: 2,
      ev_price: 12_980,
      ev_qty_before: 974_000,
      ev_qty_after: 1_004_000,
      ev_trade_qty: 30_000,
      bid1_price: 12_980,
      bid1_qty: 45_000,
      accept_latency_us: 16_000,
    }),
  ],
  [
    // 정정 — order_no 원주문 · 새 가격/수량 · 원주문 가격/잔량 · message 새 번호(숫자만)
    "asModify",
    dbRow({
      seq: 210,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:30.700"),
      kind: 12,
      group: 9,
      cum_volume: 1_010_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "0000100",
      price: 12_950,
      qty: 3_000,
      reason_code: "AutoSellModify 정정(비싼 미체결 → 목표가)",
      cond_threshold: 13_100,
      cond_actual: 2_000,
      cond_metric: 4,
      message: "0000123",
      accept_latency_us: 14_000,
    }),
  ],
  [
    // 정정 — 새 번호를 모르면 message 빈 값(「새 번호」 조각 생략)
    "asModifyNoNewNo",
    dbRow({
      seq: 211,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:31.800"),
      kind: 12,
      group: 9,
      cum_volume: 1_011_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "0000101",
      price: 12_950,
      qty: 3_000,
      reason_code: "AutoSellModify 정정(비싼 미체결 → 목표가)",
      cond_threshold: 13_100,
      cond_actual: 2_000,
      cond_metric: 4,
    }),
  ],
  [
    // 매수 우선 취소 — cancel_reason 10
    "asCancelBuyFirst",
    dbRow({
      seq: 212,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:00:40.900"),
      kind: 7,
      group: 9,
      cum_volume: 1_020_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13003",
      qty: 3_000,
      cancel_reason: 10,
    }),
  ],
  [
    // VI 멈춤 — cond_actual 1
    "asPauseVI",
    dbRow({
      seq: 213,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:01:00.010"),
      kind: 14,
      group: 9,
      cum_volume: 1_030_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellPauseVI 멈춤(VI)",
      cond_actual: 1,
    }),
  ],
  [
    // 동시호가 멈춤 (KRX)
    "asPauseAuctionKrx",
    dbRow({
      seq: 214,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:20:00.020"),
      kind: 14,
      group: 9,
      cum_volume: 1_500_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellPauseAuction 멈춤(동시호가)",
      cond_actual: 2,
    }),
  ],
  [
    // 동시호가 멈춤 (NXT — 본문 「단일가」)
    "asPauseAuctionNxt",
    dbRow({
      seq: 215,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:20:00.030"),
      kind: 14,
      group: 9,
      exchange: "NXT",
      cum_volume: 400_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellPauseAuction 멈춤(동시호가)",
      cond_actual: 2,
    }),
  ],
  [
    // 재개 — expected_cum = 새 T0
    "asResume",
    dbRow({
      seq: 216,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:30:00.040"),
      kind: 14,
      group: 9,
      cum_volume: 1_600_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellResume 재개(새 T0)",
      cond_actual: 3,
      expected_cum: 1_600_000,
    }),
  ],
  [
    // 매도중 3 → 완료 4 — 누적 매도 6,000주
    "asStateDone",
    dbRow({
      seq: 217,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:31:00.050"),
      kind: 13,
      group: 9,
      cum_volume: 1_650_000,
      account_no: FIXTURE_ACCOUNT_NO,
      price: 13_000,
      qty: 6_000,
      reason_code: "AutoSellStateChange 상태변경",
      cond_threshold: 3,
      cond_actual: 4,
      queue_case: 1,
    }),
  ],
  [
    // WR-05 — 상따 체결매도가 group 9 로 뒤바뀌어 옴(사유는 상따) → 기존 매도 본문 · 배지는 group 그대로
    "asWr05LegacyInGroup9",
    dbRow({
      seq: 218,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:32:00.060"),
      kind: 6,
      group: 9,
      cum_volume: 1_660_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13004",
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
    // WR-05 — 자동매도 주기 매도가 group 5 로 뒤바뀌어 옴(사유는 AutoSellAsk1) → 자동매도 본문 · 배지 「체결매도」
    "asWr05AutoSellInGroup5",
    dbRow({
      seq: 219,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:32:01.070"),
      kind: 6,
      group: 5,
      cum_volume: 1_661_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13005",
      price: 12_990,
      qty: 6_000,
      reason_code: "AutoSellAsk1 주기매도(매도1호가)",
      cond_threshold: 10,
      cond_actual: 60_000,
      cond_metric: 3,
      ev_kind: 2,
      ev_price: 12_990,
      ev_trade_qty: 60_000,
    }),
  ],
  [
    // 집합 밖 AutoSell 토큰(미래 사유) — D-10 폴백(원문 kind · 본문 없음)
    "asUnknownToken",
    dbRow({
      seq: 220,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:32:02.080"),
      kind: 6,
      group: 9,
      cum_volume: 1_662_000,
      account_no: FIXTURE_ACCOUNT_NO,
      order_no: "13006",
      price: 12_990,
      qty: 100,
      reason_code: "AutoSellFoo 미래사유",
      cond_threshold: 10,
      cond_actual: 1_000,
      cond_metric: 3,
    }),
  ],
  [
    // 모르는 멈춤 값 — 행위 원문 숫자 · 본문 없음
    "asPauseUnknown",
    dbRow({
      seq: 221,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:32:03.090"),
      kind: 14,
      group: 9,
      cum_volume: 1_663_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellPauseVI 멈춤(VI)",
      cond_actual: 7,
    }),
  ],
  [
    // 모르는 상태 값 — 낱말 원문 숫자
    "asStateUnknown",
    dbRow({
      seq: 222,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "15:32:04.100"),
      kind: 13,
      group: 9,
      cum_volume: 1_664_000,
      account_no: FIXTURE_ACCOUNT_NO,
      reason_code: "AutoSellStateChange 상태변경",
      cond_threshold: 4,
      cond_actual: 9,
    }),
  ],
];

/** 자동매도 갈래 이름 → 공개 행 (seq 201~ · 앞 두 벌과 별도). */
export const STRATEGY_AUTO_SELL_ROWS: Readonly<Record<string, StrategyEventRow>> = Object.fromEntries(
  AUTO_SELL_DB_ROWS.map(([name, r]) => [name, toStrategyEventRow(r)]),
);

/**
 * 자동매도 갈래 → 표면별 기대 문장(골든 — `toBe` 직접 비교). 조각 낱말은 WinForms `StrategyEventFormatter`
 * 문장 규칙 표(order-log-progress.md 「자동매도」 절)를 웹 F-A 「행위 · 본문 | 누적」 문법으로 옮긴 것이다.
 */
export const STRATEGY_AUTO_SELL_GOLDEN: Readonly<
  Record<string, { logLine: string; timelineAction: string; timelineText: string }>
> = {
  asAuctionOrder: {
    logLine:
      "[08:40:00.010][13001][자동매도] KRX | ○○전자 | 주문 · 동시호가 1회차 매도 1,200주 @7,000 · 예상체결량 6,000 × 20% · 예상체결가 12,500 · 보관 10,000→8,800 | 누적 0",
    timelineAction: "주문",
    timelineText:
      "자동매도 · 동시호가 1회차 매도 1,200주 @7,000 · 예상체결량 6,000 × 20% · 예상체결가 12,500 · 보관 10,000→8,800 · 누적 0",
  },
  asCancelAuctionTrim: {
    logLine: "[08:45:00.020][13001][자동매도] KRX | ○○전자 | 취소 · 동시호가 감축 | 누적 0",
    timelineAction: "취소",
    timelineText: "동시호가 감축 · 누적 0",
  },
  asStateOn: {
    logLine: "[09:30:00.100][—][자동매도] KRX | ○○전자 | 상태 · 자동매도 꺼짐 → 대기 | 누적 850,000",
    timelineAction: "상태",
    timelineText: "자동매도 꺼짐 → 대기 · 누적 850,000",
  },
  asTriggerN: {
    logLine:
      "[10:00:00.200][—][자동매도] KRX | ○○전자 | 발동 · 상한가 2% 이탈 (발동가 12,800) · 실측 12,790 · 기준 상한가 13,000 | 누적 914,000",
    timelineAction: "발동",
    timelineText: "상한가 2% 이탈 (발동가 12,800) · 실측 12,790 · 기준 상한가 13,000 · 누적 914,000",
  },
  asTrigger0: {
    logLine:
      "[10:00:01.300][—][자동매도] KRX | ○○전자 | 발동 · 상한가 이탈 · 실측 12,990 · 기준 상한가 13,000 | 누적 915,000",
    timelineAction: "발동",
    timelineText: "상한가 이탈 · 실측 12,990 · 기준 상한가 13,000 · 누적 915,000",
  },
  asTriggerBuyPrice: {
    logLine:
      "[10:00:02.400][—][자동매도] NXT | ○○전자 | 발동 · 매수가 3% 이탈 (발동가 12,125) · 실측 12,100 · 기준 매수가 12,500 | 누적 320,000",
    timelineAction: "발동",
    timelineText: "매수가 3% 이탈 (발동가 12,125) · 실측 12,100 · 기준 매수가 12,500 · 누적 320,000",
  },
  asStateSelling: {
    logLine:
      "[10:00:02.500][—][자동매도] KRX | ○○전자 | 상태 · 자동매도 감시 → 매도중 · 기준 상한가 13,000 | 누적 914,000",
    timelineAction: "상태",
    timelineText: "자동매도 감시 → 매도중 · 기준 상한가 13,000 · 누적 914,000",
  },
  asAsk1: {
    logLine:
      "[10:00:10.500][13002][자동매도] KRX | ○○전자 | 주문 · 매도 6,000주 @12,990 · 주기 거래량 60,000 × 10% · 매도1호가 | 누적 974,000",
    timelineAction: "주문",
    timelineText: "자동매도 · 매도 6,000주 @12,990 · 주기 거래량 60,000 × 10% · 매도1호가 · 누적 974,000",
  },
  asBid1: {
    logLine:
      "[10:00:20.600][13003][자동매도] KRX | ○○전자 | 주문 · 매도 3,000주 @12,980 지정가 · 주기 거래량 30,000 × 10% · 매수1호가 · 매수1 12,980·45,000주 · 접수 +16ms | 누적 1,004,000",
    timelineAction: "주문",
    timelineText:
      "자동매도 · 매도 3,000주 @12,980 지정가 · 주기 거래량 30,000 × 10% · 매수1호가 · 매수1 12,980·45,000주 · 접수 +16ms · 누적 1,004,000",
  },
  asModify: {
    logLine:
      "[10:00:30.700][0000100][자동매도] KRX | ○○전자 | 정정 · 3,000주 @12,950 · 원주문 @13,100 잔량 2,000주 · 새 번호 0000123 · 접수 +14ms | 누적 1,010,000",
    timelineAction: "정정",
    timelineText: "3,000주 @12,950 · 원주문 @13,100 잔량 2,000주 · 새 번호 0000123 · 접수 +14ms · 누적 1,010,000",
  },
  asModifyNoNewNo: {
    logLine:
      "[10:00:31.800][0000101][자동매도] KRX | ○○전자 | 정정 · 3,000주 @12,950 · 원주문 @13,100 잔량 2,000주 | 누적 1,011,000",
    timelineAction: "정정",
    timelineText: "3,000주 @12,950 · 원주문 @13,100 잔량 2,000주 · 누적 1,011,000",
  },
  asCancelBuyFirst: {
    logLine: "[10:00:40.900][13003][자동매도] KRX | ○○전자 | 취소 · 매수 우선 취소 | 누적 1,020,000",
    timelineAction: "취소",
    timelineText: "매수 우선 취소 · 누적 1,020,000",
  },
  asPauseVI: {
    logLine:
      "[10:01:00.010][—][자동매도] KRX | ○○전자 | VI 멈춤 · VI 발동 · 신규·정정 멈춤(미체결 유지) | 누적 1,030,000",
    timelineAction: "VI 멈춤",
    timelineText: "VI 발동 · 신규·정정 멈춤(미체결 유지) · 누적 1,030,000",
  },
  asPauseAuctionKrx: {
    logLine:
      "[15:20:00.020][—][자동매도] KRX | ○○전자 | 동시호가 멈춤 · 동시호가 · 신규·정정 멈춤(미체결 유지) | 누적 1,500,000",
    timelineAction: "동시호가 멈춤",
    timelineText: "동시호가 · 신규·정정 멈춤(미체결 유지) · 누적 1,500,000",
  },
  asPauseAuctionNxt: {
    logLine:
      "[15:20:00.030][—][자동매도] NXT | ○○전자 | 동시호가 멈춤 · 단일가 · 신규·정정 멈춤(미체결 유지) | 누적 400,000",
    timelineAction: "동시호가 멈춤",
    timelineText: "단일가 · 신규·정정 멈춤(미체결 유지) · 누적 400,000",
  },
  asResume: {
    logLine: "[15:30:00.040][—][자동매도] KRX | ○○전자 | 재개 · 새 T0 누적 1,600,000 | 누적 1,600,000",
    timelineAction: "재개",
    timelineText: "새 T0 누적 1,600,000 · 누적 1,600,000",
  },
  asStateDone: {
    logLine:
      "[15:31:00.050][—][자동매도] KRX | ○○전자 | 상태 · 자동매도 매도중 → 완료 · 기준 상한가 13,000 · 매도 누적 6,000주 | 누적 1,650,000",
    timelineAction: "상태",
    timelineText: "자동매도 매도중 → 완료 · 기준 상한가 13,000 · 매도 누적 6,000주 · 누적 1,650,000",
  },
  asWr05LegacyInGroup9: {
    logLine:
      "[15:32:00.060][13004][자동매도] KRX | ○○전자 | 주문 · 조건 단건 매도체결≥10,000 / 실측 18,000 · 근거 체결(12,350 매도체결 18,000주) · 매수1 12,350·42,000주 · 12,350×300주 지정가 · 접수 +16ms | 누적 1,660,000",
    timelineAction: "주문",
    timelineText:
      "자동매도 · 조건 단건 매도체결≥10,000 / 실측 18,000 · 근거 체결(12,350 매도체결 18,000주) · 매수1 12,350·42,000주 · 12,350×300주 지정가 · 접수 +16ms · 누적 1,660,000",
  },
  asWr05AutoSellInGroup5: {
    logLine:
      "[15:32:01.070][13005][체결매도] KRX | ○○전자 | 주문 · 매도 6,000주 @12,990 · 주기 거래량 60,000 × 10% · 매도1호가 | 누적 1,661,000",
    timelineAction: "주문",
    timelineText: "체결매도 · 매도 6,000주 @12,990 · 주기 거래량 60,000 × 10% · 매도1호가 · 누적 1,661,000",
  },
  asUnknownToken: {
    logLine: "[15:32:02.080][13006][자동매도] KRX | ○○전자 | 6 | 누적 1,662,000",
    timelineAction: "6",
    timelineText: "자동매도 · 누적 1,662,000",
  },
  asPauseUnknown: {
    logLine: "[15:32:03.090][—][자동매도] KRX | ○○전자 | 7 | 누적 1,663,000",
    timelineAction: "7",
    timelineText: "누적 1,663,000",
  },
  asStateUnknown: {
    logLine: "[15:32:04.100][—][자동매도] KRX | ○○전자 | 상태 · 자동매도 완료 → 9 | 누적 1,664,000",
    timelineAction: "상태",
    timelineText: "자동매도 완료 → 9 · 누적 1,664,000",
  },
};

// ── Phase 28 (28-09) — 관찰자 저널 kind 15 상한가 특징 ──────────────────────────────────────────────

/**
 * kind 15 행(gh-trade 인박스 261005 「(B)」 숫자 슬롯 매핑표 — 85 필드를 StrategyEvent 칸에 싣는다).
 * price=last_px · ev_price=upper_px · limit_bid_qty=q_qty · ev_qty_before=q_krw · ev_qty_after=wall_krw_visible ·
 * ask_qty_at_limit=wall_qty_hidden · open_at_limit=wall_truncated · ev_trade_qty=sell_led_10s · immediate_fill_qty=buy_led_10s ·
 * ahead_qty=cancel_10s · base_cum=new_10s · expected_cum=auction_fill_10s · cond_threshold=drain_s · cond_actual=rate_bp ·
 * entry_round=lock_state · qty=lock_elapsed_s · has_remaining=auction · result_code=p_break_bp · snap_qty 길이=model_state ·
 * message=`buy:<회원>=<bp>,…;sell:<회원>=<bp>,…|m=<model>`. group 0 · 계좌 · 주문번호 "" · ev_kind 1(Quote).
 */
function limitFeatureDbRow(
  over: Partial<StrategyEventDbRow> & Pick<StrategyEventDbRow, "seq" | "gw_time_ms">,
): StrategyEventDbRow {
  return dbRow({ kind: 15, group: 0, ev_kind: 1, ev_price: 13_000, price: 13_000, cond_actual: 3_000, result_code: -1, ...over });
}

const LIMIT_FEATURE_DB_ROWS: ReadonlyArray<readonly [string, StrategyEventDbRow]> = [
  [
    // 미도달(lock 0) · 매도벽 잘림(「+」) · 상한가 표기 · 10초 체결 합
    "lfNotReached",
    limitFeatureDbRow({
      seq: 301,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:45:00.000"),
      cum_volume: 700_000,
      price: 12_680,
      cond_actual: 2_680,
      limit_bid_qty: 0,
      ev_qty_before: 0,
      ev_qty_after: 420_000_000,
      ask_qty_at_limit: 15_000,
      open_at_limit: true,
      ev_trade_qty: 1_200,
      immediate_fill_qty: 2_800,
      entry_round: 0,
      message: "buy:00050=6000,00030=4000;sell:00002=10000|m=0",
    }),
  ],
  [
    // 잠김(lock 1) 43초 — UI-SPEC ②-2 예문 그대로
    "lfLocked43",
    limitFeatureDbRow({
      seq: 302,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:46:00.000"),
      cum_volume: 900_000,
      limit_bid_qty: 133_077,
      ev_qty_before: 1_730_000_000,
      ev_qty_after: 0,
      cond_threshold: -1,
      ev_trade_qty: 3_700,
      immediate_fill_qty: 6_300,
      base_cum: 12_400,
      ahead_qty: 2_300,
      entry_round: 1,
      qty: 43,
      message: "buy:00050=7407,00030=2222,00017=370;sell:00002=10000|m=0",
    }),
  ],
  [
    // 잠김 1분 43초 — 소진 분 표기 · 10초 반반 · 신규 0
    "lfLocked103",
    limitFeatureDbRow({
      seq: 303,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:47:00.000"),
      cum_volume: 905_000,
      limit_bid_qty: 116_923,
      ev_qty_before: 1_520_000_000,
      ev_qty_after: 0,
      cond_threshold: 95,
      ev_trade_qty: 5_000,
      immediate_fill_qty: 5_000,
      base_cum: 0,
      ahead_qty: 4_100,
      entry_round: 1,
      qty: 103,
      message: "buy:00050=5000;sell:00002=6000,00003=4000|m=0",
    }),
  ],
  [
    // 깨짐(lock 2) — 매도 우세 · 체결 합 · 모델 적용(snap 길이 1 · 확률 18.3%)
    "lfBroken",
    limitFeatureDbRow({
      seq: 304,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "09:48:00.000"),
      cum_volume: 925_000,
      price: 12_950,
      cond_actual: 2_950,
      limit_bid_qty: 16_154,
      ev_qty_before: 210_000_000,
      ev_qty_after: 90_000_000,
      cond_threshold: 95,
      ev_trade_qty: 14_356,
      immediate_fill_qty: 5_044,
      entry_round: 2,
      qty: 0,
      result_code: 1_830,
      snap_qty: [1],
      message: "buy:00050=7407;sell:00002=8000,00003=2000|m=1",
    }),
  ],
  [
    // 단일가(auction) 잠김 — lead 앞 「단일가 · 」 · 10초 체결 없음 · 창구 message 없음
    "lfAuctionLocked",
    limitFeatureDbRow({
      seq: 305,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:12:00.000"),
      cum_volume: 1_100_000,
      limit_bid_qty: 75_385,
      ev_qty_before: 980_000_000,
      ev_qty_after: 0,
      cond_threshold: -1,
      entry_round: 1,
      qty: 12,
      has_remaining: true,
      expected_cum: 1_500,
      message: "",
    }),
  ],
  [
    // 256B 경계에서 잘린 message — 꼬리 원소 · 매도 갈래 · |m= 이 없다(지어내지 않는다 → 「매도 —」)
    "lfTruncatedMessage",
    limitFeatureDbRow({
      seq: 306,
      gw_time_ms: kstMs(FIXTURE_TRADE_DATE, "10:13:00.000"),
      cum_volume: 1_200_000,
      limit_bid_qty: 180_431,
      ev_qty_before: 2_345_600_000,
      ev_qty_after: 0,
      cond_threshold: 600,
      ev_trade_qty: 800,
      immediate_fill_qty: 200,
      base_cum: 3_000,
      ahead_qty: 0,
      entry_round: 1,
      qty: 300,
      message: "buy:00050=7407,0004",
    }),
  ],
];

/** kind 15 행(gw_time_ms 오름차순 · seq 301~ · 앞 세 벌과 별도). e2e 28-11 이 날짜만 옮겨 목 응답으로 쓴다. */
export const STRATEGY_LIMIT_FEATURE_ROWS: readonly StrategyEventRow[] = LIMIT_FEATURE_DB_ROWS.map(([, r]) =>
  toStrategyEventRow(r),
);

/** kind 15 행 이름 → 공개 행. */
export const STRATEGY_LIMIT_FEATURE_BY_NAME: Readonly<Record<string, StrategyEventRow>> = Object.fromEntries(
  LIMIT_FEATURE_DB_ROWS.map(([name, r]) => [name, toStrategyEventRow(r)]),
);

/**
 * kind 15 행 이름 → 주문로그 F-A 한 줄 평문(`orderLogLineText` — 종목명 칸은 `FIXTURE_STOCK_NAME`). UI-SPEC ②-2 정본 —
 * 구분 「상한가특징」 · 주문번호 칸 없음 · 행위 없음 · lead(「잠김 N초」)와 본문을 「 · 」 로 이은 한 줄 · 누적 = cum_volume.
 */
export const STRATEGY_LIMIT_FEATURE_GOLDEN: Readonly<Record<string, string>> = {
  lfNotReached:
    "[09:45:00.000][상한가특징] KRX | ○○전자 | 미도달 (+26.8%) · 매도벽 4.2억+ · 상한가 13,000 · 10초 매수 우세 70% · 체결 4,000주 · 창구 매수 키움증권 60% / 매도 신한증권 100% · 깨짐확률 관찰 중 | 누적 700,000",
  lfLocked43:
    "[09:46:00.000][상한가특징] KRX | ○○전자 | 잠김 43초 · 잔량 17.3억 · 매도벽 0 · 소진 — · 10초 매수 우세 63% · 신규 +12,400 / 취소 -2,300 · 창구 매수 키움증권 74% / 매도 신한증권 100% · 깨짐확률 관찰 중 | 누적 900,000",
  lfLocked103:
    "[09:47:00.000][상한가특징] KRX | ○○전자 | 잠김 1분 43초 · 잔량 15.2억 · 매도벽 0 · 소진 1분 35초 · 10초 매수·매도 반반 · 신규 0 / 취소 -4,100 · 창구 매수 키움증권 50% / 매도 신한증권 60% · 깨짐확률 관찰 중 | 누적 905,000",
  lfBroken:
    "[09:48:00.000][상한가특징] KRX | ○○전자 | 깨짐 · 잔량 2.1억 · 매도벽 0.9억 · 소진 1분 35초 · 10초 매도 우세 74% · 체결 19,400주 · 창구 매수 키움증권 74% / 매도 신한증권 80% · 깨짐확률 18.3% | 누적 925,000",
  lfAuctionLocked:
    "[10:12:00.000][상한가특징] KRX | ○○전자 | 단일가 · 잠김 12초 · 잔량 9.8억 · 매도벽 0 · 소진 — · 10초 체결 없음 · 신규 0 / 취소 0 · 창구 매수 — / 매도 — · 깨짐확률 관찰 중 | 누적 1,100,000",
  lfTruncatedMessage:
    "[10:13:00.000][상한가특징] KRX | ○○전자 | 잠김 5분 0초 · 잔량 23.5억 · 매도벽 0 · 소진 10분 0초 · 10초 매도 우세 80% · 신규 +3,000 / 취소 0 · 창구 매수 키움증권 74% / 매도 — · 깨짐확률 관찰 중 | 누적 1,200,000",
};
