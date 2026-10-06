/**
 * Phase 29 Plan 03 — ADMIN-04 · D-09. 서버별 관찰자 파이프라인 (`ServerPipelines`).
 *
 * 레지스트리 행 하나(enabled) = 저널 관찰자 **한 벌**이다 — 기록기(`JournalWriter`) · 전략 기록기 · 매핑(`JournalAccess`) ·
 * 관찰자(`JournalObserver`) · 상태(`JournalStatus`). 종전 index.ts 의 `createJournalPipeline`(quick-260929-c8e — 게이트웨이당
 * 한 벌)을 여기로 옮기고, 정적 배열 대신 `sync(rows)` 로 레지스트리 diff 를 반영한다:
 *
 *   새 enabled 키                → 생성 → `onCreated` → `observer.start()` (결선이 붙은 **뒤에** 시작 — 첫 배치를 버리지 않는다)
 *   빠진 키 · enabled=false     → `observer.stop()` → 기록기 drain(2초 · 비동기) → close → `onRemoved`
 *   host · port · broker 변경   → 위 정지 후 같은 키로 재생성(새 주소로 재로그인)
 *
 * 결정 근거:
 *   - 벌끼리는 아무것도 공유하지 않는다 — 커서 · epoch · 매핑 · 상태가 서버 키별로 따로다(c8e 그대로). 한 서버의 거부 ·
 *     끊김 · 제거가 다른 서버 관찰자에 번지지 않는다.
 *   - 비밀은 **증권사별** 고정 매핑(`secretOf(broker)` — config `observerSecretOf`)에서만 온다. 레지스트리 행에 비밀이
 *     없다(RESEARCH Pitfall 11). 비밀이 없는 증권사의 서버는 그 관찰자만 disabled(소켓 0)다.
 *   - 관찰자에 `expectedBroker` = 행의 증권사를 넘긴다 — 79 broker 가 다르면 주소 오설정으로 정지(Pitfall 12).
 *   - 재생성 중 같은 키의 옛 기록기가 drain 하는 동안 새 관찰자가 커서를 읽을 수 있다. 커서는 적용 RPC 트랜잭션
 *     안에서만 전진하고 DB PK 가 겹친 재생을 흡수하므로 유실 · 중복 투영은 없다(Phase 19 D-12) — 최악은 재생 몇 건이다.
 *
 * 하지 않는 것:
 *   - 비밀을 로그 인자로 넘기지 않는다(관찰자 deps → 코덱에만). 로그는 키 · 주소 · 활성 여부까지다.
 *   - 브라우저 · healthz 결선을 모른다 — `onCreated` 로 index.ts 가 붙인다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { JournalAccess } from "../journal/access.js";
import { createJournalCodec } from "../journal/codec.js";
import { JournalObserver } from "../journal/observer.js";
import { JournalStatus } from "../journal/status.js";
import { createStrategyWriter } from "../journal/strategy-stream.js";
import { JournalWriter } from "../journal/writer.js";
import type { DmaBroker, DmaServerRow } from "./registry.js";

/** 서버 제거 · 재생성 시 기록기 drain 상한(ms) — index.ts 종료 절차의 `JOURNAL_DRAIN_TIMEOUT_MS` 와 같은 눈금이다. */
export const PIPELINE_DRAIN_TIMEOUT_MS = 2_000;

/**
 * 서버 한 대의 관찰자 기록 경로 한 벌.
 *
 *   기록기(`JournalWriter`)  저널 레코드 → `dma_journal_apply` 의 유일한 경로. 적용 행은 `applied` 로 나온다.
 *   전략 기록기(Phase 25)     같은 80 프레임의 전략 이벤트 → `dma_strategy_apply`. 별도 커서 · 별도 트랜잭션.
 *   매핑(`JournalAccess`)    관찰자 로그인 스냅샷 → 메모리 라우팅 + `dma_journal_sync_access`.
 *   관찰자(`JournalObserver`) 게이트웨이 관찰자 소켓 **1개**(사용자 세션과 독립).
 *   상태(`JournalStatus`)    관찰자 상태 + 기록기 관측값 → `journal.state` 프레임 · `/healthz` 한 원천.
 */
