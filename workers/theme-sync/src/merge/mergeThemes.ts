import type { ThemeStockSource } from "@gh-radar/shared";
import type { ThemeScrape } from "../scrape/types";
import { normalizeName } from "./normalizeName";

/** 병합된 한 시스템 테마 — norm_key 로 네이버 ∪ 알파 합쳐진 결과. */
export interface MergedTheme {
  /** 정규화 병합 키 (themes.norm_key). */
  normKey: string;
  /** 표시 테마명 (네이버 우선, 없으면 더 짧은 것). */
  name: string;
  /** 테마 설명 (있는 소스 우선 — 보통 알파스퀘어). */
  description: string | null;
  /** 다중 출처 태그 합집합 (themes.sources). */
  sources: ThemeStockSource[];
  /** 소속 종목 — code 별 source/reason (code 합집합, 네이버 reason 우선). */
  stocks: MergedStock[];
}

export interface MergedStock {
  code: string;
  source: ThemeStockSource;
  reason: string | null;
}

/**
 * 스크랩된 네이버+알파 ThemeScrape[] 를 norm_key 로 group → 시스템 테마 병합 (D-10, RESEARCH §Pattern 4).
 *
 * - 동일 norm_key → 1 시스템 테마. name 은 네이버 우선(없으면 더 짧은 것).
 * - sources 합집합(dedupe). 종목 code 합집합 — 같은 code 가 두 소스에 있으면 네이버 reason/source 우선.
 * - 정확 일치(정규화 후)만 병합 — 애매한 건 분리 유지(보수적).
 */
export function mergeThemes(scrapes: ThemeScrape[]): MergedTheme[] {
  const groups = new Map<string, MergedTheme>();

  for (const sc of scrapes) {
    const normKey = normalizeName(sc.name);
    if (!normKey) continue; // 빈 정규화 키(특수문자만) skip

    let g = groups.get(normKey);
    if (!g) {
      g = {
        normKey,
        name: sc.name,
        description: sc.description,
        sources: [],
        stocks: [],
      };
      groups.set(normKey, g);
    } else {
      // name 결정: 네이버 우선 → 둘 다 비네이버면 더 짧은 이름.
      if (sc.source === "naver") {
        g.name = sc.name;
      } else if (sc.name.length < g.name.length && !g.sources.includes("naver")) {
        g.name = sc.name;
      }
      // description: 비어있으면 채움.
      if (!g.description && sc.description) g.description = sc.description;
    }

    // sources 합집합.
    if (!g.sources.includes(sc.source)) g.sources.push(sc.source);

    // 종목 code 합집합 — 네이버(reason 보유) 우선.
    const byCode = new Map(g.stocks.map((s) => [s.code, s]));
    for (const st of sc.stocks) {
      const existing = byCode.get(st.code);
      if (!existing) {
        const merged: MergedStock = {
          code: st.code,
          source: sc.source,
          reason: st.reason,
        };
        byCode.set(st.code, merged);
        g.stocks.push(merged);
      } else if (sc.source === "naver") {
        // 네이버가 더 우선 — source/reason 갱신(reason 이 AI 교정 입력으로 유용).
        existing.source = "naver";
        if (st.reason) existing.reason = st.reason;
      } else if (!existing.reason && st.reason) {
        existing.reason = st.reason;
      }
    }
  }

  return [...groups.values()];
}
