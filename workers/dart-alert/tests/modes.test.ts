import { Writable } from "node:stream";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps, CollectorExit } from "../src/collector";
import type { DartAlertConfig } from "../src/config";
import { buildDeps, crashLine, main } from "../src/index";
import { LATE_LABEL, testSendText } from "../src/message";
import {
  ALL_WATCHES,
  dbRow,
  exchangeRow,
  harness,
  holderChangeRow,
  kst,
  logRecorder,
  marketActionRow,
  MON,
  rightsRow,
  SAT,
  tenderRow,
  type FeedItem,
  type FakeDbRow,
} from "./helpers/fakes";

/**
 * Phase 43-05 T2 — 모드(probe · seed · test-send · auto 창 밖)와 Cloud Run Job 진입점(`main` · `buildDeps`).
 * 배포 · 스모크(43-07 `probe ok`) · 첫 배포 날(seed → auto 이어 감) · 개인 대화 시험(D-15 test-send)의 계약.
 * 실제 OpenDART · Supabase · 텔레그램 호출 없음 — 진입점 결선은 가짜 axios 전송으로만 확인한다.
 * 261113-rn7: probe 모드는 키 2(거래소 수시공시 1쪽 · 키 2 카운터) · 진입점은 OpenDART 키 2개 · seed 는 직전 평일도 채운다.
 */

const at = (hms: string) => kst(MON, hms);
const iso = (hms: string) => new Date(at(hms)).toISOString();
const tender = (n: number, fromHms: string): FeedItem => ({ watch: "tender_offer", from: at(fromHms), row: tenderRow(n) });
const rights = (n: number, fromHms: string): FeedItem => ({ watch: "rights_merger", from: at(fromHms), row: rightsRow(n) });
const FRI = "2026-11-13";
const FRI_YMD = "20261113";
/** 금요일(직전 평일) 날짜 조회에만 보이는 행 */
const fri = (watch: FeedItem["watch"], row: FeedItem["row"]): FeedItem => ({ watch, from: kst(FRI, "09:00:00"), row, day: FRI_YMD });

describe("probe 모드 (43-07 스모크 계약)", () => {
  it("임대 없이(남이 쥐고 있어도) 키 2 로 1쪽 1회 · 넣기 0 · 송신 0 · 키 2 usage.add(1) · probe ok(total) · 종료 0", async () => {
    const h = harness({
      start: at("10:00:00"),
      mode: "probe",
      db: { lease: { holder: "other:1", until: at("10:01:00") } },
      dart: { probe: () => ({ status: "000", total: 3 }) },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "probe" });
    expect(h.dart.probeCalls).toHaveLength(1);
    expect(h.dart.probeCalls[0].day).toBe("20261116");
    expect(h.dart.probeCalls[0].key).toBe(2);
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.db.calls.leaseAcquire).toHaveLength(0);
    expect(h.db.calls.insert).toHaveLength(0);
    expect(h.telegram.sent).toHaveLength(0);
    expect(h.db.calls.usageAdd.map((c) => ({ n: c.n, key: c.key }))).toEqual([{ n: 1, key: 2 }]);
    expect(h.db.state.used2).toBe(1);
    expect(h.db.state.used).toBe(0);
    expect(h.logs.count("probe ok", "info")).toBe(1);
    expect(h.logs.find("probe ok")?.obj).toMatchObject({ total: 3 });
    expect(h.db.state.lease.holder).toBe("other:1");
  });

  it("키 2 예산이 찼으면(used2 15,000) 종료 0 budget_at_start · 키 1 이 찬 것(used 15,000)은 probe 를 막지 않는다", async () => {
    const full2 = harness({ start: at("10:00:00"), mode: "probe", db: { used2: 15_000 } });
    expect(await full2.run()).toEqual({ code: 0, reason: "budget_at_start" });
    expect(full2.dart.probeCalls).toHaveLength(0);
    const full1 = harness({ start: at("10:00:00"), mode: "probe", db: { used: 15_000 } });
    expect(await full1.run()).toEqual({ code: 0, reason: "probe" });
    expect(full1.dart.probeCalls.map((c) => c.key)).toEqual([2]);
  });

  it("키 2 탐침이 020 이면 키 2 한도 의심 표시(strikes2 1 · 키 1 그대로) · 종료 1 probe_failed", async () => {
    const h = harness({ start: at("10:00:00"), mode: "probe", dart: { probe: () => ({ status: "020" }) } });
    expect(await h.run()).toEqual({ code: 1, reason: "probe_failed" });
    expect(h.db.state.strikes2).toBe(1);
    expect(h.db.state.strikes).toBe(0);
  });

  it("주말 · 창 밖에도 probe 는 1회 부른다", async () => {
    const h = harness({ start: kst(SAT, "23:00:00"), mode: "probe" });
    expect(await h.run()).toEqual({ code: 0, reason: "probe" });
    expect(h.dart.probeCalls).toHaveLength(1);
  });

  it("DART 실패면 error(안전 필드) · 종료 1 probe_failed", async () => {
    const h = harness({ start: at("10:00:00"), mode: "probe", dart: { probe: () => ({ status: "800" }) } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "probe_failed" });
    const err = h.logs.lines.find((l) => l.level === "error");
    expect(err?.obj).toMatchObject({ err: { code: "800", kind: "transient" } });
    expect(h.db.usageAdded()).toBe(1);
  });
});

