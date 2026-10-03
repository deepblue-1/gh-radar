/**
 * Phase 19 Plan 07 — 관찰자 연결 상태기계 (`JournalObserver`).
 *
 * 게이트웨이에 **관찰자 전용 소켓 하나**(`DmaClient`)로 붙어 관찰자 로그인을 하고, 받은 저널
 * 배치를 기록기(`JournalWriter.push`)로 넘긴다. 사용자 세션(`dma/session.ts`)의 축소판이다 —
 * 연결 수명(백오프 · generation · LivePing)은 `DmaClient` 가 그대로 쥐고, 여기서는 로그인과
 * 저널 수신만 판단한다. 와이어 해석은 `JournalCodec` 주입 지점 뒤에 있다(19-09 실 코덱으로 교체 —
 * 코덱 교체로는 이 파일을 고치지 않았다 — 19-09 의 유일한 변경은 resync·oldest 0 의 live 전이다).
 *
 * 흐름:
 *   start() → 커서 읽기(`writer.readCursor`) → connect → "up" → 로그인 요청 1건 → 로그인 응답
 *   → `access.replace(accounts)` · `writer.beginEpoch(epoch, {resync, headSeq})` → 배치마다 `writer.push`
 *   → `caughtUp` 이면 live.
 *
 * 결정 근거:
 *   D-32  수신 콜백("frame")은 **동기**다. 여기서 Supabase 를 await 하면 게이트웨이의 연결당
 *         송신 큐가 차서 서버가 관찰자 연결을 끊는다. `writer.push` 는 동기 적재뿐이다.
 *   D-12  재접속 로그인의 `since_seq` 는 기록기의 마지막 수신 seq, `epoch` 는 기록기의 epoch 다.
 *         로그인 응답의 `resync` 는 기록기 epoch 교체로 이어진다. 기록기가 `gap`/`overflow` 를 돌리면
 *         연결을 끊고(`dropTransport`) 재접속 로그인이 그 since 로 이어받는다.
 *   D-13  **24시간 상시다.** 비밀이 있으면 기동 즉시 커서를 읽고 붙고, 끊기면 `DmaClient` 의 상한 있는
 *         무한 백오프(1→30초)로 계속 재접속한다. **장 시간 판정을 연결 유지에 쓰지 않는다** — 장중 판정은
 *         `/healthz` 알림(`trading-window.ts`) 전용이다.
 *   D-13  **거부 = 정지.** 게이트웨이가 관찰자 로그인을 거부하면 `stopReconnect` 로 루프를 끊고 `rejected`
 *         로 확정한다. 이후 up 이 와도 로그인을 다시 보내지 않는다(재시작 전 복구 없음 — 15 D-16 ·
 *         T-15-10 동형 · T-19-28). 거부 사유는 게이트웨이의 단일 문구 그대로 남기고 추측해 재시도하지 않는다.
 *   D-09  (relay 몫) 관찰자 연결은 **로그인 요청 외에 아무것도 보내지 않는다.** LivePing 은 `DmaClient`
 *         가 소유한다. 서버측 강제는 gh-trade 몫이다.
 *   D-10  비밀은 로그인 페이로드를 만드는 코덱에만 넘긴다. **어떤 로그 인자에도 싣지 않는다**(T-19-03) —
 *         logger redact 는 실수 방어일 뿐이다.
 *   S-5   끊기·버림·재시도는 전부 사유와 함께 로그를 남긴다. 조용한 return 금지(무관한 76 방송만 예외).
 *   P25   **두 스트림 — pending 플래그 2 · since 2 · 주문 먼저.** 80 한 프레임에 주문 저널과 전략 이벤트가 같이
 *         온다(같은 epoch · 별도 seq 공간 · G1 ⓐ). 로그인은 since 를 두 개 싣고(전략 since 는 두 기록기 epoch 가
 *         같을 때만 — Pitfall 3), live 는 두 스트림 pending 이 모두 내려간 뒤다. 배치는 주문 push 를 먼저 하고
 *         그것이 ok 일 때만 전략 push 를 한다 — 주문이 갭/상한으로 끊기면 그 프레임 전략분도 재로그인 since 로 다시 받는다.
 *   WR-01 **전략 역압은 주문 스트림과 분리한다.** 전략 큐 상한(`overflow`)이나 필수 키 계약 위반(파서가 표시)에서는 소켓을
 *         끊지 않고 **전략 수신만 멈춘다**(`#strategyPaused`) — 이후 프레임의 전략분은 버리고(since 는 전진하지 않는다) 주문
 *         레코드는 계속 받는다. 끊으면 전략 쪽 지속 장애(마이그레이션 누락 · 포이즌 이벤트)가 재로그인 반복을 거쳐 주문 저널
 *         503 으로 번진다(Pitfall 4 설계 의도 붕괴). `overflow` 는 전략 큐가 비면 한 번 재로그인해 `strategySinceSeq` 로
 *         이어받는다. `contract` 는 자동 재개하지 않는다(같은 이벤트가 재생된다 — 게이트웨이 수정 몫). 멈춘 사유는
 *         `/healthz` `journal.strategy.paused` 로 드러낸다. 전략 `gap` 은 종전대로 끊는다(재로그인 한 번으로 풀리는 일시 현상).
 *         부팅 경로도 같다(19-REVIEW WR-01) — 연결의 필수 조건은 **주문 커서**뿐이다. 전략 커서 읽기 실패는 `cursor` 로
 *         전략 수신만 멈추고 따로 백오프로 다시 읽는다. 읽히면 한 번 재로그인해 전략 since 로 이어받는다.
 */
