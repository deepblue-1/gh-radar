/**
 * Phase 19 Plan 07 — 장중 창(`inTradingWindow`) · 기록 지연 디바운스(`JournalStatus`) · 알림 판정(`journalAlerting`).
 *
 * 관찰자·기록기는 표면만 흉내 낸 EventEmitter 가짜다 — 이 파일의 관심사는 상태 → 프레임/알림 규칙뿐이다.
 * 시각은 가짜 타이머(`Date` 포함)로만 움직인다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayJournalStateMsg } from "@gh-radar/shared";

import { inTradingWindow } from "../src/journal/trading-window.js";
import {
  JOURNAL_ALERT_AFTER_MS,
  JOURNAL_DELAYED_AFTER_MS,
  JournalStatus,
  journalAlerting,
} from "../src/journal/status.js";
import type { JournalHealth, JournalObserverState, JournalWriterHealth } from "../src/journal/types.js";

/** KST 벽시계 → Date. */
function kst(isoLocal: string): Date {
  return new Date(`${isoLocal}+09:00`);
}

describe("inTradingWindow — 평일 · KRX 휴장일 아님 · 08:00~20:00 KST", () => {
  it.each([
    ["2026-09-28T07:59:00", false, "월 07:59 — 창 전"],
    ["2026-09-28T08:00:00", true, "월 08:00 — 창 시작(포함)"],
    ["2026-09-28T15:31:00", true, "월 15:31 — NXT 애프터마켓(isKoreanMarketOpen 과 다른 지점)"],
    ["2026-09-28T19:59:00", true, "월 19:59"],
    ["2026-09-28T20:00:00", false, "월 20:00 — 창 끝(미포함)"],
    ["2026-09-26T12:00:00", false, "토 12:00"],
    ["2026-09-27T12:00:00", false, "일 12:00"],
    ["2026-09-25T12:00:00", false, "금 12:00 — 추석(KRX 휴장)"],
    ["2026-10-05T10:00:00", false, "월 10:00 — 개천절 대체공휴일(KRX 휴장)"],
  ])("%s → %s (%s)", (local, expected) => {
    expect(inTradingWindow(kst(local))).toBe(expected);
  });

  it("KST 날짜 경계 — UTC 로는 전날 23:00 인 월요일 08:00 KST 도 월요일로 판정한다", () => {
    const d = new Date("2026-09-27T23:00:00Z"); // = 2026-09-28 08:00 KST
    expect(inTradingWindow(d)).toBe(true);
  });
});

// ============================================================
// JournalStatus 디바운스
// ============================================================

class FakeObserver extends EventEmitter {
  state: JournalObserverState = "connecting";
  headSeq: number | null = null;
  set(next: JournalObserverState): void {
    this.state = next;
    this.emit("state", next);
  }
}

class FakeWriter extends EventEmitter {
  h: JournalWriterHealth = {
    queueDepth: 0,
    consecutiveFailures: 0,
    dbError: false,
    lastAppliedSeq: null,
    lastAppliedAtMs: null,
    seqRegressions: 0,
    lastSeqRegressionAtMs: null,
  };
  health(): JournalWriterHealth {
    return this.h;
  }
  setDbError(dbError: boolean): void {
    this.h = { ...this.h, dbError, consecutiveFailures: dbError ? 3 : 0 };
    this.emit("health", this.h);
  }
}

const BOOT = new Date("2026-09-28T01:00:00.000Z"); // 월 10:00 KST

