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
import { loadThemeHints } from "./pipeline/loadThemeHints";
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
 * captured_at 은 KST 5분 슬롯 (장중). marketStatus: 8시대 = premarket(NXT 프리마켓), slot >= 15:30 KST → closed.
 * surges 0 처리: 오늘 이미 non-empty 스냅샷이 있으면 마지막 non-empty payload 를 clone-append
 * (transient-empty 가드 — stock_quotes 상류 갱신 갭 시 spurious empty 방지). 오늘 아직 non-empty
 * 가 없으면(진짜 급등 없는 날) 빈 payload 스냅샷을 append (홈 빈 상태 표시용).
 */

export interface HomeSyncDeps {
  config?: HomeSyncConfig;
  supabase?: SupabaseClient;
  /** 테스트 주입: clusterSurges 대체 (없으면 실 Claude 호출). */
  cluster?: (
    surges: Surge[],
    cfg: HomeSyncConfig,
    themeHints: Map<string, string[]>,
  ) => Promise<ClusterResult>;
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
  /** 정규장 마감(15:30 KST) 초과 슬롯이라 cycle 을 건너뜀 (upsert 없음). */
  skipped?: boolean;
}

const KST_OFFSET_MS = 9 * 3600_000;

/**
 * now → KST 5분 슬롯 { tradeDate(YYYY-MM-DD), capturedAt(ISO), marketStatus }.
 *
 * 슬롯 분은 5분 경계로 floor (00/05/10/…/55) — 5분 cron(매 5분) 실행이 같은 HH:MM
 * PK 로 뭉쳐 ignoreDuplicates 로 무시되던 문제 해소. 각 5분 슬롯이 고유 PK 를 갖는다.
 * marketStatus: 8시대(hour<9) = premarket(NXT 프리마켓). 정규장 마감 15:30 KST 기준 —
 * hour>15 또는 (hour===15 && slotMinute>=30) → closed. 그 외 open.
 */
export function computeSlot(now: Date): {
  tradeDate: string;
  capturedAt: string;
  marketStatus: "premarket" | "open" | "closed";
  /** 슬롯이 마감(15:30 KST) **초과** — 15:40/15:50 등. cycle skip 대상 (15:30 은 종가 슬롯이라 실행). */
  afterClose: boolean;
} {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const tradeDate = `${y}-${m}-${d}`;
  const hour = kst.getUTCHours();
  // slotMinute = 해당 분을 5분 경계로 floor. capturedAt 은 그 슬롯 시각(KST)→UTC.
  const slotMinute = Math.floor(kst.getUTCMinutes() / 5) * 5;
  const slotKstMs = Date.UTC(y, kst.getUTCMonth(), kst.getUTCDate(), hour, slotMinute, 0);
  const capturedAt = new Date(slotKstMs - KST_OFFSET_MS).toISOString();
  // 8시대(hour<9) → premarket(NXT 프리마켓). 정규장 마감 15:30 KST 이상 → closed. 15:30 초과(15:40+)는 skip 대상.
  const marketStatus: "premarket" | "open" | "closed" =
    hour < 9
      ? "premarket"
      : hour > 15 || (hour === 15 && slotMinute >= 30)
        ? "closed"
        : "open";
  const afterClose = hour > 15 || (hour === 15 && slotMinute > 30);
  return { tradeDate, capturedAt, marketStatus, afterClose };
}

function countStocks(payload: HomeSnapshotPayload): number {
  const themeStocks = payload.themes.reduce((n, t) => n + t.stocks.length, 0);
  return themeStocks + payload.singles.length;
}

/**
 * carry(hash-match) 시 직전 payload 의 종목 등락률을 이번 사이클 최신 시세로 갱신.
 *
 * 급등 집합·뉴스 hash 가 동일해 Claude 재호출은 skip 하지만, 등락률은 시세와 함께 계속
 * 움직이므로 옛 값으로 고정되면 UI 가 stale 해진다. rateByCode(surges 최신값)에 존재하는
 * code 만 changeRate 를 덮어쓰고, 이탈 종목(map 부재)은 기존 값 유지. name/reason/news 와
 * 배열 순서·개수는 불변(프론트 theme-card.tsx 가 표시 시 changeRate desc 재정렬 — 워커
 * 재정렬 불필요). 순수 반환(원본 payload 미변경 — structuredClone 없이 명시적 map 복제).
 */
export function applyLatestRates(
  payload: HomeSnapshotPayload,
  rateByCode: Map<string, number>,
): HomeSnapshotPayload {
  return {
    ...payload,
    themes: payload.themes.map((t) => ({
      ...t,
      stocks: t.stocks.map((s) => ({
        ...s,
        changeRate: rateByCode.get(s.code) ?? s.changeRate,
      })),
    })),
    singles: payload.singles.map((s) => ({
      ...s,
      changeRate: rateByCode.get(s.code) ?? s.changeRate,
    })),
  };
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

  const { tradeDate, capturedAt, marketStatus, afterClose } = computeSlot(now);
  log.info({ tradeDate, capturedAt, marketStatus }, "home-sync cycle start");

  // 정규장 마감(15:30 KST) 초과 슬롯(15:40/15:50)은 skip — 종가는 15:30 슬롯이 최종.
  if (afterClose) {
    log.info({ capturedAt }, "마감(15:30) 초과 슬롯 — cycle skip (upsert 없음)");
    return {
      tradeDate,
      capturedAt,
      themeCount: 0,
      stockCount: 0,
      claudeCalled: false,
      isCarried: false,
      skipped: true,
    };
  }

  // 1) 급등 로드 + 2) content hash. computeSlot 과 동일한 now 를 신선도 컷오프에 전달.
  const surges = await loadSurges(supabase, cfg, {
    ...deps.loadSurgesOptions,
    now,
  });
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
    //     단, 종목 등락률은 이번 사이클 최신 시세로 갱신(carry stale 방지, applyLatestRates).
    const rateByCode = new Map(surges.map((s) => [s.code, s.changeRate]));
    payload = applyLatestRates(prevRow.payload, rateByCode);
    isCarried = true;
    claudeCalled = false;
    log.info(
      { hashPrefix: hash.slice(0, 12) },
      "content unchanged — clone-append 직전 payload + 등락률 최신화 (Claude 호출 skip)",
    );
  } else {
    // 4b) hash-miss — clusterSurges (Claude 1x). threshold/marketStatus 는 caller 가 확정.
    //     급등 2+ 공유 네이버 테마 힌트 로드 (quick-260720-in0) — Claude 호출 직전에만 조회해
    //     carry/skip 분기에서는 불필요한 Supabase 쿼리를 하지 않는다. surges.length > 0 보장.
    const themeHints = await loadThemeHints(
      supabase,
      surges.map((s) => s.code),
    );
    const clustered = await cluster(surges, cfg, themeHints);
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
