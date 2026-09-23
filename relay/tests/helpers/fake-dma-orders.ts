/**
 * `dma_orders` 가짜 PostgREST — **공용** (Phase 18 Plan 33 / R3-WR-01).
 *
 * 원래 `order-store.test.ts` 안에 있던 것을 그대로 옮겼다. `ws-order.test.ts` 가 진짜
 * `OrderStore(supabaseOrderSinks(…))` 로 하네스를 띄워 「늦은 통보가 행을 되돌리는가」를
 * 행 단위로 보려면 같은 가짜가 필요하다 — 두 벌이면 한쪽만 필터를 실적용하게 된다.
 * 정의는 이 파일 한 곳뿐이다.
 *
 * 이관하면서 더한 것은 셋뿐이다 (기존 동작은 그대로):
 *   ① `in` 필터 — 조건부 `status` UPDATE(R3-WR-01)를 실제로 거른다.
 *   ② update 빌더의 `select(cols)` — 실제로 병합된 행의 `{ id }` 배열을 돌려준다.
 *   ③ insert 가 만드는 행에 `status` 기본값 `'requested'` (DB `NOT NULL DEFAULT` 의 거울).
 *
 * quick-260923-e1m (S1 — 체결 조각 누적) 이 더한 것 (기존 동작은 그대로):
 *   ④ `select(cols)` 컬럼 투영 — 받은 컬럼 문자열을 `FakeQuery.columns` 에 남기고 결과를 그
 *      컬럼만으로 돌려준다. `select("id")` 는 지금처럼 `{ id }` 만 돌려준다.
 *   ⑤ DB 기본값 거울 한 곳(`DB_DEFAULTS` — `status` 'requested' · `filled_qty` 0). 투영·`eq`·`in`
 *      이 행에 그 컬럼이 없을 때 이 값을 읽는다. 고정 픽스처 행이 컬럼을 생략했을 뿐 실제 DB
 *      에는 두 컬럼이 없는 행이 존재할 수 없다(`NOT NULL DEFAULT`).
 *   ⑥ insert 가 만드는 행에 `qty`(값이 숫자면)와 `filled_qty: 0`.
 *   ⑦ `opts.onSelect` 훅 — select 결과를 **스냅숏한 직후**, 돌려주기 전에 부른다. 읽은 값과
 *      UPDATE 시점 값이 달라지는 compare-and-swap 경합을 결정론적으로 재현한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { kstDayRangeUtc, type OrderRowPatch } from "../../src/store/orders.js";
/** 가짜가 기록하는 필터 1건. `order`/`limit` 도 같은 배열에 남겨 순서를 볼 수 있게 한다. */
export type FakeFilter = {
  op: "eq" | "gte" | "lt" | "in" | "order" | "limit";
  column: string;
  value: unknown;
};

/** 가짜가 본 쿼리 1건. `matched` 는 필터를 **실제로 적용한** 결과다. */
export type FakeQuery = {
  verb: "select" | "update" | "insert";
  filters: FakeFilter[];
  patch?: OrderRowPatch;
  /** insert 가 실어 보낸 컬럼 값. 부분 UNIQUE 흉내가 여기서 `user_id`/`order_no` 를 읽는다. */
  values?: Record<string, unknown>;
  matched: FakeRow[];
  /** update 빌더에서 `select(cols)` 를 불렀는가 (18-33) — 불렀을 때만 결과 `data` 가 행 배열이다. */
  selected?: boolean;
  /** `select(cols)` 로 받은 컬럼 문자열 원문 (e1m). 결과는 이 컬럼만으로 투영된다. */
  columns?: string;
};

/**
 * DB 기본값 거울 — **이 파일의 유일한 자리**다 (e1m). `dma_orders` 의 `status text NOT NULL
 * DEFAULT 'requested'` · `filled_qty integer NOT NULL DEFAULT 0`
 * (`20260905120200_dma_orders.sql:62·66`). 픽스처 행이 컬럼을 생략하면 이 값으로 읽는다.
 */
