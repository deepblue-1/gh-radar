import {
  SETTLEMENT_ACCOUNTS,
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_PEOPLE,
  type SettlementAccKey,
  type SettlementKind,
  type SettlementLedgerBody,
  type SettlementPerson,
} from '@gh-radar/shared';

/**
 * Phase 44 — ⑥ 활동 줄 · ⑦ 거래 시트 · ⑨ 확인 창이 함께 쓰는 표시 글자.
 *
 * 화면 글자는 shared 상수(`SETTLEMENT_ACCOUNTS` · `SETTLEMENT_PEOPLE` · `SETTLEMENT_KIND_LABEL`)에서만 꺼낸다 —
 * 같은 계좌 · 사람 · 종류 이름이 화면마다 갈리지 않게.
 */

/** 값이 비어 있는 칸(모양이 어긋난 줄) — 화면 「—」. */
const EMPTY = '—';

/** 계좌 이름 「KB 정근형」. */
export function accLabel(accKey: SettlementAccKey): string {
  return SETTLEMENT_ACCOUNTS.find((a) => a.key === accKey)?.label ?? accKey;
}

/** 사람 이름 「김현중」. */
export function personName(person: SettlementPerson): string {
  return SETTLEMENT_PEOPLE[person].name;
}

/** 거래 종류 이름 「계좌 옮김」. */
export function ledgerKindLabel(kind: SettlementKind): string {
  return SETTLEMENT_KIND_LABEL[kind];
}

/**
 * 거래 흐름 「보낸 쪽 → 받은 쪽」(목업 `flowOf`).
 * 출자 = 사람 → 받은 계좌 · 계좌 옮김 = 보낸 계좌 → 받은 계좌 · 수익 출금 · 원금 회수 = 뺀 계좌 → 사람.
 */
export function ledgerFlowParts(
  row: Pick<SettlementLedgerBody, 'kind' | 'who' | 'fromAcc' | 'toAcc'>,
): { from: string; to: string } {
  const acc = (k: SettlementAccKey | null) => (k ? accLabel(k) : EMPTY);
  const who = (p: SettlementPerson | null) => (p ? personName(p) : EMPTY);
  if (row.kind === 'contribute') return { from: who(row.who), to: acc(row.toAcc) };
  if (row.kind === 'move') return { from: acc(row.fromAcc), to: acc(row.toAcc) };
  return { from: acc(row.fromAcc), to: who(row.who) };
}