describe("seed 모드 (첫 배포 날 · Pitfall 8 · 체커 W1 · I5)", () => {
  it("seed 뒤 같은 실행이 auto 로 이어 가고 새 건은 늦은 알림이 아니다", async () => {
    const h = harness({
      start: at("14:00:00"),
      mode: "seed",
      dart: { feed: [tender(1, "09:10:00"), tender(2, "11:20:00"), rights(3, "13:00:00"), tender(4, "14:00:05")] },
    });
    const exit = await h.run();

    expect(exit).toEqual({ code: 0, reason: "window_end" });
    // seed 바퀴 — 그날 이미 있던 3건을 seeded 로 · 그 바퀴 송신 0
    const first = h.db.calls.insert[0];
    expect(first.seed).toBe(true);
    expect(first.items.map((i) => i.rcept_no).sort()).toEqual([tenderRow(1).rcept_no, tenderRow(2).rcept_no, rightsRow(3).rcept_no].sort());
    expect(h.logs.count("seed done", "info")).toBe(1);
    expect(h.logs.find("seed done")?.obj).toMatchObject({ inserted: 3 });
    // seed 바퀴의 감시 대상별 성공 시각이 곧바로 DB last_ok 로(임대 연장 RPC 의 p_last_ok)
    // + seed 가 한 직전 평일 확인 표시(prevday:<id> = 오늘 KST 날짜)
    const persisted = h.db.calls.leaseAcquire.find((c) => c.lastOk !== undefined)!;
    expect(persisted.at).toBe(at("14:00:00"));
    expect(persisted.lastOk).toEqual({
      tender_offer: iso("14:00:00"),
      rights_merger: iso("14:00:00"),
      "prevday:tender_offer": MON,
      "prevday:rights_merger": MON,
    });
    // 같은 실행이 한 바퀴(5초) 뒤 auto 바퀴 — 새 건 1건만 · 늦은 알림 아님
    // (seed 바퀴의 둘째 D004 호출은 금요일 날짜 조회라 오늘 날짜 조회만 본다)
    expect(h.dart.callsOf("tender_offer").filter((c) => c.day === "20261116")[1].at).toBe(at("14:00:05"));
    expect(h.telegram.sent).toHaveLength(1);
    const sent = h.telegram.texts();
    expect(sent[0]).toContain("대상회사4");
    expect(sent[0]).not.toContain(LATE_LABEL);
    expect(h.telegram.sent[0].at).toBe(at("14:00:05"));
    expect(h.db.calls.insert.slice(1).every((c) => c.seed === false)).toBe(true);
    // seed 된 3건은 끝까지 보내지 않는다
    for (const r of [tenderRow(1), tenderRow(2), rightsRow(3)]) expect(h.db.statusOf(r.rcept_no)).toBe("seeded");
    expect(h.db.statusOf(tenderRow(4).rcept_no)).toBe("sent");
  });

  it("seed 바퀴에서 B001 조회가 800 이면 넣기 0 · 송신 0 · 종료 1 seed_failed · auto 로 넘어가지 않음", async () => {
    const h = harness({
      start: at("14:00:00"),
      mode: "seed",
      dart: {
        feed: [tender(1, "09:10:00")],
        reply: (c) => (c.watch.id === "rights_merger" ? { status: "800" } : undefined),
      },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "seed_failed" });
    expect(h.db.calls.insert).toHaveLength(0);
    expect(h.db.calls.claim).toHaveLength(0);
    expect(h.telegram.sent).toHaveLength(0);
    // D004 오늘 → D004 금요일(seed 는 직전 평일도) → B001 오늘 800(실패라 전날 조회 없음) = 3
    expect(h.dart.listCalls.map((c) => [c.watch, c.day])).toEqual([
      ["tender_offer", "20261116"],
      ["tender_offer", FRI_YMD],
      ["rights_merger", "20261116"],
    ]);
    expect(h.logs.count("seed done")).toBe(0);
    const err = h.logs.lines.find((l) => l.level === "error");
    expect(JSON.stringify(err?.obj)).toContain("800");
    expect(h.db.calls.leaseRelease).toHaveLength(1);
  });

  it("창 밖 seed 는 seed 바퀴 한 번 뒤 window_end 로 끝나고 보내지 않는다", async () => {
    const h = harness({ start: at("21:00:00"), mode: "seed", dart: { feed: [tender(1, "09:10:00"), rights(2, "10:30:00")] } });
    const exit = await h.run();
    const dartCalls = h.dart.listCalls;
    const sent = h.telegram.sent;

    expect(exit).toEqual({ code: 0, reason: "window_end" });
    expect(sent).toHaveLength(0);
    // 감시 대상마다 오늘 + 직전 평일(금) = 2 × 2
    expect(dartCalls).toHaveLength(4);
    expect(h.dart.callsOf("tender_offer").map((c) => c.day)).toEqual(["20261116", FRI_YMD]);
    expect(h.dart.callsOf("rights_merger").map((c) => c.day)).toEqual(["20261116", FRI_YMD]);
    expect(h.db.calls.insert).toHaveLength(1);
    expect(h.db.calls.insert[0]).toMatchObject({ seed: true, inserted: 2 });
    expect(h.logs.count("seed done")).toBe(1);
    expect(h.db.calls.claim).toHaveLength(0);
    expect(h.db.calls.leaseRelease).toHaveLength(1);
  });

  it("seed 월 14:00(여섯 감시 대상) — 감시 대상마다 오늘 + 금요일 조회 · 금요일 통과 건도 seeded(rcept_dt 오늘) · 송신 0 · 표시 여섯 · 이어 가는 auto 는 금요일 조회 없음", async () => {
    const h = harness({
      start: at("14:00:00"),
      abortAt: at("14:01:00"),
      mode: "seed",
      watches: ALL_WATCHES,
      prevDayDone: false,
      dart: {
        feed: [
          tender(1, "09:10:00"),
          fri("exchange_disclosure", exchangeRow(9, FRI)),
          fri("market_action", marketActionRow(9, FRI)),
          fri("market_action", marketActionRow(8, FRI, { report_nm: "기타시장안내              (상장적격성 실질심사 관련 안내)" })),
          fri("largest_holder_change", holderChangeRow(9, FRI)),
        ],
      },
    });
    expect(await h.run()).toEqual({ code: 0, reason: "aborted" });

    // seed 바퀴(14:00:00) — 감시 대상마다 오늘 조회 바로 뒤 금요일 전 쪽 조회 1번
    const seedCalls = h.dart.listCalls.filter((c) => c.at === at("14:00:00"));
    expect(seedCalls.map((c) => [c.watch, c.day, c.fullRead])).toEqual(
      ALL_WATCHES.flatMap((w) => [
        [w.id, "20261116", false],
        [w.id, FRI_YMD, true],
      ]),
    );
    const first = h.db.calls.insert[0];
    expect(first.seed).toBe(true);
    expect(first.items.map((i) => [i.rcept_no, i.rcept_dt])).toEqual([
      [tenderRow(1).rcept_no, MON],
      [marketActionRow(9, FRI).rcept_no, MON],
      [exchangeRow(9, FRI).rcept_no, MON],
      [holderChangeRow(9, FRI).rcept_no, MON],
    ]);
    for (const i of first.items) expect(h.db.statusOf(i.rcept_no)).toBe("seeded");
    expect(h.telegram.sent).toHaveLength(0);
    // 영속 lastOk 에 전날 확인 표시 여섯
    const persisted = h.db.calls.leaseAcquire.find((c) => c.lastOk !== undefined)!;
    expect(Object.entries(persisted.lastOk!).filter(([k]) => k.startsWith("prevday:"))).toEqual(
      ALL_WATCHES.map((w) => [`prevday:${w.id}`, MON]),
    );
    // 이어 가는 auto(14:00:05 ~ 14:00:55) — 금요일 조회 더 없음
    expect(h.dart.listCalls.filter((c) => c.at > at("14:00:00") && c.day === FRI_YMD)).toHaveLength(0);
    expect(h.dart.callsOf("tender_offer").length).toBeGreaterThan(10);
  });

  it("seed 에서 금요일 조회 하나(I004)가 실패하면 넣기 0 · 종료 1 seed_failed", async () => {
    const h = harness({
      start: at("14:00:00"),
      mode: "seed",
      watches: ALL_WATCHES,
      prevDayDone: false,
      dart: {
        feed: [tender(1, "09:10:00")],
        reply: (c) => (c.watch.id === "largest_holder_change" && c.day === FRI_YMD ? { status: "800" } : undefined),
      },
    });
    expect(await h.run()).toEqual({ code: 1, reason: "seed_failed" });
    expect(h.db.calls.insert).toHaveLength(0);
    expect(h.telegram.sent).toHaveLength(0);
    expect(h.logs.count("dart prev-day list failed", "warn")).toBe(1);
    expect(h.logs.find("seed failed — nothing inserted, not continuing to auto")?.obj).toMatchObject({
      failed: [{ watch: "largest_holder_change", prevOk: false }],
    });
  });

  it("함정 A 끝에서 끝 — 월 21:00 seed(창 밖) → 그 DB 를 옮겨 화 07:00 auto(표시 없음) → 월요일 날짜 조회 감시 대상마다 1번 · 새 알림 0", async () => {
    const monRows: FeedItem[] = [
      tender(1, "09:10:00"),
      { watch: "exchange_disclosure", from: at("15:00:00"), row: exchangeRow(1) },
      { watch: "market_action", from: at("16:00:00"), row: marketActionRow(1) },
      { watch: "largest_holder_change", from: at("17:00:00"), row: holderChangeRow(1) },
    ];
    const seed = harness({ start: at("21:00:00"), mode: "seed", watches: ALL_WATCHES, prevDayDone: false, dart: { feed: monRows } });
    expect(await seed.run()).toEqual({ code: 0, reason: "window_end" });
    expect(seed.db.calls.insert[0]).toMatchObject({ seed: true, inserted: 4 });

    const TUE = "2026-11-17";
    const tue = harness({
      start: kst(TUE, "07:00:00"),
      abortAt: kst(TUE, "07:00:30"),
      watches: ALL_WATCHES,
      prevDayDone: false,
      db: {
        rows: [...seed.db.rows.values()].map((r): FakeDbRow => ({ ...r })),
        lastOk: { ...seed.db.state.lastOk },
      },
      // 화요일에 보는 월요일 목록 — 월요일 날짜 조회에만 보인다
      dart: { feed: monRows.map((f) => ({ ...f, day: "20261116" })) },
    });
    expect(await tue.run()).toEqual({ code: 0, reason: "aborted" });
    const monCalls = tue.dart.listCalls.filter((c) => c.day === "20261116");
    expect(monCalls.map((c) => c.watch)).toEqual(ALL_WATCHES.map((w) => w.id));
    expect(monCalls.every((c) => c.fullRead && c.at === kst(TUE, "07:00:00"))).toBe(true);
    expect(tue.telegram.alerts()).toHaveLength(0);
    expect(tue.db.calls.insert.flatMap((c) => c.items)).toHaveLength(4);
    expect(tue.db.calls.insert.reduce((n, c) => n + c.inserted, 0)).toBe(0);
  });

  it("다른 실행이 임대를 쥐고 있으면 seed 도 종료 0 lease_held · 호출 0", async () => {
    const h = harness({ start: at("14:00:00"), mode: "seed", db: { lease: { holder: "other:1", until: at("14:01:00") } } });
    expect(await h.run()).toEqual({ code: 0, reason: "lease_held" });
    expect(h.dart.listCalls).toHaveLength(0);
  });
});

