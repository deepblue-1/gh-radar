"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SettlementView } from "@gh-radar/shared";

import { AdminPanelPage } from "@/components/admin/admin-sheet";
import { ADMIN_BUTTON_SECONDARY } from "@/components/admin/reflect-chip";
import { CARD } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchSettlement } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { OpenPoolsCard } from "./open-pools-card";

/**
 * SettlementClient — `/admin/settlement` 본문 (Phase 44 · UI-SPEC ① · E1).
 *
 * - 데이터는 `GET /api/admin/settlement` 한 번(브라우저는 정산 표를 직접 읽지 않는다 · D-18). 화면 시각 계산의 기준은 응답 `now`.
 * - 상태 loading | error | forbidden | ready(accounts-client 꼴). 403 은 「관리자만 사용할 수 있어요.」(role 없음),
 *   그 밖 실패는 오류 상자(`role="alert"`) + 「다시 시도」 가 본문 전체를 대신한다.
 * - `reload()` = 저장 뒤 다시 불러오기 — 화면을 비우지 않고 값만 바꾼다. 실패하면 보이던 값을 그대로 둔다(seq 가드).
 * - 44-01 은 「정산 전 수익」 카드(최소)까지. 머리 두 버튼(「거래 기록」 · 「정산하기」)은 44-10 · 44-11 이 달고,
 *   사람 카드 · 명의 대 몫 · 활동 카드는 44-06 · 44-09 가 이 본문에 더한다.
 */

/**
 * 화면 문구. `forbidden` · `loadFailed` · `retry` 는 `ADMIN_ACCOUNTS_TEXT` 의 같은 키와 글자 그대로(UI-SPEC 「Error state」) —
 * 계좌 화면 모듈 전체를 이 화면 묶음에 끌어오지 않으려고 값을 옮겨 적고, 같음은 테스트가 잠근다.
 */
export const SETTLEMENT_TEXT = {
  title: "정산",
  docTitle: "정산 · Admin",
  loading: "불러오는 중",
  forbidden: "관리자만 사용할 수 있어요.",
  loadFailed: "불러오지 못했어요",
  retry: "다시 시도",
} as const;

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "forbidden" }
  | { kind: "ready"; view: SettlementView };

export function SettlementClient() {
  const T = SETTLEMENT_TEXT;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const view = await fetchSettlement();
      if (seq.current === my) setState({ kind: "ready", view });
    } catch (err) {
      if (seq.current !== my) return;
      const forbidden = err instanceof ApiClientError && err.status === 403;
      setState((prev) => (forbidden ? { kind: "forbidden" } : prev.kind === "ready" ? prev : { kind: "error" }));
    }
  }, []);

  useEffect(() => {
    document.title = T.docTitle;
  }, [T.docTitle]);

  useEffect(() => {
    void reload();
    return () => {
      // 언마운트 뒤 도착한 응답은 버린다 — 의도적으로 「그때의」 seq 를 올린다(DOM ref 아님).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++;
    };
  }, [reload]);

  const retry = () => {
    setState({ kind: "loading" });
    void reload();
  };

  return (
    <AdminPanelPage data-slot="admin-settlement" panelOpen={false} className="@container/settle gap-3">
      <PageHeader title={T.title} className="mb-1" />

      {state.kind === "loading" && <SettlementSkeleton />}

      {state.kind === "forbidden" && (
        <div
          data-slot="admin-settlement-error"
          className={cn(CARD, "px-4 py-4 text-[length:var(--t-sm)]")}
        >
          <p className="text-[var(--muted-fg)]">{T.forbidden}</p>
        </div>
      )}

      {state.kind === "error" && (
        <div
          data-slot="admin-settlement-error"
          role="alert"
          className={cn(CARD, "flex flex-wrap items-center gap-3 px-4 py-4 text-[length:var(--t-sm)]")}
        >
          <p className="text-[var(--fg)]">{T.loadFailed}</p>
          <Button type="button" size="sm" variant="secondary" onClick={retry} className={ADMIN_BUTTON_SECONDARY}>
            {T.retry}
          </Button>
        </div>
      )}

      {state.kind === "ready" && <OpenPoolsCard view={state.view} />}
    </AdminPanelPage>
  );
}

/** 첫 불러오기 자리 — 사람 카드 자리 3 + 표 카드 1(UI-SPEC E1 · accounts `ListSkeleton` 문법). */
function SettlementSkeleton() {
  return (
    <div
      data-slot="admin-settlement-loading"
      aria-busy="true"
      aria-label={SETTLEMENT_TEXT.loading}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 @min-[768px]/settle:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(CARD, "flex flex-col gap-2 p-4")}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-32 max-w-full" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        ))}
      </div>
      <div className={cn(CARD, "flex flex-col gap-2 p-4")}>
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </div>
  );
}
