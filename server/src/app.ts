import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestId } from "./middleware/request-id.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { httpLogger } from "./middleware/pino-http.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { corsOptions } from "./services/cors-config.js";
import { healthRouter } from "./routes/health.js";
import { scannerRouter } from "./routes/scanner.js";
import { stocksRouter } from "./routes/stocks.js";

export type AppDeps = { supabase: SupabaseClient };

export function createApp(deps: AppDeps): Express {
  const app = express();

  // 1) Cloud Run: 단일 proxy 신뢰 (RESEARCH Pitfall 1)
  app.set("trust proxy", 1);

  // deps 주입 (라우터가 req.app.locals.supabase 로 접근)
  app.locals.supabase = deps.supabase;

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
