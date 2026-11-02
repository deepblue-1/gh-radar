'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import type { TickDayResponse, TickExchange, TickOpenResponse } from '@gh-radar/shared';

import { CARD } from '@/components/layout/page-layout';
import { DmaGate, useDmaGateReason, type DmaGateReason } from '@/components/trading/dma-gate';
import { ApiClientError } from '@/lib/api';
import { dateNavOf } from '@/lib/limitup-report';
import { fetchTickDay, fetchTickOpen } from '@/lib/ticks/tick-api';
import { fmtBytes, fmtQty } from '@/lib/ticks/tick-format';
import { parseTickUrl, tickUrlOf } from '@/lib/ticks/tick-url';
import { cn } from '@/lib/utils';

import { TickEntry, type TickEntrySort } from './tick-entry';
import { TickHeader } from './tick-header';

/**
 * 틱 전문 뷰어 페이지 본문 (Phase 37 D-03 · D-08 · D-15 · D-16 · D-18).
 *
 * ① URL 정본 = `?isin&d&ex&t`(`parseTickUrl` — 잘못된 값은 기본값). 종목 고르기 · 날짜 · 거래소 이동 = `router.push`
 *   (뒤로 = 목록). 틱 이동 `replaceState` 는 37-10.
 * ② 게이트: `useDmaGateReason()` · server 401/403 → 본문 대신 `DmaGate surface="틱 전문 뷰어"` 만. 표시 장치일 뿐 권한은
 *   server RPC(`tick_*_for_user`)다.
 * ③ isin 없음 = 진입(그날 격자 목록) · isin 있음 = 열기(`/api/ticks/open` → 격자면 머리 + 본문 자리).
 */

type Phase<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; resp: T };

/** 401 · 403 → 게이트 사유(그 밖 null). */
function gateOf(err: unknown): DmaGateReason | null {
  if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
    return err.status === 401 ? 'unauthenticated' : 'unmapped';
  }
  return null;
}

const etaMinOf = (s: number | undefined) => Math.max(1, Math.ceil((s ?? 0) / 60));

export function TickViewerPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const url = useMemo(() => parseTickUrl(new URLSearchParams(sp.toString())), [sp]);
  const { isin, d, ex } = url;
  const gate = useDmaGateReason();

  const [serverGate, setServerGate] = useState<DmaGateReason | null>(null);
  const [day, setDay] = useState<Phase<TickDayResponse>>({ kind: 'loading' });
  const [open, setOpen] = useState<Phase<TickOpenResponse> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<TickEntrySort>('rate');

  const onFail = (err: unknown, set: () => void) => {
    const g = gateOf(err);
    if (g !== null) setServerGate(g);
    else set();
  };

  // 날짜 목록 · 그날 격자 — 진입 목록 · 날짜 알약 · 예상 대기의 원천.
  useEffect(() => {
    if (gate !== null) return;
    let alive = true;
    setDay({ kind: 'loading' });
    fetchTickDay(d ?? undefined).then(
      (resp) => alive && setDay({ kind: 'ready', resp }),
      (err: unknown) => alive && onFail(err, () => setDay({ kind: 'error' })),
    );
    return () => {
      alive = false;
    };
  }, [d, gate, attempt]);

  const dayResp = day.kind === 'ready' ? day.resp : null;
  const shown = d ?? dayResp?.date ?? null;

  // 한 종목 열기.
  useEffect(() => {
    if (gate !== null || isin === null || shown === null) {
      setOpen(null);
      return;
    }
    let alive = true;
    setOpen({ kind: 'loading' });
    fetchTickOpen({ isin, d: shown, ex }).then(
      (resp) => alive && setOpen({ kind: 'ready', resp }),
      (err: unknown) => alive && onFail(err, () => setOpen({ kind: 'error' })),
    );
    return () => {
      alive = false;
    };
  }, [isin, shown, ex, gate, attempt]);

  useEffect(() => {
    const name = open?.kind === 'ready' ? open.resp.stock?.name : undefined;
    document.title = name ? `${name} · 틱 전문 뷰어` : '틱 전문 뷰어';
  }, [open]);

  const gateReason = gate ?? serverGate;
  if (gateReason !== null) {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <DmaGate reason={gateReason} surface="틱 전문 뷰어" />
      </div>
    );
  }

  const nav = dateNavOf(dayResp?.dates ?? [], shown);
  const go = (next: { isin?: string | null; d?: string | null; ex?: TickExchange }) =>
    router.push(tickUrlOf({ isin: next.isin === undefined ? isin : next.isin, d: next.d ?? shown, ex: next.ex ?? ex }));
  const openResp = open?.kind === 'ready' ? open.resp : null;
  const loaded = openResp !== null && openResp.grid !== null;

  return (
    <div data-slot="tick-viewer" className="mx-auto flex w-full max-w-[1280px] flex-col gap-3">
      <TickHeader
        mode={loaded ? 'loaded' : 'entry'}
        stock={openResp?.stock ?? null}
        date={shown}
        ex={ex}
        supply="grid"
        prev={nav.prev}
        next={nav.next}
        onDate={(to) => go({ d: to })}
        onEx={(x) => go({ ex: x })}
        picker={null}
      />

      {isin === null ? renderEntry() : renderOpen()}
    </div>
  );

  function retry(text: string) {
    return (
      <div role="alert" className={cn(CARD, 'flex flex-col items-center gap-2 px-4 py-12 text-center')}>
        <p className="text-[length:var(--t-sm)] font-semibold break-keep text-[var(--fg)]">{text}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="min-h-8 text-[length:var(--t-caption)] font-semibold text-[var(--accent-fg)] hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  function renderEntry() {
    if (day.kind === 'loading') return <Loading />;
    if (day.kind === 'error') return retry('불러오지 못했어요');
    const resp = day.resp;
    return (
      <TickEntry
        date={shown ?? ''}
        rows={resp.rows}
        sort={sort}
        onSort={setSort}
        onOpen={(i, x) => go({ isin: i, ex: x })}
        etaMin={etaMinOf(resp.eta_s[ex])}
      />
    );
  }

  function renderOpen() {
    if (open === null || open.kind === 'loading') return <Loading />;
    if (open.kind === 'error') return retry('불러오지 못했어요');
    const grid = open.resp.grid;
    if (grid === null) {
      return (
        <p className={cn(CARD, 'm-0 px-4 py-10 text-center text-[12.5px] text-[var(--muted-fg)]')}>
          이 날짜 격자가 아직 없어요
        </p>
      );
    }
    // 37-10 이 이 자리에 `TickViewer`(슬라이더 · 호가 · 목록 · 차트)를 넣는다.
    return (
      <section data-slot="tick-body" className={cn(CARD, 'px-4 py-3 text-[12.5px] text-[var(--muted-fg)]')}>
        격자 준비됨 · 레코드 {fmtQty(grid.records)}건 · 크기 {fmtBytes(grid.bytes)}
      </section>
    );
  }
}

function Loading() {
  return (
    <p role="status" aria-live="polite" className="m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
      불러오는 중…
    </p>
  );
}
