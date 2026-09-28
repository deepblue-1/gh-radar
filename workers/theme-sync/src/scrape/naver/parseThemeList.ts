import { z } from "zod";
import { ThemeScrapeValidationError } from "../../proxy/errors";

/** 네이버 테마 목록의 한 행 — 테마 ID(no) + 테마명. */
export interface NaverThemeListItem {
  /** /api/stocks/theme/{no} 의 ID (레거시 sise_group_detail no 와 동일). */
  no: string;
  name: string;
}

/** 목록 한 페이지 — 항목 + 전체 테마 수(페이지네이션 종료 판정용). */
export interface NaverThemeListPage {
  items: NaverThemeListItem[];
  totalCount: number;
}

// 필요 필드만 검증 — 나머지(changeRate 등)는 무시(부분 캐싱, 5원칙 #5).
const ThemeListSchema = z.object({
  groups: z.array(
    z.object({
      no: z.union([z.number(), z.string()]),
      name: z.string(),
    }),
  ),
  totalCount: z.number(),
});

/**
 * 네이버 증권 테마 목록 JSON 파싱.
 *
 * GET {naverStockApiBase}/api/stocks/theme?page={N}&pageSize={S} (UTF-8 JSON)
 *   → { groups: [{ no, name, totalCount, ... }], totalCount, page, pageSize }
 *
 * 레거시 finance.naver.com/sise/theme.naver 는 2026-09-10~11 폐지되어 stock.naver.com
 * SPA 로 302 된다(HTML 테이블 없음). JSON 이 아니거나 스키마가 다르면(SPA HTML, 차단
 * 페이지, API 변경) ThemeScrapeValidationError — "0개" 로 뭉개지 않고 원인을 드러낸다.
 *
 * dedupe by no. no 는 숫자만 통과 (T-10-03-01 — 비정상 입력 차단).
 */
export function parseThemeList(body: string): NaverThemeListPage {
  let parsed: z.infer<typeof ThemeListSchema>;
  try {
    parsed = ThemeListSchema.parse(JSON.parse(body));
  } catch (err) {
    throw new ThemeScrapeValidationError(
      `네이버 테마 목록 응답 검증 실패 (JSON API 변경/차단 의심): ${(err as Error).message}`,
    );
  }

  const seen = new Set<string>();
  const items: NaverThemeListItem[] = [];
  for (const g of parsed.groups) {
    const no = String(g.no).trim();
    const name = g.name.trim();
    if (!/^\d+$/.test(no) || !name || seen.has(no)) continue;
    seen.add(no);
    items.push({ no, name });
  }
  return { items, totalCount: parsed.totalCount };
}
