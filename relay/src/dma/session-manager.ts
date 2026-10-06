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
 * Phase 29-16 — 세션 = (유저, 서버) (ADMIN-06 · CONTEXT 「세션 (유저, 서버) 단위」):
 *   키    맵 키는 `${userId}|${serverKey}` 다(`sessionKey`). 서버 키는 레지스트리 키(예 "KB120")이고 증권사 접두라
 *         증권사별로 겹치지 않는다. D-13 의 「gh-radar userId 가 키」는 그대로다 — 서버 축이 하나 붙었을 뿐 DMA id 로
 *         세션을 섞지 않는다.
 *   D-10  **사용자 × 증권사당 세션은 최대 1개.** 그 증권사 세션이 살아 있으면(탭 · 유예 중) 레지스트리의 주문 서버가
 *         바뀌어도 그 세션을 재사용한다 — 새 서버는 그 세션이 끝난 뒤의 다음 acquire 부터다. 증권사 안 주문 서버
 *         선택(`resolveTarget(broker)`)은 **세션을 만들 때만** 읽는다. 색인은 `#byUserBroker`(`${userId}|${broker}` →
 *         세션 키) 하나다 — 주문 서버가 바뀐 뒤에도 옛 서버 세션을 찾아 재사용할 수 있게 서버 키가 아니라 증권사로 찾는다.
 *   D-18  사용자 단위 명령(VI 설정 · 사용자 설정 84 · 세션 상태 표시)의 세션은 `primaryOf` — **KB 세션 우선**, 없으면
 *         처음 만든 세션. 계좌가 있는 명령(주문 · 상따 · 자동매도)은 `forAccount` — 그 계좌가 든 세션.
 *   주문 서버 없음 — `resolveTarget(broker)` 가 undefined 면 세션을 열지 않는다(`acquireFor` → null). 29-03 의 「생성자
 *         게이트웨이 폴백」은 여기서 끝냈다 — db 모드의 생성자 값은 127.0.0.1 이라 폴백은 열리지 않는 세션을 만들 뿐이다.
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

/** `acquireFor` 가 받는 자격증명. `userId` 는 키라서 따로 받는다. */
export type DmaCredentials = {
  /** DMA 게이트웨이 로그인 id. 로그에 남기지 않는다. */
  dmaUserId: string;
  /** 평문 비밀번호. 세션 객체 메모리에만 산다 (D-19). */
  password: string;
};

/**
 * 세션 생성 시점의 연결 대상 (Phase 29 — 서버 레지스트리). index 는 레지스트리의 **그 증권사 주문 서버**를 돌려준다(29-16).
 */
export type SessionTarget = {
  /** 레지스트리 서버 키(로그 문맥). */
  serverKey: string;
  host: string;
  port: number;
  /** `LoginReq.broker`. */
  broker: string;
};

