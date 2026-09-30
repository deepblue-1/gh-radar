/**
 * Phase 26 Plan 02 — 시세 전용 공유 연결 (`QuoteFeed`).
 *
 * 게이트웨이에 **관찰자 로그인 role 1(quote)** 로 붙는 연결 하나. relay 전체가 이 연결 하나로 종목 시세를
 * 구독하고(26-03 hub 결선), 사용자 DMA 세션에서는 종목 구독이 빠진다. 연결 수명(백오프 · generation ·
 * LivePing 30초)은 `DmaClient` 가 쥐고, 여기서는 로그인 판단과 수신 프레임 전달만 한다.
 *
 * 흐름:
 *   start() → connect → "up" → 관찰자 로그인 1건(role 1) → 79 판단 → ready → 그 뒤 모든 프레임을 "frame" 으로 hub 에
 *
 * 결정 근거:
 *   확정-로그인  서버(gh-trade ed2e0240)는 role 1 로그인에 79(role 1 에코 · `journal_epoch ""` · 계좌 빈 벡터) → 78
 *               `RateCrossSnapshot` 1회로 답한다. 이 클래스는 **79 만 스스로 소비**하고 나머지(78 · 76 · 58/59 · 69/71 · 83 …)는
 *               ready 뒤 전부 "frame" 으로 넘긴다 — 78 · 76 · 83 을 무시할지는 hub 가 명시 case 로 정한다
 *               (RESEARCH Open Q2 RESOLVED · PC-12).
 *   확정-인증    관찰자 공유 비밀 재사용 · 19 D-13 동형: **24시간 상시** · `DmaClient` 의 상한 있는 백오프 재접속 ·
 *               **거부(79 success=false)면 재접속 루프 정지**(`rejected`) — 재시작 전 복구 없음.
 *   Pitfall 2    role 을 모르는 구 서버는 role 필드를 무시하고 journal 관찰자로 수락한다(79 success · role 0). 그러면 28/29/32
 *               가 버려져 「Ready 인데 시세가 영원히 안 온다」 + 관찰자 정원 1칸 낭비가 된다 → `role_mismatch` 로 거부와 같이
 *               정지한다(T-26-04). 서버 교체 뒤 relay 재시작으로 복구한다.
 *   정지 순서    stopReconnect → destroy → 상태 설정 (journal/observer.ts #reject 동형). 순서가 바뀌면 destroy 가 부른 down 이
 *               재접속을 예약한다.
 *   D-03         폴백 없음 — 이 연결이 오래 끊겨도 사용자 세션으로 시세를 재구독하지 않는다. 복구 경로는 백오프 재접속뿐이다.
 *   D-12         빅뱅 전환 — env 플래그 병존 없음. 이 클래스는 켜짐/꺼짐을 비밀 유무로만 안다.
 *   D-17         비밀 원천(`DMA_QUOTE_OBSERVER_SECRET` 우선 · `DMA_OBSERVER_SECRET` 폴백)은 config 가 정한다. 이 클래스는 받은
 *               값만 쓰고, 비어 있으면 `disabled` 로 남아 연결을 열지 않는다(「quote 비밀 없음 = 끔」).
 *   Pattern 2    저널 관찰자(`journal/observer.ts`)에 role 분기를 넣지 않는다 — 그쪽은 커서 로드 · 기록기 epoch · 계좌 매핑에
 *               묶여 있고 quote 에는 전부 무의미하다. 상태기계 뼈대만 축약 복사하고 저널 회귀 면적은 0 으로 둔다.
 *   T-19-03      비밀은 로그인 페이로드 조립(`buildObserverLoginReq`)에만 넘긴다. **어떤 로그 인자에도 싣지 않는다.**
 *   T-26-07      게이트웨이 호스트도 로그에 싣지 않는다 — 로그 문맥은 「quote」 태그 하나다.
 *
 * 상태 (초기값 `disabled` = 아직 시작하지 않음):
 *   disabled → (start · 비밀 있음) connecting → (up) logging_in → (79 ok · role 1) ready
 *   logging_in → (79 거부) rejected ■ · (79 ok · role≠1) role_mismatch ■ · (응답 타임아웃) connecting
 *   ready/logging_in → (down) connecting → … (ready 로 돌아오면 reconnects +1)
 *   ■ = 정지(재접속 루프 끊김 · 이후 up 에도 로그인하지 않는다)
 *
 * hub 표면(26-03 `HubQuoteFeed`): `isReady` · `send` · `on("frame")` · `on("ready")`. 상태 전이마다 `"state"` 이벤트
 * (26-11 `QuoteStatus` 가 구독한다).
 */
