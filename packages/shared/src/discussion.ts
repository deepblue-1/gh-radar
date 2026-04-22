/**
 * Phase 08 — 네이버 종목토론방 게시글 공용 타입 (camelCase).
 * Phase 08.1 — relevance / classifiedAt 확장 (DISC-01.1 의미성 분류).
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
 *  - relevance    ← Phase 08.1 Claude Haiku 4.5 분류 라벨 (4-category + null)
 *  - classifiedAt ← Phase 08.1 분류 완료 시각
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
  /**
   * Phase 08.1 — Claude Haiku 4.5 로 분류된 의미성 라벨.
   *  - 'price_reason'  : 가격 움직임 이유·차트·수급 언급
   *  - 'theme'         : 테마·업종·정책 언급
   *  - 'news_info'     : 뉴스 인용·공시·실적 사실
   *  - 'noise'         : 욕설·감탄사·뇌피셜·광고·단순 반응
   *  - null            : 아직 분류 전 (수집 직후 ~ 분류 완료 윈도) 또는 Claude 호출 실패
   */
  relevance: 'price_reason' | 'theme' | 'news_info' | 'noise' | null;
  /** Phase 08.1 — 분류가 실제로 완료된 시각. null = 미분류. */
  classifiedAt: string | null;
};
