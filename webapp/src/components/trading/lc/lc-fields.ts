/**
 * 상따 설정 필드 스펙 — 카드 · 행 순서 · 라벨 · 단위 · 설명 · 옛 id · 게이트 매핑 · **표시 판정**의 단일 원천
 * (Phase 20 · 20-04 · Phase 24 ⑤ ⑥ ⑩).
 *
 * 렌더(`limit-chaser-form.tsx`) · 시트 문구(D-23 「{시트 제목} 적용」 · 설명) · Tab 순서(20-05 · R4) · e2e
 * `data-lc-field` · 요약 줄 · 접근성 이름이 모두 여기서 온다. 같은 목록을 다른 곳에 다시 적지 않는다 — 둘이
 * 되면 갈라진다.
 *
 * ★ 매수 쪽 = 「매수주문」 공통 카드(주문가격 · 비교가격 · 마스터 스위치, 접기 없음) → 선매수 → 추가매수 →
 *   후매수(접이식 카드 3장 · 스케치 009 D). 매도 쪽 = 가격 → 매도주문 → 매수취소(맨 아래) — 구조 그대로.
 * ★ 매수취소 그룹 스위치 = `cancelQtyEnabled`(D-21). 스위치가 꺼져도 체결 · 잔량추적 체크는 켤 수 있다
 *   (quick-260912-u58 ④). 흐림은 행마다 판정한다(`lcRowDimOf` — 매수취소 「체결」은 자기 체크 축만).
 * ★ 체크가 달린 필드는 체크 행(D-22) — 「○ 라벨 ─ 값 ›」(`checkValue`) 또는 값 없는 「○ 라벨」(`check`).
 * ★ 옛 입력 id(`lc-buy-watch-qty` …)는 **행 식별자이자 인라인 입력 id** 로 그대로 산다.
 * ★ 라벨 · 시트 제목 · 설명은 24-UI-SPEC 「시트 제목 · 설명」 표 원문이다(D-09 개명: 주문가격 · 비교가격 ·
 *   매수잔량). 그룹 카드 안 행의 보이는 라벨은 짧은 꼴이고 시트 제목만 그룹 이름을 되살린다(R14).
 */

import type { RelayLimitChaser } from '@gh-radar/shared';

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
  | 'extraBuyOrderAmount'
  | 'extraBuyMinQty'
  | 'extraBuyMaxQty'
  | 'postBuyOrderAmount'
  | 'postBuyReentry'
  | 'postBuyFloorQty'
  | 'postBuyReboundPct'
  | 'sellOrderPrice'
  | 'sellOrderRatio'
  | 'sellWatchPrice'
  | 'sellWatchQty'
  | 'sellQtyTrackRatio'
  | 'sellMinTradeQty'
  | 'cancelWatchQty'
>;
/** 체크 필드 — 누르면 즉시 반영(D-04). 한방(`sweepEnabled`)은 Phase 24 로 선매수 카드 안 체크가 됐다. */
export type LcBoolField = Extract<
  keyof LimitChaserFormValues,
  | 'buyTradeQtyEnabled'
  | 'sweepEnabled'
  | 'sellQtyTrackEnabled'
  | 'sellTradeQtyEnabled'
  | 'cancelTradeEnabled'
  | 'cancelQtyTrackEnabled'
>;
/** 상따 행 단위 — 키패드 단위 전부(후매수 「최대」가 「회」를 쓴다 · 0 허용 — D-30). */
export type LcUnit = PadUnit;

/**
 * 필드 범위(포함) — relay `lc.set` 스키마(`relay/src/ws/protocol.ts` `RelayLcSetSchema`)가 범위를 두는
 * 필드만 적는다. **값은 relay 스키마와 같아야 한다** — relay 는 스키마 위반 프레임을 받으면 WebSocket
 * 연결을 통째로 끊는다(`fanout.ts` `#reject` → `ws.close(BAD_MESSAGE)`). 그러면 모든 카드의 시세·에코가
 * 멈추고 같은 소켓의 수동주문은 결과 모름 잠금에 걸린다(20-REVIEW CR-01).
 *   - `sellOrderRatio`    `z.number().int().min(1).max(100)`
 *   - `sellQtyTrackRatio` `z.number().int().min(1).max(90)`
 *   - `sweepMinTickCount` · `postBuyReentry` `UByteSchema` = `min(0).max(255)`
 *   - `postBuyReboundPct` `z.number().int().min(0).max(100)` + `.superRefine` 「후매수 ON 이면 1~100」
 *     (서버 §9-2 ⑤ 동형 — `lcRangeIssue` 가 같은 조건 규칙을 본다)
 *   - `extraBuyMinQty` · `extraBuyMaxQty` `UIntSchema`(0 이상) — 게이트웨이 uint32 한도를 적는다
 * 나머지 값 필드(가격·수량·금액)는 `UIntSchema`(0 이상 정수) — 키패드가 음수·소수를 만들 수 없어 범위가 없다.
 */
