import { describe, expect, it } from "vitest";
import { RETRY_MAX_S, SEND_GAP_MS, SEND_WINDOW_MAX, SEND_WINDOW_MS, UNSENT_ERROR_MS } from "../src/collector";
import { LeaseLostError } from "../src/db";
import type { InsertItem } from "../src/lap";
import { LATE_LABEL, plainAlertText } from "../src/message";
import type { SendResult } from "../src/telegram/client";
import { ALL_WATCHES, dbRow, harness, holderChangeRow, itemOf, kst, marketActionRow, MON, rightsRow, tenderRow, type FakeDbRow } from "./helpers/fakes";

/**
 * Phase 43-06 T2 — 송신 견고함(SC-5 · D-02 · D-12 · 리서치 확인 7). 가짜 시계 · 가짜 DB(43-02 송신 기한 90초 ·
 * 같은 보유자 stale 재차례) · 가짜 텔레그램 결과 대본으로 재시도 간격 · 429 대기 · 방 이동 · 평문 재송신 · 토큰/방 오류 ·
 * 120초 미송신 · 1초 간격 · 분당 18건 · 공개매수 먼저 · 늦은 표시 · 기록/차례 RPC 실패 길을 단언한다.
 * 실제 텔레그램 · Supabase 호출 없음.
 */

const at = (hms: string) => kst(MON, hms);
const iso = (hms: string) => new Date(at(hms)).toISOString();
const fresh = (hms: string) => ({ tender_offer: iso(hms), rights_merger: iso(hms) });

const T = (n: number) => itemOf(tenderRow(n), "tender_offer");
const R = (n: number) => itemOf(rightsRow(n), "rights_merger");
/** 처음 본 시각 hms 에 pending 으로 들어온 행 */
const pend = (item: InsertItem, firstSeenHms: string, over: Partial<FakeDbRow> = {}): FakeDbRow =>
  dbRow(item, { first_seen_at: at(firstSeenHms), next_attempt_at: at(firstSeenHms), ...over });

const transient: SendResult = { kind: "transient", code: 502, description: "Bad Gateway" };

type H = ReturnType<typeof harness>;
const sendsOf = (h: H, rceptNo: string) => h.telegram.sent.filter((s) => s.text.includes(`rcpNo=${rceptNo}`) || s.text.includes(rceptNo));
const marksOf = (h: H, rceptNo: string) => h.db.calls.mark.filter((m) => m.rceptNo === rceptNo);

