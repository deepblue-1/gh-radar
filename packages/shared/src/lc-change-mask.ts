/**
 * quick-261030-kpg — 상따 `SetLimitChaser.change_mask` 비트 표 한 벌(gh-trade Phase 44).
 *
 * - 정본 = gh-trade `server/docs/protocol.md` 「SetLimitChaser change_mask 비트 표 (Phase 44)」 ·
 *   기계 판 `server/src/trade/strategy/LimitChaserChangeMask.h` `kMaskFields[]`(gh-trade `55e62638` ·
 *   인계 노트 `docs/inbox/from-gh-trade/261030-limitchaser-change-mask.md` ②).
 * - 규칙: **append-only · 재사용 · 재배치 금지 · 새 칸은 50부터.** 64비트가 차면 gh-trade 가 `change_mask_hi`
 *   (id 86 · vt 176)를 append 하고 이 모듈도 그때 확장한다.
 * - **배열 인덱스 = 비트.** `key` = `RelayLimitChaserInput` 의 camelCase 키, `wire` = fbs snake 이름.
 * - 웹은 이 표의 `key` 이름만 보낸다(lc.set `changed`). uint64 마스크(짝 수량 비트 포함)는 relay 가 만든다
 *   (gh-trade D-10 — `relay/src/dma/lc-change-mask.ts`).
 * - 대조 테스트: `relay/src/dma/__tests__/lc-change-mask.test.ts`(노트 ② 리터럴 + gh-trade `.h` 파싱).
 *
 * 순환 금지 — `relay.ts` 는 `import type` 으로만 가져온다.
 */

import type { RelayLimitChaserInput } from "./relay";

export const LC_CHANGE_MASK_FIELDS = [
  // --- 매수 공통 0-2 ---
  { key: "buyEnabled", wire: "buy_enabled" },
  { key: "buyOrderPrice", wire: "buy_order_price" },
  { key: "buyWatchPrice", wire: "buy_watch_price" },
  // --- 선매수 3-13 ---
  { key: "preBuyEnabled", wire: "pre_buy_enabled" },
  { key: "buyOrderAmount", wire: "buy_order_amount" },
  { key: "buyOrderQty", wire: "buy_order_qty" },
  { key: "buyWatchAmount", wire: "buy_watch_amount" },
  { key: "buyWatchQty", wire: "buy_watch_qty" },
  { key: "buyTradeQtyEnabled", wire: "buy_trade_qty_enabled" },
  { key: "buyMinTradeAmount", wire: "buy_min_trade_amount" },
  { key: "buyMinTradeQty", wire: "buy_min_trade_qty" },
  { key: "sweepEnabled", wire: "sweep_enabled" },
  { key: "sweepMinTickCount", wire: "sweep_min_tick_count" },
  { key: "sweepWatchPrice", wire: "sweep_watch_price" },
  // --- 줄매수 14-22 ---
  { key: "extraBuyEnabled", wire: "extra_buy_enabled" },
  { key: "extraBuyOrderAmount", wire: "extra_buy_order_amount" },
  { key: "extraBuyOrderQty", wire: "extra_buy_order_qty" },
  { key: "extraBuyMinAmount", wire: "extra_buy_min_amount" },
  { key: "extraBuyMinQty", wire: "extra_buy_min_qty" },
  { key: "extraBuyMaxAmount", wire: "extra_buy_max_amount" },
  { key: "extraBuyMaxQty", wire: "extra_buy_max_qty" },
  { key: "extraBuyBurstRelease", wire: "extra_buy_burst_release" },
  { key: "extraBuyAuto", wire: "extra_buy_auto" },
  // --- 후매수 23-29 ---
  { key: "postBuyEnabled", wire: "post_buy_enabled" },
  { key: "postBuyOrderAmount", wire: "post_buy_order_amount" },
  { key: "postBuyOrderQty", wire: "post_buy_order_qty" },
  { key: "postBuyReboundPct", wire: "post_buy_rebound_pct" },
  { key: "postBuyFloorAmount", wire: "post_buy_floor_amount" },
  { key: "postBuyFloorQty", wire: "post_buy_floor_qty" },
  { key: "postBuyAuto", wire: "post_buy_auto" },
  // --- 매도 30-40 ---
  { key: "sellEnabled", wire: "sell_enabled" },
  { key: "sellOrderPrice", wire: "sell_order_price" },
  { key: "sellWatchPrice", wire: "sell_watch_price" },
  { key: "sellWatchAmount", wire: "sell_watch_amount" },
  { key: "sellWatchQty", wire: "sell_watch_qty" },
  { key: "sellOrderRatio", wire: "sell_order_ratio" },
  { key: "sellQtyTrackEnabled", wire: "sell_qty_track_enabled" },
  { key: "sellQtyTrackRatio", wire: "sell_qty_track_ratio" },
  { key: "sellTradeQtyEnabled", wire: "sell_trade_qty_enabled" },
  { key: "sellMinTradeAmount", wire: "sell_min_trade_amount" },
  { key: "sellMinTradeQty", wire: "sell_min_trade_qty" },
  // --- 취소 41-45 ---
  { key: "cancelQtyEnabled", wire: "cancel_qty_enabled" },
  { key: "cancelWatchAmount", wire: "cancel_watch_amount" },
  { key: "cancelWatchQty", wire: "cancel_watch_qty" },
  { key: "cancelTradeEnabled", wire: "cancel_trade_enabled" },
  { key: "cancelQtyTrackEnabled", wire: "cancel_qty_track_enabled" },
  // --- 자동매도 46-49 ---
  { key: "autoSellEnabled", wire: "auto_sell_enabled" },
  { key: "autoSellStartCond", wire: "auto_sell_start_cond" },
  { key: "autoSellRatioPct", wire: "auto_sell_ratio_pct" },
  { key: "autoSellMethod", wire: "auto_sell_method" },
  // 50~63 예약 — 새 칸은 여기 아래로 append
] as const satisfies readonly { key: keyof RelayLimitChaserInput; wire: string }[];

/** 비트 표에 행이 있는 cfg 키 — lc.set `changed` 원소 타입. */
export type LcChangeMaskField = (typeof LC_CHANGE_MASK_FIELDS)[number]["key"];

const LC_CHANGE_MASK_KEY_SET: ReadonlySet<string> = new Set(LC_CHANGE_MASK_FIELDS.map((f) => f.key));

/** `name` 이 비트 표의 `key` 인가(relay 의 모르는 이름 판정 · webapp 의 비트 밖 폼 키 거르기). */
export function isLcChangeMaskField(name: string): name is LcChangeMaskField {
  return LC_CHANGE_MASK_KEY_SET.has(name);
}