export interface LcRange {
  min: number;
  max: number;
}

const UINT32: LcRange = { min: 0, max: 4_294_967_295 };

/** 값 · 체크 값 행이 공유하는 표시 필드. */
interface LcValueSpec {
  field: LcNumField;
  id: string;
  /** 보이는 라벨(카드 안 짧은 꼴 — 「금액」「최소 잔량」「최대」). */
  label: string;
  unit: LcUnit;
  /** 시트 설명(UI-SPEC 시트 제목 · 설명 표 원문). */
  desc: string;
  /** 시트 제목 — 없으면 `label`. 그룹 카드 행만 그룹 이름을 붙인다(R14 — 「선매수 금액」「한방 건수」). */
  sheetTitle?: string;
  /** 값 버튼 접근성 이름 접두 — 없으면 카드 제목(「매수 주문가격 …」「매도 매수잔량 …」 · D-09). */
  a11yPrefix?: string;
  /** 전송 직전 전 cfg 방어선 범위(relay 스키마 · CR-01). */
  range?: LcRange;
  /** 시트 · 인라인 입력 범위 — 없으면 `range`(후매수 반등 1~100 · UI-SPEC §4). */
  inputRange?: LcRange;
  /** 이 체크가 꺼지면 이 행도 흐린다(한방 → 한방가격 · ⑩). */
  dimWith?: LcBoolField;
}

export type LcRowSpec =
  | ({ kind: 'value' } & LcValueSpec)
  | ({ kind: 'checkValue'; check: LcBoolField; checkId: string } & LcValueSpec)
  | {
      kind: 'check';
      check: LcBoolField;
      checkId: string;
      label: string;
      /** 그룹 스위치와 무관한 독립 무장 축(매수취소 「체결」) — 자기 체크 OFF 일 때만 흐린다(UI-SPEC §9). */
      independent?: boolean;
    }
  | { kind: 'derived'; source: 'sellQtyTrackBaseline' | 'postBuyTriggerQty'; label: '잔량추적 기준선' | '발동잔량' }
  | { kind: 'note'; note: 'postBuyExhausted' };

/** 그룹 스위치 6개가 여닫는 게이트. */
export type LcGate =
  | 'buyEnabled'
  | 'preBuyEnabled'
  | 'extraBuyEnabled'
  | 'postBuyEnabled'
  | 'sellEnabled'
  | 'cancelQtyEnabled';
/** 그룹 상태 문구 키 — `card-body.tsx` `cardGroupStatusOf` 의 여섯 문구(UI-SPEC §11). */
export type LcStatusKey = 'buy' | 'preBuy' | 'extraBuy' | 'postBuy' | 'sell' | 'cancel';

