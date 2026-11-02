import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import {
  createTickConvertTrigger,
  metadataAccessToken,
  resetMetadataTokenCache,
  TICK_REQUEST_TIMEOUT,
} from "../../src/services/tick-convert-trigger";
import { logger } from "../../src/logger";
import { loadConfig } from "../../src/config";

/**
 * Phase 37 D-03 — 요청 변환 트리거(Cloud Run Admin API v2 `jobs:run` + overrides · 메타데이터 서버 토큰).
 * 가짜 fetch 로 요청 URL · 헤더 · 본문 · 토큰 캐시 · 타임아웃 · 실패 매핑(「throw 하지 않는다」)을 본다.
 */

const JOB = "projects/gh-radar/locations/asia-northeast3/jobs/gh-radar-tick-convert";
const RUN_URL = `https://run.googleapis.com/v2/${JOB}:run`;
const META_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const TOKEN = "ya29.secret-token-VALUE";

type Call = { url: string; init: RequestInit };

/** URL 별 응답을 돌려주는 가짜 fetch. 함수면 호출마다 계산. */
function fakeFetch(routes: Record<string, (init: RequestInit) => Promise<Response> | Response>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const h = routes[url];
    if (!h) throw new Error(`unexpected fetch ${url}`);
    return h(init);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const tokenOk = () => json(200, { access_token: TOKEN, expires_in: 3599, token_type: "Bearer" });
const runOk = () =>
  json(200, {
    name: "projects/gh-radar/locations/asia-northeast3/operations/op-1",
    metadata: { name: `${JOB}/executions/gh-radar-tick-convert-abc12` },
  });

beforeEach(() => resetMetadataTokenCache());
afterEach(() => vi.useRealTimers());

describe("metadataAccessToken — 메타데이터 서버 토큰", () => {
  it("GET 메타데이터 URL · 헤더 Metadata-Flavor: Google · access_token 반환", async () => {
    const f = fakeFetch({ [META_URL]: tokenOk });
    await expect(metadataAccessToken(f.impl)).resolves.toBe(TOKEN);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(META_URL);
    expect(new Headers(f.calls[0].init.headers).get("Metadata-Flavor")).toBe("Google");
  });

  it("expires_in − 60초까지 캐시 — 그 안 두 번째 호출은 요청 0회 · 지나면 다시 받는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    const f = fakeFetch({ [META_URL]: tokenOk });
    await metadataAccessToken(f.impl);
    vi.setSystemTime(new Date("2026-11-02T10:58:00Z")); // 3480초 뒤 < 3599 − 60
    await metadataAccessToken(f.impl);
    expect(f.calls).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-02T10:59:00Z")); // 3540초 뒤 ≥ 3539
    await metadataAccessToken(f.impl);
    expect(f.calls).toHaveLength(2);
  });

  it("비 2xx · access_token 없음 → throw(토큰 원문 없이)", async () => {
    const a = fakeFetch({ [META_URL]: () => json(404, { error: "not on GCE" }) });
    await expect(metadataAccessToken(a.impl)).rejects.toThrow(/404/);
    const b = fakeFetch({ [META_URL]: () => json(200, { expires_in: 3599 }) });
    await expect(metadataAccessToken(b.impl)).rejects.toThrow(/access_token/);
  });
});

