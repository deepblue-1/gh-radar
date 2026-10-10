/**
 * Phase 15 Plan 05 — RELAY-01. relay 프로세스 엔트리포인트 (부팅 결선 + graceful shutdown).
 *
 * `server/src/server.ts` 의 "config → 의존성 → listen → SIGTERM" 골격을 이식하되,
 * relay 는 **장기 연결을 소유하는 프로세스**라 종료 절차가 본질적으로 다르다.
 *
 * 포트 2개 (D-05):
 *   :8090 `WS_PORT`        평문 ws. TLS 는 **Caddy 가 종단**하고 여기로 평문을 넘긴다 —
 *                          이 프로세스는 인증서를 다루지 않는다. 경로는 `/ws`(15-04 계약).
 *   :8091 `ORDER_API_PORT` 내부 HTTP. **`/healthz` + Admin 내부 경로(`/internal/admin/*` · Phase 29-11)** 다 (16-16 · D-07). 방화벽
 *                          source-range + `X-Relay-Secret` 이중 방어를 유지한다 (D-19/D-22).
 *
 * 결정 근거:
 *   D-07  relay 는 Docker 컨테이너(`--restart=always`)로 돌고 openconnect 는 host systemd
 *         소관이다. 그래서 **컨테이너 재시작이 VPN 터널을 흔들지 않는다** — 반대로
 *         재시작마다 KB 게이트웨이에 고아 세션이 쌓이지 않도록 종료 절차가 필요하다.
 *   D-13  DMA 세션 정본은 `SessionManager` 다. 여기서는 만들어서 넘겨주기만 한다.
 *   D-02  주문 접수는 **wss 하나**다. 내부 HTTP 의 주문 라우트는 16-16 에서 제거했고
 *         남은 것은 `/healthz` 뿐이다. 주문 결선은 `WsFanout` 에 넘기는 종목맵 하나다.
 *   Phase 26 D-12  시세 업스트림 = **quote 연결 하나**(`QuoteFeed` · 관찰자 로그인 role 1 · `hub.attachFeed`).
 *         사용자 세션은 종목을 구독하지 않는다 — 계좌 · 주문 · 전략만 싣는다. 비밀 원천은 D-17(`config.dmaQuoteObserverSecret`
 *         — quote 키 우선 · 저널 비밀 폴백). 둘 다 없으면 quote 연결은 disabled 이고 게이트웨이 소켓을 열지 않는다.
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
 *   quick-260929-sas → Phase 29 (29-06)  서버 푸시는 **신원 원천 하나**(`AppAccess` — RPC `dma_app_access_map` 사본, 부팅 즉시 +
 *         60초 재적재 · fail closed)로만 사용자에게 잇는다. 옛 서버별 신원 적재기(`dma_visibility_identities` 사본)는 제거됐다 —
 *         「DMA id 는 모든 서버에 같은 문자열」 이라 KB 주문 서버를 포함한 모든 서버가 같은 경로다.
 *   D-22  `RELAY_ORDER_SECRET` 은 그대로 required 다. `/healthz` 외의 모든 경로가
 *         비밀 없이는 404 조차 받지 못해야 한다 — 경로 존재 여부도 정보다.
 *   Phase 29 D-09 (29-03)  **결선 = 서버 레지스트리 순회.** 게이트웨이 서버 목록은 `ServerRegistry` 한 원천이다(env 모드 =
 *         config 합성 1~2행 · db 모드 = `dma_servers` — production 전용, config 게이트). 부팅은 **top-level
 *         await 로 `registry.ready()`**(첫 적재)를 기다린다 — db 첫 적재가 성공하기 전에는 리스너 · 관찰자 · quote · 사용자
 *         세션을 하나도 열지 않는다(fail closed — 어느 서버에 붙을지 모르는 채로 붙지 않는다. `/healthz` 가 없으니 uptime 이
 *         울린다). 적재 뒤 `ServerPipelines.sync(registry.enabled())` 가 enabled 서버마다 관찰자 한 벌을 세우고, 레지스트리
 *         `changed`(60초 재적재 · `reload()`)마다 다시 sync 한다 — 서버 추가 · 삭제 · 끄기 · 주소 변경이 재배포 없이 반영된다.
 *           - 사용자 세션 = **그 증권사 주문 서버**(`SessionManager.resolveTarget(broker)` — 세션을 만들 때마다 고른다 · 29-16).
 *           - quote 연결 = **시세 주 서버**(부팅 때 레지스트리 값 · 비밀은 그 증권사 `quoteSecretOf`). Admin 전환 · 레지스트리 보정은
 *             `QuoteSwitch` 가 break-then-make 로 옮긴다(29-23 · D-11).
 *           - 브라우저 `journal.state` · `/healthz` `journal`(503 축) = **지금의 KB 주문 서버** 파이프라인 — `OrderServerJournal`
 *             한 원천(29-22 · Discretion 권고). Admin 이 KB 주문 서버를 바꾸면 다음 상태 프레임 · 다음 healthz 부터 새 서버 저널이다.
 *             주 매핑 라우팅(경로 없는 `journal.rows`)도 같은 현재 파이프라인을 본다.
 *           - `journalGateways.<서버 키>` = 그 밖 enabled 서버(본문 전용) · `brokers.{KB,KYOBO}` = 증권사별 주문 서버 저널
 *             `{ server, alerting }`(uptime 고정 JSONPath — Pitfall 3).
 *           - 주문 서버 변경(계좌 지정 · 증권사 기본)은 29-36 의 즉시 재수립이 맡는다(G-1 · 사용자 확정 2026-10-10 「즉시 재접속」).
 *             D-10 의 「주문 서버 바뀜」 `order.server` 표식(29-22)은 29-42 가 없앴다.
 *         이 플랜이 **남긴 것**(뒤 플랜 몫): 서버 푸시 신원은 29-06 에서 `AppAccess` 하나로 바뀌었다(런타임 추가 서버도 즉시 같은
 *         신원) · 사용자 세션은 (유저, 서버) 단위(29-16 · 29-20) · quote 전환은 29-23 `QuoteSwitch`.
 *
 * 종료 절차 (SC-8) — `process.exit(0)` 전에 반드시 이 순서다:
 *   1. HTTP 서버 2개 `close()`  — 새 연결을 받지 않는다
 *   2. `fanout.closeAll(1001)`  — 살아 있는 wss 에 정상 close 프레임(going away)
 *   3. `sessionManager.closeAll()` — 구독 해제 + DMA TCP 종료
 *   4. 레지스트리 `close()`(재적재 중지) · quote 연결 `stop` · `pipelines.stopAll()` — 전 서버 관찰자 연결 종료(새 시세 프레임 ·
 *      새 배치를 받지 않는다 — Phase 19 D-13 · Phase 26). quote 연결의 로그인 타이머 · 재접속 백오프도 여기서 멈춘다.
 *      서버별 admin 연결(29-08 · role 2)도 `pipelines.stopAll()` 안에서 함께 stop 된다(별도 줄 없음).
 *   5. `pipelines.drainAll(2초)` — 전 서버 `writer` · `strategyWriter` drain **병렬** → `pipelines.closeAll()`(기록기 · `access` ·
 *      `status`) · 87 적재(`adminSnapshotSink` — 재시도 타이머) · quote 상태 · 접근 맵 `close()`
 *      — 큐에 남은 레코드를 적용 RPC 로 보낸다. 2초 안에 못 끝내도 **유실은 없다** — 커서는 적용 RPC
 *      트랜잭션 안에서만 전진하므로 다음 부팅이 남은 구간을 재생한다(D-12).
 *   6. `hub.closeAll()` · `symbols` · 종목마스터 — 배치·재적재 타이머 정리(남기면 프로세스가 안 내려간다)
 *   전체 상한 5초 — 넘기면 강제 exit. 종료가 소켓·DB 사정에 매달리지 않게 한다.
 *
 * 하지 않는 것:
 *   - 부팅 시 **사용자** DMA 세션을 미리 열지 않는다. 사용자 세션은 **사용자의 wss 인증에서만**
 *     생긴다 (D-13). 예외는 게이트웨이당 관찰자 연결 1개와 주 게이트웨이 quote 연결 1개뿐이다(Phase 19 D-13 ·
 *     Phase 26 D-12 — 부팅 즉시 · 사용자와 무관). 아무도 안 붙으면 게이트웨이로 나가는 TCP 는 비밀이 있는 관찰자 수 +
 *     quote 연결 1개다(추가 env 없으면 2개 · 비밀이 둘 다 없으면 0개).
 *   - 비밀을 로그에 싣지 않는다. 부팅 로그는 포트·호스트·버전까지다.
 *   - 조용히 죽지 않는다. `unhandledRejection`/`uncaughtException` 을 잡아 사유를 남기고
 *     exit(1) 한다 — Docker 가 재시작할 때 로그에 원인이 남아야 한다.
 */
