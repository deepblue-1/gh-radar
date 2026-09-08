/**
 * Phase 15 Plan 16 — RELAY-02. `dma_orders` 쓰기 창구 (D-24 / D-32). Phase 16 D-03 으로
 * **insert 까지** 여기로 왔다 — 큐는 여전히 update 전용이다.
 *
 * 이 모듈의 존재 이유는 하나다: **DMA 수신 콜백에서 Supabase 를 await 하지 않는 것.**
 *
 * 게이트웨이는 연결당 송신 큐를 1024프레임 / 4MB 로 잡고, Notice 급(주문 통보·계좌 상태)이
 * 그 큐를 넘기면 **연결을 종료**한다 [gh-trade `Gateway.h:63-75`]. relay 가 통보를 받고
 * 그 자리에서 DB 왕복(수십~수백 ms)을 기다리면 수신이 밀리고, 밀린 만큼 서버 큐가 차고,
 * 결국 원인 불명의 주기적 연결 종료가 된다 (RESEARCH Pitfall 5 / Anti-Patterns).
 * 그래서 콜백은 `enqueueUpdate` 하나만 부르고(동기 O(1)), 실제 쓰기는 별도 tick 이 한다.
 *
 * 결정 근거:
 *   D-24  주문 기록은 Supabase `dma_orders` + relay stdout 두 벌이다.
 *   D-03  **insert·update 를 전부 relay 가 한다** (Phase 16). 주문이 REST 에서 wss 로
 *         넘어오면서(D-02) 세션을 쥔 프로세스가 상관도 쥐게 됐고, 그러면 행을 만드는 쪽도
 *         같아야 한다 — 두 프로세스가 같은 행을 다투는 기간을 만들지 않는다.
 *         **insert 는 `await`**(반환 id 가 상관 1순위 키라 큐에 넣으면 쓸 수 없다),
 *         **update 만 큐잉**한다 (아래 D-32 — 수신 콜백에서 Supabase 를 await 하면
 *         게이트웨이 송신 큐가 찬다).
 *   D-32  수신 경로 동기 블로킹 금지. 위 문단 전체가 이 한 줄의 근거다.
 *   A10   상관키를 `order_no` 단독으로 두지 않는다. 같은 사용자가 같은 종목·계좌·가격으로
 *         1초 안에 2건을 내면 **접수 전 거부**의 귀속이 모호해진다. server 가 insert 한
 *         행의 `id`(`orderRowId`)를 릴레이 요청에 실어 보내면 relay 가 그대로 되돌려 주므로,
 *         셀렉터 우선순위는 `id` → `order_no` 다.
 *   S-5   실패는 **반드시 로그와 카운터를 남긴다.** 조용한 드롭 금지. 다만 무한 재시도도
 *         하지 않는다 — 재시도 1회 후 드롭이고, 드롭 수가 곧 감사 기록의 결손량이다.
 *
 * 하지 않는 것:
 *   - **insert 를 큐잉하지 않는다.** 반환 `id` 가 상관 1순위 키라 호출자가 그 자리에서
 *     받아야 한다. 실패는 삼키지 않고 throw 하며, 호출자가 사용자에게 사유를 돌려준다.
 *     (`user_id` 는 **연결에서** 온다 — 인바운드 바디가 아니다. 소유권 판정의 원천이
 *     하나라는 사실은 그대로다.)
 *   - 셀렉터 없는 update 를 만들지 않는다. `WHERE` 가 빠진 update 는 **테이블 전체**를
 *     덮어쓴다 — 그래서 셀렉터 부재는 드롭이고, 그 드롭은 error 로그다.
 *   - 재시도를 지수 백오프로 늘리지 않는다. 큐가 밀리면 메모리가 늘 뿐이고, 감사 기록
 *     한 줄보다 프로세스 생존이 중요하다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DmaOrderStatus,
  OrderMarket,
  OrderSide,
  OrderType,
  RelayExchange,
} from "@gh-radar/shared";

import type { OrderOriginKind } from "../dma/envelope.js";
import { logger } from "../logger.js";

// ============================================================
// 상수 정본
// ============================================================

/**
 * 플러시 주기(ms) = 200. 체결 테이프 배치(D-35)와 같은 눈금이다.
 *
 * 더 짧게 잡을 이유가 없다 — 이 기록은 감사·새로고침 복원용이고 사용자에게 즉시
 * 보이는 경로(wss 푸시)는 이 큐를 타지 않는다.
 */
