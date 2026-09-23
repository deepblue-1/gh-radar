'use client';

/**
 * ManualOrderForm — 카드 · 종목상세 호가 탭이 **함께 쓰는** 수동주문 폼 (Phase 18 D-19~D-23 · D-27, TRADE-07).
 *
 * ① 무엇인가
 *   `components/orderbook/order-panel.tsx` 의 **다이어트 재작성**이다. 가격 · 수량 · (예약구간 ∧ KRX
 *   일 때만) 조각 수 · 주문금액 · 「매수 · 매도 · 정정 · 취소」 4버튼. 호가 탭(`variant="orderbook"`)
 *   에만 주문유형 콤보(지정가 | 시간외종가)가 붙는다 — 작업대 카드는 WinForms 상따창 동형이라 없다.
 *
 *   **빠진 것(D-20):** 계좌 행(계좌는 전략 키의 일부라 카드/상태줄이 정한다) · 가격 ± 버튼 ·
 *   보유 비율 버튼 · 「호가창의 행을 클릭하면…」 안내. 매수 비율 버튼이 원래 없던 것은 그대로다.
 *
 * ② ★ 오조작 방지 규율 — **살아남는 것**과 **뒤집힌 것**
 *   살아남는다(한 글자도 완화하지 않는다):
 *   1. **색·위치·문구 3중 일치** — 매수 = `--up`(빨강) · **왼쪽** · 「매수」,
 *      매도 = `--down`(파랑) · 그 오른쪽 · 「매도」. 정정·취소는 방향색을 쓰지 않는다(`--card`).
 *   2. **확인 다이얼로그 필수** — 4버튼 전부 다이얼로그를 거친다. 기본 포커스는 취소다.
 *      건너뛰는 경로는 이 파일에 없다(`handleAction` → `setConfirm` 이 유일한 진입).
 *   3. **제출 후 즉시 재활성 금지** — 응답 전까지 4버튼 전부 비활성 + 「주문 전송 중…」 +
 *      중복 제출 가드(클릭 단계 · 확정 단계 두 겹).
 *   4. **결과는 셋이다** — 접수 / **결과 모름** / 거부. `status:"timeout"` 은 **실패가 아니다.**
 *      「실패」라는 단어를 쓰지 않고, 미체결에서 접수 여부를 확인하도록 안내하며, **버튼을
 *      다시 열지 않는다**. 잠금은 **한 규칙**이다(18-34 · R3-WR-02 · R3-IN-01 · R3-IN-02 · D-27 R4 보강):
 *      - 잠금은 `RelayProvider`(루트 레이아웃 · 앱 수명)가 `계좌|ISIN|거래소` 키
 *        (`strategyKey`)로 들고, 이 폼은 `orderLocks` 에서 **자기 요청이 등록하는(할) 키** —
 *        (a) 폼 키 · (b) 선택한 원주문 행 키 · (c) 이 폼이 보낸 마지막 신규 · 정정 요청 키(같은
 *        종목 · 계좌일 때) — 를 **읽기만** 한다(`formOrderLockOf`). 작업대 카드와 호가 탭이 같은 키로
 *        같은 잠금을 본다. 카드를 닫았다 다시 열어도 · 다른 화면에 다녀와도 잠긴 채이고,
 *        **로그아웃 · 새로고침에만** 풀린다.
 *        이력: 정정은 원주문 행의 거래소로 나가므로 폼 키만 읽으면 호가 탭의 교차 거래소 정정
 *        timeout 뒤 버튼이 다시 열렸다 — quick-260922-uhw · R4-WR-01.
 *      - **신규 · 정정만** 잠근다. 취소 timeout 은 결과 배너만 남긴다(취소 재시도는 무해하다).
 *      - **전송 중(응답 전)** 인 신규 · 정정도 같은 키를 잠근다(「주문 전송 중…」) — 전송 중 카드를
 *        닫고 다시 열어 두 번째 주문을 내는 경로가 없다. timeout 이면 틈 없이 결과 모름으로 옮겨 간다.
 *      잠금 해제 버튼·타이머·에코 기반 자동 해제는 없다 — 결과를 모르는 주문에 재주문 경로를 주면
 *      그 자리에서 중복 체결이 난다.
 *   5. **LOCKED 색 규칙** — shadcn 의 파랑 강조 토큰들은 값이 `--down`(매도 파랑)과 같다. 그래서
 *      그 토큰 이름은 이 파일에 등장하지 않는다. 채움 버튼 글자색은 값이 동일한
 *      `--destructive-fg` 하나다. 원주문 선택 칩도 같은 이유로 중립 표면(`--muted`)을 쓴다.
 *
 *   **뒤집혔다 — 단일 제출 버튼 규율** (옛 `order-panel` 규율 2)
 *   옛 패널은 매수·매도 버튼을 나란히 두지 않아 인접 오클릭을 구조적으로 막았다. D-20 에서
 *   사용자가 이것을 **명시적으로 뒤집었다** — 정본은 gh-trade WinForms 종합주문창이고, 거기서
 *   「매수 · 매도 · 정정 · 취소」가 한 화면에 선다(웹은 2×2 — 2026-09-23). 트레이더가 탭 전환 없이 바로 누르는 것이
 *   요구사항이다. 그 대가로 **확인 다이얼로그(기본 포커스 취소)가 인접 오클릭의 유일한
 *   방어선**이 됐다(T-18-30) — 그래서 규율 2·3 을 더 단단히 잠근다.
 *
 * ③ ★ `catch` 가 없다
 *   `sendOrder` 는 어떤 경로에서도 reject 하지 않는다(16-10). catch 를 두면 그 분기가 「실패」
 *   문구를 쓰게 되고, 결과를 모르는 주문에 「실패」를 쓰면 사용자가 재주문해 중복 체결이 난다.
 *   `OrderResp.message` 는 **표시만** 한다 — 문구를 비교해 분기하지 않는다(T-18-33).
 *
 * ④ ★ 77 판정은 `affordanceOf` 한 곳이다 (D-22)
 *   버튼 라벨(매수 ↔ 예약매수) · 조각 입력 표시 · 확인 문구는 전부 `affordanceOf` 반환에서 온다.
 *   이 파일은 **벽시계를 읽지 않고**, 77 값으로 **제출을 막지 않는다**(거부는 서버 몫).
 *   조각 수는 스테퍼가 **보일 때만** 요청에 싣는다 — 화면에 없는 값을 싣지 않는다(T-18-34).
 *
 * ⑤ 주문은 relay wss 단일 경로다 — `useRelayContext().sendOrder(req)` 만 부른다
 *   프레임·`rid` 를 여기서 만들지 않는다. 생성처가 하나여야 relay 의 `rid` 중복 가드가 정상
 *   주문을 막지 않는다. 종목 키는 12자 **ISIN** 이다(D-28).
 *
 * ⑥ 토스트를 쓰지 않는다 — 결과는 폼 하단 인라인 `role="status"` 하나로만 알린다.
 *
 * ⑦ 정정·취소는 **미체결 행 선택**으로만 열린다 (D-21)
 *   선택은 상위(미체결 표)가 소유하고 `selectedUnfilled` 로 내려준다. 선택이 없으면 두 버튼
 *   `disabled` — 선택 없이 정정·취소가 나갈 경로가 없다. 정정 잠금은 `canModify` 한 함수이고
 *   버튼 `disabled` 와 제출 가드가 **같은 함수**를 부른다. 정정은 원주문의 **방향·거래소·ISIN**
 *   을 승계하고(사용자가 고르지 않는다), 취소는 **미체결 잔량 전부**다(부분 취소 경로 없음).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import type {
  OrderSide,
  RelayExchange,
  RelayKrxSession,
  RelayOrderResultMsg,
  RelayQueuedWindowMsg,
  RelayUnfilled,
} from '@gh-radar/shared';

import {
  OFFHOURS_PRICE_LABEL,
  OrderConfirmDialog,
  isOffhoursOrder,
  type OrderConfirmDetail,
} from '@/components/orderbook/order-confirm-dialog';
import { DISABLED_LABEL, type PriceSelection } from '@/components/orderbook/order-panel';
import { strategyKey } from '@/lib/limit-chaser';
import { affordanceOf } from '@/lib/queued-window';
import {
  useRelayContext,
  type OrderLockKind,
  type RelayOrderRequest,
} from '@/lib/relay-provider';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

/** 예약구간 조각 수 스테퍼의 **초기값**(상한이 아니다 — 상한은 서버 `maxPieces`). */
const DEFAULT_PIECES = 5;

