import axios, { type AxiosInstance } from "axios";

/**
 * server 측 키움 REST API axios client (worker 패턴 mirror — Plan 04).
 *
 * 각 호출 시 caller 가 headers (authorization Bearer, api-id) 를 지정.
 * client 자체에는 Bearer 미주입 — token 이 매 호출 동적 (Supabase kiwoom_tokens cache).
 */
export function createKiwoomClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}
