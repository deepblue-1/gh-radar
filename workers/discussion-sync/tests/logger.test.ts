import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { buildLoggerOptions, createLogger, toCloudSeverity } from "../src/logger";

/**
 * T-03: logger 가 Bright Data API key / Supabase service role key 를 redact 해야 한다.
 * quick-260927-u9t: 각 줄에 Cloud Logging severity 문자열 + 숫자 level 이 함께 있어야 한다.
 * 복제한 옵션이 아니라 실제 buildLoggerOptions 로 만든 logger 를 검증한다.
 */
function captureLogger(level = "trace"): {
  logger: pino.Logger;
  output: () => string;
  lines: () => Array<Record<string, unknown>>;
} {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  const logger = pino(buildLoggerOptions(level), stream);
  return {
    logger,
    output: () => buf,
    lines: () =>
      buf
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("createLogger (T-03 · quick-260927-u9t)", () => {
  it("returns pino instance", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.warn).toBe("function");
  });

  it("emits severity INFO + numeric level 30 + msg on info", () => {
    const { logger, lines } = captureLogger();
    logger.info("cycle complete");
    const [line] = lines();
    expect(line.severity).toBe("INFO");
    expect(line.level).toBe(30);
    expect(typeof line.level).toBe("number");
    expect(line.msg).toBe("cycle complete");
  });

  it("maps every pino level to a Cloud Logging severity paired with numeric level", () => {
    const { logger, lines } = captureLogger("trace");
    logger.trace("t");
    logger.debug("d");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");
    const got = lines().map((l) => [l.msg, l.severity, l.level]);
    expect(got).toEqual([
      ["t", "DEBUG", 10],
      ["d", "DEBUG", 20],
      ["w", "WARNING", 40],
      ["e", "ERROR", 50],
      ["f", "CRITICAL", 60],
    ]);
  });

  it("child logger keeps severity/level and bindings", () => {
    const { logger, lines } = captureLogger();
    logger.child({ app: "discussion-sync" }).error("proxy abort signal — stopAll");
    const [line] = lines();
    expect(line.severity).toBe("ERROR");
    expect(line.level).toBe(50);
    expect(line.app).toBe("discussion-sync");
  });

  it("toCloudSeverity falls back to DEFAULT for unknown labels", () => {
    expect(toCloudSeverity("unknown")).toBe("DEFAULT");
  });

  it("redacts cfg.brightdataApiKey", () => {
    const { logger, output } = captureLogger();
    logger.info({ cfg: { brightdataApiKey: "PKEY123" } }, "boot");
    const s = output();
    expect(s).not.toContain("PKEY123");
    expect(s).toContain("[Redacted]");
  });

  it("redacts cfg.supabaseServiceRoleKey", () => {
    const { logger, output } = captureLogger();
    logger.info({ cfg: { supabaseServiceRoleKey: "SRK999" } }, "boot");
    const s = output();
    expect(s).not.toContain("SRK999");
    expect(s).toContain("[Redacted]");
  });

  it("redacts cfg.anthropicApiKey", () => {
    const { logger, output } = captureLogger();
    logger.info({ cfg: { anthropicApiKey: "ANTKEY42" } }, "boot");
    const s = output();
    expect(s).not.toContain("ANTKEY42");
    expect(s).toContain("[Redacted]");
  });

  it("redacts nested env BRIGHTDATA_API_KEY", () => {
    const { logger, output } = captureLogger();
    logger.info({ env: { BRIGHTDATA_API_KEY: "ENVKEY" } }, "env");
    const s = output();
    expect(s).not.toContain("ENVKEY");
  });

  it("redacts Authorization header (pino paths use lowercase)", () => {
    const { logger, output } = captureLogger();
    logger.info({ headers: { authorization: "Bearer TOKEN123" } }, "request");
    const s = output();
    expect(s).not.toContain("TOKEN123");
    expect(s).toContain("[Redacted]");
  });
});
