"use client";

/**
 * Phase 15 Plan 12 — relay wss 훅 (RELAY-01, D-11/D-33/D-36/D-37/D-41).
 *
 * 호가 사다리(15-13) · 주문 패널(15-18) · 계좌 패널이 **전부 이 훅의 상태만** 소비한다.
 * 브라우저 쪽 실시간 계층의 단일 진입점이며, 상태 → 문구 분기는 `@gh-radar/shared` 의
 * `RELAY_STATE_LABELS` 를 그대로 쓴다(D-36 — UI 가 상태 switch 를 중복 구현하지 않는다).
 *
 * 규율 (전부 이유가 있다):
 *  1. **토큰은 wss 첫 메시지 본문 전용** (D-11). 업그레이드 URL·쿼리스트링에 절대 싣지
 *     않는다 — Caddy 액세스 로그와 브라우저 히스토리에 그대로 남기 때문이다(T-15-04).
 *  2. **구독은 인증 확인 이후** — relay 는 인증 전 `sub`/`unsub` 을 close(4400) 으로
 *     끊는다. relay 가 인증 직후 상태 프레임을 1회 즉시 내려주므로(15-04 연결수명 5)
 *     그 프레임을 인증 ACK 로 삼는다.
 *  3. **종목·거래소 전환 시 이전 구독을 반드시 `unsub`** — relay 는 키별 참조계수로
 *     업스트림 구독을 관리한다. 해제를 빠뜨리면 참조계수가 새고, 더 나쁘게는 **이전
 *     종목의 호가가 화면에 남아 그 가격으로 주문하는 사고**가 난다(T-15-40).
 *     `stock-comovement-section.tsx` 의 WR-04(종목 간 내비게이션은 remount 없이 props
 *     만 갱신된다) 방어를 호가창에 옮긴 것이다.
 *  4. **재접속은 유한하다** — 1s→2s→4s→8s… 상한 30s, 시도 상한 10회. 소진하면
 *     `manual_required`. close 4401(인증 실패)은 재시도해도 결과가 같으므로 즉시 확정.
 *     무한 재시도는 우리 스스로에게 거는 DoS 다(T-15-10, D-16).
 *  5. **재접속 중 데이터를 지우지 않는다** — `isStale` 만 세우고 마지막 값을 유지한다.
 *     빈 화면으로 되돌리면 사용자가 문맥을 잃는다(UI-SPEC §재접속·거래소 전환).
 *  6. **주문은 이 소켓으로 보내지 않는다** (D-08). 주문은 `POST /api/orders` REST 전용
 *     이며 `send()` 는 구독 제어(`sub`/`unsub`)용으로만 노출한다. wss 에 주문 경로를
 *     만들면 감사·rate-limit·requireAuth 가 이중화된다.
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
  type RelayOrderMsg,
  type RelayOutbound,
  type RelayQuote,
  type RelayServerMsg,
  type RelaySessionState,
  type RelayTapeEntry,
  type RelayUnfilled,
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

/** 스냅샷 캐시 키 (D-33 — 시세 키는 `isin + exchange`). */
function quoteCacheKey(isin: string, exchange: RelayExchange): string {
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

export interface UseRelaySocketOptions {
  /** 12자 ISIN. 비어 있으면 연결하지 않는다. */
  isin: string;
  /** 구독 거래소 (D-04 KRX/NXT 토글). */
  exchange: RelayExchange;
  /** false 면 연결하지 않고, true→false 전환 시 기존 연결을 정리한다. 기본 true. */
  enabled?: boolean;
}

export interface RelaySocketState {
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
  /** 현재 구독 키의 호가 10단. 아직 스냅샷 전이면 null. */
  quote: RelayQuote | null;
  /** 체결 테이프. **최신이 index 0**, 상한 200. */
  tape: RelayTapeEntry[];
  /** 잔고·미체결 병합 결과. 델타는 upsert + 0행/`rm` 제거 후 스냅샷 형태로 정규화된다. */
  account: RelayAccountState | null;
  /** 주문 통보 누적(최신 우선). */
  orders: RelayOrderMsg[];
  /** ServerMessage 누적(최신 우선, 상한 20). 각 항목에 수신 시각이 붙어 있다. */
  messages: RelayServerMessageEntry[];
  /** 재접속 중이라 표시값이 마지막 수신값임을 뜻한다(UI 는 `opacity:.55` 감쇠). */
  isStale: boolean;
  /**
   * 구독 제어 전용 송신구. **주문을 여기로 보내지 않는다** — 주문은 REST 전용(D-08).
   * 소켓이 열려 있지 않으면 조용히 무시한다.
   */
  send: (msg: RelayInbound) => void;
  /** 수동 재연결. 백오프 카운터를 0 으로 되돌리고 새 소켓을 연다. */
  reconnect: () => void;
}

// ============================================================
// reducer
// ============================================================

interface RelayData {
  status: RelayStatus;
  statusMessage: string;
  attempt: number;
  accounts: RelayAccount[];
  quote: RelayQuote | null;
  tape: RelayTapeEntry[];
  account: RelayAccountState | null;
  orders: RelayOrderMsg[];
  messages: RelayServerMessageEntry[];
  isStale: boolean;
}

const INITIAL_DATA: RelayData = {
  status: "idle",
  statusMessage: "",
  attempt: 0,
  accounts: [],
  quote: null,
  tape: [],
  account: null,
  orders: [],
  messages: [],
  isStale: false,
};

type RelayAction =
  /** 브라우저가 스스로 만든 상태(연결 시도·백오프·게이트). 서버 프레임이 아니다. */
  | { type: "local-status"; status: RelayStatus; message?: string; attempt?: number }
  /** 서버 프레임 1건. `at` 은 알림 스탬프용 수신 시각(`HH:MM:SS`). */
  | { type: "frame"; frame: RelayOutbound; at: string }
  /** 소켓 단절/복구에 따른 신선도 표식. */
  | { type: "stale"; value: boolean }
  /**
   * 구독 키 전환. `quote` 는 스냅샷 캐시 조회 결과(없으면 null),
   * `resetAccount` 는 **종목**이 바뀐 경우에만 true.
   */
  | { type: "switch"; quote: RelayQuote | null; resetAccount: boolean };

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

    case "switch":
      // 종목 전환(같은 동적 라우트 → remount 없이 props 갱신)에서 state sticky 방지:
      //   - quote/tape 를 리셋하지 않으면 **이전 종목 호가로 주문하는 사고**가 난다.
      //   - account 는 종목이 바뀔 때만 리셋한다(거래소 토글은 같은 종목이다).
      // 캐시에 값이 있으면 즉시 복원해 스켈레톤으로 되돌리지 않는다(D-37, 깜빡임 금지).
      return {
        ...state,
        quote: action.quote,
        tape: [],
        account: action.resetAccount ? null : state.account,
        orders: action.resetAccount ? [] : state.orders,
      };

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
      const prev = state.quote;
      const sameSlot = prev != null && prev.i === frame.i && prev.x === frame.x;
      // snap=true 는 전량 교체, false 는 같은 슬롯 병합 (D-33).
      const quote = frame.snap || !sameSlot ? frame : { ...prev, ...frame };
      return { ...state, quote, isStale: frame.snap ? false : state.isStale };
    }

    case "tape": {
      // 와이어는 시간 오름차순 배치 → 최신이 index 0 이 되도록 뒤집어 prepend 한다.
      const batch = [...frame.e].reverse();
      const tape = frame.snap ? batch : [...batch, ...state.tape];
      return { ...state, tape: tape.slice(0, MAX_TAPE) };
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

    default:
      // 알 수 없는 `t` 는 무시한다 — 서버가 앞서 나가도 브라우저가 터지지 않는다(T-15-41).
      return state;
  }
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
// 훅
// ============================================================