export interface LcGroupSpec {
  /** `data-slot="lc-group-{slot}"` — e2e 앵커. */
  slot: 'buy' | 'pre-buy' | 'extra-buy' | 'post-buy' | 'sell-price' | 'sell' | 'cancel';
  /** 카드 제목 — 없으면 헤더 줄이 없다(매도 가격 섹션). */
  title?: '매수주문' | '선매수' | '추가매수' | '후매수' | '매도주문' | '매수취소';
  /** 헤더 없는 섹션의 접근성 이름. */
  ariaLabel?: string;
  /** 그룹 툴팁(`<section title>`) — 화면에는 그리지 않는다. */
  hint?: string;
  gate?: LcGate;
  /**
   * 이 그룹의 행이 따르는 상태 문구 키.
   * ★ 매도 가격 섹션은 헤더가 없지만 매도가격 · 매도비율은 **매도주문**의 값이다 — 그래서 `sell` 을 갖는다.
   */
  statusKey?: LcStatusKey;
  /**
   * 이 게이트가 꺼지면 이 그룹의 행(과 요약 줄)을 흐린다(⑩ · UI-SPEC §9). 매도 가격 섹션은 게이트가 없지만
   * 매도주문 게이트로 흐린다(R9). 시트 「감시 중」 안내(D-05)의 매수 쪽 판정 게이트이기도 하다.
   */
  dimGate?: LcGate;
  /** 옛 컨테이너 흐림 경로(`SettingGroup` 기본 `dimRows`) · 접힌 요약 줄 흐림 — 편집은 막지 않는다(D-01). */
  dimWhenOff: boolean;
  /** 제목줄 접기(Phase 24 ⑤ — 선매수 · 추가매수 · 후매수만). */
  collapsible: boolean;
  /**
   * 제목줄 체크(quick-260929-vzy — 후매수 ☐자동). 그룹 스위치와 같은 지위다 — 어느 행에도 속하지 않고
   * 게이트가 꺼져도 흐리지 않는다(WinForms ☐자동 동형). 제목줄에서 스위치 바로 앞에 선다.
   */
  headerCheck?: { field: 'postBuyAuto'; checkId: string; label: string; ariaLabel: string; hint: string };
  rows: readonly LcRowSpec[];
}

