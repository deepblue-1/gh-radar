import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateOrderResponse,
  DmaOrderRow,
  DmaOrderStatus,
  OrderMarket,
  OrderSide,
  OrderType,
  RelayExchange,
} from "@gh-radar/shared";
import { kstDateIso } from "@gh-radar/shared";

import { ApiError, StockNotFound } from "../errors.js";

/**
 * Phase 15 Plan 17 — DMA 주문 allowlist·ISIN 매핑·감사 기록 (RELAY-02, D-24).
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`chat-history.ts` 규약).
 * 서비스롤은 RLS 를 우회하므로 **모든 read/write 가 `.eq("user_id", userId)` 명시
 * 소유권 필터를 직접 건다** — `dma_orders` 는 접근 규칙 0개라 RLS 는 브라우저 직결만
 * 막고, 서버 경로의 실제 방어선은 이 필터다 (T-15-01).
 *
 * 두 가지를 **하지 않는다**:
 *   - `dma_credentials` 의 암호문을 읽지 않는다. 서버는 AES 키를 갖지 않으므로(D-19)
 *     복호할 수도 없고, 읽을 이유도 없다 — 필요한 것은 **행의 존재 여부**뿐이다(D-12).
 *     select 목록에 암호문 컬럼을 넣는 순간 그것이 로그·에러·덤프로 새는 경로가 생긴다.
 *   - 단축코드에서 표준코드를 산술로 유도하지 않는다. 우선주 등에서 어긋나
 *     **다른 종목이 주문된다** (D-28 / 15-10 검증).
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
  created_at: string;
  updated_at: string;
};

/** 조회 컬럼 화이트리스트. `user_id` 는 응답에 싣지 않는다(본인 행만 나간다). */
const ORDER_COLS =
  "id,account_no,isin,stock_code,exchange,market,side,order_type,org_order_no,qty,price,order_no,status,result_code,notice_type,message,filled_qty,created_at,updated_at";

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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const DbError = (msg: string) => new ApiError(500, "DB_ERROR", msg);

/**
 * `stocks.isin` 이 비어 있는 종목 — 게이트웨이 주문 키를 만들 수 없다 (D-28).
 * 실제로 일어난다: 15-10 백필 후에도 활성 종목 42건이 NULL 로 남아 있다.
 * 지역 헬퍼로 두는 이유는 `chat-history.ts` 의 `ConversationNotFound` 와 같다 —
 * 이 조회를 하는 모듈 밖에서는 던질 일이 없다.
 */
const IsinUnavailable = () =>
  new ApiError(422, "ISIN_UNAVAILABLE", "이 종목은 아직 주문할 수 없어요");

/**
 * DMA allowlist 판정 (D-12) — `dma_credentials` 에 매핑 행이 있는가.
 *
 * **존재 여부만** 본다. 암호화된 비밀번호 컬럼은 select 목록에 넣지 않는다 (T-15-05).
 */
export async function isDmaAllowed(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("dma_credentials")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw DbError("주문 권한 조회에 실패했습니다.");
  return data !== null && data !== undefined;
}

/**
 * 6자 단축코드 → 게이트웨이 주문 키 (D-28 / D-21).
 *
 * `market` 의 "KOSPI"→"K" / "KOSDAQ"→"Q" 변환은 **이 함수 한 곳에서만** 한다.
 * 게이트웨이는 이 필드의 **첫 글자만** 읽으므로 호출부마다 문자열을 지어내면
 * `"KOSDAQ"` 이 어느 날 `K` 로 읽혀 **엉뚱한 시장으로 주문이 나간다** (15-16 동일 규율).
 */
export async function resolveIsinAndMarket(
  supabase: SupabaseClient,
  code: string,
): Promise<{ isin: string; market: OrderMarket }> {
  const { data, error } = await supabase
    .from("stocks")
    .select("code,isin,market")
    .eq("code", code)
    .maybeSingle();
  if (error) throw DbError("종목 조회에 실패했습니다.");
  if (!data) throw StockNotFound(code);

  const row = data as { isin: string | null; market: string };
  if (!row.isin || row.isin.length !== 12) throw IsinUnavailable();

  const market = toOrderMarket(row.market);
  if (market === null) throw IsinUnavailable();

  return { isin: row.isin, market };
}

