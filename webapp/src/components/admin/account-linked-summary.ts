import {
  normalizeAccountNo,
  normalizeOrderIp,
  normalizeOrderMac,
  summarizeAccountCosts,
  summarizeOrderEndpoint,
  type AccountBudgetMismatch,
  type AccountCostSummary,
  type AccountFeeMismatch,
  type AdminAccountMaster,
  type AdminAccountSaveResponse,
  type AdminAccountView,
  type AdminCommandResponse,
  type AdminOrderEndpoint,
  type AdminUsersOverview,
  type OrderEndpointMismatch,
  type OrderEndpointSummary,
} from "@gh-radar/shared";

/**
 * account-linked-summary — 계좌 수정 시트의 「그 계좌를 쓰는 사용자 · 서버」 집계(quick 261106-ntl N-01 · N-02).
 *
 * 규칙은 shared `summarizeAccountCosts` · `summarizeOrderEndpoint` 한 벌을 **사용자마다** 적용한다(유효 주문 서버 · 87/67 정본 —
 * 웹이 판정을 새로 만들지 않는다). 여기는 사용자 간 정본 · 불일치 집계와 칩 라벨(「<DMA id> · <서버>」)만 한다.
 *
 * - 자리(slot) = 마스터 `users`(DMA id 오름차순) × 그 사용자의 active 등록 서버(마스터 순서). removing 은 자리가 아니다(팬아웃 대상 밖 —
 *   서버 `activeLinkUsers` 와 같은 판정).
 * - 값 = 사용자 개요(`GET /api/admin/users`)의 그 사용자 · 같은 계좌 뷰(`costs` · `orderEndpoints`). 개요의 사용자는 이메일 단위라 같은
 *   DMA id 가 여러 줄일 수 있어 첫 줄을 쓴다. 개요가 없거나 그 사용자가 없으면 그 자리는 「확인 전」.
 * - 정본 = 마스터 순으로 shared 판정이 「확인 전」 이 아닌 첫 사용자의 출처 값 · source = 그 사용자 출처 자리 라벨.
 * - 불일치 = 정본 자리를 뺀 값-아는 모든 자리 중 다른 것(비용은 예수금 · (수수료, 매도세) 쌍 따로 · IP/MAC 은 둘 중 하나라도 다르면).
 */

/** 칩 · 줄 라벨 — 「kimtr · KB120」. */
export function fanoutSlotLabel(dmaUserId: string, serverKey: string): string {
  return `${dmaUserId} · ${serverKey}`;
}

export interface LinkedSlot {
  dmaUserId: string;
  serverKey: string;
  label: string;
}

export interface LinkedAccount {
  /** 마스터 users 순(DMA id 오름차순) × 그 사용자의 active 서버(마스터 순서). */
  slots: LinkedSlot[];
  /** DMA id → 개요의 이 계좌 뷰(없으면 키 없음). */
  views: ReadonlyMap<string, AdminAccountView>;
  /** 이 계좌 증권사 레지스트리(개요 없으면 []). */
  registry: AdminUsersOverview["servers"];
}

export function linkedAccountOf(master: AdminAccountMaster, overview: AdminUsersOverview | null): LinkedAccount {
  const slots: LinkedSlot[] = [];
  for (const u of master.users) {
    for (const s of u.servers) {
      if (s.state === "active") {
        slots.push({ dmaUserId: u.dmaUserId, serverKey: s.serverKey, label: fanoutSlotLabel(u.dmaUserId, s.serverKey) });
      }
    }
  }
  const views = new Map<string, AdminAccountView>();
  if (overview) {
    const want = normalizeAccountNo(master.accountNo);
    for (const u of master.users) {
      const row = overview.users.find((x) => x.dmaUserId === u.dmaUserId);
      const view = row?.accounts.find((a) => a.broker === master.broker && normalizeAccountNo(a.accountNo) === want);
      if (view) views.set(u.dmaUserId, view);
    }
  }
  const registry = overview ? overview.servers.filter((s) => s.broker === master.broker) : [];
  return { slots, views, registry };
}

/** 자리를 가진 사용자(마스터 순 · 중복 없음). */
function slotUsers(l: LinkedAccount): string[] {
  return [...new Set(l.slots.map((s) => s.dmaUserId))];
}

const UNKNOWN_COSTS: AccountCostSummary = {
  state: "unknown",
  budgetKrw: 0,
  feePpm: 0,
  sellTaxPpm: 0,
  source: null,
  budgetMismatches: [],
  feeMismatches: [],
};

