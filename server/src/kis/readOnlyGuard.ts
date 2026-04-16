import type { InternalAxiosRequestConfig } from "axios";

const ALLOWED_PREFIXES = [
  "/uapi/domestic-stock/v1/ranking/",
  "/uapi/domestic-stock/v1/quotations/",
  "/oauth2/tokenP",
];

const BLOCKED_KEYWORDS = ["trading", "order"];

export class KisForbiddenPathError extends Error {
  constructor(path: string) {
    super(`KIS read-only guard: blocked request to "${path}"`);
    this.name = "KisForbiddenPathError";
  }
}

export function readOnlyGuard(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  const url = config.url ?? "";
  const path = url.startsWith("http") ? new URL(url).pathname : url;

  for (const keyword of BLOCKED_KEYWORDS) {
    if (path.includes(keyword)) {
      throw new KisForbiddenPathError(path);
    }
  }

  const allowed = ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (!allowed) {
    throw new KisForbiddenPathError(path);
  }

  return config;
}
