'use client';

import type { TeamflowMemberRow, TeamflowMembers as TeamflowMembersData } from '@gh-radar/shared';

import { fmtQty } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 다섯 창구 거래원 2단 막대 (Phase 33 · UI-SPEC T7 · D-14) — HTML(SVG 아님 · 상한가 `Bars` 의 `h-2` 트랙 문법).
 *
 * - 행 = `members.rows` 를 net 내림차순(null 맨 뒤 · 원본 불변) · `grid-cols-[48px_minmax(0,1fr)_88px]`:
 *   이름(truncate + title) | 트랙 두 줄(위 매수 `--up` · 아래 매도 `--down` · 폭 = 값 ÷ 이 종목 max(buy, sell) ·
 *   null = 채움 없음) | 순매수 주(부호 색 · null 「—」).
 * - 아래: 「상위 5 밖: …」(absent 있을 때) → 범례(행 있을 때) → 참고 줄(top_buy/top_sell 있는 쪽만).
 * - `members` null · 또는 rows · absent 둘 다 빔 = 소제목 줄 그대로 + 「거래원 자료 없음」. `members.total` 은 그리지 않는다.
 * - 캡션의 `time` 은 장 마감 뒤(예 19:50)여도 그대로 쓴다(마지막 거래원 집계 시점).
 */

const SUBHEAD = 'm-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';
const NOTE = 'm-0 text-[length:var(--t-caption)] text-[var(--muted-fg)] break-keep';

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** net 내림차순 · null 맨 뒤 · 같으면 입력 순서(안정 정렬). */
function sortMembers(rows: readonly TeamflowMemberRow[]): TeamflowMemberRow[] {
  return [...rows].sort((a, b) => {
    const an = isNum(a.net);
    const bn = isNum(b.net);
    if (an && bn) return (b.net as number) - (a.net as number);
    if (an !== bn) return an ? -1 : 1;
    return 0;
  });
}

const qtyOrDash = (v: number | null) => (isNum(v) ? `${fmtQty(v)}주` : '—');

function netClass(net: number | null): string {
  if (!isNum(net)) return 'text-[var(--faint)]';
  if (net > 0) return 'text-[var(--up)]';
  if (net < 0) return 'text-[var(--down)]';
  return 'text-[var(--fg-2)]';
}

function Track({ value, mx, side }: { value: number | null; mx: number; side: 'buy' | 'sell' }) {
  return (
    <span className="block h-2 overflow-hidden rounded-[4px] bg-[var(--muted)]">
      {isNum(value) && (
        <span
          aria-hidden="true"
          data-slot={`teamflow-member-${side}`}
          style={{ width: `${Math.min(Math.max((value / mx) * 100, 0), 100)}%` }}
          className={cn('block h-full rounded-[4px]', side === 'buy' ? 'bg-[var(--up)]' : 'bg-[var(--down)]')}
        />
      )}
    </span>
  );
}

export function TeamflowMembers({ members }: { members: TeamflowMembersData | null }) {
  const rows = sortMembers(members?.rows ?? []);
  const absent = members?.absent ?? [];
  const none = rows.length === 0 && absent.length === 0;
  const mx = Math.max(1, ...rows.flatMap((r) => [r.buy, r.sell]).filter(isNum));
  const topBuy = members?.top_buy ?? null;
  const topSell = members?.top_sell ?? null;
  const refParts = [
    topBuy ? `매수 1위 ${topBuy.name} ${fmtQty(topBuy.qty)}주` : null,
    topSell ? `매도 1위 ${topSell.name} ${fmtQty(topSell.qty)}주` : null,
  ].filter((x): x is string => x !== null);

  return (
    <div data-slot="teamflow-members">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className={SUBHEAD}>다섯 창구 거래원</h3>
        <span className={CAPTION}>
          {members?.time ? `${members.time} 기준 하루 누적 · 창구 전체(일반 고객 포함)` : '하루 누적 · 창구 전체(일반 고객 포함)'}
        </span>
      </div>

      {none ? (
        <p data-slot="teamflow-members-none" className="m-0 text-[length:var(--t-caption)] text-[var(--faint)]">
          거래원 자료 없음
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div
                  key={r.member}
                  data-slot="teamflow-member-row"
                  data-member={r.name}
                  title={`${r.name} · 매수 ${qtyOrDash(r.buy)} · 매도 ${qtyOrDash(r.sell)}`}
                  className="grid grid-cols-[48px_minmax(0,1fr)_88px] items-center gap-x-2"
                >
                  <span
                    className="truncate text-[length:var(--t-caption)] font-semibold text-[var(--fg)]"
                    title={r.name}
                  >
                    {r.name}
                  </span>
                  <span className="flex flex-col gap-1">
                    <Track value={r.buy} mx={mx} side="buy" />
                    <Track value={r.sell} mx={mx} side="sell" />
                  </span>
                  <span
                    data-slot="teamflow-member-net"
                    className={cn(
                      'mono text-right text-[length:var(--t-caption)] font-semibold tabular-nums',
                      netClass(r.net),
                    )}
                  >
                    {isNum(r.net) ? `${fmtQty(r.net, { signed: true })}주` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {absent.length > 0 && <p className={NOTE}>{`상위 5 밖: ${absent.join(' · ')}`}</p>}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              <span className="inline-flex items-center gap-1">
                <i aria-hidden="true" className="inline-block size-2.5 rounded-[2px] bg-[var(--up)]" />
                매수
              </span>
              <span className="inline-flex items-center gap-1">
                <i aria-hidden="true" className="inline-block size-2.5 rounded-[2px] bg-[var(--down)]" />
                매도
              </span>
              <span>오른쪽 = 순매수(주)</span>
            </div>
          )}
          {rows.length > 0 && refParts.length > 0 && <p className={NOTE}>{`참고: ${refParts.join(' · ')}`}</p>}
        </div>
      )}
    </div>
  );
}
