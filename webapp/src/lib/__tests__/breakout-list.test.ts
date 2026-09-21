import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RelayRateCrossItem } from "@gh-radar/shared";

import {
  ARM_GRACE_MS,
  BREAKOUT_DISMISSED_KEY,
  BREAKOUT_SOUNDED_KEY,
  BREAKOUT_TONE_KEY,
  HIGHLIGHT_MS,
  REMOVE_MARGIN_PCT,
  TRADING_COLS_KEY,
  addDismissed,
  addSounded,
  breakoutRowsFrom,
  isHighlighted,
  kstDateKey,
  newBreakoutsToAnnounce,
  readColsPref,
  readDatedSet,
  readDismissedSet,
  readSoundedSet,
  readTonePref,
  shouldRemoveBreakout,
  trackBreakoutMeta,
  writeColsPref,
  writeDatedSet,
  writeTonePref,
  type BreakoutRow,
} from "../breakout-list";

/**
 * Phase 18 Plan 04 Task 2 — 돌파 목록의 **클라 몫** 규칙 (D-14~D-18, TRADE-06).
 *
 * 잠그는 명제:
 *  ① KST 날짜 키 집합 — 날짜가 바뀌면 읽을 때 빈 집합(리셋 타이머 없음), 값은 ISIN 만
 *  ② 저장소가 throw 해도 읽기·쓰기가 throw 하지 않는다(Safari 프라이빗 모드)
 *  ③ 이탈 삭제 = 등락률 < 임계−2.0%p ∧ (무장 ∨ 추가 후 3초) — 현재가 모름이면 절대 지우지 않는다
 *  ④ 78 스냅샷 행은 무음·무강조이면서 「울린 종목」에는 기록된다
 *  ⑤ 30초 강조 — 29.9초 참, 30.1초 거짓
 */

const ISIN_A = "KR7005930003";
const ISIN_B = "KR7000660001";
const ISIN_C = "KR7035420009";

function item(patch: Partial<RelayRateCrossItem> = {}): RelayRateCrossItem {
  return {
    isin: ISIN_A,
    exchange: "KRX",
    lastPrice: 12_000,
    changeRate: 20,
    thresholdPct: 20,
    basePrice: 10_000,
    exchangeTime: "090000000000",
    serverTime: "09:00:00",
    ...patch,
  };
}

