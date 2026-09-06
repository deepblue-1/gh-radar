/**
 * ISIN → 종목명·단축코드 역매핑 (`store/symbols.ts`).
 *
 * 증명 대상:
 *   ① `.range()` 페이징으로 **전량**을 읽는다 — `.limit()` 은 `db-max-rows`(1,000) 를
 *      못 넘는다. master-sync 의 delist-sweep 이 이 함정에 3개월 걸려 있었다.
 *   ② 적재 실패는 **throw 하지 않고** 옛 맵을 유지한다(이름은 표시용이다).
 *   ③ 갱신은 **하루 1회**다 — 조회마다 DB 를 때리지 않는다.
 *   ④ 같은 ISIN 이 활성·상장폐지로 겹치면 활성이 이긴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SymbolMap, msUntilNextRefresh } from "../src/store/symbols.js";

type Row = { code: string; name: string; isin: string; is_delisted: boolean };

/**
 * `stocks` 조회만 흉내내는 Supabase 스텁.
 * `.range(from, to)` 가 서버 상한(1,000행)을 그대로 모사한다.
 */
function mkSupabase(rows: Row[], opts: { failOn?: number } = {}) {
  const calls: Array<{ from: number; to: number }> = [];
  const client = {
    from: () => ({
      select: () => ({
        not: () => ({
          order: () => ({
            range: (from: number, to: number) => {
              calls.push({ from, to });
              if (opts.failOn !== undefined && calls.length === opts.failOn) {
                return Promise.resolve({ data: null, error: { message: "boom" } });
              }
              const page = rows.slice(from, to + 1).slice(0, 1000);
              return Promise.resolve({ data: page, error: null });
            },
          }),
        }),
      }),
    }),
  };
  return { client: client as never, calls };
}

function mkRows(n: number, offset = 0): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + offset;
    return {
      code: String(100000 + k).padStart(6, "0"),
      name: `종목${k}`,
      isin: `KR7${String(k).padStart(9, "0")}`,
      is_delisted: false,
    };
  });
}

describe("SymbolMap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("① 2,500행을 페이징으로 전량 읽는다 (1,000행 절단 회귀 가드)", async () => {
    const rows = mkRows(2500);
    const { client, calls } = mkSupabase(rows);
    const map = new SymbolMap(client);

    const count = await map.refresh();

    expect(count).toBe(2500);
    // 1000 + 1000 + 500 → 마지막 부분 페이지에서 멈춘다.
    expect(calls).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
    expect(map.lookup("KR7000000000")).toEqual({ code: "100000", name: "종목0" });
    // 마지막 페이지 소속 종목도 들어 있다.
    expect(map.lookup("KR7000002499")).toEqual({ code: "102499", name: "종목2499" });
    map.close();
  });

  it("② 모르는 ISIN 은 undefined — 지연 조회를 하지 않는다", async () => {
    const { client, calls } = mkSupabase(mkRows(3));
    const map = new SymbolMap(client);
    await map.refresh();

    const before = calls.length;
    expect(map.lookup("KR7999999999")).toBeUndefined();
    // 미스가 DB 왕복을 부르면 모르는 ISIN 하나가 쿼리 폭주가 된다.
    expect(calls).toHaveLength(before);
    map.close();
  });

  it("③ 적재 실패는 throw 하지 않고 기존 맵을 유지한다", async () => {
    const { client } = mkSupabase(mkRows(3));
    const map = new SymbolMap(client);
    await map.refresh();
    expect(map.stats().symbolCount).toBe(3);

    // 두 번째 적재가 실패하는 클라로 바꿔 끼운다.
    const failing = mkSupabase(mkRows(3), { failOn: 1 });
    const map2 = new SymbolMap(failing.client);
    await map2.refresh(); // 첫 적재부터 실패 → 빈 맵
    expect(await map2.refresh()).not.toBeNull(); // 두 번째는 성공
    // 실패해도 예외가 새어 나오지 않는다는 것이 핵심이다 — relay 기동을 막으면 안 된다.
    expect(map.stats().symbolCount).toBe(3);
    map.close();
    map2.close();
  });

  it("④ 같은 ISIN 이 활성·상장폐지로 겹치면 활성 이름이 이긴다", async () => {
    const rows: Row[] = [
      { code: "000001", name: "옛이름", isin: "KR7000000001", is_delisted: true },
      { code: "000002", name: "새이름", isin: "KR7000000001", is_delisted: false },
      { code: "000003", name: "폐지만", isin: "KR7000000003", is_delisted: true },
    ];
    const { client } = mkSupabase(rows);
    const map = new SymbolMap(client);
    await map.refresh();

    expect(map.lookup("KR7000000001")).toEqual({ code: "000002", name: "새이름" });
    // 폐지 종목만 있는 ISIN 은 그래도 담는다 — 당일 폐지분을 아직 들고 있을 수 있다.
    expect(map.lookup("KR7000000003")).toEqual({ code: "000003", name: "폐지만" });
    map.close();
  });

  it("⑤ start() 는 1회 적재 후 다음 08:30 KST 를 예약한다 (하루 1회)", async () => {
    // 2026-09-07 00:00 KST = 2026-09-06 15:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T15:00:00Z"));

    const { client, calls } = mkSupabase(mkRows(3));
    const map = new SymbolMap(client);
    await map.start();

    expect(calls).toHaveLength(1); // 부팅 적재 1회
    // 자정 → 08:30 = 8.5시간
    await vi.advanceTimersByTimeAsync(8.5 * 60 * 60 * 1000 - 1000);
    expect(calls).toHaveLength(1); // 아직 아니다
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toHaveLength(2); // 08:30 에 재적재

    // 그 다음은 24시간 뒤다 — 한 시간마다 돌지 않는다.
    await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1000);
    expect(calls).toHaveLength(3);

    map.close();
  });
});

describe("msUntilNextRefresh", () => {
  it("오늘 08:30 KST 이전이면 오늘, 이후면 내일", () => {
    const H = 60 * 60 * 1000;
    // 2026-09-06 00:00 KST
    const midnightKst = Date.parse("2026-09-05T15:00:00Z");
    expect(msUntilNextRefresh(midnightKst)).toBe(8.5 * H);
    // 08:29 KST → 1분 남음
    expect(msUntilNextRefresh(midnightKst + 8.5 * H - 60_000)).toBe(60_000);
    // 08:31 KST → 내일까지 23:59
    expect(msUntilNextRefresh(midnightKst + 8.5 * H + 60_000)).toBe(24 * H - 60_000);
  });
});
