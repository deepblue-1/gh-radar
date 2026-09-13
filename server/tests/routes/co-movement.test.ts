import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { mockSupabase } from "../fixtures/supabase-mock";

// ============================================================
// GET /api/stocks/:code/co-movement
//
// 계약(packages/shared CoMovementResponse): 응답은 **객체** { candidates: [...] }
//   (배열 아님 — 계약 드리프트 lesson, themes 상세와 동형).
//
// 입력은 stock_comovement_inputs(p_code) RPC 한 번으로 받는다 (migration 20260914090000).
// 입력 수집 의미(앵커 테마·멤버 전 행·양방향 이웃·hidden 테마 제외·후보 마스터/시세)는 SQL 이
// 소유한다 — 목에서 SQL 을 재현하지 않고 라우트 책임(RPC 1회·폴백 합성·점수 위임·k 클램프·
// 에러 전파)만 본다. SQL 의미는 마이그레이션 적용 직후 운영 응답과 종목별로 대조한다.
// 점수 계산 자체는 tests/lib 의 computeComovement 단위 테스트가 맡는다.
// ============================================================

const ANCHOR = "004090"; // 한국석유
const TID = "11111111-1111-4111-8111-111111111111";

function member(p: {
  theme_id?: string;
  stock_code: string;
  conf_d0?: number;
  ignite_days?: number;
}) {
  return {
    theme_id: p.theme_id ?? TID,
    stock_code: p.stock_code,
    ignite_days: p.ignite_days ?? 10,
    member_count: 10,
    conf_d0: p.conf_d0 ?? 0.5,
    conf_d1: 0.2,
    lift: 2,
    avg_ret: 18,
  };
}

function edge(x: string, y: string, co_count: number) {
  const [code_a, code_b] = x < y ? [x, y] : [y, x];
  return {
    code_a,
    code_b,
    co_count,
    lift: 2,
    avg_pair_ret: 18,
    w_sum_a: null,
    ws_sum_a: null,
    w_sum_b: null,
    ws_sum_b: null,
    recent_pairs: null,
  };
}

function stock(code: string, name: string | null, rate: string | null, market = "KOSPI") {
  return { code, name, market: name === null ? null : market, change_rate: rate };
}

const baseInputs = () => ({
  theme_ids: [TID],
  members: [
    member({ stock_code: ANCHOR, conf_d0: 0.6 }),
    member({ stock_code: "024060", conf_d0: 0.7 }),
  ],
  edges: [edge(ANCHOR, "024060", 9)],
  themes: [{ id: TID, name: "정유" }],
  stocks: [stock("024060", "흥구석유", "12", "KOSDAQ")],
});

function supabaseWith(rpc: { data?: unknown; error?: unknown }) {
  return mockSupabase({ rpc: { stock_comovement_inputs: rpc } });
}

const app = (inputs: unknown = baseInputs()) =>
  createApp({ supabase: supabaseWith({ data: inputs }) });

describe("GET /api/stocks/:code/co-movement (동조 후보)", () => {
  it("1: 응답이 객체 { candidates: [...] } (Array.isArray(body)===false)", async () => {
    const r = await request(app()).get(`/api/stocks/${ANCHOR}/co-movement?k=8`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(Array.isArray(r.body.candidates)).toBe(true);
  });

  it("2: RPC 입력 → liveChangeRate·coSurgeCount·공유 테마·마스터 name/market 합성", async () => {
    const r = await request(app()).get(`/api/stocks/${ANCHOR}/co-movement?k=8`);
    const c = r.body.candidates.find((x: any) => x.code === "024060");
    expect(c).toBeDefined();
    expect(c.liveChangeRate).toBe(12);
    expect(c.coSurgeCount).toBe(9);
    expect(c.name).toBe("흥구석유");
    expect(c.market).toBe("KOSDAQ");
    expect(c.sharedThemes).toEqual([{ id: TID, name: "정유" }]);
  });

  it("3: 앵커 테마/이웃 없음 → { candidates: [] }", async () => {
    const r = await request(
      app({ theme_ids: [], members: [], edges: [], themes: [], stocks: [] }),
    ).get(`/api/stocks/${ANCHOR}/co-movement`);
    expect(r.status).toBe(200);
    expect(r.body.candidates).toEqual([]);
  });

  it("4: ?k=999 → 최대 50 후보 (k 클램프)", async () => {
    const codes = Array.from({ length: 80 }, (_, i) => String(100000 + i));
    const inputs = {
      theme_ids: [TID],
      members: [
        member({ stock_code: ANCHOR, conf_d0: 0.6 }),
        ...codes.map((c, i) => member({ stock_code: c, conf_d0: 0.9 - i * 0.001 })),
      ],
      edges: [],
      themes: [{ id: TID, name: "대형테마" }],
      stocks: codes.map((c, i) => stock(c, `종목${c}`, String((i % 30) + 1))),
    };
    const r = await request(app(inputs)).get(`/api/stocks/${ANCHOR}/co-movement?k=999`);
    expect(r.status).toBe(200);
    expect(r.body.candidates.length).toBe(50);
  });

  it("5: stock_comovement_inputs RPC 1회(p_code=앵커) — 테이블 직접 조회 0회", async () => {
    const supabase = supabaseWith({ data: baseInputs() });
    const r = await request(createApp({ supabase })).get(
      `/api/stocks/${ANCHOR}/co-movement`,
    );
    expect(r.status).toBe(200);
    const rpcSpy = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy.mock.calls[0]).toEqual(["stock_comovement_inputs", { p_code: ANCHOR }]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("6: 마스터·시세 없는 후보 → name=code, liveChangeRate=null (종전 폴백 유지)", async () => {
    const inputs = { ...baseInputs(), stocks: [stock("024060", null, null)] };
    const r = await request(app(inputs)).get(`/api/stocks/${ANCHOR}/co-movement?k=8`);
    const c = r.body.candidates.find((x: any) => x.code === "024060");
    expect(c).toBeDefined();
    expect(c.name).toBe("024060");
    expect(c.liveChangeRate).toBeNull();
  });

  it("7: RPC 에러 → 500", async () => {
    const r = await request(
      createApp({ supabase: supabaseWith({ error: { message: "boom" } }) }),
    ).get(`/api/stocks/${ANCHOR}/co-movement`);
    expect(r.status).toBe(500);
  });
});
