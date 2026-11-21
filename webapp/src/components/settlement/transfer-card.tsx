import { formatEokMan, formatEokManMinus, hgSum, type SettlementLedgerRow } from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { cn } from "@/lib/utils";

import { SETTLE_HIT_44 } from "./ledger-row";
import { Tr2Row } from "./name-vs-card";

/**
 * TransferCard — 「현중 ↔ 근형 계좌이체」 카드(UI-SPEC ⑤ · 목업 `transferCard` · 확정 규칙 5 · 6).
 *
 * - 실제로 오간 돈(소명용) — 적어 둔 거래만 읽는다(shared `hgSum`). 예수금과 무관해 미설정 · 못 읽음에서도 숫자가 그대로 보인다.
 * - 두 방향 줄 · 「차액」 줄은 늘 보인다(0 건이면 「0건」 · 「0」). 「법인 용역으로 옮긴 돈」 줄은 그 거래가 있을 때만(개인 이체 합에서 뺀다).
 * - 「이체 내역 보기」 → 부르는 쪽이 활동 카드 세그먼트를 「현중 ↔ 근형 이체」 로 바꾼다.
 */

export function TransferCard({
  ledger,
  onShowTransfers,
}: {
  ledger: readonly SettlementLedgerRow[];
  onShowTransfers: () => void;
}) {
  const r = hgSum(ledger);
  const net = r.ghKrw - r.hgKrw;

  return (
    <section
      data-slot="settlement-transfer"
      className={cn(
        CARD,
        "min-w-0 p-3 ring-1 ring-inset ring-[var(--border-subtle)] dark:ring-0 @min-[768px]/settle:p-4",
      )}
    >
      <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-semibold text-[var(--fg)]">현중 ↔ 근형 계좌이체</span>
        <span className="text-[12px] font-normal text-[var(--muted-fg)]">실제로 오간 돈 · 소명용</span>
      </h2>

      <div className="text-[14px]">
        <Tr2Row label={<Labeled label="김현중 → 정근형" dim={`${r.hgCount}건`} />}>{formatEokManMinus(r.hgKrw)}</Tr2Row>
        <Tr2Row label={<Labeled label="정근형 → 김현중" dim={`${r.ghCount}건`} />}>{formatEokManMinus(r.ghKrw)}</Tr2Row>
        <Tr2Row label="차액" line>
          {net === 0 ? "0" : `${net > 0 ? "정근형" : "김현중"}이 ${formatEokMan(net)} 더 보냄`}
        </Tr2Row>
        {r.corpCount > 0 && (
          <Tr2Row label={<Labeled label="법인 용역으로 옮긴 돈" dim={`${r.corpCount}건 · 개인 이체 아님`} />}>
            {formatEokManMinus(r.corpKrw)}
          </Tr2Row>
        )}
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={onShowTransfers}
          className={cn("text-[12px] text-[var(--accent-fg)] hover:underline", SETTLE_HIT_44)}
        >
          이체 내역 보기
        </button>
      </div>
    </section>
  );
}

function Labeled({ label, dim }: { label: string; dim: string }) {
  return (
    <>
      {label} <span className="text-[12px] text-[var(--muted-fg)]">{dim}</span>
    </>
  );
}
