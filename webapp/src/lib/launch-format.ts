/**
 * launch-format — 발사 주문 내역 화면의 표기 · 카드 모델 (Phase 35 · D-11 ~ D-14 · 채택 목업 변형 A).
 *
 * 화면 정본 = `.planning/phases/35-launch-gate/reference/mockup-launch-orders.html`. 순수 함수만 둔다(React 없음).
 *
 * ① 숫자 표기 — 음수 부호는 U+2212(MINUS) · 천 단위 ko-KR · 양수는 「+」. null 은 전부 「—」.
 * ② 경계 폴백 · 패널 순서는 shared `launchDaysOf` · `LAUNCH_ORDER` 한 벌(경계 지도와 같은 규칙 — 두 번째 구현 금지).
 * ③ 카드 모델은 **머리 우선 · 조각 폴백**이다. 결과 수는 언제나 탭 조각에서 센다(표와 같은 수).
 * ④ 대기열 열(quick-261103-pei) = 목업 `.planning/sketches/027-launch-queue-position/index.html` 변형 A(`q16A` · `nA` 문구) —
 *    값은 DB 저장값(조각 `queue` · 밤 틱 변환이 계산)만 쓴다. 여기서 다시 계산하지 않는다(D-1 · D-3).
 */

import {
  LAUNCH_ORDER,
  brokerOfServerKey,
  isLaunchAccept,
  isLaunchFireBaseOf,
  isLaunchReject,
  isLaunchTailProbe,
  launchDaysOf,
  type LaunchFire,
  type LaunchHeadRow,
  type LaunchPieceRow,
} from '@gh-radar/shared';
import { kstHm } from './teamflow-report';

/** 음수 부호(U+2212) — 하이픈과 폭이 달라 숫자 열이 흔들리지 않는다. */
export const MINUS = '−';
/** 빈 칸. */
export const DASH = '—';

const NUM = new Intl.NumberFormat('ko-KR');

/** µs 값 — null 「—」 · 0 「0」 · 양수 「+1,234」 · 음수 「−20,148」. */
export function fmtUs(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  if (v === 0) return '0';
  const abs = NUM.format(Math.abs(v));
  return v > 0 ? `+${abs}` : `${MINUS}${abs}`;
}

/** 접수 시각 HHMMSSmmm 숫자(09시대 = 앞 0 빠진 8자리) → 「HH:MM:SS.mmm」. null 「—」. */
export function fmtAcceptTime(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  const s = String(v).padStart(9, '0');
  if (!/^\d{9}$/.test(s)) return String(v);
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}.${s.slice(6, 9)}`;
}

export type LaunchResultTone = 'ok' | 'bad' | 'other';

/** 결과 원문 → 알약 색 축 — 접수 · 거부(101 · 515) · 기타(그 밖 전부). */
export function resultToneOf(result: string): LaunchResultTone {
  if (isLaunchAccept(result)) return 'ok';
  if (isLaunchReject(result)) return 'bad';
  return 'other';
}

/** 구분 — buy 매수(--up) · sell 매도(--down) · 그 밖 「—」. */
export function sideLabelOf(side: string | null): { label: '매수' | '매도' | '—'; tone: 'up' | 'down' | null } {
  if (side === 'buy') return { label: '매수', tone: 'up' };
  if (side === 'sell') return { label: '매도', tone: 'down' };
  return { label: DASH, tone: null };
}

type FireKey = Pick<LaunchPieceRow, 'profile' | 'fire_exchange' | 'fire_base'>;

const cell = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? DASH : String(v);

/**
 * 키 열 — Q16 「Q153015001 · j0 · R0」 · 그 밖 「N · idx1」. null 칸은 「—」.
 * 16:00 뒤탐침(probe true · round −2)은 「Q153015001 · 뒤탐침 2」(piece_idx + 1 · null 이면 번호 없음 · quick-261030-dz7).
 */
export function pieceKeyLabelOf(
  p: Pick<LaunchPieceRow, 'profile' | 'queued_id' | 'piece_idx' | 'round'> & Partial<Pick<LaunchPieceRow, 'probe'>>,
): string {
  if (isLaunchTailProbe(p)) {
    return p.piece_idx === null ? `${cell(p.queued_id)} · 뒤탐침` : `${cell(p.queued_id)} · 뒤탐침 ${p.piece_idx + 1}`;
  }
  if (p.profile === 'Q16') return `${cell(p.queued_id)} · j${cell(p.piece_idx)} · R${cell(p.round)}`;
  return `${cell(p.queued_id)} · idx${cell(p.piece_idx)}`;
}

/**
 * 발사 다리 — N NXT 「N NXT」 · A KRX 매수 회차(본회차 09:00:27 · 재확인 09:00:29 등 — 실제 fire_base) 「A 09:00:27 KRX→」 ·
 * A NXT 매도 다리 「A NXT」 · Q16 「Q16」.
 */
export function fireLegLabelOf(p: FireKey): string {
  if (p.profile === 'Q16') return 'Q16';
  if (p.profile === 'A' && p.fire_exchange === 'KRX') return `A ${p.fire_base} KRX→`;
  return `${p.profile} ${p.fire_exchange}`;
}

export const BROKER_LABEL = { KB: 'KB', KYOBO: '교보' } as const;
const MARKET_LABEL: Readonly<Record<string, string>> = { K: '코스피', Q: '코스닥' };

/** (서버 키, 시장) → 「KB 코스닥」 · 「교보 코스피」. 모르는 값은 원문 그대로. */
export function brokerMarketLabelOf(gateway: string, market: string): string {
  const broker = brokerOfServerKey(gateway);
  return `${broker === null ? gateway : BROKER_LABEL[broker]} ${MARKET_LABEL[market] ?? market}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 탭 조각 — 발사 세그먼트(16:00 예약 · 09:00:30 개장차익)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 행이 그 세그먼트에 속하는가 — q16 = Q16 · KRX 16:00:00 / n0930 = N · A 의 KRX 매수 회차(본회차 09:00:27 · 재확인
 * 09:00:29 등 — 실제 fire_base) · NXT 09:00:30 전부. 기준시각 판정은 shared `isLaunchFireBaseOf`.
 */
