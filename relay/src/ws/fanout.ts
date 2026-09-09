/**
 * Phase 15 Plan 04 — RELAY-01. 브라우저 wss 표면 (첫 메시지 인증 · 백프레셔 · 팬아웃).
 *
 * **인터넷에 직접 노출되는 유일한 relay 표면**이다(Caddy → 127.0.0.1:8090). 그래서
 * 인증·스키마 검증·백프레셔가 전부 여기 걸린다. `server/src/routes/chat.ts` 의
 * "스트림을 쓰기 전에 인증을 끝낸다 · 정리는 finally" 규율을 wss 로 옮긴 것이다.
 *
 * 연결 수명 (D-11):
 *   1. connection 즉시 5초 authTimer — 만료되면 close(4401, "auth timeout")
 *   2. 첫 메시지가 스키마 위반이거나 `t !== "auth"` → close(4400, "auth required")
 *      **인증 전 sub/unsub 은 무시가 아니라 close 다** — 관대함이 곧 공격 표면이다
 *   3. 토큰 검증 실패 → close(4401, "invalid token")
 *   4. `dma_credentials` 매핑 없음 → **연결은 유지**하고 `{t:"state", s:"unauthorized"}`
 *      1건 전송. 이후 sub 은 구독을 만들지 않고 같은 상태 프레임을 되돌린다 (D-12) —
 *      호가창이 "권한 없음"을 표시해야 하므로 끊지 않는다
 *   5. 매핑 있음 → `sessions.acquire` → 현재 상태 프레임을 **즉시 1회** 전송.
 *      브라우저는 이 프레임을 인증 ACK 로 삼아 구독을 시작한다(15-12 `use-relay-socket`
 *      계약). 이 프레임을 빠뜨리면 브라우저는 영원히 구독하지 않는다
 *   6. 인증 직후 **계좌 스냅샷 + 전략 스냅샷 3프레임**을 그 연결로 내린다 (D-12/D-23/D-37).
 *      브라우저는 이것을 요청하지 않는다 — 구독을 기다리면 아무 종목도 열지 않은 탭이
 *      영원히 빈 잔고·빈 전략 목록을 본다
 *   7. sub → 참조계수 +1, 스냅샷 캐시가 있으면 그 소켓에 즉시 전송 (D-37)
 *   8. close → authTimer 정리, **그 소켓이 잡은 키만** 해제, `sessions.release`
 *
 * 결정 근거:
 *   T-15-02  팬아웃 대상은 `Map<userId, …>` 로만 고른다. **전역 브로드캐스트 함수를
 *            만들지 않는 것**이 타인 체결·잔고 유출의 구조적 방어다.
 *   T-15-04  토큰은 첫 메시지 본문 전용이다. URL·쿼리스트링에 절대 싣지 않는다 —
 *            Caddy 액세스 로그·브라우저 히스토리에 그대로 남는다. 로그에도 넣지 않는다.
 *   T-15-08  `bufferedAmount` 임계 초과가 연속 3회면 **그 연결만** terminate.
 *            `maxPayload` 64KB + perMessageDeflate 메모리 튜닝이 같은 방향의 방어다.
 *   D-32     DMA 수신 경로에서 동기 블로킹을 하지 않는다. 팬아웃은 동기 write 뿐이고
 *            느린 소켓은 기다리지 않고 버린다 — 기다리면 게이트웨이 송신 큐가 차서
 *            서버가 우리 연결을 끊는다.
 *   D-35     perMessageDeflate 는 기본값 `true` 를 쓰지 않는다. `ws` README 가 Linux 에서의
 *            메모리 단편화를 명시적으로 경고하고, 이 프로세스는 e2-micro(1GB) 위에서 돈다.
 *   D-36     세션 상태와 `ServerMessage(54)` 는 상태 프레임/`{t:"msg"}` 로 그대로 흘린다.
 *   D-02     주문(`order.new`/`order.cancel`)도 **이 소켓으로** 받는다. 세션을 쥔 프로세스가
 *            상관도 쥔다 — 요청/응답 상관(`rid`)은 주문만 하고, 그 구현은 `order-handler.ts` 다.
 *   D-01     전략 4종(`lc.set`/`vi.set`/`vi.confirm`/`strategies.disable`)을 **이 소켓으로**
 *            받아 그 사용자의 DMA 세션으로 보낸다. 「누가 무엇을 보낼 수 있는가」의 게이트가
 *            여기다 — 통과한 바이트는 실계좌 전략 등록이 된다.
 *   T-16-01  전략의 `accountNo` 는 **`session.allowedAccounts` 하나만** 근거로 대조한다.
 *            상태 프레임의 계좌 사본이나 인바운드 바디를 믿으면 IDOR 이 그대로 열린다.
 *   T-16-06  전략·주문 인바운드는 server 의 `apiRateLimiter` 를 **우회하는 새 경로**다.
 *            연결당 초당 상한(토큰 버킷)을 relay 가 직접 갖는다.
 *
 * 하지 않는 것:
 *   - 전략 요청의 결과를 기다리지 않는다. 반영은 60/61/64/65 에코로 오고 Hub 가
 *     `#deliver(userId)` 로 그 사용자의 전 연결에 팬아웃한다 (D-11/D-12). 요청/응답
 *     상관(`rid`)은 주문만 한다.
 *   - 주문 상관을 **여기서** 하지 않는다. `order.new`/`order.cancel` 은 같은 자리에서 갈라
 *     `ws/order-handler.ts` 로 위임한다 (D-02) — 5초 상관·`dma_orders` 기록은 그쪽 몫이고
 *     이 파일은 전송(`#send`)만 빌려 준다.
 *   - 구독 상태를 소유하지 않는다. 참조계수·캐시의 정본은 `SubscriptionHub` 다.
 *   - 자격증명을 캐시하지 않는다. 매 인증마다 조회한다 — 등록 해제가 즉시 반영돼야 한다.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RELAY_WS_CLOSE } from "@gh-radar/shared";
import type {
  OrderMarket,
  RelayExchange,
  RelayInbound,
  RelayLimitChaserInput,
  RelayOutbound,
  RelayServerMsg,
  RelayStateMsg,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import { verifyToken } from "../auth/verify-token.js";
import { getDmaCredentials } from "../store/credentials.js";
import { safePgError } from "../store/pg-error.js";
import type { SubscriptionHub } from "../hub/subscription-hub.js";
import type { DmaSession } from "../dma/session.js";
import type { DmaCredentials } from "../dma/session-manager.js";
import {
  OrderBuildError,
  buildConfirmVIOrderReq,
  buildDisableStrategiesReq,
  buildSetLimitChaserReq,
  buildSetVITriggerReq,
  maskAccountNo,
  strategyKey,
} from "../dma/envelope.js";
import { encode, parseInbound } from "./protocol.js";
import {
  createOrderHandler,
  type OrderHandler,
  type OrderRecorder,
} from "./order-handler.js";
import type { SymbolLookup } from "../store/symbols.js";

// ============================================================
// 상수 정본
// ============================================================

/** 업그레이드 후 첫 메시지(`{t:"auth"}`) 대기 상한(ms) (D-11). */
export const AUTH_TIMEOUT_MS = 5_000;

/** ws ping/pong 하트비트 주기(ms). pong 이 없으면 다음 주기에 terminate 한다. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** 프레임 1건 상한(byte). 인바운드는 최대 수백 바이트라 64KB 면 충분히 관대하다. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

/** 송신 대기 바이트 임계. 초과가 연속되면 그 연결을 버린다 (T-15-08). */
export const BACKPRESSURE_LIMIT_BYTES = 1024 * 1024;

/** 임계 초과를 몇 번 연속 봐야 연결을 끊는가. 순간 스파이크로 끊지 않기 위한 여유다. */
export const BACKPRESSURE_STRIKES = 3;

/** 업그레이드를 받아들이는 경로. 브라우저(`relay-url.ts`)가 쓰는 값과 같아야 한다. */
export const DEFAULT_WS_PATH = "/ws";

/**
 * 인증된 연결 1개가 보낼 수 있는 **초당 인바운드 프레임 수** (T-16-06).
 *
 * 재량 상한이다. 사람의 조작(구독 전환·전략 저장·주문)이 초당 10건을 넘을 이유가 없고,
 * 넘는다면 그것은 폭주하는 클라이언트다. 전략·주문은 server 의 `apiRateLimiter` 를 타지
 * 않으므로 여기가 유일한 상한이다 — 상수로 내보내 테스트가 값을 참조한다.
 */
