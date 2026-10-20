/**
 * Phase 34 Plan 02 — D-23 매집감지 소급 내보내기: kind 16(KYOBO119) → 날짜별 JSON lines.
 *
 * 목적: gh-trade 인박스 `docs/inbox/from-gh-trade/261020-accum-flow-export.md` 「소급 목록 파일 형식」 —
 * 119 `tickana.batch --date D --accum-events <file>` 입력. 줄 모양은 서버 하루 이벤트 파일(`log/accum_events/<D>.jsonl`)과
 * 같아서 배치 코드가 하나다. 필수 키는 gh-trade `teamflow_accum.EVENT_KEYS_REQUIRED` 23개이고, 키가 빠진 줄은
 * 그 줄만 `bad=` 로 버려진다 — 그래서 23키를 **늘** 싣는다(결측은 "" 또는 0).
 *
 * 이 모듈은 **읽기 전용**이다 — `dma_strategy_events` 를 select 만 한다(insert/update/delete/rpc 0). 매핑은 순수 함수
 * `accumBackfillLineOf` 이고, `exportAccumBackfillDay` 는 조회 · 파일 쓰기만 하는 얇은 층이다
 * (`dma-users-migrate.ts` 선례). 실행 CLI 는 `scripts/export-accum-backfill.ts`(+ 비출력 래퍼 `.sh`).
 *
 * 위치(34 IN-04): relay 런타임(`src/index.ts` 이하)은 이 모듈을 import 하지 않는다 — CLI 전용 일회성 도구라 런타임 소스
 * (`src/store/`)와 구분해 `src/tools/` 에 둔다. relay/node_modules(supabase-js · tsx)와 relay 타입체크 · vitest 를 쓰려고
 * relay 패키지 안에 남긴다. 소급이 끝나 필요 없어지면 이 파일 · 테스트 · CLI 를 함께 지운다.
 *
 * 키 ← kind 16 원천(인박스 표 원문 · 261018-accum-signal.md 43칸 매핑과 같다 · 라이브 `accumSignalOf` 와 열 대응 같음):
 *   row←queue_case · gw_time_ms · isin · state←qty · end_reason←cancel_reason · cycle←expected_cum · carry_days←entry_round
 *   since_date←message `since=`(문자열 "YYYYMMDD") · reg_time←message `reg=`(문자열 "HHMMSS" — 앞 0 유지)
 *   buy_qty←ev_qty_before · buy_krw←limit_bid_qty · sell_qty←ev_qty_after · sell_krw←bid1_qty · net_qty←ev_trade_qty
 *   net_krw←cond_threshold · avg_px←ev_price · reg_px←bid1_price · peak_net_krw←ask_qty_at_limit
 *   our_excluded_qty←immediate_fill_qty · mcap_krw←base_cum · th_net_krw←snap_cum[0] · th_min_same←snap_cum[1]
 *   th_max_mcap_krw←message `th=net/same/mcap` 셋째 값
 *
 * 함정:
 *   - Pitfall 16: PostgREST `max_rows = 1000`(supabase/config.toml) — select 는 1000행에서 조용히 잘린다. 그래서
 *     count(exact · head) 미리보기 → `.range()` 페이지를 짧은 페이지까지 돌고 → 읽은 행 수 ≠ 미리보기면 파일을 쓰지 않는다.
 *   - Pitfall 17: since/reg 를 숫자로 내면 "095720" → 95720 이 되어 gh-trade 가 `reg_time_ms` 를 null 로 만들고,
 *     null 로 내면 `str(None)` = "None" 이 된다. 둘 다 **문자열**, 못 읽으면 "" — 스크립트가 결측 수를 따로 센다.
 *   - `trade_date` 는 date 형 — 인자 `YYYYMMDD` 를 `YYYY-MM-DD` 로 바꿔 넣는다.
 *   - kind 16 은 30일 purge 다 — 대상 날짜는 그 안이어야 한다(≈ 10/19 이후 · 저장은 10/18 마이그레이션부터).
 *   - 계좌 · 사용자 열(`dma_user_id` · `account_no`)은 select 하지 않는다 — 필요한 열만.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

/** 소급 목록 파일 한 줄의 키 — gh-trade `teamflow_accum.EVENT_KEYS_REQUIRED` 와 같은 집합 · 이 순서로 쓴다. */
export const ACCUM_BACKFILL_KEYS = [
  "row",
  "gw_time_ms",
  "isin",
  "state",
  "end_reason",
  "cycle",
  "carry_days",
  "since_date",
  "reg_time",
  "buy_qty",
  "buy_krw",
  "sell_qty",
  "sell_krw",
  "net_qty",
  "net_krw",
  "avg_px",
  "reg_px",
  "peak_net_krw",
  "our_excluded_qty",
  "mcap_krw",
  "th_net_krw",
  "th_min_same",
  "th_max_mcap_krw",
] as const;

