import { describe, expect, it } from "vitest";
import { LATE_LABEL } from "../src/message";
import { ALL_WATCHES, exchangeRow, harness, kst, MON, tradePlanRow, type FeedItem } from "./helpers/fakes";

/**
 * 261113-iez · rn7 — 감시 대상이 섞인 간격 · 두 키로 도는 끝에서 끝 시험. 가짜 시계 · DB · DART · 텔레그램 — 실제 호출 없음.
 * 바퀴는 평일 07:00 ~ 20:00 종일 5초(U-2). 키 1 = 공개매수 D004 매 바퀴 · 주요사항보고서 B001 09:00 전 매 바퀴 · 뒤 10초 칸,
 * 키 2 = 거래소 수시공시 I001 10초 칸 · 30초 칸 감시 대상(D005 등). 호출 시각 단언은 이 규칙으로 손으로 셈한 값이다.
 */

const at = (hms: string) => kst(MON, hms);
const iso = (hms: string) => new Date(at(hms)).toISOString();
type H = ReturnType<typeof harness>;
const atsOf = (h: H, w: Parameters<H["dart"]["callsOf"]>[0]) => h.dart.callsOf(w).map((c) => c.at);
/** hms 부터 stepS 초 간격으로 n 개 시각 */
const every = (fromHms: string, stepS: number, n: number) => Array.from({ length: n }, (_, i) => at(fromHms) + i * stepS * 1000);
/** 모든 감시 대상 같은 직전 성공 조회 시각(시작 점검이 「멈췄습니다」 를 내지 않게) */
const lastOkAll = (hms: string) => Object.fromEntries(ALL_WATCHES.map((w) => [w.id, iso(hms)]));
const KEY1_IDS = new Set(ALL_WATCHES.filter((w) => w.key === 1).map((w) => w.id));
const KEY2_IDS = new Set(ALL_WATCHES.filter((w) => w.key === 2).map((w) => w.id));
const inRange = (h: H, ids: Set<string>, fromHms: string, toHms: string) =>
  h.dart.listCalls.filter((c) => ids.has(c.watch) && c.at >= at(fromHms) && c.at <= at(toHms));

describe("키 2 한 길 — OPENDART_API_KEY_2 → 키 2 카운터 → 거래소 수시공시 10초 칸 → 넣기 → 단체방 (트레이서)", () => {
  it("10:00 ~ 10:01 — I001 10초 7번 · D004 5초 13번 · B001 10초 7번 · D005 30초 3번 · 키 2 카운터 10 · 키 1 20 · 대상 1건(priority 2) · 첫 줄 그대로", async () => {
    const feed: FeedItem[] = [
      {
        watch: "exchange_disclosure",
        from: at("10:00:12"),
        row: exchangeRow(1, MON, { report_nm: "단일판매ㆍ공급계약체결(자율공시)", corp_name: "가온전자", stock_code: "123450", flr_nm: "가온전자" }),
      },
    ];
    const h = harness({ start: at("10:00:00"), abortAt: at("10:01:02"), watches: ALL_WATCHES, db: { lastOk: lastOkAll("09:59:55") }, dart: { feed } });
    expect(await h.run()).toMatchObject({ code: 0, reason: "aborted" });

    // 10:00:00 ~ 10:01:00 바퀴 13번(5초) — I001 10초 칸 7 · B001 10초 칸 7 · D005 30초 칸 3
    expect(atsOf(h, "exchange_disclosure")).toEqual(every("10:00:00", 10, 7));
    expect(atsOf(h, "tender_offer")).toEqual(every("10:00:00", 5, 13));
    expect(atsOf(h, "rights_merger")).toEqual(every("10:00:00", 10, 7));
    expect(atsOf(h, "insider_trade_plan")).toEqual(every("10:00:00", 30, 3));
    // 키 2 = I001 7 + D005 3 · 키 1 = D004 13 + B001 7 — 끝 flush 뒤 각 카운터에 그대로
    expect(h.db.usageAdded(2)).toBe(10);
    expect(h.db.usageAdded(1)).toBe(20);
    expect(h.db.state.used2).toBe(10);
    expect(h.db.state.used).toBe(20);

    const items = h.db.calls.insert.flatMap((c) => c.items);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ watch: "exchange_disclosure", priority: 2, late: false });
    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text.split("\n")[0]).toBe("📢 단일판매ㆍ공급계약체결(자율공시) — 가온전자(123450)");
    expect(h.telegram.notices()).toHaveLength(0);
  });

  it("07:00 ~ 07:01 — D004 · B001 둘 다 5초마다 13번(B001 은 09:00 전 매 바퀴) · I001 10초 · D005 30초", async () => {
    const h = harness({ start: at("07:00:00"), abortAt: at("07:01:02"), watches: ALL_WATCHES });
    expect(await h.run()).toMatchObject({ code: 0, reason: "aborted" });
    expect(atsOf(h, "tender_offer")).toEqual(every("07:00:00", 5, 13));
    expect(atsOf(h, "rights_merger")).toEqual(every("07:00:00", 5, 13));
    expect(atsOf(h, "exchange_disclosure")).toEqual(every("07:00:00", 10, 7));
    expect(atsOf(h, "insider_trade_plan")).toEqual(every("07:00:00", 30, 3));
  });

  it("09:00 경계 — B001 은 08:59:50 · 08:59:55 · 09:00:00 · 09:00:10 · 09:00:20(09:00:00 이 첫 10초 칸) · D004 는 5초 그대로", async () => {
    const h = harness({ start: at("08:59:50"), abortAt: at("09:00:22"), watches: ALL_WATCHES, db: { lastOk: lastOkAll("08:59:45") } });
    await h.run();
    expect(atsOf(h, "rights_merger")).toEqual(["08:59:50", "08:59:55", "09:00:00", "09:00:10", "09:00:20"].map(at));
    expect(atsOf(h, "tender_offer")).toEqual(every("08:59:50", 5, 7));
    expect(h.telegram.notices()).toHaveLength(0);
  });
});

