"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminUsersOverview } from "@gh-radar/shared";

import {
  CARD,
  PAGE_WRAP,
  ROW_DIVIDER,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminUsers } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ServerOnlyRow, UserRow } from "./user-row";

/**
 * UsersClient — `/admin/users` 본문 (Phase 29 D-14 · 목업 A · ADMIN-09).
 *
 * 헤더(「사용자」 · 「허용 gmail · 역할 · DMA 연결」 · 「+ 사용자」) → 「사용자 N」 카드(웹 사용자 행 + 「서버에만
 * 있음」 행) → 목업 하단 안내 문장 2개. 데이터는 마운트 시 `GET /api/admin/users` 한 번이다(브라우저는 Supabase
 * 표를 직접 읽지 않는다 — D-07).
 *
 * - 로딩: 스켈레톤 행. 다시 읽을 때(쓰기 뒤 재조회)는 이전 목록을 그대로 두고 바꿔 끼운다 — 깜빡임 없음.
 * - 403: 「관리자만 사용할 수 있어요.」 한 줄(실제 차단은 middleware · Express 관문 — 여기는 설명뿐).
 * - 그 밖 오류: 「불러오지 못했어요」 + 다시 시도.
 * - 「+ 사용자」 는 29-19(생성 시트)가 `onCreate` 로 잇는다 — 그 전에는 비활성.
 * - 행을 누르면 `selected` 가 그 이메일이 된다 — 편집 시트(29-17)가 이 상태를 읽어 `AdminSheet` 를 연다.
 */

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminUsersOverview }
  | { kind: "error"; forbidden: boolean };

export const ADMIN_USERS_TEXT = {
  title: "사용자",
  description: "허용 gmail · 역할 · DMA 연결",
  create: "+ 사용자",
  usersSection: "사용자",
  chipLegend: "서버 칩 = 그 서버 users.toml 반영 상태",
  notePreregister: "사전 등록: 「+ 사용자」 로 gmail 만 먼저 넣어 두면 가입 즉시 열린다.",
  noteServerOnly: "「서버에만 있음」 행은 편집 불가 — 보기만.",
  forbidden: "관리자만 사용할 수 있어요.",
  loadFailed: "불러오지 못했어요",
  retry: "다시 시도",
} as const;

export interface UsersClientProps {
  /** 「+ 사용자」 — 29-19 가 생성 시트로 잇는다. 없으면 버튼 비활성. */
  onCreate?: () => void;
}

export function UsersClient({ onCreate }: UsersClientProps = {}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  // 늦게 도착한 옛 응답이 새 응답을 덮지 않게 — 마지막 요청만 반영한다.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const data = await fetchAdminUsers();
      if (seq.current === my) setState({ kind: "ready", data });
    } catch (err) {
      if (seq.current !== my) return;
      const forbidden = err instanceof ApiClientError && err.status === 403;
      setState((prev) =>
        // 재조회 실패는 보이던 목록을 지우지 않는다 — 첫 조회 실패만 오류 화면.
        prev.kind === "ready" && !forbidden ? prev : { kind: "error", forbidden },
      );
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

  const retry = () => {
    setState({ kind: "loading" });
    void load();
  };

  return (
    <div data-slot="admin-users" className={PAGE_WRAP}>
      <PageHeader
        title={ADMIN_USERS_TEXT.title}
        description={ADMIN_USERS_TEXT.description}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-slot="admin-users-create"
            disabled={onCreate === undefined}
            onClick={onCreate}
            className="font-semibold"
          >
            {ADMIN_USERS_TEXT.create}
          </Button>
        }
      />

      {state.kind === "loading" && <ListSkeleton />}

      {state.kind === "error" && (
        <div
          data-slot="admin-users-error"
          role={state.forbidden ? undefined : "alert"}
          className={cn(CARD, "flex flex-wrap items-center gap-3 px-4 py-4 text-[length:var(--t-sm)]")}
        >
          {state.forbidden ? (
            <p className="text-[var(--muted-fg)]">{ADMIN_USERS_TEXT.forbidden}</p>
          ) : (
            <>
              <p className="text-[var(--fg)]">{ADMIN_USERS_TEXT.loadFailed}</p>
              <Button type="button" size="sm" variant="secondary" onClick={retry}>
                {ADMIN_USERS_TEXT.retry}
              </Button>
            </>
          )}
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <section aria-labelledby="admin-users-title" data-slot="admin-users-list" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1">
              <h2 id="admin-users-title" className={SECTION_TITLE}>
                {ADMIN_USERS_TEXT.usersSection}
              </h2>
              <span data-slot="admin-users-count" className={SECTION_COUNT}>
                {state.data.users.length + state.data.serverOnly.length}
              </span>
              <span className="ml-auto text-[12px] text-[var(--muted-fg)]">{ADMIN_USERS_TEXT.chipLegend}</span>
            </div>
            <ul className={cn(CARD, "m-0 list-none overflow-hidden p-0")}>
              {state.data.users.map((user) => (
                <li key={user.email} className={ROW_DIVIDER}>
                  <UserRow user={user} selected={selected === user.email} onOpen={setSelected} />
                </li>
              ))}
              {state.data.serverOnly.map((entry) => (
                <li key={`dma:${entry.dmaUserId}`} className={ROW_DIVIDER}>
                  <ServerOnlyRow entry={entry} />
                </li>
              ))}
            </ul>
          </section>
          <p
            data-slot="admin-users-note"
            className="px-1 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]"
          >
            {ADMIN_USERS_TEXT.notePreregister} {ADMIN_USERS_TEXT.noteServerOnly}
          </p>
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div
      data-slot="admin-users-loading"
      aria-busy="true"
      aria-label="불러오는 중"
      className={cn(CARD, "skeleton-list flex flex-col")}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-3 sm:px-5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
