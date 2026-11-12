import axios, { isAxiosError, type AxiosAdapter, type AxiosInstance } from "axios";

/**
 * Phase 43-01 — 텔레그램 Bot API `sendMessage` 클라이언트 · 응답 분류.
 *
 * - D-14: 본문은 `chat_id` · `text` · `parse_mode: HTML` · `link_preview_options.is_disabled: true` 넷뿐이다.
 *   무음 인자(`disable_notification`)가 없어 전부 소리 나는 일반 알림이다. 방 id 는 주입받는 설정값 하나.
 * - 봇 토큰은 요청 경로(`/bot{token}/sendMessage`)에 박힌다 — 결과 · 오류 어디에도 URL · 토큰을 싣지 않는다.
 *   네트워크 오류(응답 없음)도 throw 하지 않고 `transient` 로 돌려준다(axios 오류 객체가 URL 을 품는다).
 * - 분류는 `parameters` 먼저(문서가 error_code 내용은 바뀔 수 있다고 경고), 그다음 error_code.
 *   분류 표 전부(방 이동 재송신 · 평문 재시도 등)는 43-04 · 43-06 이 채운다.
 */

export type SendResult =
  | { kind: "ok"; messageId: number | null }
  | { kind: "migrated"; to: string }
  | { kind: "rate"; retryAfterS: number }
  | { kind: "token" | "chat" | "parse" | "transient"; code: number; description: string };

/** timeout 10초 — 43-02 송신 기한 90초의 근거 값. `adapter` 는 테스트용(가짜 전송) */
export function createTelegramHttp(baseUrl: string, adapter?: AxiosAdapter): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
    headers: { "content-type": "application/json" },
    ...(adapter ? { adapter } : {}),
  });
}

const DESC_MAX = 200;

interface TelegramBody {
  ok?: unknown;
  result?: { message_id?: unknown };
  error_code?: unknown;
  description?: unknown;
  parameters?: { retry_after?: unknown; migrate_to_chat_id?: unknown };
}

export function classifyTelegramResponse(httpStatus: number, body: unknown): SendResult {
  const b = (body && typeof body === "object" ? body : {}) as TelegramBody;
  if (b.ok === true) {
    const id = b.result?.message_id;
    return { kind: "ok", messageId: typeof id === "number" ? id : null };
  }
  const migrate = b.parameters?.migrate_to_chat_id;
  if (typeof migrate === "number" || (typeof migrate === "string" && migrate !== "")) {
    return { kind: "migrated", to: String(migrate) };
  }
  const retry = b.parameters?.retry_after;
  if (typeof retry === "number" && retry > 0) return { kind: "rate", retryAfterS: retry };

  const code = typeof b.error_code === "number" ? b.error_code : httpStatus;
  const description = (typeof b.description === "string" ? b.description : "").slice(0, DESC_MAX);
  const parse = code === 400 && /can't parse entities/i.test(description);
  const kind = parse ? "parse" : code === 401 ? "token" : code === 403 || code === 400 ? "chat" : "transient";
  return { kind, code, description };
}

/** 방 하나에 글 하나. plain 이면 parse_mode 를 뺀다(이스케이프 버그 대비 평문 재시도 — 43-06) */
export async function sendMessage(
  http: AxiosInstance,
  token: string,
  chatId: string,
  text: string,
  opts?: { plain?: boolean },
): Promise<SendResult> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (!opts?.plain) body.parse_mode = "HTML";
  body.link_preview_options = { is_disabled: true };

  try {
    const res = await http.post(`/bot${token}/sendMessage`, body, { validateStatus: () => true });
    const r = classifyTelegramResponse(res.status, res.data);
    // 방어: 응답 문구가 토큰을 되풀이해도 밖으로 내보내지 않는다
    if ("description" in r && token && r.description.includes(token)) {
      return { ...r, description: r.description.split(token).join("***") };
    }
    return r;
  } catch (err) {
    // 응답 없음(네트워크 · 타임아웃) — axios 오류는 URL(토큰 포함)을 품으므로 코드 이름만 남긴다
    const code = isAxiosError(err) && typeof err.code === "string" ? err.code : "network error";
    return { kind: "transient", code: 0, description: code.slice(0, DESC_MAX) };
  }
}
