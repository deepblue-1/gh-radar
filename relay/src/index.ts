/**
 * Phase 15 Plan 05 — RELAY-01. relay 프로세스 엔트리포인트 (부팅 결선 + graceful shutdown).
 *
 * `server/src/server.ts` 의 "config → 의존성 → listen → SIGTERM" 골격을 이식하되,
 * relay 는 **장기 연결을 소유하는 프로세스**라 종료 절차가 본질적으로 다르다.
 *
 * 포트 2개 (D-05):
 *   :8090 `WS_PORT`        평문 ws. TLS 는 **Caddy 가 종단**하고 여기로 평문을 넘긴다 —
 *                          이 프로세스는 인증서를 다루지 않는다. 경로는 `/ws`(15-04 계약).
 *   :8091 `ORDER_API_PORT` 내부 HTTP. **`/healthz` 하나뿐**이다 (16-16). 방화벽
 *                          source-range + `X-Relay-Secret` 이중 방어를 유지한다 (D-19/D-22).
 *
 * 결정 근거:
 *   D-07  relay 는 Docker 컨테이너(`--restart=always`)로 돌고 openconnect 는 host systemd
 *         소관이다. 그래서 **컨테이너 재시작이 VPN 터널을 흔들지 않는다** — 반대로
 *         재시작마다 KB 게이트웨이에 고아 세션이 쌓이지 않도록 종료 절차가 필요하다.
 *   D-13  DMA 세션 정본은 `SessionManager` 다. 여기서는 만들어서 넘겨주기만 한다.
 *   D-02  주문 접수는 **wss 하나**다. 내부 HTTP 의 주문 라우트는 16-16 에서 제거했고
 *         남은 것은 `/healthz` 뿐이다. 주문 결선은 `WsFanout` 에 넘기는 종목맵 하나다.
 *   Phase 19 D-01  사용자 세션 경로는 DB 에 쓰지 않는다 — 주문 기록 경로는 제거됐고, 기록은
 *         관찰자 기록기 단독이다. 관찰자 → 기록기 → 적용 RPC → `fanout.deliverJournalRows` 결선은 이 파일이다.
 *   Phase 19 D-13  관찰자 연결은 **게이트웨이당 1개**(`config.journalUpstreams` — quick-260929-c8e)이고
 *         **부팅 즉시** 연다(장 시간과 무관 · 24시간 상시). 커서 읽기 → 로그인 → 매핑 동기화 순서는 각
 *         `JournalObserver` 가 쥔다. 비밀이 없으면(개발·테스트 · 추가 게이트웨이 비밀 미배치) disabled 로 남는다 —
 *         주 게이트웨이는 production 에서 config 가 기동을 막는다(D-10).
 *   Phase 19 D-03/D-04  기록 연결 상태는 게이트웨이마다 `JournalStatus` **한 원천**이다 — 주 게이트웨이의 것이
 *         브라우저 `journal.state` 프레임(`fanout.deliverJournalState` · 인증 직후 스냅샷)과 `/healthz` 의
 *         `journal` 필드가 보는 값이다.
 *   quick-260929-c8e  **브라우저 `journal.state` 는 주 게이트웨이만** 보낸다(결선 1곳). 추가 게이트웨이 상태는
 *         `/healthz` 본문 `journalGateways` 에만 싣고 503 판정에 넣지 않는다. 추가 게이트웨이 적용 행은 **그
 *         게이트웨이의 매핑으로** `journal.rows` 푸시한다. 사용자 세션(`SessionManager`)은 주 게이트웨이 단일이다.
 *   quick-260929-sas  추가 게이트웨이 푸시는 **명시 신원 연결**(`GatewayIdentities` — DB 뷰 `dma_visibility_identities`
 *         사본, 부팅 즉시 + 60초 재적재 · fail closed)로만 사용자에게 잇는다. 자격증명 문자열로 잇지 않는다.
 *         주 게이트웨이 결선 줄은 그대로다. 추가 게이트웨이가 없으면 신원 조회 자체가 없다.
 *   D-22  `RELAY_ORDER_SECRET` 은 그대로 required 다. `/healthz` 외의 모든 경로가
 *         비밀 없이는 404 조차 받지 못해야 한다 — 경로 존재 여부도 정보다.
 *
 * 종료 절차 (SC-8) — `process.exit(0)` 전에 반드시 이 순서다:
 *   1. HTTP 서버 2개 `close()`  — 새 연결을 받지 않는다
 *   2. `fanout.closeAll(1001)`  — 살아 있는 wss 에 정상 close 프레임(going away)
 *   3. `sessionManager.closeAll()` — 구독 해제 + DMA TCP 종료
 *   4. 전 게이트웨이 `observer.stop()` — 관찰자 연결 종료(새 배치를 받지 않는다 — Phase 19 D-13)
 *   5. 전 게이트웨이 `writer` · `strategyWriter` `drain(2초)` **병렬** → 전 기록기 · `access` · `status` · 신원 적재기 `close()`
 *      — 큐에 남은 레코드를 적용 RPC 로 보낸다. 2초 안에 못 끝내도 **유실은 없다** — 커서는 적용 RPC
 *      트랜잭션 안에서만 전진하므로 다음 부팅이 남은 구간을 재생한다(D-12).
 *   6. `hub.closeAll()` · `symbols` · 종목마스터 — 배치·재적재 타이머 정리(남기면 프로세스가 안 내려간다)
 *   전체 상한 5초 — 넘기면 강제 exit. 종료가 소켓·DB 사정에 매달리지 않게 한다.
 *
 * 하지 않는 것:
 *   - 부팅 시 **사용자** DMA 세션을 미리 열지 않는다. 사용자 세션은 **사용자의 wss 인증에서만**
 *     생긴다 (D-13). 예외는 게이트웨이당 관찰자 연결 1개뿐이다(Phase 19 D-13 — 부팅 즉시 · 사용자와 무관).
 *     아무도 안 붙으면 게이트웨이로 나가는 TCP 는 비밀이 있는 관찰자 수만큼이다(추가 env 없으면 1개).
 *   - 비밀을 로그에 싣지 않는다. 부팅 로그는 포트·호스트·버전까지다.
 *   - 조용히 죽지 않는다. `unhandledRejection`/`uncaughtException` 을 잡아 사유를 남기고
 *     exit(1) 한다 — Docker 가 재시작할 때 로그에 원인이 남아야 한다.
 */
