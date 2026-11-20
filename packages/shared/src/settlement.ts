import {
  accountCostOf,
  indexAccountCosts,
  normalizeAccountNo,
  type AdminAccountCost,
  type AdminAccountCostsRaw,
  type DmaBroker,
} from "./admin";
import { kstDateIso } from "./krxCalendar";
import { summarizeAccountCosts, type SummarizeAccountCostsInput } from "./order-endpoint";

/**
 * Phase 44 — 어드민 정산(`/admin/settlement`) 계약 · 순수 계산 한 벌(server · webapp 공용).
 *
 * 출처: 44-CONTEXT D-01(계좌 수익 = 예수금 − 넣은 돈) · D-03(예수금 = 어드민 계좌 메뉴와 같은 판정) · D-04(못 읽으면 마지막 읽은 값) ·
 * D-05 · D-07(거래 종류 네 가지뿐) · D-08(억 · 만 표기) · 목업 `.planning/sketches/033-admin-settlement-layout/a-real.html`.
 *
 * 단위: 목업은 **만원**, 이 파일은 **원**(D-09). 화면 표기는 아래 포매터 세 개로만 한다.
 * 시작값 · 경계 날짜 · 손익 보정 · 잔액 대조는 없다(D-02) — 넣은 돈은 거래 기록만으로, 수익은 예수금에서만 나온다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 상수 (R0)
// ─────────────────────────────────────────────────────────────────────────────

export type SettlementPerson = "H" | "G" | "J";

export const SETTLEMENT_PEOPLE: Readonly<Record<SettlementPerson, { name: string }>> = {
  H: { name: "김현중" },
  G: { name: "정근형" },
  J: { name: "심쥬니" },
};

export const SETTLEMENT_PERSON_ORDER: readonly SettlementPerson[] = ["H", "G", "J"];

export type SettlementAccKey = "kbG" | "kyH" | "kyG" | "kbH";
export type SettlementPoolId = "p1" | "p2";

export interface SettlementAccountDef {
  key: SettlementAccKey;
  label: string;
  /** 명의. */
  owner: SettlementPerson;
  pool: SettlementPoolId;
  broker: DmaBroker;
}

/** 계좌 4개(이 순서가 화면 순서). 계좌번호 대응은 DB `settlement_accounts` 가 쥔다. */
export const SETTLEMENT_ACCOUNTS: readonly SettlementAccountDef[] = [
  { key: "kbG", label: "KB 정근형", owner: "G", pool: "p1", broker: "KB" },
  { key: "kyH", label: "교보 김현중", owner: "H", pool: "p1", broker: "KYOBO" },
  { key: "kyG", label: "교보 정근형", owner: "G", pool: "p1", broker: "KYOBO" },
  { key: "kbH", label: "KB 김현중", owner: "H", pool: "p2", broker: "KB" },
];

export const SETTLEMENT_ACC_KEYS: readonly SettlementAccKey[] = SETTLEMENT_ACCOUNTS.map((a) => a.key);

export interface SettlementPoolDef {
  name: string;
  /** 사람별 몫(%) — 합 100. */
  ratio: Partial<Record<SettlementPerson, number>>;
  ratioLabel: string;
  /** 이 금액(원)을 넘는 수익부터 나눈다. */
  baseKrw?: number;
  /** 원금보장 — 손실을 먼저 떠안는 사람. */
  guard?: SettlementPerson;
}

export const SETTLEMENT_POOLS: Readonly<Record<SettlementPoolId, SettlementPoolDef>> = {
  p1: { name: "현중 · 근형", ratio: { H: 50, G: 50 }, ratioLabel: "5 : 5" },
  p2: {
    name: "쥬니",
    ratio: { J: 40, H: 30, G: 30 },
    ratioLabel: "4 : 3 : 3",
    baseKrw: 400_000_000,
    guard: "J",
  },
};

