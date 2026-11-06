"use client";

import {
  brokerOfServerKey,
  type AdminAccountMaster,
  type AdminDmaInput,
  type AdminUsersOverview,
} from "@gh-radar/shared";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AccountPicker, masterKeyOf } from "./account-picker";
import { ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from "./reflect-chip";

/**
 * DmaConnectFields — 「DMA 연결 · 필수」 그룹 (Phase 29 D-16 · D-23 ③ · 목업 A `dmaGroup(false)`).
 *
 * DMA 사용자 id(모든 서버 공통) → 비밀번호 · 확인 → 첫 계좌(**등록된 계좌에서 고르기** — quick 261106-lwu D-10 · 목업 ⑤
 * 방식 A `AccountPicker` · 연결/취소 버튼 없이 선택값만) → 고른 계좌 증권사의 등록 서버 체크 → 안내 문장. 생성 바디 모양
 * (`AdminDmaInput.account`)은 그대로이고 값을 마스터에서 채운다. 두 자리가 같은 필드를 쓴다:
 *
 * - 「+ 사용자」 생성 시트(trader/admin) — `POST /api/admin/users { email, role, dma }`.
 * - DMA 연결이 없는 trader/admin 의 편집 시트 「DMA 연결」 — `POST /api/admin/users/:email/dma`.
 *
 * 제어 컴포넌트다(`value` · `onChange`) — 제출 · 버튼은 부모 몫이고, 부모는 `validateDmaConnect` 로 버튼을 켠다.
 *
 * - 계좌번호 · 지점 · 트레이더 입력칸은 없다 — 계좌 자체 값은 「계좌」 메뉴(마스터)에서만 만든다.
 * - **등록 서버는 고른 계좌 증권사의 서버만** 보인다(계좌를 고르기 전엔 짧은 안내). 사용이 꺼진 서버는 보이되 고를 수 없다.
 *   같은 KB 계좌를 두 KB 서버에 동시에 체크할 수 있다. 계좌를 바꾸면 서버 체크는 풀린다.
 * - 기본 체크는 없다 — 의도하지 않은 서버 등록을 막는다(29-17 계좌 추가와 같은 결정).
 * - 오류 한 줄은 **채운 칸이 형식에 맞지 않을 때만** 그 칸 아래에 선다(빈 칸은 버튼 비활성으로 말한다).
 *   부모가 주는 `errors`(서버 409 `DMA_USER_EXISTS` → 「이미 있는 DMA id 예요」 등)는 형식 오류보다 앞선다.
 */

export const DMA_CONNECT_TEXT = {
  title: "DMA 연결",
  required: "필수",
  dmaUserId: "DMA 사용자 id",
  dmaUserIdHint: "· 모든 서버 공통",
  dmaUserIdPlaceholder: "예: kimtr",
  password: "비밀번호",
  passwordHint: "· 저장 뒤 다시 볼 수 없음",
  confirm: "확인",
  firstAccount: "첫 계좌",
  servers: "등록 서버",
  serverDisabled: "사용 꺼진 서버",
  serversPick: "계좌를 고르면 그 증권사의 서버가 보여요",
  note: "고른 계좌의 증권사 서버만 고를 수 있다. 같은 KB 계좌를 두 KB 서버에 동시에 등록해도 된다.",
  dmaUserExists: "이미 있는 DMA id 예요",
} as const;

export const DMA_CONNECT_ERROR = {
  dmaUserIdSpace: "DMA id 에는 공백을 넣을 수 없어요",
  dmaUserIdBytes: "DMA id 는 8바이트 이하예요(한글은 1자 3바이트)",
  passwordTooLong: "비밀번호는 64자 이하예요",
  passwordMismatch: "두 값이 달라요",
  servers: "고른 계좌 증권사의 사용 중인 서버만 등록할 수 있어요",
} as const;

/** 폼 값 — 비밀번호 확인까지 들고 있다(제출 바디는 `toDmaInput`). */
export interface DmaConnectValue {
  dmaUserId: string;
  password: string;
  confirm: string;
  /** 고른 첫 계좌(마스터 1행) — 고르기 전 null(quick 261106-lwu D-10). */
  account: AdminAccountMaster | null;
  servers: string[];
}

export const EMPTY_DMA_CONNECT: DmaConnectValue = {
  dmaUserId: "",
  password: "",
  confirm: "",
  account: null,
  servers: [],
};

export type DmaConnectField = "dmaUserId" | "password" | "confirm" | "account" | "servers";
export type DmaConnectErrors = Partial<Record<DmaConnectField, string>>;

export interface DmaConnectValidation {
  /** 모든 칸이 채워지고 형식에 맞는가 — 버튼 활성 조건. */
  valid: boolean;
  /** 채운 칸의 형식 오류만(빈 칸은 오류가 아니라 「미완성」 이다). */
  errors: DmaConnectErrors;
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * 순수 검증 — server zod(`AdminDmaInputSchema`)와 같은 규칙: DMA id 1~8바이트 · 공백 불가 · 비밀번호 1~64 · 확인 일치 ·
 * 첫 계좌 선택 필수(값은 마스터라 형식 검사가 없다) · 서버 1개 이상 · 서버마다 고른 계좌 증권사 접두 일치 + 레지스트리에서 사용 중.
 */
export function validateDmaConnect(
  value: DmaConnectValue,
  servers: AdminUsersOverview["servers"],
): DmaConnectValidation {
  const errors: DmaConnectErrors = {};
  const broker = value.account?.broker ?? null;

  if (/\s/.test(value.dmaUserId)) errors.dmaUserId = DMA_CONNECT_ERROR.dmaUserIdSpace;
  else if (utf8Bytes(value.dmaUserId) > 8) errors.dmaUserId = DMA_CONNECT_ERROR.dmaUserIdBytes;

  if (value.password.length > 64) errors.password = DMA_CONNECT_ERROR.passwordTooLong;
  if (value.password !== "" && value.confirm !== "" && value.password !== value.confirm) {
    errors.confirm = DMA_CONNECT_ERROR.passwordMismatch;
  }

  const usable = new Set(servers.filter((s) => s.enabled && s.broker === broker).map((s) => s.key));
  if (value.servers.some((k) => brokerOfServerKey(k) !== broker || !usable.has(k))) {
    errors.servers = DMA_CONNECT_ERROR.servers;
  }

  const complete =
    value.dmaUserId !== "" &&
    value.password !== "" &&
    value.confirm !== "" &&
    value.account !== null &&
    value.servers.length > 0;

  return { valid: complete && Object.keys(errors).length === 0, errors };
}

/**
 * 폼 값 → `AdminDmaInput`(모양 그대로 · quick 261106-lwu D-10). 계좌 값은 고른 마스터 값(정규화 번호 · 계좌명 · 지점 · 트레이더 —
 * 서버도 마스터 값으로 덮는다) · 첫 계좌 priority 0 · 서버는 레지스트리 순. 계좌를 고르지 않은 값은 부르지 않는다(`validateDmaConnect`).
 */
export function toDmaInput(value: DmaConnectValue, servers: AdminUsersOverview["servers"]): AdminDmaInput {
  const a = value.account;
  if (a === null) throw new Error("toDmaInput: 첫 계좌가 없다 — validateDmaConnect 로 먼저 막는다");
  return {
    dmaUserId: value.dmaUserId,
    password: value.password,
    account: {
      broker: a.broker,
      accountNo: a.accountNo,
      name: a.name,
      branchNo: a.branchNo,
      traderId: a.traderId,
      priority: 0,
    },
    servers: servers.map((s) => s.key).filter((k) => value.servers.includes(k)),
  };
}

/**
 * 제출 실패 → 화면 자리. relay 409 `DMA_USER_EXISTS` 는 DMA id 칸 아래(「이미 있는 DMA id 예요」), 409 `ACCOUNT_NOT_REGISTERED`
 * (quick 261106-lwu — 마스터에 없는 계좌)는 첫 계좌 아래 서버 message 그대로, 그 밖(400 · 409
 * `DMA_LINKED` · 502 `RELAY_FAILED` · 503 …)은 하단 한 줄 「<무엇> 하지 못했어요 · <서버 message>」.
 */
export function dmaConnectFailure(err: unknown, failed: string): { fields: DmaConnectErrors; line: string | null } {
  if (err instanceof ApiClientError && err.code === "DMA_USER_EXISTS") {
    return { fields: { dmaUserId: DMA_CONNECT_TEXT.dmaUserExists }, line: null };
  }
  if (err instanceof ApiClientError && err.code === "ACCOUNT_NOT_REGISTERED") {
    return { fields: { account: err.message }, line: null };
  }
  const detail = err instanceof ApiClientError ? err.message : null;
  return { fields: {}, line: detail ? `${failed} · ${detail}` : failed };
}

/** 바깥 오류는 그 칸을 고치면 사라진다 — 바뀐 칸의 바깥 오류만 지운 새 묶음. */
export function clearChangedErrors(
  errors: DmaConnectErrors,
  prev: DmaConnectValue,
  next: DmaConnectValue,
): DmaConnectErrors {
  let out = errors;
  for (const f of Object.keys(errors) as DmaConnectField[]) {
    const changed =
      f === "servers"
        ? prev.servers.join() !== next.servers.join()
        : f === "account"
          ? (prev.account ? masterKeyOf(prev.account) : null) !== (next.account ? masterKeyOf(next.account) : null)
          : prev[f] !== next[f];
    if (changed) {
      if (out === errors) out = { ...errors };
      delete out[f];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 모양 — 목업 `.grp` · `.fld` · `.lb` · `.inp` · `.two` · `.sv` · `.note`
// ─────────────────────────────────────────────────────────────────────────────

/** 그룹 틀 — 목업 `.grp`(hairline · r14 · 4px 14px 14px). */
export const DMA_GROUP = "mt-3.5 rounded-[14px] border border-[var(--border-subtle)] px-3.5 pt-1 pb-3.5";
const FIELD = "border-b border-[var(--border-subtle)] py-3";
const FIELD_LAST = "pt-3";
const LABEL = "mb-1.5 flex items-center gap-1.5 text-[12px] text-[var(--muted-fg)]";
const LABEL_OPT = "font-medium text-[var(--faint)]";
/** 입력 — 목업 `.inp`(15px · r10). */
export const ADMIN_INPUT = "h-10 rounded-[10px] text-[15px]";
const ERROR_LINE = "mt-1.5 text-[12.5px] break-keep text-[var(--destructive)]";
const NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
/** 서버 체크 알약 — 목업 `.sv`(12.5px · 6px 10px · 둥근 알약 · hairline) · `.sv.off`(흐림). */
const SERVER_PILL =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1.5 text-[12.5px] text-[var(--fg-2)] has-disabled:cursor-default has-disabled:opacity-40";

function FieldError({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" data-slot="admin-dma-error" className={ERROR_LINE}>
      {text}
    </p>
  );
}

export interface DmaConnectFieldsProps {
  /** 서버 레지스트리(`AdminUsersOverview.servers`) — 등록 서버 후보. */
  servers: AdminUsersOverview["servers"];
  /** 계좌 마스터 전체(「첫 계좌」 피커 후보 · quick 261106-lwu D-10) — null 이면 못 읽음. */
  accounts: readonly AdminAccountMaster[] | null;
  value: DmaConnectValue;
  onChange: (next: DmaConnectValue) => void;
  /** 바깥 오류(서버 응답) — 형식 오류보다 앞선다. */
  errors?: DmaConnectErrors;
  /** 제출 중 — 칸을 잠근다. */
  disabled?: boolean;
  /** 그룹 머리(「DMA 연결 · 필수」)를 그릴지 — 편집 시트처럼 바깥이 제목을 가질 때 false. */
  showTitle?: boolean;
  /** 입력 id 접두(한 화면에 둘이 동시에 없지만 label 연결이 겹치지 않게). */
  idPrefix?: string;
  className?: string;
}

export function DmaConnectFields({
  servers,
  accounts,
  value,
  onChange,
  errors: external = {},
  disabled = false,
  showTitle = true,
  idPrefix = "admin-dma",
  className,
}: DmaConnectFieldsProps) {
  const local = validateDmaConnect(value, servers).errors;
  const err = (f: DmaConnectField) => external[f] ?? local[f];
  const set = <K extends keyof DmaConnectValue>(key: K, v: DmaConnectValue[K]) => onChange({ ...value, [key]: v });
  const id = (f: string) => `${idPrefix}-${f}`;

  const broker = value.account?.broker ?? null;
  const candidates = broker ? servers.filter((s) => s.broker === broker) : [];

  return (
    <div data-slot="admin-dma-connect" data-broker={broker ?? undefined} className={cn(DMA_GROUP, className)}>
      {showTitle && (
        <div className="flex items-center gap-2 pt-2.5 pb-0.5 text-[13px] font-bold text-[var(--fg)]">
          {DMA_CONNECT_TEXT.title}
          <span className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS.warn)}>{DMA_CONNECT_TEXT.required}</span>
        </div>
      )}

      <div className={FIELD}>
        <label htmlFor={id("id")} className={LABEL}>
          {DMA_CONNECT_TEXT.dmaUserId} <span className={LABEL_OPT}>{DMA_CONNECT_TEXT.dmaUserIdHint}</span>
        </label>
        <Input
          id={id("id")}
          placeholder={DMA_CONNECT_TEXT.dmaUserIdPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          value={value.dmaUserId}
          aria-invalid={err("dmaUserId") ? true : undefined}
          aria-describedby={err("dmaUserId") ? id("id-error") : undefined}
          onChange={(e) => set("dmaUserId", e.target.value)}
          className={ADMIN_INPUT}
        />
        <FieldError id={id("id-error")} text={err("dmaUserId")} />
      </div>

      <div className={FIELD}>
        <div className={LABEL}>
          {DMA_CONNECT_TEXT.password} <span className={LABEL_OPT}>{DMA_CONNECT_TEXT.passwordHint}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="password"
            aria-label={DMA_CONNECT_TEXT.password}
            placeholder={DMA_CONNECT_TEXT.password}
            autoComplete="new-password"
            maxLength={64}
            disabled={disabled}
            value={value.password}
            aria-invalid={err("password") ? true : undefined}
            onChange={(e) => set("password", e.target.value)}
            className={ADMIN_INPUT}
          />
          <Input
            type="password"
            aria-label={`${DMA_CONNECT_TEXT.password} ${DMA_CONNECT_TEXT.confirm}`}
            placeholder={DMA_CONNECT_TEXT.confirm}
            autoComplete="new-password"
            maxLength={64}
            disabled={disabled}
            value={value.confirm}
            aria-invalid={err("confirm") ? true : undefined}
            onChange={(e) => set("confirm", e.target.value)}
            className={ADMIN_INPUT}
          />
        </div>
        <FieldError id={id("password-error")} text={err("password") ?? err("confirm")} />
      </div>

      <div className={FIELD_LAST}>
        <AccountPicker
          accounts={accounts}
          selectedKey={value.account ? masterKeyOf(value.account) : null}
          onSelect={(a) => onChange({ ...value, account: a, servers: [] })}
          title={DMA_CONNECT_TEXT.firstAccount}
          idPrefix={id("account")}
          disabled={disabled}
        />
        <FieldError id={id("account-error")} text={err("account")} />

        <div className={cn(LABEL, "mt-2.5")}>{DMA_CONNECT_TEXT.servers}</div>
        {broker === null && <p className={NOTE}>{DMA_CONNECT_TEXT.serversPick}</p>}
        <div role="group" aria-label={DMA_CONNECT_TEXT.servers} className="flex flex-wrap gap-1.5">
          {candidates.map((s) => (
            <label
              key={s.key}
              data-slot="admin-dma-server"
              data-server={s.key}
              title={s.enabled ? undefined : DMA_CONNECT_TEXT.serverDisabled}
              className={SERVER_PILL}
            >
              <Checkbox
                aria-label={s.key}
                checked={value.servers.includes(s.key)}
                disabled={disabled || !s.enabled}
                onCheckedChange={(v) =>
                  set(
                    "servers",
                    v === true ? [...value.servers.filter((k) => k !== s.key), s.key] : value.servers.filter((k) => k !== s.key),
                  )
                }
              />
              <span>{s.key}</span>
            </label>
          ))}
        </div>
        <FieldError id={id("servers-error")} text={err("servers")} />
        <p className={NOTE}>{DMA_CONNECT_TEXT.note}</p>
      </div>
    </div>
  );
}