const DB_DEFAULTS: Readonly<Record<string, unknown>> = { status: "requested", filled_qty: 0 };

/** 행의 컬럼 값 — 없으면 DB 기본값 거울. */
function valueOf(row: FakeRow, column: string): unknown {
  const v = (row as unknown as Record<string, unknown>)[column];
  return v === undefined ? DB_DEFAULTS[column] : v;
}

/** `select(cols)` 투영. `"*"`·빈 문자열은 행 전체(기본값 거울 포함)다. */
function project(row: FakeRow, columns: string | undefined): Record<string, unknown> {
  const cols = (columns ?? "id")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (cols.length === 0 || cols.includes("*")) return { ...DB_DEFAULTS, ...row };
  const out: Record<string, unknown> = {};
  for (const c of cols) out[c] = valueOf(row, c);
  return out;
}

/**
 * 가짜 테이블의 행 1건.
 *
 * 고정 4컬럼 외에 **성공한 update 가 병합한 나머지 컬럼**(`status`·`filled_qty` 등)이 그대로
 * 남는다 — 「갱신이 실제로 행에 반영됐는가」를 이 객체로 볼 수 있어야 한다 (16-39 / R2-IN-04).
 */
export type FakeRow = {
  id: string;
  user_id: string;
  order_no: string;
  created_at: string;
  [column: string]: unknown;
};

/**
 * 주입할 PostgREST 오류 1건.
 *
 * **`details` 를 실을 수 있는 것이 핵심이다** (16-38 / R2-CR-03). 실제 PostgreSQL 은 CHECK·
 * NOT NULL·FK 위반의 `DETAIL` 에 `Failing row contains (<모든 컬럼 값>)` 을 넣고 PostgREST 가
 * 그것을 `error.details` 로 넘긴다 — 그 필드가 없는 스텁으로는 이 갭을 **재현조차 할 수 없다**.
 */
export type FakePgError = { code?: string; message: string; details?: string; hint?: string };

/**
 * `dma_orders` 3행을 든 가짜 `SupabaseClient`.
 *
 * 스텁이 아니라 **필터를 실제로 적용한다** — 「`.eq("user_id", …)` 를 불렀다」만 보면 그
 * 필터가 아무 행도 거르지 않아도 초록이 된다. 그래서 `matched` 로 「영향 받은 행」을 계산해
 * 남의 행·어제 행이 그 안에 없음을 단언한다.
 */