/** 거래 종류 — 이 네 가지뿐이다(D-05 · D-07). 손익을 손으로 더하는 종류 · 공동 비용 종류는 없다. */
export type SettlementKind = "withdraw_profit" | "withdraw_principal" | "contribute" | "move";

export const SETTLEMENT_KIND_LABEL: Readonly<Record<SettlementKind, string>> = {
  withdraw_profit: "수익 출금",
  withdraw_principal: "원금 회수",
  contribute: "출자",
  move: "계좌 옮김",
};

/** UI-SPEC ⑦ 종류 알약 순서. */
export const SETTLEMENT_KIND_ORDER: readonly SettlementKind[] = [
  "withdraw_profit",
  "withdraw_principal",
  "contribute",
  "move",
];

export type SettlementVia = "transfer" | "corp_service";

export const SETTLEMENT_VIA_LABEL: Readonly<Record<SettlementVia, string>> = {
  transfer: "계좌이체",
  corp_service: "법인 용역",
};

/** 음수 부호 — 하이픈이 아니라 U+2212(webapp `MINUS` 와 같은 글자). */
export const SETTLEMENT_MINUS = "−";

// ─────────────────────────────────────────────────────────────────────────────
// RPC `admin_settlement_raw()` 모양 — jsonb 키와 글자 그대로(pgTAP 이 키 집합을 잠근다)
// ─────────────────────────────────────────────────────────────────────────────

export interface SettlementRawServer {
  key: string;
  broker: DmaBroker;
  enabled: boolean;
  isOrderServer: boolean;
}

export interface SettlementRawAccount {
  accKey: SettlementAccKey;
  broker: DmaBroker;
  accountNo: string;
  name: string;
  /** DMA id 오름차순 · servers 는 레지스트리 순. */
  links: {
    dmaUserId: string;
    servers: { serverKey: string; state: "active" | "removing"; isOrder: boolean }[];
  }[];
}

/** 계좌별 마지막으로 읽은 예수금(D-04). */
export interface SettlementRawRead {
  accKey: SettlementAccKey;
  budgetKrw: number;
  source: "live" | "snapshot";
  serverKey: string | null;
  readAt: string;
}

/** 예수금 반영을 못 한 이유 — unreachable 지금 값 모름 · below_one 목표 1원 미만 · no_server 보낼 서버 없음 · failed · timeout. */
export type SettlementPendReason = "unreachable" | "below_one" | "no_server" | "failed" | "timeout";

export interface SettlementPendEntry {
  deltaKrw: number;
  targetKrw: number | null;
  reason: SettlementPendReason;
}

export type SettlementPend = Partial<Record<SettlementAccKey, SettlementPendEntry>>;

export interface SettlementLedgerRow {
  id: number;
  /** `YYYY-MM-DD`. */
  txDate: string;
  kind: SettlementKind;
  who: SettlementPerson | null;
  fromAcc: SettlementAccKey | null;
  toAcc: SettlementAccKey | null;
  via: SettlementVia | null;
  amountKrw: number;
  memo: string;
  settleId: number | null;
  reflect: boolean;
  pend: SettlementPend;
  seeded: boolean;
  createdBy: string | null;
  createdAt: string;
  editedBy: string | null;
  editedAt: string | null;
}

/** 정산 기록 안의 계좌 한 줄(그때의 값). */
export interface SettlementSnapshotAccount {
  accKey: SettlementAccKey;
  budgetKrw: number | null;
  putKrw: number;
  inKrw: number;
  outKrw: number;
  profitKrw: number | null;
  stale: boolean;
  readAt: string | null;
}

export interface SettlementSettleRow {
  id: number;
  pool: SettlementPoolId;
  profitKrw: number;
  shares: Partial<Record<SettlementPerson, number>>;
  snapshot: { accounts: SettlementSnapshotAccount[]; cumKrw: number; prevKrw: number };
  readAt: string;
  memo: string;
  createdBy: string;
  createdAt: string;
}

