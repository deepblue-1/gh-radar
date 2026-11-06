'use client';

import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PNL_RANGES, type PnlGroup, type PnlRange } from '@gh-radar/shared';

import { ADMIN_CHIP_BASE } from '@/components/admin/reflect-chip';
import { PageHeader } from '@/components/layout/page-header';
import { BROKER_LABEL } from '@/lib/launch-format';
import { fetchAdminPnl } from '@/lib/pnl-api';
import { cn } from '@/lib/utils';

import { PNL_RANGE_LABEL, PnlPeriodControl, PnlReportView, pnlCaptionRangeOf, usePnlReport } from './pnl-report';

/**
 * PnlAdminClient — `/admin/pnl` 본문 (Phase 36 · D-17 ① · D-18 · UI-SPEC ⑤a · 채택 목업 ⑤ A 안).
 *
 * 묶음은 **계좌별 하나**(account_no · 게이트웨이 무관). 계정별(dma_user_id) 묶음은 뺐다(2026-11-06) — 공유 계좌
 * (한 계좌를 여러 계정이 씀)에서 손익이 「주문 낸 계정」 으로 쪼개져 계정의 계좌 전부가 안 보였고, 체결 통보에
 * dma_user_id 가 빠진 행은 「미상」 묶음으로 샜다. 손익의 정본 단위(평단 · 수수료 · 세금)는 계좌다.
 *
 * 쿼리가 진실 원본이다(발사 페이지 규율 — 새로고침 · 공유 주소 그대로).
 * - `range` — '7' · '30'(기본) · '90' · 'month'.
 * - `key` — 계좌 칩으로 고른 계좌 하나(account_no). 없으면 「전체」 · 이 기간에 없는 계좌면 화면만 「전체」.
 * - `group` — 옛 주소의 묶음 키. 이제 뜻이 없어 들어오면 지운다(옛 계정별 `key` 도 함께 — 계좌번호가 아니다).
 * 전환은 `router.replace`(다른 키 보존) · 잘못된 값은 그 키만 지운다. 묶음 정렬은 RPC 정본(KB → 교보 ·
 * 계좌번호 오름차순)이라 화면은 재정렬하지 않는다. 권한은 미들웨어 `/admin` 접두 + server `requireAdmin` 이 한다.
 */

const BASE = '/admin/pnl';
const TITLE = '매매손익 · Admin';

function rangeParamOf(raw: string | null): PnlRange | null {
  return raw !== null && (PNL_RANGES as readonly string[]).includes(raw) ? (raw as PnlRange) : null;
}