export const INBOUND_RATE_LIMIT_PER_SEC = 10;

/** 토큰 버킷 용량 = 초당 상한. 순간 버스트도 같은 값으로 묶는다. */
export const INBOUND_RATE_BURST = INBOUND_RATE_LIMIT_PER_SEC;

/**
 * relay 가 만든 거부 통지의 `src` 값.
 *
 * 게이트웨이의 `ServerMessage(54)` 와 **같은 슬롯**(`{t:"msg"}`)을 쓰되 발신자를 가른다 —
 * 브라우저의 VI 주인 판정이 `src === "Account" ∧ i === ""` 이라(Pitfall 9), 게이트웨이 값을
 * 흉내 내면 relay 의 거부가 VI 통지로 오독된다.
 */
export const RELAY_MSG_SOURCE = "Relay";

/**
 * **전략 철거(삭제) 요청의 최종 시장 폴백** (GC-WR-04 / T-16-55).
 *
 * 등록·수정에서는 이 값을 절대 쓰지 않는다 — 기본값 `"K"` 로 메우면 코스닥 전략이 코스피로
 * 등록되고 그 오차가 반복 발주로 재생산된다(T-16-42). 삭제만 다른 이유는 **전략 키에 시장이
 * 없기 때문**이다: `strategyKey()` = `${isin}:${accountNo}:${exchange}` 이고 게이트웨이의
 * `LimitChaser::MakeKey` 도 동형이라, 철거 요청의 `market` 은 **무엇을 지울지에 관여하지
 * 않는다**. 그래서 「지어낸 값이 잘못된 대상을 지운다」는 위험이 구조적으로 없다.
 *
 * ★ 이 폴백이 쓰이는 경로는 **반드시 `logger.error` 를 남긴다**(무로그 fail-safe 금지 / S-5).
 *   조용히 메우면 「마스터가 안 떠 있다」는 운영 신호가 사라진다.
 */
const TEARDOWN_MARKET_FALLBACK: OrderMarket = "K";

/**
 * `ws` README 권고 기반 압축 튜닝 (D-35).
 *
 * 기본값 `true` 를 쓰지 않는 이유는 README 가 "increased concurrency, especially on Linux,
 * can lead to catastrophic memory fragmentation" 를 경고하기 때문이다. windowBits 는
 * 1 줄일 때마다 메모리가 절반이고, noContextTakeover 는 연결당 컨텍스트를 유지하지 않는다
 * (압축률은 소폭 떨어지지만 1GB VM 에서는 그 편이 옳다).
 */
const PERMESSAGE_DEFLATE = {
  threshold: 1024,
  concurrencyLimit: 4,
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
  serverMaxWindowBits: 12,
  zlibDeflateOptions: { level: 3, memLevel: 7 },
} as const;

// ============================================================
// 의존성 계약
// ============================================================

/** `SessionManager` 중 wss 가 쓰는 부분만. 테스트가 스텁을 넣을 수 있게 좁혀 둔다. */
export interface FanoutSessions {
  acquire(userId: string, creds: DmaCredentials): DmaSession;
  release(userId: string): void;
  /**
   * 전략(그리고 16-08 의 주문) 인바운드가 쓰는 세션 조회 — `SessionManager.get` 그대로다.
   *
   * `acquire` 와 갈라 두는 이유: **여기서 대신 로그인하지 않는다** (D-15). 세션이 없다는 것은
   * 「호가창을 아직 열지 않았다」이고, 그 상태의 전략 요청은 만들어 주는 것이 아니라 거부다.
   */
  get(userId: string): DmaSession | undefined;
}

export type WsFanoutDeps = {
  /**
   * HTTP 서버와 포트를 공유한다(`noServer` + `handleUpgrade`).
   *
   * **선택이다.** 주면 생성자가 `upgrade` 리스너를 스스로 붙인다(테스트 편의 — 15-04
   * 하네스가 쓰는 경로). 주지 않으면 호출자가 `handleUpgrade()` 를 직접 결선해야 한다.
   *
   * `index.ts`(15-05)는 **주지 않는 쪽**을 쓴다: 8090 서버는 업그레이드만 받는 게 아니라
   * Caddy 가 넘기는 평문 HTTP 요청에도 응답해야 하므로 `request` 핸들러를 함께 소유한다.
   * 한 포트의 라우팅 결정을 두 모듈이 나눠 갖지 않도록 부팅 결선이 전부 쥔다.
   */
  server?: HttpServer;
  /** 토큰 검증 + `dma_credentials` 조회를 겸하는 서비스롤 클라이언트. */
  supabase: SupabaseClient;
  sessions: FanoutSessions;
  hub: SubscriptionHub;
  /** base64 32B AES-256-GCM 키 (`DMA_CRED_KEY`). */
  credKey: string;
  /** 업그레이드 경로. 기본 `/ws`. */
  path?: string;
  /** 첫 메시지 대기 상한(ms). 기본 `AUTH_TIMEOUT_MS`. */
  authTimeoutMs?: number;
  /** 하트비트 주기(ms). 기본 `HEARTBEAT_INTERVAL_MS`. */
  heartbeatMs?: number;
  /** 백프레셔 임계(byte). 기본 `BACKPRESSURE_LIMIT_BYTES`. */
  backpressureLimitBytes?: number;
  /**
   * `dma_orders` 쓰기 창구 (D-03). `symbols` 와 **둘 다** 있어야 주문 분기가 열린다 —
   * 하나만 있으면 「ISIN 은 푸는데 기록은 못 하는」 반쪽 경로가 조용히 생긴다.
   */
  orderStore?: OrderRecorder;
  /** ISIN → 단축코드·시장 (D-28). 브라우저가 보내지 않는 두 값을 여기서 푼다. */
  symbols?: SymbolLookup;
  /** 첫 주문 통보 대기 상한(ms). 테스트가 줄여 쓴다. */
  orderTimeoutMs?: number;
};

/** `/healthz` 용 요약. 식별자를 담지 않는다. */
export type WsFanoutStats = {
  connectionCount: number;
  authedUserCount: number;
};

/** 브라우저 소켓 1개의 상태. */
type Conn = {
  ws: WebSocket;
  /** 인증 전에는 null. 한 번 정해지면 **바뀌지 않는다**(재인증 금지). */
  userId: string | null;
  /** `dma_credentials` 미등록 사용자 — 연결은 유지하되 구독을 만들지 않는다 (D-12). */
  unauthorized: boolean;
  /** 인증 왕복 중 도착한 추가 메시지를 무시하기 위한 표식. */
  authInFlight: boolean;
  /** `acquire` 를 실제로 했는가 — close 에서 `release` 를 부를지 가른다. */
  acquired: boolean;
  isAlive: boolean;
  authTimer: NodeJS.Timeout | null;
  /** **이 소켓이** 잡은 구독 키. 다른 탭의 구독을 끊지 않기 위한 소유권 기록이다. */
  keys: Map<string, { isin: string; ex: RelayExchange }>;
  /** 백프레셔 연속 초과 횟수. 정상 전송이 성공하면 0 으로 되돌린다. */
  overflows: number;
  /** 인바운드 토큰 버킷 잔량. 경과 시간에 비례해 차므로 소수를 허용한다 (T-16-06). */
  rateTokens: number;
  /** 버킷을 마지막으로 보충한 시각(epoch ms). */
  rateRefilledAtMs: number;
  /** 이 초과 구간에서 경고를 이미 남겼는가 — 연속 경고 폭주를 1회로 묶는다. */
  rateWarned: boolean;
};

/**
 * relay 발 거부 통지 1건. 게이트웨이 통지와 같은 `{t:"msg"}` 슬롯이고 `src` 만 다르다.
 *
 * **조용한 거부를 만들지 않기 위한 프레임**이다 (PC-7). 전략은 서버가 거부를 응답 코드로
 * 주지 않으므로(Pitfall 8), relay 단계에서 막았다는 사실을 말해 주지 않으면 사용자에게는
 * 「눌렀는데 아무 일도 일어나지 않음」으로만 보인다.
 */
function rejectFrame(reason: string, accountNo = "", isin = ""): RelayServerMsg {
  return { t: "msg", lv: "ERROR", m: reason, i: isin, a: accountNo, src: RELAY_MSG_SOURCE, kind: "" };
}

/** 사용자 1명의 팬아웃 대상 집합. */
type UserEntry = {
  session: DmaSession;
  conns: Set<Conn>;
};

