import { describe, expect, it } from "vitest";
import { LATE_LABEL } from "../src/message";
import { ALL_WATCHES, exchangeRow, harness, kst, MON, tradePlanRow, type FeedItem } from "./helpers/fakes";

/**
 * 261113-iez — 네 감시 대상(공개매수 D004 · 주요사항보고서 B001 · 거래소 수시공시 I001 · 임원ㆍ주요주주 거래계획 D005)이
 * 섞인 간격으로 도는 끝에서 끝 시험. D004 · B001 은 바퀴마다(07:00 ~ 09:00 5초 · 09:00 ~ 20:00 10초 · D-10),
 * I001 은 07:00 기준 30초 칸 · D005 는 60초 칸마다 1번. 가짜 시계 · DB · DART · 텔레그램 — 실제 호출 없음.
 */

const at = (hms: string) => kst(MON, hms);
const iso = (hms: string) => new Date(at(hms)).toISOString();
const atsOf = (h: ReturnType<typeof harness>, w: Parameters<ReturnType<typeof harness>["dart"]["callsOf"]>[0]) =>
  h.dart.callsOf(w).map((c) => c.at);
/** 네 감시 대상 모두 같은 직전 성공 조회 시각(시작 점검이 「멈췄습니다」 를 내지 않게) */
const lastOkAll = (hms: string) => ({
  tender_offer: iso(hms),
  rights_merger: iso(hms),
  exchange_disclosure: iso(hms),
  insider_trade_plan: iso(hms),
});

describe("거래소 수시공시(I001) 한 길 — 30초 칸 조회 → 넣기 → 단체방 첫 줄 (트레이서)", () => {
  it("07:00 ~ 07:02 — I001 30초 · D005 60초 · D004 · B001 5초 · 대상 1건만 넣고(priority 2) 첫 줄 형식 그대로 · near-miss warn 0", async () => {
    const feed: FeedItem[] = [
      {
        watch: "exchange_disclosure",
        from: at("07:00:40"),
        row: exchangeRow(1, MON, { report_nm: "단일판매ㆍ공급계약체결(자율공시)", corp_name: "가온전자", stock_code: "123450", flr_nm: "가온전자" }),
      },
      { watch: "exchange_disclosure", from: at("07:00:40"), row: exchangeRow(2, MON, { report_nm: "유상증자결정" }) },
      { watch: "exchange_disclosure", from: at("07:00:40"), row: exchangeRow(3, MON, { report_nm: "[첨부추가]최대주주변경" }) },
      {
        watch: "exchange_disclosure",
        from: at("07:00:40"),
        row: exchangeRow(4, MON, { report_nm: "최대주주변경을수반하는주식담보제공계약체결" }),
      },
    ];
    const h = harness({ start: at("07:00:00"), abortAt: at("07:02:05"), watches: ALL_WATCHES, dart: { feed } });
    const exit = await h.run();
    expect(exit).toMatchObject({ code: 0, reason: "aborted" });

    expect(atsOf(h, "exchange_disclosure")).toEqual(["07:00:00", "07:00:30", "07:01:00", "07:01:30", "07:02:00"].map(at));
    expect(atsOf(h, "insider_trade_plan")).toEqual(["07:00:00", "07:01:00", "07:02:00"].map(at));
    const t = atsOf(h, "tender_offer");
    expect(t).toHaveLength(25);
    expect(t.slice(1).every((x, i) => x - t[i] === 5_000)).toBe(true);
    expect(atsOf(h, "rights_merger")).toEqual(t);

    const items = h.db.calls.insert.flatMap((c) => c.items);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ watch: "exchange_disclosure", priority: 2, report_nm: "단일판매ㆍ공급계약체결(자율공시)", late: false });

    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text.split("\n")[0]).toBe("📢 단일판매ㆍ공급계약체결(자율공시) — 가온전자(123450)");
    expect(h.logs.count("b001 near-miss kind")).toBe(0);
    expect(h.telegram.notices()).toHaveLength(0);
  });

  it("09:00 경계를 지나도 I001 은 30초 간격 — 08:59:00 · 08:59:30 · 09:00:00 · 09:00:30 · 09:01:00", async () => {
    const h = harness({
      start: at("08:59:00"),
      abortAt: at("09:01:05"),
      watches: ALL_WATCHES,
      db: { lastOk: lastOkAll("08:58:55") },
    });
    await h.run();
    expect(atsOf(h, "exchange_disclosure")).toEqual(["08:59:00", "08:59:30", "09:00:00", "09:00:30", "09:01:00"].map(at));
    expect(atsOf(h, "insider_trade_plan")).toEqual(["08:59:00", "09:00:00", "09:01:00"].map(at));
    expect(h.telegram.notices()).toHaveLength(0);
  });
});

describe("섞인 간격의 늦은 알림(D-12) — 늦음 기준 = 60초 + 그 감시 대상 조회 간격", () => {
  it("정상 60초 조회는 바퀴가 밀려 D005 조회 사이가 60초를 넘어도 늦음이 아니다 · 첫 줄 끝에 제출인(임원)", async () => {
    const feed: FeedItem[] = [{ watch: "insider_trade_plan", from: at("10:03:00"), row: tradePlanRow(1) }];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:05:00"),
      watches: ALL_WATCHES,
      db: { lastOk: lastOkAll("09:59:50") },
      // 넷을 부르는 바퀴는 12초 — 10초 간격을 넘겨 다음 바퀴 시작이 2초씩 밀린다
      dart: { feed, delayMs: 3_000 },
    });
    await h.run();

    const d005 = atsOf(h, "insider_trade_plan");
    const gaps = d005.slice(1).map((x, i) => x - d005[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(60_000);
    // 그 건을 처음 본 D005 조회도 직전 조회에서 60초 넘게 뒤였다(옛 60초 기준이면 늦음)
    const seenAt = d005.findIndex((x) => x >= at("10:03:00"));
    expect(d005[seenAt] - d005[seenAt - 1]).toBeGreaterThan(60_000);

    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(1);
    const first = alerts[0].text.split("\n")[0];
    expect(first).not.toContain(LATE_LABEL);
    expect(first).toBe("📢 임원ㆍ주요주주특정증권등거래계획보고서 — 발행회사1(400001) · 제출인 임원1");
    expect(h.db.rows.get(tradePlanRow(1).rcept_no)).toMatchObject({ watch: "insider_trade_plan", priority: 3, late: false });
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
    expect(opens[0].at).toBeGreaterThanOrEqual(at("10:05:00"));
    expect(opens[0].at).toBeLessThan(at("10:05:30"));
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
