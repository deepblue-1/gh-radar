/**
 * Phase 19 Plan 05 — 관찰자 기록기 (`JournalWriter`). 저널 레코드 → `dma_journal_apply` 의 유일한 경로.
 *
 * 흐름: 관찰자 수신 콜백 → `push(records)`(**동기 적재만**) → 직렬 워커가 큐 머리에서 같은 epoch
 * 레코드를 최대 `batchSize` 개 꺼내 `dma_journal_apply` 를 **한 번에 하나만** 부른다 → 반환 행을
 * shared `toJournalOrderRow` 로 바꿔 `emit("applied", rows)` → 부팅 결선이 `WsFanout.deliverJournalRows`
 * 로 넘긴다(계좌 권한 필터는 fanout 에만 있다).
 *
 * 결정 근거:
 *   D-32     수신 콜백에서 Supabase 를 await 하지 않는다 — 기다리면 게이트웨이 송신 큐가 차서
 *            서버가 관찰자 연결을 끊는다. `push` 는 동기이고 적용은 워커 몫이다.
 *   D-11     매핑 여부와 무관하게 받은 레코드를 **전부** 적용 RPC 로 보낸다. 계좌 필터는 푸시에만 있다.
 *   D-12     커서(`dma_journal_cursor`)는 적용 RPC 트랜잭션 **안에서만** 전진한다. relay 가 죽어도
 *            다음 부팅이 커서부터 재생하고, 재생 중복은 DB 이벤트 PK 게이트가 흡수한다(유실 0 · 이중 적용 0).
 *   T-19-14  로그에 계좌번호 원문·`dmaUserId` 를 싣지 않는다. 계좌는 `maskAccountNo` 로만.
 *
 * 하지 않는 것:
 *   - 체결 수량·상태를 계산하지 않는다 — 투영은 DB RPC(`dma_journal_project`) 정본이다.
 *   - 계좌 권한을 판정하지 않는다 — `applied` 로 넘긴 행을 누구에게 보낼지는 fanout 이 정한다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJournalOrderRow } from "@gh-radar/shared";
import type { JournalOrderDbRow, JournalOrderRow } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import type { JournalPushResult, JournalRecord } from "./types.js";

// ============================================================
// 상수 정본
// ============================================================

/** 적용 RPC 1회당 최대 레코드 수. */
export const JOURNAL_BATCH_SIZE = 200;

/** 큐 상한(레코드). 넘으면 `overflow` — e2-micro 메모리 방어(T-19-09). */
export const JOURNAL_MAX_QUEUE = 5_000;

// ============================================================
// 계약
// ============================================================

/** `dma_journal_apply` 입력 이벤트 1건 — 19-01 RPC 가 읽는 키 23종과 **1:1** 이다. */
export type JournalApplyEvent = {
  seq: number;
  trade_date: string;
  gw_time_ms: number;
  dma_user_id: string;
  account_no: string;
  isin: string;
  side: string;
  side_trusted: boolean;
  order_no: string;
  org_order_no: string;
  notice_type: string;
  request_kind: string;
  requester: string;
  origin: string;
  exchange: string;
  board: string;
  order_price: number;
  order_qty: number;
  exec_price: number;
  exec_qty: number;
  result_code: number;
  message: string;
  local_reject: boolean;
};

/** `dma_journal_apply` 반환 jsonb. */
type ApplyResult = {
  applied: number;
  skipped: number;
  errors: Array<{ seq: number; error: string }>;
  last_seq: number | string;
  rows: JournalOrderDbRow[];
};

export type JournalWriterDeps = {
  /** 서비스롤 클라이언트 — 적용 RPC 의 EXECUTE 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 게이트웨이 식별자(커서 테이블 PK · 적용 RPC `p_gateway`). 예: `"KB"`. */
  gateway: string;
  batchSize?: number;
  maxQueue?: number;
};

type QueueItem = { epoch: string; record: JournalRecord };

export interface JournalWriter {
  on(event: "applied", listener: (rows: JournalOrderRow[]) => void): this;
  emit(event: "applied", rows: JournalOrderRow[]): boolean;
}

/**
 * camelCase 도메인 레코드 → 적용 RPC 입력 키 23종. **순수 매핑**이다 — 값 보정이 없다.
 *
 * ★ 키 목록은 19-01 `dma_journal_apply`/`dma_journal_project` 가 `p_ev->>'…'` 로 읽는 키와 1:1 이다.
 *   하나라도 이름이 틀리면 DB 가 그 값을 ''/0/false 로 조용히 적재한다 — 테스트가 키 집합을 잠근다.
 */