export const LC_BUY_GROUPS: readonly LcGroupSpec[] = [
  {
    slot: 'buy',
    title: '매수주문',
    gate: 'buyEnabled',
    statusKey: 'buy',
    dimGate: 'buyEnabled',
    hint: '선매수 · 추가매수 · 후매수가 같이 쓰는 주문가격 · 비교가격',
    dimWhenOff: true,
    collapsible: false,
    rows: [
      {
        kind: 'value',
        field: 'buyOrderPrice',
        id: 'lc-buy-order-price',
        label: '주문가격',
        unit: '원',
        desc: '세 매수가 같이 쓰는 매수 주문 가격이에요',
        a11yPrefix: '매수',
      },
      {
        kind: 'value',
        field: 'buyWatchPrice',
        id: 'lc-buy-watch-price',
        label: '비교가격',
        unit: '원',
        desc: '세 매수가 같이 지켜보는 가격(상한가)이에요',
        a11yPrefix: '매수',
      },
    ],
  },
  {
    slot: 'pre-buy',
    title: '선매수',
    gate: 'preBuyEnabled',
    statusKey: 'preBuy',
    dimGate: 'preBuyEnabled',
    dimWhenOff: true,
    collapsible: true,
    rows: [
      {
        kind: 'value',
        field: 'buyOrderAmount',
        id: 'lc-buy-order-amount',
        label: '금액',
        unit: '만원',
        sheetTitle: '선매수 금액',
        desc: '선매수 한 번에 넣을 금액이에요',
      },
      {
        kind: 'value',
        field: 'buyWatchQty',
        id: 'lc-buy-watch-qty',
        label: '매도잔량',
        unit: '주',
        sheetTitle: '선매수 매도잔량',
        desc: '비교가격의 매도잔량이 이 값 이하로 줄면 선매수를 넣어요',
      },
      {
        kind: 'checkValue',
        check: 'buyTradeQtyEnabled',
        checkId: 'lc-buy-trade',
        field: 'buyMinTradeQty',
        id: 'lc-buy-min-trade-qty',
        label: '체결량',
        unit: '주',
        sheetTitle: '선매수 체결량',
        desc: '체결이 이 값 이상이면 선매수를 넣어요',
      },
      {
        // 한방 = 두 행(R6) — 체크 값 행 「○ 한방 ─ 3건 ›」 + 값 행 「한방가격」.
        kind: 'checkValue',
        check: 'sweepEnabled',
        checkId: 'lc-sweep',
        field: 'sweepMinTickCount',
        id: 'lc-sweep-tick',
        label: '한방',
        unit: '건',
        sheetTitle: '한방 건수',
        desc: '호가가 이만큼 바뀌면 한 번에 체결해요',
        range: { min: 0, max: 255 },
      },
      {
        kind: 'value',
        field: 'sweepWatchPrice',
        id: 'lc-sweep-watch-price',
        label: '한방가격',
        unit: '원',
        desc: '한방 체결 가격이에요',
        dimWith: 'sweepEnabled',
      },
    ],
  },
  {
    slot: 'extra-buy',
    title: '추가매수',
    gate: 'extraBuyEnabled',
    statusKey: 'extraBuy',
    dimGate: 'extraBuyEnabled',
    dimWhenOff: true,
    collapsible: true,
    rows: [
      {
        kind: 'value',
        field: 'extraBuyOrderAmount',
        id: 'lc-extra-buy-amount',
        label: '금액',
        unit: '만원',
        sheetTitle: '추가매수 금액',
        desc: '추가매수 한 번에 넣을 금액이에요',
      },
      {
        kind: 'value',
        field: 'extraBuyMinQty',
        id: 'lc-extra-buy-min-qty',
        label: '최소 잔량',
        unit: '주',
        sheetTitle: '추가매수 최소 잔량',
        desc: '상한가 매수잔량이 이 값 이상일 때 사요 · 0 = 1주',
        range: UINT32,
      },
      {
        kind: 'value',
        field: 'extraBuyMaxQty',
        id: 'lc-extra-buy-max-qty',
        label: '최대 잔량',
        unit: '주',
        sheetTitle: '추가매수 최대 잔량',
        desc: '상한가 매수잔량이 이 값을 넘으면 포기해요 · 0 = 무제한',
        range: UINT32,
      },
    ],
  },
  {
    slot: 'post-buy',
    title: '후매수',
    gate: 'postBuyEnabled',
    statusKey: 'postBuy',
    dimGate: 'postBuyEnabled',
    dimWhenOff: true,
    collapsible: true,
    headerCheck: {
      field: 'postBuyAuto',
      checkId: 'lc-post-buy-auto',
      label: '자동',
      ariaLabel: '후매수 자동',
      hint: '선매수가 한 주도 체결되지 않고 전량 취소되거나 잔고가 0 이 되면 서버가 후매수를 한 번 켜요 — 매수주문이 꺼져 있으면 함께 켜요',
    },
    rows: [
      {
        kind: 'value',
        field: 'postBuyOrderAmount',
        id: 'lc-post-buy-amount',
        label: '금액',
        unit: '만원',
        sheetTitle: '후매수 금액',
        desc: '후매수 한 번에 넣을 금액이에요',
      },
      {
        kind: 'value',
        field: 'postBuyReentry',
        id: 'lc-post-buy-reentry',
        label: '최대',
        unit: '회',
        sheetTitle: '후매수 최대 횟수',
        desc: '최초 포함 총 진입 횟수예요 · 0 = 사지 않아요 · 껐다 켜면 이 값부터 다시 세요',
        range: { min: 0, max: 255 },
      },
      // 단계 3(소진)일 때만 「최대」 바로 아래 한 줄(UI-SPEC §5) — 렌더가 판정한다.
      { kind: 'note', note: 'postBuyExhausted' },
      {
        kind: 'value',
        field: 'postBuyFloorQty',
        id: 'lc-post-buy-floor-qty',
        label: '최소 잔량',
        unit: '주',
        sheetTitle: '후매수 최소 잔량',
        desc: '발동잔량의 하한(바닥)이에요 · 0 = 없음',
      },
      {
        kind: 'value',
        field: 'postBuyReboundPct',
        id: 'lc-post-buy-rebound',
        label: '반등',
        unit: '%',
        sheetTitle: '후매수 반등',
        desc: '매수잔량 최저점에서 이만큼 다시 쌓이면 사요',
        range: { min: 0, max: 100 },
        inputRange: { min: 1, max: 100 },
      },
      // S→C 전용 읽기 전용 — 펼침이면 단계 0 에서도 늘 그린다(「—」 · 발동 순간 행이 밀리지 않게 · UI-SPEC §6).
      { kind: 'derived', source: 'postBuyTriggerQty', label: '발동잔량' },
    ],
  },
];