/** UI-SPEC §수동주문 원문. */
const OFFHOURS_DISABLED_TITLE = '시간외종가는 KRX · 시간외종가 창(G2/G3)에서만 고를 수 있어요';
const OFFHOURS_HINT = '가격 0 · krx_session 으로 전송 · 정정 불가(취소 후 재등록)';
const ORDERBOOK_FOOTNOTE = '신규 매수/매도와 정정·취소 · 시간외종가는 정정 불가(취소 후 재등록)';
/**
 * 시간외종가를 골랐는데 보낼 세션이 없다(창이 방금 닫혔거나 거래소가 KRX 가 아님) — WR-01.
 * 이때는 주문을 **만들지 않는다**. 숨겨진 옛 지정가로 떨어지면 사용자가 고른 것과 다른 주문이 나간다.
 */
export const OFFHOURS_WINDOW_CLOSED_TEXT = '시간외종가 창이 닫혔어요. 주문유형을 다시 확인해 주세요.';

/* 정정 수량 ≤ 미체결 잔량 (WR-06 · D-21) — 정정이 다루는 것은 그 순간의 잔량이다. */
/** 제출 검증 — 정정 수량이 잔량을 넘는다. */
export const modifyQtyOverRemainingText = (n: number) =>
  `정정 수량은 미체결 잔량(${KRW.format(n)}주) 이하여야 해요`;
/** 추종 — 부분체결로 잔량이 입력값 아래로 줄어 입력을 내렸다. */
export const modifyQtyClampedText = (n: number) =>
  `미체결 잔량이 ${KRW.format(n)}주로 줄어 정정 수량을 맞췄어요`;
/** 확정 직전 재대조 — 다이얼로그가 열린 사이 잔량이 확인한 수량 아래로 줄었다. */
export const MODIFY_REMAINING_CHANGED_TEXT =
  '미체결 잔량이 바뀌었어요 — 정정 수량을 다시 확인해 주세요';
/** 확정 직전 재대조 — 원주문이 미체결에서 사라졌다(체결·취소 · 선택 해제). */
export const MODIFY_TARGET_GONE_TEXT = '원주문이 더 이상 미체결이 아니에요';
/**
 * 확정 직전 재대조 — 다이얼로그가 열린 사이 **다른 원주문**이 선택됐다(GC-IN-06). 확인한 원주문이
 * 끝났다는 뜻이 아니므로 「미체결 아님」 과 다른 말로 한다.
 */
export const MODIFY_TARGET_CHANGED_TEXT = '선택한 원주문이 바뀌었어요 — 다시 확인해 주세요';
/**
 * 「결과 모름」 잠금(`RelayProvider` 키 잠금 · ②-4)으로 버튼이 잠겼는데 **이 폼 인스턴스에는 결과
 * 배너가 없을 때**(✕ 뒤 다시 연 카드 · 다른 화면에서 돌아온 폼 · 같은 키의 호가 탭 · 잠긴 키의
 * 원주문 행을 선택한 폼) 보이는 문구 —
 * GC-WR-03 · R3 목업 ③ 3-b 원문. 「실패」 를 쓰지 않는다.
 */
export const RESULT_UNKNOWN_LOCKED_TEXT =
  '결과를 모르는 주문이 있어 주문 버튼을 잠갔어요 — 미체결 목록에서 접수 여부를 확인하세요';

/**
 * 폼이 읽는 키들의 잠금을 하나로 합친다(②-4 · R4-WR-01). `null` 키는 건너뛴다.
 *
 * 하나라도 `"result-unknown"` 이면 그것, 아니면 하나라도 `"in-flight"` 이면 그것, 아니면 `undefined`.
 * **결과 모름이 우선이다** — 결과 모름은 풀리지 않는 잠금이고, 사용자가 확인할 것(미체결)을
 * 알려야 한다. 잠금 여부는 늘 `orderLocks`(RelayProvider) 가 답하고, 폼은 어느 키를 읽을지만 고른다.
 */
export function formOrderLockOf(
  orderLocks: ReadonlyMap<string, OrderLockKind>,
  keys: ReadonlyArray<string | null>,
): OrderLockKind | undefined {
  let found: OrderLockKind | undefined;
  for (const key of keys) {
    if (key === null) continue;
    const kind = orderLocks.get(key);
    if (kind === 'result-unknown') return kind;
    if (kind === 'in-flight') found = kind;
  }
  return found;
}

/**
 * 취소 확정 순간의 수량 — 확인한 수량(`confirmedQty`)을 **지금의 잔량으로 내리기만** 한다
 * (GC-WR-02 · D-21, 18-REVIEW-R2).
 *
 * 규칙: `live` 가 있고 `live.orderNo === orgOrderNo` 이고 `0 < live.unfilledQty < confirmedQty`
 * 일 때만 `live.unfilledQty`, 그 밖에는 `confirmedQty`.
 *  - **내리기만 한다** — 확인한 수량보다 큰 값은 절대 나가지 않는다(잔량이 늘거나 같으면 그대로).
 *  - **막지 않는다** — 원주문이 미체결에서 사라졌거나(`null`) 다른 행이 선택됐거나 잔량 0 이어도
 *    확인한 요청을 그대로 보낸다. 급락 국면의 취소 지연은 자산 위험이고, 최종 판정은 서버다.
 *
 * 근거: 취소의 의미는 「미체결 잔량 전부」 라서 잔량이 줄어든 만큼 내려 보내는 것이 사용자가
 * 확인한 뜻과 같다. 반대로 옛 수량 그대로 보내면 브로커가 「취소가능수량 초과」 로 거부하고,
 * relay `dupKey` 는 취소에서 수량을 보지 않으므로 거부 뒤의 재시도가 앞선 대기 정산까지 막힌다 —
 * 사용자는 급락 중에 다시 선택·확인해야 한다. 그래서 다이얼로그에 보였던 수량과 실제로 나간
 * 수량이 다를 수 있다(작아지는 쪽으로만). 이 사실은 화면 문구가 아니라 이 주석이 말한다.
 *
 * 수동주문 폼(`handleConfirmed`)과 계좌 패널 옛 취소 경로(`handleCancelConfirmed`)가 **이 함수
 * 하나**로 판정한다.
 */