export function isOrderTabRow(row: FireKey, fire: LaunchFire): boolean {
  if (!isLaunchFireBaseOf(row.profile, row.fire_exchange, row.fire_base)) return false;
  return fire === 'q16' ? row.profile === 'Q16' : row.profile === 'N' || row.profile === 'A';
}

function orderIndexOf(gateway: string, market: string): number {
  const i = LAUNCH_ORDER.findIndex(([g, m]) => g === gateway && m === market);
  return i === -1 ? LAUNCH_ORDER.length : i;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 세그먼트 조각 — 정렬 = LAUNCH_ORDER 묶음 → fire_base → fire_exchange → profile → wire. 입력은 바꾸지 않는다. */
export function orderTabPiecesOf<P extends LaunchPieceRow>(pieces: readonly P[], fire: LaunchFire): P[] {
  return pieces
    .filter((p) => isOrderTabRow(p, fire))
    .sort(
      (a, b) =>
        orderIndexOf(a.gateway, a.market) - orderIndexOf(b.gateway, b.market) ||
        cmp(a.gateway, b.gateway) ||
        cmp(a.market, b.market) ||
        cmp(a.fire_base, b.fire_base) ||
        cmp(a.fire_exchange, b.fire_exchange) ||
        cmp(a.profile, b.profile) ||
        a.wire - b.wire,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 머리 카드 모델
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchResultCounts {
  ok: number;
  bad: number;
  other: number;
}

interface LaunchHeadCardBase {
  gateway: string;
  market: string;
  /** 「KB 코스닥」 */
  title: string;
  /**
   * 실조각 수 — 뒤탐침 제외(35 IN-02). 머리 `n_pieces` · 백필 `launchHeadOf` 와 같은 정의라 카드 「N조각」 이 머리와 어긋나지
   * 않는다. 표 행 수 = `count + probes`.
   */
  count: number;
  /** 실조각 결과 수(뒤탐침 제외 — 뒤탐침 「기타」 가 회색 「기타」 로 섞이지 않게). */
  counts: LaunchResultCounts;
  /** 뒤탐침 수 — 카드에 「· 탐침 n」 으로 따로(경계 지도 날짜별 표 `launch-day-probes` 와 같은 꼴). 없으면 0. */
  probes: number;
  /** 거부 수 라벨 — q16 「101」 · n0930 「거부」(101 · 515) */
  badLabel: '101' | '거부';
  /** 오프셋(발사 기준) — 「−332µs」 · 없으면 「—」 */
  offset: string;
}

export interface LaunchHeadCardQ16 extends LaunchHeadCardBase {
  fire: 'q16';
  /** 「lo ~ hi」 · 「전부 접수 (첫 접수 hiµs)」 · 「전부 101 (마지막 loµs)」 · 「판단 불가」 */
  gate: string;
  /**
   * 학습 줄 라벨 (D-32). gh-trade Phase 43 뒤 kind 18 은 Q16 학습값(correction · step 등 8칸)을 싣지 않고
   * next_offset_us = 콜드3 시점 최신 발사 계획의 첫 조각이다 — 학습값이 하나라도 있는 머리(학습 시절 · 백필)만
   * 옛 라벨 「학습 → 다음 오프셋」, 그 밖(학습값 없음 · 머리 없음)은 「다음 발사 계획 첫 조각」.
   */
  learnLabel: string;
  /** 학습 머리 「before → after · 다음 nextµs (step s)」 · 그 밖 「nextµs」 · next 도 없으면 「—」 */
  learn: string;
}

export interface LaunchHeadCardN0930 extends LaunchHeadCardBase {
  fire: 'n0930';
  /** 탭 조각 retry 합 */
  retries: number;
  /** 「고정 −245µs」 · N 머리 없음 「—」 */
  next: string;
}

export type LaunchHeadCardModel = LaunchHeadCardQ16 | LaunchHeadCardN0930;

export interface LaunchHeadCardInput {
  gateway: string;
  market: string;
  fire: LaunchFire;
  pieces: readonly LaunchPieceRow[];
  heads: readonly LaunchHeadRow[];
}

const usOrDash = (v: number | null | undefined): string => (v === null || v === undefined ? DASH : `${fmtUs(v)}µs`);

function countsOf(pieces: readonly Pick<LaunchPieceRow, 'result'>[]): LaunchResultCounts {
  const c: LaunchResultCounts = { ok: 0, bad: 0, other: 0 };
  for (const p of pieces) c[resultToneOf(p.result)]++;
  return c;
}

function minWireRel(pieces: readonly Pick<LaunchPieceRow, 'wire' | 'sent_rel_us'>[]): number | null {
  if (pieces.length === 0) return null;
  return pieces.reduce((a, b) => (b.wire < a.wire ? b : a)).sent_rel_us;
}

function gateText(lo: number | null, hi: number | null): string {
  if (lo !== null && hi !== null) return `${fmtUs(lo)} ~ ${fmtUs(hi)}`;
  if (hi !== null) return `전부 접수 (첫 접수 ${fmtUs(hi)}µs)`;
  if (lo !== null) return `전부 101 (마지막 ${fmtUs(lo)}µs)`;
  return '판단 불가';
}

const LEARN_LABEL = '학습 → 다음 오프셋';
const PLAN_FIRST_LABEL = '다음 발사 계획 첫 조각';

/** 16:00 머리 → 학습 줄 (D-32 세 갈래). 판정 = correction_before · correction_after · step_us 중 하나라도 non-null. */
function learnLineOf(h: LaunchHeadRow | undefined): { learnLabel: string; learn: string } {
  if (h === undefined) return { learnLabel: PLAN_FIRST_LABEL, learn: DASH };
  const { correction_before_us: before, correction_after_us: after, next_offset_us: next, step_us: step } = h;
  if (before === null && after === null && step === null) return { learnLabel: PLAN_FIRST_LABEL, learn: usOrDash(next) };
  return { learnLabel: LEARN_LABEL, learn: `${fmtUs(before)} → ${fmtUs(after)} · 다음 ${usOrDash(next)} (step ${cell(step)})` };
}

/**
 * (서버, 시장, 세그먼트) → 카드 모델. 그 조합의 탭 조각 0 · 머리 0 이면 null(빈 카드).
 *
 * q16: 오프셋 = Q16 머리 offset_used_us → 없으면 최소 wire 조각 rel · 경계 = 머리 gate_lo/hi(하나라도 있으면) → 없으면
 * shared `launchDaysOf` 의 그날 1개 · 학습 줄 = 학습값 있는 머리는 correction_before → after · next_offset_us · step_us,
 * 학습값 없는 머리(Phase 43 뒤)는 「다음 발사 계획 첫 조각」 next_offset_us (D-32).
 * n0930: 탭 조각 = N NXT + A 두 다리(KRX 매수 회차 — 본회차 09:00:27 · 재확인 09:00:29 등 실제 fire_base · NXT 09:00:30) ·
 * 결과 라벨 「거부」 · 오프셋 = N 머리 offset_used_us →
 * 없으면 N NXT 최소 wire rel · 재전송 = 탭 조각 retry 합 · 다음 오프셋 = N 머리 「고정 next_offset_usµs」(없으면 「—」).
 */
export function launchHeadCardOf(input: LaunchHeadCardInput): LaunchHeadCardModel | null {
  const { gateway, market, fire } = input;
  const mine = <T extends { gateway: string; market: string }>(r: T) => r.gateway === gateway && r.market === market;
  const pieces = orderTabPiecesOf(input.pieces.filter(mine), fire);
  const heads = input.heads.filter((h) => mine(h) && isOrderTabRow(h, fire));
  if (pieces.length === 0 && heads.length === 0) return null;

  const real = pieces.filter((p) => !isLaunchTailProbe(p));
  const base = {
    gateway,
    market,
    title: brokerMarketLabelOf(gateway, market),
    count: real.length,
    counts: countsOf(real),
    probes: pieces.length - real.length,
  };

  if (fire === 'n0930') {
    // 오프셋 · 다음 오프셋은 N 머리(고정 오프셋 프로파일) — A 다리 머리는 보지 않는다.
    const head = heads.find((h) => h.profile === 'N');
    const nPieces = pieces.filter((p) => p.profile === 'N' && p.fire_exchange === 'NXT');
    return {
      ...base,
      fire,
      badLabel: '거부',
      offset: usOrDash(head?.offset_used_us ?? minWireRel(nPieces)),
      retries: pieces.reduce((n, p) => n + (p.retry ?? 0), 0),
      next: head?.next_offset_us == null ? DASH : `고정 ${fmtUs(head.next_offset_us)}µs`,
    };
  }

  const head = heads.find((h) => h.profile === 'Q16');
  let gate: string;
  if (head !== undefined && (head.gate_lo_us !== null || head.gate_hi_us !== null)) {
    gate = gateText(head.gate_lo_us, head.gate_hi_us);
  } else {
    const day = launchDaysOf(pieces)[0];
    gate = day === undefined ? '판단 불가' : gateText(day.lo, day.hi);
  }
  return {
    ...base,
    fire,
    badLabel: '101',
    offset: usOrDash(head?.offset_used_us ?? minWireRel(pieces)),
    gate,
    ...learnLineOf(head),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 쿼리 파라미터
// ─────────────────────────────────────────────────────────────────────────────

export type LaunchTab = 'orders' | 'map';

/** `?tab=` 원문 → 'orders' | 'map' (그 밖 null). */
export function launchTabOf(raw: string | null | undefined): LaunchTab | null {
  return raw === 'orders' || raw === 'map' ? raw : null;
}

/** `?fire=` 원문 → 'q16' | 'n0930' (그 밖 null). */
export function launchFireParamOf(raw: string | null | undefined): LaunchFire | null {
  return raw === 'q16' || raw === 'n0930' ? raw : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 대기열 열 — 목업 027 변형 A (quick-261103-pei · D-1 · D-2)
// ─────────────────────────────────────────────────────────────────────────────

/** 금액(원) — 1억 이상 「x.xx억」 · 미만 「n만」(만 단위 반올림 · 천 단위 쉼표). null 「—」. */
export function fmtEokMan(won: number | null | undefined): string {
  if (won === null || won === undefined || !Number.isFinite(won)) return DASH;
  if (won >= 1e8) return `${(won / 1e8).toFixed(2)}억`;
  return `${NUM.format(Math.round(won / 1e4))}만`;
}

/**
 * 대기열 칸 — 첫 줄 = `lead`(굵게 · leadTone bad 면 빨강) + `rest` · 둘째 줄 = `sub`(작게 · est 주황 · dim 회색 · 없으면 null).
 * null = 「—」(값 없음 — 키 없는 옛 RPC · 미계산 · 격자 없음 · 거부 조각 · matched false).
 */
export interface LaunchQueueCell {
  lead: string;
  leadTone: 'bad' | null;
  rest: string;
  sub: string | null;
  subTone: 'est' | 'dim';
}

const qn = (v: number | null | undefined): string => (v === null || v === undefined ? DASH : NUM.format(v));

/**
 * 조각 → 대기열 칸(목업 027 A). kind 로 갈린다(fire 무관):
 * - queue: `9번째` + ` · 앞 68,808주 · 1.77억` / 주황 `마감 앞 4건 · 30,560주 · 7,869만 (추정)` · 취소 `마감 — 취소됨` · 체결로 0 이면 둘째 줄 없음
 * - run 체결: `2번째 체결` + ` · 앞 2주 · 32만`(앞 금액 0 이면 금액 생략) / `체결 18/20 @ 159,300~160,100`(같은 가격이면 하나)
 * - run 미체결: 빨강 `미체결` + ` · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감` / `적어도 2번째 이후` ·
 *   한도 안 런 0건이면 ` · 1초 안 한도 안 체결 없음`(둘째 줄 없음)
 * 금액은 저장된 ahead_amt · end_amt 를 그대로 쓴다(더 좋은 가격 단 금액 포함 — 주 × 가격으로 다시 곱하지 않는다).
 * order_est(게이트웨이 순서 추정)면 첫 줄 끝에 「 (추정)」.
 *
 * 당일 값(quick 261104-n7i D-5): 조각 queue 에 `live_as_of`(당일 tickgw 바이트로 계산한 기준 시각)가 있으면 세션이 끝나기 전 값이다 —
 * 둘째 줄에 계산 기준 시각 「HH:MM 기준」(KST)을 보인다. queue open 의 「마감 앞 …」 → 「16:03 기준 앞 …」 · 취소 「16:03 기준 — 취소됨」 ·
 * 체결로 0 이면 둘째 줄 「16:03 기준」 · run 은 둘째 줄 끝에 「 · 09:03 기준」(둘째 줄이 없던 경우는 「09:03 기준」). 첫 줄 · tone 은 그대로.
 * 밤 nightly 가 그날 격자 정본으로 덮으면 `live_as_of` 가 사라져 지금 문구로 돌아간다. 날짜로 안 읽히는 값은 비 live 와 같게.
 */
export function launchQueueCellOf(p: Pick<LaunchPieceRow, 'qty' | 'queue'>): LaunchQueueCell | null {
  const q = p.queue;
  if (q === undefined || q === null || !q.matched) return null;
  const est = q.order_est ? ' (추정)' : '';
  const asOfMs = typeof q.live_as_of === 'string' ? Date.parse(q.live_as_of) : NaN;
  const hm = Number.isFinite(asOfMs) ? kstHm(asOfMs) : null;
  if (q.kind === 'queue') {
    if (q.rank === null) return null;
    const rest = ` · 앞 ${qn(q.ahead_qty)}주 · ${fmtEokMan(q.ahead_amt)}${est}`;
    if (q.end_state === 'open') {
      return {
        lead: `${q.rank}번째`,
        leadTone: null,
        rest,
        sub: `${hm === null ? '마감' : `${hm} 기준`} 앞 ${qn(q.end_n)}건 · ${qn(q.end_qty)}주 · ${fmtEokMan(q.end_amt)} (추정)`,
        subTone: 'est',
      };
    }
    if (q.end_state === 'cancelled') {
      return { lead: `${q.rank}번째`, leadTone: null, rest, sub: `${hm === null ? '마감' : `${hm} 기준`} — 취소됨`, subTone: 'dim' };
    }
    return { lead: `${q.rank}번째`, leadTone: null, rest, sub: hm === null ? null : `${hm} 기준`, subTone: 'dim' };
  }
  const at = hm === null ? '' : ` · ${hm} 기준`;
  if (q.rank !== null) {
    const amt = q.ahead_amt ? ` · ${fmtEokMan(q.ahead_amt)}` : '';
    const px =
      q.fill_px_min === null || q.fill_px_max === null
        ? DASH
        : q.fill_px_min === q.fill_px_max
          ? qn(q.fill_px_min)
          : `${qn(q.fill_px_min)}~${qn(q.fill_px_max)}`;
    return {
      lead: `${q.rank}번째 체결`,
      leadTone: null,
      rest: ` · 앞 ${qn(q.ahead_qty)}주${amt}${est}`,
      sub: `체결 ${qn(q.fill_qty)}/${qn(p.qty)} @ ${px}${at}`,
      subTone: 'dim',
    };
  }
  const n = q.ahead_n ?? 0;
  if (n === 0) {
    return { lead: '미체결', leadTone: 'bad', rest: ' · 1초 안 한도 안 체결 없음', sub: hm === null ? null : `${hm} 기준`, subTone: 'dim' };
  }
  return {
    lead: '미체결',
    leadTone: 'bad',
    rest: ` · 앞선 ${n}건이 한도 안 ${qn(q.ahead_qty)}주 · ${fmtEokMan(q.ahead_amt)} 가져감`,
    sub: `적어도 ${n + 1}번째 이후${at}`,
    subTone: 'dim',
  };
}
