/**
 * 트레이딩 작업대 배치 기억 (quick-260923-lyt) — 다른 메뉴에 갔다 와도 마지막 배치 그대로.
 *
 * ① 무엇을 기억하나
 *   - 카드 목록 — 순서 · 펼침 · 거래소 · 계좌 · 추가 시점의 종목명/코드. 전략 **값**은 싣지 않는다
 *     (정본은 서버다). 카드 id 도 싣지 않는다 — 복원 때 새로 발급한다.
 *   - 「본 등록 전략 키」(`seen`) — 사용자가 ✕ 로 닫은 등록 전략 카드가 돌아왔을 때 다시 생기지 않게 한다.
 *     등록 전략 목록을 확정으로 안 뒤(64 스냅샷)에는 지금 등록된 키만 남겨 무한히 자라지 않는다.
 *   - 패널 펼침 — VI · 돌파 스트립 · 하단 공용 패널 탭/접힘.
 *   - 계좌칸(제목 옆 AccountPill) — 사용자가 **직접 고른** 계좌 하나(quick-261007-h76). 자동 선택은 싣지 않는다.
 *
 * ② 어디에
 *   localStorage. 카드 목록은 **사용자별 키**다(`…:{userId}`) — 같은 기기에서 다른 계정이 로그인하면
 *   남의 카드가 보이면 안 된다. 계좌번호가 들어가지만 이 기기 브라우저 밖으로 나가지 않는다.
 *   패널 펼침은 화면 취향이라 기기 공용 키 하나다. 계좌칸은 카드 목록과 따로 둔 사용자별 키다
 *   (`gh-radar:trading-account:{userId}`).
 *   /me 계좌 칩 선택(Phase 32 D-20)은 작업대 계좌칸과 또 따로 둔 사용자별 키다(`gh-radar:me-account:{userId}`).
 *
 * ③ 안전
 *   읽기·쓰기 전부 `typeof window` 가드 + try/catch — 저장소가 막히거나 JSON 이 깨지면 「기억 없음」이다.
 *   읽기는 반드시 **마운트 후**에 한다(SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다).
 */

import type { RelayAccount, RelayExchange } from "@gh-radar/shared";

/* ── 카드 목록 ───────────────────────────────────────────────────────── */

export const TRADING_LAYOUT_KEY_PREFIX = "gh-radar:trading-layout:";

/**
 * 페이지(`wb`) 폰 밴드 상한(미만) — 공용 패널 sticky 전환 · 주문로그 줄 탭 펼침용. 카드(`lc`) 첫 경계 685 와 다른
 * 값이다(quick-260928-q5e 는 lc 만 내렸다 · globals.css §2.2b 「이 표를 재는 컨테이너는 둘이다」).
 * 작업대(`trading-workbench.tsx` ⑤)와 주문로그 창 분리 페이지(25-10 · UI-SPEC R5)가 **이 상수 하나**로 판정한다 —
 * 창 분리 페이지가 작업대 모듈을 번들에 끌어오지 않도록 가벼운 이 모듈에 둔다.
 */
export const WB_PHONE_BAND_BELOW = 700;

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

/* ── 계좌칸 (quick-261007-h76) ───────────────────────────────────────── */

/**
 * 계좌칸 선택 키 — 사용자별(`…:{userId}`). 카드 배치 키와 **따로** 둔다: 배치 저장은 카드가 바뀔 때만
 * 돌고, 계좌칸 자동 선택(accounts[0])이 사용자가 고른 저장값을 덮으면 안 되기 때문이다.
 * 사용자 증상: 「트레이딩에서 계좌를 고르고 다른 페이지에 갔다 오면 자꾸 다른 계좌로 바뀌어 있다」.
 */
export const TRADING_ACCOUNT_KEY_PREFIX = "gh-radar:trading-account:";

const MAX_ACCOUNT_NO_LEN = 32;

function accountKey(userId: string): string {
  return `${TRADING_ACCOUNT_KEY_PREFIX}${userId}`;
}

