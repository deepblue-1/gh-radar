import { pinoHttp } from "pino-http";
import type { RequestHandler } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "../logger.js";

export function httpLogger(): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req: IncomingMessage) =>
      (req as IncomingMessage & { id?: string }).id ?? "",
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      if (res.statusCode >= 300) return "info";
      return "debug";
    },
    customProps: (req: IncomingMessage, res: ServerResponse) => ({
      request_id: (req as IncomingMessage & { id?: string }).id,
      route:
        (req as IncomingMessage & { route?: { path?: string }; url?: string })
          .route?.path ??
        (req as IncomingMessage & { url?: string }).url,
      latency_ms: (res as ServerResponse & { responseTime?: number })
        .responseTime,
    }),
  }) as unknown as RequestHandler;
}
