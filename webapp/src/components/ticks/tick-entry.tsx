'use client';

import { useMemo } from 'react';

import { estimateTeamDayPnl, type TickExchange, type TickGridRow, type TickGridSource, type TickTodayRow } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { fmtRate, fmtSignedAmountC } from '@/lib/ticks/tick-format';
import { cn } from '@/lib/utils';

/**
 * 틱 전문 뷰어 진입 · 빈 상태 목록 (Phase 37 D-15 · D-16 · 진입 목업 A `.panel` + `table.lst`).
 *
 * - 과거 날짜: 「{M/D} 격자 종목 · n종목」 — 그날 격자가 있는 (종목, 거래소) 행. 클릭하면 바로 열린다(변환 없음).
 * - 오늘(D-15): 「오늘 종목 · n종목」 — 오늘 매집감지 등록 ∪ 고가 +15% 종목(`/api/ticks/today`) · 「라이브」 칩.
 * - 열 순서(quick 261104-n9h): 종목 · 등락률 · 시가 · 고가 · 당일순매수 · 누적순매수 · 당일손익 · 출처 · ›.
 * - 등락률 = 과거 그날 종가(마지막 체결 `last_rate`) · 오늘 현재가(`rate`) 기준 — 기준가 대비 %.
 * - 시가 · 고가(기준가 대비 % · 등락률과 같은 부호 색): 과거 = `open_rate`(KRX 일봉 시가 · NXT 「—」) · `high_rate`(격자) /
 *   오늘 = 시세 OHLC 가 오늘 갱신된 종목만(hot set · 아니면 「—」). 카드 폭 컨테이너 쿼리(`@container/tlist`)로 카드가
 *   T_OH = 800px 미만이면 두 열을 숨기고 등락률 칸 아래 작은 두 줄 「시 … / 고 …」 로 남긴다 — 사이드바가 lg 에서 생겨 뷰포트 폭과
 *   카드 폭이 단조롭지 않아서 뷰포트가 아니라 카드 폭으로 정한다(T_OH 측정 근거 = quick 261104-n9h SUMMARY 「폭 측정」).
 * - 팀 열(스케치 023 B · quick 261103-j4d): 「당일순매수 · 누적순매수 · 당일손익」 3열(sm 이상) · 폰은 열을 숨기고
 *   종목명 아래 「순매수 … · 누적 … · 손익 …」 한 줄.
 *   과거 = 상세 「팀 거래정보」 끝 틱(그 거래소 팀만 · 밤 변환 때 저장) · 누적 = 매집감지 등록 이후 팀 순매수(이월 포함 ·
 *   KRX+NXT 합산 · 미등록 「—」).
 *   오늘(quick 261104-n9h) = 매집감지 kind 16 isin 별 최신 행(1분 갱신 · KRX+NXT 합산 · 우리 체결 제외) — 당일손익은
 *   estimateTeamDayPnl 추정치라 앞에 「≈」. 매집감지 미등록 · 옛 행 · 가시성 밖은 「—」.
 *   모름(미계산 · 팀 체결 없음 · 옛 RPC 키 없음) 「—」 · 0 「0」 · + 빨강 / − 파랑 / 0 · 모름 muted.
 * - 정렬: 기본 등락률순(위 등락률 — 과거 종가 · 오늘 현재가 내림차순) · 순매수순 · 손익순(내림차순 · 오늘은 추정값) · 이름순 —
 *   값 없는 행은 뒤 · 같으면 이름 → 거래소.
 * - 출처 칩: accum 「매집감지」(팀 보라) · up15 「15%↑」(빨강) · request 「요청 변환」 · promoted 「승격」(회색) ·
 *   거래소 NXT 「NXT」(선택 파랑).
 * - 아래 캡션(과거 날짜만): 목록에 없는 종목은 머리 검색으로 — 그 종목만 변환해서 연다(약 N분 = 거래소 예상 대기).
 */

