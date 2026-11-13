import { describe, expect, it } from "vitest";
import { plannedDailyCalls } from "../src/cadence";
import { LEASE_TTL_S, UNKNOWN_STREAK } from "../src/collector";
import { DbError } from "../src/db";
import { LATE_LABEL } from "../src/message";
import { ALL_WATCHES, dbRow, harness, itemOf, KEY1_WATCHES, KEY2_WATCHES, kst, MON, rightsRow, tenderRow, type FeedItem } from "./helpers/fakes";

/**
 * Phase 43-05 T1 — 장기 실행 수집기(auto). 가짜 시계(sleep · 지연이 시계를 앞당김) · 가짜 DB(43-02 RPC 계약) ·
 * 가짜 DART · 가짜 텔레그램으로 평일 13시간 실행을 몇 초 안에 단언한다. 실제 OpenDART · Supabase · 텔레그램 호출 없음.
 * 모든 루프 테스트는 가짜 시계의 sleep 상한 · DART 호출 상한이 있어 잘못 만든 루프가 끝없이 돌지 않는다.
 * 261113-rn7: 바퀴는 종일 5초 · 기본 harness 는 키 1 감시 대상(D004 매 바퀴 · B001 09:00 전 매 바퀴 · 뒤 10초 칸).
 * 호출 수 단언은 이 규칙으로 손으로 셈한 값이다(주석에 산수).
 */

const at = (hms: string) => kst(MON, hms);
const iso = (hms: string) => new Date(at(hms)).toISOString();
const tender = (n: number, fromHms: string): FeedItem => ({ watch: "tender_offer", from: at(fromHms), row: tenderRow(n) });
const rights = (n: number, fromHms: string): FeedItem => ({ watch: "rights_merger", from: at(fromHms), row: rightsRow(n) });

describe("하루 호출 수 · 바퀴 간격 (D-10 · D-11 · SC-4)", () => {
  it("월 07:00 부터 20:00 까지(네 감시 대상) — 키 1 14,760(9,360 · 5,400) · 키 2 6,240(4,680 · 1,560) · flush 10초 간격 · window_end · 해제 1번", async () => {
    const h = harness({ start: at("07:00:00"), watches: ALL_WATCHES, maxSleeps: 400_000 });
    const exit = await h.run();

    expect(exit).toEqual({ code: 0, reason: "window_end" });
    // 바퀴 46,800 ÷ 5 = 9,360 · B001 = 7,200 ÷ 5 + 39,600 ÷ 10 · I001 46,800 ÷ 10 · D005 46,800 ÷ 30
    expect(plannedDailyCalls(KEY1_WATCHES)).toBe(14_760);
    expect(plannedDailyCalls(KEY2_WATCHES)).toBe(6_240);
    expect(h.dart.callsOf("tender_offer")).toHaveLength(9_360);
    expect(h.dart.callsOf("rights_merger")).toHaveLength(1_440 + 3_960);
    expect(h.dart.callsOf("exchange_disclosure")).toHaveLength(4_680);
    expect(h.dart.callsOf("insider_trade_plan")).toHaveLength(1_560);
    expect(h.dart.listCalls).toHaveLength(14_760 + 6_240);
    expect(h.db.usageAdded(1)).toBe(14_760);
    expect(h.db.usageAdded(2)).toBe(6_240);
    expect(h.db.state.used).toBe(14_760);
    expect(h.db.state.used2).toBe(6_240);
    // 묶음 flush — 키 1 항목: 마지막(종료 때 flush) 앞까지는 10초 간격
    const flushes = h.db.calls.usageFlush.filter((f) => f.key === 1).map((f) => f.at);
    const gaps = flushes.slice(1, -1).map((t, i) => t - flushes[i]);
    expect(gaps.length).toBeGreaterThan(4_000);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(10_000);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(11_000);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
    expect(h.telegram.sent).toHaveLength(0);
    // 종일 5초(시작 대 시작) — 09:00 앞뒤 모두 D004 5초 · B001 은 09:00:00 이 첫 10초 칸
    const t = h.dart.callsOf("tender_offer");
    expect(t[1].at - t[0].at).toBe(5_000);
    const nine = t.findIndex((c) => c.at >= at("09:00:00"));
    expect(t[nine].at).toBe(at("09:00:00"));
    expect(t[nine + 1].at - t[nine].at).toBe(5_000);
    const b = h.dart.callsOf("rights_merger");
    const bNine = b.findIndex((c) => c.at >= at("09:00:00"));
    expect(b[bNine].at).toBe(at("09:00:00"));
    expect(b[bNine].at - b[bNine - 1].at).toBe(5_000);
    expect(b[bNine + 1].at - b[bNine].at).toBe(10_000);
  });

  it("07:00:30 에 뜬 실행은 07:00 ~ 07:00:25 의 6바퀴(D004 · B001 각 6)만 빠진다 — 14,760 − 12 · 20:00 window_end", async () => {
    const h = harness({ start: at("07:00:30") });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "window_end" });
    expect(h.dart.listCalls).toHaveLength(14_760 - 12);
    expect(h.db.usageAdded()).toBe(14_760 - 12);
  });

  it("바퀴가 늦게 끝나도(DART 지연 12초) 밀린 바퀴를 몰아서 부르지 않는다 — 호출 ≤ 14,760 · 바퀴 시작 간격 ≥ 바퀴 길이", async () => {
    const h = harness({ start: at("07:00:00"), dart: { delayMs: 12_000 } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "window_end" });
    expect(h.dart.listCalls.length).toBeLessThanOrEqual(14_760);
    const t = h.dart.callsOf("tender_offer");
    const gaps = t.slice(1).map((c, i) => c.at - t[i].at);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(24_000);
    expect(h.db.leaseLost).toHaveLength(0);
  });
});

