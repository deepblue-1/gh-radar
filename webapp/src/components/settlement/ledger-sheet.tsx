"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_KIND_ORDER,
  SETTLEMENT_PEOPLE,
  SETTLEMENT_PERSON_ORDER,
  SETTLEMENT_VIA_LABEL,
  appliedEffectAt,
  effectDiff,
  isSettlementMarketHours,
  kstDateIso,
  nowBudgetsOfAccounts,
  personAllowedFor,
  reflectEffect,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementKind,
  type SettlementLedgerBody,
  type SettlementLedgerRow,
  type SettlementPerson,
  type SettlementVia,
} from "@gh-radar/shared";

import { AdminSheet } from "@/components/admin/admin-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { ReflectBox, defaultReflectOn, reflectPreviewLines } from "./reflect-box";

/**
 * Phase 44 — 「거래 기록」 · 「거래 고치기」 시트(⑦ · UI-SPEC ⑦ · E7 · D-05 · D-07 ~ D-13 · D-19 · D-23 · D-27 · D-29).
 *
 * - 칸 순서(D-27): 무슨 거래 → 계좌 · 사람 → 금액 → 날짜 → 메모 → 「예수금에도 반영」 상자. 종류는 네 가지뿐(D-05 · D-07) —
 *   손익을 손으로 더하는 칸 · 공동 비용 종류가 없다.
 * - 처음 값(사용자 확정 2026-11-20): 「수익 출금」 · 계좌 · 사람 안 고름 · 경로 「계좌이체」 · 날짜 오늘(KST · 시트를 연 순간 · WR-01) ·
 *   금액 빈 칸. 필요한 계좌 · 사람을 다 고르기 전에는 「저장」 비활성 · 미리 보기 줄 없음.
 * - 종류를 바꿔도 같은 이름 칸은 값을 이어받는다(목업 `draftTx` — 뺀 = 보낸 계좌 · 받은 계좌 · 사람이 한 상태).
 * - 금액(D-09)은 만원 — 숫자만 · 최대 7자리 · 천단위 콤마 · 저장 값 = 만원 × 10,000 원.
 * - D-29: 출자 · 원금 회수인데 고른 계좌 묶음 비율에 없는 사람(현중 · 근형 묶음의 심쥬니)은 알약을 막는다(흐림 ·
 *   `aria-disabled` · 방향키 건너뜀). 종류 · 계좌를 바꿔 지금 고른 사람이 막히면 사람 선택을 비운다.
 * - 스위치(D-11 · D-23): 새 거래는 날짜가 오늘이면 켜짐 · 지난 날짜면 꺼짐 — 날짜를 바꿀 때마다 다시 적용한다.
 *   고치기는 반영했던 거래면 켜짐(날짜를 바꿔도) · 아니면 날짜 규칙. 미리 보기 = `effectDiff(appliedEffectAt(옛 줄, 지금 값), reflectEffect(초안))`
 *   (옛 줄 pend 는 server 와 같은 목표값 대조 · CR-01).
 * - 검증은 「저장」 을 누를 때. 오류는 칸별 — 그 칸(금액 · 날짜 입력 또는 관련 알약)을 고치면 그 칸 오류만 지운다(researcher decision 14).
 * - 토스트 · alert 창 없음. 저장 실패는 하단 버튼 위 오류 줄 「저장하지 못했어요 · <message>」 로 말한다.
 */

export const LEDGER_SHEET_TEXT = {
  titleNew: "거래 기록",
  titleEdit: "거래 고치기",
  kind: "무슨 거래",
  moveFrom: "보낸 계좌",
  toAcc: "받은 계좌",
  via: "어떻게 옮겼나",
  contributeWho: "넣은 사람",
  withdrawFrom: "뺀 계좌",
  withdrawWho: "받는 사람",
  amount: "금액",
  manwon: "만원",
  date: "날짜",
  memo: "메모",
  cancel: "취소",
  save: "저장",
  amountEmpty: "금액을 넣어 주세요",
  sameAcc: "보낸 계좌와 받은 계좌가 같아요",
  dateEmpty: "날짜를 골라 주세요",
  dateFuture: "미래 날짜는 적을 수 없어요",
  saveFailed: "저장하지 못했어요",
} as const;

