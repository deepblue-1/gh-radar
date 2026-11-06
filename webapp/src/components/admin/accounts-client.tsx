"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminAccountMaster, AdminAccountsOverview, AdminUsersOverview, DmaBroker } from "@gh-radar/shared";
import { ChevronRight } from "lucide-react";

import { CARD, ROW_DIVIDER, SECTION_COUNT, SECTION_TITLE } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchAdminAccounts, fetchAdminUsers } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AccountMasterSheet, AccountMasterTitle } from "./account-master-sheet";
import { AdminPanelPage } from "./admin-sheet";
import { ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from "./reflect-chip";
import { ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT } from "./role-segment";
import { ROLE_CHIP_CLASS } from "./user-row";

/**
 * AccountsClient — `/admin/accounts` 본문 (quick 261106-lwu D-06 · 목업 ①).
 *
 * `users-client.tsx` 구조 그대로: 헤더(「계좌」 · 부제 · 「+ 계좌」) → 「계좌 N」 + 증권사 세그먼트(전체 · KB · 교보 + 개수) →
 * 카드 목록(행 = 배지 · 계좌번호 · 계좌명/「이름 없음」 · 지점 · 트레이더(교보 「해당 없음」) · 쓰는 사용자 DMA id 칩 또는 점선
 * 「연결 없음」 · ›) → 하단 안내 한 줄. 데이터는 마운트 시 `GET /api/admin/accounts` 한 번(브라우저는 표를 직접 읽지 않는다).
 *
 * - 로딩 스켈레톤 · 403 한 줄 · 그 밖 오류 다시 시도. 재조회 실패는 보이던 목록을 지우지 않는다(seq 가드 · users-client 와 같은 규칙).
 * - 행을 누르면 수정 시트, 「+ 계좌」 는 등록 시트 — 한 번에 하나(서로를 닫는다). 쓰기 성공 뒤 재조회하고, 시트는 같은 키
 *   (`${broker}|${accountNo}`)의 최신 행을 받는다(삭제로 사라졌으면 닫힌다). 시트는 그 키를 React key 로 둔다.
 * - quick 261106-ntl — 사용자 개요(`GET /api/admin/users`)를 계좌 목록과 **병렬로** 읽어 수정 시트에 내려 보낸다(쓰는 사용자 · 서버별
 *   예수금 · 수수료 · 매도세 · IP/MAC 표시). 개요 실패는 null 로 접는다 — 목록은 그대로 뜨고 시트의 그 값들만 「확인 전」. 재조회도 둘 다.
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminAccountsOverview; overview: AdminUsersOverview | null }
  | { kind: "error"; forbidden: boolean };

type Filter = "all" | DmaBroker;

export const ADMIN_ACCOUNTS_TEXT = {
  title: "계좌",
  description: "관리 계좌 등록 · 수정 · 삭제 — 사용자에게 연결은 「사용자」 메뉴에서",
  create: "+ 계좌",
  section: "계좌",
  filterAll: "전체",
  filterKb: "KB",
  filterKyobo: "교보",
  filterLabel: "증권사",
  usersLabel: "쓰는 사용자",
  noUsers: "연결 없음",
  notApplicable: "지점 · 트레이더 해당 없음",
  note: "연결 없음 계좌는 어느 서버에도 올라가 있지 않다 — 삭제할 수 있다.",
  empty: "등록된 계좌가 없어요.",
  forbidden: "관리자만 사용할 수 있어요.",
  loadFailed: "불러오지 못했어요",
  retry: "다시 시도",
} as const;

export const accountMasterKey = (a: Pick<AdminAccountMaster, "broker" | "accountNo">) => `${a.broker}|${a.accountNo}`;

/** 행 틀 — user-row.tsx 의 ROW_BOX · ROW_HOVER 와 같은 결(12px 16/20 · hover surface). */
const ROW_BOX = "flex w-full items-center gap-2.5 px-4 py-3 text-left sm:px-5";
const ROW_HOVER = "transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]";
const META = "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[var(--muted-fg)]";

function AccountRow({
  account,
  selected,
  onOpen,
}: {
  account: AdminAccountMaster;
  selected: boolean;
  onOpen: (key: string) => void;
}) {
  const T = ADMIN_ACCOUNTS_TEXT;
  const key = accountMasterKey(account);
  return (
    <button
      type="button"
      data-slot="admin-account-row"
      data-key={key}
      data-selected={selected ? "true" : undefined}
      aria-label={`${account.broker} ${account.accountNo} 편집`}
      onClick={() => onOpen(key)}
      className={cn(
        ROW_BOX,
        ROW_HOVER,
        selected && "bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] shadow-[inset_3px_0_0_var(--primary)]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[var(--fg)]">
          <AccountMasterTitle account={account} />
        </span>
        <span className={META}>
          {account.broker === "KB" ? (
            <span data-slot="admin-account-branch">
              지점 <b className="font-semibold text-[var(--fg-2)]">{account.branchNo}</b> · 트레이더{" "}
              <b className="font-semibold text-[var(--fg-2)]">{account.traderId}</b>
            </span>
          ) : (
            <span data-slot="admin-account-branch">{T.notApplicable}</span>
          )}
          <span aria-hidden="true">·</span>
          {account.users.length > 0 ? (
            <>
              <span>{T.usersLabel}</span>
              <span className="inline-flex flex-wrap gap-1">
                {account.users.map((u) => (
                  <span
                    key={u.dmaUserId}
                    data-slot="admin-account-user-chip"
                    className={cn(ADMIN_CHIP_BASE, ROLE_CHIP_CLASS.trader)}
                  >
                    {u.dmaUserId}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <span data-slot="admin-account-no-users" className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS.only)}>
              {T.noUsers}
            </span>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 flex-none text-[var(--faint)]" />
    </button>
  );
}

export function AccountsClient() {
  const T = ADMIN_ACCOUNTS_TEXT;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      // 사용자 개요는 수정 시트의 값 표시용일 뿐 — 실패해도 계좌 목록은 띄운다(null 로 접는다 · users-client 와 같은 꼴).
      const [data, overview] = await Promise.all([
        fetchAdminAccounts(),
        fetchAdminUsers().then(
          (r) => r,
          () => null,
        ),
      ]);
      if (seq.current === my) setState({ kind: "ready", data, overview });
    } catch (err) {
      if (seq.current !== my) return;
      const forbidden = err instanceof ApiClientError && err.status === 403;
      setState((prev) => (prev.kind === "ready" && !forbidden ? prev : { kind: "error", forbidden }));
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      // 언마운트 뒤 도착한 응답은 버린다 — 의도적으로 「그때의」 seq 를 올린다(DOM ref 아님).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++;
    };
  }, [load]);

  const accounts = state.kind === "ready" ? state.data.accounts : [];
  const selectedAccount = selected !== null ? (accounts.find((a) => accountMasterKey(a) === selected) ?? null) : null;
  const kbCount = accounts.filter((a) => a.broker === "KB").length;
  const shown = filter === "all" ? accounts : accounts.filter((a) => a.broker === filter);

  const openAccount = (key: string) => {
    setCreating(false);
    setSelected(key);
  };

  const retry = () => {
    setState({ kind: "loading" });
    void load();
  };

  const panelOpen = state.kind === "ready" && (creating || selectedAccount !== null);

  return (
    <AdminPanelPage data-slot="admin-accounts" panelOpen={panelOpen}>
      <PageHeader
        title={T.title}
        description={T.description}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-slot="admin-accounts-create"
            disabled={state.kind !== "ready"}
            onClick={() => {
              setSelected(null);
              setCreating(true);
            }}
            className={cn(ADMIN_BUTTON_SECONDARY, "bg-[var(--card)] dark:bg-[var(--muted)]")}
          >
            {T.create}
          </Button>
        }
      />

      {state.kind === "loading" && <ListSkeleton />}

      {state.kind === "error" && (
        <div
          data-slot="admin-accounts-error"
          role={state.forbidden ? undefined : "alert"}
          className={cn(CARD, "flex flex-wrap items-center gap-3 px-4 py-4 text-[length:var(--t-sm)]")}
        >
          {state.forbidden ? (
            <p className="text-[var(--muted-fg)]">{T.forbidden}</p>
          ) : (
            <>
              <p className="text-[var(--fg)]">{T.loadFailed}</p>
              <Button type="button" size="sm" variant="secondary" onClick={retry} className={ADMIN_BUTTON_SECONDARY}>
                {T.retry}
              </Button>
            </>
          )}
        </div>
      )}

      {state.kind === "ready" && creating && (
        <AccountMasterSheet
          mode="create"
          accounts={accounts}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
          onClose={() => setCreating(false)}
        />
      )}

      {state.kind === "ready" && selectedAccount && (
        <AccountMasterSheet
          key={accountMasterKey(selectedAccount)}
          mode="edit"
          account={selectedAccount}
          overview={state.overview}
          onSaved={() => void load()}
          onDeleted={() => {
            setSelected(null);
            void load();
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {state.kind === "ready" && (
        <>
          <section aria-labelledby="admin-accounts-title" data-slot="admin-accounts-list" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1">
              <h2 id="admin-accounts-title" className={SECTION_TITLE}>
                {T.section}
              </h2>
              <span data-slot="admin-accounts-count" className={SECTION_COUNT}>
                {accounts.length}
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={filter}
                aria-label={T.filterLabel}
                onValueChange={(v) => {
                  if (v === "all" || v === "KB" || v === "KYOBO") setFilter(v);
                }}
                className={cn(ADMIN_SEGMENT_ROOT, "ml-auto")}
              >
                <ToggleGroupItem value="all" className={ADMIN_SEGMENT_ITEM}>
                  {T.filterAll} {accounts.length}
                </ToggleGroupItem>
                <ToggleGroupItem value="KB" className={ADMIN_SEGMENT_ITEM}>
                  {T.filterKb} {kbCount}
                </ToggleGroupItem>
                <ToggleGroupItem value="KYOBO" className={ADMIN_SEGMENT_ITEM}>
                  {T.filterKyobo} {accounts.length - kbCount}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            {shown.length > 0 ? (
              <ul className={cn(CARD, "m-0 list-none overflow-hidden p-0")}>
                {shown.map((a) => (
                  <li key={accountMasterKey(a)} className={ROW_DIVIDER}>
                    <AccountRow account={a} selected={selected === accountMasterKey(a)} onOpen={openAccount} />
                  </li>
                ))}
              </ul>
            ) : (
              <p
                data-slot="admin-accounts-empty"
                className={cn(CARD, "px-4 py-4 text-[length:var(--t-sm)] text-[var(--muted-fg)]")}
              >
                {T.empty}
              </p>
            )}
          </section>
          <p data-slot="admin-accounts-note" className="px-1 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]">
            {T.note}
          </p>
        </>
      )}
    </AdminPanelPage>
  );
}

function ListSkeleton() {
  return (
    <div
      data-slot="admin-accounts-loading"
      aria-busy="true"
      aria-label="불러오는 중"
      className={cn(CARD, "skeleton-list flex flex-col")}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      ))}
    </div>
  );
}