describe("임대 (SC-2 · 한 실행만)", () => {
  it("다른 실행이 임대를 쥐고 있으면 DART 0 · 텔레그램 0 · 종료 0 lease_held", async () => {
    const h = harness({ start: at("10:00:00"), db: { lease: { holder: "other:1", until: at("10:01:00") } }, dart: { feed: [tender(1, "08:00:00")] } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "lease_held" });
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.dart.probeCalls).toHaveLength(0);
    expect(h.telegram.sent).toHaveLength(0);
    expect(h.logs.count("lease held by another run — exiting")).toBe(1);
    expect(h.db.calls.leaseRelease).toHaveLength(0);
    expect(h.db.state.lease.holder).toBe("other:1");
  });

  it("임대는 30초마다 TTL 90초로 연장되고 last_ok 를 함께 저장한다", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:02:05") });
    await h.run();
    const calls = h.db.calls.leaseAcquire;
    expect(calls.map((c) => c.at - at("10:00:00"))).toEqual([0, 30_000, 60_000, 90_000, 120_000]);
    expect(calls.every((c) => c.ttlS === LEASE_TTL_S)).toBe(true);
    expect(calls[0].lastOk).toBeUndefined();
    // 연장은 바퀴 시작 전에 — 그때까지의 마지막 성공 조회를 DB last_ok 로. D004 는 직전 바퀴(5초 전) ·
    // B001 은 직전 10초 칸(10:00:25 바퀴는 10:00:20 칸 그대로라 부르지 않음)
    expect(calls[1].lastOk).toEqual({ tender_offer: iso("10:00:25"), rights_merger: iso("10:00:20") });
    // 마지막 연장 10:02:00(바퀴 전) — D004 10:01:55 · B001 10:01:50
    expect(h.db.state.lastOk).toEqual({ tender_offer: iso("10:01:55"), rights_merger: iso("10:01:50") });
  });

  it("연장이 거절되면 조용히 종료 0 lease_lost — 해제하지 않는다", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { leaseAcquire: (c) => (c.n === 2 ? { held: false, fresh: false, reclaimed: 0, expired: 0 } : undefined) },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "lease_lost" });
    expect(h.clock.now()).toBe(at("10:00:30"));
    expect(h.db.calls.leaseRelease).toHaveLength(0);
  });

  it("연장 DB 오류가 60초 이어지면 종료 0 lease_unconfirmed(남이 넘겨받기 전)", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { leaseAcquire: (c) => (c.n >= 2 ? new Error("dart_alert_lease_acquire 실패: connection reset") : undefined) },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "lease_unconfirmed" });
    expect(h.clock.now()).toBe(at("10:01:00"));
    expect(h.db.leaseLost).toHaveLength(0);
  });

  it("넣기 RPC 가 LeaseLostError(55000)를 던지면 종료 0 lease_lost", async () => {
    const h = harness({
      start: at("10:00:00"),
      dart: {
        reply: (c) => {
          if (c.now >= at("10:00:20") && c.watch.id === "tender_offer") {
            h.db.steal("other:2", at("10:01:50"));
            return { rows: [tenderRow(7)] };
          }
          return undefined;
        },
      },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "lease_lost" });
    expect(h.db.leaseLost.map((l) => l.fn)).toEqual(["dart_alert_insert"]);
    // 43-06: 오늘 last_ok 없이 10:00 에 뜬 실행은 시작 점검이 장애 짝 글을 올린다 — 여기서는 공시 알림만 센다
    expect(h.telegram.alerts()).toHaveLength(0);
  });

  it("새 임대가 sending 2건을 되돌리면 warn possible duplicate after takeover 1번 · 그 2건을 첫 바퀴에 보낸다", async () => {
    const r1 = itemOf(tenderRow(1), "tender_offer");
    const r2 = itemOf(rightsRow(2), "rights_merger");
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:25"),
      db: {
        lease: { holder: "old:9", until: at("09:59:00") },
        rows: [
          dbRow(r1, { status: "sending", claimed_by: "old:9", attempts: 1, first_seen_at: at("09:58:00"), claim_until: at("09:59:30") }),
          dbRow(r2, { status: "sending", claimed_by: "old:9", attempts: 1, first_seen_at: at("09:58:01"), claim_until: at("09:59:31") }),
        ],
      },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "aborted" });
    expect(h.logs.count("possible duplicate after takeover", "warn")).toBe(1);
    expect(h.logs.find("possible duplicate after takeover")?.obj).toMatchObject({ reclaimed: 2 });
    // 43-06: 시작 점검 「멈췄습니다」(10:00:00) 뒤 같은 방 1초 간격 — 둘 다 첫 바퀴(10:00:00 ~ 10:00:05) 안
    expect(h.telegram.alerts().map((s) => s.at)).toEqual([at("10:00:01"), at("10:00:02")]);
    expect(h.db.statusOf(r1.rcept_no)).toBe("sent");
    expect(h.db.statusOf(r2.rcept_no)).toBe("sent");
  });

  it("바퀴가 길어도 임대가 만료 전에 연장된다", async () => {
    // DART 감시 대상마다 10초(시간 초과 흉내) + 차례 5건 송신이 건마다 10초 → 바퀴 약 70초(간격 10초보다 길다)
    let n = 0;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:30:00"),
      dart: {
        delayMs: 10_000,
        reply: (c) => (c.watch.id === "tender_offer" ? { rows: Array.from({ length: 5 }, () => tenderRow(++n)) } : undefined),
      },
      telegram: { delayMs: 10_000 },
    });
    const exit = await h.run();

    expect(exit.reason).not.toBe("lease_lost");
    expect(exit).toEqual({ code: 0, reason: "aborted" });
    expect(h.db.leaseLost).toHaveLength(0);
    const renewals = h.db.calls.leaseAcquire.map((c) => c.at);
    const gaps = renewals.slice(1).map((t, i) => t - renewals[i]);
    expect(renewals.length).toBeGreaterThan(20);
    expect(Math.max(...gaps)).toBeLessThan(LEASE_TTL_S * 1000);
    // 긴 바퀴가 실제로 일어났다(바퀴 시작 간격 > 60초) · 송신이 이어졌다
    const t = h.dart.callsOf("tender_offer");
    expect(t[1].at - t[0].at).toBeGreaterThan(60_000);
    expect(h.telegram.sent.length).toBeGreaterThan(80);
    expect(h.telegram.sent.every((s) => s.result.kind === "ok")).toBe(true);
  });
});