export function toApplyEvent(r: JournalRecord): JournalApplyEvent {
  return {
    seq: r.seq,
    trade_date: r.tradeDate,
    gw_time_ms: r.gwTimeMs,
    dma_user_id: r.dmaUserId,
    account_no: r.accountNo,
    isin: r.isin,
    side: r.side,
    side_trusted: r.sideTrusted,
    order_no: r.orderNo,
    org_order_no: r.orgOrderNo,
    notice_type: r.noticeType,
    request_kind: r.requestKind,
    requester: r.requester,
    origin: r.origin,
    exchange: r.exchange,
    board: r.board,
    order_price: r.orderPrice,
    order_qty: r.orderQty,
    exec_price: r.execPrice,
    exec_qty: r.execQty,
    result_code: r.resultCode,
    message: r.message,
    local_reject: r.localReject,
  };
}

/** 관찰자 기록기. 인스턴스는 게이트웨이당 1개다. */
export class JournalWriter extends EventEmitter {
  readonly #supabase: SupabaseClient;
  readonly #gateway: string;
  readonly #batchSize: number;
  readonly #maxQueue: number;

  /** FIFO. 진행 중 배치도 성공할 때까지 머리에 남는다(실패하면 같은 배치를 다시 보낸다). */
  #queue: QueueItem[] = [];
  #inFlight = false;
  #epoch = "";
  #lastAppliedSeq: number | null = null;
  #closed = false;

  constructor(deps: JournalWriterDeps) {
    super();
    this.#supabase = deps.supabase;
    this.#gateway = deps.gateway;
    this.#batchSize = deps.batchSize ?? JOURNAL_BATCH_SIZE;
    this.#maxQueue = deps.maxQueue ?? JOURNAL_MAX_QUEUE;
  }

  get epoch(): string {
    return this.#epoch;
  }

  get lastAppliedSeq(): number | null {
    return this.#lastAppliedSeq;
  }

  get queueDepth(): number {
    return this.#queue.length;
  }

  /** 이후 push 되는 레코드의 epoch 를 정한다. */
  beginEpoch(epoch: string, _opts: { resync: boolean } = { resync: false }): void {
    this.#epoch = epoch;
  }

  /** 종료 — 이후 push 를 거부한다. */
  close(): void {
    this.#closed = true;
  }

  /**
   * 레코드를 큐에 넣는다. **동기다** — 수신 콜백 경로에서 부른다(D-32).
   */
  push(records: readonly JournalRecord[]): JournalPushResult {
    if (this.#closed) {
      logger.warn({ incoming: records.length }, "[journal] 종료된 기록기에 push — 적재하지 않는다");
      return "overflow";
    }
    if (this.#queue.length + records.length > this.#maxQueue) {
      logger.warn(
        { queueDepth: this.#queue.length, incoming: records.length, maxQueue: this.#maxQueue },
        "[journal] 큐 상한 초과 — 적재하지 않는다",
      );
      return "overflow";
    }
    for (const record of records) this.#queue.push({ epoch: this.#epoch, record });
    this.#kick();
    return "ok";
  }

  // ----------------------------------------------------------
  // 직렬 워커
  // ----------------------------------------------------------

  #kick(): void {
    if (this.#inFlight || this.#queue.length === 0) return;
    void this.#runBatch();
  }

  async #runBatch(): Promise<void> {
    this.#inFlight = true;
    const head = this.#queue[0];
    if (head === undefined) {
      this.#inFlight = false;
      return;
    }
    const epoch = head.epoch;
    let n = 0;
    while (n < this.#batchSize && n < this.#queue.length && this.#queue[n]?.epoch === epoch) n += 1;
    const batch = this.#queue.slice(0, n).map((item) => item.record);

    let result: ApplyResult | null = null;
    try {
      const { data, error } = await this.#supabase.rpc("dma_journal_apply", {
        p_gateway: this.#gateway,
        p_epoch: epoch,
        p_events: batch.map(toApplyEvent),
      });
      if (error) throw error;
      result = data as ApplyResult;
    } catch (err) {
      logger.error(
        {
          pgError: safePgError(err),
          batch: batch.length,
          firstSeq: batch[0]?.seq,
          lastSeq: batch[batch.length - 1]?.seq,
        },
        "[journal] dma_journal_apply 실패",
      );
    } finally {
      this.#inFlight = false;
    }
    if (result === null) return;

    this.#queue.splice(0, n);
    this.#onApplied(result);
    this.#kick();
  }

  #onApplied(result: ApplyResult): void {
    this.#lastAppliedSeq = Number(result.last_seq);
    for (const e of result.errors ?? []) {
      logger.warn({ seq: e.seq, error: e.error }, "[journal] 투영 실패 이벤트 — apply_error 기록됨");
    }
    const rows = (result.rows ?? []).map(toJournalOrderRow);
    if (rows.length > 0) this.emit("applied", rows);
  }
}
