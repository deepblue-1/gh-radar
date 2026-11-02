/**
 * 격자 저장소(D-04) — Supabase Storage 비공개 버킷 `tick-grid`(37-01 Task 2 「저장처: supabase-storage」).
 *
 * 객체 경로 `grid/<YYYYMMDD>/<KRX|NXT>/<isin>.<mode>.ticks.zst` — 모드별 경로라 request 결과가 nightly 객체를 덮지 않는다
 * (메타 행이 가리키는 경로가 정본 · `tick_grid_upsert` 모드 규칙). contentType `application/zstd` · upsert true(재변환 덮어쓰기).
 * 버킷은 마이그레이션 20261102200000 이 만든다(정책 0 — 업로드는 service role, 읽기는 server 서명 URL).
 *
 * 순서 계약(modes/*): 업로드가 메타 upsert **앞**이다 — 업로드가 실패한 키는 메타를 쓰지 않아 「메타는 있는데 객체 없음」 이
 * 생기지 않는다. 업로드 뒤 메타가 실패하면 객체만 남는다 — 무해하다(메타가 가리키지 않음 · 다음 성공 실행이 덮고, 90일 purge 가
 * 날짜 폴더째 지운다 · limitup-sync grid.ts 동형).
 *
 * 저장처가 GCS 로 바뀌면 이 인터페이스 뒤에 GCS 구현을 더한다(호출자 무변경).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const GRID_BUCKET = "tick-grid";
export const GRID_CONTENT_TYPE = "application/zstd";

export type GridMode = "nightly" | "request" | "promoted";
export type Exchange = "KRX" | "NXT";

const LIST_LIMIT = 1000;
const MAX_REMOVE_ROUNDS = 20;
const EXCHANGES: readonly Exchange[] = ["KRX", "NXT"];

export function gridObjectPath(date: string, ex: Exchange, isin: string, mode: GridMode): string {
  return `grid/${date}/${ex}/${isin}.${mode}.ticks.zst`;
}

export interface GridStore {
  /** 객체 하나 upsert 업로드. 실패면 경로를 담아 throw. */
  upload(path: string, bytes: Uint8Array): Promise<void>;
  /** 날짜 폴더(`grid/<D>/KRX` · `grid/<D>/NXT`)의 객체를 지운다. 반환 = 지운 객체 수. */
  removeDates(dates: readonly string[]): Promise<number>;
}

export function createSupabaseGridStore(sb: SupabaseClient): GridStore {
  const bucket = () => sb.storage.from(GRID_BUCKET);
  return {
    async upload(path, bytes) {
      const { error } = await bucket().upload(path, bytes, { contentType: GRID_CONTENT_TYPE, upsert: true });
      if (error) throw new Error(`storage upload ${GRID_BUCKET}/${path}: ${error.message}`);
    },
    async removeDates(dates) {
      let removed = 0;
      for (const d of dates) {
        for (const ex of EXCHANGES) {
          const dir = `grid/${d}/${ex}`;
          // 1,000개씩 — 다 지울 때까지(한 폴더 = 그날 그 거래소 종목 수 · 보통 수십~수백). 라운드 상한은 remove 가
          // 조용히 안 지우는 경우의 무한 반복 방지(남은 객체는 다음 실행이 마저 지운다).
          for (let round = 0; round < MAX_REMOVE_ROUNDS; round++) {
            const { data, error } = await bucket().list(dir, { limit: LIST_LIMIT });
            if (error) throw new Error(`storage list ${GRID_BUCKET}/${dir}: ${error.message}`);
            const paths = (data ?? []).map((f) => `${dir}/${f.name}`);
            if (paths.length === 0) break;
            const { error: re } = await bucket().remove(paths);
            if (re) throw new Error(`storage remove ${GRID_BUCKET}/${dir}: ${re.message}`);
            removed += paths.length;
            if (paths.length < LIST_LIMIT) break;
          }
        }
      }
      return removed;
    },
  };
}
