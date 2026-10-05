'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type {
  LimitupDate,
  LimitupEntryRow,
  LimitupFactRow,
  LimitupMarkRow,
  LimitupReportResponse,
} from '@gh-radar/shared';

import { PageHeader } from '@/components/layout/page-header';
import { CARD } from '@/components/layout/page-layout';
import { DmaGate, useDmaGateReason, type DmaGateReason } from '@/components/trading/dma-gate';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';
import { fetchLimitupReport } from '@/lib/limitup-api';
import {
  dateNavOf,
  dayRowsOf,
  excludedCaptionOf,
  fmtYmdShort,
  kpisOf,
  parseYmdParam,
} from '@/lib/limitup-report';
import { cn } from '@/lib/utils';

import { LimitupDateNav } from './limitup-date-nav';
import { LimitupDayGrid, rowButtonId } from './limitup-day-grid';
import { LimitupEventCard } from './limitup-event-card';
import { LimitupFingerprintTable } from './limitup-fingerprint-table';
import { LimitupKpiStrip } from './limitup-kpi-strip';
import { LimitupYesterdayTable } from './limitup-yesterday-table';

/**
 * 상한가 보고서 본문 (Phase 28 Plan 12 · 13 · UI-SPEC ④-0 ~ ④-6 · D-10 · D-11).
 *
 * 세로 순서(gh-trade D-20 · quick-261005-vk1 D-02/D-03): 머리 → KPI → (제외 한 줄) → 종목 리스트(행 아래 펼침 — 사건 카드는
 *   열린 행 하나에만) → 창구 지문표 → 어제 결과. 제외 한 줄 = 상한가에 닿지 않은 종목이 있을 때만(`excludedCaptionOf`).
 *
 * ① URL 정본 = `?d=YYYYMMDD`. 쿼리 없음 = 최신 적재 날짜(URL 을 쓰지 않는다 — server 가 최신을 정한다).
 *   형식 오류 → `router.replace("/analytics/limitup")` 로 정본화(최신). 날짜 이동은 `router.push`(히스토리에 남는다 — 재량 행사).
 * ② 게이트: `useDmaGateReason()` 이 사유를 내거나 server 가 401/403(`DMA_UNMAPPED`)이면 본문 대신 `DmaGate` 만 그린다.
 *   웹 게이트는 표시 장치일 뿐 — 실제 권한은 server + RPC(28-10)다.
 * ③ 머리(제목 + 날짜 알약)는 로딩 · 에러 중에도 그린다. 알약 글자는 `?d` 에서 즉시(E5) · ‹ › 는 마지막으로 받은
 *   적재 날짜 목록으로 판정한다(날짜를 오가는 동안 화살표가 꺼졌다 켜지지 않게).
 * ④ 상태: 로딩 = 「불러오는 중…」 한 줄(스켈레톤 없음) · 에러 = 「보고서를 불러오지 못했어요」 + 「다시 시도」 ·
 *   적재 이력 0 · 없는 날짜 · 탐지 0 은 각 빈 상태(UI-SPEC Copywriting).
 */

type Ready = Exclude<LimitupReportResponse, { access: false }>;
type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'gate'; reason: DmaGateReason }
  | { kind: 'ready'; resp: Ready };

const BASE = '/analytics/limitup';

