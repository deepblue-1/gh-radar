import express, { type Express } from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import type { RelayAdminClient } from "./services/relay-admin-client.js";
import { requestId } from "./middleware/request-id.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { httpLogger } from "./middleware/pino-http.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { corsOptions } from "./services/cors-config.js";
import { healthRouter } from "./routes/health.js";
import { scannerRouter } from "./routes/scanner.js";
import { stocksRouter } from "./routes/stocks.js";
import { themesRouter } from "./routes/themes.js";
import { homeRouter } from "./routes/home.js";
import { chatRouter } from "./routes/chat.js";
import { ordersRouter } from "./routes/orders.js";
import { strategyEventsRouter } from "./routes/strategy-events.js";
import { limitupRouter } from "./routes/limitup-report.js";
import { adminRouter } from "./routes/admin.js";
import { adminServersRouter } from "./routes/admin-servers.js";

/**
 * server 측 키움 runtime 페어 (Phase 09.1 D-17/D-18).
 * services/kiwoom-runtime.ts 의 KiwoomRuntime 와 동일 shape — 순환 import 회피용 inline 재선언.
 */
export type KiwoomRuntime = {
  client: AxiosInstance;
  getToken: () => Promise<string>;
};

export type AppDeps = {
  supabase: SupabaseClient;
  // Phase 09.1: kisClient → kiwoomRuntime 으로 교체 (D-17 — server 도 키움 동기 호출).
  // 옵션 — 테스트 시 미주입 가능, 미주입 시 cached fallback 모드.
  kiwoomRuntime?: KiwoomRuntime;
  naverClient?: AxiosInstance; // 옵션 — ENV 미설정 시 undefined 로 시작, POST /refresh 만 503
  // Phase 08 — Bright Data Web Unlocker client (on-demand discussion refresh).
  // 미주입 시 POST /api/stocks/:code/discussions/refresh 만 503 PROXY_UNAVAILABLE.
  brightdataClient?: AxiosInstance;
  brightdataApiKey?: string;
  brightdataZone?: string;
  // Phase 16 Plan 16 — 주문용 relay 내부 HTTP 클라이언트는 제거됐다 (D-02). 주문 접수는 relay wss 전용.
  // Phase 29 D-07 — Admin 명령 전용 relay 클라이언트. 미주입(env 미설정 · 테스트) 시 허용/역할 쓰기는
  // `relayNotified: false` 로 성공하고, relay 의존 라우트(29-13)는 503 RELAY_UNAVAILABLE.
  relayAdmin?: RelayAdminClient;
};

export function createApp(deps: AppDeps): Express {
  const app = express();

  // 1) Cloud Run: 단일 proxy 신뢰 (RESEARCH Pitfall 1)
  app.set("trust proxy", 1);

  // deps 주입 (라우터가 req.app.locals 로 접근)
  app.locals.supabase = deps.supabase;
  app.locals.kiwoomRuntime = deps.kiwoomRuntime;
  app.locals.naverClient = deps.naverClient;
  app.locals.brightdataClient = deps.brightdataClient;
  app.locals.brightdataApiKey = deps.brightdataApiKey;
  app.locals.brightdataZone = deps.brightdataZone;
  app.locals.relayAdmin = deps.relayAdmin;

  // 2) request-id (pino 바인딩 위해 가장 먼저)
  app.use(requestId());

  // 3) pino-http
  app.use(httpLogger());

  // 4) helmet (보안 헤더)
  app.use(helmet());

  // 5) CORS
  app.use(cors(corsOptions()));

  // 6) 응답 압축 — /api/home(≈190KB)·/api/themes(≈160KB) JSON 이 무압축으로 나가던 것.
  //    SSE(/api/chat)는 제외한다: compressible 이 text/event-stream 을 압축 대상으로 보므로
  //    기본 필터를 쓰면 gzip 버퍼에 이벤트가 묶여 스트리밍·keepalive 가 끊긴다.
  app.use(
    compression({
      filter: (req, res) =>
        !String(res.getHeader("Content-Type") ?? "").startsWith("text/event-stream") &&
        compression.filter(req, res),
    }),
  );

  // 7) body parser (16kb)
  app.use(express.json({ limit: "16kb" }));

  // 7) rate-limit on /api
  app.use("/api", apiRateLimiter());

  // 8) 라우터 결선 (Wave 3)
  app.use("/api/health", healthRouter);
  app.use("/api/scanner", scannerRouter);
  app.use("/api/stocks", stocksRouter);
  app.use("/api/themes", themesRouter);
  app.use("/api/home", homeRouter);
  app.use("/api/chat", chatRouter);
  // Phase 16 Plan 16 — DMA 주문 **조회 전용** (D-02). 접수는 relay wss 가 받는다.
  app.use("/api/orders", ordersRouter);
  // Phase 25 D-07 — 하루치 주문로그(상따 전략 이벤트) 조회 전용. 적재는 relay 관찰자 기록기가 한다.
  app.use("/api/strategy-events", strategyEventsRouter);
  // Phase 28 D-10 — 상한가 보고서 조회 전용(DMA 매핑 사용자 · 격자는 인증 뒤 서명 URL). 적재는 workers/limitup-sync.
  app.use("/api/limitup", limitupRouter);
  // Phase 29 D-07 — 웹 Admin(requireAuth → requireAdmin). 쓰기는 Express 가 DB 에 · 즉시 반영은 relay HTTP 로.
  // 서버 레지스트리(D-17)를 먼저 — 그 라우터는 관문을 `/servers` 경로에만 건다. adminRouter 는 라우터 전체에 관문을
  // 걸므로 순서가 반대면 /servers 요청이 역할 조회를 두 번 한다(Cloud Run → Supabase 왕복 +1).
  app.use("/api/admin", adminServersRouter);
  app.use("/api/admin", adminRouter);

  // 9) 404 fallback
  app.use(notFoundHandler);

  // 10) error handler (마지막)
  app.use(errorHandler);

  return app;
}
