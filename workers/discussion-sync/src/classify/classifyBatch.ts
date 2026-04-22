import pLimit from "p-limit";
import type pino from "pino";
import { classifyOne, type Label } from "./classifyOne.js";
import { loadConfig } from "../config.js";

/**
 * Phase 08.1 — N개 row 를 p-limit 동시성 제어로 분류.
 *
 * approved plan §8 — p-limit(cfg.classifyConcurrency, default 5). Promise.allSettled
 * 로 한 row 실패가 배치 전체 실패를 유발하지 않음. 결과는 Map<id, Label> — null 응답은
 * Map 에 들어가지 않으므로 persistRelevance 가 해당 id 의 classified_at 을
 * 업데이트하지 않음 → 다음 cycle 에서 재시도.
 */
export async function classifyBatch(
  rows: Array<{ id: string; title: string; body: string | null }>,
  log: pino.Logger,
): Promise<Map<string, Label>> {
  const cfg = loadConfig();
  const limit = pLimit(cfg.classifyConcurrency);
  const results = new Map<string, Label>();
  await Promise.allSettled(
    rows.map((r) =>
      limit(async () => {
        const label = await classifyOne(r);
        if (label) results.set(r.id, label);
      }),
    ),
  );
  log.info(
    { total: rows.length, classified: results.size },
    "classifyBatch done",
  );
  return results;
}
