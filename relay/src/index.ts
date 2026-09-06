/**
 * Phase 15 Plan 05 — RELAY-01. relay 프로세스 엔트리포인트 (부팅 결선 + graceful shutdown).
 *
 * `server/src/server.ts` 의 "config → 의존성 → listen → SIGTERM" 골격을 이식하되,
 * relay 는 **장기 연결을 소유하는 프로세스**라 종료 절차가 본질적으로 다르다.
 *
 * 포트 2개 (D-05):
 *   :8090 `WS_PORT`        평문 ws. TLS 는 **Caddy 가 종단**하고 여기로 평문을 넘긴다 —
 *                          이 프로세스는 인증서를 다루지 않는다. 경로는 `/ws`(15-04 계약).
 *   :8091 `ORDER_API_PORT` 내부 HTTP. Cloud Run(Direct VPC Egress)만 호출하며 방화벽
 *                          source-range + `X-Relay-Secret` 이중 방어다 (D-19/D-22).
 *
 * 결정 근거:
 *   D-07  relay 는 Docker 컨테이너(`--restart=always`)로 돌고 openconnect 는 host systemd
 *         소관이다. 그래서 **컨테이너 재시작이 VPN 터널을 흔들지 않는다** — 반대로
 *         재시작마다 KB 게이트웨이에 고아 세션이 쌓이지 않도록 종료 절차가 필요하다.
 *   D-13  DMA 세션 정본은 `SessionManager` 다. 여기서는 만들어서 넘겨주기만 한다.
 *   D-22  내부 HTTP 는 `/healthz` + `POST /internal/orders` 두 개다. 주문 라우트는
 *         Hub(주문 통보 출처)와 `OrderStore`(기록 큐)를 함께 받아야 열린다 — 둘 중
 *         하나라도 없으면 상관도 감사 기록도 불가능하므로 라우트 자체를 만들지 않는다.
 *
 * 종료 절차 (SC-8) — `process.exit(0)` 전에 반드시 이 순서다:
 *   1. HTTP 서버 2개 `close()`  — 새 연결을 받지 않는다
 *   2. `fanout.closeAll(1001)`  — 살아 있는 wss 에 정상 close 프레임(going away)
 *   3. `sessionManager.closeAll()` — 구독 해제 + DMA TCP 종료
 *   4. `hub.closeAll()`         — 배치 타이머 정리(남기면 프로세스가 안 내려간다)
 *   5. `orderStore.flushNow()`  — 남은 주문 기록을 밀어낸다. 여기를 건너뛰면 마지막
 *                                 체결 통보가 `dma_orders` 에 남지 않아 감사 기록에 구멍이 난다
 *   6. 5초 안에 안 끝나면 강제 exit — 종료가 소켓 사정에 매달리지 않게 한다
 *
 * 하지 않는 것:
 *   - 부팅 시 DMA 게이트웨이에 미리 접속하지 않는다. 세션은 **사용자의 wss 인증에서만**
 *     생긴다 (D-13). 아무도 안 붙으면 KB 로 나가는 TCP 는 0개다.
 *   - 비밀을 로그에 싣지 않는다. 부팅 로그는 포트·호스트·버전까지다.
 *   - 조용히 죽지 않는다. `unhandledRejection`/`uncaughtException` 을 잡아 사유를 남기고
 *     exit(1) 한다 — Docker 가 재시작할 때 로그에 원인이 남아야 한다.
 */
import http from "node:http";

import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createRelaySupabase } from "./store/supabase.js";
import { SymbolMap } from "./store/symbols.js";
import { SessionManager } from "./dma/session-manager.js";
import { SubscriptionHub } from "./hub/subscription-hub.js";
import { WsFanout } from "./ws/fanout.js";
import { createOrderApi } from "./order/order-api.js";
import { OrderStore, supabaseOrderSink } from "./store/orders.js";

/** 종료 절차 상한(ms). 이 시간을 넘기면 정리를 포기하고 강제로 내려간다. */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/** wss 종료 코드 — RFC 6455 `1001 going away`(서버가 내려간다). */
const WS_CLOSE_GOING_AWAY = 1001;

const config = loadConfig();

// ============================================================
// 결선 — config → supabase → 세션 → 구독 → 팬아웃 → 내부 HTTP
// ============================================================

/** 토큰 검증(`auth.getUser`)과 `dma_credentials` 조회를 겸하는 서비스롤 클라 1개 (D-02/D-19). */
const supabase = createRelaySupabase(config.supabaseUrl, config.supabaseServiceRoleKey);

const sessionManager = new SessionManager({
  host: config.dmaHost,
  port: config.dmaPort,
  broker: config.dmaBroker,
  graceMs: config.sessionGraceMs,
});

/**
 * ISIN → 종목명·단축코드. 게이트웨이는 잔고·미체결에 이름을 싣지 않으므로
 * relay 가 `stocks` 로 푼다. 부팅 1회 + 매일 08:30 KST 재적재뿐이며(원천인
 * `master-sync` 가 하루 1회 갱신한다), 조회 때마다 DB 를 때리지 않는다.
 *
 * `await` 하지 않는다 — 이름은 표시용이라 이것 때문에 listen 이 늦으면 안 된다.
 * 적재 전에 도착한 프레임은 이름 없이 나가고, UI 가 ISIN 으로 폴백한다.
 */
