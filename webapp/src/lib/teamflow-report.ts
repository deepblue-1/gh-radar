/**
 * 팀 매집 보고서 표시 변환 한 모듈 (Phase 33 · UI-SPEC 「표시 변환 규칙 (T11)」 · D-09 · D-10).
 *
 * DB · API 는 export 원문 단위 그대로다(원 · ms epoch · share 0~1 · rate %) — 억 · % · 시각 변환은 여기서만 한다(D-04).
 * - 금액 = 부호 + 억 소수 1자리(`Math.round` 반올림 — 음수 −0.05억 경계는 +쪽으로 가 「0.0억」, RESEARCH A4 골든) ·
 *   반올림 0 은 부호 없는 「0.0억」 · 조 변환 없음(D-10).
 *   `lib/format.ts` 의 억 함수(버림 · 부호 없음 · 조 변환)는 규칙이 달라 쓰지 않는다.
 * - 음수 부호는 U+2212(−) — 하이픈이 아니다.
 * - 요약 문장(`payload.summary_lines`)은 HTML 문자열을 주입하지 않고 조각 배열(`summaryPartsOf`)로만 렌더한다.
 *
 * 뒤 플랜(33-06)이 10분 축 변환을 이 모듈에 덧붙인다(KPI · 행 칸 · 미니막대 슬롯은 33-03).
 */

import type { TeamflowRow } from '@gh-radar/shared';

import { kstSecOf } from './limitup-report';

/** U+2212 MINUS SIGN */
export const MINUS = '−';
const DASH = '—';

/** 0.5 를 0 에서 먼 쪽으로 — 양 · 음수가 같은 규칙으로 반올림된다. */
function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 원 → 억 소수 1자리 반올림 값(−0 은 0). null · NaN 은 null.
 * `Math.round` 그대로 — −5,000,000 원(−0.05억)은 「0.0억」(골든 잠금 · RESEARCH A4). 표시 · 색이 같은 값을 쓴다.
 */
function eokOf(won: number | null | undefined): number | null {
  if (!isNum(won)) return null;
  const v = Math.round(won / 1e7) / 10;
  return v === 0 ? 0 : v;
}

const EOK_FMT = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INT_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/**
 * 원 → 「+7.0억」 · 「−3.1억」 · 「0.0억」 · 「+1,234.5억」(D-10).
 * `signed` 가 아니면 양수에 「+」 를 붙이지 않는다(음수의 「−」 는 남긴다 — 값을 숨기지 않는다). null/NaN 「—」.
 */
export function fmtEok(won: number | null | undefined, opts: { signed?: boolean } = {}): string {
  const v = eokOf(won);
  if (v === null) return DASH;
  if (v === 0) return '0.0억';
  const abs = EOK_FMT.format(Math.abs(v));
  if (v < 0) return `${MINUS}${abs}억`;
  return `${opts.signed ? '+' : ''}${abs}억`;
}

export type TeamflowTone = 'up' | 'down' | 'flat';

/** 반올림(억 1자리) 값 기준 색 판정 — 글자 · 막대가 같은 판정을 쓴다. null 은 flat. */
export function toneOf(won: number | null | undefined): TeamflowTone {
  const v = eokOf(won);
  if (v === null || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

/** tone → 글자 색 클래스(금액 칸). */
export const TONE_TEXT: Record<TeamflowTone, string> = {
  up: 'text-[var(--up)]',
  down: 'text-[var(--down)]',
  flat: 'text-[var(--fg-2)]',
};

/** 등락률 %(30.0 = +30%) → 「+22.6%」 · 「−3.1%」 · 「0.0%」. null 「—」. */
export function fmtRate(pct: number | null | undefined): string {
  if (!isNum(pct)) return DASH;
  const r = roundHalfAway(pct * 10) / 10;
  if (r === 0) return '0.0%';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}%`;
}

/** epoch ms → KST 「HH:MM」. */
export function kstHm(ms: number): string {
  const s = kstSecOf(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}`;
}

export interface TeamflowTag {
  kind: 'limit' | 'below';
  text: string;
}

/** 결과 태그(D-09) — 상한가면 「상한가 HH:MM」(첫 상한가 KST · 없으면 「상한가」), 아니면 마지막 등락률 「+22.6%」. */
export function tagOf(row: Pick<TeamflowRow, 'status' | 'first_limit_ms' | 'last_rate'>): TeamflowTag {
  if (row.status === 'limit') {
    return { kind: 'limit', text: isNum(row.first_limit_ms) ? `상한가 ${kstHm(row.first_limit_ms)}` : '상한가' };
  }
  return { kind: 'below', text: fmtRate(row.last_rate) };
}

/** 정렬(D-08) — team_net_val 내림차순 · null 맨 뒤 · 같으면 isin 오름차순. 원본 불변. */
export function sortRows<T extends Pick<TeamflowRow, 'isin' | 'team_net_val'>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const an = isNum(a.team_net_val);
    const bn = isNum(b.team_net_val);
    if (an && bn && a.team_net_val !== b.team_net_val) return (b.team_net_val as number) - (a.team_net_val as number);
    if (an !== bn) return an ? -1 : 1;
    return a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0;
  });
}

