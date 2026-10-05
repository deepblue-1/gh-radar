/**
 * Phase 25 — 전략 이벤트 문장 조립기 (D-09 — 조립은 **여기 한 곳**이다).
 *
 * 주문로그 탭(F-A 한 줄) · 카드 탭 · 오늘 주문 펼침 타임라인이 모두 `strategyEventParts` 를 부른다.
 * 표시명은 `strategy-event-labels.ts` 표에서만 고르고(D-10), 서버 코드는 문장을 만들지 않는다.
 *
 * 전 종류 완성 — 25-04: 시세 1 상한가노출 · 2 상한가진입 · 주문 3 매수 주문 · 4 대기(세 갈래) · 5 첫 체결 ·
 * 6 매도 주문 · 7 취소 · 8 거부 · (quick-261003-rc4) 시세 10 버스트 상한가 · (Phase 27) 자동매도 11 발동 · 12 정정 ·
 * 13 상태 · 14 멈춤/재개 + kind 6 자동매도 두 변종 · (Phase 28) 시세 15 상한가 특징(분당 · 키당 1행 — 본문은
 * `limit-feature.ts` `limitFeatureLogParts` 가 슬롯을 85 이름으로 되돌려 만든다 · UI-SPEC ②-2). 모르는 kind 는 D-10 규칙(구분 = 그룹 표시명 또는 원문 kind · 행위 = 원문 kind ·
 * 본문 "") — 지어내지 않는다.
 *
 * 자동매도(gh-trade Phase 28 · HANDOFF §4-1 v0.2)는 기존 칸을 재해석한다 — 조각 낱말은 WinForms
 * `StrategyEventFormatter` 문장 규칙 표(gh-trade `docs/features/order-log-progress.md`)를 F-A 문법으로 옮긴 것이다.
 * kind 6 은 `reason_code` **첫 토큰**(`reasonToken` · 정확 일치)이 본문을 가른다 — group 은 WR-05 로 4/5/6 ↔ 9 가
 * 뒤바뀔 수 있어 본문 판정에 쓰지 않고, 배지는 서버가 말한 group 그대로 둔다. 꼬리 문구는 읽지 않는다(D-36).
 *
 * 두 표면(D-09): 주문로그 탭 `orderLogLineText`(`거래소 | 종목 | 행위 · 본문 | 누적 N`) · 오늘 주문 펼침
 * `timelineStrategyText`(`[그룹 · ]본문 · 누적 N`). 본문은 같고 표면 차이는 행위 단어(첫 체결 — R6)와 그룹 접두
 * (주문 줄만 — R9) 뿐이다. 서버 문자열은 판정에 쓰지 않는다 — `message` 는 원문 그대로 붙이고(D-36),
 * `reason_code` 는 연산자 표 정확 일치 조회만 한다.
 *
 * 7 수동 · 8 VI 는 조건이 빈 주문 줄의 조건 자리에 출처 문구(수동 주문 · VI 자동주문)를 그린다 · 방향은
 * group + kind(`strategyEventSide`) — 수동은 매수 · 매도 겸용이라 group 만으로 방향을 읽지 않는다(quick-260930-e73).
 *
 * 시각은 KST 로 고정한다 — 브라우저 로캘 · 시간대가 달라도 같은 문자열(트레이더 대조 · 골든 테스트).
 */
import { limitFeatureLogParts } from "./limit-feature";
import { isMarketStrategyEvent, type StrategyEventRow } from "./strategy-event";
import {
  AUTO_SELL_PAUSE_LABELS,
  autoSellBasisLabel,
  autoSellStateLabel,
  cancelReasonLabel,
  condMetricLabel,
  isAutoSellReason,
  orderConditionLabel,
  orderGroupLabel,
  orderGroupOriginText,
  reasonOperator,
  reasonToken,
  strategyEventSide,
  strategyKindLabel,
} from "./strategy-event-labels";

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
  /**
   * 구분 칸 색 축 — buy `--up` · sell `--down` · market `--accent-fg` · unknown `--muted-fg` ·
   * feature `--muted-fg` — kind 15 상한가 특징(D-07 · 중립 회색 · 본문도 `--muted-fg`).
   */
  tone: "buy" | "sell" | "market" | "unknown" | "feature";
  /** 행위 단어(600). 시세 이벤트는 null · 모르는 kind 는 원문 숫자(D-10). */
  action: string | null;
  /** 본문 앞 강조 조각 — 표면이 `--up` 600 으로 그린다. kind 15 잠김 줄만(「잠김 43초」 · 「단일가 · 잠김 12초」). */
  lead?: string;
  /** 본문 조각을 「 · 」 로 이은 문장(lead 는 빠진다 — 평문은 `orderLogLineText` 가 lead · body 를 잇는다). */
  body: string;
  /** `누적 N` 꼬리. */
  cum: string;
};

