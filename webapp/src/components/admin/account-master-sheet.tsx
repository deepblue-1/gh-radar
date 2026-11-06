"use client";

import { useState, type ReactNode } from "react";
import {
  formatOrderIp,
  formatOrderMac,
  isValidAccountNoInput,
  normalizeAccountNo,
  validateOrderEndpointInput,
  type AdminAccountFanout,
  type AdminAccountMaster,
  type AdminUsersOverview,
  type DmaBroker,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  createAdminAccount,
  deleteAdminAccount,
  saveAdminAccount,
  setAdminAccountBudget,
  setAdminAccountFee,
} from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  ACCOUNT_EDITOR_TEXT,
  AccountCostFields,
  BusyLines,
  ORDER_ENDPOINT_ERROR_TEXT,
  ResultChips,
  chipOfResult,
} from "./account-editor";
import {
  flattenFanout,
  linkedAccountOf,
  orderEndpointToSend,
  summarizeLinkedCosts,
  summarizeLinkedOrderEndpoint,
} from "./account-linked-summary";
import { BROKER_BADGE, BROKER_LABEL } from "./account-picker";
import { AdminSheet } from "./admin-sheet";
import { ADMIN_BUTTON_PRIMARY, ADMIN_BUTTON_SECONDARY } from "./reflect-chip";
import { ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT } from "./role-segment";

/**
 * AccountMasterSheet — `/admin/accounts` 의 등록 시트 · 수정/삭제 시트 (quick 261106-lwu D-07 · D-08 · 목업 ② ③).
 *
 * - create(목업 ②): 증권사 세그먼트(KB/교보) · 계좌번호(등록 뒤 못 바꿈) · 계좌명(선택) · KB 일 때만 지점 5 · 트레이더 6.
 *   형식이 덜 찼으면 「등록」 비활성. 같은 증권사 · 정규화 번호가 이미 목록에 있거나 서버가 409 `ACCOUNT_EXISTS` 면 계좌번호 칸
 *   아래 한 줄. **등록은 DB 마스터만 — relay · 증권사 서버를 부르지 않는다(D-07).** 성공 → 부모가 닫고 재조회.
 * - edit(목업 ③): 증권사 · 계좌번호 읽기 전용 · 계좌명 · (KB) 지점 · 트레이더. 바뀐 값이 있을 때만 「저장」. 저장 = PUT 1건 →
 *   서버가 연결된 사용자마다 relay 반영(팬아웃) → 「쓰는 사용자」 줄마다 결과 칩(account-editor `ResultChips` 재사용 · 새 칩 없음) ·
 *   실패는 `BusyLines`(서버 message 원문) · 사용자 relay 거부는 그 줄 아래 한 줄. 저장 뒤 부모 재조회(시트는 유지).
 * - 삭제: 쓰는 사용자가 있으면 버튼 잠금 + 안내 문장(서버도 409 `ACCOUNT_IN_USE`). 0명이면 시트 안 확인 박스(브라우저 confirm 금지 ·
 *   D-08) → DELETE → 부모가 닫고 재조회. 서버 409 는 확인 박스 아래 message 한 줄. 저장 · 삭제 비행 중엔 버튼을 잠근다.
 *
 * **quick 261106-ntl N-02 — KB 주문자 IP/MAC(목업 ③).** 지점 · 트레이더 아래 「주문자 IP」 · 「MAC 주소」 두 칸 + 도움말(검증 오류가 보이면
 * 그 자리를 오류 줄이 대신 · 규칙은 shared `validateOrderEndpointInput` 한 벌). 초깃값 = 쓰는 사용자 · 서버 중 정본(account-linked-summary)
 * 의 표시 표기 · 시트를 연 순간 고정. 기존 「저장」 이 계좌명 · 지점 · 트레이더와 함께 보낸다 — IP/MAC 은 정규화 비교로 바뀌었거나
 * 사용자·서버 간 불일치일 때만 `orderEndpoint`(입력 원문 trim)로 싣는다(계좌명만 바뀐 저장엔 싣지 않음). 보낼 것이 없으면 요청 없이
 * 「변경 없음」. 서버가 연결 사용자마다 계좌 PUT 에 실어 팬아웃한다. 불일치 줄 「<DMA id> · <서버> 값이 달라요(…) — 저장하면 모두 같아져요」.
 * 교보는 칸 없음 · 연결 0명이면 칸 비활성 + 안내.
 *
 * **N-01 — 「예수금 · 수수료」 그룹(목업 ③).** 저장 버튼 줄 아래 구분선 · 「쓰는 사용자」 앞. 세 칸은 account-editor `AccountCostFields`
 * (칸마다 Enter · 포커스 이탈 즉시 저장 · 상태기계 그대로) — 저장 = `PUT /api/admin/accounts/:broker/:accountNo/budget · /fee` 팬아웃
 * (`flattenFanout` 으로 칩 라벨 「<DMA id> · <서버>」). 표시값 · 불일치 · 「확인 전」 은 사용자 개요(`overview` prop)를 사용자마다 집계.
 * 연결 0명(active 자리 0)은 세 칸 비활성 + 「사용자에게 연결된 뒤 설정할 수 있어요 …」 · 요청 없음.
 */

