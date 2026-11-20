"use client";

import {
  hgOf,
  sortLedgerRows,
  type SettlementCtx,
  type SettlementLedgerRow,
  type SettlementPerson,
  type SettlementPoolId,
  type SettlementSettleRow,
} from "@gh-radar/shared";

import { ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT } from "@/components/admin/role-segment";
import { CARD } from "@/components/layout/page-layout";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { LedgerRow } from "./ledger-row";
import { SettleRow } from "./settle-row";

/**
 * ActivityCard — 활동 카드(UI-SPEC ⑥ · 목업 `body()` 세그먼트 · `settleList` · `ledgerList` · D-17 · D-19 ~ D-22 · D-26 · D-27).
 *
 * - 카드 머리 자리 세그먼트 「정산 기록 · 계좌 거래 · 현중 ↔ 근형 이체」 셋뿐(D-21 — 고친 내역은 줄 펼침의 「고친 사람」 으로만). 그룹 접근 이름 「보기」.
 *   전환은 부르는 쪽(settlement-client)이 쥔 화면 안 상태 — 주소에 싣지 않는다.
 * - 정산 기록 = `ctx.settles`(응답이 이미 id 내림차순 = 확정 최신이 위) · 묶음별 가장 최근(그 묶음에서 가장 큰 id)만 취소 가능.
 * - 계좌 거래 = shared `sortLedgerRows`(날짜 내림차순 · 같은 날은 나중에 적은 줄이 위) · 이체 = 그중 `hgOf` 가 있는 줄(법인 용역 포함).
 * - 펼침 상태 · 「다시 반영」 진행 · 오류는 부르는 쪽이 쥔다(목록을 다시 불러와도 펼친 줄이 그대로).
 */

export type ActivitySegment = "settle" | "ledger" | "hg";

const SEGMENTS: readonly { value: ActivitySegment; label: string }[] = [
  { value: "settle", label: "정산 기록" },
  { value: "ledger", label: "계좌 거래" },
  { value: "hg", label: "현중 ↔ 근형 이체" },
];

/** 계좌 거래 줄 핸들러 — 「고치기」 · 「지우기」 는 44-10 이 단다(없으면 단추를 그리지 않는다). */
export interface LedgerHandlers {
  onEdit?: (row: SettlementLedgerRow) => void;
  onDelete?: (row: SettlementLedgerRow) => void;
  onRetry?: (id: number) => void;
  /** 「다시 반영」 을 보내는 중인 거래 id. */
  retryingId: number | null;
  /** 거래 id → 「다시 반영하지 못했어요 · …」. */
  retryErrors: Readonly<Record<number, string>>;
}

export interface ActivityCardProps {
  ctx: SettlementCtx;
  nowIso: string;
  segment: ActivitySegment;
  onSegment: (segment: ActivitySegment) => void;
  openSettle: ReadonlySet<number>;
  openLedger: ReadonlySet<number>;
  onToggleSettle: (id: number) => void;
  onToggleLedger: (id: number) => void;
  ledgerHandlers: LedgerHandlers;
  /** 「정산 취소」 — 44-11 이 단다. */
  onCancelSettle?: (settle: SettlementSettleRow) => void;
}

function isSegment(v: string): v is ActivitySegment {
  return v === "settle" || v === "ledger" || v === "hg";
}

export function ActivityCard({
  ctx,
  nowIso,
  segment,
  onSegment,
  openSettle,
  openLedger,
  onToggleSettle,
  onToggleLedger,
  ledgerHandlers,
  onCancelSettle,
}: ActivityCardProps) {
  return (
    <section
      data-slot="settlement-activity"
      className={cn(
        CARD,
        "min-w-0 p-3 ring-1 ring-inset ring-[var(--border-subtle)] dark:ring-0 @min-[768px]/settle:p-4",
      )}
    >
      <div className="mb-2 flex min-w-0">
        <ToggleGroup
          type="single"
          variant="outline"
          value={segment}
          aria-label="보기"
          onValueChange={(v) => {
            // 같은 칸을 다시 누르면 Radix 가 "" 를 준다 — 선택 해제는 없다(늘 하나).
            if (isSegment(v) && v !== segment) onSegment(v);
          }}
          className={cn(ADMIN_SEGMENT_ROOT, "max-w-full overflow-x-auto [scrollbar-width:none]")}
        >
          {SEGMENTS.map((s) => (
            <ToggleGroupItem key={s.value} value={s.value} className={cn(ADMIN_SEGMENT_ITEM, "shrink-0 whitespace-nowrap")}>
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div data-slot="settlement-activity-list">
        {segment === "settle" ? (
          <SettleList
            ctx={ctx}
            nowIso={nowIso}
            open={openSettle}
            onToggle={onToggleSettle}
            onCancel={onCancelSettle}
          />
        ) : (
          <LedgerList
            ctx={ctx}
            nowIso={nowIso}
            onlyHg={segment === "hg"}
            open={openLedger}
            onToggle={onToggleLedger}
            handlers={ledgerHandlers}
          />
        )}
      </div>
    </section>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p data-slot="settlement-activity-empty" className="py-6 text-center text-[12px] text-[var(--muted-fg)]">
      {children}
    </p>
  );
}

function SettleList({
  ctx,
  nowIso,
  open,
  onToggle,
  onCancel,
}: {
  ctx: SettlementCtx;
  nowIso: string;
  open: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onCancel?: (settle: SettlementSettleRow) => void;
}) {
  if (ctx.settles.length === 0) return <Empty>아직 정산한 적이 없습니다</Empty>;

  // 묶음별 가장 최근 정산(가장 큰 id) — 차례로만 취소할 수 있다(D-17).
  const latest = new Map<SettlementPoolId, number>();
  for (const s of ctx.settles) latest.set(s.pool, Math.max(latest.get(s.pool) ?? s.id, s.id));

  return (
    <>
      {ctx.settles.map((s) => {
        const outsWho = ctx.ledger
          .filter((r) => r.settleId === s.id && r.who !== null)
          .map((r) => r.who as SettlementPerson);
        return (
          <SettleRow
            key={s.id}
            settle={s}
            outsWho={outsWho}
            isLatest={latest.get(s.pool) === s.id}
            open={open.has(s.id)}
            onToggle={() => onToggle(s.id)}
            nowIso={nowIso}
            onCancel={onCancel}
          />
        );
      })}
    </>
  );
}

function LedgerList({
  ctx,
  nowIso,
  onlyHg,
  open,
  onToggle,
  handlers,
}: {
  ctx: SettlementCtx;
  nowIso: string;
  onlyHg: boolean;
  open: ReadonlySet<number>;
  onToggle: (id: number) => void;
  handlers: LedgerHandlers;
}) {
  const rows = sortLedgerRows(ctx.ledger).filter((r) => !onlyHg || hgOf(r) !== null);
  if (rows.length === 0) return <Empty>거래가 없습니다</Empty>;

  return (
    <>
      {rows.map((r) => (
        <LedgerRow
          key={r.id}
          row={r}
          settle={r.settleId === null ? null : (ctx.settles.find((s) => s.id === r.settleId) ?? null)}
          open={open.has(r.id)}
          onToggle={() => onToggle(r.id)}
          nowIso={nowIso}
          onEdit={handlers.onEdit}
          onDelete={handlers.onDelete}
          onRetry={handlers.onRetry}
          retrying={handlers.retryingId === r.id}
          retryError={handlers.retryErrors[r.id] ?? null}
        />
      ))}
    </>
  );
}
