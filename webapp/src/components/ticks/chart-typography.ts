/**
 * 틱뷰어 선 차트(`tick-chart.tsx`) · 봉 차트(`candle-chart.tsx`)가 같이 쓰는 글자 크기 상수
 * (Phase 42 UI-REVIEW 3번 · UI-SPEC Typography 「상속」).
 *
 * - 값을 바꾸면 선 · 봉 두 차트가 함께 바뀐다 — 한쪽에만 다시 적어 두면 차트 종류를 전환할 때 화면이 튄다.
 * - Tailwind 4 자동 감지가 이 .ts 파일의 문자열을 그대로 읽으므로 클래스는 조각으로 조립하지 말고 완전한 리터럴로 둔다.
 */

/** 「타임라인」 제목 h2 의 글자 크기 · 굵기(색 · 여백은 쓰는 쪽이 붙인다). */
export const CHART_TITLE_TEXT = 'text-[12.5px] font-bold';

/** 값 띠 루트(차트 위 높이 고정 4칸 띠)의 글자 크기 · 줄 높이 — 줄 높이는 띠 높이 계산(데스크톱 58 · 88 등)의 전제다. */
export const CHART_BAND_TEXT = 'text-[11.5px] leading-[14px]';

/** 수익률 · 가격 구간 칩(SVG `<text>`) 글자 크기 — 두 차트의 칩 폭 추정(글자당 6.4 + 10)은 이 크기를 전제로 한다. 크기를 바꾸면 그 추정도 같이 본다. */
export const CHART_PILL_FONT_SIZE = 10.5;