export type AccumBackfillKey = (typeof ACCUM_BACKFILL_KEYS)[number];
export type AccumBackfillLine = Record<AccumBackfillKey, string | number>;

/** bigint 칸은 PostgREST 가 number(또는 큰 값이면 string)로 준다 — 어느 쪽이든 정수로 바꾼다. */
type DbInt = number | string | null;

/** select 하는 열만(snake_case). 계좌 · 사용자 열은 없다. */
export type Kind16Row = {
  queue_case: DbInt;
  gw_time_ms: DbInt;
  isin: string | null;
  qty: DbInt;
  cancel_reason: DbInt;
  expected_cum: DbInt;
  entry_round: DbInt;
  message: string | null;
  ev_qty_before: DbInt;
  limit_bid_qty: DbInt;
  ev_qty_after: DbInt;
  bid1_qty: DbInt;
  ev_trade_qty: DbInt;
  cond_threshold: DbInt;
  ev_price: DbInt;
  bid1_price: DbInt;
  ask_qty_at_limit: DbInt;
  immediate_fill_qty: DbInt;
  base_cum: DbInt;
  snap_cum: (number | string)[] | null;
  journal_epoch: string;
  seq: DbInt;
};

const KIND16_COLUMNS = [
  "queue_case",
  "gw_time_ms",
  "isin",
  "qty",
  "cancel_reason",
  "expected_cum",
  "entry_round",
  "message",
  "ev_qty_before",
  "limit_bid_qty",
  "ev_qty_after",
  "bid1_qty",
  "ev_trade_qty",
  "cond_threshold",
  "ev_price",
  "bid1_price",
  "ask_qty_at_limit",
  "immediate_fill_qty",
  "base_cum",
  "snap_cum",
  "journal_epoch",
  "seq",
] as const satisfies readonly (keyof Kind16Row)[];

/** `dma_strategy_events` select 열 문자열. */
export const KIND16_SELECT = KIND16_COLUMNS.join(",");

const TABLE = "dma_strategy_events";
const KIND_ACCUM_SIGNAL = 16;
const GATEWAY = "KYOBO119";
/** PostgREST max_rows(supabase/config.toml) — 한 페이지 크기. */
const PAGE = 1000;

/** `YYYYMMDD` → `YYYY-MM-DD`(trade_date 는 date 형). 형식이 틀리거나 없는 날짜면 throw. */
export function tradeDateOf(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) throw new Error(`날짜 형식 오류: ${ymd} (YYYYMMDD)`);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`없는 날짜: ${ymd}`);
  }
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * message `k=v|k=v…` → Map. `packages/shared/src/accum-signal.ts` 의 비공개 `parseAccumMessage` 와 같은 규칙
 * (shared 를 고치지 않으려 로컬에 둔다 — 원본이 바뀌면 같이 본다).
 */
function parseAccumMessage(message: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!message) return out;
  for (const part of message.split("|")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return out;
}