export type TickEntrySort = 'rate' | 'net' | 'pnl' | 'name';

export interface TickEntryProps {
  /** 목록 날짜(`YYYYMMDD`) — 패널 머리 「M/D」. */
  date: string;
  rows: readonly TickGridRow[];
  /** 주면 오늘 목록(라이브)으로 그린다 — rows 는 무시. */
  todayRows?: readonly TickTodayRow[];
  sort: TickEntrySort;
  onSort: (s: TickEntrySort) => void;
  onOpen: (isin: string, ex: TickExchange) => void;
  /** 요청 변환 예상 소요(분) — 캡션 「약 N분」. */
  etaMin: number;
}

interface EntryRow {
  key: string;
  isin: string;
  code: string | null;
  name: string | null;
  ex: TickExchange;
  /** 등락률 % — 과거 종가(last_rate) · 오늘 현재가(rate). */
  rate: number | null;
  /** 시가 · 고가 % (기준가 대비) — 모름 null. */
  openRate: number | null;
  highRate: number | null;
  /** 당일 팀 순매수 · 누적 순매수 · 당일 팀 손익(원) — 모름 null. */
  dayNet: number | null;
  cum: number | null;
  pnl: number | null;
  /** 손익이 추정치(오늘 행 — estimateTeamDayPnl)면 true → 값 앞에 「≈」. */
  pnlEstimated: boolean;
  sources: readonly TickGridSource[];
  live: boolean;
}

const SOURCE_CHIP: Record<TickGridSource, { label: string; cls: string }> = {
  accum: { label: '매집감지', cls: 'bg-[var(--team-bg)] text-[var(--team)]' },
  up15: { label: '15%↑', cls: 'bg-[var(--up-bg)] text-[var(--up)]' },
  request: { label: '요청 변환', cls: 'bg-[var(--muted)] text-[var(--muted-fg)]' },
  promoted: { label: '승격', cls: 'bg-[var(--muted)] text-[var(--muted-fg)]' },
};

const TAG = 'mr-1 inline-flex h-[18px] items-center rounded-[5px] px-1.5 text-[10px] font-bold whitespace-nowrap';

const COLLATOR = new Intl.Collator('ko-KR');

/** 값 정렬 키 → 값(내림차순 · null 뒤). 이름순은 값 없이 이름 → 거래소. */
const SORT_VALUE: Record<Exclude<TickEntrySort, 'name'>, (r: EntryRow) => number | null> = {
  rate: (r) => r.rate,
  net: (r) => r.dayNet,
  pnl: (r) => r.pnl,
};

const SORT_LABELS: readonly (readonly [TickEntrySort, string])[] = [
  ['rate', '등락률순'],
  ['net', '순매수순'],
  ['pnl', '손익순'],
  ['name', '이름순'],
];

function sortRows(rows: EntryRow[], sort: TickEntrySort): EntryRow[] {
  const nameOf = (r: EntryRow) => r.name ?? r.code ?? r.isin;
  const valueOf = sort === 'name' ? null : SORT_VALUE[sort];
  return [...rows].sort((a, b) => {
    if (valueOf !== null) {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === null && vb !== null) return 1;
      if (vb === null && va !== null) return -1;
      if (va !== null && vb !== null && va !== vb) return vb - va;
    }
    return COLLATOR.compare(nameOf(a), nameOf(b)) || a.ex.localeCompare(b.ex);
  });
}

