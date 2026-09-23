/**
 * trading-alerts — 작업대 **이벤트 알림**의 순수 모델 (quick-260923-pgu · 2026-09-23 목업 ③ 변형 A).
 *
 * ① 결정 갱신 (D-36 · D-27 → ③A)
 *   Phase 15 D-36 · Phase 18 D-27 은 「토스트 라이브러리 없음 — 인라인 role=status」 였다. 사용자가
 *   2026-09-23 목업 게이트에서 **의도적으로 뒤집었다**(③A 채택): 접수·체결·정정확인·취소확인·거부·
 *   VI 발동·돌파(76 단건)를 작업대 우하단(폰은 상단) 토스트로 띄운다. 라이브러리는 여전히 없고
 *   (자체 구현) 컨테이너는 `role="status"` · `aria-live="polite"` 를 지킨다. 카드 안 인라인 배너
 *   (`CardNotices`)는 **카드 자기 상태**라 그대로다 — 이 모듈이 다루는 것은 **이벤트**다.
 *
 * ② 주문번호 색인 (`OrderIndexEntry`)
 *   `RelayOrderMsg` 에는 종목·계좌·방향·이름이 없다(relay Pitfall 8 — 브라우저가 주문번호로 자기 주문
 *   목록과 맞춘다). 그래서 relay 리듀서가 원시 `acct` 프레임의 `unf` 행을 **병합 필터 전에**
 *   `indexUnfilled` 로 추가만 해 둔다 — 한 델타 안에서 접수+전량 체결돼 미체결 상태에 한 번도
 *   남지 않은 주문도 이름이 붙는다. 정정·취소 통보는 `org`(원주문)로도 푼다.
 *
 * ③ 묶음 — 같은 주문의 체결은 **첫 통보 기준** `MERGE_WINDOW_MS`(3초, `order-notices.ts` 와 같은
 *   창 · 슬라이딩 아님) 안에서 한 알림에 누적한다. 접수·취소·거부·VI·돌파는 묶지 않는다.
 *
 * ④ 하지 말 것
 *   - `RelayOrderMsg.msg` 를 **파싱하지 않는다**(D-08) — 거부 토스트에 원문을 그대로 보일 뿐이다.
 *   - 알림 이력을 저장하지 않는다(A안 — 벨 · 이력 없음). 브라우저 저장소를 쓰지 않는다.
 *   - 브라우저 Notification API 를 쓰지 않는다.
 *   - 계좌번호는 카드 매칭에만 쓴다 — 표시 문구에 싣지 않는다(T-pgu-02).
 */

import type {
  RelayExchange,
  RelayOrderMsg,
  RelayRateCrossItem,
  RelayUnfilled,
  RelayViNoticeMsg,
} from "@gh-radar/shared";

import type { CardTab } from "@/components/trading/card/card-tabs";
import { breakoutKey } from "@/lib/breakout-list";
import {
  MERGE_WINDOW_MS,
  orderNoticeLabel,
  type NoticeSide,
  type OrderNoticeFacts,
} from "@/lib/order-notices";

/** 색인 미스 주문의 보류 상한 — 계좌 델타가 통보보다 늦게 와도 이름을 붙일 여유. */
export const ALERT_HOLD_MS = 1_500;
/** 동시에 떠 있는 토스트 상한 — 넘치면 가장 오래된 것부터 뺀다. */
export const MAX_TOASTS = 4;
/** 토스트 수명 — 데스크톱 / 폰(뷰포트 < `TOAST_PHONE_BELOW`). */
export const TOAST_TTL_MS = 6_000;
export const TOAST_TTL_PHONE_MS = 4_000;
/** 호버를 떠난 뒤 닫히기까지. */
export const TOAST_LEAVE_MS = 2_500;
/** 폰 배치(상단 전폭) 뷰포트 상한(미만) — 토스트는 뷰포트 오버레이라 뷰포트 기준이다. */
export const TOAST_PHONE_BELOW = 700;

export type TradingAlertKind =
  | "accept"
  | "fill"
  | "modify"
  | "cancel"
  | "reject"
  | "vi"
  | "breakout";

