import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runBackfill } from "../backfill.js";

/**
 * Phase 08.1 Plan 05 T-03 — backfill runBackfill 단위 테스트.
 *
 * 검증:
 *  1. 250 rows / CHUNK_SIZE=100 → classify 3회 호출 (100 + 100 + 50)
 *  2. MAX_BACKFILL_ROWS=150 → 150 에서 중단, classify 호출 2회 (100 + chunk 가 50 단위)
 *  3. shouldStop 시뮬레이션 (SIGINT 대체) → 현재 chunk 완료 후 탈출, 다음 chunk 호출 안 됨
 *
 * 전략: SupabaseClient / classify / persist 를 stub 로 주입 (DI).
 * 첫 번째 SELECT call 은 지정된 rows 반환, 두 번째 call 은 빈 배열로 "no more rows" 종료.
 */

const silentLogger = pino({ level: "silent" });

function makeSupabaseStub(pages: Array<Array<{ id: string; title: string; body: string | null }>>) {
  let callCount = 0;
  const limitMock = vi.fn(async () => {
    const data = pages[callCount] ?? [];
    callCount++;
    return { data, error: null };
  });
  const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
  const isMock = vi.fn().mockReturnValue({ order: orderMock });
  const selectMock = vi.fn().mockReturnValue({ is: isMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });
  const stub = { from: fromMock } as unknown as SupabaseClient;
  return { stub, limitMock, selectMock, fromMock };
}

function makeRows(n: number, offset = 0): Array<{ id: string; title: string; body: string | null }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `row-${offset + i}`,
    title: `t-${offset + i}`,
    body: null,
  }));
}

beforeEach(() => {
  // env 는 runBackfill 자체가 직접 참조하지 않음 (DI 로 전달) — 안전하게 세팅
  process.env.ANTHROPIC_API_KEY = "test-anth";
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.BRIGHTDATA_API_KEY = "bd";
});

describe("runBackfill — Phase 08.1 Plan 05", () => {
  it("250 rows 를 chunkSize=100 으로 처리 → classify 3회 호출 (100+100+50)", async () => {
    const rows250 = makeRows(250);
    const { stub } = makeSupabaseStub([rows250, []]);

    const classifyMock = vi.fn(async (chunk: Array<{ id: string }>) => {
      const m = new Map<string, "noise">();
      for (const r of chunk) m.set(r.id, "noise");
      return m;
    });
    const persistMock = vi.fn(async (_s: unknown, labels: Map<string, unknown>) => labels.size);

    const result = await runBackfill({
      supabase: stub,
      log: silentLogger,
      maxRows: 20000,
      chunkSize: 100,
      selectPage: 10000,
      classify: classifyMock as unknown as typeof import("../classify/classifyBatch.js").classifyBatch,
      persist: persistMock as unknown as typeof import("../classify/persistRelevance.js").persistRelevance,
    });

    expect(classifyMock).toHaveBeenCalledTimes(3);
    expect(classifyMock.mock.calls[0][0]).toHaveLength(100);
    expect(classifyMock.mock.calls[1][0]).toHaveLength(100);
    expect(classifyMock.mock.calls[2][0]).toHaveLength(50);
    expect(result.processed).toBe(250);
    expect(result.classified).toBe(250);
    expect(result.failed).toBe(0);
  });

  it("MAX_BACKFILL_ROWS=150 설정 시 processed=150 에서 중단", async () => {
    const rows250 = makeRows(250);
    const { stub } = makeSupabaseStub([rows250, []]);

    const classifyMock = vi.fn(async (chunk: Array<{ id: string }>) => {
      const m = new Map<string, "noise">();
      for (const r of chunk) m.set(r.id, "noise");
      return m;
    });
    const persistMock = vi.fn(async (_s: unknown, labels: Map<string, unknown>) => labels.size);

    const result = await runBackfill({
      supabase: stub,
      log: silentLogger,
      maxRows: 150,
      chunkSize: 100,
      selectPage: 10000,
      classify: classifyMock as unknown as typeof import("../classify/classifyBatch.js").classifyBatch,
      persist: persistMock as unknown as typeof import("../classify/persistRelevance.js").persistRelevance,
    });

    // 100 → processed=100 (아직 < 150, 계속) → 100 → processed=200, 150 초과 → break.
    // 실제 처리: chunk 2회(100+100)=200 → maxRows 150 초과 판정 시점은 3번째 chunk 직전
    //   while 루프: processed=0, chunk1(100) → processed=100; chunk2(100) → processed=200
    //   ≥ maxRows 이므로 3번째 chunk 실행 전 break
    expect(classifyMock).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(200);
    expect(result.classified).toBe(200);
  });

  it("shouldStop=true 시뮬레이션 (SIGINT 대체) → 현재 chunk 완료 후 탈출", async () => {
    const rows250 = makeRows(250);
    const { stub } = makeSupabaseStub([rows250, []]);

    let callCount = 0;
    let shuttingDown = false;

    const classifyMock = vi.fn(async (chunk: Array<{ id: string }>) => {
      callCount++;
      // 첫 chunk 완료 후 shutdown signal 설정
      if (callCount === 1) shuttingDown = true;
      const m = new Map<string, "noise">();
      for (const r of chunk) m.set(r.id, "noise");
      return m;
    });
    const persistMock = vi.fn(async (_s: unknown, labels: Map<string, unknown>) => labels.size);

    const result = await runBackfill({
      supabase: stub,
      log: silentLogger,
      maxRows: 20000,
      chunkSize: 100,
      selectPage: 10000,
      classify: classifyMock as unknown as typeof import("../classify/classifyBatch.js").classifyBatch,
      persist: persistMock as unknown as typeof import("../classify/persistRelevance.js").persistRelevance,
      shouldStop: () => shuttingDown,
    });

    // 첫 chunk(100) 실행 → shuttingDown=true → 다음 chunk 건너뜀 → 루프 탈출
    expect(classifyMock).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(100);
  });
});
