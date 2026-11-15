import type { SupabaseClient } from "@supabase/supabase-js";
import { isEtpProduct } from "@gh-radar/shared";
import type { TargetRecord } from "./cadence.js";

/**
 * Phase 07 — news-sync 대상 종목 로드.
 * 합집합:
 *   1) 최신 scan_id 의 top_movers.code (Phase 06.1 스키마 — Pitfall: stock_code 가 아니라 code)
 *   2) watchlists.stock_code (전 유저 합산)
 *   3) 화면 조회 등록 종목 — kis_news_targets.last_requested_at > now − 10분 (quick-261115-r4f)
 *      · 등록 정의는 한투 수집기 kis_news_targets_list 와 같다. 화면(상따창 · 돌파감지창 ·
 *        웹 작업대)이 GET /api/news/by-stock 으로 조회하면 server 가 등록만 하고, 네이버
 *        호출은 이 배치만 한다.
 *      · 급등 · 관심에 없는 「등록 전용」 만 최근 조회순 30개(REGISTERED_ONLY_CAP)까지 더한다.
 *        마스터 밖 · ETP 는 빠지고 상한 자리도 먹지 않는다.
 *      · 조회 실패는 throw 하지 않는다(부가 대상) — registeredLookupError 로 돌려주고 등록 없이 진행.
 * dedupe 후 stocks 마스터 존재하는 code + name(+ security_group) 조회 (FK 위반 사전 차단).
 *
 * quick-260915-h3p: top_movers.rank 를 함께 읽는다 — 장시간 tiered 모드에서
 * hot 등급(rank ≤ 30 ∪ 관심종목 ∪ 등록 전용) 판정에 쓴다(pipeline/cadence.ts).
 */

/** 등록 유효 시간(분) — last_requested_at 이 이보다 오래되면 등록 아님. */
export const REGISTERED_IDLE_MINUTES = 10;

/** 등록 전용 종목 상한(최근 조회순). 호출량이 사용자 수와 독립이 되게 하는 고정 상한. */
export const REGISTERED_ONLY_CAP = 30;

/** kis_news_targets 조회 행 상한 — 겹침 · 마스터 밖 · ETP 로 빠질 몫까지 넉넉히. */
export const REGISTERED_LOOKUP_LIMIT = 200;

export interface LoadTargetsResult {
  records: TargetRecord[];
  /** kis_news_targets 조회 실패 메시지. 성공이면 null. */
  registeredLookupError: string | null;
}

type MasterRow = { code: string; name: string; security_group?: string | null };

