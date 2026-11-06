/**
 * Phase 40 — 체결 앱 푸시 문안 조립기(D-16 · 스케치 029 **C 안** — 조립은 **여기 한 곳**이다).
 *
 * relay 송신기(40-06)는 판정 RPC(40-05)가 돌려준 사실(`PushFacts`)을 그대로 넣고 제목 · 본문 · 탭 경로 ·
 * 묶음 키만 받아 간다 — relay 안에서 문장을 만들지 않는다(주문로그 낱말과 갈라지지 않게 · Phase 25 D-10).
 *
 * - 제목 「종목 · 구분 사건」 · 본문 「수량 (만원) · 잔량 · 가격 · 거래소 시각」(정본 `.planning/sketches/029-fill-push-messages/`).
 * - 표시명은 `strategy-event-labels.ts` 표에서만 고른다 — 구분 `ORDER_GROUP_LABELS`(D-03) · 취소 사유
 *   `CANCEL_REASON_LABELS`(D-04) · 자동매도 기준 `autoSellBasisLabel`. 금액은 Phase 31 만원 규칙
 *   (`amountFromQty` + `formatManwon`) 한 벌.
 * - 거부 사유는 게이트웨이 `message` 원문 그대로 한 조각으로 싣는다(D-04 · 토스트 T-pgu-01 동형 — 문장 조립 없음).
 * - 종목은 이름만(코드 병기 없음 · 이름이 없을 때만 코드 → ISIN) · 시각은 KST 고정 `HH:MM:SS`
 *   (기기 시간대와 무관하게 같은 문자열 — 골든 테스트).
 * - **계좌 인자가 없다(SC-4).** 입력 `PushFacts` 에 계좌 칸이 없어 어떤 입력으로도 계좌번호가 문안에 들어갈 수 없다.
 */
import { amountFromQty, formatManwon } from "./lc-amount";
import { CANCEL_REASON_LABELS, ORDER_GROUP_LABELS, autoSellBasisLabel } from "./strategy-event-labels";
import { PUSH_ORDER_LOG_PATH, type PushFacts } from "./push";

const NUM = new Intl.NumberFormat("ko-KR");
const SEP = " · ";
const KST_OFFSET_MS = 9 * 3_600_000;

/** origin 폴백 낱말(D-03) — 수동 · VI 는 그룹 표 낱말 그대로, 상따 주문은 그룹 짝이 없을 때 「상따」. */
const ORIGIN_GROUP: Readonly<Record<NonNullable<PushFacts["origin"]>, string>> = {
  manual: ORDER_GROUP_LABELS[7] ?? "수동",
  vi: ORDER_GROUP_LABELS[8] ?? "VI",
  limit_chaser: "상따",
};

/** 사건 시각(epoch ms) → KST `HH:MM:SS`. */
export function formatPushKstTime(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 19);
}

/**
 * 제목의 구분 낱말(D-03). group 표 낱말 → origin 폴백 → 빈 낱말. 낱말이 「매수」/「매도」 로 끝나지 않으면
 * (수동 · VI · 체결훅 · 상따 · 빈 낱말) side 낱말을 붙인다(주문로그와 같은 낱말). 끝까지 비면 「주문」.
 */
export function pushGroupWord(f: PushFacts): string {
  let word = "";
  if (f.group != null && Object.hasOwn(ORDER_GROUP_LABELS, f.group)) word = ORDER_GROUP_LABELS[f.group]!;
  else if (f.origin != null) word = ORIGIN_GROUP[f.origin] ?? "";
  if (!word.endsWith("매수") && !word.endsWith("매도")) {
    const sideWord = f.side === "B" ? "매수" : f.side === "S" ? "매도" : "";
    word = [word, sideWord].filter(Boolean).join(" ");
  }
  return word || "주문";
}

function stockOf(f: PushFacts): string {
  return f.stockName || f.stockCode || f.isin;
}

/** 금액 조각 ` (156만)` — 수량 · 가격 어느 쪽이든 0 · null 이면 빈 문자열. */
function amountPart(qty: number | null | undefined, price: number | null | undefined): string {
  if (!(qty != null && qty > 0) || !(price != null && price > 0)) return "";
  return ` (${formatManwon(amountFromQty(qty, price))})`;
}

/** 수량 조각 `500주 (156만)` — 수량이 0 · null 이면 빈 문자열(가격을 모르면 금액 없이 `500주`). */
function qtyPart(qty: number | null | undefined, price: number | null | undefined): string {
  return qty != null && qty > 0 ? `${NUM.format(qty)}주${amountPart(qty, price)}` : "";
}

/**
 * 손익 % 한 자리(D-23) — 크기를 반올림해 부호를 붙인다(±같은 크기는 같은 숫자 · 음수 부호는 U+2212).
 * 반올림해 0 이면 부호 없는 `0.0%`.
 */
function pnlPctText(pct: number): string {
  const tenths = Math.round(Math.abs(pct) * 10);
  if (tenths === 0) return "0.0%";
  return `${pct < 0 ? "−" : "+"}${(tenths / 10).toFixed(1)}%`;
}

/** 가격 조각 `3,120` — 0 · null 이면 빈 문자열. */
function pricePart(price: number | null | undefined, prefix = ""): string {
  return price != null && price > 0 ? `${prefix}${NUM.format(price)}` : "";
}

