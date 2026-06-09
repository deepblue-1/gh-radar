import { describe, it, expect, vi } from "vitest";
import {
  computeContentHash,
  shouldSkipWrite,
  storeHash,
  hashToInt,
} from "../src/pipeline/contentHash";
import { upsertThemes } from "../src/pipeline/upsertThemes";
import { mergeThemes, type MergedTheme } from "../src/merge/mergeThemes";
import { runThemeSyncCycle } from "../src/index";
import type { ThemeScrape } from "../src/scrape/types";
import type { ThemeSyncConfig } from "../src/config";
import type { AxiosInstance } from "axios";
import { createMockSupabase } from "./helpers/supabase-mock";

function cycleConfig(over: Partial<ThemeSyncConfig> = {}): ThemeSyncConfig {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    brightdataApiKey: "bd",
    brightdataZone: "gh_radar_naver",
    brightdataUrl: "https://api.brightdata.com/request",
    alphaApiBase: "https://api.alphasquare.co.kr",
    naverThemeBase: "https://finance.naver.com",
    themeSyncMaxPages: 10,
    alphaCategories: ["정치"],
    anthropicApiKey: "",
    classifyEnabled: false,
    classifyConcurrency: 5,
    classifyModel: "claude-haiku-4-5",
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

function theme(
  normKey: string,
  name: string,
  codes: string[],
): MergedTheme {
  return {
    normKey,
    name,
    description: null,
    sources: ["naver"],
    stocks: codes.map((code) => ({
      code,
      source: "naver" as const,
      reason: null,
    })),
  };
}

describe("contentHash (SHA256 변경 감지 — D-09, 5원칙 #2)", () => {
  it("동일 병합 결과는 동일 해시, 순서가 달라도 동일 해시", () => {
    const a = [theme("ai", "AI", ["005930", "000660"])];
    const b = [theme("ai", "AI", ["000660", "005930"])]; // code 순서 반대
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it("종목이 바뀌면 해시가 달라진다", () => {
    const a = [theme("ai", "AI", ["005930"])];
    const b = [theme("ai", "AI", ["005930", "000660"])];
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it("직전 저장 해시와 동일하면 shouldSkipWrite=true (write skip)", async () => {
    const themes = [theme("ai", "AI", ["005930"])];
    const hash = computeContentHash(themes);
    // api_usage 에 직전 해시(정수 다이제스트) 저장돼 있다고 가정
    const sb = createMockSupabase({
      api_usage: [{ count: hashToInt(hash) }],
    });
    expect(await shouldSkipWrite(sb as never, hash)).toBe(true);
  });

  it("직전 해시가 다르면 shouldSkipWrite=false (write 진행)", async () => {
    const themes = [theme("ai", "AI", ["005930"])];
    const hash = computeContentHash(themes);
    const sb = createMockSupabase({
      api_usage: [{ count: hashToInt(hash) + 1 }],
    });
    expect(await shouldSkipWrite(sb as never, hash)).toBe(false);
  });

  it("직전 해시가 없으면 shouldSkipWrite=false (최초 cycle)", async () => {
    const sb = createMockSupabase(); // api_usage 빈 store
    const hash = computeContentHash([theme("ai", "AI", ["005930"])]);
    expect(await shouldSkipWrite(sb as never, hash)).toBe(false);
  });

  it("storeHash 는 정수 다이제스트로 api_usage upsert 한다", async () => {
    const sb = createMockSupabase();
    const hash = computeContentHash([theme("ai", "AI", ["005930"])]);
    await storeHash(sb as never, hash, new Date("2026-06-09T07:00:00Z"));
    expect(sb._chains.api_usage.upsert).toHaveBeenCalled();
    const payload = (sb._chains.api_usage.upsert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(payload.service).toBe("theme_content_hash");
    expect(payload.count).toBe(hashToInt(hash));
  });
});

describe("upsertThemes (FK skip + 청크 + 이력 + MIN_EXPECTED — Pitfall 5/10)", () => {
  it("stocks 마스터에 없는 종목 code 는 per-stock skip 한다 (FK, Pitfall 5)", async () => {
    const sb = createMockSupabase();
    // stocks 존재 확인: 005930 만 존재, 999999 미존재
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    // themes: norm_key 조회 없음(신규) → insert 후 id 반환
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "theme-1" },
      error: null,
    });
    // theme_stocks: retire select(active 없음) + upsert 성공
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await upsertThemes(sb as never, [
      theme("반도체", "반도체", ["005930", "999999"]),
    ]);

    expect(res.skippedMissingStocks).toBe(1); // 999999 skip
    // theme_stocks upsert 는 유효 종목(005930)만 포함
    const upsertArg = (
      sb._chains.theme_stocks.upsert as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(upsertArg).toHaveLength(1);
    expect(upsertArg[0].stock_code).toBe("005930");
    expect(upsertArg[0].effective_to).toBeNull();
    expect(upsertArg[0].source).toBe("naver");
  });

  it("기존 시스템 테마는 INSERT 대신 sources append UPDATE 한다", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    // norm_key 조회 → 기존 테마 발견
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: { id: "existing-1" },
      error: null,
    });
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await upsertThemes(sb as never, [
      theme("반도체", "반도체", ["005930"]),
    ]);
    expect(res.themesUpserted).toBe(1);
    // insert 가 아닌 update 호출(기존 테마)
    expect(sb._chains.themes.update).toHaveBeenCalled();
  });

  it("이번 cycle 에서 빠진 active 종목은 effective_to=now 로 soft-제외한다 (이력, D-03)", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: { id: "theme-1" },
      error: null,
    });
    // 기존 active 종목: 005930(유지) + 000660(이번 cycle 에 없음 → retire)
    sb.from("theme_stocks").is.mockResolvedValue({
      data: [{ stock_code: "005930" }, { stock_code: "000660" }],
      error: null,
    });
    // retire update().eq().in() 종결
    sb.from("theme_stocks").in.mockResolvedValue({ data: null, error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await upsertThemes(sb as never, [
      theme("반도체", "반도체", ["005930"]), // 000660 빠짐
    ]);
    expect(res.stockLinksRetired).toBe(1); // 000660 retired
    expect(sb._chains.theme_stocks.update).toHaveBeenCalledWith({
      effective_to: expect.any(String),
    });
  });

  it("병합 테마가 0개면 throw 한다 (MIN_EXPECTED 가드, Pitfall 10)", async () => {
    const sb = createMockSupabase();
    await expect(upsertThemes(sb as never, [])).rejects.toThrow(
      /partial scrape/,
    );
  });
});