export const ACCOUNT_MASTER_SHEET_TEXT = {
  createTitle: "계좌 등록",
  broker: "증권사",
  accountNo: "계좌번호",
  accountNoHint: "· 등록 뒤 못 바꿈",
  name: "계좌명",
  nameHint: "· 선택",
  namePlaceholder: "예: 주식",
  branch: "지점",
  branchHint: "· 5자",
  trader: "트레이더",
  traderHint: "· 6자",
  createNote:
    "교보 계좌는 지점 · 트레이더 칸이 없다. 등록만으로는 서버에 보내지 않는다 — 「사용자」 에서 연결하면 그 사용자의 서버에 올라간다.",
  create: "등록",
  save: "저장",
  cancel: "취소",
  duplicate: "이미 등록된 계좌예요",
  accountNoInvalid: "계좌번호는 1~12자예요",
  branchInvalid: "KB 지점번호는 5자예요",
  traderInvalid: "KB 트레이더 id 는 6자예요",
  readOnlyNote: "증권사 · 계좌번호는 못 바꾼다 — 삭제 뒤 다시 등록.",
  fanoutNote: "저장하면 쓰는 사용자 모두의 서버 설정에 함께 반영돼요.",
  /** quick 261106-ntl N-02 — KB 계좌 · 연결 있음(목업 ③). */
  fanoutNoteKb: "저장하면 쓰는 사용자 모두의 서버 설정에 함께 반영돼요(계좌명 · 지점 · 트레이더 · IP/MAC).",
  // ── quick 261106-ntl N-01 — 「예수금 · 수수료」 그룹(목업 ③) ──
  costTitle: "예수금 · 수수료",
  costSubtitle: "쓰는 사용자 모두의 등록 서버에 즉시 저장",
  /** 연결 0명 — 값을 둘 서버가 없다(세 칸 · IP/MAC 칸 비활성). */
  notLinkedNote: "사용자에게 연결된 뒤 설정할 수 있어요 — 값은 연결된 사용자의 서버에 저장돼요",
  usersTitle: "쓰는 사용자",
  usersCount: (n: number) => (n > 0 ? `${n}명 · 등록 서버` : "0명"),
  noUsers: "어느 사용자에게도 연결되지 않은 계좌 — 서버에 올라가 있지 않다.",
  userFailed: (dmaUserId: string, message: string) => `${dmaUserId} 반영 실패 · ${message}`,
  delete: "삭제",
  deleteLocked: "연결된 사용자가 있어 삭제할 수 없어요 — 「사용자」 에서 먼저 연결을 해제하세요",
  deleteConfirm: (label: string) => `${label} 계좌를 삭제할까요? 목록에서 사라지고 되돌릴 수 없어요.`,
  saveFailed: "저장하지 못했어요",
} as const;

const BROKERS: readonly DmaBroker[] = ["KB", "KYOBO"];

const LABEL = "text-[12.5px] font-semibold text-[var(--muted-fg)]";
const HINT = "font-normal text-[var(--faint)]";
const ERROR_LINE = "text-[12.5px] leading-[1.45] break-keep text-[var(--destructive)]";
const NOTE = "text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
const WARN_LINE = "text-[12px] leading-[1.5] break-keep text-[var(--led-latent)]";
const READ_ONLY = "text-[15px] font-semibold tabular-nums text-[var(--fg)]";
const HR = "my-1 border-t border-[var(--border-subtle)]";
const FORM_ID = "admin-account-sheet-form";

