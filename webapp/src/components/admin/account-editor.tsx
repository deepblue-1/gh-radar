"use client";

import { useState, type ReactNode } from "react";
import {
  isValidAccountNoInput,
  normalizeAccountNo,
  REFLECT_LABEL,
  type AdminAccountInput,
  type AdminAccountView,
  type AdminPutAccountBody,
  type AdminServerResult,
  type AdminUsersOverview,
  type DmaBroker,
  type ReflectTone,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { putDmaAccount, removeDmaAccount } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY, ReflectChip } from "./reflect-chip";
import { ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT } from "./role-segment";
import { useFieldSave } from "./use-field-save";

/**
 * AccountEditor — 편집 시트 「계좌 · 등록 서버」 (Phase 29 D-14 · D-15 · D-23 ③④⑤ · 목업 A `acct()`).
 *
 * 계좌 줄 = 증권사 · 계좌번호 · 계좌명 · 「제거」 + 지점 · 트레이더(교보는 「해당 없음」 — D-23 ③) + **그 증권사 서버만**
 * 체크 토글(목업 `.sv` — 체크 · 서버 키 · 상태 칩). 87 에만 있는 계좌는 흐린 「서버에만 있음」 줄로 보기만 한다(D-23 ⑤).
 *
 * 저장은 전부 즉시 · 1요청(D-15): 토글 1회 = `PUT …/accounts { account, servers }`(계좌 단위로 서버 집합 전체) ·
 * 「제거」 = `DELETE …/accounts/:broker/:accountNo` · 「+ 계좌 추가」 = `PUT` 1건. 계좌마다 `useFieldSave` 를 둬
 * 한 번에 1건 · 마지막 값 대기 규율을 지킨다.
 *
 * 응답의 서버별 결과 배열 → **그 계좌 · 그 서버 칩**(`chipOfResult` — 아래 표). 결과 칩은 이 시트가 열려 있는 동안
 * 개요 칩보다 앞선다(응답이 87 스냅샷보다 새 소식이다). 실패 칩은 서버 한국어 message 를 `title` 로 싣고, 줄 아래
 * 「<서버> 실패 · BUSY: <message 원문> — 정리 뒤 「다시 반영」」 한 줄을 세운다(D-23 ④ — 토스트 없음).
 *
 * 마지막 계좌 「제거」 는 서버 409 `LAST_ACCOUNT` 를 기다리지 않고 화면이 먼저 안다 — `onRemoveLast`(시트가 확인 1회 뒤
 * 사용자 삭제). 켜진 서버가 1대인 계좌는 그 토글을 끌 수 없다 — 비활성 + `title` 「계좌는 서버 1대 이상」, 안내 문장은
 * 계좌마다 되풀이하지 않고 영역 아래 한 번(목업 하단 note 자리).
 */

