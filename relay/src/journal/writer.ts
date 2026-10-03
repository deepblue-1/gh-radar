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
 *   Pitfall 2  재시도는 **같은 배치**를 다시 보낸다. 실패 중에는 `lastAppliedSeq` 도 커서도 전진하지 않는다.
 *   Pitfall 3  epoch 가 바뀌면(저장소 초기화 · 보관 범위 밖) `beginEpoch(…, {resync:true})` 가 error 로그로
 *              드러내고 새 epoch 첫 레코드를 갭 판정 없이 받는다 — 조용한 전면 누락을 막는다.
 *   T-19-09    큐 상한(`maxQueue`)을 넘으면 `overflow` — 관찰자가 연결을 끊어 게이트웨이 펌프가 속도를 맞춘다.
 *   seq 역행   같은 epoch 인데 로그인 응답 head 가 `lastReceivedSeq` 보다 작으면(게이트웨이가 epoch 는 되살렸지만
 *              최신 기록을 잃음) `resync` 값과 무관하게 `lastReceivedSeq` 를 **유지**하고 error 로그 · health 카운터로
 *              드러낸다(gh-trade Phase 23 합의 — 게이트웨이는 다음 seq 를 since+1 로 올린다). 되돌리면 1..head 재생 →
 *              since+1 → 갭 → since=head 재접속 → 갭이 끝없이 반복된다.
 *
 * seq 연속성(push 시점 · 동기):
 *   - `lastReceivedSeq` 이하 = 중복 → 건너뛴다(재접속 직후 겹친 재생). 단 seq 역행으로 게이트웨이가 잃은 구간
 *     (역행 head 초과 ~ 그때의 마지막 수신 seq)의 중복은 재생이 아니라 seq 재사용이다 — error 로그 · health
 *     `duplicatesAfterRegression` 으로 드러낸다(19-REVIEW WR-03 · 조용한 영구 누락 방지).
 *   - 첫 비중복 레코드가 `lastReceivedSeq + 1` 이 아니면 **그 앞까지만** 적재하고 `gap` —
 *     호출자는 연결을 끊고 `since_seq = lastReceivedSeq` 로 다시 받는다.
 *   - `lastReceivedSeq === null`(새 epoch · 커서 없음)이면 첫 레코드는 판정 없이 받는다.
 *
 * 스트림 서술자(Phase 25 — `JournalStreamSpec`):
 *   관찰자 80 한 프레임에 두 스트림(주문 저널 · 전략 이벤트)이 온다. 두 스트림은 같은 epoch · **별도 seq 공간**
 *   이라 커서 · 적용 RPC · 반환 행 모양만 다르고 push · beginEpoch · 재시도 · drain 규율은 같다. 그래서 클래스를
 *   복제하지 않고 스트림 고유 4지점(커서 select 칸 · 커서 행 읽기 · 적용 RPC 이름 · 반환 행 매퍼)만 서술자로
 *   주입한다. 생략하면 `JOURNAL_STREAM`(현 주문 저널 — 기존 호출 · 테스트 무변경). 로그에는 `stream` 문맥을
 *   싣는다 — 두 기록기 로그가 섞이면 운영 판독이 안 된다(T-25-06).
 *
 * 하지 않는 것:
 *   - 체결 수량·상태를 계산하지 않는다 — 투영은 DB RPC(`dma_journal_project`) 정본이다.
 *   - 계좌 권한을 판정하지 않는다 — `applied` 로 넘긴 행을 누구에게 보낼지는 fanout 이 정한다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJournalOrderRow } from "@gh-radar/shared";
import type { JournalOrderDbRow, JournalOrderRow } from "@gh-radar/shared";

import { backoffDelayMs, RECONNECT_MAX_DELAY_MS } from "../dma/dma-client.js";
import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import type { JournalCursor, JournalPushResult, JournalRecord, JournalWriterHealth } from "./types.js";

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

