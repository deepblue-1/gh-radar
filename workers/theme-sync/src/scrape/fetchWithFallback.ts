import axios, { type AxiosInstance } from "axios";
import iconv from "iconv-lite";
import type { ThemeSyncConfig } from "../config";
import { fetchViaProxy } from "../proxy/client";
import { logger } from "../logger";

/**
 * 직접 fetch → 403/429(또는 status 미상) 차단 시 Bright Data 프록시 폴백 (D-07, RESEARCH §Pattern 9).
 *
 * 5원칙 #4: 차단 신호는 명시 차단으로 해석 — 직접 fetch 가 막히면 프록시 1회 폴백만 하고,
 * 프록시마저 막히면 예외를 던져 cycle 이 24h backoff(markBackoff)를 기록하게 한다.
 * 자동 지수 재시도로 두드리지 않는다(프록시 client 내부의 보수적 1회 재시도가 상한).
 *
 * @param targetUrl  고정 도메인(네이버/알파스퀘어)만 — 사용자 입력 url 없음 (T-10-03-04 SSRF).
 * @param encoding   'euc-kr' 면 arraybuffer + iconv.decode (네이버, Pitfall 2),
 *                   'utf-8' 면 text 그대로 (알파스퀘어 JSON).
 * @param proxy      Bright Data axios 클라이언트 (createProxyClient).
 */
export interface FetchWithFallbackDeps {
  cfg: ThemeSyncConfig;
  proxy: AxiosInstance;
  /** 직접 fetch 용 axios (기본 axios). 테스트 주입 가능. */
  direct?: AxiosInstance;
}

function isBlockedStatus(status: number | undefined): boolean {
  // 403/429 = 명시 차단/레이트리밋. undefined = 네트워크/타임아웃(네이버 차단의 흔한 증상).
  return status === 403 || status === 429 || status === undefined;
}

export async function fetchWithFallback(
  deps: FetchWithFallbackDeps,
  targetUrl: string,
  encoding: "euc-kr" | "utf-8" = "utf-8",
): Promise<string> {
  const { cfg, proxy } = deps;
  const direct = deps.direct ?? axios;

  // 1) 직접 fetch — EUC-KR 은 arraybuffer + iconv (Pitfall 2: responseType:'text' 면 한글 깨짐).
  try {
    if (encoding === "euc-kr") {
      const res = await direct.get(targetUrl, {
        responseType: "arraybuffer",
        timeout: 30_000,
        headers: {
          "User-Agent": `gh-radar-theme-sync/${cfg.appVersion}`,
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      });
      return iconv.decode(Buffer.from(res.data as ArrayBuffer), "EUC-KR");
    }
    const res = await direct.get<string>(targetUrl, {
      responseType: "text",
      timeout: 30_000,
      headers: {
        "User-Agent": `gh-radar-theme-sync/${cfg.appVersion}`,
        Accept: "application/json,text/plain,*/*",
      },
    });
    return typeof res.data === "string" ? res.data : String(res.data);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    if (!isBlockedStatus(status)) {
      // 차단이 아닌 다른 에러(예: 500)는 그대로 던짐 — withRetry 가 처리.
      throw err as Error;
    }
    logger.warn(
      { status, url: targetUrl },
      "direct fetch blocked — falling back to Bright Data proxy",
    );
  }

  // 2) 프록시 폴백 — 여기서 차단(Proxy*/NaverRateLimit) 되면 예외가 cycle 로 전파되어 backoff 기록.
  const body = await fetchViaProxy(proxy, cfg, targetUrl);
  if (encoding === "euc-kr") {
    // 'raw' format 이 EUC-KR 바이트를 보존하나, Bright Data 가 latin1 문자열로 줄 수 있어
    // 바이트 복원 후 EUC-KR 디코딩 (네이버 한글 무손상).
    return iconv.decode(Buffer.from(body, "latin1"), "EUC-KR");
  }
  return body;
}
