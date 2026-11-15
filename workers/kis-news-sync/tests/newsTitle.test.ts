import { describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import fixture from "./fixtures/kis-news-title-sample.json";
import type { KisNewsTitleRow } from "../src/kis/types";
import { KisApiError, KIS_NEWS_TITLE_PATH } from "../src/kis/client";
import {
  cursorOf,
  cursorParams,
  fetchNewsTitlePage,
  pageUntilSeen,
  type NewsTitleCursor,
} from "../src/kis/newsTitle";

/**
 * Phase 41-13 — 한투 news-title 한 쪽 호출 · 커서 되감기(Pitfall 3).
 * 기대값은 2026-11-11 실측 표본(`steps.all_latest` → `steps.cont_by_cursor`)의 커서 파라미터 그대로다.
 */

const steps = fixture.steps;
const PAGE1 = steps.all_latest.output as KisNewsTitleRow[];
const PAGE2 = steps.cont_by_cursor.output as KisNewsTitleRow[];

const AUTH = { token: "TOKEN-XYZ", appkey: "APPKEY-XYZ", appsecret: "SECRET-XYZ" };
const EMPTY_PARAMS = {
  FID_NEWS_OFER_ENTP_CODE: "",
  FID_COND_MRKT_CLS_CODE: "",
  FID_INPUT_ISCD: "",
  FID_TITL_CNTT: "",
  FID_INPUT_DATE_1: "",
  FID_INPUT_HOUR_1: "",
  FID_RANK_SORT_CLS_CODE: "",
  FID_INPUT_SRNO: "",
};

function okHttp(output: unknown = PAGE1) {
  const get = vi.fn().mockResolvedValue({
    status: 200,
    data: { rt_cd: "0", msg_cd: "MCA00000", msg1: "정상처리 되었습니다.", output },
  });
  return { get };
}

function row(srno: string, dt = srno.slice(0, 8), tm = srno.slice(8, 14)): KisNewsTitleRow {
  return { ...PAGE1[0], cntt_usiq_srno: srno, data_dt: dt, data_tm: tm };
}

describe("cursorOf · cursorParams", () => {
  it("마지막 행 → 표본 cont_by_cursor 파라미터(00+날짜 · 0000+시각 · 일련번호)", () => {
    const cursor = cursorOf(PAGE1[PAGE1.length - 1]);
    expect(cursorParams(cursor)).toEqual(steps.cont_by_cursor.params);
  });

  it("CR-01 커서 시각은 일련번호 앞 14자리(첫 작성 시각) — 수정본의 늦은 data_tm 이 아니다(stock_005930 끝 행)", () => {
    const last = steps.stock_005930.output[39] as KisNewsTitleRow;
    // 실측 표본: 일련번호 14:25:19 · data_tm 17:54:22(서울경제 수정본)
    expect(last.cntt_usiq_srno).toBe("2026111114251935761");
    expect(last.data_tm).toBe("175422");
    expect(cursorOf(last)).toEqual({ date: "20261111", time: "142519", srno: "2026111114251935761" });
    expect(cursorParams(cursorOf(last))).toEqual({
      FID_INPUT_DATE_1: "0020261111",
      FID_INPUT_HOUR_1: "0000142519",
      FID_INPUT_SRNO: "2026111114251935761",
    });
  });

  it("CR-01 한투는 일련번호 시각으로 쪽을 자른다 — past_1d 커서 15:30:00 에 data_tm 15:44:33 행이 들어 있다", () => {
    const out = steps.past_1d.output as KisNewsTitleRow[];
    const cut = `${steps.past_1d.params.FID_INPUT_DATE_1.slice(2)}${steps.past_1d.params.FID_INPUT_HOUR_1.slice(4)}`;
    const late = out.find((r) => r.cntt_usiq_srno === "2026111015293044488");
    expect(late?.data_tm).toBe("154433");
    // 모든 행이 일련번호 시각 ≤ 커서 — 갱신 시각(data_dt+data_tm)으로는 커서보다 늦은 행이 있다
    expect(out.every((r) => r.cntt_usiq_srno.slice(0, 14) <= cut)).toBe(true);
    expect(out.some((r) => `${r.data_dt}${r.data_tm}` > cut)).toBe(true);
  });

  it("일련번호 모양이 틀리면 data_dt · data_tm 으로 물러선다", () => {
    const r = { ...PAGE1[0], cntt_usiq_srno: "ABC", data_dt: "20261111", data_tm: "101010" };
    expect(cursorOf(r)).toEqual({ date: "20261111", time: "101010", srno: "ABC" });
  });

  it("커서 없음 → 세 칸 빈 문자열", () => {
    expect(cursorParams(null)).toEqual({
      FID_INPUT_DATE_1: "",
      FID_INPUT_HOUR_1: "",
      FID_INPUT_SRNO: "",
    });
  });
});

describe("fetchNewsTitlePage — 한 쪽 호출", () => {
  it("전체 최신: 경로 · 인증 헤더 · tr_id · custtype · tr_cont 빈 값 · 쿼리 8칸 빈 문자열", async () => {
    const http = okHttp();
    const rows = await fetchNewsTitlePage(http as never, AUTH);
    expect(rows).toHaveLength(40);
    expect(rows[0].cntt_usiq_srno).toBe("2026111121033582539");
    expect(http.get).toHaveBeenCalledTimes(1);
    const [path, opts] = http.get.mock.calls[0];
    expect(path).toBe(KIS_NEWS_TITLE_PATH);
    expect(opts.headers).toEqual({
      authorization: "Bearer TOKEN-XYZ",
      appkey: "APPKEY-XYZ",
      appsecret: "SECRET-XYZ",
      tr_id: "FHKST01011800",
      custtype: "P",
      tr_cont: "",
    });
    expect(opts.params).toEqual(EMPTY_PARAMS);
    expect(opts.validateStatus(500)).toBe(true);
  });

  it("종목 조회는 FID_INPUT_ISCD · 제공업체 조회는 FID_NEWS_OFER_ENTP_CODE", async () => {
    const http = okHttp();
    await fetchNewsTitlePage(http as never, AUTH, { stockCode: "005930" });
    await fetchNewsTitlePage(http as never, AUTH, { providerCode: "6" });
    expect(http.get.mock.calls[0][1].params).toEqual({
      ...EMPTY_PARAMS,
      ...steps.stock_005930.params,
    });
    expect(http.get.mock.calls[1][1].params).toEqual({
      ...EMPTY_PARAMS,
      ...steps.provider_filter.params,
    });
  });

  it("커서 → 표본 cont_by_cursor 파라미터 그대로", async () => {
    const http = okHttp(PAGE2);
    await fetchNewsTitlePage(http as never, AUTH, { cursor: cursorOf(PAGE1[39]) });
    expect(http.get.mock.calls[0][1].params).toEqual({
      ...EMPTY_PARAMS,
      ...steps.cont_by_cursor.params,
    });
  });

  it("rt_cd != 0 → KisApiError(상태 · msg_cd · msg1 · 종류)", async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        status: 500,
        data: { rt_cd: "1", msg_cd: "EGW00201", msg1: "초당 거래건수를 초과하였습니다." },
      }),
    };
    const err = await fetchNewsTitlePage(http as never, AUTH).catch((e) => e);
    expect(err).toBeInstanceOf(KisApiError);
    expect(err).toMatchObject({
      status: 500,
      msgCd: "EGW00201",
      msg1: "초당 거래건수를 초과하였습니다.",
      kind: "rate_limit",
    });
  });

  it("본문이 JSON 이 아닌 502 → KisApiError transient", async () => {
    const http = { get: vi.fn().mockResolvedValue({ status: 502, data: "<html>bad gateway</html>" }) };
    const err = await fetchNewsTitlePage(http as never, AUTH).catch((e) => e);
    expect(err).toBeInstanceOf(KisApiError);
    expect(err.kind).toBe("transient");
  });

  it("output 없음 → []", async () => {
    const http = {
      get: vi.fn().mockResolvedValue({ status: 200, data: { rt_cd: "0", msg_cd: "MCA00000", msg1: "" } }),
    };
    await expect(fetchNewsTitlePage(http as never, AUTH)).resolves.toEqual([]);
  });

  it("네트워크 오류 → status 0 transient KisApiError · 오류에 헤더 값이 실리지 않는다", async () => {
    const netErr = new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED", {
      headers: { appsecret: "SECRET-XYZ", authorization: "Bearer TOKEN-XYZ" },
    } as never);
    const http = { get: vi.fn().mockRejectedValue(netErr) };
    const err = await fetchNewsTitlePage(http as never, AUTH).catch((e) => e);
    expect(err).toBeInstanceOf(KisApiError);
    expect(err.status).toBe(0);
    expect(err.kind).toBe("transient");
    expect(err.cause).toBeUndefined();
    const dump = JSON.stringify({ ...err, message: err.message });
    expect(dump).not.toContain("SECRET-XYZ");
    expect(dump).not.toContain("TOKEN-XYZ");
  });
});

