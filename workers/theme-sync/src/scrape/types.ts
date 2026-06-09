import type { ThemeStockSource } from "@gh-radar/shared";

/** 한 종목 매핑 — code + (네이버) 편입 사유. */
export interface ScrapedStock {
  code: string;
  /** 네이버 편입 사유 / 알파스퀘어는 null. */
  reason: string | null;
}

/**
 * 한 소스(네이버 또는 알파스퀘어)에서 스크랩한 단일 테마 + 소속 종목.
 * mergeThemes 가 norm_key 로 묶어 시스템 테마로 병합한다.
 */
export interface ThemeScrape {
  /** 원본 테마명 (정규화 전). */
  name: string;
  /** 테마 설명 (알파스퀘어 description / 네이버는 null). */
  description: string | null;
  /** 병합 보조 키 (알파스퀘어 aliases / 네이버는 []). */
  aliases: string[];
  /** 소속 종목 code + reason. */
  stocks: ScrapedStock[];
  /** 출처 — theme_stocks.source 태그. */
  source: ThemeStockSource;
}
