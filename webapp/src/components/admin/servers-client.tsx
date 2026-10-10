"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminServersOverview, AdminServerView, DmaBroker } from "@gh-radar/shared";

import { CARD, PAGE_WRAP, SECTION_TITLE } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAdminServers, setOrderServer, setQuotePrimary } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ADMIN_BUTTON_SECONDARY } from "./reflect-chip";
import { ServerCard } from "./server-card";
import { ServerSheet } from "./server-sheet";
import { useFieldSave, type FieldSave } from "./use-field-save";

/**
 * ServersClient — `/admin/servers` 본문 (Phase 29 D-09 · D-10 · D-17 · 목업 A · ADMIN-10).
 *
 * 헤더(「서버」 · 「레지스트리 N대 · 주문/시세 서버」 · 「+ 서버」) → 증권사 섹션(「KB」 · 「교보」 순 · 우측 「주문 서버는
 * 증권사 안에서 1대」) → 서버 카드(폰 1열 · 640 이상 2열 — 앱 셸 레벨 뷰포트 브레이크포인트) → 목업 하단 안내 문장.
 * 데이터는 마운트 시 `GET /api/admin/servers` 한 번이다(브라우저는 Supabase 표를 직접 읽지 않는다 — D-07).
 *
 * - 「주문 서버」 라디오 = 증권사마다 `useFieldSave` 1개(29-17 결) — 누르는 즉시 `PUT …/order-server` 1건, 비행 중 다시
 *   누르면 마지막 값만 대기. 성공 → 재조회(역할 칩이 옮겨 간다). 실패 → 라디오가 서버 값으로 돌아가고 누른 카드에
 *   한 줄(서버 message 원문 — 토스트 없음). 주문 서버를 바꿔도 열린 세션은 그대로다(D-10 — relay 몫).
 * - 「시세 주 서버」 라디오 = 전체 1개(`useFieldSave` 1개) — `PUT …/quote-primary` 1건. relay 가 break-then-make 로
 *   실행하고 DB 도 relay 가 바꾼다(D-11 · 29-23). 응답 전에는 누른 카드가 「전환 중」 이고 모든 시세 라디오가 잠긴다
 *   (대기열 없음 — 전환은 겹치면 안 된다). 실패(relay 409 — 새 서버 로그인 실패 · 되돌림)면 라디오가 원래 서버로 돌아가고
 *   누른 카드에 relay message 원문 한 줄.
 * - 사용 토글 · 확인 다이얼로그는 카드 몫(`ServerCard`). 카드 탭 → 편집 시트, 「+ 서버」 → 추가 시트(`ServerSheet`).
 *   시트는 재조회 결과에서 같은 키의 서버를 다시 받는다(사라졌으면 닫힌다).
 * - 재조회 실패는 보이던 카드를 지우지 않는다 — 첫 조회 실패만 오류 화면.
 */

type SheetState = { mode: "create" } | { mode: "edit"; key: string } | null;

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: AdminServersOverview }
  | { kind: "error"; forbidden: boolean };

export const ADMIN_SERVERS_TEXT = {
  title: "서버",
  description: (count: number) => `레지스트리 ${count}대 · 주문/시세 서버`,
  create: "+ 서버",
  groupNote: "주문 서버는 증권사 안에서 1대",
  note:
    "시세 주 서버는 증권사와 무관하게 전체 1대. 바꾸면 relay 가 예전 연결을 닫고 새 서버에 붙는다(전환 중 시세 배지 적색). " +
    "주문 서버를 바꾸면 열린 세션은 그대로, 새 로그인부터 적용.",
  forbidden: "관리자만 사용할 수 있어요.",
  loadFailed: "불러오지 못했어요",
  retry: "다시 시도",
  switchFailed: "전환하지 못했어요",
} as const;

/** 섹션 · 시트의 증권사 표기 — 목업 A 「KB」 · 「교보」. */
export const SERVER_BROKER_LABEL: Readonly<Record<DmaBroker, string>> = { KB: "KB", KYOBO: "교보" };

/** 서버 · relay 가 준 한국어 message 원문 그대로(D-11 「relay message 그대로」). */
export function rawErrorText(err: unknown, fallback: string = ADMIN_SERVERS_TEXT.switchFailed): string {
  return err instanceof ApiClientError && err.message ? err.message : fallback;
}

