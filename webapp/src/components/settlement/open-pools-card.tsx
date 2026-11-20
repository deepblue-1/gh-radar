import {
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_MINUS,
  SETTLEMENT_POOLS,
  cumProfit,
  formatEokManMinus,
  formatEokManSigned,
  poolAccountRows,
  poolOk,
  profitTone,
  settlementReadLabel,
  type SettlementAccountView,
  type SettlementPoolId,
  type SettlementView,
} from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { cn } from "@/lib/utils";

/**
 * OpenPoolsCard — 「정산 전 수익」 카드(UI-SPEC ③ · 목업 `openPoolsCard` · `accTable`).
 *
 * 44-01 은 최소 모양이다 — 묶음 두 개(현중 · 근형 → 쥬니)마다 머리(이름 · 비율 · 묶음 값)와 계좌 표(예수금 · 넣은 돈 · 수익).
 * 계산은 shared 한 벌(`poolAccountRows` · `poolOk` · `cumProfit` — 수익 = 예수금 − 넣은 돈 · D-01).
 * 정산 이력 반영(정산 전 수익 = 누적 − 정산한 합) · 누적 줄 · 미설정 안내 · 못 읽음 줄 · 서버 간 다름 줄 · l3 몫 줄은 44-06 이
 * 이 파일을 완성하며 더한다(정산 이력이 없을 때 묶음 값은 누적과 같다).
 */

const POOL_ORDER: readonly SettlementPoolId[] = ["p1", "p2"];

const TONE_CLASS = { up: "text-[var(--up)]", down: "text-[var(--down)]" } as const;

/** 화면이 보이는 값의 읽은 시각 — 값을 가진(known · stale) 계좌 중 가장 최근. */
function latestReadAt(accounts: readonly SettlementAccountView[]): string | null {
  let best: string | null = null;
  for (const a of accounts) {
    if (a.state === "unset" || a.readAt === null) continue;
    if (best === null || Date.parse(a.readAt) > Date.parse(best)) best = a.readAt;
  }
  return best;
}

const labelOf = (acc: string) => SETTLEMENT_ACCOUNTS.find((a) => a.key === acc)?.label ?? acc;

export function OpenPoolsCard({ view }: { view: SettlementView }) {
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
      <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[14px] font-semibold text-[var(--fg)]">정산 전 수익</span>
        <span className="text-[12px] font-normal text-[var(--muted-fg)]">{subtitle}</span>
      </h2>
      {POOL_ORDER.map((pid, i) => (
        <PoolBlock key={pid} pool={pid} view={view} first={i === 0} />
      ))}
    </section>
  );
}

function PoolBlock({ pool, view, first }: { pool: SettlementPoolId; view: SettlementView; first: boolean }) {
  const def = SETTLEMENT_POOLS[pool];
  const ok = poolOk(pool, view.accounts);
  const value = cumProfit(pool, view.accounts, view.ledger);
  const tone = ok ? profitTone(value) : null;
  const rows = poolAccountRows(pool, view.accounts, view.ledger);

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
          {ok ? formatEokManSigned(value) : "—"}
        </span>
      </div>

      <div
        data-slot="settlement-acc-table"
        className="my-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-2 gap-y-1 text-[13px] @min-[768px]/settle:gap-x-4"
      >
        <span aria-hidden="true" />
        <span className="whitespace-nowrap text-right text-[12px] text-[var(--faint)]">예수금</span>
        <span className="whitespace-nowrap text-right text-[12px] text-[var(--faint)]">넣은 돈</span>
        <span className="whitespace-nowrap text-right text-[12px] text-[var(--faint)]">수익</span>
        {rows.map((r) => {
          const label = labelOf(r.accKey);
          const pTone = r.profitKrw === null ? null : profitTone(r.profitKrw);
          return (
            <div key={r.accKey} data-slot="settlement-acc-row" data-acc={r.accKey} className="contents">
              <span className="min-w-0 truncate text-[var(--fg)]" title={label}>
                {label}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-right tabular-nums",
                  r.budgetKrw === null ? "text-[var(--led-latent)]" : "text-[var(--fg)]",
                )}
              >
                {r.budgetKrw === null ? "미설정" : formatEokManMinus(r.budgetKrw)}
              </span>
              <span
                className="whitespace-nowrap text-right tabular-nums text-[var(--fg)]"
                title={`들어온 돈 ${formatEokManMinus(r.inKrw)} ${SETTLEMENT_MINUS} 나간 돈 ${formatEokManMinus(r.outKrw)}`}
              >
                {formatEokManMinus(r.putKrw)}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-right tabular-nums",
                  r.profitKrw === null ? "text-[var(--faint)]" : pTone ? TONE_CLASS[pTone] : "text-[var(--fg)]",
                )}
              >
                {r.profitKrw === null ? "—" : formatEokManSigned(r.profitKrw)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