export const ORDER_FLUSH_INTERVAL_MS = 200;

/** 항목당 재시도 횟수. 1 = "한 번 더 해 보고 안 되면 버린다". */
export const ORDER_MAX_RETRIES = 1;

/**
 * 큐 길이 상한. 넘으면 **가장 오래된 것부터** 버린다.
 *
 * 상한이 없으면 Supabase 장애가 곧 e2-micro(1GB) OOM 이다. 오래된 것을 버리는 이유는
 * 최신 상태가 행의 최종 상태에 더 가깝기 때문이다(같은 주문의 갱신은 뒤가 이긴다).
 */
export const ORDER_QUEUE_LIMIT = 10_000;

// ============================================================
// 계약
// ============================================================

/**
 * 갱신 1건. **셀렉터(`orderRowId` 또는 `orderNo`) 중 최소 하나는 있어야 한다.**
 *
 * `orderNo` 는 셀렉터이면서 동시에 갱신 대상 컬럼이다 — `orderRowId` 로 찾은 행에
 * 접수 응답으로 알게 된 주문번호를 채워 넣는 것이 정상 흐름이다.
 */
export type OrderUpdate = {
  /** `dma_orders.id` (server 가 insert 한 행). 셀렉터 우선순위 1 (A10). */
  orderRowId?: string;
  /** 게이트웨이 주문번호. 셀렉터 우선순위 2 이자 갱신 대상 컬럼. */
  orderNo?: string;
  status?: DmaOrderStatus;
  resultCode?: number;
  /** 게이트웨이 통보 원문 1자. 해석하지 않는다 (마이그레이션에 CHECK 가 없는 이유). */
  noticeType?: string;
  message?: string;
  filledQty?: number;
  /**
   * 발주 주체 (D-03). 통보가 `origin` 을 들고 왔을 때 행을 정정하기 위한 것이다 —
   * REST 경로가 만든 행은 DB 기본값 `'manual'` 이라 자동주문이 수동으로 남을 수 있다.
   */
  origin?: OrderOriginKind;
};

/** 좁혀진 update 대상. `column` 은 `id` 또는 `order_no` 뿐이다. */
export type OrderSelector = { column: "id" | "order_no"; value: string };

/** `dma_orders` 컬럼 이름으로 좁혀진 갱신 값. */
export type OrderRowPatch = Record<string, unknown>;

/**
 * 실제 쓰기 경로. 주입 가능한 이유는 테스트가 Supabase 없이 큐 규율(재시도·드롭·flushNow)을
 * 검증할 수 있어야 하기 때문이다 — 큐의 리스크는 SQL 이 아니라 **타이밍**이다.
 */
export type OrderUpdateSink = (sel: OrderSelector, patch: OrderRowPatch) => Promise<void>;

/**
 * insert 1건 (D-03). `server/src/services/dma-orders.ts` 의 `OrderRequestInsert` 를 이식하고
 * **`origin` 을 더했다** — 수동/상따/VI 를 구분하지 못하면 자동주문 감사가 성립하지 않는다.
 *
 * `userId` 는 **연결에서** 온다(`conn.userId`). 인바운드 바디의 사용자 식별자를 믿지 않는다.
 */
