import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import { requestId } from "./middleware/request-id.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { httpLogger } from "./middleware/pino-http.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { corsOptions } from "./services/cors-config.js";
import { healthRouter } from "./routes/health.js";
import { scannerRouter } from "./routes/scanner.js";
import { stocksRouter } from "./routes/stocks.js";

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

  // 2) request-id (pino 바인딩 위해 가장 먼저)
  app.use(requestId());

  // 3) pino-http
  app.use(httpLogger());

  // 4) helmet (보안 헤더)
  app.use(helmet());

  // 5) CORS
  app.use(cors(corsOptions()));

  // 6) body parser (16kb)
  app.use(express.json({ limit: "16kb" }));

  // 7) rate-limit on /api
  app.use("/api", apiRateLimiter());

  // 8) 라우터 결선 (Wave 3)
  app.use("/api/health", healthRouter);
  app.use("/api/scanner", scannerRouter);
  app.use("/api/stocks", stocksRouter);

  // 9) 404 fallback
  app.use(notFoundHandler);

  // 10) error handler (마지막)
  app.use(errorHandler);

  return app;
}
