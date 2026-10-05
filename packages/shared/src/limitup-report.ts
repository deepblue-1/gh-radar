/**
 * Phase 28 Plan 10 — 상한가 보고서 계약 (server `GET /api/limitup/report` · `GET /api/limitup/grid-urls` ↔ webapp).
 *
 * - **행 키는 gh-trade export 열 이름 그대로(snake_case).** 계약 정본이 `docs/inbox/from-gh-trade/261005-limitup-feature-85.md`
 *   「(C)」 표 = `tickana/export.py` 출력이고, DB 표 열 이름도 같다(RPC 가 `to_jsonb(row)` 로 싣는다). 이름을 바꾸면 세 곳이
 *   갈라지므로 매퍼를 두지 않는다. **봉투 키(access · dates · day · prev · fingerprint · expiresIn …)는 camelCase.**
 * - 비율은 소수(0~1 · −0.115 = −11.5%) — 퍼센트 표기 함수에 넣을 때 ×100(RESEARCH Pitfall 10).
 * - `*_ms` = epoch ms · `date` / `d1_date` = `YYYYMMDD` · `*_trade` · `first_recv` · `data_end` = KST `HH:MM:SS.ffffff`.
 * - 결측은 `null`(PK 밖 전부 NULL 허용) — 실데이터에도 short_code · name 이 null 인 entries 행이 있다.
 */

/** `YYYYMMDD` 날짜 문자열. */
export type LimitupDate = string;

/** entries (35열) — 종목별 그날 진입 요약. PK (date, isin). */
export interface LimitupEntryRow {
  date: LimitupDate;
  isin: string;
  short_code: string | null;
  name: string | null;
  base_px: number | null;
  upper_px: number | null;
  list_shares: number | null;
  mcap_krw: number | null;
  sec_group: string | null;
  max_rate: number | null;
  t15_ms: number | null;
  t20_ms: number | null;
  t25_ms: number | null;
  detect_rate_pct: number | null;
  reached: boolean | null;
  first_upper_ms: number | null;
  entry_from_ms: number | null;
  wall_krw_before: number | null;
  wall_truncated_before: boolean | null;
  wall_clear_s: number | null;
  max_burst_krw: number | null;
  max_burst_ms: number | null;
  max_burst_pieces: number | null;
  entry_buy_member1: string | null;
  entry_buy_share1: number | null;
  entry_buy_member2: string | null;
  entry_buy_share2: number | null;
  entry_buy_member3: string | null;
  entry_buy_share3: number | null;
  close_px: number | null;
  close_ret: number | null;
  d1_date: LimitupDate | null;
  d1_open: number | null;
  d1_ret: number | null;
  schema_version: number | null;
}

/** locks (22열 · export.py LOCKS_EXPORT_COLS) — 잠김 구간. PK (date, isin, lock_id). */
export interface LimitupLockRow {
  date: LimitupDate;
  isin: string;
  lock_id: number;
  exchange: string | null;
  board: string | null;
  short_code: string | null;
  name: string | null;
  upper_px: number | null;
  close_px: number | null;
  close_ret: number | null;
  start_ms: number | null;
  /** 장 끝까지 잠김이면 null 가능. */
  end_ms: number | null;
  dur_s: number | null;
  broke: boolean | null;
  /** '깨짐' / '유지'. */
  outcome: string | null;
  break_px: number | null;
  q0: number | null;
  d1_date: LimitupDate | null;
  d1_open: number | null;
  d1_ret: number | null;
  /** KST 'HH:MM:SS.ffffff'. */
  data_end: string | null;
  schema_version: number | null;
}

/** facts (10열) — 사실 문장 + 근거 수치. PK (date, isin, event_no, fact_no). */
export interface LimitupFactRow {
  date: LimitupDate;
  isin: string;
  /** 0 = 진입 구간, ≥1 = lock_id. */
  event_no: number;
  fact_no: number;
  t_ms: number | null;
  template_id: string | null;
  /** 완성 문장 — 그대로 표시한다. */
  text: string | null;
  /** 근거 수치 객체(키는 template_id 마다 다르다). */
  values: Record<string, unknown> | null;
  /** 실측 / 추정(분 단위) / 모형 — 화면에 출처로 유지한다. */
  source: string | null;
  schema_version: number | null;
}

/** 파생 grid_summary — 종목별 격자 요약(스파크 = coarse q_krw 그대로). PK (date, isin). */
export interface LimitupGridSummaryRow {
  date: LimitupDate;
  isin: string;
  step_s: number;
  /** 첫 coarse 초(그날 00:00 KST 기준). */
  sec0: number;
  q_krw: (number | null)[];
  q_max_krw: number | null;
  q_max_ms: number | null;
  sell_share_60s: number | null;
}