export function cancelQtyAtConfirm(
  confirmedQty: number,
  orgOrderNo: string,
  live: Pick<RelayUnfilled, 'orderNo' | 'unfilledQty'> | null,
): number {
  if (live === null || live.orderNo !== orgOrderNo) return confirmedQty;
  if (live.unfilledQty > 0 && live.unfilledQty < confirmedQty) return live.unfilledQty;
  return confirmedQty;
}

/** 주문 결과. `unknown` 은 **거부가 아니다**. */
type OrderResult =
  | { kind: 'accepted'; orderNo: string }
  | { kind: 'rejected'; message: string; resultCode: number }
  | { kind: 'unknown' };

/** 선택 차단 사유 — UI-SPEC E13 「접수 전 … 행 선택 disabled + `title` 사유」. */
const SELECT_BLOCK_NO_ORDER_NO = '접수 전(주문번호 없음)은 선택할 수 없어요';
const SELECT_BLOCK_CANCEL_SENT = '취소가 이미 나간 주문이에요';
/** 정정 잠금 사유 — 서버 거부 문구(「취소 후 재등록」)와 같은 방향으로 먼저 알린다. */
const MODIFY_LOCK_OFFHOURS_ORDER = '시간외종가 주문은 정정할 수 없어요 · 취소 후 재등록';
const MODIFY_LOCK_QUEUED = '예약 주문은 정정할 수 없어요 · 취소 후 재등록';
const MODIFY_LOCK_OFFHOURS_TYPE = '시간외종가는 정정할 수 없어요 · 취소 후 재등록';

/**
 * 미체결 행을 **선택할 수 없는** 사유. `null` = 선택 가능.
 * 미체결 표(18-09)가 행 선택 `disabled` + `title` 로 쓰고, 폼도 같은 함수로 방어한다 —
 * 막혀야 할 행이 prop 으로 들어와도 칩을 띄우지 않고 정정·취소를 열지 않는다.
 *  - `orderNo` 빈 행: 접수 전이라 원주문번호가 없다 — 정정·취소 프레임을 만들 수 없다.
 *  - `pendingCancelSent`: 취소가 이미 증권사에 보관됐다(D-14 — 회색 판정의 유일한 근거).
 */
export function unfilledSelectBlockReason(
  row: Pick<RelayUnfilled, 'orderNo' | 'pendingCancelSent'>,
): string | null {
  if (row.orderNo.length === 0) return SELECT_BLOCK_NO_ORDER_NO;
  if (row.pendingCancelSent) return SELECT_BLOCK_CANCEL_SENT;
  return null;
}

/** 정정을 잠그는 사유. `null` = 정정 가능. `canModify` 의 사유판이다(버튼 `title`). */
export function modifyLockReason(
  row: Pick<RelayUnfilled, 'board' | 'price' | 'queuedStatus' | 'pendingCancelSent' | 'orderNo'>,
): string | null {
  const blocked = unfilledSelectBlockReason(row);
  if (blocked) return blocked;
  // 칩 표기와 **같은 판정**(`isOffhoursOrder` — board G2/G3 또는 가격 0, GC-IN-03).
  if (isOffhoursOrder(row)) return MODIFY_LOCK_OFFHOURS_ORDER;
  if (row.queuedStatus.length > 0) return MODIFY_LOCK_QUEUED;
  return null;
}

/**
 * 이 원주문을 **정정할 수 있는가** — UI 의 1차 판정 (T-18-32).
 *
 * 잠그는 근거 셋(+ 주문번호 없음):
 *  1. **시간외종가 원주문**(`isOffhoursOrder` — `board` G2/G3 또는 가격 0) — 서버가
 *     「시간외종가 정정 불가 — 취소 후 재등록」으로 거부한다(gh-trade `preopen-offhours-order.md`).
 *  2. **예약 Q-ID 행**(`queuedStatus` 비어 있지 않음) — 같은 이유로 거부된다(취소 후 재등록,
 *     gh-trade `queued-order.md` D-12).
 *  3. **취소 보관 행**(`pendingCancelSent`) — 이미 취소가 나갔다. 정정할 대상이 곧 사라진다.
 *
 * ★ **relay 는 이 판정을 하지 않는다.** relay 가 두 번째 판정을 들면 서버 규칙과 갈린다.
 *   UI 가 먼저 막고, 서버가 최종 판정이다 — 이 잠금이 빠져도 서버 거부로 끝난다.
 * ★ 버튼 `disabled` 와 제출 가드(`handleAction`)가 **이 함수 하나**를 부른다.
 */
export function canModify(
  row: Pick<RelayUnfilled, 'board' | 'price' | 'queuedStatus' | 'pendingCancelSent' | 'orderNo'>,
): boolean {
  return modifyLockReason(row) === null;
}

/** 폼의 네 동작. */
type OrderAction = 'buy' | 'sell' | 'modify' | 'cancel';

export interface ManualOrderFormProps {
  /** `'card'` = 작업대 카드(주문유형 없음) · `'orderbook'` = 종목상세 호가 탭(주문유형 콤보 있음). */
  variant: 'card' | 'orderbook';
  /** 12자 ISIN — **주문 요청 키**(D-28). */
  isin: string;
  /** 6자 단축코드 — 표시 전용(확인 다이얼로그). */
  code: string;
  /** 종목명 — 확인 다이얼로그 요약. */
  name: string;
  /** 주문 계좌 — 카드의 전략 키 / 호가 탭 상태줄이 정한다(폼에 계좌 행이 없다, D-20). */
  accountNo: string;
  /** 주문 거래소 — 카드 헤더 / 호가 탭 상태줄 값. */
  exchange: RelayExchange;
  /** 77 창 힌트(`relay-provider` 의 `queuedWindow`). `undefined` = 모름. */
  queuedWindow: RelayQueuedWindowMsg | undefined;
  /** 세션 상태 — `ready` 가 아니면 4버튼 비활성. */
  status: RelayStatus;
  /** 호가 사다리 가격 셀 클릭 이벤트. 값 없는 셀(0 이하)은 no-op. */
  selectedPrice?: PriceSelection | null;
  /** 시간외종가 「참고 종가」(표시 전용). */
  referenceClose?: number | null;
  /**
   * 미체결 표에서 선택된 원주문 (D-21). 들어오면 가격·수량이 원주문 값(가격 · 미체결 잔량)으로
   * 채워지고 폼 위에 칩이 뜬다. `null`/부재 = 선택 없음 → 정정·취소 `disabled`.
   */
  selectedUnfilled?: RelayUnfilled | null;
  /** 칩 ✕(「선택 해제」). 선택은 상위가 소유한다 — 해제해도 입력값은 남는다. */
  onClearSelection?: () => void;
  /** 제출이 끝났을 때(접수·거부·결과 모름 무관) 부모에게 알린다. */
  onSubmitted?: (res: RelayOrderResultMsg) => void;
  className?: string;
}

/**
 * 시간외종가로 보낼 세션 — 열린 창을 **서버 플래그**에서 고른다(벽시계 아님, D-22).
 * 시간외종가는 KRX 전용이다(D-23) — KRX 가 아니면 창과 무관하게 `null`.
 * `null` 은 「보낼 세션이 없다」이고, 호출부는 그때 주문을 만들지 않는다(WR-01).
 * 창 판정 원천(`affordanceOf`)과 한 렌더 어긋날 수 있다(복귀 효과가 돌기 전) — 그래서
 * `offHoursSelectable` 을 믿지 않고 여기서 다시 `null` 을 본다.
 */
