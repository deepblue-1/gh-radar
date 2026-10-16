"use client";

/**
 * MeAccountChips — /me 탭 위 계좌 칩 한 줄 (Phase 32 D-20 · 32-UI-SPEC S13 · 목업 ⑥ 변형 B).
 *
 * ① 왜 여기서 고르나
 *   네 탭(현황 · 잔고 · 주문 · 설정)이 같은 계좌를 따라야 「지금 보는 계좌」 와 「선택된 계좌」 가 어긋나지 않는다
 *   (사용자 2026-10-16 「탭 위에서 계좌를 고르고 그 계좌에 맞게 밑에 탭 내용이 나온다」). 칩 줄은 계정 카드 아래 ·
 *   탭 줄 위다.
 *
 * ② 왜 `tablist` 가 아니라 radiogroup 인가
 *   바로 아래가 탭 줄이다 — 칩 줄까지 탭이면 「탭 안 탭」 이 된다. 키보드 문법은 `ChoiceRow` 세그먼트와 같다:
 *   roving tabindex · ←/→ 는 이웃 칩으로 **포커스만**(끝에서 반대편으로 돈다) · Home/End 는 처음/끝 칩 ·
 *   Enter/Space/클릭이 고른다.
 *
 * ③ 값은 스스로 저장하지 않는다 — 호출부(`MeTabs`)가 상태를 쥐고 기기별로 저장한다(`writeMeAccount`).
 *   `locked` 는 32-09(설정 탭 저장 비행 중)가 건다 — 칩 클릭 · 키 선택이 무시된다.
 *
 * ④ 글자는 자르지 않는다(S13 long-text) — 칩은 `whitespace-nowrap` 이고 줄이 가로 스크롤된다(스크롤바 숨김).
 *   선택 칩이 줄 밖이면 마운트 때 `scrollIntoView({ inline: "nearest" })` 로 보이게 한다.
 */

import { useEffect, useRef, type KeyboardEvent } from "react";

import { accountChipLabelOf } from "@/lib/account-label";
import type { MeAccountChoice } from "@/lib/trading-layout";
import { cn } from "@/lib/utils";

export interface MeAccountChipsProps {
  choices: readonly MeAccountChoice[];
  /** 고른 계좌. 목록에 없으면 선택 칩이 없고 첫 칩이 탭 정지점이다. */
  accountNo: string;
  onChange: (accountNo: string) => void;
  /** 저장 비행 중 잠금(32-09) — `aria-disabled` · 흐림 · `title`. */
  locked?: boolean;
  lockedTitle?: string;
}

export function MeAccountChips({
  choices,
  accountNo,
  onChange,
  locked = false,
  lockedTitle,
}: MeAccountChipsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  /** 첫 선택 칩을 한 번 보이게 했는가 — 전환 때는 사용자가 이미 그 칩을 보고 있으니 다시 굴리지 않는다. */
  const revealed = useRef(false);

  // 마운트 직후 첫 선택(기본 선택은 부모 효과가 한 박자 뒤에 정한다) — 선택 칩이 줄 밖이면 보이게(S13 overflow).
  // jsdom 에는 scrollIntoView 가 없다.
  useEffect(() => {
    if (revealed.current) return;
    const on = rowRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    if (on === null || on === undefined) return;
    revealed.current = true;
    if (typeof on.scrollIntoView === "function") on.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [accountNo]);

  if (choices.length === 0) return null;

  const tabStop = choices.some((c) => c.accountNo === accountNo) ? accountNo : choices[0].accountNo;

  const pick = (next: string): void => {
    if (locked || next === accountNo) return;
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    let to: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (at + 1) % buttons.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (at - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[to]?.focus();
  };

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label="My page 계좌"
      aria-disabled={locked ? "true" : undefined}
      title={locked ? lockedTitle : undefined}
      data-slot="me-account-chips"
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-w-0 flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        locked && "opacity-[.45]",
      )}
    >
      {choices.map((c) => {
        const on = c.accountNo === accountNo;
        return (
          <button
            key={c.accountNo}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={accountChipLabelOf(c)}
            data-slot="me-account-chip"
            data-account-no={c.accountNo}
            tabIndex={c.accountNo === tabStop ? 0 : -1}
            onClick={() => pick(c.accountNo)}
            className={cn(
              "inline-flex h-8 flex-none items-center gap-1 rounded-full px-3 whitespace-nowrap",
              on
                ? "bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]"
                : "bg-[var(--muted)] text-[var(--muted-fg)]",
            )}
          >
            {c.name !== "" && (
              <span data-part="name" className="text-[12.5px] font-semibold">
                {c.name}
              </span>
            )}
            <span
              data-part="no"
              className={cn(
                "mono text-[11px] font-normal",
                on ? "text-[var(--seg-on-fg)] opacity-80" : "text-[var(--muted-fg)]",
              )}
            >
              {c.accountNo}
            </span>
            {c.serverKey !== undefined && c.serverKey !== "" && (
              <span
                data-part="server"
                className="mono inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--muted)] px-1.5 text-[10px] font-bold whitespace-nowrap text-[var(--fg-2)]"
              >
                {c.serverKey}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