import http from "node:http";

import { loadConfig } from "./config.js";
import { DMA_BROKERS, ServerRegistry, isDmaBroker, type DmaBroker } from "./registry/registry.js";
import { ServerPipelines, type ServerPipeline } from "./registry/pipelines.js";
import { OrderServerJournal } from "./registry/order-journal.js";
import { logger } from "./logger.js";
import { createRelaySupabase } from "./store/supabase.js";
import { SymbolMap } from "./store/symbols.js";
import { GatewaySymbolMaster } from "./store/gateway-symbols.js";
import { SessionManager } from "./dma/session-manager.js";
import { SubscriptionHub } from "./hub/subscription-hub.js";
import { WsFanout } from "./ws/fanout.js";
import { AppAccess } from "./access/app-access.js";
import { AccountOrderServers, createOrderServerRouting } from "./access/account-order-servers.js";
import { createAccessCredentials } from "./store/credentials.js";
import { createOrderApi } from "./order/order-api.js";
import { AdminIntentStore } from "./admin/intent-store.js";
import { AdminDispatcher } from "./admin/dispatcher.js";
import { AdminSessionSync } from "./admin/session-sync.js";
import { createAdminRouter } from "./admin/admin-api.js";
import { AdminSnapshotSink } from "./admin/snapshot-sink.js";
import type { JournalAccessView } from "./journal/types.js";
import { QuoteFeed } from "./quote/feed.js";
import { QuoteSwitch } from "./quote/quote-switch.js";
import { QuoteStatus } from "./quote/status.js";

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