function Field({
  label,
  hint,
  slot,
  error = null,
  children,
}: {
  label: string;
  hint?: string;
  slot: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div data-slot={`account-sheet-field-${slot}`} className="flex min-w-0 flex-col gap-1.5">
      <span className={LABEL}>
        {label}
        {hint && <span className={HINT}> {hint}</span>}
      </span>
      {children}
      {error && (
        <p data-slot={`account-sheet-error-${slot}`} role="alert" className={ERROR_LINE}>
          {error}
        </p>
      )}
    </div>
  );
}

/** 제목 줄 — 배지 · 계좌번호 · 계좌명(빈 값이면 흐린 「이름 없음」). 목록 행과 같은 모양. */
export function AccountMasterTitle({ account }: { account: Pick<AdminAccountMaster, "broker" | "accountNo" | "name"> }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={BROKER_BADGE}>{BROKER_LABEL[account.broker]}</span>
      <span className="shrink-0 tabular-nums">{account.accountNo}</span>
      {account.name ? (
        <span className="min-w-0 truncate font-medium text-[var(--muted-fg)]">{account.name}</span>
      ) : (
        <span className="min-w-0 truncate font-medium text-[var(--faint)]">이름 없음</span>
      )}
    </span>
  );
}

function errorText(err: unknown): string {
  return err instanceof ApiClientError && err.message ? err.message : ACCOUNT_MASTER_SHEET_TEXT.saveFailed;
}

/** KB 지점 · 트레이더 길이 판정(서버 `kbAccountIssues` 와 같은 규칙) — 빈 값은 「아직 안 씀」 이라 오류 줄을 띄우지 않는다. */
function kbErrors(broker: DmaBroker, branchNo: string, traderId: string) {
  if (broker !== "KB") return { branch: null, trader: null, ok: true };
  const branchOk = branchNo.length === 5;
  const traderOk = traderId.length === 6;
  return {
    branch: branchNo !== "" && !branchOk ? ACCOUNT_MASTER_SHEET_TEXT.branchInvalid : null,
    trader: traderId !== "" && !traderOk ? ACCOUNT_MASTER_SHEET_TEXT.traderInvalid : null,
    ok: branchOk && traderOk,
  };
}

