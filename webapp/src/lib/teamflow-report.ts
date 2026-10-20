/**
 * 팀 매집 보고서 표시 변환 한 모듈 (Phase 33 · UI-SPEC 「표시 변환 규칙 (T11)」 · D-09 · D-10).
 *
 * DB · API 는 export 원문 단위 그대로다(원 · ms epoch · share 0~1 · rate %) — 억 · % · 시각 변환은 여기서만 한다(D-04).
 * - 금액 = 부호 + 억 소수 1자리(0 에서 먼 쪽 반올림 `roundHalfAway` — 등락률과 같은 규칙이라 같은 크기의 ± 값이
 *   대칭으로 보인다: ±0.05억 → 「+0.1억」 · 「−0.1억」, 코드 리뷰 WR-02) · 반올림 0 은 부호 없는 「0.0억」 · 조 변환 없음(D-10).
 *   `lib/format.ts` 의 억 함수(버림 · 부호 없음 · 조 변환)는 규칙이 달라 쓰지 않는다.
 * - 음수 부호는 U+2212(−) — 하이픈이 아니다.
 * - 요약 문장(`payload.summary_lines`)은 HTML 문자열을 주입하지 않고 조각 배열(`summaryPartsOf`)로만 렌더한다.
 *
 * 33-03 = KPI · 행 칸 · 미니막대 슬롯 · 33-06 = 10분 축 슬롯(`bucketSlotsOf`) · 등락 범위(`fmtRangePct`).
 */

import type {
  TeamflowBand,
  TeamflowBucket,
  TeamflowMemberFlow,
  TeamflowMemberFlowMember,
  TeamflowMemberNet,
  TeamflowPayload,
  TeamflowRow,
} from '@gh-radar/shared';

import { kstSecOf } from './limitup-report';

/** U+2212 MINUS SIGN */
export const MINUS = '−';
const DASH = '—';

/** 0.5 를 0 에서 먼 쪽으로 — 양 · 음수가 같은 규칙으로 반올림된다. */
function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** 유한한 number 만 통과 — null · undefined(키 없음) · NaN 은 「값 없음」. 화면 · sr 설명이 같은 판정을 쓰도록 export(IN-04). */
export const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 원 → 억 소수 1자리 반올림 값(−0 은 0). null · NaN 은 null. 표시 · 색이 같은 값을 쓴다.
 * 0.5 는 0 에서 먼 쪽(`roundHalfAway` — `fmtRate` · `fmtPct1` 과 같은 규칙). 부호에 따라 반올림이 갈리면 순매수 ·
 * 순매도가 비대칭으로 보인다(`Math.round` 는 +5,000,000 원 「+0.1억」 인데 −5,000,000 원 「0.0억」 이었다 · WR-02).
 */
