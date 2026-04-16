import axios, { type AxiosInstance } from "axios";
import type { Config } from "../config";

export function createKrxClient(config: Config): AxiosInstance {
  return axios.create({
    baseURL: config.krxBaseUrl,
    headers: {
      AUTH_KEY: config.krxAuthKey,
    },
    timeout: 30_000,
  });
}
