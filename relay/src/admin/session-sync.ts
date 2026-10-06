/**
 * Phase 29 Plan 21 — ADMIN-06. 87 → 열린 사용자 세션 반영 (`AdminSessionSync`).
 *
 * 서버가 보낸 87 하나 = 그 서버 users.toml **전체**다(29-14 `AdminSnapshotSink` 가 매핑 · 반영 상태에 넣은 뒤 `applied` 를 낸다).
 * 이 모듈은 그 이벤트를 받아 **그 서버에 로그인해 있는 사용자 세션**을 users.toml 에 맞춘다 — 재로그인 없이:
 *   - 87 에 새로 나타난 그 DMA 유저 계좌 → 그 세션이 `UpdateAccountNoReq(3)` mode "1" 로 자가 선언(`DmaSession.declareAccounts`)
 *     → 응답 대조 → 허용 목록 갱신 → `accounts` 이벤트 → wss 병합 상태 프레임(RESEARCH Pitfall 10 · CONTEXT 확정).
 *
 * 결정 근거:
 *   세션 고르기  (유저, 서버) 세션 중 **그 서버 키** 세션만 본다(`sessionsOnServer`). 87 의 유저와는 `isDmaUser` 비교로만
 *              맞춘다 — DMA id 를 세션 밖으로 꺼내지 않는다(D-19 규율).
 *   87 에 없는 유저  손대지 않는다 — DeleteUser 는 dispatcher(op 2 ok → `closeForDmaUser`)가 세션을 끝낸다. 서버 쪽은 54 뒤
 *              연결을 끊고 재로그인을 거부한다(gh-trade-0d 통보).
 *   Ready 아님  선언하지 않는다(세션이 무시한다) — 다음 로그인의 `LoginResp.accounts` 가 같은 users.toml 을 반영한다.
 *   Pitfall 7  계좌번호는 서버 정규화값 그대로 — 재정규화하지 않는다.
 *   T-19-14    로그에는 serverKey · 세션 수 · 선언 수만. dmaUserId · 계좌번호는 싣지 않는다.
 */
import type { RelayAccount } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { DmaSession } from "../dma/session.js";
import type { AdminSnapshotAppliedEvent } from "./snapshot-sink.js";
import type { AdminUsersSnapshot } from "./types.js";

/** `SessionManager` 중 이 모듈이 쓰는 부분만 — 테스트가 스텁을 넣을 수 있게 좁힌다. */
export type SessionSyncSessions = {
  sessionsOnServer(serverKey: string): DmaSession[];
};

export type AdminSessionSyncDeps = {
  sessions: SessionSyncSessions;
};

/** 87 → DMA id → 계좌(이름 포함). 빈 식별자는 뺀다(snapshot-sink 와 같은 규율). */
function accountsByUser(snapshot: AdminUsersSnapshot): Map<string, RelayAccount[]> {
  const out = new Map<string, RelayAccount[]>();
  for (const u of snapshot.users) {
    if (u.userId === "") continue;
    out.set(
      u.userId,
      u.accounts.filter((a) => a.accountNo !== "").map((a) => ({ accountNo: a.accountNo, name: a.name })),
    );
  }
  return out;
}

export class AdminSessionSync {
  readonly #sessions: SessionSyncSessions;

  constructor(deps: AdminSessionSyncDeps) {
    this.#sessions = deps.sessions;
  }

  /**
   * 87 적재 직후(`AdminSnapshotSink` "applied") — 그 서버 세션들을 users.toml 에 맞춘다. 동기 · 예외를 밖으로 던지지 않는다
   * (sink 의 emit 안에서 불린다 — 던지면 적재 경로가 깨진다).
   */
  onApplied(e: AdminSnapshotAppliedEvent): void {
    try {
      this.#apply(e.serverKey, e.snapshot);
    } catch (err) {
      logger.error(
        { serverKey: e.serverKey, reason: err instanceof Error ? err.name : "unknown" },
        "[ADMIN] 87 세션 반영 실패 — 다음 87 · 재로그인이 맞춘다",
      );
    }
  }

  #apply(serverKey: string, snapshot: AdminUsersSnapshot): void {
    const byUser = accountsByUser(snapshot);
    const sessions = this.#sessions.sessionsOnServer(serverKey);
    let declared = 0;
    for (const session of sessions) {
      const accounts = this.#accountsOf(session, byUser);
      if (accounts === undefined) continue; // 87 에 없는 유저 — DeleteUser 경로 몫
      declared += session.declareAccounts(accounts);
    }
    if (declared > 0) {
      logger.info({ serverKey, sessions: sessions.length, declared }, "[ADMIN] 87 → 열린 세션 계좌 자가 선언");
    }
  }

  /** 그 세션이 로그인한 DMA 유저의 87 계좌. 87 에 없으면 undefined. */
  #accountsOf(session: DmaSession, byUser: ReadonlyMap<string, RelayAccount[]>): RelayAccount[] | undefined {
    for (const [dmaUserId, accounts] of byUser) {
      if (session.isDmaUser(dmaUserId)) return accounts;
    }
    return undefined;
  }
}
