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
import {
  launchFireBaseOf,
  launchHeadOf,
  type LaunchFire,
  type LaunchHeadInput,
  type LaunchMapResponse,
  type LaunchPieceInput,
} from "@gh-radar/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** RPC 한 번에 싣는 행 수(조각 · 머리 각각). */
export const LAUNCH_BACKFILL_CHUNK = 500;

/**
 * gh-trade 에 요청한 ndjson 키 전부(35-01 핸드오프 「요청 내용」 (가)). 이름 = `launch_pieces` 열 이름이고
 * `user` 만 `dma_user_id` 로 들어간다. 여기 없는 키는 무시하되 parse 결과 `unknownKeys` 에 모은다.
 */
export const LAUNCH_NDJSON_KEYS = [
  "date",
  "gateway",
  "profile",
  "fire_exchange",
  "fire_base",
  "market",
  "wire",
  "queued_id",
  "piece_idx",
  "round",
  "probe",
  "order_no",
  "sent_rel_us",
  "result",
  "result_code",
  "accept_time",
  "retry",
  "abandoned",
  "side",
  "isin",
  "price",
  "qty",
  "filled_qty",
  "account",
  "user",
] as const;

const NDJSON_KEY_SET: ReadonlySet<string> = new Set(LAUNCH_NDJSON_KEYS);

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

// ─────────────────────────────────────────────────────────────────────────────
// gh-trade ndjson — 풀린 필드명 한 줄 = 조각 1건
// ─────────────────────────────────────────────────────────────────────────────

const NDJSON_GATEWAY: Record<string, string> = {
  kb: "KB120",
  kb120: "KB120",
  kyobo: "KYOBO119",
  kyobo119: "KYOBO119",
  교보: "KYOBO119",
};

const NDJSON_MARKET: Record<string, string> = { K: "K", Q: "Q", 코스피: "K", 코스닥: "Q" };

function absent(v: unknown): boolean {
  return v === undefined || v === null;
}

/** 정수 칸 — number 정수 또는 정수 문자열(앞 0 허용 · accept_time 8자리 등). 없으면 null. */
function optInt(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (absent(v) || v === "") return null;
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  throw new Error(`${key} 가 정수가 아닙니다`);
}

function reqInt(obj: Record<string, unknown>, key: string): number {
  const v = optInt(obj, key);
  if (v === null) throw new Error(`필수 키 누락: ${key}`);
  return v;
}

/** 문자열 칸 — 숫자는 문자열로(주문번호 · 계좌가 숫자로 올 수 있다). 빈 문자열 · 없음은 null. */
function optStr(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (absent(v) || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new Error(`${key} 가 문자열이 아닙니다`);
}

function reqStr(obj: Record<string, unknown>, key: string): string {
  const v = optStr(obj, key);
  if (v === null) throw new Error(`필수 키 누락: ${key}`);
  return v;
}

/** 0/1/true/false(문자열 "0"/"1" 포함) → boolean. 없으면 null. */
function optBool(obj: Record<string, unknown>, key: string): boolean | null {
  const v = obj[key];
  if (absent(v) || v === "") return null;
  if (v === true || v === 1 || v === "1" || v === "true") return true;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  throw new Error(`${key} 가 0/1/true/false 가 아닙니다`);
}

/**
 * gh-trade ndjson 한 줄(객체) → DB 입력 조각. 필수(date · gateway · profile · fire_exchange · market · wire ·
 * sent_rel_us · result) 누락이나 형식 오류는 사유와 함께 throw. 없는 선택 키는 null(D-08).
 */
export function pieceFromNdjson(obj: unknown): LaunchPieceInput {
  if (!isObject(obj)) throw new Error("줄이 JSON 객체가 아닙니다");

  const dateRaw = reqStr(obj, "date");
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(dateRaw);
  if (!m) throw new Error(`date 형식 오류(YYYY-MM-DD · YYYYMMDD): ${dateRaw}`);
  const trade_date = `${m[1]}-${m[2]}-${m[3]}`;

  const gwRaw = reqStr(obj, "gateway");
  const gateway = gwRaw === "KB120" || gwRaw === "KYOBO119" ? gwRaw : NDJSON_GATEWAY[gwRaw.toLowerCase()];
  if (!gateway) throw new Error(`모르는 gateway: ${gwRaw}`);

  const profile = reqStr(obj, "profile");
  const fire_exchange = reqStr(obj, "fire_exchange");

  const mkRaw = reqStr(obj, "market");
  const market = NDJSON_MARKET[mkRaw];
  if (!market) throw new Error(`모르는 market: ${mkRaw}`);

  let fire_base = optStr(obj, "fire_base");
  if (fire_base === null) {
    fire_base = launchFireBaseOf(profile, fire_exchange);
    if (fire_base === null) throw new Error(`fire_base 를 정할 수 없습니다(profile ${profile} · ${fire_exchange})`);
  } else if (!/^\d{2}:\d{2}:\d{2}$/.test(fire_base)) {
    throw new Error(`fire_base 형식 오류(HH:MM:SS): ${fire_base}`);
  }

  const sideRaw = optStr(obj, "side");
  const side = sideRaw === null ? null : sideRaw.toLowerCase();
  if (side !== null && side !== "buy" && side !== "sell") throw new Error(`모르는 side: ${sideRaw}`);

  return {
    trade_date,
    gateway,
    profile,
    fire_exchange,
    fire_base,
    market,
    wire: reqInt(obj, "wire"),
    side,
    queued_id: optStr(obj, "queued_id"),
    piece_idx: optInt(obj, "piece_idx"),
    round: optInt(obj, "round"),
    probe: optBool(obj, "probe"),
    order_no: optStr(obj, "order_no"),
    sent_rel_us: reqInt(obj, "sent_rel_us"),
    result: reqStr(obj, "result"),
    result_code: optInt(obj, "result_code"),
    accept_time: optInt(obj, "accept_time"),
    retry: optInt(obj, "retry"),
    abandoned: optBool(obj, "abandoned"),
    isin: optStr(obj, "isin"),
    price: optInt(obj, "price"),
    qty: optInt(obj, "qty"),
    filled_qty: optInt(obj, "filled_qty"),
    account: optStr(obj, "account"),
    dma_user_id: optStr(obj, "user"),
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 파일 하나를 읽는다 — 확장자로 형식을 고른다(`.json` = 첨부 배열 · `.ndjson` · `.jsonl` = gh-trade 한 줄 = 조각). */
export function parseLaunchFile(path: string, text: string): LaunchParseResult {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return parseAttachJson(path, text);
  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) return parseNdjson(path, text);
  throw new Error(`모르는 파일 형식(.json · .ndjson · .jsonl): ${path}`);
}

/** ndjson — 빈 줄은 건너뛰고, 깨진 줄은 줄 번호(1부터)와 사유로 rejects. */
function parseNdjson(path: string, text: string): LaunchParseResult {
  const pieces: LaunchPieceInput[] = [];
  const rejects: LaunchReject[] = [];
  const unknown = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "") return;
    const where = `${path}:${i + 1}`;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      rejects.push({ where, reason: "JSON 파싱 실패" });
      return;
    }
    if (isObject(obj)) for (const k of Object.keys(obj)) if (!NDJSON_KEY_SET.has(k)) unknown.add(k);
    try {
      pieces.push(pieceFromNdjson(obj));
    } catch (err) {
      rejects.push({ where, reason: errText(err) });
    }
  });
  return { pieces, rejects, unknownKeys: [...unknown].sort() };
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

