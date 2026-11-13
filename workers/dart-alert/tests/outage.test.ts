import { describe, expect, it } from "vitest";
import { OUTAGE_AFTER_MS } from "../src/collector";
import { DartApiError } from "../src/dart/client";
import { LATE_LABEL, outageText, recoveredText } from "../src/message";
import { harness, kst, MON, tenderRow, type FeedItem } from "./helpers/fakes";

/**
 * Phase 43-06 T1 — 장애 짝 글(D-16 · D-17 · SC-6). 가짜 시계 · 가짜 DB(43-02 `dart_alert_outage` 계약 —
 * open 한 번 · notice pending 이면 다음 보유자에게 한 번 더 · notice sent/failed · close 는 sent 였을 때만 notify) ·
 * 가짜 DART · 가짜 텔레그램. 실제 OpenDART · Supabase · 텔레그램 호출 없음.
 *
 * - 확인 시간대 안에서 감시 대상 하나라도 기준점(마지막 성공 조회 · 없으면 07:02)에서 5분 넘게 성공이 없으면 연다.
 * - 연 실행만 「⚠ 공시 알림이 멈췄습니다」 1건 · error `dart outage opened` · 모든 감시 대상이 다시 성공한 첫 바퀴에 닫고
 *   「멈췄습니다」 가 실제로 나갔을 때만 「✅ 공시 알림 다시 동작」 1건.
 * - 시작 점검(죽은 수집기) · seed 경로(첫 배포 날 — 체커 W1) · 치명 종료 전 장애 글.
 */

const at = (hms: string) => kst(MON, hms);
const iso = (hms: string) => new Date(at(hms)).toISOString();
const fresh = (hms: string) => ({ tender_offer: iso(hms), rights_merger: iso(hms) });
const tender = (n: number, fromHms: string): FeedItem => ({ watch: "tender_offer", from: at(fromHms), row: tenderRow(n) });

const STOPPED = "⚠ 공시 알림이 멈췄습니다";
const RECOVERED = "✅ 공시 알림 다시 동작";

type H = ReturnType<typeof harness>;
const opens = (h: H) => h.db.calls.outage.filter((c) => c.action === "open");
const closes = (h: H) => h.db.calls.outage.filter((c) => c.action === "close");
const stopped = (h: H) => h.telegram.sent.filter((s) => s.text.startsWith(STOPPED));
const recovered = (h: H) => h.telegram.sent.filter((s) => s.text.startsWith(RECOVERED));

/** 10:00:00 부터 감시 대상 둘 다 800 — until 전까지 */
const dartDown = (untilHms: string) => (c: { now: number }) => (c.now < at(untilHms) ? { status: "800" } : undefined);

