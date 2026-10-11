/**
 * Phase 30 (30-02) — 주문자 IP/MAC 정규화 · 검증 표(gh-trade `server/src/broker/base/AccountUtil.h` `NormalizeOrderIp/Mac` 이식).
 *
 * 규칙이 gh-trade 와 갈라지면 웹 사전 검증이 code 13 을 가리거나 「변경 없음」 을 오판한다 — 표본은 gh-trade 규칙 원문에서 뽑았다.
 * 정규화 함수는 trim 하지 않는다(gh-trade 와 같다) · validateOrderEndpointInput 만 trim 한다.
 */
import { describe, expect, it } from "vitest";

import type { AdminAccountView, AdminOrderEndpoint } from "../admin";
import {
  normalizeOrderIp,
  normalizeOrderMac,
  summarizeOrderEndpoint,
  validateOrderEndpointInput,
  type OrderEndpointSummary,
} from "../order-endpoint";

describe("normalizeOrderIp — gh-trade NormalizeOrderIp 이식 (D-04 · D-13)", () => {
  it.each([
    { name: "빈 입력 → \"\"(미설정)", input: "", expected: "" },
    { name: "12자리 숫자 → 그대로", input: "010041001124", expected: "010041001124" },
    { name: "12자리 숫자는 옥텟 검사 없음 → 그대로", input: "999999999999", expected: "999999999999" },
    { name: "a.b.c.d → %03d 네 개", input: "10.41.1.124", expected: "010041001124" },
    { name: "0.0.0.0 → 000000000000", input: "0.0.0.0", expected: "000000000000" },
    { name: "255.255.255.255 → 255255255255", input: "255.255.255.255", expected: "255255255255" },
    { name: "옥텟 256 → 실패", input: "256.1.1.1", expected: null },
    { name: "빈 옥텟 → 실패", input: "10..1.124", expected: null },
    { name: "꼬리 문자 → 실패", input: "10.41.1.124x", expected: null },
    { name: "옥텟 5개 → 실패", input: "1.2.3.4.5", expected: null },
    { name: "옥텟 3개 → 실패", input: "1.2.3", expected: null },
    { name: "4자리 옥텟 → 실패", input: "1000.1.1.1", expected: null },
    { name: "앞 공백 → 실패(trim 하지 않는다)", input: " 10.41.1.124", expected: null },
    { name: "11자리 숫자 → 실패", input: "01004100112", expected: null },
    { name: "전각 숫자 → 실패(ASCII 0-9 만)", input: "１０.41.1.124", expected: null },
  ])("$name", ({ input, expected }) => {
    expect(normalizeOrderIp(input)).toBe(expected);
  });
});

describe("normalizeOrderMac — gh-trade NormalizeOrderMac 이식 (D-04 · D-13)", () => {
  it.each([
    { name: "빈 입력 → \"\"(미설정)", input: "", expected: "" },
    { name: "콜론 소문자 → 대문자 12자", input: "1c:fd:08:7d:97:8e", expected: "1CFD087D978E" },
    { name: "하이픈 대문자 → 12자", input: "1C-FD-08-7D-97-8E", expected: "1CFD087D978E" },
    { name: "구분자 없음 소문자 → 대문자", input: "1cfd087d978e", expected: "1CFD087D978E" },
    { name: "구분자 위치 · 개수 무관", input: "1c::fd08:7d-97:8e", expected: "1CFD087D978E" },
    { name: "구분자만 → 실패", input: "::", expected: null },
    { name: "10자(5바이트) → 실패", input: "1c:fd:08:7d:97", expected: null },
    { name: "16진 밖 문자 → 실패", input: "1c:fd:08:7d:97:8g", expected: null },
    { name: "앞 공백 → 실패(trim 하지 않는다)", input: " 1cfd087d978e", expected: null },
  ])("$name", ({ input, expected }) => {
    expect(normalizeOrderMac(input)).toBe(expected);
  });
});

describe("validateOrderEndpointInput — trim 뒤 오류 하나(IP → MAC → 짝) (D-04)", () => {
  it.each([
    {
      name: "둘 다 빈 값 → ok(미설정으로 되돌리기)",
      input: { ip: "", mac: "" },
      expected: { ok: true, orderIp: "", orderMac: "" },
    },
    {
      name: "앞뒤 공백 · 점표기 · 콜론 → ok 정규화값",
      input: { ip: " 10.41.1.124 ", mac: "1c:fd:08:7d:97:8e" },
      expected: { ok: true, orderIp: "010041001124", orderMac: "1CFD087D978E" },
    },
    {
      name: "IP · MAC 둘 다 형식 오류 → IP 우선",
      input: { ip: "256.1.1.1", mac: "zz" },
      expected: { ok: false, error: "ip-format", field: "ip" },
    },
    {
      name: "MAC 형식 오류 → mac-format",
      input: { ip: "10.41.1.124", mac: "zz" },
      expected: { ok: false, error: "mac-format", field: "mac" },
    },
    {
      name: "IP 만 적음 → pair · 비어 있는 MAC 칸",
      input: { ip: "10.41.1.124", mac: "" },
      expected: { ok: false, error: "pair", field: "mac" },
    },
    {
      name: "MAC 만 적음 → pair · 비어 있는 IP 칸",
      input: { ip: "", mac: "1cfd087d978e" },
      expected: { ok: false, error: "pair", field: "ip" },
    },
    {
      name: "IP 형식 오류 + MAC 빈 값 → 형식 오류가 짝보다 먼저",
      input: { ip: "256.1.1.1", mac: "" },
      expected: { ok: false, error: "ip-format", field: "ip" },
    },
    {
      name: "공백뿐인 칸은 빈 값 → 둘 다 공백이면 ok",
      input: { ip: "   ", mac: " " },
      expected: { ok: true, orderIp: "", orderMac: "" },
    },
  ])("$name", ({ input, expected }) => {
    expect(validateOrderEndpointInput(input)).toEqual(expected);
  });
});