export function fakeDmaOrders(
  rows: FakeRow[],
  opts: {
    insertError?: FakePgError;
    /**
     * update 오류 주입. **함수형은 몇 번째 update 인가로 갈라 준다** — `23505` 재시도(짝수
     * 번째)만 실패시키는 케이스가 필요하기 때문이다 (16-39). `undefined` 를 돌려주면 주입하지
     * 않고 아래 `dupToday` 의 **실계산**으로 떨어진다.
     */
    updateError?: FakePgError | ((nth: number, patch?: OrderRowPatch) => FakePgError | undefined);
    selectError?: FakePgError;
    /**
     * select 결과를 스냅숏한 **직후**, 돌려주기 전에 불린다 (e1m — CAS 경합 재현). `nth` 는
     * 1부터 세는 select 호출 순번이다. 여기서 행을 바꾸면 호출자는 **바뀌기 전** 값을 읽고,
     * 뒤이은 조건부 UPDATE 는 바뀐 값을 본다.
     */
    onSelect?: (q: FakeQuery, nth: number) => void;
  } = {},
): { supabase: SupabaseClient; queries: FakeQuery[]; rows: FakeRow[] } {
  const queries: FakeQuery[] = [];
  /** update 호출 순번 — 주입 함수가 「최초 시도」와 「재시도」를 가르는 근거다. */
  let updateCalls = 0;
  /** select 호출 순번 — `onSelect` 훅의 `nth` (e1m). */
  let selectCalls = 0;

  /**
   * `idx_dma_orders_user_order_no_kst_day` 흉내 — `(user_id, order_no, KST일)` 3축.
   *
   * 스텁이 아니라 **실제로 충돌 여부를 계산한다**. 「23505 를 던지도록 설정했다」로 만들면
   * 픽스처에 중복이 없어도 초록이 되어, 정작 「같은 3축일 때만 충돌한다」가 검증되지 않는다.
   */
  function dupToday(userId: unknown, orderNo: unknown): FakeRow | undefined {
    if (typeof orderNo !== "string" || orderNo === "") return undefined; // 부분 인덱스 대상 밖
    const { from, to } = kstDayRangeUtc();
    return rows.find(
      (r) => r.user_id === userId && r.order_no === orderNo && r.created_at >= from && r.created_at < to,
    );
  }

  const uniqueViolation = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "idx_dma_orders_user_order_no_kst_day"',
  };

  function applyFilters(filters: FakeFilter[]): FakeRow[] {
    let out = [...rows];
    for (const f of filters) {
      if (f.op === "eq") out = out.filter((r) => valueOf(r, f.column) === f.value);
      else if (f.op === "gte") out = out.filter((r) => r.created_at >= String(f.value));
      else if (f.op === "lt") out = out.filter((r) => r.created_at < String(f.value));
      else if (f.op === "in") {
        // (18-33) 목록에 든 값인 행만 남긴다. 컬럼이 없는 행은 DB 기본값 거울(`DB_DEFAULTS`)로
        // 읽는다 — `status` 는 `'requested'` 다. 실제 DB 에는 `status` 없는 행이 존재할 수 없고,
        // 고정 픽스처 행이 그 컬럼을 생략했을 뿐이다.
        const allowed = f.value as readonly unknown[];
        out = out.filter((r) => allowed.includes(valueOf(r, f.column)));
      }
      else if (f.op === "order") {
        const desc = (f.value as { ascending?: boolean } | undefined)?.ascending === false;
        out = [...out].sort((a, b) =>
          desc ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at),
        );
      } else if (f.op === "limit") out = out.slice(0, Number(f.value));
    }
    return out;
  }

  function builder(query: FakeQuery): Record<string, unknown> {
    const self: Record<string, unknown> = {};
    const push = (op: FakeFilter["op"]) => (column: string, value: unknown) => {
      query.filters.push({ op, column, value });
      return self;
    };
    self.eq = push("eq");
    self.gte = push("gte");
    self.lt = push("lt");
    self.in = (column: string, values: readonly unknown[]) => {
      query.filters.push({ op: "in", column, value: [...values] });
      return self;
    };
    // update 빌더의 `.select(cols)` (18-33) — PostgREST `Prefer: return=representation`.
    // 호출되면 결과 `data` 가 **실제로 병합된** 행들의 `{ id }` 배열이 된다.
    self.select = (cols: string) => {
      query.selected = true;
      query.columns = cols;
      return self;
    };
    self.order = push("order");
    self.limit = (n: number) => {
      query.filters.push({ op: "limit", column: "", value: n });
      return self;
    };
    // Supabase 빌더는 thenable 이다 — `await` 시점에 필터를 적용해 결과를 만든다.
    self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      query.matched = applyFilters(query.filters);
      // 강제 오류 주입 — 「제약 위반을 실제로 계산」하는 `dupToday` 와 달리, 여기서는
      // `details` 를 담은 오류를 **의도적으로** 흘려보내 로깅 경로를 시험한다 (16-38).
      let forced: FakePgError | undefined;
      if (query.verb === "update") {
        updateCalls += 1;
        forced =
          typeof opts.updateError === "function"
            ? opts.updateError(updateCalls, query.patch)
            : opts.updateError;
      } else if (query.verb === "select") {
        selectCalls += 1;
        forced = opts.selectError;
      }
      if (forced !== undefined) return Promise.resolve({ data: null, error: forced }).then(resolve, reject);
      // 갱신이 `order_no` 를 **채우는** 경우에만 인덱스에 걸릴 수 있다. 그 값을 이미 가진
      // 다른 행(같은 사용자·오늘)이 있으면 실제 DB 처럼 23505 로 거부한다.
      if (query.verb === "update" && query.patch?.order_no !== undefined) {
        const owner = query.matched[0]?.user_id ?? query.filters.find((f) => f.column === "user_id")?.value;
        const clash = dupToday(owner, query.patch.order_no);
        if (clash !== undefined && !query.matched.some((r) => r.id === clash.id)) {
          return Promise.resolve({ data: null, error: uniqueViolation }).then(resolve, reject);
        }
      }
      // ★ 성공한 update 는 **행을 실제로 갱신한다** (16-39 / R2-IN-04). 예전 스텁은
      //   `{ data: null, error: null }` 만 돌려줘 「갱신이 반영됐는가」를 이 파일이 볼 수
      //   없었고, 그래서 패치가 통째로 사라지는 결함이 초록불 아래 숨어 있었다.
      //   `matched` 는 `rows` 의 **같은 객체 참조**라 여기서 병합하면 `rows` 에도 남는다.
      if (query.verb === "update" && query.patch !== undefined) {
        for (const row of query.matched) Object.assign(row, query.patch);
      }
      // 결과는 **여기서 스냅숏**한다(투영이 새 객체를 만든다). 아래 `onSelect` 훅이 행을 바꿔도
      // 호출자가 받는 값은 바뀌기 전이다 — 실제 DB 의 「읽은 뒤 다른 쓰기가 끼어든다」 와 같다.
      const result =
        query.verb === "select" || (query.verb === "update" && query.selected === true)
          ? { data: query.matched.map((r) => project(r, query.columns)), error: null }
          : { data: null, error: null };
      if (query.verb === "select") opts.onSelect?.(query, selectCalls);
      return Promise.resolve(result).then(resolve, reject);
    };
    return self;
  }

  const supabase = {
    from: (table: string) => {
      if (table !== "dma_orders") throw new Error(`예상 밖 테이블: ${table}`);
      return {
        select: (cols: string) => {
          const q: FakeQuery = { verb: "select", filters: [], matched: [], columns: cols };
          queries.push(q);
          return builder(q);
        },
        update: (patch: OrderRowPatch) => {
          const q: FakeQuery = { verb: "update", filters: [], patch, matched: [] };
          queries.push(q);
          return builder(q);
        },
        insert: (values: Record<string, unknown>) => {
          const q: FakeQuery = { verb: "insert", filters: [], values, matched: [] };
          queries.push(q);
          const ins: Record<string, unknown> = {};
          ins.select = () => ins;
          ins.single = () => {
            if (opts.insertError !== undefined) {
              return Promise.resolve({ data: null, error: opts.insertError });
            }
            const clash = dupToday(values.user_id, values.order_no);
            if (clash !== undefined) {
              q.matched = [clash];
              return Promise.resolve({ data: null, error: uniqueViolation });
            }
            const created: FakeRow = {
              id: `row-new-${String(rows.length)}`,
              user_id: String(values.user_id),
              order_no: typeof values.order_no === "string" ? values.order_no : "",
              created_at: new Date().toISOString(),
              // (18-33) DB `status NOT NULL DEFAULT 'requested'` 의 거울.
              status: typeof values.status === "string" ? values.status : "requested",
              // (e1m) 주문수량 원문과 DB `filled_qty NOT NULL DEFAULT 0` 의 거울 — 체결 누적 sink
              // 가 이 둘로 filled / partially_filled 를 파생한다.
              ...(typeof values.qty === "number" ? { qty: values.qty } : {}),
              filled_qty: 0,
            };
            rows.push(created);
            q.matched = [created];
            return Promise.resolve({ data: { id: created.id }, error: null });
          };
          return ins;
        },
      };
    },
  } as unknown as SupabaseClient;

  return { supabase, queries, rows };
}
