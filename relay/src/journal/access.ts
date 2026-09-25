/**
 * Phase 19 Plan 05 — 저널 계좌 매핑 (`JournalAccess`). DMA 사용자 → 계좌 집합.
 *
 * 원천은 **관찰자 로그인 응답 스냅샷 하나**다(D-06). users.toml 은 핫리로드가 없어 게이트웨이
 * 재시작 = 관찰자 재로그인이므로 로그인 시점 스냅샷이 정본이다. 같은 스냅샷을 두 곳에 쓴다:
 *   1. 메모리 `Map<dmaUserId, Set<accountNo>>` — `WsFanout.deliverJournalRows` 의 푸시 라우팅.
 *      `replace` 가 **동기로** 교체하므로 즉시 유효하다.
 *   2. DB `dma_account_access` — `dma_journal_sync_access` RPC 로 원자 교체. REST 조회
 *      (`dma_journal_orders_for_user`)의 가시성 근거다. 실패해도 1 은 이미 유효하고, 지수 백오프로
 *      재시도한다. 재시도 사이에 `replace` 가 다시 불리면 **최신 스냅샷만** 보낸다.
 *
 * 결정 근거:
 *   Pitfall 7  계좌번호를 재정규화하지 않는다 — 게이트웨이 값 그대로가 키다. 하이픈 하나만 달라져도
 *              DB 의 `account_no` 와 어긋나 행이 아무에게도 안 보인다.
 *   T-19-14    로그에는 행 수만 싣는다. 계좌번호 원문·`dmaUserId` 는 싣지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { backoffDelayMs, RECONNECT_MAX_DELAY_MS } from "../dma/dma-client.js";
import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import { journalRetryDelayMs } from "./writer.js";
import type { JournalAccessView, ObserverAccountRow } from "./types.js";

export type JournalAccessDeps = {
  /** 서비스롤 클라이언트 — `dma_journal_sync_access` 의 EXECUTE 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 게이트웨이 식별자(`p_gateway`). */
  gateway: string;
  /** 첫 재시도 지연(ms). 기본은 `backoffDelayMs(1)` — dma-client 정본. */
  retryBaseMs?: number;
  /** 재시도 지연 상한(ms). 기본 `RECONNECT_MAX_DELAY_MS`. */
  retryMaxMs?: number;
};

type SyncRow = { dma_user_id: string; account_no: string; name: string; priority: number };

export class JournalAccess implements JournalAccessView {
  readonly #supabase: SupabaseClient;
  readonly #gateway: string;
  readonly #retryBaseMs: number;
  readonly #retryMaxMs: number;

  #map = new Map<string, Set<string>>();
  #rows = 0;
  /** DB 로 보낼 최신 스냅샷. 보냈거나 보낼 것이 없으면 null. */
  #pending: SyncRow[] | null = null;
  #inFlight = false;
  #retryTimer: NodeJS.Timeout | null = null;
  #failures = 0;
  #closed = false;

  constructor(deps: JournalAccessDeps) {
    this.#supabase = deps.supabase;
    this.#gateway = deps.gateway;
    this.#retryBaseMs = deps.retryBaseMs ?? backoffDelayMs(1);
    this.#retryMaxMs = deps.retryMaxMs ?? RECONNECT_MAX_DELAY_MS;
  }

  /** 매핑 행 수(빈 식별자 행 제외 후). */
  get size(): number {
    return this.#rows;
  }

  accountsOf(dmaUserId: string): ReadonlySet<string> | undefined {
    return this.#map.get(dmaUserId);
  }

  /**
   * 관찰자 로그인 응답의 매핑 스냅샷으로 **전체를 교체**한다. 메모리 교체는 동기이고 DB 동기화는
   * 비동기로 예약한다.
   *
   * 빈 `dmaUserId`/`accountNo` 행은 버린다(warn · 행 수만) — DB RPC 는 그런 행이 하나라도 있으면
   * 교체 전체를 거부하므로, 그대로 보내면 한 행 때문에 매핑 동기화가 영원히 재시도에 갇힌다.
   */
  replace(rows: readonly ObserverAccountRow[]): void {
    const next = new Map<string, Set<string>>();
    const syncRows: SyncRow[] = [];
    let dropped = 0;
    for (const row of rows) {
      if (row.dmaUserId === "" || row.accountNo === "") {
        dropped += 1;
        continue;
      }
      let set = next.get(row.dmaUserId);
      if (set === undefined) {
        set = new Set<string>();
        next.set(row.dmaUserId, set);
      }
      set.add(row.accountNo);
      syncRows.push({
        dma_user_id: row.dmaUserId,
        account_no: row.accountNo,
        name: row.name,
        priority: row.priority,
      });
    }
    if (dropped > 0) {
      logger.warn({ dropped }, "[journal] 매핑 스냅샷에 빈 식별자 행 — 버린다");
    }
    this.#map = next;
    this.#rows = syncRows.length;
    this.#pending = syncRows;
    logger.info({ rows: syncRows.length, users: next.size }, "[journal] 계좌 매핑 교체");
    this.#kick();
  }

  /** 재시도 타이머를 정리한다. 진행 중 RPC 는 끝까지 가지만 이후 재시도는 없다. */
  close(): void {
    this.#closed = true;
    if (this.#retryTimer !== null) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
  }

  #kick(): void {
    if (this.#closed || this.#inFlight || this.#retryTimer !== null || this.#pending === null) return;
    void this.#sync();
  }

  async #sync(): Promise<void> {
    const rows = this.#pending;
    if (rows === null) return;
    this.#pending = null;
    this.#inFlight = true;
    let ok = false;
    try {
      const { error } = await this.#supabase.rpc("dma_journal_sync_access", {
        p_gateway: this.#gateway,
        p_rows: rows,
      });
      if (error) throw error;
      ok = true;
    } catch (err) {
      this.#failures += 1;
      logger.error(
        { pgError: safePgError(err), rows: rows.length, attempt: this.#failures },
        "[journal] dma_journal_sync_access 실패 — 메모리 라우팅은 유효, 재시도",
      );
      // 그 사이 새 스냅샷이 오지 않았으면 같은 스냅샷을 다시 보낸다.
      if (this.#pending === null) this.#pending = rows;
    } finally {
      this.#inFlight = false;
    }

    if (ok) {
      if (this.#failures > 0) logger.info({ rows: rows.length }, "[journal] 매핑 동기화 복구");
      this.#failures = 0;
      this.#kick();
      return;
    }
    if (this.#closed) return;
    const delay = journalRetryDelayMs(this.#failures, this.#retryBaseMs, this.#retryMaxMs);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.#kick();
    }, delay);
    this.#retryTimer.unref?.();
  }
}
