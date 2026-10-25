/**
 * ndjson.gz 읽기 · stage 청크 삽입 · 날짜 원자 commit RPC 호출.
 *
 * DB 쪽은 supabase/migrations/20261006090200_limitup_load_rpcs.sql — stage payload 는 export 행 원문 그대로
 * (`jsonb_populate_record` 가 키 이름 = 열 이름으로 채운다). PostgREST 는 요청 간 트랜잭션을 못 잇기 때문에
 * 그날 표 교체는 `limitup_commit_day` 한 번이 한다 — 여기서는 stage 를 채우고 그 RPC 를 부를 뿐이다.
 */
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

/** export 파일 6개(= 노트 표 6개). 파일 이름 = `<tbl>.ndjson.gz`. */
export const EXPORT_TABLES = ["entries", "locks", "jumps", "member_alloc", "facts", "touches"] as const;
export type ExportTbl = (typeof EXPORT_TABLES)[number];
/** stage `tbl` 값 — export 6 + 파생 2 + 선택 2 — DB CHECK 와 같은 목록(20261020200000). */
export type StageTbl = ExportTbl | "grid_summary" | "member_daily" | "team_flow" | "accum_flow";

/**
 * 선택 파일 표(Phase 33 D-02 · Phase 34 D-02) — manifest `files[]` 에 있을 때만 적재하고(없으면 0행 commit),
 * 필수 6표 루프(`EXPORT_TABLES`)에는 넣지 않는다 — 없다고 그 날짜가 실패하면 안 된다.
 * accum_flow 는 파일이 **깨져도**(행 수 불일치 · `accumRowProblems`) 첫 적재에서는 0행 · 기대 수 키 없이 싣는다(34 WR-02 —
 * index.ts). team_flow 는 지금처럼 행 수가 다르면 그 날짜 실패.
 * 행은 export 원문 그대로 stage 한다(33 D-04 · 34 D-05 — 단위 변환 · 키 재조립 없음).
 */
export type OptionalTbl = "team_flow" | "accum_flow";

/**
 * 선택 파일 목록 — 표 · 파일 이름 · stage 청크(행 수). 청크는 insert 본문을 증명된 크기
 * (member_alloc 1000행 ≈ 293KB) 안에 두려고 표마다 따로 잡는다.
 */
export const OPTIONAL_FILES: readonly { tbl: OptionalTbl; file: string; chunk: number }[] = [
  // 팀 매집(Phase 33) — 10/14 실측 행 ≈ 14KB(payload 포함)라 기본 청크(1000)면 insert 본문이 수 MB 가 된다.
  // 증명된 insert 본문에 맞춰 20행(Phase 33 RESEARCH Pitfall 5).
  { tbl: "team_flow", file: "team_flow.ndjson.gz", chunk: 20 },
  // 매집감지(Phase 34) — 최대 행 json ≈ 224KB(10/14 한선엔지니어링)라 1행씩이어야 증명된 본문 ≈ 293KB 안이다
  // (2행이면 최악 ≈ 448KB 로 범위 밖 · 34 RESEARCH 청크 권고). 하루 수~수십 행이라 insert 횟수는 문제 아님.
  { tbl: "accum_flow", file: "accum_flow.ndjson.gz", chunk: 1 },
];

export type Row = Record<string, unknown>;

/**
 * accum_flow 평평한 열 중 숫자형 — 표 정의(supabase/migrations/20261020200000_limitup_accum_flow.sql +
 * 20261025200000(당일 축 4열 · quick-261025-uf2))와 같은 목록.
 * `jsonb_populate_record` 는 JSON 숫자 텍스트를 열 입력 함수에 그대로 넣으므로 29.78 이 bigint 열에 가면 그날 commit
 * 전체가 롤백된다(상한가 6표 · team_flow 까지) — 그래서 stage 전에 워커가 먼저 본다(`accumRowProblems` · 34 WR-02).
 */
const ACCUM_BIGINT_COLS = [
  "base", "upper", "last_px", "high_px", "reg_time_ms", "end_time_ms", "our_excluded_qty", "mcap_krw",
  "th_net_krw", "th_same", "th_mcap_krw", "pos_buy_qty", "pos_buy_krw", "pos_sell_qty", "pos_sell_krw",
  "pos_net_krw", "pos_avg_px", "pos_peak_net_krw", "pos_reg_px", "day_buy_krw", "day_sell_krw", "day_net_krw",
  "day_buy_qty", "day_sell_qty", "pos_day_buy_krw", "pos_day_sell_krw",
] as const;
const ACCUM_INT4_COLS = [
  "state", "end_reason", "cycle", "carry_days", "schema_version", "th_recent_pieces", "th_recent_sec",
] as const;
const ACCUM_FLOAT_COLS = ["last_rate", "high_rate"] as const;
const INT4_MAX = 2_147_483_647;
/** 문제 목록 상한 — 로그 한 줄에 다 싣지 않는다. */
const PROBLEMS_MAX = 5;

