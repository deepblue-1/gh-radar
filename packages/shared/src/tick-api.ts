/**
 * Phase 37 — 틱 전문 뷰어 과거 경로 API 계약 (server `/api/ticks/{day,today,open,convert,convert/cancel}` ↔ webapp).
 *
 * - **정본 = 마이그레이션 RPC 반환 모양**(`supabase/migrations/20261102200000_tick_viewer.sql` ·
 *   `20261102200100_tick_viewer_queue.sql`). 키는 snake_case 그대로 통과한다 — 매퍼 없음.
 *   예외 둘: `today.live` 는 server 가 덧붙이고(당일 경로 결선 여부 — 37-15), `open.grid` 는 server 가
 *   `object_path` 를 빼고 서명 URL(`url` · `expiresIn`)을 넣어 `TickOpenGrid` 로 바꾼다(Storage 경로 비노출).
 * - 날짜 = `"YYYYMMDD"` · 시각(`*_at`) = ISO 문자열(timestamptz) · `*_ms` = epoch ms · `*_rate` = % 그대로(30.0 = +30%).
 * - 요청 행에는 `requested_by` 가 없다(다른 사용자 uuid 비노출 — 37-04). `error` 는 RPC 문자열 그대로 통과한다:
 *   `NOT_UPLOADED`(업로드 전 날짜) · `NO_RECORDS`(그날 전문 없음) · `JOB_TIMEOUT`(죽은 Job 회수) · 트리거/업로드 실패 메시지.
 * - 격자 바이트(`pcapns-rec+zstd/1`)의 디코더는 `./ticks/` 다. 이 파일은 봉투만 다룬다.
 */

/** 거래소 — 격자 · 요청 · 열기 키의 한 축. */
export type TickExchange = "KRX" | "NXT";

/** 격자 진입 출처 칩 — accum(매집감지 등록) · up15(고가 +15%) · request(요청 변환) · promoted(당일 캐시 승격). */
export type TickGridSource = "accum" | "up15" | "request" | "promoted";

/** 지금 객체를 쓴 모드 — nightly(정본) | request | promoted. */
export type TickGridMode = "nightly" | "request" | "promoted";

/** `tick_day_for_user.rows[]` — 격자 메타 한 행(object_path 없음) + 종목 코드/이름(마스터에 없으면 null). */
export interface TickGridRow {
  date: string;
  exchange: TickExchange;
  isin: string;
  code: string | null;
  name: string | null;
  mode: TickGridMode;
  sources: TickGridSource[];
  bytes: number;
  records: number;
  a3_count: number;
  high_rate: number | null;
  last_rate: number | null;
  created_at: string;
  /** 팀 체결 수(상세 「팀 거래정보」 끝 틱) — null 미계산 · 0 팀 체결 없음. 옛 RPC 면 키 없음(20261103230000 · quick 261103-j4d). */
  team_fills?: number | null;
  /** 당일 팀 순매수 원(그 거래소 팀만 · 끝 틱) — 팀 체결 없음 · 미계산이면 null · 옛 RPC 면 키 없음(20261103230000). */
  team_day_net_krw?: number | null;
  /** 당일 팀 손익 원(실현+미실현 · 끝 틱) — 팀 체결 없음 · 미계산이면 null · 옛 RPC 면 키 없음(20261103230000). */
  team_day_pnl_krw?: number | null;
  /** 매집감지 누적 순매수 원(이월 포함 · KRX+NXT 합산 · limitup_accum_flow.pos_net_krw) — 미등록이면 null · 옛 RPC 면 키 없음(20261103230000). */
  accum_pos_net_krw?: number | null;
}

/** 요청 변환 상태. */
export type TickConvertStatus = "pending" | "running" | "done" | "failed" | "cancelled";

/** 요청 변환 한 행(날짜는 봉투 키). `stale` 은 open 응답에만 — 깨워야 하는데 아무도 안 깨운 pending · 25분 넘은 running. */
export interface TickConvertRequest {
  exchange: TickExchange;
  isin: string;
  status: TickConvertStatus;
  requested_at: string;
  triggered_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  stale?: boolean;
}

/** `GET /api/ticks/day?d=` — 날짜 목록(내림차순) · 그날 격자 · 그날 요청 · 거래소별 예상 대기(초). 이력 0 이면 date null. */
export type TickDayResponse = {
  access: true;
  dates: string[];
  date: string | null;
  rows: TickGridRow[];
  requests: TickConvertRequest[];
  eta_s: { KRX: number; NXT: number };
};

/** `tick_today_for_user.rows[]` — 오늘 매집감지 등록 ∪ 고가 +15% 종목. */
export interface TickTodayRow {
  isin: string;
  code: string | null;
  name: string | null;
  sources: ("accum" | "up15")[];
  rate: number | null;
  high_rate: number | null;
}