/** 정수 칸 — null · 숫자 아님은 0(키를 빼면 그 줄이 gh-trade `bad=` 가 된다). */
function intOf(v: DbInt | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** `th=net/same/mcap` 셋째 값 — 3칸이고 숫자면 그 값, 아니면 0(서버 의미 「0 = 상한 없음」). */
function thMaxMcapOf(v: string | undefined): number {
  if (!v) return 0;
  const parts = v.split("/");
  return parts.length === 3 && /^\d+$/.test(parts[2]) ? Number(parts[2]) : 0;
}

/** kind 16 한 행 → 소급 목록 파일 한 줄(23키 · ACCUM_BACKFILL_KEYS 순서). */
export function accumBackfillLineOf(r: Kind16Row): AccumBackfillLine {
  const msg = parseAccumMessage(r.message);
  const since = msg.get("since") ?? "";
  const reg = msg.get("reg") ?? "";
  const snap = r.snap_cum ?? [];
  return {
    row: intOf(r.queue_case),
    gw_time_ms: intOf(r.gw_time_ms),
    isin: r.isin ?? "",
    state: intOf(r.qty),
    end_reason: intOf(r.cancel_reason),
    cycle: intOf(r.expected_cum),
    carry_days: intOf(r.entry_round),
    since_date: /^\d{8}$/.test(since) ? since : "",
    reg_time: /^\d{6}$/.test(reg) ? reg : "",
    buy_qty: intOf(r.ev_qty_before),
    buy_krw: intOf(r.limit_bid_qty),
    sell_qty: intOf(r.ev_qty_after),
    sell_krw: intOf(r.bid1_qty),
    net_qty: intOf(r.ev_trade_qty),
    net_krw: intOf(r.cond_threshold),
    avg_px: intOf(r.ev_price),
    reg_px: intOf(r.bid1_price),
    peak_net_krw: intOf(r.ask_qty_at_limit),
    our_excluded_qty: intOf(r.immediate_fill_qty),
    mcap_krw: intOf(r.base_cum),
    th_net_krw: intOf(snap[0]),
    th_min_same: intOf(snap[1]),
    th_max_mcap_krw: thMaxMcapOf(msg.get("th")),
  };
}

/** Supabase 오류는 code 만 — message/details 에 행 값이 실릴 수 있다(relay store/pg-error.ts 규율). */
function pgCode(err: unknown): string {
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
  }
  return "unknown";
}

export type AccumBackfillDayResult = {
  path: string;
  rows: number;
  isins: number;
  missingSince: number;
  missingReg: number;
};

/**
 * 한 날짜 내보내기 — ① 날짜 변환 ② 기존 파일 거부(force 아니면) ③ count 미리보기 ④ 페이지 순회
 * ⑤ 행 수 대조 ⑥ 임시 파일 → rename ⑦ 요약. `onPreview` 는 미리보기 count 를 먼저 출력하려는 CLI 용.
 */
export async function exportAccumBackfillDay(opts: {
  sb: SupabaseClient;
  date: string;
  outDir: string;
  force?: boolean;
  onPreview?: (count: number) => void;
}): Promise<AccumBackfillDayResult> {
  const { sb, date, outDir, force = false } = opts;
  const td = tradeDateOf(date);
  const path = join(outDir, `${date}.jsonl`);
  if (existsSync(path) && !force) throw new Error(`${path} 이미 있음 — --force`);

  const head = await sb
    .from(TABLE)
    .select("seq", { count: "exact", head: true })
    .eq("kind", KIND_ACCUM_SIGNAL)
    .eq("gateway", GATEWAY)
    .eq("trade_date", td);
  if (head.error) throw new Error(`${date} 미리보기 조회 실패 (code=${pgCode(head.error)})`);
  if (typeof head.count !== "number") throw new Error(`${date} 미리보기 count 없음`);
  const expected = head.count;
  opts.onPreview?.(expected);

  const rows: Kind16Row[] = [];
  for (let i = 0; ; i += PAGE) {
    const page = await sb
      .from(TABLE)
      .select(KIND16_SELECT)
      .eq("kind", KIND_ACCUM_SIGNAL)
      .eq("gateway", GATEWAY)
      .eq("trade_date", td)
      .order("gw_time_ms")
      .order("journal_epoch")
      .order("seq")
      .range(i, i + PAGE - 1);
    if (page.error) throw new Error(`${date} 페이지 조회 실패 (from=${i} code=${pgCode(page.error)})`);
    const data = (page.data ?? []) as unknown as Kind16Row[];
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  if (rows.length !== expected) {
    throw new Error(`${date} 행 수 불일치 — 미리보기 ${expected} · 읽음 ${rows.length} (파일 미작성)`);
  }

  const lines = rows.map(accumBackfillLineOf);
  mkdirSync(outDir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, lines.map((l) => `${JSON.stringify(l)}\n`).join(""));
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }

  return {
    path,
    rows: lines.length,
    isins: new Set(lines.map((l) => l.isin)).size,
    missingSince: lines.filter((l) => l.since_date === "").length,
    missingReg: lines.filter((l) => l.reg_time === "").length,
  };
}
