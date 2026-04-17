import type { AxiosInstance } from "axios";

export interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

export class NaverAuthError extends Error {
  constructor() {
    super("Naver auth failed");
    this.name = "NaverAuthError";
  }
}

export class NaverBudgetExhaustedError extends Error {
  constructor() {
    super("Naver daily budget exhausted");
    this.name = "NaverBudgetExhaustedError";
  }
}

export class NaverBadRequestError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "NaverBadRequestError";
  }
}

/**
 * R7: Naver Search API `display` 파라미터 최대값. 페이지당 최대 100 건.
 */
export const NAVER_MAX_DISPLAY = 100;

/**
 * R7: Naver Search API `start` 파라미터 하드 상한. 초과 시 400 반환.
 */
export const NAVER_MAX_START = 1000;

/**
 * Phase 07 — 단일 page 호출. page loop 은 `collectStockNews` 가 담당 (R7).
 *
 * Error mapping:
 *  - 401 → NaverAuthError (retry 안 함 — secret 만료/오타)
 *  - 429 → NaverBudgetExhaustedError (즉시 abort — cycle 중단 신호)
 *  - 400/403 → NaverBadRequestError (per-stock skip — query 특성)
 *  - 5xx/네트워크 → 1회 재시도 후 propagate
 */
export async function searchNews(
  client: AxiosInstance,
  query: string,
  opts: { start?: number; display?: number } = {},
): Promise<NaverNewsItem[]> {
  const start = opts.start ?? 1;
  const display = opts.display ?? NAVER_MAX_DISPLAY;
  const params = { query, display, sort: "date", start };
  try {
    const res = await client.get<{ items: NaverNewsItem[] }>(
      "/v1/search/news.json",
      { params },
    );
    return res.data.items ?? [];
  } catch (err: unknown) {
    const status =
      typeof err === "object" && err !== null && "response" in err
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((err as any).response?.status as number | undefined)
        : undefined;
    if (status === 401) throw new NaverAuthError();
    if (status === 429) throw new NaverBudgetExhaustedError();
    if (status === 400 || status === 403) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (err as any)?.response?.data?.errorMessage ?? "bad request";
      throw new NaverBadRequestError(String(msg));
    }
    if (status === undefined || status >= 500) {
      await new Promise((r) => setTimeout(r, 1000));
      const res2 = await client.get<{ items: NaverNewsItem[] }>(
        "/v1/search/news.json",
        { params },
      );
      return res2.data.items ?? [];
    }
    throw err;
  }
}
