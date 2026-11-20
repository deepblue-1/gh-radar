import type { ReactNode } from "react";
import {
  SETTLEMENT_PEOPLE,
  SETTLEMENT_PERSON_ORDER,
  SETTLEMENT_POOLS,
  formatEokMan,
  formatEokManMinus,
  formatEokManSigned,
  personSummary,
  profitTone,
  type SettlementCtx,
  type SettlementPerson,
  type SettlementPoolId,
} from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { cn } from "@/lib/utils";

import { PersonDot } from "./open-pools-card";

/**
 * PersonCards — 세 사람 카드(UI-SPEC ② · 목업 `personCards` · D-06 · D-08 · D-25).
 *
 * - 순서 김현중 → 정근형 → 심쥬니 · 좁으면 1열 · 정산 본문 ≥ 768 이면 3열.
 * - 큰 숫자(화면의 시선 앵커 · 24/600 · 무색) = 「내 수익 몫 · 아직 계좌에 두고 있는 돈」 = 남겨 둔 돈 + 정산 전 몫
 *   (shared `personSummary().totalKrw` · 목업 `fm(x.total)`). 「지금 몫 전체」 = 원금 + 남겨 둔 돈 + 정산 전 몫 − 손실(`stakeKrw`).
 * - 그 사람이 몫을 가진 묶음에 예수금 미설정 계좌가 있으면 큰 숫자 · 「정산 전 수익 중 내 몫」 · 「지금 몫 전체」 가 「—」.
 *   「정산한 수익 중 남겨 둔 돈」 · 「넣어 둔 원금」 은 그대로(목업 `person().unk`).
 * - 줄 조건은 목업 그대로: 원금 보조 줄은 두 묶음에 소속된 사람만(값 0 인 묶음은 글자에서 뺀다) · 손실 줄은 손실이 있을 때만.
 * - 계산은 shared `personSummary` 한 벌 · 금액은 shared 억 · 만 포매터만.
 */

const TONE_CLASS = { up: "text-[var(--up)]", down: "text-[var(--down)]" } as const;
const DASH_CLASS = "text-[var(--faint)]";

export function PersonCards({ ctx }: { ctx: SettlementCtx }) {
  return (
    <div data-slot="settlement-people" className="grid min-w-0 grid-cols-1 gap-3 @min-[768px]/settle:grid-cols-3">
      {SETTLEMENT_PERSON_ORDER.map((p) => (
        <PersonCard key={p} person={p} ctx={ctx} />
      ))}
    </div>
  );
}

function poolEntries<T>(m: Partial<Record<SettlementPoolId, T>>): [SettlementPoolId, T][] {
  return (["p1", "p2"] as const).filter((pid) => m[pid] !== undefined).map((pid) => [pid, m[pid] as T]);
}

function PersonCard({ person, ctx }: { person: SettlementPerson; ctx: SettlementCtx }) {
  const x = personSummary(person, ctx);
  const opens = poolEntries(x.open);
  const caps = poolEntries(x.cap);
  const openTone = x.unk ? null : profitTone(x.openSum);
  const isGuard = Object.values(SETTLEMENT_POOLS).some((def) => def.guard === person);

  const openSub = opens
    .map(([pid, v]) => `${SETTLEMENT_POOLS[pid].name} ${v === null ? "—" : formatEokManSigned(v)}`)
    .join(" · ");
  const capSub = caps
    .filter(([, v]) => v !== 0)
    .map(([pid, v]) => `${SETTLEMENT_POOLS[pid].name} ${formatEokMan(v)}`)
    .join(" · ");

  return (
    <section
      data-slot="settlement-person"
      data-person={person}
      className={cn(
        CARD,
        "min-w-0 p-3 ring-1 ring-inset ring-[var(--border-subtle)] dark:ring-0 @min-[768px]/settle:p-4",
      )}
    >
      <h2 className="flex items-baseline text-[14px] font-semibold text-[var(--fg)]">
        <PersonDot person={person} />
        <span data-slot="settlement-person-name">{SETTLEMENT_PEOPLE[person].name}</span>
      </h2>
      <p className="mt-2 break-keep text-[12px] text-[var(--muted-fg)]">
        내 수익 몫 <span className="text-[var(--faint)]">아직 계좌에 두고 있는 돈</span>
      </p>
      <p
        data-slot="settlement-person-big"
        className={cn(
          "mb-2 whitespace-nowrap text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] tabular-nums",
          x.unk ? DASH_CLASS : "text-[var(--fg)]",
        )}
      >
        {x.unk ? "—" : formatEokManMinus(x.totalKrw)}
        <span className="ml-0.5 text-[14px] font-normal tracking-normal text-[var(--muted-fg)]">원</span>
      </p>

      <div className="border-t border-[var(--border-subtle)] pt-2 text-[14px]">
        <Kv label={x.dueKrw < 0 ? "정산한 몫보다 먼저 가져간 돈" : "정산한 수익 중 남겨 둔 돈"}>
          {formatEokManMinus(x.dueKrw)}
        </Kv>
        <Kv
          label="정산 전 수익 중 내 몫"
          valueClass={x.unk ? DASH_CLASS : openTone ? TONE_CLASS[openTone] : undefined}
        >
          {x.unk ? "—" : formatEokManSigned(x.openSum)}
        </Kv>
        <Sub>{openSub}</Sub>
        <Kv label="넣어 둔 원금">{formatEokManMinus(x.capSum)}</Kv>
        {caps.length > 1 && <Sub>{capSub}</Sub>}
        {x.lossKrw > 0 && (
          <Kv
            label={
              <>
                쥬니 묶음 손실{" "}
                <span className="text-[var(--faint)]">{isGuard ? "원금보장 · 1억까지 혼자" : "1억 넘는 부분"}</span>
              </>
            }
            valueClass={TONE_CLASS.down}
          >
            −{formatEokMan(x.lossKrw)}
          </Kv>
        )}
        <Kv
          label="지금 몫 전체"
          className="mt-1 border-t border-[var(--border-subtle)] pt-2 font-semibold"
          labelClass="text-[var(--fg)]"
          valueClass={x.unk ? DASH_CLASS : undefined}
        >
          {x.unk ? "—" : formatEokManMinus(x.stakeKrw)}
        </Kv>
      </div>
    </section>
  );
}

/** kv 줄 — 라벨은 줄바꿈 가능(`min-w-0 break-keep`) · 값은 한 줄(`whitespace-nowrap`). */
function Kv({
  label,
  children,
  className,
  labelClass,
  valueClass,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div data-slot="settlement-person-kv" className={cn("flex items-baseline justify-between gap-2 py-1", className)}>
      <span className={cn("min-w-0 break-keep text-[var(--muted-fg)]", labelClass)}>{label}</span>
      <span className={cn("whitespace-nowrap text-right tabular-nums text-[var(--fg)]", valueClass)}>{children}</span>
    </div>
  );
}

/** kv 보조 줄 — 오른쪽 정렬 · 12 `--faint` · 줄바꿈 허용. */
function Sub({ children }: { children: ReactNode }) {
  return (
    <div data-slot="settlement-person-kv" className="flex justify-end pb-1 text-right">
      <span className="min-w-0 break-keep text-[12px] tabular-nums text-[var(--faint)]">{children}</span>
    </div>
  );
}
