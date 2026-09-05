/**
 * Phase 15 Plan 03 — RELAY-01. DMA 게이트웨이 TCP 클라이언트 (소켓 수명 관리 계층).
 *
 * gh-trade `client/Services/DMA/Client.cs` 의 **연결 수명 규율**을 TS 로 이식한 층이다.
 * 이 도메인의 실제 사고 경로는 알고리즘이 아니라 연결 수명 관리다 — 구세대 콜백의
 * 늦은 보고, 무한 재시도, 수신 경로 블로킹이 그것이다. 여기서는 소켓만 다루고
 * "운용 준비 상태"(로그인·계좌 선언)는 `session.ts` 가 판단한다.
 *
 * 결정 근거:
 *   D-32  `LivePing(4)` 30초 주기 + TCP_NODELAY 활성화. 게이트웨이는 **클라→서버
 *         완성 패킷만 활동으로 세고 유휴 90초면 연결을 끊으므로**, 이 타이머가 조용한
 *         장 마감 구간의 유일한 생명선이다. 수신 콜백에는 비동기 대기를 두지 않는다 —
 *         relay 가 수신을 늦추면 서버의 연결당 송신 큐(1024프레임/4MB)가 차고 서버가
 *         연결을 끊는다 (RESEARCH Pitfall 5).
 *   D-16  재접속은 **지수 백오프 + 시도 상한 10회**. 무한 재시도 금지 — 상한을 소진하면
 *         `exhausted` 를 올리고 멈춘다(상위가 `manual_required` 로 승격). 서버가 로그인을
 *         명시 거부한 경우에는 상위가 `stopReconnect()` 로 루프 자체를 끊는다. 백오프마다
 *         같은 거부를 되풀이하면 KB 계정 잠금 위험이 있다 (T-15-10).
 *   D-31  길이 헤더 손상(`desync`)은 프레임 드롭이 아니라 **연결 재수립**이다. 다음 경계를
 *         신뢰할 수 없는 스트림을 계속 읽으면 쓰레기가 조용히 흘러든다 (T-15-07).
 *   D-38  기준 구현은 C# 클라이언트. 상수 값은 임의로 고르지 않고 그대로 가져온다.
 *   IN-01 재접속 상한·백오프·핑 주기의 **단일 정본은 이 모듈**이다. Session·라벨·상태
 *         프레임이 전부 여기를 참조하고 값을 복제하지 않는다.
 *   S-5   송신 실패·드롭·재접속 예약은 전부 사유와 함께 로그를 남긴다. 조용한 `return` 금지.
 *
 * generation(전송 세대) 규율:
 *   비동기 콜백은 자기가 태어난 세대를 캡처하고, 진입부에서 `gen !== this.#generation`
 *   이면 **아무것도 보고하지 않고 반환**한다. 재접속 이후에 깨어난 구세대 타이머가
 *   새 연결의 상태를 덮어쓰는 사고를 이 한 줄이 막는다 (C# T-02-14).
 *   증가 지점은 아래 4곳으로 고정한다 — 늘리지 말 것:
 *     ① 연결 수립  ② 단절 확정  ③ 수동 재접속  ④ 종료(상위의 부트 실패 확정 포함)
 *
 * 하지 않는 것:
 *   - 로그인·계좌 선언·구독을 하지 않는다. 그것은 `session.ts` 단일 경로의 책임이다
 *     (재구독 경로를 두 벌 만들지 않기 위해서다 — Pitfall 4).
 *   - 프레임 의미를 해석하지 않는다. `tryParseEnvelope` 를 통과한 핸들만 넘긴다.
 *   - 수신 콜백에서 무거운 처리를 하지 않는다. 소비자도 동기 블로킹을 하면 안 된다.
 */
import net from "node:net";
import { EventEmitter } from "node:events";

import { logger } from "../logger.js";
import { frame, FrameReader } from "./codec.js";
import { buildLivePing, tryParseEnvelope, type ParsedEnvelope } from "./envelope.js";

// ============================================================
// 상수 정본 (C# Client.cs L45-60). 다른 모듈이 복제하지 않는다 (IN-01).
// ============================================================

