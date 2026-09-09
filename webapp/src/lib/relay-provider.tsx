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
 *
 * ⑦ ★ 주문은 여기서 **와이어 모양으로 번역된다** (16-10, D-02)
 *   패널은 `{kind:"new"|"cancel", ...}` 라는 사람 말로 주문을 낸다. `rid` 생성과
 *   `{t:"order.new"}`/`{t:"order.cancel"}` 조립은 **이 파일 한 곳**이다 — 패널마다
 *   프레임을 조립하면 필드 하나가 어긋난 순간 그 화면에서만 주문이 조용히 거부된다.
 *   `market` 은 싣지 않는다: relay 가 ISIN 으로 푼다(D-28 — 단축코드·시장 산술 유도 금지).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth-context";
import {
  localOrderResult,
  relayQuoteKey,
  useRelayConnection,
  type RelayConnectionState,
  type RelaySocketState,
} from "@/lib/use-relay-socket";
import type {
  OrderSide,
  RelayAccountState,
  RelayExchange,
  RelayOrderCancelMsg,
  RelayOrderNewMsg,
  RelayOrderResultMsg,
  RelayQuote,
  RelayTapeEntry,
} from "@gh-radar/shared";

/**
 * 주문 1건 — **패널이 쓰는 모양**이다(와이어 모양이 아니다).
 *
 * `rid` 가 없는 것이 핵심이다. 상관 키를 호출부가 만들면 두 패널이 같은 값을 만들거나
 * 재사용할 여지가 생기고, relay 는 같은 `rid` 를 중복 요청으로 **거부한다**(T-16-10).
 * 생성처를 하나로 묶어 그 사고를 구조적으로 없앤다.
 */
export interface RelayOrderRequest {
  /** `"new"` = 신규(지정가·보통), `"cancel"` = 미체결 취소. */
  kind: "new" | "cancel";
  /** 12자 ISIN — 게이트웨이 주문 키(D-28). 6자 단축코드가 아니다. */
  isin: string;
  exchange: RelayExchange;
  /** 주문 계좌. 최종 대조는 relay 가 `session.allowedAccounts` 로 한다(T-16-01). */
  accountNo: string;
  /** 취소는 **미체결 잔량 전부**다(D-21 — 0 은 즉시 거부). */
  qty: number;
  price: number;
  /** `kind:"new"` 필수. */
  side?: OrderSide;
  /** `kind:"cancel"` 필수 — 원주문번호. */
  orgOrderNo?: string;
}

/**
 * 컨텍스트 값 = 연결 표면 + **주문 번역기**.
 *
 * `sendOrder` 만 연결 훅의 것과 모양이 다르다(와이어 프레임 → 요청 객체). 나머지는
 * 그대로 통과시킨다 — 별도 축을 만들면 두 벌이 갈린다.
 */
export type RelayContextValue = Omit<RelayConnectionState, "sendOrder"> & {
  /**
   * 주문 송신 + `rid` 상관 응답 대기 (D-02).
   *
   * **어떤 경로에서도 reject 하지 않는다.** 형식 오류·미연결·미응답이 전부
   * `RelayOrderResultMsg` 로 돌아온다. 호출부에 `catch` 분기를 만들면 그 분기가
   * 「실패」 문구를 쓰게 되고, 결과를 모르는 주문에 「실패」를 쓰는 순간 사용자가
   * 재주문해 중복 체결이 난다(S-8 / Pitfall 9).
   *  - `status:"rejected"` : 보내지 **않았음**이 확실하다 → 다시 시도해도 안전
   *  - `status:"timeout"`  : **결과를 모른다** → 미체결 목록 확인, 재주문 금지
   */
  sendOrder: (req: RelayOrderRequest) => Promise<RelayOrderResultMsg>;
};

/** `crypto.randomUUID` 폴백의 단조 카운터. 같은 ms 안의 두 주문을 가른다. */
let ridFallbackSeq = 0;

/**
 * 요청 상관 키. **유일해야 한다** — relay 는 같은 `rid` 를 중복 요청으로 거부하므로
 * (T-16-10) 겹치면 정상 주문이 「같은 주문이 이미 처리 중」으로 조용히 막힌다.
 *
 * `crypto.randomUUID` 는 **보안 컨텍스트**(https/localhost)에서만 정의된다. 사내망 http
 * 접속처럼 없는 환경이 실제로 존재하므로, 없으면 던지는 대신 시각 + 단조 카운터 + 난수로
 * 만든다. 던지면 주문 버튼이 통째로 죽는다.
 */
