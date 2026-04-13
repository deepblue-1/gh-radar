export type SummaryType = "news" | "discussion";

export type Sentiment = {
  positive: number;
  negative: number;
  neutral: number;
};

export type Summary = {
  id: string;
  contentHash: string;
  summaryType: SummaryType;
  summaryText: string;
  sentiment: Sentiment | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
};