/** 재접속 시도 상한. 소진하면 `exhausted` 를 올리고 멈춘다 (D-16 — 무한 재시도 금지). */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** 지수 백오프 상한(ms). 1→2→4→8→16→30→30… 초. */
export const RECONNECT_MAX_DELAY_MS = 30_000;

/** `LivePing(4)` 송신 주기(ms). 서버 유휴 판정이 90초라 30초면 3배 여유다 (D-32). */
export const PING_INTERVAL_MS = 30_000;

/** TCP 연결 시도 상한(ms). VPN 이 반쯤 죽었을 때 무한 대기하지 않기 위한 값이다. */
export const CONNECT_TIMEOUT_MS = 3_000;

/** 송신 정체 허용 상한(ms). C# `SendTimeout` 대응 — 초과하면 연결을 재수립한다. */
export const SEND_TIMEOUT_MS = 2_000;

/**
 * C# 수신 청크 크기(byte) 정본. **소켓에 주입하지 않는다** — Node 는 스트림 계층이
 * 수신 청크를 관리하고, `net.Socket` 생성자는 이 값을 받는 공개 옵션이 없다
 * (`SocketConstructorOpts` 에 highWaterMark 가 없다. `onread` 로 고정 버퍼를 넣는 길은
 * 있지만 버퍼를 재사용하므로 매 청크 복사가 필요해 이득이 없다).
 * 값을 여기 남기는 이유는 C# 과의 대응표를 코드 한 곳에서 읽을 수 있게 하기 위해서다.
 * 수신 **누적 버퍼 상한**의 정본은 `codec.ts` 의 `MAX_RECV_BUFFER_SIZE`(1MB)다.
 */
export const RECV_CHUNK_SIZE = 8192;

/**
 * 재접속 지연(ms). attempt 1..10 → 1,2,4,8,16,30,30,30,30,30 초 (C# `GetBackoffDelayMs`).
 *
 * 앞쪽을 촘촘히 두는 이유는 VPN 순간 끊김이 대부분 1~2초 안에 복구되기 때문이고,
 * 뒤쪽에 상한을 두는 이유는 게이트웨이가 정말 죽었을 때 두드리지 않기 위해서다.
 */
export function backoffDelayMs(attempt: number): number {
  const n = attempt < 1 ? 1 : attempt;
  const delay = 1000 * 2 ** Math.min(n - 1, 5);
  return Math.min(delay, RECONNECT_MAX_DELAY_MS);
}

// ============================================================
// 이벤트 계약
// ============================================================

/** TCP 연결 수립. 상위는 이 이벤트에서 **단 하나의** 부트 워커를 시작한다 (Pitfall 4). */
export type TransportUpEvent = { generation: number };

/** 단절 확정. `generation` 은 이미 증가한 뒤의 값이다(구세대 워커는 여기서 죽는다). */
export type TransportDownEvent = { reason: string; generation: number };

/** 수신 프레임 1건. `env` 는 슬롯 접근자 핸들이고 의미 해석은 소비자 몫이다. */
export type TransportFrameEvent = ParsedEnvelope & { generation: number };

/** 재접속 예약. 상위가 `reconnecting` 상태 프레임의 시도 회차로 쓴다. */
export type TransportReconnectingEvent = { attempt: number; delayMs: number; reason: string };

/** 재접속 상한 소진. 상위가 `manual_required` 로 승격한다 (D-16). */
export type TransportExhaustedEvent = { attempts: number; reason: string };

export type DmaClientOptions = {
  host: string;
  port: number;
  /** 자동 재접속 사용 여부. 기본 true. 테스트에서 단발 연결만 볼 때 false 로 둔다. */
  autoReconnect?: boolean;
};

