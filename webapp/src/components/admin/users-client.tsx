"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminServerResult, AdminUsersOverview } from "@gh-radar/shared";

import { CARD, ROW_DIVIDER, SECTION_COUNT, SECTION_TITLE } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminUsers } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AdminPanelPage } from "./admin-sheet";
import { PendingSection } from "./pending-section";
import { ADMIN_BUTTON_SECONDARY } from "./reflect-chip";
import { ServerOnlyRow, UserRow } from "./user-row";
import { UserCreateSheet } from "./user-create-sheet";
import { UserSheet } from "./user-sheet";

/**
 * UsersClient — `/admin/users` 본문 (Phase 29 D-14 · 목업 A · ADMIN-09).
 *
 * 헤더(「사용자」 · 「허용 gmail · 역할 · DMA 연결」 · 「+ 사용자」) → 「승인 대기 N」(있을 때만 · 역할 골라 승인 →
 * 재조회) → 「사용자 N」 카드(웹 사용자 행 + 「서버에만 있음」 행) → 목업 하단 안내 문장 2개. 데이터는 마운트 시 `GET /api/admin/users` 한 번이다(브라우저는 Supabase
 * 표를 직접 읽지 않는다 — D-07).
 *
 * - 로딩: 스켈레톤 행. 다시 읽을 때(쓰기 뒤 재조회)는 이전 목록을 그대로 두고 바꿔 끼운다 — 깜빡임 없음.
 * - 403: 「관리자만 사용할 수 있어요.」 한 줄(실제 차단은 middleware · Express 관문 — 여기는 설명뿐).
 * - 그 밖 오류: 「불러오지 못했어요」 + 다시 시도.
 * - 「+ 사용자」 → 생성 시트(`UserCreateSheet` — 29-19 · D-16). 성공하면 생성 시트를 닫고 재조회한 뒤 **만들어진 사용자의
 *   편집 시트를 열어** 생성 응답의 서버별 결과를 계좌 칩 초기값으로 넘긴다(결과 표시는 편집 시트 몫). 목록을 읽기 전에는
 *   레지스트리(등록 서버 후보)가 없으니 버튼은 비활성이다.
 * - 행을 누르면 `selected` 가 그 이메일이 되고 편집 시트(`UserSheet` — 29-17)가 열린다. 시트의 쓰기가 성공하면
 *   `load()` 로 다시 읽고, 시트는 재조회 결과에서 같은 이메일의 사용자로 내용을 바꿔 그린다(사라졌으면 닫힌다).
 *   시트는 이메일을 key 로 둔다 — 다른 사용자로 바꿔 열면 필드 저장 상태가 새로 시작한다.
 * - 데스크톱 시트는 비모달(29-31 · UI-REVIEW-2) — 시트를 연 채 다른 행을 누르면 그 사용자로 바뀐다. 편집 · 생성 시트는
 *   한 번에 하나만 연다(겹치지 않게 서로를 닫는다). 시트가 열린 동안 본문은 패널 폭을 비워(`AdminPanelPage` — 본문 폭
 *   784 이상) 목록 · 머리 「+ 사용자」 가 패널 왼쪽에 다 보인다(목업 A 「목록이 왼쪽에 남는다」).
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

export function UsersClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // 생성 응답의 서버별 결과 — 그 이메일의 편집 시트가 처음 열릴 때 칩 초기값으로 한 번 쓴다.
  const [created, setCreated] = useState<{ email: string; results: AdminServerResult[] } | null>(null);
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

  // 재조회 뒤에도 같은 이메일의 최신 행을 시트에 준다 — 목록에서 사라졌으면(삭제) 시트를 그리지 않는다.
  const selectedUser =
    state.kind === "ready" && selected !== null ? (state.data.users.find((u) => u.email === selected) ?? null) : null;

  // 데스크톱 시트는 비모달이라 시트를 연 채 다른 행을 누를 수 있다 — 생성 시트가 열려 있었으면 닫고 그 사용자로 바꾼다.
  const openUser = (email: string) => {
    setCreating(false);
    setSelected(email);
  };

  const retry = () => {
    setState({ kind: "loading" });
    void load();
  };

  // 편집 · 생성 시트 중 하나가 열려 있다 — 데스크톱이면 우측 패널이 본문 오른쪽 440 을 차지한다.
  const panelOpen = state.kind === "ready" && (creating || selectedUser !== null);

  return (
    <AdminPanelPage data-slot="admin-users" panelOpen={panelOpen}>
      <PageHeader
        title={ADMIN_USERS_TEXT.title}
        description={ADMIN_USERS_TEXT.description}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-slot="admin-users-create"
            disabled={state.kind !== "ready"}
            onClick={() => {
              // 데스크톱 시트는 비모달(목록 · 머리가 눌린다) — 편집 시트 위에 생성 시트가 겹치지 않게 하나만 연다.
              setSelected(null);
              setCreating(true);
            }}
            // 라이트 본문면(--surface)은 --muted 와 같은 색이라 흰 카드면으로 띄운다(검색 입력과 같은 결).
            className={cn(ADMIN_BUTTON_SECONDARY, "bg-[var(--card)] dark:bg-[var(--muted)]")}
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
              <Button type="button" size="sm" variant="secondary" onClick={retry} className={ADMIN_BUTTON_SECONDARY}>
                {ADMIN_USERS_TEXT.retry}
              </Button>
            </>
          )}
        </div>
      )}

      {state.kind === "ready" && creating && (
        <UserCreateSheet
          servers={state.data.servers}
          onCreated={(email, results) => {
            setCreating(false);
            setCreated(results && results.length > 0 ? { email, results } : null);
            setSelected(email);
            void load();
          }}
          onFailed={() => void load()}
          onClose={() => setCreating(false)}
        />
      )}

      {state.kind === "ready" && selectedUser && (
        <UserSheet
          key={selectedUser.email}
          user={selectedUser}
          servers={state.data.servers}
          initialResults={created?.email === selectedUser.email ? created.results : null}
          onChanged={() => void load()}
          onClose={() => {
            setSelected(null);
            setCreated(null);
          }}
        />
      )}

      {state.kind === "ready" && (
        <>
          <PendingSection pending={state.data.pending} onApproved={() => void load()} />
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
                  <UserRow user={user} selected={selected === user.email} onOpen={openUser} />
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
    </AdminPanelPage>
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
