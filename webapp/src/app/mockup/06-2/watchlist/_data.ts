export interface MockStock {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  price: number;
  change: number; // percent, signed
  value: number; // 거래대금 (KRW)
}

export const MOCK_STOCKS: MockStock[] = [
  { code: '005930', name: '삼성전자', market: 'KOSPI', price: 82100, change: 2.88, value: 412_000_000_000 },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI', price: 215500, change: 4.62, value: 1_204_000_000_000 },
  { code: '035720', name: '카카오', market: 'KOSPI', price: 41500, change: -1.31, value: 87_300_000_000 },
  { code: '247540', name: '에코프로비엠', market: 'KOSDAQ', price: 168200, change: 8.45, value: 632_100_000_000 },
  { code: '091990', name: '셀트리온헬스케어', market: 'KOSDAQ', price: 72100, change: 0.0, value: 23_400_000_000 },
  { code: '068270', name: '셀트리온', market: 'KOSPI', price: 195400, change: -2.62, value: 189_500_000_000 },
];

export function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function formatValue(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
  if (n >= 1e8) return `${(n / 1e8).toFixed(0)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return `${n}`;
}

export function formatPercent(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function changeColorToken(n: number): string {
  if (n > 0) return 'var(--up)';
  if (n < 0) return 'var(--down)';
  return 'var(--flat)';
}
