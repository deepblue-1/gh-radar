/**
 * Phase 10 — 테마 정렬 지표 계산 (D-14, THEME-02).
 *
 * 테마 소속 종목의 등락률 중 **상위 3개의 평균** 을 구한다.
 * "지금 뜨는 테마" 신호를 라거드 종목 희석 없이 포착하기 위해 전체 평균이 아닌
 * 대장주 상위 3 평균을 사용한다 (CONTEXT D-14).
 *
 * 순수 함수 — 입력 등락률 배열만 받아 계산 (DB/IO 없음).
 * 호출자(routes/themes.ts)가 stock_quotes.change_rate 를 청크 IN 조인으로 수집해 전달.
 */

/**
 * 등락률 배열의 상위 3개 평균을 반환.
 *
 * @param rates 테마 소속 종목들의 등락률 (% 단위, 부호 포함). 순서 무관.
 * @returns 상위 3(또는 그 이하) 평균. 빈 배열이면 null.
 *
 * 규칙:
 *   - 내림차순 정렬 후 최대 3개를 평균 (종목 < 3 이면 있는 만큼 평균)
 *   - 빈 배열 → null (소속 종목이 없거나 전부 시세 부재)
 *   - 음수 등락률도 그대로 정렬·평균 (전부 음수면 평균도 음수)
 */
export function computeTop3Avg(rates: number[]): number | null {
  // NaN/Infinity 방어 — 단일 비유한값이 비교자(b-a)와 평균을 오염시켜 결과를 NaN 으로
  // 만든다(WR-S-01). 호출자가 거르더라도 순수 함수 차원에서 이중 가드.
  const finite = rates.filter((r) => Number.isFinite(r));
  if (finite.length === 0) return null;
  const top = finite.sort((a, b) => b - a).slice(0, 3);
  const sum = top.reduce((acc, r) => acc + r, 0);
  return sum / top.length;
}
