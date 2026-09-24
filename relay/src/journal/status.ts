/**
 * Phase 19 Plan 07 — 기록 연결 상태 요약 (`JournalStatus`).
 *
 * 관찰자 상태(`JournalObserver`)와 기록기 관측값(`JournalWriter.health`)을 **한 원천**으로 묶어 두 곳에
 * 내보낸다 (D-04):
 *   (a) 브라우저 표식 — `{t:"journal.state"}` 프레임(`frame` 이벤트 → `WsFanout.deliverJournalState`,
 *       인증 직후 스냅샷은 `frame()`).
 *   (b) `/healthz` 의 `journal` 필드 — `health(nowMs)`.
 *
 * 파생 상태 = 관찰자 상태에 기록기 `db_error`(적용 RPC 연속 실패)를 겹친 것이다.
 */
import { EventEmitter } from "node:events";
import type { RelayJournalStateMsg } from "@gh-radar/shared";

import type {
  JournalDerivedState,
  JournalHealth,
  JournalObserverState,
  JournalWriterHealth,
} from "./types.js";

/** live 를 벗어난 뒤 브라우저에 `delayed` 를 내기까지의 디바운스(ms). */
export const JOURNAL_DELAYED_AFTER_MS = 10_000;

/** 상태가 보는 관찰자 표면 — `JournalObserver` 가 만족한다. */
export type StatusObserverView = {
  readonly state: JournalObserverState;
  readonly headSeq: number | null;
  on(event: "state", listener: (state: JournalObserverState) => void): unknown;
  off(event: "state", listener: (state: JournalObserverState) => void): unknown;
};

/** 상태가 보는 기록기 표면 — `JournalWriter` 가 만족한다. */
export type StatusWriterView = {
  health(): JournalWriterHealth;
  on(event: "health", listener: (health: JournalWriterHealth) => void): unknown;
  off(event: "health", listener: (health: JournalWriterHealth) => void): unknown;
};

export type JournalStatusDeps = {
  observer: StatusObserverView;
  writer: StatusWriterView;
  /** live 이탈 → `delayed` 프레임 디바운스(ms). 기본 `JOURNAL_DELAYED_AFTER_MS`. */
  delayedAfterMs?: number;
  /** 시각 원천(epoch ms). 기본 `Date.now`. */
  now?: () => number;
};

export interface JournalStatus {
  on(event: "frame", listener: (frame: RelayJournalStateMsg) => void): this;
  emit(event: "frame", frame: RelayJournalStateMsg): boolean;
}

export class JournalStatus extends EventEmitter {
  readonly #observer: StatusObserverView;
  readonly #writer: StatusWriterView;
  readonly #now: () => number;

  #derived: JournalDerivedState;
  /** live 를 벗어난 시각. live · disabled 면 null. 기동 시각이 첫 값이다(아직 붙지 않았다). */
  #notLiveSinceMs: number | null;
  /** 마지막으로 낸 프레임. 아직 판정 전이거나 disabled 면 null. */
  #lastFrame: RelayJournalStateMsg | null = null;

  readonly #onChange = (): void => this.#reevaluate();

  constructor(deps: JournalStatusDeps) {
    super();
    this.#observer = deps.observer;
    this.#writer = deps.writer;
    this.#now = deps.now ?? Date.now;
    this.#derived = this.#derive();
    this.#notLiveSinceMs = isTracked(this.#derived) ? this.#now() : null;
    this.#observer.on("state", this.#onChange);
    this.#writer.on("health", this.#onChange);
  }

  /** 인증 직후 스냅샷. 관찰자 disabled 이거나 아직 판정 전이면 null — 모르면 보내지 않는다. */
  frame(): RelayJournalStateMsg | null {
    return this.#lastFrame;
  }

  /** `/healthz` 의 `journal` 필드. 식별자를 담지 않는다(T-19-07). */
  health(nowMs: number): JournalHealth {
    const w = this.#writer.health();
    const state = this.#derive();
    const headSeq = this.#observer.headSeq;
    const lastSeq = w.lastAppliedSeq;
    return {
      state,
      lastSeq,
      headSeq,
      lagSeq: headSeq !== null && lastSeq !== null ? Math.max(headSeq - lastSeq, 0) : null,
      disconnectedSec:
        isTracked(state) && this.#notLiveSinceMs !== null ? secondsBetween(this.#notLiveSinceMs, nowMs) : null,
      lastAppliedAgeSec: w.lastAppliedAtMs !== null ? secondsBetween(w.lastAppliedAtMs, nowMs) : null,
    };
  }

  close(): void {
    this.#observer.off("state", this.#onChange);
    this.#writer.off("health", this.#onChange);
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  #derive(): JournalDerivedState {
    const s = this.#observer.state;
    // rejected·disabled 는 관찰자가 확정한 상태라 기록기 오류로 덮지 않는다(rejected 는 즉시 알림 대상이다).
    if (s === "rejected" || s === "disabled") return s;
    return this.#writer.health().dbError ? "db_error" : s;
  }

  #reevaluate(): void {
    const next = this.#derive();
    if (next === this.#derived) return;
    this.#derived = next;

    if (next === "live") {
      this.#notLiveSinceMs = null;
      if (this.#lastFrame === null || this.#lastFrame.s === "delayed") {
        this.#publish({ t: "journal.state", s: "live" });
      }
      return;
    }
    if (next === "disabled") {
      this.#notLiveSinceMs = null;
      this.#lastFrame = null;
      return;
    }
    this.#notLiveSinceMs ??= this.#now();
  }

  #publish(frame: RelayJournalStateMsg): void {
    this.#lastFrame = frame;
    this.emit("frame", frame);
  }
}

/** live 도 disabled 도 아닌 상태 — 「끊겨 있다」 로 세는 상태. */
function isTracked(state: JournalDerivedState): boolean {
  return state !== "live" && state !== "disabled";
}

function secondsBetween(fromMs: number, toMs: number): number {
  return Math.max(Math.floor((toMs - fromMs) / 1000), 0);
}
