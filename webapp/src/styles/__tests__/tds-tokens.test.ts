/**
 * quick-260925-0pf — 토스 B 테마를 공식 TDS(토스 디자인 시스템) 값에 고정한다.
 *
 * 출처: `@toss/tds-colors@0.1.0` 앱 팔레트(colors.light.css · colors.dark.css).
 * 이 테스트가 지키는 것:
 *   1) globals.css `:root`·`.dark` 의 테마 색 토큰이 공식값(또는 그 rgba 틴트)이다.
 *   2) 두 블록이 같은 테마 색 토큰 집합을 정의하고, 그 값에 oklch 가 없다(차트가 oklch 거부).
 *   3) 차트 팔레트(chart-colors.ts)의 up/down 이 테마별 CSS `--up`/`--down` 과 같은 hex 다.
 *   4) 260925-gy6 — sketch 003-A 선택·활성 토큰(라이트만 blue50/blue600 · 다크 = 종전 참조값).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getChartPalette } from '@/lib/chart-colors';

const CSS = readFileSync(path.resolve(__dirname, '../globals.css'), 'utf8');

/** `selector {` 로 시작하는 첫 블록에서 `--이름: 값;` 을 뽑는다(주석 제거 후). */
function parseBlock(selector: string): Record<string, string> {
  const start = CSS.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`블록을 찾지 못함: ${selector}`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('\n}', open);
  const body = CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  }
  return out;
}

const LIGHT = parseBlock(':root');
const DARK = parseBlock('.dark');

const LIGHT_EXPECTED: Record<string, string> = {
  bg: '#ffffff',
  surface: '#f2f4f6',
  band: '#f2f4f6',
  fg: '#191f28',
  'fg-2': '#333d4b',
  muted: '#f2f4f6',
  'muted-fg': '#6b7684',
  flat: '#6b7684',
  faint: '#b0b8c1',
  'raised-2': '#e5e8eb',
  'border-subtle': '#e5e8eb',
  card: '#ffffff',
  popover: '#ffffff',
  primary: '#3182f6',
  up: '#f04452',
  destructive: '#f04452',
  down: '#3182f6',
  'up-bg': '#ffeeee',
  'down-bg': '#e8f3ff',
  'seg-on-bg': '#ffffff',
  'pill-on-bg': '#e8f3ff',
  'pill-on-fg': '#1b64da',
  'side-bg': '#ffffff',
  'nav-on-bg': '#e8f3ff',
  'nav-on-fg': '#1b64da',
  'nav-on-line': '#3182f6',
  'spec-dot-bg': '#3182f6',
  'spec-dot-ring': 'rgba(49, 130, 246, 0.18)',
};

const DARK_EXPECTED: Record<string, string> = {
  bg: '#17171c',
  surface: '#17171c',
  band: '#101013',
  fg: '#ffffff',
  'fg-2': '#e4e4e5',
  muted: '#2c2c35',
  'muted-fg': '#9e9ea4',
  flat: '#9e9ea4',
  faint: '#62626d',
  'raised-2': '#3c3c47',
  'border-subtle': '#3c3c47',
  card: '#202027',
  popover: '#2c2c35',
  primary: '#3485fa',
  up: '#f04251',
  destructive: '#f04251',
  down: '#3485fa',
  'seg-on-bg': '#4d4d59',
  'pill-on-bg': '#4d4d59',
  'pill-on-fg': '#ffffff',
  'side-bg': '#101013',
  'nav-on-bg': '#2c2c35',
  'nav-on-fg': '#ffffff',
  'nav-on-line': '#ffffff',
  'spec-dot-bg': '#9e9ea4',
  'spec-dot-ring': 'rgba(255, 255, 255, 0.08)',
};

/** 테마 색 토큰 — `:root`·`.dark` 둘 다 정의돼야 한다(한쪽만 두면 반대 테마에서 조용히 사라짐). */
const THEME_COLOR_TOKENS = [
  'bg', 'surface', 'band', 'fg', 'fg-2', 'muted', 'muted-fg', 'faint', 'raised-2',
  'border', 'border-subtle', 'input', 'ring', 'card', 'card-fg', 'popover', 'popover-fg',
  'primary', 'primary-fg', 'secondary', 'secondary-fg', 'accent', 'accent-fg',
  'destructive', 'destructive-fg', 'up', 'down', 'flat', 'up-bg', 'down-bg',
  'seg-on-bg', 'seg-on-fg', 'seg-on-shadow', 'pill-on-bg', 'pill-on-fg',
  'ask-bar', 'bid-bar', 'side-bg', 'led-latent', 'led-armed', 'new-bg', 'new-bd',
  'nav-on-bg', 'nav-on-fg', 'nav-on-line', 'spec-dot-bg', 'spec-dot-ring',
];

