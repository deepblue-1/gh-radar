import { describe, expect, it } from "vitest";

import { ETP_NAME_PATTERN, isEtpProduct } from "../etp";

describe("isEtpProduct (Phase 41 D-09 · ETP 판정 단일 정의)", () => {
  it("증권그룹 ETF 는 ETP 다", () => {
    expect(isEtpProduct("아무 이름", "ETF")).toBe(true);
  });

  it("증권그룹은 앞뒤 공백 · 소문자도 같게 본다( etn )", () => {
    expect(isEtpProduct("아무 이름", " etn ")).toBe(true);
  });

  it("증권그룹 ELW 도 ETP 다", () => {
    expect(isEtpProduct(null, "ELW")).toBe(true);
  });

  it("그룹이 주권이어도 이름에 레버리지가 있으면 ETP 다(KODEX 레버리지)", () => {
    expect(isEtpProduct("KODEX 레버리지", "주권")).toBe(true);
  });

  it("그룹이 주권으로 잘못 실린 인버스 ETN 도 이름으로 잡는다(570127 류)", () => {
    expect(isEtpProduct("한투 인버스2X코스피200선물 ETN", "주권")).toBe(true);
  });

  it("스팩은 ETP 가 아니다(따로 거르는 대상)", () => {
    expect(isEtpProduct("OO스팩1호", "주권")).toBe(false);
  });

  it("일반 주권 종목은 ETP 가 아니다", () => {
    expect(isEtpProduct("삼성전자", "주권")).toBe(false);
  });

  it("이름 · 그룹이 둘 다 없으면 거짓", () => {
    expect(isEtpProduct(null, null)).toBe(false);
    expect(isEtpProduct(undefined, undefined)).toBe(false);
    expect(isEtpProduct("", "")).toBe(false);
  });

  it("이름 패턴은 대소문자를 가리지 않는다(etf)", () => {
    expect(ETP_NAME_PATTERN.test("tiger 미국 etf")).toBe(true);
    expect(isEtpProduct("tiger 미국 etf", null)).toBe(true);
  });
});