function offHoursSessionOf(
  w: RelayQueuedWindowMsg | undefined,
  exchange: RelayExchange,
): RelayKrxSession | null {
  if (exchange !== 'KRX') return null;
  if (w?.g3Open) return 'G3';
  if (w?.g2Open) return 'G2';
  return null;
}

export function ManualOrderForm({
  variant,
  isin,
  code,
  name,
  accountNo,
  exchange,
  queuedWindow,
  status,
  selectedPrice,
  referenceClose,
  selectedUnfilled,
  onClearSelection,
  onSubmitted,
  className,
}: ManualOrderFormProps) {
  const [priceText, setPriceText] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [pieceText, setPieceText] = useState(String(DEFAULT_PIECES));
  const [orderTypeState, setOrderType] = useState<'limit' | 'offhours'>('limit');
  const [confirm, setConfirm] = useState<OrderConfirmDetail | null>(null);
  /** 확인 다이얼로그가 보여 준 **바로 그 요청** — 확정은 이 스냅샷만 보낸다. */
  const pendingReqRef = useRef<RelayOrderRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const { sendOrder, orderLocks } = useRelayContext();
  /**
   * 이 폼이 실제로 보낸 마지막 신규 · 정정 요청의 대상 — **잠금 여부가 아니라 「어느 키를 읽을지」**
   * 다(②-4 (c)). 잠금 여부는 늘 Provider 가 답한다. 취소는 기억하지 않는다(취소는 잠그지 않는다).
   */
  const [sentTarget, setSentTarget] = useState<Pick<
    RelayOrderRequest,
    'isin' | 'accountNo' | 'exchange'
  > | null>(null);

  // 카드에는 주문유형이 없다(D-23) — 항상 지정가.
  const orderType = variant === 'orderbook' ? orderTypeState : 'limit';
  const aff = affordanceOf(queuedWindow, exchange, orderType);
  const offHours = orderType === 'offhours';

  const price = digitsToNumber(priceText);
  const qty = digitsToNumber(qtyText);
  const pieces = clampPieces(digitsToNumber(pieceText), aff.maxPieces);

  // 선택 차단 행은 선택이 없는 것과 같다(칩 없음 · 정정·취소 닫힘).
  const selected =
    selectedUnfilled && unfilledSelectBlockReason(selectedUnfilled) === null
      ? selectedUnfilled
      : null;

  /*
    주문 잠금(②-4) — 원천은 `RelayProvider` 하나다(앱 수명). 상위(작업대 · 카드 본문 · 호가 탭)는
    잠금을 prop 으로 내리지 않는다. 계좌가 빈 폼은 보낼 수 없으므로 잠금도 없다. 폼은 자기 요청이
    등록하는(할) 키를 전부 읽는다 — (a) 폼 키 · (b) 선택 원주문 행 키(정정이 등록할 키) · (c) 이 폼이
    보낸 신규 · 정정 요청 키(같은 종목 · 계좌일 때만). 정정은 원주문 행의 거래소로 나가므로 폼 키만
    읽으면 교차 거래소 정정 timeout 뒤 버튼이 다시 열렸다(R4-WR-01).
  */
  const lockKeys: Array<string | null> =
    accountNo.length === 0
      ? []
      : [
          strategyKey(isin, accountNo, exchange),
          selected ? strategyKey(selected.isin, accountNo, selected.exchange) : null,
          sentTarget && sentTarget.isin === isin && sentTarget.accountNo === accountNo
            ? strategyKey(isin, accountNo, sentTarget.exchange)
            : null,
        ];
  const lock = formOrderLockOf(orderLocks, lockKeys);

  /*
    종목 전환 방어 — 호가 탭은 remount 없이 props 만 바뀐다. 리셋하지 않으면 다른 종목의
    가격·수량·결과가 그대로 남는다(T-15-40 승계). 잠금은 여기서 풀지 않는다 — 원천이
    `RelayProvider` 의 키별 잠금이라 새 종목의 키를 읽으면 그뿐이다(②-4).
  */
  useEffect(() => {
    setPriceText('');
    setQtyText('');
    setResult(null);
    setConfirm(null);
    setValidation(null);
    pendingReqRef.current = null;
  }, [isin]);

  /* 창이 닫히면 시간외종가 → 지정가로 복귀(D-23). 판정은 `affordanceOf` 의 값이다. */
  useEffect(() => {
    if (orderTypeState === 'offhours' && !aff.offHoursSelectable) setOrderType('limit');
  }, [orderTypeState, aff.offHoursSelectable]);

  /* 서버 상한이 내려가면 스테퍼 표시값도 따라 내려간다(상한 = 서버 `maxPieces`). */
  useEffect(() => {
    if (!aff.showPieceInput) return;
    setPieceText((prev) => String(clampPieces(digitsToNumber(prev), aff.maxPieces)));
  }, [aff.showPieceInput, aff.maxPieces]);

  /*
    호가 사다리 가격 셀 클릭 → 가격 채움. 의존성에 `seq` 가 있어 같은 호가 재클릭도 반영된다.
    값 없는 셀(0 이하)은 **no-op** 다 — 입력을 지우지 않는다.
  */
  const selectedPriceValue = selectedPrice?.price ?? null;
  const selectedPriceSeq = selectedPrice?.seq ?? null;
  useEffect(() => {
    if (selectedPriceValue == null || !(selectedPriceValue > 0)) return;
    setPriceText(KRW.format(selectedPriceValue));
    setValidation(null);
  }, [selectedPriceValue, selectedPriceSeq]);

  /*
    원주문 선택 → 가격·수량 채움. 수량은 **미체결 잔량**이다 — 정정·취소가 다루는 것이 그 잔량이다.
    키는 주문번호 하나다: 같은 행이 부분체결로 갱신될 때마다 사용자가 고친 값을 덮지 않는다.
    해제(null)는 아무것도 지우지 않는다 — 값은 남는다.
  */
  const selectedOrderNo = selected?.orderNo ?? null;
  const selectedFillPrice = selected?.price ?? 0;
  const selectedFillQty = selected?.unfilledQty ?? 0;
  useEffect(() => {
    if (selectedOrderNo === null) return;
    if (selectedFillPrice > 0) setPriceText(KRW.format(selectedFillPrice));
    if (selectedFillQty > 0) setQtyText(KRW.format(selectedFillQty));
    setValidation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 주문번호가 바뀔 때만 채운다(위 주석).
  }, [selectedOrderNo]);

  /*
    잔량 추종 (WR-06 ①) — **같은 주문번호**의 잔량이 바뀌면(부분체결 때 작업대가 새 행을 내려준다)
    현재 수량이 새 잔량보다 클 때만 잔량으로 **내리고** 인라인으로 말한다. 작거나 같으면 건드리지
    않는다 — 사용자 입력을 올리지 않는다. 주문번호가 바뀐 경우는 위 채움 효과의 몫이다.
  */
  const prevSelRef = useRef<{ orderNo: string; unfilledQty: number } | null>(null);
  useEffect(() => {
    const prev = prevSelRef.current;
    prevSelRef.current =
      selectedOrderNo === null ? null : { orderNo: selectedOrderNo, unfilledQty: selectedFillQty };
    if (selectedOrderNo === null || prev === null || prev.orderNo !== selectedOrderNo) return;
    if (prev.unfilledQty === selectedFillQty || !(selectedFillQty > 0)) return;
    if (qty > selectedFillQty) {
      setQtyText(KRW.format(selectedFillQty));
      setValidation(modifyQtyClampedText(selectedFillQty));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 잔량이 바뀔 때만 본다(입력 변경엔 반응하지 않는다).
  }, [selectedOrderNo, selectedFillQty]);

  /** 잠금 = `RelayProvider` 키 잠금(진행 중 · 결과 모름) 하나(②-4). */
  const locked = lock !== undefined;
  /** 「주문 전송 중…」 — 이 폼이 보내는 중이거나, 같은 키의 신규 · 정정이 다른 폼에서 전송 중이다. */
  const sending = submitting || lock === 'in-flight';
  const busy = submitting || locked;
  const gateDisabled = status !== 'ready';

  const stepPieces = useCallback(
    (dir: 1 | -1) => {
      setPieceText((prev) =>
        String(clampPieces(clampPieces(digitsToNumber(prev), aff.maxPieces) + dir, aff.maxPieces)),
      );
    },
    [aff.maxPieces],
  );

  /**
   * 4버튼의 유일한 진입. 검증 → 요청 스냅샷 → **확인 다이얼로그**. 여기서 전송하지 않는다.
   * 검증 순서는 relay 조립기(`buildOrderFrame`)와 같다 — 문구도 같은 원문이다.
   */
  const handleAction = (action: OrderAction) => {
    if (busy || gateDisabled) return; // 중복 제출 가드 ①
    setResult(null);

    if (action === 'cancel') {
      if (!selected) return; // 선택 없이 취소가 나갈 경로는 없다.
      if (accountNo.length === 0) {
        setValidation('주문 계좌를 선택해 주세요.');
        return;
      }
      setValidation(null);
      pendingReqRef.current = {
        kind: 'cancel',
        // ★ 그 **행의** ISIN·거래소다(T-16-01 승계) — 열린 종목의 값을 쓰지 않는다.
        isin: selected.isin,
        accountNo,
        exchange: selected.exchange,
        orgOrderNo: selected.orderNo,
        // 취소 수량은 **미체결 잔량 전부**다 — 폼의 수량 입력을 쓰지 않는다(부분 취소 경로 없음).
        qty: selected.unfilledQty,
        price: selected.price,
      };
      setConfirm({
        mode: 'cancel',
        orderNo: selected.orderNo,
        side: selected.side,
        stockName: selected.name ?? name,
        price: selected.price,
        unfilledQty: selected.unfilledQty,
        code: selected.code ?? code,
        accountNo,
        exchange: selected.exchange,
        orderQty: selected.orderQty,
        board: selected.board,
      });
      return;
    }

    if (action === 'modify') {
      // 버튼 `disabled` 와 같은 함수(`canModify`)로 한 번 더 막는다.
      if (!selected || offHours || !canModify(selected)) return;
      const problem = validateNew({ isin: selected.isin, accountNo, qty, price, offHours: false });
      if (problem) {
        setValidation(problem);
        return;
      }
      // WR-06 ②: 정정이 다루는 것은 미체결 잔량이다 — 넘으면 막는다.
      if (qty > selected.unfilledQty) {
        setValidation(modifyQtyOverRemainingText(selected.unfilledQty));
        return;
      }
      setValidation(null);
      pendingReqRef.current = {
        kind: 'modify',
        isin: selected.isin,
        accountNo,
        // 거래소·방향은 원주문 승계 — 정정으로 바꿀 수 없다(바꾸려면 취소 후 재주문).
        exchange: selected.exchange,
        orgOrderNo: selected.orderNo,
        side: selected.side,
        qty,
        price,
      };
      setConfirm({
        mode: 'modify',
        side: selected.side,
        stockName: selected.name ?? name,
        code: selected.code ?? code,
        accountNo,
        exchange: selected.exchange,
        orgOrderNo: selected.orderNo,
        orgPrice: selected.price,
        orgQty: selected.orderQty,
        board: selected.board,
        price,
        qty,
      });
      return;
    }

    const side: OrderSide = action === 'buy' ? 'B' : 'S';
    const session = offHours ? offHoursSessionOf(queuedWindow, exchange) : null;
    // ★ WR-01: 시간외종가를 골랐는데 보낼 세션이 없으면 **아무것도 만들지 않는다.**
    //   지정가로 떨어지면(숨겨진 옛 가격) 사용자가 고른 것과 다른 주문이 나간다.
    if (offHours && session === null) {
      setValidation(OFFHOURS_WINDOW_CLOSED_TEXT);
      return;
    }
    const problem = validateNew({ isin, accountNo, qty, price, offHours: session !== null });
    if (problem) {
      setValidation(problem);
      return;
    }
    setValidation(null);

    const sendPrice = session !== null ? 0 : price;
    const req: RelayOrderRequest = {
      kind: 'new',
      isin,
      accountNo,
      exchange,
      side,
      qty,
      price: sendPrice,
      // 스테퍼가 **보일 때만** 싣는다(부재 = 1).
      ...(aff.showPieceInput ? { pieceCount: pieces } : {}),
      // 시간외종가일 때만 세션을 싣는다 — 이 값이 있어야 price 0 이 허용된다.
      ...(session !== null ? { krxSession: session } : {}),
    };
    pendingReqRef.current = req;
    /*
      ★ 다이얼로그 = 요청 (WR-01 · D-20). 확인 상세의 주문유형·가격은 폼 상태가 아니라 **요청을
        만든 같은 `session` 값**에서 파생한다 — 세션 있음 ⇔ 시간외종가 · 가격 0. 사용자가 확인한
        것과 확정 시 나가는 스냅샷이 한 값에서 나오므로 둘이 갈릴 수 없다.
        다이얼로그가 열린 뒤 창이 닫혀도 확정은 이 스냅샷 그대로 보낸다 — 창 판정은 서버다(D-22).
    */
    setConfirm({
      mode: 'new',
      side,
      stockName: name,
      code,
      accountNo,
      exchange,
      price: sendPrice,
      qty,
      buttonMode: aff.buttonMode,
      orderType: session !== null ? 'offhours' : 'limit',
      referencePrice: referenceClose ?? null,
      confirmNote: aff.confirmNote,
      ...(aff.showPieceInput ? { pieceCount: pieces, maxPieces: aff.maxPieces } : {}),
    });
  };

  const handleConfirmed = async () => {
    const snap = pendingReqRef.current;
    if (!snap || submitting || locked) return; // 중복 제출 가드 ②
    pendingReqRef.current = null;
    /*
      WR-06 ③ 확정 직전 재대조 — 정정 스냅샷을 **지금 렌더의** 선택 행과 맞춘다. 다이얼로그가 열린
      사이 원주문이 사라졌거나(선택 없음) 다른 원주문이 선택됐거나 잔량이 확인한 수량 아래로
      줄었으면 **보내지 않는다**(다이얼로그를 닫고 스냅샷은 버린다) — 무엇이 바뀌었는지는 문구가
      가른다(GC-IN-06). 고쳐서 보내지도 않는다 — 사용자가 확인한 값과 다른 정정이 된다.
    */
    if (snap.kind === 'modify') {
      const reason =
        selected === null
          ? MODIFY_TARGET_GONE_TEXT
          : selected.orderNo !== snap.orgOrderNo
            ? MODIFY_TARGET_CHANGED_TEXT
            : snap.qty > selected.unfilledQty
              ? MODIFY_REMAINING_CHANGED_TEXT
              : null;
      if (reason !== null) {
        setConfirm(null);
        setValidation(reason);
        return;
      }
    }
    /*
      취소는 **막지 않고** 수량만 지금의 잔량으로 내린다(GC-WR-02 · `cancelQtyAtConfirm`). 취소는
      「잔량 전부」 이고 급락 국면의 취소 지연은 자산 위험이다 — 원주문이 사라졌어도 확인한 요청을
      보낸다(서버가 최종 판정).
    */
    const req: RelayOrderRequest =
      snap.kind === 'cancel'
        ? { ...snap, qty: cancelQtyAtConfirm(snap.qty, snap.orgOrderNo ?? '', selected) }
        : snap;
    setSubmitting(true);
    // ②-4 (c) — 이 요청이 Provider 에 등록할 키를 기억한다(취소는 잠그지 않으므로 기억하지 않는다).
    if (req.kind !== 'cancel') {
      setSentTarget({ isin: req.isin, accountNo: req.accountNo, exchange: req.exchange });
    }
    setConfirm(null);
    setResult(null);
    // catch 없음(③) — sendOrder 는 reject 하지 않는다.
    const res = await sendOrder(req);
    if (res.status === 'timeout') {
      // ★ 결과를 모른다 — 신규 · 정정이면 `RelayProvider` 가 이미 이 요청의 키를 잠갔다(②-4).
      //   폼은 배너만 세운다. 취소 timeout 은 잠그지 않는다(사용자 결정 2 · 취소 재시도는 무해).
      setResult({ kind: 'unknown' });
    } else if (res.status === 'rejected' || res.resultCode !== 0) {
      setResult({ kind: 'rejected', message: res.message, resultCode: res.resultCode });
    } else {
      setResult({ kind: 'accepted', orderNo: res.orderNo });
    }
    onSubmitted?.(res);
    setSubmitting(false);
  };

  // 권한이 없으면 폼 자체를 렌더하지 않는다(주문 진입점 미노출, T-15-21 승계).
  if (status === 'unauthorized') return null;

  const buyLabel = aff.buttonMode === 'queued' ? '예약매수' : '매수';
  const sellLabel = aff.buttonMode === 'queued' ? '예약매도' : '매도';
  const sideDisabled = gateDisabled || busy;
  const modifyLock = selected
    ? offHours
      ? MODIFY_LOCK_OFFHOURS_TYPE
      : modifyLockReason(selected)
    : null;
  const modifyDisabled =
    gateDisabled || busy || !selected || offHours || !canModify(selected);
  const cancelDisabled = gateDisabled || busy || !selected;

  return (
    <div
      data-testid="manual-order-form"
      className={cn(
        'flex min-w-0 flex-col gap-[var(--s-2)] [--lw:76px] @min-[992px]/lc:[--lw:104px]',
        className,
      )}
    >
      {selected && (
        <div
          data-testid="manual-order-selchip"
          className="flex min-w-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--fg)] bg-[var(--muted)] py-1 pr-1.5 pl-2 text-[11px] text-[var(--fg)]"
        >
          <span className="flex min-w-0 flex-col leading-[1.3]">
            <span className="truncate">
              원주문 <b className="mono font-bold">{selected.orderNo}</b>
            </span>
            <span className="truncate">
              {selected.side === 'B' ? '매수' : '매도'}{' '}
              <b className="mono font-bold">
                {/* 시간외종가 원주문은 「0」 이 아니라 「시간외종가」 다 — 정정 잠금과 같은 판정(GC-IN-03). */}
                {isOffhoursOrder(selected)
                  ? OFFHOURS_PRICE_LABEL
                  : KRW.format(selected.price)}{' '}
                × {KRW.format(selected.orderQty)}
              </b>
            </span>
          </span>
          <button
            type="button"
            aria-label="선택 해제"
            onClick={onClearSelection}
            className="ml-auto flex-none px-0.5 text-[12px] text-[var(--fg)]"
          >
            ✕
          </button>
        </div>
      )}

      {variant === 'orderbook' && (
        <Row label="주문유형" htmlFor={`mo-type-${isin}`}>
          <select
            id={`mo-type-${isin}`}
            aria-label="주문유형"
            value={orderType}
            onChange={(e) => setOrderType(e.target.value === 'offhours' ? 'offhours' : 'limit')}
            title={aff.offHoursSelectable ? undefined : OFFHOURS_DISABLED_TITLE}
            className="h-8 w-full min-w-0 rounded-[var(--r)] border border-[var(--input)] bg-[var(--bg)] px-2 text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-caption)] text-[var(--fg)]"
          >
            <option value="limit">지정가</option>
            <option
              value="offhours"
              disabled={!aff.offHoursSelectable}
              title={aff.offHoursSelectable ? undefined : OFFHOURS_DISABLED_TITLE}
            >
              시간외종가
            </option>
          </select>
        </Row>
      )}

      {offHours ? (
        <>
          <Row label="가격">
            <UnitBox unit="원" locked>
              <input
                value="—"
                disabled
                aria-label="가격(시간외종가 · 잠김)"
                className="mono min-w-0 flex-1 bg-transparent text-right text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-caption)] text-[var(--muted-fg)] outline-none"
              />
            </UnitBox>
          </Row>
          <Row label="">
            <div className="flex min-w-0 items-baseline justify-between gap-[var(--s-2)] text-[11px] text-[var(--muted-fg)]">
              <span className="truncate">참고 종가</span>
              <b className="mono flex-none font-semibold text-[var(--fg)]">
                {referenceClose != null && referenceClose > 0 ? KRW.format(referenceClose) : '—'}
              </b>
            </div>
          </Row>
          <Row label="">
            <p className="m-0 min-w-0 break-words text-[11px] leading-snug text-[var(--muted-fg)]">
              {OFFHOURS_HINT}
            </p>
          </Row>
        </>
      ) : (
        <Row label="가격" htmlFor={`mo-price-${isin}`}>
          <UnitBox unit="원">
            <input
              id={`mo-price-${isin}`}
              inputMode="numeric"
              autoComplete="off"
              value={priceText}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setValidation(null);
                setPriceText(formatDigits(e.target.value));
              }}
              data-focus-ring="seamless"
              className="mono min-w-0 flex-1 bg-transparent text-right text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-caption)] text-[var(--fg)] outline-none"
            />
          </UnitBox>
        </Row>
      )}

      <Row label="수량" htmlFor={`mo-qty-${isin}`}>
        <UnitBox unit="주">
          <input
            id={`mo-qty-${isin}`}
            inputMode="numeric"
            autoComplete="off"
            value={qtyText}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setValidation(null);
              setQtyText(formatDigits(e.target.value));
            }}
            data-focus-ring="seamless"
            className="mono min-w-0 flex-1 bg-transparent text-right text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-caption)] text-[var(--fg)] outline-none"
          />
        </UnitBox>
      </Row>

      {aff.showPieceInput && (
        <Row label="조각 수" htmlFor={`mo-pieces-${isin}`}>
          <div className="flex min-w-0 items-center gap-1">
            <StepButton label="조각 줄이기" onClick={() => stepPieces(-1)}>
              −
            </StepButton>
            <UnitBox unit={`/ 최대 ${aff.maxPieces}`}>
              <input
                id={`mo-pieces-${isin}`}
                inputMode="numeric"
                autoComplete="off"
                value={pieceText}
                onChange={(e) => setPieceText(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => setPieceText(String(pieces))}
                data-focus-ring="seamless"
                className="mono min-w-0 flex-1 bg-transparent text-right text-[length:var(--t-base)] pointer-fine:text-[length:var(--t-caption)] text-[var(--fg)] outline-none"
              />
            </UnitBox>
            <StepButton label="조각 늘리기" onClick={() => stepPieces(1)}>
              +
            </StepButton>
          </div>
        </Row>
      )}

      <div className="flex min-w-0 items-baseline justify-between gap-[var(--s-2)] rounded-[var(--r-md)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]">
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
          주문금액
        </span>
        <b className="mono min-w-0 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          {offHours ? '종가 확정 후' : `${KRW.format(price * qty)}원`}
        </b>
      </div>

      {/*
        4버튼 2×2 — D-20 이 단일 제출 버튼 규율을 뒤집은 자리(②). 윗줄 매수 | 매도, 아랫줄 정정 | 취소
        (사용자 요청 2026-09-23 — 한 줄 4개는 버튼이 좁았다). 매수가 **왼쪽**, 매도가 그 오른쪽이다(3중 일치).
      */}
      <div
        data-testid="manual-order-buttons"
        className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-1"
      >
        <OrderButton tone="buy" disabled={sideDisabled} onClick={() => handleAction('buy')}>
          <SideLabel label={buyLabel} />
        </OrderButton>
        <OrderButton tone="sell" disabled={sideDisabled} onClick={() => handleAction('sell')}>
          <SideLabel label={sellLabel} />
        </OrderButton>
        <OrderButton
          tone="plain"
          disabled={modifyDisabled}
          title={modifyLock ?? undefined}
          onClick={() => handleAction('modify')}
        >
          정정
        </OrderButton>
        <OrderButton tone="plain" disabled={cancelDisabled} onClick={() => handleAction('cancel')}>
          취소
        </OrderButton>
      </div>

      {sending && (
        <p role="status" aria-live="polite" className="m-0 text-[11px] text-[var(--muted-fg)]">
          주문 전송 중…
        </p>
      )}
      {!sending && gateDisabled && DISABLED_LABEL[status] && (
        <p role="status" aria-live="polite" className="m-0 text-[11px] text-[var(--muted-fg)]">
          {DISABLED_LABEL[status]}
        </p>
      )}

      {validation && (
        <p
          role="status"
          aria-live="polite"
          data-testid="manual-order-validation"
          className="m-0 break-words text-[11px] font-semibold text-[var(--fg)]"
        >
          {validation}
        </p>
      )}

      {aff.confirmNote && (
        <p className="m-0 break-words text-[11px] leading-snug text-[var(--muted-fg)]">
          {aff.confirmNote}
        </p>
      )}

      {result && <ResultBanner result={result} />}
      {/* 결과 모름 잠금인데 이 폼에 결과 배너가 없다 = ✕ 뒤 다시 연 카드 · 다른 화면에서 돌아온 폼 ·
          같은 키의 호가 탭(R3 목업 ③ 3-b — 같은 요소 · 같은 원문). */}
      {lock === 'result-unknown' && result?.kind !== 'unknown' && (
        <p
          role="status"
          aria-live="polite"
          data-testid="manual-order-locked"
          className="m-0 break-keep rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--fg)]"
        >
          {RESULT_UNKNOWN_LOCKED_TEXT}
        </p>
      )}

      {variant === 'orderbook' && (
        <p className="m-0 break-words text-[11px] leading-snug text-[var(--muted-fg)]">
          {ORDERBOOK_FOOTNOTE}
        </p>
      )}

      <OrderConfirmDialog
        detail={confirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            pendingReqRef.current = null;
          }
        }}
        onConfirm={handleConfirmed}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   적응형 진입 (D-19) — <700 3탭 / ≥700 덮기
   ────────────────────────────────────────────────────────────────────────── */