import { EventEmitter } from "node:events";

import { backoffDelayMs, DmaClient, type TransportDownEvent, type TransportFrameEvent, type TransportUpEvent } from "../dma/dma-client.js";
import { LOGIN_RESP_TIMEOUT_MS } from "../dma/session.js";
import { logger } from "../logger.js";
import { safePgError } from "../store/pg-error.js";
import type {
  JournalCodec,
  JournalCursor,
  JournalObserverState,
  JournalPushResult,
  JournalRecord,
  ObserverAccountRow,
  ObserverLoginResult,
  ObserverTransport,
  JournalBatchFrame,
  StrategyEventRecord,
  StrategyPauseReason,
} from "./types.js";

/** 전략 수신 일시 중지 로그 문구 — 사유별 한 곳. */
const PAUSE_MESSAGES: Readonly<Record<StrategyPauseReason, string>> = {
  overflow: "[JOURNAL] 전략 큐 상한 — 전략 수신만 일시 중지(주문 저널은 계속 · 큐가 비면 재로그인으로 이어받는다)",
  contract: "[JOURNAL] 전략 이벤트 필수 키 계약 위반 — 전략 수신만 중지(주문 저널은 계속 · 게이트웨이 수정 필요)",
  cursor: "[JOURNAL] 전략 커서 읽기 실패 — 전략 수신만 중지(주문 저널은 계속 · 커서를 다시 읽으면 재로그인으로 이어받는다)",
};

/** 관찰자 로그인 요청의 `client` 값 — 게이트웨이 로그에서 relay 관찰자를 구분한다. */
export const OBSERVER_CLIENT_NAME = "gh-radar-relay";

/** 관찰자가 쓰는 기록기 표면 — `JournalWriter`(주문 · 전략 스트림 둘 다)가 구조적으로 만족한다. */
export type ObserverWriter<R = JournalRecord> = {
  readCursor(): Promise<JournalCursor>;
  beginEpoch(epoch: string, opts: { resync: boolean; headSeq: number }): void;
  push(records: readonly R[]): JournalPushResult;
  readonly epoch: string;
  readonly lastReceivedSeq: number | null;
  /** 큐에 남은 레코드 수(진행 중 배치 포함) — 전략 `overflow` 일시 중지의 재개 판정(WR-01). */
  readonly queueDepth: number;
};

/** 관찰자가 쓰는 매핑 표면 — `JournalAccess` 가 구조적으로 만족한다. */
export type ObserverAccess = {
  replace(rows: readonly ObserverAccountRow[]): void;
};