export type SessionManagerOptions = {
  /**
   * `resolveTarget` 을 주지 않을 때(단위 테스트 · 단일 게이트웨이 하네스)의 유일한 대상 — 증권사 `broker` 하나만
   * 연다(서버 키 = broker). `resolveTarget` 을 주면 쓰지 않는다.
   */
  host: string;
  port: number;
  /** `LoginReq.broker`. 위 단일 대상의 증권사. */
  broker: string;
  /**
   * 세션을 **만들 때마다** 그 증권사의 연결 대상을 고른다 (Phase 29 — 레지스트리의 증권사별 주문 서버). 주문 서버가 바뀌어도
   * 열린 세션은 그대로이고 새 세션부터 새 서버다(D-10). undefined(그 증권사 주문 서버 없음)면 세션을 열지 않는다 —
   * `acquireFor` 가 null 을 돌려주고 warn 1줄(29-16).
   */
  resolveTarget?: (broker: string) => SessionTarget | undefined;
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
  /** gh-radar 사용자 id (D-13). `sessionsOf` · `firstReady` 의 사용자 축. */
  userId: string;
  /** 레지스트리 서버 키. */
  serverKey: string;
  /** `LoginReq.broker` — 사용자 × 증권사당 1세션(D-10) 색인의 축. */
  broker: string;
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

/** 세션 맵 키 — `${userId}|${serverKey}` (Phase 29-16). userId 는 uuid · 서버 키는 증권사 접두 영숫자라 `|` 가 섞이지 않는다. */
export function sessionKey(userId: string, serverKey: string): string {
  return `${userId}|${serverKey}`;
}

/** 사용자 × 증권사 색인 키 (D-10). */
function userBrokerKey(userId: string, broker: string): string {
  return `${userId}|${broker}`;
}

/** `closeForDmaUser` 가 세션 상태 프레임에 싣는 문구 — 브라우저 「권한 없음」 배지 옆 사유. */
export const DMA_USER_CLOSED_MESSAGE = "DMA 계정 연결이 해제되어 실시간 세션을 종료했습니다";

/** primary 우선 증권사 (D-18). 사용자 단위 명령 · 세션 상태 표시가 이 증권사 세션을 먼저 본다. */
const PRIMARY_BROKER = "KB";

export class SessionManager {
  /** `${userId}|${serverKey}` → 엔트리. 삽입 순서 = 생성 순서(`primaryOf` 의 「처음 만든 세션」 · `firstReady` 순서). */
  readonly #sessions = new Map<string, Entry>();
  /** `${userId}|${broker}` → 세션 키. 사용자 × 증권사당 세션 1개(D-10)의 색인이다. */
  readonly #byUserBroker = new Map<string, string>();
  readonly #host: string;
  readonly #port: number;
  readonly #broker: string;
  readonly #resolveTarget: ((broker: string) => SessionTarget | undefined) | undefined;
  readonly #graceMs: number;
  readonly #now: () => number;

  constructor(opts: SessionManagerOptions) {
    this.#host = opts.host;
    this.#port = opts.port;
    this.#broker = opts.broker;
    this.#resolveTarget = opts.resolveTarget;
    this.#graceMs = opts.graceMs ?? SESSION_GRACE_MS;
    this.#now = opts.now ?? (() => Date.now());
  }

  /**
   * 사용자의 **그 증권사** 세션을 얻고 참조계수를 1 올린다. wss 인증 성공 직후에 부른다.
   *
   * 그 사용자 · 증권사 세션이 있으면(D-10 — 주문 서버가 그 사이 바뀌었어도) 그 세션을 종전 규율로 재사용한다: 유예
   * 타이머가 걸려 있으면 **취소하고 같은 세션**(D-15 — 새로고침 왕복 흡수), 회선 문제로 죽은 세션은 새 접속(0 → 1)
   * 에서만 재생성, 로그인 거부 계열(`NO_RETRY_STATES`)은 재로그인 없이 그대로 돌려준다. 없으면 그 증권사 주문 서버
   * (`resolveTarget(broker)`)로 새로 만들어 `start()` 까지 한다.
   *
   * @returns 세션. 그 증권사 주문 서버가 없으면 `null`(세션을 열지 않는다 · warn 1줄)
   */
  acquireFor(userId: string, broker: string, creds: DmaCredentials): DmaSession | null {
    const key = this.#byUserBroker.get(userBrokerKey(userId, broker));
    const existing = key !== undefined ? this.#sessions.get(key) : undefined;

    if (key !== undefined && existing !== undefined) {
      const state = existing.session.state;
      const ctx = { userId, serverKey: existing.serverKey, state };

      if (existing.graceTimer !== null) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
        logger.info(ctx, "[DMA] 유예 중 재연결 — 소멸 예약 취소, 세션 재사용");
      }

      if (existing.refCount === 0 && RETRYABLE_DEAD_STATES.has(state)) {
        // 회선 문제로 죽은 세션이고 새 사용자 접속이다 — 여기서만 다시 세운다. 세션이 끝났으므로 대상도 다시 고른다(D-10).
        logger.info(ctx, "[DMA] 죽은 세션 폐기 후 재생성 (회선 실패 복구 경로)");
        existing.session.close();
        this.#delete(key, existing);
        return this.#create(userId, broker, creds);
      }

      existing.refCount += 1;
      if (NO_RETRY_STATES.has(state)) {
        logger.warn(
          { ...ctx, refCount: existing.refCount },
          "[DMA] 로그인 거부 세션 재사용 — 재로그인하지 않는다 (자격증명 수정 필요)",
        );
      } else {
        logger.info(
          { ...ctx, refCount: existing.refCount },
          "[DMA] 살아 있는 세션 재사용 (같은 사용자의 추가 탭)",
        );
      }
      return existing.session;
    }

    return this.#create(userId, broker, creds);
  }

  /**
   * 참조계수를 1 내린다. wss 소켓이 닫힐 때 그 소켓이 잡은 서버 키마다 부른다.
   * 0 이 되면 소멸을 예약할 뿐 즉시 끊지 않는다 (D-15).
   */
  release(userId: string, serverKey: string): void {
    const key = sessionKey(userId, serverKey);
    const entry = this.#sessions.get(key);
    if (entry === undefined) {
      // 이미 사라진 세션에 대한 release 는 정상 경합이다(유예 만료 직후 소켓 close 등).
      logger.warn({ userId, serverKey }, "[DMA] 세션 없는 release — 무시");
      return;
    }

    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount > 0) {
      logger.info(
        { userId, serverKey, refCount: entry.refCount },
        "[DMA] wss 소켓 1개 종료 — 남은 탭이 있어 세션 유지",
      );
      return;
    }

    if (entry.graceTimer !== null) clearTimeout(entry.graceTimer);
    entry.graceTimer = setTimeout(() => {
      entry.graceTimer = null;
      // 유예 중 재연결이 왔다면 타이머가 이미 취소됐다. 여기 왔다는 것은 아무도 안 왔다는 뜻이다.
      this.#delete(key, entry);
      entry.session.close();
      logger.info(
        { userId, serverKey, graceMs: this.#graceMs, sessionCount: this.#sessions.size },
        "[DMA] 유예 만료 — DMA 세션 종료",
      );
    }, this.#graceMs);

    logger.info(
      { userId, serverKey, graceMs: this.#graceMs },
      "[DMA] 마지막 wss 종료 — 유예 후 소멸 예약 (새로고침 왕복 흡수)",
    );
  }

  /** `primaryOf` 별칭(호환 — Phase 15~29-15 의 단일 세션 조회). 참조계수를 건드리지 않는다. */
  get(userId: string): DmaSession | undefined {
    return this.primaryOf(userId);
  }

  /** 그 사용자의 세션 전부(생성 순서). 참조계수를 건드리지 않는다. */
  sessionsOf(userId: string): DmaSession[] {
    const out: DmaSession[] = [];
    for (const entry of this.#sessions.values()) {
      if (entry.userId === userId) out.push(entry.session);
    }
    return out;
  }

  /**
   * 그 서버 키의 세션 전부(생성 순서 · 사용자 무관). 참조계수를 건드리지 않는다.
   * 용도(29-21): 서버 87(users.toml 전체)을 그 서버에 로그인한 열린 세션에 반영할 대상 고르기(`AdminSessionSync`).
   */
  sessionsOnServer(serverKey: string): DmaSession[] {
    const out: DmaSession[] = [];
    for (const entry of this.#sessions.values()) {
      if (entry.serverKey === serverKey) out.push(entry.session);
    }
    return out;
  }

  /**
   * 사용자 단위 명령 · 상태 표시의 세션 (D-18) — **KB 세션 우선**, 없으면 처음 만든 세션, 없으면 undefined.
   * 주문 라우트가 「활성 Ready 세션이 있는가」를 물을 때의 기본 세션이기도 하다(없으면 「세션 없음」 거부 · D-15).
   */
  primaryOf(userId: string): DmaSession | undefined {
    const kbKey = this.#byUserBroker.get(userBrokerKey(userId, PRIMARY_BROKER));
    const kb = kbKey !== undefined ? this.#sessions.get(kbKey)?.session : undefined;
    return kb ?? this.sessionsOf(userId)[0];
  }

  /**
   * 그 계좌가 든 세션 (계좌가 있는 명령 — 주문 · 상따 · 자동매도). 근거는 `allowedAccounts`(게이트웨이 응답과 대조된
   * 목록)뿐이다 — 인바운드 바디의 증권사 표기 같은 것을 믿지 않는다(T-16-01). 어느 세션에도 없으면 undefined.
   */
  forAccount(userId: string, accountNo: string): DmaSession | undefined {
    for (const entry of this.#sessions.values()) {
      if (entry.userId !== userId) continue;
      if (entry.session.allowedAccounts.some((a) => a.accountNo === accountNo)) return entry.session;
    }
    return undefined;
  }

  /**
   * 지금 Ready 인 세션 하나를 고른다 — 참조계수·유예 타이머는 건드리지 않는다.
   *
   * 용도(quick-260923-cqj D-02): 게이트웨이 종목마스터 요청(27)을 실어 보낼 **운반 세션** 선택.
   * 요청은 사용자 수와 무관한 relay 전체 1건이고, 07:30 경계 타이머와 실패 뒤 재시도 타이머가
   * 이 함수를 부른다. 삽입 순서상 첫 Ready 세션 중 `avoidUserId` 사용자의 것이 아닌 것을 돌려주고(직전
   * 실패 세션을 피한다 — 회피는 **사용자 단위**다, 키 구조와 무관), 그런 세션이 없으면 `avoidUserId` 의 Ready 세션을 돌려준다.
   * 유예 중(마지막 wss 가 닫힌 뒤 5분)인 세션도 Ready 면 후보다 — 게이트웨이 로그인은 살아 있다.
   */
  firstReady(avoidUserId?: string): DmaSession | undefined {
    for (const entry of this.#sessions.values()) {
      if (entry.userId !== avoidUserId && entry.session.isReady) return entry.session;
    }
    if (avoidUserId === undefined) return undefined;
    return this.sessionsOf(avoidUserId).find((s) => s.isReady);
  }

  /**
   * 그 DMA id 로 로그인하는 세션 전부의 비밀을 바꾼다 (29-16 · D-08 · RESEARCH Pitfall 8 — 결선은 29-21).
   *
   * **열린 세션은 끊지 않는다** — 새 비밀은 다음 `LoginReq`(회선 재접속 · 재로그인)부터다. 바꾸지 않으면 Admin 이 비번을
   * 바꾼 뒤 첫 회선 끊김에서 옛 비밀로 재로그인해 거부로 굳는다. 대상은 사용자 · 증권사 무관 그 DMA id 의 모든 세션이다
   * (같은 DMA id 를 쓰는 gh-radar 계정이 둘이어도 둘 다).
   *
   * 로그에 DMA id · 비밀번호를 싣지 않는다(D-19) — 개수와 서버 키만.
   *
   * @returns 바꾼 세션 수
   */
  updatePassword(dmaUserId: string, password: string): number {
    const serverKeys: string[] = [];
    for (const entry of this.#sessions.values()) {
      if (!entry.session.isDmaUser(dmaUserId)) continue;
      entry.session.setPassword(password);
      serverKeys.push(entry.serverKey);
    }
    logger.info({ count: serverKeys.length, serverKeys }, "[DMA] DMA 유저 비밀 교체 — 열린 세션 유지, 다음 로그인부터 적용");
    return serverKeys.length;
  }

  /**
   * 그 DMA id 로 로그인한 세션 전부를 **재접속 루프 없이** `unauthorized` 로 끝낸다 (29-16 · CONTEXT 「DeleteUser →
   * unauthorized · 재접속 루프 없음」 — 결선은 29-21).
   *
   * 엔트리는 지우지 않는다 — 탭이 열려 있는 동안 같은 사용자가 다시 와도(`acquireFor`) 그 죽은 세션을 돌려주고
   * (`NO_RETRY_STATES` — 재로그인하지 않는다), 탭이 다 닫히면 종전 유예로 사라진다. 지우면 다음 acquire 가 지워진 DMA
   * 계정으로 바로 재로그인해 거부를 되풀이한다. 상태 프레임(`unauthorized`)은 붙어 있는 탭에 그대로 간다.
   *
   * @param reason 로그용 짧은 사유(예 "deleted"). 화면 문구는 `DMA_USER_CLOSED_MESSAGE` 고정이다.
   * @param opts.serverKey 주면 **그 서버 키 세션만** 끝낸다(29-21 — DeleteUser 는 op 2 가 ok 인 서버만 그 유저가 사라진다. 다른
   *   서버 · 다른 증권사 세션은 그 서버에 유저가 남아 있으므로 그대로 둔다). 생략 = 그 DMA id 세션 전부(29-16 종전).
   * @returns 끝낸 세션 수
   */
  closeForDmaUser(dmaUserId: string, reason: string, opts: { serverKey?: string } = {}): number {
    const serverKeys: string[] = [];
    for (const entry of this.#sessions.values()) {
      if (!entry.session.isDmaUser(dmaUserId)) continue;
      if (opts.serverKey !== undefined && entry.serverKey !== opts.serverKey) continue;
      entry.session.terminate("unauthorized", DMA_USER_CLOSED_MESSAGE);
      serverKeys.push(entry.serverKey);
    }
    logger.warn(
      { count: serverKeys.length, serverKeys, reason },
      "[DMA] DMA 유저 단위 세션 종료 — unauthorized (재접속 없음)",
    );
    return serverKeys.length;
  }

  /** 프로세스 graceful shutdown 용. 15-05 의 `index.ts` 가 부른다. */
  async closeAll(): Promise<void> {
    const count = this.#sessions.size;
    for (const entry of this.#sessions.values()) {
      if (entry.graceTimer !== null) {
        clearTimeout(entry.graceTimer);
        entry.graceTimer = null;
      }
      entry.session.close();
      logger.info({ userId: entry.userId, serverKey: entry.serverKey }, "[DMA] 종료 절차 — 세션 정리");
    }
    this.#sessions.clear();
    this.#byUserBroker.clear();
    logger.info({ count }, "[DMA] 전 세션 종료 완료");
    await Promise.resolve();
  }

  /**
   * `/healthz` 용 요약. 식별자(userId·DMA user_id·계좌번호)를 담지 않는다.
   * 모든 (유저, 서버) 세션을 센다(29-16) — 판정 규율 · 503 축은 그대로다.
   */
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

  /**
   * 그 증권사의 연결 대상 — `resolveTarget(broker)` 가 있으면 그것(undefined = 주문 서버 없음), 없으면 생성자의 단일
   * 대상(그 증권사일 때만 · 서버 키 = broker).
   */
  #target(broker: string): SessionTarget | undefined {
    if (this.#resolveTarget !== undefined) return this.#resolveTarget(broker);
    if (broker !== this.#broker) return undefined;
    return { serverKey: this.#broker, host: this.#host, port: this.#port, broker: this.#broker };
  }

  /** 엔트리와 사용자 × 증권사 색인을 함께 지운다. 색인이 다른 세션을 가리키면 그대로 둔다(경합 방어). */
  #delete(key: string, entry: Entry): void {
    if (this.#sessions.get(key) === entry) this.#sessions.delete(key);
    const ub = userBrokerKey(entry.userId, entry.broker);
    if (this.#byUserBroker.get(ub) === key) this.#byUserBroker.delete(ub);
  }

  #create(userId: string, broker: string, creds: DmaCredentials): DmaSession | null {
    const target = this.#target(broker);
    if (target === undefined) {
      // 레지스트리에 그 증권사 주문 서버가 없다 — 열리지 않는 세션을 만들지 않는다(29-16). 서버 키 · 증권사만 남긴다.
      logger.warn({ userId, broker }, "[DMA] 그 증권사 주문 서버가 없다 — 세션을 열지 않는다");
      return null;
    }
    const key = sessionKey(userId, target.serverKey);
    const client = new DmaClient({ host: target.host, port: target.port });
    const sessionCreds: DmaSessionCreds = {
      userId,
      dmaUserId: creds.dmaUserId,
      password: creds.password,
      broker: target.broker,
      serverKey: target.serverKey,
    };
    const session = new DmaSession(sessionCreds, client);
    this.#sessions.set(key, {
      session,
      userId,
      serverKey: target.serverKey,
      broker,
      refCount: 1,
      graceTimer: null,
      createdAt: this.#now(),
    });
    this.#byUserBroker.set(userBrokerKey(userId, broker), key);

    // 로그 인자에 dmaUserId·password 를 넣지 않는다 (D-19).
    logger.info(
      {
        userId,
        serverKey: target.serverKey,
        broker,
        host: target.host,
        port: target.port,
        sessionCount: this.#sessions.size,
      },
      "[DMA] 세션 없음 — 새 DMA 세션 생성",
    );
    session.start();
    return session;
  }
}
