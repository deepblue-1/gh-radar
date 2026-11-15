import type { AxiosInstance } from "axios";
import { KIS_NEWS_TITLE_PATH, KIS_NEWS_TITLE_TR_ID, KisApiError } from "./client.js";
import type { KisNewsTitleRow } from "./types.js";

/**
 * Phase 41-13 — 한투 news-title(FHKST01011800) 한 쪽 호출 · 커서 되감기.
 *
 * - 한 쪽 = 최신순 40건. 다음 쪽은 응답 헤더 `tr_cont` 가 아니라(실측에서 빈 값) **커서**로 부른다:
 *   `FID_INPUT_DATE_1=00YYYYMMDD` · `FID_INPUT_HOUR_1=0000HHMMSS` · `FID_INPUT_SRNO=<마지막 일련번호>`
 *   (2026-11-11 실측 `cont_by_cursor`). 다음 쪽 첫 행은 앞 쪽 마지막 행과 겹친다 → 일련번호로 한 번만 남긴다.
 * - 커서 날짜 · 시각은 **일련번호 앞 14자리(첫 작성 시각)** 로 만든다 — `data_dt`/`data_tm`(갱신 시각)이 아니다.
 *   실측: 한투는 쪽을 일련번호 시각 기준으로 자르고(`past_1d` 커서 15:30:00 에 일련번호 15:29:30 · `data_tm`
 *   15:44:33 행이 들어온다), 쪽 안 순서도 일련번호 내림차순이다. 수정본은 `data_tm` 만 늦어지므로
 *   (`stock_005930` 끝 행 일련번호 14:25:19 · `data_tm` 17:54:22) 갱신 시각으로 커서를 만들면 다음 쪽이
 *   같은 쪽으로 되돌아온다. `FID_INPUT_SRNO` 는 쪽 위치를 사실상 정하지 않는다(`cont_by_time_only` = `cont_by_cursor`).
 * - Pitfall 3(피드 넘침): 1쪽에 마지막 본 일련번호가 없으면 다음 쪽으로 내려가되 `maxPages` 에서 멈추고
 *   `capped` 로 알린다(루프가 warn).
 * - 성공 판정은 상태가 아니라 본문 `rt_cd == "0"`. 실패는 `KisApiError`(상태 · msg_cd · msg1)로만 던진다 —
 *   axios 오류를 그대로 흘리면 요청 설정(인증 헤더)이 로그로 따라 나갈 수 있다.
 */

export interface KisAuth {
  token: string;
  appkey: string;
  appsecret: string;
}

/** 다음 쪽을 부를 위치 — 앞 쪽 마지막 행의 일련번호 시각(첫 작성 시각) · 일련번호 */
export interface NewsTitleCursor {
  /** YYYYMMDD */
  date: string;
  /** HHMMSS */
  time: string;
  srno: string;
}

export interface NewsTitleQuery {
  /** 종목 조회 — FID_INPUT_ISCD */
  stockCode?: string;
  /** 제공업체 조회 — FID_NEWS_OFER_ENTP_CODE(예 F 거래소 공시 · G 코스닥 공시) */
  providerCode?: string;
  cursor?: NewsTitleCursor | null;
}

export interface PageUntilSeenOptions {
  /** 지난 실행까지 본 가장 큰 일련번호. null 이면 maxPages 까지 */
  lastSeenSrno: string | null;
  maxPages: number;
}

export interface PageUntilSeenResult {
  /** 받은 행(쪽 경계 겹침 제거 · 받은 순서) — 들여오기가 멱등이라 본 글도 그대로 둔다 */
  rows: KisNewsTitleRow[];
  pages: number;
  /** 마지막 본 일련번호 이하에 닿아 멈췄다 */
  reachedSeen: boolean;
  /** maxPages 에 닿아 멈췄다(더 있을 수 있다) */
  capped: boolean;
  /**
   * 새 행이 없는 쪽(같은 쪽 되풀이)에서 멈췄다 — 마지막 본 번호에 닿지 못한 채 되감기를 끝냈다(더 있을 수 있다).
   * 커서가 일련번호 시각이라 보통은 생기지 않는다(한 쪽 40건이 모두 같은 초일 때 등). 호출부가 warn 한다.
   */
  stalled: boolean;
}

const SRNO_RE = /^\d{19}$/;

/**
 * 다음 쪽 커서 — 일련번호 앞 14자리(YYYYMMDDHHMMSS · 첫 작성 시각)로 만든다.
 * 일련번호 모양이 틀리면(19자리 숫자 아님) `data_dt`/`data_tm` 으로 물러선다.
 */
