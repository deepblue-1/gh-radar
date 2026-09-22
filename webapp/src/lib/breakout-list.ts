/**
 * 돌파감지 목록 — **클라 몫** 규칙 (Phase 18 D-14~D-18, TRADE-06).
 *
 * ① ★ 이 모듈은 서버 집합을 **재해석하지 않는다**
 *   76 upsert · 78 전량 교체 · 정렬 · 상한 200 은 relay 리듀서(`use-relay-socket.ts`)가 이미 했다.
 *   여기 있는 것은 gh-trade 정본(`rate-cross-alert.md`)이 **클라 몫**으로 규정한 세 가지뿐이다:
 *     - 하루 1회 알림(「오늘 울린 종목」 집합)
 *     - 임계−2%p 이탈 삭제(`shouldRemoveBreakout`)
 *     - 사용자가 지운 종목(「지운 종목」 집합)
 *   목록을 재정렬하거나, 서버가 뺀 종목을 붙잡거나, 카드를 자동으로 여는 일은 하지 않는다.
 *
 * ② ★ 기기별 기억 — localStorage `{ d, ids }`
 *   `d` 는 KST `yyyyMMdd` 날짜 키, `ids` 는 **ISIN 만**이다(단축코드가 아니라 — 돌파 항목의 유일한
 *   확실한 키). 계좌번호·주문번호·금액은 싣지 않는다(T-18-14). 날짜가 다르면 읽을 때 빈 집합이고
 *   쓸 때 새 날짜로 덮는다 — **별도 리셋 타이머가 없다.**
 *
 * ③ SSR · 저장소 차단 안전
 *   읽기·쓰기 전부 `typeof window` 가드 + try/catch 로 안전 기본값에 수렴하고 throw 하지 않는다
 *   (Safari 프라이빗 모드 · 깨진 JSON). 패턴 정본은 이 파일의 로컬 설정 함수(`readTonePref` 등)다.
 *
 * ④ ★ 타이머를 소유하지 않는다
 *   30초 강조 만료는 호출자가 **목록 전체에 1초 tick 타이머 1개**(강조 행이 있을 때만 가동)로
 *   `isHighlighted` 를 다시 부르는 구조를 전제한다. 행마다 타이머를 걸면 최대 200행에서 200개가 돈다.
 */

import type { RelayRateCrossItem } from "@gh-radar/shared";

/* ── 상수 ─────────────────────────────────────────────────────────────── */

/** 「오늘 울린 종목」 집합 — 하루 1회 알림의 근거. */
export const BREAKOUT_SOUNDED_KEY = "gh-radar:breakout-sounded";
/** 「지운 종목」 집합 — 지우면 그날 재돌파에도 나오지 않는다(D-18). */
export const BREAKOUT_DISMISSED_KEY = "gh-radar:breakout-dismissed";
/** 알림음 토글 `"on" | "off"` (기본 off). */
export const BREAKOUT_TONE_KEY = "gh-radar:breakout-tone";
/** 격자 단 수 `"1" | "2" | "3"` (기본 1). */
export const TRADING_COLS_KEY = "gh-radar:trading-cols";

/** 이탈 삭제 폭(%p) — 행의 임계에서 이만큼 아래로 내려가면 이탈이다. */
export const REMOVE_MARGIN_PCT = 2.0;
/** 무장 전 삭제 유예(ms) — 추가 직후 낡은 체결 한 건이 목록을 지우지 못하게 한다. */
export const ARM_GRACE_MS = 3_000;
/** 신규 강조 지속(ms) — 깜박임 없이 `--new-bg` + 「신규」 배지(D-18). */
export const HIGHLIGHT_MS = 30_000;

export type BreakoutTonePref = "on" | "off";
export type TradingCols = 1 | 2 | 3;

/* ── KST 날짜 키 ──────────────────────────────────────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * KST(UTC+9) 날짜 키 `yyyyMMdd`.
 *
 * 서버의 06:00 거래일 리셋과 **다르다** — 클라는 날짜 키가 정본이다. 00:00~06:00 사이에
 * 기기 집합이 먼저 비는 것은 의도된 차이다(그 시간대에는 돌파가 발화하지 않는다).
 */
