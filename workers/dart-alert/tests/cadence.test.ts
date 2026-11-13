import { afterEach, describe, expect, it } from "vitest";
import { kstDateString } from "../src/apiUsage";
import {
  coverPointMs,
  everyMsAt,
  EXCHANGE_POLL_MS,
  isInWindow,
  isLateAt,
  kstDayOfWeek,
  kstMinuteOfDay,
  kstYmd,
  LAP_INTERVAL_MS,
  LATE_GAP_MS,
  lapIntervalMs,
  lateGapMs,
  plannedDailyCalls,
  plannedDailyLaps,
  plannedDailyPolls,
  pollSlot,
  prevWeekdayYmd,
  PREOPEN_END_MIN,
  RIGHTS_REGULAR_POLL_MS,
  SLOW_POLL_MS,
  START_GRACE_MS,
  WINDOW_END_MIN,
  WINDOW_START_MIN,
  windowEndMs,
  windowStartMs,
} from "../src/cadence";
import { DART_DAILY_BUDGET_LIMIT } from "../src/config";
import { buildWatches, DEFAULT_B001_KINDS } from "../src/watches";

/** 매 바퀴 감시 대상 n개(everyMs null) — 예산 가드 근거용 */
const everyLap = (n: number) => Array.from({ length: n }, () => ({ everyMs: null }));
const WATCHES = buildWatches({ b001Kinds: DEFAULT_B001_KINDS });
const watchOf = (id: string) => WATCHES.find((w) => w.id === id)!;
const KEY1 = WATCHES.filter((w) => w.key === 1);
const KEY2 = WATCHES.filter((w) => w.key === 2);

/**
 * Phase 43-03 — 시간대 · 바퀴 간격 · 늦은 알림 기준점 · 하루 호출 수(D-10 · D-11 · D-12 · SC-4).
 * 261113-rn7 U-2 — 종일 5초 바퀴(D-10 대체) · 감시 대상별 간격(`everyMsAt`) · 키별 하루 호출.
 * 시각은 epoch ms 숫자. 2026-11-16 = 월요일 · 2026-11-14 = 토 · 2026-11-15 = 일 · 2026-12-25 = 금(공휴일).
 */
function kst(y: number, m: number, d: number, h: number, mi: number, s = 0): number {
  return Date.UTC(y, m - 1, d, h - 9, mi, s);
}

const MON = (h: number, mi: number, s = 0) => kst(2026, 11, 16, h, mi, s);

describe("상수", () => {
  it("창 07:00(420) ~ 20:00(1200) · B001 전환 09:00(540) · 바퀴 5초 · B001 뒤 10초 · I001 10초 · 30초 칸 · 여유 120초 · 늦음 60초", () => {
    expect(WINDOW_START_MIN).toBe(420);
    expect(PREOPEN_END_MIN).toBe(540);
    expect(WINDOW_END_MIN).toBe(1200);
    expect(LAP_INTERVAL_MS).toBe(5_000);
    expect(RIGHTS_REGULAR_POLL_MS).toBe(10_000);
    expect(EXCHANGE_POLL_MS).toBe(10_000);
    expect(SLOW_POLL_MS).toBe(30_000);
    expect(START_GRACE_MS).toBe(120_000);
    expect(LATE_GAP_MS).toBe(60_000);
  });

  it("kstMinuteOfDay · kstDayOfWeek 는 UTC 시각을 KST 로 옮겨 읽는다", () => {
    // UTC 일요일 22:00 = KST 월요일 07:00
    const at = Date.UTC(2026, 10, 15, 22, 0);
    expect(kstMinuteOfDay(at)).toBe(420);
    expect(kstDayOfWeek(at)).toBe(1);
  });
});

