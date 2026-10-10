/**
 * Phase 29 Plan 33 — G-1 계좌별 주문 서버 지정 적재기(`AccountOrderServers`) 단위 테스트.
 *
 * AppAccess(29-06 · 29-28) 규율 복제를 잠근다:
 *   - 요청 모양: RPC `dma_account_order_servers`(인자 없음) · 부팅 즉시 + 주기
 *   - fail closed: 첫 적재 전 `chosenOf` = undefined · `loaded` false · `ready()` 미해결 · 첫 적재 실패 뒤 다음 주기 성공에 풀림
 *   - 재적재 diff → `changed(dmaUserIds)` 1회(지정이 바뀐 DMA 유저만) · 첫 적재 · 무변화 · 실패에는 없음
 *   - 실패 시 직전 사본 유지 + error 로그(`safePgError` — DMA id · 계좌번호 없음)
 *   - 꼬리(29-28 두 슬롯): 진행 중 `reload()` 는 그 뒤 한 번 더 읽는다 · 꼬리가 읽는 중 커밋 → 그 뒤 `reload()` 는 다음 꼬리
 *   - 행 가드: 증권사 밖 · 서버 키 형식 위반 · 빈 값은 건너뛰고 수만 센다
 *
 * 가짜 supabase 는 `rpc(fn, args)` 만 흉내 내고 결과를 큐에서 차례로 돌려준다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACCOUNT_ORDER_SERVERS_REFRESH_MS,
  AccountOrderServers,
} from "../src/access/account-order-servers.js";
import { logger } from "../src/logger.js";

const REFRESH_MS = 50;
const D1 = "dma-user-one";
const D2 = "dma-user-two";
const ACCT_A = "1234567801";
const ACCT_B = "1234567802";

type ChosenRow = { dma_user_id: unknown; broker: unknown; account_no: unknown; server_key: unknown };
type Result = { data: ChosenRow[] | null; error: { code?: string; message: string; details?: string } | null };
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

function ok(rows: ChosenRow[]): Result {
  return { data: rows, error: null };
}

function chosen(dma: string, account: string, serverKey: string, broker = "KB"): ChosenRow {
  return { dma_user_id: dma, broker, account_no: account, server_key: serverKey };
}

/** 부팅 사본 — d1 의 A → KB121 · d2 의 B → KB121. */
const BASE: ChosenRow[] = [chosen(D1, ACCT_A, "KB121"), chosen(D2, ACCT_B, "KB121")];

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("AccountOrderServers — 계좌별 주문 서버 지정 적재 (29-33 G-1)", () => {
  const loaders: AccountOrderServers[] = [];

  function make(db: FakeDb): AccountOrderServers {
    const a = new AccountOrderServers({ supabase: db.client, refreshMs: REFRESH_MS });
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

  it("기본 주기 60초 — 접근 맵 · 레지스트리와 같은 눈금", () => {
    expect(ACCOUNT_ORDER_SERVERS_REFRESH_MS).toBe(60_000);
  });

  it("요청 모양 — rpc dma_account_order_servers 1회(인자 없음) · 주기마다 재적재", async () => {
    const db = fakeDb();
    const a = make(db);
    a.start();
    a.start(); // 두 번 불러도 타이머 하나
    await flush();
    expect(db.calls).toEqual([{ fn: "dma_account_order_servers", args: undefined }]);
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 2);
    expect(db.calls).toHaveLength(3);
  });

  it("첫 적재 전 fail closed(chosenOf undefined · loaded false · ready 미해결) → 적재 뒤 지정 그대로 · 지정 없음은 undefined", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const a = make(db);
    let readyResolved = false;
    void a.ready().then(() => (readyResolved = true));
    a.start();
    await flush();
    expect(a.loaded).toBe(false);
    expect(readyResolved).toBe(false);
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBeUndefined();

    release(ok(BASE));
    await flush();
    expect(a.loaded).toBe(true);
    expect(readyResolved).toBe(true);
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB121");
    expect(a.chosenOf(D1, "KB", ACCT_B)).toBeUndefined(); // 지정 없음 = 기본값(라우팅 몫)
    expect(a.chosenOf(D1, "KYOBO", ACCT_A)).toBeUndefined(); // 증권사가 키의 한 축
    expect(a.entries()).toEqual([
      { dmaUserId: D1, broker: "KB", accountNo: ACCT_A, serverKey: "KB121" },
      { dmaUserId: D2, broker: "KB", accountNo: ACCT_B, serverKey: "KB121" },
    ]);
    // entries 는 사본이다 — 밖에서 고쳐도 사본이 오염되지 않는다.
    a.entries().pop();
    expect(a.entries()).toHaveLength(2);
  });

  it("첫 적재 실패 → loaded false 유지 · ready 미해결 · 다음 주기 성공에서 풀린다", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const db = fakeDb();
    db.queue({ data: null, error: { message: "boom" } });
    db.queue(ok(BASE));
    const a = make(db);
    let readyResolved = false;
    void a.ready().then(() => (readyResolved = true));
    a.start();
    await flush();
    expect(a.loaded).toBe(false);
    expect(readyResolved).toBe(false);
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(a.loaded).toBe(true);
    expect(readyResolved).toBe(true);
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB121");
  });

  it("재적재 — d1 지정 변경 → changed([d1]) 1회(d2 무변화는 빠진다) · 첫 적재는 이벤트 없음", async () => {
    const db = fakeDb();
    db.queue(ok(BASE));
    db.queue(ok([chosen(D1, ACCT_A, "KB122"), chosen(D2, ACCT_B, "KB121")]));
    const a = make(db);
    const events: string[][] = [];
    a.on("changed", (ids: string[]) => events.push(ids));
    a.start();
    await flush();
    expect(events).toEqual([]);

    await a.reload();
    expect(events).toEqual([[D1]]);
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB122");
  });

  it("재적재 — 지정 추가 · 해제(행 사라짐)도 그 DMA 유저 변경이다", async () => {
    const db = fakeDb();
    db.queue(ok(BASE));
    db.queue(ok([chosen(D1, ACCT_A, "KB121"), chosen(D1, ACCT_B, "KB121")])); // d1 B 추가 · d2 B 해제
    const a = make(db);
    const events: string[][] = [];
    a.on("changed", (ids: string[]) => events.push(ids));
    a.start();
    await flush();

    await a.reload();
    expect(events).toHaveLength(1);
    expect([...(events[0] ?? [])].sort()).toEqual([D1, D2].sort());
    expect(a.chosenOf(D2, "KB", ACCT_B)).toBeUndefined();
  });

  it("같은 행 재적재 → 이벤트 없음 · 실패 → 직전 사본 유지 + error 로그(safePgError · DMA id · 계좌번호 없음) · 이벤트 없음", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const db = fakeDb();
    db.queue(ok(BASE));
    db.queue(ok([...BASE].reverse())); // 순서만 다르다 — 지정은 같다
    db.queue({
      data: null,
      error: { code: "57P01", message: "terminating connection", details: `Key (dma_user_id, account_no)=(${D1}, ${ACCT_A})` },
    });
    const a = make(db);
    const events: string[][] = [];
    a.on("changed", (ids: string[]) => events.push(ids));
    a.start();
    await flush();

    await expect(a.reload()).resolves.toEqual({ ok: true });
    expect(events).toEqual([]);

    await expect(a.reload()).resolves.toEqual({ ok: false });
    expect(events).toEqual([]);
    expect(a.loaded).toBe(true);
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB121");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("57P01");
    expect(logged).not.toContain(D1);
    expect(logged).not.toContain(ACCT_A);
  });

  it("꼬리 — 주기 적재가 옛 행을 읽는 중 reload() → 그 뒤 한 번 더 읽어 새 지정이 보인다(RPC 2회 · changed 1회)", async () => {
    const db = fakeDb();
    db.queue(ok(BASE)); // 부팅 적재
    let releasePeriodic: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (releasePeriodic = resolve))); // 주기 재적재 — 지정 커밋 전에 시작
    db.queue(ok([chosen(D1, ACCT_A, "KB122"), chosen(D2, ACCT_B, "KB121")])); // 커밋 뒤 읽기
    const a = make(db);
    const events: string[][] = [];
    a.on("changed", (ids: string[]) => events.push(ids));
    a.start();
    await flush();
    const baseline = db.calls.length;

    await vi.advanceTimersByTimeAsync(REFRESH_MS); // 주기 재적재 시작(RPC 응답 멈춤)
    expect(db.calls.length - baseline).toBe(1);

    // Admin 이 d1 A 를 KB122 로 지정한 직후 즉시 재적재를 부른다.
    const immediate = a.reload();
    releasePeriodic(ok(BASE)); // 진행 중 주기 적재는 커밋 전 행을 돌려준다
    await expect(immediate).resolves.toEqual({ ok: true });
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB122");
    expect(events).toEqual([[D1]]);
    expect(db.calls.length - baseline).toBe(2);
  });

  it("꼬리 — 꼬리가 이미 읽는 중에 지정 커밋 → 그 뒤 reload() 는 그 꼬리에 합류하지 않고 다음 꼬리로 새 지정을 본다(RPC 3회)", async () => {
    const db = fakeDb();
    let releaseP: (r: Result) => void = () => undefined;
    let releaseT1: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (releaseP = resolve))); // 진행 P
    db.queue(new Promise<Result>((resolve) => (releaseT1 = resolve))); // 꼬리 T1 — v1 을 읽는 중
    db.queue(ok([chosen(D1, ACCT_A, "KB123")])); // T2 — 커밋 뒤(v2)
    const a = make(db);

    const p = a.reload();
    const t1 = a.reload();
    releaseP(ok(BASE));
    await p;
    expect(db.calls).toHaveLength(2); // T1 이 읽기 시작했다

    // T1 이 읽는 중에 v2 가 커밋되고 Admin 이 즉시 재적재를 부른다.
    const t2 = a.reload();
    expect(t2).not.toBe(t1);
    releaseT1(ok([chosen(D1, ACCT_A, "KB122")]));
    await t1;
    await expect(t2).resolves.toEqual({ ok: true });
    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB123");
    expect(db.calls).toHaveLength(3);
  });

  it("행 가드 — 증권사 밖 · 서버 키 형식 위반 · 빈 값은 건너뛰고 수만 센다(로그에 DMA id · 계좌번호 없음)", async () => {
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const db = fakeDb();
    db.queue(
      ok([
        chosen(D1, ACCT_A, "KB121"),
        chosen(D1, ACCT_B, "KB121", "NH"), // 증권사 밖
        chosen(D2, ACCT_A, "kb121"), // 키 형식 위반
        chosen(D2, ACCT_B, "KB1234"), // 키 형식 위반(숫자 4자리)
        chosen("", ACCT_A, "KB121"), // 빈 DMA id
        chosen(D2, "", "KB121"), // 빈 계좌
        { dma_user_id: D2, broker: "KB", account_no: ACCT_A, server_key: null }, // 비문자 키
      ]),
    );
    const a = make(db);
    a.start();
    await flush();

    expect(a.chosenOf(D1, "KB", ACCT_A)).toBe("KB121");
    expect(a.chosenOf(D1, "NH", ACCT_B)).toBeUndefined();
    expect(a.chosenOf(D2, "KB", ACCT_A)).toBeUndefined();
    expect(a.chosenOf(D2, "KB", ACCT_B)).toBeUndefined();
    expect(a.entries()).toHaveLength(1);
    const summary = infoSpy.mock.calls.find((c) => typeof c[1] === "string" && c[1].includes("첫 적재"));
    expect(summary?.[0]).toEqual({ users: 1, accounts: 1, skipped: 6 });
    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).not.toContain(D1);
    expect(logged).not.toContain(D2);
    expect(logged).not.toContain(ACCT_A);
    expect(logged).not.toContain(ACCT_B);
  });

  it("close 뒤 — reload 는 조회 없이 ok:false · 주기 타이머 정지", async () => {
    const db = fakeDb();
    const a = make(db);
    a.start();
    await flush();
    a.close();
    await expect(a.reload()).resolves.toEqual({ ok: false });
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(db.calls).toHaveLength(1);
  });
});
