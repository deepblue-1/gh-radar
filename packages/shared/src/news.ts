export type NewsArticle = {
  id: string;
  stockCode: string;
  title: string;
  /**
   * Phase 07.1 — Naver Search API 의 기사 요약 스니펫(stripHtml 처리됨).
   * Phase 9 AI 요약의 입력 필드.
   * 기존 행(Phase 7 수집분)은 NULL — 응답에서 null 또는 생략 가능.
   */
  description?: string | null;
  source: string | null;
  url: string;
  publishedAt: string;
  contentHash: string | null;
  summaryId: string | null;
  createdAt: string;
};