describe("lapIntervalMs (종일 5초 · D-11)", () => {
  it.each([
    ["월 06:59:59", null, MON(6, 59, 59)],
    ["월 07:00:00", 5000, MON(7, 0, 0)],
    ["월 08:59:55", 5000, MON(8, 59, 55)],
    ["월 09:00:00", 5000, MON(9, 0, 0)],
    ["월 19:59:55", 5000, MON(19, 59, 55)],
    ["월 20:00:00", null, MON(20, 0, 0)],
    ["월 23:59:59", null, MON(23, 59, 59)],
    ["토 10:00", null, kst(2026, 11, 14, 10, 0)],
    ["일 10:00", null, kst(2026, 11, 15, 10, 0)],
    ["금 공휴일 2026-12-25 10:00(휴장일 달력 없음)", 5000, kst(2026, 12, 25, 10, 0)],
  ])("%s → %s", (_label, want, at) => {
    expect(lapIntervalMs(at)).toBe(want);
  });

  it("isInWindow 는 평일 420 ≤ 분 < 1200 이고 주말은 늘 밖", () => {
    expect(isInWindow(MON(6, 59, 59))).toBe(false);
    expect(isInWindow(MON(7, 0))).toBe(true);
    expect(isInWindow(MON(19, 59, 59))).toBe(true);
    expect(isInWindow(MON(20, 0))).toBe(false);
    expect(isInWindow(kst(2026, 11, 14, 12, 0))).toBe(false);
  });

  describe("컨테이너 TZ 와 무관", () => {
    const saved = process.env.TZ;
    afterEach(() => {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    });

    it.each(["America/New_York", "UTC", "Asia/Seoul"])("TZ=%s 에서도 같은 답", (tz) => {
      process.env.TZ = tz;
      expect(lapIntervalMs(MON(7, 0))).toBe(5000);
      expect(lapIntervalMs(MON(20, 0))).toBe(null);
      expect(kstYmd(MON(0, 30))).toBe("20261116");
      expect(windowStartMs(MON(12, 0))).toBe(MON(7, 0));
    });
  });
});

