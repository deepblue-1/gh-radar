import { Skeleton } from '@/components/ui/skeleton';

/**
 * Phase 09.2 — 일봉 차트 카드 본문 영역 전용 Skeleton (D-16).
 *
 * height 는 StockDailyChart 와 동일 (default 340px) 로 맞춰 데이터 도착 시
 * 차트 컨테이너로 교체되어도 layout shift (CLS) 가 발생하지 않게 한다.
 * aria-busy + aria-label 로 screen reader 가 "로딩 중" 상태를 인지하게 한다.
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
      aria-busy="true"
      aria-label="일봉 차트 로딩 중"
      className="w-full"
      style={{ height: `${height}px` }}
    />
  );
}
