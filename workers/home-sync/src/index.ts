import "dotenv/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSnapshotPayload, HomeSurgeTheme } from "@gh-radar/shared";
import {
  isKrxHoliday,
  isKrxCalendarStale,
  KRX_HOLIDAYS_SEEDED_THROUGH,
} from "@gh-radar/shared";
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
import {
  shouldThinPastSnapshots,
  thinPastSnapshots,
} from "./pipeline/thinSnapshots";

/**
 * Phase 13 Plan 02 Task 3 — home-sync cycle entry point (RESEARCH §Pattern 2 + §Pattern 4).
 *
 * Flow:
 *   1. loadSurges (오늘 +threshold% 급등 + 종목별 top-K 뉴스).
 *   2. computeContentHash (급등코드 + 뉴스 id).
 *   3. 오늘 최신 스냅샷 조회 (captured_at desc limit 1).
 *   4. 분기 (Pattern 4 hash-skip clone-append, 게이트 = canReusePrevClassification):
 *        - 재사용 가능(prev.content_hash === hash) → 직전 payload 복제 append (is_carried=true, Claude 호출 0).
 *        - else → clusterSurges (Claude 1x) → payload append (is_carried=false).
 *   5. upsertSnapshot (onConflict PK ignoreDuplicates — slot 재실행 idempotent).
 *   6. KST 08:00~08:09 사이클만 과거 거래일 스냅샷 5분 thinning (실패는 warn, cycle 성공).
 *
 * captured_at 은 KST 1분 슬롯 (08:00~20:04). marketStatus: 08시대 premarket / 09:00~15:29 open /
 * 15:30~19:59 aftermarket / 20:00~20:04 closed. 20:05 이후 슬롯은 upsert 없이 skip.
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
    prevThemes: HomeSurgeTheme[],
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
  /** cycle 을 건너뜀 (upsert 없음) — KRX 휴장일(0차 가드) 또는 마감(20:04 KST) 초과 슬롯. */
  skipped?: boolean;
}

const KST_OFFSET_MS = 9 * 3600_000;

/** KRX 정규장 시작 09:00 KST (분). 이전은 premarket. */
const REGULAR_OPEN_MIN = 9 * 60;
/** 애프터마켓 구간 시작 15:30 KST (분). */
const AFTERMARKET_START_MIN = 15 * 60 + 30;
/** 마감 슬롯 시작 20:00 KST (분). */
const CLOSE_SLOT_MIN = 20 * 60;
/**
 * 마지막 슬롯 20:04 KST (분). 이 분 수를 **초과**하면 cycle skip.
 * 20:04 까지 도는 이유: intraday-sync 20:02 사이클이 ~20:02:50 에 끝나므로 20:03·20:04 슬롯이
 * 최종 체결을 읽는다.
 */
const LAST_SLOT_MIN = 20 * 60 + 4;

/**
 * now → KST 1분 슬롯 { tradeDate(YYYY-MM-DD), capturedAt(ISO), marketStatus, afterClose }.
 *
 * 슬롯 분은 KST 분 그대로(초·ms 버림) — 매분 cron 실행이 각자 고유 PK 를 갖는다.
 * marketStatus: 08시대 premarket / 09:00~15:29 open / 15:30~19:59 aftermarket / 20:00~ closed.
 */
export function computeSlot(now: Date): {
  tradeDate: string;
  capturedAt: string;
  marketStatus: HomeSnapshotPayload["marketStatus"];
  /** 슬롯이 마지막 슬롯(20:04 KST) **초과** — 20:05 이후. cycle skip 대상. */
  afterClose: boolean;
} {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const tradeDate = `${y}-${m}-${d}`;
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  // capturedAt = 그 분의 시작(초·ms 버림) 시각(KST) → UTC.
  const slotKstMs = Date.UTC(y, kst.getUTCMonth(), kst.getUTCDate(), hour, minute, 0);
  const capturedAt = new Date(slotKstMs - KST_OFFSET_MS).toISOString();
  const minOfDay = hour * 60 + minute;
  const marketStatus: HomeSnapshotPayload["marketStatus"] =
    minOfDay < REGULAR_OPEN_MIN
      ? "premarket"
      : minOfDay < AFTERMARKET_START_MIN
        ? "open"
        : minOfDay < CLOSE_SLOT_MIN
          ? "aftermarket"
          : "closed";
  const afterClose = minOfDay > LAST_SLOT_MIN;
  return { tradeDate, capturedAt, marketStatus, afterClose };
}

