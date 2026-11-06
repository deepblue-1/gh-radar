import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatKstMs,
  kstDateIso,
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
  /** `HH:MM:SS(.mmm)` KST — 시간 필터(Task 3). */
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

/** 주문로그 텍스트 — RPC 1회 → 범례 + 4절. */
export async function getOrderLogText(
  supabase: SupabaseClient,
  userId: string,
  q: OrderLogQuery,
  now: Date = new Date(),
): Promise<string> {
  const date = q.date ?? kstDateIso(now);
  const isin = q.isin ?? null;
  const { data, error } = await supabase.rpc("dma_diagnosis_for_user", {
    p_user_id: userId,
    p_trade_date: date,
    p_isin: isin,
  });
  if (error) {
    logger.warn({ date, isin, err: error.message }, "[chat] diagnosis order log rpc failed");
    return ORDER_LOG_RPC_FAILED_TEXT;
  }
  const out = data as DiagnosisRpcData | null;
  if (!out || out.access !== true) return ORDER_LOG_NO_ACCESS_TEXT;
  return renderOrderLog(out, date);
}

function renderOrderLog(d: Extract<DiagnosisRpcData, { access: true }>, date: string): string {
  const orders = d.orders ?? [];
  const fills = d.fills ?? [];
  const events = d.events ?? [];
  const strategy = events.filter((e) => e.kind !== KIND_STATE_TRANSITION);
  const states = events.filter((e) => e.kind === KIND_STATE_TRANSITION);

  const lines: string[] = [ORDER_LOG_LEGEND, `날짜 ${date}${d.isin ? ` · 종목 ${d.isin}` : " · 전체 종목"}`];
  lines.push(`[주문] ${orders.length}건`, ...orders.map(orderLine));
  lines.push(`[체결] ${fills.length}건`, ...fills.map(fillLine));
  lines.push(`[전략 이벤트] ${strategy.length}건`, ...strategy.map(eventLine));
  lines.push(`[상태전이] ${states.length}건`);
  if (states.length === 0) lines.push(STATE_TRANSITION_EMPTY_TEXT);
  else lines.push(...states.map(eventLine));
  return lines.join("\n");
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

/** 웹 주문로그와 같은 문장(`orderLogLineText`) + 판정 원문 키. */
function eventLine(e: EventRow): string {
  const ev = toStrategyEventRow(e);
  const sentence = orderLogLineText(ev, e.stock_name ?? e.stock_code ?? e.isin);
  return (
    `${sentence} 사유="${e.reason_code}" 임계=${e.cond_threshold} 실측=${e.cond_actual} ` +
    `지표=${e.cond_metric} 누적=${e.cum_volume} t=${e.gw_time_ms}`
  );
}