describe("하루 호출 수 (SC-4 · 공식 API 운영 기준 ①)", () => {
  it("평일 하루를 바퀴 시작 대 시작으로 걸으면 46,800초 ÷ 5 = 9,360바퀴", () => {
    let laps = 0;
    for (let t = MON(7, 0); t < MON(20, 0); ) {
      const iv = lapIntervalMs(t);
      expect(iv).not.toBeNull();
      // 간격이 0 · 아주 작은 값이면 이 걷기가 사실상 끝나지 않는다 — 바퀴 상한으로 바로 실패시킨다
      expect(iv!).toBeGreaterThanOrEqual(LAP_INTERVAL_MS);
      laps++;
      if (laps > 20_000) throw new Error(`lap walk runaway at ${laps} laps`);
      t += iv!;
    }
    expect(laps).toBe(9_360);
    expect(plannedDailyLaps()).toBe(9_360);
  });

  it("평일 하루 86,400초를 1초 단위로 돌려 간격별 초를 세면 5초가 46,800초 — 46,800 ÷ 5 = 9,360바퀴", () => {
    let lapS = 0;
    let offS = 0;
    for (let t = MON(0, 0); t < kst(2026, 11, 17, 0, 0); t += 1_000) {
      const iv = lapIntervalMs(t);
      if (iv === LAP_INTERVAL_MS) lapS++;
      else if (iv === null) offS++;
      else throw new Error(`unexpected interval ${iv}`);
    }
    expect(lapS).toBe(46_800);
    expect(offS).toBe(86_400 - 46_800);
    expect(lapS / 5).toBe(9_360);
  });

  it("everyMsAt — 09:00 앞이고 preopenEveryMs 가 정의돼 있으면 그 값(null 포함) · 아니면 everyMs", () => {
    expect(everyMsAt({ everyMs: 10_000, preopenEveryMs: null }, MON(8, 59, 55))).toBeNull();
    expect(everyMsAt({ everyMs: 10_000, preopenEveryMs: null }, MON(9, 0, 0))).toBe(10_000);
    expect(everyMsAt({ everyMs: 10_000 }, MON(7, 0))).toBe(10_000);
    expect(everyMsAt({ everyMs: null }, MON(15, 0))).toBeNull();
  });

  it("감시 대상 꼴별 하루 조회 수 — 매 바퀴 9,360 · B001 꼴 1,440 + 3,960 = 5,400 · 10초 칸 4,680 · 30초 칸 1,560", () => {
    // 매 바퀴: 46,800 ÷ 5
    expect(plannedDailyPolls({ everyMs: null })).toBe(9_360);
    // B001: 07:00 ~ 09:00 매 바퀴 7,200 ÷ 5 = 1,440 + 09:00 ~ 20:00 10초 칸 39,600 ÷ 10 = 3,960
    expect(plannedDailyPolls({ everyMs: RIGHTS_REGULAR_POLL_MS, preopenEveryMs: null })).toBe(5_400);
    // I001: 46,800 ÷ 10 · 30초 칸: 46,800 ÷ 30
    expect(plannedDailyPolls({ everyMs: EXCHANGE_POLL_MS })).toBe(4_680);
    expect(plannedDailyPolls({ everyMs: SLOW_POLL_MS })).toBe(1_560);
    expect(plannedDailyPolls(watchOf("tender_offer"))).toBe(9_360);
    expect(plannedDailyPolls(watchOf("rights_merger"))).toBe(5_400);
    expect(plannedDailyPolls(watchOf("exchange_disclosure"))).toBe(4_680);
    expect(plannedDailyPolls(watchOf("insider_trade_plan"))).toBe(1_560);
  });

  it("키 1(D004 · B001) = 9,360 + 5,400 = 14,760 · 아침 전날 확인 2(각 1쪽)를 더해 14,762 ≤ 15,000", () => {
    expect(KEY1.map((w) => w.id)).toEqual(["tender_offer", "rights_merger"]);
    expect(plannedDailyCalls(KEY1)).toBe(14_760);
    expect(plannedDailyCalls(KEY1) + 2).toBe(14_762);
    expect(plannedDailyCalls(KEY1) + 2).toBeLessThanOrEqual(DART_DAILY_BUDGET_LIMIT);
  });

  it("키 2(I003 · I001 · I004 · D005) = 1,560 + 4,680 + 1,560 + 1,560 = 9,360 · I001 매 조회 2쪽 최악 + 4,680 · 전날 확인 약 5 → 14,045 ≤ 15,000", () => {
    expect(KEY2.map((w) => w.id)).toEqual(["market_action", "exchange_disclosure", "largest_holder_change", "insider_trade_plan"]);
    expect(plannedDailyCalls(KEY2)).toBe(9_360);
    // 전날 확인 = I001 2쪽(100건 초과 · 전 쪽) + 셋 각 1쪽
    const worst2 = plannedDailyCalls(KEY2) + plannedDailyPolls(watchOf("exchange_disclosure")) + 5;
    expect(worst2).toBe(14_045);
    expect(worst2).toBeLessThanOrEqual(DART_DAILY_BUDGET_LIMIT);
  });

  it("키 1 에 매 바퀴 감시 대상이 하나 더 붙으면 9,360 × 2 + 5,400 = 24,120 으로 상한을 넘는다 — 목록 · 예산 동시 점검 근거", () => {
    expect(plannedDailyCalls([...KEY1, ...everyLap(1)])).toBe(24_120);
    expect(plannedDailyCalls([...KEY1, ...everyLap(1)])).toBeGreaterThan(DART_DAILY_BUDGET_LIMIT);
  });

  it("주말 하루는 바퀴 0", () => {
    // 172,800초를 초마다 expect 하면 기계가 바쁠 때 5초 제한을 넘는다 — 어긋난 초만 모아 한 번에 단언한다(검사 범위는 같다)
    const offWindow: number[] = [];
    for (let t = kst(2026, 11, 14, 0, 0); t < kst(2026, 11, 16, 0, 0); t += 1_000) {
      if (lapIntervalMs(t) !== null) offWindow.push(t);
    }
    expect(offWindow).toEqual([]);
  });
});

