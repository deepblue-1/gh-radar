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

/**
 * 「생성된 지 이만큼 지나도록 **한 번도** Ready 가 아니면 게이트웨이가 응답하지 않는
 * 것으로 본다」의 상한(ms) = 5분 (16-30 / GC-WR-07).
 *
 * 이 유예 **안에서는** never-Ready 가 정상이다 — TCP 연결 + LoginReq 왕복 + 계좌 선언은
 * 즉시 끝나지 않고, 부팅 직후·재배포 직후에는 붙은 세션 전부가 잠시 never-Ready 다.
 * 그 구간을 장애로 보고하면 재배포마다 알림이 울리고, 상시 적색은 곧 알림 무시다.
 *
 * 그 시간을 **넘긴** never-Ready 는 다르다. 정상 왕복의 수백 배가 지나도록 Ready 를
 * 못 봤다는 뜻이고, 이는 16-21 이 「게이트웨이 부재」로 면제해 준 상태와 실제 장애를
 * 가르는 유일한 시간축이다 (`hasBeenReady` 래치는 프로세스 재시작으로 사라지므로
 * `everReadyCount` 만으로는 못 가른다).
 *
 * 눈금을 `SESSION_GRACE_MS` 와 같은 5분으로 맞춘 근거: 두 값 모두 「사람의 왕복(새로고침·
 * 로그인)이 끝나기를 기다려 주는 시간」이라 같은 자릿수여야 운영자가 두 상수를 따로
 * 기억하지 않아도 된다. env 로 덮지 않는다 — 판정 임계를 배포 환경마다 달리 두면
 * uptime 알림의 의미가 환경별로 갈라진다.
 */
export const STALE_SESSION_MS = 300_000;

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
  /**
   * 벽시계 주입구. 미지정 시 `Date.now`.
   *
   * `stalledCount` 는 **경과 시간**이 판정 기준이라 테스트가 시계를 제어할 수 있어야
   * 한다. 기존 테스트는 `vi.useFakeTimers({ toFake: ["setTimeout", ...] })` 로 타이머만
   * 가짜로 쓰고 `Date.now` 는 진짜를 쓴다 — 그래서 타이머가 아니라 이 주입구로 연다.
   */
  now?: () => number;
};

/** `/healthz` 노출용 요약. **식별자를 담지 않는다** — userId·계좌번호 모두 제외다. */
export type SessionStats = {
  sessionCount: number;
  readyCount: number;
  /**
   * `hasBeenReady === true` 인 세션 수. `readyCount`(**지금** Ready) 와 다르다 —
   * Ready 였다가 죽은 세션도 여기 세어진다.
   *
   * optional 이 아니다. 필수 필드여야 소비자·테스트가 컴파일 단계에서 갱신을 강제받는다.
   */
  everReadyCount: number;
  /**
   * 생성된 지 `STALE_SESSION_MS` 가 지나도록 **한 번도** Ready 가 아닌 세션 수.
   * `everReadyCount === 0` 인 상태를 「게이트웨이 부재(정상)」와 「게이트웨이 장애」로
   * 가르는 시간축이다 (16-30 / GC-WR-07).
   *
   * **단, 사유를 본다.** 이 카운터가 답하는 질문은 「**게이트웨이가 붙지 못하고 있는가**」
   * 이지 「Ready 가 아닌 세션이 있는가」가 아니다. 그래서 `NO_RETRY_STATES`(자격증명 거부
   * 계열 = **사용자 원인**) 세션은 시간이 아무리 흘러도 세지 않는다 (16-37 / R2-CR-02).
   *
   * 사유를 보지 않으면 **영구 적색**이 된다. `session_rejected` 세션은 `acquire` 가
   * 재생성하지 않고(T-15-10 / D-16 — 재로그인을 되풀이하면 KB 계정이 잠긴다), 탭이 열려
   * 있는 한 `refCount > 0` 이라 유예 소멸 타이머조차 걸리지 않아 **무기한** 남는다. 그러면
   * 사용자 한 명의 잘못된 DMA 비밀번호가 relay 전체의 `/healthz` 를 영원히 503 으로 만든다.
   *
   * 16-30 이 스스로 적어 둔 근거(「상시 적색은 곧 알림 무시다. 그러면 진짜 장애도 함께
   * 놓친다」)는 **이 방향으로도 그대로 성립한다.** 거부된 세션의 사유는 `/healthz` 가
   * 아니라 **그 사용자의 상태 프레임**이 직접 말한다 — 전역 건강 신호가 대신 말할 일이
   * 아니다.
   *
   * `everReadyCount` 와 같은 규율로 **optional 이 아니다** — 필수 필드여야 소비자·테스트가
   * 컴파일 단계에서 갱신을 강제받는다.
   */
  stalledCount: number;
};

