import { describe, expect, it, vi } from "vitest";
import { loadThemeHints } from "./loadThemeHints";
import { createMockSupabase } from "../../tests/helpers/supabase-mock";

/**
 * quick-260720-in0 Task 1 — loadThemeHints (급등 종목 2+ 공유 네이버 테마 힌트 로드).
 *
 * mock 주의:
 *   - theme_stocks 쿼리는 `.select().in("stock_code").is("effective_to", null)` — 종결이 `.is`.
 *     → `sb.from("theme_stocks").is.mockResolvedValue(...)` 로 응답 주입.
 *   - themes 쿼리는 `.select().in("id")` — 종결이 `.in`.
 *     → `sb.from("themes").in.mockResolvedValue(...)` 로 응답 주입.
 *   실제 Claude/네트워크 호출 없음.
 */

describe("loadThemeHints", () => {
  it("급등 3종목이 공유하는 테마('사료')를 Map 으로 로드 (2+ 공유 필터로 단독 테마 제외)", async () => {
    const sb = createMockSupabase();
    // theme_stocks: 002140·002680·218150 이 '사료'(tFeed) 공유, 218150 은 '정치인'(tPol) 단독.
    sb.from("theme_stocks").is.mockResolvedValue({
      data: [
        { theme_id: "tFeed", stock_code: "002140" },
        { theme_id: "tFeed", stock_code: "002680" },
        { theme_id: "tFeed", stock_code: "218150" },
        { theme_id: "tPol", stock_code: "218150" }, // 단독 → 제외.
      ],
      error: null,
    });
    sb.from("themes").in.mockResolvedValue({
      data: [
        { id: "tFeed", name: "사료", hidden: false },
        { id: "tPol", name: "정치인", hidden: false },
      ],
      error: null,
    });

    const hints = await loadThemeHints(sb as never, [
      "002140",
      "002680",
      "218150",
    ]);

    expect([...hints.keys()]).toEqual(["사료"]);
    expect(hints.get("사료")).toEqual(["002140", "002680", "218150"]); // 오름차순.
    expect(hints.has("정치인")).toBe(false); // 단독 소속 → 제외.
  });

  it("effective_to IS NULL 활성 필터를 쿼리에 적용 (retired 멤버십 무시)", async () => {
    const sb = createMockSupabase();
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });

    await loadThemeHints(sb as never, ["002140", "002680"]);

    const isCalls = sb.from("theme_stocks").is.mock.calls as Array<
      [string, unknown]
    >;
    expect(isCalls[0][0]).toBe("effective_to");
    expect(isCalls[0][1]).toBeNull();
  });

  it("hidden=true 테마는 제외", async () => {
    const sb = createMockSupabase();
    sb.from("theme_stocks").is.mockResolvedValue({
      data: [
        { theme_id: "tHid", stock_code: "002140" },
        { theme_id: "tHid", stock_code: "002680" },
        { theme_id: "tVis", stock_code: "002140" },
        { theme_id: "tVis", stock_code: "002680" },
      ],
      error: null,
    });
    sb.from("themes").in.mockResolvedValue({
      data: [
        { id: "tHid", name: "숨김테마", hidden: true },
        { id: "tVis", name: "표시테마", hidden: false },
      ],
      error: null,
    });

    const hints = await loadThemeHints(sb as never, ["002140", "002680"]);

    expect([...hints.keys()]).toEqual(["표시테마"]);
    expect(hints.has("숨김테마")).toBe(false);
  });

  it("codes 200 초과 시 청크로 나눠 조회 + 청크 경계 넘어 같은 테마 합산", async () => {
    const sb = createMockSupabase();
    // 201개 코드 — 첫 청크(0..199), 둘째 청크(200). 같은 테마 tFeed 가 두 청크에 걸침.
    const codes = ["002140"];
    for (let i = 0; i < 199; i++) codes.push(String(900000 + i));
    codes.push("218150"); // index 200 → 둘째 청크.

    sb.from("theme_stocks")
      .is.mockResolvedValueOnce({
        data: [{ theme_id: "tFeed", stock_code: "002140" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ theme_id: "tFeed", stock_code: "218150" }],
        error: null,
      });
    sb.from("themes").in.mockResolvedValue({
      data: [{ id: "tFeed", name: "사료", hidden: false }],
      error: null,
    });

    const hints = await loadThemeHints(sb as never, codes);

    // 두 청크에 나뉜 종목이 하나의 테마로 합산 (size 2 → 필터 통과).
    expect(hints.get("사료")).toEqual(["002140", "218150"]);
    // theme_stocks 청크 2회 조회.
    expect(sb.from("theme_stocks").is).toHaveBeenCalledTimes(2);
  });

  it("빈 codes → 빈 Map (Supabase 호출 0)", async () => {
    const sb = createMockSupabase();
    const fromSpy = vi.spyOn(sb, "from");

    const hints = await loadThemeHints(sb as never, []);

    expect(hints.size).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("theme_stocks 결과 0행 → 빈 Map (themes 조회 skip)", async () => {
    const sb = createMockSupabase();
    sb.from("theme_stocks").is.mockResolvedValue({ data: [], error: null });

    const hints = await loadThemeHints(sb as never, ["002140", "002680"]);

    expect(hints.size).toBe(0);
    // themes 는 조회하지 않음 (공유 테마 0).
    expect(sb.from("themes").in).not.toHaveBeenCalled();
  });

  it("Supabase error → throw (조용한 실패 금지)", async () => {
    const sb = createMockSupabase();
    sb.from("theme_stocks").is.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    await expect(
      loadThemeHints(sb as never, ["002140", "002680"]),
    ).rejects.toEqual({ message: "boom" });
  });
});