describe("createTickConvertTrigger — Admin API v2 jobs:run with overrides", () => {
  it("TICK_REQUEST_TIMEOUT = 1200s (37-04 running 회수 25분 = 1200s + 5분)", () => {
    expect(TICK_REQUEST_TIMEOUT).toBe("1200s");
  });

  it("POST v2/<job>:run · Bearer 토큰 · 본문 overrides(args · taskCount 1 · timeout 1200s) · 실행 이름 반환", async () => {
    const f = fakeFetch({ [META_URL]: tokenOk, [RUN_URL]: runOk });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl });
    const r = await t.run("20261030", "KRX");
    expect(r).toEqual({ ok: true, execution: `${JOB}/executions/gh-radar-tick-convert-abc12` });

    const run = f.calls.find((c) => c.url === RUN_URL)!;
    expect(run.init.method).toBe("POST");
    const h = new Headers(run.init.headers);
    expect(h.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(h.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(run.init.body))).toEqual({
      overrides: {
        containerOverrides: [{ args: ["request", "--date", "20261030", "--ex", "KRX"] }],
        taskCount: 1,
        timeout: "1200s",
      },
    });
    expect(run.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("두 번째 run 은 토큰 요청 0회(캐시)", async () => {
    const f = fakeFetch({ [META_URL]: tokenOk, [RUN_URL]: runOk });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl });
    await t.run("20261030", "KRX");
    await t.run("20261030", "NXT");
    expect(f.calls.filter((c) => c.url === META_URL)).toHaveLength(1);
    expect(f.calls.filter((c) => c.url === RUN_URL)).toHaveLength(2);
  });

  it("tokenFn 주입 시 메타데이터 서버를 부르지 않는다", async () => {
    const f = fakeFetch({ [RUN_URL]: runOk });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl, tokenFn: async () => "tok-x" });
    const r = await t.run("20261030", "NXT");
    expect(r.ok).toBe(true);
    expect(f.calls.map((c) => c.url)).toEqual([RUN_URL]);
  });

  it("HTTP 403 → {ok:false, status:403, error: 본문 앞 200자} · throw 하지 않는다", async () => {
    const long = "x".repeat(500);
    const f = fakeFetch({
      [RUN_URL]: () => json(403, { error: { code: 403, message: `Permission 'run.jobs.runWithOverrides' denied ${long}` } }),
    });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl, tokenFn: async () => TOKEN });
    const r = await t.run("20261030", "KRX");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.error).toContain("runWithOverrides");
    expect(r.error.length).toBeLessThanOrEqual(200);
  });

  it("네트워크 오류 → status 0 · throw 하지 않는다", async () => {
    const f = fakeFetch({
      [RUN_URL]: () => {
        throw new TypeError("fetch failed");
      },
    });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl, tokenFn: async () => TOKEN });
    const r = await t.run("20261030", "KRX");
    expect(r).toMatchObject({ ok: false, status: 0 });
  });

  it("토큰 실패 → status 0 · Admin API 0회", async () => {
    const f = fakeFetch({ [META_URL]: () => json(500, {}), [RUN_URL]: runOk });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl });
    const r = await t.run("20261030", "KRX");
    expect(r).toMatchObject({ ok: false, status: 0 });
    expect(f.calls.filter((c) => c.url === RUN_URL)).toHaveLength(0);
  });

  it("타임아웃(기본 10초) → abort · {ok:false, status:0, error:TIMEOUT}", async () => {
    const f = fakeFetch({
      [RUN_URL]: (init) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        }),
    });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl, tokenFn: async () => TOKEN, timeoutMs: 20 });
    const r = await t.run("20261030", "KRX");
    expect(r).toEqual({ ok: false, status: 0, error: "TIMEOUT" });
  });

  it("로그에 토큰을 남기지 않는다(실패 경로 포함)", async () => {
    const spies = (["info", "warn", "error"] as const).map((lv) => vi.spyOn(logger, lv));
    const f = fakeFetch({ [META_URL]: tokenOk, [RUN_URL]: () => json(500, { error: "boom" }) });
    const t = createTickConvertTrigger({ job: JOB, fetchImpl: f.impl });
    await t.run("20261030", "KRX");
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(TOKEN);
    spies.forEach((s) => s.mockRestore());
  });
});

describe("config — TICK_CONVERT_JOB · TICK_REQUEST_DAILY_CAP", () => {
  afterEach(() => {
    delete process.env.TICK_CONVERT_JOB;
    delete process.env.TICK_REQUEST_DAILY_CAP;
  });

  it("미설정 · 빈 문자열 = undefined · 상한 기본 20", () => {
    expect(loadConfig().tickConvertJob).toBeUndefined();
    process.env.TICK_CONVERT_JOB = "";
    expect(loadConfig().tickConvertJob).toBeUndefined();
    expect(loadConfig().tickRequestDailyCap).toBe(20);
  });

  it("올바른 Job 경로는 통과 · 아니면 부팅 throw", () => {
    process.env.TICK_CONVERT_JOB = JOB;
    expect(loadConfig().tickConvertJob).toBe(JOB);
    process.env.TICK_CONVERT_JOB = "gh-radar-tick-convert";
    expect(() => loadConfig()).toThrow(/TICK_CONVERT_JOB/);
    process.env.TICK_CONVERT_JOB = `${JOB}/executions/x`;
    expect(() => loadConfig()).toThrow(/TICK_CONVERT_JOB/);
  });

  it("TICK_REQUEST_DAILY_CAP 가 덮는다 · 숫자가 아니면 기본값", () => {
    process.env.TICK_REQUEST_DAILY_CAP = "5";
    expect(loadConfig().tickRequestDailyCap).toBe(5);
    process.env.TICK_REQUEST_DAILY_CAP = "abc";
    expect(loadConfig().tickRequestDailyCap).toBe(20);
  });
});