const symbols = new SymbolMap(supabase);
void symbols.start();

const hub = new SubscriptionHub({ symbols });

/**
 * 브라우저 wss 포트(8090)의 HTTP 서버.
 *
 * 업그레이드가 아닌 평문 요청도 반드시 응답해야 한다 — Caddy 는 `dma.jx1.io` 의 **모든**
 * 요청을 이 포트로 넘기므로, `request` 리스너가 없으면 잘못 들어온 GET 이 응답 없이
 * 소켓을 붙들고 있다가 타임아웃난다. 여기서는 정보를 흘리지 않는 404 만 돌려준다
 * (`/healthz` 는 내부 포트 8091 소관이다).
 */
const wsServer = http.createServer((_req, res) => {
  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found" } }));
});

const fanout = new WsFanout({
  // `server` 를 넘기지 않는다 — 이 포트의 라우팅(업그레이드 vs 평문)은 부팅 결선이 쥔다.
  supabase,
  sessions: sessionManager,
  hub,
  credKey: config.dmaCredKey,
});

wsServer.on("upgrade", (req, socket, head) => fanout.handleUpgrade(req, socket, head));

/**
 * `dma_orders` 갱신 큐 (D-24 / D-32).
 *
 * **DMA 수신 콜백은 이 객체의 `enqueueUpdate` 만 부른다** — Supabase 왕복을 그 자리에서
 * 기다리면 게이트웨이 송신 큐가 차서 서버가 연결을 끊는다. tick 이 실제 쓰기를 맡는다.
 */
const orderStore = new OrderStore(supabaseOrderSink(supabase));
orderStore.start();

const orderApi = createOrderApi({
  relayOrderSecret: config.relayOrderSecret,
  // `/healthz` 의 회선 판정 기준 — 이 주소와 같은 사내망 대역의 인터페이스가 있는지만 본다.
  dmaHost: config.dmaHost,
  appVersion: config.appVersion,
  nodeEnv: config.nodeEnv,
  sessions: sessionManager,
  // 주문 통보(51)의 출처는 Hub 하나다 — 팬아웃과 상관이 같은 파싱을 두 번 하지 않는다.
  orders: hub,
  orderStore,
});
const orderApiServer = http.createServer(orderApi);

// ============================================================
// listen
// ============================================================

wsServer.listen(config.wsPort, () => {
  orderApiServer.listen(config.orderApiPort, () => {
    // 부팅 로그 1건 — 비밀(서비스롤 키·AES 키·공유 비밀)은 어느 필드에도 없다.
    logger.info(
      {
        wsPort: config.wsPort,
        orderApiPort: config.orderApiPort,
        dmaHost: config.dmaHost,
        dmaPort: config.dmaPort,
        env: config.nodeEnv,
        version: config.appVersion,
      },
      "gh-radar-relay listening",
    );
  });
});

// ============================================================
// graceful shutdown (SC-8)
// ============================================================

let shuttingDown = false;

/**
 * 종료 절차. **KB 게이트웨이에 고아 세션을 남기지 않는 것**이 목적이다 —
 * `--restart=always` 컨테이너는 배포·크래시마다 재시작되는데, 그때마다 DMA TCP 를
 * 그냥 끊어 버리면 게이트웨이 쪽에 같은 user_id 의 세션이 쌓여 재로그인이 거부된다.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "[relay] 종료 절차 시작");

  // 5초 데드맨 — 정리가 늦어져도 컨테이너는 반드시 내려간다.
  const deadline = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "[relay] 종료 지연 — 강제 종료");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  deadline.unref();

  try {
    // 1) 새 연결 차단
    wsServer.close();
    orderApiServer.close();
    // 2) 살아 있는 wss 에 정상 close 프레임
    await fanout.closeAll(WS_CLOSE_GOING_AWAY);
    // 3) 구독 해제 + DMA 소켓 종료
    await sessionManager.closeAll();
    // 4) 배치 타이머 정리
    hub.closeAll();
    symbols.close();
    // 5) 주문 기록 잔여분 반영 후 tick 정지 (순서 중요 — close 를 먼저 하면 큐가 남는다)
    await orderStore.flushNow();
    orderStore.close();
    logger.info({ signal }, "[relay] 종료 절차 완료");
  } catch (err) {
    logger.error({ err }, "[relay] 종료 절차 실패 — 그대로 내려간다");
  } finally {
    clearTimeout(deadline);
    process.exit(0);
  }
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void shutdown(sig);
  });
}

// 조용한 죽음 금지 — 사유를 남기고 내려가야 Docker 재시작 로그에 원인이 남는다.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "[relay] unhandledRejection — 프로세스 종료");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "[relay] uncaughtException — 프로세스 종료");
  process.exit(1);
});
