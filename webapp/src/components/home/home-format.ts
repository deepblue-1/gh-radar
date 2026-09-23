import type {
  HomeSurgeSingle,
  HomeSurgeStock,
  HomeSurgeTheme,
  HomeThemeSnapshot,
} from '@gh-radar/shared';

/**
 * home-format — 홈 등락%·평균·정렬 표시와 요약 복사 텍스트의 단일 원천 (quick-260914-jtj).
 *
 * 화면(ThemeCard·SoloCard)과 클립보드 복사 텍스트가 같은 함수를 써서 둘이 어긋나지 않는다.
 * 순수 함수만 — React·'use client' 없음.
 * quick-260923-cre: 개별 급등 복사 포매터(formatSingleBlock·formatSinglesSummary) 추가.
 */

/** KST(Asia/Seoul) HH:MM 라벨. */
export function toKstHhmm(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** 등락% 표시 — 부호 포함 소수 1자리 (+24.1% / -3.2%). 급등 화면이라 대부분 +. */
export function formatChange(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

/** 소속 종목 평균 등락 — 카드 헤더 metric. 유한값만 평균, 없으면 0. */
export function avgChange(theme: HomeSurgeTheme): number {
  const rates = theme.stocks
    .map((s) => s.changeRate)
    .filter((r) => Number.isFinite(r));
  if (rates.length === 0) return 0;
  return rates.reduce((sum, r) => sum + r, 0) / rates.length;
}

/** change% 내림차순 정렬 — 원본 불변 위해 복사본을 정렬. */
export function sortStocksByChangeDesc(
  stocks: HomeSurgeStock[],
): HomeSurgeStock[] {
  return [...stocks].sort((a, b) => b.changeRate - a.changeRate);
}

/**
 * 테마 1건 복사 블록 (D-02).
 *   `{order}. {name} (평균 {avg})` — order 없으면 번호 생략
 *   `{reason}`                    — reason 이 truthy 일 때만 (카드 렌더 조건과 동일)
 *   `- {종목명} {+x.x%}`          — 소속 종목 전부(TOP_N 무관), change% desc
 * 뉴스 제목·URL·종목코드는 넣지 않는다. 끝 개행 없음.
 */
export function formatThemeBlock(theme: HomeSurgeTheme, order?: number): string {
  const prefix = order === undefined ? '' : `${order}. `;
  const lines = [
    `${prefix}${theme.name} (평균 ${formatChange(avgChange(theme))})`,
  ];
  if (theme.reason) lines.push(theme.reason);
  for (const stock of sortStocksByChangeDesc(theme.stocks)) {
    lines.push(`- ${stock.name} ${formatChange(stock.changeRate)}`);
  }
  return lines.join('\n');
}

/**
 * 개별 급등 종목 1건 복사 블록 (quick-260923-cre D-02).
 *   `{order}. {종목명} {+x.x%}` — order 없으면 번호 생략(카드별 복사)
 *   `{reason}`                 — reason 이 truthy 일 때만 (카드 렌더 조건과 동일)
 * 뉴스 제목·URL·종목코드는 넣지 않는다. 끝 개행 없음.
 */
export function formatSingleBlock(single: HomeSurgeSingle, order?: number): string {
  const prefix = order === undefined ? '' : `${order}. `;
  const lines = [`${prefix}${single.name} ${formatChange(single.changeRate)}`];
  if (single.reason) lines.push(single.reason);
  return lines.join('\n');
}

/**
 * 주도 테마 전체 복사 텍스트 (D-02).
 *   `[주도 테마] {tradeDate} {capturedAt 의 KST HH:MM}` + 빈 줄 + 번호 블록들(빈 줄 1개 구분).
 * 날짜는 tradeDate 에서(capturedAt 의 KST 날짜가 아님). 끝 개행 없음.
 */
export function formatThemesSummary(
  snapshot: Pick<HomeThemeSnapshot, 'tradeDate' | 'capturedAt'>,
  themes: HomeSurgeTheme[],
): string {
  const header = `[주도 테마] ${snapshot.tradeDate} ${toKstHhmm(snapshot.capturedAt)}`;
  const blocks = themes.map((theme, i) => formatThemeBlock(theme, i + 1));
  return [header, ...blocks].join('\n\n');
}
