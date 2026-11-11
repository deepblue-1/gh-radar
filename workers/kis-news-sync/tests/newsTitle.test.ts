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
    const http = okHttp(undefined);
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

  it("minWrittenAt 보다 오래된 행에 닿으면 멈춘다", async () => {
    const { fetchPage } = pager([PAGE1, PAGE2, PAGE2]);
    // PAGE2 끝 근처 20:15:12 KST 보다 뒤 — PAGE2 에서 닿는다
    const minWrittenAt = Date.parse("2026-11-11T20:20:00+09:00");
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: null, maxPages: 10, minWrittenAt });
    expect(r.pages).toBe(2);
    expect(r.capped).toBe(false);
    expect(r.reachedSeen).toBe(false);
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

  it("같은 쪽이 되풀이돼 새 행이 없으면 멈춘다(무한 되감기 방지)", async () => {
    const { fetchPage } = pager([PAGE1, PAGE1, PAGE1]);
    const r = await pageUntilSeen(fetchPage, { lastSeenSrno: null, maxPages: 10 });
    expect(r.pages).toBe(2);
    expect(r.capped).toBe(false);
    expect(r.rows).toHaveLength(40);
  });
});
