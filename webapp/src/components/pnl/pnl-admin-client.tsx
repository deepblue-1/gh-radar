'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PNL_RANGES, type PnlGroup, type PnlGroupBy, type PnlRange } from '@gh-radar/shared';

import { ADMIN_CHIP_BASE } from '@/components/admin/reflect-chip';
import { PageHeader } from '@/components/layout/page-header';
import { BROKER_LABEL } from '@/lib/launch-format';
import { fetchAdminPnl } from '@/lib/pnl-api';
import { cn } from '@/lib/utils';

import { PNL_RANGE_LABEL, PnlPeriodControl, PnlReportView, pnlCaptionRangeOf, usePnlReport } from './pnl-report';

/**
 * PnlAdminClient — `/admin/pnl` 본문 (Phase 36 · D-17 ① · D-18 · UI-SPEC ⑤a · 채택 목업 ⑤ A 안).
 *
 * 쿼리가 진실 원본이다(발사 페이지 규율 — 새로고침 · 공유 주소 그대로).
 * - `group` — 'user'(기본 · 계정별 = dma_user_id) · 'account'(계좌별 = account_no · 게이트웨이 무관).
 * - `range` — '7' · '30'(기본) · '90' · 'month'.
 * 전환은 `router.replace`(다른 키 보존) · 잘못된 값은 그 키만 지운다. 묶음 정렬은 RPC 정본(미상 맨 뒤 · KB → 교보 ·
 * 계좌번호 오름차순)이라 화면은 재정렬하지 않는다. 권한은 미들웨어 `/admin` 접두 + server `requireAdmin` 이 한다.
 */

const BASE = '/admin/pnl';
const TITLE = '매매손익 · Admin';

const GROUP_SEGMENTS: readonly { value: PnlGroupBy; label: string }[] = [
  { value: 'user', label: '계정별' },
  { value: 'account', label: '계좌별' },
];

function groupParamOf(raw: string | null): PnlGroupBy | null {
  return raw === 'user' || raw === 'account' ? raw : null;
}

function rangeParamOf(raw: string | null): PnlRange | null {
  return raw !== null && (PNL_RANGES as readonly string[]).includes(raw) ? (raw as PnlRange) : null;
}

export function PnlAdminClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawGroup = searchParams.get('group');
  const group: PnlGroupBy = groupParamOf(rawGroup) ?? 'user';
  const badGroup = rawGroup !== null && groupParamOf(rawGroup) === null;

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

  // 잘못된 group · range → 그 키만 지운다(정본화).
  useEffect(() => {
    if (!badGroup && !badRange) return;
    router.replace(
      hrefWith((p) => {
        if (badGroup) p.delete('group');
        if (badRange) p.delete('range');
      }),
    );
  }, [badGroup, badRange, hrefWith, router]);

  useEffect(() => {
    document.title = TITLE;
  }, []);

  const { status, report, retry } = usePnlReport(`${group}|${range}`, () => fetchAdminPnl(group, range));
  const cap = pnlCaptionRangeOf(range, report);

  const onGroup = (g: PnlGroupBy) => router.replace(hrefWith((p) => p.set('group', g)));
  const onRange = (r: PnlRange) => router.replace(hrefWith((p) => p.set('range', r)));

  return (
    <div data-slot="admin-pnl" className="mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-4">
      <PageHeader title="매매손익" actions={<PnlGroupSeg group={group} onGroup={onGroup} />} />
      <PnlPeriodControl range={range} onChange={onRange} from={cap.from} to={cap.to} />
      <PnlReportView
        status={status}
        report={report}
        rangeLabel={PNL_RANGE_LABEL[range]}
        onRetry={retry}
        renderHeader={(g) => (group === 'user' ? <UserGroupHead group={g} /> : <AccountGroupHead group={g} />)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 묶음 세그먼트 — 발사 세그먼트 모양(중립 선택 면)
// ─────────────────────────────────────────────────────────────────────────────

function PnlGroupSeg({ group, onGroup }: { group: PnlGroupBy; onGroup: (g: PnlGroupBy) => void }) {
  return (
    <div
      data-slot="pnl-group-seg"
      role="group"
      aria-label="묶음"
      className="inline-flex gap-0.5 rounded-[10px] bg-[var(--muted)] p-[3px]"
    >
      {GROUP_SEGMENTS.map((s) => {
        const on = s.value === group;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={on}
            data-group={s.value}
            onClick={() => !on && onGroup(s.value)}
            className={cn(
              'min-h-8 rounded-[8px] px-3 text-[13px] font-semibold whitespace-nowrap',
              on
                ? 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                : 'text-[var(--muted-fg)] hover:text-[var(--fg)]',
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 묶음 머리 — 계정별(dma_user_id · 미상) · 계좌별(증권사 배지 + 계좌번호)
// ─────────────────────────────────────────────────────────────────────────────

const HEAD_TITLE = 'min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const HEAD_SUB = 'min-w-0 break-keep text-[length:var(--t-caption)] text-[var(--muted-fg)]';

/** 계좌 목록 — 같은 계좌번호(KB120/KB121 처럼 게이트웨이만 다른 것)는 한 번만. 증권사 낱말을 붙일지 고른다. */
function accountLabelsOf(group: PnlGroup, withBroker: boolean): string[] {
  const out = new Set<string>();
  for (const a of group.accounts) out.add(withBroker ? `${BROKER_LABEL[a.broker]} ${a.account_no}` : a.account_no);
  return [...out];
}

/**
 * 계정별 머리 — 제목 dma_user_id · 부제 「KB 37728502101 · 교보 10279758101」.
 * 「미상」(key "") — 부제 「dma_user_id 없는 체결 · 계좌 50011122233」(여럿이면 「· 계좌 A · B」).
 */
function UserGroupHead({ group }: { group: PnlGroup }) {
  const unknown = group.key === '';
  const title = unknown ? '미상' : group.key;
  const sub = unknown
    ? ['dma_user_id 없는 체결', `계좌 ${accountLabelsOf(group, false).join(' · ')}`].join(' · ')
    : accountLabelsOf(group, true).join(' · ');
  return (
    <>
      <span data-slot="pnl-group-title" className={HEAD_TITLE} title={title}>
        {title}
      </span>
      {sub !== '' && (
        <span data-slot="pnl-group-sub" className={HEAD_SUB}>
          {sub}
        </span>
      )}
    </>
  );
}

function AccountGroupHead({ group }: { group: PnlGroup }) {
  // 증권사 = 그 계좌 체결의 게이트웨이(RPC 정렬 키와 같은 규칙 — KB 가 하나라도 있으면 KB).
  const broker = group.accounts.some((a) => a.broker === 'KB') ? 'KB' : (group.accounts[0]?.broker ?? 'KB');
  const sub = [...group.dma_user_ids, group.account_name].filter(Boolean).join(' · ');
  return (
    <>
      <span className="flex min-w-0 items-center gap-1">
        <span
          data-slot="pnl-broker-badge"
          className={cn(ADMIN_CHIP_BASE, 'bg-[var(--muted)] text-[var(--fg-2)]')}
        >
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