/**
 * accum_flow 행이 commit RPC 를 깨뜨릴 결함 목록(34 WR-02 · 비면 정상) — 날짜 불일치(payload 날짜 대조) ·
 * isin 결측 · 같은 isin 두 줄(PK 위반) · 정수 열(bigint · integer)에 정수 아닌 값 · 실수 열에 숫자 아닌 값.
 * null · 키 없음은 통과(열이 null 허용). 처음 `PROBLEMS_MAX` 개만 돌려준다.
 */
export function accumRowProblems(date: string, rows: readonly Row[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const isNil = (v: unknown) => v === null || v === undefined;
  rows.forEach((r, i) => {
    const at = `row ${i + 1}`;
    if (r.date !== date) out.push(`${at} date ${String(r.date)} != ${date}`);
    const isin = r.isin;
    if (typeof isin !== "string" || isin === "") out.push(`${at} isin missing`);
    else if (seen.has(isin)) out.push(`${at} isin ${isin} duplicate`);
    else seen.add(isin);
    for (const c of ACCUM_BIGINT_COLS) {
      if (!isNil(r[c]) && !Number.isSafeInteger(r[c])) out.push(`${at} ${c} not integer: ${JSON.stringify(r[c])}`);
    }
    for (const c of ACCUM_INT4_COLS) {
      const v = r[c];
      if (!isNil(v) && !(Number.isInteger(v) && Math.abs(v as number) <= INT4_MAX)) {
        out.push(`${at} ${c} not int4: ${JSON.stringify(v)}`);
      }
    }
    for (const c of ACCUM_FLOAT_COLS) {
      const v = r[c];
      if (!isNil(v) && !(typeof v === "number" && Number.isFinite(v))) out.push(`${at} ${c} not number: ${JSON.stringify(v)}`);
    }
  });
  return out.slice(0, PROBLEMS_MAX);
}

/** gzip 해제 → 줄 분리 → JSON.parse(빈 줄 무시). */
export function readNdjsonGz(path: string): Row[] {
  const text = gunzipSync(readFileSync(path)).toString("utf8");
  const out: Row[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line) as Row);
  }
  return out;
}

/**
 * 표마다 seq 1부터 `{ date, tbl, seq, payload }` 를 chunk 행씩 `limitup_stage` 에 삽입한다.
 * 반환 = 표별 넣은 행 수. 오류면 표 · seq 범위 · PostgREST 메시지를 담아 throw.
 */
export async function stageDay(
  sb: SupabaseClient,
  date: string,
  tables: Partial<Record<StageTbl, Row[]>>,
  chunk: number,
): Promise<Partial<Record<StageTbl, number>>> {
  const counts: Partial<Record<StageTbl, number>> = {};
  for (const [tbl, rows] of Object.entries(tables) as [StageTbl, Row[]][]) {
    for (let i = 0; i < rows.length; i += chunk) {
      const batch = rows.slice(i, i + chunk).map((payload, j) => ({ date, tbl, seq: i + j + 1, payload }));
      const { error } = await sb.from("limitup_stage").insert(batch);
      if (error) {
        throw new Error(`limitup_stage insert ${date} ${tbl} seq ${i + 1}..${i + batch.length}: ${error.message}`);
      }
    }
    counts[tbl] = rows.length;
  }
  return counts;
}

export type CommitArgs = {
  date: string;
  manifestSha256: string;
  filesSig: string;
  schemaVersion: number;
  expected: Partial<Record<StageTbl, number>>;
};

/** `limitup_commit_day` 1회 — 그날 표를 stage 로 원자 교체. 오류면 throw. */
export async function commitDay(sb: SupabaseClient, args: CommitArgs): Promise<unknown> {
  const { data, error } = await sb.rpc("limitup_commit_day", {
    p_date: args.date,
    p_manifest_sha256: args.manifestSha256,
    p_files_sig: args.filesSig,
    p_schema_version: args.schemaVersion,
    p_expected: args.expected,
  });
  if (error) throw new Error(`limitup_commit_day ${args.date}: ${error.message}`);
  return data;
}