/** 토큰 검증(`auth.getUser`) · 접근 맵 RPC · `dma_users` 조회를 겸하는 서비스롤 클라 1개 (D-02/D-19 · Phase 29). */
const supabase = createRelaySupabase(config.supabaseUrl, config.supabaseServiceRoleKey);

/**
 * 서버 레지스트리 (Phase 29 D-09) — 게이트웨이 서버 목록의 한 원천. env 모드는 config 합성 행(로컬 · 테스트 · e2e),
 * db 모드는 `dma_servers`(production 전용 — config 가 그 밖 조합을 기동 거부한다).
 */
const registry = new ServerRegistry(
  config.dmaRegistrySource === "db" ? { source: "db", supabase } : { source: "env", rows: config.envServers },
);
registry.start();
if (!registry.loaded) {
  logger.info({ registry: registry.source }, "[registry] 서버 레지스트리 첫 적재 대기 — 그 전에는 아무 연결도 열지 않는다");
}
// fail closed — 첫 적재가 성공하기 전에는 리스너 · 관찰자 · quote · 사용자 세션을 열지 않는다(머리 주석 Phase 29 D-09).
await registry.ready();

/**
 * 부팅 때의 KB 주문 서버 키 — **KB 주문 서버가 없을 때의 폴백**(env 모드 `DMA_BROKER=KYOBO` 등 — 첫 enabled 서버가 종전
 * 「주 게이트웨이」 자리를 잇는다)과 부팅 로그의 주 서버 표시에만 쓴다. 저널 상태 · 주 매핑 라우팅은 아래 `kbOrderPipeline()`
 * (지금의 KB 주문 서버)을 본다(29-22).
 */
const primaryKey: string | null = (registry.orderServerOf("KB") ?? registry.enabled()[0])?.key ?? null;

/**
 * 관찰자 기록 경로 (Phase 19 → Phase 29) — **서버당 한 벌**(`ServerPipelines` · 생성은 `registry/pipelines.ts`). 게이트웨이
 * 키 = 레지스트리 키(커서 PK · 적용 RPC `p_gateway` · 매핑 RPC 공통). 벌끼리는 아무것도 공유하지 않는다 — 한 서버의 거부 ·
 * 끊김 · 제거는 다른 서버 관찰자 · 사용자 세션 · 503 판정에 번지지 않는다. 비밀은 증권사별(`observerSecretOf`)이고 관찰자
 * deps 로만 넘긴다(T-19-03). 결선(`onCreated` → `wirePipeline`)은 아래 fanout 생성 뒤 첫 `sync` 에서 붙는다.
 */
const pipelines = new ServerPipelines({
  supabase,
  secretOf: config.observerSecretOf,
  onCreated: (p) => wirePipeline(p),
  // 레지스트리에서 빠진 서버(같은 키로 재생성된 게 아니면)의 87 적재 대기 · 재시도를 버린다(29-14).
  onRemoved: (p) => {
    if (pipelines.get(p.server.key) === undefined) adminSnapshotSink.forget(p.server.key);
  },
});

/**
 * 87 적재 (Phase 29-14 · D-05 · RESEARCH Pattern 4) — 서버별 admin 연결의 87 하나를 그 서버 매핑(`JournalAccess.replace` —
 * 푸시 라우팅 · REST 가시성)과 반영 상태 표(`dma_admin_apply_snapshot` — Admin 반영 칩 원천)에 함께 넣는다. 결선은 `wirePipeline`.
 * `pipelines.sync` 보다 먼저 만든다(첫 sync 의 onCreated 가 이 값을 쓴다).
 */
const adminSnapshotSink = new AdminSnapshotSink({ supabase, accessOf: (key) => pipelines.get(key)?.access });

/** 부팅 때 KB 주문 서버 키의 현재 파이프라인(재생성되면 새 벌). */
const primaryPipeline = (): ServerPipeline | undefined => (primaryKey === null ? undefined : pipelines.get(primaryKey));

/**
 * 지금의 KB 주문 서버 파이프라인(없으면 부팅 때의 주 파이프라인) — 브라우저 `journal.state` · `/healthz` `journal`(503 축) · 주 매핑
 * 라우팅의 원천(29-22 · Discretion 권고 — 503 축 = KB 주문 서버 저널). 호출마다 레지스트리 현재 값을 본다.
 */
function kbOrderPipeline(): ServerPipeline | undefined {
  const kb = registry.orderServerOf("KB");
  return (kb !== undefined ? pipelines.get(kb.key) : undefined) ?? primaryPipeline();
}

/**
 * 「지금 KB 주문 서버」 저널 상태 한 원천 (29-22) — fanout `journalState`(인증 스냅샷) · order-api `journal`(healthz) · 상태 frame
 * 푸시가 같은 객체를 본다. 파이프라인마다 `watch`(아래 `wirePipeline`)하고 레지스트리 변경마다 `refresh`(전환 직후 새 서버 프레임 1건).
 * `onFrame` 의 `fanout` 은 아래에서 만든다 — frame 은 첫 `pipelines.sync`(fanout 생성 뒤) 이후에만 온다.
 */
const orderJournal = new OrderServerJournal({
  current: () => kbOrderPipeline()?.status,
  onFrame: (frame) => fanout.deliverJournalState(frame),
});

