import axios, { AxiosInstance } from "axios";
import { readOnlyGuard } from "./readOnlyGuard.js";
import type { AppConfig } from "../config.js";

export function createKisClient(config: AppConfig, token: string): AxiosInstance {
  const client = axios.create({
    baseURL: config.kisBaseUrl,
    headers: {
      authorization: `Bearer ${token}`,
      appkey: config.kisAppKey,
      appsecret: config.kisAppSecret,
      "content-type": "application/json; charset=utf-8",
      custtype: "P",
    },
    timeout: 10_000,
  });

  client.interceptors.request.use(readOnlyGuard);

  return client;
}
