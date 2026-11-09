import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatKstMs,
  isMarketStrategyEvent,
  kstDateIso,
  orderGroupLabel,
  orderLogLineText,
  toStrategyEventRow,
  type StrategyEventDbRow,
} from "@gh-radar/shared";

import { logger } from "../../../logger.js";

/**
 * Phase 39 — 진단 전문가 `get_order_log` 도구 본체. RPC `dma_diagnosis_for_user` **1회**로 그날 사용자 가시 계좌의
 * 주문 · 체결 · 전략 이벤트(kind 9 포함)를 받아 고정 순서 텍스트 4절로 바꾼다(JSON 금지 — 키 반복으로 토큰 2~3배).
 *
 * 계좌 범위(SC-2): 인자는 정확히 `{p_user_id, p_trade_date, p_isin}` — `p_user_id` 는 호출자가 넘긴 인증 사용자 id
 * (라우트 `req.userId`)뿐이다. 판정은 RPC 안 `dma_visible_accounts` 가 한다. 계좌번호 전체는 싣지 않는다(끝 4자리).
 *
 * throw 하지 않는다 — RPC 오류는 warn 로그 + 「조회 실패」 텍스트(모델이 자료 없음을 알고 답하게).
 */

/** kind 9(상태전이) 0건일 때 상태전이 절 문구(D-11) — 프롬프트 · 테스트가 같은 문자열을 찾는다. */
export const STATE_TRANSITION_EMPTY_TEXT = "상태전이 기록 없음(아직 미적재)";

export const ORDER_LOG_LEGEND =
  "범례: [시각][주문번호][구분] 거래소 | 종목 | 행위 · 본문 | 누적 · 사유=서버 발주 사유 원문 · 임계/실측=조건 판정값 · t=게이트웨이 시각 ms";

export const ORDER_LOG_RPC_FAILED_TEXT = "조회 실패: 주문로그를 읽지 못했습니다";
export const ORDER_LOG_NO_ACCESS_TEXT = "DMA 계좌 매핑 없음";

/** kind 9 — 상태전이(설정 변경 · 자동 꺼짐/켜짐). 전략 이벤트 절과 따로 모은다. */
const KIND_STATE_TRANSITION = 9;

export type OrderLogQuery = {
  /** `YYYY-MM-DD` (KST). 생략 = 오늘(KST). */
  date?: string;
  /** 12자 ISIN. 생략 = 그날 가시 계좌 전체. */
  isin?: string;
  /** `HH:MM:SS(.mmm)` KST — 이 시각 밖 줄(주문 created_ms · 체결/이벤트 gw_time_ms 기준)을 뺀다. */
  from?: string;
  to?: string;
};

type OrderRow = {
  gateway: string;
  account_no: string;
  order_no: string;
  isin: string | null;
  stock_code: string | null;
  stock_name: string | null;
  exchange: string | null;
  side: string | null;
  order_type: string | null;
  qty: number | null;
  price: number | null;
  filled_qty: number | null;
  status: string | null;
  result_code: string | null;
  message: string | null;
  origin: string | null;
  created_ms: number | string | null;
};

type FillRow = {
  gateway: string;
  gw_time_ms: number | string;
  account_no: string;
  order_no: string | null;
  isin: string | null;
  stock_code: string | null;
  exchange: string | null;
  side: string | null;
  exec_price: number | null;
  exec_qty: number | null;
};

type EventRow = StrategyEventDbRow & { stock_name?: string | null };

type DiagnosisRpcData =
  | { access: false }
  | { access: true; date: string; isin: string | null; orders: OrderRow[]; fills: FillRow[]; events: EventRow[] };

type AccessData = Extract<DiagnosisRpcData, { access: true }>;

/**
 * 주문로그 텍스트 — RPC 1회 → 범례 + 4절.
 *
 * `memo`(실행 단위 · 키 `${date}|${isin ?? "*"}`)에는 RPC 결과 jsonb 를 문자열로 둔다 — 같은 (date, isin) 재호출은
 * RPC 0회. 시간 필터 · 줄 상한은 매번 적용한다(같은 자료를 다른 창으로 다시 읽을 수 있게). 오류는 메모하지 않는다.
 */
