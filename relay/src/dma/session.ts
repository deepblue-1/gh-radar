/**
 * Phase 15 Plan 03 — RELAY-01. DMA 세션 상태기계 (운용 준비 판정).
 *
 * gh-trade `client/Services/DMA/Session.cs` 이식. `DmaClient` 가 "TCP 가 붙었는가"를
 * 다룬다면 여기는 **"주문·시세를 받을 준비가 됐는가"**를 다룬다. 두 질문은 다르다 —
 * TCP 는 붙었는데 로그인이 거부되면 화면에 실시간을 띄우면 안 된다.
 *
 * 결정 근거:
 *   D-13  세션은 gh-radar 사용자 1명당 1개다. 시세·체결·계좌·주문이 전부 이 세션을 탄다.
 *   D-14  부트 시퀀스는 `LoginReq(1)` → `LoginResp(50)` → 계좌 선언 → Ready 다.
 *         **현행 스키마에서는 선언할 계좌가 0건**이라 계좌 단계가 축약된다 (D-25 게이트).
 *   D-16  서버가 로그인을 **명시 거부**하면 재접속 루프를 멈춘다(`failNoRetry`). 재시도해도
 *         결과가 같고, 백오프마다 같은 거부를 되풀이하면 KB 계정이 잠긴다 (T-15-10).
 *         재접속 상한 소진은 `manual_required` 로 승격한다.
 *   D-19  평문 비밀번호는 **이 객체의 private 필드에만** 산다. 로그·상태 프레임·에러
 *         메시지·직렬화 어디에도 싣지 않는다 (T-15-19). `toJSON`/`toString`/`inspect` 를
 *         전부 덮어 실수로 객체째 덤프해도 새지 않게 한다.
 *   D-36  연결 상태는 **상태 프레임 하나로만** 표현한다. 여기서 내보내는 `RelayStateMsg`
 *         가 그대로 wss 프레임이 되어, 브라우저가 상태 분기를 중복 구현하지 않는다.
 *   D-38  기준 구현은 C# 세션. 상태 enum 은 **처음부터 전부 선언**하고 나중에 추가하지
 *         않는다 — 상태가 늘어나면 브라우저·서버·relay 세 곳이 동시에 어긋난다.
 *
 * Pitfall 4 (재접속 후 재구독 누락) 대응:
 *   TCP 가 올라오는 경로(최초 부트·자동 재접속·수동 재접속)가 **전부 같은 부트 워커**
 *   (`#onTransportUp`)를 탄다. 그리고 `ready` 이벤트가 **재구독의 유일한 트리거**다.
 *   15-04 의 SubscriptionHub 는 이 이벤트만 구독한다 — 경로를 두 벌 만들지 않는다.
 *
 * 하지 않는 것:
 *   - 구독 집합을 소유하지 않는다. 그것은 SubscriptionHub(15-04)의 정본이다.
 *   - 계좌 선언·주문을 하지 않는다. D-25 게이트 뒤 plan 소관이다.
 *   - 소켓을 직접 만지지 않는다. 재접속 정책은 `DmaClient` 가 소유한다.
 */
import { EventEmitter } from "node:events";
import { inspect } from "node:util";

import type { RelayAccount, RelaySessionState, RelayStateMsg } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { DmaClient, TransportFrameEvent } from "./dma-client.js";
import { buildLoginReq, parseLoginResp } from "./envelope.js";
import { MSG } from "./msg-type.js";

// ============================================================
// 상수 정본 (C# Session.cs L60-61)
// ============================================================

/** `LoginResp(50)` 대기 상한(ms). 초과하면 실패로 확정한다 (D-08 동형). */
export const LOGIN_RESP_TIMEOUT_MS = 5000;

/**
 * 계좌 선언 응답(`UpdateAccountNoResp(55)`) 대조 대기 상한(ms).
 *
 * D-25 게이트 전(현행 스키마)에는 선언할 계좌가 0건이라 **대기할 응답 자체가 없다**.
 * 값을 미리 박아 두는 이유는 게이트 뒤 plan 이 수치를 다시 고르지 않게 하기 위해서다
 * (`envelope.ts` 의 계좌 상한 상수 4종과 같은 규율).
 */