/**
 * 웹 사용자 접근 맵 (Phase 29 · D-02 · D-04 · D-19) — RPC `dma_app_access_map` 60초 사본. 세 가지의 한 원천이다:
 *   - wss 인증의 「누가 DMA 를 쓸 수 있나」(역할 admin/trader + DMA 연결) · 자격증명 조회 키(`dma_users` · AAD = dma_user_id).
 *     첫 적재 전 인증은 「조회 실패」(failed + 1011)로 끝난다 — 「권한 없음」 으로 위장하지 않는다.
 *   - **모든 서버 파이프라인의 푸시 신원**(`GatewayIdentityView` — 「DMA id 는 모든 서버에 같은 문자열」, 서버별 신원 표 없음).
 *     첫 적재 전에는 아무에게도 푸시하지 않는다(fail closed).
 *   - 즉시 반영(D-04) — 재적재(60초 · `reload()`)가 강등 · 허용 해제 · DMA 연결 변경을 찾으면 `revoked` → `fanout.revokeUser`.
 * 시작은 아래 관찰자 start 앞(fail closed 순서).
 */
const appAccess = new AppAccess({ supabase, refreshMs: config.appAccessRefreshMs });

/**
 * 계좌별 주문 서버 지정 (Phase 29-33 · G-1 — D-10 「증권사당 주문 서버 1대」 대체) — RPC `dma_account_order_servers` 60초 사본 ·
 * 즉시 재적재는 꼬리(`reload()`). 유효 주문 서버 = 지정(레지스트리 enabled · 같은 증권사) ?? 증권사 기본 주문 서버
 * (`effectiveOrderServer`). 세션 소유(`ownerOf`) · wss 인증이 열 (유저, 서버) 대상(`serversFor`)의 원천이다. 첫 적재 전
 * `serversFor` 는 null — wss 인증은 「조회 실패」(failed + 1011)로 끝난다(fail closed). 시작은 접근 맵 옆(관찰자보다 먼저).
 */
const accountOrderServers = new AccountOrderServers({ supabase, refreshMs: config.appAccessRefreshMs });
const orderServerRouting = createOrderServerRouting({
  loaded: () => accountOrderServers.loaded,
  chosenOf: (dmaUserId, broker, accountNo) => accountOrderServers.chosenOf(dmaUserId, broker, accountNo),
  registry,
  // 그 서버 매핑(79/87) = 그 서버 users.toml 에 등록된 계좌. 호출마다 지금 파이프라인을 본다(재생성 추종).
  accountsOf: (serverKey, dmaUserId) => pipelines.get(serverKey)?.access.accountsOf(dmaUserId),
});
/** 계좌의 유효 주문 서버 키(G-1) — 세션 소유 판정 원천. DMA id · 계좌번호를 로그에 싣지 않는다. */
const effectiveOrderServer = orderServerRouting.effectiveOrderServer;
/** wss 인증 · 세션 추가가 열 (유저, 서버) 대상(G-1) — KB 먼저 · 증권사 안 기본 서버 먼저 · 지정 첫 적재 전 null. */
const serversFor = orderServerRouting.serversFor;

/**
 * 사용자 세션 — (유저, 서버) 단위(Phase 29-16). 세션을 만들 때마다 **그 증권사의 주문 서버**로 연다(D-10 — 사용자 ×
 * 증권사 세션이 살아 있으면 주문 서버가 바뀌어도 그 세션 재사용 · 새 서버는 다음 세션부터). 그 증권사 주문 서버가
 * 없으면 세션을 열지 않는다(`acquireFor` → null). 생성자 host/port/broker 는 `resolveTarget` 을 주는 이 결선에서는 쓰지 않는다.
 * wss 인증이 어느 증권사 세션을 여는지는 아래 `brokersFor` 가 정한다(29-20 · D-18).
 */
