/**
 * 트레이딩 작업대 배치 기억 (quick-260923-lyt) — 다른 메뉴에 갔다 와도 마지막 배치 그대로.
 *
 * ① 무엇을 기억하나
 *   - 카드 목록 — 순서 · 펼침 · 거래소 · 계좌 · 추가 시점의 종목명/코드. 전략 **값**은 싣지 않는다
 *     (정본은 서버다). 카드 id 도 싣지 않는다 — 복원 때 새로 발급한다.
 *   - 「본 등록 전략 키」(`seen`) — 사용자가 ✕ 로 닫은 등록 전략 카드가 돌아왔을 때 다시 생기지 않게 한다.
 *     등록 전략 목록을 확정으로 안 뒤(64 스냅샷)에는 지금 등록된 키만 남겨 무한히 자라지 않는다.
 *   - 패널 펼침 — VI · 돌파 스트립 · 하단 공용 패널 탭/접힘.
 *
 * ② 어디에
 *   localStorage. 카드 목록은 **사용자별 키**다(`…:{userId}`) — 같은 기기에서 다른 계정이 로그인하면
 *   남의 카드가 보이면 안 된다. 계좌번호가 들어가지만 이 기기 브라우저 밖으로 나가지 않는다.
 *   패널 펼침은 화면 취향이라 기기 공용 키 하나다.
 *
 * ③ 안전
 *   읽기·쓰기 전부 `typeof window` 가드 + try/catch — 저장소가 막히거나 JSON 이 깨지면 「기억 없음」이다.
 *   읽기는 반드시 **마운트 후**에 한다(SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다).
 */

import type { RelayExchange } from "@gh-radar/shared";

/* ── 카드 목록 ───────────────────────────────────────────────────────── */

export const TRADING_LAYOUT_KEY_PREFIX = "gh-radar:trading-layout:";

/** 카드 상한 — 깨진 저장값이 화면을 수백 장 카드로 채우지 못하게. */
const MAX_SAVED_CARDS = 60;
const MAX_SAVED_SEEN = 400;

export interface SavedCard {
  isin: string;
  accountNo: string;
  exchange: RelayExchange;
  open: boolean;
  name?: string;
  code?: string;
}

export interface SavedLayout {
  cards: SavedCard[];
  seen: string[];
}

function layoutKey(userId: string): string {
  return `${TRADING_LAYOUT_KEY_PREFIX}${userId}`;
}

function toSavedCard(raw: unknown): SavedCard | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.isin !== "string" || r.isin.length === 0) return null;
  if (typeof r.accountNo !== "string") return null;
  if (r.exchange !== "KRX" && r.exchange !== "NXT") return null;
  const card: SavedCard = {
    isin: r.isin,
    accountNo: r.accountNo,
    exchange: r.exchange,
    open: r.open === true,
  };
  if (typeof r.name === "string") card.name = r.name;
  if (typeof r.code === "string") card.code = r.code;
  return card;
}

/** 저장된 배치. 없거나 깨졌으면 `null`(= 기억 없음 — 종전 동작). */
export function readTradingLayout(userId: string): SavedLayout | null {
  if (typeof window === "undefined" || userId === "") return null;
  try {
    const raw = window.localStorage.getItem(layoutKey(userId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; cards?: unknown; seen?: unknown } | null;
    if (parsed === null || parsed.v !== 1 || !Array.isArray(parsed.cards)) return null;
    const cards = parsed.cards
      .map(toSavedCard)
      .filter((c): c is SavedCard => c !== null)
      .slice(0, MAX_SAVED_CARDS);
    const seen = Array.isArray(parsed.seen)
      ? parsed.seen.filter((k): k is string => typeof k === "string").slice(0, MAX_SAVED_SEEN)
      : [];
    return { cards, seen };
  } catch {
    return null;
  }
}

export function writeTradingLayout(userId: string, layout: SavedLayout): void {
  if (typeof window === "undefined" || userId === "") return;
  try {
    const cards = layout.cards.slice(0, MAX_SAVED_CARDS).map((c) => {
      const out: SavedCard = {
        isin: c.isin,
        accountNo: c.accountNo,
        exchange: c.exchange,
        open: c.open,
      };
      if (c.name !== undefined) out.name = c.name;
      if (c.code !== undefined) out.code = c.code;
      return out;
    });
    const payload = { v: 1, cards, seen: layout.seen.slice(0, MAX_SAVED_SEEN) };
    window.localStorage.setItem(layoutKey(userId), JSON.stringify(payload));
  } catch {
    // 저장 실패는 다음 방문의 「기억 없음」일 뿐이다.
  }
}

/* ── 패널 펼침 ───────────────────────────────────────────────────────── */

export const TRADING_PANELS_KEY = "gh-radar:trading-panels";

export type SharedPanelTab = "unfilled" | "holdings" | "log";

export interface TradingPanelsPref {
  /** VI 스트립 펼침. */
  vi?: boolean;
  /** 돌파 스트립 펼침. */
  breakout?: boolean;
  /** 하단 공용 패널 탭. */
  sharedTab?: SharedPanelTab;
  /** 하단 공용 패널 접힘(폰 밴드). */
  sharedFolded?: boolean;
}

export function readPanelsPref(): TradingPanelsPref {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRADING_PANELS_KEY);
    if (raw === null) return {};
    const p = JSON.parse(raw) as Record<string, unknown> | null;
    if (p === null || typeof p !== "object") return {};
    const out: TradingPanelsPref = {};
    if (typeof p.vi === "boolean") out.vi = p.vi;
    if (typeof p.breakout === "boolean") out.breakout = p.breakout;
    if (p.sharedTab === "unfilled" || p.sharedTab === "holdings" || p.sharedTab === "log") {
      out.sharedTab = p.sharedTab;
    }
    if (typeof p.sharedFolded === "boolean") out.sharedFolded = p.sharedFolded;
    return out;
  } catch {
    return {};
  }
}

/** 한 항목만 고쳐 쓴다 — 나머지 항목은 저장값 그대로. */
export function writePanelsPref(patch: TradingPanelsPref): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readPanelsPref(), ...patch };
    window.localStorage.setItem(TRADING_PANELS_KEY, JSON.stringify(next));
  } catch {
    // 저장 실패가 화면 동작을 막지 않는다.
  }
}
