/**
 * Phase 19 Plan 07 — 관찰자 연결 상태기계 (`JournalObserver`).
 *
 * 게이트웨이에 **관찰자 전용 소켓 하나**(`DmaClient`)로 붙어 관찰자 로그인을 하고, 받은 저널
 * 배치를 기록기(`JournalWriter.push`)로 넘긴다. 사용자 세션(`dma/session.ts`)의 축소판이다 —
 * 연결 수명(백오프 · generation · LivePing)은 `DmaClient` 가 그대로 쥐고, 여기서는 로그인과
 * 저널 수신만 판단한다. 와이어 해석은 `JournalCodec` 주입 지점 뒤에 있다(19-09 실 코덱으로 교체 —
 * 이 파일은 무수정).
 *
 * 흐름:
 *   start() → 커서 읽기(`writer.readCursor`) → connect → "up" → 로그인 요청 1건 → 로그인 응답
 *   → `access.replace(accounts)` · `writer.beginEpoch(epoch, {resync})` → 배치마다 `writer.push`
 *   → `caughtUp` 이면 live.
 *
 * 결정 근거:
 *   D-32  수신 콜백("frame")은 **동기**다. 여기서 Supabase 를 await 하면 게이트웨이의 연결당
 *         송신 큐가 차서 서버가 관찰자 연결을 끊는다. `writer.push` 는 동기 적재뿐이다.
 *   D-12  재접속 로그인의 `since_seq` 는 기록기의 마지막 수신 seq, `epoch` 는 기록기의 epoch 다.
 *         로그인 응답의 `resync` 는 기록기 epoch 교체로 이어진다.
 */
import { EventEmitter } from "node:events";

import { DmaClient, type TransportDownEvent, type TransportFrameEvent, type TransportUpEvent } from "../dma/dma-client.js";
import { LOGIN_RESP_TIMEOUT_MS } from "../dma/session.js";
import { logger } from "../logger.js";
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
} from "./types.js";

/** 관찰자 로그인 요청의 `client` 값 — 게이트웨이 로그에서 relay 관찰자를 구분한다. */
export const OBSERVER_CLIENT_NAME = "gh-radar-relay";

/** 관찰자가 쓰는 기록기 표면 — `JournalWriter` 가 구조적으로 만족한다. */
export type ObserverWriter = {
  readCursor(): Promise<JournalCursor>;
  beginEpoch(epoch: string, opts: { resync: boolean }): void;
  push(records: readonly JournalRecord[]): JournalPushResult;
  readonly epoch: string;
  readonly lastReceivedSeq: number | null;
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
  #started = false;
  #stopped = false;

  #loginTimer: NodeJS.Timeout | null = null;

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

  // ----------------------------------------------------------
  // 수명
  // ----------------------------------------------------------

  start(): void {
    if (this.#started) {
      logger.warn({ gateway: this.#deps.gateway }, "[JOURNAL] 관찰자 start 중복 — 무시");
      return;
    }
    this.#started = true;
    const secret = this.#deps.secret;
    if (secret === undefined || secret === "") {
      this.#setState("disabled");
      logger.warn({ gateway: this.#deps.gateway }, "[JOURNAL] DMA_OBSERVER_SECRET 미설정 — 관찰자 비활성");
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
    void this.#loadCursorThenConnect();
  }

  async #loadCursorThenConnect(): Promise<void> {
    await this.#deps.writer.readCursor();
    if (this.#stopped) return;
    this.#transport?.connect();
  }

  // ----------------------------------------------------------
  // 전송 이벤트
  // ----------------------------------------------------------

  #handleUp(e: TransportUpEvent): void {
    const transport = this.#transport;
    if (transport === null || this.#stopped) return;
    if (e.generation !== transport.generation) return; // 구세대 — 아무것도 보고하지 않는다
    const secret = this.#deps.secret;
    if (secret === undefined || secret === "") return;

    const writer = this.#deps.writer;
    // `readCursor` 가 기록기에 커서(epoch · lastSeq)를 이미 심었다. null 은 「이어받을 기준 없음」
    // (커서 없음 · 새 epoch 첫 레코드 전)이라 0 이다 — 옛 epoch 의 seq 를 새 epoch 와 짝지으면
    // 게이트웨이가 새 epoch 의 앞 구간을 건너뛴다(Pitfall 3 변형).
    const sinceSeq = writer.lastReceivedSeq ?? 0;
    const payload = this.#deps.codec.buildLoginReq({ secret, sinceSeq, epoch: writer.epoch, client: this.#client });
    this.#setState("logging_in");
    transport.send(payload);
    logger.info({ gateway: this.#deps.gateway, sinceSeq, epoch: writer.epoch }, "[JOURNAL] 관찰자 로그인 요청");
    this.#armLoginTimer(e.generation);
  }

  #handleDown(_e: TransportDownEvent): void {
    this.#clearLoginTimer();
    if (this.#stopped) return;
    this.#setState("connecting");
  }

  /** **동기다** — await 금지 (D-32). */
  #handleFrame(e: TransportFrameEvent): void {
    const transport = this.#transport;
    if (transport === null || this.#stopped) return;
    if (e.generation !== transport.generation) return; // 구세대 프레임
    const frame = this.#deps.codec.decode(e);
    switch (frame.k) {
      case "login":
        this.#onLogin(frame.result);
        return;
      case "batch":
        this.#onBatch(frame.batch);
        return;
      default:
        return;
    }
  }

  #onLogin(result: ObserverLoginResult): void {
    this.#clearLoginTimer();
    const writer = this.#deps.writer;
    this.#deps.access.replace(result.accounts);
    writer.beginEpoch(result.epoch, { resync: result.resync });
    this.#transport?.resetReconnectAttempts();
    this.#headSeq = result.headSeq;
    const received = writer.lastReceivedSeq ?? 0;
    logger.info(
      {
        gateway: this.#deps.gateway,
        epoch: result.epoch,
        headSeq: result.headSeq,
        oldestSeq: result.oldestSeq,
        resync: result.resync,
        accounts: result.accounts.length,
      },
      "[JOURNAL] 관찰자 로그인 성공",
    );
    this.#setState(result.headSeq > received ? "replaying" : "live");
  }

  #onBatch(batch: JournalBatchFrame): void {
    const result = this.#deps.writer.push(batch.records);
    if (result === "ok") {
      this.#headSeq = batch.headSeq;
      if (batch.caughtUp) this.#setState("live");
    }
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  #armLoginTimer(gen: number): void {
    this.#clearLoginTimer();
    this.#loginTimer = setTimeout(() => {
      this.#loginTimer = null;
      if (this.#transport === null || gen !== this.#transport.generation) return;
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
