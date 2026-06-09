/**
 * 보수적 이름 정규화 (RESEARCH §Pattern 4, D-10).
 *
 * norm_key(name) = NFKC(name).toLowerCase().replace(/\s+/g,'').replace(/[·/\-,]/g,'')
 *
 * 규칙(이 범위만 — 동의어 사전/Levenshtein 은 Deferred):
 *   1. NFKC 유니코드 정규화 (전각/반각, 합성문자)
 *   2. 영문 소문자화 ('AI챗봇' vs 'ai 챗봇' 동일)
 *   3. 공백 전부 제거
 *   4. 특수문자(·, /, -, ,) 제거
 *   5. 괄호 안 내용은 유지 — 'HBM(고대역폭메모리)' 의 '(...)' 는 동일성 판단에 위험하므로
 *      초기엔 보수적으로 보존(오병합 회피). 오병합은 시스템 read-only 라 fork-후-수정 불가.
 *
 * Don't: 유사도 임계 자동 병합 — 정규화 후 완전일치만 병합.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·/\-,]/g, "");
}
