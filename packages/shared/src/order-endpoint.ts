/**
 * Phase 30 (30-02) — KB 계좌 **주문자 IP/MAC** 정규화 · 검증 · 표시 판정 한 벌.
 *
 * 정규화 규칙은 gh-trade `server/src/broker/base/AccountUtil.h` `NormalizeOrderIp/Mac` 이식이다 — 규칙이 갈라지면 웹 사전 검증이
 * 서버보다 느슨하거나 엄격해져 code 13 을 가리거나 「변경 없음」 을 오판한다(D-13). 규칙 한 벌 · 소비자 셋:
 *   - relay 멱등 비교(`admin.ts` `sameValues` — 의도 값과 87 값을 정규화해 비교).
 *   - Express 개요(`deriveAdminUsersOverview` 가 87 값을 싣고, 카드가 `summarizeOrderEndpoint` 로 그린다).
 *   - webapp 계좌 편집기 검증 · 표시 · 「변경 없음」 판정.
 *   - webapp 표시(D-17 `formatOrderIp/Mac` — 87 정규화값을 사람이 읽는 표기로 · 렌더 자리 전용, 비교 · 전송은 정규화값).
 *
 * - **trim 하지 않는다** — gh-trade 서버와 같다(`" 10.41.1.124"` 는 code 13). trim 은 호출자 몫이고 `validateOrderEndpointInput` 만 trim 한다.
 * - **웹은 정규화값을 보내지 않는다(D-07)** — 입력 원문(trim)을 그대로 보내고 서버가 정규화한다. 여기 정규화는 비교 · 「변경 없음」 판정에만.
 * - 주문자 IP/MAC 은 사용자 PC 식별 정보 — **로그 · 감사 줄에 값을 싣지 않는다.**
 * - 오류 문구는 여기 두지 않는다(webapp `ACCOUNT_EDITOR_TEXT` 몫) — 여기는 오류 종류 · 칸만 낸다.
 *
 * `admin.ts` 가 이 파일을 런타임 import 한다(`sameValues`) — 여기서 admin 은 `import type` 으로만 가져온다(순환은 타입 전용).
 */

import type { AdminAccountView } from "./admin";
import { resolveEffectiveOrderServer } from "./order-server";

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

/**
 * 87 정규화 IP → 사람이 읽는 점표기(D-17 · `010041001124` → `10.41.1.124`). **렌더 자리 전용** — 비교 · 전송 · `summarizeOrderEndpoint` 는
 * 정규화값을 쓴다(D-17 · D-07). 정확히 ASCII 숫자 12자리이고 세 자리씩 끊은 네 옥텟이 모두 0~255 일 때만 앞자리 0 없이 점으로 잇는다.
 * **형식 밖은 원문 그대로**(빈 값 · `999999999999` · 이미 점표기 등) — 왕복 항등(`normalizeOrderIp(formatOrderIp(v)) === v`)이 되는 값만 바꾼다.
 * trim 하지 않는다(정규화 함수와 같은 규율).
 */
export function formatOrderIp(value: string): string {
  if (!/^\d{12}$/.test(value)) return value;
  const octets = [0, 3, 6, 9].map((i) => Number(value.slice(i, i + 3)));
  return octets.every((v) => v <= 255) ? octets.map(String).join(".") : value;
}

/**
 * 87 정규화 MAC → 사람이 읽는 콜론 대문자(D-17 · `1CFD087D978E` → `1C:FD:08:7D:97:8E`). **렌더 자리 전용** — 비교 · 전송 ·
 * `summarizeOrderEndpoint` 는 정규화값을 쓴다(D-17 · D-07). 정확히 대문자 16진 12자일 때만 두 자리씩 콜론으로 잇는다.
 * **형식 밖은 원문 그대로**(빈 값 · 소문자 · 이미 구분자 등) — 왕복 항등(`normalizeOrderMac(formatOrderMac(v)) === v`)이 되는 값만 바꾼다.
 * trim 하지 않는다(정규화 함수와 같은 규율).
 */
