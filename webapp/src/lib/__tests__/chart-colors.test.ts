import { describe, expect, it } from 'vitest';
import { getChartPalette, type ChartPalette } from '../chart-colors';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const KEYS: (keyof ChartPalette)[] = ['up', 'down', 'text', 'grid', 'bg'];

describe('getChartPalette', () => {
  it.each(['light', 'dark'] as const)(
    '%s 팔레트가 모든 키를 hex 문자열로 노출 (Pitfall 9: lightweight-charts 가 CSS Color 4 함수형식 거부)',
    (theme) => {
      const p = getChartPalette(theme);
      for (const key of KEYS) {
        expect(p[key]).toMatch(HEX_RE);
      }
    },
  );

  it('다크/라이트 분기가 실제로 다른 hex 값을 반환한다', () => {
    const light = getChartPalette('light');
    const dark = getChartPalette('dark');
    expect(light.up).not.toBe(dark.up);
    expect(light.down).not.toBe(dark.down);
    expect(light.bg).not.toBe(dark.bg);
  });

  it('한국식 색상 컨벤션 — up = 적색 계열, down = 청색 계열 (D-02)', () => {
    const { up, down } = getChartPalette('light');
    // 적색 = R 채널이 가장 큼
    const upR = parseInt(up.slice(1, 3), 16);
    const upG = parseInt(up.slice(3, 5), 16);
    const upB = parseInt(up.slice(5, 7), 16);
    expect(upR).toBeGreaterThan(upG);
    expect(upR).toBeGreaterThan(upB);
    // 청색 = B 채널이 가장 큼
    const dnR = parseInt(down.slice(1, 3), 16);
    const dnG = parseInt(down.slice(3, 5), 16);
    const dnB = parseInt(down.slice(5, 7), 16);
    expect(dnB).toBeGreaterThan(dnR);
    expect(dnB).toBeGreaterThan(dnG);
  });
});