describe("재시도 · 대기 (SC-5)", () => {
  it("transient 3번 뒤 성공 → retryInS 5 · 10 · 20 · 네 번째 송신에 sent · warn 3번 · 한 바퀴에 같은 건 두 번 없음", async () => {
    const X = T(1);
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:00"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(X, "10:00:00")] },
      telegram: { reply: (c) => (c.n <= 3 ? transient : undefined) },
    });
    await h.run();

    expect(marksOf(h, X.rcept_no).map((m) => m.r.retryInS)).toEqual([5, 10, 20, 0]);
    expect(marksOf(h, X.rcept_no).map((m) => m.r.ok)).toEqual([false, false, false, true]);
    expect(h.db.statusOf(X.rcept_no)).toBe("sent");
    // 5초 바퀴 — 다음 시도 = 기록 시각 + retryInS 뒤 첫 바퀴: 10:00:00 + 5 → :05 · + 10 → :15 · + 20 → :35
    expect(h.telegram.sent.map((s) => s.at)).toEqual([at("10:00:00"), at("10:00:05"), at("10:00:15"), at("10:00:35")]);
    expect(h.logs.count("telegram send failed", "warn")).toBe(3);
    expect(h.logs.find("telegram send failed")?.obj).toMatchObject({ rceptNo: X.rcept_no, kind: "transient", code: 502, description: "Bad Gateway" });
  });

  it("429(retry_after 7) → retryInS 7 · 같은 차례 나머지 행은 보내지 않고 같은 retryInS 로 기록 · 7초 동안 send 0 · 그 뒤 재개", async () => {
    const [A, B, C] = [T(1), T(2), T(3)];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:30"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(A, "10:00:00"), pend(B, "10:00:00"), pend(C, "10:00:00")] },
      telegram: { reply: (c) => (c.n === 1 ? { kind: "rate", retryAfterS: 7 } : undefined) },
    });
    await h.run();

    const first = h.db.calls.mark.filter((m) => m.at === at("10:00:00"));
    expect(first.map((m) => [m.rceptNo, m.r.ok, m.r.retryInS])).toEqual([
      [A.rcept_no, false, 7],
      [B.rcept_no, false, 7],
      [C.rcept_no, false, 7],
    ]);
    const times = h.telegram.sent.map((s) => s.at);
    expect(times.filter((t) => t > at("10:00:00") && t < at("10:00:07"))).toHaveLength(0);
    expect(times).toEqual([at("10:00:00"), at("10:00:10"), at("10:00:11"), at("10:00:12")]);
    for (const r of [A, B, C]) expect(h.db.statusOf(r.rcept_no)).toBe("sent");
  });

  it("429 대기 중에는 장애 글도 기다린다(그 방 송신 전체 멈춤)", async () => {
    const A = T(1);
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:40"),
      // 기준점 09:55:05 — 10:00:10 바퀴에서 5분을 넘겨 장애가 열린다
      db: { lastOk: fresh("09:55:05"), rows: [pend(A, "10:00:00")] },
      dart: { reply: () => ({ status: "800" }) },
      telegram: { reply: (c) => (c.n === 1 ? { kind: "rate", retryAfterS: 15 } : undefined) },
    });
    await h.run();

    const notice = h.telegram.sent.find((s) => s.text.startsWith("⚠"));
    expect(notice).toBeDefined();
    expect(notice!.at).toBeGreaterThanOrEqual(at("10:00:15"));
    expect(h.telegram.sent.filter((s) => s.at > at("10:00:00") && s.at < at("10:00:15"))).toHaveLength(0);
    expect(h.db.calls.outage.find((c) => c.action === "open")?.at).toBe(at("10:00:10"));
  });

  it("텔레그램이 종일 실패 · 20:00 실행 끝 → 남은 건은 pending · 재시도 간격 최대 60초 · 미송신 error 는 1번", async () => {
    const X = T(1);
    const h = harness({
      start: at("19:50:00"),
      db: { lastOk: fresh("19:50:00"), rows: [pend(X, "19:50:00")] },
      telegram: { reply: () => transient },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "window_end" });
    expect(h.db.statusOf(X.rcept_no)).toBe("pending");
    const retries = marksOf(h, X.rcept_no).map((m) => m.r.retryInS);
    expect(Math.max(...retries)).toBe(RETRY_MAX_S);
    expect(retries.slice(-3)).toEqual([60, 60, 60]);
    expect(h.logs.count("alert unsent over 120s", "error")).toBe(1);
  });
});

