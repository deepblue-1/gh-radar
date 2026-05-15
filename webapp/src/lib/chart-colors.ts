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

const PALETTES: Record<'light' | 'dark', ChartPalette> = {
  light: {
    up: '#ef4444',
    down: '#3b82f6',
    text: '#737373',
    grid: '#e7e7e7',
    bg: '#ffffff',
  },
  dark: {
    up: '#f87171',
    down: '#60a5fa',
    text: '#a3a3a3',
    grid: '#2e2e2e',
    bg: '#1c1c1c',
  },
} as const;

export function getChartPalette(theme: 'light' | 'dark'): ChartPalette {
  return PALETTES[theme];
}
