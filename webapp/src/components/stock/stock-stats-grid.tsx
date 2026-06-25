import type { Stock } from '@gh-radar/shared';
import { Card } from '@/components/ui/card';
import {
  Number as NumberDisplay,
  type NumberFormat,
} from '@/components/ui/number';

const valid = (v: number) => Number.isFinite(v) && v > 0;
const clampPct = (n: number) => Math.min(100, Math.max(0, n));

interface StatCell {
  label: string;
  value: number;
  format: NumberFormat;
  /** true 면 value <= 0 또는 !Number.isFinite 시 em-dash (Pitfall 1 대응) */
  nullAsEmDash: boolean;
}

/** value<=0/비유한 시 em-dash, 아니면 NumberDisplay */
function StatValue({ cell }: { cell: StatCell }) {
  const isNull =
    cell.nullAsEmDash && (!Number.isFinite(cell.value) || cell.value <= 0);
  return isNull ? (
    <span className="mono text-[var(--muted-fg)]">—</span>
  ) : (
    <NumberDisplay value={cell.value} format={cell.format} />
  );
}

/**
 * StockStatsGrid — 가격 정보 (B3 통합 스펙트럼 바).
 *
 * 하한가→상한가 전체를 한 바로 표현하고 그 위에:
 *   - 당일 저가~고가 음영 밴드
 *   - 전일종가 세로 기준선 (= price - changeAmount)
 *   - 현재가 마커 + 태그 (엣지 앵커링으로 갭 상한가 시 잘림 방지)
 * 를 겹쳐 "현재가가 변동폭 어디에 있는지 / 상한가까지 여력" 을 한눈에 보여준다.
 *
 * 종목명/현재가/등락 헤더는 상위 StockHero 가 담당하므로 여기서는 중복 렌더하지 않는다.
 * 상·하한가 스케일이 무효(거래정지·결측 등)면 8필드 폴백 그리드로 분기한다.
 */
