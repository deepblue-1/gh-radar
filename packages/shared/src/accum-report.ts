/**
 * Phase 34 — 매집감지(accum) 보고서 계약 (server `GET /api/accum/report` · `GET /api/accum/report/:date/:isin` ↔ webapp).
 *
 * - 계약 정본: `docs/inbox/from-gh-trade/261020-accum-flow-export.md` 열 사전(gh-trade `teamflow_accum.FLAT_COLUMNS` 37열 + payload 7키(이 순서 · avg_px · pos_net 은 선택 키)).
 * - **행 키는 gh-trade export 열 이름 그대로(snake_case)** — DB 표 `limitup_accum_flow` 열 이름도 같고 RPC 가
 *   `to_jsonb` 로 싣는다(매퍼 없음). **봉투 키(access · dates · date · rows · row)는 단어 하나라 그대로.**
 * - 목록/상세 분리(D-06): 목록 행 `AccumReportRow` 는 평평한 37열 + pnl + 당일 축 4 + 전날 2(payload 없음 · 20261026010000),
 *   상세 행 `AccumDetailRow` 는 평평한 37열 + 당일 축 4 + `payload`.
 * - 단위: `*_ms` = epoch ms · 가격 · 금액(`*_krw` · `*_px`) = 원 정수 · 수량 = 주 · **`*_rate` = % 그대로(30.0 = +30%)** ·
 *   `since_date` = `"YYYYMMDD"` 문자열 · NaN/inf 는 null. 억 · % 표시 변환은 웹 표시층(`webapp/src/lib/accum-report.ts`)만 한다.
 * - `pos_*` = 서버 상태기 값(등록 이후 누적 · 우리 체결 제외 · 마지막 사이클) · `day_*` / payload = 119 pcap 재계산(그날 하루 전체).
 * - 당일 축 4열(pos_day_buy_krw · pos_day_sell_krw · th_recent_pieces · th_recent_sec — quick-261025-uf2)은 목록(20261026010000 부터) ·
 *   상세 RPC 모두 싣는다. 목록은 + 전날 2키(prev_pos_day_buy_krw · prev_pos_day_sell_krw) · 봉투 prev_date(quick-261026-01h).
 * - **라이브 kind 16 계약(`accum-signal.ts` 의 AccumState · AccumSignal)과 별개다 — join 없음(D-22 · 30일 purge 비대칭).**
 *   이름이 겹치지 않게 `AccumReport*` 접두를 쓴다.
 */
import type { LimitupDate } from "./limitup-report";
import type { TeamflowPnl } from "./teamflow-report";

