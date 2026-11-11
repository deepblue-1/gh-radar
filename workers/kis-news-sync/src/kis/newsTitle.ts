import type { AxiosInstance } from "axios";
import type { KisNewsTitleRow } from "./types.js";

// RED 스텁(41-13 Task 1) — GREEN 커밋에서 실제 구현으로 바뀐다.
export interface KisAuth {
  token: string;
  appkey: string;
  appsecret: string;
}
export interface NewsTitleCursor {
  date: string;
  time: string;
  srno: string;
}
export interface NewsTitleQuery {
  stockCode?: string;
  providerCode?: string;
  cursor?: NewsTitleCursor | null;
}
export interface PageUntilSeenResult {
  rows: KisNewsTitleRow[];
  pages: number;
  reachedSeen: boolean;
  capped: boolean;
}

export function cursorOf(row: KisNewsTitleRow): NewsTitleCursor {
  return { date: row.data_dt, time: row.data_tm, srno: "" };
}
export function cursorParams(_cursor: NewsTitleCursor | null | undefined) {
  return { FID_INPUT_DATE_1: "", FID_INPUT_HOUR_1: "", FID_INPUT_SRNO: "" };
}
export async function fetchNewsTitlePage(
  _http: Pick<AxiosInstance, "get">,
  _auth: KisAuth,
  _query: NewsTitleQuery = {},
): Promise<KisNewsTitleRow[]> {
  return [];
}
export async function pageUntilSeen(
  _fetchPage: (cursor: NewsTitleCursor | null) => Promise<KisNewsTitleRow[]>,
  _opts: { lastSeenSrno: string | null; maxPages: number; minWrittenAt?: number },
): Promise<PageUntilSeenResult> {
  return { rows: [], pages: 0, reachedSeen: false, capped: false };
}