describe('TDS 토큰 값 (@toss/tds-colors@0.1.0)', () => {
  it.each(Object.entries(LIGHT_EXPECTED))('라이트 --%s = %s', (name, value) => {
    expect(LIGHT[name]?.toLowerCase()).toBe(value.toLowerCase());
  });

  it.each(Object.entries(DARK_EXPECTED))('다크 --%s = %s', (name, value) => {
    expect(DARK[name]?.toLowerCase()).toBe(value.toLowerCase());
  });

  it.each(['up-bg', 'bid-bar'])('다크 --%s 는 red500 #f04251 의 rgba 틴트', (name) => {
    expect(DARK[name]).toMatch(/^rgba\(\s*240\s*,\s*66\s*,\s*81\s*,/);
  });

  it.each([
    ['라이트', LIGHT],
    ['다크', DARK],
  ] as const)('%s 블록이 테마 색 토큰 집합을 모두 정의하고 oklch 가 없다', (_label, block) => {
    for (const name of THEME_COLOR_TOKENS) {
      expect(block[name], `--${name} 미정의`).toBeDefined();
      expect(block[name], `--${name} 에 oklch`).not.toMatch(/oklch/i);
    }
  });

  it('새 선택 토큰의 다크 값은 종전 참조 토큰과 같다(sketch 003-A · 260925-gy6 — 다크 무변경)', () => {
    expect(DARK['nav-on-bg']).toBe(DARK.muted);
    expect(DARK['nav-on-fg']).toBe(DARK.fg);
    expect(DARK['nav-on-line']).toBe(DARK.fg);
    expect(DARK['spec-dot-bg']).toBe(DARK['muted-fg']);
  });

  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)('차트 팔레트(%s) up/down == CSS --up/--down', (theme, block) => {
    const p = getChartPalette(theme);
    expect(p.up.toLowerCase()).toBe(block.up.toLowerCase());
    expect(p.down.toLowerCase()).toBe(block.down.toLowerCase());
  });
});

/* ─────────────────────────────────────────────────────────────
   행 구분선 가드 — 방향 테두리(border-t/b/l/r/x/y · divide-*)는 TDS hairline
   `--border-subtle` 로 그린다. `--border` 는 4면 면 외곽선(무테 유지용 잔재) 전용.
   위반 = 한 줄에 색 토큰 `border-[var(--border)]`/`divide-[var(--border)]` 가 있고,
   방향 토큰이 있으며, 4면 토큰 `border` 는 없는 줄.
   ───────────────────────────────────────────────────────────── */
const SRC_ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = ['components', 'app'].map((d) => path.join(SRC_ROOT, d));
const EXCLUDE_DIRS = new Set([path.join(SRC_ROOT, 'app', 'design')]);

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || EXCLUDE_DIRS.has(full)) continue;
      out.push(...listTsx(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** 대괄호 깊이 0 의 마지막 콜론까지(변형 접두)를 떼어 낸다. `[&>*]:border-t` → `border-t`. */
function stripVariants(token: string): string {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ':' && depth === 0) cut = i;
  }
  return token.slice(cut + 1);
}

const COLOR_TOKENS = new Set(['border-[var(--border)]', 'divide-[var(--border)]']);
const DIRECTIONAL_RE = /^border-[tblrxy](-[1-9][0-9]*|-\[[0-9.]+px\])?$/;

function findRowDividerViolations(): string[] {
  const violations: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of listTsx(dir)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const tokens = line
          .split(/[\s'"`]+/)
          .filter(Boolean)
          .map(stripVariants);
        if (!tokens.some((t) => COLOR_TOKENS.has(t))) return;
        const hasDirectional = tokens.some(
          (t) => DIRECTIONAL_RE.test(t) || t.startsWith('divide-'),
        );
        const hasFourSide = tokens.includes('border');
        if (hasDirectional && !hasFourSide) {
          violations.push(`${path.relative(SRC_ROOT, file)}:${i + 1}`);
        }
      });
    }
  }
  return violations;
}

describe('행 구분선은 hairline(--border-subtle)', () => {
  it('방향 구분선이 면 외곽선 토큰 --border 를 쓰지 않는다', () => {
    const violations = findRowDividerViolations();
    expect(violations, `--border 를 쓰는 행 구분선:\n${violations.join('\n')}`).toEqual([]);
  });
});