export function kstDateKey(now: Date = new Date()): string {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, "0");
  const d = String(k.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/* ── 날짜 키 집합 I/O ─────────────────────────────────────────────────── */

type DatedSet = { d: string; ids: string[] };

/** 날짜 키 집합 읽기. 날짜가 다르거나 저장소가 막혔거나 JSON 이 깨졌으면 **빈 집합**이다. */
export function readDatedSet(key: string, today: string): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw) as Partial<DatedSet> | null;
    if (parsed === null || parsed.d !== today || !Array.isArray(parsed.ids)) return new Set();
    return new Set(parsed.ids.filter((id): id is string => typeof id === "string"));
  } catch {
    // 저장소 차단·깨진 JSON 은 「기억 없음」이다.
    return new Set();
  }
}

/** 날짜 키 집합 쓰기 — 항상 `today` 로 덮는다. 실패는 다음 방문의 「기억 없음」일 뿐이다. */
export function writeDatedSet(key: string, today: string, ids: Iterable<string>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: DatedSet = { d: today, ids: [...new Set(ids)] };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 저장 실패가 화면 동작을 막지 않는다.
  }
}

function addToDatedSet(key: string, isins: readonly string[], today: string): ReadonlySet<string> {
  const next = new Set(readDatedSet(key, today));
  for (const isin of isins) next.add(isin);
  writeDatedSet(key, today, next);
  return next;
}

/** 「오늘 울린 종목」 읽기. */
export function readSoundedSet(today: string = kstDateKey()): ReadonlySet<string> {
  return readDatedSet(BREAKOUT_SOUNDED_KEY, today);
}

/**
 * 「오늘 울린 종목」에 기록하고 갱신된 집합을 돌려준다.
 *
 * ⚠️ **알림음보다 먼저** 부른다 — 순서가 계약이다(D-17). 재생을 먼저 하면 재생 실패 시
 *    기록이 남지 않아 하루 종일 중복 알림이 난다.
 */
export function addSounded(isins: readonly string[], today: string = kstDateKey()): ReadonlySet<string> {
  return addToDatedSet(BREAKOUT_SOUNDED_KEY, isins, today);
}

/** 「지운 종목」 읽기. */
export function readDismissedSet(today: string = kstDateKey()): ReadonlySet<string> {
  return readDatedSet(BREAKOUT_DISMISSED_KEY, today);
}

/** 「지운 종목」에 기록하고 갱신된 집합을 돌려준다. */
export function addDismissed(isins: readonly string[], today: string = kstDateKey()): ReadonlySet<string> {
  return addToDatedSet(BREAKOUT_DISMISSED_KEY, isins, today);
}

/** 알림음 토글. **기본은 꺼짐**이고 SSR·저장소 실패도 꺼짐이다. */
export function readTonePref(): BreakoutTonePref {
  if (typeof window === "undefined") return "off";
  try {
    return window.localStorage.getItem(BREAKOUT_TONE_KEY) === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

/** 알림음 토글 저장 — 이 기기 전용, 서버로 보내지 않는다. */
export function writeTonePref(pref: BreakoutTonePref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, pref);
  } catch {
    // 저장 실패는 다음 방문에 꺼짐으로 읽히는 것뿐이다.
  }
}

/** 격자 단 수. 기본 1 이고 1·2·3 밖 값·실패는 1 로 수렴한다. */
export function readColsPref(): TradingCols {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(TRADING_COLS_KEY);
    return raw === "2" ? 2 : raw === "3" ? 3 : 1;
  } catch {
    return 1;
  }
}

/** 격자 단 수 저장. */
export function writeColsPref(cols: TradingCols): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRADING_COLS_KEY, String(cols));
  } catch {
    // 저장 실패가 화면 동작을 막지 않는다.
  }
}

