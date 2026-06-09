import axios, { type AxiosInstance } from "axios";
import type { ThemeSyncConfig } from "../config";
import {
  ProxyAuthError,
  ProxyBadRequestError,
  ProxyBudgetExhaustedError,
  NaverRateLimitError,
} from "./errors";

/**
 * Phase 10 — Bright Data Web Unlocker axios 클라이언트 (discussion-sync 선례 복제).
 *
 * 경로(Phase 08 POC 확정):
 *   POST https://api.brightdata.com/request
 *     Authorization: Bearer {BRIGHTDATA_API_KEY}
 *     body: { zone: {BRIGHTDATA_ZONE}, url: {targetUrl}, format: 'raw', country: 'kr' }
 *
 * T-10-03-02 mitigation: baseURL 이 https 로 시작하지 않으면 throw (MITM 방지).
 *   Authorization 헤더는 defaults 로 주입, logger redact 가 직렬화 시 차단.
 *   response body 는 logger 에 절대 흘리지 않음 — 에러 시 status + byte length 만.
 */
export function createProxyClient(cfg: ThemeSyncConfig): AxiosInstance {
  if (!cfg.brightdataUrl.startsWith("https://")) {
    throw new Error(`BRIGHTDATA_URL must be https (got: ${cfg.brightdataUrl})`);
  }
  return axios.create({
    baseURL: cfg.brightdataUrl,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${cfg.brightdataApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json,text/plain,*/*",
      "User-Agent": `gh-radar-theme-sync/${cfg.appVersion}`,
    },
  });
}

/**
 * Bright Data Web Unlocker 경유로 임의 URL fetch.
 *
 * targetUrl 은 고정 도메인(네이버/알파스퀘어)만 — 사용자 입력 url 없음 (T-10-03-04 SSRF).
 *
 * @returns response body string (raw). 네이버는 EUC-KR HTML(format:'raw' 가 바이트 보존),
 *          알파스퀘어는 UTF-8 JSON → 호출 측에서 JSON.parse.
 */
export async function fetchViaProxy(
  client: AxiosInstance,
  cfg: ThemeSyncConfig,
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
      responseType: "text",
      transformResponse: [
        (data) => (typeof data === "string" ? data : String(data)),
      ],
    });
    return res.data;
  };

  try {
    return await doFetch();
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    if (status === 401) throw new ProxyAuthError();
    if (status === 402) throw new ProxyBudgetExhaustedError();
    if (status === 400 || status === 403) {
      throw new ProxyBadRequestError(`proxy bad request: ${status}`);
    }
    if (
      status === 429 ||
      status === 503 ||
      status === 504 ||
      status === undefined
    ) {
      // 보수적 재시도 1회 (5원칙 #4 — 지수 backoff 으로 두드리지 않음).
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
