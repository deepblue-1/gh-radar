/**
 * home-format 단위 테스트 (quick-260914-jtj) — 복사 텍스트는 정확한 문자열 리터럴로 비교.
 */
import { describe, it, expect } from 'vitest';
import type { HomeSurgeSingle, HomeSurgeTheme } from '@gh-radar/shared';

import {
  avgChange,
  formatChange,
  formatSingleBlock,
  formatSinglesSummary,
  formatThemeBlock,
  formatThemesSummary,
  sortStocksByChangeDesc,
} from '../home-format';

const T1: HomeSurgeTheme = {
  name: '2차전지',
  reason: '리튬 가격 반등·수주 공시',
  stocks: [
    { code: '003670', name: '포스코퓨처엠', changeRate: 22.3 },
    { code: '086520', name: '에코프로', changeRate: 29.9 },
  ],
  news: [{ title: '리튬 반등 기사', url: 'https://example.com/li', source: '연합뉴스' }],
};

const T2: HomeSurgeTheme = {
  name: '원전',
  reason: null,
  stocks: [
    { code: '052690', name: '한전기술', changeRate: 20 },
    { code: '034020', name: '두산에너빌리티', changeRate: 23 },
  ],
  news: [],
};

// 개별 급등 fixture (quick-260923-cre).
const S1: HomeSurgeSingle = {
  code: '042700',
  name: '한미반도체',
  changeRate: 29.9,
  reason: 'HBM 장비 수주 공시',
  news: [{ title: '한미반도체 수주 기사', url: 'https://example.com/hm', source: '연합뉴스' }],
};

const S2: HomeSurgeSingle = {
  code: '035720',
  name: '카카오',
  changeRate: 22.8,
  reason: null,
  news: [],
};

describe('formatChange', () => {
  it('부호 포함 소수 1자리', () => {
    expect(formatChange(24.06)).toBe('+24.1%');
    expect(formatChange(0)).toBe('0.0%');
    expect(formatChange(-3.24)).toBe('-3.2%');
  });
});

describe('avgChange', () => {
  it('유한값만 평균낸다', () => {
    const theme: HomeSurgeTheme = {
      name: 'x',
      reason: null,
      stocks: [
        { code: '1', name: 'a', changeRate: NaN },
        { code: '2', name: 'b', changeRate: 20 },
        { code: '3', name: 'c', changeRate: 30 },
      ],
      news: [],
    };
    expect(avgChange(theme)).toBe(25);
  });

  it('종목이 없으면 0', () => {
    expect(avgChange({ name: 'x', reason: null, stocks: [], news: [] })).toBe(0);
  });
});

describe('sortStocksByChangeDesc', () => {
  it('내림차순을 반환하고 입력 배열은 바꾸지 않는다', () => {
    const input = [...T1.stocks];
    const sorted = sortStocksByChangeDesc(input);
    expect(sorted.map((s) => s.name)).toEqual(['에코프로', '포스코퓨처엠']);
    expect(input.map((s) => s.name)).toEqual(['포스코퓨처엠', '에코프로']);
  });
});

describe('formatThemeBlock', () => {
  it('번호 + reason + 종목 desc', () => {
    expect(formatThemeBlock(T1, 1)).toBe(
      '1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%',
    );
  });

  it('reason null 은 줄 생략, 번호 없음', () => {
    expect(formatThemeBlock(T2)).toBe(
      '원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%',
    );
  });

  it("reason '' 도 줄 생략", () => {
    expect(formatThemeBlock({ ...T2, reason: '' })).toBe(
      '원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%',
    );
  });
});

describe('formatThemesSummary', () => {
  it('헤더 + 빈 줄 + 번호 블록을 빈 줄로 구분, 끝 개행·뉴스 없음', () => {
    const text = formatThemesSummary(
      { tradeDate: '2026-09-14', capturedAt: '2026-09-14T01:32:00.000Z' },
      [T1, T2],
    );
    expect(text).toBe(
      '[주도 테마] 2026-09-14 10:32\n\n1. 2차전지 (평균 +26.1%)\n리튬 가격 반등·수주 공시\n- 에코프로 +29.9%\n- 포스코퓨처엠 +22.3%\n\n2. 원전 (평균 +21.5%)\n- 두산에너빌리티 +23.0%\n- 한전기술 +20.0%',
    );
    expect(text).not.toContain('https://');
    expect(text).not.toContain('리튬 반등 기사');
  });

  it('날짜는 tradeDate, 시각은 capturedAt 의 KST', () => {
    const text = formatThemesSummary(
      { tradeDate: '2026-09-14', capturedAt: '2026-09-13T23:05:00.000Z' },
      [T2],
    );
    expect(text.startsWith('[주도 테마] 2026-09-14 08:05')).toBe(true);
  });
});

describe('formatSingleBlock', () => {
  it('번호 + 종목명 등락% + reason', () => {
    expect(formatSingleBlock(S1, 1)).toBe('1. 한미반도체 +29.9%\nHBM 장비 수주 공시');
  });

  it('reason null 은 줄 생략, 번호 없음', () => {
    expect(formatSingleBlock(S2)).toBe('카카오 +22.8%');
  });

  it("reason '' 도 줄 생략", () => {
    expect(formatSingleBlock({ ...S1, reason: '' })).toBe('한미반도체 +29.9%');
  });

  it('종목코드·뉴스 제목·URL 은 넣지 않는다', () => {
    const text = formatSingleBlock(S1);
    expect(text).not.toContain('042700');
    expect(text).not.toContain('https://');
    expect(text).not.toContain('한미반도체 수주 기사');
  });
});

describe('formatSinglesSummary', () => {
  const SNAP = { tradeDate: '2026-09-23', capturedAt: '2026-09-23T01:32:00.000Z' };

  it('헤더 + 빈 줄 + 번호 블록을 빈 줄로 구분, 끝 개행·코드·뉴스 없음', () => {
    const text = formatSinglesSummary(SNAP, [S1, S2]);
    expect(text).toBe(
      '[개별 급등] 2026-09-23 10:32\n\n1. 한미반도체 +29.9%\nHBM 장비 수주 공시\n\n2. 카카오 +22.8%',
    );
    expect(text).not.toContain('https://');
    expect(text).not.toContain('042700');
    expect(text).not.toContain('한미반도체 수주 기사');
  });

  it('입력 순서(화면 카드 순서)를 유지하고 다시 정렬하지 않는다', () => {
    expect(formatSinglesSummary(SNAP, [S2, S1])).toBe(
      '[개별 급등] 2026-09-23 10:32\n\n1. 카카오 +22.8%\n\n2. 한미반도체 +29.9%\nHBM 장비 수주 공시',
    );
  });

  it('날짜는 tradeDate, 시각은 capturedAt 의 KST', () => {
    const text = formatSinglesSummary(
      { tradeDate: '2026-09-23', capturedAt: '2026-09-22T23:05:00.000Z' },
      [S2],
    );
    expect(text.startsWith('[개별 급등] 2026-09-23 08:05')).toBe(true);
  });
});