export type JournalObserverDeps = {
  /** `DMA_OBSERVER_SECRET`. 없으면 관찰자는 disabled 로 남고 아무것도 열지 않는다. */
  secret: string | undefined;
  /** 게이트웨이 식별자(로그 문맥). 예: `"KB"`. */
  gateway: string;
  codec: JournalCodec;
  writer: ObserverWriter;
  /**
   * 전략 이벤트 기록기 (Phase 25 — `createStrategyWriter`). 생략하면 전략 스트림을 받지 않는다 — since 0 ·
   * pending 없음(구 동작). 부팅 결선은 늘 넣는다.
   */
  strategyWriter?: ObserverWriter<StrategyEventRecord>;
  access: ObserverAccess;
  /** 주입하지 않으면 `new DmaClient({host, port})` 를 **하나** 만든다(사용자 세션과 독립 — D-13). */
  transport?: ObserverTransport;
  host: string;
  port: number;
  /** 로그인 요청의 `client`. 기본 `OBSERVER_CLIENT_NAME`. */
  client?: string;
  /** 로그인 응답 대기 상한(ms). 기본 `LOGIN_RESP_TIMEOUT_MS`(session.ts 정본 — 값을 복제하지 않는다). */
  loginTimeoutMs?: number;
};

export interface JournalObserver {
  on(event: "state", listener: (state: JournalObserverState) => void): this;
  off(event: "state", listener: (state: JournalObserverState) => void): this;
  emit(event: "state", state: JournalObserverState): boolean;
}

export class JournalObserver extends EventEmitter {
  readonly #deps: JournalObserverDeps;
  readonly #client: string;
  readonly #loginTimeoutMs: number;
  #transport: ObserverTransport | null;

  /** 시작 전 · 커서 읽기 · TCP 연결 대기는 모두 connecting 이다(아직 붙지 않았다). */
  #state: JournalObserverState = "connecting";
  #headSeq: number | null = null;
  /** 게이트웨이가 알려 준 전략 스트림 head(로그인 응답 · 배치). 아직 모르면 null. */
  #strategyHeadSeq: number | null = null;
  /** 주문 스트림이 아직 head 까지 못 따라잡았다(로그인 판정 · caught_up 이 내린다). */
  #pendingJournal = false;
  /** 전략 스트림이 아직 head 까지 못 따라잡았다. 구 게이트웨이(0/0/false) · 기록기 없음이면 처음부터 거짓. */
  #pendingStrategy = false;
  /** 이 연결에서 전략 수신을 멈춘 사유(WR-01). null = 받는 중. 로그인 성공마다 비운다. */
  #strategyPaused: StrategyPauseReason | null = null;
  #started = false;
  #stopped = false;

  #loginTimer: NodeJS.Timeout | null = null;
  #cursorTimer: NodeJS.Timeout | null = null;
  /** 전략 커서 재읽기 타이머(WR-01 — 전략 커서 실패 격리). */
  #strategyCursorTimer: NodeJS.Timeout | null = null;
  /**
   * 전략 기록기가 DB 커서를 읽었는가(WR-01). 전략 기록기가 없으면 의미 없다(늘 거짓이지만 쓰이지 않는다). 거짓인 동안은
   * 전략 수신이 `cursor` 로 멈춰 있고 로그인 응답이 전략 기록기를 건드리지 않는다.
   */
  #strategyCursorReady = false;
  /** 이미 warn 을 남긴 예상 밖 msgType — 번호별 1회만 알린다. */
  readonly #warnedMsgTypes = new Set<number>();

  readonly #onUp = (e: TransportUpEvent): void => this.#handleUp(e);
  readonly #onDown = (e: TransportDownEvent): void => this.#handleDown(e);

  constructor(deps: JournalObserverDeps) {
    super();
    this.#deps = deps;
    this.#client = deps.client ?? OBSERVER_CLIENT_NAME;
    this.#loginTimeoutMs = deps.loginTimeoutMs ?? LOGIN_RESP_TIMEOUT_MS;
    this.#transport = deps.transport ?? null;
  }

  get state(): JournalObserverState {
    return this.#state;
  }

  /** 게이트웨이가 알려 준 마지막 seq(로그인 응답 · 배치). 아직 모르면 null. */
  get headSeq(): number | null {
    return this.#headSeq;
  }

  /** 게이트웨이가 알려 준 전략 스트림 마지막 seq. 아직 모르면 null(`/healthz` `journal.strategy.headSeq` 원천). */
  get strategyHeadSeq(): number | null {
    return this.#strategyHeadSeq;
  }