describe("test-send 모드 (D-15 개인 대화 시험)", () => {
  it("OpenDART · 임대 없이 시험 글 1건 → test-send ok(messageId) · 종료 0", async () => {
    const h = harness({ start: at("10:00:00"), mode: "test-send", telegram: { reply: () => ({ kind: "ok", messageId: 77 }) } });
    const exit = await h.run();
    expect(exit).toEqual({ code: 0, reason: "test_send" });
    expect(h.telegram.texts()).toEqual([testSendText(at("10:00:00"))]);
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.dart.probeCalls).toHaveLength(0);
    expect(h.db.calls.leaseAcquire).toHaveLength(0);
    expect(h.logs.find("test-send ok")?.obj).toMatchObject({ messageId: 77 });
  });

  it("실패면 error(kind · code · description) · 종료 1 test_send_failed", async () => {
    const h = harness({
      start: kst(SAT, "11:00:00"),
      mode: "test-send",
      telegram: { reply: () => ({ kind: "chat", code: 403, description: "Forbidden: bot can't initiate conversation with a user" }) },
    });
    const exit = await h.run();
    expect(exit).toEqual({ code: 1, reason: "test_send_failed" });
    expect(h.logs.find("test-send failed")?.obj).toMatchObject({ kind: "chat", code: 403, description: expect.stringContaining("Forbidden") });
    expect(h.logs.lines.find((l) => l.msg === "test-send failed")?.level).toBe("error");
  });
});

