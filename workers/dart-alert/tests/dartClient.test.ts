import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import {
  classifyDartStatus,
  createDartHttp,
  DartApiError,
  fetchListPage,
  fetchWatchRows,
  FULL_REREAD_MS,
  PageTracker,
  type DartRow,
} from "../src/dart/client";
import { safeErrorFields } from "../src/safeError";

/**
 * Phase 43-04 — OpenDART 공시검색 클라이언트 운영 품질(SC-1 · SC-4 · 리서치 확인 5 · Pitfall 2 · 4 · 5).
 *
 * - 분류는 HTTP 상태가 아니라 본문 `status` 로 한다 — `013` 은 오류가 아니라 빈 목록이다.
 * - 키(`crtfc_key`)는 오류 객체 · message · safeErrorFields · JSON 어디에도 실리지 않는다.
 * - 한 유형이 하루 100건을 넘어도 새 건을 놓치지 않는다(`fetchWatchRows` · `PageTracker`).
 *
 * 픽스처는 손으로 만든 문서 꼴이다(실제 응답 표본 아님).
 */

const KEY = "TEST-DART-KEY-DO-NOT-LOG";
const DAY = "20261111";
const BASE = "https://opendart.example.test";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(__dirname, "fixtures/dart", name), "utf8"));
}

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  return Promise.resolve({ data, status, statusText: String(status), headers: {}, config });
}

type Responder = (params: Record<string, unknown>, config: InternalAxiosRequestConfig) => ReturnType<AxiosAdapter>;

/** 가짜 전송 — 요청 인자를 기록하고 responder 결과를 돌려준다 */
function fakeDart(responder: Responder) {
  const pages: number[] = [];
  const params: Record<string, unknown>[] = [];
  const adapter: AxiosAdapter = (config) => {
    const p = { ...(config.params as Record<string, unknown>) };
    params.push(p);
    pages.push(Number(p.page_no));
    return responder(p, config);
  };
  return { http: createDartHttp(BASE, adapter), pages, params };
}

const body = (data: unknown, status = 200): Responder => (_p, config) => reply(config, status, data);

/** 응답 없는 실패 — axios 오류 꼴. message 와 config 에 키가 든 URL 이 실린다(새면 안 되는 것) */
function noResponse(code: string): Responder {
  return (_p, config) => {
    const url = `${BASE}/api/list.json?crtfc_key=${KEY}`;
    return Promise.reject(
      new AxiosError(`${code} ${url}`, code, { ...config, url } as InternalAxiosRequestConfig),
    );
  };
}

async function catchErr(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected rejection");
}

function expectNoKey(err: unknown) {
  expect(err).toBeInstanceOf(DartApiError);
  const e = err as DartApiError;
  expect(e.message).not.toContain(KEY);
  expect(JSON.stringify(e)).not.toContain(KEY);
  expect(JSON.stringify(safeErrorFields(e))).not.toContain(KEY);
  expect(String(e.stack ?? "")).not.toContain(KEY);
  expect((e as { cause?: unknown }).cause).toBeUndefined();
}

const q = { detailTy: "B001", day: DAY, pageNo: 1 };

describe("classifyDartStatus (리서치 상태 표)", () => {
  it.each([
    ["000", "ok"],
    ["013", "empty"],
    ["020", "quota"],
    ["010", "key"],
    ["011", "key"],
    ["012", "key"],
    ["901", "key"],
    ["100", "bug"],
    ["101", "bug"],
    ["800", "transient"],
    ["900", "transient"],
    ["999", "unknown"],
  ])("%s → %s", (code, want) => {
    expect(classifyDartStatus(code)).toBe(want);
  });

  it("코드가 없으면 unknown", () => {
    expect(classifyDartStatus(null)).toBe("unknown");
    expect(classifyDartStatus(undefined)).toBe("unknown");
  });
});