describe("방 · 토큰 · 서식 오류 (리서치 확인 7)", () => {
  it("migrated → 같은 글을 새 방 id 로 즉시 1번 더 · switchChat 1번 · sent · error telegram chat migrated(끝 4자리만) · 그 뒤 새 id", async () => {
    const [X, Y] = [T(1), T(2)];
    const NEW = "-1009876543210";
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:20"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(X, "10:00:00"), pend(Y, "10:00:00")] },
      telegram: { chatId: "-100111", reply: (c) => (c.chatId === "-100111" ? { kind: "migrated", to: NEW } : undefined) },
    });
    await h.run();

    const [s1, s2, s3] = h.telegram.sent;
    expect(h.telegram.sent).toHaveLength(3);
    expect(s1.result.kind).toBe("migrated");
    expect(s2.text).toBe(s1.text);
    expect(s2.chatId).toBe(NEW);
    expect(s2.at).toBe(s1.at);
    expect(s3.chatId).toBe(NEW);
    expect(h.telegram.switches).toEqual([NEW]);
    expect(h.db.statusOf(X.rcept_no)).toBe("sent");
    expect(h.db.statusOf(Y.rcept_no)).toBe("sent");
    expect(h.logs.count("telegram chat migrated", "error")).toBe(1);
    expect(h.logs.find("telegram chat migrated")?.obj).toMatchObject({ newChatIdTail: "3210" });
    // 새 방 id 전체 · 앞자리는 로그 어디에도 없다
    expect(h.logs.text()).not.toContain("9876543210");
  });

  it("parse → plainAlertText 로 평문 1회 재송신 · sent · error 1번(서식 버그 신호)", async () => {
    const X = T(1);
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:20"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(X, "10:00:00")] },
      telegram: {
        reply: (c) => (c.plain ? undefined : { kind: "parse", code: 400, description: "Bad Request: can't parse entities: unexpected end tag" }),
      },
    });
    await h.run();

    expect(h.telegram.sent).toHaveLength(2);
    expect(h.telegram.sent[1].plain).toBe(true);
    expect(h.telegram.sent[1].text).toBe(plainAlertText({ ...X, late: false }, { alwaysShowFiler: true }));
    expect(h.db.statusOf(X.rcept_no)).toBe("sent");
    expect(h.logs.lines.filter((l) => l.level === "error")).toHaveLength(1);
  });

  it("token(401) → retryInS 60 · error telegram token invalid 는 실행당 1번", async () => {
    const [X, Y] = [T(1), T(2)];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:50"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(X, "10:00:00"), pend(Y, "10:00:00")] },
      telegram: { reply: () => ({ kind: "token", code: 401, description: "Unauthorized" }) },
    });
    await h.run();

    expect(h.telegram.sent.length).toBeGreaterThanOrEqual(4);
    expect(h.db.calls.mark.every((m) => !m.r.ok && m.r.retryInS === 60)).toBe(true);
    expect(h.logs.count("telegram token invalid", "error")).toBe(1);
    expect(h.db.statusOf(X.rcept_no)).toBe("pending");
  });

  it("chat(403 · 400 chat not found) → retryInS 60 · error telegram chat unavailable 는 실행당 1번", async () => {
    const [X, Y] = [T(1), T(2)];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:01:50"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(X, "10:00:00"), pend(Y, "10:00:00")] },
      telegram: {
        reply: (c) =>
          c.n % 2 === 1
            ? { kind: "chat", code: 403, description: "Forbidden: bot was kicked from the group chat" }
            : { kind: "chat", code: 400, description: "Bad Request: chat not found" },
      },
    });
    await h.run();

    expect(h.telegram.sent.length).toBeGreaterThanOrEqual(4);
    expect(h.db.calls.mark.every((m) => !m.r.ok && m.r.retryInS === 60)).toBe(true);
    expect(h.logs.count("telegram chat unavailable", "error")).toBe(1);
  });

  it("처음 본 뒤 120초 넘게 못 나간 건 → error alert unsent over 120s 접수번호마다 1번", async () => {
    expect(UNSENT_ERROR_MS).toBe(120_000);
    const [X, Y] = [T(1), R(2)];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:05:00"),
      db: { lastOk: fresh("10:00:00"), rows: [pend(X, "10:00:00"), pend(Y, "10:00:30")] },
      telegram: { reply: () => transient },
    });
    await h.run();

    const unsent = h.logs.lines.filter((l) => l.msg === "alert unsent over 120s");
    expect(unsent).toHaveLength(2);
    expect(unsent.every((l) => l.level === "error")).toBe(true);
    expect(unsent.map((l) => l.obj.rceptNo)).toEqual([X.rcept_no, Y.rcept_no]);
    expect(unsent[0].obj).toMatchObject({ attempts: expect.any(Number) });
  });
});

describe("첫 줄 제출인 — 거래소 시장조치는 붙이지 않음 · 최대주주 변동은 회사와 다를 때만 (D-07 · 261113-rn7)", () => {
  it("market_action(제출인 코스닥시장본부) → 제출인 없음 · largest_holder_change 제출인 = 회사 → 없음 · 다르면 붙음", async () => {
    const MA = itemOf(marketActionRow(1), "market_action");
    const H1 = itemOf(holderChangeRow(1), "largest_holder_change");
    const H2 = itemOf(holderChangeRow(2, MON, { flr_nm: "최대주주홀딩스" }), "largest_holder_change");
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:10"),
      watches: ALL_WATCHES,
      db: {
        lastOk: Object.fromEntries(ALL_WATCHES.map((w) => [w.id, iso("10:00:00")])),
        rows: [pend(MA, "09:59:59"), pend(H1, "09:59:59"), pend(H2, "09:59:59")],
      },
    });
    await h.run();
    const first = (r: InsertItem) => sendsOf(h, r.rcept_no)[0]?.text.split("\n")[0];
    expect(first(MA)).toBe("📢 주권매매거래정지 (주식의 병합, 분할 등 전자등록 변경, 말소) — 조치회사1(500001)");
    expect(first(H1)).toBe("📢 최대주주등소유주식변동신고서 — 지분회사1(600001)");
    expect(first(H2)).toBe("📢 최대주주등소유주식변동신고서 — 지분회사2(600002) · 제출인 최대주주홀딩스");
    // 송신 순서 = 우선순위(시장조치 2 → 최대주주 변동 4)
    expect(h.telegram.alerts().map((a) => /rcpNo=(\d+)/.exec(a.text)![1])).toEqual([MA.rcept_no, H1.rcept_no, H2.rcept_no]);
  });
});

