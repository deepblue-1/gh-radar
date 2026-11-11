import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { IngestRow } from "../src/pipeline/classify";
import { ingestRows } from "../src/pipeline/ingest";

function fakeSupabase(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const ROW: IngestRow = {
  srno: "2026111209143512345",
  provider_code: "G",
  source: "코스닥 공시",
  kind: "disclosure",
  category: "01",
  title: "(주)가람전자 단일판매ㆍ공급계약체결",
  title_key: "주가람전자단일판매ㆍ공급계약체결",
  written_at: "2026-11-12T09:14:35+09:00",
  links: [{ code: "012340", hidden_reason: null }],
};

describe("ingestRows — kis_news_ingest 호출", () => {
  it("종목별 조회: rpc 인자 { p_rows, p_via: 'stock', p_queried_code } · 결과 세 수", async () => {
    const { client, rpc } = fakeSupabase({ data: { inserted: 1, revisions: 0, linked: 1 }, error: null });

    const out = await ingestRows(client, [ROW], "stock", "005930");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("kis_news_ingest", {
      p_rows: [ROW],
      p_via: "stock",
      p_queried_code: "005930",
    });
    expect(out).toEqual({ inserted: 1, revisions: 0, linked: 1 });
  });

  it("행이 0개여도 조회 코드가 있으면 rpc 를 부른다(수집 시각 기록)", async () => {
    const { client, rpc } = fakeSupabase({ data: { inserted: 0, revisions: 0, linked: 0 }, error: null });

    const out = await ingestRows(client, [], "stock", "005930");

    expect(rpc).toHaveBeenCalledWith("kis_news_ingest", { p_rows: [], p_via: "stock", p_queried_code: "005930" });
    expect(out).toEqual({ inserted: 0, revisions: 0, linked: 0 });
  });

  it("피드 경로는 조회 코드 없이 p_queried_code null", async () => {
    const { client, rpc } = fakeSupabase({ data: { inserted: 0, revisions: 1, linked: 2 }, error: null });

    await ingestRows(client, [ROW], "feed");

    expect(rpc).toHaveBeenCalledWith("kis_news_ingest", { p_rows: [ROW], p_via: "feed", p_queried_code: null });
  });

  it("rpc 오류는 throw — 원인 문구를 담는다", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "permission denied for function kis_news_ingest", code: "42501" } });

    await expect(ingestRows(client, [ROW], "stock", "005930")).rejects.toThrow(/kis_news_ingest.*permission denied/);
  });

  it("결과 모양이 다르면 빈 결과로 숨기지 않고 throw", async () => {
    const { client } = fakeSupabase({ data: { inserted: "x" }, error: null });

    await expect(ingestRows(client, [ROW], "feed")).rejects.toThrow(/kis_news_ingest/);
  });
});
