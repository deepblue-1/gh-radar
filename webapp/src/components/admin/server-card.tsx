"use client";

import { useState } from "react";
import type { AdminServerLiveStatus, AdminServerView } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { patchAdminServer } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from "./reflect-chip";
import { useFieldSave } from "./use-field-save";

/**
 * ServerCard — `/admin/servers` 서버 1대 카드 (Phase 29 D-17 · 목업 A `cardsA()` · `chips()` · `roleChips()`).
 *
 * 구조(목업 `.card`): 머리 줄(키 · 역할 칩 「주문 서버」 · 「시세 주 서버」 · 사용 토글) → `host:port` → 상태 칩
 * (연결 · 저널 · admin · 유저 N) → 라디오 2종(「주문 서버」 증권사 안 1개 · 「시세 주 서버」 전체 1개 · 초록).
 *
 * - 라디오는 네이티브 `<input type="radio">` 다 — 같은 `name` 이 곧 배타 범위다(주문 = `order-<증권사>` · 시세 =
 *   `quote`). 카드가 흩어져 있어도 브라우저가 한 그룹으로 다룬다. 이미 켜진 라디오는 다시 눌러도 change 가 없다.
 * - 라디오가 그리는 값은 부모가 준 「의도」 다(비행 중이면 누른 값 · 실패면 서버 값) — 역할 칩은 서버 값(재조회)이다.
 * - 꺼진 서버는 주문/시세 라디오를 고를 수 없다(D-17).
 * - 사용 토글 = `PATCH { enabled }` 1건(useFieldSave). 주문/시세 서버는 끌 수 없다(토글 비활성 — 서버도 409
 *   `SERVER_IN_USE` 로 막고, 그 문구도 같은 한 줄로 보인다). 그 서버 87 에 유저가 1명 이상이면 끄기 전에 확인 1회 —
 *   끄면 relay 가 그 서버의 저널 · admin 연결을 내린다. 켜기와 유저 0 서버 끄기는 확인 없이 바로 보낸다.
 * - 카드 빈 곳을 누르면 편집 시트(`onEdit`)다 — 라디오 · 토글은 그 탭을 먹는다. 키뼈대 버튼이 키보드 진입점이다.
 * - 오류는 카드 안 한 줄(토스트 없음 — relay · 서버 message 원문).
 *
 * 색은 기존 토큰만: 주문 = `--primary`(목업 `.ch.role` · `.rad.on`) · 시세 = `--led-armed`(목업 `.ch.quote` · `.rad.q.on`).
 */

export type ServerChipTone = "ok" | "warn" | "err" | "dim";

export interface ServerStatusChip {
  /** 축 이름 — `data-axis`(conn · journal · admin · users · unknown). */
  axis: "conn" | "journal" | "admin" | "users" | "unknown";
  text: string;
  tone: ServerChipTone;
}

export const SERVER_CARD_TEXT = {
  orderRadio: "주문 서버",
  quoteRadio: "시세 주 서버",
  orderChip: "주문 서버",
  quoteChip: "시세 주 서버",
  switching: "전환 중",
  unknown: "상태 모름",
  enabled: "사용",
  inUse: "주문 서버 · 시세 주 서버는 끌 수 없어요",
  confirmTitle: (key: string) => `${key} 사용을 끌까요?`,
  confirmBody: (users: number) => `운영 중 서버에 유저 ${users}명 — 끄면 저널 · admin 연결을 내린다`,
  confirmCancel: "취소",
  confirmOff: "끄기",
  toggleFailed: "바꾸지 못했어요",
} as const;

/** 칩 톤 → 면 · 글자색. dim = 목업 `.ch.dim`(muted 면 · 흐린 글자). */
export const SERVER_CHIP_TONE: Readonly<Record<ServerChipTone, string>> = {
  ok: ADMIN_TONE_CLASS.ok,
  warn: ADMIN_TONE_CLASS.warn,
  err: ADMIN_TONE_CLASS.err,
  dim: "bg-[var(--muted)] text-[var(--muted-fg)]",
};

const ORDER_CHIP = "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]";
const QUOTE_CHIP = ADMIN_TONE_CLASS.ok;

const CONN: Record<AdminServerLiveStatus["conn"], Omit<ServerStatusChip, "axis">> = {
  ok: { text: "연결", tone: "ok" },
  down: { text: "연결 끊김", tone: "err" },
  off: { text: "연결 꺼짐", tone: "dim" },
};
const JOURNAL: Record<AdminServerLiveStatus["journal"], Omit<ServerStatusChip, "axis">> = {
  ok: { text: "저널", tone: "ok" },
  down: { text: "저널 끊김", tone: "err" },
  off: { text: "저널 꺼짐", tone: "dim" },
};
const ADMIN: Record<AdminServerLiveStatus["admin"], Omit<ServerStatusChip, "axis">> = {
  ok: { text: "admin", tone: "ok" },
  connecting: { text: "admin 재접속 중", tone: "warn" },
  down: { text: "admin 끊김", tone: "err" },
  off: { text: "admin 꺼짐", tone: "dim" },
};

