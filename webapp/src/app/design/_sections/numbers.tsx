/**
 * Numbers Section — UI-SPEC §5 + D-29 #6
 *
 * `<Number>` format 5종 × showSign/withColor 조합 표(12+ 샘플) + Stock 타입 mock 3건.
 */

import { Number } from '@/components/ui/number';
import type { Stock } from '@gh-radar/shared';

const SAMPLES: Array<{
  format: 'price' | 'percent' | 'volume' | 'marketCap' | 'plain';
  value: number;
  showSign?: boolean;
  withColor?: boolean;
  note: string;
}> = [
  { format: 'price', value: 58700, note: '기본 price — 가격' },
  { format: 'price', value: 1248000, note: 'price 대형 값' },
  { format: 'percent', value: 0.0325, showSign: true, withColor: true, note: 'percent · +양수 · 빨강' },
  { format: 'percent', value: -0.012, showSign: true, withColor: true, note: 'percent · -음수 · 파랑' },
  { format: 'percent', value: 0, showSign: true, withColor: true, note: 'percent · 0 · 회색' },
  { format: 'percent', value: 0.15, note: 'percent · sign/color 없음' },
  { format: 'volume', value: 1248300, note: 'volume · 소량' },
  { format: 'volume', value: 154_000_000, note: 'volume · 억 자동 축약' },
  { format: 'marketCap', value: 5.87e9, note: 'marketCap · 억원' },
  { format: 'marketCap', value: 3.504e14, note: 'marketCap · 조원' },
  { format: 'plain', value: 3504200, note: 'plain · 쉼표만' },
  { format: 'plain', value: -1234, note: 'plain · 음수 JS 기본' },
];

const STOCKS: Stock[] = [
  {
    code: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    price: 72400,
    changeAmount: 2280,
    changeRate: 0.0325,
    volume: 12_483_000,
    open: 70500,
    high: 72800,
    low: 70200,
    marketCap: 4.32e14,
    upperLimit: 91650,
    lowerLimit: 49350,
    updatedAt: '2026-04-13T14:32:08+09:00',
  },
  {
    code: '035720',
    name: '카카오',
    market: 'KOSPI',
    price: 47850,
    changeAmount: 470,
    changeRate: 0.0098,
    volume: 2_150_300,
    open: 47400,
    high: 48100,
    low: 47200,
    marketCap: 2.12e13,
    upperLimit: 61620,
    lowerLimit: 33180,
    updatedAt: '2026-04-13T14:32:08+09:00',
  },
  {
    code: '035420',
    name: '네이버',
    market: 'KOSPI',
    price: 212500,
    changeAmount: -2580,
    changeRate: -0.012,
    volume: 874_000,
    open: 215000,
    high: 215800,
    low: 211000,
    marketCap: 3.48e13,
    upperLimit: 279500,
    lowerLimit: 150500,
    updatedAt: '2026-04-13T14:32:08+09:00',
  },
];

export function NumbersSection() {
  return (
    <section className="space-y-6">
      <div>
        <h2 id="numbers" className="scroll-mt-20 text-[length:var(--t-h2)] font-bold">
          6. &lt;Number&gt; Component
        </h2>
        <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          UI-SPEC §5 계약. format 5종 × showSign / withColor 조합, locale `ko-KR` 고정, Geist Mono + tabular-nums.
        </p>
      </div>

      {/* Format 매트릭스 */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>format</th>
              <th>value</th>
              <th>showSign</th>
              <th>withColor</th>
              <th className="text-right">출력</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLES.map((s, i) => (
              <tr key={i}>
                <td className="mono">{s.format}</td>
                <td className="mono">{s.value}</td>
                <td className="mono">{s.showSign ? 'true' : '—'}</td>
                <td className="mono">{s.withColor ? 'true' : '—'}</td>
                <td className="num">
                  <Number
                    value={s.value}
                    format={s.format}
                    showSign={s.showSign}
                    withColor={s.withColor}
                  />
                </td>
                <td className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{s.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stock mock 3건 */}
      <div className="space-y-3">
        <h3 className="text-[length:var(--t-h4)] font-semibold">Stock 타입 mock · 3 종목</h3>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>종목</th>
                <th className="text-right">가격</th>
                <th className="text-right">등락률</th>
                <th className="text-right">거래량</th>
                <th className="text-right">시가총액</th>
              </tr>
            </thead>
            <tbody>
              {STOCKS.map((s) => (
                <tr key={s.code}>
                  <td>
                    <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                      {s.code}
                    </span>{' '}
                    {s.name}
                  </td>
                  <td className="num">
                    <Number value={s.price} format="price" />
                  </td>
                  <td className="num">
                    <Number value={s.changeRate} format="percent" showSign withColor />
                  </td>
                  <td className="num">
                    <Number value={s.volume} format="volume" />
                  </td>
                  <td className="num">
                    <Number value={s.marketCap} format="marketCap" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
