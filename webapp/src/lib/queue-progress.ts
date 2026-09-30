/**
 * Phase 25-06 — 미체결 잔량진행률(B안 보조행) 순수 함수. 화면은 25-09 가 이 위에 그린다.
 *
 * 규율 (정본: 25-CONTEXT · 25-UI-SPEC):
 *   D-11  진행률 항목이 **없으면 보조행도 없다** — 지어내지 않는다(`findQueueProgress` 가 `null`).
 *   D-12  웹은 진행률을 **계산하지 않는다** — 서버 값(`remaining_volume` · `progress_bp`)을 클램프만 한다.
 *         `remaining_volume ≤ 0 ∨ progress_bp ≥ 10000` → 「{그룹} · 0주」 · 100% · near.
 *         그 밖: 남은 수량 `max(0, remaining_volume)` · % `min(100, max(0, floor(progress_bp / 100)))` ·
 *         % ≥ 90 → near(`--up` 색 · 「곧 내 차례」). 문구는 WinForms 와 같은 「{그룹} · N주」(quick-260930-fi4).
 *   D-13  오래된 값 표식 없이 마지막 값을 유지한다 — 스토어(`use-relay-socket` `queueProgress`) 규율이다.
 *   Pitfall 15  조인은 (계좌번호, 주문번호) **문자열 동등**이다. 앞 0 · 하이픈을 다듬지 않는다 — gh-trade 가
 *         83 과 66/67 에 같은 원천 문자열을 싣는다(Q5). 어긋나면 조용히 보조행이 안 뜨므로 개발 모드에서
 *         `reportUnmatchedProgressOnce` 가 한 번 드러낸다.
 *   A-P1  gh-trade 2026-09-30 계약으로 수동 · VI 대기 매수는 `group = 7` · `8` 로 온다 — 표시명 표의
 *         「수동」 · 「VI」 로 그린다(quick-260930-e73). `group = 0` → 「매수」 는 서버 배포 전 · 옛 서버(수동 · VI 가
 *         0 으로 오던 시기) 호환으로 유지한다 — 표시명 표에서 0 은 「표시명 없음」이고, 원문 「0」 을 보이면 D-10
 *         모르는 값처럼 읽힌다. 다른 문구가 필요하면 `progressGroupLabel` 한 곳만 바꾼다.
 *   A-P2  `first_filled`(quick-260930-fi4 · gh-trade a09dfc8b) — 첫 체결이 난 주문은 서버가 네 값
 *         (`expected_cum` · `current_cum` · `remaining_volume` · `progress_bp`)을 **첫 체결 순간 값으로 고정**해
 *         전량 체결 · 취소 · 거부까지 보낸다. 웹은 계산하지 않고(% 는 같은 floor · 클램프) 대기(near ·
 *         「곧 내 차례」)로 칠하지 않는다 — 「{그룹} · 체결 시작」 별도 상태다. 마지막 값 유지(D-13)는 같다.
 *         옛 relay(필드 부재)는 `=== true` 판정으로 false 다.
 */
import {
  orderGroupLabel,
  type RelayAccountState,
  type RelayQueueProgressItem,
  type RelayUnfilled,
} from "@gh-radar/shared";

import { relayQuoteKey } from "@/lib/use-relay-socket";

/** 진행률 스토어 모양 — `RelayConnectionState.queueProgress` 와 같다. */
export type QueueProgressMap = ReadonlyMap<string, readonly RelayQueueProgressItem[]>;

/**
 * 미체결 행 1건의 진행률 항목. 없으면 `null`(D-11 — 보조행 없음).
 *
 * 키는 `relayQuoteKey(isin, exchange)`, 그 안에서 (계좌, 주문번호) **문자열 동등**으로 찾는다(Pitfall 15).
 */
export function findQueueProgress(
  map: QueueProgressMap,
  accountNo: string,
  row: Pick<RelayUnfilled, "isin" | "exchange" | "orderNo">,
): RelayQueueProgressItem | null {
  const items = map.get(relayQuoteKey(row.isin, row.exchange));
  if (items === undefined) return null;
  return items.find((it) => it.accountNo === accountNo && it.orderNo === row.orderNo) ?? null;
}

/** 진행률 보조행 보기 값 — 서버 값의 클램프 결과뿐이다(D-12). */
export type ProgressView = {
  /** 종류명 — `progressGroupLabel(group)`. */
  groupLabel: string;
  /** 남은 수량(주) — 음수는 0, full 이면 0. */
  remaining: number;
  /** 진행률 % — 0~100 정수(floor). full 이면 100. */
  pct: number;
  /** % ≥ 90 또는 full — `--up` 색(「곧 내 차례」). 색만이 아니라 숫자 % 가 늘 함께 있다(WCAG 1.4.1). */
  near: boolean;
  /** `remaining_volume ≤ 0 ∨ progress_bp ≥ 10000` — 「· 0주」 · 100%. first_filled 면 늘 false. */
  full: boolean;
  /** 첫 체결이 났다(A-P2) — 「{그룹} · 체결 시작」 · 서버 고정 % · near 아님. */
  firstFilled: boolean;
  /** 막대 `aria-valuetext` — 보이는 문구 + 「, {P}%」: 대기 「{그룹} · {N}주, {P}%」 · first_filled 「{그룹} · 체결 시작, {P}%」. */
  valueText: string;
};