export const ACCOUNT_EDITOR_TEXT = {
  remove: "제거",
  add: "+ 계좌 추가",
  notApplicable: "해당 없음",
  minOneServer: "계좌는 서버 1대 이상",
  lastAccountNote: "마지막 계좌 제거는 유저 삭제로 이어진다.",
  accountNoInvalid: "계좌번호는 1~12자예요",
  branchInvalid: "KB 지점번호는 5자예요",
  traderInvalid: "KB 트레이더 id 는 6자예요",
  submit: "추가",
  cancel: "취소",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 결과 → 칩
// ─────────────────────────────────────────────────────────────────────────────

/** 칩 1개의 그림 — 톤 · 서버 message(err) · `REFLECT_LABEL` 밖 낱말(있으면). */
export interface ChipView {
  tone: ReflectTone;
  message: string | null;
  label: string | null;
}

/**
 * 응답 outcome → 칩. ok 반영됨 · failed 실패 · BUSY(message 원문) · timeout 응답 없음(err) · offline 서버 연결 안 됨(warn) ·
 * skipped 미반영(warn).
 */
export const RESULT_CHIP: Readonly<Record<AdminServerResult["outcome"], Omit<ChipView, "message">>> = {
  ok: { tone: "ok", label: null },
  failed: { tone: "err", label: null },
  timeout: { tone: "err", label: "응답 없음" },
  offline: { tone: "warn", label: "서버 연결 안 됨" },
  skipped: { tone: "warn", label: null },
};

export function chipOfResult(r: AdminServerResult): ChipView {
  const base = RESULT_CHIP[r.outcome] ?? RESULT_CHIP.failed;
  return { ...base, message: base.tone === "err" ? (r.message ?? null) : null };
}

/** 상태 낱말만(서버 키가 옆에 있는 자리). */
export function chipStatusText(chip: ChipView): string {
  return chip.label ?? REFLECT_LABEL[chip.tone];
}

/** 「키 · 상태」(반영됨은 키만) — 서버 키가 옆에 없는 자리(비밀번호 · 삭제 결과). */
export function chipFullText(serverKey: string, chip: ChipView): string {
  if (chip.label) return `${serverKey} · ${chip.label}`;
  return chip.tone === "ok" ? serverKey : `${serverKey} · ${REFLECT_LABEL[chip.tone]}`;
}

/** 결과 배열 → 「키 · 상태」 칩 줄(비밀번호 · 사용자 삭제 결과). */
export function ResultChips({ results }: { results: readonly AdminServerResult[] }) {
  if (results.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {results.map((r) => {
        const chip = chipOfResult(r);
        return (
          <ReflectChip
            key={r.server}
            serverKey={r.server}
            tone={chip.tone}
            message={chip.message}
            text={chipFullText(r.server, chip)}
          />
        );
      })}
    </span>
  );
}

/** BUSY 안내 한 줄 — 목업 「KB121 실패 · BUSY: … 정리 뒤 「다시 반영」」(message 는 서버 원문 그대로). */
export function busyLineText(serverKey: string, message: string, after = "정리 뒤 「다시 반영」"): string {
  return `${serverKey} 실패 · BUSY: ${message} — ${after}`;
}

export function BusyLines({
  chips,
  after,
}: {
  chips: readonly { serverKey: string; tone: ReflectTone; message: string | null }[];
  after?: string;
}) {
  const seen = new Set<string>();
  const lines: { key: string; text: string }[] = [];
  for (const c of chips) {
    if (c.tone !== "err" || !c.message) continue;
    const k = `${c.serverKey}\u0000${c.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push({ key: k, text: busyLineText(c.serverKey, c.message, after) });
  }
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((l) => (
        <p key={l.key} data-slot="admin-busy-line" className="mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--destructive)]">
          {l.text}
        </p>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 키 · 결과 덮개
// ─────────────────────────────────────────────────────────────────────────────

export function accountKeyOf(broker: DmaBroker, accountNo: string): string {
  return `${broker}:${normalizeAccountNo(accountNo)}`;
}

const slotKey = (accountKey: string, serverKey: string) => `${accountKey}|${serverKey}`;

type Overlay = ReadonlyMap<string, ChipView>;

function viewChipOf(account: AdminAccountView, serverKey: string): ChipView | null {
  const s = account.servers.find((x) => x.serverKey === serverKey);
  return s ? { tone: s.tone, message: s.message, label: null } : null;
}

/** 계좌 1개에 온 결과 — 그 계좌 · 그 서버 칩을 그대로 바꾼다(PUT · 계좌 DELETE · 계좌 추가). */
function applyAccountResults(prev: Overlay, accountKey: string, results: readonly AdminServerResult[]): Overlay {
  const next = new Map(prev);
  for (const r of results) next.set(slotKey(accountKey, r.server), chipOfResult(r));
  return next;
}

/**
 * 사용자 전체에 온 결과(다시 반영) — 서버 S 의 결과는 S 에 등록된 계좌 전부에 닿는다. ok 면 반영됨, 실패면 **아직 반영되지 않은
 * 계좌만** 실패로(이미 반영된 계좌까지 실패로 칠하지 않는다 — shared `pendingTone` 과 같은 판정).
 */
function applyServerWideResults(
  prev: Overlay,
  accounts: readonly AdminAccountView[],
  results: readonly AdminServerResult[],
): Overlay {
  const next = new Map(prev);
  for (const r of results) {
    const chip = chipOfResult(r);
    for (const a of accounts) {
      const k = slotKey(accountKeyOf(a.broker, a.accountNo), r.server);
      const current = prev.get(k) ?? viewChipOf(a, r.server);
      if (current === null) continue;
      if (chip.tone === "ok" || current.tone !== "ok") next.set(k, chip);
    }
  }
  return next;
}

function accountInputOf(a: AdminAccountView): AdminAccountInput {
  return {
    broker: a.broker,
    accountNo: a.accountNo,
    name: a.name,
    branchNo: a.branchNo,
    traderId: a.traderId,
    priority: a.priority,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 모양
// ─────────────────────────────────────────────────────────────────────────────

/** 계좌 카드 — 목업 `.acct`(hairline · r12 · 12px 14px). */
const ACCOUNT_CARD = "mt-2.5 rounded-[12px] border border-[var(--border-subtle)] px-3.5 py-3";
/** 증권사 배지 — 목업 `.acct .t .bk`. */
const BROKER_BADGE = "rounded-[5px] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--fg-2)]";
/** 서버 토글 알약 — 목업 `.sv`(12.5px · 5px 9px · 둥근 알약 · hairline). */
const SERVER_PILL =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[12.5px] text-[var(--fg-2)] has-disabled:cursor-default";
/** 상태 칩(알약 안) — 목업 `.sv .st`(10.5px · 1px 5px · r4). */
const PILL_CHIP = "rounded-[4px] px-[5px] py-px text-[10.5px]";
const NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
const ERROR_LINE = "mt-1.5 text-[12.5px] break-keep text-[var(--destructive)]";
/** 성공 플래시 — 켜진 체크 칸을 성공 토큰으로 0.7초. */
const ROW_FLASH = "[&_[data-state=checked]]:border-[var(--led-armed)]! [&_[data-state=checked]]:bg-[var(--led-armed)]!";

function brokerLabel(b: DmaBroker): string {
  return b;
}

function BranchTrader({ account }: { account: Pick<AdminAccountView, "broker" | "branchNo" | "traderId"> }) {
  const na = ACCOUNT_EDITOR_TEXT.notApplicable;
  const kb = account.broker === "KB";
  return (
    <p data-slot="admin-account-branch" className="mt-1 text-[12px] text-[var(--muted-fg)]">
      지점 {kb ? account.branchNo || "—" : na} · 트레이더 {kb ? account.traderId || "—" : na}
    </p>
  );
}

function AccountTitle({ account, children }: { account: AdminAccountView; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--fg)]">
      <span className={BROKER_BADGE}>{brokerLabel(account.broker)}</span>
      <span className="min-w-0 truncate tabular-nums">{account.accountNo}</span>
      {account.name && <span className="min-w-0 truncate font-medium text-[var(--muted-fg)]">{account.name}</span>}
      <span className="flex-1" />
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 줄
// ─────────────────────────────────────────────────────────────────────────────

interface AccountRowProps {
  account: AdminAccountView;
  dmaUserId: string;
  /** 이 계좌 증권사의 서버 키(레지스트리 순). */
  candidates: readonly string[];
  overlay: Overlay;
  /** 이 계좌가 마지막 계좌인가 — 「제거」 가 사용자 삭제로 간다. */
  last: boolean;
  onResults: (accountKey: string, results: readonly AdminServerResult[]) => void;
  onChanged: () => void;
  onRemoveLast: () => void;
}

function AccountRow({ account, dmaUserId, candidates, overlay, last, onResults, onChanged, onRemoveLast }: AccountRowProps) {
  const key = accountKeyOf(account.broker, account.accountNo);

  const toggle = useFieldSave<string[]>(
    (servers) => putDmaAccount(dmaUserId, { account: accountInputOf(account), servers }),
    {
      onSuccess: (_v, res) => {
        if (res) onResults(key, res.results);
        onChanged();
      },
    },
  );
  const remove = useFieldSave<true>(() => removeDmaAccount(dmaUserId, account.broker, account.accountNo), {
    retainValue: false,
    onSuccess: (_v, res) => {
      if (res) onResults(key, res.results);
      onChanged();
    },
  });

  const intent =
    toggle.value ?? account.servers.filter((s) => s.state === "active").map((s) => s.serverKey);
  const shown = [...candidates, ...intent.filter((k) => !candidates.includes(k))];

  const setServer = (serverKey: string, on: boolean) => {
    const next = shown.filter((k) => (k === serverKey ? on : intent.includes(k)));
    if (next.length === 0) return; // 계좌는 서버 1대 이상
    toggle.run(next);
  };

  const chipFor = (serverKey: string, checked: boolean): ChipView | null => {
    const o = overlay.get(slotKey(key, serverKey));
    if (o) return o;
    const s = account.servers.find((x) => x.serverKey === serverKey);
    if (s && (checked || s.state === "removing")) return { tone: s.tone, message: s.message, label: null };
    if (account.serverOnlyOn.includes(serverKey)) return { tone: "only", message: null, label: null };
    return null;
  };

  const error = toggle.error ?? remove.error;

  return (
    <div
      data-slot="admin-account"
      data-account={account.accountNo}
      data-broker={account.broker}
      data-state={remove.state === "saving" ? "saving" : toggle.state}
      className={cn(ACCOUNT_CARD, toggle.state === "flash" && ROW_FLASH)}
    >
      <AccountTitle account={account}>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          aria-label={`${account.broker} ${account.accountNo} ${ACCOUNT_EDITOR_TEXT.remove}`}
          disabled={remove.state === "saving"}
          onClick={() => (last ? onRemoveLast() : remove.run(true))}
          className={cn(ADMIN_BUTTON_SECONDARY, "h-7 px-2.5")}
        >
          {ACCOUNT_EDITOR_TEXT.remove}
        </Button>
      </AccountTitle>
      <BranchTrader account={account} />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {shown.map((serverKey) => {
          const checked = intent.includes(serverKey);
          const chip = chipFor(serverKey, checked);
          const locked = checked && intent.length === 1;
          return (
            <label
              key={serverKey}
              data-slot="admin-server-toggle"
              data-server={serverKey}
              title={locked ? ACCOUNT_EDITOR_TEXT.minOneServer : undefined}
              className={SERVER_PILL}
            >
              <Checkbox
                aria-label={serverKey}
                checked={checked}
                disabled={locked}
                onCheckedChange={(v) => setServer(serverKey, v === true)}
                className="disabled:opacity-100"
              />
              <span>{serverKey}</span>
              {chip && (
                <ReflectChip
                  serverKey={serverKey}
                  tone={chip.tone}
                  message={chip.message}
                  text={chipStatusText(chip)}
                  className={PILL_CHIP}
                />
              )}
            </label>
          );
        })}
      </div>
      {error && (
        <p role="alert" data-slot="admin-account-error" className={ERROR_LINE}>
          {error}
        </p>
      )}
    </div>
  );
}

/** 87 에만 있는 계좌 — 흐린 줄 · 보기만(D-23 ⑤ — 지우지 않는다). */
function ServerOnlyAccountRow({ account }: { account: AdminAccountView }) {
  return (
    <div
      data-slot="admin-account"
      data-account={account.accountNo}
      data-broker={account.broker}
      data-server-only="true"
      className={cn(ACCOUNT_CARD, "border-dashed opacity-60")}
    >
      <AccountTitle account={account} />
      <div className="mt-2 flex flex-wrap gap-1">
        {account.serverOnlyOn.map((serverKey) => (
          <ReflectChip key={serverKey} serverKey={serverKey} tone="only" />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 계좌 추가
// ─────────────────────────────────────────────────────────────────────────────

const BROKERS: readonly DmaBroker[] = ["KB", "KYOBO"];

interface AccountAddFormProps {
  dmaUserId: string;
  serverKeysOf: (broker: DmaBroker) => string[];
  nextPriority: number;
  onResults: (accountKey: string, results: readonly AdminServerResult[]) => void;
  onChanged: () => void;
  onClose: () => void;
}

function AccountAddForm({ dmaUserId, serverKeysOf, nextPriority, onResults, onChanged, onClose }: AccountAddFormProps) {
  const [broker, setBroker] = useState<DmaBroker>("KB");
  const [accountNo, setAccountNo] = useState("");
  const [name, setName] = useState("");
  const [branchNo, setBranchNo] = useState("");
  const [traderId, setTraderId] = useState("");
  const [servers, setServers] = useState<string[]>([]);

  const save = useFieldSave<AdminPutAccountBody>((body) => putDmaAccount(dmaUserId, body), {
    retainValue: false,
    onSuccess: (body, res) => {
      if (res) onResults(accountKeyOf(body.account.broker, body.account.accountNo), res.results);
      onChanged();
      onClose();
    },
  });

  const kb = broker === "KB";
  const candidates = serverKeysOf(broker);
  const noInvalid = accountNo.trim() !== "" && !isValidAccountNoInput(accountNo);
  const branchInvalid = kb && branchNo !== "" && branchNo.length !== 5;
  const traderInvalid = kb && traderId !== "" && traderId.length !== 6;
  const ready =
    isValidAccountNoInput(accountNo) &&
    servers.length > 0 &&
    (!kb || (branchNo.length === 5 && traderId.length === 6)) &&
    save.state !== "saving";

  const submit = () => {
    if (!ready) return;
    save.run({
      account: {
        broker,
        accountNo: normalizeAccountNo(accountNo),
        name: name.trim(),
        branchNo: kb ? branchNo : "",
        traderId: kb ? traderId : "",
        priority: nextPriority,
      },
      servers: candidates.filter((k) => servers.includes(k)),
    });
  };

  return (
    <form
      data-slot="admin-account-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(ACCOUNT_CARD, "flex flex-col gap-2.5")}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={broker}
        aria-label="증권사"
        onValueChange={(v) => {
          if (v === "KB" || v === "KYOBO") {
            setBroker(v);
            setServers([]);
          }
        }}
        className={ADMIN_SEGMENT_ROOT}
      >
        {BROKERS.map((b) => (
          <ToggleGroupItem key={b} value={b} className={ADMIN_SEGMENT_ITEM}>
            {brokerLabel(b)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid grid-cols-2 gap-2">
        <Input
          size="sm"
          aria-label="계좌번호"
          placeholder="계좌번호"
          inputMode="numeric"
          autoComplete="off"
          value={accountNo}
          aria-invalid={noInvalid || undefined}
          onChange={(e) => setAccountNo(e.target.value)}
        />
        <Input
          size="sm"
          aria-label="계좌명"
          placeholder="계좌명"
          autoComplete="off"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {kb && (
          <>
            <Input
              size="sm"
              aria-label="지점"
              placeholder="지점 (5자)"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={branchNo}
              aria-invalid={branchInvalid || undefined}
              onChange={(e) => setBranchNo(e.target.value.trim())}
            />
            <Input
              size="sm"
              aria-label="트레이더"
              placeholder="트레이더 (6자)"
              autoComplete="off"
              maxLength={6}
              value={traderId}
              aria-invalid={traderInvalid || undefined}
              onChange={(e) => setTraderId(e.target.value.trim())}
            />
          </>
        )}
      </div>
      {noInvalid && <p className={ERROR_LINE}>{ACCOUNT_EDITOR_TEXT.accountNoInvalid}</p>}
      {branchInvalid && <p className={ERROR_LINE}>{ACCOUNT_EDITOR_TEXT.branchInvalid}</p>}
      {traderInvalid && <p className={ERROR_LINE}>{ACCOUNT_EDITOR_TEXT.traderInvalid}</p>}

      <div className="flex flex-wrap gap-1.5">
        {candidates.map((serverKey) => (
          <label key={serverKey} data-slot="admin-server-toggle" data-server={serverKey} className={SERVER_PILL}>
            <Checkbox
              aria-label={serverKey}
              checked={servers.includes(serverKey)}
              onCheckedChange={(v) =>
                setServers((prev) => (v === true ? [...prev, serverKey] : prev.filter((k) => k !== serverKey)))
              }
            />
            <span>{serverKey}</span>
          </label>
        ))}
      </div>

      {save.error && (
        <p role="alert" className={ERROR_LINE}>
          {save.error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="secondary" onClick={onClose} className={cn(ADMIN_BUTTON_SECONDARY, "h-7 px-2.5")}>
          {ACCOUNT_EDITOR_TEXT.cancel}
        </Button>
        <Button type="submit" size="sm" disabled={!ready} className={cn(ADMIN_BUTTON_PRIMARY, "h-7 px-2.5")}>
          {ACCOUNT_EDITOR_TEXT.submit}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AccountEditor
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountEditorProps {
  dmaUserId: string;
  accounts: readonly AdminAccountView[];
  servers: AdminUsersOverview["servers"];
  /** 쓰기 성공 뒤 목록 재조회. */
  onChanged: () => void;
  /** 마지막 계좌 「제거」 — 시트가 확인 1회 뒤 사용자 삭제로 간다. */
  onRemoveLast: () => void;
  /** 사용자 전체 결과(「다시 반영」) — `id` 가 바뀔 때마다 한 번 반영한다. */
  serverResults?: { id: number; results: readonly AdminServerResult[] } | null;
}

export function AccountEditor({
  dmaUserId,
  accounts,
  servers,
  onChanged,
  onRemoveLast,
  serverResults = null,
}: AccountEditorProps) {
  const [overlay, setOverlay] = useState<Overlay>(() => new Map());
  const [adding, setAdding] = useState(false);
  const [appliedId, setAppliedId] = useState<number | null>(null);

  // 「다시 반영」 결과 — props 로 온 새 묶음을 렌더 중 한 번 반영한다(React 「props 변화로 state 조정」 패턴).
  if (serverResults && serverResults.id !== appliedId) {
    setAppliedId(serverResults.id);
    setOverlay((prev) => applyServerWideResults(prev, accounts, serverResults.results));
  }

  const onResults = (accountKey: string, results: readonly AdminServerResult[]) =>
    setOverlay((prev) => applyAccountResults(prev, accountKey, results));

  const serverKeysOf = (broker: DmaBroker) =>
    servers.filter((s) => s.broker === broker && s.enabled).map((s) => s.key);

  const editable = accounts.filter((a) => a.servers.length > 0);
  const activeCount = accounts.filter((a) => a.servers.some((s) => s.state === "active")).length;
  const nextPriority = Math.min(999, accounts.reduce((m, a) => Math.max(m, a.priority), 0) + 1);

  // BUSY 줄 — 지금 그려진 실패 칩(결과 덮개가 개요보다 앞선다).
  const shownChips: { serverKey: string; tone: ReflectTone; message: string | null }[] = [];
  for (const a of editable) {
    const k = accountKeyOf(a.broker, a.accountNo);
    const keys = new Set([...a.servers.map((s) => s.serverKey)]);
    for (const slot of overlay.keys()) if (slot.startsWith(`${k}|`)) keys.add(slot.slice(k.length + 1));
    for (const serverKey of keys) {
      const chip = overlay.get(slotKey(k, serverKey)) ?? viewChipOf(a, serverKey);
      if (chip) shownChips.push({ serverKey, tone: chip.tone, message: chip.message });
    }
  }

  return (
    <div data-slot="admin-accounts">
      {accounts.map((a) => {
        const k = accountKeyOf(a.broker, a.accountNo);
        if (a.servers.length === 0) return <ServerOnlyAccountRow key={k} account={a} />;
        const isActive = a.servers.some((s) => s.state === "active");
        return (
          <AccountRow
            key={k}
            account={a}
            dmaUserId={dmaUserId}
            candidates={serverKeysOf(a.broker)}
            overlay={overlay}
            last={isActive && activeCount <= 1}
            onResults={onResults}
            onChanged={onChanged}
            onRemoveLast={onRemoveLast}
          />
        );
      })}

      {adding ? (
        <AccountAddForm
          dmaUserId={dmaUserId}
          serverKeysOf={serverKeysOf}
          nextPriority={nextPriority}
          onResults={onResults}
          onChanged={onChanged}
          onClose={() => setAdding(false)}
        />
      ) : (
        <div className="mt-2.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAdding(true)}
            className={cn(ADMIN_BUTTON_SECONDARY, "h-7 px-2.5")}
          >
            {ACCOUNT_EDITOR_TEXT.add}
          </Button>
        </div>
      )}

      <BusyLines chips={shownChips} />
      <p data-slot="admin-accounts-note" className={NOTE}>
        {ACCOUNT_EDITOR_TEXT.minOneServer} — 마지막 서버는 끌 수 없다. {ACCOUNT_EDITOR_TEXT.lastAccountNote}
      </p>
    </div>
  );
}