import http from "node:http";

import { loadConfig, type JournalUpstream } from "./config.js";
import { logger } from "./logger.js";
import { createRelaySupabase } from "./store/supabase.js";
import { SymbolMap } from "./store/symbols.js";
import { GatewaySymbolMaster } from "./store/gateway-symbols.js";
import { SessionManager } from "./dma/session-manager.js";
import { SubscriptionHub } from "./hub/subscription-hub.js";
import { WsFanout } from "./ws/fanout.js";
import { createOrderApi } from "./order/order-api.js";
import { JournalWriter } from "./journal/writer.js";
import { createStrategyWriter } from "./journal/strategy-stream.js";
import { JournalAccess } from "./journal/access.js";
import { GatewayIdentities } from "./journal/identities.js";
import { JournalObserver } from "./journal/observer.js";
import { JournalStatus } from "./journal/status.js";
import { createJournalCodec } from "./journal/codec.js";

/** 종료 절차 상한(ms). 이 시간을 넘기면 정리를 포기하고 강제로 내려간다. */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * 종료 시 기록기 drain 상한(ms). 전체 상한(5초) 안에서 나머지 정리가 돌 여유를 남긴다.
 * 못 끝내도 유실은 없다 — 커서는 적용 RPC 트랜잭션 안에서만 전진한다(Phase 19 D-12).
 */
const JOURNAL_DRAIN_TIMEOUT_MS = 2_000;

/** wss 종료 코드 — RFC 6455 `1001 going away`(서버가 내려간다). */
const WS_CLOSE_GOING_AWAY = 1001;

const config = loadConfig();

// ============================================================
// 결선 — config → supabase → 관찰자 기록 → 세션 → 구독 → 팬아웃 → 내부 HTTP
// ============================================================