/** limitup_accum_flow 한 행의 평평한 37열 + 선택 키(목록 RPC 응답 행 · payload 키 없음). PK (date, isin). */
export interface AccumReportRow {
  date: LimitupDate;
  /** ISIN 12자 — 비 KR(KYG…) 실재 */
  isin: string;
  /** 6자 코드(`isin[3:9]`) */
  short_code: string;
  /** A0 → 마스터 CSV → 둘 다 없으면 null */
  name: string | null;
  /** "KOSPI" | "KOSDAQ" | null */
  market: string | null;
  base: number | null;
  upper: number | null;
  last_px: number | null;
  last_rate: number | null;
  high_px: number | null;
  high_rate: number | null;
  /** 마지막 사이클 상태 — 1 매집중 · 2 매도중 · 3 종료 */
  state: number | null;
  /** 0 끝나지 않음 · 1 청산 · 2 이월 탈락(복원 안 됨) · 3 이월 만료 */
  end_reason: number | null;
  /** 마지막 사이클 번호 — 연속을 가정하지 않는다 */
  cycle: number | null;
  /** 이월 일수(이월 안 했으면 0) — 「이월 D+n」 */
  carry_days: number | null;
  /** 마지막 사이클 등록 거래일 "YYYYMMDD" */
  since_date: string | null;
  /** 마지막 사이클 등록 시각(초 해상도) */
  reg_time_ms: number | null;
  /** 마지막 사이클 종료 시각 — null = 장 마감까지 살아 있음 */
  end_time_ms: number | null;
  our_excluded_qty: number | null;
  mcap_krw: number | null;
  /** 서버 등록 임계 — 순매수 금액(원) */
  th_net_krw: number | null;
  /** 서버 등록 임계 — 한 가격 최소 조각 수(서버 키 th_min_same) */
  th_same: number | null;
  /** 서버 등록 임계 — 시총 상한(원 · 서버 키 th_max_mcap_krw) */
  th_mcap_krw: number | null;
  pos_buy_qty: number | null;
  pos_buy_krw: number | null;
  pos_sell_qty: number | null;
  pos_sell_krw: number | null;
  /** 등록 이후 순매수 금액(음수 가능) */
  pos_net_krw: number | null;
  /** 팀 매수 평단 */
  pos_avg_px: number | null;
  /** 이 사이클 최고 순매수 금액 */
  pos_peak_net_krw: number | null;
  /** 등록 순간 가격 */
  pos_reg_px: number | null;
  day_buy_krw: number | null;
  day_sell_krw: number | null;
  day_net_krw: number | null;
  day_buy_qty: number | null;
  day_sell_qty: number | null;
  schema_version: number | null;
  // quick-261025-uf2 — 목록(20261026010000 부터) · 상세 RPC 모두 싣는다 · 이 열 추가 전 적재 행 null ·
  // 옛 서버 RPC 응답(마이그레이션 적용 전 목록)엔 키 없음 → 선택 키 유지.
  /** 서버 당일 팀 매수 금액(원 · 그날 마지막 kind 16 snap_qty[2]) · 우리 체결 제외 · 전날 요약 원천 · `day_buy_krw` 와 다른 뜻. */
  pos_day_buy_krw?: number | null;
  /** 서버 당일 팀 매도 금액(원 · 그날 마지막 kind 16 snap_cum[2]) · 우리 체결 제외 · 전날 요약 원천 · `day_sell_krw` 와 다른 뜻. */
  pos_day_sell_krw?: number | null;
  /** 서버 등록 임계 — 최근 `th_recent_sec` 초 팀 매수 조각 수 합(기본 30) · 0 = 옛 서버. */
  th_recent_pieces?: number | null;
  /** 서버 등록 임계 — 위 창 길이(초 · 기본 60) · 0 = 옛 서버. */
  th_recent_sec?: number | null;
  /**
   * 전날 서버 당일 팀 매수 금액(원) — 목록 RPC 만(quick-261026-01h · 20261026010000). 그 날짜보다 앞선 가장 최근 행 있는 날짜
   * (봉투 `prev_date`)의 같은 isin 행 `pos_day_buy_krw` · 그 행이 없거나 값이 없으면 null · 옛 응답엔 키 없음.
   */
  prev_pos_day_buy_krw?: number | null;
  /** 전날 서버 당일 팀 매도 금액(원) — 목록 RPC 만 · 규칙은 `prev_pos_day_buy_krw` 와 같다. */
  prev_pos_day_sell_krw?: number | null;
  /**
   * 팀 당일 손익 — 목록 RPC 만 싣는다(payload.pnl 그대로 · 20261021140000). 상세 행은 payload.pnl 을 읽는다.
   * 팀 체결 0 · 옛 행 = null · 키 없음.
   */
  pnl?: TeamflowPnl | null;
}

/** payload.price — 10초 칸 가격(체결 있는 칸만). 칸 시각 = t0_ms + idx × step_s × 1000 · t0_ms = 그날 09:00 KST. */
export interface AccumReportPrice {
  t0_ms: number;
  /** 10 */
  step_s: number;
  /** 칸 번호 0~3959 — 15:30~16:00(2340~2519)은 비는 것이 정상 */
  idx: number[];
  /** 그 칸 마지막 체결가 */
  px: number[];
}

/** payload.orders — 열 지향(같은 길이 · t_ms 오름차순). 1천만원 이상 팀 주문 ∪ 사이클마다 첫 팀 매수(first=1). */
export interface AccumReportOrders {
  t_ms: number[];
  side: ("B" | "S")[];
  qty: number[];
  /** 주문 금액(원) */
  val: number[];
  px: number[];
  /** 한 주문의 조각 수 */
  pieces: number[];
  /** 팀매수 시작점 표시 */
  first: (0 | 1)[];
}

/** payload.buckets 한 칸 — 10분 칸 0~65(09:00 = 0) · 팀 주문 있는 칸만 slot 오름차순. */
export interface AccumReportBucket {
  slot: number;
  buy_krw: number;
  sell_krw: number;
}

/** payload.day_cum_net — 전체 팀 주문 순매수 누적(주문 하나 = 점 하나 · 마지막 값 = day_net_krw). */
export interface AccumReportCumNet {
  t_ms: number[];
  net_krw: number[];
}

