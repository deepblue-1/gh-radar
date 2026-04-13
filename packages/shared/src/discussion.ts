export type Discussion = {
  id: string;
  stockCode: string;
  postId: string;
  title: string | null;
  body: string | null;
  author: string | null;
  postedAt: string | null;
  scrapedAt: string;
};