const T = LEDGER_SHEET_TEXT;

/** 시트 입력 상태 — 금액은 만원 숫자 문자열(콤마 없음), 경로는 계좌 옮김이 아니어도 들고 다닌다(이어받기). */
export interface LedgerDraft {
  kind: SettlementKind;
  fromAcc: SettlementAccKey | null;
  toAcc: SettlementAccKey | null;
  who: SettlementPerson | null;
  via: SettlementVia;
  amountManwon: string;
  txDate: string;
  memo: string;
}

/** 금액 상한 — 9,999,999만원(D-09 · server zod 와 같은 7자리). */
const AMOUNT_MAX_DIGITS = 7;

function amountKrwOf(amountManwon: string): number {
  const digits = amountManwon.replace(/\D/g, "");
  return (digits === "" ? 0 : Number(digits)) * 10_000;
}

/** 저장 바디 — 종류에 맞지 않는 칸은 null(server zod · DB CHECK 와 같은 칸 모양). */
export function ledgerDraftToBody(draft: LedgerDraft, reflect: boolean): SettlementLedgerBody {
  const base = { txDate: draft.txDate, kind: draft.kind, amountKrw: amountKrwOf(draft.amountManwon), memo: draft.memo, reflect };
  if (draft.kind === "move") {
    return { ...base, who: null, fromAcc: draft.fromAcc, toAcc: draft.toAcc, via: draft.via };
  }
  if (draft.kind === "contribute") {
    return { ...base, who: draft.who, fromAcc: null, toAcc: draft.toAcc, via: null };
  }
  return { ...base, who: draft.who, fromAcc: draft.fromAcc, toAcc: null, via: null };
}

/** 사람-묶음 규칙(D-29)을 따질 계좌 — 출자 = 받은 계좌 · 원금 회수 = 뺀 계좌 · 그 밖은 없음. */
function poolAccOf(d: LedgerDraft): SettlementAccKey | null {
  if (d.kind === "contribute") return d.toAcc;
  if (d.kind === "withdraw_principal") return d.fromAcc;
  return null;
}

function personBlocked(d: LedgerDraft, p: SettlementPerson): boolean {
  const acc = poolAccOf(d);
  return acc !== null && !personAllowedFor(d.kind, acc, p);
}

/** 막힌 조합이면 사람 선택을 비운다(D-29 — 이 플랜의 비우는 방식). */
function normalize(d: LedgerDraft): LedgerDraft {
  return d.who !== null && personBlocked(d, d.who) ? { ...d, who: null } : d;
}

/** 종류별 필요한 계좌 · 사람이 다 골라졌나(경로는 늘 골라져 있다). */
function isComplete(d: LedgerDraft): boolean {
  if (d.kind === "move") return d.fromAcc !== null && d.toAcc !== null;
  if (d.kind === "contribute") return d.who !== null && d.toAcc !== null;
  return d.fromAcc !== null && d.who !== null;
}

interface FieldErrors {
  amount: string | null;
  date: string | null;
}

const NO_ERRORS: FieldErrors = { amount: null, date: null };

function validate(d: LedgerDraft, today: string): FieldErrors {
  let amount: string | null = null;
  if (amountKrwOf(d.amountManwon) <= 0) amount = T.amountEmpty;
  else if (d.kind === "move" && d.fromAcc !== null && d.fromAcc === d.toAcc) amount = T.sameAcc;
  let date: string | null = null;
  if (d.txDate === "") date = T.dateEmpty;
  else if (d.txDate > today) date = T.dateFuture;
  return { amount, date };
}

function newDraft(today: string): LedgerDraft {
  return { kind: "withdraw_profit", fromAcc: null, toAcc: null, who: null, via: "transfer", amountManwon: "", txDate: today, memo: "" };
}

function draftOfRow(row: SettlementLedgerRow): LedgerDraft {
  return {
    kind: row.kind,
    fromAcc: row.fromAcc,
    toAcc: row.toAcc,
    who: row.who,
    via: row.via ?? "transfer",
    amountManwon: String(Math.floor(row.amountKrw / 10_000)),
    txDate: row.txDate,
    memo: row.memo,
  };
}

