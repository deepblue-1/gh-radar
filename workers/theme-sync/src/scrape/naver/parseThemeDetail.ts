import * as cheerio from "cheerio";

/** 네이버 테마 상세의 한 종목 — code(6자리) + 종목명 + 편입 사유. */
export interface NaverThemeStock {
  /** stocks.code 와 직접 매칭되는 6자리 단축코드. */
  code: string;
  name: string;
  /** div.info_layer_wrap > p.info_txt 편입 사유 (없으면 null). */
  reason: string | null;
}

/**
 * 네이버 테마 상세 HTML 파싱 (RESEARCH §Pattern 2 — 실측 검증).
 *
 * 상세 GET /sise/sise_group_detail.naver?type=theme&no={ID}.
 * 종목 테이블 = table.type_5. 종목 행 =
 *   td.name > div.name_area > a[href="/item/main.naver?code={6자리}"]{종목명}.
 * 편입 사유 = 같은 tr 의 p.info_txt (AI 오분류 교정 입력 — theme_stocks.reason).
 *
 * dedupe by code — 한 테마에 같은 종목이 중복 출현해도 1개로.
 * code 는 6자리 정규식으로 필터 (T-10-03-01 — 비정상 입력 차단).
 */
export function parseThemeDetail(html: string): NaverThemeStock[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: NaverThemeStock[] = [];
  $("table.type_5 td.name").each((_, td) => {
    const a = $(td).find('a[href*="/item/main.naver?code="]');
    const href = a.attr("href") ?? "";
    const m = href.match(/code=([0-9A-Za-z]{6})(?![0-9A-Za-z])/);
    if (!m) return;
    const code = m[1];
    if (seen.has(code)) return;
    const name = a.text().trim();
    if (!name) return;
    const reason =
      $(td).closest("tr").find("p.info_txt").first().text().trim() || null;
    seen.add(code);
    out.push({ code, name, reason });
  });
  return out;
}
