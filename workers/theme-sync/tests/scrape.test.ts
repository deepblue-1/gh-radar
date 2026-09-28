import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import iconv from "iconv-lite";
import type { AxiosInstance } from "axios";

import { parseThemeList } from "../src/scrape/naver/parseThemeList";
import { parseThemeDetail } from "../src/scrape/naver/parseThemeDetail";
import { fetchWithFallback } from "../src/scrape/fetchWithFallback";
import { fetchAlphaThemes } from "../src/scrape/alphasquare/fetchAlphaThemes";
import {
  fetchNaverThemes,
  NAVER_PAGE_SIZE,
} from "../src/scrape/naver/fetchNaverThemes";
import { isBackedOff, markBackoff } from "../src/scrapeState";
import { ThemeScrapeValidationError } from "../src/proxy/errors";
import { logger } from "../src/logger";
import type { ThemeSyncConfig } from "../src/config";
import { createMockSupabase } from "./helpers/supabase-mock";

const FIX = join(__dirname, "fixtures");
// 실측 fixture (2026-09-27 m.stock.naver.com/api/stocks/theme 응답, 필요 필드만 trim).
const naverListJson = readFileSync(join(FIX, "naver-theme-list.json"), "utf8");
const naverDetailJson = readFileSync(
  join(FIX, "naver-theme-detail.json"),
  "utf8",
);
const alphaAllThemes = readFileSync(
  join(FIX, "alpha-all-themes.json"),
  "utf8",
);
const alphaStocks = readFileSync(join(FIX, "alpha-stocks.json"), "utf8");

/**
 * 2026-09-11 회귀 재현 — 레거시 finance.naver.com 테마 URL 이 302 로 보내는
 * stock.naver.com Next.js SPA 셸 (테마 테이블/JSON 없음). axios 는 리다이렉트를 따라가
 * 이 200 HTML 을 그대로 파서에 넘겼다.
 */
const SPA_SHELL_HTML =
  '<!DOCTYPE html><html lang="ko"><head><title>테마 : 네이버페이 증권</title></head>' +
  '<body><script>self.__next_f.push([1,"0:[\\"$\\",\\"html\\"]"])</script></body></html>';

function fakeConfig(over: Partial<ThemeSyncConfig> = {}): ThemeSyncConfig {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    brightdataApiKey: "bd",
    brightdataZone: "gh_radar_naver",
    brightdataUrl: "https://api.brightdata.com/request",
    alphaApiBase: "https://api.alphasquare.co.kr",
    naverStockApiBase: "https://m.stock.naver.com",
    themeSyncMaxPages: 10,
    alphaCategories: ["정치", "트렌드"],
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

/** 6자리 종목코드 생성 (테마별로 겹치지 않게). */
function codeOf(themeNo: number, i: number): string {
  return String(themeNo * 1000 + i).padStart(6, "0");
}

/**
 * 가짜 네이버 증권 테마 API — page/pageSize 를 실제 API 처럼 해석해 JSON 반환.
 * themes: [{no, name, stockCount}]. clampList=true 면 목록이 page 무관 항상 1페이지(Pitfall 6).
 */
function fakeNaverApi(
  themes: Array<{ no: number; name: string; stockCount: number }>,
  opts: { clampList?: boolean; listTotalCount?: number } = {},
) {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    const size = Number(u.searchParams.get("pageSize"));
    const m = u.pathname.match(/^\/api\/stocks\/theme(?:\/(\d+))?$/);
    if (!m) throw new Error(`unexpected url ${url}`);
    if (!m[1]) {
      const start = opts.clampList ? 0 : (page - 1) * size;
      return JSON.stringify({
        groups: themes
          .slice(start, start + size)
          .map((t) => ({ no: t.no, name: t.name, totalCount: t.stockCount })),
        totalCount: opts.listTotalCount ?? themes.length,
        page,
        pageSize: size,
      });
    }
    const no = Number(m[1]);
    const t = themes.find((x) => x.no === no);
    if (!t) throw new Error(`unknown theme ${no}`);
    const all = Array.from({ length: t.stockCount }, (_, i) => codeOf(no, i));
    const slice = all.slice((page - 1) * size, page * size);
    return JSON.stringify({
      stocks: slice.map((c) => ({ itemCode: c, stockName: `종목${c}` })),
      themeItemInfoMap: Object.fromEntries(slice.map((c) => [c, `사유 ${c}`])),
      totalCount: t.stockCount,
      page,
      pageSize: size,
    });
  });
}

