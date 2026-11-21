"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_PEOPLE,
  SETTLEMENT_POOLS,
  addEffects,
  carryBasisLabel,
  carryShown,
  cumProfit,
  formatEokMan,
  formatEokManSigned,
  isSettlementMarketHours,
  poolAccountRows,
  profitTone,
  reflectEffect,
  settledSum,
  settlementReadLabel,
  settlePlan,
  type SettlementCtx,
  type SettlementPerson,
  type SettlementPoolId,
  type SettlementSettleBody,
  type SettlementView,
} from "@gh-radar/shared";

import { AdminSheet } from "@/components/admin/admin-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { AccountTable } from "./account-table";
import { PersonDot } from "./open-pools-card";
import { ReflectBox, reflectPreviewLines } from "./reflect-box";

/**
 * Phase 44 — 「정산하기」 시트(⑧ · UI-SPEC ⑧ · E8 · D-09 · D-15 · D-16 · D-25 · D-27 · 규칙 3 · 4).
 *
 * - 본문 순서(목업 `sheetHtml` settle · D-27): 정산 묶음 알약 → 정산 전 수익(큰 숫자 + 계좌 표 + 읽은 시각 + 장중 줄)
 *   → 나누기 상자 + 뺄 계좌 줄 → (바로 출금이 있을 때만) ⑩ 상자 → 메모. 기간 줄은 없다.
 *   확정할 수 없으면 나누기 · ⑩ · 메모 자리에 문단 상자 하나 + 「정산 확정」 비활성.
 * - 계산은 shared `settlePlan(pool, ctx, outs)` 한 줄 — server 확정과 같은 함수다. 화면이 몫 · 금액을 새로 만들지 않는다.
 * - 확정 바디는 `{ pool, outs, memo, reflect, expectPrev }` 뿐(D-16 · Pitfall 5) — 수익 · 몫 숫자는 보내지 않는다.
 *   확정 숫자의 정본은 server 가 누른 순간 읽은 예수금이다.
 * - 열린 동안 `view` 가 새 값으로 바뀌면(부르는 쪽의 열 때 다시 읽기) 표 · 큰 숫자 · 읽은 시각이 조용히 바뀐다 —
 *   묶음 · 바로 출금 · 스위치 · 메모는 그대로 둔다. 처음 값으로 돌리는 것은 닫혔다 열릴 때뿐이다.
 * - 쥬니 정산 전 수익이 정확히 0 이면 shared 는 `block: "carry"` · `carryKrw: 0` 을 돌려준다 — 「원금 4억까지 0 남았습니다」 는
 *   뜻이 없어 「나눌 수익이 없습니다.」 로 말한다(44-11 결정 · 만으로 내린 값이 0 인 경우까지 — shared `carryShown`).
 *   이월 기준은 shared `carryBasisLabel` — 지난 정산이 있으면 「지난 정산 수준까지」 · 없으면 「원금 <넣은 돈 합>까지」(IN-02).
 * - 열릴 때 첫 포커스: `AdminSheet` 가 `onOpenAutoFocus` 를 받지 않아 Radix 기본(머리 × 버튼)이다(44-10 과 같은 한계 · 공용 골격은 손대지 않음).
 */

export const SETTLE_SHEET_TEXT = {
  title: "정산하기",
  pool: "정산 묶음",
  profit: "정산 전 수익 · 확정을 누른 순간의 예수금으로 정해요",
  won: "원",
  readAt: "예수금 읽은 시각",
  market: "체결 중이라 값이 움직이고 있어요",
  splitTail: "지금 뺄 사람만 「바로 출금」",
  out: "바로 출금",
  outAccounts: "뺄 계좌 — ",
  outFloor: "금액은 만원 미만을 버리고 적어요",
  memo: "메모",
  unset: "예수금이 설정되지 않은 계좌가 있어요. 계좌 메뉴에서 설정한 뒤 정산할 수 있어요.",
  none: "나눌 수익이 없습니다.",
  cancel: "취소",
  confirm: "정산 확정",
  confirmFailed: "정산을 확정하지 못했어요",
} as const;