/**
 * 이벤트 1건 → 조각. 본문(`body`)은 두 표면이 같다(D-09) — `surface` 가 가르는 것은 행위 단어뿐이다
 * (첫 체결: 탭 「체결」 · 펼침 「첫 체결」 — UI-SPEC R6).
 */
export function strategyEventParts(ev: StrategyEventRow, surface: "log" | "timeline"): StrategyEventParts {
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
    case 10:
      return { badge: strategyKindLabel(10), tone: "market", action: null, body: burstLimitBody(ev), cum };
    case 15: {
      // 관찰자 저널 상한가 특징 — 행위 · 주문번호 없음(시세 이벤트 문법) · 잠김 줄만 lead.
      const { lead, body } = limitFeatureLogParts(ev);
      return { badge: strategyKindLabel(15), tone: "feature", action: null, ...(lead ? { lead } : {}), body, cum };
    }
    case 3:
      return { ...orderBadge(ev), action: strategyKindLabel(3), body: buyOrderBody(ev), cum };
    case 4: {
      // 전량 즉시체결 = Queued qty 0 · immediate_fill_qty = 전량 (gh-trade 정정 2026-09-29) — 대기가 없다.
      const allFilled = ev.qty === 0 && ev.immediateFillQty > 0;
      return {
        ...orderBadge(ev),
        action: allFilled ? "즉시체결" : strategyKindLabel(4),
        body: queuedBody(ev, allFilled),
        cum,
      };
    }
    case 5:
      return {
        ...orderBadge(ev),
        action: surface === "timeline" ? "첫 체결" : strategyKindLabel(5),
        body: `오차 ${formatSigned(ev.errorVolume)}`,
        cum,
      };
    case 6: {
      // 자동매도 토큰 우선(조립기 규약) — 배지는 늘 group 그대로(WR-05 쌍을 지어 바꾸지 않는다).
      const token = reasonToken(ev.reasonCode);
      if (token === "AutoSellAuctionOrder") {
        return { ...orderBadge(ev), action: strategyKindLabel(6), body: autoSellAuctionBody(ev), cum };
      }
      if (isAutoSellReason(ev.reasonCode)) {
        return { ...orderBadge(ev), action: strategyKindLabel(6), body: autoSellOrderBody(ev, token), cum };
      }
      // 집합 밖 자동매도 토큰(미래 사유) — 칸 뜻을 모르므로 D-10 폴백(기존 매도 본문으로 오독하지 않는다).
      if (token.startsWith("AutoSell")) return unknownKindParts(ev, cum);
      return { ...orderBadge(ev), action: strategyKindLabel(6), body: sellOrderBody(ev), cum };
    }
    case 7:
      return { ...orderBadge(ev), action: strategyKindLabel(7), body: cancelledBody(ev), cum };
    case 8:
      // 거부 사유는 서버 원문 그대로 — 쪼개 읽거나 판정하지 않는다(D-36 · T-17-33).
      return { ...orderBadge(ev), action: strategyKindLabel(8), body: ev.message, cum };
    case 11:
      return { ...orderBadge(ev), action: strategyKindLabel(11), body: autoSellTriggeredBody(ev), cum };
    case 12:
      return { ...orderBadge(ev), action: strategyKindLabel(12), body: autoSellModifiedBody(ev), cum };
    case 13:
      return { ...orderBadge(ev), action: strategyKindLabel(13), body: autoSellStateBody(ev), cum };
    case 14:
      return {
        ...orderBadge(ev),
        // 14 는 kind 당 한 낱말이 아니다 — cond_actual 1 VI 멈춤 · 2 동시호가 멈춤 · 3 재개 · 그 밖 원문 숫자(D-15).
        action: AUTO_SELL_PAUSE_LABELS[ev.condActual] ?? String(ev.condActual),
        body: autoSellPauseBody(ev),
        cum,
      };
    default:
      return unknownKindParts(ev, cum);
  }
}

