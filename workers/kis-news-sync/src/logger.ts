// RED 스텁 — 41-06 Task 2 GREEN 에서 가림을 건다.
import pino, { type DestinationStream } from "pino";

export const REDACT_PATHS: string[] = [];

export function createLogger(level = "info", destination?: DestinationStream) {
  return destination ? pino({ level }, destination) : pino({ level });
}
