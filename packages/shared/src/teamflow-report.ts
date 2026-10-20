/**
 * Phase 33 — 팀 매집(teamflow) 보고서 계약 (server `GET /api/teamflow/report` ↔ webapp).
 *
 * - 규칙은 `limitup-report.ts` 와 같다 — **행 키는 gh-trade export 열 이름 그대로(snake_case)**(DB 표 열 이름도 같고
 *   RPC 가 `to_jsonb(row)` 로 싣는다 · 매퍼 없음). **봉투 키(access · dates · date · rows)는 camelCase 규칙**(단어 하나라 그대로).
 * - 계약 정본: `docs/inbox/from-gh-trade/261016-teamflow-export.md` 열 사전(gh-trade `tickana/teamflow.py export_row`).
 * - 단위: `*_ms` = epoch ms · 가격 · 금액(`*_val`) = 원 정수 · 수량 = 주 · **`*_share` = 0~1(분모 0 이면 null)** ·
 *   **`*_rate` · bucket/window `lo` · `hi` = % 그대로(30.0 = +30%)** — 상한가 보고서의 소수 비율과 다르다.
 *   억 · % 표시 변환은 웹 표시층(`webapp/src/lib/teamflow-report.ts`)만 한다(D-04 · D-10).
 * - 결측은 `null`(PK 밖 전부 NULL 허용).
 */
import type { LimitupDate } from "./limitup-report";

/** payload.bands 한 행 — 등락률 구간 · label 순서 고정(「0% 미만」 · 「상한가 가격」 은 체결 있을 때만 · 「하루 합계」 마지막). */
export interface TeamflowBand {
  label: string;
  vol: number | null;
  val: number | null;
  buy_aggr: number | null;
  sell_aggr: number | null;
  team_buy: number | null;
  team_sell: number | null;
  /** 팀 순매수 주 */
  net: number | null;
  team_buy_val: number | null;
  team_sell_val: number | null;
  net_val: number | null;
  /** 팀 매수 ÷ 매수주도(주) 0~1 · 분모 0 이면 null */
  share: number | null;
}

/** payload.buckets 한 칸 — 10분 버킷(체결 있는 것만 · key 오름차순 · 상한가 가격 체결 포함). */
export interface TeamflowBucket {
  /** KST 하루 10분 칸 번호(0~143) — 54 = 09:00 */
  key: number;
  /** "HH:MM" */
  start: string;
  /** 버킷 안 최저 · 최고 등락률 % */
  lo: number | null;
  hi: number | null;
  share: number | null;
  vol: number | null;
  val: number | null;
  buy_aggr: number | null;
  sell_aggr: number | null;
  team_buy: number | null;
  team_sell: number | null;
  net: number | null;
  team_buy_val: number | null;
  team_sell_val: number | null;
  net_val: number | null;
}

/** payload.window — 팀 순매수가 이어진 최대 구간. share_lo/hi 는 0~1(분모 0 이어도 0 — null 아님). */
export interface TeamflowWindow {
  i: number;
  j: number;
  start: string;
  end: string;
  lo: number;
  hi: number;
  net_val: number;
  share_lo: number;
  share_hi: number;
}

/** payload.members.rows 한 행 — 상위 5 에 한쪽만 있으면 다른 쪽 · net 은 null. */
export interface TeamflowMemberRow {
  member: string;
  name: string;
  buy: number | null;
  sell: number | null;
  net: number | null;
  /**
   * 금액(원 · 마지막 스윕 `lv*_value`) — quick 261018-j17 · 옛 행엔 키가 없다(정본 gh-trade team-flow.md §11).
   * 상위 5 밖 쪽은 null · 한쪽이 null 이면 net_val 도 null(주 단위 규칙과 같다).
   */
  buy_val?: number | null;
  sell_val?: number | null;
  net_val?: number | null;
}

export interface TeamflowMemberTop {
  member: string;
  name: string;
  qty: number;
}

/** payload.members — B9 마지막 스윕 기준(time 은 장 마감 뒤일 수 있다). */
export interface TeamflowMembers {
  time: string | null;
  rows: TeamflowMemberRow[];
  /** 매수 · 매도 상위 5 어디에도 없는 팀 창구 이름 */
  absent: string[];
  total: { buy: number; sell: number; net: number } | null;
  top_buy: TeamflowMemberTop | null;
  top_sell: TeamflowMemberTop | null;
}

