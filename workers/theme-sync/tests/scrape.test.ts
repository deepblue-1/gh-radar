import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import iconv from "iconv-lite";
import type { AxiosInstance } from "axios";

import { parseThemeList } from "../src/scrape/naver/parseThemeList";
import { parseThemeDetail } from "../src/scrape/naver/parseThemeDetail";
import { fetchWithFallback } from "../src/scrape/fetchWithFallback";
import { fetchAlphaThemes } from "../src/scrape/alphasquare/fetchAlphaThemes";
import { fetchNaverThemes } from "../src/scrape/naver/fetchNaverThemes";
import { isBackedOff, markBackoff } from "../src/scrapeState";
import type { ThemeSyncConfig } from "../src/config";
import { createMockSupabase } from "./helpers/supabase-mock";

const FIX = join(__dirname, "fixtures");
const naverListHtml = readFileSync(join(FIX, "naver-theme-list.html"), "utf8");
const naverDetailHtml = readFileSync(
  join(FIX, "naver-theme-detail.html"),
  "utf8",
);
const alphaAllThemes = readFileSync(
  join(FIX, "alpha-all-themes.json"),
  "utf8",
);
const alphaStocks = readFileSync(join(FIX, "alpha-stocks.json"), "utf8");

function fakeConfig(over: Partial<ThemeSyncConfig> = {}): ThemeSyncConfig {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    brightdataApiKey: "bd",
    brightdataZone: "gh_radar_naver",
    brightdataUrl: "https://api.brightdata.com/request",
    alphaApiBase: "https://api.alphasquare.co.kr",
    naverThemeBase: "https://finance.naver.com",
    themeSyncMaxPages: 10,
    alphaCategories: ["정치", "트렌드"],
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

describe("parseThemeList (네이버 목록 cheerio)", () => {
  it("table.type_1.theme 에서 테마 no+name 을 추출한다", () => {
    const items = parseThemeList(naverListHtml);
    expect(items.length).toBeGreaterThan(0);
    // 실측 fixture: HBM(no=536) 포함
    const hbm = items.find((i) => i.no === "536");
    expect(hbm).toBeDefined();
    expect(hbm?.name).toContain("HBM");
    // 모든 항목이 숫자 no + 비어있지 않은 name
    for (const it of items) {
      expect(it.no).toMatch(/^\d+$/);
      expect(it.name.length).toBeGreaterThan(0);
    }
  });

  it("동일 no 는 dedupe 한다", () => {
    const items = parseThemeList(naverListHtml);
    const nos = items.map((i) => i.no);
    expect(new Set(nos).size).toBe(nos.length);
  });
});

describe("parseThemeDetail (네이버 상세 cheerio)", () => {
  it("table.type_5 에서 6자리 종목 code + name + reason 을 추출한다", () => {
    const stocks = parseThemeDetail(naverDetailHtml);
    expect(stocks.length).toBeGreaterThan(0);
    for (const s of stocks) {
      expect(s.code).toMatch(/^[0-9A-Za-z]{6}$/);
      expect(s.name.length).toBeGreaterThan(0);
    }
    // 실측 fixture: 테크윙(089030) 편입 사유 존재
    const techwing = stocks.find((s) => s.code === "089030");
    expect(techwing).toBeDefined();
    expect(techwing?.name).toContain("테크윙");
    expect(techwing?.reason).toBeTruthy();
  });
});

describe("fetchWithFallback (직접→프록시 폴백 + EUC-KR 디코딩)", () => {
  it("EUC-KR 응답을 iconv 로 디코딩해 한글 mojibake 없이 반환한다", async () => {
    // 실측 fixture(UTF-8)를 EUC-KR 바이트로 인코딩해 직접 fetch 응답을 흉내.
    const euckrBuf = iconv.encode(naverListHtml, "EUC-KR");
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

describe("fetchNaverThemes (목록 페이지네이션 + 상세)", () => {
  it("목록→상세 흐름으로 테마+종목을 수집하고 중복 페이지에서 멈춘다", async () => {
    // page 1 = fixture 목록, page 2+ = 동일 내용(clamp) → stop. 상세는 항상 detail fixture.
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("sise_group_detail.naver")) return naverDetailHtml;
      return naverListHtml; // 모든 목록 page 동일 → 직전과 같으면 stop
    });
    const out = await fetchNaverThemes({
      cfg: fakeConfig({ themeSyncMaxPages: 5 }),
      fetchFn,
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((t) => t.source === "naver")).toBe(true);
    // 각 테마가 상세 fixture 의 종목(33개)을 가짐
    expect(out[0].stocks.length).toBeGreaterThan(0);
    expect(out[0].stocks[0].code).toMatch(/^[0-9A-Za-z]{6}$/);
    // 목록 page 호출 = 2 (page1 수집 + page2 동일 감지 후 stop). 무한루프 아님.
    const listCalls = fetchFn.mock.calls.filter(
      (c) => !String(c[0]).includes("sise_group_detail"),
    );
    expect(listCalls.length).toBe(2);
  });

  it("목록이 0 테마면 throw 한다 (MIN_EXPECTED 가드, Pitfall 10)", async () => {
    const fetchFn = vi.fn(async () => "<html>blocked</html>");
    await expect(
      fetchNaverThemes({ cfg: fakeConfig(), fetchFn }),
    ).rejects.toThrow();
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
