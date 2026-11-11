import { describe, expect, it } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  KisApiError,
  classifyKisError,
  safeErrorFields,
  KIS_NEWS_TITLE_PATH,
  KIS_NEWS_TITLE_TR_ID,
  KIS_TOKEN_PATH,
} from "../src/kis/client";

/**
 * Phase 41-13 — 한투 오류 분류(msg_cd) · 안전 로그 필드(SC-5).
 * 상태값이 아니라 msg_cd 로 가르고(41-RESEARCH 오류 코드 표), 로그에는 상태 · msg_cd · msg1 · 종류만 남긴다.
 */

const SECRET = "APPSECRET-DO-NOT-LOG-123";
const TOKEN = "ACCESS-TOKEN-DO-NOT-LOG-456";
const APPKEY = "APPKEY-DO-NOT-LOG-789";

function axiosErrorWith(response?: { status: number; data: unknown }): AxiosError {
  const config = {
    url: KIS_NEWS_TITLE_PATH,
    headers: new AxiosHeaders({
      authorization: `Bearer ${TOKEN}`,
      appkey: APPKEY,
      appsecret: SECRET,
      tr_id: KIS_NEWS_TITLE_TR_ID,
    }),
    data: JSON.stringify({ appkey: APPKEY, appsecret: SECRET }),
  } as never;
  const res = response
    ? ({ ...response, statusText: "", headers: {}, config } as never)
    : undefined;
  return new AxiosError(
    response ? `Request failed with status code ${response.status}` : "timeout of 10000ms exceeded",
    response ? "ERR_BAD_RESPONSE" : "ECONNABORTED",
    config,
    {},
    res,
  );
}

describe("상수", () => {
  it("news-title 경로 · tr_id · 토큰 경로", () => {
    expect(KIS_NEWS_TITLE_PATH).toBe("/uapi/domestic-stock/v1/quotations/news-title");
    expect(KIS_NEWS_TITLE_TR_ID).toBe("FHKST01011800");
    expect(KIS_TOKEN_PATH).toBe("/oauth2/tokenP");
  });
});

describe("classifyKisError — msg_cd 로 가른다", () => {
  it("EGW00201 (초당 거래건수 초과) → rate_limit", () => {
    expect(classifyKisError(200, "EGW00201")).toBe("rate_limit");
  });

  it.each(["EGW00121", "EGW00123"])("%s (토큰 무효 · 만료) → token_invalid", (cd) => {
    expect(classifyKisError(200, cd)).toBe("token_invalid");
  });

  it("EGW00133 (토큰 발급 과다 · 1분 1회) → token_rate", () => {
    expect(classifyKisError(403, "EGW00133")).toBe("token_rate");
  });

  it.each([500, 502, 503, 0])("상태 %i · msg_cd 없음 → transient", (status) => {
    expect(classifyKisError(status, null)).toBe("transient");
  });

  it("상태 200 · 모르는 코드(OPSQ0001) → unknown", () => {
    expect(classifyKisError(200, "OPSQ0001")).toBe("unknown");
  });

  it("아는 msg_cd 는 상태값보다 먼저 본다(500 + EGW00201 → rate_limit)", () => {
    expect(classifyKisError(500, "EGW00201")).toBe("rate_limit");
  });

  it("msg_cd 없는 429 → rate_limit", () => {
    expect(classifyKisError(429, undefined)).toBe("rate_limit");
  });
});

describe("KisApiError", () => {
  it("상태 · msg_cd · msg1 · 종류를 들고, message 는 코드만 담는다", () => {
    const e = new KisApiError(200, "EGW00201", "초당 거래건수를 초과하였습니다.");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("KisApiError");
    expect(e.status).toBe(200);
    expect(e.msgCd).toBe("EGW00201");
    expect(e.msg1).toBe("초당 거래건수를 초과하였습니다.");
    expect(e.kind).toBe("rate_limit");
    expect(e.message).toContain("EGW00201");
  });
});

describe("safeErrorFields — 안전 필드만", () => {
  it("KisApiError → { status, msgCd, msg1, kind } 넷만", () => {
    const f = safeErrorFields(new KisApiError(200, "EGW00123", "기간이 만료된 token 입니다."));
    expect(f).toEqual({
      status: 200,
      msgCd: "EGW00123",
      msg1: "기간이 만료된 token 입니다.",
      kind: "token_invalid",
    });
  });

  it("axios 응답 오류 → 본문 msg_cd 로 분류하고, 요청 헤더 · 본문의 토큰 · 앱키 · 시크릿은 결과에 없다", () => {
    const err = axiosErrorWith({
      status: 500,
      data: { rt_cd: "1", msg_cd: "EGW00201", msg1: "초당 거래건수를 초과하였습니다." },
    });
    const f = safeErrorFields(err);
    expect(Object.keys(f).sort()).toEqual(["kind", "msg1", "msgCd", "status"]);
    expect(f).toMatchObject({ status: 500, msgCd: "EGW00201", kind: "rate_limit" });
    const json = JSON.stringify(f);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain(APPKEY);
  });

  it("axios 네트워크 오류(응답 없음) → status 0 · transient · 헤더 값 없음", () => {
    const f = safeErrorFields(axiosErrorWith());
    expect(f.status).toBe(0);
    expect(f.kind).toBe("transient");
    expect(f.msgCd).toBeNull();
    const json = JSON.stringify(f);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain(TOKEN);
  });

  it("그 밖(Error · 문자열 · undefined)도 같은 네 필드만", () => {
    for (const e of [new Error("boom"), "boom", undefined]) {
      const f = safeErrorFields(e);
      expect(Object.keys(f).sort()).toEqual(["kind", "msg1", "msgCd", "status"]);
      expect(f.kind).toBe("unknown");
      expect(f.msgCd).toBeNull();
    }
  });
});