type Entry = {
  session: DmaSession;
  /** 이 사용자의 살아 있는 wss 소켓 수. */
  refCount: number;
  /** 참조계수가 0 이 된 뒤의 소멸 예약. 재연결이 오면 취소한다. */
  graceTimer: NodeJS.Timeout | null;
  /**
   * 이 엔트리를 만든 시각(ms). `stalledCount` 의 기준점이다.
   *
   * **세션 인스턴스가 아니라 매니저 엔트리에 둔다.** `DmaSession` 은 `hasBeenReady`
   * 래치의 주인이고 그 래치의 의미는 「이 세션이 Ready 를 본 적 있는가」 하나뿐이다.
   * 거기에 수명 시각을 얹으면 `session.ts` 가 「부재 vs 장애」 판정까지 아는 모듈이 되어
   * 래치의 의미가 흐려진다 (T-16-26 — 래치를 건드리지 않는다).
   */
  createdAt: number;
};

/**
 * 로그인 거부 계열은 **재생성하지 않는다.** 브라우저가 초 단위로 재접속하는 상황에서
 * 세션을 새로 만들면 백오프마다 같은 거부를 되풀이해 KB 계정이 잠긴다 (T-15-10, D-16).
 * 사용자가 자격증명을 고치기 전에는 같은 결과이므로 죽은 세션을 그대로 돌려주고,
 * 상태 프레임이 이유를 설명한다.
 *
 * ★ 2026-09-09 (16-37 / R2-CR-02) — 이 집합은 「재로그인해도 결과가 같은 **사용자 원인**」
 * 의 정의이기도 하다. 그래서 `/healthz` 의 게이트웨이 판정축(`stats().stalledCount`)도
 * **같은 집합**을 쓴다. 목록을 두 벌로 만들지 않는다 — 갈리는 순간 「이 세션을 재로그인할
 * 것인가」와 「이 세션이 서비스 장애인가」가 서로 다른 목록을 근거로 삼게 되고, 그때
 * 한쪽이 다른 쪽을 조용히 배신한다.
 *
 * 이 집합을 그 판정에 써도 되는 근거(`session.ts` 실측):
 *   - `session_rejected` 로 들어가는 경로는 `#failNoRetry` 둘뿐이다 —
 *     ① `LoginResp.success === false`(자격증명 거부) ② `LoginResp.accounts.length === 0`
 *     (그 DMA 계정에 등록된 계좌 0건, `NO_ACCOUNTS_MESSAGE`). **둘 다 그 사용자 한 명의
 *     등록 상태**이고, 그 시점 게이트웨이는 정상으로 응답하고 있다.
 *   - `unauthorized` 는 세션이 스스로 들어가는 상태가 아니다 — `dma_credentials` 미등록은
 *     wss 계층이 세션 생성 **전에** 판정한다. D-38 규율(상태를 나중에 추가하지 않는다)로
 *     선언만 되어 있으므로 여기 포함해도 판정이 넓어지지 않는다.
 *   - 게이트웨이가 죽었을 때의 상태는 `connecting`·`reconnecting`·`logging_in`·`failed` 로
 *     **이 집합 밖**이다. 그래서 16-30 이 GC-WR-07 로 얻은 것(재시작 후 영원한 초록 금지)
 *     이 이 제외로 깨지지 않는다.
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
  readonly #now: () => number;

  constructor(opts: SessionManagerOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#broker = opts.broker;
    this.#graceMs = opts.graceMs ?? SESSION_GRACE_MS;
    this.#now = opts.now ?? (() => Date.now());
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
    let everReadyCount = 0;
    let stalledCount = 0;
    const now = this.#now();
    for (const entry of this.#sessions.values()) {
      if (entry.session.isReady) readyCount += 1;
      // 래치다 — 지금 Ready 가 아니어도 한 번이라도 Ready 였으면 센다 (16-21).
      if (entry.session.hasBeenReady) everReadyCount += 1;
      // 한 번이라도 Ready 였던 세션은 여기서 세지 않는다 — 그쪽은 `everReadyCount` 가
      // 이미 잡고 있고, 이 카운터는 **래치가 비어 있는 상태**만 시간으로 가른다 (16-30).
      // 그리고 그 안에서도 **게이트웨이가 원인일 수 있는 상태**만 센다 — 자격증명 거부
      // 계열은 사용자 원인이고 무기한 남으므로 세면 영구 적색이다 (16-37 / R2-CR-02).
      // 판정은 **세션 단위**다. 거부 세션 1개가 옆의 진짜 미Ready 세션을 가리지 않는다.
      else if (
        now - entry.createdAt > STALE_SESSION_MS &&
        !NO_RETRY_STATES.has(entry.session.state)
      ) {
        stalledCount += 1;
      }
    }
    return {
      sessionCount: this.#sessions.size,
      readyCount,
      everReadyCount,
      stalledCount,
    };
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
    this.#sessions.set(userId, {
      session,
      refCount: 1,
      graceTimer: null,
      createdAt: this.#now(),
    });

    // 로그 인자에 dmaUserId·password 를 넣지 않는다 (D-19).
    logger.info(
      { userId, host: this.#host, port: this.#port, sessionCount: this.#sessions.size },
      "[DMA] 세션 없음 — 새 DMA 세션 생성",
    );
    session.start();
    return session;
  }
}
