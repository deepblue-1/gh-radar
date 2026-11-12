import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import { telegramSafeFields } from "../src/safeError";
import {
  classifyTelegramResponse,
  createTelegramHttp,
  sendMessage,
  type SendResult,
} from "../src/telegram/client";

/**
 * Phase 43-04 — 텔레그램 sendMessage 응답 분류 전부(SC-5 · 리서치 확인 7 · Pitfall 4 · 6).
 *
 * - 분류는 `parameters` 먼저(retry_after → rate · migrate_to_chat_id → migrated), 그다음 error_code(없으면 HTTP 상태).
 * - sendMessage 는 어떤 경우에도 reject 하지 않고 분류 결과를 돌려준다.
 * - 봇 토큰 · 요청 URL 은 결과 · 로그 필드 어디에도 없다 — 요청 경로는 가짜 전송이 받은 설정으로만 확인한다.
 *
 * 픽스처는 Bot API 응답 꼴을 손으로 만든 것이다(실제 응답 표본 아님).
 */

const TOKEN = "123456:TEST-BOT-TOKEN-DO-NOT-LOG";
const CHAT = "-1009999999999";
const BASE = "https://telegram.example.test";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "fixtures/telegram", name), "utf8"));
}

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  return Promise.resolve({ data, status, statusText: String(status), headers: {}, config });
}

/** 가짜 전송 — 받은 경로 · 본문을 기록하고 respond 결과를 돌려준다 */
function fakeTelegram(respond: (config: InternalAxiosRequestConfig) => ReturnType<AxiosAdapter>) {
  const posts: { url: string | undefined; body: Record<string, unknown> }[] = [];
  const adapter: AxiosAdapter = (config) => {
    posts.push({ url: config.url, body: JSON.parse(String(config.data)) });
    return respond(config);
  };
  return { http: createTelegramHttp(BASE, adapter), posts };
}

const answer = (status: number, data: unknown) => fakeTelegram((config) => reply(config, status, data));

function noResponse(code: string) {
  return fakeTelegram((config) =>
    Promise.reject(new AxiosError(`${code} ${BASE}${config.url}`, code, config)),
  );
}

/** 결과에 토큰 · 요청 URL 이 없고 문구가 200자 이하 */
function expectClean(r: SendResult) {
  const s = JSON.stringify(r);
  expect(s).not.toContain("TEST-BOT-TOKEN-DO-NOT-LOG");
  expect(s).not.toContain("/bot");
  expect(s).not.toContain(BASE);
  if ("description" in r) expect(r.description.length).toBeLessThanOrEqual(200);
  const f = JSON.stringify(telegramSafeFields(r));
  expect(f).not.toContain("TEST-BOT-TOKEN-DO-NOT-LOG");
  expect(f).not.toContain("/bot");
}

async function send(http: ReturnType<typeof createTelegramHttp>, opts?: { plain?: boolean }) {
  const r = await sendMessage(http, TOKEN, CHAT, "에스텍(069510) 공개매수신고서", opts);
  expectClean(r);
  return r;
}

describe("sendMessage 응답 픽스처 분류 (SC-5 · 리서치 확인 7)", () => {
  it("ok.json → ok · message_id 101", async () => {
    const { http } = answer(200, fixture("ok.json"));
    expect(await send(http)).toEqual({ kind: "ok", messageId: 101 });
  });

  it("429.json → rate · 7초", async () => {
    const { http } = answer(429, fixture("429.json"));
    expect(await send(http)).toEqual({ kind: "rate", retryAfterS: 7 });
  });

  it("400-migrate.json → migrated · 새 방 id 문자열", async () => {
    const { http } = answer(400, fixture("400-migrate.json"));
    expect(await send(http)).toEqual({ kind: "migrated", to: "-1009876543210" });
  });

  it("401.json → token", async () => {
    const { http } = answer(401, fixture("401.json"));
    expect(await send(http)).toMatchObject({ kind: "token", code: 401, description: "Unauthorized" });
  });

  it("403.json(봇이 방에서 내보내짐) → chat", async () => {
    const { http } = answer(403, fixture("403.json"));
    expect(await send(http)).toMatchObject({ kind: "chat", code: 403 });
  });

  it("400-chat-not-found.json → chat", async () => {
    const { http } = answer(400, fixture("400-chat-not-found.json"));
    expect(await send(http)).toMatchObject({ kind: "chat", code: 400, description: "Bad Request: chat not found" });
  });

  it("400-parse.json(can't parse entities) → parse", async () => {
    const { http } = answer(400, fixture("400-parse.json"));
    expect(await send(http)).toMatchObject({ kind: "parse", code: 400 });
  });
});

