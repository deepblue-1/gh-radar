/**
 * quick-260929-sas — 추가 게이트웨이 신원 적재기(`GatewayIdentities`) 단위 테스트.
 *
 * 정본 규칙은 DB 뷰 `dma_visibility_identities` 하나다(D-03). 이 모듈은 그 뷰를 추가 게이트웨이 키로만 읽어
 * relay 푸시 라우팅용 사본(`Map<gateway, Map<userId, dmaUserId>>`)을 쥔다. 잠그는 것:
 *   - 요청 모양: 테이블 · select 칸 · `in("gateway", 생성자 게이트웨이 목록)`
 *   - fail closed: 첫 적재 전(· 첫 적재 실패)에는 아무 신원도 없다 — 추가 게이트웨이 푸시 0
 *   - 적재 후 `viewOf(gw).dmaUserIdOf(user)` · 모르는 사용자 · 목록 밖 게이트웨이는 undefined
 *   - 실패 시 직전 값 유지 · 오류 로그에 사용자 id · dma id 가 없다(T-19-14)
 *   - 주기 재적재가 사라진 연결을 거둔다 · close 뒤 조회 없음 · 느린 조회 중 겹쳐 부르지 않음
 *
 * 가짜 supabase 는 `from(table).select(cols).in(col, vals)` 체인만 흉내 내고, 결과를 큐에서 차례로 돌려준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { GatewayIdentities, IDENTITY_REFRESH_MS } from "../src/journal/identities.js";
import { logger } from "../src/logger.js";

const U1 = "5a1c2b7a-9d40-4a11-8e55-0000000000a1";
const U2 = "5a1c2b7a-9d40-4a11-8e55-0000000000a2";
const U3 = "5a1c2b7a-9d40-4a11-8e55-0000000000a3";

const REFRESH_MS = 50;

type IdentityRow = { user_id: string; gateway: string; dma_user_id: string };
type Result = { data: IdentityRow[] | null; error: { code?: string; message: string; details?: string } | null };
type Call = { table: string; select: string; inColumn: string; inValues: readonly string[] };

type FakeDb = {
  client: SupabaseClient;
  calls: Call[];
  /** 다음 조회 결과를 큐에 넣는다. 큐가 비면 빈 성공. */
  queue(result: Result | Promise<Result>): void;
};

