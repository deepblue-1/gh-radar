import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 10 Plan 06 — AI 보강 모듈 (발굴/교정/persist) + cycle 통합 테스트.
 *
 * 전략: discussion-sync/tests/index.test.ts 의 SDK-mock 패턴 복제 —
 *   @anthropic-ai/sdk default 를 vi.mock 으로 교체(실 API 호출 0). messages.create 는
 *   vi.hoisted mock 으로 응답 주입. __resetAnthropicClientForTests 로 싱글톤 reset.
 *
 * 검증:
 *   1. discoverThemes: JSON 응답 파싱 → 신규 테마 후보, 기존 norm_key 충돌 제외.
 *   2. correctMembership: "명백히 무관" key → soft-제외 대상(입력에 있는 것만, 환각 방어).
 *   3. persistDiscoveries: source='ai' + is_system=true 적재 + FK skip.
 *   4. persistCorrections: effective_to soft-제외만(원 source row DELETE 안 함).
 *   5. classifyEnabled=false → Claude 호출 0(kill-switch).
 *   6. JSON 파싱 실패 → 빈 결과(다음 cycle 재시도).
 *   7. cycle 통합: classifyEnabled 게이트 + try/catch isolation + aiDiscovered/aiCorrected 카운트.
 */

const hoist = vi.hoisted(() => {
  const mockCreate = vi.fn();
  return { mockCreate };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: hoist.mockCreate },
  })),
}));

import {
  discoverThemes,
  type DiscoveredTheme,
} from "../src/ai/discoverThemes";
import {
  correctMembership,
  type MembershipRow,
} from "../src/ai/correctMembership";
import {
  persistDiscoveries,
  persistCorrections,
} from "../src/ai/persistAi";
import { __resetAnthropicClientForTests } from "../src/ai/anthropic";
import type { ThemeSyncConfig } from "../src/config";
import { createMockSupabase } from "./helpers/supabase-mock";
import { logger } from "../src/logger";

const log = logger.child({ test: true });

function aiConfig(over: Partial<ThemeSyncConfig> = {}): ThemeSyncConfig {
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
    anthropicApiKey: "test-anth",
    classifyEnabled: true,
    classifyConcurrency: 5,
    classifyModel: "claude-haiku-4-5",
    discoverNewsLookbackDays: 1,
    discoverNewsMax: 300,
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

/** messages.create 응답 헬퍼 — content[0].text 에 JSON 문자열. */
function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  // getAnthropicClient() 는 loadConfig() 를 호출 → req() 가 필수 env 를 요구하므로
  // SDK mock 호출 경로(discoverChunk/correctChunk 의 try)가 throw 하지 않도록 env 채움.
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.BRIGHTDATA_API_KEY = "bd";
  process.env.ANTHROPIC_API_KEY = "test-anth";
  hoist.mockCreate.mockReset();
  __resetAnthropicClientForTests();
});

// ── (1) discoverThemes — JSON 파싱 + 기존 norm_key 충돌 제외 ───────────────────

