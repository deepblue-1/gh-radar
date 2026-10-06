/**
 * Phase 29 Plan 23 — ADMIN-07 · D-11. 시세 주 서버 즉시 전환 (`QuoteSwitch`).
 *
 * quote 연결(관찰자 로그인 role 1 · `QuoteFeed`)을 감싸는 **안정 래퍼**다. hub(`HubQuoteFeed` — `isReady` · `send` ·
 * `on("frame"/"ready")`)와 `QuoteStatus`(`state` · `reconnects` · `lastFrameAtMs` · `on/off("state")`)는 부팅 때 이 객체에
 * 한 번 결선되고, 전환은 **안쪽 `QuoteFeed` 만 바꾼다** — hub · status 재결선이 없다(RESEARCH Pattern 6).
 *
 * 흐름 (D-11 break-then-make — quote 연결은 언제나 1개 · 서버 관찰자 정원):
 *   switchTo(새 서버) → 옛 feed `stop()`(소켓 destroy) → 래퍼 상태 `connecting` → `createFeed(새 서버, 그 증권사 quote 비밀)` →
 *   `start()` → ready 대기(상한 `QUOTE_SWITCH_READY_TIMEOUT_MS`) →
 *     성공: 래퍼 `"ready"` 재방출 → hub `resubscribeAll`(전역 합집합 · 옛 구독 키 그대로) → `{ ok: true }`.
 *            DB(`dma_admin_set_quote_primary`)는 호출자(admin-api)가 **성공 뒤에만** 쓴다.
 *     실패(79 거부 `rejected` · 역할 불일치 `role_mismatch` · 상한 안 ready 없음): 새 feed `stop()` → 옛 서버로 새 feed 를
 *            만들어 다시 연결(옛 feed 는 stop 뒤 재시작이 안 된다) → `{ ok: false, QUOTE_SWITCH_FAILED }`. 옛 서버의 ready 는
 *            평소처럼 래퍼 `"ready"` → hub 재구독으로 이어진다.
 *
 * 결정 근거:
 *   세대 가드   안쪽 feed 이벤트는 `this.#feed === feed` 일 때만 재방출한다 — 교체된 feed 의 늦은 이벤트는 침묵(hub 세션 규율 동형).
 *               교체 때 옛 feed 리스너는 떼어 낸다.
 *   상태 덮기   전환 창(옛 stop ~ 새 ready/실패) 동안 래퍼 `state` 는 `connecting` 이고 안쪽 상태 이벤트는 내보내지 않는다 — 새
 *               서버의 `rejected` · `role_mismatch` 가 잠깐 비쳐 `/healthz` 즉시 503 · 거부 로그 알림이 나가지 않게. 배지는
 *               QuoteStatus 의 3초 디바운스 그대로 적색이 되고, 호가창은 마지막 캐시(Phase 26 D-01)다.
 *   isReady     전환 창 동안 false — hub 는 참조계수만 기록하고, 새 연결 ready 의 합집합 재구독이 메운다(Pitfall 4).
 *   단일 비행   진행 중이면 두 번째 요청은 `QUOTE_SWITCH_BUSY` — 첫 요청의 결과에 손대지 않는다.
 *   무동작     지금 연결 서버와 같은 서버 요청은 연결 변화 없이 `{ ok: true, changed: false }`.
 *   비밀 없음   새 서버 증권사의 quote 비밀이 없으면 끊지 않고 바로 실패 — 비밀 없는 feed 는 disabled 로 남아 10초를 헛되이 쓴다.
 *   복귀 비대기 실패 응답은 옛 서버 재연결을 **시작한 뒤** 바로 돌려준다(옛 서버 ready 를 기다리지 않는다). Express 의 relay
 *               호출 상한(`RELAY_ADMIN_TIMEOUT_MS` 12초) 안에 ready 상한 10초 + 복귀가 들어가야 하기 때문이다.
 *   재접속 수   `reconnects` 는 교체된 feed 들의 누적 + 지금 feed 값이다. 전환 뒤 첫 ready 도 「ready 복귀」 로 1 센다.
 *   T-26-05     비밀 · 호스트는 로그 인자에 싣지 않는다 — 로그 문맥은 서버 키뿐이다.
 *
 * 레지스트리 보정(`reconcileWithRegistry`): DB 시세 주 서버가 다른 경로로 바뀌면(레지스트리 재적재가 본 값이 **직전에 본 값과
 * 다르고** 지금 연결 서버와도 다르면) 같은 break-then-make 로 맞춘다. 실패하면 DB 를 지금 연결 서버로 되돌리는 RPC 1회 +
 * error 로그(직전 값 유지 원칙). 「직전에 본 값」 과 비교하는 이유: admin 전환 직후 그 RPC 커밋 전에 시작된 재적재가 낡은
 * 값을 들고 와도(역할 변경이 겹친 경우) 연결을 되돌리지 않게 한다 — 레지스트리 관점에서 그 값은 바뀐 적이 없다.
 */