export interface SummaryPart {
  text: string;
  strong?: boolean;
}

const TAG_RE = /(<\/?[A-Za-z][^>]*>)/;
const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decodeEntities = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, k: string) => ENTITY[k] ?? _);

/**
 * 요약 문장 한 줄 → 조각 배열. `<b>…</b>` 짝만 strong 조각 · 그 밖 태그 · 짝 없는 `<b>`/`</b>` 는 글자째 제거
 * (텍스트만 남긴다) · 엔티티 5종 해제(한 번에 — 이중 해제 없음). 빈 조각은 버리고 이웃한 같은 굵기 조각은 합친다.
 */
export function summaryPartsOf(line: string): SummaryPart[] {
  const segs: { text: string; strong: boolean }[] = [];
  let openAt = -1; // 열린 <b> 이후 첫 조각 위치 — 닫히지 않으면 그 뒤를 보통 글자로 되돌린다
  for (const tok of line.split(TAG_RE)) {
    if (tok === '') continue;
    if (TAG_RE.test(tok)) {
      const m = /^<(\/?)([A-Za-z]+)/.exec(tok);
      const closing = m?.[1] === '/';
      const name = m?.[2]?.toLowerCase();
      if (name === 'b' && !closing && openAt < 0) openAt = segs.length;
      else if (name === 'b' && closing && openAt >= 0) openAt = -1;
      continue; // 태그 자체는 글자로 남기지 않는다
    }
    segs.push({ text: decodeEntities(tok), strong: openAt >= 0 });
  }
  if (openAt >= 0) for (let i = openAt; i < segs.length; i++) segs[i]!.strong = false;

  const out: SummaryPart[] = [];
  for (const s of segs) {
    if (s.text === '') continue;
    const last = out.at(-1);
    if (last && Boolean(last.strong) === s.strong) last.text += s.text;
    else out.push(s.strong ? { text: s.text, strong: true } : { text: s.text });
  }
  return out;
}

const fmtPx = (v: number) => INT_FMT.format(v);

/**
 * 요약 상자 끝 사실 줄 — 「기준가 {base} · 상한가 {upper} · 고가 {high_px} ({high_rate}, {HH:MM}) · 종가 {last_px} ({last_rate})
 * · 거래대금 {value 억}」. 값 없는 칸은 칸째 생략(「 · 」 꼬리 없음 — UI-SPEC Copywriting 정본). 전부 없으면 null.
 */
export function factLineOf(
  row: Pick<TeamflowRow, 'base' | 'upper' | 'high_px' | 'high_rate' | 'high_ms' | 'last_px' | 'last_rate' | 'value'>,
): string | null {
  const parts: string[] = [];
  if (isNum(row.base)) parts.push(`기준가 ${fmtPx(row.base)}`);
  if (isNum(row.upper)) parts.push(`상한가 ${fmtPx(row.upper)}`);
  if (isNum(row.high_px)) {
    const sub = [isNum(row.high_rate) ? fmtRate(row.high_rate) : null, isNum(row.high_ms) ? kstHm(row.high_ms) : null]
      .filter((x): x is string => x !== null)
      .join(', ');
    parts.push(`고가 ${fmtPx(row.high_px)}${sub ? ` (${sub})` : ''}`);
  }
  if (isNum(row.last_px)) {
    parts.push(`종가 ${fmtPx(row.last_px)}${isNum(row.last_rate) ? ` (${fmtRate(row.last_rate)})` : ''}`);
  }
  if (isNum(row.value)) parts.push(`거래대금 ${fmtEok(row.value)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export interface TeamflowKpis {
  /** 탐지 종목 = 행 수 */
  detected: number;
  /** 팀 순매수 종목 = team_net_val > 0 행 수 */
  netPositive: number;
  /** 상한가 도달 = status === 'limit' 행 수(종가 기준 — D-11) */
  limit: number;
  /** 팀 순매수 합(원) = 전 행 team_net_val 합 · 음수 포함 · null 제외 */
  netSum: number;
}

/** KPI 4칸(D-11 · UI-SPEC T2) — team_net_val null 행은 합 · 「팀 순매수 종목」 에서 빠지고 탐지 수에는 남는다. */
export function kpisOf(rows: readonly Pick<TeamflowRow, 'status' | 'team_net_val'>[]): TeamflowKpis {
  let netPositive = 0;
  let limit = 0;
  let netSum = 0;
  for (const r of rows) {
    if (isNum(r.team_net_val)) {
      netSum += r.team_net_val;
      if (r.team_net_val > 0) netPositive += 1;
    }
    if (r.status === 'limit') limit += 1;
  }
  return { detected: rows.length, netPositive, limit, netSum };
}
