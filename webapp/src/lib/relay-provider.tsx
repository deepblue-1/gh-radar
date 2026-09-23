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
 *   패널은 `{kind:"new"|"modify"|"cancel", ...}` 라는 사람 말로 주문을 낸다. `rid` 생성과
 *   `{t:"order.new"}`/`{t:"order.modify"}`/`{t:"order.cancel"}` 조립은 **이 파일 한 곳**이다 — 패널마다
 *   프레임을 조립하면 필드 하나가 어긋난 순간 그 화면에서만 주문이 조용히 거부된다.
 *   `market` 은 싣지 않는다: relay 가 ISIN 으로 푼다(D-28 — 단축코드·시장 산술 유도 금지).
 *
 * ⑧ ★ 주문 잠금은 **앱 수명**이다 (18-34 · R3-WR-02 · R3-IN-01 · R3-IN-02 · 사용자 결정 2026-09-22)
 *   소유: 이 Provider(루트 레이아웃). 화면을 옮겨도 · 카드를 닫아도 살아 있다 — 결과를 모르는
 *   주문 뒤의 같은 주문은 중복 체결이 되므로(D-27 · Pitfall 9) 페이지 · 카드에 두면 이동 한 번에
 *   풀려 버린다. 작업대 카드 폼과 종목상세 호가 탭 폼이 **같은 키**로 이 한 잠금을 읽는다.
 *   키: `strategyKey(isin, accountNo, exchange)` — 새 키 형식을 만들지 않는다.
 *   등록: 형식을 통과해 **실제로 보내는** 신규 · 정정만. 취소는 어느 쪽에도 등록하지 않는다 —
 *     취소 재시도는 무해하고 relay 가 같은 원주문의 중복 취소 대기를 거부한다(T-16-10). 취소
 *     timeout 이 4버튼을 잠그면 위험 축소 동작까지 막힌다(사용자 결정 2).
 *   상태: 보내기 직전 「진행 중」 +1 → 결과가 오면 **한 액션**으로 진행 중 −1 과 (timeout 이면)
 *     「결과 모름」 을 함께 반영한다 — 두 상태 사이에 풀린 틈이 없다. 같은 키 진행 중이 둘이면
 *     둘 다 끝나야 풀린다(참조 계수). 결과 모름이 진행 중보다 우선한다.
 *   해제: 둘뿐이다 — 로그아웃 · 다른 사용자(사용자 id 변경 → 초기화 + 세대 증가)와 새로고침
 *     (Provider 재생성). 해제 버튼 · 타이머 · 에코 기반 해제는 없다. 요청은 시작 때 세대를 잡아
 *     두고, 결과가 왔을 때 세대가 바뀌었으면 정산하지 않는다 — 로그아웃 순간의 단절 정산(timeout)
 *     이 다음 사용자의 잠금이 되지 않게(T-18-141).
 *   저장: 브라우저 메모리뿐이다. 키에 계좌번호가 들어 있어 브라우저 저장소에 쓰지 않는다.
 *   이 규칙은 18-30 의 작업대 페이지 단위 잠금 배선을 대체한다(R3-WR-02 · 사용자 결정 1).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { useAuth } from "@/lib/auth-context";