export async function getOrderLogText(
  supabase: SupabaseClient,
  userId: string,
  q: OrderLogQuery,
  now: Date = new Date(),
  memo?: Map<string, string>,
): Promise<string> {
  const date = q.date ?? kstDateIso(now);
  const isin = q.isin ?? null;
  const key = `${date}|${isin ?? "*"}`;
  let out: DiagnosisRpcData | null;
  const hit = memo?.get(key);
  if (hit !== undefined) {
    out = JSON.parse(hit) as DiagnosisRpcData;
  } else {
    const { data, error } = await supabase.rpc("dma_diagnosis_for_user", {
      p_user_id: userId,
      p_trade_date: date,
      p_isin: isin,
    });
    if (error) {
      logger.warn({ date, isin, err: error.message }, "[chat] diagnosis order log rpc failed");
      return ORDER_LOG_RPC_FAILED_TEXT;
    }
    out = (data ?? null) as DiagnosisRpcData | null;
    if (out) memo?.set(key, JSON.stringify(out));
  }
  if (!out || out.access !== true) return ORDER_LOG_NO_ACCESS_TEXT;
  return renderOrderLog(out, date, timeWindow(q.from, q.to));
}

// ── 시간 필터 ────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** `HH:MM:SS(.mmm)` → KST 하루 안 ms. 형식 검증은 도구 입력(zod)이 한다. */
function parseKstClock(s: string, end: boolean): number {
  const [hms, frac] = s.split(".");
  const [h, m, sec] = hms.split(":").map(Number);
  const base = (h * 3600 + m * 60 + sec) * 1000;
  // 소수 없이 초까지만 주면 to 는 그 초 끝까지(.999) 포함 — 「09:00:02 까지」 가 09:00:02.4 를 빼지 않게.
  if (frac === undefined) return end ? base + 999 : base;
  return base + Number(frac.padEnd(3, "0"));
}

type Window = { from: number; to: number } | null;

function timeWindow(from?: string, to?: string): Window {
  if (!from && !to) return null;
  return { from: from ? parseKstClock(from, false) : 0, to: to ? parseKstClock(to, true) : DAY_MS - 1 };
}