/**
 * 시장 구분 변환의 **유일한 지점** (D-21). 모르는 값은 지어내지 않고 null 이다 —
 * 기본값 "K" 로 메우면 코스닥 주문이 코스피로 나간다.
 */
function toOrderMarket(market: string): OrderMarket | null {
  if (market === "KOSPI") return "K";
  if (market === "KOSDAQ") return "Q";
  return null;
}

/** `insertOrderRequest` 입력 — 라우터가 검증한 바디 + 서버가 채운 필드. */
export type OrderRequestInsert = {
  accountNo: string;
  isin: string;
  code: string;
  exchange: RelayExchange;
  market: OrderMarket;
  side: OrderSide;
  orderType: OrderType;
  orgOrderNo?: string;
  qty: number;
  price: number;
};

/**
 * 요청 시점 감사 기록 (D-24 / T-15-32). **relay 호출 전에** 남긴다 —
 * 나중에 남기면 서버가 그 사이에 죽었을 때 "나갔는지 모르는 주문"이 흔적 없이 사라진다.
 *
 * `status` 는 DB 기본값 `'requested'` 를 그대로 쓴다. 반환하는 `id` 가 relay 상관의
 * 1순위 키(`orderRowId`)다 — 이것이 없으면 relay 는 `order_no` 로만 상관해야 하고,
 * 접수 전 거부는 `order_no` 가 없어 귀속이 모호해진다 (15-16 인계 ①).
 */
export async function insertOrderRequest(
  supabase: SupabaseClient,
  userId: string,
  payload: OrderRequestInsert,
): Promise<string> {
  const { data, error } = await supabase
    .from("dma_orders")
    .insert({
      user_id: userId,
      account_no: payload.accountNo,
      isin: payload.isin,
      stock_code: payload.code,
      exchange: payload.exchange,
      market: payload.market,
      side: payload.side,
      order_type: payload.orderType,
      org_order_no: payload.orgOrderNo ?? null,
      qty: payload.qty,
      price: payload.price,
    })
    .select("id")
    .single();
  if (error || !data) throw DbError("주문 기록에 실패했습니다.");
  return (data as { id: string }).id;
}

/** `updateOrderResult` 입력. 모르는 값은 넘기지 않는다(부분 갱신). */
export type OrderResultPatch = {
  status: DmaOrderStatus;
  orderNo?: string;
  resultCode?: number;
  message?: string;
};

/**
 * relay 응답으로 요청 행을 갱신한다 (D-22 첫 경로. 이후 체결·취소확인은 relay 가 쓴다).
 *
 * `.eq("user_id")` 를 함께 거는 이유는 소유권 재확인이 아니라 **셀렉터 사고 방어**다 —
 * `id` 가 어떤 이유로 비어도 두 조건이 모두 비면 update 가 전 테이블을 덮는다.
 *
 * `orderNo` 는 빈 문자열이면 null 로 저장한다. 접수 전 거부·타임아웃 행은 주문번호가
 * 없는 것이 진실이고, `""` 로 채우면 `order_no` 부분 인덱스에 쓸모없는 행이 쌓인다.
 * 실패해도 **throw 하지 않는다** — 주문은 이미 나갔고, 감사 기록 실패를 이유로
 * 사용자에게 오류를 돌려주면 "실제로는 접수됐는데 실패로 보이는" 최악의 화면이 된다.
 */
export async function updateOrderResult(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  patch: OrderResultPatch,
): Promise<void> {
  const row: Record<string, unknown> = {
    status: patch.status,
    updated_at: new Date().toISOString(),
  };
  if (patch.orderNo !== undefined) row.order_no = patch.orderNo === "" ? null : patch.orderNo;
  if (patch.resultCode !== undefined) row.result_code = patch.resultCode;
  if (patch.message !== undefined) row.message = patch.message;

  await supabase.from("dma_orders").update(row).eq("id", id).eq("user_id", userId);
}

/** `CreateOrderResponse` → 갱신 패치. relay 가 판정한 status 를 그대로 쓴다. */
export function patchFromRelayResult(result: CreateOrderResponse): OrderResultPatch {
  return {
    status: result.status,
    orderNo: result.orderNo,
    resultCode: result.resultCode,
    message: result.message,
  };
}

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
