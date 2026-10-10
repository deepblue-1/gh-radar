/**
 * Phase 29 Plan 28 — WR-02. `TailReload` 적재 조정기 단위 테스트.
 *
 * 잠그는 규칙(진행 슬롯 1 + 대기 꼬리 슬롯 1):
 *   - 진행이 없으면 `now()` · `shared()` 는 바로 적재 1회
 *   - 진행 중 `now()` → 그 적재가 끝난 뒤 꼬리 1회 · 꼬리 결과로 풀린다(커밋 뒤 요청은 커밋 뒤 시작한 읽기를 받는다)
 *   - 꼬리 시작 전에 겹친 `now()` 들은 같은 대기 꼬리를 공유한다(적재 2회)
 *   - 꼬리가 이미 읽는 중에 온 `now()` 는 그 꼬리에 합류하지 않고 다음 대기 꼬리를 받는다(체커 지적 경합 · 적재 3회)
 *   - `shared()` 는 진행 중이면 그 Promise 그대로(꼬리를 만들지 않는다 — 주기 타이머의 부하 그대로)
 *   - 진행 중 적재가 실패해도 꼬리는 돈다
 *   - `close()` 뒤 새 적재 없음 — 아직 시작 안 한 대기 꼬리도 시작하지 않고 진행 적재의 결과로 풀린다
 *
 * 대역 원천은 「지금 버전」 을 하나 쥐고, 적재는 시작 시점의 버전을 들고 멈춘다(테스트가 하나씩 풀어 준다).
 */
import { describe, expect, it } from "vitest";

import { TailReload } from "../src/util/tail-reload.js";

/** 대기 중인 마이크로태스크 · then 사슬을 다 돌린다. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

type Pending = { version: string; resolve: () => void; reject: (err: unknown) => void };

/** 시작 시점 버전을 읽어 들고 멈추는 대역 원천. */
function source(initial = "v0") {
  let version = initial;
  const started: Pending[] = [];
  const load = (): Promise<string> => {
    const v = version;
    return new Promise<string>((resolve, reject) => {
      started.push({ version: v, resolve: () => resolve(v), reject });
    });
  };
  return {
    load,
    /** 원천 커밋 — 이후 시작하는 적재부터 새 버전을 읽는다. */
    commit(v: string) {
      version = v;
    },
    /** 지금까지 시작한 적재 수. */
    get loads() {
      return started.length;
    },
    /** n 번째(0부터) 적재를 끝낸다. */
    finish(n: number) {
      const p = started[n];
      if (p === undefined) throw new Error(`적재 ${n} 이 시작되지 않았다`);
      p.resolve();
    },
    fail(n: number, err: unknown) {
      const p = started[n];
      if (p === undefined) throw new Error(`적재 ${n} 이 시작되지 않았다`);
      p.reject(err);
    },
  };
}