/* ── 행 상태 ──────────────────────────────────────────────────────────── */

/**
 * 행마다 클라가 붙들고 있는 기록. relay 항목에는 없는 값이라 호출자가 렌더 사이에 보관한다.
 *  - `addedAt` : 첫 등재 시각(ms). 76 이 다시 와도 **첫 등재 값을 유지**한다.
 *  - `armed`   : 등재 **뒤** 임계 이상을 한 번이라도 관측했는가. 한 번 무장하면 풀리지 않는다.
 *  - `silent`  : 78 스냅샷 유래 — 무음·무강조이면서 「울린 종목」 기록 대상이다.
 */
export interface BreakoutMeta {
  addedAt: number;
  armed: boolean;
  silent: boolean;
}

/** 화면 행. relay 항목 원값 + 클라 기록 + 표시 파생값. */
export interface BreakoutRow extends RelayRateCrossItem {
  /** `isin|exchange` — relay 리듀서의 원소 동일성 축과 같다. */
  key: string;
  addedAt: number;
  armed: boolean;
  silent: boolean;
  /** 카드가 있는 종목 — 「거래중」 표식. */
  trading: boolean;
  /** 강조 만료 시각(ms). 무음 행은 `null`(강조 없음). */
  highlightUntil: number | null;
}

/** 행 키 — relay 리듀서와 같은 `isin`+`exchange` 축. */
export function breakoutKey(item: Pick<RelayRateCrossItem, "isin" | "exchange">): string {
  return `${item.isin}|${item.exchange}`;
}

/**
 * 행의 등락률(%) — `(현재가 − 기준가) × 100 ÷ 기준가`. 기준가가 없는 행만 76 등락률로 폴백한다
 * (gh-trade `rate-cross-alert.md` ③ 이탈 판정).
 */
function rateOf(row: Pick<RelayRateCrossItem, "basePrice" | "changeRate">, currentPrice: number): number {
  if (!(row.basePrice > 0)) return row.changeRate;
  return ((currentPrice - row.basePrice) * 100) / row.basePrice;
}

/**
 * 돌파 행을 지워야 하는가 — **삭제 판정의 유일 지점**이다. 표시와 삭제 가드가 이 함수를 쓴다.
 *
 *  ① `currentPrice === undefined`(구독 실패·상한 초과로 현재가를 모름)면 **무조건 false**.
 *     모르는 값으로 지우는 것은 사용자에게 없는 사실을 말하는 것이다 — 오래된 76 가격을 보이는 편이 낫다.
 *  ② `등락률 < 행의 임계 − REMOVE_MARGIN_PCT` 이고 `(무장 ∨ 추가 후 ARM_GRACE_MS 경과)` 일 때만 참.
 *
 * ⚠️ 무장/유예 조건은 CONTEXT D-16 에는 없고 gh-trade 정본(`rate-cross-alert.md` ③)에는 있다.
 *    빼면 돌파 직후 들어온 **낡은 체결 한 건**이 행을 즉시 지우고, 다음 76 에 다시 뜨는 깜빡임이 난다
 *    (RESEARCH Pitfall 6).
 */
export function shouldRemoveBreakout(
  row: Pick<BreakoutRow, "thresholdPct" | "basePrice" | "changeRate" | "armed" | "addedAt">,
  currentPrice: number | undefined,
  now: number = Date.now(),
): boolean {
  if (currentPrice === undefined) return false;
  const below = rateOf(row, currentPrice) < row.thresholdPct - REMOVE_MARGIN_PCT;
  if (!below) return false;
  return row.armed || now - row.addedAt >= ARM_GRACE_MS;
}

/**
 * 클라 기록 갱신 — 새 종목은 `now` 로 등재하고, 빠진 종목의 기록은 버리고, 관측가로 무장한다.
 *
 * `silent` 는 **호출자가** 정한다 — relay 컨텍스트는 항목이 76 으로 왔는지 78 로 왔는지를 싣지 않으므로,
 * 첫 채움(인증 직후 스냅샷)·전량 교체로 들어온 새 종목은 `silent: true` 로 넘긴다.
 * `priceOf` 가 `undefined` 를 주는 종목(현재가 모름)은 무장하지 않는다.
 */