/** 토큰 검증(`auth.getUser`)과 `dma_credentials` 조회를 겸하는 서비스롤 클라 1개 (D-02/D-19). */
const supabase = createRelaySupabase(config.supabaseUrl, config.supabaseServiceRoleKey);

/**
 * 관찰자 기록 경로 (Phase 19) — **게이트웨이당 한 벌**(quick-260929-c8e). 게이트웨이 키는 relay 설정이 정한다
 * (주 게이트웨이 = broker, 기본 "KB" · 추가 게이트웨이 = config 의 env 표) — 커서는 로그인 **전에** 읽으므로
 * 로그인 응답의 broker 를 기다릴 수 없다(커서 테이블 PK · 적용 RPC `p_gateway` · 매핑 RPC 공통).
 *
 *   기록기(`JournalWriter`)  저널 레코드 → `dma_journal_apply` 의 유일한 경로. 적용 행은 `applied` 로 나온다.
 *   전략 기록기(Phase 25)     같은 80 프레임의 전략 이벤트 → `dma_strategy_apply`. 별도 커서 · 별도 트랜잭션.
 *   매핑(`JournalAccess`)    관찰자 로그인 스냅샷 → 메모리 라우팅 + `dma_journal_sync_access`.
 *   관찰자(`JournalObserver`) 게이트웨이 관찰자 소켓 **1개**(사용자 세션과 독립 — `SessionManager` 밖).
 *   상태(`JournalStatus`)    관찰자 상태 + 기록기 관측값 → `journal.state` 프레임 · `/healthz` 한 원천.
 *
 * 벌끼리는 아무것도 공유하지 않는다 — 커서 · epoch · 매핑 · 상태가 게이트웨이 키별로 따로다. 추가 게이트웨이의
 * 거부 · 끊김은 주 게이트웨이 관찰자 · 사용자 세션 · 503 판정에 번지지 않는다.
 *
 * 비밀은 관찰자 deps 로만 넘긴다(코덱이 로그인 페이로드에 싣는다). 로그 인자로 넘기지 않는다(T-19-03).
 */
type JournalPipeline = {
  upstream: JournalUpstream;
  writer: JournalWriter;
  strategyWriter: ReturnType<typeof createStrategyWriter>;
  access: JournalAccess;
  observer: JournalObserver;
  status: JournalStatus;
};

function createJournalPipeline(upstream: JournalUpstream): JournalPipeline {
  const writer = new JournalWriter({ supabase, gateway: upstream.gateway });
  const strategyWriter = createStrategyWriter({ supabase, gateway: upstream.gateway });
  const access = new JournalAccess({ supabase, gateway: upstream.gateway });
  const observer = new JournalObserver({
    secret: upstream.secret,
    gateway: upstream.gateway,
    host: upstream.host,
    port: upstream.port,
    codec: createJournalCodec(),
    writer,
    strategyWriter,
    access,
  });
  const status = new JournalStatus({ observer, writer, strategyWriter });
  return { upstream, writer, strategyWriter, access, observer, status };
}

// 0번 = 주 게이트웨이(사용자 세션과 같은 게이트웨이). 나머지 = 추가 게이트웨이(관찰자 전용).
const [primaryUpstream, ...extraUpstreams] = config.journalUpstreams;
const primaryJournal = createJournalPipeline(primaryUpstream);
const extraJournals: readonly JournalPipeline[] = extraUpstreams.map(createJournalPipeline);
const journalPipelines: readonly JournalPipeline[] = [primaryJournal, ...extraJournals];
// 주 게이트웨이는 종전 이름 그대로 — 아래 fanout · orderApi · 결선 줄이 바뀌지 않는다.
const { writer: journalWriter, access: journalAccess, status: journalStatus } = primaryJournal;

/**
 * 추가 게이트웨이 신원 연결 (quick-260929-sas) — 추가 게이트웨이가 있을 때만 만든다. 없으면 null 이고 신원 조회는
 * 0건이다(오늘과 같다). 주 게이트웨이는 이 적재기를 쓰지 않는다 — 자격증명 신원 그대로다.
 */