function eokOf(won: number | null | undefined): number | null {
  if (!isNum(won)) return null;
  const v = roundHalfAway(won / 1e7) / 10;
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

/** 팀 비중(0~1) → 정수 「26%」(× 100 반올림) · null 「—」(D-10). */
export function fmtShare(share: number | null | undefined): string {
  if (!isNum(share)) return DASH;
  return `${Math.round(share * 100)}%`;
}

/** 매수 중 팀 강조 문턱 — share ≥ 0.30 이면 `--team` 600(UI-SPEC Color). */
export function isHotShare(share: number | null | undefined): boolean {
  return isNum(share) && share >= 0.3;
}

/** 수량 → ko-KR 정수 「96,289」 · `signed` 면 「+96,289」 / 「−21,245」(0 은 부호 없음) · null 「—」. 단위 「주」 는 호출부. */
export function fmtQty(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (!isNum(n)) return DASH;
  const v = Math.round(n);
  const abs = INT_FMT.format(Math.abs(v));
  if (v < 0) return `${MINUS}${abs}`;
  return `${opts.signed && v > 0 ? '+' : ''}${abs}`;
}

/** 미니막대 9칸 고정 라벨(UI-SPEC T4 순서 · 「하루 합계」 없음). 5번째 칸(20~25%) 앞이 20% 경계. */
export const BAND_SLOTS = [
  '0% 미만',
  '0~5%',
  '5~10%',
  '10~15%',
  '15~20%',
  '20~25%',
  '25~28%',
  '28%~상한 미만',
  '상한가 가격',
] as const;

/**
 * payload.bands → 9칸 `net_val`(UI-SPEC T4). 라벨이 일치하는 칸에만 놓고 없으면 null(칸 위치 고정) ·
 * 「하루 합계」 · 모르는 라벨은 어디에도 놓지 않는다(T11 error).
 */
export function bandSlotsOf(bands: readonly Pick<TeamflowBand, 'label' | 'net_val'>[]): (number | null)[] {
  return BAND_SLOTS.map((label) => {
    const b = bands.find((x) => x.label === label);
    return b && isNum(b.net_val) ? b.net_val : null;
  });
}

/**
 * 행 sr 설명(UI-SPEC T3 Copywriting) — 「결과 {태그}{, 고가 +NN.N%}, 팀 순매수 {net}, 20% 아래 {below20}, 20%~상한 {above20},
 * 매수 중 팀 {share}」. 고가는 미도달 · high_rate 있을 때만(D-09 보조줄과 같은 조건).
 */
export function rowDescriptionOf(
  row: Pick<
    TeamflowRow,
    | 'status'
    | 'first_limit_ms'
    | 'last_rate'
    | 'high_rate'
    | 'team_net_val'
    | 'below20_net_val'
    | 'above20_net_val'
    | 'team_buy_share'
  >,
): string {
  const tag = tagOf(row);
  const parts = [`결과 ${tag.text}`];
  if (tag.kind === 'below' && isNum(row.high_rate)) parts.push(`고가 ${fmtRate(row.high_rate)}`);
  parts.push(
    `팀 순매수 ${fmtEok(row.team_net_val, { signed: true })}`,
    `20% 아래 ${fmtEok(row.below20_net_val, { signed: true })}`,
    `20%~상한 ${fmtEok(row.above20_net_val, { signed: true })}`,
    `매수 중 팀 ${fmtShare(row.team_buy_share)}`,
  );
  return parts.join(', ');
}

/** 10분 축(D-13) — key = KST 하루 10분 칸 번호. 54 = 09:00 · 92 = 15:20 · 93 = 15:30(종가 단일가 체결). */
export const BUCKET_KEY_FIRST = 54;
export const BUCKET_KEY_LAST = 92;
export const BUCKET_KEY_CLOSE = 93;
/** 09:00~15:30 고정 39칸. */
export const BUCKET_SLOTS = 39;

/** 슬롯 38 합산에서 더하는 수량 · 금액 키(10개). */
const BUCKET_SUM_KEYS = [
  'vol',
  'val',
  'buy_aggr',
  'sell_aggr',
  'team_buy',
  'team_sell',
  'net',
  'team_buy_val',
  'team_sell_val',
  'net_val',
] as const;

/** null-안전 합 — 둘 다 null 이면 null, 한쪽만 있으면 그 값. */
const sumOrNull = (a: number | null, b: number | null): number | null =>
  isNum(a) ? (isNum(b) ? a + b : a) : isNum(b) ? b : null;

/** null-안전 min/max — 둘 중 non-null 만 본다. */
const pickOrNull = (a: number | null, b: number | null, f: (x: number, y: number) => number): number | null =>
  isNum(a) ? (isNum(b) ? f(a, b) : a) : isNum(b) ? b : null;

/** 슬롯 38(15:20 칸)에 종가 단일가 버킷을 접는다 — 새 객체(입력 불변). */
function mergeCloseInto(base: TeamflowBucket, close: TeamflowBucket): TeamflowBucket {
  const out: TeamflowBucket = { ...base, start: '15:20' };
  for (const k of BUCKET_SUM_KEYS) out[k] = sumOrNull(base[k], close[k]);
  out.lo = pickOrNull(base.lo, close.lo, Math.min);
  out.hi = pickOrNull(base.hi, close.hi, Math.max);
  out.share = isNum(out.buy_aggr) && out.buy_aggr !== 0 && isNum(out.team_buy) ? out.team_buy / out.buy_aggr : null;
  return out;
}

/**
 * payload.buckets → 10분 차트 39칸(D-13 · UI-SPEC T11 `bucketSlotsOf`). 칸 i = key 54 + i(09:00 … 15:20) · 빈 칸 null —
 * 종목이 달라도 같은 자리에 같은 시각이 온다(잠김 · VI 공백이 빈자리로 보인다).
 *
 * **D-13 보정(2026-10-16 사용자 결정):** key 93(15:30:00 종가 단일가 체결 · 15:20~15:30 접수)은 슬롯 38(15:20 칸)에
 * 합산한다 — 수량 · 금액 10키는 null-안전 합 · `lo` = min · `hi` = max · `share` = 합산 `team_buy ÷ buy_aggr`(분모 0 → null) ·
 * 칸 `start` 「15:20」. 슬롯 38 이 비어 있으면 key 93 복사본(`key` 92 · `start` 「15:20」)을 둔다.
 * 그 밖의 범위 밖 key(< 54 · > 93)는 차트에서 버린다. 「10분 표 보기」 표에는 key 92 · 93 · 범위 밖 key 가 각자 행으로 남는다
 * (표는 이 함수를 쓰지 않는다). 입력 배열 · 객체는 바꾸지 않는다.
 */
export function bucketSlotsOf(buckets: readonly TeamflowBucket[]): (TeamflowBucket | null)[] {
  const slots: (TeamflowBucket | null)[] = Array.from({ length: BUCKET_SLOTS }, () => null);
  const closes: TeamflowBucket[] = [];
  for (const b of buckets) {
    if (b.key === BUCKET_KEY_CLOSE) closes.push(b);
    else if (b.key >= BUCKET_KEY_FIRST && b.key <= BUCKET_KEY_LAST) slots[b.key - BUCKET_KEY_FIRST] = { ...b };
  }
  const last = BUCKET_SLOTS - 1;
  for (const c of closes) {
    const cur = slots[last];
    slots[last] = cur ? mergeCloseInto(cur, c) : { ...c, key: BUCKET_KEY_LAST, start: '15:20' };
  }
  return slots;
}

/** 등락률 % 소수 1자리(0.05 는 0 에서 먼 쪽) · 음수만 U+2212 · −0 은 「0.0」. */
function fmtPct1(v: number): string {
  const r = roundHalfAway(v * 10) / 10;
  if (r === 0) return '0.0';
  return `${r < 0 ? MINUS : ''}${Math.abs(r).toFixed(1)}`;
}

/** 10분 등락 범위 「21.1~29.8%」 · 「−1.2~3.4%」(소수 1자리 · 음수만 「−」). 둘 중 null 이면 「—」. */
export function fmtRangePct(lo: number | null | undefined, hi: number | null | undefined): string {
  if (!isNum(lo) || !isNum(hi)) return DASH;
  return `${fmtPct1(lo)}~${fmtPct1(hi)}%`;
}

// ─── quick 261018-j17 — 거래원별 순매수(payload.member_flow) ───

/** 행렬 칸 글자 — `fmtEok(won, { signed: true })` 에서 「억」 만 뺀 것: 「+8.1」 · 「−1.8」 · 「0.0」 · null 「—」. */
export function fmtEokCell(won: number | null | undefined): string {
  const s = fmtEok(won, { signed: true });
  return s === DASH ? DASH : s.slice(0, -1);
}

/**
 * payload.member_flow — 객체이고 members · bands · buckets 가 배열일 때만 그것, 아니면 null(옛 행 키 없음 · B9 없음 null ·
 * 모양 오류). 정본 gh-trade team-flow.md §11.
 */
export function memberFlowOf(payload: TeamflowPayload | null | undefined): TeamflowMemberFlow | null {
  const f = payload?.member_flow;
  if (f === null || typeof f !== 'object') return null;
  if (!Array.isArray(f.members) || !Array.isArray(f.bands) || !Array.isArray(f.buckets)) return null;
  return f;
}

export interface MemberMatrixRow {
  /** 행 id — 구간 = 라벨 · 10분 = String(key) */
  id: string;
  label: string;
  /** 10분 행 key · 구간 행 null */
  key: number | null;
  /** 팀 순매수(원) — payload bands/buckets 의 net_val */
  team: number | null;
  /** 다섯 창구 순매수(원) — members 순서 · null = 모름 */
  cells: (number | null)[];
  /** 「상한가 가격」 행 */
  lim: boolean;
  /** 「하루 합계」 행 */
  total: boolean;
}

export interface MemberMatrix {
  members: TeamflowMemberFlowMember[];
  rows: MemberMatrixRow[];
  /** 다섯 창구 칸 |값| 최대(하루 합계 행 제외 · 없으면 0) — 배경 진하기 공통 눈금 */
  mx: number;
}

const cellsOf = (net: TeamflowMemberNet | null | undefined, members: readonly TeamflowMemberFlowMember[]) =>
  members.map((m) => {
    const v = net?.[m.member];
    return isNum(v) ? v : null;
  });

const mxOf = (rows: readonly MemberMatrixRow[]) =>
  rows.reduce((mx, r) => (r.total ? mx : Math.max(mx, ...r.cells.filter(isNum).map(Math.abs))), 0);

/**
 * 등락 구간 행렬(C-02 · 목업 016 안 B) — 행 = flow.bands 순서(상한가 가격 포함 · 마지막 「하루 합계」 = 상한가 가격 뺀 합).
 * 팀 칸 = payload bands 에서 **라벨로** 찾은 net_val(인덱스로 맞추지 않는다). 다섯 창구 칸 = members 순서로 net_val[창구 코드].
 * `mx` = 다섯 창구 칸 공통 눈금(팀 열 · 하루 합계 제외) — 팀 숫자와 거래원 숫자는 출처가 달라 한 눈금에 섞지 않는다.
 */
export function memberBandMatrixOf(bands: readonly TeamflowBand[], flow: TeamflowMemberFlow): MemberMatrix {
  const rows: MemberMatrixRow[] = flow.bands.map((fb) => {
    const tb = bands.find((b) => b.label === fb.label);
    return {
      id: fb.label,
      label: fb.label,
      key: null,
      team: tb && isNum(tb.net_val) ? tb.net_val : null,
      cells: cellsOf(fb.net_val, flow.members),
      lim: fb.label === '상한가 가격',
      total: fb.label === '하루 합계',
    };
  });
  return { members: flow.members, rows, mx: mxOf(rows) };
}

/** key(10분 칸 번호) → 「HH:MM」. */
const hmOfKey = (key: number) => {
  const min = key * 10;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
};

/**
 * 10분 행렬(C-04 · C-14) — 행 = flow.buckets 전부 key 오름차순(key 93 「15:30」 도 자기 행 · 차트의 39칸 합산을 쓰지 않는다 ·
 * 원본 불변). label = 같은 key 의 payload bucket start(없으면 key × 10분). 팀 칸 = 그 bucket net_val.
 */
export function memberBucketMatrixOf(buckets: readonly TeamflowBucket[], flow: TeamflowMemberFlow): MemberMatrix {
  const rows: MemberMatrixRow[] = [...flow.buckets]
    .sort((a, b) => a.key - b.key)
    .map((fb) => {
      const tb = buckets.find((b) => b.key === fb.key);
      return {
        id: String(fb.key),
        label: tb?.start ?? hmOfKey(fb.key),
        key: fb.key,
        team: tb && isNum(tb.net_val) ? tb.net_val : null,
        cells: cellsOf(fb.net_val, flow.members),
        lim: false,
        total: false,
      };
    });
  return { members: flow.members, rows, mx: mxOf(rows) };
}

/** 배경 color-mix 비율 0~40(정수) — |won| ÷ mx 비례(1 에서 자름). 값 없음 · 0 · mx ≤ 0 이면 0(배경 없음). */
export function mixPctOf(won: number | null, mx: number): number {
  if (!isNum(won) || won === 0 || !(mx > 0)) return 0;
  return Math.round(Math.min(Math.abs(won) / mx, 1) * 40);
}

/**
 * 거래원별 하루 블록의 분해 줄(C-06 · 재량 8) — 창구 코드로 member_flow 칸을 찾는다.
 * pre = 「하루 합계」 칸(상한가 전 = gh-trade 하루 합계(상한가 가격 뺀 구간 합) — 다시 더하지 않는다) ·
 * lim = 「상한가 가격」 칸(그 구간이 있을 때만 hasLim true · 미도달 종목은 hasLim false · lim null). flow null → null.
 */
export function memberDaySplitOf(
  flow: TeamflowMemberFlow | null,
  member: string,
): { pre: number | null; lim: number | null; hasLim: boolean } | null {
  if (flow === null) return null;
  const at = (label: string) => {
    const b = flow.bands.find((x) => x.label === label);
    const v = b?.net_val?.[member];
    return { has: b !== undefined, v: isNum(v) ? v : null };
  };
  const total = at('하루 합계');
  const lim = at('상한가 가격');
  return { pre: total.v, lim: lim.has ? lim.v : null, hasLim: lim.has };
}