describe("송신 속도 · 순서 · 늦은 표시 (D-02 · D-12)", () => {
  it("한 바퀴에 30건 pending → 간격 ≥ 1초 · 어느 60초에도 18건 이하 · 처음 60초 18건 · 공개매수 전부 먼저 그다음 처음 본 순", async () => {
    expect([SEND_GAP_MS, SEND_WINDOW_MAX, SEND_WINDOW_MS]).toEqual([1_000, 18, 60_000]);
    const tenders = Array.from({ length: 10 }, (_, i) => pend(T(i + 1), `09:59:${String(30 + i).padStart(2, "0")}`));
    const rights = Array.from({ length: 20 }, (_, i) => pend(R(i + 1), `09:59:${String(i).padStart(2, "0")}`));
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:03:00"),
      db: { lastOk: fresh("10:00:00"), rows: [...rights, ...tenders] },
    });
    await h.run();

    const sent = h.telegram.sent;
    expect(sent).toHaveLength(30);
    const times = sent.map((s) => s.at);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1_000);
    for (const t0 of times) expect(times.filter((t) => t >= t0 && t < t0 + 60_000).length).toBeLessThanOrEqual(18);
    expect(times.filter((t) => t < at("10:01:00"))).toHaveLength(18);
    const order = sent.map((s) => /rcpNo=(\d+)/.exec(s.text)![1]);
    expect(order).toEqual([...tenders, ...rights].map((r) => r.rcept_no));
  });

  it("처음 본 뒤 75초 만에 나가는 건은 「(늦은 알림)」 · 행의 late 가 이미 true 면 한 번만 · 30초면 붙지 않음", async () => {
    const [L1, L2, N] = [T(1), T(2), T(3)];
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:00:20"),
      db: {
        lastOk: fresh("10:00:00"),
        rows: [
          pend(L1, "09:58:45", { attempts: 2, next_attempt_at: at("10:00:00") }),
          pend({ ...L2, late: true }, "09:58:50", { next_attempt_at: at("10:00:00") }),
          pend(N, "09:59:30", { next_attempt_at: at("10:00:00") }),
        ],
      },
    });
    await h.run();

    const text = (r: InsertItem) => sendsOf(h, r.rcept_no)[0]?.text ?? "";
    expect(text(L1).split("\n")[0]).toContain(LATE_LABEL);
    expect(text(L2).split(LATE_LABEL)).toHaveLength(2);
    expect(text(N)).not.toContain(LATE_LABEL);
  });
});

describe("우리 송신 속도 제한으로만 밀린 건은 늦은 알림이 아니다 (리뷰 IN-03)", () => {
  it("한 바퀴에 새 건 25건 — 60초 18건 상한으로 1분 넘게 기다린 건도 「(늦은 알림)」 없음 · 앞 실행이 남긴 건은 그대로 늦음", async () => {
    const feed = Array.from({ length: 25 }, (_, i) => ({ watch: "rights_merger" as const, from: at("10:00:00"), row: rightsRow(i + 1) }));
    const leftover = pend(T(1), "09:58:30", { next_attempt_at: at("10:00:00") });
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:03:00"),
      db: { lastOk: fresh("10:00:00"), rows: [leftover] },
      dart: { feed },
    });
    await h.run();

    const alerts = h.telegram.alerts();
    expect(alerts).toHaveLength(26);
    const fresh25 = alerts.filter((s) => !s.text.includes(leftover.rcept_no));
    // 뒤쪽 건은 처음 본 뒤 60초를 넘겨 나갔다 — 그래도 늦음 표시 없음
    expect(Math.max(...fresh25.map((s) => s.at)) - at("10:00:00")).toBeGreaterThan(60_000);
    for (const s of fresh25) expect(s.text).not.toContain(LATE_LABEL);
    expect(sendsOf(h, leftover.rcept_no)[0].text).toContain(LATE_LABEL);
  });

  it("이 실행이 넣은 건이라도 송신이 한 번 실패한 뒤 60초 넘어 나가면 「(늦은 알림)」", async () => {
    let n = 0;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:03:00"),
      db: { lastOk: fresh("10:00:00") },
      dart: { feed: [{ watch: "tender_offer", from: at("10:00:00"), row: tenderRow(1) }] },
      telegram: { reply: (c) => (c.text.startsWith("📢") && ++n <= 4 ? transient : undefined) },
    });
    await h.run();
    const sends = sendsOf(h, T(1).rcept_no);
    const ok = sends.find((s) => s.result.kind === "ok")!;
    expect(ok.at - at("10:00:00")).toBeGreaterThan(60_000);
    expect(ok.text).toContain(LATE_LABEL);
    expect(sends[0].text).not.toContain(LATE_LABEL);
  });
});

