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
/** stage `tbl` 값 — export 6 + 파생 2(28-06 이 채운다). DB CHECK 와 같은 목록. */
export type StageTbl = ExportTbl | "grid_summary" | "member_daily";

export type Row = Record<string, unknown>;

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
