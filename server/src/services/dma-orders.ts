import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DmaOrderOrigin,
  DmaOrderRow,
  DmaOrderStatus,
  OrderMarket,
  OrderSide,
  OrderType,
  RelayExchange,
} from "@gh-radar/shared";
import { kstDateIso } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 16 Plan 16 — DMA 주문 **조회 전용** 서비스 (D-02 / D-24).
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`chat-history.ts` 규약).
 * 서비스롤은 RLS 를 우회하므로 **모든 read 가 `.eq("user_id", userId)` 명시 소유권
 * 필터를 직접 건다** — `dma_orders` 는 접근 규칙 0개라 RLS 는 브라우저 직결만 막고,
 * 서버 경로의 실제 방어선은 이 필터다 (T-15-01).
 *
 * ★ **쓰기 함수가 없다.** `insertOrderRequest` · `updateOrderResult` ·
 * `patchFromRelayResult` · `resolveIsinAndMarket` · `isDmaAllowed` 는 16-08 에서
 * relay 로 이식됐고(각각 `OrderStore.insertRequest` · `OrderStore.enqueueUpdate` ·
 * `SymbolMap.lookup`+`toOrderMarket` · `store/credentials.ts`), 이 plan 에서 server
 * 쪽 사본을 지웠다. 같은 행을 두 프로세스가 서로 다른 셀렉터로 쓰면 주문 상태가 갈린다.
 *
 * `origin`(주문 출처)도 relay 만 쓴다(D-03). server 는 **읽기만** 한다 — 여기에 기본값 보정을
 * 넣지 않는다. DB DEFAULT 가 이미 `'manual'` 이고 NOT NULL 이라 빈 값이 올라올 수 없다.
 */

/** `dma_orders` row (snake_case). */
type DmaOrderDbRow = {
  id: string;
  account_no: string;
  isin: string;
  stock_code: string | null;
  exchange: RelayExchange;
  market: OrderMarket;
  side: OrderSide;
  order_type: OrderType;
  org_order_no: string | null;
  qty: number;
  price: number;
  order_no: string | null;
  status: DmaOrderStatus;
  result_code: number | null;
  notice_type: string | null;
  message: string | null;
  filled_qty: number;
  /** DB 는 NOT NULL + DEFAULT `'manual'` 이라 optional 이 아니다. */
  origin: DmaOrderOrigin;
  created_at: string;
  updated_at: string;
};

/** 조회 컬럼 화이트리스트. `user_id` 는 응답에 싣지 않는다(본인 행만 나간다). */
const ORDER_COLS =
  "id,account_no,isin,stock_code,exchange,market,side,order_type,org_order_no,qty,price,order_no,status,result_code,notice_type,message,filled_qty,origin,created_at,updated_at";

function mapOrder(r: DmaOrderDbRow): DmaOrderRow {
  return {
    id: r.id,
    accountNo: r.account_no,
    isin: r.isin,
    stockCode: r.stock_code,
    exchange: r.exchange,
    market: r.market,
    side: r.side,
    orderType: r.order_type,
    orgOrderNo: r.org_order_no,
    qty: r.qty,
    price: r.price,
    orderNo: r.order_no,
    status: r.status,
    resultCode: r.result_code,
    noticeType: r.notice_type,
    message: r.message,
    filledQty: r.filled_qty,
    origin: r.origin,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const DbError = (msg: string) => new ApiError(500, "DB_ERROR", msg);

/**
 * 하루치 주문 목록 (D-24 — 새로고침 후 복원).
 *
 * `(user_id, created_at DESC)` 인덱스를 그대로 타는 형태다. 기본값은 **KST 오늘**이며
 * 경계는 `[해당일 00:00 KST, 다음날 00:00 KST)` 다 — UTC 자정으로 자르면 장 시작 전
 * 주문이 전날 목록에 남는다.
 */
export async function listTodayOrders(
  supabase: SupabaseClient,
  userId: string,
  date?: string,
): Promise<DmaOrderRow[]> {
  const { from, to } = kstDayRangeUtc(date);
  const { data, error } = await supabase
    .from("dma_orders")
    .select(ORDER_COLS)
    .eq("user_id", userId)
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false });
  if (error) throw DbError("주문 목록 조회에 실패했습니다.");
  return ((data ?? []) as unknown as DmaOrderDbRow[]).map(mapOrder);
}

/**
 * `YYYY-MM-DD`(KST) → UTC ISO 반열린 구간. 형식은 zod 가 이미 봤지만 `2026-13-45`
 * 같은 **형식은 맞고 날짜가 아닌 값**은 여기서만 걸린다 — 그대로 두면 `toISOString()`
 * 이 RangeError 를 던져 400 이어야 할 요청이 500 이 된다.
 */
export function kstDayRangeUtc(date?: string): { from: string; to: string } {
  const day = date ?? kstDateIso();
  const start = new Date(`${day}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) {
    throw new ApiError(400, "VALIDATION_FAILED", "date: 올바른 날짜가 아닙니다.");
  }
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + 24 * 3600_000).toISOString(),
  };
}
