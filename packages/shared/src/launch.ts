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
 *   reference/mockup-launch-gate-map.html). lo = 거부(101 · 515) 조각 rel 최댓값 · hi = 열림 조각 rel 최솟값 ·
 *   실조각 · 앞쪽 탐침(round −1)은 접수만 열림이고 그 밖 결과(기타 · 무응답 · E127 …)는 경계 계산에서 뺀다.
 *   16:00 뒤탐침(probe true · round −2 · quick-261030-dz7)은 「기타」 도 열림이다(gh-trade st7 「개시 = 첫 101 이
 *   아닌 응답」 — 가격 거부 포함) · 단 result_code E127(교보 조기 도착 거부) · 무응답은 경계 밖. 판정 정본 =
 *   `launchGateSideOf`. 웹 지도(경계 띠 · 리본)와 relay 백필 머리 계산이 **이 한 벌**을 쓴다 — SQL 에 두 번째
 *   구현을 두지 않는다(RESEARCH Pattern 6). 백필 머리(`launchHeadOf`)는 실조각만 센다(뒤탐침 제외).
 * - 발사 기준 = 거래소 + 기준시각(D-03 · D-17): 16:00:00 KRX(Q16) · 09:00:27 KRX(A 매수 — 주문 내역에만) ·
 *   09:00:30 NXT(N 매수 + A 매도 — 한 지도). 지도 대상은 `LAUNCH_FIRES` 둘뿐이다.
 *   A KRX 는 본회차 09:00:27 + 재확인 회차(예 09:00:29) — 주문 내역 판정은 `isLaunchFireBaseOf`,
 *   `launchFireBaseOf` 는 백필 기본값(quick-261030-d7b).
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
  /** 결과 코드 원문 — 0 · 101 · 515 또는 브로커 원 거부 코드(F083 · E124 · E127 …). 숫자로 와도 문자열로 둔다 */
  result_code: string | null;
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

/**
 * 지도 조각 — 지도 RPC 가 싣는 열만. probe · round · result_code(뒤탐침 판정 재료)는 마이그레이션 20261030210000
 * 뒤 RPC 가 늘 싣지만, db push 전 옛 응답 · 기존 픽스처엔 없을 수 있어 선택 칸이다 — 없으면 실조각으로 읽는다
 * (배포 순서 무관 · quick-261030-dz7).
 */
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
> &
  Partial<Pick<LaunchPieceRow, "probe" | "round" | "result_code">>;

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

/** 경계 계산이 읽는 최소 모양. probe · round · result_code 는 뒤탐침 판정용 선택 칸(없으면 실조각). */
export interface LaunchCalcPiece {
  trade_date: string;
  wire: number;
  sent_rel_us: number;
  result: string;
  probe?: boolean | null;
  round?: number | null;
  result_code?: string | null;
}

/** 날 분류 — 경계 · 전부 접수 · 전부 거부 · 판단 불가(조각이 전부 기타). */
export type LaunchDayKind = "gate" | "all_accept" | "all_reject" | "unknown";