describe("JournalStatus — journal.state 디바운스 (D-04 (a))", () => {
  let observer: FakeObserver;
  let writer: FakeWriter;
  let status: JournalStatus | undefined;
  let frames: RelayJournalStateMsg[];

  function boot(initial: JournalObserverState = "connecting"): void {
    observer = new FakeObserver();
    observer.state = initial;
    writer = new FakeWriter();
    const s = new JournalStatus({ observer, writer });
    status = s;
    frames = [];
    s.on("frame", (f) => frames.push(f));
  }

  function st(): JournalStatus {
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

  it("상수 정본 — 10초 디바운스 · 180초 알림", () => {
    expect(JOURNAL_DELAYED_AFTER_MS).toBe(10_000);
    expect(JOURNAL_ALERT_AFTER_MS).toBe(180_000);
  });

  it("기동 후 10초 안 live → live 프레임 1 · delayed 0", async () => {
    boot();
    await vi.advanceTimersByTimeAsync(4_000);
    observer.set("logging_in");
    observer.set("replaying");
    observer.set("live");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(frames).toEqual([{ t: "journal.state", s: "live" }]);
    expect(st().frame()).toEqual({ t: "journal.state", s: "live" });
  });

  it("10초 동안 live 못 됨 → delayed(since = 기동 시각) 1 · 그 전 스냅샷은 null", async () => {
    boot();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(frames).toEqual([]);
    expect(st().frame()).toBeNull();
    observer.set("logging_in"); // 끊김 사이의 이동은 타이머를 새로 걸지 않는다
    await vi.advanceTimersByTimeAsync(1);
    expect(frames).toEqual([{ t: "journal.state", s: "delayed", since: BOOT.toISOString() }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(frames).toHaveLength(1);
  });

  it("live → connecting 3초 → live 복귀 → 프레임 추가 0 (깜빡임 흡수)", async () => {
    boot();
    observer.set("live");
    frames.length = 0;
    observer.set("connecting");
    await vi.advanceTimersByTimeAsync(3_000);
    observer.set("live");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(frames).toEqual([]);
  });

  it("live → connecting 12초 → delayed 1(since = 이탈 시각) → live 복귀 → live 1", async () => {
    boot();
    observer.set("live");
    frames.length = 0;
    await vi.advanceTimersByTimeAsync(5_000);
    const leftAt = new Date(Date.now()).toISOString();
    observer.set("connecting");
    await vi.advanceTimersByTimeAsync(12_000);
    expect(frames).toEqual([{ t: "journal.state", s: "delayed", since: leftAt }]);
    expect(st().frame()).toEqual({ t: "journal.state", s: "delayed", since: leftAt });
    observer.set("live");
    expect(frames).toEqual([
      { t: "journal.state", s: "delayed", since: leftAt },
      { t: "journal.state", s: "live" },
    ]);
  });

  it("writer dbError → 파생 db_error → 10초 뒤 delayed · 복구 → live", async () => {
    boot();
    observer.set("live");
    frames.length = 0;
    writer.setDbError(true);
    expect(st().health(Date.now()).state).toBe("db_error");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.s).toBe("delayed");
    writer.setDbError(false);
    expect(frames[1]).toEqual({ t: "journal.state", s: "live" });
  });

  it("rejected 는 기록기 오류로 덮이지 않는다 — 파생 상태 rejected", () => {
    boot();
    observer.set("rejected");
    writer.setDbError(true);
    expect(st().health(Date.now()).state).toBe("rejected");
  });

  it("disabled → frame null · 프레임 0 · disconnectedSec null", async () => {
    boot();
    observer.set("disabled");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(st().frame()).toBeNull();
    expect(frames).toEqual([]);
    expect(st().health(Date.now())).toMatchObject({ state: "disabled", disconnectedSec: null });
  });

  it("health — lagSeq · disconnectedSec · lastAppliedAgeSec 계산", async () => {
    boot();
    observer.headSeq = 120;
    writer.h = { ...writer.h, lastAppliedSeq: 100, lastAppliedAtMs: Date.now() };
    await vi.advanceTimersByTimeAsync(42_000);
    expect(st().health(Date.now())).toEqual({
      state: "connecting",
      lastSeq: 100,
      headSeq: 120,
      lagSeq: 20,
      disconnectedSec: 42,
      lastAppliedAgeSec: 42,
      seqRegressions: 0,
      lastSeqRegressionAgeSec: null,
    });
    // seq 역행 신호는 카운터 + 마지막 관측 뒤 경과초로 드러난다(상태는 바꾸지 않는다).
    writer.h = { ...writer.h, seqRegressions: 1, lastSeqRegressionAtMs: Date.now() - 5_000 };
    expect(st().health(Date.now())).toMatchObject({ state: "connecting", seqRegressions: 1, lastSeqRegressionAgeSec: 5 });
    observer.set("live");
    expect(st().health(Date.now()).disconnectedSec).toBeNull();
  });

  it("close 뒤 타이머 0", () => {
    boot();
    expect(vi.getTimerCount()).toBe(1);
    st().close();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ============================================================
// journalAlerting
// ============================================================

function health(state: JournalHealth["state"], disconnectedSec: number | null): JournalHealth {
  return { state, lastSeq: 1, headSeq: 1, lagSeq: 0, disconnectedSec, lastAppliedAgeSec: 1, seqRegressions: 0, lastSeqRegressionAgeSec: null };
}

describe("journalAlerting — 장중 180초 · rejected 즉시 · 장 밖 false (D-04 (b))", () => {
  const IN = kst("2026-09-28T10:00:00");
  const OUT = kst("2026-09-28T21:00:00");

  it.each([
    ["live", null, IN, false],
    ["connecting", 179, IN, false],
    ["connecting", 180, IN, true],
    ["logging_in", 200, IN, true],
    ["rejected", 0, IN, true],
    ["db_error", 181, IN, true],
    ["disabled", null, IN, false],
    ["connecting", 3600, OUT, false],
    ["rejected", 0, OUT, false],
  ] as const)("%s · %s초 · %s → %s", (state, sec, now, expected) => {
    expect(journalAlerting(health(state, sec), now)).toBe(expected);
  });
});