/** 거래소 시각 조각 `KRX 09:00:31` — 거래소가 비면 시각만. */
function exchangeTime(f: PushFacts): string {
  const t = formatPushKstTime(f.gwTimeMs);
  return f.exchange ? `${f.exchange} ${t}` : t;
}

function join(parts: readonly string[]): string {
  return parts.filter((p) => p !== "").join(SEP);
}

/** 사실 → 푸시 제목 · 본문(스케치 029 C 안). */
export function pushMessageOf(f: PushFacts): { title: string; body: string } {
  const stock = stockOf(f);
  const word = pushGroupWord(f);
  switch (f.stage) {
    case "accepted":
      return {
        title: `${stock} · ${word} 접수`,
        body: join([qtyPart(f.qty, f.price), pricePart(f.price), exchangeTime(f)]),
      };
    case "first_fill": {
      const remain = f.qty != null ? `잔량 ${NUM.format(Math.max(0, f.qty - f.filledQty))}주` : "";
      return {
        title: `${stock} · ${word} 체결`,
        body: join([
          `${NUM.format(f.filledQty)}주 체결${amountPart(f.filledQty, f.lastFillPrice)}`,
          remain,
          pricePart(f.lastFillPrice),
          exchangeTime(f),
        ]),
      };
    }
    case "filled":
      return {
        title: `${stock} · ${word} 전량 체결`,
        body: join([
          `${NUM.format(f.filledQty)}주${amountPart(f.filledQty, f.avgFillPrice)} 전량`,
          pricePart(f.avgFillPrice, "평균 "),
          exchangeTime(f),
        ]),
      };
    case "rejected":
      // 게이트웨이 사유는 trim 한 원문 한 조각 — 다른 문장과 이어 붙이지 않는다(D-04).
      return {
        title: `${stock} · ${word} 거부`,
        body: join([f.message?.trim() ?? "", qtyPart(f.qty, f.price), pricePart(f.price), exchangeTime(f)]),
      };
    case "cancelled": {
      const reason =
        f.cancelReason != null && Object.hasOwn(CANCEL_REASON_LABELS, f.cancelReason)
          ? CANCEL_REASON_LABELS[f.cancelReason]!
          : "";
      const remain =
        f.cancelledQty != null && f.cancelledQty > 0
          ? `잔량 ${NUM.format(f.cancelledQty)}주${amountPart(f.cancelledQty, f.price)}`
          : "";
      const head = reason ? join([reason, remain]) : remain ? `${remain} 취소` : "취소";
      return { title: `${stock} · ${word} 취소`, body: join([head, exchangeTime(f)]) };
    }
    case "autosell_start": {
      // 구분 낱말은 「자동매도」 고정 · 시각 조각은 거래소 없이 시각만(스케치 029).
      const a = f.autosell;
      const time = formatPushKstTime(f.gwTimeMs);
      const title = `${stock} · 자동매도 시작`;
      if (!a) return { title, body: time };
      const basis = autoSellBasisLabel(a.basis);
      const holding = a.holdingQty ?? 0;
      if (holding > 0) {
        // D-25 — 보유 조각은 relay 계좌 캐시에 값이 있을 때만.
        return { title, body: join([`보유 ${qtyPart(holding, a.holdingAvgPrice)}`, `기준 ${basis}`, time]) };
      }
      return {
        title,
        body: join([`기준 ${basis}${pricePart(a.basePrice, " ")}`, pricePart(a.triggerPrice, "발동가 "), time]),
      };
    }
    case "autosell_done": {
      const a = f.autosell;
      const time = formatPushKstTime(f.gwTimeMs);
      const title = `${stock} · 자동매도 완료`;
      if (!a) return { title, body: time };
      // 평균 매도가가 없으면 금액 · 평균 · 손익 조각을 모두 뺀다(손익 % 는 실현 손익 기준 · 40-05 가 계산 · D-23).
      const hasAvg = a.avgSellPrice != null && a.avgSellPrice > 0;
      return {
        title,
        body: join([
          `${NUM.format(a.soldQty)}주${amountPart(a.soldQty, a.avgSellPrice)} 매도`,
          pricePart(a.avgSellPrice, "평균 "),
          hasAvg && a.pnlPct != null ? `손익 ${pnlPctText(a.pnlPct)}` : "",
          time,
        ]),
      };
    }
    default: {
      // 빠진 단계는 타입 오류 · 계약 밖 문자열은 조용히 넘기지 않고 던진다(relay 가 잡아 로깅).
      const unknownStage: never = f.stage;
      throw new Error(`pushMessageOf: unknown stage ${String(unknownStage)}`);
    }
  }
}

/** 탭 경로(D-21) — 주문로그를 그 종목 · 그 거래일로 거른다. 계좌 · 배지 없음(계좌는 웹 탭 처리기가 붙인다 · D-24). */
export function pushTapPathOf(f: PushFacts): string {
  return `${PUSH_ORDER_LOG_PATH}?stock=${encodeURIComponent(f.isin)}&date=${f.tradeDate}`;
}

/** 묶음 키(D-18 · iOS thread-id) = 종목 ISIN. */
export function pushThreadIdOf(f: PushFacts): string {
  return f.isin;
}