/** 한 발사(하루)의 경계. */
export interface LaunchDay<P> {
  date: string;
  /** wire 오름차순 */
  pieces: P[];
  /** 거부(launchGateSideOf 'closed' — 101 · 515) 조각 rel 최댓값 */
  lo: number | null;
  /** 열림(launchGateSideOf 'open' — 접수 · 뒤탐침 기타(E127 아님)) 조각 rel 최솟값 */
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

/** 16:00 뒤탐침 회차 — gh-trade kind 17 round(← ev_price) 값. 앞쪽 탐침은 −1. */
export const LAUNCH_TAIL_PROBE_ROUND = -2;

/**
 * 뒤탐침 「기타」 중 경계 밖으로 읽는 결과 코드 — gh-trade 회신: 교보 E127 = 조기 도착 거부라 열림 증거가 아니다.
 */
export const LAUNCH_TAIL_PROBE_OUTSIDE_CODES: ReadonlySet<string> = new Set(["E127"]);

/**
 * 16:00 뒤탐침인가 — probe === true && round === −2(quick-261030-dz7).
 * gh-trade 값 규칙: probe ← has_remaining · round ← ev_price · wire = 그 시장 실조각 수 + i · piece_idx = i.
 * round −1(앞쪽 탐침)은 뒤탐침이 아니다 — 실조각과 같은 규칙으로 읽는다.
 */
export function isLaunchTailProbe(p: { probe?: boolean | null; round?: number | null }): boolean {
  return p.probe === true && p.round === LAUNCH_TAIL_PROBE_ROUND;
}

/** 경계 판정 — open = 열림(hi 후보) · closed = 거부(lo 후보). */
export type LaunchGateSide = "open" | "closed";

/**
 * 조각 하나의 경계 판정 한 벌 — 접수 → open · 거부(101 · 515) → closed · 뒤탐침 「기타」(result_code 가
 * `LAUNCH_TAIL_PROBE_OUTSIDE_CODES` 에 없음 · null 포함) → open · 그 밖 → null(경계 밖).
 * 뒤탐침 기타가 열림인 근거 = gh-trade st7 「개시 = 첫 101 이 아닌 응답(가격 거부 포함)」. 실조각 · 앞쪽 탐침의
 * 기타 · 무응답 · E127 은 지금처럼 경계 밖.
 */
export function launchGateSideOf(
  p: Pick<LaunchCalcPiece, "result" | "probe" | "round" | "result_code">,
): LaunchGateSide | null {
  if (isLaunchAccept(p.result)) return "open";
  if (isLaunchReject(p.result)) return "closed";
  if (
    isLaunchTailProbe(p) &&
    p.result === "기타" &&
    !(p.result_code != null && LAUNCH_TAIL_PROBE_OUTSIDE_CODES.has(p.result_code))
  ) {
    return "open";
  }
  return null;
}

function maxOrNull(xs: number[]): number | null {
  return xs.length > 0 ? Math.max(...xs) : null;
}

function minOrNull(xs: number[]): number | null {
  return xs.length > 0 ? Math.min(...xs) : null;
}

/**
 * 첨부 `group()` — 날짜 오름차순 묶음 · 묶음 안 wire 오름차순 · lo/hi/first/kind.
 * lo/hi 는 `launchGateSideOf`(뒤탐침 포함). 뒤탐침은 마지막 실조각 뒤라 first 에 영향 없다.
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
    const lo = maxOrNull(ps.filter((p) => launchGateSideOf(p) === "closed").map((p) => p.sent_rel_us));
    const hi = minOrNull(ps.filter((p) => launchGateSideOf(p) === "open").map((p) => p.sent_rel_us));
    const first = Math.min(...ps.map((p) => p.sent_rel_us));
    const kind: LaunchDayKind =
      lo !== null && hi !== null ? "gate" : hi !== null ? "all_accept" : lo !== null ? "all_reject" : "unknown";
    return { date, pieces: ps, lo, hi, first, kind };
  });
}

/** 조각에서 셀 수 있는 머리 값 9개(D-04 백필 머리). 학습 열 · next_offset_us 는 계산하지 않는다. */
export interface LaunchHeadCalc {
  /** 실조각 수(뒤탐침 제외 — kind 18 n_pieces 와 같은 정의) */
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

/**
 * 한 발사의 조각들 → 머리 계산값. 빈 배열은 throw(머리 없는 발사는 없다).
 * 실조각만 센다 — 뒤탐침(`isLaunchTailProbe`)은 먼저 뺀다(kind 18 머리와 같은 정의 · 실조각은 기타 = 경계 밖).
 * 뒤탐침만 남아 실조각이 0 이면 throw. 앞쪽 탐침(round −1)은 한 조각으로 센다.
 */
export function launchHeadOf<P extends Pick<LaunchCalcPiece, "wire" | "sent_rel_us" | "result" | "probe" | "round">>(
  all: readonly P[],
): LaunchHeadCalc {
  if (all.length === 0) throw new Error("launchHeadOf: 조각이 없습니다");
  const pieces = all.filter((p) => !isLaunchTailProbe(p));
  if (pieces.length === 0) throw new Error("launchHeadOf: 실조각이 없습니다(뒤탐침만)");
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

// ─────────────────────────────────────────────────────────────────────────────
// 패널 집계 · 리본 — 첨부 summaryCard · drawPanel 식
// ─────────────────────────────────────────────────────────────────────────────

/** 패널 머리 집계. 판단 불가 날은 경계 · 전부 접수 · 전부 거부 어디에도 세지 않는다(Pitfall 5). */
export interface LaunchPanelStats {
  days: number;
  n_gate: number;
  n_all_accept: number;
  n_all_reject: number;
  n_unknown: number;
  /** 접수된 가장 이른 조각 rel(= 날별 hi 최솟값) */
  min_accept: number | null;
  /** 거부 받은 가장 늦은 조각 rel(= 날별 lo 최댓값) */
  max_reject: number | null;
}

export function launchPanelStatsOf(days: readonly LaunchDay<unknown>[]): LaunchPanelStats {
  const count = (k: LaunchDayKind) => days.filter((d) => d.kind === k).length;
  return {
    days: days.length,
    n_gate: count("gate"),
    n_all_accept: count("all_accept"),
    n_all_reject: count("all_reject"),
    n_unknown: count("unknown"),
    min_accept: minOrNull(days.flatMap((d) => (d.hi !== null ? [d.hi] : []))),
    max_reject: maxOrNull(days.flatMap((d) => (d.lo !== null ? [d.lo] : []))),
  };
}

/** 리본 한 칸 — 그 시각에 첫 조각을 쐈다면 확실히 접수 · 확실히 거부 · 모름인 날 수. */
export interface LaunchRibbonCell {
  ok: number;
  bad: number;
  unknown: number;
}

/** 첨부 식 그대로 — `v ≥ hi` 면 접수, 아니면 `v ≤ lo` 면 거부, 나머지 모름(hi 먼저 판정). */
export function launchRibbonAt(days: readonly LaunchDay<unknown>[], v: number): LaunchRibbonCell {
  let ok = 0;
  let bad = 0;
  for (const d of days) {
    if (d.hi !== null && v >= d.hi) ok++;
    else if (d.lo !== null && v <= d.lo) bad++;
  }
  return { ok, bad, unknown: days.length - ok - bad };
}

// ─────────────────────────────────────────────────────────────────────────────
// 발사 기준 — profile × 거래소 → 기준시각 · 지도 발사
// ─────────────────────────────────────────────────────────────────────────────

/**
 * (profile, 거래소) → 발사 기준시각 `"HH:MM:SS"`. Q16 = KRX 16:00:00 · A = KRX 09:00:27(매수 다리) ·
 * N · A = NXT 09:00:30(N 매수 · A 매도 다리). 그 밖 조합은 null(백필 입력이면 거부 사유).
 * A KRX 는 본회차 09:00:27 + 재확인 회차(예 09:00:29) — 주문 내역 판정은 `isLaunchFireBaseOf`, 이 함수는
 * relay launch-backfill 이 ndjson 에 fire_base 가 없을 때 쓰는 백필 기본값(백필 입력은 본회차로 정한다).
 */
export function launchFireBaseOf(profile: string, fireExchange: string): string | null {
  if (fireExchange === "KRX") {
    if (profile === "Q16") return "16:00:00";
    if (profile === "A") return "09:00:27";
    return null;
  }
  if (fireExchange === "NXT" && (profile === "N" || profile === "A")) return "09:00:30";
  return null;
}

/** A KRX 매수 회차 기준시각 창 — `[이상, 미만)`. HH:MM:SS 0 패딩 문자열이라 사전순 비교 = 시각 비교. */
const A_KRX_FIRE_BASE_FROM = "09:00:00";
const A_KRX_FIRE_BASE_UNTIL = "09:00:30";

/**
 * 「이 (profile, 거래소) 의 발사로 받아도 되는 기준시각인가」 — 주문 내역 탭 판정(quick-261030-d7b).
 *
 * A · KRX 는 `09:00:00` 이상 `09:00:30` 미만이면 true(본회차 09:00:27 · 마감선 재확인 회차 09:00:29 …).
 * 그 밖은 `launchFireBaseOf` 결과가 null 이 아니고 fireBase 와 같을 때만 true.
 *
 * 범위를 09:00:27 이상이 아니라 09:00:00 이상으로 잡는 근거: StockDMA.fbs `case1_fire_ms` 는 09:00:00 기준 설정값
 * (기본 27000 · 2026-10-24 전 29000 · 25000 미만 또는 29500 이상 거부)이고 마감선 09:00:29.5 재확인 회차가
 * 09:00:29 로 오므로, A KRX 매수 회차는 설정이 바뀌어도 늘 NXT 다리(09:00:30) 전 09시 정각 창 안이다.
 */
export function isLaunchFireBaseOf(profile: string, fireExchange: string, fireBase: string): boolean {
  if (profile === "A" && fireExchange === "KRX") {
    return fireBase >= A_KRX_FIRE_BASE_FROM && fireBase < A_KRX_FIRE_BASE_UNTIL;
  }
  const base = launchFireBaseOf(profile, fireExchange);
  return base !== null && base === fireBase;
}

/** (거래소, 기준시각) → 지도 발사. A 의 KRX 09:00:27 다리는 지도 대상이 아니라 null(주문 내역에만). */
export function launchFireOf(row: { fire_exchange: string; fire_base: string }): LaunchFire | null {
  for (const fire of Object.keys(LAUNCH_FIRES) as LaunchFire[]) {
    const f = LAUNCH_FIRES[fire];
    if (f.fire_exchange === row.fire_exchange && f.fire_base === row.fire_base) return fire;
  }
  return null;
}
