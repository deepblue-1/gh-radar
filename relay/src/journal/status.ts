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
 *
 * 브라우저 표식 디바운스(D-04 (a)):
 *   - 파생 상태가 live 를 벗어난 순간 시각을 잡고 `delayedAfterMs`(10초) 타이머를 건다. 만료 때 여전히
 *     live 가 아니면 `{s:"delayed", since}` 를 낸다 — 짧은 재접속 깜빡임은 카드에 드러나지 않는다.
 *   - live 로 돌아오면 타이머를 지우고, 직전 프레임이 delayed(또는 아직 없음)였을 때만 live 를 낸다.
 *   - 기동 시각이 첫 이탈 시각이다 — 기동 후 10초 안에 live 가 못 되면 `since = 기동 시각` 으로 delayed.
 *   - disabled(비밀 미설정)는 표식 대상이 아니다 — 프레임을 내지 않고 스냅샷도 null.
 *
 * 운영 알림(D-04 (b)): `journalAlerting(health, now)` — 장중(`inTradingWindow`)에 rejected 이거나
 * live 가 아닌 지 `JOURNAL_ALERT_AFTER_MS`(180초) 이상이면 true → `/healthz` 503 → 기존 uptime check
 * `gh-radar-relay-healthz` + 정책 `gh-radar-relay-down` 이 알린다(relay 로그는 Cloud Logging 에 없다 —
 * RESEARCH Pattern G). 장 밖에서는 본문에만 드러낸다(D-13).
 */
import { EventEmitter } from "node:events";
import type { RelayJournalStateMsg } from "@gh-radar/shared";

import { inTradingWindow } from "./trading-window.js";
import type {
  JournalDerivedState,
  JournalHealth,
  JournalObserverState,
  JournalWriterHealth,
} from "./types.js";

/** live 를 벗어난 뒤 브라우저에 `delayed` 를 내기까지의 디바운스(ms). */
export const JOURNAL_DELAYED_AFTER_MS = 10_000;

/** 장중에 live 가 아닌 상태가 이 시간 이상 이어지면 `/healthz` 503(운영 알림). rejected 는 즉시. */
export const JOURNAL_ALERT_AFTER_MS = 180_000;

/**
 * `/healthz` 알림 판정(순수 함수). 장 밖이면 항상 false — 본문에만 드러낸다(D-13).
 * disabled(관찰자 비활성)는 알림 대상이 아니다 — 개발·테스트 전용 상태이고 production 은 config 가 막는다.
 */
export function journalAlerting(health: JournalHealth, now: Date): boolean {
  if (!inTradingWindow(now)) return false;
  if (health.state === "rejected") return true;
  if (health.state === "live" || health.state === "disabled") return false;
  return (health.disconnectedSec ?? 0) * 1000 >= JOURNAL_ALERT_AFTER_MS;
}

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
  readonly #delayedAfterMs: number;
  #delayedTimer: NodeJS.Timeout | null = null;

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
    this.#delayedAfterMs = deps.delayedAfterMs ?? JOURNAL_DELAYED_AFTER_MS;
    this.#derived = this.#derive();
    this.#notLiveSinceMs = isTracked(this.#derived) ? this.#now() : null;
    if (this.#notLiveSinceMs !== null) this.#armDelayed();
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
      // seq 역행은 표시 신호다 — 파생 상태·알림(`journalAlerting`)에 섞지 않는다(스트림은 정상으로 이어진다).
      seqRegressions: w.seqRegressions,
      lastSeqRegressionAgeSec:
        w.lastSeqRegressionAtMs !== null ? secondsBetween(w.lastSeqRegressionAtMs, nowMs) : null,
    };
  }

  close(): void {
    this.#clearDelayed();
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
      this.#clearDelayed();
      this.#notLiveSinceMs = null;
      if (this.#lastFrame === null || this.#lastFrame.s === "delayed") {
        this.#publish({ t: "journal.state", s: "live" });
      }
      return;
    }
    if (next === "disabled") {
      this.#clearDelayed();
      this.#notLiveSinceMs = null;
      this.#lastFrame = null;
      return;
    }
    // live 도 disabled 도 아닌 상태 사이의 이동(connecting → logging_in …)은 이탈 시각·타이머를 잇는다.
    if (this.#notLiveSinceMs === null) {
      this.#notLiveSinceMs = this.#now();
      this.#armDelayed();
    }
  }

  /** live 이탈 뒤 `delayedAfterMs` 가 지나도 여전히 끊겨 있으면 delayed 를 낸다. */
  #armDelayed(): void {
    this.#clearDelayed();
    if (this.#lastFrame?.s === "delayed") return; // 이미 delayed 를 냈다 — 복구 전까지 다시 내지 않는다
    this.#delayedTimer = setTimeout(() => {
      this.#delayedTimer = null;
      const since = this.#notLiveSinceMs;
      if (since === null || !isTracked(this.#derived)) return;
      this.#publish({ t: "journal.state", s: "delayed", since: new Date(since).toISOString() });
    }, this.#delayedAfterMs);
    this.#delayedTimer.unref?.();
  }

  #clearDelayed(): void {
    if (this.#delayedTimer === null) return;
    clearTimeout(this.#delayedTimer);
    this.#delayedTimer = null;
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
