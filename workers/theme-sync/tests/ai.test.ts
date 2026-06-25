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
  pruneSparseAiThemes,
  consolidateAiThemes,
} from "../src/ai/persistAi";
import { enrichWithAi } from "../src/ai/enrich";
import { runThemeSyncCycle } from "../src/index";
import { __resetAnthropicClientForTests } from "../src/ai/anthropic";
import type { ThemeSyncConfig } from "../src/config";
import type { ThemeScrape } from "../src/scrape/types";
import type { AxiosInstance } from "axios";
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
    discoverExistingThemesMax: 2000,
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

/** messages.create 응답 헬퍼 — content[0].text 에 JSON 문자열. */
function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

/**
 * 테스트용 stocks 마스터 (code↔회사명). discoverThemes 의 resolveNamesToCodes 가 AI 가 낸
 * 회사명(stockNames)을 이 마스터로 code 해석한다. 응답 JSON 은 회사명을, 단언은 해석된 code 를 쓴다.
 */
const STOCK_MASTER = [
  { code: "005930", name: "삼성전자", is_delisted: false },
  { code: "000660", name: "SK하이닉스", is_delisted: false },
  { code: "035420", name: "NAVER", is_delisted: false },
  { code: "009150", name: "삼성전기", is_delisted: false },
  { code: "072990", name: "에이치엘비", is_delisted: false },
  { code: "096770", name: "SK이노베이션", is_delisted: false },
  { code: "011090", name: "에넥스", is_delisted: false },
];

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
    // stocks 마스터 seed → resolveNamesToCodes 의 .range() 가 회사명→code 해석에 사용.
    const sb = createMockSupabase({ stocks: STOCK_MASTER });
    sb.from("news_articles").limit.mockResolvedValue({
      data: opts.news,
      error: null,
    });
    // 기존 시스템 테마 조회는 .eq('is_system').limit() 종결 → themes.limit 으로 응답 주입.
    sb.from("themes").limit.mockResolvedValue({
      data: opts.existing,
      error: null,
    });
    return sb;
  }

  it("Claude JSON 응답을 신규 테마 후보로 파싱한다", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse(
        '{"themes":[{"name":"초전도체","stockNames":["삼성전자","SK하이닉스"],"confidence":0.85}]}',
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
    // 회사명(삼성전자/SK하이닉스) → 마스터 해석 → code.
    expect(out[0].stockCodes).toEqual(["005930", "000660"]);
    expect(out[0].confidence).toBeCloseTo(0.85);
  });

  it("기존 시스템 테마와 norm_key 충돌하는 후보는 제외한다(중복 발굴 방지)", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse(
        '{"themes":[{"name":"반도체","stockNames":["삼성전자"],"confidence":0.9},{"name":"우주항공","stockNames":[],"confidence":0.7}]}',
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

  // POC 라이브 버그 회귀 — Haiku 가 ```json 마크다운 펜스로 감싼 응답도 파싱돼야 한다.
  // (mocked clean-JSON 테스트는 이 버그를 못 잡았다 → 첫 production run 발굴 0건.)
  it("```json 펜스로 감싼 응답도 후보로 파싱한다 (POC fence 버그 회귀)", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse(
        '다음은 발굴 결과입니다:\n```json\n{"themes":[{"name":"온디바이스AI","stockNames":["삼성전자","SK하이닉스"],"confidence":0.82}]}\n```',
      ),
    );
    const sb = newsSupabase({
      news: [{ title: "온디바이스 AI NPU 탑재 확대", description: null }],
      existing: [{ name: "반도체", norm_key: "반도체" }],
    });

    const out = await discoverThemes(sb as never, aiConfig(), log);
    // 펜스/프리앰블이 있어도 첫 '{'~마지막 '}' 추출로 정상 파싱.
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("온디바이스AI");
    expect(out[0].stockCodes).toEqual(["005930", "000660"]);
  });
});

// ── (1b) discoverThemes — cross-chunk near-duplicate 보수적 병합 (POC dedup 강화) ──

