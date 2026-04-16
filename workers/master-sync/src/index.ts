import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { createKrxClient } from "./krx/client";
import { fetchMasterFromKrx } from "./krx/fetchBaseInfo";
import { krxToMasterRow } from "./pipeline/map";
import { upsertMasters } from "./pipeline/upsert";
import { withRetry } from "./retry";

function todayBasDdKst(): string {
  // KST = UTC+9. KRX 는 영업일 기준 — 본 worker 는 매일 새벽 호출이라 today 사용 가능.
  // 단, KRX 데이터는 전일 기준 익영업일 갱신이라 어차피 보수적. Plan 06 Scheduler 가 08:10 KST 호출 (KRX 08:00 갱신 이후 10분 마진 — R1 보정).
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// C3: MASS_DELIST_RISK guard threshold — KRX 정상 응답은 KOSPI+KOSDAQ 합 ~2,771 (실측 2026-04-15).
// 부분 응답/장애로 1000 미만이면 대규모 실수 상장폐지 마킹 위험 → throw.
const MIN_EXPECTED_MASTERS = 1000;

export async function runMasterSync(deps?: {
  config?: ReturnType<typeof loadConfig>;
}): Promise<{ count: number; delistedCount: number }> {
  const config = deps?.config ?? loadConfig();
  const log = logger.child({ app: "master-sync", version: config.appVersion });
  const basDd = config.basDd ?? todayBasDdKst();

  log.info({ basDd }, "master-sync cycle start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  const krxRows = await withRetry(
    () => fetchMasterFromKrx(krx, basDd),
    "fetchMasterFromKrx",
  );
  log.info({ krxRows: krxRows.length, basDd }, "KRX fetched");

  // WARN: 0 row 는 에러로 처리하되 "서비스 승인 미완료" 가능성을 명시 (신규 배포 직후)
  if (krxRows.length === 0) {
    log.warn(
      { basDd },
      "KRX returned 0 rows — 서비스 승인 미완료 또는 기준일 데이터 없음 (stocks 마스터 미변경)",
    );
    return { count: 0, delistedCount: 0 };
  }

  // C3: MASS_DELIST_RISK 가드 — 응답이 비정상적으로 적으면 상장폐지 마킹 건너뛰고 throw
  if (krxRows.length < MIN_EXPECTED_MASTERS) {
    throw new Error(
      `KRX returned ${krxRows.length} rows (< ${MIN_EXPECTED_MASTERS}) — partial response suspected, aborting to avoid mass-delist. basDd=${basDd}`,
    );
  }

  const masters = krxRows.map(krxToMasterRow);
  const { count } = await withRetry(
    () => upsertMasters(supabase, masters),
    "upsertMasters",
  );

  // C3: delist-sweep — KRX 응답에 없는 활성 종목을 is_delisted=true 로 마킹
  const activeCodes = new Set(masters.map((m) => m.code));
  const { data: existing, error: selErr } = await supabase
    .from("stocks")
    .select("code")
    .eq("is_delisted", false);
  if (selErr) {
    log.error({ err: selErr }, "delist-sweep: select existing active failed");
    throw selErr;
  }
  const toDelist = (existing ?? [])
    .map((r: { code: string }) => r.code)
    .filter((code: string) => !activeCodes.has(code));

  let delistedCount = 0;
  if (toDelist.length > 0) {
    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("stocks")
      .update({ is_delisted: true, updated_at: nowIso })
      .in("code", toDelist);
    if (updErr) {
      log.error({ err: updErr, delistCount: toDelist.length }, "delist-sweep update failed");
      throw updErr;
    }
    delistedCount = toDelist.length;
    log.info({ delistedCount, sample: toDelist.slice(0, 10) }, "delist-sweep applied");
  }

  log.info({ count, delistedCount, basDd }, "master-sync cycle complete");
  return { count, delistedCount };
}

async function main(): Promise<void> {
  try {
    await runMasterSync();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "master-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