export function cursorOf(row: KisNewsTitleRow): NewsTitleCursor {
  const srno = (row.cntt_usiq_srno ?? "").trim();
  if (SRNO_RE.test(srno)) return { date: srno.slice(0, 8), time: srno.slice(8, 14), srno };
  return { date: row.data_dt, time: row.data_tm, srno };
}

export function cursorParams(cursor: NewsTitleCursor | null | undefined): {
  FID_INPUT_DATE_1: string;
  FID_INPUT_HOUR_1: string;
  FID_INPUT_SRNO: string;
} {
  if (!cursor) return { FID_INPUT_DATE_1: "", FID_INPUT_HOUR_1: "", FID_INPUT_SRNO: "" };
  return {
    FID_INPUT_DATE_1: `00${cursor.date}`,
    FID_INPUT_HOUR_1: `0000${cursor.time}`,
    FID_INPUT_SRNO: cursor.srno,
  };
}

export async function fetchNewsTitlePage(
  http: Pick<AxiosInstance, "get">,
  auth: KisAuth,
  query: NewsTitleQuery = {},
): Promise<KisNewsTitleRow[]> {
  const c = cursorParams(query.cursor);
  let res;
  try {
    res = await http.get(KIS_NEWS_TITLE_PATH, {
      headers: {
        authorization: `Bearer ${auth.token}`,
        appkey: auth.appkey,
        appsecret: auth.appsecret,
        tr_id: KIS_NEWS_TITLE_TR_ID,
        custtype: "P",
        tr_cont: "",
      },
      params: {
        FID_NEWS_OFER_ENTP_CODE: query.providerCode ?? "",
        FID_COND_MRKT_CLS_CODE: "",
        FID_INPUT_ISCD: query.stockCode ?? "",
        FID_TITL_CNTT: "",
        FID_INPUT_DATE_1: c.FID_INPUT_DATE_1,
        FID_INPUT_HOUR_1: c.FID_INPUT_HOUR_1,
        FID_RANK_SORT_CLS_CODE: "",
        FID_INPUT_SRNO: c.FID_INPUT_SRNO,
      },
      // 상태와 무관하게 rt_cd · msg_cd 로 분류한다
      validateStatus: () => true,
    });
  } catch (err) {
    // 네트워크 · 타임아웃 — 원래 오류(요청 설정 포함)는 버리고 코드만 남긴다
    const code = (err as { code?: unknown } | null)?.code;
    throw new KisApiError(0, null, typeof code === "string" ? code : "network error");
  }
  const data = res.data as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output?: unknown } | null;
  const body = data && typeof data === "object" ? data : null;
  if (body?.rt_cd !== "0") {
    throw new KisApiError(
      res.status,
      typeof body?.msg_cd === "string" ? body.msg_cd : null,
      typeof body?.msg1 === "string" ? body.msg1 : null,
    );
  }
  return Array.isArray(body.output) ? (body.output as KisNewsTitleRow[]) : [];
}

/**
 * 최신 → 과거로 쪽을 넘기며 마지막 본 일련번호에 닿을 때까지 받는다.
 * 멈춤: ① 쪽에 마지막 본 번호 이하가 있음(reachedSeen) ② 빈 쪽 ③ 새 행이 없는 쪽(같은 쪽 되풀이 · stalled) ·
 * ④ maxPages(capped).
 * 일련번호는 같은 길이(19자리) 숫자 문자열이라 문자열 비교로 크기를 본다.
 */
export async function pageUntilSeen(
  fetchPage: (cursor: NewsTitleCursor | null) => Promise<KisNewsTitleRow[]>,
  opts: PageUntilSeenOptions,
): Promise<PageUntilSeenResult> {
  const maxPages = Math.max(1, Math.floor(opts.maxPages));
  const seen = new Set<string>();
  const rows: KisNewsTitleRow[] = [];
  let cursor: NewsTitleCursor | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const page = await fetchPage(cursor);
    pages += 1;
    if (page.length === 0) return { rows, pages, reachedSeen: false, capped: false, stalled: false };

    let added = 0;
    let reachedSeen = false;
    for (const r of page) {
      if (opts.lastSeenSrno !== null && r.cntt_usiq_srno <= opts.lastSeenSrno) reachedSeen = true;
      if (seen.has(r.cntt_usiq_srno)) continue;
      seen.add(r.cntt_usiq_srno);
      rows.push(r);
      added += 1;
    }
    if (reachedSeen) return { rows, pages, reachedSeen: true, capped: false, stalled: false };
    if (added === 0) return { rows, pages, reachedSeen: false, capped: false, stalled: true };
    cursor = cursorOf(page[page.length - 1]);
  }
  return { rows, pages, reachedSeen: false, capped: true, stalled: false };
}
