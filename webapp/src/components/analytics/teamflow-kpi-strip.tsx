import { fmtEok, toneOf, type TeamflowKpis, type TeamflowTone } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 팀 매집 KPI 띠 4칸 (Phase 33 · UI-SPEC T2 · D-11) — 페이지의 시각 앵커(유일한 20px `mono` 값).
 *
 * `limitup-kpi-strip.tsx` 복제(일반화하지 않는다 — RESEARCH 「복제 권장」). 치수 불변 계약: 타일 `p-3` · `--r-md` · 값 20/600
 * `mono` 줄높이 1.2 · 라벨 12/400 위 · 값 아래(`flex-col-reverse`) · 폰(< md) 2열 2줄 · md 이상 4열.
 * 탐지 종목 · 팀 순매수 종목 · 상한가 도달(정수 · ko-KR 쉼표 · `--fg`) · 팀 순매수 합(부호 + 억 1자리 · 부호 색 —
 * 반올림 0 이면 「0.0억」 `--fg`). 행이 있는 날에만 그린다(빈 날은 부모가 띠를 생략).
 */

const INT_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

const SUM_TONE: Record<TeamflowTone, string> = {
  up: 'text-[var(--up)]',
  down: 'text-[var(--down)]',
  flat: 'text-[var(--fg)]',
};

export function TeamflowKpiStrip({ kpis }: { kpis: TeamflowKpis }) {
  const tiles: { label: string; value: string; tone: string }[] = [
    { label: '탐지 종목', value: INT_FMT.format(kpis.detected), tone: SUM_TONE.flat },
    { label: '팀 순매수 종목', value: INT_FMT.format(kpis.netPositive), tone: SUM_TONE.flat },
    { label: '상한가 도달', value: INT_FMT.format(kpis.limit), tone: SUM_TONE.flat },
    { label: '팀 순매수 합', value: fmtEok(kpis.netSum, { signed: true }), tone: SUM_TONE[toneOf(kpis.netSum)] },
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-2 md:grid-cols-4" data-slot="teamflow-kpis">
      {tiles.map((t) => (
        <div
          key={t.label}
          data-kpi={t.label}
          className="flex min-w-0 flex-col-reverse rounded-[var(--r-md)] bg-[var(--card)] p-3"
        >
          <dt className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">{t.label}</dt>
          <dd className={cn('mono m-0 truncate text-[20px] leading-[1.2] font-semibold', t.tone)}>{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