/** 레인 2 마커 — jumps 의 burst_sell · cancel 을 종목마다 krw 큰 순 40개(RPC 가 자른다). */
export interface LimitupMarkRow {
  isin: string;
  jump_no: number;
  t_ms: number | null;
  kind: "burst_sell" | "cancel";
  qty: number | null;
  krw: number | null;
  q_before: number | null;
  q_after: number | null;
}

/**
 * 창구 지문 — member_daily 의 (D − 90일, D] 합계. 평균 = `*_sum / *_cnt`, 「관찰 중」 게이트(n < 10 —
 * gh-trade `MIN_FINGERPRINT_EVENTS`)는 웹이 한다. 이름은 창 안 최신 non-null.
 */
export interface LimitupFingerprintRow {
  member: string;
  name: string | null;
  n: number;
  entry_sum: number;
  entry_cnt: number;
  lock_buy_sum: number;
  lock_buy_cnt: number;
  pre_sell_sum: number;
  pre_sell_cnt: number;
  lead: number;
  n_broke: number;
  n_lock: number;
  n_held: number;
}

/** 적재 이력의 표별 행 수(manifest 대조값). */
export type LimitupLoadRows = Partial<
  Record<
    "entries" | "locks" | "jumps" | "member_alloc" | "facts" | "touches" | "grid_summary" | "member_daily",
    number
  >
>;

/** 하루 묶음 — 정렬은 RPC 가 정한다(entries isin · locks (isin, lock_id) · facts (isin, t_ms NULLS LAST, event_no, fact_no)). */
export interface LimitupDay {
  entries: LimitupEntryRow[];
  locks: LimitupLockRow[];
  facts: LimitupFactRow[];
  summaries: LimitupGridSummaryRow[];
  /** isin 순 · 종목 안은 krw 내림차순. */
  marks: LimitupMarkRow[];
  rows: LimitupLoadRows | null;
}

/**
 * `GET /api/limitup/report?d=YYYYMMDD` 응답.
 * - `{ access: false }` 는 server 가 403 `DMA_UNMAPPED` 로 바꾸므로 200 본문으로는 오지 않는다(타입은 RPC 모양 그대로 둔다).
 * - `dates` = 적재된 날짜 내림차순. 적재 이력 0 이면 `[]` · `date: null`.
 * - `loaded: false` + `date` = 그 날 보고서가 아직 없다(빈 상태 「이 날 보고서가 아직 없어요」).
 */
export type LimitupReportResponse =
  | { access: false }
  | { access: true; dates: LimitupDate[]; date: LimitupDate | null; loaded: false }
  | {
      access: true;
      dates: LimitupDate[];
      date: LimitupDate;
      loaded: true;
      day: LimitupDay;
      /** 바로 이전 적재 날짜의 locks(어제 결과) — 없으면 null. */
      prev: { date: LimitupDate; locks: LimitupLockRow[] } | null;
      /** n 내림차순 → member. */
      fingerprint: LimitupFingerprintRow[];
    };

/** `GET /api/limitup/grid-urls?d=YYYYMMDD` 응답 — `urls[isin]` = 단기 서명 URL(`expiresIn` 초). */
export interface LimitupGridUrlsResponse {
  date: LimitupDate;
  expiresIn: number;
  urls: Record<string, string>;
}

/** 격자 열 24개(coarse · fine 같음). */
export type LimitupGridCol =
  | "t_ms"
  | "last_px"
  | "rate"
  | "q_qty"
  | "q_krw"
  | "wall_krw_visible"
  | "wall_qty_hidden"
  | "wall_truncated"
  | "ask1_px"
  | "ask1_qty"
  | "bid1_px"
  | "sell_led_10s"
  | "buy_led_10s"
  | "cancel_10s"
  | "new_10s"
  | "auction_fill_10s"
  | "drain_s"
  | "lock_state"
  | "lock_id"
  | "lock_elapsed_s"
  | "auction"
  | "break_within_n"
  | "reach_within_n"
  | "label_n";

export type LimitupGridCols = Record<LimitupGridCol, (number | boolean | null)[]>;

/**
 * Storage `limitup-grid/grid/<D>/<isin>.json.gz` 를 gzip 해제한 JSON(인박스 격자 구조).
 * `sec` = 그날 00:00 KST 기준 초, 범위 [32400, 55800). coarse = `step_s` 간격(10초 → 2,340점),
 * fine = 사건 구간 1초 원본 창 0~1개. `drain_s` null = ∞ · `break_within_n` · `reach_within_n` 은 사후 라벨.
 */
export interface LimitupGridFile {
  schema_version: number;
  date: LimitupDate;
  isin: string;
  label_n: number;
  coarse: { step_s: number; sec: number[]; cols: LimitupGridCols };
  fine: {
    margin_s: number;
    windows: { from_sec: number; to_sec: number; sec: number[]; cols: LimitupGridCols }[];
  };
}