describe("pageUntilSeen — 마지막 본 일련번호까지 되감기", () => {
  function pager(pages: KisNewsTitleRow[][]) {
    const calls: (NewsTitleCursor | null)[] = [];
    const fetchPage = vi.fn(async (cursor: NewsTitleCursor | null) => {
      calls.push(cursor);
      return pages[calls.length - 1] ?? [];
    });
    return { fetchPage, calls };
  }

  it("1쪽에 마지막 본 번호 이하가 있으면 1쪽에서 멈춘다", async () => {
    const { fetchPage, calls } = pager([PAGE1, PAGE2]);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: PAGE1[5].cntt_usiq_srno, maxPages: 5 });
    expect(r.pages).toBe(1);
    expect(r.reachedSeen).toBe(true);
    expect(r.capped).toBe(false);
    expect(calls).toEqual([null]);
    expect(r.rows).toHaveLength(40);
  });

  it("1쪽에 없으면 마지막 행 커서로 2쪽 · 쪽 경계 겹친 1건은 한 번만", async () => {
    const { fetchPage, calls } = pager([PAGE1, PAGE2]);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: PAGE2[10].cntt_usiq_srno, maxPages: 5 });
    expect(r.pages).toBe(2);
    expect(r.reachedSeen).toBe(true);
    expect(calls[0]).toBeNull();
    expect(cursorParams(calls[1])).toEqual(steps.cont_by_cursor.params);
    const overlap = PAGE1[39].cntt_usiq_srno;
    expect(r.rows.filter((x) => x.cntt_usiq_srno === overlap)).toHaveLength(1);
    expect(r.rows).toHaveLength(79);
  });

  it("maxPages 에 닿으면 capped", async () => {
    const pages = [0, 1, 2, 3].map((p) => [
      row(`20261111${String(200000 - p * 100)}0000${p}`),
      row(`20261111${String(195950 - p * 100)}0000${p}`),
    ]);
    const { fetchPage } = pager(pages);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: "2026111100000000000", maxPages: 3 });
    expect(r.pages).toBe(3);
    expect(r.capped).toBe(true);
    expect(r.reachedSeen).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("빈 쪽이면 멈춘다(capped 아님)", async () => {
    const { fetchPage } = pager([PAGE1, []]);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: "2026111100000000000", maxPages: 5 });
    expect(r.pages).toBe(2);
    expect(r.capped).toBe(false);
    expect(r.reachedSeen).toBe(false);
    expect(r.rows).toHaveLength(40);
  });

  it("마지막 본 번호가 null 이면 maxPages 까지", async () => {
    const pages = [0, 1, 2, 3, 4].map((p) => [row(`20261111${String(200000 - p * 100)}0000${p}`)]);
    const { fetchPage } = pager(pages);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: null, maxPages: 4 });
    expect(r.pages).toBe(4);
    expect(r.capped).toBe(true);
    expect(r.reachedSeen).toBe(false);
    expect(r.rows).toHaveLength(4);
  });

  it("같은 쪽이 되풀이돼 새 행이 없으면 멈추고 stalled 로 알린다(무한 되감기 방지)", async () => {
    const { fetchPage } = pager([PAGE1, PAGE1, PAGE1]);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: null, maxPages: 10 });
    expect(r.pages).toBe(2);
    expect(r.capped).toBe(false);
    expect(r.stalled).toBe(true);
    expect(r.rows).toHaveLength(40);
  });

  it("마지막 본 번호에 닿거나 빈 쪽 · 상한이면 stalled 아님", async () => {
    const a = await pageUntilSeen(pager([PAGE1]).fetchPage, { lastSeenSrno: PAGE1[5].cntt_usiq_srno, maxPages: 5 });
    const b = await pageUntilSeen(pager([PAGE1, []]).fetchPage, { lastSeenSrno: null, maxPages: 5 });
    const c = await pageUntilSeen(pager([PAGE1, PAGE2]).fetchPage, { lastSeenSrno: null, maxPages: 1 });
    expect([a.stalled, b.stalled, c.stalled]).toEqual([false, false, false]);
  });
});

