import "dotenv/config";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { createKrxClient } from "./krx/client";
import { fetchMasterFromKrx } from "./krx/fetchBaseInfo";
import type { KrxBaseInfoRow } from "./krx/fetchBaseInfo";
import { fetchEtpMastersFromKrx } from "./krx/fetchEtpBaseInfo";
import { krxToMasterRow } from "./pipeline/map";
import { upsertMasters } from "./pipeline/upsert";
import { withRetry } from "./retry";
import type { AxiosInstance } from "axios";

/**
 * `basDd` 후보 생성 — 오늘(KST) 기준 `offsetDays` 일 전.
 *
 * `now + 9h` 의 **UTC 필드**가 곧 KST 벽시계다. 거기서 일수를 빼고 UTC 필드를 읽으면
 * 로컬 타임존과 무관하게 KST 날짜가 나온다 (Cloud Run 은 UTC 로 돈다).
 */
function basDdKst(offsetDays: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000 - offsetDays * 24 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// C3: MASS_DELIST_RISK guard threshold — KRX 정상 응답은 KOSPI+KOSDAQ 합 ~2,771 (실측 2026-04-15).
// 부분 응답/장애로 1000 미만이면 대규모 실수 상장폐지 마킹 위험 → throw.
const MIN_EXPECTED_MASTERS = 1000;

/**
 * `basDd` 자동 탐색 상한(일).
 *
 * KRX 기본정보는 **그날 08:10 KST 시점에는 아직 발행돼 있지 않다**. 그래서 Scheduler
 * (`10 8 * * 1-5`)가 "오늘"을 물으면 항상 0행이고, 그것이 2026-06-10 이후 3개월간
 * 마스터가 멈춘 원인이다. 실측(2026-09-06 조회, base=data-dbg.krx.co.kr/svc/apis):
 *
 *   09-06(일) 0 / 09-05(토) 0 / 09-04(금) 2,765 / 09-03(목) 2,764 / … / 08-27 2,767
 *
 * 즉 **직전 영업일은 확실히 발행돼 있다** — 평일 실행이면 1일만 거슬러도 잡힌다.
 * 상한을 10일로 넉넉히 두는 것은 설·추석 연휴(최장 5일) + 주말을 덮기 위해서다.
 * 하루 1회 도는 잡이라 후보당 왕복 2회는 싸고, "조용히 아무것도 안 하는" 상태로
 * 돌아가는 비용이 훨씬 크다.
 */
const MAX_BAS_DD_LOOKBACK_DAYS = 10;

/**
 * 주식 마스터를 **실제로 발행된 기준일**에서 가져온다.
 *
 * `BAS_DD` 가 명시되면 그 날짜만 쓴다(운영자 수동 지정 — 백필·재현). 없으면 오늘(KST)부터
 * 하루씩 거슬러 올라가며 **채택 가능한 첫 날**을 찾는다.
 *
 * 채택 기준이 "비어 있지 않음" 이 아니라 **`MIN_EXPECTED_MASTERS` 이상**인 이유:
 * KOSPI(~943행) 와 KOSDAQ(~1,822행) 은 **엔드포인트가 둘로 나뉘어 있다**. 한쪽만
 * 발행된 중간 상태가 나오면 합계가 1,000 을 밑돈다. 그 날짜를 채택하면 KOSDAQ 전 종목이 응답에 없어
 * delist-sweep 이 통째로 상장폐지 마킹을 한다. 한 발 더 거슬러 올라가 **완전한 날**을
 * 쓰는 편이 언제나 안전하다.
 *
 * 전 후보가 미달이면 **throw** 한다. 0행을 warn 후 정상 종료하던 옛 동작이
 * 2026-06-10 부터 3개월간 아무도 모르게 마스터를 정지시킨 원인이다 — 여기서는
 * 잡을 실패시켜 알림 정책이 울리게 한다.
 */
async function resolveMasterRows(
  krx: AxiosInstance,
  pinnedBasDd: string | undefined,
  log: typeof logger,
): Promise<{ basDd: string; rows: KrxBaseInfoRow[] }> {
  if (pinnedBasDd !== undefined) {
    const rows = await withRetry(
      () => fetchMasterFromKrx(krx, pinnedBasDd),
      "fetchMasterFromKrx",
    );
    log.info({ krxRows: rows.length, basDd: pinnedBasDd, pinned: true }, "KRX fetched");
    if (rows.length < MIN_EXPECTED_MASTERS) {
      throw new Error(
        `KRX returned ${rows.length} rows (< ${MIN_EXPECTED_MASTERS}) — partial response suspected, aborting to avoid mass-delist. basDd=${pinnedBasDd} (BAS_DD 로 고정된 기준일이다. 발행 여부를 확인하거나 BAS_DD 를 비워 자동 탐색으로 돌릴 것)`,
      );
    }
    return { basDd: pinnedBasDd, rows };
  }

  const tried: Array<{ basDd: string; krxRows: number }> = [];
  for (let back = 0; back <= MAX_BAS_DD_LOOKBACK_DAYS; back += 1) {
    const basDd = basDdKst(back);
    const rows = await withRetry(() => fetchMasterFromKrx(krx, basDd), "fetchMasterFromKrx");
    if (rows.length >= MIN_EXPECTED_MASTERS) {
      log.info({ krxRows: rows.length, basDd, lookbackDays: back }, "KRX fetched");
      return { basDd, rows };
    }
    tried.push({ basDd, krxRows: rows.length });
    log.info({ basDd, krxRows: rows.length }, "KRX 기준일 미발행/부분 발행 — 하루 거슬러 재시도");
  }

  throw new Error(
    `KRX 기본정보가 최근 ${MAX_BAS_DD_LOOKBACK_DAYS + 1}일 어느 기준일에도 ` +
      `${MIN_EXPECTED_MASTERS}행 이상 발행되지 않았다 — stocks 마스터를 갱신하지 못했다. ` +
      `시도: ${tried.map((t) => `${t.basDd}=${t.krxRows}`).join(", ")}. ` +
      `KRX 서비스 승인 상태 또는 발행 지연 확대를 확인할 것.`,
  );
}

/** PostgREST `db-max-rows` 페이지 크기. 이보다 큰 limit 을 줘도 서버가 잘라 준다. */
const SELECT_PAGE_SIZE = 1000;

/**
 * 활성 종목 코드 **전량**을 `.range()` 페이징으로 읽는다.
 *
 * `.limit(N)` 은 서버 상한(`db-max-rows`)을 못 넘으므로 한 번에 다 못 읽는다.
 * 정렬을 `code` 로 고정하는 것이 핵심이다 — 페이지 사이에 순서가 흔들리면 어떤 행은
 * 두 번 오고 어떤 행은 영영 안 온다(그 빠진 행이 곧 상장폐지 오판정이다).
 */
async function selectAllActiveCodes(
  supabase: ReturnType<typeof createSupabaseClient>,
  log: typeof logger,
): Promise<string[]> {
  const codes: string[] = [];
  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("stocks")
      .select("code")
      .eq("is_delisted", false)
      .order("code", { ascending: true })
      .range(from, from + SELECT_PAGE_SIZE - 1);
    if (error) {
      log.error({ err: error, from }, "delist-sweep: select existing active failed");
      throw error;
    }
    const page = (data ?? []) as Array<{ code: string }>;
    codes.push(...page.map((r) => r.code));
    if (page.length < SELECT_PAGE_SIZE) break;
  }
  log.info({ activeCount: codes.length }, "delist-sweep: 활성 종목 전량 조회");
  return codes;
}

