/**
 * Phase 28 (28-07) — 회원번호 → 회원사명 표 골든. gh-trade `client/Services/Data/MemberCodes.cs`
 * `GetMemberName` 동형(공백 제거 · 6자리면 앞 5자리 · 매핑 없으면 코드 그대로).
 */
import { describe, expect, it } from "vitest";
import { MEMBER_CODES, memberName } from "../member-codes";

/**
 * 이식 시점(2026-10-05) MemberCodes.cs 의 `{ "` 항목 수 실측 — 테스트가 gh-trade 경로를 읽지 않게 상수로 둔다.
 * 키 목록 자체의 대조는 28-07 SUMMARY 의 grep 대조 명령이 맡는다.
 */
const MEMBER_CODES_COUNT_AT_PORT = 61;

describe("Phase 28 memberName — WinForms MemberCodes.GetMemberName 동형", () => {
  it("5자리 · 6자리(앞 5자리) · 앞뒤 공백", () => {
    expect(memberName("00050")).toBe("키움증권");
    expect(memberName("000500")).toBe("키움증권");
    expect(memberName(" 00002 ")).toBe("신한증권");
    expect(memberName("00005")).toBe("미래에셋증권");
  });

  it("미매핑 → 다듬은 코드 그대로 · 빈 값 → 「」 · 6자리 미매핑 → 앞 5자리", () => {
    expect(memberName("99998")).toBe("99998");
    expect(memberName("")).toBe("");
    expect(memberName("999981")).toBe("99998");
    expect(memberName(" 12 ")).toBe("12");
  });

  it("이름은 줄이지 않는다 — 전체 이름(R-3)", () => {
    expect(memberName("00069")).toBe("카카오페이증권");
    expect(memberName("00038")).toBe("크레디아그리콜");
  });
});

describe("Phase 28 MEMBER_CODES — 이식 표", () => {
  it(`항목 수 = 이식 시점 MemberCodes.cs 실측 ${MEMBER_CODES_COUNT_AT_PORT}`, () => {
    expect(Object.keys(MEMBER_CODES)).toHaveLength(MEMBER_CODES_COUNT_AT_PORT);
  });

  it("「99999 외국계전체」 foreign true · 국내 foreign false · KB 표기 외국계(00074 · 00076 · 00078)", () => {
    expect(MEMBER_CODES["99999"]).toEqual({ name: "외국계전체", foreign: true });
    expect(MEMBER_CODES["00050"]).toEqual({ name: "키움증권", foreign: false });
    expect(MEMBER_CODES["00074"]?.foreign).toBe(true);
    expect(MEMBER_CODES["00076"]?.foreign).toBe(true);
    expect(MEMBER_CODES["00078"]?.foreign).toBe(true);
  });

  it("모든 키는 5자리 숫자", () => {
    for (const k of Object.keys(MEMBER_CODES)) expect(k).toMatch(/^\d{5}$/);
  });
});
