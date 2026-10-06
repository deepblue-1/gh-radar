/**
 * Phase 29 Plan 14 — ADMIN-05. 87(`AdminUsersSnapshot`) 적재 (`AdminSnapshotSink`).
 *
 * 서버가 보낸 87 하나 = 그 서버 users.toml **전체**다. relay 는 그것을 두 곳에 넣는다(D-05 · RESEARCH Pattern 4):
 *   (a) 그 서버 파이프라인의 `JournalAccess.replace` — 메모리 푸시 라우팅(동기 · 즉시 유효) + `dma_journal_sync_access`
 *       (REST 가시성 · access.ts 가 재시도). Admin 이 계좌를 더하면 그 계좌의 주문 행이 **관찰자 재로그인 없이** 푸시된다.
 *   (b) RPC `dma_admin_apply_snapshot(p_server, p_users_rev, p_users)` — 서버별 반영 상태 표(Admin 화면 반영 칩 원천 · 29-05).
 * 그리고 `applied { serverKey, snapshot }` 이벤트를 낸다 — 열린 세션 반영(계좌 자가 선언 · 새 증권사 세션)은 29-21 몫이다.
 *
 * 결정 근거:
 *   D-05        「DB = 의도 · 87 = 반영 상태」. 87 은 서버 정본이라 통째 교체한다(부분 병합 없음).
 *   Pitfall 4   매핑 원천이 둘이다 — 79(관찰자 로그인 · 접속 때) · 87(admin 연결 · 변경 때). 둘 다 같은 users.toml 의
 *               평탄화이고 **나중 것이 이긴다**(`JournalAccess.replace` 가 통째 교체). 유효 행 0 스냅샷 거부 규율은 access 몫이다.
 *   users_rev   서버 메모리 카운터라 **재기동 시 1 로 돌아간다**(gh-trade D-06) — DB · 메모리 어디서도 최신성 비교 키로 쓰지
 *               않는다. RPC 에는 저장용으로만 넘긴다. 최신 판정은 연결 세대(`generation`)로 한다.
 *   세대 가드   서버마다 마지막으로 받은 연결 세대를 쥔다. 그보다 **옛 세대**의 늦은 87 은 버린다(debug). 같은 세대 안에서는
 *               도착 순서대로 모두 적용한다(나중 것이 이긴다). 재접속마다 `AdminConn` 이 op 5 로 받은 87 이 통째 교체하므로 rev 가
 *               줄어도(재기동) 버리지 않는다. 파이프라인이 재생성되면 새 `DmaClient` 세대가 1 부터 다시 세므로 index.ts 가
 *               `resetGeneration(serverKey)` 로 눈금을 지운다.
 *   DB 재시도   서버별 **최신 1건**만 대기시킨다. RPC 가 실패하면 `journalRetryDelayMs`(access.ts `#sync` 규율 — 기본 1s → 2s → 4s …
 *               상한 30s) 뒤 재시도하고, 그 사이 새 87 이 오면 대기 1건을 갈아 끼워 최신 것만 보낸다. 메모리 라우팅은 이미 유효하다.
 *               한 서버의 실패 · 재시도는 다른 서버 적재를 막지 않는다(서버별 상태).
 *   빈 스냅샷   유저 0명(또는 유효 계좌 0) 87 도 RPC 는 보낸다 — 반영 상태 「비었다」 가 사실이다. 매핑 교체는 access 의 WR-04
 *               규율대로 거부된다(빈 매핑으로 라우팅을 지우지 않는다) — warn 1 로 드러낸다.
 *   빈 식별자   RPC 는 빈 userId · accountNo 가 하나라도 있으면 교체 전체를 거부한다 — 그대로 보내면 영구 재시도에 갇힌다. 그
 *               항목만 빼고 계수를 warn 한다(access.ts 빈 식별자 규율과 같다).
 *   Pitfall 7   계좌번호는 서버 정규화값 그대로 — 재정규화하지 않는다(access.ts 와 같은 키).
 *   T-19-14     로그에는 serverKey · 유저 수 · 계좌 수 · rev 만 싣는다. dmaUserId · 계좌번호는 싣지 않는다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";

import { backoffDelayMs, RECONNECT_MAX_DELAY_MS } from "../dma/dma-client.js";
import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import type { JournalAccess } from "../journal/access.js";
import { journalRetryDelayMs } from "../journal/writer.js";
import type { ObserverAccountRow } from "../journal/types.js";
import type { AdminUsersSnapshot } from "./types.js";

export type AdminSnapshotSinkDeps = {
  /** 서비스롤 클라이언트 — `dma_admin_apply_snapshot` 의 EXECUTE 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 서버 키 → 그 서버 파이프라인의 매핑. 파이프라인이 없으면 undefined(그때는 DB 반영 상태만 적재한다). */
  accessOf: (serverKey: string) => JournalAccess | undefined;
  /** 첫 재시도 지연(ms). 기본 `backoffDelayMs(1)` — dma-client 정본(access.ts 와 같다). */
  retryBaseMs?: number;
  /** 재시도 지연 상한(ms). 기본 `RECONNECT_MAX_DELAY_MS`. */
  retryMaxMs?: number;
};