export const LC_SELL_GROUPS: readonly LcGroupSpec[] = [
  {
    slot: 'sell',
    title: '매도주문',
    gate: 'sellEnabled',
    statusKey: 'sell',
    dimGate: 'sellEnabled',
    dimWhenOff: true,
    collapsible: false,
    rows: [
      // 주문가격 · 매도비율도 매도주문의 값이다(quick-261001-gjk — 제목줄 아래 한 카드).
      {
        kind: 'value',
        field: 'sellOrderPrice',
        id: 'lc-sell-order-price',
        label: '주문가격',
        unit: '원',
        desc: '넣을 매도 주문 가격이에요',
        a11yPrefix: '매도',
      },
      {
        kind: 'value',
        field: 'sellWatchPrice',
        id: 'lc-sell-watch-price',
        label: '비교가격',
        unit: '원',
        desc: '이 가격의 매수잔량을 지켜봐요',
        a11yPrefix: '매도',
      },
      {
        kind: 'value',
        field: 'sellOrderRatio',
        id: 'lc-sell-order-ratio',
        label: '매도비율',
        unit: '%',
        desc: '보유 수량 중 매도할 비율이에요',
        a11yPrefix: '매도',
        range: { min: 1, max: 100 },
      },
      {
        kind: 'value',
        field: 'sellWatchQty',
        id: 'lc-sell-watch-qty',
        label: '매수잔량',
        unit: '주',
        desc: '비교가격의 매수잔량이 이 값보다 줄면 매도를 넣어요',
        a11yPrefix: '매도',
      },
      {
        kind: 'checkValue',
        check: 'sellQtyTrackEnabled',
        checkId: 'lc-sell-qty-track',
        field: 'sellQtyTrackRatio',
        id: 'lc-sell-qty-track-ratio',
        label: '잔량추적',
        unit: '%',
        desc: '처음 잔량 대비 비율로 추적해요',
        a11yPrefix: '매도',
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
        a11yPrefix: '매도',
      },
      // S→C 전용 — 서버가 매도 진입을 래치했을 때만 그린다(렌더가 판정한다).
      { kind: 'derived', source: 'sellQtyTrackBaseline', label: '잔량추적 기준선' },
    ],
  },
  {
    slot: 'cancel',
    title: '매수취소',
    gate: 'cancelQtyEnabled',
    statusKey: 'cancel',
    dimGate: 'cancelQtyEnabled',
    dimWhenOff: false,
    collapsible: false,
    rows: [
      {
        kind: 'value',
        field: 'cancelWatchQty',
        id: 'lc-cancel-watch-qty',
        label: '매수잔량',
        unit: '주',
        desc: '매도 비교가격의 매수잔량이 이 값보다 적으면 매수 주문을 취소해요',
        a11yPrefix: '취소',
      },
      { kind: 'check', check: 'cancelTradeEnabled', checkId: 'lc-cancel-trade', label: '체결', independent: true },
      { kind: 'check', check: 'cancelQtyTrackEnabled', checkId: 'lc-cancel-qty-track', label: '잔량추적' },
    ],
  },
];

/** 그룹 스위치 접근성 이름 — 기존 「○○ 켜기」 패턴(A-P2). 「한방체결 켜기」는 Phase 24 로 없어졌다. */
export const LC_SWITCH_LABEL: Record<LcGate, string> = {
  buyEnabled: '매수주문 켜기',
  preBuyEnabled: '선매수 켜기',
  extraBuyEnabled: '추가매수 켜기',
  postBuyEnabled: '후매수 켜기',
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
 * 폼 필드(값 또는 체크)가 어느 **행**의 것인가 — 그룹 스위치 게이트는 행이 아니라 `null` 이다.
 * 접힌 카드 자동 펼침(행 실패 · T-24-19)이 쓴다.
 */
export function lcRowOfField(field: string): { group: LcGroupSpec; row: LcRowSpec; isCheck: boolean } | null {
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      if ((row.kind === 'value' || row.kind === 'checkValue') && row.field === field) {
        return { group, row, isCheck: false };
      }
      if ((row.kind === 'checkValue' || row.kind === 'check') && row.check === field) {
        return { group, row, isCheck: true };
      }
    }
  }
  return null;
}

/**
 * 값 편집이 가능한 행만 — 체크 전용 · 기준선 · 발동잔량(읽기 전용) · 소진 안내는 건너뛴다.
 * 20-05 의 Tab 연속 편집이 이 순서를 쓴다 — 같은 카드 안에서만 돈다(R4).
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

/* ───────────────────────── Phase 24 — 표시 판정(순수 함수) ───────────────────────── */

const NUM = new Intl.NumberFormat('ko-KR');
const fmt = (n: number, unit: string): string => `${NUM.format(n)}${unit}`;

