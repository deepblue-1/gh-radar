/**
 * Phase 29 Plan 21 — ADMIN-06. 87 → 열린 사용자 세션 반영 (`AdminSessionSync`).
 *
 * 서버가 보낸 87 하나 = 그 서버 users.toml **전체**다(29-14 `AdminSnapshotSink` 가 매핑 · 반영 상태에 넣은 뒤 `applied` 를 낸다).
 * 이 모듈은 그 이벤트를 받아 **그 서버에 로그인해 있는 사용자 세션**을 users.toml 에 맞춘다 — 재로그인 없이:
 *   - 87 에 새로 나타난 그 DMA 유저 계좌 → 그 세션이 `UpdateAccountNoReq(3)` mode "1" 로 자가 선언(`DmaSession.declareAccounts`)
 *     → 응답 대조 → 허용 목록 갱신 → `accounts` 이벤트 → wss 병합 상태 프레임(RESEARCH Pitfall 10 · CONTEXT 확정).
 *   - 87 에서 빠진 계좌 → 그 세션 허용 목록에서 즉시 제외(`removeAllowedAccounts` · fail closed — 주문 · 상따 계좌 대조가 바로 거부).
 *   - 87 에 그 DMA 유저 계좌가 있는데 그 서버 세션을 쥐지 않은 **연결 중 사용자** → `fanout.refreshUserSessions` — 그 서버가
 *     그 증권사 주문 서버이고 `brokersFor` 가 이제 그 증권사를 열라고 하면(교보 매핑 첫 등장) 세션을 acquire 해 결선한다(29-20
 *     규칙 그대로 — fanout 이 판정한다. 여기서는 후보만 고른다).
 *
 * 결정 근거:
 *   세션 고르기  (유저, 서버) 세션 중 **그 서버 키** 세션만 본다(`sessionsOnServer`). 87 의 유저와는 `isDmaUser` 비교로만
 *              맞춘다 — DMA id 를 세션 밖으로 꺼내지 않는다(D-19 규율).
 *   87 에 없는 유저  손대지 않는다 — DeleteUser 는 dispatcher(op 2 ok → `closeForDmaUser`)가 세션을 끝낸다. 서버 쪽은 54 뒤
 *              연결을 끊고 재로그인을 거부한다(gh-trade-0d 통보).
 *   Ready 아님  선언하지 않는다(세션이 무시한다) — 다음 로그인의 `LoginResp.accounts` 가 같은 users.toml 을 반영한다.
 *              제외는 상태와 무관하게 허용 목록에서 뺀다(fail closed).
 *   세션 유지  계좌 변경 · 비밀번호 변경 때문에 열린 세션을 재로그인시키지 않는다(D-08 · 전략 · 미체결 보존). 비밀번호 교체 ·
 *              DeleteUser 세션 종료는 dispatcher 몫(`updatePassword` · `closeForDmaUser`).
 *   순서      sink 는 매핑(`JournalAccess.replace`)을 바꾼 **뒤** `applied` 를 낸다 — 그래서 fanout 의 `brokersFor` 가 갓 바뀐
 *              매핑을 본다.
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

/** `WsFanout` 중 이 모듈이 쓰는 부분만. */
export type SessionSyncFanout = {
  connectedUsers(): Array<{ userId: string; dmaUserId: string; serverKeys: string[] }>;
  refreshUserSessions(userId: string): Promise<number>;
};

export type AdminSessionSyncDeps = {
  sessions: SessionSyncSessions;
  /** 주지 않으면 새 증권사 세션을 열지 않는다(단위 테스트). 운영 결선(index.ts)은 늘 준다. */
  fanout?: SessionSyncFanout;
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
  readonly #fanout: SessionSyncFanout | undefined;

  constructor(deps: AdminSessionSyncDeps) {
    this.#sessions = deps.sessions;
    this.#fanout = deps.fanout;
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
    let removed = 0;
    for (const session of sessions) {
      const accounts = this.#accountsOf(session, byUser);
      if (accounts === undefined) continue; // 87 에 없는 유저 — DeleteUser 경로 몫
      // 제외 먼저(fail closed) — 같은 87 안의 추가와 순서가 섞여도 빠진 계좌가 잠깐이라도 남지 않게.
      const keep = new Set(accounts.map((a) => a.accountNo));
      const gone = session.allowedAccounts.map((a) => a.accountNo).filter((no) => !keep.has(no));
      if (gone.length > 0) removed += session.removeAllowedAccounts(gone);
      declared += session.declareAccounts(accounts);
    }
    if (declared > 0 || removed > 0) {
      logger.info({ serverKey, sessions: sessions.length, declared, removed }, "[ADMIN] 87 → 열린 세션 계좌 반영");
    }
    this.#openNewBrokerSessions(serverKey, byUser);
  }

  /**
   * 87 에 계좌가 있는데 그 서버 세션을 쥐지 않은 연결 중 사용자 → `refreshUserSessions`(fanout 이 `brokersFor` 로 판정 · 빠진
   * 증권사가 없으면 자격증명 조회도 없이 끝난다). 비동기 실패는 로그만 — 다음 87 · 다음 인증이 다시 맞춘다.
   */
  #openNewBrokerSessions(serverKey: string, byUser: ReadonlyMap<string, RelayAccount[]>): void {
    const fanout = this.#fanout;
    if (fanout === undefined) return;
    for (const u of fanout.connectedUsers()) {
      if (u.serverKeys.includes(serverKey)) continue;
      if ((byUser.get(u.dmaUserId)?.length ?? 0) === 0) continue;
      fanout.refreshUserSessions(u.userId).catch((err: unknown) => {
        logger.error(
          { serverKey, userId: u.userId, reason: err instanceof Error ? err.name : "unknown" },
          "[ADMIN] 87 → 새 증권사 세션 열기 실패 — 다음 인증이 연다",
        );
      });
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