describe("새 건 송신 · 늦은 알림 기준점 (D-02 · D-12 · D-13 · SC-3)", () => {
  it("10:00 에 공개매수 1건이 처음 나타나면 그 바퀴 안에서 send 1 · 늦은 표시 없음 · 다음 바퀴 send 0", async () => {
    const h = harness({ start: at("09:59:40"), abortAt: at("10:01:00"), dart: { feed: [tender(1, "10:00:00")] } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "aborted" });
    expect(h.telegram.alerts()).toHaveLength(1);
    const s = h.telegram.alerts()[0];
    expect(s.text).not.toContain(LATE_LABEL);
    expect(s.text).toContain("대상회사1");
    // 조회 응답 뒤 같은 바퀴 안(다음 바퀴 DART 호출 전)에 보냈다
    const t = h.dart.callsOf("tender_offer");
    const firstSeen = t.find((c) => c.rows > 0)!;
    expect(firstSeen.at).toBe(at("10:00:00"));
    const next = t[t.indexOf(firstSeen) + 1];
    expect(s.seq).toBeGreaterThan(firstSeen.seq);
    expect(s.seq).toBeLessThan(next.seq);
    expect(s.at - firstSeen.at).toBeLessThan(10_000);
  });

  it("09:30 에 처음 뜬 실행(오늘 성공 조회 없음) — 그날 공개매수 · 유상증자 둘 다 「(늦은 알림)」", async () => {
    const h = harness({
      start: at("09:30:00"),
      abortAt: at("09:30:30"),
      dart: { feed: [tender(1, "08:10:00"), rights(2, "09:05:00")] },
    });
    await h.run();
    expect(h.telegram.alerts()).toHaveLength(2);
    for (const s of h.telegram.alerts()) expect(s.text).toContain(LATE_LABEL);
    expect(h.db.calls.insert[0].items.map((i) => i.late)).toEqual([true, true]);
  });

  it("DB last_ok 10:00:00 뒤 10:06:30 에 인계받은 실행 — 그 사이 들어온 건은 늦음 · 인계 뒤 다음 바퀴에 들어온 건은 늦지 않음", async () => {
    const h = harness({
      start: at("10:06:30"),
      abortAt: at("10:07:30"),
      db: {
        lease: { holder: "old:9", until: at("10:01:30") },
        lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") },
      },
      dart: { feed: [tender(1, "10:03:00"), tender(2, "10:06:45")] },
    });
    await h.run();
    expect(h.telegram.alerts()).toHaveLength(2);
    const [a, b] = h.telegram.alerts();
    expect(a.text).toContain("대상회사1");
    expect(a.text).toContain(LATE_LABEL);
    expect(b.text).toContain("대상회사2");
    expect(b.text).not.toContain(LATE_LABEL);
    // 5초 바퀴 — 10:06:30 · :35 · :40 · :45 의 넷째 바퀴가 처음 본다
    expect(b.at).toBe(at("10:06:45"));
  });

  it("07:29:55 바퀴 성공 뒤 07:30:05 바퀴에 처음 보인 전날 저녁 서류는 늦지 않다", async () => {
    const h = harness({ start: at("07:29:55"), abortAt: at("07:30:30"), dart: { feed: [tender(3, "07:30:05")] } });
    await h.run();
    expect(h.telegram.alerts()).toHaveLength(1);
    expect(h.telegram.alerts()[0].at).toBe(at("07:30:05"));
    expect(h.telegram.alerts()[0].text).not.toContain(LATE_LABEL);
  });

  it("조회는 오늘(KST) 날짜로만 한다", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:25") });
    await h.run();
    expect(new Set(h.dart.listCalls.map((c) => c.day))).toEqual(new Set(["20261116"]));
  });
});

