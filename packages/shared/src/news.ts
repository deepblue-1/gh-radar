export type NewsArticle = {
  id: string;
  stockCode: string;
  title: string;
  source: string | null;
  url: string;
  publishedAt: string;
  contentHash: string | null;
  summaryId: string | null;
  createdAt: string;
};
