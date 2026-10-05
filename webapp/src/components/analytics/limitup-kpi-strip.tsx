import type { LimitupKpis } from '@/lib/limitup-report';

/**
 * KPI 띠 4칸 (UI-SPEC ④-2 · quick-261005-vk1 D-02) — 페이지의 시각 앵커(유일한 20px `mono` 값).
 *
 * 상한가 도달 · 종가까지 유지 · 깨짐 · 어제 D+1. 값 정의는 `kpisOf`(목록 = 첫 상한가 체결이 있는 종목 · 유지 = 결과 태그에
 * 「유지」 · 깨짐 = 태그가 「깨짐」 하나뿐 · D+1 = 이전 적재 날짜 중앙값). 폰(< md) 2열 2줄 · md 이상 4열.
 * 출처 배지는 달지 않는다(R-5 — `d1_ret` 는 실측). 값이 없는 칸만 「—」(E6 partial) · 목록 0 인 날은 「0」.
 */
export function LimitupKpiStrip({ kpis }: { kpis: LimitupKpis }) {
  const tiles: { label: string; value: string; title?: string }[] = [
    { label: '상한가 도달', value: kpis.reached },
    { label: '종가까지 유지', value: kpis.held },
    { label: '깨짐', value: kpis.broke },
    { label: '어제 D+1', value: kpis.d1, title: kpis.d1Title ?? undefined },
  ];
  return (
    <dl data-slot="limitup-kpis" className="m-0 grid grid-cols-2 gap-2 md:grid-cols-4">
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
