"use client";

/**
 * Phase 14 Plan 10 — 대화목록 (C10 좌 pane, CHAT-01, D-13).
 *
 * /chat 전용 대화 관리 표면. FAB 시트는 목록 없이 현재-대화만 유지(D-13)하므로 목록/필터/
 * 삭제 UI 는 이 페이지에만 존재한다.
 *
 * ## 구성
 * - 상단: 종목 필터 select(전체 / 종목별) + `＋ 새 대화` 버튼.
 * - 목록: listConversations 결과를 updatedAt desc 로 렌더(제목 + 종목 배지 pill + 타임스탬프).
 *   active 대화는 `--accent` 배경 + `aria-current="true"`(접근성 계약).
 * - 각 항목의 🗑(aria-label="대화 삭제") → DeleteConversationDialog 오픈.
 *
 * ## 종목 필터(D-13)
 * select 옵션은 최초 전체 조회 결과의 distinct stockCode 에서 파생한다. 필터 변경 시
 * listConversations(stockCode) 로 재조회(전체는 undefined). 종목별 대화 히스토리 탐색.
 *
 * 서버가 본인(user_id) 대화만 반환(WHERE user_id) → 클라 목록은 본인 것만(T-14-01b).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { ConversationRow } from "@gh-radar/shared";

import { listConversations } from "@/lib/chat-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { DeleteConversationDialog } from "./delete-conversation-dialog";

const ALL = "all";

export interface ConversationListProps {
  /** 현재 선택된 대화 id — active 하이라이트 + aria-current 대상. */
  activeId: string | null;
  /** 대화 선택 → 부모가 getConversation 으로 messages 로드. */
  onSelect: (id: string) => void;
  /** `＋ 새 대화` — 부모가 conversationId/messages 초기화. */
  onNew: () => void;
  /** 삭제 성공 시 삭제된 대화 id — 활성 대화면 부모가 새 대화로 리셋. */
  onDeleted?: (id: string) => void;
  /** 외부 변경(새 대화 생성 등) 반영용 refresh 트리거. 값이 바뀌면 목록 재조회. */
  refreshKey?: number;
}

/** 타임스탬프 → 간결한 한글 날짜 캡션(월/일). */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  onDeleted,
  refreshKey = 0,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [stockFilter, setStockFilter] = useState<string>(ALL);
  // 필터 옵션은 전체 조회 결과에서만 갱신(필터링된 조회는 옵션 축소를 유발하지 않음).
  const [stockOptions, setStockOptions] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<ConversationRow | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const code = stockFilter === ALL ? undefined : stockFilter;

    void (async () => {
      try {
        const rows = await listConversations(code);
        if (cancelled) return;
        // updatedAt desc — ISO 문자열 사전식 역정렬.
        const sorted = [...rows].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
        setConversations(sorted);
        if (stockFilter === ALL) {
          const codes = Array.from(
            new Set(
              rows
                .map((r) => r.stockCode)
                .filter((c): c is string => Boolean(c)),
            ),
          );
          setStockOptions(codes);
        }
      } catch {
        if (!cancelled) setConversations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stockFilter, refreshKey]);

  const handleDeleted = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setPendingDelete(null);
      onDeleted?.(id);
    },
    [onDeleted],
  );

  const options = useMemo(
    () => [{ value: ALL, label: "전체" }, ...stockOptions.map((c) => ({ value: c, label: c }))],
    [stockOptions],
  );

  return (
    <div className="flex h-full flex-col">
      {/* 상단: 종목 필터 + 새 대화 */}
      <div className="flex items-center gap-[var(--s-2)] border-b border-[var(--border)] p-[var(--s-3)]">
        <label className="sr-only" htmlFor="conversation-stock-filter">
          종목 필터
        </label>
        <select
          id="conversation-stock-filter"
          aria-label="종목 필터"
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
          className="h-8 flex-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] px-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--fg)]"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" size="sm" onClick={onNew}>
          ＋ 새 대화
        </Button>
      </div>

      {/* 목록 */}
      <ul
        aria-label="대화 목록"
        className="flex-1 overflow-y-auto p-[var(--s-2)]"
      >
        {conversations.map((c) => {
          const active = c.id === activeId;
          return (
            <li
              key={c.id}
              className="group relative flex items-stretch gap-[var(--s-1)]"
            >
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(c.id)}
                className={`flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--r-md)] px-[var(--s-2)] py-[var(--s-2)] text-left ${
                  active
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "hover:bg-[var(--muted)]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-[var(--s-2)]">
                  <span className="truncate text-[length:var(--t-sm)] font-semibold">
                    {c.title?.trim() || "새 대화"}
                  </span>
                  {c.stockCode && (
                    <Badge variant="secondary" className="shrink-0 font-mono">
                      {c.stockCode}
                    </Badge>
                  )}
                </span>
                <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {formatTimestamp(c.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                aria-label="대화 삭제"
                onClick={() => setPendingDelete(c)}
                className="flex shrink-0 items-center rounded-[var(--r-md)] px-[var(--s-1)] text-[var(--muted-fg)] opacity-0 hover:bg-[var(--muted)] hover:text-[var(--destructive)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <DeleteConversationDialog
        conversation={pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