const T = SETTLE_SHEET_TEXT;

const POOL_ORDER: readonly SettlementPoolId[] = ["p1", "p2"];
const TONE_CLASS = { up: "text-[var(--up)]", down: "text-[var(--down)]" } as const;
const LABEL = "text-[length:var(--t-caption)] leading-[1.5] text-[var(--muted-fg)]";
const CAPTION = "text-[length:var(--t-caption)] leading-[1.5]";
const FOOT_BUTTON = "h-11 flex-1 text-[14px] font-semibold";

export interface SettleSheetProps {
  open: boolean;
  /** 응답 — 열 때 다시 읽기가 오면 부르는 쪽이 새 값으로 바꿔 넘긴다. */
  view: SettlementView;
  /** 응답 `now` — 읽은 시각 라벨(오늘 · 어제 · M/D)의 기준. */
  nowIso: string;
  onClose: () => void;
  /** 확정 — 거부하면 시트가 하단 오류 줄을 보인다. 성공 뒤 닫기 · 세그먼트 · 다시 불러오기는 부르는 쪽 몫. */
  onConfirm: (body: SettlementSettleBody) => Promise<void>;
}

function poolMembers(pool: SettlementPoolId): SettlementPerson[] {
  return Object.keys(SETTLEMENT_POOLS[pool].ratio) as SettlementPerson[];
}

function accLabel(acc: string): string {
  return SETTLEMENT_ACCOUNTS.find((a) => a.key === acc)?.label ?? acc;
}

/** 그 묶음 가장 최근 정산 id(D-16 `expectPrev`) — 없으면 null. */
function latestSettleId(view: SettlementView, pool: SettlementPoolId): number | null {
  let best: number | null = null;
  for (const s of view.settles) if (s.pool === pool && (best === null || s.id > best)) best = s.id;
  return best;
}