const sessionManager = new SessionManager({
  host: config.dmaHost,
  port: config.dmaPort,
  broker: config.dmaBroker,
  graceMs: config.sessionGraceMs,
  // 29-33 (G-1) — 운영 경로(`acquireOn`) 세션은 유효 주문 서버가 자기 서버인 계좌만 소유한다(주문 · 83 · 계좌 프레임 거름 원천).
  ownerOf: (dmaUserId, broker, accountNo) =>
    isDmaBroker(broker) ? effectiveOrderServer(dmaUserId, broker, accountNo) : undefined,
  resolveTarget: (broker) => {
    const s = isDmaBroker(broker) ? registry.orderServerOf(broker) : undefined;
    return s && { serverKey: s.key, host: s.host, port: s.port, broker: s.broker };
  },
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

// D-10 linger — 기본 15초 · e2e 는 QUOTE_LINGER_MS=0 (테스트 간 전역 시세 캐시 격리).
const hub = new SubscriptionHub({ symbols, symbolMaster: gatewaySymbols, lingerMs: config.quoteLingerMs });

/**
 * 시세 업스트림 = quote 연결 하나 (Phase 26 D-12 · Phase 29 — 레지스트리의 **시세 주 서버** · 29-23 `QuoteSwitch` 가 전환).
 * 시세 주 서버가 없으면 비밀 없이 만들어 disabled 로 남는다(소켓 0). 관찰자 로그인 role 1 로 붙는다 — 사용자 세션과
 * 저널 관찰자와는 별개의 TCP 다. hub 의 28/29/32 는 전부 이 연결로 나가고, 이 연결의 ready 가 전역 합집합 재구독의
 * 유일한 트리거다. 비밀은 D-17 원천(quote 키 우선 · 저널 비밀 폴백)이고 deps 로만 넘긴다(로그 인자 금지 · T-26-05).
 * 시작은 아래 관찰자 start 줄 옆 — 결선이 다 붙은 뒤다. `keyCount` 는 수신 워치독(26-REVIEW WR-01)의 「구독 키 있음」
 * 조건이다 — 구독이 없으면 무수신이 정상이라 재접속하지 않는다.
 */
const quoteServer = registry.quotePrimary();
/** quote 비밀(시세 주 서버 증권사 · 26 D-17 폴백 포함). 로그에는 유무만. */
const quoteSecret = quoteServer !== undefined ? config.quoteSecretOf(quoteServer.broker) : undefined;
/**
 * Phase 29-23 (D-11) — quote 연결은 안정 래퍼 `QuoteSwitch` 뒤에 있다. hub · QuoteStatus 는 이 래퍼에 한 번 결선되고, 시세 주
 * 서버 전환(Admin · 레지스트리 보정)은 안쪽 `QuoteFeed` 만 break-then-make 로 바꾼다 — 재결선 없음 · 연결은 언제나 1개.
 */
const quoteSwitch = new QuoteSwitch({
  initial: quoteServer,
  secretOf: (broker) => config.quoteSecretOf(broker),
  createFeed: (server, secret) =>
    new QuoteFeed({
      secret,
      host: server?.host ?? "127.0.0.1",
      port: server?.port ?? config.dmaPort,
      keyCount: () => hub.stats().subscriptionCount,
    }),
});
hub.attachFeed(quoteSwitch);
/**
 * quote 연결 상태 요약 (Phase 26 D-02 · D-16) — 브라우저 `quote.state` 프레임과 `/healthz` `quote` 필드의 **한 원천**이다
 * (`JournalStatus` 동형). 둘이 같은 객체를 읽으므로 배지와 운영 알림이 어긋나지 않는다. fanout 생성 전에 둔다.
 */
const quoteStatus = new QuoteStatus({ feed: quoteSwitch, hubStats: () => hub.stats() });
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

/**
 * wss 인증이 세션을 열 증권사 (Phase 29-20 · D-18 — 교보 웹 주문 열기).
 *   - **KB 는 늘 연다** — 종전 동작 그대로다. KB 주문 서버 매핑에 그 DMA id 가 없으면 게이트웨이 로그인 거부가 사유를
 *     말한다(브라우저 「세션 거부」 배지). 매핑 적재 여부에 기대지 않는다 — KB 관찰자가 늦어도 KB 화면은 선다.
 *   - **교보는 교보 주문 서버 저널 매핑(79/87)에 그 DMA id 계좌가 있을 때만** 연다(RESEARCH Pattern 5) — 서버에 없는 유저로
 *     로그인해 거부 루프를 만들지 않는다. 매핑이 아직 없으면(관찰자 적재 전) 열지 않는다(보수 — 다음 인증부터 열린다).
 * 호출마다 레지스트리 · 파이프라인 현재 값을 본다(주문 서버 전환 · 파이프라인 재생성 추종). DMA id 를 로그에 싣지 않는다.
 */
function brokersFor(dmaUserId: string): DmaBroker[] {
  const out: DmaBroker[] = ["KB"];
  const kyobo = registry.orderServerOf("KYOBO");
  if (kyobo !== undefined && (pipelines.get(kyobo.key)?.access.accountsOf(dmaUserId)?.size ?? 0) > 0) out.push("KYOBO");
  return out;
}

/** 주 서버 매핑 읽기 — 호출마다 지금의 KB 주문 서버 파이프라인을 본다(없으면 매핑 없음 = 푸시 없음 · 29-22). */
const primaryAccessView: JournalAccessView = {
  accountsOf: (dmaUserId) => kbOrderPipeline()?.access.accountsOf(dmaUserId),
};

const fanout = new WsFanout({
  // `server` 를 넘기지 않는다 — 이 포트의 라우팅(업그레이드 vs 평문)은 부팅 결선이 쥔다.
  supabase,
  sessions: sessionManager,
  hub,
  credKey: config.dmaCredKey,
  // Phase 29 D-19 — 자격증명 원천 = 접근 맵(역할 · DMA 연결) + `dma_users`(AAD = dma_user_id). 옛 `dma_credentials` 를 읽지 않는다.
  credentials: createAccessCredentials({ access: appAccess, supabase, credKey: config.dmaCredKey }),
  // Phase 29-20 (D-18) — 증권사별 세션(KB 늘 · 교보는 교보 매핑에 있을 때만). hub 가 세션 소유 키로 병합한다.
  // 29-33 (G-1) — 운영 경로는 아래 `serversFor` 다(주입되면 brokersFor 대신 쓴다). brokersFor 는 29-42 가 함께 걷어낸다.
  brokersFor,
  // Phase 29-33 (G-1) — 계좌별 주문 서버: (유저, 서버) 대상마다 acquireOn(증권사 색인 미사용 — 기본 서버가 바뀌면 새 인증은 새 서버).
  serversFor,
  // 주문 3종(`order.new`/`order.modify`/`order.cancel`)을 wss 로 받기 위한 결선이다 (D-02).
  // 종목맵 하나로 주문 분기가 열린다 — 기록 창구는 없다 (Phase 19 D-01).
  symbols,
  // NXT 거래가능 집합 → `nxt.snap`(quick-260923-pq2). 빠지면 프레임이 안 나가고 웹앱은 둘 다 그린다(조용한 퇴행) — 결선 grep 게이트가 잡는다.
  nxtTradable: gatewaySymbols,
  // 저널 계좌 매핑 — `journal.rows` 를 계좌 권한 사용자에게만 보내는 라우팅 원천(Phase 19 D-03 · T-19-02).
  // Phase 29 — 주 서버 파이프라인이 재생성돼도 이어지도록 호출마다 현재 벌을 본다.
  journalAccess: primaryAccessView,
  // 기록 연결 상태 — 인증 직후 `journal.state` 스냅샷 1프레임의 출처(Phase 19 D-04 (a)). 지금의 KB 주문 서버 저널(29-22).
  journalState: orderJournal,
  // 시세 전용 공유 연결 상태 — 인증 직후 `quote.state` 스냅샷 1프레임의 출처(Phase 26 D-01).
  quoteState: quoteStatus,
});

/**
 * 87 → 열린 세션 반영 (Phase 29-21 · ADMIN-06) — sink 가 그 서버 매핑에 87 을 넣은 직후(`applied`) 그 서버에 로그인한 사용자
 * 세션이 새 계좌를 재로그인 없이 자가 선언하고(RESEARCH Pitfall 10) 빠진 계좌는 세션 원본에서 즉시 뺀다(fail closed · 29-42). 그
 * 87 이 연결 중 사용자 계좌의 유효 주문 서버(G-1)이고 그 계좌를 처음 실었으면 `fanout.refreshUserSessions` 가 빠진 서버 세션을
 * 연다(위 `serversFor` 가 갓 교체된 매핑을 본다 · 전략 끄기 없음). 브라우저 계좌 목록은 세션 `accounts` 이벤트 → fanout 병합
 * 상태 프레임으로 간다.
 */
const adminSessionSync = new AdminSessionSync({ sessions: sessionManager, fanout });
adminSnapshotSink.on("applied", (e) => adminSessionSync.onApplied(e));

// 시세 연결 상태 전이(3초 디바운스) → 인증된 전 연결(Phase 26 D-01). `/healthz` 와 같은 원천이다.
quoteStatus.on("frame", (frame) => fanout.deliverQuoteState(frame));

// D-04 즉시 반영 — 접근 맵 재적재(60초 · reload)가 찾은 권한 회수 사용자의 wss 를 끊는다(세션은 종전 유예로 끝난다 ·
// 서버 쪽 전략 · 미체결 무접촉). 재접속하면 인증이 unauthorized 를 준다.
appAccess.on("revoked", (ids) => ids.forEach((u) => fanout.revokeUser(u, "access-revoked")));

/**
 * 서버 파이프라인 결선 (`ServerPipelines.onCreated` — 생성 직후 · 관찰자 start 전). 재생성마다 새 벌에 다시 붙는다.
 *
 * **모든 서버(KB 주문 서버 포함) 같은 모양이다**(Phase 29): 적용 행 · 전략 이벤트는 `{ access: 그 서버 매핑, identities:
 * AppAccess }` 하나로 거른다 — 사용자 → 접근 맵의 DMA id(admin/trader + 연결) → 그 서버 매핑의 계좌. 주문 이벤트는 계좌
 * 권한 사용자 · 시세 이벤트는 그 서버 매핑 보유자 전원(Phase 25 · T-25-01). 서버별 신원 표는 없다(「DMA id 는 모든 서버에
 * 같은 문자열」). 런타임에 추가된 서버도 생성 즉시 같은 신원을 쓴다.
 *
 * 상태 frame 은 모든 벌을 `orderJournal.watch` 에 건다 — 이벤트 시점에 **지금의 KB 주문 서버** 것일 때만 브라우저로 간다(29-22 ·
 * 다른 서버 끊김을 webapp 이 주 서버 「기록 지연」으로 오인하지 않게 — 29-03 규율 그대로, 원천만 현재 주문 서버로).
 */
function wirePipeline(p: ServerPipeline): void {
  p.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, { access: p.access, identities: appAccess }));
  p.strategyWriter.on("applied", (rows) => fanout.deliverStrategyEvents(rows, { access: p.access, identities: appAccess }));
  orderJournal.watch(p.status);
  // Phase 29-14 — 87 → 그 서버 매핑 즉시 교체(관찰자 재로그인 없이 새 계좌 푸시) + 반영 상태 DB. 새 벌은 새 `DmaClient` 라
  // 연결 세대가 1 부터 다시 센다 — 옛 벌의 세대 눈금으로 첫 87 을 버리지 않게 지우고 붙인다.
  adminSnapshotSink.resetGeneration(p.server.key);
  p.admin.on("snapshot", (e) => adminSnapshotSink.onSnapshot(p.server.key, e));
}

