"use client";

/**
 * Phase 15 Plan 12 → **Phase 16 Plan 09 에서 전역 연결 계층으로 승격** (RELAY-01, D-11/D-22/D-23/D-33/D-36/D-37/D-41).
 *
 * 이 파일은 이제 **연결 1개**만 소유한다(`useRelayConnection`). 종목 축(`isin`/`exchange`)은
 * 여기서 사라졌고, 구독은 참조계수로 관리되며 소비자 경계는 `lib/relay-provider.tsx` 의
 * `useRelaySubscription` 이다.
 *
 * 왜 승격했나(D-22): 사이드바 전략 목록·My page 가 **종목 구독 없이도** 상따·VI 상태를 봐야
 * 한다. 섹션 단위 훅이면 호가주문 탭을 열어야만 전략이 보인다. 또한 화면마다 소켓을 새로 열면
 * DMA 세션이 매번 재수립돼 `SESSION_GRACE_MS` 5분 유예가 무의미해진다(RESEARCH A9).
 *
 * 규율 (전부 이유가 있다):
 *  1. **토큰은 wss 첫 메시지 본문 전용** (D-11). 업그레이드 URL·쿼리스트링에 절대 싣지
 *     않는다 — Caddy 액세스 로그와 브라우저 히스토리에 그대로 남기 때문이다(T-15-04).
 *  2. **구독은 인증 확인 이후** — relay 는 인증 전 `sub`/`unsub` 을 close(4400) 으로
 *     끊는다. relay 가 인증 직후 상태 프레임을 1회 즉시 내려주므로(15-04 연결수명 5)
 *     그 프레임을 인증 ACK 로 삼는다. 인증 전에 들어온 구독 요청은 참조계수에만 쌓아 두고
 *     ACK 시점에 한꺼번에 흘려보낸다(`flushSubscriptions`).
 *  3. **구독 해제를 빠뜨리지 않는다** — relay 는 키별 참조계수로 업스트림 구독을 관리한다.
 *     해제를 빠뜨리면 참조계수가 샌다. 브라우저도 같은 규율을 재현한다: `Map<key, count>` 의
 *     **0→1 에서만 `sub`**, **1→0 에서만 `unsub`**. 소비자가 여럿이어도 와이어는 1벌이다.
 *  4. **재접속은 유한하다** — 1s→2s→4s→8s… 상한 30s, 시도 상한 10회. 소진하면
 *     `manual_required`. close 4401(인증 실패)은 재시도해도 결과가 같으므로 즉시 확정.
 *     무한 재시도는 우리 스스로에게 거는 DoS 다(T-15-10, D-16).
 *  5. **재접속 중 데이터를 지우지 않는다** — `isStale` 만 세우고 마지막 값을 유지한다.
 *     빈 화면으로 되돌리면 사용자가 문맥을 잃는다(UI-SPEC §재접속·거래소 전환).
 *  6. **주문도 이 소켓으로 보낸다** (D-02 — Phase 15 D-08 을 대체). `POST /api/orders` REST
 *     경로는 없어진다. 요청/응답 상관은 브라우저가 만든 `rid` 이고, 첫 접수/거부는
 *     `{t:"order.result"}` 1건으로 온다. 이후 체결·취소확인은 `{t:"order"}` 푸시다.
 *  7. **시세·체결은 키별 맵에 담는다** — 전역 연결에는 여러 종목이 섞이므로 「내 키에
 *     해당하는 것만 고르기」는 **소비자 책임**이다(T-16-02). 승격 전의 `wantedKeyRef` 지연
 *     프레임 필터가 `useRelaySubscription` 으로 옮겨진 이유다.
 *
 * 파싱 실패 프레임은 throw 하지 않고 **스킵**한다 — `chat-sse.ts` 파서 선례(T-15-41).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resolveRelayWsUrl } from "@/lib/relay-url";
import {
  RELAY_STATE_LABELS,
  RELAY_WS_CLOSE,
  type RelayAccount,
  type RelayAccountState,
  type RelayExchange,
  type RelayHolding,
  type RelayInbound,
  type RelayLimitChaser,
  type RelayOrderCancelMsg,
  type RelayOrderMsg,
  type RelayOrderNewMsg,
  type RelayOrderResultMsg,
  type RelayOutbound,
  type RelayQuote,
  type RelayServerMsg,
  type RelaySessionState,
  type RelayStrategiesDisabledMsg,
  type RelayTapeEntry,
  type RelayUnfilled,
  type RelayViNoticeMsg,
  type RelayViOrderItem,
  type RelayViTrigger,
} from "@gh-radar/shared";

// ============================================================
// 상수 — 상한은 한 곳에만 둔다(두 곳에 복제하면 어긋난다)
// ============================================================

/** 체결 테이프 링버퍼 상한. relay 캐시와 동일(UI-SPEC §체결 테이프 스크롤). */
const MAX_TAPE = 200;
/** ServerMessage 누적 상한. 상태 바는 이 중 최근 3건만 렌더한다(C3). */
const MAX_MESSAGES = 20;
/** 주문 통보 누적 상한. */
const MAX_ORDERS = 50;
/** VI 발동 통지 누적 상한. 표시·이력용이라 오래된 건은 버린다. */
const MAX_VI_NOTICES = 50;
/**
 * 재접속 시도 상한 (D-16). 소진 시 `manual_required`.
 * 상태 바가 `재접속 중 k/10` 을 그릴 때도 이 값을 쓴다 — 상한을 두 곳에 복제하면 어긋난다.
 */
