import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";
import { allMasters, samsungQuote } from "../fixtures/stocks";
import { inquirePriceToQuoteRow } from "../../src/mappers/stock";
import { resetKiwoomRateLimiter } from "../../src/kiwoom/rateLimiter";

// Phase 09.1 D-17 — server 가 키움 ka10001 호출로 전환됨.
// 기존 KIS rt_cd / output 패턴 → 키움 return_code / top-level fields 패턴.

const okKa10001 = {
  return_code: 0,
  return_msg: "정상",
  stk_cd: "005930",
  cur_prc: "+70500",
  pred_pre: "+500",
  flu_rt: "+0.71",
  open_pric: "+70000",
  high_pric: "+71000",
  low_pric: "+69500",
  upl_pric: "91000",
  lst_pric: "49000",
  mac: "4180000",
};

function mockKiwoomRuntime(impl: (code: string) => Promise<any>) {
  return {
    client: {
      post: vi
        .fn()
        .mockImplementation(async (_path: string, body: { stk_cd: string }) => {
          const data = await impl(body.stk_cd);
          return { data };
        }),
    },
    getToken: vi.fn().mockResolvedValue("TEST_TOKEN"),
  } as any;
}

describe("/api/stocks/:code (마스터 universe + on-demand 키움 inquirePrice)", () => {
  // quick 261001-bnc — on-demand upsert 는 KRX 세션 창(평일 · 비휴장 · KST 08:00~20:00) 안에서만.
  // 시각을 거래일 장중으로 고정해 기존 테스트가 실행 시각(야간 로컬 · 주말 CI)에 흔들리지 않게 한다.
  // toFake 는 Date 로만 한정 — setTimeout 까지 가짜로 만들면 supertest 요청이 멈춘다.
  // 시각을 옮길 때마다 키움 token bucket 도 리셋한다 — bucket 은 Date.now() 차이로 리필하므로
  // 시각이 멈추거나 역행하면 리필이 0/음수가 되어 acquireKiwoomRateToken 이 끝나지 않는다.
  const setNow = (iso: string) => {
    vi.setSystemTime(new Date(iso));
    resetKiwoomRateLimiter();
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setNow("2026-10-01T10:00:00+09:00");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("마스터 존재 + 키움 호출 성공 → 200 + on-demand 값 우선 + stock_quotes upsert", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => okKa10001);
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("005930");
    expect(r.body.price).toBe(70500); // on-demand 값 (절댓값)
    expect(r.body.open).toBe(70000);
    expect(r.body.high).toBe(71000);
    expect(r.body.low).toBe(69500);
    // STEP1 worker 의 volume/trade_amount 보존 (D-22)
    expect(r.body.volume).toBe(samsungQuote.volume);
    expect(r.body.tradeAmount).toBe(samsungQuote.trade_amount);
    // stock_quotes upsert 발생 확인
    expect(
      state.upserts.some((u: any) => u.table === "stock_quotes"),
    ).toBe(true);
    // upsert payload 에 volume / trade_amount 키 omit (D-22)
    const upsertPayload = state.upserts.find(
      (u: any) => u.table === "stock_quotes",
    );
    expect(upsertPayload.rows[0]).not.toHaveProperty("volume");
    expect(upsertPayload.rows[0]).not.toHaveProperty("trade_amount");
    // 창 안 upsert 는 등락률 기준 시각 rate_updated_at 을 updated_at 과 같은 now 로 찍는다 (261001-bnc)
    expect(
      state.upserts.filter((u: any) => u.table === "stock_quotes"),
    ).toHaveLength(1);
    expect(upsertPayload.rows[0].updated_at).toBe("2026-10-01T01:00:00.000Z");
    expect(upsertPayload.rows[0].rate_updated_at).toBe(
      upsertPayload.rows[0].updated_at,
    );
  });

  it("창 밖 야간(00:28 KST) → fresh 시세 응답 유지 + stock_quotes upsert 0건 (261001-bnc 사고 시각)", async () => {
    setNow("2026-10-01T00:28:00+09:00");
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => okKa10001);
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70500); // fresh ka10001
    expect(r.body.changeRate).toBe(0.71);
    expect(
      (state.upserts ?? []).filter((u: any) => u.table === "stock_quotes"),
    ).toHaveLength(0);
  });

  it("창 밖 휴장일(2026-10-05 개천절 대체공휴일 10:00 KST) → stock_quotes upsert 0건", async () => {
    setNow("2026-10-05T10:00:00+09:00");
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => okKa10001);
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70500);
    expect(
      (state.upserts ?? []).filter((u: any) => u.table === "stock_quotes"),
    ).toHaveLength(0);
  });

  it("마스터 존재 + 키움 호출 실패 → cached stock_quotes 폴백", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => {
      throw new Error("키움 429");
    });
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000); // cached 값
    expect(r.body.volume).toBe(samsungQuote.volume);
  });

  it("마스터 부재 → 404 STOCK_NOT_FOUND, 키움 호출 미실행", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => okKa10001);
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/000000");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("STOCK_NOT_FOUND");
    expect(kiwoomRuntime.client.post).not.toHaveBeenCalled();
    expect(kiwoomRuntime.getToken).not.toHaveBeenCalled();
  });

  it("마스터 존재 + 키움 호출 실패 + cached 없음 → 200 + price=0", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = mockKiwoomRuntime(async () => {
      throw new Error("network");
    });
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/999999");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("999999");
    expect(r.body.price).toBe(0);
    expect(r.body.upperLimitProximity).toBe(0);
  });

  it("kiwoomRuntime 미주입 → cached 만으로 응답 + 키움 호출 0건 (BLOCKER #1 커버리지)", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const r = await request(
      createApp({ supabase: mockSupabase(state) }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000);
    expect(r.body.volume).toBe(samsungQuote.volume);
  });

  it("키움 return_code != 0 → throw → cached fallback (Wave 1 plan 04 패턴)", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const supa = mockSupabase(state);
    const kiwoomRuntime = {
      client: {
        post: vi.fn().mockResolvedValue({
          data: { return_code: 1700, return_msg: "허용된 요청 개수를 초과" },
        }),
      },
      getToken: vi.fn().mockResolvedValue("T"),
    } as any;
    const r = await request(
      createApp({ supabase: supa, kiwoomRuntime }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.price).toBe(70000); // cached
  });

  // Phase 15 Plan 10 (D-28 / SC-6): 응답에 isin 이 실려야 웹앱 호가창이 구독·주문 키를 얻는다.
  it("응답에 isin 포함 — 마스터의 12자 표준코드가 그대로 실린다", async () => {
    const state: any = { masters: allMasters, quotes: [{ ...samsungQuote }] };
    const r = await request(
      createApp({ supabase: mockSupabase(state) }),
    ).get("/api/stocks/005930");
    expect(r.status).toBe(200);
    expect(r.body.isin).toBe("KR7005930003");
    expect(r.body.isin).toHaveLength(12);
    expect(r.body.isin).not.toBe(r.body.code); // 단축코드가 아니다 (산술 유도 금지)
  });

  it("isin 미백필 종목 → 응답 isin=null (키가 없다는 사실이 그대로 드러난다)", async () => {
    const state: any = { masters: allMasters, quotes: [] };
    const r = await request(
      createApp({ supabase: mockSupabase(state) }),
    ).get("/api/stocks/999999");
    expect(r.status).toBe(200);
    expect(r.body.isin).toBeNull();
  });

  it("잘못된 형식 → 400", async () => {
    const r = await request(
      createApp({ supabase: mockSupabase({ masters: allMasters }) }),
    ).get("/api/stocks/!!@@");
    expect(r.status).toBe(400);
  });
});

describe("inquirePriceToQuoteRow now 인자 (261001-bnc)", () => {
  it("주입 now → updated_at · rate_updated_at 둘 다 now.toISOString()", () => {
    const now = new Date("2026-10-01T10:00:00+09:00");
    const row = inquirePriceToQuoteRow("005930", okKa10001 as any, now);
    expect(row.updated_at).toBe("2026-10-01T01:00:00.000Z");
    expect(row.rate_updated_at).toBe("2026-10-01T01:00:00.000Z");
  });

  it("now 생략 → 현재 시각으로 두 필드가 같은 값", () => {
    const before = Date.now();
    const row = inquirePriceToQuoteRow("005930", okKa10001 as any);
    const t = Date.parse(row.updated_at);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
    expect(row.rate_updated_at).toBe(row.updated_at);
  });
});
