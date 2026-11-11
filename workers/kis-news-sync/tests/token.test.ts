import { describe, expect, it, vi } from "vitest";
import { KisApiError, KIS_TOKEN_PATH } from "../src/kis/client";
import {
  getKisAccessToken,
  parseKisExpiry,
  KIS_TOKEN_TYPE,
  TOKEN_ISSUE_GAP_MS,
  TOKEN_REUSE_MIN_MS,
} from "../src/kis/token";

/**
 * Phase 41-13 — DB 토큰 재사용 · 만료 1시간 전 재발급 · 61초 가드 · 임대 보유자만 발급(Pitfall 1).
 * 시계는 인자 `now`(epoch ms) · http · supabase 는 목.
 */

const NOW = Date.parse("2026-11-12T10:00:00+09:00");
const MIN = 60_000;
const HOUR = 60 * MIN;

const DB_TOKEN = "DB-TOKEN-DO-NOT-LOG-111";
const NEW_TOKEN = "NEW-TOKEN-DO-NOT-LOG-222";
const APPKEY = "APPKEY-DO-NOT-LOG-333";
const APPSECRET = "APPSECRET-DO-NOT-LOG-444";

type DbRow = { access_token: string; expires_at: string; fetched_at: string } | null;

/** news-sync tests/helpers/supabase-mock.ts 꼴의 작은 목 — from(표).select().eq().maybeSingle() · upsert() */
function supabaseMock(row: DbRow, opts: { readError?: unknown; upsertError?: unknown } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: opts.readError ?? null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn().mockResolvedValue({ data: null, error: opts.upsertError ?? null });
  const from = vi.fn(() => ({ select, upsert }));
  return { client: { from }, from, select, eq, maybeSingle, upsert };
}

function dbRow(remainMs: number, issuedAgoMs = 23 * HOUR): DbRow {
  return {
    access_token: DB_TOKEN,
    expires_at: new Date(NOW + remainMs).toISOString(),
    fetched_at: new Date(NOW - issuedAgoMs).toISOString(),
  };
}

function httpOk(data: Record<string, unknown> = {}) {
  return {
    post: vi.fn().mockResolvedValue({
      status: 200,
      data: {
        access_token: NEW_TOKEN,
        token_type: "Bearer",
        expires_in: 86400,
        access_token_token_expired: "2026-11-13 10:00:00",
        ...data,
      },
    }),
  };
}

function logMock() {
  return { info: vi.fn(), warn: vi.fn() };
}

function run(
  db: ReturnType<typeof supabaseMock>,
  http: { post: ReturnType<typeof vi.fn> },
  extra: { canIssue: boolean; force?: boolean; log?: ReturnType<typeof logMock> },
) {
  return getKisAccessToken({
    supabase: db.client as never,
    http: http as never,
    appkey: APPKEY,
    appsecret: APPSECRET,
    canIssue: extra.canIssue,
    force: extra.force,
    now: NOW,
    log: extra.log ?? logMock(),
  });
}

describe("상수 · parseKisExpiry", () => {
  it("live · 1시간 · 61초", () => {
    expect(KIS_TOKEN_TYPE).toBe("live");
    expect(TOKEN_REUSE_MIN_MS).toBe(3_600_000);
    expect(TOKEN_ISSUE_GAP_MS).toBe(61_000);
  });

  it("`YYYY-MM-DD HH:MM:SS` 를 KST(+09:00)로 읽고, 잘못되면 null", () => {
    expect(parseKisExpiry("2026-11-13 10:00:00")?.toISOString()).toBe("2026-11-13T01:00:00.000Z");
    expect(parseKisExpiry("2026-13-45 99:00:00")).toBeNull();
    expect(parseKisExpiry("tomorrow")).toBeNull();
    expect(parseKisExpiry(undefined)).toBeNull();
  });
});