describe("DART 5분 실패 → 장애 열기 · 한 번만 (D-17)", () => {
  it("10:00 부터 계속 800 — 10:05 를 넘긴 첫 바퀴에 open 1 · 글 1 · notice sent · error 1 · 10:30 까지 추가 글 0", async () => {
    expect(OUTAGE_AFTER_MS).toBe(300_000);
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:30:30"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: dartDown("23:00:00") },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });

    expect(opens(h)).toHaveLength(1);
    // 기준점 10:00:00 + 5분 「넘게」 — 10:05:00 바퀴는 정확히 5분이라 아니고, 다음 5초 바퀴 10:05:05 에 연다(D004 매 바퀴)
    expect(opens(h)[0].at).toBe(at("10:05:05"));
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text.startsWith(`${STOPPED} — 10:00 부터 DART 조회 실패(`)).toBe(true);
    expect(stopped(h)[0].text).toContain("복구되면 알려 드립니다.");
    expect(h.db.state.outage.notice).toBe("sent");
    expect(h.logs.count("dart outage opened", "error")).toBe(1);
    expect(h.logs.find("dart outage opened")?.obj).toMatchObject({ notice: "sent" });
    expect(h.telegram.sent).toHaveLength(1);
    expect(closes(h)).toHaveLength(0);
  });

  it("이어서 10:31 에 회복 — 그 바퀴에 close · 「다시 동작 — 10:00 ~ 10:31」 1건 · info dart outage closed", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:31:30"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: dartDown("10:31:00") },
    });
    await h.run();

    expect(stopped(h)).toHaveLength(1);
    expect(closes(h)).toHaveLength(1);
    expect(closes(h)[0].at).toBe(at("10:31:00"));
    expect(recovered(h)).toHaveLength(1);
    expect(recovered(h)[0].text).toBe(recoveredText(at("10:00:00"), at("10:31:00")));
    expect(recovered(h)[0].text).toContain("10:00 ~ 10:31");
    expect(h.logs.count("dart outage closed", "info")).toBe(1);
    expect(h.logs.find("dart outage closed")?.obj).toMatchObject({ notify: true });
    expect(h.db.state.outage.since).toBeNull();
    // 닫힌 뒤에는 다시 열지 않는다
    expect(opens(h)).toHaveLength(1);
  });

  it("「멈췄습니다」 송신이 실패(transient)면 notice failed · error · 회복 때 「다시 동작」 0건", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:12:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: dartDown("10:10:00") },
      telegram: { reply: (c) => (c.text.startsWith("⚠") ? { kind: "transient", code: 502, description: "Bad Gateway" } : undefined) },
    });
    await h.run();

    expect(opens(h)).toHaveLength(1);
    expect(h.db.calls.outage.filter((c) => c.action === "notice").map((c) => c.reason)).toEqual(["failed"]);
    expect(h.logs.count("dart outage opened", "error")).toBe(1);
    expect(h.logs.find("dart outage opened")?.obj).toMatchObject({ notice: "failed" });
    expect(closes(h)).toHaveLength(1);
    expect(recovered(h)).toHaveLength(0);
    expect(h.logs.find("dart outage closed")?.obj).toMatchObject({ notify: false });
  });

  it("4분 50초 실패 뒤 회복 → 글 0 · open 0", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:07:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: dartDown("10:04:50") },
    });
    await h.run();
    expect(h.dart.listCalls.filter((c) => c.status === "800").length).toBeGreaterThan(0);
    expect(h.db.calls.outage).toHaveLength(0);
    expect(h.telegram.sent).toHaveLength(0);
    expect(h.logs.count("dart outage opened")).toBe(0);
  });

  it("공개매수는 성공 · 주요사항보고서만 6분 실패 → open(사유에 감시 대상 표시 · B001 은 10초 칸이라 10:05:10)", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:06:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: (c) => (c.watch.id === "rights_merger" ? { status: "800" } : undefined) },
    });
    await h.run();
    expect(opens(h)).toHaveLength(1);
    expect(opens(h)[0].at).toBe(at("10:05:10"));
    const reason = opens(h)[0].reason ?? "";
    expect(reason).toContain("주요사항보고서");
    expect(reason).not.toContain("공개매수");
    expect(reason.length).toBeLessThanOrEqual(300);
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text).toContain("주요사항보고서");
    // 공개매수가 성공해도 한 감시 대상이 실패 중이면 닫지 않는다
    expect(closes(h)).toHaveLength(0);
  });
});

