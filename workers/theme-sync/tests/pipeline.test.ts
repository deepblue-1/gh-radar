import { describe, it, expect, vi } from "vitest";
import {
  computeContentHash,
  shouldSkipWrite,
  storeHash,
  hashToInt,
} from "../src/pipeline/contentHash";
import { upsertThemes } from "../src/pipeline/upsertThemes";
import type { MergedTheme } from "../src/merge/mergeThemes";
import { createMockSupabase } from "./helpers/supabase-mock";

function theme(
  normKey: string,
  name: string,
  codes: string[],
): MergedTheme {
  return {
    normKey,
    name,
    description: null,
    sources: ["naver"],
    stocks: codes.map((code) => ({
      code,
      source: "naver" as const,
      reason: null,
    })),
  };
}

describe("contentHash (SHA256 변경 감지 — D-09, 5원칙 #2)", () => {
  it("동일 병합 결과는 동일 해시, 순서가 달라도 동일 해시", () => {
    const a = [theme("ai", "AI", ["005930", "000660"])];
    const b = [theme("ai", "AI", ["000660", "005930"])]; // code 순서 반대
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it("종목이 바뀌면 해시가 달라진다", () => {
    const a = [theme("ai", "AI", ["005930"])];
    const b = [theme("ai", "AI", ["005930", "000660"])];
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it("직전 저장 해시와 동일하면 shouldSkipWrite=true (write skip)", async () => {
    const themes = [theme("ai", "AI", ["005930"])];
    const hash = computeContentHash(themes);
    // api_usage 에 직전 해시(정수 다이제스트) 저장돼 있다고 가정
    const sb = createMockSupabase({
      api_usage: [{ count: hashToInt(hash) }],
    });
    expect(await shouldSkipWrite(sb as never, hash)).toBe(true);
  });

  it("직전 해시가 다르면 shouldSkipWrite=false (write 진행)", async () => {
    const themes = [theme("ai", "AI", ["005930"])];
    const hash = computeContentHash(themes);
    const sb = createMockSupabase({
      api_usage: [{ count: hashToInt(hash) + 1 }],
    });
    expect(await shouldSkipWrite(sb as never, hash)).toBe(false);
  });

  it("직전 해시가 없으면 shouldSkipWrite=false (최초 cycle)", async () => {
    const sb = createMockSupabase(); // api_usage 빈 store
    const hash = computeContentHash([theme("ai", "AI", ["005930"])]);
    expect(await shouldSkipWrite(sb as never, hash)).toBe(false);
  });

  it("storeHash 는 정수 다이제스트로 api_usage upsert 한다", async () => {
    const sb = createMockSupabase();
    const hash = computeContentHash([theme("ai", "AI", ["005930"])]);
    await storeHash(sb as never, hash, new Date("2026-06-09T07:00:00Z"));
    expect(sb._chains.api_usage.upsert).toHaveBeenCalled();
    const payload = (sb._chains.api_usage.upsert as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(payload.service).toBe("theme_content_hash");
    expect(payload.count).toBe(hashToInt(hash));
  });
});

describe("upsertThemes (FK skip + 청크 + 이력 + MIN_EXPECTED — Pitfall 5/10)", () => {
  it("stocks 마스터에 없는 종목 code 는 per-stock skip 한다 (FK, Pitfall 5)", async () => {
    const sb = createMockSupabase();
    // stocks 존재 확인: 005930 만 존재, 999999 미존재
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    // themes: norm_key 조회 없음(신규) → insert 후 id 반환
    sb.from("themes").maybeSingle.mockResolvedValue({ data: null, error: null });
    sb.from("themes").single.mockResolvedValue({
      data: { id: "theme-1" },
      error: null,
    });
    // theme_stocks: retire select(active 없음) + upsert 성공
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await upsertThemes(sb as never, [
      theme("반도체", "반도체", ["005930", "999999"]),
    ]);

    expect(res.skippedMissingStocks).toBe(1); // 999999 skip
    // theme_stocks upsert 는 유효 종목(005930)만 포함
    const upsertArg = (
      sb._chains.theme_stocks.upsert as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(upsertArg).toHaveLength(1);
    expect(upsertArg[0].stock_code).toBe("005930");
    expect(upsertArg[0].effective_to).toBeNull();
    expect(upsertArg[0].source).toBe("naver");
  });

  it("기존 시스템 테마는 INSERT 대신 sources append UPDATE 한다", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    // norm_key 조회 → 기존 테마 발견
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: { id: "existing-1" },
      error: null,
    });
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await upsertThemes(sb as never, [
      theme("반도체", "반도체", ["005930"]),
    ]);
    expect(res.themesUpserted).toBe(1);
    // insert 가 아닌 update 호출(기존 테마)
    expect(sb._chains.themes.update).toHaveBeenCalled();
  });

  it("이번 cycle 에서 빠진 active 종목은 effective_to=now 로 soft-제외한다 (이력, D-03)", async () => {
    const sb = createMockSupabase();
    sb.from("stocks").in.mockResolvedValue({
      data: [{ code: "005930" }],
      error: null,
    });
    sb.from("themes").maybeSingle.mockResolvedValue({
      data: { id: "theme-1" },
      error: null,
    });
    // 기존 active 종목: 005930(유지) + 000660(이번 cycle 에 없음 → retire)
    sb.from("theme_stocks").is.mockResolvedValue({
      data: [{ stock_code: "005930" }, { stock_code: "000660" }],
      error: null,
    });
    // retire update().eq().in() 종결
    sb.from("theme_stocks").in.mockResolvedValue({ data: null, error: null });
    sb.from("theme_stocks").upsert.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await upsertThemes(sb as never, [
      theme("반도체", "반도체", ["005930"]), // 000660 빠짐
    ]);
    expect(res.stockLinksRetired).toBe(1); // 000660 retired
    expect(sb._chains.theme_stocks.update).toHaveBeenCalledWith({
      effective_to: expect.any(String),
    });
  });

  it("병합 테마가 0개면 throw 한다 (MIN_EXPECTED 가드, Pitfall 10)", async () => {
    const sb = createMockSupabase();
    await expect(upsertThemes(sb as never, [])).rejects.toThrow(
      /partial scrape/,
    );
  });
});
