import { describe, it, expect } from "vitest";
import { mapToNewsRow } from "../src/pipeline/map";
import {
  NAVER_NEWS_SAMPLE_OK,
  NAVER_NEWS_SAMPLE_EMPTY,
} from "./helpers/naver-fixtures";

/**
 * Phase 07 — 엔드-투-엔드 pipeline smoke:
 *   Naver fixture → mapToNewsRow → {title, source, content_hash} 검증.
 *
 * integration 레벨의 budget/failure-isolation 시나리오는 todo 로 두고, 상세는 실제
 * Supabase + Naver 키가 있는 환경 (Wave 4 deploy smoke) 에서 검증.
 */
describe("pipeline integration (V-09 budget / V-10 idempotent / failure isolation)", () => {
  it("mapToNewsRow converts Naver item to row with sanitized title", () => {
    const row = mapToNewsRow(
      "005930",
      NAVER_NEWS_SAMPLE_OK.items[0] as never,
    );
    expect(row).not.toBeNull();
    // Fixture: "<b>삼성전자</b>, 1분기 영업익 6.6조원 기록"
    expect(row!.title).toBe("삼성전자, 1분기 영업익 6.6조원 기록");
    expect(row!.stock_code).toBe("005930");
    expect(row!.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.source).toBe("hankyung");
  });

  it("returns empty items array for empty response fixture", () => {
    expect(NAVER_NEWS_SAMPLE_EMPTY.items).toHaveLength(0);
  });

  it.todo("budget exhausted → pipeline skips all fetches");
  it.todo("per-stock 500 error → other stocks still processed (failure isolation)");
  it.todo("401 from Naver → stopAll flag set, subsequent tasks skipped");
});
