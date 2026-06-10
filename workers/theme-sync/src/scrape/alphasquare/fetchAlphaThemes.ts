import { z } from "zod";
import type { ThemeSyncConfig } from "../../config";
import type { ThemeScrape } from "../types";
import { ThemeScrapeValidationError } from "../../proxy/errors";

/**
 * 알파스퀘어 공개 JSON API 스크랩 (RESEARCH §Pattern 3 — 실측 검증).
 *
 * CONTEXT D-06 의 "SSR" 가정과 달리 Vue SPA → DOM 파싱 불필요. 무인증 공개 JSON API:
 *   GET /theme/v2/all-themes        → {data:[{name(카테고리), themes:[{id,name,description,aliases[]}]}]}
 *   GET /theme/v2/themes/{id}/stocks → [{code, ko_name, market, is_alive, country_code}]  (bare array)
 *
 * 5원칙 #5(부분 캐싱): alphaCategories 화이트리스트(기본 정치/트렌드)만 — 전체 451 덤프 금지.
 * country_code==='KR' && is_alive 필터. Pitfall 10: zod 검증 + 비정상 응답 throw.
 */

// all-themes 응답 (필요 필드만 — passthrough 로 추가 필드 허용).
const ThemeNodeSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  description: z.string().nullish(),
  aliases: z.array(z.string()).nullish(),
});
const CategorySchema = z.object({
  name: z.string(),
  themes: z.array(ThemeNodeSchema),
});
const AllThemesSchema = z.object({
  data: z.array(CategorySchema),
});

// /themes/{id}/stocks 응답 (bare array).
const AlphaStockSchema = z.object({
  code: z.string(),
  ko_name: z.string().nullish(),
  market: z.string().nullish(),
  is_alive: z.boolean().nullish(),
  country_code: z.string().nullish(),
});
const StocksSchema = z.array(AlphaStockSchema);

/** 6자리 단축코드만 통과 (T-10-03-01 — 비정상 입력 차단). */
const CODE_RE = /^[0-9A-Za-z]{6}$/;

export interface FetchAlphaDeps {
  cfg: ThemeSyncConfig;
  /** 직접→프록시 폴백 fetch (fetchWithFallback 바인딩 주입). UTF-8 JSON. */
  fetchFn: (url: string) => Promise<string>;
}

export async function fetchAlphaThemes(
  deps: FetchAlphaDeps,
): Promise<ThemeScrape[]> {
  const { cfg, fetchFn } = deps;
  const allowed = new Set(cfg.alphaCategories);

  const allRaw = await fetchFn(`${cfg.alphaApiBase}/theme/v2/all-themes`);
  let allParsed: z.infer<typeof AllThemesSchema>;
  try {
    allParsed = AllThemesSchema.parse(JSON.parse(allRaw));
  } catch (err) {
    throw new ThemeScrapeValidationError(
      `alpha all-themes 응답 검증 실패: ${(err as Error).message}`,
    );
  }

  // 5원칙 #5 — 화이트리스트 카테고리만 (부분 캐싱).
  const themes = allParsed.data
    .filter((c) => allowed.has(c.name))
    .flatMap((c) => c.themes);

  const out: ThemeScrape[] = [];
  for (const t of themes) {
    const stocksRaw = await fetchFn(
      `${cfg.alphaApiBase}/theme/v2/themes/${t.id}/stocks`,
    );
    let stocksParsed: z.infer<typeof StocksSchema>;
    try {
      stocksParsed = StocksSchema.parse(JSON.parse(stocksRaw));
    } catch (err) {
      throw new ThemeScrapeValidationError(
        `alpha theme ${t.id} stocks 응답 검증 실패: ${(err as Error).message}`,
      );
    }

    const codes = stocksParsed
      // is_alive 가 명시 false 또는 null(상폐/거래정지)이면 제외 — null 을 '생존'으로
      // 통과시키던 비대칭 버그 수정(WR-W-03). 필드 부재(undefined)는 알파가 정상 종목에서
      // 생략할 수 있어 생존으로 간주(country_code 엄격 일치와 균형).
      .filter(
        (s) =>
          s.country_code === "KR" &&
          s.is_alive !== false &&
          s.is_alive !== null,
      )
      .map((s) => s.code)
      .filter((code) => CODE_RE.test(code));

    out.push({
      name: t.name,
      description: t.description ?? null,
      aliases: t.aliases ?? [],
      stocks: codes.map((code) => ({ code, reason: null })),
      source: "alphasquare",
    });
  }
  return out;
}
