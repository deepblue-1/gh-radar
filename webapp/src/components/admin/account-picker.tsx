"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminAccountMaster, DmaBroker } from "@gh-radar/shared";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * AccountPicker — 등록된 계좌(마스터)에서 하나 고르기 (quick 261106-lwu D-09 · D-10 · 목업 ④⑤ 연결 방식 A).
 *
 * 검색칸(계좌번호 · 계좌명) + 라디오 목록(배지 · 계좌번호 · 계좌명/「이름 없음」 · 오른쪽 쓰는 사용자 DMA id 또는 「연결 없음」) +
 * 「목록에 없으면 「계좌」 에서 등록」 링크(/admin/accounts). **계좌 고르기만 한다** — 등록 서버 체크 · 연결/취소 버튼은 부모 몫
 * (사용자 시트 「+ 계좌 연결」 = AccountEditor 의 연결 폼 · 사용자 만들기 「첫 계좌」 = DmaConnectFields).
 *
 * - 제외 판정은 부모가 predicate 로 준다(이미 이 사용자에게 있는 계좌) — 피커가 account-editor 를 import 하지 않게(순환 방지).
 * - `accounts === null` = 계좌 목록을 못 읽음(users-client 가 실패를 null 로 접는다) — 사용자 목록은 그대로 뜨고 피커만 한 줄.
 * - ui 에 radio-group 이 없어 네이티브 `input type="radio"` 를 쓴다(새 의존성 금지).
 */

export const ACCOUNT_PICKER_TEXT = {
  search: "계좌번호 · 계좌명 검색",
  empty: "연결할 수 있는 계좌가 없어요",
  noMatch: "검색에 맞는 계좌가 없어요",
  loadFailed: "계좌 목록을 불러오지 못했어요",
  registerPrefix: "목록에 없으면",
  registerLink: "「계좌」 에서 등록",
  noUsers: "연결 없음",
  noName: "이름 없음",
} as const;

/** 증권사 배지 — 목업 `.bk`(account-editor 카드 · /admin/accounts 행 · 피커가 같은 모양). */
export const BROKER_BADGE = "rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--fg-2)]";
/** 화면 표기 — 교보는 한글(목업). */
export const BROKER_LABEL: Readonly<Record<DmaBroker, string>> = { KB: "KB", KYOBO: "교보" };

/** 계좌 마스터 키 — (증권사, 정규화 번호). 마스터 accountNo 는 이미 정규화값이다. */
export const masterKeyOf = (a: Pick<AdminAccountMaster, "broker" | "accountNo">) => `${a.broker}|${a.accountNo}`;

/** 검색 — 빈 검색은 전부 · 계좌번호 부분 일치 · 계좌명 부분 일치(대소문자 무시). */
export function matchesAccountQuery(account: Pick<AdminAccountMaster, "accountNo" | "name">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return account.accountNo.toLowerCase().includes(q) || account.name.toLowerCase().includes(q);
}

export interface AccountPickerProps {
  /** 계좌 마스터 목록 — null 이면 못 읽음. */
  accounts: readonly AdminAccountMaster[] | null;
  /** 고른 계좌 키(`masterKeyOf`) — 없으면 null. */
  selectedKey: string | null;
  onSelect: (account: AdminAccountMaster) => void;
  /** 후보에서 뺄 계좌(이미 이 사용자에게 있는 계좌 등). */
  isExcluded?: (account: AdminAccountMaster) => boolean;
  /** 머리 글자 — 「계좌 연결」 · 「첫 계좌」. 라디오 묶음의 접근 이름. */
  title: string;
  /** 라디오 name · 입력 id 접두(한 화면에 둘이 동시에 있어도 겹치지 않게). */
  idPrefix: string;
  disabled?: boolean;
  className?: string;
}

const OPTION =
  "flex min-h-9 cursor-pointer items-center gap-2 px-3 py-2 text-[13px] text-[var(--fg)] [&+&]:border-t [&+&]:border-[var(--border-subtle)] has-checked:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)] has-disabled:cursor-default";
const NOTE = "text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";

export function AccountPicker({
  accounts,
  selectedKey,
  onSelect,
  isExcluded,
  title,
  idPrefix,
  disabled = false,
  className,
}: AccountPickerProps) {
  const T = ACCOUNT_PICKER_TEXT;
  const [query, setQuery] = useState("");
  const candidates = accounts === null ? [] : accounts.filter((a) => !isExcluded?.(a));
  const shown = candidates.filter((a) => matchesAccountQuery(a, query));

  return (
    <div data-slot="account-picker" className={cn("flex flex-col gap-2", className)}>
      <div className="text-[12px] font-semibold text-[var(--muted-fg)]">{title}</div>
      {accounts === null ? (
        <p data-slot="account-picker-failed" role="alert" className={cn(NOTE, "text-[var(--destructive)]")}>
          {T.loadFailed}
        </p>
      ) : candidates.length === 0 ? (
        <p data-slot="account-picker-empty" className={NOTE}>
          {T.empty}
        </p>
      ) : (
        <>
          <Input
            type="search"
            id={`${idPrefix}-search`}
            aria-label={T.search}
            placeholder={T.search}
            autoComplete="off"
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 text-[13px]"
          />
          {shown.length === 0 ? (
            <p data-slot="account-picker-no-match" className={NOTE}>
              {T.noMatch}
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-label={title}
              data-slot="account-picker-options"
              className="max-h-64 overflow-y-auto rounded-[10px] border border-[var(--border-subtle)]"
            >
              {shown.map((a) => {
                const key = masterKeyOf(a);
                return (
                  <label key={key} data-slot="account-picker-option" data-key={key} className={OPTION}>
                    <input
                      type="radio"
                      name={`${idPrefix}-account`}
                      value={key}
                      aria-label={`${BROKER_LABEL[a.broker]} ${a.accountNo}${a.name ? ` ${a.name}` : ""}`}
                      checked={selectedKey === key}
                      disabled={disabled}
                      onChange={() => onSelect(a)}
                      className="size-4 flex-none accent-[var(--primary)]"
                    />
                    <span className={BROKER_BADGE}>{BROKER_LABEL[a.broker]}</span>
                    <b className="shrink-0 font-semibold tabular-nums">{a.accountNo}</b>
                    {a.name ? (
                      <span className="min-w-0 truncate text-[var(--muted-fg)]">{a.name}</span>
                    ) : (
                      <span className="min-w-0 truncate text-[var(--faint)]">{T.noName}</span>
                    )}
                    <span data-slot="account-picker-who" className="ml-auto flex-none pl-2 text-[12px] text-[var(--muted-fg)]">
                      {a.users.length > 0 ? a.users.map((u) => u.dmaUserId).join(" · ") : T.noUsers}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
      <p className={NOTE}>
        {T.registerPrefix}{" "}
        <Link href="/admin/accounts" data-slot="account-picker-register" className="font-semibold text-[var(--primary)] hover:underline">
          {T.registerLink}
        </Link>
      </p>
    </div>
  );
}
