// Phase 07 — Naver Search API 응답 샘플. 실제 응답 필드 (CONTEXT D3 + RESEARCH §1.1) 와 일치.

export const NAVER_NEWS_SAMPLE_OK = {
  lastBuildDate: "Fri, 17 Apr 2026 14:32:00 +0900",
  total: 4823,
  start: 1,
  display: 20,
  items: [
    {
      title: "<b>삼성전자</b>, 1분기 영업익 6.6조원 기록",
      originallink: "https://www.hankyung.com/article/202604170142",
      link: "https://n.news.naver.com/mnews/article/015/0005012345",
      description:
        "<b>삼성전자</b>가 17일 발표한 1분기 잠정실적에 따르면...",
      pubDate: "Fri, 17 Apr 2026 14:32:00 +0900",
    },
  ],
};

export const NAVER_NEWS_SAMPLE_EMPTY = {
  lastBuildDate: "",
  total: 0,
  start: 1,
  display: 20,
  items: [],
};