function keyOf(isin: string, ex: RelayExchange): string {
  return `${isin}|${ex}`;
}

/**
 * 브라우저 wss 표면.
 *
 * 생성과 동시에 업그레이드 핸들러·하트비트가 붙는다. 종료는 `close()` 로 한다 —
 * 타이머를 남기면 프로세스가 내려가지 않고 테스트가 멈춘다.
 */
export class WsFanout {
  readonly #wss: WebSocketServer;
  /** 생성자가 `upgrade` 리스너를 붙인 서버. 결선을 호출자가 쥐면 `undefined` 다. */
  readonly #server: HttpServer | undefined;
  readonly #supabase: SupabaseClient;
  readonly #sessions: FanoutSessions;
  readonly #hub: SubscriptionHub;
  readonly #credKey: string;
  readonly #path: string;
  readonly #authTimeoutMs: number;
  readonly #backpressureLimit: number;

  /** 살아 있는 모든 소켓(미인증 포함). 하트비트가 훑는 집합이다. */
  readonly #conns = new Set<Conn>();
  /** userId → 팬아웃 대상. **여기 없는 사용자에게는 아무것도 가지 않는다** (T-15-02). */
  readonly #users = new Map<string, UserEntry>();

  readonly #heartbeat: NodeJS.Timeout;
  readonly #onUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  /** 주문 상관 핸들러 (D-02). 결선이 반쪽이면 `null` 이고 주문 분기가 사유를 돌려준다. */
  readonly #orders: OrderHandler<Conn> | null;
  /**
   * ISIN → 단축코드·시장 (D-28). `lc.set` 의 시장 구분을 **여기서** 푼다 (WR-03).
   *
   * 주문 분기(`#orders`)는 `orderStore` 와 조합해야 열리지만 전략 분기는 종목맵 하나면 된다 —
   * 그래서 조합 판정과 별개로 인스턴스에 따로 보관한다.
   */
  readonly #symbols: SymbolLookup | null;