export const RELAY_MAX_RECONNECT_ATTEMPTS = 10;
/** 지수 백오프 시작 지연. */
const BACKOFF_BASE_MS = 1_000;
/** 지수 백오프 상한. */
const BACKOFF_MAX_MS = 30_000;
/** 정상 종료 close 코드. */
const NORMAL_CLOSE_CODE = 1000;
/**
 * 주문 상관 응답 대기 **백스톱**. relay 는 첫 `OrderResp(51)` 을 5초까지 기다린 뒤
 * `status:"timeout"` 을 반드시 돌려주므로(D-02) 정상 경로에서는 이 타이머가 발화하지 않는다.
 * 소켓이 조용히 죽어 relay 의 응답 자체가 오지 않는 경우에만 쓰인다 — 없으면 Promise 가
 * 영원히 매달려 주문 버튼이 잠긴 채로 남는다.
 */
const ORDER_RESULT_BACKSTOP_MS = 10_000;
/**
 * `WebSocket.OPEN`. 전역 `WebSocket` 의 정적 상수를 참조하지 않는 이유는 테스트가
 * 전역을 fake 클래스로 대체하기 때문이다 — 숫자 리터럴이 계약이다(RFC6455).
 */
const WS_READY_OPEN = 1;

/**
 * 백오프 지연 계산. attempt 는 1-based.
 * 상태 바의 `(다음 n초)` 안내도 이 함수를 통과시킨다(단일 정본).
 */
export function relayBackoffDelayMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
}

/**
 * 시세·체결·구독 키 (D-33 — 시세 키는 `isin + exchange`).
 *
 * 전역 맵의 키이자 구독 참조계수의 키다 — 두 축이 어긋나면 「구독은 했는데 값을 못 찾는」
 * 상태가 생기므로 **한 함수만** 쓴다.
 */
export function relayQuoteKey(isin: string, exchange: RelayExchange): string {
  return `${isin}|${exchange}`;
}

// ============================================================
// 공개 타입
// ============================================================

/** 아직 연결을 시작하지 않은 상태(`idle`)를 더한 훅 표면 상태. */
export type RelayStatus = RelaySessionState | "idle";

/**
 * ServerMessage + **수신 시각**.
 *
 * `RelayServerMsg`(54) 에는 시각 필드가 없는데 UI-SPEC C3 는 알림을 `시각·레벨·본문`
 * 으로 렌더하라고 못박았다. 서버가 주지 않는 값이므로 **브라우저 수신 시각**을
 * 여기서 한 번만 찍는다 — 렌더 때마다 만들면 값이 계속 흔들린다.
 * `RelayServerMsg` 의 상위집합이라 계약 소비자 쪽 타입은 그대로 성립한다.
 */
export type RelayServerMessageEntry = RelayServerMsg & {
  /** `HH:MM:SS` (로컬 시각). */
  receivedAt: string;
};

/** 알림 수신 시각 스탬프. 24시간제 `HH:MM:SS`. */
function clockStamp(now: Date): string {
  return now.toLocaleTimeString("ko-KR", { hour12: false });
}

/**
 * **종목 축이 없는** 전역 상태 표면. 사이드바·My page 처럼 구독 없이 전략만 보는 화면이
 * 그대로 소비한다. 종목별 시세·체결은 `quotes`/`tapes` 맵에서 **키로 골라** 쓴다.
 */
