/**
 * Phase 29 Plan 46 — GC-06 (29-REVIEW-R2). 계좌의 **유효 주문 서버** 규칙 한 벌.
 *
 * 규칙: 지정 ?? (기본 서버가 등록 목록에 있거나 등록을 모르면 기본) ?? (등록 서버가 정확히 1대면 그 서버) ?? 없음.
 *
 * 왜: 종전 규칙(지정 ?? 증권사 기본)은 기본 서버에 그 계좌가 **등록돼 있는지** 보지 않았다. 그래서 KB121 에만 등록된 지정 없는
 * KB 계좌는 유효 KB120 · KB120 매핑에 없음 → 어느 세션도 소유하지 않아 화면 · 주문에서 사라졌다(fail closed). Admin 은 같은 계좌를
 * 「주문 서버 KB121(기본)」 으로 그려 사실과 반대였다. 오케스트레이터 결정 5(잠금) — relay 와 Admin 이 같은 규칙 한 벌을 쓴다.
 *
 * 소비자 둘 — **등록 목록만 달리 넣고 규칙은 이 함수 하나**(두 벌 금지):
 *   - relay `createOrderServerRouting().effectiveOrderServer` — 등록 = 그 증권사 켜진 서버 중 서버 매핑(79/87)에 그 계좌가 있는 키.
 *     기본 서버 매핑이 아직 미적재(부팅 · 파이프라인 재생성 직후)면 `defaultUnknown` — 종전대로 기본(계좌가 몇 초 사라지는 회귀 방지).
 *   - Admin 계좌 편집기(29-55) — 등록 = DB 의도 active 행의 서버.
 *
 * 지정의 유효성(켜진 서버 · 같은 증권사)은 **호출자가 거른 뒤** 넘긴다 — 넘어온 지정은 등록 여부와 무관하게 이긴다(DB 가 active
 * 등록 서버만 지정을 허용한다 · 지정 서버 매핑 미반영은 relay 가 세션을 열지 않는 것으로 막는다).
 */

/** 유효 주문 서버가 어떤 갈래로 정해졌나 — 화면 문구(「지정」 · 「기본」 · 「유일 등록 서버」)의 근거. */
export type EffectiveOrderServerVia = "designated" | "default" | "only-registered";

export type EffectiveOrderServer = { key: string; via: EffectiveOrderServerVia };

export type EffectiveOrderServerInput = {
  /** 유효한 지정 서버 키(켜짐 · 같은 증권사 — 호출자가 거름). 없으면 null/undefined. */
  designated?: string | null;
  /** 그 증권사 기본 주문 서버 키(켜짐). 없으면 null/undefined. */
  defaultKey?: string | null;
  /** 그 계좌가 등록된 서버 키(그 증권사 켜진 서버 — 순서는 호출자 정렬 그대로). */
  registered: readonly string[];
  /** 기본 서버의 등록 목록을 아직 모른다(relay — 기본 서버 매핑 미적재). 참이면 기본 서버를 등록된 것으로 본다. */
  defaultUnknown?: boolean;
};

export function resolveEffectiveOrderServer(input: EffectiveOrderServerInput): EffectiveOrderServer | null {
  const { designated, defaultKey, registered, defaultUnknown } = input;
  if (designated) return { key: designated, via: "designated" };
  if (defaultKey && (defaultUnknown === true || registered.includes(defaultKey))) {
    return { key: defaultKey, via: "default" };
  }
  const unique = [...new Set(registered)];
  if (unique.length === 1 && unique[0] !== undefined) return { key: unique[0], via: "only-registered" };
  return null;
}