/** `onSnapshot` 입력 — `AdminConn` "snapshot" 이벤트 페이로드와 같은 모양(serverKey 는 별도 인자). */
export type AdminSnapshotInput = { generation: number; snapshot: AdminUsersSnapshot };

/** "applied" 이벤트 페이로드 — 87 을 메모리 매핑에 적용한 직후 1회(DB 반영 완료를 기다리지 않는다). */
export type AdminSnapshotAppliedEvent = { serverKey: string; snapshot: AdminUsersSnapshot };

/** `p_users` 원소 — shared `AdminUsersRaw` 의 camelCase 계약(29-05 jsonb 키) 그대로. */
type ApplyUser = {
  userId: string;
  accounts: Array<{ accountNo: string; name: string; branchNo: string; traderId: string; priority: number }>;
};

/** DB 로 보낼 1건(서버별 최신만 대기). */
type ApplyPayload = { usersRev: bigint; users: ApplyUser[] };

/** 서버별 적재 상태. */
type ServerState = {
  /** 마지막으로 받아들인 연결 세대. 0 = 아직 없음(DmaClient 세대는 1 부터). */
  generation: number;
  /** DB 로 보낼 최신 87. 보냈거나 보낼 것이 없으면 null. */
  pending: ApplyPayload | null;
  inFlight: boolean;
  retryTimer: NodeJS.Timeout | null;
  failures: number;
};

/** 87 → `ObserverAccountRow[]`(79 매핑 행과 같은 모양). 평탄화만 한다 — 순서 · 값 그대로(재정규화 없음). */
export function flattenSnapshot(snapshot: AdminUsersSnapshot): ObserverAccountRow[] {
  const rows: ObserverAccountRow[] = [];
  for (const user of snapshot.users) {
    for (const a of user.accounts) {
      rows.push({ dmaUserId: user.userId, accountNo: a.accountNo, name: a.name, priority: a.priority });
    }
  }
  return rows;
}

/**
 * `p_users_rev`(bigint) 직렬화 — JSON 안전 범위면 number, 넘으면 문자열(PostgREST 가 bigint 로 받는다). 저장용일 뿐 비교하지 않는다.
 */
function usersRevParam(rev: bigint): number | string {
  return rev <= BigInt(Number.MAX_SAFE_INTEGER) && rev >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(rev) : rev.toString();
}

/** 87 → `p_users`. 빈 userId 유저 · 빈 accountNo 계좌는 뺀다(RPC 전체 거부 회피) — 뺀 계수를 함께 돌려준다. */
function toApplyUsers(snapshot: AdminUsersSnapshot): { users: ApplyUser[]; droppedUsers: number; droppedAccounts: number } {
  const users: ApplyUser[] = [];
  let droppedUsers = 0;
  let droppedAccounts = 0;
  for (const u of snapshot.users) {
    if (u.userId === "") {
      droppedUsers += 1;
      continue;
    }
    const accounts: ApplyUser["accounts"] = [];
    for (const a of u.accounts) {
      if (a.accountNo === "") {
        droppedAccounts += 1;
        continue;
      }
      accounts.push({ accountNo: a.accountNo, name: a.name, branchNo: a.branchNo, traderId: a.traderId, priority: a.priority });
    }
    users.push({ userId: u.userId, accounts });
  }
  return { users, droppedUsers, droppedAccounts };
}

export interface AdminSnapshotSink {
  on(event: "applied", listener: (e: AdminSnapshotAppliedEvent) => void): this;
  off(event: "applied", listener: (e: AdminSnapshotAppliedEvent) => void): this;
  emit(event: "applied", e: AdminSnapshotAppliedEvent): boolean;
}

export class AdminSnapshotSink extends EventEmitter {
  readonly #supabase: SupabaseClient;
  readonly #accessOf: (serverKey: string) => JournalAccess | undefined;
  readonly #retryBaseMs: number;
  readonly #retryMaxMs: number;
  readonly #servers = new Map<string, ServerState>();
  #closed = false;

  constructor(deps: AdminSnapshotSinkDeps) {
    super();
    this.#supabase = deps.supabase;
    this.#accessOf = deps.accessOf;
    this.#retryBaseMs = deps.retryBaseMs ?? backoffDelayMs(1);
    this.#retryMaxMs = deps.retryMaxMs ?? RECONNECT_MAX_DELAY_MS;
  }

