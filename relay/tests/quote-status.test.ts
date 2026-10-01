/**
 * Phase 26 Plan 11 — 시세 공유 연결 상태 요약(`QuoteStatus`) · 알림 판정(`quoteAlerting`) (D-02 · D-16).
 *
 * `QuoteStatus` 는 quote 연결 상태를 두 곳의 **한 원천**으로 낸다 — 브라우저 배지 프레임 `{t:"quote.state"}`(3초 디바운스)와
 * `/healthz` 본문(`health(nowMs)`). 판정 규칙은 `journal-status.test.ts` 와 같은 틀로 본다: quote 연결 · hub 는 표면만 흉내 낸
 * 가짜이고, 시각은 가짜 타이머(`Date` 포함)로만 움직인다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayQuoteStateMsg } from "@gh-radar/shared";

import type { QuoteFeedState } from "../src/quote/feed.js";
import {
  QUOTE_ALERT_AFTER_MS,
  QUOTE_DOWN_AFTER_MS,
  QUOTE_STALL_ALERT_AFTER_MS,
  QUOTE_STALL_CHECK_MS,
  QuoteStatus,
  quoteAlerting,
  quoteStalled,
  type QuoteHealth,
} from "../src/quote/status.js";

/** KST 벽시계 → Date. */
function kst(isoLocal: string): Date {
  return new Date(`${isoLocal}+09:00`);
}

/** `QuoteFeed` 의 상태 표면 가짜 — 상태 · 재접속 수 · 마지막 프레임 시각 · `"state"` 이벤트. */
class FakeFeed extends EventEmitter {
  state: QuoteFeedState = "connecting";
  reconnects = 0;
  lastFrameAtMs: number | null = null;
  set(next: QuoteFeedState): void {
    this.state = next;
    this.emit("state", next);
  }
}

const BOOT = new Date("2026-09-28T01:00:00.000Z"); // 월 10:00 KST
const HUB_STATS = { subscriptionCount: 7, lingerCount: 2, subLimitRejects: 3 };