export function SettleSheet({ open, view, nowIso, onClose, onConfirm }: SettleSheetProps) {
  const [pool, setPool] = useState<SettlementPoolId>("p1");
  const [outs, setOuts] = useState<SettlementPerson[]>([]);
  const [reflect, setReflect] = useState(true);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열 때마다 처음 값으로 — view 가 바뀌는 것으로는 돌리지 않는다(열린 채 다시 읽기 · 선택 유지).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPool("p1");
      setOuts([]);
      setReflect(true);
      setMemo("");
      setBusy(false);
      setError(null);
    }
  }

  const memoId = useId();
  const ctx: SettlementCtx = { accounts: view.accounts, ledger: view.ledger, settles: view.settles };
  const plan = settlePlan(pool, ctx, outs);
  const def = SETTLEMENT_POOLS[pool];
  const ok = plan.block !== "unset";
  const tone = plan.openKrw === null ? null : profitTone(plan.openKrw);

  const rows = poolAccountRows(pool, view.accounts, view.ledger);
  const prev = settledSum(pool, view.settles);
  const mismatch = view.accounts.filter((a) => a.pool === pool && a.mismatch).map((a) => a.accKey);
  let readAt: string | null = null;
  for (const r of rows) if (r.readAt !== null && (readAt === null || Date.parse(r.readAt) > Date.parse(readAt))) readAt = r.readAt;
  const marketHours = isSettlementMarketHours(new Date());

  const lines =
    plan.outs.length > 0
      ? reflectPreviewLines(
          addEffects(
            plan.outs.map((o) =>
              reflectEffect({ kind: "withdraw_profit", fromAcc: o.fromAcc, toAcc: null, amountKrw: o.amountKrw }),
            ),
          ),
          view.accounts,
        )
      : [];

  const pickPool = (next: SettlementPoolId) => {
    if (busy || next === pool) return;
    setPool(next);
    setOuts([]);
  };

  const toggleOut = (p: SettlementPerson) => {
    if (busy) return;
    setOuts((cur) => {
      const on = cur.includes(p);
      return poolMembers(pool).filter((x) => (x === p ? !on : cur.includes(x)));
    });
  };

  const submit = async () => {
    if (busy || !plan.can) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        pool,
        outs,
        memo,
        reflect: outs.length > 0 ? reflect : false,
        expectPrev: latestSettleId(view, pool),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message ? `${T.confirmFailed} · ${message}` : T.confirmFailed);
    } finally {
      setBusy(false);
    }
  };

  let blockedText: ReactNode = null;
  if (!plan.can) {
    if (plan.block === "unset") blockedText = T.unset;
    else if (plan.block === "carry" && carryShown(plan.carryKrw))
      blockedText = (
        <>
          {`${carryBasisLabel(pool, view)}까지 `}
          <b className="font-semibold">{formatEokMan(plan.carryKrw)}</b>
          {` 남았습니다. 회복한 뒤부터 ${def.ratioLabel} 로 나눕니다.`}
        </>
      );
    else blockedText = T.none;
  }

  return (
    <AdminSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title={T.title}
      footer={
        <div className="flex w-full min-w-0 flex-col gap-2">
          {error && (
            <p
              role="alert"
              data-slot="settle-sheet-error"
              className={cn(CAPTION, "break-keep text-[var(--destructive)]")}
            >
              {error}
            </p>
          )}
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="secondary"
              data-slot="settle-sheet-cancel"
              className={FOOT_BUTTON}
              disabled={busy}
              onClick={onClose}
            >
              {T.cancel}
            </Button>
            <Button
              type="button"
              data-slot="settle-sheet-confirm"
              className={FOOT_BUTTON}
              aria-busy={busy}
              disabled={!plan.can || busy}
              onClick={() => void submit()}
            >
              {T.confirm}
            </Button>
          </div>
        </div>
      }
    >
      <div data-slot="settle-sheet" className="flex flex-col gap-4 pt-2">
        <div className="flex min-w-0 flex-col gap-2">
          <span className={LABEL}>{T.pool}</span>
          <PoolPills value={pool} locked={busy} onChange={pickPool} />
        </div>

        <div className="flex min-w-0 flex-col">
          <span data-slot="settle-profit-label" className={cn(LABEL, "break-keep")}>
            {T.profit}
          </span>
          <div
            data-slot="settle-profit"
            className="mt-1 whitespace-nowrap text-[length:var(--t-h2)] font-semibold leading-[1.2] tracking-[-0.02em] tabular-nums"
          >
            <span
              data-slot="settle-profit-value"
              className={ok ? (tone ? TONE_CLASS[tone] : "text-[var(--fg)]") : "text-[var(--faint)]"}
            >
              {ok && plan.openKrw !== null ? formatEokManSigned(plan.openKrw) : "—"}
            </span>
            <span
              data-slot="settle-profit-unit"
              className="ml-0.5 text-[length:var(--t-sm)] font-normal tracking-normal text-[var(--muted-fg)]"
            >
              {T.won}
            </span>
          </div>
          <AccountTable
            rows={rows}
            cum={ok && prev > 0 ? { cumKrw: cumProfit(pool, view.accounts, view.ledger), prevKrw: prev } : null}
            mode="now"
            mismatch={mismatch}
            readLine={readAt ? `${T.readAt} ${settlementReadLabel(readAt, nowIso)}` : undefined}
            nowIso={nowIso}
            compact
          />
          {marketHours && (
            <span data-slot="settle-market" className={cn(CAPTION, "break-keep text-[var(--led-latent)]")}>
              {T.market}
            </span>
          )}
        </div>

        {plan.can ? (
          <>
            <div className="flex min-w-0 flex-col gap-2">
              <span data-slot="settle-split-label" className={cn(LABEL, "break-keep")}>
                {`나누기 ${def.ratioLabel} · ${T.splitTail}`}
              </span>
              <div data-slot="settle-split" className="rounded-[12px] bg-[var(--muted)] px-4 py-1">
                {poolMembers(pool).map((p, i) => {
                  const on = outs.includes(p);
                  return (
                    <div
                      key={p}
                      data-slot="settle-split-row"
                      data-person={p}
                      className={cn(
                        "flex items-center justify-between gap-2 py-2 text-[length:var(--t-sm)]",
                        i > 0 && "border-t border-[var(--border-subtle)]",
                      )}
                    >
                      <span className="min-w-0 whitespace-nowrap text-[var(--fg)]">
                        <PersonDot person={p} />
                        {SETTLEMENT_PEOPLE[p].name}{" "}
                        <span className={cn(CAPTION, "text-[var(--muted-fg)]")}>{def.ratio[p]}%</span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <b className="whitespace-nowrap font-semibold tabular-nums text-[var(--fg)]">
                          {formatEokManSigned(plan.shares[p] ?? 0)}
                        </b>
                        <button
                          type="button"
                          data-slot="settle-out"
                          aria-pressed={on}
                          disabled={busy}
                          onClick={() => toggleOut(p)}
                          className={cn(
                            "inline-flex h-8 flex-none items-center rounded-full border px-3 text-[12px] font-semibold whitespace-nowrap transition-colors",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            on
                              ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
                              : "border-[var(--border-subtle)] bg-transparent text-[var(--muted-fg)]",
                          )}
                        >
                          {T.out}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              {plan.outs.length > 0 && (
                <p data-slot="settle-out-accounts" className={cn(CAPTION, "break-keep text-[var(--muted-fg)]")}>
                  {T.outAccounts}
                  {plan.outs.map((o) => `${SETTLEMENT_PEOPLE[o.who].name} ${accLabel(o.fromAcc)}`).join(" · ")}
                  {` · ${T.outFloor}`}
                </p>
              )}
            </div>

            {plan.outs.length > 0 && (
              <ReflectBox on={reflect} onToggle={setReflect} lines={lines} marketHours={marketHours} disabled={busy} />
            )}

            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor={memoId} className={LABEL}>
                {T.memo}
              </label>
              <Input
                id={memoId}
                data-slot="settle-memo"
                maxLength={100}
                autoComplete="off"
                value={memo}
                readOnly={busy}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div
            data-slot="settle-blocked"
            className="rounded-[12px] bg-[var(--muted)] px-4 py-3 text-[length:var(--t-sm)] leading-[1.5] break-keep text-[var(--fg)]"
          >
            {blockedText}
          </div>
        )}
      </div>
    </AdminSheet>
  );
}

/**
 * 정산 묶음 알약 — `role="radiogroup"`(이름 「정산 묶음」) · 알약 `role="radio" aria-checked` · 방향키로 옮긴 알약을 고른다.
 * 모양은 ⑦ 선택 알약과 같다(off `--muted` · on 테두리 `--fg` 600). 포커스 링 클래스는 새로 달지 않는다.
 */
function PoolPills({
  value,
  locked,
  onChange,
}: {
  value: SettlementPoolId;
  locked: boolean;
  onChange: (next: SettlementPoolId) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = POOL_ORDER.indexOf(value);
    let to: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (at + 1) % POOL_ORDER.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (at - 1 + POOL_ORDER.length) % POOL_ORDER.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = POOL_ORDER.length - 1;
    else return;
    e.preventDefault();
    if (locked) return;
    onChange(POOL_ORDER[to]!);
    rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[to]?.focus();
  };
  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label={T.pool}
      onKeyDown={onKeyDown}
      className="flex flex-wrap gap-2"
    >
      {POOL_ORDER.map((p) => {
        const on = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!locked && !on) onChange(p);
            }}
            className={cn(
              "inline-flex h-8 flex-none items-center rounded-full border px-3 text-[length:var(--t-sm)] whitespace-nowrap transition-colors",
              on
                ? "border-[var(--fg)] bg-transparent font-semibold text-[var(--fg)]"
                : "border-transparent bg-[var(--muted)] font-normal text-[var(--muted-fg)]",
            )}
          >
            {SETTLEMENT_POOLS[p].name}
          </button>
        );
      })}
    </div>
  );
}