export interface ManualOrderEntryProps {
  /** 옵션 영역(상따 4그룹 폼). **언제나 마운트돼 있다** — 덮는 동안에도 값이 보존된다. */
  options: ReactNode;
  /** 수동주문 폼(`ManualOrderForm`). 역시 언제나 마운트. */
  form: ReactNode;
  /** 덮기 헤더의 「키 {ISIN}:{계좌}:{거래소}」 값. */
  keyLabel: string;
  /**
   * 폰 밴드 3탭 중 「매수」/「매도」를 눌렀을 때 — 옵션 영역이 그 pane 을 보이도록 상위가 잇는다
   * (상따 폼의 pane 탭과 같은 축). 이 컴포넌트는 옵션 내부 pane 을 모른다.
   */
  onOptionsTab?: (tab: 'buy' | 'sell') => void;
  className?: string;
}

/**
 * 한 규칙 두 표현 — 폭 판정은 **CSS 컨테이너 쿼리**(`@min-[700px]/lc:`)에 맡기고 JS 는 폭을 재지
 * 않는다. 상태는 둘을 함께 든다: 폰 밴드의 선택 탭(`tab`)과 700 이상의 덮기(`cover`). 밴드마다
 * 자기 상태 하나만 쓴다(목업 `data-tabman`·`data-cover` 와 같은 구조).
 *
 * ★ 두 pane 을 조건부 렌더로 바꾸지 마라. 언마운트하면 옵션 값(더티 입력)과 폼 입력이 사라진다.
 *   바뀌는 것은 클래스뿐이다(`limit-chaser-form.tsx` pane 전환과 같은 문법).
 */