describe("TailReload — 진행 중 공유(주기) · 대기 꼬리(즉시) (Phase 29 WR-02)", () => {
  it("진행이 없으면 now() 는 바로 적재 1회 · 끝나면 inFlight false", async () => {
    const src = source();
    const r = new TailReload(src.load);
    expect(r.inFlight).toBe(false);

    const p = r.now();
    expect(src.loads).toBe(1);
    expect(r.inFlight).toBe(true);
    src.finish(0);
    await expect(p).resolves.toBe("v0");
    await flush();
    expect(r.inFlight).toBe(false);
    expect(src.loads).toBe(1);
  });

  it("진행 중 now() → 그 적재가 끝난 뒤 꼬리 1회 · 꼬리 결과(커밋 뒤 값)로 풀린다", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const periodic = r.shared(); // 주기 재적재가 v0 을 읽기 시작했다
    src.commit("v1"); // 그 사이 강등 커밋
    const immediate = r.now(); // 커밋 직후 즉시 재적재

    expect(immediate).not.toBe(periodic);
    expect(src.loads).toBe(1); // 꼬리는 진행이 끝나야 시작한다(동시 읽기 1)

    src.finish(0);
    await expect(periodic).resolves.toBe("v0");
    await flush();
    expect(src.loads).toBe(2);
    src.finish(1);
    await expect(immediate).resolves.toBe("v1");
  });

  it("꼬리 시작 전에 겹친 now() 3번 → 적재는 진행 1 + 꼬리 1 = 2회 · 셋 다 같은 꼬리 결과", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const first = r.now();
    src.commit("v1");
    const a = r.now();
    const b = r.now();
    const c = r.now();
    expect(b).toBe(a);
    expect(c).toBe(a);

    src.finish(0);
    await expect(first).resolves.toBe("v0");
    await flush();
    src.finish(1);
    await expect(Promise.all([a, b, c])).resolves.toEqual(["v1", "v1", "v1"]);
    await flush();
    expect(src.loads).toBe(2);
  });

  it("꼬리가 읽는 중 커밋 → 그 뒤 now() 는 그 꼬리에 합류하지 않고 다음 대기 꼬리(커밋 뒤 값) · 적재 3회 · 대기 꼬리 최대 1", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const p = r.shared(); // 적재 P(v0) 진행
    src.commit("v1");
    const a = r.now(); // 대기 꼬리 T1

    src.finish(0);
    await expect(p).resolves.toBe("v0");
    await flush();
    expect(src.loads).toBe(2); // T1 이 v1 을 들고 읽는 중

    src.commit("v2"); // T1 이 읽는 중에 커밋
    const b = r.now(); // T1 에 합류하면 v2 를 놓친다 — 새 대기 꼬리 T2
    expect(b).not.toBe(a);
    const c = r.now(); // T2 시작 전 — T2 를 공유
    expect(c).toBe(b);
    expect(src.loads).toBe(2);

    src.finish(1);
    await expect(a).resolves.toBe("v1");
    await flush();
    expect(src.loads).toBe(3);
    src.finish(2);
    await expect(b).resolves.toBe("v2");
    await expect(c).resolves.toBe("v2");
    await flush();
    expect(src.loads).toBe(3);
  });

  it("shared() 는 진행 중이면 그 Promise 그대로 — 꼬리를 만들지 않는다(주기 재적재 부하 그대로)", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const p1 = r.shared();
    const p2 = r.shared();
    expect(p2).toBe(p1);
    src.finish(0);
    await p1;
    await flush();
    expect(src.loads).toBe(1);

    // 진행이 없으면 shared() 도 바로 적재한다.
    const p3 = r.shared();
    expect(p3).not.toBe(p1);
    expect(src.loads).toBe(2);
    src.finish(1);
    await p3;
  });

  it("대기 꼬리가 있을 때 shared() 는 진행 적재를 공유한다(꼬리를 더 만들지 않는다)", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const p = r.now();
    const tail = r.now();
    const periodic = r.shared();
    expect(periodic).toBe(p);
    src.finish(0);
    await flush();
    src.finish(1);
    await tail;
    await flush();
    expect(src.loads).toBe(2);
  });

  it("진행 중 적재가 실패해도 꼬리는 돈다", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const p = r.now();
    const tail = r.now();
    src.fail(0, new Error("boom"));
    await expect(p).rejects.toThrow("boom");
    await flush();
    expect(src.loads).toBe(2);
    src.finish(1);
    await expect(tail).resolves.toBe("v0");
  });

  it("close() 뒤 새 적재 없음 — 시작 안 한 대기 꼬리는 시작하지 않고 진행 적재의 결과로 풀린다(매달림 없음)", async () => {
    const src = source();
    const r = new TailReload(src.load);
    const p = r.now();
    src.commit("v1");
    const tail = r.now();
    r.close();

    src.finish(0);
    await expect(p).resolves.toBe("v0");
    await expect(tail).resolves.toBe("v0");
    await flush();
    expect(src.loads).toBe(1);
    expect(r.inFlight).toBe(false);

    await expect(r.now()).rejects.toThrow(/closed/);
    await expect(r.shared()).rejects.toThrow(/closed/);
    expect(src.loads).toBe(1);
  });
});