/** 저장된 계좌칸 계좌. 없거나 깨졌으면 `null`(= 기억 없음 — 종전 동작 accounts[0]). */
export function readTradingAccount(userId: string): string | null {
  if (typeof window === "undefined" || userId === "") return null;
  try {
    const raw = window.localStorage.getItem(accountKey(userId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; accountNo?: unknown } | null;
    if (parsed === null || typeof parsed !== "object" || parsed.v !== 1) return null;
    const a = parsed.accountNo;
    if (typeof a !== "string" || a.length === 0 || a.length > MAX_ACCOUNT_NO_LEN) return null;
    return a;
  } catch {
    return null;
  }
}

/** 사용자가 **직접 고른** 계좌만 쓴다(자동 선택은 부르지 않는다). */
export function writeTradingAccount(userId: string, accountNo: string): void {
  if (typeof window === "undefined" || userId === "" || accountNo === "") return;
  try {
    window.localStorage.setItem(accountKey(userId), JSON.stringify({ v: 1, accountNo }));
  } catch {
    // 저장 실패는 다음 방문의 「기억 없음」일 뿐이다.
  }
}

/**
 * 계좌칸이 가리킬 계좌(순수). 규칙 순서:
 *   1. accounts 가 비면 current 그대로(아직 relay 계좌를 모른다).
 *   2. saved 가 accounts 에 있으면 saved — relay 병합 프레임은 KB 세션 계좌를 **먼저** 넣으므로 저장 계좌
 *      (예: 교보)가 나중 프레임에 도착할 수 있다. 그때 저장 계좌로 올린다(KB 로 덮여 고정되지 않는다).
 *   3. current 가 "" 이면 accounts[0](종전 자동 선택).
 *   4. 그 밖은 current — 이미 고른 계좌는 accounts[0] 이 바뀌어도 덮지 않는다(종전 규칙 유지).
 * 이번 마운트에서 사용자가 직접 고르면 호출부가 saved 도 그 값으로 바꾸므로 2 가 사용자 선택을 덮지 않는다.
 */
export function pillAccountOf(
  current: string,
  accounts: readonly Pick<RelayAccount, "accountNo">[],
  saved: string | null,
): string {
  if (accounts.length === 0) return current;
  if (saved !== null && accounts.some((a) => a.accountNo === saved)) return saved;
  if (current === "") return accounts[0].accountNo;
  return current;
}

/* ── /me 계좌 칩 (Phase 32 D-20) ─────────────────────────────────────── */

/**
 * /me 계좌 칩 선택 키 — 사용자별 · 기기별(`…:{userId}`). 작업대 계좌칸 키(`TRADING_ACCOUNT_KEY_PREFIX`)와 **따로**
 * 둔다: /me 에서 칩을 고른다고 작업대 계좌가 바뀌면 안 된다(D-20 「작업대와 따로 기억」). 값 모양 · 가드는 계좌칸과 같다.
 */
export const ME_ACCOUNT_KEY_PREFIX = "gh-radar:me-account:";

function meAccountKey(userId: string): string {
  return `${ME_ACCOUNT_KEY_PREFIX}${userId}`;
}

/** 저장된 /me 칩 계좌. 없거나 깨졌으면 `null`(= 기억 없음 — 아래 `meAccountOf` 의 다음 순서로 간다). */
export function readMeAccount(userId: string): string | null {
  if (typeof window === "undefined" || userId === "") return null;
  try {
    const raw = window.localStorage.getItem(meAccountKey(userId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; accountNo?: unknown } | null;
    if (parsed === null || typeof parsed !== "object" || parsed.v !== 1) return null;
    const a = parsed.accountNo;
    if (typeof a !== "string" || a.length === 0 || a.length > MAX_ACCOUNT_NO_LEN) return null;
    return a;
  } catch {
    return null;
  }
}

/** 사용자가 칩을 **직접 고른** 경우만 쓴다(기본 선택은 부르지 않는다). */
export function writeMeAccount(userId: string, accountNo: string): void {
  if (typeof window === "undefined" || userId === "" || accountNo === "") return;
  try {
    window.localStorage.setItem(meAccountKey(userId), JSON.stringify({ v: 1, accountNo }));
  } catch {
    // 저장 실패는 다음 방문의 「기억 없음」일 뿐이다.
  }
}

/** /me 계좌 칩 한 개 — `accounts[]` 밖 계좌(행에만 있는 계좌)는 `name: ""` · 서버키 없음. */
export interface MeAccountChoice {
  accountNo: string;
  name: string;
  serverKey?: string;
}

/**
 * /me 계좌 칩 목록 = `accounts[]` 순 그대로 + 뒤에 `extraAccountNos`(전략 · 주문 행의 계좌) 중 목록에 없는 것을
 * 처음 본 순서로(번호만). 빈 문자열은 버린다(RESEARCH Pitfall 10 — 행에만 있는 계좌도 고를 수 있어야 그 행이 보인다).
 */
export function meAccountChoicesOf(
  accounts: readonly RelayAccount[],
  extraAccountNos: Iterable<string>,
): MeAccountChoice[] {
  const out: MeAccountChoice[] = [];
  const seen = new Set<string>();
  for (const a of accounts) {
    if (a.accountNo === "" || seen.has(a.accountNo)) continue;
    seen.add(a.accountNo);
    const c: MeAccountChoice = { accountNo: a.accountNo, name: a.name ?? "" };
    if (a.serverKey !== undefined && a.serverKey !== "") c.serverKey = a.serverKey;
    out.push(c);
  }
  for (const no of extraAccountNos) {
    if (no === "" || seen.has(no)) continue;
    seen.add(no);
    out.push({ accountNo: no, name: "" });
  }
  return out;
}

/**
 * /me 칩이 가리킬 계좌(순수). 규칙 순서:
 *   1. choices 가 비면 current 그대로(아직 계좌를 모른다).
 *   2. saved(이 화면 기억값)가 choices 안이면 saved — 기억 계좌가 나중 프레임에 도착해도 그 칩으로 올라간다.
 *   3. workbenchSaved(작업대 계좌칸 기억)가 choices 안이면 그것 — 기본값 원천일 뿐 여기서 쓰지 않는다.
 *   4. current 가 choices 안이면 current(이미 고른 값 유지).
 *   5. 그 밖은 첫 칩 — 기억값이 목록 밖이 되면 알림 없이 첫 칩으로 떨어진다.
 * 칩을 고르면 호출부가 saved 도 그 값으로 바꾸므로 2 가 사용자 선택을 지킨다.
 */
export function meAccountOf(
  choices: readonly Pick<MeAccountChoice, "accountNo">[],
  saved: string | null,
  workbenchSaved: string | null,
  current: string,
): string {
  if (choices.length === 0) return current;
  const has = (no: string | null): no is string => no !== null && choices.some((c) => c.accountNo === no);
  if (has(saved)) return saved;
  if (has(workbenchSaved)) return workbenchSaved;
  if (has(current)) return current;
  return choices[0].accountNo;
}

/* ── 패널 펼침 ───────────────────────────────────────────────────────── */

export const TRADING_PANELS_KEY = "gh-radar:trading-panels";

/**
 * 하단 공용 패널 탭 값 — **한 정본**(Phase 25-07 · RESEARCH Pitfall 12). `SharedPanelTab` 타입 · `readPanelsPref` 가드 ·
 * `shared-panels.tsx` 의 `SharedTab` 이 전부 여기서 파생된다 — 세 곳을 따로 나열하면 새 탭(주문로그)이 저장은 되고
 * 새로고침 복원에서 조용히 버려진다. 순서는 탭 트리거 순서와 같다(미체결 · 잔고 · 주문로그 · 전략 로그).
 */
export const SHARED_PANEL_TABS = ["unfilled", "holdings", "orderlog", "log"] as const;

export type SharedPanelTab = (typeof SHARED_PANEL_TABS)[number];

export function isSharedPanelTab(v: unknown): v is SharedPanelTab {
  return typeof v === "string" && (SHARED_PANEL_TABS as readonly string[]).includes(v);
}

export interface TradingPanelsPref {
  /** VI 스트립 펼침. */
  vi?: boolean;
  /** 돌파 스트립 펼침. */
  breakout?: boolean;
  /** 매집 스트립 펼침(quick-261018-rfy). */
  accum?: boolean;
  /** 하단 공용 패널 탭(미체결 · 잔고 · 주문로그 · 전략 로그). */
  sharedTab?: SharedPanelTab;
  /** 하단 공용 패널 접힘(폰 밴드). */
  sharedFolded?: boolean;
  /**
   * 작업대 카드 탭 영역(정보 · 미체결 · 잔고 · 로그) 접힘 — 새로 마운트되는 카드의 기본값
   * (quick-260925-ptw). 이미 떠 있는 카드는 자기 값을 유지한다.
   */
  cardTabsFolded?: boolean;
  /**
   * 주문로그 「상한가 특징」 체크(Phase 28 D-07 · D-18) — 세 주문로그 표면(공용 패널 · 카드 주문로그 팝업 ·
   * 창 분리 `/trading/order-log`)이 같은 값을 공유한다. 기본 꺼짐(kind 15 줄 숨김).
   */
  orderLogLimitFeature?: boolean;
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
    if (typeof p.accum === "boolean") out.accum = p.accum;
    if (isSharedPanelTab(p.sharedTab)) out.sharedTab = p.sharedTab;
    if (typeof p.sharedFolded === "boolean") out.sharedFolded = p.sharedFolded;
    if (typeof p.cardTabsFolded === "boolean") out.cardTabsFolded = p.cardTabsFolded;
    if (typeof p.orderLogLimitFeature === "boolean") out.orderLogLimitFeature = p.orderLogLimitFeature;
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
