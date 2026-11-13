import { describe, expect, it } from "vitest";
import { ALL_WATCHES, exchangeRow, harness, kst, MON, type FeedItem } from "./helpers/fakes";

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