import { strategyKey } from "@/lib/limit-chaser";
import type { OrderIndexEntry } from "@/lib/trading-alerts";
import {
  localOrderResult,
  relayQuoteKey,
  useRelayConnection,
  type RelayConnectionState,
  type RelaySocketState,
  type RelayViTriggers,
} from "@/lib/use-relay-socket";
import type {
  OrderSide,
  RelayAccountState,
  RelayExchange,
  RelayOrderCancelMsg,
  RelayOrderModifyMsg,
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
  /** `"new"` = 신규(지정가·보통), `"modify"` = 미체결 정정(Phase 18 D-21), `"cancel"` = 미체결 취소. */
  kind: "new" | "modify" | "cancel";
  /** 12자 ISIN — 게이트웨이 주문 키(D-28). 6자 단축코드가 아니다. */
  isin: string;
  exchange: RelayExchange;
  /** 주문 계좌. 최종 대조는 relay 가 `session.allowedAccounts` 로 한다(T-16-01). */
  accountNo: string;
  /** 취소는 **미체결 잔량 전부**다(D-21 — 0 은 즉시 거부). */
  qty: number;
  /** 주문가(원). 취소는 원주문 가격 그대로 — 시간외종가 원주문이면 0 (18-REVIEW CR-01). */
  price: number;
  /** `kind:"new"`/`"modify"` 필수. 정정은 원주문의 방향을 그대로 싣는다. */
  side?: OrderSide;
  /** `kind:"cancel"`/`"modify"` 필수 — 원주문번호. */
  orgOrderNo?: string;
  /**
   * `kind:"new"` 전용 — 예약구간 조각 수 (Phase 18 D-22). 부재·1 = 싣지 않는다(서버 기본값 1).
   * 정수 1..64 밖이면 보내지 않는다 — relay 스키마 위반은 소켓 close(4400)로 끝나기 때문이다.
   */
  pieceCount?: number;
  /**
   * `kind:"new"` 전용 — 시간외종가 세션 (Phase 18 D-23). 부재 = 서버 자동 판정.
   * 이 값이 있을 때만 `price: 0`(서버 결정가)이 허용된다.
   */
  krxSession?: "G2" | "G3";
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
  /**
   * 주문 잠금 — `strategyKey(isin, accountNo, exchange)` → 종류 (파일 상단 ⑧).
   * 키가 없으면 잠기지 않았다. 앱 수명이며 로그아웃 · 새로고침에만 비워진다.
   */
  orderLocks: ReadonlyMap<string, OrderLockKind>;
};

/**
 * 주문 잠금 종류 (⑧).
 *  - `"in-flight"`      : 신규 · 정정 요청이 전송 중(응답 전)이다
 *  - `"result-unknown"` : 신규 · 정정 요청의 결과를 모른다(timeout) — 로그아웃 · 새로고침 전까지 유지
 */
export type OrderLockKind = "in-flight" | "result-unknown";

/** 키 하나의 잠금 원자료. 두 값이 모두 비면 키를 지운다. */
interface OrderLockEntry {
  inFlight: number;
  resultUnknown: boolean;
}

type OrderLockAction =
  | { type: "start"; key: string }
  /** 진행 중 −1 과 (timeout 이면) 결과 모름을 **한 액션**으로 — 두 상태 사이에 틈이 없다. */
  | { type: "settle"; key: string; timedOut: boolean }
  | { type: "reset" };

const EMPTY_LOCK_STATE: ReadonlyMap<string, OrderLockEntry> = new Map();