describe("discoverThemes (near-duplicate 보수적 병합)", () => {
  function oneChunkSupabase(
    themesJson: string,
    existing: Array<{ name: string; norm_key: string | null }> = [],
  ) {
    const sb = createMockSupabase({ stocks: STOCK_MASTER });
    // 단일 청크에 들어가는 뉴스 1건 → Claude 1회 호출 → themesJson 응답.
    sb.from("news_articles").limit.mockResolvedValue({
      data: [{ title: "테마 뉴스", description: null }],
      error: null,
    });
    sb.from("themes").limit.mockResolvedValue({ data: existing, error: null });
    hoist.mockCreate.mockResolvedValue(textResponse(themesJson));
    return sb;
  }

  it("종목코드를 2개 이상 공유하는 두 후보는 하나로 병합한다", async () => {
    // 이름은 norm_key 가 서로 달라 완전일치 dedupe 는 안 되지만 종목 2개 공유 → 같은 테마.
    const sb = oneChunkSupabase(
      '{"themes":[' +
        '{"name":"AI 인프라","stockNames":["삼성전자","SK하이닉스"],"confidence":0.7},' +
        '{"name":"AI 데이터센터 투자","stockNames":["삼성전자","SK하이닉스","NAVER"],"confidence":0.9}' +
        "]}",
    );
    const out = await discoverThemes(sb as never, aiConfig(), log);

    expect(out).toHaveLength(1);
    // canonical = 더 일반적(norm_key 짧은) 이름 = "AI 인프라".
    expect(out[0].name).toBe("AI 인프라");
    // 종목코드 합집합.
    expect([...out[0].stockCodes].sort()).toEqual([
      "000660",
      "005930",
      "035420",
    ]);
    // confidence = max.
    expect(out[0].confidence).toBeCloseTo(0.9);
  });

  it("한 이름이 다른 이름을 substring 으로 포함하면 병합한다 (변형명)", async () => {
    // norm_key: "ai기판" ⊂ "ai기판부품" — 포함관계 + 짧은 쪽 길이 ≥4 → 병합.
    const sb = oneChunkSupabase(
      '{"themes":[' +
        '{"name":"AI 기판","stockNames":["삼성전기"],"confidence":0.6},' +
        '{"name":"AI 기판 부품","stockNames":["에이치엘비"],"confidence":0.8}' +
        "]}",
    );
    const out = await discoverThemes(sb as never, aiConfig(), log);

    expect(out).toHaveLength(1);
    // 더 일반적(짧은) "AI 기판" 이 canonical.
    expect(out[0].name).toBe("AI 기판");
    expect([...out[0].stockCodes].sort()).toEqual(["009150", "072990"]);
  });

  it("공유 종목 없고 포함관계도 없으면 둘 다 유지한다 (과병합 금지)", async () => {
    // 서로 다른 업종 + 종목 0 공유 + norm_key 포함관계 없음 → 보수적으로 KEEP BOTH.
    const sb = oneChunkSupabase(
      '{"themes":[' +
        '{"name":"양자기술","stockNames":["SK이노베이션"],"confidence":0.7},' +
        '{"name":"폐수소차 희토류","stockNames":["에넥스"],"confidence":0.7}' +
        "]}",
    );
    const out = await discoverThemes(sb as never, aiConfig(), log);

    expect(out).toHaveLength(2);
    const names = out.map((o) => o.name).sort();
    expect(names).toEqual(["양자기술", "폐수소차 희토류"]);
  });

  it("종목 1개만 공유하면 병합하지 않는다 (≥2 가드, 과병합 금지)", async () => {
    // 종목 1개 공유는 우연 동반상장일 수 있어 병합 안 함(보수적). 포함관계도 없음.
    const sb = oneChunkSupabase(
      '{"themes":[' +
        '{"name":"6G 네트워크","stockNames":["삼성전자"],"confidence":0.7},' +
        '{"name":"파운드리 경쟁","stockNames":["삼성전자"],"confidence":0.7}' +
        "]}",
    );
    const out = await discoverThemes(sb as never, aiConfig(), log);
    expect(out).toHaveLength(2);
  });

  it("짧은 토큰 포함(길이<4)은 substring 병합 안 한다 (오병합 차단)", async () => {
    // norm_key "ai"(2자) 가 "ai반도체" 에 포함되나 길이<4 → 병합 금지(ai 가 모든 후보에 매칭되는 사고 방지).
    const sb = oneChunkSupabase(
      '{"themes":[' +
        '{"name":"AI","stockNames":["NAVER"],"confidence":0.6},' +
        '{"name":"AI 반도체","stockNames":["SK하이닉스"],"confidence":0.8}' +
        "]}",
    );
    const out = await discoverThemes(sb as never, aiConfig(), log);
    expect(out).toHaveLength(2);
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

  // POC 라이브 버그 회귀 — 교정 응답도 ```json 펜스로 감싸질 수 있다(발굴과 동일 경로).
  it("```json 펜스로 감싼 응답도 제외 대상으로 파싱한다 (POC fence 버그 회귀)", async () => {
    hoist.mockCreate.mockResolvedValue(
      textResponse('```json\n{"unrelated":["t1::068270"]}\n```'),
    );
    const out = await correctMembership(aiConfig(), rows, log);
    expect(out).toEqual([{ themeId: "t1", stockCode: "068270" }]);
  });
});

// ── (3) persistDiscoveries — source='ai' + is_system=true + FK skip ───────────

describe("persistDiscoveries (source='ai' 시스템 적재 + FK)", () => {
  // 해석된 code 2개(005930,000660) + 마스터 미존재 1개(999999) → ≥2 가드 통과, FK skip 1.
  const discovered: DiscoveredTheme[] = [
    {
      name: "초전도체",
      normKey: "초전도체",
      stockCodes: ["005930", "000660", "999999"],
      confidence: 0.8,
    },
  ];

  it("신규 AI 테마를 source=['ai'] + is_system=true 로 INSERT 한다 (≥2 유효 + FK skip)", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }, { code: "000660" }], // 999999 미존재
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

    // theme_stocks upsert: 유효 종목 2개(005930,000660)만, source='ai', 999999 skip.
    const upsertArg = (
      sb._chains.theme_stocks.upsert as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(upsertArg).toHaveLength(2);
    expect(upsertArg.map((r: { stock_code: string }) => r.stock_code)).toEqual([
      "005930",
      "000660",
    ]);
    expect(upsertArg[0].source).toBe("ai");
    expect(upsertArg[0].confidence).toBeCloseTo(0.8);
    expect(res.skippedMissingStocks).toBe(1);
    expect(res.aiThemesUpserted).toBe(1);
    expect(res.aiStockLinksUpserted).toBe(2);
  });

  it("해석된 유효 종목 2개 미만인 신규 AI 테마는 생성하지 않는다 (≥2 가드)", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }], // 1개만 유효
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await persistDiscoveries(
      sb as never,
      [
        {
          name: "AI 데이터센터 지역 유치",
          normKey: "ai데이터센터지역유치",
          stockCodes: ["005930", "999999"], // 유효 1개 → 미달.
          confidence: 0.6,
        },
      ],
      log,
    );

    expect(sb._chains.themes.insert).not.toHaveBeenCalled();
    expect(res.aiThemesUpserted).toBe(0);
    expect(res.aiStockLinksUpserted).toBe(0);
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

  it("norm_key 불일치라도 active 종목 ≥2 공유하는 시스템 테마에 흡수한다 (2순위, 변형명 중복 방지)", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }, { code: "000660" }],
      error: null,
    });
    // norm_key 완전일치 없음.
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });
    // 기존 시스템 테마 'naver-1'(sources=['naver'])이 005930·000660 둘 다 active 보유.
    sb.from("theme_stocks").limit.mockResolvedValue({
      data: [
        {
          theme_id: "naver-1",
          stock_code: "005930",
          effective_to: null,
          themes: { is_system: true, sources: ["naver"] },
        },
        {
          theme_id: "naver-1",
          stock_code: "000660",
          effective_to: null,
          themes: { is_system: true, sources: ["naver"] },
        },
      ],
      error: null,
    });
    sb.from("theme_stocks").upsert.mockResolvedValue({ data: null, error: null });

    const res = await persistDiscoveries(
      sb as never,
      [
        {
          name: "AI 인프라", // norm_key 'ai인프라' — '반도체' 와 완전일치 아님.
          normKey: "ai인프라",
          stockCodes: ["005930", "000660"],
          confidence: 0.7,
        },
      ],
      log,
    );

    // 신규 INSERT 안 함 — 기존 'naver-1' 에 흡수(sources 에 'ai' 병합).
    expect(sb._chains.themes.insert).not.toHaveBeenCalled();
    const updateArg = (sb._chains.themes.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(updateArg.sources).toEqual(["naver", "ai"]);
    expect(res.aiThemesUpserted).toBe(1);
  });

  it("공유 종목이 1개뿐이면 흡수하지 않고 신규 AI 테마를 생성한다 (≥2 임계, 과흡수 금지)", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }, { code: "000660" }],
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });
    // 기존 테마는 005930 1개만 공유 → 임계 미만.
    sb.from("theme_stocks").limit.mockResolvedValue({
      data: [
        {
          theme_id: "naver-1",
          stock_code: "005930",
          effective_to: null,
          themes: { is_system: true, sources: ["naver"] },
        },
      ],
      error: null,
    });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "ai-new" },
      error: null,
    });
    sb.from("theme_stocks").upsert.mockResolvedValue({ data: null, error: null });

    await persistDiscoveries(
      sb as never,
      [
        {
          name: "신규테마",
          normKey: "신규테마",
          stockCodes: ["005930", "000660"],
          confidence: 0.7,
        },
      ],
      log,
    );

    // 1개 공유는 흡수 안 함 → 신규 INSERT(sources=['ai']).
    const insertArg = (sb._chains.themes.insert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(insertArg.sources).toEqual(["ai"]);
    expect(sb._chains.themes.update).not.toHaveBeenCalled();
  });
});

