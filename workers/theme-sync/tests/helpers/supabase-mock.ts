// Phase 10 Wave 0 — Supabase JS v2 SDK 모킹 헬퍼. workers/theme-sync 테스트 전용.
//
// discussion-sync/news-sync 의 createSupabaseMock 패턴을 확장 — Wave 2+ 의
// theme_stocks FK-skip + upsert integration test 가 from()/select()/eq()/in()/is()/
// maybeSingle()/single() + rpc() 체이닝을 mock 으로 검증할 수 있도록 한다.
//
// 설계:
// - 필터/세터 메소드(select/eq/in/is/...)는 vi.fn().mockReturnThis() 로 체이닝.
// - 종결 메소드(single/maybeSingle/...)는 store 기반 기본값을 resolve 하되,
//   테스트가 createMockSupabase(...).from('t').<method>.mockResolvedValueOnce(...) 로
//   final method 에 임의 응답을 주입할 수 있다(Phase 09 'final method 에서 mockResolvedValue' 선례).
// - thenable(awaitable builder) 흉내는 내지 않는다 — Supabase v2 는 종결 메소드 또는
//   await chain 둘 다 지원하나, 본 mock 은 명시 종결 메소드 경로만 지원하면 충분하다
//   (RESEARCH §Pattern 5/upsert 가 .select()/.in()/.eq()/.upsert() 종결을 사용).
import { vi } from "vitest";

export interface MockSupabaseChain {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

export interface MockSupabase {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  /** table 이름 → 마지막으로 반환된 chain. 테스트에서 종결 메소드 응답 주입/assert 용. */
  _chains: Record<string, MockSupabaseChain>;
  /** 초기 seed rows. select/limit 기본 응답에 사용. */
  _store: Record<string, unknown[]>;
}

/**
 * Supabase service-role 클라이언트 mock 생성.
 *
 * @param tables  table 별 seed rows. `from(t).select()...limit()` / `.maybeSingle()` /
 *                `.single()` 의 기본 resolve 값에 사용된다.
 *
 * @example
 *   const sb = createMockSupabase({ stocks: [{ code: "005930" }] });
 *   // 존재 종목 lookup
 *   sb.from("stocks").select.mockReturnThis();
 *   sb.from("stocks").in.mockResolvedValueOnce({ data: [{ code: "005930" }], error: null });
 *   // upsert 검증
 *   expect(sb._chains.theme_stocks.upsert).toHaveBeenCalled();
 */
export function createMockSupabase(
  tables: Record<string, unknown[]> = {},
): MockSupabase {
  const store: Record<string, unknown[]> = { ...tables };
  const chains: Record<string, MockSupabaseChain> = {};

  const makeChain = (table: string): MockSupabaseChain => {
    const rows = store[table] ?? [];
    const chain: MockSupabaseChain = {
      // 필터/세터 — 체이닝 (return this)
      select: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      // 쓰기 — insert 는 row 기록 후 chain 반환(.select().single() 체이닝 지원).
      //   bare `await .insert(row)` 는 본 mock 사용처에 없음(직접 await 시 chain 반환).
      //   .select().single() 종결값은 테스트가 .single.mockResolvedValue 로 주입.
      insert: vi.fn(function (this: MockSupabaseChain, row: unknown) {
        (store[table] ??= []).push(row);
        return this;
      }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      // 읽기 종결 — store 기반 기본값 (테스트가 mockResolvedValueOnce 로 override)
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
      // .range(from,to) — 결과-행 페이지네이션 종결. store 를 [from,to] 슬라이스(이름→코드 해석).
      range: vi.fn((from: number, to: number) =>
        Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      ),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: rows[0] ?? null, error: null }),
      single: vi
        .fn()
        .mockResolvedValue({ data: rows[0] ?? null, error: null }),
    };
    return chain;
  };

  const from = vi.fn((table: string) => {
    // 동일 table 호출은 같은 chain 반환 — 테스트가 _chains[table] 로 assert 가능.
    chains[table] ??= makeChain(table);
    return chains[table];
  });

  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  return { from, rpc, _chains: chains, _store: store };
}