wsServer.on("upgrade", (req, socket, head) => fanout.handleUpgrade(req, socket, head));

/**
 * 내부 HTTP 표면 — **`/healthz` + 공유 비밀 관문 + Admin 내부 경로(Phase 29-11)** 다 (D-02 · D-07).
 *
 * REST 주문 라우트는 16-16 에서 제거했다. 주문 접수는 위 `WsFanout` 의 wss 분기 하나로
 * 나간다 — 여기에 주문 의존성을 다시 넘기면 지운 경로가 되살아난다.
 * `relayOrderSecret` 은 관문이 계속 쓰므로 required 그대로다 (CONTEXT deferred).
 */
/**
 * Admin 반영 경로 (Phase 29-11 · D-07) — Express 가 `/internal/admin/*` 로 부른다. 의도 RPC(`AdminIntentStore`) → 서버별
 * admin 연결(`pipelines.get(key).admin`) → 서버별 결과 배열. 비밀번호 암호화(AAD = dma_user_id · D-19)는 relay 안에서만.
 */
const adminStore = new AdminIntentStore({ supabase });
const adminDispatcher = new AdminDispatcher({
  store: adminStore,
  pipelines,
  registry,
  credKey: config.dmaCredKey,
  // 비밀번호 변경 dual-write 대상(그 DMA id 에 지금 연결된 웹 사용자) — D-19 롤백 대비.
  access: appAccess,
  // 열린 세션 반영(29-21) — op 2 ok 서버 → 그 서버 세션 unauthorized 종료 · 비밀번호 변경 → 열린 세션 비밀 교체(D-08).
  sessions: sessionManager,
});
const adminRouter = createAdminRouter({
  store: adminStore,
  dispatcher: adminDispatcher,
  // 서버 편집 · 역할 변경 직후 Express 가 즉시 재적재를 건다(D-04 · D-09 · D-17) — 60초 주기를 기다리지 않는다.
  registry,
  access: appAccess,
  // Admin 서버 카드 칩(conn · journal · admin) 원천 — 서버별 파이프라인.
  pipelines,
  credKey: config.dmaCredKey,
  // 시세 주 서버 칩 — 지금 quote 연결 대상(29-23 전환 창 동안은 새 서버 · 실패하면 옛 서버).
  quoteStatus: { serverKey: () => quoteSwitch.currentServerKey, health: (nowMs) => quoteStatus.health(nowMs) },
  // 시세 주 서버 즉시 전환(29-23 · D-11) — break-then-make · 실패 복귀 · 단일 비행.
  quoteSwitch,
});