export const ACCOUNT_RESP_TIMEOUT_MS = 5000;

/** 서버 계좌번호 길이 가드. D-25 게이트 뒤 계좌 선언 루프가 쓴다 (Pitfall 5). */
export const MAX_ACCOUNT_NO_LEN = 12;

// 재접속 상한·백오프는 `dma-client.ts` 가 단일 정본이다 — 여기 복제하지 않는다 (IN-01).

/**
 * 세션 상태 전체 목록. `idle` 은 `start()` 이전의 내부 초기값이고 밖으로 나가지 않는다.
 * 나머지 9종은 `@gh-radar/shared` 의 `RelaySessionState` 와 **같은 집합**이다.
 *
 * `unauthorized` 는 이 객체가 스스로 들어가는 상태가 아니다 — `dma_credentials` 미등록은
 * 세션을 만들기 **전에** wss 계층(15-04)이 판정한다. 그래도 여기 선언해 두는 이유는
 * "상태를 나중에 추가하지 않는다"는 규율 때문이다 (D-38).
 */
export type DmaSessionState = "idle" | RelaySessionState;

/** 종료 상태 — 여기 들어가면 자동으로 빠져나오지 않는다. */
const TERMINAL_STATES: ReadonlySet<DmaSessionState> = new Set<DmaSessionState>([
  "failed",
  "session_rejected",
  "unauthorized",
]);

export type DmaSessionCreds = {
  /** gh-radar 사용자 id. 로그 키이고 세션 맵의 키다 (D-13). */
  userId: string;
  /** DMA 게이트웨이 로그인 id. **로그에 남기지 않는다.** */
  dmaUserId: string;
  /** 평문 비밀번호. 이 객체 밖으로 나가면 안 된다 (D-19). */
  password: string;
  /** `LoginReq.broker`. 현재는 "KB". */
  broker: string;
};

/** Ready 진입 알림 — **재구독의 유일한 트리거**다 (Pitfall 4). */
export type SessionReadyEvent = { generation: number; accounts: RelayAccount[] };

export interface DmaSession {
  on(event: "state", listener: (frame: RelayStateMsg) => void): this;
  on(event: "ready", listener: (e: SessionReadyEvent) => void): this;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): this;
  emit(event: "state", frame: RelayStateMsg): boolean;
  emit(event: "ready", e: SessionReadyEvent): boolean;
  emit(event: "frame", e: TransportFrameEvent): boolean;
}

/**
 * 사용자 1명의 DMA 세션. 전송은 주입받은 `DmaClient` 가 담당한다.
 */
export class DmaSession extends EventEmitter {
  readonly #userId: string;
  readonly #dmaUserId: string;
  /** 평문 비밀번호 (D-19 / T-15-19). 게터를 만들지 않는다. */
  readonly #password: string;
  readonly #broker: string;
  readonly #client: DmaClient;

  #state: DmaSessionState = "idle";
  /**
   * 최초 부트 구간 여부. true 면 실패가 `failed`(사용자에게 즉시 실패)로 확정되고,
   * false(=한 번이라도 Ready 였음)면 자동 재접속으로 넘긴다 (C# `_bootPhase`).
   */
  #bootPhase = true;
  #hasBeenReady = false;
  /** 서버가 허용한 계좌 목록. 현행 스키마에서는 항상 빈 배열이다 (D-25). */
  #accounts: RelayAccount[] = [];
  #loginTimer: NodeJS.Timeout | null = null;