function themesOf(n: number, stockCount = 3) {
  return Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    name: `테마${i + 1}`,
    stockCount,
  }));
}

function listCalls(fetchFn: ReturnType<typeof vi.fn>): string[] {
  return fetchFn.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => /\/api\/stocks\/theme\?/.test(u));
}

function detailCalls(fetchFn: ReturnType<typeof vi.fn>, no?: number): string[] {
  return fetchFn.mock.calls
    .map((c) => String(c[0]))
    .filter((u) =>
      no === undefined
        ? /\/api\/stocks\/theme\/\d+\?/.test(u)
        : u.includes(`/api/stocks/theme/${no}?`),
    );
}

describe("parseThemeList (네이버 증권 테마 목록 JSON)", () => {
  it("groups 에서 테마 no+name 과 totalCount 를 추출한다", () => {
    const { items, totalCount } = parseThemeList(naverListJson);
    expect(items.length).toBe(100);
    expect(totalCount).toBe(264);
    // 실측 fixture: HBM(no=536) 포함 — 레거시 sise_group_detail no 와 동일 ID 체계
    const hbm = items.find((i) => i.no === "536");
    expect(hbm?.name).toContain("HBM");
    for (const it of items) {
      expect(it.no).toMatch(/^\d+$/);
      expect(it.name.length).toBeGreaterThan(0);
    }
  });

  it("동일 no dedupe, 숫자 아닌 no·빈 이름은 버린다", () => {
    const body = JSON.stringify({
      groups: [
        { no: 1, name: "A" },
        { no: "1", name: "A 중복" },
        { no: "x9", name: "비정상 no" },
        { no: 2, name: "  " },
        { no: 3, name: " C " },
      ],
      totalCount: 5,
    });
    const { items } = parseThemeList(body);
    expect(items).toEqual([
      { no: "1", name: "A" },
      { no: "3", name: "C" },
    ]);
  });

  it("레거시 URL 302 착지 SPA HTML 이면 '0개' 가 아니라 검증 실패로 던진다 (2026-09-11 회귀)", () => {
    expect(() => parseThemeList(SPA_SHELL_HTML)).toThrow(
      ThemeScrapeValidationError,
    );
    expect(() => parseThemeList(SPA_SHELL_HTML)).toThrow(/응답 검증 실패/);
  });

  it("JSON 이지만 스키마가 다르면(API 변경) 검증 실패로 던진다", () => {
    expect(() => parseThemeList('{"themes":[]}')).toThrow(
      ThemeScrapeValidationError,
    );
  });
});

describe("parseThemeDetail (네이버 증권 테마 상세 JSON)", () => {
  it("stocks 의 6자리 code + name 과 themeItemInfoMap 편입 사유를 추출한다", () => {
    const { stocks, totalCount } = parseThemeDetail(naverDetailJson);
    expect(totalCount).toBe(34);
    expect(stocks.length).toBe(34);
    for (const s of stocks) {
      expect(s.code).toMatch(/^[0-9A-Za-z]{6}$/);
      expect(s.name.length).toBeGreaterThan(0);
    }
    // 실측 fixture: 테크윙(089030) 편입 사유 존재 (레거시 p.info_txt 대응)
    const techwing = stocks.find((s) => s.code === "089030");
    expect(techwing?.name).toContain("테크윙");
    expect(techwing?.reason).toBeTruthy();
  });

  it("themeItemInfoMap 이 없거나 문자열이 아니면 reason=null, 비정상 code 는 버리고 dedupe 한다", () => {
    const body = JSON.stringify({
      stocks: [
        { itemCode: "005930", stockName: "삼성전자" },
        { itemCode: "005930", stockName: "삼성전자 중복" },
        { itemCode: "12345", stockName: "5자리" },
        { itemCode: "000660", stockName: "SK하이닉스" },
      ],
      themeItemInfoMap: { "005930": "  ", "000660": 42 },
      totalCount: 4,
    });
    const { stocks } = parseThemeDetail(body);
    expect(stocks).toEqual([
      { code: "005930", name: "삼성전자", reason: null },
      { code: "000660", name: "SK하이닉스", reason: null },
    ]);
    const noMap = parseThemeDetail(
      JSON.stringify({
        stocks: [{ itemCode: "005930", stockName: "삼성전자" }],
        totalCount: 1,
      }),
    );
    expect(noMap.stocks[0].reason).toBeNull();
  });

  it("레거시 상세 URL 302 착지 SPA HTML 이면 검증 실패로 던진다", () => {
    expect(() => parseThemeDetail(SPA_SHELL_HTML)).toThrow(
      ThemeScrapeValidationError,
    );
  });
});