function orderLockReducer(
  state: ReadonlyMap<string, OrderLockEntry>,
  action: OrderLockAction,
): ReadonlyMap<string, OrderLockEntry> {
  if (action.type === "reset") return state.size === 0 ? state : EMPTY_LOCK_STATE;
  const prev = state.get(action.key) ?? { inFlight: 0, resultUnknown: false };
  const entry: OrderLockEntry =
    action.type === "start"
      ? { inFlight: prev.inFlight + 1, resultUnknown: prev.resultUnknown }
      : {
          inFlight: Math.max(0, prev.inFlight - 1),
          resultUnknown: prev.resultUnknown || action.timedOut,
        };
  const next = new Map(state);
  if (entry.inFlight === 0 && !entry.resultUnknown) next.delete(action.key);
  else next.set(action.key, entry);
  return next;
}

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
):
  | { ok: true; frame: RelayOrderNewMsg | RelayOrderModifyMsg | RelayOrderCancelMsg }
  | { ok: false; reason: string } {
  if (req.isin.length === 0) return { ok: false, reason: "주문 종목을 확인하지 못했어요." };
  if (req.accountNo.length === 0) return { ok: false, reason: "주문 계좌를 선택해 주세요." };
  // 취소 수량 0 은 게이트웨이가 즉시 거부한다(D-21). 왕복시키지 않는다.
  if (!(req.qty > 0)) return { ok: false, reason: "주문 수량을 확인해 주세요." };
  // 가격 규칙은 **종류별**이다 (Phase 18 D-21 / D-23 / 18-REVIEW CR-01). 음수·NaN·비정수는 어느
  // 종류에서도 거부다.
  //   - 취소: 가격은 주문 조건이 아니라 **원주문 가격의 사본**이다 — 게이트웨이는 취소를 가격으로
  //     판정하지 않는다. 시간외종가(`close_price_mode="zero"`) 원주문은 가격 0 으로 접수되므로,
  //     취소는 「0 이상의 정수」면 통과한다. relay zod · 조립기 · DB CHECK 가 같은 규칙을 쓴다.
  //   - 신규: 양수, 또는 `krxSession` G2/G3 일 때만 0 (서버 결정가).
  //   - 정정: 양수만. 신규 전용 0 규칙을 정정으로 새게 하지 않는다.
  const priceOk =
    req.kind === "cancel"
      ? Number.isInteger(req.price) && req.price >= 0
      : req.kind === "modify"
        ? req.price > 0
        : req.price > 0 ||
          ((req.krxSession === "G2" || req.krxSession === "G3") && req.price === 0);
  if (!priceOk) {
    return { ok: false, reason: "주문 가격을 확인해 주세요." };
  }

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

  if (req.kind === "modify") {
    // 정정 = 원주문번호(취소처럼) + 방향(신규처럼). 어느 하나라도 없으면 relay 가 거부하므로
    // 보내기 전에 여기서 확실한 실패로 만든다.
    if (req.orgOrderNo == null || req.orgOrderNo.length === 0) {
      return { ok: false, reason: "정정할 원주문번호를 확인하지 못했어요." };
    }
    if (req.side == null) return { ok: false, reason: "매수·매도 구분을 확인하지 못했어요." };
    return {
      ok: true,
      frame: { t: "order.modify", ...common, orgOrderNo: req.orgOrderNo, side: req.side },
    };
  }

  if (req.side == null) return { ok: false, reason: "매수·매도 구분을 확인하지 못했어요." };
  if (
    req.pieceCount !== undefined &&
    !(Number.isInteger(req.pieceCount) && req.pieceCount >= 1 && req.pieceCount <= 64)
  ) {
    return { ok: false, reason: "조각 수를 확인해 주세요." };
  }
  // 값이 있을 때만 싣는다 — 부재가 곧 기본값이라 기존 수동주문 프레임이 한 글자도 바뀌지 않는다.
  // 조각 수 1 은 기본값과 같으므로 싣지 않는다.
  return {
    ok: true,
    frame: {
      t: "order.new",
      ...common,
      side: req.side,
      ...(req.pieceCount !== undefined && req.pieceCount > 1 ? { pieceCount: req.pieceCount } : {}),
      ...(req.krxSession !== undefined ? { krxSession: req.krxSession } : {}),
    },
  };
}

const NOOP = () => {};
const EMPTY_QUOTES: ReadonlyMap<string, RelayQuote> = new Map();
/** 빈 계좌 상태 맵의 고정 참조 — Provider 밖 폴백이 매 호출 새 Map 을 만들지 않게 한다. */
const EMPTY_ACCOUNT_STATES: ReadonlyMap<string, RelayAccountState> = new Map();
/** 빈 주문번호 색인의 고정 참조 — 같은 이유(소비자 효과가 헛돌지 않게). */
const EMPTY_ORDER_INDEX: ReadonlyMap<string, OrderIndexEntry> = new Map();
const EMPTY_TAPES: ReadonlyMap<string, RelayTapeEntry[]> = new Map();
/**
 * 두 거래소 모두 「아직 모름」인 고정 참조 (17-06 / D-06). 매 렌더 새 객체를 만들면
 * `viAnyRunning` 을 memo 로 감싼 소비처가 전부 무효화된다.
 */