export function StockStatsGrid({ stock }: { stock: Stock }) {
  const hasScale =
    valid(stock.upperLimit) &&
    valid(stock.lowerLimit) &&
    stock.upperLimit > stock.lowerLimit;

  if (!hasScale) {
    return <StatsGridFallback stock={stock} />;
  }

  const span = stock.upperLimit - stock.lowerLimit;
  const pct = (v: number) => clampPct(((v - stock.lowerLimit) / span) * 100);

  const curPos = pct(stock.price);

  const prevClose = stock.price - stock.changeAmount;
  const showPrev = valid(prevClose);
  const prevPos = pct(prevClose);

  const showBand = valid(stock.low) && valid(stock.high) && stock.high >= stock.low;
  const bandL = pct(stock.low);
  const bandR = pct(stock.high);

  // 현재가 태그 엣지 앵커링: 마커 dot 은 실제 위치 고정, 태그만 끝에서 잘리지 않게 정렬 전환
  const tagTransform =
    curPos > 88
      ? 'translateX(calc(-100% + 9px))'
      : curPos < 12
        ? 'translateX(-9px)'
        : 'translateX(-50%)';

  const dir =
    stock.changeRate > 0 ? 'up' : stock.changeRate < 0 ? 'down' : 'flat';
  const tagColor =
    dir === 'up'
      ? 'var(--up)'
      : dir === 'down'
        ? 'var(--down)'
        : 'var(--flat)';

  const dayStrip: StatCell[] = [
    { label: '시가', value: stock.open, format: 'price', nullAsEmDash: true },
    { label: '저가', value: stock.low, format: 'price', nullAsEmDash: true },
    { label: '고가', value: stock.high, format: 'price', nullAsEmDash: true },
  ];
  const tradeRow: StatCell[] = [
    { label: '거래량', value: stock.volume, format: 'volume', nullAsEmDash: false },
    {
      label: '거래대금',
      value: stock.tradeAmount,
      format: 'trade-amount',
      nullAsEmDash: false,
    },
    {
      label: '시가총액',
      value: stock.marketCap,
      format: 'marketCap',
      nullAsEmDash: true,
    },
  ];

  return (
    <Card data-testid="stock-stats-grid" className="p-6">
      <div className="text-[length:var(--t-caption)] font-bold tracking-wide text-[var(--muted-fg)] mb-8">
        가격 위치 — 하한가부터 상한가까지
      </div>

      {/* 스펙트럼 바 */}
      <div
        data-testid="price-spectrum"
        className="relative h-[14px] rounded-[7px]"
        style={{
          background:
            'linear-gradient(90deg, var(--down) 0%, var(--muted) 50%, var(--up) 100%)',
        }}
      >
        {/* 당일 저가~고가 음영 밴드 */}
        {showBand && (
          <div
            className="absolute top-0 bottom-0 rounded-[3px] bg-[var(--fg)] opacity-[0.14]"
            style={{ left: `${bandL}%`, width: `${Math.max(bandR - bandL, 0)}%` }}
          />
        )}

        {/* 전일종가 기준선 */}
        {showPrev && (
          <>
            <div
              className="absolute -top-[6px] -bottom-[6px] w-[2px] -translate-x-1/2 bg-[var(--muted-fg)]"
              style={{ left: `${prevPos}%` }}
            />
            <div
              className="absolute -bottom-[26px] -translate-x-1/2 whitespace-nowrap text-[11px] text-[var(--muted-fg)]"
              style={{ left: `${prevPos}%` }}
            >
              전일 <NumberDisplay value={prevClose} format="price" />
            </div>
          </>
        )}

        {/* 현재가 마커 dot */}
        <div
          className="absolute top-1/2 z-[2] h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--fg)] bg-[var(--card)]"
          style={{
            left: `${curPos}%`,
            boxShadow: '0 1px 4px oklch(0 0 0 / 0.3)',
          }}
        />

        {/* 현재가 태그 (엣지 앵커링) */}
        <div
          className="absolute -top-[40px] whitespace-nowrap rounded-[var(--r-sm)] px-2 py-[3px] text-[length:var(--t-caption)] font-bold mono"
          style={{
            left: `${curPos}%`,
            transform: tagTransform,
            background: tagColor,
            color: 'var(--bg)',
          }}
        >
          현재 <NumberDisplay value={stock.price} format="price" />
        </div>
      </div>

      {/* 상·하한가 끝 라벨 */}
      <div className="mt-6 flex items-baseline justify-between">
        <div>
          <span className="text-[11px] text-[var(--muted-fg)]">하한가 </span>
          <span className="text-[length:var(--t-sm)] font-semibold text-[var(--down)]">
            <NumberDisplay value={stock.lowerLimit} format="price" />
          </span>
        </div>
        <div className="text-right">
          <span className="text-[11px] text-[var(--muted-fg)]">상한가 </span>
          <span className="text-[length:var(--t-sm)] font-semibold text-[var(--up)]">
            <NumberDisplay value={stock.upperLimit} format="price" />
          </span>
        </div>
      </div>

      {/* 당일 strip: 시가 · 저가 · 고가 */}
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-[var(--border-subtle)] pt-4">
        {dayStrip.map((c) => (
          <div key={c.label}>
            <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)] mb-0.5">
              {c.label}
            </div>
            <div className="text-[length:var(--t-base)] font-bold">
              <StatValue cell={c} />
            </div>
          </div>
        ))}
      </div>

      {/* trade row: 거래량 · 거래대금 · 시가총액 */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--border-subtle)] pt-4">
        {tradeRow.map((c) => (
          <div key={c.label}>
            <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)] mb-0.5">
              {c.label}
            </div>
            <div className="text-[length:var(--t-base)] font-bold">
              <StatValue cell={c} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * 폴백 — 상·하한가 스케일이 무효(거래정지·결측 등)일 때.
 * 스펙트럼 바를 그릴 수 없으므로 8필드를 균등 카드 그리드로 표시한다.
 * em-dash 정책: 시가·고가·저가·시총·상한가·하한가 는 value<=0 시 `—`.
 */
function StatsGridFallback({ stock }: { stock: Stock }) {
  const cells: StatCell[] = [
    { label: '시가', value: stock.open, format: 'price', nullAsEmDash: true },
    { label: '고가', value: stock.high, format: 'price', nullAsEmDash: true },
    { label: '저가', value: stock.low, format: 'price', nullAsEmDash: true },
    { label: '거래량', value: stock.volume, format: 'volume', nullAsEmDash: false },
    {
      label: '거래대금',
      value: stock.tradeAmount,
      format: 'trade-amount',
      nullAsEmDash: false,
    },
    {
      label: '시가총액',
      value: stock.marketCap,
      format: 'marketCap',
      nullAsEmDash: true,
    },
    { label: '상한가', value: stock.upperLimit, format: 'price', nullAsEmDash: true },
    { label: '하한가', value: stock.lowerLimit, format: 'price', nullAsEmDash: true },
  ];

  return (
    <div
      data-testid="stock-stats-grid"
      className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6"
    >
      {cells.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="space-y-2">
            <div className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
              {c.label}
            </div>
            <div className="text-[length:var(--t-sm)] font-semibold">
              <StatValue cell={c} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