describe("fetchListPage 응답 분류 (SC-4 · Pitfall 2)", () => {
  it("000 → 행 · total · totalPage", async () => {
    const { http, params } = fakeDart(body(fixture("list-d004-000.json")));
    const page = await fetchListPage(http, KEY, { ...q, detailTy: "D004" });
    expect(page.total).toBe(2);
    expect(page.totalPage).toBe(1);
    expect(page.rows.map((r) => r.rcept_no)).toEqual(["20261111000001", "20261111000002"]);
    // 키는 쿼리 인자로만 간다(가짜 전송이 받은 설정으로만 확인)
    expect(params[0]).toMatchObject({ crtfc_key: KEY, bgn_de: DAY, end_de: DAY, pblntf_detail_ty: "D004", page_count: 100 });
  });

  it("013(조회된 데이터 없음) → 오류가 아니라 빈 목록", async () => {
    const { http } = fakeDart(body(fixture("list-013.json")));
    await expect(fetchListPage(http, KEY, q)).resolves.toEqual({ total: 0, totalPage: 0, rows: [] });
  });

  it("020 → DartApiError quota", async () => {
    const { http } = fakeDart(body(fixture("list-020.json")));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err).toMatchObject({ kind: "quota", code: "020", httpStatus: 200 });
    expect(err.description).toBe("요청 제한을 초과하였습니다.");
  });

  it("010 → DartApiError key", async () => {
    const { http } = fakeDart(body(fixture("list-010.json")));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err).toMatchObject({ kind: "key", code: "010" });
  });

  it.each([
    ["011", "key"],
    ["012", "key"],
    ["901", "key"],
    ["100", "bug"],
    ["101", "bug"],
    ["800", "transient"],
    ["900", "transient"],
    ["999", "unknown"],
  ])("인라인 응답 %s → %s", async (code, kind) => {
    const { http } = fakeDart(body({ status: code, message: `문구 ${code}` }));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err).toMatchObject({ kind, code });
  });

  it("HTTP 503 → transient", async () => {
    const { http } = fakeDart(body("<html>Service Unavailable</html>", 503));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err).toMatchObject({ kind: "transient", httpStatus: 503 });
  });

  it.each([["ECONNREFUSED"], ["ECONNABORTED"], ["ETIMEDOUT"]])(
    "응답 없음(%s · 네트워크 · 타임아웃) → transient · URL 속 키는 버린다",
    async (code) => {
      const { http } = fakeDart(noResponse(code));
      const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
      expectNoKey(err);
      expect(err).toMatchObject({ kind: "transient", httpStatus: 0 });
    },
  );

  it("HTML 본문(200) → transient", async () => {
    const { http } = fakeDart(body("<!doctype html><html><body>점검 중</body></html>"));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err.kind).toBe("transient");
  });

  it("깨진 JSON 본문 → transient", async () => {
    const { http } = fakeDart(body('{"status":"000","list":[{"rcept_no":'));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err.kind).toBe("transient");
  });

  it("status 가 없는 객체 본문 → transient", async () => {
    const { http } = fakeDart(body({ list: [] }));
    const err = (await catchErr(fetchListPage(http, KEY, q))) as DartApiError;
    expectNoKey(err);
    expect(err.kind).toBe("transient");
  });
});

describe("safeErrorFields — axios 오류는 응답 본문의 status · message 만 (Pitfall 4)", () => {
  function axiosErr(status: number, data: unknown): AxiosError {
    const config = {
      url: `/api/list.json?crtfc_key=${KEY}`,
      params: { crtfc_key: KEY },
      headers: new AxiosHeaders(),
    } as unknown as InternalAxiosRequestConfig;
    return new AxiosError(`Request failed ${config.url}`, "ERR_BAD_RESPONSE", config, {}, {
      status,
      statusText: "",
      headers: {},
      config,
      data,
    });
  }

  it("본문 status · message 를 코드 · 문구로, 종류는 상태 표로", () => {
    const f = safeErrorFields(axiosErr(200, { status: "020", message: "요청 제한을 초과하였습니다." }));
    expect(f).toEqual({ status: 200, code: "020", message: "요청 제한을 초과하였습니다.", kind: "quota" });
    expect(JSON.stringify(f)).not.toContain(KEY);
  });

  it("5xx 는 transient · 키 없음", () => {
    const f = safeErrorFields(axiosErr(502, "<html>bad gateway</html>"));
    expect(f.kind).toBe("transient");
    expect(f.status).toBe(502);
    expect(JSON.stringify(f)).not.toContain(KEY);
  });

  it("DartApiError 는 상태 · 코드 · 문구 · 종류를 그대로", () => {
    const f = safeErrorFields(new DartApiError(200, "020", undefined, "요청 제한을 초과하였습니다."));
    expect(f).toEqual({ status: 200, code: "020", message: "요청 제한을 초과하였습니다.", kind: "quota" });
  });

  it("DartApiError 문구는 200자에서 자른다", () => {
    const e = new DartApiError(200, "900", undefined, "가".repeat(500));
    expect(safeErrorFields(e).message!.length).toBe(200);
  });
});

