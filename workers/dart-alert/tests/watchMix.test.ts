import { describe, expect, it } from "vitest";
import { LATE_LABEL } from "../src/message";
import { ALL_WATCHES, dbRow, exchangeRow, harness, itemOf, kst, marketActionRow, MON, tenderRow, tradePlanRow, type FeedItem } from "./helpers/fakes";

/**
 * 261113-iez · rn7 — 감시 대상이 섞인 간격 · 두 키로 도는 끝에서 끝 시험. 가짜 시계 · DB · DART · 텔레그램 — 실제 호출 없음.
 * 바퀴는 평일 07:00 ~ 20:00 종일 5초(U-2). 키 1 = 공개매수 D004 매 바퀴 · 주요사항보고서 B001 09:00 전 매 바퀴 · 뒤 10초 칸,
 * 키 2 = 거래소 시장조치 I003 · 최대주주 소유주식 변동 I004 · 임원ㆍ주요주주 거래계획 D005 30초 칸 · 거래소 수시공시 I001 10초 칸.
 * 그날 감시 대상별 첫 성공 조회 때 직전 평일을 한 번 더(U-3). 호출 시각 단언은 이 규칙으로 손으로 셈한 값이다.
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
const FRI_YMD = "20261113";
/** 금요일 날짜 조회 */
const friCalls = (h: H) => h.dart.listCalls.filter((c) => c.day === FRI_YMD);
const inRange = (h: H, ids: Set<string>, fromHms: string, toHms: string) =>
  h.dart.listCalls.filter((c) => ids.has(c.watch) && c.at >= at(fromHms) && c.at <= at(toHms));

