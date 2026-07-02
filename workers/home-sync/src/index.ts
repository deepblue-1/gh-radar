import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSnapshotPayload } from "@gh-radar/shared";
import { loadConfig, type HomeSyncConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import {
  loadSurges,
  type Surge,
  type LoadSurgesOptions,
} from "./pipeline/loadSurges";
import { computeContentHash } from "./pipeline/contentHash";
import { clusterSurges, type ClusterResult } from "./ai/clusterSurges";
import { upsertSnapshot } from "./pipeline/upsertSnapshot";

/**
 * Phase 13 Plan 02 Task 3 — home-sync cycle entry point (RESEARCH §Pattern 2 + §Pattern 4).
 *
 * Flow:
 *   1. loadSurges (오늘 +threshold% 급등 + 종목별 top-K 뉴스).
 *   2. computeContentHash (급등코드 + 뉴스 id).
 *   3. 오늘 최신 스냅샷 조회 (captured_at desc limit 1).
 *   4. 분기 (Pattern 4 hash-skip clone-append):
 *        - prev.content_hash === hash → 직전 payload 복제 append (is_carried=true, Claude 호출 0).
 *        - else → clusterSurges (Claude 1x) → payload append (is_carried=false).
 *   5. upsertSnapshot (onConflict PK ignoreDuplicates — slot 재실행 idempotent).
 *
 * captured_at 은 KST 10분 슬롯 (장중). marketStatus: slot >= 15:30 KST → closed.
 * surges 0 처리: 오늘 이미 non-empty 스냅샷이 있으면 마지막 non-empty payload 를 clone-append
 * (transient-empty 가드 — stock_quotes 상류 갱신 갭 시 spurious empty 방지). 오늘 아직 non-empty
 * 가 없으면(진짜 급등 없는 날) 빈 payload 스냅샷을 append (홈 빈 상태 표시용).
 */

export interface HomeSyncDeps {
  config?: HomeSyncConfig;
  supabase?: SupabaseClient;
  /** 테스트 주입: clusterSurges 대체 (없으면 실 Claude 호출). */
  cluster?: (surges: Surge[], cfg: HomeSyncConfig) => Promise<ClusterResult>;
  now?: Date;
  /** 테스트 주입: loadSurges retry 옵션 (delay 0 등). 미지정 시 프로덕션 기본(2회/1.5s). */
  loadSurgesOptions?: LoadSurgesOptions;
}

export interface HomeSyncSummary {
  tradeDate: string;
  capturedAt: string;
  themeCount: number;
  stockCount: number;
  claudeCalled: boolean;
  isCarried: boolean;
}

const KST_OFFSET_MS = 9 * 3600_000;

/**
 * now → KST 10분 슬롯 { tradeDate(YYYY-MM-DD), capturedAt(ISO), marketStatus }.
 *
 * 슬롯 분은 10분 경계로 floor (00/10/20/30/40/50) — 10분 cron(매 10분) 실행이 같은 HH:30
 * PK 로 뭉쳐 ignoreDuplicates 로 무시되던 문제 해소. 각 10분 슬롯이 고유 PK 를 갖는다.
 * marketStatus: 정규장 마감 15:30 KST 기준 — hour>15 또는 (hour===15 && slotMinute>=30) → closed.
 */
export function computeSlot(now: Date): {
  tradeDate: string;
  capturedAt: string;
  marketStatus: "open" | "closed";
} {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const tradeDate = `${y}-${m}-${d}`;
  const hour = kst.getUTCHours();
  // slotMinute = 해당 분을 10분 경계로 floor. capturedAt 은 그 슬롯 시각(KST)→UTC.
  const slotMinute = Math.floor(kst.getUTCMinutes() / 10) * 10;
  const slotKstMs = Date.UTC(y, kst.getUTCMonth(), kst.getUTCDate(), hour, slotMinute, 0);
  const capturedAt = new Date(slotKstMs - KST_OFFSET_MS).toISOString();
  // 정규장 마감 15:30 KST 이상 → closed.
  const marketStatus: "open" | "closed" =
    hour > 15 || (hour === 15 && slotMinute >= 30) ? "closed" : "open";
  return { tradeDate, capturedAt, marketStatus };
}

function countStocks(payload: HomeSnapshotPayload): number {
  const themeStocks = payload.themes.reduce((n, t) => n + t.stocks.length, 0);
  return themeStocks + payload.singles.length;
}

export async function runHomeSyncCycle(
  deps: HomeSyncDeps = {},
): Promise<HomeSyncSummary> {
  const cfg = deps.config ?? loadConfig();
  const now = deps.now ?? new Date();
  const cluster = deps.cluster ?? clusterSurges;
  const log = logger.child({ app: "home-sync", version: cfg.appVersion });
  const supabase =
    deps.supabase ??
    createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey);

  const { tradeDate, capturedAt, marketStatus } = computeSlot(now);
  log.info({ tradeDate, capturedAt, marketStatus }, "home-sync cycle start");

  // 1) 급등 로드 + 2) content hash.
  const surges = await loadSurges(supabase, cfg, deps.loadSurgesOptions);
  const hash = computeContentHash(surges);

  // 3) 오늘 최신 스냅샷.
  const { data: prevData, error: prevErr } = await supabase
    .from("home_theme_snapshots")
    .select("content_hash,theme_count,stock_count,payload")
    .eq("trade_date", tradeDate)
    .order("captured_at", { ascending: false })
    .limit(1);
  if (prevErr) throw prevErr;

  const prevRows = (prevData ?? []) as Array<{
    content_hash?: string | null;
    payload?: HomeSnapshotPayload | null;
  }>;
  const prevRow = prevRows.length > 0 ? prevRows[0] : null;

  let payload: HomeSnapshotPayload;
  let isCarried: boolean;
  let claudeCalled: boolean;

  if (surges.length === 0) {
    // 4a') transient-empty 가드 — loadSurges 가 0 을 반환했지만 stock_quotes 상류 갱신 갭으로
    // 일시 공백일 수 있다. 오늘 이미 non-empty 스냅샷이 있으면 빈 스냅샷을 새로 쓰지 않고
    // 마지막 non-empty payload 를 clone-append (spurious empty 방지). 진짜 급등 없는 날
    // (오늘 아직 non-empty 없음) 은 기존대로 빈 스냅샷을 append (홈 빈 상태 표시용).
    const { data: lastGoodRows } = await supabase
      .from("home_theme_snapshots")
      .select("payload")
      .eq("trade_date", tradeDate)
      .gt("stock_count", 0)
      .order("captured_at", { ascending: false })
      .limit(1);
    const lastGood = (
      (lastGoodRows ?? [])[0] as { payload?: HomeSnapshotPayload } | undefined
    )?.payload;
    if (lastGood) {
      payload = lastGood;
      isCarried = true;
      claudeCalled = false;
      log.info(
        {},
        "surges 0 — 마지막 non-empty payload clone-append (transient-empty 가드, stock_quotes 일시 공백)",
      );
    } else {
      payload = { threshold: cfg.surgeThreshold, marketStatus, themes: [], singles: [] };
      isCarried = false;
      claudeCalled = false;
    }
  } else if (prevRow && prevRow.content_hash === hash && prevRow.payload) {
    // 4a) hash-match — 직전 payload 복제 append (Claude 호출 skip, Pattern 4).
    payload = prevRow.payload;
    isCarried = true;
    claudeCalled = false;
    log.info(
      { hashPrefix: hash.slice(0, 12) },
      "content unchanged — clone-append 직전 payload (Claude 호출 skip)",
    );
  } else {
    // 4b) hash-miss — clusterSurges (Claude 1x). threshold/marketStatus 는 caller 가 확정.
    const clustered = await cluster(surges, cfg);
    payload = {
      threshold: cfg.surgeThreshold,
      marketStatus,
      themes: clustered.themes,
      singles: clustered.singles,
    };
    isCarried = false;
    claudeCalled = true; // 이 분기는 surges.length > 0 보장 (빈 급등은 위 가드에서 처리).
  }

  const themeCount = payload.themes.length;
  const stockCount = countStocks(payload);

  // 5) append (idempotent slot).
  await upsertSnapshot(supabase, {
    trade_date: tradeDate,
    captured_at: capturedAt,
    theme_count: themeCount,
    stock_count: stockCount,
    content_hash: hash,
    is_carried: isCarried,
    payload,
  });

  log.info(
    { tradeDate, capturedAt, themeCount, stockCount, claudeCalled, isCarried },
    "home-sync cycle complete",
  );

  return { tradeDate, capturedAt, themeCount, stockCount, claudeCalled, isCarried };
}

async function main(): Promise<void> {
  try {
    await runHomeSyncCycle();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "home-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함).
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
