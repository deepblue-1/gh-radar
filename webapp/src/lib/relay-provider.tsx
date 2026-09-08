"use client";

/**
 * Phase 16 Plan 09 — relay wss **전역 컨텍스트** (D-22 / D-23, TRADE-03 · NAV-01).
 *
 * ① 무엇을 하는가
 *   `useRelayConnection`(연결 1개)을 소유하고, 앱 전체에 **연결 상태 + 전략 상태 + 구독
 *   제어**를 컨텍스트로 노출한다. 호가주문 탭은 이 연결 위에 종목 구독만 얹는다
 *   (`useRelaySubscription`).
 *
 * ② 왜 전역인가 (D-22)
 *   사이드바 트레이딩 목록·My page 는 **종목을 구독하지 않고도** 상따·VI 상태를 봐야 한다.
 *   섹션 훅이면 호가주문 탭을 열어야만 전략이 보이고, 화면을 옮길 때마다 소켓이 다시 열려
 *   DMA 세션이 재수립된다(`SESSION_GRACE_MS` 5분 유예가 무의미해진다 — RESEARCH A9).
 *   relay 는 인증 직후 전략 스냅샷 3프레임(`lc.snap`·`vi`·`vi.list`)을 자동으로 내려주므로
 *   (D-12, 16-07) 브라우저는 **연결만 하면** 현재 전략 상태를 받는다. 따로 요청하지 않는다.
 *
 * ③ 배치 — `AuthProvider` **안쪽**이어야 한다 (D-23)
 *   `useAuth()` 의 세션 유무가 연결 게이트다. 비로그인은 아예 연결하지 않고, 로그아웃하면
 *   즉시 close 하며 이전 사용자의 계좌·전략을 상태에서 버린다(T-16-04).
 *   `AuthProvider.isLoading` 동안은 `user === null` 이라 자연히 연결하지 않는다 — 세션이
 *   확정된 뒤에 한 번만 연다.
 *
 * ④ 구독 참조계수
 *   소비자가 몇이든 와이어에는 키당 `sub` 1벌만 나간다. 0→1 에서만 `sub`, 1→0 에서만
 *   `unsub` — relay `SubscriptionHub#refs` 규율을 브라우저에서 재현한 것이고, 구현은
 *   `useRelayConnection` 안에 있다(소켓·인증 epoch 와 같은 곳에 있어야 재접속 재구독이
 *   한 경로로 처리된다).
 *
 * ⑤ ★ Provider 밖 안전 폴백 — **throw 하지 않는다**
 *   `useWatchlistSet` 의 규율을 그대로 복사했다. `AccountPanel`·`OrderbookLadder` 등
 *   기존 RTL 테스트는 Provider 없이 컴포넌트를 직접 렌더한다. 컨텍스트가 없을 때 throw 하면
 *   그 테스트가 전부 깨지고, 더 나쁘게는 **프로덕션에서 Provider 밖 렌더 1건이 화면 전체를
 *   날린다**. 빈 값 + no-op 을 돌려준다. 프로덕션은 항상 Provider 안쪽이다.
 *
 * ⑥ ★ 종목 격리는 **소비자 경계**의 책임이다 (T-16-02)
 *   전역 상태에는 여러 종목의 시세가 섞여 있다. `useRelaySubscription` 이 자기 키의 값만
 *   골라 돌려준다 — 승격 전 `wantedKeyRef` 지연 프레임 필터가 여기로 옮겨온 것이다.
 *   이 필터가 없으면 **종목 A 의 호가가 종목 B 화면에 떠서 그 가격으로 주문하는 사고**가
 *   난다(T-15-40).
 */

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";
import {
  relayQuoteKey,
  useRelayConnection,
  type RelayConnectionState,
  type RelaySocketState,
} from "@/lib/use-relay-socket";
import type {
  RelayExchange,
  RelayOrderResultMsg,
  RelayQuote,
  RelayTapeEntry,
} from "@gh-radar/shared";

/** 컨텍스트 값 = 연결 표면 그대로. 별도 축을 만들지 않는다(두 벌이 갈리지 않게). */
export type RelayContextValue = RelayConnectionState;

const NOOP = () => {};
const EMPTY_QUOTES: ReadonlyMap<string, RelayQuote> = new Map();
const EMPTY_TAPES: ReadonlyMap<string, RelayTapeEntry[]> = new Map();
/** 빈 테이프의 고정 참조 — 매 렌더 새 배열을 만들면 소비자 memo 가 전부 무효화된다. */
const EMPTY_TAPE: RelayTapeEntry[] = [];

/**
 * Provider 밖 폴백 값. **연결하지 않은 것과 구분되지 않는 모양**이어야 한다 —
 * `status: "idle"` 이므로 상태 바는 「연결 전」을 그리고 주문 버튼은 잠긴다.
 */
