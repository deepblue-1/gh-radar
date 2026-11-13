import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import { createDartHttp, fetchListPage } from "../src/dart/client";
import {
  collectOnce,
  deliverPending,
  newLapState,
  type ClaimedRow,
  type InsertedRow,
  type InsertItem,
  type LapDeps,
  type MarkInput,
} from "../src/lap";
import { createTelegramHttp, sendMessage } from "../src/telegram/client";
import { buildWatches, DEFAULT_B001_KINDS } from "../src/watches";

/**
 * Phase 43-01 트레이서 — 공개매수 공시 1건이 한 길로 끝까지 간다(SC-1 · SC-2 · D-01 · D-02 · D-05 · D-07 · D-08 · D-14).
 *
 *   진짜 DART 클라이언트(fetchListPage · 가짜 전송) → judgeRow → db.insert → db.claim → alertText →
 *   진짜 텔레그램 클라이언트(sendMessage · 가짜 전송) → db.mark
 *
 * DB 층은 마이그레이션 20261113200000_dart_alert.sql 의 RPC 계약(dart_alert_insert · claim · mark)을 그대로 따르는
 * 메모리 대역이다 — 같은 계약을 supabase/tests/dart_alert.test.sql 이 진짜 Postgres 에서 잠근다.
 */

const DART_KEY = "TEST-DART-KEY-DO-NOT-LOG";
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-DO-NOT-LOG";
const CHAT_ID = "-1009999999999";
const DAY = "20261111";
const TODAY_ISO = "2026-11-11";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures/dart/list-d004-000.json"), "utf8"));

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  return Promise.resolve({ data, status, statusText: String(status), headers: {}, config });
}

/** 가짜 DART 전송 — 요청 인자를 기록하고 D004 면 픽스처, 그 밖이면 013(빈 목록) */
function fakeDart(override?: (params: Record<string, unknown>) => unknown) {
  const requests: { url: string | undefined; params: Record<string, unknown> }[] = [];
  const adapter: AxiosAdapter = (config) => {
    const params = { ...(config.params as Record<string, unknown>) };
    requests.push({ url: config.url, params });
    const body = override?.(params) ?? (params.pblntf_detail_ty === "D004" ? FIXTURE : { status: "013", message: "조회된 데이타가 없습니다." });
    return reply(config, 200, body);
  };
  return { adapter, requests };
}

/** 가짜 텔레그램 전송 — POST 본문을 기록하고 message_id 4242 */
function fakeTelegram(override?: () => { status: number; body: unknown } | "network") {
  const posts: { url: string | undefined; body: Record<string, unknown> }[] = [];
  const adapter: AxiosAdapter = (config) => {
    posts.push({ url: config.url, body: JSON.parse(String(config.data)) });
    const o = override?.();
    if (o === "network") {
      const err = Object.assign(new Error(`connect ECONNREFUSED ${config.baseURL}${config.url}`), {
        isAxiosError: true,
        code: "ECONNREFUSED",
        config,
      });
      return Promise.reject(err);
    }
    if (o) return reply(config, o.status, o.body);
    return reply(config, 200, { ok: true, result: { message_id: 4242 } });
  };
  return { adapter, posts };
}

interface DbRow extends InsertItem {
  status: "pending" | "sending" | "sent" | "seeded" | "expired";
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  claimed_by: string | null;
  first_seen_at: number;
  sent_at: number | null;
  telegram_message_id: number | null;
}