describe("한도 · 치명 오류 (공식 API 운영 기준 ④ · SC-4)", () => {
  it("020 → 한도 의심 표시 1 · 종료 1 quota · 그 뒤 DART 호출 0", async () => {
    const h = harness({
      start: at("10:00:00"),
      dart: { reply: (c) => (c.now >= at("10:00:20") && c.watch.id === "tender_offer" ? { status: "020" } : undefined) },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "quota" });
    expect(h.db.state.strikes).toBe(1);
    const last = h.dart.listCalls[h.dart.listCalls.length - 1];
    expect(last.status).toBe("020");
    // 10:00:00 D004 · B001 / :05 D004 / :10 D004 · B001 / :15 D004 / :20 D004(020 — 같은 키 B001 은 부르지 않음) = 7
    expect(h.dart.listCalls).toHaveLength(7);
    expect(h.db.usageAdded()).toBe(7);
    expect(h.logs.lines.some((l) => l.level === "error")).toBe(true);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
  });

  it("시작 때 오늘 한도 의심 표시가 있으면 공개매수 1쪽 탐침 1회 — 020 이면 종료 1 probe_failed · 목록 조회 0", async () => {
    const h = harness({ start: at("10:00:00"), db: { strikes: 1 }, dart: { probe: () => ({ status: "020" }) } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "probe_failed" });
    expect(h.dart.probeCalls).toHaveLength(1);
    expect(h.dart.probeCalls[0].day).toBe("20261116");
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.db.usageAdded()).toBe(1);
  });

  it("탐침이 000 이면 수집을 재개한다", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:25"), db: { strikes: 2 } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "aborted" });
    expect(h.dart.probeCalls).toHaveLength(1);
    expect(h.dart.listCalls.length).toBeGreaterThan(0);
    expect(h.dart.probeCalls[0].seq).toBeLessThan(h.dart.listCalls[0].seq);
    expect(h.logs.count("quota probe ok — resuming collection")).toBe(1);
  });

  it("010 → 종료 1 dart_key · 100 → 종료 1 dart_bug", async () => {
    const key = harness({ start: at("10:00:00"), dart: { reply: () => ({ status: "010" }) } });
    expect(await key.run()).toEqual({ code: 1, reason: "dart_key" });
    expect(key.dart.listCalls).toHaveLength(1);
    const bug = harness({ start: at("10:00:00"), dart: { reply: (c) => (c.watch.id === "rights_merger" ? { status: "100" } : undefined) } });
    expect(await bug.run()).toEqual({ code: 1, reason: "dart_bug" });
    expect(bug.dart.listCalls).toHaveLength(2);
    expect(bug.db.state.strikes).toBe(0);
  });

  it(`모르는 코드가 감시 대상 상관없이 연속 ${UNKNOWN_STREAK}번 → 한도 의심 표시 · 종료 1 unknown_streak`, async () => {
    const h = harness({ start: at("10:00:00"), dart: { reply: () => ({ status: "999" }) } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "unknown_streak" });
    expect(h.dart.listCalls).toHaveLength(UNKNOWN_STREAK);
    expect(h.db.state.strikes).toBe(1);
  });

  it("모르는 코드 사이에 성공이 끼면 연속이 끊긴다", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:00"),
      dart: { reply: (c) => (c.watch.id === "tender_offer" ? { status: "999" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.db.state.strikes).toBe(0);
  });

  it("800 · 네트워크 오류는 그 바퀴만 실패하고 계속 돈다(종료 없음)", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:00"),
      // 43-06: 직전 성공 조회 10:00:00 — 1분 실패는 장애(5분) 전이라 error 0
      db: { lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") } },
      dart: { reply: (c) => ({ status: c.watch.id === "tender_offer" ? "800" : "network" }) },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "aborted" });
    // 10:00:00 ~ 10:00:55 바퀴 12번 — D004 12 + B001 10초 칸 6 = 18
    expect(h.dart.listCalls).toHaveLength(18);
    expect(h.db.state.strikes).toBe(0);
    expect(h.logs.lines.filter((l) => l.level === "error")).toHaveLength(0);
  });
});