const EMPTY_RELAY_VALUE: RelayContextValue = {
  status: "idle",
  statusLabel: "",
  statusMessage: "",
  attempt: 0,
  accounts: [],
  quotes: EMPTY_QUOTES,
  tapes: EMPTY_TAPES,
  account: null,
  orders: [],
  messages: [],
  isStale: false,
  limitChasers: [],
  // 미조회다. Provider 밖에서는 아무것도 조회한 적이 없다.
  viTrigger: undefined,
  viOrders: [],
  viNotices: [],
  strategiesDisabled: null,
  send: NOOP,
  reconnect: NOOP,
  subscribe: NOOP,
  unsubscribe: NOOP,
  sendOrder: async (msg): Promise<RelayOrderResultMsg> => ({
    t: "order.result",
    rid: msg.rid,
    orderNo: "",
    resultCode: -1,
    // 보내지 **않았음**이 확실하다. 조용히 성공으로 위장하지 않는다(PC-7 무로그 fail-safe 금지).
    message: "시세 서버에 연결돼 있지 않아 주문을 보내지 못했어요.",
    status: "rejected",
  }),
};

const RelayContext = createContext<RelayContextValue | null>(null);

/**
 * 앱 전역 relay 연결 소유자. `AuthProvider` **안쪽**에 배치한다.
 *
 * 로그인 상태에서만 소켓을 연다(D-23). 로그아웃하면 `enabled` 가 false 로 떨어지면서
 * 연결 effect 의 cleanup 이 `unsub` → `close(1000)` 를 밟고 상태를 초기화한다.
 */
export function RelayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useRelayConnection({ enabled: user != null });

  return <RelayContext value={value}>{children}</RelayContext>;
}

/**
 * 전역 relay 상태 읽기. **Provider 바깥에서는 빈 값 + no-op** 을 돌려준다 —
 * 테스트가 Provider 없이 컴포넌트를 렌더해도 throw 하지 않는다(파일 상단 ⑤).
 *
 * 종목 시세가 필요하면 이 훅이 아니라 `useRelaySubscription` 을 쓴다 — 그래야 구독
 * 참조계수가 잡히고 자기 키의 값만 받는다.
 */
export function useRelayContext(): RelayContextValue {
  return useContext(RelayContext) ?? EMPTY_RELAY_VALUE;
}

export interface UseRelaySubscriptionOptions {
  /** 12자 ISIN. 비어 있으면 구독하지 않는다. */
  isin: string;
  /** 구독 거래소 (D-04 KRX/NXT 토글). */
  exchange: RelayExchange;
  /** false 면 구독하지 않고, true→false 전환 시 기존 구독을 해제한다. 기본 true. */
  enabled?: boolean;
}

/**
 * 종목 구독 소비자 훅.
 *
 * **반환 계약은 Phase 15 `useRelaySocket` 과 같다** — 그래서 `stock-orderbook-section.tsx`
 * 는 훅 호출 한 줄만 바뀌었다. 계약이 어긋나면 소비자를 고칠 게 아니라 이쪽을 맞춘다.
 *
 * ★ `quote`/`tape` 는 **자기 키의 값만** 돌려준다. 전역 맵에는 다른 종목이 섞여 있고,
 *   키가 바뀐 직후에는 새 키에 아직 값이 없어 자연히 `null`/`[]` 이 된다 — 전환 직전 키로
 *   지연 도착한 프레임이 화면에 올라올 여지가 구조적으로 없다(T-15-40 / T-16-02).
 * ★ `account`/`accounts`/`orders`/`messages` 는 **종목 축이 없다**. 전역 값을 그대로
 *   통과시킨다. 종목을 옮겼다고 잔고를 비우면 다음 델타가 올 때까지 계좌 패널이 빈다.
 */
export function useRelaySubscription({
  isin,
  exchange,
  enabled = true,
}: UseRelaySubscriptionOptions): RelaySocketState {
  const relay = useRelayContext();
  const { subscribe, unsubscribe } = relay;

  const active = enabled && isin.length > 0;

  useEffect(() => {
    if (!active) return;
    subscribe(isin, exchange);
    // 키가 바뀌면 **이전 키**를 해제한다 — 클로저가 붙잡은 isin/exchange 가 정확히 그것이다.
    // 빠뜨리면 relay 참조계수가 새고 업스트림 구독이 영원히 남는다.
    return () => unsubscribe(isin, exchange);
  }, [active, isin, exchange, subscribe, unsubscribe]);

  const key = relayQuoteKey(isin, exchange);
  const quote = active ? (relay.quotes.get(key) ?? null) : null;
  const tape = active ? (relay.tapes.get(key) ?? EMPTY_TAPE) : EMPTY_TAPE;

  return useMemo<RelaySocketState>(
    () => ({
      status: relay.status,
      statusLabel: relay.statusLabel,
      statusMessage: relay.statusMessage,
      attempt: relay.attempt,
      accounts: relay.accounts,
      quote,
      tape,
      account: relay.account,
      orders: relay.orders,
      messages: relay.messages,
      isStale: relay.isStale,
      send: relay.send,
      reconnect: relay.reconnect,
    }),
    [relay, quote, tape],
  );
}

export { RelayContext, EMPTY_RELAY_VALUE };