export type ServerPipeline = {
  /** 이 벌을 만든 레지스트리 행(사본). 게이트웨이 키 = `server.key`. */
  server: DmaServerRow;
  writer: JournalWriter;
  strategyWriter: ReturnType<typeof createStrategyWriter>;
  access: JournalAccess;
  observer: JournalObserver;
  status: JournalStatus;
  /** 관찰자 비밀이 있었는가(부팅 로그 · healthz 의 enabled 표기용 — 값 자체는 없다). */
  observerEnabled: boolean;
};

/**
 * 서버 한 대의 파이프라인을 만든다(시작하지 않는다). 게이트웨이 키는 레지스트리 키다 — 커서는 로그인 **전에** 읽으므로
 * 로그인 응답의 broker 를 기다릴 수 없다(커서 테이블 PK · 적용 RPC `p_gateway` · 매핑 RPC 공통).
 */
export function createJournalPipeline(deps: {
  supabase: SupabaseClient;
  server: DmaServerRow;
  /** 그 증권사 관찰자 비밀. 없으면 관찰자 disabled. 로그 인자로 넘기지 않는다(T-19-03). */
  secret: string | undefined;
}): ServerPipeline {
  const { supabase } = deps;
  const server = { ...deps.server };
  const gateway = server.key;
  const writer = new JournalWriter({ supabase, gateway });
  const strategyWriter = createStrategyWriter({ supabase, gateway });
  const access = new JournalAccess({ supabase, gateway });
  const observer = new JournalObserver({
    secret: deps.secret,
    gateway,
    host: server.host,
    port: server.port,
    codec: createJournalCodec(),
    writer,
    strategyWriter,
    access,
    expectedBroker: server.broker,
  });
  const status = new JournalStatus({ observer, writer, strategyWriter, access });
  const observerEnabled = deps.secret !== undefined && deps.secret !== "";
  return { server, writer, strategyWriter, access, observer, status, observerEnabled };
}

export type ServerPipelinesDeps = {
  supabase: SupabaseClient;
  /** 증권사 → 관찰자 비밀(config `observerSecretOf`). */
  secretOf: (broker: DmaBroker) => string | undefined;
  /** 생성 직후 · `observer.start()` 전에 부른다 — 결선(applied → fanout 등)을 여기서 붙인다. */
  onCreated?: (p: ServerPipeline) => void;
  /** 제거된 벌의 drain · close 가 끝난 뒤 부른다. */
  onRemoved?: (p: ServerPipeline) => void;
  /** 제거 시 drain 상한(ms). 기본 `PIPELINE_DRAIN_TIMEOUT_MS`. */
  drainTimeoutMs?: number;
};

/** 같은 키를 다시 만들어야 하는가 — 주소 · 증권사(비밀 · broker 대조 원천)가 바뀌었다. */
function needsRebuild(prev: DmaServerRow, next: DmaServerRow): boolean {
  return prev.host !== next.host || prev.port !== next.port || prev.broker !== next.broker;
}

export class ServerPipelines {
  readonly #deps: ServerPipelinesDeps;
  readonly #drainTimeoutMs: number;
  /** 살아 있는 벌(삽입 순). */
  readonly #pipelines = new Map<string, ServerPipeline>();
  /** 제거 중인 벌의 drain → close 진행(종료 절차가 기다린다). */
  readonly #retiring = new Set<Promise<boolean>>();
  #closed = false;

  constructor(deps: ServerPipelinesDeps) {
    this.#deps = deps;
    this.#drainTimeoutMs = deps.drainTimeoutMs ?? PIPELINE_DRAIN_TIMEOUT_MS;
  }

