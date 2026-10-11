/**
 * Phase 29 Plan 46 — GC-06 (29-REVIEW-R2). 계좌의 **유효 주문 서버** 규칙 한 벌.
 *
 * 골격(RED) — 종전 규칙(지정 ?? 기본)만. GREEN 에서 등록 판정을 더한다.
 */

export type EffectiveOrderServerVia = "designated" | "default" | "only-registered";

export type EffectiveOrderServer = { key: string; via: EffectiveOrderServerVia };

export type EffectiveOrderServerInput = {
  designated?: string | null;
  defaultKey?: string | null;
  registered: readonly string[];
  defaultUnknown?: boolean;
};

export function resolveEffectiveOrderServer(input: EffectiveOrderServerInput): EffectiveOrderServer | null {
  if (input.designated) return { key: input.designated, via: "designated" };
  if (input.defaultKey) return { key: input.defaultKey, via: "default" };
  return null;
}