describe("discoverThemes (발굴 JSON 파싱 + 중복 제외)", () => {
  function newsSupabase(opts: {
    news: Array<{ title: string; description: string | null }>;
    existing: Array<{ name: string; norm_key: string | null }>;
  }) {
    const sb = createMockSupabase();
    sb.from("news_articles").limit.mockResolvedValue({
      data: opts.news,
      error: null,
    });
    sb.from("themes").eq.mockReturnThis();
    // themes select(...).eq('is_system', true) 는 await chain 종결이 아니라
    // .eq() 가 마지막 → mock 은 .eq() 가 데이터 resolve 하도록 마지막 eq override.
    sb.from("themes").eq.mockResolvedValue({
      data: opts.existing,
      error: null,
    });
    return sb;
  }

  it("Claude JSON 응답을 신규 테마 후보로 파싱한다", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse(
        '{"themes":[{"name":"초전도체","stockCodes":["005930","000660"],"confidence":0.85}]}',
      ),
    );
    const sb = newsSupabase({
      news: [{ title: "초전도체 관련주 급등", description: "LK-99 재현 기대" }],
      existing: [{ name: "반도체", norm_key: "반도체" }],
    });

    const out = await discoverThemes(sb as never, aiConfig(), log);
    expect(hoist.mockCreate).toHaveBeenCalledTimes(1);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("초전도체");
    expect(out[0].normKey).toBe("초전도체");
    expect(out[0].stockCodes).toEqual(["005930", "000660"]);
    expect(out[0].confidence).toBeCloseTo(0.85);
  });

  it("기존 시스템 테마와 norm_key 충돌하는 후보는 제외한다(중복 발굴 방지)", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse(
        '{"themes":[{"name":"반도체","stockCodes":["005930"],"confidence":0.9},{"name":"우주항공","stockCodes":[],"confidence":0.7}]}',
      ),
    );
    const sb = newsSupabase({
      news: [{ title: "반도체 슈퍼사이클", description: null }],
      existing: [{ name: "반도체", norm_key: "반도체" }], // 기존
    });

    const out = await discoverThemes(sb as never, aiConfig(), log);
    // 반도체(충돌) 제외 → 우주항공만.
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("우주항공");
  });

  it("classifyEnabled=false 면 Claude 호출 없이 빈 결과 (kill-switch)", async () => {
    const sb = newsSupabase({ news: [], existing: [] });
    const out = await discoverThemes(
      sb as never,
      aiConfig({ classifyEnabled: false }),
      log,
    );
    expect(out).toEqual([]);
    expect(hoist.mockCreate).not.toHaveBeenCalled();
    // 뉴스 fetch 종결(.limit)도 호출되지 않음(kill-switch 가 최우선 — 호출 0).
    expect(sb._chains.news_articles.limit).not.toHaveBeenCalled();
  });

  it("JSON 파싱 실패 시 빈 결과 (다음 cycle 재시도)", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse("죄송합니다. JSON 을 생성할 수 없습니다."),
    );
    const sb = newsSupabase({
      news: [{ title: "뭔가", description: null }],
      existing: [],
    });
    const out = await discoverThemes(sb as never, aiConfig(), log);
    expect(out).toEqual([]);
  });

  it("최근 뉴스가 없으면 Claude 호출 없이 빈 결과", async () => {
    const sb = newsSupabase({ news: [], existing: [] });
    const out = await discoverThemes(sb as never, aiConfig(), log);
    expect(out).toEqual([]);
    expect(hoist.mockCreate).not.toHaveBeenCalled();
  });
});

// ── (2) correctMembership — 무관 판정 + 환각 방어 ─────────────────────────────

describe("correctMembership (오분류 soft-제외 대상)", () => {
  const rows: MembershipRow[] = [
    {
      themeId: "t1",
      themeName: "반도체",
      stockCode: "005930",
      reason: "메모리 반도체",
    },
    {
      themeId: "t1",
      themeName: "반도체",
      stockCode: "068270",
      reason: null,
    },
  ];

  it('AI "명백히 무관" 판정만 제외 대상으로 반환한다', async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse('{"unrelated":["t1::068270"]}'),
    );
    const out = await correctMembership(aiConfig(), rows, log);
    expect(out).toEqual([{ themeId: "t1", stockCode: "068270" }]);
  });

  it("입력에 없는 key(AI 환각)는 무시한다", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse('{"unrelated":["t1::068270","t9::999999"]}'),
    );
    const out = await correctMembership(aiConfig(), rows, log);
    // t9::999999 는 입력에 없음 → 무시.
    expect(out).toEqual([{ themeId: "t1", stockCode: "068270" }]);
  });

  it("classifyEnabled=false 면 Claude 호출 없이 빈 결과 (kill-switch)", async () => {
    const out = await correctMembership(
      aiConfig({ classifyEnabled: false }),
      rows,
      log,
    );
    expect(out).toEqual([]);
    expect(hoist.mockCreate).not.toHaveBeenCalled();
  });

  it("JSON 파싱 실패 시 빈 결과 (잘못된 제외 방지, 원본 보존)", async () => {
    hoist.mockCreate.mockResolvedValue(textResponse("불가능"));
    const out = await correctMembership(aiConfig(), rows, log);
    expect(out).toEqual([]);
  });
});