describe("키별 레인 — 한 키가 막혀도 다른 키는 계속 (U-2 · 공식 API 운영 기준 ④ · D-16 · D-17)", () => {
  it("키 1 이 10:00:30 에 020 — 키 1 만 멈추고 키 2 는 그대로 · 5분 뒤 키 1 단독 탐침 1건으로 재개 · 장애 글 한 쌍", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:07:00"),
      watches: ALL_WATCHES,
      db: { lastOk: lastOkAll("09:59:55") },
      dart: { reply: (c) => (c.watch.id === "tender_offer" && c.now >= at("10:00:30") && c.now < at("10:05:00") ? { status: "020" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });

    // 한도 의심 표시는 키 1 에만
    expect(h.db.state.strikes).toBe(1);
    expect(h.db.state.strikes2).toBe(0);
    // 10:00:30 의 D004 020 뒤 키 1 감시 대상은 10:05:30 재탐침 전까지 부르지 않는다(같은 바퀴 B001 도)
    expect(inRange(h, KEY1_IDS, "10:00:30", "10:00:30").map((c) => c.watch)).toEqual(["tender_offer"]);
    expect(inRange(h, KEY1_IDS, "10:00:35", "10:05:25")).toHaveLength(0);
    // 같은 구간 키 2 는 간격 그대로 — I001 10:00:40 ~ 10:05:20 10초(29번) · D005 10:01:00 ~ 10:05:00 30초(9번)
    expect(inRange(h, new Set(["exchange_disclosure"]), "10:00:35", "10:05:25").map((c) => c.at)).toEqual(every("10:00:40", 10, 29));
    expect(inRange(h, new Set(["insider_trade_plan"]), "10:00:35", "10:05:25").map((c) => c.at)).toEqual(every("10:01:00", 30, 9));
    // 단독 탐침 정확히 1번 — 키 1 · 멈춘 시각 + 5분
    expect(h.dart.probeCalls.map((p) => ({ key: p.key, at: p.at }))).toEqual([{ key: 1, at: at("10:05:30") }]);
    expect(h.logs.count("dart key probe ok — resuming", "info")).toBe(1);
    // 재개 뒤 D004 다시 5초마다(10:05:30 ~ 10:06:55 = 18번)
    expect(atsOf(h, "tender_offer").filter((t) => t >= at("10:05:30"))).toEqual(every("10:05:30", 5, 18));

    const notices = h.telegram.notices().map((n) => n.text);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toBe(
      "⚠ 공시 알림이 멈췄습니다 — 10:00 부터 DART 조회 실패(공개매수 · 주요사항보고서 — 하루 조회 한도 초과(020)). 복구되면 알려 드립니다.",
    );
    expect(notices[1].startsWith("✅ 공시 알림 다시 동작 — 10:00 ~ 10:05 ")).toBe(true);
    expect(h.logs.count("dart key paused — other key keeps running", "error")).toBe(1);
    expect(h.logs.find("dart key paused — other key keeps running")?.obj).toMatchObject({ key: 1, reason: "quota" });
    expect(h.logs.count("fatal DART status — stopping this run")).toBe(0);
  });

  it("키 2 예산 소진(used2 14,995) — 15,000 을 넘긴 다음 바퀴부터 I001 · D005 0 · 키 2 탐침 0 · 키 1 은 끝까지 · 장애 글 1", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:02:00"),
      watches: ALL_WATCHES,
      db: { used2: 14_995, lastOk: lastOkAll("09:59:55") },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    // 14,995 + 2(10:00:00 I001 · D005) + 1(:10) + 1(:20) + 2(:30 I001 · D005) = 15,001 → 그 뒤 바퀴부터 0
    expect(atsOf(h, "exchange_disclosure")).toEqual(every("10:00:00", 10, 4));
    expect(atsOf(h, "insider_trade_plan")).toEqual(every("10:00:00", 30, 2));
    expect(h.db.usageAdded(2)).toBe(6);
    expect(h.dart.probeCalls).toHaveLength(0);
    // 키 1 — 10:00:00 ~ 10:01:55 바퀴 24번 내내
    expect(atsOf(h, "tender_offer")).toEqual(every("10:00:00", 5, 24));
    const notices = h.telegram.notices().map((n) => n.text);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("(거래소 수시공시 · 임원ㆍ주요주주 거래계획 — 자체 하루 예산 소진)");
    expect(h.logs.find("dart key paused — other key keeps running")?.obj).toMatchObject({ key: 2, reason: "budget_exhausted" });
    expect(h.logs.count("daily budget exhausted — stopping this run")).toBe(0);
  });

  it("시작 탐침 키별 — 키 2 표시 1 · 키 2 탐침 020 → 키 2 감시 대상 0 · 키 1 정상 · 장애 글 1(한도 의심 재확인 실패)", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:00"),
      watches: ALL_WATCHES,
      db: { strikes2: 1, lastOk: lastOkAll("09:59:55") },
      dart: { probe: (c) => (c.key === 2 ? { status: "020" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.dart.probeCalls.map((p) => p.key)).toEqual([2]);
    expect(h.dart.callsOf("exchange_disclosure")).toHaveLength(0);
    expect(h.dart.callsOf("insider_trade_plan")).toHaveLength(0);
    // 10:00:00 ~ 10:00:55 바퀴 12번 — D004 12 · B001 10초 칸 6
    expect(atsOf(h, "tender_offer")).toEqual(every("10:00:00", 5, 12));
    expect(atsOf(h, "rights_merger")).toEqual(every("10:00:00", 10, 6));
    const notices = h.telegram.notices().map((n) => n.text);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("(거래소 수시공시 · 임원ㆍ주요주주 거래계획 — 한도 의심 재확인 실패(020))");
    expect(h.logs.count("quota probe failed — stopping without retries (next run probes once again)")).toBe(0);
  });

  it("시작 탐침 키별 — 키 1 표시 1 · 키 1 탐침 정상 → 탐침 1번(키 1) 뒤 넷 다 정상", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:32"), watches: ALL_WATCHES, db: { strikes: 1, lastOk: lastOkAll("09:59:55") } });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.dart.probeCalls.map((p) => p.key)).toEqual([1]);
    expect(h.dart.probeCalls[0].seq).toBeLessThan(h.dart.listCalls[0].seq);
    for (const id of ["tender_offer", "rights_merger", "exchange_disclosure", "insider_trade_plan"] as const) {
      expect(h.dart.callsOf(id).length).toBeGreaterThan(0);
    }
    expect(h.telegram.notices()).toHaveLength(0);
  });

  it("시작 예산 키별 — 키 1 used 15,000 → D004 · B001 0 · I001 · D005 정상 · 장애 글 0(앞 실행이 이미 냄)", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:32"), watches: ALL_WATCHES, db: { used: 15_000, lastOk: lastOkAll("09:59:55") } });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.dart.callsOf("tender_offer")).toHaveLength(0);
    expect(h.dart.callsOf("rights_merger")).toHaveLength(0);
    // 10:00:00 ~ 10:00:30 바퀴 7번 — I001 10초 칸 4 · D005 30초 칸 2
    expect(atsOf(h, "exchange_disclosure")).toEqual(every("10:00:00", 10, 4));
    expect(atsOf(h, "insider_trade_plan")).toEqual(every("10:00:00", 30, 2));
    expect(h.telegram.notices()).toHaveLength(0);
    expect(h.logs.find("daily budget already reached — not calling OpenDART")?.obj).toMatchObject({ key: 1 });
  });
});