function amountDisplay(amountManwon: string): string {
  return amountManwon === "" ? "" : Number(amountManwon).toLocaleString("ko-KR");
}

export interface LedgerSheetProps {
  open: boolean;
  mode: "new" | "edit";
  /** 고칠 줄(고치기일 때만). */
  row: SettlementLedgerRow | null;
  /** 응답 `accounts` — 미리 보기의 지금 예수금. */
  accounts: readonly SettlementAccountView[];
  /** 응답 `now` — 오늘(KST)의 아랫선. 시트를 열 때 브라우저 시계와 비교해 늦은 날짜를 오늘로 쓴다(WR-01). */
  nowIso: string;
  onClose: () => void;
  /** 저장 — 거부하면 시트가 하단 오류 줄을 보인다. 성공 뒤 닫기 · 다시 불러오기는 부르는 쪽 몫. */
  onSave: (body: SettlementLedgerBody) => Promise<void>;
}

const LABEL = "text-[length:var(--t-caption)] leading-[1.5] text-[var(--muted-fg)]";
const ERROR_LINE = "text-[length:var(--t-caption)] leading-[1.5] break-keep text-[var(--destructive)]";
const FOOT_BUTTON = "h-11 flex-1 text-[14px] font-semibold";

/**
 * 시트를 연 순간의 KST 오늘(WR-01) — 응답 `now` 와 브라우저 시계 중 늦은 날짜. 응답 `now` 만 쓰면 자정을 넘겨 열어 둔 탭에서
 * 어제를 「오늘」 로 보아(스위치 켜짐 · 오늘 날짜는 `max` 와 검증에 막힘) 지난 날짜 거래를 반영한 기록이 남는다. 브라우저 시계가
 * 늦게 가도 응답 `now` 아래로 내려가지 않는다. 미래 날짜의 최종 판정은 server(D-12 · KST 오늘)다.
 */
function openedToday(nowIso: string): string {
  const fromServer = kstDateIso(new Date(nowIso));
  const fromClock = kstDateIso(new Date());
  return fromClock > fromServer ? fromClock : fromServer;
}

