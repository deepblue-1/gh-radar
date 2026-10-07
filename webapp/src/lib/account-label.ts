/**
 * 계좌 표시 글자 — 「번호 · 이름」 (quick-261007-h76).
 *
 * - 트레이딩 제목 옆 계좌칸(AccountPill) 옵션과 수동주문 폼 「주문계좌」 행이 **같은 글자**를 쓰게 하는
 *   단일 규칙이다. 사용자가 두 곳을 글자 그대로 대조한다(계좌칸에서 고른 계좌 = 주문 나갈 계좌인지).
 * - 이름이 비어 있으면 번호만 쓴다(「번호 · 」 꼬리 없음).
 * - 마스킹하지 않는다(UI-SPEC D2 — 본인 계좌 대조가 목적).
 */
export function accountLabelOf(accountNo: string, name?: string): string {
  return typeof name === 'string' && name !== '' ? `${accountNo} · ${name}` : accountNo;
}
