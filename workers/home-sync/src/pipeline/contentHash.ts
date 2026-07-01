import { createHash } from "node:crypto";
import type { Surge } from "./loadSurges";

/**
 * Phase 13 Plan 02 Task 1 — 급등집합+뉴스 content_hash (D-04, Pattern 4 변경 감지).
 *
 * hash-skip clone-append (Pattern 4): 직전 스냅샷과 해시가 동일하면 Claude 호출을 건너뛰고
 * 직전 payload 를 복제 append 한다. 해시 입력은 결정적이어야 하므로:
 *   - 급등 종목코드 + 뉴스 id 를 각각 정렬 후 직렬화 → 로드 순서 무관.
 *   - 제목/URL 전체가 아니라 뉴스 **id 집합**만 사용 (Open Q3) — 같은 뉴스 묶음이면 제목
 *     미세 변화에 과민 반응하지 않는다 (title-insensitive). 급등집합/뉴스 id 가 실제로
 *     바뀔 때만 새 해시 → Claude 재호출.
 */
export function computeContentHash(surges: Surge[]): string {
  const canonical = {
    codes: surges.map((s) => s.code).sort(),
    news: surges.flatMap((s) => s.news.map((n) => n.id)).sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