export interface RelayConnectionState {
  /** 세션 상태. 배지·주문 버튼 활성 여부의 정본. */
  status: RelayStatus;
  /** `RELAY_STATE_LABELS[status]`. `idle` 은 빈 문자열. */
  statusLabel: string;
  /** 서버가 보낸 보조 문구(`{t:"state"}.msg`). 없으면 빈 문자열. */
  statusMessage: string;
  /** 재접속 시도 회차 (1-based, 미재접속 시 0). */
  attempt: number;
  /** 허용 계좌 목록. **빈 배열인 `ready` 는 정상**이다(mock 로그인 — shared 주의 참조). */
  accounts: RelayAccount[];
  /** `isin|exchange` → 호가 10단. 여러 종목이 섞여 있으므로 **키로 골라 쓴다**(T-16-02). */
  quotes: ReadonlyMap<string, RelayQuote>;
  /** `isin|exchange` → 체결 테이프. **최신이 index 0**, 키당 상한 200. */
  tapes: ReadonlyMap<string, RelayTapeEntry[]>;
  /** 잔고·미체결 병합 결과. 델타는 upsert + 0행/`rm` 제거 후 스냅샷 형태로 정규화된다. */
  account: RelayAccountState | null;
  /** 주문 통보 누적(최신 우선). */
  orders: RelayOrderMsg[];
  /** ServerMessage 누적(최신 우선, 상한 20). 각 항목에 수신 시각이 붙어 있다. */
  messages: RelayServerMessageEntry[];
  /** 재접속 중이라 표시값이 마지막 수신값임을 뜻한다(UI 는 `opacity:.55` 감쇠). */
  isStale: boolean;
  /** 등록된 상따 전략 전수 (D-12 스냅샷 + 60 에코). `crud:"D"` 는 담기지 않는다. */
  limitChasers: RelayLimitChaser[];
  /**
   * VI 전략 설정 — **3상태**다. 뭉개면 「미조회」와 「미등록」이 같은 화면이 된다.
   *  - `undefined` : 아직 스냅샷을 못 받았다(연결 전·인증 전)
   *  - `null`      : 조회했고 **미등록**이다(서버가 빈 응답을 보냈다)
   *  - 객체        : 등록돼 있다
   */
  viTrigger: RelayViTrigger | null | undefined;
  /** VI 주문 추적 목록 (72 스냅샷 / 73 델타 병합 결과). */
  viOrders: RelayViOrderItem[];
  /** VI 발동 통지 누적(최신 우선, 상한 50). */
  viNotices: RelayViNoticeMsg[];
  /**
   * 전략 일괄 비활성화의 **완료 신호**(65). 마지막 1건만 보관한다.
   * ⚠️ 여기 담긴 숫자로 목록 상태를 만들지 않는다 — 행 갱신은 이미 60/61 에코가 끝냈다.
   */
  strategiesDisabled: RelayStrategiesDisabledMsg | null;
  /**
   * 송신구. 구독 제어(`sub`/`unsub`)와 **전략 설정**(`lc.set`/`vi.set`/`vi.confirm`/
   * `strategies.disable`)이 여기로 나간다. 소켓이 열려 있지 않으면 조용히 무시한다.
   * 주문은 상관 응답이 필요하므로 `sendOrder` 를 쓴다.
   */
  send: (msg: RelayInbound) => void;
  /** 수동 재연결. 백오프 카운터를 0 으로 되돌리고 새 소켓을 연다. */
  reconnect: () => void;
  /** 구독 참조계수 +1. 0→1 에서만 와이어에 `sub` 이 나간다. */
  subscribe: (isin: string, exchange: RelayExchange) => void;
  /** 구독 참조계수 -1. 1→0 에서만 와이어에 `unsub` 이 나간다. */
  unsubscribe: (isin: string, exchange: RelayExchange) => void;
  /**
   * 주문 송신 + `rid` 상관 응답 대기 (D-02).
   *
   * **reject 하지 않는다** — 모든 실패가 `RelayOrderResultMsg` 로 표면화된다.
   *  - 소켓 미연결 : `status:"rejected"` (보내지 **않았음**이 확실하다)
   *  - 응답 미도달 : `status:"timeout"` (**결과를 모름** — 주문이 이미 나갔을 수 있다)
   * 둘을 같은 값으로 뭉개면 UI 가 "재주문해도 안전한가"를 판단할 수 없다(Pitfall 9).
   */
  sendOrder: (msg: RelayOrderNewMsg | RelayOrderCancelMsg) => Promise<RelayOrderResultMsg>;
}

/**
 * 소비자(종목 구독) 표면. **Phase 15 의 `useRelaySocket` 반환 계약과 같은 모양**이다 —
 * 그래서 `stock-orderbook-section.tsx` 는 훅 호출 한 줄만 바뀌었다.
 */
export interface RelaySocketState {
  status: RelayStatus;
  statusLabel: string;
  statusMessage: string;
  attempt: number;
  accounts: RelayAccount[];
  /** **자기 구독 키**의 호가 10단. 아직 스냅샷 전이면 null. 다른 종목 값은 절대 오지 않는다. */
  quote: RelayQuote | null;
  /** **자기 구독 키**의 체결 테이프. 최신이 index 0. */
  tape: RelayTapeEntry[];
  account: RelayAccountState | null;
  orders: RelayOrderMsg[];
  messages: RelayServerMessageEntry[];
  isStale: boolean;
  /** 송신구. `RelayConnectionState.send` 와 같다(D-02 이후 전략·주문도 이 경로다). */
  send: (msg: RelayInbound) => void;
  reconnect: () => void;
}

export interface UseRelayConnectionOptions {
  /** false 면 연결하지 않고, true→false 전환 시 기존 연결을 정리한다. */
  enabled: boolean;
}

// ============================================================
// reducer
// ============================================================

interface RelayData {
  status: RelayStatus;
  statusMessage: string;
  attempt: number;
  accounts: RelayAccount[];
  quotes: Map<string, RelayQuote>;
  tapes: Map<string, RelayTapeEntry[]>;
  account: RelayAccountState | null;
  orders: RelayOrderMsg[];
  messages: RelayServerMessageEntry[];
  isStale: boolean;
  limitChasers: RelayLimitChaser[];
  viTrigger: RelayViTrigger | null | undefined;
  viOrders: RelayViOrderItem[];
  viNotices: RelayViNoticeMsg[];
  strategiesDisabled: RelayStrategiesDisabledMsg | null;
}