/** payload.cycles 한 항목(16키) — 그 사이클 종료 행(없으면 마지막 행) 값 · 처음 나온 순서 · 번호 연속 가정 없음. */
export interface AccumReportCycle {
  cycle: number;
  since_date: string | null;
  reg_time_ms: number | null;
  /** null = 장 마감까지 살아 있음 */
  end_time_ms: number | null;
  end_reason: number;
  carry_days: number;
  state: number;
  pos_buy_qty: number | null;
  pos_buy_krw: number | null;
  pos_sell_qty: number | null;
  pos_sell_krw: number | null;
  pos_net_krw: number | null;
  pos_avg_px: number | null;
  pos_peak_net_krw: number | null;
  pos_reg_px: number | null;
  our_excluded_qty: number | null;
}

/** 상세 payload 7키(이 순서 · avg_px · pos_net 은 선택 키). pnl 은 팀 매집 보고서와 같은 13키(팀 체결 0 이면 null). */
export interface AccumReportPayload {
  price: AccumReportPrice;
  orders: AccumReportOrders;
  buckets: AccumReportBucket[];
  day_cum_net: AccumReportCumNet;
  pnl: TeamflowPnl | null;
  cycles: AccumReportCycle[];
  /**
   * 팀 평단 계단(quick-261021-amg) — 2026-10-21 gh-trade quick-261021-3rf 가 추가한 선택 키라 그 전 export 행에는 없다.
   * - 열 지향 같은 길이 · `t_ms` 비감소. 같은 ms 두 점(종료 값 → 0)이 있을 수 있고 배열 순서가 정본이다.
   * - `px` = buy_krw ÷ buy_qty 반올림 원. **0 = 등록 포지션 없음(선을 끊는다).** 값이 바뀐 분의 다음 분 경계마다 점이 생긴다.
   * - 이월 종목은 06:01 row 2 가 첫 점일 수 있다. 점이 없으면 `[]`/`[]`.
   */
  avg_px?: { t_ms: number[]; px: number[] };
  /**
   * 포지션 순매수 계단(quick-261025-fac · 스케치 017 B) — 2026-10-25 gh-trade 가 추가한 선택 키라 그 전 export 행에는 없다.
   * - 정수 평행 배열(같은 길이 · 빌 수 있음). 점 = 서버 상태기 row 1/2/3/4(row 5 없음) · `net_krw` = 등록 이후 순매수(원 ·
   *   이월 포함 · 우리 체결 제외 — 목록 · KPI 의 `pos_net_krw` 와 같은 뜻). **day_cum_net(그날 0부터 · 전체 팀 주문)과 다른 선이다.**
   * - 이월 종목은 06:01 row 2 가 첫 점일 수 있다. `cycle` 이 앞 점과 바뀐 곳에서 선을 끊는다.
   * - `end` = 점마다 end_reason(0 = 열림 · row 1/2/3 = 0 · row 4 = 0 아님) — gh-trade 후속 선택 배열이라 없을 수 있다.
   *   있으면 end ≠ 0 점 뒤를 끊고, 없으면 cycle 로만 끊는다.
   */
  pos_net?: { t_ms: number[]; net_krw: number[]; cycle: number[]; end?: number[] };
}

/** 상세 RPC 응답 행 — 평평한 37열 + payload. */
export type AccumDetailRow = AccumReportRow & { payload: AccumReportPayload | null };

/**
 * `GET /api/accum/report?d=YYYYMMDD` 응답 = RPC accum_report_for_user 그대로.
 * dates = 행 있는 날짜 내림차순 · date = ?d 또는 최신(이력 0 이면 null) · rows = 그날 평평한 열(없는 날 []).
 * prev_date = dates 중 date 바로 앞(행 있는 날짜 기준 · 없으면 null · 20261026010000 전 응답엔 키 없음 — quick-261026-01h).
 * `{access:false}` 는 server 가 403 DMA_UNMAPPED 로 바꾸므로 웹은 성공 응답에서 보지 않는 것이 정상이다.
 */
export type AccumReportResponse =
  | { access: false }
  | { access: true; dates: LimitupDate[]; date: LimitupDate | null; prev_date?: LimitupDate | null; rows: AccumReportRow[] };

/**
 * `GET /api/accum/report/:date/:isin` 응답 = RPC accum_detail_for_user 그대로.
 * row = 그 (date, isin) 행(평평한 열 + payload) · 없으면 null(200 — 웹 「이 종목 상세를 찾지 못했어요」).
 */
export type AccumDetailResponse = { access: false } | { access: true; row: AccumDetailRow | null };
