/**
 * Phase 10 — Theme Classification 공유 타입 계약 (THEME-01 / THEME-03).
 *
 * webapp · server · workers/theme-sync 가 공유하는 camelCase 도메인 타입.
 * DB 는 snake_case (supabase/migrations/20260609120000_theme_tables.sql) —
 * mapper 가 row → 아래 타입으로 변환한다.
 *
 * 레이어 분리(D-01):
 *   - 시스템 테마: isSystem=true, ownerId=null (워커 service_role 만 쓰기, 전역 read)
 *   - 유저 테마:   isSystem=false, ownerId=auth.uid() (owner-only CRUD)
 */

import type { Market } from "./stock.js";

/**
 * theme_stocks.source 컬럼의 허용 값.
 *   - naver:       네이버 금융 테마 스크랩 (산업/이벤트)
 *   - alphasquare: 알파스퀘어 JSON API (정치인주/시사)
 *   - user:        유저 테마에 직접 추가한 종목
 */
export type ThemeStockSource = "naver" | "alphasquare" | "user";

/**
 * ThemeStockSource 의 런타임 sentinel — DB `theme_stocks.source` 와 1:1 대응.
 * 워커 upsert·server 검증·UI 뱃지 iterate 용. 순서·멤버는 마이그레이션 주석과 동기화.
 */
export const THEME_STOCK_SOURCES: readonly ThemeStockSource[] = [
  "naver",
  "alphasquare",
  "user",
] as const;

/**
 * themes 테이블 row (camelCase).
 * 시스템 테마(ownerId=null) 와 유저 테마(ownerId 채움)를 단일 타입으로 표현 —
 * DB CHECK(themes_owner_consistency) 가 (isSystem ⇒ ownerId NULL) 을 강제.
 */
export interface Theme {
  /** uuid PK */
  id: string;
  name: string;
  /** 시스템 테마 설명 / 유저 테마는 null 가능 */
  description: string | null;
  /** true=시스템(스크랩, read-only), false=유저(owner-only CRUD) */
  isSystem: boolean;
  /** 시스템=null, 유저=auth.uid() */
  ownerId: string | null;
  /** 다중 출처 태그: {naver, alphasquare} (유저 테마는 보통 ['user']) */
  sources: ThemeStockSource[];
  /** 정렬 지표 precompute — 소속 종목 등락률 상위 3 평균 (미계산 시 null) */
  top3AvgChangeRate: number | null;
  /** top3AvgChangeRate 계산 시각 (ISO) — 미계산 시 null */
  statsUpdatedAt: string | null;
  /** ISO timestamptz */
  createdAt: string;
  /** ISO timestamptz */
  updatedAt: string;
}

/**
 * theme_stocks 테이블 row (M:N + provenance, D-02 / D-03).
 * 현재 편입 1행 = (themeId, stockCode) PK. 제외 이력은 effectiveTo 로 표현.
 */
export interface ThemeStock {
  themeId: string;
  /** stocks.code (6자 단축코드) FK */
  stockCode: string;
  source: ThemeStockSource;
  /** 0~1 신뢰도 (스크랩) — 미상 시 null */
  confidence: number | null;
  /** 네이버 '편입 사유' info_txt 등 — 없으면 null */
  reason: string | null;
  /** 편입 시각 (ISO) */
  effectiveFrom: string;
  /** 제외 시각 (ISO) — null 이면 현재 편입 중 */
  effectiveTo: string | null;
}

/**
 * /themes/[id] 종목 행 — scanner row(StockWithProximity) 와 매핑되는 최소 필드.
 * theme_stocks ⋈ stock_quotes ⋈ stocks 조인 결과.
 */
export interface ThemeStockMember {
  code: string;
  name: string;
  market: Market;
  price: number;
  changeRate: number;
  tradeAmount: number;
  source: ThemeStockSource;
}

/**
 * /themes 목록·상세 응답용 — Theme + 정렬/표시 통계.
 * top3AvgChangeRate 는 Theme 에서 상속(정렬 키), stocks 는 상세에서만 채움.
 */
export type ThemeWithStats = Theme & {
  /** 소속(active) 종목 수 */
  stockCount: number;
  /** 상세 응답에서만 채움 — 목록 응답에서는 생략 */
  stocks?: ThemeStockMember[];
};
