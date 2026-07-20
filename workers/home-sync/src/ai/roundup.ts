/**
 * quick-260720-jh7 — 라운드업(시황/거래상위/마감) 기사 데이터 기반 판정.
 *
 * 배경: 라운드업 기사는 하루 급등 종목명을 여러 개 나열한다 (예: "[서울데이터랩] 코스피
 * 거래상위 고려산업·형지·흥아해운·SK이터닉스…"). 이 기사가 특정 종목의 뉴스로 붙으면
 *   (a) Claude 가 무관 종목을 한 테마로 오클러스터,
 *   (b) reassignOrphans 가 "라운드업 제목에 종목명 등장"을 정밀 병합 신호로 오해
 * 하는 오염이 발생한다.
 *
 * 판정 = 순수 데이터 휴리스틱 (키워드 리스트 아님):
 *   급등 집합(surgeNames) 종목명이 news.title + description 에 verbatim 부분문자열로
 *   distinct minDistinct(기본 3)개 이상 등장하면 라운드업.
 *
 * 순수 함수 — 프로젝트 특정 import 없음 (prompt.ts·clusterSurges.ts 양쪽이 import,
 * 순환의존 회피).
 */
export function isRoundupNews(
  news: { title: string; description?: string | null },
  surgeNames: Iterable<string>,
  minDistinct = 3,
): boolean {
  // loadSurges.nameMatches 패턴 계승 — verbatim 부분문자열 매칭.
  // description 없으면(HomeNewsRef) title 만으로 판정.
  const text = `${news.title} ${news.description ?? ""}`;

  const matched = new Set<string>();
  for (const name of surgeNames) {
    // 빈 name 은 스킵 — 모든 텍스트에 매칭되어 카운트를 부풀리는 오판 방지.
    if (!name) continue;
    if (matched.has(name)) continue; // distinct 중복 카운트 방지.
    if (text.includes(name)) matched.add(name);
    if (matched.size >= minDistinct) return true;
  }
  return matched.size >= minDistinct;
}
