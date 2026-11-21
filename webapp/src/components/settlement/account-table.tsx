import {
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_MINUS,
  formatEokManMinus,
  formatEokManSigned,
  profitTone,
  settlementReadLabel,
  type SettlementAccKey,
  type SettlementSnapshotAccount,
} from "@gh-radar/shared";

import { cn } from "@/lib/utils";

/**
 * AccountTable — 계좌별 「예수금 · 넣은 돈 · 수익」 표(UI-SPEC ③ · 목업 `accTable`).
 *
 * ③ 「정산 전 수익」 카드 · ⑧ 정산하기 시트(44-11) · 정산 기록 펼침 「확정한 순간의 계좌」(44-09)가 함께 쓴다.
 *
 * - 4열 그리드(이름 · 예수금 · 넣은 돈 · 수익). 줄마다 `data-slot="settlement-acc-row"` 의 `display: contents` 래퍼 안에 칸 4개만 둔다.
 * - 예수금 null → 「미설정」(warn) · 수익 null → 「—」(`--faint`) · 넣은 돈은 음수 그대로 + `title` 「들어온 돈 … − 나간 돈 …」(D-24).
 * - 표 폭 전체 줄(`col-span-full`): 누적 줄(`cum`) → 못 읽음 줄(같은 읽은 시각끼리 한 줄 · D-04) → 서버 간 다름 줄 → 읽은 시각 줄(`readLine`).
 *   못 읽음 줄 끝은 지금 화면 「… 에 읽은 값이에요」 · 지난 정산(`mode="past"`) 「… 에 읽은 값으로 확정했어요」.
 * - 금액 표기는 shared 억 · 만 포매터만(`formatEokManMinus` · `formatEokManSigned`).
 */

const TONE_CLASS = { up: "text-[var(--up)]", down: "text-[var(--down)]" } as const;
const WARN_LINE = "col-span-full break-keep text-[var(--settle-warn-fg)]";

function labelOf(acc: SettlementAccKey): string {
  return SETTLEMENT_ACCOUNTS.find((a) => a.key === acc)?.label ?? acc;
}

export interface AccountTableProps {
  rows: SettlementSnapshotAccount[];
  /** 누적 줄 — 정산한 적 있는 묶음만(부르는 쪽이 판정). null 이면 줄 없음. */
  cum: { cumKrw: number; prevKrw: number } | null;
  /** now = 지금 화면 · past = 지난 정산 기록(못 읽음 줄 끝 문구가 다르다). */
  mode: "now" | "past";
  /** 읽은 시각 줄 원문(예 「예수금 읽은 시각 11/19 14:32」) — 없으면 줄 없음. */
  readLine?: string;
  /** 등록 서버마다 예수금이 달라 주문 서버 값으로 계산한 계좌. */
  mismatch?: SettlementAccKey[];
  /** 읽은 시각 라벨(오늘 · 어제 · M/D)의 기준 — 응답 `now`. */
  nowIso: string;
  /** 시트 · 확인 안 좁은 표 — 폭과 무관하게 칸 사이 8. */
  compact?: boolean;
}

export function AccountTable({ rows, cum, mode, readLine, mismatch, nowIso, compact }: AccountTableProps) {
  // 못 읽은 계좌 — 같은 읽은 시각끼리 한 줄(「교보 김현중 · 교보 정근형 — …」).
  const staleGroups: { when: string; names: string[] }[] = [];
  for (const r of rows) {
    if (!r.stale || r.readAt === null) continue;
    const when = settlementReadLabel(r.readAt, nowIso);
    const g = staleGroups.find((x) => x.when === when);
    if (g) g.names.push(labelOf(r.accKey));
    else staleGroups.push({ when, names: [labelOf(r.accKey)] });
  }
  const staleTail = mode === "past" ? "으로 확정했어요" : "이에요";

  const mismatchNames = rows.filter((r) => mismatch?.includes(r.accKey)).map((r) => labelOf(r.accKey));

  return (
    <div
      data-slot="settlement-acc-table"
      className={cn(
        "my-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-y-1 text-[12px]",
        compact ? "gap-x-2" : "gap-x-2 @min-[768px]/settle:gap-x-4",
      )}
    >
      <span aria-hidden="true" />
      <span className="whitespace-nowrap text-right text-[var(--faint)]">예수금</span>
      <span className="whitespace-nowrap text-right text-[var(--faint)]">넣은 돈</span>
      <span className="whitespace-nowrap text-right text-[var(--faint)]">수익</span>

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
                r.budgetKrw === null ? "text-[var(--settle-warn-fg)]" : "text-[var(--fg)]",
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

      {cum && (
        <span
          data-slot="settlement-acc-cum"
          className="col-span-full border-t border-[var(--border-subtle)] pt-2 text-right tabular-nums text-[var(--muted-fg)]"
        >
          누적 수익 {formatEokManSigned(cum.cumKrw)} · 이미 정산한 수익 {formatEokManMinus(cum.prevKrw)}
        </span>
      )}

      {staleGroups.map((g) => (
        <span key={g.when} data-slot="settlement-acc-stale" className={WARN_LINE}>
          {g.names.join(" · ")} — 매매 서버에서 못 읽어 {g.when} 에 읽은 값{staleTail}
        </span>
      ))}

      {mismatchNames.length > 0 && (
        <span data-slot="settlement-acc-mismatch" className={WARN_LINE}>
          {mismatchNames.join(" · ")} — 서버마다 예수금이 달라 주문 서버 값으로 계산했어요
        </span>
      )}

      {readLine && (
        <span data-slot="settlement-acc-read" className="col-span-full text-[var(--faint)]">
          {readLine}
        </span>
      )}
    </div>
  );
}