describe("예산 (SC-4 · 공식 API 운영 기준 ①)", () => {
  it("시작 때 이미 15,000 이면 DART 를 부르지 않고 종료 0 budget_at_start", async () => {
    const h = harness({ start: at("10:00:00"), db: { used: 15_000 } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "budget_at_start" });
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.dart.probeCalls).toHaveLength(0);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
  });

  it("실행 중 15,000 에 닿으면 error 와 함께 종료 1 budget_exhausted", async () => {
    const h = harness({ start: at("10:00:00"), db: { used: 14_990 } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "budget_exhausted" });
    // 14,990 + 2(:00) + 1(:05) + 2(:10) + 1(:15) + 2(:20) + 1(:25) = 14,999 → :30 바퀴가 D004 · B001 을 불러 15,001 →
    // 다음 예산 문(바퀴 사이)에서 멈춘다 = 11회
    expect(h.dart.listCalls).toHaveLength(11);
    expect(h.logs.count("daily budget exhausted — stopping this run", "error")).toBe(1);
  });

  it("12,000(80%)에 닿으면 warn 1번", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:05:00"), db: { used: 11_990 } });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.logs.count("daily budget 80% reached", "warn")).toBe(1);
  });
});

describe("SIGTERM", () => {
  it("abort → 다음 걸음에서 종료 0 aborted · 사용량 flush · 임대 해제", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:42") });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "aborted" });
    expect(h.clock.now()).toBeLessThanOrEqual(at("10:00:43"));
    expect(h.db.state.pendingUsage).toBe(0);
    expect(h.db.state.used).toBe(h.dart.listCalls.length);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
    expect(h.db.state.lease.holder).toBeNull();
  });
});

