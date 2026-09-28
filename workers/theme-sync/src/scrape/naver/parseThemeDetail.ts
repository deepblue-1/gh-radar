import { z } from "zod";
import { ThemeScrapeValidationError } from "../../proxy/errors";

/** 네이버 테마 상세의 한 종목 — code(6자리) + 종목명 + 편입 사유. */
export interface NaverThemeStock {
  /** stocks.code 와 직접 매칭되는 6자리 단축코드. */
  code: string;
  name: string;
  /** themeItemInfoMap[code] 편입 사유 (없으면 null). */
  reason: string | null;
}

/** 상세 한 페이지 — 종목 + 테마 전체 종목 수(페이지네이션 종료 판정용). */
export interface NaverThemeDetailPage {
  stocks: NaverThemeStock[];
  totalCount: number;
}

// 필요 필드만 검증 — 시세 필드 등은 무시(부분 캐싱, 5원칙 #5).
const ThemeDetailSchema = z.object({
  stocks: z.array(
    z.object({
      itemCode: z.string(),
      stockName: z.string().nullish(),
    }),
  ),
  // 편입 사유는 보조 필드 — 형식이 바뀌어도 종목 수집은 막지 않도록 값은 느슨하게.
  themeItemInfoMap: z.record(z.string(), z.unknown()).nullish(),
  totalCount: z.number(),
});

/** 6자리 단축코드만 통과 (T-10-03-01 — 비정상 입력 차단). */
const CODE_RE = /^[0-9A-Za-z]{6}$/;

/**
 * 네이버 증권 테마 상세 JSON 파싱.
 *
 * GET {naverStockApiBase}/api/stocks/theme/{no}?page={N}&pageSize={S} (UTF-8 JSON)
 *   → { stocks: [{ itemCode, stockName, ... }], themeItemInfoMap: { [code]: 편입사유 },
 *       groupInfo, themeDescription, totalCount, page, pageSize }
 *
 * 편입 사유 = themeItemInfoMap[itemCode] (레거시 HTML 의 p.info_txt 와 동일 내용 —
 * AI 오분류 교정 입력, theme_stocks.reason).
 *
 * dedupe by code. JSON/스키마 불일치 시 ThemeScrapeValidationError.
 */
export function parseThemeDetail(body: string): NaverThemeDetailPage {
  let parsed: z.infer<typeof ThemeDetailSchema>;
  try {
    parsed = ThemeDetailSchema.parse(JSON.parse(body));
  } catch (err) {
    throw new ThemeScrapeValidationError(
      `네이버 테마 상세 응답 검증 실패 (JSON API 변경/차단 의심): ${(err as Error).message}`,
    );
  }

  const reasons = parsed.themeItemInfoMap ?? {};
  const seen = new Set<string>();
  const stocks: NaverThemeStock[] = [];
  for (const s of parsed.stocks) {
    const code = s.itemCode.trim();
    if (!CODE_RE.test(code) || seen.has(code)) continue;
    seen.add(code);
    const raw = reasons[code];
    const reason = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    stocks.push({ code, name: s.stockName?.trim() ?? "", reason });
  }
  return { stocks, totalCount: parsed.totalCount };
}