/** 삭제 판정용 최소 행. 기준가 10,000 · 임계 20. */
function row(patch: Partial<BreakoutRow> = {}): BreakoutRow {
  return {
    ...item(),
    key: `${ISIN_A}|KRX`,
    addedAt: 0,
    armed: false,
    silent: false,
    trading: false,
    highlightUntil: HIGHLIGHT_MS,
    ...patch,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("상수 — 키·폭·시간", () => {
  it("localStorage 키 4종과 규칙 상수가 UI-SPEC 값이다", () => {
    expect(BREAKOUT_SOUNDED_KEY).toBe("gh-radar:breakout-sounded");
    expect(BREAKOUT_DISMISSED_KEY).toBe("gh-radar:breakout-dismissed");
    expect(BREAKOUT_TONE_KEY).toBe("gh-radar:breakout-tone");
    expect(TRADING_COLS_KEY).toBe("gh-radar:trading-cols");
    expect(REMOVE_MARGIN_PCT).toBe(2.0);
    expect(ARM_GRACE_MS).toBe(3_000);
    expect(HIGHLIGHT_MS).toBe(30_000);
  });
});

describe("kstDateKey — KST(UTC+9) yyyyMMdd", () => {
  it("KST 자정 경계 양옆이 서로 다른 날짜 키다", () => {
    expect(kstDateKey(new Date("2026-09-21T14:59:59Z"))).toBe("20260921");
    expect(kstDateKey(new Date("2026-09-21T15:00:01Z"))).toBe("20260922");
  });
});

describe("날짜 키 집합 I/O", () => {
  it("저장된 날짜와 오늘이 다르면 빈 집합이다", () => {
    writeDatedSet(BREAKOUT_SOUNDED_KEY, "20260921", [ISIN_A]);
    expect([...readDatedSet(BREAKOUT_SOUNDED_KEY, "20260921")]).toEqual([ISIN_A]);
    expect(readDatedSet(BREAKOUT_SOUNDED_KEY, "20260922").size).toBe(0);
  });

  it("날짜가 바뀐 뒤 쓰면 어제 값은 버리고 새 날짜로 덮는다", () => {
    addSounded([ISIN_A], "20260921");
    addSounded([ISIN_B], "20260922");
    expect([...readSoundedSet("20260922")]).toEqual([ISIN_B]);
    expect(JSON.parse(window.localStorage.getItem(BREAKOUT_SOUNDED_KEY)!)).toEqual({
      d: "20260922",
      ids: [ISIN_B],
    });
  });

  it("지운 종목 집합도 같은 날짜 키 규율을 따른다", () => {
    addDismissed([ISIN_C], "20260921");
    expect(readDismissedSet("20260921").has(ISIN_C)).toBe(true);
    expect(readDismissedSet("20260922").size).toBe(0);
  });

  it("깨진 JSON 은 「기억 없음」(빈 집합)이다", () => {
    window.localStorage.setItem(BREAKOUT_SOUNDED_KEY, "{not json");
    expect(readSoundedSet("20260921").size).toBe(0);
  });

  it("localStorage 가 throw 해도 읽기·쓰기가 throw 하지 않고 안전 기본값이다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => readDatedSet(BREAKOUT_SOUNDED_KEY, "20260921")).not.toThrow();
    expect(readDatedSet(BREAKOUT_SOUNDED_KEY, "20260921").size).toBe(0);
    expect(() => writeDatedSet(BREAKOUT_SOUNDED_KEY, "20260921", [ISIN_A])).not.toThrow();
    expect(() => addSounded([ISIN_A], "20260921")).not.toThrow();
    expect(() => addDismissed([ISIN_A], "20260921")).not.toThrow();
    expect(readTonePref()).toBe("off");
    expect(() => writeTonePref("on")).not.toThrow();
    expect(readColsPref()).toBe(1);
    expect(() => writeColsPref(3)).not.toThrow();
  });

  it("저장 페이로드에는 날짜와 ISIN 만 있다 — 계좌번호·주문번호·금액이 없다", () => {
    addSounded([ISIN_A, ISIN_B], "20260921");
    addDismissed([ISIN_C], "20260921");
    for (const key of [BREAKOUT_SOUNDED_KEY, BREAKOUT_DISMISSED_KEY]) {
      const parsed = JSON.parse(window.localStorage.getItem(key)!) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(["d", "ids"]);
      for (const id of parsed.ids as string[]) expect(id).toMatch(/^[A-Z]{2}[A-Z0-9]{9}\d$/);
    }
  });
});

describe("기기 설정 — 알림음·단 수", () => {
  it("알림음 기본은 꺼짐이고 켠 값이 다시 읽힌다", () => {
    expect(readTonePref()).toBe("off");
    writeTonePref("on");
    expect(readTonePref()).toBe("on");
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe("on");
  });

  it("단 수 기본은 1 이고 1·2·3 밖 값은 1 로 수렴한다", () => {
    expect(readColsPref()).toBe(1);
    writeColsPref(2);
    expect(readColsPref()).toBe(2);
    window.localStorage.setItem(TRADING_COLS_KEY, "9");
    expect(readColsPref()).toBe(1);
  });
});

describe("shouldRemoveBreakout — 삭제 판정의 유일 지점", () => {
  // 기준가 10,000 → 11,790 = +17.9%, 11,810 = +18.1%. 임계 20 − 2.0 = 18.0.
  it("임계 20 · 등락률 17.9 · 무장됨 → 지운다", () => {
    expect(shouldRemoveBreakout(row({ armed: true }), 11_790, 1_000)).toBe(true);
  });

  it("임계 20 · 등락률 17.9 · 미무장 · 추가 후 1초 → 지우지 않는다(유예 중)", () => {
    expect(shouldRemoveBreakout(row({ armed: false, addedAt: 0 }), 11_790, 1_000)).toBe(false);
  });

  it("임계 20 · 등락률 17.9 · 미무장 · 추가 후 4초 → 지운다(유예 경과)", () => {
    expect(shouldRemoveBreakout(row({ armed: false, addedAt: 0 }), 11_790, 4_000)).toBe(true);
  });

  it("임계 20 · 등락률 18.1 · 무장됨 → 지우지 않는다(경계 −2.0%p 위)", () => {
    expect(shouldRemoveBreakout(row({ armed: true }), 11_810, 10_000)).toBe(false);
  });

  it("현재가를 모르면(undefined) 어떤 조건에서도 지우지 않는다", () => {
    expect(shouldRemoveBreakout(row({ armed: true, changeRate: 0 }), undefined, 999_999)).toBe(
      false,
    );
  });

  it("기준가가 없는 행만 76 등락률로 폴백한다", () => {
    const noBase = row({ basePrice: 0, changeRate: 17.9, armed: true });
    expect(shouldRemoveBreakout(noBase, 1, 10_000)).toBe(true);
    expect(shouldRemoveBreakout({ ...noBase, changeRate: 18.1 }, 1, 10_000)).toBe(false);
  });
});

describe("trackBreakoutMeta — 등재 시각·무장·무음 기록", () => {
  it("새 종목은 now 를 등재 시각으로 받고, 78 유래면 silent 다", () => {
    const m1 = trackBreakoutMeta(new Map(), [item()], { now: 5_000, silent: true });
    expect(m1.get(`${ISIN_A}|KRX`)).toEqual({ addedAt: 5_000, armed: false, silent: true });
    const m2 = trackBreakoutMeta(m1, [item(), item({ isin: ISIN_B })], { now: 9_000, silent: false });
    // 기존 행은 등재 시각을 유지한다(돌파 시각은 첫 등재 값).
    expect(m2.get(`${ISIN_A}|KRX`)?.addedAt).toBe(5_000);
    expect(m2.get(`${ISIN_B}|KRX`)).toEqual({ addedAt: 9_000, armed: false, silent: false });
  });

  it("집합에서 빠진 종목의 기록은 버린다", () => {
    const m1 = trackBreakoutMeta(new Map(), [item(), item({ isin: ISIN_B })], { now: 0, silent: false });
    const m2 = trackBreakoutMeta(m1, [item({ isin: ISIN_B })], { now: 1, silent: false });
    expect(m2.has(`${ISIN_A}|KRX`)).toBe(false);
  });

  it("등재 뒤 임계 이상 현재가를 관측하면 무장하고, 한 번 무장하면 풀리지 않는다", () => {
    const m1 = trackBreakoutMeta(new Map(), [item()], { now: 0, silent: false });
    const m2 = trackBreakoutMeta(m1, [item()], { now: 100, silent: false, priceOf: () => 12_100 });
    expect(m2.get(`${ISIN_A}|KRX`)?.armed).toBe(true);
    const m3 = trackBreakoutMeta(m2, [item()], { now: 200, silent: false, priceOf: () => 11_000 });
    expect(m3.get(`${ISIN_A}|KRX`)?.armed).toBe(true);
    const m4 = trackBreakoutMeta(new Map(), [item()], { now: 0, silent: false, priceOf: () => undefined });
    expect(m4.get(`${ISIN_A}|KRX`)?.armed).toBe(false);
  });
});

describe("breakoutRowsFrom — 서버 집합을 재해석하지 않고 화면 행으로 접는다", () => {
  const items = [item({ isin: ISIN_A }), item({ isin: ISIN_B }), item({ isin: ISIN_C })];

  it("서버 순서를 그대로 유지하고, 지운 종목만 빼고, 카드 있는 종목에 거래중을 붙인다", () => {
    const meta = trackBreakoutMeta(new Map(), items, { now: 0, silent: false });
    const rows = breakoutRowsFrom(items, {
      dismissed: new Set([ISIN_B]),
      cards: new Set([ISIN_C]),
      meta,
    });
    expect(rows.map((r) => r.isin)).toEqual([ISIN_A, ISIN_C]);
    expect(rows.map((r) => r.trading)).toEqual([false, true]);
  });

  it("실시간(76) 행은 highlightUntil = addedAt + 30초 다", () => {
    const meta = trackBreakoutMeta(new Map(), [item()], { now: 1_000, silent: false });
    const [r] = breakoutRowsFrom([item()], { dismissed: new Set(), cards: new Set(), meta });
    expect(r.highlightUntil).toBe(1_000 + HIGHLIGHT_MS);
    expect(r.silent).toBe(false);
  });

  it("78 스냅샷 유래 행은 강조가 없고(highlightUntil null) silent 다", () => {
    const meta = trackBreakoutMeta(new Map(), [item()], { now: 1_000, silent: true });
    const [r] = breakoutRowsFrom([item()], { dismissed: new Set(), cards: new Set(), meta });
    expect(r.highlightUntil).toBeNull();
    expect(r.silent).toBe(true);
    expect(isHighlighted(r, 1_001)).toBe(false);
  });

  it("이탈로 지운 키(removed)는 목록에서 빠진다", () => {
    const meta = trackBreakoutMeta(new Map(), items, { now: 0, silent: false });
    const rows = breakoutRowsFrom(items, {
      dismissed: new Set(),
      cards: new Set(),
      meta,
      removed: new Set([`${ISIN_A}|KRX`]),
    });
    expect(rows.map((r) => r.isin)).toEqual([ISIN_B, ISIN_C]);
  });
});

describe("isHighlighted — 30초 강조", () => {
  it("추가 후 29.9초는 참, 30.1초는 거짓이다", () => {
    const r = row({ addedAt: 0, highlightUntil: HIGHLIGHT_MS });
    expect(isHighlighted(r, 29_900)).toBe(true);
    expect(isHighlighted(r, 30_100)).toBe(false);
  });
});

describe("newBreakoutsToAnnounce — 기록 대상과 소리 대상", () => {
  it("78 스냅샷 행은 「울린 종목」 기록 대상이지만 소리 대상이 아니다", () => {
    const rows = [
      row({ isin: ISIN_A, silent: true }),
      row({ isin: ISIN_B, silent: false }),
      row({ isin: ISIN_C, silent: false }),
    ];
    const out = newBreakoutsToAnnounce(rows, new Set([ISIN_C]));
    expect(out.record).toEqual([ISIN_A, ISIN_B]);
    expect(out.sound).toEqual([ISIN_B]);
  });
});