const orderApi = createOrderApi({
  relayOrderSecret: config.relayOrderSecret,
  // `/healthz` 의 회선 판정 기준 — 이 주소와 같은 사내망 대역의 인터페이스가 있는지만 본다. 요청마다 KB 주문 서버 host.
  dmaHost: () => registry.orderServerOf("KB")?.host ?? "127.0.0.1",
  appVersion: config.appVersion,
  nodeEnv: config.nodeEnv,
  sessions: sessionManager,
  // `/healthz` 의 `journal` 필드 + 장중 알림 판정(Phase 19 D-04 (b)) — 지금의 KB 주문 서버 저널(503 축 · 29-22 한 원천).
  journal: orderJournal,
  // 그 밖 enabled 서버 — 본문 `journalGateways.<서버 키>` 에만 싣는다(503 판정 밖 · quick-260929-c8e). 요청마다 현재 목록.
  journalGateways: () => {
    const kb = kbOrderPipeline();
    return pipelines
      .all()
      .filter((p) => p !== kb)
      .map((p) => ({ gateway: p.server.key, health: (nowMs: number) => p.status.health(nowMs) }));
  },
  // 증권사별 주문 서버 저널 — 고정 이름 `brokers.{KB,KYOBO}`(uptime JSONPath 가 키 개명에 흔들리지 않게 · Pitfall 3).
  brokers: () =>
    DMA_BROKERS.flatMap((broker) => {
      const s = registry.orderServerOf(broker);
      const p = s !== undefined ? pipelines.get(s.key) : undefined;
      return s !== undefined && p !== undefined
        ? [{ broker, server: s.key, health: (nowMs: number) => p.status.health(nowMs) }]
        : [];
    }),
  // `/healthz` 의 `quote` 필드 + 503 판정(Phase 26 D-02 · D-16 — 장중 60초 · 거부 즉시). 폴백이 없어 503 축이다.
  quote: quoteStatus,
  // Phase 29-08 — 서버별 admin 연결(role 2) 상태 · users_rev. 본문 전용(503 판정 밖) · 요청마다 현재 enabled 서버 목록.
  adminConns: () => pipelines.all().map((p) => ({ serverKey: p.server.key, health: () => p.admin.health() })),
  // Phase 29-11 — Admin 내부 HTTP(관문 뒤 · 404 앞). Express 만 부른다(D-07).
  admin: { router: adminRouter },
});
const orderApiServer = http.createServer(orderApi);

