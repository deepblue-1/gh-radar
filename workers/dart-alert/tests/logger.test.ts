import { Writable } from "node:stream";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import { createLogger, REDACT_PATHS } from "../src/logger";

/**
 * Phase 43-03 — 로그에 OpenDART 키 · 봇 토큰 · 방 id · 요청 URL · 쿼리 인자 · 헤더 · axios 설정 ·
 * 설정 객체의 비밀 필드가 실리지 않는다. 실제 createLogger 를 메모리 스트림에 연결해 출력 문자열을 검사한다.
 */
const KEY = "TEST-DART-KEY-DO-NOT-LOG";
const BOT = "123456:TEST-BOT-TOKEN-DO-NOT-LOG";
const CHAT = "-1009876543210";
const SRK = "svc-role-VALUE-DO-NOT-LOG";

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

describe("createLogger (43-03 비밀 가림)", () => {
  it("pino 인스턴스를 돌려준다", () => {
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(typeof log.child).toBe("function");
  });

  it("맨 위 crtfc_key · url · params · headers · chat_id · token 이 출력에 없다", () => {
    const { log, output } = capture();
    log.info(
      {
        crtfc_key: KEY,
        url: `https://api.telegram.org/bot${BOT}/sendMessage`,
        params: { crtfc_key: KEY, bgn_de: "20261116" },
        headers: { authorization: `Bearer ${SRK}` },
        chat_id: CHAT,
        token: BOT,
        watch: "tender_offer",
      },
      "dart call",
    );
    const s = output();
    expect(s).toContain("dart call");
    expect(s).toContain("tender_offer");
    for (const v of [KEY, BOT, CHAT, SRK, "TEST-BOT-TOKEN", "TEST-DART-KEY"]) expect(s).not.toContain(v);
    expect(s).toContain("[redacted]");
  });

  it("한 단계 아래(err.config · err.request · err.url · err.params · err.headers · body.chat_id)도 가린다", () => {
    const { log, output } = capture();
    log.error(
      {
        err: {
          config: { url: `/bot${BOT}/sendMessage`, params: { crtfc_key: KEY } },
          request: { path: `/api/list.json?crtfc_key=${KEY}` },
          url: `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}`,
          params: { crtfc_key: KEY },
          headers: { authorization: `Bearer ${SRK}` },
          status: 502,
        },
        body: { chat_id: CHAT, text: "hello" },
        auth: { botToken: BOT },
      },
      "dart fail",
    );
    const s = output();
    for (const v of [KEY, BOT, CHAT, SRK, "TEST-BOT-TOKEN", "TEST-DART-KEY"]) expect(s).not.toContain(v);
    expect(s).toContain('"status":502');
    expect(s).toContain("hello");
    expect(s).toContain("[redacted]");
  });

  // 리뷰 WR-55 — axios 가 실제로 던지는 오류는 response 안에 다시 config(URL · params.crtfc_key) · request(경로 /bot<토큰>/…)를
  // 품는다. pino 경로 `*.config` 는 한 단계만 맞아 err.response.config 를 못 가렸다(실측). 로거가 깊이와 상관없이 가린다.
  it("진짜 AxiosError(응답 포함)를 통째로 남겨도 키 · 토큰이 없다 — err.response.config · err.response.request 까지", () => {
    const { log, output } = capture();
    const config = {
      url: `/bot${BOT}/sendMessage`,
      baseURL: "https://api.telegram.org",
      params: { crtfc_key: KEY, bgn_de: "20261116" },
      headers: new AxiosHeaders({ Authorization: `Bearer ${SRK}` }),
      data: JSON.stringify({ chat_id: CHAT, text: "hello" }),
    } as unknown as InternalAxiosRequestConfig;
    const request = { path: `/bot${BOT}/sendMessage?crtfc_key=${KEY}`, method: "POST" };
    const err = new AxiosError("Request failed with status code 500", "ERR_BAD_RESPONSE", config, request, {
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      config,
      request,
      data: { ok: false, description: "boom" },
    });
    log.error({ err }, "raw axios");
    log.warn({ e: err, wrapped: new Error("outer", { cause: err }) }, "raw axios elsewhere");
    const s = output();
    for (const v of [KEY, BOT, CHAT, SRK, "TEST-BOT-TOKEN", "TEST-DART-KEY"]) expect(s).not.toContain(v);
    expect(s).toContain("Request failed with status code 500");
    expect(s).toContain('"status":500');
    expect(s).toContain("ERR_BAD_RESPONSE");
    expect(s).toContain("[redacted]");
    // 오류 꼴은 그대로 — pino 의 err 직렬화(type · message · stack)가 유지된다
    const first = JSON.parse(s.split("\n")[0]!);
    expect(first.err.type).toBe("AxiosError");
    expect(typeof first.err.stack).toBe("string");
  });

  it("세 단계 이상 아래의 비밀 이름 · 문자열 안의 토큰 경로 · crtfc_key 쿼리도 가린다(순환 참조는 안전)", () => {
    const { log, output } = capture();
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;
    log.info(
      {
        a: { b: { c: { d: { crtfc_key: KEY, url: `https://x/?crtfc_key=${KEY}`, keep: "ok-value" } } } },
        note: `GET https://api.telegram.org/bot${BOT}/getMe · https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&page_no=1`,
        bare: `token ${BOT} here`,
        loop,
        at: "2026-11-16T09:05:00.000Z",
      },
      "deep",
    );
    const s = output();
    for (const v of [KEY, BOT, "TEST-BOT-TOKEN", "TEST-DART-KEY"]) expect(s).not.toContain(v);
    expect(s).toContain("ok-value");
    expect(s).toContain("page_no=1");
    expect(s).toContain("2026-11-16T09:05:00.000Z");
    expect(s).toContain("[circular]");
  });

  it("설정 객체(cfg)를 통째로 써도 키 · 토큰 · 방 id · 서비스롤 키가 없다", () => {
    const { log, output } = capture();
    log.info(
      {
        cfg: {
          dartApiKey: KEY,
          telegramBotToken: BOT,
          telegramChatId: CHAT,
          supabaseServiceRoleKey: SRK,
          dailyBudget: 15000,
          mode: "auto",
        },
      },
      "boot",
    );
    const s = output();
    for (const v of [KEY, BOT, CHAT, SRK]) expect(s).not.toContain(v);
    expect(s).toContain('"dailyBudget":15000');
    expect(s).toContain('"mode":"auto"');
  });

  it("맨 위 설정 필드(dartApiKey · telegramBotToken · telegramChatId · supabaseServiceRoleKey)도 가린다", () => {
    const { log, output } = capture();
    log.info(
      { dartApiKey: KEY, telegramBotToken: BOT, telegramChatId: CHAT, supabaseServiceRoleKey: SRK, newChatIdTail: "3210" },
      "flat",
    );
    const s = output();
    for (const v of [KEY, BOT, CHAT, SRK]) expect(s).not.toContain(v);
    // 끝자리를 보여야 할 때는 다른 필드 이름을 쓴다 — 가려지지 않는다
    expect(s).toContain('"newChatIdTail":"3210"');
  });

  it("두 번째 OpenDART 키 필드(dartApiKey2)도 [redacted] — 261113-rn7", () => {
    const { log, output } = capture();
    const KEY2 = "SECOND-DART-KEY-DO-NOT-LOG";
    log.info({ dartApiKey2: KEY2, cfg: { dartApiKey2: KEY2 } }, "key2");
    const s = output();
    expect(s).not.toContain(KEY2);
    expect(s).toContain('"dartApiKey2":"[redacted]"');
  });

  it("REDACT_PATHS 가 비밀 이름 · 그릇 이름을 맨 위와 한 단계 아래로 덮는다", () => {
    for (const k of [
      "crtfc_key",
      "token",
      "botToken",
      "authorization",
      "url",
      "params",
      "chat_id",
      "dartApiKey",
      "dartApiKey2",
      "telegramBotToken",
      "telegramChatId",
      "supabaseServiceRoleKey",
      "headers",
      "config",
      "request",
    ]) {
      expect(REDACT_PATHS).toContain(k);
      expect(REDACT_PATHS).toContain(`*.${k}`);
    }
  });
});