describe("retry_after 바로잡기", () => {
  it.each([
    [0, 1],
    [-3, 1],
    ["abc", 1],
    [null, 1],
    [2.4, 3],
    [30, 30],
  ])("retry_after %s → %s초", (v, want) => {
    const r = classifyTelegramResponse(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: v } });
    expect(r).toEqual({ kind: "rate", retryAfterS: want });
  });

  it("parameters 가 error_code 보다 먼저 — 400 이어도 migrate_to_chat_id 면 migrated", () => {
    expect(
      classifyTelegramResponse(400, { ok: false, error_code: 400, description: "Bad Request: chat not found", parameters: { migrate_to_chat_id: "-100123" } }),
    ).toEqual({ kind: "migrated", to: "-100123" });
  });
});

describe("일시 장애 — 5xx · 응답 없음 · JSON 아닌 본문은 transient", () => {
  it("HTTP 502 HTML 본문 → transient", async () => {
    const { http } = answer(502, "<html><body>502 Bad Gateway</body></html>");
    expect(await send(http)).toMatchObject({ kind: "transient", code: 502 });
  });

  it("HTTP 500 JSON 본문 → transient", async () => {
    const { http } = answer(500, { ok: false, error_code: 500, description: "Internal Server Error" });
    expect(await send(http)).toMatchObject({ kind: "transient", code: 500 });
  });

  it.each([["ECONNREFUSED"], ["ECONNRESET"]])("응답 없음(%s · 네트워크) → transient · code 0", async (code) => {
    const { http } = noResponse(code);
    expect(await send(http)).toMatchObject({ kind: "transient", code: 0 });
  });

  it("타임아웃(ECONNABORTED) → transient", async () => {
    const { http } = noResponse("ECONNABORTED");
    expect(await send(http)).toMatchObject({ kind: "transient", code: 0 });
  });

  it("본문이 JSON 이 아님(200) → transient", async () => {
    const { http } = answer(200, "<!doctype html><title>proxy</title>");
    expect((await send(http)).kind).toBe("transient");
  });

  it("본문이 JSON 이 아님(400) → transient — 방 문제로 오판하지 않는다", async () => {
    const { http } = answer(400, "<html>bad request</html>");
    expect((await send(http)).kind).toBe("transient");
  });

  it("axios 가 아닌 오류를 던져도 reject 하지 않는다", async () => {
    const { http } = fakeTelegram(() => {
      throw new Error(`boom ${BASE}/bot${TOKEN}/sendMessage`);
    });
    expect(await send(http)).toMatchObject({ kind: "transient", code: 0 });
  });
});

describe("요청 본문 · 경로 (D-14)", () => {
  it("기본은 parse_mode HTML · 미리보기 끔 · 경로는 /bot<토큰>/sendMessage(설정으로만 확인)", async () => {
    const { http, posts } = answer(200, fixture("ok.json"));
    await send(http);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(`/bot${TOKEN}/sendMessage`);
    expect(posts[0].body).toEqual({
      chat_id: CHAT,
      text: "에스텍(069510) 공개매수신고서",
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  it("plain: true 면 parse_mode 가 없고 link_preview_options 는 그대로", async () => {
    const { http, posts } = answer(200, fixture("ok.json"));
    await send(http, { plain: true });
    expect(posts[0].body).not.toHaveProperty("parse_mode");
    expect(posts[0].body.link_preview_options).toEqual({ is_disabled: true });
  });
});

describe("토큰 비노출 (Pitfall 4)", () => {
  it("응답 문구가 토큰을 되풀이해도 결과에는 가려진다", async () => {
    const { http } = answer(401, { ok: false, error_code: 401, description: `Unauthorized: token ${TOKEN} is invalid` });
    const r = await send(http);
    expect(r).toMatchObject({ kind: "token" });
  });

  it("문구는 200자에서 자른다", async () => {
    const { http } = answer(400, { ok: false, error_code: 400, description: `Bad Request: chat not found ${"x".repeat(500)}` });
    const r = await send(http);
    expect(r.kind).toBe("chat");
    expect("description" in r && r.description.length).toBe(200);
  });
});

describe("telegramSafeFields — 분류 결과 → 로그 필드(kind · code · description)", () => {
  it("ok", () => {
    expect(telegramSafeFields({ kind: "ok", messageId: 101 })).toEqual({ kind: "ok", code: null, description: null });
  });

  it("rate 는 429 · 대기 초", () => {
    expect(telegramSafeFields({ kind: "rate", retryAfterS: 7 })).toEqual({ kind: "rate", code: 429, description: "retry after 7s" });
  });

  it("migrated 는 400 · 새 방 id 끝 4자리만", () => {
    const f = telegramSafeFields({ kind: "migrated", to: "-1009876543210" });
    expect(f).toEqual({ kind: "migrated", code: 400, description: "chat migrated to …3210" });
    expect(JSON.stringify(f)).not.toContain("9876543210");
  });

  it("token · chat · parse · transient 는 code · description 그대로", () => {
    expect(telegramSafeFields({ kind: "chat", code: 403, description: "Forbidden: bot was kicked from the supergroup chat" })).toEqual({
      kind: "chat",
      code: 403,
      description: "Forbidden: bot was kicked from the supergroup chat",
    });
  });
});