describe("넣기 실패 — 소리 없이 멈추지 않는다 (리뷰 WR-01)", () => {
  it("rcept_dt 가 빠진 행은 조회 날짜로 넣고 warn — 같은 바퀴 공개매수도 함께 들어가 나간다", async () => {
    const broken = rightsRow(2, MON, { rcept_dt: undefined as unknown as string });
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:30"),
      db: { lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") } },
      dart: { feed: [tender(1, "10:00:00"), { watch: "rights_merger", from: at("10:00:00"), row: broken }] },
    });
    await h.run();
    expect(h.db.calls.insert[0].items.map((i) => i.rcept_dt)).toEqual(["2026-11-16", "2026-11-16"]);
    expect(h.logs.count("dart row rcept_dt invalid — using query day", "warn")).toBe(1);
    expect(h.telegram.alerts()).toHaveLength(2);
  });

  it("DB 가 한 행을 값 때문에 거절(23502)하면 그 행만 error 로 건너뛰고 공개매수는 같은 바퀴에 나간다 · 거절 행은 다시 두드리지 않는다", async () => {
    const poison = rightsRow(2).rcept_no;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:00"),
      db: {
        lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") },
        before: (fn, _now, info) => {
          if (fn === "dart_alert_insert" && info?.rceptNos?.includes(poison)) {
            throw new DbError("dart_alert_insert 실패 (23502): null value in column", "23502");
          }
        },
      },
      dart: { feed: [tender(1, "10:00:00"), rights(2, "10:00:00")] },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.telegram.alerts()).toHaveLength(1);
    expect(h.telegram.alerts()[0].text).toContain("대상회사1");
    expect(h.logs.count("dart alert row rejected by db — skipped", "error")).toBe(1);
    expect(h.logs.find("dart alert row rejected by db — skipped")?.obj).toMatchObject({ rceptNo: poison, err: { code: "23502", kind: "db" } });
    // 묶음 1번(실패) + 행마다 1번씩(공개매수 성공 · 거절) — 그 뒤 바퀴는 넣기 0
    expect(h.db.calls.insert).toHaveLength(1);
    expect(h.logs.count("dart alert insert failing")).toBe(0);
  });

  it("넣기는 DB 에 반영됐는데 응답이 끊기면(after 훅 · 리뷰 IN-50) warn 1번 · 다음 바퀴 다시 넣어도 새 행 0 · 그 건은 정확히 1번 나간다", async () => {
    let lost = 0;
    const afterFns: string[] = [];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:00"),
      db: {
        lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") },
        after: (fn) => {
          afterFns.push(fn);
          if (fn === "dart_alert_insert" && lost === 0) {
            lost += 1;
            throw new Error("dart_alert_insert 실패: fetch failed");
          }
        },
      },
      dart: { feed: [tender(1, "10:00:00")] },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(lost).toBe(1);
    expect(afterFns).toContain("dart_alert_insert");
    expect(h.logs.count("dart alert insert failed", "warn")).toBe(1);
    // 첫 넣기는 반영(행 1)되고 응답만 잃었다 → 다음 바퀴 넣기는 새 행 0
    expect(h.db.calls.insert.map((c) => c.inserted)).toEqual([1, 0]);
    expect(h.telegram.alerts()).toHaveLength(1);
    expect(h.telegram.alerts()[0].text).toContain("대상회사1");
  });

  it("넣기가 계속 실패(DB 오류)하면 5분 넘긴 바퀴에 error 1번 · 「멈췄습니다(공시 저장 실패)」 · 넣기가 되면 닫고 알림이 나간다", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:12:30"),
      db: {
        lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") },
        before: (fn, now) => {
          if (fn === "dart_alert_insert" && now < at("10:10:00")) throw new DbError("dart_alert_insert 실패: fetch failed", null);
        },
      },
      dart: { feed: [tender(1, "10:00:00")] },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.logs.count("dart alert insert failing", "error")).toBe(1);
    expect(h.logs.find("dart alert insert failing")?.obj.sinceMs).toBeGreaterThan(300_000);
    const opens = h.db.calls.outage.filter((c) => c.action === "open");
    expect(opens).toHaveLength(1);
    expect(opens[0].reason).toBe("공시 저장 실패 db");
    expect(opens[0].at).toBeGreaterThan(at("10:05:00"));
    expect(opens[0].at).toBeLessThanOrEqual(at("10:05:10"));
    const notices = h.telegram.notices().map((s) => s.text);
    expect(notices[0]).toContain("⚠ 공시 알림이 멈췄습니다 — 10:00 부터 DART 조회 실패(공시 저장 실패 db)");
    expect(notices[1]).toContain("✅ 공시 알림 다시 동작");
    expect(h.telegram.alerts()).toHaveLength(1);
    expect(h.logs.count("dart outage opened", "error")).toBe(1);
  });
});