const INITIAL_DATA: RelayData = {
  status: "idle",
  statusMessage: "",
  attempt: 0,
  accounts: [],
  quotes: new Map(),
  tapes: new Map(),
  account: null,
  orders: [],
  messages: [],
  isStale: false,
  limitChasers: [],
  // 미조회(undefined) 와 미등록(null) 은 다른 화면이다 — 초기값은 미조회다.
  viTrigger: undefined,
  viOrders: [],
  viNotices: [],
  strategiesDisabled: null,
};

type RelayAction =
  /** 브라우저가 스스로 만든 상태(연결 시도·백오프·게이트). 서버 프레임이 아니다. */
  | { type: "local-status"; status: RelayStatus; message?: string; attempt?: number }
  /** 서버 프레임 1건. `at` 은 알림 스탬프용 수신 시각(`HH:MM:SS`). */
  | { type: "frame"; frame: RelayOutbound; at: string }
  /** 소켓 단절/복구에 따른 신선도 표식. */
  | { type: "stale"; value: boolean }
  /** 세션 종료(로그아웃·비활성화). 이전 사용자의 계좌·전략을 메모리에 남기지 않는다. */
  | { type: "reset" };

function relayReducer(state: RelayData, action: RelayAction): RelayData {
  switch (action.type) {
    case "local-status":
      return {
        ...state,
        status: action.status,
        statusMessage: action.message ?? "",
        attempt: action.attempt ?? 0,
      };

    case "stale":
      return state.isStale === action.value ? state : { ...state, isStale: action.value };

    case "reset":
      // 로그아웃(D-23)·비활성화에서 계좌·전략·시세를 통째로 버린다. 남겨 두면 다음 로그인
      // 사용자가 **이전 사용자의 잔고와 전략 목록**을 잠깐이라도 보게 된다(T-16-04).
      return INITIAL_DATA;

    case "frame":
      return applyFrame(state, action.frame, action.at);

    default:
      return state;
  }
}

function applyFrame(state: RelayData, frame: RelayOutbound, at: string): RelayData {
  switch (frame.t) {
    case "state":
      return {
        ...state,
        status: frame.s,
        statusMessage: frame.msg ?? "",
        attempt: frame.attempt ?? 0,
        // 계좌 목록은 프레임이 실어 보낼 때만 갱신한다(생략 = 변경 없음).
        accounts: frame.accounts ?? state.accounts,
        isStale: frame.s === "ready" ? false : state.isStale,
      };

    case "q": {
      const key = relayQuoteKey(frame.i, frame.x);
      const prev = state.quotes.get(key) ?? null;
      // snap=true 는 전량 교체, false 는 같은 키 병합 (D-33).
      // 키가 슬롯 동일성을 보장하므로 승격 전의 `sameSlot` 비교는 필요 없다.
      const quote = frame.snap || prev == null ? frame : { ...prev, ...frame };
      const quotes = new Map(state.quotes);
      quotes.set(key, quote);
      return { ...state, quotes, isStale: frame.snap ? false : state.isStale };
    }

    case "tape": {
      const key = relayQuoteKey(frame.i, frame.x);
      // 와이어는 시간 오름차순 배치 → 최신이 index 0 이 되도록 뒤집어 prepend 한다.
      const batch = [...frame.e].reverse();
      const prev = state.tapes.get(key) ?? [];
      const tapes = new Map(state.tapes);
      tapes.set(key, (frame.snap ? batch : [...batch, ...prev]).slice(0, MAX_TAPE));
      return { ...state, tapes };
    }

    case "acct":
      return { ...state, account: mergeAccount(state.account, frame) };

    case "order":
      return { ...state, orders: [frame, ...state.orders].slice(0, MAX_ORDERS) };

    case "msg":
      return {
        ...state,
        messages: [{ ...frame, receivedAt: at }, ...state.messages].slice(0, MAX_MESSAGES),
      };

    case "lc":
      // 60 에코 단건. `crud:"D"` 가 「삭제됨」의 정본이다 — 스위치 조합으로 판정하지
      // 않는다(Pitfall 7). upsert 는 **자리를 지킨다**: 뒤로 밀면 에코가 올 때마다
      // 사이드바 목록 순서가 튄다.
      return { ...state, limitChasers: upsertLimitChaser(state.limitChasers, frame.item) };

    case "lc.snap":
      // 64 전량 교체. `D` 행은 목록에 담지 않아 60 경로와 뜻을 맞춘다 —
      // `limitChasers` 는 언제나 「등록된 전략」이다.
      return { ...state, limitChasers: frame.items.filter((item) => item.crud !== "D") };

    case "vi":
      // `cfg: null` 은 **미등록**이다(무응답이 아니다). undefined 로 되돌리지 않는다 —
      // 되돌리면 「조회했는데 없음」이 「아직 모름」으로 퇴행한다.
      return { ...state, viTrigger: frame.cfg };

    case "vi.list":
      return {
        ...state,
        viOrders: frame.snap ? frame.items : mergeViOrders(state.viOrders, frame.items),
      };

    case "vi.notice":
      return { ...state, viNotices: [frame, ...state.viNotices].slice(0, MAX_VI_NOTICES) };

    case "strategies.disabled":
      // **완료 신호로만** 보관한다. 이 프레임이 온 시점에는 60/61 에코가 이미 모든 행을
      // 갱신해 뒀다 — 여기 담긴 숫자로 목록을 만들면 에코와 두 벌이 갈린다.
      return { ...state, strategiesDisabled: frame };

    default:
      // 알 수 없는 `t` 는 무시한다 — 서버가 앞서 나가도 브라우저가 터지지 않는다(T-15-41).
      // `order.result` 는 상태가 아니라 `rid` 상관 Promise 로 흘러가므로 여기 오지 않는다.
      return state;
  }
}

