/**
 * Phase 35 — 발사 경계 지도 어드민 계약 (server `/api/admin/launch/*` ↔ webapp · relay 백필 도구).
 *
 * - 계약 정본: gh-trade 인박스 `docs/inbox/from-gh-trade/261027-launch-gate-admin.md`(상의 노트) + 첨부
 *   `261027-launch-gate-admin-attach/`(launch-gate-map.html · pieces.json). 정식 kind 17(LaunchPiece) ·
 *   18(LaunchHead) 칸 매핑은 Wave B(정식 인계 노트 도착 뒤)에 DB 투영 함수가 받는다 — 이 모듈은 와이어를 모른다.
 * - **행 키 = DB 열 이름 그대로(snake_case)** — `launch_pieces` · `launch_heads` 표(마이그레이션 20261027200000)를
 *   어드민 RPC 가 `to_jsonb` 로 싣는다(매퍼 없음). 응답의 `trade_date` 는 `"YYYYMMDD"`(LimitupDate) · `fire_base` 는
 *   `"HH:MM:SS"`. 백필 입력(`LaunchPieceInput`)만 `trade_date` 가 `"YYYY-MM-DD"`(DB date 로 바로 들어간다).
 * - 단위: `*_us` = 마이크로초(µs) · `sent_rel_us` = 첫 발 송신 − 발사 기준시각 · `accept_time` = HHMMSSmmm 숫자
 *   (09시대는 앞 0 이 빠진 8자리 — 9자리 패딩 · 시각 표시는 웹 표시층만 한다).
 * - **경계 규칙 정본 = 첨부 `group()`**(launch-gate-map.html) + 목업 확장(거부에 515 포함 · 분류 「전부 거부」 ·
 *   reference/mockup-launch-gate-map.html). lo = 거부(101 · 515) 조각 rel 최댓값 · hi = 접수 조각 rel 최솟값 ·
 *   그 밖 결과(기타 · 무응답 · E127 …)는 경계 계산에서 뺀다. 웹 지도(경계 띠 · 리본)와 relay 백필 머리 계산이
 *   **이 한 벌**을 쓴다 — SQL 에 두 번째 구현을 두지 않는다(RESEARCH Pattern 6).
 * - 발사 기준 = 거래소 + 기준시각(D-03 · D-17): 16:00:00 KRX(Q16) · 09:00:27 KRX(A 매수 — 주문 내역에만) ·
 *   09:00:30 NXT(N 매수 + A 매도 — 한 지도). 지도 대상은 `LAUNCH_FIRES` 둘뿐이다.
 * - `account` · `dma_user_id` 는 어드민 전용 예외(D-02) — 원문 표의 감사 칸 규칙(T-19-08)과 다르다.
 */
import type { LimitupDate } from "./limitup-report";

// ─────────────────────────────────────────────────────────────────────────────
// 축 — 발사 기준 · 범위 · 시장 · 패널 순서
// ─────────────────────────────────────────────────────────────────────────────

/** 지도 발사 기준 — q16 = 16:00:00 KRX · n0930 = 09:00:30 NXT. */
export type LaunchFire = "q16" | "n0930";
/** 지도 범위 세그먼트 — 발사 기준별 최근 거래일 수(all = 전체). */
export type LaunchRange = "10d" | "20d" | "all";
/** 시장 — K = 코스피 · Q = 코스닥(`dma_strategy_events` 관례). */
export type LaunchMarket = "K" | "Q";

/** 범위 → 일수(null = 전체). 어드민 지도 RPC `p_days` 로 그대로 간다. */
export const LAUNCH_RANGE_DAYS: Record<LaunchRange, number | null> = { "10d": 10, "20d": 20, all: null };

/** 지도 발사 기준 → (거래소, 기준시각). 지도 RPC 의 `p_fire` 해석과 같다. */
export const LAUNCH_FIRES = {
  q16: { fire_exchange: "KRX", fire_base: "16:00:00" },
  n0930: { fire_exchange: "NXT", fire_base: "09:00:30" },
} as const satisfies Record<LaunchFire, { fire_exchange: string; fire_base: string }>;

/**
 * 패널 순서 (서버 키, 시장). 첨부 ORDER 와 같다: KB 코스닥 · KB 코스피 · 교보 코스닥 · 교보 코스피.
 */
export const LAUNCH_ORDER = [
  ["KB120", "Q"],
  ["KB120", "K"],
  ["KYOBO119", "Q"],
  ["KYOBO119", "K"],
] as const satisfies ReadonlyArray<readonly [string, LaunchMarket]>;

// ─────────────────────────────────────────────────────────────────────────────
// 행 — 조각 · 머리 (DB 열 − created_at − updated_at)
// ─────────────────────────────────────────────────────────────────────────────

