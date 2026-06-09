import * as cheerio from "cheerio";

/** 네이버 금융 테마 목록의 한 행 — 테마 ID(no) + 테마명. */
export interface NaverThemeListItem {
  /** sise_group_detail.naver?type=theme&no={ID} 의 ID. */
  no: string;
  name: string;
}

/**
 * 네이버 금융 테마 목록 HTML 파싱 (RESEARCH §Pattern 2 — 실측 검증).
 *
 * 목록 GET /sise/theme.naver?page={N} (EUC-KR, iconv 디코딩 후 호출).
 * 테마 행 = table.type_1.theme 내부
 *   <a href="/sise/sise_group_detail.naver?type=theme&no={ID}">{테마명}</a>.
 *
 * dedupe by no — 동일 페이지에 같은 테마 anchor 가 중복 출현해도 1개로.
 */
export function parseThemeList(html: string): NaverThemeListItem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: NaverThemeListItem[] = [];
  $(
    'table.type_1.theme a[href*="sise_group_detail.naver?type=theme"]',
  ).each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/no=(\d+)/);
    const name = $(el).text().trim();
    if (!m || !name) return;
    const no = m[1];
    if (seen.has(no)) return;
    seen.add(no);
    out.push({ no, name });
  });
  return out;
}
