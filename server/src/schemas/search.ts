import { z } from "zod";

export const SearchQuery = z.object({
  q: z.string().min(1, "required").max(64, "too long"),
});
export type SearchQueryT = z.infer<typeof SearchQuery>;

/**
 * PostgREST `or` 표현식에서 `,()%`는 파서를 깨뜨리므로 제거.
 * (RESEARCH §6.4 — ILIKE or-expr 주입 방지)
 */
export function sanitizeSearchTerm(s: string): string {
  return s.replace(/[,()%]/g, "");
}
