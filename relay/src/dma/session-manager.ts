/**
 * Phase 15 Plan 03 — RELAY-01. 사용자별 DMA 세션 수명 관리 (참조계수 + 유예 소멸).
 *
 * `server/src/kiwoom/tokenStore.ts` 의 TTL 캐시 규약을 이식했다 — 재사용/갱신의
 * **사유를 반드시 로그로 남긴다**. 여기서 조용히 재사용하거나 조용히 끊으면,
 * "가끔 새로고침하면 재로그인이 돈다" 같은 증상의 원인을 영원히 못 찾는다 (S-5).
 *
 * 결정 근거:
 *   D-13  키는 **gh-radar `userId`** 다. DMA `user_id` 가 아니다 — 여러 gh-radar 계정이
 *         같은 DMA 계정을 쓰더라도 세션을 섞지 않는다(사용자 간 데이터 교차 금지,
 *         T-15-20). 같은 사용자의 탭 여러 개는 세션 1개를 공유한다.
 *   D-15  wss 첫 인증 연결에서 로그인하고, 그 사용자의 **마지막 wss 가 끊긴 뒤 5분 유예**
 *         후 TCP 를 닫는다. 유예를 두는 이유는 새로고침 왕복(2~3초)마다 DMA 재로그인이
 *         발생하면 게이트웨이 부하와 체감 지연이 커지기 때문이다.
 *   D-19  비밀번호는 `acquire` 인자로 한 번 들어가 `DmaSession` 의 private 필드에만 산다.
 *         이 모듈은 로그에 `userId` 만 남기고 DMA user_id·비밀번호·계좌번호는 남기지 않는다.
 *
 * 하지 않는 것:
 *   - 자격증명을 조회·복호화하지 않는다. 호출자(15-04 wss 인증)가 이미 푼 값을 넘긴다.
 *   - 구독을 소유하지 않는다. 세션이 닫힐 때 구독도 사라지는 것은 Hub 가 `ready`/종료를
 *     보고 처리한다.
 *   - 세션이 없을 때 대신 로그인해 주지 않는다. 주문 라우트는 `get()` 이 비면 409
 *     `SESSION_NOT_READY` 다 (D-15).
 */
import { logger } from "../logger.js";
import { DmaClient } from "./dma-client.js";
import { DmaSession, type DmaSessionCreds } from "./session.js";

/**
 * 마지막 wss 가 끊긴 뒤 DMA 세션을 유지하는 기본 유예(ms) = 5분 (D-15).
 * 운영값은 `config.sessionGraceMs`(env `SESSION_GRACE_MS`)가 덮어쓴다.
 */
export const SESSION_GRACE_MS = 300_000;

/** `acquire` 가 받는 자격증명. `userId` 는 키라서 따로 받는다. */
export type DmaCredentials = {
  /** DMA 게이트웨이 로그인 id. 로그에 남기지 않는다. */
  dmaUserId: string;
  /** 평문 비밀번호. 세션 객체 메모리에만 산다 (D-19). */
  password: string;
};

export type SessionManagerOptions = {
  host: string;
  port: number;
  /** `LoginReq.broker`. 현재는 "KB". */
  broker: string;
  /** 유예(ms). 미지정 시 `SESSION_GRACE_MS`. */
  graceMs?: number;
};

/** `/healthz` 노출용 요약. **식별자를 담지 않는다** — userId·계좌번호 모두 제외다. */
export type SessionStats = {
  sessionCount: number;
  readyCount: number;
};

type Entry = {
  session: DmaSession;
  /** 이 사용자의 살아 있는 wss 소켓 수. */
  refCount: number;
  /** 참조계수가 0 이 된 뒤의 소멸 예약. 재연결이 오면 취소한다. */
  graceTimer: NodeJS.Timeout | null;
};

/**
 * 로그인 거부 계열은 **재생성하지 않는다.** 브라우저가 초 단위로 재접속하는 상황에서
 * 세션을 새로 만들면 백오프마다 같은 거부를 되풀이해 KB 계정이 잠긴다 (T-15-10, D-16).
 * 사용자가 자격증명을 고치기 전에는 같은 결과이므로 죽은 세션을 그대로 돌려주고,
 * 상태 프레임이 이유를 설명한다.
 */
const NO_RETRY_STATES: ReadonlySet<string> = new Set(["session_rejected", "unauthorized"]);

/**
 * 회선 문제로 죽은 세션. **새 사용자 접속(참조계수 0 → 1)에서만** 다시 세운다 —
 * 사용자가 새로고침했는데 영원히 "회선 단절"만 보는 막다른 길을 막는다.
 */
const RETRYABLE_DEAD_STATES: ReadonlySet<string> = new Set(["failed", "manual_required"]);

export class SessionManager {
  readonly #sessions = new Map<string, Entry>();
  readonly #host: string;
  readonly #port: number;
  readonly #broker: string;
  readonly #graceMs: number;

  constructor(opts: SessionManagerOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#broker = opts.broker;
    this.#graceMs = opts.graceMs ?? SESSION_GRACE_MS;
  }