export function LedgerSheet({ open, mode, row, accounts, nowIso, onClose, onSave }: LedgerSheetProps) {
  const editRow = mode === "edit" ? row : null;
  const reflectDefault = (date: string, todayIso: string) => (editRow?.reflect ? true : defaultReflectOn(date, todayIso));
  const initialDraft = (todayIso: string) => (editRow ? draftOfRow(editRow) : newDraft(todayIso));

  // 「오늘」 은 시트를 열 때마다 다시 정한다(아래 세션 맞추기) — 열린 동안은 바뀌지 않는다.
  const [today, setToday] = useState<string>(() => openedToday(nowIso));
  const [draft, setDraft] = useState<LedgerDraft>(() => initialDraft(today));
  const [reflect, setReflect] = useState<boolean>(() => reflectDefault(initialDraft(today).txDate, today));
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 열 때마다 처음 값으로(새 거래 · 고칠 줄이 바뀌면) — 렌더 중 상태 맞추기(React 「이전 props 저장」 꼴).
  const session = open ? (editRow ? `edit:${editRow.id}` : "new") : null;
  const [seen, setSeen] = useState<string | null>(session);
  if (session !== seen) {
    setSeen(session);
    if (session !== null) {
      const t = openedToday(nowIso);
      const d = initialDraft(t);
      setToday(t);
      setDraft(d);
      setReflect(reflectDefault(d.txDate, t));
      setErrors(NO_ERRORS);
      setBusy(false);
      setSaveError(null);
    }
  }

  const ids = useId();
  const amountId = `${ids}-amount`;
  const dateId = `${ids}-date`;
  const memoId = `${ids}-memo`;

  const complete = isComplete(draft);
  const body = ledgerDraftToBody(draft, reflect);
  const lines = complete
    ? reflectPreviewLines(
        effectDiff(editRow ? appliedEffectAt(editRow, nowBudgetsOfAccounts(accounts)) : {}, reflectEffect(body)),
        accounts,
      )
    : [];

  /** 알약 변경 — 계좌 · 종류를 바꾸면 금액 칸의 「같은 계좌」 오류만 지운다(관련 알약). */
  const pickPill = (patch: Partial<LedgerDraft>, accRelated: boolean) => {
    setDraft((d) => normalize({ ...d, ...patch }));
    if (accRelated) setErrors((e) => (e.amount === T.sameAcc ? { ...e, amount: null } : e));
  };

  const onAmount = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length > AMOUNT_MAX_DIGITS) return;
    setDraft((d) => ({ ...d, amountManwon: digits.replace(/^0+(?=\d)/, "") }));
    setErrors((e) => ({ ...e, amount: null }));
  };

  const onDate = (value: string) => {
    setDraft((d) => ({ ...d, txDate: value }));
    setReflect(reflectDefault(value, today));
    setErrors((e) => ({ ...e, date: null }));
  };

  const submit = async () => {
    if (busy || !complete) return;
    const next = validate(draft, today);
    setErrors(next);
    if (next.amount !== null || next.date !== null) return;
    setBusy(true);
    setSaveError(null);
    try {
      await onSave(ledgerDraftToBody(draft, reflect));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setSaveError(message ? `${T.saveFailed} · ${message}` : T.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const accOptions = SETTLEMENT_ACCOUNTS.map((a) => ({ value: a.key, label: a.label }));
  const personOptions = SETTLEMENT_PERSON_ORDER.map((p) => ({
    value: p,
    label: SETTLEMENT_PEOPLE[p].name,
    disabled: personBlocked(draft, p),
  }));

  const fromField = (label: string) => (
    <Field label={label}>
      <PillGroup
        label={label}
        options={accOptions}
        value={draft.fromAcc}
        locked={busy}
        onChange={(v) => pickPill({ fromAcc: v }, true)}
      />
    </Field>
  );
  const toField = (
    <Field label={T.toAcc}>
      <PillGroup
        label={T.toAcc}
        options={accOptions}
        value={draft.toAcc}
        locked={busy}
        onChange={(v) => pickPill({ toAcc: v }, true)}
      />
    </Field>
  );
  const whoField = (label: string) => (
    <Field label={label}>
      <PillGroup
        label={label}
        options={personOptions}
        value={draft.who}
        locked={busy}
        onChange={(v) => pickPill({ who: v }, false)}
      />
    </Field>
  );

  let fields: ReactNode;
  if (draft.kind === "move") {
    fields = (
      <>
        {fromField(T.moveFrom)}
        {toField}
        <Field label={T.via}>
          <PillGroup
            label={T.via}
            options={(["transfer", "corp_service"] as const).map((v) => ({ value: v, label: SETTLEMENT_VIA_LABEL[v] }))}
            value={draft.via}
            locked={busy}
            onChange={(v) => pickPill({ via: v }, false)}
          />
        </Field>
      </>
    );
  } else if (draft.kind === "contribute") {
    fields = (
      <>
        {whoField(T.contributeWho)}
        {toField}
      </>
    );
  } else {
    fields = (
      <>
        {fromField(T.withdrawFrom)}
        {whoField(T.withdrawWho)}
      </>
    );
  }

  return (
    <AdminSheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title={editRow ? T.titleEdit : T.titleNew}
      footer={
        <div className="flex w-full min-w-0 flex-col gap-2">
          {saveError && (
            <p role="alert" data-slot="ledger-save-error" className={ERROR_LINE}>
              {saveError}
            </p>
          )}
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="secondary"
              data-slot="ledger-cancel"
              className={FOOT_BUTTON}
              disabled={busy}
              onClick={onClose}
            >
              {T.cancel}
            </Button>
            <Button
              type="button"
              data-slot="ledger-save"
              className={FOOT_BUTTON}
              aria-busy={busy}
              disabled={busy || !complete}
              onClick={() => void submit()}
            >
              {T.save}
            </Button>
          </div>
        </div>
      }
    >
      <div data-slot="ledger-sheet" className="flex flex-col gap-4 pt-2">
        <Field label={T.kind}>
          <PillGroup
            label={T.kind}
            options={SETTLEMENT_KIND_ORDER.map((k) => ({ value: k, label: SETTLEMENT_KIND_LABEL[k] }))}
            value={draft.kind}
            locked={busy}
            onChange={(v) => pickPill({ kind: v }, true)}
          />
        </Field>

        {fields}

        <Field label={T.amount} htmlFor={amountId}>
          <div className="flex items-center gap-2">
            <Input
              id={amountId}
              data-slot="ledger-amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={amountDisplay(draft.amountManwon)}
              readOnly={busy}
              aria-invalid={errors.amount !== null ? true : undefined}
              aria-describedby={errors.amount !== null ? `${amountId}-error` : undefined}
              onChange={(e) => onAmount(e.target.value)}
              className="tabular-nums"
            />
            <span className="flex-none text-[length:var(--t-sm)]">{T.manwon}</span>
          </div>
          {errors.amount !== null && (
            <p id={`${amountId}-error`} role="alert" data-slot="ledger-error-amount" className={ERROR_LINE}>
              {errors.amount}
            </p>
          )}
        </Field>

        <Field label={T.date} htmlFor={dateId}>
          <Input
            id={dateId}
            data-slot="ledger-date"
            type="date"
            max={today}
            value={draft.txDate}
            readOnly={busy}
            aria-invalid={errors.date !== null ? true : undefined}
            aria-describedby={errors.date !== null ? `${dateId}-error` : undefined}
            onChange={(e) => onDate(e.target.value)}
          />
          {errors.date !== null && (
            <p id={`${dateId}-error`} role="alert" data-slot="ledger-error-date" className={ERROR_LINE}>
              {errors.date}
            </p>
          )}
        </Field>

        <Field label={T.memo} htmlFor={memoId}>
          <Input
            id={memoId}
            data-slot="ledger-memo"
            maxLength={100}
            autoComplete="off"
            value={draft.memo}
            readOnly={busy}
            onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
          />
        </Field>

        <ReflectBox
          on={reflect}
          onToggle={setReflect}
          lines={lines}
          marketHours={isSettlementMarketHours(new Date())}
          disabled={busy}
        />
      </div>
    </AdminSheet>
  );
}

/** 칸 — 라벨(12 `--muted-fg`) → 칸 `gap-2`. 입력칸은 `<label htmlFor>`, 알약 묶음은 묶음의 `aria-label` 이 이름을 진다. */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} data-slot="ledger-field-label" className={LABEL}>
          {label}
        </label>
      ) : (
        <span data-slot="ledger-field-label" className={LABEL}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

interface PillOption<V extends string> {
  value: V;
  label: string;
  disabled?: boolean;
}

/**
 * 선택 알약 묶음 — `role="radiogroup"`(이름 = 칸 이름) · 알약 `role="radio" aria-checked`.
 * 방향키 이동(pnl 계좌 칩 문법 — 옮긴 알약을 고른다)은 `aria-disabled` 알약을 건너뛴다. 포커스 링 클래스는 새로 달지 않는다.
 */
function PillGroup<V extends string>({
  label,
  options,
  value,
  locked,
  onChange,
}: {
  label: string;
  options: readonly PillOption<V>[];
  value: V | null;
  locked: boolean;
  onChange: (value: V) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const enabled = options.filter((o) => !o.disabled);
  const tabValue = enabled.some((o) => o.value === value) ? value : (enabled[0]?.value ?? null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(
      rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([aria-disabled="true"])') ?? [],
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || buttons.length === 0) return;
    let to: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (at + 1) % buttons.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (at - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = buttons.length - 1;
    else return;
    e.preventDefault();
    const target = buttons[to]!;
    target.focus();
    const next = target.dataset.value as V | undefined;
    if (!locked && next !== undefined && next !== value) onChange(next);
  };

  return (
    <div ref={rowRef} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled ? true : undefined}
            data-value={o.value}
            tabIndex={o.value === tabValue ? 0 : -1}
            onClick={() => {
              if (o.disabled || locked || on) return;
              onChange(o.value);
            }}
            className={cn(
              "inline-flex h-8 flex-none items-center rounded-full border px-3 text-[length:var(--t-sm)] whitespace-nowrap transition-colors",
              on
                ? "border-[var(--fg)] bg-transparent font-semibold text-[var(--fg)]"
                : "border-transparent bg-[var(--muted)] font-normal text-[var(--muted-fg)]",
              o.disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