/** `GET /api/ticks/today` — `live` = 당일 바이트 경로가 결선됐는지(아니면 웹은 「당일 자료 준비 중」). */
export type TickTodayResponse = {
  access: true;
  date: string;
  rows: TickTodayRow[];
  live: boolean;
};

/** 열기 응답의 격자 — 서명 URL(수명 `expiresIn` 초) + 메타. Storage 객체 경로는 싣지 않는다. */
export interface TickOpenGrid {
  url: string;
  expiresIn: number;
  bytes: number;
  records: number;
  a3_count: number;
  mode: TickGridMode;
  sources: TickGridSource[];
  /** 격자 바이트 형식 — 현재 `pcapns-rec+zstd/1`. */
  fmt: string;
  first_recv_ms: number | null;
  last_recv_ms: number | null;
  created_at: string;
}

/**
 * `GET /api/ticks/open?isin=&d=&ex=` — 한 종목 열기. grid null 이면 요청 변환 대상(request 로 상태를 본다).
 * `accum` = 매집감지 등록 종목의 누적 선 입력(D-09 · 없으면 null) · `eta_s` = 그 거래소 예상 대기(초).
 */
export type TickOpenResponse = {
  access: true;
  date: string;
  exchange: TickExchange;
  isin: string;
  /** `listing_shares` = 종목 마스터 상장주식수(현재 값 · 차트 · 거래대금 카드 시총 대비) — 옛 응답 · 미상이면 없음/null. */
  stock: { code: string; name: string; listing_shares?: number | null } | null;
  grid: TickOpenGrid | null;
  request: TickConvertRequest | null;
  accum: { reg_time_ms: number | null; pos_net: unknown } | null;
  eta_s: number;
};

/** `POST /api/ticks/convert` · `POST /api/ticks/convert/cancel` 본문. */
export interface TickConvertBody {
  isin: string;
  d: string;
  ex: TickExchange;
}

/**
 * `POST /api/ticks/convert` 200 응답. 상한 초과는 429 `TICK_CONVERT_CAPPED` 라 여기 오는 `capped` 는 늘 false 다.
 * - `grid_ready` — 격자가 이미 있다(바로 open).
 * - `not_uploaded` + `retry_after` — 업로드 전 날짜(그 시각 전까지 Job 을 깨우지 않는다 · 상한 소모 0).
 * - `triggered` — 이 호출이 Job 을 깨웠다(같은 (날짜, 거래소) 다른 호출은 false 로 앞 Job 에 실린다).
 */
export type TickConvertResponse = {
  access: true;
  grid_ready: boolean;
  capped: boolean;
  triggered: boolean;
  not_uploaded: boolean;
  retry_after: string | null;
  request: TickConvertRequest | null;
  eta_s?: number;
};

/** `POST /api/ticks/convert/cancel` 200 응답 — 본인 pending 일 때만 cancelled true. */
export type TickCancelResponse = {
  access: true;
  cancelled: boolean;
  request: TickConvertRequest | null;
};

// ── 당일 바이트 경로(37-15 server ↔ 37-19 웹 · D-05 · D-07) ─────────────────────────────

/**
 * `X-Tick-State` 값 — tickgw(37-09) 폴러 상태 그대로.
 * - `loading` — 08:00~지금 하루치를 받는 중(웹 「당일 · 하루치 받는 중」 카드 — D-05)
 * - `ready` — 증분 폴링 중
 * - `queued` — 활성 키 상한에 걸려 대기(`X-Tick-Queue` = 대기 순번 k)
 * - `delayed` — 백오프 · 전역 차단으로 잠시 멈춤
 * - `blocked` — 인덱서 인자 오류(60초 뒤 재시도)
 */
export type TickLiveState = "loading" | "ready" | "queued" | "delayed" | "blocked";

/** `GET /api/ticks/live` 200 응답 헤더를 읽은 값(본문은 원본 zstd 프레임 바이트 · server 는 풀지 않는다). */
export interface TickLiveMeta {
  /** 캐시 엔트리 UUID — 바뀌면 offset 0 부터(409 `{epoch}`). */
  epoch: string;
  /** 본문 끝 바이트 offset = 다음 요청 `offset`. */
  offsetEnd: number;
  /** 마지막 레코드 recv epoch ns(십진 문자열) · 아직 없으면 null(헤더는 빈 문자열). */
  lastRecvNs: string | null;
  state: TickLiveState;
  /** 대기 순번 k(queued 일 때) · 그 밖 0. */
  queue: number;
  /** 08:00 부터 끊김 없이 이어졌는가(헤더 문자열 "true" / "false"). */
  complete: boolean;
  /**
   * tickgw as-of(`X-Tick-As-Of-Ms`) — 이 키를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각
   * (tickgw 벽시계 epoch ms). 캐시는 이 시각 − 기록 지연까지 다 받았다. 옛 tickgw · 옛 server 거나 빈 값이면 null.
   * 웹은 여유(기록 지연 + 호스트 시계 차)를 빼고 당일 대기 판정 cutoff 로 쓴다(quick-261104-6lh). 409 meta 는 없음.
   */
  asOfMs?: number | null;
}