describe("시작 점검 — 죽은 수집기 (D-16 · 가정 4)", () => {
  it("DB lastOk 10:00:00 · 10:07:00 에 임대를 잡음 → 첫 바퀴 전에 open · 글 1 · 첫 바퀴 성공에 「다시 동작」 1(두 글)", async () => {
    const h = harness({
      start: at("10:07:00"),
      abortAt: at("10:07:30"),
      db: { lease: { holder: "old:9", until: at("10:01:30") }, lastOk: fresh("10:00:00") },
    });
    await h.run();

    expect(opens(h)).toHaveLength(1);
    expect(opens(h)[0].at).toBe(at("10:07:00"));
    expect(opens(h)[0].reason).toContain("수집기 중단(마지막 조회 10:00)");
    const firstDart = h.dart.listCalls[0];
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text.startsWith(`${STOPPED} — 10:00 부터`)).toBe(true);
    expect(stopped(h)[0].seq).toBeLessThan(firstDart.seq);
    expect(recovered(h)).toHaveLength(1);
    expect(recovered(h)[0].seq).toBeGreaterThan(firstDart.seq);
    expect(recovered(h)[0].text).toContain("10:00 ~ 10:07");
    expect(h.telegram.sent).toHaveLength(2);
    expect(h.logs.count("dart outage opened", "error")).toBe(1);
  });

  it("07:00:30 시작 · lastOk 없음 → 글 0(기준점 07:02)", async () => {
    const h = harness({ start: at("07:00:30"), abortAt: at("07:03:00") });
    await h.run();
    expect(h.db.calls.outage).toHaveLength(0);
    expect(h.telegram.sent).toHaveLength(0);
  });

  it("07:08:00 시작(auto) · lastOk 없음 → 열고 닫음(두 글 · 「07:02 부터」)", async () => {
    const h = harness({ start: at("07:08:00"), abortAt: at("07:08:20") });
    await h.run();
    expect(opens(h)).toHaveLength(1);
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text.startsWith(`${STOPPED} — 07:02 부터`)).toBe(true);
    expect(recovered(h)).toHaveLength(1);
    expect(h.telegram.sent).toHaveLength(2);
  });

  it("첫 배포 seed 경로는 멈췄습니다를 올리지 않는다", async () => {
    // 월 14:00 seed · DB last_ok 비어 있음 · 열린 장애 없음 · DART 정상 → seed 바퀴 → 시작 점검 → auto 바퀴들.
    // 시작 점검을 seed 바퀴 앞에 두면 기준점 07:02 와 14:00 의 차이로 open 1 · 글 2 가 나와 깨진다(체커 W1).
    const h = harness({
      start: at("14:00:00"),
      mode: "seed",
      abortAt: at("14:10:00"),
      dart: { feed: [tender(1, "09:10:00"), tender(2, "14:00:10")] },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });

    expect(h.logs.count("seed done")).toBe(1);
    expect(opens(h)).toHaveLength(0);
    expect(h.telegram.sent.filter((s) => s.text.includes("공시 알림이 멈췄습니다"))).toHaveLength(0);
    expect(h.telegram.sent.filter((s) => s.text.includes("다시 동작"))).toHaveLength(0);
    // 14:00:10 에 새로 나타난 공개매수 1건은 늦은 알림 없이 1번
    expect(h.telegram.sent).toHaveLength(1);
    expect(h.telegram.sent[0].text).toContain("대상회사2");
    expect(h.telegram.sent[0].text).not.toContain(LATE_LABEL);
    expect(h.telegram.sent[0].at).toBe(at("14:00:10"));
  });

  it("DB 에 이미 열린 장애(notice sent)가 있는 채로 시작 → 새 글 0 · 첫 성공 바퀴에 「다시 동작」 1건", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:30"),
      db: { lastOk: fresh("10:00:00"), outage: { since: iso("09:50:00"), reason: "x", notice: "sent" } },
    });
    await h.run();
    expect(opens(h)).toHaveLength(0);
    expect(stopped(h)).toHaveLength(0);
    expect(recovered(h)).toHaveLength(1);
    expect(recovered(h)[0].text).toBe(recoveredText(at("09:50:00"), at("10:00:00")));
    expect(h.db.state.outage.since).toBeNull();
  });

  it("DB 장애 notice pending(앞 실행이 글 전에 죽음) → 시작 점검에서 opened true → 「멈췄습니다」 1건 · 회복 때 「다시 동작」", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:30"),
      db: { lastOk: fresh("10:00:00"), outage: { since: iso("09:50:00"), reason: "x", notice: "pending" } },
    });
    await h.run();
    expect(opens(h)).toHaveLength(1);
    expect(opens(h)[0].at).toBe(at("10:00:00"));
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text.startsWith(`${STOPPED} — 09:50 부터`)).toBe(true);
    expect(stopped(h)[0].seq).toBeLessThan(h.dart.listCalls[0].seq);
    expect(recovered(h)).toHaveLength(1);
  });
});

describe("치명 종료 전 장애 글 (D-17 · 공식 API 운영 기준 ④)", () => {
  it("020 → open(「하루 조회 한도 초과(020)」) · 글 1건 · strike 1 · 종료 1", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: (c) => (c.now >= at("10:00:20") && c.watch.id === "tender_offer" ? { status: "020" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "quota" });
    expect(opens(h)).toHaveLength(1);
    expect(opens(h)[0].reason).toContain("하루 조회 한도 초과(020)");
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text).toContain("하루 조회 한도 초과(020)");
    expect(h.db.state.strikes).toBe(1);
    expect(h.db.state.outage.notice).toBe("sent");
    // 장애 글은 임대를 풀기 전에
    expect(h.db.calls.outage[0].at).toBeLessThanOrEqual(h.db.calls.leaseRelease[0].at);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
  });

  it("실행 중 예산 소진 → 「자체 하루 예산 소진」 글 · 종료 1", async () => {
    const h = harness({ start: at("10:00:00"), db: { used: 14_990, lastOk: fresh("10:00:00") } });
    expect(await h.run()).toEqual({ code: 1, reason: "budget_exhausted" });
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text).toContain("자체 하루 예산 소진");
    expect(h.logs.count("dart outage opened", "error")).toBe(1);
  });

  it("010 → 「인증키 오류(010)」 글 · 종료 1", async () => {
    const h = harness({ start: at("10:00:00"), db: { lastOk: fresh("10:00:00") }, dart: { reply: () => ({ status: "010" }) } });
    expect(await h.run()).toEqual({ code: 1, reason: "dart_key" });
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text).toContain("인증키 오류(010)");
  });

  it("이미 열린 장애가 있으면 치명 종료에도 글을 다시 올리지 않는다(한 번만)", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { lastOk: fresh("10:00:00"), outage: { since: iso("09:50:00"), reason: "x", notice: "sent" } },
      dart: { reply: () => ({ status: "020" }) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "quota" });
    expect(stopped(h)).toHaveLength(0);
    expect(opens(h)).toHaveLength(0);
  });

  it("장애 기록 RPC 가 실패해도 종료 코드는 그대로 1 · 실패 사유는 error 로그", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: {
        lastOk: fresh("10:00:00"),
        before: (fn) => {
          if (fn === "dart_alert_outage") throw new Error("dart_alert_outage 실패: connection reset");
        },
      },
      dart: { reply: () => ({ status: "020" }) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "quota" });
    expect(h.logs.count("dart outage open failed", "error")).toBe(1);
    expect(h.logs.find("dart outage open failed")?.obj).toMatchObject({ err: { message: expect.stringContaining("connection reset") } });
    expect(h.telegram.sent).toHaveLength(0);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
  });
});

