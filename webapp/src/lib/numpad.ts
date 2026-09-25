/**
 * Phase 20 — 자체 키패드 규칙 한 벌 (순수 · React 없음).
 *
 * 시트(20-03) · 인라인 ↑↓(20-05) · 수동주문 상자(20-06)가 이 모듈 하나를 같이 쓴다.
 *   - D-14c 첫 입력 대기: 열린 직후(fresh) = 「전체 선택」. 첫 숫자 키가 값을 통째로 바꾸고
 *     첫 키가 ⌫/「00」이면 빈 값이 된다.
 *   - D-16 버퍼 규칙: 빈 값·「0」 뒤 「00」 무시 · 「0」 다음 숫자는 0 을 대체 · 9자리 초과 무시.
 *   - D-17 단축 칩: 단위로 고른다. 누르면 현재 값 기준으로 적용되고 fresh 가 풀린다.
 *   - D-15 검증: 호가 단위·상한가 위반은 이유와 가까운 두 값만 말한다 — **값을 보정하지 않는다.**
 * 근거 목업: `.planning/sketches/002-toss-order-ticket/index.html:370-417, 497-504`.
 *
 * 호가 단위 표는 여기 없다 — `@gh-radar/shared` 의 `tickUp`/`tickDown`/`priceInputIssue` 를 부른다.
 * 클라 검증은 입력 보조다. 최종 판정은 relay 스키마·게이트웨이(D-27).
 */
import { priceInputIssue, tickDown, tickUp, type PriceIssue } from '@gh-radar/shared';

export type PadUnit = '원' | '주' | '만원' | '%' | '건' | '회';

/** 키패드 버퍼. `buf` 는 숫자만 담은 문자열('' = 빈 값) · `fresh` = 첫 입력 대기. */
export interface PadState {
  buf: string;
  fresh: boolean;
}

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'back';

export type PadChipOp =
  | { kind: 'tickDown' }
  | { kind: 'tickUp' }
  | { kind: 'current' }
  | { kind: 'upper' }
  | { kind: 'add'; n: number }
  | { kind: 'set'; n: number }
  | { kind: 'clear' };

export interface PadChip {
  label: string;
  /** 화면 글자와 다른 접근성 이름(UI-SPEC 접근성 이름 절). */
  ariaLabel?: string;
  op: PadChipOp;
}

/**
 * 칩·검증 맥락. `current`·`upper` 가 0 이면 시세 미수신 — 해당 칩 비활성 · 상한 검사 생략.
 * `maxPieces` 는 **단위 '회'(수동주문 조각 수)에서만** 넘긴다 — `set` 칩 한도로 쓰인다.
 * `min`·`max` 는 **필드 범위**(포함)다 — 상따 설정 중 relay `lc.set` 스키마가 범위를 두는 필드
 * (매도비율 1~100 · 잔량추적 1~90 · 호가변경 0~255)가 넘긴다(`lc/lc-fields.ts` 가 원천). 범위 밖이면
 * 확인을 잠그고(`padIssue`) 범위 밖 값을 만드는 `set` 칩은 비활성이다(`padChipDisabled`).
 * ★ relay 는 스키마 위반 프레임을 받으면 **WebSocket 연결을 통째로 끊는다**(`fanout.ts` `#reject`) —
 *   그래서 이 범위는 입력 보조가 아니라 「보내면 안 되는 값」의 경계다(20-REVIEW CR-01).
 */
export interface PadCtx {
  current: number;
  upper: number;
  maxPieces?: number;
  min?: number;
  max?: number;
}

/** 입력 한도 9자리(999,999,999). 서버 `UIntSchema` 가 최종(T-20-06). */
export const PAD_MAX_DIGITS = 9;
const PAD_MAX_VALUE = 10 ** PAD_MAX_DIGITS - 1;

const CLEAR: PadChip = { label: '지우기', ariaLabel: '전부 지우기', op: { kind: 'clear' } };
const add = (n: number): PadChip => ({ label: `+${fmt(n)}`, op: { kind: 'add', n } });
const set = (n: number): PadChip => ({ label: String(n), op: { kind: 'set', n } });

/** 단위별 단축 칩(D-17) — 라벨·순서가 UI-SPEC 표 그대로다. */
export const PAD_CHIPS: Record<PadUnit, readonly PadChip[]> = {
  원: [
    { label: '−1호가', ariaLabel: '1호가 내리기', op: { kind: 'tickDown' } },
    { label: '+1호가', ariaLabel: '1호가 올리기', op: { kind: 'tickUp' } },
    { label: '현재가', op: { kind: 'current' } },
    { label: '상한가', op: { kind: 'upper' } },
  ],
  주: [add(100), add(1_000), add(10_000), CLEAR],
  '%': [set(10), set(30), set(50), set(100)],
  만원: [add(10), add(50), add(100), CLEAR],
  건: [set(1), set(3), set(5), CLEAR],
  회: [set(1), set(3), set(5), set(10)],
};

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 시트가 열릴 때의 버퍼 — 언제나 fresh. */
export function padInit(value: number | null): PadState {
  return { buf: value === null ? '' : String(value), fresh: true };
}

