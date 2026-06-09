import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import { loadConfig, type ThemeSyncConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { createProxyClient } from "./proxy/client";
import { fetchWithFallback } from "./scrape/fetchWithFallback";
import { fetchNaverThemes } from "./scrape/naver/fetchNaverThemes";
import { fetchAlphaThemes } from "./scrape/alphasquare/fetchAlphaThemes";
import type { ThemeScrape } from "./scrape/types";
import { mergeThemes } from "./merge/mergeThemes";
import { upsertThemes } from "./pipeline/upsertThemes";
import {
  computeContentHash,
  shouldSkipWrite,
  storeHash,
} from "./pipeline/contentHash";
import {
  isBackedOff,
  markBackoff,
  incrementUsage,
  type ThemeSource,
} from "./scrapeState";
import {
  ProxyAuthError,
  ProxyBudgetExhaustedError,
  ProxyBadRequestError,
  ProxyBlockedError,
  NaverRateLimitError,
  ThemeScrapeValidationError,
} from "./proxy/errors";
import { withRetry } from "./retry";

/**
 * Phase 10 — theme-sync cycle entry point (RESEARCH §Pattern 9, 한국 크롤링 5원칙 구조 반영).
 *
 * Flow (5원칙 가드 포함):
 *   1. loadConfig + service_role Supabase + Bright Data proxy client 초기화.
 *   2. 각 source(네이버/알파) 별 scrapeState.isBackedOff 게이트 → backoff 중이면 skip + 알림(5원칙 #4).
 *   3. fetchNaverThemes + fetchAlphaThemes (withRetry, fetchWithFallback 주입 — 직접→프록시 폴백).
 *      차단(Proxy 계열 / NaverRateLimit) catch → markBackoff(24h) + 알림(5원칙 #4 자동재시도 금지).
 *   4. 두 소스 병합 후 contentHash 비교 → 동일 시 write skip 로그 + 종료(5원칙 #2 24h 해시 캐싱).
 *   5. mergeThemes → upsertThemes(service_role) → storeHash. incrementUsage 로 api_usage 카운트(5원칙 #1 일1회 캡).
 *   6. summary 로그(테마수/종목수/skipped/backoff).
 *
 * AI 보강(discoverThemes/correctMembership)은 OUT OF SCOPE — Plan 06 이 4번과 5번 사이에 삽입.
 */

/** 차단 신호 예외인지 — true 면 해당 source 에 24h backoff 기록. */
function isBlockSignal(err: unknown): boolean {
  return (
    err instanceof ProxyAuthError ||
    err instanceof ProxyBudgetExhaustedError ||
    err instanceof ProxyBadRequestError ||
    err instanceof ProxyBlockedError ||
    err instanceof NaverRateLimitError
  );
}

export interface ThemeSyncDeps {
  config?: ThemeSyncConfig;
  supabase?: SupabaseClient;
  proxy?: AxiosInstance;
  /** 테스트 주입: source 별 fetcher (없으면 실 네이버/알파 fetcher 사용). */
  fetchers?: {
    naver: (deps: { cfg: ThemeSyncConfig; fetchFn: (u: string) => Promise<string> }) => Promise<ThemeScrape[]>;
    alpha: (deps: { cfg: ThemeSyncConfig; fetchFn: (u: string) => Promise<string> }) => Promise<ThemeScrape[]>;
  };
  now?: Date;
}

export interface ThemeSyncSummary {
  themesUpserted: number;
  stockLinksUpserted: number;
  stockLinksRetired: number;
  skippedMissingStocks: number;
  scrapedThemes: number;
  backedOffSources: ThemeSource[];
  skippedWrite: boolean;
}

export async function runThemeSyncCycle(
  deps: ThemeSyncDeps = {},
): Promise<ThemeSyncSummary> {
  const cfg = deps.config ?? loadConfig();
  const now = deps.now ?? new Date();
  const log = logger.child({ app: "theme-sync", version: cfg.appVersion });
  const supabase =
    deps.supabase ??
    createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);
  const proxy = deps.proxy ?? createProxyClient(cfg);

  const naverFetcher = deps.fetchers?.naver ?? fetchNaverThemes;
  const alphaFetcher = deps.fetchers?.alpha ?? fetchAlphaThemes;

  log.info("theme-sync cycle start");

  const backedOffSources: ThemeSource[] = [];
  const allScrapes: ThemeScrape[] = [];

  // 소스별: backoff 게이트 → fetch(직접→프록시 폴백) → 차단 시 24h backoff 기록.
  const sources: Array<{
    key: ThemeSource;
    encoding: "euc-kr" | "utf-8";
    run: (fetchFn: (u: string) => Promise<string>) => Promise<ThemeScrape[]>;
  }> = [
    {
      key: "naver",
      encoding: "euc-kr",
      run: (fetchFn) => naverFetcher({ cfg, fetchFn }),
    },
    {
      key: "alpha",
      encoding: "utf-8",
      run: (fetchFn) => alphaFetcher({ cfg, fetchFn }),
    },
  ];

  for (const src of sources) {
    // 5원칙 #4 — backoff 게이트. 24h 미경과면 새 호출 차단 + 알림.
    if (await isBackedOff(supabase, src.key, now)) {
      log.warn(
        { source: src.key },
        "source in 24h backoff — skipping fetch (5원칙 #4)",
      );
      backedOffSources.push(src.key);
      continue;
    }

    const fetchFn = (url: string): Promise<string> =>
      fetchWithFallback({ cfg, proxy }, url, src.encoding);

    try {
      const scrapes = await withRetry(
        () => src.run(fetchFn),
        `fetch-${src.key}`,
      );
      // 5원칙 #1 — 일일 호출 카운트(api_usage). 일 1회 배치 캡 검증용.
      await incrementUsage(supabase, src.key, 1, now);
      allScrapes.push(...scrapes);
      log.info(
        { source: src.key, themes: scrapes.length },
        "source scraped",
      );
    } catch (err: unknown) {
      if (isBlockSignal(err)) {
        // 직접+프록시 모두 차단 — 24h backoff 기록(자동 지수 재시도 금지, 5원칙 #4).
        await markBackoff(supabase, src.key, now);
        backedOffSources.push(src.key);
        log.error(
          { source: src.key, err: (err as Error).message },
          "source blocked (direct+proxy) — 24h backoff recorded",
        );
      } else if (err instanceof ThemeScrapeValidationError) {
        // 파서/응답 검증 실패(Pitfall 10) — 해당 source skip(전체 cycle 중단 아님).
        log.error(
          { source: src.key, err: err.message },
          "source validation failed — skip this source",
        );
      } else {
        log.error(
          { source: src.key, err: (err as Error)?.message },
          "source fetch failed — skip this source",
        );
      }
    }
  }

  // 두 소스 모두 실패/backoff → 적재할 데이터 없음(빈 cycle 정상 종료).
  if (allScrapes.length === 0) {
    log.warn(
      { backedOffSources },
      "no scraped themes (all sources blocked/failed) — nothing to upsert",
    );
    return {
      themesUpserted: 0,
      stockLinksUpserted: 0,
      stockLinksRetired: 0,
      skippedMissingStocks: 0,
      scrapedThemes: 0,
      backedOffSources,
      skippedWrite: false,
    };
  }

  // 5원칙 #2 — 콘텐츠 SHA256 변경 감지. 직전 cycle 과 동일하면 DB write 전부 skip.
  const merged = mergeThemes(allScrapes);
  const hash = computeContentHash(merged);
  if (await shouldSkipWrite(supabase, hash)) {
    log.info(
      { hashPrefix: hash.slice(0, 12), mergedThemes: merged.length },
      "content unchanged (SHA256 match) — skipping DB write (5원칙 #2)",
    );
    return {
      themesUpserted: 0,
      stockLinksUpserted: 0,
      stockLinksRetired: 0,
      skippedMissingStocks: 0,
      scrapedThemes: allScrapes.length,
      backedOffSources,
      skippedWrite: true,
    };
  }

  // ── AI 보강 자리(Plan 06, OUT OF SCOPE) ──────────────────────────────
  // Plan 06 이 여기서 discoverThemes(뉴스 기반 신규 테마) + correctMembership(오분류 교정)을
  // merged 에 반영(source='ai')한 뒤 upsert. classify_enabled kill-switch 게이트.
  // ─────────────────────────────────────────────────────────────────────

  const result = await upsertThemes(supabase, merged, now);
  await storeHash(supabase, hash, now);

  log.info(
    {
      scrapedThemes: allScrapes.length,
      mergedThemes: merged.length,
      ...result,
      backedOffSources,
    },
    "theme-sync cycle complete",
  );

  return {
    ...result,
    scrapedThemes: allScrapes.length,
    backedOffSources,
    skippedWrite: false,
  };
}

async function main(): Promise<void> {
  try {
    await runThemeSyncCycle();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "theme-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