  constructor(creds: DmaSessionCreds, client: DmaClient) {
    super();
    this.#userId = creds.userId;
    this.#dmaUserId = creds.dmaUserId;
    this.#password = creds.password;
    this.#broker = creds.broker;
    this.#client = client;

    // TCP 가 올라오는 모든 경로가 이 한 워커를 탄다 (Pitfall 4).
    client.on("up", (e) => this.#onTransportUp(e.generation));
    client.on("down", (e) => this.#onTransportDown(e.reason));
    client.on("frame", (e) => this.#onFrame(e));
    client.on("reconnecting", (e) => this.#onReconnecting(e.attempt, e.reason));
    client.on("exhausted", (e) => this.#onExhausted(e.attempts));
  }

  // ----------------------------------------------------------
  // 관찰용
  // ----------------------------------------------------------

  get userId(): string {
    return this.#userId;
  }

  get state(): DmaSessionState {
    return this.#state;
  }

  /** 주문 라우트가 "지금 주문을 받을 수 있는가"를 묻는 단 하나의 질문이다 (D-15). */
  get isReady(): boolean {
    return this.#state === "ready";
  }

  /**
   * 서버가 허용한 계좌 목록의 복사본. 이름이 `accounts` 가 아닌 이유는 생성 코드의
   * 계좌 접근자와 이름이 겹쳐 D-25 게이트 검사(grep)를 흐리기 때문이다.
   */
  get allowedAccounts(): RelayAccount[] {
    return [...this.#accounts];
  }

  /** 현재 상태를 그대로 wss 로 보낼 수 있는 프레임으로 만든다 (D-36). */
  stateFrame(msg?: string, attempt?: number): RelayStateMsg {
    const s: RelaySessionState = this.#state === "idle" ? "connecting" : this.#state;
    const frame: RelayStateMsg = { t: "state", s, accounts: this.allowedAccounts };
    if (msg !== undefined) frame.msg = msg;
    if (attempt !== undefined) frame.attempt = attempt;
    return frame;
  }

  // ----------------------------------------------------------
  // 비밀 노출 방지 (D-19 / T-15-19)
  // ----------------------------------------------------------

  /**
   * 직렬화 표현. `#password` 도 `#dmaUserId` 도 담지 않는다.
   * pino 의 redact 는 2차 방어일 뿐이고, 애초에 나갈 수 없게 하는 것이 1차다.
   */
  toJSON(): { userId: string; state: DmaSessionState; accountCount: number } {
    return { userId: this.#userId, state: this.#state, accountCount: this.#accounts.length };
  }

  toString(): string {
    return `DmaSession(${this.#userId}, ${this.#state})`;
  }

  /** `console.log(session)` / `util.inspect` 로도 비밀이 새지 않게 막는다. */
  [inspect.custom](): string {
    return this.toString();
  }

  // ----------------------------------------------------------
  // 수명 관리
  // ----------------------------------------------------------

  /** 세션 시작. wss 첫 인증 연결이 왔을 때 SessionManager 가 부른다 (D-15). */
  start(): void {
    if (this.#state !== "idle") {
      logger.warn({ userId: this.#userId, state: this.#state }, "[DMA] 이미 시작된 세션");
      return;
    }
    this.#bootPhase = true;
    this.#setState("connecting", "게이트웨이 연결 중");
    this.#client.connect();
  }

  /**
   * 재접속 상한 소진(`manual_required`) 이후의 복구 수단. 그 상태에서만 동작한다 —
   * `session_rejected`(로그인 거부)는 자격증명을 고치기 전에는 결과가 같으므로 제외한다.
   */
  manualReconnect(): boolean {
    if (this.#state !== "manual_required") {
      logger.warn(
        { userId: this.#userId, state: this.#state },
        "[DMA] 수동 재접속은 manual_required 에서만 가능",
      );
      return false;
    }
    this.#setState("connecting", "수동 재접속");
    this.#client.manualReconnect();
    return true;
  }

  /** 세션 종료. 유예 만료·프로세스 종료 시 SessionManager 가 부른다. */
  close(): void {
    this.#clearLoginTimer();
    this.#client.destroy();
    logger.info({ userId: this.#userId, lastState: this.#state }, "[DMA] 세션 종료");
  }

  // ----------------------------------------------------------
  // 부트 시퀀스 (단일 경로)
  // ----------------------------------------------------------

  #onTransportUp(gen: number): void {
    // 워커 진입 직후. 구세대(구부트·종료 후)는 아무것도 보고하지 않는다.
    if (gen !== this.#client.generation) return;
    if (TERMINAL_STATES.has(this.#state)) return;

    // ① 로그인 요청
    if (!this.#trySetState(gen, "logging_in", "DMA 로그인 중")) return;
    if (!this.#client.send(buildLoginReq(this.#dmaUserId, this.#password, this.#broker))) {
      this.#fail("LoginReq 송신 실패");
      return;
    }

    // ② 응답을 5초 기다린다. 게이트웨이가 붙었는데 응답이 없는 상태를 무한정 두면
    //    화면이 "로그인 중"에서 영원히 멎는다.
    this.#clearLoginTimer();
    this.#loginTimer = setTimeout(() => {
      this.#loginTimer = null;
      if (gen !== this.#client.generation) return; // 구세대 타이머 — 보고하지 않는다
      this.#fail(`LoginResp 타임아웃 (${LOGIN_RESP_TIMEOUT_MS / 1000}초)`);
    }, LOGIN_RESP_TIMEOUT_MS);
  }

  #onFrame(e: TransportFrameEvent): void {
    // 시세·체결·주문 프레임은 해석하지 않고 그대로 흘린다 — 소비자(15-04 Hub)가 읽는다.
    this.emit("frame", e);

    if (e.msgType !== MSG.LoginResp) return;
    if (e.generation !== this.#client.generation) return;
    if (this.#state !== "logging_in") {
      logger.warn(
        { userId: this.#userId, state: this.#state },
        "[DMA] 예상 밖 시점의 LoginResp — 무시",
      );
      return;
    }

    this.#clearLoginTimer();
    const resp = parseLoginResp(e.env);
    if (resp === null) {
      // 파서가 사유·카운터를 이미 남겼다. 여기서는 세션 판정만 한다.
      this.#fail("LoginResp 파싱 실패");
      return;
    }
    if (!resp.success) {
      // 서버가 명시적으로 거부했다. 재시도해도 결과가 같다 (D-16 / 17 D-17).
      this.#failNoRetry(`로그인 거부: ${resp.message}`);
      return;
    }
    this.#onLoginAccepted(e.generation, resp.message);
  }

  #onLoginAccepted(gen: number, message: string): void {
    // ③ 계좌 선언 단계.
    if (!this.#trySetState(gen, "declaring", "계좌 확인 중")) return;

    // D-25 게이트: 현행 스키마의 `LoginResp` 에서 relay 는 success/message 만 읽는다
    // (`envelope.ts` 의 `parseLoginResp`). 선언할 계좌가 0건이면 **대조를 기다릴 응답도
    // 없으므로** ACCOUNT_RESP_TIMEOUT_MS 타이머를 걸지 않고 곧장 Ready 로 간다.
    // 계좌가 비어 있는 `ready` 는 정상 상태다 — UI 는 주문 패널만 비활성화한다
    // (shared `RelayAccount` 주석 / gh-trade 17 D-19).
    //
    // TODO(D-25): gh-trade 17 재동기화(`sync-relay-schema.sh` 재실행) 후 이 자리에 들어온다.
    //   ① LoginResp 의 허용 계좌 벡터 → RelayAccount[] 변환 (MAX_ACCOUNT_NO_LEN 가드)
    //   ② 계좌마다 UpdateAccountNoReq(3) mode "1" 을 건별 대기 없이 연속 송신
    //   ③ UpdateAccountNoResp(55) 의 목록을 ACCOUNT_RESP_TIMEOUT_MS(5초) 안에 대조
    //   ④ 미대조 계좌가 남으면 fail("계좌 선언 미확인 (5초)"), 허용 밖 계좌면 failNoRetry
    //   ⑤ 계좌 0건이면 세션 실패로 확정 (17 D-12)
    this.#accounts = [];

    // ④ 운용 준비 완료. **"성공"의 기준은 TCP 접속이 아니라 여기다.**
    this.#client.resetReconnectAttempts();
    if (!this.#trySetState(gen, "ready", message === "" ? undefined : message)) return;
    this.#hasBeenReady = true;
    this.#bootPhase = false;
    // 재구독의 유일한 트리거 (Pitfall 4).
    this.emit("ready", { generation: gen, accounts: this.allowedAccounts });
  }

  // ----------------------------------------------------------
  // 전송 이벤트 대응
  // ----------------------------------------------------------

  #onTransportDown(reason: string): void {
    // 응답 대기 타이머를 먼저 끈다 — 끄지 않으면 5초 뒤에 구세대 실패가 늦게 보고된다.
    this.#clearLoginTimer();
    logger.info(
      { userId: this.#userId, state: this.#state, reason, hasBeenReady: this.#hasBeenReady },
      "[DMA] 세션 전송 단절",
    );
    // 상태 전이는 하지 않는다. 이어지는 reconnecting/exhausted 이벤트가 상태를 옮긴다
    // (자동 재접속이 꺼진 경우에는 이미 종료 상태이므로 옮길 것이 없다).
  }

  #onReconnecting(attempt: number, reason: string): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#setState("reconnecting", reason, attempt);
  }

  #onExhausted(attempts: number): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#clearLoginTimer();
    logger.error({ userId: this.#userId, attempts }, "[DMA] 재접속 상한 소진 — 수동 재접속 필요");
    this.#setState("manual_required", "재접속 시도를 모두 소진했습니다", attempts);
  }

  // ----------------------------------------------------------
  // 실패 경로
  // ----------------------------------------------------------

  /**
   * 실패 처리. **부트 구간이면 `failed` 로 확정**하고, 운용 중이면 전송만 끊어
   * 자동 재접속(백오프 유지)에 넘긴다 (C# `Fail`).
   */
  #fail(reason: string): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#clearLoginTimer();

    if (this.#bootPhase) {
      logger.error({ userId: this.#userId, reason }, "[DMA] 운용 준비 실패");
      // 발화보다 먼저 끊는다 — 실패를 알리는 동안 재접속이 진행되면 표시와 동작이 어긋난다.
      this.#client.destroy();
      this.#setState("failed", reason);
      return;
    }

    // 운용 중 실패는 상태를 옮기지 않는다. 전송을 다시 세우면 같은 부트 워커가 재로그인을
    // 되풀이하고, 이어지는 down→reconnecting 이벤트가 상태를 옮긴다.
    // **백오프 카운터를 리셋하지 않는다** — 리셋하면 상한 10회가 무력화된다.
    logger.warn({ userId: this.#userId, reason }, "[DMA] 세션 재수립 실패 — 재접속에 넘김");
    this.#client.dropTransport(reason);
  }

  /**
   * 재시도해도 결과가 같은 실패. 자동 재접속 루프를 끊고 `session_rejected` 로 확정한다.
   *
   * 부트 여부와 무관하게 여기로 온다 — 운용 중 거부(서버를 다른 브로커로 재기동 등)를
   * 재접속에 넘기면 백오프마다 같은 거부를 되풀이해 KB 계정이 잠긴다 (T-15-10, D-16).
   */
  #failNoRetry(reason: string): void {
    if (TERMINAL_STATES.has(this.#state)) return;
    this.#clearLoginTimer();
    logger.error({ userId: this.#userId, reason }, "[DMA] 운용 중단 (재시도 없음)");
    // 루프를 먼저 끊고 연결을 정리한다. 순서가 바뀌면 destroy 가 부른 down 이 재접속을 예약한다.
    this.#client.stopReconnect(reason);
    this.#client.destroy();
    this.#setState("session_rejected", reason);
  }

  // ----------------------------------------------------------
  // 상태 전이
  // ----------------------------------------------------------

  /** 세대에 묶인 상태 전이. 구세대 워커는 상태를 옮기지 못한다 (C# `TrySetState`). */
  #trySetState(gen: number, next: DmaSessionState, msg?: string, attempt?: number): boolean {
    if (gen !== this.#client.generation) return false;
    if (TERMINAL_STATES.has(this.#state)) return false;
    this.#setState(next, msg, attempt);
    return true;
  }

  #setState(next: DmaSessionState, msg?: string, attempt?: number): void {
    const prev = this.#state;
    if (prev === next && next !== "reconnecting") return; // reconnecting 은 회차가 바뀐다
    this.#state = next;

    // 로그 인자에 password·dmaUserId 를 넣지 않는다 (D-19).
    logger.info({ userId: this.#userId, prev, next, msg, attempt }, "[DMA] 세션 상태 전이");

    // `idle` 은 내부 초기값이라 밖으로 내보내지 않는다.
    if (next === "idle") return;
    this.emit("state", this.stateFrame(msg, attempt));
  }

  #clearLoginTimer(): void {
    if (this.#loginTimer === null) return;
    clearTimeout(this.#loginTimer);
    this.#loginTimer = null;
  }
}