/** D-10 모르는 kind — 그룹을 알아도 행위 · 본문 · 방향색을 지어내지 않는다. */
function unknownKindParts(ev: StrategyEventRow, cum: string): StrategyEventParts {
  return { badge: orderGroupLabel(ev.group) ?? String(ev.kind), tone: "unknown", action: String(ev.kind), body: "", cum };
}

/** 조각을 「 · 」 로 잇는다 — 빈 조각(null · "")은 거른다. 모든 본문 · 두 표면이 이 한 헬퍼를 쓴다(D-09). */
function joinDot(pieces: ReadonlyArray<string | null | undefined>): string {
  return pieces.filter((p): p is string => typeof p === "string" && p !== "").join(" · ");
}

/** 수량형 값 — 음수(남은 거래량 등)는 U+2212. 양수에 `+` 를 붙이지 않는다(오차만 부호 — `formatSigned`). */
function formatQty(n: number): string {
  return n < 0 ? `${MINUS}${NUM.format(-n)}` : NUM.format(n);
}

/**
 * 주문 이벤트 구분 칸 — 그룹 표시명 · 방향색(group + kind). 모르는 그룹(0 포함) · 방향을 정할 수 없는 수동
 * 이벤트(거부 등)는 unknown — 방향을 지어내지 않는다.
 */
function orderBadge(ev: StrategyEventRow): Pick<StrategyEventParts, "badge" | "tone"> {
  return { badge: orderGroupLabel(ev.group) ?? String(ev.group), tone: strategyEventSide(ev.group, ev.kind) ?? "unknown" };
}

/** 상한가노출 본문: (시초 상한가 · ) 매도잔량 N. */
function limitExposedBody(ev: StrategyEventRow): string {
  return joinDot([ev.openAtLimit ? "시초 상한가" : null, `매도잔량 ${NUM.format(ev.askQtyAtLimit)}`]);
}

/**
 * 버스트 상한가 본문: `조각 N · 합계 M주` (gh-trade 3c6e6cff StrategyEventFormatter 문구). 슬롯 재사용 —
 * cond_actual = 조각 수 · ev_trade_qty = 합계 수량. ev_price(상한가)는 그리지 않는다(시세 이벤트 본문에 가격 없음).
 */
