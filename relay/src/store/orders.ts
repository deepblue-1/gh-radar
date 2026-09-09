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
 *   - **`order_no` 한 축만으로 좁히지 않는다** (Phase 16 Plan 18 — gap 1 / T-16-14).
 *     브로커 주문번호는 일별 재사용 시퀀스라 그 한 축은 「이 행」이 아니라 「이 번호를 쓴
 *     모든 사용자의 모든 날짜」를 가리킨다. `order_no` 셀렉터는 사용자(`user_id`)·당일
 *     (`created_at` 반열린 구간)까지 **세 축**으로 좁힌다. `userId` 가 없으면 드롭이다.
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
 * `flushNow()` 한 번이 도는 배치 **횟수 상한** (16-24 / WR-09 · T-16-40).
 *
 * 종료 절차는 재큐잉분까지 비워야 「비웠다」가 참이 된다. `ORDER_MAX_RETRIES` 가 1 이라
 * 이론상 2회면 끝나지만(첫 배치 + 재시도분), 상한이 없으면 「큐가 비지 않는」 상태가
 * 종료를 **영원히** 막는다. 여기서 멈추고 남은 큐 길이를 error 로 남긴다 — 조용히
 * 포기하지도, 무한히 매달리지도 않는다 (S-5).
 */
export const ORDER_FLUSH_MAX_ROUNDS = ORDER_MAX_RETRIES + 2;

/**
 * 큐 길이 상한. 넘으면 **가장 오래된 것부터** 버린다.
 *
 * 상한이 없으면 Supabase 장애가 곧 e2-micro(1GB) OOM 이다. 오래된 것을 버리는 이유는
 * 최신 상태가 행의 최종 상태에 더 가깝기 때문이다(같은 주문의 갱신은 뒤가 이긴다).
 */
export const ORDER_QUEUE_LIMIT = 10_000;

/**
 * 「오늘」(KST) 의 UTC ISO 반열린 구간 `[from, to)` (Phase 16 Plan 18 — gap 1).
 *
 * 브로커 주문번호(`order_no`)는 **일별 재사용 시퀀스**다. 그래서 `order_no` 만으로 행을
 * 찾으면 운영 2일차부터 **어제 행이 매치**되어 오늘 자동주문의 insert 가 일어나지 않는다
 * (= 16-08 이 막겠다고 선언한 바로 그 감사 기록 결손, Pitfall 18). 조회·갱신 양쪽에
 * 당일 범위를 걸어 그 오매치를 구조적으로 없앤다.
 *
 * 규칙은 `server/src/services/dma-orders.ts` 의 `kstDayRangeUtc` 와 **같은 반열린 구간**이다.
 * server 를 import 하지 않는다 — relay 는 server 를 의존하지 않는다(배포 단위가 다르다).
 */
