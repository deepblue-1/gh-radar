/**
 * Phase 26 Plan 11 — 시세 공유 연결 상태 요약 (`QuoteStatus`). `relay/src/journal/status.ts`(Phase 19 D-04)와 같은 틀이다.
 *
 * quote 연결(`QuoteFeed` · 관찰자 role 1)의 상태를 **한 원천**으로 묶어 두 곳에 내보낸다 (D-02 · D-16):
 *   (a) 브라우저 배지 「시세」 축(D-01) — `{t:"quote.state"}` 프레임(`frame` 이벤트 · 인증 직후 스냅샷은 `frame()`).
 *   (b) `/healthz` 의 `quote` 필드 — `health(nowMs)`. 결선은 26-12(healthz · fanout)다.
 * 두 곳이 같은 객체를 읽으므로 배지와 알림이 어긋나지 않는다 — 공유 연결은 D-03(폴백 없음)으로 단일 장애점이 됐고,
 * 운영자는 「시세가 멈췄는가」 를 한눈에 봐야 한다.
 *
 * 브라우저 배지 디바운스:
 *   - quote 연결이 ready 를 벗어난 순간 시각을 잡고 `QUOTE_DOWN_AFTER_MS`(3초) 타이머를 건다. 만료 때 여전히 ready 가
 *     아니면 `{s:"down", since}` 를 낸다 — 짧은 재접속 깜빡임은 배지에 드러나지 않는다.
 *   - ready 로 돌아오면 타이머를 지우고, 직전 프레임이 down(또는 아직 없음)이었을 때만 live 를 낸다.
 *   - 기동 시각이 첫 이탈 시각이다 — 기동 후 3초 안에 ready 가 못 되면 `since = 기동 시각` 으로 down.
 *   - 생성 시점에 이미 ready 면 live 스냅샷을 바로 세운다(인증 직후 `frame()` 이 null 이 아니다).
 *   - disabled(비밀 미설정)는 표식 대상이 아니다 — 프레임을 내지 않고 스냅샷도 null.
 *   - rejected · role_mismatch 도 배지에서는 down 이다(사유 구분은 healthz 본문 `state` 가 한다).
 *
 * 운영 알림(D-16): `quoteAlerting(health, now)` — `rejected` · `role_mismatch` 는 설정 오류라 기다려도 풀리지 않으므로 장중
 * 창과 무관하게 즉시 참. 그 밖 not-live 는 장중(`inTradingWindow` · KST 평일 · 비휴장 · 08:00~20:00)에 `QUOTE_ALERT_AFTER_MS`
 * (60초) 이상 이어질 때만 참이다 — 유예가 없으면 기동 직후 · 서버 재기동마다 503 이 나서 deploy-relay.sh 의 `curl -sf`
 * 기동 확인과 e2e `waitForRelay` 가 깨진다(RESEARCH Pitfall 7 · A6). D-02 의 「Ready 가 아니면 503」 은 이 규칙으로 좁혀진다.
 *
 * 식별자 금지 (T-26-18): `QuoteHealth` 는 7키 고정 — 상태 · 계수 · 경과초뿐이다. 계좌 · 사용자 식별자 · 호스트 · 비밀을 싣지
 * 않는다(`/healthz` 는 공개 경로이고 smoke `health_probe` 가 식별자 키를 grep 한다). 프레임에도 계좌 · 사용자가 없다.
 */
import { EventEmitter } from "node:events";
import type { RelayQuoteStateMsg } from "@gh-radar/shared";

import { inTradingWindow } from "../journal/trading-window.js";
import type { QuoteFeedState } from "./feed.js";

/**
 * ready 를 벗어난 뒤 브라우저에 `down` 을 내기까지의 디바운스(ms) = 3초. 시세 배지는 끊김을 빨리 보여야 해 기록 연결
 * (`JOURNAL_DELAYED_AFTER_MS` 10초)보다 짧다 — 시세가 멈춘 채 트레이더가 모르고 있는 시간이 곧 손실이다(RESEARCH A6).
 */