import { EventEmitter } from "node:events";

import type { TransportFrameEvent } from "../dma/dma-client.js";
import { logger } from "../logger.js";
import type { DmaBroker, DmaServerRow } from "../registry/registry.js";
import type { QuoteFeed, QuoteFeedReadyEvent, QuoteFeedState } from "./feed.js";

/** 새 서버 ready 대기 상한(ms) — 로그인 응답 타임아웃(5초) + 접속 · 재시도 여유. Express relay 호출 상한(12초) 안이다. */
export const QUOTE_SWITCH_READY_TIMEOUT_MS = 10_000;

/** 전환 대상 서버 — 레지스트리 행 중 연결에 필요한 칸. */
export type QuoteSwitchServer = Pick<DmaServerRow, "key" | "broker" | "host" | "port">;

export type QuoteSwitchDeps = {
  /** 부팅 때 시세 주 서버(`registry.quotePrimary()`). 없으면 비밀 없는 feed(disabled)로 시작한다. */
  initial: QuoteSwitchServer | undefined;
  /** 안쪽 feed 생성기 — index 는 `new QuoteFeed({ secret, host, port, keyCount })`. 서버가 없으면 disabled feed. */
  createFeed: (server: QuoteSwitchServer | undefined, secret: string | undefined) => QuoteFeed;
  /** 증권사 → quote 관찰자 비밀(config `quoteSecretOf` — 26 D-17 폴백 포함). */
  secretOf: (broker: DmaBroker) => string | undefined;
  /** ready 대기 상한(ms). 기본 `QUOTE_SWITCH_READY_TIMEOUT_MS` — 테스트가 짧게 준다. */
  readyTimeoutMs?: number;
};

export type QuoteSwitchErrorCode = "QUOTE_SWITCH_FAILED" | "QUOTE_SWITCH_BUSY";

export type QuoteSwitchResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: QuoteSwitchErrorCode; message: string };

type WaitOutcome = "ready" | "rejected" | "role_mismatch" | "timeout" | "stopped";

export interface QuoteSwitch {
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

export class QuoteSwitch extends EventEmitter {
  readonly #deps: QuoteSwitchDeps;
  readonly #readyTimeoutMs: number;

  #feed: QuoteFeed;
  #server: QuoteSwitchServer | undefined;
  #unwire: (() => void) | null = null;

  #started = false;
  #stopped = false;
  /** 전환 창(옛 stop ~ 새 ready/실패) — 상태를 `connecting` 으로 덮고 isReady 를 false 로 둔다. */
  #switching = false;
  /** switchTo 진행 중(복귀 포함) — 단일 비행 판정. */
  #busy = false;
  #waiter: ((outcome: WaitOutcome) => void) | null = null;
  /** 마지막으로 내보낸 상태 — 같은 상태 재통지를 거른다. */
  #lastState: QuoteFeedState;
  /** 교체된 feed 들의 reconnects 누적 + 전환 뒤 첫 ready 횟수. */
  #reconnectBase = 0;
  #everReady = false;
  /** 교체된 feed 의 마지막 프레임 시각 — 새 feed 가 아직 프레임을 받지 않았을 때 쓴다. */
  #carriedLastFrameAtMs: number | null = null;