/** 예수금 · 수수료 · 매도세 — 사용자 간 정본 · 불일치 · 칩 자리(known = 그 자리 값을 앎). */
export function summarizeLinkedCosts(l: LinkedAccount): {
  summary: AccountCostSummary;
  slots: { label: string; known: boolean }[];
} {
  const valueOf = (s: LinkedSlot) => l.views.get(s.dmaUserId)?.costs?.[s.serverKey] ?? null;
  const slots = l.slots.map((s) => ({ label: s.label, known: valueOf(s) !== null }));

  let canon: { summary: AccountCostSummary; dmaUserId: string } | null = null;
  for (const dma of slotUsers(l)) {
    const view = l.views.get(dma);
    if (!view) continue;
    const s = summarizeAccountCosts({ account: view, registry: l.registry });
    if (s.state === "known" && s.source !== null) {
      canon = { summary: s, dmaUserId: dma };
      break;
    }
  }
  if (canon === null) return { summary: UNKNOWN_COSTS, slots };

  const { summary: c, dmaUserId } = canon;
  const source = fanoutSlotLabel(dmaUserId, c.source!);
  const budgetMismatches: AccountBudgetMismatch[] = [];
  const feeMismatches: AccountFeeMismatch[] = [];
  for (const s of l.slots) {
    const v = valueOf(s);
    if (v === null || s.label === source) continue;
    if (v.budgetKrw !== c.budgetKrw) budgetMismatches.push({ serverKey: s.label, budgetKrw: v.budgetKrw });
    if (v.feePpm !== c.feePpm || v.sellTaxPpm !== c.sellTaxPpm) {
      feeMismatches.push({ serverKey: s.label, feePpm: v.feePpm, sellTaxPpm: v.sellTaxPpm });
    }
  }
  return {
    summary: {
      state: "known",
      budgetKrw: c.budgetKrw,
      feePpm: c.feePpm,
      sellTaxPpm: c.sellTaxPpm,
      source,
      budgetMismatches,
      feeMismatches,
    },
    slots,
  };
}

/** 주문자 IP/MAC — 사용자 간 정본 · 불일치(`serverKey` · `source` = 자리 라벨). 87 정규화값 그대로(재정규화 금지). */
export function summarizeLinkedOrderEndpoint(l: LinkedAccount): OrderEndpointSummary {
  const valueOf = (s: LinkedSlot) => l.views.get(s.dmaUserId)?.orderEndpoints?.[s.serverKey] ?? null;
  let canon: { summary: OrderEndpointSummary; dmaUserId: string } | null = null;
  for (const dma of slotUsers(l)) {
    const view = l.views.get(dma);
    if (!view) continue;
    const s = summarizeOrderEndpoint({ account: view, registry: l.registry });
    if (s.state !== "unknown" && s.source !== null) {
      canon = { summary: s, dmaUserId: dma };
      break;
    }
  }
  if (canon === null) return { state: "unknown", orderIp: "", orderMac: "", source: null, mismatches: [] };

  const { summary: c, dmaUserId } = canon;
  const source = fanoutSlotLabel(dmaUserId, c.source!);
  const mismatches: OrderEndpointMismatch[] = [];
  for (const s of l.slots) {
    const v = valueOf(s);
    if (v === null || s.label === source) continue;
    if (v.orderIp !== c.orderIp || v.orderMac !== c.orderMac) {
      mismatches.push({
        serverKey: s.label,
        state: v.orderIp === "" && v.orderMac === "" ? "unset" : "set",
        orderIp: v.orderIp,
        orderMac: v.orderMac,
      });
    }
  }
  return { state: c.state, orderIp: c.orderIp, orderMac: c.orderMac, source, mismatches };
}

/**
 * 계좌 저장에 실을 주문자 IP/MAC(N-02) — `null` = 싣지 않음. 지난 카드 편집 저장 규칙(`editSaveBodyOf`)과 같은 판정:
 * 두 칸이 정규화 비교로 초깃값과 다르거나 사용자·서버 간 불일치(맞추기)일 때만 싣는다. 비교는 양쪽 정규화(실패하면 원문) ·
 * 보내는 값은 입력 원문 trim(정규화값을 보내지 않는다 — 정규화는 gh-trade). 「확인 전」(초깃값 "" "")에서 두 칸을 빈 채로 두면
 * 바뀐 것이 아니라 싣지 않는다(모르는 87 을 빈 값으로 덮지 않는다 · 30 IN-06).
 */
export function orderEndpointToSend(i: {
  initial: { ip: string; mac: string };
  draft: { ip: string; mac: string };
  mismatched: boolean;
}): AdminOrderEndpoint | null {
  const norm = (normalize: (raw: string) => string | null, raw: string) => normalize(raw) ?? raw;
  const ip = i.draft.ip.trim();
  const mac = i.draft.mac.trim();
  const changed =
    norm(normalizeOrderIp, ip) !== norm(normalizeOrderIp, i.initial.ip.trim()) ||
    norm(normalizeOrderMac, mac) !== norm(normalizeOrderMac, i.initial.mac.trim());
  if (!changed && !i.mismatched) return null;
  return { orderIp: ip, orderMac: mac };
}

/**
 * 팬아웃 응답 → `AdminCommandResponse`(`AccountCostFields` 의 칩 · 줄 입력). 결과 server 는 「<DMA id> · <서버>」 로(code · message ·
 * outcome 보존) · 사용자 relay 거부/실패는 그 사용자 한 건 `{ server: DMA id, outcome: failed, message }` 로 접는다.
 */
export function flattenFanout(res: AdminAccountSaveResponse): AdminCommandResponse {
  return {
    results: res.fanout.flatMap((f) =>
      f.error
        ? [{ server: f.dmaUserId, outcome: "failed" as const, message: f.error.message }]
        : f.results.map((r) => ({ ...r, server: fanoutSlotLabel(f.dmaUserId, r.server) })),
    ),
  };
}
