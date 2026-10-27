/**
 * Phase 35 Plan 03 — D-07 ~ D-10 발사 조각 · 머리 백필: 파일 → `launch_pieces` · `launch_heads`(source = backfill).
 *
 * 목적: 서버 로그는 하루치만 남는다 — gh-trade 가 뽑아 준 과거 발사 조각을 지도 · 주문 내역 표에 미리 채운다.
 * 머리는 조각에서 계산한다(D-04) — shared `launchHeadOf`(웹 지도와 같은 한 벌 · 첨부 `group()` 이식). 학습 열 ·
 * `next_offset_us` 는 조각으로 셀 수 없어 null 이다(D-08).
 *
 * 입력 두 형식:
 *   ① 첨부 `pieces.json`(배열 · `{date, broker, market, wire, q, j, rel, result}` — 10/12~10/26 16:00 Q16 196행)
 *      → `pieceFromAttach`. broker KB→KB120 · 교보→KYOBO119, market 코스피→K · 코스닥→Q, profile Q16 · KRX 16:00:00.
 *   ② gh-trade 전체분 ndjson(`.ndjson` · `.jsonl` — 한 줄 = 조각 · 풀린 필드명 = 표 열 이름, `user` → `dma_user_id`)
 *      → `pieceFromNdjson`. 없는 키는 null(D-08).
 *
 * 쓰기는 RPC `launch_backfill_apply(p_pieces, p_heads)` 뿐이다 — supabase-js 표 `.upsert({onConflict})` 는 조건부 WHERE 를
 * 못 걸어 라이브(journal) 행을 덮는다. 「백필은 journal 을 못 덮고 백필끼리는 덮는다」 규칙은 DB 헬퍼 한 곳에 있다
 * (마이그레이션 20261027200000 `launch_upsert_piece` · `launch_upsert_head`). 청크 500행/호출(lessons 2026-06-10).
 *
 * 실 DB 접촉은 `applyLaunchBackfill` · `launchStatusOf` · `reprojectLaunch` 뿐이고, 셋 다 호출부가 sb 를 주입한다.
 * 파싱 · 계획은 순수 함수라 dry-run 은 env 없이 돈다. 실행 CLI = `scripts/launch-backfill.ts`(+ 비출력 래퍼 `.sh`) —
 * 원격 실행(--apply · --status · --reproject)은 메인 세션 몫(D-09).
 *
 * 위치(34 IN-04 와 같다): relay 런타임(`src/index.ts` 이하)은 이 모듈을 import 하지 않는다 — CLI 전용 도구라 `src/tools/`.
 */
import { launchHeadOf, type LaunchHeadInput, type LaunchPieceInput } from "@gh-radar/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** RPC 한 번에 싣는 행 수(조각 · 머리 각각). */
export const LAUNCH_BACKFILL_CHUNK = 500;

/** 파싱에서 버린 줄 — where = `<경로>#<원소 번호>` 또는 `<경로>:<줄 번호>`. */
export interface LaunchReject {
  where: string;
  reason: string;
}

export interface LaunchParseResult {
  pieces: LaunchPieceInput[];
  rejects: LaunchReject[];
  /** ndjson 에서 본 모르는 키(무시했다) — 정렬된 목록 */
  unknownKeys: string[];
}

/** 조각 · 머리 모두 null 로 시작하는 열(D-08 — 없는 값은 null). */
const PIECE_NULLS = {
  side: null,
  queued_id: null,
  piece_idx: null,
  round: null,
  probe: null,
  order_no: null,
  result_code: null,
  accept_time: null,
  retry: null,
  abandoned: null,
  isin: null,
  price: null,
  qty: null,
  filled_qty: null,
  account: null,
  dma_user_id: null,
} as const;

