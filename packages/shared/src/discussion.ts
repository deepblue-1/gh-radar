/**
 * Phase 08 — 네이버 종목토론방 게시글 공용 타입 (camelCase).
 *
 * server/src/mappers/discussions.ts::toDiscussion 의 출력 shape 이자
 * webapp/src/lib/stock-api.ts::fetchStockDiscussions 응답 계약.
 *
 * snake_case DB row 는 서버 mapper 에서 변환되어 이 shape 으로 프론트에 노출됨.
 * Phase 9 DISC-02 (AI 요약) 가 확장할 여지: summaryId, sentiment (본 phase 범위 밖).
 *
 * CONTEXT D9/D10 + POC-RESULTS.md §4 (필드 매핑) 준수:
 *  - postId       ← Naver discussion API `post.id`
 *  - title        ← `post.title` (stripHtmlToPlaintext 처리 후)
 *  - body         ← `post.contentSwReplacedButImg` (sanitize-html plaintext 처리 후)
 *  - author       ← `post.writer.nickname`
 *  - postedAt     ← `post.writtenAt` (KST ISO, `+09:00` offset 보강)
 *  - scrapedAt    ← worker/server 가 생성한 수집 시각 (TTL 계산 기준, D4)
 *  - url          ← 네이버 게시글 고유 URL (nid 포함) — 외부 링크용
 */
export type Discussion = {
  id: string;
  stockCode: string;
  postId: string;
  title: string;
  body: string | null;
  author: string | null;
  postedAt: string;
  scrapedAt: string;
  url: string;
};
