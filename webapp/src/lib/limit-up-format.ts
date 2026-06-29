/**
 * Phase 12 — 상한가 다음날 이력 표시 순수함수 (LIMIT-01).
 *
 * StockLimitUpSection 의 게이팅 / spark 버킷 색 / 수익률·회전율 포맷 로직을
 * 컴포넌트에서 분리한 단일 진리원 — 단위 테스트로 박제(limit-up-format.test.ts).
 * 색(--up/--down) 적용은 컴포넌트 책임이고, 여기서는 tone('up'|'down') 과
 * 문자열 포맷만 반환한다 (포맷과 색 분리, D-13).
 */

import type { LimitUpStockStats } from '@gh-radar/shared';

/** Unicode 마이너스(−, U+2212) — em-dash/방향 부호와 톤 일치 (목업 기준). */
const MINUS = '−';

/**
 * 익절률 큰 % 표시 게이팅 (D-09): resolvedEvents ≥ 3 일 때만 큰 % 노출.
 * 미만이면 컴포넌트가 카운트만(M/N) 표시 — 가짜정밀도/과신 방지(T-12-05-02).
 */
export function shouldShowWinRate(
  stats: Pick<LimitUpStockStats, 'resolvedEvents'>,
): boolean {
  return stats.resolvedEvents >= 3;
}

/**
 * 분포 5버킷 x축 라벨 (시초가 수익률 구간) — 컴포넌트와 공유하는 단일 진리원.
 * 버킷 경계: [−10~−5, −5~0, 0~+5, +5~+10, +10%+] 에 대응.
 * index 2('0~+5')가 첫 양수 구간 — sparkBucketTone 경계(>=2)와 의미 일치.
 */
export const BUCKET_LABELS: readonly string[] = [
  '−5%↓',
  '−5~0',
  '0~+5',
  '+5~+10',
  '+10%↑',
];

/**
 * 분포 5버킷 index → spark 막대 색 톤 (BLOCKER 3 off-by-one 정확 매핑).
 * 버킷 경계: [−10~−5, −5~0, 0~+5, +5~+10, +10%+]
 *   - index 0,1 = 음수 구간 → 'down'(파랑)
 *   - index 2,3,4 = 0 이상 구간(0~+5% 포함) → 'up'(빨강)
 * 즉 index ≥ 2 만 'up' — 0~+5% 가 음수로 오분류되지 않도록 경계를 2 로 고정.
 */
export function sparkBucketTone(index: number): 'up' | 'down' {
  return index >= 2 ? 'up' : 'down';
}

/**
 * 수익률 포맷 — null → em-dash, 방향 부호 접두 + 소수 1자리.
 * 예: +2.8% / −7.1% / 0.0%(보합). 색은 컴포넌트가 별도 tone 으로 적용.
 */
export function fmtRet(v: number | null): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : v < 0 ? MINUS : '';
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

/**
 * 회전율 포맷 (거래량/상장주식수) — null → em-dash, else 정수 % (D-07 근사).
 * 예: 0.18 → "18%".
 */
export function fmtTurnover(v: number | null): string {
  if (v == null) return '—';
  return `${Math.round(v * 100)}%`;
}