/** `launch_pieces` 한 행(어드민 RPC 응답). 논리 키 (trade_date, gateway, profile, fire_exchange, market, wire). */
export interface LaunchPieceRow {
  /** 거래일 `"YYYYMMDD"` */
  trade_date: LimitupDate;
  /** 서버 키 — KB120 · KYOBO119 */
  gateway: string;
  /** Q16 · N · A (CHECK 없음 — 모르는 값도 그대로) */
  profile: string;
  /** KRX · NXT */
  fire_exchange: string;
  /** 발사 기준시각 `"HH:MM:SS"` */
  fire_base: string;
  /** K = 코스피 · Q = 코스닥 */
  market: string;
  /** 발사 안 송신 순번(0 부터) */
  wire: number;
  /** buy · sell (모르면 null) */
  side: string | null;
  /** Q16 예약 id / N·A 판정 key */
  queued_id: string | null;
  /** 예약 안 조각 순번 */
  piece_idx: number | null;
  round: number | null;
  probe: boolean | null;
  order_no: string | null;
  /** 첫 발 송신 − 발사 기준시각(µs) */
  sent_rel_us: number;
  /** 결과 원문 — 접수 · 101 · 515 · 기타 · 무응답 · E127 … */
  result: string;
  result_code: number | null;
  /** 접수 시각 HHMMSSmmm(앞 0 빠진 숫자 그대로) */
  accept_time: number | null;
  retry: number | null;
  abandoned: boolean | null;
  isin: string | null;
  price: number | null;
  qty: number | null;
  filled_qty: number | null;
  /** 계좌 — D-02 어드민 전용 */
  account: string | null;
  /** DMA 사용자 — D-02 어드민 전용 */
  dma_user_id: string | null;
  source: "journal" | "backfill";
  journal_epoch: string | null;
  seq: number | null;
  gw_time_ms: number | null;
  /** 응답 전용 · 표 열 아님 — 주문 내역 RPC 의 stocks 조인(isin). 없으면 null. */
  stock_code: string | null;
  /** 응답 전용 · 표 열 아님 — 주문 내역 RPC 의 stocks 조인(isin). 없으면 null. */
  stock_name: string | null;
}

/** `launch_heads` 한 행(어드민 RPC 응답). 논리 키 (trade_date, gateway, profile, fire_exchange, market). */
export interface LaunchHeadRow {
  trade_date: LimitupDate;
  gateway: string;
  profile: string;
  fire_exchange: string;
  fire_base: string;
  market: string;
  /** 이번 발사 첫 조각 rel(µs) */
  offset_used_us: number | null;
  /** 첫 송신 시각(µs) */
  fire_at_us: number | null;
  n_pieces: number | null;
  n_accepted: number | null;
  /** 거부 수 — Q16 = 101 · N = 515 (profile 이 뜻을 정함) */
  n_reject: number | null;
  n_other: number | null;
  /** 접수 조각 중 최소 wire */
  first_accept_idx: number | null;
  retries: number | null;
  abandoned: number | null;
  /** 거부 조각 rel 최댓값 */
  gate_lo_us: number | null;
  /** 접수 조각 rel 최솟값 */
  gate_hi_us: number | null;
  /** lo > hi (경계가 뒤집힘) */
  nonmono: boolean | null;
  correction_before_us: number | null;
  correction_after_us: number | null;
  step_us: number | null;
  last_dir: number | null;
  bracketed: boolean | null;
  same_dir_run: number | null;
  reject_span_us: number | null;
  jump: number | null;
  one_way_us: number | null;
  rtt_min_us: number | null;
  /** 다음 발사 첫 조각 rel 목표(kind 18 계산값 · 백필은 null) */
  next_offset_us: number | null;
  source: "journal" | "backfill";
  journal_epoch: string | null;
  seq: number | null;
  gw_time_ms: number | null;
}

/** 지도 조각 — 지도 RPC 가 싣는 열만. */
export type LaunchMapPiece = Pick<
  LaunchPieceRow,
  | "trade_date"
  | "gateway"
  | "market"
  | "profile"
  | "fire_exchange"
  | "side"
  | "wire"
  | "piece_idx"
  | "sent_rel_us"
  | "result"
  | "retry"
>;

/** 주문 내역 봉투 — dates 는 조각 기준 내림차순 · date = 보여 주는 날(없으면 null). */
export interface LaunchOrdersResponse {
  dates: LimitupDate[];
  date: LimitupDate | null;
  heads: LaunchHeadRow[];
  pieces: LaunchPieceRow[];
}

/** 경계 지도 봉투 — days 는 발사 기준별 거래일 내림차순 · heads 는 (서버, 시장, profile) 별 최신 1행. */
export interface LaunchMapResponse {
  days: LimitupDate[];
  heads: LaunchHeadRow[];
  pieces: LaunchMapPiece[];
}

/**
 * 백필 DB 입력 조각 — 원문 추적 열(source · journal_epoch · seq · gw_time_ms)과 응답 전용 열을 뺀 모양.
 * `trade_date` 는 `"YYYY-MM-DD"`(DB date). source 는 RPC 가 `backfill` 로 정한다.
 */
export type LaunchPieceInput = Omit<
  LaunchPieceRow,
  "source" | "journal_epoch" | "seq" | "gw_time_ms" | "stock_code" | "stock_name"
>;