export function formatOrderMac(value: string): string {
  return /^[0-9A-F]{12}$/.test(value) ? (value.match(/../g) as string[]).join(":") : value;
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

/** 출처 서버와 IP 또는 MAC 이 다른 다른 등록 서버 하나(UI-SPEC §1-4 경고 줄 한 줄). 값은 87 정규화값 그대로. */
export type OrderEndpointMismatch = { serverKey: string; state: "set" | "unset"; orderIp: string; orderMac: string };

/**
 * 계좌 카드의 IP/MAC 표시 판정(UI-SPEC §1-3 · §1-4). `state` — set 설정됨 · unset 미설정(서버 NIC 값) · unknown 확인 전(값을 아는
 * 등록 서버가 없음). `source` = 표시값을 가져온 서버 · `mismatches` = 값을 아는 다른 등록 서버 중 출처와 다른 것(레지스트리 순).
 */
export type OrderEndpointSummary = {
  state: "set" | "unset" | "unknown";
  orderIp: string;
  orderMac: string;
  source: string | null;
  mismatches: OrderEndpointMismatch[];
};

export type SummarizeOrderEndpointInput = {
  account: Pick<AdminAccountView, "servers" | "orderServer" | "defaultOrderServer" | "orderEndpoints">;
  /** 서버 레지스트리(개요 `servers` — 레지스트리 순). 여기 없는 서버는 켜진 것으로 본다. */
  registry: readonly { key: string; enabled: boolean }[];
};

/**
 * 계좌 하나의 주문자 IP/MAC 표시값 · 출처 서버 · 불일치(D-09 · D-10 · UI-SPEC §1-3 · §1-4).
 *
 * - 출처 = 그 계좌의 **유효 주문 서버** — relay 라우팅과 같은 규칙 한 벌(`resolveEffectiveOrderServer` · GC-06 — 두 벌 금지).
 *   입력 구성은 웹 `OrderServerControl` 과 같다: 등록 = active 등록 서버(레지스트리 순 · 레지스트리에 없는 키는 뒤) 중 켜진 것 ·
 *   지정은 그 안에 있을 때만(꺼진 지정은 relay 도 무시). 유효 서버가 없으면 레지스트리 순 첫 active 등록 서버.
 * - 출처 서버의 87 값을 모르면(null) 값을 아는 첫 active 등록 서버로 내려간다. 아무도 모르면 `unknown`(「확인 전」).
 * - 불일치 = 값을 아는 다른 active 등록 서버 중 IP 또는 MAC 이 다른 것 — 모르는 서버는 비교하지 않는다. 87 값은 이미 정규화값이라
 *   문자열 비교만 한다(재정규화 금지).
 */
export function summarizeOrderEndpoint(input: SummarizeOrderEndpointInput): OrderEndpointSummary {
  const { account, registry } = input;
  const active = new Set(account.servers.filter((s) => s.state === "active").map((s) => s.serverKey));
  const order = registry.map((s) => s.key);
  const registered = [...order.filter((k) => active.has(k)), ...[...active].filter((k) => !order.includes(k))];
  const enabled = (k: string) => registry.find((s) => s.key === k)?.enabled ?? true;
  const enabledRegistered = registered.filter(enabled);
  const designated = account.orderServer ?? null;
  const preferred =
    resolveEffectiveOrderServer({
      designated: designated !== null && enabledRegistered.includes(designated) ? designated : null,
      defaultKey: account.defaultOrderServer ?? null,
      registered: enabledRegistered,
    })?.key ??
    registered[0] ??
    null;

  const values = account.orderEndpoints ?? {};
  const known = registered.filter((k) => values[k] != null);
  const source = preferred !== null && known.includes(preferred) ? preferred : (known[0] ?? null);
  const v = source !== null ? values[source] : null;
  if (source === null || v == null) return { state: "unknown", orderIp: "", orderMac: "", source: null, mismatches: [] };

  const stateOf = (e: { orderIp: string; orderMac: string }) => (e.orderIp === "" && e.orderMac === "" ? "unset" : "set");
  const mismatches: OrderEndpointMismatch[] = [];
  for (const k of known) {
    const e = values[k];
    if (k === source || e == null) continue;
    if (e.orderIp !== v.orderIp || e.orderMac !== v.orderMac) {
      mismatches.push({ serverKey: k, state: stateOf(e), orderIp: e.orderIp, orderMac: e.orderMac });
    }
  }
  return { state: stateOf(v), orderIp: v.orderIp, orderMac: v.orderMac, source, mismatches };
}
