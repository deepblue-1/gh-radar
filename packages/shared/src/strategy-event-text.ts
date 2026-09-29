/**
 * Phase 25 — 전략 이벤트 문장 조립기 (D-09 — 조립은 **여기 한 곳**이다).
 *
 * 주문로그 탭(F-A 한 줄) · 카드 탭 · 오늘 주문 펼침 타임라인이 모두 `strategyEventParts` 를 부른다.
 * 표시명은 `strategy-event-labels.ts` 표에서만 고르고(D-10), 서버 코드는 문장을 만들지 않는다.
 *
 * 갈래: 시세 1 상한가노출 · 2 상한가진입 · 3 매수 주문 (25-01 · 25-04 Task 1). 4~8(대기 · 첫 체결 · 매도 주문 ·
 * 취소 · 거부)은 25-04 Task 2 가 채운다 — 그 전까지는 모르는 값 규칙으로 떨어진다.
 * 모르는 kind 는 D-10 규칙(구분 = 그룹 표시명 또는 원문 kind · 행위 = 원문 kind · 본문 "") — 지어내지 않는다.
 *
 * 시각은 KST 로 고정한다 — 브라우저 로캘 · 시간대가 달라도 같은 문자열(트레이더 대조 · 골든 테스트).
 */
import { isMarketStrategyEvent, type StrategyEventRow } from "./strategy-event";
import { condMetricLabel, orderGroupLabel, orderGroupSide, reasonOperator, strategyKindLabel } from "./strategy-event-labels";

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hourCycle: "h23",
});

const NUM = new Intl.NumberFormat("ko-KR");

/** U+2212 MINUS SIGN — 하이픈보다 숫자 폭에 맞는다. */
const MINUS = "−";

/** epoch ms → KST `HH:MM:SS.mmm`. 유한하지 않으면 「—」. */
export function formatKstMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  // 로캘 구분자(ko-KR 은 「시 · 분」 을 붙일 수 있다)에 기대지 않고 조각을 직접 잇는다.
  let hh = "00";
  let mm = "00";
  let ss = "00";
  let ms3 = "000";
  for (const p of KST_TIME.formatToParts(ms)) {
    if (p.type === "hour") hh = p.value.padStart(2, "0");
    else if (p.type === "minute") mm = p.value.padStart(2, "0");
    else if (p.type === "second") ss = p.value.padStart(2, "0");
    else if (p.type === "fractionalSecond") ms3 = p.value;
  }
  return `${hh}:${mm}:${ss}.${ms3}`;
}

/** 부호 있는 수 — 양수 `+`, 음수 U+2212 `−`, 0 은 `0`. 천 단위 구분. */
export function formatSigned(n: number): string {
  if (n > 0) return `+${NUM.format(n)}`;
  if (n < 0) return `${MINUS}${NUM.format(-n)}`;
  return "0";
}

/** 로그 줄 한 건의 조각 — 표면(F-A · 카드 · 타임라인)은 이 조각을 자기 문법으로 배치한다. */
export type StrategyEventParts = {
  /** 구분 칸 — 주문 이벤트는 그룹 표시명, 시세 이벤트는 종류 표시명. */
  badge: string;
  /** 구분 칸 색 축 — buy `--up` · sell `--down` · market `--accent-fg` · unknown `--muted-fg`. */
  tone: "buy" | "sell" | "market" | "unknown";
  /** 행위 단어(600). 시세 이벤트는 null · 모르는 kind 는 원문 숫자(D-10). */
  action: string | null;
  /** 본문 조각을 「 · 」 로 이은 문장. */
  body: string;
  /** `누적 N` 꼬리. */
  cum: string;
};

/**
 * 이벤트 1건 → 조각. `surface` 는 표면별 본문 차이(타임라인은 거래소 · 종목이 없다 등)를 가르는 자리다 —
 * kind 3 갈래는 두 표면이 같은 본문을 쓴다(D-09).
 */
export function strategyEventParts(ev: StrategyEventRow, surface: "log" | "timeline"): StrategyEventParts {
  void surface; // 시세 · 매수 주문 갈래는 표면 무관 — Task 2 가 행위 단어 차이에서 쓴다.
  const cum = `누적 ${NUM.format(ev.cumVolume)}`;
  switch (ev.kind) {
    case 1:
      return { badge: strategyKindLabel(1), tone: "market", action: null, body: limitExposedBody(ev), cum };
    case 2:
      return {
        badge: ev.entryRound > 0 ? `${strategyKindLabel(2)} ${ev.entryRound}차` : strategyKindLabel(2),
        tone: "market",
        action: null,
        body: limitEnteredBody(ev),
        cum,
      };
    case 3:
      return { ...orderBadge(ev.group), action: strategyKindLabel(3), body: buyOrderBody(ev), cum };
    default: {
      // D-10 모르는 kind — 그룹을 알아도 행위 · 본문 · 방향색을 지어내지 않는다.
      return { badge: orderGroupLabel(ev.group) ?? String(ev.kind), tone: "unknown", action: String(ev.kind), body: "", cum };
    }
  }
}

/** 조각을 「 · 」 로 잇는다 — 빈 조각(null · "")은 거른다. 모든 본문 · 두 표면이 이 한 헬퍼를 쓴다(D-09). */
function joinDot(pieces: ReadonlyArray<string | null | undefined>): string {
  return pieces.filter((p): p is string => typeof p === "string" && p !== "").join(" · ");
}

