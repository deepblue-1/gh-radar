import type { LimitupKpis } from '@/lib/limitup-report';

/**
 * KPI 띠 5칸 (UI-SPEC ④-2) — 페이지의 시각 앵커(유일한 20px `mono` 값).
 *
 * 값 정의는 gh-trade 보고서 `_section_b_grid` 그대로다(`kpisOf` · 같은 숫자 원칙). 폰(< md) 3열 2줄 · md 이상 5열.
 * 출처 배지는 달지 않는다(R-5 — `d1_ret` 는 실측). 값이 없는 칸만 「—」(E6 partial) · 탐지 0 인 날은 「0」.
 */
export function LimitupKpiStrip({ kpis }: { kpis: LimitupKpis }) {
  const tiles: { label: string; value: string; title?: string }[] = [
    { label: '탐지 종목', value: kpis.detected },
    { label: '잠김(3초↑)', value: kpis.locks },
    { label: '종가까지 유지', value: kpis.held },
    { label: '25%↑ 미도달', value: kpis.missed25 },
    { label: '어제 D+1', value: kpis.d1, title: kpis.d1Title ?? undefined },
  ];
  return (
    <dl data-slot="limitup-kpis" className="m-0 grid grid-cols-3 gap-2 md:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          data-kpi={t.label}
          title={t.title}
          className="flex min-w-0 flex-col-reverse rounded-[var(--r-md)] bg-[var(--card)] p-3"
        >
          <dt className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">{t.label}</dt>
          <dd className="mono m-0 truncate text-[20px] leading-[1.2] font-semibold text-[var(--fg)]">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
