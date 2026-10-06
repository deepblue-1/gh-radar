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
 *   Pitfall 7   계좌번호는 서버 정규화값 그대로 — 재정규화하지 않는다(access.ts 와 같은 키).
 *   T-19-14     로그에는 serverKey · 유저 수 · 계좌 수 · rev 만 싣는다. dmaUserId · 계좌번호는 싣지 않는다.
 */
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import type { JournalAccess } from "../journal/access.js";
import type { ObserverAccountRow } from "../journal/types.js";
import type { AdminUsersSnapshot } from "./types.js";

export type AdminSnapshotSinkDeps = {
  /** 서비스롤 클라이언트 — `dma_admin_apply_snapshot` 의 EXECUTE 는 service_role 전용이다. */
  supabase: SupabaseClient;
  /** 서버 키 → 그 서버 파이프라인의 매핑. 파이프라인이 없으면 undefined(그때는 DB 반영 상태만 적재한다). */
  accessOf: (serverKey: string) => JournalAccess | undefined;
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

function toApplyUsers(snapshot: AdminUsersSnapshot): ApplyUser[] {
  return snapshot.users.map((u) => ({
    userId: u.userId,
    accounts: u.accounts.map((a) => ({
      accountNo: a.accountNo,
      name: a.name,
      branchNo: a.branchNo,
      traderId: a.traderId,
      priority: a.priority,
    })),
  }));
}

export interface AdminSnapshotSink {
  on(event: "applied", listener: (e: AdminSnapshotAppliedEvent) => void): this;
  off(event: "applied", listener: (e: AdminSnapshotAppliedEvent) => void): this;
  emit(event: "applied", e: AdminSnapshotAppliedEvent): boolean;
}

export class AdminSnapshotSink extends EventEmitter {
  readonly #supabase: SupabaseClient;
  readonly #accessOf: (serverKey: string) => JournalAccess | undefined;
  #closed = false;

  constructor(deps: AdminSnapshotSinkDeps) {
    super();
    this.#supabase = deps.supabase;
    this.#accessOf = deps.accessOf;
  }

  /** 87 1건 적재 — 메모리 매핑 교체(동기) → 반영 상태 RPC(비동기) → "applied". 수신 콜백(동기)에서 부른다 — await 금지. */
  onSnapshot(serverKey: string, input: AdminSnapshotInput): void {
    if (this.#closed) return;
    const { snapshot } = input;
    const rows = flattenSnapshot(snapshot);
    this.#accessOf(serverKey)?.replace(rows);
    logger.info(
      { serverKey, usersRev: snapshot.usersRev.toString(), users: snapshot.users.length, accounts: rows.length },
      "[ADMIN] 87 적재 — 서버 매핑 교체 · 반영 상태 DB 예약",
    );
    void this.#apply(serverKey, snapshot);
    this.emit("applied", { serverKey, snapshot });
  }

  /** 이후 87 을 받지 않는다. 여러 번 불러도 된다. */
  close(): void {
    this.#closed = true;
  }

  async #apply(serverKey: string, snapshot: AdminUsersSnapshot): Promise<void> {
    try {
      const { error } = await this.#supabase.rpc("dma_admin_apply_snapshot", {
        p_server: serverKey,
        p_users_rev: usersRevParam(snapshot.usersRev),
        p_users: toApplyUsers(snapshot),
      });
      if (error) throw error;
    } catch (err) {
      logger.error(
        { serverKey, pgError: safePgError(err), users: snapshot.users.length },
        "[ADMIN] dma_admin_apply_snapshot 실패 — 메모리 라우팅은 유효",
      );
    }
  }
}
