import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allMasters, samsungQuote } from "../fixtures/stocks";
import { sanitizeSearchTerm } from "../../src/schemas/search";

const app = (state: any = { masters: allMasters, quotes: [samsungQuote] }) =>
  createApp({ supabase: mockSupabase(state) });

describe("/api/stocks/search (마스터 universe + LEFT JOIN stock_quotes)", () => {
  it("q=삼성전자 → 마스터 매치 + 시세 병합", async () => {
    const r = await request(app()).get(
      "/api/stocks/search?q=" + encodeURIComponent("삼성전자"),
    );
    expect(r.status).toBe(200);
    const samsung = r.body.find((s: any) => s.code === "005930");
    expect(samsung).toBeDefined();
    expect(samsung.name).toBe("삼성전자");
    expect(samsung.price).toBe(70000); // stock_quotes 에서 LEFT JOIN
  });

  it("q=005930 → code 매치", async () => {
    const r = await request(app()).get("/api/stocks/search?q=005930");
    expect(r.body.some((s: any) => s.code === "005930")).toBe(true);
  });

  it("q=신규상장 → 마스터 매치 + 시세 부재 → price=0 (em-dash)", async () => {
    const r = await request(app()).get(
      "/api/stocks/search?q=" + encodeURIComponent("신규상장"),
    );
    const m = r.body.find((s: any) => s.code === "999999");
    expect(m).toBeDefined();
    expect(m.price).toBe(0);
    expect(m.upperLimitProximity).toBe(0);
  });

  it("q=존재하지않는키워드xyz → 빈 배열", async () => {
    const r = await request(app()).get("/api/stocks/search?q=xyz");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("q 누락 → 400", async () => {
    const r = await request(app()).get("/api/stocks/search");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_QUERY_PARAM");
  });

  it("q 빈 문자열 → 400", async () => {
    const r = await request(app()).get("/api/stocks/search?q=");
    expect(r.status).toBe(400);
  });

  // WARN #7: 2자 단문 검색 — ilike '%삼성%' 가 '삼성전자' 에 매치되는지 회귀
  it("q=삼성 (2자) → ilike 매치로 005930 포함", async () => {
    const r = await request(app()).get(
      "/api/stocks/search?q=" + encodeURIComponent("삼성"),
    );
    expect(r.status).toBe(200);
    expect(r.body.some((s: any) => s.code === "005930")).toBe(true);
  });
});

describe("sanitizeSearchTerm (회귀)", () => {
  it("removes ,()%", () => {
    expect(sanitizeSearchTerm("삼성,(주)%")).toBe("삼성주");
  });
  it("preserves Korean/English/digits", () => {
    expect(sanitizeSearchTerm("Samsung 005930 삼성")).toBe(
      "Samsung 005930 삼성",
    );
  });
  // MED-1 회귀: PostgREST or-expr 파서가 싱글쿼트를 문자열 구분자로 해석해
  // 400/500 을 유발하므로 함께 제거해야 함
  it("removes single quote (MED-1)", () => {
    expect(sanitizeSearchTerm("O'Reilly")).toBe("OReilly");
    expect(sanitizeSearchTerm("삼'성")).toBe("삼성");
  });
});
