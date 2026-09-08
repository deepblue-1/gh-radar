import { Skeleton } from '@/components/ui/skeleton';

/**
 * Phase 09.2 — 일봉 차트 카드 본문 영역 전용 Skeleton (D-16).
 *
 * height 는 StockDailyChart 와 동일 (default 340px) 로 맞춰 데이터 도착 시
 * 차트 컨테이너로 교체되어도 layout shift (CLS) 가 발생하지 않게 한다.
 * aria-busy + aria-label 로 screen reader 가 "로딩 중" 상태를 인지하게 한다.
 *
 * ★ `role="status"` 가 **필수**다. `Skeleton` 은 role 없는 `<div>` 라서 `aria-label` 만
 *   붙이면 axe `aria-prohibited-attr` 위반이다 — 암묵 role 이 `generic` 인 요소에는
 *   접근 이름을 붙일 수 없고, 붙여도 스크린리더가 읽지 않는다(라벨이 조용히 사라진다).
 *   `themes-skeleton` · `watchlist-skeleton` · `scanner-skeleton` 은 이미 같은 규약이다.
 *
 * 부모(StockDailyChartSection) 가 Pitfall 5 방어를 위해 `absolute inset-0`
 * overlay 로 차트 컨테이너 위에 깔아 사용한다 (chart container 자체는 항상
 * visible 상태 유지 → display:none 시 createChart 의 0×0 throw 회피).
 */
export interface StockDailyChartSkeletonProps {
  height?: number;
}

export function StockDailyChartSkeleton({
  height = 340,
}: StockDailyChartSkeletonProps) {
  return (
    <Skeleton
      role="status"
      aria-busy="true"
      aria-label="일봉 차트 로딩 중"
      className="w-full"
      style={{ height: `${height}px` }}
    />
  );
}