// 접근 맵을 관찰자보다 먼저 읽기 시작한다(Phase 29 — fail closed 순서: 첫 적재 전 wss 인증은 조회 실패 · 푸시 신원 없음).
// 첫 적재 전 도착한 적용 행은 아무에게도 푸시되지 않는다 — 브라우저 REST 새로고침이 복원한다.
appAccess.start();
// 계좌별 주문 서버 지정도 같은 자리(29-33 — 관찰자보다 먼저 · 첫 적재 전 wss 인증은 조회 실패).
accountOrderServers.start();
// 관찰자 연결을 enabled 서버마다 부팅 즉시 연다(Phase 19 D-13 — 장 시간과 무관 · 사용자 접속과 무관 · Phase 29 레지스트리 순회).
// 결선(applied → fanout · frame → fanout)은 `onCreated` 가 start **전에** 붙인다 — 첫 배치가 버려지지 않는다.
pipelines.sync(registry.enabled());
orderJournal.refresh();
// 레지스트리 변경(60초 재적재 · reload) → 서버 추가 · 삭제 · 끄기 · 주소 변경을 재배포 없이 반영한다.
// G-1 (29-42) — 주문 서버가 바뀌어도 여기서 「주문 서버 바뀜」 표식을 보내지 않는다(D-10 배지 폐지). 영향 사용자 세션의 즉시
// 재수립은 29-36 몫이다.
registry.on("changed", (change) => {
  pipelines.sync(registry.enabled());
  // 29-23 (D-11) — DB 시세 주 서버가 다른 경로로 바뀌었으면 같은 break-then-make 로 맞춘다. 실패하면 DB 를 지금 연결 서버로
  // 되돌린다(직전 값 유지). 29-28 (WR-03) — 지금 quote 서버 키의 host · port 가 바뀐 것(`change.changed`)도 같은 키
  // break-then-make 로 새 주소를 따라간다(실패하면 옛 주소 · DB 되돌림 없음). 판정(키 · host · port 서명) · 단일 비행은
  // QuoteSwitch 가 쥔다 — 여기서는 역할 변경이거나 지금 quote 서버 키의 주소 변경일 때만 부른다.
  const quoteKey = quoteSwitch.currentServerKey;
  if (change.roles || (quoteKey !== null && change.changed.includes(quoteKey))) {
    void quoteSwitch
      .reconcileWithRegistry(registry, (key) => adminStore.setQuotePrimary(key))
      .catch((err: unknown) =>
        logger.error({ error: err instanceof Error ? err.message : String(err) }, "[QUOTE] 시세 주 서버 보정 예외"),
      );
  }
  // 29-22 — 저널 원천이 새 KB 주문 서버로 바뀌었으면 그 서버의 지금 상태를 브라우저에 1건(다음 healthz 는 요청마다 현재 값).
  orderJournal.refresh();
});
// 시세 전용 quote 연결도 같은 자리에서 연다(Phase 26 — 장 시간 · 사용자 접속과 무관). hub · fanout 결선이 다 붙은 뒤다.
quoteSwitch.start();

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
        env: config.nodeEnv,
        version: config.appVersion,
        // Phase 29 D-09 — 레지스트리 원천과 서버 목록. 키 · 주소 · 활성 · 관찰자 여부뿐이다(비밀 없음).
        registry: registry.source,
        servers: registry.all().map((r) => ({
          key: r.key,
          host: r.host,
          port: r.port,
          enabled: r.enabled,
          observer: !r.enabled ? "off" : pipelines.get(r.key)?.observerEnabled === true ? "enabled" : "disabled",
          // Phase 29-08 — 서버별 admin 연결(role 2) 여부(비밀 없음).
          admin: !r.enabled ? "off" : pipelines.get(r.key)?.admin.enabled === true ? "enabled" : "disabled",
        })),
        // 주 서버(부팅 때 KB 주문 서버) 관찰자 기록 연결 여부만 싣는다 — 비밀·계좌는 없다(T-19-03).
        journalObserver: primaryPipeline()?.observerEnabled === true ? "enabled" : "disabled",
        // 시세 전용 quote 연결 여부만 싣는다 — 비밀은 없다(Phase 26 D-17 · T-26-05). 대상 = 시세 주 서버 키.
        quoteFeed: quoteSecret !== undefined ? "enabled" : "disabled",
        ...(quoteServer !== undefined ? { quoteServer: quoteServer.key } : {}),
        // 주 서버 외 서버가 있을 때만 — 키 · 주소 · 활성 여부뿐이다(비밀 없음).
        ...(pipelines.all().some((p) => p.server.key !== primaryKey)
          ? {
              journalGateways: pipelines
                .all()
                .filter((p) => p.server.key !== primaryKey)
                .map((p) => ({
                  gateway: p.server.key,
                  host: p.server.host,
                  port: p.server.port,
                  observer: p.observerEnabled ? "enabled" : "disabled",
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
    // 4) 레지스트리 재적재 중지 · quote 연결 · 전 서버 관찰자 연결 종료 — 이후 새 시세 프레임 · 새 배치 · 새 서버가 들어오지 않는다
    //    (서버별 admin 연결도 `pipelines.stopAll()` 안에서 stop — 비행 중 admin 명령은 offline 으로 풀린다)
    registry.close();
    quoteSwitch.stop();
    pipelines.stopAll();
    // 5) 전 서버 기록기 drain(각 상한 2초 · 병렬 — 5초 데드맨 안) → 정리. 못 끝내도 커서가 RPC 안에서만
    //    전진하므로 다음 부팅이 재생한다. 서버마다 두 기록기(주문 · 전략)를 함께 drain 한다(pipelines.ts).
    const undrained = await pipelines.drainAll(JOURNAL_DRAIN_TIMEOUT_MS);
    pipelines.closeAll();
    adminSnapshotSink.close();
    quoteStatus.close();
    appAccess.close();
    accountOrderServers.close();
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
