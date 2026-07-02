import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { mockSupabase } from "../../tests/fixtures/supabase-mock";

// ============================================================
// GET /api/home (홈 급등 테마 스냅샷 — HOME-01).
//
// 계약(packages/shared HomeSnapshotResponse): 응답은 **객체** { snapshot, index }
//   (배열 아님 — comovement/limitUp 드리프트 lesson). snapshot 은 대상 슬롯 payload 포함,
//   index 는 payload 제외 경량 네비게이션(최신순).
//   라우트는 home_theme_snapshots 만 SELECT — 실시간 시세 재조인/재계산 없음 (Pitfall 3).
// ============================================================

function payload(changeRate: number) {
  return {
    threshold: 20,
    marketStatus: "closed" as const,
    themes: [
      {
        name: "반도체",
        reason: "HBM 수요 급증",
        stocks: [{ code: "000660", name: "SK하이닉스", changeRate }],
        news: [{ title: "HBM 뉴스", url: "https://ex.com/1", source: "연합" }],
      },
    ],
    singles: [],
  };
}

function snapshotRow(p: {
  trade_date: string;
  captured_at: string;
  theme_count?: number;
  stock_count?: number;
  is_carried?: boolean;
  change_rate?: number;
}) {
  return {
    trade_date: p.trade_date,
    captured_at: p.captured_at,
    theme_count: p.theme_count ?? 1,
    stock_count: p.stock_count ?? 1,
    is_carried: p.is_carried ?? false,
    payload: payload(p.change_rate ?? 34.5),
    content_hash: "hash",
  };
}

const baseState = () => ({
  homeSnapshots: [
    snapshotRow({ trade_date: "2026-07-01", captured_at: "2026-07-01T00:30:00Z", change_rate: 21.1 }),
    snapshotRow({ trade_date: "2026-07-01", captured_at: "2026-07-01T06:30:00Z", change_rate: 34.5 }),
    snapshotRow({ trade_date: "2026-06-30", captured_at: "2026-06-30T06:30:00Z", change_rate: 25.0 }),
  ],
});

const app = (state: any = baseState()) => createApp({ supabase: mockSupabase(state) });

describe("GET /api/home (홈 급등 테마 스냅샷)", () => {
  // 1 — 응답은 객체 { snapshot, index } (배열 아님) + 최신 captured_at snapshot
  it("1: 무파라미터 → 객체 { snapshot, index } (배열 아님) + 최신 슬롯", async () => {
    const r = await request(app()).get("/api/home");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(false);
    expect(r.body.snapshot).toBeDefined();
    expect(Array.isArray(r.body.index)).toBe(true);
    // 최신 captured_at(06:30) 슬롯 선택
    expect(r.body.snapshot.capturedAt).toBe("2026-07-01T06:30:00Z");
    expect(r.body.snapshot.tradeDate).toBe("2026-07-01");
    // index 는 payload 제외 (경량)
    expect(r.body.index.length).toBe(3);
    expect(r.body.index[0].payload).toBeUndefined();
    expect(r.body.index[0].capturedAt).toBe("2026-07-01T06:30:00Z");
    // Cache-Control no-store
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  // 2 — 데이터 없음 → snapshot: null (빈 상태)
  it("2: 스냅샷 없음 → { snapshot: null, index: [] }", async () => {
    const r = await request(app({ homeSnapshots: [] })).get("/api/home");
    expect(r.status).toBe(200);
    expect(r.body.snapshot).toBeNull();
    expect(r.body.index).toEqual([]);
  });

  // 3 — 잘못된 date 쿼리 → 400
  it("3: 잘못된 date 쿼리(?date=xx) → 400", async () => {
    const r = await request(app()).get("/api/home?date=xx");
    expect(r.status).toBe(400);
  });

  // 4 — payload changeRate 는 저장 mock 값 verbatim (실시간 재조인 없음, Pitfall 3)
  it("4: payload changeRate 가 저장 mock 값과 동일 (verbatim, Pitfall 3)", async () => {
    const r = await request(app()).get("/api/home");
    expect(r.status).toBe(200);
    // 최신 06:30 슬롯의 mock changeRate=34.5 그대로
    expect(r.body.snapshot.payload.themes[0].stocks[0].changeRate).toBe(34.5);
    expect(r.body.snapshot.payload.threshold).toBe(20);
    expect(r.body.snapshot.payload.marketStatus).toBe("closed");
  });

  // 5 — date+capturedAt → eq("captured_at") 우선 분기 선택
  it("5: date+capturedAt → captured_at 정확 매칭 슬롯 반환 (date 무시)", async () => {
    // date=2026-07-01 이면 최신은 06:30(34.5) 이지만, capturedAt=00:30 을 정확 지정 →
    // capturedAt 분기가 우선해 00:30(21.1) 슬롯이 선택되어야 함.
    const r = await request(app()).get(
      "/api/home?date=2026-07-01&capturedAt=2026-07-01T00:30:00Z",
    );
    expect(r.status).toBe(200);
    expect(r.body.snapshot).not.toBeNull();
    expect(r.body.snapshot.capturedAt).toBe("2026-07-01T00:30:00Z");
    expect(r.body.snapshot.payload.themes[0].stocks[0].changeRate).toBe(21.1);
  });

  // 6 — "+00:00" 오프셋 표기 허용 (DB/index 가 이 형식을 반환 — 클라가 그대로 되돌려보냄)
  it('6: capturedAt "+00:00" 오프셋 형식도 200 (400 회귀 방지)', async () => {
    const r = await request(app()).get(
      "/api/home?capturedAt=" + encodeURIComponent("2026-07-01T00:30:00+00:00"),
    );
    expect(r.status).toBe(200);
  });
});
