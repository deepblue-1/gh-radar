import * as React from 'react';

import { cn } from '@/lib/utils';

export type NumberFormat =
  | 'price'
  | 'percent'
  | 'volume'
  | 'marketCap'
  | 'plain';

export interface NumberProps {
  value: number;
  format?: NumberFormat;
  showSign?: boolean;
  withColor?: boolean;
  precision?: number;
  className?: string;
  as?: 'span' | 'td';
}

/**
 * `<Number>` — UI-SPEC §5 계약 (locale `ko-KR` 고정, Geist Mono + tabular-nums).
 *
 * 모든 숫자 렌더링 진입점은 이 컴포넌트를 통과해야 한다. 포맷별 규칙은 UI-SPEC §5.2,
 * 색상 매핑(up/down/flat)은 §5.3, 기본 스타일 `.mono` 유틸은 globals.css §2.2 에 정의.
 *
 * @example
 * <Number value={58700} format="price" />                        // "58,700"
 * @example
 * <Number value={0.0325} format="percent" showSign withColor />  // "+3.25%" (빨강)
 * @example
 * <Number value={-0.012} format="percent" showSign withColor />  // "-1.20%" (파랑)
 * @example
 * <Number value={3.504e14} format="marketCap" />                 // "350.4 조원"
 */
export function Number({
  value,
  format = 'plain',
  showSign = false,
  withColor = false,
  precision,
  className,
  as = 'span',
}: NumberProps) {
  const formatted = formatByType(value, format, precision);

  // showSign: 양수에 '+' prefix (0은 없음). 음수는 JS 기본 '-' 를 그대로 사용.
  const signed =
    showSign && value > 0 ? `+${formatted}` : formatted;

  const colorClass = withColor
    ? value > 0
      ? 'text-[var(--up)]'
      : value < 0
        ? 'text-[var(--down)]'
        : 'text-[var(--flat)]'
    : undefined;

  const classes = cn('mono', colorClass, className);

  if (as === 'td') {
    return <td className={classes}>{signed}</td>;
  }
  return <span className={classes}>{signed}</span>;
}

function formatByType(
  value: number,
  format: NumberFormat,
  precision?: number
): string {
  switch (format) {
    case 'price':
      return new Intl.NumberFormat('ko-KR').format(value);

    case 'percent':
      return `${(value * 100).toFixed(precision ?? 2)}%`;

    case 'volume': {
      const abs = Math.abs(value);
      if (abs >= 1e8) {
        return `${(value / 1e8).toFixed(precision ?? 2)} 억`;
      }
      if (abs >= 1e4) {
        return `${(value / 1e4).toFixed(precision ?? 1)} 만`;
      }
      return new Intl.NumberFormat('ko-KR').format(value);
    }

    case 'marketCap': {
      const abs = Math.abs(value);
      if (abs >= 1e12) {
        return `${(value / 1e12).toFixed(precision ?? 1)} 조원`;
      }
      if (abs >= 1e8) {
        return `${(value / 1e8).toFixed(precision ?? 1)} 억원`;
      }
      return `${new Intl.NumberFormat('ko-KR').format(value)} 원`;
    }

    case 'plain':
    default:
      return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: precision ?? 0,
      }).format(value);
  }
}