export function trackBreakoutMeta(
  prev: ReadonlyMap<string, BreakoutMeta>,
  items: readonly RelayRateCrossItem[],
  opts: { now: number; silent: boolean; priceOf?: (isin: string) => number | undefined },
): Map<string, BreakoutMeta> {
  const next = new Map<string, BreakoutMeta>();
  for (const it of items) {
    const key = breakoutKey(it);
    const old = prev.get(key);
    const meta: BreakoutMeta = old ?? { addedAt: opts.now, armed: false, silent: opts.silent };
    let armed = meta.armed;
    // 무장은 **등재 뒤** 관측만 센다 — 등재를 일으킨 76 자체는 관측이 아니다(그러면 유예가 무의미).
    if (!armed && old !== undefined) {
      const price = opts.priceOf?.(it.isin);
      if (price !== undefined && rateOf(it, price) >= it.thresholdPct) armed = true;
    }
    next.set(key, armed === meta.armed ? meta : { ...meta, armed });
  }
  return next;
}

/**
 * relay `rateCrossItems` → 화면 행.
 *
 * 서버 순서를 **그대로** 유지한다(정렬·필터 재구현 금지). 하는 일은 넷뿐이다 — 지운 종목(ISIN) 빼기,
 * 이탈로 지운 키(`removed`) 빼기, 카드 있는 종목에 「거래중」 표식, 강조 만료 시각 계산.
 * 기록이 없는 종목(호출자가 아직 추적 전)은 등재 시점을 모르므로 **무음·무강조**로 둔다.
 * 강조 만료는 호출자의 1초 tick 타이머 1개가 `isHighlighted` 로 다시 판정한다(파일 머리 ④).
 */
export function breakoutRowsFrom(
  items: readonly RelayRateCrossItem[],
  opts: {
    dismissed: ReadonlySet<string>;
    cards: ReadonlySet<string>;
    meta: ReadonlyMap<string, BreakoutMeta>;
    removed?: ReadonlySet<string>;
  },
): BreakoutRow[] {
  const rows: BreakoutRow[] = [];
  for (const it of items) {
    if (opts.dismissed.has(it.isin)) continue;
    const key = breakoutKey(it);
    if (opts.removed?.has(key)) continue;
    const meta = opts.meta.get(key) ?? { addedAt: 0, armed: false, silent: true };
    rows.push({
      ...it,
      key,
      addedAt: meta.addedAt,
      armed: meta.armed,
      silent: meta.silent,
      trading: opts.cards.has(it.isin),
      highlightUntil: meta.silent ? null : meta.addedAt + HIGHLIGHT_MS,
    });
  }
  return rows;
}

/** 신규 강조 중인가 — 깜박임 없이 `now < highlightUntil` 동안만. */
export function isHighlighted(row: Pick<BreakoutRow, "highlightUntil">, now: number): boolean {
  return row.highlightUntil !== null && now < row.highlightUntil;
}

/**
 * 「오늘 울린 종목」에 없는 행 → 기록 대상(`record`)과 소리 대상(`sound`).
 *
 * 78 스냅샷 행(`silent`)은 기록 대상이지만 소리 대상이 아니다. 호출자는 **`addSounded(record)` 를
 * 먼저** 부르고, 토글이 켜져 있고 `sound` 가 비어 있지 않을 때만 그 다음 알림음을 낸다(D-17).
 */
export function newBreakoutsToAnnounce(
  rows: readonly BreakoutRow[],
  sounded: ReadonlySet<string>,
): { record: string[]; sound: string[] } {
  const record: string[] = [];
  const sound: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (sounded.has(r.isin) || seen.has(r.isin)) continue;
    seen.add(r.isin);
    record.push(r.isin);
    if (!r.silent) sound.push(r.isin);
  }
  return { record, sound };
}
