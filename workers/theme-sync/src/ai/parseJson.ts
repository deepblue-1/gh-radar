/**
 * Phase 10 Plan 06 — Claude 응답에서 JSON 객체만 안전하게 추출하는 공유 유틸.
 *
 * 배경 (POC 실측 — 2026-06-09):
 *   Haiku 4.5 는 system prompt 에서 "JSON only, 다른 텍스트 금지" 를 지시해도
 *   응답을 ```json ... ``` 마크다운 펜스 또는 짧은 프리앰블로 감싸는 경우가 있다.
 *   이 경우 `JSON.parse(text)` 가 즉시 throw → 파서가 빈 결과를 반환 → 발굴 0건.
 *   (mocked 단위 테스트는 항상 clean JSON 을 주입해 이 라이브 버그를 못 잡았다.)
 *
 * 동작: 첫 '{' ~ 마지막 '}' 구간만 잘라 반환. 객체가 없으면 null.
 *   호출부(parseDiscoverResponse/parseCorrectResponse)는 null/parse-fail 시 빈 결과로
 *   격리한다(기존 실패-안전 보존). 첫 '{'~마지막 '}' 슬라이스라 펜스/프리앰블/트레일링
 *   설명이 모두 제거된다.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}