export async function loadTargets(
  supabase: SupabaseClient,
  now: Date,
): Promise<LoadTargetsResult> {
  // 1. 최신 scan_id 의 top_movers
  const { data: latestScan, error: e1 } = await supabase
    .from("top_movers")
    .select("scan_id")
    .order("scan_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  let movers: Array<{ code: string; rank: number | null }> = [];
  const scanId = (latestScan as { scan_id?: string } | null)?.scan_id;
  if (scanId) {
    const { data, error: e2 } = await supabase
      .from("top_movers")
      .select("code, rank")
      .eq("scan_id", scanId);
    if (e2) throw e2;
    movers = (data ?? []) as Array<{ code: string; rank: number | null }>;
  }

  // 2. watchlists (전 유저 stock_code 수집)
  const { data: watch, error: e3 } = await supabase
    .from("watchlists")
    .select("stock_code");
  if (e3) throw e3;
  const watchCodes = ((watch ?? []) as Array<{ stock_code: string }>).map(
    (r) => r.stock_code,
  );

  // 3. 화면 조회 등록 종목 (실패해도 throw 하지 않음)
  const { codes: registeredCodes, error: registeredLookupError } =
    await loadRegisteredCodes(supabase, now);

  // 4. dedupe
  const codes = Array.from(
    new Set<string>([...movers.map((m) => m.code), ...watchCodes, ...registeredCodes]),
  );
  if (codes.length === 0) return { records: [], registeredLookupError };

  // 5. stocks 마스터 존재 검증 + name · security_group 조회 (FK 위반 사전 차단 · ETP 판정)
  const { data: masters, error: e4 } = await supabase
    .from("stocks")
    .select("code, name, security_group")
    .in("code", codes);
  if (e4) throw e4;
  return {
    records: buildTargetRecords(
      movers,
      watchCodes,
      (masters ?? []) as MasterRow[],
      registeredCodes,
    ),
    registeredLookupError,
  };
}

/** kis_news_targets 에서 최근 10분 안 등록 코드를 최근 조회순으로. 실패는 메시지로 돌려준다. */
async function loadRegisteredCodes(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ codes: string[]; error: string | null }> {
  const since = new Date(now.getTime() - REGISTERED_IDLE_MINUTES * 60_000).toISOString();
  try {
    const { data, error } = await supabase
      .from("kis_news_targets")
      .select("stock_code, last_requested_at")
      .gt("last_requested_at", since)
      .order("last_requested_at", { ascending: false })
      .order("stock_code", { ascending: true })
      .limit(REGISTERED_LOOKUP_LIMIT);
    if (error) {
      const msg = (error as { message?: string }).message;
      return { codes: [], error: msg ? msg : String(error) };
    }
    return {
      codes: ((data ?? []) as Array<{ stock_code: string }>).map((r) => r.stock_code),
      error: null,
    };
  } catch (e: unknown) {
    return { codes: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 순수 조립: movers(code, rank) ∪ watchCodes ∪ 등록 전용을 stocks 마스터로 거른 TargetRecord[].
 *  - 같은 code 가 movers 에 여러 번 있으면 작은 rank 를 쓴다(null 은 무시).
 *  - watch 에만 있으면 rank null + watched true.
 *  - masters 에 없는 code 는 제외한다(FK 사전 차단 유지).
 *  - registeredCodes(최근 조회순) 중 급등 · 관심에 이미 있는 코드 · 중복 · 마스터 밖 · ETP 는
 *    건너뛰고(상한 안 먹음), 나머지를 REGISTERED_ONLY_CAP 개까지 rank null · watched false ·
 *    registered true 로 붙인다. ETP 거름은 등록 전용에만 — 급등 · 관심 동작은 그대로.
 * 순서는 movers 등장 순서 → watch 등장 순서 → 등록 전용 입력 순서.
 */
export function buildTargetRecords(
  movers: Array<{ code: string; rank: number | null }>,
  watchCodes: string[],
  masters: MasterRow[],
  registeredCodes: string[] = [],
): TargetRecord[] {
  const masterByCode = new Map(masters.map((m) => [m.code, m]));
  const watched = new Set(watchCodes);
  const rankByCode = new Map<string, number | null>();
  const order: string[] = [];

  for (const m of movers) {
    if (!rankByCode.has(m.code)) {
      rankByCode.set(m.code, m.rank ?? null);
      order.push(m.code);
      continue;
    }
    const prev = rankByCode.get(m.code) ?? null;
    if (m.rank !== null && m.rank !== undefined && (prev === null || m.rank < prev)) {
      rankByCode.set(m.code, m.rank);
    }
  }
  for (const c of watchCodes) {
    if (!rankByCode.has(c)) {
      rankByCode.set(c, null);
      order.push(c);
    }
  }

  const out: TargetRecord[] = [];
  for (const code of order) {
    const master = masterByCode.get(code);
    if (master === undefined) continue;
    out.push({
      code,
      name: master.name,
      rank: rankByCode.get(code) ?? null,
      watched: watched.has(code),
      registered: false,
    });
  }

  const taken = new Set<string>();
  let added = 0;
  for (const code of registeredCodes) {
    if (added >= REGISTERED_ONLY_CAP) break;
    if (rankByCode.has(code) || taken.has(code)) continue;
    const master = masterByCode.get(code);
    if (master === undefined) continue;
    if (isEtpProduct(master.name, master.security_group)) continue;
    taken.add(code);
    added++;
    out.push({ code, name: master.name, rank: null, watched: false, registered: true });
  }
  return out;
}