describe("auto 창 밖 (D-11)", () => {
  it("주말 auto → DART 0 · 임대 0 · 종료 0 outside_window", async () => {
    const h = harness({ start: kst(SAT, "10:00:00"), mode: "auto" });
    expect(await h.run()).toEqual({ code: 0, reason: "outside_window" });
    expect(h.dart.listCalls).toHaveLength(0);
    expect(h.db.calls.leaseAcquire).toHaveLength(0);
  });

  it("평일 20:00 뒤 auto → 종료 0 outside_window", async () => {
    const h = harness({ start: at("20:00:00"), mode: "auto" });
    expect(await h.run()).toEqual({ code: 0, reason: "outside_window" });
    expect(h.dart.listCalls).toHaveLength(0);
  });
});

// ── 진입점 ────────────────────────────────────────────────────────────
const SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: "SECRET-SERVICE-ROLE-DO-NOT-LOG",
  OPENDART_API_KEY: "SECRET-DART-KEY-DO-NOT-LOG",
  OPENDART_API_KEY_2: "SECRET-DART-KEY2-DO-NOT-LOG",
  TELEGRAM_BOT_TOKEN: "123456:SECRET-BOT-TOKEN-DO-NOT-LOG",
  TELEGRAM_CHAT_ID: "-1009876543210",
};
const ENV_KEYS = [
  "SUPABASE_URL",
  ...Object.keys(SECRETS),
  "DART_ALERT_MODE",
  "DART_ALERT_DAILY_BUDGET",
  "DART_ALERT_B001_KINDS",
  "DART_ALERT_B001_CORRECTIONS",
  "DART_BASE_URL",
  "TELEGRAM_BASE_URL",
  "CLOUD_RUN_EXECUTION",
  "LOG_LEVEL",
  "APP_VERSION",
];