const NUMBER_FORMAT = new Intl.NumberFormat("ko-KR");

/** first_filled 문구(A-P2) — WinForms 와 같은 말. 컴포넌트와 값 텍스트가 함께 쓴다. */
export const PROGRESS_FIRST_FILLED_TEXT = "체결 시작";

/** `progressView` 입력 — `firstFilled` 는 옛 relay 관용으로 선택이다(부재 = false · P-5). */
export type ProgressViewInput = Pick<RelayQueueProgressItem, "remainingVolume" | "progressBp" | "group"> &
  Partial<Pick<RelayQueueProgressItem, "firstFilled">>;

/** 진행률 항목 → 보기 값. 계산하지 않는다 — 클램프만(D-12). */
export function progressView(item: ProgressViewInput): ProgressView {
  const groupLabel = progressGroupLabel(item.group);
  if (item.firstFilled === true) {
    // A-P2 — 서버가 첫 체결 순간 값으로 고정했다. 대기(near · full)가 아닌 별도 상태.
    const pct = item.progressBp >= 10000 ? 100 : Math.min(100, Math.max(0, Math.floor(item.progressBp / 100)));
    return {
      groupLabel,
      remaining: Math.max(0, item.remainingVolume),
      pct,
      near: false,
      full: false,
      firstFilled: true,
      valueText: `${groupLabel} · ${PROGRESS_FIRST_FILLED_TEXT}, ${pct}%`,
    };
  }
  const full = item.remainingVolume <= 0 || item.progressBp >= 10000;
  const remaining = full ? 0 : Math.max(0, item.remainingVolume);
  const pct = full ? 100 : Math.min(100, Math.max(0, Math.floor(item.progressBp / 100)));
  const near = full || pct >= 90;
  return {
    groupLabel,
    remaining,
    pct,
    near,
    full,
    firstFilled: false,
    valueText: `${groupLabel} · ${NUMBER_FORMAT.format(remaining)}주, ${pct}%`,
  };
}

/** 진행률 종류명 — 0 은 「매수」(A-P1 · 옛 서버 호환), 1~8 은 표시명 표(7 수동 · 8 VI), 모르는 값은 원문 숫자(D-10). */
export function progressGroupLabel(group: number): string {
  if (group === 0) return "매수";
  return orderGroupLabel(group) ?? String(group);
}

/** 이미 경고한 조인 키(`계좌|주문번호`) — 모듈 수명 동안 1회만 드러낸다. */
const reportedUnmatched = new Set<string>();

/** 로그 전용 계좌 마스킹 — 뒤 4자리를 가린다(relay `maskAccountNo` 와 같은 규칙 · T-16-18). */
function maskAccount(accountNo: string): string {
  if (accountNo.length <= 4) return "*".repeat(accountNo.length);
  return `${accountNo.slice(0, -4)}****`;
}

/**
 * 진행률 항목 중 **어떤 미체결 행과도** (계좌, 주문번호)가 맞지 않는 것을 개발 모드에서 `console.warn` 1회로
 * 드러낸다(Pitfall 15 — 조인 실패는 「보조행이 안 뜬다」로만 보여 아무도 모른다). 같은 키는 두 번째부터
 * 무음이고, production 에서는 아무것도 하지 않는다. 계좌번호 원문은 로그에 넣지 않는다.
 */
export function reportUnmatchedProgressOnce(
  map: QueueProgressMap,
  accountStates: ReadonlyMap<string, RelayAccountState>,
): void {
  if (process.env.NODE_ENV === "production") return;
  for (const items of map.values()) {
    for (const it of items) {
      const key = `${it.accountNo}|${it.orderNo}`;
      if (reportedUnmatched.has(key)) continue;
      const unf = accountStates.get(it.accountNo)?.unf ?? [];
      if (unf.some((row) => row.orderNo === it.orderNo)) continue;
      reportedUnmatched.add(key);
      console.warn("[queue-progress] 진행률 항목이 미체결 행과 조인되지 않음 (계좌 · 주문번호 문자열 동등)", {
        account: maskAccount(it.accountNo),
        orderNo: it.orderNo,
        isin: it.isin,
        exchange: it.exchange,
      });
    }
  }
}
