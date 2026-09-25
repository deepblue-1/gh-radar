/**
 * 상따 설정 필드 스펙 — 그룹·행 순서 · 라벨 · 단위 · 설명 · 옛 id · 게이트 매핑의 **단일 원천**
 * (Phase 20 · 20-04).
 *
 * 렌더(`limit-chaser-form.tsx`) · 시트 문구(D-23 「{필드명} 적용」 · 설명) · Tab 순서(20-05) · e2e
 * `data-lc-field` 가 모두 여기서 온다. 같은 목록을 다른 곳에 다시 적지 않는다 — 둘이 되면 갈라진다.
 *
 * ★ 필드 목록·의미는 기존 폼 그대로다(D-01 · D-19) — 바뀐 것은 **순서와 모양**뿐이다.
 *   순서: 매수 쪽 = 가격 → 매수주문 → 한방체결 · 매도 쪽 = 가격 → 매도주문 → 매수취소(맨 아래).
 * ★ 매수취소 그룹 스위치 = `cancelQtyEnabled`(취소잔량 켜기, D-21). 스위치가 꺼져도 체결·잔량추적
 *   체크는 켤 수 있고(quick-260912-u58 ④) 그래서 이 그룹만 `dimWhenOff: false` 다. 무장 판정은
 *   `lib/limit-chaser.ts` 그대로다.
 * ★ 체크가 달린 필드는 체크 행(D-22) — 「○ 라벨 ─ 값 ›」(`checkValue`) 또는 값 없는 「○ 라벨」(`check`).
 * ★ 옛 입력 id(`lc-buy-watch-qty` …)는 **행 식별자이자 인라인 입력 id** 로 그대로 산다 — e2e 와
 *   레이블 연결이 그 이름을 기억한다.
 * ★ 라벨·단위·설명은 UI-SPEC 「시트 제목 · 설명(필드별)」 표 원문이다.
 */

import type { LimitChaserFormValues } from '@/lib/limit-chaser';
import { rangeIssueText, type PadUnit } from '@/lib/numpad';

/** 값(숫자) 필드 — 시트/인라인으로 편집한다. */
export type LcNumField = Extract<
  keyof LimitChaserFormValues,
  | 'buyOrderPrice'
  | 'buyOrderAmount'
  | 'buyWatchPrice'
  | 'buyWatchQty'
  | 'buyMinTradeQty'
  | 'sweepMinTickCount'
  | 'sweepWatchPrice'
  | 'sellOrderPrice'
  | 'sellOrderRatio'
  | 'sellWatchPrice'
  | 'sellWatchQty'
  | 'sellQtyTrackRatio'
  | 'sellMinTradeQty'
  | 'cancelWatchQty'
>;
/** 체크 필드 — 누르면 즉시 반영(D-04). */
export type LcBoolField = Extract<
  keyof LimitChaserFormValues,
  'buyTradeQtyEnabled' | 'sellQtyTrackEnabled' | 'sellTradeQtyEnabled' | 'cancelTradeEnabled' | 'cancelQtyTrackEnabled'
>;
/** 상따 행 단위 — 키패드 단위에서 수동주문 전용 「회」를 뺀 것. */
export type LcUnit = Exclude<PadUnit, '회'>;

/**
 * 필드 범위(포함) — relay `lc.set` 스키마(`relay/src/ws/protocol.ts` `RelayLcSetSchema`)가 범위를 두는
 * 필드만 적는다. **값은 relay 스키마와 같아야 한다** — relay 는 스키마 위반 프레임을 받으면 WebSocket
 * 연결을 통째로 끊는다(`fanout.ts` `#reject` → `ws.close(BAD_MESSAGE)`). 그러면 모든 카드의 시세·에코가
 * 멈추고 같은 소켓의 수동주문은 결과 모름 잠금에 걸린다(20-REVIEW CR-01).
 *   - `sellOrderRatio`    `z.number().int().min(1).max(100)`
 *   - `sellQtyTrackRatio` `z.number().int().min(1).max(90)`
 *   - `sweepMinTickCount` `UByteSchema` = `min(0).max(255)`
 * 나머지 값 필드(가격·수량·금액)는 `UIntSchema`(0 이상 정수) — 키패드가 음수·소수를 만들 수 없어 범위가 없다.
 */
export interface LcRange {
  min: number;
  max: number;
}

export type LcRowSpec =
  | { kind: 'value'; field: LcNumField; id: string; label: string; unit: LcUnit; desc: string; range?: LcRange }
  | {
      kind: 'checkValue';
      check: LcBoolField;
      checkId: string;
      field: LcNumField;
      id: string;
      label: string;
      unit: LcUnit;
      desc: string;
      range?: LcRange;
    }
  | { kind: 'check'; check: LcBoolField; checkId: string; label: string }
  | { kind: 'watch' }
  | { kind: 'derived'; label: '잔량추적 기준선' };

