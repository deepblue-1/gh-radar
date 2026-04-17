import axios, { type AxiosInstance } from "axios";
import type { NewsSyncConfig } from "../config.js";

/**
 * Phase 07 — Naver Search API axios 인스턴스.
 * T-09 mitigation: baseURL 이 https:// 로 시작하지 않으면 throw (MITM 방지).
 * T-01 mitigation: client secret 은 default header 로만 주입. logger redact 가 직렬화 시 차단.
 */
export function createNaverClient(cfg: NewsSyncConfig): AxiosInstance {
  if (!cfg.naverBaseUrl.startsWith("https://")) {
    throw new Error(
      `NAVER_BASE_URL must be https (got: ${cfg.naverBaseUrl})`,
    );
  }
  return axios.create({
    baseURL: cfg.naverBaseUrl,
    timeout: 15_000,
    headers: {
      "X-Naver-Client-Id": cfg.naverClientId,
      "X-Naver-Client-Secret": cfg.naverClientSecret,
      Accept: "application/json",
      "User-Agent": `gh-radar-news-sync/${cfg.appVersion}`,
    },
  });
}
