import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import {
  allMasters,
  samsungQuote,
  samsungMaster,
  hynixMaster,
  hynixEtfMasters,
  delistedSamsungMaster,
  reitMaster,
  unknownGroupMaster,
  makeElwCrowd,
} from "../fixtures/stocks";
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

// 운영 DB 회귀 (2026-09-08): master-sync 가 ETP 코드 필터를 ^[0-9A-Z]{6}$ 로 넓히면서
// stocks 마스터가 3,999 → 7,453 행이 됐다 (ELW 2,735 · 영문코드 ETF 303 신규 유입).
// 스캐너(화이트리스트)·home-sync(제외집합)와 달리 /search 만 마스터를 무필터로 읽어
// ETF/ELW/상폐가 name-asc 앞자리를 점거 → 실제 주권이 limit 20 밖으로 밀려났다
// (삼성전자 3위→84위, 현대차 3위→106위, 카카오 1위→24위 = 응답 탈락).
describe("ETP/상폐 제외 회귀 (quick-260908-oh6)", () => {
  const codesOf = (body: any[]) => body.map((s: any) => s.code as string);

  it("q=삼성전자 → ELW 25건이 앞자리를 채워도 주권 005930 이 응답에 남는다 (crowd-out 해소)", async () => {
    const elw = makeElwCrowd(25);
    const elwCodes = new Set(elw.map((e) => e.code));
    const r = await request(
      app({ masters: [samsungMaster, ...elw], quotes: [samsungQuote] }),
    ).get("/api/stocks/search?q=" + encodeURIComponent("삼성전자"));
    expect(r.status).toBe(200);
    const codes = codesOf(r.body);
    expect(codes.filter((c) => elwCodes.has(c))).toEqual([]);
    expect(codes).toContain("005930");
  });

  it("q=하이닉스 → ETF 는 제외되고 주권 000660 이 응답에 있다", async () => {
    const etfCodes = new Set(hynixEtfMasters.map((e) => e.code));
    const r = await request(
      app({ masters: [hynixMaster, ...hynixEtfMasters], quotes: [] }),
    ).get("/api/stocks/search?q=" + encodeURIComponent("하이닉스"));
    expect(r.status).toBe(200);
    const codes = codesOf(r.body);
    expect(codes.filter((c) => etfCodes.has(c))).toEqual([]);
    expect(codes).toContain("000660");
  });

  it("q=삼성 → 상장폐지 종목(is_delisted=true)은 응답에 없다", async () => {
    const r = await request(
      app({
        masters: [samsungMaster, delistedSamsungMaster],
        quotes: [samsungQuote],
      }),
    ).get("/api/stocks/search?q=" + encodeURIComponent("삼성"));
    expect(r.status).toBe(200);
    const codes = codesOf(r.body);
    expect(codes).not.toContain(delistedSamsungMaster.code);
    expect(codes).toContain("005930");
  });

  // 과잉필터 가드 — 블랙리스트를 화이트리스트로 바꾸거나 종목명 패턴 fallback 을 넣으면
  // 여기서 깨진다. 수정 전에도 통과하는 게 정상이며 역할은 이후 회귀 감시다.
  it("q=삼성 → 부동산투자회사·'미확인' sentinel 은 계속 검색된다 (과잉필터 가드)", async () => {
    const r = await request(
      app({
        masters: [samsungMaster, reitMaster, unknownGroupMaster],
        quotes: [samsungQuote],
      }),
    ).get("/api/stocks/search?q=" + encodeURIComponent("삼성"));
    expect(r.status).toBe(200);
    const codes = codesOf(r.body);
    expect(codes).toContain(reitMaster.code);
    expect(codes).toContain(unknownGroupMaster.code);
    expect(codes).toContain("005930");
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