describe("섞인 간격의 늦은 알림(D-12) — 늦음 기준 = 60초 + 그 감시 대상 조회 간격", () => {
  it("정상 30초 조회는 바퀴가 밀려 D005 조회 사이가 30초를 넘어도 늦음이 아니다 · 첫 줄 끝에 제출인(임원)", async () => {
    const feed: FeedItem[] = [{ watch: "insider_trade_plan", from: at("10:03:00"), row: tradePlanRow(1) }];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:05:00"),
      watches: ALL_WATCHES,
      db: { lastOk: lastOkAll("09:59:50") },
      // 조회마다 7초 — 넷을 부르는 바퀴는 28초 · 셋이면 21초라 다음 바퀴 시작이 밀려 D005 30초 칸을 건너뛴다
      // (10:00:00 바퀴의 D005 조회 10:00:21 → 다음 D005 칸 바퀴 10:00:49 의 넷째 조회 10:01:10 = 49초)
      dart: { feed, delayMs: 7_000 },
    });
    await h.run();

    const d005 = atsOf(h, "insider_trade_plan");
    const gaps = d005.slice(1).map((x, i) => x - d005[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(30_000);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(90_000);

    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    const first = alerts[0].text.split("\n")[0];
    expect(first).not.toContain(LATE_LABEL);
    expect(first).toBe("📢 임원ㆍ주요주주특정증권등거래계획보고서 — 발행회사1(400001) · 제출인 임원1");
    expect(h.db.rows.get(tradePlanRow(1).rcept_no)).toMatchObject({ watch: "insider_trade_plan", late: false });
  });

  it("D005 가 3분 비어 있었으면(lastOk 09:57:00) 첫 바퀴에 본 건은 「(늦은 알림)」", async () => {
    const feed: FeedItem[] = [{ watch: "insider_trade_plan", from: at("09:58:00"), row: tradePlanRow(2) }];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:15"),
      watches: ALL_WATCHES,
      db: { lastOk: { ...lastOkAll("09:59:50"), insider_trade_plan: iso("09:57:00") } },
      dart: { feed },
    });
    await h.run();
    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text.split("\n")[0]).toContain(LATE_LABEL);
    expect(h.telegram.notices()).toHaveLength(0);
  });
});