/** 오늘 최신 스냅샷 행 (prev lookup 결과). */
export interface PrevSnapshotRow {
  content_hash?: string | null;
  payload?: HomeSnapshotPayload | null;
}

/**
 * Claude 호출 게이트 — 재분류 여부를 결정하는 유일한 지점.
 *
 * 현재 정책: 급등집합·뉴스 hash 가 바뀌면 매 슬롯(1분) 재분류(비용 증가 수용, 사용자 결정 1).
 * true 면 직전 분류(payload)를 재사용하고 Claude 를 부르지 않는다.
 * 추후 '목록/등락률 1분 + AI 재분류 N분 쿨다운' 분리는 이 함수만 바꾼다.
 */
export function canReusePrevClassification(
  prevRow: PrevSnapshotRow | null,
  hash: string,
): prevRow is PrevSnapshotRow & { payload: HomeSnapshotPayload } {
  return prevRow !== null && prevRow.content_hash === hash && !!prevRow.payload;
}

/**
 * stock_count = unique 종목코드 수 (quick-260720-kyh). 한 종목이 테마+테마 또는 테마+single 에
 * 중복 소속돼도 1회만 집계 — server/webapp 은 이 저장값을 verbatim 표시(재계산 없음, grep 확인).
 * enforceMembershipInvariant 로 테마+single 동시는 제거되지만, evidence 2+ 복수 소속은 남을 수
 * 있어 Set 집계로 과대 카운트를 방지한다.
 */
export function countStocks(payload: HomeSnapshotPayload): number {
  const codes = new Set<string>();
  for (const t of payload.themes) for (const s of t.stocks) codes.add(s.code);
  for (const s of payload.singles) codes.add(s.code);
  return codes.size;
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

  // 0차 KRX 휴장일 가드 (quick-260817-f1a) — afterClose 게이트보다 앞.
  //   휴장일에 키움이 직전 거래일 스냅샷을 재방출하면 loadSurges 가 가짜 급등을 읽어
  //   home_theme_snapshots 에 가짜 테마를 남긴다(2026-08-17 사고, 34 슬롯 오염).
  if (isKrxCalendarStale(tradeDate)) {
    log.warn(
      { tradeDate, seededThrough: KRX_HOLIDAYS_SEEDED_THROUGH },
      "KRX 휴장일 캘린더 seed 만료 — 0차 가드 무력. krxCalendar.ts 에 이듬해 휴장일 추가 필요",
    );
  }
  if (isKrxHoliday(tradeDate)) {
    log.warn({ tradeDate }, "KRX 휴장일 — cycle skip (0차 캘린더 가드, upsert 없음)");
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

  // 마지막 슬롯(20:04 KST) 초과(20:05~)는 skip — 애프터마켓 최종 체결은 20:03·20:04 슬롯이 읽는다.
  if (afterClose) {
    log.info({ capturedAt }, "마감(20:04) 초과 슬롯 — cycle skip (upsert 없음)");
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

  const prevRows = (prevData ?? []) as PrevSnapshotRow[];
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
  } else if (canReusePrevClassification(prevRow, hash)) {
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
    // sticky prior (quick-260720-kyh) — 직전 슬롯 테마 구성을 cluster 로 전달해 슬롯 간 명멸을
    // 줄인다. prevRow(오늘 최신 스냅샷)의 payload.themes 재사용(추가 쿼리 없음). 없으면 [].
    const prevThemes = prevRow?.payload?.themes ?? [];
    const clustered = await cluster(surges, cfg, themeHints, prevThemes);
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

  // 6) 과거 거래일 스냅샷 5분 thinning (KST 08:00~08:09 사이클만, idempotent 재시도).
  //    실패는 cycle 을 실패시키지 않는다 — 단, 무로그 fail-safe 금지라 err 를 warn 으로 남긴다.
  if (shouldThinPastSnapshots(now)) {
    try {
      const deleted = await thinPastSnapshots(supabase, tradeDate);
      log.info({ deleted }, "과거 스냅샷 5분 thinning 완료");
    } catch (err) {
      log.warn(
        { err },
        "과거 스냅샷 thinning 실패 — cycle 은 성공 처리, 다음 슬롯(08:09 까지) 재시도",
      );
    }
  }

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
