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
 *   6. sub → 참조계수 +1, 스냅샷 캐시가 있으면 그 소켓에 즉시 전송 (D-37)
 *   7. close → authTimer 정리, **그 소켓이 잡은 키만** 해제, `sessions.release`
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
 *
 * 하지 않는 것:
 *   - 주문을 받지 않는다 (D-08). 주문은 Cloud Run server 의 REST 전용이다.
 *   - 구독 상태를 소유하지 않는다. 참조계수·캐시의 정본은 `SubscriptionHub` 다.
 *   - 자격증명을 캐시하지 않는다. 매 인증마다 조회한다 — 등록 해제가 즉시 반영돼야 한다.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RELAY_WS_CLOSE } from "@gh-radar/shared";
import type { RelayExchange, RelayInbound, RelayOutbound, RelayStateMsg } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { verifyToken } from "../auth/verify-token.js";
import { getDmaCredentials } from "../store/credentials.js";
import type { SubscriptionHub } from "../hub/subscription-hub.js";
import type { DmaSession } from "../dma/session.js";
import type { DmaCredentials } from "../dma/session-manager.js";
import { encode, parseInbound } from "./protocol.js";

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
};

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

  constructor(deps: WsFanoutDeps) {
    this.#server = deps.server;
    this.#supabase = deps.supabase;
    this.#sessions = deps.sessions;
    this.#hub = deps.hub;
    this.#credKey = deps.credKey;
    this.#path = deps.path ?? DEFAULT_WS_PATH;
    this.#authTimeoutMs = deps.authTimeoutMs ?? AUTH_TIMEOUT_MS;
    this.#backpressureLimit = deps.backpressureLimitBytes ?? BACKPRESSURE_LIMIT_BYTES;

    this.#wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
      perMessageDeflate: PERMESSAGE_DEFLATE,
    });

    this.#onUpgrade = (req, socket, head): void => this.handleUpgrade(req, socket, head);
    this.#server?.on("upgrade", this.#onUpgrade);

    // Hub 는 **userId 를 지정해서만** 내보낸다. 여기서 그 사용자의 소켓 집합으로 좁힌다.
    this.#hub.on("fanout", (e) => this.#deliver(e.userId, e.msg));

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
      logger.error({ err, userId }, "[WS] 자격증명 조회 실패 — 연결 종료");
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
  }

  #onAuthedMessage(conn: Conn, userId: string, msg: RelayInbound): void {
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

    const key = keyOf(msg.isin, msg.ex);

    if (msg.t === "sub") {
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

    if (!conn.keys.has(key)) {
      logger.warn({ userId, isin: msg.isin, ex: msg.ex }, "[WS] 잡지 않은 키 해제 요청 — 무시");
      return;
    }
    conn.keys.delete(key);
    this.#hub.unsubscribe(userId, msg.isin, msg.ex);
  }

  /** close 핸들러 = `finally`. 타이머·참조계수·세션 참조를 **전부** 되돌린다. */
  #onClose(conn: Conn, code: number): void {
    this.#clearAuthTimer(conn);
    this.#conns.delete(conn);

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