  /**
   * 사용자의 세션을 얻고 참조계수를 1 올린다. wss 인증 성공 직후에 부른다.
   *
   * 세션이 없으면 만들어 `start()` 까지 하고, 유예 타이머가 걸려 있으면 **취소하고 같은
   * 세션을 재사용**한다(D-15 — 새로고침 왕복 흡수).
   */
  acquire(userId: string, creds: DmaCredentials): DmaSession {
    const existing = this.#sessions.get(userId);

    if (existing !== undefined) {
      const state = existing.session.state;

      if (existing.graceTimer !== null) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
        logger.info({ userId, state }, "[DMA] 유예 중 재연결 — 소멸 예약 취소, 세션 재사용");
      }

      if (existing.refCount === 0 && RETRYABLE_DEAD_STATES.has(state)) {
        // 회선 문제로 죽은 세션이고 새 사용자 접속이다 — 여기서만 다시 세운다.
        logger.info({ userId, state }, "[DMA] 죽은 세션 폐기 후 재생성 (회선 실패 복구 경로)");
        existing.session.close();
        this.#sessions.delete(userId);
        return this.#create(userId, creds);
      }

      existing.refCount += 1;
      if (NO_RETRY_STATES.has(state)) {
        logger.warn(
          { userId, state, refCount: existing.refCount },
          "[DMA] 로그인 거부 세션 재사용 — 재로그인하지 않는다 (자격증명 수정 필요)",
        );
      } else {
        logger.info(
          { userId, state, refCount: existing.refCount },
          "[DMA] 살아 있는 세션 재사용 (같은 사용자의 추가 탭)",
        );
      }
      return existing.session;
    }

    return this.#create(userId, creds);
  }

  /**
   * 참조계수를 1 내린다. wss 소켓이 닫힐 때 부른다.
   * 0 이 되면 소멸을 예약할 뿐 즉시 끊지 않는다 (D-15).
   */
  release(userId: string): void {
    const entry = this.#sessions.get(userId);
    if (entry === undefined) {
      // 이미 사라진 세션에 대한 release 는 정상 경합이다(유예 만료 직후 소켓 close 등).
      logger.warn({ userId }, "[DMA] 세션 없는 release — 무시");
      return;
    }

    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount > 0) {
      logger.info(
        { userId, refCount: entry.refCount },
        "[DMA] wss 소켓 1개 종료 — 남은 탭이 있어 세션 유지",
      );
      return;
    }

    if (entry.graceTimer !== null) clearTimeout(entry.graceTimer);
    entry.graceTimer = setTimeout(() => {
      entry.graceTimer = null;
      // 유예 중 재연결이 왔다면 타이머가 이미 취소됐다. 여기 왔다는 것은 아무도 안 왔다는 뜻이다.
      this.#sessions.delete(userId);
      entry.session.close();
      logger.info(
        { userId, graceMs: this.#graceMs, sessionCount: this.#sessions.size },
        "[DMA] 유예 만료 — DMA 세션 종료",
      );
    }, this.#graceMs);

    logger.info(
      { userId, graceMs: this.#graceMs },
      "[DMA] 마지막 wss 종료 — 유예 후 소멸 예약 (새로고침 왕복 흡수)",
    );
  }

  /**
   * 참조계수를 건드리지 않고 조회한다. 주문 라우트가 "활성 Ready 세션이 있는가"를
   * 물을 때 쓴다 — 없으면 409 `SESSION_NOT_READY` 다 (D-15).
   */
  get(userId: string): DmaSession | undefined {
    return this.#sessions.get(userId)?.session;
  }

  /** 프로세스 graceful shutdown 용. 15-05 의 `index.ts` 가 부른다. */
  async closeAll(): Promise<void> {
    const count = this.#sessions.size;
    for (const [userId, entry] of this.#sessions) {
      if (entry.graceTimer !== null) {
        clearTimeout(entry.graceTimer);
        entry.graceTimer = null;
      }
      entry.session.close();
      logger.info({ userId }, "[DMA] 종료 절차 — 세션 정리");
    }
    this.#sessions.clear();
    logger.info({ count }, "[DMA] 전 세션 종료 완료");
    await Promise.resolve();
  }

  /** `/healthz` 용 요약. 식별자(userId·DMA user_id·계좌번호)를 담지 않는다. */
  stats(): SessionStats {
    let readyCount = 0;
    for (const entry of this.#sessions.values()) {
      if (entry.session.isReady) readyCount += 1;
    }
    return { sessionCount: this.#sessions.size, readyCount };
  }

  #create(userId: string, creds: DmaCredentials): DmaSession {
    const client = new DmaClient({ host: this.#host, port: this.#port });
    const sessionCreds: DmaSessionCreds = {
      userId,
      dmaUserId: creds.dmaUserId,
      password: creds.password,
      broker: this.#broker,
    };
    const session = new DmaSession(sessionCreds, client);
    this.#sessions.set(userId, { session, refCount: 1, graceTimer: null });

    // 로그 인자에 dmaUserId·password 를 넣지 않는다 (D-19).
    logger.info(
      { userId, host: this.#host, port: this.#port, sessionCount: this.#sessions.size },
      "[DMA] 세션 없음 — 새 DMA 세션 생성",
    );
    session.start();
    return session;
  }
}
