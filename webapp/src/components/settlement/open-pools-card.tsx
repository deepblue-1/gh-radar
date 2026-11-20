import Link from "next/link";
import { Fragment } from "react";
import {
  SETTLEMENT_PEOPLE,
  SETTLEMENT_POOLS,
  cumProfit,
  distributable,
  formatEokMan,
  formatEokManSigned,
  openProfit,
  poolAccountRows,
  poolOk,
  profitTone,
  settledSum,
  settlementReadLabel,
  shareOf,
  type SettlementAccountView,
  type SettlementCtx,
  type SettlementPerson,
  type SettlementPoolId,
  type SettlementView,
} from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { cn } from "@/lib/utils";

import { AccountTable } from "./account-table";

/**
 * OpenPoolsCard — 「정산 전 수익」 카드(UI-SPEC ③ · 목업 `openPoolsCard` · D-24 · D-25 · D-28 · D-04).
 *
 * - 부제 「수익 = 예수금 − 넣은 돈 · 예수금 읽은 시각 …」(값을 가진 계좌 중 가장 최근 시각) + 그 아래 D-28 예수금 기준 한 줄(늘 보임).
 * - 묶음 두 개(현중 · 근형 → 쥬니)마다 머리(이름 · 비율 · 정산 전 수익 = 누적 − 이미 정산한 수익) · 계좌 표(`AccountTable`) · l3 줄.
 * - 묶음 계좌 중 예수금 미설정이 있으면 묶음 값 「—」 · l3 미설정 안내 + 「계좌 메뉴에서 설정」 · 누적 줄 없음(목업 `ok && prev`).
 * - l3: 미설정 안내 / 원금 기준(쥬니)이 있고 정산 전 수익 ≤ 0 이면 손실 이월 줄 / 그 밖 사람마다 점 + 이름 + 몫.
 * - 계산은 shared 한 벌(`openProfit` · `distributable` · `shareOf` · `settledSum` · `cumProfit`) — 화면이 새로 만들지 않는다.
 */

const POOL_ORDER: readonly SettlementPoolId[] = ["p1", "p2"];

const TONE_CLASS = { up: "text-[var(--up)]", down: "text-[var(--down)]" } as const;

const PERSON_DOT_BG: Readonly<Record<SettlementPerson, string>> = {
  H: "bg-[var(--person-h)]",
  G: "bg-[var(--person-g)]",
  J: "bg-[var(--person-j)]",
};

/** 사람 점(8×8 · 장식) — 옆 이름 글자가 뜻을 진다. ② · ③ · ⑥ · ⑧ 이 함께 쓴다. */
export function PersonDot({ person, className }: { person: SettlementPerson; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="person-dot"
      className={cn("mr-1.5 inline-block size-2 shrink-0 rounded-full align-[1px]", PERSON_DOT_BG[person], className)}
    />
  );
}

/** 화면이 보이는 값의 읽은 시각 — 값을 가진(known · stale) 계좌 중 가장 최근. */
function latestReadAt(accounts: readonly SettlementAccountView[]): string | null {
  let best: string | null = null;
  for (const a of accounts) {
    if (a.state === "unset" || a.readAt === null) continue;
    if (best === null || Date.parse(a.readAt) > Date.parse(best)) best = a.readAt;
  }
  return best;
}

export function OpenPoolsCard({ view }: { view: SettlementView }) {
  const ctx: SettlementCtx = { accounts: view.accounts, ledger: view.ledger, settles: view.settles };
  const readAt = latestReadAt(view.accounts);
  // 문구 정본(UI-SPEC ③) — 빼기 표시는 U+2212.
  const subtitle = `수익 = 예수금 − 넣은 돈${readAt ? ` · 예수금 읽은 시각 ${settlementReadLabel(readAt, view.now)}` : ""}`;

  return (
    <section
      data-slot="settlement-open-pools"
      className={cn(
        CARD,
        "min-w-0 p-3 ring-1 ring-inset ring-[var(--border-subtle)] dark:ring-0 @min-[768px]/settle:p-4",
      )}
    >
      <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-semibold text-[var(--fg)]">정산 전 수익</span>
        <span className="text-[12px] font-normal text-[var(--muted-fg)]">{subtitle}</span>
      </h2>
      <p data-slot="settlement-budget-basis" className="mt-1 break-keep text-[12px] text-[var(--muted-fg)]">
        예수금은 현금 + 보유 종목 매입금액 기준이에요(평가금액 아님)
      </p>
      {POOL_ORDER.map((pid, i) => (
        <PoolBlock key={pid} pool={pid} view={view} ctx={ctx} first={i === 0} />
      ))}
    </section>
  );
}