import { EventEmitter } from "node:events";

import { DmaClient, type TransportDownEvent, type TransportFrameEvent, type TransportUpEvent } from "../dma/dma-client.js";
import { buildObserverLoginReq, parseObserverLoginResp } from "../dma/envelope.js";
import { MSG } from "../dma/msg-type.js";
import { LOGIN_RESP_TIMEOUT_MS } from "../dma/session.js";
import { logger } from "../logger.js";
import type { ObserverLoginResult, ObserverTransport } from "../journal/types.js";

/** quote 관찰자 로그인의 `client` 값 — 게이트웨이 로그 `client='…'` 에서 저널 관찰자(`gh-radar-relay`)와 가른다. */
export const QUOTE_CLIENT_NAME = "gh-radar-relay/quote";

/** 관찰자 로그인 역할 — 1 = quote(시세 전용). 게이트웨이는 79 에 수락한 역할을 에코한다. */
export const QUOTE_ROLE = 1;

export type QuoteFeedState = "disabled" | "connecting" | "logging_in" | "ready" | "rejected" | "role_mismatch";

export type QuoteFeedDeps = {
  /** quote 관찰자 비밀(원천은 config — D-17). 없거나 빈 문자열이면 disabled 로 남고 아무것도 열지 않는다. */
  secret: string | undefined;
  host: string;
  port: number;
  /** 주입하지 않으면 `new DmaClient({host, port})` 를 **하나** 만든다(사용자 세션 · 저널 관찰자와 독립). */
  transport?: ObserverTransport;
  /** 로그인 응답 대기 상한(ms). 기본 `LOGIN_RESP_TIMEOUT_MS`(session.ts 정본 — 값을 복제하지 않는다). */
  loginTimeoutMs?: number;
};

/** "ready" 이벤트 페이로드 — hub 가 `resubscribeAll` 트리거로만 쓴다. */
export type QuoteFeedReadyEvent = Record<string, never>;

export interface QuoteFeed {
  on(event: "state", listener: (state: QuoteFeedState) => void): this;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): this;
  on(event: "ready", listener: (e: QuoteFeedReadyEvent) => void): this;
  off(event: "state", listener: (state: QuoteFeedState) => void): this;
  off(event: "frame", listener: (e: TransportFrameEvent) => void): this;
  off(event: "ready", listener: (e: QuoteFeedReadyEvent) => void): this;
  emit(event: "state", state: QuoteFeedState): boolean;
  emit(event: "frame", e: TransportFrameEvent): boolean;
  emit(event: "ready", e: QuoteFeedReadyEvent): boolean;
}

export class QuoteFeed extends EventEmitter {
  readonly #deps: QuoteFeedDeps;
  readonly #loginTimeoutMs: number;
  #transport: ObserverTransport | null;

  #state: QuoteFeedState = "disabled";
  #started = false;
  #stopped = false;
  /** 한 번이라도 ready 였는가 — 그 뒤의 ready 는 재접속으로 센다. */
  #everReady = false;
  #reconnects = 0;
  #lastFrameAtMs: number | null = null;
  #loginTimer: NodeJS.Timeout | null = null;

  readonly #onUp = (e: TransportUpEvent): void => this.#handleUp(e);
  readonly #onDown = (e: TransportDownEvent): void => this.#handleDown(e);
  readonly #onFrame = (e: TransportFrameEvent): void => {
    if (this.#stopped) return;
    this.#handleFrame(e);
  };

  constructor(deps: QuoteFeedDeps) {
    super();
    this.#deps = deps;
    this.#loginTimeoutMs = deps.loginTimeoutMs ?? LOGIN_RESP_TIMEOUT_MS;
    this.#transport = deps.transport ?? null;
  }

  get state(): QuoteFeedState {
    return this.#state;
  }

  /** hub 표면 — 업스트림 요청(28/29/32/35)을 보내도 되는가. */
  get isReady(): boolean {
    return this.#state === "ready" && !this.#stopped;
  }