describe("pollSlot — 07:00 기준 조회 칸(261113-iez)", () => {
  it("10초 칸 · 30초 칸 · 바퀴마다(null)", () => {
    expect(pollSlot(MON(7, 0, 0), EXCHANGE_POLL_MS)).toBe(0);
    expect(pollSlot(MON(7, 0, 10) - 1, EXCHANGE_POLL_MS)).toBe(0);
    expect(pollSlot(MON(7, 0, 10), EXCHANGE_POLL_MS)).toBe(1);
    // 09:00 = 7,200초 → 10초 칸 720 · 30초 칸 240
    expect(pollSlot(MON(9, 0, 0), EXCHANGE_POLL_MS)).toBe(720);
    expect(pollSlot(MON(9, 0, 0), SLOW_POLL_MS)).toBe(240);
    expect(pollSlot(MON(9, 0, 0), null)).toBeNull();
  });
});

describe("prevWeekdayYmd — 아침 전날 확인 날짜(261113-rn7 U-3 · 휴장일 달력 없음)", () => {
  it.each([
    ["월 2026-11-16 07:00 → 금", kst(2026, 11, 16, 7, 0), "20261113"],
    ["화 2026-11-17 07:00 → 월", kst(2026, 11, 17, 7, 0), "20261116"],
    ["토 2026-11-14 10:00 → 금", kst(2026, 11, 14, 10, 0), "20261113"],
    ["일 2026-11-15 10:00 → 금", kst(2026, 11, 15, 10, 0), "20261113"],
    ["월 00:00:00 경계 → 금", kst(2026, 11, 16, 0, 0), "20261113"],
    ["월 23:59:59 경계 → 금", kst(2026, 11, 16, 23, 59, 59), "20261113"],
    ["금 공휴일 2026-12-25 → 목", kst(2026, 12, 25, 7, 0), "20261224"],
    ["해 넘김 금 2027-01-01 → 목 2026-12-31", kst(2027, 1, 1, 7, 0), "20261231"],
  ])("%s", (_label, at, want) => {
    expect(prevWeekdayYmd(at)).toBe(want);
  });
});

describe("windowStartMs · windowEndMs", () => {
  it("그날 KST 07:00 / 20:00 의 epoch ms", () => {
    expect(windowStartMs(MON(12, 34, 56))).toBe(MON(7, 0));
    expect(windowEndMs(MON(12, 34, 56))).toBe(MON(20, 0));
    expect(windowStartMs(MON(7, 0))).toBe(Date.UTC(2026, 10, 15, 22, 0));
  });

  it("자정 근처(KST 화 00:30 = 월 UTC 15:30)에서도 KST 날짜 기준", () => {
    const at = Date.UTC(2026, 10, 16, 15, 30);
    expect(windowStartMs(at)).toBe(kst(2026, 11, 17, 7, 0));
    expect(windowEndMs(at)).toBe(kst(2026, 11, 17, 20, 0));
    // KST 월 23:59:59 는 아직 월요일
    expect(windowEndMs(MON(23, 59, 59))).toBe(MON(20, 0));
  });
});

describe("kstYmd · kstDateString (KST 자정 경계)", () => {
  it("kstYmd = YYYYMMDD (DART bgn_de)", () => {
    expect(kstYmd(MON(10, 0))).toBe("20261116");
    expect(kstYmd(Date.UTC(2026, 10, 16, 14, 59, 59))).toBe("20261116");
    expect(kstYmd(Date.UTC(2026, 10, 16, 15, 0, 0))).toBe("20261117");
    expect(kstYmd(kst(2027, 1, 1, 0, 0))).toBe("20270101");
  });

  it("kstDateString = YYYY-MM-DD (api_usage 키)", () => {
    expect(kstDateString(new Date(Date.UTC(2026, 10, 16, 14, 59, 59)))).toBe("2026-11-16");
    expect(kstDateString(new Date(Date.UTC(2026, 10, 16, 15, 0, 0)))).toBe("2026-11-17");
  });
});