export interface SettlementRaw {
  accounts: SettlementRawAccount[];
  registry: SettlementRawServer[];
  reads: SettlementRawRead[];
  /** 지운 줄 제외 · id 오름차순. */
  ledger: SettlementLedgerRow[];
  /** 취소한 정산 제외 · id 내림차순. */
  settles: SettlementSettleRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// API 계약 — GET /api/admin/settlement 응답 · 쓰기 요청 · 응답
// ─────────────────────────────────────────────────────────────────────────────

/** known 방금 읽음 · stale 못 읽어 마지막 읽은 값 · unset 미설정(값 0 · 한 번도 못 읽음). */
export type SettlementAccountState = "known" | "stale" | "unset";

export interface SettlementAccountView {
  accKey: SettlementAccKey;
  label: string;
  owner: SettlementPerson;
  pool: SettlementPoolId;
  state: SettlementAccountState;
  /** unset 이면 null. */
  budgetKrw: number | null;
  readAt: string | null;
  /** 다른 (사용자, 서버) 자리의 예수금이 다르다(known 일 때만). */
  mismatch: boolean;
}

export interface SettlementView {
  /** 서버가 값을 만든 시각 — 화면 시각 계산의 기준. */
  now: string;
  accounts: SettlementAccountView[];
  ledger: SettlementLedgerRow[];
  settles: SettlementSettleRow[];
}

export interface SettlementLedgerBody {
  txDate: string;
  kind: SettlementKind;
  who: SettlementPerson | null;
  fromAcc: SettlementAccKey | null;
  toAcc: SettlementAccKey | null;
  via: SettlementVia | null;
  amountKrw: number;
  memo: string;
  reflect: boolean;
}

export interface SettlementDeleteBody {
  reflect: boolean;
}

export interface SettlementSettleBody {
  pool: SettlementPoolId;
  outs: SettlementPerson[];
  memo: string;
  reflect: boolean;
  expectPrev: number | null;
}

export interface SettlementCancelBody {
  reflect: boolean;
}

export interface SettlementWriteResponse {
  ok: true;
  id?: number;
  pend: SettlementPend;
  unreverted?: SettlementAccKey[];
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 예수금 선택(D-03) — 어드민 계좌 메뉴(webapp `summarizeLinkedCosts`)와 같은 판정
// ─────────────────────────────────────────────────────────────────────────────

export type SettlementBudgetPick =
  | {
      state: "known";
      budgetKrw: number;
      /** 출처 서버 키. */
      source: string;
      /** 출처 서버 값의 출처 — live = 67 · snapshot = 87. */
      budgetSource: AdminAccountCost["budgetSource"];
      mismatch: boolean;
    }
  | { state: "unknown" };

/**
 * 계좌 하나의 예수금 정본(D-03). 규칙은 webapp `summarizeLinkedCosts` 와 같다:
 *
 * - 자리 = 연결 사용자(RPC 가 DMA id 오름차순) × 그 사용자의 active 등록 서버. removing 은 자리가 아니다.
 * - 사용자마다 shared `summarizeAccountCosts`(유효 주문 서버 출처 · 67 live 우선 · 없으면 87)를 적용하고,
 *   그 판정이 known 인 **첫 사용자**의 출처 값이 정본이다. 아무도 모르면 unknown.
 * - 불일치 = 정본 자리를 뺀 값-아는 자리 중 예수금이 다른 것이 하나라도 있으면 true(같은 서버 · 다른 사용자도 자리다).
 */
export function settlementBudgetOf(
  account: SettlementRawAccount,
  registry: SettlementRawServer[],
  costs: AdminAccountCostsRaw | null,
): SettlementBudgetPick {
  const idx = indexAccountCosts(costs);
  const key = normalizeAccountNo(account.accountNo);
  const reg = registry.filter((r) => r.broker === account.broker);
  const defaultOrderServer = reg.find((r) => r.isOrderServer)?.key ?? null;

  const slots: { dmaUserId: string; serverKey: string; cost: AdminAccountCost | null }[] = [];
  let canon: { dmaUserId: string; serverKey: string; cost: AdminAccountCost } | null = null;

  for (const link of account.links) {
    const active = link.servers.filter((s) => s.state === "active");
    if (active.length === 0) continue;
    const costsBySrv: Record<string, AdminAccountCost | null> = {};
    for (const s of active) {
      const cost = accountCostOf(idx.get(s.serverKey)?.get(key), link.dmaUserId);
      costsBySrv[s.serverKey] = cost;
      slots.push({ dmaUserId: link.dmaUserId, serverKey: s.serverKey, cost });
    }
    if (canon !== null) continue;
    const view = {
      servers: link.servers.map((s) => ({ serverKey: s.serverKey, state: s.state })),
      orderServer: active.find((s) => s.isOrder)?.serverKey ?? null,
      defaultOrderServer,
      costs: costsBySrv,
    } as unknown as SummarizeAccountCostsInput["account"];
    const sum = summarizeAccountCosts({ account: view, registry: reg });
    if (sum.state === "known" && sum.source !== null) {
      const cost = costsBySrv[sum.source];
      if (cost) canon = { dmaUserId: link.dmaUserId, serverKey: sum.source, cost };
    }
  }

  if (canon === null) return { state: "unknown" };
  const c = canon;
  const mismatch = slots.some(
    (s) =>
      s.cost !== null &&
      !(s.dmaUserId === c.dmaUserId && s.serverKey === c.serverKey) &&
      s.cost.budgetKrw !== c.cost.budgetKrw,
  );
  return {
    state: "known",
    budgetKrw: c.cost.budgetKrw,
    source: c.serverKey,
    budgetSource: c.cost.budgetSource,
    mismatch,
  };
}

/**
 * 계좌 4개의 화면 값(D-03 · D-04) + 이번에 DB 에 남길 읽은 값.
 *
 * - raw 에 그 계좌가 없으면(계좌 대응 전) unset.
 * - relay 로 읽음(known) → reads 에 기록 · 값이 0 이면 unset(D-25 「미설정」 · readAt 은 지금) 아니면 known.
 * - 못 읽음 → DB 의 마지막 값 — 0 보다 크면 stale(그 값 · 그 시각) · 0 이면 unset(그 시각) · 없으면 unset(시각 없음).
 */
export function buildSettlementAccounts(
  raw: SettlementRaw,
  costs: AdminAccountCostsRaw | null,
  nowIso: string,
): { accounts: SettlementAccountView[]; reads: SettlementRawRead[] } {
  const reads: SettlementRawRead[] = [];
  const accounts = SETTLEMENT_ACCOUNTS.map((def): SettlementAccountView => {
    const base = { accKey: def.key, label: def.label, owner: def.owner, pool: def.pool };
    const acc = raw.accounts.find((a) => a.accKey === def.key);
    if (!acc) return { ...base, state: "unset", budgetKrw: null, readAt: null, mismatch: false };

    const pick = settlementBudgetOf(acc, raw.registry, costs);
    if (pick.state === "known") {
      reads.push({
        accKey: def.key,
        budgetKrw: pick.budgetKrw,
        source: pick.budgetSource,
        serverKey: pick.source,
        readAt: nowIso,
      });
      return pick.budgetKrw > 0
        ? { ...base, state: "known", budgetKrw: pick.budgetKrw, readAt: nowIso, mismatch: pick.mismatch }
        : { ...base, state: "unset", budgetKrw: null, readAt: nowIso, mismatch: false };
    }

    const last = raw.reads.find((r) => r.accKey === def.key);
    if (!last) return { ...base, state: "unset", budgetKrw: null, readAt: null, mismatch: false };
    return last.budgetKrw > 0
      ? { ...base, state: "stale", budgetKrw: last.budgetKrw, readAt: last.readAt, mismatch: false }
      : { ...base, state: "unset", budgetKrw: null, readAt: last.readAt, mismatch: false };
  });
  return { accounts, reads };
}

// ─────────────────────────────────────────────────────────────────────────────
// 넣은 돈 · 계좌 표 행 (R1 ~ R3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 넣은 돈(R1) — 들어온 돈(출자 · 옮겨 온 돈 = `toAcc` 가 그 계좌) − 나간 돈(수익 출금 · 원금 회수 · 옮겨 간 돈 = `fromAcc` 가 그 계좌).
 * 입력 ledger 는 지운 줄이 빠진 목록(RPC 가 뺀다).
 */
export function ledgerFlows(
  ledger: readonly SettlementLedgerRow[],
  acc: SettlementAccKey,
): { inKrw: number; outKrw: number; putKrw: number } {
  let inKrw = 0;
  let outKrw = 0;
  for (const t of ledger) {
    if (t.toAcc === acc) inKrw += t.amountKrw;
    if (t.fromAcc === acc) outKrw += t.amountKrw;
  }
  return { inKrw, outKrw, putKrw: inKrw - outKrw };
}

function poolDefs(pool: SettlementPoolId): readonly SettlementAccountDef[] {
  return SETTLEMENT_ACCOUNTS.filter((a) => a.pool === pool);
}

function budgetOf(accounts: readonly SettlementAccountView[], acc: SettlementAccKey): number | null {
  return accounts.find((a) => a.accKey === acc)?.budgetKrw ?? null;
}

/** 묶음의 계좌 표 행(목업 `accRows`) — 수익(R2) = 예수금이 null 이면 null 아니면 예수금 − 넣은 돈. */
export function poolAccountRows(
  pool: SettlementPoolId,
  accounts: readonly SettlementAccountView[],
  ledger: readonly SettlementLedgerRow[],
): SettlementSnapshotAccount[] {
  return poolDefs(pool).map((def) => {
    const view = accounts.find((a) => a.accKey === def.key);
    const budgetKrw = view?.budgetKrw ?? null;
    const f = ledgerFlows(ledger, def.key);
    return {
      accKey: def.key,
      budgetKrw,
      putKrw: f.putKrw,
      inKrw: f.inKrw,
      outKrw: f.outKrw,
      profitKrw: budgetKrw === null ? null : budgetKrw - f.putKrw,
      stale: view?.state === "stale",
      readAt: view?.readAt ?? null,
    };
  });
}

/** 묶음 계좌 전부 예수금을 안다(R3). */
export function poolOk(pool: SettlementPoolId, accounts: readonly SettlementAccountView[]): boolean {
  return poolDefs(pool).every((def) => budgetOf(accounts, def.key) !== null);
}

/** 묶음 누적 수익(R3) = Σ(예수금 − 넣은 돈) — 예수금 null 은 0 으로 더한다(목업 그대로 · 화면은 poolOk 로 가린다). */
export function cumProfit(
  pool: SettlementPoolId,
  accounts: readonly SettlementAccountView[],
  ledger: readonly SettlementLedgerRow[],
): number {
  let sum = 0;
  for (const def of poolDefs(pool)) sum += (budgetOf(accounts, def.key) ?? 0) - ledgerFlows(ledger, def.key).putKrw;
  return sum;
}

// ─────────────────────────────────────────────────────────────────────────────
// 표기(D-08 · UI-SPEC 「숫자 · 날짜 표기 계약」) — 입력은 원
// ─────────────────────────────────────────────────────────────────────────────

/** 만 미만 버림 뒤의 만 단위 절댓값. */
function manOf(krw: number): number {
  return Math.floor(Math.abs(krw) / 10_000);
}

function eokManOfMan(n: number): string {
  const e = Math.floor(n / 10_000);
  const m = n % 10_000;
  if (e > 0) return m > 0 ? `${e}억 ${m.toLocaleString("ko-KR")}만` : `${e}억`;
  return `${m.toLocaleString("ko-KR")}만`;
}

/** 부호 없음(목업 `won`) — 924,500,000 → 「9억 2,450만」 · 9,999 → 「0만」. */
export function formatEokMan(krw: number): string {
  return eokManOfMan(manOf(krw));
}

/** 음수만 −(목업 `fm`) — 만으로 내린 값이 0 이면 「0」. */
export function formatEokManMinus(krw: number): string {
  const n = manOf(krw);
  if (n === 0) return "0";
  return (krw < 0 ? SETTLEMENT_MINUS : "") + eokManOfMan(n);
}

/** + / −(목업 `sg`) — 만으로 내린 값이 0 이면 「0」(부호 · 색 없음). */
export function formatEokManSigned(krw: number): string {
  const n = manOf(krw);
  if (n === 0) return "0";
  return (krw > 0 ? "+" : SETTLEMENT_MINUS) + eokManOfMan(n);
}

/** 방향색 — 글자와 같은 판정(만으로 내린 값이 0 이면 색 없음). */
export function profitTone(krw: number): "up" | "down" | null {
  if (manOf(krw) === 0) return null;
  return krw > 0 ? "up" : "down";
}

// ─────────────────────────────────────────────────────────────────────────────
// 날짜 · 시각 라벨(KST · 24시) — `+9h → getUTC*`(krxCalendar.ts 와 같은 방식)
// ─────────────────────────────────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function kstParts(iso: string): { y: number; mo: number; d: number; hh: string; mm: string; date: string } {
  const t = new Date(iso);
  const k = new Date(t.getTime() + KST_OFFSET_MS);
  return {
    y: k.getUTCFullYear(),
    mo: k.getUTCMonth() + 1,
    d: k.getUTCDate(),
    hh: String(k.getUTCHours()).padStart(2, "0"),
    mm: String(k.getUTCMinutes()).padStart(2, "0"),
    date: kstDateIso(t),
  };
}

/** 거래 날짜(`YYYY-MM-DD`) — 올해(KST) 「M/D」 · 올해가 아닌 해의 12/31 「YY년 말」 · 그 밖 다른 해 「YY/M/D」. */
export function settlementDateLabel(isoDate: string, nowIso: string): string {
  const y = Number(isoDate.slice(0, 4));
  const mo = Number(isoDate.slice(5, 7));
  const d = Number(isoDate.slice(8, 10));
  if (y === kstParts(nowIso).y) return `${mo}/${d}`;
  const yy = isoDate.slice(2, 4);
  if (mo === 12 && d === 31) return `${yy}년 말`;
  return `${yy}/${mo}/${d}`;
}

/** 예수금 읽은 시각 — KST 오늘 「오늘 HH:MM」 · 어제 「어제 HH:MM」 · 그 전 「M/D HH:MM」. */
export function settlementReadLabel(iso: string, nowIso: string): string {
  const p = kstParts(iso);
  const now = new Date(nowIso);
  const hm = `${p.hh}:${p.mm}`;
  if (p.date === kstDateIso(now)) return `오늘 ${hm}`;
  if (p.date === kstDateIso(new Date(now.getTime() - DAY_MS))) return `어제 ${hm}`;
  return `${p.mo}/${p.d} ${hm}`;
}

/** 적은 · 고친 시각 「M/D HH:MM」(KST). */
export function settlementStampLabel(iso: string): string {
  const p = kstParts(iso);
  return `${p.mo}/${p.d} ${p.hh}:${p.mm}`;
}

/** 「HH:MM」(KST). */
export function settlementTimeLabel(iso: string): string {
  const p = kstParts(iso);
  return `${p.hh}:${p.mm}`;
}