export type OrderInsertRow = {
  userId: string;
  accountNo: string;
  /** 12자 ISIN — 게이트웨이 주문 키 (D-28). */
  isin: string;
  /** 6자 단축코드. `SymbolMap` 이 못 풀면 `null` 이다(FK 는 ON DELETE SET NULL 이라 허용). */
  code: string | null;
  exchange: RelayExchange;
  /** `"K"`/`"Q"`. **DB CHECK 가 두 값만 받는다** — 모르면 애초에 insert 하지 않는다. */
  market: OrderMarket;
  side: OrderSide;
  orderType: OrderType;
  orgOrderNo?: string;
  qty: number;
  price: number;
  origin: OrderOriginKind;
  /**
   * 생략하면 DB 기본값 `'requested'` 다. 자동주문 통보로 만드는 행은 이미 접수·체결
   * 이후이므로 `accepted`/`filled` 등으로 시작한다 — CHECK 는 7종을 모두 허용하므로
   * `'requested'` 로 시작하지 않아도 통과한다.
   */
  status?: DmaOrderStatus;
  /** 자동주문 통보로 만드는 행은 주문번호를 이미 안다. */
  orderNo?: string;
};

/**
 * insert 경로. **`await` 로 즉시 쓰고 새 행의 `id` 를 돌려준다** — 이 값이 상관 1순위 키라
 * 큐에 넣으면 호출자가 쓸 수 없다 (A10). 실패는 throw 다(조용한 실패 금지).
 */
export type OrderInsertSink = (row: OrderInsertRow) => Promise<string>;

/** `order_no` → `dma_orders.id`. 없으면 `null`. insert/update 분기의 근거다 (Pitfall 18). */
export type OrderLookupSink = (orderNo: string) => Promise<string | null>;

/** 세 경로를 한 벌로 묶은 것. 부팅 결선은 `supabaseOrderSinks(supabase)` 를 쓴다. */
export type OrderSinks = {
  update: OrderUpdateSink;
  insert: OrderInsertSink;
  findIdByOrderNo: OrderLookupSink;
};

/** 진단용 카운터. 식별자를 담지 않는다. */
export type OrderStoreStats = {
  queued: number;
  /** 성공적으로 반영된 누적 건수. */
  flushed: number;
  /** 재시도로 넘어간 누적 건수. */
  retried: number;
  /** 버린 누적 건수 = 감사 기록의 결손량 (S-5). */
  dropped: number;
  /** 새로 만든 행 누적 건수 (D-03). 수동 + 자동주문 합계다. */
  inserted: number;
};

/**
 * `dma_orders` 서비스롤 쓰기 sink.
 *
 * `WHERE` 를 셀렉터 한 개로 **반드시** 좁힌다. `update()` 뒤에 `.eq()` 가 빠지면 PostgREST
 * 는 테이블 전체를 갱신하므로, 셀렉터 판정은 호출 전(`#selector`)에 이미 끝나 있어야 한다.
 */
export function supabaseOrderSink(supabase: SupabaseClient): OrderUpdateSink {
  return async (sel, patch) => {
    const { error } = await supabase.from("dma_orders").update(patch).eq(sel.column, sel.value);
    if (error) {
      // upsert.ts 규약 — 에러를 로그로 남기고 throw. 삼키면 재시도 판단을 할 수 없다.
      logger.error({ error, column: sel.column }, "[orders] dma_orders update 실패");
      throw error;
    }
  };
}

/**
 * `dma_orders` 서비스롤 **insert** sink (D-03).
 *
 * `server/src/services/dma-orders.ts` 의 `insertOrderRequest` 를 그대로 이식했다. 요청 시점에
 * 남기는 이유도 같다 (T-15-32): 나중에 남기면 그 사이에 프로세스가 죽었을 때 「나갔는지 모르는
 * 주문」이 흔적 없이 사라진다. 그래서 게이트웨이 송신 **전에** 부른다.
 */