export const QUOTE_DOWN_AFTER_MS = 3_000;

/**
 * 장중에 ready 가 아닌 상태가 이 시간 이상 이어지면 `/healthz` 503(운영 알림) = 60초. 유예가 없으면 기동 직후 503 이라
 * 배포 스크립트 · e2e 부팅이 깨진다(RESEARCH Pitfall 7 · A6). rejected · role_mismatch 는 유예 없이 즉시.
 */
export const QUOTE_ALERT_AFTER_MS = 60_000;

/** `/healthz` 의 `quote` 필드 — 7키 고정 · 식별자 없음(T-26-18). */
export type QuoteHealth = {
  /** quote 연결 상태 기계 그대로(`disabled · connecting · logging_in · ready · rejected · role_mismatch`). */
  state: QuoteFeedState;
  /** 업스트림 live 키 수(hub `subscriptionCount`). */
  keyCount: number;
  /** linger 중인 키 수(D-10). */
  lingerCount: number;
  /** quote 연결로 마지막 프레임을 받은 뒤 경과초. 한 번도 없으면 null. */
  lastFrameAgeSec: number | null;
  /** ready 복귀 누적 수(첫 ready 제외). */
  reconnects: number;
  /** 구독 한도 거부 누적 수(D-11 · D-15). */
  subLimitRejects: number;
  /** ready 를 벗어난 뒤 경과초. ready · disabled 면 null. */
  disconnectedSec: number | null;
};

/**
 * `/healthz` 알림 판정(순수 함수 · D-16). 판정 순서가 계약이다 — 거부 · 역할 불일치 검사가 장중 창 판정보다 **먼저**다.
 */
export function quoteAlerting(health: QuoteHealth, now: Date): boolean {
  // 로그인 거부 · 역할 불일치는 설정 오류라 기다려도 풀리지 않는다 — 장 밖에도 즉시 알린다.
  if (health.state === "rejected" || health.state === "role_mismatch") return true;
  if (!inTradingWindow(now)) return false;
  if (health.state === "ready" || health.state === "disabled") return false;
  return (health.disconnectedSec ?? 0) * 1000 >= QUOTE_ALERT_AFTER_MS;
}

export type QuoteStatusDeps = {
  /** quote 연결 상태 표면 — `QuoteFeed` 가 만족한다. */
  feed: {
    readonly state: QuoteFeedState;
    readonly reconnects: number;
    readonly lastFrameAtMs: number | null;
    on(event: "state", listener: (state: QuoteFeedState) => void): unknown;
    off(event: "state", listener: (state: QuoteFeedState) => void): unknown;
  };
  /** hub 요약(`SubscriptionHub.stats()`) 중 시세 계수 3칸. */
  hubStats: () => { subscriptionCount: number; lingerCount: number; subLimitRejects: number };
};

export interface QuoteStatus {
  on(event: "frame", listener: (frame: RelayQuoteStateMsg) => void): this;
  emit(event: "frame", frame: RelayQuoteStateMsg): boolean;
}

export class QuoteStatus extends EventEmitter {
  readonly #feed: QuoteStatusDeps["feed"];
  readonly #hubStats: QuoteStatusDeps["hubStats"];
  #downTimer: NodeJS.Timeout | null = null;
  /** ready 를 벗어난 시각. ready · disabled 면 null. 기동 시각이 첫 값이다(아직 붙지 않았다). */
  #notLiveSinceMs: number | null;
  /** 마지막으로 낸 프레임. 아직 판정 전이거나 disabled 면 null. */
  #lastFrame: RelayQuoteStateMsg | null = null;

  readonly #onState = (): void => this.#reevaluate();