export async function runMasterSync(deps?: {
  config?: ReturnType<typeof loadConfig>;
}): Promise<{ count: number; delistedCount: number }> {
  const config = deps?.config ?? loadConfig();
  const log = logger.child({ app: "master-sync", version: config.appVersion });

  log.info({ basDd: config.basDd ?? "auto" }, "master-sync cycle start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  // 주식 (KOSPI 주권 + KOSDAQ 주권) fetch — 핵심 universe + delist 가드 기준.
  // 기준일 선택과 MASS_DELIST_RISK 가드가 이 안에 함께 있다: 부분 발행된 날짜를
  // 채택하지 않는 것이 곧 가드이므로 두 판단을 떼어 놓으면 한쪽만 고쳐진다.
  const { basDd, rows: krxRows } = await resolveMasterRows(krx, config.basDd, log);

  // ETP (ETF/ETN/ELW) 마스터 — security_group 정확 분류용.
  //   intraday-sync 의 화이트리스트(ELIGIBLE_SECGROUPS)가 'ETF'/'ETN'/'ELW' 를 스캐너에서
  //   제외하려면 stocks 마스터에 정확 분류가 있어야 함. 미등록 시 bootstrapStocks 가
  //   placeholder 'security_group=주권' 으로 잘못 등록 → ETN 이 top_movers 에 노출되는 버그.
  //   (2026-05-16 비활성화 복원: 당시 우려였던 candle-sync recover 분모 오탐은
  //    missingDates 의 활성 count 에서 ETP 를 security_group 으로 제외하여 해소.)
  //   fault-tolerant: ETP fetch 실패해도 핵심 주식 sync 는 계속 (best-effort, 다음 cycle 재시도).
  let etpRows: KrxBaseInfoRow[] = [];
  try {
    etpRows = await withRetry(
      () => fetchEtpMastersFromKrx(krx, basDd),
      "fetchEtpMastersFromKrx",
    );
    log.info({ etpRows: etpRows.length, basDd }, "KRX ETP fetched");
  } catch (err) {
    log.warn(
      { err, basDd },
      "ETP fetch 실패 — 주식-only 로 계속 (ETF/ETN 분류 이번 cycle 건너뜀)",
    );
  }

  const masters = [...krxRows, ...etpRows].map(krxToMasterRow);
  const { count } = await withRetry(
    () => upsertMasters(supabase, masters),
    "upsertMasters",
  );

  // C3: delist-sweep — KRX 응답에 없는 활성 종목을 is_delisted=true 로 마킹
  //
  // **`.limit(10000)` 으로는 1,000행만 온다.** 이 프로젝트의 PostgREST 는 `db-max-rows`
  // 가 1,000 이라 클라이언트가 더 큰 limit 을 줘도 서버가 잘라 버린다(실측 2026-09-06:
  // 활성 4,049건 중 `.limit(10000)` 응답 1,000건). 옛 "HIGH-3 fix" 주석은 이 상한을
  // 못 넘었고, 그래서 sweep 이 임의의 1,000행 안에서만 판정해 왔다 — 위험하진 않지만
  // (덜 지울 뿐) 조용히 일을 덜 한다. `.range()` 페이징만이 전량을 본다.
  const activeCodes = new Set(masters.map((m) => m.code));
  const existing = await selectAllActiveCodes(supabase, log);
  const toDelist = existing.filter((code) => !activeCodes.has(code));

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