describe("coverPointMs · isLateAt (D-12)", () => {
  it("오늘 성공 조회가 없으면 07:00 + 120초", () => {
    expect(coverPointMs(MON(7, 0, 30), null)).toBe(MON(7, 2, 0));
    expect(coverPointMs(MON(9, 30), null)).toBe(MON(7, 2, 0));
  });

  it("마지막 성공이 어제면 오늘 07:02", () => {
    expect(coverPointMs(MON(7, 0, 30), kst(2026, 11, 13, 19, 59, 50))).toBe(MON(7, 2, 0));
  });

  it("오늘 창 시작 이후 성공이면 그 시각", () => {
    expect(coverPointMs(MON(8, 10, 5), MON(8, 10, 0))).toBe(MON(8, 10, 0));
  });

  it("정상 아침: 07:00:30 실행 · lastOk 없음 · 07:00:35 처음 봄 → 늦지 않음", () => {
    const now = MON(7, 0, 35);
    expect(isLateAt(now, coverPointMs(now, null))).toBe(false);
  });

  it("전날 저녁 서류: 07:29:55 성공 뒤 07:30:05 처음 봄 → 늦지 않음", () => {
    const now = MON(7, 30, 5);
    expect(isLateAt(now, coverPointMs(now, MON(7, 29, 55)))).toBe(false);
  });

  it("09:30 에 처음 뜬 실행(lastOk 없음)이 본 그날 건 → 늦음", () => {
    const now = MON(9, 30, 0);
    expect(isLateAt(now, coverPointMs(now, null))).toBe(true);
  });

  it("lastOk 10:00:00 · 10:01:10 처음 봄(70초) → 늦음 · 10:00:55(55초) → 늦지 않음", () => {
    expect(isLateAt(MON(10, 1, 10), coverPointMs(MON(10, 1, 10), MON(10, 0, 0)))).toBe(true);
    expect(isLateAt(MON(10, 0, 55), coverPointMs(MON(10, 0, 55), MON(10, 0, 0)))).toBe(false);
  });

  it("감시 대상별 늦음 간격 = 60초 + 그 시각 조회 간격 — D004 60초 · B001 08:00 60초 · 10:00 70초 · I001 70초 · D005 90초", () => {
    expect(lateGapMs(null)).toBe(60_000);
    expect(lateGapMs(everyMsAt(watchOf("tender_offer"), MON(10, 0)))).toBe(60_000);
    expect(lateGapMs(everyMsAt(watchOf("rights_merger"), MON(8, 0)))).toBe(60_000);
    expect(lateGapMs(everyMsAt(watchOf("rights_merger"), MON(10, 0)))).toBe(70_000);
    expect(lateGapMs(everyMsAt(watchOf("exchange_disclosure"), MON(10, 0)))).toBe(70_000);
    expect(lateGapMs(everyMsAt(watchOf("insider_trade_plan"), MON(10, 0)))).toBe(90_000);
    expect(lateGapMs(everyMsAt(watchOf("market_action"), MON(10, 0)))).toBe(90_000);
    expect(lateGapMs(everyMsAt(watchOf("largest_holder_change"), MON(10, 0)))).toBe(90_000);
    expect(isLateAt(MON(10, 1, 30), MON(10, 0, 0), lateGapMs(SLOW_POLL_MS))).toBe(false);
    expect(isLateAt(MON(10, 1, 30) + 1, MON(10, 0, 0), lateGapMs(SLOW_POLL_MS))).toBe(true);
    expect(isLateAt(MON(10, 1, 10), MON(10, 0, 0), lateGapMs(EXCHANGE_POLL_MS))).toBe(false);
  });

  it("경계: 정확히 60초는 늦지 않음 · 60.001초는 늦음", () => {
    expect(isLateAt(MON(10, 1, 0), MON(10, 0, 0))).toBe(false);
    expect(isLateAt(MON(10, 1, 0) + 1, MON(10, 0, 0))).toBe(true);
  });
});
