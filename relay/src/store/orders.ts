/**
 * Phase 15 Plan 16 — RELAY-02. `dma_orders` **비동기 갱신 큐** (D-24 / D-32).
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
 *   D-24  주문 기록은 Supabase `dma_orders` + relay stdout 두 벌이다. server 가 요청을
 *         insert 하고 **relay 가 체결·취소확인 통보로 같은 행을 update** 한다.
 *   D-32  수신 경로 동기 블로킹 금지. 위 문단 전체가 이 한 줄의 근거다.
 *   A10   상관키를 `order_no` 단독으로 두지 않는다. 같은 사용자가 같은 종목·계좌·가격으로
 *         1초 안에 2건을 내면 **접수 전 거부**의 귀속이 모호해진다. server 가 insert 한
 *         행의 `id`(`orderRowId`)를 릴레이 요청에 실어 보내면 relay 가 그대로 되돌려 주므로,
 *         셀렉터 우선순위는 `id` → `order_no` 다.
 *   S-5   실패는 **반드시 로그와 카운터를 남긴다.** 조용한 드롭 금지. 다만 무한 재시도도
 *         하지 않는다 — 재시도 1회 후 드롭이고, 드롭 수가 곧 감사 기록의 결손량이다.
 *
 * 하지 않는 것:
 *   - `insert` 를 하지 않는다. 행을 만드는 것은 server 다 (`user_id` FK·소유권이 그쪽에 있다).
 *     relay 가 만들면 `user_id` 를 relay 가 정하게 되어 소유권 판정이 두 곳으로 흩어진다.
 *   - 셀렉터 없는 update 를 만들지 않는다. `WHERE` 가 빠진 update 는 **테이블 전체**를
 *     덮어쓴다 — 그래서 셀렉터 부재는 드롭이고, 그 드롭은 error 로그다.
 *   - 재시도를 지수 백오프로 늘리지 않는다. 큐가 밀리면 메모리가 늘 뿐이고, 감사 기록
 *     한 줄보다 프로세스 생존이 중요하다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DmaOrderStatus } from "@gh-radar/shared";

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

/** 진단용 카운터. 식별자를 담지 않는다. */
export type OrderStoreStats = {
  queued: number;
  /** 성공적으로 반영된 누적 건수. */
  flushed: number;
  /** 재시도로 넘어간 누적 건수. */
  retried: number;
  /** 버린 누적 건수 = 감사 기록의 결손량 (S-5). */
  dropped: number;
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

/** 큐에 실린 항목 1건. */
type QueueItem = {
  sel: OrderSelector;
  patch: OrderRowPatch;
  attempts: number;
};

/**
 * `dma_orders` 갱신 큐.
 *
 * 사용법: 부팅 결선에서 `new OrderStore(sink)` → `start()` → 수신 콜백에서
 * `enqueueUpdate(...)` → graceful shutdown 에서 `await flushNow()` → `close()`.
 */
export class OrderStore {
  readonly #sink: OrderUpdateSink;
  readonly #intervalMs: number;
  #queue: QueueItem[] = [];
  #timer: NodeJS.Timeout | null = null;
  /** 플러시 중복 진입 방지. tick 이 겹치면 같은 항목을 두 번 쓴다. */
  #flushing = false;
  #flushed = 0;
  #retried = 0;
  #dropped = 0;

  constructor(sink: OrderUpdateSink, intervalMs: number = ORDER_FLUSH_INTERVAL_MS) {
    this.#sink = sink;
    this.#intervalMs = intervalMs;
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
  return patch;
}