  constructor(deps: QuoteSwitchDeps) {
    super();
    this.#deps = deps;
    this.#readyTimeoutMs = deps.readyTimeoutMs ?? QUOTE_SWITCH_READY_TIMEOUT_MS;
    this.#server = deps.initial;
    const secret = deps.initial !== undefined ? deps.secretOf(deps.initial.broker) : undefined;
    this.#feed = deps.createFeed(deps.initial, secret);
    this.#wire(this.#feed);
    this.#lastState = this.#feed.state;
  }

  // ----------------------------------------------------------
  // hub · status 표면
  // ----------------------------------------------------------

  get state(): QuoteFeedState {
    return this.#switching ? "connecting" : this.#feed.state;
  }

  get isReady(): boolean {
    return !this.#switching && this.#feed.isReady;
  }

  get reconnects(): number {
    return this.#reconnectBase + this.#feed.reconnects;
  }

  get lastFrameAtMs(): number | null {
    return this.#feed.lastFrameAtMs ?? this.#carriedLastFrameAtMs;
  }

  /** 지금 quote 연결 대상 서버 키(전환 창 동안은 새 서버). 없으면 null. Admin 서버 카드 시세 칩 원천. */
  get currentServerKey(): string | null {
    return this.#server?.key ?? null;
  }

  /** 전환 진행 중인가. */
  get busy(): boolean {
    return this.#busy;
  }

  send(payload: Uint8Array): boolean {
    if (!this.isReady) return false;
    return this.#feed.send(payload);
  }