  constructor(deps: WsFanoutDeps) {
    this.#server = deps.server;
    this.#supabase = deps.supabase;
    this.#sessions = deps.sessions;
    this.#hub = deps.hub;
    this.#credKey = deps.credKey;
    this.#path = deps.path ?? DEFAULT_WS_PATH;
    this.#authTimeoutMs = deps.authTimeoutMs ?? AUTH_TIMEOUT_MS;
    this.#backpressureLimit = deps.backpressureLimitBytes ?? BACKPRESSURE_LIMIT_BYTES;
    this.#symbols = deps.symbols ?? null;

    this.#wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
      perMessageDeflate: PERMESSAGE_DEFLATE,
    });

    this.#onUpgrade = (req, socket, head): void => this.handleUpgrade(req, socket, head);
    this.#server?.on("upgrade", this.#onUpgrade);

    // Hub 는 **userId 를 지정해서만** 내보낸다. 여기서 그 사용자의 소켓 집합으로 좁힌다.
    this.#hub.on("fanout", (e) => this.#deliver(e.userId, e.msg));

    // 주문 상관 (D-02). `send` 로 `#send` 를 넘기는 것이 핵심이다 — 핸들러가 소켓을 직접
    // 잡으면 전송 경로가 두 벌이 되고, 한쪽이 대상 선택을 틀리는 순간 타인의 체결이 샌다.
    this.#orders =
      deps.orderStore !== undefined && deps.symbols !== undefined
        ? createOrderHandler<Conn>({
            sessions: deps.sessions,
            hub: deps.hub,
            orderStore: deps.orderStore,
            symbols: deps.symbols,
            send: (conn, msg) => this.#send(conn, msg),
            timeoutMs: deps.orderTimeoutMs,
          })
        : null;
    if (this.#orders === null) {
      logger.warn({}, "[WS] 주문 기록 큐·종목맵 미주입 — 주문 인바운드를 받지 않는다");
    }

    this.#heartbeat = setInterval(() => this.#sweep(), deps.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
  }

  /** `/healthz` 요약. */
  stats(): WsFanoutStats {
    return { connectionCount: this.#conns.size, authedUserCount: this.#users.size };
  }

  /**
   * HTTP 업그레이드 1건을 wss 로 승격한다.
   *
   * `deps.server` 를 준 경우 생성자가 이 메서드를 `upgrade` 리스너로 붙인다. 주지 않은
   * 경우(=`index.ts`) 호출자가 직접 결선한다 — 어느 쪽이든 경로 판정은 여기 한 곳이다.
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    // 경로가 다르면 업그레이드하지 않는다. `URL` 로 파싱해 쿼리스트링이 붙어도 안전하게.
    const pathname = new URL(req.url ?? "/", "http://relay.invalid").pathname;
    if (pathname !== this.#path) {
      logger.warn({ pathname }, "[WS] 알 수 없는 경로 업그레이드 — 거부");
      socket.destroy();
      return;
    }
    this.#wss.handleUpgrade(req, socket, head, (ws) => this.#onConnection(ws));
  }

  /**
   * 종료 — 하트비트·소켓·서버를 전부 정리한다.
   *
   * `code` 를 주면 **정상 close 프레임**을 먼저 보낸다(프로세스 graceful shutdown 은
   * `1001 going away`). 프레임 없이 `terminate()` 하면 브라우저에는 비정상 단절로 보여
   * `use-relay-socket`(15-12)이 즉시 재접속을 시도하는데, 그때 컨테이너는 아직 내려가는
   * 중이라 재접속이 실패하고 백오프만 벌어진다. 코드를 주지 않으면 즉시 terminate 다.
   *
   * close 프레임이 실제로 나가려면 이벤트 루프 한 바퀴가 필요하므로 `graceMs` 만큼만
   * 기다린 뒤 남은 소켓은 강제 종료한다 — 종료가 소켓 사정에 매달리지 않게 한다.
   */
  async closeAll(code?: number, reason = "server shutting down", graceMs = 250): Promise<void> {
    clearInterval(this.#heartbeat);
    this.#server?.removeListener("upgrade", this.#onUpgrade);

    const conns = [...this.#conns];
    for (const conn of conns) {
      this.#clearAuthTimer(conn);
      if (code !== undefined && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.close(code, reason);
      } else {
        conn.ws.terminate();
      }
    }

    if (code !== undefined && conns.length > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, graceMs));
      for (const conn of conns) conn.ws.terminate();
    }

    this.#conns.clear();
    this.#users.clear();
    // 남은 주문 대기 타이머를 전부 끈다 — 하나라도 남으면 프로세스가 안 내려간다.
    this.#orders?.close();
    await new Promise<void>((resolve) => {
      this.#wss.close(() => resolve());
    });
  }

  /** `closeAll()` 별칭(즉시 terminate). 15-04 테스트 하네스가 쓰는 이름이다. */
  async close(): Promise<void> {
    await this.closeAll();
  }

  // ----------------------------------------------------------
  // 연결 수명
  // ----------------------------------------------------------

  #onConnection(ws: WebSocket): void {
    const conn: Conn = {
      ws,
      userId: null,
      unauthorized: false,
      authInFlight: false,
      acquired: false,
      isAlive: true,
      authTimer: null,
      keys: new Map(),
      overflows: 0,
      rateTokens: INBOUND_RATE_BURST,
      rateRefilledAtMs: Date.now(),
      rateWarned: false,
    };
    this.#conns.add(conn);

    // 인증 전에는 아무 상태도 만들지 않는다 — 미인증 연결이 붙들 수 있는 자원이 타이머 1개뿐이다.
    conn.authTimer = setTimeout(() => {
      conn.authTimer = null;
      logger.warn({ timeoutMs: this.#authTimeoutMs }, "[WS] 인증 시간 초과 — 연결 종료");
      ws.close(RELAY_WS_CLOSE.AUTH_TIMEOUT, "auth timeout");
    }, this.#authTimeoutMs);

    ws.on("pong", () => {
      conn.isAlive = true;
    });
    ws.on("error", (err) => {
      logger.warn({ err, userId: conn.userId }, "[WS] 소켓 오류");
    });
    ws.on("message", (raw: RawData, isBinary: boolean) => {
      void this.#onMessage(conn, raw, isBinary);
    });
    ws.on("close", (code) => this.#onClose(conn, code));
  }

  async #onMessage(conn: Conn, raw: RawData, isBinary: boolean): Promise<void> {
    if (isBinary) {
      // 계약은 JSON 텍스트뿐이다. 바이너리는 프로토콜 위반이다.
      this.#reject(conn, "binary frame");
      return;
    }

    const msg = parseInbound(raw.toString());
    if (msg === null) {
      this.#reject(conn, "bad message");
      return;
    }

    if (conn.userId === null) {
      await this.#onFirstMessage(conn, msg);
      return;
    }
    this.#onAuthedMessage(conn, conn.userId, msg);
  }

  /** 첫 메시지는 반드시 `{t:"auth"}` 다 (D-11). */
  async #onFirstMessage(conn: Conn, msg: RelayInbound): Promise<void> {
    if (msg.t !== "auth") {
      // 인증 전 구독은 무시가 아니라 종료다.
      this.#reject(conn, "auth required");
      return;
    }
    if (conn.authInFlight) {
      logger.warn("[WS] 인증 진행 중 추가 메시지 — 무시");
      return;
    }
    conn.authInFlight = true;
    this.#clearAuthTimer(conn);

    const userId = await verifyToken(this.#supabase, msg.token);
    if (userId === null) {
      conn.ws.close(RELAY_WS_CLOSE.AUTH_TIMEOUT, "invalid token");
      return;
    }
    if (conn.ws.readyState !== WebSocket.OPEN) {
      logger.info({ userId }, "[WS] 인증 왕복 중 연결 종료 — 세션을 만들지 않는다");
      return;
    }

    let creds: DmaCredentials | null;
    try {
      creds = await this.#lookupCredentials(userId);
    } catch (err) {
      // 장애다 — "권한 없음"으로 위장하지 않는다. 브라우저는 재접속 가치가 있는 close 로 받는다.
      // `err` 는 `getDmaCredentials` 가 던진 **PostgREST 원문**이다 (16-38 / R2-CR-03).
      // `dma_credentials` 행에는 `dma_password_enc` 가 있으므로 `details` 를 싣지 않는다.
      logger.error({ pgError: safePgError(err), userId }, "[WS] 자격증명 조회 실패 — 연결 종료");
      this.#send(conn, { t: "state", s: "failed", msg: "자격증명 확인에 실패했습니다" });
      conn.ws.close(1011, "credential lookup failed");
      return;
    }
    if (conn.ws.readyState !== WebSocket.OPEN) return;

    conn.userId = userId;

    if (creds === null) {
      // 연결을 끊지 않는다 — 호가창이 "권한 없음" 배지를 그려야 한다 (D-12).
      conn.unauthorized = true;
      logger.warn({ userId }, "[WS] dma_credentials 미등록 — 연결 유지, 구독 거부");
      this.#send(conn, { t: "state", s: "unauthorized" });
      return;
    }

    const session = this.#sessions.acquire(userId, creds);
    conn.acquired = true;
    this.#hub.attach(session);
    this.#register(conn, userId, session);

    // 인증 ACK 겸 배지 초기값. **브라우저는 이 프레임을 받은 뒤에야 구독을 보낸다**
    // (15-12 `use-relay-socket` 계약) — 빠뜨리면 화면이 영원히 비어 있다.
    this.#send(conn, session.stateFrame());

    // 잔고·미체결 캐시가 있으면 즉시 내린다 (D-23/D-37). 계좌 데이터는 종목 구독과
    // 무관하므로 `sub` 을 기다리지 않는다 — 기다리면 아무 종목도 열지 않은 탭이
    // 영원히 빈 잔고를 본다. 캐시가 없으면(첫 세션) 곧 오는 66 스냅샷이 채운다.
    for (const acct of this.#hub.getAccountStates(userId)) this.#send(conn, acct);

    // 전략 스냅샷도 **같은 이유로 구독을 기다리지 않는다** (D-12). 상따·VI 는 계좌 단위라
    // 종목과 무관하고, 브라우저는 이것을 따로 요청하지도 않는다 — 기다리면 아무 종목도
    // 열지 않은 탭이 영원히 스켈레톤을 본다. 캐시는 16-06 이 Ready 프리페치(24/21/34)로
    // 채워 두었고, 여기서는 **방금 인증한 그 연결에만** 내린다(계좌 스냅샷과 동일).
    //
    // ⚠️ `lc.snap`·`vi.list` 는 **비어 있어도 1프레임 보낸다** — 빈 배열은 「전략 없음」의
    //    확정 정보다. 안 보내면 브라우저는 「아직 안 왔다」와 구분하지 못해 계속 스켈레톤이다.
    // ⚠️ VI 설정만 다르다. `getViTrigger` 는 3상태를 돌려주고 `undefined`(61 을 아직 못 받았다)
    //    면 **보내지 않는다** — 지어낸 「미등록」을 내리면 브라우저가 사용자가 입력 중인
    //    금액을 지운다 (16-06 결정 2). `null`(조회 결과 미등록)은 확정이므로 보낸다.
    this.#send(conn, { t: "lc.snap", items: this.#hub.getLimitChasers(userId) });
    const viTrigger = this.#hub.getViTrigger(userId);
    if (viTrigger !== undefined) this.#send(conn, { t: "vi", cfg: viTrigger });
    this.#send(conn, { t: "vi.list", snap: true, items: this.#hub.getViOrders(userId) });
  }

  #onAuthedMessage(conn: Conn, userId: string, msg: RelayInbound): void {
    // ④ 인바운드 상한을 **가장 먼저** 본다 (T-16-06). sub/unsub 도 같은 버킷을 쓴다 —
    //    경로마다 버킷이 갈리면 합계 상한이 없는 것과 같다.
    if (!this.#allowInbound(conn, userId, msg.t)) return;

    if (msg.t === "auth") {
      // 재인증으로 사용자를 바꾸는 경로를 열지 않는다 (T-15-03). 무시하되 기록은 남긴다.
      logger.warn({ userId }, "[WS] 이미 인증된 연결의 재인증 시도 — 무시");
      return;
    }

    if (conn.unauthorized) {
      // 구독을 만들지 않고 같은 상태를 되돌린다 — 브라우저가 이유를 계속 표시할 수 있게 (D-12).
      logger.warn({ userId, t: msg.t }, "[WS] 권한 없는 사용자의 구독 요청 — 거부");
      this.#send(conn, { t: "state", s: "unauthorized" });
      return;
    }

    // ------------------------------------------------------------------
    // 전략 4종 (D-01). **`keyOf` 앞**이다 — `isin`/`ex` 가 없는 메시지들이므로 시세 구독
    // 좁히기보다 먼저 갈라야 한다 (16-RESEARCH Pitfall 14).
    //
    // 네 분기 모두 `order-api.ts` 의 ①②③ 순서를 그대로 이식한다:
    //   ① Ready 세션 확인 → ② 계좌 화이트리스트 대조 → ③ 조립·송신.
    // 어느 단계에서 멈추든 **로그 + 거부 프레임**을 남긴다. `vi.confirm`/`strategies.disable`
    // 은 계좌 필드가 없으므로 ② 를 건너뛴다.
    //
    // ★ `lc.set` 만 **②-1 ISIN → 시장 해석** 단계가 하나 더 있다 (WR-03 / D-28). 브라우저가
    //   `market` 을 싣지 않으므로 relay 가 `SymbolMap` 으로 풀어 채운다 — 등록·수정은 못 풀면
    //   거부다. `order.new` 가 이미 같은 규율이고(`order-handler.ts` 게이트 ③-1) `lc.set` 만
    //   예외였다. **단, 철거(삭제)는 이 관문을 지나지 않는다** (GC-WR-04, 아래 참조).
    // ★ 이어서 **②-2 무장 조건 검사** — 발주가·수량 0 인 게이트는 켤 수 없다 (WR-06).
    // ------------------------------------------------------------------
    if (msg.t === "lc.set") {
      const { cfg } = msg;
      const session = this.#strategySession(conn, userId, msg.t);
      if (session === null) return;
      if (!this.#accountAllowed(conn, session, userId, msg.t, cfg.accountNo)) return;
      // ②-1 시장 해석은 **게이트 상태로 갈린다** (R2-CR-01 / GC-WR-04 / T-16-55).
      //
      // 갈림의 근거는 클라이언트가 자칭하는 `crud` 가 **아니라** 게이트 4종의 실제 상태다
      // (`#isTeardown`). `crud` 는 인바운드 필드라 브라우저·옛 탭·임의 wss 가 값을 정하고,
      // 자칭을 가드 면제 조건으로 쓰면 한 프레임이 이 관문과 아래 ②-2 를 **동시에** 지난다
      // (R2-CR-01). 계약의 정본도 게이트다 — `packages/shared/src/relay.ts:136-141`.
      //
      // `#isTeardown(cfg)` 인 요청은 「전략을 내린다」는 뜻이고, 그것을 시장 해석 실패로 막으면
      // 상장폐지·마스터 미로딩 종목의 전략을 **영원히 못 지우는** 상태가 만들어진다. UI 가
      // `gateBlocked` 에 「끄는 것은 언제나 허용한다 — 무장 해제를 막으면 그게 더 위험하다」
      // (T-16-44)고 적어 둔 규율의 **서버측 대응**이 이 분기다.
      //
      // 반대로 등록·수정(게이트가 **하나라도** 켜짐)은 `crud` 가 무엇으로 오든 **완전히
      // 그대로**다 — `#strategyMarket` 이고, 못 풀면 거부다. 여기를 함께 느슨하게 하면 기본값
      // `"K"` 로 코스닥 전략을 코스피로 등록하는 경로가 열린다 (16-25 truth 41 / T-16-42) —
      // 그래서 두 경로가 같은 함수를 쓰지 않는다.
      const teardown = this.#isTeardown(cfg);
      // `crud:"D"` 인데 게이트가 켜져 있는 프레임은 계약과 어긋난다 — 정상 브라우저는 `crud` 를
      // `crudOf(gates)` 로 파생시키므로 이 조합을 만들 수 없다. 조용히 통과시키지 않고 운영
      // 신호를 남긴다(S-5). 계좌번호는 싣지 않는다 (T-16-45) — `isin`·`crud` 와 사유만.
      if (!teardown && cfg.crud === "D") {
        logger.error(
          { userId, t: msg.t, isin: cfg.isin, crud: cfg.crud },
          '[WS] crud:"D" 인데 게이트가 켜져 있다 — 철거로 보지 않고 등록 경로 가드를 적용한다',
        );
      }
      const market = teardown
        ? this.#teardownMarket(userId, msg.t, cfg)
        : this.#strategyMarket(conn, userId, msg.t, cfg.isin);
      if (market === null) return;
      // ②-2 무장 가드도 철거에는 걸리지 않는다 — 판정은 `#strategyArmable` 안에 있다(호출부가
      // 아니라 함수가 소유해야 나중에 호출부가 늘어도 규율이 갈리지 않는다).
      if (!this.#strategyArmable(conn, userId, msg.t, cfg)) return;
      const payload = this.#buildStrategyPayload(conn, userId, msg.t, () =>
        // ★ 시장 구분은 **여기서** 얹는다. 조립기에 기본값을 두지 않는 것이 규율이다 —
        //   기본값 "K" 는 코스닥 전략을 코스피로 등록시킨다 (Pitfall 7).
        buildSetLimitChaserReq({ ...cfg, market }),
      );
      if (payload === null) return;
      if (!session.send(payload)) this.#onStrategySendFailed(conn, userId, msg.t);
      return;
    }

    if (msg.t === "vi.set") {
      const { accountNo, orderAmountKrw, checkRate, run } = msg;
      const session = this.#strategySession(conn, userId, msg.t);
      if (session === null) return;
      if (!this.#accountAllowed(conn, session, userId, msg.t, accountNo)) return;
      // `priceType` 은 싣지 않는다 — 상한가("U") 고정이라 조립기가 채운다 (하한가 경로 봉쇄).
      const payload = this.#buildStrategyPayload(conn, userId, msg.t, () =>
        buildSetVITriggerReq({ accountNo, orderAmountKrw, checkRate, run }),
      );
      if (payload === null) return;
      if (!session.send(payload)) this.#onStrategySendFailed(conn, userId, msg.t);
      return;
    }

    if (msg.t === "vi.confirm") {
      // 계좌 필드가 없다 — 확인 체크는 **이미 그 세션이 낸 주문**에 대한 토글이고, 대조의
      // 정본은 서버의 주문번호 소유권이다. 여기서 계좌를 지어내 대조하면 근거가 두 벌이 된다.
      const { orderNo, confirmed } = msg;
      const session = this.#strategySession(conn, userId, msg.t);
      if (session === null) return;
      const payload = this.#buildStrategyPayload(conn, userId, msg.t, () =>
        buildConfirmVIOrderReq({ orderNo, confirmed }),
      );
      if (payload === null) return;
      if (!session.send(payload)) this.#onStrategySendFailed(conn, userId, msg.t);
      return;
    }

    if (msg.t === "strategies.disable") {
      // `key` 생략·`""` 는 그 세션의 상따 전부 + VI 다. 대상은 언제나 **그 세션** 안이므로
      // 계좌 대조 대상이 없다. 64B 상한은 조립기가 던진다 (T-16-06).
      const key = msg.key ?? "";
      const session = this.#strategySession(conn, userId, msg.t);
      if (session === null) return;
      const payload = this.#buildStrategyPayload(conn, userId, msg.t, () =>
        buildDisableStrategiesReq(key),
      );
      if (payload === null) return;
      if (!session.send(payload)) this.#onStrategySendFailed(conn, userId, msg.t);
      return;
    }

    // ------------------------------------------------------------------
    // 주문 2종 (D-02). 전략과 **같은 자리**다 — `isin` 은 있지만 `ex`/`isin` 조합으로
    // 시세 키를 만드는 메시지가 아니므로 `keyOf` 좁히기보다 먼저 갈라야 한다 (Pitfall 14).
    //
    // ①②③ 순서는 핸들러 안에 그대로 있다. 여기서 다시 검사하지 않는 이유는 대조가 두 벌이
    // 되면 갈리기 때문이다 — 계좌 화이트리스트의 근거는 `session.allowedAccounts` 하나다.
    // ------------------------------------------------------------------
    if (msg.t === "order.new" || msg.t === "order.cancel") {
      if (this.#orders === null) {
        // 결선이 반쪽인 채로 조용히 버리지 않는다 (PC-7 무로그 fail-safe 금지). 프로토콜
        // 위반이 아니므로 연결은 끊지 않고, 사용자에게는 `rid` 를 단 거부로 답한다 —
        // 침묵하면 브라우저의 제출 버튼이 영원히 잠긴다.
        logger.error({ userId, t: msg.t }, "[WS] 주문 핸들러 미결선 — 주문을 받지 않는다");
        this.#send(conn, {
          t: "order.result",
          rid: msg.rid,
          orderNo: "",
          resultCode: -1,
          message: "지금은 주문을 받을 수 없습니다. 잠시 후 다시 시도해 주세요.",
          status: "rejected",
        });
        return;
      }
      // 거부·타임아웃까지 전부 프레임으로 드러나므로 여기서 예외를 기다리지 않는다.
      void this.#orders.handle(conn, userId, msg);
      return;
    }

    if (msg.t === "sub") {
      // `keyOf` 는 **분기 안에서** 계산한다. 가드 직후 무조건 부르면 `isin`/`ex` 가 없는
      // 전략·주문 메시지가 `undefined|undefined` 키를 만든다 (16-RESEARCH Pitfall 14).
      const key = keyOf(msg.isin, msg.ex);
      if (conn.keys.has(key)) {
        // 같은 소켓의 중복 구독을 참조계수에 반영하면 close 때 하나가 남아 샌다.
        logger.info({ userId, isin: msg.isin, ex: msg.ex }, "[WS] 이 소켓의 중복 구독 — 무시");
        return;
      }
      conn.keys.set(key, { isin: msg.isin, ex: msg.ex });
      this.#hub.subscribe(userId, msg.isin, msg.ex);

      // 캐시가 있으면 게이트웨이 응답을 기다리지 않고 즉시 그린다 (D-37).
      const snapshot = this.#hub.getSnapshot(userId, msg.isin, msg.ex);
      if (snapshot !== undefined) this.#send(conn, snapshot);
      const tape = this.#hub.getTape(userId, msg.isin, msg.ex);
      if (tape !== undefined && tape.length > 0) {
        this.#send(conn, { t: "tape", i: msg.isin, x: msg.ex, snap: true, e: tape });
      }
      return;
    }

    const key = keyOf(msg.isin, msg.ex);
    if (!conn.keys.has(key)) {
      logger.warn({ userId, isin: msg.isin, ex: msg.ex }, "[WS] 잡지 않은 키 해제 요청 — 무시");
      return;
    }
    conn.keys.delete(key);
    this.#hub.unsubscribe(userId, msg.isin, msg.ex);
  }

  // ----------------------------------------------------------
  // 전략 인바운드 (D-01) — order-api.ts ①②③ 이식
  // ----------------------------------------------------------

  /**
   * ① 활성 Ready 세션 확인. **여기서 대신 로그인하지 않는다** (D-15).
   *
   * 세션이 없거나 준비되지 않았는데 조용히 무시하면, 서버가 거부를 응답 코드로 주지 않는
   * 전략에서는(Pitfall 8) 사용자에게 「눌렀는데 아무 일도 일어나지 않음」으로만 보인다.
   * 그래서 반드시 로그 + 프레임 양쪽으로 드러낸다 (PC-7).
   */
  #strategySession(conn: Conn, userId: string, t: RelayInbound["t"]): DmaSession | null {
    const session = this.#sessions.get(userId);
    if (session === undefined) {
      logger.warn({ userId, t }, "[WS] 세션 없음 — 전략 요청 거부");
      this.#send(conn, {
        t: "state",
        s: "failed",
        msg: "실시간 세션이 없습니다. 호가창을 먼저 열어 주세요.",
      });
      return null;
    }
    if (!session.isReady) {
      // **현재 상태**를 그대로 되돌린다 — 배지와 거부 사유가 한 프레임으로 맞는다.
      logger.warn({ userId, t, state: session.state }, "[WS] 세션 미준비 — 전략 요청 거부");
      this.#send(conn, session.stateFrame("세션이 준비되지 않아 전략 요청을 보내지 못했습니다"));
      return null;
    }
    return session;
  }

  /**
   * ② **계좌 화이트리스트 대조** — relay 쪽 최후 방어선이다 (T-16-01 / D-20).
   *
   * 원천은 `session.allowedAccounts`(게이트웨이 응답과 대조된 목록)**뿐**이다. 상태 프레임의
   * 계좌 사본이나 인바운드 바디를 근거로 삼으면 IDOR 이 그대로 열린다. 게이트웨이의
   * `CheckSessionAccount` 가 2중 차단이지만 그것은 **조용하므로**, relay 가 먼저 막고 사유를
   * 돌려준다 — 막힌 줄 모르는 사용자가 같은 요청을 반복하는 것이 더 나쁘다.
   */
  #accountAllowed(
    conn: Conn,
    session: DmaSession,
    userId: string,
    t: RelayInbound["t"],
    accountNo: string,
  ): boolean {
    if (session.allowedAccounts.some((a) => a.accountNo === accountNo)) return true;
    // 로그는 마스킹, 화면은 전체 표시가 규율이다 (S-5 / T-16-09). 인바운드 원문은 싣지 않는다.
    logger.error(
      { userId, t, accountNo: maskAccountNo(accountNo) },
      "[WS] 세션 계좌 목록 밖의 전략 요청 — 거부",
    );
    this.#send(conn, rejectFrame("이 세션에서 사용할 수 없는 계좌입니다.", accountNo));
    return false;
  }

  /**
   * **철거(삭제) 요청인가** — 판정의 정본은 **게이트 4종**이다 (R2-CR-01 / GC-WR-04 / T-16-55).
   *
   * 계약 원문(`packages/shared/src/relay.ts:136-141` `RelayLimitChaser.crud`)이 못박은 문장은
   * 「매수·매도·취소 게이트가 **전부** 꺼지면 **서버가** `"D"` 로 정규화한다」이다. 즉 삭제의
   * 정본은 **게이트 상태**이고 `crud` 는 그 정규화의 결과를 말하는 힌트일 뿐이다 —
   * `webapp/src/lib/limit-chaser.ts` 의 `crudOf()` 도 자기 docstring 에 「전송용 힌트일
   * 뿐이다」라고 적어 두었고, 그 값은 `isDeleteIntent(gates)` 의 파생값이다.
   *
   * ⚠️ 그래서 `cfg.crud === "D"` 를 **판정의 단독 근거로 쓰지 않는다.** `crud` 는 **인바운드
   *   필드**라(`relay/src/ws/protocol.ts` `crud: z.enum(["C","D"])`, `RelayLimitChaserInput` 이
   *   `crud` 를 Omit 하지 않는다) 브라우저·옛 탭·임의의 wss 클라이언트가 값을 정한다.
   *   클라이언트의 자칭을 서버 가드의 면제 조건으로 쓰면 그것은 가드가 아니다 —
   *   `{crud:"D", buyEnabled:true, buyOrderPrice:0, buyOrderQty:0, isin:<마스터에 없는 ISIN>}`
   *   한 프레임이 시장 해석 엄격성(T-16-42)과 무장 가드(T-16-43)를 **동시에** 지나
   *   「시장이 틀리고 무장까지 걸린 반복 발주 설정」으로 게이트웨이에 나갔다 (R2-CR-01).
   *
   * 그래서 갈래는 **하나**다 — 게이트 4종이 전부 꺼졌는가. 16-29 의 ② 갈래(「`crud` 가 `"C"`
   * 로 와도 게이트가 다 꺼졌으면 게이트웨이가 `"D"` 로 정규화하므로 사실상 삭제」)는 **여전히
   * 참이고 이제 유일한 갈래**다. `crudOf` 를 안 태운 경로(옛 탭·직접 wss)의 전 게이트 OFF 도
   * 그대로 삭제로 온다.
   *
   * ★ 게이트 4종에 **`sweepEnabled` 는 없다** — 한방만 켠 전략도 서버가 삭제로 정규화한다.
   *   `webapp/src/lib/limit-chaser.ts` 의 `isDeleteIntent()` 와 **같은 네 항**이다(그쪽이
   *   원본이고 여기가 서버측 사본이다 — 항이 갈리면 「지운 줄 알았는데 남는」 전략이 생긴다).
   *
   * ★ **부수효과 없는 순수 판정**이다. `crud` 불일치 로그는 프레임이 들어오는 지점(`lc.set`
   *   분기) 한 곳에서만 남긴다 — 이 함수는 한 프레임당 최대 두 번(`lc.set` · `#strategyArmable`)
   *   호출되므로 여기에 로그를 두면 사고 1건이 두 줄로 새어 운영 신호가 부풀려진다.
   */
  #isTeardown(cfg: RelayLimitChaserInput): boolean {
    return (
      !cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled
    );
  }

  /**
   * ②-1′ **철거 요청의 시장 해석** — 실패해도 **거부하지 않는다** (GC-WR-04 / T-16-55).
   *
   * `#strategyMarket` 과 이름이 아니라 **정책이** 다르다. 여기서 `null` 은 절대 나오지 않는다 —
   * 사용자가 자기 전략을 내리지 못하는 상태를 만드는 것이, 철거 프레임의 `market` 한 글자가
   * 틀리는 것보다 나쁘다는 판단이다(T-16-44 의 서버측). 그 판단이 안전한 이유는 **전략 키에
   * 시장이 없다**는 사실이다 — `strategyKey()` = `${isin}:${accountNo}:${exchange}`.
   *
   * 폴백 사슬(근거가 강한 순):
   *   ① **서버가 에코한 전략의 `market`** — 게이트웨이가 그 값으로 저장했다는 1차 증거다.
   *      `lc.snap` 이 쓰는 바로 그 캐시(`getLimitChasers`)를 읽는다.
   *   ② `SymbolMap` 해석 — 캐시에 없을 때(다른 세션이 등록했거나 재시작 직후)의 2차 근거.
   *   ③ `TEARDOWN_MARKET_FALLBACK` — **`logger.error` 를 남기고** 통과시킨다(S-5).
   */
  #teardownMarket(
    userId: string,
    t: RelayInbound["t"],
    cfg: RelayLimitChaserInput,
  ): OrderMarket {
    // ① 키 조립 지점은 `strategyKey()` 하나뿐이다 — 세 필드를 여기서 손으로 비교하면
    //    12자 절단·거래소 정규화 중 한쪽만 반영돼 「에코가 영원히 안 맞는」 실패가 된다.
    const wanted = strategyKey(cfg.isin, cfg.accountNo, cfg.exchange);
    const echoed = this.#hub.getLimitChasers(userId).find((lc) => lc.key === wanted);
    if (echoed !== undefined) return echoed.market;

    // ② 캐시에 없으면 종목맵. 여기서 실패해도 거부로 이어지지 않는다.
    const info = this.#symbols?.lookup(cfg.isin);
    if (info !== undefined && info.market !== null) return info.market;

    // ③ 조용히 메우지 않는다 — 이 줄이 곧 「마스터가 안 떠 있다/상장폐지됐다」는 운영 신호다.
    //    계좌번호는 싣지 않는다 (T-16-45).
    logger.error(
      { userId, t, isin: cfg.isin, fallbackMarket: TEARDOWN_MARKET_FALLBACK },
      "[WS] 시장 미해석 상태의 전략 삭제 — 폴백 시장으로 송신 (전략 키에 시장이 없어 대상은 정확하다)",
    );
    return TEARDOWN_MARKET_FALLBACK;
  }

  /**
   * ②-1 **ISIN → 시장 구분 해석** — `lc.set` 의 **등록·수정 전용** (WR-03 / D-28).
   *
   * 브라우저는 `market` 을 싣지 않는다(스키마에서 지웠다). 시장의 정본은 `SymbolMap` 하나이고
   * relay 가 그것을 소유한다 — `order.new` 의 게이트 ③-1 과 **동형**이다.
   *
   * ★ **철거 요청은 이 함수를 지나지 않는다**(`#teardownMarket` 이 받는다). 삭제를 해석 실패로
   *   막으면 사용자의 자산을 인질로 잡는다 — 상장폐지·마스터 미로딩 종목의 전략을 영원히
   *   내리지 못하게 된다 (GC-WR-04 / T-16-44 의 서버측).
   *
   * ★ 못 풀면 **거부**다. 기본값 `"K"` 로 메우면 코스닥 전략이 코스피로 등록되고, 전략은
   *   한 번의 주문이 아니라 **반복 발주 설정**이라 그 오차가 계속 재생산된다 (T-16-42).
   * ★ `#symbols` 가 없으면(테스트 하네스가 결선하지 않은 경우) 역시 거부다 — 종목맵 없이
   *   전략을 조립하면 결국 시장을 지어내게 된다. 프로덕션 부팅은 항상 결선한다(`index.ts`).
   * ★ 로그에 계좌번호를 싣지 않는다 (`maskAccountNo` 규율 / T-16-45) — `isin` 과 사유만 남긴다.
   */
  #strategyMarket(
    conn: Conn,
    userId: string,
    t: RelayInbound["t"],
    isin: string,
  ): OrderMarket | null {
    if (this.#symbols === null) {
      logger.error({ userId, t, isin }, "[WS] 종목맵 미결선 — 전략 요청 거부 (시장을 지어내지 않는다)");
      this.#send(conn, rejectFrame("이 종목은 지금 전략을 등록할 수 없습니다.", "", isin));
      return null;
    }
    const info = this.#symbols.lookup(isin);
    if (info === undefined || info.market === null) {
      logger.error(
        { userId, t, isin, known: info !== undefined },
        "[WS] ISIN → 시장 해석 실패 — 전략 요청 거부 (게이트웨이로 나가지 않았다)",
      );
      this.#send(conn, rejectFrame("이 종목은 지금 전략을 등록할 수 없습니다.", "", isin));
      return null;
    }
    return info.market;
  }

  /**
   * ②-2 **무장 조건 검사** — `lc.set` 전용 (WR-06).
   *
   * 발주가나 발주 수량이 0 인데 게이트가 켜져 있으면 그 전략은 **영원히 발주하지 않는다**.
   * 그런데 화면에는 「무장」 배지가 뜬다 — 사용자는 무장했다고 믿는 조용한 실패다.
   *
   * ★ UI 가 먼저 막지만(`limit-chaser-form.tsx` `gateBlocked`) **조립 단계가 모든 호출 경로의
   *   마지막 관문**이어야 한다. `UIntSchema` 는 `min(0)` 이라 0 을 통과시키므로 스키마는
   *   이것을 잡지 못한다 — UI 를 우회한 경로(직접 wss, 옛 탭)가 있어도 무장 상태가 만들어지면
   *   안 된다 (T-16-43).
   * ★ 그래서 이 함수는 UI 의 `canArm*` **세 식과 동형**이어야 한다 (GC-WR-05). 마지막 관문이
   *   첫 관문보다 느슨하면 위 문장이 성립하지 않는다 — 아래 세 갈래가 각각
   *   `canArmBuy` · `canArmSell` · `canArmSweep`(`limit-chaser-form.tsx:343-365`)의 부정이다.
   * ★ 매도 수량(`sellOrderQty`)은 **S→C 전용**이라 요청에 없다. 매도가 대신 보는 것은
   *   `sellWatchQty` 이고, 계약이 「**0 이면 서버가 매도 활성화를 거부**(눕힘)한다」고 못박은
   *   값이다(`packages/shared/src/relay.ts`). 그것을 통과시키면 조용한 부분 거부가 재현된다.
   * ★ **철거(삭제) 요청에는 걸지 않는다** (GC-WR-04 와 같은 규율). 무장이 아니라 해제이므로
   *   막으면 사용자의 자산을 인질로 잡는다 (T-16-44 의 서버측). 판정을 호출부가 아니라 이
   *   함수가 소유해 호출부가 늘어도 규율이 갈리지 않게 한다.
   * ★ 그 면제의 조건은 이제 **게이트 4종의 실제 상태**다 — 클라이언트가 보낸 `crud:"D"` 가
   *   아니다 (R2-CR-01). 자칭으로 면제되면 이 가드는 「끄고 싶은 사람은 D 라고 쓰세요」가 된다.
   */
  #strategyArmable(
    conn: Conn,
    userId: string,
    t: RelayInbound["t"],
    cfg: RelayLimitChaserInput,
  ): boolean {
    // ★ 이 줄을 지우면 안 된다 — 무용지물이 아니다. 게이트 4종이 **전부 꺼져 있어도**
    //   `sweepEnabled: true` ∧ (`sweepWatchPrice === 0` ∨ `buyOrderPrice === 0` ∨
    //   `buyOrderQty === 0`) 이면 아래에서 `reason === "sweep"` 이 되어 **철거가 거부된다.**
    //   `sweepEnabled` 는 삭제 판정 4종(`#isTeardown`)에 들어 있지 않기 때문이다. 이 면제가
    //   없으면 「한방만 켜 둔 전략을 영원히 못 지우는」 상태가 만들어진다 (T-16-55 / T-16-44).
    if (this.#isTeardown(cfg)) return true;
    // UI 는 `buyQty` 를 `buyOrderQtyFromAmount(금액, 가격)` 로 **산출**하지만 relay 가 받는 것은
    // 이미 산출된 `buyOrderQty` 다 — 그래서 여기서는 `buyOrderQty === 0` 을 본다. 「식이 다르다」가
    // 아니라 같은 식의 양 끝이다.
    const reason =
      // UI `canArmBuy = buyOrderPrice > 0 && buyQty > 0`
      cfg.buyEnabled && (cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0)
        ? "buy"
        : // UI `canArmSell = sellOrderPrice > 0 && sellWatchQty > 0`
          cfg.sellEnabled && (cfg.sellOrderPrice === 0 || cfg.sellWatchQty === 0)
          ? "sell"
          : // UI `canArmSweep = sweepWatchPrice > 0 && canArmBuy` — 한방은 매수 발주를
            // **재계산**하는 보조 트리거라 매수 무장 조건을 함께 요구한다. 매수를 못 켜는
            // 상태에서 한방만 켜면 정의상 아무 발주도 만들지 못한다.
            cfg.sweepEnabled &&
              (cfg.sweepWatchPrice === 0 || cfg.buyOrderPrice === 0 || cfg.buyOrderQty === 0)
            ? "sweep"
            : null;
    if (reason === null) return true;
    // 계좌번호는 싣지 않는다 (`maskAccountNo` 규율 / T-16-45) — `isin` 과 사유만 남긴다.
    logger.error(
      { userId, t, isin: cfg.isin, gate: reason },
      "[WS] 발주가·수량 0 인 게이트 무장 — 전략 요청 거부 (게이트웨이로 나가지 않았다)",
    );
    // 문구는 **갈래별로 가르지 않는다.** UI 의 `ARM_BLOCKED_TEXT` 3종이 이미 필드 단위로
    // 정확하게 안내하고(첫 관문), 이 프레임은 그 UI 를 우회한 경로에만 도달한다 — 여기서
    // 필드명을 따로 적으면 두 벌의 문구가 갈려 언젠가 서로 모순된다. 갈래는 로그의
    // `gate` 로 구분한다.
    this.#send(
      conn,
      rejectFrame(
        "가격이나 수량이 0 인 게이트가 있어 전략을 켤 수 없습니다. 값을 확인해 주세요.",
        "",
        cfg.isin,
      ),
    );
    return false;
  }

  /**
   * ③-a 조립. `OrderBuildError` 를 포함한 **모든 예외**를 로그 + 거부 프레임으로 드러낸다.
   * 삼키면 형식 위반이 「보냈는데 반응 없음」으로 둔갑한다 (PC-7).
   */
  #buildStrategyPayload(
    conn: Conn,
    userId: string,
    t: RelayInbound["t"],
    build: () => Uint8Array,
  ): Uint8Array | null {
    try {
      return build();
    } catch (err) {
      const code = err instanceof OrderBuildError ? err.code : "BUILD_FAILED";
      const reason =
        err instanceof OrderBuildError ? err.message : "전략 요청을 만들지 못했습니다.";
      logger.error({ err, userId, t, code }, "[WS] 전략 요청 조립 거부 — 게이트웨이로 나가지 않았다");
      this.#send(conn, rejectFrame(reason));
      return null;
    }
  }

  /** ③-b 송신 실패. 전송 계층 사유는 `DmaSession.send` 가 이미 남겼고 여기는 사용자 통지다. */
  #onStrategySendFailed(conn: Conn, userId: string, t: RelayInbound["t"]): void {
    logger.error({ userId, t }, "[WS] 전략 요청 송신 실패 — 게이트웨이로 나가지 않았다");
    this.#send(conn, rejectFrame("전략 요청을 전송하지 못했습니다. 연결 상태를 확인해 주세요."));
  }

  /**
   * ④ 인바운드 토큰 버킷 — 연결당 초당 `INBOUND_RATE_LIMIT_PER_SEC` 건 (T-16-06).
   *
   * 초과분은 **드롭**이다(연결을 끊지 않는다) — 폭주는 프로토콜 위반이 아니라 과속이고,
   * 끊으면 브라우저가 재접속으로 되돌아와 같은 부하를 다시 만든다. 경고는 초과 구간당 1회로
   * 묶는다: 초당 수백 건이 오는 상황에서 건마다 로그하면 로그가 곧 두 번째 DoS 다.
   */
  #allowInbound(conn: Conn, userId: string, t: RelayInbound["t"]): boolean {
    const now = Date.now();
    const refilled = ((now - conn.rateRefilledAtMs) * INBOUND_RATE_LIMIT_PER_SEC) / 1000;
    conn.rateRefilledAtMs = now;
    conn.rateTokens = Math.min(INBOUND_RATE_BURST, conn.rateTokens + refilled);

    if (conn.rateTokens < 1) {
      if (!conn.rateWarned) {
        conn.rateWarned = true;
        logger.warn(
          { userId, t, limitPerSec: INBOUND_RATE_LIMIT_PER_SEC },
          "[WS] 인바운드 상한 초과 — 프레임을 버린다 (연속 경고는 1회로 묶는다)",
        );
      }
      return false;
    }

    conn.rateTokens -= 1;
    conn.rateWarned = false;
    return true;
  }

  /** close 핸들러 = `finally`. 타이머·참조계수·세션 참조를 **전부** 되돌린다. */
  #onClose(conn: Conn, code: number): void {
    this.#clearAuthTimer(conn);
    this.#conns.delete(conn);
    // 그 연결의 주문 대기열·타이머를 걷는다 (타이머 누수 0). 인증 전 종료도 안전하다 —
    // 대기열이 없으면 no-op 이다.
    this.#orders?.closeConn(conn);

    const userId = conn.userId;
    if (userId === null) {
      logger.info({ code }, "[WS] 미인증 연결 종료");
      return;
    }

    // **이 소켓이 잡은 키만** 해제한다 — 다른 탭의 구독을 끊으면 안 된다.
    for (const { isin, ex } of conn.keys.values()) {
      this.#hub.unsubscribe(userId, isin, ex);
    }
    conn.keys.clear();

    const entry = this.#users.get(userId);
    if (entry !== undefined) {
      entry.conns.delete(conn);
      if (entry.conns.size === 0) this.#users.delete(userId);
    }

    if (conn.acquired) this.#sessions.release(userId);
    logger.info({ userId, code }, "[WS] 연결 종료 — 구독 해제 + 세션 참조 반납");
  }

  // ----------------------------------------------------------
  // 팬아웃
  // ----------------------------------------------------------

  /**
   * 사용자를 팬아웃 대상 표에 등록한다. 세션 상태 리스너는 **사용자당 1개**다 —
   * 탭마다 붙이면 세션 하나에 리스너가 쌓인다.
   */
  #register(conn: Conn, userId: string, session: DmaSession): void {
    const existing = this.#users.get(userId);
    if (existing !== undefined && existing.session === session) {
      existing.conns.add(conn);
      return;
    }

    const entry: UserEntry = { session, conns: new Set([conn]) };
    if (existing !== undefined) {
      // 세션이 재생성됐다 — 기존 소켓들도 새 세션의 상태를 받아야 한다.
      for (const c of existing.conns) entry.conns.add(c);
      logger.info({ userId, conns: entry.conns.size }, "[WS] 세션 교체 — 상태 리스너 재결선");
    }
    this.#users.set(userId, entry);

    session.on("state", (frame: RelayStateMsg) => {
      // 정본이 바뀌었으면 옛 리스너는 침묵한다 (15-03 generation 규율 동형).
      const current = this.#users.get(userId);
      if (current === undefined || current.session !== session) return;
      this.#deliver(userId, frame);
    });
  }

  /** **그 사용자의 소켓 집합에만** 보낸다. 전역 순회 경로를 만들지 않는다 (T-15-02). */
  #deliver(userId: string, msg: RelayOutbound): void {
    const entry = this.#users.get(userId);
    if (entry === undefined) return;
    for (const conn of entry.conns) this.#send(conn, msg);
  }

  /**
   * 소켓 1개로 전송. **동기 write 만** 한다 — 여기서 기다리면 DMA 수신 경로가 멎는다 (D-32).
   *
   * 느린 클라이언트는 기다려 주지 않고 버린다. 임계 초과가 연속 3회면 그 연결만 끊는다.
   */
  #send(conn: Conn, msg: RelayOutbound): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;

    const buffered = conn.ws.bufferedAmount;
    if (buffered > this.#backpressureLimit) {
      conn.overflows += 1;
      logger.warn(
        { userId: conn.userId, bufferedAmount: buffered, strikes: conn.overflows },
        "[WS] 백프레셔 — 이 프레임을 버린다",
      );
      if (conn.overflows >= BACKPRESSURE_STRIKES) {
        logger.warn(
          { userId: conn.userId, bufferedAmount: buffered, limit: this.#backpressureLimit },
          "[WS] 백프레셔 연속 초과 — 이 연결만 종료",
        );
        conn.ws.terminate();
      }
      return;
    }

    conn.overflows = 0;
    try {
      conn.ws.send(encode(msg));
    } catch (err) {
      // 인코딩 가드(64비트 정수)나 소켓 오류. 조용히 넘기지 않는다 (S-5).
      logger.error({ err, userId: conn.userId, t: msg.t }, "[WS] 아웃바운드 전송 실패");
    }
  }

  // ----------------------------------------------------------
  // 내부 보조
  // ----------------------------------------------------------

  /** `ws` README 의 isAlive 패턴 — pong 이 없으면 다음 주기에 정리한다. */
  #sweep(): void {
    for (const conn of [...this.#conns]) {
      if (conn.ws.readyState !== WebSocket.OPEN) continue;
      if (!conn.isAlive) {
        logger.warn({ userId: conn.userId }, "[WS] pong 미수신 — 연결 정리");
        conn.ws.terminate();
        continue;
      }
      conn.isAlive = false;
      conn.ws.ping();
    }
  }

  async #lookupCredentials(userId: string): Promise<DmaCredentials | null> {
    const record = await getDmaCredentials(this.#supabase, userId, this.#credKey);
    if (record === null) return null;
    // 평문은 여기서 세션으로만 넘어간다. 로그·상태 프레임에 싣지 않는다 (D-19).
    return { dmaUserId: record.dmaUserId, password: record.password };
  }

  #reject(conn: Conn, reason: string): void {
    logger.warn({ userId: conn.userId, reason }, "[WS] 프로토콜 위반 — 연결 종료");
    this.#clearAuthTimer(conn);
    conn.ws.close(RELAY_WS_CLOSE.BAD_MESSAGE, reason);
  }

  #clearAuthTimer(conn: Conn): void {
    if (conn.authTimer === null) return;
    clearTimeout(conn.authTimer);
    conn.authTimer = null;
  }
}