describe("띄엄 조회 대상의 장애 짝 글(D-16 · D-17) — 그 대상이 다시 성공해야 닫는다", () => {
  it("I001 만 10:00 ~ 10:08 동안 800 — 「멈췄습니다」 · 「다시 동작」 이 한 번씩만 · error dart outage opened 1번", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:12:00"),
      watches: ALL_WATCHES,
      db: { lastOk: lastOkAll("09:59:55") },
      dart: { reply: (c) => (c.watch.id === "exchange_disclosure" && c.now < at("10:08:00") ? { status: "800" } : undefined) },
    });
    await h.run();

    const opens = h.db.calls.outage.filter((c) => c.action === "open");
    expect(opens).toHaveLength(1);
    // 기준점 09:59:55 + 5분 넘게 — I001 10초 칸 10:05:00 조회(305초)가 처음
    expect(opens[0].at).toBe(at("10:05:00"));
    expect(opens[0].reason).toContain("거래소 수시공시");
    const closes = h.db.calls.outage.filter((c) => c.action === "close");
    expect(closes).toHaveLength(1);
    expect(closes[0].at).toBeGreaterThanOrEqual(at("10:08:00"));
    expect(closes[0].at).toBeLessThan(at("10:08:10"));

    const notices = h.telegram.notices().map((n) => n.text);
    expect(notices).toHaveLength(2);
    expect(notices[0].startsWith("⚠ 공시 알림이 멈췄습니다")).toBe(true);
    expect(notices[1].startsWith("✅ 공시 알림 다시 동작")).toBe(true);
    expect(h.logs.count("dart outage opened", "error")).toBe(1);
  });
});