describe("fetchWithFallback (직접→프록시 폴백 + EUC-KR 디코딩)", () => {
  it("EUC-KR 응답을 iconv 로 디코딩해 한글 mojibake 없이 반환한다", async () => {
    // 한글 HTML 을 EUC-KR 바이트로 인코딩해 직접 fetch 응답을 흉내.
    const euckrBuf = iconv.encode(
      "<html><body><td>반도체 장비</td><td>HBM(고대역폭메모리)</td></body></html>",
      "EUC-KR",
    );
    const direct = {
      get: vi.fn().mockResolvedValue({ data: euckrBuf, status: 200 }),
    } as unknown as AxiosInstance;
    const proxy = { post: vi.fn() } as unknown as AxiosInstance;

    const html = await fetchWithFallback(
      { cfg: fakeConfig(), proxy, direct },
      "https://finance.naver.com/sise/theme.naver?page=1",
      "euc-kr",
    );
    // 디코딩 검증 — 한글 테마명 무손상, mojibake(������) 없음
    expect(html).toContain("반도체");
    expect(html).not.toContain("�");
    // 프록시는 호출되지 않음(직접 fetch 성공)
    expect((proxy.post as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("직접 fetch 403 시 fetchViaProxy 로 폴백한다", async () => {
    const err403 = { response: { status: 403 } };
    const direct = {
      get: vi.fn().mockRejectedValue(err403),
    } as unknown as AxiosInstance;
    // 프록시는 raw body(JSON 문자열) 반환
    const proxy = {
      post: vi
        .fn()
        .mockResolvedValue({ data: '{"data":[]}' }),
    } as unknown as AxiosInstance;

    const body = await fetchWithFallback(
      { cfg: fakeConfig(), proxy, direct },
      "https://api.alphasquare.co.kr/theme/v2/all-themes",
      "utf-8",
    );
    expect(body).toBe('{"data":[]}');
    // 직접 fetch 1회 실패 → 프록시 1회 호출(폴백)
    expect((direct.get as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect((proxy.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("직접 fetch 429 (rate limit) 도 프록시로 폴백한다", async () => {
    const err429 = { response: { status: 429 } };
    const direct = {
      get: vi.fn().mockRejectedValue(err429),
    } as unknown as AxiosInstance;
    const proxy = {
      post: vi.fn().mockResolvedValue({ data: "ok" }),
    } as unknown as AxiosInstance;

    const body = await fetchWithFallback(
      { cfg: fakeConfig(), proxy, direct },
      "https://finance.naver.com/sise/theme.naver?page=1",
      "utf-8",
    );
    expect(body).toBe("ok");
    expect((proxy.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("차단이 아닌 에러(500)는 폴백하지 않고 그대로 던진다", async () => {
    const err500 = { response: { status: 500 } };
    const direct = {
      get: vi.fn().mockRejectedValue(err500),
    } as unknown as AxiosInstance;
    const proxy = { post: vi.fn() } as unknown as AxiosInstance;

    await expect(
      fetchWithFallback(
        { cfg: fakeConfig(), proxy, direct },
        "https://finance.naver.com/sise/theme.naver?page=1",
        "utf-8",
      ),
    ).rejects.toBeDefined();
    expect((proxy.post as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  describe("리다이렉트 착지 진단 (2026-09-11 회귀 — 302 → stock.naver.com SPA)", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => warnSpy.mockRestore());

    it("직접 fetch 가 다른 경로로 리다이렉트되면 착지 URL 을 warn 한다 (동작은 그대로)", async () => {
      const direct = {
        get: vi.fn().mockResolvedValue({
          data: SPA_SHELL_HTML,
          status: 200,
          request: {
            res: { responseUrl: "https://stock.naver.com/market/stock/kr/theme" },
          },
        }),
      } as unknown as AxiosInstance;
      const proxy = { post: vi.fn() } as unknown as AxiosInstance;

      const body = await fetchWithFallback(
        { cfg: fakeConfig(), proxy, direct },
        "https://finance.naver.com/sise/theme.naver?page=1",
        "utf-8",
      );
      expect(body).toBe(SPA_SHELL_HTML);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://finance.naver.com/sise/theme.naver?page=1",
          finalUrl: "https://stock.naver.com/market/stock/kr/theme",
        }),
        expect.stringContaining("redirected"),
      );
      expect((proxy.post as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it("리다이렉트 없이 같은 경로면 warn 하지 않는다", async () => {
      const url = "https://m.stock.naver.com/api/stocks/theme?page=1&pageSize=100";
      const direct = {
        get: vi.fn().mockResolvedValue({
          data: naverListJson,
          status: 200,
          request: { res: { responseUrl: url } },
        }),
      } as unknown as AxiosInstance;
      const proxy = { post: vi.fn() } as unknown as AxiosInstance;

      await fetchWithFallback({ cfg: fakeConfig(), proxy, direct }, url, "utf-8");
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe("fetchAlphaThemes (알파스퀘어 JSON API)", () => {
  it("화이트리스트 카테고리(정치)만 수집하고 반도체는 제외한다", async () => {
    // all-themes → 정치+반도체, stocks → 이재명 종목(KR+is_alive)
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/all-themes")) return alphaAllThemes;
      return alphaStocks;
    });
    const out = await fetchAlphaThemes({
      cfg: fakeConfig({ alphaCategories: ["정치"] }),
      fetchFn,
    });
    // 정치 카테고리 39테마만 (반도체 2테마 제외)
    expect(out.length).toBe(39);
    expect(out.every((t) => t.source === "alphasquare")).toBe(true);
    // 이재명 테마 존재
    const lee = out.find((t) => t.name === "이재명");
    expect(lee).toBeDefined();
    // KR + is_alive 종목만, 6자리 code
    expect(lee!.stocks.length).toBeGreaterThan(0);
    for (const s of lee!.stocks) {
      expect(s.code).toMatch(/^[0-9A-Za-z]{6}$/);
    }
  });

  it("반도체 카테고리를 화이트리스트에서 제외하면 정치만 남는다 (부분 캐싱 5원칙 #5)", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/all-themes")) return alphaAllThemes;
      return alphaStocks;
    });
    const out = await fetchAlphaThemes({
      cfg: fakeConfig({ alphaCategories: ["정치"] }),
      fetchFn,
    });
    // 반도체 테마명(예: SK하이닉스류 카테고리)이 결과에 없음 — 정치만
    const names = out.map((t) => t.name);
    expect(names).toContain("이재명");
  });

  it("비정상 JSON 응답이면 ThemeScrapeValidationError 를 던진다 (Pitfall 10)", async () => {
    const fetchFn = vi.fn(async () => "<html>blocked</html>");
    await expect(
      fetchAlphaThemes({ cfg: fakeConfig(), fetchFn }),
    ).rejects.toThrow(/검증 실패/);
  });
});

describe("fetchNaverThemes (네이버 증권 JSON API — 목록·상세 페이지네이션)", () => {
  it("실측 fixture 로 목록→상세를 수집한다 (API URL · 편입 사유 · clamp 정지)", async () => {
    // 목록은 page 무관 동일 fixture(100개, totalCount 264) → page 2 에서 clamp 감지 후 stop.
    const fetchFn = vi.fn(async (url: string) => {
      if (/\/api\/stocks\/theme\/\d+\?/.test(url)) return naverDetailJson;
      return naverListJson;
    });
    const out = await fetchNaverThemes({
      cfg: fakeConfig({ themeSyncMaxPages: 5 }),
      fetchFn,
    });
    expect(out.length).toBe(100);
    expect(out.every((t) => t.source === "naver")).toBe(true);
    const hbm = out.find((t) => t.name.includes("HBM"));
    expect(hbm?.stocks.length).toBe(34);
    expect(hbm?.stocks.find((s) => s.code === "089030")?.reason).toBeTruthy();

    const lists = listCalls(fetchFn);
    expect(lists).toEqual([
      `https://m.stock.naver.com/api/stocks/theme?page=1&pageSize=${NAVER_PAGE_SIZE}`,
      `https://m.stock.naver.com/api/stocks/theme?page=2&pageSize=${NAVER_PAGE_SIZE}`,
    ]);
    expect(detailCalls(fetchFn, 536)).toEqual([
      `https://m.stock.naver.com/api/stocks/theme/536?page=1&pageSize=${NAVER_PAGE_SIZE}`,
    ]);
    // 레거시 finance.naver.com 은 더 이상 호출하지 않는다.
    expect(
      fetchFn.mock.calls.some((c) => String(c[0]).includes("finance.naver.com")),
    ).toBe(false);
  });

  it("현재 네이버 표면(레거시 URL=302 착지 SPA 셸, JSON API=정상)에서 테마를 수집한다 (2026-09-11 회귀 재현)", async () => {
    // axios 는 302 를 따라가므로 레거시 URL 은 200 SPA HTML 로 보인다 — 옛 파서는 여기서 0개.
    const api = fakeNaverApi([
      { no: 536, name: "HBM(고대역폭메모리)", stockCount: 34 },
      { no: 64, name: "2차전지", stockCount: 143 },
    ]);
    const fetchFn = vi.fn(async (url: string) =>
      url.startsWith("https://finance.naver.com/") ? SPA_SHELL_HTML : api(url),
    );
    const out = await fetchNaverThemes({ cfg: fakeConfig(), fetchFn });
    expect(out.map((t) => [t.name, t.stocks.length])).toEqual([
      ["HBM(고대역폭메모리)", 34],
      ["2차전지", 143],
    ]);
  });

  it.each([
    [99, 1],
    [100, 1],
    [101, 2],
    [264, 3],
  ])(
    "목록 totalCount=%i → 목록 호출 %i 회 (다 모이면 다음 page 를 부르지 않음)",
    async (n, expectedListCalls) => {
      const fetchFn = fakeNaverApi(themesOf(n, 1));
      const out = await fetchNaverThemes({ cfg: fakeConfig(), fetchFn });
      expect(out.length).toBe(n);
      expect(listCalls(fetchFn).length).toBe(expectedListCalls);
    },
  );

  it.each([
    [99, 1],
    [100, 1],
    [101, 2],
    [143, 2], // 실측: 2차전지(no=64) 143종목 — 1페이지만 읽으면 43종목이 retire 된다
  ])(
    "상세 totalCount=%i → 전 종목 수집, 상세 호출 %i 회",
    async (n, expectedDetailCalls) => {
      const fetchFn = fakeNaverApi([{ no: 64, name: "2차전지", stockCount: n }]);
      const out = await fetchNaverThemes({ cfg: fakeConfig(), fetchFn });
      expect(out).toHaveLength(1);
      const codes = out[0].stocks.map((s) => s.code);
      expect(new Set(codes).size).toBe(n);
      expect(codes).toContain(codeOf(64, n - 1)); // 마지막 종목까지
      expect(out[0].stocks.every((s) => s.reason?.startsWith("사유 "))).toBe(true);
      expect(detailCalls(fetchFn, 64).length).toBe(expectedDetailCalls);
    },
  );

  it("목록이 page 무관 같은 내용(clamp)이면 무한루프 없이 멈춘다 (Pitfall 6)", async () => {
    const fetchFn = fakeNaverApi(themesOf(3), {
      clampList: true,
      listTotalCount: 500,
    });
    const out = await fetchNaverThemes({
      cfg: fakeConfig({ themeSyncMaxPages: 10 }),
      fetchFn,
    });
    expect(out.length).toBe(3);
    expect(listCalls(fetchFn).length).toBe(2);
  });

  it("종목 0개 테마는 skip 하고 나머지는 수집한다", async () => {
    const fetchFn = fakeNaverApi([
      { no: 1, name: "빈 테마", stockCount: 0 },
      { no: 2, name: "정상 테마", stockCount: 2 },
    ]);
    const out = await fetchNaverThemes({ cfg: fakeConfig(), fetchFn });
    expect(out.map((t) => t.name)).toEqual(["정상 테마"]);
  });

  it("상세 totalCount 가 실제보다 크고 page 무관 같은 종목(clamp)이면 새 code 없는 page 에서 멈춘다", async () => {
    const api = fakeNaverApi([{ no: 7, name: "과대 totalCount", stockCount: 1 }]);
    const detail = JSON.stringify({
      stocks: [{ itemCode: "005930", stockName: "삼성전자" }],
      themeItemInfoMap: { "005930": "사유" },
      totalCount: 50,
    });
    const fetchFn = vi.fn(async (url: string) =>
      url.includes("/api/stocks/theme/7?") ? detail : api(url),
    );
    const out = await fetchNaverThemes({
      cfg: fakeConfig({ themeSyncMaxPages: 10 }),
      fetchFn,
    });
    expect(out[0].stocks.map((s) => s.code)).toEqual(["005930"]);
    // maxPages(10) 까지 두드리지 않고 2회(1페이지 + 새 code 없음 감지)에서 stop.
    expect(detailCalls(fetchFn, 7).length).toBe(2);
  });

  it("상세 1건 응답 검증 실패는 그 테마만 skip — source 전체를 실패시키지 않는다", async () => {
    const api = fakeNaverApi([
      { no: 1, name: "삭제된 테마", stockCount: 2 },
      { no: 2, name: "정상 테마", stockCount: 2 },
    ]);
    const fetchFn = vi.fn(async (url: string) =>
      url.includes("/api/stocks/theme/1?") ? '{"code":"NOT_FOUND"}' : api(url),
    );
    const out = await fetchNaverThemes({ cfg: fakeConfig(), fetchFn });
    expect(out.map((t) => t.name)).toEqual(["정상 테마"]);
  });

  it("상세가 전부 응답 검증 실패면 API 변경으로 보고 throw 한다 (Pitfall 10)", async () => {
    const api = fakeNaverApi(themesOf(3));
    const fetchFn = vi.fn(async (url: string) =>
      /\/api\/stocks\/theme\/\d+\?/.test(url) ? SPA_SHELL_HTML : api(url),
    );
    await expect(
      fetchNaverThemes({ cfg: fakeConfig(), fetchFn }),
    ).rejects.toThrow(/전부 응답 검증 실패/);
  });

  it("목록이 0 테마면 throw 한다 (MIN_EXPECTED 가드, Pitfall 10)", async () => {
    const fetchFn = fakeNaverApi([]);
    await expect(
      fetchNaverThemes({ cfg: fakeConfig(), fetchFn }),
    ).rejects.toThrow(/0개/);
  });

  it("목록 응답이 SPA HTML(레거시 302 착지)이면 ThemeScrapeValidationError (2026-09-11 회귀)", async () => {
    const fetchFn = vi.fn(async () => SPA_SHELL_HTML);
    await expect(
      fetchNaverThemes({ cfg: fakeConfig(), fetchFn }),
    ).rejects.toThrow(ThemeScrapeValidationError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("scrapeState (24h backoff — 5원칙 #4)", () => {
  beforeEach(() => vi.useRealTimers());

  it("markBackoff 가 now+24h epoch 를 api_usage 에 저장한다", async () => {
    const sb = createMockSupabase();
    const now = new Date("2026-06-09T07:00:00.000Z");
    const until = await markBackoff(sb as never, "naver", now);
    // until = now + 24h
    expect(new Date(until).getTime()).toBe(now.getTime() + 24 * 3600_000);
    // api_usage 에 backoff 라벨 upsert 호출
    expect(sb._chains.api_usage.upsert).toHaveBeenCalled();
    const payload = (sb._chains.api_usage.upsert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(payload.service).toBe("theme_naver_backoff");
    expect(payload.count).toBe(now.getTime() + 24 * 3600_000);
  });

  it("isBackedOff 는 backoff_until 미경과면 true, 경과면 false 를 반환한다", async () => {
    const now = new Date("2026-06-09T07:00:00.000Z");
    const futureMs = now.getTime() + 5 * 3600_000; // 5h 남음 → backoff 중
    const sbFuture = createMockSupabase({
      api_usage: [{ count: futureMs, usage_date: "2026-06-09" }],
    });
    expect(await isBackedOff(sbFuture as never, "naver", now)).toBe(true);

    // 과거(경과) → false
    const pastMs = now.getTime() - 3600_000;
    const sbPast = createMockSupabase({
      api_usage: [{ count: pastMs, usage_date: "2026-06-08" }],
    });
    expect(await isBackedOff(sbPast as never, "naver", now)).toBe(false);
  });

  it("backoff 기록이 없으면 false (정상 cycle 진행)", async () => {
    const sb = createMockSupabase();
    // maybeSingle 기본 null
    expect(await isBackedOff(sb as never, "alpha")).toBe(false);
  });
});