/** 키 하나를 버퍼에 반영한다(D-14c · D-16). */
export function padKey(s: PadState, key: PadKey): PadState {
  if (s.fresh) {
    return { buf: key === 'back' || key === '00' ? '' : key, fresh: false };
  }
  if (key === 'back') return { buf: s.buf.slice(0, -1), fresh: false };
  // 빈 값·「0」 뒤 「00」 은 앞자리 0 만 만든다 — 무시
  if (key === '00' && (s.buf === '' || s.buf === '0')) return { buf: s.buf, fresh: false };
  // 「0」 다음 숫자는 0 을 대체한다(선행 0 금지)
  const next = s.buf === '0' ? key : s.buf + key;
  if (next.length > PAD_MAX_DIGITS) return { buf: s.buf, fresh: false };
  return { buf: next, fresh: false };
}

/** 칩 비활성 — 시세 미수신(현재가·상한가 0) · 조각 한도 초과(회) · 필드 범위 밖 `set`(CR-01). */
export function padChipDisabled(chip: PadChip, ctx: PadCtx): boolean {
  switch (chip.op.kind) {
    case 'current':
      return !(ctx.current > 0);
    case 'upper':
      return !(ctx.upper > 0);
    case 'set':
      return (
        (ctx.maxPieces !== undefined && chip.op.n > ctx.maxPieces) ||
        (ctx.max !== undefined && chip.op.n > ctx.max) ||
        (ctx.min !== undefined && chip.op.n < ctx.min)
      );
    default:
      return false;
  }
}

/**
 * 칩 적용 — 현재 값 기준 · fresh 해제. 비활성 칩과 9자리를 넘기는 결과는 버퍼를 바꾸지 않는다.
 * 상한 초과로 가는 결과도 **보정하지 않는다** — `padIssue` 가 확인을 잠근다(D-15).
 */
export function applyPadChip(s: PadState, chip: PadChip, ctx: PadCtx): PadState {
  if (padChipDisabled(chip, ctx)) return s;
  const v = padValue(s) ?? 0;
  let next: number | null;
  switch (chip.op.kind) {
    case 'tickDown':
      next = tickDown(v);
      break;
    case 'tickUp':
      next = tickUp(v);
      break;
    case 'current':
      next = ctx.current;
      break;
    case 'upper':
      next = ctx.upper;
      break;
    case 'add':
      next = v + chip.op.n;
      break;
    case 'set':
      next = chip.op.n;
      break;
    case 'clear':
      next = null;
      break;
  }
  if (next === null) return { buf: '', fresh: false };
  if (next > PAD_MAX_VALUE) return { buf: s.buf, fresh: false };
  return { buf: String(next), fresh: false };
}

/** 버퍼 값. 빈 값 → null. */
export function padValue(s: PadState): number | null {
  return s.buf === '' ? null : Number(s.buf);
}

/** 디스플레이 글자 — ko-KR 천 단위 쉼표. 빈 값 → ''. */
export function formatPadDisplay(s: PadState): string {
  const v = padValue(s);
  return v === null ? '' : fmt(v);
}

/** 가격 검증 이유 → UI-SPEC 카피 원문. */
export function priceIssueText(issue: PriceIssue): string {
  if (issue.kind === 'overUpper') return `상한가 ${fmt(issue.upper)}원을 넘을 수 없어요`;
  return `${fmt(issue.tick)}원 단위로 입력해 주세요 · 가까운 값 ${fmt(issue.lower)} / ${fmt(issue.upper)}`;
}

/**
 * 필드 범위 문구 — 범위 안이면 null. 시트·인라인(`padIssue`)과 필드 확정 훅의 마지막 방어선
 * (`lcRangeIssue`)이 **이 한 함수**의 문장을 쓴다(CR-01).
 */
export function rangeIssueText(v: number, unit: PadUnit, min?: number, max?: number): string | null {
  if (min !== undefined && v < min) return `${fmt(min)}${unit} 이상 입력해 주세요`;
  if (max !== undefined && v > max) return `최대 ${fmt(max)}${unit}까지 입력할 수 있어요`;
  return null;
}

/**
 * 단위별 검증 문구. 빈 값·문제 없음 → null. 원 = 호가 단위·상한가 · 회 = 1~maxPieces ·
 * 모든 단위 = 필드 범위(`ctx.min`/`ctx.max`, CR-01).
 */
export function padIssue(s: PadState, unit: PadUnit, ctx: PadCtx): string | null {
  const v = padValue(s);
  if (v === null) return null;
  if (unit === '원') {
    const issue = priceInputIssue(v, ctx.upper);
    if (issue) return priceIssueText(issue);
  }
  if (unit === '회') {
    if (v < 1) return '1회 이상 입력해 주세요';
    if (ctx.maxPieces !== undefined && v > ctx.maxPieces) {
      return `최대 ${fmt(ctx.maxPieces)}회까지 나눌 수 있어요`;
    }
  }
  return rangeIssueText(v, unit, ctx.min, ctx.max);
}

/** 확인 가능 — 빈 값이 아니고 검증 문구가 없을 때. 명시적 「0」 은 허용(단위 규칙이 막지 않으면). */
export function canConfirmPad(s: PadState, unit: PadUnit, ctx: PadCtx): boolean {
  return padValue(s) !== null && padIssue(s, unit, ctx) === null;
}

/** ↑↓ 한 칸 — 원 = ±1호가, 그 밖 ±1. [0, 999,999,999] 로 자른다. */
export function stepValue(v: number, unit: PadUnit, dir: 1 | -1): number {
  const next = unit === '원' ? (dir === 1 ? tickUp(v) : tickDown(v)) : v + dir;
  return Math.min(PAD_MAX_VALUE, Math.max(0, next));
}