const ATTACH_GATEWAY: Record<string, string> = { KB: "KB120", 교보: "KYOBO119" };
const ATTACH_MARKET: Record<string, string> = { 코스피: "K", 코스닥: "Q" };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function needInt(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${key} 가 정수가 아닙니다`);
  return v;
}

function needString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v === "") throw new Error(`${key} 가 비었거나 문자열이 아닙니다`);
  return v;
}

/** 첨부 pieces.json 한 원소 → DB 입력 조각. 모르는 broker/market 은 사유와 함께 throw. */
export function pieceFromAttach(row: unknown): LaunchPieceInput {
  if (!isObject(row)) throw new Error("원소가 객체가 아닙니다");
  const date = needString(row, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date 형식 오류(YYYY-MM-DD): ${date}`);
  const broker = needString(row, "broker");
  const gateway = ATTACH_GATEWAY[broker];
  if (!gateway) throw new Error(`모르는 broker: ${broker}`);
  const marketRaw = needString(row, "market");
  const market = ATTACH_MARKET[marketRaw];
  if (!market) throw new Error(`모르는 market: ${marketRaw}`);
  const q = row.q;
  const j = row.j;
  return {
    ...PIECE_NULLS,
    trade_date: date,
    gateway,
    profile: "Q16",
    fire_exchange: "KRX",
    fire_base: "16:00:00",
    market,
    wire: needInt(row, "wire"),
    queued_id: typeof q === "string" && q !== "" ? q : null,
    piece_idx: typeof j === "number" && Number.isInteger(j) ? j : null,
    sent_rel_us: needInt(row, "rel"),
    result: needString(row, "result"),
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 파일 하나를 읽는다 — 확장자로 형식을 고른다(`.json` = 첨부 배열). */
export function parseLaunchFile(path: string, text: string): LaunchParseResult {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return parseAttachJson(path, text);
  throw new Error(`모르는 파일 형식(.json · .ndjson · .jsonl): ${path}`);
}

function parseAttachJson(path: string, text: string): LaunchParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path}: JSON 파싱 실패 — ${errText(err)}`);
  }
  if (!Array.isArray(data)) throw new Error(`${path}: 최상위가 배열이 아닙니다(첨부 pieces.json 형식)`);
  const pieces: LaunchPieceInput[] = [];
  const rejects: LaunchReject[] = [];
  data.forEach((row, i) => {
    try {
      pieces.push(pieceFromAttach(row));
    } catch (err) {
      rejects.push({ where: `${path}#${i}`, reason: errText(err) });
    }
  });
  return { pieces, rejects, unknownKeys: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 계획 — 논리 키 중복 정리 · 머리 계산
// ─────────────────────────────────────────────────────────────────────────────

/** 묶음(발사 하나)별 조각 수 — dry-run 출력 한 줄. */
export interface LaunchPlanGroup {
  trade_date: string;
  gateway: string;
  market: string;
  profile: string;
  fire_exchange: string;
  fire_base: string;
  pieces: number;
}

export interface LaunchBackfillPlan {
  pieces: LaunchPieceInput[];
  heads: LaunchHeadInput[];
  /** 같은 논리 키가 다시 나온 수(마지막 것이 이긴다) */
  duplicates: number;
  /** (날짜, 서버, 시장, profile, 거래소) 정렬 */
  groups: LaunchPlanGroup[];
}

export interface LaunchPlanOptions {
  /** YYYYMMDD 목록 — 있으면 그 날짜만 */
  dates?: readonly string[];
}

/** 조각 논리 키 = (trade_date, gateway, profile, fire_exchange, market, wire) — DB PK 와 같다. */
function pieceKey(p: LaunchPieceInput): string {
  return [p.trade_date, p.gateway, p.profile, p.fire_exchange, p.market, p.wire].join("|");
}

/** 머리 논리 키 = (trade_date, gateway, profile, fire_exchange, market). */
function headKey(p: LaunchPieceInput): string {
  return [p.trade_date, p.gateway, p.profile, p.fire_exchange, p.market].join("|");
}

/** 조각 → 적재 계획. 머리는 shared launchHeadOf(웹 지도와 같은 한 벌)로 계산한다. */
export function planLaunchBackfill(input: readonly LaunchPieceInput[], opts: LaunchPlanOptions = {}): LaunchBackfillPlan {
  const only = opts.dates && opts.dates.length > 0 ? new Set(opts.dates) : null;
  const byKey = new Map<string, LaunchPieceInput>();
  let duplicates = 0;
  for (const p of input) {
    if (only && !only.has(p.trade_date.replace(/-/g, ""))) continue;
    const k = pieceKey(p);
    if (byKey.has(k)) duplicates++;
    byKey.set(k, p);
  }
  const pieces = [...byKey.values()];

  const fires = new Map<string, LaunchPieceInput[]>();
  for (const p of pieces) {
    const k = headKey(p);
    const list = fires.get(k);
    if (list) list.push(p);
    else fires.set(k, [p]);
  }

  const heads: LaunchHeadInput[] = [];
  const groups: LaunchPlanGroup[] = [];
  for (const ps of fires.values()) {
    const p0 = ps[0]!;
    heads.push({
      trade_date: p0.trade_date,
      gateway: p0.gateway,
      profile: p0.profile,
      fire_exchange: p0.fire_exchange,
      fire_base: p0.fire_base,
      market: p0.market,
      ...launchHeadOf(ps),
      fire_at_us: null,
      retries: null,
      abandoned: null,
      correction_before_us: null,
      correction_after_us: null,
      step_us: null,
      last_dir: null,
      bracketed: null,
      same_dir_run: null,
      reject_span_us: null,
      jump: null,
      one_way_us: null,
      rtt_min_us: null,
      next_offset_us: null,
    });
    groups.push({
      trade_date: p0.trade_date,
      gateway: p0.gateway,
      market: p0.market,
      profile: p0.profile,
      fire_exchange: p0.fire_exchange,
      fire_base: p0.fire_base,
      pieces: ps.length,
    });
  }
  const order = (g: LaunchPlanGroup) => [g.trade_date, g.gateway, g.market, g.profile, g.fire_exchange].join("|");
  groups.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  return { pieces, heads, duplicates, groups };
}

// ─────────────────────────────────────────────────────────────────────────────
// 적재 — launch_backfill_apply RPC (청크)
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchApplyResult {
  pieces_written: number;
  heads_written: number;
  /** RPC 호출 수 */
  calls: number;
}

interface ApplyResponse {
  pieces_in?: number;
  pieces_written?: number;
  heads_in?: number;
  heads_written?: number;
}

function chunksOf<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Supabase 오류 → 출력 가능한 문구. 우리 RAISE(`launch_` 로 시작 — 키 이름만 담는다)는 메시지를 싣고, 그 밖은 code 만
 * (PostgREST details · message 에 행 값 — 계좌 등 — 이 실릴 수 있다).
 */
function rpcErrorText(error: { code?: string; message?: string }): string {
  const msg = error.message ?? "";
  return msg.startsWith("launch_") ? `${error.code ?? "?"} ${msg}` : `code ${error.code ?? "?"}`;
}

/** 조각 청크를 모두 보낸 뒤 머리 청크를 보낸다. RPC 오류면 몇 번째 청크인지와 함께 throw. */
export async function applyLaunchBackfill(
  sb: SupabaseClient,
  plan: Pick<LaunchBackfillPlan, "pieces" | "heads">,
  opts: { chunk?: number } = {},
): Promise<LaunchApplyResult> {
  const size = opts.chunk ?? LAUNCH_BACKFILL_CHUNK;
  if (!Number.isInteger(size) || size < 1) throw new Error(`chunk 는 1 이상 정수: ${size}`);
  const res: LaunchApplyResult = { pieces_written: 0, heads_written: 0, calls: 0 };

  const send = async (label: string, idx: number, total: number, args: { p_pieces: unknown[]; p_heads: unknown[] }) => {
    const { data, error } = await sb.rpc("launch_backfill_apply", args);
    res.calls++;
    if (error) throw new Error(`launch_backfill_apply ${label} 청크 ${idx + 1}/${total} 실패: ${rpcErrorText(error)}`);
    const r = (data ?? {}) as ApplyResponse;
    res.pieces_written += r.pieces_written ?? 0;
    res.heads_written += r.heads_written ?? 0;
  };

  const pc = chunksOf(plan.pieces, size);
  for (let i = 0; i < pc.length; i++) await send("조각", i, pc.length, { p_pieces: pc[i]!, p_heads: [] });
  const hc = chunksOf(plan.heads, size);
  for (let i = 0; i < hc.length; i++) await send("머리", i, hc.length, { p_pieces: [], p_heads: hc[i]! });
  return res;
}