function newRid(): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === "function") return globalThis.crypto.randomUUID();
  ridFallbackSeq += 1;
  return `rid-${Date.now().toString(36)}-${ridFallbackSeq}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 요청 → 와이어 프레임. 형식이 어긋나면 **보내지 않고** 사유를 돌려준다.
 *
 * 왜 여기서 막는가: 필드가 빠진 주문을 그대로 흘리면 relay 가 거부하는데, 그 거부는
 * 「게이트웨이가 거부했다」와 화면에서 구분되지 않는다. 나가지 않은 것이 확실한 실패는
 * 여기서 확실하게 만든다.
 */
function buildOrderFrame(
  req: RelayOrderRequest,
  rid: string,
): { ok: true; frame: RelayOrderNewMsg | RelayOrderCancelMsg } | { ok: false; reason: string } {
  if (req.isin.length === 0) return { ok: false, reason: "주문 종목을 확인하지 못했어요." };
  if (req.accountNo.length === 0) return { ok: false, reason: "주문 계좌를 선택해 주세요." };
  // 취소 수량 0 은 게이트웨이가 즉시 거부한다(D-21). 왕복시키지 않는다.
  if (!(req.qty > 0)) return { ok: false, reason: "주문 수량을 확인해 주세요." };
  if (!(req.price > 0)) return { ok: false, reason: "주문 가격을 확인해 주세요." };

  const common = {
    rid,
    isin: req.isin,
    exchange: req.exchange,
    qty: req.qty,
    price: req.price,
    accountNo: req.accountNo,
  };

  if (req.kind === "cancel") {
    if (req.orgOrderNo == null || req.orgOrderNo.length === 0) {
      return { ok: false, reason: "취소할 원주문번호를 확인하지 못했어요." };
    }
    return { ok: true, frame: { t: "order.cancel", ...common, orgOrderNo: req.orgOrderNo } };
  }

  if (req.side == null) return { ok: false, reason: "매수·매도 구분을 확인하지 못했어요." };
  return { ok: true, frame: { t: "order.new", ...common, side: req.side } };
}

const NOOP = () => {};
const EMPTY_QUOTES: ReadonlyMap<string, RelayQuote> = new Map();
/** 빈 계좌 상태 맵의 고정 참조 — Provider 밖 폴백이 매 호출 새 Map 을 만들지 않게 한다. */
const EMPTY_ACCOUNT_STATES: ReadonlyMap<string, RelayAccountState> = new Map();
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
  accountStates: EMPTY_ACCOUNT_STATES,
  orders: [],
  messages: [],
  isStale: false,
  limitChasers: [],
  // 미조회다. Provider 밖에서는 아무것도 조회한 적이 없다.
  viTrigger: undefined,
  viOrders: [],
  viNotices: [],
  strategiesDisabled: null,
  // 보내지 **않았음**이 확실하다 — Provider 밖에는 소켓이 없다. 호출부가 반환값으로
  // 그 사실을 알 수 있어야 한다(PC-7 무로그 fail-safe 금지).
  send: () => false,
  reconnect: NOOP,
  subscribe: NOOP,
  unsubscribe: NOOP,
  // 보내지 **않았음**이 확실하다. 조용히 성공으로 위장하지 않는다(PC-7 무로그 fail-safe 금지).
  // `rid` 가 빈 문자열인 것도 사실 그대로다 — 요청을 만든 적이 없다.
  sendOrder: async (): Promise<RelayOrderResultMsg> =>
    localOrderResult("", "rejected", "시세 서버에 연결돼 있지 않아 주문을 보내지 못했어요."),
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
  const connection = useRelayConnection({ enabled: user != null });
  const { sendOrder: sendOrderFrame } = connection;

  /*
    요청 → 프레임 번역기. 대기 맵·타임아웃·단절 정산은 **연결 훅이 소유한다** —
    소켓과 같은 곳에 있어야 「연결이 끊기면 대기 중인 주문을 전부 결과 모름으로 닫는다」가
    한 경로로 처리된다. 여기서 두 번째 대기 맵을 만들면 그 정산이 한쪽에만 걸린다.
  */
  const sendOrder = useCallback(
    (req: RelayOrderRequest): Promise<RelayOrderResultMsg> => {
      const rid = newRid();
      const built = buildOrderFrame(req, rid);
      if (!built.ok) {
        // 조용히 무시하지 않는다(PC-7). 계좌번호는 싣지 않는다(T-16-09).
        console.error(
          `[relay] 주문 요청 형식 오류 — ${built.reason} (kind=${req.kind}, isin=${req.isin})`,
        );
        return Promise.resolve(localOrderResult(rid, "rejected", built.reason));
      }
      return sendOrderFrame(built.frame);
    },
    [sendOrderFrame],
  );

  const value = useMemo<RelayContextValue>(
    () => ({ ...connection, sendOrder }),
    [connection, sendOrder],
  );

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
      // 계좌 축 선택은 **소비자가** 한다 — 훅은 어느 계좌를 골랐는지 모른다(CR-01).
      accountStates: relay.accountStates,
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