function fakeDb(): FakeDb {
  const calls: Call[] = [];
  const results: Array<Result | Promise<Result>> = [];
  const client = {
    from: (table: string) => ({
      select: (select: string) => ({
        in: (inColumn: string, inValues: readonly string[]) => {
          calls.push({ table, select, inColumn, inValues: [...inValues] });
          const next = results.shift() ?? { data: [], error: null };
          return Promise.resolve(next);
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls, queue: (r) => results.push(r) };
}

function ok(rows: IdentityRow[]): Result {
  return { data: rows, error: null };
}

async function flush(): Promise<void> {
  // 적재는 비동기 한 번(가짜 조회 Promise) — 마이크로태스크 몇 턴이면 끝난다.
  await vi.advanceTimersByTimeAsync(0);
}

describe("GatewayIdentities — 추가 게이트웨이 신원 적재 (quick-260929-sas)", () => {
  const loaders: GatewayIdentities[] = [];

  function make(db: FakeDb, gateways: readonly string[] = ["KYOBO"]): GatewayIdentities {
    const ids = new GatewayIdentities({ supabase: db.client, gateways, refreshMs: REFRESH_MS });
    loaders.push(ids);
    return ids;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });

  afterEach(() => {
    for (const ids of loaders.splice(0)) ids.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("기본 주기는 60초다", () => {
    expect(IDENTITY_REFRESH_MS).toBe(60_000);
  });

  it("요청 모양 — dma_visibility_identities · user_id, gateway, dma_user_id · in gateway = 생성자 게이트웨이 목록", async () => {
    const db = fakeDb();
    const ids = make(db, ["KYOBO", "MIRAE"]);
    ids.start();
    await flush();

    expect(db.calls).toHaveLength(1);
    const call = db.calls[0];
    expect(call?.table).toBe("dma_visibility_identities");
    expect(call?.select.split(",").map((c) => c.trim()).sort()).toEqual(["dma_user_id", "gateway", "user_id"]);
    expect(call?.inColumn).toBe("gateway");
    expect(call?.inValues).toEqual(["KYOBO", "MIRAE"]);
  });

  it("첫 적재 전에는 undefined(fail closed) · 적재 후 같은 뷰 객체가 새 값을 본다 · 모르는 사용자 · 목록 밖 게이트웨이 undefined", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const ids = make(db);
    const view = ids.viewOf("KYOBO");

    expect(view.dmaUserIdOf(U1)).toBeUndefined();
    ids.start();
    await flush();
    // 조회가 아직 안 끝났다 — 여전히 아무 신원도 없다.
    expect(view.dmaUserIdOf(U1)).toBeUndefined();

    release(
      ok([
        { user_id: U1, gateway: "KYOBO", dma_user_id: "dma-shared" },
        { user_id: U2, gateway: "KYOBO", dma_user_id: "kyobo-b" },
        // 목록 밖 게이트웨이 행이 섞여 와도 쓰지 않는다.
        { user_id: U3, gateway: "KB", dma_user_id: "dma-kb" },
      ]),
    );
    await flush();

    expect(view.dmaUserIdOf(U1)).toBe("dma-shared");
    expect(ids.viewOf("KYOBO").dmaUserIdOf(U2)).toBe("kyobo-b");
    expect(view.dmaUserIdOf(U3)).toBeUndefined();
    expect(ids.viewOf("KB").dmaUserIdOf(U3)).toBeUndefined();
  });

  it("첫 적재가 실패하면 계속 비어 있다(fail closed) · 다음 주기 성공으로 채워진다", async () => {
    const db = fakeDb();
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    db.queue({ data: null, error: { code: "57P01", message: "terminating connection" } });
    db.queue(ok([{ user_id: U1, gateway: "KYOBO", dma_user_id: "dma-shared" }]));
    const ids = make(db);
    ids.start();
    await flush();
    expect(ids.viewOf("KYOBO").dmaUserIdOf(U1)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(db.calls).toHaveLength(2);
    expect(ids.viewOf("KYOBO").dmaUserIdOf(U1)).toBe("dma-shared");
  });

  it("실패 시 직전 값 유지 · 오류 로그에 사용자 id · dma id · details 가 없다", async () => {
    const db = fakeDb();
    const logged: unknown[] = [];
    vi.spyOn(logger, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
      return undefined;
    });
    db.queue(ok([{ user_id: U1, gateway: "KYOBO", dma_user_id: "dma-shared" }]));
    db.queue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout", details: `row ${U1} dma-shared` },
    });
    const ids = make(db);
    ids.start();
    await flush();
    expect(ids.viewOf("KYOBO").dmaUserIdOf(U1)).toBe("dma-shared");

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(db.calls).toHaveLength(2);
    expect(ids.viewOf("KYOBO").dmaUserIdOf(U1)).toBe("dma-shared");

    expect(logged).toHaveLength(1);
    const dump = JSON.stringify(logged);
    expect(dump).toContain("57014");
    expect(dump).not.toContain(U1);
    expect(dump).not.toContain("dma-shared");
  });

  it("주기 재적재가 사라진 연결을 거둔다(통째 교체)", async () => {
    const db = fakeDb();
    db.queue(
      ok([
        { user_id: U1, gateway: "KYOBO", dma_user_id: "dma-shared" },
        { user_id: U2, gateway: "KYOBO", dma_user_id: "kyobo-b" },
      ]),
    );
    db.queue(ok([{ user_id: U1, gateway: "KYOBO", dma_user_id: "dma-shared" }]));
    const ids = make(db);
    const view = ids.viewOf("KYOBO");
    ids.start();
    await flush();
    expect(view.dmaUserIdOf(U2)).toBe("kyobo-b");

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(db.calls).toHaveLength(2);
    expect(view.dmaUserIdOf(U1)).toBe("dma-shared");
    expect(view.dmaUserIdOf(U2)).toBeUndefined();
  });

  it("close 뒤에는 더 조회하지 않는다", async () => {
    const db = fakeDb();
    const ids = make(db);
    ids.start();
    await flush();
    expect(db.calls).toHaveLength(1);

    ids.close();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 5);
    expect(db.calls).toHaveLength(1);
  });

  it("느린 조회 중에는 다음 주기가 겹쳐 부르지 않는다", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const ids = make(db);
    ids.start();
    await flush();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(db.calls).toHaveLength(1);

    release(ok([{ user_id: U1, gateway: "KYOBO", dma_user_id: "dma-shared" }]));
    await flush();
    expect(ids.viewOf("KYOBO").dmaUserIdOf(U1)).toBe("dma-shared");

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(db.calls).toHaveLength(2);
  });
});