/** 부호 색 — 양 --up · 음 --down · 0 · 모름 --muted-fg(등락률 칸 · 팀 칸 공통). */
function signCls(v: number | null): string {
  if (v === null || v === 0) return 'text-[var(--muted-fg)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}

/** 숫자 · 출처 칸 좌우 패딩 — 카드 폭 T_OH 미만은 px-2(오늘 목록 640 에서 › 칸이 눌리던 8px 를 푼다) · 이상은 px-3. */
const PADX = 'px-2 @min-[800px]/tlist:px-3';
const TH = 'bg-[var(--muted)] py-1.5 text-[10.5px] font-semibold whitespace-nowrap text-[var(--muted-fg)]';
const TEAM_TD = cn(
  'hidden h-10 border-t border-[var(--border-subtle)] text-right whitespace-nowrap tabular-nums sm:table-cell',
  PADX,
);
/** 시가 · 고가 열 — 카드 폭(@container/tlist) T_OH 이상에서만 · 그 미만은 등락률 칸 보조 두 줄(OH_LINE). */
const OH_COL = 'hidden @min-[800px]/tlist:table-cell';
const OH_LINE = 'mt-0.5 block text-[10.5px] leading-[1.3] font-medium @min-[800px]/tlist:hidden';
const OH_TD = cn(OH_COL, 'h-10 border-t border-[var(--border-subtle)] px-3 text-right whitespace-nowrap tabular-nums');

/** 등락률 · 시가 · 고가 툴팁 — 과거 = 종가 · 일봉 · 격자 / 오늘 = 현재가 · 오늘 시세. */
const RATE_TITLE = {
  past: {
    rate: '그날 종가(마지막 체결) 기준 · 기준가 대비',
    open: '그날 시가(KRX 일봉 · NXT 는 —) — 기준가 대비',
    high: '그날 고가 — 기준가 대비',
  },
  today: {
    rate: '현재가 기준 · 기준가 대비',
    open: '오늘 시가 · 기준가 대비 — 시세 갱신 종목만(아니면 —)',
    high: '오늘 고가 · 기준가 대비 — 시세 갱신 종목만(아니면 —)',
  },
} as const;

/** 손익 표기 — 추정치(오늘)는 값 앞에 「≈」 · 모름은 「—」 그대로. */
const pnlText = (r: EntryRow) => (r.pnlEstimated && r.pnl !== null ? '≈' : '') + fmtSignedAmountC(r.pnl);

/** 팀 3칸 툴팁 — 과거 = 격자 끝 틱 · 오늘 = 매집감지 kind 16 실시간(정의가 달라 문구로 밝힌다). */
const TEAM_TITLE = {
  past: {
    net: '팀 당일 순매수 — 그 거래소 팀만 · 상세 팀 거래정보 끝 틱 값',
    cum: '매집감지 등록 이후 팀 순매수(이월 포함 · KRX+NXT 합산)',
    pnl: '팀 당일 손익(실현+미실현) — 끝 틱 기준',
  },
  today: {
    net: '팀 당일 순매수 — 매집감지 실시간(1분) · KRX+NXT 합산 · 우리 체결 제외',
    cum: '매집감지 등록 이후 팀 순매수(이월 포함) — 매집감지 실시간 · KRX+NXT 합산 · 우리 체결 제외',
    pnl: '추정 — 매집감지 당일 매수·매도·평단 + 현재가 · KRX+NXT 합산 · 우리 체결 제외 · 장 마감 뒤 격자 값과 다를 수 있음',
  },
} as const;

const mdOf = (ymd: string) => `${Number(ymd.slice(4, 6))}/${Number(ymd.slice(6, 8))}`;

export function TickEntry({ date, rows, todayRows, sort, onSort, onOpen, etaMin }: TickEntryProps) {
  const isToday = todayRows !== undefined;
  const teamTitle = isToday ? TEAM_TITLE.today : TEAM_TITLE.past;
  const rateTitle = isToday ? RATE_TITLE.today : RATE_TITLE.past;
  const list = useMemo(() => {
    const base: EntryRow[] = isToday
      ? todayRows.map((r) => ({
          key: `${r.isin}:KRX`,
          isin: r.isin,
          code: r.code,
          name: r.name,
          ex: 'KRX' as const,
          rate: r.rate,
          openRate: r.open_rate ?? null,
          highRate: r.high_rate,
          dayNet: r.team_day_net_krw ?? null,
          cum: r.accum_pos_net_krw ?? null,
          pnl: estimateTeamDayPnl({
            buyKrw: r.team_day_buy_krw,
            sellKrw: r.team_day_sell_krw,
            avgPx: r.team_day_avg_px,
            netQty: r.team_day_net_qty,
            lastPx: r.accum_last_px,
          }),
          pnlEstimated: true,
          sources: r.sources,
          live: true,
        }))
      : rows.map((r) => ({
          key: `${r.isin}:${r.exchange}`,
          isin: r.isin,
          code: r.code,
          name: r.name,
          ex: r.exchange,
          rate: r.last_rate,
          openRate: r.open_rate ?? null,
          highRate: r.high_rate,
          dayNet: r.team_day_net_krw ?? null,
          cum: r.accum_pos_net_krw ?? null,
          pnl: r.team_day_pnl_krw ?? null,
          pnlEstimated: false,
          sources: r.sources,
          live: false,
        }));
    return sortRows(base, sort);
  }, [isToday, todayRows, rows, sort]);

  return (
    <div data-slot="tick-entry" className="flex flex-col">
      <section aria-labelledby="tick-entry-title" className={cn(CARD, '@container/tlist overflow-hidden rounded-[14px]')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3.5 py-2.5 text-[12.5px] font-bold">
          <h2 id="tick-entry-title" className="m-0 text-[12.5px] font-bold text-[var(--fg)]">
            {isToday ? '오늘 종목' : `${mdOf(date)} 격자 종목`}
          </h2>
          <small className="text-[11px] font-medium text-[var(--muted-fg)]">
            {list.length}종목 · {isToday ? '매집감지 등록 + 15%↑ · 라이브' : '매집감지 등록 + 15%↑ 자동 · 요청 변환분'}
          </small>
          <div role="group" aria-label="정렬" className="ml-auto inline-flex rounded-full bg-[var(--muted)] p-0.5">
            {SORT_LABELS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                onClick={() => sort !== k && onSort(k)}
                className={cn(
                  'rounded-full px-2.5 py-[3px] text-[11px] font-semibold',
                  sort === k ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <p data-slot="tick-entry-empty" className="m-0 px-4 py-10 text-center text-[12.5px] text-[var(--muted-fg)]">
            {isToday ? '오늘 아직 목록에 오른 종목이 없어요' : '이 날짜 격자 종목이 없어요'}
          </p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className={cn(TH, 'px-3 text-left')}>종목</th>
                <th className={cn(TH, PADX, 'text-right')}>등락률</th>
                <th className={cn(TH, 'px-3', OH_COL, 'text-right')}>시가</th>
                <th className={cn(TH, 'px-3', OH_COL, 'text-right')}>고가</th>
                <th className={cn(TH, PADX, 'hidden text-right sm:table-cell')}>당일순매수</th>
                <th className={cn(TH, PADX, 'hidden text-right sm:table-cell')}>누적순매수</th>
                <th className={cn(TH, PADX, 'hidden text-right sm:table-cell')}>당일손익</th>
                <th className={cn(TH, PADX, 'hidden text-left sm:table-cell')}>출처</th>
                <th className="w-6 bg-[var(--muted)]" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr
                  key={r.key}
                  data-slot="tick-entry-row"
                  data-isin={r.isin}
                  data-ex={r.ex}
                  onClick={() => onOpen(r.isin, r.ex)}
                  className="cursor-pointer hover:bg-[color-mix(in_oklab,var(--muted)_70%,transparent)]"
                >
                  <td className="h-10 border-t border-[var(--border-subtle)] px-3 whitespace-nowrap">
                    <button type="button" className="text-left" aria-label={`${r.name ?? r.code ?? r.isin} ${r.ex} 열기`}>
                      <b className="font-semibold text-[var(--fg)]">{r.name ?? r.code ?? r.isin}</b>
                      <small className="block text-[11px] text-[var(--muted-fg)] sm:ml-1.5 sm:inline">
                        {r.code ?? r.isin} · {r.ex}
                      </small>
                      <span
                        data-slot="tick-entry-team-line"
                        className="mt-0.5 block text-[11px] text-[var(--muted-fg)] tabular-nums sm:hidden"
                      >
                        순매수 <b className={cn('font-bold', signCls(r.dayNet))}>{fmtSignedAmountC(r.dayNet)}</b> · 누적{' '}
                        <span className={signCls(r.cum)}>{fmtSignedAmountC(r.cum)}</span> · 손익{' '}
                        <b className={cn('font-bold', signCls(r.pnl))}>{pnlText(r)}</b>
                      </span>
                    </button>
                  </td>
                  <td
                    data-slot="tick-entry-rate"
                    title={rateTitle.rate}
                    className={cn('h-10 border-t border-[var(--border-subtle)] text-right whitespace-nowrap tabular-nums', PADX)}
                  >
                    <b className={cn('font-bold', signCls(r.rate))}>{fmtRate(r.rate)}</b>
                    <span data-slot="tick-entry-oh-line" className={OH_LINE}>
                      <span className="block">
                        <span className="text-[var(--muted-fg)]">시</span>{' '}
                        <span className={signCls(r.openRate)}>{fmtRate(r.openRate)}</span>
                      </span>
                      <span className="block">
                        <span className="text-[var(--muted-fg)]">고</span>{' '}
                        <span className={signCls(r.highRate)}>{fmtRate(r.highRate)}</span>
                      </span>
                    </span>
                  </td>
                  <td data-slot="tick-entry-open" title={rateTitle.open} className={cn(OH_TD, signCls(r.openRate))}>
                    {fmtRate(r.openRate)}
                  </td>
                  <td data-slot="tick-entry-high" title={rateTitle.high} className={cn(OH_TD, signCls(r.highRate))}>
                    {fmtRate(r.highRate)}
                  </td>
                  <td
                    data-slot="tick-entry-day-net"
                    title={teamTitle.net}
                    className={cn(TEAM_TD, 'font-bold', signCls(r.dayNet))}
                  >
                    {fmtSignedAmountC(r.dayNet)}
                  </td>
                  <td
                    data-slot="tick-entry-cum"
                    title={teamTitle.cum}
                    className={cn(TEAM_TD, signCls(r.cum))}
                  >
                    {fmtSignedAmountC(r.cum)}
                  </td>
                  <td
                    data-slot="tick-entry-pnl"
                    title={teamTitle.pnl}
                    className={cn(TEAM_TD, 'font-bold', signCls(r.pnl))}
                  >
                    {pnlText(r)}
                  </td>
                  <td className={cn('hidden h-10 border-t border-[var(--border-subtle)] whitespace-nowrap sm:table-cell', PADX)}>
                    {r.sources.map((s) => (
                      <span key={s} data-chip={s} className={cn(TAG, SOURCE_CHIP[s].cls)}>
                        {SOURCE_CHIP[s].label}
                      </span>
                    ))}
                    {r.ex === 'NXT' && (
                      <span data-chip="nxt" className={cn(TAG, 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]')}>
                        NXT
                      </span>
                    )}
                    {r.live && (
                      <span data-chip="live" className={cn(TAG, 'bg-[var(--up-bg)] text-[var(--up)]')}>
                        라이브
                      </span>
                    )}
                  </td>
                  <td
                    aria-hidden="true"
                    className="h-10 w-6 border-t border-[var(--border-subtle)] pr-3 text-right text-[var(--faint)]"
                  >
                    ›
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {!isToday && (
        <p data-slot="tick-entry-caption" className="m-0 px-0.5 pt-2.5 text-[11px] text-[var(--faint)]">
          목록에 없는 종목은 위 검색으로 — 그 종목만 변환해서 열어요(약 {etaMin}분)
        </p>
      )}
    </div>
  );
}
