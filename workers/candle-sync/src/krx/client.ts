import axios, { type AxiosInstance } from "axios";
import type { Config } from "../config";

/**
 * KRX OpenAPI axios client.
 *
 * master-sync `client.ts` 와 1:1 동일 — 동일 인증/URL 패턴.
 *   - baseURL = config.krxBaseUrl (default: https://data-dbg.krx.co.kr/svc/apis)
 *   - AUTH_KEY header = config.krxAuthKey
 *   - timeout = 30s (백필 시 일부 응답이 5~10s 이내 도착하나, 보수적으로 30s)
 */
export function createKrxClient(config: Config): AxiosInstance {
  return axios.create({
    baseURL: config.krxBaseUrl,
    headers: {
      AUTH_KEY: config.krxAuthKey,
    },
    timeout: 30_000,
  });
}