describe("기록 · 차례 RPC 실패 길 (체커 W2 · SC-5 무로그 실패 없음)", () => {
  it("mark 실패 건은 error 로그 뒤 90초 안에 다시 차례로 나온다", async () => {
    const [X, Y] = [T(1), T(2)];
    let thrown = false;
    let statusAt1001: string | undefined;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:02:00"),
      db: {
        lastOk: fresh("10:00:00"),
        rows: [pend(X, "10:00:00"), pend(Y, "10:00:00")],
        before: (fn, _now, info) => {
          if (fn === "dart_alert_mark" && info?.rceptNo === X.rcept_no && !thrown) {
            thrown = true;
            throw new Error("dart_alert_mark 실패: connection reset");
          }
        },
      },
      dart: {
        reply: (c) => {
          if (c.now === at("10:01:00") && c.watch.id === "tender_offer") statusAt1001 = h.db.statusOf(X.rcept_no);
          return undefined;
        },
      },
    });
    await h.run();

    expect(h.logs.count("alert mark failed", "error")).toBe(1);
    expect(h.logs.find("alert mark failed")?.obj).toMatchObject({ rceptNo: X.rcept_no, result: "ok" });
    // 같은 바퀴 다음 건(Y)은 계속 보냈다
    expect(sendsOf(h, Y.rcept_no).map((s) => s.at)).toEqual([at("10:00:01")]);
    expect(h.db.statusOf(Y.rcept_no)).toBe("sent");
    // X 는 기한 전(10:01:00)까지 sending 으로 남고 보내지 않는다
    expect(statusAt1001).toBe("sending");
    const xs = sendsOf(h, X.rcept_no).map((s) => s.at);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBe(at("10:00:00"));
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(90_000);
    expect(xs[1] - xs[0]).toBeLessThanOrEqual(100_000);
    expect(h.logs.count("possible duplicate after stale claim", "warn")).toBe(1);
    expect(h.logs.find("possible duplicate after stale claim")?.obj).toMatchObject({ rceptNo: X.rcept_no });
    expect(h.db.statusOf(X.rcept_no)).toBe("sent");
  });

  it("claim 응답이 끊겨도 90초 뒤 다시 차례로 나온다", async () => {
    const Z = T(1);
    let thrown = false;
    const h = harness({
      start: at("10:00:00"),
      abortAt: at("10:02:00"),
      db: {
        lastOk: fresh("10:00:00"),
        rows: [pend(Z, "10:00:00")],
        after: (fn) => {
          if (fn === "dart_alert_claim" && !thrown) {
            thrown = true;
            throw new Error("dart_alert_claim 실패: fetch failed");
          }
        },
      },
    });
    await h.run();

    expect(h.logs.count("alert claim failed", "warn")).toBe(1);
    const zs = sendsOf(h, Z.rcept_no).map((s) => s.at);
    expect(zs).toHaveLength(1);
    expect(zs[0] - at("10:00:00")).toBeGreaterThanOrEqual(90_000);
    expect(zs[0] - at("10:00:00")).toBeLessThanOrEqual(100_000);
    expect(h.db.statusOf(Z.rcept_no)).toBe("sent");
  });

  it("LeaseLostError 는 mark · claim 에서 나와도 삼키지 않는다 — 종료 0 lease_lost", async () => {
    const X = T(1);
    for (const fnName of ["dart_alert_mark", "dart_alert_claim"]) {
      const h = harness({
        start: at("10:00:00"),
        abortAt: at("10:01:00"),
        db: {
          lastOk: fresh("10:00:00"),
          rows: [pend(X, "10:00:00")],
          before: (fn) => {
            if (fn === fnName) throw new LeaseLostError(fn);
          },
        },
      });
      expect(await h.run()).toEqual({ code: 0, reason: "lease_lost" });
      expect(h.logs.count("alert mark failed")).toBe(0);
      expect(h.logs.count("alert claim failed")).toBe(0);
    }
  });
});
