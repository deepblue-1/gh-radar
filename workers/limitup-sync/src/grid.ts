/**
 * 종목 격자 파일 — 읽기(파생 계산용 파싱 + 업로드용 원 바이트) · Storage 비공개 버킷 업로드(D-14).
 *
 * 객체 경로 `limitup-grid/grid/<YYYYMMDD>/<isin>.json.gz` — export 파일 바이트 그대로, `contentType: application/gzip`
 * (브라우저가 `DecompressionStream('gzip')` 로 푼다 — 전송 형식 재량 · RESEARCH §D-5), `upsert: true`(재적재 덮어쓰기).
 * 버킷은 마이그레이션 20261006090300 이 만든다(비공개 · 정책 0 — 업로드는 service role, 읽기는 server 서명 URL).
 *
 * 순서 계약(index.ts): 업로드는 commit **앞**이다 — 업로드가 하나라도 실패하면 commit 하지 않아 「적재됐는데 격자 없음」
 * 이 생기지 않고, commit 이 실패하면 이력이 안 바뀌어 다음 run 이 날짜를 통째로 다시 한다. 앞선 업로드가 남긴 객체는
 * 무해하다(보고서는 grid_summary 에 있는 isin 만 서명한다 · 다음 성공 run 이 upsert 로 덮는다).
 */
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GridJson } from "./derive";

export const GRID_BUCKET = "limitup-grid";

/** manifest files[].name 중 격자 파일 — `grid/<isin>.json.gz`(isin 은 영숫자만). */
export const GRID_NAME_RE = /^grid\/([A-Z0-9]+)\.json\.gz$/;

export function gridObjectPath(date: string, isin: string): string {
  return `grid/${date}/${isin}.json.gz`;
}

/** 격자 파일 하나 — 원 바이트(업로드) + 해제 · 파싱 결과(파생). */
export function readGridGz(path: string): { bytes: Buffer; json: GridJson } {
  const bytes = readFileSync(path);
  const json = JSON.parse(gunzipSync(bytes).toString("utf8")) as GridJson;
  return { bytes, json };
}

/** 날짜 하나의 격자를 순서대로 upsert 업로드. 하나라도 error 면 객체 경로 · 메시지를 담아 throw. 반환 = 올린 수. */
export async function uploadGrids(sb: SupabaseClient, date: string, grids: { isin: string; bytes: Buffer }[]): Promise<number> {
  const bucket = sb.storage.from(GRID_BUCKET);
  for (const g of grids) {
    const path = gridObjectPath(date, g.isin);
    const { error } = await bucket.upload(path, g.bytes, { contentType: "application/gzip", upsert: true });
    if (error) throw new Error(`storage upload ${GRID_BUCKET}/${path}: ${error.message}`);
  }
  return grids.length;
}