describe("멈추는 길에서 이미 넣은 건을 버리지 않는다 (리뷰 WR-05)", () => {
  const pendingToday = (n: number) => dbRow(itemOf(rightsRow(n), "rights_merger"), { first_seen_at: at("09:59:00"), next_attempt_at: at("09:59:30") });

  it("예산이 이미 찬 실행(budget_at_start)도 임대를 쥐면 OpenDART 0 으로 남은 건을 보낸다 · 남은 건 0 이면 error 없음", async () => {
    const h = harness({ start: at("10:00:00"), db: { used: 15_000, rows: [pendingToday(1)] } });
    expect(await h.run()).toEqual({ code: 0, reason: "budget_at_start" });
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.dart.probeCalls).toHaveLength(0);
    expect(h.telegram.alerts()).toHaveLength(1);
    expect(h.db.statusOf(rightsRow(1).rcept_no)).toBe("sent");
    expect(h.db.calls.countUnsent).toEqual([{ at: expect.any(Number), day: MON, unsent: 0 }]);
    expect(h.logs.count("alerts left unsent at stop")).toBe(0);
  });

  it("한도 의심 탐침 실패(probe_failed)로 멈춰도 남은 건을 먼저 보낸다", async () => {
    const h = harness({ start: at("10:00:00"), db: { strikes: 1, rows: [pendingToday(1)] }, dart: { probe: () => ({ status: "020" }) } });
    expect(await h.run()).toEqual({ code: 1, reason: "probe_failed" });
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.telegram.alerts()).toHaveLength(1);
  });

  it("실행 중 예산 소진 · 텔레그램 실패로 못 나간 건이 남으면 error alerts left unsent at stop(수 · 이유)", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { used: 14_990, lastOk: { tender_offer: iso("10:00:00"), rights_merger: iso("10:00:00") } },
      dart: { feed: [rights(1, "10:00:00")] },
      telegram: { reply: (c) => (c.text.startsWith("📢") ? { kind: "transient", code: 502, description: "Bad Gateway" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "budget_exhausted" });
    expect(h.logs.count("alerts left unsent at stop", "error")).toBe(1);
    expect(h.logs.find("alerts left unsent at stop")?.obj).toMatchObject({ unsent: 1, reason: "budget_exhausted" });
    // 위 예산 시험과 같은 산수 — 14,990 + 2 + 1 + 2 + 1 + 2 + 1 + 2 = 15,001 → 11회
    expect(h.dart.listCalls).toHaveLength(11);
  });

  it("새 임대가 지난 날 못 나간 건을 expired 로 닫으면 error unsent alerts expired on takeover", async () => {
    const yesterday = dbRow(itemOf(rightsRow(1, "2026-11-13"), "rights_merger"), { status: "pending" });
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:20"), db: { rows: [yesterday] } });
    await h.run();
    expect(h.db.statusOf(yesterday.rcept_no)).toBe("expired");
    expect(h.logs.count("unsent alerts expired on takeover", "error")).toBe(1);
    expect(h.logs.find("unsent alerts expired on takeover")?.obj).toMatchObject({ expired: 1 });
  });

  it("SIGTERM 으로 멈출 때는 남은 건을 보내거나 세지 않는다(다음 실행이 이어 보냄)", async () => {
    const h = harness({ start: at("10:00:00"), abortAt: at("10:00:20") });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });
    expect(h.db.calls.countUnsent).toHaveLength(0);
  });
});