  /** 전략 수신을 멈춘 사유. null = 받는 중(`/healthz` `journal.strategy.paused` 원천 · WR-01). */
  get strategyPaused(): StrategyPauseReason | null {
    return this.#strategyPaused;
  }

  // ----------------------------------------------------------
  // 수명
  // ----------------------------------------------------------

  start(): void {
    if (this.#started) {
      logger.warn({ gateway: this.#deps.gateway }, "[JOURNAL] 관찰자 start 중복 — 무시");
      return;
    }
    this.#started = true;
    if (!this.#hasSecret()) {
      // 개발·테스트에서만 여기로 온다 — production 은 config 가 기동을 막는다(D-10).
      this.#setState("disabled");
      logger.warn({ gateway: this.#deps.gateway }, "[JOURNAL] 관찰자 비밀 미설정 — 관찰자 비활성(기록 연결을 열지 않는다)");
      return;
    }

    const transport = this.#transport ?? new DmaClient({ host: this.#deps.host, port: this.#deps.port });
    this.#transport = transport;
    transport.on("up", this.#onUp);
    transport.on("down", this.#onDown);
    // 수신 콜백은 **동기**다 — 여기서 아무것도 기다리지 않는다(D-32). stop() 이후에는 가드가 막는다.
    transport.on("frame", (e) => {
      if (this.#stopped) return;
      this.#handleFrame(e);
    });
    this.#setState("connecting");
    void this.#loadCursorThenConnect(1);
  }

  /**
   * 종료. 타이머를 지우고 리스너를 떼고 전송을 닫는다. 이후 어떤 이벤트도 상태를 바꾸지 않는다.
   * 종료 순서(19-10): `observer.stop()` → `await writer.drain(2000)` → `writer.close()` · `access.close()`.
   */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#clearLoginTimer();
    if (this.#cursorTimer !== null) {
      clearTimeout(this.#cursorTimer);
      this.#cursorTimer = null;
    }
    if (this.#strategyCursorTimer !== null) {
      clearTimeout(this.#strategyCursorTimer);
      this.#strategyCursorTimer = null;
    }
    const transport = this.#transport;
    if (transport !== null) {
      transport.off("up", this.#onUp);
      transport.off("down", this.#onDown);
      transport.destroy();
    }
    logger.info({ gateway: this.#deps.gateway, lastState: this.#state }, "[JOURNAL] 관찰자 종료");
  }

  /**
   * 커서를 읽은 **뒤에만** 연결한다 — since 를 모르고 붙으면 게이트웨이가 전체를 재생한다. **주문 커서만** 연결의
   * 필수 조건이다(읽기 실패는 `backoffDelayMs` 로 무한 재시도 · 상태는 connecting 그대로 — D-13).
   *
   * 전략 커서 읽기 실패는 전략 수신 일시 중지(`cursor`)로 격리한다(19-REVIEW WR-01) — 전략 칸 하나의 장애(마이그레이션
   * 누락 · 권한 · 스키마 캐시)가 주문 저널 연결 자체를 막아 장중 503 으로 번지지 않게. 전략 커서는 따로 백오프로
   * 다시 읽고(`#retryStrategyCursor`), 읽히면 한 번 재로그인해 전략 since 로 이어받는다. 멈춘 동안 받은 전략분은
   * 버린다 — 전략 since 를 모르므로 어떤 값을 보내도 게이트웨이가 보관분 처음부터 재생한다(0 이면 oldest 부터,
   * since > head 면 resync) — 버린 구간은 커서를 읽은 뒤 재로그인이 since 로 다시 받는다.
   */
  async #loadCursorThenConnect(attempt: number): Promise<void> {
    try {
      await this.#deps.writer.readCursor();
    } catch (err) {
      if (this.#stopped) return;
      const retryInMs = backoffDelayMs(attempt);
      logger.error(
        { gateway: this.#deps.gateway, pgError: safePgError(err), attempt, retryInMs },
        "[JOURNAL] 커서 읽기 실패 — 연결하지 않고 재시도",
      );
      this.#cursorTimer = setTimeout(() => {
        this.#cursorTimer = null;
        if (this.#stopped) return;
        void this.#loadCursorThenConnect(attempt + 1);
      }, retryInMs);
      this.#cursorTimer.unref?.();
      return;
    }
    if (this.#stopped) return;
    const strategyWriter = this.#deps.strategyWriter;
    if (strategyWriter !== undefined) {
      try {
        await strategyWriter.readCursor();
        this.#strategyCursorReady = true;
      } catch (err) {
        if (this.#stopped) return;
        this.#pauseStrategy("cursor", { pgError: safePgError(err) });
        this.#scheduleStrategyCursorRetry(1);
      }
    }
    if (this.#stopped) return;
    this.#transport?.connect();
  }

  /** 전략 커서 재읽기 예약 — `backoffDelayMs(attempt)`(1→30초 상한). 연결과 무관하게 돈다(WR-01). */
  #scheduleStrategyCursorRetry(attempt: number): void {
    const retryInMs = backoffDelayMs(attempt);
    this.#strategyCursorTimer = setTimeout(() => {
      this.#strategyCursorTimer = null;
      if (this.#stopped) return;
      void this.#retryStrategyCursor(attempt);
    }, retryInMs);
    this.#strategyCursorTimer.unref?.();
  }

  async #retryStrategyCursor(attempt: number): Promise<void> {
    const strategyWriter = this.#deps.strategyWriter;
    if (strategyWriter === undefined) return;
    try {
      await strategyWriter.readCursor();
    } catch (err) {
      if (this.#stopped) return;
      logger.error(
        { gateway: this.#deps.gateway, pgError: safePgError(err), attempt },
        "[JOURNAL] 전략 커서 읽기 재시도 실패 — 전략 수신 중지 유지(주문 저널은 계속)",
      );
      this.#scheduleStrategyCursorRetry(attempt + 1);
      return;
    }
    if (this.#stopped) return;
    this.#strategyCursorReady = true;
    logger.info(
      { gateway: this.#deps.gateway, strategySinceSeq: strategyWriter.lastReceivedSeq, attempt },
      "[JOURNAL] 전략 커서 복구",
    );
    // 이미 로그인한 연결이면 한 번 재로그인해 전략 since 로 이어받는다. 연결 중 · 로그인 중이면 다음 로그인 응답이
    // 커서를 반영한다(#onLogin — 그 로그인의 전략 since 가 0 이었어도 기록기가 중복을 건너뛰거나 resync 로 받는다).
    if (this.#state === "live" || this.#state === "replaying") {
      this.#dropTransport("전략 커서 복구 — 전략 이어받기");
    }
  }

  // ----------------------------------------------------------
  // 전송 이벤트
  // ----------------------------------------------------------

  #handleUp(e: TransportUpEvent): void {
    const transport = this.#transport;
    if (transport === null || this.#stopped) return;
    if (e.generation !== transport.generation) return; // 구세대 — 아무것도 보고하지 않는다
    if (this.#state === "rejected") {
      // 거부 뒤에는 다시 로그인하지 않는다(D-13 · T-19-28). 재시작 전 복구 없음.
      logger.warn({ gateway: this.#deps.gateway }, "[JOURNAL] 거부된 관찰자에 전송 up — 로그인하지 않는다");
      return;
    }
    const secret = this.#deps.secret;
    if (secret === undefined || secret === "") return;

    const writer = this.#deps.writer;
    const strategyWriter = this.#deps.strategyWriter;
    // `readCursor` 가 기록기에 커서(epoch · lastSeq)를 이미 심었다. null 은 「이어받을 기준 없음」
    // (커서 없음 · 새 epoch 첫 레코드 전)이라 0 이다 — 옛 epoch 의 seq 를 새 epoch 와 짝지으면
    // 게이트웨이가 새 epoch 의 앞 구간을 건너뛴다(Pitfall 3 변형).
    const sinceSeq = writer.lastReceivedSeq ?? 0;
    const epoch = writer.epoch;
    // 로그인 요청의 epoch 는 하나(주문 기록기 epoch)다. 전략 기록기가 다른 epoch(옛 저장소 · 커서 없음)에 있으면
    // 그 seq 를 이 epoch 와 짝지으면 안 된다 — 0 으로 처음부터 받는다(RESEARCH Pitfall 3).
    // 전략 커서를 아직 못 읽었으면(WR-01 `cursor`) 이어받을 기준이 없다 — 0.
    const strategySinceSeq =
      strategyWriter !== undefined && this.#strategyCursorReady && strategyWriter.epoch === writer.epoch
        ? (strategyWriter.lastReceivedSeq ?? 0)
        : 0;
    const payload = this.#deps.codec.buildLoginReq({ secret, sinceSeq, epoch, client: this.#client, strategySinceSeq });
    this.#setState("logging_in");
    if (!transport.send(payload)) {
      // 사유(연결 없음·송신 예외)는 DmaClient 가 남겼다. 이어지는 down → 재접속이 다시 up 을 낸다.
      this.#dropTransport("관찰자 로그인 송신 실패");
      return;
    }
    logger.info({ gateway: this.#deps.gateway, sinceSeq, strategySinceSeq, epoch }, "[JOURNAL] 관찰자 로그인 요청");
    this.#armLoginTimer(e.generation);
  }

  #handleDown(e: TransportDownEvent): void {
    this.#clearLoginTimer();
    if (this.#stopped || this.#state === "rejected" || this.#state === "disabled") return;
    logger.warn({ gateway: this.#deps.gateway, reason: e.reason }, "[JOURNAL] 관찰자 연결 끊김 — DmaClient 가 재접속한다");
    this.#setState("connecting");
  }

  /** **동기다** — await 금지 (D-32). */
  #handleFrame(e: TransportFrameEvent): void {
    const transport = this.#transport;
    if (transport === null) return;
    if (e.generation !== transport.generation) return; // 구세대 프레임
    if (this.#state === "rejected") return;
    const frame = this.#deps.codec.decode(e);
    switch (frame.k) {
      case "login":
        this.#onLogin(frame.result);
        return;
      case "batch":
        this.#onBatch(frame.batch);
        return;
      case "ignore":
        // 관찰자와 무관한 브로드캐스트(76 RateCrossAlert — 로그인 전 연결에도 온다). 조용히 버린다(Pitfall 8).
        return;
      case "unexpected":
        if (!this.#warnedMsgTypes.has(frame.msgType)) {
          this.#warnedMsgTypes.add(frame.msgType);
          logger.warn(
            { gateway: this.#deps.gateway, msgType: frame.msgType },
            "[JOURNAL] 관찰자 연결에 예상 밖 프레임 — 버린다(같은 번호는 다시 알리지 않는다)",
          );
        }
        return;
      case "malformed":
        logger.error({ gateway: this.#deps.gateway, msgType: frame.msgType }, "[JOURNAL] 관찰자 프레임 파손 — 연결 재수립");
        this.#dropTransport("관찰자 프레임 파손");
        return;
    }
  }

  #onLogin(result: ObserverLoginResult): void {
    if (this.#state !== "logging_in") {
      logger.warn({ gateway: this.#deps.gateway, state: this.#state }, "[JOURNAL] 예상 밖 시점의 관찰자 로그인 응답 — 무시");
      return;
    }
    this.#clearLoginTimer();
    if (!result.success) {
      this.#reject(result.message);
      return;
    }
    const writer = this.#deps.writer;
    this.#deps.access.replace(result.accounts);
    // headSeq 를 함께 넘긴다 — 같은 epoch 인데 head 가 마지막 수신 seq 보다 작으면(seq 역행) 기록기가
    // lastReceivedSeq 를 **유지**하고 드러낸다. 그 뒤 head ≤ 수신 이므로 아래 규칙으로 곧바로 live 다.
    writer.beginEpoch(result.epoch, { resync: result.resync, headSeq: result.headSeq });
    // 전략 스트림도 같은 epoch 로 — resync · head 는 전략 스트림 값으로 판정한다(G1 ⓑ).
    // 전략 커서를 아직 못 읽었으면(WR-01 `cursor`) 전략 기록기를 건드리지 않는다 — 커서를 읽은 뒤의 재로그인이 정한다.
    const strategyWriter = this.#deps.strategyWriter;
    const strategyActive = strategyWriter !== undefined && this.#strategyCursorReady;
    if (strategyActive) {
      strategyWriter.beginEpoch(result.epoch, { resync: result.strategyResync, headSeq: result.strategyHeadSeq });
    }
    // 「성공」 의 기준은 TCP 접속이 아니라 관찰자 로그인이다 — 여기서 백오프를 1초로 되돌린다.
    this.#transport?.resetReconnectAttempts();
    // 새 연결 · 새 since — 전략 수신 일시 중지는 연결 단위다(WR-01). 멈춘 동안 버린 구간은 이 로그인의 전략 since 로 재생된다.
    // 단 `cursor` 는 연결 단위가 아니다 — 커서를 읽어야만 풀린다.
    if (this.#strategyPaused !== null && strategyActive) {
      logger.info({ gateway: this.#deps.gateway, reason: this.#strategyPaused }, "[JOURNAL] 재로그인 — 전략 수신 재개");
      this.#strategyPaused = null;
    }
    this.#headSeq = result.headSeq;
    this.#strategyHeadSeq = result.strategyHeadSeq;
    const received = writer.lastReceivedSeq ?? 0;
    logger.info(
      {
        gateway: this.#deps.gateway,
        epoch: result.epoch,
        headSeq: result.headSeq,
        oldestSeq: result.oldestSeq,
        resync: result.resync,
        strategyHeadSeq: result.strategyHeadSeq,
        strategyOldestSeq: result.strategyOldestSeq,
        strategyResync: result.strategyResync,
        accounts: result.accounts.length,
      },
      "[JOURNAL] 관찰자 로그인 성공",
    );
    // resync 인데 재생 원천이 비었으면(oldest 0) 게이트웨이는 보낼 레코드가 없어 배치를 보내지 않고,
    // 다음 append(head+1)부터만 보낸다(gh-trade 23 `DecideResync` · 빈 배치 금지). 여기서 replaying 으로
    // 기다리면 첫 주문 전까지 「기록 지연」, 장중 180초 뒤 `/healthz` 503 거짓 알림이 난다 — 곧바로 live 다.
    // 새 epoch 첫 레코드는 기록기가 seq 확인 없이 받는다(갭 규칙 무변경 · 19-09 ⑥).
    const nothingToReplay = result.resync && result.oldestSeq === 0;
    this.#pendingJournal = !nothingToReplay && result.headSeq > received;
    // 전략 스트림도 같은 규칙을 한 번 더. 구 게이트웨이 · 전략 저널 없음(0/0/false)이면 head 0 이라 처음부터 거짓 —
    // 주문 caught_up 만으로 live 가 된다(RESEARCH Pitfall 2).
    const strategyReceived = strategyWriter?.lastReceivedSeq ?? 0;
    const nothingToReplayStrategy = result.strategyResync && result.strategyOldestSeq === 0;
    this.#pendingStrategy = strategyActive && !nothingToReplayStrategy && result.strategyHeadSeq > strategyReceived;
    this.#setState(this.#pendingJournal || this.#pendingStrategy ? "replaying" : "live");
  }

  #onBatch(batch: JournalBatchFrame): void {
    if (this.#state !== "replaying" && this.#state !== "live") {
      logger.warn(
        {
          gateway: this.#deps.gateway,
          state: this.#state,
          records: batch.records.length,
          strategyEvents: batch.strategyEvents.length,
        },
        "[JOURNAL] 로그인 전 저널 배치 — 버린다",
      );
      return;
    }
    // head 는 게이트웨이가 알려 준 사실이라 적재 결과와 무관하게 갱신한다(lagSeq 원천).
    this.#headSeq = batch.headSeq;
    this.#strategyHeadSeq = batch.strategyHeadSeq;
    // 주문 먼저 — 여기서 끊기면 이 프레임의 전략분은 버리고 재로그인 since 로 다시 받는다(전략 기록기는 아직
    // 이 프레임을 보지 않았으므로 전략 since 가 그대로다 · DB PK 가 겹친 재생을 흡수한다).
    const result = this.#deps.writer.push(batch.records);
    if (result === "gap") {
      // 기록기가 갭 앞까지 적재했다. 재접속 로그인이 since = 마지막 수신 seq 로 이어받는다(D-12).
      this.#dropTransport("저널 seq 갭");
      return;
    }
    if (result === "overflow") {
      // 적재 0. 끊어서 게이트웨이 펌프를 멈추고, 재접속 로그인이 같은 since 로 다시 받는다(T-19-09).
      this.#dropTransport("저널 큐 상한");
      return;
    }
    const strategyWriter = this.#deps.strategyWriter;
    if (strategyWriter !== undefined) {
      if (this.#strategyPaused !== null) {
        // 전략 수신 일시 중지 중(WR-01) — 이 프레임 전략분은 버린다. since 는 전진하지 않았으므로 재로그인이 다시 준다.
        if (this.#strategyPaused === "overflow" && strategyWriter.queueDepth === 0) {
          // 전략 큐가 비었다(적용 복구) — 주문분은 위에서 이미 적재했다. 한 번 재로그인해 전략 since 로 이어받는다.
          logger.info(
            { gateway: this.#deps.gateway, strategySinceSeq: strategyWriter.lastReceivedSeq },
            "[JOURNAL] 전략 큐 해소 — 재로그인으로 전략 수신 재개",
          );
          this.#dropTransport("전략 큐 해소 — 전략 이어받기");
          return;
        }
      } else {
        const strategyResult = strategyWriter.push(batch.strategyEvents);
        if (strategyResult === "gap") {
          this.#dropTransport("전략 seq 갭");
          return;
        }
        if (strategyResult === "overflow") {
          this.#pauseStrategy("overflow", { queueDepth: strategyWriter.queueDepth, incoming: batch.strategyEvents.length });
        } else if (batch.strategyContractViolation) {
          // 파서가 위반 이벤트 **앞까지만** 넘겼다 — 그 앞은 적재됐고, 위반 이벤트부터는 받지 않는다.
          this.#pauseStrategy("contract", { ...batch.strategyContractViolation });
        } else if (batch.strategyCaughtUp) {
          this.#pendingStrategy = false;
        }
      }
    }
    if (batch.caughtUp) this.#pendingJournal = false;
    if (!this.#pendingJournal && !this.#pendingStrategy) this.#setState("live");
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  /**
   * 게이트웨이의 명시 거부. 재시도해도 결과가 같다 — 루프를 끊고 rejected 로 확정한다
   * (15 D-16 · T-15-10 동형 · D-13). 사유는 게이트웨이 문구 그대로 남기고 추측하지 않는다(D-09).
   */
  #reject(gatewayMessage: string): void {
    logger.error({ gateway: this.#deps.gateway, gatewayMessage }, "[JOURNAL] 관찰자 로그인 거부 — 재접속 중단 (D-13)");
    const transport = this.#transport;
    // 루프를 먼저 끊고 전송을 닫는다 — 순서가 바뀌면 닫힘이 부른 down 이 재접속을 예약한다(session #failNoRetry 동형).
    transport?.stopReconnect("관찰자 로그인 거부");
    transport?.destroy();
    this.#setState("rejected");
  }

  /**
   * 전략 수신만 멈춘다(WR-01) — 소켓은 유지하고 주문 저널은 계속 받는다. 전략 pending 을 내려 주문 caught_up 만으로
   * live 에 머물게 한다(전략 쪽 장애가 `journal.state` · `/healthz` 503 으로 번지지 않게). 조용히 멈추지 않는다(S-5).
   */
  #pauseStrategy(reason: StrategyPauseReason, ctx: Record<string, unknown>): void {
    this.#strategyPaused = reason;
    this.#pendingStrategy = false;
    logger.error(
      { gateway: this.#deps.gateway, reason, strategyLastReceivedSeq: this.#deps.strategyWriter?.lastReceivedSeq ?? null, ...ctx },
      PAUSE_MESSAGES[reason],
    );
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
      logger.warn(
        { gateway: this.#deps.gateway, timeoutMs: this.#loginTimeoutMs },
        "[JOURNAL] 관찰자 로그인 응답 타임아웃 — 연결 재수립",
      );
      this.#dropTransport("관찰자 로그인 응답 타임아웃");
    }, this.#loginTimeoutMs);
    this.#loginTimer.unref?.();
  }

  #clearLoginTimer(): void {
    if (this.#loginTimer === null) return;
    clearTimeout(this.#loginTimer);
    this.#loginTimer = null;
  }

  #setState(next: JournalObserverState): void {
    if (this.#state === next) return;
    const from = this.#state;
    this.#state = next;
    logger.info({ gateway: this.#deps.gateway, from, to: next }, "[JOURNAL] 관찰자 상태 전이");
    this.emit("state", next);
  }
}