/** 주문번호 → 그 주문의 종목·계좌 사실(미체결 행에서 처음 본 값). */
export interface OrderIndexEntry {
  isin: string;
  exchange: RelayExchange;
  side: "B" | "S";
  name?: string;
  code?: string;
  orderQty: number;
  accountNo: string;
}

export interface TradingAlert {
  /** React key — 훅이 `wb-alert-{n}` 으로 만든다. */
  id: string;
  kind: TradingAlertKind;
  /** 마지막 갱신 시각(ms) — 묶음 병합 때 바뀌고, 토스트는 이 값이 바뀌면 TTL 을 다시 잰다. */
  at: number;
  /** 묶음 창 기준 — 첫 통보 시각(슬라이딩 아님 · ③). */
  firstAt: number;
  /** 색인 미스 주문은 없다(카드를 찾거나 만들 수 없다). */
  isin?: string;
  exchange: RelayExchange;
  /** 카드 매칭 전용 — 표시하지 않는다(T-pgu-02). */
  accountNo?: string;
  name?: string;
  code?: string;
  side: NoticeSide;
  price?: number;
  qty?: number;
  /** 체결 누적 수량(fill). */
  filledQty?: number;
  orderQty?: number;
  orderNo?: string;
  /** 묶인 건수. */
  count: number;
  /** 거부 사유 원문 — 표시만 한다(D-08). 거부 외에는 없다. */
  msg?: string;
  /** 행위 단어(`orderNoticeLabel().text`). VI·돌파는 `""`. */
  label: string;
  vi?: { basePrice: number; changeRate: number; viEndTime: string };
  breakout?: { changeRate: number };
}

const KIND_BY_NT: ReadonlyMap<string, TradingAlertKind> = new Map([
  ["A", "accept"],
  ["E", "fill"],
  ["M", "modify"],
  ["C", "cancel"],
  ["R", "reject"],
]);

/** 통보 종류 1자 → 알림 종류. 모르는 값은 `null`(알리지 않는다 — 지어내지 않는다). */
export function orderAlertKind(nt: string): TradingAlertKind | null {
  return KIND_BY_NT.get(nt) ?? null;
}

/**
 * 한 계좌의 미체결 행을 색인에 **추가만** 한다(② — 삭제·덮어쓰기 없음, 먼저 본 값이 정본).
 * `unfilledQty === 0`(전량 체결 톰스톤) 행도 넣는다. 추가할 것이 없으면 `prev` 를 그대로 돌려준다
 * (참조 유지 — 소비자 효과가 헛돌지 않게).
 */
export function indexUnfilled(
  prev: ReadonlyMap<string, OrderIndexEntry>,
  accountNo: string,
  rows: readonly RelayUnfilled[],
): ReadonlyMap<string, OrderIndexEntry> {
  let next: Map<string, OrderIndexEntry> | null = null;
  for (const u of rows) {
    if (u.orderNo === "" || prev.has(u.orderNo) || next?.has(u.orderNo)) continue;
    next ??= new Map(prev);
    next.set(u.orderNo, {
      isin: u.isin,
      exchange: u.exchange,
      side: u.side,
      name: u.name,
      code: u.code,
      orderQty: u.orderQty,
      accountNo,
    });
  }
  return next ?? prev;
}

/** 통보 → 색인 항목. `no` 로 못 찾으면 `org`(정정·취소의 원주문)로. 빈 번호는 찾지 않는다. */
export function resolveOrderEntry(
  index: ReadonlyMap<string, OrderIndexEntry>,
  msg: Pick<RelayOrderMsg, "no" | "org">,
): OrderIndexEntry | null {
  if (msg.no !== "") {
    const hit = index.get(msg.no);
    if (hit !== undefined) return hit;
  }
  if (msg.org !== "") return index.get(msg.org) ?? null;
  return null;
}

