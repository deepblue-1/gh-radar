/**
 * 계좌 표시 글자.
 *
 * D-12 계좌 라벨 한 벌(Phase 32) — 소비처:
 *   ① 작업대 상단 줄 셀렉트 옵션(`accountFullLabelOf`)
 *   ② /me 계좌 칩(`accountChipLabelOf` · 칩 안은 상품명 · 번호 · 서버키 부분별 렌더)
 *   ③ 토스트 계좌 줄(`accountFullLabelOf`)
 *   ④ 사이드바 계좌 소제목(`accountShortLabelOf` · `title` 은 전체)
 * 계좌번호는 마스킹하지 않는다(D2 · S-5 — 본인 계좌 대조가 목적).
 * 함수는 글자를 자르지 않는다 — 자르기는 쓰는 곳 CSS(`truncate` + `title`) 몫이다(S11 overflow).
 */

/** 라벨 함수가 읽는 계좌 모양 — `RelayAccount` · `/me` 칩 선택지가 모두 이 모양을 만족한다. */
export interface AccountLabelInput {
  accountNo: string;
  name?: string;
  serverKey?: string;
}

/** 비지 않은 칸만 남긴다(빈 칸은 구분자 꼬리 없이 생략 — S11 loading). */
function filled(parts: readonly (string | undefined)[]): string[] {
  return parts.filter((p): p is string => typeof p === "string" && p !== "");
}

/**
 * 「번호 · 이름」 (quick-261007-h76).
 *
 * - 트레이딩 제목 옆 계좌칸(AccountPill) 옵션과 수동주문 폼 「주문계좌」 행이 **같은 글자**를 쓰게 하는
 *   단일 규칙이다. 사용자가 두 곳을 글자 그대로 대조한다(계좌칸에서 고른 계좌 = 주문 나갈 계좌인지).
 * - 이름이 비어 있으면 번호만 쓴다(「번호 · 」 꼬리 없음).
 * - 마스킹하지 않는다(UI-SPEC D2 — 본인 계좌 대조가 목적).
 */
export function accountLabelOf(accountNo: string, name?: string): string {
  return typeof name === 'string' && name !== '' ? `${accountNo} · ${name}` : accountNo;
}

/**
 * 전체 라벨 「{번호} · {상품명} · {서버키}」(D-12). 빈 칸은 「 · 」 꼬리 없이 생략한다
 * (예 「8765-4321 · KYOBO119」 · 「5555-0001」).
 */
export function accountFullLabelOf(a: AccountLabelInput): string {
  return filled([a.accountNo, a.name, a.serverKey]).join(" · ");
}

/**
 * 칩 라벨 「{상품명} {번호} {서버키}」 — /me 계좌 칩의 접근 이름(칩 글자 그대로 · 빈 칸 생략).
 * 예 「김알렉스 1234-5678 KB120」.
 */
export function accountChipLabelOf(a: AccountLabelInput): string {
  return filled([a.name, a.accountNo, a.serverKey]).join(" ");
}

/**
 * 짧은 라벨(사이드바 계좌 소제목 — 32-05). 상품명이 비었거나, `siblings` 중 **다른 계좌**가 같은 상품명 ∧
 * 같은 서버키면 상품명만으로는 구분이 안 되므로 번호를 쓴다(`isNumber: true` — 쓰는 곳이 mono 로 그린다).
 */
export function accountShortLabelOf(
  a: AccountLabelInput,
  siblings: readonly AccountLabelInput[],
): { text: string; isNumber: boolean } {
  const name = a.name ?? "";
  if (name === "") return { text: a.accountNo, isNumber: true };
  const clash = siblings.some(
    (s) => s.accountNo !== a.accountNo && (s.name ?? "") === name && s.serverKey === a.serverKey,
  );
  return clash ? { text: a.accountNo, isNumber: true } : { text: name, isNumber: false };
}