export function supabaseOrderInsertSink(supabase: SupabaseClient): OrderInsertSink {
  return async (row) => {
    const { data, error } = await supabase
      .from("dma_orders")
      .insert({
        user_id: row.userId,
        account_no: row.accountNo,
        isin: row.isin,
        stock_code: row.code,
        exchange: row.exchange,
        market: row.market,
        side: row.side,
        order_type: row.orderType,
        org_order_no: row.orgOrderNo ?? null,
        qty: row.qty,
        price: row.price,
        origin: row.origin,
        // 생략 시 DB 기본값(`requested`)이 이긴다 — `undefined` 를 실어 덮지 않는다.
        ...(row.status === undefined ? {} : { status: row.status }),
        ...(row.orderNo === undefined || row.orderNo === "" ? {} : { order_no: row.orderNo }),
      })
      .select("id")
      .single();
    if (error || !data) {
      logger.error({ error, origin: row.origin }, "[orders] dma_orders insert 실패");
      throw error ?? new Error("dma_orders insert 가 행을 돌려주지 않았습니다");
    }
    return (data as { id: string }).id;
  };
}

/**
 * `order_no` 로 기존 행을 찾는다 (Pitfall 18).
 *
 * PostgREST 의 update 는 **0행이어도 에러가 아니다.** 그래서 「행이 있는가」를 먼저 묻지 않으면
 * 자동주문 통보가 조용히 사라진다 — 이 조회가 그 침묵을 없애는 유일한 근거다.
 *
 * `maybeSingle` 이라 같은 주문번호가 2행이면 에러다. 그때는 `null` 로 열화하지 않고 throw 해
 * 호출자가 판단하게 둔다(중복 행은 감사 기록의 결함이고, 조용히 하나를 고르면 그것이 숨는다).
 */
export function supabaseOrderLookupSink(supabase: SupabaseClient): OrderLookupSink {
  return async (orderNo) => {
    const { data, error } = await supabase
      .from("dma_orders")
      .select("id")
      .eq("order_no", orderNo)
      .maybeSingle();
    if (error) {
      logger.error({ error }, "[orders] dma_orders order_no 조회 실패");
      throw error;
    }
    return data === null || data === undefined ? null : (data as { id: string }).id;
  };
}

/** 부팅 결선이 쓰는 세 sink 한 벌. */
export function supabaseOrderSinks(supabase: SupabaseClient): OrderSinks {
  return {
    update: supabaseOrderSink(supabase),
    insert: supabaseOrderInsertSink(supabase),
    findIdByOrderNo: supabaseOrderLookupSink(supabase),
  };
}

/** 큐에 실린 항목 1건. */
type QueueItem = {
  sel: OrderSelector;
  patch: OrderRowPatch;
  attempts: number;
};

/**
 * `dma_orders` 쓰기 창구 — **insert 는 즉시, update 는 큐로** (D-03 / D-32).
 *
 * 사용법: 부팅 결선에서 `new OrderStore(supabaseOrderSinks(supabase))` → `start()` →
 * 주문 요청에서 `await insertRequest(...)` → 수신 콜백에서 `enqueueUpdate(...)` →
 * graceful shutdown 에서 `await flushNow()` → `close()`.
 */
export class OrderStore {
  readonly #sink: OrderUpdateSink;
  readonly #insert: OrderInsertSink | null;
  readonly #findId: OrderLookupSink | null;
  readonly #intervalMs: number;
  #queue: QueueItem[] = [];
  #timer: NodeJS.Timeout | null = null;
  /** 플러시 중복 진입 방지. tick 이 겹치면 같은 항목을 두 번 쓴다. */
  #flushing = false;
  #flushed = 0;
  #retried = 0;
  #dropped = 0;
  #inserted = 0;

  /**
   * update sink 하나만 주면 **갱신 전용**이고 `insertRequest` 는 던진다 — 결선이 반쪽인
   * 채로 조용히 도는 것보다 부팅 직후 큰 소리로 실패하는 편이 낫다.
   */
  constructor(sinks: OrderUpdateSink | OrderSinks, intervalMs: number = ORDER_FLUSH_INTERVAL_MS) {
    if (typeof sinks === "function") {
      this.#sink = sinks;
      this.#insert = null;
      this.#findId = null;
    } else {
      this.#sink = sinks.update;
      this.#insert = sinks.insert;
      this.#findId = sinks.findIdByOrderNo;
    }
    this.#intervalMs = intervalMs;
  }