function capture() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return { stream, text: () => chunks.join(""), lines: () => chunks.join("").split("\n").filter(Boolean).map((l) => JSON.parse(l)) };
}

describe("진입점 main() · buildDeps()", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("필수 env 가 없으면 error 로그에 env 이름만 · 반환 1 · 수집기를 부르지 않는다", async () => {
    Object.assign(process.env, SECRETS); // SUPABASE_URL 만 빠짐
    const out = capture();
    let ran = 0;
    const code = await main({
      logDestination: out.stream,
      run: async () => {
        ran += 1;
        return { code: 0, reason: "x" };
      },
    });
    expect(code).toBe(1);
    expect(ran).toBe(0);
    const text = out.text();
    expect(text).toContain("SUPABASE_URL");
    expect(text).toContain("dart-alert config error");
    for (const v of Object.values(SECRETS)) expect(text).not.toContain(v);
    expect(out.lines()[0].level).toBe(50);
  });

  it("정상 결선이면 runCollector 의 code 를 돌려준다 · 시작 로그에 비밀 없음 · 신호 처리기를 남기지 않는다", async () => {
    Object.assign(process.env, SECRETS, { SUPABASE_URL: "http://127.0.0.1:1", DART_ALERT_MODE: "probe", DART_ALERT_DAILY_BUDGET: "12000" });
    const before = process.listenerCount("SIGTERM");
    const seen: CollectorDeps[] = [];
    const out = capture();
    const run = (code: 0 | 1) => async (deps: CollectorDeps): Promise<CollectorExit> => {
      seen.push(deps);
      return { code, reason: "fake" };
    };
    expect(await main({ logDestination: out.stream, run: run(1) })).toBe(1);
    expect(await main({ logDestination: out.stream, run: run(0) })).toBe(0);
    expect(process.listenerCount("SIGTERM")).toBe(before);

    expect(seen[0].cfg).toEqual({ dailyBudget: 12_000, mode: "probe" });
    expect(seen[0].watches.map((w) => w.id)).toEqual([
      "tender_offer",
      "rights_merger",
      "market_action",
      "exchange_disclosure",
      "largest_holder_change",
      "insider_trade_plan",
    ]);
    const start = out.lines().find((l) => l.msg === "dart-alert start");
    expect(start).toMatchObject({ mode: "probe", budget: 12_000, watches: 6, holder: seen[0].holder });
    const text = out.text();
    for (const v of Object.values(SECRETS)) expect(text).not.toContain(v);
  });

  it("LOG_LEVEL 이 pino 가 모르는 값이면 기본 로거로 error(level 50) · 반환 1 · 수집기를 부르지 않는다(리뷰 IN-02)", async () => {
    Object.assign(process.env, SECRETS, { SUPABASE_URL: "http://127.0.0.1:1", LOG_LEVEL: "verbose" });
    const out = capture();
    let ran = 0;
    const code = await main({
      logDestination: out.stream,
      run: async () => {
        ran += 1;
        return { code: 0, reason: "x" };
      },
    });
    expect(code).toBe(1);
    expect(ran).toBe(0);
    const line = out.lines().find((l) => l.msg === "dart-alert logger setup failed");
    expect(line).toMatchObject({ level: 50, logLevel: "verbose" });
    for (const v of Object.values(SECRETS)) expect(out.text()).not.toContain(v);
  });

  it("crashLine — main 이 reject 해도 level 60 JSON 한 줄(안전 필드만 · 키 · 토큰 없음)", () => {
    const e = new Error(`boom ${"x".repeat(500)}`);
    const parsed = JSON.parse(crashLine(e, 1_700_000_000_000));
    expect(parsed).toMatchObject({ level: 60, time: 1_700_000_000_000, msg: "dart-alert crashed", err: { kind: "unknown" } });
    expect(parsed.err.message.length).toBeLessThanOrEqual(200);
    expect(Object.keys(parsed.err).sort()).toEqual(["code", "kind", "message", "status"]);
  });

  it("main 이 수집기 예외를 받으면 안전 필드만 로그 · 반환 1", async () => {
    Object.assign(process.env, SECRETS, { SUPABASE_URL: "http://127.0.0.1:1" });
    const out = capture();
    const code = await main({
      logDestination: out.stream,
      run: async () => {
        throw new Error("boom");
      },
    });
    expect(code).toBe(1);
    const failed = out.lines().find((l) => l.msg === "dart-alert failed");
    expect(failed).toMatchObject({ level: 50, err: { message: "boom", kind: "unknown" } });
  });

  it("buildDeps — holder · 감시 대상 6 · 키별 DART 조회 · 키별 탐침 · 텔레그램 방 바꾸기를 진짜 클라이언트로 결선(가짜 전송)", async () => {
    const cfg: DartAlertConfig = {
      supabaseUrl: "http://127.0.0.1:1",
      supabaseServiceRoleKey: SECRETS.SUPABASE_SERVICE_ROLE_KEY,
      dartApiKey: SECRETS.OPENDART_API_KEY,
      dartApiKey2: SECRETS.OPENDART_API_KEY_2,
      telegramBotToken: SECRETS.TELEGRAM_BOT_TOKEN,
      telegramChatId: SECRETS.TELEGRAM_CHAT_ID,
      dartBaseUrl: "http://dart.invalid",
      telegramBaseUrl: "http://telegram.invalid",
      dailyBudget: 15_000,
      mode: "auto",
      b001Kinds: ["유상증자결정"],
      b001Corrections: "exclude",
      logLevel: "info",
      appVersion: "test",
    };
    const reply = (config: InternalAxiosRequestConfig, data: unknown) =>
      Promise.resolve({ data, status: 200, statusText: "OK", headers: {}, config });
    const dartReqs: Record<string, unknown>[] = [];
    const dartAdapter: AxiosAdapter = (config) => {
      dartReqs.push({ ...(config.params as Record<string, unknown>) });
      return reply(config, { status: "000", total_count: 1, total_page: 1, list: [tenderRow(1)] });
    };
    const posts: Record<string, unknown>[] = [];
    const telegramAdapter: AxiosAdapter = (config) => {
      posts.push(JSON.parse(String(config.data)));
      return reply(config, { ok: true, result: { message_id: 9 } });
    };
    const logs = logRecorder();
    const deps = buildDeps(cfg, logs.log, new AbortController().signal, { dartAdapter, telegramAdapter });

    expect(deps.holder).toMatch(/^local:[0-9a-f]{8}$/);
    expect(deps.cfg).toEqual({ dailyBudget: 15_000, mode: "auto" });
    expect(deps.watches.map((w) => w.id)).toEqual([
      "tender_offer",
      "rights_merger",
      "market_action",
      "exchange_disclosure",
      "largest_holder_change",
      "insider_trade_plan",
    ]);
    expect(deps.watches[1].rule).toMatchObject({ form: "b001", kinds: ["유상증자결정"] });
    expect(deps.judge).toEqual({ b001Corrections: "exclude" });
    expect(JSON.stringify(deps.cfg)).not.toContain("SECRET");

    const list = await deps.dart.list(deps.watches[0], "20261116");
    expect(list).toMatchObject({ calls: 1 });
    expect(list.rows).toHaveLength(1);
    expect(dartReqs[0]).toMatchObject({ pblntf_detail_ty: "D004", bgn_de: "20261116", end_de: "20261116", page_no: 1 });
    for (const w of deps.watches.slice(1)) await deps.dart.list(w, "20261116");
    expect(dartReqs.slice(0, 6).map((r) => r.pblntf_detail_ty)).toEqual(["D004", "B001", "I003", "I001", "I004", "D005"]);
    expect(await deps.dart.probe("20261116", 1)).toEqual({ total: 1, calls: 1 });
    expect(dartReqs[6]).toMatchObject({ pblntf_detail_ty: "D004", page_no: 1 });
    expect(await deps.dart.probe("20261116", 2)).toEqual({ total: 1, calls: 1 });
    expect(dartReqs[7]).toMatchObject({ pblntf_detail_ty: "I001", page_no: 1 });
    // 키 결선(값은 출력하지 않고 같음만) — D004 · B001 · 탐침 1 은 키 1, 나머지 넷 · 탐침 2 는 키 2(261113-rn7 U-2)
    const usedKey1 = dartReqs.map((r) => r.crtfc_key === cfg.dartApiKey);
    const usedKey2 = dartReqs.map((r) => r.crtfc_key === cfg.dartApiKey2);
    expect(usedKey1).toEqual([true, true, false, false, false, false, true, false]);
    expect(usedKey2).toEqual([false, false, true, true, true, true, false, true]);

    expect(await deps.telegram.send("hello")).toEqual({ kind: "ok", messageId: 9 });
    expect(posts[0]).toMatchObject({ chat_id: SECRETS.TELEGRAM_CHAT_ID, text: "hello" });
    deps.telegram.switchChat("-1001111");
    await deps.telegram.send("again");
    expect(posts[1]).toMatchObject({ chat_id: "-1001111" });

    // 사용량 · 한도 의심 표시의 결선(표 · 서비스 키 · 날짜 · RPC 인자)은 tests/entryWiring.test.ts 가 단언한다(리뷰 WR-56)
    expect(typeof deps.db.leaseAcquire).toBe("function");
  });

  it("buildDeps — 전날 확인(fullRead)은 그 호출만의 새 쪽 기억으로 전 쪽을 읽고 오늘 조회의 기억은 그대로 둔다(함정 C)", async () => {
    const cfg: DartAlertConfig = {
      supabaseUrl: "http://127.0.0.1:1",
      supabaseServiceRoleKey: SECRETS.SUPABASE_SERVICE_ROLE_KEY,
      dartApiKey: SECRETS.OPENDART_API_KEY,
      dartApiKey2: SECRETS.OPENDART_API_KEY_2,
      telegramBotToken: SECRETS.TELEGRAM_BOT_TOKEN,
      telegramChatId: SECRETS.TELEGRAM_CHAT_ID,
      dartBaseUrl: "http://dart.invalid",
      telegramBaseUrl: "http://telegram.invalid",
      dailyBudget: 15_000,
      mode: "auto",
      b001Kinds: ["유상증자결정"],
      b001Corrections: "exclude",
      logLevel: "info",
      appVersion: "test",
    };
    // 날마다 150건(2쪽) — 쪽마다 다른 접수번호
    const dartReqs: Record<string, unknown>[] = [];
    const dartAdapter: AxiosAdapter = (config) => {
      const p = config.params as Record<string, unknown>;
      dartReqs.push({ ...p });
      const page = Number(p.page_no);
      const list = [exchangeRow(page, "2026-11-13", { rcept_no: `${String(p.bgn_de)}7${String(page).padStart(7, "0")}` })];
      return Promise.resolve({ data: { status: "000", total_count: 150, total_page: 2, list }, status: 200, statusText: "OK", headers: {}, config });
    };
    const deps = buildDeps(cfg, logRecorder().log, new AbortController().signal, { dartAdapter });
    const i001 = deps.watches.find((w) => w.id === "exchange_disclosure")!;
    const pages = () => dartReqs.map((r) => `${String(r.bgn_de)}:${String(r.page_no)}`);

    // 오늘 첫 조회 — 처음 보는 기억이라 전 쪽(1 · 2)
    expect((await deps.dart.list(i001, "20261116")).calls).toBe(2);
    // 곧바로 다시 — 수 그대로 · 60초 안이라 1쪽만
    expect((await deps.dart.list(i001, "20261116")).calls).toBe(1);
    // 전날 확인 — 새 기억이라 전 쪽(100건 넘는 날)
    expect((await deps.dart.list(i001, "20261113", { fullRead: true })).calls).toBe(2);
    // 오늘 기억은 그대로 — 다시 1쪽만(전날 날짜로 기억이 지워졌다면 전 쪽)
    expect((await deps.dart.list(i001, "20261116")).calls).toBe(1);
    expect(pages()).toEqual(["20261116:1", "20261116:2", "20261116:1", "20261113:1", "20261113:2", "20261116:1"]);
  });
});
