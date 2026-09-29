/**
 * Phase 25 — 전략 이벤트 문장 조립기 (D-09 — 조립은 **여기 한 곳**이다).
 *
 * 주문로그 탭(F-A 한 줄) · 카드 탭 · 오늘 주문 펼침 타임라인이 모두 `strategyEventParts` 를 부른다.
 * 표시명은 `strategy-event-labels.ts` 표에서만 고르고(D-10), 서버 코드는 문장을 만들지 않는다.
 *
 * 이 파일이 지금 완성하는 갈래: **kind 3 BuyOrder** (Phase 25-01 트레이서 — 게이트웨이가 오늘 실제로 내는
 * 유일한 종류). 그 밖 kind(시세 1·2 · 대기 · 체결 · 매도 · 취소 · 거부)는 아직 D-10 모르는 값 규칙
 * (badge `String(kind)` · action null · body "")으로 떨어지고 25-04 가 채운다.
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
  /** 행위 단어(600). 시세 이벤트 · 모르는 kind 는 null. */
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
  void surface; // kind 3 갈래는 표면 무관 — 25-04 가 나머지 kind 에서 쓴다.
  const cum = `누적 ${NUM.format(ev.cumVolume)}`;
  if (ev.kind === 3) {
    const side = orderGroupSide(ev.group);
    return {
      badge: orderGroupLabel(ev.group) ?? String(ev.group),
      tone: side ?? "unknown",
      action: strategyKindLabel(ev.kind),
      body: buyOrderBody(ev),
      cum,
    };
  }
  // D-10 모르는 값 규칙 — 25-04 가 kind 1·2·4~8 갈래를 채운다.
  return { badge: String(ev.kind), tone: "unknown", action: null, body: "", cum };
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
  return pieces.join(" · ");
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
  const sentence = [parts.action, parts.body].filter((s): s is string => s !== null && s !== "").join(" · ");
  const middle = [ev.exchange, stockName, sentence].filter((s) => s !== "").join(" | ");
  return `${head} ${middle} | ${parts.cum}`;
}