describe("QuoteStatus — quote.state 디바운스 · healthz 본문 (D-02 · D-16)", () => {
  let feed: FakeFeed;
  let status: QuoteStatus | undefined;
  let frames: RelayQuoteStateMsg[];

  function boot(initial: QuoteFeedState = "connecting"): void {
    feed = new FakeFeed();
    feed.state = initial;
    const s = new QuoteStatus({ feed, hubStats: () => HUB_STATS });
    status = s;
    frames = [];
    s.on("frame", (f) => frames.push(f));
  }

  function st(): QuoteStatus {
    if (status === undefined) throw new Error("boot() 전");
    return status;
  }

  beforeEach(() => {
    status = undefined;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(BOOT);
  });

  afterEach(() => {
    status?.close();
    vi.useRealTimers();
  });

  it("상수 정본 — 브라우저 3초 디바운스 · 장중 60초 알림 유예 (A6)", () => {
    expect(QUOTE_DOWN_AFTER_MS).toBe(3_000);
    expect(QUOTE_ALERT_AFTER_MS).toBe(60_000);
  });

  it("기동 후 3초 안 ready → live 프레임 1 · down 0 · 그 전 frame() 은 null", async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(st().frame()).toBeNull();
    feed.set("logging_in");
    feed.set("ready");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(frames).toEqual([{ t: "quote.state", s: "live" }]);
    expect(st().frame()).toEqual({ t: "quote.state", s: "live" });
  });

  it("3초 동안 ready 못 됨 → down 1(since = 기동 시각) · 끊김 사이 이동은 타이머를 새로 걸지 않는다", async () => {
    boot();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(frames).toEqual([]);
    expect(st().frame()).toBeNull();
    feed.set("logging_in");
    await vi.advanceTimersByTimeAsync(1);
    expect(frames).toEqual([{ t: "quote.state", s: "down", since: BOOT.toISOString() }]);
    feed.set("connecting");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(frames).toHaveLength(1);
  });

  it("ready → connecting 2초 → ready → 프레임 추가 0 (깜빡임 흡수)", async () => {
    boot();
    feed.set("ready");
    frames.length = 0;
    feed.set("connecting");
    await vi.advanceTimersByTimeAsync(2_000);
    feed.set("ready");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(frames).toEqual([]);
  });

  it("ready → connecting 5초 → down 1(since = 이탈 시각) → ready → live 1", async () => {
    boot();
    feed.set("ready");
    frames.length = 0;
    await vi.advanceTimersByTimeAsync(5_000);
    const leftAt = new Date(Date.now()).toISOString();
    feed.set("connecting");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(frames).toEqual([{ t: "quote.state", s: "down", since: leftAt }]);
    expect(st().frame()).toEqual({ t: "quote.state", s: "down", since: leftAt });
    feed.set("ready");
    expect(frames).toEqual([
      { t: "quote.state", s: "down", since: leftAt },
      { t: "quote.state", s: "live" },
    ]);
  });

  it("rejected · role_mismatch 도 3초 뒤 down 1 — 배지는 사유를 가리지 않는다", async () => {
    boot();
    feed.set("ready");
    frames.length = 0;
    feed.set("rejected");
    await vi.advanceTimersByTimeAsync(QUOTE_DOWN_AFTER_MS);
    expect(frames).toEqual([{ t: "quote.state", s: "down", since: BOOT.toISOString() }]);

    st().close();
    const rebootAt = new Date(Date.now()).toISOString(); // 두 번째 기동 = 첫 이탈 시각
    boot();
    feed.set("role_mismatch");
    await vi.advanceTimersByTimeAsync(QUOTE_DOWN_AFTER_MS);
    expect(frames).toEqual([{ t: "quote.state", s: "down", since: rebootAt }]);
    expect(st().health(Date.now()).state).toBe("role_mismatch");
  });

  it("disabled → frame null · 프레임 0 · health state disabled · disconnectedSec null", async () => {
    boot("disabled");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(st().frame()).toBeNull();
    expect(frames).toEqual([]);
    expect(st().health(Date.now())).toMatchObject({ state: "disabled", disconnectedSec: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("생성 시점에 이미 ready 면 live 스냅샷이 서 있다 — 인증 직후 frame() 이 null 이 아니다", () => {
    boot("ready");
    expect(st().frame()).toEqual({ t: "quote.state", s: "live" });
    // down 디바운스 타이머는 없다 — ready 동안 도는 정체 점검(WR-01) 하나뿐이다.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("WR-01 ready 인데 장중 · 키 7 · 마지막 프레임 뒤 120초 무수신 → down(since = 마지막 프레임) · 프레임이 다시 오면 live", async () => {
    boot("ready");
    frames.length = 0;
    const lastAt = Date.now();
    feed.lastFrameAtMs = lastAt;

    await vi.advanceTimersByTimeAsync(QUOTE_STALL_ALERT_AFTER_MS - QUOTE_STALL_CHECK_MS);
    expect(frames).toEqual([]);
    await vi.advanceTimersByTimeAsync(QUOTE_STALL_CHECK_MS);
    expect(frames).toEqual([{ t: "quote.state", s: "down", since: new Date(lastAt).toISOString() }]);

    // 워치독 재접속 — ready 로 돌아와도 프레임이 없으면 down 을 지킨다(배지 깜빡임 없음).
    feed.set("connecting");
    await vi.advanceTimersByTimeAsync(1_000);
    feed.set("ready");
    expect(frames).toHaveLength(1);

    // 프레임 재개 → 다음 점검에서 live.
    feed.lastFrameAtMs = Date.now();
    await vi.advanceTimersByTimeAsync(QUOTE_STALL_CHECK_MS);
    expect(frames.at(-1)).toEqual({ t: "quote.state", s: "live" });
    expect(frames).toHaveLength(2);
  });

  it("WR-01 정체가 아닌 끊김 down 은 ready 복귀에서 바로 live — 마지막 프레임이 오래돼도(재구독 스냅샷 전)", async () => {
    boot("ready");
    feed.lastFrameAtMs = Date.now();
    frames.length = 0;
    feed.set("connecting");
    await vi.advanceTimersByTimeAsync(QUOTE_STALL_ALERT_AFTER_MS * 2);
    expect(frames.map((f) => f.s)).toEqual(["down"]);
    feed.set("ready");
    expect(frames.map((f) => f.s)).toEqual(["down", "live"]);
  });

  it("WR-01 장 밖(21:00)에는 오래 무수신이어도 정체 down 을 내지 않는다", async () => {
    vi.setSystemTime(kst("2026-09-28T21:00:00"));
    boot("ready");
    feed.lastFrameAtMs = Date.now();
    frames.length = 0;
    await vi.advanceTimersByTimeAsync(QUOTE_STALL_ALERT_AFTER_MS * 3);
    expect(frames).toEqual([]);
  });

  it("health — 키 집합 7개 고정 · hub stats 그대로 · lastFrameAgeSec · disconnectedSec · 식별자 0 (T-26-18)", async () => {
    boot();
    feed.reconnects = 4;
    feed.lastFrameAtMs = Date.now();
    await vi.advanceTimersByTimeAsync(42_000);
    const h = st().health(Date.now());
    expect(Object.keys(h).sort()).toEqual(
      [
        "state",
        "keyCount",
        "lingerCount",
        "lastFrameAgeSec",
        "reconnects",
        "subLimitRejects",
        "disconnectedSec",
      ].sort(),
    );
    expect(h).toEqual({
      state: "connecting",
      keyCount: 7,
      lingerCount: 2,
      lastFrameAgeSec: 42,
      reconnects: 4,
      subLimitRejects: 3,
      disconnectedSec: 42,
    });
    expect(JSON.stringify(h)).not.toMatch(/accountNo|userId|account_no|user_id/);

    feed.set("ready");
    expect(st().health(Date.now())).toMatchObject({ state: "ready", disconnectedSec: null });
    feed.lastFrameAtMs = null;
    expect(st().health(Date.now()).lastFrameAgeSec).toBeNull();
  });

  it("close 뒤 타이머 0 · feed 리스너 해제", () => {
    boot();
    expect(vi.getTimerCount()).toBe(1);
    expect(feed.listenerCount("state")).toBe(1);
    st().close();
    expect(vi.getTimerCount()).toBe(0);
    expect(feed.listenerCount("state")).toBe(0);
  });
});

// ============================================================
// quoteAlerting
// ============================================================

function qh(state: QuoteFeedState, disconnectedSec: number | null): QuoteHealth {
  return {
    state,
    keyCount: 1,
    lingerCount: 0,
    lastFrameAgeSec: 1,
    reconnects: 0,
    subLimitRejects: 0,
    disconnectedSec,
  };
}

describe("quoteAlerting — 거부 · 역할 불일치 즉시 · 그 밖은 장중 60초 유예 (D-16 · Pitfall 7)", () => {
  const WEEKDAY_IN = kst("2026-09-28T10:00:00"); // 월 10:00
  const WEEKDAY_OUT = kst("2026-09-28T21:00:00"); // 월 21:00 — 장 밖
  const SATURDAY = kst("2026-09-26T10:00:00"); // 토 10:00 — 장 밖

  it("rejected · role_mismatch 는 장중 창과 무관하게 즉시 참 — 평일 21:00 · 토요일 10:00 에도", () => {
    expect(quoteAlerting(qh("rejected", 0), WEEKDAY_OUT)).toBe(true);
    expect(quoteAlerting(qh("role_mismatch", 0), WEEKDAY_OUT)).toBe(true);
    expect(quoteAlerting(qh("rejected", 0), SATURDAY)).toBe(true);
    expect(quoteAlerting(qh("role_mismatch", null), WEEKDAY_IN)).toBe(true);
  });

  it("장 밖의 끊김은 오래가도 거짓 — 평일 21:00 connecting 1시간 · 토요일 10:00 connecting 1시간", () => {
    expect(quoteAlerting(qh("connecting", 3_600), WEEKDAY_OUT)).toBe(false);
    expect(quoteAlerting(qh("connecting", 3_600), SATURDAY)).toBe(false);
  });

  it("장중 끊김은 60초 유예 — 59초 거짓 · 60초 참 · logging_in 도 같다", () => {
    expect(quoteAlerting(qh("connecting", 59), WEEKDAY_IN)).toBe(false);
    expect(quoteAlerting(qh("connecting", 60), WEEKDAY_IN)).toBe(true);
    expect(quoteAlerting(qh("logging_in", 61), WEEKDAY_IN)).toBe(true);
    expect(quoteAlerting(qh("connecting", null), WEEKDAY_IN)).toBe(false);
  });

  it("ready · disabled 는 장중에도 거짓", () => {
    expect(quoteAlerting(qh("ready", null), WEEKDAY_IN)).toBe(false);
    expect(quoteAlerting(qh("disabled", null), WEEKDAY_IN)).toBe(false);
  });

  it("WR-01 ready 수신 정체 — 장중 · 키>0 · lastFrameAgeSec 119 거짓 · 120 참 · 장 밖 · 키 0 · 미수신(null)은 거짓", () => {
    expect(QUOTE_STALL_ALERT_AFTER_MS).toBe(120_000);
    const stalled = (age: number | null, keyCount = 1): QuoteHealth => ({
      ...qh("ready", null),
      lastFrameAgeSec: age,
      keyCount,
    });
    expect(quoteAlerting(stalled(119), WEEKDAY_IN)).toBe(false);
    expect(quoteAlerting(stalled(120), WEEKDAY_IN)).toBe(true);
    expect(quoteStalled(stalled(120), WEEKDAY_IN)).toBe(true);
    expect(quoteAlerting(stalled(3_600), WEEKDAY_OUT)).toBe(false);
    expect(quoteAlerting(stalled(3_600), SATURDAY)).toBe(false);
    expect(quoteAlerting(stalled(3_600, 0), WEEKDAY_IN)).toBe(false);
    expect(quoteAlerting(stalled(null), WEEKDAY_IN)).toBe(false);
    // ready 가 아니면 정체 판정이 아니라 끊김 유예(60초)가 정한다.
    expect(quoteStalled({ ...qh("connecting", 10), lastFrameAgeSec: 3_600 }, WEEKDAY_IN)).toBe(false);
  });
});