describe("창 경계 — 다른 날로 넘어간 장애", () => {
  it("어제 19:50 열림 · 오늘 07:00:40 첫 성공 → 「다시 동작」 문구가 날짜 포함 꼴", async () => {
    const TUE = "2026-11-17";
    const since = kst(MON, "19:50:00");
    const h = harness({
      start: kst(TUE, "07:00:40"),
      abortAt: kst(TUE, "07:00:50"),
      db: { outage: { since: new Date(since).toISOString(), reason: "x", notice: "sent" } },
    });
    await h.run();
    expect(stopped(h)).toHaveLength(0);
    expect(recovered(h)).toHaveLength(1);
    expect(recovered(h)[0].text).toBe(recoveredText(since, kst(TUE, "07:00:40")));
    expect(recovered(h)[0].text).toContain("(11/16 19:50 부터 멈춤)");
    // 문구 꼴 확인(43-09 builder 그대로)
    expect(outageText(since, "a")).toContain("19:50 부터");
  });
});

describe("짝 글이 깨지지 않는다 (리뷰 WR-02)", () => {
  it("「멈췄습니다」 는 나갔는데 notice 기록이 한 번 실패 → 다음 바퀴에 다시 적고 · 회복 때 「다시 동작」 1건", async () => {
    let outageCalls = 0;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:12:00"),
      db: {
        lastOk: fresh("10:00:00"),
        before: (fn) => {
          if (fn === "dart_alert_outage" && ++outageCalls === 2) throw new Error("dart_alert_outage 실패: fetch failed");
        },
      },
      dart: { reply: dartDown("10:10:00") },
    });
    await h.run();
    expect(stopped(h)).toHaveLength(1);
    expect(h.logs.count("dart outage notice record failed", "error")).toBe(1);
    expect(h.logs.count("dart outage notice recorded on retry", "info")).toBe(1);
    expect(h.db.calls.outage.filter((c) => c.action === "notice").map((c) => c.reason)).toEqual(["sent"]);
    expect(recovered(h)).toHaveLength(1);
    expect(closes(h)).toHaveLength(1);
  });

  it("notice 기록이 회복 때까지 계속 실패해 DB 가 pending 이어도 — 「멈췄습니다」 를 보낸 실행은 「다시 동작」 을 보낸다", async () => {
    let outageCalls = 0;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:12:00"),
      db: {
        lastOk: fresh("10:00:00"),
        before: (fn, now) => {
          if (fn === "dart_alert_outage" && ++outageCalls > 1 && now < at("10:10:00")) throw new Error("dart_alert_outage 실패: fetch failed");
        },
      },
      dart: { reply: dartDown("10:10:00") },
    });
    await h.run();
    expect(stopped(h)).toHaveLength(1);
    expect(h.logs.count("dart outage notice record retry failed", "warn")).toBeGreaterThan(1);
    expect(recovered(h)).toHaveLength(1);
    expect(recovered(h)[0].text).toBe(recoveredText(at("10:00:00"), at("10:10:00")));
    expect(h.db.state.outage.since).toBeNull();
  });

  it("「다시 동작」 송신이 실패하면 DB 를 닫지 않고 다음 성공 바퀴에 다시 보낸 뒤 닫는다 · 120초 넘으면 error 1번", async () => {
    let recoveredTries = 0;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:16:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: dartDown("10:10:00") },
      telegram: {
        reply: (c) =>
          c.text.startsWith("✅") && ++recoveredTries <= 6 ? { kind: "transient", code: 502, description: "Bad Gateway" } : undefined,
      },
    });
    await h.run();
    expect(stopped(h)).toHaveLength(1);
    const tries = recovered(h);
    expect(tries).toHaveLength(7);
    expect(tries.slice(0, 6).every((t) => t.result.kind === "transient")).toBe(true);
    expect(tries[6].result.kind).toBe("ok");
    // 재시도 간격은 5 · 10 · 20 · 40 · 60초 꼴로 는다
    const gaps = tries.slice(1).map((t, i) => t.at - tries[i].at);
    expect(gaps[0]).toBeGreaterThanOrEqual(5_000);
    expect(gaps[3]).toBeGreaterThanOrEqual(40_000);
    expect(h.logs.count("dart outage recovered notice failed — keeping outage open, retrying", "warn")).toBe(6);
    expect(h.logs.count("dart outage recovered notice unsent over 120s", "error")).toBe(1);
    // close 는 「다시 동작」 이 나간 뒤 한 번 · 그 전에는 DB 가 열려 있다
    expect(closes(h)).toHaveLength(1);
    expect(closes(h)[0].at).toBeGreaterThanOrEqual(tries[6].at);
    expect(h.db.state.outage.since).toBeNull();
    expect(opens(h)).toHaveLength(1);
  });
});

