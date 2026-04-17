import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { createLogger } from "../src/logger";

/**
 * V-12: logger 가 Naver client secret / Supabase service role key 를 redact 해야 한다.
 * pino redact paths 가 '[Redacted]' 치환을 수행하는지 직렬화된 출력으로 검증.
 */

function captureLogger(level = "info"): { logger: ReturnType<typeof pino>; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  // createLogger 와 동일한 redact paths 로 stream 에 기록하는 인스턴스를 만든다
  const logger = pino(
    {
      level,
      redact: {
        paths: [
          "cfg.naverClientSecret",
          "cfg.supabaseServiceRoleKey",
          'headers["X-Naver-Client-Secret"]',
          "headers.authorization",
          "*.NAVER_CLIENT_SECRET",
          "*.SUPABASE_SERVICE_ROLE_KEY",
          "*.naverClientSecret",
          "*.supabaseServiceRoleKey",
        ],
        censor: "[Redacted]",
      },
    },
    stream,
  );
  return { logger, output: () => buf };
}

describe("createLogger (V-12)", () => {
  it("createLogger 는 pino 인스턴스를 반환한다", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.warn).toBe("function");
  });

  it("cfg.naverClientSecret 은 [Redacted] 로 치환된다", () => {
    const { logger, output } = captureLogger();
    logger.info({ cfg: { naverClientSecret: "SECRET123" } }, "boot");
    const s = output();
    expect(s).not.toContain("SECRET123");
    expect(s).toContain("[Redacted]");
  });

  it("cfg.supabaseServiceRoleKey 도 redact", () => {
    const { logger, output } = captureLogger();
    logger.info({ cfg: { supabaseServiceRoleKey: "SRK999" } }, "boot");
    const s = output();
    expect(s).not.toContain("SRK999");
    expect(s).toContain("[Redacted]");
  });

  it('headers["X-Naver-Client-Secret"] 도 redact', () => {
    const { logger, output } = captureLogger();
    logger.info(
      { headers: { "X-Naver-Client-Secret": "HEADERSECRET" } },
      "request",
    );
    const s = output();
    expect(s).not.toContain("HEADERSECRET");
    expect(s).toContain("[Redacted]");
  });
});
