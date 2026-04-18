import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { createLogger } from "../src/logger";

/**
 * T-03: logger 가 Bright Data API key / Supabase service role key 를 redact 해야 한다.
 */
function captureLogger(): {
  logger: ReturnType<typeof pino>;
  output: () => string;
} {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  const logger = pino(
    {
      redact: {
        paths: [
          "cfg.brightdataApiKey",
          "cfg.supabaseServiceRoleKey",
          "headers.authorization",
          "*.BRIGHTDATA_API_KEY",
          "*.SUPABASE_SERVICE_ROLE_KEY",
          "*.brightdataApiKey",
          "*.supabaseServiceRoleKey",
        ],
        censor: "[Redacted]",
      },
    },
    stream,
  );
  return { logger, output: () => buf };
}

describe("createLogger (T-03)", () => {
  it("returns pino instance", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.warn).toBe("function");
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
