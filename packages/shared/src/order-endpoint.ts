/**
 * Phase 30 (30-02) — KB 계좌 **주문자 IP/MAC** 정규화 · 검증 · 표시 판정 한 벌.
 *
 * 정규화 규칙은 gh-trade `server/src/broker/base/AccountUtil.h` `NormalizeOrderIp/Mac` 이식이다 — 규칙이 갈라지면 웹 사전 검증이
 * 서버보다 느슨하거나 엄격해져 code 13 을 가리거나 「변경 없음」 을 오판한다(D-13). 규칙 한 벌 · 소비자 셋:
 *   - relay 멱등 비교(`admin.ts` `sameValues` — 의도 값과 87 값을 정규화해 비교).
 *   - Express 개요(`deriveAdminUsersOverview` 가 87 값을 싣고, 카드가 `summarizeOrderEndpoint` 로 그린다).
 *   - webapp 계좌 편집기 검증 · 표시 · 「변경 없음」 판정.
 *
 * - **trim 하지 않는다** — gh-trade 서버와 같다(`" 10.41.1.124"` 는 code 13). trim 은 호출자 몫이고 `validateOrderEndpointInput` 만 trim 한다.
 * - **웹은 정규화값을 보내지 않는다(D-07)** — 입력 원문(trim)을 그대로 보내고 서버가 정규화한다. 여기 정규화는 비교 · 「변경 없음」 판정에만.
 * - 주문자 IP/MAC 은 사용자 PC 식별 정보 — **로그 · 감사 줄에 값을 싣지 않는다.**
 * - 오류 문구는 여기 두지 않는다(webapp `ACCOUNT_EDITOR_TEXT` 몫) — 여기는 오류 종류 · 칸만 낸다.
 */

/**
 * gh-trade `NormalizeOrderIp` 와 같은 규칙. `""` = 빈 입력(미설정) · `null` = 형식 오류 · 그 밖 = 12자리 숫자.
 * 정확히 12자리 숫자면 그대로(옥텟 범위 검사 없음) · `a.b.c.d`(각 1~3자리 · 0~255)면 `%03d` 네 개를 잇는다. `\d` 는 ASCII 0-9 만이다.
 */
export function normalizeOrderIp(raw: string): string | null {
  if (raw === "") return "";
  if (/^\d{12}$/.test(raw)) return raw;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((v) => v > 255)) return null;
  return octets.map((v) => String(v).padStart(3, "0")).join("");
}

/**
 * gh-trade `NormalizeOrderMac` 와 같은 규칙. `""` = 빈 입력(미설정) · `null` = 형식 오류 · 그 밖 = 대문자 12자리 16진.
 * `:` · `-` 는 위치 · 개수와 무관하게 건너뛴다 — 구분자만 있는 입력(`"::"`)은 남는 것이 없어 실패.
 */
export function normalizeOrderMac(raw: string): string | null {
  if (raw === "") return "";
  const hex = raw.replace(/[:-]/g, "");
  return /^[0-9A-Fa-f]{12}$/.test(hex) ? hex.toUpperCase() : null;
}

/** 입력 검증 결과 — ok 면 정규화값(둘 다 빈 값이면 `""` `""` = 미설정으로 되돌리기), 아니면 첫 오류 하나와 표시할 칸. */
export type OrderEndpointValidation =
  | { ok: true; orderIp: string; orderMac: string }
  | { ok: false; error: "ip-format" | "mac-format" | "pair"; field: "ip" | "mac" };

/**
 * 웹 입력칸 검증(UI-SPEC §3 · D-04). 두 값을 trim 한 뒤 오류 **하나만** 낸다 — 우선순위 IP 형식 → MAC 형식 → 짝.
 * 짝 오류(한쪽만 적음)의 `field` 는 **비어 있는 칸**이다. 서버 짝 규칙(gh-trade Config.cpp — 둘 다 적거나 둘 다 비움)과 같다.
 */
export function validateOrderEndpointInput(input: { ip: string; mac: string }): OrderEndpointValidation {
  const ip = input.ip.trim();
  const mac = input.mac.trim();
  const orderIp = normalizeOrderIp(ip);
  if (orderIp === null) return { ok: false, error: "ip-format", field: "ip" };
  const orderMac = normalizeOrderMac(mac);
  if (orderMac === null) return { ok: false, error: "mac-format", field: "mac" };
  if ((orderIp === "") !== (orderMac === "")) {
    return { ok: false, error: "pair", field: orderIp === "" ? "ip" : "mac" };
  }
  return { ok: true, orderIp, orderMac };
}