/** 상따 목록 upsert — **자리 보존**. 없으면 뒤에 붙이고, `crud:"D"` 면 지운다. */
function upsertLimitChaser(
  list: RelayLimitChaser[],
  item: RelayLimitChaser,
): RelayLimitChaser[] {
  if (item.crud === "D") return list.filter((c) => c.key !== item.key);
  const idx = list.findIndex((c) => c.key === item.key);
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

/**
 * VI 주문 추적 행의 병합 키.
 *
 * relay `subscription-hub.ts` 의 `viOrderKey`/`viPendingKey` 와 **같은 규칙**이어야 한다 —
 * 갈리면 새 탭(72 스냅샷)과 기존 탭(73 델타 누적)이 다른 목록을 본다.
 *
 * **접수 전(Pending)은 `orderNo` 가 `""`** 라 주문번호로 키를 만들 수 없다. 그대로 `""` 를
 * 키로 쓰면 서로 다른 종목의 접수 전 항목이 한 줄로 겹쳐 사라진다. 같은 종목·계좌의 한 VI
 * 발동은 1건이므로 `@ISIN:계좌:발동가` 가 유일하다. `@` 는 주문번호와 섞이지 않게 하는 표식이다.
 */
function viOrderKey(item: RelayViOrderItem): string {
  return item.orderNo !== "" ? item.orderNo : viPendingKey(item);
}

/** 접수 전 항목의 자리표시 키. 주문번호가 붙는 순간 이 키를 지우고 주문번호 키로 옮긴다. */
function viPendingKey(item: RelayViOrderItem): string {
  return `@${item.isin}:${item.accountNo}:${item.triggerPrice}`;
}

/** 73 델타 병합 — 키 upsert. `snap` 은 호출부에서 전량 교체로 처리한다. */
function mergeViOrders(
  prev: RelayViOrderItem[],
  incoming: RelayViOrderItem[],
): RelayViOrderItem[] {
  const merged = new Map<string, RelayViOrderItem>(prev.map((item) => [viOrderKey(item), item]));
  for (const item of incoming) {
    const key = viOrderKey(item);
    // 접수되며 주문번호가 붙었으면 자리표시 행을 걷어낸다 — 안 그러면 같은 주문이 두 줄이다.
    const pending = viPendingKey(item);
    if (key !== pending) merged.delete(pending);
    merged.set(key, item);
  }
  return [...merged.values()];
}

/**
 * 계좌 상태 병합. `snap` 이면 전량 교체, 아니면 키 upsert + 0행/`rm` 제거 후
 * **스냅샷 형태로 정규화**한다(소비자가 델타를 다시 해석하지 않게).
 *
 * **서버가 0/0 원소를 지우므로 델타의 0 행이 곧 삭제 신호다** (gh-trade quick-260906-e8b).
 * 전량 매도된 잔고는 `{qty:0, sellableQty:0, avgPrice:0}` 톰스톤 행으로 온다 — 잔고에는
 * `rm` 같은 삭제 표식이 없다(그 배열은 미체결 전용). 미체결은 `rm` 이 정규 경로지만
 * `unfilledQty === 0` 행도 삭제로 읽는다. 스냅샷에서 0 행을 거르는 것은 구버전
 * 게이트웨이 호환이다(배포 이전 바이너리는 스냅샷에 0 잔고를 섞어 보낸다).
 *
 * relay 캐시(`subscription-hub.ts` 의 `#mergeAccountState`)와 **한 글자도 다르면 안 된다** —
 * 갈리면 새 탭(캐시 재생)과 기존 탭(델타 누적)이 다른 잔고를 본다.
 */
function mergeAccount(
  prev: RelayAccountState | null,
  next: RelayAccountState,
): RelayAccountState {
  if (next.snap || prev == null || prev.a !== next.a) {
    return {
      ...next,
      snap: true,
      hold: next.hold.filter((h) => h.qty !== 0),
      unf: next.unf.filter((u) => u.unfilledQty !== 0),
      rm: [],
    };
  }

  const holdings = new Map<string, RelayHolding>(prev.hold.map((h) => [h.isin, h]));
  for (const h of next.hold) {
    if (h.qty === 0) holdings.delete(h.isin);
    else holdings.set(h.isin, h);
  }

  const unfilled = new Map<string, RelayUnfilled>(prev.unf.map((u) => [u.orderNo, u]));
  for (const u of next.unf) {
    if (u.unfilledQty === 0) unfilled.delete(u.orderNo);
    else unfilled.set(u.orderNo, u);
  }
  // 삭제 표식은 upsert **뒤에** 적용한다 — 같은 델타가 한 주문을 갱신하면서 동시에
  // 지우라고 말하면 최종 상태는 "없음"이어야 한다.
  for (const orderNo of next.rm) unfilled.delete(orderNo);

  return {
    ...next,
    snap: true,
    hold: [...holdings.values()],
    unf: [...unfilled.values()],
    rm: [],
  };
}

// ============================================================
// 주문 상관 응답 — 실패도 결과 프레임으로 표면화한다
// ============================================================

/** 브라우저가 만든 합성 결과. `resultCode: -1` 은 「서버가 준 코드가 아님」의 표식이다. */
function localOrderResult(
  rid: string,
  status: RelayOrderResultMsg["status"],
  message: string,
): RelayOrderResultMsg {
  return { t: "order.result", rid, orderNo: "", resultCode: -1, message, status };
}

interface PendingOrder {
  resolve: (result: RelayOrderResultMsg) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ============================================================
// 연결 훅 — 앱 전체에 **1개**만 존재한다 (RelayProvider 가 소유)
// ============================================================

export function useRelayConnection({
  enabled,
}: UseRelayConnectionOptions): RelayConnectionState {
  const [data, dispatch] = useReducer(relayReducer, INITIAL_DATA);

  /** 현재 살아 있는 소켓. 구독 제어와 `send` 가 공유한다. */
  const socketRef = useRef<WebSocket | null>(null);
  /** 인증 ACK(첫 상태 프레임) 수신 여부. 소켓마다 초기화된다. */
  const authAckedRef = useRef(false);
  /** 구독 참조계수. 0→1 에서만 `sub`, 1→0 에서만 `unsub` (relay `SubscriptionHub#refs` 동형). */
  const subRefsRef = useRef<Map<string, { isin: string; ex: RelayExchange; count: number }>>(
    new Map(),
  );
  /** **와이어에 실제로 걸려 있는** 구독. 소켓이 바뀌면 비워지고 재접속 시 다시 채워진다. */
  const wireSubsRef = useRef<Map<string, { isin: string; ex: RelayExchange }>>(new Map());
  /** `rid` → 대기 중인 주문 Promise. */
  const pendingOrdersRef = useRef<Map<string, PendingOrder>>(new Map());
  /**
   * 최신 상태의 거울. `flushSubscriptions` 는 ref 기반 명령형 함수라 리렌더에 묶이지
   * 않는데, `unauthorized` 판정에는 최신 상태가 필요하다.
   */
  const statusRef = useRef<RelayStatus>("idle");
  statusRef.current = data.status;

  /** 인증 ACK 를 구독 effect 로 전파하는 epoch. 재접속마다 증가한다. */
  const [authEpoch, setAuthEpoch] = useState(0);
  /** `reconnect()` 가 증가시키는 nonce — 연결 effect 를 강제로 다시 돌린다. */
  const [reconnectNonce, setReconnectNonce] = useState(0);

  /**
   * 참조계수 ≥1 인데 아직 와이어에 없는 키를 전부 `sub` 한다.
   *
   * 인증 전 구독 요청의 지연 반영과 **재접속 후 재구독**이 같은 한 함수를 탄다 —
   * 두 경로를 따로 만들면 한쪽만 고쳐져 조용히 갈린다. `wireSubs` 가 중복 송신을 막으므로
   * 참조계수가 2든 5든 와이어에는 `sub` 이 **1번만** 나간다.
   */
  const flushSubscriptions = useCallback(() => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) return;
    // 인증 ACK 전 구독은 relay 가 close(4400) 로 끊는다.
    if (!authAckedRef.current) return;
    // 권한 없음은 relay 가 구독을 무시하는 상태다 — 보내지 않는다.
    if (statusRef.current === "unauthorized") return;

    for (const [key, entry] of subRefsRef.current) {
      if (entry.count < 1 || wireSubsRef.current.has(key)) continue;
      ws.send(JSON.stringify({ t: "sub", isin: entry.isin, ex: entry.ex }));
      wireSubsRef.current.set(key, { isin: entry.isin, ex: entry.ex });
    }
  }, []);

  /** 대기 중인 주문을 전부 「결과 모름」으로 닫는다(소켓 단절·정리). */
  const abandonPendingOrders = useCallback((message: string) => {
    for (const [rid, pending] of pendingOrdersRef.current) {
      clearTimeout(pending.timer);
      pending.resolve(localOrderResult(rid, "timeout", message));
    }
    pendingOrdersRef.current.clear();
  }, []);

  // ---------------------------------------------------------
  // 연결 수명 — 종목에 의존하지 않는다. 앱이 열려 있는 동안 1연결이다(D-22).
  // ---------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      // D-23 — 비로그인/로그아웃. 상태를 idle 로 되돌리고 세션 데이터를 버린다.
      dispatch({ type: "reset" });
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    /**
     * `open()` 이 던지는 모든 예외를 상태로 바꾼다.
     *
     * Phase 15 Plan 13 발견: Supabase 환경변수 오설정 등으로 `createClient()` 가 던지면
     * `void open()` 이 **unhandled rejection** 이 되고, 화면은 `시세 서버 연결 중…` 에서
     * 영원히 멈춘 채 사용자에게 아무 이유도 알리지 않는다. 연결 실패는 조용히 삼키는
     * 대신 `failed` 로 표면화한다(상태 바가 문구를 그린다).
     */
    const openSafely = () => {
      void open().catch((err: unknown) => {
        if (disposed) return;
        dispatch({
          type: "local-status",
          status: "failed",
          message: err instanceof Error ? err.message : "시세 서버에 연결하지 못했어요.",
        });
      });
    };

    const open = async () => {
      if (disposed) return;

      dispatch({
        type: "local-status",
        status: attempt === 0 ? "connecting" : "reconnecting",
        attempt,
      });

      // 토큰 취득 경로는 chat-sse.ts 와 동일하다 — 클라이언트가 토큰을 보관·조작하지
      // 않고 Supabase SDK 가 갱신까지 관리한다.
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (disposed) return;

      if (!session) {
        // 로그인 게이트. 재시도해도 결과가 같으므로 백오프에 들어가지 않는다.
        dispatch({ type: "local-status", status: "unauthorized" });
        return;
      }

      let url: string;
      try {
        url = resolveRelayWsUrl();
      } catch (err) {
        dispatch({
          type: "local-status",
          status: "failed",
          message: err instanceof Error ? err.message : "wss 주소 설정이 잘못됐어요.",
        });
        return;
      }

      const ws = new WebSocket(url);
      socket = ws;
      socketRef.current = ws;
      authAckedRef.current = false;
      wireSubsRef.current.clear();

      ws.onopen = () => {
        // D-11 — 업그레이드 후 **첫 메시지**가 인증이다. 5초 안에 못 보내면 relay 가
        // close(4401) 한다. 토큰을 URL·쿼리스트링에 싣지 않는 이유는 파일 상단 참조.
        ws.send(JSON.stringify({ t: "auth", token: session.access_token }));
      };

      ws.onmessage = (event: MessageEvent) => {
        const frame = parseFrame(event.data);
        if (frame == null) return; // 깨진 프레임은 throw 하지 않고 스킵

        if (frame.t === "state") {
          if (frame.s === "ready") {
            // 정상 세션에 도달했으니 백오프 카운터를 되돌린다. `ready` 외의 상태에서
            // 리셋하면 "붙자마자 끊기는" 서버를 상대로 무한 재시도가 된다.
            attempt = 0;
          }
          if (!authAckedRef.current) {
            authAckedRef.current = true;
            setAuthEpoch((v) => v + 1);
          }
        }

        if (frame.t === "order.result") {
          // rid 상관 1회성 응답 — 상태에 쌓지 않고 대기 중인 Promise 로 흘린다.
          const pending = pendingOrdersRef.current.get(frame.rid);
          if (pending) {
            pendingOrdersRef.current.delete(frame.rid);
            clearTimeout(pending.timer);
            pending.resolve(frame);
          }
          return;
        }

        dispatch({ type: "frame", frame, at: clockStamp(new Date()) });
      };

      ws.onerror = () => {
        // close 가 뒤따르므로 여기서는 상태를 바꾸지 않는다(중복 전이 방지).
      };

      ws.onclose = (event: CloseEvent) => {
        if (socketRef.current === ws) socketRef.current = null;
        authAckedRef.current = false;
        wireSubsRef.current.clear();
        abandonPendingOrders(
          "연결이 끊겨 주문 결과를 받지 못했어요. 미체결 목록을 확인해 주세요.",
        );
        if (disposed) return;

        // 재시도해도 결과가 같은 close 코드는 즉시 확정한다 — 자기유발 DoS 방지(T-15-10).
        if (event.code === RELAY_WS_CLOSE.AUTH_TIMEOUT) {
          // 4401 = 인증 타임아웃/토큰 검증 실패.
          dispatch({ type: "local-status", status: "unauthorized" });
          return;
        }
        if (event.code === RELAY_WS_CLOSE.BAD_MESSAGE) {
          // 4400 = 프로토콜 위반. 브라우저 버그이므로 재시도가 무의미하다.
          dispatch({ type: "local-status", status: "failed" });
          return;
        }

        // 데이터를 지우지 않는다 — isStale 만 세운다(UI-SPEC 깜빡임 금지).
        dispatch({ type: "stale", value: true });

        attempt += 1;
        if (attempt > RELAY_MAX_RECONNECT_ATTEMPTS) {
          dispatch({
            type: "local-status",
            status: "manual_required",
            attempt: RELAY_MAX_RECONNECT_ATTEMPTS,
          });
          return;
        }
        dispatch({ type: "local-status", status: "reconnecting", attempt });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          openSafely();
        }, relayBackoffDelayMs(attempt));
      };
    };

    openSafely();

    return () => {
      disposed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }

      const ws = socket;
      socket = null;
      if (socketRef.current === ws) socketRef.current = null;

      if (ws) {
        // 리스너부터 떼어 close 핸들러가 백오프를 다시 걸지 않게 한다.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        if (ws.readyState === WS_READY_OPEN) {
          // 참조계수 누수 방지 — 언마운트(탭 이탈 포함)에서도 반드시 해제한다.
          for (const entry of wireSubsRef.current.values()) {
            ws.send(JSON.stringify({ t: "unsub", isin: entry.isin, ex: entry.ex }));
          }
          ws.close(NORMAL_CLOSE_CODE);
        } else {
          ws.close();
        }
      }

      authAckedRef.current = false;
      wireSubsRef.current.clear();
      abandonPendingOrders(
        "연결이 정리돼 주문 결과를 받지 못했어요. 미체결 목록을 확인해 주세요.",
      );
    };
  }, [enabled, reconnectNonce, abandonPendingOrders]);

  // ---------------------------------------------------------
  // 구독 반영 — 인증 ACK(재접속 포함)와 권한 상태 변화에서 밀린 구독을 흘려보낸다
  // ---------------------------------------------------------
  useEffect(() => {
    flushSubscriptions();
  }, [authEpoch, data.status, flushSubscriptions]);

  const subscribe = useCallback(
    (isin: string, exchange: RelayExchange) => {
      if (!isin) return;
      const key = relayQuoteKey(isin, exchange);
      const entry = subRefsRef.current.get(key);
      if (entry) entry.count += 1;
      else subRefsRef.current.set(key, { isin, ex: exchange, count: 1 });
      // 0→1 에서만 와이어가 움직인다 — `flushSubscriptions` 가 wireSubs 로 중복을 막는다.
      flushSubscriptions();
    },
    [flushSubscriptions],
  );

  const unsubscribe = useCallback((isin: string, exchange: RelayExchange) => {
    if (!isin) return;
    const key = relayQuoteKey(isin, exchange);
    const entry = subRefsRef.current.get(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return; // 아직 다른 소비자가 보고 있다

    subRefsRef.current.delete(key);
    const wire = wireSubsRef.current.get(key);
    if (!wire) return;
    wireSubsRef.current.delete(key);

    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) return;
    ws.send(JSON.stringify({ t: "unsub", isin: wire.isin, ex: wire.ex }));
  }, []);

  const send = useCallback((msg: RelayInbound) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const sendOrder = useCallback(
    (msg: RelayOrderNewMsg | RelayOrderCancelMsg): Promise<RelayOrderResultMsg> =>
      new Promise<RelayOrderResultMsg>((resolve) => {
        const ws = socketRef.current;
        if (!ws || ws.readyState !== WS_READY_OPEN) {
          // 보내지 **않았음**이 확실하다 — 재주문해도 이중 발주가 아니다.
          resolve(
            localOrderResult(
              msg.rid,
              "rejected",
              "시세 서버에 연결돼 있지 않아 주문을 보내지 못했어요.",
            ),
          );
          return;
        }

        const timer = setTimeout(() => {
          pendingOrdersRef.current.delete(msg.rid);
          // **결과를 모른다** — 주문이 이미 나갔을 수 있으므로 재주문을 유도하지 않는다.
          resolve(
            localOrderResult(
              msg.rid,
              "timeout",
              "주문 결과를 받지 못했어요. 미체결 목록을 확인해 주세요.",
            ),
          );
        }, ORDER_RESULT_BACKSTOP_MS);

        pendingOrdersRef.current.set(msg.rid, { resolve, timer });
        ws.send(JSON.stringify(msg));
      }),
    [],
  );

  const reconnect = useCallback(() => {
    setReconnectNonce((v) => v + 1);
  }, []);

  const statusLabel = data.status === "idle" ? "" : RELAY_STATE_LABELS[data.status];

  return useMemo<RelayConnectionState>(
    () => ({
      status: data.status,
      statusLabel,
      statusMessage: data.statusMessage,
      attempt: data.attempt,
      accounts: data.accounts,
      quotes: data.quotes,
      tapes: data.tapes,
      account: data.account,
      orders: data.orders,
      messages: data.messages,
      isStale: data.isStale,
      limitChasers: data.limitChasers,
      viTrigger: data.viTrigger,
      viOrders: data.viOrders,
      viNotices: data.viNotices,
      strategiesDisabled: data.strategiesDisabled,
      send,
      reconnect,
      subscribe,
      unsubscribe,
      sendOrder,
    }),
    [data, statusLabel, send, reconnect, subscribe, unsubscribe, sendOrder],
  );
}

/** JSON 프레임 파싱. 실패·비객체·`t` 없음은 전부 null(스킵). */
function parseFrame(raw: unknown): RelayOutbound | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 깨진 프레임은 throw 하지 않고 스킵한다 (chat-sse.ts 파서 선례, T-15-41).
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  if (typeof (parsed as { t?: unknown }).t !== "string") return null;
  return parsed as RelayOutbound;
}
