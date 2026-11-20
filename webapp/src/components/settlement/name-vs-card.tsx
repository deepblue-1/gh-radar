import type { ReactNode } from "react";
import {
  SETTLEMENT_ACCOUNTS,
  formatEokMan,
  nameVs,
  type SettlementCtx,
  type SettlementPerson,
} from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { cn } from "@/lib/utils";

/**
 * NameVsCard — 「명의 대 몫」 카드(UI-SPEC ④ · 목업 `nameCard` · 확정 규칙 6 · D-25).
 *
 * - 김현중 명의 계좌 합(교보 김현중 · KB 김현중)과 그중 김현중 · 심쥬니 몫, 정근형 명의 계좌 합(KB 정근형 · 교보 정근형)과 정근형 몫.
 * - 「0 이 되려면」 상자 — x = 정근형 지금 몫 전체 − 정근형 명의 예수금(shared `nameVs().xKrw`).
 *   x > 0 김현중 → 정근형 / x < 0 정근형 → 김현중 / 0 「명의와 몫이 맞습니다」. 문장은 목업 그대로(「…원이면 맞음」 의 「원」 포함).
 * - 두 사람 명의 계좌 중 미설정이 있거나 김현중 · 정근형 몫이 계산 불가면(`nameVs().unk`) 상자는 계산 불가 문장.
 * - 사실 관계만 보인다 — 돈이 어떤 성격인지 판단하는 문구는 넣지 않는다(규칙 6).
 */

const DASH = "—";

/** 그 명의 계좌 보조 줄 「교보 김현중 6억 8,400만 · KB 김현중 3억 7,200만」(SETTLEMENT_ACCOUNTS 순서 · 미설정은 「미설정」). */
function ownerAccounts(owner: SettlementPerson, ctx: SettlementCtx): string {
  return SETTLEMENT_ACCOUNTS.filter((a) => a.owner === owner)
    .map((a) => {
      const v = ctx.accounts.find((x) => x.accKey === a.key)?.budgetKrw ?? null;
      return `${a.label} ${v === null ? "미설정" : formatEokMan(v)}`;
    })
    .join(" · ");
}

export function NameVsCard({ ctx }: { ctx: SettlementCtx }) {
  const n = nameVs(ctx);
  const stake = (p: SettlementPerson) => (n.people[p].unk ? DASH : formatEokMan(n.people[p].stakeKrw));

  return (
    <section
      data-slot="settlement-name-vs"
      className={cn(
        CARD,
        "min-w-0 p-3 ring-1 ring-inset ring-[var(--border-subtle)] dark:ring-0 @min-[768px]/settle:p-4",
      )}
    >
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-semibold text-[var(--fg)]">명의 대 몫</span>
        <span className="text-[12px] font-normal text-[var(--muted-fg)]">누구 이름 계좌에 누구 돈이 있나</span>
      </h2>

      <div className="text-[14px]">
        <Tr2Row label="김현중 명의 계좌">{n.unkBal.H ? DASH : formatEokMan(n.balKrw.H)}</Tr2Row>
        <Tr2Sub>{ownerAccounts("H", ctx)}</Tr2Sub>
        <Tr2Sub>
          그중 김현중 몫 {stake("H")} · 심쥬니 몫 {stake("J")}
        </Tr2Sub>
        <Tr2Row label="정근형 명의 계좌" line>
          {n.unkBal.G ? DASH : formatEokMan(n.balKrw.G)}
        </Tr2Row>
        <Tr2Sub>{ownerAccounts("G", ctx)}</Tr2Sub>
        <Tr2Sub>정근형 몫은 {stake("G")}</Tr2Sub>
      </div>

      <div
        data-slot="settlement-name-zero"
        className="mt-3 break-keep rounded-[12px] bg-[var(--muted)] px-4 py-3 text-[14px] text-[var(--muted-fg)]"
      >
        {n.unk ? (
          "예수금이 설정되지 않은 계좌가 있어 맞출 금액을 계산할 수 없어요"
        ) : n.xKrw === 0 ? (
          <ZeroAmount>명의와 몫이 맞습니다</ZeroAmount>
        ) : n.xKrw > 0 ? (
          <>
            <p data-slot="settlement-name-zero-dir">김현중 명의 계좌에 정근형 몫이 들어 있습니다</p>
            <ZeroAmount>김현중 → 정근형 {formatEokMan(n.xKrw)}원이면 맞음</ZeroAmount>
          </>
        ) : (
          <>
            <p data-slot="settlement-name-zero-dir">정근형 명의 계좌에 김현중 몫이 들어 있습니다</p>
            <ZeroAmount>정근형 → 김현중 {formatEokMan(-n.xKrw)}원이면 맞음</ZeroAmount>
          </>
        )}
      </div>
    </section>
  );
}

/** 「0 이 되려면」 금액 문장 — 18/600 `--fg`. */
function ZeroAmount({ children }: { children: ReactNode }) {
  return (
    <p
      data-slot="settlement-name-zero-amt"
      className="mt-0.5 text-[18px] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--fg)]"
    >
      {children}
    </p>
  );
}

/** `.tr2` 줄 — 라벨 왼쪽(줄바꿈 가능) · 값 오른쪽 600 한 줄. `line` 이면 위 hairline(두 번째 사람 묶음 · 「차액」). */
export function Tr2Row({
  label,
  children,
  line,
}: {
  label: ReactNode;
  children: ReactNode;
  line?: boolean;
}) {
  return (
    <div
      data-slot="settlement-tr2-row"
      className={cn(
        "flex items-baseline justify-between gap-2 py-1",
        line && "mt-1 border-t border-[var(--border-subtle)] pt-2",
      )}
    >
      <span className="min-w-0 break-keep text-[var(--fg)]">{label}</span>
      <span className="whitespace-nowrap text-right font-semibold tabular-nums text-[var(--fg)]">{children}</span>
    </div>
  );
}

/** `.tr2` 보조 줄 — 12 `--faint` · 왼쪽 정렬 · 줄바꿈 허용. */
export function Tr2Sub({ children }: { children: ReactNode }) {
  return (
    <div data-slot="settlement-tr2-sub" className="flex pb-1">
      <span className="min-w-0 break-keep text-[12px] tabular-nums text-[var(--faint)]">{children}</span>
    </div>
  );
}