/**
 * 표시 문자열 — 행 · 요약 · 시트 「지금 ○○」 · 접근성 이름이 **이 한 함수**에서 받는다(UI-SPEC §4).
 * `null` = 의미어가 없다(호출부가 「{값}{단위}」 기본 포맷을 쓴다). 편집은 늘 숫자(0 포함)로 한다(D-10).
 *
 *   - 추가매수 최대 0 → 「무제한」 · 최소 0 → 「1주」 · 후매수 최소 잔량 0 → 「없음」(D-10)
 *   - 금액 0 → 「—」(추가 · 후매수 D-03 · 선매수 금액 0). 서버가 선매수 금액을 모르는 레거시(D-04a)는 폼의
 *     `amountRequired` 경로가 그대로 맡는다.
 *   - 후매수 최대(D-11) — 단계 0(또는 에코 없음) 「{설정}회」 · 그 밖 「{설정}회 · 남은 {잔여}회」.
 *     시트 「지금」 참고값은 설정값이라 호출부가 `server` 를 `null` 로 넘긴다.
 */
export function lcValueTextOf(
  field: LcNumField,
  values: LimitChaserFormValues,
  server: RelayLimitChaser | null,
): string | null {
  const v = values[field];
  switch (field) {
    case 'extraBuyMaxQty':
      return v === 0 ? '무제한' : null;
    case 'extraBuyMinQty':
      return v === 0 ? '1주' : null;
    case 'postBuyFloorQty':
      return v === 0 ? '없음' : null;
    case 'buyOrderAmount':
    case 'extraBuyOrderAmount':
    case 'postBuyOrderAmount':
      return v === 0 ? '—' : null;
    case 'postBuyReentry': {
      const phase = server?.postBuyPhase ?? 0;
      return phase === 0 ? fmt(v, '회') : `${fmt(v, '회')} · 남은 ${fmt(server?.postBuyReentryLeft ?? 0, '회')}`;
    }
    default:
      return null;
  }
}

/** 요약 kv 한 개 — `off` 면 값 글자만 `--muted-fg`(꺼진 하위 항목 · 「—」). */
export interface LcSummaryItem {
  key: string;
  value: string;
  off: boolean;
}

/** 금액 kv — 「—」 은 꺼진 kv 다. */
function amountItem(field: LcNumField, values: LimitChaserFormValues, unknown: boolean): LcSummaryItem {
  const text = unknown ? '—' : (lcValueTextOf(field, values, null) ?? fmt(values[field], '만원'));
  return { key: '금액', value: text, off: text === '—' };
}

/**
 * 접힌 카드의 요약 줄(UI-SPEC §3 · R5) — 항목 · 순서 · 표기. 접기 없는 카드는 빈 배열.
 * 의미어(「무제한」「1주」「없음」)는 꺼진 kv 가 아니다(정상 색). 발동잔량은 요약에서 빨강을 쓰지 않는다.
 * `amountUnknown` = 서버가 선매수 금액을 모른다(D-04a · 폼의 `amountRequired`).
 */
export function lcSummaryOf(
  slot: LcGroupSpec['slot'],
  values: LimitChaserFormValues,
  server: RelayLimitChaser | null,
  amountUnknown = false,
): readonly LcSummaryItem[] {
  const text = (field: LcNumField, unit: string) => lcValueTextOf(field, values, server) ?? fmt(values[field], unit);
  switch (slot) {
    case 'pre-buy':
      return [
        amountItem('buyOrderAmount', values, amountUnknown),
        { key: '매도잔량', value: fmt(values.buyWatchQty, '주'), off: false },
        values.buyTradeQtyEnabled
          ? { key: '체결량', value: fmt(values.buyMinTradeQty, '주'), off: false }
          : { key: '체결량', value: '꺼짐', off: true },
        values.sweepEnabled
          ? {
              key: '한방',
              value: `${fmt(values.sweepMinTickCount, '건')} @${fmt(values.sweepWatchPrice, '원')}`,
              off: false,
            }
          : { key: '한방', value: '꺼짐', off: true },
      ];
    case 'extra-buy':
      return [
        amountItem('extraBuyOrderAmount', values, false),
        { key: '최소', value: text('extraBuyMinQty', '주'), off: false },
        { key: '최대', value: text('extraBuyMaxQty', '주'), off: false },
      ];
    case 'post-buy': {
      const trigger = server?.postBuyTriggerQty ?? 0;
      return [
        amountItem('postBuyOrderAmount', values, false),
        { key: '최대', value: text('postBuyReentry', '회'), off: false },
        { key: '최소', value: text('postBuyFloorQty', '주'), off: false },
        { key: '반등', value: fmt(values.postBuyReboundPct, '%'), off: false },
        trigger > 0
          ? { key: '발동잔량', value: fmt(trigger, '주'), off: false }
          : { key: '발동잔량', value: '—', off: true },
      ];
    }
    default:
      return [];
  }
}