describe("runThemeSyncCycle (cycle 결선 smoke — 5원칙 가드)", () => {
  const naverScrape: ThemeScrape = {
    name: "반도체",
    description: null,
    aliases: [],
    stocks: [{ code: "005930", reason: "메모리 반도체" }],
    source: "naver",
  };
  const alphaScrape: ThemeScrape = {
    name: "이재명",
    description: "정치 테마",
    aliases: [],
    stocks: [{ code: "000660", reason: null }],
    source: "alphasquare",
  };

  // api_usage 는 isBackedOff(service=theme_*_backoff) 와 shouldSkipWrite(service=theme_content_hash)가
  // 둘 다 .order().limit() 종결 → 서비스 라벨에 따라 다른 응답을 줘야 한다. 가장 최근 eq("service",X)
  // 호출을 읽어 분기(mock 은 eq 인자를 무시하므로 테스트가 직접 service 별 응답을 구성).
  function setApiUsageResponder(
    sb: ReturnType<typeof createMockSupabase>,
    byService: Record<string, unknown[]>,
  ) {
    const chain = sb.from("api_usage");
    chain.limit.mockImplementation(() => {
      const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls;
      const svcCall = [...eqCalls]
        .reverse()
        .find((c) => c[0] === "service");
      const service = svcCall?.[1] as string | undefined;
      const data = service ? (byService[service] ?? []) : [];
      return Promise.resolve({ data, error: null });
    });
  }

  function cycleSupabase() {
    const sb = createMockSupabase();
    // 기본: 백오프 없음 + 해시 불일치(빈 배열) → fetch 진행 + write 진행.
    setApiUsageResponder(sb, {});
    sb.from("api_usage").upsert.mockResolvedValue({ data: null, error: null });
    // stocks 존재 확인 — 두 종목 모두 존재.
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }, { code: "000660" }],
      error: null,
    });
    // themes: 신규(norm_key 없음) → insert id 반환.
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "theme-x" },
      error: null,
    });
    // theme_stocks: active 없음 + upsert 성공.
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });
    return sb;
  }

  it("스크랩→병합→upsert 를 결선하고 api_usage 카운트를 증가시킨다 (5원칙 #1)", async () => {
    const sb = cycleSupabase();
    const proxy = { post: vi.fn() } as unknown as AxiosInstance;
    const naver = vi.fn().mockResolvedValue([naverScrape]);
    const alpha = vi.fn().mockResolvedValue([alphaScrape]);

    const summary = await runThemeSyncCycle({
      config: cycleConfig(),
      supabase: sb as never,
      proxy,
      fetchers: { naver, alpha },
    });

    // 두 소스 fetch 됨
    expect(naver).toHaveBeenCalled();
    expect(alpha).toHaveBeenCalled();
    // upsert 호출(themes insert + theme_stocks upsert)
    expect(sb._chains.themes.insert).toHaveBeenCalled();
    expect(sb._chains.theme_stocks.upsert).toHaveBeenCalled();
    // 5원칙 #1 — api_usage incr RPC 호출(소스별 1회 = 2회)
    expect(sb.rpc).toHaveBeenCalledWith(
      "incr_api_usage",
      expect.objectContaining({ p_amount: 1 }),
    );
    expect(summary.scrapedThemes).toBe(2);
    expect(summary.skippedWrite).toBe(false);
    expect(summary.themesUpserted).toBeGreaterThan(0);
  });

  it("콘텐츠 해시가 동일하면 DB write 를 skip 한다 (5원칙 #2)", async () => {
    const sb = cycleSupabase();
    // 직전 해시 = 이번 cycle 이 실제 병합으로 산출할 해시 → shouldSkipWrite true.
    // 단 backoff 서비스는 빈 배열(백오프 없음) 유지 — service 별 분기로 isBackedOff 오작동 방지.
    const expectedHash = computeContentHash(
      mergeThemes([naverScrape, alphaScrape]),
    );
    setApiUsageResponder(sb, {
      theme_content_hash: [{ count: hashToInt(expectedHash) }],
    });

    const summary = await runThemeSyncCycle({
      config: cycleConfig(),
      supabase: sb as never,
      proxy: { post: vi.fn() } as unknown as AxiosInstance,
      fetchers: {
        naver: vi.fn().mockResolvedValue([naverScrape]),
        alpha: vi.fn().mockResolvedValue([alphaScrape]),
      },
    });

    expect(summary.skippedWrite).toBe(true);
    // write skip — themes insert 미호출
    expect(sb._chains.themes.insert).not.toHaveBeenCalled();
  });

  it("source 가 24h backoff 중이면 fetch 를 skip 한다 (5원칙 #4)", async () => {
    const sb = cycleSupabase();
    const now = new Date("2026-06-09T07:00:00Z");
    // 양 소스 backoff 서비스에 미래 backoff_until → fetch 게이트.
    const futureMs = now.getTime() + 5 * 3600_000;
    setApiUsageResponder(sb, {
      theme_naver_backoff: [{ count: futureMs }],
      theme_alpha_backoff: [{ count: futureMs }],
    });
    const naver = vi.fn();
    const alpha = vi.fn();

    const summary = await runThemeSyncCycle({
      config: cycleConfig(),
      supabase: sb as never,
      proxy: { post: vi.fn() } as unknown as AxiosInstance,
      fetchers: { naver, alpha },
      now,
    });

    // backoff 게이트로 fetch 미호출
    expect(naver).not.toHaveBeenCalled();
    expect(alpha).not.toHaveBeenCalled();
    expect(summary.backedOffSources).toEqual(["naver", "alpha"]);
    expect(summary.scrapedThemes).toBe(0);
  });

  it("fetch 차단(NaverRateLimitError) 시 markBackoff 를 기록한다 (5원칙 #4)", async () => {
    const sb = cycleSupabase();
    const { NaverRateLimitError } = await import("../src/proxy/errors");
    const naver = vi.fn().mockRejectedValue(new NaverRateLimitError());
    const alpha = vi.fn().mockResolvedValue([alphaScrape]);

    const summary = await runThemeSyncCycle({
      config: cycleConfig(),
      supabase: sb as never,
      proxy: { post: vi.fn() } as unknown as AxiosInstance,
      fetchers: { naver, alpha },
    });

    // 네이버 차단 → backoff 기록(api_usage upsert with backoff service)
    const backoffUpsert = (
      sb._chains.api_usage.upsert as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => c[0]?.service === "theme_naver_backoff");
    expect(backoffUpsert).toBeDefined();
    expect(summary.backedOffSources).toContain("naver");
    // 알파는 정상 → 적재됨
    expect(summary.scrapedThemes).toBe(1);
  });
});