/**
 * 상태 칩 한 벌(목업 `chips()`). relay 상태가 없으면(조회 실패 · 항목 없음) 연결 · 저널 · admin 대신 「상태 모름」 한 칩 —
 * 모르는 것을 「끊김」 으로 그리지 않는다. 「유저 N」 은 DB(87 스냅샷) 값이라 늘 있다.
 */
export function serverStatusChips(status: AdminServerLiveStatus | null, userCount: number): ServerStatusChip[] {
  const users: ServerStatusChip = { axis: "users", text: `유저 ${userCount}`, tone: "dim" };
  if (status === null) return [{ axis: "unknown", text: SERVER_CARD_TEXT.unknown, tone: "dim" }, users];
  return [
    { axis: "conn", ...CONN[status.conn] },
    { axis: "journal", ...JOURNAL[status.journal] },
    { axis: "admin", ...ADMIN[status.admin] },
    users,
  ];
}

/** 목업 `.rad` — 알약 + 원. 켜짐은 테두리 · 원 · 점이 주문 = primary / 시세 = led-armed. */
const RADIO_PILL =
  "relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 text-[12.5px] text-[var(--fg-2)] select-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45";
const RADIO_DOT = "grid size-3.5 flex-none place-items-center rounded-full border-[1.5px] border-[var(--faint)]";

interface RoleRadioProps {
  kind: "order" | "quote";
  name: string;
  serverKey: string;
  checked: boolean;
  disabled: boolean;
  flash?: boolean;
  onSelect: () => void;
}

function RoleRadio({ kind, name, serverKey, checked, disabled, flash = false, onSelect }: RoleRadioProps) {
  const label = kind === "order" ? SERVER_CARD_TEXT.orderRadio : SERVER_CARD_TEXT.quoteRadio;
  const on = kind === "order" ? "border-[var(--primary)]" : "border-[var(--led-armed)]";
  const dot = kind === "order" ? "bg-[var(--primary)]" : "bg-[var(--led-armed)]";
  return (
    <label
      data-slot={`server-${kind}-radio`}
      data-checked={checked ? "true" : undefined}
      className={cn(RADIO_PILL, checked && on, flash && "text-[var(--led-armed)]")}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="radio"
        name={name}
        value={serverKey}
        aria-label={`${serverKey} ${label}`}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.checked) onSelect();
        }}
        className="sr-only"
      />
      <span aria-hidden="true" className={cn(RADIO_DOT, checked && on)}>
        {checked && <span className={cn("size-[7px] rounded-full", dot)} />}
      </span>
      {label}
    </label>
  );
}

export interface ServerCardProps {
  server: AdminServerView;
  /** 화면이 그릴 「주문 서버」 라디오 — 부모의 의도 값(비행 중이면 누른 값). */
  orderChecked: boolean;
  /** 화면이 그릴 「시세 주 서버」 라디오. */
  quoteChecked: boolean;
  /** 주문 서버 저장 성공 플래시(0.7초). */
  orderFlash?: boolean;
  /** 이 카드로 시세 주 서버를 바꾸는 중 — 「전환 중」 칩 · aria-busy. */
  quoteSwitching?: boolean;
  /** 시세 전환 비행 중 — 모든 카드의 시세 라디오를 잠근다. */
  quoteLocked?: boolean;
  /** 카드 안 한 줄 오류(주문 · 시세 전환 실패 — 서버 message 원문). */
  error?: string | null;
  onOrder: (key: string) => void;
  /** 없으면 시세 라디오 비활성. */
  onQuote?: (key: string) => void;
  /** 카드 탭 → 편집 시트. */
  onEdit?: (key: string) => void;
  /** 사용 토글 저장 성공 → 재조회. 없으면 토글 비활성. */
  onChanged?: () => void;
}

