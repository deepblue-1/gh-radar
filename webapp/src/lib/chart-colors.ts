/**
 * Phase 09.2 — lightweight-charts 호환 차트 팔레트.
 *
 * Pitfall 9 (RESEARCH §Post-Deploy 디버그) 회귀 방지:
 *   lightweight-charts 5.2.0 의 내부 color parser 는 hex/rgb/hsl/명명색만 받고
 *   CSS Color 4 함수 형식(globals.css 의 Phase 3 토큰 표기) 을 거부한다
 *   ("Failed to parse color: ..." 런타임 throw).
 *   webapp/src/styles/globals.css 의 Phase 3 토큰을 그대로 var(--up) 이나
 *   getComputedStyle().getPropertyValue() 로 chart 옵션에 주입할 수 없다.
 *   본 모듈이 토큰 → sRGB hex 근사 매핑 테이블을 단일 source 로 보유.
 *
 * 다크모드 분기는 컴포넌트 측 useTheme() 훅이 'light' | 'dark' 를 결정해 호출.
 * D-02 (한국식 색상): up = 빨강, down = 파랑.
 */

export interface ChartPalette {
  /** 양봉 (한국식 빨강) */
  up: string;
  /** 음봉 (한국식 파랑) */
  down: string;
  /** 축 / 라벨 텍스트 */
  text: string;
  /** grid 선 */
  grid: string;
  /** 차트 배경 */
  bg: string;
}

/**
 * 2026-05-16 사용자 요청: 다크모드 차트 배경이 카드와 미묘하게 다른 회색이라 튐.
 * 해결: bg 를 투명 (rgba(0,0,0,0)) 으로 두고 chart container 의 CSS background 가
 * var(--card) 를 그대로 표시. light/dark 모두 카드 색과 완전 일치.
 * lightweight-charts 의 color parser 는 rgba() 정상 수용 (Pitfall 9 unaffected — oklch 만 거부).
 */
/**
 * 260924-vj1 → 260925-0pf — 토스 B 팔레트를 공식 TDS 값(`@toss/tds-colors@0.1.0`)으로 고정.
 * - up/down = 테마별 red500(라이트 #f04452 / 다크 #f04251) · blue500(라이트 #3182f6 / 다크 #3485fa).
 *   globals.css 의 테마별 `--up`/`--down` 과 같은 hex 다 — styles/__tests__/tds-tokens.test.ts 가 교차 단언.
 * - 축 글자 = grey500(3차 텍스트 — 라이트 #8b95a1 / 다크 #7e7e87), grid = grey100(라이트 #f2f4f6 /
 *   다크 #2c2c35). 두 테마가 같은 역할의 공식 단계를 쓴다.
 */
const PALETTES: Record<'light' | 'dark', ChartPalette> = {
  light: {
    up: '#f04452',
    down: '#3182f6',
    text: '#8b95a1',
    grid: '#f2f4f6',
    bg: 'rgba(0, 0, 0, 0)',
  },
  dark: {
    up: '#f04251',
    down: '#3485fa',
    text: '#7e7e87',
    grid: '#2c2c35',
    bg: 'rgba(0, 0, 0, 0)',
  },
} as const;

export function getChartPalette(theme: 'light' | 'dark'): ChartPalette {
  return PALETTES[theme];
}