/**
 * `GET /api/ticks/live` 응답 헤더 이름 7종 — server(중계 · CORS exposedHeaders)와 37-19 웹(읽기)이 같은 상수를 쓴다(D-07).
 * tickgw 내부 계약(37-09 `tickgw/src/server.ts`)과 이름이 같다 — server 는 값을 바꾸지 않고 넘긴다.
 */
export const TICK_LIVE_HEADERS = {
  epoch: "X-Tick-Epoch",
  offsetEnd: "X-Tick-Offset-End",
  lastRecvNs: "X-Tick-Last-Recv-Ns",
  state: "X-Tick-State",
  queue: "X-Tick-Queue",
  complete: "X-Tick-Complete",
  /** 7번째 — 옛 tickgw 는 내지 않는다(server 는 값이 없으면 중계하지 않는다 · quick-261104-6lh). */
  asOfMs: "X-Tick-As-Of-Ms",
} as const;

// ── 우리 주문 · 체결(Phase 38 · D-01 · D-03 · D-14) ─────────────────────────────

/**
 * `tick_own_for_user.fills[]` — 우리 체결 한 행(dma_journal_events 체결 E · exec_qty > 0).
 * - 「우리」 = 가시 계좌(어드민은 전 계좌) ∧ 켜진 서버(dma_servers.enabled) — 판정은 RPC 안(클라 입력 없음).
 * - `gw_time_ms` = 게이트웨이 벽시계 epoch ms(절사) — 짝짓기(`matchOwnFills`) 입력.
 * - 배열 순서 = (gw_time, gateway, seq) — 남은 수량 차감 순서의 정본이다(바꾸지 마라).
 * - `dma_user_id` 는 없다(T-19-08).
 */
export interface TickOwnFill {
  gateway: string;
  seq: number;
  /**
   * 저널 저장소 신원 — `dma_journal_events.journal_epoch`(text NOT NULL · 저널이 초기화되면 바뀐다).
   * `(gateway, journal_epoch, seq)` 가 원천 PK 다. 20261104500000 전 RPC 응답에는 없으므로 옵션이다.
   */
  journal_epoch?: string | null;
  gw_time_ms: number;
  account_no: string;
  order_no: string;
  /** 'B' | 'S' | ''(원문) */
  side: string;
  exec_price: number;
  exec_qty: number;
}

/** `tick_own_for_user.events[]` — 우리 전략 주문 이벤트(dma_strategy_events kind 3 · 6 ∧ order_no 있음). 순서 = (gw_time_ms, gateway, seq). */
export interface TickOwnEvent {
  gateway: string;
  seq: number;
  gw_time_ms: number;
  kind: number;
  group: number;
  account_no: string;
  order_no: string;
  price: number;
  qty: number;
  reason_code: string;
  cond_metric: number;
  cond_threshold: number;
  cond_actual: number;
  ev_kind: number;
  ev_price: number;
  ev_qty_before: number;
  ev_qty_after: number;
  ev_trade_qty: number;
  cum_volume: number;
}

/**
 * `tick_own_for_user.orders[]` — 보조 주문 행(dma_account_orders 신규 · 체결 있음). kind 3·6 이벤트가 없는 체결 주문의
 * 주문 시각 보조. `created_ms` = 첫 이벤트 gw_time epoch ms(절사). 순서 = (created_at, gateway, order_no).
 */
export interface TickOwnOrder {
  gateway: string;
  account_no: string;
  order_no: string;
  side: string | null;
  price: number | null;
  qty: number | null;
  origin: string | null;
  created_ms: number;
}

/**
 * `GET /api/ticks/own?isin=&d=&ex=` — 한 종목 · 하루의 우리 체결 · 주문 이벤트 · 보조 주문(RPC 1회 · jsonb 한 장).
 * `servers` = 켜진 서버 키(sort_order 순 · 게이트웨이 키 하드코딩 0 — D-03). 짝짓기는 브라우저(틱 바이트가 거기 있다).
 */
export type TickOwnResponse = {
  access: true;
  date: string;
  exchange: TickExchange;
  isin: string;
  servers: string[];
  fills: TickOwnFill[];
  events: TickOwnEvent[];
  orders: TickOwnOrder[];
};