export function ServerCard({
  server,
  orderChecked,
  quoteChecked,
  orderFlash = false,
  quoteSwitching = false,
  quoteLocked = false,
  error = null,
  onOrder,
  onQuote,
  onEdit,
  onChanged,
}: ServerCardProps) {
  const chips = serverStatusChips(server.status, server.userCount);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toggle = useFieldSave<boolean>(
    async (enabled) => {
      await patchAdminServer(server.key, { enabled });
    },
    {
      onSuccess: () => onChanged?.(),
      describeError: (err) =>
        err instanceof ApiClientError && err.message ? err.message : SERVER_CARD_TEXT.toggleFailed,
    },
  );
  const enabled = toggle.value ?? server.enabled;
  // 라디오는 서버가 켜졌다고 확인한 뒤에만 — 켜기 비행 중 주문 서버로 고르면 서버가 SERVER_DISABLED 로 거부한다.
  const off = !server.enabled || !enabled;
  // 주문/시세 서버(서버 값이든 누른 의도든)는 끌 수 없다.
  const inUse = server.isOrderServer || server.isQuotePrimary || orderChecked || quoteChecked;

  const onToggle = (next: boolean) => {
    if (!next && server.userCount > 0) {
      setConfirmOpen(true);
      return;
    }
    toggle.run(next);
  };

  return (
    <>
    <div
      data-slot="server-card"
      data-key={server.key}
      data-enabled={server.enabled ? "true" : "false"}
      aria-busy={quoteSwitching || undefined}
      onClick={() => onEdit?.(server.key)}
      className={cn(
        "flex min-w-0 flex-col rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card)] px-3.5 py-3",
        onEdit && "cursor-pointer",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          data-slot="server-card-edit"
          aria-label={`${server.key} 편집`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(server.key);
          }}
          className="min-w-0 truncate rounded-[4px] text-left text-[16px] font-bold text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
        >
          {server.key}
        </button>
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {server.isOrderServer && (
            <span data-slot="server-role-chip" data-role="order" className={cn(ADMIN_CHIP_BASE, ORDER_CHIP)}>
              {SERVER_CARD_TEXT.orderChip}
            </span>
          )}
          {server.isQuotePrimary && (
            <span data-slot="server-role-chip" data-role="quote" className={cn(ADMIN_CHIP_BASE, QUOTE_CHIP)}>
              {SERVER_CARD_TEXT.quoteChip}
            </span>
          )}
          {quoteSwitching && (
            <span data-slot="server-switching" className={cn(ADMIN_CHIP_BASE, SERVER_CHIP_TONE.warn)}>
              {SERVER_CARD_TEXT.switching}
            </span>
          )}
        </span>
        <span className="ml-auto flex flex-none items-center" onClick={(e) => e.stopPropagation()}>
          <Switch
            data-slot="server-enabled"
            aria-label={`${server.key} ${SERVER_CARD_TEXT.enabled}`}
            title={inUse ? SERVER_CARD_TEXT.inUse : undefined}
            checked={enabled}
            disabled={inUse || onChanged === undefined}
            onCheckedChange={onToggle}
          />
        </span>
      </div>

      <div data-slot="server-addr" className="mt-0.5 truncate text-[12.5px] text-[var(--muted-fg)] tabular-nums">
        {server.host}:{server.port}
      </div>

      <div data-slot="server-status" className="mt-2 flex flex-wrap gap-[5px]">
        {chips.map((c) => (
          <span
            key={c.axis}
            data-slot="server-status-chip"
            data-axis={c.axis}
            data-tone={c.tone}
            className={cn(ADMIN_CHIP_BASE, SERVER_CHIP_TONE[c.tone])}
          >
            {c.text}
          </span>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <RoleRadio
          kind="order"
          name={`order-${server.broker}`}
          serverKey={server.key}
          checked={orderChecked}
          disabled={off}
          flash={orderFlash && orderChecked}
          onSelect={() => onOrder(server.key)}
        />
        <RoleRadio
          kind="quote"
          name="quote"
          serverKey={server.key}
          checked={quoteChecked}
          disabled={off || quoteLocked || onQuote === undefined}
          onSelect={() => onQuote?.(server.key)}
        />
      </div>

      {(error ?? toggle.error) && (
        <p
          data-slot="server-card-error"
          role="alert"
          className="mt-2 text-[12.5px] leading-[1.45] break-keep text-[var(--destructive)]"
        >
          {error ?? toggle.error}
        </p>
      )}
    </div>
    {/* 카드 div 밖 — 포털이어도 React 이벤트는 트리를 따라 올라가므로, 안에 두면 다이얼로그 탭이 카드 탭(편집 시트)이 된다. */}
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent role="alertdialog" showCloseButton={false} data-slot="server-off-confirm" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{SERVER_CARD_TEXT.confirmTitle(server.key)}</DialogTitle>
          <DialogDescription>{SERVER_CARD_TEXT.confirmBody(server.userCount)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
            {SERVER_CARD_TEXT.confirmCancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setConfirmOpen(false);
              toggle.run(false);
            }}
          >
            {SERVER_CARD_TEXT.confirmOff}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