const gatewayIdentities: GatewayIdentities | null =
  extraJournals.length > 0
    ? new GatewayIdentities({ supabase, gateways: extraJournals.map((p) => p.upstream.gateway) })
    : null;

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
 *
 * 보조 원천: `stocks` 미스(당일 신규상장)는 게이트웨이 종목마스터(27/57)가 채운다
 * (quick-260923-cqj). hub·fanout 이 같은 `symbols.lookup` 을 쓰고, 27 요청은 hub Ready 가 건다.
 * 07:30 KST 경계·실패 재시도 타이머는 SessionManager 가 고른 Ready 세션 하나로 보낸다(relay 전체 1건).
 */
const gatewaySymbols = new GatewaySymbolMaster({
  pickSession: (avoid) => sessionManager.firstReady(avoid),
});
gatewaySymbols.start();
const symbols = new SymbolMap(supabase, { fallback: gatewaySymbols });
void symbols.start();

const hub = new SubscriptionHub({ symbols, symbolMaster: gatewaySymbols });
// 첫 Ready 에서 66/64/72 가 57 조립보다 먼저 와 이름 없이 캐시·팬아웃되므로, 교체 뒤 풀린 행만 재방송한다 (D-08).
gatewaySymbols.on("updated", () => hub.refreshNames());

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
  // 주문 3종(`order.new`/`order.modify`/`order.cancel`)을 wss 로 받기 위한 결선이다 (D-02).
  // 종목맵 하나로 주문 분기가 열린다 — 기록 창구는 없다 (Phase 19 D-01).
  symbols,
  // NXT 거래가능 집합 → `nxt.snap`(quick-260923-pq2). 빠지면 프레임이 안 나가고 웹앱은 둘 다 그린다(조용한 퇴행) — 결선 grep 게이트가 잡는다.
  nxtTradable: gatewaySymbols,
  // 저널 계좌 매핑 — `journal.rows` 를 계좌 권한 사용자에게만 보내는 라우팅 원천(Phase 19 D-03 · T-19-02).
  journalAccess,
  // 기록 연결 상태 — 인증 직후 `journal.state` 스냅샷 1프레임의 출처(Phase 19 D-04 (a)).
  journalState: journalStatus,
});

// 기록기가 적용한 행 → 계좌 권한 사용자별 부분집합 푸시(D-03). 상태 전이 프레임 → 인증된 전 연결(D-04 (a)).
journalWriter.on("applied", (rows) => fanout.deliverJournalRows(rows));
// 전략 기록기가 적용한 이벤트 → 주문 이벤트는 계좌 권한 사용자 · 시세 이벤트는 매핑 보유자 전원(Phase 25 · T-25-01).
primaryJournal.strategyWriter.on("applied", (rows) => fanout.deliverStrategyEvents(rows));
journalStatus.on("frame", (frame) => fanout.deliverJournalState(frame));
// 추가 게이트웨이 — 적용 행은 **그 게이트웨이의 매핑 + 명시 신원 연결로만** 거른다(주 게이트웨이 매핑 · 자격증명
// 문자열을 보지 않는다 — quick-260929-sas).
// 상태 frame 은 어디에도 결선하지 않는다 — 브라우저 `journal.state` 는 주 게이트웨이 한 원천이다
// (추가 게이트웨이 끊김을 webapp 이 주 게이트웨이 「기록 지연」으로 오인하지 않게).
// 추가 게이트웨이가 있으면 신원 적재기도 있다(위 생성 조건이 같다) — 타입 좁힘만 겸한다.
if (gatewayIdentities !== null) {
  for (const extra of extraJournals) {
    const route = { access: extra.access, identities: gatewayIdentities.viewOf(extra.upstream.gateway) };
    extra.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, route));
    extra.strategyWriter.on("applied", (rows) => fanout.deliverStrategyEvents(rows, route));
  }
}

wsServer.on("upgrade", (req, socket, head) => fanout.handleUpgrade(req, socket, head));

/**
 * 내부 HTTP 표면 — **`/healthz` + 공유 비밀 관문뿐**이다 (D-02).
 *
 * REST 주문 라우트는 16-16 에서 제거했다. 주문 접수는 위 `WsFanout` 의 wss 분기 하나로
 * 나간다 — 여기에 주문 의존성을 다시 넘기면 지운 경로가 되살아난다.
 * `relayOrderSecret` 은 관문이 계속 쓰므로 required 그대로다 (CONTEXT deferred).
 */
