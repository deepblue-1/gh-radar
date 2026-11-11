import { describe, it, expect } from "vitest";
import { pressDisplayName } from "../press-names";
import { NAVER_SOURCE_FALLBACK, mergeStockFeed, type StockFeedRpcKisRow, type StockFeedRpcNaverRow } from "../stock-feed";

describe("pressDisplayName — 언론사 표시 이름", () => {
  it.each([
    ["chosun", "조선일보"],
    ["donga", "동아일보"],
    ["yna", "연합뉴스"],
    ["edaily", "이데일리"],
    ["sedaily", "서울경제"],
    ["mk", "매일경제"],
    ["heraldcorp", "헤럴드경제"],
    ["kmib", "국민일보"],
    ["sisajournal-e", "시사저널e"],
    ["00news", "공공뉴스"],
  ])("네이버 도메인 조각 %s → %s", (domain, name) => {
    expect(pressDisplayName(domain)).toBe(name);
  });

  it.each([
    ["kjdaily", "광주매일신문"],
    ["cbci", "CBC뉴스"],
    ["tfmedia", "조세금융신문"],
    ["ppss", "ㅍㅍㅅㅅ"],
    ["finomy", "현대경제신문"],
    ["m-economynews", "M이코노미뉴스"],
    ["kwangju", "광주일보"],
  ])("gh-trade 확인값 %s → %s", (domain, name) => {
    expect(pressDisplayName(domain)).toBe(name);
  });

  it("서브도메인 조각은 원문 호스트로만 맞춘다 — 조각만으로는 그대로", () => {
    expect(pressDisplayName("view", "https://view.asiae.co.kr/article/2026111200001")).toBe("아시아경제");
    expect(pressDisplayName("ic", "https://ic.newdaily.co.kr/site/data/html/2026/11/12/x.html")).toBe("뉴데일리");
    expect(pressDisplayName("view")).toBe("view");
    expect(pressDisplayName("view", "https://view.example.com/a")).toBe("view");
    expect(pressDisplayName("ic", "not a url")).toBe("ic");
    expect(pressDisplayName("it", "https://it.chosun.com/news/x")).toBe("IT조선");
    expect(pressDisplayName("korea", "https://www.korea.kr/briefing/x")).toBe("정책브리핑");
    expect(pressDisplayName("it")).toBe("it");
    expect(pressDisplayName("korea")).toBe("korea");
  });

  it("호스트 표에 없으면 조각 표로 간다", () => {
    expect(pressDisplayName("chosun", "https://www.chosun.com/economy/x")).toBe("조선일보");
  });

  it("도메인 조각은 대소문자 · 앞뒤 공백과 무관하다", () => {
    expect(pressDisplayName(" Chosun ")).toBe("조선일보");
  });

  it.each([
    ["파이낸셜", "파이낸셜뉴스"],
    ["아시아 경제", "아시아경제"],
    ["한국경제신문", "한국경제"],
    ["조선경제i", "조선비즈"],
  ])("한투 표기 흔들림 %s → %s", (raw, name) => {
    expect(pressDisplayName(raw)).toBe(name);
  });

  it("표에 없는 값 · 이미 한글인 값은 그대로 둔다", () => {
    expect(pressDisplayName("헤럴드경제")).toBe("헤럴드경제");
    expect(pressDisplayName("인포스탁")).toBe("인포스탁");
    expect(pressDisplayName("코스닥 공시")).toBe("코스닥 공시");
    expect(pressDisplayName("unknownpress")).toBe("unknownpress");
  });

  it("Object.prototype 이름은 새지 않는다", () => {
    expect(pressDisplayName("constructor")).toBe("constructor");
    expect(pressDisplayName("toString")).toBe("toString");
    expect(pressDisplayName("__proto__")).toBe("__proto__");
  });
});

describe("mergeStockFeed — 응답의 source 가 표시 이름으로 나간다", () => {
  const kis = (over: Partial<StockFeedRpcKisRow>): StockFeedRpcKisRow => ({
    srno: "1",
    kind: "news",
    source: "파이낸셜",
    title: "한투 기사 제목",
    title_key: "한투기사제목",
    written_at: "2026-11-12T01:00:00+00:00",
    received_at: "2026-11-12T01:00:05+00:00",
    codes: ["005930"],
    ...over,
  });
  const naver = (over: Partial<StockFeedRpcNaverRow>): StockFeedRpcNaverRow => ({
    id: "n1",
    title: "네이버 다른 기사",
    description: null,
    source: "chosun",
    url: "https://www.chosun.com/x",
    published_at: "2026-11-12T00:00:00+00:00",
    created_at: "2026-11-12T00:00:05+00:00",
    ...over,
  });

  it("한투 줄 · 네이버 줄 모두 바뀌고, 빈 네이버 출처는 대체 문구 그대로", () => {
    const out = mergeStockFeed([kis({})], [naver({}), naver({ id: "n2", title: "출처 없는 기사", source: null })]);
    const byId = Object.fromEntries(out.map((i) => [i.id, i.source]));
    expect(byId["kis:1"]).toBe("파이낸셜뉴스");
    expect(byId["naver:n1"]).toBe("조선일보");
    expect(byId["naver:n2"]).toBe(NAVER_SOURCE_FALLBACK);
  });

  it("한투 · 네이버가 합쳐진 줄은 한투 쪽 이름(정규화 뒤)을 쓴다", () => {
    const title = "삼성전자 3분기 실적 발표 앞두고 외국인 순매수 확대";
    const out = mergeStockFeed(
      [kis({ title, title_key: title.replace(/\s/g, ""), source: "아시아 경제" })],
      [naver({ title, source: "asiae", published_at: "2026-11-12T01:00:00+00:00" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("아시아경제");
  });
});
