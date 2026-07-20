import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * quick-260720-in0 — 급등 종목 2+ 가 공유하는 네이버 테마만 클러스터링 힌트로 로드.
 *
 * Surge 타입은 불변, 별도 인자로 전달한다 (기존 계약 최소 영향). anti-hallucination 유지 —
 * Claude 에 "참고 테마 분류" 힌트로만 제공하고 사실을 지어내게 강제하지 않는다.
 *
 * 배경: 클러스터링은 100% 뉴스 텍스트 기반(D-04)이라, 곡물/사료처럼 종목을 잇는 뉴스가
 * 없으면 동반 급등이 전부 singles 로 흩어진다. theme-sync 가 이미 수집한 네이버 테마
 * 멤버십(themes/theme_stocks)을 힌트로 얹어 뉴스 공백 시에도 같은 테마 동반 급등을 묶는다.
 * 추가 크롤링/API 호출 없음 (기존 적재 테이블 조회 2회).
 *
 * 흐름:
 *   1. theme_stocks 활성 멤버십(effective_to IS NULL) — code 청크 IN → theme_id→코드 Set 누적.
 *   2. **2+ 공유 필터** — 급등 종목 1개만 속한 테마(정치인 테마 등) 제외 (노이즈/토큰 절약).
 *   3. themes 조회(id 청크 IN) → hidden=false 만 name 해석.
 *   4. Map<themeName, string[]> — code 오름차순 정렬(결정적 출력), 동일 name 병합.
 */

/** theme_stocks / themes 청크 IN 크기 (loadSurges QUOTE_CHUNK 값과 동일, PostgREST URL 414 방지). */
const QUOTE_CHUNK = 200;

export async function loadThemeHints(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, string[]>> {
  // 빈 급등 집합 → Supabase 호출 0.
  if (codes.length === 0) return new Map();

  // 1) theme_stocks 활성 멤버십 (effective_to IS NULL) — code 청크 IN.
  //    Map<theme_id, Set<stock_code>> 로 누적 (청크 경계 넘어 같은 테마 종목 합산).
  const codesByTheme = new Map<string, Set<string>>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const chunkSet = new Set(chunk);
    const { data, error } = await supabase
      .from("theme_stocks")
      .select("theme_id,stock_code")
      .in("stock_code", chunk)
      .is("effective_to", null);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{
      theme_id: string;
      stock_code: string;
    }>) {
      // 청크 밖 종목은 무시 (mock/응답 방어, loadSurges 3) 단계 패턴 계승).
      if (!chunkSet.has(r.stock_code)) continue;
      const set = codesByTheme.get(r.theme_id) ?? new Set<string>();
      set.add(r.stock_code);
      codesByTheme.set(r.theme_id, set);
    }
  }

  // 2) 2+ 공유 필터 — 급등 종목 2개 이상 속한 테마만 유지.
  const sharedThemes = [...codesByTheme.entries()].filter(
    ([, set]) => set.size >= 2,
  );
  if (sharedThemes.length === 0) return new Map();

  // 3) themes 조회 (id 청크 IN) — hidden=false 테마만 name 해석.
  const themeIds = sharedThemes.map(([id]) => id);
  const nameById = new Map<string, string>();
  for (let i = 0; i < themeIds.length; i += QUOTE_CHUNK) {
    const chunk = themeIds.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("themes")
      .select("id,name,hidden")
      .in("id", chunk);
    if (error) throw error;
    for (const t of (data ?? []) as Array<{
      id: string;
      name: string | null;
      hidden: boolean | null;
    }>) {
      if (t.hidden) continue; // 숨김 테마 제외.
      if (!t.name) continue;
      nameById.set(t.id, t.name);
    }
  }

  // 4) Map<themeName, string[]> — name 해석된(hidden 제외) 테마만, code 오름차순 정렬.
  //    동일 name 충돌(드묾) 시 코드 병합.
  const out = new Map<string, string[]>();
  for (const [themeId, set] of sharedThemes) {
    const name = nameById.get(themeId);
    if (!name) continue; // hidden 또는 미해석 테마 제외.
    const merged = new Set([...(out.get(name) ?? []), ...set]);
    out.set(name, [...merged].sort());
  }
  return out;
}