function kstClockOf(ms: number): number {
  return (((ms + KST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
}

function inWindow(w: Window, ms: number): boolean {
  if (!w) return true;
  const c = kstClockOf(ms);
  return c >= w.from && c <= w.to;
}

// ── 렌더 ─────────────────────────────────────────────────────────

/** 한 응답 줄 상한 — 넘으면 isin 없음: 종목별 요약 · isin 있음: 시각순 앞 400줄 + 잘림 문구. */
export const ORDER_LOG_MAX_LINES = 400;

export const ORDER_LOG_SUMMARY_HINT = "종목을 지정해 다시 부르세요";
export const ORDER_LOG_TRUNCATED_HINT = "잘렸음 — from/to 로 좁혀 다시 부르세요";

/** 한 줄 = 시각 하나 — 줄 상한 · 요약이 세 배열을 같은 축으로 다룬다. */
type Item =
  | { kind: "order"; ms: number; row: OrderRow }
  | { kind: "fill"; ms: number; row: FillRow }
  | { kind: "event"; ms: number; row: EventRow };

function itemsOf(d: AccessData, w: Window): Item[] {
  const items: Item[] = [
    ...(d.orders ?? []).map((row): Item => ({ kind: "order", ms: Number(row.created_ms), row })),
    ...(d.fills ?? []).map((row): Item => ({ kind: "fill", ms: Number(row.gw_time_ms), row })),
    ...(d.events ?? []).map((row): Item => ({ kind: "event", ms: Number(row.gw_time_ms), row })),
  ];
  return items.filter((it) => inWindow(w, it.ms));
}

function renderOrderLog(d: AccessData, date: string, w: Window): string {
  let items = itemsOf(d, w);
  const head = [ORDER_LOG_LEGEND, `날짜 ${date}${d.isin ? ` · 종목 ${d.isin}` : " · 전체 종목"}${windowLabel(w)}`];

  if (items.length > ORDER_LOG_MAX_LINES && !d.isin) return [...head, ...summaryLines(items)].join("\n");

  let tail: string | null = null;
  if (items.length > ORDER_LOG_MAX_LINES) {
    // 시각순 앞 400줄만 — 절 순서대로 자르면 주문이 많은 날 이벤트 절이 통째로 빠진다.
    const total = items.length;
    const kept = new Set([...items].sort((a, b) => a.ms - b.ms).slice(0, ORDER_LOG_MAX_LINES));
    items = items.filter((it) => kept.has(it));
    const lastMs = Math.max(...items.map((it) => it.ms));
    tail = `${ORDER_LOG_TRUNCATED_HINT} (전체 ${total}줄 중 시각순 앞 ${ORDER_LOG_MAX_LINES}줄 · 마지막 ${formatKstMs(lastMs)})`;
  }

  const orders = items.flatMap((it) => (it.kind === "order" ? [it.row] : []));
  const fills = items.flatMap((it) => (it.kind === "fill" ? [it.row] : []));
  const events = items.flatMap((it) => (it.kind === "event" ? [it.row] : []));
  const strategy = events.filter((e) => e.kind !== KIND_STATE_TRANSITION);
  const states = events.filter((e) => e.kind === KIND_STATE_TRANSITION);

  const lines = [...head];
  lines.push(`[주문] ${orders.length}건`, ...orders.map(orderLine));
  lines.push(`[체결] ${fills.length}건`, ...fills.map(fillLine));
  lines.push(`[전략 이벤트] ${strategy.length}건`, ...strategy.map(eventLine));
  lines.push(`[상태전이] ${states.length}건`);
  if (states.length === 0) lines.push(STATE_TRANSITION_EMPTY_TEXT);
  else lines.push(...states.map(eventLine));
  if (tail) lines.push(tail);
  return lines.join("\n");
}

function windowLabel(w: Window): string {
  return w ? ` · 시각 ${formatClock(w.from)}~${formatClock(w.to)}` : "";
}

function formatClock(c: number): string {
  // KST 하루 안 ms → HH:MM:SS.mmm(formatKstMs 는 epoch ms 를 받으므로 KST 0시 epoch 로 되돌려 넘긴다).
  return formatKstMs(c - KST_OFFSET_MS);
}

/** isin 없이 줄이 넘칠 때 — 종목(ISIN · 거래소)별 묶음. 모델이 isin 을 골라 다시 부르게 ISIN 을 싣는다. */
function summaryLines(items: Item[]): string[] {
  type Agg = {
    name: string | null;
    code: string | null;
    isin: string | null;
    exchange: string;
    orders: number;
    fills: number;
    events: number;
    groups: Map<string, number>;
    first: number;
    last: number;
  };
  const byStock = new Map<string, Agg>();
  for (const it of items) {
    const isin = it.row.isin || null;
    const exchange = it.row.exchange || "—";
    const key = `${isin ?? "*"}|${exchange}`;
    let a = byStock.get(key);
    if (!a) {
      a = { name: null, code: null, isin, exchange, orders: 0, fills: 0, events: 0, groups: new Map(), first: it.ms, last: it.ms };
      byStock.set(key, a);
    }
    a.first = Math.min(a.first, it.ms);
    a.last = Math.max(a.last, it.ms);
    a.code ??= it.row.stock_code ?? null;
    if (it.kind !== "fill") a.name ??= it.row.stock_name ?? null;
    if (it.kind === "order") a.orders++;
    else if (it.kind === "fill") a.fills++;
    else {
      a.events++;
      // 주문 줄(kind 3 · 6)만 그룹별로 센다 — 「선매수 몇 건 · 체결매도 몇 건」.
      if (it.row.kind === 3 || it.row.kind === 6) {
        const g = orderGroupLabel(it.row.group) ?? String(it.row.group);
        a.groups.set(g, (a.groups.get(g) ?? 0) + 1);
      }
    }
  }
  const rows = [...byStock.values()].sort((x, y) => x.first - y.first);
  const lines = [
    `요약 모드: 그날 전체 ${items.length}줄이 ${ORDER_LOG_MAX_LINES}줄을 넘어 종목별로 묶었습니다. ${ORDER_LOG_SUMMARY_HINT}(isin · from/to).`,
    `[종목별 요약] ${rows.length}종목`,
  ];
  for (const a of rows) {
    const groups = [...a.groups].map(([g, n]) => `${g} ${n}`).join(" · ");
    lines.push(
      [
        stockLabel(a.name, a.code, a.isin),
        a.exchange,
        `주문 ${a.orders} · 체결 ${a.fills} · 이벤트 ${a.events}${groups ? `(주문 줄 ${groups})` : ""}`,
        `첫 ${formatKstMs(a.first)} · 끝 ${formatKstMs(a.last)}`,
        `ISIN ${a.isin ?? "—"}`,
      ].join(" | "),
    );
  }
  return lines;
}

/** 계좌는 끝 4자리만(전체 번호를 모델 · 로그에 싣지 않는다). */
function acct(gateway: string, accountNo: string): string {
  return `${gateway} …${accountNo.slice(-4)}`;
}

function stockLabel(name: string | null | undefined, code: string | null | undefined, isin: string | null): string {
  if (name && code) return `${name}(${code})`;
  return name ?? code ?? isin ?? "—";
}

function sideLabel(side: string | null): string {
  if (side === "B") return "매수";
  if (side === "S") return "매도";
  return side ?? "—";
}

function present(v: unknown): v is string | number {
  return v !== null && v !== undefined && v !== "";
}

function orderLine(o: OrderRow): string {
  const parts = [
    `[${formatKstMs(Number(o.created_ms))}][${acct(o.gateway, o.account_no)}][#${o.order_no}]`,
    stockLabel(o.stock_name, o.stock_code, o.isin),
    o.exchange ?? "—",
    `${sideLabel(o.side)}${present(o.order_type) ? ` ${o.order_type}` : ""} ${o.qty ?? "—"}@${o.price ?? "—"}`,
    `체결 ${o.filled_qty ?? 0}`,
  ];
  if (present(o.status)) parts.push(`상태 ${o.status}`);
  if (present(o.result_code) || present(o.message)) {
    parts.push(`결과 ${[o.result_code, o.message].filter(present).join(" ")}`);
  }
  if (present(o.origin)) parts.push(`출처 ${o.origin}`);
  return parts.join(" | ");
}

function fillLine(f: FillRow): string {
  return [
    `[${formatKstMs(Number(f.gw_time_ms))}][${acct(f.gateway, f.account_no)}][#${f.order_no ?? "—"}]`,
    stockLabel(null, f.stock_code, f.isin),
    f.exchange ?? "—",
    `${sideLabel(f.side)} ${f.exec_qty ?? "—"}@${f.exec_price ?? "—"}`,
  ].join(" | ");
}

/**
 * 이벤트 줄 계좌 표기 — 주문 · 체결 줄과 같은 `[서버 …끝4자리]`(WR-08 · 다계좌 사용자가 「누가 언제 껐나」 를 가르게).
 * 시세 이벤트는 계좌가 없다(account_no '') — 판정은 kind 로(`isMarketStrategyEvent` · 빈 계좌번호 비교 금지 T-25-01).
 */
function eventAcct(e: EventRow): string {
  if (isMarketStrategyEvent(e.kind)) return `${e.gateway} 시세`;
  return acct(e.gateway, e.account_no ?? "");
}

/** `[서버 …계좌 끝 4자리]` + 웹 주문로그와 같은 문장(`orderLogLineText`) + 판정 원문 키. */
function eventLine(e: EventRow): string {
  const ev = toStrategyEventRow(e);
  const sentence = orderLogLineText(ev, e.stock_name ?? e.stock_code ?? e.isin);
  return (
    `[${eventAcct(e)}] ${sentence} 사유="${e.reason_code}" 임계=${e.cond_threshold} 실측=${e.cond_actual} ` +
    `지표=${e.cond_metric} 누적=${e.cum_volume} t=${e.gw_time_ms}`
  );
}
