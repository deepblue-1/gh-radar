/**
 * order-log-feed — 주문로그 피드의 순수 함수 (Phase 25-07 · 공용 패널 탭 · 카드 탭 · 창 분리 공용).
 *
 * ① D-07 오늘 경계 — 복원(REST 하루치) + 푸시(`journal.events`) 병합
 *   복원 행은 서버가 이미 그 날짜로 걸렀으므로 거르지 않는다. 푸시 행은 `tradeDate === date` 인 것만 받는다 —
 *   자정을 넘겨 열려 있던 탭이 어제 줄을 섞지 않게(`orders-api.ts` `mergeJournalRows` 와 같은 문법).
 *   키는 `strategyEventKey`(gateway|journalEpoch|seq) 하나 — 이벤트는 불변 원문이라 먼저 본 행을 남긴다.
 *   정렬은 `compareStrategyEventAsc`(오름차순 · 새 로그는 아래) 하나다.
 *
 * ② 결정 1-A 범위 — 계좌의 주문 이벤트 + 시세 이벤트 전부
 *   시세 판정은 kind 로만 한다(`isMarketStrategyEvent` — 빈 계좌번호로 판정하지 않는다 · T-25-01). 카드 탭은
 *   같은 함수에 종목 · 거래소 범위를 더 싣는다(시세 이벤트에도 걸린다). 계좌가 없으면(null) 시세 이벤트만.
 *   이 범위는 **보기 선택**이다 — 받을 수 있는 행은 서버 RPC · relay fanout 이 계좌 권한으로 이미 제한했다(T-25-30).
 *
 * ③ D-08 구분 축 — group 기준 6값, kind 필터는 없다
 *   선매수 group 1 · 추가매수 2 · 후매수 3 · 매도 = 호가매도 4 · 체결매도 5 · 체결훅 6 합침 · 시세 = kind 1·2.
 *   모르는 group(0 · 계약 밖)인 주문 이벤트는 「전체」 에만 보인다 — 방향을 지어내지 않는다(D-10).
 *
 * ④ R3 창 분리 쿼리 — `account` · `date` · `stock`(ISIN) · `ex` · `kind`, 「전체」 는 생략
 *   화이트리스트 파싱이다(T-25-29): 모르는 값은 무시(전체) · 형식 오류/미래 날짜는 오늘로 교정 · `all` 은 별칭.
 *   쿼리는 필터일 뿐 권한이 아니다 — 가시성은 서버가 `req.userId` 로 판정한다.
 */

import { compareStrategyEventAsc, isMarketStrategyEvent, strategyEventKey } from '@gh-radar/shared';
import type { StrategyEventRow } from '@gh-radar/shared';

/* ── 필터 타입 ─────────────────────────────────────────────────────── */

export type OrderLogKindFilter = 'all' | 'pre' | 'add' | 'post' | 'sell' | 'market';
export type OrderLogExchangeFilter = 'all' | 'KRX' | 'NXT';

export interface OrderLogFilters {
  /** `'all'` 또는 ISIN(12자). */
  stock: string;
  ex: OrderLogExchangeFilter;
  kind: OrderLogKindFilter;
}

export const DEFAULT_ORDER_LOG_FILTERS: OrderLogFilters = Object.freeze({ stock: 'all', ex: 'all', kind: 'all' });

/** 구분 칩 옵션 — 순서 · 라벨이 UI-SPEC Copywriting 「필터 칩」 행 그대로다. */
export const ORDER_LOG_KIND_FILTERS: ReadonlyArray<{ value: OrderLogKindFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'pre', label: '선매수' },
  { value: 'add', label: '추가매수' },
  { value: 'post', label: '후매수' },
  { value: 'sell', label: '매도' },
  { value: 'market', label: '시세' },
];

/** 거래소 칩 옵션. */
export const ORDER_LOG_EXCHANGE_FILTERS: ReadonlyArray<{ value: OrderLogExchangeFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'KRX', label: 'KRX' },
  { value: 'NXT', label: 'NXT' },
];

/** 표면 범위 — 공용 패널 = 계좌만 · 카드 탭 = 계좌 + 종목 + 거래소. */
export interface OrderLogScope {
  /** 상태줄 · 카드 계좌. `null` = 계좌 없음(시세 이벤트만). */
  accountNo: string | null;
  isin?: string;
  exchange?: string;
}