const EMPTY_VI_TRIGGERS: RelayViTriggers = {};
/** 빈 테이프의 고정 참조 — 매 렌더 새 배열을 만들면 소비자 memo 가 전부 무효화된다. */
const EMPTY_TAPE: RelayTapeEntry[] = [];
/** 빈 주문 잠금의 고정 참조 (⑤ · ⑧) — Provider 밖 폴백이 매 호출 새 Map 을 만들지 않게 한다. */
const EMPTY_ORDER_LOCKS: ReadonlyMap<string, OrderLockKind> = new Map();

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
  accountStates: EMPTY_ACCOUNT_STATES,
  // 본 주문이 없다 — 알림 조인 색인도 비어 있다(quick-260923-pgu).
  orderIndex: EMPTY_ORDER_INDEX,
  orders: [],
  messages: [],
  isStale: false,
  limitChasers: [],
  // 서버가 답한 적이 **없다**. Provider 밖에는 소켓이 없으므로 60 에코도 없다.
  lastLimitChaserEcho: null,
  // 두 거래소 모두 미조회다. Provider 밖에서는 아무것도 조회한 적이 없다.
  viTriggers: EMPTY_VI_TRIGGERS,
  viOrders: [],
  viNotices: [],
  strategiesDisabled: null,
  // relay 가 above 집합을 아직 준 적이 없다 — 「돌파 없음」이 아니라 「연결 전」이다.
  rateCrossItems: [],
  // 78 을 적용한 적이 없다.
  rateCrossSnapSeq: 0,
  // 64 스냅샷을 받은 적이 없다 — Provider 밖에는 소켓이 없다.
  limitChaserSnapSeq: 0,
  // 예약창도 미수신이다. `open:false`(닫힘)로 위장하지 않는다.
  queuedWindow: undefined,
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
  // 보낸 주문이 없으므로 잠글 키도 없다.
  orderLocks: EMPTY_ORDER_LOCKS,
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
    주문 잠금 (⑧). 상태는 리듀서 하나 — 시작 · 정산 · 초기화 세 액션뿐이다.
    세대 ref 는 사용자 경계다: 로그아웃 · 다른 사용자로 바뀌면 올리고, 그 전에 시작한 요청의
    늦은 정산은 버린다.
  */
  const [lockState, dispatchLock] = useReducer(orderLockReducer, EMPTY_LOCK_STATE);
  const lockGenerationRef = useRef(0);
  const userId = user?.id ?? null;
  const lockUserIdRef = useRef(userId);
  useEffect(() => {
    if (lockUserIdRef.current === userId) return;
    lockUserIdRef.current = userId;
    lockGenerationRef.current += 1;
    dispatchLock({ type: "reset" });
  }, [userId]);

  const orderLocks = useMemo<ReadonlyMap<string, OrderLockKind>>(() => {
    if (lockState.size === 0) return EMPTY_ORDER_LOCKS;
    const out = new Map<string, OrderLockKind>();
    for (const [key, entry] of lockState) {
      if (entry.resultUnknown) out.set(key, "result-unknown");
      else if (entry.inFlight > 0) out.set(key, "in-flight");
    }
    return out;
  }, [lockState]);

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
      // 취소는 잠그지 않는다(⑧ · 사용자 결정 2). 형식 오류로 보내지 않은 요청은 위에서 이미 돌아갔다.
      if (req.kind === "cancel") return sendOrderFrame(built.frame);

      const key = strategyKey(req.isin, req.accountNo, req.exchange);
      const generation = lockGenerationRef.current;
      dispatchLock({ type: "start", key });
      // `sendOrderFrame` 은 reject 하지 않는다(연결 훅 계약). 정산을 반영한 **뒤에** 결과를
      // 돌려준다 — 호출자의 `await` 뒤 렌더가 이미 새 잠금을 본다.
      return sendOrderFrame(built.frame).then((result) => {
        if (lockGenerationRef.current === generation) {
          dispatchLock({ type: "settle", key, timedOut: result.status === "timeout" });
        }
        return result;
      });
    },
    [sendOrderFrame],
  );

  const value = useMemo<RelayContextValue>(
    () => ({ ...connection, sendOrder, orderLocks }),
    [connection, sendOrder, orderLocks],
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
 * ★ `accountStates`/`accounts`/`orders`/`messages` 는 **종목 축이 없다**. 전역 값을 그대로
 *   통과시킨다. 종목을 옮겼다고 잔고를 비우면 다음 델타가 올 때까지 계좌 패널이 빈다.
 *   계좌 축 선택은 **소비자가** `accountStates.get(선택계좌)` 로 한다 — 훅이 대신 고르지
 *   않는다(어느 계좌를 골랐는지는 훅이 모른다). 훅이 하나를 골라 주면 그 값은 필연적으로
 *   「마지막으로 프레임이 온 계좌」가 되고, 그 순간 머리와 행이 다른 계좌가 된다(CR-01).
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
