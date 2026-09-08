/**
 * ISIN → 종목명·단축코드 역매핑 (`store/symbols.ts`).
 *
 * 증명 대상:
 *   ① `.range()` 페이징으로 **전량**을 읽는다 — `.limit()` 은 `db-max-rows`(1,000) 를
 *      못 넘는다. master-sync 의 delist-sweep 이 이 함정에 3개월 걸려 있었다.
 *   ② 적재 실패는 **throw 하지 않고** 옛 맵을 유지한다(이름은 표시용이다).
 *   ③ 갱신은 **하루 1회**다 — 조회마다 DB 를 때리지 않는다.
 *   ④ 같은 ISIN 이 활성·상장폐지로 겹치면 활성이 이긴다.
 *   ⑥ (Phase 16 D-02) `market` 이 `"KOSPI"`→`"K"` / `"KOSDAQ"`→`"Q"` / 그 외→**`null`** 이다.
 *      기본값 `"K"` 로 메우면 코스닥 주문이 코스피로 나간다 (T-16-05).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SymbolMap, msUntilNextRefresh, toOrderMarket } from "../src/store/symbols.js";

type Row = {
  code: string;
  name: string;
  isin: string;
  market: string | null;
  is_delisted: boolean;
};

/**
 * `stocks` 조회만 흉내내는 Supabase 스텁.
 * `.range(from, to)` 가 서버 상한(1,000행)을 그대로 모사한다.
 */
function mkSupabase(rows: Row[], opts: { failOn?: number } = {}) {
  const calls: Array<{ from: number; to: number }> = [];
  /** select 에 실린 컬럼 목록 원문 — `market` 누락 회귀를 잡는다. */
  const selects: string[] = [];
  const client = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return {
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
        };
      },
    }),
  };
  return { client: client as never, calls, selects };
}

function mkRows(n: number, offset = 0): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + offset;
    return {
      code: String(100000 + k).padStart(6, "0"),
      name: `종목${k}`,
      isin: `KR7${String(k).padStart(9, "0")}`,
      market: "KOSPI",
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
    expect(map.lookup("KR7000000000")).toEqual({ code: "100000", name: "종목0", market: "K" });
    // 마지막 페이지 소속 종목도 들어 있다.
    expect(map.lookup("KR7000002499")).toEqual({
      code: "102499",
      name: "종목2499",
      market: "K",
    });
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
      { code: "000001", name: "옛이름", isin: "KR7000000001", market: "KOSPI", is_delisted: true },
      { code: "000002", name: "새이름", isin: "KR7000000001", market: "KOSPI", is_delisted: false },
      { code: "000003", name: "폐지만", isin: "KR7000000003", market: "KOSPI", is_delisted: true },
    ];
    const { client } = mkSupabase(rows);
    const map = new SymbolMap(client);
    await map.refresh();

    expect(map.lookup("KR7000000001")).toEqual({ code: "000002", name: "새이름", market: "K" });
    // 폐지 종목만 있는 ISIN 은 그래도 담는다 — 당일 폐지분을 아직 들고 있을 수 있다.
    expect(map.lookup("KR7000000003")).toEqual({ code: "000003", name: "폐지만", market: "K" });
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

  it("⑥ market 은 KOSPI→K / KOSDAQ→Q / 그 외→null 로 실린다 (기본값 금지, T-16-05)", async () => {
    const rows: Row[] = [
      { code: "000001", name: "코스피", isin: "KR7000000001", market: "KOSPI", is_delisted: false },
      { code: "000002", name: "코스닥", isin: "KR7000000002", market: "KOSDAQ", is_delisted: false },
      { code: "000003", name: "코넥스", isin: "KR7000000003", market: "KONEX", is_delisted: false },
      { code: "000004", name: "널", isin: "KR7000000004", market: null, is_delisted: false },
    ];
    const { client } = mkSupabase(rows);
    const map = new SymbolMap(client);
    await map.refresh();

    expect(map.lookup("KR7000000001")?.market).toBe("K");
    expect(map.lookup("KR7000000002")?.market).toBe("Q");
    // ★ 여기가 이 케이스의 핵심이다 — 모르는 시장을 "K" 로 메우면 코스닥 주문이
    //   코스피로 나간다. 주문 조립 단계가 이 null 을 명시 거부한다.
    expect(map.lookup("KR7000000003")?.market).toBeNull();
    expect(map.lookup("KR7000000004")?.market).toBeNull();
    // 이름 표시는 여전히 된다 — market 미상은 주문만 막고 표시는 막지 않는다.
    expect(map.lookup("KR7000000003")?.name).toBe("코넥스");
    map.close();
  });

  it("⑦ market 컬럼을 select 에 싣는다 (컬럼 누락 회귀 가드)", async () => {
    const { client, selects } = mkSupabase(mkRows(1));
    const map = new SymbolMap(client);
    await map.refresh();

    // 컬럼이 빠지면 PostgREST 가 undefined 를 돌려주고 전 종목의 market 이 null 이 된다
    // — 그러면 주문이 전부 거부되는데 원인이 이 한 줄에 있다는 것이 드러나지 않는다.
    expect(selects).toEqual(["code, name, isin, market, is_delisted"]);
    map.close();
  });
});

describe("toOrderMarket", () => {
  it("변환은 이 함수 한 곳뿐이다 — 모르는 값은 지어내지 않고 null 이다 (D-21)", () => {
    expect(toOrderMarket("KOSPI")).toBe("K");
    expect(toOrderMarket("KOSDAQ")).toBe("Q");
    // 게이트웨이는 이 필드의 **첫 글자만** 읽는다. "KOSDAQ" 을 그대로 넘기면 어느 날
    // "K" 로 읽혀 코스닥 주문이 코스피로 나간다 — 그래서 원문 통과 경로가 없어야 한다.
    expect(toOrderMarket("K")).toBeNull();
    expect(toOrderMarket("Q")).toBeNull();
    expect(toOrderMarket("KONEX")).toBeNull();
    expect(toOrderMarket("")).toBeNull();
    expect(toOrderMarket(null)).toBeNull();
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