/** 주문 통보 1건 → 알림. 호출자가 `orderAlertKind(msg.nt) === null` 을 미리 거른다. */
export function alertFromOrder(
  msg: RelayOrderMsg,
  entry: OrderIndexEntry | null,
  at: number,
  id: string,
): TradingAlert {
  const kind = orderAlertKind(msg.nt) ?? "accept";
  const facts: OrderNoticeFacts = {
    noticeType: msg.nt,
    requestKind: msg.rk ?? "",
    side: entry?.side ?? null,
    requester: msg.rq ?? "",
    board: msg.bd ?? "",
  };
  const label = orderNoticeLabel(facts);
  return {
    id,
    kind,
    at,
    firstAt: at,
    isin: entry?.isin,
    exchange: msg.x,
    accountNo: entry?.accountNo,
    name: entry === null ? `주문 ${msg.no}` : entry.name,
    code: entry?.code,
    side: label.side,
    price: msg.p,
    qty: msg.q,
    filledQty: kind === "fill" ? msg.q : undefined,
    orderQty: entry?.orderQty,
    orderNo: msg.no,
    count: 1,
    msg: kind === "reject" ? msg.msg : undefined,
    label: label.text,
  };
}

/** VI 발동 통지 → 알림. */
export function alertFromVi(msg: RelayViNoticeMsg, at: number, id: string): TradingAlert {
  return {
    id,
    kind: "vi",
    at,
    firstAt: at,
    isin: msg.isin,
    exchange: msg.exchange,
    accountNo: msg.accountNo,
    name: msg.name,
    side: null,
    price: msg.triggerPrice,
    qty: msg.orderQty,
    count: 1,
    label: "",
    vi: { basePrice: msg.basePrice, changeRate: msg.changeRate, viEndTime: msg.viEndTime },
  };
}

/** 등락률 돌파 76 단건 → 알림. */
export function alertFromBreakout(item: RelayRateCrossItem, at: number, id: string): TradingAlert {
  return {
    id,
    kind: "breakout",
    at,
    firstAt: at,
    isin: item.isin,
    exchange: item.exchange,
    name: item.name,
    code: item.code,
    side: null,
    price: item.lastPrice,
    count: 1,
    label: "",
    breakout: { changeRate: item.changeRate },
  };
}

/**
 * 새 알림을 목록에 넣는다(③). 같은 주문번호의 체결이 첫 통보 기준 `windowMs` 안이면 그 자리에서
 * 누적(`merged: true`), 아니면 뒤에 붙이고 `max` 를 넘으면 **앞(오래된 것)** 부터 자른다.
 */
export function mergeAlert(
  alerts: readonly TradingAlert[],
  incoming: TradingAlert,
  windowMs: number = MERGE_WINDOW_MS,
  max: number = MAX_TOASTS,
): { alerts: TradingAlert[]; merged: boolean } {
  if (incoming.kind === "fill" && incoming.orderNo !== undefined) {
    const i = alerts.findIndex(
      (a) =>
        a.kind === "fill" &&
        a.orderNo === incoming.orderNo &&
        incoming.at - a.firstAt <= windowMs,
    );
    if (i >= 0) {
      const cur = alerts[i];
      const next = [...alerts];
      next[i] = {
        ...cur,
        count: cur.count + 1,
        filledQty: (cur.filledQty ?? 0) + (incoming.filledQty ?? 0),
        price: incoming.price,
        at: incoming.at,
      };
      return { alerts: next, merged: true };
    }
  }
  const next = [...alerts, incoming];
  return { alerts: next.length > max ? next.slice(next.length - max) : next, merged: false };
}

/**
 * 돌파 집합에서 **76 단건으로 새로 들어온** 항목만. `snapChanged`(= `rateCrossSnapSeq` 가 바뀐
 * 렌더 = 78 스냅샷)면 무알림 — 돌파 스트립의 무음 판정과 같은 축이다(breakout-strip ④ · D-17).
 */
export function newRateCrossAlerts(
  prevKeys: ReadonlySet<string>,
  items: readonly RelayRateCrossItem[],
  snapChanged: boolean,
): RelayRateCrossItem[] {
  if (snapChanged) return [];
  return items.filter((it) => !prevKeys.has(breakoutKey(it)));
}

// ===========================================================================
// 표시 — 문구 표는 이 파일 한 곳이다(목업 `textOf`)
// ===========================================================================

const ICON: Readonly<Record<TradingAlertKind, string>> = {
  accept: "접",
  fill: "체",
  modify: "정",
  cancel: "취",
  reject: "!",
  vi: "VI",
  breakout: "돌",
};