/* ── ① 병합 ───────────────────────────────────────────────────────── */

export function mergeStrategyEvents(
  restored: readonly StrategyEventRow[],
  pushed: readonly StrategyEventRow[],
  date: string,
): StrategyEventRow[] {
  const byKey = new Map<string, StrategyEventRow>();
  for (const row of restored) {
    const key = strategyEventKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  for (const row of pushed) {
    if (row.tradeDate !== date) continue;
    const key = strategyEventKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()].sort(compareStrategyEventAsc);
}

/* ── ② 범위 ───────────────────────────────────────────────────────── */

export function inScope(row: StrategyEventRow, scope: OrderLogScope): boolean {
  if (scope.isin !== undefined && row.isin !== scope.isin) return false;
  if (scope.exchange !== undefined && row.exchange !== scope.exchange) return false;
  if (isMarketStrategyEvent(row.kind)) return true;
  return scope.accountNo !== null && row.accountNo === scope.accountNo;
}

/* ── ③ 구분 · 필터 ─────────────────────────────────────────────────── */

const KIND_GROUPS: Readonly<Record<Exclude<OrderLogKindFilter, 'all' | 'market'>, readonly number[]>> = {
  pre: [1],
  add: [2],
  post: [3],
  sell: [4, 5, 6],
};

export function matchesKind(row: StrategyEventRow, kind: OrderLogKindFilter): boolean {
  if (kind === 'all') return true;
  const market = isMarketStrategyEvent(row.kind);
  if (kind === 'market') return market;
  return !market && KIND_GROUPS[kind].includes(row.group);
}

export function applyOrderLogFilters(
  rows: readonly StrategyEventRow[],
  filters: OrderLogFilters,
): StrategyEventRow[] {
  return rows.filter(
    (row) =>
      (filters.stock === 'all' || row.isin === filters.stock) &&
      (filters.ex === 'all' || row.exchange === filters.ex) &&
      matchesKind(row, filters.kind),
  );
}

/** 종목 칩 옵션 — 그날 범위 안 이벤트가 있는 종목만 · ISIN 중복 제거 · 표시 이름 가나다순. */
export function stockOptions(
  rows: readonly StrategyEventRow[],
  nameOf: (row: StrategyEventRow) => string,
): Array<{ value: string; label: string }> {
  const byIsin = new Map<string, string>();
  for (const row of rows) {
    if (!byIsin.has(row.isin)) byIsin.set(row.isin, nameOf(row));
  }
  return [...byIsin.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko') || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/* ── ④ 창 분리 쿼리 ────────────────────────────────────────────────── */

export interface OrderLogQuery {
  account: string | null;
  /** KST `YYYY-MM-DD`. */
  date: string;
  filters: OrderLogFilters;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISIN_RE = /^[A-Z0-9]{12}$/;
const ACCOUNT_RE = /^[0-9A-Za-z-]{1,20}$/;
const EXCHANGES: ReadonlySet<string> = new Set(['KRX', 'NXT']);
const KINDS: ReadonlySet<string> = new Set(['pre', 'add', 'post', 'sell', 'market']);

/** 형식 + 실제 달력 날짜(`2026-02-30` 거부). */
function isCalendarDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * URL 쿼리 → 창 분리 상태. `corrected` = 받은 값 중 무엇이든 버리거나 바꿨다(형식 오류 · 미래 날짜 · 모르는 값 ·
 * `all` 별칭) — 호출자가 `router.replace` 로 정본 URL 을 다시 쓴다. 값이 없는 것은 교정이 아니다.
 */
export function parseOrderLogQuery(
  params: URLSearchParams,
  today: string,
): OrderLogQuery & { corrected: boolean } {
  let corrected = false;

  const rawAccount = params.get('account');
  let account: string | null = null;
  if (rawAccount !== null) {
    if (ACCOUNT_RE.test(rawAccount)) account = rawAccount;
    else corrected = true;
  }

  const rawDate = params.get('date');
  let date = today;
  if (rawDate !== null) {
    if (isCalendarDate(rawDate) && rawDate <= today) date = rawDate;
    else corrected = true;
  }

  const rawStock = params.get('stock');
  let stock = 'all';
  if (rawStock !== null) {
    if (ISIN_RE.test(rawStock)) stock = rawStock;
    else corrected = true;
  }

  const rawEx = params.get('ex');
  let ex: OrderLogExchangeFilter = 'all';
  if (rawEx !== null) {
    if (EXCHANGES.has(rawEx)) ex = rawEx as OrderLogExchangeFilter;
    else corrected = true;
  }

  const rawKind = params.get('kind');
  let kind: OrderLogKindFilter = 'all';
  if (rawKind !== null) {
    if (KINDS.has(rawKind)) kind = rawKind as OrderLogKindFilter;
    else corrected = true; // `all` 별칭 포함 — 정본 URL 은 생략이다.
  }

  return { account, date, filters: { stock, ex, kind }, corrected };
}

/** 창 분리 상태 → 정본 쿼리 문자열(앞 `?` 없음). 「전체」 · 오늘 · 계좌 없음은 생략한다. */
export function orderLogQueryString(q: OrderLogQuery, today: string): string {
  const params = new URLSearchParams();
  if (q.account !== null) params.set('account', q.account);
  if (q.date !== today) params.set('date', q.date);
  if (q.filters.stock !== 'all') params.set('stock', q.filters.stock);
  if (q.filters.ex !== 'all') params.set('ex', q.filters.ex);
  if (q.filters.kind !== 'all') params.set('kind', q.filters.kind);
  return params.toString();
}

/* ── 창 분리 (R4) ──────────────────────────────────────────────────── */

/** 창 분리 라우트. */
export const ORDER_LOG_WINDOW_PATH = '/trading/order-log';
/** 창 이름 — 다시 누르면 같은 창을 재사용한다(창이 쌓이지 않는다 · R4). */
export const ORDER_LOG_WINDOW_NAME = 'gh-radar-order-log';
/**
 * F-A 한 줄이 대부분 잘리지 않는 폭 (R4).
 *
 * ⚠️ `noopener` 를 넣지 않는다 (WR-04). HTML 표준의 「rules for choosing a navigable」 은 noopener 면 이름으로 기존 창을
 * 찾지 않고 늘 새 창을 만든다 — 누를 때마다 창과 wss 가 쌓여 R4(재사용)가 깨진다. opener 차단은 연 뒤
 * `openOrderLogWindow` 가 `opener = null` 로 대신한다(같은 출처라 noopener 의 보안 이득이 작다).
 */
export const ORDER_LOG_WINDOW_FEATURES = 'width=960,height=720';

/**
 * 주문로그 창을 연다 — 같은 이름의 창이 있으면 그 창을 재사용해 새 URL 로 옮기고 앞으로 가져온다(R4 · WR-04).
 * 연 창의 `opener` 는 끊는다(역참조 차단). 팝업 차단 등으로 창이 없으면 아무것도 하지 않는다.
 */
export function openOrderLogWindow(url: string): void {
  const w = window.open(url, ORDER_LOG_WINDOW_NAME, ORDER_LOG_WINDOW_FEATURES);
  if (w === null) return;
  try {
    w.opener = null;
  } catch {
    // 일부 환경은 opener 쓰기를 막는다 — 재사용이 요구사항이라 여기서 실패해도 창은 그대로 쓴다.
  }
  w.focus();
}

/* ── 창 분리 날짜 이동 (25-10 · 결정 5) ────────────────────────────────── */

/**
 * KST 날짜 문자열을 **달력 하루씩** 옮긴다(주말 · 휴장일도 한 칸 — 결정 5). 입출력 모두 `YYYY-MM-DD` 이고 시각이 없어
 * UTC 자정으로 계산해도 KST 달력과 같다(날짜만 다룬다 · 서머타임 없음).
 */
export function shiftKstDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const KST_WEEKDAY = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' });

/** KST 날짜의 요일 한 글자(「월」 …) — `Intl` ko-KR `weekday:"short"` · Asia/Seoul(UI-SPEC ③ 날짜 라벨). */
export function kstWeekdayShort(date: string): string {
  return KST_WEEKDAY.format(new Date(`${date}T12:00:00+09:00`));
}
