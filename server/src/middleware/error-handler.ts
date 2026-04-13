import type { ErrorRequestHandler } from "express";
import { ApiError } from "../errors.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reqLog = (req as unknown as { log?: { warn: Function; error: Function } }).log;

  if (err instanceof ApiError) {
    reqLog?.warn(
      { err: { code: err.code, message: err.message }, code: err.code },
      "api error",
    );
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err?.message === "CORS_NOT_ALLOWED") {
    res.status(403).json({
      error: { code: "CORS_NOT_ALLOWED", message: "Origin not allowed" },
    });
    return;
  }

  reqLog?.error({ err }, "unhandled error");
  const isProd = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isProd ? "Internal server error" : err?.message ?? "unknown",
    },
  });
};