/** RPC 계약 메모리 대역 — ON CONFLICT 무시 · 새 행만 반환 · claim 은 pending→sending · mark 는 내가 잡은 sending 만 */
function fakeDb(now: () => number, holder = "tracer:0001") {
  const rows = new Map<string, DbRow>();
  const db: LapDeps["db"] = {
    async insert(items: InsertItem[], seed: boolean): Promise<InsertedRow[]> {
      const out: InsertedRow[] = [];
      for (const it of items) {
        if (rows.has(it.rcept_no)) continue;
        rows.set(it.rcept_no, {
          ...it,
          status: seed ? "seeded" : "pending",
          attempts: 0,
          next_attempt_at: now(),
          last_error: null,
          claimed_by: null,
          first_seen_at: now(),
          sent_at: null,
          telegram_message_id: null,
        });
        out.push({ rcept_no: it.rcept_no, late: it.late });
      }
      return out;
    },
    async claim(limit: number): Promise<ClaimedRow[]> {
      const picked = [...rows.values()]
        .filter((r) => r.rcept_dt === TODAY_ISO && r.status === "pending" && r.next_attempt_at <= now())
        .sort((a, b) => a.priority - b.priority || a.first_seen_at - b.first_seen_at || a.rcept_no.localeCompare(b.rcept_no))
        .slice(0, limit);
      return picked.map((r) => {
        r.status = "sending";
        r.claimed_by = holder;
        r.attempts += 1;
        return {
          rcept_no: r.rcept_no,
          watch: r.watch,
          corp_cls: r.corp_cls,
          corp_name: r.corp_name,
          stock_code: r.stock_code,
          report_nm: r.report_nm,
          flr_nm: r.flr_nm,
          late: r.late,
          attempts: r.attempts,
          first_seen_at: new Date(r.first_seen_at).toISOString(),
        };
      });
    },
    async mark(rceptNo: string, m: MarkInput): Promise<boolean> {
      const r = rows.get(rceptNo);
      if (!r || r.status !== "sending" || r.claimed_by !== holder) return false;
      if (m.ok) {
        Object.assign(r, { status: "sent", sent_at: now(), telegram_message_id: m.messageId, last_error: null });
      } else {
        const retry = Math.min(3600, Math.max(1, m.retryInS));
        Object.assign(r, {
          status: "pending",
          last_error: (m.error ?? "").slice(0, 300),
          next_attempt_at: now() + retry * 1000,
          claimed_by: null,
        });
      }
      return true;
    },
  };
  return { db, rows };
}

function captureLog() {
  const lines: { level: string; obj: object; msg?: string }[] = [];
  const at = (level: string) => (obj: object, msg?: string) => {
    lines.push({ level, obj, msg });
  };
  return { log: { info: at("info"), warn: at("warn"), error: at("error") }, lines };
}

function wire(opts?: { dart?: ReturnType<typeof fakeDart>; tg?: ReturnType<typeof fakeTelegram> }) {
  let t = Date.parse("2026-11-11T00:30:00Z"); // 09:30 KST
  const now = () => t;
  const dart = opts?.dart ?? fakeDart();
  const tg = opts?.tg ?? fakeTelegram();
  const dartHttp = createDartHttp("https://dart.invalid", dart.adapter);
  const tgHttp = createTelegramHttp("https://telegram.invalid", tg.adapter);
  const { db, rows } = fakeDb(now);
  const { log, lines } = captureLog();
  const deps: LapDeps = {
    // 키 1 감시 대상 둘(D004 · B001) — 가짜 HTTP 요청 수 단언이 이 둘을 기준으로 한다(261113-iez · rn7)
    watches: buildWatches({ b001Kinds: DEFAULT_B001_KINDS }).filter((x) => x.key === 1),
    judge: { b001Corrections: "include" },
    log,
    clock: { now },
    sleep: async () => {},
    dart: {
      async list(watch, day) {
        const page = await fetchListPage(dartHttp, DART_KEY, { detailTy: watch.pblntfDetailTy, day, pageNo: 1 });
        return { rows: page.rows, calls: 1 };
      },
    },
    db,
    telegram: { send: (text, o) => sendMessage(tgHttp, BOT_TOKEN, CHAT_ID, text, o) },
  };
  return { deps, dart, tg, rows, lines, advance: (ms: number) => (t += ms) };
}

const lap = { isLate: () => false, seed: false };

