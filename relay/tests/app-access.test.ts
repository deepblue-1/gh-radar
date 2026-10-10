/**
 * Phase 29 Plan 06 — 웹 사용자 접근 맵 적재기(`AppAccess`) 단위 테스트 (D-02 · D-04 · D-19).
 *
 * identities.ts · registry.ts 규율 복제를 잠근다:
 *   - 요청 모양: RPC `dma_app_access_map`(인자 없음)
 *   - fail closed: 첫 적재 전 `entryOf` = undefined · `loaded` false · `ready()` 미해결
 *   - 적재 뒤 RPC 행 그대로(camelCase) · 행 가드(역할 밖 · 빈 user_id 건너뜀 · 빈 dma id = null)
 *   - `dmaUserIdOf` = admin/trader + DMA 연결일 때만(푸시 신원 · GatewayIdentityView)
 *   - 실패 시 직전 맵 유지 + error 로그(사유 `safePgError` — 이메일 · dmaUserId 없음)
 *   - 겹친 reload 는 진행 1 + 꼬리 1(WR-02) · 주기 틱만 겹치면 RPC 1회 · close 뒤 조회 없음
 *   - WR-02 경합: 주기 재적재가 옛 행을 읽는 중 강등 커밋 → 즉시 reload 가 꼬리로 강등을 반영
 *   - `lookup` 미스 → 단발 재적재(최소 간격) · 진행 중 적재 대기
 *
 * 가짜 supabase 는 `rpc(fn, args)` 만 흉내 내고 결과를 큐에서 차례로 돌려준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  APP_ACCESS_MISS_RELOAD_MIN_MS,
  APP_ACCESS_REFRESH_MS,
  AppAccess,
} from "../src/access/app-access.js";
import { logger } from "../src/logger.js";

const U1 = "6b1c2b7a-9d40-4a11-8e55-0000000000a1";
const U2 = "6b1c2b7a-9d40-4a11-8e55-0000000000a2";
const U3 = "6b1c2b7a-9d40-4a11-8e55-0000000000a3";
const U4 = "6b1c2b7a-9d40-4a11-8e55-0000000000a4";

const REFRESH_MS = 50;

type AccessRow = { user_id: unknown; email: unknown; role: unknown; dma_user_id: unknown };
type Result = { data: AccessRow[] | null; error: { code?: string; message: string; details?: string } | null };
type Call = { fn: string; args: unknown };

type FakeDb = {
  client: SupabaseClient;
  calls: Call[];
  queue(result: Result | Promise<Result>): void;
};

function fakeDb(): FakeDb {
  const calls: Call[] = [];
  const results: Array<Result | Promise<Result>> = [];
  const client = {
    rpc: (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      const next = results.shift() ?? { data: [], error: null };
      return Promise.resolve(next);
    },
  } as unknown as SupabaseClient;
  return { client, calls, queue: (r) => results.push(r) };
}

function ok(rows: AccessRow[]): Result {
  return { data: rows, error: null };
}

const ROWS: AccessRow[] = [
  { user_id: U1, email: "trader@example.com", role: "trader", dma_user_id: "dmaA" },
  { user_id: U2, email: "viewer@example.com", role: "viewer", dma_user_id: "dmaB" },
  { user_id: U3, email: "nodma@example.com", role: "trader", dma_user_id: null },
  { user_id: U4, email: "admin@example.com", role: "admin", dma_user_id: "dmaA" },
];

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("AppAccess — 접근 맵 적재 (Phase 29 D-02 · D-04)", () => {
  const loaders: AppAccess[] = [];

  function make(db: FakeDb, missReloadMinMs = APP_ACCESS_MISS_RELOAD_MIN_MS): AppAccess {
    const a = new AppAccess({ supabase: db.client, refreshMs: REFRESH_MS, missReloadMinMs });
    loaders.push(a);
    return a;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });

  afterEach(() => {
    for (const a of loaders.splice(0)) a.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("기본 주기 60초 · 미스 단발 재적재 최소 간격 2초", () => {
    expect(APP_ACCESS_REFRESH_MS).toBe(60_000);
    expect(APP_ACCESS_MISS_RELOAD_MIN_MS).toBe(2_000);
  });

  it("요청 모양 — rpc dma_app_access_map 1회(인자 없음) · 주기마다 재적재", async () => {
    const db = fakeDb();
    const a = make(db);
    a.start();
    a.start(); // 두 번 불러도 타이머 하나
    await flush();
    expect(db.calls).toEqual([{ fn: "dma_app_access_map", args: undefined }]);

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(db.calls).toHaveLength(2);
  });

  it("첫 적재 전 fail closed(entryOf undefined · loaded false · ready 미해결) → 적재 뒤 RPC 행 그대로", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const a = make(db);
    let readyResolved = false;
    void a.ready().then(() => (readyResolved = true));

    expect(a.entryOf(U1)).toBeUndefined();
    expect(a.dmaUserIdOf(U1)).toBeUndefined();
    a.start();
    await flush();
    expect(a.loaded).toBe(false);
    expect(readyResolved).toBe(false);

    release(ok(ROWS));
    await flush();

    expect(a.loaded).toBe(true);
    expect(readyResolved).toBe(true);
    expect(a.entryOf(U1)).toEqual({ userId: U1, email: "trader@example.com", role: "trader", dmaUserId: "dmaA" });
    expect(a.entryOf(U3)).toEqual({ userId: U3, email: "nodma@example.com", role: "trader", dmaUserId: null });
    expect(a.entryOf("unknown")).toBeUndefined();
  });

  it("dmaUserIdOf(푸시 신원) — admin/trader + DMA 연결만 · viewer · 연결 없음 · 맵 밖은 undefined", async () => {
    const db = fakeDb();
    db.queue(ok(ROWS));
    const a = make(db);
    a.start();
    await flush();

    expect(a.dmaUserIdOf(U1)).toBe("dmaA");
    expect(a.dmaUserIdOf(U4)).toBe("dmaA"); // 같은 DMA id 공유
    expect(a.dmaUserIdOf(U2)).toBeUndefined(); // viewer
    expect(a.dmaUserIdOf(U3)).toBeUndefined(); // DMA 연결 없음
    expect(a.dmaUserIdOf("unknown")).toBeUndefined();
  });

  it("행 가드 — 역할 밖 · 빈 user_id · 비문자 이메일은 건너뛰고, 빈 dma id 는 null", async () => {
    const db = fakeDb();
    db.queue(
      ok([
        { user_id: U1, email: "a@example.com", role: "owner", dma_user_id: "x" },
        { user_id: "", email: "b@example.com", role: "trader", dma_user_id: "x" },
        { user_id: U2, email: null, role: "trader", dma_user_id: "x" },
        { user_id: U3, email: "c@example.com", role: "trader", dma_user_id: "" },
      ]),
    );
    const a = make(db);
    a.start();
    await flush();

    expect(a.entryOf(U1)).toBeUndefined();
    expect(a.entryOf(U2)).toBeUndefined();
    expect(a.entryOf(U3)).toEqual({ userId: U3, email: "c@example.com", role: "trader", dmaUserId: null });
  });

  it("실패 시 직전 맵 유지 + error 로그(safePgError · 이메일 · dmaUserId 없음)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const db = fakeDb();
    db.queue(ok(ROWS));
    db.queue({ data: null, error: { code: "57P01", message: "terminating connection", details: "Key (email)=(trader@example.com) dmaA" } });
    const a = make(db);
    a.start();
    await flush();
    expect(a.entryOf(U1)?.dmaUserId).toBe("dmaA");

    const r = await a.reload();
    expect(r).toEqual({ ok: false, revoked: [] });
    expect(a.entryOf(U1)?.dmaUserId).toBe("dmaA");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("57P01");
    expect(logged).not.toContain("trader@example.com");
    expect(logged).not.toContain("dmaA");
  });

  it("첫 적재 실패 → loaded false 유지 · ready 미해결 · 다음 주기 성공에서 풀린다", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const db = fakeDb();
    db.queue({ data: null, error: { message: "boom" } });
    db.queue(ok(ROWS));
    const a = make(db);
    let readyResolved = false;
    void a.ready().then(() => (readyResolved = true));
    a.start();
    await flush();
    expect(a.loaded).toBe(false);
    expect(readyResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(a.loaded).toBe(true);
    expect(readyResolved).toBe(true);
  });

  it("겹친 reload 는 꼬리 1개를 공유(WR-02 — 진행 1 + 꼬리 1 = RPC 2회) · close 뒤 조회 없음", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const a = make(db);
    const p1 = a.reload();
    const p2 = a.reload();
    const p3 = a.reload();
    expect(p2).not.toBe(p1); // 진행 중 즉시 재적재는 꼬리다
    expect(p3).toBe(p2); // 꼬리 시작 전에 겹친 요청은 같은 꼬리
    release(ok(ROWS));
    await p1;
    await p2;
    expect(db.calls).toHaveLength(2);

    a.close();
    await expect(a.reload()).resolves.toEqual({ ok: false, revoked: [] });
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(db.calls).toHaveLength(2);
  });

  it("주기 타이머만 겹치면(즉시 요청 없음) RPC 1회 — 꼬리를 만들지 않는다(종전 부하 그대로)", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const a = make(db);
    a.start(); // 부팅 즉시 적재가 멈춰 있다
    await flush();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3); // 주기 틱 3번 — 전부 진행 중 적재를 공유
    expect(db.calls).toHaveLength(1);
    release(ok(ROWS));
    await flush();
    expect(db.calls).toHaveLength(1);
  });

  it("lookup — 맵에 있으면 RPC 없이 · 미스면 단발 재적재 1회 뒤 다시 본다(방금 승인된 사용자)", async () => {
    const db = fakeDb();
    db.queue(ok([]));
    db.queue(ok(ROWS));
    const a = make(db, 60_000);
    a.start();
    await flush();
    expect(db.calls).toHaveLength(1);

    await expect(a.lookup(U1)).resolves.toEqual(expect.objectContaining({ userId: U1, role: "trader" }));
    expect(db.calls).toHaveLength(2);
    // 이제 맵에 있다 — 추가 RPC 없음.
    await a.lookup(U1);
    expect(db.calls).toHaveLength(2);
  });

  it("lookup — 최소 간격 안의 미스는 재적재 없이 undefined(승인 대기 재접속이 RPC 폭주가 되지 않게)", async () => {
    const db = fakeDb();
    const a = make(db, 60_000);
    a.start();
    await flush();
    expect(db.calls).toHaveLength(1);

    await expect(a.lookup("pending-user")).resolves.toBeUndefined();
    expect(db.calls).toHaveLength(2);
    await expect(a.lookup("pending-user")).resolves.toBeUndefined();
    await expect(a.lookup("other-pending")).resolves.toBeUndefined();
    expect(db.calls).toHaveLength(2);
  });

  it("lookup — 첫 적재가 진행 중이면 그것을 기다린다(부팅 직후 인증이 바로 실패하지 않게)", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const a = make(db);
    a.start();
    await flush();

    const pending = a.lookup(U1);
    release(ok(ROWS));
    await expect(pending).resolves.toEqual(expect.objectContaining({ userId: U1 }));
    expect(db.calls).toHaveLength(1);
  });
});

describe("AppAccess — 재적재 diff → revoked (Phase 29 D-04)", () => {
  const loaders: AppAccess[] = [];
  const U5 = "6b1c2b7a-9d40-4a11-8e55-0000000000a5";
  const U6 = "6b1c2b7a-9d40-4a11-8e55-0000000000a6";

  const BEFORE: AccessRow[] = [
    { user_id: U1, email: "gone@example.com", role: "trader", dma_user_id: "dmaA" },
    { user_id: U2, email: "demoted@example.com", role: "trader", dma_user_id: "dmaB" },
    { user_id: U3, email: "unlinked@example.com", role: "admin", dma_user_id: "dmaC" },
    { user_id: U4, email: "relinked@example.com", role: "trader", dma_user_id: "dmaD" },
    { user_id: U5, email: "same@example.com", role: "trader", dma_user_id: "dmaE" },
    { user_id: U6, email: "admin2trader@example.com", role: "admin", dma_user_id: "dmaF" },
  ];
  const AFTER: AccessRow[] = [
    // U1 사라짐(허용 해제)
    { user_id: U2, email: "demoted@example.com", role: "viewer", dma_user_id: "dmaB" }, // viewer 로 강등
    { user_id: U3, email: "unlinked@example.com", role: "admin", dma_user_id: null }, // DMA 연결 끊김
    { user_id: U4, email: "relinked@example.com", role: "trader", dma_user_id: "dmaZ" }, // 다른 DMA id 로
    { user_id: U5, email: "same@example.com", role: "trader", dma_user_id: "dmaE" }, // 그대로
    { user_id: U6, email: "admin2trader@example.com", role: "trader", dma_user_id: "dmaF" }, // admin → trader 는 DMA 권한 유지
  ];

  function make(db: FakeDb): AppAccess {
    const a = new AppAccess({ supabase: db.client, refreshMs: REFRESH_MS });
    loaders.push(a);
    return a;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });

  afterEach(() => {
    for (const a of loaders.splice(0)) a.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("첫 적재는 revoked 를 내지 않는다", async () => {
    const db = fakeDb();
    db.queue(ok(BEFORE));
    const a = make(db);
    const events: string[][] = [];
    a.on("revoked", (ids: string[]) => events.push(ids));

    await expect(a.reload()).resolves.toEqual({ ok: true, revoked: [] });
    expect(events).toEqual([]);
  });

  it("사라짐 · viewer 강등 · DMA 연결 끊김 · DMA id 변경 → revoked 1회(배열) · 그대로 · admin→trader 는 빠진다", async () => {
    const db = fakeDb();
    db.queue(ok(BEFORE));
    db.queue(ok(AFTER));
    const a = make(db);
    const events: string[][] = [];
    a.on("revoked", (ids: string[]) => events.push(ids));
    await a.reload();

    const r = await a.reload();
    expect(r.ok).toBe(true);
    // 순서 무관 비교 — 정렬한 id 를 한 줄로(실패 보고가 한 줄로 남게).
    const expected = [U1, U2, U3, U4].sort().join(",");
    expect([...r.revoked].sort().join(",")).toBe(expected);
    expect(events).toHaveLength(1);
    expect([...(events[0] ?? [])].sort().join(",")).toBe(expected);
    // 교체는 이미 끝났다 — 이벤트 리스너가 새 맵을 본다.
    expect(a.dmaUserIdOf(U2)).toBeUndefined();
    expect(a.dmaUserIdOf(U4)).toBe("dmaZ");
  });

  it("WR-02 — 주기 재적재가 옛 행을 읽는 중 강등 커밋 → 즉시 reload() 는 꼬리로 강등을 반영(revoked 에 u1 · 이벤트 1회 · RPC 2회)", async () => {
    const db = fakeDb();
    const TRADER: AccessRow[] = [{ user_id: U1, email: "demoted@example.com", role: "trader", dma_user_id: "dmaA" }];
    const VIEWER: AccessRow[] = [{ user_id: U1, email: "demoted@example.com", role: "viewer", dma_user_id: "dmaA" }];
    db.queue(ok(TRADER)); // 부팅 적재
    let releasePeriodic: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (releasePeriodic = resolve))); // 주기 재적재 — 강등 커밋 전에 시작
    db.queue(ok(VIEWER)); // 커밋 뒤 읽기
    const a = make(db);
    const events: string[][] = [];
    a.on("revoked", (ids: string[]) => events.push(ids));
    a.start();
    await flush();
    expect(a.dmaUserIdOf(U1)).toBe("dmaA");
    const baseline = db.calls.length;

    await vi.advanceTimersByTimeAsync(REFRESH_MS); // 주기 재적재 시작(RPC 응답 멈춤)
    expect(db.calls.length - baseline).toBe(1);

    // DB 가 u1 을 viewer 로 바꾼 직후 Express 가 /internal/admin/access/reload 를 부른다.
    const immediate = a.reload();
    releasePeriodic(ok(TRADER)); // 진행 중 주기 적재는 커밋 전 행(trader)을 돌려준다
    await expect(immediate).resolves.toEqual({ ok: true, revoked: [U1] });
    expect(events).toEqual([[U1]]);
    expect(a.dmaUserIdOf(U1)).toBeUndefined();
    // 경합 구간 RPC = 주기 1 + 꼬리 1.
    expect(db.calls.length - baseline).toBe(2);
  });

  it("변화 없음 · 적재 실패 → revoked 이벤트 없음", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const db = fakeDb();
    db.queue(ok(BEFORE));
    db.queue(ok(BEFORE));
    db.queue({ data: null, error: { message: "boom" } });
    const a = make(db);
    const events: string[][] = [];
    a.on("revoked", (ids: string[]) => events.push(ids));
    await a.reload();

    await expect(a.reload()).resolves.toEqual({ ok: true, revoked: [] });
    await expect(a.reload()).resolves.toEqual({ ok: false, revoked: [] });
    expect(events).toEqual([]);
  });
});
