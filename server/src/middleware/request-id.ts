import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const VALID = /^[A-Za-z0-9_-]{1,128}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const id = incoming && VALID.test(incoming) ? incoming : randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
