import { type AccumKpis } from '@/lib/accum-report';
import { TONE_TEXT, fmtEok, toneOf } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 매집감지 KPI 띠 4칸 (Phase 34 · UI-SPEC A2 · D-09) — 페이지의 시각 앵커(유일한 20px `mono` 값).
 *
 * `teamflow-kpi-strip.tsx` 복제(일반화하지 않는다). 치수 불변 계약: 칸 `--card` · `--r-md` · `p-3` · 라벨 12/400 위 ·
 * 값 20/600 `mono` 줄높이 1.2 아래(`flex-col-reverse`) · 폰(< md) 2열 2줄 · md 이상 4열.
 * - 칸 = 「등록 종목」(보조 「이월 n」) · 「장 마감 보유」(보조 「매집중 a · 매도중 b」) · 「종료」(보조 「청산 a · 탈락 b · 만료 c」) ·
 *   「팀 순매수 합(등록 후)」(부호 + 억 1자리 · 부호 색 — 반올림 0 이면 「0.0억」 `--fg-2` · 합이 없으면(전부 null) 「—」 `--faint`).
 * - `dd` = `flex flex-wrap items-baseline gap-x-2` — 좁은 칸에서 보조 글자는 값 아래 줄로 내려간다(`truncate` 를 걸지 않는다).
 *   보조 글자는 0 이어도 지우지 않는다(날짜 간 칸 자리가 같아야 비교된다).
 * - 행이 있는 날에만 그린다(빈 날은 부모가 띠를 생략). KPI 아래 캡션은 없다(D-10).
 */

const INT_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const n = (v: number) => INT_FMT.format(v);

export function AccumKpiStrip({ kpis }: { kpis: AccumKpis }) {
  const tiles: { label: string; value: string; tone: string; sub: string | null }[] = [
    { label: '등록 종목', value: n(kpis.total), tone: 'text-[var(--fg)]', sub: `이월 ${n(kpis.carry)}` },
    {
      label: '장 마감 보유',
      value: n(kpis.held),
      tone: 'text-[var(--fg)]',
      sub: `매집중 ${n(kpis.accumulating)} · 매도중 ${n(kpis.selling)}`,
    },
    {
      label: '종료',
      value: n(kpis.ended),
      tone: 'text-[var(--fg)]',
      sub: `청산 ${n(kpis.liquidated)} · 탈락 ${n(kpis.dropped)} · 만료 ${n(kpis.expired)}`,
    },
    {
      label: '팀 순매수 합(등록 후)',
      value: kpis.posSum === null ? '—' : fmtEok(kpis.posSum, { signed: true }),
      tone: kpis.posSum === null ? 'text-[var(--faint)]' : TONE_TEXT[toneOf(kpis.posSum)],
      sub: null,
    },
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-2 md:grid-cols-4" data-slot="accum-kpis">
      {tiles.map((t) => (
        <div
          key={t.label}
          data-kpi={t.label}
          className="flex min-w-0 flex-col-reverse rounded-[var(--r-md)] bg-[var(--card)] p-3"
        >
          <dt className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">{t.label}</dt>
          <dd className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className={cn('mono text-[20px] leading-[1.2] font-semibold', t.tone)}>{t.value}</span>
            {t.sub !== null && (
              <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">{t.sub}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