  /** 첫 ready 이후 다시 ready 가 된 횟수(`/healthz` 원천). */
  get reconnects(): number {
    return this.#reconnects;
  }

  /** ready 뒤 마지막으로 hub 에 넘긴 프레임 시각(epoch ms). 아직 없으면 null. */
  get lastFrameAtMs(): number | null {
    return this.#lastFrameAtMs;
  }

  // ----------------------------------------------------------
  // 수명
  // ----------------------------------------------------------

  start(): void {
    if (this.#started) {
      logger.warn({ state: this.#state }, "[QUOTE] 시세 연결 start 중복 — 무시");
      return;
    }
    this.#started = true;
    if (!this.#hasSecret()) {
      this.#setState("disabled");
      logger.info("[QUOTE] 시세 관찰자 비밀 미설정 — 시세 연결 비활성(연결을 열지 않는다)");
      return;
    }
    const transport = this.#transport ?? new DmaClient({ host: this.#deps.host, port: this.#deps.port });
    this.#transport = transport;
    transport.on("up", this.#onUp);
    transport.on("down", this.#onDown);
    // 수신 콜백은 동기다 — 여기서 아무것도 기다리지 않는다(19 D-32 동형).
    transport.on("frame", this.#onFrame);
    this.#setState("connecting");
    transport.connect();
  }

  /** 종료. 타이머 · 리스너를 떼고 전송을 닫는다. 이후 어떤 이벤트도 상태를 바꾸지 않는다. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#clearLoginTimer();
    const transport = this.#transport;
    if (transport !== null && this.#started) {
      transport.off("up", this.#onUp);
      transport.off("down", this.#onDown);
      transport.off("frame", this.#onFrame);
      transport.destroy();
    }
    logger.info({ lastState: this.#state }, "[QUOTE] 시세 연결 종료");
  }

  /** hub 표면 — ready 일 때만 전송에 넘긴다. 아니면 false(호출자가 재접속 뒤 합집합 재구독으로 메운다). */
  send(payload: Uint8Array): boolean {
    if (!this.isReady || this.#transport === null) return false;
    return this.#transport.send(payload);
  }

  // ----------------------------------------------------------
  // 전송 이벤트
  // ----------------------------------------------------------

  #handleUp(e: TransportUpEvent): void {
    const transport = this.#transport;
    if (transport === null || this.#stopped) return;
    if (e.generation !== transport.generation) return; // 구세대
    if (this.#isHalted()) {
      // 거부 · 역할 불일치 뒤에는 다시 로그인하지 않는다(재시작 전 복구 없음).
      logger.warn({ state: this.#state }, "[QUOTE] 정지된 시세 연결에 전송 up — 로그인하지 않는다");
      return;
    }
    const secret = this.#deps.secret;
    if (secret === undefined || secret === "") return;

    const payload = buildObserverLoginReq({
      secret,
      sinceSeq: 0,
      epoch: "",
      client: QUOTE_CLIENT_NAME,
      strategySinceSeq: 0,
      role: QUOTE_ROLE,
    });
    this.#setState("logging_in");
    if (!transport.send(payload)) {
      // 사유(연결 없음 · 송신 예외)는 DmaClient 가 남겼다. 이어지는 down → 재접속이 다시 up 을 낸다.
      this.#dropTransport("quote 로그인 송신 실패");
      return;
    }
    logger.info({ role: QUOTE_ROLE, client: QUOTE_CLIENT_NAME }, "[QUOTE] 시세 관찰자 로그인 요청");
    this.#armLoginTimer(e.generation);
  }

  #handleDown(e: TransportDownEvent): void {
    this.#clearLoginTimer();
    if (this.#stopped || this.#isHalted() || this.#state === "disabled") return;
    logger.warn({ reason: e.reason }, "[QUOTE] 시세 연결 끊김 — DmaClient 가 재접속한다");
    this.#setState("connecting");
  }

  /** 동기다 — await 금지. */
  #handleFrame(e: TransportFrameEvent): void {
    const transport = this.#transport;
    if (transport === null) return;
    if (e.generation !== transport.generation) return; // 구세대 프레임
    if (this.#isHalted()) return;
    if (e.msgType === MSG.ObserverLoginResp) {
      const result = parseObserverLoginResp(e.env);
      if (result === null) {
        logger.warn({ msgType: e.msgType }, "[QUOTE] 시세 관찰자 로그인 응답 파손 — 무시(응답 타임아웃이 연결을 다시 세운다)");
        return;
      }
      this.#onLogin(result);
      return;
    }
    if (this.#state !== "ready") {
      // 로그인 판단 전 프레임(로그인 전 방송 76 등)은 hub 에 흘리지 않는다.
      logger.debug({ msgType: e.msgType, state: this.#state }, "[QUOTE] ready 전 프레임 — 버린다");
      return;
    }
    this.#lastFrameAtMs = Date.now();
    this.emit("frame", e);
  }

  #onLogin(result: ObserverLoginResult): void {
    if (this.#state !== "logging_in") {
      logger.warn({ state: this.#state }, "[QUOTE] 예상 밖 시점의 시세 관찰자 로그인 응답 — 무시");
      return;
    }
    this.#clearLoginTimer();
    if (!result.success) {
      this.#halt("rejected", "관찰자 로그인 거부", () =>
        logger.error({ gatewayMessage: result.message }, "[QUOTE] 시세 관찰자 로그인 거부 — 재접속 중단"),
      );
      return;
    }
    if (result.role !== QUOTE_ROLE) {
      // Pitfall 2 — role 을 모르는 구 서버가 journal 로 수락했다. 시세가 영원히 오지 않으므로 정지한다.
      this.#halt("role_mismatch", "관찰자 역할 불일치", () =>
        logger.error(
          { role: result.role, expectedRole: QUOTE_ROLE },
          "[QUOTE] 시세 관찰자 role_mismatch — 게이트웨이가 quote 역할을 모른다(구 서버) · 재접속 중단",
        ),
      );
      return;
    }
    // 「성공」 의 기준은 TCP 접속이 아니라 관찰자 로그인이다 — 여기서 백오프를 되돌린다.
    this.#transport?.resetReconnectAttempts();
    if (this.#everReady) this.#reconnects += 1;
    this.#everReady = true;
    this.#setState("ready");
    logger.info({ reconnects: this.#reconnects }, "[QUOTE] 시세 관찰자 로그인 성공 — ready");
    this.emit("ready", {});
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  /**
   * 정지(거부 · 역할 불일치). 루프를 먼저 끊고 전송을 닫는다 — 순서가 바뀌면 닫힘이 부른 down 이 재접속을 예약한다
   * (journal/observer.ts #reject 동형 · 19 D-13).
   */
  #halt(next: "rejected" | "role_mismatch", reason: string, log: () => void): void {
    log();
    const transport = this.#transport;
    transport?.stopReconnect(reason);
    transport?.destroy();
    this.#setState(next);
  }

  #isHalted(): boolean {
    return this.#state === "rejected" || this.#state === "role_mismatch";
  }

  /** 현재 전송을 끊는다. 백오프 카운터는 두고 DmaClient 가 재접속한다. */
  #dropTransport(reason: string): void {
    this.#clearLoginTimer();
    this.#transport?.dropTransport(reason);
    this.#setState("connecting");
  }

  #hasSecret(): boolean {
    const v = this.#deps.secret;
    return v !== undefined && v !== "";
  }

  #armLoginTimer(gen: number): void {
    this.#clearLoginTimer();
    this.#loginTimer = setTimeout(() => {
      this.#loginTimer = null;
      if (this.#stopped || this.#transport === null || gen !== this.#transport.generation) return;
      if (this.#state !== "logging_in") return;
      logger.warn({ timeoutMs: this.#loginTimeoutMs }, "[QUOTE] 시세 관찰자 로그인 응답 타임아웃 — 연결 재수립");
      this.#dropTransport("quote 로그인 응답 시간 초과");
    }, this.#loginTimeoutMs);
    this.#loginTimer.unref?.();
  }

  #clearLoginTimer(): void {
    if (this.#loginTimer === null) return;
    clearTimeout(this.#loginTimer);
    this.#loginTimer = null;
  }

  #setState(next: QuoteFeedState): void {
    if (this.#state === next) return;
    const from = this.#state;
    this.#state = next;
    logger.info({ from, to: next }, "[QUOTE] 시세 연결 상태 전이");
    this.emit("state", next);
  }
}