export function kstDayRangeUtc(now: Date = new Date()): { from: string; to: string } {
  // UTC 에 9시간을 더한 뒤 날짜만 떼면 그것이 KST 달력 날짜다.
  const day = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+09:00`);
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + 24 * 3600_000).toISOString(),
  };
}

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
  /**
   * 소유자 (Phase 16 Plan 18 — gap 1 / T-16-14). **`order_no` 셀렉터에서만 쓰인다.**
   *
   * 없으면 그 갱신은 **드롭**이다 — `order_no` 단독 update 는 일별 재사용 시퀀스를
   * 셀렉터로 쓰는 것이라 **전역 쓰기**(다른 사용자·다른 날짜 행까지)가 된다.
   */
  userId?: string;
};

/**
 * 좁혀진 update 대상.
 *
 * `id` 는 그 자체로 유일하지만 `order_no` 는 아니다 — 그래서 판별 유니온이고, `order_no`
 * 셀렉터는 `userId` 를 **타입 수준에서** 요구한다 (gap 1 / T-16-14).
 */
export type OrderSelector =
  | { column: "id"; value: string }
  | { column: "order_no"; value: string; userId: string };

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

/**
 * `(userId, order_no)` → `dma_orders.id`. 없으면 `null`. insert/update 분기의 근거다 (Pitfall 18).
 *
 * `userId` 가 인자인 이유는 gap 1 이다 — `order_no` 는 일별 재사용 시퀀스라 **사용자·날짜를
 * 같이 걸지 않으면 남의 행·어제 행이 매치된다.**
 */
export type OrderLookupSink = (userId: string, orderNo: string) => Promise<string | null>;

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
 * `WHERE` 는 셀렉터로 **반드시** 좁힌다. `update()` 뒤에 `.eq()` 가 빠지면 PostgREST 는
 * 테이블 전체를 갱신하므로, 셀렉터 판정은 호출 전(`selectorOf`)에 이미 끝나 있어야 한다.
 *
 * `id` 셀렉터는 한 축으로 충분하다(PK). **`order_no` 셀렉터는 사용자·당일까지 세 축으로
 * 좁힌다 — 한 축만으로는 전역 쓰기다** (gap 1 / T-16-14). 브로커 주문번호는 일별 재사용
 * 시퀀스라 `order_no` 단독 `.eq()` 는 다른 사용자·어제 행까지 덮는다.
 */
export function supabaseOrderSink(supabase: SupabaseClient): OrderUpdateSink {
  return async (sel, patch) => {
    const table = supabase.from("dma_orders");
    const { error } =
      sel.column === "id"
        ? await table.update(patch).eq("id", sel.value)
        : await (() => {
            const { from, to } = kstDayRangeUtc();
            return table
              .update(patch)
              .eq("order_no", sel.value)
              .eq("user_id", sel.userId)
              .gte("created_at", from)
              .lt("created_at", to);
          })();
    if (error) {
      // ★ `order_no` 를 채우는 갱신의 `23505`(부분 UNIQUE 위반) 만 예외다
      //   (16-28 / GC-WR-08 · T-16-53).
      //
      //   update 가 `23505` 로 실패했다는 것은 「쓸 수 없다」가 아니라 **「그 주문번호를 가진
      //   행이 이미 따로 있다」**는 뜻이다. 수동 주문의 `finish` 가 자기 행에 접수 주문번호를
      //   채우는 사이, 자동 통보 분기가 같은 `order_no` 로 행을 먼저 만든 경우가 그것이다.
      //   원인이 데이터 분기이므로 **재시도해도 영원히 같은 결과**다. 그래서:
      //     · throw 하지 않는다 — `#drain` 이 재시도 1회를 태우고 `#dropped` 를 올리면
      //       「이유를 아는 실패」가 「이유를 모르는 실패」와 뒤섞여 카운터가 오염된다 (S-5).
      //     · 대신 error 로그로 사유를 남긴다. 조용히 성공한 척하지는 않는다.
      //
      //   조건을 **셀렉터가 아니라 patch** 에 건다. 그 갱신을 실제로 내는 자리(`finish`)는
      //   상관 1순위 키를 쥐고 있어 셀렉터가 `id` 이고 `order_no` 는 **채울 컬럼**으로 실린다
      //   (`selectorOf` — `orderRowId` 우선). 셀렉터 컬럼으로 좁히면 정작 이 갭이 지목한
      //   경로를 비켜 간다. 이 인덱스의 유일한 컬럼이 `order_no` 이므로, 그것을 싣지 않는
      //   갱신은 애초에 이 위반을 낼 수 없다 — 조건을 넓히지 않으면서 그 경로만 덮는다.
      if (patch.order_no !== undefined && (error as { code?: string }).code === "23505") {
        // 로그에 `error` 원문을 싣지 않는다 — Postgres 의 UNIQUE 위반 detail 은
        // `Key (user_id, order_no, …)=(…)` 로 **주문번호 원문을 그대로 담는다** (T-16-45).
        logger.error(
          { column: sel.column, code: "23505" },
          "[orders] order_no 갱신이 UNIQUE 위반 — 같은 주문번호 행이 이미 있다(감사 기록 분기). 재시도로 풀리지 않으므로 드롭 카운터를 올리지 않는다",
        );
        return;
      }
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
      // ★ `23505` = `idx_dma_orders_user_order_no_kst_day` 위반 (16-28 / GC-WR-08 · T-16-52).
      //
      //   16-18 이 넣은 부분 UNIQUE 인덱스는 「같은 주문이 두 벌 남는」 경주를 막았다. 그런데
      //   그 위반을 아무도 해석하지 않으면 경주가 「두 벌」에서 **「소실」**로 바뀔 뿐이다 —
      //   호출자(`ensureRow`)는 모든 insert 예외를 `{kind:"unavailable"}` 로 접고 그 통보를
      //   드롭한다. 「행이 이미 있다」가 「기록 불가」로 열화되는 것이 그 경로다.
      //
      //   그래서 `23505` 만 「이미 있다」로 읽고 **같은 3축으로 재조회해 그 행으로 수렴**한다.
      //   다른 코드는 아래에서 지금까지와 완전히 동일하게 로그 + throw 다 — 예외 삼키기를
      //   넓히지 않는다.
      //
      //   `orderNo` 가 비어 있으면 부분 인덱스(`WHERE order_no IS NOT NULL`)의 대상이 아니라
      //   애초에 이 위반이 날 수 없다. 그때는 재조회하지 않고 그대로 throw 한다.
      if (
        (error as { code?: string } | null)?.code === "23505" &&
        row.orderNo !== undefined &&
        row.orderNo !== ""
      ) {
        const existing = await supabaseOrderLookupSink(supabase)(row.userId, row.orderNo);
        if (existing !== null) {
          // 조용히 수렴하면 이 경로가 얼마나 도는지 영원히 모른다 (S-5). 계좌번호·주문번호
          // 원문은 싣지 않는다 — `origin` 과 SQLSTATE 만으로 충분히 추적된다 (T-16-45).
          logger.warn(
            { origin: row.origin, code: "23505" },
            "[orders] 같은 사용자·같은 날의 같은 주문번호 insert 경주 — 기존 행으로 수렴",
          );
          return existing;
        }
        // 재조회도 못 찾으면 지어내지 않는다 — 아래 기존 경로로 떨어진다.
      }
      logger.error({ error, origin: row.origin }, "[orders] dma_orders insert 실패");
      throw error ?? new Error("dma_orders insert 가 행을 돌려주지 않았습니다");
    }
    return (data as { id: string }).id;
  };
}