/** 제목 뒷말 — 컴포넌트는 `<b>{alertWho}</b> {ALERT_TITLE_SUFFIX[kind]}` 로 그린다. */
export const ALERT_TITLE_SUFFIX: Readonly<Record<TradingAlertKind, string>> = {
  accept: "접수",
  fill: "체결",
  modify: "정정확인",
  cancel: "취소확인",
  reject: "주문 거부",
  vi: "VI 발동",
  breakout: "등락률 돌파",
};

export function alertIcon(kind: TradingAlertKind): string {
  return ICON[kind];
}

/** 제목의 주어 — 종목명 → ISIN → 「주문 {No}」. */
export function alertWho(a: Pick<TradingAlert, "name" | "isin" | "orderNo">): string {
  if (a.name !== undefined && a.name !== "") return a.name;
  if (a.isin !== undefined && a.isin !== "") return a.isin;
  return `주문 ${a.orderNo ?? ""}`.trim();
}

export function alertTitle(a: TradingAlert): string {
  return `${alertWho(a)} ${ALERT_TITLE_SUFFIX[a.kind]}`;
}

const fmt = (n: number | undefined): string =>
  n === undefined || !Number.isFinite(n) ? "?" : n.toLocaleString("ko-KR");

const signed = (text: string, n: number): string => (n > 0 ? `+${text}` : text);

/** VI 해제 예정시각 `HHMMSSuuu` → `HH:MM:SS` (표시 포맷일 뿐 — 벽시계로 해석하지 않는다). */
export function viEndClock(raw: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})/.exec(raw);
  return m === null ? null : `${m[1]}:${m[2]}:${m[3]}`;
}

/** 앞말(행위 단어)과 본문을 붙인다 — 행위를 모르면(`""`) 앞 공백 없이. */
const lead = (label: string, text: string): string => (label === "" ? text : `${label} ${text}`);

export function alertSubtitle(a: TradingAlert): string {
  switch (a.kind) {
    case "fill": {
      const qty =
        a.orderQty === undefined ? `${fmt(a.filledQty)}주` : `${fmt(a.filledQty)}/${fmt(a.orderQty)}주`;
      return `${lead(a.label, qty)} · ${fmt(a.price)}원 · ${a.exchange}`;
    }
    case "accept":
      return `${lead(a.label, `${fmt(a.qty)}주`)} · ${fmt(a.price)}원 · ${a.exchange} · No ${a.orderNo ?? ""}`;
    case "modify":
    case "cancel":
      // 방향 단어 없음 — `label` 이 「취소」/「정정」 이다(order-notices ②).
      return `${lead(a.label, `${fmt(a.qty)}주`)} · No ${a.orderNo ?? ""}`;
    case "reject":
      return a.msg ?? "";
    case "vi": {
      const v = a.vi;
      const parts = [`발동가 ${fmt(a.price)}`];
      if (v !== undefined) {
        parts.push(`기준 ${fmt(v.basePrice)} (${signed(String(v.changeRate), v.changeRate)}%)`);
      }
      parts.push(a.exchange);
      const end = v === undefined ? null : viEndClock(v.viEndTime);
      if (end !== null) parts.push(`해제 ${end}`);
      return parts.join(" · ");
    }
    case "breakout": {
      const r = a.breakout?.changeRate;
      const rate = r === undefined ? "?" : `${signed(r.toFixed(2), r)}%`;
      return `${rate} · ${a.exchange} · 돌파 목록에 추가됐어요`;
    }
  }
}

/**
 * 토스트 클릭이 여는 카드 탭. 주문 통보는 「미체결」(체결은 보유가 있으면 「잔고」), VI·돌파는 「로그」
 * — 단 알림이 **새로 만든** 카드면 로그가 비어 있으므로 「정보」.
 */
export function alertTabFor(
  a: Pick<TradingAlert, "kind">,
  opts: { hasHolding: boolean; cardIsNew: boolean },
): CardTab {
  switch (a.kind) {
    case "fill":
      return opts.hasHolding ? "holdings" : "unfilled";
    case "vi":
    case "breakout":
      return opts.cardIsNew ? "info" : "log";
    default:
      return "unfilled";
  }
}