  start(): void {
    if (this.#started || this.#stopped) return;
    this.#started = true;
    this.#feed.start();
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#waiter?.("stopped");
    this.#unwire?.();
    this.#unwire = null;
    this.#feed.stop();
  }

  // ----------------------------------------------------------
  // 전환 (D-11)
  // ----------------------------------------------------------

  async switchTo(server: QuoteSwitchServer): Promise<QuoteSwitchResult> {
    if (this.#busy) {
      logger.warn({ to: server.key, current: this.currentServerKey }, "[QUOTE] 시세 주 서버 전환 진행 중 — 두 번째 요청 거절");
      return { ok: false, code: "QUOTE_SWITCH_BUSY", message: "시세 주 서버 전환이 진행 중입니다 — 잠시 뒤 다시 시도하세요" };
    }
    if (this.#stopped) {
      return { ok: false, code: "QUOTE_SWITCH_FAILED", message: "relay 종료 중이라 전환하지 않았습니다" };
    }
    if (this.#server?.key === server.key) return { ok: true, changed: false };
    const secret = this.#deps.secretOf(server.broker);
    if (secret === undefined || secret === "") {
      logger.error({ to: server.key, broker: server.broker }, "[QUOTE] 시세 주 서버 전환 거절 — 그 증권사 quote 비밀 없음");
      return {
        ok: false,
        code: "QUOTE_SWITCH_FAILED",
        message: `${server.key} 증권사의 시세 비밀이 없어 전환하지 않았습니다`,
      };
    }

    const prev = this.#server;
    const prevLabel = prev?.key ?? "시세 연결 없음";
    if (!this.#started) {
      // 부팅 결선 전(start 전) — 연결이 없으니 대상만 바꾼다. start() 가 새 대상으로 연다.
      this.#replace(server, secret);
      return { ok: true, changed: true };
    }

    this.#busy = true;
    const startedAt = Date.now();
    try {
      logger.info({ from: prev?.key ?? null, to: server.key }, "[QUOTE] 시세 주 서버 전환 시작 — 옛 연결을 닫고 새 서버에 로그인");
      this.#switching = true;
      this.#emitState();
      const wait = this.#waitOutcome();
      this.#replace(server, secret);
      const outcome = await wait;
      const elapsedMs = Date.now() - startedAt;
      if (outcome === "ready") {
        logger.info({ from: prev?.key ?? null, to: server.key, elapsedMs }, "[QUOTE] 시세 주 서버 전환 완료 — 합집합 재구독");
        return { ok: true, changed: true };
      }
      this.#switching = false;
      if (outcome === "stopped" || this.#stopped) {
        return { ok: false, code: "QUOTE_SWITCH_FAILED", message: "relay 종료 중이라 전환을 멈췄습니다" };
      }
      logger.error(
        { from: prev?.key ?? null, to: server.key, reason: outcome, elapsedMs },
        "[QUOTE] 시세 주 서버 전환 실패 — 옛 서버로 되돌림",
      );
      this.#replace(prev, prev !== undefined ? this.#deps.secretOf(prev.broker) : undefined);
      this.#emitState();
      return { ok: false, code: "QUOTE_SWITCH_FAILED", message: `새 서버 로그인 실패 — ${prevLabel} 으로 되돌림` };
    } finally {
      this.#switching = false;
      this.#busy = false;
    }
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  /** 옛 feed 를 닫고(리스너 떼기 → stop) 새 feed 를 만들어 결선한다. 시작된 래퍼면 새 feed 도 start. */
  #replace(server: QuoteSwitchServer | undefined, secret: string | undefined): void {
    const old = this.#feed;
    this.#unwire?.();
    this.#unwire = null;
    this.#reconnectBase += old.reconnects;
    this.#carriedLastFrameAtMs = old.lastFrameAtMs ?? this.#carriedLastFrameAtMs;
    old.stop();
    this.#server = server;
    const next = this.#deps.createFeed(server, secret);
    this.#feed = next;
    this.#wire(next);
    if (this.#started && !this.#stopped) next.start();
  }

  #wire(feed: QuoteFeed): void {
    const onState = (s: QuoteFeedState): void => {
      if (this.#feed !== feed) return;
      this.#onInnerState(s);
    };
    const onFrame = (e: TransportFrameEvent): void => {
      if (this.#feed !== feed) return;
      this.emit("frame", e);
    };
    const onReady = (): void => {
      if (this.#feed !== feed) return;
      this.#onInnerReady(feed);
    };
    feed.on("state", onState);
    feed.on("frame", onFrame);
    feed.on("ready", onReady);
    this.#unwire = () => {
      feed.off("state", onState);
      feed.off("frame", onFrame);
      feed.off("ready", onReady);
    };
  }

  #onInnerState(s: QuoteFeedState): void {
    if (this.#switching) {
      // 전환 창 — 거부 · 역할 불일치는 실패 판정으로만 쓰고 밖으로 내보내지 않는다(래퍼는 connecting).
      if (s === "rejected" || s === "role_mismatch") this.#waiter?.(s);
      return;
    }
    this.#emitState();
  }

  #onInnerReady(feed: QuoteFeed): void {
    // 전환 뒤 새 feed 의 첫 ready 도 「ready 복귀」 로 센다(feed 자체 reconnects 는 0 에서 시작한다).
    if (this.#everReady && feed.reconnects === 0) this.#reconnectBase += 1;
    this.#everReady = true;
    if (this.#switching) {
      this.#switching = false;
      this.#waiter?.("ready");
    }
    this.#emitState();
    this.emit("ready", {});
  }

  #waitOutcome(): Promise<WaitOutcome> {
    return new Promise<WaitOutcome>((resolve) => {
      const timer = setTimeout(() => this.#waiter?.("timeout"), this.#readyTimeoutMs);
      timer.unref?.();
      this.#waiter = (outcome) => {
        clearTimeout(timer);
        this.#waiter = null;
        resolve(outcome);
      };
    });
  }

  #emitState(): void {
    const s = this.state;
    if (s === this.#lastState) return;
    this.#lastState = s;
    this.emit("state", s);
  }
}
