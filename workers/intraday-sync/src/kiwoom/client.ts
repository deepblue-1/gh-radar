import axios, { type AxiosInstance } from "axios";

/**
 * 키움 REST API axios client.
 * RESEARCH §1.1 — baseURL = api.kiwoom.com (mock 은 mockapi.kiwoom.com).
 *
 * 각 호출 시 caller 가 headers (authorization Bearer, api-id, cont-yn, next-key) 를 지정.
 * client 자체에는 Bearer 미주입 — token 이 매 호출 동적이고 expires 5분 전 refresh.
 */
export function createKiwoomClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}