export function ManualOrderEntry({
  options,
  form,
  keyLabel,
  onOptionsTab,
  className,
}: ManualOrderEntryProps) {
  const [tab, setTab] = useState<'buy' | 'sell' | 'manual'>('buy');
  const [cover, setCover] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (cover || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    openRef.current?.focus(); // 닫은 뒤 포커스는 「수동주문」 버튼으로 복귀(접근성 계약).
  }, [cover]);

  const closeCover = () => {
    restoreFocusRef.current = true;
    setCover(false);
  };

  const onFormKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !cover) return;
    // 포털된 확인 다이얼로그의 Escape 는 React 트리로 여기까지 올라온다 — DOM 안쪽 것만 받는다.
    if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return;
    e.stopPropagation();
    closeCover();
  };

  const manualTab = tab === 'manual';

  return (
    <div data-slot="manual-entry" className={cn('flex min-w-0 flex-col', className)}>
      {/* 폰 밴드(<700) — 「매수 | 매도 | 수동」 3탭 */}
      <div
        role="tablist"
        aria-label="주문 진입"
        className="mb-[var(--s-2)] grid grid-cols-3 gap-[var(--s-1)] @min-[700px]/lc:hidden"
      >
        {(['buy', 'sell', 'manual'] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t);
                if (t !== 'manual') onOptionsTab?.(t);
              }}
              className={cn(
                'h-9 min-w-0 rounded-[var(--r)] border text-[length:var(--t-sm)] font-semibold',
                active && t === 'buy' && 'border-[var(--up)] bg-[var(--up-bg)] text-[var(--up)]',
                active && t === 'sell' && 'border-[var(--down)] bg-[var(--down-bg)] text-[var(--down)]',
                active && t === 'manual' && 'border-[var(--fg)] bg-[var(--muted)] text-[var(--fg)]',
                !active && 'border-[var(--border)] bg-transparent text-[var(--muted-fg)]',
              )}
            >
              {t === 'buy' ? '매수' : t === 'sell' ? '매도' : '수동'}
            </button>
          );
        })}
      </div>

      {/* 700 이상 — 옵션 우상단 「수동주문」 버튼 / 덮은 뒤 헤더 */}
      <div className="mb-1 hidden min-h-[26px] min-w-0 items-center gap-[var(--s-2)] @min-[700px]/lc:flex">
        {cover ? (
          <>
            <b className="flex-none text-[length:var(--t-caption)] text-[var(--fg)]">수동주문</b>
            <span className="mono min-w-0 flex-1 truncate text-[11px] text-[var(--muted-fg)]">
              키 {keyLabel}
            </span>
            <button
              type="button"
              aria-label="수동주문 닫기"
              onClick={closeCover}
              className="ml-auto h-6 flex-none rounded-[var(--r)] px-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)] hover:bg-[var(--muted)]"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            ref={openRef}
            type="button"
            onClick={() => setCover(true)}
            className="ml-auto h-6 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-2 text-[length:var(--t-caption)] font-semibold text-[var(--fg)] hover:bg-[var(--muted)]"
          >
            수동주문
          </button>
        )}
      </div>

      <div
        data-testid="manual-entry-options"
        className={cn(
          'min-w-0',
          manualTab ? 'hidden' : 'block',
          cover ? '@min-[700px]/lc:hidden' : '@min-[700px]/lc:block',
        )}
      >
        {options}
      </div>
      <div
        data-testid="manual-entry-form"
        onKeyDown={onFormKeyDown}
        className={cn(
          'min-w-0',
          manualTab ? 'block' : 'hidden',
          cover ? '@min-[700px]/lc:block' : '@min-[700px]/lc:hidden',
        )}
      >
        {form}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   조각들
   ────────────────────────────────────────────────────────────────────────── */