  /**
   * 레지스트리 행 목록을 반영한다. enabled 가 아닌 행은 없는 것과 같다. 바뀐 키 목록을 돌려준다(로그 · 테스트용).
   * 행 순서대로 만든다(레지스트리 정렬 순).
   */
  sync(rows: readonly DmaServerRow[]): { created: string[]; removed: string[] } {
    const created: string[] = [];
    const removed: string[] = [];
    if (this.#closed) return { created, removed };
    const desired = new Map<string, DmaServerRow>();
    for (const r of rows) if (r.enabled) desired.set(r.key, r);

    // 먼저 내린다 — 같은 키 재생성이 옛 벌과 겹치는 구간을 최소로.
    for (const [key, p] of [...this.#pipelines]) {
      const next = desired.get(key);
      if (next !== undefined && !needsRebuild(p.server, next)) {
        // 역할 · 정렬만 바뀌었으면 연결은 그대로 두고 행만 갱신한다.
        p.server = { ...next };
        continue;
      }
      this.#retire(p, next === undefined ? "레지스트리에서 빠지거나 비활성" : "주소 · 증권사 변경 — 재생성");
      removed.push(key);
    }
    for (const [key, row] of desired) {
      if (this.#pipelines.has(key)) continue;
      const p = createJournalPipeline({ supabase: this.#deps.supabase, server: row, secret: this.#deps.secretOf(row.broker) });
      this.#pipelines.set(key, p);
      this.#deps.onCreated?.(p);
      p.observer.start();
      logger.info(
        { gateway: key, broker: row.broker, host: row.host, port: row.port, observer: p.observerEnabled ? "enabled" : "disabled" },
        "[registry] 서버 관찰자 파이프라인 시작",
      );
      created.push(key);
    }
    return { created, removed };
  }

  get(key: string): ServerPipeline | undefined {
    return this.#pipelines.get(key);
  }

  /** 살아 있는 벌(생성 순). */
  all(): ServerPipeline[] {
    return [...this.#pipelines.values()];
  }

  /** 종료 절차 ④ — 전 관찰자 정지(새 배치를 받지 않는다). 이후 sync 는 아무것도 하지 않는다. */
  stopAll(): void {
    this.#closed = true;
    for (const p of this.#pipelines.values()) p.observer.stop();
  }

  /**
   * 종료 절차 ⑤ — 살아 있는 벌의 두 기록기를 병렬 drain(각 상한 `timeoutMs`) + 제거 중인 벌의 drain 완료를 기다린다.
   * 못 끝낸 서버 키를 돌려준다. 못 끝내도 유실은 없다 — 커서가 적용 RPC 안에서만 전진한다(Phase 19 D-12).
   */
  async drainAll(timeoutMs: number): Promise<string[]> {
    const live = [...this.#pipelines.values()];
    const [drained] = await Promise.all([
      Promise.all(live.map((p) => drainPipeline(p, timeoutMs))),
      Promise.all([...this.#retiring]),
    ]);
    return live.filter((_, i) => !drained[i]).map((p) => p.server.key);
  }

  /** 종료 절차 ⑤ 뒤 — 살아 있는 벌의 기록기 · 매핑 · 상태를 닫는다. */
  closeAll(): void {
    this.#closed = true;
    for (const p of this.#pipelines.values()) closePipeline(p);
    this.#pipelines.clear();
  }

  #retire(p: ServerPipeline, reason: string): void {
    const key = p.server.key;
    this.#pipelines.delete(key);
    p.observer.stop();
    logger.info({ gateway: key, reason }, "[registry] 서버 관찰자 파이프라인 정지");
    const done = drainPipeline(p, this.#drainTimeoutMs).then((ok) => {
      if (!ok) {
        logger.warn(
          { gateway: key, timeoutMs: this.#drainTimeoutMs },
          "[registry] 제거한 서버 기록기 drain 미완 — 다시 켜지면 커서부터 재생",
        );
      }
      closePipeline(p);
      this.#deps.onRemoved?.(p);
      return ok;
    });
    this.#retiring.add(done);
    void done.finally(() => this.#retiring.delete(done));
  }
}

/** 두 기록기(주문 · 전략)를 함께 drain — 둘 다 끝나야 그 서버가 drain 된 것이다. */
async function drainPipeline(p: ServerPipeline, timeoutMs: number): Promise<boolean> {
  const [journal, strategy] = await Promise.all([p.writer.drain(timeoutMs), p.strategyWriter.drain(timeoutMs)]);
  return journal && strategy;
}

function closePipeline(p: ServerPipeline): void {
  p.writer.close();
  p.strategyWriter.close();
  p.access.close();
  p.status.close();
}