describe("HTTP 차단 신호 — 두드리지 않고 멈춘다 (리뷰 WR-03)", () => {
  it("HTTP 429 → 한도 의심 표시 · 「요청 제한(HTTP 429)」 장애 글 · 종료 1 quota · 그 뒤 DART 호출 0", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: (c) => (c.now >= at("10:00:20") ? { error: new DartApiError(429, "HTTP 429", "quota", "too many requests") } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "quota" });
    expect(h.db.state.strikes).toBe(1);
    expect(opens(h)[0].reason).toBe("요청 제한(HTTP 429)");
    expect(stopped(h)).toHaveLength(1);
    expect(h.dart.listCalls.filter((c) => c.status === "HTTP 429")).toHaveLength(1);
  });

  it("HTTP 403 → 「접근 거부(HTTP 403)」 · 종료 1 dart_key", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: () => ({ error: new DartApiError(403, "HTTP 403", "key", "forbidden") }) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "dart_key" });
    expect(opens(h)[0].reason).toBe("접근 거부(HTTP 403)");
    expect(h.dart.listCalls).toHaveLength(1);
  });
});

describe("다시 연 장애 글의 사유 · 시작 시각이 처음 것과 같다 (리뷰 IN-01)", () => {
  it("notice pending 장애를 이어받아 다시 올리는 글은 DB 의 처음 사유를 쓴다(「수집기 중단」 아님)", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:30"),
      db: { lastOk: fresh("10:00:00"), outage: { since: iso("09:50:00"), reason: "하루 조회 한도 초과(020)", notice: "pending" } },
    });
    await h.run();
    expect(stopped(h)).toHaveLength(1);
    expect(stopped(h)[0].text).toBe(outageText(at("09:50:00"), "하루 조회 한도 초과(020)"));
    expect(stopped(h)[0].text).not.toContain("수집기 중단");
  });

  it("새로 여는 장애는 워커 기준점을 DB 에 넘긴다(p_since) — DB outage_since 와 글의 「HH:MM 부터」 가 같다", async () => {
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:06:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { reply: dartDown("23:00:00") },
    });
    await h.run();
    expect(opens(h)).toHaveLength(1);
    expect(opens(h)[0].since).toBe(iso("10:00:00"));
    expect(h.db.state.outage.since).toBe(iso("10:00:00"));
    expect(stopped(h)[0].text.startsWith(`${STOPPED} — 10:00 부터`)).toBe(true);
  });
});

describe("치명 종료 중 장애 글을 쓰다 임대를 잃으면 error 가 아니다 (리뷰 IN-04)", () => {
  it("020 치명 종료 → 장애 open 에서 55000(남이 넘겨받음) → warn · error dart outage open failed 0 · 종료 1 quota 그대로", async () => {
    const h = harness({
      start: at("10:00:00"),
      db: {
        lastOk: fresh("10:00:00"),
        before: (fn) => {
          if (fn === "dart_alert_outage") h.db.steal("other:1", at("10:30:00"));
        },
      },
      dart: { reply: (c) => (c.now >= at("10:00:20") ? { status: "020" } : undefined) },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "quota" });
    expect(h.logs.count("dart outage open failed")).toBe(0);
    expect(h.logs.count("dart outage open skipped — lease lost while posting", "warn")).toBe(1);
    expect(stopped(h)).toHaveLength(0);
    // 임대를 잃었으므로 해제하지 않는다(남의 임대)
    expect(h.db.state.lease.holder).toBe("other:1");
  });
});