// ── (3b) pruneSparseAiThemes — ai 단독 <2종목 정리 (원 소스 보존) ──────────────

describe("pruneSparseAiThemes (ai 단독 <2종목 삭제)", () => {
  it("ai 단독 <2종목만 삭제하고 naver/alpha 섞인 테마는 보존한다", async () => {
    const sb = createMockSupabase();
    // 1) 시스템 테마: ai 단독 2개(sparse 1종목 / full 3종목) + naver+ai 혼합 1개.
    sb.from("themes").limit.mockResolvedValue({
      data: [
        { id: "ai-sparse", sources: ["ai"] },
        { id: "ai-full", sources: ["ai"] },
        { id: "mixed", sources: ["naver", "ai"] },
      ],
      error: null,
    });
    // 2) active 종목: ai-sparse 1개, ai-full 3개.
    sb.from("theme_stocks").limit.mockResolvedValue({
      data: [
        { theme_id: "ai-sparse", effective_to: null },
        { theme_id: "ai-full", effective_to: null },
        { theme_id: "ai-full", effective_to: null },
        { theme_id: "ai-full", effective_to: null },
      ],
      error: null,
    });

    const pruned = await pruneSparseAiThemes(sb as never, log);

    expect(pruned).toBe(1);
    // 삭제 대상은 ai-sparse 뿐(<2). ai-full(≥2)·mixed(ai 단독 아님)는 보존.
    expect(sb._chains.themes.delete).toHaveBeenCalled();
    expect(sb._chains.themes.in).toHaveBeenCalledWith("id", ["ai-sparse"]);
  });

  it("삭제 대상(ai 단독 <2)이 없으면 delete 미호출", async () => {
    const sb = createMockSupabase();
    sb.from("themes").limit.mockResolvedValue({
      data: [{ id: "naver-1", sources: ["naver"] }], // ai 단독 아님.
      error: null,
    });
    const pruned = await pruneSparseAiThemes(sb as never, log);
    expect(pruned).toBe(0);
    expect(sb._chains.themes.delete).not.toHaveBeenCalled();
  });
});

