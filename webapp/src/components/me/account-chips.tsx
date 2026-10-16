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
 *   바로 아래가 탭 줄이다 — 칩 줄까지 탭이면 「탭 안 탭」 이 된다. 키보드 문법 = WAI-ARIA radio group:
 *   roving tabindex · ←/→/↑/↓ 는 이웃 칩으로 포커스를 옮기며 **그 칩을 고른다**(끝에서 반대편으로 돈다) ·
 *   Home/End 는 처음/끝 칩을 고른다 · Enter/Space/클릭도 고른다 · 잠금(③)이면 화살표는 포커스만.
 *   `ChoiceRow` 와 갈리는 이유: ChoiceRow 는 선택 = relay 전송이라 화살표가 포커스만이지만, 계좌 칩 선택은 로컬
 *   상태(기기별 기억 · 작업대 스코프)라 왕복이 없어 WAI-ARIA 기본을 따른다(IN-02 · quick-261016-udz).
 *
 * ③ 값은 스스로 저장하지 않는다 — 호출부(`MeTabs`)가 상태를 쥐고 기기별로 저장한다(`writeMeAccount`).
 *   `locked` 는 32-09(설정 탭 저장 비행 중)가 건다 — 칩 클릭 · 키 선택이 무시된다(화살표는 포커스만 옮긴다).
 *
 * ④ 글자는 자르지 않는다(S13 long-text) — 칩은 `whitespace-nowrap` 이고 줄이 가로 스크롤된다(스크롤바 숨김).
 *   선택 칩이 줄 밖이면 마운트 때 `scrollIntoView({ inline: "nearest" })` 로 보이게 한다.
 *
 * ⑤ 작업대 상단 줄도 이 칩을 쓴다(32-15 · 사용자 2026-10-16 「계좌선택을 콤보로 하지 말고 칩으로」).
 *   그룹 이름 · `title` · 슬롯만 쓰는 곳이 정한다. `compact` 면 칩 글자가 「상품명 · 서버키」 로 줄고 번호를 뺀다 —
 *   단 상품명이 비었거나 같은 상품명 ∧ 같은 서버키 계좌가 또 있으면 상품명 대신 번호를 쓴다(`accountShortLabelOf` ·
 *   사이드바 소제목과 같은 규칙). 접근 이름은 줄여도 전체 글자(`accountChipLabelOf`) 그대로다.
 *   `compact === null` = 쓰는 곳이 폭을 아직 모른다 → 작업대 `wb` 컨테이너 680 미만이면 CSS 가 줄인다(첫 페인트 폴백 ·
 *   상단 줄 세그먼트의 `hidden @min-[680px]/wb:inline-flex` 와 같은 경계).
 */

import { useEffect, useRef, type KeyboardEvent } from "react";

import { accountChipLabelOf, accountShortLabelOf, type AccountLabelInput } from "@/lib/account-label";
import { cn } from "@/lib/utils";

/** 「줄인 칩」 에서 빠질 부분 — `compact` true 면 렌더하지 않고, null 이면 `wb` < 680 에서 CSS 로 숨긴다(⑤). */
const COMPACT_FALLBACK_HIDDEN = "@max-[680px]/wb:hidden";

export interface MeAccountChipsProps {
  /** `/me` 는 `MeAccountChoice` · 작업대는 `RelayAccount` 를 그대로 넘긴다(둘 다 이 모양을 만족한다). */
  choices: readonly AccountLabelInput[];
  /** 고른 계좌. 목록에 없으면 선택 칩이 없고 첫 칩이 탭 정지점이다. */
  accountNo: string;
  onChange: (accountNo: string) => void;
  /** 저장 비행 중 잠금(32-09) — `aria-disabled` · 흐림 · `title`. */
  locked?: boolean;
  lockedTitle?: string;
  /** radiogroup 접근 이름(기본 「My page 계좌」). */
  label?: string;
  /** 잠금이 아닐 때 그룹 `title`(작업대 — 스코프 설명). */
  title?: string;
  /** 그룹 · 칩 `data-slot`(기본 `me-account-chips` · `me-account-chip`). */
  slot?: string;
  chipSlot?: string;
  /** 줄인 칩(⑤) — true 「상품명 · 서버키」 · false 전체 · null 작업대 `wb` 폭 CSS 폴백. */
  compact?: boolean | null;
}

export function MeAccountChips({
  choices,
  accountNo,
  onChange,
  locked = false,
  lockedTitle,
  label = "My page 계좌",
  title,
  slot = "me-account-chips",
  chipSlot = "me-account-chip",
  compact = false,
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
    const target = buttons[to];
    target?.focus();
    // 포커스 이동 = 선택(② · IN-02). 잠금 · 같은 계좌는 pick 가드가 무시한다.
    const next = target?.dataset.accountNo;
    if (next !== undefined) pick(next);
  };

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label={label}
      aria-disabled={locked ? "true" : undefined}
      title={locked ? lockedTitle : title}
      data-slot={slot}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-w-0 flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        locked && "opacity-[.45]",
      )}
    >
      {choices.map((c) => {
        const on = c.accountNo === accountNo;
        const name = c.name ?? "";
        // 줄인 칩(⑤)에서 상품명 · 번호 중 하나만 남긴다 — 구분이 안 되면 번호(사이드바 소제목 규칙).
        const byNumber = compact !== false && accountShortLabelOf(c, choices).isNumber;
        const dropName = byNumber ? compact : false;
        const dropNo = compact !== false && !byNumber ? compact : false;
        return (
          <button
            key={c.accountNo}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={accountChipLabelOf(c)}
            data-slot={chipSlot}
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
            {name !== "" && dropName !== true && (
              <span
                data-part="name"
                className={cn("text-[12.5px] font-semibold", dropName === null && COMPACT_FALLBACK_HIDDEN)}
              >
                {name}
              </span>
            )}
            {dropNo !== true && (
              <span
                data-part="no"
                className={cn(
                  "mono text-[11px] font-normal",
                  on ? "text-[var(--seg-on-fg)] opacity-80" : "text-[var(--muted-fg)]",
                  dropNo === null && COMPACT_FALLBACK_HIDDEN,
                )}
              >
                {c.accountNo}
              </span>
            )}
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
