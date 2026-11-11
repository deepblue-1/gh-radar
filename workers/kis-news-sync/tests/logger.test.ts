import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger, REDACT_PATHS } from "../src/logger";

/**
 * SC-5 — 로그에 앱키 · 시크릿 · 토큰 · 요청 헤더 · axios 설정이 실리지 않는다.
 * 실제 createLogger 를 메모리 스트림에 연결해 직렬화된 출력 문자열을 검사한다.
 */
function capture(): { log: ReturnType<typeof createLogger>; output: () => string } {
  let buf = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { log: createLogger("info", stream), output: () => buf };
}

describe("createLogger (41-06 비밀 가림)", () => {
  it("pino 인스턴스를 돌려준다", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(typeof log.child).toBe("function");
  });

  it("appsecret · access_token · headers.authorization · config.headers.appkey 가 출력에 없다", () => {
    const { log, output } = capture();
    log.info(
      {
        appsecret: "SECRET-AAA",
        access_token: "TOKEN-BBB",
        headers: { authorization: "Bearer TOKEN-CCC" },
        config: { headers: { appkey: "APPKEY-DDD" } },
      },
      "kis call",
    );
    const s = output();
    expect(s).toContain("kis call");
    for (const v of ["SECRET-AAA", "TOKEN-BBB", "TOKEN-CCC", "APPKEY-DDD"]) {
      expect(s).not.toContain(v);
    }
    expect(s).toContain("[redacted]");
  });

  it("한 단계 아래(err.config · err.headers · body.appkey · auth.token)도 가린다", () => {
    const { log, output } = capture();
    log.error(
      {
        err: {
          config: { headers: { appsecret: "SECRET-EEE" } },
          headers: { authorization: "Bearer TOKEN-FFF" },
        },
        body: { appkey: "APPKEY-GGG", grant_type: "client_credentials" },
        auth: { token: "TOKEN-HHH" },
      },
      "kis fail",
    );
    const s = output();
    for (const v of ["SECRET-EEE", "TOKEN-FFF", "APPKEY-GGG", "TOKEN-HHH"]) {
      expect(s).not.toContain(v);
    }
    expect(s).toContain("client_credentials");
  });

  it("설정 객체(cfg)를 통째로 써도 앱키 · 시크릿 · 서비스롤 키가 없다", () => {
    const { log, output } = capture();
    log.info(
      {
        cfg: {
          kisAppKey: "APPKEY-III",
          kisAppSecret: "SECRET-JJJ",
          supabaseServiceRoleKey: "SRK-KKK",
          maxRps: 5,
        },
      },
      "boot",
    );
    const s = output();
    for (const v of ["APPKEY-III", "SECRET-JJJ", "SRK-KKK"]) {
      expect(s).not.toContain(v);
    }
    expect(s).toContain('"maxRps":5');
  });

  it("REDACT_PATHS 가 다섯 비밀 이름과 headers · config 를 덮는다", () => {
    for (const p of [
      "appkey",
      "*.appkey",
      "appsecret",
      "*.appsecret",
      "access_token",
      "*.access_token",
      "authorization",
      "*.authorization",
      "token",
      "*.token",
      "headers",
      "*.headers",
      "config",
      "*.config",
    ]) {
      expect(REDACT_PATHS).toContain(p);
    }
  });
});
