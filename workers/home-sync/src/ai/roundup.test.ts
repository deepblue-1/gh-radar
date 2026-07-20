import { describe, it, expect } from "vitest";
import { isRoundupNews } from "./roundup";

/**
 * quick-260720-jh7 — isRoundupNews 데이터 기반 라운드업(시황/거래상위/마감) 판정.
 *
 * 라운드업 기사는 급등 종목명을 여러 개 나열한다. 급등 집합 종목명이 제목+description 에
 * distinct 3개 이상 verbatim 등장하면 라운드업으로 본다 (키워드 리스트 아님, 순수 데이터).
 * 목적: Claude 오클러스터 + reassignOrphans 오흡수를 병합 신호에서 배제.
 */

describe("isRoundupNews (데이터 기반 라운드업 판정)", () => {
  it("경계: 급등 종목명 2개만 등장 → false", () => {
    const news = { title: "고려산업·형지 동반 강세" };
    const surgeNames = ["고려산업", "형지", "흥아해운", "SK이터닉스"];
    expect(isRoundupNews(news, surgeNames)).toBe(false);
  });

  it("경계: 급등 종목명 3개 등장 → true (minDistinct 기본 3)", () => {
    const news = { title: "고려산업·형지·흥아해운 동반 강세" };
    const surgeNames = ["고려산업", "형지", "흥아해운", "SK이터닉스"];
    expect(isRoundupNews(news, surgeNames)).toBe(true);
  });

  it("실사례: [서울데이터랩] 코스피 거래상위 라운드업 → true", () => {
    const news = {
      title:
        "[서울데이터랩] 코스피 거래상위 고려산업·형지·흥아해운·SK이터닉스…",
    };
    const surgeNames = ["고려산업", "형지", "흥아해운", "SK이터닉스", "한탑"];
    expect(isRoundupNews(news, surgeNames)).toBe(true);
  });

  it("description 합산: title 1개 + description 2개 (총 3 distinct) → true", () => {
    const news = {
      title: "고려산업 상한가",
      description: "이날 형지와 흥아해운도 동반 강세를 보였다",
    };
    const surgeNames = ["고려산업", "형지", "흥아해운"];
    expect(isRoundupNews(news, surgeNames)).toBe(true);
  });

  it("distinct dedup: 같은 종목명이 title·description 중복 등장 → distinct 1로만 카운트", () => {
    const news = {
      title: "고려산업 급등 고려산업 재차 상한가",
      description: "고려산업 관련 기대감",
    };
    const surgeNames = ["고려산업", "형지", "흥아해운"];
    // 고려산업만 3회 등장하지만 distinct 1 → false.
    expect(isRoundupNews(news, surgeNames)).toBe(false);
  });

  it("빈 surgeNames → 항상 false", () => {
    const news = { title: "고려산업·형지·흥아해운 동반 강세" };
    expect(isRoundupNews(news, [])).toBe(false);
  });

  it("빈 name(\"\") 은 스킵 (모든 텍스트 오판 방지)", () => {
    const news = { title: "고려산업 상한가" };
    // 빈 문자열이 매칭되어 카운트를 부풀리면 안 됨.
    expect(isRoundupNews(news, ["", "", "", ""])).toBe(false);
  });

  it("description 없는 HomeNewsRef 형태(title만)도 안전 처리", () => {
    const news = { title: "고려산업·형지·흥아해운 라운드업" };
    const surgeNames = ["고려산업", "형지", "흥아해운"];
    expect(isRoundupNews(news, surgeNames)).toBe(true);
  });

  it("description null 안전 처리", () => {
    const news = { title: "고려산업 단독 상한가", description: null };
    const surgeNames = ["고려산업", "형지", "흥아해운"];
    expect(isRoundupNews(news, surgeNames)).toBe(false);
  });

  it("minDistinct 커스텀 가능", () => {
    const news = { title: "고려산업·형지 강세" };
    const surgeNames = ["고려산업", "형지"];
    expect(isRoundupNews(news, surgeNames, 2)).toBe(true);
  });
});