describe("키 2 한 길 — OPENDART_API_KEY_2 → 키 2 카운터 → 거래소 수시공시 10초 칸 → 넣기 → 단체방 (트레이서)", () => {
  it("10:00 ~ 10:01 — I001 10초 7번 · D004 5초 13번 · B001 10초 7번 · 30초 칸 셋 각 3번 · 키 2 카운터 16 · 키 1 20 · 대상 1건(priority 3) · 첫 줄 그대로", async () => {
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
    expect(atsOf(h, "market_action")).toEqual(every("10:00:00", 30, 3));
    expect(atsOf(h, "largest_holder_change")).toEqual(every("10:00:00", 30, 3));
    // 키 2 = I001 7 + I003 · I004 · D005 각 3 · 키 1 = D004 13 + B001 7 — 끝 flush 뒤 각 카운터에 그대로
    expect(h.db.usageAdded(2)).toBe(7 + 3 * 3);
    expect(h.db.usageAdded(1)).toBe(20);
    expect(h.db.state.used2).toBe(16);
    expect(h.db.state.used).toBe(20);

    const items = h.db.calls.insert.flatMap((c) => c.items);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ watch: "exchange_disclosure", priority: 3, late: false });
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

  it("키 2 예산 소진(used2 14,995) — 15,000 에 닿은 다음 바퀴부터 키 2 감시 대상 0 · 키 2 탐침 0 · 키 1 은 끝까지 · 장애 글 1", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:02:00"),
      watches: ALL_WATCHES,
      db: { used2: 14_995, lastOk: lastOkAll("09:59:55") },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    // 14,995 + 4(10:00:00 I003 · I001 · I004 · D005) + 1(:10 I001) = 15,000 → 그 뒤 예산 문에서 키 2 멈춤
    expect(atsOf(h, "exchange_disclosure")).toEqual(every("10:00:00", 10, 2));
    expect(atsOf(h, "insider_trade_plan")).toEqual([at("10:00:00")]);
    expect(atsOf(h, "market_action")).toEqual([at("10:00:00")]);
    expect(h.db.usageAdded(2)).toBe(5);
    expect(h.dart.probeCalls).toHaveLength(0);
    // 키 1 — 10:00:00 ~ 10:01:55 바퀴 24번 내내
    expect(atsOf(h, "tender_offer")).toEqual(every("10:00:00", 5, 24));
    const notices = h.telegram.notices().map((n) => n.text);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("(거래소 시장조치 · 거래소 수시공시 · 최대주주 소유주식 변동 · 임원ㆍ주요주주 거래계획 — 자체 하루 예산 소진)");
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
    for (const id of ["market_action", "exchange_disclosure", "largest_holder_change", "insider_trade_plan"] as const) {
      expect(h.dart.callsOf(id)).toHaveLength(0);
    }
    // 10:00:00 ~ 10:00:55 바퀴 12번 — D004 12 · B001 10초 칸 6
    expect(atsOf(h, "tender_offer")).toEqual(every("10:00:00", 5, 12));
    expect(atsOf(h, "rights_merger")).toEqual(every("10:00:00", 10, 6));
    const notices = h.telegram.notices().map((n) => n.text);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("(거래소 시장조치 · 거래소 수시공시 · 최대주주 소유주식 변동 · 임원ㆍ주요주주 거래계획 — 한도 의심 재확인 실패(020))");
    expect(h.logs.count("quota probe failed — stopping without retries (next run probes once again)")).toBe(0);
  });

  it("시작 탐침 키별 — 키 1 표시 1 · 키 1 탐침 정상 → 탐침 1번(키 1) 뒤 여섯 다 정상", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:32"), watches: ALL_WATCHES, db: { strikes: 1, lastOk: lastOkAll("09:59:55") } });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.dart.probeCalls.map((p) => p.key)).toEqual([1]);
    expect(h.dart.probeCalls[0].seq).toBeLessThan(h.dart.listCalls[0].seq);
    for (const w of ALL_WATCHES) expect(h.dart.callsOf(w.id).length).toBeGreaterThan(0);
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
      // 조회마다 7초 — 여섯을 부르는 바퀴는 42초라 다음 바퀴 시작이 밀려 D005 조회 사이가 30초를 넘는다
      // (10:00:00 바퀴의 D005 여섯째 조회 10:00:35 → 다음 바퀴 10:00:42 의 여섯째 조회 10:01:17 = 42초 < 늦음 90초)
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

describe("거래소 시장조치(I003) 한 길 — 30초 칸 → 넣기(우선 2) → 단체방 첫 줄 제출인 없음 (U-1b · D-07)", () => {
  it("10:00 ~ 10:01 — I003 · I004 30초 · 대상 1건만(비대상 기타시장안내 · 지정예고 탈락) · 첫 줄 공백 1칸 · near-miss warn 0", async () => {
    const feed: FeedItem[] = [
      { watch: "market_action", from: at("10:00:12"), row: marketActionRow(1) },
      { watch: "market_action", from: at("10:00:12"), row: marketActionRow(2, MON, { report_nm: "기타시장안내              (상장적격성 실질심사 관련 안내)" }) },
      { watch: "market_action", from: at("10:00:12"), row: marketActionRow(3, MON, { report_nm: "불성실공시법인지정예고              (공시번복)" }) },
    ];
    const h = harness({ start: at("10:00:00"), abortAt: at("10:01:02"), watches: ALL_WATCHES, db: { lastOk: lastOkAll("09:59:55") }, dart: { feed } });
    expect(await h.run()).toMatchObject({ code: 0, reason: "aborted" });
    expect(atsOf(h, "market_action")).toEqual(every("10:00:00", 30, 3));
    expect(atsOf(h, "largest_holder_change")).toEqual(every("10:00:00", 30, 3));
    const items = h.db.calls.insert.flatMap((c) => c.items);
    expect(items).toHaveLength(1);
    // 10:00:30 조회가 처음 봄 — 직전 성공 10:00:00 에서 30초(늦음 기준 90초 안)
    expect(items[0]).toMatchObject({ watch: "market_action", priority: 2, late: false, flr_nm: "코스닥시장본부" });
    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text.split("\n")[0]).toBe("📢 주권매매거래정지 (주식의 병합, 분할 등 전자등록 변경, 말소) — 조치회사1(500001)");
    expect(h.logs.count("b001 near-miss kind")).toBe(0);
    expect(h.telegram.notices()).toHaveLength(0);
  });
});

describe("아침 전날 확인 (U-3 · 함정 B · C) — 감시 대상별 첫 성공 조회 때 직전 평일 한 번", () => {
  const sentFri = exchangeRow(1, "2026-11-13");
  const newFri = exchangeRow(2, "2026-11-13");
  const friFeed: FeedItem[] = [
    { watch: "exchange_disclosure", from: kst("2026-11-13", "09:00:00"), row: sentFri, day: FRI_YMD },
    { watch: "exchange_disclosure", from: kst("2026-11-13", "15:00:00"), row: newFri, day: FRI_YMD },
    {
      watch: "market_action",
      from: kst("2026-11-13", "16:00:00"),
      row: marketActionRow(7, "2026-11-13", { report_nm: "기타시장안내              (상장적격성 실질심사 관련 안내)" }),
      day: FRI_YMD,
    },
  ];
  /** 금요일에 이미 보낸 건(DB 에 있음) */
  const alreadySent = dbRow(itemOf(sentFri, "exchange_disclosure"), { status: "sent" });

  it("월 07:00 — 금요일 조회가 감시 대상마다 정확히 1번(전 쪽 · 첫 조회 바로 뒤) · 새 건 1건만 「(늦은 알림)」 · 이미 있던 건 안 감 · 표시 여섯 · 키별 카운터", async () => {
    const h = harness({
      start: at("07:00:00"),
      abortAt: at("07:00:40"),
      watches: ALL_WATCHES,
      prevDayDone: false,
      db: { rows: [alreadySent] },
      dart: { feed: friFeed },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });

    const fri = friCalls(h);
    expect(fri.map((c) => c.watch)).toEqual(ALL_WATCHES.map((w) => w.id));
    expect(fri.every((c) => c.fullRead && c.at === at("07:00:00"))).toBe(true);
    // 각 감시 대상의 07:00:00 오늘 조회 바로 다음 호출이 그 감시 대상의 금요일 조회
    const first = h.dart.listCalls.filter((c) => c.at === at("07:00:00"));
    expect(first.map((c) => [c.watch, c.day])).toEqual(ALL_WATCHES.flatMap((w) => [[w.id, "20261116"], [w.id, FRI_YMD]]));
    expect(h.dart.listCalls.filter((c) => c.at >= at("07:00:05") && c.day === FRI_YMD)).toHaveLength(0);

    const items = h.db.calls.insert.flatMap((c) => c.items);
    expect(items.map((i) => i.rcept_no).sort()).toEqual([sentFri.rcept_no, newFri.rcept_no].sort());
    expect(h.db.rows.get(newFri.rcept_no)).toMatchObject({ watch: "exchange_disclosure", rcept_dt: "2026-11-16", late: true, status: "sent" });
    expect(h.db.rows.get(sentFri.rcept_no)).toMatchObject({ rcept_dt: "2026-11-13", status: "sent" });
    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text.split("\n")[0]).toBe(`📢 ${LATE_LABEL} 단일판매ㆍ공급계약체결 — 공시회사2(300002)`);

    // 07:00:30 임대 연장이 표시 여섯을 DB last_ok 로
    const renew = h.db.calls.leaseAcquire.find((c) => c.at === at("07:00:30"))!;
    expect(Object.entries(renew.lastOk ?? {}).filter(([k]) => k.startsWith("prevday:"))).toEqual(
      ALL_WATCHES.map((w) => [`prevday:${w.id}`, "2026-11-16"]),
    );
    // 07:00:00 ~ 07:00:35 바퀴 8번 — 키 1 오늘 D004 8 + B001 8(09:00 전 매 바퀴) + 금요일 2 = 18
    // 키 2 오늘 I001 4(10초) + I003 · I004 · D005 각 2(30초) = 10 + 금요일 4 = 14
    expect(h.db.usageAdded(1)).toBe(16 + 2);
    expect(h.db.usageAdded(2)).toBe(10 + 4);
    expect(h.telegram.notices()).toHaveLength(0);
  });

  it("같은 날 다시 시작(표시 있음 · 기본 harness) → 금요일 조회 0 · 알림 0", async () => {
    const h = harness({ start: at("07:10:00"), abortAt: at("07:10:30"), watches: ALL_WATCHES, db: { rows: [alreadySent] }, dart: { feed: friFeed } });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(friCalls(h)).toHaveLength(0);
    expect(h.telegram.alerts()).toHaveLength(0);
  });

  it("I001 의 금요일 조회만 800 → I001 표시 없음 · 5분 뒤 첫 I001 조회(07:05:00) 직후 금요일 1번 더 → 성공하면 표시", async () => {
    // 리뷰 WR-01 — 시도 사이 최소 5분(PREV_DAY_RETRY_MS): 07:00:00 실패 → 07:00:10 · :20 … 조회 칸에선 다시 안 함 →
    // 07:05:00(07:00:00 + 300초 · 10초 칸 시작) 조회 직후 2번째 시도. 옛 단언(07:00:10 다시)은 상한 없는 되풀이였다.
    const h = harness({
      start: at("07:00:00"),
      abortAt: at("07:05:40"),
      watches: ALL_WATCHES,
      prevDayDone: false,
      dart: { reply: (c) => (c.watch.id === "exchange_disclosure" && c.day === FRI_YMD && c.watchN === 2 ? { status: "800" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(friCalls(h).filter((c) => c.watch === "exchange_disclosure").map((c) => c.at)).toEqual([at("07:00:00"), at("07:05:00")]);
    expect(friCalls(h).filter((c) => c.watch !== "exchange_disclosure")).toHaveLength(5);
    expect(h.logs.count("dart prev-day list failed", "warn")).toBe(1);
    expect(h.logs.find("dart prev-day list failed")?.obj).toMatchObject({ watch: "exchange_disclosure", day: FRI_YMD });
    // 07:00:30 연장 때는 아직 표시 없음 · 07:05:30 연장(성공 뒤 첫 연장)이 표시를 싣는다
    expect(h.db.calls.leaseAcquire.find((c) => c.at === at("07:00:30"))!.lastOk?.["prevday:exchange_disclosure"]).toBeUndefined();
    const renew = h.db.calls.leaseAcquire.find((c) => c.at === at("07:05:30"))!;
    expect(renew.lastOk?.["prevday:exchange_disclosure"]).toBe("2026-11-16");
    // 전날 조회 실패는 오늘 결과를 실패로 만들지 않는다 — 장애 글 없음
    expect(h.telegram.notices()).toHaveLength(0);
  });

  it("넣기가 계속 실패해도 D004 금요일 조회는 하루 3번 · 사이 5분 — 넘으면 warn `prevday sweep gave up` 1번 뒤 그날 안 함(리뷰 WR-01)", async () => {
    const friTender = tenderRow(1, "2026-11-13");
    const h = harness({
      start: at("07:00:00"),
      abortAt: at("07:20:00"),
      prevDayDone: false,
      db: {
        // 행 값 거절(22 · 23)이 아닌 넣기 실패 — 문장 시간 초과 꼴(임대 RPC 는 정상)
        before: (fn) => {
          if (fn === "dart_alert_insert") throw new Error("canceling statement due to statement timeout");
        },
      },
      dart: { feed: [{ watch: "tender_offer", from: kst("2026-11-13", "09:00:00"), row: friTender, day: FRI_YMD }] },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    // 시도 = 07:00:00 · 07:05:00 · 07:10:00(각 앞 시도 + 300초) — 07:00 ~ 07:20 바퀴 240번 중 3번뿐(옛 동작은 바퀴마다 240번)
    expect(friCalls(h).filter((c) => c.watch === "tender_offer").map((c) => c.at)).toEqual([at("07:00:00"), at("07:05:00"), at("07:10:00")]);
    expect(friCalls(h).filter((c) => c.watch === "rights_merger").map((c) => c.at)).toEqual([at("07:00:00"), at("07:05:00"), at("07:10:00")]);
    // 3번째 시도(07:10:00) 다음 조회(07:10:05)에서 감시 대상마다 1번
    const gaveUp = h.logs.lines.filter((l) => l.msg === "prevday sweep gave up");
    expect(gaveUp.map((l) => [l.level, l.obj.watch, l.obj.day, l.obj.tries])).toEqual([
      ["warn", "tender_offer", FRI_YMD, 3],
      ["warn", "rights_merger", FRI_YMD, 3],
    ]);
    // 넣기는 금요일 건을 든 시도 바퀴 3번에만 불렸다(다른 바퀴는 넣을 건 없음) · 오늘 D004 조회는 5초마다 계속(240번)
    expect(h.db.calls.insert).toHaveLength(0);
    expect(h.logs.count("dart alert insert failed", "warn")).toBe(3);
    expect(h.dart.callsOf("tender_offer").filter((c) => c.day === "20261116")).toHaveLength(240);
    // 포기는 DB 표시를 남기지 않는다(보고 스크립트가 완료로 세지 않게 · 재기동이면 다시 3번)
    expect(h.db.calls.leaseAcquire.some((c) => Object.keys(c.lastOk ?? {}).some((k) => k.startsWith("prevday:")))).toBe(false);
  });

  it("전날 조회만 100(요청 오류 꼴) → 그 키를 멈추지 않는다 · 오늘 조회 계속 · error · 장애 글 · 한도 의심 표시 없음(리뷰 WR-01)", async () => {
    const h = harness({
      start: at("07:00:00"),
      abortAt: at("07:11:00"),
      prevDayDone: false,
      dart: { reply: (c) => (c.fullRead ? { status: "100" } : undefined) },
    });
    // 옛 동작: 전날 100 → dart_bug 로 키 1 멈춤 → 키 1 만 쓰는 실행이라 종료 1
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    // 07:00:00 ~ 07:10:55 바퀴 132번(11분 × 12) — D004 오늘 조회가 바퀴마다
    expect(h.dart.callsOf("tender_offer").filter((c) => c.day === "20261116")).toHaveLength(132);
    expect(friCalls(h).filter((c) => c.watch === "tender_offer").map((c) => c.at)).toEqual([at("07:00:00"), at("07:05:00"), at("07:10:00")]);
    expect(h.logs.count("dart prev-day list failed", "warn")).toBe(6);
    expect(h.logs.count("prevday sweep gave up", "warn")).toBe(2);
    expect(h.logs.count("dart key paused — other key keeps running")).toBe(0);
    expect(h.logs.lines.filter((l) => l.level === "error")).toEqual([]);
    expect(h.db.calls.strikesRecord).toHaveLength(0);
    expect(h.telegram.notices()).toHaveLength(0);
  });

  it("전날 조회 020 은 지금처럼 그 키를 멈춘다 — 키 1 만 쓰는 실행이면 종료 1 quota · 한도 의심 표시 1(리뷰 WR-01)", async () => {
    const h = harness({
      start: at("07:00:00"),
      abortAt: at("07:01:00"),
      prevDayDone: false,
      dart: { reply: (c) => (c.fullRead ? { status: "020" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "quota" });
    // D004 오늘 → D004 금요일 020 → 키 1 멈춤이라 B001 은 부르지 않는다
    expect(h.dart.listCalls.map((c) => [c.watch, c.day])).toEqual([
      ["tender_offer", "20261116"],
      ["tender_offer", FRI_YMD],
    ]);
    expect(h.db.calls.strikesRecord).toEqual([expect.objectContaining({ key: 1 })]);
    expect(h.logs.count("fatal DART status — stopping this run", "error")).toBe(1);
  });

  it("화 07:00 → 직전 평일은 월요일(20261116)", async () => {
    const h = harness({ start: kst("2026-11-17", "07:00:00"), abortAt: kst("2026-11-17", "07:00:05"), watches: ALL_WATCHES, prevDayDone: false });
    await h.run();
    const prev = h.dart.listCalls.filter((c) => c.fullRead);
    expect(prev.map((c) => c.day)).toEqual(ALL_WATCHES.map(() => "20261116"));
  });
});
