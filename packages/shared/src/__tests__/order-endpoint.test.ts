/**
 * Phase 30 (30-02) — 주문자 IP/MAC 정규화 · 검증 표(gh-trade `server/src/broker/base/AccountUtil.h` `NormalizeOrderIp/Mac` 이식).
 *
 * 규칙이 gh-trade 와 갈라지면 웹 사전 검증이 code 13 을 가리거나 「변경 없음」 을 오판한다 — 표본은 gh-trade 규칙 원문에서 뽑았다.
 * 정규화 함수는 trim 하지 않는다(gh-trade 와 같다) · validateOrderEndpointInput 만 trim 한다.
 */
import { describe, expect, it } from "vitest";

import { normalizeOrderIp, normalizeOrderMac, validateOrderEndpointInput } from "../order-endpoint";

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