const orderApi = createOrderApi({
  relayOrderSecret: config.relayOrderSecret,
  // `/healthz` 의 회선 판정 기준 — 이 주소와 같은 사내망 대역의 인터페이스가 있는지만 본다.
  dmaHost: config.dmaHost,
  appVersion: config.appVersion,
  nodeEnv: config.nodeEnv,
  sessions: sessionManager,
  // `/healthz` 의 `journal` 필드 + 장중 알림 판정(Phase 19 D-04 (b)) — 브라우저 표식과 같은 원천.
  journal: journalStatus,
  // 추가 게이트웨이 관찰자 — 본문 `journalGateways` 에만 싣는다(503 판정 밖 · quick-260929-c8e). 없으면 키도 없다.
  journalGateways: extraJournals.map((p) => ({
    gateway: p.upstream.gateway,
    health: (nowMs: number) => p.status.health(nowMs),
  })),
});
const orderApiServer = http.createServer(orderApi);

// 추가 게이트웨이 신원 연결을 관찰자보다 먼저 읽기 시작한다(quick-260929-sas). 첫 적재 전 도착한 추가 게이트웨이
// 행은 아무에게도 푸시되지 않는다(fail closed) — 브라우저 REST 새로고침이 복원한다.
gatewayIdentities?.start();
// 관찰자 연결을 게이트웨이마다 부팅 즉시 연다(Phase 19 D-13 — 장 시간과 무관 · 사용자 접속과 무관).
// 결선(applied → fanout · frame → fanout)이 전부 붙은 **뒤에** 시작해야 첫 배치가 버려지지 않는다.
for (const p of journalPipelines) p.observer.start();

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
        // 관찰자 기록 연결 여부만 싣는다 — 비밀·계좌는 없다(T-19-03).
        journalObserver: config.dmaObserverSecret !== undefined ? "enabled" : "disabled",
        // 추가 게이트웨이가 있을 때만 — 키 · 주소 · 활성 여부뿐이다(비밀 없음).
        ...(extraJournals.length > 0
          ? {
              journalGateways: extraJournals.map((p) => ({
                gateway: p.upstream.gateway,
                host: p.upstream.host,
                port: p.upstream.port,
                observer: p.upstream.secret !== undefined ? "enabled" : "disabled",
              })),
            }
          : {}),
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
    // 4) 전 게이트웨이 관찰자 연결 종료 — 이후 새 배치가 들어오지 않는다
    for (const p of journalPipelines) p.observer.stop();
    // 5) 전 기록기 drain(각 상한 2초 · 병렬 — 5초 데드맨 안) → 정리. 못 끝내도 커서가 RPC 안에서만
    //    전진하므로 다음 부팅이 재생한다.
    // 파이프라인마다 두 기록기(주문 · 전략)를 함께 drain 한다 — 둘 다 끝나야 그 게이트웨이가 drain 된 것이다.
    const drained = await Promise.all(
      journalPipelines.map(async (p) => {
        const [journal, strategy] = await Promise.all([
          p.writer.drain(JOURNAL_DRAIN_TIMEOUT_MS),
          p.strategyWriter.drain(JOURNAL_DRAIN_TIMEOUT_MS),
        ]);
        return journal && strategy;
      }),
    );
    for (const p of journalPipelines) {
      p.writer.close();
      p.strategyWriter.close();
      p.access.close();
      p.status.close();
    }
    gatewayIdentities?.close();
    const undrained = journalPipelines.filter((_, i) => !drained[i]).map((p) => p.upstream.gateway);
    if (undrained.length > 0) {
      logger.warn(
        { timeoutMs: JOURNAL_DRAIN_TIMEOUT_MS, gateways: undrained },
        "[relay] 기록기 drain 미완 — 다음 부팅이 커서부터 재생",
      );
    }
    // 6) 배치 타이머 정리
    hub.closeAll();
    symbols.close();
    gatewaySymbols.close();
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