// ── (3c) consolidateAiThemes — 기존 ai 단독 중복을 큐레이션 테마로 흡수·삭제 ──────

describe("consolidateAiThemes (ai 단독 중복 흡수)", () => {
  it("큐레이션 테마와 ≥2종목 겹치는 ai 단독 테마를 흡수·삭제하고, 안 겹치는 ai 테마는 보존한다", async () => {
    const sb = createMockSupabase();
    // 1) 시스템 테마: ai 단독 2개(ai-dup 겹침 / ai-novel 안겹침) + 큐레이션 naver-1.
    sb.from("themes").limit.mockResolvedValue({
      data: [
        { id: "ai-dup", sources: ["ai"] },
        { id: "naver-1", sources: ["naver"] },
        { id: "ai-novel", sources: ["ai"] },
      ],
      error: null,
    });
    // 2) ai 단독 active 종목 → 3) 큐레이션 active 종목 (theme_stocks.limit 순차 응답).
    sb.from("theme_stocks").limit
      // step2: ai-dup={005930,000660,009150}, ai-novel={035420}.
      .mockResolvedValueOnce({
        data: [
          { theme_id: "ai-dup", stock_code: "005930", confidence: 0.8, effective_to: null },
          { theme_id: "ai-dup", stock_code: "000660", confidence: 0.8, effective_to: null },
          { theme_id: "ai-dup", stock_code: "009150", confidence: 0.8, effective_to: null },
          { theme_id: "ai-novel", stock_code: "035420", confidence: 0.7, effective_to: null },
        ],
        error: null,
      })
      // step3: naver-1 이 005930·000660 active 보유(009150·035420 은 미보유).
      .mockResolvedValueOnce({
        data: [
          { theme_id: "naver-1", stock_code: "005930", effective_to: null },
          { theme_id: "naver-1", stock_code: "000660", effective_to: null },
        ],
        error: null,
      });
    sb.from("theme_stocks").upsert.mockResolvedValue({ data: null, error: null });

    const folded = await consolidateAiThemes(sb as never, log);

    // ai-dup 은 naver-1 과 005930·000660 2개 공유 → 흡수·삭제. ai-novel 은 보존.
    expect(folded).toBe(1);
    expect(sb._chains.themes.in).toHaveBeenCalledWith("id", ["ai-dup"]);
    expect(sb._chains.themes.delete).toHaveBeenCalled();
    // 누락 종목(009150)만 naver-1 에 'ai' 로 흡수(005930·000660 은 이미 active → 제외).
    const upsertArg = (sb._chains.theme_stocks.upsert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(upsertArg).toHaveLength(1);
    expect(upsertArg[0]).toMatchObject({
      theme_id: "naver-1",
      stock_code: "009150",
      source: "ai",
    });
    // naver-1 sources 에 'ai' 병합.
    const updateArg = (sb._chains.themes.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(updateArg.sources).toEqual(["naver", "ai"]);
  });

  it("ai 단독 테마가 없거나 큐레이션 테마가 없으면 아무것도 하지 않는다", async () => {
    const sb = createMockSupabase();
    sb.from("themes").limit.mockResolvedValue({
      data: [{ id: "naver-1", sources: ["naver"] }], // ai 단독 없음.
      error: null,
    });
    const folded = await consolidateAiThemes(sb as never, log);
    expect(folded).toBe(0);
    expect(sb._chains.themes.delete).not.toHaveBeenCalled();
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

// ── (5) enrichWithAi — cycle AI 보강 단계 통합 (발굴+교정+persist) ─────────────

describe("enrichWithAi (cycle AI 단계 통합)", () => {
  /** 발굴(news/themes) + 교정(theme_stocks review) + persist(stocks/themes/theme_stocks) mock. */
  function enrichSupabase() {
    // stocks 마스터 seed → discoverThemes resolveNamesToCodes(.range) 가 회사명→code 해석.
    const sb = createMockSupabase({ stocks: STOCK_MASTER });
    // discoverThemes: 최근 뉴스 1건.
    sb.from("news_articles").limit.mockResolvedValue({
      data: [{ title: "초전도체 관련주 급등", description: "LK-99" }],
      error: null,
    });
    // discoverThemes: 기존 시스템 테마 목록(themes select.eq('is_system').limit()).
    sb.from("themes").limit.mockResolvedValue({
      data: [{ name: "반도체", norm_key: "반도체" }],
      error: null,
    });
    // loadMembershipForReview: 활성 naver 매핑 1건(reason 보유, effective_to=null, 시스템 테마).
    sb.from("theme_stocks").limit.mockResolvedValue({
      data: [
        {
          theme_id: "t1",
          stock_code: "068270",
          reason: "테마 편입 사유",
          effective_to: null,
          themes: { name: "반도체", is_system: true },
        },
      ],
      error: null,
    });
    return sb;
  }

  it("classifyEnabled=true 면 발굴+교정+persist 를 실행한다", async () => {
    // 1st Claude 호출(발굴) → 후보, 2nd(교정) → 무관 판정.
    hoist.mockCreate
      .mockResolvedValueOnce(
        textResponse(
          '{"themes":[{"name":"초전도체","stockNames":["삼성전자","SK하이닉스"],"confidence":0.8}]}',
        ),
      )
      .mockResolvedValueOnce(textResponse('{"unrelated":["t1::068270"]}'));

    const sb = enrichSupabase();
    // persistDiscoveries: 해석된 code 2개 존재(≥2 가드 통과) + 신규 테마 insert.
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }, { code: "000660" }],
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "ai-1" },
      error: null,
    });
    sb.from("theme_stocks").upsert.mockResolvedValue({ data: null, error: null });
    // persistCorrections: soft-제외 update().eq().eq().is().
    sb.from("theme_stocks").is.mockResolvedValue({ data: null, error: null });

    const out = await enrichWithAi(sb as never, aiConfig(), log);

    // 발굴 + 교정 둘 다 Claude 호출(2회).
    expect(hoist.mockCreate).toHaveBeenCalledTimes(2);
    expect(out.aiDiscovered).toBe(1);
    expect(out.aiCorrected).toBe(1);
    // 발굴 테마 source='ai' insert.
    const insertArg = (sb._chains.themes.insert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(insertArg.is_system).toBe(true);
    expect(insertArg.sources).toEqual(["ai"]);
    // 교정 soft-제외(effective_to) — 물리 삭제 없음.
    expect(sb._chains.theme_stocks.update).toHaveBeenCalledWith({
      effective_to: expect.any(String),
    });
    expect(sb._chains.theme_stocks.delete).not.toHaveBeenCalled();
  });

  it("classifyEnabled=false 면 Claude/DB 호출 없이 0 반환 (kill-switch)", async () => {
    const sb = createMockSupabase();
    const out = await enrichWithAi(
      sb as never,
      aiConfig({ classifyEnabled: false }),
      log,
    );
    expect(out).toEqual({
      aiDiscovered: 0,
      aiCorrected: 0,
      aiThemesUpserted: 0,
      aiStockLinksUpserted: 0,
      aiPruned: 0,
      aiConsolidated: 0,
    });
    expect(hoist.mockCreate).not.toHaveBeenCalled();
    // 어떤 테이블도 접근하지 않음(prune 도 미실행).
    expect(sb._chains.news_articles).toBeUndefined();
    expect(sb._chains.theme_stocks).toBeUndefined();
    expect(sb._chains.themes).toBeUndefined();
  });
});

// ── (6) runThemeSyncCycle — AI 단계 통합(게이트 + isolation) ──────────────────

describe("runThemeSyncCycle (AI 보강 통합)", () => {
  const naverScrape: ThemeScrape = {
    name: "반도체",
    description: null,
    aliases: [],
    stocks: [{ code: "005930", reason: "메모리 반도체" }],
    source: "naver",
  };

  /** pipeline.test.ts 의 cycle 하니스 축약 — api_usage 서비스별 응답 분기. */
  function cycleSupabase() {
    const sb = createMockSupabase();
    const chain = sb.from("api_usage");
    chain.limit.mockResolvedValue({ data: [], error: null }); // backoff 없음 + 해시 불일치.
    chain.upsert.mockResolvedValue({ data: null, error: null });
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "theme-x" },
      error: null,
    });
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({ data: null, error: null });
    return sb;
  }

  it("classifyEnabled=false 면 AI 미호출 + summary 에 aiDiscovered/aiCorrected=0", async () => {
    const sb = cycleSupabase();
    const summary = await runThemeSyncCycle({
      config: aiConfig({ classifyEnabled: false }),
      supabase: sb as never,
      proxy: { post: vi.fn() } as unknown as AxiosInstance,
      fetchers: {
        naver: vi.fn().mockResolvedValue([naverScrape]),
        alpha: vi.fn().mockResolvedValue([]),
      },
    });

    // upsert 는 정상(스크랩 적재) 됐지만 AI Claude 호출은 0(kill-switch).
    expect(summary.themesUpserted).toBeGreaterThan(0);
    expect(hoist.mockCreate).not.toHaveBeenCalled();
    expect(summary.aiDiscovered).toBe(0);
    expect(summary.aiCorrected).toBe(0);
    // AI 가 읽는 테이블(news_articles) 미접근.
    expect(sb._chains.news_articles).toBeUndefined();
  });
});