// 이벤트 이름·페이로드를 타입으로 묶는다. 선언 병합이라 런타임 비용이 없다.
export interface DmaClient {
  on(event: "up", listener: (e: TransportUpEvent) => void): this;
  on(event: "down", listener: (e: TransportDownEvent) => void): this;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): this;
  on(event: "reconnecting", listener: (e: TransportReconnectingEvent) => void): this;
  on(event: "exhausted", listener: (e: TransportExhaustedEvent) => void): this;
  emit(event: "up", e: TransportUpEvent): boolean;
  emit(event: "down", e: TransportDownEvent): boolean;
  emit(event: "frame", e: TransportFrameEvent): boolean;
  emit(event: "reconnecting", e: TransportReconnectingEvent): boolean;
  emit(event: "exhausted", e: TransportExhaustedEvent): boolean;
}

/**
 * 게이트웨이 TCP 소켓 1개의 수명을 관리한다. 사용자(세션)당 1 인스턴스다 (D-13).
 */
export class DmaClient extends EventEmitter {
  readonly #host: string;
  readonly #port: number;
  readonly #reader = new FrameReader();

  #socket: net.Socket | null = null;
  #generation = 0;
  #reconnectAttempts = 0;
  #autoReconnect: boolean;
  #failedSends = 0;

  #connectTimer: NodeJS.Timeout | null = null;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #pingTimer: NodeJS.Timeout | null = null;
  #sendStallTimer: NodeJS.Timeout | null = null;

  /** `#dropTransport` 가 남긴 종료 사유. close 핸들러가 소비한다. */
  #downReason: string | null = null;

  constructor(opts: DmaClientOptions) {
    super();
    this.#host = opts.host;
    this.#port = opts.port;
    this.#autoReconnect = opts.autoReconnect ?? true;
  }

  // ----------------------------------------------------------
  // 관찰용 게터
  // ----------------------------------------------------------

  /** 현재 전송 세대. 비동기 콜백은 이 값과 자기 세대를 대조한다. */
  get generation(): number {
    return this.#generation;
  }

  /** 소켓이 살아 있는지(= 연결 수립 이후, 아직 닫히지 않음). */
  get connected(): boolean {
    return this.#socket !== null && !this.#socket.destroyed;
  }

  /** 누적 재접속 시도 횟수. Ready 진입 시 상위가 0 으로 되돌린다. */
  get reconnectAttempts(): number {
    return this.#reconnectAttempts;
  }

  /** 자동 재접속이 살아 있는지. `stopReconnect()` 이후 false. */
  get autoReconnect(): boolean {
    return this.#autoReconnect;
  }

  /** 코덱 단계에서 버린 프레임 수 (S-5 — 진단의 원천). */
  get droppedFrameCount(): number {
    return this.#reader.droppedFrameCount;
  }

  /** 송신 실패 누적 횟수. 조용한 실패를 만들지 않기 위한 카운터다. */
  get failedSendCount(): number {
    return this.#failedSends;
  }

  // ----------------------------------------------------------
  // 수명 관리
  // ----------------------------------------------------------

