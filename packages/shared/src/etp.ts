// RED 스텁 — GREEN 커밋에서 실제 판정으로 바뀐다.
export const ETP_NAME_PATTERN = /$^/;

export function isEtpProduct(
  _name: string | null | undefined,
  _securityGroup: string | null | undefined,
): boolean {
  return false;
}