/** member_flow 칸 맵 — 키 = 창구 코드(members[].member) · 값 = 원 정수 | null(모름 · 아는 체결 50% 미만) · 0 = 체결 없음. */
export type TeamflowMemberNet = Record<string, number | null>;
export interface TeamflowMemberFlowMember {
  member: string;
  name: string;
}
export interface TeamflowMemberFlowBand {
  label: string;
  net_val: TeamflowMemberNet;
}
export interface TeamflowMemberFlowBucket {
  key: number;
  net_val: TeamflowMemberNet;
}
/**
 * payload.member_flow — members 5개 TEAM 순서(교보 · 한국 · 유진 · 신한 · NH) · bands 라벨/순서 = payload.bands
 * (「하루 합계」 마지막 = 상한가 가격 뺀 합 · 하나라도 null 이면 null) · buckets key 열 = payload.buckets key 열.
 * 옛 행엔 키가 없다 · 정본 gh-trade team-flow.md §11(quick 261018-j17).
 */
export interface TeamflowMemberFlow {
  members: TeamflowMemberFlowMember[];
  bands: TeamflowMemberFlowBand[];
  buckets: TeamflowMemberFlowBucket[];
}
/**
 * payload.pnl — 팀 당일 손익(평균단가법 · 상한가 가격 포함 · 단일가 제외 · 미실현 평가가 last_px). 금액 원 · 수량 주.
 * 옛 행엔 키가 없다 · 정본 gh-trade team-flow.md §5-1(quick 261018-j17).
 */
export interface TeamflowPnl {
  buy_val: number;
  buy_qty: number;
  sell_val: number;
  sell_qty: number;
  realized_val: number;
  realized_qty: number;
  unrealized_val: number;
  total_val: number;
  /** total_val ÷ buy_val (0~1) · buy_val 0 이면 null */
  ret: number | null;
  end_qty: number;
  end_cost_val: number;
  unknown_sell_qty: number;
  unknown_sell_val: number;
}

export interface TeamflowPayload {
  bands: TeamflowBand[];
  buckets: TeamflowBucket[];
  /** 10 */
  bucket_min: number;
  window: TeamflowWindow | null;
  /** 화면 미사용 */
  worst: { start: string; net_val: number }[];
  /** 화면 미사용 */
  reach: { t_ms: number; buy: number; team: number; team_val: number } | null;
  members: TeamflowMembers | null;
  /** 사실 문장 3~5줄 — HTML 은 `<b>` 만(웹은 조각 배열로 렌더 · HTML 주입 없음) */
  summary_lines: string[];
  /** 거래원별 순매수(구간 · 10분) — B9 없음 = null · 옛 행엔 키 없음(§11) */
  member_flow?: TeamflowMemberFlow | null;
  /** 팀 당일 손익 — 팀 연속매매 체결 0 = null · 옛 행엔 키 없음(§5-1) */
  pnl?: TeamflowPnl | null;
}

/** limitup_team_flow 한 행(29열 + schema_version + payload). PK (date, isin). */
export interface TeamflowRow {
  date: LimitupDate;
  isin: string;
  short_code: string | null;
  name: string | null;
  /** "KOSPI" | "KOSDAQ" | null */
  market: string | null;
  base: number | null;
  upper: number | null;
  first_limit_ms: number | null;
  first_limit_auction: boolean | null;
  last_ms: number | null;
  last_px: number | null;
  last_rate: number | null;
  /** "limit" | "below" */
  status: string | null;
  volume: number | null;
  value: number | null;
  team_buy_val: number | null;
  team_sell_val: number | null;
  team_net_val: number | null;
  team_buy_share: number | null;
  below20_net_val: number | null;
  above20_net_val: number | null;
  limit_team_buy_val: number | null;
  limit_team_sell_val: number | null;
  reach_team_share: number | null;
  reach_team_val: number | null;
  b9_lower: number | null;
  high_px: number | null;
  high_rate: number | null;
  high_ms: number | null;
  schema_version: number | null;
  payload: TeamflowPayload | null;
}

/**
 * `GET /api/teamflow/report?d=YYYYMMDD` 응답 = RPC teamflow_report_for_user 그대로.
 * dates = team_flow 행이 있는 날짜 내림차순 · date = ?d 또는 최신(이력 0 이면 null) · rows = 그날 행(없는 날 []).
 * `{access:false}` 는 server 가 403 DMA_UNMAPPED 로 바꾸므로 웹은 성공 응답에서 보지 않는 것이 정상이다.
 */
export type TeamflowReportResponse =
  | { access: false }
  | { access: true; dates: LimitupDate[]; date: LimitupDate | null; rows: TeamflowRow[] };
