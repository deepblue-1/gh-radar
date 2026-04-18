import axios, { type AxiosInstance } from "axios";
import type { DiscussionSyncConfig } from "../config.js";
import {
  ProxyAuthError,
  ProxyBadRequestError,
  ProxyBudgetExhaustedError,
  NaverRateLimitError,
} from "./errors.js";

/**
 * Phase 08 — Bright Data Web Unlocker axios 클라이언트.
 *
 * POC-RESULTS §1 + PIVOT 에서 확정된 경로:
 *   POST https://api.brightdata.com/request
 *     Authorization: Bearer {BRIGHTDATA_API_KEY}
 *     body: { zone: {BRIGHTDATA_ZONE}, url: {targetUrl}, format: 'raw', country: 'kr' }
 *
 * T-09 mitigation: baseURL 이 https 로 시작하지 않으면 throw (MITM 방지).
 * T-03 mitigation: Authorization 헤더는 defaults 로 주입, logger redact 가 직렬화 시 차단.
 * T-04 mitigation: response body 를 logger 에 절대 흘리지 않음 — 에러 시 status + byte length 만.
 */
export function createProxyClient(cfg: DiscussionSyncConfig): AxiosInstance {
  if (!cfg.brightdataUrl.startsWith("https://")) {
    throw new Error(
      `BRIGHTDATA_URL must be https (got: ${cfg.brightdataUrl})`,
    );
  }
  return axios.create({
    baseURL: cfg.brightdataUrl,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${cfg.brightdataApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json,text/plain,*/*",
      "User-Agent": `gh-radar-discussion-sync/${cfg.appVersion}`,
    },
  });
}

/**
 * Bright Data Web Unlocker 경유로 임의 URL fetch.
 *
 * @returns response body string (raw). JSON 이면 호출 측에서 JSON.parse.
 */
export async function fetchViaProxy(
  client: AxiosInstance,
  cfg: DiscussionSyncConfig,
  targetUrl: string,
): Promise<string> {
  const body = {
    zone: cfg.brightdataZone,
    url: targetUrl,
    format: "raw",
    country: "kr",
  };

  const doFetch = async (): Promise<string> => {
    const res = await client.post<string>("", body, {
      // 'raw' format → text/plain 또는 원본 response body 를 문자열로 수신.
      responseType: "text",
      transformResponse: [(data) => (typeof data === "string" ? data : String(data))],
    });
    return res.data;
  };

  try {
    return await doFetch();
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401) throw new ProxyAuthError();
    if (status === 402) throw new ProxyBudgetExhaustedError();
    if (status === 400 || status === 403) {
      throw new ProxyBadRequestError(`proxy bad request: ${status}`);
    }
    if (status === 429 || status === 503 || status === 504 || status === undefined) {
      // 보수적 재시도 1회 (RESEARCH Pitfall 5)
      await new Promise((r) => setTimeout(r, 2000));
      try {
        return await doFetch();
      } catch {
        throw new NaverRateLimitError();
      }
    }
    throw err as Error;
  }
}