describe("fetchWatchRows · PageTracker — 100건 넘는 날 (SC-1 · 리서치 확인 5 · Pitfall 5)", () => {
  const P1 = fixture("list-total-150-p1.json");
  const P2 = fixture("list-total-150-p2.json");
  const T0 = Date.UTC(2026, 10, 11, 3, 0, 0);
  const watch = { detailTy: "B001", day: DAY };

  /** total 을 바꿔 줄 수 있는 두 쪽 전송 · fail 이면 그 쪽은 503 */
  function twoPages(opts: { total?: number; failPage?: number } = {}) {
    return fakeDart((p, config) => {
      const no = Number(p.page_no);
      if (opts.failPage === no) return reply(config, 503, "<html>503</html>");
      const src = no === 1 ? P1 : P2;
      return reply(config, 200, { ...src, total_count: opts.total ?? 150 });
    });
  }

  function smallDay(n: number) {
    const list = (P1.list as DartRow[]).slice(0, n);
    return fakeDart((_p, config) =>
      reply(config, 200, { ...P1, total_count: n, total_page: 1, list }),
    );
  }

  it("다시 읽기 주기는 60초", () => {
    expect(FULL_REREAD_MS).toBe(60_000);
  });

  it("total 40 → 1쪽만 · calls 1", async () => {
    const t = new PageTracker();
    const { http, pages } = smallDay(40);
    const r = await fetchWatchRows(http, KEY, watch, t, T0);
    expect(pages).toEqual([1]);
    expect(r.calls).toBe(1);
    expect(r.rows).toHaveLength(40);
  });

  it("total 150 첫 바퀴 → 1 · 2쪽 · calls 2 · 행 150", async () => {
    const t = new PageTracker();
    const { http, pages } = twoPages();
    const r = await fetchWatchRows(http, KEY, watch, t, T0);
    expect(pages).toEqual([1, 2]);
    expect(r.calls).toBe(2);
    expect(r.rows).toHaveLength(150);
    expect(new Set(r.rows.map((x) => x.rcept_no)).size).toBe(150);
  });

  it("같은 total 150 · 10초 뒤 → 1쪽만", async () => {
    const t = new PageTracker();
    await fetchWatchRows(twoPages().http, KEY, watch, t, T0);
    const { http, pages } = twoPages();
    const r = await fetchWatchRows(http, KEY, watch, t, T0 + 10_000);
    expect(pages).toEqual([1]);
    expect(r.calls).toBe(1);
    expect(r.rows).toHaveLength(100);
  });

  it("같은 total 150 · 60초 뒤 → 다시 전 쪽", async () => {
    const t = new PageTracker();
    await fetchWatchRows(twoPages().http, KEY, watch, t, T0);
    await fetchWatchRows(twoPages().http, KEY, watch, t, T0 + 30_000);
    const { http, pages } = twoPages();
    const r = await fetchWatchRows(http, KEY, watch, t, T0 + 60_000);
    expect(pages).toEqual([1, 2]);
    expect(r.calls).toBe(2);
  });

  it("total 이 150 → 151 로 늘면 바로 전 쪽", async () => {
    const t = new PageTracker();
    await fetchWatchRows(twoPages().http, KEY, watch, t, T0);
    const { http, pages } = twoPages({ total: 151 });
    const r = await fetchWatchRows(http, KEY, watch, t, T0 + 5_000);
    expect(pages).toEqual([1, 2]);
    expect(r.calls).toBe(2);
  });

  it("2쪽 호출이 실패하면 오류의 calls 2 · 트래커는 그대로라 다음 바퀴에 다시 전 쪽", async () => {
    const t = new PageTracker();
    await fetchWatchRows(twoPages().http, KEY, watch, t, T0);
    const failing = twoPages({ failPage: 2 });
    const err = (await catchErr(fetchWatchRows(failing.http, KEY, watch, t, T0 + 60_000))) as DartApiError;
    expect(failing.pages).toEqual([1, 2]);
    expectNoKey(err);
    expect(err.kind).toBe("transient");
    expect(err.calls).toBe(2);

    // 실패한 전체 읽기는 기록하지 않는다 — 5초 뒤에도 마지막 성공(T0)에서 60초가 넘었으니 전 쪽
    const { http, pages } = twoPages();
    const r = await fetchWatchRows(http, KEY, watch, t, T0 + 65_000);
    expect(pages).toEqual([1, 2]);
    expect(r.rows).toHaveLength(150);
  });

  it("1쪽 호출이 실패하면 오류의 calls 1", async () => {
    const t = new PageTracker();
    const failing = twoPages({ failPage: 1 });
    const err = (await catchErr(fetchWatchRows(failing.http, KEY, watch, t, T0))) as DartApiError;
    expect(failing.pages).toEqual([1]);
    expect(err.calls).toBe(1);
  });

  it("013(빈 날) → 행 0 · calls 1", async () => {
    const t = new PageTracker();
    const { http, pages } = fakeDart(body(fixture("list-013.json")));
    const r = await fetchWatchRows(http, KEY, watch, t, T0);
    expect(pages).toEqual([1]);
    expect(r).toEqual({ rows: [], calls: 1 });
  });
});