  constructor(deps: QuoteStatusDeps) {
    super();
    this.#feed = deps.feed;
    this.#hubStats = deps.hubStats;
    this.#notLiveSinceMs = deps.feed.state === "disabled" ? null : Date.now();
    this.#feed.on("state", this.#onState);
    this.#reevaluate();
  }

  /** 인증 직후 스냅샷. quote 연결 disabled 이거나 아직 판정 전이면 null — 모르면 보내지 않는다. */
  frame(): RelayQuoteStateMsg | null {
    return this.#lastFrame;
  }

  /** `/healthz` 의 `quote` 필드. 식별자 · 호스트 · 비밀을 담지 않는다(T-26-18). */
  health(nowMs: number): QuoteHealth {
    const state = this.#feed.state;
    const hub = this.#hubStats();
    const lastFrameAtMs = this.#feed.lastFrameAtMs;
    return {
      state,
      keyCount: hub.subscriptionCount,
      lingerCount: hub.lingerCount,
      lastFrameAgeSec: lastFrameAtMs !== null ? secondsBetween(lastFrameAtMs, nowMs) : null,
      reconnects: this.#feed.reconnects,
      subLimitRejects: hub.subLimitRejects,
      disconnectedSec:
        isTracked(state) && this.#notLiveSinceMs !== null ? secondsBetween(this.#notLiveSinceMs, nowMs) : null,
    };
  }

  close(): void {
    this.#clearDownTimer();
    this.#feed.off("state", this.#onState);
  }

  // ----------------------------------------------------------
  // 내부
  // ----------------------------------------------------------

  /** 현재 feed 상태로 다시 판정한다 — 멱등이라 같은 상태의 재통지 · 생성자 초기 판정에서 그대로 부른다. */
  #reevaluate(): void {
    const state = this.#feed.state;
    if (state === "ready") {
      this.#clearDownTimer();
      this.#notLiveSinceMs = null;
      if (this.#lastFrame === null || this.#lastFrame.s === "down") this.#publish({ t: "quote.state", s: "live" });
      return;
    }
    if (state === "disabled") {
      this.#clearDownTimer();
      this.#notLiveSinceMs = null;
      this.#lastFrame = null;
      return;
    }
    // ready 도 disabled 도 아닌 상태 사이의 이동(connecting → logging_in …)은 이탈 시각 · 타이머를 잇는다.
    if (this.#notLiveSinceMs === null) this.#notLiveSinceMs = Date.now();
    if (this.#downTimer === null) this.#armDown();
  }

  /** ready 이탈 뒤 `QUOTE_DOWN_AFTER_MS` 가 지나도 여전히 끊겨 있으면 down 을 낸다. */
  #armDown(): void {
    if (this.#lastFrame?.s === "down") return; // 이미 down 을 냈다 — 복구 전까지 다시 내지 않는다
    this.#downTimer = setTimeout(() => {
      this.#downTimer = null;
      const since = this.#notLiveSinceMs;
      if (since === null || !isTracked(this.#feed.state)) return;
      const frame: RelayQuoteStateMsg = { t: "quote.state", s: "down", since: new Date(since).toISOString() };
      if (this.#lastFrame?.s === "down" && this.#lastFrame.since === frame.since) return;
      this.#publish(frame);
    }, QUOTE_DOWN_AFTER_MS);
    this.#downTimer.unref?.();
  }

  #clearDownTimer(): void {
    if (this.#downTimer === null) return;
    clearTimeout(this.#downTimer);
    this.#downTimer = null;
  }

  #publish(frame: RelayQuoteStateMsg): void {
    this.#lastFrame = frame;
    this.emit("frame", frame);
  }
}

/** ready 도 disabled 도 아닌 상태 — 「끊겨 있다」 로 세는 상태. */
function isTracked(state: QuoteFeedState): boolean {
  return state !== "ready" && state !== "disabled";
}

function secondsBetween(fromMs: number, toMs: number): number {
  return Math.max(Math.floor((toMs - fromMs) / 1000), 0);
}
