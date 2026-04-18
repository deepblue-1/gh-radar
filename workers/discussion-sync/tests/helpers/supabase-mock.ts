// Phase 08 — Supabase JS SDK 모킹 헬퍼. workers/discussion-sync 테스트 전용.
// Phase 7 workers/news-sync/tests/helpers/supabase-mock.ts 와 1:1 동일 (쓰임새 동일).
// Plan 08-02 가 실제 사용 시에 필요한 메소드를 추가 확장. 본 스텁은 초기 scaffolding.
import { vi } from "vitest";

export function createSupabaseMock(tables: Record<string, unknown[]> = {}) {
  const store = { ...tables } as Record<string, unknown[]>;
  const fromSpy = vi.fn((table: string) => {
    const rows = store[table] ?? [];
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn((row: unknown) => {
        (store[table] ??= []).push(row);
        return Promise.resolve({ data: null, error: null });
      }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ count: 0, error: null }),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: rows[0] ?? null, error: null }),
    };
    return chain;
  });
  const rpcSpy = vi.fn().mockResolvedValue({ data: 1, error: null });
  return { from: fromSpy, rpc: rpcSpy, _store: store };
}