/** 적용 RPC 반환 jsonb (`dma_journal_apply` · `dma_strategy_apply` 공통 모양). 행 모양은 스트림이 정한다. */
type ApplyResult = {
  applied: number;
  skipped: number;
  errors: Array<{ seq: number; error: string }>;
  last_seq: number | string;
  rows: unknown[];
};

/**
 * 기록기 스트림 서술자 — 스트림마다 다른 4지점만 담는다(위 머리 주석).
 *
 * `toApply` 결과의 키가 곧 적용 RPC 가 `ev->>'…'` 로 읽는 키다 — 스트림 파일이 키 목록을 테스트로 잠근다.
 */
export type JournalStreamSpec<R extends { seq: number }, Out> = {
  /** 로그 문맥 이름. */
  name: "journal" | "strategy";
  /** 적용 RPC 이름. */
  rpc: string;
  /** `dma_journal_cursor` 의 이 스트림 epoch 칸. */
  cursorEpochColumn: string;
  /** `dma_journal_cursor` 의 이 스트림 seq 칸. */
  cursorSeqColumn: string;
  /** 도메인 레코드 → 적용 RPC 입력 이벤트 1건. 순수 매핑. */
  toApply(r: R): Record<string, unknown>;
  /** 적용 RPC 반환 행 1건 → 공개 행. */
  toOut(row: unknown): Out;
};

export type JournalWriterDeps<R extends { seq: number } = JournalRecord, Out = JournalOrderRow> = {
  /** 스트림 서술자. 생략하면 `JOURNAL_STREAM`(주문 저널). */
  stream?: JournalStreamSpec<R, Out>;
  /** 서비스롤 클라이언트 — 적용 RPC 의 EXECUTE 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 게이트웨이 식별자(커서 테이블 PK · 적용 RPC `p_gateway`). 예: `"KB"`. */
  gateway: string;
  /** 적용 RPC 1회당 최대 레코드 수. 기본 `JOURNAL_BATCH_SIZE`. */
  batchSize?: number;
  /** 큐 상한. 기본 `JOURNAL_MAX_QUEUE`. */
  maxQueue?: number;
  /** 첫 재시도 지연(ms). 기본 `backoffDelayMs(1)` — dma-client 정본. */
  retryBaseMs?: number;
  /** 재시도 지연 상한(ms). 기본 `RECONNECT_MAX_DELAY_MS`. */
  retryMaxMs?: number;
  /** 연속 실패가 이 횟수에 닿으면 `dbError = true`. 기본 3. */
  dbErrorAfter?: number;
};

/** `dbErrorAfter` 기본값. */
const DEFAULT_DB_ERROR_AFTER = 3;

type QueueItem<R> = { epoch: string; record: R };

/** 커서 행 — 칸 이름은 스트림 서술자가 정한다. epoch 칸은 전략 칸처럼 NULL 일 수 있다. */
type CursorRow = Record<string, string | number | null | undefined>;

export interface JournalWriter<R extends { seq: number } = JournalRecord, Out = JournalOrderRow> {
  on(event: "applied", listener: (rows: Out[]) => void): this;
  on(event: "health", listener: (health: JournalWriterHealth) => void): this;
  emit(event: "applied", rows: Out[]): boolean;
  emit(event: "health", health: JournalWriterHealth): boolean;
}

/**
 * 실패 `attempt` 회차의 재시도 지연. dma-client `backoffDelayMs` 의 **배율**(1·2·4·8·16·30)을 그대로 쓰고
 * 기준값·상한만 주입받는다 — 값을 복제하지 않고 테스트가 지연을 줄일 수 있게. 기본값이면
 * `backoffDelayMs(attempt)` 와 같다(1→2→4→…→30초).
 */