/** 백필 DB 입력 머리 — 같은 규칙(`trade_date` = `"YYYY-MM-DD"`). */
export type LaunchHeadInput = Omit<LaunchHeadRow, "source" | "journal_epoch" | "seq" | "gw_time_ms">;

// ─────────────────────────────────────────────────────────────────────────────
// 경계 계산 — 첨부 group() 이식
// ─────────────────────────────────────────────────────────────────────────────

/** 경계 계산이 읽는 최소 모양. */
export interface LaunchCalcPiece {
  trade_date: string;
  wire: number;
  sent_rel_us: number;
  result: string;
}

/** 날 분류 — 경계 · 전부 접수 · 전부 거부 · 판단 불가(조각이 전부 기타). */
export type LaunchDayKind = "gate" | "all_accept" | "all_reject" | "unknown";

/** 한 발사(하루)의 경계. */
export interface LaunchDay<P> {
  date: string;
  /** wire 오름차순 */
  pieces: P[];
  /** 거부(101 · 515) 조각 rel 최댓값 */
  lo: number | null;
  /** 접수 조각 rel 최솟값 */
  hi: number | null;
  /** 조각 rel 최솟값 */
  first: number;
  kind: LaunchDayKind;
}

/** 접수인가 — 결과 원문 「접수」. */
export function isLaunchAccept(result: string): boolean {
  return result === "접수";
}

/** 거부인가 — 101(Q16 너무 이름) · 515(N). 그 밖(기타 · 무응답 · E127 …)은 경계 계산에서 뺀다. */
export function isLaunchReject(result: string): boolean {
  return result === "101" || result === "515";
}

function maxOrNull(xs: number[]): number | null {
  return xs.length > 0 ? Math.max(...xs) : null;
}

function minOrNull(xs: number[]): number | null {
  return xs.length > 0 ? Math.min(...xs) : null;
}

/**
 * 첨부 `group()` — 날짜 오름차순 묶음 · 묶음 안 wire 오름차순 · lo/hi/first/kind.
 * 호출부가 서버 × 시장(× 발사 기준)으로 미리 거른다. 입력 배열은 바꾸지 않는다.
 */
export function launchDaysOf<P extends LaunchCalcPiece>(pieces: readonly P[]): LaunchDay<P>[] {
  const byDate = new Map<string, P[]>();
  for (const p of pieces) {
    const list = byDate.get(p.trade_date);
    if (list) list.push(p);
    else byDate.set(p.trade_date, [p]);
  }
  const dates = [...byDate.keys()].sort();
  return dates.map((date) => {
    const ps = [...byDate.get(date)!].sort((a, b) => a.wire - b.wire);
    const lo = maxOrNull(ps.filter((p) => isLaunchReject(p.result)).map((p) => p.sent_rel_us));
    const hi = minOrNull(ps.filter((p) => isLaunchAccept(p.result)).map((p) => p.sent_rel_us));
    const first = Math.min(...ps.map((p) => p.sent_rel_us));
    const kind: LaunchDayKind =
      lo !== null && hi !== null ? "gate" : hi !== null ? "all_accept" : lo !== null ? "all_reject" : "unknown";
    return { date, pieces: ps, lo, hi, first, kind };
  });
}

/** 조각에서 셀 수 있는 머리 값 9개(D-04 백필 머리). 학습 열 · next_offset_us 는 계산하지 않는다. */
export interface LaunchHeadCalc {
  n_pieces: number;
  n_accepted: number;
  /** 거부(101 · 515) 수 */
  n_reject: number;
  n_other: number;
  /** 접수 조각 중 최소 wire(없으면 null) */
  first_accept_idx: number | null;
  gate_lo_us: number | null;
  gate_hi_us: number | null;
  /** 최소 wire 조각의 rel */
  offset_used_us: number;
  /** lo > hi */
  nonmono: boolean;
}

/** 한 발사의 조각들 → 머리 계산값. 빈 배열은 throw(머리 없는 발사는 없다). */
export function launchHeadOf<P extends Pick<LaunchCalcPiece, "wire" | "sent_rel_us" | "result">>(
  pieces: readonly P[],
): LaunchHeadCalc {
  if (pieces.length === 0) throw new Error("launchHeadOf: 조각이 없습니다");
  const acc = pieces.filter((p) => isLaunchAccept(p.result));
  const rej = pieces.filter((p) => isLaunchReject(p.result));
  const firstWire = pieces.reduce((a, b) => (b.wire < a.wire ? b : a));
  const lo = maxOrNull(rej.map((p) => p.sent_rel_us));
  const hi = minOrNull(acc.map((p) => p.sent_rel_us));
  return {
    n_pieces: pieces.length,
    n_accepted: acc.length,
    n_reject: rej.length,
    n_other: pieces.length - acc.length - rej.length,
    first_accept_idx: minOrNull(acc.map((p) => p.wire)),
    gate_lo_us: lo,
    gate_hi_us: hi,
    offset_used_us: firstWire.sent_rel_us,
    nonmono: lo !== null && hi !== null && lo > hi,
  };
}