/** 주문 이벤트 구분 칸 — 그룹 표시명 · 방향색. 모르는 그룹(0 포함)은 원문 숫자 · unknown(방향을 지어내지 않는다). */
function orderBadge(group: number): Pick<StrategyEventParts, "badge" | "tone"> {
  return { badge: orderGroupLabel(group) ?? String(group), tone: orderGroupSide(group) ?? "unknown" };
}

/** 상한가노출 본문: (시초 상한가 · ) 매도잔량 N. */
function limitExposedBody(ev: StrategyEventRow): string {
  return joinDot([ev.openAtLimit ? "시초 상한가" : null, `매도잔량 ${NUM.format(ev.askQtyAtLimit)}`]);
}

/** 상한가진입 스냅 이름 — 벡터 순서 = 즉시 · 1초 · 3초 (`.fbs` 주석). */
const ENTERED_SNAP_NAMES = ["즉시", "1초", "3초"] as const;

/**
 * 상한가진입 본문: `잔량/누적 즉시 q/c · 1초 q/c · 3초 q/c`. 3초 스냅 전에 이탈하면 벡터가 짧다 —
 * 있는 것만 그리고 꼬리 「3초 전 이탈」(스냅 0개면 본문이 꼬리뿐).
 */
function limitEnteredBody(ev: StrategyEventRow): string {
  const n = Math.min(ev.snapQty.length, ev.snapCum.length, ENTERED_SNAP_NAMES.length);
  const snaps: string[] = [];
  for (let i = 0; i < n; i++) {
    snaps.push(`${ENTERED_SNAP_NAMES[i]} ${NUM.format(ev.snapQty[i]!)}/${NUM.format(ev.snapCum[i]!)}`);
  }
  const tail = n < ENTERED_SNAP_NAMES.length ? "3초 전 이탈" : null;
  if (snaps.length === 0) return tail ?? "";
  return joinDot([`잔량/누적 ${snaps[0]}`, ...snaps.slice(1), tail]);
}

/** BuyOrder 본문: 조건 · 근거 · 상한가 매수잔량 · 가격×수량 · 접수 지연. */
function buyOrderBody(ev: StrategyEventRow): string {
  const pieces: string[] = [];
  if (ev.condMetric !== 0) {
    const op = reasonOperator(ev.reasonCode);
    const metric = condMetricLabel(ev.condMetric, ev.group);
    // 연산자를 모르면 지표와 값 사이를 공백으로 둔다 — 방향을 지어내지 않는다(D-10).
    pieces.push(`조건 ${metric}${op ?? " "}${NUM.format(ev.condThreshold)} / 실측 ${NUM.format(ev.condActual)}`);
  }
  const evidence = evidenceText(ev);
  if (evidence !== null) pieces.push(evidence);
  pieces.push(`상한가 매수잔량 ${NUM.format(ev.limitBidQty)}`);
  pieces.push(`${NUM.format(ev.price)}×${NUM.format(ev.qty)}주`);
  // 0 = 미측정 — 「+0ms」 로 그리면 측정값처럼 읽힌다.
  if (ev.acceptLatencyUs > 0) pieces.push(`접수 +${Math.round(ev.acceptLatencyUs / 1000)}ms`);
  return joinDot(pieces);
}

/** 근거 틱 조각. 호가 근거는 지표로 매도/매수 1호가를 가른다. 모르면 null(조각 생략). */
function evidenceText(ev: StrategyEventRow): string | null {
  if (ev.evKind === 1) {
    const before = NUM.format(ev.evQtyBefore);
    const after = NUM.format(ev.evQtyAfter);
    if (ev.condMetric === 1) return `근거 호가(매도1잔량 ${before}→${after})`;
    if (ev.condMetric === 2) return `근거 호가(매수1잔량 ${before}→${after})`;
    return `근거 호가(${before}→${after})`;
  }
  if (ev.evKind === 2) return `근거 체결(${NUM.format(ev.evPrice)} 체결 ${NUM.format(ev.evTradeQty)}주)`;
  return null;
}

/**
 * F-A 한 줄 평문 — `[시각][주문번호][구분] 거래소 | 종목 | 행위 · 본문 | 누적 N`.
 * 시세 이벤트는 주문번호 칸이 없고 행위 단어도 없다. 주문번호가 빈 주문 이벤트(거부)는 `[—]`.
 * 줄의 `title`(잘림 보완) · 복사 대조 · 골든 테스트가 이 문자열을 쓴다(UI-SPEC R11).
 */
export function orderLogLineText(ev: StrategyEventRow, stockName: string): string {
  const parts = strategyEventParts(ev, "log");
  const head =
    `[${formatKstMs(ev.gwTimeMs)}]` +
    (isMarketStrategyEvent(ev.kind) ? "" : `[${ev.orderNo === "" ? "—" : ev.orderNo}]`) +
    `[${parts.badge}]`;
  const sentence = joinDot([parts.action, parts.body]);
  const middle = [ev.exchange, stockName, sentence].filter((s) => s !== "").join(" | ");
  return `${head} ${middle} | ${parts.cum}`;
}