// ── (3) persistDiscoveries — source='ai' + is_system=true + FK skip ───────────

describe("persistDiscoveries (source='ai' 시스템 적재 + FK)", () => {
  const discovered: DiscoveredTheme[] = [
    {
      name: "초전도체",
      normKey: "초전도체",
      stockCodes: ["005930", "999999"],
      confidence: 0.8,
    },
  ];

  it("신규 AI 테마를 source=['ai'] + is_system=true 로 INSERT 한다", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }], // 999999 미존재
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "ai-theme-1" },
      error: null,
    });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await persistDiscoveries(sb as never, discovered, log);

    // themes insert payload: is_system=true, sources=['ai'], owner_id=null.
    const insertArg = (sb._chains.themes.insert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(insertArg.is_system).toBe(true);
    expect(insertArg.owner_id).toBeNull();
    expect(insertArg.sources).toEqual(["ai"]);

    // theme_stocks upsert: 유효 종목(005930)만, source='ai', 999999 skip.
    const upsertArg = (
      sb._chains.theme_stocks.upsert as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(upsertArg).toHaveLength(1);
    expect(upsertArg[0].stock_code).toBe("005930");
    expect(upsertArg[0].source).toBe("ai");
    expect(upsertArg[0].confidence).toBeCloseTo(0.8);
    expect(res.skippedMissingStocks).toBe(1);
    expect(res.aiThemesUpserted).toBe(1);
    expect(res.aiStockLinksUpserted).toBe(1);
  });

  it("기존 시스템 테마(norm_key 충돌)는 sources 에 'ai' 병합한다", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    // norm_key 조회 → 기존 시스템 테마(sources=['naver']).
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: { id: "existing-1", sources: ["naver"] },
      error: null,
    });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    await persistDiscoveries(
      sb as never,
      [
        {
          name: "반도체",
          normKey: "반도체",
          stockCodes: ["005930"],
          confidence: 0.7,
        },
      ],
      log,
    );

    // insert 미호출(기존) + update 로 sources 병합.
    expect(sb._chains.themes.insert).not.toHaveBeenCalled();
    const updateArg = (sb._chains.themes.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(updateArg.sources).toEqual(["naver", "ai"]);
  });

  it("발굴 후보가 0개면 적재하지 않는다", async () => {
    const sb = createMockSupabase();
    const res = await persistDiscoveries(sb as never, [], log);
    expect(res.aiThemesUpserted).toBe(0);
    expect(sb._chains.themes).toBeUndefined();
  });
});

// ── (4) persistCorrections — effective_to soft-제외만 (원본 보존) ─────────────

describe("persistCorrections (effective_to soft-제외, DELETE 금지)", () => {
  it("effective_to=now 로 soft-제외 마킹만 한다 (naver/alphasquare row 삭제 안 함)", async () => {
    const sb = createMockSupabase();
    // update().eq().eq().is() 종결.
    sb.from("theme_stocks").is.mockResolvedValue({ data: null, error: null });

    const corrected = await persistCorrections(
      sb as never,
      [{ themeId: "t1", stockCode: "068270" }],
      log,
    );

    expect(corrected).toBe(1);
    // effective_to UPDATE 호출(soft-제외).
    expect(sb._chains.theme_stocks.update).toHaveBeenCalledWith({
      effective_to: expect.any(String),
    });
    // 물리 삭제 절대 금지 — delete 미호출.
    expect(sb._chains.theme_stocks.delete).not.toHaveBeenCalled();
    // 현재 편입(effective_to IS NULL)만 마킹 — .is('effective_to', null) 호출.
    expect(sb._chains.theme_stocks.is).toHaveBeenCalledWith(
      "effective_to",
      null,
    );
  });

  it("교정 대상이 0개면 아무것도 하지 않는다", async () => {
    const sb = createMockSupabase();
    const corrected = await persistCorrections(sb as never, [], log);
    expect(corrected).toBe(0);
    expect(sb._chains.theme_stocks).toBeUndefined();
  });
});
