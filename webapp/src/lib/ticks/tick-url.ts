/**
 * 틱 전문 뷰어 URL 계약 · 기본 날짜 · 「자료 없음」 사유 (Phase 37 D-15 · D-16 · D-18).
 *
 * ① URL 정본 = `/analytics/ticks?isin=&d=YYYYMMDD&ex=KRX|NXT&t=HH:MM:SS.mmm`. 잘못된 값은 조용히 버린다(기본값) —
 *   딥링크를 손으로 고친 사람에게 오류 화면 대신 진입 화면을 준다. 직렬화 순서는 isin · d · ex · t 이고 빈 값은 뺀다.
 *   `ex` 기본값 KRX 도 뺀다(같은 화면 · 짧은 URL). 틱 이동 `history.replaceState` 는 37-10 몫이다.
 * ② 기본 날짜(D-15): KST 평일 ∧ 휴장 아님 ∧ 08:00 ≤ 지금 < 20:00 이면 오늘(`today` — 오늘 목록 · 「라이브」 칩),
 *   그 밖에는 격자가 있는 최근 날짜(`latest` — server `/api/ticks/day` 를 d 없이).
 * ③ 「자료 없음」 사유(D-16 상태 카드) — 휴장(주말 · KRX 휴장일) · 미래(오늘 08:00 전 포함) · 업로드 전(오늘 20:00 뒤 —
 *   원본은 매일 22:00 업로드 · 23:30 뒤 변환) · 보관 밖(오늘 − 90일보다 이전 · D-04). 서버 판정 `NOT_UPLOADED`
 *   (어제처럼 아직 원본이 안 올라온 날)도 화면에서는 같은 「업로드 전」 카드로 보인다.
 * 날짜는 모두 KST 달력 기준 `YYYYMMDD` 문자열이다(사전순 = 시간순).
 */

import { isKrxHoliday, type TickExchange } from '@gh-radar/shared';

export interface TickUrlState {
  isin: string | null;
  d: string | null;
  ex: TickExchange;
  t: string | null;
}

export const TICKS_BASE = '/analytics/ticks';

const ISIN_RE = /^[A-Z0-9]{12}$/;
const T_RE = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;
const KST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;

/** 보관 기간(일) — D-04 격자 90일. */
export const TICK_RETENTION_DAYS = 90;

/** `YYYYMMDD` 가 실재하는 날짜면 그대로(그 밖 null). */
export function parseTickDate(raw: string | null | undefined): string | null {
  if (raw == null || !/^\d{8}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const d = Number(raw.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? raw : null;
}

/** `t` 가 `HH:MM:SS(.mmm)` 이고 시 · 분 · 초가 범위 안이면 그대로. */
function parseTickTime(raw: string | null): string | null {
  if (raw == null || !T_RE.test(raw)) return null;
  const [h, m, s] = raw.slice(0, 8).split(':').map(Number) as [number, number, number];
  return h < 24 && m < 60 && s < 60 ? raw : null;
}

export function parseTickUrl(sp: URLSearchParams): TickUrlState {
  const isin = sp.get('isin');
  const ex = sp.get('ex');
  return {
    isin: isin !== null && ISIN_RE.test(isin) ? isin : null,
    d: parseTickDate(sp.get('d')),
    ex: ex === 'NXT' ? 'NXT' : 'KRX',
    t: parseTickTime(sp.get('t')),
  };
}

/** 상태 → URL. 순서 isin · d · ex · t, 빈 값과 기본 거래소(KRX)는 뺀다. */
export function tickUrlOf(s: Partial<TickUrlState>): string {
  const q = new URLSearchParams();
  if (s.isin) q.set('isin', s.isin);
  if (s.d) q.set('d', s.d);
  if (s.ex === 'NXT') q.set('ex', 'NXT');
  if (s.t) q.set('t', s.t);
  const qs = q.toString();
  return qs === '' ? TICKS_BASE : `${TICKS_BASE}?${qs}`;
}

/** 지금 KST 의 날짜(`YYYYMMDD`) · 분(00:00 기준) · 요일(0=일). */
export function kstNowOf(now: Date): { ymd: string; minutes: number; weekday: number } {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const ymd = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
  return { ymd, minutes: k.getUTCHours() * 60 + k.getUTCMinutes(), weekday: k.getUTCDay() };
}

const isoOf = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const epochOf = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));

/** 그날이 거래일인가 — 주말 · KRX 휴장일이 아니면 true. */
export function isTradingDay(ymd: string): boolean {
  const wd = new Date(epochOf(ymd)).getUTCDay();
  return wd !== 0 && wd !== 6 && !isKrxHoliday(isoOf(ymd));
}

const OPEN_MIN = 8 * 60;
const CLOSE_MIN = 20 * 60;

/** D-15 — 오늘 장(08:00~20:00 KST 거래일) 안이면 today, 아니면 latest(격자가 있는 최근 날짜). */
export function defaultTickDateOf(now: Date): { mode: 'today' | 'latest'; today: string } {
  const { ymd, minutes } = kstNowOf(now);
  const live = isTradingDay(ymd) && minutes >= OPEN_MIN && minutes < CLOSE_MIN;
  return { mode: live ? 'today' : 'latest', today: ymd };
}

export type NodataReason = 'holiday' | 'future' | 'not-uploaded' | 'retention';

/** 그 날짜를 지금 열 수 없는 이유(없으면 null — 열거나 변환할 수 있다). */
export function nodataReasonOf(d: string, now: Date): NodataReason | null {
  if (!isTradingDay(d)) return 'holiday';
  const { ymd: today, minutes } = kstNowOf(now);
  if (d > today) return 'future';
  if (d === today) {
    if (minutes < OPEN_MIN) return 'future';
    if (minutes >= CLOSE_MIN) return 'not-uploaded';
    return null;
  }
  if (epochOf(d) < epochOf(today) - TICK_RETENTION_DAYS * DAY_MS) return 'retention';
  return null;
}