export function useRelaySocket({
  isin,
  exchange,
  enabled = true,
}: UseRelaySocketOptions): RelaySocketState {
  const [data, dispatch] = useReducer(relayReducer, INITIAL_DATA);

  /** 현재 살아 있는 소켓. 구독 effect 와 `send` 가 공유한다. */
  const socketRef = useRef<WebSocket | null>(null);
  /** 인증 ACK(첫 상태 프레임) 수신 여부. 소켓마다 초기화된다. */
  const authAckedRef = useRef(false);
  /** relay 에 실제로 걸려 있는 구독 키. `unsub` 대상의 정본이다. */
  const subscribedRef = useRef<{ isin: string; ex: RelayExchange } | null>(null);
  /** 현재 화면이 원하는 구독 키. 지연 도착한 이전 키의 프레임을 걸러낸다(T-15-40). */
  const wantedKeyRef = useRef<{ isin: string; ex: RelayExchange }>({ isin, ex: exchange });
  /** `Map<"isin|ex", RelayQuote>` 스냅샷 캐시 — 거래소 토글 왕복 깜빡임 제거(D-37). */
  const quoteCacheRef = useRef<Map<string, RelayQuote>>(new Map());

  /** 인증 ACK 를 구독 effect 로 전파하는 epoch. 재접속마다 증가한다. */
  const [authEpoch, setAuthEpoch] = useState(0);
  /** `reconnect()` 가 증가시키는 nonce — 연결 effect 를 강제로 다시 돌린다. */
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const shouldConnect = enabled && isin.length > 0;

  // ---------------------------------------------------------
  // 연결 수명 — isin/exchange 에 의존하지 않는다.
  // 종목·거래소 전환은 **재연결이 아니라 재구독**이다(아래 구독 effect).
  // ---------------------------------------------------------
  useEffect(() => {
    if (!shouldConnect) {
      dispatch({ type: "local-status", status: "idle" });
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
      subscribedRef.current = null;

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

        if (frame.t === "q") {
          quoteCacheRef.current.set(quoteCacheKey(frame.i, frame.x), frame);
        }

        // 전환 직전 키로 지연 도착한 시세를 화면에 올리지 않는다(T-15-40).
        if (frame.t === "q" || frame.t === "tape") {
          const wanted = wantedKeyRef.current;
          if (wanted.isin !== frame.i || wanted.ex !== frame.x) return;
        }

        dispatch({ type: "frame", frame, at: clockStamp(new Date()) });
      };

      ws.onerror = () => {
        // close 가 뒤따르므로 여기서는 상태를 바꾸지 않는다(중복 전이 방지).
      };

      ws.onclose = (event: CloseEvent) => {
        if (socketRef.current === ws) socketRef.current = null;
        authAckedRef.current = false;
        subscribedRef.current = null;
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
          const subscribed = subscribedRef.current;
          if (subscribed) {
            // 참조계수 누수 방지 — 언마운트(탭 이탈 포함)에서도 반드시 해제한다.
            ws.send(JSON.stringify({ t: "unsub", isin: subscribed.isin, ex: subscribed.ex }));
          }
          ws.close(NORMAL_CLOSE_CODE);
        } else {
          ws.close();
        }
      }

      authAckedRef.current = false;
      subscribedRef.current = null;
    };
    // isin/exchange 는 의도적으로 제외 — 전환은 재연결이 아니라 재구독이다.
  }, [shouldConnect, reconnectNonce]);

  // ---------------------------------------------------------
  // 구독 키 전환 시 화면 상태 리셋 (구독 effect 보다 **먼저** 선언한다)
  // ---------------------------------------------------------
  useEffect(() => {
    const prev = wantedKeyRef.current;
    wantedKeyRef.current = { isin, ex: exchange };
    if (prev.isin === isin && prev.ex === exchange) return;

    const cached = quoteCacheRef.current.get(quoteCacheKey(isin, exchange)) ?? null;
    dispatch({ type: "switch", quote: cached, resetAccount: prev.isin !== isin });
  }, [isin, exchange]);

  // ---------------------------------------------------------
  // 구독 동기화 — 이전 키를 반드시 unsub 한 뒤 새 키를 sub 한다
  // ---------------------------------------------------------
  useEffect(() => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) return;
    // 인증 ACK 전 구독은 relay 가 close(4400) 로 끊는다.
    if (!authAckedRef.current) return;
    if (!isin) return;
    // 권한 없음은 relay 가 구독을 무시하는 상태다 — 보내지 않는다.
    if (data.status === "unauthorized") return;

    const prev = subscribedRef.current;
    if (prev && prev.isin === isin && prev.ex === exchange) return;

    if (prev) {
      ws.send(JSON.stringify({ t: "unsub", isin: prev.isin, ex: prev.ex }));
    }
    ws.send(JSON.stringify({ t: "sub", isin, ex: exchange }));
    subscribedRef.current = { isin, ex: exchange };
  }, [isin, exchange, authEpoch, data.status]);

  const send = useCallback((msg: RelayInbound) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WS_READY_OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const reconnect = useCallback(() => {
    setReconnectNonce((v) => v + 1);
  }, []);

  const statusLabel = data.status === "idle" ? "" : RELAY_STATE_LABELS[data.status];

  return useMemo<RelaySocketState>(
    () => ({
      status: data.status,
      statusLabel,
      statusMessage: data.statusMessage,
      attempt: data.attempt,
      accounts: data.accounts,
      quote: data.quote,
      tape: data.tape,
      account: data.account,
      orders: data.orders,
      messages: data.messages,
      isStale: data.isStale,
      send,
      reconnect,
    }),
    [data, statusLabel, send, reconnect],
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