  /** 최초 연결. 이미 소켓이 있으면 아무것도 하지 않는다(중복 연결 금지). */
  connect(): void {
    if (this.#socket !== null) {
      logger.warn({ host: this.#host, port: this.#port }, "[DMA] 이미 연결 중 — connect 무시");
      return;
    }
    this.#autoReconnect = true;
    this.#reconnectAttempts = 0;
    this.#openSocket();
  }

  /**
   * 수동 재접속. 상한 소진(`manual_required`) 이후의 유일한 복구 수단이다.
   * 백오프를 기다리지 않고 즉시 새 소켓을 연다.
   */
  manualReconnect(): void {
    logger.info({ host: this.#host, port: this.#port }, "[DMA] 수동 재접속");
    // [generation 증가 ③] 수동 재접속 — 구세대 워커·타이머를 즉시 무효화한다.
    this.#generation += 1;
    this.#reconnectAttempts = 0;
    this.#autoReconnect = true;
    this.#clearReconnectTimer();
    this.#closeSocketQuietly();
    this.#openSocket();
  }

  /**
   * 자동 재접속 루프를 멈춘다. 서버가 로그인을 **명시 거부**했을 때 상위가 부른다 —
   * 재시도해도 결과가 같고, 백오프마다 같은 거부를 되풀이하면 계정이 잠긴다 (D-16, T-15-10).
   */
  stopReconnect(reason: string): void {
    this.#autoReconnect = false;
    this.#clearReconnectTimer();
    logger.warn({ reason }, "[DMA] 자동 재접속 중단 (재시도해도 결과가 같은 실패)");
  }

  /**
   * 현재 전송만 끊는다. **백오프 카운터를 리셋하지 않으므로** 이어지는 자동 재접속이
   * 상한 10회 안에서 계속 센다.
   *
   * 운용 중(Ready 이후) 부트 재수립이 실패했을 때 상위가 부른다 — 로그인 응답이 5초
   * 안에 오지 않는 연결을 붙들고 있으면 화면이 "로그인 중"에서 멎는다. `manualReconnect()`
   * 를 쓰면 카운터가 0 으로 돌아가 상한이 무력화되므로 그 자리에 쓸 수 없다.
   */
  dropTransport(reason: string): void {
    logger.warn({ reason }, "[DMA] 전송 강제 종료 — 재접속에 넘김");
    this.#dropTransport(reason);
  }

  /** Ready 진입 시 상위가 부른다. "성공"의 기준은 TCP 접속이 아니라 운용 준비다. */
  resetReconnectAttempts(): void {
    if (this.#reconnectAttempts === 0) return;
    logger.info(
      { attempts: this.#reconnectAttempts },
      "[DMA] 운용 준비 완료 — 재접속 카운터 리셋",
    );
    this.#reconnectAttempts = 0;
  }

  /** 종료. 타이머·소켓을 모두 정리하고 세대를 올려 잔류 콜백을 무효화한다. */
  destroy(): void {
    this.#autoReconnect = false;
    this.#clearReconnectTimer();
    this.#closeSocketQuietly();
    // [generation 증가 ④] 종료 — 이후 어떤 구세대 콜백도 보고하지 않는다.
    // 상위(Session)의 부트 실패 확정도 이 경로를 탄다.
    this.#generation += 1;
    logger.info({ generation: this.#generation }, "[DMA] 클라이언트 종료");
  }

  // ----------------------------------------------------------
  // 송신
  // ----------------------------------------------------------

  /**
   * 페이로드 1건 송신 (길이 프레이밍은 여기서 한다).
   *
   * 소켓이 없으면 **false + warn** 이다. 조용히 true 를 돌려주면 "요청은 보냈는데 응답이
   * 없다"로 오진하게 된다 (S-5).
   */
  send(payload: Uint8Array): boolean {
    const sock = this.#socket;
    if (sock === null || sock.destroyed) {
      this.#failedSends += 1;
      logger.warn(
        { bytes: payload.length, failedSendCount: this.#failedSends },
        "[DMA] 송신 실패 — 연결 없음",
      );
      return false;
    }
    try {
      const flushed = sock.write(frame(payload));
      if (!flushed) this.#armSendStallTimer();
      return true;
    } catch (err) {
      this.#failedSends += 1;
      logger.error(
        { err, bytes: payload.length, failedSendCount: this.#failedSends },
        "[DMA] 송신 예외",
      );
      this.#dropTransport("송신 예외");
      return false;
    }
  }

  // ----------------------------------------------------------
  // 내부 — 소켓
  // ----------------------------------------------------------

  #openSocket(): void {
    if (this.#socket !== null) return;

    const sock = new net.Socket();
    this.#socket = sock;
    // TCP_NODELAY — 호가 프레임은 작고 잦다. Nagle 이 켜져 있으면 40ms 단위로 뭉친다 (D-32).
    sock.setNoDelay(true);

    this.#connectTimer = setTimeout(() => {
      this.#connectTimer = null;
      logger.warn(
        { host: this.#host, port: this.#port, timeoutMs: CONNECT_TIMEOUT_MS },
        "[DMA] TCP 연결 시도 시간 초과",
      );
      this.#dropTransport("TCP 연결 시도 시간 초과 (3초)");
    }, CONNECT_TIMEOUT_MS);

    sock.once("connect", () => {
      this.#clearConnectTimer();
      if (this.#socket !== sock) return; // 이미 교체된 소켓 — 아무것도 보고하지 않는다
      this.#onConnected(sock);
    });

    sock.on("error", (err: Error) => {
      // 'error' 다음에 'close' 가 반드시 온다. 상태 정리는 close 한 곳에서만 한다.
      this.#downReason ??= err.message;
      logger.warn({ err, host: this.#host, port: this.#port }, "[DMA] 소켓 오류");
    });

    sock.on("drain", () => {
      this.#clearSendStallTimer();
    });

    sock.once("close", () => {
      this.#clearConnectTimer();
      if (this.#socket !== sock) return; // 구세대 소켓의 뒤늦은 close — 보고하지 않는다
      this.#socket = null;
      this.#stopPing();
      this.#clearSendStallTimer();
      this.#reader.reset(); // 이전 연결의 잔여 바이트를 다음 연결로 흘리지 않는다
      const reason = this.#downReason ?? "게이트웨이가 연결을 닫음";
      this.#downReason = null;
      this.#onTransportDown(reason);
    });

    logger.info({ host: this.#host, port: this.#port }, "[DMA] 연결 시도");
    sock.connect({ host: this.#host, port: this.#port });
  }

  #onConnected(sock: net.Socket): void {
    // [generation 증가 ①] 연결 수립 — 이 시점부터 새 세대다.
    this.#generation += 1;
    const gen = this.#generation;

    this.#reader.reset();
    this.#startPing(gen);

    // 수신 리스너는 세대를 캡처한 클로저다. 구세대 소켓의 잔여 청크는 진입부에서 걸린다.
    sock.on("data", (chunk: Buffer) => {
      this.#onData(chunk, gen);
    });

    logger.info({ host: this.#host, port: this.#port, generation: gen }, "[DMA] 전송 Up");
    this.emit("up", { generation: gen });
  }

  /**
   * 수신 경로. **비동기 대기를 두지 않는다** (D-32 / Pitfall 5) — 여기서 지연되면
   * 게이트웨이의 연결당 송신 큐가 차고 서버가 연결을 끊는다. 소비자(Session·Hub)도
   * 이 콜백 안에서 DB·압축·대량 직렬화를 하면 안 된다.
   */
  #onData(chunk: Buffer, gen: number): void {
    if (gen !== this.#generation) return; // 구세대 — 아무것도 보고하지 않는다

    const { frames, desync } = this.#reader.push(chunk);

    for (const payload of frames) {
      // 소비자가 동기적으로 재접속·종료를 유발할 수 있다. 매 프레임마다 다시 본다.
      if (gen !== this.#generation) return;
      const parsed = tryParseEnvelope(payload);
      if (parsed === null) continue; // 드롭 사유·카운터·hex 는 파서가 남긴다 (S-5)
      this.emit("frame", { msgType: parsed.msgType, env: parsed.env, generation: gen });
    }

    if (desync && gen === this.#generation) {
      // 길이 헤더 손상은 프레임 드롭으로 수습되지 않는다. 다음 경계를 신뢰할 수 없으므로
      // 연결을 다시 세운다 (D-31 / T-15-07).
      logger.error(
        { generation: gen, droppedFrameCount: this.#reader.droppedFrameCount },
        "[DMA] 프레임 경계 유실 — 연결 재수립",
      );
      this.#dropTransport("프레임 경계 유실 (desync)");
    }
  }

  #onTransportDown(reason: string): void {
    // [generation 증가 ②] 단절 확정 — 응답 대기 중인 구세대 워커를 여기서 무효화한다.
    this.#generation += 1;
    const gen = this.#generation;
    logger.warn({ reason, generation: gen }, "[DMA] 전송 Down");
    this.emit("down", { reason, generation: gen });
    this.#scheduleReconnectOrExhaust(reason);
  }

  /** 리스너를 떼고 소켓을 닫는다 — close 핸들러가 down 을 보고하지 않게 한다. */
  #closeSocketQuietly(): void {
    const sock = this.#socket;
    this.#socket = null;
    this.#downReason = null;
    this.#stopPing();
    this.#clearConnectTimer();
    this.#clearSendStallTimer();
    this.#reader.reset();
    if (sock !== null) {
      sock.removeAllListeners();
      sock.on("error", () => {
        // destroy 직후의 ECONNRESET 으로 프로세스를 죽이지 않는다.
      });
      sock.destroy();
    }
  }

  /** 현재 소켓을 끊는다. close 핸들러가 down → 재접속 예약으로 이어 간다. */
  #dropTransport(reason: string): void {
    this.#downReason ??= reason;
    const sock = this.#socket;
    if (sock === null) return;
    sock.destroy();
  }

  // ----------------------------------------------------------
  // 내부 — 재접속
  // ----------------------------------------------------------

  #scheduleReconnectOrExhaust(reason: string): void {
    if (!this.#autoReconnect) {
      logger.info({ reason }, "[DMA] 자동 재접속 꺼짐 — 재예약하지 않음");
      return;
    }

    if (this.#reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      const attempts = this.#reconnectAttempts;
      // 상한 소진. 여기서 멈추지 않으면 KB 계정 잠금·게이트웨이 로그 도배로 이어진다 (T-15-10).
      this.#autoReconnect = false;
      logger.error(
        { attempts, max: MAX_RECONNECT_ATTEMPTS, reason },
        "[DMA] 재접속 상한 소진 — 수동 재접속 필요",
      );
      this.emit("exhausted", { attempts, reason });
      return;
    }

    const attempt = this.#reconnectAttempts + 1;
    const delayMs = backoffDelayMs(attempt);
    logger.warn({ attempt, max: MAX_RECONNECT_ATTEMPTS, delayMs, reason }, "[DMA] 재접속 예약");
    this.emit("reconnecting", { attempt, delayMs, reason });

    this.#clearReconnectTimer();
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (!this.#autoReconnect) return; // 대기 중에 중단 지시가 왔다
      this.#reconnectAttempts = attempt;
      logger.info({ attempt, max: MAX_RECONNECT_ATTEMPTS }, "[DMA] 재접속 시도");
      this.#openSocket();
    }, delayMs);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer === null) return;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  #clearConnectTimer(): void {
    if (this.#connectTimer === null) return;
    clearTimeout(this.#connectTimer);
    this.#connectTimer = null;
  }

  // ----------------------------------------------------------
  // 내부 — 핑 / 송신 정체
  // ----------------------------------------------------------

  /**
   * 30초 주기 핑. **Ready 여부와 무관하게** 연결이 살아 있는 동안 돈다 — 로그인 응답을
   * 기다리는 5초 구간도 서버 입장에서는 유휴이기 때문이다 (D-32).
   */
  #startPing(gen: number): void {
    this.#stopPing();
    this.#pingTimer = setInterval(() => {
      if (gen !== this.#generation) return; // 구세대 타이머 — 아무것도 하지 않는다
      this.send(buildLivePing());
    }, PING_INTERVAL_MS);
  }

  #stopPing(): void {
    if (this.#pingTimer === null) return;
    clearInterval(this.#pingTimer);
    this.#pingTimer = null;
  }

  /**
   * 커널 송신 버퍼가 찼다 = 게이트웨이가 읽지 않는다는 신호다. `drain` 이 2초 안에
   * 오지 않으면 반개방 연결로 보고 재수립한다 (C# `SEND_TIMEOUT_MS` 대응).
   */
  #armSendStallTimer(): void {
    if (this.#sendStallTimer !== null) return;
    logger.warn({ timeoutMs: SEND_TIMEOUT_MS }, "[DMA] 송신 정체 — drain 대기");
    this.#sendStallTimer = setTimeout(() => {
      this.#sendStallTimer = null;
      logger.error({ timeoutMs: SEND_TIMEOUT_MS }, "[DMA] 송신 정체 지속 — 연결 재수립");
      this.#dropTransport("송신 정체 (2초)");
    }, SEND_TIMEOUT_MS);
  }

  #clearSendStallTimer(): void {
    if (this.#sendStallTimer === null) return;
    clearTimeout(this.#sendStallTimer);
    this.#sendStallTimer = null;
  }
}
