import { describe, expect, it } from 'vitest';
import { getChartPalette, type ChartPalette } from '../chart-colors';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/**
 * 2026-05-16: bg 는 별도 검증 (rgba transparent — 카드 배경과 동기화 위해).
 * 나머지 4개 키는 hex 만 허용.
 */
const HEX_KEYS: (keyof ChartPalette)[] = ['up', 'down', 'text', 'grid'];

describe('getChartPalette', () => {
  it.each(['light', 'dark'] as const)(
    '%s 팔레트의 색상 키(up/down/text/grid)가 hex 형식 (Pitfall 9: lightweight-charts 가 CSS Color 4 함수형식 거부)',
    (theme) => {
      const p = getChartPalette(theme);
      for (const key of HEX_KEYS) {
        expect(p[key]).toMatch(HEX_RE);
      }
    },
  );

  it.each(['light', 'dark'] as const)(
    '%s 팔레트의 bg 는 투명 (chart container 의 var(--card) 배경이 보이도록)',
    (theme) => {
      const p = getChartPalette(theme);
      // 'transparent' 또는 rgba(...,0) 형태 — alpha 0 허용
      expect(p.bg).toMatch(/^(transparent|rgba\(.*0\s*\))$/);
    },
  );

  it('다크/라이트 분기가 실제로 다른 hex 값을 반환한다 (up/down 기준)', () => {
    const light = getChartPalette('light');
    const dark = getChartPalette('dark');
    expect(light.up).not.toBe(dark.up);
    expect(light.down).not.toBe(dark.down);
    // bg 는 양쪽 모두 transparent 라 동일 — 별도 검증 안 함
  });

  it('한국식 색상 컨벤션 — up = 적색 계열, down = 청색 계열 (D-02)', () => {
    const { up, down } = getChartPalette('light');
    const upR = parseInt(up.slice(1, 3), 16);
    const upG = parseInt(up.slice(3, 5), 16);
    const upB = parseInt(up.slice(5, 7), 16);
    expect(upR).toBeGreaterThan(upG);
    expect(upR).toBeGreaterThan(upB);
    const dnR = parseInt(down.slice(1, 3), 16);
    const dnG = parseInt(down.slice(3, 5), 16);
    const dnB = parseInt(down.slice(5, 7), 16);
    expect(dnB).toBeGreaterThan(dnR);
    expect(dnB).toBeGreaterThan(dnG);
  });
});