export function LimitupReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('d');
  const d = parseYmdParam(raw);
  const invalid = raw !== null && d === null;
  const gate = useDmaGateReason();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dates, setDates] = useState<readonly LimitupDate[]>([]);

  // ① 형식 오류 → 최신으로 정본화.
  useEffect(() => {
    if (invalid) router.replace(BASE);
  }, [invalid, router]);

  useEffect(() => {
    if (gate !== null) return;
    let alive = true;
    setPhase({ kind: 'loading' });
    fetchLimitupReport(d ?? undefined).then(
      (resp) => {
        if (!alive) return;
        if (!resp.access) {
          setPhase({ kind: 'gate', reason: 'unmapped' });
          return;
        }
        setDates(resp.dates);
        setPhase({ kind: 'ready', resp });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setPhase({ kind: 'gate', reason: err.status === 401 ? 'unauthenticated' : 'unmapped' });
          return;
        }
        setPhase({ kind: 'error' });
      },
    );
    return () => {
      alive = false;
    };
  }, [d, attempt, gate]);

  const resp = phase.kind === 'ready' ? phase.resp : null;
  const shown: LimitupDate | null = d ?? resp?.date ?? null;

  useEffect(() => {
    document.title = shown === null ? '상한가 보고서' : `상한가 보고서 · ${fmtYmdShort(shown)}`;
  }, [shown]);

  const nav = dateNavOf(dates, shown);
  const go = (to: LimitupDate) => router.push(`${BASE}?d=${to}`);

  const loaded = resp !== null && resp.loaded ? resp : null;
  const kpis = useMemo(() => (loaded ? kpisOf(loaded) : null), [loaded]);
  const rows = useMemo(() => (loaded ? dayRowsOf(loaded) : null), [loaded]);
  const excluded = useMemo(() => (loaded ? excludedCaptionOf(loaded) : null), [loaded]);
  const byIsin = useMemo(() => (loaded ? groupDay(loaded.day) : null), [loaded]);

  const gateReason = gate ?? (phase.kind === 'gate' ? phase.reason : null);
  if (gateReason !== null) {
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
        <DmaGate reason={gateReason} surface="상한가 보고서" />
      </div>
    );
  }

  return (
    <div data-slot="limitup-report" className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
      <PageHeader
        title="상한가 보고서"
        description="평일 밤 21:20쯤 그날 보고서가 올라와요"
        actions={<LimitupDateNav date={shown} prev={nav.prev} next={nav.next} onGo={go} />}
      />

      {phase.kind === 'loading' && (
        <p className="text-[length:var(--t-caption)] text-[var(--faint)]">불러오는 중…</p>
      )}

      {phase.kind === 'error' && (
        <div role="alert" className={cn(CARD, 'flex flex-col items-center gap-2 px-4 py-12 text-center')}>
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">보고서를 불러오지 못했어요</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {resp !== null && resp.dates.length === 0 && (
        <EmptyBox title="아직 올라온 보고서가 없어요" body="첫 보고서는 평일 밤 21:20쯤 올라와요" />
      )}

      {resp !== null && resp.dates.length > 0 && !resp.loaded && (
        <EmptyBox
          title="이 날 보고서가 아직 없어요"
          body={`보고서는 평일 밤 21:20쯤 올라와요. 최신 보고서는 ${fmtYmdShort(resp.dates[0]!)}예요`}
        >
          <Button className="mt-2" onClick={() => go(resp.dates[0]!)}>
            최신 보고서 보기
          </Button>
        </EmptyBox>
      )}

      {kpis !== null && rows !== null && (
        <>
          <LimitupKpiStrip kpis={kpis} />
          {excluded !== null && (
            <p
              data-slot="limitup-excluded"
              className="-mt-2 text-[length:var(--t-caption)] break-keep text-[var(--muted-fg)]"
            >
              {excluded}
            </p>
          )}
          <LimitupDayGrid
            key={loaded?.date ?? ''}
            rows={rows}
            renderDetail={(r) =>
              loaded !== null && byIsin !== null ? (
                <LimitupEventCard
                  date={loaded.date}
                  row={r}
                  labelledBy={rowButtonId(r.isin)}
                  entry={byIsin.entries.get(r.isin) ?? null}
                  facts={byIsin.facts.get(r.isin) ?? NONE_FACTS}
                  marks={byIsin.marks.get(r.isin) ?? NONE_MARKS}
                />
              ) : null
            }
          />
          {loaded !== null && <LimitupFingerprintTable rows={loaded.fingerprint} />}
          {loaded !== null && <LimitupYesterdayTable prev={loaded.prev} />}
        </>
      )}
    </div>
  );
}

const NONE_FACTS: LimitupFactRow[] = [];
const NONE_MARKS: LimitupMarkRow[] = [];

/** 하루 묶음을 종목별로 — 사건 카드 입력(entries 1행 · facts · 레인 2 마커). */
function groupDay(day: { entries: LimitupEntryRow[]; facts: LimitupFactRow[]; marks: LimitupMarkRow[] }) {
  const push = <T,>(m: Map<string, T[]>, k: string, v: T) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  const facts = new Map<string, LimitupFactRow[]>();
  for (const f of day.facts) push(facts, f.isin, f);
  const marks = new Map<string, LimitupMarkRow[]>();
  for (const m of day.marks) push(marks, m.isin, m);
  return { entries: new Map(day.entries.map((e) => [e.isin, e])), facts, marks };
}

function EmptyBox({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div
      data-slot="limitup-empty"
      className={cn(CARD, 'flex flex-col items-center gap-1 px-4 py-12 text-center')}
    >
      <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">{title}</p>
      <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{body}</p>
      {children}
    </div>
  );
}
