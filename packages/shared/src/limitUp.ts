/**
 * Phase 12 — 상한가 다음날 이력 통계 공유 타입 계약 (LIMIT-01).
 *
 * webapp · server 가 공유하는 상한가 백테스트 도메인 타입 (apiFetch<LimitUpResponse> 계약).
 * 종목 자체의 과거 마감상한가(close == 전일종가×1.30 호가단위 산출값) 이벤트의
 * 다음날 시/고/저/종 수익률을 일봉 백테스트해 종목 상세에 읽기전용 표시한다.
 *
 * DB 는 snake_case (supabase/migrations/{ts}_limit_up_tables.sql) —
 * server 의 순수함수가 row → 아래 camelCase 타입으로 변환한다.
 * 응답은 **객체**({ hero, events, themes }, 배열 아님 — comovement 계약 드리프트 회피).
 */

/** 상한가 이벤트 1건 — 다음날 OHLC 수익률 + 거래대금/회전율 (히어로 리스트 row). */
export interface LimitUpEvent {
  /** 상한가 발생일 (YYYY-MM-DD) */
  date: string;
  /** 점상한가 여부 (시=고=저=종=상한가, OHLC 만으로 판별) */
  isJeomsang: boolean;
  /** 다음날 시초가 수익률 (핵심 지표). 다음날 데이터 미존재 시 null */
  nextOpenRet: number | null;
  /** 다음날 고가 수익률 (과대평가 — 참고용) */
  nextHighRet: number | null;
  /** 다음날 저가 수익률 */
  nextLowRet: number | null;
  /** 다음날 종가 수익률 */
  nextCloseRet: number | null;
  /** 상한가 당일 거래대금 (원) */
  tradeAmount: number;
  /** 회전율 (거래량/상장주식수). listing_shares 미보유 시 null → webapp "—" */
  turnover: number | null;
}

/** 종목 자체 히어로 통계 — 익절률/평균/최악/히스토그램. */
export interface LimitUpStockStats {
  /** 전체 상한가 이벤트 수 */
  totalEvents: number;
  /** 다음날 데이터가 존재해 수익률 산출된 이벤트 수 */
  resolvedEvents: number;
  /** 시초가 익절(>0) 횟수 */
  winCount: number;
  /** 시초가 익절률 (resolvedEvents≥3 일 때만 number, 미만이면 null → webapp 큰 % 숨김, D-09) */
  winRate: number | null;
  /** 평균 시초가 수익률 (resolvedEvents 0 이면 null) */
  avgOpenRet: number | null;
  /** 최악 저가 수익률 (resolvedEvents 0 이면 null) */
  worstLowRet: number | null;
  /** 최근 N회 익절 횟수 (보조 스탯, 감쇠공식 미사용) */
  recentWins: number;
  /** 최근 N회 손실 횟수 */
  recentLosses: number;
  /** 시초가 수익률 분포 5버킷 카운트 [−10~−5, −5~0, 0~+5, +5~+10, +10%+] */
  histogram: number[];
}

/** 소속 테마별 분리 익절 통계 (per-stock 과 별도, AI 테마 중복제거 후). */
export interface LimitUpThemeStat {
  themeId: string;
  themeName: string;
  /** 테마 표본 수 (동테마 상한가 다음날 이벤트 수) */
  sampleN: number;
  /** 테마 익절률 (sampleN 기준 게이팅, 미달 시 null) */
  winRate: number | null;
  /** 테마 평균 시초가 수익률 */
  avgOpenRet: number | null;
}

/** GET 상한가 이력 응답 — **객체**(배열 아님, 계약 드리프트 회피). */
export interface LimitUpResponse {
  hero: LimitUpStockStats;
  events: LimitUpEvent[];
  themes: LimitUpThemeStat[];
}

/**
 * 상한가 가격 산출 — RPC plpgsql `limit_up_price()` 의 TS 미러 (회귀 대조용).
 *
 * 상한가 가격 = floor(prev_close × 1.3 / tick(target)) × tick(target),
 * tick 은 **target 가격(prev_close×1.3)** 기준 7-tier 구간 (2023-01-25 개정표, RESEARCH §1).
 * Pitfall 1: tick 은 prev_close 가 아닌 target 가격대로 판정해야 경계에서 정확.
 *
 * float 안전: prev_close 는 원(won) 정수라 tick 비교는 tgt 직접 사용,
 * floor(tgt / unit) * unit 결과는 정수(원) 반환 (RPC numeric 비교와 동형).
 */
export function limitUpPrice(prevClose: number): number {
  const tgt = prevClose * 1.3;
  let unit: number;
  if (tgt < 2000) unit = 1;
  else if (tgt < 5000) unit = 5;
  else if (tgt < 20000) unit = 10;
  else if (tgt < 50000) unit = 50;
  else if (tgt < 200000) unit = 100;
  else if (tgt < 500000) unit = 500;
  else unit = 1000;
  return Math.floor(tgt / unit) * unit;
}