/**
 * `(user_id, order_no, 오늘)` 로 기존 행을 찾는다 (Pitfall 18 / gap 1).
 *
 * PostgREST 의 update 는 **0행이어도 에러가 아니다.** 그래서 「행이 있는가」를 먼저 묻지 않으면
 * 자동주문 통보가 조용히 사라진다 — 이 조회가 그 침묵을 없애는 유일한 근거다.
 *
 * 세 축으로 좁히는 이유(gap 1): 브로커 주문번호는 **일별 재사용 시퀀스**이고 `dma_orders.order_no`
 * 에는 UNIQUE 가 없다. `order_no` 단독 조회는 ① 다른 사용자의 행 ② 어제의 내 행을 매치시키는데,
 * ②는 오늘 자동주문의 insert 를 막아 감사 기록을 비우고 ①은 테넌트 경계를 넘는다.
 *
 * **단건 단언(single-row assertion)을 쓰지 않는다.** 같은 사용자·같은 날의 중복은 이제 DB 부분 UNIQUE 인덱스가
 * 막는다. 그럼에도 2행이 있으면 던져서 호출자의 catch 를 「셀렉터 없는 갱신」으로 열화시키는
 * 것보다 **가장 최근 1행**을 고르는 편이 안전하다 — 그 열화가 곧 전역 쓰기였다.
 */