describe("CR-01 — 수정본이 쪽 끝에 와도 되감기가 이어진다(한투 쪽 자르기 흉내)", () => {
  // 한투 흉내: 일련번호 앞 14자리 ≤ 커서(날짜+시각) 인 행을 일련번호 내림차순 40건(실측 past_1d · cont_by_cursor)
  const STOCK = steps.stock_005930.output as KisNewsTitleRow[];
  const OLDER = Array.from({ length: 40 }, (_, i) => {
    const sec = 14 * 3600 + 20 * 60 - i * 10; // 14:20:00 부터 10초씩 과거
    const hms = [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60]
      .map((x) => String(x).padStart(2, "0"))
      .join("");
    return row(`20261111${hms}${String(10_000 + i)}`);
  });
  const POOL = [...STOCK, ...OLDER];

  function kisLike(cursor: NewsTitleCursor | null): KisNewsTitleRow[] {
    const cut = cursor ? `${cursor.date}${cursor.time}` : "99999999999999";
    return POOL.filter((r) => r.cntt_usiq_srno.slice(0, 14) <= cut)
      .sort((x, y) => (x.cntt_usiq_srno < y.cntt_usiq_srno ? 1 : -1))
      .slice(0, 40);
  }

  it("표본 1쪽은 그대로 stock_005930 이고 끝 행이 수정본 — 갱신 시각 커서는 본 행을 여럿 다시 받는다", () => {
    expect(kisLike(null)).toEqual(STOCK);
    const last = STOCK[39];
    expect(`${last.data_dt}${last.data_tm}` > last.cntt_usiq_srno.slice(0, 14)).toBe(true);
    const seen = new Set(STOCK.map((r) => r.cntt_usiq_srno));
    const overlap = (page: KisNewsTitleRow[]) => page.filter((r) => seen.has(r.cntt_usiq_srno)).length;
    // 고치기 전(data_tm 17:54:22 커서): 17:54 ~ 14:25 사이 본 행이 다시 온다
    expect(overlap(kisLike({ date: last.data_dt, time: last.data_tm, srno: last.cntt_usiq_srno }))).toBeGreaterThan(1);
    // 고친 뒤(일련번호 14:25:19 커서): 겹침은 끝 행 1건뿐
    expect(overlap(kisLike(cursorOf(last)))).toBe(1);
  });

  it("수정 지연이 한 쪽이 덮는 시간보다 길면 — 갱신 시각 커서는 같은 쪽(멈춤) · 일련번호 커서는 다음 쪽", async () => {
    // 10초 간격 80건 · 1쪽 끝 행(40번째)이 1쪽 첫 행보다 늦게 수정됐다
    const rows = Array.from({ length: 80 }, (_, i) => {
      const sec = 15 * 3600 - i * 10;
      const hms = [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60]
        .map((x) => String(x).padStart(2, "0"))
        .join("");
      return row(`20261111${hms}${String(20_000 + i)}`);
    });
    rows[39] = { ...rows[39], data_tm: "160000" };
    const kis = (c: NewsTitleCursor | null) => {
      const cut = c ? `${c.date}${c.time}` : "99999999999999";
      return rows.filter((r) => r.cntt_usiq_srno.slice(0, 14) <= cut).slice(0, 40);
    };
    const oldCursor = { date: rows[39].data_dt, time: rows[39].data_tm, srno: rows[39].cntt_usiq_srno };
    expect(kis(oldCursor)).toEqual(kis(null));
    const r = await pageUntilSeen(async (c) => kis(c), { lastSeenSrno: rows[70].cntt_usiq_srno, maxPages: 5 });
    expect(r).toMatchObject({ pages: 2, reachedSeen: true, stalled: false });
    expect(r.rows).toHaveLength(79);
  });

  it("2쪽으로 넘어가 마지막 본 글에 닿는다 · stalled 아님 · 행 빠짐 없음", async () => {
    const calls: (NewsTitleCursor | null)[] = [];
    const lastSeen = OLDER[30].cntt_usiq_srno;
    const r = await pageUntilSeen(
      async (c) => {
        calls.push(c);
        return kisLike(c);
      },
      { lastSeenSrno: lastSeen, maxPages: 5 },
    );
    expect(r).toMatchObject({ pages: 2, reachedSeen: true, capped: false, stalled: false });
    expect(calls[1]).toEqual({ date: "20261111", time: "142519", srno: "2026111114251935761" });
    // 1쪽 40 + 2쪽 새 행 39(겹친 끝 행 1건 제외) — 수정본 아래 틈이 없다
    expect(r.rows).toHaveLength(79);
    expect(new Set(r.rows.map((x) => x.cntt_usiq_srno)).size).toBe(79);
    for (const o of OLDER.slice(0, 31)) expect(r.rows).toContainEqual(o);
  });
});