/** 신규 검증 — relay 조립기와 같은 순서·같은 원문(UI-SPEC §게이트 문구). */
function validateNew(v: {
  isin: string;
  accountNo: string;
  qty: number;
  price: number;
  offHours: boolean;
}): string | null {
  if (v.isin.length === 0) return '주문 종목을 확인하지 못했어요.';
  if (v.accountNo.length === 0) return '주문 계좌를 선택해 주세요.';
  if (!(v.qty > 0)) return '주문 수량을 확인해 주세요.';
  if (!v.offHours && !(v.price > 0)) return '주문 가격을 확인해 주세요.';
  return null;
}

/**
 * 주문 결과 (D-27 — 기존 원문 그대로). 셋 다 인라인 `role="status"`.
 * 결과 모름은 접수와 같은 **중립 톤**이다 — 거부 톤을 쓰면 그게 곧 「실패」로 읽힌다.
 */
function ResultBanner({ result }: { result: OrderResult }) {
  const [title, detail] =
    result.kind === 'accepted'
      ? [`주문이 접수됐어요 · 주문번호 ${result.orderNo}`, '체결되면 미체결·잔고가 자동으로 갱신돼요.']
      : result.kind === 'rejected'
        ? [
            `주문이 거부됐어요 · ${result.message}`,
            `주문은 나가지 않았어요. 사유를 확인한 뒤 다시 시도해 주세요. (코드 ${result.resultCode})`,
          ]
        : [
            '접수 응답이 늦어지고 있어요',
            '주문이 이미 나갔을 수 있어요. 미체결 목록에서 접수 여부를 확인한 뒤 다시 주문해 주세요.',
          ];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="manual-order-result"
      data-kind={result.kind}
      className="flex min-w-0 flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
    >
      <span className="break-words text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
        {title}
      </span>
      <span className="break-words text-[11px] text-[var(--muted-fg)]">{detail}</span>
    </div>
  );
}

