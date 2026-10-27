/**
 * Phase 36 — 매매손익 계약 한 벌(D-17 ~ D-19). server `/api/admin/pnl` · `/api/me/pnl` ↔ webapp 이 같은 타입 · 같은 기간 계산을 읽는다.
 *
 * RPC jsonb 계약 — 키 이름은 36-07 RPC(`dma_pnl_daily_for_admin` · `dma_pnl_daily_for_user`)가 그대로 낸다. 다단어 키는 snake_case
 * 그대로 둔다(Phase 35 RPC 통과 선례 — server 가 키를 바꾸지 않고 통과시킨다). 금액은 전부 원(정수) · 손익은 음수 가능.
 *
 * 날짜는 KST `YYYY-MM-DD`(`kstDateIso`) 문자열이다. 기간 · 요일 계산은 UTC 달력 산술로 해 실행 TZ 와 무관하다.
 */

/** 기간 칩 — 7 · 30 · 90일(오늘 포함) · 이달(그달 1일 ~ 오늘). */
export type PnlRange = "7" | "30" | "90" | "month";
export const PNL_RANGES: readonly PnlRange[] = ["7", "30", "90", "month"];

/** 어드민 묶음 기준 — 계정별(dma_user_id) · 계좌별(account_no · 게이트웨이 무관). */
export type PnlGroupBy = "user" | "account";

/** 합계 한 묶음 — 실현손익 · 수수료 · 세금 · 매수/매도 체결 금액(원) · 체결 건수. */
export interface PnlTotals {
  pnl: number;
  fee: number;
  tax: number;
  buy: number;
  sell: number;
  fills: number;
}

/** 일자 안 종목 한 줄. code · name 은 종목 마스터에 없으면 null(화면은 isin). */
export interface PnlStockRow {
  isin: string;
  code: string | null;
  name: string | null;
  pnl: number;
  buy: number;
  sell: number;
  fills: number;
}

/** 묶음 안 하루(KST `YYYY-MM-DD`) — 합계 + 종목 줄. */
export interface PnlDayRow extends PnlTotals {
  date: string;
  stocks: PnlStockRow[];
}

/** 묶음에 속한 계좌 하나(증권사는 gateway 접두로 파생). */
export interface PnlAccountRef {
  broker: "KB" | "KYOBO";
  gateway: string;
  account_no: string;
}

/**
 * 묶음 하나. 계정별 key = dma_user_id(`""` = 「미상」 · 정렬 맨 뒤) · 계좌별 key = account_no. `/me` 는 그룹 0~1개.
 */
export interface PnlGroup {
  key: string;
  accounts: PnlAccountRef[];
  dma_user_ids: string[];
  account_name: string | null;
  total: PnlTotals;
  days: PnlDayRow[];
}

/** RPC 응답 한 덩이 — 요청 기간(KST 날짜) + 묶음들. */
export interface PnlReport {
  from: string;
  to: string;
  groups: PnlGroup[];
}

const DAY_MS = 86_400_000;
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? NaN, m: m ?? NaN, d: d ?? NaN };
}

function isoOfUtc(ms: number): string {
  const t = new Date(ms);
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${m}-${d}`;
}

/**
 * 기간 칩 → KST 날짜 범위. N일 = 오늘 − (N−1)일(달력 일 · 오늘 포함) · month = 그달 1일 · to = 오늘.
 * 예: ("30", "2026-10-27") → 2026-09-28 ~ 2026-10-27 · ("month", "2026-10-27") → 2026-10-01 ~ 2026-10-27.
 */
export function pnlRangeOf(range: PnlRange, todayIso: string): { from: string; to: string } {
  const { y, m, d } = parseIso(todayIso);
  if (range === "month") return { from: isoOfUtc(Date.UTC(y, m - 1, 1)), to: todayIso };
  return { from: isoOfUtc(Date.UTC(y, m - 1, d) - (Number(range) - 1) * DAY_MS), to: todayIso };
}

/** KST 날짜 → 「M/D (요일 한 글자)」. 예: "2026-10-27" → 「10/27 (화)」. */
export function formatPnlDay(dateIso: string): string {
  const { y, m, d } = parseIso(dateIso);
  return `${m}/${d} (${WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** 기간 캡션 「M/D ~ M/D」. 예: ("2026-09-28", "2026-10-27") → 「9/28 ~ 10/27」. */
export function formatPnlRangeCaption(from: string, to: string): string {
  const a = parseIso(from);
  const b = parseIso(to);
  return `${a.m}/${a.d} ~ ${b.m}/${b.d}`;
}