function KbFields({
  broker,
  branchNo,
  traderId,
  onBranch,
  onTrader,
  disabled,
}: {
  broker: DmaBroker;
  branchNo: string;
  traderId: string;
  onBranch: (v: string) => void;
  onTrader: (v: string) => void;
  disabled?: boolean;
}) {
  if (broker !== "KB") return null;
  const T = ACCOUNT_MASTER_SHEET_TEXT;
  const e = kbErrors(broker, branchNo, traderId);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={T.branch} hint={T.branchHint} slot="branch" error={e.branch}>
        <Input
          aria-label={T.branch}
          placeholder="00001"
          autoComplete="off"
          maxLength={5}
          value={branchNo}
          disabled={disabled}
          aria-invalid={e.branch !== null || undefined}
          onChange={(ev) => onBranch(ev.target.value.trim())}
        />
      </Field>
      <Field label={T.trader} hint={T.traderHint} slot="trader" error={e.trader}>
        <Input
          aria-label={T.trader}
          placeholder="000001"
          autoComplete="off"
          maxLength={6}
          value={traderId}
          disabled={disabled}
          aria-invalid={e.trader !== null || undefined}
          onChange={(ev) => onTrader(ev.target.value.trim())}
        />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 등록 시트 (목업 ②)
// ─────────────────────────────────────────────────────────────────────────────

interface CreateProps {
  accounts: readonly AdminAccountMaster[];
  onCreated: () => void;
  onClose: () => void;
}

function CreateSheet({ accounts, onCreated, onClose }: CreateProps) {
  const T = ACCOUNT_MASTER_SHEET_TEXT;
  const [broker, setBroker] = useState<DmaBroker>("KB");
  const [accountNo, setAccountNo] = useState("");
  const [name, setName] = useState("");
  const [branchNo, setBranchNo] = useState("");
  const [traderId, setTraderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverDuplicate, setServerDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const noValid = isValidAccountNoInput(accountNo);
  const normalized = noValid ? normalizeAccountNo(accountNo) : "";
  const duplicate =
    noValid && accounts.some((a) => a.broker === broker && a.accountNo === normalized)
      ? T.duplicate
      : serverDuplicate === `${broker}|${normalized}`
        ? T.duplicate
        : null;
  const noError = accountNo !== "" && !noValid ? T.accountNoInvalid : duplicate;
  const kb = kbErrors(broker, branchNo, traderId);
  const ready = noValid && duplicate === null && kb.ok && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await createAdminAccount({
        broker,
        accountNo: normalized,
        name: name.trim(),
        branchNo: broker === "KB" ? branchNo : "",
        traderId: broker === "KB" ? traderId : "",
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "ACCOUNT_EXISTS") setServerDuplicate(`${broker}|${normalized}`);
      else setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <AdminSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={T.createTitle}
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose} className={cn(ADMIN_BUTTON_SECONDARY, "ml-auto")}>
            {T.cancel}
          </Button>
          <Button type="submit" form={FORM_ID} size="sm" disabled={!ready} className={ADMIN_BUTTON_PRIMARY}>
            {T.create}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        data-slot="account-sheet"
        data-mode="create"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4 pt-2"
      >
        <Field label={T.broker} slot="broker">
          <ToggleGroup
            type="single"
            variant="outline"
            value={broker}
            aria-label={T.broker}
            onValueChange={(v) => {
              if (v === "KB" || v === "KYOBO") setBroker(v);
            }}
            className={cn(ADMIN_SEGMENT_ROOT, "self-start")}
          >
            {BROKERS.map((b) => (
              <ToggleGroupItem key={b} value={b} className={ADMIN_SEGMENT_ITEM}>
                {BROKER_LABEL[b]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field label={T.accountNo} hint={T.accountNoHint} slot="accountNo" error={noError}>
          <Input
            aria-label={T.accountNo}
            placeholder="5120009880"
            autoComplete="off"
            inputMode="numeric"
            maxLength={16}
            value={accountNo}
            aria-invalid={noError !== null || undefined}
            onChange={(e) => setAccountNo(e.target.value)}
          />
        </Field>
        <Field label={T.name} hint={T.nameHint} slot="name">
          <Input
            aria-label={T.name}
            placeholder={T.namePlaceholder}
            autoComplete="off"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <KbFields broker={broker} branchNo={branchNo} traderId={traderId} onBranch={setBranchNo} onTrader={setTraderId} />
        <p data-slot="account-sheet-note" className={NOTE}>
          {T.createNote}
        </p>
        {error && (
          <p data-slot="account-sheet-error" role="alert" className={ERROR_LINE}>
            {error}
          </p>
        )}
      </form>
    </AdminSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 수정 · 삭제 시트 (목업 ③)
// ─────────────────────────────────────────────────────────────────────────────

interface EditProps {
  account: AdminAccountMaster;
  /**
   * 사용자 개요(`GET /api/admin/users`) — 쓰는 사용자 · 서버별 예수금 · 수수료 · 매도세 · IP/MAC 표시용(quick 261106-ntl).
   * null = 못 읽음(그 값들은 「확인 전」).
   */
  overview: AdminUsersOverview | null;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

function UserLine({ user, fanout }: { user: AdminAccountMaster["users"][number]; fanout: AdminAccountFanout | undefined }) {
  const T = ACCOUNT_MASTER_SHEET_TEXT;
  const failed = fanout
    ? fanout.results.map((r) => ({ ...chipOfResult(r), serverKey: `${user.dmaUserId} · ${r.server}` }))
    : [];
  return (
    <li data-slot="account-sheet-user" data-dma={user.dmaUserId} className="flex flex-col py-2 [&+&]:border-t [&+&]:border-[var(--border-subtle)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <b className="font-semibold text-[var(--fg)]">{user.dmaUserId}</b>
        {user.emails.length > 0 && (
          <span className="min-w-0 truncate text-[12px] text-[var(--muted-fg)]">{user.emails.join(" · ")}</span>
        )}
        <span className="ml-auto inline-flex flex-wrap gap-1">
          {fanout && !fanout.error && fanout.results.length > 0 ? (
            <ResultChips results={fanout.results} />
          ) : (
            user.servers.map((s) => (
              <span
                key={s.serverKey}
                data-slot="account-sheet-server"
                data-state={s.state}
                className={cn(
                  "text-[12px] tabular-nums",
                  s.state === "removing" ? "text-[var(--faint)] line-through" : "text-[var(--fg-2)]",
                )}
              >
                {s.serverKey}
              </span>
            ))
          )}
        </span>
      </div>
      {fanout && !fanout.error && <BusyLines chips={failed} />}
      {fanout?.error && (
        <p data-slot="account-sheet-user-error" role="alert" className={cn("mt-1.5", ERROR_LINE)}>
          {T.userFailed(user.dmaUserId, fanout.error.message)}
        </p>
      )}
    </li>
  );
}

type EndpointFields = { ip: string; mac: string };

function EditSheet({ account, overview, onSaved, onDeleted, onClose }: EditProps) {
  const T = ACCOUNT_MASTER_SHEET_TEXT;
  const E = ACCOUNT_EDITOR_TEXT;
  const kbAccount = account.broker === "KB";
  const [name, setName] = useState(account.name);
  const [branchNo, setBranchNo] = useState(account.branchNo);
  const [traderId, setTraderId] = useState(account.traderId);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fanout, setFanout] = useState<ReadonlyMap<string, AdminAccountFanout>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 「변경 없음」(D-06 결) — 요청 없이 끝난 저장. 칸을 고치면 지운다.
  const [unchanged, setUnchanged] = useState(false);

  // N-01 · N-02 — 쓰는 사용자 · 서버(active 자리) 집계. 자리 0 = 값을 둘 서버가 없다(연결 0명 · removing 만).
  const linkedAccount = linkedAccountOf(account, overview);
  const settable = linkedAccount.slots.length > 0;
  const costs = summarizeLinkedCosts(linkedAccount);
  const endpoint = kbAccount ? summarizeLinkedOrderEndpoint(linkedAccount) : null;
  const mismatched = settable && endpoint !== null && endpoint.mismatches.length > 0;

  // IP/MAC 초깃값 · 초안 — 시트를 연 순간 정본 표시 표기로 고정(재조회가 덮지 않는다 · D-17).
  const [endpointDraft, setEndpointDraft] = useState<{ initial: EndpointFields; draft: EndpointFields }>(() => {
    const set = endpoint?.state === "set";
    const initial = {
      ip: set ? formatOrderIp(endpoint.orderIp) : "",
      mac: set ? formatOrderMac(endpoint.orderMac) : "",
    };
    return { initial, draft: initial };
  });
  const setEndpointField = (field: keyof EndpointFields, v: string) => {
    setEndpointDraft((d) => ({ ...d, draft: { ...d.draft, [field]: v } }));
    setUnchanged(false);
  };

  const kb = kbErrors(account.broker, branchNo, traderId);
  const accountChanged =
    name.trim() !== account.name || (kbAccount && (branchNo !== account.branchNo || traderId !== account.traderId));
  const ipmacOn = kbAccount && settable;
  // 「바뀜」(저장 버튼 기준) = 칸 원문(trim)이 초깃값과 다름 — 같은 값을 다른 표기로 적어도 「바뀜」(누르면 「변경 없음」).
  const endpointEdited =
    ipmacOn &&
    (endpointDraft.draft.ip.trim() !== endpointDraft.initial.ip ||
      endpointDraft.draft.mac.trim() !== endpointDraft.initial.mac);
  // 검증은 IP/MAC 을 실을 수 있는 저장(칸을 고쳤거나 불일치 맞추기)만 막는다(30 IN-01) — 막을 때는 오류 줄이 늘 이유를 보인다.
  const validation = ipmacOn ? validateOrderEndpointInput(endpointDraft.draft) : null;
  const shownInvalid = validation !== null && !validation.ok && (endpointEdited || mismatched) ? validation : null;
  const ready = (accountChanged || endpointEdited || mismatched) && kb.ok && shownInvalid === null && busy === null;
  const linked = account.users.length > 0;

  const save = async () => {
    if (!ready) return;
    const orderEndpoint = ipmacOn
      ? orderEndpointToSend({ initial: endpointDraft.initial, draft: endpointDraft.draft, mismatched })
      : null;
    if (!accountChanged && orderEndpoint === null) {
      // 정규화 비교로 지금 값과 같고 불일치도 없다 — 요청 없이 「변경 없음」.
      setUnchanged(true);
      return;
    }
    setBusy("save");
    setError(null);
    setUnchanged(false);
    try {
      const res = await saveAdminAccount(account.broker, account.accountNo, {
        name: name.trim(),
        branchNo: kbAccount ? branchNo : "",
        traderId: kbAccount ? traderId : "",
        ...(orderEndpoint ? { orderEndpoint } : {}),
      });
      setName(name.trim());
      if (ipmacOn) {
        // 초깃값 = 보낸(또는 정규화로 같은) 칸 값 — 「저장」 이 다시 꺼진다.
        const sent = { ip: endpointDraft.draft.ip.trim(), mac: endpointDraft.draft.mac.trim() };
        setEndpointDraft({ initial: sent, draft: sent });
      }
      setFanout(new Map(res.fanout.map((f) => [f.dmaUserId, f])));
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busy !== null) return;
    setBusy("delete");
    setDeleteError(null);
    try {
      await deleteAdminAccount(account.broker, account.accountNo);
      onDeleted();
    } catch (err) {
      setDeleteError(errorText(err));
      setBusy(null);
    }
  };

  return (
    <AdminSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={<AccountMasterTitle account={account} />}
      description={`${BROKER_LABEL[account.broker]} ${account.accountNo} 계좌`}
    >
      <form
        id={FORM_ID}
        data-slot="account-sheet"
        data-mode="edit"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4 pt-2"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={T.broker} slot="broker">
            <span data-slot="account-sheet-broker" className={READ_ONLY}>
              {BROKER_LABEL[account.broker]}
            </span>
          </Field>
          <Field label={T.accountNo} slot="accountNo">
            <span data-slot="account-sheet-account-no" className={READ_ONLY}>
              {account.accountNo}
            </span>
          </Field>
        </div>
        <p className={cn(NOTE, "-mt-2")}>{T.readOnlyNote}</p>
        <Field label={T.name} slot="name">
          <Input
            aria-label={T.name}
            placeholder={T.namePlaceholder}
            autoComplete="off"
            maxLength={40}
            value={name}
            disabled={busy !== null}
            onChange={(e) => {
              setName(e.target.value);
              setUnchanged(false);
            }}
          />
        </Field>
        <KbFields
          broker={account.broker}
          branchNo={branchNo}
          traderId={traderId}
          onBranch={(v) => {
            setBranchNo(v);
            setUnchanged(false);
          }}
          onTrader={(v) => {
            setTraderId(v);
            setUnchanged(false);
          }}
          disabled={busy !== null}
        />
        {kbAccount && (
          <div data-slot="account-sheet-ipmac" className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label={E.ipLabel} slot="ip">
                <Input
                  aria-label={E.ipLabel}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={E.ipPlaceholder}
                  className="tabular-nums"
                  value={endpointDraft.draft.ip}
                  disabled={!settable || busy !== null}
                  aria-invalid={shownInvalid?.field === "ip" || undefined}
                  onChange={(e) => setEndpointField("ip", e.target.value)}
                />
              </Field>
              <Field label={E.macLabel} slot="mac">
                <Input
                  aria-label={E.macLabel}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="characters"
                  placeholder={E.macPlaceholder}
                  className="tabular-nums"
                  value={endpointDraft.draft.mac}
                  disabled={!settable || busy !== null}
                  aria-invalid={shownInvalid?.field === "mac" || undefined}
                  onChange={(e) => setEndpointField("mac", e.target.value)}
                />
              </Field>
            </div>
            {/* 도움말 자리 — 검증 오류가 보이면 오류 줄이 대신한다(둘이 동시에 나오지 않는다 · 입력마다 바뀌는 줄이라 role 없음). */}
            {shownInvalid ? (
              <p data-slot="account-sheet-ipmac-invalid" className={ERROR_LINE}>
                {ORDER_ENDPOINT_ERROR_TEXT[shownInvalid.error]}
              </p>
            ) : (
              <p data-slot="account-sheet-ipmac-help" className={NOTE}>
                {E.ipmacHelp}
              </p>
            )}
            {settable ? (
              endpoint?.mismatches.map((m) => (
                <p key={m.serverKey} data-slot="account-sheet-ipmac-mismatch" data-server={m.serverKey} className={WARN_LINE}>
                  {E.ipmacMismatch(m.serverKey, m, E.mismatchTailSheet)}
                </p>
              ))
            ) : (
              <p data-slot="account-sheet-ipmac-not-linked" className={NOTE}>
                {T.notLinkedNote}
              </p>
            )}
          </div>
        )}
        {linked && <p className={NOTE}>{kbAccount ? T.fanoutNoteKb : T.fanoutNote}</p>}
        {error && (
          <p data-slot="account-sheet-error" role="alert" className={ERROR_LINE}>
            {error}
          </p>
        )}
        {unchanged && (
          <p data-slot="account-sheet-unchanged" className={NOTE}>
            {E.unchanged}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose} className={cn(ADMIN_BUTTON_SECONDARY, "ml-auto")}>
            {T.cancel}
          </Button>
          <Button type="submit" size="sm" disabled={!ready} className={ADMIN_BUTTON_PRIMARY}>
            {T.save}
          </Button>
        </div>
      </form>

      <div className={HR} />

      <section data-slot="account-sheet-costs" className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold text-[var(--fg)]">
          {T.costTitle}
          {settable && <span className="ml-2 text-[12px] font-normal text-[var(--muted-fg)]">{T.costSubtitle}</span>}
        </h3>
        <AccountCostFields
          broker={account.broker}
          accountNo={account.accountNo}
          summary={costs.summary}
          slots={costs.slots}
          saveBudget={(krw) => setAdminAccountBudget(account.broker, account.accountNo, krw).then(flattenFanout)}
          saveFee={(v) =>
            setAdminAccountFee(account.broker, account.accountNo, v.feePpm, v.sellTaxPpm).then(flattenFanout)
          }
          releaseOn={account}
          disabled={!settable}
          onChanged={onSaved}
        />
        {!settable && (
          <p data-slot="account-sheet-costs-not-linked" className={cn("mt-1.5", NOTE)}>
            {T.notLinkedNote}
          </p>
        )}
      </section>

      <div className={HR} />

      <section data-slot="account-sheet-users" className="flex flex-col gap-1">
        <h3 className="text-[13px] font-semibold text-[var(--fg)]">
          {T.usersTitle} <span className="font-normal text-[var(--muted-fg)]">{T.usersCount(account.users.length)}</span>
        </h3>
        {linked ? (
          <ul className="m-0 list-none p-0">
            {account.users.map((u) => (
              <UserLine key={u.dmaUserId} user={u} fanout={fanout.get(u.dmaUserId)} />
            ))}
          </ul>
        ) : (
          <p className={NOTE}>{T.noUsers}</p>
        )}
      </section>

      <div className={HR} />

      <section data-slot="account-sheet-delete" className="flex flex-col gap-2 pt-1">
        {linked ? (
          <div className="flex items-center gap-3">
            <p data-slot="account-sheet-delete-locked" className={cn(NOTE, "min-w-0 flex-1")}>
              {T.deleteLocked}
            </p>
            <Button type="button" size="sm" variant="destructive" disabled className="text-[12px] font-semibold">
              {T.delete}
            </Button>
          </div>
        ) : confirming ? (
          <div
            data-slot="account-sheet-confirm"
            role="group"
            aria-label={T.delete}
            className="rounded-[12px] border border-[var(--border-subtle)] px-3.5 py-3"
          >
            <p className="text-[13px] leading-[1.5] break-keep text-[var(--fg)]">
              {T.deleteConfirm(
                `${BROKER_LABEL[account.broker]} ${account.accountNo}${account.name ? ` ${account.name}` : ""}`,
              )}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setConfirming(false);
                  setDeleteError(null);
                }}
                className={cn(ADMIN_BUTTON_SECONDARY, "ml-auto")}
              >
                {T.cancel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => void remove()}
                className="text-[12px] font-semibold"
              >
                {T.delete}
              </Button>
            </div>
            {deleteError && (
              <p data-slot="account-sheet-delete-error" role="alert" className={cn("mt-2", ERROR_LINE)}>
                {deleteError}
              </p>
            )}
          </div>
        ) : (
          <div className="flex">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
              className="ml-auto text-[12px] font-semibold"
            >
              {T.delete}
            </Button>
          </div>
        )}
      </section>
    </AdminSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export type AccountMasterSheetProps =
  | ({ mode: "create" } & CreateProps)
  | ({ mode: "edit" } & EditProps);

export function AccountMasterSheet(props: AccountMasterSheetProps) {
  if (props.mode === "create") {
    return <CreateSheet accounts={props.accounts} onCreated={props.onCreated} onClose={props.onClose} />;
  }
  return (
    <EditSheet
      account={props.account}
      overview={props.overview}
      onSaved={props.onSaved}
      onDeleted={props.onDeleted}
      onClose={props.onClose}
    />
  );
}