/** 폼 한 행 — 라벨 칸 `--lw`(76→104, 상따 폼과 같은 축) + 컨트롤. */
function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-1.5">
      {label ? (
        <label
          htmlFor={htmlFor}
          className="whitespace-nowrap text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
        >
          {label}
        </label>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * 입력 + 단위 상자. `locked` = 시간외종가 가격 잠금(`--muted` 배경).
 * 포커스는 상따 폼 `NumInput` 과 같은 **테두리 한 겹**(`focus-within:border-[var(--ring)]`)이다 —
 * 안의 입력이 `data-focus-ring="seamless"` 로 전역 이중 링을 걷는 것과 **한 쌍**이다(globals.css §8.5.5).
 */
function UnitBox({
  unit,
  locked = false,
  children,
}: {
  unit: string;
  locked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-8 min-w-0 flex-1 items-center gap-1 rounded-[var(--r)] border border-[var(--input)] px-2 text-[length:var(--t-caption)] focus-within:border-[var(--ring)]',
        locked ? 'bg-[var(--muted)]' : 'bg-[var(--bg)]',
      )}
    >
      {children}
      <span className="flex-none whitespace-nowrap text-[11px] text-[var(--muted-fg)]">{unit}</span>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-8 w-8 flex-none rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] text-[length:var(--t-sm)] text-[var(--fg)] hover:bg-[var(--muted)]"
    >
      {children}
    </button>
  );
}

/**
 * 주문 버튼. 매수 = `--up` 채움 · 매도 = `--down` 채움 · 정정/취소 = `--card` 중립.
 * 폰 밴드(<700)는 13px · `line-height:1.15` · 줄바꿈 허용(「예약」이 윗줄로), 700 이상은 14px 한 줄.
 * (2×2 배치로 버튼 폭이 넓어져 옛 10/11px 는 너무 작았다 — 2026-09-23 사용자 지시.)
 */
function OrderButton({
  tone,
  disabled,
  title,
  onClick,
  children,
}: {
  tone: 'buy' | 'sell' | 'plain';
  disabled: boolean;
  /** 비활성 사유(정정 잠금). */
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'h-9 min-w-0 overflow-hidden rounded-[var(--r)] border px-px text-[13px] leading-[1.15] font-bold whitespace-normal',
        '@min-[700px]/lc:px-0.5 @min-[700px]/lc:text-[length:var(--t-sm)] @min-[700px]/lc:whitespace-nowrap',
        'disabled:cursor-default disabled:opacity-45',
        tone === 'buy' && 'border-transparent bg-[var(--up)] text-[var(--destructive-fg)]',
        tone === 'sell' && 'border-transparent bg-[var(--down)] text-[var(--destructive-fg)]',
        tone === 'plain' && 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)]',
      )}
    >
      {children}
    </button>
  );
}

/** 「예약매수」의 「예약」은 폰 밴드에서 윗줄로 접힌다. 접근 가능한 이름은 「예약매수」 그대로. */
function SideLabel({ label }: { label: string }) {
  if (!label.startsWith('예약')) return <>{label}</>;
  return (
    <>
      <span className="block @min-[700px]/lc:inline">예약</span>
      {label.slice(2)}
    </>
  );
}

/** 조각 수 → [1, max]. */
function clampPieces(n: number, max: number): number {
  const upper = Math.max(1, max);
  if (!(n >= 1)) return 1;
  return Math.min(Math.floor(n), upper);
}

/** 입력 문자열에서 숫자만 남겨 천단위 구분자로 다시 포맷한다. 빈 입력은 빈 문자열. */
function formatDigits(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? '' : KRW.format(parseDigits(digits));
}

/** 포맷된 입력 문자열을 숫자로. 빈 값·비숫자는 0. */
function digitsToNumber(text: string): number {
  return parseDigits(text.replace(/[^0-9]/g, ''));
}

function parseDigits(digits: string): number {
  return digits.length === 0 ? 0 : globalThis.Number(digits);
}