  /**
   * 행을 만들고 `id` 를 돌려준다 (D-03). **큐잉하지 않고 `await` 한다.**
   *
   * 이유는 하나다: 반환 `id` 가 상관 1순위 키(`orderRowId`)라 호출자가 게이트웨이로 보내기
   * **전에** 손에 쥐고 있어야 한다 (A10). 큐에 넣으면 200ms 뒤에나 존재하는 행의 id 를
   * 기다려야 하고, 그동안 도착한 통보는 귀속될 곳이 없다.
   *
   * 수신 콜백(D-32)에서 부르는 것은 자동주문 insert 분기 하나뿐이며, 그 경로는 애초에
   * 「행이 없다」가 확정된 뒤라 왕복 1회로 끝난다.
   *
   * 실패는 **throw** 다. 삼키면 「주문은 나갔는데 기록이 없는」 상태가 조용히 만들어진다.
   */
  async insertRequest(row: OrderInsertRow): Promise<string> {
    if (this.#insert === null) {
      throw new Error("[orders] insert sink 미결선 — OrderStore 를 OrderSinks 로 만들어야 한다");
    }
    const id = await this.#insert(row);
    this.#inserted += 1;
    return id;
  }

  /**
   * `order_no` 로 기존 행의 id 를 찾는다. 없으면 `null` — 호출자는 그때 `insertRequest` 한다.
   *
   * lookup sink 가 없으면 `null` 이 아니라 **throw** 다: `null` 로 열화하면 「행이 없다」와
   * 「조회할 수단이 없다」가 같은 값이 되어 중복 insert 를 유발한다.
   */
  async findIdByOrderNo(orderNo: string): Promise<string | null> {
    if (this.#findId === null) {
      throw new Error("[orders] lookup sink 미결선 — OrderStore 를 OrderSinks 로 만들어야 한다");
    }
    if (orderNo === "") return null;
    return this.#findId(orderNo);
  }