export function supabaseOrderLookupSink(supabase: SupabaseClient): OrderLookupSink {
  return async (userId, orderNo) => {
    const { from, to } = kstDayRangeUtc();
    const { data, error } = await supabase
      .from("dma_orders")
      .select("id")
      .eq("user_id", userId)
      .eq("order_no", orderNo)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      logger.error({ error }, "[orders] dma_orders order_no 조회 실패");
      throw error;
    }
    const rows = (data ?? []) as { id: string }[];
    return rows[0]?.id ?? null;
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
  /**
   * 진행 중 배치의 **대기 가능한 핸들**. `null` 이면 도는 배치가 없다.
   *
   * 옛 `#flushing: boolean` 을 대신한다 (16-24 / WR-09). 중복 진입 방지라는 목적은 그대로다
   * — tick 이 겹치면 같은 항목을 두 번 쓴다. 달라진 것은 **기다릴 수 있다**는 점 하나이고,
   * 그 하나가 종료 절차의 `flushNow()` 를 「즉시 반환」에서 「기다렸다 비운다」로 바꾼다.
   * 두 경로의 규율이 다르다: **tick 은 건너뛰고, 종료는 기다린다**(`#tick` / `flushNow`).
   */
  #current: Promise<void> | null = null;
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
   * `(userId, order_no)` 로 기존 행의 id 를 찾는다. 없으면 `null` — 호출자는 그때
   * `insertRequest` 한다. 조회 범위는 **그 사용자의 오늘**이다 (gap 1).
   *
   * lookup sink 가 없으면 `null` 이 아니라 **throw** 다: `null` 로 열화하면 「행이 없다」와
   * 「조회할 수단이 없다」가 같은 값이 되어 중복 insert 를 유발한다.
   */
  async findIdByOrderNo(userId: string, orderNo: string): Promise<string | null> {
    if (this.#findId === null) {
      throw new Error("[orders] lookup sink 미결선 — OrderStore 를 OrderSinks 로 만들어야 한다");
    }
    if (orderNo === "") return null;
    // 소유자 없는 조회는 전 사용자 스캔이다 — 「행이 없다」로 열화하지 않고 막는다.
    if (userId === "") return null;
    return this.#findId(userId, orderNo);
  }

  /** tick 시작. 멱등이다 — 두 번 불러도 타이머는 1개다. */
  start(): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      this.#tick();
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
        { status: update.status, hasOrderNo: update.orderNo !== undefined, dropped: this.#dropped },
        "[orders] 셀렉터(orderRowId·orderNo) 없는 갱신 — 드롭 (전체 update 방지). userId 없는 order_no 갱신 포함",
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
   * 인터벌 tick — 진행 중이면 **건너뛴다. 기다리지 않는다.**
   *
   * ★ 종료 경로(`flushNow`)와 규율이 다른 유일한 자리다. tick 이 기다리면 200ms 마다
   *   대기자가 쌓여 장애 중인 Supabase 를 겹쳐 두드리게 되고, 같은 항목을 두 번 쓰는
   *   중복 진입도 그대로 열린다. 지금 못 비운 큐는 **다음 tick** 이 가져간다.
   */
  #tick(): void {
    if (this.#current !== null) return;
    if (this.#queue.length === 0) return;
    this.#current = this.#runDrain();
    // `#drain` 은 항목 단위로 catch 하므로 여기까지 오지 않는 것이 정상이다 — 그래도
    // 조용한 unhandled rejection 은 만들지 않는다 (S-5).
    this.#current.catch((err: unknown) => {
      logger.error({ err }, "[orders] 배치 플러시가 예외로 끝났다");
    });
  }

  /** 배치 1회 + `#current` 해제. 성공·실패와 무관하게 핸들을 반드시 비운다. */
  async #runDrain(): Promise<void> {
    try {
      await this.#drain();
    } finally {
      this.#current = null;
    }
  }

  /**
   * 대기 중인 항목을 지금 전부 밀어낸다. graceful shutdown 이 `await` 로 부른다 —
   * 마지막 체결 통보가 기록되지 않은 채 컨테이너가 내려가면 감사 기록에 구멍이 남는다.
   *
   * ★ 계약 (16-24 / WR-09): 진행 중 플러시를 **기다렸다가** 비운다. 옛 구현은 진행 중이면
   *   (`#flushing` 플래그를 보고) **아무것도 기다리지 않고 즉시 반환**했다. 200ms 인터벌
   *   tick 이 도는 중에 SIGTERM 이 오면 곧바로 `close()` 가 인터벌을 끊었고, 진행 중 배치
   *   이후에 큐에 들어간 갱신(마지막 체결 통보 등)이 그대로 사라졌다.
   *
   * **재큐잉분(재시도 1회)까지 비운 뒤에 반환한다** — 그래야 「비웠다」가 참이다. 다만
   * 무한히 매달리지 않는다: `ORDER_FLUSH_MAX_ROUNDS` 회에서 남은 큐 길이를 error 로 남기고
   * 반환한다(T-16-40 — 종료를 영원히 막지 않는다).
   */
  async flushNow(): Promise<void> {
    // 진행 중 배치를 기다린다. 기다리는 사이 tick 이 새 배치를 시작할 수 있으므로 루프다.
    while (this.#current !== null) await this.#current;

    for (let round = 0; round < ORDER_FLUSH_MAX_ROUNDS; round += 1) {
      if (this.#queue.length === 0) return;
      this.#current = this.#runDrain();
      await this.#current;
    }

    if (this.#queue.length > 0) {
      // 조용히 포기하지 않는다 — 남은 길이가 곧 감사 기록의 결손량이다 (S-5).
      logger.error(
        { queued: this.#queue.length, rounds: ORDER_FLUSH_MAX_ROUNDS, dropped: this.#dropped },
        "[orders] flushNow 반복 상한 도달 — 남은 큐를 비우지 못한 채 반환 (감사 기록 결손)",
      );
    }
  }

  /**
   * 배치 1회 — 큐를 스왑해 순회하고 실패는 1회 재큐잉 후 드롭한다.
   *
   * `flushNow` 에서 뽑아낸 몸통이다(16-24). 카운터 규율(`#flushed`/`#retried`/`#dropped`)은
   * 그대로다 — 여기서 세는 값이 곧 감사 기록의 성패다.
   */
  async #drain(): Promise<void> {
    const batch = this.#queue;
    this.#queue = [];
    for (const item of batch) {
      try {
        await this.#sink(item.sel, item.patch);
        this.#flushed += 1;
      } catch (err) {
        if (item.attempts < ORDER_MAX_RETRIES) {
          item.attempts += 1;
          this.#retried += 1;
          // 재큐잉은 **이 배치 밖**으로 미룬다. 같은 순회에서 다시 때리면 장애 중인
          // Supabase 를 초당 수십 번 두드리게 된다. 평시에는 다음 tick 이 가져가고,
          // 종료 절차에서만 `flushNow` 가 다음 라운드로 곧바로 이어 받는다(WR-09).
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

/**
 * 셀렉터 판정. `id` 가 있으면 그것이 우선이다 (A10 — `order_no` 단독은 모호할 수 있다).
 *
 * `order_no` 밖에 없는데 **`userId` 도 없으면 `null`(= 드롭)** 이다 (gap 1 / T-16-14).
 * 「모호할 수 있다」가 아니라 **틀렸다** — 일별 재사용 시퀀스를 유일 셀렉터로 쓰는 것은
 * 다른 사용자·다른 날짜 행에 대한 쓰기다. 드롭이 압도적으로 안전하고, 그 드롭은 error 로그다.
 */
export function selectorOf(update: OrderUpdate): OrderSelector | null {
  if (update.orderRowId !== undefined && update.orderRowId !== "") {
    return { column: "id", value: update.orderRowId };
  }
  if (update.orderNo !== undefined && update.orderNo !== "") {
    if (update.userId === undefined || update.userId === "") return null;
    return { column: "order_no", value: update.orderNo, userId: update.userId };
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