export function journalRetryDelayMs(attempt: number, baseMs: number, maxMs: number): number {
  const factor = backoffDelayMs(attempt) / backoffDelayMs(1);
  return Math.min(maxMs, Math.round(baseMs * factor));
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

/** 주문 저널 스트림 — 기록기 서술자 기본값(Phase 19 동작 그대로). */
export const JOURNAL_STREAM: JournalStreamSpec<JournalRecord, JournalOrderRow> = {
  name: "journal",
  rpc: "dma_journal_apply",
  cursorEpochColumn: "journal_epoch",
  cursorSeqColumn: "last_seq",
  toApply: toApplyEvent,
  toOut: (row) => toJournalOrderRow(row as JournalOrderDbRow),
};

/** 관찰자 기록기. 인스턴스는 게이트웨이 · 스트림당 1개다. */
export class JournalWriter<R extends { seq: number } = JournalRecord, Out = JournalOrderRow> extends EventEmitter {
  readonly #stream: JournalStreamSpec<R, Out>;
  readonly #supabase: SupabaseClient;
  readonly #gateway: string;
  readonly #batchSize: number;
  readonly #maxQueue: number;
  readonly #retryBaseMs: number;
  readonly #retryMaxMs: number;
  readonly #dbErrorAfter: number;

  /** FIFO. 진행 중 배치도 성공할 때까지 머리에 남는다(실패하면 같은 배치를 다시 보낸다). */
  #queue: QueueItem<R>[] = [];
  #inFlight = false;
  #retryTimer: NodeJS.Timeout | null = null;
  #closed = false;

  #epoch = "";
  /** 마지막으로 **적재한** seq. null = 판정 기준 없음(새 epoch · 커서 없음) → 다음 레코드를 그대로 받는다. */
  #lastReceivedSeq: number | null = null;
  /** DB 커서가 확인해 준 마지막 seq. 적용 성공에서만 바뀐다. */
  #lastAppliedSeq: number | null = null;
  #lastAppliedAtMs: number | null = null;
  #consecutiveFailures = 0;
  #dbError = false;
  /** 부팅 뒤 관측한 seq 역행 횟수 · 마지막 관측 시각(`beginEpoch`). */
  #seqRegressions = 0;
  #lastSeqRegressionAtMs: number | null = null;
  /**
   * seq 역행으로 게이트웨이가 잃은 구간(WR-03) — `(afterSeq, throughSeq]`. 이 epoch 에서 이 구간 seq 로 오는 레코드는
   * 재생이 아니라 게이트웨이가 seq 를 다시 매긴 새 레코드다. epoch 가 바뀌거나 resync 로 수신 seq 를 비우면 null.
   */
  #regressionWindow: { epoch: string; afterSeq: number; throughSeq: number } | null = null;
  #duplicatesAfterRegression = 0;
  #lastDuplicateAfterRegressionAtMs: number | null = null;

  /** `drain` 대기자. 큐가 비고 진행 중 호출이 끝나면 전부 깨운다. */
  #idleWaiters: Array<() => void> = [];

  constructor(deps: JournalWriterDeps<R, Out>) {
    super();
    // 생략 = 주문 저널. 기본 제네릭(JournalRecord · JournalOrderRow)일 때만 타입이 맞는다 — 전략 스트림은
    // `createStrategyWriter` 가 서술자를 반드시 넘긴다.
    this.#stream = deps.stream ?? (JOURNAL_STREAM as unknown as JournalStreamSpec<R, Out>);
    this.#supabase = deps.supabase;
    this.#gateway = deps.gateway;
    this.#batchSize = deps.batchSize ?? JOURNAL_BATCH_SIZE;
    this.#maxQueue = deps.maxQueue ?? JOURNAL_MAX_QUEUE;
    this.#retryBaseMs = deps.retryBaseMs ?? backoffDelayMs(1);
    this.#retryMaxMs = deps.retryMaxMs ?? RECONNECT_MAX_DELAY_MS;
    this.#dbErrorAfter = deps.dbErrorAfter ?? DEFAULT_DB_ERROR_AFTER;
  }

  // ----------------------------------------------------------
  // 관측 게터
  // ----------------------------------------------------------

  get epoch(): string {
    return this.#epoch;
  }

  get lastReceivedSeq(): number | null {
    return this.#lastReceivedSeq;
  }

  get lastAppliedSeq(): number | null {
    return this.#lastAppliedSeq;
  }

  get queueDepth(): number {
    return this.#queue.length;
  }

  health(): JournalWriterHealth {
    return {
      queueDepth: this.#queue.length,
      consecutiveFailures: this.#consecutiveFailures,
      dbError: this.#dbError,
      lastAppliedSeq: this.#lastAppliedSeq,
      lastAppliedAtMs: this.#lastAppliedAtMs,
      seqRegressions: this.#seqRegressions,
      lastSeqRegressionAtMs: this.#lastSeqRegressionAtMs,
      duplicatesAfterRegression: this.#duplicatesAfterRegression,
      lastDuplicateAfterRegressionAtMs: this.#lastDuplicateAfterRegressionAtMs,
    };
  }

  // ----------------------------------------------------------
  // epoch · 커서
  // ----------------------------------------------------------

  /**
   * DB 커서(`dma_journal_cursor`)를 읽어 epoch·`lastReceivedSeq` 를 초기화한다 — 부팅 시 관찰자가
   * 로그인 전에 부른다(`since_seq` 의 원천). 행이 없으면 `{ epoch: "", lastSeq: 0 }` 이고 첫 레코드는
   * 판정 없이 받는다. 조회 오류는 로그 후 throw — 호출자가 재시도한다(커서를 모른 채 받으면 갭 판정이 무너진다).
   */
  async readCursor(): Promise<JournalCursor> {
    const { cursorEpochColumn: epochCol, cursorSeqColumn: seqCol } = this.#stream;
    const { data, error } = await this.#supabase
      .from("dma_journal_cursor")
      .select(`${epochCol}, ${seqCol}`)
      .eq("gateway", this.#gateway)
      .maybeSingle<CursorRow>();
    const stream = this.#stream.name;
    if (error) {
      const pgError = safePgError(error);
      logger.error({ gateway: this.#gateway, stream, pgError }, "[journal] 커서 조회 실패 — 호출자가 재시도한다");
      throw new Error(`[journal] dma_journal_cursor 조회 실패${pgError.code ? ` (${pgError.code})` : ""}`);
    }
    // 행이 없거나, 행은 있어도 이 스트림 epoch 칸이 비었으면(주문 스트림만 적용된 게이트웨이의 전략 칸) 「커서 없음」.
    const rowEpoch = data?.[epochCol];
    if (data === null || data === undefined || typeof rowEpoch !== "string" || rowEpoch === "") {
      this.#epoch = "";
      this.#lastReceivedSeq = null;
      logger.info({ gateway: this.#gateway, stream }, "[journal] 커서 없음 — 처음부터 받는다");
      return { epoch: "", lastSeq: 0 };
    }
    const lastSeq = Number(data[seqCol] ?? 0);
    this.#epoch = rowEpoch;
    this.#lastReceivedSeq = lastSeq;
    this.#lastAppliedSeq = lastSeq;
    logger.info({ gateway: this.#gateway, stream, epoch: rowEpoch, lastSeq }, "[journal] 커서 적재");
    return { epoch: rowEpoch, lastSeq };
  }

  /**
   * 관찰자 로그인 응답의 epoch 로 이후 push 의 epoch 를 정한다.
   *
   * `resync` 이거나 epoch 가 현재와 다르면 새 epoch 로 바꾸고 `lastReceivedSeq = null` — 새 epoch 첫
   * 레코드는 갭 판정 없이 받는다. 큐에 남은 옛 epoch 항목은 **그 epoch 로 먼저** 나간다(한 배치에 두 epoch
   * 가 섞이지 않는다). 같은 epoch · resync 아님이면 아무것도 바꾸지 않는다(since_seq 이어받기).
   *
   * **seq 역행**: 같은 epoch 인데 `headSeq < lastReceivedSeq` 이면 `resync` 여도 `lastReceivedSeq` 를 유지한다 —
   * 게이트웨이가 epoch 는 되살렸지만 최신 기록을 잃은 경우다. 비우면 게이트웨이가 1..head 를 재생하고(DB PK 가
   * 흡수) 다음 새 레코드는 since+1 이라 갭 → since=head 재접속 → 갭이 끝없이 반복된다. error 로그와 health
   * 카운터로 드러내되 503 은 만들지 않는다(스트림은 정상). 같은 epoch · resync · head ≥ 수신(보관 범위 밖)은 종전대로 비운다.
   */
  beginEpoch(epoch: string, opts: { resync: boolean; headSeq: number }): void {
    const from = this.#epoch;
    const received = this.#lastReceivedSeq;
    if (epoch === from && received !== null && opts.headSeq < received) {
      this.#seqRegressions += 1;
      this.#lastSeqRegressionAtMs = Date.now();
      // 잃은 구간을 기억한다(WR-03) — 같은 epoch 에서 역행이 거듭되면 구간을 넓힌다.
      const prev = this.#regressionWindow?.epoch === epoch ? this.#regressionWindow : null;
      this.#regressionWindow = {
        epoch,
        afterSeq: Math.min(prev?.afterSeq ?? opts.headSeq, opts.headSeq),
        throughSeq: Math.max(prev?.throughSeq ?? received, received),
      };
      logger.error(
        { gateway: this.#gateway, stream: this.#stream.name, epoch, headSeq: opts.headSeq, lastReceivedSeq: received, resync: opts.resync },
        "[JOURNAL] 저널 seq 역행 — 같은 epoch 인데 게이트웨이 head 가 받은 seq 보다 작다",
      );
      return;
    }
    if (!opts.resync && epoch === from) return;
    this.#epoch = epoch;
    this.#lastReceivedSeq = null;
    this.#regressionWindow = null;
    if (opts.resync || from !== "") {
      // 조용한 전면 누락을 드러낸다(Pitfall 3) — 커서가 가리키던 저장소가 사라졌다는 뜻이다.
      logger.error(
        { gateway: this.#gateway, stream: this.#stream.name, from, to: epoch, resync: opts.resync },
        "[journal] 저널 재동기화 — epoch 변경 또는 보관 범위 밖",
      );
    } else {
      logger.info({ gateway: this.#gateway, stream: this.#stream.name, to: epoch }, "[journal] epoch 시작");
    }
  }

  // ----------------------------------------------------------
  // 적재 (수신 콜백 경로 — 동기)
  // ----------------------------------------------------------

  /**
   * 레코드를 큐에 넣는다. **동기다** — 수신 콜백 경로에서 부르며 여기서 아무것도 기다리지 않는다(D-32).
   * 결과 의미는 `JournalPushResult` 참조.
   */
  push(records: readonly R[]): JournalPushResult {
    const stream = this.#stream.name;
    if (this.#closed) {
      logger.warn({ gateway: this.#gateway, stream, incoming: records.length }, "[journal] 종료된 기록기에 push — 적재하지 않는다");
      return "not_ready";
    }
    if (this.#epoch === "") {
      // 적용 RPC 는 빈 epoch 를 거부한다 — 받아 두면 영원히 재시도에 갇힌다. 결선 순서 오류다.
      logger.error({ gateway: this.#gateway, stream, incoming: records.length }, "[journal] epoch 미설정 상태의 push — 적재하지 않는다");
      return "not_ready";
    }

    let last = this.#lastReceivedSeq;
    const accepted: R[] = [];
    let duplicates = 0;
    /** 역행으로 잃은 구간 seq 로 온 중복 — 재생이 아니라 seq 를 재사용한 새 레코드다(WR-03). */
    let reused = 0;
    let firstReusedSeq: number | null = null;
    const window = this.#regressionWindow?.epoch === this.#epoch ? this.#regressionWindow : null;
    let gap: { expected: number; got: number } | null = null;
    for (const record of records) {
      if (last !== null && record.seq <= last) {
        duplicates += 1;
        if (window !== null && record.seq > window.afterSeq && record.seq <= window.throughSeq) {
          reused += 1;
          firstReusedSeq ??= record.seq;
        }
        continue;
      }
      if (last !== null && record.seq !== last + 1) {
        gap = { expected: last + 1, got: record.seq };
        break;
      }
      accepted.push(record);
      last = record.seq;
    }
    if (reused > 0) {
      // 조용한 영구 누락을 드러낸다(WR-03) — 운영 LOG_LEVEL 에서 보이는 error · healthz 계수.
      this.#duplicatesAfterRegression += reused;
      this.#lastDuplicateAfterRegressionAtMs = Date.now();
      logger.error(
        {
          gateway: this.#gateway,
          stream,
          reused,
          firstReusedSeq,
          lostAfterSeq: window?.afterSeq,
          lostThroughSeq: window?.throughSeq,
          lastReceivedSeq: this.#lastReceivedSeq,
        },
        "[journal] seq 역행 뒤 잃은 구간의 seq 로 레코드가 왔다 — 게이트웨이 seq 재사용 의심 · 건너뜀(DB 미적재)",
      );
    }
    if (duplicates > reused) {
      logger.debug(
        { gateway: this.#gateway, stream, duplicates: duplicates - reused, lastReceivedSeq: this.#lastReceivedSeq },
        "[journal] 중복 seq 건너뜀",
      );
    }

    if (this.#queue.length + accepted.length > this.#maxQueue) {
      logger.warn(
        { gateway: this.#gateway, stream, queueDepth: this.#queue.length, incoming: accepted.length, maxQueue: this.#maxQueue },
        "[journal] 큐 상한 초과 — 적재하지 않는다(연결을 끊어 펌프 속도를 맞춘다)",
      );
      return "overflow";
    }

    for (const record of accepted) this.#queue.push({ epoch: this.#epoch, record });
    this.#lastReceivedSeq = last;
    if (accepted.length > 0) this.#kick();

    if (gap !== null) {
      logger.error({ gateway: this.#gateway, stream, ...gap }, "[journal] seq 갭 — 연결을 끊고 since_seq 로 다시 받는다");
      return "gap";
    }
    return "ok";
  }

  // ----------------------------------------------------------
  // 종료
  // ----------------------------------------------------------

  /**
   * 큐가 비고 진행 중 호출이 끝나면 true, `timeoutMs` 안에 못 끝내면 false.
   * false 여도 유실은 없다 — 커서는 RPC 트랜잭션 안에서만 전진하므로 다음 부팅이 남은 구간을 재생한다.
   */
  drain(timeoutMs: number): Promise<boolean> {
    if (this.#isIdle()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const onIdle = (): void => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.#idleWaiters = this.#idleWaiters.filter((w) => w !== onIdle);
        logger.warn(
          { gateway: this.#gateway, stream: this.#stream.name, remaining: this.#queue.length, timeoutMs },
          "[journal] drain 시간 초과 — 커서가 전진하지 않았으므로 다음 부팅이 재생한다",
        );
        resolve(false);
      }, timeoutMs);
      timer.unref?.();
      this.#idleWaiters.push(onIdle);
    });
  }

  /** 재시도 타이머를 지우고 이후 push 를 거부한다. 진행 중 RPC 는 끝까지 가지만 다음 배치는 없다. */
  close(): void {
    this.#closed = true;
    if (this.#retryTimer !== null) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
  }

  // ----------------------------------------------------------
  // 직렬 워커
  // ----------------------------------------------------------

  #isIdle(): boolean {
    return this.#queue.length === 0 && !this.#inFlight;
  }

  #kick(): void {
    if (this.#inFlight || this.#retryTimer !== null) return;
    if (this.#queue.length === 0) {
      this.#notifyIdle();
      return;
    }
    if (this.#closed) return;
    void this.#runBatch();
  }

  #notifyIdle(): void {
    if (!this.#isIdle() || this.#idleWaiters.length === 0) return;
    const waiters = this.#idleWaiters;
    this.#idleWaiters = [];
    for (const w of waiters) w();
  }

  async #runBatch(): Promise<void> {
    const head = this.#queue[0];
    if (head === undefined) return;
    this.#inFlight = true;

    // 한 배치 = 한 epoch · 수신 순서(FIFO) · 최대 batchSize.
    const epoch = head.epoch;
    let n = 0;
    while (n < this.#batchSize && n < this.#queue.length && this.#queue[n]?.epoch === epoch) n += 1;
    const batch = this.#queue.slice(0, n).map((item) => item.record);

    let result: ApplyResult | null = null;
    let failure: unknown = null;
    try {
      const { data, error } = await this.#supabase.rpc(this.#stream.rpc, {
        p_gateway: this.#gateway,
        p_epoch: epoch,
        p_events: batch.map((r) => this.#stream.toApply(r)),
      });
      if (error) failure = error;
      else if (!isApplyResult(data)) failure = new Error(`${this.#stream.rpc} 반환 형식 위반`);
      else result = data;
    } catch (err) {
      failure = err;
    } finally {
      this.#inFlight = false;
    }

    if (result === null) {
      this.#onFailure(failure, batch);
      return;
    }

    this.#queue.splice(0, n);
    this.#onSuccess(result);
    this.#kick();
  }

  #onFailure(err: unknown, batch: readonly R[]): void {
    this.#consecutiveFailures += 1;
    logger.error(
      {
        gateway: this.#gateway,
        stream: this.#stream.name,
        rpc: this.#stream.rpc,
        pgError: safePgError(err),
        batch: batch.length,
        firstSeq: batch[0]?.seq,
        lastSeq: batch[batch.length - 1]?.seq,
        attempt: this.#consecutiveFailures,
      },
      // 메시지에 RPC 이름을 그대로 싣는다 — 기존 운영 로그 검색어(`dma_journal_apply 실패`)가 이어진다.
      `[journal] ${this.#stream.rpc} 실패 — 같은 배치 재시도`,
    );
    if (!this.#dbError && this.#consecutiveFailures >= this.#dbErrorAfter) {
      this.#dbError = true;
      this.emit("health", this.health());
    }
    if (this.#closed) return;
    const delay = journalRetryDelayMs(this.#consecutiveFailures, this.#retryBaseMs, this.#retryMaxMs);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.#kick();
    }, delay);
    this.#retryTimer.unref?.();
  }

  #onSuccess(result: ApplyResult): void {
    this.#lastAppliedSeq = Number(result.last_seq);
    this.#lastAppliedAtMs = Date.now();
    const recovered = this.#dbError;
    this.#consecutiveFailures = 0;
    this.#dbError = false;
    if (recovered) {
      logger.info({ gateway: this.#gateway, stream: this.#stream.name, lastAppliedSeq: this.#lastAppliedSeq }, "[journal] 적용 복구");
      this.emit("health", this.health());
    }

    for (const e of result.errors) {
      logger.warn({ gateway: this.#gateway, stream: this.#stream.name, seq: e.seq, error: e.error }, "[journal] 투영 실패 이벤트 — apply_error 기록됨");
    }
    const rows = result.rows.map((row) => this.#stream.toOut(row));
    if (rows.length === 0) return;
    // 리스너(푸시) 예외가 워커를 멈추거나 성공한 배치를 재전송하게 두지 않는다.
    try {
      this.emit("applied", rows);
    } catch (err) {
      logger.error(
        { gateway: this.#gateway, stream: this.#stream.name, err: String(err), rows: rows.length },
        "[journal] applied 리스너 예외 — 적용은 이미 확정됐다",
      );
    }
  }
}

function isApplyResult(v: unknown): v is ApplyResult {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.rows) && Array.isArray(o.errors) && o.last_seq !== undefined && o.last_seq !== null;
}