export function ServersClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [sheet, setSheet] = useState<SheetState>(null);
  // 늦게 도착한 옛 응답이 새 응답을 덮지 않게 — 마지막 요청만 반영한다.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const data = await fetchAdminServers();
      if (seq.current === my) setState({ kind: "ready", data });
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

  const reload = useCallback(() => void load(), [load]);

  // 시세 주 서버 — 전체 1개. 누른 카드는 실패 한 줄 · 「전환 중」 의 자리다.
  const [quoteTarget, setQuoteTarget] = useState<string | null>(null);
  const quote = useFieldSave<string>(
    async (key) => {
      await setQuotePrimary(key);
    },
    {
      onSuccess: () => reload(),
      describeError: (err) => rawErrorText(err),
      // IN-03 — 성공 뒤 재조회가 오면 누른 값을 놓는다(relay 보정 · 다른 Admin 변경이 라디오에 보인다).
      releaseOn: state.kind === "ready" ? state.data : null,
    },
  );
  const quoteServerKey =
    state.kind === "ready"
      ? (state.data.groups.flatMap((g) => g.servers).find((s) => s.isQuotePrimary)?.key ?? null)
      : null;
  const quoteKey = quote.value ?? quoteServerKey;
  const onQuote = (key: string) => {
    if (quote.state === "saving") return;
    setQuoteTarget(key);
    quote.run(key);
  };

  const editServer =
    state.kind === "ready" && sheet?.mode === "edit"
      ? (state.data.groups.flatMap((g) => g.servers).find((s) => s.key === sheet.key) ?? null)
      : null;

  const retry = () => {
    setState({ kind: "loading" });
    void load();
  };

  const total = state.kind === "ready" ? state.data.groups.reduce((n, g) => n + g.servers.length, 0) : null;

  return (
    <div data-slot="admin-servers" className={PAGE_WRAP}>
      <PageHeader
        title={ADMIN_SERVERS_TEXT.title}
        description={total === null ? undefined : ADMIN_SERVERS_TEXT.description(total)}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-slot="admin-servers-create"
            disabled={state.kind !== "ready"}
            onClick={() => setSheet({ mode: "create" })}
            className={cn(ADMIN_BUTTON_SECONDARY, "bg-[var(--card)] dark:bg-[var(--muted)]")}
          >
            {ADMIN_SERVERS_TEXT.create}
          </Button>
        }
      />

      {state.kind === "loading" && <CardsSkeleton />}

      {state.kind === "error" && (
        <div
          data-slot="admin-servers-error"
          role={state.forbidden ? undefined : "alert"}
          className={cn(CARD, "flex flex-wrap items-center gap-3 px-4 py-4 text-[length:var(--t-sm)]")}
        >
          {state.forbidden ? (
            <p className="text-[var(--muted-fg)]">{ADMIN_SERVERS_TEXT.forbidden}</p>
          ) : (
            <>
              <p className="text-[var(--fg)]">{ADMIN_SERVERS_TEXT.loadFailed}</p>
              <Button type="button" size="sm" variant="secondary" onClick={retry} className={ADMIN_BUTTON_SECONDARY}>
                {ADMIN_SERVERS_TEXT.retry}
              </Button>
            </>
          )}
        </div>
      )}

      {state.kind === "ready" && (
        <>
          {state.data.groups.map((group) => (
            <BrokerSection
              key={group.broker}
              broker={group.broker}
              servers={group.servers}
              quote={quote}
              quoteKey={quoteKey}
              quoteTarget={quoteTarget}
              onQuote={onQuote}
              onEdit={(key) => setSheet({ mode: "edit", key })}
              onChanged={reload}
            />
          ))}
          <p
            data-slot="admin-servers-note"
            className="px-1 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]"
          >
            {ADMIN_SERVERS_TEXT.note}
          </p>
        </>
      )}

      {sheet?.mode === "create" && <ServerSheet mode="create" onSaved={reload} onClose={() => setSheet(null)} />}
      {editServer && (
        <ServerSheet key={editServer.key} mode="edit" server={editServer} onSaved={reload} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

interface BrokerSectionProps {
  broker: DmaBroker;
  servers: AdminServerView[];
  /** 시세 주 서버 필드(전체 1개 — ServersClient 소유). */
  quote: FieldSave<string>;
  /** 화면이 그릴 시세 주 서버(의도). */
  quoteKey: string | null;
  /** 마지막으로 누른 시세 카드. */
  quoteTarget: string | null;
  onQuote: (key: string) => void;
  onEdit: (key: string) => void;
  onChanged: () => void;
}

/** 증권사 섹션 1개 — 그 증권사의 「주문 서버」 필드(useFieldSave 1개)를 가진다. */
function BrokerSection({ broker, servers, quote, quoteKey, quoteTarget, onQuote, onEdit, onChanged }: BrokerSectionProps) {
  // 누른 카드 — 실패 한 줄을 그 카드에 단다(useFieldSave 는 실패 시 값을 비운다).
  const [orderTarget, setOrderTarget] = useState<string | null>(null);
  const order = useFieldSave<string>(
    async (key) => {
      await setOrderServer(key);
    },
    {
      onSuccess: () => onChanged(),
      describeError: (err) => rawErrorText(err),
      // IN-03 — 재조회마다 새 배열(그 증권사 서버 목록). 성공 뒤 첫 재조회가 정본.
      releaseOn: servers,
    },
  );
  const orderKey = order.value ?? servers.find((s) => s.isOrderServer)?.key ?? null;
  const titleId = `admin-servers-${broker}`;

  return (
    <section aria-labelledby={titleId} data-slot="admin-servers-group" data-broker={broker} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1">
        <h2 id={titleId} className={SECTION_TITLE}>
          {SERVER_BROKER_LABEL[broker]}
        </h2>
        <span className="ml-auto text-[12px] text-[var(--muted-fg)]">{ADMIN_SERVERS_TEXT.groupNote}</span>
      </div>
      <div data-slot="admin-servers-cards" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {servers.map((server) => (
          <ServerCard
            key={server.key}
            server={server}
            orderChecked={orderKey === server.key}
            quoteChecked={quoteKey === server.key}
            orderFlash={order.state === "flash"}
            quoteSwitching={quote.state === "saving" && quoteTarget === server.key}
            quoteLocked={quote.state === "saving"}
            error={
              (order.state === "error" && orderTarget === server.key ? order.error : null) ??
              (quote.state === "error" && quoteTarget === server.key ? quote.error : null)
            }
            onOrder={(key) => {
              setOrderTarget(key);
              order.run(key);
            }}
            onQuote={onQuote}
            onEdit={onEdit}
            onChanged={onChanged}
          />
        ))}
      </div>
    </section>
  );
}

function CardsSkeleton() {
  return (
    <div data-slot="admin-servers-loading" aria-busy="true" aria-label="불러오는 중" className="flex flex-col gap-2">
      <Skeleton className="mx-1 h-4 w-10" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={cn(CARD, "flex flex-col gap-2 px-3.5 py-3")}>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-8 w-52 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