/**
 * 값 버튼 접근성 이름(UI-SPEC 「접근성 이름 접두」 표 · D-09) — 「{접두} {라벨} {값}」.
 * 접두 = 행의 `a11yPrefix`(매수 공통 「매수」 · 매도 「매도」 · 취소 「취소」) 또는 카드 제목(선 · 추가 · 후매수).
 * 값 「—」 은 「{접두} {라벨} 미입력」 — 스크린리더가 「대시」로 읽지 않게 한다.
 */
export function lcRowA11yNameOf(
  group: LcGroupSpec,
  row: Extract<LcRowSpec, { kind: 'value' | 'checkValue' }>,
  valueText: string,
): string {
  const prefix = row.a11yPrefix ?? group.title ?? '';
  const head = prefix === '' ? row.label : `${prefix} ${row.label}`;
  return valueText === '—' ? `${head} 미입력` : `${head} ${valueText}`;
}

/**
 * 행 흐림 판정(⑩ · UI-SPEC §9 — WinForms 결) — 행마다 **한 번**만 곱한다.
 *   - 그 카드의 `dimGate` 가 OFF(마스터 · 그룹 · 매도 · 매수취소 스위치) → 흐림
 *   - 체크 행 · 체크 값 행은 그 체크 OFF 면 라벨 · 값만 흐림(원형 체크는 호출 조각이 흐리지 않는다)
 *   - 체크에 딸린 행(한방 → 한방가격 `dimWith`) · 매수취소 「체결」은 자기 체크 축만(`independent`)
 * 흐린 행도 편집할 수 있다(D-01) — 판정은 표시일 뿐이다.
 */
export function lcRowDimOf(group: LcGroupSpec, row: LcRowSpec, values: LimitChaserFormValues): boolean {
  const groupOff = group.dimGate !== undefined && !values[group.dimGate];
  switch (row.kind) {
    case 'value':
      return groupOff || (row.dimWith !== undefined && !values[row.dimWith]);
    case 'checkValue':
      return groupOff || !values[row.check];
    case 'check':
      return (!row.independent && groupOff) || !values[row.check];
    case 'derived':
      return groupOff;
    case 'note':
      return false;
  }
}

/**
 * cfg 전체 범위 검사 — 필드 확정 훅의 **전송 직전 마지막 방어선**(CR-01). 시트·인라인이 편집 필드를
 * 먼저 잠그지만, `lc.set` 은 전 필드를 싣는다 — 체크 on/off 와 무관하게 비율 값도 전송 대상이고,
 * 서버 동기값이 범위 밖이면(레거시·다른 클라) **다른 필드**를 확정해도 그 값이 실려 연결이 끊긴다.
 * ★ 조건 규칙 한 줄 — `postBuyEnabled` 면 반등은 1~100(relay zod `.superRefine` · 서버 §9-2 ⑤ 동형).
 *   후매수가 꺼진 레거시 에코의 반등 0 은 통과시킨다(다른 필드 확정을 막지 않는다 · RESEARCH Pitfall 4).
 * 범위 밖 필드가 있으면 「{라벨} · {범위 문구}」, 없으면 null.
 */
export function lcRangeIssue(values: LimitChaserFormValues): string | null {
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      if ((row.kind !== 'value' && row.kind !== 'checkValue') || row.range === undefined) continue;
      const range =
        row.field === 'postBuyReboundPct' && values.postBuyEnabled ? (row.inputRange ?? row.range) : row.range;
      const v = values[row.field];
      const text = Number.isInteger(v)
        ? rangeIssueText(v, row.unit, range.min, range.max)
        : `${range.min}~${range.max}${row.unit} 사이 정수여야 해요`;
      if (text !== null) return `${row.label} · ${text}`;
    }
  }
  return null;
}