describe("summarizeOrderEndpoint — 출처 · 불일치 (D-09 · D-10)", () => {
  // 87 정규화값(재정규화하지 않는다). 가짜 값 — 실 PC 가 아니다.
  const SET_A: AdminOrderEndpoint = { orderIp: "010041001124", orderMac: "1CFD087D978E" };
  const SET_B: AdminOrderEndpoint = { orderIp: "010041001200", orderMac: "AABBCCDDEEFF" };
  const UNSET: AdminOrderEndpoint = { orderIp: "", orderMac: "" };
  const REGISTRY = [
    { key: "KB120", enabled: true },
    { key: "KB121", enabled: true },
    { key: "KB122", enabled: true },
  ];

  type AccountIn = Pick<AdminAccountView, "servers" | "orderServer" | "defaultOrderServer" | "orderEndpoints">;
  const account = (
    activeKeys: string[],
    orderEndpoints: AccountIn["orderEndpoints"],
    over: Partial<Pick<AdminAccountView, "orderServer" | "defaultOrderServer">> = {},
  ): AccountIn => ({
    servers: activeKeys.map((serverKey) => ({ serverKey, tone: "ok" as const, message: null, state: "active" as const })),
    orderServer: null,
    defaultOrderServer: "KB120",
    orderEndpoints,
    ...over,
  });
  const UNKNOWN: OrderEndpointSummary = { state: "unknown", orderIp: "", orderMac: "", source: null, mismatches: [] };

  it.each([
    {
      name: "지정 KB121(active · 켜짐) · 두 서버 값 있음 → 출처 KB121",
      account: account(["KB120", "KB121"], { KB120: SET_A, KB121: SET_A }, { orderServer: "KB121" }),
      registry: REGISTRY,
      expected: { state: "set", ...SET_A, source: "KB121", mismatches: [] },
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [KB120, KB121] → 출처 KB120",
      account: account(["KB120", "KB121"], { KB120: SET_A, KB121: SET_A }),
      registry: REGISTRY,
      expected: { state: "set", ...SET_A, source: "KB120", mismatches: [] },
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [KB121] 만 → 출처 KB121(유일 등록)",
      account: account(["KB121"], { KB121: SET_A }),
      registry: REGISTRY,
      expected: { state: "set", ...SET_A, source: "KB121", mismatches: [] },
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [KB121, KB122] → 유효 서버 없음 → 레지스트리 순 첫 active KB121",
      account: account(["KB122", "KB121"], { KB121: SET_A, KB122: SET_A }),
      registry: REGISTRY,
      expected: { state: "set", ...SET_A, source: "KB121", mismatches: [] },
    },
    {
      name: "출처 KB120 값 null · KB121 값 있음 → 값을 아는 첫 서버 KB121",
      account: account(["KB120", "KB121"], { KB120: null, KB121: SET_A }),
      registry: REGISTRY,
      expected: { state: "set", ...SET_A, source: "KB121", mismatches: [] },
    },
    {
      name: "모든 서버 null → unknown",
      account: account(["KB120", "KB121"], { KB120: null, KB121: null }),
      registry: REGISTRY,
      expected: UNKNOWN,
    },
    {
      name: "orderEndpoints 없음(옛 픽스처) → unknown",
      account: account(["KB120"], undefined),
      registry: REGISTRY,
      expected: UNKNOWN,
    },
    {
      name: "KB120 설정 · KB121 미설정 → state set · 불일치 [KB121 unset]",
      account: account(["KB120", "KB121"], { KB120: SET_A, KB121: UNSET }),
      registry: REGISTRY,
      expected: {
        state: "set",
        ...SET_A,
        source: "KB120",
        mismatches: [{ serverKey: "KB121", state: "unset", orderIp: "", orderMac: "" }],
      },
    },
    {
      name: "KB120 설정 · KB121 다른 값 · KB122 같은 값 → 불일치 [KB121 set] 만(레지스트리 순)",
      account: account(["KB120", "KB121", "KB122"], { KB120: SET_A, KB121: SET_B, KB122: SET_A }),
      registry: REGISTRY,
      expected: {
        state: "set",
        ...SET_A,
        source: "KB120",
        mismatches: [{ serverKey: "KB121", state: "set", ...SET_B }],
      },
    },
    {
      name: "KB121 null(87 모름) → 비교하지 않는다(불일치 0)",
      account: account(["KB120", "KB121"], { KB120: SET_A, KB121: null }),
      registry: REGISTRY,
      expected: { state: "set", ...SET_A, source: "KB120", mismatches: [] },
    },
    {
      name: "출처 값 \"\" \"\" → state unset",
      account: account(["KB120", "KB121"], { KB120: UNSET, KB121: UNSET }),
      registry: REGISTRY,
      expected: { state: "unset", orderIp: "", orderMac: "", source: "KB120", mismatches: [] },
    },
    {
      name: "지정 KB121 이 꺼진 서버 → 지정 무시 · 기본 KB120 이 출처",
      account: account(["KB120", "KB121"], { KB120: SET_A, KB121: SET_B }, { orderServer: "KB121" }),
      registry: [
        { key: "KB120", enabled: true },
        { key: "KB121", enabled: false },
      ],
      expected: {
        state: "set",
        ...SET_A,
        source: "KB120",
        mismatches: [{ serverKey: "KB121", state: "set", ...SET_B }],
      },
    },
  ])("$name", ({ account: acct, registry, expected }) => {
    expect(summarizeOrderEndpoint({ account: acct, registry })).toEqual(expected);
  });
});
