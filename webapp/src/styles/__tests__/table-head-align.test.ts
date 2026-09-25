/**
 * quick-260925-ptw — `.tbl-wrap` 표 머리글 정렬 층위 회귀 가드.
 *
 * 층 없는(unlayered) `.tbl-wrap thead th { text-align: left }` 는 Tailwind v4 utilities 층의 `text-right`
 * 를 명시도와 무관하게 이기고, 명시도 (0,1,2) 로 `.num`(0,1,0)도 이긴다 — 우정렬 데이터 열의 머리글이
 * 좌정렬로 그려졌다. 좌정렬 기본값은 `@layer components` 에 있어야 하고, `.num` 의 우정렬은 층 없는
 * 채로 남아야 한다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(path.resolve(__dirname, '../globals.css'), 'utf8');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** 줄 시작(= 최상위 · 층 없음) `selector {` 블록 본문 — 들여쓴 `@layer` 안 규칙과 구분된다. */
function topLevelBlock(selector: string): string {
  const start = CSS.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`최상위 블록을 찾지 못함: ${selector}`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('\n}', open);
  return stripComments(CSS.slice(open + 1, close));
}

/** `@layer components { … }` 블록들의 본문(중괄호 짝 맞춤). */
function componentLayerBodies(): string[] {
  const out: string[] = [];
  const re = /@layer\s+components\s*\{/g;
  for (let m = re.exec(CSS); m !== null; m = re.exec(CSS)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    while (i < CSS.length && depth > 0) {
      if (CSS[i] === '{') depth += 1;
      else if (CSS[i] === '}') depth -= 1;
      i += 1;
    }
    out.push(stripComments(CSS.slice(from, i - 1)));
  }
  return out;
}

describe('globals.css — .tbl-wrap 머리글 정렬 층위 (quick-260925-ptw)', () => {
  it('층 없는 최상위 `.tbl-wrap thead th` 블록에 text-align 이 없다', () => {
    const body = topLevelBlock('.tbl-wrap thead th');
    expect(body).toContain('background: transparent');
    expect(body).not.toMatch(/text-align\s*:/);
  });

  it('@layer components 안에 `.tbl-wrap thead th { text-align: left; }` 기본값이 있다', () => {
    const hit = componentLayerBodies().some((b) =>
      /\.tbl-wrap\s+thead\s+th\s*\{[^}]*text-align\s*:\s*left\s*;?[^}]*\}/.test(b),
    );
    expect(hit).toBe(true);
  });

  it('최상위 `.num` 블록은 text-align: right 를 유지한다(층 없음)', () => {
    expect(topLevelBlock('.num')).toMatch(/text-align\s*:\s*right/);
  });
});
