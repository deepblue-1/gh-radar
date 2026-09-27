import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { buildLoggerOptions, logger, toCloudSeverity } from "../src/logger";

/**
 * T-10-01-01: 시크릿 redact · quick-260927-u9t: Cloud Logging severity + 숫자 level.
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
  const log = pino(buildLoggerOptions(level), stream);
  return {
    logger: log,
    output: () => buf,
    lines: () =>
      buf
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("theme-sync logger (T-10-01-01 · quick-260927-u9t)", () => {
  it("emits severity INFO + numeric level 30 + msg on info", () => {
    const { logger: log, lines } = captureLogger();
    log.info("source scraped");
    const [line] = lines();
    expect(line.severity).toBe("INFO");
    expect(line.level).toBe(30);
    expect(typeof line.level).toBe("number");
    expect(line.msg).toBe("source scraped");
  });

  it("maps every pino level to a Cloud Logging severity paired with numeric level", () => {
    const { logger: log, lines } = captureLogger("trace");
    log.trace("t");
    log.debug("d");
    log.warn("w");
    log.error("e");
    log.fatal("f");
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
    const { logger: log, lines } = captureLogger();
    log.child({ app: "theme-sync" }).error("source validation failed — skip this source");
    const [line] = lines();
    expect(line.severity).toBe("ERROR");
    expect(line.level).toBe(50);
    expect(line.app).toBe("theme-sync");
  });

  it("toCloudSeverity falls back to DEFAULT for unknown labels", () => {
    expect(toCloudSeverity("unknown")).toBe("DEFAULT");
  });

  it("redacts brightdata key, authorization header, service-role env and tokens", () => {
    const { logger: log, output } = captureLogger();
    log.info(
      {
        cfg: { brightdataApiKey: "BDKEY1" },
        headers: { authorization: "Bearer HDRTOK2" },
        env: { SUPABASE_SERVICE_ROLE_KEY: "SRK3" },
        resp: { token: "RESPTOK4" },
      },
      "boot",
    );
    const s = output();
    for (const secret of ["BDKEY1", "HDRTOK2", "SRK3", "RESPTOK4"]) {
      expect(s).not.toContain(secret);
    }
    expect(s).toContain("[REDACTED]");
  });

  it("exported logger singleton supports child (existing import compat)", () => {
    expect(typeof logger.child).toBe("function");
    expect(typeof logger.info).toBe("function");
  });
});