function PoolBlock({
  pool,
  view,
  ctx,
  first,
}: {
  pool: SettlementPoolId;
  view: SettlementView;
  ctx: SettlementCtx;
  first: boolean;
}) {
  const def = SETTLEMENT_POOLS[pool];
  const ok = poolOk(pool, view.accounts);
  const open = openProfit(pool, ctx);
  const prev = settledSum(pool, view.settles);
  const tone = ok ? profitTone(open) : null;
  const rows = poolAccountRows(pool, view.accounts, view.ledger);
  const mismatch = view.accounts.filter((a) => a.pool === pool && a.mismatch).map((a) => a.accKey);

  return (
    <div
      data-slot="settlement-pool"
      data-pool={pool}
      className={cn("mt-3 border-t border-[var(--border-subtle)] pt-3", first && "mt-2 border-t-0 pt-0")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[14px] font-semibold text-[var(--fg)]">{def.name}</span>
          <span className="text-[12px] text-[var(--muted-fg)]">{def.ratioLabel}</span>
        </span>
        <span
          data-slot="settlement-pool-value"
          className={cn(
            "whitespace-nowrap text-[18px] font-semibold tabular-nums",
            ok ? (tone ? TONE_CLASS[tone] : "text-[var(--fg)]") : "text-[var(--faint)]",
          )}
        >
          {ok ? formatEokManSigned(open) : "—"}
        </span>
      </div>

      <AccountTable
        rows={rows}
        cum={ok && prev > 0 ? { cumKrw: cumProfit(pool, view.accounts, view.ledger), prevKrw: prev } : null}
        mode="now"
        mismatch={mismatch}
        nowIso={view.now}
      />

      <div data-slot="settlement-pool-l3" className="mt-2 break-keep text-[12px]">
        {!ok ? (
          <>
            <span className="text-[var(--led-latent)]">예수금이 설정되지 않은 계좌가 있어요</span>{" "}
            <Link href="/admin/accounts" className="text-[var(--accent-fg)] hover:underline">
              계좌 메뉴에서 설정
            </Link>
          </>
        ) : def.baseKrw !== undefined && open <= 0 ? (
          <span className="text-[var(--muted-fg)]">
            원금 {formatEokMan(def.baseKrw)}까지 {formatEokMan(-open)} 남음 — 회복한 뒤부터 나눕니다
          </span>
        ) : (
          <SharesLine pool={pool} distKrw={distributable(pool, ctx)} />
        )}
      </div>
    </div>
  );
}

/** l3 몫 줄 — 점 「김현중 +5억 2,450만」 · 점 「정근형 +5억 2,450만」(몫 600 무색 · 구분 「 · 」 `--faint`). */
function SharesLine({ pool, distKrw }: { pool: SettlementPoolId; distKrw: number }) {
  const people = Object.keys(SETTLEMENT_POOLS[pool].ratio) as SettlementPerson[];
  return (
    <span className="text-[var(--fg)]">
      {people.map((p, i) => (
        <Fragment key={p}>
          {i > 0 && <span className="text-[var(--faint)]"> · </span>}
          <span className="whitespace-nowrap">
            <PersonDot person={p} />
            {SETTLEMENT_PEOPLE[p].name}{" "}
            <span className="font-semibold tabular-nums">{formatEokManSigned(shareOf(pool, distKrw, p))}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
}