  /** tick 시작. 멱등이다 — 두 번 불러도 타이머는 1개다. */
  start(): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      void this.flushNow();
    }, this.#intervalMs);
    // 이 타이머가 프로세스 종료를 붙들지 않게 한다. 종료 절차는 `flushNow()` 를 명시 호출한다.
    this.#timer.unref?.();
  }

  /**
   * 갱신을 큐에 넣는다. **동기 O(1)** — DMA 수신 콜백이 부르는 유일한 함수다 (D-32).
   *
   * 여기에 `await` 이 한 줄이라도 들어오면 이 모듈의 존재 이유가 사라진다.
   */
  enqueueUpdate(update: OrderUpdate): void {
    const sel = selectorOf(update);
    if (sel === null) {
      // 셀렉터가 없으면 테이블 전체 update 가 된다. 버리는 편이 압도적으로 안전하다.
      this.#dropped += 1;
      logger.error(
        { status: update.status, dropped: this.#dropped },
        "[orders] 셀렉터(orderRowId·orderNo) 없는 갱신 — 드롭 (전체 update 방지)",
      );
      return;
    }

    const patch = rowPatchOf(update);
    if (Object.keys(patch).length === 1) {
      // `updated_at` 하나만 남았다 = 실제로 바꿀 값이 없다.
      logger.warn({ column: sel.column }, "[orders] 갱신할 필드가 없는 요청 — 무시");
      return;
    }

    if (this.#queue.length >= ORDER_QUEUE_LIMIT) {
      this.#queue.shift();
      this.#dropped += 1;
      logger.error(
        { limit: ORDER_QUEUE_LIMIT, dropped: this.#dropped },
        "[orders] 큐 상한 초과 — 가장 오래된 항목 드롭",
      );
    }
    this.#queue.push({ sel, patch, attempts: 0 });
  }

  /**
   * 대기 중인 항목을 지금 전부 밀어낸다. graceful shutdown 이 `await` 로 부른다 —
   * 마지막 체결 통보가 기록되지 않은 채 컨테이너가 내려가면 감사 기록에 구멍이 남는다.
   */
  async flushNow(): Promise<void> {
    if (this.#flushing) return;
    if (this.#queue.length === 0) return;

    this.#flushing = true;
    const batch = this.#queue;
    this.#queue = [];
    try {
      for (const item of batch) {
        try {
          await this.#sink(item.sel, item.patch);
          this.#flushed += 1;
        } catch (err) {
          if (item.attempts < ORDER_MAX_RETRIES) {
            item.attempts += 1;
            this.#retried += 1;
            // 재큐잉은 **다음 tick** 으로 미룬다. 같은 루프에서 다시 때리면 장애 중인
            // Supabase 를 초당 수십 번 두드리게 된다.
            this.#queue.push(item);
            logger.warn(
              { err, column: item.sel.column, attempts: item.attempts },
              "[orders] dma_orders 갱신 실패 — 1회 재큐잉",
            );
            continue;
          }
          this.#dropped += 1;
          logger.error(
            { err, column: item.sel.column, dropped: this.#dropped },
            "[orders] dma_orders 갱신 재시도 소진 — 드롭 (감사 기록 결손)",
          );
        }
      }
    } finally {
      this.#flushing = false;
    }
  }

  /** tick 정지. 남은 큐는 비우지 않는다 — 종료 절차가 `flushNow()` 를 먼저 부른다. */
  close(): void {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  stats(): OrderStoreStats {
    return {
      queued: this.#queue.length,
      flushed: this.#flushed,
      retried: this.#retried,
      dropped: this.#dropped,
      inserted: this.#inserted,
    };
  }
}

// ============================================================
// 순수 변환 (테스트 가능 단위)
// ============================================================

/** 셀렉터 판정. `id` 가 있으면 그것이 우선이다 (A10 — `order_no` 단독은 모호할 수 있다). */
export function selectorOf(update: OrderUpdate): OrderSelector | null {
  if (update.orderRowId !== undefined && update.orderRowId !== "") {
    return { column: "id", value: update.orderRowId };
  }
  if (update.orderNo !== undefined && update.orderNo !== "") {
    return { column: "order_no", value: update.orderNo };
  }
  return null;
}

/**
 * 계약 필드 → `dma_orders` 컬럼. **여기가 camelCase ↔ snake_case 경계의 유일한 지점**이다.
 *
 * `filled_qty` 는 `>= 0` CHECK 가 걸려 있어 음수를 그대로 보내면 DB 가 거부하고 그 행의
 * 갱신이 통째로 사라진다. 파손 값 때문에 정상 필드까지 잃는 것은 손해라 0 으로 바닥을 친다.
 */
export function rowPatchOf(update: OrderUpdate): OrderRowPatch {
  const patch: OrderRowPatch = { updated_at: new Date().toISOString() };
  if (update.orderNo !== undefined && update.orderNo !== "") patch.order_no = update.orderNo;
  if (update.status !== undefined) patch.status = update.status;
  if (update.resultCode !== undefined) patch.result_code = update.resultCode;
  if (update.noticeType !== undefined && update.noticeType !== "") {
    patch.notice_type = update.noticeType;
  }
  if (update.message !== undefined && update.message !== "") patch.message = update.message;
  if (update.filledQty !== undefined) {
    patch.filled_qty = Number.isInteger(update.filledQty) ? Math.max(0, update.filledQty) : 0;
  }
  // `origin` 은 CHECK 3종이라 계약 타입이 이미 좁혀 놓았다 — 여기서 다시 검사하지 않는다.
  if (update.origin !== undefined) patch.origin = update.origin;
  return patch;
}