  /**
   * 87 1건 적재 — 세대 가드 → 메모리 매핑 교체(동기) → 반영 상태 RPC 예약(비동기 · 최신만) → "applied".
   * 수신 콜백(동기)에서 부른다 — await 금지.
   */
  onSnapshot(serverKey: string, input: AdminSnapshotInput): void {
    if (this.#closed) return;
    const { generation, snapshot } = input;
    const st = this.#state(serverKey);
    if (generation < st.generation) {
      logger.debug(
        { serverKey, generation, latestGeneration: st.generation },
        "[ADMIN] 옛 세대의 늦은 87 — 버린다(재접속 op 5 의 87 이 정본)",
      );
      return;
    }
    st.generation = generation;

    const rows = flattenSnapshot(snapshot);
    this.#accessOf(serverKey)?.replace(rows);
    const { users, droppedUsers, droppedAccounts } = toApplyUsers(snapshot);
    if (droppedUsers > 0 || droppedAccounts > 0) {
      logger.warn(
        { serverKey, droppedUsers, droppedAccounts },
        "[ADMIN] 87 에 빈 식별자 항목 — 반영 상태 적재에서 뺀다",
      );
    }
    if (rows.length === 0) {
      logger.warn(
        { serverKey, usersRev: snapshot.usersRev.toString(), users: snapshot.users.length },
        "[ADMIN] 유효 계좌 0 인 87 — 반영 상태는 비우고 라우팅 매핑은 유지(빈 스냅샷 거부)",
      );
    }
    // 대기 1건을 통째 갈아 끼운다 — 재시도 사이에 와도 최신 것만 나간다.
    st.pending = { usersRev: snapshot.usersRev, users };
    logger.info(
      { serverKey, generation, usersRev: snapshot.usersRev.toString(), users: snapshot.users.length, accounts: rows.length },
      "[ADMIN] 87 적재 — 서버 매핑 교체 · 반영 상태 DB 예약",
    );
    this.#kick(serverKey, st);
    this.emit("applied", { serverKey, snapshot });
  }

  /**
   * 그 서버의 세대 눈금을 지운다 — 파이프라인 재생성(새 `AdminConn` · 새 `DmaClient`)은 세대를 1 부터 다시 센다. 대기 중 DB
   * 적재는 그대로 둔다(새 연결의 87 이 오면 갈아 끼운다). index.ts `wirePipeline` 이 부른다.
   */
  resetGeneration(serverKey: string): void {
    const st = this.#servers.get(serverKey);
    if (st !== undefined) st.generation = 0;
  }

  /**
   * 그 서버 상태를 버린다 — 레지스트리에서 빠진 서버의 대기 재시도 · 타이머를 지운다(FK 로 영구 실패하지 않게). 진행 중 RPC 는
   * 끝까지 가지만 이후 재시도는 없다.
   */
  forget(serverKey: string): void {
    const st = this.#servers.get(serverKey);
    if (st === undefined) return;
    if (st.retryTimer !== null) clearTimeout(st.retryTimer);
    st.retryTimer = null;
    st.pending = null;
    this.#servers.delete(serverKey);
  }

  /** 이후 87 을 받지 않고 재시도 타이머를 모두 지운다. 진행 중 RPC 는 끝까지 가지만 이후 재시도는 없다. 여러 번 불러도 된다. */
  close(): void {
    this.#closed = true;
    for (const st of this.#servers.values()) {
      if (st.retryTimer !== null) clearTimeout(st.retryTimer);
      st.retryTimer = null;
    }
  }

  #state(serverKey: string): ServerState {
    let st = this.#servers.get(serverKey);
    if (st === undefined) {
      st = { generation: 0, pending: null, inFlight: false, retryTimer: null, failures: 0 };
      this.#servers.set(serverKey, st);
    }
    return st;
  }

  #kick(serverKey: string, st: ServerState): void {
    if (this.#closed || st.inFlight || st.retryTimer !== null || st.pending === null) return;
    void this.#apply(serverKey, st);
  }

  async #apply(serverKey: string, st: ServerState): Promise<void> {
    const payload = st.pending;
    if (payload === null) return;
    st.pending = null;
    st.inFlight = true;
    let ok = false;
    try {
      const { error } = await this.#supabase.rpc("dma_admin_apply_snapshot", {
        p_server: serverKey,
        p_users_rev: usersRevParam(payload.usersRev),
        p_users: payload.users,
      });
      if (error) throw error;
      ok = true;
    } catch (err) {
      st.failures += 1;
      logger.error(
        { serverKey, pgError: safePgError(err), users: payload.users.length, attempt: st.failures },
        "[ADMIN] dma_admin_apply_snapshot 실패 — 메모리 라우팅은 유효, 최신만 재시도",
      );
      // 그 사이 새 87 이 오지 않았으면 같은 것을 다시 보낸다.
      if (st.pending === null) st.pending = payload;
    } finally {
      st.inFlight = false;
    }

    if (this.#servers.get(serverKey) !== st) return; // forget 됨
    if (ok) {
      if (st.failures > 0) logger.info({ serverKey, users: payload.users.length }, "[ADMIN] 반영 상태 적재 복구");
      st.failures = 0;
      this.#kick(serverKey, st);
      return;
    }
    if (this.#closed) return;
    const delay = journalRetryDelayMs(st.failures, this.#retryBaseMs, this.#retryMaxMs);
    st.retryTimer = setTimeout(() => {
      st.retryTimer = null;
      this.#kick(serverKey, st);
    }, delay);
    st.retryTimer.unref?.();
  }
}