/** 그룹 스위치 4개가 여닫는 게이트. */
export type LcGate = 'buyEnabled' | 'sweepEnabled' | 'sellEnabled' | 'cancelQtyEnabled';
/** 그룹 상태 문구 키 — `card-body.tsx` `cardGroupStatusOf` 의 네 문구. */
export type LcStatusKey = 'buy' | 'sweep' | 'sell' | 'cancel';

export interface LcGroupSpec {
  /** `data-slot="lc-group-{slot}"` — e2e 앵커(기존 그대로). */
  slot: 'buy-price' | 'buy' | 'sweep' | 'sell-price' | 'sell' | 'cancel';
  /** 그룹 제목 — 없으면 헤더 줄이 없다(가격 섹션). */
  title?: '매수주문' | '한방체결' | '매도주문' | '매수취소';
  /** 헤더 없는 섹션의 접근성 이름. */
  ariaLabel?: string;
  /** 그룹 툴팁(`<section title>`) — 화면에는 그리지 않는다. */
  hint?: string;
  gate?: LcGate;
  /**
   * 이 그룹의 행이 따르는 상태 문구 — 시트 「감시 중 — 적용하면 바로 반영돼요」 판정(D-05)에 쓴다.
   * ★ 가격 섹션은 헤더가 없지만 매수가격·주문금액은 **매수주문**의 값이고 매도가격·매도비율은
   *   **매도주문**의 값이다 — 그래서 각자 그 그룹의 키를 갖는다(헤더는 `title` 이 있을 때만 그린다).
   */
  statusKey?: LcStatusKey;
  /** 스위치가 꺼지면 행을 흐리게(opacity .45) 하는가 — 편집은 막지 않는다(D-01). */
  dimWhenOff: boolean;
  rows: readonly LcRowSpec[];
}

export const LC_BUY_GROUPS: readonly LcGroupSpec[] = [
  {
    slot: 'buy-price',
    ariaLabel: '매수 가격 설정',
    statusKey: 'buy',
    dimWhenOff: false,
    rows: [
      { kind: 'value', field: 'buyOrderPrice', id: 'lc-buy-order-price', label: '매수가격', unit: '원', desc: '넣을 매수 주문 가격이에요' },
      { kind: 'value', field: 'buyOrderAmount', id: 'lc-buy-order-amount', label: '주문금액', unit: '만원', desc: '한 번에 넣을 금액이에요' },
    ],
  },
  {
    slot: 'buy',
    title: '매수주문',
    gate: 'buyEnabled',
    statusKey: 'buy',
    hint: '비교가격의 감시잔량이 위 값 이하로 줄면 매수 발주',
    dimWhenOff: true,
    rows: [
      { kind: 'value', field: 'buyWatchPrice', id: 'lc-buy-watch-price', label: '비교가격', unit: '원', desc: '이 가격의 잔량을 지켜봐요' },
      { kind: 'watch' },
      { kind: 'value', field: 'buyWatchQty', id: 'lc-buy-watch-qty', label: '잔량', unit: '주', desc: '잔량이 이 값보다 줄면 매수를 넣어요' },
      {
        kind: 'checkValue',
        check: 'buyTradeQtyEnabled',
        checkId: 'lc-buy-trade',
        field: 'buyMinTradeQty',
        id: 'lc-buy-min-trade-qty',
        label: '체결',
        unit: '주',
        desc: '체결이 이 값 이상이면 매수를 넣어요',
      },
    ],
  },
  {
    slot: 'sweep',
    title: '한방체결',
    gate: 'sweepEnabled',
    statusKey: 'sweep',
    dimWhenOff: true,
    rows: [
      {
        kind: 'value',
        field: 'sweepMinTickCount',
        id: 'lc-sweep-tick',
        label: '호가변경',
        unit: '건',
        desc: '호가가 이만큼 바뀌면 한 번에 체결해요',
        range: { min: 0, max: 255 },
      },
      { kind: 'value', field: 'sweepWatchPrice', id: 'lc-sweep-watch-price', label: '한방가격', unit: '원', desc: '한방 체결 가격이에요' },
    ],
  },
];