describe("트레이서 — 공개매수 1건 한 길", () => {
  it("DART 목록 1행 → 거르기 → 넣기 → 차례 → 두 줄 → sendMessage 1번 → sent · 재조회 · 재시작에도 다시 안 감", async () => {
    const w = wire();
    const state = newLapState();

    const c1 = await collectOnce(w.deps, state, DAY, lap);
    const d1 = await deliverPending(w.deps, 5);

    // DART 요청 인자(D004 · 그날 하루 · 100건 · 정정 전 원본 포함)
    const d004 = w.dart.requests.filter((r) => r.params.pblntf_detail_ty === "D004");
    expect(d004).toHaveLength(1);
    expect(d004[0].url).toBe("/api/list.json");
    expect(d004[0].params).toMatchObject({
      crtfc_key: DART_KEY,
      pblntf_detail_ty: "D004",
      bgn_de: DAY,
      end_de: DAY,
      page_count: 100,
      page_no: 1,
      last_reprt_at: "N",
    });
    expect(c1.calls).toBe(w.dart.requests.length);
    expect(c1.results.every((r) => r.ok)).toBe(true);

    // 비상장(E) 행은 넣지 않는다(D-05) · 공개매수 1건만 새로 들어감
    expect(c1.inserted).toEqual([{ rcept_no: "20261111000001", late: false }]);
    expect(w.rows.has("20261111000002")).toBe(false);

    // 텔레그램 POST 정확히 1번 · 본문 키 넷뿐(D-14 — 무음 인자 없음)
    expect(d1).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(w.tg.posts).toHaveLength(1);
    const post = w.tg.posts[0];
    expect(post.url).toBe(`/bot${BOT_TOKEN}/sendMessage`);
    expect(Object.keys(post.body).sort()).toEqual(["chat_id", "link_preview_options", "parse_mode", "text"]);
    expect(post.body.chat_id).toBe(CHAT_ID);
    expect(post.body.parse_mode).toBe("HTML");
    expect(post.body.link_preview_options).toEqual({ is_disabled: true });
    expect(post.body.text).toBe(
      "📢 공개매수신고서 — 에스텍(069510) · 제출인 가람홀딩스\n" +
        '<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20261111000001">DART 원문</a> · 금융감독원 전자공시',
    );
    expect(String(post.body.text).split("\n")).toHaveLength(2);

    // DB 행 sent · message id
    const row = w.rows.get("20261111000001")!;
    expect(row.status).toBe("sent");
    expect(row.telegram_message_id).toBe(4242);
    expect(row.attempts).toBe(1);
    expect(row.watch).toBe("tender_offer");
    expect(row.priority).toBe(0);
    expect(row.rcept_dt).toBe(TODAY_ISO);

    // 두 번째 바퀴 — 같은 응답 → 송신 0 추가
    w.advance(5_000);
    const c2 = await collectOnce(w.deps, state, DAY, lap);
    await deliverPending(w.deps, 5);
    expect(c2.inserted).toEqual([]);
    expect(w.tg.posts).toHaveLength(1);

    // 재시작 흉내 — 메모리를 비워도 DB 가 같은 접수번호를 다시 받지 않는다(SC-2)
    w.advance(5_000);
    const c3 = await collectOnce(w.deps, newLapState(), DAY, lap);
    const d3 = await deliverPending(w.deps, 5);
    expect(c3.inserted).toEqual([]);
    expect(d3.claimed).toBe(0);
    expect(w.tg.posts).toHaveLength(1);

    // 로그 어디에도 키 · 토큰 없음
    const dump = JSON.stringify(w.lines);
    expect(dump).not.toContain("TEST-DART-KEY-DO-NOT-LOG");
    expect(dump).not.toContain("TEST-BOT-TOKEN-DO-NOT-LOG");
  });

  it("장애 길 — DART 020 · 텔레그램 네트워크 오류에도 키 · 토큰이 로그 · 결과 · DB 에 새지 않는다", async () => {
    const dart = fakeDart((p) => (p.pblntf_detail_ty === "D004" ? { status: "020", message: "요청 제한을 초과하였습니다." } : undefined));
    const w1 = wire({ dart });
    const c = await collectOnce(w1.deps, newLapState(), DAY, lap);
    expect(c.results[0]).toMatchObject({ watch: "tender_offer", ok: false, kind: "quota" });
    // 실패한 D004 조회 1회 + 주요사항보고서(B001 · 013 빈 목록) 1회 — 실패 호출도 센다(43-09 에서 감시 대상 2개)
    expect(c.calls).toBe(2);
    expect(c.calls).toBe(w1.dart.requests.length);
    expect(c.results[1]).toMatchObject({ watch: "rights_merger", ok: true });
    expect(w1.lines.some((l) => l.level === "warn" && l.msg === "dart list failed")).toBe(true);

    const tg = fakeTelegram(() => "network");
    const w2 = wire({ tg });
    await collectOnce(w2.deps, newLapState(), DAY, lap);
    const d = await deliverPending(w2.deps, 5);
    expect(d).toEqual({ claimed: 1, sent: 0, failed: 1 });
    const row = w2.rows.get("20261111000001")!;
    expect(row.status).toBe("pending");
    expect(row.last_error).toBe("transient:0");
    expect(row.next_attempt_at).toBeGreaterThan(Date.parse("2026-11-11T00:30:00Z"));

    const dump = JSON.stringify([w1.lines, w2.lines, c, d, [...w2.rows.values()]]);
    expect(dump).not.toContain("TEST-DART-KEY-DO-NOT-LOG");
    expect(dump).not.toContain("TEST-BOT-TOKEN-DO-NOT-LOG");
  });
});
