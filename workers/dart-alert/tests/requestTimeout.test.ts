import { CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDartHttp, DART_REQUEST_TIMEOUT_MS, DartApiError, fetchListPage } from "../src/dart/client";
import { createDartAlertDb, DbError } from "../src/db";
import { createSupabaseClient, DB_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "../src/services/supabase";
import { createTelegramHttp, sendMessage, TELEGRAM_REQUEST_TIMEOUT_MS } from "../src/telegram/client";

/**
 * 리뷰 WR-04 — 요청마다 전체 시간 상한. axios `timeout` 은 연결된 뒤 유휴 시간만 재고(DNS · TCP 연결 · 조금씩 흘러드는
 * 응답은 못 끊음) Supabase 기본 fetch 는 제한이 없어, 90초 임대 · 송신 기한 계산의 전제(요청당 최대 10초)가 깨졌다.
 * - DART · 텔레그램: 요청마다 `AbortSignal.timeout(10초)` 를 건다 → 끊기면 키 · 토큰 없는 transient.
 * - Supabase: `global.fetch` 를 감싸 요청마다 상한 → 끊기면 `{ error }` → db.ts `DbError`.
 * 실제 네트워크 없음. 10초를 실제로 기다리지 않게 `AbortSignal.timeout` 을 가로채 손으로 끊는다(Supabase 는 20ms 상한).
 */

const KEY = "TEST-DART-KEY-DO-NOT-LOG";
const TOKEN = "123456:TEST-BOT-TOKEN-DO-NOT-LOG";

/** 끊길 때까지 응답하지 않는 전송 — 받은 signal 을 기록하고, abort 되면 axios 처럼 CanceledError 로 끝난다 */
function hangingAdapter() {
  const signals: (AbortSignal | undefined)[] = [];
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    const signal = config.signal as AbortSignal | undefined;
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new CanceledError(undefined, undefined, config)), { once: true });
    });
  };
  return { adapter, signals };
}

/** AbortSignal.timeout 을 가로채 상한 값을 기록하고, 손으로 끊을 수 있는 signal 을 돌려준다 */
function interceptTimeout() {
  const asked: number[] = [];
  const controllers: AbortController[] = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    asked.push(ms);
    const ac = new AbortController();
    controllers.push(ac);
    return ac.signal;
  });
  return { asked, fire: () => controllers.forEach((c) => c.abort(new DOMException("timed out", "TimeoutError"))) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("요청 전체 시간 상한 (리뷰 WR-04)", () => {
  it("OpenDART — 요청마다 10초 AbortSignal 을 걸고, 끊기면 키 없는 transient(httpStatus 0)", async () => {
    const t = interceptTimeout();
    const { adapter, signals } = hangingAdapter();
    const p = fetchListPage(createDartHttp("https://opendart.example.test", adapter), KEY, { detailTy: "D004", day: "20261116", pageNo: 1 });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    expect(DART_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(t.asked).toEqual([10_000]);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    t.fire();
    const err = (await p.then(
      () => null,
      (e: unknown) => e,
    )) as DartApiError;
    expect(err).toBeInstanceOf(DartApiError);
    expect(err).toMatchObject({ kind: "transient", httpStatus: 0, description: "ERR_CANCELED" });
    expect(JSON.stringify({ ...err, message: err.message })).not.toContain(KEY);
  });

  it("텔레그램 — 요청마다 10초 AbortSignal 을 걸고, 끊기면 던지지 않고 토큰 없는 transient", async () => {
    const t = interceptTimeout();
    const { adapter, signals } = hangingAdapter();
    const p = sendMessage(createTelegramHttp("https://api.telegram.example.test", adapter), TOKEN, "-100111", "본문");
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    expect(TELEGRAM_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(t.asked).toEqual([10_000]);
    t.fire();
    const r = await p;
    expect(r).toEqual({ kind: "transient", code: 0, description: "ERR_CANCELED" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("Supabase — fetchWithTimeout 은 응답 없는 요청을 상한에서 끊고, 부르는 쪽 signal 도 그대로 따른다", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      });
    const started = Date.now();
    await expect(fetchWithTimeout(20, hanging)("https://db.example.test/rest/v1/rpc/x")).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - started).toBeLessThan(5_000);

    const caller = new AbortController();
    const p = fetchWithTimeout(60_000, hanging)("https://db.example.test/rest/v1/rpc/x", { signal: caller.signal });
    caller.abort(new DOMException("caller", "AbortError"));
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("Supabase 클라이언트 — 응답 없는 RPC 는 상한에서 DbError 로 끝난다(무한 대기 없음 · 기본 상한 10초)", async () => {
    expect(DB_REQUEST_TIMEOUT_MS).toBe(10_000);
    const urls: string[] = [];
    const hanging: typeof fetch = (input, init) =>
      new Promise((_resolve, reject) => {
        urls.push(String(input));
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      });
    const supabase = createSupabaseClient(
      { supabaseUrl: "https://db.example.test", supabaseServiceRoleKey: "service-role-key-DO-NOT-LOG" },
      { fetch: hanging, timeoutMs: 20 },
    );
    const db = createDartAlertDb(supabase, "exec-1:abcd1234");
    const err = await db.claim(5).then(
      () => null,
      (e: unknown) => e,
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/rest/v1/rpc/dart_alert_claim");
    expect(err).toBeInstanceOf(DbError);
    expect((err as Error).message).toContain("dart_alert_claim 실패");
    expect((err as Error).message).not.toContain("service-role-key-DO-NOT-LOG");
  });
});
