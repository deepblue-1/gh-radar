/**
 * ETP(ETF · ETN · ELW · 지수연동 상품) 판정 — **단일 정의**(Phase 41 D-09).
 *
 * - 한투 뉴스·공시 수집기(`workers/kis-news-sync` 분류)가 종목 연결에 `etp` 숨김 사유를 붙일 때,
 *   home-sync 가 급등 집합에서 지수연동 상품을 뺄 때 같은 규칙을 쓴다. home-sync 의
 *   `isExcludedProduct` 와 같은 규칙이며 41-10 이 home-sync 를 이 함수로 바꾼다.
 * - 그룹 블랙리스트는 새로 만들지 않고 krxTick 의 `ETP_SECURITY_GROUPS`(server 검색 · SQL 선례와 같은
 *   목록)를 그대로 쓴다.
 * - 이름 패턴은 `security_group` 오분류 대비다(570127 「한투 인버스2X코스피200선물 ETN」 이 '주권' 으로
 *   적재된 실사례). KODEX/TIGER 같은 브랜드명은 일반 기업명 오탐 위험이 있어 넣지 않는다.
 * - **스팩은 넣지 않는다.** 스팩도 그룹이 '주권' 이지만 ETP 가 아니라 따로 거르는 대상이다
 *   (스팩 판정은 `kosdaq_segment` 'SPAC%' 또는 종목명 '스팩').
 */
import { ETP_SECURITY_GROUPS } from "./krxTick";

/** 종목명 fallback 패턴 — 그룹이 잘못 실린 지수연동 상품을 잡는다. */
export const ETP_NAME_PATTERN = /ETN|ETF|ELW|인버스|레버리지/i;

/**
 * ETP 인가. 그룹(앞뒤 공백 제거 · 대문자)이 `ETP_SECURITY_GROUPS` 에 있거나 이름이 패턴에 맞으면 참.
 * 이름 · 그룹이 둘 다 없으면 거짓 — 마스터에서 못 찾은 코드는 일반 종목으로 둔다.
 */
export function isEtpProduct(
  name: string | null | undefined,
  securityGroup: string | null | undefined,
): boolean {
  if (securityGroup && ETP_SECURITY_GROUPS.includes(securityGroup.trim().toUpperCase())) {
    return true;
  }
  return name ? ETP_NAME_PATTERN.test(name) : false;
}