function burstLimitBody(ev: StrategyEventRow): string {
  return joinDot([`조각 ${NUM.format(ev.condActual)}`, `합계 ${NUM.format(ev.evTradeQty)}주`]);
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

/**
 * BuyOrder 본문: 조건 · 근거 · 상한가 매수잔량 · 가격×수량 · 접수 지연. 수동 · VI 주문은 상한가 매수가 아니라
 * 「상한가 매수잔량 0」 이 측정값처럼 읽힌다 — 0 이면 조각을 생략한다(상따 0~6 은 0 도 그린다).
 */
function buyOrderBody(ev: StrategyEventRow): string {
  const omitLimitBid = ev.limitBidQty === 0 && orderGroupOriginText(ev.group) !== null;
  return joinDot([
    conditionText(ev),
    evidenceText(ev),
    omitLimitBid ? null : `상한가 매수잔량 ${NUM.format(ev.limitBidQty)}`,
    `${NUM.format(ev.price)}×${NUM.format(ev.qty)}주`,
    latencyText(ev),
  ]);
}

/** SellOrder 본문: 조건 · 근거 · (매수1 가격·잔량) · 가격×수량 방식 · 접수 지연. */
function sellOrderBody(ev: StrategyEventRow): string {
  return joinDot([
    conditionText(ev),
    evidenceText(ev),
    ev.bid1Price > 0 ? `매수1 ${NUM.format(ev.bid1Price)}·${NUM.format(ev.bid1Qty)}주` : null,
    `${NUM.format(ev.price)}×${NUM.format(ev.qty)}주${methodSuffix(ev)}`,
    latencyText(ev),
  ]);
}

/** 매도주문 방식 꼬리 — `order_condition` 빈 값이면 없음, 그 밖 「 지정가」 등(모르면 원문). */
function methodSuffix(ev: StrategyEventRow): string {
  return ev.orderCondition === "" ? "" : ` ${orderConditionLabel(ev.orderCondition)}`;
}

/**
 * 자동매도 주기 매도(kind 6 · AutoSellAsk1/Bid1) 본문:
 * `매도 {qty}주 @{price}[ 방식] · 주기 거래량 {cond_actual} × {cond_threshold}% · {매도1호가|매수1호가} · (매수1 …) · (접수 …)`.
 * cond_metric 3 을 「단건 매도체결」 로, 근거 틱을 「근거 …」 로 읽지 않는다 — 칸이 재해석돼 있다(RESEARCH 3-c).
 * 호가 몫 낱말은 토큰으로만 고른다(Ask1 · Bid1) — 그 밖 자동매도 토큰이면 조각을 생략한다.
 */
function autoSellOrderBody(ev: StrategyEventRow, token: string): string {
  const side = token === "AutoSellAsk1" ? "매도1호가" : token === "AutoSellBid1" ? "매수1호가" : null;
  return joinDot([
    `매도 ${NUM.format(ev.qty)}주 @${NUM.format(ev.price)}${methodSuffix(ev)}`,
    `주기 거래량 ${NUM.format(ev.condActual)} × ${NUM.format(ev.condThreshold)}%`,
    side,
    ev.bid1Price > 0 ? `매수1 ${NUM.format(ev.bid1Price)}·${NUM.format(ev.bid1Qty)}주` : null,
    latencyText(ev),
  ]);
}

/**
 * 장전 동시호가 회차(kind 6 · AutoSellAuctionOrder) 본문:
 * `동시호가 {회차}회차 매도 {qty}주 @{하한가} · 예상체결량 {M} × {비율}% · 예상체결가 {E} · 보관 {a}→{b} · (접수 …)`.
 * ev_kind 1(Quote)이어도 「근거 호가」 가 아니다 — `ev_qty_before/after` 는 회차 전/후 누적 보관 수량(group 9 한정 뜻).
 */
function autoSellAuctionBody(ev: StrategyEventRow): string {
  return joinDot([
    `동시호가 ${ev.entryRound}회차 매도 ${NUM.format(ev.qty)}주 @${NUM.format(ev.price)}${methodSuffix(ev)}`,
    `예상체결량 ${NUM.format(ev.condActual)} × ${NUM.format(ev.condThreshold)}%`,
    ev.evPrice > 0 ? `예상체결가 ${NUM.format(ev.evPrice)}` : null,
    `보관 ${NUM.format(ev.evQtyBefore)}→${NUM.format(ev.evQtyAfter)}`,
    latencyText(ev),
  ]);
}

/**
 * 발동(kind 11) 본문: `{기준} {N}% 이탈 (발동가 {price})`(N = 시작조건 · 0 이면 `{기준} 이탈`) · `실측 {체결가}` ·
 * `기준 {기준} {기준가격}`(0 이면 생략). 기준 낱말은 queue_case(기준 종류)만 본다.
 */
function autoSellTriggeredBody(ev: StrategyEventRow): string {
  const basis = autoSellBasisLabel(ev.queueCase);
  const head =
    ev.condThreshold > 0
      ? `${basis} ${NUM.format(ev.condThreshold)}% 이탈 (발동가 ${NUM.format(ev.price)})`
      : `${basis} 이탈`;
  return joinDot([
    head,
    `실측 ${NUM.format(ev.condActual)}`,
    ev.bid1Price > 0 ? `기준 ${basis} ${NUM.format(ev.bid1Price)}` : null,
  ]);
}

/**
 * 정정(kind 12) 본문: `{qty}주 @{새 가격}` · `원주문 @{원주문 가격} 잔량 {원주문 잔량}주` · `새 번호 {message}`(빈 값이면
 * 생략) · (접수 …). 주문번호 칸(order_no)은 원주문 번호다 — 오늘 주문 타임라인이 그 번호로 묶는다.
 */
function autoSellModifiedBody(ev: StrategyEventRow): string {
  return joinDot([
    `${NUM.format(ev.qty)}주 @${NUM.format(ev.price)}`,
    `원주문 @${NUM.format(ev.condThreshold)} 잔량 ${NUM.format(ev.condActual)}주`,
    // 서버 원문 그대로 붙인다(숫자만 오는 계약 — 쪼개 읽거나 판정하지 않는다 · D-36).
    ev.message === "" ? null : `새 번호 ${ev.message}`,
    latencyText(ev),
  ]);
}

/**
 * 상태(kind 13) 본문: `자동매도 {이전} → {새}` · `기준 {기준} {price}`(price 0 이면 생략) · `매도 누적 {qty}주`(0 이면
 * 생략). 상태 낱말은 카드 칩과 같은 표 하나(0 꺼짐 · 1 대기 · 2 감시 · 3 매도중 · 4 완료 · 그 밖 원문 숫자).
 */
function autoSellStateBody(ev: StrategyEventRow): string {
  return joinDot([
    `자동매도 ${autoSellStateLabel(ev.condThreshold)} → ${autoSellStateLabel(ev.condActual)}`,
    ev.price > 0 ? `기준 ${autoSellBasisLabel(ev.queueCase)} ${NUM.format(ev.price)}` : null,
    ev.qty > 0 ? `매도 누적 ${NUM.format(ev.qty)}주` : null,
  ]);
}

/** 멈춤 꼬리 — 미체결은 그대로 두고 신규 · 정정만 멈춘다(gh-trade §6-6). */
const AUTO_SELL_PAUSE_TAIL = "신규·정정 멈춤(미체결 유지)";

/**
 * 멈춤/재개(kind 14) 본문: 1 `VI 발동 · 신규·정정 멈춤(미체결 유지)` · 2 `동시호가 · …`(NXT 는 「단일가」) ·
 * 3 `새 T0 누적 {expected_cum}` · 그 밖 ""(행위가 원문 숫자를 말한다 — 지어내지 않는다).
 */
function autoSellPauseBody(ev: StrategyEventRow): string {
  if (ev.condActual === 1) return joinDot(["VI 발동", AUTO_SELL_PAUSE_TAIL]);
  if (ev.condActual === 2) return joinDot([ev.exchange === "NXT" ? "단일가" : "동시호가", AUTO_SELL_PAUSE_TAIL]);
  if (ev.condActual === 3) return `새 T0 누적 ${NUM.format(ev.expectedCum)}`;
  return "";
}

/**
 * Queued 본문 세 갈래 — 전량 즉시체결 `{ifq}주 · 대기 없음` / 일부 `{qty}주 · {ifq}주 즉시체결 · 체결예상 …` /
 * 일반 `{qty}주 · 체결예상 {E} ({B} + {A})`.
 */
function queuedBody(ev: StrategyEventRow, allFilled: boolean): string {
  if (allFilled) return `${NUM.format(ev.immediateFillQty)}주 · 대기 없음`;
  return joinDot([
    `${NUM.format(ev.qty)}주`,
    ev.immediateFillQty > 0 ? `${NUM.format(ev.immediateFillQty)}주 즉시체결` : null,
    `체결예상 ${NUM.format(ev.expectedCum)} (${NUM.format(ev.baseCum)} + ${NUM.format(ev.aheadQty)})`,
  ]);
}

/**
 * Cancelled 본문: 취소 사유 표시명 + (has_remaining 이면) `남은 거래량 R (E − C)`. E 는 expected_cum 이 있으면
 * 그 값, 없으면 C + R (R = E − C 정의 · 필드 뜻 v0.1). 대기가 아니었으면 has_remaining 거짓 — 조각 없음.
 */
function cancelledBody(ev: StrategyEventRow): string {
  let remaining: string | null = null;
  if (ev.hasRemaining) {
    const c = ev.cumVolume;
    const r = ev.remainingVolume;
    const e = ev.expectedCum > 0 ? ev.expectedCum : c + r;
    remaining = `남은 거래량 ${formatQty(r)} (${NUM.format(e)} ${MINUS} ${NUM.format(c)})`;
  }
  return joinDot([cancelReasonLabel(ev.cancelReason), remaining]);
}

/** 조건 값 — 7(상승률)은 bp → `3.00%`, 나머지(4 가격 포함)는 ko-KR 숫자. */
function conditionValue(metric: number, v: number): string {
  if (metric === 7) return `${(v / 100).toFixed(2)}%`;
  return NUM.format(v);
}

/**
 * 조건 자리의 출처 문구 — 조건이 빈(cond_metric 0) 수동 · VI 주문이면 「수동 주문」/「VI 자동주문」, 아니면 null.
 * 조건 조각과 펼침 접두 판정이 이 한 규칙을 같이 쓴다(본문이 출처를 말하면 접두를 붙이지 않는다).
 */
function originInCondition(ev: StrategyEventRow): string | null {
  return ev.condMetric === 0 ? orderGroupOriginText(ev.group) : null;
}

/**
 * 조건 조각 `조건 {지표}{연산자}{설정} / 실측 {실측}`. cond_metric 0 이면 수동 · VI 는 출처 문구
 * (수동 주문 · VI 자동주문), 그 밖은 null(조각 생략).
 */
function conditionText(ev: StrategyEventRow): string | null {
  if (ev.condMetric === 0) return originInCondition(ev);
  const op = reasonOperator(ev.reasonCode);
  const metric = condMetricLabel(ev.condMetric, strategyEventSide(ev.group, ev.kind));
  // 연산자를 모르면 지표와 값 사이를 공백으로 둔다 — 방향을 지어내지 않는다(D-10).
  return `조건 ${metric}${op ?? " "}${conditionValue(ev.condMetric, ev.condThreshold)} / 실측 ${conditionValue(ev.condMetric, ev.condActual)}`;
}

/** 접수 지연 조각. 0 = 미측정 — 「+0ms」 로 그리면 측정값처럼 읽혀 생략한다. */
function latencyText(ev: StrategyEventRow): string | null {
  return ev.acceptLatencyUs > 0 ? `접수 +${Math.round(ev.acceptLatencyUs / 1000)}ms` : null;
}

/**
 * 근거 틱 조각. 호가(1) 근거는 지표로 매도/매수 1호가를 가르고, 체결(2)은 매도 방향이면 「매도체결」,
 * 체결통보(3)는 가격 · 수량만. 0 · 모르는 값이면 null(조각 생략).
 */
function evidenceText(ev: StrategyEventRow): string | null {
  if (ev.evKind === 1) {
    const before = NUM.format(ev.evQtyBefore);
    const after = NUM.format(ev.evQtyAfter);
    if (ev.condMetric === 1) return `근거 호가(매도1잔량 ${before}→${after})`;
    if (ev.condMetric === 2) return `근거 호가(매수1잔량 ${before}→${after})`;
    return `근거 호가(${before}→${after})`;
  }
  if (ev.evKind === 2) {
    const trade = strategyEventSide(ev.group, ev.kind) === "sell" ? "매도체결" : "체결";
    return `근거 체결(${NUM.format(ev.evPrice)} ${trade} ${NUM.format(ev.evTradeQty)}주)`;
  }
  if (ev.evKind === 3) return `근거 체결통보(${NUM.format(ev.evPrice)} ${NUM.format(ev.evTradeQty)}주)`;
  return null;
}

/**
 * F-A 한 줄 평문 — `[시각][주문번호][구분] 거래소 | 종목 | 행위 · (lead · )본문 | 누적 N`.
 * 시세 이벤트는 주문번호 칸이 없고 행위 단어도 없다. 주문번호가 빈 주문 이벤트(거부)는 `[—]`.
 * 줄의 `title`(잘림 보완) · 복사 대조 · 골든 테스트가 이 문자열을 쓴다(UI-SPEC R11).
 */
export function orderLogLineText(ev: StrategyEventRow, stockName: string): string {
  const parts = strategyEventParts(ev, "log");
  const head =
    `[${formatKstMs(ev.gwTimeMs)}]` +
    (isMarketStrategyEvent(ev.kind) ? "" : `[${ev.orderNo === "" ? "—" : ev.orderNo}]`) +
    `[${parts.badge}]`;
  const sentence = joinDot([parts.action, parts.lead ?? null, parts.body]);
  const middle = [ev.exchange, stockName, sentence].filter((s) => s !== "").join(" | ");
  return `${head} ${middle} | ${parts.cum}`;
}

/**
 * 오늘 주문 펼침 타임라인 한 줄 — 행에 이미 있는 거래소 · 종목 · 주문번호를 뺀 `[그룹 · ]본문 · 누적 N`.
 * 그룹 접두는 주문 줄(kind 3 · 6)에만 붙는다 — 대기 · 첫 체결 · 취소 · 거부는 같은 주문의 연속이다(UI-SPEC R9).
 * group 0(None)은 접두가 없다. 조건 없는 수동/VI 주문 줄은 본문이 출처(수동 주문 · VI 자동주문)를 말하므로 접두를
 * 생략한다 — 「수동 · 수동 주문」 중복 방지(행에는 출처 칩도 있다). 시세 이벤트를 그리면 행위 칸에 구분 표시명
 * (상한가진입 N차 등)을 쓴다.
 */
export function timelineStrategyText(ev: StrategyEventRow): { action: string; text: string } {
  const parts = strategyEventParts(ev, "timeline");
  const isOrderLine = ev.kind === 3 || ev.kind === 6;
  const prefix = isOrderLine && originInCondition(ev) === null ? orderGroupLabel(ev.group) : null;
  return { action: parts.action ?? parts.badge, text: joinDot([prefix, parts.body, parts.cum]) };
}