export const LC_SELL_GROUPS: readonly LcGroupSpec[] = [
  {
    slot: 'sell-price',
    ariaLabel: '매도 가격 설정',
    statusKey: 'sell',
    dimWhenOff: false,
    rows: [
      { kind: 'value', field: 'sellOrderPrice', id: 'lc-sell-order-price', label: '매도가격', unit: '원', desc: '넣을 매도 주문 가격이에요' },
      {
        kind: 'value',
        field: 'sellOrderRatio',
        id: 'lc-sell-order-ratio',
        label: '매도비율',
        unit: '%',
        desc: '보유 수량 중 매도할 비율이에요',
        range: { min: 1, max: 100 },
      },
    ],
  },
  {
    slot: 'sell',
    title: '매도주문',
    gate: 'sellEnabled',
    statusKey: 'sell',
    dimWhenOff: true,
    rows: [
      { kind: 'value', field: 'sellWatchPrice', id: 'lc-sell-watch-price', label: '비교가격', unit: '원', desc: '이 가격의 잔량을 지켜봐요' },
      { kind: 'value', field: 'sellWatchQty', id: 'lc-sell-watch-qty', label: '호가잔량', unit: '주', desc: '잔량이 이 값보다 줄면 매도를 넣어요' },
      {
        kind: 'checkValue',
        check: 'sellQtyTrackEnabled',
        checkId: 'lc-sell-qty-track',
        field: 'sellQtyTrackRatio',
        id: 'lc-sell-qty-track-ratio',
        label: '잔량추적',
        unit: '%',
        desc: '처음 잔량 대비 비율로 추적해요',
        range: { min: 1, max: 90 },
      },
      {
        kind: 'checkValue',
        check: 'sellTradeQtyEnabled',
        checkId: 'lc-sell-trade',
        field: 'sellMinTradeQty',
        id: 'lc-sell-min-trade-qty',
        label: '체결',
        unit: '주',
        desc: '체결이 이 값 이상이면 매도를 넣어요',
      },
      // S→C 전용 — 서버가 매도 진입을 래치했을 때만 그린다(렌더가 판정한다).
      { kind: 'derived', label: '잔량추적 기준선' },
    ],
  },
  {
    slot: 'cancel',
    title: '매수취소',
    gate: 'cancelQtyEnabled',
    statusKey: 'cancel',
    dimWhenOff: false,
    rows: [
      { kind: 'value', field: 'cancelWatchQty', id: 'lc-cancel-watch-qty', label: '취소잔량', unit: '주', desc: '잔량이 이 값보다 적으면 취소해요' },
      { kind: 'check', check: 'cancelTradeEnabled', checkId: 'lc-cancel-trade', label: '체결' },
      { kind: 'check', check: 'cancelQtyTrackEnabled', checkId: 'lc-cancel-qty-track', label: '잔량추적' },
    ],
  },
];

/** 그룹 스위치 접근성 이름 — 기존 「○○ 켜기」 패턴(A-P2). */
export const LC_SWITCH_LABEL: Record<LcGate, string> = {
  buyEnabled: '매수주문 켜기',
  sweepEnabled: '한방체결 켜기',
  sellEnabled: '매도주문 켜기',
  cancelQtyEnabled: '매수취소 켜기',
};

const ALL_GROUPS: readonly LcGroupSpec[] = [...LC_BUY_GROUPS, ...LC_SELL_GROUPS];

/** 값 id(`lc-buy-watch-qty`) 또는 체크 id(`lc-buy-trade`)로 행과 그 그룹을 찾는다. */
export function lcRowById(id: string): { group: LcGroupSpec; row: LcRowSpec } | null {
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      if ((row.kind === 'value' || row.kind === 'checkValue') && row.id === id) return { group, row };
      if ((row.kind === 'checkValue' || row.kind === 'check') && row.checkId === id) return { group, row };
    }
  }
  return null;
}

/** 값 필드로 행과 그 그룹을 찾는다 — 시트 제목·설명·단위 · 「감시 중」 안내 판정. */
export function lcRowByField(
  field: LcNumField,
): { group: LcGroupSpec; row: Extract<LcRowSpec, { kind: 'value' | 'checkValue' }> } | null {
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      if ((row.kind === 'value' || row.kind === 'checkValue') && row.field === field) return { group, row };
    }
  }
  return null;
}

/**
 * 값 편집이 가능한 행만 — 감시대상(토글) · 체크 전용 · 기준선(읽기 전용)은 건너뛴다.
 * 20-05 의 Tab 연속 편집이 이 순서를 쓴다.
 */
export function lcNavigableRows(slot: LcGroupSpec['slot']): readonly { field: LcNumField; id: string }[] {
  const group = ALL_GROUPS.find((g) => g.slot === slot);
  if (group === undefined) return [];
  const out: { field: LcNumField; id: string }[] = [];
  for (const row of group.rows) {
    if (row.kind === 'value' || row.kind === 'checkValue') out.push({ field: row.field, id: row.id });
  }
  return out;
}

/**
 * cfg 전체 범위 검사 — 필드 확정 훅의 **전송 직전 마지막 방어선**(CR-01). 시트·인라인이 편집 필드를
 * 먼저 잠그지만, `lc.set` 은 32필드 전부를 싣는다 — 체크 on/off 와 무관하게 비율 값도 전송 대상이고,
 * 서버 동기값이 범위 밖이면(레거시·다른 클라) **다른 필드**를 확정해도 그 값이 실려 연결이 끊긴다.
 * 범위 밖 필드가 있으면 「{라벨} · {범위 문구}」, 없으면 null.
 */
export function lcRangeIssue(values: LimitChaserFormValues): string | null {
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      if ((row.kind !== 'value' && row.kind !== 'checkValue') || row.range === undefined) continue;
      const v = values[row.field];
      const text = Number.isInteger(v)
        ? rangeIssueText(v, row.unit, row.range.min, row.range.max)
        : `${row.range.min}~${row.range.max}${row.unit} 사이 정수여야 해요`;
      if (text !== null) return `${row.label} · ${text}`;
    }
  }
  return null;
}