describe("getKisAccessToken", () => {
  it("DB 토큰 남은 시간 2시간 → 재사용 · 발급 호출 0", async () => {
    const db = supabaseMock(dbRow(2 * HOUR));
    const http = httpOk();
    const r = await run(db, http, { canIssue: true });
    expect(r).toEqual({ token: DB_TOKEN, expiresAt: new Date(NOW + 2 * HOUR), issued: false });
    expect(http.post).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledWith("kis_access_tokens");
    expect(db.eq).toHaveBeenCalledWith("token_type", "live");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("남은 30분 + 임대 보유 → tokenP 발급 · 만료 문자열(KST) 파싱 · upsert(onConflict token_type)", async () => {
    const db = supabaseMock(dbRow(30 * MIN));
    const http = httpOk();
    const r = await run(db, http, { canIssue: true });
    expect(http.post).toHaveBeenCalledTimes(1);
    const [path, body] = http.post.mock.calls[0];
    expect(path).toBe(KIS_TOKEN_PATH);
    expect(body).toEqual({ grant_type: "client_credentials", appkey: APPKEY, appsecret: APPSECRET });
    expect(r.issued).toBe(true);
    expect(r.token).toBe(NEW_TOKEN);
    expect(r.expiresAt.toISOString()).toBe("2026-11-13T01:00:00.000Z");
    expect(db.upsert).toHaveBeenCalledWith(
      {
        token_type: "live",
        access_token: NEW_TOKEN,
        expires_at: "2026-11-13T01:00:00.000Z",
        fetched_at: new Date(NOW).toISOString(),
      },
      { onConflict: "token_type" },
    );
  });

  it("DB 토큰 없음 + 임대 보유 → 발급", async () => {
    const db = supabaseMock(null);
    const http = httpOk();
    const r = await run(db, http, { canIssue: true });
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(r.issued).toBe(true);
  });

  it("남은 30분 + 임대 없음 → DB 토큰 그대로 · 경고 · 발급 호출 0", async () => {
    const db = supabaseMock(dbRow(30 * MIN));
    const http = httpOk();
    const log = logMock();
    const r = await run(db, http, { canIssue: false, log });
    expect(r).toEqual({ token: DB_TOKEN, expiresAt: new Date(NOW + 30 * MIN), issued: false });
    expect(http.post).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["만료된 DB 토큰", dbRow(-1 * MIN)],
    ["DB 토큰 없음", null],
  ])("%s + 임대 없음 → 오류 · 발급 호출 0", async (_label, row) => {
    const db = supabaseMock(row);
    const http = httpOk();
    await expect(run(db, http, { canIssue: false })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("직전 발급 30초 전 → 발급 호출 없이 오류(61초 가드)", async () => {
    const db = supabaseMock(dbRow(30 * MIN, 30_000));
    const http = httpOk();
    await expect(run(db, http, { canIssue: true })).rejects.toThrow(/61/);
    expect(http.post).not.toHaveBeenCalled();
  });

  it("force 는 재사용 판정을 건너뛰지만 61초 가드는 지킨다", async () => {
    // 남은 23시간 · 2분 전 발급 → force 면 재발급
    const db1 = supabaseMock(dbRow(23 * HOUR, 2 * MIN));
    const http1 = httpOk();
    const r1 = await run(db1, http1, { canIssue: true, force: true });
    expect(http1.post).toHaveBeenCalledTimes(1);
    expect(r1.issued).toBe(true);

    // 남은 24시간 · 30초 전 발급 → force 여도 발급 호출 0 · 오류
    const db2 = supabaseMock(dbRow(24 * HOUR, 30_000));
    const http2 = httpOk();
    await expect(run(db2, http2, { canIssue: true, force: true })).rejects.toThrow(/61/);
    expect(http2.post).not.toHaveBeenCalled();
  });

  it("force 여도 임대 없으면 발급 호출 0", async () => {
    const db = supabaseMock(dbRow(23 * HOUR, 2 * HOUR));
    const http = httpOk();
    const r = await run(db, http, { canIssue: false, force: true });
    expect(http.post).not.toHaveBeenCalled();
    expect(r.issued).toBe(false);
    expect(r.token).toBe(DB_TOKEN);
  });

  it("만료 문자열이 잘못되면 expires_in 초로 대체", async () => {
    const db = supabaseMock(null);
    const http = httpOk({ access_token_token_expired: "garbage", expires_in: 7200 });
    const r = await run(db, http, { canIssue: true });
    expect(r.expiresAt.getTime()).toBe(NOW + 7200 * 1000);
  });

  it("발급 거절(EGW00133) → KisApiError token_rate · upsert 0", async () => {
    const db = supabaseMock(null);
    const http = {
      post: vi.fn().mockResolvedValue({
        status: 403,
        data: { error_code: "EGW00133", error_description: "접근토큰 발급 잠시 후 다시 시도하세요(1분당 1회)" },
      }),
    };
    const err = await run(db, http, { canIssue: true }).catch((e) => e);
    expect(err).toBeInstanceOf(KisApiError);
    expect(err.kind).toBe("token_rate");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("DB 읽기 실패 → 오류 · 발급 호출 0(직전 발급 시각을 모르면 발급하지 않는다)", async () => {
    const db = supabaseMock(null, { readError: { message: "connection refused" } });
    const http = httpOk();
    await expect(run(db, http, { canIssue: true })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("발급 · 재사용 · 경고 로그 어디에도 토큰 · 앱키 · 시크릿 문자열이 없다", async () => {
    const log = logMock();
    await run(supabaseMock(dbRow(30 * MIN)), httpOk(), { canIssue: true, log });
    await run(supabaseMock(dbRow(2 * HOUR)), httpOk(), { canIssue: true, log });
    await run(supabaseMock(dbRow(30 * MIN)), httpOk(), { canIssue: false, log });
    await run(supabaseMock(null, { upsertError: { message: "boom" } }), httpOk(), { canIssue: true, log });
    expect(log.info.mock.calls.length + log.warn.mock.calls.length).toBeGreaterThan(0);
    const dump = JSON.stringify([log.info.mock.calls, log.warn.mock.calls]);
    for (const secret of [DB_TOKEN, NEW_TOKEN, APPKEY, APPSECRET]) {
      expect(dump).not.toContain(secret);
    }
  });
});
