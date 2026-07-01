/**
 * Phase 13 — home_theme_snapshots DB row → camelCase 매핑 (HOME-01).
 *
 * home_theme_snapshots (snake_case, supabase/migrations/{ts}_home_theme_snapshots.sql) 의
 * row 형태를 정의하고, packages/shared 의 camelCase 계약 타입
 * (HomeThemeSnapshot / HomeSnapshotIndexEntry) 으로 변환한다.
 *
 * **payload 는 verbatim 통과** — worker(home-sync)가 Claude 출력을 이미 camelCase blob
 * 으로 저장하므로 재변환/재계산이 없다. 특히 stock changeRate 는 저장 시점 값을 그대로
 * 서빙하며 실시간 시세 재조인을 하지 않는다 (T-13-03 Tampering / RESEARCH Pitfall 3 —
 * 과거 슬롯이 오늘 시세로 오염되면 안 됨). limitUp 라우트의 "정적 이력" 선례와 동형.
 */

import type {
  HomeThemeSnapshot,
  HomeSnapshotIndexEntry,
  HomeSnapshotPayload,
} from "@gh-radar/shared";

/**
 * home_theme_snapshots 테이블 row (snake_case).
 * payload 는 Claude 출력 1:1 jsonb blob (이미 camelCase, D-06).
 */
export type HomeSnapshotRow = {
  trade_date: string;
  captured_at: string;
  theme_count: number;
  stock_count: number;
  is_carried: boolean;
  payload: HomeSnapshotPayload;
};

/** payload 를 제외한 인덱스 row (네비게이션용 경량 SELECT). */
export type HomeIndexRow = Omit<HomeSnapshotRow, "payload">;

/**
 * home_theme_snapshots row → HomeThemeSnapshot.
 * payload 는 verbatim 통과 (재조인/재계산 없음 — Pitfall 3, T-13-03).
 */
export function mapSnapshot(row: HomeSnapshotRow): HomeThemeSnapshot {
  return {
    tradeDate: row.trade_date,
    capturedAt: row.captured_at,
    themeCount: row.theme_count,
    stockCount: row.stock_count,
    isCarried: Boolean(row.is_carried),
    payload: row.payload,
  };
}

/**
 * home_theme_snapshots row(payload 제외) → HomeSnapshotIndexEntry.
 * 날짜/시점 네비게이션용 경량 엔트리 (payload 미포함).
 */
export function mapIndexEntry(row: HomeIndexRow): HomeSnapshotIndexEntry {
  return {
    tradeDate: row.trade_date,
    capturedAt: row.captured_at,
    themeCount: row.theme_count,
    stockCount: row.stock_count,
    isCarried: Boolean(row.is_carried),
  };
}