export function PnlAdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 옛 주소(?group=…) — 계정별이었으면 key 도 계정 id 라 같이 지운다.
  const rawGroup = searchParams.get('group');
  const staleGroup = rawGroup !== null;

  const rawRange = searchParams.get('range');
  const range: PnlRange = rangeParamOf(rawRange) ?? '30';
  const badRange = rawRange !== null && rangeParamOf(rawRange) === null;

  /** 현재 쿼리를 복제해 고친 주소 — 다른 키는 그대로. */
  const hrefWith = useCallback(
    (mutate: (p: URLSearchParams) => void): string => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const q = p.toString();
      return q === '' ? BASE : `${BASE}?${q}`;
    },
    [searchParams],
  );

  // 옛 group · 잘못된 range → 그 키만 지운다(정본화).
  useEffect(() => {
    if (!staleGroup && !badRange) return;
    router.replace(
      hrefWith((p) => {
        if (staleGroup) {
          if (p.get('group') !== 'account') p.delete('key');
          p.delete('group');
        }
        if (badRange) p.delete('range');
      }),
    );
  }, [staleGroup, badRange, hrefWith, router]);

  useEffect(() => {
    document.title = TITLE;
  }, []);

  const { status, report, retry } = usePnlReport(range, () => fetchAdminPnl('account', range));
  const cap = pnlCaptionRangeOf(range, report);

  // 계좌 칩 — `?key=` 가 고른 계좌(account_no). 없으면 「전체」.
  // 이 기간에 그 계좌가 없으면 주소는 두고 화면만 「전체」 로 본다(기간을 되돌리면 다시 그 계좌).
  const chipGroups = status === 'ready' && report !== null ? report.groups.filter((g) => g.days.length > 0) : [];
  const rawKey = searchParams.get('key');
  const selectedKey = rawKey !== null && chipGroups.some((g) => g.key === rawKey) ? rawKey : null;
  const shown =
    report !== null && selectedKey !== null
      ? { ...report, groups: report.groups.filter((g) => g.key === selectedKey) }
      : report;

  const onRange = (r: PnlRange) => router.replace(hrefWith((p) => p.set('range', r)));
  const onKey = (k: string | null) => router.replace(hrefWith((p) => (k === null ? p.delete('key') : p.set('key', k))));

  return (
    <div data-slot="admin-pnl" className="mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-4">
      <PageHeader title="매매손익" />
      <PnlPeriodControl range={range} onChange={onRange} from={cap.from} to={cap.to} />
      {chipGroups.length > 0 && <PnlKeyChips groups={chipGroups} selectedKey={selectedKey} onChange={onKey} />}
      <PnlReportView
        status={status}
        report={shown}
        rangeLabel={PNL_RANGE_LABEL[range]}
        onRetry={retry}
        defaultOpenFirst={false}
        renderHeader={(g) => <AccountGroupHead group={g} />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 칩 줄 — /me 계좌 칩(MeAccountChips)과 같은 모양 · 같은 radiogroup 키보드 문법. 맨 앞 「전체」.
// ─────────────────────────────────────────────────────────────────────────────

const ALL = '\u0000all';

/** 묶음의 증권사 — 계좌별 머리와 같은 규칙(KB 가 하나라도 있으면 KB). */
function brokerOf(group: PnlGroup): 'KB' | 'KYOBO' {
  return group.accounts.some((a) => a.broker === 'KB') ? 'KB' : (group.accounts[0]?.broker ?? 'KB');
}

function PnlKeyChips({
  groups,
  selectedKey,
  onChange,
}: {
  groups: readonly PnlGroup[];
  selectedKey: string | null;
  onChange: (key: string | null) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const current = selectedKey ?? ALL;
  const ids = [ALL, ...groups.map((g) => g.key)];

  const pick = (id: string) => {
    if (id === current) return;
    onChange(id === ALL ? null : id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    let to: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (at + 1) % buttons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (at - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[to]?.focus();
    pick(ids[to]!);
  };

  const chipCls = (on: boolean) =>
    cn(
      'inline-flex h-8 flex-none items-center gap-1 rounded-full px-3 whitespace-nowrap',
      on
        ? 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
        : 'bg-[var(--muted)] text-[var(--muted-fg)]',
    );

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label="계좌"
      data-slot="pnl-key-chips"
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        role="radio"
        aria-checked={current === ALL}
        data-slot="pnl-key-chip"
        data-key=""
        data-all="true"
        tabIndex={current === ALL ? 0 : -1}
        onClick={() => pick(ALL)}
        className={chipCls(current === ALL)}
      >
        <span className="text-[12.5px] font-semibold">전체</span>
      </button>
      {groups.map((g) => {
        const on = g.key === current;
        const label = [BROKER_LABEL[brokerOf(g)], g.account_name, g.key].filter(Boolean).join(' ');
        return (
          <button
            key={g.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            data-slot="pnl-key-chip"
            data-key={g.key}
            tabIndex={on ? 0 : -1}
            onClick={() => pick(g.key)}
            className={chipCls(on)}
          >
            {g.account_name !== null && g.account_name !== '' && (
              <span data-part="name" className="text-[12.5px] font-semibold">
                {g.account_name}
              </span>
            )}
            <span
              data-part="no"
              className={cn(
                'mono text-[11px] font-normal',
                on ? 'text-[var(--seg-on-fg)] opacity-80' : 'text-[var(--muted-fg)]',
              )}
            >
              {g.key}
            </span>
            <span
              data-part="broker"
              className="mono inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--muted)] px-1.5 text-[10px] font-bold whitespace-nowrap text-[var(--fg-2)]"
            >
              {BROKER_LABEL[brokerOf(g)]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 머리 — 증권사 배지 + 계좌번호 · 부제 그 계좌로 주문한 계정 · 계좌명
// ─────────────────────────────────────────────────────────────────────────────

const HEAD_TITLE = 'min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const HEAD_SUB = 'min-w-0 break-keep text-[length:var(--t-caption)] text-[var(--muted-fg)]';

function AccountGroupHead({ group }: { group: PnlGroup }) {
  // 증권사 = 그 계좌 체결의 게이트웨이(RPC 정렬 키와 같은 규칙 — KB 가 하나라도 있으면 KB).
  const broker = brokerOf(group);
  const sub = [...group.dma_user_ids, group.account_name].filter(Boolean).join(' · ');
  return (
    <>
      <span className="flex min-w-0 items-center gap-1">
        <span data-slot="pnl-broker-badge" className={cn(ADMIN_CHIP_BASE, 'bg-[var(--muted)] text-[var(--fg-2)]')}>
          {BROKER_LABEL[broker]}
        </span>
        <span data-slot="pnl-group-title" className={cn(HEAD_TITLE, 'tabular-nums')} title={group.key}>
          {group.key}
        </span>
      </span>
      {sub !== '' && (
        <span data-slot="pnl-group-sub" className={HEAD_SUB}>
          {sub}
        </span>
      )}
    </>
  );
}
