'use client';

import type {
  TeamflowMemberFlow,
  TeamflowMemberRow,
  TeamflowMembers as TeamflowMembersData,
} from '@gh-radar/shared';

import { TONE_TEXT, fmtEok, fmtQty, isNum, memberDaySplitOf, toneOf } from '@/lib/teamflow-report';
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
 *
 * 억 모드(quick 261018-j17 · C-06 · C-14) — rows 중 하나라도 `buy_val` · `sell_val` · `net_val` 키가 있으면(값 null 이어도 새 export):
 * 소제목 「거래원별 하루 순매수」 · 정렬 = net_val 내림차순(null 뒤 · 안정) · 막대 = 금액 ÷ 이 종목 금액 최대 · 오른쪽 = 순매수 억 ·
 * 행마다 아랫줄 「매수 … · 매도 …」 + (member_flow 에 「상한가 가격」 구간이 있으면) 「 · 상한가 전 … · 상한가 가격 …」.
 * **두 출처**: 큰 숫자 = members.rows net_val(마지막 스윕 누적) · 분해 줄 = member_flow 구간 배분 추정 — 구간 합이 큰 숫자와
 * 다를 수 있어(체결 없는 스윕 구간 · 첫 스윕 전/마지막 스윕 뒤 증분은 배분되지 않음) 분해 줄이 하나라도 있으면 출처 캡션 한 줄.
 * 어느 쪽도 다른 쪽에 맞춰 보정하지 않는다. 키가 없는 옛 행 = 위 주 단위 화면 그대로(C-07).
 */

const SUBHEAD = 'm-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';
const NOTE = 'm-0 text-[length:var(--t-caption)] text-[var(--muted-fg)] break-keep';

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

/** 억 모드 — net_val 내림차순 · null 맨 뒤 · 같으면 입력 순서(안정 정렬). */
function sortMembersByVal(rows: readonly TeamflowMemberRow[]): TeamflowMemberRow[] {
  return [...rows].sort((a, b) => {
    const an = isNum(a.net_val);
    const bn = isNum(b.net_val);
    if (an && bn) return (b.net_val as number) - (a.net_val as number);
    if (an !== bn) return an ? -1 : 1;
    return 0;
  });
}

/** 새 export 판정 — 금액 키가 하나라도 있으면(값 null 이어도) 억 모드. */
const hasAmounts = (rows: readonly TeamflowMemberRow[]) =>
  rows.some((r) => r.buy_val !== undefined || r.sell_val !== undefined || r.net_val !== undefined);

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

/** 주 단위 행(옛 export — 화면 불변 · C-07). */
function QtyRow({ r, mx }: { r: TeamflowMemberRow; mx: number }) {
  return (
    <div
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
  );
}

export function TeamflowMembers({
  members,
  memberFlow = null,
}: {
  members: TeamflowMembersData | null;
  memberFlow?: TeamflowMemberFlow | null;
}) {
  const raw = members?.rows ?? [];
  const eok = hasAmounts(raw);
  const rows = eok ? sortMembersByVal(raw) : sortMembers(raw);
  const absent = members?.absent ?? [];
  const none = rows.length === 0 && absent.length === 0;
  const mx = Math.max(
    1,
    ...rows.flatMap((r) => (eok ? [r.buy_val ?? null, r.sell_val ?? null] : [r.buy, r.sell])).filter(isNum),
  );
  const splits = new Map(rows.map((r) => [r.member, eok ? memberDaySplitOf(memberFlow, r.member) : null]));
  const anySplit = [...splits.values()].some((x) => x?.hasLim === true);
  const topBuy = members?.top_buy ?? null;
  const topSell = members?.top_sell ?? null;
  const refParts = [
    topBuy ? `매수 1위 ${topBuy.name} ${fmtQty(topBuy.qty)}주` : null,
    topSell ? `매도 1위 ${topSell.name} ${fmtQty(topSell.qty)}주` : null,
  ].filter((x): x is string => x !== null);

  return (
    <div data-slot="teamflow-members">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className={SUBHEAD}>{eok ? '거래원별 하루 순매수' : '다섯 창구 거래원'}</h3>
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
              {rows.map((r) => {
                if (!eok) return <QtyRow key={r.member} r={r} mx={mx} />;
                const sp = splits.get(r.member) ?? null;
                const sub = [`매수 ${fmtEok(r.buy_val)}`, `매도 ${fmtEok(r.sell_val)}`];
                if (sp?.hasLim) {
                  sub.push(`상한가 전 ${fmtEok(sp.pre, { signed: true })}`, `상한가 가격 ${fmtEok(sp.lim, { signed: true })}`);
                }
                return (
                  <div key={r.member} className="flex flex-col gap-0.5">
                    <div
                      data-slot="teamflow-member-row"
                      data-member={r.name}
                      title={`${r.name} · 매수 ${fmtEok(r.buy_val)} · 매도 ${fmtEok(r.sell_val)}`}
                      className="grid grid-cols-[48px_minmax(0,1fr)_88px] items-center gap-x-2"
                    >
                      <span
                        className="truncate text-[length:var(--t-caption)] font-semibold text-[var(--fg)]"
                        title={r.name}
                      >
                        {r.name}
                      </span>
                      <span className="flex flex-col gap-1">
                        <Track value={r.buy_val ?? null} mx={mx} side="buy" />
                        <Track value={r.sell_val ?? null} mx={mx} side="sell" />
                      </span>
                      <span
                        data-slot="teamflow-member-net"
                        className={cn(
                          'mono text-right text-[length:var(--t-caption)] font-semibold tabular-nums',
                          isNum(r.net_val) ? TONE_TEXT[toneOf(r.net_val)] : 'text-[var(--faint)]',
                        )}
                      >
                        {fmtEok(r.net_val, { signed: true })}
                      </span>
                    </div>
                    <p
                      data-slot="teamflow-member-sub"
                      className="m-0 pl-14 text-[length:var(--t-caption)] text-[var(--muted-fg)] break-keep"
                    >
                      {sub.join(' · ')}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {absent.length > 0 && <p className={NOTE}>{`상위 5 밖: ${absent.join(' · ')}`}</p>}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-[2px] bg-[var(--up)]" />
                매수
              </span>
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="inline-block size-2.5 rounded-[2px] bg-[var(--down)]" />
                매도
              </span>
              <span>{eok ? '오른쪽 = 순매수(억)' : '오른쪽 = 순매수(주)'}</span>
            </div>
          )}
          {eok && anySplit && (
            <p data-slot="teamflow-member-source-note" className={NOTE}>
              큰 숫자 = 마지막 거래원 집계의 하루 누적 · 아랫줄 「상한가 전 · 상한가 가격」 = 그 누적을 체결 구간에 나눈 추정이라
              더해도 큰 숫자와 다를 수 있다(출처가 다르다)
            </p>
          )}
          {rows.length > 0 && refParts.length > 0 && <p className={NOTE}>{`참고: ${refParts.join(' · ')}`}</p>}
        </div>
      )}
    </div>
  );
}