// ─────────────────────────────────────────────────────────────────────────────
// 원격 상태(읽기 전용) · 재투영(Wave B)
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchStatusDay {
  /** YYYYMMDD */
  trade_date: string;
  gateway: string;
  market: string;
  pieces: number;
}

export interface LaunchFireStatus {
  fire: LaunchFire;
  days: number;
  pieces: number;
  /** 지도 RPC 의 heads = (서버, 시장, profile) 별 최신 1행 */
  heads: number;
  /** 날짜 × 서버 × 시장 조각 수(날짜 · 서버 · 시장 순) */
  byDay: LaunchStatusDay[];
}

const STATUS_FIRES: readonly LaunchFire[] = ["q16", "n0930"];

/** 원격 지도 RPC 를 발사 기준마다 한 번(p_days null = 전체) — 읽기 전용. */
export async function launchStatusOf(sb: SupabaseClient): Promise<LaunchFireStatus[]> {
  const out: LaunchFireStatus[] = [];
  for (const fire of STATUS_FIRES) {
    const { data, error } = await sb.rpc("launch_map_for_admin", { p_fire: fire, p_days: null });
    if (error) throw new Error(`launch_map_for_admin(${fire}) 실패: ${rpcErrorText(error)}`);
    const r = (data ?? { days: [], heads: [], pieces: [] }) as LaunchMapResponse;
    const count = new Map<string, LaunchStatusDay>();
    for (const p of r.pieces) {
      const k = `${p.trade_date}|${p.gateway}|${p.market}`;
      const cur = count.get(k);
      if (cur) cur.pieces++;
      else count.set(k, { trade_date: p.trade_date, gateway: p.gateway, market: p.market, pieces: 1 });
    }
    const byDay = [...count.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
    out.push({ fire, days: r.days.length, pieces: r.pieces.length, heads: r.heads.length, byDay });
  }
  return out;
}

export interface LaunchReprojectOptions {
  /** YYYYMMDD — 이 날부터(포함) */
  from?: string;
  /** YYYYMMDD — 이 날까지(포함) */
  to?: string;
  /** 거짓 = kind 17 · 18 원문 수만 센다(쓰기 0) · 참 = launch_reproject RPC */
  apply: boolean;
}

export type LaunchReprojectResult =
  | { mode: "dry"; events: number }
  | { mode: "apply"; projected: number; errors: unknown[] };

function ymdToIso(ymd: string, label: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`${label} 형식 오류(YYYYMMDD): ${ymd}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Wave B 재해석 — 정식 kind 17 · 18 매핑으로 투영 함수를 바꾼 뒤 그동안 쌓인 원문을 다시 푼다.
 * dry 는 원문 수(head count)만 읽고, apply 는 `launch_reproject(p_from, p_to)` 반환({projected, errors})을 그대로 준다.
 */
export async function reprojectLaunch(sb: SupabaseClient, opts: LaunchReprojectOptions): Promise<LaunchReprojectResult> {
  const from = opts.from ? ymdToIso(opts.from, "from") : null;
  const to = opts.to ? ymdToIso(opts.to, "to") : null;
  if (!opts.apply) {
    let q = sb.from("dma_strategy_events").select("seq", { count: "exact", head: true }).in("kind", [17, 18]);
    if (from) q = q.gte("trade_date", from);
    if (to) q = q.lte("trade_date", to);
    const { count, error } = await q;
    if (error) throw new Error(`dma_strategy_events kind 17·18 count 실패: ${rpcErrorText(error)}`);
    return { mode: "dry", events: count ?? 0 };
  }
  const { data, error } = await sb.rpc("launch_reproject", { p_from: from, p_to: to });
  if (error) throw new Error(`launch_reproject 실패: ${rpcErrorText(error)}`);
  const r = (data ?? {}) as { projected?: number; errors?: unknown[] };
  return { mode: "apply", projected: r.projected ?? 0, errors: r.errors ?? [] };
}
